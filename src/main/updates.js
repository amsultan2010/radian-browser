// Mises à jour : Orbe regarde si une version plus récente est publiée, et le dit.
//
// Orbe n'est pas signé par un compte de développeur (signature « ad hoc » sur
// macOS, aucune sous Windows) : il ne peut donc pas se remplacer lui-même comme
// le font Sparkle ou Squirrel. Ce module fait la version honnête :
//   - une question par jour au plus à GitHub (« dernière version publiée »), et
//     à la demande (« Rechercher les mises à jour… ») ;
//   - comparaison des numéros de version ;
//   - une note discrète dans la barre latérale, les notes de version dans les
//     réglages, un bouton vers la page de téléchargement, et le téléchargement
//     de l'archive de ce système dans le dossier Téléchargements.
//
// Ce qui est garanti :
//   - la question part vers un seul hôte (api.github.com), en HTTPS, sans
//     redirection, depuis une session à part, en mémoire : aucun cookie, aucun
//     identifiant, aucune mesure d'audience ; l'agent annoncé est « Orbe », sans
//     numéro de version ;
//   - la réponse est une donnée étrangère : taille bornée, chaque champ validé,
//     les adresses reconstruites ou refusées si elles sortent du dépôt d'Orbe,
//     les notes de version réduites à du texte (affichées comme du texte) ;
//   - l'archive téléchargée n'est jamais ouverte ni exécutée : sa taille et son
//     empreinte SHA-256 (quand GitHub la donne) sont vérifiées, puis elle est
//     montrée dans son dossier ;
//   - hors ligne, quota de GitHub dépassé, réponse inattendue : rien n'est
//     affiché pour une vérification automatique.
// Le module ne dépend pas d'Electron : tout lui est passé par `configure`.
const crypto = require('crypto');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = 'amadoubaui/orbe';
const API_HOST = 'api.github.com';
const ENDPOINT = `https://${API_HOST}/repos/${REPO}/releases/latest`;
const RELEASES = `https://github.com/${REPO}/releases`;
const DOWNLOAD_PREFIX = `${RELEASES}/download/`;
// Hôtes d'où GitHub sert le fichier d'une version, après redirection.
const ASSET_HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);
const DAY = 24 * 3600e3;
const MAX_JSON = 512 * 1024;
const MAX_NOTES = 6000;
const MAX_ASSET = 700 * 1024 * 1024;
const TIMEOUT = 20e3;
const VERSION = /^v?(\d{1,5})\.(\d{1,5})\.(\d{1,5})$/;

const deps = {
  version: '0.0.0',
  platform: process.platform,
  arch: process.arch,
  fetch: null, // (url, init) -> Response
  state: () => ({}), // objet persistant ({ checkedAt, triedAt, latest, dismissed })
  save: () => {},
  enabled: () => true, // réglage « Rechercher les mises à jour automatiquement »
  auto: false, // vérification périodique (jamais en test ni depuis les sources)
  endpoint: ENDPOINT,
  test: false, // accepte un serveur local à la place de GitHub
  downloadsDir: () => '',
  reveal: () => {},
  open: () => {},
  show: () => {}, // ouvre les réglages sur la carte des mises à jour
  changed: () => {},
  now: () => Date.now(),
  idleMs: 30e3, // téléchargement : silence au-delà duquel on abandonne
  mark: null, // remplace le marquage « venu d'Internet » (essais)
};
let checking = null;
let lastError = '';
let download = { state: 'idle' }; // idle | running | done | error
let timer = null;
let aborter = null; // téléchargement en cours

function parseVersion(v) {
  const m = VERSION.exec(String(v || '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
// > 0 si a est plus récent que b ; 0 si égaux ou illisibles.
function compare(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}

// Nom de l'archive publiée pour ce système (scripts/build-mac.js, build-win.js).
function assetName(version, platform = deps.platform, arch = deps.arch) {
  if (platform === 'darwin' && arch === 'arm64') return `Orbe-${version}-mac-arm64.zip`;
  if (platform === 'win32' && arch === 'x64') return `Orbe-${version}-windows-x64.zip`;
  return '';
}

// Texte venu de GitHub : caractères de contrôle et marques d'inversion du sens
// d'écriture retirés, longueur bornée. Il sera affiché comme du texte.
// eslint-disable-next-line no-control-regex
const text = (s, max) => String(typeof s === 'string' ? s : '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, '').slice(0, max).trim();

function localOrigin(url) {
  try { const u = new URL(url); return u.protocol === 'http:' && u.hostname === '127.0.0.1' ? u.origin : ''; } catch { return ''; }
}
// En test, le serveur local qui remplace GitHub sert aussi l'archive.
const testOrigin = () => (deps.test ? localOrigin(deps.endpoint) : '');

// Adresse de l'archive : jamais reprise de la réponse, toujours reconstruite à
// partir de parties validées (étiquette « vX.Y.Z » ou « X.Y.Z », nom exact du fichier).
function assetUrl(tag, name) {
  if (!VERSION.test(String(tag || '')) || !name || !/^[A-Za-z0-9.-]+$/.test(name)) return '';
  const local = testOrigin();
  return local ? `${local}/releases/download/${tag}/${name}` : `${DOWNLOAD_PREFIX}${tag}/${name}`;
}

// Une requête de la session des mises à jour (question, téléchargement, et chaque
// saut de redirection) n'est permise que vers ces adresses : HTTPS, hôte exact.
// En test, seul le serveur local qui joue GitHub s'y ajoute.
function hopAllowed(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.username || u.password) return false;
  if (u.protocol === 'https:' && (u.hostname === API_HOST || ASSET_HOSTS.has(u.hostname)) && (u.port === '' || u.port === '443')) return true;
  const local = testOrigin();
  return !!local && u.origin === local;
}

// Lit la réponse de GitHub (objet déjà décodé). Rend la version décrite, ou null
// si elle n'est pas une version publiée d'Orbe lisible.
function parseRelease(json, { platform = deps.platform, arch = deps.arch } = {}) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  if (json.draft === true || json.prerelease === true) return null;
  const v = parseVersion(json.tag_name);
  if (!v) return null;
  const version = v.join('.');
  const want = assetName(version, platform, arch);
  let asset = null;
  for (const a of Array.isArray(json.assets) ? json.assets.slice(0, 40) : []) {
    if (!a || typeof a !== 'object' || a.name !== want || !want) continue;
    if (!Number.isInteger(a.size) || a.size <= 0 || a.size > MAX_ASSET) continue;
    // Sans empreinte publiée, pas de téléchargement par Orbe : seule la page de la version est proposée.
    const digest = typeof a.digest === 'string' && /^sha256:[0-9a-f]{64}$/i.test(a.digest) ? a.digest.slice(7).toLowerCase() : '';
    const url = assetUrl(String(json.tag_name).trim(), want);
    if (!digest || !url) continue;
    asset = { name: want, url, size: a.size, digest };
    break;
  }
  // La page de la version : reconstruite, jamais reprise telle quelle.
  const url = `${RELEASES}/tag/v${version}`;
  const published = typeof json.published_at === 'string' && !Number.isNaN(Date.parse(json.published_at)) ? new Date(json.published_at).toISOString() : '';
  return { version, tag: String(json.tag_name).trim(), name: text(json.name, 120), notes: text(json.body, MAX_NOTES), url, publishedAt: published, asset };
}

// Ce qui a été retenu sur le disque est revalidé à la lecture.
function stored() {
  const s = deps.state() || {};
  const l = s.latest && typeof s.latest === 'object' ? s.latest : null;
  let latest = null;
  if (l && parseVersion(l.version)) {
    const version = parseVersion(l.version).join('.');
    const tag = VERSION.test(String(l.tag || '')) && parseVersion(l.tag).join('.') === version ? String(l.tag) : `v${version}`;
    const a = l.asset && typeof l.asset === 'object' && l.asset.name === assetName(version) && assetUrl(tag, l.asset.name) && Number.isInteger(l.asset.size) && l.asset.size > 0 && l.asset.size <= MAX_ASSET && /^[0-9a-f]{64}$/.test(l.asset.digest || '')
      ? { name: l.asset.name, url: assetUrl(tag, l.asset.name), size: l.asset.size, digest: l.asset.digest } : null;
    latest = { version, tag, name: text(l.name, 120), notes: text(l.notes, MAX_NOTES), url: `${RELEASES}/tag/v${version}`, publishedAt: text(l.publishedAt, 40), asset: a };
  }
  return { checkedAt: Number(s.checkedAt) || 0, triedAt: Number(s.triedAt) || 0, latest, dismissed: parseVersion(s.dismissed) ? String(s.dismissed) : '' };
}

function endpointOk(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && u.host === API_HOST && u.pathname === `/repos/${REPO}/releases/latest`) return true;
    return deps.test && !!localOrigin(url);
  } catch { return false; }
}

// Corps d'une réponse, lu en morceaux et borné.
async function readCapped(res, max) {
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) { const buf = Buffer.from(await res.arrayBuffer()); if (buf.length > max) throw new Error('tooBig'); return buf; }
  const chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { try { await reader.cancel(); } catch {} throw new Error('tooBig'); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function ask() {
  if (!deps.fetch || !endpointOk(deps.endpoint)) throw new Error('endpoint');
  const ctl = new AbortController();
  const kill = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await deps.fetch(deps.endpoint, {
      method: 'GET',
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: ctl.signal,
    });
    // 403 / 429 : quota de GitHub ; 404 : aucune version publiée.
    if (!res.ok) throw new Error('http' + res.status);
    const buf = await readCapped(res, MAX_JSON);
    let json;
    try { json = JSON.parse(buf.toString('utf8')); } catch { throw new Error('json'); }
    const release = parseRelease(json);
    if (!release) throw new Error('release');
    return release;
  } finally { clearTimeout(kill); }
}

function available(s = stored()) {
  return !!s.latest && compare(s.latest.version, deps.version) > 0;
}

function status() {
  const s = stored();
  const has = available(s);
  return {
    current: deps.version,
    enabled: !!deps.enabled(),
    checkedAt: s.checkedAt,
    checking: !!checking,
    error: lastError,
    available: has,
    latest: has ? { version: s.latest.version, name: s.latest.name, notes: s.latest.notes, url: s.latest.url, publishedAt: s.latest.publishedAt, asset: s.latest.asset ? { name: s.latest.asset.name, size: s.latest.asset.size, verified: !!s.latest.asset.digest } : null } : null,
    dismissed: has && s.dismissed === s.latest.version,
    download: { ...download },
  };
}

// Note de la barre latérale : seulement s'il y a du nouveau, non écarté, et si
// la recherche automatique n'a pas été coupée.
function note() {
  const s = stored();
  return available(s) && s.dismissed !== s.latest.version && deps.enabled() ? { version: s.latest.version } : null;
}

// `manual` : demandé par l'utilisateur (l'échec est alors dit). Sinon, au plus
// une tentative par jour, et le silence en cas d'échec.
function check({ manual = false } = {}) {
  if (checking) return checking;
  const st = deps.state();
  const now = deps.now();
  if (!manual) {
    if (!deps.enabled()) return Promise.resolve({ state: 'disabled' });
    const s = stored();
    if (now - Math.max(s.checkedAt, s.triedAt) < DAY && now >= Math.max(s.checkedAt, s.triedAt)) return Promise.resolve({ state: 'recent' });
  }
  st.triedAt = now;
  deps.save();
  lastError = '';
  checking = ask().then((release) => {
    const before = stored();
    st.checkedAt = deps.now();
    st.latest = release;
    // Une version plus récente que celle écartée se signale de nouveau.
    if (before.dismissed && compare(release.version, before.dismissed) > 0) st.dismissed = '';
    // Archive d'une version précédente déjà téléchargée : l'état repart de zéro.
    if (download.state !== 'running' && download.version !== release.version) download = { state: 'idle' };
    deps.save();
    return { state: available() ? 'available' : 'upToDate', latest: release };
  }, (err) => {
    if (manual) lastError = /^http(403|429)$/.test(err.message) ? 'rate' : 'offline';
    return { state: 'error', error: String(err && err.message) };
  }).finally(() => { checking = null; deps.changed(); });
  deps.changed();
  return checking;
}

function dismiss() {
  const s = stored();
  if (!available(s)) return false;
  deps.state().dismissed = s.latest.version;
  deps.save();
  deps.changed();
  return true;
}

function openPage() {
  const s = stored();
  deps.open(available(s) ? s.latest.url : `${RELEASES}/latest`);
  return true;
}

function freeName(dir, name) {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  for (let i = 0; i < 200; i++) {
    const p = path.join(dir, i ? `${base} (${i})${ext}` : name);
    if (!fs.existsSync(p) && !fs.existsSync(p + '.part')) return p;
  }
  return path.join(dir, `${base}-${Date.now()}${ext}`);
}

// Marque le fichier comme « venu d'Internet », comme le ferait un navigateur :
// macOS le soumettra à Gatekeeper et à XProtect (attribut com.apple.quarantine),
// Windows à SmartScreen (flux Zone.Identifier, zone 3). Rend true si la marque
// est posée et relue ; sur les autres systèmes, il n'y a rien à poser.
function quarantineValue(now = Date.now()) {
  return `0081;${Math.floor(now / 1000).toString(16)};Orbe;`;
}
function markDownloaded(file, source) {
  if (deps.mark) return Promise.resolve(deps.mark(file, source)).then((v) => !!v, () => false);
  if (deps.platform === 'darwin') {
    const run = (args) => new Promise((resolve) => execFile('/usr/bin/xattr', args, { timeout: 8000 }, (err, out) => resolve(err ? null : String(out))));
    const value = quarantineValue(deps.now());
    return run(['-w', 'com.apple.quarantine', value, file]).then((ok) => (ok === null ? false : run(['-p', 'com.apple.quarantine', file]).then((got) => got !== null && got.trim() === value)));
  }
  if (deps.platform === 'win32') {
    const zone = `[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=${source}\r\n`;
    try {
      fs.writeFileSync(file + ':Zone.Identifier', zone);
      return Promise.resolve(fs.readFileSync(file + ':Zone.Identifier', 'utf8') === zone);
    } catch { return Promise.resolve(false); }
  }
  return Promise.resolve(true);
}

// Télécharge l'archive de la version disponible dans le dossier des
// téléchargements, la vérifie, la marque comme venue d'Internet, puis la montre.
// Rien n'est ouvert. Chaque saut de redirection est contrôlé par la session
// (`hopAllowed`, branché sur webRequest par main.js) : une redirection vers un
// autre hôte, ou vers du HTTP, fait échouer la requête.
let job = null; // promesse du téléchargement en cours
function fetchAsset() {
  if (job) return Promise.resolve({ error: 'running' });
  const p = runFetch();
  job = p;
  return p.finally(() => { if (job === p) job = null; });
}
async function runFetch() {
  const s = stored();
  const asset = available(s) && s.latest.asset;
  if (!asset || !asset.digest || !deps.fetch) return { error: 'noAsset' };
  if (download.state === 'running') return { error: 'running' };
  const dir = deps.downloadsDir();
  if (!dir) return { error: 'noDir' };
  if (!hopAllowed(asset.url)) return { error: 'host' };
  const target = freeName(dir, asset.name);
  const part = target + '.part';
  const ctl = new AbortController();
  aborter = ctl;
  download = { state: 'running', version: s.latest.version, received: 0, total: asset.size };
  deps.changed();
  let out = null;
  let lastTick = 0;
  // Silence trop long (serveur muet, réseau tombé) : abandon.
  let idle = null;
  let stalled = false;
  const alive = () => { clearTimeout(idle); idle = setTimeout(() => { stalled = true; ctl.abort(); }, deps.idleMs); };
  try {
    alive();
    const res = await deps.fetch(asset.url, { method: 'GET', redirect: 'follow', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: ctl.signal });
    if (!res.ok || !res.body) throw new Error('http' + res.status);
    fs.mkdirSync(dir, { recursive: true });
    // Fichier ouvert avant la première écriture, refermé avant toute suppression :
    // un flux d'écriture ouvrirait le fichier plus tard, après un refus déjà traité,
    // et laisserait un « .part » derrière lui.
    out = await fs.promises.open(part, 'wx', 0o644);
    const hash = crypto.createHash('sha256');
    const reader = res.body.getReader();
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      alive();
      n += value.byteLength;
      if (n > asset.size) { try { await reader.cancel(); } catch {} throw new Error('size'); }
      const buf = Buffer.from(value);
      hash.update(buf);
      for (let off = 0; off < buf.length;) off += (await out.write(buf, off, buf.length - off)).bytesWritten;
      download.received = n;
      if (Date.now() - lastTick > 250) { lastTick = Date.now(); deps.changed(); }
    }
    clearTimeout(idle);
    await out.close();
    out = null;
    if (ctl.signal.aborted) throw new Error('aborted');
    if (n !== asset.size) throw new Error('size');
    if (hash.digest('hex') !== asset.digest) throw new Error('digest');
    // Marquée avant de prendre son nom définitif : il n'existe jamais d'archive sans marque.
    if (!(await markDownloaded(part, asset.url))) throw new Error('mark');
    fs.renameSync(part, target);
    download = { state: 'done', version: s.latest.version, path: target, name: path.basename(target), verified: true };
    deps.changed();
    deps.reveal(target);
    return { ok: true, path: target };
  } catch (err) {
    clearTimeout(idle);
    if (out) { try { await out.close(); } catch {} }
    try { fs.rmSync(part, { force: true }); } catch {}
    if (ctl.signal.aborted && !stalled) {
      // Annulé par l'utilisateur : retour à l'état de départ, sans message.
      download = { state: 'idle' };
      deps.changed();
      return { error: 'cancelled' };
    }
    const code = ['size', 'digest', 'mark'].includes(err.message) ? err.message : 'network';
    download = { state: 'error', version: s.latest.version, error: code };
    deps.changed();
    // Archive impossible à marquer : on ne la garde pas, la page de la version s'ouvre à la place.
    if (code === 'mark') openPage();
    return { error: code };
  } finally {
    if (aborter === ctl) aborter = null;
  }
}

// Arrête le téléchargement en cours ; rend la main une fois l'état revenu à « rien en cours ».
async function cancelDownload() {
  if (!aborter) return false;
  aborter.abort();
  if (job) await job.catch(() => {});
  return true;
}

function reveal() {
  if (download.state !== 'done' || !fs.existsSync(download.path)) return false;
  deps.reveal(download.path);
  return true;
}

// Vérification périodique : peu après le démarrage, puis toutes les six heures
// (la vérification elle-même ne part qu'une fois par jour).
function start() {
  stop();
  if (!deps.auto) return false;
  const tick = () => { check().catch(() => {}); };
  timer = setInterval(tick, 6 * 3600e3);
  if (timer.unref) timer.unref();
  const first = setTimeout(tick, 25e3);
  if (first.unref) first.unref();
  return true;
}
function stop() { clearInterval(timer); timer = null; }

function configure(d) {
  Object.assign(deps, d);
  // Un autre serveur que GitHub n'est accepté qu'en test, et seulement sur cette machine.
  if (!deps.test || !localOrigin(deps.endpoint)) deps.endpoint = ENDPOINT;
  lastError = '';
  if (aborter) aborter.abort();
  download = { state: 'idle' };
}

async function action(name) {
  switch (name) {
    case 'update:status': return status();
    case 'update:show': deps.show(); return status();
    case 'update:check': await check({ manual: true }); return status();
    case 'update:dismiss': dismiss(); return status();
    case 'update:open': openPage(); return status();
    case 'update:download': fetchAsset(); return status();
    case 'update:cancel': await cancelDownload(); return status();
    case 'update:reveal': reveal(); return status();
    default: return undefined;
  }
}

module.exports = { internals: () => ({ ...deps }), hopAllowed, assetUrl, markDownloaded, quarantineValue, cancelDownload, ENDPOINT, RELEASES, DAY, MAX_NOTES, configure, compare, parseVersion, parseRelease, assetName, check, status, note, dismiss, openPage, fetchAsset, reveal, start, stop, action, endpointOk };
