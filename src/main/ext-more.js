// Extensions Chrome : API complémentaires de la couche d'Orbe (ext-api.js).
//   - `commands` : raccourcis clavier déclarés par les extensions ;
//   - `identity` : `launchWebAuthFlow` (petite fenêtre de connexion) ;
//   - `tabGroups`, `tabs.group` : groupes d'onglets tenus en mémoire, sans
//     dessin dans la barre latérale (Orbe range ses onglets autrement) ;
//   - `tabs.getZoom` / `setZoom`, `downloads.search`.
//
// Écrit pour Orbe à partir de la documentation publique des API d'extension de
// Chrome ; aucun code tiers.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const api = require('./ext-api');
const platform = require('./platform');

const X = api.internals;
const isMac = process.platform === 'darwin';

let windowModule = null;
const W = () => windowModule || (windowModule = require('./window'));
const links = { openAction: () => false, ownerOf: () => null };

// --- Raccourcis clavier (chrome.commands) ----------------------------------------
//
// Rien n'est enregistré auprès du système : la frappe est lue dans les vues
// d'Orbe (`before-input-event`), donc seulement quand Orbe a le clavier. Un
// raccourci déjà pris par Orbe n'est pas attribué.

const KEY_NAMES = { comma: 'comma', period: 'period', home: 'home', end: 'end', pageup: 'pageup', pagedown: 'pagedown', space: 'space', insert: 'insert', delete: 'delete', up: 'up', down: 'down', left: 'left', right: 'right' };
const CODE_KEYS = { Comma: 'comma', Period: 'period', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown', Space: 'space', Insert: 'insert', Delete: 'delete', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

const combo = (m, key) => `${m.ctrl ? 'c' : ''}${m.alt ? 'a' : ''}${m.shift ? 's' : ''}${m.meta ? 'm' : ''}+${key}`;

// « Ctrl+Shift+Y », « Command+E », « MacCtrl+… » -> forme interne, ou null.
function parseShortcut(text) {
  if (typeof text !== 'string' || !text) return null;
  const parts = text.split('+').map((p) => p.trim());
  const last = parts.pop();
  const m = { ctrl: false, alt: false, shift: false, meta: false };
  for (const p of parts) {
    const k = p.toLowerCase();
    // Comme Chrome : sur macOS, « Ctrl » désigne ⌘ ; « MacCtrl » la touche Contrôle.
    if (k === 'ctrl') { if (isMac) m.meta = true; else m.ctrl = true; }
    else if (k === 'macctrl') { if (!isMac) return null; m.ctrl = true; }
    else if (k === 'command') { if (!isMac) return null; m.meta = true; }
    else if (k === 'alt' || k === 'option') m.alt = true;
    else if (k === 'shift') m.shift = true;
    else return null;
  }
  let key = null;
  if (/^[A-Za-z0-9]$/.test(last)) key = last.toLowerCase();
  else if (/^F([1-9]|1[0-2])$/i.test(last)) key = last.toLowerCase();
  else if (KEY_NAMES[last.toLowerCase()]) key = KEY_NAMES[last.toLowerCase()];
  if (!key) return null;
  // Chrome demande Ctrl, Alt ou ⌘ (sauf pour les touches de fonction).
  if (!m.ctrl && !m.alt && !m.meta && !/^f\d+$/.test(key)) return null;
  return { ...m, key, id: combo(m, key) };
}

// Accélérateur d'Electron (« Shift+Cmd+2 ») -> même forme interne.
function parseAccelerator(accel) {
  const parts = String(accel || '').split('+');
  const last = parts.pop();
  if (!last) return null;
  const m = { ctrl: false, alt: false, shift: false, meta: false };
  for (const p of parts) {
    const k = p.toLowerCase();
    if (k === 'cmd' || k === 'command' || k === 'meta' || k === 'super') m.meta = true;
    else if (k === 'cmdorctrl' || k === 'commandorcontrol') { if (isMac) m.meta = true; else m.ctrl = true; }
    else if (k === 'ctrl' || k === 'control') m.ctrl = true;
    else if (k === 'alt' || k === 'option') m.alt = true;
    else if (k === 'shift') m.shift = true;
  }
  return combo(m, last.toLowerCase());
}

// Raccourcis d'Orbe et du système : jamais donnés à une extension.
let reservedSet = null;
function reserved() {
  if (reservedSet) return reservedSet;
  reservedSet = new Set();
  const add = (accel) => { const id = accel && parseAccelerator(accel); if (id) reservedSet.add(id); };
  // Raccourcis d'Orbe en vigueur : ceux que l'utilisateur a changés ou retirés comptent.
  const current = require('./shortcuts');
  for (const c of require('./commands').COMMANDS) add(current.accelOf(c.name));
  add(require('./store').store.state.settings.littleShortcut);
  for (const k of ['C', 'V', 'X', 'A', 'Z', 'Q', 'H', 'M', 'W', 'T', 'N', 'L', 'R', 'F', 'P', 'S']) add(platform.accel(`Cmd+${k}`));
  add(platform.accel('Shift+Cmd+Z'));
  for (let n = 1; n <= 9; n++) { add(platform.accel(`Ctrl+${n}`)); add(platform.accel(`Cmd+${n}`)); }
  add('Ctrl+Tab');
  add('Ctrl+Shift+Tab');
  return reservedSet;
}

function suggested(command) {
  const k = command && command.suggested_key;
  if (typeof k === 'string') return k;
  if (!k || typeof k !== 'object') return '';
  const os = isMac ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux';
  return k[os] || k.default || '';
}

// Raccourcis choisis par l'utilisateur (Réglages → Raccourcis) : réglage
// `extShortcuts`, { '<extension>/<commande>': accélérateur d'Electron, ou '' s'il a été retiré }.
const userKeys = () => { const s = require('./store').store.state; return (s && s.settings.extShortcuts) || {}; };
const ACCEL_KEYS = { Comma: 'comma', ',': 'comma', Period: 'period', '.': 'period', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown', Space: 'space', Insert: 'insert', Delete: 'delete', Up: 'up', Down: 'down', Left: 'left', Right: 'right' };
// Accélérateur d'Electron -> forme interne complète, ou null si la touche n'est
// pas de celles qu'une extension peut recevoir (lettres, chiffres, F1 à F12, flèches…).
function fromAccelerator(accel) {
  const parts = String(accel || '').split('+');
  const last = parts.pop() || '';
  const m = { ctrl: false, alt: false, shift: false, meta: false };
  for (const p of parts) {
    const k = p.toLowerCase();
    if (k === 'cmd' || k === 'command' || k === 'meta' || k === 'super') m.meta = true;
    else if (k === 'cmdorctrl' || k === 'commandorcontrol') { if (isMac) m.meta = true; else m.ctrl = true; }
    else if (k === 'ctrl' || k === 'control') m.ctrl = true;
    else if (k === 'alt' || k === 'option') m.alt = true;
    else if (k === 'shift') m.shift = true;
    else return null;
  }
  let key = null;
  if (/^[A-Za-z0-9]$/.test(last)) key = last.toLowerCase();
  else if (/^F([1-9]|1[0-2])$/i.test(last)) key = last.toLowerCase();
  else if (ACCEL_KEYS[last]) key = ACCEL_KEYS[last];
  return key ? { ...m, key, id: combo(m, key) } : null;
}

// Commandes déclarées par les extensions d'une session, dans l'ordre des identifiants.
function declared(ses) {
  const out = [];
  if (!ses || !X.attached.has(ses)) return out;
  const all = ses.extensions.getAllExtensions().slice().sort((a, b) => a.id.localeCompare(b.id));
  for (const ext of all) {
    const list = ext.manifest && ext.manifest.commands;
    if (!list || typeof list !== 'object') continue;
    for (const name of Object.keys(list).slice(0, 60)) out.push({ id: ext.id, name, command: list[name] || {} });
  }
  return out;
}

// Raccourcis attribués dans une session : Map(forme interne -> { id, name, keys }).
// Les choix de l'utilisateur passent d'abord ; ensuite, la première extension
// (par ordre d'identifiant) qui propose une touche libre l'obtient.
function shortcuts(ses) {
  const out = new Map();
  const all = declared(ses);
  if (!all.length) return out;
  const user = userKeys();
  const current = require('./shortcuts');
  for (const c of all) {
    const accel = user[`${c.id}/${c.name}`];
    if (!accel) continue;
    const keys = fromAccelerator(accel);
    // Donné depuis à une commande d'Orbe : Orbe passe avant.
    if (!keys || out.has(keys.id) || current.owner(accel)) continue;
    out.set(keys.id, { id: c.id, name: c.name, keys, user: true });
  }
  const taken = reserved();
  for (const c of all) {
    if (Object.hasOwn(user, `${c.id}/${c.name}`)) continue;
    const keys = parseShortcut(suggested(c.command));
    if (!keys || taken.has(keys.id) || out.has(keys.id)) continue;
    out.set(keys.id, { id: c.id, name: c.name, keys });
  }
  return out;
}

// Pour le volet Raccourcis : chaque commande d'extension, avec son raccourci en vigueur.
function commandList(ses, names = new Map()) {
  const map = shortcuts(ses);
  const user = userKeys();
  const held = (c) => { for (const s of map.values()) if (s.id === c.id && s.name === c.name) return s; return null; };
  return declared(ses).map((c) => {
    const s = held(c);
    const def = parseShortcut(suggested(c.command));
    const action = /^_execute_(action|browser_action|page_action)$/.test(c.name);
    const what = typeof c.command.description === 'string' && c.command.description && !/^__MSG_/.test(c.command.description) ? c.command.description.slice(0, 80) : (action ? '' : c.name);
    return {
      name: `ext:${c.id}/${c.name}`, id: c.id, extension: names.get(c.id) || c.id, command: c.name, action, what,
      keys: s ? label(s.keys) : '', defaultKeys: def ? label(def) : '', changed: Object.hasOwn(user, `${c.id}/${c.name}`),
    };
  });
}

function saveUserKeys(map) {
  const { store } = require('./store');
  store.state.settings.extShortcuts = map;
  store.save();
  forgetReserved();
  require('./shortcuts').hooks.changed();
}

const splitName = (name) => { const m = /^ext:([a-p]{32})\/(.{1,120})$/.exec(String(name || '')); return m ? { id: m[1], name: m[2] } : null; };

// Donne un raccourci à la commande d'une extension (`name` : « ext:<id>/<commande> »).
// Pris par une commande d'Orbe ou d'une autre extension : { conflict }, sauf avec `force`.
function assignKey(ses, name, accel, { force = false } = {}) {
  const t = splitName(name);
  const all = declared(ses);
  if (!t || !all.some((c) => c.id === t.id && c.name === t.name)) return { error: 'unknown' };
  const current = require('./shortcuts');
  const r = current.check(accel);
  if (r.error) return r;
  const keys = fromAccelerator(r.accel);
  if (!keys) return { error: 'bad' };
  const { store } = require('./store');
  if (current.canon(store.state.settings.littleShortcut || '') === r.accel) return { error: 'reserved', kind: 'global' };
  const orbe = current.owner(r.accel);
  if (orbe && !force) return { conflict: orbe, label: current.labelOf(orbe), keys: current.display(r.accel) };
  const other = [...shortcuts(ses).values()].find((s) => s.keys.id === keys.id && !(s.id === t.id && s.name === t.name));
  if (other && !orbe && !force) {
    const ext = ses.extensions.getAllExtensions().find((e) => e.id === other.id);
    return { conflict: `ext:${other.id}/${other.name}`, label: `${(ext && ext.name) || other.id} — ${other.name}`, keys: current.display(r.accel) };
  }
  const map = { ...userKeys() };
  if (other) map[`${other.id}/${other.name}`] = '';
  map[`${t.id}/${t.name}`] = r.accel;
  saveUserKeys(map);
  if (orbe) current.clear(orbe);
  return { ok: true, accel: r.accel, keys: current.display(r.accel) };
}

// '' : retiré ; null : rendu au raccourci proposé par l'extension.
function setKey(ses, name, value) {
  const t = splitName(name);
  if (!t) return { error: 'unknown' };
  const map = { ...userKeys() };
  if (value === null) delete map[`${t.id}/${t.name}`]; else map[`${t.id}/${t.name}`] = '';
  saveUserKeys(map);
  return { ok: true };
}

// Extension désinstallée : ses raccourcis choisis sont oubliés.
function forgetKeys(id) {
  const map = { ...userKeys() };
  let changed = false;
  for (const k of Object.keys(map)) if (k.startsWith(id + '/')) { delete map[k]; changed = true; }
  if (changed) saveUserKeys(map);
}

// Affichage, à la manière de Chrome : « ⇧⌘E » sur macOS, « Ctrl+Shift+E » ailleurs.
function label(keys) {
  const key = keys.key.length === 1 || /^f\d+$/.test(keys.key) ? keys.key.toUpperCase() : keys.key[0].toUpperCase() + keys.key.slice(1);
  if (isMac) return `${keys.ctrl ? '⌃' : ''}${keys.alt ? '⌥' : ''}${keys.shift ? '⇧' : ''}${keys.meta ? '⌘' : ''}${key}`;
  return [keys.ctrl && 'Ctrl', keys.alt && 'Alt', keys.shift && 'Shift', key].filter(Boolean).join('+');
}

function shortcutOf(ses, id, name) {
  for (const s of shortcuts(ses).values()) if (s.id === id && s.name === name) return label(s.keys);
  return '';
}

// Touche d'un événement clavier d'Electron -> forme interne, ou null. La
// position de la touche (`code`) sert de repère : avec ⌥, macOS change le
// caractère produit.
function comboOf(input) {
  if (!input.control && !input.alt && !input.meta && !/^F\d+$/.test(input.code || '')) return null;
  const code = String(input.code || '');
  let key = null;
  let m = /^Key([A-Z])$/.exec(code);
  if (m) key = m[1].toLowerCase();
  else if ((m = /^Digit(\d)$/.exec(code))) key = m[1];
  else if (/^F([1-9]|1[0-2])$/.test(code)) key = code.toLowerCase();
  else if (CODE_KEYS[code]) key = CODE_KEYS[code];
  // Frappe sans position connue (événement fabriqué) : le caractère fait foi.
  else if (!code && /^[A-Za-z0-9]$/.test(input.key || '')) key = input.key.toLowerCase();
  return key ? combo({ ctrl: input.control, alt: input.alt, shift: input.shift, meta: input.meta }, key) : null;
}

// Appelé pour chaque touche enfoncée dans une vue d'Orbe. Renvoie true si une
// extension a reçu la commande.
function onKey(w, input) {
  if (!w || w.incognito || input.type !== 'keyDown' || input.isAutoRepeat) return false;
  const id = comboOf(input);
  if (!id) return false;
  const rt = w.activeRt;
  const tabRt = rt && !rt.internal && !rt.wc.isDestroyed() ? rt : null;
  const ses = tabRt ? tabRt.wc.session : w.session;
  const hit = shortcuts(ses).get(id);
  if (!hit) return false;
  // « _execute_action » : comme un clic sur le bouton de l'extension.
  if (/^_execute_(action|browser_action|page_action)$/.test(hit.name)) links.openAction(w, hit.id);
  else api.notify.command(ses, hit.id, hit.name, tabRt ? api.host.tabs().find((t) => t.wc === tabRt.wc) || null : null);
  return true;
}

function watchKeys() {
  const hook = (wc) => {
    wc.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      let w = null;
      try { w = W().OrbeWindow.ownerOf(wc) || links.ownerOf(wc); } catch {}
      if (w && onKey(w, input)) e.preventDefault();
    });
  };
  app.on('web-contents-created', (e, wc) => hook(wc));
  for (const wc of require('electron').webContents.getAllWebContents()) hook(wc);
}

// --- Groupes d'onglets -------------------------------------------------------------

const COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
const groups = new Map(); // identifiant -> { id, ses, windowId, title, color, collapsed, tabs: Set }
let groupSeq = 1000;

const groupObject = (g) => ({ id: g.id, collapsed: g.collapsed, color: g.color, title: g.title, windowId: g.windowId, shared: false });
const groupEvent = (g, name) => X.broadcast(g.ses, `tabGroups.${name}`, (c) => (X.hasPermission(c, 'tabGroups') ? [groupObject(g)] : null));

// Retire les onglets fermés, et les groupes qui se retrouvent vides.
function prune() {
  if (!groups.size) return;
  const alive = new Set(api.host.tabs().map((t) => t.id));
  for (const g of [...groups.values()]) {
    for (const id of [...g.tabs]) if (!alive.has(id)) g.tabs.delete(id);
    if (!g.tabs.size) { groups.delete(g.id); groupEvent(g, 'onRemoved'); }
  }
}

function groupOf(ses, tabId) {
  for (const g of groups.values()) if (g.ses === ses && g.tabs.has(tabId)) return g.id;
  return -1;
}

function findGroup(ctx, id) {
  prune();
  const g = groups.get(id);
  if (!g || g.ses !== ctx.ses) throw X.fail(`No group with id: ${id}.`);
  return g;
}

function leaveGroups(ctx, ids) {
  for (const g of [...groups.values()]) {
    if (g.ses !== ctx.ses) continue;
    for (const id of ids) g.tabs.delete(id);
    if (!g.tabs.size) { groups.delete(g.id); groupEvent(g, 'onRemoved'); }
  }
}

function tabChanged(ctx, id) {
  const t = api.host.tabs().find((x) => x.id === id);
  if (t) api.notify.tabUpdated(t, { groupId: groupOf(ctx.ses, id) });
}

// --- Connexion (chrome.identity) ---------------------------------------------------

function webAuthFlow(ctx, details) {
  const d = details || {};
  let start;
  try { start = new URL(String(d.url)); } catch { throw X.fail('Invalid url.'); }
  if (start.protocol !== 'https:' && start.protocol !== 'http:') throw X.fail('Invalid url.');
  const redirect = `https://${ctx.id}.chromiumapp.org/`;
  const interactive = d.interactive === true;
  const parentId = api.host.currentWindowId(ctx.wc);
  const parent = W().OrbeWindow.all.find((x) => x.win.id === parentId);
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      parent: parent && !parent.win.isDestroyed() ? parent.win : undefined,
      width: 500,
      height: 680,
      show: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: ctx.ext.name,
      autoHideMenuBar: true,
      webPreferences: { session: ctx.ses, sandbox: true, contextIsolation: true },
    });
    const wc = win.webContents;
    let done = false;
    let timer = null;
    const finish = (err, url) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (!win.isDestroyed()) win.destroy();
      if (err) reject(X.fail(err)); else resolve(url);
    };
    // L'adresse de retour n'existe pas : on l'intercepte avant toute requête.
    const check = (e, url) => {
      if (!String(url).startsWith(redirect)) return;
      e.preventDefault();
      finish(null, url);
    };
    wc.on('will-redirect', check);
    wc.on('will-navigate', check);
    wc.setWindowOpenHandler((o) => {
      if (String(o.url).startsWith(redirect)) finish(null, o.url);
      return { action: 'deny' };
    });
    win.on('closed', () => finish('The user did not approve access.'));
    if (interactive) win.once('ready-to-show', () => { if (!done) win.show(); });
    else {
      // Sans interaction : la page doit rediriger d'elle-même, et vite.
      const wait = clamp(Number(d.timeoutMsForNonInteractive) || 0, 0, 60000);
      const expire = () => finish('User interaction required.');
      if (d.abortOnLoadForNonInteractive === false && wait) timer = setTimeout(expire, wait);
      else {
        wc.once('did-finish-load', () => { timer = setTimeout(expire, wait || 300); });
        timer = setTimeout(expire, 30000);
      }
    }
    wc.loadURL(start.href).catch((err) => {
      // Une navigation interrompue par l'interception n'est pas un échec.
      if (!done && !/ERR_ABORTED|\(-3\)/.test(String(err && err.message))) finish('Authorization page could not be loaded.');
    });
  });
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// --- Téléchargements -----------------------------------------------------------------

const downloads = new Map(); // identifiant -> { id, ses, extId, url, item, filename, state, … }
const watched = new WeakSet(); // sessions dont les téléchargements sont suivis
const expected = []; // demandes de chrome.downloads.download en attente de leur « will-download »
let downloadSeq = 0;

function downloadObject(d) {
  const item = d.item;
  let received = d.received;
  let total = d.total;
  try { received = item.getReceivedBytes(); total = item.getTotalBytes(); } catch {}
  return {
    id: d.id, url: d.url, finalUrl: d.url, filename: d.filename || '', mime: d.mime || '', startTime: new Date(d.startedAt).toISOString(),
    state: d.state, paused: false, canResume: false, danger: 'safe', incognito: false, exists: d.state !== 'interrupted',
    bytesReceived: received || 0, totalBytes: total || -1, fileSize: total || -1, byExtensionId: d.extId, byExtensionName: d.name,
  };
}

function watchDownloads(ses) {
  if (watched.has(ses)) return;
  watched.add(ses);
  ses.on('will-download', (e, item) => {
    const at = expected.findIndex((x) => x.ses === ses && x.url === item.getURL());
    if (at < 0) return;
    const d = expected.splice(at, 1)[0];
    clearTimeout(d.timer);
    d.item = item;
    d.mime = item.getMimeType();
    // Nom proposé par l'extension : traité comme celui d'un site (un simple nom,
    // sans dossier ni caractère caché, jamais à la place d'un fichier existant), et
    // l'enregistrement de la Bibliothèque suit (src/main/downloads.js, `rename`).
    if (d.wanted) require('./downloads').rename(item, d.wanted);
    d.filename = item.getSavePath() || '';
    X.emit(ses, d.extId, 'downloads.onCreated', [downloadObject(d)]);
    item.once('done', (ev, state) => {
      d.state = state === 'completed' ? 'complete' : 'interrupted';
      d.received = item.getReceivedBytes();
      d.total = item.getTotalBytes();
      X.emit(ses, d.extId, 'downloads.onChanged', [{ id: d.id, state: { previous: 'in_progress', current: d.state } }]);
    });
  });
}

// Nom de fichier proposé par une extension : gardé tel quel jusqu'au téléchargement,
// où il est réduit à un simple nom (downloads.js).
function safeName(name) {
  return typeof name === 'string' ? name.slice(0, 1000) : '';
}

// --- API ----------------------------------------------------------------------------

api.extend({
  // tabs : zoom ---------------------------------------------------------------
  'tabs.getZoom': (ctx, [id]) => X.targetTab(ctx, id).wc.getZoomFactor(),
  'tabs.setZoom'(ctx, args) {
    // setZoom(facteur) ou setZoom(onglet, facteur) ; 0 remet le zoom par défaut.
    const [id, factor] = args.length >= 2 ? [args[0], args[1]] : [undefined, args[0]];
    const f = Number(factor);
    if (!Number.isFinite(f) || f < 0) throw X.fail('Invalid zoom factor.');
    X.targetTab(ctx, typeof id === 'number' ? id : undefined).wc.setZoomFactor(f === 0 ? 1 : clamp(f, 0.25, 5));
  },
  'tabs.getZoomSettings': () => ({ mode: 'automatic', scope: 'per-origin', defaultZoomFactor: 1 }),
  'tabs.setZoomSettings': () => {},

  // tabs.group, tabGroups -------------------------------------------------------
  'tabs.group'(ctx, [o]) {
    const d = o || {};
    const ids = [].concat(d.tabIds == null ? [] : d.tabIds).map((id) => X.findTab(ctx, id));
    if (!ids.length) throw X.fail('At least one tab must be given.');
    let g;
    if (typeof d.groupId === 'number') g = findGroup(ctx, d.groupId);
    leaveGroups(ctx, ids.filter((t) => !g || !g.tabs.has(t.id)).map((t) => t.id));
    let created = false;
    if (!g || !groups.has(g.id)) {
      const windowId = d.createProperties && typeof d.createProperties.windowId === 'number' ? d.createProperties.windowId : ids[0].windowId;
      g = g || { id: ++groupSeq, ses: ctx.ses, windowId, title: '', color: COLORS[groups.size % COLORS.length], collapsed: false, tabs: new Set() };
      groups.set(g.id, g);
      created = true;
    }
    for (const t of ids) g.tabs.add(t.id);
    if (created) groupEvent(g, 'onCreated');
    for (const t of ids) tabChanged(ctx, t.id);
    return g.id;
  },
  'tabs.ungroup'(ctx, [tabIds]) {
    const ids = [].concat(tabIds == null ? [] : tabIds).map((id) => X.findTab(ctx, id).id);
    leaveGroups(ctx, ids);
    for (const id of ids) tabChanged(ctx, id);
  },
  'tabGroups.get'(ctx, [id]) {
    X.need(ctx, 'tabGroups');
    return groupObject(findGroup(ctx, id));
  },
  'tabGroups.query'(ctx, [q]) {
    X.need(ctx, 'tabGroups');
    prune();
    const f = q || {};
    const current = api.host.currentWindowId(ctx.wc);
    return [...groups.values()].filter((g) => {
      if (g.ses !== ctx.ses) return false;
      if (typeof f.windowId === 'number' && (f.windowId === -2 ? current : f.windowId) !== g.windowId) return false;
      if (typeof f.collapsed === 'boolean' && f.collapsed !== g.collapsed) return false;
      if (typeof f.color === 'string' && f.color !== g.color) return false;
      if (typeof f.title === 'string' && f.title !== g.title) return false;
      return true;
    }).map(groupObject);
  },
  'tabGroups.update'(ctx, [id, props]) {
    X.need(ctx, 'tabGroups');
    const g = findGroup(ctx, id);
    const p = props || {};
    if (typeof p.title === 'string') g.title = p.title.slice(0, 200);
    if (COLORS.includes(p.color)) g.color = p.color;
    if (typeof p.collapsed === 'boolean') g.collapsed = p.collapsed;
    groupEvent(g, 'onUpdated');
    return groupObject(g);
  },
  'tabGroups.move'(ctx, [id]) {
    X.need(ctx, 'tabGroups');
    return groupObject(findGroup(ctx, id));
  },

  // identity --------------------------------------------------------------------
  'identity.launchWebAuthFlow'(ctx, [d]) {
    X.need(ctx, 'identity');
    return webAuthFlow(ctx, d);
  },
  // Orbe n'a pas de compte Google : aucun jeton à donner.
  'identity.getAuthToken'(ctx) {
    X.need(ctx, 'identity');
    throw X.fail('OAuth2 not granted or revoked. Orbe n’a pas de compte Google : utiliser launchWebAuthFlow.');
  },
  'identity.getProfileUserInfo'(ctx) {
    X.need(ctx, 'identity');
    return { email: '', id: '' };
  },
  'identity.getAccounts': (ctx) => { X.need(ctx, 'identity'); return []; },
  'identity.removeCachedAuthToken': (ctx) => { X.need(ctx, 'identity'); },
  'identity.clearAllCachedAuthTokens': (ctx) => { X.need(ctx, 'identity'); },

  // downloads -------------------------------------------------------------------
  'downloads.download'(ctx, [o]) {
    X.need(ctx, 'downloads');
    const url = String((o && o.url) || '');
    // Adresse web, image « data: », ou donnée produite par l'extension elle-même.
    if (!/^(https?|data):/i.test(url) && !url.startsWith(`blob:chrome-extension://${ctx.id}/`)) throw X.fail('Invalid URL.');
    watchDownloads(ctx.ses);
    const d = { id: ++downloadSeq, ses: ctx.ses, extId: ctx.id, name: ctx.ext.name, url, wanted: safeName(o && o.filename), state: 'in_progress', startedAt: Date.now(), item: null, filename: '', received: 0, total: 0 };
    downloads.set(d.id, d);
    if (downloads.size > 200) downloads.delete(downloads.keys().next().value);
    expected.push(d);
    d.timer = setTimeout(() => { const at = expected.indexOf(d); if (at >= 0) { expected.splice(at, 1); d.state = 'interrupted'; } }, 30000);
    // Une adresse « blob: » n'existe que dans la page qui l'a créée.
    if (url.startsWith('blob:') && ctx.wc && !ctx.wc.isDestroyed()) ctx.wc.downloadURL(url);
    else ctx.ses.downloadURL(url);
    return d.id;
  },
  'downloads.search'(ctx, [q]) {
    X.need(ctx, 'downloads');
    const f = q || {};
    let list = [...downloads.values()].filter((d) => d.ses === ctx.ses && d.extId === ctx.id);
    if (typeof f.id === 'number') list = list.filter((d) => d.id === f.id);
    if (typeof f.state === 'string') list = list.filter((d) => d.state === f.state);
    if (typeof f.url === 'string') list = list.filter((d) => d.url === f.url);
    list.sort((a, b) => b.startedAt - a.startedAt);
    return list.slice(0, Number.isInteger(f.limit) && f.limit > 0 ? f.limit : 1000).map(downloadObject);
  },
  'downloads.show'(ctx, [id]) {
    X.need(ctx, 'downloads');
    const d = downloads.get(id);
    if (d && d.extId === ctx.id && d.filename) require('electron').shell.showItemInFolder(d.filename);
  },
  'downloads.erase': (ctx) => { X.need(ctx, 'downloads'); return []; },
});

function setup(options = {}) {
  Object.assign(links, options);
  api.host.groupOf = groupOf;
  api.host.shortcutOf = shortcutOf;
  watchKeys();
}

// Les raccourcis d'Orbe ont changé : la liste réservée est à recalculer.
function forgetReserved() { reservedSet = null; }

module.exports = { forgetReserved, reserved, setup, onKey, shortcuts, shortcutOf, parseShortcut, parseAccelerator, fromAccelerator, comboOf, groups, commandList, assignKey, setKey, forgetKeys };
