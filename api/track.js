import { parseEvent, saveEvent } from './quiz-store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const event = parseEvent(req.body);
  if (!event) {
    res.status(400).json({ error: 'Invalid event' });
    return;
  }
  try {
    await saveEvent(event);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Could not save the answer' });
  }
}
