// Réglages ajoutés par la fenêtre à volets : validation de chaque valeur reçue
// de l'interface, et réglages propres à un profil (moteur de recherche,
// suggestions, archivage, dossier des téléchargements), qui priment sur le
// réglage général quand ils sont définis.
const fs = require('fs');
const path = require('path');
const { store } = require('./store');

const bool = (v) => typeof v === 'boolean';
const ARCHIVE_HOURS = [0, 12, 24, 168, 720];
const HOST = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/;

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
// '' : dossier Téléchargements du système.
const downloadDir = (v) => typeof v === 'string' && (v === '' || (v.length < 1024 && path.isAbsolute(v) && isDir(v)));
const searchEngine = (v) => typeof v === 'string' && Object.hasOwn(require('./suggest').ENGINES, v);

const hostList = (v) => Array.isArray(v) && v.length <= 200 && v.every((h) => typeof h === 'string' && HOST.test(h)) && new Set(v).size === v.length;

// Réglages qu'un profil peut redéfinir.
const PROFILE_KEYS = {
  searchEngine,
  suggestions: bool,
  archiveAfterHours: (v) => ARCHIVE_HOURS.includes(v),
  downloadDir,
};

function profileSettings(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const ids = new Set(store.state.profiles.map((p) => p.id));
  return Object.entries(v).every(([id, o]) => ids.has(id) && o && typeof o === 'object' && !Array.isArray(o)
    && Object.entries(o).every(([k, x]) => Object.hasOwn(PROFILE_KEYS, k) && PROFILE_KEYS[k](x)));
}

// Liens des autres applications : fenêtre principale (Espace le plus récent),
// petite fenêtre, ou un Espace précis (« space:<id> »).
const externalLinks = (v) => v === 'window' || v === 'little'
  || (typeof v === 'string' && v.startsWith('space:') && store.state.spaces.some((sp) => sp.id === v.slice(6)));

// --- Aiguillage des liens ----------------------------------------------------------
// Une règle nomme un site : « github.com » vaut pour github.com et ses sous-domaines
// (gist.github.com), jamais pour une adresse qui contient seulement ce texte
// (« https://evil.tld/?github.com »). Elle peut préciser un début de chemin
// (« github.com/orbe ») et un port (« localhost:3000 »). Rien d'autre n'est lu de
// l'adresse : ni ses paramètres, ni son fragment, ni son identifiant.
// `routeRule(texte)` : { host, port, path }, ou null si le texte ne nomme pas un site.
function routeRule(text) {
  if (typeof text !== 'string') return null;
  let s = text.trim().toLowerCase();
  if (!s || s.length > 200 || /[\s\\@]/.test(s)) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^\*?\./, '').replace(/[?#].*$/, '');
  const slash = s.indexOf('/');
  const site = (slash < 0 ? s : s.slice(0, slash)).replace(/^www\./, '');
  let dir = slash < 0 ? '' : s.slice(slash).replace(/\/+$/, '');
  if (!HOST.test(site)) return null;
  const m = /^(.*?)(?::(\d{1,5}))?$/.exec(site);
  // Chemin tel que le moteur le lirait (« /a/../b » -> « /b ») : la règle se compare à l'adresse normalisée.
  if (dir) { try { dir = new URL('http://x' + dir).pathname.replace(/\/+$/, ''); } catch { return null; } }
  return { host: m[1], port: m[2] || '', path: dir };
}

// Écriture normale d'une règle (« https://www.GitHub.com/Orbe/ » -> « github.com/orbe ») ; '' si elle ne nomme pas un site.
function routeText(text) {
  const r = routeRule(text);
  return r ? r.host + (r.port ? ':' + r.port : '') + r.path : '';
}

function routeMatches(rule, url) {
  const r = typeof rule === 'string' ? routeRule(rule) : rule;
  if (!r) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (host !== r.host && !host.endsWith('.' + r.host)) return false;
  if (r.port && (u.port || (u.protocol === 'https:' ? '443' : '80')) !== r.port) return false;
  if (!r.path) return true;
  const p = u.pathname.toLowerCase();
  return p === r.path || p.startsWith(r.path + '/');
}

// Destination de la première règle qui vaut pour cette adresse (identifiant d'Espace, « little »), ou null.
function routeFor(url, routes = store.state.settings.routes) {
  const rule = (Array.isArray(routes) ? routes : []).find((r) => r && typeof r.to === 'string' && routeMatches(r.match, url));
  return rule ? rule.to : null;
}

// Règles d'avant (« l'adresse contient… ») : récrites sous leur forme normale quand elles
// nomment un site (adresse entière, « www. », majuscules). Les autres (un mot, un bout
// de chemin) ne peuvent plus rien aiguiller : elles restent dans la liste, signalées
// dans les réglages, pour que l'utilisateur les corrige ou les retire.
function migrateRoutes(settings = store.state.settings) {
  if (!Array.isArray(settings.routes)) { settings.routes = []; return false; }
  let changed = false;
  settings.routes = settings.routes.filter((r) => r && typeof r.match === 'string' && typeof r.to === 'string').map((r) => {
    const text = routeText(r.match);
    if (!text || text === r.match) return r;
    changed = true;
    return { ...r, match: text };
  });
  return changed;
}

// Réglage « routes » reçu de l'interface : chaque règle nomme un site, ou figurait déjà telle quelle.
function routes(v) {
  const known = new Set((store.state.settings.routes || []).map((r) => r && r.match));
  return Array.isArray(v) && v.length <= 100 && v.every((r) => r && typeof r.match === 'string' && r.match.length <= 200 && typeof r.to === 'string' && r.to.length <= 40
    && (routeText(r.match) === r.match || known.has(r.match)));
}

const SETTABLE = {
  showToolbar: bool,
  showFullUrl: bool,
  warnOnQuit: bool,
  restoreSession: bool,
  // « haptics » : enregistré, sans effet ni case dans les réglages — Electron n'expose pas le retour haptique du pavé tactile (REG-40).
  haptics: bool,
  peekShift: bool,
  littleAltClick: bool,
  littleArchiveHours: (v) => ARCHIVE_HOURS.includes(v),
  cookieBanners: bool,
  themeData: bool,
  boostsEnabled: bool,
  boostsJs: bool,
  mediaControls: bool,
  // Sites où la vidéo ne passe pas d'elle-même en image dans l'image (menu d'une vidéo).
  pipOffSites: (v) => Array.isArray(v) && v.length <= 200 && v.every((h) => typeof h === 'string' && HOST.test(h)) && new Set(v).size === v.length,
  tabKeysFavorites: bool,
  tabKeysNinthLast: bool,
  // Veille automatique : sites que l'utilisateur garde éveillés, écrits comme une règle d'aiguillage.
  neverSleep: (v) => Array.isArray(v) && v.length <= 100 && v.every((r) => typeof r === 'string' && r.length <= 200 && routeText(r) === r) && new Set(v).size === v.length,
  devSites: hostList,
  // Mode développeur automatique sur les sites locaux, et sites locaux où il a été coupé (⌃D).
  devLocalhost: bool,
  devOff: hostList,
  downloadDir,
  // Téléchargements (downloads.js) : demander où enregistrer, PDF ouverts dans un onglet.
  downloadAsk: bool,
  downloadOpenPdf: bool,
  updateCheck: bool,
  profileSettings,
  shortcuts: (v) => require('./shortcuts').validMap(v),
};

// Valeur d'un réglage pour un profil : la sienne s'il en a une, sinon la générale.
function get(key, profileId) {
  const s = store.state.settings;
  const own = s.profileSettings && profileId && s.profileSettings[profileId];
  return own && Object.hasOwn(own, key) && Object.hasOwn(PROFILE_KEYS, key) ? own[key] : s[key];
}

// Définit (ou, avec null, rend au réglage général) un réglage de profil.
function setForProfile(profileId, key, value) {
  const s = store.state.settings;
  if (!store.state.profiles.some((p) => p.id === profileId) || !Object.hasOwn(PROFILE_KEYS, key)) return false;
  if (value !== null && !PROFILE_KEYS[key](value)) return false;
  const all = { ...(s.profileSettings || {}) };
  const own = { ...(all[profileId] || {}) };
  if (value === null) delete own[key]; else own[key] = value;
  if (Object.keys(own).length) all[profileId] = own; else delete all[profileId];
  s.profileSettings = all;
  store.save();
  return true;
}

function forgetProfile(profileId) {
  const all = store.state.settings.profileSettings;
  if (all && all[profileId]) { delete all[profileId]; store.save(); }
}

// Dossier où ranger un téléchargement du profil ; '' si le réglage ne vaut plus
// (dossier supprimé depuis) : l'appelant retombe alors sur celui du système.
function downloadDirFor(profileId) {
  const dir = get('downloadDir', profileId);
  return dir && isDir(dir) ? dir : '';
}

// Hôte d'une adresse, tel que noté dans la liste du mode développeur.
function hostOf(url) {
  try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.host.toLowerCase() : ''; } catch { return ''; }
}
// Site servi par cette machine (localhost, *.localhost, 127.0.0.1, ::1) : c'est là qu'on développe.
function isLocal(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    return h === 'localhost' || h.endsWith('.localhost') || h === '127.0.0.1' || h === '[::1]';
  } catch { return false; }
}
// Mode développeur automatique : un site local (réglage « devLocalhost »), sauf ceux où l'utilisateur l'a coupé (« devOff »).
const devAuto = (url) => store.state.settings.devLocalhost !== false && isLocal(url) && !(store.state.settings.devOff || []).includes(hostOf(url));
const devMode = (url) => { const h = hostOf(url); return !!h && ((store.state.settings.devSites || []).includes(h) || devAuto(url)); };

module.exports = { routeRule, routeText, routeMatches, routeFor, migrateRoutes, routes, SETTABLE, PROFILE_KEYS, ARCHIVE_HOURS, externalLinks, get, setForProfile, forgetProfile, downloadDirFor, hostOf, devMode, devAuto, isLocal };
