// Mouvements des vues : durées, pose animée par le système, suivi des vols.
const { systemPreferences } = require('electron');

// Durées en millisecondes. Barre latérale : relevée image par image (60 i/s) dans Arc 1.170
// lui-même (⌘S, bord de la carte) : elle revient en 70 ms, cubic-bezier(0, 0.64, 0.57, 1), et
// part en 74 ms, cubic-bezier(0, 0.39, 0.38, 1), sans dépassement (les 280 / 400 ms de
// docs/parity/web-research.md §3.3 viennent de vidéos promotionnelles). Le système n'offre
// que quatre courbes : ease-out en 50 et 60 ms est le plus proche de ces trajets (8 pt d'écart
// moyen). Barre flottante : elle repart en 90 ms (--sidebar-reveal-out de base.css). Vue
// scindée par dépôt d'un onglet : la page s'écarte en 200 ms. Peek, measured frame by frame in Arc 1.170
// (docs/parity/captures/live/motion.md): opens in 230 ms and closes in 180 ms, both ease-out without overshoot.
// Library: the page card slides past its panel in 200 ms (not measured in Arc; --library-slide in base.css).
const MOTION = { sidebarIn: 50, sidebarOut: 60, revealOut: 90, split: 200, peekIn: 230, peekOut: 180, peekExpand: 220, peekBack: 180, library: 200 };
const stats = { animated: 0, direct: 0 }; // appels à setBounds, pour les mesures
let nativeAnim = true;

// « Réduire les animations » (réglage du système) : toutes les durées passent à 0.
// Les essais peuvent imposer l'un ou l'autre (`forceMotion`), le réglage des
// machines d'intégration n'étant pas le même d'un système à l'autre.
let motionForced = null;
function forceMotion(on) { const before = motionForced; motionForced = on; return before; } // rend l'ancien réglage, pour le remettre
function motion(ms) {
  if (motionForced !== null) return motionForced ? ms : 0;
  try { if (systemPreferences.getAnimationSettings().prefersReducedMotion) return 0; } catch {}
  return ms;
}

// Vues en vol : vue -> { target, end }. `target` est le rectangle demandé, `end`
// la fin théorique du trajet. La vue n'y figure plus dès que son arrivée est
// signalée (événement `bounds-changed` avec le rectangle demandé).
const flights = new WeakMap();
const watched = new WeakSet();
const same = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

function watch(view) {
  if (watched.has(view)) return;
  watched.add(view);
  view.on('bounds-changed', () => {
    const f = flights.get(view);
    if (!f) return;
    let now = null;
    try { now = view.getBounds(); } catch {}
    if (now && same(now, f.target)) flights.delete(view);
  });
}

// Vol en cours d'une vue, ou null. Cas particulier : la cible est le rectangle
// que la vue occupait déjà au départ (retour au point de départ en plein vol).
// Rien ne change à l'arrivée, donc rien n'est signalé : faute de mieux, le vol
// est tenu pour fini deux secondes après sa fin théorique.
const UNSIGNALLED = 2000;
function flightOf(view) {
  const f = flights.get(view);
  if (!f) return null;
  if (Date.now() > f.end + UNSIGNALLED) {
    let now = null;
    try { now = view.getBounds(); } catch {}
    if (!now || same(now, f.target)) { flights.delete(view); return null; }
  }
  return f;
}

// Pose une vue dans son rectangle. Avec `ms`, le trajet est animé par le système
// (`View.setBounds(rect, { animate })`, Core Animation sur macOS) : un seul appel,
// au rythme de l'écran, sans un seul tic du fil principal.
// Relevé sur Electron 44 (macOS et Windows) :
//  - durée libre, quatre courbes seulement (linear, ease-in, ease-out, ease-in-out) ;
//  - pendant le trajet, getBounds() rend encore l'ancien rectangle ; l'arrivée est
//    signalée par `bounds-changed`, getBounds() rend alors la cible ;
//  - le trajet peut durer bien plus que demandé : il ne commence qu'à la première
//    image composée. Sur une machine lente, 50 ms demandées finissent à 100, 280,
//    parfois plus de 320 ms (relevé sur les machines d'intégration macOS) ;
//  - un nouvel appel animé repart de la position affichée (interruption propre),
//    une seule arrivée est signalée, à la dernière cible — sauf si cette cible
//    est le rectangle de départ : rien n'est alors signalé (voir flightOf) ;
//  - un appel NON animé pendant le trajet pose bien la vue… jusqu'à la fin du
//    trajet interrompu, qui la REPOSE sur son ancienne cible (second
//    `bounds-changed`) : la vue reste alors au mauvais endroit ;
//  - la page n'est remise en page qu'une fois : au départ si elle grandit, à
//    l'arrivée si elle rétrécit ; entre-temps son image est seulement rognée.
// D'où la règle : tant que l'arrivée d'une vue n'a pas été signalée, toute
// nouvelle cible lui est donnée par un appel animé, sur le temps qu'il lui reste
// (1 ms au moins). L'horloge ne dit pas si le vol est fini : seule l'arrivée le dit.
// Là où l'option n'existe pas, la vue est posée directement.
function place(view, rect, ms = 0, easing = 'ease-out') {
  const now = Date.now();
  const flight = flightOf(view);
  if (nativeAnim && (ms > 0 || flight)) {
    const duration = Math.max(1, Math.round(ms > 0 ? ms : flight.end - now));
    try {
      watch(view);
      view.setBounds(rect, { animate: { duration, easing } });
      flights.set(view, { target: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, end: ms > 0 || !flight ? now + duration : Math.min(flight.end, now + duration) });
      stats.animated += 1;
      return;
    } catch { nativeAnim = false; }
  }
  flights.delete(view);
  view.setBounds(rect);
  stats.direct += 1;
}

// La vue est-elle en vol (arrivée pas encore signalée) ?
function inFlight(view) { return !!flightOf(view); }

// Rectangle d'une vue pour qui veut s'y ancrer (liste des mots de passe, bulle
// d'adresse, aperçu…) : en vol, c'est sa cible — getBounds() rendrait encore
// l'ancien rectangle, et ce qui s'y ancre resterait à côté de la page.
function boundsOf(view) {
  const flight = flightOf(view);
  return flight ? { ...flight.target } : view.getBounds();
}

module.exports = { MOTION, motion, forceMotion, place, boundsOf, inFlight, stats };
