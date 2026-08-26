import webpush from 'web-push';
import { readSession } from './_auth.js';
import { db, ensureSchema } from './_db.js';

function configure(){
  const publicKey=process.env.VAPID_PUBLIC_KEY;
  const privateKey=process.env.VAPID_PRIVATE_KEY;
  if(!publicKey||!privateKey)return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:nklabo.academy@gmail.com',publicKey,privateKey);
  return true;
}
export async function sendAdminPush(payload){
  if(!configure())return;
  await ensureSchema();const sql=db();
  const rows=await sql`SELECT endpoint,subscription FROM push_subscriptions`;
  await Promise.allSettled(rows.map(async row=>{
    try{await webpush.sendNotification(row.subscription,JSON.stringify(payload))}
    catch(error){if(error?.statusCode===404||error?.statusCode===410)await sql`DELETE FROM push_subscriptions WHERE endpoint=${row.endpoint}`;else throw error}
  }));
}
export default async function handler(req,res){
  await ensureSchema();const session=readSession(req);
  if(!session||session.role!=='admin')return res.status(401).json({error:'unauthorized'});
  if(req.method==='GET')return res.status(200).json({publicKey:process.env.VAPID_PUBLIC_KEY||''});
  if(req.method==='POST'){
    const subscription=req.body?.subscription;
    if(!subscription?.endpoint)return res.status(400).json({error:'invalid_subscription'});
    await db()`INSERT INTO push_subscriptions (endpoint,subscription) VALUES (${subscription.endpoint},${JSON.stringify(subscription)}::jsonb) ON CONFLICT (endpoint) DO UPDATE SET subscription=EXCLUDED.subscription`;
    return res.status(200).json({ok:true});
  }
  if(req.method==='DELETE'){
    const endpoint=req.body?.endpoint;
    if(endpoint)await db()`DELETE FROM push_subscriptions WHERE endpoint=${endpoint}`;
    return res.status(200).json({ok:true});
  }
  return res.status(405).end();
}
