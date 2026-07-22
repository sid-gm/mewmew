// TEMPORARY diagnostic — remove after debugging blob auth.
import { put, list, del } from '@vercel/blob';

export default async function handler(req, res){
  const env = {
    rwToken: !!process.env.BLOB_READ_WRITE_TOKEN,
    storeId: !!process.env.BLOB_STORE_ID,
    oidc:    !!process.env.VERCEL_OIDC_TOKEN
  };
  res.setHeader('content-type', 'application/json');
  const steps = {};
  const path = 'boards/_diag/selftest.json';
  try {
    const w = await put(path, JSON.stringify({ t: 1 }), {
      access: 'public', addRandomSuffix: false, allowOverwrite: true,
      contentType: 'application/json', cacheControlMaxAge: 0
    });
    steps.putUrl = w.url;
    const { blobs } = await list({ prefix: path });
    steps.listed = blobs.length;
    const hit = blobs.find(b => b.pathname === path);
    if (hit){
      const r = await fetch(hit.url + '?t=' + Date.now(), { cache: 'no-store' });
      steps.readStatus = r.status;
      await del(hit.url);
      steps.deleted = true;
    }
    res.end(JSON.stringify({ ok:true, env, steps }));
  } catch(e){
    res.end(JSON.stringify({ ok:false, env, steps, name: e && e.name, error: String(e && (e.message||e)) }));
  }
}
