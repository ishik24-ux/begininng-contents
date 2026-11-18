import crypto from 'node:crypto';
import { readSession } from './_auth.js';
import { db, ensureSchema } from './_db.js';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
function adminSession(req) {
  const session = readSession(req);
  return session?.role === 'admin' ? session : null;
}
export default async function handler(req, res) {
  await ensureSchema();
  const sql = db();
  const action = String(req.query?.action || req.body?.action || '');

  if (req.method === 'GET' && action === 'validate') {
    const token = String(req.query?.token || '');
    if (!token) return res.status(400).json({ error: 'invalid_token' });
    const rows = await sql`SELECT access_role FROM admin_invites WHERE token_hash=${tokenHash(token)} AND used=false AND expires_at>now() LIMIT 1`;
    if (!rows.length) return res.status(410).json({ error: 'invalid_or_expired' });
    return res.status(200).json({ valid: true, role: rows[0].access_role });
  }

  const session = adminSession(req);
  if (req.method === 'GET' && action === 'list') {
    if (!session) return res.status(401).json({ error: 'unauthorized' });
    const rows = await sql`SELECT id,name,email,access_role AS role,status,created_at FROM admin_accounts ORDER BY created_at`;
    const primary = process.env.ADMIN_EMAIL ? [{
      id: 'primary', name: 'サイト管理者', email: process.env.ADMIN_EMAIL,
      role: '管理者', status: 'active', immutable: true
    }] : [];
    return res.status(200).json({ accounts: [...primary, ...rows] });
  }

  if (req.method === 'POST' && action === 'generate') {
    if (!session) return res.status(401).json({ error: 'unauthorized' });
    const role = ['管理者', '編集者'].includes(req.body?.role) ? req.body.role : '管理者';
    const token = crypto.randomBytes(24).toString('base64url');
    await sql`INSERT INTO admin_invites (token_hash,access_role,created_by_email,expires_at) VALUES (${tokenHash(token)},${role},${session.email || ''},now()+interval '7 days')`;
    const baseUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
    return res.status(200).json({ url: `${baseUrl}/admin/invite/${token}`, role, expiresInDays: 7 });
  }

  if (req.method === 'POST' && action === 'register') {
    const token = String(req.body?.token || '');
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!token || !name || !email || password.length < 8 || !email.includes('@')) {
      return res.status(400).json({ error: 'invalid_input' });
    }
    if (email === String(process.env.ADMIN_EMAIL || '').toLowerCase()) {
      return res.status(409).json({ error: 'account_exists' });
    }
    const existing = await sql`SELECT id FROM admin_accounts WHERE email=${email} LIMIT 1`;
    if (existing.length) return res.status(409).json({ error: 'account_exists' });
    const invites = await sql`UPDATE admin_invites SET used=true,used_at=now() WHERE token_hash=${tokenHash(token)} AND used=false AND expires_at>now() RETURNING access_role`;
    if (!invites.length) return res.status(410).json({ error: 'invalid_or_expired' });
    await sql`INSERT INTO admin_accounts (name,email,password_hash,access_role,status) VALUES (${name},${email},${hashPassword(password)},${invites[0].access_role},'active')`;
    return res.status(201).json({ ok: true });
  }

  if (req.method === 'PATCH') {
    if (!session) return res.status(401).json({ error: 'unauthorized' });
    const id = Number(req.body?.id);
    const status = req.body?.status === 'disabled' ? 'disabled' : req.body?.status === 'active' ? 'active' : '';
    if (!id || !status) return res.status(400).json({ error: 'invalid_input' });
    const rows = await sql`UPDATE admin_accounts SET status=${status} WHERE id=${id} AND email<>${String(session.email || '').toLowerCase()} RETURNING id`;
    if (!rows.length) return res.status(400).json({ error: 'cannot_update_account' });
    return res.status(200).json({ ok: true });
  }
  return res.status(405).end();
}
