// Feuilles d'onglet : des vues d'Orbe posées par-dessus UNE page, pour tout ce
// qu'un navigateur doit demander ou annoncer à propos de cette page (demande
// d'autorisation, choix de l'écran à partager, identifiants HTTP, avertissement
// de certificat, page plantée…).
//
// Règles de sécurité, communes à toutes les feuilles :
//  - la feuille est une vue à part (orbe://app/sheet.html), jamais un morceau de
//    la page : la page ne peut ni la lire, ni l'habiller, ni la fermer, ni y cliquer ;
//  - elle couvre toute la page concernée et ne suit que son onglet : un autre
//    onglet ne peut pas se faire passer pour le demandeur ;
//  - ce qu'elle affiche vient du processus principal (origine, hôte, certificat
//    rapportés par Electron) ; les textes venus du site sont affichés tels quels,
//    comme du texte, et désignés comme tels ;
//  - la réponse est reconnue à la vue qui l'envoie (jamais à un jeton lisible par
//    une page) ;
//  - une réponse qui engage (autoriser, partager, continuer, se connecter,
//    ouvrir) est refusée par le processus principal pendant la demi-seconde qui
//    suit le moment où la feuille devient visible — y compris quand elle
//    réapparaît parce que celle du dessus vient de se fermer : un clic préparé
//    par la page pour l'ancienne feuille ne décide rien sur la suivante ;
//  - une feuille se referme d'elle-même (réponse « rien ») quand la page change
//    (début d'une navigation, ou arrivée d'une navigation déjà en route) ou
//    disparaît : aucune décision ne survit à la page qui l'a demandée ;
//  - une page ne peut pas empiler les feuilles : quatre au plus par onglet.
const { WebContentsView } = require('electron');

const env = {
  trusted: null, // WeakSet des vues autorisées à parler au processus principal
  uiPreload: '',
  internal: '',
  locate: () => null, // webContents d'onglet -> { owner, rt } (fenêtre Orbe et onglet)
};
const RADIUS = 10;
const GUARD = 500; // délai avant qu'une réponse qui engage soit acceptée
const MAX_STACK = 4; // feuilles en attente par onglet
// Réponses sans conséquence : refuser, revenir, fermer, attendre, recharger.
const SAFE = new Set(['deny', 'back', 'ok', 'wait', 'reload', 'cancel']);
const engages = (value) => !(value === null || value === undefined || value === false || SAFE.has(value));
const byTab = new Map(); // id du webContents de l'onglet -> feuilles (la dernière est affichée)
const byView = new Map(); // id du webContents de la feuille -> feuille
const watched = new WeakSet(); // onglets déjà surveillés (navigation, destruction)
let seq = 0;

function configure(options) {
  Object.assign(env, options);
}

function stackOf(wc) {
  return byTab.get(wc.id) || [];
}

// Feuille affichée pour cet onglet (la plus récente), ou null.
function top(wc) {
  const stack = wc ? stackOf(wc) : [];
  return stack[stack.length - 1] || null;
}

function watch(wc) {
  if (watched.has(wc)) return;
  watched.add(wc);
  const id = wc.id;
  // Une autre page arrive dans l'onglet : ce qui était demandé ne vaut plus.
  wc.on('did-start-navigation', (details) => {
    if (!details.isMainFrame || details.isSameDocument) return;
    for (const sheet of [...stackOf(wc)]) if (sheet.untilNavigation && Date.now() - sheet.openedAt > sheet.grace) sheet.close(null);
  });
  // Une navigation lancée avant l'ouverture de la feuille aboutit : même effet.
  wc.on('did-navigate', () => {
    for (const sheet of [...stackOf(wc)]) if (sheet.untilNavigation) sheet.close(null);
  });
  wc.once('destroyed', () => {
    for (const sheet of [...(byTab.get(id) || [])]) sheet.close(null);
    byTab.delete(id);
  });
}

function detach(sheet) {
  sheet.armedAt = 0;
  if (!sheet.parent) return;
  try { sheet.parent.win.contentView.removeChildView(sheet.view); } catch {}
  sheet.parent = null;
}

// Pose (ou retire) les feuilles des onglets de cette fenêtre. Appelé à la fin de
// chaque mise en page de la fenêtre.
function layout(owner) {
  for (const [, stack] of byTab) {
    stack.forEach((sheet, i) => {
      const where = env.locate(sheet.wc);
      if (sheet.parent && (!where || where.owner !== sheet.parent)) detach(sheet);
      if (!where || where.owner !== owner) return;
      const ids = owner.visibleIds();
      const at = ids.indexOf(where.rt.id);
      const shown = at >= 0 && i === stack.length - 1 && !owner.win.isDestroyed() && !owner.closing;
      if (!shown) return detach(sheet);
      const pane = owner.paneRects(owner.contentRect(), ids)[at];
      if (!pane) return detach(sheet);
      try {
        if (sheet.parent !== owner) {
          owner.win.contentView.addChildView(sheet.view);
          sheet.parent = owner;
          // Visible à partir de maintenant : le délai de garde repart, ici et dans la feuille.
          sheet.armedAt = Date.now();
          if (!sheet.view.webContents.isDestroyed()) sheet.view.webContents.send('overlay', { arm: true });
          if (owner.activeId === where.rt.id && !owner.modalMode) sheet.view.webContents.focus();
        }
        sheet.view.setBorderRadius(owner.htmlFullscreen ? 0 : RADIUS);
        sheet.view.setBounds({ x: pane.x, y: pane.y, width: pane.width, height: pane.height });
      } catch {}
    });
  }
}

function relayout(wc) {
  const where = env.locate(wc);
  if (where && !where.owner.win.isDestroyed()) where.owner.layout();
}

// Feuille qui doit garder le clavier dans cette fenêtre (onglet actif), ou null.
function focusFor(owner) {
  const rt = owner.activeRt;
  const sheet = rt && top(rt.wc);
  if (!sheet || sheet.parent !== owner || sheet.view.webContents.isDestroyed()) return null;
  return sheet.view.webContents;
}

// Ouvre une feuille sur l'onglet `wc`. Renvoie null si `wc` n'est pas un onglet
// affichable (aperçu, petite fenêtre, page d'extension) : à l'appelant de
// retomber sur un refus ou une boîte de dialogue du système.
//  - `kind` : nom de la feuille (voir sheet.js) ; `payload` : ce qu'elle affiche ;
//  - `cover` : fond opaque (page d'avertissement) au lieu d'un voile ;
//  - `onAction(name, arg)` : action intermédiaire (ne ferme pas la feuille), dont
//    le résultat est renvoyé à la feuille ;
//  - `untilNavigation` (vrai par défaut) : se ferme quand l'onglet change de page.
// `sheet.result` se résout avec la réponse, ou null si la feuille est fermée
// sans réponse.
function open(wc, kind, payload, { cover = false, onAction = null, untilNavigation = true, grace = 0, exclusive = true } = {}) {
  if (!wc || wc.isDestroyed() || !env.locate(wc)) return null;
  // Une seule feuille de chaque sorte par onglet : la nouvelle remplace l'ancienne.
  if (exclusive) for (const old of [...stackOf(wc)]) if (old.kind === kind) old.close(null);
  if (stackOf(wc).length >= MAX_STACK) return null;
  watch(wc);
  const view = new WebContentsView({ webPreferences: { preload: env.uiPreload, sandbox: true, contextIsolation: true } });
  view.setBackgroundColor('#00000000');
  const vwc = view.webContents;
  const viewId = vwc.id;
  env.trusted.add(vwc);
  vwc.on('will-navigate', (e) => e.preventDefault());
  vwc.setWindowOpenHandler(() => ({ action: 'deny' }));
  vwc.on('before-input-event', (e, input) => { const where = env.locate(wc); if (where) where.owner.onInput(e, input, true); });
  let done;
  const sheet = {
    id: ++seq, wc, kind, payload: { kind, cover, ...payload }, view, parent: null, onAction, untilNavigation, grace, openedAt: Date.now(), armedAt: 0, closed: false,
    result: new Promise((resolve) => { done = resolve; }),
  };
  sheet.close = (value) => {
    if (sheet.closed) return;
    sheet.closed = true;
    const stack = byTab.get(wc.id);
    if (stack) {
      const i = stack.indexOf(sheet);
      if (i >= 0) stack.splice(i, 1);
      if (!stack.length) byTab.delete(wc.id);
    }
    byView.delete(viewId);
    const parent = sheet.parent;
    detach(sheet);
    if (!vwc.isDestroyed()) vwc.close();
    done(value === undefined ? null : value);
    if (parent && !parent.win.isDestroyed()) { parent.layout(); if (!parent.closing) parent.focusContent(); }
  };
  // Mise à jour de ce que la feuille affiche (liste rafraîchie, état changé).
  sheet.update = (patch) => {
    Object.assign(sheet.payload, patch);
    if (!vwc.isDestroyed()) vwc.send('overlay', { sheet: sheet.payload });
  };
  byView.set(viewId, sheet);
  if (!byTab.has(wc.id)) byTab.set(wc.id, []);
  byTab.get(wc.id).push(sheet);
  vwc.loadURL(env.internal + 'sheet.html');
  relayout(wc);
  return sheet;
}

// Messages d'une feuille. L'expéditeur est reconnu à sa vue.
async function action(name, a, sender) {
  const sheet = byView.get(sender.id);
  if (!sheet || sheet.closed) return undefined;
  if (name === 'sheet:ready') return sheet.payload;
  if (name === 'sheet:answer') {
    // Réponse qui engage, trop tôt après l'apparition de la feuille : ignorée.
    if (engages(a) && !(sheet.armedAt && Date.now() - sheet.armedAt >= GUARD)) return false;
    sheet.close(a === undefined ? null : a);
    return true;
  }
  if (name === 'sheet:act' && sheet.onAction && a && typeof a.name === 'string') {
    const out = await sheet.onAction(a.name, a.arg, sheet);
    return out === undefined ? null : out;
  }
  return undefined;
}

// Une feuille de cette sorte attend-elle sur cet onglet (même sous une autre) ?
function has(wc, kind) {
  return !!wc && stackOf(wc).some((sheet) => sheet.kind === kind);
}

function closeAll(wc, kind) {
  for (const sheet of [...stackOf(wc)]) if (!kind || sheet.kind === kind) sheet.close(null);
}

module.exports = { configure, open, action, layout, focusFor, top, has, closeAll, GUARD, MAX_STACK, internals: { byTab, byView, engages } };
