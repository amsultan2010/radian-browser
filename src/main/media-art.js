// Pochette d'un lecteur miniature : l'image qu'une page annonce par
// `navigator.mediaSession.metadata.artwork`. Tout y est hostile — l'adresse, le
// serveur qui répond, les octets.
//
// Deux portes, dans cet ordre :
//  1. le réseau (`loadArtwork`) : Orbe va chercher l'image depuis le processus
//     principal, hors des règles que le moteur applique à la page. Elles sont donc
//     refaites ici : pas d'image en http pour une page en https, pas d'adresse de la
//     machine ou du réseau local demandée par une page qui n'en vient pas, chaque
//     redirection revérifiée (trois au plus), ni témoins ni identifiants ;
//  2. le décodage (`decode`) : les dimensions sont lues dans l'en-tête, sans rien
//     décoder ; au-delà de 2048 px de côté ou de 4 millions de points, ou si ce n'est
//     ni un PNG, ni un JPEG, ni un GIF, ni un WebP, l'image n'est jamais décodée.
const crypto = require('crypto');
const nodeNet = require('net');
const { nativeImage, net } = require('electron');
const { imageSizeOf } = require('./downloads');

const ART = {
  url: 2048, // adresse d'une pochette (caractères)
  dataUrl: 400 * 1024, // pochette donnée en data:image (caractères)
  bytes: 2 * 1024 * 1024, // pochette téléchargée (octets)
  side: 2048, // côté le plus grand accepté (px)
  pixels: 4e6, // points au plus
  out: 96, // côté de la pochette envoyée à la coque (px ; doublé pour les écrans denses)
  hops: 3, // redirections suivies
  timeout: 8000, // toute la recherche (ms)
  every: 4000, // délai entre deux pochettes cherchées pour un même onglet (ms)
  cache: 24, // pochettes retenues par session
  failTtl: 60000, // un échec n'est retenté qu'après ce délai (ms)
};

// Décodeur, à part pour que les essais puissent constater qu'il n'est pas appelé.
const hooks = { decode: (buf) => nativeImage.createFromBuffer(buf) };

// --- Les octets ---------------------------------------------------------------------

// Type et dimensions annoncés par l'en-tête, ou null. Quatre formats, pas un de plus.
function header(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 30) return null;
  let type = '';
  if (buf.readUInt32BE(0) === 0x89504e47) type = 'png';
  else if (buf[0] === 0xff && buf[1] === 0xd8) type = 'jpeg';
  else if (buf.toString('latin1', 0, 4) === 'GIF8') type = 'gif';
  else if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') type = 'webp';
  if (!type) return null;
  const size = imageSizeOf(buf);
  if (!size) return null;
  let { width, height } = size;
  // GIF : l'écran logique peut être plus petit que la première image ; c'est elle qui compte.
  if (type === 'gif') {
    const frame = gifFrame(buf);
    if (!frame) return null;
    width = Math.max(width, frame.width);
    height = Math.max(height, frame.height);
  }
  return { type, width, height };
}

// Étendue de la première image d'un GIF (position + taille), ou null si on ne la trouve pas.
function gifFrame(b) {
  try {
    let pos = 13;
    if (b[10] & 0x80) pos += 3 * (2 << (b[10] & 7));
    for (let guard = 0; guard < 4096 && pos < b.length; guard++) {
      const kind = b[pos];
      if (kind === 0x2c) return { width: b.readUInt16LE(pos + 1) + b.readUInt16LE(pos + 5), height: b.readUInt16LE(pos + 3) + b.readUInt16LE(pos + 7) };
      if (kind !== 0x21) return null;
      pos += 2;
      for (;;) { const n = b[pos]; if (n === undefined) return null; pos += 1 + n; if (!n) break; }
    }
  } catch {}
  return null;
}

function acceptable(buf) {
  const h = header(buf);
  return !!h && h.width > 0 && h.height > 0 && h.width <= ART.side && h.height <= ART.side && h.width * h.height <= ART.pixels;
}

// Image recodée en petit, ou '' si ce n'en est pas une.
function shrink(img) {
  try {
    if (!img || img.isEmpty()) return '';
    const { width, height } = img.getSize();
    if (!width || !height || width > ART.side || height > ART.side) return '';
    const side = ART.out * 2;
    const small = width > side || height > side ? img.resize(width >= height ? { width: side, quality: 'good' } : { height: side, quality: 'good' }) : img;
    return 'data:image/png;base64,' + small.toPNG().toString('base64');
  } catch { return ''; }
}

// Octets reçus → data:image/png d'Orbe, ou ''. Rien n'est décodé avant l'examen de l'en-tête.
function decode(buf) {
  if (!acceptable(buf)) return '';
  try { return shrink(hooks.decode(buf)); } catch { return ''; }
}

// --- L'adresse ----------------------------------------------------------------------

// Pochette annoncée par la page : acceptable ?
function artworkKind(src) {
  if (typeof src !== 'string' || !src) return '';
  if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(src)) return src.length <= ART.dataUrl ? 'data' : '';
  if (src.length > ART.url) return '';
  try { const u = new URL(src); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? 'http' : ''; } catch { return ''; }
}

// Les seize octets d'une adresse IPv6, ou null.
function v6bytes(addr) {
  let s = String(addr).replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const tail = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) { const p = tail[2].split('.').map(Number); if (p.some((x) => x > 255)) return null; s = tail[1] + ((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16); }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const end = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - end.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array(fill).fill('0'), ...end];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  const out = [];
  for (const g of groups) { const v = parseInt(g, 16); out.push(v >> 8, v & 255); }
  return out;
}

function localV4(a, b) {
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

// Adresse de la machine, d'un réseau privé, d'un lien local ou d'une plage réservée ?
// Une adresse illisible est tenue pour locale (refusée).
function localAddress(addr) {
  const s = String(addr || '').replace(/^\[|\]$/g, '');
  if (nodeNet.isIPv4(s)) { const p = s.split('.').map(Number); return localV4(p[0], p[1]); }
  const b = v6bytes(s);
  if (!b) return true;
  if (b.slice(0, 15).every((x) => x === 0)) return true; // :: et ::1
  if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7, adresses locales uniques
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10, lien local
  if (b[0] === 0xff) return true; // diffusion groupée
  // IPv4 logée dans une IPv6 : ::ffff:a.b.c.d, ::a.b.c.d, 64:ff9b::/96 (NAT64), 2002::/16 (6to4).
  if (b.slice(0, 10).every((x) => x === 0) && (b[10] === 0xff && b[11] === 0xff || (b[10] === 0 && b[11] === 0))) return localV4(b[12], b[13]);
  if (b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) return localV4(b[12], b[13]);
  if (b[0] === 0x20 && b[1] === 0x02) return localV4(b[2], b[3]);
  return false;
}

// Nom qui ne désigne jamais une machine d'Internet.
function localName(host) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  return !h || !h.includes('.') || /(^|\.)(localhost|local|internal|lan|home\.arpa|localdomain)$/.test(h);
}

// L'hôte d'une adresse est-il local ? `addresses` : ce que son nom donne une fois résolu
// (toutes les adresses comptent). true, false, ou null si on n'en sait rien.
function hostLocal(hostname, addresses) {
  const h = String(hostname || '').replace(/^\[|\]$/g, '');
  if (nodeNet.isIP(h)) return localAddress(h);
  if (localName(h)) return true;
  if (!Array.isArray(addresses) || !addresses.length) return null;
  return addresses.some(localAddress);
}

// La règle, sans réseau : la page `pageUrl` peut-elle faire chercher `url` ?
// '' si oui, sinon la raison du refus. `pageLocal` et `targetLocal` : voir `hostLocal`.
function refusal(pageUrl, url, pageLocal, targetLocal) {
  let page;
  let target;
  try { page = new URL(pageUrl); target = new URL(url); } catch { return 'adresse'; }
  if (!/^https?:$/.test(page.protocol) || !/^https?:$/.test(target.protocol)) return 'protocole';
  if (target.username || target.password) return 'identifiants';
  if (page.protocol === 'https:' && target.protocol !== 'https:') return 'contenu mixte';
  if (targetLocal === null) return 'hôte inconnu';
  if (targetLocal && pageLocal !== true) return 'réseau local';
  return '';
}

async function resolveWith(ses, host) {
  try { const r = await ses.resolveHost(host); return (r.endpoints || []).map((e) => e.address); } catch { return []; }
}

// Une requête, sans suivre de redirection. Rend { redirect } ou { status, type, body }.
function requestOnce(ses, url, signal) {
  return new Promise((resolve) => {
    let done = false;
    let req = null;
    const finish = (v) => { if (done) return; done = true; signal.removeEventListener('abort', onAbort); resolve(v); if (!v || !v.body) { try { req.abort(); } catch {} } };
    const onAbort = () => finish(null);
    try {
      req = net.request({ url, session: ses, method: 'GET', redirect: 'manual', credentials: 'omit', useSessionCookies: false });
    } catch { resolve(null); return; }
    signal.addEventListener('abort', onAbort);
    req.on('redirect', (status, method, redirectUrl) => finish({ redirect: String(redirectUrl || '') }));
    req.on('error', () => finish(null));
    req.on('abort', () => finish(null));
    req.on('login', (info, cb) => { try { cb(); } catch {} finish(null); });
    req.on('response', (res) => {
      const one = (v) => (Array.isArray(v) ? v[0] : v) || '';
      const type = String(one(res.headers['content-type']));
      if (res.statusCode !== 200 || !/^image\//i.test(type) || Number(one(res.headers['content-length']) || 0) > ART.bytes) return finish(null);
      const chunks = [];
      let total = 0;
      res.on('data', (c) => { total += c.length; if (total > ART.bytes) return finish(null); chunks.push(c); return undefined; });
      res.on('end', () => finish({ status: 200, type, body: Buffer.concat(chunks) }));
      res.on('error', () => finish(null));
      res.on('aborted', () => finish(null));
      return undefined;
    });
    req.end();
  });
}

// Va chercher la pochette `src` pour la page `pageUrl`, dans la session de la page.
// Rend une data:image/png, ou ''. `opts.resolve(host)` : résolution de nom (essais).
async function loadArtwork(ses, src, pageUrl, opts = {}) {
  const kind = artworkKind(src);
  if (kind === 'data') return decode(Buffer.from(src.slice(src.indexOf(',') + 1), 'base64'));
  if (kind !== 'http') return '';
  const resolve = opts.resolve || ((host) => resolveWith(ses, host));
  const local = async (u) => { const h = new URL(u).hostname; const direct = hostLocal(h, null); return direct === null ? hostLocal(h, await resolve(h)) : direct; };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ART.timeout);
  try {
    const pageLocal = await local(pageUrl);
    let url = src;
    for (let hop = 0; hop <= ART.hops; hop++) {
      if (artworkKind(url) !== 'http') return '';
      const why = refusal(pageUrl, url, pageLocal, await local(url));
      if (why || ctl.signal.aborted) { if (opts.trace) opts.trace(url, why); return ''; }
      const r = await requestOnce(ses, url, ctl.signal);
      if (!r) return '';
      if (r.body) return decode(r.body);
      try { url = new URL(r.redirect, url).href; } catch { return ''; }
    }
    return '';
  } catch { return ''; } finally { clearTimeout(timer); ctl.abort(); }
}

// --- Le rythme ----------------------------------------------------------------------
// Par session : les dernières pochettes cherchées (réussies ou non), pour qu'une page
// qui alterne entre quelques images ne fasse ni requête ni décodage à chaque fois.
const caches = new WeakMap();
function cacheOf(ses) {
  let c = caches.get(ses);
  if (!c) { c = new Map(); caches.set(ses, c); }
  return c;
}
const keyFor = (pageUrl, src) => { let origin = ''; try { origin = new URL(pageUrl).origin; } catch {} return crypto.createHash('sha256').update(origin + '\n' + src).digest('hex'); };
function cached(ses, pageUrl, src, now = Date.now()) {
  const c = cacheOf(ses);
  const k = keyFor(pageUrl, src);
  const hit = c.get(k);
  if (!hit) return null;
  if (!hit.data && now - hit.at > ART.failTtl) { c.delete(k); return null; }
  c.delete(k); c.set(k, hit); // le plus récemment servi en dernier
  return hit;
}
function remember(ses, pageUrl, src, data, now = Date.now()) {
  const c = cacheOf(ses);
  c.set(keyFor(pageUrl, src), { data, at: now });
  while (c.size > ART.cache) c.delete(c.keys().next().value);
}

module.exports = { ART, hooks, header, acceptable, shrink, decode, artworkKind, localAddress, localName, hostLocal, refusal, loadArtwork, cached, remember };
