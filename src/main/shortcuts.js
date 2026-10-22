// Raccourcis clavier modifiables. La table des commandes (commands.js) reste la
// source des raccourcis par défaut ; les choix de l'utilisateur (réglage
// `shortcuts` : { commande: accélérateur | null }) se posent par-dessus.
// Le menu, la page des raccourcis, la barre de commande et les extensions
// lisent tous le résultat ici.
const { store } = require('./store');
const platform = require('./platform');
const commands = require('./commands');

const MODS = ['Ctrl', 'Alt', 'Shift', 'Cmd'];
const ALIAS = { cmd: 'Cmd', command: 'Cmd', ctrl: 'Ctrl', control: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift' };
const NAMED = ['Plus', 'Space', 'Tab', 'Backspace', 'Delete', 'Return', 'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown', 'Escape'];
const NAMED_BY_LOWER = new Map([...NAMED.map((k) => [k.toLowerCase(), k]), ['enter', 'Return'], ['esc', 'Escape']]);
const SIMPLE_KEY = /^[A-Z0-9,./;'[\]\\=`-]$/;
const F_KEY = /^F([1-9]|1[0-9]|2[0-4])$/;
const MAX_LEN = 40;

const hooks = { changed: () => {} };

// Forme canonique d'un accélérateur (« Shift+Cmd+T »), ou null s'il est mal formé.
function canon(accel) {
  if (typeof accel !== 'string' || !accel || accel.length > MAX_LEN) return null;
  const parts = accel.split('+');
  let key = parts.pop();
  if (!key) return null; // « Cmd++ » : la touche plus s'écrit « Plus »
  const mods = new Set();
  for (const p of parts) {
    const m = ALIAS[p.toLowerCase()];
    if (!m || mods.has(m)) return null;
    mods.add(m);
  }
  if (key.length === 1) key = key.toUpperCase();
  else if (/^f\d+$/i.test(key)) key = key.toUpperCase();
  else key = NAMED_BY_LOWER.get(key.toLowerCase()) || '';
  if (!SIMPLE_KEY.test(key) && !F_KEY.test(key) && !NAMED.includes(key)) return null;
  return [...MODS.filter((m) => mods.has(m)), key].join('+');
}

// Combinaisons que le système ou Orbe gardent pour eux.
let reservedCache = null;
function reservedMap() {
  if (reservedCache) return reservedCache;
  const out = new Map();
  const add = (kind, list) => { for (const a of list) { const c = canon(a); if (c) out.set(c, kind); } };
  if (platform.isMac) {
    add('system', ['Cmd+Q', 'Shift+Cmd+Q', 'Ctrl+Cmd+Q', 'Alt+Cmd+Escape', 'Cmd+H', 'Alt+Cmd+H', 'Cmd+M', 'Alt+Cmd+M', 'Cmd+Tab', 'Shift+Cmd+Tab',
      'Cmd+Space', 'Ctrl+Space', 'Alt+Cmd+Space', 'Ctrl+Cmd+Space', 'Cmd+`', 'Shift+Cmd+3', 'Shift+Cmd+4', 'Shift+Cmd+5', 'Alt+Cmd+D',
      'Ctrl+Up', 'Ctrl+Down', 'Ctrl+Left', 'Ctrl+Right']);
  } else {
    add('system', ['Alt+F4', 'Alt+Tab', 'Alt+Shift+Tab', 'Ctrl+Alt+Delete', 'Ctrl+Shift+Escape', 'Ctrl+Escape', 'Alt+Space', 'Alt+Escape', 'Alt+Return', 'F10']);
  }
  // Édition (rôles du menu) et accès direct aux onglets et aux Espaces.
  add('orbe', ['Cmd+C', 'Cmd+V', 'Cmd+X', 'Cmd+A', 'Shift+Cmd+V'].map((a) => platform.accel(a)));
  for (let n = 1; n <= 9; n++) add('orbe', [platform.accel(`Cmd+${n}`), platform.accel(`Ctrl+${n}`)]);
  add('orbe', ['Ctrl+Tab', 'Ctrl+Shift+Tab']);
  reservedCache = out;
  return out;
}

// Vérifie un accélérateur proposé : { accel } (forme canonique) ou { error }.
//   bad      : mal formé ;
//   modifier : il manque une touche de modification ;
//   reserved : gardé par le système ou par Orbe (`kind`).
function check(accel) {
  const c = canon(accel);
  if (!c) return { error: 'bad' };
  const parts = c.split('+');
  const key = parts.pop();
  const mods = new Set(parts);
  if (mods.has('Cmd') && !platform.isMac) return { error: 'bad' };
  if (!F_KEY.test(key)) {
    // macOS : ⌥ seul compose des caractères (« é », « œ ») ; il faut ⌘ ou ⌃.
    const strong = platform.isMac ? (mods.has('Cmd') || mods.has('Ctrl')) : (mods.has('Ctrl') || mods.has('Alt'));
    if (!strong) return { error: 'modifier' };
  }
  const kind = reservedMap().get(c);
  if (kind) return { error: 'reserved', kind };
  return { accel: c };
}

const overrides = () => (store.state && store.state.settings.shortcuts) || {};
const overridden = (name) => Object.hasOwn(overrides(), name);

// Accélérateur en vigueur, pour le menu. Sans changement de l'utilisateur, la
// chaîne de la table des commandes est rendue telle quelle.
function accelOf(name) {
  const c = commands.byName.get(name);
  if (!c) return undefined;
  if (overridden(name)) return overrides()[name] || undefined;
  return c.accel;
}

const effective = (name) => canon(accelOf(name) || '') || '';

const GLYPH = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Cmd: '⌘' };
const KEY_GLYPH = { Left: '←', Right: '→', Up: '↑', Down: '↓', Plus: '+', Tab: '⇥', Return: '↩', Backspace: '⌫', Delete: '⌦', Escape: '⎋', Space: '␣', Home: '↖', End: '↘', PageUp: '⇞', PageDown: '⇟' };

// Affichage : « ⇧⌘T » sur macOS, « Ctrl+Shift+T » ailleurs.
function display(accel) {
  const c = canon(accel || '');
  if (!c) return '';
  if (!platform.isMac) return platform.label(c);
  const parts = c.split('+');
  const key = parts.pop();
  return MODS.filter((m) => parts.includes(m)).map((m) => GLYPH[m]).join('') + (KEY_GLYPH[key] || key);
}

function keysOf(name) {
  const c = commands.byName.get(name);
  if (!c) return '';
  if (overridden(name)) return display(overrides()[name] || '');
  return c.keys || '';
}

const keysMap = () => Object.fromEntries(commands.COMMANDS.map((c) => [c.name, keysOf(c.name)]).filter(([, k]) => k));
const defaultKeysMap = () => Object.fromEntries(commands.COMMANDS.filter((c) => c.keys).map((c) => [c.name, c.keys]));

// Commande qui porte déjà cet accélérateur (autre que `except`), ou null.
function owner(accel, except, map = overrides()) {
  const c = canon(accel || '');
  if (!c) return null;
  for (const cmd of commands.COMMANDS) {
    if (cmd.name === except) continue;
    const a = Object.hasOwn(map, cmd.name) ? map[cmd.name] : cmd.accel;
    if (a && canon(a) === c) return cmd.name;
  }
  return null;
}

// Réglage `shortcuts` reçu en bloc : noms connus, accélérateurs canoniques et
// permis, aucun doublon une fois posé sur les raccourcis par défaut.
function validMap(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const entries = Object.entries(v);
  if (entries.length > 400) return false;
  for (const [name, accel] of entries) {
    if (!commands.byName.has(name)) return false;
    if (accel === null) continue;
    const r = check(accel);
    if (r.error || r.accel !== accel) return false;
  }
  const seen = new Set();
  for (const cmd of commands.COMMANDS) {
    const a = Object.hasOwn(v, cmd.name) ? v[cmd.name] : cmd.accel;
    const c = a ? canon(a) : null;
    if (!c) continue;
    if (seen.has(c)) return false;
    seen.add(c);
  }
  return !store.state || !store.state.settings.littleShortcut || !seen.has(canon(store.state.settings.littleShortcut));
}

function write(map) {
  // Un choix identique au raccourci par défaut n'est pas un changement.
  for (const name of Object.keys(map)) {
    const c = commands.byName.get(name);
    if (!c || (map[name] === null ? !c.accel : canon(c.accel || '') === map[name])) delete map[name];
  }
  store.state.settings.shortcuts = map;
  store.save();
  hooks.changed();
}

const labelOf = (name) => {
  const c = commands.byName.get(name);
  if (!c) return name;
  const n = /^pane(\d)$/.exec(name);
  return (store.t(c.label) + (n ? ' ' + n[1] : '')).replace('…', '');
};

// Donne un raccourci à une commande. Déjà pris par une autre : { conflict },
// sauf avec `force`, qui le retire à l'autre commande.
function assign(name, accel, { force = false } = {}) {
  if (!commands.byName.has(name)) return { error: 'unknown' };
  const r = check(accel);
  if (r.error) return r;
  if (canon(store.state.settings.littleShortcut || '') === r.accel) return { error: 'reserved', kind: 'global' };
  const map = { ...overrides() };
  const other = owner(r.accel, name);
  if (other && !force) return { conflict: other, label: labelOf(other), keys: display(r.accel) };
  if (other) map[other] = null;
  map[name] = r.accel;
  write(map);
  return { ok: true, accel: r.accel, keys: display(r.accel), removed: other || null };
}

function clear(name) {
  if (!commands.byName.has(name)) return { error: 'unknown' };
  write({ ...overrides(), [name]: null });
  return { ok: true };
}

// Rend son raccourci par défaut à une commande ; s'il a été donné entre-temps à
// une autre, même question que pour une attribution.
function reset(name, { force = false } = {}) {
  const c = commands.byName.get(name);
  if (!c) return { error: 'unknown' };
  const map = { ...overrides() };
  delete map[name];
  const other = c.accel ? owner(c.accel, name, map) : null;
  if (other && !force) return { conflict: other, label: labelOf(other), keys: display(c.accel) };
  if (other) map[other] = null;
  write(map);
  return { ok: true, removed: other || null };
}

function resetAll() {
  write({});
  return { ok: true };
}

// Regroupement par menu, pour le volet « Raccourcis » des réglages.
const GROUPS = [
  ['menu.file', ['newTab', 'newWindow', 'newBlank', 'newIncognito', 'newLittle', 'newNote', 'newEasel', 'reopen', 'commandBar', 'closeTab', 'closeWindow', 'capture', 'captureFull', 'captureToEasel', 'savePage', 'print', 'share']],
  ['menu.edit', ['undo', 'redo', 'copyUrl', 'copyUrlMarkdown', 'copyUrlQuote', 'pasteUrl', 'find', 'findReplace', 'findNext', 'findPrev', 'useSelectionFind', 'jumpToSelection', 'formatB', 'formatI', 'formatU', 'transformUpper', 'transformLower', 'transformCapitalize']],
  ['menu.view', ['toggleSidebar', 'toggleToolbar', 'collapsePinned', 'stop', 'reload', 'forceReload', 'clearCookies', 'clearCache', 'addSplit', 'addSplitRight', 'addSplitLeft', 'addSplitTop', 'addSplitBottom', 'splitDirection', 'closeSplit', 'separateSplit', 'separateAll', 'expandSplit', 'nextPane', 'prevPane', 'pane1', 'pane2', 'pane3', 'pane4', 'boost', 'zap', 'boosts', 'actualSize', 'zoomIn', 'zoomOut', 'fullscreen']],
  ['view.developer', ['source', 'devtools', 'inspect', 'console', 'network', 'toggleDevMode', 'taskManager']],
  ['menu.spaces', ['newSpace', 'editTheme', 'renameSpace', 'newProfile', 'deleteSpace', 'manageSpaces', 'nextSpace', 'prevSpace']],
  ['menu.tabs', ['togglePin', 'newFolder', 'duplicate', 'expandPeek', 'openInSpace', 'toggleMute', 'nextTab', 'prevTab', 'revealTab', 'clearToday', 'resetTabs', 'expandFolders', 'collapseFolders']],
  ['menu.archive', ['back', 'forward', 'history', 'viewArchive', 'clearArchive']],
  ['menu.window', ['stayOnTop', 'library', 'downloads', 'media', 'notes', 'easels']],
  ['menu.extensions', ['cycleExtensions']],
];

function list() {
  const placed = new Set();
  const row = (name) => {
    const c = commands.byName.get(name);
    if (!c || placed.has(name)) return null;
    placed.add(name);
    return { name, label: labelOf(name), keys: keysOf(name), accel: effective(name), defaultKeys: c.keys || '', changed: overridden(name) };
  };
  const groups = GROUPS.map(([title, names]) => ({ title: store.t(title), items: names.map(row).filter(Boolean) }));
  const rest = commands.COMMANDS.map((c) => row(c.name)).filter(Boolean);
  groups.push({ title: 'Orbe', items: rest });
  return groups.filter((g) => g.items.length);
}

// Texte de l'interface qui cite le raccourci d'une commande (« … — ⌘Z pour
// annuler ») : suit le raccourci en vigueur.
function inText(text, name) {
  const c = commands.byName.get(name);
  const now = keysOf(name);
  if (!c || !c.keys || now === c.keys) return text;
  return now ? text.replace(c.keys, now) : text;
}

module.exports = { canon, check, accelOf, effective, keysOf, keysMap, defaultKeysMap, display, owner, validMap, assign, clear, reset, resetAll, list, labelOf, inText, hooks, reservedMap };
