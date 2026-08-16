import crypto from 'node:crypto';
import { readSession } from './_auth.js';
import { db, ensureSchema } from './_db.js';

function hashPassword(password) {
  const salt=crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password,salt,64).toString('hex')}`;
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
    const applications=await sql`SELECT id,name,email,status,created_at FROM applications WHERE status='pending' ORDER BY created_at DESC`;
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
    await sql`INSERT INTO applications (name,email,password_hash) VALUES (${name},${email.toLowerCase()},${hashPassword(password)})`;
    return res.status(200).json({ok:true});
  }
  if(req.method==='POST'&&(action==='approve'||action==='reject')){
    if(!session||session.role!=='admin')return res.status(401).json({error:'unauthorized'});
    await sql`UPDATE applications SET status=${action==='approve'?'active':'rejected'} WHERE id=${Number(req.body.id)}`;
    return res.status(200).json({ok:true});
  }
  return res.status(405).end();
}

