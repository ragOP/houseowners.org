import { get, list, put } from '@vercel/blob';

export const QUESTIONS = {
  q1: 'Is your credit score over 670?',
  q2: 'Is your current mortgage balance over $150k?',
  q3: 'Do you have over $8k in credit card debt?'
};

const PAGES = new Set(['glo2', 'glo2b', 'tobe', 'abc']);
const DEBT_PAGES = new Set(['glo2', 'glo2b']);
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

async function readEvent(pathname) {
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
  return record;
}

export async function listEvents() {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: 'quiz/', limit: 1000, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const events = [];
  for (let i = 0; i < blobs.length; i += 40) {
    const batch = blobs.slice(i, i + 40);
    const rows = await Promise.all(batch.map(async (blob) => {
      try {
        return await readEvent(blob.pathname);
      } catch (err) {
        return null;
      }
    }));
    rows.forEach((row) => {
      if (row && PAGES.has(row.page)) events.push(row);
    });
  }
  events.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return events;
}

export function summarize(events) {
  const bucket = () => ({ total: 0, qualified: 0, disqualified: 0, debt: 0, sleep: 0, inProgress: 0 });
  const byPage = { glo2: bucket(), glo2b: bucket(), tobe: bucket(), abc: bucket() };
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
