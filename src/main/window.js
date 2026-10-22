// Une fenêtre Orbe : une vue « coque » (barre latérale) qui occupe toute la
// fenêtre, les vues web des onglets posées par-dessus dans la zone de contenu,
// et des vues flottantes (barre de commande, recherche, notifications).
const { app, BaseWindow, WebContentsView, Menu, clipboard, ClipboardItem, screen, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { store, uid, SPACE_COLORS, DEFAULT_SETTINGS } = require('./store');
const veille = require('./veille');
const empreinte = require('./empreinte');
const icons = require('./icons');
const keepalive = require('./keepalive');
const Theme = require('../renderer/theme');
const sounds = require('./sounds');
const sessions = require('./sessions');
const suggest = require('./suggest');
const adblock = require('./adblock');
const boosts = require('./boosts');
const platform = require('./platform');
const prefs = require('./prefs');
const palette = require('./palette');

// Marge autour de la page : 10 pt, comme mesuré dans Arc.
const PAD = 10;
const GAP = 8;
const RADIUS = 10;
const TOOLBAR_H = 40;
const PEEK_PULL = 150; // déplacement (px) au bout duquel un aperçu tiré se ferme
const PEEK_BAR = 40; // marge au-dessus de la carte de l'aperçu quand son adresse s'affiche
const SPLIT_BAR = 28; // petite barre de chaque volet d'une vue scindée (adresse, options, fermer)
const TRAFFIC = { x: 15, y: 15 };
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 420;
const UI_PRELOAD = path.join(__dirname, '../preload/ui.js');
const INTERNAL = 'orbe://app/';
// Tout ce qui compte pour la sécurité est écrit ici, sans rien laisser à l'héritage : ces
// préférences servent aussi aux vues que la coque ouvre elle-même (`adoptSpare`).
// (Figées, et toujours passées en copie : Electron écrit dans l'objet qu'il reçoit.)
const UI_PREFS = Object.freeze({
  preload: UI_PRELOAD, sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: false,
  nodeIntegrationInWorker: false, webviewTag: false, webSecurity: true, allowRunningInsecureContent: false, experimentalFeatures: false,
});
// Textes venus d'une page web et montrés par l'interface : bornés avant de lui être envoyés.
const STATUS_MAX = 2000;
const ICON_MAX = 65536;
// Processus de la coque perdu : délai avant de la recharger, selon le nombre de pertes dans la minute.
// Durée pendant laquelle un glisser signalé retient la réserve de vues (ms).
const DRAG_HOLD = 8000;
// Échap en plein écran : deux appuis en moins de 400 ms, ou une touche tenue 600 ms, en font sortir.
const ESC_DOUBLE = 400;
const ESC_HOLD = 600;
// Glisser un onglet sur une page seule : part de la hauteur, en haut et en bas, qui empile la vue.
const DROP_EDGE = 0.25;
// Onglet glissé hors de la fenêtre : la nouvelle fenêtre se pose avec ce point de sa barre sous le pointeur.
const TEAR = { x: 120, y: 60 };
const uiRetryDelay = (n) => (n <= 3 ? 150 : Math.min(60000, 5000 * 2 ** (n - 4)));
// Vues d'appoint tenues prêtes par la coque (voir `fillSpares`).
const RESERVE = 'overlay.html#reserve';
const FLOAT = 'shell.html#flottant';
const SPARES = 3;
const FIRST_RENDER_WAIT = 400;
const AUX = ['modal', 'findView', 'toastView', 'peekChrome', 'floatView', 'statusView', 'dropView', 'swipeView'];
const UNDO_MAX = 50; // actions de la barre latérale que ⌘Z peut défaire, par fenêtre
const FAVORITES_MAX = 12; // favoris par profil, comme dans Arc
const NAV_MENU_MAX = 15; // pages proposées par le menu de précédent / suivant

const windows = new Map(); // id BaseWindow -> OrbeWindow
const live = new Map(); // id onglet -> { view, wc, owner, loading, lastUsed }
const trusted = new WeakSet(); // webContents autorisés à parler au processus principal
const wcOwner = new Map(); // id webContents (coque, flottants) -> OrbeWindow
let spareSeq = 0;
const loadingUi = new WeakSet(); // vues de l'interface créées à part, dont la page charge encore
// `rightInset(fenêtre)` : place réservée à droite des pages (panneau latéral d'une
// extension) ; `layout(fenêtre)` : appelé à la fin de chaque mise en page.
// Une page détruite hors d'Orbe moins de quinze secondes après « Rester » n'est pas une page
// qui s'est fermée d'elle-même : son onglet reste (voir `wire`, événement `destroyed`).
const STAY_GUARD = 15000;
const HISTORY_MAX = 50; // pages du parcours rendues à un onglet rouvert
const REPLACE_MAX = 500; // « Tout remplacer » : nombre d'occurrences traitées au plus en une fois
const SLEEP_WAIT = 4000; // temps laissé à une page pour répondre à une veille avant de la reproposer
let lastLost = null; // dernière page ainsi perdue (diagnostic)
// Journal court, par page, de ce qui a mené à sa fermeture : qui l'a consultée, ce qu'elle a
// répondu, qui l'a détruite. Lu quand une page disparaît sans raison connue.
function note(rt, what) {
  const trail = rt.trail || (rt.trail = []);
  trail.push(`${new Date().toISOString().slice(11, 23)} ${what}`);
  if (trail.length > 16) trail.shift();
}

const hooks = {
  changed: () => {}, openLittle: () => {}, route: () => null, openRouted: () => {}, openSettings: () => {}, extensionMenu: () => [], rightInset: () => 0, layout: () => {},
  // Raccords posés par essentials.js (feuilles d'onglet, certificats, « quitter la page ? », fenêtres surgissantes…).
  sheetFocus: () => null, leave: () => true, closeAll: async () => true, quitState: { quitting: false }, shield: () => false, unshield: () => {}, stayed: () => Infinity, input: () => {}, popup: () => true, navigated: () => {},
  busy: () => false, tabState: () => [], navState: () => ({}), failed: () => false, gone: () => {}, hung: () => {}, action: () => undefined, siteMenu: () => [],
  // Note « mise à jour disponible » de la barre latérale ({ version } ou null) : posée par main.js.
  updateNote: () => null,
  // Position du pointeur à l'écran (onglet glissé hors de la fenêtre) ; remplacée dans les essais.
  cursor: () => screen.getCursorScreenPoint(),
  // Met une fenêtre en plein écran (nouvelle fenêtre ouverte depuis une fenêtre en plein écran) ; remplacé dans les essais.
  enterFullScreen: (win) => { if (!win.isDestroyed()) win.setFullScreen(true); },
  // Choix du fichier où enregistrer (export d'un Espace) ; remplacé dans les essais.
  saveFile: async (parent, options) => { const r = await dialog.showSaveDialog(parent, options); return r.canceled ? null : r.filePath; },
  // Un arrêt d'Orbe demandé puis retenu par une page (« Rester ») : posé par main.js.
  quitAborted: () => {},
};

const t = (key, vars) => store.t(key, null, vars);
// Ce qu'une première fenêtre reprend de la session précédente : l'Espace affiché
// et l'onglet actif de chaque Espace. Réglage coupé : premier Espace, aucun onglet actif.
function resumed(saved, spaces, on) {
  if (!on) return { spaceId: spaces[0].id, activeBySpace: {} };
  return { spaceId: spaces.some((s) => s.id === saved.spaceId) ? saved.spaceId : spaces[0].id, activeBySpace: { ...(saved.activeBySpace || {}) } };
}
// Nom d'un Espace dans un menu. Quand son profil n'est pas celui de l'Espace d'où l'on
// part (`from`), il est rappelé à la suite (pastille de profil d'Arc) : déplacer un onglet
// vers un Espace d'un autre profil change ses cookies et ses identifiants, autant le voir avant.
function spaceLabel(sp, data = store.state, from = null, gap = ' ') {
  const base = `${sp.icon}${gap}${sp.name}`;
  const profiles = (data && data.profiles) || [];
  if (profiles.length < 2 || !from || sp.profileId === from) return base;
  const p = profiles.find((x) => x.id === sp.profileId);
  return p && p.name ? `${base}  ·  ${p.name}` : base;
}
const isInternal = (url) => (url || '').startsWith(INTERNAL);
const isErrorPage = (url) => (url || '').startsWith(INTERNAL + 'error.html');
// Pages internes pouvant s'ouvrir dans un onglet, avec accès à l'interface.
const INTERNAL_PAGES = new Set(['library.html', 'shortcuts.html', 'welcome.html', 'notes.html', 'easel.html', 'tasks.html']);
// Adresse fournie par une page web (lien, image, glisser-déposer) : seuls
// http et https sont acceptés, jamais file:, orbe: ou chrome:.
const webUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Messages de l'interface qui ne sont pas un geste de l'utilisateur (aucun son ne les suit).
const QUIET_ACTIONS = new Set(['ready', 'battery', 'themeGet', 'suggest', 'select', 'dragZone', 'dragZoneOver', 'sidebarWidth', 'splitResize']);
// Ce que l'interface reçoit du thème d'un Espace (voir src/renderer/theme.js).
const themeFields = (s) => ({ color: s.color, color2: s.color2 || '', color3: s.color3 || '', plain: !!s.plain, intensity: typeof s.intensity === 'number' ? s.intensity : 0.5, grain: s.grain || 0, texture: s.texture || 'grain', mode: s.mode || 'auto' });

// --- Mouvements des vues ------------------------------------------------------
// Durées, pose animée des vues et suivi de leur vol : src/main/motion.js.
const { MOTION, motion, forceMotion, place, boundsOf, inFlight, stats } = require('./motion');
const DROP_BOUNCE = 320; // la zone de dépôt reste le temps du rebond de la bulle (ms)
// Nom horodaté d'une capture ; deux captures dans la même seconde ne s'écrasent pas.
let lastStamp = '';
let stampCount = 0;
function captureStamp() {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  stampCount = stamp === lastStamp ? stampCount + 1 : 0;
  lastStamp = stamp;
  return stampCount ? `${stamp} (${stampCount + 1})` : stamp;
}

function findNode(nodes, id) {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.id === id) return { arr: nodes, index: i, node: n };
    if (n.type === 'folder') {
      const f = findNode(n.children, id);
      if (f) return f;
    }
  }
  return null;
}

function* walk(nodes) {
  for (const n of nodes) {
    if (n.type === 'folder') yield* walk(n.children);
    else yield n.id;
  }
}

function sameHost(a, b) {
  try { return new URL(a).host.replace(/^www\./, '') === new URL(b).host.replace(/^www\./, ''); } catch { return false; }
}

function samePage(a, b) {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.host === y.host && x.pathname === y.pathname;
  } catch {
    return a === b;
  }
}

// Adresse débarrassée de ses paramètres de pistage, pour la copie (« Copy URL »
// d'Arc copie le lien « without any trackers »). Seuls des paramètres connus pour
// ne servir qu'au suivi sont retirés ; une fiche Amazon est réduite à son
// identifiant de produit (le reste de l'adresse y décrit la recherche d'origine).
const TRACKING = /^(utm_[a-z0-9_]+|fbclid|gclid|gclsrc|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|igsh|yclid|twclid|ttclid|li_fat_id|_hsenc|_hsmi|__hssc|__hstc|__hsfp|hsctatracking|mkt_tok|vero_id|vero_conv|oly_anon_id|oly_enc_id|s_cid|ref_src|ref_url|rb_clickid|srsltid|_openstat|wickedid|_ga|_gl|si)$/i;
// Domaines d'Amazon, nommés un par un : « amazon.<n'importe quoi> » ne suffit pas
// (amazon.zip, amazon.attack… appartiennent à qui les achète).
const AMAZON = /(^|\.)amazon\.(com|ca|com\.mx|com\.br|co\.uk|de|fr|it|es|nl|se|pl|com\.be|ie|com\.tr|ae|sa|eg|in|co\.jp|com\.au|sg|cn|co\.za)$/i;
function cleanUrl(input) {
  let u;
  try { u = new URL(input); } catch { return input; }
  if (!/^https?:$/.test(u.protocol)) return input;
  // `si` : jeton de partage de YouTube et de Spotify seulement (ailleurs, un paramètre ordinaire).
  const share = /(^|\.)(youtube\.com|youtu\.be|spotify\.com)$/i.test(u.hostname);
  let changed = false;
  for (const key of [...u.searchParams.keys()]) {
    if (!TRACKING.test(key) || (key.toLowerCase() === 'si' && !share)) continue;
    u.searchParams.delete(key);
    changed = true;
  }
  const product = AMAZON.test(u.hostname) && /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/.exec(u.pathname);
  if (product) return `${u.origin}/dp/${product[1]}`;
  if (!changed) return input;
  return u.toString().replace(/\?(#|$)/, '$1');
}

// Lien Markdown : le titre et l'adresse viennent de la page. Dans le titre, crochets
// et barre oblique inverse sont échappés (un « ] » fermerait le texte du lien, et le
// reste du titre deviendrait l'adresse) ; dans l'adresse, parenthèses, espaces et
// chevrons sont encodés (une « ) » fermerait l'adresse).
function mdLink(title, url) {
  const text = String(title || url || '').replace(/[\r\n]+/g, ' ').replace(/[\\[\]]/g, '\\$&');
  const href = String(url || '').replace(/[()<>\s\\]/g, (c) => encodeURIComponent(c).replace(/[()]/g, (x) => '%' + x.charCodeAt(0).toString(16).toUpperCase()));
  return `[${text}](${href})`;
}

// Liens de réunion (Meet, Zoom, Teams, Webex…) : toujours dans un onglet d'un
// Espace, jamais en aperçu ni en petite fenêtre — on y reste longtemps, micro ouvert.
function isMeetingUrl(input) {
  let u;
  try { u = new URL(input); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  const h = u.hostname.toLowerCase();
  if (h === 'meet.google.com') return u.pathname.length > 1;
  if (/(^|\.)zoom\.us$/.test(h)) return /^\/(j|s|w|wc|my)\//.test(u.pathname);
  if (h === 'teams.microsoft.com' || h === 'teams.live.com') return /^\/(l\/meetup-join|meet)\//.test(u.pathname);
  if (/(^|\.)webex\.com$/.test(h)) return /\/(meet|join|j\.php)/.test(u.pathname);
  if (h === 'whereby.com' || h === 'meet.jit.si' || h === 'app.gather.town') return u.pathname.length > 1;
  return false;
}

// Mémoire des processus d'onglets, en Mo (`app.getAppMetrics`). Un onglet peut
// occuper plusieurs processus (cadres d'autres sites) et un processus servir
// plusieurs onglets : `total` compte chaque processus une fois, `of(id)` ne rend
// que ce qui est propre à l'onglet. Sous Windows la mémoire privée est connue ;
// ailleurs c'est la mémoire résidente, qui compte aussi les pages partagées
// (relevé sur macOS : 60 Mo de trop par processus léger, voir docs/suivi/ameliorations.md).
// Mémoire d'un processus, en Mo : son empreinte réelle quand elle est connue (Windows :
// `privateBytes` ; macOS : relevé récent d'empreinte.js), sinon sa mémoire résidente.
function processMb(m) {
  const real = m.memory.privateBytes ? m.memory.privateBytes / 1024 : empreinte.of(m.pid, m.creationTime);
  return real !== undefined ? real : (m.memory.workingSetSize || 0) / 1024;
}

// Processus de rendu des onglets : [{ pid, creationTime }] (pour le relevé d'empreinte).
function tabProcesses() {
  const pids = new Set();
  for (const rt of live.values()) {
    if (rt.wc.isDestroyed()) continue;
    try { for (const f of rt.wc.mainFrame.framesInSubtree) pids.add(f.osProcessId); } catch {}
  }
  return app.getAppMetrics().filter((m) => pids.has(m.pid)).map((m) => ({ pid: m.pid, creationTime: m.creationTime }));
}

// Adresse de la page d'un onglet vivant, telle que le moteur la rapporte.
function liveUrl(rt) {
  try { return rt.wc.getURL() || ''; } catch { return ''; }
}
let lastSweep = null; // dernier passage de veille : { at, totalMb, budgetMb, real }

function tabMemory() {
  const byPid = new Map(app.getAppMetrics().map((m) => [m.pid, processMb(m)]));
  const users = new Map(); // pid -> nombre d'onglets qui s'en servent
  const pidsOf = new Map(); // id d'onglet -> pids
  for (const rt of live.values()) {
    if (rt.wc.isDestroyed()) continue;
    const pids = new Set();
    try { for (const f of rt.wc.mainFrame.framesInSubtree) pids.add(f.osProcessId); } catch {}
    pidsOf.set(rt.id, pids);
    for (const pid of pids) users.set(pid, (users.get(pid) || 0) + 1);
  }
  let total = 0;
  for (const pid of users.keys()) total += byPid.get(pid) || 0;
  const of = (id) => { let mb = 0; for (const pid of pidsOf.get(id) || []) if (users.get(pid) === 1) mb += byPid.get(pid) || 0; return mb; };
  // `real` : le total vient d'empreintes réelles, pas de mémoire résidente.
  const metrics = new Map(app.getAppMetrics().map((m) => [m.pid, m]));
  const real = users.size > 0 && [...users.keys()].every((pid) => { const m = metrics.get(pid); return !!m && (!!m.memory.privateBytes || empreinte.of(m.pid, m.creationTime) !== undefined); });
  return { total, of, real };
}

// Vignettes de la bascule ⌃Tab : elle ne montre que huit onglets, seules les
// huit dernières vignettes prises sont donc gardées (23 Ko pièce).
const THUMBS = 8;
const thumbIds = [];
function keepThumb(rt, data) {
  rt.thumb = data;
  const i = thumbIds.indexOf(rt.id);
  if (i >= 0) thumbIds.splice(i, 1);
  thumbIds.push(rt.id);
  while (thumbIds.length > THUMBS) {
    const old = live.get(thumbIds.shift());
    if (old) old.thumb = null;
  }
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph', 'NumLock', 'ScrollLock', 'Fn', 'Hyper', 'Super']);
// Téléchargements en cours, par page d'origine : son onglet ne s'endort pas (voir `trimLive`).
const downloading = new Map(); // id webContents -> identifiants des téléchargements
let downloadsStarted = 0; // compteur : la barre latérale fait tomber un fichier dans la Bibliothèque à chaque nouveau
function noteDownload(phase, d, wc) {
  if (!d) return;
  if (phase === 'start') downloadsStarted += 1;
  if (phase === 'done' || (d.state && d.state !== 'progressing')) {
    for (const [id, set] of downloading) { set.delete(d.id); if (!set.size) downloading.delete(id); }
    return;
  }
  if (!wc || wc.isDestroyed()) return;
  if (!downloading.has(wc.id)) downloading.set(wc.id, new Set());
  downloading.get(wc.id).add(d.id);
}
// Pastille de l'adresse du lien survolé : largeur courte, délai avant qu'elle ne s'étende,
// durées de ses mouvements, marge autour d'elle où le pointeur la fait s'écarter.
const STATUS = { short: 420, expandAfter: 1500, grow: 160, dodge: 140, margin: 10, poll: 90, height: 26 };
// Lecteurs miniatures de la barre latérale (src/main/media.js).
const media = require('./media').make({ live, pushAll: () => OrbeWindow.pushAll(), windows: () => OrbeWindow.all, strip: (u) => suggest.strip(u) });
const prewoken = new Map(); // origine -> instant de la dernière pré-connexion (voir `prewake`)

let pushScheduled = false;

class OrbeWindow {
  static get all() { return [...windows.values()]; }
  static get focused() {
    const f = BaseWindow.getFocusedWindow();
    return (f && windows.get(f.id)) || null;
  }
  static get primary() {
    return OrbeWindow.focused && !OrbeWindow.focused.incognito
      ? OrbeWindow.focused
      : OrbeWindow.all.find((w) => w.shared) || OrbeWindow.all.find((w) => !w.incognito) || null;
  }
  static ownerOf(wc) {
    if (wcOwner.has(wc.id)) return wcOwner.get(wc.id);
    for (const rt of live.values()) if (rt.wc === wc) return rt.owner;
    return null;
  }

  // Regroupe toutes les modifications d'un même tour de boucle en un seul envoi.
  static pushAll() {
    if (pushScheduled) return;
    pushScheduled = true;
    setImmediate(() => {
      pushScheduled = false;
      for (const w of windows.values()) w.sendState();
      hooks.changed();
    });
  }

  // `blank` : fenêtre vierge, comme dans Arc — hors des Espaces. Elle a ses propres
  // onglets, que rien n'enregistre dans la barre latérale des autres fenêtres, mais
  // garde la session ordinaire (cookies, historique), à la différence de la navigation
  // privée. Ses onglets fermés ne rejoignent pas l'archive (voir `archives`).
  constructor({ incognito = false, blank = false } = {}) {
    this.incognito = incognito;
    this.blank = !incognito && !!blank;
    const apart = incognito || this.blank;
    const saved = apart ? {} : store.state.window;
    const first = !OrbeWindow.all.some((w) => w.shared);
    this.data = apart
      ? { spaces: [incognito ? store.makeSpace(t('incognito.title'), '🕶️', '#52525b') : store.makeSpace(t('blank.title'), '◻️', '#71717a')], tabs: {}, favs: { default: [] }, profiles: [{ id: 'default', name: '' }] }
      : store.state;
    // Une trace de Chromium en cours porterait sur cette fenêtre aussi : elle est arrêtée et jetée.
    if (incognito) require('./trace').discard(OrbeWindow.focused || OrbeWindow.primary);
    this.session = incognito ? sessions.incognitoSession() : sessions.mainSession();
    const restore = !apart && first;
    const resume = resumed(saved, this.data.spaces, restore && store.state.settings.restoreSession !== false);
    this.spaceId = resume.spaceId;
    this.activeBySpace = resume.activeBySpace;
    this.closed = [];
    this.histories = new Map(); // onglet rouvert, pas encore affiché : son parcours à rendre (voir `historyOf`)
    this.undoStack = [];
    this.redoStack = [];
    this.sidebarVisible = restore ? saved.sidebarVisible !== false : true;
    this.p = this.sidebarVisible ? 1 : 0; // ouverture de la barre latérale, 0..1
    this.peek = false;
    this.htmlFullscreen = false;
    this.modalMode = null;
    this.findOpen = false;
    this.switcher = null;

    const b = (restore && saved.bounds) || {};
    const offset = first ? 0 : 28 * (OrbeWindow.all.length % 6);
    this.win = new BaseWindow({
      width: b.width || 1360,
      height: b.height || 860,
      x: b.x != null ? b.x + offset : undefined,
      y: b.y != null ? b.y + offset : undefined,
      minWidth: 520,
      minHeight: 360,
      ...platform.windowChrome({ traffic: TRAFFIC, color: this.space.color, dark: nativeTheme.shouldUseDarkColors, translucent: store.state.settings.translucent }),
      visualEffectState: 'followWindow',
      show: false,
    });
    windows.set(this.win.id, this);
    this.id = this.win.id;

    this.spares = []; // vues d'appoint prêtes, nées de la coque : { view, page, ready }
    this.wanted = []; // adresses que la coque a reçu l'ordre d'ouvrir
    this.ui = this.makeUiView('shell.html');
    this.win.contentView.addChildView(this.ui);
    this.ui.webContents.setWindowOpenHandler((details) => this.adoptSpare(details));
    // La réserve attend que la barre latérale soit rendue : `window.open` occupe le fil de la coque
    // (trois vues : 28 ms de plus avant la première barre rendue, mesuré sur l'application fabriquée).
    this.ui.webContents.on('did-finish-load', () => this.afterFirstRender(() => this.fillSpares()));
    this.ui.webContents.on('render-process-gone', (e, details) => this.uiGone(details));
    // La vue modale (barre de commande) ne naît qu'une fois la coque affichée : `spareReady`.
    this.modal = null;
    this.findView = null;
    this.toastView = null;

    this.win.on('resize', () => this.layout());
    this.win.on('enter-full-screen', () => { this.layout(); OrbeWindow.pushAll(); });
    this.win.on('leave-full-screen', () => { this.layout(); OrbeWindow.pushAll(); });
    this.win.on('focus', () => { this.focusContent(); hooks.changed(); });
    this.win.on('blur', () => { if (this.peek) this.setPeek(false); });
    this.win.on('close', (e) => {
      // Les pages qui ont quelque chose à perdre (beforeunload) sont consultées d'abord.
      if (this.askUnload(e)) return;
      this.remember();
      // La fenêtre se ferme sans plus porter aucune vue : sous Windows, détruire
      // une fenêtre avec ses vues encore attachées (parfois en cours d'animation,
      // ou reprises à une autre fenêtre) pouvait bloquer l'application.
      this.closing = true;
      try { for (const v of [...this.win.contentView.children]) this.win.contentView.removeChildView(v); } catch {}
      this.attached = new Set();
    });
    this.win.on('closed', () => this.dispose());
    for (const ev of ['resized', 'moved']) this.win.on(ev, () => this.remember());
    // La barre latérale s'estompe quand la fenêtre n'est plus au premier plan.
    // Seule cette fenêtre est prévenue, un instant plus tard, et jamais pendant
    // sa fermeture (qui lui fait aussi perdre le premier plan).
    for (const ev of ['focus', 'blur']) {
      this.win.on(ev, () => {
        if (this.closing) return;
        clearTimeout(this.focusTimer);
        this.focusTimer = setTimeout(() => { if (!this.closing && !this.win.isDestroyed()) this.sendState(); }, 60);
      });
    }

    this.syncPeekTimer();
    // La fenêtre paraît sans attendre la barre latérale (60 à 100 ms gagnées).
    if (!process.env.ORBE_HIDE_UNTIL_READY) this.win.show();
    // La fenêtre peut être fermée avant que sa barre latérale ait fini de se
    // charger : l'événement arrive alors sur une fenêtre détruite, et y toucher
    // lève une exception (« Object has been destroyed ») que rien ne rattrape.
    this.ui.webContents.once('did-finish-load', () => {
      if (this.gone) return;
      this.layout();
      if (!this.win.isVisible()) this.win.show();
      if (process.env.ORBE_TIMING) console.log(`[orbe] fenêtre affichée en ${Math.round(Date.now() - process.getCreationTime())} ms`);
      this.sendState();
      this.focusContent();
    });
    this.layout();
    this.setButtons(this.sidebarVisible);
  }

  // Feux tricolores : masqués avec la barre latérale ; macOS oublie leur
  // position personnalisée quand on les réaffiche.
  setButtons(visible) {
    platform.setButtons(this.win, visible, TRAFFIC);
  }

  // Écouteurs et garde-fous communs à toutes les vues de l'interface.
  // `first` : adresse de son premier chargement, pour une vue ouverte par la coque
  // (ce chargement-là passe par `will-navigate` ; tout autre reste interdit).
  equipUiView(view, first = null) {
    view.setBackgroundColor('#00000000');
    const wc = view.webContents;
    const id = wc.id;
    trusted.add(wc);
    wcOwner.set(id, this);
    wc.on('before-input-event', (e, input) => this.onInput(e, input, true));
    wc.on('will-navigate', (e, url) => {
      if (first && url === first) { first = null; return; }
      e.preventDefault();
    });
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.once('destroyed', () => this.uiViewGone(view, id));
    return view;
  }

  makeUiView(page) {
    // Une vue d'appoint tenue prête par la coque : même processus de rendu, page
    // déjà chargée. À défaut (coque pas encore chargée, réserve vide), la vue
    // naît à part, dans son propre processus, comme avant.
    const kind = page.startsWith('overlay.html#') ? RESERVE : page;
    const i = this.spares ? this.spares.findIndex((s) => s.ready && s.page === kind && !s.view.webContents.isDestroyed()) : -1;
    if (i >= 0) {
      const { view } = this.spares.splice(i, 1)[0];
      const wc = view.webContents;
      // L'adresse dit le rôle de la vue (outils de développement, tests d'interface).
      if (kind !== page) wc.executeJavaScript(`history.replaceState(null, '', ${JSON.stringify(page.slice(page.indexOf('#')))})`).catch(() => {});
      // Chargée d'avance, elle a pris les couleurs de l'Espace d'alors : elle reçoit celles de maintenant.
      wc.send('theme', this.themeNow());
      // Les appelants attendent « did-finish-load » d'une vue qu'ils viennent de créer : celle-ci
      // est déjà chargée, l'événement leur est donc rejoué au tour suivant.
      setImmediate(() => { if (!wc.isDestroyed()) wc.emit('did-finish-load'); this.fillSpares(); });
      return view;
    }
    const view = this.equipUiView(new WebContentsView({ webPreferences: { ...UI_PREFS } }));
    loadingUi.add(view.webContents);
    view.webContents.once('did-finish-load', () => loadingUi.delete(view.webContents));
    view.webContents.loadURL(INTERNAL + page);
    return view;
  }

  // --- Vues d'appoint nées de la coque --------------------------------------
  // Chaque vue de l'interface créée à part démarre son propre processus de rendu
  // (18 à 25 Mo, 80 à 100 ms). Ouvertes par la coque (`window.open`), elles
  // partagent le sien : 2 Mo et une quinzaine de millisecondes. Toutes ont déjà
  // la même origine (orbe://app), le même script de préchargement et les mêmes
  // droits (`trusted`) : aucune frontière de confiance ne passe entre elles. Les
  // vues qui portent davantage (mots de passe, feuilles d'autorisation, pages
  // internes des onglets) ne passent pas par ici et gardent leur processus.
  //
  // La coque n'ouvre rien d'elle-même : seules les adresses que le processus
  // principal vient de lui demander (`wanted`) sont acceptées, une fois chacune.
  adoptSpare(details) {
    const i = this.wanted.findIndex((x) => x.url === details.url);
    if (i < 0 || this.win.isDestroyed()) return { action: 'deny' };
    const { url, page } = this.wanted.splice(i, 1)[0];
    return {
      action: 'allow',
      overrideBrowserWindowOptions: { webPreferences: { ...UI_PREFS } },
      createWindow: (options) => {
        const view = this.equipUiView(new WebContentsView({ webContents: options.webContents, webPreferences: options.webPreferences }), url);
        const spare = { view, page, ready: false };
        this.spares.push(spare);
        view.webContents.once('did-finish-load', () => { spare.ready = true; this.spareReady(); });
        return view.webContents;
      },
    };
  }

  // Tient prêtes quelques vues d'appoint, et la barre flottante quand la barre latérale est masquée.
  fillSpares() {
    if (this.win.isDestroyed() || this.closing) return;
    // Jamais pendant un glisser dans la barre latérale. Le premier glisser crée la
    // zone de dépôt, qui prend une vue en réserve ; la remplacer aussitôt faisait
    // ouvrir une vue par la coque (`window.open`) en plein geste, et le glisser
    // pouvait alors ne plus rien recevoir : ni survol, ni dépôt (relevé dans les
    // tests d'interface : « dragstart » puis « dragend », rien entre les deux).
    // La réserve se refait à la fin du geste, ou après un délai s'il n'est jamais signalé.
    if (this.dragSince && Date.now() - this.dragSince < DRAG_HOLD) {
      clearTimeout(this.spareLater);
      this.spareLater = setTimeout(() => { this.dragSince = 0; this.fillSpares(); }, DRAG_HOLD);
      return;
    }
    const ui = this.ui.webContents;
    if (ui.isDestroyed() || ui.isCrashed() || loadingUi.has(ui)) return;
    const count = (page) => this.spares.filter((s) => s.page === page).length + this.wanted.filter((x) => x.page === page).length;
    const ask = [];
    // Jamais plus de vues en réserve qu'il ne reste de rôles à pourvoir.
    const roles = AUX.filter((k) => k !== 'floatView' && !this[k]).length;
    for (let n = count(RESERVE); n < Math.min(SPARES, roles); n++) ask.push(RESERVE);
    if (!this.sidebarVisible && !this.floatView && !count(FLOAT)) ask.push(FLOAT);
    for (const page of ask) {
      // Une adresse par demande : chacune n'est acceptée qu'une fois.
      const want = { page, url: INTERNAL + page + (page === RESERVE ? '-' + (spareSeq += 1) : '') };
      this.wanted.push(want);
      // `window.open` est synchrone : au retour, la demande a été servie ou refusée.
      ui.executeJavaScript(`void window.open(${JSON.stringify(want.url)})`, true).catch(() => {}).then(() => {
        const i = this.wanted.indexOf(want);
        if (i >= 0) this.wanted.splice(i, 1);
      });
    }
  }

  // Appelle `fn` une fois l'état reçu par la coque et deux images présentées ; au plus tard
  // après `FIRST_RENDER_WAIT` (fenêtre masquée ou recouverte : aucune image n'est présentée).
  afterFirstRender(fn) {
    const ui = this.ui.webContents;
    let done = false;
    const go = () => { if (done) return; done = true; clearTimeout(timer); if (!this.win.isDestroyed() && !ui.isDestroyed()) fn(); };
    const timer = setTimeout(go, FIRST_RENDER_WAIT);
    ui.executeJavaScript(`new Promise((r) => { const go = () => (typeof S === 'object' && S ? requestAnimationFrame(() => requestAnimationFrame(() => r())) : setTimeout(go, 4)); go(); })`, true).then(go, go);
  }

  spareReady() {
    if (this.win.isDestroyed() || this.closing) return;
    if (!this.modal) this.makeModal();
  }

  makeModal() {
    this.modal = this.makeUiView('overlay.html#modal');
    this.modal.setVisible(false);
    this.win.contentView.addChildView(this.modal);
    return this.modal;
  }

  // Message pour une vue de l'interface ; si sa page charge encore, il attend la fin.
  sendUi(view, channel, payload, still = () => true) {
    const wc = view.webContents;
    if (wc.isDestroyed()) return;
    if (loadingUi.has(wc)) wc.once('did-finish-load', () => { if (!wc.isDestroyed() && still()) wc.send(channel, payload); });
    else wc.send(channel, payload);
  }

  // Une vue de l'interface a disparu (processus de rendu perdu, fenêtre fermée).
  uiViewGone(view, id) {
    if (wcOwner.get(id) === this) wcOwner.delete(id);
    this.spares = this.spares.filter((s) => s.view !== view);
    if (this.modal === view) { this.modalMode = null; this.switcher = null; }
    if (this.findView === view) this.findOpen = false;
    if (this.toastView === view) clearTimeout(this.toastTimer);
    for (const k of AUX) if (this[k] === view) this[k] = null;
  }

  // Le processus de la coque est tombé : il emporte les vues nées d'elle. Elles
  // sont fermées (elles renaîtront à la demande) et la coque est rechargée.
  uiGone(details) {
    if (this.win.isDestroyed() || this.closing || (details && details.reason === 'clean-exit')) return;
    const pid = (wc) => { try { return wc.getOSProcessId(); } catch { return 0; } };
    for (const view of [...AUX.map((k) => this[k]), ...this.spares.map((s) => s.view)]) {
      if (!view || view.webContents.isDestroyed()) continue;
      if (view.webContents.isCrashed() || !pid(view.webContents)) view.webContents.close();
    }
    this.wanted = []; // les demandes en cours sont parties avec le processus
    const now = Date.now();
    this.uiCrashes = (this.uiCrashes || []).filter((at) => now - at < 60000);
    this.uiCrashes.push(now);
    // Pertes en rafale : on espace les reprises (5 s, 10 s… une minute au plus), sans jamais renoncer.
    clearTimeout(this.uiRetry);
    this.uiRetry = setTimeout(() => {
      if (this.win.isDestroyed() || this.ui.webContents.isDestroyed()) return;
      loadingUi.add(this.ui.webContents);
      this.ui.webContents.once('did-finish-load', () => { loadingUi.delete(this.ui.webContents); if (this.gone) return; this.layout(); this.focusContent(); this.fillSpares(); });
      this.ui.webContents.loadURL(INTERNAL + 'shell.html');
    }, uiRetryDelay(this.uiCrashes.length));
  }

  // Nouvelle fenêtre demandée par l'utilisateur (⌘N, navigation privée, fenêtre vierge) :
  // ouverte depuis une fenêtre en plein écran, elle s'ouvre en plein écran elle aussi (comme dans Arc).
  static open(opts = {}, from = OrbeWindow.focused) {
    const full = !!from && !!from.win && !from.win.isDestroyed() && from.win.isFullScreen();
    const w = new OrbeWindow(opts);
    if (full) hooks.enterFullScreen(w.win);
    return w;
  }

  // La plus ancienne fenêtre normale encore ouverte mémorise son état.
  get persistent() {
    return this.shared && OrbeWindow.all.find((w) => w.shared) === this;
  }

  // Fenêtre ordinaire : elle montre les Espaces enregistrés, partagés entre fenêtres
  // (ni navigation privée, ni fenêtre vierge).
  get shared() {
    return !this.incognito && !this.blank;
  }

  // Les onglets fermés ici rejoignent-ils l'archive enregistrée (et donc les sauvegardes) ?
  // Pas en navigation privée, pas dans une fenêtre vierge : celle-ci promet des onglets
  // qui ne sont pas gardés. Ils restent rouvrables par ⇧⌘T tant que la fenêtre est ouverte.
  get archives() {
    return !this.incognito && !this.blank;
  }

  // Retire toute trace d'un onglet (actif, vue scindée, lecteur) dans les
  // fenêtres qui partagent les mêmes données.
  static forget(id, data) {
    for (const w of windows.values()) {
      if (w.data !== data) continue;
      w.leaveSplit(id);
      for (const sid of Object.keys(w.activeBySpace)) if (w.activeBySpace[sid] === id) delete w.activeBySpace[sid];
      media.drop(w, id);
    }
  }

  // --- Accès aux données ----------------------------------------------------
  get space() {
    return this.data.spaces.find((s) => s.id === this.spaceId) || this.data.spaces[0];
  }

  get activeId() {
    const id = this.activeBySpace[this.space.id];
    return id && this.data.tabs[id] ? id : null;
  }

  // Fenêtre en cours de fermeture ou détruite : plus rien ne doit y toucher.
  // À vérifier dans tout ce qui s'exécute plus tard (fin de chargement d'une vue,
  // minuteur, promesse), car une fenêtre se ferme à n'importe quel moment.
  get gone() {
    return this.closing || this.win.isDestroyed();
  }

  get activeRt() {
    const id = this.activeId;
    return (id && live.get(id)) || null;
  }

  // Page qui reçoit les commandes (actualiser, zoom, recherche…) : l'aperçu
  // s'il est ouvert, sinon l'onglet actif.
  get activeWc() {
    if (this.peekState && !this.peekState.view.webContents.isDestroyed()) return this.peekState.view.webContents;
    const rt = this.activeRt;
    return rt && !rt.wc.isDestroyed() ? rt.wc : null;
  }

  // Favoris du profil de l'Espace affiché.
  get favorites() {
    const favs = this.data.favs;
    const id = this.space.profileId || 'default';
    return favs[id] || (favs[id] = []);
  }

  sessionFor(id) {
    if (this.incognito) return this.session;
    const loc = this.locate(id);
    return sessions.profileSession(loc ? (loc.space ? loc.space.profileId : loc.profileId) : 'default');
  }

  get sidebarWidth() {
    return clamp(store.state.settings.sidebarWidth, SIDEBAR_MIN, SIDEBAR_MAX);
  }

  locate(id) {
    const d = this.data;
    let i;
    for (const profileId of Object.keys(d.favs)) {
      i = d.favs[profileId].indexOf(id);
      if (i >= 0) return { list: 'favorites', arr: d.favs[profileId], index: i, space: null, profileId, node: { type: 'tab', id } };
    }
    for (const space of d.spaces) {
      i = space.today.indexOf(id);
      if (i >= 0) return { list: 'today', arr: space.today, index: i, space, node: { type: 'tab', id } };
      const f = findNode(space.pinned, id);
      if (f) return { list: 'pinned', arr: f.arr, index: f.index, space, node: f.node };
    }
    return null;
  }

  // Ordre d'affichage : favoris, épinglés, puis Aujourd'hui.
  orderedIds(space = this.space) {
    return [...(this.data.favs[space.profileId] || []), ...walk(space.pinned), ...space.today];
  }

  groupOf(id) {
    for (const sp of this.data.spaces) {
      for (const g of sp.splits || []) if (g.includes(id)) return g;
    }
    return null;
  }

  // Vues scindées : enregistrées avec l'Espace, elles survivent au redémarrage.
  get splits() {
    return this.data.spaces.flatMap((sp) => sp.splits || []);
  }

  visibleIds() {
    const id = this.activeId;
    if (!id) return [];
    const group = this.groupOf(id);
    return group ? group.filter((x) => this.data.tabs[x]) : [id];
  }

  changed() {
    if (!this.incognito) store.save();
    OrbeWindow.pushAll();
  }

  // Barre d'outils affichée : par réglage, ou parce que le site de l'onglet
  // actif est en mode développeur (⌃D).
  get toolbarShown() {
    const tab = this.activeId && this.data.tabs[this.activeId];
    return !!store.state.settings.showToolbar || (!!tab && prefs.devMode(tab.url));
  }

  // ⌃D : mode développeur du site affiché. Sur un site local où il est automatique, le couper
  // note le site dans « devOff » ; ailleurs, l'activer le note dans « devSites ».
  toggleDevMode() {
    const tab = this.activeId && this.data.tabs[this.activeId];
    const host = tab ? prefs.hostOf(tab.url) : '';
    if (!host || this.incognito) return;
    const s = store.state.settings;
    const { setSetting } = require('./commands');
    const on = !prefs.devMode(tab.url);
    if (on) {
      if ((s.devOff || []).includes(host)) setSetting('devOff', s.devOff.filter((h) => h !== host));
      if (!prefs.devMode(tab.url)) setSetting('devSites', [...(s.devSites || []).filter((h) => h !== host), host].slice(-200));
    } else {
      if ((s.devSites || []).includes(host)) setSetting('devSites', s.devSites.filter((h) => h !== host));
      if (prefs.devMode(tab.url)) setSetting('devOff', [...(s.devOff || []).filter((h) => h !== host), host].slice(-200));
    }
    this.toast(t(on ? 'dev.on' : 'dev.off', { site: host }));
  }

  // --- Mise en page ---------------------------------------------------------
  contentRect() {
    const [W, H] = this.win.getContentSize();
    if (this.htmlFullscreen) return { x: 0, y: 0, width: W, height: H };
    const sw = this.sidebarWidth;
    const docked = this.sidebarVisible && this.p === 1;
    const top = platform.topInset(this.win, PAD, this.toolbarShown) + (this.toolbarShown ? TOOLBAR_H : 0);
    return {
      x: Math.round(PAD + (sw - PAD) * this.p),
      y: top,
      width: Math.max(100, (docked ? W - sw - PAD : W - 2 * PAD) - hooks.rightInset(this)),
      height: Math.max(100, H - top - PAD),
    };
  }

  // Largeur de chaque volet : parts égales, ou celles réglées à la souris.
  // Vue scindée empilée (volets l'un au-dessus de l'autre) ? Mémorisé par Espace,
  // sous l'identifiant du premier onglet du groupe.
  isVertical(group) {
    if (!group) return false;
    for (const sp of this.data.spaces) if ((sp.splits || []).includes(group)) return !!(sp.splitDirs && sp.splitDirs[group[0]] === 'v');
    return false;
  }

  toggleSplitDirection() {
    const group = this.activeId && this.groupOf(this.activeId);
    if (!group) return;
    const sp = this.data.spaces.find((x) => (x.splits || []).includes(group));
    if (!sp) return;
    this.setVertical(group, !this.isVertical(group));
    delete group.ratios;
    this.layout();
    this.changed();
  }

  // Sens d'un groupe, rangé sous l'identifiant de son premier onglet : à reposer
  // chaque fois que ce premier onglet change (volet déplacé, fermé).
  setVertical(group, vertical) {
    const sp = this.data.spaces.find((x) => (x.splits || []).includes(group));
    if (!sp) return;
    const dirs = sp.splitDirs || (sp.splitDirs = {});
    for (const id of group) delete dirs[id];
    if (vertical && group.length) dirs[group[0]] = 'v';
  }

  // Rectangle de chaque volet : parts égales, ou celles réglées à la souris.
  paneRects(rect, ids) {
    const n = ids.length;
    if (!n) return [];
    const group = n > 1 ? this.groupOf(ids[0]) : null;
    const vertical = this.isVertical(group);
    let ratios = group && group.ratios && group.ratios.length === n ? group.ratios : null;
    if (!ratios) ratios = ids.map(() => 1 / n);
    const start = vertical ? rect.y : rect.x;
    const total = vertical ? rect.height : rect.width;
    const usable = total - GAP * (n - 1);
    const out = [];
    let pos = start;
    // `bar` : hauteur réservée en haut du volet à sa petite barre (vue scindée seulement).
    const bar = n > 1 && !this.htmlFullscreen ? SPLIT_BAR : 0;
    ratios.forEach((r, i) => {
      const size = Math.max(60, i === n - 1 ? start + total - pos : Math.round(usable * r));
      out.push(vertical
        ? { x: rect.x, y: Math.round(pos), width: rect.width, height: size, vertical, bar }
        : { x: Math.round(pos), y: rect.y, width: size, height: rect.height, vertical, bar });
      pos += size + GAP;
    });
    return out;
  }

  // Place de la page dans son volet : sous la petite barre.
  pageRect(pane) {
    return { x: pane.x, y: pane.y + pane.bar, width: pane.width, height: Math.max(40, pane.height - pane.bar) };
  }

  // Déplace la séparation entre les volets i et i+1 jusqu'à la position donnée
  // (abscisse, ou ordonnée pour une vue empilée).
  resizeSplit(i, at) {
    const ids = this.visibleIds();
    const group = ids.length > 1 ? this.groupOf(ids[0]) : null;
    if (!group || !(i >= 0 && i < ids.length - 1)) return;
    const rect = this.contentRect();
    const panes = this.paneRects(rect, ids);
    const vertical = panes[0].vertical;
    const usable = (vertical ? rect.height : rect.width) - GAP * (ids.length - 1);
    const ratios = panes.map((p) => (vertical ? p.height : p.width) / usable);
    const pair = ratios[i] + ratios[i + 1];
    const min = Math.min(0.15, pair / 2);
    const first = clamp((at - GAP / 2 - (vertical ? panes[i].y : panes[i].x)) / usable, min, pair - min);
    ratios[i] = first;
    ratios[i + 1] = pair - first;
    group.ratios = ratios;
    this.layout();
    this.sendState();
  }

  // `slide` : durée du trajet des pages (retour de la barre latérale), 0 = immédiat.
  layout({ slide = 0 } = {}) {
    if (this.win.isDestroyed() || this.closing) return;
    const [W, H] = this.win.getContentSize();
    const full = { x: 0, y: 0, width: W, height: H };
    this.ui.setBounds(full);
    const rect = this.contentRect();
    const ids = this.visibleIds();
    const shown = new Set();
    const n = ids.length;
    const panes = this.paneRects(rect, ids);
    const paneW = n ? panes[Math.max(0, ids.indexOf(this.activeId))].width : 0;
    ids.forEach((id, i) => {
      const rt = this.ensureView(id);
      shown.add(rt.view);
      // Aperçu qui devient un onglet : la carte grandit jusqu'à sa place, par-dessus le reste.
      const grow = this.growing && this.growing.view === rt.view ? this.growing : null;
      if (grow && !grow.started) this.win.contentView.addChildView(rt.view);
      else if (!this.attached || !this.attached.has(rt.view)) this.win.contentView.addChildView(rt.view, 1);
      rt.view.setBorderRadius(this.htmlFullscreen ? 0 : RADIUS);
      const ms = grow && !grow.started ? grow.ms : slide;
      if (grow) grow.started = true;
      place(rt.view, this.pageRect(panes[i]), ms);
    });
    for (const view of this.attached || []) {
      if (shown.has(view)) continue;
      // Page quittée pour un aperçu agrandi : elle reste dessous jusqu'à la fin du mouvement.
      if (this.growing && this.growing.under.has(view)) { shown.add(view); continue; }
      try { this.win.contentView.removeChildView(view); } catch {}
    }
    this.attached = shown;
    if (this.peekChrome && (this.peekState || this.peekJob)) {
      place(this.peekChrome, rect);
      this.peekChrome.setBorderRadius(this.htmlFullscreen ? 0 : RADIUS);
    }
    if (this.peekState) place(this.peekState.view, this.peekRect(rect));
    if (this.floatView && this.peek) this.floatView.setBounds({ x: 0, y: 0, width: Math.min(W, this.sidebarWidth + 24), height: H });
    if (this.modalMode) this.modal.setBounds(full);
    if (this.findOpen && this.findView) {
      const i = Math.max(0, ids.indexOf(this.activeId));
      const right = panes[i] ? panes[i].x + panes[i].width : rect.x + paneW;
      this.findView.setBounds({ x: Math.round(right - 372), y: (panes[i] ? panes[i].y + panes[i].bar : rect.y) + 10, width: 360, height: this.findReplace ? 90 : 50 });
    }
    if (this.toastView) {
      // Au-dessus du volet concerné (le volet actif), pas au milieu de la vue scindée.
      const i = this.toastPane && ids.includes(this.toastPane) ? ids.indexOf(this.toastPane) : Math.max(0, ids.indexOf(this.activeId));
      const zone = panes[i] ? this.pageRect(panes[i]) : rect;
      const width = Math.min(380, Math.max(160, zone.width - 16));
      this.toastView.setBounds({ x: Math.round(zone.x + zone.width / 2 - width / 2), y: zone.y + 12, width, height: 46 });
    }
    hooks.layout(this);
  }

  // Retour de la barre latérale : les pages glissent à leur place par une
  // animation du système (voir `place`) : un appel par page, aucun minuteur. La
  // largeur de la page rétrécit dans le même mouvement, mais la page n'est remise
  // en page qu'une fois, à l'arrivée (mesuré). Comme dans Arc, la barre revient en
  // 50 ms et disparaît d'un coup.
  animateTo(target) {
    const from = this.p;
    this.p = target;
    this.layout({ slide: target === 1 && from !== 1 && !this.htmlFullscreen ? motion(MOTION.sidebarIn) : 0 });
  }

  toggleSidebar(force) {
    this.sidebarVisible = typeof force === 'boolean' ? force : !this.sidebarVisible;
    if (this.peek) this.setPeek(false);
    if (this.floatView) { this.floatView.setVisible(false); try { this.win.contentView.removeChildView(this.floatView); } catch {} }
    this.setButtons(this.sidebarVisible);
    this.animateTo(this.sidebarVisible ? 1 : 0);
    this.syncPeekTimer();
    this.remember();
    OrbeWindow.pushAll();
  }

  // La surveillance du bord gauche ne tourne que barre latérale masquée.
  syncPeekTimer() {
    const needed = !this.sidebarVisible && !this.win.isDestroyed();
    if (needed && !this.peekTimer) this.peekTimer = setInterval(() => this.pollPeek(), 80);
    else if (!needed && this.peekTimer) { clearInterval(this.peekTimer); this.peekTimer = null; }
    if (needed) this.fillSpares(); // la barre flottante se prépare dès que la barre latérale est masquée
  }

  setPeek(on) {
    if (this.peek === on || this.sidebarVisible) return;
    this.peek = on;
    this.setButtons(on);
    // Comme dans Arc : la barre revient en flottant par-dessus la page, qui ne
    // bouge pas. Elle vit dans sa propre vue, posée au-dessus des onglets.
    clearTimeout(this.floatTimer);
    if (on) {
      if (!this.floatView) this.floatView = this.makeUiView('shell.html#flottant');
      this.win.contentView.addChildView(this.floatView);
      this.layout();
      this.floatView.setVisible(true);
    } else if (this.floatView) {
      // Le temps que la barre glisse hors de l'écran.
      this.floatTimer = setTimeout(() => {
        if (this.win.isDestroyed() || this.peek || !this.floatView) return;
        this.floatView.setVisible(false);
        try { this.win.contentView.removeChildView(this.floatView); } catch {}
      }, 220);
    }
    OrbeWindow.pushAll();
  }

  // Vue qui affiche la barre latérale en ce moment (ancrée ou flottante).
  get shellView() {
    return this.peek && this.floatView ? this.floatView : this.ui;
  }

  pollPeek() {
    if (this.sidebarVisible || this.win.isDestroyed() || !this.win.isFocused() || this.modalMode || this.menuOpen) return;
    const pt = screen.getCursorScreenPoint();
    const b = this.win.getContentBounds();
    const x = pt.x - b.x;
    const y = pt.y - b.y;
    const inside = y >= 0 && y <= b.height;
    if (!this.peek && inside && x >= -2 && x <= 5) this.setPeek(true);
    else if (this.peek && (!inside || x > this.sidebarWidth + 28 || x < -40)) this.setPeek(false);
  }

  setSidebarWidth(w) {
    store.state.settings.sidebarWidth = clamp(Math.round(w), SIDEBAR_MIN, SIDEBAR_MAX);
    store.save();
    for (const win of windows.values()) win.layout();
    OrbeWindow.pushAll();
  }

  remember() {
    if (!this.persistent || this.win.isDestroyed()) return;
    const w = store.state.window;
    if (!this.win.isFullScreen() && !this.win.isMinimized()) w.bounds = this.win.getBounds();
    w.spaceId = this.spaceId;
    w.activeBySpace = this.activeBySpace;
    w.sidebarVisible = this.sidebarVisible;
    store.save();
  }

  dispose() {
    clearInterval(this.peekTimer);
    clearTimeout(this.toastTimer);
    clearTimeout(this.focusTimer);
    clearTimeout(this.spareLater);
    windows.delete(this.id);
    for (const [id, rt] of [...live]) if (rt.owner === this) OrbeWindow.destroyView(id);
    this.closePeek({ animate: false });
    this.growing = null;
    clearTimeout(this.floatTimer);
    clearTimeout(this.statusTimer);
    clearTimeout(this.uiRetry);
    for (const v of [...AUX.map((k) => this[k]), ...this.spares.map((sp) => sp.view), this.ui]) {
      if (v && !v.webContents.isDestroyed()) { wcOwner.delete(v.webContents.id); v.webContents.close(); }
    }
    if (this.incognito) this.session.clearStorageData().catch(() => {});
    hooks.changed();
  }

  // --- Vues web des onglets -------------------------------------------------
  ensureView(id, viewOptions, existing) {
    let rt = live.get(id);
    if (rt) {
      if (rt.owner !== this) {
        // L'onglet était affiché dans une autre fenêtre : on le lui reprend.
        const prev = rt.owner;
        try { prev.win.contentView.removeChildView(rt.view); } catch {}
        if (prev.attached) prev.attached.delete(rt.view);
        rt.owner = this;
        // L'ancienne fenêtre ne doit plus le croire affiché chez elle.
        prev.leaveSplit(id);
        for (const sid of Object.keys(prev.activeBySpace)) if (prev.activeBySpace[sid] === id) delete prev.activeBySpace[sid];
        setImmediate(() => { if (!prev.win.isDestroyed()) { prev.layout(); OrbeWindow.pushAll(); } });
      }
      return rt;
    }
    const tab = this.data.tabs[id];
    // L'accès à l'interface dépend d'un drapeau posé par Orbe, jamais de
    // l'adresse, qu'une page web peut changer.
    const internal = tab.internal === true && isInternal(tab.url);
    const view = existing || new WebContentsView(viewOptions || {
      // nodeIntegrationInSubFrames : avec le bac à sable, cela ne fait qu'exécuter les scripts
      // de préchargement de la session dans les iframes (mots de passe) ; aucun accès à Node.
      webPreferences: { session: this.sessionFor(id), sandbox: true, contextIsolation: true, nodeIntegrationInSubFrames: true, preload: internal ? UI_PRELOAD : undefined },
    });
    view.setBackgroundColor('#ffffff');
    rt = { id, view, wc: view.webContents, owner: this, loading: false, lastUsed: Date.now(), internal };
    live.set(id, rt);
    this.wire(rt, tab);
    if (!viewOptions && !existing) {
      // Onglet rouvert (⇧⌘T, ⌘Z) : il retrouve son parcours — précédent et suivant fonctionnent.
      const past = this.histories.get(id);
      this.histories.delete(id);
      if (past && past.entries[past.index] && past.entries[past.index].url === tab.url) rt.wc.navigationHistory.restore(past).catch(() => { if (!rt.wc.isDestroyed()) rt.wc.loadURL(tab.url).catch(() => {}); });
      else rt.wc.loadURL(tab.url).catch(() => {});
    }
    return rt;
  }

  wire(rt, tab) {
    const wc = rt.wc;
    const data = this.data;
    const incognito = this.incognito;
    const touch = (lazy) => { if (!incognito) store.save(lazy); OrbeWindow.pushAll(); };
    if (rt.internal) {
      trusted.add(wc);
      wc.on('will-navigate', (e, url) => {
        if (isInternal(url)) return;
        e.preventDefault();
        rt.owner.newTab(url);
      });
    }
    if (!rt.internal) {
      const guard = (e, url) => { if (isInternal(url)) e.preventDefault(); };
      // Comme dans Arc : depuis un onglet épinglé ou un favori, un lien cliqué
      // vers un autre site s'ouvre en aperçu, sans quitter la page épinglée.
      let lastClick = 0;
      wc.on('before-mouse-event', (e, mouse) => {
        // Vraie entrée de l'utilisateur : compte comme geste (fenêtres surgissantes, beforeunload).
        if (mouse.type === 'mouseDown' || mouse.type === 'mouseUp') hooks.input(rt, mouse);
        if (mouse.type === 'mouseDown') rt.typed = true; // voir `typed` plus bas
        // Clic dans un volet d'une vue scindée : il devient le volet actif (sans attendre
        // que la page prenne le clavier : elle peut l'avoir déjà, ou la fenêtre ne pas l'avoir).
        if (mouse.type === 'mouseDown') rt.owner.paneFocused(rt.id);
        if (mouse.type !== 'mouseUp' || mouse.button !== 'left') return;
        lastClick = Date.now();
        rt.click = { x: mouse.x, y: mouse.y, at: lastClick }; // d'où partira un éventuel aperçu
      });
      // ⌥clic sur un lien : il s'ouvre en vue scindée, à côté de la page (comme dans Arc).
      // Le clic n'est pas donné à la page (sans cela, Chromium téléchargerait le lien) ;
      // l'adresse est celle du lien survolé, rapportée par le moteur, jamais par la page.
      wc.on('before-mouse-event', (e, mouse) => {
        if (mouse.button !== 'left' || (mouse.type !== 'mouseDown' && mouse.type !== 'mouseUp')) return;
        if (mouse.type === 'mouseDown') rt.altLink = rt.alt && !rt.mod && webUrl(rt.hoverUrl) && rt.owner.visibleIds().includes(rt.id) ? rt.hoverUrl : null;
        if (!rt.altLink) return;
        e.preventDefault();
        if (mouse.type !== 'mouseUp') return;
        const url = rt.altLink;
        rt.altLink = null;
        rt.owner.splitLink(rt.id, url);
      });
      wc.on('will-navigate', (e, url) => {
        if (!e.isMainFrame || e.defaultPrevented || !store.state.settings.peekLinks) return;
        if (!tab.homeUrl || Date.now() - lastClick > 1200 || !webUrl(url) || sameHost(url, tab.url)) return;
        if (rt.owner.locate(rt.id) && rt.owner.visibleIds().includes(rt.id)) {
          e.preventDefault();
          lastClick = 0;
          // Lien de réunion ou règle d'aiguillage : un onglet, pas un aperçu.
          const how = rt.owner.peekTarget(url);
          if (how === 'peek') rt.owner.openPeek(url, rt.id);
          else if (how === 'route') hooks.openRouted(url);
          else rt.owner.newTab(url, { after: rt.id });
        }
      });
      wc.on('will-navigate', guard);
      wc.on('will-redirect', guard);
    }
    // Page fermée par elle-même (window.close) ou processus disparu.
    wc.once('destroyed', () => {
      if (live.get(rt.id) !== rt) return;
      // Fermeture de la fenêtre : la page s'en va, l'onglet reste dans la barre.
      if (rt.windowClosing) { live.delete(rt.id); return; }
      // Mise en veille automatique : la ligne reste dans la barre latérale.
      // De même si la page disparaît alors que l'utilisateur vient de choisir « Rester »
      // (Chromium l'a fermée d'office, voir unload.js) : ce n'est pas elle qui s'est
      // fermée, son onglet n'est donc ni retiré ni archivé ; affiché, il se recharge.
      const stayed = hooks.stayed(wc);
      const kept = !rt.sleeping && stayed < STAY_GUARD;
      if (kept) {
        lastLost = { id: rt.id, at: Date.now(), stayed, trail: [...(rt.trail || [])] };
        console.error(`[orbe] page détruite ${stayed} ms après « Rester », sans qu’Orbe l’ait demandé : l’onglet garde sa ligne. ${lastLost.trail.join(' ; ')}`);
      }
      if (rt.sleeping || kept) {
        live.delete(rt.id);
        const o = rt.owner;
        if (!o.win.isDestroyed() && o.data.tabs[rt.id]) { if (o.visibleIds().includes(rt.id)) o.layout(); OrbeWindow.pushAll(); }
        return;
      }
      note(rt, 'fermée par elle-même');
      const owner = rt.owner;
      if (owner.htmlFullscreen) owner.htmlFullscreen = false;
      if (!owner.win.isDestroyed()) owner.close(rt.id);
      else live.delete(rt.id);
    });
    wc.on('did-start-loading', () => { rt.loading = true; OrbeWindow.pushAll(); });
    wc.on('did-stop-loading', () => { rt.loading = false; OrbeWindow.pushAll(); });
    wc.on('page-title-updated', (e, title) => {
      if (isErrorPage(wc.getURL())) return;
      tab.title = String(title).slice(0, 300);
      if (!incognito) store.touchHistory(tab.url, { title });
      touch(true); // un titre peut attendre la prochaine écriture
    });
    wc.on('page-favicon-updated', (e, icons) => {
      tab.favicon = icons[0] && icons[0].length <= ICON_MAX ? icons[0] : '';
      if (!incognito) store.touchHistory(tab.url, { favicon: tab.favicon });
      touch(true);
    });
    const navigated = (url) => {
      if (isErrorPage(url)) return;
      if (isInternal(url) && !rt.internal) return;
      let hostChanged = true;
      try { hostChanged = new URL(url).host !== new URL(tab.url).host; } catch {}
      if (hostChanged) tab.favicon = '';
      rt.failed = false;
      tab.url = url;
      if (!incognito) store.visit(url, tab.title, tab.favicon);
      touch();
    };
    wc.on('did-navigate', (e, url) => { rt.typed = false; rt.objected = false; rt.sleeping = false; hooks.navigated(rt); navigated(url); });
    // Nouveau document : titre, artiste et pochette annoncés par le précédent ne valent
    // plus rien (le lecteur miniature ne montre jamais ceux d'un autre site).
    wc.on('did-navigate', () => { rt.media = null; });
    // Boost du site : son CSS, puis son script s'il y est permis (une fois par chargement).
    if (!incognito) wc.on('dom-ready', () => { boosts.apply(wc); boosts.runScript(wc); });
    // Changement de site : le CSS du Boost de l'ancien site est retiré dès que le nouveau document est en place.
    if (!incognito) wc.on('did-navigate', () => { boosts.navigated(wc); });
    wc.on('did-navigate-in-page', (e, url, isMainFrame) => { if (isMainFrame) navigated(url); });
    // Couleurs annoncées par la page (src/main/page-color.js) : son fond devient celui
    // de la vue (fenêtre redimensionnée : pas de blanc au bord d'une page sombre), sa
    // couleur de thème teinte la barre d'outils.
    if (!rt.internal) {
      const pageColor = require('./page-color');
      const paint = () => pageColor.background(wc).then((c) => { if (wc.isDestroyed() || rt.bg === c) return; rt.bg = c; try { rt.view.setBackgroundColor(c); } catch {} });
      wc.on('dom-ready', paint);
      wc.on('did-finish-load', paint);
      wc.on('did-change-theme-color', (e, color) => { const c = pageColor.theme(color); if ((rt.themeColor || null) === c) return; rt.themeColor = c; OrbeWindow.pushAll(); });
      wc.on('did-navigate', () => { rt.themeColor = null; });
    }
    wc.on('update-target-url', (e, url) => { rt.hoverUrl = String(url || '').slice(0, STATUS_MAX); rt.owner.linkStatus(rt, rt.hoverUrl); });
    // Pincer pour zoomer la page (coupé par défaut dans Electron).
    wc.setVisualZoomLevelLimits(1, 5).catch(() => {});
    wc.on('audio-state-changed', () => {
      const owner = rt.owner;
      if (wc.isCurrentlyAudible()) { rt.playing = true; if (!owner.visibleIds().includes(rt.id)) media.add(owner, rt.id); }
      OrbeWindow.pushAll();
    });
    wc.on('context-menu', (e, params) => rt.owner.pageMenu(rt, params));
    wc.on('before-input-event', (e, input) => { if (input.type === 'keyDown' && !rt.internal) hooks.input(rt, input); rt.owner.onInput(e, input, false, rt.internal ? null : wc); });
    // ⌥ tenue pendant un clic : les événements de souris ne disent pas les touches
    // de modification, on suit donc la touche elle-même.
    wc.on('before-input-event', (e, input) => {
      rt.alt = !!input.alt;
      rt.mod = !!(input.meta || input.control || input.shift); // ⌥ seule : vue scindée ; ⌥⌘ : petite fenêtre
      // `typed` : l'utilisateur a agi dans la page depuis son chargement (touche autre qu'un
      // simple modificateur et que la page a reçue — lettre, AltGr, ⌘V, Suppr, Entrée, saisie
      // assistée — ou bouton de souris). La veille automatique épargne alors l'onglet (veille.js).
      if (input.type === 'keyDown' && !e.defaultPrevented && !MODIFIER_KEYS.has(input.key)) rt.typed = true;
    });
    wc.on('blur', () => { rt.alt = false; rt.mod = false; rt.altLink = null; });
    wc.on('found-in-page', (e, result) => rt.owner.sendFind(result));
    wc.on('focus', () => rt.owner.paneFocused(rt.id));
    wc.on('enter-html-full-screen', () => { rt.owner.htmlFullscreen = true; rt.fullscreen = true; rt.owner.layout(); });
    wc.on('leave-html-full-screen', () => { rt.owner.htmlFullscreen = false; rt.fullscreen = false; rt.owner.layout(); });
    wc.on('will-prevent-unload', (e) => rt.owner.pageObjects(e, rt));
    wc.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
      if (!isMainFrame || code === -3 || isInternal(url)) return;
      // Lien vers une autre application (mailto:, tel:…) : la page affichée reste en place.
      if (!/^(https?|file|view-source|about|data|blob|chrome):/i.test(url)) return;
      tab.url = url;
      // Certificat refusé : avertissement d'Orbe, pas la page d'erreur ordinaire.
      if (hooks.failed(rt, { code, desc, url })) { rt.failed = true; touch(); return; }
      const q = new URLSearchParams({ url, desc, code: String(code), title: t('err.title'), retry: t('err.retry') });
      wc.loadURL(INTERNAL + 'error.html?' + q).catch(() => {});
    });
    wc.on('render-process-gone', (e, details) => { rt.crashed = true; hooks.gone(rt, details); });
    wc.on('unresponsive', () => hooks.hung(rt, true));
    wc.on('responsive', () => hooks.hung(rt, false));
    wc.setWindowOpenHandler((details) => {
      const owner = rt.owner;
      if (!/^(https?|about|blob|data):/i.test(details.url) && details.url !== '') return { action: 'deny' };
      // Ouverture sans geste de l'utilisateur : bloquée, avec une mention dans la pastille d'adresse (popups.js).
      if (!rt.internal && !hooks.popup(rt, details)) { OrbeWindow.pushAll(); return { action: 'deny' }; }
      if (details.disposition === 'background-tab') {
        // ⌥⌘clic (Alt+Ctrl+clic ailleurs) : petite fenêtre, comme dans Arc.
        if (store.state.settings.littleAltClick !== false && rt.alt && /^https?:/i.test(details.url) && !owner.incognito) {
          hooks.openLittle(details.url);
          return { action: 'deny' };
        }
        owner.newTab(details.url, { background: true, after: rt.id });
        return { action: 'deny' };
      }
      // Aperçu : lien sortant d'un onglet épinglé ou d'un favori.
      const from = data.tabs[rt.id];
      const outside = from && from.homeUrl && !sameHost(details.url, from.url);
      // ⇧clic : la page ne garde aucun lien avec la nouvelle (pas de window.opener),
      // et Electron ne fournit alors pas de contenu à adopter : on ouvre nous-mêmes.
      const shifted = details.disposition === 'new-window' && !details.features;
      if (shifted && /^https?:/i.test(details.url)) {
        const how = store.state.settings.peekShift !== false ? owner.peekTarget(details.url) : 'tab';
        if (how === 'peek') owner.openPeek(details.url, rt.id);
        else if (how === 'route') hooks.openRouted(details.url);
        else owner.newTab(details.url, { after: rt.id });
        return { action: 'deny' };
      }
      const how = /^https?:/i.test(details.url) && outside ? owner.peekTarget(details.url) : 'tab';
      if (how === 'route') { hooks.openRouted(details.url); return { action: 'deny' }; }
      if (how === 'peek') {
        return { action: 'allow', createWindow: (options) => owner.openPeek(details.url, rt.id, options).webContents };
      }
      // Conserve window.opener (connexions OAuth, paiements…).
      return {
        action: 'allow',
        createWindow: (options) => {
          const child = owner.createTab(details.url || 'about:blank', { after: rt.id });
          const childRt = owner.ensureView(child.id, options);
          owner.activate(child.id);
          return childRt.wc;
        },
      };
    });
    if (data.tabs[rt.id] && tab.muted) wc.setAudioMuted(true);
  }

  // Mise en veille décidée sans l'utilisateur (ancienneté, mémoire) : la page est consultée
  // (beforeunload). Si elle s'y oppose elle reste vivante, sans boîte de dialogue, et n'est
  // plus proposée jusqu'à sa prochaine navigation ; si elle ne répond pas, elle reste aussi.
  // `sleeping` dure jusqu'à la réponse de la page : l'effacer après un délai faisait archiver
  // l'onglet (au lieu de l'endormir) quand une page lente finissait par accepter, et posait
  // la question « Quitter la page ? » à l'utilisateur quand elle finissait par refuser.
  static sleepView(id) {
    const rt = live.get(id);
    if (!rt) return;
    if (rt.wc.isDestroyed()) { live.delete(id); return; }
    // Fermeture demandée par l'utilisateur en cours sur cette page (fenêtre, onglet) : sa
    // réponse lui appartient, la veille ne s'en mêle pas.
    if (rt.windowClosing || rt.unloadAnswer || rt.pendingClose) return;
    rt.sleeping = true;
    rt.sleepAsked = Date.now();
    OrbeWindow.consult(rt, 'veille');
  }

  // Consulte la page (beforeunload) avant de la fermer. Le bouclier écarte le délai d'une
  // seconde de Chromium (unload.js) : seul Orbe décide du sort d'une page qui tarde.
  static consult(rt, why) {
    note(rt, 'consultée (' + why + ')');
    hooks.shield(rt.wc);
    rt.wc.close({ waitForBeforeUnload: true });
  }

  static destroyView(id) {
    const rt = live.get(id);
    if (!rt) return;
    live.delete(id);
    const owner = rt.owner;
    if (rt.fullscreen) owner.htmlFullscreen = false;
    try { owner.win.contentView.removeChildView(rt.view); } catch {}
    if (owner.attached) owner.attached.delete(rt.view);
    if (rt.wc.isDestroyed()) return;
    // Fermeture demandée par l'utilisateur d'une page où il a agi : elle peut
    // demander à ne pas être quittée (voir pageObjects). Une page qui ne répond
    // pas ne retient rien.
    const ask = !!rt.pendingClose;
    if (!ask) { note(rt, 'détruite par Orbe'); rt.wc.close({ waitForBeforeUnload: false }); return; }
    OrbeWindow.consult(rt, 'fermeture de l’onglet');
    // (`asking` : la page a répondu et la question est à l'écran ; elle ne doit pas être
    // fermée sous la boîte de dialogue.)
    setTimeout(() => { if (rt.pendingClose && !rt.asking && !rt.wc.isDestroyed()) { note(rt, 'sans réponse après 4 s : fermée'); rt.wc.close({ waitForBeforeUnload: false }); } }, 4000).unref();
  }

  // La page refuse d'être quittée (beforeunload) : la question est posée. Pour un
  // onglet en cours de fermeture, « Rester » le fait revenir, page intacte.
  pageObjects(e, rt) {
    // Veille automatique refusée par la page (beforeunload) : elle reste, sans aucune question.
    // Sauf si, entre-temps, l'utilisateur a demandé à fermer l'onglet ou la fenêtre : la
    // réponse de la page vaut alors pour sa demande, et la question lui est posée (sinon la
    // page, restée sans rien dire, était fermée de force quatre secondes plus tard).
    const sleeping = !!rt.sleeping;
    rt.sleeping = false;
    if (sleeping && !rt.pendingClose && !rt.unloadAnswer) {
      rt.objected = true;
      note(rt, 'refuse la veille');
      hooks.shield(rt.wc);
      return;
    }
    let leave = false;
    rt.asking = true;
    try { leave = hooks.leave(this, rt.wc); } finally { rt.asking = false; }
    note(rt, leave ? 'question : quitter' : 'question : rester');
    if (leave) { e.preventDefault(); return; }
    // (La page reste : `hooks.leave` a levé le bouclier, voir unload.js.)
    const pending = rt.pendingClose;
    rt.pendingClose = null;
    if (rt.unloadAnswer) { rt.windowClosing = false; rt.unloadAnswer(false); }
    if (pending) setImmediate(() => this.reviveClosed(rt, pending));
  }

  reviveClosed(rt, { rec, tab }) {
    const id = rt.id;
    if (this.win.isDestroyed() || rt.wc.isDestroyed()) return;
    if (live.has(id) && live.get(id) !== rt) OrbeWindow.destroyView(id);
    live.set(id, rt);
    rt.owner = this;
    if (rec && !this.data.tabs[id]) {
      this.restoreClosed([rec]);
      // Les écouteurs de la page tiennent l'objet d'origine : c'est lui qui revient.
      this.data.tabs[id] = Object.assign(tab, this.data.tabs[id]);
    } else if (!this.data.tabs[id]) {
      live.delete(id);
      rt.wc.close({ waitForBeforeUnload: false });
      return;
    }
    tab.url = rt.wc.getURL() || tab.url;
    this.activate(id);
  }

  // Fermeture de la fenêtre : chaque page où l'utilisateur a agi peut s'y
  // opposer. Renvoie true si la fermeture est suspendue le temps de demander.
  askUnload(e) {
    if (this.unloadChecked) return false;
    const rts = [...live.values()].filter((rt) => rt.owner === this && rt.touched && !rt.crashed && !rt.internal && !rt.wc.isDestroyed());
    if (!rts.length) return false;
    e.preventDefault();
    if (this.unloading) return true;
    this.unloading = true;
    const visible = this.visibleIds();
    rts.sort((a, b) => visible.includes(b.id) - visible.includes(a.id));
    hooks.closeAll(rts, (rt) => { rt.windowClosing = true; OrbeWindow.consult(rt, 'fermeture de la fenêtre'); }).then((ok) => {
      this.unloading = false;
      const quitting = hooks.quitState.quitting;
      hooks.quitState.quitting = false;
      if (this.win.isDestroyed()) return;
      if (!ok) { if (quitting) hooks.quitAborted(); this.layout(); OrbeWindow.pushAll(); return; }
      this.unloadChecked = true;
      if (quitting) app.quit(); else this.win.close();
    });
    return true;
  }

  // Met en veille des onglets (règles : src/main/veille.js). À chaque activation,
  // seule la limite en nombre joue. `deep` (toutes les minutes) : s'y ajoutent
  // l'ancienneté et la mémoire relevée des processus d'onglets.
  // Renvoie [{ id, why }].
  // Niveau de la batterie, relevé par la barre latérale (le processus principal n'y a pas accès) :
  // seuls un nombre de 0 à 1 et un booléen sont retenus. Au passage sous le seuil, sur batterie,
  // un message le dit une fois et les onglets cachés depuis dix minutes s'endorment (veille.js).
  static setBattery(a, w) {
    if (!a || typeof a !== 'object' || typeof a.charging !== 'boolean' || !Number.isFinite(a.level) || a.level < 0 || a.level > 1) return false;
    const on = store.state.settings.batterySaver !== false;
    const before = veille.saving(OrbeWindow.battery, on);
    OrbeWindow.battery = { level: a.level, charging: a.charging };
    const now = veille.saving(OrbeWindow.battery, on);
    if (now && !before) {
      // Au lancement, le niveau arrive avant que la fenêtre ait ses vues d'appoint : le message
      // attend qu'il y en ait une (sinon sa vue naîtrait à part, dans son propre processus).
      const target = w || OrbeWindow.focused || OrbeWindow.primary;
      const say = (n) => {
        if (!target || target.win.isDestroyed() || !veille.saving(OrbeWindow.battery, store.state.settings.batterySaver !== false)) return;
        if (target.toastView || (target.spares || []).some((s) => s.ready) || n >= 20) target.toast(t('toast.batterySaver'));
        else setTimeout(() => say(n + 1), 150);
      };
      say(0);
      OrbeWindow.trimLive({ deep: true });
    }
    return true;
  }

  static trimLive({ deep = false } = {}) {
    const s = store.state.settings;
    if (!deep && live.size <= s.maxLiveTabs) return [];
    const visible = new Set();
    for (const w of windows.values()) for (const id of w.visibleIds()) visible.add(id);
    // « Dernière utilisation » veut dire dernière fois affiché, pas dernière activation : un
    // onglet resté quatre heures à l'écran (ou dans un volet) n'est pas ancien.
    const now = Date.now();
    for (const id of visible) { const rt = live.get(id); if (rt) rt.lastUsed = now; }
    const mem = deep ? tabMemory() : null;
    const tabs = [...live.values()].filter((rt) => !rt.wc.isDestroyed()).map((rt) => ({
      id: rt.id,
      lastUsed: rt.lastUsed,
      mb: mem ? mem.of(rt.id) : 0,
      // Épargné par les règles automatiques : l'utilisateur y a agi, la page charge, ou elle a refusé une veille.
      // … ou c'est un site qui reste vivant (keepalive.js : messagerie, courrier, musique, et la liste de l'utilisateur).
      typed: !!rt.typed || !!rt.loading || !!rt.objected || keepalive.matches(liveUrl(rt), s),
      kept: visible.has(rt.id) || rt.wc.isCurrentlyAudible() || rt.wc.isDevToolsOpened() || hooks.busy(rt)
        // Image dans l'image, page filmée par une autre, téléchargement en cours, veille demandée à
        // l'instant (une page qui n'y a toujours pas répondu redevient candidate, limite en nombre comprise).
        || !!rt.pip || rt.wc.isBeingCaptured() || downloading.has(rt.wc.id) || (!!rt.sleeping && now - (rt.sleepAsked || 0) < SLEEP_WAIT),
    }));
    const picked = veille.pick(tabs, {
      max: s.maxLiveTabs,
      idleMs: deep ? veille.idleFor(s.sleepAfterHours, veille.saving(OrbeWindow.battery, s.batterySaver !== false)) : 0,
      budgetMb: deep && Number(s.memoryBudget) ? veille.budget(os.totalmem(), Number(s.memoryBudget)) : 0,
      totalMb: mem ? mem.total : 0,
    });
    lastSweep = { at: now, totalMb: mem ? Math.round(mem.total) : 0, budgetMb: deep && Number(s.memoryBudget) ? veille.budget(os.totalmem(), Number(s.memoryBudget)) : 0, real: !!mem && mem.real };
    // La limite en nombre s'applique tout de suite ; ancienneté et mémoire consultent la page.
    for (const p of picked) { if (p.why === 'count') OrbeWindow.destroyView(p.id); else OrbeWindow.sleepView(p.id); }
    if (deep && picked.length) OrbeWindow.pushAll();
    return picked;
  }

  // Passage de fond (toutes les minutes) : relève d'abord l'empreinte réelle des processus
  // d'onglets quand c'est utile (empreinte.js), puis applique les règles de veille.
  static async sweep() {
    const s = store.state.settings;
    const budgetMb = Number(s.memoryBudget) ? veille.budget(os.totalmem(), Number(s.memoryBudget)) : 0;
    if (empreinte.due({ budgetMb, tabs: live.size, minTabs: veille.MIN_LIVE })) await empreinte.refresh(tabProcesses());
    return OrbeWindow.trimLive({ deep: true });
  }

  // --- Onglets --------------------------------------------------------------
  createTab(url, { space = this.space, after, index } = {}) {
    const tab = { id: uid(), url, title: '', favicon: '', createdAt: Date.now(), lastActiveAt: Date.now() };
    this.data.tabs[tab.id] = tab;
    let at = 0;
    const i = after ? space.today.indexOf(after) : -1;
    if (i >= 0) at = i + 1;
    if (typeof index === 'number') at = clamp(index, 0, space.today.length);
    space.today.splice(at, 0, tab.id);
    return tab;
  }

  newTab(input, { background = false, after, split = false } = {}) {
    const url = suggest.resolve(input);
    if (isInternal(url)) return this.openInternal(url.slice(INTERNAL.length));
    const previous = this.activeId;
    const tab = this.createTab(url, { after });
    if (split && previous) this.splitWith(previous, tab.id, true);
    if (background) {
      this.ensureView(tab.id);
      OrbeWindow.trimLive();
      this.changed();
      // Barre masquée : rien ne montre qu'un onglet vient de s'ouvrir derrière.
      if (!this.sidebarVisible && !this.peek) this.toast(t('toast.newTabCreated', { space: this.space.name }), null, () => { if (this.locate(tab.id)) this.activate(tab.id); });
    } else {
      this.activate(tab.id);
    }
    return tab;
  }

  activate(id) {
    const loc = this.locate(id);
    if (!loc || loc.node.type === 'folder') return;
    if (loc.space && loc.space.id !== this.spaceId) this.spaceId = loc.space.id;
    // En quittant un onglet qui joue du son, il passe dans le lecteur miniature.
    for (const prevId of this.visibleIds()) {
      const prevRt = live.get(prevId);
      if (prevRt) prevRt.lastUsed = Date.now(); // il était affiché jusqu'à maintenant
      // Vignette pour la bascule ⌃Tab, prise au moment de quitter la page.
      if (prevId !== id && prevRt && !prevRt.wc.isDestroyed() && !this.incognito) {
        prevRt.wc.capturePage().then((img) => {
          if (!img.isEmpty()) keepThumb(prevRt, img.resize({ width: 320, quality: 'good' }).toJPEG(70).toString('base64'));
        }).catch(() => {});
      }
      if (prevId !== id && prevRt && !prevRt.wc.isDestroyed() && prevRt.wc.isCurrentlyAudible()) {
        prevRt.playing = true;
        media.add(this, prevId);
        if (!(this.groupOf(id) || []).includes(prevId) && !this.data.tabs[prevId].muted) this.pip(prevRt, true);
      }
    }
    media.drop(this, id);
    const backRt = live.get(id);
    if (backRt && backRt.pip) this.pip(backRt, false);
    this.activeBySpace[this.space.id] = id;
    const tab = this.data.tabs[id];
    tab.lastActiveAt = Date.now();
    const rt = this.ensureView(id);
    rt.lastUsed = Date.now();
    if (rt.crashed) { rt.crashed = false; rt.wc.reload(); }
    if (this.peekState && !this.peekAdopting) this.closePeek();
    if (this.findOpen) this.closeFind();
    this.layout();
    this.focusContent();
    OrbeWindow.trimLive();
    this.remember();
    this.changed();
  }

  // Onglet en veille survolé dans la barre latérale : la connexion à son site est
  // préparée (DNS, TCP, TLS), si bien que le clic qui suit trouve le chemin ouvert
  // (relevé sur dix sites : première réponse en 160 ms au lieu de 450). Rien
  // n'est demandé au site : ni page, ni cookie, et rien n'entre dans l'historique.
  // La page elle-même n'est pas chargée d'avance : un survol n'est pas une visite.
  // Jamais en navigation privée ; une seule fois par site toutes les dix secondes.
  prewake(id) {
    const tab = typeof id === 'string' ? this.data.tabs[id] : null;
    if (!tab || this.incognito || live.has(id) || !/^https:\/\//i.test(tab.url)) return false;
    let origin = '';
    try { origin = new URL(tab.url).origin; } catch { return false; }
    const now = Date.now();
    if (now - (prewoken.get(origin) || 0) < 10000) return false;
    if (prewoken.size > 200) prewoken.clear();
    prewoken.set(origin, now);
    try { this.sessionFor(id).preconnect({ url: origin, numSockets: 1 }); } catch { return false; }
    return true;
  }

  paneFocused(id) {
    if (this.activeId === id || !this.visibleIds().includes(id)) return;
    this.activeBySpace[this.space.id] = id;
    OrbeWindow.pushAll();
  }

  focusContent() {
    if (this.gone) return undefined;
    if (this.modalMode) return this.modal.webContents.focus();
    if (this.peekState) return this.peekState.view.webContents.focus();
    // Une feuille posée sur l'onglet actif (question, avertissement) garde le clavier.
    const sheet = hooks.sheetFocus(this);
    if (sheet) return sheet.focus();
    const wc = this.activeWc;
    if (wc) wc.focus();
    else if (!this.ui.webContents.isDestroyed()) this.ui.webContents.focus();
  }

  navigate(input, id = this.activeId) {
    if (!id) return this.newTab(input);
    const rt = this.ensureView(id);
    const url = suggest.resolve(input);
    if (rt.internal || isInternal(url)) return this.newTab(url);
    rt.wc.loadURL(url).catch(() => {});
    this.focusContent();
  }

  nextActiveAfter(id, space) {
    const group = this.groupOf(id);
    if (group) {
      const other = group.find((x) => x !== id);
      if (other) return other;
    }
    const today = space.today;
    const i = today.indexOf(id);
    if (i >= 0) return today[i + 1] || today[i - 1] || this.mostRecent(space, id);
    return this.mostRecent(space, id);
  }

  mostRecent(space, except) {
    let best = null;
    for (const id of this.orderedIds(space)) {
      if (id === except || !live.has(id)) continue;
      const tab = this.data.tabs[id];
      if (!best || tab.lastActiveAt > this.data.tabs[best].lastActiveAt) best = id;
    }
    return best;
  }

  leaveSplit(id) {
    const g = this.groupOf(id);
    if (!g) return;
    const vertical = this.isVertical(g);
    this.setVertical(g, false);
    g.splice(g.indexOf(id), 1);
    delete g.ratios;
    for (const sp of this.data.spaces) if (sp.splitDirs) delete sp.splitDirs[id];
    if (g.length >= 2) this.setVertical(g, vertical);
    if (g.length < 2) {
      for (const sp of this.data.spaces) {
        const i = (sp.splits || []).indexOf(g);
        if (i >= 0) sp.splits.splice(i, 1);
      }
    }
  }

  // ⌘W : un onglet du jour est archivé ; un onglet épinglé est simplement
  // déchargé et reste dans la barre latérale.
  close(id = this.activeId, { silent = false, ask = true, auto = false } = {}) {
    const loc = id && this.locate(id);
    if (!loc || loc.node.type === 'folder') return;
    const space = loc.space || this.space;
    const wasActive = this.activeBySpace[space.id] === id;
    const next = wasActive ? this.nextActiveAfter(id, space) : null;
    const group = this.groupOf(id);
    const split = group ? { ids: [...group], ratios: group.ratios && [...group.ratios], vertical: this.isVertical(group) } : null;
    this.leaveSplit(id);
    const tab = this.data.tabs[id];
    // Trace de l'onglet archivé : de quoi le rouvrir à sa place (⌘Z, ⇧⌘T).
    let rec = null;
    if (loc.list === 'today') {
      loc.arr.splice(loc.index, 1);
      rec = { tab: { ...tab }, spaceId: space.id, index: loc.index, active: wasActive, split, history: this.historyOf(id) || this.histories.get(id) || null };
      this.histories.delete(id);
      this.closed.push(rec);
      if (this.closed.length > 50) this.closed.shift();
      if (this.archives) store.archive({ ...tab, spaceId: space.id, by: auto ? 'auto' : 'manual' });
      delete this.data.tabs[id];
    } else if (tab.homeUrl) {
      tab.url = tab.homeUrl;
    }
    // Page où l'utilisateur a agi : elle sera consultée (beforeunload) avant de disparaître.
    const closing = ask ? live.get(id) : null;
    if (closing && closing.touched && !closing.crashed && !closing.internal) closing.pendingClose = { rec, tab };
    OrbeWindow.destroyView(id);
    OrbeWindow.forget(id, this.data);
    if (wasActive && next) this.activeBySpace[space.id] = next;
    if (silent) return rec;
    if (rec) this.recordClosed('undo.archive', [rec]);
    this.layout();
    this.focusContent();
    this.remember();
    this.changed();
    return undefined;
  }

  // Parcours d'un onglet qu'on ferme (pages précédentes et suivantes), pour le lui rendre
  // s'il est rouvert. Gardé en mémoire seulement, avec la trace de fermeture ; adresses et
  // titres, sans le contenu des formulaires. Rien si l'onglet n'a qu'une page, ou si son
  // parcours passe par autre chose que des pages web.
  historyOf(id) {
    const rt = live.get(id);
    if (!rt || rt.internal || rt.wc.isDestroyed() || this.incognito) return null;
    let entries;
    let index;
    try { entries = rt.wc.navigationHistory.getAllEntries(); index = rt.wc.navigationHistory.getActiveIndex(); } catch { return null; }
    if (!Array.isArray(entries) || entries.length < 2 || entries.length > HISTORY_MAX || !entries[index]) return null;
    if (!entries.every((e) => e && webUrl(e.url))) return null;
    return { entries: entries.map((e) => ({ url: e.url, title: String(e.title || '').slice(0, 300) })), index };
  }

  // ⇧⌘T : le dernier onglet (ou aperçu) fermé revient, à sa place.
  reopenClosed() {
    const last = this.closed.pop();
    if (!last) return;
    if (last.peek) this.reopenPeek(last.peek);
    else this.restoreClosed([last]);
  }

  clearToday() {
    const space = this.space;
    const active = this.activeId;
    // Comme dans Arc : un onglet qui joue un média n'est pas effacé.
    const playing = (id) => { const rt = live.get(id); return !!rt && !rt.wc.isDestroyed() && rt.wc.isCurrentlyAudible(); };
    const ids = space.today.filter((id) => id !== active && !playing(id)).reverse();
    if (!ids.length) return;
    this.closeGroup(ids, 'undo.clearToday');
    this.layout();
    this.changed();
    this.toast(require('./shortcuts').inText(t('toast.cleared'), 'undo'));
  }

  duplicate(id = this.activeId) {
    const tab = id && this.data.tabs[id];
    if (tab) this.newTab(tab.url, { after: id });
  }

  togglePin(id = this.activeId) {
    const loc = id && this.locate(id);
    if (!loc || loc.node.type === 'folder') return;
    const tab = this.data.tabs[id];
    const space = loc.space || this.space;
    const before = this.places([id]);
    loc.arr.splice(loc.index, 1);
    if (loc.list === 'today') {
      space.pinned.push({ type: 'tab', id });
      tab.homeUrl = tab.url;
    } else {
      space.today.unshift(id);
      delete tab.homeUrl;
      delete tab.customTitle;
    }
    this.recordPlaces(loc.list === 'today' ? 'undo.pin' : 'undo.unpin', before);
    this.changed();
  }

  toggleFavorite(id = this.activeId) {
    const loc = id && this.locate(id);
    if (!loc || loc.node.type === 'folder') return;
    const tab = this.data.tabs[id];
    if (loc.list !== 'favorites' && this.favoritesFull(1)) return;
    const before = this.places([id]);
    loc.arr.splice(loc.index, 1);
    if (loc.list === 'favorites') {
      this.space.today.unshift(id);
      delete tab.homeUrl;
    } else {
      this.favorites.push(id);
      tab.homeUrl = tab.homeUrl || tab.url;
    }
    this.recordPlaces(loc.list === 'favorites' ? 'undo.removeFavorite' : 'undo.addFavorite', before);
    this.changed();
  }

  // Douze favoris au plus par profil, comme dans Arc : au-delà, l'ajout est refusé.
  favoritesFull(adding) {
    if (this.favorites.length + adding <= FAVORITES_MAX) return false;
    this.toast(t('toast.favMax', { n: FAVORITES_MAX }));
    return true;
  }

  // Site où l'image dans l'image automatique est coupée (réglage `pipOffSites`).
  static pipSite(url) { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase() : ''; } catch { return ''; } }
  static pipOff(url) { const h = OrbeWindow.pipSite(url); const list = store.state.settings.pipOffSites; return !!h && Array.isArray(list) && list.includes(h); }
  static togglePipSite(url) {
    const h = OrbeWindow.pipSite(url);
    if (!h) return false;
    const list = Array.isArray(store.state.settings.pipOffSites) ? store.state.settings.pipOffSites : [];
    const next = list.includes(h) ? list.filter((x) => x !== h) : [...list, h].slice(-200);
    require('./commands').setSetting('pipOffSites', next);
    return true;
  }

  // Image dans l'image : la vidéo en cours suit l'utilisateur quand il change
  // d'onglet, et retourne dans sa page quand il y revient.
  pip(rt, enter) {
    if (!store.state.settings.autoPip || rt.wc.isDestroyed()) return;
    // Coupée pour ce site (menu d'une vidéo) : on ne l'y fait pas entrer ; en sortir reste permis.
    if (enter && OrbeWindow.pipOff(rt.wc.getURL())) return;
    rt.pip = enter;
    const code = enter
      ? `(() => {
          const v = [...document.querySelectorAll('video')]
            .filter((x) => !x.paused && !x.ended && x.readyState > 2 && !x.disablePictureInPicture && x.videoWidth > 0)
            .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
          if (v && document.pictureInPictureEnabled && !document.pictureInPictureElement) v.requestPictureInPicture().catch(() => {});
        })()`
      : `(() => { if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {}); })()`;
    rt.wc.executeJavaScript(code, true).catch(() => {});
  }

  // Lecteurs miniatures : lecture / pause du plus récent (ancien geste), ou un
  // geste précis sur l'un d'eux ({ id, act, value } — vérifié par media.act).
  mediaToggle() { return media.act(this, { act: 'toggle' }); }
  mediaAct(a) { return media.act(this, a); }
  get mediaId() { return media.players(this)[0] || null; }

  resetPinned(id = this.activeId) {
    const tab = id && this.data.tabs[id];
    if (tab && tab.homeUrl) this.navigate(tab.homeUrl, id);
  }

  // ⌘clic sur l'icône d'un épinglé sorti de son adresse : il y retourne, et la
  // page qu'il affichait part dans un nouvel onglet du jour.
  resetPinnedAside(id = this.activeId) {
    const tab = id && this.data.tabs[id];
    if (!tab || !tab.homeUrl || samePage(tab.homeUrl, tab.url)) return;
    if (webUrl(tab.url)) this.newTab(tab.url, { background: true });
    this.resetPinned(id);
  }

  // « Réinitialiser les onglets de cet Espace » : chaque épinglé retourne à son adresse.
  resetTabs() {
    let n = 0;
    for (const id of walk(this.space.pinned)) {
      const tab = this.data.tabs[id];
      if (!tab.homeUrl || samePage(tab.homeUrl, tab.url)) continue;
      const rt = live.get(id);
      if (rt && !rt.wc.isDestroyed()) rt.wc.loadURL(tab.homeUrl).catch(() => {});
      else tab.url = tab.homeUrl;
      n += 1;
    }
    if (n) this.changed();
    return n;
  }

  // Adresse (ou recherche) lue dans le presse-papiers ; jamais file:, orbe: ou javascript:.
  async clipboardUrl() {
    const text = String(await clipboard.readText().catch(() => '') || '').trim().slice(0, 2000);
    if (!text || /^(file|orbe|chrome|javascript|data|view-source|about|blob):/i.test(text)) return null;
    const url = suggest.resolve(text);
    return isInternal(url) ? null : url;
  }

  // ⌥⌘V : l'adresse du presse-papiers s'ouvre dans un nouvel onglet.
  async pasteUrl() {
    const url = await this.clipboardUrl();
    return url ? this.newTab(url) : undefined;
  }

  // Précédent / suivant : pages de l'historique de l'onglet, de la plus proche à
  // la plus lointaine (`dir` : -1 en arrière, 1 en avant).
  navEntries(dir) {
    const wc = this.activeWc;
    if (!wc) return [];
    const nav = wc.navigationHistory;
    const all = nav.getAllEntries();
    const at = nav.getActiveIndex();
    const out = [];
    for (let i = at + dir; i >= 0 && i < all.length && out.length < NAV_MENU_MAX; i += dir) out.push({ index: i, url: all[i].url, title: all[i].title });
    return out;
  }

  // Appui long ou clic droit sur précédent / suivant : l'historique de l'onglet.
  navMenuTemplate(dir) {
    return this.navEntries(dir < 0 ? -1 : 1).map((e) => ({
      label: (e.title || suggest.strip(e.url) || e.url).slice(0, 70),
      click: () => { const wc = this.activeWc; if (wc) wc.navigationHistory.goToIndex(e.index); },
    }));
  }

  navMenu(dir) {
    const tpl = this.navMenuTemplate(dir);
    if (tpl.length) this.popup(tpl);
  }

  // ⌘clic ou clic molette sur précédent / suivant : la page s'ouvre dans un nouvel onglet.
  navNew(dir) {
    const e = this.navEntries(dir < 0 ? -1 : 1)[0];
    return e && webUrl(e.url) ? this.newTab(e.url, { background: true, after: this.activeId }) : undefined;
  }

  // Bouton actualiser, clic droit : ses variantes.
  reloadMenuTemplate() {
    const on = !!this.activeWc;
    return [
      { label: t('view.reload'), enabled: on, click: () => this.reload(false) },
      { label: t('view.forceReload'), enabled: on, click: () => this.reload(true) },
      { type: 'separator' },
      { label: t('view.clearCookies'), enabled: on, click: () => this.clearAndReload('cookies') },
      { label: t('view.clearCache'), enabled: on, click: () => this.clearAndReload('cache') },
    ];
  }

  toggleMute(id = this.activeId) {
    const tab = id && this.data.tabs[id];
    if (!tab) return;
    tab.muted = !tab.muted;
    const rt = live.get(id);
    if (rt) rt.wc.setAudioMuted(tab.muted);
    this.changed();
  }

  stepTab(delta) {
    const ids = this.orderedIds();
    if (!ids.length) return;
    const i = ids.indexOf(this.activeId);
    this.activate(ids[(i + delta + ids.length) % ids.length]);
  }

  tabAt(n) {
    const s = store.state.settings;
    const ids = s.tabKeysFavorites === false ? [...walk(this.space.pinned), ...this.space.today] : this.orderedIds();
    const id = n === 9 && s.tabKeysNinthLast !== false ? ids[ids.length - 1] : ids[n - 1];
    if (id) this.activate(id);
  }

  move({ id, to, folderId, index }) {
    const loc = this.locate(id);
    if (!loc) return;
    const space = loc.space || this.space;
    const node = loc.node;
    const isFolder = node.type === 'folder';
    let dest;
    if (to === 'favorites') dest = this.favorites;
    else if (to === 'today') dest = this.space.today;
    else if (to === 'pinned') dest = this.space.pinned;
    else if (to === 'folder') {
      const f = findNode(this.space.pinned, folderId);
      if (!f || f.node.type !== 'folder') return;
      dest = f.node.children;
    } else return;
    // Un dossier va dans les épinglés ou dans un autre dossier, jamais dans
    // lui-même ni dans l'un de ses propres sous-dossiers.
    if (isFolder && to !== 'pinned' && to !== 'folder') return;
    if (isFolder && to === 'folder' && (folderId === id || findNode(node.children, folderId))) return;
    if (to === 'favorites' && loc.arr !== dest && this.favoritesFull(1)) return;
    let at = typeof index === 'number' ? index : dest.length;
    if (dest === loc.arr && loc.index < at) at -= 1;
    const before = this.places([id]);
    loc.arr.splice(loc.index, 1);
    const flat = to === 'favorites' || to === 'today';
    dest.splice(clamp(at, 0, dest.length), 0, flat ? id : node);
    if (!isFolder) {
      const tab = this.data.tabs[id];
      if (to === 'today') { delete tab.homeUrl; delete tab.customTitle; } else if (!tab.homeUrl) tab.homeUrl = tab.url;
      if (loc.space && space.id !== this.space.id && this.activeBySpace[space.id] === id) delete this.activeBySpace[space.id];
    }
    this.recordPlaces(isFolder ? 'undo.moveFolder' : 'undo.move', before);
    this.changed();
  }

  moveToSpace(id, spaceId) {
    const loc = this.locate(id);
    const target = this.data.spaces.find((s) => s.id === spaceId);
    if (!loc || !target || loc.space === target) return;
    const wasActive = this.activeId === id;
    const next = wasActive ? this.nextActiveAfter(id, this.space) : null;
    const before = this.places([id]);
    OrbeWindow.forget(id, this.data);
    // Changer de profil change de cookies : la page sera rechargée.
    if (loc.space && loc.space.profileId !== target.profileId) OrbeWindow.destroyView(id);
    loc.arr.splice(loc.index, 1);
    if (loc.list === 'pinned') target.pinned.push(loc.node);
    else { target.today.unshift(id); delete this.data.tabs[id].homeUrl; }
    if (wasActive && next) this.activeBySpace[this.space.id] = next;
    this.recordPlaces('undo.moveToSpace', before);
    for (const w of windows.values()) if (w.data === this.data) w.layout();
    this.changed();
    if (!this.replaying) this.movedToast(id, target);
  }

  // « Tab moved! Click to go there. » d'Arc : l'onglet a quitté l'Espace affiché ; un clic sur
  // le message mène à lui, dans son nouvel Espace.
  movedToast(id, target, n = 1) {
    if (target === this.space) return;
    this.toast(t(n > 1 ? 'toast.tabsMoved' : 'toast.tabMoved', { space: target.name, n }), null, () => {
      if (!this.data.spaces.includes(target) || !this.locate(id)) return;
      this.switchSpace(target.id);
      this.activate(id);
    });
  }

  // --- Sélection multiple ---------------------------------------------------
  // La sélection vit dans la barre latérale ; le processus principal ne reçoit
  // que des listes d'identifiants, vérifiées une à une : seuls restent les
  // onglets (jamais les dossiers) affichés dans cette fenêtre — favoris du
  // profil et Espace courant —, sans doublon et dans l'ordre d'affichage.
  checkIds(ids) {
    if (!Array.isArray(ids) || ids.length > 5000) return [];
    const wanted = new Set(ids.filter((x) => typeof x === 'string'));
    if (!wanted.size) return [];
    return this.orderedIds().filter((id) => wanted.has(id) && this.data.tabs[id]);
  }

  // Sélection annoncée par la barre latérale, revérifiée à chaque usage.
  selected() {
    return this.checkIds(this.selection);
  }

  // Après une action sur la sélection : la barre latérale la vide.
  dropSelection() {
    this.selection = [];
    this.selRev = (this.selRev || 0) + 1;
  }

  closeMany(ids) {
    ids = this.checkIds(ids);
    if (!ids.length) return;
    this.closeGroup([...ids].reverse(), ids.length > 1 ? 'undo.archiveMany' : 'undo.archive');
    this.dropSelection();
    this.layout();
    this.focusContent();
    this.remember();
    this.changed();
  }

  // Dépose plusieurs onglets au même endroit, dans leur ordre d'affichage.
  moveMany({ ids, to, folderId, index }, label = 'undo.moveMany') {
    ids = this.checkIds(ids);
    if (!ids.length) return;
    let dest;
    if (to === 'favorites') dest = this.favorites;
    else if (to === 'today') dest = this.space.today;
    else if (to === 'pinned') dest = this.space.pinned;
    else if (to === 'folder') {
      const f = typeof folderId === 'string' ? findNode(this.space.pinned, folderId) : null;
      if (!f || f.node.type !== 'folder') return;
      dest = f.node.children;
    } else return;
    if (to === 'favorites' && this.favoritesFull(ids.filter((id) => this.locate(id).list !== 'favorites').length)) return;
    const flat = to === 'favorites' || to === 'today';
    const key = (x) => (flat ? x : x.id);
    // Repère : la première ligne, à partir de la position visée, qui ne part pas avec le lot.
    const moving = new Set(ids);
    const from = Number.isFinite(index) ? clamp(Math.floor(index), 0, dest.length) : dest.length;
    const before = dest.slice(from).map(key).find((k) => !moving.has(k));
    const places = this.places(ids);
    for (const id of ids) {
      const loc = this.locate(id);
      loc.arr.splice(loc.index, 1);
      const tab = this.data.tabs[id];
      if (to === 'today') { delete tab.homeUrl; delete tab.customTitle; } else if (!tab.homeUrl) tab.homeUrl = tab.url;
    }
    const at = before === undefined ? dest.length : dest.findIndex((x) => key(x) === before);
    dest.splice(at, 0, ...ids.map((id) => (flat ? id : { type: 'tab', id })));
    if (label) this.recordPlaces(label, places);
    this.dropSelection();
    this.changed();
  }

  // ⌥glisser : des copies des onglets sont déposées à l'endroit visé, les
  // originaux ne bougent pas. Les copies se chargent quand on les ouvre.
  copyTo({ id, ids, to, folderId, index }) {
    const from = this.checkIds(Array.isArray(ids) ? ids : [id]).filter((x) => !this.data.tabs[x].internal);
    if (!from.length) return;
    const copies = from.map((x) => {
      const src = this.data.tabs[x];
      // En fin de liste : les rangs visés dans Aujourd'hui ne sont pas décalés.
      const tab = this.createTab(src.url, { index: this.space.today.length });
      tab.title = src.title;
      tab.favicon = src.favicon;
      return tab.id;
    });
    this.moveMany({ ids: copies, to, folderId, index }, null);
    // Destination refusée (dossier inconnu, favoris pleins) : les copies ne restent pas.
    if (to !== 'today' && copies.some((x) => this.space.today.includes(x))) {
      for (const x of copies) { const i = this.space.today.indexOf(x); if (i >= 0) this.space.today.splice(i, 1); delete this.data.tabs[x]; }
    }
    this.changed();
  }

  // Épingle les onglets du jour de la sélection ; si tous sont déjà épinglés, les désépingle.
  pinMany(ids) {
    ids = this.checkIds(ids).filter((id) => this.locate(id).list !== 'favorites');
    if (!ids.length) return;
    const unpin = ids.every((id) => this.locate(id).list === 'pinned');
    if (unpin) this.moveMany({ ids, to: 'today', index: 0 }, 'undo.unpinMany');
    else this.moveMany({ ids: ids.filter((id) => this.locate(id).list === 'today'), to: 'pinned' }, 'undo.pinMany');
  }

  // Ajoute la sélection aux favoris ; si tous en sont déjà, les en retire.
  favoriteMany(ids) {
    ids = this.checkIds(ids);
    if (!ids.length || this.incognito) return;
    const remove = ids.every((id) => this.locate(id).list === 'favorites');
    if (remove) this.moveMany({ ids, to: 'today', index: 0 }, 'undo.removeFavorite');
    else this.moveMany({ ids: ids.filter((id) => this.locate(id).list !== 'favorites'), to: 'favorites' }, 'undo.addFavorite');
  }

  moveManyToSpace(ids, spaceId) {
    ids = this.checkIds(ids).filter((id) => this.locate(id).list !== 'favorites');
    if (!ids.length || !this.data.spaces.some((s) => s.id === spaceId)) return;
    // Les épinglés s'ajoutent à la suite ; les onglets du jour arrivent en tête,
    // donc du dernier au premier pour garder leur ordre.
    const today = ids.filter((id) => this.locate(id).list === 'today');
    const before = this.places(ids);
    this.mute(() => {
      for (const id of ids) if (!today.includes(id)) this.moveToSpace(id, spaceId);
      for (const id of today.reverse()) this.moveToSpace(id, spaceId);
    });
    this.recordPlaces('undo.moveToSpace', before);
    this.dropSelection();
    this.changed();
    this.movedToast(ids[0], this.data.spaces.find((s) => s.id === spaceId), ids.length);
  }

  copyLinks(ids) {
    ids = this.checkIds(ids);
    if (!ids.length) return;
    clipboard.writeText(ids.map((id) => this.data.tabs[id].url).join('\n'));
    this.toast(t('toast.linksCopied', { n: ids.length }));
  }

  // Chaque copie se place sous son modèle (en tête d'Aujourd'hui pour un épinglé
  // ou un favori) et se charge en arrière-plan ; l'onglet affiché ne change pas.
  duplicateMany(ids) {
    ids = this.checkIds(ids).filter((id) => !this.data.tabs[id].internal);
    if (!ids.length) return;
    for (const id of [...ids].reverse()) {
      const src = this.data.tabs[id];
      const tab = this.createTab(src.url, { after: id });
      tab.title = src.title;
      tab.favicon = src.favicon;
      this.ensureView(tab.id);
    }
    OrbeWindow.trimLive();
    this.dropSelection();
    this.changed();
  }

  // « Nouveau dossier avec la sélection » : le dossier prend la place du premier
  // onglet épinglé de la sélection (sinon la fin des épinglés) et reçoit le lot.
  folderFromSelection(ids) {
    ids = this.checkIds(ids);
    if (!ids.length) return;
    const folder = { type: 'folder', id: uid(), name: t('tabs.folderDefault'), open: true, children: [] };
    const first = ids.map((id) => this.locate(id)).find((loc) => loc.list === 'pinned');
    const before = this.places(ids);
    if (first) first.arr.splice(first.index, 0, folder); else this.space.pinned.push(folder);
    this.moveMany({ ids, to: 'folder', folderId: folder.id }, null);
    const after = this.places(ids);
    let back = null;
    this.record('undo.newFolder',
      () => { this.restorePlaces(before); back = this.dissolveFolder(folder.id); },
      () => { back(); this.restorePlaces(after); });
    this.askRename(folder.id);
  }

  // --- Annulation (⌘Z, ⇧⌘Z) ------------------------------------------------
  // Pile des actions de la barre latérale : propre à la fenêtre, bornée, jamais
  // enregistrée sur disque. Chaque entrée sait se défaire (`undo`) et se refaire
  // (`redo`) ; `stale(sens)` dit qu'elle n'a plus d'objet — l'onglet a déjà été
  // rouvert par ⇧⌘T, par exemple — et elle est alors sautée.
  record(label, undo, redo, stale) {
    if (this.replaying) return;
    this.undoStack.push({ label, undo, redo, stale });
    if (this.undoStack.length > UNDO_MAX) this.undoStack.shift();
    this.redoStack.length = 0;
    OrbeWindow.pushAll();
  }

  // Exécute `fn` sans rien empiler (actions composées, rejeu d'une entrée).
  mute(fn) {
    const was = this.replaying;
    this.replaying = true;
    try { return fn(); } finally { this.replaying = was; }
  }

  // Défait (`undo`) ou refait (`redo`) la dernière entrée valable. Renvoie false
  // s'il n'y a rien à faire : ⌘Z garde alors son sens habituel dans la page.
  replay(way) {
    const from = way === 'undo' ? this.undoStack : this.redoStack;
    const to = way === 'undo' ? this.redoStack : this.undoStack;
    for (;;) {
      const entry = from.pop();
      if (!entry) return false;
      if (entry.stale && entry.stale(way)) continue;
      this.mute(() => entry[way]());
      to.push(entry);
      this.dropSelection();
      for (const w of windows.values()) if (w.data === this.data) w.layout();
      this.remember();
      this.changed();
      return true;
    }
  }

  // Libellé de l'action que ⌘Z (ou ⇧⌘Z) toucherait, pour le menu Édition.
  pendingLabel(way) {
    const stack = way === 'undo' ? this.undoStack : this.redoStack;
    for (let i = stack.length - 1; i >= 0; i--) if (!(stack[i].stale && stack[i].stale(way))) return stack[i].label;
    return null;
  }

  // Emplacement d'une ligne (onglet ou dossier) : liste, Espace ou profil,
  // dossier parent, rang ; pour un onglet, ce que l'épinglage lui attache.
  placeOf(id) {
    const loc = this.locate(id);
    if (!loc) return null;
    let parentId = null;
    if (loc.list === 'pinned' && loc.arr !== loc.space.pinned) {
      const owner = (nodes) => {
        for (const n of nodes) {
          if (n.type !== 'folder') continue;
          if (n.children === loc.arr) return n.id;
          const deeper = owner(n.children);
          if (deeper) return deeper;
        }
        return null;
      };
      parentId = owner(loc.space.pinned);
    }
    const tab = loc.node.type === 'folder' ? null : this.data.tabs[id];
    return { id, node: loc.node, list: loc.list, spaceId: loc.space ? loc.space.id : null, profileId: loc.profileId || null, parentId, index: loc.index, homeUrl: tab && tab.homeUrl, customTitle: tab && tab.customTitle };
  }

  places(ids) {
    return ids.map((id) => this.placeOf(id)).filter(Boolean);
  }

  // Remet des lignes aux emplacements relevés par `places` : même liste, même
  // dossier, même rang (au plus près si la liste a changé entre-temps).
  restorePlaces(places) {
    const d = this.data;
    const todo = places.filter((p) => p.node.type === 'folder' || d.tabs[p.id]);
    const from = new Map();
    for (const p of todo) {
      const loc = this.locate(p.id);
      if (!loc) continue;
      from.set(p.id, loc.space);
      loc.arr.splice(loc.index, 1);
    }
    // Par rang croissant : chaque ligne retrouve exactement le sien.
    for (const p of [...todo].sort((a, b) => a.index - b.index)) {
      const space = p.list === 'favorites' ? null : (d.spaces.find((s) => s.id === p.spaceId) || this.space);
      let arr;
      if (!space) arr = d.favs[p.profileId] || this.favorites;
      else if (p.list === 'today') arr = space.today;
      else {
        const f = p.parentId ? findNode(space.pinned, p.parentId) : null;
        arr = f && f.node.type === 'folder' ? f.node.children : space.pinned;
      }
      const node = p.node.type === 'folder' ? p.node : { type: 'tab', id: p.id };
      arr.splice(clamp(p.index, 0, arr.length), 0, p.list === 'pinned' ? node : p.id);
      if (p.node.type === 'folder') continue;
      const tab = d.tabs[p.id];
      if (p.homeUrl) tab.homeUrl = p.homeUrl; else delete tab.homeUrl;
      if (p.customTitle) tab.customTitle = p.customTitle; else delete tab.customTitle;
      // Changement d'Espace : l'onglet n'est plus « actif » là d'où il vient, et
      // un autre profil veut une page rechargée avec ses propres cookies.
      const was = from.get(p.id);
      if (was !== undefined && was !== space) {
        OrbeWindow.forget(p.id, d);
        if (was && space && was.profileId !== space.profileId) OrbeWindow.destroyView(p.id);
      }
    }
  }

  // Retient pour ⌘Z un déplacement de lignes : `before` est le relevé pris avant.
  recordPlaces(label, before) {
    if (this.replaying || !before.length) return;
    const after = this.places(before.map((p) => p.id));
    const same = after.length === before.length && before.every((p, i) => ['list', 'spaceId', 'profileId', 'parentId', 'index'].every((k) => p[k] === after[i][k]));
    if (!same) this.record(label, () => this.restorePlaces(before), () => this.restorePlaces(after));
  }

  // Archive un lot d'onglets en une seule action annulable. Renvoie leur nombre.
  closeGroup(ids, label) {
    const recs = ids.map((id) => this.close(id, { silent: true })).filter(Boolean);
    this.recordClosed(label, recs);
    return recs.length;
  }

  recordClosed(label, recs) {
    if (!recs.length) return;
    const ids = recs.map((r) => r.tab.id);
    this.record(label,
      () => this.restoreClosed(recs),
      () => recs.splice(0, recs.length, ...ids.map((id) => this.close(id, { silent: true })).filter(Boolean)),
      (way) => (way === 'undo' ? recs.every((r) => this.data.tabs[r.tab.id]) : !ids.some((id) => this.data.tabs[id])));
  }

  // Rouvre des onglets archivés : même identifiant, même Espace, même rang (du
  // dernier fermé au premier, chacun retrouve sa place), vue scindée comprise.
  restoreClosed(recs) {
    const d = this.data;
    const back = [];
    for (const rec of [...recs].reverse()) {
      const id = rec.tab.id;
      if (d.tabs[id]) continue;
      const space = d.spaces.find((s) => s.id === rec.spaceId) || this.space;
      d.tabs[id] = { ...rec.tab, lastActiveAt: Date.now() };
      if (rec.history) this.histories.set(id, rec.history);
      space.today.splice(clamp(rec.index, 0, space.today.length), 0, id);
      const i = this.closed.indexOf(rec);
      if (i >= 0) this.closed.splice(i, 1);
      if (this.archives) {
        const a = store.state.archive.findIndex((x) => x.url === rec.tab.url);
        if (a >= 0) store.state.archive.splice(a, 1);
      }
      back.push(rec);
    }
    for (const rec of back) {
      if (!rec.split) continue;
      const ids = rec.split.ids.filter((x) => d.tabs[x]);
      const groups = new Set(ids.map((x) => this.groupOf(x)).filter(Boolean));
      const loc = this.locate(ids[0]);
      let g = [...groups][0];
      // Regroupés autrement depuis : on n'y touche pas.
      if (ids.length < 2 || groups.size > 1 || !loc || !loc.space || (g && g.some((x) => !ids.includes(x)))) continue;
      const sp = loc.space;
      if (!g) (sp.splits || (sp.splits = [])).push(g = []);
      if (sp.splitDirs && g.length) delete sp.splitDirs[g[0]];
      g.splice(0, g.length, ...ids);
      if (rec.split.ratios && ids.length === rec.split.ids.length) g.ratios = [...rec.split.ratios]; else delete g.ratios;
      if (rec.split.vertical) (sp.splitDirs || (sp.splitDirs = {}))[g[0]] = 'v';
    }
    // L'onglet qui était affiché le redevient ; un onglet rouvert seul aussi.
    const show = back.find((r) => r.active) || (back.length === 1 ? back[0] : null);
    if (show) this.activate(show.tab.id);
    return back.length;
  }

  // Retire un dossier : ses lignes prennent sa place. Renvoie de quoi le remettre.
  dissolveFolder(id) {
    const loc = this.locate(id);
    if (!loc || loc.node.type !== 'folder') return () => {};
    const folder = loc.node;
    const place = this.placeOf(id);
    const kids = this.places(folder.children.map((n) => n.id));
    loc.arr.splice(loc.index, 1, ...folder.children);
    folder.children = [];
    return () => {
      if (this.locate(id)) return;
      this.restorePlaces([place]);
      this.restorePlaces(kids);
    };
  }

  // Fermeture d'un aperçu par l'utilisateur (Échap, ⌘W, bouton) : ⌘Z ou ⇧⌘T le rouvrent.
  dismissPeek() {
    const state = this.peekState;
    if (!state) return;
    const wc = state.view.webContents;
    const rec = { peek: { url: (!wc.isDestroyed() && webUrl(wc.getURL())) || state.url, from: state.from } };
    this.closePeek();
    if (!webUrl(rec.peek.url)) return;
    const forget = () => { const i = this.closed.indexOf(rec); if (i >= 0) this.closed.splice(i, 1); };
    this.closed.push(rec);
    if (this.closed.length > 50) this.closed.shift();
    this.record('undo.closePeek',
      () => { forget(); this.reopenPeek(rec.peek); },
      () => { this.closePeek(); this.closed.push(rec); },
      (way) => (way === 'undo' ? !this.closed.includes(rec) : !this.peekState));
  }

  reopenPeek({ url, from }) {
    if (this.locate(from) && this.activeId !== from) this.activate(from);
    this.openPeek(url, from);
  }

  // --- Dossiers -------------------------------------------------------------
  // `parentId` : le nouveau dossier se range dans ce dossier (« Nouveau sous-dossier »).
  newFolder(parentId) {
    const folder = { type: 'folder', id: uid(), name: t('tabs.folderDefault'), open: true, children: [] };
    const parent = typeof parentId === 'string' ? findNode(this.space.pinned, parentId) : null;
    if (parent && parent.node.type === 'folder') { parent.node.children.push(folder); parent.node.open = true; } else this.space.pinned.push(folder);
    let back = null;
    this.record('undo.newFolder', () => { back = this.dissolveFolder(folder.id); }, () => back());
    this.changed();
    this.askRename(folder.id);
  }

  toggleFolder(id) {
    const f = findNode(this.space.pinned, id);
    if (!f) return;
    f.node.open = !f.node.open;
    this.changed();
  }

  // « Tout déplier » / « Tout replier » : tous les dossiers de l'Espace, sous-dossiers compris.
  setFoldersOpen(open) {
    const each = (nodes) => { for (const n of nodes) if (n.type === 'folder') { n.open = !!open; each(n.children); } };
    each(this.space.pinned);
    this.changed();
  }

  // Copie d'un dossier, posée juste après lui : mêmes sous-dossiers, mêmes
  // onglets épinglés (de nouveaux onglets, à leur adresse d'origine).
  duplicateFolder(id) {
    const space = this.space;
    const f = findNode(space.pinned, id);
    if (!f || f.node.type !== 'folder') return;
    const made = {};
    const copy = (n) => {
      if (n.type === 'folder') return { type: 'folder', id: uid(), name: n.name, open: n.open !== false, children: n.children.map(copy) };
      const src = this.data.tabs[n.id];
      const home = src.homeUrl || src.url;
      const tab = { id: uid(), url: home, title: src.title, favicon: src.favicon, createdAt: Date.now(), lastActiveAt: Date.now(), homeUrl: home };
      if (src.customTitle) tab.customTitle = src.customTitle;
      if (src.internal) tab.internal = true;
      made[tab.id] = tab;
      return { type: 'tab', id: tab.id };
    };
    const clone = copy(f.node);
    const add = () => {
      if (findNode(space.pinned, clone.id)) return;
      for (const tid of walk([clone])) this.data.tabs[tid] = made[tid];
      const o = findNode(space.pinned, id);
      if (o) o.arr.splice(o.index + 1, 0, clone); else space.pinned.push(clone);
    };
    // Seuls les onglets encore dans la copie partent avec elle.
    const remove = () => {
      const c = findNode(space.pinned, clone.id);
      if (!c) return;
      c.arr.splice(c.index, 1);
      for (const tid of walk([clone])) { OrbeWindow.destroyView(tid); OrbeWindow.forget(tid, this.data); delete this.data.tabs[tid]; }
    };
    add();
    this.record('undo.duplicateFolder', remove, add);
    this.changed();
  }

  // « Copier tous les liens » d'un dossier (sous-dossiers compris), en clair ou en liste Markdown.
  copyFolderLinks(id, markdown) {
    const f = findNode(this.space.pinned, id);
    if (!f || f.node.type !== 'folder') return;
    const tabs = [...walk(f.node.children)].map((tid) => this.data.tabs[tid]).filter(Boolean);
    if (!tabs.length) return;
    clipboard.writeText(tabs.map((tab) => (markdown ? `- ${mdLink(tab.customTitle || tab.title, tab.url)}` : tab.url)).join('\n'));
    this.toast(t('toast.linksCopied', { n: tabs.length }));
  }

  // « Coller l'adresse dans un nouvel onglet » : épinglé dans ce dossier, et affiché.
  async pasteInFolder(id) {
    const url = await this.clipboardUrl();
    const f = findNode(this.space.pinned, id);
    if (!f || f.node.type !== 'folder' || !url) return;
    const tab = { id: uid(), url, title: '', favicon: '', createdAt: Date.now(), lastActiveAt: Date.now(), homeUrl: url };
    this.data.tabs[tab.id] = tab;
    f.node.children.push({ type: 'tab', id: tab.id });
    f.node.open = true;
    this.activate(tab.id);
  }

  // Comme dans Arc : supprimer un dossier archive les onglets qu'il contient
  // (sous-dossiers compris). Vide, il part sans question ; sinon la question le
  // nomme et dit ce que deviennent ses onglets. ⌘Z remet tout en place.
  async deleteFolder(id) {
    const f = this.locate(id);
    if (!f || f.node.type !== 'folder') return;
    const n = [...walk(f.node.children)].length;
    if (n) {
      const r = await dialog.showMessageBox(this.win, {
        type: 'warning',
        message: t('tabs.deleteFolderConfirm', { name: f.node.name }),
        detail: t('tabs.deleteFolderDetail'),
        buttons: [t('tabs.deleteFolder'), t('dialog.cancel')],
        defaultId: 0,
        cancelId: 1,
      });
      if (r.response !== 0 || this.gone || !this.locate(id)) return;
    }
    let back = this.removeFolder(id);
    if (!back) return;
    this.record('undo.deleteFolder', () => back(), () => { back = this.removeFolder(id) || back; });
    if (n) this.toast(require('./shortcuts').inText(t('toast.folderDeleted', { n }), 'undo'));
  }

  // Retire un dossier et archive ses onglets, sans rien demander. Renvoie de quoi
  // le rétablir : le dossier à sa place, ses onglets, leurs vues scindées.
  removeFolder(id) {
    const loc = this.locate(id);
    if (!loc || loc.node.type !== 'folder') return null;
    const folder = loc.node;
    const space = loc.space;
    const place = this.placeOf(id);
    const ids = [...walk(folder.children)];
    const tabs = {};
    const archived = [];
    const splits = (space.splits || []).filter((g) => g.some((x) => ids.includes(x))).map((g) => Object.assign([...g], g.ratios ? { ratios: [...g.ratios] } : {}));
    const active = ids.includes(this.activeBySpace[space.id]) ? this.activeBySpace[space.id] : null;
    for (const tid of ids) {
      const tab = this.data.tabs[tid];
      tabs[tid] = tab;
      if (this.archives) {
        const top = store.state.archive[0];
        store.archive({ ...tab, title: tab.customTitle || tab.title, spaceId: space.id });
        if (store.state.archive[0] !== top) archived.push(store.state.archive[0]);
      }
      OrbeWindow.destroyView(tid);
      OrbeWindow.forget(tid, this.data);
      delete this.data.tabs[tid];
    }
    loc.arr.splice(loc.index, 1);
    for (const w of windows.values()) if (w.data === this.data) w.layout();
    this.changed();
    return () => {
      if (this.locate(id)) return;
      Object.assign(this.data.tabs, tabs);
      this.restorePlaces([place]);
      if (!this.incognito) store.state.archive = store.state.archive.filter((a) => !archived.includes(a));
      for (const g of splits) {
        const members = g.filter((x) => this.data.tabs[x]);
        if (members.length < 2 || members.some((x) => this.groupOf(x))) continue;
        (space.splits || (space.splits = [])).push(Object.assign(members, g.ratios && members.length === g.length ? { ratios: [...g.ratios] } : {}));
      }
      if (active && this.data.tabs[active] && !this.activeBySpace[space.id]) this.activeBySpace[space.id] = active;
      for (const w of windows.values()) if (w.data === this.data) w.layout();
      this.changed();
    };
  }

  askRename(id) {
    if (!this.sidebarVisible && !this.peek) this.toggleSidebar(true);
    setTimeout(() => {
      if (this.gone) return;
      const view = this.shellView;
      if (view.webContents.isDestroyed()) return;
      view.webContents.focus();
      view.webContents.send('edit', id);
    }, 60);
  }

  rename(id, name) {
    name = String(name || '').trim().slice(0, 80);
    const space = this.data.spaces.find((x) => x.id === id);
    const loc = space ? null : this.locate(id);
    if (!space && !loc) return;
    // Un onglet porte un titre personnalisé (vide : il reprend celui de la page) ;
    // un dossier ou un Espace garde son nom si la saisie est vide.
    const isTab = !space && loc.node.type !== 'folder';
    const named = space || loc.node;
    // L'onglet est relu à chaque fois : archivé puis rouvert, ce n'est plus le même objet.
    const get = () => (isTab ? (this.data.tabs[id] || {}).customTitle : named.name);
    const set = (v) => {
      const tab = isTab ? this.data.tabs[id] : null;
      if (!isTab) { if (v) named.name = v; } else if (!tab) return; else if (v) tab.customTitle = v; else delete tab.customTitle;
    };
    const before = get();
    set(name);
    const after = get();
    if (after !== before) this.record(space ? 'undo.renameSpace' : (isTab ? 'undo.renameTab' : 'undo.renameFolder'), () => set(before), () => set(after));
    this.changed();
  }

  // --- Espaces --------------------------------------------------------------
  switchSpace(id) {
    const i = this.data.spaces.findIndex((s) => s.id === id);
    if (i < 0 || id === this.spaceId) return;
    const from = this.data.spaces.findIndex((s) => s.id === this.spaceId);
    this.spaceDir = i > from ? 1 : -1;
    this.closePeek();
    this.htmlFullscreen = false;
    this.spaceId = id;
    if (this.findOpen) this.closeFind();
    this.layout();
    this.focusContent();
    this.remember();
    OrbeWindow.pushAll();
  }

  stepSpace(delta) {
    const spaces = this.data.spaces;
    const i = spaces.findIndex((s) => s.id === this.spaceId);
    const next = spaces[i + delta];
    if (next) this.switchSpace(next.id);
  }

  spaceAt(n) {
    const sp = this.data.spaces[n - 1];
    if (sp) this.switchSpace(sp.id);
  }

  // Panneau de création d'un Espace, comme dans Arc : nom, icône, couleur, profil, puis
  // « Créer ». Toutes les entrées passent par ici (menu, commande, « + », geste au bout de
  // la rangée, Bibliothèque) ; rien n'est créé avant la validation (`createSpace`).
  askNewSpace() {
    if (!this.shared) return false;
    if (this.modalMode === 'space') return true;
    if (!this.sidebarVisible) this.toggleSidebar(true);
    const used = new Set(this.data.spaces.map((s) => s.color));
    const tone = Number((store.state.window || {}).emojiTone) || 0;
    this.showModal('space', {
      colors: SPACE_COLORS,
      color: SPACE_COLORS.find((c) => !used.has(c)) || SPACE_COLORS[0],
      icon: '✨',
      tone: clamp(Math.floor(tone), 0, 5),
      profiles: this.data.profiles.map((p) => ({ id: String(p.id), name: String(p.name) })),
      profileId: this.space.profileId,
      x: this.sidebarWidth + 10,
    });
    return true;
  }

  // Ce que le panneau envoie, vérifié en entier avant de créer quoi que ce soit : nom
  // (80 caractères au plus ; vide : le nom par défaut), icône (un émoji, icons.js), couleur
  // (#rrggbb) ou thème prêt (theme.js), profil existant — ou 'new' : un profil neuf.
  // Renvoie null si une valeur est refusée.
  static checkSpace(a, profiles) {
    if (!a || typeof a !== 'object') return null;
    if (a.name != null && typeof a.name !== 'string') return null;
    const name = (a.name || '').replace(/\s+/g, ' ').trim();
    if (name.length > 80) return null;
    if (!icons.valid(a.icon)) return null;
    const out = { name, icon: a.icon, profileId: 'default' };
    if (a.preset != null) {
      if (typeof a.preset !== 'string' || !Theme.PRESETS.some((p) => p.id === a.preset)) return null;
      out.preset = a.preset;
    } else if (a.color != null) {
      if (!Theme.isHex(a.color)) return null;
      out.color = a.color.toLowerCase();
    }
    if (a.profileId === 'new') out.newProfile = true;
    else if (typeof a.profileId === 'string' && profiles.some((p) => p.id === a.profileId)) out.profileId = a.profileId;
    else return null;
    return out;
  }

  createSpace(a) {
    if (!this.shared || this.modalMode !== 'space') return false;
    const ok = OrbeWindow.checkSpace(a, this.data.profiles);
    if (!ok) return false;
    if (Number.isInteger(a.tone) && a.tone >= 0 && a.tone <= 5 && store.state.window) store.state.window.emojiTone = a.tone;
    this.hideModal();
    const space = this.newSpace(ok);
    // « Personnaliser le thème… » : l'Espace est créé, puis l'éditeur de thème s'ouvre sur lui.
    if (space && a.theme === true) this.openTheme();
    return !!space;
  }

  // Création directe (essais, import, et `createSpace` une fois le panneau validé). Sans
  // argument : Espace au nom par défaut, dont le champ de nom s'ouvre aussitôt.
  newSpace(opts) {
    if (!this.shared) return null;
    const o = opts || {};
    const used = new Set(this.data.spaces.map((s) => s.color));
    const color = o.color || SPACE_COLORS.find((c) => !used.has(c));
    const space = store.makeSpace(o.name || t('spaces.defaultName'), o.icon || '✨', color);
    if (o.preset) Theme.apply(space, { preset: o.preset });
    // Profil neuf demandé par le panneau : il naît avec l'Espace, et repart avec lui (⌘Z).
    const profile = o.newProfile ? { id: uid(), name: t('profiles.name', { n: this.data.profiles.length + 1 }) } : null;
    const addProfile = () => { if (profile && !this.data.profiles.includes(profile)) { this.data.profiles.push(profile); this.data.favs[profile.id] = this.data.favs[profile.id] || []; } };
    const dropProfile = () => {
      if (!profile || this.data.spaces.some((s) => s.profileId === profile.id) || (this.data.favs[profile.id] || []).length) return;
      const i = this.data.profiles.indexOf(profile);
      if (i >= 0) this.data.profiles.splice(i, 1);
      delete this.data.favs[profile.id];
    };
    addProfile();
    if (profile) space.profileId = profile.id;
    else if (o.profileId && this.data.profiles.some((p) => p.id === o.profileId)) space.profileId = o.profileId;
    // Comme dans Arc : le nouvel Espace se place juste après celui qui est affiché.
    this.data.spaces.splice(this.data.spaces.indexOf(this.space) + 1, 0, space);
    this.switchSpace(space.id);
    let back = null;
    this.record('undo.newSpace', () => { back = this.removeSpace(space.id); dropProfile(); this.changed(); }, () => { addProfile(); if (back) back(); });
    const entry = this.undoStack[this.undoStack.length - 1];
    if (entry && !opts) entry.created = space.id; // ⌘Z dans son champ de nom encore intact : voir commands.js
    this.changed();
    // « New Space Created », comme dans Arc — avec « Annuler » : un Espace créé par mégarde
    // se retire d'un clic, comme par ⌘Z.
    this.toast(t('toast.spaceCreated'), null, () => {
      const i = this.undoStack.indexOf(entry);
      if (i < 0 || !this.data.spaces.includes(space)) return;
      this.undoStack.splice(i, 1);
      this.mute(() => entry.undo());
      this.changed();
    }, { label: t('edit.undo'), stay: 5000 });
    if (!opts) this.askRename(space.id);
    return space;
  }

  // Réordonne les Espaces (glisser une pastille) : l'Espace `id` passe devant
  // celui qui occupe le rang `index`.
  moveSpace(id, index) {
    const spaces = this.data.spaces;
    const from = spaces.findIndex((s) => s.id === id);
    if (from < 0 || this.incognito || !Number.isFinite(index)) return;
    let to = clamp(Math.floor(index), 0, spaces.length);
    if (from < to) to -= 1;
    if (to === from) return;
    const put = (i) => {
      const j = spaces.findIndex((s) => s.id === id);
      if (j >= 0) spaces.splice(clamp(i, 0, spaces.length - 1), 0, spaces.splice(j, 1)[0]);
    };
    put(to);
    this.record('undo.moveSpace', () => put(from), () => put(to));
    this.remember();
    this.changed();
  }

  // En-tête de l'Espace (icône et nom, au-dessus des épinglés) : affiché ou masqué.
  toggleSpaceHeader(space = this.space) {
    space.hideHeader = !space.hideHeader;
    this.changed();
  }

  // --- Dossier ↔ Espace (« Turn into Folder » d'Arc, et son inverse) -----------------
  // Aucun onglet n'est fermé ni rechargé : seules les listes changent. Les deux
  // gestes sont l'inverse l'un de l'autre, ce qui sert aussi à ⌘Z.
  //
  // Dossier → Espace : le dossier devient un Espace placé juste après le sien (même
  // profil), ses lignes en deviennent les épinglés. `into` (pour défaire l'inverse) :
  // { space, index, today } — l'Espace d'origine, son rang, ses onglets du jour.
  folderToSpace(id, into) {
    const loc = this.locate(id);
    if (!this.shared || !loc || loc.node.type !== 'folder') return null;
    const d = this.data;
    const src = loc.space;
    const folder = loc.node;
    const place = this.placeOf(id);
    const used = new Set(d.spaces.map((s) => s.color));
    const sp = (into && into.space) || Object.assign(store.makeSpace(folder.name, folder.icon || '📁', SPACE_COLORS.find((c) => !used.has(c))), { profileId: src.profileId });
    if (d.spaces.includes(sp)) return null;
    loc.arr.splice(loc.index, 1);
    sp.name = folder.name;
    if (folder.icon) sp.icon = folder.icon;
    sp.pinned = folder.children;
    folder.children = [];
    sp.today = ((into && into.today) || []).filter((x) => src.today.includes(x));
    src.today = src.today.filter((x) => !sp.today.includes(x));
    d.spaces.splice(clamp(into && Number.isInteger(into.index) ? into.index : d.spaces.indexOf(src) + 1, 0, d.spaces.length), 0, sp);
    const ids = new Set([...walk(sp.pinned), ...sp.today]);
    this.carrySplits(src, sp, ids);
    for (const w of windows.values()) {
      if (w.data !== d) continue;
      const act = w.activeBySpace[src.id];
      if (act && ids.has(act)) { delete w.activeBySpace[src.id]; w.activeBySpace[sp.id] = act; }
    }
    if (sp.profileId !== src.profileId) for (const tid of ids) OrbeWindow.destroyView(tid);
    for (const w of windows.values()) if (w.data === d) w.layout();
    this.changed();
    return { space: sp, folder, place };
  }

  // Espace → dossier : l'Espace disparaît ; ses épinglés forment un dossier à son nom
  // dans l'Espace voisin (celui d'avant, sinon le suivant), ses onglets du jour
  // rejoignent ceux du voisin. `into` (pour défaire l'inverse) : { folder, place }.
  spaceToFolder(spaceId, into) {
    const d = this.data;
    const i = d.spaces.findIndex((s) => s.id === spaceId);
    if (!this.shared || i < 0 || d.spaces.length < 2) return null;
    const sp = d.spaces[i];
    const home = into && into.place ? d.spaces.find((s) => s.id === into.place.spaceId && s !== sp) : null;
    const dest = home || d.spaces[i - 1] || d.spaces[i + 1];
    const folder = (into && into.folder) || { type: 'folder', id: uid(), open: true, children: [] };
    folder.name = sp.name;
    folder.icon = sp.icon;
    folder.children = sp.pinned;
    sp.pinned = [];
    const today = [...sp.today];
    const ids = new Set([...walk(folder.children), ...today]);
    dest.today.push(...today);
    sp.today = [];
    if (home && into.place) this.restorePlaces([{ ...into.place, node: folder }]); else dest.pinned.push(folder);
    this.carrySplits(sp, dest, ids);
    d.spaces.splice(i, 1);
    for (const w of windows.values()) {
      if (w.data !== d) continue;
      const act = w.activeBySpace[sp.id];
      delete w.activeBySpace[sp.id];
      if (w.spaceId === sp.id) { w.spaceId = dest.id; if (act) w.activeBySpace[dest.id] = act; }
    }
    if (sp.profileId !== dest.profileId) for (const tid of ids) OrbeWindow.destroyView(tid);
    for (const w of windows.values()) if (w.data === d) w.layout();
    this.remember();
    this.changed();
    return { space: sp, index: i, today, folder };
  }

  // Les vues scindées dont tous les volets changent d'Espace le suivent.
  carrySplits(from, to, ids) {
    const moved = (from.splits || []).filter((g) => g.every((x) => ids.has(x)));
    if (!moved.length) return;
    from.splits = from.splits.filter((g) => !moved.includes(g));
    (to.splits || (to.splits = [])).push(...moved);
    for (const g of moved) {
      if (from.splitDirs && from.splitDirs[g[0]]) { (to.splitDirs || (to.splitDirs = {}))[g[0]] = from.splitDirs[g[0]]; delete from.splitDirs[g[0]]; }
    }
  }

  turnFolderIntoSpace(id) {
    const r = this.folderToSpace(id);
    if (!r) return false;
    this.switchSpace(r.space.id);
    let back = null;
    this.record('undo.folderToSpace',
      () => { back = this.spaceToFolder(r.space.id, { folder: r.folder, place: r.place }); },
      () => { if (back && this.folderToSpace(id, { space: r.space, index: back.index, today: back.today })) this.switchSpace(r.space.id); });
    return true;
  }

  turnSpaceIntoFolder(spaceId = this.spaceId) {
    const r = this.spaceToFolder(spaceId);
    if (!r) return false;
    this.record('undo.spaceToFolder',
      () => { if (this.folderToSpace(r.folder.id, { space: r.space, index: r.index, today: r.today })) this.switchSpace(r.space.id); },
      () => { this.spaceToFolder(spaceId, { folder: r.folder }); });
    return true;
  }

  // --- Icône d'un Espace, d'un dossier ou d'un onglet -----------------------------
  // Ce qui porte l'icône : l'Espace, le nœud du dossier, ou l'onglet.
  iconHolder(kind, id) {
    if (kind === 'space') return this.data.spaces.find((s) => s.id === id) || null;
    const loc = this.locate(id);
    if (!loc) return null;
    if (kind === 'folder') return loc.node.type === 'folder' ? loc.node : null;
    return kind === 'tab' && loc.node.type !== 'folder' ? this.data.tabs[id] : null;
  }

  // Sélecteur d'émojis (recherche, teintes de peau), à côté de la barre latérale.
  openIcons(kind, id) {
    const holder = this.iconHolder(kind, id);
    if (!holder) return;
    this.iconTarget = { kind, id };
    const tone = Number((store.state.window || {}).emojiTone) || 0;
    this.showModal('icons', { kind, current: holder.icon || '', tone: clamp(Math.floor(tone), 0, 5), x: this.sidebarVisible ? this.sidebarWidth + 10 : 20 });
  }

  // Choix fait dans le sélecteur : { emoji, tone }. L'émoji est vérifié (icons.js) ; vide, il
  // rend l'icône d'origine (icône du site, dossier) — un Espace garde toujours une icône.
  chooseIcon(a) {
    const target = this.iconTarget;
    if (!target || this.modalMode !== 'icons' || !a || typeof a !== 'object') return false;
    const emoji = icons.clean(a.emoji);
    if (emoji === null || (!emoji && target.kind === 'space')) return false;
    if (Number.isInteger(a.tone) && a.tone >= 0 && a.tone <= 5 && store.state.window) store.state.window.emojiTone = a.tone;
    this.hideModal();
    return this.setIcon(target.kind, target.id, emoji);
  }

  setIcon(kind, id, emoji) {
    const holder = this.iconHolder(kind, id);
    if (!holder || (emoji && !icons.valid(emoji))) return false;
    const before = holder.icon || '';
    if (before === emoji) return false;
    // L'onglet est relu à chaque fois : archivé puis rouvert, ce n'est plus le même objet.
    const put = (v) => { const h = this.iconHolder(kind, id); if (!h) return; if (v) h.icon = v; else delete h.icon; this.changed(); };
    put(emoji);
    this.record('undo.changeIcon', () => put(before), () => put(emoji));
    return true;
  }

  // « Réinitialiser le nom et l'icône » d'un onglet : il reprend le titre et l'icône de sa page.
  resetNameIcon(id) {
    const tab = this.data.tabs[id];
    if (!tab || (!tab.customTitle && !tab.icon)) return false;
    const was = { customTitle: tab.customTitle, icon: tab.icon };
    const put = (v) => { const x = this.data.tabs[id]; if (!x) return; for (const k of ['customTitle', 'icon']) { if (v[k]) x[k] = v[k]; else delete x[k]; } this.changed(); };
    put({});
    this.record('undo.resetNameIcon', () => put(was), () => put({}));
    return true;
  }

  // Section épinglée repliée : seul l'onglet affiché y reste visible.
  togglePinnedCollapsed(space = this.space) {
    space.pinnedCollapsed = !space.pinnedCollapsed;
    this.changed();
  }

  // « Afficher l'onglet dans la barre latérale » : la barre revient si elle est
  // masquée, les dossiers qui le contiennent s'ouvrent, la ligne défile à l'écran.
  revealTab(id = this.activeId) {
    const loc = id && this.locate(id);
    if (!loc || loc.node.type === 'folder') return;
    const group = this.groupOf(id);
    const row = group ? group[0] : id;
    if (loc.list === 'pinned') {
      const open = (nodes) => nodes.some((n) => (n.type === 'folder' ? open(n.children) && (n.open = true) : n.id === row));
      open(loc.space.pinned);
    }
    if (!this.sidebarVisible && !this.peek) this.toggleSidebar(true);
    this.reveal = { id: row, n: ((this.reveal && this.reveal.n) || 0) + 1 };
    this.changed();
  }

  async deleteSpace(id = this.spaceId) {
    const spaces = this.data.spaces;
    const space = spaces.find((s) => s.id === id);
    if (!space || spaces.length < 2 || this.incognito) return;
    // Espace vide (aucun onglet, aucun épinglé, aucun dossier) : rien à perdre, il part sans
    // question — et revient par ⌘Z. La question protège les onglets d'un Espace qui en a.
    const empty = !space.today.length && !space.pinned.length;
    const r = empty ? { response: 0 } : await dialog.showMessageBox(this.win, {
      type: 'warning',
      message: t('spaces.deleteConfirm', { name: space.name }),
      detail: t('spaces.deleteDetail'),
      buttons: [t('spaces.delete').replace('…', ''), t('dialog.cancel')],
      defaultId: 1,
      cancelId: 1,
    });
    if (r.response !== 0) return;
    let back = this.removeSpace(id);
    if (back) this.record('undo.deleteSpace', () => back(), () => { back = this.removeSpace(id) || back; });
  }

  // Supprime un Espace sans rien demander. Renvoie de quoi le rétablir : l'Espace
  // à son rang, avec ses épinglés, ses dossiers, ses onglets du jour, ses vues
  // scindées et son thème. Ses pages, elles, sont fermées : elles se rechargeront.
  removeSpace(id) {
    const spaces = this.data.spaces;
    const i = spaces.findIndex((s) => s.id === id);
    if (i < 0 || spaces.length < 2) return null;
    const space = spaces[i];
    const tabs = {};
    const archived = [];
    const splits = (space.splits || []).map((g) => Object.assign([...g], g.ratios ? { ratios: [...g.ratios] } : {}));
    const splitDirs = { ...(space.splitDirs || {}) };
    const active = this.activeBySpace[id];
    for (const tid of [...walk(space.pinned), ...space.today]) {
      const tab = this.data.tabs[tid];
      tabs[tid] = tab;
      // Comme dans Arc : tout va dans l'archive, les épinglés et le contenu des dossiers aussi.
      if (this.archives) {
        const top = store.state.archive[0];
        store.archive({ ...tab, title: tab.customTitle || tab.title, spaceId: space.id });
        if (store.state.archive[0] !== top) archived.push(store.state.archive[0]);
      }
      OrbeWindow.destroyView(tid);
      OrbeWindow.forget(tid, this.data);
      delete this.data.tabs[tid];
    }
    spaces.splice(i, 1);
    for (const w of windows.values()) {
      if (w.data !== this.data) continue;
      delete w.activeBySpace[id];
      if (w.spaceId === id) w.spaceId = spaces[Math.max(0, i - 1)].id;
      w.layout();
    }
    this.remember();
    this.changed();
    return () => {
      if (spaces.includes(space)) return;
      if (!this.data.profiles.some((p) => p.id === space.profileId)) space.profileId = 'default';
      spaces.splice(clamp(i, 0, spaces.length), 0, space);
      Object.assign(this.data.tabs, tabs);
      space.splits = splits.map((g) => Object.assign([...g], g.ratios ? { ratios: [...g.ratios] } : {}));
      space.splitDirs = { ...splitDirs };
      if (!this.incognito) store.state.archive = store.state.archive.filter((a) => !archived.includes(a));
      if (active && tabs[active]) this.activeBySpace[id] = active;
      this.switchSpace(id);
    };
  }

  // --- Profils --------------------------------------------------------------
  setProfile(profileId, space = this.space) {
    if (!this.shared || space.profileId === profileId || !this.data.profiles.some((p) => p.id === profileId)) return;
    for (const id of [...walk(space.pinned), ...space.today]) OrbeWindow.destroyView(id);
    space.profileId = profileId;
    for (const w of windows.values()) w.layout();
    this.changed();
  }

  newProfile() {
    if (!this.shared) return;
    const profile = { id: uid(), name: t('profiles.name', { n: this.data.profiles.length + 1 }) };
    this.data.profiles.push(profile);
    this.data.favs[profile.id] = [];
    this.setProfile(profile.id);
  }

  // Thème de l'Espace : couleurs (zéro à trois), intensité, texture, mode clair ou
  // sombre, icône. Chaque valeur est validée par theme.js ; le reste est ignoré.
  setTheme(patch) {
    Theme.apply(this.space, patch);
    this.changed();
  }

  setThemeExtra(patch) {
    this.setTheme(patch);
  }

  // --- Vue scindée ----------------------------------------------------------
  // `before` : le nouveau volet se place avant `a` (à sa gauche, ou au-dessus), et non après.
  splitWith(a, b, quiet, before = false) {
    if (a === b) return;
    let g = this.groupOf(a);
    if (g && !g.includes(b) && g.length >= 4) return this.toast(t('toast.splitMax'), 'error');
    const vertical = this.isVertical(g);
    if (g) this.setVertical(g, false);
    this.leaveSplit(b);
    g = this.groupOf(a);
    if (!g) {
      g = [a];
      const loc = this.locate(a);
      const sp = (loc && loc.space) || this.space;
      (sp.splits || (sp.splits = [])).push(g);
    }
    g.splice(g.indexOf(a) + (before ? 0 : 1), 0, b);
    delete g.ratios;
    this.setVertical(g, vertical);
    if (!quiet) this.activate(b);
  }

  // `side` (« Add Right/Left/Top/Bottom Split » d'Arc) : où se place le volet qu'on va choisir
  // par rapport à la page affichée ; sans côté, à sa droite (ou dessous, vue empilée).
  addSplit(side) {
    if (!this.activeId) return this.openCommand('new');
    const g = this.groupOf(this.activeId);
    if (g && g.length >= 4) return this.toast(t('toast.splitMax'), 'error');
    const closing = this.modalMode === 'command' && this.commandMode === 'split'; // second appel : la barre se referme
    this.openCommand('split');
    this.splitSide = !closing && ['left', 'right', 'top', 'bottom'].includes(side) ? side : null;
    return undefined;
  }

  // Place le volet `added` du côté voulu de `anchor` : avant ou après lui, et la vue
  // passe côte à côte (gauche, droite) ou empilée (haut, bas).
  placeSplit(anchor, added, side) {
    const g = this.groupOf(anchor);
    if (!side || !g || !g.includes(added) || anchor === added) return;
    const vertical = side === 'top' || side === 'bottom';
    this.setVertical(g, false);
    g.splice(g.indexOf(added), 1);
    g.splice(g.indexOf(anchor) + (side === 'left' || side === 'top' ? 0 : 1), 0, added);
    delete g.ratios;
    this.setVertical(g, vertical);
    this.layout();
    this.changed();
  }

  focusPane(n) {
    const id = this.visibleIds()[n - 1];
    if (id && this.visibleIds().length > 1) this.activate(id);
  }

  // ⌥clic sur un lien de la page `id` : le lien s'ouvre dans un nouveau volet, à sa droite.
  splitLink(id, url) {
    if (!webUrl(url) || !this.locate(id)) return undefined;
    const g = this.groupOf(id);
    if (g && g.length >= 4) return this.toast(t('toast.splitMax'), 'error');
    if (this.activeId !== id) this.activate(id);
    return this.newTab(url, { split: true, after: id });
  }

  // ⌥clic sur un onglet de la barre latérale : il rejoint la page affichée en vue scindée.
  splitTab(id) {
    const loc = this.locate(id);
    if (!loc || loc.node.type === 'folder') return;
    if (!this.activeId || id === this.activeId) return this.activate(id);
    if ((this.groupOf(this.activeId) || []).includes(id)) return this.activate(id);
    return this.splitWith(this.activeId, id);
  }

  // ⌃⇧] / ⌃⇧[ : volet suivant, précédent (en boucle).
  stepPane(delta) {
    const ids = this.visibleIds();
    if (ids.length < 2) return;
    const i = ids.indexOf(this.activeId);
    this.activate(ids[(i + delta + ids.length) % ids.length]);
  }

  closeSplitPane(id = this.activeId) {
    const g = id && this.groupOf(id);
    if (!g) return;
    const shown = g.includes(this.activeId);
    const other = (this.activeId !== id && shown && this.activeId) || g.find((x) => x !== id);
    this.leaveSplit(id);
    if (shown) this.activate(other); else { this.layout(); this.changed(); }
  }

  // Déplace un volet d'un cran (à gauche ou à droite ; en haut ou en bas pour une
  // vue empilée) : il échange sa place, et sa part de largeur, avec son voisin.
  movePane(id = this.activeId, delta = 1) {
    const g = id && this.groupOf(id);
    if (!g) return false;
    const i = g.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= g.length) return false;
    const vertical = this.isVertical(g);
    this.setVertical(g, false);
    [g[i], g[j]] = [g[j], g[i]];
    if (g.ratios && g.ratios.length === g.length) [g.ratios[i], g.ratios[j]] = [g.ratios[j], g.ratios[i]];
    this.setVertical(g, vertical);
    this.layout();
    this.changed();
    return true;
  }

  // « Agrandir ce volet » (Expand Current Split dans Arc) : le volet actif prend
  // toute la place que les autres peuvent lui laisser ; une seconde fois, les
  // volets retrouvent des parts égales.
  expandSplit(id = this.activeId) {
    const g = id && this.groupOf(id);
    if (!g) return;
    const n = g.length;
    const small = 0.15;
    const big = 1 - small * (n - 1);
    const i = g.indexOf(id);
    const already = g.ratios && g.ratios.length === n && Math.abs(g.ratios[i] - big) < 0.01;
    if (already) delete g.ratios;
    else g.ratios = g.map((x) => (x === id ? big : small));
    this.layout();
    this.changed();
  }

  // Menu « ⋯ » de la petite barre d'un volet.
  paneMenuTemplate(id) {
    const g = this.groupOf(id);
    const tab = this.data.tabs[id];
    if (!g || !tab) return [];
    const i = g.indexOf(id);
    const vertical = this.isVertical(g);
    const rt = live.get(id);
    return [
      { label: t('edit.copyUrl'), click: () => { clipboard.writeText(cleanUrl(tab.url)); this.toast(t('toast.urlCopied')); } },
      { label: t('ctx.reload'), enabled: !!rt, click: () => { if (rt && !rt.wc.isDestroyed()) rt.wc.reload(); } },
      // Propres à ce volet : sa copie dans un nouvel onglet, son propre son.
      { label: t('tabs.duplicate'), click: () => this.duplicate(id) },
      { label: t(tab.muted ? 'tabs.unmute' : 'tabs.mute'), click: () => this.toggleMute(id) },
      { type: 'separator' },
      { label: t(vertical ? 'pane.moveUp' : 'pane.moveLeft'), enabled: i > 0, click: () => this.movePane(id, -1) },
      { label: t(vertical ? 'pane.moveDown' : 'pane.moveRight'), enabled: i < g.length - 1, click: () => this.movePane(id, 1) },
      { label: t('view.expandSplit'), click: () => this.expandSplit(id) },
      { label: t(vertical ? 'pane.sideBySide' : 'pane.stacked'), click: () => { if (!g.includes(this.activeId)) this.activate(id); this.toggleSplitDirection(); } },
      { type: 'separator' },
      { label: t('view.separateSplit'), click: () => this.separateSplit(id) },
      { label: t('tabs.separateAll'), click: () => this.separateAll(id) },
      { label: t('view.closeSplit'), click: () => this.closeSplitPane(id) },
    ];
  }

  // « Séparer la page de la vue scindée » : la page affichée quitte la vue
  // scindée et reste à l'écran, seule ; les autres volets restent ensemble.
  separateSplit(id = this.activeId) {
    if (!id || !this.groupOf(id)) return;
    this.leaveSplit(id);
    this.activate(id);
  }

  // « Séparer tous les onglets » : la vue scindée est défaite, chaque page redevient un onglet.
  separateAll(id = this.activeId) {
    const g = id && this.groupOf(id);
    if (!g) return;
    const shown = g.includes(this.activeId) ? this.activeId : null;
    for (const x of [...g]) this.leaveSplit(x);
    if (shown) this.activate(shown); else { this.layout(); this.changed(); }
  }

  // --- Aperçu (Peek) --------------------------------------------------------
  // Une page ouverte par-dessus l'onglet courant, sans quitter celui-ci.
  // Elle se ferme d'un geste ou devient un vrai onglet.
  // Mouvements (animation du système, voir `place`) : la carte grandit depuis le
  // lien cliqué (ou depuis le centre), se réduit vers lui à la fermeture, et
  // s'étend jusqu'à la place de l'onglet quand elle en devient un.

  // Un lien qui s'ouvrirait en aperçu : 'peek', ou 'tab' pour un lien de réunion
  // (on y reste, micro ouvert : il lui faut un onglet), ou 'route' quand une règle
  // d'aiguillage lui donne une autre destination (Espace, petite fenêtre).
  peekTarget(url) {
    if (isMeetingUrl(url)) return 'tab';
    return !this.incognito && hooks.route(url) ? 'route' : 'peek';
  }

  // Place de la carte dans la zone des pages. Barre d'outils affichée : l'aperçu
  // montre aussi son adresse, au-dessus de la carte, qui descend d'autant.
  peekRect(rect = this.contentRect()) {
    const m = Math.round(Math.min(90, Math.max(44, rect.width * 0.07)));
    const top = this.toolbarShown ? PEEK_BAR : 16;
    return { x: rect.x + m, y: rect.y + top, width: Math.max(200, rect.width - 2 * m), height: Math.max(120, rect.height - top) };
  }

  // Rectangle de départ (et de retour) : une petite carte autour du point cliqué
  // (sans sortir de la zone des pages), ou la carte à peine réduite, centrée,
  // quand ce point n'est pas connu.
  peekSeed(final, point, zone = this.contentRect()) {
    const k = point ? 0.3 : 0.94;
    const width = Math.round(final.width * k);
    const height = Math.round(final.height * k);
    const cx = point ? point.x : final.x + final.width / 2;
    const cy = point ? point.y : final.y + final.height / 2;
    return {
      x: clamp(Math.round(cx - width / 2), zone.x, Math.max(zone.x, zone.x + zone.width - width)),
      y: clamp(Math.round(cy - height / 2), zone.y, Math.max(zone.y, zone.y + zone.height - height)),
      width,
      height,
    };
  }

  // Termine sur-le-champ le mouvement de l'aperçu encore en cours (fermeture ou
  // passage en onglet), pour qu'il n'y en ait jamais deux à la fois.
  flushPeek() {
    const job = this.peekJob;
    if (!job) return;
    this.peekJob = null;
    clearTimeout(job.timer);
    job.done();
  }

  peekOverlay(payload) {
    const wc = this.peekChrome && this.peekChrome.webContents;
    if (wc && !wc.isDestroyed()) wc.send('overlay', { mode: 'peek', ...payload });
  }

  // Adresse de l'aperçu, affichée au-dessus de la carte quand la barre d'outils l'est.
  peekAddress() {
    const st = this.peekState;
    const wc = this.peekChrome && this.peekChrome.webContents;
    if (!st || !wc || wc.isDestroyed()) return;
    const full = store.state.settings.showFullUrl !== false;
    wc.send('overlay', { mode: 'peek-url', text: this.toolbarShown ? (full ? st.url : suggest.strip(st.url)) : '' });
  }

  // `point` : d'où part la carte (coordonnées de la fenêtre) ; à défaut, le
  // dernier clic dans la page d'origine s'il vient d'avoir lieu.
  openPeek(url, fromId, options, point) {
    this.closePeek({ animate: false });
    const view = new WebContentsView(options || {
      webPreferences: { session: this.sessionFor(fromId), sandbox: true, contextIsolation: true, nodeIntegrationInSubFrames: true },
    });
    // Pas d'éclair blanc en thème sombre : la carte prend la teinte du thème
    // jusqu'à ce que la page ait de quoi s'afficher, puis le blanc habituel des pages.
    const dark = nativeTheme.shouldUseDarkColors;
    view.setBackgroundColor(dark ? '#1c1c1f' : '#ffffff');
    view.setBorderRadius(12);
    const wc = view.webContents;
    const src = live.get(fromId);
    if (!point && src && src.click && Date.now() - src.click.at < 1500 && src.owner === this) {
      const b = boundsOf(src.view);
      point = { x: b.x + src.click.x, y: b.y + src.click.y };
    }
    const state = (this.peekState = { view, from: fromId, url, title: '', handlers: [], point: point || null });
    const on = (event, fn) => { wc.on(event, fn); state.handlers.push([event, fn]); };
    if (dark) wc.once('dom-ready', () => { try { view.setBackgroundColor('#ffffff'); } catch {} });
    on('page-title-updated', (e, title) => { state.title = title; });
    on('page-favicon-updated', (e, icons) => { state.favicon = icons[0] || ''; });
    on('did-navigate', (e, u) => { state.url = u; this.peekAddress(); });
    on('did-navigate-in-page', (e, u, main) => { if (main) { state.url = u; this.peekAddress(); } });
    on('will-prevent-unload', (e) => { if (hooks.leave(this, wc)) e.preventDefault(); });
    on('destroyed', () => { if (this.peekState === state) this.closePeek(); });
    const guard = (e, u) => { if (isInternal(u)) e.preventDefault(); };
    on('will-navigate', guard);
    on('will-redirect', guard);
    on('context-menu', (e, params) => this.pageMenu({ wc, id: fromId }, params));
    on('before-input-event', (e, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') { e.preventDefault(); return this.dismissPeek(); }
      return this.onInput(e, input, false, wc);
    });
    wc.setWindowOpenHandler((d) => { if (/^https?:/i.test(d.url)) this.newTab(d.url); return { action: 'deny' }; });
    const ms = motion(MOTION.peekIn);
    if (!this.peekChrome) {
      this.peekChrome = this.makeUiView('overlay.html#peek');
      this.peekChrome.webContents.once('did-finish-load', () => { if (!this.gone && this.peekState) { this.peekOverlay({ ms }); this.peekAddress(); } });
    } else {
      this.peekOverlay({ ms });
      this.peekAddress();
    }
    this.win.contentView.addChildView(this.peekChrome);
    this.win.contentView.addChildView(view);
    if (this.findOpen) this.closeFind();
    this.layout();
    if (ms) {
      const final = this.peekRect();
      place(view, this.peekSeed(final, state.point));
      place(view, final, ms);
    }
    if (!options) wc.loadURL(url).catch(() => {});
    wc.focus();
    return view;
  }

  detachPeek() {
    this.flushPeek();
    const state = this.peekState;
    if (!state) return null;
    this.peekState = null;
    try { this.win.contentView.removeChildView(state.view); } catch {}
    try { this.win.contentView.removeChildView(this.peekChrome); } catch {}
    return state;
  }

  // La carte se réduit vers son point de départ et le voile s'efface (Échap, ⌘W,
  // clic à côté, changement d'onglet…). L'aperçu n'existe plus pour le reste du
  // code dès l'appel ; seule sa vue reste à l'écran le temps du mouvement.
  // `animate: false` : retrait immédiat (un autre aperçu prend la place, fenêtre fermée).
  closePeek({ animate = true } = {}) {
    // Page déjà disparue (fermée par elle-même) : rien à animer.
    const gone = (view) => !view.webContents || view.webContents.isDestroyed();
    const ms = animate && this.peekState && !this.win.isDestroyed() && !gone(this.peekState.view) ? motion(MOTION.peekOut) : 0;
    if (!ms) {
      const state = this.detachPeek();
      if (!state) return;
      if (!gone(state.view)) state.view.webContents.close({ waitForBeforeUnload: false });
      if (!this.win.isDestroyed()) this.focusContent();
      return;
    }
    this.flushPeek();
    const state = this.peekState;
    this.peekState = null;
    place(state.view, this.peekSeed(this.peekRect(), state.point), ms, 'ease-in');
    this.peekOverlay({ leaving: true, ms });
    const done = () => {
      if (!this.win.isDestroyed()) {
        try { this.win.contentView.removeChildView(state.view); } catch {}
        if (!this.peekState) { try { this.win.contentView.removeChildView(this.peekChrome); } catch {} }
      }
      if (!gone(state.view)) state.view.webContents.close({ waitForBeforeUnload: false });
    };
    this.peekJob = { done, timer: setTimeout(() => this.flushPeek(), ms) };
    this.focusContent();
  }

  // Fermeture interactive : un balayage à deux doigts vers la droite, sur un aperçu
  // qui n'a pas de page précédente, tire la carte (src/main/swipe.js). Elle suit
  // les doigts — déplacée seulement, jamais redimensionnée : sa page n'est pas
  // remise en page — et le voile s'éclaircit d'autant. `x` : déplacement en px.
  pullPeek(x) {
    const state = this.peekState;
    if (!state || this.peekJob || this.win.isDestroyed() || !(x >= 0)) return false;
    const final = this.peekRect();
    const dx = Math.round(Math.min(x, final.width * 0.6));
    if (state.pull === dx) return true;
    state.pull = dx;
    place(state.view, { ...final, x: final.x + dx });
    const wc = this.peekChrome && this.peekChrome.webContents;
    if (wc && !wc.isDestroyed()) wc.send('overlay', { mode: 'peek-pull', p: Math.min(1, dx / PEEK_PULL) });
    return true;
  }

  // Doigts levés avant le seuil : la carte revient à sa place, le voile aussi.
  releasePeek() {
    const state = this.peekState;
    if (!state || !state.pull) return false;
    state.pull = 0;
    const ms = motion(MOTION.peekBack);
    place(state.view, this.peekRect(), ms);
    const wc = this.peekChrome && this.peekChrome.webContents;
    if (wc && !wc.isDestroyed()) wc.send('overlay', { mode: 'peek-pull', p: 0, ms });
    return true;
  }

  // Transforme l'aperçu en onglet sans recharger la page : la carte s'étend
  // jusqu'à la place de l'onglet, la page quittée reste dessous pendant ce temps.
  expandPeek({ split = false } = {}) {
    this.flushPeek();
    const state = this.peekState;
    if (!state) return;
    const wc = state.view.webContents;
    const ms = wc.isDestroyed() || this.win.isDestroyed() ? 0 : motion(MOTION.peekExpand);
    if (!ms) this.detachPeek(); else this.peekState = null;
    if (wc.isDestroyed()) return;
    for (const [event, fn] of state.handlers) wc.off(event, fn);
    state.view.setBackgroundColor('#ffffff');
    const from = this.locate(state.from) ? state.from : null;
    const tab = this.createTab(wc.getURL() || state.url, { after: from });
    tab.title = state.title;
    tab.favicon = state.favicon || '';
    state.view.setBorderRadius(RADIUS);
    this.ensureView(tab.id, null, state.view);
    if (!this.incognito) store.visit(tab.url, tab.title, tab.favicon);
    if (ms) {
      this.growing = { view: state.view, ms, under: new Set(this.attached || []), started: false };
      this.peekOverlay({ leaving: true, ms });
      const done = () => {
        const grow = this.growing;
        this.growing = null;
        if (this.win.isDestroyed()) return;
        if (!this.peekState) { try { this.win.contentView.removeChildView(this.peekChrome); } catch {} }
        // La carte était au premier plan pour le mouvement : elle reprend le rang des pages.
        if (grow && this.attached && this.attached.has(grow.view)) this.win.contentView.addChildView(grow.view, 1);
        this.layout();
      };
      this.peekJob = { done, timer: setTimeout(() => this.flushPeek(), ms) };
    }
    if (split && from && this.activeId === from) this.splitWith(from, tab.id);
    else this.activate(tab.id);
  }

  // --- Vues flottantes ------------------------------------------------------
  showModal(mode, payload, focus = true) {
    // Demandée avant que la coque ait fini de charger : elle naît tout de suite, à part.
    if (!this.modal) this.makeModal();
    const shown = !!this.modalMode;
    this.modalMode = mode;
    const [W, H] = this.win.getContentSize();
    // Déjà affichée : ne pas la rattacher, cela lui ferait perdre le clavier.
    if (!shown) this.win.contentView.addChildView(this.modal); // repasse au premier plan
    this.modal.setBounds({ x: 0, y: 0, width: W, height: H });
    this.modal.setVisible(true);
    this.sendUi(this.modal, 'overlay', { mode, ...payload }, () => this.modalMode === mode);
    if (focus && !(shown && this.modal.webContents.isFocused())) this.modal.webContents.focus();
  }

  hideModal() {
    if (!this.modalMode) return;
    this.modalMode = null;
    this.switcher = null;
    this.modal.setVisible(false);
    this.modal.webContents.send('overlay', { mode: null });
    this.focusContent();
  }

  // 'new' : nouvel onglet ; 'edit' : modifie l'adresse de l'onglet actif ;
  // 'split' : ouvre le résultat dans un nouveau volet.
  openCommand(mode = 'new') {
    this.pinEdit = null; // voir `editPinned`
    if (mode === 'edit' && !this.activeId) mode = 'new';
    if (this.modalMode === 'command' && this.commandMode === mode) return this.hideModal();
    this.commandMode = mode;
    const tab = mode === 'edit' ? this.data.tabs[this.activeId] : null;
    const rect = this.contentRect();
    const [W] = this.win.getContentSize();
    this.showModal('command', {
      value: tab && !isInternal(tab.url) ? tab.url : '',
      items: this.suggestLocal(''),
      sites: palette.siteKeys(),
      centerX: Math.round(W / 2),
      anchor: mode === 'edit' && this.sidebarVisible ? { x: 8, y: 46, width: Math.max(460, this.sidebarWidth + 220) } : null,
    });
  }

  // « Edit Pinned Page → Edit… » d'Arc : la barre d'adresse s'ouvre sur l'adresse épinglée ;
  // l'adresse validée devient celle de l'épinglé (ou du favori), qui s'y rend.
  editPinned(id) {
    const tab = this.data.tabs[id];
    const loc = this.locate(id);
    if (!tab || !loc || loc.list === 'today' || !tab.homeUrl) return;
    if (this.activeId !== id) this.activate(id);
    if (this.modalMode === 'command') this.hideModal();
    this.openCommand('edit');
    this.sendUi(this.modal, 'overlay', { mode: 'command-value', value: tab.homeUrl }, () => this.modalMode === 'command');
    this.pinEdit = id;
  }

  commandList() {
    return palette.commandList(this);
  }

  // `scope` : 'actions' (⇥ sur une barre vide : les actions seules) ou { site } (recherche dans un site).
  suggestLocal(q, scope) {
    if (scope && scope.site) return palette.siteItems(scope.site, q);
    if (scope === 'actions') return suggest.local(q, { tabs: [], commands: this.commandList(), activeId: null, scope });
    const tabs = [];
    for (const sp of this.data.spaces) {
      for (const id of [...walk(sp.pinned), ...sp.today]) tabs.push(this.data.tabs[id]);
    }
    for (const list of Object.values(this.data.favs)) for (const id of list) tabs.push(this.data.tabs[id]);
    const items = suggest.local(q, { tabs, commands: this.commandList(), activeId: this.commandMode === 'edit' ? this.activeId : null });
    // Aucun onglet à proposer sur une barre vide : de quoi démarrer (aide, réglages).
    if (!items.length && !q.trim()) return palette.starters(this);
    return this.incognito ? items.filter((i) => i.kind !== 'history').map((i) => ({ ...i, favicon: '' })) : items;
  }

  async suggest(q, scope) {
    if (this.suggestAbort) this.suggestAbort.abort();
    const ctrl = (this.suggestAbort = new AbortController());
    const items = this.suggestLocal(q, scope);
    if (!this.incognito && !scope) {
      suggest.remote(q, ctrl.signal).then((more) => {
        if (ctrl.signal.aborted || !more.length || this.modalMode !== 'command' || this.gone || this.modal.webContents.isDestroyed()) return;
        const seen = new Set(items.map((i) => i.title.toLowerCase()));
        this.modal.webContents.send('suggest-more', { q, items: more.filter((m) => !seen.has(m.title.toLowerCase())) });
      });
    }
    return items;
  }

  runItem(item, { background = false } = {}) {
    const mode = this.commandMode;
    const side = mode === 'split' ? this.splitSide : null;
    this.splitSide = null;
    const anchor = this.activeId;
    const pinEdit = mode === 'edit' && this.pinEdit === this.activeId ? this.pinEdit : null;
    this.hideModal();
    this.pinEdit = null;
    if (!item) return;
    if (item.kind === 'command') return this.run(String(item.command), item.arg);
    if (item.kind === 'tab' && this.locate(item.tabId)) {
      if (mode === 'split' && this.activeId) { this.splitWith(this.activeId, item.tabId); return this.placeSplit(anchor, item.tabId, side); }
      return this.activate(item.tabId);
    }
    const target = item.url || item.title;
    if (!target) return;
    if (mode === 'edit' && this.activeId && !background) {
      // ⌘L puis Entrée sans rien changer : la page est actualisée, comme dans Arc.
      const home = pinEdit && item.kind !== 'tab' ? webUrl(suggest.resolve(target)) : null;
      if (home) {
        const tab = this.data.tabs[pinEdit];
        const before = tab.homeUrl;
        const put = (v) => { const x = this.data.tabs[pinEdit]; if (x) { x.homeUrl = v; this.changed(); } };
        if (before !== home) { put(home); this.record('undo.editPinned', () => put(before), () => put(home)); }
        return this.navigate(home);
      }
      if (item.kind === 'raw' && target === this.data.tabs[this.activeId].url && live.has(this.activeId)) return this.reload(false);
      return this.navigate(target);
    }
    const tab = this.newTab(target, { background, split: mode === 'split' });
    if (tab && side) this.placeSplit(anchor, tab.id, side);
  }

  run(name, arg) {
    return require('./commands').run(this, name, arg);
  }

  openTheme() {
    if (!this.sidebarVisible) this.toggleSidebar(true);
    const s = this.space;
    this.showModal('theme', { space: themeFields(s), icon: s.icon, dark: nativeTheme.shouldUseDarkColors, x: this.sidebarWidth + 10 });
  }

  // Bascule ⌃Tab : ordre d'utilisation récente, validée au relâchement de ⌃.
  switcherStep(delta) {
    if (!this.switcher) {
      const ids = this.orderedIds()
        .filter((id) => live.has(id) || this.space.today.includes(id))
        .sort((a, b) => (this.data.tabs[b].lastActiveAt || 0) - (this.data.tabs[a].lastActiveAt || 0))
        .slice(0, 8);
      if (ids.length < 2) return;
      this.switcher = { ids, index: 0 };
    }
    const s = this.switcher;
    s.index = (s.index + delta + s.ids.length) % s.ids.length;
    const items = s.ids.map((id) => {
      const tab = this.data.tabs[id];
      const thumb = live.get(id) && live.get(id).thumb;
      return { id, title: tab.customTitle || tab.title || suggest.strip(tab.url), favicon: this.incognito ? '' : tab.favicon, thumb: thumb ? 'data:image/jpeg;base64,' + thumb : '' };
    });
    // La vue de la bascule prend le clavier : c'est elle qui verra le
    // relâchement de ⌃ (remettre une vue au premier plan retire le clavier à la page).
    this.showModal('switcher', { items, index: s.index }, true);
  }

  // Dans la bascule : archive l'onglet désigné (un épinglé est seulement fermé).
  switcherClose() {
    const s = this.switcher;
    if (!s) return;
    const id = s.ids[s.index];
    s.ids.splice(s.index, 1);
    if (s.index >= s.ids.length) s.index = 0;
    if (id && this.data.tabs[id]) this.close(id);
    if (s.ids.length < 1) return this.hideModal();
    return this.switcherStep(0);
  }

  switcherCommit() {
    const s = this.switcher;
    if (!s) return;
    const id = s.ids[s.index];
    this.hideModal();
    if (id) this.activate(id);
  }

  // `page` : la page web qui a reçu la touche (onglet ou aperçu), s'il y en a une.
  onInput(e, input, fromUi, page) {
    // ⌃` : variante de ⌃Tab (comme dans Arc), pour les onglets récents.
    const backquote = input.type === 'keyDown' && input.control && !input.meta && !input.alt && (input.code === 'Backquote' || input.key === '`');
    // ⌘← / ⌘→ (macOS) : page précédente, suivante — sauf en train d'écrire, où
    // ces touches déplacent le curseur en début et en fin de ligne.
    if (page && platform.isMac && input.type === 'keyDown' && input.meta && !input.control && !input.alt && !input.shift && (input.key === 'ArrowLeft' || input.key === 'ArrowRight')) {
      this.arrowNav(page, input.key === 'ArrowLeft' ? -1 : 1);
    }
    if (backquote || (input.type === 'keyDown' && input.key === 'Tab' && input.control && !input.meta && !input.alt)) {
      // Dans une vue de l'interface, on laisse passer la touche : la bloquer ici
      // ferait aussi disparaître le relâchement de ⌃ qui valide la bascule.
      if (!fromUi) e.preventDefault();
      this.switcherStep(input.shift ? -1 : 1);
    } else if (input.type === 'keyUp' && input.key === 'Control' && this.switcher) {
      this.switcherCommit();
    } else if (input.type === 'keyDown' && this.switcher && input.control && String(input.key).toLowerCase() === 'w') {
      // ⌃ maintenu + W : ferme l'onglet désigné, la bascule reste ouverte.
      e.preventDefault();
      this.switcherClose();
    } else if (input.type === 'keyDown' && input.key === 'Escape') {
      if (this.switcher) this.hideModal();
      else if (this.escFullScreen(input)) e.preventDefault();
      else if (this.findOpen) this.closeFind();
      // Comme dans Arc : Échap arrête la page en cours de chargement.
      else if (!fromUi && this.activeRt && this.activeRt.loading && !this.activeRt.wc.isDestroyed()) this.activeRt.wc.stop();
    }
  }

  // Fenêtre en plein écran : Échap va d'abord à la page (ou à ce qui est ouvert) ;
  // doublé, ou maintenu, il fait sortir la fenêtre du plein écran (comme dans Arc).
  // Le plein écran d'une page (vidéo) garde le comportement du moteur : un Échap suffit.
  escFullScreen(input, now = Date.now()) {
    if (!this.win.isFullScreen() || this.htmlFullscreen) { this.escAt = 0; return false; }
    if (input.isAutoRepeat) {
      if (!this.escAt || now - this.escAt < ESC_HOLD) return false;
    } else {
      const doubled = !!this.escAt && now - this.escAt <= ESC_DOUBLE;
      this.escAt = now;
      if (!doubled) return false;
    }
    this.escAt = 0;
    this.win.setFullScreen(false);
    return true;
  }

  // ⌘← / ⌘→ hors d'un champ de saisie : page précédente ou suivante. La page est
  // interrogée (elle seule sait où est le curseur) ; sans réponse, rien ne bouge.
  async arrowNav(page, dir) {
    if (page.isDestroyed()) return false;
    const typing = await page.executeJavaScript('(() => { let e = document.activeElement; while (e && e.shadowRoot && e.shadowRoot.activeElement) e = e.shadowRoot.activeElement; return !!e && (e.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName) || e.tagName === "IFRAME"); })()').catch(() => true);
    if (typing || page.isDestroyed()) return false;
    const nav = page.navigationHistory;
    if (dir < 0 ? !nav.canGoBack() : !nav.canGoForward()) return false;
    if (dir < 0) nav.goBack(); else nav.goForward();
    return true;
  }

  // `text` : recherche posée d'avance dans le champ (« Utiliser la sélection pour rechercher »).
  // `replace` : la barre montre aussi « Remplacer par » (⌥⌘F, « Find and Replace » d'Arc).
  openFind(text, { replace = false } = {}) {
    const wc = this.activeWc;
    if (!wc) return;
    this.findReplace = !!replace;
    if (!this.findView) {
      this.findView = this.makeUiView('overlay.html#find');
      this.findView.setVisible(false);
    }
    this.findOpen = true;
    this.win.contentView.addChildView(this.findView);
    this.layout();
    this.findView.setVisible(true);
    const show = () => {
      if (this.gone || this.findView.webContents.isDestroyed()) return;
      this.findView.webContents.send('overlay', { mode: 'find', replace: this.findReplace, ...(typeof text === 'string' ? { text } : null) });
      this.findView.webContents.focus();
    };
    if (this.findView.webContents.isLoading()) this.findView.webContents.once('did-finish-load', show);
    else show();
  }

  find(text, { forward = true, next = false } = {}) {
    const wc = this.activeWc;
    if (!wc) return;
    this.findText = text;
    if (!text) { wc.stopFindInPage('clearSelection'); return this.sendFind({ matches: 0, activeMatchOrdinal: 0, finalUpdate: true }); }
    // Electron : findNext vaut true pour une nouvelle recherche.
    wc.findInPage(text, { forward, findNext: !next });
  }

  findStep(forward) {
    if (!this.findOpen) return this.openFind();
    if (this.findText) this.find(this.findText, { forward, next: true });
  }

  // Recherche dont on attend le résultat complet (remplacement) ; null si la page ne répond pas.
  findAwait(wc, text, options) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.findWaiter = null; resolve(null); }, 2000);
      this.findWaiter = (r) => { clearTimeout(timer); resolve(r); };
      wc.findInPage(text, options);
    });
  }

  // « Remplacer » : l'occurrence désignée par la recherche devient la sélection de la page ;
  // si elle se trouve dans un champ de saisie ou une zone de texte modifiable, la commande
  // d'édition « remplacer » y met le nouveau texte (annulable par ⌘Z dans la page), puis la
  // recherche passe à la suivante. Hors d'une zone modifiable, rien n'est changé.
  // `all` : toutes les occurrences, une à une, au plus autant qu'il y en avait au départ.
  // Renvoie le nombre de remplacements.
  async replaceFound(a) {
    const rt = this.activeRt;
    if (!rt || rt.wc.isDestroyed() || !this.findOpen || !this.findReplace || this.replacing || !a || typeof a !== 'object') return 0;
    const wc = rt.wc;
    const text = String(a.text || '').slice(0, 500);
    const by = String(a.with == null ? '' : a.with).slice(0, 5000);
    if (!text) return 0;
    this.replacing = true;
    let done = 0;
    try {
      let found = this.findText === text && this.findLast && this.findLast.matches ? this.findLast : await this.findAwait(wc, text, { forward: true, findNext: true });
      this.findText = text;
      const total = found ? found.matches : 0;
      const turns = a.all ? Math.min(total, REPLACE_MAX) : Math.min(total, 1);
      let patience = 1500; // ms passées à attendre une sélection, en tout
      for (let i = 0; i < turns && found && found.matches; i++) {
        wc.stopFindInPage('keepSelection');
        // La sélection est-elle l'occurrence, dans une zone modifiable ? `true` : oui ; `false` :
        // c'est l'occurrence, hors d'une zone modifiable ; `null` : la sélection n'est pas (encore)
        // l'occurrence. `skip` : on renonce, et on se place juste après.
        const selected = (skip) => wc.executeJavaScript(`(() => {
          const want = ${JSON.stringify(text.toLowerCase())};
          const e = document.activeElement;
          if (e && /^(INPUT|TEXTAREA)$/.test(e.tagName) && typeof e.selectionStart === 'number' && e.value.slice(e.selectionStart, e.selectionEnd).toLowerCase() === want) return !e.readOnly && !e.disabled;
          const s = getSelection();
          const node = s.rangeCount ? s.getRangeAt(0).commonAncestorContainer : null;
          const host = node && (node.nodeType === 1 ? node : node.parentElement);
          if (String(s).toLowerCase() === want) { if (host && host.isContentEditable) return true; if (${skip ? 'true' : 'false'}) s.collapseToEnd(); return false; }
          if (${skip ? 'true' : 'false'} && s.rangeCount) s.collapseToEnd();
          return null;
        })()`).catch(() => null);
        // La recherche annonce son résultat avant que la page ait posé la sélection sur
        // l'occurrence : sur une machine chargée, quatre questions de suite ne suffisaient pas,
        // l'occurrence était sautée et le tour perdu (la dernière n'était alors jamais atteinte).
        // On laisse donc un instant à la sélection ; si elle ne vient pas, la recherche est
        // reprise au même endroit (elle redésigne la même occurrence) et l'on redemande. Le tout
        // dans la limite d'une patience commune au remplacement (une occurrence dans un cadre
        // ne sera jamais la sélection de cette page).
        const ask = async () => {
          let r = null;
          for (let k = 0; r === null && !wc.isDestroyed(); k++) {
            r = await selected(false);
            if (r !== null || k >= 9 || (k >= 3 && patience <= 0)) break;
            if (k >= 3) { await new Promise((res) => setTimeout(res, 25)); patience -= 25; }
          }
          return r;
        };
        let editable = await ask();
        if (editable === null && patience > 0 && !wc.isDestroyed() && this.activeRt === rt && this.findOpen) {
          found = await this.findAwait(wc, text, { forward: true, findNext: true });
          if (!found || !found.matches) break;
          wc.stopFindInPage('keepSelection');
          editable = await ask();
        }
        if (editable !== true && !wc.isDestroyed()) editable = await selected(true);
        if (wc.isDestroyed() || this.activeRt !== rt || !this.findOpen) break;
        if (editable === true) {
          wc.replace(by);
          // La commande d'édition et la recherche suivante ne voyagent pas par le même canal : la
          // recherche pouvait arriver la première et laisser l'occurrence en place. On attend donc
          // que la page ait remplacé (la sélection n'est plus l'occurrence) avant de chercher la suite.
          let gone = false;
          for (let k = 0; k < 40 && !gone && !wc.isDestroyed(); k++) gone = (await selected(false)) !== true;
          if (gone) done += 1;
          if (wc.isDestroyed() || this.activeRt !== rt || !this.findOpen) break;
        }
        found = await this.findAwait(wc, text, { forward: true, findNext: true });
      }
    } finally { this.replacing = false; }
    if (!this.gone && (a.all || !done)) this.toast(t(done ? 'find.replaced' : 'find.replacedNone', { n: done }));
    return done;
  }

  sendFind(result) {
    if (result && result.finalUpdate) {
      this.findLast = result;
      if (this.findWaiter) { const done = this.findWaiter; this.findWaiter = null; done(result); }
    }
    if (this.findOpen && this.findView) this.findView.webContents.send('find-result', { matches: result.matches, current: result.activeMatchOrdinal });
  }

  closeFind() {
    if (!this.findOpen) return;
    this.findOpen = false;
    this.findReplace = false;
    this.findLast = null;
    this.findText = '';
    this.findView.setVisible(false);
    try { this.win.contentView.removeChildView(this.findView); } catch {}
    for (const id of this.visibleIds()) {
      const rt = live.get(id);
      if (rt && !rt.wc.isDestroyed()) rt.wc.stopFindInPage('clearSelection');
    }
    this.focusContent();
  }

  // Pendant qu'on glisse un onglet de la barre latérale, une zone de dépôt
  // couvre la page : y lâcher l'onglet crée une vue scindée.
  dragZone(on) {
    if (this.win.isDestroyed()) return;
    this.dragSince = on ? Date.now() : 0; // voir fillSpares
    if (!on) {
      const hide = () => { this.dropLinger = null; if (this.dropView && !this.win.isDestroyed()) { this.dropView.setVisible(false); try { this.win.contentView.removeChildView(this.dropView); } catch {} } };
      // Onglet lâché sur la page : la bulle rebondit à sa place, puis la zone se retire (ANI-12).
      // (La fin du glisser est annoncée deux fois — dépôt, puis fin : le rebond en cours va à son terme.)
      const wait = motion(DROP_BOUNCE);
      if (this.dropBounce && wait && this.dropView && !this.dropView.webContents.isDestroyed()) {
        this.dropView.webContents.send('overlay', { mode: 'drop', label: t('view.addSplit'), over: true, zone: this.dropBounce.zone, tab: this.dropBounce.tab, done: true });
        clearTimeout(this.dropLinger);
        this.dropLinger = setTimeout(hide, wait);
      } else if (!this.dropLinger) hide();
      this.dropBounce = null;
      clearTimeout(this.spareLater);
      this.fillSpares();
      return;
    }
    clearTimeout(this.dropLinger);
    this.dropLinger = null;
    if (!this.activeId || this.peekState || this.modalMode) return;
    const show = () => {
      if (this.win.isDestroyed() || this.dropView.webContents.isDestroyed()) return;
      this.dropView.setBounds(this.contentRect());
      this.dropView.setBorderRadius(RADIUS);
      this.win.contentView.addChildView(this.dropView);
      this.dropView.setVisible(true);
      this.dropView.webContents.send('overlay', { mode: 'drop', label: t('view.addSplit') });
    };
    if (!this.dropView) {
      this.dropView = this.makeUiView('overlay.html#drop');
      this.dropView.setVisible(false);
      this.dropView.webContents.once('did-finish-load', show);
    } else show();
  }

  // Volet visé par un point de la fenêtre, et de quel côté : la moitié gauche
  // (haute, pour une vue empilée) place le nouvel onglet avant lui, l'autre après.
  // Rend aussi la zone à éclairer, dans le repère de la zone des pages.
  dropTargetAt(x, y) {
    const ids = this.visibleIds();
    if (!ids.length) return null;
    const rect = this.contentRect();
    const panes = this.paneRects(rect, ids);
    let i = panes.findIndex((p) => x >= p.x && x < p.x + p.width + GAP && y >= p.y && y < p.y + p.height + GAP);
    if (i < 0) i = Math.max(0, ids.indexOf(this.activeId));
    const p = panes[i];
    // Page seule : les quatre côtés (comme dans Arc). Le quart haut ou bas de la page
    // empile le nouvel onglet au-dessus ou au-dessous ; le reste le place à gauche ou à
    // droite. Vue déjà scindée : elle garde son sens (côte à côte, ou empilée).
    const band = ids.length === 1 ? (y - p.y) / Math.max(1, p.height) : 0.5;
    const vertical = ids.length > 1 ? !!p.vertical : band < DROP_EDGE || band > 1 - DROP_EDGE;
    const before = vertical ? y < p.y + p.height / 2 : x < p.x + p.width / 2;
    const zone = vertical
      ? { x: p.x - rect.x, y: (before ? p.y : p.y + p.height / 2) - rect.y, w: p.width, h: p.height / 2 }
      : { x: (before ? p.x : p.x + p.width / 2) - rect.x, y: p.y - rect.y, w: p.width / 2, h: p.height };
    return { id: ids[i], before, vertical, zone: { x: Math.round(zone.x), y: Math.round(zone.y), w: Math.round(zone.w), h: Math.round(zone.h) } };
  }

  // Survol pendant un glisser : la zone de dépôt éclaire le côté visé.
  dragZoneOver(a) {
    if (!this.dropView || this.dropView.webContents.isDestroyed()) return;
    const at = a && typeof a === 'object' && Number.isFinite(a.x) && Number.isFinite(a.y) ? this.dropTargetAt(a.x, a.y) : null;
    this.dropView.webContents.send('overlay', { mode: 'drop', label: t('view.addSplit'), over: !!a, zone: at ? at.zone : null, tab: a && typeof a === 'object' ? this.dropBubble(a.id) : null });
  }

  // Ce que montre la bulle de l'onglet glissé au-dessus de la page : son titre et son icône.
  // L'identifiant vient de l'interface : il doit désigner un onglet de cette fenêtre.
  dropBubble(id) {
    const loc = typeof id === 'string' ? this.locate(id) : null;
    const tab = loc && loc.node.type !== 'folder' ? this.data.tabs[id] : null;
    if (!tab) return null;
    return { title: String(tab.customTitle || tab.title || tab.url || '').slice(0, 120), favicon: this.incognito ? '' : (webUrl(tab.favicon) || ''), icon: tab.icon || '' };
  }

  // `at` : point du dépôt dans la fenêtre ; sans lui, le nouvel onglet se place après le volet actif.
  dropSplit(id, at) {
    const loc = this.locate(id);
    const target = loc && loc.node.type !== 'folder' && this.activeId && at && Number.isFinite(at.x) && Number.isFinite(at.y) ? this.dropTargetAt(at.x, at.y) : null;
    // Dépôt qui va changer la vue : la bulle rebondit là où l'onglet se pose.
    this.dropBounce = target && id !== target.id && this.dropView && this.dropView.getVisible() ? { zone: target.zone, tab: this.dropBubble(id) } : null;
    this.dragZone(false);
    if (!loc || loc.node.type === 'folder' || !this.activeId) return;
    const anchor = target ? target.id : this.activeId;
    if (id === anchor) return;
    // Onglet déjà dans cette vue scindée : il change seulement de place.
    const g = this.groupOf(anchor);
    if (g && g.includes(id)) {
      const vertical = this.isVertical(g);
      this.setVertical(g, false);
      g.splice(g.indexOf(id), 1);
      g.splice(g.indexOf(anchor) + (target && target.before ? 0 : 1), 0, id);
      delete g.ratios;
      this.setVertical(g, vertical);
      return this.activate(id);
    }
    const alone = !g;
    this.splitWith(anchor, id, true, !!(target && target.before));
    // Lâché en haut ou en bas d'une page seule : la vue est empilée.
    const made = this.groupOf(anchor);
    if (!made || !made.includes(id)) return undefined; // vue déjà pleine : rien n'a changé
    if (alone && target && target.vertical) this.setVertical(made, true);
    return this.activate(id);
  }

  // --- Onglet glissé hors de la fenêtre -------------------------------------
  // Lâché hors de toute fenêtre d'Orbe : il s'ouvre dans une nouvelle fenêtre, posée sous
  // le pointeur. Lâché sur une autre fenêtre ordinaire : c'est elle qui l'affiche. Les
  // fenêtres ordinaires montrent les mêmes Espaces : l'onglet ne change pas de liste, il
  // change de fenêtre. Le point vient du système (jamais de l'interface) ; `pt` sert aux essais.
  tearOff(ids, pt = hooks.cursor()) {
    ids = this.checkIds(ids);
    if (!ids.length || !this.shared || !pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return null;
    const inside = (w) => { const b = w.win.getBounds(); return pt.x >= b.x && pt.x < b.x + b.width && pt.y >= b.y && pt.y < b.y + b.height; };
    if (inside(this)) return null;
    const other = OrbeWindow.all.find((w) => w !== this && w.shared && !w.win.isDestroyed() && w.win.isVisible() && !w.win.isMinimized() && inside(w));
    if (other) return other.adopt(ids, this);
    const from = this.win.getBounds();
    const w = new OrbeWindow();
    const area = screen.getDisplayNearestPoint({ x: Math.round(pt.x), y: Math.round(pt.y) }).workArea;
    const width = Math.min(from.width, area.width);
    const height = Math.min(from.height, area.height);
    w.win.setBounds({
      x: clamp(Math.round(pt.x - TEAR.x), area.x, area.x + area.width - width),
      y: clamp(Math.round(pt.y - TEAR.y), area.y, area.y + area.height - height),
      width,
      height,
    });
    w.adopt(ids, this);
    return w;
  }

  // Affiche ici des onglets venus d'une autre fenêtre ordinaire (`from`) : celle-ci passe
  // d'abord à un autre onglet, pour ne pas rester sur une page vide. Si les deux fenêtres
  // montrent des Espaces différents, la fenêtre d'arrivée passe à l'Espace des onglets.
  adopt(ids, from) {
    if (!this.shared || !from || from === this || !from.shared) return null;
    ids = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && this.data.tabs[id] && this.locate(id) && this.locate(id).node.type !== 'folder');
    if (!ids.length) return null;
    for (const id of ids) {
      if (!from.visibleIds().includes(id)) continue;
      const loc = from.locate(id);
      const space = (loc && loc.space) || from.space;
      from.leaveSplit(id);
      const next = from.nextActiveAfter(id, space);
      if (next && next !== id && !ids.includes(next)) from.activate(next);
      else { delete from.activeBySpace[space.id]; from.layout(); from.changed(); }
    }
    this.activate(ids[0]);
    if (this.win.isMinimized()) this.win.restore();
    this.win.focus();
    return this;
  }

  // Adresse du lien survolé, en bas à gauche de la page.
  linkStatus(rt, url) {
    if (this.win.isDestroyed() || !this.visibleIds().includes(rt.id)) return;
    clearTimeout(this.statusTimer);
    clearTimeout(this.statusGrow);
    const hide = () => {
      clearInterval(this.statusPoll);
      this.statusPoll = null;
      this.status = null;
      if (!this.statusView || this.win.isDestroyed()) return;
      this.statusView.setVisible(false);
      try { this.win.contentView.removeChildView(this.statusView); } catch {}
    };
    if (!url) { this.statusTimer = setTimeout(hide, 120); return; }
    // La pastille : courte d'abord ; le pointeur resté sur le lien, elle s'étend à
    // toute l'adresse ; et elle s'écarte quand le pointeur vient sur elle.
    const rect = (st) => {
      const b = boundsOf(st.rt.view);
      const width = Math.round(Math.min(st.width, b.width - 16));
      return { x: st.side === 'left' ? b.x + 6 : b.x + b.width - 6 - width, y: b.y + b.height - STATUS.height - 4, width, height: STATUS.height };
    };
    const dodge = () => {
      const st = this.status;
      if (!st || this.win.isDestroyed() || st.rt.wc.isDestroyed()) return hide();
      const p = this.statusPointer();
      const r = rect(st);
      if (!p || p.x < r.x - STATUS.margin || p.x > r.x + r.width + STATUS.margin || p.y < r.y - STATUS.margin || p.y > r.y + r.height + STATUS.margin) return;
      // Trop large pour s'écarter d'un côté à l'autre : elle redevient courte d'abord.
      if (r.width > boundsOf(st.rt.view).width / 2 - STATUS.margin) st.width = st.short;
      st.side = st.side === 'left' ? 'right' : 'left';
      st.dodged += 1;
      place(this.statusView, rect(st), motion(STATUS.dodge));
    };
    const show = () => {
      if (this.win.isDestroyed() || this.statusView.webContents.isDestroyed() || rt.wc.isDestroyed()) return;
      const b = boundsOf(rt.view);
      const full = Math.min(b.width - 16, Math.max(120, 14 + url.length * 6.6));
      const short = Math.min(full, STATUS.short);
      const was = this.status;
      const st = (this.status = { rt, url, full, short, width: short, side: was && was.rt === rt ? was.side : 'left', dodged: 0 });
      place(this.statusView, rect(st));
      this.win.contentView.addChildView(this.statusView);
      this.statusView.setVisible(true);
      this.statusView.webContents.send('overlay', { mode: 'status', text: url });
      if (full > short) {
        this.statusGrow = setTimeout(() => {
          if (this.status !== st || this.win.isDestroyed() || this.statusView.webContents.isDestroyed()) return;
          st.width = full;
          place(this.statusView, rect(st), motion(STATUS.grow));
        }, STATUS.expandAfter);
      }
      if (!this.statusPoll) { this.statusPoll = setInterval(dodge, STATUS.poll); if (this.statusPoll.unref) this.statusPoll.unref(); }
      dodge();
    };
    if (!this.statusView) {
      this.statusView = this.makeUiView('overlay.html#status');
      this.statusView.setVisible(false);
      this.statusView.webContents.once('did-finish-load', show);
    } else if (!this.statusView.webContents.isLoading()) show();
  }

  // Pointeur dans le repère du contenu de la fenêtre (null s'il est ailleurs).
  statusPointer() {
    try {
      const p = screen.getCursorScreenPoint();
      const c = this.win.getContentBounds();
      return { x: p.x - c.x, y: p.y - c.y };
    } catch { return null; }
  }

  // `sound` : son qui accompagne le message (« error » pour un refus).
  // `action` : ce que fait un clic sur le message (aller à l'onglet qui vient de
  // s'ouvrir…) ; sans action, le clic le fait seulement disparaître.
  // `action` : ce que fait un clic sur le message ; `label` : le nom de cette action, montré
  // comme un bouton ; `stay` : durée d'affichage (ms).
  toast(text, sound, action, { label = '', stay = 2100 } = {}) {
    if (this.win.isDestroyed()) return;
    if (sound) this.sound(sound);
    this.toastAction = typeof action === 'function' ? action : null;
    this.toastShown = { text, label: this.toastAction ? label : '' };
    const send = () => {
      if (this.gone || this.toastView.webContents.isDestroyed()) return;
      this.win.contentView.addChildView(this.toastView);
      this.layout();
      this.toastView.setVisible(true);
      this.toastView.webContents.send('overlay', { mode: 'toast', text, action: !!this.toastAction, label: this.toastAction ? String(label) : '', stay });
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.hideToast(), stay);
    };
    if (!this.toastView) {
      this.toastView = this.makeUiView('overlay.html#toast');
      this.toastView.setVisible(false);
      this.toastView.webContents.once('did-finish-load', send);
    } else if (this.toastView.webContents.isLoading()) {
      this.toastView.webContents.once('did-finish-load', send);
    } else send();
  }

  hideToast() {
    clearTimeout(this.toastTimer);
    this.toastAction = null;
    if (this.win.isDestroyed() || !this.toastView) return;
    this.toastView.setVisible(false);
    try { this.win.contentView.removeChildView(this.toastView); } catch {}
  }

  // Clic sur le message : son action, s'il en a une, puis il disparaît.
  toastClick() {
    const action = this.toastAction;
    this.hideToast();
    if (action) action();
  }

  // --- Actions sur la page --------------------------------------------------
  copyUrl(markdown) {
    const tab = this.activeId && this.data.tabs[this.activeId];
    if (!tab) return;
    const url = cleanUrl(tab.url);
    clipboard.writeText(markdown ? mdLink(tab.title, url) : url);
    this.toast(t(markdown ? 'toast.markdownCopied' : 'toast.urlCopied'));
  }

  // Copie la sélection sous forme de citation Markdown, avec sa source.
  // `from` : la page d'où vient la sélection (menu de page d'un volet ou d'un aperçu) ; sinon l'onglet actif.
  async copyQuote(from) {
    const wc = from || (this.activeRt && this.activeRt.wc);
    if (!wc || wc.isDestroyed()) return;
    const mine = !from || (this.activeRt && this.activeRt.wc === from);
    const tab = mine ? this.activeId && this.data.tabs[this.activeId] : { url: wc.getURL(), title: wc.getTitle() };
    if (!tab) return;
    const text = String(await wc.executeJavaScript('String(getSelection())').catch(() => '')).trim();
    if (!text) return mine ? this.copyUrl(true) : undefined;
    const quote = text.split(/\n+/).map((l) => '> ' + l).join('\n');
    const url = cleanUrl(tab.url);
    clipboard.writeText(`${quote}\n>\n> — ${mdLink(tab.title, url)}`);
    this.toast(t('toast.quoteCopied'));
    return undefined;
  }

  zoom(delta) {
    const wc = this.activeWc;
    if (!wc) return;
    wc.setZoomLevel(delta === 0 ? 0 : clamp(wc.getZoomLevel() + delta, -4, 5));
    this.toast(`Zoom ${Math.round(wc.getZoomFactor() * 100)} %`);
  }

  // Son d'interface, joué par la coque (réglages « Sons » : voir sounds.js).
  sound(name) {
    sounds.play(this, name);
  }

  // ⇧⌘2, comme dans Arc : on choisit une zone (Entrée ou un clic = la page
  // visible, Échap annule), puis ce qu'on en fait.
  async capture(opts = {}) {
    const wc = this.activeWc;
    if (!wc) return undefined;
    const easels = require('./easels');
    const area = opts.area !== undefined ? opts.area : await easels.pickArea(wc, t('capture.hint'));
    if (!area || wc.isDestroyed()) return undefined;
    const rect = area === 'full' ? undefined : area;
    const image = await wc.capturePage(rect).catch(() => null);
    if (!image || image.isEmpty()) return undefined;
    this.sound('capture');
    const png = image.toPNG();
    const copy = () => { clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]).catch(() => {}); };
    const save = () => {
      const stamp = captureStamp();
      require('./library').keepCapture(`Orbe ${stamp}.png`, png, { incognito: !this.shared });
    };
    const done = (what) => {
      if (what === 'copy') { copy(); this.toast(t('capture.copied')); }
      else if (what === 'save') { save(); this.toast(t('capture.saved')); }
      else if (what === 'easel') {
        // Le tableau attend la zone en pixels de la page (avant zoom).
        const k = wc.getZoomFactor() || 1;
        easels.capture(this, rect ? { rect: { x: rect.x / k, y: rect.y / k, width: rect.width / k, height: rect.height / k } } : { full: true });
      }
      else { copy(); save(); this.toast(t('toast.captured')); }
      return what;
    };
    if (opts.then) return done(opts.then);
    // Zone choisie : petit menu à l'endroit de la sélection.
    const b = this.activeRt && this.activeRt.wc === wc ? boundsOf(this.activeRt.view) : { x: 0, y: 0 };
    this.menuOpen = true;
    Menu.buildFromTemplate([
      { label: t('capture.copy'), click: () => done('copy') },
      { label: t('capture.save'), click: () => done('save') },
      { label: t('capture.both'), click: () => done('both') },
      { type: 'separator' },
      { label: t('easel.capture'), enabled: !this.incognito, click: () => done('easel') },
    ]).popup({ window: this.win, x: Math.round(b.x + (rect ? rect.x + rect.width / 2 : 40)), y: Math.round(b.y + (rect ? rect.y + rect.height : 40) + 6), callback: () => { this.menuOpen = false; } });
    return 'menu';
  }

  // Capture « en portrait » : la page visible posée sur un fond aux couleurs de
  // l'Espace (src/main/portrait.js). Copiée et enregistrée, comme une capture entière.
  // Seule la page est photographiée : jamais une feuille d'Orbe posée dessus.
  async capturePortrait(opts = {}) {
    const wc = this.activeWc;
    if (!wc) return null;
    const image = opts.image || await wc.capturePage().catch(() => null);
    const out = require('./portrait').compose(image, { color: this.space.color, dark: nativeTheme.shouldUseDarkColors });
    if (!out) return null;
    this.sound('capture');
    const png = out.toPNG();
    if (opts.write !== false) {
      clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]).catch(() => {});
      require('./library').keepCapture(`Orbe ${captureStamp()}.png`, png, { incognito: !this.shared });
    }
    this.toast(t('toast.captured'));
    return out;
  }

  // Capture de la page entière, au-delà de la zone visible.
  async captureFull() {
    const wc = this.activeWc;
    if (!wc) return;
    const dbg = wc.debugger;
    hooks.unshield(wc); // débogueur tenu un instant par Orbe (unload.js) : il le rend
    if (dbg.isAttached()) return this.capture();
    try {
      dbg.attach('1.3');
      const metrics = await dbg.sendCommand('Page.getLayoutMetrics');
      const size = metrics.cssContentSize || metrics.contentSize;
      const shot = await dbg.sendCommand('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: Math.ceil(size.width), height: Math.min(Math.ceil(size.height), 20000), scale: 1 },
      });
      const png = Buffer.from(shot.data, 'base64');
      clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]).catch(() => {});
      const stamp = captureStamp();
      require('./library').keepCapture(`Orbe ${stamp}.png`, png, { incognito: !this.shared });
      this.toast(t('toast.captured'));
    } catch (err) {
      console.error('[orbe] capture', err);
    } finally {
      try { dbg.detach(); } catch {}
    }
    return undefined;
  }

  async savePage() {
    const wc = this.activeWc;
    if (!wc) return;
    const name = (wc.getTitle() || 'page').replace(/[/:\\]/g, '-').slice(0, 80);
    const r = await dialog.showSaveDialog(this.win, { defaultPath: path.join(app.getPath('downloads'), name + '.html') });
    if (r.canceled || !r.filePath) return undefined;
    const url = wc.getURL();
    try { await wc.savePage(r.filePath, 'HTMLComplete'); } catch { return undefined; }
    // La page enregistrée (et son dossier « …_files ») vient d'Internet : Electron ne
    // l'annonce pas comme un téléchargement, elle est donc marquée ici.
    return require('./downloads').markTree(r.filePath, url, !this.incognito);
  }

  async clearAndReload(what) {
    const wc = this.activeWc;
    if (!wc) return;
    if (what === 'cache') await wc.session.clearCache();
    else {
      let origin = '';
      try { origin = new URL(wc.getURL()).origin; } catch {}
      if (origin) await wc.session.clearStorageData({ origin, storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'] });
    }
    wc.reloadIgnoringCache();
  }

  openInternal(page) {
    if (!INTERNAL_PAGES.has(String(page).split(/[#?]/)[0])) return undefined;
    const url = INTERNAL + page;
    const base = url.split('#')[0];
    for (const id of Object.keys(this.data.tabs)) {
      if (this.data.tabs[id].internal && this.data.tabs[id].url.split('#')[0] === base && this.locate(id)) {
        this.activate(id);
        const rt = live.get(id);
        if (rt) rt.wc.loadURL(url).catch(() => {});
        return this.data.tabs[id];
      }
    }
    const tab = this.createTab(url);
    tab.internal = true;
    this.activate(tab.id);
    return tab;
  }

  // Active ou coupe le bloqueur pour le site affiché, puis recharge la page.
  toggleSiteBlocking() {
    const tab = this.activeId && this.data.tabs[this.activeId];
    if (!tab || !/^https?:/i.test(tab.url)) return;
    const allowed = adblock.isSiteAllowed(tab.url);
    adblock.allowSite(tab.url, !allowed);
    this.toast(t(allowed ? 'adblock.onSite' : 'adblock.offSite', { site: suggest.strip(new URL(tab.url).origin) }));
    this.reload(false);
    OrbeWindow.pushAll();
  }

  shieldMenu() {
    this.popup(this.shieldMenuTemplate());
  }

  // Active ou coupe le Boost du site affiché (case du centre de contrôle).
  toggleBoost() {
    const tab = this.activeId && this.data.tabs[this.activeId];
    const host = tab && !this.incognito ? boosts.hostOf(tab.url) : '';
    if (!boosts.has(host)) return;
    // Boost importé, pas encore relu : l'éditeur s'ouvre sur ce site, qui propose la relecture.
    if (boosts.get(host).review) { this.run('boost'); return; }
    boosts.set(host, { enabled: !boosts.get(host).enabled });
    applyBoosts(host);
    OrbeWindow.pushAll();
  }

  // Clic droit sur la barre d'outils : adresse entière ou non, copie, capture, partage.
  toolbarMenuTemplate() {
    const tab = this.activeId && this.data.tabs[this.activeId];
    const web = !!tab && !!webUrl(tab.url);
    const full = store.state.settings.showFullUrl !== false;
    const { setSetting } = require('./commands');
    return [
      { label: t('tb.showFullUrl'), type: 'checkbox', checked: full, click: () => setSetting('showFullUrl', !full) },
      { type: 'separator' },
      { label: t('edit.copyUrl'), enabled: !!tab, click: () => this.copyUrl(false) },
      { label: t('edit.copyUrlMarkdown'), enabled: !!tab, click: () => this.copyUrl(true) },
      { label: t('file.capture').replace('…', ''), enabled: !!tab, click: () => this.capture() },
      // Feuille de partage du système (macOS).
      { label: t('tb.share'), visible: platform.isMac, enabled: web, click: () => this.share() },
      { type: 'separator' },
      { label: t('view.hideToolbar'), enabled: !!store.state.settings.showToolbar, click: () => setSetting('showToolbar', false) },
    ];
  }

  share() {
    const tab = this.activeId && this.data.tabs[this.activeId];
    if (!tab || !webUrl(tab.url) || !platform.isMac) return;
    try { new (require('electron').ShareMenu)({ urls: [cleanUrl(tab.url)] }).popup({ window: this.win }); } catch {}
  }

  shieldMenuTemplate() {
    const tab = this.activeId && this.data.tabs[this.activeId];
    const on = store.state.settings.adblock;
    const web = !!tab && /^https?:/i.test(tab.url);
    const wc = this.activeWc;
    const n = wc ? (adblock.stats().blockedByTab.get(wc.id) || 0) : 0;
    // Extensions installées : un clic ouvre leur fenêtre, ancrée sous l'adresse.
    let actions = [];
    try { actions = require('./ext-host').actionsFor(this) || []; } catch {}
    const extItems = actions.map((x) => ({
      label: x.badgeText ? `${x.title}  (${x.badgeText})` : x.title,
      enabled: x.enabled !== false,
      click: () => require('./ext-host').openPopup(this, x.id, { x: 12, y: 86 }),
    }));
    const boostHost = web && !this.incognito ? boosts.hostOf(tab.url) : '';
    return [
      ...extItems,
      ...(extItems.length ? [{ type: 'separator' }] : []),
      { label: t('adblock.count', { n }), enabled: false },
      { type: 'separator' },
      { label: t('adblock.thisSite'), type: 'checkbox', checked: on && web && !adblock.isSiteAllowed(tab.url), enabled: on && web, click: () => this.toggleSiteBlocking() },
      { label: t('adblock.everywhere'), type: 'checkbox', checked: on, click: () => require('./commands').setSetting('adblock', !on) },
      { type: 'separator' },
      { label: t('edit.copyUrl'), enabled: !!tab, click: () => this.copyUrl(false) },
      { label: t('file.capture').replace('…', ''), enabled: !!tab, click: () => this.capture() },
      { label: t('boost.edit'), enabled: web && !this.incognito, click: () => this.run('boost') },
      // Comme le pinceau du centre de contrôle d'Arc : le Boost du site s'active et se coupe d'ici.
      { label: t('boost.thisSite'), type: 'checkbox', visible: boosts.has(boostHost), checked: boosts.has(boostHost) && boosts.get(boostHost).enabled, enabled: store.state.settings.boostsEnabled !== false, click: () => this.toggleBoost() },
      { label: t('boost.zapCmd'), enabled: web && !this.incognito, click: () => this.run('zap') },
      { type: 'separator' },
      ...hooks.siteMenu(this),
      { label: t('view.clearCookies'), enabled: web, click: () => this.clearAndReload('cookies') },
      { label: t('site.resetPerms'), enabled: web, click: () => hooks.action(this, 'resetSitePerms') },
    ];
  }

  // Actualiser : depuis la page d'erreur, on retente l'adresse d'origine.
  reload(ignoreCache) {
    const wc = this.activeWc;
    if (!wc) return;
    const tab = this.activeId && this.data.tabs[this.activeId];
    if (tab && this.activeRt && wc === this.activeRt.wc && (isErrorPage(wc.getURL()) || this.activeRt.failed)) wc.loadURL(tab.url).catch(() => {});
    else if (ignoreCache) wc.reloadIgnoringCache();
    else wc.reload();
  }

  static deleteProfile(profileId) {
    const s = store.state;
    const i = s.profiles.findIndex((x) => x.id === profileId);
    if (i < 0 || profileId === 'default' || s.spaces.some((sp) => sp.profileId === profileId)) return false;
    // Les favoris du profil rejoignent l'archive ; ses cookies sont effacés.
    for (const id of s.favs[profileId] || []) {
      OrbeWindow.destroyView(id);
      OrbeWindow.forget(id, s);
      store.archive({ ...s.tabs[id], by: 'manual' });
      delete s.tabs[id];
    }
    delete s.favs[profileId];
    s.profiles.splice(i, 1);
    sessions.profileSession(profileId).clearStorageData().catch(() => {});
    store.save();
    for (const w of windows.values()) w.layout();
    OrbeWindow.pushAll();
    return true;
  }

  // --- Menus contextuels ----------------------------------------------------
  popup(template) {
    this.menuOpen = true;
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: this.win, callback: () => { this.menuOpen = false; } });
  }

  tabMenu(id, ids) {
    const many = this.checkIds(ids);
    if (many.length > 1 && many.includes(id)) return this.tabsMenu(many);
    const loc = this.locate(id);
    if (!loc) return;
    if (loc.node.type === 'folder') return this.folderMenu(id);
    this.popup(this.tabMenuTemplate(id));
  }

  tabMenuTemplate(id) {
    const loc = this.locate(id);
    const tab = this.data.tabs[id];
    const pinned = loc.list === 'pinned';
    const fav = loc.list === 'favorites';
    const others = this.data.spaces.filter((s) => s !== loc.space);
    const tpl = [
      { label: t('tabs.copyLink'), click: () => clipboard.writeText(tab.url) },
      { label: t('tabs.copyLinkMarkdown'), click: () => clipboard.writeText(mdLink(tab.customTitle || tab.title, tab.url)) },
      { label: t('tabs.duplicate'), click: () => this.duplicate(id) },
      { label: t('tabs.rename'), visible: !fav, click: () => this.askRename(id) },
      { label: t('tabs.changeIcon'), click: () => this.openIcons('tab', id) },
      { label: t('tabs.resetNameIcon'), visible: !!(tab.customTitle || tab.icon), click: () => this.resetNameIcon(id) },
      { type: 'separator' },
      { label: t(pinned ? 'tabs.unpin' : 'tabs.pin'), visible: !fav, click: () => this.togglePin(id) },
      { label: t(fav ? 'tabs.removeFavorite' : 'tabs.addFavorite'), visible: this.shared, click: () => this.toggleFavorite(id) },
      // Favori : la pastille du nombre annoncé par le site (« (3) Boîte de réception ») se coupe site par site.
      { label: t('tabs.showBadge'), type: 'checkbox', checked: !tab.noBadge, visible: fav, click: () => { if (tab.noBadge) delete tab.noBadge; else tab.noBadge = true; this.changed(); } },
      { label: t('tabs.openSplit'), enabled: !!this.activeId && this.activeId !== id, click: () => this.splitWith(this.activeId, id) },
      { label: t('tabs.separateAll'), visible: !!this.groupOf(id), click: () => this.separateAll(id) },
      { label: t(tab.muted ? 'tabs.unmute' : 'tabs.mute'), click: () => this.toggleMute(id) },
    ];
    // « Déplacer vers » : les autres Espaces, puis les dossiers de celui-ci (sauf le sien).
    const dest = fav ? [] : others.map((s) => ({ label: spaceLabel(s, this.data, this.space.profileId), click: () => this.moveToSpace(id, s.id) }));
    const folders = [];
    const each = (nodes, trail) => {
      for (const n of nodes) {
        if (n.type !== 'folder') continue;
        const name = trail ? `${trail} / ${n.name}` : n.name;
        if (n.children !== loc.arr) folders.push({ label: name, click: () => this.move({ id, to: 'folder', folderId: n.id }) });
        each(n.children, name);
      }
    };
    each(this.space.pinned, '');
    if (dest.length && folders.length) dest.push({ type: 'separator' });
    dest.push(...folders);
    if (dest.length) tpl.push({ label: t('tabs.moveTo'), submenu: dest });
    if (tab.homeUrl && !samePage(tab.homeUrl, tab.url)) {
      tpl.push({ type: 'separator' },
        { label: t('tabs.resetPinned'), click: () => this.resetPinned(id) },
        { label: t('tabs.replacePinned'), click: () => { tab.homeUrl = tab.url; this.changed(); } });
    }
    if (tab.homeUrl && loc.list !== 'today') tpl.push({ label: t('tabs.editPinned'), click: () => this.editPinned(id) });
    // Un épinglé ou un favori ne s'archive pas : sa page se ferme, il reste dans la barre.
    const kept = loc.list !== 'today';
    tpl.push({ type: 'separator' }, { label: t(kept ? 'tabs.closeKeep' : 'tabs.close'), enabled: !kept || live.has(id), click: () => this.close(id) });
    if (loc.list === 'today') {
      const above = loc.arr.slice(0, loc.index);
      const below = loc.arr.slice(loc.index + 1);
      const archive = (list) => () => {
        this.closeGroup([...list].reverse(), 'undo.archiveMany');
        this.layout();
        this.changed();
      };
      tpl.push(
        { label: t('tabs.closeOthers'), enabled: below.length > 0, click: archive(below) },
        { label: t('tabs.closeAbove'), enabled: above.length > 0, click: archive(above) },
        { label: t('tabs.closeAllOthers'), enabled: above.length + below.length > 0, click: archive([...above, ...below]) },
      );
    }
    return tpl;
  }

  // Menu d'une sélection de plusieurs onglets : chaque action porte sur tous.
  tabsMenuTemplate(ids) {
    const n = ids.length;
    const lists = ids.map((id) => this.locate(id).list);
    const favs = lists.every((l) => l === 'favorites');
    const pinned = lists.every((l) => l === 'pinned');
    const others = this.data.spaces.filter((s) => s !== this.space);
    const tpl = [
      { label: t('tabs.copyLinks'), click: () => this.copyLinks(ids) },
      { label: t('tabs.duplicate'), click: () => this.duplicateMany(ids) },
      { type: 'separator' },
      { label: t(pinned ? 'tabs.unpinMany' : 'tabs.pinMany', { n }), visible: !favs, enabled: pinned || lists.includes('today'), click: () => this.pinMany(ids) },
      { label: t(favs ? 'tabs.removeFavorite' : 'tabs.addFavorite'), visible: this.shared, click: () => this.favoriteMany(ids) },
      { label: t('tabs.folderFromSelection'), click: () => this.folderFromSelection(ids) },
    ];
    if (others.length && !lists.includes('favorites')) {
      tpl.push({ label: t('tabs.moveTo'), submenu: others.map((s) => ({ label: spaceLabel(s, this.data, this.space.profileId), click: () => this.moveManyToSpace(ids, s.id) })) });
    }
    tpl.push({ type: 'separator' }, { label: t('tabs.closeMany', { n }), click: () => this.closeMany(ids) });
    return tpl;
  }

  tabsMenu(ids) {
    this.popup(this.tabsMenuTemplate(ids));
  }

  // `pasteable` : le presse-papiers contient une adresse à coller (lu avant, il est asynchrone).
  folderMenuTemplate(id, pasteable) {
    const f = findNode(this.space.pinned, id);
    if (!f || f.node.type !== 'folder') return [];
    const any = !walk(f.node.children).next().done;
    return [
      { label: t('tabs.renameFolder'), click: () => this.askRename(id) },
      { label: t('tabs.changeIcon'), click: () => this.openIcons('folder', id) },
      { label: t('tabs.duplicateFolder'), click: () => this.duplicateFolder(id) },
      { type: 'separator' },
      { label: t('tabs.copyAllLinks'), enabled: any, click: () => this.copyFolderLinks(id, false) },
      { label: t('tabs.copyAllLinksMarkdown'), enabled: any, click: () => this.copyFolderLinks(id, true) },
      { type: 'separator' },
      { label: t('tabs.newNestedFolder'), click: () => this.newFolder(id) },
      { label: t('tabs.pasteUrlTab'), enabled: !!pasteable, click: () => this.pasteInFolder(id) },
      { label: t(f.node.open !== false ? 'tabs.closeFolder' : 'tabs.openFolder'), click: () => this.toggleFolder(id) },
      { label: t('tabs.folderToSpace'), visible: this.shared, click: () => this.turnFolderIntoSpace(id) },
      { type: 'separator' },
      { label: t('tabs.deleteFolder'), click: () => this.deleteFolder(id) },
    ];
  }

  async folderMenu(id) {
    this.popup(this.folderMenuTemplate(id, !!(await this.clipboardUrl())));
  }

  // Profils, pour les menus de la barre : celui de l'Espace est coché.
  profileItems() {
    return [
      ...this.data.profiles.map((p) => ({ label: p.name, type: 'radio', checked: this.space.profileId === p.id, click: () => this.setProfile(p.id) })),
      { type: 'separator' },
      { label: t('spaces.newProfile'), click: () => this.newProfile() },
    ];
  }

  spaceMenuTemplate() {
    return [
      { label: t('spaces.rename'), click: () => this.askRename(this.spaceId) },
      { label: t('spaces.editTheme'), click: () => this.openTheme() },
      { label: t('spaces.changeIcon'), click: () => this.openIcons('space', this.spaceId) },
      { label: t('spaces.profile'), enabled: this.shared, submenu: this.profileItems() },
      { label: t(this.space.hideHeader ? 'spaces.showHeader' : 'spaces.hideHeader'), click: () => this.toggleSpaceHeader() },
      { label: t('spaces.toFolder'), visible: this.shared, enabled: this.data.spaces.length > 1, click: () => this.turnSpaceIntoFolder() },
      { label: t('spaces.manage'), visible: this.shared, click: () => this.run('manageSpaces') },
      { label: t('spaces.export'), visible: this.shared, click: () => this.exportSpace() },
      { type: 'separator' },
      { label: t('tabs.newFolder'), click: () => this.newFolder() },
      { label: t('spaces.new'), enabled: this.shared, click: () => this.askNewSpace() },
      { type: 'separator' },
      { label: t('spaces.delete'), enabled: this.data.spaces.length > 1, click: () => this.deleteSpace() },
    ];
  }

  // « Exporter l'Espace… » : ses épinglés (avec leurs dossiers) et ses onglets du jour, dans
  // un fichier de signets (format HTML que tous les navigateurs, et Orbe, savent importer).
  // Seules les adresses web sortent ; titres et adresses sont échappés.
  spaceExportHtml(space = this.space) {
    const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let count = 0;
    const link = (id, pad) => {
      const tab = this.data.tabs[id];
      const url = tab && webUrl(tab.homeUrl || tab.url) ? (tab.homeUrl || tab.url) : '';
      if (!url) return '';
      count += 1;
      return `${pad}<DT><A HREF="${escHtml(url)}">${escHtml(tab.customTitle || tab.title || url)}</A>\n`;
    };
    const folder = (name, body, pad) => `${pad}<DT><H3>${escHtml(name)}</H3>\n${pad}<DL><p>\n${body}${pad}</DL><p>\n`;
    const walkNodes = (nodes, pad) => nodes.map((n) => (n.type === 'folder' ? folder(n.name, walkNodes(n.children || [], pad + '    '), pad) : link(n.id, pad))).join('');
    const pad = '        ';
    const body = walkNodes(space.pinned || [], pad) + folder(t('spaces.exportToday'), (space.today || []).map((id) => link(id, pad + '    ')).join(''), pad);
    const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n'
      + folder(space.name, body, '    ') + '</DL><p>\n';
    return { html, count };
  }

  async exportSpace(space = this.space) {
    if (!this.shared) return null;
    const name = String(space.name || 'Espace').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').trim().slice(0, 80) || 'Espace';
    const file = await hooks.saveFile(this.win, { title: t('spaces.export'), defaultPath: path.join(app.getPath('documents'), `${name}.html`), filters: [{ name: 'HTML', extensions: ['html'] }] });
    if (!file || typeof file !== 'string' || !path.isAbsolute(file)) return null;
    const { html, count } = this.spaceExportHtml(space);
    try { fs.writeFileSync(file, html); } catch (err) {
      console.error('[orbe] export de l’Espace', err.message);
      this.toast(t('spaces.exportFailed'), 'error');
      return null;
    }
    this.toast(t('spaces.exported', { n: count }));
    return { file, count };
  }

  spaceMenu(id) {
    if (id && id !== this.spaceId) this.switchSpace(id);
    this.popup(this.spaceMenuTemplate());
  }

  // Bouton « + » du bas (`plus`) : tout ce qu'on peut créer. Clic droit dans le
  // vide de la barre : thème et profil de l'Espace, dossiers.
  sidebarMenuTemplate(plus) {
    const create = [
      { label: t('tabs.newTab'), click: () => this.openCommand('new') },
      { label: t('tabs.newFolder'), click: () => this.newFolder() },
      { label: t('spaces.new'), enabled: this.shared, click: () => this.askNewSpace() },
      { type: 'separator' },
    ];
    if (plus) {
      return [...create,
        { label: t('view.addSplit'), click: () => this.run('addSplit') },
        { label: t('easel.new'), click: () => this.run('newEasel') },
        { label: t('notes.new'), click: () => this.run('newNote') },
        { label: t('boost.edit'), enabled: !!this.activeRt && !this.incognito, click: () => this.run('boost') },
      ];
    }
    return [...create,
      { label: t('spaces.editTheme'), click: () => this.openTheme() },
      { label: t('spaces.profile'), enabled: this.shared, submenu: this.profileItems() },
      { type: 'separator' },
      { label: t('tabs.expandFolders'), click: () => this.setFoldersOpen(true) },
      { label: t('tabs.collapseFolders'), click: () => this.setFoldersOpen(false) },
    ];
  }

  sidebarMenu(plus) {
    this.popup(this.sidebarMenuTemplate(!!plus));
  }

  pageMenu(rt, p) {
    this.popup(this.pageMenuTemplate(rt, p));
  }

  // `rt` : l'onglet, ou { wc, id } pour un aperçu (id : l'onglet d'où il a été ouvert).
  pageMenuTemplate(rt, p) {
    const wc = rt.wc;
    const isTab = live.get(rt.id) === rt;
    const tpl = [];
    const sep = () => { if (tpl.length && tpl[tpl.length - 1].type !== 'separator') tpl.push({ type: 'separator' }); };
    const link = webUrl(p.linkURL);
    const src = webUrl(p.srcURL);
    if (link) {
      tpl.push(
        { label: t('ctx.openNewTab'), click: () => this.newTab(link, { background: true, after: rt.id }) },
        { label: t('ctx.openSplit'), click: () => { this.activate(rt.id); this.newTab(link, { split: true }); } },
        { label: t('ctx.openPeek'), click: () => { const b = rt.view ? boundsOf(rt.view) : null; this.openPeek(link, rt.id, undefined, b ? { x: b.x + p.x, y: b.y + p.y } : undefined); } },
        // Une petite fenêtre utilise le profil principal : pas depuis la navigation privée.
        { label: t('ctx.openLittle'), visible: !this.incognito, click: () => hooks.openLittle(link) },
      );
    }
    if (p.linkURL) tpl.push({ label: t('ctx.copyLink'), click: () => clipboard.writeText(p.linkURL) });
    if (p.mediaType === 'image' && p.srcURL) {
      sep();
      tpl.push(
        { label: t('ctx.openImage'), visible: !!src, click: () => this.newTab(src, { after: rt.id }) },
        { label: t('ctx.copyImage'), click: () => wc.copyImageAt(p.x, p.y) },
        { label: t('ctx.copyImageUrl'), click: () => clipboard.writeText(p.srcURL) },
        { label: t('ctx.saveImage'), visible: !!src, click: () => require('./downloads').saveFrom(wc, src) },
      );
    }
    if (p.isEditable) {
      sep();
      for (const w of (p.dictionarySuggestions || []).slice(0, 5)) tpl.push({ label: w, click: () => wc.replaceMisspelling(w) });
      sep();
      tpl.push({ label: t('edit.cut'), role: 'cut' }, { label: t('edit.copy'), role: 'copy' }, { label: t('edit.paste'), role: 'paste' }, { label: t('edit.selectAll'), role: 'selectAll' });
    } else if (p.selectionText && p.selectionText.trim()) {
      sep();
      const text = p.selectionText.trim();
      tpl.push(
        { label: t('edit.copy'), role: 'copy' },
        { label: t('ctx.searchFor', { text: text.length > 28 ? text.slice(0, 28) + '…' : text }), click: () => this.newTab(suggest.searchUrl(text), { after: rt.id }) },
        // « Share Quote » dans Arc : la sélection, en citation, avec sa source.
        { label: t('edit.copyUrlQuote'), click: () => this.copyQuote(wc) },
      );
    }
    if (p.mediaType === 'video') {
      sep();
      const x = Math.round(Number(p.x) || 0);
      const y = Math.round(Number(p.y) || 0);
      tpl.push(
        { label: t('ctx.pip'), click: () => wc.executeJavaScript(`(() => { const el = document.elementFromPoint(${x}, ${y}); const v = el && (el.closest('video') || (el.querySelector && el.querySelector('video'))); if (!v || !document.pictureInPictureEnabled) return false; return (document.pictureInPictureElement === v ? document.exitPictureInPicture() : v.requestPictureInPicture()).then(() => true, () => false); })()`, true).catch(() => {}) },
        { label: t('ctx.copyVideoUrl'), visible: !!src, click: () => clipboard.writeText(p.srcURL) },
      );
      // Image dans l'image automatique, site par site (quand le réglage général est actif).
      const site = OrbeWindow.pipSite(wc.getURL());
      if (site && store.state.settings.autoPip) tpl.push({ label: t('ctx.pipAuto', { site }), type: 'checkbox', checked: !OrbeWindow.pipOff(wc.getURL()), click: () => OrbeWindow.togglePipSite(wc.getURL()) });
    }
    if (!p.linkURL && !p.isEditable && p.mediaType === 'none' && !(p.selectionText || '').trim()) {
      const nav = wc.navigationHistory;
      tpl.push(
        { label: t('ctx.back'), enabled: nav.canGoBack(), click: () => nav.goBack() },
        { label: t('ctx.forward'), enabled: nav.canGoForward(), click: () => nav.goForward() },
        { label: t('ctx.reload'), click: () => { this.activate(rt.id); this.reload(); } },
        { type: 'separator' },
        { label: t('edit.copyUrl'), click: () => clipboard.writeText(cleanUrl(wc.getURL())) },
        { label: t('file.savePage'), click: () => { this.activate(rt.id); this.savePage(); } },
        { label: t('file.print'), click: () => wc.print() },
      );
      // « Customize Page » et « Translate » dans Arc : le Boost du site, et la page traduite dans un nouvel onglet.
      const web = !!webUrl(wc.getURL());
      tpl.push(
        { type: 'separator' },
        { label: t('boost.edit'), visible: isTab, enabled: web && !this.incognito, click: () => { this.activate(rt.id); this.run('boost'); } },
        { label: t('ctx.translate'), enabled: web, click: () => this.translate(wc.getURL(), rt.id) },
      );
    }
    // Éléments ajoutés par les extensions (chrome.contextMenus).
    const fromExtensions = hooks.extensionMenu(wc, p);
    if (fromExtensions.length) { sep(); tpl.push(...fromExtensions); }
    sep();
    tpl.push({ label: t('ctx.inspect'), click: () => wc.inspectElement(p.x, p.y) });
    return tpl;
  }

  // « Traduire la page » : la page passe par le service de traduction de Google, dans
  // un nouvel onglet. Rien ne part sans ce clic ; seule l'adresse est transmise.
  translate(url, after) {
    if (!webUrl(url)) return undefined;
    const to = store.state.settings.lang === 'en' ? 'en' : 'fr';
    return this.newTab(`https://translate.google.com/translate?sl=auto&tl=${to}&u=${encodeURIComponent(url)}`, { after });
  }

  // --- État envoyé à la coque -----------------------------------------------
  sendState() {
    if (this.win.isDestroyed() || this.ui.webContents.isDestroyed()) return;
    // La barre d'outils peut apparaître avec la page (mode développeur) : la mise en page suit.
    const toolbar = this.toolbarShown;
    if (this.toolbarWas !== undefined && this.toolbarWas !== toolbar) { this.toolbarWas = toolbar; this.layout(); this.peekAddress(); }
    this.toolbarWas = toolbar;
    const d = this.data;
    const space = this.space;
    const activeId = this.activeId;
    const tabVM = (id) => {
      const tab = d.tabs[id];
      const rt = live.get(id);
      const alive = rt && !rt.wc.isDestroyed();
      const g = this.groupOf(id);
      return {
        type: 'tab',
        id,
        title: tab.customTitle || tab.title || suggest.strip(tab.url) || '…',
        url: tab.url,
        favicon: tab.favicon,
        ...(tab.icon ? { icon: tab.icon } : null),
        loading: !!(alive && rt.loading),
        audible: !!(alive && rt.wc.isCurrentlyAudible()),
        muted: !!tab.muted,
        capture: alive ? hooks.tabState(rt) : [],
        live: !!alive,
        changed: !!tab.homeUrl && !samePage(tab.homeUrl, tab.url),
        split: g ? this.splits.indexOf(g) + 1 : 0,
        // Comme dans Arc, une vue scindée n'occupe qu'une ligne : celle de son
        // premier onglet, qui porte les icônes et les titres des autres.
        partners: g && g[0] === id ? g.slice(1).filter((x) => d.tabs[x]).map((x) => ({ id: x, title: d.tabs[x].customTitle || d.tabs[x].title || suggest.strip(d.tabs[x].url), favicon: d.tabs[x].favicon, ...(d.tabs[x].icon ? { icon: d.tabs[x].icon } : null), url: d.tabs[x].url })) : null,
        grouped: !!g && g[0] !== id,
        noBadge: tab.noBadge === true,
        active: g && g[0] === id ? g.includes(activeId) : id === activeId,
        shown: false,
      };
    };
    const nodeVM = (n) => (n.type === 'folder'
      ? { type: 'folder', id: n.id, name: n.name, ...(n.icon ? { icon: n.icon } : null), open: n.open !== false, children: n.children.map(nodeVM) }
      : tabVM(n.id));
    // Listes des Espaces voisins : la barre latérale les fait glisser à côté de la
    // liste courante pendant le balayage à deux doigts, avant tout changement.
    const near = (s) => {
      if (!s) return null;
      const act = this.activeBySpace[s.id];
      const mark = (vm) => {
        if (vm.type === 'folder') vm.children.forEach(mark);
        else { const g = this.groupOf(vm.id); vm.active = g && g[0] === vm.id ? g.includes(act) : vm.id === act; }
        return vm;
      };
      return {
        space: { id: s.id, name: s.name, icon: s.icon, ...themeFields(s) },
        pinned: s.pinned.map(nodeVM).map(mark),
        today: s.today.map(tabVM).map(mark),
      };
    };
    const spaceIndex = d.spaces.indexOf(space);
    const wc = this.activeWc;
    const tab = activeId && d.tabs[activeId];
    const settings = store.state.settings;
    const downloads = store.state.downloads.filter((x) => x.state === 'progressing');
    const dir = this.spaceDir || 0;
    this.spaceDir = 0;
    const payload = {
      lang: settings.lang,
      appearance: settings.appearance,
      translucent: settings.translucent,
      dark: nativeTheme.shouldUseDarkColors,
      incognito: this.incognito,
      blank: this.blank,
      tracing: require('./trace').state.on, // trace de Chromium en cours : la barre le montre
      sidebar: { visible: this.sidebarVisible, peek: this.peek, width: this.sidebarWidth },
      toolbar,
      fullUrl: settings.showFullUrl !== false || (!!tab && prefs.devMode(tab.url)),
      devMode: !!tab && prefs.devMode(tab.url),
      fullScreen: this.win.isFullScreen(),
      spaceDir: dir,
      space: { id: space.id, name: space.name, icon: space.icon, ...themeFields(space) },
      spaces: d.spaces.map((s) => ({ id: s.id, name: s.name, icon: s.icon, color: s.color })),
      near: { prev: near(d.spaces[spaceIndex - 1]), next: near(d.spaces[spaceIndex + 1]) },
      favorites: this.favorites.map(tabVM),
      pinned: space.pinned.map(nodeVM),
      today: space.today.map(tabVM),
      activeId,
      selRev: this.selRev || 0,
      // Barre latérale : fenêtre au premier plan ou non, Espaces à l'en-tête masqué ou à la section épinglée repliée, ligne à montrer.
      side: { focused: this.win.isFocused(), noHeader: d.spaces.filter((s) => s.hideHeader).map((s) => s.id), collapsed: d.spaces.filter((s) => s.pinnedCollapsed).map((s) => s.id), reveal: this.reveal || null },
      nav: {
        url: tab ? tab.url : '',
        internal: tab ? isInternal(tab.url) : false,
        title: tab ? (tab.title || '') : '',
        loading: !!(this.activeRt && this.activeRt.loading),
        canBack: !!(wc && wc.navigationHistory.canGoBack()),
        canForward: !!(wc && wc.navigationHistory.canGoForward()),
        blocked: wc && settings.adblock ? (adblock.stats().blockedByTab.get(wc.id) || 0) : 0,
        shield: !settings.adblock ? 'off' : (tab && adblock.isSiteAllowed(tab.url) ? 'allowed' : 'on'),
        // Connexion (cadenas, « Non sécurisé »), fenêtres surgissantes bloquées, captures en cours.
        ...hooks.navState(this, this.activeRt, tab),
      },
      update: this.incognito ? null : hooks.updateNote(),
      // Boutons des extensions, sous l'adresse.
      extensions: (() => {
        try { return (require('./ext-host').actionsFor(this) || []).filter((x) => !(settings.extHidden || []).includes(x.id)).map((x) => ({ id: x.id, title: x.title, icon: typeof x.icon === 'string' ? x.icon : '', badge: x.badgeText, badgeColor: x.badgeColor, badgeTextColor: x.badgeTextColor, enabled: x.enabled })); } catch { return []; }
      })(),
      dividers: (() => {
        const ids = this.visibleIds();
        if (ids.length < 2 || this.htmlFullscreen) return [];
        const rect = this.contentRect();
        return this.paneRects(rect, ids).slice(0, -1).map((p) => (p.vertical
          ? { v: true, x: p.x, y: p.y + p.height, w: p.width }
          : { x: p.x + p.width, y: rect.y, h: rect.height }));
      })(),
      // Petite barre de chaque volet d'une vue scindée : adresse, options, fermeture.
      panes: (() => {
        const ids = this.visibleIds();
        if (ids.length < 2 || this.htmlFullscreen) return [];
        return this.paneRects(this.contentRect(), ids).map((p, i) => {
          const pt = d.tabs[ids[i]];
          return { id: ids[i], x: p.x, y: p.y, w: p.width, h: p.height, bar: p.bar, active: ids[i] === activeId, internal: isInternal(pt.url), url: pt.url, title: pt.customTitle || pt.title || '', favicon: this.incognito ? '' : (pt.favicon || '') };
        });
      })(),
      players: media.payload(this, settings),
      downloadsStarted,
      // Couleur de thème de la page affichée (barre d'outils teintée), hors vue scindée.
      pageColor: toolbar && this.activeRt && this.visibleIds().length === 1 ? this.activeRt.themeColor || null : null,
      downloads: downloads.length
        ? {
          count: downloads.length,
          progress: downloads.reduce((a, x) => a + (x.total ? x.received / x.total : 0), 0) / downloads.length,
          // Les trois plus récents, pour les lignes du bas de la barre (nom borné : il vient du site).
          items: downloads.slice(-3).reverse().map((x) => ({ id: String(x.id), name: String(x.name || '').slice(0, 200), received: Number(x.received) || 0, total: Number(x.total) || 0, paused: !!x.paused, left: require('./downloads').eta(x) })),
        }
        : null,
    };
    platform.syncChrome(this.win, { color: space.color, dark: payload.dark, toolbar, translucent: settings.translucent });
    this.ui.webContents.send('state', payload);
    if (this.floatView && !this.floatView.webContents.isDestroyed()) this.floatView.webContents.send('state', payload);
    sounds.observe(this);
    // Vues flottantes (barre de commande, bascule, recherche, messages) : aux couleurs de l'Espace.
    const look = JSON.stringify(this.themeNow());
    if (look !== this.themeSig) {
      this.themeSig = look;
      for (const v of [this.modal, this.findView, this.toastView, this.statusView]) {
        if (v && !v.webContents.isDestroyed()) v.webContents.send('theme', JSON.parse(look));
      }
    }
  }

  // Thème de l'Espace affiché, tel que le reçoivent les vues flottantes.
  themeNow() {
    return { space: themeFields(this.space), dark: nativeTheme.shouldUseDarkColors };
  }

  // --- Messages venant de l'interface ---------------------------------------
  handle(action, a) {
    if (!QUIET_ACTIONS.has(action)) sounds.arm(this); // un geste dans l'interface
    switch (action) {
      case 'ready': return this.sendState();
      case 'hoverTab': return this.prewake(a);
      case 'battery': return OrbeWindow.setBattery(a, this);
      // Clic sur l'onglet déjà affiché : rien à faire, et surtout ne pas
      // reprendre le clavier (second clic d'un double-clic pour renommer).
      case 'activate': return a === this.activeId && live.has(a) && !this.peekState ? undefined : this.activate(a);
      // Variante { ids } : l'action porte sur la sélection (liste vérifiée par checkIds).
      case 'close': return a && typeof a === 'object' ? this.closeMany(a.ids) : this.close(a);
      case 'select': this.selection = this.checkIds(a); return undefined;
      case 'openCommand': return this.openCommand(a);
      case 'toggleSidebar': return this.toggleSidebar();
      case 'sidebarWidth': return this.setSidebarWidth(a);
      case 'switchSpace': return this.switchSpace(a);
      case 'stepSpace': return this.stepSpace(a);
      case 'tabMenu': return a && typeof a === 'object' ? this.tabMenu(String(a.id), a.ids) : this.tabMenu(a);
      case 'spaceMenu': return this.spaceMenu(a);
      case 'sidebarMenu': return this.sidebarMenu(a === 'plus');
      case 'sidebarWidthReset': return this.setSidebarWidth(DEFAULT_SETTINGS.sidebarWidth);
      case 'navMenu': return this.navMenu(Number(a));
      case 'navNew': return this.navNew(Number(a));
      case 'reloadMenu': return this.popup(this.reloadMenuTemplate());
      case 'resetPinnedAside': return this.resetPinnedAside(a);
      case 'moveSpace': return a && typeof a === 'object' ? this.moveSpace(String(a.id), Number(a.index)) : undefined;
      case 'moveToSpace': {
        if (!a || typeof a !== 'object') return undefined;
        return Array.isArray(a.ids) ? this.moveManyToSpace(a.ids, String(a.spaceId)) : this.moveToSpace(String(a.id), String(a.spaceId));
      }
      // Clic sur le bouclier : le centre de contrôle du site (feuille d'Orbe) ; à défaut (page interne, pas d'onglet), le menu.
      case 'siteControl': return hooks.action(this, 'siteControl') ? undefined : this.shieldMenu();
      case 'shieldMenu': return this.shieldMenu();
      case 'toolbarMenu': return this.popup(this.toolbarMenuTemplate());
      case 'toastClick': return this.toastClick();
      case 'rename': return this.rename(a.id, a.name);
      case 'toggleFolder': return this.toggleFolder(a);
      case 'move': {
        if (a && a.copy) return this.copyTo(a);
        return a && Array.isArray(a.ids) ? this.moveMany(a) : this.move(a);
      }
      case 'toggleMute': return this.toggleMute(a);
      // « × » d'un téléchargement en cours, au bas de la barre latérale.
      case 'dlCancel': { const dl = require('./downloads'); const rec = typeof a === 'string' ? dl.findRecord(a) : null; return rec && rec.state === 'progressing' ? dl.cancel(rec) : false; }
      case 'trace:stop': return require('./trace').stop(this);
      case 'mediaToggle': return this.mediaToggle();
      case 'mediaAct': return this.mediaAct(a);
      case 'resetPinned': return this.resetPinned(a);
      case 'command': return this.run(a);
      case 'dropUrl': {
        // Texte déposé : une adresse web, ou sinon une recherche — jamais file: ou orbe:.
        const text = String(a || '').trim().slice(0, 2000);
        if (!text) return undefined;
        if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !webUrl(text)) return undefined;
        return this.newTab(webUrl(text) || suggest.searchUrl(text));
      }
      // Saisie seule, ou { q, scope } : 'actions', ou { site } pour la recherche dans un site.
      case 'suggest': return a && typeof a === 'object' ? this.suggest(String(a.q || ''), a.scope === 'actions' ? 'actions' : (a.scope && typeof a.scope.site === 'string' ? { site: a.scope.site } : undefined)) : this.suggest(String(a || ''));
      case 'suggestDelete': return this.incognito ? false : palette.forget(a);
      case 'run': return this.runItem(a.item, { background: !!a.background });
      // Clic sur le fond de la barre de commande : { x, y } ; tombé sur la barre latérale, il lui est rendu.
      case 'closeOverlay': {
        const through = this.modalMode === 'command' && a && typeof a === 'object';
        this.hideModal();
        if (through) palette.clickThrough(this, a);
        return undefined;
      }
      case 'switcherCommit': return this.switcherCommit();
      case 'find': return this.find(String(a.text || ''), a);
      case 'findClose': return this.closeFind();
      case 'findReplace': return this.replaceFound(a);
      case 'icon': return this.chooseIcon(a);
      case 'spaceCreate': return this.createSpace(a);
      case 'theme': return this.setTheme(a);
      case 'themeExtra': return this.setThemeExtra(a || {});
      case 'themeGet': return this.themeNow();
      case 'dragZone': return this.dragZone(!!a);
      case 'dragZoneOver': return this.dragZoneOver(a);
      case 'dropSplit': return a && typeof a === 'object' ? this.dropSplit(String(a.id), a) : this.dropSplit(String(a));
      // Petite barre d'un volet : adresse, menu, fermeture ; ⌥clic sur un onglet de la barre latérale.
      case 'paneEdit': if (this.visibleIds().includes(a)) { if (a !== this.activeId) this.activate(a); return this.openCommand('edit'); } return undefined;
      case 'paneMenu': return this.visibleIds().includes(a) && this.groupOf(a) ? this.popup(this.paneMenuTemplate(a)) : undefined;
      case 'paneClose': return this.visibleIds().includes(a) ? this.closeSplitPane(a) : undefined;
      case 'splitTab': return this.splitTab(String(a));
      // Onglet lâché hors de la fenêtre : seuls les identifiants viennent de l'interface, le point vient du système.
      case 'tearOff': return a && typeof a === 'object' && Array.isArray(a.ids) ? !!this.tearOff(a.ids) : false;
      // Ligne d'une autre fenêtre d'Orbe lâchée sur cette barre latérale.
      case 'adoptTab': { const from = typeof a === 'string' ? OrbeWindow.all.find((x) => x !== this && x.shared && x.orderedIds().includes(a)) : null; return from ? !!this.adopt([a], from) : false; }
      // ⌥⌘clic sur un onglet de la barre latérale : sa page s'ouvre dans une petite fenêtre.
      case 'littleTab': { const tab = this.data.tabs[a]; if (tab && webUrl(tab.url) && !this.incognito) hooks.openLittle(tab.url); return undefined; }
      case 'splitResize': return this.resizeSplit(Number(a.i), Number(a.at != null ? a.at : a.x));
      case 'peekClose': return this.dismissPeek();
      case 'peekExpand': return this.expandPeek();
      case 'peekSplit': return this.expandPeek({ split: true });
      case 'open': return webUrl(String(a)) ? this.newTab(String(a)) : undefined;
      default: return hooks.action(this, action, a);
    }
  }
}

// Le script d'un Boost ne s'exécute que dans la page web d'un onglet ordinaire :
// ni page interne, ni navigation privée, ni aperçu, feuille ou vue de l'interface
// (aucune de ces vues n'est un onglet vivant).
boosts.hooks.canScript = (wc) => {
  for (const rt of live.values()) if (rt.wc === wc) return !rt.internal && !rt.owner.incognito;
  return false;
};

// Sélecteurs d'un Boost venus d'ailleurs : lus par le moteur CSS dans la coque d'une
// fenêtre (page de l'interface, en bac à sable), jamais dans la page qui les a fournis.
boosts.hooks.parse = async (list) => {
  const w = OrbeWindow.primary || OrbeWindow.all.find((x) => x.ui && !x.ui.webContents.isDestroyed());
  if (!w || !w.ui || w.ui.webContents.isDestroyed()) return null;
  return w.ui.webContents.executeJavaScript(`(${boosts.PARSE})(${JSON.stringify(list)})`);
};

// Réapplique le Boost d'un site à tous les onglets qui l'affichent.
function applyBoosts(host) {
  const jobs = [];
  for (const rt of live.values()) {
    if (rt.owner.incognito || rt.internal || rt.wc.isDestroyed() || boosts.hostOf(rt.wc.getURL()) !== host) continue;
    jobs.push(boosts.apply(rt.wc));
  }
  return Promise.all(jobs);
}

function archiveStale() {
  const any = OrbeWindow.all.find((w) => w.shared);
  if (!any) return;
  const activeIds = new Set();
  for (const w of windows.values()) {
    if (w.incognito) continue;
    for (const id of Object.values(w.activeBySpace)) activeIds.add(id);
    for (const g of w.splits) for (const id of g) activeIds.add(id);
  }
  let count = 0;
  let delay = 0;
  for (const space of store.state.spaces) {
    // Délai du profil de l'Espace, sinon délai général ; 0 : jamais.
    const hours = prefs.get('archiveAfterHours', space.profileId);
    if (!hours) continue;
    const limit = Date.now() - hours * 36e5;
    for (const id of [...space.today]) {
      const tab = store.state.tabs[id];
      const rt = live.get(id);
      if (activeIds.has(id) || (tab.lastActiveAt || 0) > limit) continue;
      if (rt && !rt.wc.isDestroyed() && rt.wc.isCurrentlyAudible()) continue;
      any.close(id, { silent: true, ask: false, auto: true });
      count += 1;
      delay = hours;
    }
  }
  // La première fois seulement (comme le bandeau d'Arc) : un message explique l'archivage
  // d'office et mène au réglage du délai.
  if (count && store.state.window && !store.state.window.archiveNoticed) {
    store.state.window.archiveNoticed = true;
    any.toast(t('toast.autoArchive', { n: count, hours: delay }), null, () => hooks.openSettings());
  }
  if (count) { store.save(); for (const w of windows.values()) w.layout(); OrbeWindow.pushAll(); }
}

module.exports = { spaceLabel, PEEK_PULL, OrbeWindow, windows, live, media, STATUS, trusted, hooks, lostAfterStay: () => lastLost, applyBoosts, cleanUrl, mdLink, isMeetingUrl, SPLIT_BAR, archiveStale, tabMemory, tabProcesses, processMb, lastSweep: () => lastSweep, noteDownload, uiRetryDelay, UI_PREFS, STATUS_MAX, ICON_MAX, thumbs: { keep: keepThumb, MAX: THUMBS }, INTERNAL, UI_PRELOAD, isInternal, MOTION, motion, place, forceMotion, motionStats: stats, boundsOf, inFlight, resumed };
