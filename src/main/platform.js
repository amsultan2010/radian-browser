// Tout ce qui dépend du système (macOS ou Windows) est regroupé ici : habillage
// des fenêtres, raccourcis clavier et leur affichage, menu, chemins.
// Le reste du code appelle ces fonctions sans tester la plateforme lui-même.
// Sur macOS, chaque fonction rend exactement ce que le code faisait avant.
const os = require('os');
const path = require('path');
const fs = require('fs');

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

// --- Raccourcis clavier -------------------------------------------------------
// Les commandes sont écrites une fois, avec les raccourcis d'Arc pour macOS.
// Ailleurs, ⌘ devient Ctrl ; les cas où cela ne suffit pas (touche déjà prise
// par Ctrl, usage établi sous Windows) sont listés ici. Voir docs/windows.md.
const WIN_ACCEL = {
  'Cmd+Y': 'Ctrl+H', // Historique (Ctrl+Y rétablit une frappe sous Windows)
  'Shift+Cmd+J': 'Ctrl+J', // Téléchargements
  'Alt+Cmd+J': 'Ctrl+Shift+J', // Console
  'Alt+Cmd+I': 'Ctrl+Shift+I', // Outils de développement
  'Alt+Cmd+C': 'F12', // Inspecter (Ctrl+Shift+C copie l'adresse, comme dans Arc)
  'Alt+Cmd+U': 'Ctrl+U', // Code source
  'Cmd+[': 'Alt+Left', // Page précédente
  'Cmd+]': 'Alt+Right', // Page suivante
  'Ctrl+Cmd+F': 'F11', // Plein écran
  'Cmd+J': 'Alt+Shift+J', // Aller à la sélection (Ctrl+J ouvre les téléchargements)
  'Ctrl+Cmd+N': 'Alt+Shift+B', // Fenêtre vierge (Ctrl+N ouvre une fenêtre ordinaire)
  'Shift+Cmd+2': 'Alt+Shift+2', // Capture (Ctrl+Shift+2 vise le volet 2)
  'Ctrl+Shift+Cmd+C': 'Alt+Shift+C', // Copier en citation
  'Ctrl+Shift+N': 'Alt+Shift+N', // Nouvelle note (Ctrl+Shift+N ouvre la navigation privée)
  'Ctrl+Alt+N': 'Alt+Shift+M', // Note à côté de la page (Ctrl+Alt+N ouvre une petite fenêtre)
  'Ctrl+D': 'Alt+Shift+D', // Mode développeur du site (Ctrl+D épingle l'onglet)
  // ⌃1…⌃9 change d'Espace sur macOS ; Ctrl+1…9 vise les onglets sous Windows.
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`Ctrl+${n}`, `Alt+${n}`])),
};

const MODS = ['Ctrl', 'Alt', 'Shift', 'Cmd'];
const MOD_ALIAS = { cmd: 'Cmd', command: 'Cmd', meta: 'Cmd', super: 'Cmd', ctrl: 'Ctrl', control: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift' };

function parse(accel) {
  const parts = String(accel).split('+');
  // « Cmd++ » n'existe pas ici (la table écrit « Plus »), la dernière partie est la touche.
  const key = parts.pop();
  const mods = new Set(parts.map((p) => MOD_ALIAS[p.toLowerCase()] || p));
  return { mods, key };
}

const join = (mods, key) => [...MODS.filter((m) => mods.has(m)), key].join('+');
const norm = (accel) => { const p = parse(accel); return join(p.mods, p.key.length === 1 ? p.key.toUpperCase() : p.key); };
const WIN_BY_NORM = new Map(Object.entries(WIN_ACCEL).map(([k, v]) => [norm(k), v]));

// Raccourci d'Arc (macOS) -> raccourci pour ce système.
function accel(mac) {
  if (!mac || isMac) return mac;
  const n = norm(mac);
  if (WIN_BY_NORM.has(n)) return WIN_BY_NORM.get(n);
  const { mods, key } = parse(n);
  if (mods.delete('Cmd')) mods.add('Ctrl');
  return join(mods, key);
}

const GLYPH_MOD = { '⌘': 'Cmd', '⌃': 'Ctrl', '⌥': 'Alt', '⇧': 'Shift' };
const GLYPH_KEY = { '←': 'Left', '→': 'Right', '↑': 'Up', '↓': 'Down', '⇥': 'Tab', '+': 'Plus' };
const KEY_LABEL = { Left: '←', Right: '→', Up: '↑', Down: '↓', Plus: '+' };
const GLYPHS = /[⌘⌃⌥⇧]+(?:[A-Za-z0-9←→↑↓⇥,.[\]=+-](?![A-Za-zÀ-ÿ]))?/g;

// Notation Windows d'un raccourci : « Ctrl+Alt+Maj+T » s'écrit ici à l'anglaise
// (Ctrl, Alt, Shift), comme sur les claviers et dans les menus de Windows.
function label(a) {
  const { mods, key } = parse(a);
  return [...MODS.filter((m) => mods.has(m)), KEY_LABEL[key] || key].join('+');
}

// Affichage d'un raccourci noté pour macOS (« ⇧⌘T ») dans la notation du système.
function keys(glyphs) {
  if (!glyphs || isMac) return glyphs;
  return String(glyphs).replace(GLYPHS, (m) => {
    const chars = [...m];
    const mods = chars.filter((c) => GLYPH_MOD[c]).map((c) => GLYPH_MOD[c]);
    const key = chars.find((c) => !GLYPH_MOD[c]);
    // Modificateur cité seul (« maintenir ⌃ ») : la touche du même nom.
    if (!key) return mods.map((x) => (x === 'Cmd' ? 'Ctrl' : x)).join('+');
    return label(accel([...mods, GLYPH_KEY[key] || key].join('+')));
  });
}

// Adapte la table des commandes (une fois, au chargement).
function adaptCommands(list) {
  if (isMac) return list;
  for (const c of list) {
    if (c.accel) { c.accel = accel(c.accel); c.keys = label(c.accel); }
  }
  return list;
}

// Les textes de l'interface citent quelques raccourcis (« Appuie sur ⌘T… »).
function adaptLocales(locales) {
  if (isMac) return locales;
  for (const table of Object.values(locales)) {
    for (const k of Object.keys(table)) if (typeof table[k] === 'string' && /[⌘⌃⌥⇧]/.test(table[k])) table[k] = keys(table[k]);
  }
  return locales;
}

// --- Habillage des fenêtres ---------------------------------------------------
const CAPTION_H = 32; // hauteur des boutons de fenêtre de Windows
const CAPTION_TOOLBAR_H = 46; // … quand la barre d'outils est affichée
const ICON = path.join(__dirname, '..', '..', 'assets', 'orbe.ico');

// Fond de la coque, comme le calcule base.css : couleur de l'Espace mêlée au
// fond clair ou sombre. Sert de fond opaque et de couleur aux boutons de fenêtre.
function tint(color, dark) {
  const base = dark ? [0x16, 0x16, 0x1a] : [0xf3, 0xf3, 0xf5];
  const k = dark ? 0.24 : 0.18;
  const m = /^#([0-9a-f]{6})$/i.exec(color || '');
  const c = m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : base;
  return '#' + base.map((b, i) => Math.round(c[i] * k + b * (1 - k)).toString(16).padStart(2, '0')).join('');
}

// Boutons de fenêtre : fond transparent (ils se posent sur le fond de la coque,
// dégradé compris), seuls les symboles suivent le thème.
const overlay = (color, dark, height) => ({ color: '#00000000', symbolColor: dark ? '#f3f3f5' : '#1d1d1f', height });

// Mica : Windows 11 22H2 ou plus récent.
function materialSupported() {
  if (!isWin || process.env.ORBE_NO_MATERIAL) return false;
  const build = Number(os.release().split('.')[2]);
  return build >= 22621;
}

// Options de fenêtre propres au système.
//   traffic : position des feux tricolores (macOS) ;
//   inset   : fenêtre annexe à barre de titre « hiddenInset » (réglages, Boost) ;
//   color, dark : couleur de l'Espace et thème, pour le fond sous Windows.
function windowChrome({ traffic, inset = false, color = '', dark = false, translucent = false } = {}) {
  if (isMac) {
    const o = { titleBarStyle: inset ? 'hiddenInset' : 'hidden', vibrancy: 'sidebar', backgroundColor: '#00000000' };
    if (traffic) o.trafficLightPosition = traffic;
    return o;
  }
  const o = { titleBarStyle: 'hidden', backgroundColor: tint(color, dark), autoHideMenuBar: true };
  if (isWin) {
    o.titleBarOverlay = overlay(color, dark, CAPTION_H);
    if (fs.existsSync(ICON)) o.icon = ICON;
    if (translucent && materialSupported()) { o.backgroundMaterial = 'mica'; o.backgroundColor = '#00000000'; }
  }
  return o;
}

// Feux tricolores de macOS ; sans objet ailleurs (les boutons de Windows
// restent en place, à droite).
function setButtons(win, visible, traffic) {
  if (!isMac) return;
  win.setWindowButtonVisibility(visible);
  if (visible) win.setWindowButtonPosition(traffic);
}

// Marge au-dessus des pages. Sous Windows, sans barre d'outils, une bande de
// la hauteur des boutons de fenêtre reste libre en haut : ils ne recouvrent
// jamais la page, et la bande sert à déplacer la fenêtre.
function topInset(win, pad, toolbar) {
  if (!isWin || toolbar || win.isFullScreen()) return pad;
  return CAPTION_H;
}

// Boutons de fenêtre et fond aux couleurs de l'Espace (Windows). Appelé à
// chaque envoi d'état ; ne touche à la fenêtre que si quelque chose a changé.
const chromeSig = new WeakMap();
function syncChrome(win, { color, dark, toolbar, translucent }) {
  if (!isWin || win.isDestroyed()) return;
  const mica = !!translucent && materialSupported();
  const sig = [color, dark, toolbar, mica].join('|');
  if (chromeSig.get(win) === sig) return;
  chromeSig.set(win, sig);
  try {
    win.setTitleBarOverlay(overlay(color, dark, toolbar ? CAPTION_TOOLBAR_H : CAPTION_H));
    win.setBackgroundMaterial(mica ? 'mica' : 'none');
    win.setBackgroundColor(mica ? '#00000000' : tint(color, dark));
  } catch (err) {
    console.error('[orbe] habillage', err.message);
  }
}

// --- Menu ---------------------------------------------------------------------
const MAC_ROLES = new Set(['services', 'hide', 'hideOthers', 'unhide', 'front', 'zoom']);

// Retire du menu ce qui n'existe que sur macOS.
function menuTemplate(template) {
  if (isMac) return template;
  const clean = (items, top) => {
    const out = [];
    for (const it of items) {
      if (it.role && MAC_ROLES.has(it.role)) continue;
      const copy = { ...it };
      if (top) delete copy.role;
      if (Array.isArray(copy.submenu)) copy.submenu = clean(copy.submenu, false);
      const last = out[out.length - 1];
      if (copy.type === 'separator' && (!last || last.type === 'separator')) continue;
      out.push(copy);
    }
    while (out.length && out[out.length - 1].type === 'separator') out.pop();
    return out;
  };
  return clean(template, true);
}

// Windows n'a pas de barre de menus globale, et la fenêtre d'Orbe n'en affiche
// pas : le menu reste chargé (ses raccourcis fonctionnent) et s'ouvre depuis
// le bouton « ⋯ » de la barre latérale.
function popupAppMenu(win) {
  const { Menu } = require('electron');
  const menu = Menu.getApplicationMenu();
  if (menu && win && !win.isDestroyed()) menu.popup({ window: win, x: 12, y: 44 });
}

// --- Navigateur par défaut ------------------------------------------------------
// Windows ne laisse pas une application se déclarer elle-même : Orbe s'inscrit
// comme navigateur dans le registre de l'utilisateur (win-default.js), puis
// ouvre la page des applications par défaut, où le choix se fait à la main.
function makeDefault() {
  const { app, shell } = require('electron');
  if (isWin) {
    const wd = require('./win-default');
    return wd.register()
      .catch((err) => console.error('[orbe] inscription comme navigateur', err.message))
      .then(() => shell.openExternal(wd.settingsUrl()).catch(() => {}));
  }
  app.setAsDefaultProtocolClient('http');
  app.setAsDefaultProtocolClient('https');
}

// Windows : retire l'inscription (et celle, plus ancienne, des protocoles).
function undoDefault() {
  if (!isWin) return Promise.resolve(false);
  const { app } = require('electron');
  for (const scheme of ['http', 'https']) { try { app.removeAsDefaultProtocolClient(scheme); } catch {} }
  return require('./win-default').unregister().then(() => true, (err) => { console.error('[orbe] retrait de l’inscription', err.message); return false; });
}

// --- Chemins ------------------------------------------------------------------
// Fichier de barre latérale d'Arc. Sous Windows, Arc est un paquet MSIX : ses
// données sont dans %LOCALAPPDATA%\Packages\TheBrowserCompany.Arc_…\LocalCache\Local\Arc.
function arcSidebarFile() {
  if (isMac) return path.join(os.homedir(), 'Library', 'Application Support', 'Arc', 'StorableSidebar.json');
  if (isWin) {
    const packages = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Packages');
    let dirs = [];
    try { dirs = fs.readdirSync(packages).filter((d) => d.startsWith('TheBrowserCompany.Arc')); } catch {}
    for (const d of dirs) {
      const f = path.join(packages, d, 'LocalCache', 'Local', 'Arc', 'StorableSidebar.json');
      if (fs.existsSync(f)) return f;
    }
  }
  return '';
}

// Dossier des profils Chromium d'Arc (historique, mots de passe, cookies). macOS seulement :
// sous Windows, Arc chiffre avec une clé liée à son propre programme (import-arc-data.js).
function arcUserDataDir() {
  return isMac ? path.join(os.homedir(), 'Library', 'Application Support', 'Arc', 'User Data') : '';
}

module.exports = {
  isMac, isWin, name: isMac ? 'mac' : isWin ? 'win' : 'linux',
  accel, keys, label, adaptCommands, adaptLocales, WIN_ACCEL,
  windowChrome, setButtons, topInset, syncChrome, tint, materialSupported, CAPTION_H,
  menuTemplate, popupAppMenu, makeDefault, undoDefault, arcSidebarFile, arcUserDataDir,
};
