// TEMPORARY diagnostic — remove after debugging blob writes.
import { put, list, del } from '@vercel/blob';

async function tryPut(access){
  const path = `boards/_diag/${access}.json`;
  try {
    const w = await put(path, JSON.stringify({ t: 1 }), {
      access, addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json'
    });
    let readStatus = null;
    try { const r = await fetch(w.url, { cache: 'no-store' }); readStatus = r.status; }
    catch(e){ readStatus = 'fetch-threw:' + String(e && (e.message||e)); }
    try { await del(w.url); } catch(e){}
    return { ok: true, url: w.url, readStatus };
  } catch(e){
    return { ok: false, name: e && e.name, error: String(e && (e.message||e)) };
  }
}

export default async function handler(req, res){
  res.setHeader('content-type', 'application/json');
  const out = { rwToken: !!process.env.BLOB_READ_WRITE_TOKEN };
  try { const { blobs } = await list({ limit: 5 }); out.existingBlobs = blobs.map(b => b.pathname); }
  catch(e){ out.listError = String(e && (e.message||e)); }
  out.public = await tryPut('public');
  out.private = await tryPut('private');
  res.end(JSON.stringify(out));
}
