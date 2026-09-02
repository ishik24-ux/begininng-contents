import { readSession } from './_auth.js';
import { db, ensureSchema } from './_db.js';

export default async function handler(req,res){
  await ensureSchema();
  const session=readSession(req);
  if(!session)return res.status(401).json({error:'unauthorized'});
  const sql=db();
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET'){
    if(session.role==='admin'){
      const activities=await sql`SELECT student_email,student_name,video_id,video_title,progress,status,open_count,position_seconds,duration_seconds,first_viewed_at,last_viewed_at FROM video_activity ORDER BY last_viewed_at DESC`;
      return res.status(200).json({activities});
    }
    if(session.role==='student'){
      const activities=await sql`SELECT video_id,video_title,progress,status,position_seconds,duration_seconds,last_viewed_at FROM video_activity WHERE student_email=${session.email} ORDER BY last_viewed_at DESC`;
      return res.status(200).json({activities});
    }
    return res.status(403).json({error:'forbidden'});
  }
  if(req.method==='POST'){
    if(session.role!=='student')return res.status(403).json({error:'forbidden'});
    const {videoId,videoTitle,opened}=req.body||{};
    const progress=Math.max(0,Math.min(100,Number(req.body?.progress)||0));
    const positionSeconds=Math.max(0,Math.round(Number(req.body?.positionSeconds)||0));
    const durationSeconds=Math.max(0,Math.round(Number(req.body?.durationSeconds)||0));
    if(!videoId||!videoTitle)return res.status(400).json({error:'invalid_input'});
    const status=progress>=100?'done':'watching';
    const openCount=opened?1:0;
    await sql`INSERT INTO video_activity (student_email,student_name,video_id,video_title,progress,status,open_count,position_seconds,duration_seconds) VALUES (${session.email},${session.name||'講座生'},${String(videoId)},${String(videoTitle)},${Math.round(progress)},${status},${openCount},${positionSeconds},${durationSeconds}) ON CONFLICT (student_email,video_id) DO UPDATE SET student_name=EXCLUDED.student_name,video_title=EXCLUDED.video_title,progress=GREATEST(video_activity.progress,EXCLUDED.progress),status=CASE WHEN GREATEST(video_activity.progress,EXCLUDED.progress)>=100 THEN 'done' ELSE EXCLUDED.status END,open_count=video_activity.open_count+EXCLUDED.open_count,position_seconds=EXCLUDED.position_seconds,duration_seconds=GREATEST(video_activity.duration_seconds,EXCLUDED.duration_seconds),last_viewed_at=now()`;
    return res.status(200).json({ok:true});
  }
  return res.status(405).end();
}
