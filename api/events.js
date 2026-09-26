import { timingSafeEqual } from 'crypto';
import { QUESTIONS, listEvents, summarize } from './quiz-store.js';

function passwordOk(header) {
  const expected = process.env.ADMIN_PASSWORD || '';
  const got = header && header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!expected || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!passwordOk(req.headers.authorization || '')) {
    res.status(401).json({ error: 'Wrong password' });
    return;
  }
  try {
    const events = await listEvents();
    res.status(200).json({
      questions: QUESTIONS,
      summary: summarize(events),
      events
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load answers' });
  }
}
