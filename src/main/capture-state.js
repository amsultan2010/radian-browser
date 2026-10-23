// Ce que chaque page capte en ce moment : caméra, micro, écran. Sert au témoin
// de la barre latérale et de la pastille d'adresse, et à l'action « Arrêter ».
//
// Electron ne dit pas si un flux caméra, micro ou écran est encore ouvert. Le
// témoin repose donc sur ce que le processus principal sait avec certitude, sans
// rien croire de la page :
//  - il s'allume quand Orbe accorde l'accès à la page ;
//  - il s'éteint quand la page est remplacée (navigation, rechargement),
//    détruite, ou arrêtée par l'utilisateur ;
//  - when a tab is shared (the page's own, or another one through "Share this tab
//    instead"), that tab's `webContents.isBeingCaptured()` shows the end: the
//    indicator goes off once nothing captures it. The count includes Radian's own
//    captures (thumbnails, `capturePage`), so it can delay the end, never fake it.
// Il peut donc rester allumé après qu'une page a rendu la caméra d'elle-même
// (jamais l'inverse) : un témoin qu'une page pourrait éteindre ne vaudrait rien.
const KINDS = ['screen', 'camera', 'microphone'];
const SETTLE = 4000;
const states = new Map(); // id webContents -> { wc, kinds: Map(kind -> { at, tab }), timer }
const hooks = { changed: () => {} };

function entry(wc) {
  let st = states.get(wc.id);
  if (st) return st;
  const id = wc.id;
  st = { wc, kinds: new Map(), timer: null };
  states.set(id, st);
  const drop = () => { clearAll(wc); };
  // La page a changé pour de bon : ses flux sont fermés par Chromium.
  wc.on('did-navigate', drop);
  wc.on('render-process-gone', drop);
  wc.once('destroyed', () => { const s = states.get(id); if (s) { clearInterval(s.timer); states.delete(id); hooks.changed(); } });
  st.drop = drop;
  return st;
}

// `tab`: the tab the page captures (itself, or another through "Share this tab
// instead"); the end of that capture is observable.
function mark(wc, kind, { tab = null } = {}) {
  if (!wc || wc.isDestroyed() || !KINDS.includes(kind)) return;
  const st = entry(wc);
  st.kinds.set(kind, { at: Date.now(), tab });
  if (tab && !st.timer) {
    let idle = 0;
    st.timer = setInterval(() => {
      if (wc.isDestroyed()) return;
      const k = st.kinds.get('screen');
      // Le flux met un instant à démarrer : rien n'est conclu avant quelques
      // secondes, puis il faut deux relevés de suite sans aucune capture.
      const shot = !!(k && k.tab && !k.tab.isDestroyed() && k.tab.isBeingCaptured());
      idle = shot || (k && Date.now() - k.at < SETTLE) ? 0 : idle + 1;
      if (!k || !k.tab || idle >= 2) {
        clearInterval(st.timer);
        st.timer = null;
        if (k && k.tab) { st.kinds.delete('screen'); hooks.changed(); }
      }
    }, 700);
    if (st.timer.unref) st.timer.unref();
  }
  hooks.changed();
}

function clearAll(wc) {
  const st = states.get(wc.id);
  if (!st || !st.kinds.size) return;
  st.kinds.clear();
  clearInterval(st.timer);
  st.timer = null;
  hooks.changed();
}

// Liste ordonnée de ce que la page capte : ['screen', 'camera', 'microphone'].
function of(wc) {
  const st = wc && states.get(wc.id);
  if (!st || !st.kinds.size) return [];
  return KINDS.filter((k) => st.kinds.has(k));
}

// Tab outlined in yellow: the tab a page shares, or the page itself when it shares a screen or a window.
function shared(wc) {
  const own = wc && states.get(wc.id);
  const k = own && own.kinds.get('screen');
  if (k && (!k.tab || k.tab === wc)) return true;
  for (const st of states.values()) { const s = st.kinds.get('screen'); if (s && s.tab === wc) return true; }
  return false;
}

// Arrêt demandé par l'utilisateur. Electron n'offre aucun moyen de fermer un
// flux précis : recharger la page est le seul arrêt garanti (Chromium ferme
// alors tous ses flux).
function stop(wc) {
  if (!wc || wc.isDestroyed() || !of(wc).length) return false;
  clearAll(wc);
  wc.reload();
  return true;
}

module.exports = { mark, of, shared, stop, clearAll, hooks, KINDS };
