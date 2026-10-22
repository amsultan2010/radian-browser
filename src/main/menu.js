// Barre de menus native, calquée sur celle d'Arc (mêmes rubriques, mêmes
// raccourcis), traduite. Reconstruite seulement quand un libellé change.
const { Menu, BaseWindow, app } = require('electron');
const { store } = require('./store');
const { OrbeWindow } = require('./window');
const commands = require('./commands');
const platform = require('./platform');
const shortcuts = require('./shortcuts');

const t = (k, v) => store.t(k, null, v);
let lastSignature = '';
let timer = null;

// Orbe est-il le navigateur par défaut ? (coche du menu, comme dans Arc.) La
// réponse du système est relue au plus toutes les dix secondes.
let defaultAt = 0;
let defaultIs = false;
function isDefaultBrowser(fresh) {
  const now = Date.now();
  if (fresh || now - defaultAt > 10000) {
    defaultAt = now;
    try { defaultIs = app.isDefaultProtocolClient('http'); } catch { defaultIs = false; }
  }
  return defaultIs;
}

// Boutons des extensions de la fenêtre, pour le menu Extensions.
function extensionActions(w) {
  try { return require('./ext-host').actionsFor(w) || []; } catch { return []; }
}

function dispatch(name, arg) {
  const focused = BaseWindow.getFocusedWindow();
  const win = OrbeWindow.focused;
  // Fenêtre annexe au premier plan (réglages, petite fenêtre) : elle gère
  // elle-même la fermeture, le reste s'adresse à la fenêtre principale.
  if (focused && !win) {
    if (name === 'closeTab' || name === 'closeWindow') return focused.close();
    if (name === 'stayOnTop') { focused.setAlwaysOnTop(!focused.isAlwaysOnTop()); return refresh(true); }
    if (focused.orbeLittle && focused.orbeLittle.run(name)) return undefined;
  }
  return commands.run(win || OrbeWindow.primary, name, arg);
}

function item(name, extra = {}) {
  const c = commands.byName.get(name);
  return { label: t(extra.labelKey || c.label), accelerator: shortcuts.accelOf(name), click: () => dispatch(name), ...extra, labelKey: undefined };
}

function build() {
  const w = OrbeWindow.focused || OrbeWindow.primary;
  const s = store.state.settings;
  const sep = { type: 'separator' };
  const loc = w && w.activeId ? w.locate(w.activeId) : null;
  const pinned = !!loc && loc.list !== 'today';
  const tab = w && w.activeId ? w.data.tabs[w.activeId] : null;
  const setAppearance = (v) => () => commands.setSetting('appearance', v);

  const spaces = w ? w.data.spaces : [];
  const exts = extensionActions(w);
  const template = [
    {
      label: 'Orbe',
      submenu: [
        { label: t('app.about'), role: 'about' },
        item('checkUpdates'),
        sep,
        item('settings'),
        item('passwords'),
        item('defaultBrowser', { type: 'checkbox', checked: isDefaultBrowser(true), click: () => { dispatch('defaultBrowser'); refresh(true); } }),
        ...(platform.isWin ? [item('undoDefaultBrowser')] : []),
        sep,
        ...(platform.arcSidebarFile() || platform.isMac ? [item('importArc')] : []),
        ...(platform.arcUserDataDir() ? [item('importArcData')] : []),
        item('importBookmarks'),
        sep,
        { label: t('app.services'), role: 'services' },
        sep,
        { label: t('app.hide'), role: 'hide' },
        { label: t('app.hideOthers'), role: 'hideOthers' },
        { label: t('app.showAll'), role: 'unhide' },
        sep,
        { label: t('app.quit'), role: 'quit' },
      ],
    },
    {
      label: t('menu.file'),
      submenu: [
        item('newTab'), item('newWindow'), item('newBlank', { toolTip: t('blank.body') }), item('newIncognito'), item('newLittle'), item('newNote'), item('newNoteSplit'), item('newEasel'), item('reopen'),
        sep, item('commandBar'), item('newProfile', { enabled: !!w && w.shared }),
        sep, item('closeTab'), item('closeWindow'),
        sep, ...(platform.isMac ? [item('share', { enabled: !!tab && /^https?:/i.test(tab.url) })] : []), item('capture'), item('captureFull'), item('capturePortrait'), item('captureToEasel'), item('savePage'), item('print'),
      ],
    },
    {
      label: t('menu.edit'),
      submenu: [
        // Comme dans Arc : le libellé nomme l'action de la barre latérale concernée.
        item('undo', { label: [t('edit.undo'), w && w.pendingLabel('undo') ? t(w.pendingLabel('undo')) : ''].join(' ').trim() }),
        item('redo', { label: [t('edit.redo'), w && w.pendingLabel('redo') ? t(w.pendingLabel('redo')) : ''].join(' ').trim() }),
        sep,
        { label: t('edit.cut'), role: 'cut' },
        { label: t('edit.copy'), role: 'copy' },
        item('copyUrl'), item('copyUrlMarkdown'), item('copyUrlQuote'),
        { label: t('edit.paste'), role: 'paste' },
        { label: t('edit.pasteMatch'), role: 'pasteAndMatchStyle' },
        item('pasteUrl'),
        { label: t('edit.selectAll'), role: 'selectAll' },
        sep,
        item('find'), item('findReplace'), item('findNext'), item('findPrev'), item('useSelectionFind'), item('jumpToSelection'),
        sep,
        // Orthographe, substitutions, transformations, parole, police : comme le menu Édition d'Arc.
        { label: t('edit.spelling'), submenu: [{ label: t('edit.spellCheck'), role: 'toggleSpellChecker' }] },
        ...(platform.isMac ? [{
          label: t('edit.substitutions'),
          submenu: [
            { label: t('edit.showSubstitutions'), role: 'showSubstitutions' },
            sep,
            { label: t('edit.smartQuotes'), role: 'toggleSmartQuotes' },
            { label: t('edit.smartDashes'), role: 'toggleSmartDashes' },
            { label: t('edit.textReplacement'), role: 'toggleTextReplacement' },
          ],
        }] : []),
        { label: t('edit.transformations'), submenu: [item('transformUpper'), item('transformLower'), item('transformCapitalize')] },
        ...(platform.isMac ? [{ label: t('edit.speech'), submenu: [{ label: t('edit.startSpeaking'), role: 'startSpeaking' }, { label: t('edit.stopSpeaking'), role: 'stopSpeaking' }] }] : []),
        { label: t('edit.format'), submenu: [{ label: t('edit.font'), submenu: [item('formatB'), item('formatI'), item('formatU')] }] },
      ],
    },
    {
      label: t('menu.view'),
      submenu: [
        {
          label: t('view.appearance'),
          submenu: [
            { label: t('view.auto'), type: 'radio', checked: s.appearance === 'auto', click: setAppearance('auto') },
            { label: t('view.light'), type: 'radio', checked: s.appearance === 'light', click: setAppearance('light') },
            { label: t('view.dark'), type: 'radio', checked: s.appearance === 'dark', click: setAppearance('dark') },
          ],
        },
        sep,
        item('toggleSidebar', { labelKey: w && !w.sidebarVisible ? 'view.showSidebar' : 'view.hideSidebar' }),
        item('toggleToolbar', { labelKey: s.showToolbar ? 'view.hideToolbar' : 'view.showToolbar' }),
        item('collapsePinned', { labelKey: w && w.space.pinnedCollapsed ? 'view.expandPinned' : 'view.collapsePinned' }),
        sep,
        item('stop'), item('reload'), item('forceReload'), item('clearCookies'), item('clearCache'),
        sep,
        item('addSplit'), item('splitDirection'), item('closeSplit'),
        item('separateSplit', { enabled: !!w && !!w.activeId && !!w.groupOf(w.activeId) }),
        item('separateAll', { enabled: !!w && !!w.activeId && !!w.groupOf(w.activeId) }),
        item('expandSplit', { enabled: !!w && !!w.activeId && !!w.groupOf(w.activeId) }),
        item('nextPane', { visible: false, acceleratorWorksWhenHidden: true }), item('prevPane', { visible: false, acceleratorWorksWhenHidden: true }),
        ...[1, 2, 3, 4].map((n) => item('pane' + n, { label: `${t('view.pane')} ${n}`, visible: false, acceleratorWorksWhenHidden: true })),
        sep,
        item('boost'), item('zap'), item('boosts'),
        sep,
        item('actualSize'), item('zoomIn'), item('zoomOut'),
        sep,
        { label: t('view.developer'), submenu: [item('source'), item('devtools'), item('inspect'), item('console'), item('network'), sep, item('toggleDevMode', { type: 'checkbox', checked: !!tab && require('./prefs').devMode(tab.url), enabled: !!tab && !!require('./prefs').hostOf(tab.url) && !w.incognito }), sep, item('taskManager')] },
        sep,
        item('fullscreen'),
      ],
    },
    {
      label: t('menu.spaces'),
      submenu: [
        // (Sans fenêtre, la commande en ouvre une : l'article reste disponible.)
        item('newSpace', { enabled: !w || w.shared }), item('editTheme'), item('renameSpace'),
        {
          label: t('spaces.profile'),
          enabled: !!w && w.shared,
          submenu: [
            ...(w ? w.data.profiles : []).map((p) => ({
              label: p.name,
              type: 'radio',
              checked: !!w && w.space.profileId === p.id,
              click: () => { const win = OrbeWindow.focused || OrbeWindow.primary; if (win) win.setProfile(p.id); },
            })),
            sep,
            item('newProfile'),
          ],
        },
        item('deleteSpace', { enabled: spaces.length > 1 }),
        item('manageSpaces'),
        sep, item('nextSpace'), item('prevSpace'),
        sep,
        ...spaces.map((sp, i) => ({
          label: require('./window').spaceLabel(sp, store.state, w && w.shared ? w.space.profileId : null, '  '),
          type: 'checkbox',
          checked: !!w && sp.id === w.spaceId,
          accelerator: i < 9 ? platform.accel(`Ctrl+${i + 1}`) : undefined,
          click: () => { const win = OrbeWindow.focused || OrbeWindow.primary; if (win) win.switchSpace(sp.id); },
        })),
      ],
    },
    {
      label: t('menu.tabs'),
      submenu: [
        item('newTab', { accelerator: undefined }),
        item('togglePin', { labelKey: pinned ? 'tabs.unpin' : 'tabs.pin' }),
        item('newFolder'),
        item('duplicate'),
        item('expandPeek', { enabled: !!w && !!w.peekState }),
        item('openInSpace', { visible: false, acceleratorWorksWhenHidden: true }),
        item('toggleMute', { labelKey: tab && tab.muted ? 'tabs.unmute' : 'tabs.mute' }),
        sep, item('nextTab'), item('prevTab'), item('revealTab', { enabled: !!tab }),
        sep, item('clearToday'), item('resetTabs'),
        // ⌘1…⌘9 : accès direct aux onglets, dans l'ordre de la barre latérale.
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
          label: `Onglet ${n}`,
          visible: false,
          acceleratorWorksWhenHidden: true,
          accelerator: platform.accel(`Cmd+${n}`),
          click: () => { const win = OrbeWindow.focused; if (win) win.tabAt(n); },
        })),
      ],
    },
    {
      label: t('menu.archive'),
      submenu: [item('back'), item('forward'), sep, item('history'), item('viewArchive'), item('clearArchive')],
    },
    {
      label: t('menu.extensions'),
      submenu: [
        // Une ligne par extension : comme un clic sur son bouton.
        ...exts.map((x) => ({
          label: x.title || x.name || x.id,
          enabled: x.enabled !== false,
          click: () => { const win = OrbeWindow.focused || OrbeWindow.primary; if (win) require('./ext-host').openPopup(win, x.id); },
        })),
        // ⌘E : d'une extension à la suivante, comme dans Arc.
        ...(exts.length ? [sep, item('cycleExtensions'), sep] : []),
        { label: t('ext.add'), click: () => commands.hooks.openSettings('extensions') },
        { label: t('ext.manage'), click: () => commands.hooks.openSettings('extensions') },
      ],
    },
    {
      label: t('menu.window'),
      role: 'window',
      submenu: [
        item('stayOnTop', { type: 'checkbox', checked: !!w && w.win.isAlwaysOnTop() }),
        { label: t('window.minimize'), role: 'minimize' },
        ...(platform.isMac ? [{ label: t('window.minimizeAll'), accelerator: 'Alt+Cmd+M', click: () => commands.minimizeAll() }] : []),
        { label: t('window.zoom'), role: 'zoom' },
        sep, item('library'), item('downloads'), item('media'), item('notes'), item('easels'),
        sep, { label: t('window.front'), role: 'front' },
      ],
    },
    { label: t('menu.help'), role: 'help', submenu: [item('welcome'), item('shortcuts'), item('helpCenter'), item('whatsNew'), item('reportIssue'), item('support'), item('github'), sep, item('exportNotes'), sep, { label: t('help.troubleshooting'), submenu: [item('revealData'), item('copyInfo'), item('taskManager'), item('recordTrace', { labelKey: commands.tracing() ? 'help.stopTrace' : 'help.recordTrace' }), sep, { label: t('backup.menu'), submenu: require('./backups').menuItems() }] }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(platform.menuTemplate(template)));
  if (platform.isMac && app.dock) app.dock.setMenu(Menu.buildFromTemplate(dockTemplate()));
}

// Menu du Dock, comme dans Arc : fenêtre de navigation privée, et toutes les
// petites fenêtres masquées ou réaffichées d'un coup.
function dockTemplate() {
  const littles = () => require('./little').LittleWindow.all.filter((l) => l.win && !l.win.isDestroyed());
  const shown = littles().some((l) => l.win.isVisible());
  return [
    { label: t('file.newIncognito'), click: () => dispatch('newIncognito') },
    {
      label: t(shown || !littles().length ? 'dock.hideLittle' : 'dock.showLittle'),
      enabled: littles().length > 0,
      click: () => { for (const l of littles()) { if (shown) l.win.hide(); else l.win.show(); } refresh(true); },
    },
  ];
}

// Appelé à chaque changement d'état : ne reconstruit le menu que si ce qu'il
// affiche a réellement changé.
// Une reconstruction déjà prévue n'est pas repoussée par les appels suivants : des
// changements d'état rapprochés (page qui charge, machine chargée) la retardaient
// sans fin, et le menu gardait des articles grisés d'avant l'ouverture de la fenêtre.
let forced = false;
function refresh(force) {
  if (timer && (!force || forced)) return;
  clearTimeout(timer);
  forced = !!force;
  timer = setTimeout(() => {
    timer = null;
    forced = false;
    const w = OrbeWindow.focused || OrbeWindow.primary;
    const s = store.state.settings;
    const loc = w && w.activeId ? w.locate(w.activeId) : null;
    const tab = w && w.activeId ? w.data.tabs[w.activeId] : null;
    const sig = JSON.stringify([
      s.lang, s.appearance, s.showToolbar, w && w.id, w && w.sidebarVisible, w && w.spaceId,
      loc && loc.list, tab && tab.muted, w ? w.data.spaces.map((x) => x.icon + x.name) : 0,
      w && w.space.profileId, w ? w.data.profiles.length : 0, !!(w && w.peekState),
      w && w.pendingLabel('undo'), w && w.pendingLabel('redo'),
      s.shortcuts, s.devSites, s.devOff, s.devLocalhost, tab && tab.url && require('./prefs').hostOf(tab.url),
      w && w.space.pinnedCollapsed, !!(w && w.activeId && w.groupOf(w.activeId)), !!(w && w.win.isAlwaysOnTop()),
      commands.tracing(), !!(w && w.shared), isDefaultBrowser(), extensionActions(w).map((x) => [x.id, x.title, x.enabled]),
    ]);
    if (!force && sig === lastSignature) return;
    lastSignature = sig;
    build();
  }, force ? 0 : 120);
}

commands.hooks.menuChanged = () => refresh(true);

module.exports = { refresh, build, dockTemplate };
