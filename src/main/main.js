// Point d'entrée d'Orbe.
const { app, ipcMain, BrowserWindow, nativeTheme, shell, webContents, dialog, net, session } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const os = require('os');
const fs = require('fs');
const locales = require('../shared/locales');
const { store } = require('./store');
const sessions = require('./sessions');
const suggest = require('./suggest');
const win = require('./window');
const { OrbeWindow, trusted, INTERNAL, UI_PRELOAD } = win;
const little = require('./little');
const commands = require('./commands');
const menu = require('./menu');
const adblock = require('./adblock');
const extensions = require('./extensions');
const extApi = require('./ext-api');
const extHost = require('./ext-host');
const boosts = require('./boosts');
const passwords = require('./passwords');
const easels = require('./easels');
const platform = require('./platform');
const essentials = require('./essentials');
const downloads = require('./downloads');
const library = require('./library');
const prefs = require('./prefs');
const shortcuts = require('./shortcuts');
const panes = require('./panes');
const updates = require('./updates');
const imports = require('./imports');
const extUi = require('./ext-ui');

platform.adaptLocales(locales);

// Mode test (--selftest, ORBE_SCENARIO, trousseau factice) : réservé au
// lancement depuis les sources. L'application fabriquée ne l'accepte qu'avec
// --orbe-test ET un dossier de données à part (essai de fumée de l'intégration
// continue) : jamais sur le vrai profil.
function testModeAllowed() {
  if (!app.isPackaged) return true;
  if (!process.argv.includes('--orbe-test') || !process.env.ORBE_USER_DATA) return false;
  const real = path.resolve(app.getPath('userData'));
  const asked = path.resolve(process.env.ORBE_USER_DATA);
  return asked !== real && !asked.startsWith(real + path.sep);
}
const pendingUrls = [];

app.setName('Orbe');
const SELFTEST = process.argv.includes('--selftest') && testModeAllowed();
if (process.argv.includes('--selftest') && !SELFTEST) {
  console.error('[orbe] --selftest refusé : application fabriquée, sans --orbe-test ni ORBE_USER_DATA à part');
  process.exit(2);
}
// Exception non rattrapée dans le processus principal. Sans écouteur, Electron
// ouvre une boîte d'erreur native (« A JavaScript error occurred in the main
// process ») qui fige toute l'application tant que personne n'y répond — et
// personne n'y répond pendant un essai : c'était le blocage des tests après la
// fermeture d'une fenêtre. Orbe consigne l'erreur et continue ; en test, elle
// fait échouer le scénario à la fin (voir plus bas).
const uncaught = [];
process.on('uncaughtException', (err) => {
  const text = String((err && err.stack) || err);
  uncaught.push(text);
  if (uncaught.length > 20) uncaught.shift();
  console.error(`[orbe] exception non rattrapée dans le processus principal :\n${text}`);
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'erreurs.log'), `${new Date().toISOString()} ${text}\n\n`); } catch {}
});

// Profil de données isolé : pour les tests, ou via ORBE_USER_DATA.
if (process.env.ORBE_USER_DATA) app.setPath('userData', path.resolve(process.env.ORBE_USER_DATA));
else if (SELFTEST) app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-test-')));
// En test, rien n'est écrit dans le vrai dossier Téléchargements.
let testGuard = null;
if (SELFTEST) {
  // Garde des essais : aucune boîte de dialogue native sans réponse préparée,
  // et un scénario qui n'avance plus s'arrête en disant ce qu'il attendait.
  testGuard = require('./test-guard');
  testGuard.state.errors = uncaught;
  testGuard.install({ app, dialog, limit: Number(process.env.ORBE_TEST_LIMIT) || 480, stall: Number(process.env.ORBE_TEST_STALL) || 150 });
  // Les tests ne touchent jamais au vrai trousseau du système.
  app.commandLine.appendSwitch('use-mock-keychain');
  // ORBE_NETLOG : journal du réseau de Chromium, pour une page qui ne se charge pas.
  if (process.env.ORBE_NETLOG) app.commandLine.appendSwitch('log-net-log', process.env.ORBE_NETLOG);
  // Caméra et micro factices : aucun vrai appareil n'est ouvert pendant les tests.
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  // Fenêtre d'essai recouverte par une autre (machine partagée) : Chromium ralentirait
  // ses minuteries à une par seconde et suspendrait ses vidéos, ce qui fausse les essais.
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  const dl = path.join(app.getPath('userData'), 'Telechargements');
  fs.mkdirSync(dl, { recursive: true });
  app.setPath('downloads', dl);
}
sessions.registerScheme();
// Hors macOS, un lien ouvert avec Orbe arrive en argument de la ligne de commande.
if (!platform.isMac) for (const x of process.argv.slice(1)) if (/^https?:\/\//i.test(x)) pendingUrls.push(x);

if (!SELFTEST && !process.env.ORBE_USER_DATA && !app.requestSingleInstanceLock()) app.quit();

function openUrl(url) {
  if (!app.isReady()) return pendingUrls.push(url);
  // Aiguillage (comme Air Traffic Control dans Arc) : la première règle qui nomme
  // le site de l'adresse décide de l'Espace, ou de la petite fenêtre (prefs.js, `routeFor`).
  let target = null;
  if (!openUrl.direct) {
    const to = routeFor(url);
    const ext = store.state.settings.externalLinks;
    // Sans règle : petite fenêtre, Espace précis (« space:<id> »), ou l'Espace affiché.
    target = to || (ext === 'little' ? 'little' : (String(ext).startsWith('space:') ? ext.slice(6) : null));
  }
  // Lien de réunion (Meet, Zoom, Teams…) : jamais en petite fenêtre, toujours dans un onglet.
  if (target === 'little' && win.isMeetingUrl(url)) target = null;
  // Déjà affiché dans une petite fenêtre : elle revient au premier plan.
  if (target === 'little') return little.LittleWindow.openOrFocus(url);
  let w = OrbeWindow.primary;
  if (!w) w = new OrbeWindow();
  if (target && store.state.spaces.some((sp) => sp.id === target)) w.switchSpace(target);
  w.newTab(url);
  if (w.win.isMinimized()) w.win.restore();
  w.win.focus();
  return undefined;
}

// Destination qu'une règle d'aiguillage donne à cette adresse (identifiant d'Espace, « little »), ou null.
// La règle se lit sur le nom d'hôte de l'adresse (et, si elle en précise un, sur le début
// du chemin) : jamais sur un texte trouvé n'importe où dans l'adresse.
function routeFor(url) {
  return prefs.routeFor(String(url));
}

// `from` : la fenêtre d'où vient la demande (celle du menu). Sans elle, la fenêtre active.
function newWindow(opts = {}, from) {
  return OrbeWindow.open(opts, from || OrbeWindow.focused);
}

// Fenêtre des réglages, à volets (src/main/panes.js). `pane` : volet à afficher.
function openSettings(pane) {
  return panes.open(pane);
}

// Éditeur de Boost et liste des Boosts : src/main/boost-editor.js.
const boostEditor = require('./boost-editor');

function applyAppearance() {
  const a = store.state.settings.appearance;
  nativeTheme.themeSource = a === 'auto' ? 'system' : a;
}

function broadcastSettings() {
  applyAppearance();
  if (adblock.isEnabled() !== store.state.settings.adblock) adblock.setEnabled(store.state.settings.adblock);
  for (const wc of webContents.getAllWebContents()) {
    if (trusted.has(wc) && !wc.isDestroyed()) wc.send('settings', store.state.settings);
  }
  panes.settingsChanged();
  for (const w of OrbeWindow.all) w.layout();
  OrbeWindow.pushAll();
  menu.refresh(true);
}

const SETTABLE = {
  ...prefs.SETTABLE,
  lang: (v) => v === 'fr' || v === 'en',
  searchEngine: (v) => Object.prototype.hasOwnProperty.call(suggest.ENGINES, v),
  suggestions: (v) => typeof v === 'boolean',
  archiveAfterHours: (v) => [0, 12, 24, 168, 720].includes(v),
  appearance: (v) => ['auto', 'light', 'dark'].includes(v),
  translucent: (v) => typeof v === 'boolean',
  maxLiveTabs: (v) => Number.isInteger(v) && v >= 4 && v <= 60,
  sleepAfterHours: (v) => [0, 1, 2, 3, 6, 12].includes(v),
  memoryBudget: (v) => v === 0 || (Number.isInteger(v) && v >= 10 && v <= 80),
  externalLinks: prefs.externalLinks,
  autoPip: (v) => typeof v === 'boolean',
  batterySaver: (v) => typeof v === 'boolean',
  sounds: (v) => typeof v === 'boolean',
  soundVolume: (v) => Number.isInteger(v) && v >= 0 && v <= 100,
  soundGestures: (v) => typeof v === 'boolean',
  adblock: (v) => typeof v === 'boolean',
  peekLinks: (v) => typeof v === 'boolean',
  passwordSave: (v) => typeof v === 'boolean',
  passwordFill: (v) => typeof v === 'boolean',
  routes: prefs.routes,
};

function profileList() {
  const s = store.state;
  return s.profiles.map((p) => ({ id: p.id, name: p.name, spaces: s.spaces.filter((sp) => sp.profileId === p.id).map((sp) => `${sp.icon} ${sp.name}`) }));
}

function extensionList() {
  return extUi.list();
}

function shortcutGroups() {
  const t = (k) => store.t(k);
  const group = (title, names, extra = []) => ({
    title,
    items: [...names.map((n) => commands.byName.get(n)).filter((c) => c && shortcuts.keysOf(c.name)).map((c) => ({ label: t(c.label), keys: shortcuts.keysOf(c.name) })), ...extra],
  });
  const fr = store.state.settings.lang === 'fr';
  return [
    group(t('menu.tabs'), ['newTab', 'commandBar', 'closeTab', 'reopen', 'togglePin', 'nextTab', 'prevTab', 'clearToday'], [
      { label: fr ? 'Aller à l’onglet 1 à 9' : 'Go to tab 1 to 9', keys: platform.keys('⌘1 … ⌘9') },
      { label: platform.keys(fr ? 'Onglets récents (maintenir ⌃)' : 'Recent tabs (hold ⌃)'), keys: platform.keys('⌃⇥') },
    ]),
    group(t('menu.spaces'), ['nextSpace', 'prevSpace'], [{ label: fr ? 'Aller à l’Espace 1 à 9' : 'Go to Space 1 to 9', keys: platform.keys('⌃1 … ⌃9') }]),
    group(t('menu.window'), ['newWindow', 'newIncognito', 'newLittle', 'closeWindow', 'toggleSidebar', 'toggleToolbar', 'addSplit', 'closeSplit', 'fullscreen', 'library', 'downloads', 'newEasel', 'settings']),
    group(fr ? 'Page' : 'Page', ['back', 'forward', 'reload', 'forceReload', 'stop', 'find', 'findNext', 'findPrev', 'copyUrl', 'copyUrlMarkdown', 'capture', 'captureToEasel', 'savePage', 'print', 'zoomIn', 'zoomOut', 'actualSize', 'history']),
    group(t('view.developer'), ['devtools', 'inspect', 'console', 'source']),
  ];
}

async function globalAction(action, a, sender) {
  const s = store.state;
  switch (action) {
    case 'notes:list':
      return s.notes.slice().sort((x, y) => y.at - x.at);
    case 'notes:save': {
      let note = s.notes.find((n) => n.id === (a && a.id));
      if (!note) { note = { id: require('./store').uid(), text: '', at: Date.now() }; s.notes.push(note); }
      require('./notes').setContent(note, a); // blocs de mise en forme vérifiés (liste fermée), jamais de HTML
      note.at = Date.now();
      store.save();
      return note;
    }
    case 'notes:delete':
      s.notes = s.notes.filter((n) => n.id !== a);
      store.save();
      require('./backups').forget({ notes: [a] }); // supprimée ici, supprimée aussi des sauvegardes de l'état
      return true;
    case 'ext:list':
      return extensionList();
    case 'ext:install': {
      const id = extensions.parseStoreInput(String(a || ''));
      if (!id) return { error: store.t('ext.badUrl') };
      try { await extensions.install(id); } catch (err) { return { error: `${store.t('ext.failed')} (${err.code || err.message})` }; }
      return { list: extensionList() };
    }
    case 'ext:remove':
      return extUi.remove(String(a));
    // Page d'options, bouton épinglé ou non, mise à jour, menu contextuel du bouton (src/main/ext-ui.js).
    case 'ext:options': case 'ext:pin': case 'ext:update': case 'ext:menu':
      return extUi.action(action, a, sender);
    case 'ext:toggle':
      extensions.setEnabled(String(a.id), !!a.enabled);
      return extensionList();
    // Boutons des extensions pour l'onglet actif : [{ id, name, title, icon, badgeText, badgeColor, badgeTextColor, popup, enabled }].
    case 'ext:actions':
      return extHost.actionsFor(OrbeWindow.ownerOf(sender) || OrbeWindow.primary);
    // Clic sur un bouton : `a` est l'identifiant, ou { id, x, y } pour ancrer la fenêtre surgissante.
    case 'ext:popup': {
      const o = a && typeof a === 'object' ? a : { id: a };
      return !!extHost.openPopup(OrbeWindow.ownerOf(sender) || OrbeWindow.primary, String(o.id), { x: Number(o.x), y: Number(o.y) });
    }
    case 'shortcuts:get':
      return shortcutGroups();
    // Gestionnaire de tâches (src/main/tasks.js).
    case 'tasks:list': case 'tasks:end':
      return require('./tasks').handle(action, a);
    case 'settings:get':
      return { settings: s.settings, spaces: s.spaces.map((sp) => ({ id: sp.id, name: `${sp.icon} ${sp.name}` })), profiles: profileList(), engines: Object.entries(suggest.ENGINES).map(([id, e]) => ({ id, name: e.name })), version: app.getVersion(), chrome: process.versions.chrome, ...panes.info() };
    case 'settings:set':
      for (const [k, v] of Object.entries(a || {})) if (Object.hasOwn(SETTABLE, k) && SETTABLE[k](v)) s.settings[k] = v;
      store.save();
      broadcastSettings();
      return s.settings;
    // Aiguillage : écriture normale d'une règle tapée ('' si elle ne nomme pas un site),
    // et, pour une liste de règles, lesquelles nomment un site.
    case 'settings:routeText': return prefs.routeText(typeof a === 'string' ? a : '');
    case 'settings:routeCheck': return (Array.isArray(a) ? a.slice(0, 100) : []).map((m) => !!prefs.routeRule(m));
    case 'settings:renameProfile': {
      const p = s.profiles.find((x) => x.id === (a && a.id));
      const name = String((a && a.name) || '').trim().slice(0, 40);
      if (p && name) { p.name = name; store.save(); menu.refresh(true); }
      return profileList();
    }
    case 'settings:deleteProfile':
      if (OrbeWindow.deleteProfile(String(a))) { passwords.forgetProfile(String(a)); prefs.forgetProfile(String(a)); essentials.permissions.forgetProfile(String(a)); menu.refresh(true); }
      return profileList();
    case 'settings:makeDefault':
      commands.makeDefault();
      return true;
    case 'settings:resetPerms':
      essentials.permissions.resetAll(); // tous les profils
      require('./backups').forget({ permissions: true });
      return true;
    case 'settings:clearData': {
      const parent = BrowserWindow.fromWebContents(sender);
      const r = await dialog.showMessageBox(parent, {
        type: 'warning',
        message: store.t('set.clearData').replace('…', ' ?'),
        detail: store.t('set.clearDataHint'),
        buttons: [store.t('set.clearData').replace('…', ''), store.t('edit.undo')],
        defaultId: 1,
        cancelId: 1,
      });
      if (r.response !== 0) return false;
      for (const p of s.profiles) {
        const ses = sessions.profileSession(p.id);
        await ses.clearStorageData();
        await ses.clearCache();
      }
      s.history = {};
      store.saveHistory(true);
      store.historyCount = 0;
      store.save();
      require('./backups').forget({ historyAll: true });
      return true;
    }
    default:
      return panes.handle(action, a, sender);
  }
}

// Mises à jour (src/main/updates.js) : la question part d'une session à part, en
// mémoire, sans cookie ni identifiant. Jamais de vérification automatique en
// test ni depuis les sources.
function setupUpdates() {
  let ses = null;
  const updateSession = () => {
    if (!ses) {
      ses = session.fromPartition('orbe-mises-a-jour', { cache: false });
      ses.setUserAgent('Orbe', 'en');
      // Chaque requête de cette session, sauts de redirection compris, est contrôlée :
      // HTTPS et hôte exact de GitHub, sinon elle est annulée avant de partir.
      ses.webRequest.onBeforeRequest((details, done) => done({ cancel: !updates.hopAllowed(details.url) }));
    }
    return ses;
  };
  updates.configure({
    version: app.getVersion(),
    fetch: (url, init) => updateSession().fetch(url, init),
    state: () => store.state.updates,
    save: () => store.save(),
    enabled: () => store.state.settings.updateCheck !== false,
    auto: app.isPackaged && !SELFTEST && !process.argv.includes('--orbe-test') && !process.env.ORBE_NO_UPDATE_CHECK,
    test: SELFTEST || (!app.isPackaged && process.env.ORBE_UI_TEST === '1'),
    downloadsDir: () => prefs.downloadDirFor('default') || app.getPath('downloads'),
    reveal: (file) => shell.showItemInFolder(file),
    show: () => openSettings('advanced'),
    open: (url) => { const w = OrbeWindow.primary || newWindow(); w.newTab(url); w.win.focus(); },
    changed: () => {
      const st = updates.status();
      for (const wc of webContents.getAllWebContents()) if (trusted.has(wc) && !wc.isDestroyed()) wc.send('update', st);
      OrbeWindow.pushAll();
    },
  });
  win.hooks.updateNote = () => updates.note();
  commands.hooks.checkUpdates = () => { openSettings('advanced'); updates.check({ manual: true }); };
  updates.start();
}

// Page d'accueil (welcome.html) : ce qu'elle affiche, et sa fermeture.
function welcomeAction(action, sender) {
  const w = OrbeWindow.ownerOf(sender) || OrbeWindow.primary;
  if (action === 'welcome:info') {
    return { arc: require('./import-arc').available(), colors: require('./store').SPACE_COLORS, color: w ? w.space.color : '', isDefault: panes.isDefaultBrowser(), music: require('./sounds').music() };
  }
  if (action === 'welcome:done' && w) {
    store.state.window.welcomed = true;
    store.save();
    const rt = [...win.live.values()].find((x) => x.wc === sender);
    if (rt) w.close(rt.id);
    // Plus aucun onglet : la barre de commande s'ouvre pour le premier.
    if (!w.activeId && !SELFTEST) w.openCommand('new');
    return true;
  }
  return undefined;
}

function setupIpc() {
  const ok = (e) => trusted.has(e.sender) && e.senderFrame && e.senderFrame.url.startsWith(INTERNAL);
  ipcMain.on('i18n', (e) => {
    e.returnValue = ok(e) ? { locales, lang: store.state.settings.lang, settings: store.state.settings, platform: platform.name, keys: shortcuts.keysMap(), defaultKeys: shortcuts.defaultKeysMap() } : null;
  });
  ipcMain.handle('orbe', async (e, action, payload) => {
    if (!ok(e) || typeof action !== 'string') return undefined;
    if (action.startsWith('boost:')) return boostEditor.action(action, payload, e.sender);
    if (action.startsWith('pw:')) return passwords.action(action, payload, e.sender);
    if (action.startsWith('easel:')) return easels.action(action, payload, e.sender);
    if (action.startsWith('sheet:')) return essentials.sheets.action(action, payload, e.sender);
    if (action.startsWith('dl:')) return downloads.action(action, payload, e.sender);
    if (action.startsWith('update:')) return updates.action(action, payload, e.sender);
    if (action.startsWith('import:')) return imports.action(action, payload, e.sender);
    if (action.startsWith('welcome:')) return welcomeAction(action, e.sender);
    if (action.startsWith('lib:')) return library.action(action, payload, e.sender);
    if (/^(settings|shortcuts|ext|notes|tasks):/.test(action)) return globalAction(action, payload, e.sender);
    const owner = OrbeWindow.ownerOf(e.sender) || little.LittleWindow.ownerOf(e.sender) || OrbeWindow.primary;
    return owner ? owner.handle(action, payload) : undefined;
  });
}

app.on('open-url', (e, url) => { e.preventDefault(); openUrl(url); });
app.on('open-file', (e, file) => { e.preventDefault(); openUrl(pathToFileURL(file).href); });
// Handoff (macOS) : une page ouverte dans le navigateur d'un autre appareil de l'utilisateur
// (iPhone, iPad, autre Mac) et reprise ici. Seule une adresse web est acceptée ; Orbe
// n'annonce lui-même aucune page aux autres appareils.
function handoffUrl(type, details) {
  if (type !== 'NSUserActivityTypeBrowsingWeb') return '';
  const raw = details && typeof details.webpageURL === 'string' ? details.webpageURL : '';
  if (!raw || raw.length > 4096) return '';
  try { const u = new URL(raw); return /^https?:$/.test(u.protocol) && u.hostname ? u.href : ''; } catch { return ''; }
}
app.on('continue-activity', (e, type, userInfo, details) => {
  const url = handoffUrl(type, details);
  if (!url) return;
  e.preventDefault();
  openUrl(url);
});
app.on('second-instance', (e, argv) => {
  const url = argv.find((x) => /^https?:\/\//i.test(x));
  if (url) openUrl(url);
  else if (OrbeWindow.primary) OrbeWindow.primary.win.focus();
});

app.whenReady().then(async () => {
  store.load(app.getPath('userData'));
  // Règles d'aiguillage d'avant (« l'adresse contient… ») : mises sous leur forme d'aujourd'hui.
  if (prefs.migrateRoutes()) store.save();
  // Sauvegardes locales de l'état : au lancement, puis toutes les heures (pas pendant les tests).
  if (!SELFTEST) require('./backups').start();
  // (Sans lire l'historique : il n'est chargé qu'après l'affichage de la fenêtre.)
  // Accueil : une seule fois, au tout premier lancement (profil vide, jamais accueilli).
  const firstRun = !Object.keys(store.state.tabs).length && !store.hadHistory && !store.historyDirty && !store.state.window.welcomed;
  // Moteur avec Widevine (ORBE_DRM) : prépare le module de lecture protégée, sans
  // retarder l'ouverture (premier lancement : téléchargement en arrière-plan).
  const { components } = require('electron');
  if (components) components.whenReady().catch((err) => console.error('[orbe] widevine', err.message));
  applyAppearance();
  extensions.configure({ dir: path.join(app.getPath('userData'), 'Extensions'), fetch: (u, o) => net.fetch(u, o), lang: store.state.settings.lang });
  extApi.configure({ dir: path.join(app.getPath('userData'), 'Extensions') });
  extensions.hooks.equip = (ses) => extApi.equip(ses);
  extHost.setup();
  // Feuilles d'onglet, autorisations, certificats, authentification, « quitter la page ? »… (après extHost : mise en page chaînée).
  essentials.setup({ win, sessions, test: SELFTEST });
  adblock.configure({
    enabled: store.state.settings.adblock,
    allowlist: store.state.settings.adblockAllow,
    onChange: ({ enabled, allowlist }) => {
      store.state.settings.adblock = enabled;
      store.state.settings.adblockAllow = allowlist;
      store.save();
    },
    onCount: () => OrbeWindow.pushAll(),
  });
  // Liste chargée peu après le démarrage, pour ne pas le ralentir.
  setTimeout(() => adblock.load(), 1200);
  sessions.setupDefaultSession();
  setupIpc();

  commands.hooks.newWindow = newWindow;
  commands.hooks.newLittle = (url) => new little.LittleWindow(url);
  commands.hooks.openSettings = openSettings;
  commands.hooks.openBoost = (w, mode) => boostEditor.open(w, mode);
  boostEditor.hooks.openSettings = () => openSettings('privacy');
  commands.hooks.openPasswords = () => passwords.openManager();
  passwords.configure({ trusted, uiPreload: UI_PRELOAD, internal: INTERNAL, toast: (wc, text) => { const o = OrbeWindow.ownerOf(wc); if (o) o.toast(text); } });
  commands.hooks.settingsChanged = broadcastSettings;
  commands.hooks.importBookmarks = (w) => panes.importBookmarks(w && w.win, { profileId: w && !w.incognito ? w.space.profileId : 'default' });
  panes.configure({ broadcast: broadcastSettings, profileList, refreshMenu: () => menu.refresh(true) });
  // Moteur de recherche et suggestions : ceux du profil de l'Espace affiché.
  suggest.hooks.profileId = () => { const w = OrbeWindow.focused || OrbeWindow.primary; return w && !w.incognito ? w.space.profileId : 'default'; };
  win.hooks.openLittle = (url) => new little.LittleWindow(url);
  // Aiguillage : un lien qui s'ouvrirait en aperçu suit d'abord les règles.
  win.hooks.route = routeFor;
  win.hooks.openRouted = (url) => openUrl(url);
  win.hooks.changed = () => { menu.refresh(); extHost.sync(); passwords.sync(); };
  win.hooks.extensionMenu = (wc, params) => [...extApi.contextMenuItems(wc, params), ...passwords.contextMenuItems(wc, params)];
  extApi.hooks.actionChanged = () => OrbeWindow.pushAll();
  little.hooks.openInOrbe = (url, spaceId) => {
    openUrl.direct = true;
    try {
      const w = OrbeWindow.primary;
      if (w && spaceId) w.switchSpace(spaceId);
      openUrl(url);
    } finally { openUrl.direct = false; }
  };
  little.hooks.profileId = () => { const w = OrbeWindow.primary; return w ? w.space.profileId : 'default'; };
  little.hooks.profiles = () => [...new Set(store.state.spaces.map((sp) => sp.profileId || 'default'))];
  little.hooks.profileOfSpace = (id) => { const sp = store.state.spaces.find((x) => x.id === id); return sp ? sp.profileId || 'default' : null; };
  little.hooks.spaces = () => store.state.spaces.map((sp) => ({ id: sp.id, name: sp.name, icon: sp.icon }));
  library.env.reviewBoost = (w, host) => boostEditor.review(w, host);
  win.hooks.quitAborted = () => require('./backups').disarm();
  library.env.window = (sender) => (sender && OrbeWindow.ownerOf(sender)) || OrbeWindow.focused || OrbeWindow.primary;
  sessions.hooks.ownerWindow = (wc) => { const o = wc && OrbeWindow.ownerOf(wc); return o ? o.win : null; };
  sessions.hooks.onDownload = (phase, d, wc) => {
    win.noteDownload(phase, d, wc);
    const owner = (wc && OrbeWindow.ownerOf(wc)) || OrbeWindow.primary;
    if (owner && phase === 'start') owner.toast(store.t('toast.downloadStarted', null, { name: d.name }));
    if (owner && phase === 'done' && d.state === 'completed') owner.toast(store.t(d.danger ? 'toast.downloadDanger' : 'toast.downloadDone', null, { name: d.name }));
    OrbeWindow.pushAll();
  };
  nativeTheme.on('updated', () => OrbeWindow.pushAll());
  setupUpdates();
  // Import depuis un navigateur installé. En test, aucun vrai profil n'est lu :
  // les essais désignent eux-mêmes un dossier d'essai (import-browsers.configure).
  if (SELFTEST || process.env.ORBE_UI_TEST === '1') require('./import-browsers').configure({ home: '', local: '', roaming: '' });
  // De même pour les profils d'Arc (historique, mots de passe, cookies) : jamais lus pendant un
  // essai. `security: ''` en plus de `root: ''` : même un essai mal écrit ne touche pas le trousseau.
  if (SELFTEST || process.env.ORBE_UI_TEST === '1') require('./import-arc-data').configure({ root: '', security: '' });
  else require('./import-arc-data').configure({ root: platform.arcUserDataDir() });
  // Les essais servent leurs pages depuis 127.0.0.1 : le mode développeur automatique des sites locaux
  // y afficherait partout la barre d'outils. Coupé au départ ; les essais qui le vérifient l'activent.
  if (SELFTEST || process.env.ORBE_UI_TEST === '1') store.state.settings.devLocalhost = false;
  imports.hooks.refreshMenu = () => menu.refresh(true);
  extUi.hooks.openSettings = openSettings;
  extUi.hooks.changed = () => { for (const wc of webContents.getAllWebContents()) if (trusted.has(wc) && !wc.isDestroyed()) wc.send('settings', store.state.settings); menu.refresh(true); };

  app.setAboutPanelOptions({ applicationName: 'Orbe', applicationVersion: app.getVersion(), copyright: 'Logiciel libre — licence MIT', credits: `Chromium ${process.versions.chrome}` });
  menu.build();

  const first = newWindow();
  if (firstRun && !SELFTEST && !process.env.ORBE_NO_WELCOME) { store.state.window.welcomed = true; require('./starter').seed(first); first.openInternal('welcome.html'); }
  for (const url of pendingUrls.splice(0)) openUrl(url);

  // L'historique se charge une fois la fenêtre affichée et la coque peinte.
  setTimeout(() => store.warmHistory(), 400);
  setTimeout(win.archiveStale, 30e3);
  setInterval(win.archiveStale, 10 * 60e3);
  // Veille des onglets selon l'ancienneté et la mémoire, toutes les minutes.
  // (Pas pendant les tests : ils déclenchent ce passage eux-mêmes.)
  if (!SELFTEST) setInterval(() => { OrbeWindow.sweep().catch((err) => console.error('[orbe] veille', err)); }, 60e3).unref();
  setInterval(() => little.LittleWindow.archiveStale(), 10 * 60e3).unref();

  if (SELFTEST) {
    // (Un scénario qui n'avance plus est arrêté par la garde : src/main/test-guard.js.)
    try {
      // ORBE_SCENARIO : autre scénario de test (ex. tests/sites.js, sites réels).
      await require(process.env.ORBE_SCENARIO ? path.resolve(process.env.ORBE_SCENARIO) : '../../tests/selftest')({ first, OrbeWindow, store, win, little, commands, menu, openSettings, openUrl, extensions, extApi, extHost, passwords, panes, prefs, shortcuts, globalAction, essentials, updates, imports, extUi });
      store.flush();
      if (uncaught.length) throw new Error(`${uncaught.length} exception(s) non rattrapée(s) dans le processus principal pendant le scénario :\n${uncaught.join('\n')}`);
      const asked = testGuard.state.dialogs;
      if (asked.length) throw new Error(`${asked.length} boîte(s) de dialogue native(s) demandée(s) sans réponse préparée : ${asked.map((d) => `${d.name} « ${d.what} »`).join(' ; ')}`);
      app.exit(0);
    } catch (err) {
      console.error('\nÉCHEC', err);
      // Un délai dépassé ne dit pas pourquoi : l'état du processus principal, si.
      if (/Délai dépassé|non rattrapée|boîte\(s\) de dialogue/.test(String(err && err.message))) console.error(`\nÉtat du processus principal :\n${testGuard.describe()}\n`);
      app.exit(1);
    }
  }
});

app.on('activate', () => {
  if (!OrbeWindow.all.length) newWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => store.flush());
app.on('web-contents-created', (e, wc) => {
  // Aucune page web ne doit pouvoir ouvrir une <webview>.
  wc.on('will-attach-webview', (ev) => ev.preventDefault());
});
