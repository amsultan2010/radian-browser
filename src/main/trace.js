// « Enregistrer une trace… » (Aide → Dépannage) : la trace de Chromium, pour
// diagnostiquer une lenteur.
//
// L'enregistrement ne connaît ni profil ni fenêtre : il porte sur tout le
// navigateur. Il contient donc des adresses et des titres de pages de toutes
// les fenêtres. D'où les garde-fous :
//  - la question est posée d'abord, et dit ce que la trace contient ;
//  - rien ne s'enregistre tant qu'une fenêtre de navigation privée est ouverte ;
//    s'il s'en ouvre une en cours de route, la trace est arrêtée et jetée ;
//  - elle s'arrête seule au bout de deux minutes ;
//  - seules les catégories utiles à un diagnostic de performance sont relevées
//    (ni le journal du réseau, ni les catégories détaillées) ;
//  - tant qu'elle tourne, la barre latérale de chaque fenêtre le montre, avec de
//    quoi l'arrêter.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, contentTracing, dialog, shell } = require('electron');
const { store } = require('./store');

const LIMIT = { ms: 2 * 60 * 1000 }; // durée au bout de laquelle la trace s'arrête seule
// Ordonnancement, rendu, composition, script, entrées : ce qu'un diagnostic de
// performance regarde. Aucune catégorie « disabled-by-default », ni « netlog ».
const CATEGORIES = ['toplevel', 'toplevel.flow', 'base', 'benchmark', 'blink', 'blink.user_timing', 'cc', 'gpu', 'viz', 'v8', 'renderer.scheduler', 'input', 'latency', 'latencyInfo', 'loading', 'rail', 'devtools.timeline', 'electron'];

const state = { on: false, timer: null, busy: false };
const hooks = { changed: () => {}, privateOpen: () => require('./window').OrbeWindow.all.some((w) => w.incognito) };

const t = (key, vars) => store.t(key, null, vars);
const say = (w, key, sound) => { try { if (w && !w.gone) w.toast(t(key), sound); } catch {} };
function changed() {
  try { hooks.changed(); } catch {}
  try { require('./window').OrbeWindow.pushAll(); } catch {}
}
function clear() {
  clearTimeout(state.timer);
  state.timer = null;
  state.on = false;
}

async function start(w) {
  if (state.on || state.busy) return state.on;
  if (hooks.privateOpen()) { say(w, 'trace.private', 'error'); return false; }
  state.busy = true;
  try {
    const r = await dialog.showMessageBox(w && !w.gone ? w.win : undefined, {
      type: 'warning',
      message: t('trace.confirm'),
      detail: t('trace.detail'),
      buttons: [t('trace.start'), t('edit.undo')],
      defaultId: 1,
      cancelId: 1,
    });
    // Une fenêtre privée a pu s'ouvrir pendant la question.
    if (r.response !== 0) return false;
    if (hooks.privateOpen()) { say(w, 'trace.private', 'error'); return false; }
    await contentTracing.startRecording({ included_categories: CATEGORIES });
    state.on = true;
    state.timer = setTimeout(() => { stop(w, { auto: true }); }, LIMIT.ms);
    if (state.timer.unref) state.timer.unref();
    say(w, 'toast.traceOn');
  } catch (err) { clear(); console.error('[orbe] trace', err.message); } finally { state.busy = false; }
  changed();
  return state.on;
}

// Arrêt : la trace est rangée dans Téléchargements et montrée.
async function stop(w, { auto = false } = {}) {
  if (!state.on) return false;
  clear();
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = await contentTracing.stopRecording(path.join(app.getPath('downloads'), `orbe-trace-${stamp}.json`));
    const target = w && !w.gone ? w : require('./window').OrbeWindow.focused || require('./window').OrbeWindow.primary;
    say(target, auto ? 'toast.traceAuto' : 'toast.traceSaved');
    shell.showItemInFolder(file);
  } catch (err) { console.error('[orbe] trace', err.message); }
  changed();
  return true;
}

// Une fenêtre de navigation privée s'ouvre : la trace en cours est arrêtée et jetée.
async function discard(w) {
  if (!state.on) return false;
  clear();
  try {
    const file = await contentTracing.stopRecording(path.join(os.tmpdir(), `orbe-trace-jetee-${process.pid}-${Date.now()}.json`));
    try { fs.rmSync(file, { force: true }); } catch {}
    say(w && !w.gone ? w : require('./window').OrbeWindow.primary, 'trace.discarded');
  } catch (err) { console.error('[orbe] trace', err.message); }
  changed();
  return true;
}

// L'article du menu : commence, ou arrête et enregistre.
function toggle(w) {
  return state.on ? stop(w).then(() => false) : start(w);
}

module.exports = { start, stop, discard, toggle, state, hooks, CATEGORIES, LIMIT, tracing: () => state.on };
