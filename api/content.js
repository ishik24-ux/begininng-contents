import { readSession } from './_auth.js';
import { db, ensureSchema } from './_db.js';

export default async function handler(req, res) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: 'unauthorized' });
  await ensureSchema();
  const sql = db();
  if (req.method === 'GET') {
    const rows = await sql`SELECT data FROM app_content WHERE id='main'`;
    const data=rows[0]?.data || null;
    if(session.role==='student'&&data){
      const publicBaseVideos=(data.videos||[]).filter(video=>(data.videoVisibility||{})[video.id]!==false);
      const publicAddedVideos=(data.addedVideos||[]).filter(video=>video.visibility!=='非公開');
      const publicBaseIds=new Set(publicBaseVideos.map(video=>video.id));
      const publicAddedTitles=new Set(publicAddedVideos.map(video=>video.title));
      const publicTree=(data.dragTree||[]).filter(node=>node.type!=='video'||(node.videoId!=null?publicBaseIds.has(node.videoId):publicAddedTitles.has(node.title)));
      return res.status(200).json({data:{
        savedAt:data.savedAt,
        dragTree:publicTree,
        customFolders:data.customFolders||[],
        addedVideos:publicAddedVideos,
        videoVisibility:data.videoVisibility||{},
        videos:publicBaseVideos
      }});
    }
    return res.status(200).json({ data });
  }
  if (req.method === 'PUT') {
    if(session.role!=='admin')return res.status(403).json({error:'forbidden'});
    const data = req.body?.data;
    if (!data || JSON.stringify(data).length > 2_000_000) return res.status(400).json({ error: 'invalid_data' });
    await sql`INSERT INTO app_content (id,data,updated_at) VALUES ('main',${JSON.stringify(data)}::jsonb,now()) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()`;
    return res.status(200).json({ ok: true });
  }
  return res.status(405).end();
}

