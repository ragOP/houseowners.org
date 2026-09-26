import { QUESTIONS, listEvents, summarize } from './quiz-store.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
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
