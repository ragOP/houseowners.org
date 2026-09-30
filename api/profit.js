import { put } from '@vercel/blob';
import { readEvent } from './quiz-store.js';

export const maxDuration = 60;

const PULSE = 'https://pulse-desk-gold.vercel.app/api/report';
const ZONE = 'America/New_York';
const DAYS = 14;
const MAX_FETCHES = 3;
const GAP_MS = 1500;
const MINUTE = 60000;

function etDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function shift(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function isFresh(record, key, today, now) {
  if (!record || !record.fetchedAt || !Array.isArray(record.campaigns)) return false;
  const age = daysBetween(key, today);
  const sinceFetch = now - Date.parse(record.fetchedAt);
  if (age === 0) return sinceFetch < 5 * MINUTE;
  if (age === 1) return sinceFetch < 30 * MINUTE;
  if (daysBetween(key, etDate(new Date(record.fetchedAt))) >= 3) return true;
  return sinceFetch < 360 * MINUTE;
}

async function fetchDay(key) {
  const url = PULSE + '?date_from=' + key + '&date_to=' + key + '&timezone=' + encodeURIComponent(ZONE);
  const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!res.ok) throw Object.assign(new Error('Pulse ' + res.status), { status: res.status });
  const json = await res.json();
  const rows = json.campaigns || [];
  if (rows.length && rows.every((row) => !num(row.clicks))) {
    throw Object.assign(new Error('Pulse returned conversions without spend'), { status: 429 });
  }
  return rows
    .map((row) => ({
      name: String(row.name || 'Unknown campaign'),
      clicks: num(row.clicks),
      conversions: num(row.conversions),
      revenue: num(row.revenue),
      cost: num(row.cost),
      profit: num(row.profit)
    }))
    .filter((row) => row.clicks || row.conversions || row.revenue || row.cost);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const now = Date.now();
    const today = etDate(new Date(now));
    const keys = Array.from({ length: DAYS }, (_, i) => shift(today, -i));
    const records = await Promise.all(keys.map((key) => readEvent('profit/' + key + '.json').catch(() => null)));

    let fetched = 0;
    let limited = false;
    for (let i = 0; i < keys.length && fetched < MAX_FETCHES && !limited; i++) {
      if (isFresh(records[i], keys[i], today, now)) continue;
      if (fetched > 0) await wait(GAP_MS);
      fetched += 1;
      try {
        const record = { date: keys[i], fetchedAt: new Date().toISOString(), campaigns: await fetchDay(keys[i]) };
        await put('profit/' + keys[i] + '.json', JSON.stringify(record), {
          access: 'public',
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: 'application/json',
          cacheControlMaxAge: 60
        });
        records[i] = record;
      } catch (err) {
        if (err.status === 429) limited = true;
      }
    }

    const days = keys.map((key, i) => ({
      date: key,
      fetchedAt: records[i] ? records[i].fetchedAt : null,
      campaigns: records[i] ? records[i].campaigns : null
    }));
    res.status(200).json({
      today,
      days,
      missing: days.filter((day) => !day.campaigns).length,
      stale: keys.filter((key, i) => !isFresh(records[i], key, today, now)).length,
      limited
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load profit' });
  }
}
