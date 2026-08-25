import { signSession, verifyPassword } from './_auth.js';
import { db, ensureSchema } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { email = '', password = '', role = '' } = req.body || {};
  const isAdmin = role === 'admin' && email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase() && verifyPassword(password, process.env.ADMIN_PASSWORD_HASH || '');
  let studentAccount=null;
  if(role==='student'){
    await ensureSchema();
    const rows=await db()`SELECT name,email,password_hash FROM applications WHERE email=${email.toLowerCase()} AND status='active' ORDER BY id DESC LIMIT 1`;
    studentAccount=rows[0]&&verifyPassword(password,rows[0].password_hash)?rows[0]:null;
  }
  const isStudent = role === 'student' && !!studentAccount;
  if (!isAdmin && !isStudent) return res.status(401).json({ error: 'invalid_credentials' });
  const account = isAdmin
    ? { role: 'admin', name: 'サイト管理者', email: process.env.ADMIN_EMAIL }
    : { role: 'student', name: studentAccount.name, email: studentAccount.email };
  const token = signSession({ ...account, exp: Date.now() + 24 * 60 * 60 * 1000 });
  res.setHeader('Set-Cookie', `begininng_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`);
  return res.status(200).json(account);
}

