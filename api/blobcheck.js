// TEMPORARY diagnostic — remove after debugging blob auth.
import { list } from '@vercel/blob';

export default async function handler(req, res){
  const env = {
    rwToken: !!process.env.BLOB_READ_WRITE_TOKEN,
    storeId: !!process.env.BLOB_STORE_ID,
    oidc:    !!process.env.VERCEL_OIDC_TOKEN,
    envKeysWithBlob: Object.keys(process.env).filter(k => /BLOB/i.test(k))
  };
  res.setHeader('content-type', 'application/json');
  try {
    const r = await list({ limit: 1 });
    res.end(JSON.stringify({ ok:true, env, blobs: r.blobs.length }));
  } catch(e){
    res.end(JSON.stringify({ ok:false, env, name: e && e.name, error: String(e && (e.message||e)) }));
  }
}
