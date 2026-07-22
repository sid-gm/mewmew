// TEMPORARY diagnostic — remove once private read/write is confirmed.
import { put, del, get } from '@vercel/blob';

export default async function handler(req, res){
  res.setHeader('content-type', 'application/json');
  const out = { rwToken: !!process.env.BLOB_READ_WRITE_TOKEN };
  const path = 'boards/_diag/private.json';
  try {
    const w = await put(path, JSON.stringify({ t: 1, hi: 'mew' }), {
      access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json'
    });
    out.putUrl = w.url;
    const g = await get(path, { access: 'private', useCache: false });
    out.getStatus = g && g.statusCode;
    out.readBack = (g && g.statusCode === 200) ? await new Response(g.stream).json() : null;
    await del(w.url);
    out.deleted = true;
    out.ok = true;
  } catch(e){
    out.ok = false; out.name = e && e.name; out.error = String(e && (e.message||e));
  }
  res.end(JSON.stringify(out));
}
