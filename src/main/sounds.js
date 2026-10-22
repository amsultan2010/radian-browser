// Sons d'interface (fichiers originaux, fabriqués par scripts/make-sounds.js et
// joués par la coque).
//
// Deux familles : le son de capture, que joue aussi Arc (réglage « Sons ») ; et
// les sons des gestes — nouvel onglet, onglet fermé, changement d'Espace,
// épingle, refus —, propres à Orbe et coupés par défaut (réglage « Sons des
// gestes »). Les sons des gestes ne sont pas demandés à chaque endroit du code
// qui ouvre ou ferme un onglet : ils se déduisent de ce qui a changé entre deux
// états de la fenêtre (`observe`), et seulement juste après un geste de
// l'utilisateur (`arm`). Un onglet archivé tout seul au bout de douze heures, ou
// ouvert par une page, ne fait donc aucun bruit.
const { store } = require('./store');

const GESTURES = new Set(['tab', 'close', 'space', 'pin', 'unpin', 'error']);
const NAMES = new Set(['capture', ...GESTURES]);
const ARMED_MS = 600; // un changement d'état compte comme un geste pendant ce délai
// Pendant les essais, rien n'est joué (ORBE_TEST_SOUNDS=1 pour entendre) : la
// demande part quand même vers la coque, marquée « muette ».
const QUIET = (process.argv.includes('--selftest') || process.env.ORBE_UI_TEST === '1') && process.env.ORBE_TEST_SOUNDS !== '1';
const requested = []; // derniers sons demandés (pour les essais)

const volume = () => { const v = store.state.settings.soundVolume; return typeof v === 'number' && v >= 0 && v <= 100 ? v / 100 : 0.5; };

// Le son `name` doit-il se faire entendre, d'après les réglages ?
function wanted(name) {
  const s = store.state.settings;
  if (!NAMES.has(name) || !s.sounds || volume() <= 0) return false;
  return GESTURES.has(name) ? !!s.soundGestures : true;
}

function play(win, name) {
  if (!wanted(name)) return false;
  requested.push(name);
  if (requested.length > 50) requested.shift();
  const wc = win && win.ui && win.ui.webContents;
  if (wc && !wc.isDestroyed()) wc.send('sound', { name, volume: volume(), mute: QUIET });
  return true;
}

// Un geste de l'utilisateur vient d'arriver (clic dans la barre, commande, raccourci).
function arm(win) {
  if (win) win.soundArmed = Date.now();
}

const ids = (list, out = new Set()) => {
  for (const n of list) { if (n && n.type === 'folder') ids(n.children, out); else out.add(typeof n === 'string' ? n : n.id); }
  return out;
};

// Ce qu'on retient d'un état : l'Espace, et où se trouve chaque onglet.
function snapshot(win) {
  const space = win.space;
  return { space: space.id, today: ids(space.today), kept: ids([...space.pinned, ...win.favorites]) };
}

// Son correspondant au passage d'un état à l'autre ('' : aucun).
function diff(a, b) {
  if (!a || !b) return '';
  if (a.space !== b.space) return 'space';
  for (const id of b.kept) if (a.today.has(id)) return 'pin';
  for (const id of b.today) if (a.kept.has(id)) return 'unpin';
  const had = (s, id) => s.today.has(id) || s.kept.has(id);
  for (const id of [...b.today, ...b.kept]) if (!had(a, id)) return 'tab';
  for (const id of [...a.today, ...a.kept]) if (!had(b, id)) return 'close';
  return '';
}

// Appelé à chaque envoi d'état : joue le son du changement, s'il suit un geste.
function observe(win) {
  let now;
  try { now = snapshot(win); } catch { return; }
  const before = win.soundSnap;
  win.soundSnap = now;
  const name = diff(before, now);
  if (!name || Date.now() - (win.soundArmed || 0) > ARMED_MS) return;
  win.soundArmed = 0; // un geste, un son
  play(win, name);
}

// Musique de l'accueil (src/renderer/musique/welcome.wav, sept secondes) : jouée une
// fois à l'ouverture de l'accueil si le réglage « Sons » le permet, plus bas que les
// sons d'interface ; un bouton de l'accueil la coupe. Jamais jouée pendant les essais.
function music() {
  const on = !!store.state.settings.sounds && volume() > 0;
  return { on, volume: Math.round(volume() * 0.7 * 100) / 100, mute: QUIET };
}

module.exports = { music, NAMES, GESTURES, QUIET, requested, wanted, play, arm, observe, diff, snapshot };
