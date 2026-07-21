// Server-side link unfurl — sidesteps the browser CORS block that stops the
// board from reading og:title / og:image itself. Zero dependencies (Node 18+
// global fetch). Deployed by Vercel as /api/unfurl?url=<link>.

const UA = 'Mozilla/5.0 (compatible; mewmew-unfurl/1.0; +https://mewmew.app)';

// Providers with a public oEmbed endpoint give us a reliable title + thumbnail.
const OEMBED = {
  'youtube.com':      'https://www.youtube.com/oembed?format=json&url=',
  'youtu.be':         'https://www.youtube.com/oembed?format=json&url=',
  'vimeo.com':        'https://vimeo.com/api/oembed.json?url=',
  'tiktok.com':       'https://www.tiktok.com/oembed?url=',
  'soundcloud.com':   'https://soundcloud.com/oembed?format=json&url=',
  'open.spotify.com': 'https://open.spotify.com/oembed?url='
};
const VIDEO_HOSTS = ['youtube.com','youtu.be','vimeo.com','tiktok.com','loom.com','dailymotion.com','twitch.tv','wistia.com'];

function decodeEntities(s){
  if (!s) return s;
  return s
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#0*39;|&#x0*27;|&apos;/gi,"'")
    .replace(/&#(\d+);/g, function(_,d){ return String.fromCharCode(+d); })
    .replace(/&#x([0-9a-f]+);/gi, function(_,h){ return String.fromCharCode(parseInt(h,16)); });
}

function metaTag(html, keys){
  for (var i=0;i<keys.length;i++){
    var key = keys[i].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    var re = new RegExp('<meta[^>]+(?:property|name)=["\']'+key+'["\'][^>]*>', 'i');
    var m = html.match(re);
    if (m){
      var c = m[0].match(/content=["\']([^"\']*)["\']/i);
      if (c) return decodeEntities(c[1]);
    }
  }
  return null;
}

// Basic SSRF guard — reject loopback / private / link-local targets.
function isPrivateHost(hostname){
  var h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  var m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m){
    var a = +m[1], b = +m[2];
    if (a===0 || a===10 || a===127) return true;
    if (a===169 && b===254) return true;            // link-local + cloud metadata
    if (a===172 && b>=16 && b<=31) return true;
    if (a===192 && b===168) return true;
  }
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  return false;
}

async function fetchWithTimeout(url, ms, opts){
  var ctrl = new AbortController();
  var t = setTimeout(function(){ ctrl.abort(); }, ms);
  try { return await fetch(url, Object.assign({ signal: ctrl.signal }, opts)); }
  finally { clearTimeout(t); }
}

// Read only enough of the page to reach </head> (where meta tags live), capped.
async function readCapped(res, maxBytes){
  if (!res.body || !res.body.getReader) return await res.text();
  var reader = res.body.getReader();
  var dec = new TextDecoder('utf-8');
  var out = '', received = 0;
  while (true){
    var chunk = await reader.read();
    if (chunk.done) break;
    received += chunk.value.length;
    out += dec.decode(chunk.value, { stream:true });
    if (received >= maxBytes || out.indexOf('</head>') !== -1){ try { await reader.cancel(); } catch(e){} break; }
  }
  return out;
}

function absolutize(u, base){
  if (!u) return u;
  try { return new URL(u, base).href; } catch(e){ return u; }
}

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS'){ res.status(204).end(); return; }

  var raw = (req.query && req.query.url) || '';
  var target;
  try { target = new URL(Array.isArray(raw) ? raw[0] : raw); }
  catch(e){ res.status(400).json({ error:'invalid url' }); return; }
  if (target.protocol !== 'http:' && target.protocol !== 'https:'){ res.status(400).json({ error:'unsupported protocol' }); return; }
  if (isPrivateHost(target.hostname)){ res.status(400).json({ error:'blocked host' }); return; }

  var host = target.hostname.replace(/^www\./,'');
  var result = {
    url: target.href,
    title: null, description: null, image: null,
    siteName: null, favicon: 'https://icons.duckduckgo.com/ip3/'+host+'.ico',
    kind: VIDEO_HOSTS.some(function(v){ return target.hostname === v || target.hostname.endsWith('.'+v); }) ? 'video' : 'link',
    provider: host
  };

  // 1) oEmbed (reliable title + thumbnail for supported providers)
  var oe = OEMBED[target.hostname] || OEMBED[host];
  if (oe){
    try {
      var r = await fetchWithTimeout(oe + encodeURIComponent(target.href), 6000, { headers:{ 'User-Agent':UA } });
      if (r.ok){
        var j = await r.json();
        if (j.title) result.title = j.title;
        if (j.thumbnail_url) result.image = j.thumbnail_url;
        if (j.provider_name) result.siteName = j.provider_name;
        if (j.type === 'video') result.kind = 'video';
        else if (j.type === 'photo') result.kind = 'photo';
      }
    } catch(e){}
  }

  // 2) Open Graph scrape (fills gaps / handles generic links)
  if (!result.title || !result.image || !result.siteName){
    try {
      var pr = await fetchWithTimeout(target.href, 6000, { headers:{ 'User-Agent':UA, 'Accept':'text/html' }, redirect:'follow' });
      var ct = pr.headers.get('content-type') || '';
      if (pr.ok && ct.indexOf('text/html') !== -1){
        var html = await readCapped(pr, 512*1024);
        if (!result.title){
          result.title = metaTag(html, ['og:title','twitter:title']);
          if (!result.title){ var tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); if (tm) result.title = decodeEntities(tm[1].trim()); }
        }
        result.description = metaTag(html, ['og:description','twitter:description','description']);
        if (!result.image) result.image = absolutize(metaTag(html, ['og:image:secure_url','og:image','twitter:image','twitter:image:src']), target);
        if (!result.siteName) result.siteName = metaTag(html, ['og:site_name']);
        var ogType = metaTag(html, ['og:type']);
        if (ogType && ogType.indexOf('video') !== -1) result.kind = 'video';
      }
    } catch(e){}
  }

  if (!result.siteName) result.siteName = host;
  if (!result.title) result.title = target.href;

  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.status(200).json(result);
}
