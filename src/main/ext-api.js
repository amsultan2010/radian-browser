// Couche de compatibilité chrome.* pour les extensions : processus principal.
//
// Electron charge les extensions mais n'implémente qu'une partie des API de
// Chrome (`runtime`, `storage`, `scripting`, `alarms`, un peu de `tabs`…). Ce
// module fournit le reste, branché sur le modèle d'Orbe : `permissions`,
// `tabs`, `windows`, `cookies`, `contextMenus`, `action`, `webNavigation`,
// `notifications`, `fontSettings`, `commands`. D'autres modules en ajoutent
// (`extend`) : ext-panel.js (`sidePanel`), ext-debug.js (`debugger`), ext-more.js
// (`identity`, `tabGroups`, `downloads`, raccourcis des commandes).
//
// Fonctionnement :
//   - `attach(session)` enregistre sur la session le script src/preload/ext.js
//     (types « frame » et « service-worker »), qui complète l'objet `chrome`
//     des pages d'extension et des service workers ;
//   - chaque appel arrive ici par IPC. L'extension appelante est déduite de
//     l'émetteur (origine du cadre, ou portée du service worker), puis les
//     autorisations de son manifeste sont vérifiées ;
//   - les événements (`tabs.onUpdated`…) ne partent que vers les contextes qui
//     les écoutent ; un service worker endormi est réveillé pour les recevoir.
//
// Ce module ne connaît pas les fenêtres d'Orbe : il passe par `host`, que
// src/main/ext-host.js remplit (onglets, fenêtres, fenêtre surgissante).
//
// Écrit pour Orbe à partir de la documentation publique des API d'extension de
// Chrome et de celle d'Electron ; aucun code tiers.
const { ipcMain, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

const CHANNEL = 'orbe-ext';
const EVENT = 'orbe-ext-event';
const PRELOAD = path.join(__dirname, '../preload/ext.js');
const HOST_PATTERN = /^(<all_urls>|(\*|https?|wss?|ftp|file|chrome-extension):\/\/)/;

// Ce que l'application hôte doit fournir. Voir ext-host.js.
const host = {
  tabs: () => [], // [{ id, wc, session, windowId, active, index, pinned, incognito, title, url, favIconUrl, status, audible, muted, width, height, lastAccessed }]
  windows: () => [], // [{ id, focused, incognito, state, bounds }]
  currentWindowId: () => -1, // (webContents appelant ou null) -> identifiant de fenêtre
  createTab: () => null, // ({ url, active, windowId }) -> identifiant d'onglet
  removeTab: () => {},
  activateTab: () => {},
  focusWindow: () => {},
  openPopup: () => false, // (session, idExtension) -> bool
  confirmPermissions: async () => false, // (extension, [noms]) -> bool
  groupOf: () => -1, // (session, identifiant d'onglet) -> groupe d'onglets (ext-more.js)
  shortcutOf: () => '', // (session, idExtension, nom de commande) -> raccourci affiché
  manifestOf: (ext) => ext.manifest || {}, // manifeste d'origine, si Orbe l'a complété (ext-access.js)
};
const hooks = { actionChanged: () => {} };

const attached = new Set(); // sessions équipées
const states = new WeakMap(); // session -> Map(id extension -> état)
let stateFile = null;
let disk = {}; // { id: { granted: [noms], menus: [éléments] } }, commun aux profils
let saveTimer = null;
let ipcReady = false;

function fail(message) {
  return new Error(message);
}

// --- État --------------------------------------------------------------------

function configure(options = {}) {
  if (options.dir) {
    stateFile = path.join(path.resolve(options.dir), 'api-state.json');
    try {
      const raw = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      disk = raw && typeof raw === 'object' ? raw : {};
    } catch {
      disk = {};
    }
  }
}

function persist() {
  if (!stateFile || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(stateFile), { recursive: true });
      fs.writeFileSync(stateFile + '.tmp', JSON.stringify(disk));
      fs.renameSync(stateFile + '.tmp', stateFile);
    } catch {}
  }, 200);
}

const diskOf = (id) => disk[id] || (disk[id] = { granted: [], menus: [] });

function stateOf(ses, id) {
  let map = states.get(ses);
  if (!map) states.set(ses, (map = new Map()));
  let st = map.get(id);
  if (!st) {
    const saved = disk[id] || {};
    st = {
      frames: new Map(), // WebFrameMain -> Set(noms d'événements écoutés)
      worker: new Set(), // événements écoutés par le service worker
      menus: new Map((Array.isArray(saved.menus) ? saved.menus : []).map((m) => [String(m.id), m])),
      action: { global: {}, tabs: new Map(), defaultIcon: null },
      activeTabs: new Set(), // onglets ouverts à l'extension par un geste (activeTab)
      activeOrigins: new Map(), // …et le site qu'ils montraient alors : l'accès ne vaut que pour lui
      notifications: new Map(),
    };
    map.set(id, st);
  }
  return st;
}

function context(ses, id, wc) {
  const ext = ses.extensions.getExtension(id);
  if (!ext) return null;
  return { ses, id, ext, manifest: host.manifestOf(ext), wc: wc || null, st: stateOf(ses, id) };
}

// « activeTab » : un geste de l'utilisateur ouvre l'onglet à l'extension, tant
// qu'il reste sur le même site.
function grantTab(st, t) {
  st.activeTabs.add(t.id);
  try { st.activeOrigins.set(t.id, new URL(t.url).origin); } catch {}
}

// --- Autorisations -----------------------------------------------------------

const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Motif d'URL de Chrome (« https://*.exemple.fr/* », « <all_urls> »).
function matchPattern(pattern, url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  const scheme = u.protocol.slice(0, -1);
  if (pattern === '<all_urls>') return /^(https?|wss?|ftp|file)$/.test(scheme);
  const m = /^(\*|https?|wss?|ftp|file|chrome-extension):\/\/(\*|[^/]*)(\/.*)$/.exec(pattern);
  if (!m) return false;
  if (m[1] === '*' ? !/^(https?|wss?)$/.test(scheme) : m[1] !== scheme) return false;
  const want = m[2].toLowerCase().replace(/:(\d+|\*)$/, '');
  const hostName = u.hostname.toLowerCase();
  if (want !== '*' && scheme !== 'file') {
    if (want.startsWith('*.')) {
      const base = want.slice(2);
      if (hostName !== base && !hostName.endsWith('.' + base)) return false;
    } else if (want !== hostName) return false;
  }
  return new RegExp('^' + m[3].split('*').map(escapeRe).join('.*') + '$').test(u.pathname + u.search);
}

function requiredPermissions(manifest) {
  return strings(manifest.permissions).filter((p) => !HOST_PATTERN.test(p));
}

function optionalPermissions(manifest) {
  return strings(manifest.optional_permissions).filter((p) => !HOST_PATTERN.test(p));
}

function requiredHosts(manifest) {
  return [...strings(manifest.host_permissions), ...strings(manifest.permissions).filter((p) => HOST_PATTERN.test(p))];
}

function hasPermission(ctx, name) {
  return requiredPermissions(ctx.manifest).includes(name) || (optionalPermissions(ctx.manifest).includes(name) && diskOf(ctx.id).granted.includes(name));
}

function need(ctx, name) {
  if (!hasPermission(ctx, name)) throw fail(`L'extension n'a pas l'autorisation « ${name} »`);
}

function hostAccess(ctx, url) {
  if (!url) return false;
  if (url.startsWith(ctx.ext.url)) return true;
  return requiredHosts(ctx.manifest).some((p) => matchPattern(p, url));
}

// Une origine demandée est-elle déjà couverte par le manifeste ?
function originCovered(ctx, origin) {
  const hosts = requiredHosts(ctx.manifest);
  if (hosts.includes(origin) || hosts.includes('<all_urls>')) return true;
  if (origin === '<all_urls>') return false;
  const sample = origin.replace(/^\*:/, 'https:').replace('://*.', '://').replace('://*/', '://exemple.invalid/').replace(/\*/g, '');
  return hosts.some((p) => matchPattern(p, sample));
}

// --- Onglets et fenêtres -----------------------------------------------------

const visibleTabs = (ctx) => host.tabs().filter((t) => t.session === ctx.ses);

function canSeeTab(ctx, t) {
  return hasPermission(ctx, 'tabs') || hostAccess(ctx, t.url) || ctx.st.activeTabs.has(t.id);
}

function tabObject(ctx, t) {
  const o = {
    id: t.id, index: t.index, windowId: t.windowId, active: t.active, highlighted: t.active, selected: t.active,
    pinned: t.pinned, incognito: t.incognito, audible: t.audible, discarded: false, autoDiscardable: true, frozen: false,
    groupId: host.groupOf(ctx.ses, t.id), mutedInfo: { muted: t.muted }, status: t.status, width: t.width, height: t.height, lastAccessed: t.lastAccessed,
  };
  if (canSeeTab(ctx, t)) {
    o.url = t.url;
    o.title = t.title;
    if (t.favIconUrl) o.favIconUrl = t.favIconUrl;
  }
  return o;
}

function findTab(ctx, id) {
  const t = visibleTabs(ctx).find((x) => x.id === id);
  if (!t) throw fail(`No tab with id: ${id}.`);
  return t;
}

// Onglet visé : celui dont l'identifiant est donné, sinon l'onglet actif de la
// fenêtre courante.
function targetTab(ctx, id) {
  if (typeof id === 'number') return findTab(ctx, id);
  const current = host.currentWindowId(ctx.wc);
  const tabs = visibleTabs(ctx);
  const t = tabs.find((x) => x.active && x.windowId === current) || tabs.find((x) => x.active);
  if (!t) throw fail('No active tab.');
  return t;
}

// Adresse qu'une extension peut ouvrir : web, ou l'une de ses propres pages.
function safeUrl(ctx, input) {
  if (input == null || input === '') return 'about:blank';
  let u;
  try { u = new URL(String(input), ctx.ext.url); } catch { throw fail(`Invalid url: "${input}".`); }
  if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
  if (u.protocol === 'chrome-extension:' && u.host === ctx.id) return u.href;
  if (u.href === 'about:blank') return u.href;
  throw fail(`Adresse refusée : ${u.protocol}`);
}

function windowObject(ctx, w, populate) {
  const b = w.bounds || {};
  const o = { id: w.id, focused: !!w.focused, top: b.y || 0, left: b.x || 0, width: b.width || 0, height: b.height || 0, incognito: !!w.incognito, type: 'normal', state: w.state || 'normal', alwaysOnTop: false };
  if (populate) o.tabs = visibleTabs(ctx).filter((t) => t.windowId === w.id).map((t) => tabObject(ctx, t));
  return o;
}

function findWindow(ctx, id) {
  const wanted = id === -2 || id == null ? host.currentWindowId(ctx.wc) : id;
  const w = host.windows().find((x) => x.id === wanted);
  if (!w) throw fail(`No window with id: ${id}.`);
  return w;
}

const globMatch = (glob, text) => new RegExp('^' + String(glob).split('*').map(escapeRe).join('.*') + '$').test(text || '');

// --- Cookies -----------------------------------------------------------------

const cookieUrl = (c) => `http${c.secure ? 's' : ''}://${String(c.domain || '').replace(/^\./, '')}${c.path || '/'}`;

function cookieObject(c) {
  const o = { name: c.name, value: c.value, domain: c.domain || '', hostOnly: !!c.hostOnly, path: c.path || '/', secure: !!c.secure, httpOnly: !!c.httpOnly, sameSite: c.sameSite || 'unspecified', session: !!c.session, storeId: '0' };
  if (!c.session && typeof c.expirationDate === 'number') o.expirationDate = c.expirationDate;
  return o;
}

function needCookieHost(ctx, url) {
  need(ctx, 'cookies');
  if (!/^https?:/i.test(String(url || '')) || !hostAccess(ctx, url)) throw fail(`No host permissions for cookies at url: "${url}".`);
}

// --- Bouton de l'extension (chrome.action) ------------------------------------

const NAMED = { black: [0, 0, 0, 255], white: [255, 255, 255, 255], red: [255, 0, 0, 255], green: [0, 128, 0, 255], blue: [0, 0, 255, 255], yellow: [255, 255, 0, 255], orange: [255, 165, 0, 255], gray: [128, 128, 128, 255], grey: [128, 128, 128, 255], transparent: [0, 0, 0, 0] };

// Couleur de pastille : tableau [r, v, b, a] ou texte CSS simple.
function parseColor(v) {
  const byte = (n) => Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
  if (Array.isArray(v)) return [byte(v[0]), byte(v[1]), byte(v[2]), v.length > 3 ? byte(v[3]) : 255];
  const s = String(v || '').trim().toLowerCase();
  if (NAMED[s]) return NAMED[s];
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
    if (h.length === 6 || h.length === 8) return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(h.length === 8 ? parseInt(h.slice(6), 16) : 255);
  }
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length >= 3) return [byte(p[0]), byte(p[1]), byte(p[2]), p.length > 3 ? byte(p[3] * 255) : 255];
  }
  return [95, 99, 104, 255];
}

const cssColor = (c) => (c ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${(c[3] / 255).toFixed(3)})` : '');

// Fichier de l'extension -> image « data: », ou '' s'il sort du dossier.
function iconFromPath(ext, rel) {
  if (typeof rel !== 'string' || !rel) return '';
  const root = path.resolve(ext.path);
  const file = path.resolve(root, rel.replace(/^[\\/]+/, '').split(/[?#]/)[0]);
  if (!file.startsWith(root + path.sep)) return '';
  try {
    const img = nativeImage.createFromPath(file);
    if (img.isEmpty()) return '';
    return img.resize({ width: 32, height: 32, quality: 'best' }).toDataURL();
  } catch {
    return '';
  }
}

function pickIconPath(icons) {
  if (typeof icons === 'string') return icons;
  if (!icons || typeof icons !== 'object') return '';
  const sizes = Object.keys(icons).filter((k) => typeof icons[k] === 'string').sort((a, b) => Math.abs(Number(a) - 32) - Math.abs(Number(b) - 32));
  return sizes.length ? icons[sizes[0]] : '';
}

function iconFromPixels(p) {
  if (!p || !Array.isArray(p.data)) return '';
  const { width, height } = p;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 128 || height > 128 || p.data.length !== width * height * 4) return '';
  // ImageData est en RVBA, le bitmap d'Electron en BVRA.
  const buf = Buffer.alloc(p.data.length);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = p.data[i + 2];
    buf[i + 1] = p.data[i + 1];
    buf[i + 2] = p.data[i];
    buf[i + 3] = p.data[i + 3];
  }
  try { return nativeImage.createFromBitmap(buf, { width, height }).toDataURL(); } catch { return ''; }
}

const manifestAction = (m) => [m.action, m.browser_action, m.page_action].find((a) => a && typeof a === 'object') || null;

// Valeur d'un réglage du bouton : celle de l'onglet, sinon la valeur globale.
function actionValue(ctx, key, tabId) {
  const a = ctx.st.action;
  const own = typeof tabId === 'number' ? a.tabs.get(tabId) : null;
  if (own && own[key] !== undefined) return own[key];
  return a.global[key];
}

function setActionValue(ctx, key, tabId, value) {
  const a = ctx.st.action;
  if (typeof tabId === 'number') {
    const own = a.tabs.get(tabId) || {};
    if (value === undefined) delete own[key]; else own[key] = value;
    a.tabs.set(tabId, own);
  } else if (value === undefined) delete a.global[key];
  else a.global[key] = value;
  hooks.actionChanged();
}

function popupUrl(ctx, tabId) {
  const set = actionValue(ctx, 'popup', tabId);
  const base = manifestAction(ctx.manifest);
  const rel = set !== undefined ? set : base && typeof base.default_popup === 'string' ? base.default_popup : '';
  if (!rel) return '';
  try {
    const u = new URL(rel, ctx.ext.url);
    return u.protocol === 'chrome-extension:' && u.host === ctx.id ? u.href : '';
  } catch {
    return '';
  }
}

// Ce qu'il faut pour dessiner le bouton d'une extension sur un onglet donné.
function actionInfo(ses, id, tabId) {
  const ctx = context(ses, id);
  if (!ctx) return null;
  const base = manifestAction(ctx.manifest);
  if (!base) return null;
  const a = ctx.st.action;
  if (a.defaultIcon === null) a.defaultIcon = iconFromPath(ctx.ext, pickIconPath(base.default_icon)) || iconFromPath(ctx.ext, pickIconPath(ctx.manifest.icons));
  const bg = actionValue(ctx, 'badgeBg', tabId);
  const fg = actionValue(ctx, 'badgeFg', tabId);
  return {
    id,
    name: ctx.ext.name,
    title: actionValue(ctx, 'title', tabId) || localized(ctx, base.default_title) || ctx.ext.name,
    icon: actionValue(ctx, 'icon', tabId) || a.defaultIcon,
    badgeText: actionValue(ctx, 'badgeText', tabId) || '',
    badgeColor: cssColor(bg || [95, 99, 104, 255]),
    badgeTextColor: cssColor(fg || [255, 255, 255, 255]),
    popup: popupUrl(ctx, tabId),
    enabled: actionValue(ctx, 'enabled', tabId) !== false,
  };
}

// Boutons de toutes les extensions de la session, pour un onglet.
function actions(ses, tabId) {
  if (!attached.has(ses)) return [];
  return ses.extensions.getAllExtensions().map((ext) => actionInfo(ses, ext.id, tabId)).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// « __MSG_cle__ » du manifeste : Electron ne le résout pas dans `manifest`.
function localized(ctx, value) {
  if (typeof value !== 'string' || !value.includes('__MSG_')) return typeof value === 'string' ? value : '';
  if (!ctx.st.messages) {
    ctx.st.messages = new Map();
    const tried = [ctx.manifest.current_locale, ctx.manifest.default_locale, 'en'].filter((l) => typeof l === 'string' && /^[A-Za-z0-9_]+$/.test(l));
    for (const locale of tried.reverse()) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(ctx.ext.path, '_locales', locale, 'messages.json'), 'utf8').replace(/^﻿/, ''));
        for (const k of Object.keys(raw)) if (raw[k] && typeof raw[k].message === 'string') ctx.st.messages.set(k.toLowerCase(), raw[k].message);
      } catch {}
    }
  }
  return value.replace(/__MSG_([A-Za-z0-9_@]+)__/g, (all, key) => ctx.st.messages.get(key.toLowerCase()) || '').trim();
}

// Clic sur le bouton : ouvre la fenêtre surgissante, sinon prévient l'extension.
// `tab` est l'onglet actif (description de l'hôte) ou null.
function clickAction(ses, id, tab) {
  const ctx = context(ses, id);
  if (!ctx || !manifestAction(ctx.manifest)) return false;
  if (tab) grantTab(ctx.st, tab);
  if (popupUrl(ctx, tab ? tab.id : undefined)) return 'popup';
  emit(ses, id, 'action.onClicked', [tab ? tabObject(ctx, tab) : undefined]);
  return 'clicked';
}

// --- Menus contextuels ---------------------------------------------------------

const MENU_CONTEXTS = ['all', 'page', 'frame', 'selection', 'link', 'editable', 'image', 'video', 'audio', 'action', 'browser_action', 'page_action', 'launcher'];

function menuItem(props, previous) {
  const p = props && typeof props === 'object' ? props : {};
  const item = previous ? { ...previous } : { id: String(p.id), type: 'normal', title: '', contexts: ['page'], enabled: true, visible: true, checked: false };
  if (['normal', 'checkbox', 'radio', 'separator'].includes(p.type)) item.type = p.type;
  if (typeof p.title === 'string') item.title = p.title.slice(0, 300);
  if (Array.isArray(p.contexts)) item.contexts = p.contexts.filter((x) => MENU_CONTEXTS.includes(x));
  if (typeof p.enabled === 'boolean') item.enabled = p.enabled;
  if (typeof p.visible === 'boolean') item.visible = p.visible;
  if (typeof p.checked === 'boolean') item.checked = p.checked;
  if ('parentId' in p) item.parentId = p.parentId == null ? undefined : String(p.parentId);
  if (Array.isArray(p.documentUrlPatterns)) item.documentUrlPatterns = strings(p.documentUrlPatterns);
  if (Array.isArray(p.targetUrlPatterns)) item.targetUrlPatterns = strings(p.targetUrlPatterns);
  return item;
}

function saveMenus(ctx) {
  diskOf(ctx.id).menus = [...ctx.st.menus.values()];
  persist();
}

// Éléments à ajouter au menu contextuel d'une page (gabarit de menu Electron).
// `params` est celui de l'événement « context-menu » d'Electron.
function contextMenuItems(wc, params) {
  const ses = wc && !wc.isDestroyed() ? wc.session : null;
  if (!ses || !attached.has(ses)) return [];
  const p = params || {};
  const pageUrl = p.pageURL || wc.getURL();
  const present = new Set(['all']);
  if (p.linkURL) present.add('link');
  if (p.mediaType === 'image') present.add('image');
  if (p.mediaType === 'video') present.add('video');
  if (p.mediaType === 'audio') present.add('audio');
  if (p.selectionText) present.add('selection');
  if (p.isEditable) present.add('editable');
  if (p.frameURL && p.frameURL !== pageUrl) present.add('frame');
  // « page » ne vaut que s'il n'y a rien de plus précis sous le pointeur.
  if (present.size === 1) present.add('page');
  const tab = host.tabs().find((t) => t.wc === wc) || null;
  const out = [];
  for (const ext of ses.extensions.getAllExtensions()) {
    const ctx = context(ses, ext.id);
    if (!ctx || !ctx.st.menus.size || !hasPermission(ctx, 'contextMenus')) continue;
    const shown = [...ctx.st.menus.values()].filter((m) => {
      if (m.visible === false) return false;
      if (!m.parentId && !m.contexts.some((c) => present.has(c))) return false;
      if (m.documentUrlPatterns && m.documentUrlPatterns.length && !m.documentUrlPatterns.some((x) => matchPattern(x, pageUrl))) return false;
      if (m.targetUrlPatterns && m.targetUrlPatterns.length && !m.targetUrlPatterns.some((x) => matchPattern(x, p.linkURL || p.srcURL || ''))) return false;
      return true;
    });
    const click = (m) => () => {
      const wasChecked = !!m.checked;
      if (m.type === 'checkbox') m.checked = !wasChecked;
      if (m.type === 'radio') {
        for (const other of ctx.st.menus.values()) if (other.type === 'radio' && other.parentId === m.parentId) other.checked = false;
        m.checked = true;
      }
      if (tab) grantTab(ctx.st, tab);
      const info = { menuItemId: m.id, editable: !!p.isEditable, pageUrl, frameId: 0 };
      if (m.parentId) info.parentMenuItemId = m.parentId;
      if (p.frameURL) info.frameUrl = p.frameURL;
      if (p.linkURL) info.linkUrl = p.linkURL;
      if (p.srcURL) info.srcUrl = p.srcURL;
      if (p.mediaType && p.mediaType !== 'none') info.mediaType = p.mediaType;
      if (p.selectionText) info.selectionText = p.selectionText;
      if (m.type === 'checkbox' || m.type === 'radio') { info.checked = m.checked; info.wasChecked = wasChecked; }
      emit(ses, ext.id, 'contextMenus.onClicked', [info, tab ? tabObject(ctx, tab) : undefined]);
    };
    const build = (parentId) => shown.filter((m) => (m.parentId || undefined) === parentId).map((m) => {
      if (m.type === 'separator') return { type: 'separator' };
      const children = build(m.id);
      const item = { label: m.title.replace(/%s/g, String(p.selectionText || '').slice(0, 40)).replace(/&&/g, '&'), enabled: m.enabled !== false };
      if (children.length) item.submenu = children;
      else {
        item.click = click(m);
        if (m.type === 'checkbox' || m.type === 'radio') { item.type = m.type; item.checked = !!m.checked; }
      }
      return item;
    });
    const top = build(undefined);
    if (!top.length) continue;
    // Comme dans Chrome : plusieurs éléments sont regroupés sous le nom de l'extension.
    if (top.length === 1 && top[0].type !== 'separator') out.push(top[0]);
    else out.push({ label: ext.name, submenu: top });
  }
  return out;
}

// --- API : une fonction par méthode -----------------------------------------

const FONTS = ['Arial', 'Courier New', 'Georgia', 'Helvetica', 'Helvetica Neue', 'Menlo', 'Monaco', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'serif', 'sans-serif', 'monospace', 'cursive', 'system-ui'];

const METHODS = {
  // Abonnement d'un contexte à un événement (appel interne du script de préchargement).
  _listen(ctx, [name, on], origin) {
    if (typeof name !== 'string' || name.length > 80) return;
    const set = origin.frame ? (ctx.st.frames.get(origin.frame) || ctx.st.frames.set(origin.frame, new Set()).get(origin.frame)) : ctx.st.worker;
    if (on) set.add(name); else set.delete(name);
    if (!origin.frame) ctx.st.workerSeen = true;
  },

  // Changement de stockage vu par une page de l'extension : Electron ne
  // l'annonce pas au service worker, on le lui relaie. Plusieurs pages ouvertes
  // voient le même changement : il ne part qu'une fois.
  _storageRelay(ctx, [changes, area], origin) {
    if (!origin.frame || !ctx.st.worker.has('storage.relay') || !changes || typeof changes !== 'object' || typeof area !== 'string') return;
    const sig = area + JSON.stringify(changes);
    const now = Date.now();
    const seen = ctx.st.relayed || (ctx.st.relayed = new Map());
    for (const [k, at] of seen) if (now - at > 2000) seen.delete(k);
    if (seen.has(sig)) return;
    seen.set(sig, now);
    emit(ctx.ses, ctx.id, 'storage.relay', [changes, area]);
  },

  // permissions ---------------------------------------------------------------
  'permissions.getAll': (ctx) => ({
    permissions: [...requiredPermissions(ctx.manifest), ...optionalPermissions(ctx.manifest).filter((p) => diskOf(ctx.id).granted.includes(p))],
    origins: requiredHosts(ctx.manifest),
  }),
  'permissions.contains': (ctx, [q]) => strings(q && q.permissions).every((p) => hasPermission(ctx, p)) && strings(q && q.origins).every((o) => originCovered(ctx, o)),
  async 'permissions.request'(ctx, [q]) {
    const wanted = strings(q && q.permissions);
    const origins = strings(q && q.origins);
    const optional = optionalPermissions(ctx.manifest);
    for (const p of wanted) if (!optional.includes(p) && !requiredPermissions(ctx.manifest).includes(p)) throw fail(`Only permissions specified in the manifest may be requested: ${p}`);
    // Electron n'accorde pas d'accès aux sites après coup : une origine hors
    // du manifeste reste refusée, plutôt que d'annoncer un accès qui n'existe pas.
    if (!origins.every((o) => originCovered(ctx, o))) return false;
    const missing = wanted.filter((p) => !hasPermission(ctx, p));
    if (!missing.length) return true;
    if (!(await host.confirmPermissions(ctx.ext, missing))) return false;
    const d = diskOf(ctx.id);
    d.granted = [...new Set([...d.granted, ...missing])];
    persist();
    emit(ctx.ses, ctx.id, 'permissions.onAdded', [{ permissions: missing, origins: [] }]);
    return true;
  },
  'permissions.remove'(ctx, [q]) {
    const wanted = strings(q && q.permissions);
    if (strings(q && q.origins).length || wanted.some((p) => requiredPermissions(ctx.manifest).includes(p))) return false;
    const d = diskOf(ctx.id);
    const removed = wanted.filter((p) => d.granted.includes(p));
    d.granted = d.granted.filter((p) => !removed.includes(p));
    persist();
    if (removed.length) emit(ctx.ses, ctx.id, 'permissions.onRemoved', [{ permissions: removed, origins: [] }]);
    return true;
  },

  // tabs ----------------------------------------------------------------------
  'tabs.query'(ctx, [query]) {
    const q = query || {};
    const current = host.currentWindowId(ctx.wc);
    const last = host.currentWindowId(null);
    const patterns = q.url == null ? null : strings([].concat(q.url));
    const is = (v) => typeof v === 'boolean';
    return visibleTabs(ctx).filter((t) => {
      if (is(q.active) && q.active !== t.active) return false;
      if (is(q.highlighted) && q.highlighted !== t.active) return false;
      if (is(q.currentWindow) && q.currentWindow !== (t.windowId === current)) return false;
      if (is(q.lastFocusedWindow) && q.lastFocusedWindow !== (t.windowId === last)) return false;
      if (typeof q.windowId === 'number' && (q.windowId === -2 ? current : q.windowId) !== t.windowId) return false;
      if (q.windowType && q.windowType !== 'normal') return false;
      if (is(q.pinned) && q.pinned !== t.pinned) return false;
      if (is(q.audible) && q.audible !== t.audible) return false;
      if (is(q.muted) && q.muted !== t.muted) return false;
      if (is(q.discarded) && q.discarded) return false;
      if (typeof q.index === 'number' && q.index !== t.index) return false;
      if (q.status && q.status !== t.status) return false;
      if ((patterns || q.title != null) && !canSeeTab(ctx, t)) return false;
      if (patterns && !patterns.some((p) => matchPattern(p, t.url))) return false;
      if (q.title != null && !globMatch(q.title, t.title)) return false;
      return true;
    }).map((t) => tabObject(ctx, t));
  },
  'tabs.get': (ctx, [id]) => tabObject(ctx, findTab(ctx, id)),
  'tabs.getCurrent'(ctx) {
    const t = ctx.wc && visibleTabs(ctx).find((x) => x.wc === ctx.wc);
    return t ? tabObject(ctx, t) : undefined;
  },
  async 'tabs.create'(ctx, [props]) {
    const p = props || {};
    const url = safeUrl(ctx, p.url);
    const windowId = typeof p.windowId === 'number' && p.windowId !== -2 ? p.windowId : host.currentWindowId(ctx.wc);
    const id = await host.createTab({ url, active: p.active !== false && p.selected !== false, windowId, session: ctx.ses });
    const t = host.tabs().find((x) => x.id === id);
    if (!t) throw fail('Tabs cannot be created right now.');
    return tabObject(ctx, t);
  },
  'tabs.duplicate': async (ctx, [id]) => METHODS['tabs.create'](ctx, [{ url: findTab(ctx, id).url }]),
  'tabs.remove'(ctx, [ids]) {
    for (const id of [].concat(ids)) host.removeTab(findTab(ctx, id).id);
  },
  async 'tabs.update'(ctx, args) {
    const [id, props] = typeof args[0] === 'number' || args[0] == null ? [args[0], args[1]] : [undefined, args[0]];
    const p = props || {};
    const t = targetTab(ctx, id);
    if (p.url != null) {
      const url = safeUrl(ctx, p.url);
      t.wc.loadURL(url).catch(() => {});
      t.url = url;
      t.status = 'loading';
    }
    if (typeof p.muted === 'boolean') { t.wc.setAudioMuted(p.muted); t.muted = p.muted; }
    if (p.active === true || p.highlighted === true || p.selected === true) { host.activateTab(t.id); t.active = true; }
    return tabObject(ctx, t);
  },
  'tabs.reload'(ctx, args) {
    const [id, props] = typeof args[0] === 'number' || args[0] == null ? [args[0], args[1]] : [undefined, args[0]];
    const t = targetTab(ctx, id);
    if (props && props.bypassCache) t.wc.reloadIgnoringCache(); else t.wc.reload();
  },
  'tabs.goBack'(ctx, [id]) {
    const h = targetTab(ctx, id).wc.navigationHistory;
    if (!h.canGoBack()) throw fail('Cannot find a next page in history.');
    h.goBack();
  },
  'tabs.goForward'(ctx, [id]) {
    const h = targetTab(ctx, id).wc.navigationHistory;
    if (!h.canGoForward()) throw fail('Cannot find a next page in history.');
    h.goForward();
  },
  async 'tabs.captureVisibleTab'(ctx, args) {
    const [windowId, options] = typeof args[0] === 'number' || args[0] == null ? [args[0], args[1]] : [undefined, args[0]];
    const wanted = typeof windowId === 'number' && windowId !== -2 ? windowId : host.currentWindowId(ctx.wc);
    const t = visibleTabs(ctx).find((x) => x.active && x.windowId === wanted);
    if (!t) throw fail('No active tab.');
    if (!hostAccess(ctx, t.url) && !ctx.st.activeTabs.has(t.id)) throw fail("Either the '<all_urls>' or 'activeTab' permission is required.");
    // Comme Chrome : pas plus de deux captures par seconde (les extensions de
    // capture de page entière comptent sur ce message pour ralentir).
    const now = Date.now();
    ctx.st.captures = (ctx.st.captures || []).filter((at) => now - at < 1000);
    if (ctx.st.captures.length >= 2) throw fail('This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota.');
    ctx.st.captures.push(now);
    const img = await t.wc.capturePage();
    const o = options || {};
    if (o.format === 'png') return 'data:image/png;base64,' + img.toPNG().toString('base64');
    return 'data:image/jpeg;base64,' + img.toJPEG(Math.max(0, Math.min(100, Number.isFinite(o.quality) ? o.quality : 92))).toString('base64');
  },
  'tabs.detectLanguage': () => 'und',

  // windows -------------------------------------------------------------------
  'windows.get': (ctx, [id, info]) => windowObject(ctx, findWindow(ctx, id), !!(info && info.populate)),
  'windows.getCurrent': (ctx, [info]) => windowObject(ctx, findWindow(ctx, -2), !!(info && info.populate)),
  'windows.getLastFocused'(ctx, [info]) {
    const w = host.windows().find((x) => x.id === host.currentWindowId(null));
    if (!w) throw fail('No last-focused window');
    return windowObject(ctx, w, !!(info && info.populate));
  },
  'windows.getAll': (ctx, [info]) => host.windows().map((w) => windowObject(ctx, w, !!(info && info.populate))),
  // Orbe n'ouvre pas de fenêtre pour une extension : les adresses demandées
  // s'ouvrent en onglets dans la fenêtre courante.
  async 'windows.create'(ctx, [props]) {
    const p = props || {};
    const urls = p.url == null ? [] : [].concat(p.url);
    const windowId = host.currentWindowId(ctx.wc);
    for (const u of urls) await host.createTab({ url: safeUrl(ctx, u), active: p.focused !== false, windowId, session: ctx.ses });
    return windowObject(ctx, findWindow(ctx, windowId), true);
  },
  'windows.update'(ctx, [id, props]) {
    const w = findWindow(ctx, id);
    if (props && props.focused) host.focusWindow(w.id);
    return windowObject(ctx, w, false);
  },
  'windows.remove'() {
    throw fail('Une extension ne peut pas fermer une fenêtre d’Orbe.');
  },

  // cookies -------------------------------------------------------------------
  async 'cookies.get'(ctx, [d]) {
    needCookieHost(ctx, d && d.url);
    const found = await ctx.ses.cookies.get({ url: d.url, name: String(d.name) });
    // Comme Chrome : en cas d'homonymes, le chemin le plus long l'emporte.
    found.sort((a, b) => (b.path || '').length - (a.path || '').length);
    return found.length ? cookieObject(found[0]) : null;
  },
  async 'cookies.getAll'(ctx, [d]) {
    need(ctx, 'cookies');
    const q = d || {};
    const filter = {};
    for (const k of ['url', 'name', 'domain', 'path']) if (typeof q[k] === 'string') filter[k] = q[k];
    for (const k of ['secure', 'session']) if (typeof q[k] === 'boolean') filter[k] = q[k];
    const found = await ctx.ses.cookies.get(filter);
    return found.filter((c) => hostAccess(ctx, cookieUrl(c))).map(cookieObject);
  },
  async 'cookies.set'(ctx, [d]) {
    needCookieHost(ctx, d && d.url);
    const c = { url: d.url, name: String(d.name || ''), value: String(d.value || '') };
    for (const k of ['domain', 'path']) if (typeof d[k] === 'string') c[k] = d[k];
    for (const k of ['secure', 'httpOnly']) if (typeof d[k] === 'boolean') c[k] = d[k];
    if (['unspecified', 'no_restriction', 'lax', 'strict'].includes(d.sameSite)) c.sameSite = d.sameSite;
    if (typeof d.expirationDate === 'number') c.expirationDate = d.expirationDate;
    await ctx.ses.cookies.set(c);
    return METHODS['cookies.get'](ctx, [{ url: d.url, name: c.name }]);
  },
  async 'cookies.remove'(ctx, [d]) {
    needCookieHost(ctx, d && d.url);
    await ctx.ses.cookies.remove(d.url, String(d.name));
    return { url: d.url, name: String(d.name), storeId: '0' };
  },
  'cookies.getAllCookieStores'(ctx) {
    need(ctx, 'cookies');
    return [{ id: '0', tabIds: visibleTabs(ctx).map((t) => t.id) }];
  },

  // contextMenus --------------------------------------------------------------
  'contextMenus.create'(ctx, [props]) {
    need(ctx, 'contextMenus');
    if (!props || props.id == null) throw fail('Identifiant de menu manquant');
    const id = String(props.id);
    if (ctx.st.menus.has(id)) throw fail(`Cannot create item with duplicate id ${id}`);
    if (ctx.st.menus.size >= 500) throw fail('Trop d’éléments de menu');
    ctx.st.menus.set(id, menuItem(props));
    saveMenus(ctx);
  },
  'contextMenus.update'(ctx, [id, props]) {
    need(ctx, 'contextMenus');
    const item = ctx.st.menus.get(String(id));
    if (!item) throw fail(`Cannot find menu item with id ${id}`);
    ctx.st.menus.set(String(id), menuItem(props, item));
    saveMenus(ctx);
  },
  'contextMenus.remove'(ctx, [id]) {
    need(ctx, 'contextMenus');
    const gone = new Set([String(id)]);
    if (!ctx.st.menus.has(String(id))) throw fail(`Cannot find menu item with id ${id}`);
    // Les descendants partent avec leur parent.
    for (let grew = true; grew;) {
      grew = false;
      for (const m of ctx.st.menus.values()) if (m.parentId && gone.has(m.parentId) && !gone.has(m.id)) { gone.add(m.id); grew = true; }
    }
    for (const g of gone) ctx.st.menus.delete(g);
    saveMenus(ctx);
  },
  'contextMenus.removeAll'(ctx) {
    need(ctx, 'contextMenus');
    ctx.st.menus.clear();
    saveMenus(ctx);
  },

  // action --------------------------------------------------------------------
  'action.setTitle': (ctx, [d]) => setActionValue(ctx, 'title', d && d.tabId, d && d.title ? String(d.title).slice(0, 300) : undefined),
  'action.getTitle': (ctx, [d]) => actionInfo(ctx.ses, ctx.id, d && d.tabId).title,
  'action.setBadgeText': (ctx, [d]) => setActionValue(ctx, 'badgeText', d && d.tabId, d && d.text != null ? String(d.text).slice(0, 8) : undefined),
  'action.getBadgeText': (ctx, [d]) => actionValue(ctx, 'badgeText', d && d.tabId) || '',
  'action.setBadgeBackgroundColor': (ctx, [d]) => setActionValue(ctx, 'badgeBg', d && d.tabId, d && d.color != null ? parseColor(d.color) : undefined),
  'action.getBadgeBackgroundColor': (ctx, [d]) => actionValue(ctx, 'badgeBg', d && d.tabId) || [95, 99, 104, 255],
  'action.setBadgeTextColor': (ctx, [d]) => setActionValue(ctx, 'badgeFg', d && d.tabId, d && d.color != null ? parseColor(d.color) : undefined),
  'action.getBadgeTextColor': (ctx, [d]) => actionValue(ctx, 'badgeFg', d && d.tabId) || [255, 255, 255, 255],
  'action.setPopup': (ctx, [d]) => setActionValue(ctx, 'popup', d && d.tabId, d && typeof d.popup === 'string' ? d.popup : undefined),
  'action.getPopup': (ctx, [d]) => popupUrl(ctx, d && d.tabId),
  'action.setIcon'(ctx, [d]) {
    const o = d || {};
    const icon = iconFromPixels(o.imageData) || iconFromPath(ctx.ext, pickIconPath(o.path));
    setActionValue(ctx, 'icon', o.tabId, icon || undefined);
  },
  'action.enable': (ctx, [tabId]) => setActionValue(ctx, 'enabled', tabId, true),
  'action.disable': (ctx, [tabId]) => setActionValue(ctx, 'enabled', tabId, false),
  'action.isEnabled': (ctx, [tabId]) => actionValue(ctx, 'enabled', tabId) !== false,
  'action.getUserSettings': () => ({ isOnToolbar: true }),
  'action.openPopup'(ctx) {
    if (!host.openPopup(ctx.ses, ctx.id)) throw fail('Could not open the popup.');
  },

  // webNavigation ---------------------------------------------------------------
  'webNavigation.getAllFrames'(ctx, [d]) {
    need(ctx, 'webNavigation');
    const t = findTab(ctx, d && d.tabId);
    return t.wc.mainFrame.framesInSubtree.map((f) => frameObject(t.wc, f));
  },
  'webNavigation.getFrame'(ctx, [d]) {
    need(ctx, 'webNavigation');
    const t = findTab(ctx, d && d.tabId);
    const f = t.wc.mainFrame.framesInSubtree.find((x) => frameId(t.wc, x) === ((d && d.frameId) || 0));
    return f ? frameObject(t.wc, f) : null;
  },

  // notifications ---------------------------------------------------------------
  'notifications.create'(ctx, args) {
    need(ctx, 'notifications');
    const [id, options] = typeof args[0] === 'string' ? [args[0], args[1]] : [`orbe-${Date.now().toString(36)}-${ctx.st.notifications.size}`, args[0]];
    const o = options || {};
    const old = ctx.st.notifications.get(id);
    if (old) old.close();
    if (Notification.isSupported()) {
      const n = new Notification({ title: String(o.title || ctx.ext.name).slice(0, 200), body: String(o.message || '').slice(0, 1000), silent: !!o.silent });
      ctx.st.notifications.set(id, n);
      n.on('click', () => emit(ctx.ses, ctx.id, 'notifications.onClicked', [id]));
      n.on('close', () => { if (ctx.st.notifications.get(id) === n) { ctx.st.notifications.delete(id); emit(ctx.ses, ctx.id, 'notifications.onClosed', [id, true]); } });
      n.show();
    }
    return id;
  },
  'notifications.update': (ctx, [id, options]) => { need(ctx, 'notifications'); if (!ctx.st.notifications.has(id)) return false; METHODS['notifications.create'](ctx, [id, options]); return true; },
  'notifications.clear'(ctx, [id]) {
    need(ctx, 'notifications');
    const n = ctx.st.notifications.get(id);
    if (!n) return false;
    ctx.st.notifications.delete(id);
    n.close();
    return true;
  },
  'notifications.getAll': (ctx) => { need(ctx, 'notifications'); return Object.fromEntries([...ctx.st.notifications.keys()].map((k) => [k, true])); },
  'notifications.getPermissionLevel': () => 'granted',

  // divers ----------------------------------------------------------------------
  'fontSettings.getFontList'(ctx) {
    need(ctx, 'fontSettings');
    return FONTS.map((f) => ({ fontId: f, displayName: f }));
  },
  'commands.getAll'(ctx) {
    const list = ctx.manifest.commands && typeof ctx.manifest.commands === 'object' ? ctx.manifest.commands : {};
    return Object.keys(list).map((name) => ({ name, description: localized(ctx, (list[name] && list[name].description) || ''), shortcut: host.shortcutOf(ctx.ses, ctx.id, name) }));
  },
  async 'runtime.openOptionsPage'(ctx) {
    const m = ctx.manifest;
    const page = (m.options_ui && m.options_ui.page) || m.options_page;
    if (typeof page !== 'string' || !page) throw fail('Could not create an options page.');
    const url = safeUrl(ctx, page);
    const open = visibleTabs(ctx).find((t) => t.url.split(/[?#]/)[0] === url);
    if (open) { host.activateTab(open.id); return; }
    await host.createTab({ url, active: true, windowId: host.currentWindowId(ctx.wc), session: ctx.ses });
  },
  'extension.isAllowedIncognitoAccess': () => false,
  'extension.isAllowedFileSchemeAccess': () => false,
};

const frameId = (wc, f) => (f === wc.mainFrame ? 0 : f.frameTreeNodeId);

function frameObject(wc, f) {
  return { frameId: frameId(wc, f), parentFrameId: f.parent ? frameId(wc, f.parent) : -1, processId: f.processId, url: f.url, errorOccurred: false, documentLifecycle: 'active', frameType: f.parent ? 'sub_frame' : 'outermost_frame' };
}

async function invoke(ses, id, wc, frame, name, args) {
  try {
    const ctx = context(ses, id, wc);
    if (!ctx) throw fail('Extension inconnue');
    const fn = Object.hasOwn(METHODS, String(name)) ? METHODS[name] : null;
    if (!fn) throw fail(`API non prise en charge par Orbe : ${name}`);
    if (process.env.ORBE_EXT_TRACE && name[0] !== '_') console.log('[appel]', id.slice(0, 4), name, JSON.stringify(args).slice(0, 200));
    const value = await fn(ctx, Array.isArray(args) ? args : [], { frame });
    return { value };
  } catch (err) {
    if (process.env.ORBE_EXT_TRACE) console.log('[refus]', id.slice(0, 4), name, String((err && err.message) || err));
    return { error: String((err && err.message) || err) };
  }
}

// --- Événements ----------------------------------------------------------------

function listening(st, name) {
  if (st.worker.has(name)) return true;
  for (const names of st.frames.values()) if (names.has(name)) return true;
  return false;
}

function hookWorker(ses, sw) {
  let id;
  try { id = new URL(sw.scope).host; } catch { return; }
  if (!sw.scope.startsWith('chrome-extension://')) return;
  try {
    sw.ipc.removeHandler(CHANNEL);
    sw.ipc.handle(CHANNEL, (e, name, args) => invoke(ses, id, null, null, name, args));
  } catch {}
}

// Envoie un événement à tous les contextes de l'extension qui l'écoutent.
function emit(ses, id, name, args) {
  // ORBE_EXT_TRACE=1 : journal des appels et des événements, pour diagnostiquer une extension.
  if (process.env.ORBE_EXT_TRACE) console.log('[événement]', id.slice(0, 4), name);
  const map = states.get(ses);
  const st = map && map.get(id);
  if (!st) return;
  for (const [frame, names] of st.frames) {
    let gone = false;
    try { gone = frame.isDestroyed() || frame.detached; } catch { gone = true; }
    if (gone) { st.frames.delete(frame); continue; }
    if (names.has(name)) { try { frame.send(EVENT, name, args); } catch {} }
  }
  if (st.worker.has(name)) { toWorker(ses, id, name, args); return; }
  // Service worker jamais lancé depuis le chargement de l'extension (démarrage
  // d'Orbe, extension rechargée) : ce qu'il écoute n'est pas encore connu. On le
  // démarre, et l'événement part s'il s'y abonne.
  if (st.workerSeen || st.waking === undefined) {
    if (st.workerSeen) return;
    st.waking = [];
    const ext = ses.extensions.getExtension(id);
    const worker = ext && ext.manifest && ext.manifest.background && ext.manifest.background.service_worker;
    if (!worker) { st.workerSeen = true; return; }
    const t0 = Date.now();
    const flush = () => {
      // Laisse au script le temps de poser tous ses écouteurs.
      if (!st.workerSeen && Date.now() - t0 < 4000) { setTimeout(flush, 50); return; }
      setTimeout(() => {
        const queued = st.waking || [];
        st.waking = null;
        st.workerSeen = true;
        for (const [n, a] of queued) if (st.worker.has(n)) toWorker(ses, id, n, a);
      }, 150);
    };
    ses.serviceWorkers.startWorkerForScope(ext.url).then(flush, flush);
  }
  if (st.waking && st.waking.length < 100) st.waking.push([name, args]);
}

// Réveille le service worker s'il dormait, et le garde éveillé le temps qu'il
// traite l'événement.
function toWorker(ses, id, name, args) {
  const ext = ses.extensions.getExtension(id);
  if (!ext) return;
  ses.serviceWorkers.startWorkerForScope(ext.url).then((sw) => {
    hookWorker(ses, sw);
    const task = sw.startTask();
    setTimeout(() => { try { task.end(); } catch {} }, 5000);
    sw.send(EVENT, name, args);
  }).catch(() => {});
}

// `storage.sync` dans les scripts de contenu : Electron le refuse, et le script
// de préchargement n'atteint pas leur monde isolé. À chaque page chargée, le
// service worker de l'extension y injecte donc le correctif lui-même
// (`scripting.executeScript`, voir src/preload/ext.js). Ne concerne que les
// extensions Manifest V3 qui ont des scripts de contenu sur cette page et les
// autorisations « scripting » et « storage ».
function contentSync(t, url, frame) {
  const ses = t.session;
  if (!attached.has(ses) || !/^https?:/i.test(url || '')) return;
  const main = !frame || frame === t.wc.mainFrame;
  for (const ext of ses.extensions.getAllExtensions()) {
    const m = ext.manifest || {};
    const scripts = Array.isArray(m.content_scripts) ? m.content_scripts : [];
    const perms = strings(m.permissions);
    if (!scripts.length || m.manifest_version !== 3 || !m.background || !m.background.service_worker || !perms.includes('scripting') || !perms.includes('storage')) continue;
    if (!scripts.some((s) => s && (main || s.all_frames) && strings(s.matches).some((p) => matchPattern(p, url)))) continue;
    toWorker(ses, ext.id, 'content.sync', [main ? { tabId: t.id } : { tabId: t.id, allFrames: true }]);
  }
}

// Événement lié à un onglet : envoyé aux extensions de sa session qui
// l'écoutent. `build(ctx)` rend les arguments, ou null pour ne rien envoyer.
function broadcast(ses, name, build) {
  if (!ses || !attached.has(ses)) return;
  const map = states.get(ses);
  if (!map) return;
  for (const [id, st] of map) {
    if (!listening(st, name)) continue;
    const ctx = context(ses, id);
    if (!ctx) continue;
    const args = build(ctx);
    if (args) emit(ses, id, name, args);
  }
}

// Appelés par l'hôte quand le modèle d'onglets change.
const notify = {
  tabCreated: (t) => broadcast(t.session, 'tabs.onCreated', (ctx) => [tabObject(ctx, t)]),
  tabRemoved(id, windowId, ses) {
    broadcast(ses, 'tabs.onRemoved', () => [id, { windowId, isWindowClosing: false }]);
    const map = states.get(ses);
    if (map) for (const st of map.values()) { st.activeTabs.delete(id); st.activeOrigins.delete(id); st.action.tabs.delete(id); }
  },
  tabUpdated(t, change) {
    broadcast(t.session, 'tabs.onUpdated', (ctx) => {
      const info = { ...change };
      if (!canSeeTab(ctx, t)) { delete info.url; delete info.title; delete info.favIconUrl; }
      return Object.keys(info).length ? [t.id, info, tabObject(ctx, t)] : null;
    });
  },
  tabActivated: (t) => broadcast(t.session, 'tabs.onActivated', () => [{ tabId: t.id, windowId: t.windowId }]),
  windowFocused: (windowId) => { for (const ses of attached) broadcast(ses, 'windows.onFocusChanged', () => [windowId]); },
  windowCreated: (w) => { for (const ses of attached) broadcast(ses, 'windows.onCreated', (ctx) => [windowObject(ctx, w, false)]); },
  windowRemoved: (windowId) => { for (const ses of attached) broadcast(ses, 'windows.onRemoved', () => [windowId]); },
  // Navigation d'un onglet (chrome.webNavigation). `frame` : WebFrameMain ou null.
  navigation(t, name, url, frame) {
    if (name === 'onCommitted') contentSync(t, url, frame);
    // Changement de site dans l'onglet : l'accès donné par un geste s'arrête là.
    if (name === 'onCommitted' && (!frame || frame === t.wc.mainFrame)) {
      let origin = '';
      try { origin = new URL(url).origin; } catch {}
      for (const st of (states.get(t.session) || new Map()).values()) {
        if (st.activeOrigins.has(t.id) && st.activeOrigins.get(t.id) !== origin) { st.activeTabs.delete(t.id); st.activeOrigins.delete(t.id); }
      }
    }
    broadcast(t.session, 'webNavigation.' + name, (ctx) => {
      if (!hasPermission(ctx, 'webNavigation')) return null;
      const main = !frame || frame === t.wc.mainFrame;
      return [{ tabId: t.id, url, frameId: main ? 0 : frame.frameTreeNodeId, parentFrameId: main ? -1 : (frame.parent ? frameId(t.wc, frame.parent) : 0), processId: frame ? frame.processId : -1, timeStamp: Date.now(), documentLifecycle: 'active', frameType: main ? 'outermost_frame' : 'sub_frame' }];
    });
  },
  // Commande d'une extension (raccourci clavier), si l'hôte en déclenche.
  command(ses, id, name, t) {
    const ctx = context(ses, id);
    if (!ctx) return;
    if (t) grantTab(ctx.st, t);
    emit(ses, id, 'commands.onCommand', [name, t ? tabObject(ctx, t) : undefined]);
  },
};

// --- Branchement sur une session ---------------------------------------------

function setupIpc() {
  if (ipcReady) return;
  ipcReady = true;
  // Pages d'extension : l'identité vient de l'origine du cadre émetteur.
  ipcMain.handle(CHANNEL, (e, name, args) => {
    const frame = e.senderFrame;
    const ses = e.sender.session;
    let origin = null;
    try { origin = frame ? new URL(frame.origin && frame.origin !== 'null' ? frame.origin : frame.url) : null; } catch {}
    if (!origin || origin.protocol !== 'chrome-extension:' || !attached.has(ses)) return { error: 'Appel refusé' };
    return invoke(ses, origin.host, e.sender, frame, name, args);
  });
}

// Enregistre src/preload/ext.js sur la session. Un script de préchargement de
// session s'exécute dans chaque cadre de chaque page et dans chaque service
// worker, y compris ceux des sites web : tant qu'aucune extension n'est chargée,
// il n'y a donc rien d'enregistré, et les pages web ne chargent pas ce fichier.
// Appelé par extensions.js juste avant le chargement de la première extension,
// pour que ses pages et son service worker le trouvent dès leur démarrage.
const equipped = new WeakSet();
function equip(ses) {
  if (!ses || !attached.has(ses) || equipped.has(ses)) return;
  equipped.add(ses);
  ses.registerPreloadScript({ type: 'frame', filePath: PRELOAD, id: 'orbe-ext-frame' });
  ses.registerPreloadScript({ type: 'service-worker', filePath: PRELOAD, id: 'orbe-ext-worker' });
}

// Équipe une session de profil. Sans effet la seconde fois.
function attach(ses) {
  if (!ses || attached.has(ses)) return;
  attached.add(ses);
  setupIpc();
  // Le script de complément n'est posé que sur une session qui porte une extension
  // (voir `equip`). Filet : une extension chargée sans passer par extensions.js.
  if (ses.extensions.getAllExtensions().length) equip(ses);
  ses.extensions.on('extension-loaded', () => equip(ses));
  const workers = ses.serviceWorkers;
  workers.on('running-status-changed', (d) => {
    if (d.runningStatus !== 'starting' && d.runningStatus !== 'running') return;
    const sw = workers.getWorkerFromVersionID(d.versionId);
    if (sw) hookWorker(ses, sw);
  });
  for (const versionId of Object.keys(workers.getAllRunning())) {
    const sw = workers.getWorkerFromVersionID(Number(versionId));
    if (sw) hookWorker(ses, sw);
  }
  ses.cookies.on('changed', (e, cookie, cause, removed) => {
    const map = { explicit: 'explicit', overwrite: 'overwrite', expired: 'expired', evicted: 'evicted', 'expired-overwrite': 'expired_overwrite' };
    broadcast(ses, 'cookies.onChanged', (ctx) => (hasPermission(ctx, 'cookies') && hostAccess(ctx, cookieUrl(cookie))
      ? [{ removed: !!removed, cookie: cookieObject(cookie), cause: map[cause] || 'explicit' }] : null));
  });
  // Extension retirée ou rechargée : son état en mémoire repart de zéro.
  ses.extensions.on('extension-unloaded', (e, ext) => {
    const map = states.get(ses);
    if (map) map.delete(ext.id);
    hooks.actionChanged();
  });
  ses.extensions.on('extension-ready', () => hooks.actionChanged());
}

// Oublie tout ce qui a été retenu pour une extension désinstallée.
function forget(id) {
  if (disk[id]) { delete disk[id]; persist(); }
}

// Autres espaces de noms (panneau latéral, débogueur…) : chaque module ajoute
// ses méthodes ici et se sert des mêmes outils (`internals`).
function extend(methods) {
  Object.assign(METHODS, methods);
}
const internals = {
  fail, need, hasPermission, hostAccess, context, grantTab, stateOf, diskOf, persist, emit, broadcast, findTab, targetTab, visibleTabs, tabObject, safeUrl, localized, strings,
  ui: () => disk._ui || (disk._ui = {}), // réglages d'interface (largeur du panneau…)
  attached,
};

module.exports = {
  extend, internals,
  // Appel direct d'une méthode au nom d'une extension (tests) : { value } ou { error }.
  call: (ses, id, name, args) => invoke(ses, id, null, null, name, args),
  configure, attach, equip, forget, host, hooks, notify, actions, actionInfo, clickAction, popupUrl: (ses, id, tabId) => { const ctx = context(ses, id); return ctx ? popupUrl(ctx, tabId) : ''; },
  contextMenuItems, matchPattern, parseColor, grantActiveTab: (ses, id, tabId) => { const ctx = context(ses, id); if (ctx) ctx.st.activeTabs.add(tabId); },
  isAttached: (ses) => attached.has(ses), CHANNEL, EVENT,
};
