// Balayage horizontal à deux doigts sur une page : précédent / suivant, avec
// une pastille qui suit les doigts au bord de la page.
//
// La page signale le déplacement cumulé d'un balayage qu'elle n'a pas consommé
// (src/preload/swipe.js). Ici : on vérifie que le message vient bien de l'onglet
// affiché et qu'il y a une page où aller ; la pastille (une petite vue d'Orbe
// posée sur le bord de la page) avance avec les doigts ; passé le seuil, ou sur
// un geste vif, on navigue. Comme pour le changement d'Espace, la décision se
// prend au franchissement du seuil : la molette ne dit pas quand les doigts se
// lèvent, et l'inertie du pavé continue d'envoyer des événements après.
const { ipcMain } = require('electron');
const path = require('path');
const { boundsOf } = require('./motion');

const CHANNEL = 'orbe-swipe';
const PRELOAD = path.join(__dirname, '../preload/swipe.js');
const SWIPE = {
  commit: 130, // déplacement (px) au-delà duquel on navigue
  flick: 1.4, // vitesse (px/ms) d'un geste vif, qui suffit…
  flickMin: 50, // …passé ce déplacement
  size: 76, // côté de la vue de la pastille
  linger: 280, // la vue reste le temps que la pastille reparte (ms)
  rest: 250, // silence (ms) après lequel un geste décidé est tenu pour fini
};
const attached = new WeakSet();
let ipcReady = false;

// Fenêtre de la page qui parle : celle de son onglet, ou celle dont elle est l'aperçu.
const windowOf = (wc) => {
  const W = require('./window');
  return W.OrbeWindow.ownerOf(wc) || [...W.windows.values()].find((w) => w.peekState && w.peekState.view.webContents === wc) || null;
};

function hide(w) {
  const st = w.swipe;
  if (!st) return;
  clearTimeout(st.timer);
  st.timer = setTimeout(() => {
    if (w.win.isDestroyed() || !w.swipeView || w.swipeView.webContents.isDestroyed()) return;
    w.swipeView.setVisible(false);
    try { w.win.contentView.removeChildView(w.swipeView); } catch {}
  }, SWIPE.linger);
}

// Affiche la pastille au bord de la page `rect`, du côté du geste.
function show(w, rect, dir, payload) {
  if (!w.swipeView) {
    w.swipeView = w.makeUiView('overlay.html#swipe');
    w.swipeView.setVisible(false);
    w.win.once('closed', () => { try { w.swipeView.webContents.close(); } catch {} });
  }
  const view = w.swipeView;
  if (view.webContents.isDestroyed()) return;
  const st = w.swipe;
  clearTimeout(st.timer);
  if (!st.shown || st.shown !== dir) {
    st.shown = dir;
    view.setBounds({ x: dir === 'back' ? rect.x : rect.x + rect.width - SWIPE.size, y: Math.round(rect.y + rect.height / 2 - SWIPE.size / 2), width: SWIPE.size, height: SWIPE.size });
    w.win.contentView.addChildView(view);
    view.setVisible(true);
  }
  // Première fois : la vue se charge encore ; elle recevra le dernier état du geste.
  st.last = { mode: 'swipe', dir, ...payload };
  if (view.webContents.isLoading()) {
    if (!st.waiting) {
      st.waiting = true;
      view.webContents.once('did-finish-load', () => { st.waiting = false; if (!view.webContents.isDestroyed()) view.webContents.send('overlay', st.last); });
    }
    return;
  }
  view.webContents.send('overlay', st.last);
}

function onMessage(e, msg) {
  if (!msg || typeof msg !== 'object') return;
  const wc = e.sender;
  const w = windowOf(wc);
  // Seul l'onglet affiché (cadre principal) pilote le geste.
  if (!w || w.win.isDestroyed() || w.activeWc !== wc || (e.senderFrame && e.senderFrame !== wc.mainFrame)) return;
  const st = w.swipe || (w.swipe = { done: false, shown: '', timer: null, dir: '' });
  if (msg.type === 'end') {
    // Aperçu tiré puis relâché avant le seuil : il revient à sa place.
    if (st.pull) { st.pull = false; if (!st.done) w.releasePeek(); }
    if (!st.done && st.shown) show(w, null, st.shown, { p: 0, release: true });
    st.done = false;
    st.shown = '';
    hide(w);
    return;
  }
  if (msg.type !== 'move' || typeof msg.x !== 'number' || !Number.isFinite(msg.x)) return;
  // Après une navigation, la page qui pilotait le geste n'est plus là pour en
  // signaler la fin : un silence de SWIPE.rest ms vaut fin de geste.
  const now = Date.now();
  if (st.done && now - (st.at || 0) > SWIPE.rest) st.done = false;
  st.at = now;
  if (st.done) return;
  const x = Math.max(-4000, Math.min(4000, msg.x));
  const v = typeof msg.v === 'number' && Number.isFinite(msg.v) ? msg.v : 0;
  // Les doigts vont vers la droite (défilement négatif) : page précédente.
  const dir = x < 0 ? 'back' : 'forward';
  const nav = wc.navigationHistory;
  // Aperçu sans page précédente : les doigts vers la droite tirent la carte ; passé
  // le seuil (ou d'un geste vif), l'aperçu se ferme — annulable comme toute fermeture.
  if (w.peekState && w.peekState.view.webContents === wc && dir === 'back' && !nav.canGoBack()) {
    const pull = require('./window').PEEK_PULL;
    const far = -x >= pull;
    const brisk = -v >= SWIPE.flick && -x >= SWIPE.flickMin;
    if (far || brisk) {
      st.done = true;
      st.pull = false;
      stats.peekCloses += 1;
      w.dismissPeek();
      return;
    }
    st.pull = w.pullPeek(-x);
    return;
  }
  if (st.pull) { st.pull = false; w.releasePeek(); }
  if (!(dir === 'back' ? nav.canGoBack() : nav.canGoForward())) {
    if (st.shown) { show(w, null, st.shown, { p: 0, release: true }); st.shown = ''; hide(w); }
    return;
  }
  const rt = [...require('./window').live.values()].find((r) => r.wc === wc);
  const rect = rt ? boundsOf(rt.view) : (w.peekState ? boundsOf(w.peekState.view) : null);
  if (!rect) return;
  const far = Math.abs(x) >= SWIPE.commit;
  const brisk = Math.abs(v) >= SWIPE.flick && Math.abs(x) >= SWIPE.flickMin && Math.sign(v) === Math.sign(x);
  if (far || brisk) {
    st.done = true; // la suite du geste (inertie) est ignorée jusqu'à sa fin
    show(w, rect, dir, { p: 1, go: true });
    st.shown = '';
    hide(w);
    require('./sounds').arm(w);
    if (dir === 'back') nav.goBack(); else nav.goForward();
    stats.navigations += 1;
    return;
  }
  show(w, rect, dir, { p: Math.abs(x) / SWIPE.commit });
}

const stats = { navigations: 0, peekCloses: 0 };

function attach(ses) {
  if (!ses || attached.has(ses)) return;
  attached.add(ses);
  ses.registerPreloadScript({ type: 'frame', filePath: PRELOAD, id: 'orbe-swipe' });
  if (ipcReady) return;
  ipcReady = true;
  ipcMain.on(CHANNEL, (e, msg) => { try { onMessage(e, msg); } catch (err) { console.error('[orbe] balayage', err.message); } });
}

module.exports = { attach, SWIPE, stats };
