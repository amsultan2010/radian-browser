// Extensions Chrome : ce qu'Orbe fournit à la couche d'API (ext-api.js).
//   - ses onglets et ses fenêtres, vus comme ceux de Chrome (`chrome.tabs`,
//     `chrome.windows`) : un onglet d'extension est un onglet vivant d'Orbe, et
//     son identifiant est celui de son webContents — le même que celui
//     qu'Electron donne déjà dans `sender.tab.id` et attend dans
//     `tabs.sendMessage` ou `scripting.executeScript` ;
//   - les événements d'onglets, déduits du modèle par comparaison (`sync`) ;
//   - la fenêtre surgissante du bouton d'une extension (`openPopup`).
const { BrowserWindow, dialog, screen } = require('electron');
const api = require('./ext-api');
const panel = require('./ext-panel'); // chrome.sidePanel
const debug = require('./ext-debug'); // chrome.debugger
const more = require('./ext-more'); // commands, identity, tabGroups…
const access = require('./ext-access'); // activeTab
const { store } = require('./store');
const { boundsOf } = require('./motion');

// Chargé à la demande : window.js dépend de sessions.js, qui dépend de ext-api.js.
let windowModule = null;
const W = () => windowModule || (windowModule = require('./window'));

const known = new Map(); // id webContents -> { windowId, active, session }
const knownWindows = new Set();
const popups = new Map(); // id webContents de la fenêtre surgissante -> { owner, id, win }
let focusedId = -1; // fenêtre au premier plan, telle qu'annoncée aux extensions
let lastFocused = null; // dernière fenêtre Orbe utilisée

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function describe(rt, index) {
  const owner = rt.owner;
  const data = owner.data.tabs[rt.id] || {};
  const shown = rt.wc.getURL();
  const b = boundsOf(rt.view);
  return {
    id: rt.wc.id,
    key: rt.id,
    wc: rt.wc,
    session: rt.wc.session,
    windowId: owner.win.id,
    active: owner.activeId === rt.id,
    index,
    pinned: !!data.homeUrl,
    incognito: !!owner.incognito,
    title: data.title || rt.wc.getTitle() || '',
    // Sur la page d'erreur d'Orbe, l'adresse utile est celle qui a échoué.
    url: (shown && !W().isInternal(shown) ? shown : data.url) || '',
    favIconUrl: data.favicon || '',
    status: rt.loading ? 'loading' : 'complete',
    audible: rt.wc.isCurrentlyAudible(),
    muted: rt.wc.isAudioMuted(),
    width: b.width,
    height: b.height,
    lastAccessed: rt.lastUsed || 0,
  };
}

// Onglets vivants, hors pages internes d'Orbe. Les onglets en veille n'ont pas
// de webContents : pour une extension, ils n'existent pas.
function tabs() {
  const out = [];
  const count = new Map();
  for (const rt of W().live.values()) {
    if (rt.internal || rt.wc.isDestroyed() || rt.owner.win.isDestroyed()) continue;
    const n = count.get(rt.owner) || 0;
    count.set(rt.owner, n + 1);
    out.push(describe(rt, n));
  }
  return out;
}

const tabOf = (wc) => tabs().find((t) => t.wc === wc) || null;
const rtOf = (id) => [...W().live.values()].find((rt) => !rt.wc.isDestroyed() && rt.wc.id === id) || null;

function windows() {
  return W().OrbeWindow.all.filter((w) => !w.win.isDestroyed()).map((w) => ({
    id: w.win.id,
    focused: w.win.id === focusedId,
    incognito: !!w.incognito,
    state: w.win.isFullScreen() ? 'fullscreen' : w.win.isMinimized() ? 'minimized' : w.win.isMaximized() ? 'maximized' : 'normal',
    bounds: w.win.getBounds(),
  }));
}

function lastWindow() {
  const { OrbeWindow } = W();
  if (lastFocused && !lastFocused.win.isDestroyed()) return lastFocused;
  return OrbeWindow.primary || OrbeWindow.all[0] || null;
}

// Fenêtre « courante » d'un appelant : celle de son onglet, celle sur laquelle
// sa fenêtre surgissante est ouverte, sinon la dernière fenêtre utilisée.
function currentWindowId(wc) {
  if (wc) {
    const pop = popups.get(wc.id);
    if (pop && !pop.owner.win.isDestroyed()) return pop.owner.win.id;
    const side = panel.ownerOf(wc);
    if (side && !side.win.isDestroyed()) return side.win.id;
    const owner = W().OrbeWindow.ownerOf(wc);
    if (owner) return owner.win.id;
  }
  const w = lastWindow();
  return w ? w.win.id : -1;
}

// --- Événements ----------------------------------------------------------------

function watch(wc) {
  const fire = (change) => { const t = tabOf(wc); if (t) api.notify.tabUpdated({ ...t, ...('status' in change ? { status: change.status } : {}) }, change); };
  const nav = (name, url, frame) => { const t = tabOf(wc); if (t) api.notify.navigation(t, name, url, frame); };
  wc.on('did-start-loading', () => fire({ status: 'loading' }));
  wc.on('did-stop-loading', () => fire({ status: 'complete' }));
  wc.on('page-title-updated', (e, title) => fire({ title: String(title) }));
  wc.on('page-favicon-updated', (e, icons) => fire({ favIconUrl: icons[0] || '' }));
  wc.on('audio-state-changed', () => fire({ audible: wc.isCurrentlyAudible() }));
  wc.on('did-start-navigation', (d) => { if (!d.isSameDocument) nav('onBeforeNavigate', d.url, d.frame); });
  wc.on('did-frame-navigate', (e, url, code, status, isMainFrame, processId, routingId) => {
    if (isMainFrame) fire({ url });
    nav('onCommitted', url, isMainFrame ? null : frameFrom(processId, routingId));
  });
  wc.on('did-navigate-in-page', (e, url, isMainFrame, processId, routingId) => {
    if (isMainFrame) fire({ url });
    nav('onHistoryStateUpdated', url, isMainFrame ? null : frameFrom(processId, routingId));
  });
  wc.on('dom-ready', () => nav('onDOMContentLoaded', wc.getURL(), null));
  wc.on('did-frame-finish-load', (e, isMainFrame, processId, routingId) => {
    const frame = isMainFrame ? null : frameFrom(processId, routingId);
    nav('onCompleted', frame ? frame.url : wc.getURL(), frame);
  });
}

function frameFrom(processId, routingId) {
  try { return require('electron').webFrameMain.fromId(processId, routingId) || null; } catch { return null; }
}

// Compare le modèle d'Orbe à ce que les extensions savent déjà, et envoie les
// événements correspondants. Appelé à chaque changement d'état des fenêtres :
// une erreur ici ne doit jamais interrompre Orbe (fermeture d'une fenêtre…).
function sync() {
  try {
    compare();
    // Le panneau latéral et le bandeau du débogueur suivent l'onglet actif.
    panel.refreshAll();
    debug.refreshAll();
  } catch (err) {
    console.error('[orbe] extensions : synchronisation des onglets', err);
  }
}

function compare() {
  const { OrbeWindow } = W();
  const now = tabs();
  const seen = new Set();
  for (const t of now) {
    seen.add(t.id);
    if (known.has(t.id)) continue;
    known.set(t.id, { windowId: t.windowId, active: false, session: t.session });
    watch(t.wc);
    api.notify.tabCreated(t);
  }
  for (const [id, k] of known) {
    if (seen.has(id)) continue;
    known.delete(id);
    api.notify.tabRemoved(id, k.windowId, k.session);
  }
  for (const t of now) {
    const k = known.get(t.id);
    if (t.active && !k.active) api.notify.tabActivated(t);
    k.active = t.active;
    k.windowId = t.windowId;
  }
  const list = windows();
  for (const w of list) if (!knownWindows.has(w.id)) { knownWindows.add(w.id); api.notify.windowCreated(w); }
  for (const id of [...knownWindows]) if (!list.some((w) => w.id === id)) { knownWindows.delete(id); api.notify.windowRemoved(id); }
  const f = OrbeWindow.focused;
  if (f) lastFocused = f;
  if (lastFocused && lastFocused.win.isDestroyed()) lastFocused = null;
  // Une fenêtre surgissante au premier plan ne retire pas le « focus » à sa fenêtre.
  const popupFocused = [...popups.values()].some((p) => !p.win.isDestroyed() && p.win.isFocused());
  const id = f ? f.win.id : popupFocused && lastFocused ? lastFocused.win.id : -1;
  if (id !== focusedId) { focusedId = id; api.notify.windowFocused(id); }
}

// --- Actions demandées par les extensions --------------------------------------

function createTab({ url, active, windowId }) {
  const { OrbeWindow, live } = W();
  let w = OrbeWindow.all.find((x) => x.win.id === windowId && !x.win.isDestroyed()) || lastWindow();
  if (w && w.incognito) w = OrbeWindow.primary;
  if (!w) return null;
  // Pas de newTab() : celui-ci interprète sa saisie, et prendrait une adresse
  // chrome-extension:// pour une recherche.
  const tab = w.createTab(url);
  if (active) w.activate(tab.id);
  else {
    w.ensureView(tab.id);
    OrbeWindow.trimLive();
    w.changed();
  }
  sync();
  const rt = live.get(tab.id);
  return rt ? rt.wc.id : null;
}

function removeTab(id) {
  const rt = rtOf(id);
  if (rt) rt.owner.close(rt.id);
}

function activateTab(id) {
  const rt = rtOf(id);
  if (rt) rt.owner.activate(rt.id);
}

function focusWindow(id) {
  const w = W().OrbeWindow.all.find((x) => x.win.id === id);
  if (w && !w.win.isDestroyed()) w.win.focus();
}

async function confirmPermissions(ext, names) {
  const w = lastWindow();
  const opts = {
    type: 'question',
    message: store.t('ext.permAsk', null, { name: ext.name }),
    detail: names.join(', '),
    buttons: [store.t('perm.allow'), store.t('perm.deny')],
    defaultId: 1,
    cancelId: 1,
  };
  const r = await (w ? dialog.showMessageBox(w.win, opts) : dialog.showMessageBox(opts));
  return r.response === 0;
}

// --- Fenêtre surgissante --------------------------------------------------------

function activeTab(w) {
  const rt = w.activeRt;
  return rt && !rt.internal && !rt.wc.isDestroyed() ? tabs().find((t) => t.wc === rt.wc) || null : null;
}

function closePopup(w) {
  for (const p of popups.values()) if (!w || p.owner === w) { if (!p.win.isDestroyed()) p.win.close(); }
}

// Boutons d'extension à afficher pour l'onglet actif d'une fenêtre.
function actionsFor(w) {
  if (!w || w.incognito) return [];
  const tab = activeTab(w);
  const ses = tab ? tab.session : w.session;
  return api.actions(ses, tab ? tab.id : undefined);
}

// Clic sur le bouton d'une extension : ouvre sa fenêtre surgissante, ancrée
// dans la fenêtre d'Orbe (`anchor` : point { x, y } dans la fenêtre, coin
// supérieur gauche de la fenêtre surgissante), ou envoie `action.onClicked`.
// Renvoie la fenêtre ouverte, true si l'extension a seulement été prévenue,
// false sinon. `options.keepOpen` : ne pas refermer à la perte du focus (tests).
function openPopup(w, id, anchor, options = {}) {
  if (!w || w.win.isDestroyed() || w.incognito) return false;
  const tab = activeTab(w);
  const ses = tab ? tab.session : w.session;
  if (!api.isAttached(ses)) return false;
  lastFocused = w;
  for (const p of popups.values()) {
    // Second clic sur le même bouton : referme.
    if (p.owner === w && p.id === id && !p.win.isDestroyed()) { p.win.close(); return true; }
  }
  closePopup(w);
  // Extension qui compte sur « activeTab » : au premier clic, Orbe demande s'il
  // peut lui ouvrir les pages (voir ext-access.js), puis reprend le clic.
  if (access.needed(ses, id)) {
    access.offer(ses, id).then(() => { if (!w.win.isDestroyed()) openPopup(w, id, anchor, options); }).catch((err) => console.error('[orbe] extension', id, err));
    return true;
  }
  // L'extension a demandé que son bouton ouvre son panneau latéral.
  if (panel.actionClick(w, ses, id, tab)) return true;
  const what = api.clickAction(ses, id, tab);
  if (what !== 'popup') return what === 'clicked';
  const url = api.popupUrl(ses, id, tab ? tab.id : undefined);

  const pop = new BrowserWindow({
    parent: w.win,
    width: 320,
    height: 200,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: '#ffffff',
    webPreferences: { session: ses, sandbox: true, contextIsolation: true, enablePreferredSizeMode: true },
  });
  const wc = pop.webContents;
  const wcId = wc.id;
  popups.set(wcId, { owner: w, id, win: pop });
  const origin = `chrome-extension://${id}/`;

  const place = (width, height) => {
    if (pop.isDestroyed() || w.win.isDestroyed()) return;
    const base = w.win.getContentBounds();
    const a = anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y) ? anchor : { x: (w.sidebarVisible ? w.sidebarWidth : 0) + 12, y: 48 };
    const area = screen.getDisplayMatching(base).workArea;
    const x = clamp(Math.round(base.x + a.x), area.x + 4, Math.max(area.x + 4, area.x + area.width - width - 4));
    const y = clamp(Math.round(base.y + a.y), area.y + 4, Math.max(area.y + 4, area.y + area.height - height - 4));
    pop.setBounds({ x, y, width, height });
  };
  let shown = false;
  const show = () => {
    if (shown || pop.isDestroyed()) return;
    shown = true;
    pop.show();
    sync();
  };
  // Comme dans Chrome : la fenêtre prend la taille de son contenu (800 × 600 au plus).
  wc.on('preferred-size-changed', (e, size) => {
    place(clamp(Math.ceil(size.width), 25, 800), clamp(Math.ceil(size.height), 25, 600));
    setTimeout(show, 30);
  });
  wc.once('did-finish-load', () => setTimeout(show, 250));
  wc.on('will-navigate', (e, to) => { if (!to.startsWith(origin)) e.preventDefault(); });
  wc.setWindowOpenHandler((d) => {
    if (/^https?:/i.test(d.url) || d.url.startsWith(origin)) createTab({ url: d.url, active: true, windowId: w.win.id });
    return { action: 'deny' };
  });
  wc.on('before-input-event', (e, input) => { if (input.type === 'keyDown' && input.key === 'Escape') pop.close(); });
  pop.on('blur', () => { if (options.keepOpen) return; if (!wc.isDestroyed() && !wc.isDevToolsOpened()) pop.close(); });
  const ownerClosed = () => { if (!pop.isDestroyed()) pop.destroy(); };
  w.win.once('closed', ownerClosed);
  pop.on('closed', () => { popups.delete(wcId); if (!w.win.isDestroyed()) w.win.removeListener('closed', ownerClosed); sync(); });
  place(320, 200);
  wc.loadURL(url).catch(() => { if (!pop.isDestroyed()) pop.close(); });
  return pop;
}

// ⌘E : passe d'une extension à la suivante (EXT-4). Chaque appui ouvre l'extension
// suivante parmi celles dont le bouton est actif pour l'onglet (sa fenêtre, ou son
// action) ; après la dernière, la fenêtre ouverte se referme et le tour recommence.
// Renvoie l'identifiant ouvert, '' en fin de tour, null s'il n'y a aucune extension.
const CYCLE_HOLD = 4000; // une extension sans fenêtre : le tour continue pendant ce délai
function cycle(w, open = openPopup, now = Date.now(), actions = actionsFor(w)) {
  if (!w || w.win.isDestroyed()) return null;
  const list = actions.filter((x) => x.enabled !== false);
  if (!list.length) return null;
  let current = '';
  for (const p of popups.values()) if (p.owner === w && !p.win.isDestroyed()) current = p.id;
  if (!current && w.extCycle && now - w.extCycle.at < CYCLE_HOLD) current = w.extCycle.id;
  const at = list.findIndex((x) => x.id === current);
  const next = list[at + 1];
  if (!next) { closePopup(w); w.extCycle = null; return ''; }
  w.extCycle = { id: next.id, at: now };
  // Fenêtre de la même extension restée ouverte : `openPopup` la refermerait.
  if (current !== next.id) open(w, next.id);
  return next.id;
}

// Extension qui plante (EXT-6). La page d'arrière-plan d'une extension (manifeste 2)
// dont le processus disparaît ne revient pas d'elle-même : l'extension est
// désactivée, avec un message qui mène aux réglages (la réactiver la relance).
// Un service worker (manifeste 3), lui, est relancé par Chromium au prochain
// événement, et Electron ne dit pas s'il s'est arrêté ou s'il a planté : rien à faire.
const CRASHED = new Set(['crashed', 'oom', 'abnormal-exit', 'launch-failed', 'integrity-failure']);
function backgroundGone(wc, details, deps = {}) {
  const ext = deps.extensions || require('./extensions');
  let id = '';
  try {
    if (!wc || wc.getType() !== 'backgroundPage') return false;
    const u = new URL(wc.getURL());
    if (u.protocol === 'chrome-extension:') id = u.hostname;
  } catch { return false; }
  if (!id || !details || !CRASHED.has(details.reason) || !ext.isEnabled(id)) return false;
  const rec = ext.list().find((x) => x.id === id);
  if (!ext.setEnabled(id, false)) return false;
  console.error(`[orbe] extension ${id} : page d'arrière-plan perdue (${details.reason}), extension désactivée`);
  const w = lastWindow();
  if (w && !w.win.isDestroyed()) w.toast(store.t('ext.crashed', null, { name: String((rec && rec.name) || id).slice(0, 60) }), null, () => require('./commands').hooks.openSettings('extensions'));
  try { require('./menu').refresh(true); } catch {}
  return true;
}

function setup() {
  require('electron').app.on('render-process-gone', (e, wc, details) => { try { backgroundGone(wc, details); } catch (err) { console.error('[orbe] extension', err); } });
  Object.assign(api.host, {
    tabs, windows, currentWindowId, createTab, removeTab, activateTab, focusWindow, confirmPermissions,
    openPopup: (ses, id) => { const w = lastWindow(); return !!(w && openPopup(w, id)); },
  });
  // Place du panneau latéral dans la fenêtre (voir contentRect et layout, window.js).
  Object.assign(W().hooks, {
    rightInset: (w) => panel.rightInset(w),
    layout: (w) => { panel.place(w); debug.place(w); },
  });
  access.setup();
  more.setup({ openAction: (w, id) => openPopup(w, id), ownerOf: (wc) => panel.ownerOf(wc) });
}

module.exports = { setup, sync, openPopup, closePopup, cycle, backgroundGone, CYCLE_HOLD, actionsFor, tabs, popups, panel, debug, more, access };
