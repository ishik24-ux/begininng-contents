import crypto from 'node:crypto';
import { db, ensureSchema } from './_db.js';

function hashPassword(password){
  const salt=crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password,salt,64).toString('hex')}`;
}
function tokenHash(token){
  return crypto.createHash('sha256').update(token).digest('hex');
}
function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
async function sendResetEmail({email,token,baseUrl}){
  const apiKey=process.env.RESEND_API_KEY;
  if(!apiKey)throw new Error('email_not_configured');
  const resetUrl=`${baseUrl}/login?resetToken=${encodeURIComponent(token)}`;
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},
    body:JSON.stringify({
      from:process.env.NOTIFICATION_FROM_EMAIL||'Beginning教材サイト <onboarding@resend.dev>',
      to:[email],
      subject:'【Beginning教材サイト】パスワード再設定',
      html:`<h2>パスワード再設定</h2><p>以下のボタンから新しいパスワードを設定してください。</p><p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 20px;background:#0b8b61;color:#fff;text-decoration:none;border-radius:10px">パスワードを再設定する</a></p><p>このリンクの有効期限は1時間です。心当たりがない場合は、このメールを破棄してください。</p>`
    })
  });
  if(!response.ok)throw new Error(`email_failed_${response.status}`);
}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).end();
  await ensureSchema();
  const sql=db();
  const action=String(req.body?.action||'');
  if(action==='request'){
    const email=String(req.body?.email||'').trim().toLowerCase();
    if(!email)return res.status(400).json({error:'invalid_email'});
    const accounts=await sql`SELECT email FROM applications WHERE email=${email} AND status='active' ORDER BY id DESC LIMIT 1`;
    if(!accounts.length)return res.status(200).json({ok:true});
    const token=crypto.randomBytes(32).toString('base64url');
    const hash=tokenHash(token);
    await sql`DELETE FROM password_reset_tokens WHERE email=${email} OR expires_at<now() OR used_at IS NOT NULL`;
    await sql`INSERT INTO password_reset_tokens (token_hash,email,expires_at) VALUES (${hash},${email},now()+interval '1 hour')`;
    const baseUrl=`${req.headers['x-forwarded-proto']||'https'}://${req.headers.host}`;
    try{
      await sendResetEmail({email,token,baseUrl});
    }catch(error){
      console.error('password_reset_email_failed',error);
      await sql`DELETE FROM password_reset_tokens WHERE token_hash=${hash}`;
      return res.status(503).json({error:'email_unavailable'});
    }
    return res.status(200).json({ok:true});
  }
  if(action==='reset'){
    const token=String(req.body?.token||'');
    const password=String(req.body?.password||'');
    if(!token||password.length<8)return res.status(400).json({error:'invalid_input'});
    const hash=tokenHash(token);
    const rows=await sql`SELECT email FROM password_reset_tokens WHERE token_hash=${hash} AND used_at IS NULL AND expires_at>now() LIMIT 1`;
    if(!rows.length)return res.status(410).json({error:'invalid_or_expired'});
    const email=rows[0].email;
    const updated=await sql`UPDATE applications SET password_hash=${hashPassword(password)} WHERE id=(SELECT id FROM applications WHERE email=${email} AND status='active' ORDER BY id DESC LIMIT 1) RETURNING id`;
    if(!updated.length)return res.status(404).json({error:'account_not_found'});
    await sql`UPDATE password_reset_tokens SET used_at=now() WHERE token_hash=${hash}`;
    return res.status(200).json({ok:true});
  }
  return res.status(400).json({error:'invalid_action'});
}
