// « Quitter la page ? » : quand une page demande à ne pas être quittée
// (`beforeunload`), Orbe pose la question au lieu de passer outre.
//
// Chromium n'émet `will-prevent-unload` que si l'utilisateur a déjà agi dans la
// page : une page jamais touchée ne peut retenir personne. La question est une
// boîte de dialogue du système, avec un texte fixe : celui que la page voudrait
// afficher est ignoré (comme dans tous les navigateurs), et « Rester » est le
// choix par défaut.
const { app, dialog } = require('electron');
const { store } = require('./store');

const env = {
  // Renvoie l'indice du bouton choisi : 0 = quitter la page, 1 = rester. Remplacé pendant les tests.
  ask: (parent, opts) => (parent && !parent.isDestroyed() ? dialog.showMessageBoxSync(parent, opts) : dialog.showMessageBoxSync(opts)),
  // Bouclier contre le délai de Chromium (voir `shield`). Coupé par les tests qui montrent le défaut.
  shield: true,
};
const state = { quitting: false, asked: 0 };
// Une page ne peut pas enchaîner les boîtes de dialogue (elles bloquent toute
// l'application) : pendant deux secondes après « Rester », une nouvelle
// tentative de quitter cette page est refusée sans rien demander.
const QUIET = 2000;
const stays = new WeakMap(); // webContents -> instant du dernier « Rester »

// Pose la question, de façon synchrone (l'événement d'Electron l'exige).
// Renvoie true si l'utilisateur accepte de quitter la page.
function confirm(parent, wc) {
  let host = '';
  try { host = new URL(wc.getURL()).host; } catch {}
  if (wc && Date.now() - (stays.get(wc) || 0) < QUIET) { shield(wc); return false; }
  state.asked += 1;
  const t = (key, vars) => store.t(key, null, vars);
  let choice = 1;
  try {
    choice = env.ask(parent, {
      type: 'question',
      message: t('unload.title'),
      detail: (host ? host + '\n' : '') + t('unload.detail'),
      buttons: [t('unload.leave'), t('unload.stay')],
      defaultId: 1,
      cancelId: 1,
    });
  } catch (err) { console.error('[orbe] beforeunload', err.message); }
  // La page reste : Chromium ne doit pas la fermer d'office si elle tarde à en accuser
  // réception (voir `shield`). Vaut pour tous ceux qui posent la question (onglets, aperçus,
  // petites fenêtres).
  if (choice !== 0 && wc) { stays.set(wc, Date.now()); shield(wc); }
  return choice === 0;
}

// --- Bouclier : Chromium ne ferme pas la page à la place de l'utilisateur -----------
// Quand une page est consultée avant d'être fermée (`beforeunload`), Chromium
// lui donne une seconde pour répondre ; passé ce délai, il la ferme d'office.
// Le délai est suspendu tant que la question est posée, puis REPART pour une
// seconde après la réponse : si le processus de la page n'accuse pas réception
// à temps (machine chargée, processus mis en attente par le système), la page
// est détruite alors que l'utilisateur vient de choisir « Rester », et son
// travail avec. De même avant la question : une page occupée plus d'une seconde
// est fermée sans avoir pu s'y opposer.
// Chromium n'applique pas ce délai à une page dont le débogueur est attaché
// (elle peut être arrêtée sur un point d'arrêt). Orbe attache donc le débogueur
// d'Electron, sans rien lui demander, le temps de la consultation : c'est alors
// Orbe qui décide quand une page qui ne répond pas cesse de retenir (4 s).
// Le bouclier tombe une fois que la page a répondu à un aller-retour (elle a
// donc accusé réception), ou au bout de dix secondes.
const SETTLE = 1500;
const CAP = 10000;
const guards = new WeakMap(); // webContents -> { mine, seq }

function unshield(wc) {
  const g = wc && guards.get(wc);
  if (!g) return;
  guards.delete(wc);
  try { if (g.mine && !wc.isDestroyed() && wc.debugger.isAttached()) wc.debugger.detach(); } catch {}
}

function shield(wc) {
  if (!env.shield || !wc || wc.isDestroyed()) return false;
  let g = guards.get(wc);
  if (!g) { g = { mine: false, seq: 0 }; guards.set(wc, g); }
  // Débogueur déjà pris (extension, capture de page entière) : la page est déjà protégée.
  try { if (!wc.debugger.isAttached()) { wc.debugger.attach(); g.mine = true; } } catch (err) { console.error('[orbe] bouclier beforeunload', err.message); }
  g.seq += 1;
  const seq = g.seq;
  const drop = () => { if (guards.get(wc) === g && g.seq === seq) unshield(wc); };
  wc.executeJavaScript('0').then(() => setTimeout(drop, SETTLE).unref(), () => {});
  setTimeout(drop, CAP).unref();
  return true;
}

// Temps écoulé depuis le dernier « Rester » de cette page (Infinity : jamais).
const stayedAgo = (wc) => (wc && stays.has(wc) ? Date.now() - stays.get(wc) : Infinity);

// Ferme une à une des pages qui peuvent avoir quelque chose à perdre (fermeture
// d'une fenêtre). `close(rt)` lance la fermeture avec `beforeunload` ; la
// promesse renvoyée dit si toutes ont accepté. La première qui refuse arrête tout.
async function closeAll(rts, close) {
  for (const rt of rts) {
    if (rt.wc.isDestroyed()) continue;
    const ok = await new Promise((resolve) => {
      let timer = null;
      const gone = () => done(true);
      // (L'écouteur est retiré : chaque fermeture annulée par « Rester » en laissait un sur la page.)
      const done = (v) => { clearTimeout(timer); rt.wc.removeListener('destroyed', gone); rt.unloadAnswer = null; resolve(v); };
      rt.unloadAnswer = done; // appelé avec false si l'utilisateur choisit de rester
      rt.wc.once('destroyed', gone);
      // Page qui ne répond pas : elle ne retient pas la fenêtre. (`asking` : elle a
      // répondu, la question est à l'écran ; ce n'est plus une page qui ne répond pas.)
      timer = setTimeout(() => { if (rt.unloadAnswer === done && !rt.asking) { done(true); if (!rt.wc.isDestroyed()) rt.wc.close({ waitForBeforeUnload: false }); } }, 4000);
      close(rt);
    });
    if (!ok) return false;
  }
  return true;
}

function setup() {
  app.on('before-quit', () => { state.quitting = true; });
}

module.exports = { confirm, closeAll, setup, env, state, QUIET, forget: (wc) => stays.delete(wc), shield, unshield, stayedAgo, shielded: (wc) => guards.has(wc) };
