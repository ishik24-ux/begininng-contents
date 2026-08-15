export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Set-Cookie', 'begininng_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  return res.status(204).end();
}

