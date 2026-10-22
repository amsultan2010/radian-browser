// Essais discrets : chargé dans le processus principal avant Orbe (option -r
// d'Electron) par scripts/dev.js (--selftest) et par tests/ui/prelude.js.
//
// La personne qui travaille sur ce Mac ne doit rien voir des essais ni perdre
// son clavier :
//  - partout : les fenêtres s'ouvrent sans passer au premier plan (les entrées
//    simulées visent une page précise et n'ont pas besoin du focus système) ;
//  - sur macOS, hors intégration continue : elles sont en plus transparentes et
//    laissent passer la souris, et l'icône du Dock n'apparaît pas. Chromium
//    continue de dessiner une fenêtre transparente à la cadence de l'écran
//    (mesuré : 120 images par seconde, captures de page intactes), ce qui n'est
//    pas le cas d'une fenêtre masquée ou réduite. La vraie souris ne peut plus
//    traverser un geste simulé.
// macOS refuse de sortir une fenêtre de l'écran (il en garde un coin de 40 points
// visible) : c'est pourquoi elle est rendue transparente plutôt que déplacée.
//
// Pour voir les fenêtres : ORBE_TEST_VISIBLE=1. Les essais qui lisent le focus
// natif (ORBE_UI_FOCUS=1) ou envoient de vraies touches (tests/natif) gardent
// des fenêtres normales.
const { app, BaseWindow, BrowserWindow } = require('electron');

const visible = process.env.ORBE_TEST_VISIBLE === '1' || process.env.ORBE_UI_FOCUS === '1' || /[\\/]natif[\\/]/.test(process.env.ORBE_SCENARIO || '');
// ORBE_TEST_VISIBLE=inactif (scripts/mesures.js --visible 1) : fenêtres visibles, mais toujours
// sans prendre le clavier ni passer devant par elles-mêmes.
const invisible = !visible && process.platform === 'darwin' && !process.env.CI && process.env.ORBE_TEST_VISIBLE !== 'inactif';

if (!visible) {
  const opacite = BaseWindow.prototype.setOpacity;
  const voulue = new WeakMap(); // opacité demandée par Orbe (animation de la petite fenêtre)
  const souris = BaseWindow.prototype.setIgnoreMouseEvents;
  const cacher = (w) => {
    if (!invisible) return;
    try { opacite.call(w, 0); souris.call(w, true); } catch {}
  };
  for (const proto of [BaseWindow.prototype, BrowserWindow.prototype]) {
    const inactive = proto.showInactive;
    proto.show = function show() { cacher(this); return inactive.call(this); };
    proto.showInactive = function showInactive() { cacher(this); return inactive.call(this); };
    proto.focus = function focus() {};
    if (!invisible) continue;
    // Orbe croit régler l'opacité ; la fenêtre reste transparente.
    proto.setOpacity = function setOpacity(v) { voulue.set(this, Number(v)); };
    proto.getOpacity = function getOpacity() { return voulue.has(this) ? voulue.get(this) : 1; };
    proto.setIgnoreMouseEvents = function setIgnoreMouseEvents() {};
  }
  app.focus = () => {};
  if (invisible) {
    process.env.ORBE_DISCRET = '1'; // lu par tests/capture.js
    // Une fenêtre créée déjà affichée (sans passer par show) est cachée aussitôt.
    app.on('browser-window-created', (e, w) => cacher(w));
    const dock = () => { try { if (app.dock) app.dock.hide(); } catch {} };
    dock();
    app.whenReady().then(dock);
  }
}

module.exports = { visible, invisible };
