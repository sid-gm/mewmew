// /api/boards — list (metadata only) and create.
import { owner, body, send, sanitize, cleanName, newId, safeId,
         haveBlob, getIndex, putIndex, writeJson, boardPath } from '../lib/blob.js';

export default async function handler(req, res){
  const who = owner(req);
  if (!who) return send(res, 401, { error:'owner' });
  if (!haveBlob()) return send(res, 503, { error:'blob' });

  try {
    if (req.method === 'GET'){
      return send(res, 200, await getIndex(who));
    }

    if (req.method === 'POST'){
      const b = await body(req);
      const id = (b.id && safeId(b.id)) || newId();   // client owns the id (local-first)
      const data = sanitize(b.data);
      const entry = {
        id, name: cleanName(b.name), thumb: b.thumb ?? null,
        updatedAt: new Date().toISOString(), items: data.items.length
      };
      await writeJson(boardPath(who, id), data);
      const idx = await getIndex(who);
      idx.push(entry);
      await putIndex(who, idx);
      return send(res, 201, entry);
    }

    res.setHeader('allow', 'GET, POST');
    return send(res, 405, { error:'method' });
  } catch(e){
    console.error('[mew] /api/boards ' + req.method, e && (e.stack || e.message) || e);
    return send(res, 500, { error:'server', detail:String(e.message||e) });
  }
}
