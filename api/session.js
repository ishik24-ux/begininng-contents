import { readSession, signSession } from './_auth.js';

export default function handler(req, res) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: 'unauthorized' });
  const account = { role: session.role, name: session.name, email: session.email };
  const token = signSession({ ...account, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 });
  res.setHeader('Set-Cookie', `begininng_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
  return res.status(200).json(account);
}
