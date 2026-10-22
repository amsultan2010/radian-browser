// Fenêtre des réglages à volets, à la manière d'Arc et de macOS : création de
// la fenêtre, hauteur ajustée à chaque volet, et actions propres aux nouveaux
// volets (profils, raccourcis, import, avancé).
const { app, BrowserWindow, dialog, globalShortcut, nativeTheme, screen, webContents } = require('electron');
const { store } = require('./store');
const platform = require('./platform');
const prefs = require('./prefs');
const shortcuts = require('./shortcuts');
const commands = require('./commands');
const boosts = require('./boosts');
const adblock = require('./adblock');
const sessions = require('./sessions');
const win = require('./window');
const { OrbeWindow, trusted, INTERNAL, UI_PRELOAD } = win;

const PANES = ['general', 'profiles', 'tabs', 'links', 'shortcuts', 'appearance', 'privacy', 'extensions', 'import', 'advanced'];
const WIDTH = 720;
const MIN_H = 260;

const t = (k, v) => store.t(k, null, v);
// `broadcast` : même porte que tout changement de réglage (menu, coque, pages).
const deps = { broadcast: () => {}, profileList: () => [], refreshMenu: () => {} };
let settingsWindow = null;

// --- Fenêtre ------------------------------------------------------------------
function open(pane) {
  if (pane && PANES.includes(pane)) { store.state.window.settingsPane = pane; store.save(true); }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (pane) settingsWindow.webContents.reload();
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }
  const w = new BrowserWindow({
    width: WIDTH,
    height: 520,
    useContentSize: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    ...platform.windowChrome({ inset: true, dark: nativeTheme.shouldUseDarkColors }),
    show: false,
    webPreferences: { preload: UI_PRELOAD, sandbox: true, contextIsolation: true },
  });
  settingsWindow = w;
  trusted.add(w.webContents);
  w.webContents.on('will-navigate', (e) => e.preventDefault());
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.loadURL(INTERNAL + 'settings.html');
  // Affichée une fois sa hauteur connue (premier « settings:layout ») : aucun
  // saut à l'ouverture. Filet de sécurité si la page tarde.
  const fallback = setTimeout(() => { if (!w.isDestroyed() && !w.isVisible()) w.show(); }, 1500);
  w.on('closed', () => { clearTimeout(fallback); if (settingsWindow === w) settingsWindow = null; });
  return w;
}

function layout(sender, a) {
  const w = BrowserWindow.fromWebContents(sender);
  if (!w || w.isDestroyed() || w !== settingsWindow) return 0;
  const area = screen.getDisplayMatching(w.getBounds()).workAreaSize;
  const max = Math.max(MIN_H + 60, area.height - 60);
  const h = Math.max(MIN_H, Math.min(max, Math.round(Number(a && a.height) || 0)));
  const shown = w.isVisible();
  if (w.getContentSize()[1] !== h) w.setContentSize(WIDTH, h, platform.isMac && shown && !(a && a.instant));
  if (!shown) w.show();
  return h;
}

// --- Navigateur par défaut -----------------------------------------------------
function isDefaultBrowser() {
  try { return app.isDefaultProtocolClient('http') && app.isDefaultProtocolClient('https'); } catch { return false; }
}

// --- Raccourci global de la petite fenêtre --------------------------------------
let registered = '';
function applyGlobal() {
  const want = store.state.settings.littleShortcut || '';
  if (want === registered) return true;
  if (registered) { try { globalShortcut.unregister(registered); } catch {} registered = ''; }
  if (!want) return true;
  let ok = false;
  try { ok = globalShortcut.register(want, () => commands.run(null, 'newLittle')); } catch {}
  if (ok) registered = want;
  return ok;
}

function setGlobal(accel, { force = false } = {}) {
  const s = store.state.settings;
  if (!accel) {
    s.littleShortcut = '';
    applyGlobal();
    store.save();
    shortcuts.hooks.changed();
    return { ok: true, keys: '' };
  }
  const r = shortcuts.check(accel);
  if (r.error) return r;
  const other = shortcuts.owner(r.accel);
  if (other && !force) return { conflict: other, label: shortcuts.labelOf(other), keys: shortcuts.display(r.accel) };
  const before = s.littleShortcut || '';
  s.littleShortcut = r.accel;
  if (!applyGlobal()) {
    // Déjà pris par une autre application : on revient au précédent.
    s.littleShortcut = before;
    applyGlobal();
    return { error: 'taken' };
  }
  store.save();
  if (other) shortcuts.clear(other); else shortcuts.hooks.changed();
  return { ok: true, accel: r.accel, keys: shortcuts.display(r.accel) };
}

// --- Raccourcis : diffusion ------------------------------------------------------
// Les raccourcis ont changé (ici, ou par « settings:set ») : les extensions
// recalculent ce qui leur reste, et chaque page de l'interface reçoit les nouveaux.
let keySig = null;
function syncShortcuts() {
  const s = store.state.settings;
  const sig = JSON.stringify([s.shortcuts, s.littleShortcut, s.extShortcuts]);
  if (sig === keySig) return;
  const first = keySig === null;
  keySig = sig;
  if (first) return;
  require('./ext-more').forgetReserved();
  const keys = shortcuts.keysMap();
  for (const wc of webContents.getAllWebContents()) {
    if (trusted.has(wc) && !wc.isDestroyed()) wc.send('keys', keys);
  }
}
function shortcutsChanged() {
  deps.broadcast();
}

function extensionShortcuts() {
  try {
    const more = require('./ext-more');
    const extensions = require('./extensions');
    const ses = sessions.mainSession();
    // Nom affiché : celui de la fiche d'Orbe (traduit), sinon celui que donne Chromium.
    const names = new Map([...ses.extensions.getAllExtensions().map((x) => [x.id, x.name]), ...extensions.list().map((x) => [x.id, x.name])]);
    // Chaque commande déclarée, avec ou sans raccourci : toutes se règlent ici.
    return more.commandList(ses, names).map((c) => ({ ...c, label: `${c.extension} — ${c.action ? t('keys.extAction') : c.what}` }));
  } catch {
    return [];
  }
}

function shortcutList() {
  const s = store.state.settings;
  return {
    groups: shortcuts.list(),
    global: { name: '@little', label: t('keys.globalLittle'), keys: shortcuts.display(s.littleShortcut || ''), accel: s.littleShortcut || '', defaultKeys: '', changed: !!s.littleShortcut },
    extensions: extensionShortcuts(),
    changed: Object.keys(s.shortcuts || {}).length + (s.littleShortcut ? 1 : 0) + Object.keys(s.extShortcuts || {}).length,
  };
}

// --- CSS ajouté aux pages -------------------------------------------------------
// Bandeaux de consentement des plateformes les plus répandues : masqués, et le
// défilement de la page rétabli quand le bandeau l'avait bloqué.
const BANNER_SELECTORS = [
  '#onetrust-consent-sdk', '#onetrust-banner-sdk', '#CybotCookiebotDialog', '#CybotCookiebotDialogBodyUnderlay', '#didomi-host', '#didomi-popup',
  '.didomi-popup-backdrop', '#qc-cmp2-container', '.qc-cmp2-container', '#usercentrics-root', '#truste-consent-track', '.truste_overlay',
  '.truste_box_overlay', '#axeptio_overlay', '#tarteaucitronRoot', '#tarteaucitronAlertBig', '#cookie-law-info-bar', '.cky-consent-container',
  '.cky-overlay', '#cmpbox', '#cmpbox2', '.cmpboxBG', '[id^="sp_message_container_"]', '.fc-consent-root', '#cookiescript_injected',
  '.osano-cm-window', '#iubenda-cs-banner', '.cc-window.cc-banner', '#hs-eu-cookie-confirmation', '#_evidon_banner', '.evidon-banner',
];
const BANNER_CSS = `${BANNER_SELECTORS.join(', ')} { display: none !important; }
html.sp-message-open, body.didomi-popup-open, body.cky-modal-open, html:has(#onetrust-banner-sdk), body:has(.fc-consent-root), body:has(#qc-cmp2-container) { overflow: auto !important; position: static !important; }
`;
const COLOR = /^#[0-9a-f]{6}$/i;

function extraCss(wc) {
  const s = store.state.settings;
  let css = s.cookieBanners ? BANNER_CSS : '';
  if (s.themeData) {
    // Couleurs de l'Espace de l'onglet, offertes aux pages qui veulent s'y accorder.
    let space = null;
    for (const rt of win.live.values()) {
      if (rt.wc !== wc) continue;
      const loc = rt.owner.locate(rt.id);
      space = (loc && loc.space) || rt.owner.space;
    }
    if (space && COLOR.test(space.color || '')) {
      const second = COLOR.test(space.color2 || '') ? space.color2 : space.color;
      css += `:root { --orbe-theme-color: ${space.color}; --orbe-theme-color-2: ${second}; --orbe-theme-dark: ${nativeTheme.shouldUseDarkColors ? 1 : 0}; }\n`;
    }
  }
  return css;
}

let cssSig = null;
// Appelé à chaque changement de réglage : ce qui dépend des nouveaux réglages suit.
function settingsChanged() {
  const s = store.state.settings;
  applyGlobal();
  syncShortcuts();
  const sig = [s.cookieBanners, s.themeData, s.boostsEnabled].join('|');
  if (cssSig !== null && sig !== cssSig) {
    for (const rt of win.live.values()) if (!rt.owner.incognito && !rt.wc.isDestroyed()) boosts.apply(rt.wc);
  }
  cssSig = sig;
}

// --- Quitter ---------------------------------------------------------------------
const quit = {
  confirmed: false,
  // Remplaçable par les essais.
  ask: async () => {
    const parent = BrowserWindow.getFocusedWindow() || (OrbeWindow.primary && OrbeWindow.primary.win) || undefined;
    const opts = { type: 'question', message: t('quit.title'), detail: t('quit.detail'), buttons: [t('app.quit'), t('edit.undo')], defaultId: 0, cancelId: 1 };
    const r = await (parent ? dialog.showMessageBox(parent, opts) : dialog.showMessageBox(opts));
    return r.response === 0;
  },
};
function beforeQuit(e) {
  // (Restauration d'une sauvegarde : l'accord vient d'être donné, la question n'est pas reposée.)
  if (!store.state || !store.state.settings.warnOnQuit || quit.confirmed || require('./backups').restoring()) return;
  e.preventDefault();
  quit.ask().then((ok) => { if (ok) { quit.confirmed = true; app.quit(); } }).catch(() => {});
}

// --- Import de signets -----------------------------------------------------------
async function importBookmarks(parent, { profileId = 'default' } = {}) {
  const bm = require('./import-bookmarks');
  const args = (o) => (parent && !parent.isDestroyed() ? [parent, o] : [o]);
  const pick = await dialog.showOpenDialog(...args({ title: t('bm.pick'), properties: ['openFile'], filters: [{ name: 'HTML', extensions: ['html', 'htm'] }] }));
  const file = !pick.canceled && pick.filePaths && pick.filePaths[0];
  if (!file) return { canceled: true };
  const data = bm.read(file);
  if (data.error) {
    await dialog.showMessageBox(...args({ type: 'warning', message: t('bm.err.' + data.error) }));
    return { error: data.error };
  }
  const detail = [
    t('bm.detail', { n: data.bookmarks, folders: data.folders }),
    data.dropped ? t('bm.dropped', { n: data.dropped }) : '',
    data.truncated ? t('bm.truncated', { n: bm.MAX_BOOKMARKS }) : '',
    t('bm.note'),
  ].filter(Boolean).join('\n\n');
  const r = await dialog.showMessageBox(...args({ type: 'question', message: t('bm.confirm'), detail, buttons: [t('import.go'), t('edit.undo')], defaultId: 0, cancelId: 1 }));
  if (r.response !== 0) return { canceled: true };
  const space = bm.merge(data, { profileId });
  if (!space) return { error: 'notBookmarks' };
  store.save();
  const w = OrbeWindow.primary;
  if (w && !w.incognito) { w.switchSpace(space.id); w.toast(t('bm.done', { n: data.bookmarks })); }
  for (const x of OrbeWindow.all) x.layout();
  OrbeWindow.pushAll();
  deps.refreshMenu();
  return { ok: true, bookmarks: data.bookmarks, folders: data.folders, dropped: data.dropped, space: space.id };
}

// --- Données pour la page ---------------------------------------------------------
function info() {
  const s = store.state.settings;
  return {
    panes: PANES,
    pane: PANES.includes(store.state.window.settingsPane) ? store.state.window.settingsPane : 'general',
    isDefault: isDefaultBrowser(),
    downloads: app.getPath('downloads'),
    allow: (s.adblockAllow || []).slice(),
    arc: require('./import-arc').available(),
    littleKeys: shortcuts.display(s.littleShortcut || ''),
    archiveHours: prefs.ARCHIVE_HOURS,
    memoryGb: Math.round(require('os').totalmem() / 1073741824 * 10) / 10,
  };
}

// --- Actions venant de la page des réglages ----------------------------------------
async function handle(action, a, sender) {
  const s = store.state.settings;
  switch (action) {
    case 'settings:pane':
      if (PANES.includes(a)) { store.state.window.settingsPane = a; store.save(true); }
      return true;
    case 'settings:layout':
      return layout(sender, a);
    case 'settings:close': {
      const w = BrowserWindow.fromWebContents(sender);
      if (w && w === settingsWindow) w.close();
      return true;
    }
    // Pendant l'enregistrement d'un raccourci, le menu ne doit pas réagir aux touches.
    case 'settings:recording':
      if (settingsWindow && sender === settingsWindow.webContents) sender.setIgnoreMenuShortcuts(!!a);
      return true;
    case 'settings:setProfile': {
      const ok = prefs.setForProfile(String((a && a.id) || ''), String((a && a.key) || ''), a ? a.value : undefined);
      if (ok) deps.broadcast();
      return { ok, profiles: deps.profileList() };
    }
    // Dossier des téléchargements : général (sans `id`) ou d'un profil.
    case 'settings:chooseDir': {
      const parent = BrowserWindow.fromWebContents(sender);
      const pick = await dialog.showOpenDialog(parent, { title: t('set.downloadDir'), properties: ['openDirectory', 'createDirectory'] });
      const dir = !pick.canceled && pick.filePaths && pick.filePaths[0];
      if (!dir) return { ok: false };
      let ok = false;
      if (a && a.id) ok = prefs.setForProfile(String(a.id), 'downloadDir', dir);
      else if (prefs.SETTABLE.downloadDir(dir)) { s.downloadDir = dir; store.save(); ok = true; }
      if (ok) deps.broadcast();
      return { ok, dir, profiles: deps.profileList() };
    }
    case 'settings:allowRemove':
      adblock.allowSite(String(a || ''), false);
      OrbeWindow.pushAll();
      return (s.adblockAllow || []).slice();
    case 'settings:importArc': {
      const w = OrbeWindow.primary || OrbeWindow.all[0];
      if (!w) return false;
      w.win.focus();
      await commands.run(w, 'importArc');
      return true;
    }
    case 'settings:importBookmarks':
      return importBookmarks(BrowserWindow.fromWebContents(sender), { profileId: String((a && a.profileId) || 'default') });
    case 'settings:showShortcuts': {
      const w = OrbeWindow.primary || OrbeWindow.all[0];
      if (w) { w.win.focus(); commands.run(w, 'shortcuts'); }
      return true;
    }
    case 'shortcuts:list':
      return shortcutList();
    case 'shortcuts:assign': {
      const name = String((a && a.name) || '');
      // « ext:<id>/<commande> » : raccourci d'une extension (ext-more.js).
      const r = name === '@little' ? setGlobal(a.accel, { force: !!a.force })
        : name.startsWith('ext:') ? require('./ext-more').assignKey(sessions.mainSession(), name, a && a.accel, { force: !!(a && a.force) })
          : shortcuts.assign(name, a && a.accel, { force: !!(a && a.force) });
      return { ...r, list: shortcutList() };
    }
    case 'shortcuts:clear': {
      const r = a === '@little' ? setGlobal('') : String(a || '').startsWith('ext:') ? require('./ext-more').setKey(sessions.mainSession(), a, '') : shortcuts.clear(String(a || ''));
      return { ...r, list: shortcutList() };
    }
    case 'shortcuts:reset': {
      const name = String((a && a.name) || '');
      const r = name === '@little' ? setGlobal('') : name.startsWith('ext:') ? require('./ext-more').setKey(sessions.mainSession(), name, null) : shortcuts.reset(name, { force: !!(a && a.force) });
      return { ...r, list: shortcutList() };
    }
    case 'shortcuts:resetAll':
      s.littleShortcut = '';
      s.extShortcuts = {};
      applyGlobal();
      shortcuts.resetAll();
      return { ok: true, list: shortcutList() };
    default:
      return undefined;
  }
}

function configure(d) {
  Object.assign(deps, d);
  shortcuts.hooks.changed = shortcutsChanged;
  boosts.hooks.extraCss = extraCss;
  sessions.hooks.downloadDir = (ses) => { const id = sessions.profileIdOf(ses); return id ? prefs.downloadDirFor(id) : ''; };
  cssSig = null;
  settingsChanged();
  app.on('before-quit', beforeQuit);
  app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch {} });
}

module.exports = { PANES, WIDTH, open, handle, info, configure, settingsChanged, quit, beforeQuit, importBookmarks, extraCss, BANNER_SELECTORS, setGlobal, applyGlobal, isDefaultBrowser, shortcutList, get window() { return settingsWindow; } };
