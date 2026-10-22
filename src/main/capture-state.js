// Ce que chaque page capte en ce moment : caméra, micro, écran. Sert au témoin
// de la barre latérale et de la pastille d'adresse, et à l'action « Arrêter ».
//
// Electron ne dit pas si un flux caméra, micro ou écran est encore ouvert. Le
// témoin repose donc sur ce que le processus principal sait avec certitude, sans
// rien croire de la page :
//  - il s'allume quand Orbe accorde l'accès à la page ;
//  - il s'éteint quand la page est remplacée (navigation, rechargement),
//    détruite, ou arrêtée par l'utilisateur ;
//  - pour le partage de l'onglet lui-même, `webContents.isBeingCaptured()` permet
//    d'observer la fin : le témoin s'éteint quand plus rien ne capte la page.
//    Ce compteur inclut les captures d'Orbe (vignettes, `capturePage`) : il peut
//    donc retarder l'extinction, jamais la provoquer à tort.
// Il peut donc rester allumé après qu'une page a rendu la caméra d'elle-même
// (jamais l'inverse) : un témoin qu'une page pourrait éteindre ne vaudrait rien.
const KINDS = ['screen', 'camera', 'microphone'];
const SETTLE = 4000;
const states = new Map(); // id webContents -> { wc, kinds: Map(kind -> { at, self }), timer }
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

// `self` : la page capte son propre onglet ; la fin de la capture est alors observable.
function mark(wc, kind, { self = false } = {}) {
  if (!wc || wc.isDestroyed() || !KINDS.includes(kind)) return;
  const st = entry(wc);
  st.kinds.set(kind, { at: Date.now(), self });
  if (self && !st.timer) {
    let idle = 0;
    st.timer = setInterval(() => {
      if (wc.isDestroyed()) return;
      const k = st.kinds.get('screen');
      // Le flux met un instant à démarrer : rien n'est conclu avant quelques
      // secondes, puis il faut deux relevés de suite sans aucune capture.
      idle = wc.isBeingCaptured() || (k && Date.now() - k.at < SETTLE) ? 0 : idle + 1;
      if (!k || !k.self || idle >= 2) {
        clearInterval(st.timer);
        st.timer = null;
        if (k && k.self) { st.kinds.delete('screen'); hooks.changed(); }
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

// Arrêt demandé par l'utilisateur. Electron n'offre aucun moyen de fermer un
// flux précis : recharger la page est le seul arrêt garanti (Chromium ferme
// alors tous ses flux).
function stop(wc) {
  if (!wc || wc.isDestroyed() || !of(wc).length) return false;
  clearAll(wc);
  wc.reload();
  return true;
}

module.exports = { mark, of, stop, clearAll, hooks, KINDS };
