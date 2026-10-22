// Bloqueur de publicités et de traqueurs : blocage par nom de domaine.
//
// Une requête est annulée quand son hôte (ou l'un de ses domaines parents)
// figure dans assets/blocklist.txt ET qu'elle part vers un autre site que la
// page affichée. Pas de filtrage cosmétique dans cette version.
//
// Ce qui n'est jamais bloqué :
//   - la navigation principale (taper un domaine publicitaire l'affiche) ;
//   - les requêtes vers le site lui-même (même domaine enregistrable) ;
//   - tout ce qui n'est pas http, https, ws ou wss (orbe://, file://, data:…) ;
//   - les sites que l'utilisateur a mis en liste d'exceptions.
//
// ATTENTION — Electron n'accepte qu'UN SEUL écouteur `onBeforeRequest` par
// session : en poser un second remplace le premier sans prévenir. `attach()`
// occupe cet emplacement. Si un autre module doit aussi filtrer les requêtes,
// ne pas appeler `attach()` : poser un écouteur unique qui appelle `decide()`
// (voir en bas de fichier) puis applique ses propres règles.
//
// Le module ne dépend pas d'Electron : la session est passée à `attach()`, si
// bien que la logique se teste avec Node seul (tests/adblock.test.js).
const fs = require('fs');
const path = require('path');

const FILTER = { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] };
const CANCEL = { cancel: true };
const PASS = {};
const CACHE_MAX = 4096;
const NOTIFY_MS = 250;

let listPath = path.join(__dirname, '../../assets/blocklist.txt');
let domains = null; // Set des domaines bloqués, chargé au premier besoin
let loading = null;
let loadMs = 0;
let enabled = true;
let allow = new Set(); // domaines enregistrables où rien n'est bloqué
let onChange = null;
let onCount = null;

const verdicts = new Map(); // hôte -> listé ? (évite de remonter les parents à chaque requête)
const attached = new WeakSet();
const sessions = []; // WeakRef : une session privée fermée doit pouvoir être libérée
const watched = new WeakSet();
const blockedByTab = new Map();
let blockedTotal = 0;
const dirty = new Set();
let notifyTimer = null;

// --- Hôtes et domaines ------------------------------------------------------

// Hôte d'une URL http(s)/ws(s), en minuscules, sans port ni identifiants.
// Renvoie '' pour tout autre schéma. Écrit à la main : `new URL()` coûte
// plusieurs fois plus cher et cette fonction est appelée à chaque requête.
function hostOf(url) {
  if (typeof url !== 'string') return '';
  let start;
  if (url.startsWith('https://')) start = 8;
  else if (url.startsWith('http://')) start = 7;
  else if (url.startsWith('wss://')) start = 6;
  else if (url.startsWith('ws://')) start = 5;
  else {
    const m = /^(?:https?|wss?):\/\//i.exec(url);
    if (!m) return '';
    start = m[0].length;
  }
  let end = url.length;
  let colon = -1;
  for (let i = start; i < end; i++) {
    const c = url.charCodeAt(i);
    if (c === 47 || c === 63 || c === 35 || c === 92) { end = i; break; } // / ? # \
    if (c === 64) { start = i + 1; colon = -1; } // identifiants@
    else if (c === 58 && colon === -1) colon = i;
  }
  if (url.charCodeAt(start) === 91) { // [IPv6]
    const close = url.indexOf(']', start);
    if (close !== -1 && close < end) end = close + 1;
  } else if (colon !== -1) end = colon;
  if (end > start && url.charCodeAt(end - 1) === 46) end -= 1; // point final
  return url.slice(start, end).toLowerCase();
}

// Suffixes en deux parties : `co.uk`, `com.br`, `co.jp`, `com.au`… On reconnaît
// un domaine national (deux lettres) précédé d'un libellé générique.
const CC_SECOND = new Set(['co', 'com', 'net', 'org', 'gov', 'gouv', 'edu', 'ac', 'or', 'ne', 'go', 'gob', 'gv', 'mil', 'nom', 'ltd', 'plc', 'sch', 'asso', 'govt', 'nhs', 'police', 'lg', 'ed', 'ad', 'gr', 'in', 'res', 'firm', 'gen', 'ind', 'id', 'web', 'info', 'biz', 'nic', 'int', 'k12', 'tm', 'art', 'adv', 'blog', 'eco', 'app', 'dev']);
// Hébergeurs où chaque sous-domaine appartient à quelqu'un d'autre.
const HOSTING = new Set(['github.io', 'gitlab.io', 'blogspot.com', 'wordpress.com', 'herokuapp.com', 'cloudfront.net', 'amazonaws.com', 'appspot.com', 'web.app', 'firebaseapp.com', 'pages.dev', 'workers.dev', 'vercel.app', 'netlify.app', 'azurewebsites.net', 'azureedge.net', 'windows.net', 'fastly.net', 'akamaihd.net', 'akamaized.net', 'edgekey.net', 'edgesuite.net', 'cloudflare.net', 'b-cdn.net', 'onrender.com', 'fly.dev', 'glitch.me', 'repl.co', 'ngrok.io', 'myshopify.com', 'tumblr.com', 'substack.com', 'free.fr', 'uk.com', 'eu.com', 'us.com', 'de.com', 'co.com', 'r2.dev', 'translate.goog', 'googleusercontent.com', '000webhostapp.com', 'altervista.org', 'wixsite.com', 'weebly.com']);

function isSuffix(two) {
  if (HOSTING.has(two)) return true;
  const dot = two.indexOf('.');
  return two.length - dot - 1 === 2 && CC_SECOND.has(two.slice(0, dot));
}

// Domaine enregistrable (eTLD+1) approché : `a.b.exemple.co.uk` -> `exemple.co.uk`.
// LIMITE : ce n'est pas la Public Suffix List (9 000 règles), seulement une
// heuristique. Un suffixe inconnu fait prendre deux sites voisins pour un seul
// (leurs requêtes croisées ne sont alors pas bloquées) ; un faux suffixe fait
// l'inverse. Dans les deux cas l'erreur ne touche que des domaines déjà listés.
function registrableDomain(host) {
  if (!host || host.charCodeAt(0) === 91 || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return host || '';
  const p1 = host.lastIndexOf('.');
  if (p1 <= 0) return host;
  const p2 = host.lastIndexOf('.', p1 - 1);
  if (p2 === -1) return host;
  const two = host.slice(p2 + 1);
  if (!isSuffix(two)) return two;
  const p3 = host.lastIndexOf('.', p2 - 1);
  return p3 === -1 ? host : host.slice(p3 + 1);
}

function sameSite(a, b) {
  return a === b || registrableDomain(a) === registrableDomain(b);
}

// --- Liste de blocage -------------------------------------------------------

// Un domaine par ligne, les commentaires (#) en tête de fichier. Lu en latin1 :
// les domaines sont en ASCII et V8 les garde ainsi sur un octet par caractère.
function parse(text) {
  let i = 0;
  while (text.charCodeAt(i) === 35 || text.charCodeAt(i) === 10 || text.charCodeAt(i) === 13) {
    const nl = text.indexOf('\n', i);
    if (nl === -1) return new Set();
    i = nl + 1;
  }
  // Fins de ligne Windows tolérées (dépôt cloné avec conversion automatique).
  const body = text.slice(i);
  const set = new Set(body.includes('\r') ? body.split(/\r?\n/) : body.split('\n'));
  set.delete('');
  return set;
}

function install(set, t0) {
  domains = set;
  verdicts.clear();
  loadMs = t0 == null ? 0 : performance.now() - t0;
}

// Chargement bloquant (tests, outils). Le navigateur passe par `load()`.
function loadSync() {
  if (domains) return domains;
  const t0 = performance.now();
  try {
    install(parse(fs.readFileSync(listPath, 'latin1')), t0);
  } catch (err) {
    console.error('[orbe] liste de blocage illisible', err.message);
    install(new Set(), t0);
  }
  return domains;
}

// Chargement différé : déclenché par la première requête, jamais au démarrage.
// La lecture est asynchrone ; en attendant (quelques millisecondes), les
// requêtes passent. Appeler `load()` une fois la fenêtre affichée évite que
// les premières publicités de la première page s'y glissent.
function load() {
  if (domains) return Promise.resolve(domains);
  if (loading) return loading;
  const t0 = performance.now();
  loading = fs.promises.readFile(listPath, 'latin1').then(
    (text) => { if (!domains) install(parse(text), t0); },
    (err) => { console.error('[orbe] liste de blocage illisible', err.message); if (!domains) install(new Set(), t0); },
  ).then(() => { loading = null; return domains; });
  return loading;
}

// Remplace la liste en mémoire (tests, liste personnalisée).
function setDomains(list) {
  install(new Set(list), null);
}

// L'hôte ou l'un de ses domaines parents est-il listé ?
function isListed(host) {
  let hit = verdicts.get(host);
  if (hit !== undefined) return hit;
  hit = false;
  let h = host;
  let dot = h.indexOf('.');
  while (dot !== -1) { // un libellé seul (`com`) n'est jamais listé
    if (domains.has(h)) { hit = true; break; }
    h = h.slice(dot + 1);
    dot = h.indexOf('.');
  }
  if (verdicts.size >= CACHE_MAX) verdicts.clear();
  verdicts.set(host, hit);
  return hit;
}

// --- Décision ---------------------------------------------------------------

// `host` est déjà reconnu comme listé : reste à voir d'où part la requête.
function isThirdParty(host, firstParty) {
  if (!firstParty) return true;
  if (sameSite(host, firstParty)) return false;
  return !(allow.size && allow.has(registrableDomain(firstParty)));
}

// Fonction pure : faut-il bloquer `url`, demandée par la page `firstPartyUrl` ?
// Ne tient pas compte de `isEnabled()` (c'est l'écouteur qui est retiré).
// Sans `firstPartyUrl`, aucune exception « même site » ne peut s'appliquer.
function shouldBlock(url, { firstPartyUrl, resourceType } = {}) {
  if (resourceType === 'mainFrame') return false;
  if (!domains) loadSync();
  const host = hostOf(url);
  return !!host && isListed(host) && isThirdParty(host, hostOf(firstPartyUrl));
}

// Hôte de la page affichée dans l'onglet d'où part la requête. Dans l'ordre :
//   1. `frame.top.url` — le plus fiable, juste même depuis une iframe imbriquée ;
//   2. `webContents.getURL()` — si le cadre a déjà disparu ;
//   3. `initiatorOrigin` puis `referrer` — service workers, qui n'ont ni cadre
//      ni webContents : leur origine est celle du site qui les a installés.
function firstPartyHost(details) {
  let url = '';
  const frame = details.frame;
  if (frame) {
    try { url = (frame.top || frame).url; } catch {}
  }
  if (!url) {
    const wc = details.webContents;
    if (wc) {
      try { if (!wc.isDestroyed()) url = wc.getURL(); } catch {}
    }
  }
  return hostOf(url) || hostOf(details.initiatorOrigin) || hostOf(details.referrer);
}

// Décision pour un `details` de webRequest, compteurs compris. La recherche
// dans la liste passe en premier : l'immense majorité des requêtes s'arrête
// là, sans jamais interroger le cadre ni l'onglet.
function decide(details) {
  if (!enabled || details.resourceType === 'mainFrame') return false;
  if (!domains) { load(); return false; }
  const host = hostOf(details.url);
  if (!host || !isListed(host)) return false;
  if (!isThirdParty(host, firstPartyHost(details))) return false;
  count(details);
  return true;
}

function listener(details, callback) {
  callback(decide(details) ? CANCEL : PASS);
}

// --- Compteurs --------------------------------------------------------------

function notify(id) {
  if (!onCount) return;
  dirty.add(id);
  if (notifyTimer) return;
  // Regroupé : une page chargée de publicités ne doit pas inonder l'interface.
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    const ids = [...dirty];
    dirty.clear();
    for (const tab of ids) {
      try { onCount(tab, blockedByTab.get(tab) || 0); } catch (err) { console.error('[orbe] adblock onCount', err); }
    }
  }, NOTIFY_MS);
  if (notifyTimer.unref) notifyTimer.unref();
}

function resetTab(webContentsId) {
  if (blockedByTab.delete(webContentsId)) notify(webContentsId);
}

// Remise à zéro automatique quand l'onglet change de page, oubli à sa fermeture.
function watch(wc, id) {
  if (!wc || watched.has(wc)) return;
  watched.add(wc);
  try {
    wc.on('did-navigate', () => resetTab(id));
    wc.once('destroyed', () => { blockedByTab.delete(id); dirty.delete(id); });
  } catch {}
}

function count(details) {
  blockedTotal += 1;
  const id = details.webContentsId;
  if (id == null) return; // service worker : compté dans le total seulement
  const n = (blockedByTab.get(id) || 0) + 1;
  blockedByTab.set(id, n);
  if (n === 1) watch(details.webContents, id);
  notify(id);
}

function stats() {
  return { blockedTotal, blockedByTab: new Map(blockedByTab) };
}

// --- Sessions et réglages ---------------------------------------------------

function hook(ses, on) {
  try {
    if (on) ses.webRequest.onBeforeRequest(FILTER, listener);
    else ses.webRequest.onBeforeRequest(null);
  } catch (err) {
    console.error('[orbe] adblock', err);
  }
}

// Installe le bloqueur sur une session (sans effet la seconde fois).
function attach(ses) {
  if (!ses || attached.has(ses)) return ses;
  attached.add(ses);
  sessions.push(new WeakRef(ses));
  if (enabled) hook(ses, true);
  return ses;
}

function eachSession(fn) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const ses = sessions[i].deref();
    if (ses) fn(ses); else sessions.splice(i, 1);
  }
}

function changed() {
  if (!onChange) return;
  try { onChange({ enabled, allowlist: [...allow].sort() }); } catch (err) { console.error('[orbe] adblock onChange', err); }
}

// Désactivé, l'écouteur est retiré : plus aucun coût par requête. La bascule
// vaut tout de suite pour les pages déjà ouvertes (vérifié sous Electron 44) ;
// ce qui est déjà chargé reste affiché jusqu'au rechargement de l'onglet.
function apply(value) {
  value = !!value;
  if (value === enabled) return false;
  enabled = value;
  eachSession((ses) => hook(ses, enabled));
  return true;
}

function setEnabled(value) {
  if (apply(value)) changed();
}

const isEnabled = () => enabled;

// Accepte un hôte ou une URL ; la clé est le domaine enregistrable, pour que
// l'exception posée sur `www.exemple.fr` vaille aussi pour `exemple.fr`.
function siteKey(hostOrUrl) {
  const s = String(hostOrUrl || '').trim();
  return registrableDomain(hostOf(s) || hostOf('http://' + s));
}

function allowSite(host, allowed = true) {
  const key = siteKey(host);
  if (!key) return;
  if (allowed ? allow.has(key) : !allow.has(key)) return;
  if (allowed) allow.add(key); else allow.delete(key);
  changed();
}

function isSiteAllowed(host) {
  return allow.has(siteKey(host));
}

// L'appelant possède la persistance : il fournit l'état enregistré et reçoit
// `onChange({ enabled, allowlist })` à chaque modification par l'utilisateur.
// `onCount(webContentsId, n)` signale (au plus 4 fois par seconde et par
// onglet) le nombre de requêtes bloquées sur la page affichée.
function configure(opts = {}) {
  if (opts.onChange !== undefined) onChange = opts.onChange;
  if (opts.onCount !== undefined) onCount = opts.onCount;
  if (opts.listPath && opts.listPath !== listPath) { listPath = opts.listPath; domains = null; verdicts.clear(); }
  if (Array.isArray(opts.allowlist)) allow = new Set(opts.allowlist.map(siteKey).filter(Boolean));
  if (opts.enabled !== undefined) apply(opts.enabled);
}

const info = () => ({ loaded: !!domains, domains: domains ? domains.size : 0, loadMs, listPath });

module.exports = {
  attach, configure, setEnabled, isEnabled, allowSite, isSiteAllowed, stats, resetTab, shouldBlock,
  // Pour composer avec un autre écouteur onBeforeRequest, et pour les outils :
  decide, FILTER, load, loadSync, setDomains, info, hostOf, registrableDomain, isSuffix,
};
