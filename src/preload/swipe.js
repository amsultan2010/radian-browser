// Balayage horizontal à deux doigts sur une page : précédent / suivant.
//
// Ce script (monde isolé, pages web seulement, cadre principal) ne fait
// qu'observer la molette : il n'insère rien dans la page et ne lui expose rien.
// Il signale au processus principal un balayage horizontal que la page n'a pas
// consommé — ni défilement horizontal possible sous le pointeur, ni
// `preventDefault` —, avec le déplacement cumulé ; l'indicateur qui suit les
// doigts est dessiné par une vue d'Orbe, hors de la page (src/main/swipe.js).
const { ipcRenderer } = require('electron');

const CHANNEL = 'orbe-swipe';
const IDLE = 110; // sans événement pendant ce temps (ms), le geste est fini

function start() {
  let active = false; // un balayage horizontal est en cours
  let blocked = false; // le geste en cours appartient à la page (jusqu'à sa fin)
  let x = 0;
  let last = 0;
  let timer = null;
  const send = (msg) => { try { ipcRenderer.send(CHANNEL, msg); } catch {} };

  // Un élément sous le pointeur (ou la page) peut-il encore défiler dans ce sens ?
  function scrollsX(target, dx) {
    for (let n = target; n && n.nodeType === 1; n = n.parentElement) {
      if (n === document.documentElement || n === document.body) break;
      if (n.scrollWidth <= n.clientWidth + 1) continue;
      const o = getComputedStyle(n).overflowX;
      if (o !== 'auto' && o !== 'scroll') continue;
      if (dx < 0 ? n.scrollLeft > 0 : n.scrollLeft + n.clientWidth < n.scrollWidth - 1) return true;
    }
    const root = document.scrollingElement;
    if (!root || root.scrollWidth <= innerWidth + 1) return false;
    return dx < 0 ? scrollX > 0 : scrollX + innerWidth < root.scrollWidth - 1;
  }

  function end() {
    if (active) send({ type: 'end' });
    active = false;
    blocked = false;
    x = 0;
    last = 0;
  }

  // Phase de remontée, sur la fenêtre : les écouteurs de la page ont déjà répondu.
  window.addEventListener('wheel', (e) => {
    if (!e.isTrusted) return;
    clearTimeout(timer);
    timer = setTimeout(end, IDLE);
    if (blocked) return;
    if (!active) {
      // Pincement, molette à crans, geste vertical ou pris par la page : pas un balayage.
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5;
      if (e.ctrlKey || e.deltaMode !== 0 || e.defaultPrevented || !horizontal || scrollsX(e.target, e.deltaX)) {
        if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaY) > 2 || Math.abs(e.deltaX) > 2) blocked = true;
        return;
      }
      active = true;
    }
    if (e.defaultPrevented) return;
    const now = performance.now();
    const dt = Math.max(4, Math.min(64, last ? now - last : 16));
    last = now;
    x += e.deltaX;
    send({ type: 'move', x: Math.round(x), v: Math.round((e.deltaX / dt) * 100) / 100 });
  }, { passive: true });
}

// Pages web seulement, cadre principal.
if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && window.top === window) start();
