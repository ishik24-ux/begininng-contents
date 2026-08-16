import { readSession } from './_auth.js';
import { db, ensureSchema } from './_db.js';

export default async function handler(req, res) {
  const session = readSession(req);
  if (!session || session.role !== 'admin') return res.status(401).json({ error: 'unauthorized' });
  await ensureSchema();
  const sql = db();
  if (req.method === 'GET') {
    const rows = await sql`SELECT data FROM app_content WHERE id='main'`;
    return res.status(200).json({ data: rows[0]?.data || null });
  }
  if (req.method === 'PUT') {
    const data = req.body?.data;
    if (!data || JSON.stringify(data).length > 2_000_000) return res.status(400).json({ error: 'invalid_data' });
    await sql`INSERT INTO app_content (id,data,updated_at) VALUES ('main',${JSON.stringify(data)}::jsonb,now()) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()`;
    return res.status(200).json({ ok: true });
  }
  return res.status(405).end();
}

