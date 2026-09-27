import { randomBytes } from 'crypto';
import { del, list, put } from '@vercel/blob';
import { listEvents } from './quiz-store.js';

const PAGES = new Set(['glo2', 'glo2b', 'mix']);
const RANGES = new Set(['today', 'yesterday', '7', '14']);
const PLACES = [
  ['73.162.88.21', 'San Jose, CA'],
  ['4.35.208.14', 'Tampa, FL'],
  ['24.25.44.18', 'Atlanta, GA'],
  ['68.99.12.40', 'Omaha, NE'],
  ['174.192.55.16', 'North Haven, CT'],
  ['98.230.18.22', 'Lynn Haven, FL'],
  ['71.168.44.19', 'Boston, MA'],
  ['107.77.33.14', 'New York, NY'],
  ['173.68.91.27', 'Staten Island, NY'],
  ['76.14.55.18', 'Walnut Creek, CA'],
  ['96.40.22.13', 'Kearney, NE'],
  ['108.21.77.16', 'Brooklyn, NY'],
  ['66.90.18.24', 'Orlando, FL'],
  ['209.6.44.15', 'Newton, MA'],
  ['64.121.33.19', 'Allentown, PA'],
  ['47.184.22.10', 'Carrollton, TX'],
  ['72.80.44.17', 'Queens, NY'],
  ['75.25.18.21', 'Atlanta, GA'],
  ['69.250.33.14', 'Washington, DC'],
  ['100.36.22.18', 'Reston, VA']
];

function etParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

function atEastern(dayOffset, hour, minute, now) {
  const today = etParts(now);
  const utc = new Date(Date.UTC(today.year, today.month - 1, today.day + dayOffset));
  const y = utc.getUTCFullYear();
  const m = utc.getUTCMonth() + 1;
  const d = utc.getUTCDate();
  let t = Date.UTC(y, m - 1, d, hour + 4, minute, 0);
  for (let i = 0; i < 6; i++) {
    const got = etParts(new Date(t));
    const dayDelta = (Date.UTC(got.year, got.month - 1, got.day) - Date.UTC(y, m - 1, d)) / 86400000;
    const shift = (dayDelta * 24 + (got.hour - hour)) * 60 + (got.minute - minute);
    if (shift === 0) return t;
    t -= shift * 60000;
  }
  return t;
}

function bounds(range, now) {
  const end = now.getTime();
  if (range === 'today') return [atEastern(0, 0, 1, now), end];
  if (range === 'yesterday') return [atEastern(-1, 0, 5, now), atEastern(-1, 23, 50, now)];
  const days = range === '7' ? 6 : 13;
  return [atEastern(-days, 0, 5, now), end];
}

function scenario() {
  const roll = Math.random();
  if (roll < 0.22) {
    return { q1: null, q2: null, qualifyReached: false, disqualifyReached: false, qualifyClick: false, disqualifyClick: false };
  }
  if (roll < 0.4) {
    return { q1: Math.random() < 0.65 ? 'yes' : 'no', q2: null, qualifyReached: false, disqualifyReached: false, qualifyClick: false, disqualifyClick: false };
  }
  if (roll < 0.68) {
    return { q1: 'yes', q2: 'yes', qualifyReached: true, disqualifyReached: false, qualifyClick: Math.random() < 0.55, disqualifyClick: false };
  }
  const q1 = Math.random() < 0.5 ? 'yes' : 'no';
  const q2 = q1 === 'yes' ? 'no' : (Math.random() < 0.5 ? 'yes' : 'no');
  return { q1, q2, qualifyReached: false, disqualifyReached: true, qualifyClick: false, disqualifyClick: Math.random() < 0.35 };
}

export function buildSampleRecords(input, now = new Date()) {
  const count = Math.min(50, Math.max(1, Math.floor(Number(input && input.count) || 0)));
  const range = input && input.range;
  const page = input && input.page;
  if (!Number.isFinite(count) || count < 1 || !RANGES.has(range) || !PAGES.has(page)) return null;
  const [start, end] = bounds(range, now);
  const span = Math.max(end - start, 60000);
  const records = [];
  for (let i = 0; i < count; i++) {
    const stamp = new Date(start + Math.random() * span).toISOString();
    const answers = scenario();
    const finished = answers.q1 && answers.q2;
    const [ip, place] = PLACES[Math.floor(Math.random() * PLACES.length)];
    const chosen = page === 'mix' ? (Math.random() < 0.5 ? 'glo2' : 'glo2b') : page;
    records.push({
      session: 'sample' + randomBytes(16).toString('hex'),
      page: chosen,
      q1: answers.q1,
      q2: answers.q2,
      result: finished ? (answers.q1 === 'yes' && answers.q2 === 'yes' ? 'qualified' : 'disqualified') : null,
      qualifyReached: answers.qualifyReached,
      disqualifyReached: answers.disqualifyReached,
      qualifyClick: answers.qualifyClick,
      disqualifyClick: answers.disqualifyClick,
      ip,
      place,
      country: 'US',
      sample: true,
      startedAt: stamp,
      updatedAt: stamp
    });
  }
  return records;
}

export function samplePaths(events, pathnames) {
  const paths = new Set();
  (events || []).forEach((event) => {
    if (event && event.sample && event.session) paths.add('quiz/' + event.session + '.json');
  });
  (pathnames || []).forEach((pathname) => {
    const name = String(pathname).split('/').pop() || '';
    if (name.startsWith('sample') || name.startsWith('usamock')) paths.add(pathname);
  });
  return Array.from(paths);
}

async function prefixed(prefix) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix, limit: 1000, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs.map((blob) => blob.pathname);
}

export async function addSamples(input) {
  const records = buildSampleRecords(input);
  if (!records) return null;
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    await Promise.all(batch.map((record) => put('quiz/' + record.session + '.json', JSON.stringify(record), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60
    })));
  }
  return records;
}

export async function removeSamples() {
  const [events, samples, mocks] = await Promise.all([
    listEvents(),
    prefixed('quiz/sample'),
    prefixed('quiz/usamock')
  ]);
  const paths = samplePaths(events, samples.concat(mocks));
  for (let i = 0; i < paths.length; i += 50) {
    await del(paths.slice(i, i + 50));
  }
  return paths.length;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'POST') {
      const records = await addSamples(req.body || {});
      if (!records) {
        res.status(400).json({ error: 'Choose a count from 1 to 50, a date range, and a page.' });
        return;
      }
      res.status(200).json({ added: records.length });
      return;
    }
    if (req.method === 'DELETE') {
      const removed = await removeSamples();
      res.status(200).json({ removed });
      return;
    }
    res.setHeader('Allow', 'POST, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: 'Could not update sample visits' });
  }
}
