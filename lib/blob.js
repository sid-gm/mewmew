// Vercel Blob storage for boards. Single-user, no multiplayer:
//   boards/{owner}/index.json  → list metadata [ {id,name,thumb,updatedAt,items} ]
//   boards/{owner}/{id}.json   → one board canvas { items,arrows,pan,scale,uid }
// A board IS a JSON document, so we never query inside it — just read/write whole.
import { put, list, del } from '@vercel/blob';
import { randomUUID } from 'node:crypto';

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
export function haveBlob(){ return !!TOKEN; }

// --- request helpers ---
export function owner(req){
  const o = req.headers['x-mew-owner'];
  return (typeof o === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(o)) ? o : null;
}
export function safeId(id){
  return (typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id)) ? id : null;
}
export function newId(){ return randomUUID(); }
export function cleanName(n){
  return (typeof n === 'string' && n.trim()) ? n.trim().slice(0,120) : 'Untitled';
}
export async function body(req){
  if (req.body != null) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}
export function send(res, code, obj){
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(obj));
}

// --- paths ---
const indexPath = (o)     => `boards/${o}/index.json`;
export const boardPath = (o, id) => `boards/${o}/${id}.json`;

// --- blob read / write ---
// Resolve a pathname → its public URL via list (blob URLs carry a store-specific
// host, so we can't construct them), then fetch. Cache-bust because we overwrite
// in place and CDN would otherwise serve a stale board.
async function urlFor(pathname){
  const { blobs } = await list({ prefix: pathname, token: TOKEN });
  const hit = blobs.find(b => b.pathname === pathname);
  return hit ? hit.url : null;
}
export async function readJson(pathname){
  const url = await urlFor(pathname);
  if (!url) return null;
  const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
  return r.ok ? r.json() : null;
}
export async function writeJson(pathname, obj){
  const { url } = await put(pathname, JSON.stringify(obj), {
    access: 'public', token: TOKEN,
    addRandomSuffix: false, allowOverwrite: true,
    contentType: 'application/json', cacheControlMaxAge: 0
  });
  return url;
}
export async function delPrefix(prefix){
  const { blobs } = await list({ prefix, token: TOKEN });
  if (blobs.length) await del(blobs.map(b => b.url), { token: TOKEN });
}

// --- index (board list) ---
export async function getIndex(o){
  const idx = await readJson(indexPath(o));
  return Array.isArray(idx) ? idx : [];
}
export async function putIndex(o, arr){
  arr.sort((a,b) => String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  await writeJson(indexPath(o), arr);
}

// Keep only what a board *is*; prune dangling arrows (no FK in a blob).
export function sanitize(data){
  const d = data && typeof data === 'object' ? data : {};
  const items = Array.isArray(d.items) ? d.items : [];
  const ids = new Set(items.map(it => it && it.id));
  const arrows = (Array.isArray(d.arrows) ? d.arrows : [])
    .filter(a => a && ids.has(a.from) && ids.has(a.to));
  return {
    items, arrows,
    pan: d.pan && typeof d.pan === 'object' ? d.pan : { x:0, y:0 },
    scale: typeof d.scale === 'number' ? d.scale : 1,
    uid: typeof d.uid === 'number' ? d.uid : 10
  };
}
