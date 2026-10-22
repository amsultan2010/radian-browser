// Extensions Chrome : `chrome.debugger`, branché sur le débogueur d'Electron
// (`webContents.debugger`, protocole DevTools).
//
// Garde-fous :
//   - seule une extension qui déclare l'autorisation « debugger » y a accès, et
//     seulement sur les onglets d'Orbe (jamais l'interface, ni une autre
//     extension) ;
//   - tant qu'un onglet est piloté, un bandeau le dit dans la fenêtre, avec un
//     bouton pour arrêter (comme la barre d'information de Chrome) ;
//   - le débogueur d'Electron a plus de pouvoirs que celui que Chrome donne aux
//     extensions : les commandes qui sortent de l'onglet (autres cibles,
//     navigateur entier) sont refusées.
//
// Écrit pour Orbe à partir de la documentation publique de chrome.debugger.
const api = require('./ext-api');
const panel = require('./ext-panel');
const { store } = require('./store');
const unload = require('./unload');

const X = api.internals;
const CHANNEL = panel.CHANNEL;

let windowModule = null;
const W = () => windowModule || (windowModule = require('./window'));

const sessions = new Map(); // id d'onglet (webContents) -> { ses, extId, name, wc, onMessage, onDetach }
const banners = new Map(); // OrbeWindow -> { view, ready, tabId }

// Commandes refusées : elles donneraient accès à autre chose que l'onglet.
const DENIED_DOMAINS = new Set(['Browser', 'Tethering', 'SystemInfo', 'Tracing', 'HeadlessExperimental', 'Extensions']);
const TARGET_ALLOWED = new Set(['Target.setAutoAttach', 'Target.getTargetInfo', 'Target.detachFromTarget', 'Target.activateTarget', 'Target.setDiscoverTargets']);
const NAVIGABLE = /^(https?:|about:blank|data:|blob:)/i;

function allowed(ctx, method, params) {
  const domain = String(method).split('.')[0];
  if (DENIED_DOMAINS.has(domain)) return false;
  if (domain === 'Target' && !TARGET_ALLOWED.has(method)) return false;
  if (method === 'Page.navigate') {
    const url = String((params && params.url) || '');
    if (!NAVIGABLE.test(url) && !url.startsWith(ctx.ext.url)) return false;
  }
  return true;
}

function debuggee(ctx, target) {
  const d = target || {};
  let id = d.tabId;
  if (typeof id !== 'number' && typeof d.targetId === 'string' && /^orbe-tab-\d+$/.test(d.targetId)) id = Number(d.targetId.slice(9));
  if (typeof id !== 'number') throw X.fail('Seul un onglet peut être débogué (« tabId »).');
  return X.findTab(ctx, id);
}

function owned(ctx, t) {
  const s = sessions.get(t.id);
  if (!s || s.extId !== ctx.id || s.ses !== ctx.ses) throw X.fail(`Debugger is not attached to the tab with id: ${t.id}.`);
  return s;
}

// Fin d'une session : écouteurs retirés, extension prévenue, bandeau mis à jour.
function finish(tabId, reason) {
  const s = sessions.get(tabId);
  if (!s) return;
  sessions.delete(tabId);
  try {
    s.wc.debugger.removeListener('message', s.onMessage);
    s.wc.debugger.removeListener('detach', s.onDetach);
  } catch {}
  if (reason) X.emit(s.ses, s.extId, 'debugger.onDetach', [{ tabId }, reason]);
  refreshAll();
}

// Détache le débogueur d'un onglet (bouton « Arrêter », extension retirée…).
function stop(tabId, reason = 'canceled_by_user') {
  const s = sessions.get(tabId);
  if (!s) return false;
  finish(tabId, reason);
  try { if (!s.wc.isDestroyed() && s.wc.debugger.isAttached()) s.wc.debugger.detach(); } catch {}
  return true;
}

api.extend({
  'debugger.attach'(ctx, [target, version]) {
    X.need(ctx, 'debugger');
    const t = debuggee(ctx, target);
    const dbg = t.wc.debugger;
    unload.unshield(t.wc); // débogueur tenu un instant par Orbe (unload.js) : il le rend
    if (sessions.has(t.id) || dbg.isAttached()) throw X.fail(`Another debugger is already attached to the tab with id: ${t.id}.`);
    try {
      dbg.attach(typeof version === 'string' && /^\d+\.\d+$/.test(version) ? version : '1.3');
    } catch (err) {
      throw X.fail(`Cannot attach to the tab with id: ${t.id}. ${String((err && err.message) || err)}`);
    }
    const s = {
      ses: ctx.ses, extId: ctx.id, name: ctx.ext.name, wc: t.wc,
      onMessage: (e, method, params, sessionId) => {
        const source = { tabId: t.id };
        if (sessionId) source.sessionId = sessionId;
        X.emit(ctx.ses, ctx.id, 'debugger.onEvent', [source, method, params || {}]);
      },
      // Onglet fermé, ou outils de développement ouverts sur la page.
      onDetach: (e, reason) => finish(t.id, /closed/i.test(String(reason)) ? 'target_closed' : 'canceled_by_user'),
    };
    dbg.on('message', s.onMessage);
    dbg.on('detach', s.onDetach);
    sessions.set(t.id, s);
    refreshAll();
  },
  'debugger.detach'(ctx, [target]) {
    X.need(ctx, 'debugger');
    const t = debuggee(ctx, target);
    owned(ctx, t);
    finish(t.id, null);
    try { t.wc.debugger.detach(); } catch {}
  },
  async 'debugger.sendCommand'(ctx, [target, method, params]) {
    X.need(ctx, 'debugger');
    const t = debuggee(ctx, target);
    owned(ctx, t);
    if (typeof method !== 'string' || !/^[A-Za-z]+\.[A-Za-z]+$/.test(method)) throw X.fail('Commande invalide.');
    if (!allowed(ctx, method, params)) throw X.fail(`Commande refusée par Orbe : ${method}`);
    const sessionId = target && typeof target.sessionId === 'string' ? target.sessionId : undefined;
    try {
      return await t.wc.debugger.sendCommand(method, params && typeof params === 'object' ? params : {}, sessionId);
    } catch (err) {
      // Même forme que Chrome : le message est l'erreur du protocole, en JSON.
      throw X.fail(err && err.code !== undefined ? JSON.stringify({ code: err.code, message: err.message }) : String((err && err.message) || err));
    }
  },
  'debugger.getTargets'(ctx) {
    X.need(ctx, 'debugger');
    return X.visibleTabs(ctx).map((t) => ({ id: `orbe-tab-${t.id}`, type: 'page', tabId: t.id, title: t.title, url: t.url, attached: sessions.has(t.id) || t.wc.debugger.isAttached(), faviconUrl: t.favIconUrl || undefined }));
  },
});

// --- Bandeau ---------------------------------------------------------------------

// Onglet débogué visible dans une fenêtre : { key, tabId, name } ou null.
function debuggedIn(w) {
  const { live } = W();
  for (const key of w.visibleIds()) {
    const rt = live.get(key);
    const s = rt && !rt.wc.isDestroyed() ? sessions.get(rt.wc.id) : null;
    if (s) return { key, tabId: rt.wc.id, name: s.name };
  }
  return null;
}

function place(w) {
  const b = banners.get(w);
  if (!b || !b.shown || w.win.isDestroyed()) return;
  const ids = w.visibleIds();
  const pane = w.paneRects(w.contentRect(), ids)[Math.max(0, ids.indexOf(b.shown.key))];
  if (!pane) return;
  const width = Math.max(120, Math.min(480, pane.width - 24));
  b.view.setBounds({ x: Math.round(pane.x + (pane.width - width) / 2), y: pane.y + 8, width, height: 34 });
}

function refresh(w) {
  if (w.win.isDestroyed()) return;
  const found = debuggedIn(w);
  let b = banners.get(w);
  if (!found) {
    if (b && b.shown) { b.shown = null; try { w.win.contentView.removeChildView(b.view); } catch {} }
    return;
  }
  if (!b) {
    b = { view: null, ready: false, shown: null };
    banners.set(w, b);
    b.view = panel.makeChrome(w, 'banner', (action) => { if (action === 'stop' && b.shown) stop(b.shown.tabId); });
    b.view.webContents.once('did-finish-load', () => { b.ready = true; send(b); });
    w.win.once('closed', () => { panel.disposeChrome(b.view); banners.delete(w); });
  }
  const changed = !b.shown || b.shown.tabId !== found.tabId;
  if (!b.shown) w.win.contentView.addChildView(b.view);
  b.shown = found;
  if (changed) send(b);
  place(w);
}

function send(b) {
  if (!b.ready || !b.shown || b.view.webContents.isDestroyed()) return;
  b.view.webContents.send(CHANNEL, { mode: 'banner', text: store.t('ext.debugging', null, { name: b.shown.name }), stop: store.t('ext.debugStop') });
}

function refreshAll() {
  // Sessions dont l'extension a été retirée ou désactivée.
  for (const [tabId, s] of [...sessions]) {
    if (s.wc.isDestroyed()) finish(tabId, 'target_closed');
    else if (!X.context(s.ses, s.extId)) stop(tabId, null);
  }
  for (const w of W().OrbeWindow.all) refresh(w);
}

module.exports = { place, refreshAll, stop, sessions, banners, allowed };
