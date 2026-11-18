import { signSession, verifyPassword } from './_auth.js';
import { db, ensureSchema } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { email = '', password = '', role = '' } = req.body || {};
  const normalizedEmail = String(email).trim().toLowerCase();
  await ensureSchema();

  const primaryAdminValid = role === 'admin'
    && normalizedEmail === String(process.env.ADMIN_EMAIL || '').toLowerCase()
    && verifyPassword(password, process.env.ADMIN_PASSWORD_HASH || '');

  let databaseAdmin = null;
  if (role === 'admin' && !primaryAdminValid) {
    const rows = await db()`SELECT name,email,password_hash,access_role FROM admin_accounts WHERE email=${normalizedEmail} AND status='active' LIMIT 1`;
    databaseAdmin = rows[0] && verifyPassword(password, rows[0].password_hash) ? rows[0] : null;
  }

  let studentAccount = null;
  if (role === 'student') {
    const rows = await db()`SELECT name,email,password_hash FROM applications WHERE email=${normalizedEmail} AND status='active' ORDER BY id DESC LIMIT 1`;
    studentAccount = rows[0] && verifyPassword(password, rows[0].password_hash) ? rows[0] : null;
  }

  const isAdmin = role === 'admin' && (primaryAdminValid || !!databaseAdmin);
  const isStudent = role === 'student' && !!studentAccount;
  if (!isAdmin && !isStudent) return res.status(401).json({ error: 'invalid_credentials' });

  const account = isAdmin
    ? {
        role: 'admin',
        name: primaryAdminValid ? 'サイト管理者' : databaseAdmin.name,
        email: primaryAdminValid ? process.env.ADMIN_EMAIL : databaseAdmin.email,
        accessRole: primaryAdminValid ? '管理者' : databaseAdmin.access_role
      }
    : { role: 'student', name: studentAccount.name, email: studentAccount.email };

  const token = signSession({ ...account, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 });
  res.setHeader('Set-Cookie', `begininng_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
  return res.status(200).json(account);
}
