import { readSession } from './_auth.js';
import { db, ensureSchema } from './_db.js';

export default async function handler(req, res) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: 'unauthorized' });
  await ensureSchema();
  const sql = db();

  if (req.method === 'GET') {
    if (session.role === 'admin') {
      const comments = await sql`SELECT id,video_id,video_title,student_email,student_name,body,status,created_at FROM video_comments ORDER BY created_at DESC`;
      return res.status(200).json({ comments });
    }
    const comments = await sql`SELECT id,video_id,video_title,body,status,created_at FROM video_comments WHERE student_email=${session.email} AND status='visible' ORDER BY created_at ASC`;
    return res.status(200).json({ comments });
  }

  if (req.method === 'POST') {
    if (session.role !== 'student') return res.status(403).json({ error: 'forbidden' });
    const videoId = String(req.body?.videoId || '').slice(0, 100);
    const videoTitle = String(req.body?.videoTitle || '').trim().slice(0, 300);
    const body = String(req.body?.body || '').trim().slice(0, 5000);
    if (!videoId || !videoTitle || !body) return res.status(400).json({ error: 'invalid_input' });
    const rows = await sql`INSERT INTO video_comments (video_id,video_title,student_email,student_name,body) VALUES (${videoId},${videoTitle},${session.email},${session.name},${body}) RETURNING id,video_id,video_title,body,status,created_at`;
    return res.status(201).json({ comment: rows[0] });
  }

  if (req.method === 'PATCH') {
    if (session.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
    const id = Number(req.body?.id);
    const status = req.body?.status === 'hidden' ? 'hidden' : 'visible';
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'invalid_id' });
    const rows = await sql`UPDATE video_comments SET status=${status} WHERE id=${id} RETURNING id,status`;
    return rows.length ? res.status(200).json({ comment: rows[0] }) : res.status(404).json({ error: 'not_found' });
  }

  if (req.method === 'DELETE') {
    if (session.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
    const id = Number(req.query?.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'invalid_id' });
    const rows = await sql`DELETE FROM video_comments WHERE id=${id} RETURNING id`;
    return rows.length ? res.status(200).json({ ok: true }) : res.status(404).json({ error: 'not_found' });
  }

  return res.status(405).end();
}
