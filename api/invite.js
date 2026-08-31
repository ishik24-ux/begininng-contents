import crypto from 'node:crypto';
import { readSession } from './_auth.js';
import { db, ensureSchema } from './_db.js';
import { sendAdminPush } from './push.js';

function hashPassword(password) {
  const salt=crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password,salt,64).toString('hex')}`;
}
function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
async function notifyAdminOfApplication({name,email,createdAt,baseUrl}){
  const apiKey=process.env.RESEND_API_KEY;
  const to=process.env.ADMIN_NOTIFY_EMAIL;
  if(!apiKey||!to)return;
  const adminUrl=`${baseUrl}/admin/login`;
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json','Idempotency-Key':`student-application-${email}-${createdAt}`},
    body:JSON.stringify({
      from:process.env.NOTIFICATION_FROM_EMAIL||'Beginning教材サイト <onboarding@resend.dev>',
      to:[to],
      subject:'【Beginning教材サイト】新しい受講申請があります',
      html:`<h2>新しい受講申請があります</h2><p><b>氏名：</b>${escapeHtml(name)}</p><p><b>メール：</b>${escapeHtml(email)}</p><p><b>申請日時：</b>${escapeHtml(createdAt)}</p><p><a href="${adminUrl}">管理者画面で確認する</a></p>`
    })
  });
  if(!response.ok)throw new Error(`notification_failed_${response.status}`);
}
export default async function handler(req,res){
  await ensureSchema(); const sql=db(); const session=readSession(req); const action=req.query?.action||req.body?.action;
  if(req.method==='POST'&&action==='generate'){
    if(!session||session.role!=='admin')return res.status(401).json({error:'unauthorized'});
    const token=crypto.randomBytes(24).toString('base64url'); await sql`INSERT INTO invites (token) VALUES (${token})`;
    return res.status(200).json({url:`${req.headers['x-forwarded-proto']||'https'}://${req.headers.host}/invite/${token}`});
  }
  if(req.method==='GET'&&action==='applications'){
    if(!session||session.role!=='admin')return res.status(401).json({error:'unauthorized'});
    const applications=await sql`SELECT id,name,email,status,created_at FROM applications ORDER BY created_at DESC`;
    return res.status(200).json({applications});
  }
  if(req.method==='GET'){
    const rows=await sql`SELECT used FROM invites WHERE token=${req.query?.token||''}`;
    return res.status(rows[0]&&!rows[0].used?200:404).json({valid:!!rows[0]&&!rows[0].used});
  }
  if(req.method==='POST'&&action==='register'){
    const {token,name,email,password}=req.body||{};
    if(!token||!name||!email||!password||password.length<8)return res.status(400).json({error:'invalid_input'});
    const used=await sql`UPDATE invites SET used=true WHERE token=${token} AND used=false RETURNING token`;
    if(!used.length)return res.status(410).json({error:'invalid_invite'});
    const normalizedEmail=email.toLowerCase();
    const created=await sql`INSERT INTO applications (name,email,password_hash) VALUES (${name},${normalizedEmail},${hashPassword(password)}) RETURNING created_at`;
    const baseUrl=`${req.headers['x-forwarded-proto']||'https'}://${req.headers.host}`;
    const createdAt=created[0]?.created_at||new Date().toISOString();
    res.status(200).json({ok:true});
    void Promise.allSettled([
      notifyAdminOfApplication({name,email:normalizedEmail,createdAt,baseUrl}),
      sendAdminPush({title:'新しい受講申請',body:`${name}さんから参加申請が届きました`,url:`${baseUrl}/admin/login`,tag:'student-application'})
    ]).then(notifications=>{
      notifications.forEach(result=>{if(result.status==='rejected')console.error('application_notification_failed',result.reason)});
    });
    return;
  }
  if(req.method==='POST'&&(action==='approve'||action==='reject')){
    if(!session||session.role!=='admin')return res.status(401).json({error:'unauthorized'});
    await sql`UPDATE applications SET status=${action==='approve'?'active':'rejected'} WHERE id=${Number(req.body.id)}`;
    return res.status(200).json({ok:true});
  }
  if(req.method==='POST'&&action==='reset-password'){
    if(!session||session.role!=='admin')return res.status(401).json({error:'unauthorized'});
    const id=Number(req.body?.id);
    const password=String(req.body?.password||'');
    if(!Number.isFinite(id)||password.length<8)return res.status(400).json({error:'invalid_input'});
    const updated=await sql`UPDATE applications SET password_hash=${hashPassword(password)} WHERE id=${id} AND status<>'deleted' RETURNING id`;
    if(!updated.length)return res.status(404).json({error:'not_found'});
    await sql`DELETE FROM password_reset_tokens WHERE email=(SELECT email FROM applications WHERE id=${id})`;
    return res.status(200).json({ok:true});
  }
  if(req.method==='POST'&&action==='update-status'){
    if(!session||session.role!=='admin')return res.status(401).json({error:'unauthorized'});
    const allowed=new Set(['active','disabled','graduated','cancelled','deleted']);
    const status=String(req.body?.status||'');
    const id=Number(req.body?.id);
    if(!allowed.has(status)||!Number.isFinite(id))return res.status(400).json({error:'invalid_status'});
    const updated=await sql`UPDATE applications SET status=${status} WHERE id=${id} RETURNING id`;
    if(!updated.length)return res.status(404).json({error:'not_found'});
    return res.status(200).json({ok:true});
  }
  return res.status(405).end();
}

