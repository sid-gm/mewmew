// /api/boards/:id — read full board, whole-board save, delete.
import { owner, body, send, sanitize, safeId, cleanName,
         haveBlob, getIndex, putIndex, writeJson, readJson, delPrefix, boardPath } from '../../lib/blob.js';

export default async function handler(req, res){
  const who = owner(req);
  if (!who) return send(res, 401, { error:'owner' });
  if (!haveBlob()) return send(res, 503, { error:'blob' });

  const id = safeId(req.query && req.query.id);
  if (!id) return send(res, 400, { error:'id' });

  try {
    if (req.method === 'GET'){
      const data = await readJson(boardPath(who, id));
      if (!data) return send(res, 404, { error:'notfound' });
      const meta = (await getIndex(who)).find(e => e.id === id) || {};
      return send(res, 200, { id, name: meta.name || 'Untitled', updatedAt: meta.updatedAt || null, data });
    }

    if (req.method === 'PUT' || req.method === 'PATCH'){
      const b = await body(req);
      const idx = await getIndex(who);
      let entry = idx.find(e => e.id === id);
      if (!entry){                                    // upsert — syncs an offline-created board
        entry = { id, name: cleanName(b.name), thumb: b.thumb ?? null, updatedAt: null, items: 0 };
        idx.push(entry);
      }

      if (b.data !== undefined){
        const data = sanitize(b.data);
        await writeJson(boardPath(who, id), data);   // whole-board overwrite
        entry.items = data.items.length;
      }
      if (b.name  !== undefined) entry.name  = cleanName(b.name);
      if (b.thumb !== undefined) entry.thumb = b.thumb;
      entry.updatedAt = new Date().toISOString();
      await putIndex(who, idx);
      return send(res, 200, entry);
    }

    if (req.method === 'DELETE'){
      await delPrefix(`boards/${who}/${id}.`);        // trailing dot → also removes {id}.png
      const next = (await getIndex(who)).filter(e => e.id !== id);
      await putIndex(who, next);
      return send(res, 200, { ok:true });
    }

    res.setHeader('allow', 'GET, PUT, DELETE');
    return send(res, 405, { error:'method' });
  } catch(e){
    return send(res, 500, { error:'server', detail:String(e.message||e) });
  }
}
