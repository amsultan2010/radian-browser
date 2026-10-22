// Petite fenêtre (⌥⌘N) : une page seule, sans barre latérale, pour un coup
// d'œil rapide. Un bouton l'envoie dans la fenêtre principale.
const { BaseWindow, WebContentsView, clipboard, nativeTheme } = require('electron');
const platform = require('./platform');
const { store } = require('./store');
const sessions = require('./sessions');
const suggest = require('./suggest');
const { trusted, UI_PRELOAD, INTERNAL, isInternal, cleanUrl, motion, place } = require('./window');

const BAR = 42;
const PAD = 6;
const SIZE = { width: 860, height: 640 };
const MIN = { width: 380, height: 260 };
const HINT = 34; // bandeau d'explication de la première petite fenêtre
// Ouverture : la fenêtre monte de quelques points en se dévoilant.
const OPEN = { ms: 180, rise: 14, step: 8 };
const HINT_MS = 12000;
const PROFILES_MAX = 200;
const easeOut = (x) => 1 - (1 - x) ** 3;

// Profil retenu pour un site : celui de l'Espace où une petite fenêtre de ce site
// a été envoyée (« Ouvrir dans un Espace »). La suivante s'ouvre avec ses connexions.
// Nom d'hôte tel qu'on accepte de le retenir : des labels de lettres, chiffres et
// tirets, ou une adresse IPv6 entre crochets. `__proto__` et ses semblables n'en sont pas.
const HOST = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$|^\[[0-9a-f:.]{2,45}\]$/;
const siteOf = (url) => {
  try {
    const u = new URL(url);
    const host = /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, '').toLowerCase() : '';
    return HOST.test(host) ? host : '';
  } catch { return ''; }
};
// Table site -> profil, sans prototype (aucun nom de site ne peut y désigner autre chose
// qu'une entrée). Ce qui vient du fichier d'état est relu : seules les entrées dont la
// clé est un nom d'hôte et la valeur un identifiant de profil sont gardées.
function profileMap() {
  const w = store.state.window || (store.state.window = {});
  const raw = w.littleProfiles;
  if (raw && typeof raw === 'object' && Object.getPrototypeOf(raw) === null) return raw;
  const map = Object.create(null);
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const k of Object.keys(raw).slice(-PROFILES_MAX)) if (HOST.test(k) && typeof raw[k] === 'string' && raw[k].length <= 64) map[k] = raw[k];
  }
  w.littleProfiles = map;
  return map;
}
function rememberedProfile(url) {
  const site = siteOf(url);
  if (!site) return null;
  const id = profileMap()[site];
  return typeof id === 'string' && hooks.profiles().includes(id) ? id : null;
}
function rememberProfile(url, profileId) {
  const site = siteOf(url);
  if (!site || typeof profileId !== 'string' || !profileId || profileId.length > 64) return false;
  const map = profileMap();
  delete map[site];
  map[site] = profileId; // le dernier retenu en dernier
  const keys = Object.keys(map);
  for (const k of keys.slice(0, Math.max(0, keys.length - PROFILES_MAX))) delete map[k];
  store.save();
  return true;
}

// Taille de la dernière petite fenêtre redimensionnée : la suivante la reprend.
function savedSize() {
  const s = store.state.window && store.state.window.littleSize;
  const ok = s && Number.isFinite(s.width) && Number.isFinite(s.height);
  return {
    width: ok ? Math.max(MIN.width, Math.min(4000, Math.round(s.width))) : SIZE.width,
    height: ok ? Math.max(MIN.height, Math.min(3000, Math.round(s.height))) : SIZE.height,
  };
}
const littles = new Map(); // id webContents de la barre -> LittleWindow
const hooks = { openInOrbe: () => {}, profileId: () => 'default', spaces: () => [], profiles: () => ['default'], profileOfSpace: () => null };

class LittleWindow {
  static ownerOf(wc) { return littles.get(wc.id) || null; }
  static get all() { return [...littles.values()]; }

  // Lien venu d'une autre application : s'il est déjà affiché dans une petite
  // fenêtre, celle-ci revient au premier plan au lieu d'en ouvrir une seconde.
  static openOrFocus(url) {
    const same = LittleWindow.all.find((l) => !l.win.isDestroyed() && l.url && l.url === suggest.resolve(url));
    if (!same) return new LittleWindow(url);
    same.usedAt = Date.now();
    if (same.win.isMinimized()) same.win.restore();
    same.win.show();
    same.win.focus();
    return same;
  }

  // Réglage « Archiver les petites fenêtres après » : celles qui n'ont pas servi
  // depuis ce délai sont fermées, leur page rangée dans l'archive.
  static archiveStale(now = Date.now()) {
    const hours = store.state.settings.littleArchiveHours;
    if (!hours) return 0;
    let n = 0;
    for (const l of LittleWindow.all) {
      if (l.win.isDestroyed() || l.win.isFocused() || now - l.usedAt < hours * 36e5) continue;
      if (l.url) store.archive({ url: l.url, title: l.title || l.url });
      l.win.close();
      n += 1;
    }
    return n;
  }

  constructor(input) {
    // Même profil (cookies, connexions) que l'Espace affiché à l'ouverture.
    this.url = input ? suggest.resolve(input) : '';
    if (isInternal(this.url)) this.url = '';
    // … sauf si un profil a été retenu pour ce site.
    this.profileId = rememberedProfile(this.url) || hooks.profileId();
    this.title = '';
    this.loading = false;
    this.usedAt = Date.now();
    // Première petite fenêtre : un bandeau dit à quoi elle sert (une seule fois).
    const seen = store.state.window && store.state.window.littleSeen;
    this.hint = !seen;
    if (!seen) { (store.state.window || (store.state.window = {})).littleSeen = true; store.save(); }
    const ms = motion(OPEN.ms);
    this.win = new BaseWindow({
      ...savedSize(),
      show: !ms,
      minWidth: MIN.width,
      minHeight: MIN.height,
      ...platform.windowChrome({ traffic: { x: 14, y: 13 }, dark: nativeTheme.shouldUseDarkColors }),
    });
    this.win.orbeLittle = this;
    this.ui = new WebContentsView({ webPreferences: { preload: UI_PRELOAD, sandbox: true, contextIsolation: true } });
    this.ui.setBackgroundColor('#00000000');
    trusted.add(this.ui.webContents);
    littles.set(this.ui.webContents.id, this);
    this.uiId = this.ui.webContents.id;
    this.win.contentView.addChildView(this.ui);
    this.ui.webContents.loadURL(INTERNAL + 'little.html');
    this.ui.webContents.once('did-finish-load', () => { if (this.win.isDestroyed() || this.ui.webContents.isDestroyed()) return; this.send(); if (!this.url) this.ui.webContents.focus(); });
    this.win.on('resize', () => this.layout());
    // Taille choisie à la main : retenue pour les prochaines petites fenêtres.
    this.win.on('resized', () => this.rememberSize());
    this.win.on('focus', () => { this.usedAt = Date.now(); });
    this.win.on('blur', () => { this.usedAt = Date.now(); });
    this.win.on('closed', () => {
      littles.delete(this.uiId);
      for (const v of [this.ui, this.view]) if (v && !v.webContents.isDestroyed()) v.webContents.close();
    });
    if (this.url) this.load(this.url);
    this.layout();
    if (ms) this.animateIn(ms);
    if (this.hint) { this.hintTimer = setTimeout(() => this.closeHint(), HINT_MS); if (this.hintTimer.unref) this.hintTimer.unref(); }
  }

  // Ouverture : opacité de 0 à 1 et montée de quelques points, en `ms`. Seules la
  // position et l'opacité de la fenêtre changent : son contenu n'est pas remis en page.
  animateIn(ms) {
    const win = this.win;
    const [x, y] = win.getPosition();
    const t0 = Date.now();
    this.opening = { ms, steps: 0 };
    win.setOpacity(0);
    win.setPosition(x, y + OPEN.rise);
    win.show();
    const end = () => {
      clearInterval(timer);
      this.opening = null;
      if (win.isDestroyed()) return;
      win.setOpacity(1);
      // Fenêtre déplacée à la main pendant l'ouverture : on ne la ramène pas.
      if (!moved) win.setPosition(x, y);
    };
    let moved = false;
    let last = y + OPEN.rise;
    const timer = setInterval(() => {
      if (win.isDestroyed()) return end();
      const k = Math.min(1, (Date.now() - t0) / ms);
      if (win.getPosition()[1] !== last || win.getPosition()[0] !== x) moved = true;
      if (k >= 1) return end();
      this.opening.steps += 1;
      win.setOpacity(easeOut(k));
      if (!moved) { last = Math.round(y + OPEN.rise * (1 - easeOut(k))); win.setPosition(x, last); }
    }, OPEN.step);
  }

  closeHint() {
    clearTimeout(this.hintTimer);
    if (!this.hint || this.win.isDestroyed()) return;
    this.hint = false;
    this.layout(motion(160));
    this.send();
  }

  rememberSize() {
    if (this.win.isDestroyed() || this.win.isFullScreen() || this.win.isMinimized()) return;
    const [width, height] = this.win.getSize();
    (store.state.window || (store.state.window = {})).littleSize = { width, height };
    store.save();
  }

  // `ms` : la page glisse à sa place (bandeau refermé), animée par le système.
  layout(ms = 0) {
    const [W, H] = this.win.getContentSize();
    this.ui.setBounds({ x: 0, y: 0, width: W, height: H });
    const top = BAR + (this.hint ? HINT : 0);
    if (this.view) place(this.view, { x: PAD, y: top, width: W - 2 * PAD, height: H - top - PAD }, ms);
  }

  load(input) {
    const url = suggest.resolve(input);
    // Une petite fenêtre n'affiche que des pages web : jamais une page d'Orbe.
    if (isInternal(url)) return;
    this.url = url;
    if (!this.view) {
      this.view = new WebContentsView({ webPreferences: { session: sessions.profileSession(this.profileId), sandbox: true, contextIsolation: true } });
      this.view.setBackgroundColor('#ffffff');
      this.view.setBorderRadius(9);
      this.win.contentView.addChildView(this.view);
      const wc = this.view.webContents;
      wc.on('did-start-loading', () => { this.loading = true; this.send(); });
      wc.on('did-stop-loading', () => { this.loading = false; this.send(); });
      wc.on('page-title-updated', (e, title) => { this.title = title; this.send(); });
      const nav = (u) => { this.url = u; store.visit(u, this.title, ''); this.send(); };
      wc.on('did-navigate', (e, u) => nav(u));
      wc.on('did-navigate-in-page', (e, u, main) => { if (main) nav(u); });
      // « Quitter la page ? » : la question est posée (unload.js).
      wc.on('will-prevent-unload', (e) => { if (require('./unload').confirm(this.win, wc)) e.preventDefault(); });
      // Comme pour un onglet : une page web ne mène jamais à une page d'Orbe.
      const guard = (e, u) => { if (isInternal(u)) e.preventDefault(); };
      wc.on('will-navigate', guard);
      wc.on('will-redirect', guard);
      wc.setVisualZoomLevelLimits(1, 5).catch(() => {});
      wc.setWindowOpenHandler((d) => { if (/^https?:/i.test(d.url)) hooks.openInOrbe(d.url); return { action: 'deny' }; });
      this.layout();
    }
    this.view.webContents.loadURL(url).catch(() => {});
    this.view.webContents.focus();
    this.send();
  }

  send() {
    if (this.ui.webContents.isDestroyed()) return;
    const s = store.state.settings;
    // `spaces` : liste du menu « Ouvrir dans… », tant qu'il est ouvert.
    this.ui.webContents.send('state', { lang: s.lang, appearance: s.appearance, url: this.url, title: this.title, loading: this.loading, hint: !!this.hint, spaces: this.menu ? hooks.spaces() : null });
  }

  // « Ouvrir dans… » : choix de l'Espace de destination (⌥⌘O dans Arc), avec un
  // champ pour chercher parmi les Espaces. La liste se dessine dans la barre de
  // la fenêtre, passée pour l'occasion au-dessus de la page.
  openInMenu() {
    if (!this.url || this.win.isDestroyed()) return;
    if (this.menu) return this.closeMenu();
    if (!hooks.spaces().length) return;
    this.menu = true;
    this.win.contentView.addChildView(this.ui);
    this.send();
    this.ui.webContents.focus();
  }

  closeMenu() {
    if (!this.menu || this.win.isDestroyed()) return;
    this.menu = false;
    if (this.view) { this.win.contentView.addChildView(this.view); this.view.webContents.focus(); }
    this.send();
  }

  // Espace choisi dans le menu : l'identifiant doit être celui d'un Espace existant.
  openInSpace(id) {
    if (!this.url || !hooks.spaces().some((sp) => sp.id === id)) return;
    rememberProfile(this.url, hooks.profileOfSpace(id));
    hooks.openInOrbe(this.url, id);
    this.win.close();
  }

  copyUrl() {
    if (this.url) clipboard.writeText(cleanUrl(this.url));
  }

  openInOrbe() {
    if (!this.url) return;
    hooks.openInOrbe(this.url);
    this.win.close();
  }

  handle(action, a) {
    if (action === 'ready') return this.send();
    if (action === 'navigate') return this.load(String(a));
    if (action === 'openInOrbe') return this.openInOrbe();
    if (action === 'openInMenu') return this.openInMenu();
    if (action === 'closeMenu') return this.closeMenu();
    if (action === 'openInSpace') return this.openInSpace(String(a));
    if (action === 'copyUrl') return this.copyUrl();
    if (action === 'closeHint') return this.closeHint();
    return undefined;
  }

  // Raccourcis du menu applicables à une petite fenêtre.
  run(name) {
    const wc = this.view && this.view.webContents;
    switch (name) {
      case 'commandBar': case 'newTab': this.ui.webContents.focus(); this.ui.webContents.send('edit'); return true;
      case 'reload': if (wc) wc.reload(); return true;
      case 'forceReload': if (wc) wc.reloadIgnoringCache(); return true;
      case 'back': if (wc) wc.navigationHistory.goBack(); return true;
      case 'forward': if (wc) wc.navigationHistory.goForward(); return true;
      case 'copyUrl': this.copyUrl(); return true;
      case 'devtools': if (wc) wc.toggleDevTools(); return true;
      case 'zoomIn': if (wc) wc.setZoomLevel(wc.getZoomLevel() + 0.5); return true;
      case 'zoomOut': if (wc) wc.setZoomLevel(wc.getZoomLevel() - 0.5); return true;
      case 'actualSize': if (wc) wc.setZoomLevel(0); return true;
      case 'print': if (wc) wc.print(); return true;
      // Comme dans Arc : ⌘O envoie la page dans la fenêtre principale.
      case 'expandPeek': case 'togglePin': this.openInOrbe(); return true;
      case 'openInSpace': this.openInMenu(); return true;
      default: return false;
    }
  }
}

module.exports = { LittleWindow, hooks, savedSize, OPEN, HINT, rememberedProfile, rememberProfile, siteOf, profileMap };
