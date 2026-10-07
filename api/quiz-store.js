import { get, list, put } from '@vercel/blob';

export const QUESTIONS = {
  q1: 'Is your credit score over 670?',
  q2: 'Is your current mortgage balance over $150k?',
  q3: 'Do you have over $8k in credit card debt?'
};

const PAGES = new Set(['glo2', 'glo2b', 'glo3b', 'glo4b', 'glo5', 'glott', 'glott2', 'tobe', 'abc', 'black', 'gov1', 'fequiz', 'ch3', 'ctc']);
const DEBT_PAGES = new Set(['glo2', 'glo2b', 'glo3b', 'glo4b', 'glo5', 'black', 'gov1', 'fequiz', 'ch3', 'ctc']);
const ANSWERS = new Set(['yes', 'no']);
const SESSION = /^[a-zA-Z0-9-]{16,80}$/;

function readFlag(value) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

export function parseEvent(body) {
  if (!body || typeof body !== 'object') return null;
  const page = body.page;
  const session = body.session;
  const q1 = body.q1 == null || body.q1 === '' ? null : body.q1;
  const q2 = body.q2 == null || body.q2 === '' ? null : body.q2;
  const q3 = body.q3 == null || body.q3 === '' ? null : body.q3;
  if (!PAGES.has(page) || !SESSION.test(String(session || ''))) return null;
  if (q1 != null && !ANSWERS.has(q1)) return null;
  if (q2 != null && !ANSWERS.has(q2)) return null;
  if (q3 != null && !ANSWERS.has(q3)) return null;
  if (q2 && !q1) return null;
  if (q3 && !q1) return null;
  return {
    page,
    session: String(session),
    q1,
    q2,
    q3,
    qualifyReached: readFlag(body.qualifyReached),
    disqualifyReached: readFlag(body.disqualifyReached),
    qualifyClick: readFlag(body.qualifyClick),
    disqualifyClick: readFlag(body.disqualifyClick),
    debtReached: readFlag(body.debtReached),
    sleepReached: readFlag(body.sleepReached),
    debtClick: readFlag(body.debtClick),
    sleepClick: readFlag(body.sleepClick)
  };
}

export function resultFor(page, q1, q2, q3) {
  if (q1 === 'yes' && q2 === 'yes') return 'qualified';
  if (DEBT_PAGES.has(page)) {
    if (q3 === 'yes') return 'debt';
    if (q3 === 'no') return 'sleep';
    return null;
  }
  if (q1 && q2) return 'disqualified';
  return null;
}

function keepAnswer(incoming, previous) {
  if (incoming === 'yes' || incoming === 'no') return incoming;
  if (previous === 'yes' || previous === 'no') return previous;
  return null;
}

function mergeReached(existing, key, incoming) {
  const prev = existing ? existing[key] : undefined;
  if (prev === true || incoming === true) return true;
  if (prev === false) return false;
  if (!existing) return false;
  return null;
}

export async function readEvent(pathname) {
  const result = await get(pathname, { access: 'public', useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const reader = result.stream.getReader();
  const chunks = [];
  while (true) {
    const step = await reader.read();
    if (step.done) break;
    chunks.push(Buffer.from(step.value));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function buildRecord(existing, event, now) {
  const q1 = keepAnswer(event.q1, existing && existing.q1);
  const q2 = keepAnswer(event.q2, existing && existing.q2);
  const q3 = keepAnswer(event.q3, existing && existing.q3);
  const page = existing && existing.page ? existing.page : event.page;
  const record = {
    session: event.session,
    page,
    q1,
    q2,
    q3,
    result: resultFor(page, q1, q2, q3),
    qualifyClick: Boolean((existing && existing.qualifyClick) || event.qualifyClick),
    disqualifyClick: Boolean((existing && existing.disqualifyClick) || event.disqualifyClick),
    debtClick: Boolean((existing && existing.debtClick) || event.debtClick),
    sleepClick: Boolean((existing && existing.sleepClick) || event.sleepClick),
    startedAt: existing && existing.startedAt ? existing.startedAt : now,
    updatedAt: now
  };
  ['qualifyReached', 'disqualifyReached', 'debtReached', 'sleepReached'].forEach((key) => {
    const reached = mergeReached(existing, key, event[key]);
    if (reached !== null) record[key] = reached;
  });
  return record;
}

const DAY_PREFIX = 'quiz-days/';
const READY_PATH = DAY_PREFIX + '_ready.json';
const ZONE = 'America/New_York';
const DAY_SPAN = 16;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function etDay(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return etDay(new Date().toISOString());
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function shiftDay(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function recentDayKeys() {
  const today = etDay(new Date().toISOString());
  return Array.from({ length: DAY_SPAN }, (_, i) => shiftDay(today, -i));
}

function dayPath(key) {
  return DAY_PREFIX + key + '.json';
}

const blobPut = (pathname, body) => put(pathname, body, {
  access: 'public',
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: 'application/json',
  cacheControlMaxAge: 0
});

async function readSafe(pathname) {
  try {
    return await readEvent(pathname);
  } catch (err) {
    return null;
  }
}

async function writeDay(doc) {
  await blobPut(dayPath(doc.date), JSON.stringify(doc));
}

async function mergeDay(key, mutate) {
  const pathname = dayPath(key);
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await readSafe(pathname);
    const doc = current && current.bySession ? current : { date: key, bySession: {} };
    const stamp = mutate(doc);
    if (!stamp) return;
    doc.updatedAt = new Date().toISOString();
    await writeDay(doc);
    const check = await readSafe(pathname);
    if (stamp(check)) return;
    await wait(40 * (attempt + 1));
  }
}

export async function indexRecords(records) {
  const groups = new Map();
  (records || []).forEach((record) => {
    if (!record || !record.session || !record.startedAt) return;
    const key = etDay(record.startedAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  for (const [key, rows] of groups) {
    await mergeDay(key, (doc) => {
      rows.forEach((record) => {
        const prev = doc.bySession[record.session];
        if (prev && String(prev.updatedAt) > String(record.updatedAt)) return;
        doc.bySession[record.session] = record;
      });
      return (check) => rows.every((record) => {
        const saved = check && check.bySession && check.bySession[record.session];
        return saved && String(saved.updatedAt) >= String(record.updatedAt);
      });
    });
  }
}

export async function forgetSessions(sessions) {
  const drop = new Set(sessions || []);
  if (!drop.size) return;
  for (const key of recentDayKeys()) {
    await mergeDay(key, (doc) => {
      let changed = false;
      drop.forEach((session) => {
        if (doc.bySession[session]) {
          delete doc.bySession[session];
          changed = true;
        }
      });
      if (!changed) return null;
      return (check) => !check || !check.bySession || Array.from(drop).every((session) => !check.bySession[session]);
    });
  }
}

async function listSessionBlobs() {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: 'quiz/', limit: 1000, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

async function readAllSessions() {
  const blobs = await listSessionBlobs();
  const events = [];
  for (let i = 0; i < blobs.length; i += 40) {
    const batch = blobs.slice(i, i + 40);
    const rows = await Promise.all(batch.map((blob) => readSafe(blob.pathname)));
    rows.forEach((row) => {
      if (row && row.session && PAGES.has(row.page)) events.push(row);
    });
  }
  return events;
}

async function rebuildDayIndex() {
  const started = Date.now();
  const events = await readAllSessions();
  const groups = new Map();
  events.forEach((event) => {
    const key = etDay(event.startedAt || event.updatedAt);
    if (!groups.has(key)) groups.set(key, { date: key, bySession: {} });
    const bucket = groups.get(key).bySession;
    const prev = bucket[event.session];
    if (!prev || String(prev.updatedAt) <= String(event.updatedAt)) bucket[event.session] = event;
  });
  for (const doc of groups.values()) await writeDay(doc);
  const fresh = (await listSessionBlobs()).filter((blob) => new Date(blob.uploadedAt).getTime() >= started - 1000);
  for (let i = 0; i < fresh.length; i += 40) {
    const rows = await Promise.all(fresh.slice(i, i + 40).map((blob) => readSafe(blob.pathname)));
    await indexRecords(rows.filter((row) => row && row.session && PAGES.has(row.page)));
  }
  await blobPut(READY_PATH, JSON.stringify({
    rebuiltAt: new Date().toISOString(),
    events: events.length,
    days: groups.size
  }));
}

let rebuilding = null;

export async function saveEvent(event) {
  const pathname = `quiz/${event.session}.json`;
  const now = new Date().toISOString();
  let existing = null;
  try {
    existing = await readEvent(pathname);
  } catch (err) {
    existing = null;
  }
  const record = buildRecord(existing, event, now);
  await put(pathname, JSON.stringify(record), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60
  });
  await indexRecords([record]);
  return record;
}

export async function listEvents() {
  if (!await readSafe(READY_PATH)) {
    if (!rebuilding) rebuilding = rebuildDayIndex().finally(() => { rebuilding = null; });
    await rebuilding;
  }
  const docs = await Promise.all(recentDayKeys().map((key) => readSafe(dayPath(key))));
  const events = [];
  docs.forEach((doc) => {
    if (!doc || !doc.bySession) return;
    Object.values(doc.bySession).forEach((row) => {
      if (row && PAGES.has(row.page)) events.push(row);
    });
  });
  events.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return events;
}

export function summarize(events) {
  const bucket = () => ({ total: 0, qualified: 0, disqualified: 0, debt: 0, sleep: 0, inProgress: 0 });
  const byPage = {};
  PAGES.forEach((page) => { byPage[page] = bucket(); });
  const comboMap = new Map();
  events.forEach((event) => {
    const counts = byPage[event.page];
    if (!counts) return;
    counts.total += 1;
    if (event.result && event.result in counts) counts[event.result] += 1;
    else counts.inProgress += 1;
    const key = [event.page, event.q1 || '', event.q2 || '', event.q3 || '', event.result || 'in-progress'].join('|');
    comboMap.set(key, (comboMap.get(key) || 0) + 1);
  });
  const combos = Array.from(comboMap.entries()).map(([key, count]) => {
    const [page, q1, q2, q3, result] = key.split('|');
    return { page, q1: q1 || null, q2: q2 || null, q3: q3 || null, result: result === 'in-progress' ? null : result, count };
  }).sort((a, b) => b.count - a.count);
  return { total: events.length, byPage, combos };
}
