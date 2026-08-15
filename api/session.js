import { readSession } from './_auth.js';

export default function handler(req, res) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: 'unauthorized' });
  return res.status(200).json({ role: session.role, name: session.name, email: session.email });
}

