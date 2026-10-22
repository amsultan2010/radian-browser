// Extensions Chrome : panneau latéral (`chrome.sidePanel`).
//
// Le panneau est une vue web posée à droite de la zone des pages, dans la
// fenêtre d'Orbe : la page de l'extension (dans la session du profil de
// l'onglet), sous un habillage d'Orbe (titre, bouton de fermeture, bord gauche
// à tirer pour régler la largeur). La zone des pages rétrécit d'autant :
// window.js demande la place à réserver (`hooks.rightInset`) et prévient à
// chaque mise en page (`hooks.layout`).
//
// Comme dans Chrome, une extension a un panneau « global » (le même pour tous
// les onglets de la fenêtre) et peut en avoir un propre à un onglet
// (`setOptions({ tabId, path })`, `open({ tabId })`) : celui-ci ne se montre que
// sur son onglet, et y remplace le panneau global.
//
// Écrit pour Orbe à partir de la documentation publique de chrome.sidePanel.
const { WebContentsView, ipcMain } = require('electron');
const path = require('path');
const api = require('./ext-api');

const X = api.internals;
const GAP = 8; // même écart qu'entre deux volets (window.js)
const PAD = 10; // même marge qu'autour des pages (window.js)
const RADIUS = 10;
const HEADER = 34;
const MIN = 260;
const DEFAULT = 380;
const PAGE = 'orbe://app/panel.html';
const PRELOAD = path.join(__dirname, '../preload/panel.js');
const CHANNEL = 'orbe-panel';

let windowModule = null;
const W = () => windowModule || (windowModule = require('./window'));

const records = new Map(); // OrbeWindow -> { global, tabs: Map(id d'onglet -> panneau), shown, chrome, ready }
const owners = new Map(); // id webContents d'un panneau -> OrbeWindow
const chromes = new Map(); // id webContents d'un habillage -> { w, on(action, données) }
let ipcReady = false;
let dragging = false;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// --- Réglages d'une extension (setOptions) -------------------------------------

function settings(ctx) {
  return ctx.st.panel || (ctx.st.panel = { global: {}, tabs: new Map() });
}

// Réglages en vigueur pour un onglet : les siens, sinon les réglages globaux,
// sinon le manifeste (`side_panel.default_path`).
function optionsOf(ctx, tabId) {
  const s = settings(ctx);
  const own = typeof tabId === 'number' ? s.tabs.get(tabId) : null;
  const base = ctx.manifest.side_panel && typeof ctx.manifest.side_panel.default_path === 'string' ? ctx.manifest.side_panel.default_path : undefined;
  const rel = own && own.path !== undefined ? own.path : s.global.path !== undefined ? s.global.path : base;
  const enabled = own && own.enabled !== undefined ? own.enabled : s.global.enabled !== undefined ? s.global.enabled : true;
  return { path: rel, enabled, specific: !!(own && own.path !== undefined), url: enabled ? urlOf(ctx, rel) : '' };
}

// Seule une page de l'extension elle-même peut servir de panneau.
function urlOf(ctx, rel) {
  if (typeof rel !== 'string' || !rel) return '';
  try {
    const u = new URL(rel, ctx.ext.url);
    return u.protocol === 'chrome-extension:' && u.host === ctx.id ? u.href : '';
  } catch {
    return '';
  }
}

const openOnClick = (id) => !!X.diskOf(id).panelOnClick;

// --- Vues -------------------------------------------------------------------------

function recordOf(w) {
  let rec = records.get(w);
  if (!rec) {
    rec = { global: null, tabs: new Map(), shown: null, chrome: null, ready: false };
    records.set(w, rec);
    w.win.once('closed', () => {
      for (const p of [rec.global, ...rec.tabs.values()]) if (p) destroy(p, false);
      if (rec.chrome) disposeChrome(rec.chrome);
      records.delete(w);
    });
  }
  return rec;
}

// Vue d'habillage d'Orbe (page orbe://app/panel.html) : en-tête du panneau, ou
// bandeau du débogueur. `on(action, données)` reçoit ses messages.
function makeChrome(w, mode, on) {
  if (!ipcReady) {
    ipcReady = true;
    ipcMain.on(CHANNEL, (e, action, data) => {
      const c = chromes.get(e.sender.id);
      if (!c || !e.senderFrame || !e.senderFrame.url.startsWith(PAGE) || typeof action !== 'string') return;
      c.on(action, data);
    });
  }
  const view = new WebContentsView({ webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true } });
  view.setBackgroundColor('#00000000');
  const wc = view.webContents;
  chromes.set(wc.id, { w, on });
  owners.set(wc.id, w);
  wc.on('will-navigate', (e) => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('before-input-event', (e, input) => w.onInput(e, input, true));
  wc.loadURL(`${PAGE}#${mode}`);
  return view;
}

function disposeChrome(view) {
  const wc = view.webContents;
  chromes.delete(wc.id);
  owners.delete(wc.id);
  if (!wc.isDestroyed()) wc.close();
}

function detach(w, view) {
  try { w.win.contentView.removeChildView(view); } catch {}
}

function create(w, ctx, tabId, url, auto) {
  const view = new WebContentsView({ webPreferences: { session: ctx.ses, sandbox: true, contextIsolation: true } });
  view.setBackgroundColor('#ffffff');
  view.setBorderRadius(RADIUS);
  const wc = view.webContents;
  const p = { w, extId: ctx.id, ses: ctx.ses, tabId, url, view, wc, auto: !!auto, name: ctx.ext.name, gone: false };
  owners.set(wc.id, w);
  const origin = `chrome-extension://${ctx.id}/`;
  wc.on('will-navigate', (e, to) => { if (!to.startsWith(origin)) e.preventDefault(); });
  wc.setWindowOpenHandler((d) => {
    if (/^https?:/i.test(d.url) || d.url.startsWith(origin)) api.host.createTab({ url: d.url, active: true, windowId: w.win.id, session: ctx.ses });
    return { action: 'deny' };
  });
  wc.on('before-input-event', (e, input) => w.onInput(e, input, false));
  // `window.close()` dans la page du panneau : le panneau se ferme.
  wc.once('destroyed', () => { if (!p.gone) { destroy(p, true); refresh(w); } });
  // `sidePanel.open` ne répond qu'une fois la page chargée : l'extension lui
  // écrit souvent aussitôt après.
  p.loaded = new Promise((resolve) => {
    for (const ev of ['did-finish-load', 'did-fail-load', 'destroyed']) wc.once(ev, resolve);
    setTimeout(resolve, 5000);
  });
  wc.loadURL(url).catch(() => {});
  X.emit(ctx.ses, ctx.id, 'sidePanel.onOpened', [eventInfo(p)]);
  return p;
}

function eventInfo(p) {
  const info = { windowId: p.w.win.id, path: p.url.replace(/^chrome-extension:\/\/[a-p]{32}\//, '') };
  if (p.tabId != null) info.tabId = p.tabId;
  return info;
}

// Retire un panneau de sa fenêtre et détruit sa page. À faire suivre de
// `refresh` : c'est lui qui rend la place aux pages.
function destroy(p, notify = true) {
  if (p.gone) return;
  p.gone = true;
  const rec = records.get(p.w);
  if (rec) {
    if (rec.global === p) rec.global = null;
    if (rec.tabs.get(p.tabId) === p) rec.tabs.delete(p.tabId);
    // Les pages propres à un onglet ouvertes pour ce panneau global partent avec lui.
    if (p.tabId == null) for (const other of [...rec.tabs.values()]) if (other.auto && other.extId === p.extId) destroy(other, notify);
  }
  owners.delete(p.wc.id);
  if (!p.w.win.isDestroyed()) detach(p.w, p.view);
  if (!p.wc.isDestroyed()) p.wc.close();
  if (notify) X.emit(p.ses, p.extId, 'sidePanel.onClosed', [eventInfo(p)]);
}

const activeRt = (w) => { const rt = w.activeRt; return rt && !rt.internal && !rt.wc.isDestroyed() ? rt : null; };

// Panneau à montrer dans une fenêtre, pour son onglet actif.
function pick(w, rec) {
  if (w.win.isDestroyed()) return null;
  const rt = activeRt(w);
  const tabId = rt ? rt.wc.id : null;
  const own = tabId != null ? rec.tabs.get(tabId) : null;
  if (own) return own;
  const g = rec.global;
  if (!g || (rt && rt.wc.session !== g.ses)) return null;
  const ctx = X.context(g.ses, g.extId);
  if (!ctx) return null;
  const o = optionsOf(ctx, tabId);
  if (!o.url) return null; // désactivé sur cet onglet
  if (o.specific && o.url !== g.url) {
    const p = create(w, ctx, tabId, o.url, true);
    rec.tabs.set(tabId, p);
    return p;
  }
  return g;
}

// Largeur du panneau : celle qu'a réglée l'utilisateur, bornée par la fenêtre.
function widthIn(w) {
  const [width] = w.win.getContentSize();
  const side = w.sidebarVisible ? w.sidebarWidth : PAD;
  const wanted = Number(X.ui().panelWidth) || DEFAULT;
  return clamp(Math.round(wanted), MIN, Math.max(MIN, width - side - PAD - GAP - 280));
}

// Place à réserver à droite de la zone des pages (appelé par window.js).
function rightInset(w) {
  const rec = records.get(w);
  return rec && rec.shown && !rec.shown.gone && !w.htmlFullscreen ? widthIn(w) + GAP : 0;
}

// Pose le panneau et son habillage (appelé par window.js à chaque mise en page).
function place(w) {
  const rec = records.get(w);
  if (!rec || !rec.shown || rec.shown.gone || w.win.isDestroyed()) return;
  const visible = !w.htmlFullscreen;
  rec.chrome.setVisible(visible);
  rec.shown.view.setVisible(visible);
  if (!visible) return;
  const [width] = w.win.getContentSize();
  const rect = w.contentRect();
  const pw = widthIn(w);
  const x = width - PAD - pw;
  // L'habillage déborde à gauche sur l'écart : c'est la poignée de réglage.
  rec.chrome.setBounds({ x: x - GAP, y: rect.y, width: pw + GAP, height: rect.height });
  rec.shown.view.setBounds({ x, y: rect.y + HEADER, width: pw, height: Math.max(40, rect.height - HEADER) });
}

function sendChrome(w, rec) {
  if (!rec.chrome || !rec.ready || !rec.shown || rec.chrome.webContents.isDestroyed()) return;
  const p = rec.shown;
  const info = api.actionInfo(p.ses, p.extId, undefined);
  const { store } = require('./store');
  rec.chrome.webContents.send(CHANNEL, { mode: 'panel', title: p.name, icon: (info && info.icon) || '', close: store.t('ext.panelClose'), dark: require('electron').nativeTheme.shouldUseDarkColors });
}

// Recalcule ce qu'une fenêtre doit montrer, et l'affiche.
function refresh(w) {
  const rec = records.get(w);
  if (!rec || w.win.isDestroyed()) return;
  // Onglets fermés, extensions retirées.
  const liveTabs = new Set(api.host.tabs().filter((t) => t.windowId === w.win.id).map((t) => t.id));
  for (const p of [rec.global, ...rec.tabs.values()]) {
    if (!p) continue;
    if (!X.context(p.ses, p.extId)) destroy(p, false);
    else if (p.tabId != null && !liveTabs.has(p.tabId)) destroy(p, true);
  }
  const before = rec.shown;
  const next = pick(w, rec);
  if (next === before) { if (next) place(w); return; }
  if (before && !before.gone) detach(w, before.view);
  rec.shown = next;
  if (next) {
    if (!rec.chrome) {
      rec.chrome = makeChrome(w, 'panel', (action, data) => onChrome(w, action, data));
      rec.chrome.webContents.once('did-finish-load', () => { rec.ready = true; sendChrome(w, rec); });
    }
    w.win.contentView.addChildView(rec.chrome);
    w.win.contentView.addChildView(next.view);
    // La barre de commande, si elle est ouverte, reste au-dessus.
    if (w.modalMode) w.win.contentView.addChildView(w.modal);
    sendChrome(w, rec);
  } else if (rec.chrome) detach(w, rec.chrome);
  w.layout();
  W().OrbeWindow.pushAll();
}

function refreshAll() {
  for (const w of [...records.keys()]) refresh(w);
}

// Messages de l'habillage : fermeture, réglage de la largeur à la souris.
function onChrome(w, action, data) {
  const rec = records.get(w);
  if (!rec) return;
  if (action === 'close') { if (rec.shown) userClose(w); return; }
  if (action === 'resize' && data && Number.isFinite(data.screenX)) {
    const b = w.win.getContentBounds();
    setWidth(w, b.x + b.width - PAD - data.screenX);
    dragging = true;
  }
  if (action === 'resizeEnd') { dragging = false; X.persist(); }
}

function setWidth(w, width) {
  const [total] = w.win.getContentSize();
  X.ui().panelWidth = clamp(Math.round(Number(width) || DEFAULT), MIN, Math.max(MIN, total - 2 * PAD - GAP - 280));
  if (!dragging) X.persist();
  for (const other of records.keys()) if (!other.win.isDestroyed()) other.layout();
  W().OrbeWindow.pushAll();
}

// Fermeture par l'utilisateur : le panneau affiché, et le panneau global dont
// il dépend.
function userClose(w) {
  const rec = records.get(w);
  if (!rec || !rec.shown) return false;
  const p = rec.shown;
  if (p.auto && rec.global && rec.global.extId === p.extId) destroy(rec.global);
  destroy(p);
  refresh(w);
  return true;
}

// Ouvre le panneau d'une extension dans une fenêtre : celui de l'onglet s'il en
// a un en propre, sinon le panneau global.
function openIn(w, ctx, tabId) {
  const rec = recordOf(w);
  const o = optionsOf(ctx, tabId);
  if (!o.url) throw X.fail(tabId != null ? `No active side panel for tabId: ${tabId}` : `No active side panel for windowId: ${w.win.id}`);
  const rt = activeRt(w);
  const target = tabId != null && o.specific ? tabId : null;
  let p = target != null ? rec.tabs.get(target) : rec.global;
  if (p && p.extId === ctx.id && p.url === o.url) p.auto = false;
  else {
    if (p) destroy(p);
    p = create(w, ctx, target, o.url, false);
    if (target != null) rec.tabs.set(target, p); else rec.global = p;
  }
  // Le panneau demandé prend la place de celui qu'une autre extension avait
  // ouvert sur l'onglet visé.
  const covered = tabId != null ? tabId : rt ? rt.wc.id : null;
  const other = covered != null ? rec.tabs.get(covered) : null;
  if (other && (other.extId !== ctx.id || (target == null && other.auto))) destroy(other);
  refresh(w);
  return p;
}

function closeIn(w, ctx, tabId) {
  const rec = records.get(w);
  if (!rec) return false;
  const list = tabId != null ? [rec.tabs.get(tabId)] : [rec.global, ...rec.tabs.values()];
  let any = false;
  for (const p of list) if (p && p.extId === ctx.id) { destroy(p); any = true; }
  refresh(w);
  return any;
}

// Après setOptions : les panneaux ouverts suivent leur nouvelle adresse, ou se
// ferment s'ils viennent d'être désactivés.
function reconcile(ctx) {
  for (const [w, rec] of records) {
    for (const p of [rec.global, ...rec.tabs.values()]) {
      if (!p || p.extId !== ctx.id || p.ses !== ctx.ses) continue;
      const o = optionsOf(ctx, p.tabId);
      if (!o.url) destroy(p);
      else if (o.url !== p.url) { p.url = o.url; p.wc.loadURL(o.url).catch(() => {}); }
    }
    refresh(w);
  }
}

const windowOf = (id) => W().OrbeWindow.all.find((x) => x.win.id === id && !x.win.isDestroyed()) || null;

// Clic sur le bouton de l'extension : ouvre ou referme son panneau, si elle l'a
// demandé (`setPanelBehavior({ openPanelOnActionClick: true })`).
function actionClick(w, ses, id, tab) {
  const ctx = X.context(ses, id);
  if (!ctx || !X.hasPermission(ctx, 'sidePanel') || !openOnClick(id) || w.incognito) return false;
  const tabId = tab ? tab.id : null;
  if (!optionsOf(ctx, tabId).url) return false;
  if (tab) X.grantTab(ctx.st, tab);
  const rec = records.get(w);
  if (rec && rec.shown && rec.shown.extId === id) { userClose(w); return true; }
  try { openIn(w, ctx, tabId); } catch { return false; }
  return true;
}

// --- API ----------------------------------------------------------------------------

function target(ctx, d) {
  const o = d || {};
  let tab = null;
  if (typeof o.tabId === 'number') tab = X.findTab(ctx, o.tabId);
  // Fenêtre désignée, sinon la fenêtre courante. Chrome refuserait un
  // identifiant inconnu ; mais l'onglet qu'Electron donne aux extensions
  // (`sender.tab`) porte un `windowId` qui n'est pas celui d'une fenêtre d'Orbe
  // (0), et elles le repassent tel quel à `sidePanel.open`.
  const w = (tab ? windowOf(tab.windowId) : windowOf(o.windowId)) || windowOf(api.host.currentWindowId(ctx.wc));
  if (!w || w.incognito) throw X.fail('No window to open the side panel in.');
  return { w, tabId: tab ? tab.id : null };
}

api.extend({
  'sidePanel.setOptions'(ctx, [d]) {
    X.need(ctx, 'sidePanel');
    const o = d || {};
    const s = settings(ctx);
    let own = s.global;
    if (typeof o.tabId === 'number') {
      X.findTab(ctx, o.tabId);
      own = s.tabs.get(o.tabId) || {};
      s.tabs.set(o.tabId, own);
    }
    if (o.path != null) {
      if (!urlOf(ctx, o.path)) throw X.fail(`Invalid path: "${o.path}".`);
      own.path = String(o.path);
    }
    if (typeof o.enabled === 'boolean') own.enabled = o.enabled;
    reconcile(ctx);
  },
  'sidePanel.getOptions'(ctx, [d]) {
    X.need(ctx, 'sidePanel');
    const tabId = d && typeof d.tabId === 'number' ? d.tabId : undefined;
    const o = optionsOf(ctx, tabId);
    const out = { enabled: o.enabled };
    if (o.path !== undefined) out.path = o.path;
    if (tabId !== undefined && settings(ctx).tabs.has(tabId)) out.tabId = tabId;
    return out;
  },
  async 'sidePanel.open'(ctx, [d]) {
    X.need(ctx, 'sidePanel');
    const t = target(ctx, d);
    await openIn(t.w, ctx, t.tabId).loaded;
  },
  'sidePanel.close'(ctx, [d]) {
    X.need(ctx, 'sidePanel');
    const t = target(ctx, d);
    closeIn(t.w, ctx, t.tabId);
  },
  'sidePanel.setPanelBehavior'(ctx, [d]) {
    X.need(ctx, 'sidePanel');
    if (d && typeof d.openPanelOnActionClick === 'boolean') { X.diskOf(ctx.id).panelOnClick = d.openPanelOnActionClick; X.persist(); }
  },
  'sidePanel.getPanelBehavior'(ctx) {
    X.need(ctx, 'sidePanel');
    return { openPanelOnActionClick: openOnClick(ctx.id) };
  },
  'sidePanel.getLayout': () => ({ side: 'right' }),
  // Pages de panneau ouvertes pour l'extension : complète runtime.getContexts.
  'runtime._panelContexts'(ctx) {
    const out = [];
    for (const [w, rec] of records) {
      for (const p of [rec.global, ...rec.tabs.values()]) {
        if (!p || p.extId !== ctx.id || p.ses !== ctx.ses || p.wc.isDestroyed()) continue;
        out.push({ contextType: 'SIDE_PANEL', contextId: `orbe-panel-${p.wc.id}`, documentUrl: p.wc.getURL() || p.url, documentOrigin: `chrome-extension://${ctx.id}`, frameId: 0, incognito: false, tabId: -1, windowId: w.win.id });
      }
    }
    return out;
  },
});

// Fenêtre d'Orbe à laquelle appartient la page d'un panneau (ou d'un habillage).
const ownerOf = (wc) => (wc && owners.get(wc.id)) || null;
// Panneau affiché dans une fenêtre : { extId, tabId, url, wc, view } ou null.
const shownIn = (w) => { const rec = records.get(w); return (rec && rec.shown && !rec.shown.gone && rec.shown) || null; };

module.exports = { rightInset, place, refresh, refreshAll, actionClick, ownerOf, shownIn, userClose, setWidth, widthIn, makeChrome, disposeChrome, records, HEADER, GAP, PAD, CHANNEL };
