// Branche sur les fenêtres d'Orbe ce qu'un navigateur de tous les jours doit
// savoir faire : feuilles d'onglet, autorisations, partage d'écran, certificats,
// authentification HTTP, « quitter la page ? », fenêtres surgissantes, pages
// plantées. Chaque fonction vit dans son module ; ici, seulement les raccords
// avec window.js (ses `hooks`).
const sheets = require('./sheets');
const permissions = require('./permissions');
const displayMedia = require('./display-media');
const capture = require('./capture-state');
const certs = require('./certs');
const auth = require('./auth');
const unload = require('./unload');
const popups = require('./popups');
const downloads = require('./downloads');
const { store } = require('./store');

const t = (key, vars) => store.t(key, null, vars);

// Informations du site affiché : connexion, certificat, autorisations.
function siteInfo(w) {
  const rt = w.activeRt;
  const tab = w.activeId && w.data.tabs[w.activeId];
  if (!rt || !tab || rt.internal || rt.wc.isDestroyed()) return null;
  const wc = rt.wc;
  const ses = wc.session;
  const url = rt.failed ? tab.url : (wc.getURL() || tab.url);
  const origin = permissions.originOf(url);
  const payload = () => {
    const perms = permissions.list(ses, origin);
    if (certs.hasException(ses, url)) perms.unshift({ key: 'cert-exception', label: t('site.certException'), value: true });
    return {
      site: permissions.siteName(origin) || url.slice(0, 80),
      security: certs.state(wc, url) || 'other',
      cert: /^https:/i.test(url) ? certs.certFor(ses, url) : null,
      perms,
      capture: capture.of(wc).map((k) => t('capture.' + k)),
    };
  };
  return sheets.open(wc, 'site', payload(), {
    onAction: (name, arg) => {
      if (name !== 'reset') return null;
      let reload = false;
      if (arg === 'cert-exception' || arg === '*') reload = certs.revoke(ses, url);
      if (arg !== 'cert-exception') permissions.reset(ses, origin, arg);
      w.changed();
      // Exception retirée : les connexions déjà ouvertes avec ce certificat sont
      // coupées, sinon Chromium continuerait de s'en servir sans rien revérifier.
      if (reload && !wc.isDestroyed()) { ses.closeAllConnections().catch(() => {}).then(() => { if (!wc.isDestroyed()) wc.reload(); }); return null; }
      return { kind: 'site', cover: false, ...payload() };
    },
  });
}

// --- Centre de contrôle du site -------------------------------------------------
// Le panneau qu'ouvre le bouclier : bloqueur, autorisations, cookies et données,
// Boost, mode développeur, extensions, lien. C'est une feuille d'onglet (sheets.js) :
// une vue d'Orbe que la page ne peut ni lire, ni recouvrir, ni actionner.
//
// Ce qu'il affiche vient du processus principal (origine de l'adresse engagée par
// l'onglet, compteurs, réglages) ; les textes choisis par d'autres (nom du site, nom
// d'une extension) partent comme du texte. Chaque action est revérifiée ICI, au
// moment où elle arrive (`fresh`) : l'onglet est toujours celui du panneau, toujours
// affiché et actif, et son origine est toujours celle pour laquelle le panneau a été
// dressé — pas celle du moment où il s'est ouvert. Sinon rien n'est fait et le
// panneau se ferme. Les actions qui changent quelque chose attendent en plus la
// demi-seconde de garde des feuilles (clic préparé par la page).
const CONTROL_MUTATING = new Set(['shield', 'shieldAll', 'reset', 'cookies', 'cache', 'boost', 'dev']);
function siteControl(w, deps = {}) {
  const { adblock, boosts, prefs, extActions, openExtPopup, live } = { ...controlDeps, ...deps };
  const rt = w.activeRt;
  const tab = w.activeId && w.data.tabs[w.activeId];
  if (!rt || !tab || rt.internal || rt.wc.isDestroyed()) return null;
  const wc = rt.wc;
  const ses = wc.session;
  // Adresse engagée par l'onglet (rapportée par le moteur) ; page d'erreur : celle qu'il a tenté de charger.
  const urlNow = () => (rt.failed ? tab.url : (wc.getURL() || tab.url));
  const url = urlNow();
  if (!/^https?:/i.test(url)) return null;
  const origin = permissions.originOf(url);
  if (!origin || origin === 'null') return null;
  let cookies = null;
  const payload = () => {
    const u = urlNow();
    const perms = permissions.list(ses, origin);
    if (certs.hasException(ses, u)) perms.unshift({ key: 'cert-exception', label: t('site.certException'), value: true });
    const host = boosts.hostOf(u);
    const has = !w.incognito && boosts.has(host);
    return {
      site: permissions.siteName(origin),
      security: certs.state(wc, u) || 'other',
      blocked: adblock.stats().blockedByTab.get(wc.id) || 0,
      adblock: { on: !!store.state.settings.adblock, site: !adblock.isSiteAllowed(u) },
      perms,
      capture: capture.of(wc).map((k) => t('capture.' + k)),
      cookies,
      boost: { can: !w.incognito, has, enabled: has && !!boosts.get(host).enabled, all: store.state.settings.boostsEnabled !== false },
      dev: { can: !w.incognito && !!prefs.hostOf(u), on: prefs.devMode(u), auto: prefs.devAuto(u), keys: require('./shortcuts').keysOf('toggleDevMode') || '' },
      extensions: (extActions(w) || []).slice(0, 40).map((x) => ({ id: String(x.id), title: String(x.title || '').slice(0, 80), badge: String(x.badgeText || '').slice(0, 8), enabled: x.enabled !== false })),
      share: process.platform === 'darwin',
    };
  };
  const count = () => ses.cookies.get({ url: urlNow() }).then((list) => { cookies = list.length; }, () => { cookies = null; });
  // L'onglet du panneau est-il toujours le même site, affiché et actif ?
  const fresh = () => !wc.isDestroyed() && live.get(rt.id) === rt && w.activeRt === rt && !w.win.isDestroyed() && permissions.originOf(urlNow()) === origin;
  const sheet = sheets.open(wc, 'control', payload(), {
    onAction: async (name, arg, self) => {
      if (!fresh()) { self.close(null); return null; }
      if (CONTROL_MUTATING.has(name) && !(self.armedAt && Date.now() - self.armedAt >= sheets.GUARD)) return null;
      const again = () => ({ kind: 'control', cover: false, ...payload() });
      switch (name) {
        // Bloqueur pour ce site : la page est rechargée (le panneau se ferme avec elle).
        case 'shield': if (store.state.settings.adblock) w.toggleSiteBlocking(); return null;
        case 'shieldAll': require('./commands').setSetting('adblock', !store.state.settings.adblock); return again();
        case 'reset': {
          let reload = false;
          if (arg === 'cert-exception' || arg === '*') reload = certs.revoke(ses, urlNow());
          if (arg !== 'cert-exception') permissions.reset(ses, origin, String(arg));
          w.changed();
          if (reload) { ses.closeAllConnections().catch(() => {}).then(() => { if (!wc.isDestroyed()) wc.reload(); }); return null; }
          return again();
        }
        // Cookies et données enregistrées par CE site (son origine), puis rechargement.
        case 'cookies':
          await ses.clearStorageData({ origin, storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'] }).catch(() => {});
          if (fresh()) wc.reloadIgnoringCache();
          return null;
        // Le cache HTTP n'est pas rangé par site : c'est celui du profil entier qui est vidé.
        case 'cache':
          await ses.clearCache().catch(() => {});
          if (fresh()) wc.reloadIgnoringCache();
          return null;
        case 'boost': w.toggleBoost(); return again();
        case 'dev': w.toggleDevMode(); return again();
        case 'copy': w.copyUrl(false); return null;
        case 'refresh': await count(); return fresh() ? again() : null;
        // Les suivantes ferment le panneau puis passent la main.
        case 'boostEdit': self.close(null); w.run('boost'); return null;
        case 'zap': self.close(null); w.run('zap'); return null;
        case 'share': self.close(null); w.share(); return null;
        case 'capture': self.close(null); w.capture(); return null;
        case 'details': self.close(null); siteInfo(w); return null;
        case 'ext': {
          const x = (extActions(w) || []).find((e) => String(e.id) === String(arg) && e.enabled !== false);
          self.close(null);
          if (x) openExtPopup(w, x.id);
          return null;
        }
        default: return null;
      }
    },
  });
  if (sheet) { sheet.origin = origin; count().then(() => { if (!sheet.closed && fresh()) sheet.update(payload()); }); }
  return sheet;
}
const controlDeps = {
  get adblock() { return require('./adblock'); },
  get boosts() { return require('./boosts'); },
  get prefs() { return require('./prefs'); },
  extActions: (w) => { try { return require('./ext-host').actionsFor(w) || []; } catch { return []; } },
  openExtPopup: (w, id) => require('./ext-host').openPopup(w, id, { x: 12, y: 86 }),
  live: new Map(),
};

// Menu du témoin de capture (caméra, micro, écran) d'un onglet.
function captureMenu(w, rt) {
  if (!rt || rt.wc.isDestroyed()) return;
  const kinds = capture.of(rt.wc);
  if (!kinds.length) return;
  w.popup([
    ...kinds.map((k) => ({ label: t('capture.' + k), enabled: false })),
    { type: 'separator' },
    { label: t('capture.stop'), click: () => capture.stop(rt.wc) },
  ]);
}

function setup({ win, sessions, test = false }) {
  const { OrbeWindow, live, trusted, hooks, UI_PRELOAD, INTERNAL } = win;
  const locate = (wc) => { for (const rt of live.values()) if (rt.wc === wc) return { owner: rt.owner, rt }; return null; };
  const ownerOf = (wc) => { try { return wc ? OrbeWindow.ownerOf(wc) : null; } catch { return null; } };
  const ownerWindow = (wc) => { const o = ownerOf(wc); return o ? o.win : null; };
  const toast = (wc, text) => { const o = ownerOf(wc); if (o) o.toast(text); };

  sheets.configure({ trusted, uiPreload: UI_PRELOAD, internal: INTERNAL, locate });
  controlDeps.live = live;
  // Geste récent de l'utilisateur dans un onglet (relevé par popups.gesture) : sert au partage d'écran et aux liens externes.
  const gesture = (wc) => { const where = locate(wc); if (!where) return null; return where.rt.gesture ? Date.now() - where.rt.gesture : Infinity; };
  permissions.setup({ test, toast, ownerWindow, gesture });
  displayMedia.setup({ test, toast });
  certs.setup();
  auth.setup();
  unload.setup();
  capture.hooks.changed = () => OrbeWindow.pushAll();
  Object.assign(downloads.env, {
    ownerWindow,
    profileSession: (id) => sessions.profileSession(id),
    gate: (ses, wc, item) => permissions.downloadGate(ses, wc, { gesture: item.hasUserGesture(), url: item.getURL() }),
    openInTab: (url, wc) => { const o = ownerOf(wc) || OrbeWindow.primary; if (!o) return false; o.newTab(url); return true; },
  });

  // Les feuilles suivent la mise en page de leur fenêtre et y gardent le clavier.
  const layoutBefore = hooks.layout;
  hooks.layout = (w) => { layoutBefore(w); sheets.layout(w); };
  hooks.sheetFocus = (w) => sheets.focusFor(w);
  hooks.leave = (w, wc) => unload.confirm(w.win, wc);
  hooks.closeAll = (rts, close) => unload.closeAll(rts, close);
  hooks.quitState = unload.state;
  hooks.shield = (wc) => unload.shield(wc);
  hooks.unshield = (wc) => unload.unshield(wc);
  hooks.stayed = (wc) => unload.stayedAgo(wc);
  hooks.input = (rt, input) => popups.gesture(rt, input);
  hooks.popup = (rt, details) => popups.allowed(rt, details);
  hooks.navigated = (rt) => popups.reset(rt);
  hooks.busy = (rt) => capture.of(rt.wc).length > 0;
  hooks.tabState = (rt) => capture.of(rt.wc);
  hooks.navState = (w, rt, tab) => ({
    // Chargement refusé pour un certificat : « non sécurisé », que l'avertissement soit déjà affiché ou non.
    security: rt && tab && !rt.internal ? (rt.failed ? 'broken' : certs.state(rt.wc, rt.wc.getURL() || tab.url)) : '',
    popups: popups.count(rt),
    capture: rt ? capture.of(rt.wc) : [],
  });
  // Certificat refusé : avertissement d'Orbe à la place de la page d'erreur.
  hooks.failed = (rt, info) => certs.failed(rt.wc, info, {
    load: (url) => { if (!rt.wc.isDestroyed()) rt.wc.loadURL(url).catch(() => {}); },
    back: () => {
      if (rt.wc.isDestroyed()) return;
      // Retour à la page précédente ; s'il n'y en a pas, l'onglet se ferme.
      const nav = rt.wc.navigationHistory;
      if (nav.canGoBack()) nav.goBack(); else rt.owner.close(rt.id, { ask: false });
    },
  });
  // Processus de la page disparu : « page plantée », avec rechargement.
  hooks.gone = (rt, details) => {
    if (rt.expectGone) { rt.expectGone = false; return; }
    if (!details || details.reason === 'clean-exit' || rt.wc.isDestroyed()) return;
    const owner = rt.owner;
    if (owner.win.isDestroyed() || !owner.visibleIds().includes(rt.id)) return; // en arrière-plan : rechargée à son retour
    const sheet = sheets.open(rt.wc, 'crash', { oom: details.reason === 'oom' }, { cover: true });
    if (sheet) sheet.result.then((a) => { if (a === 'reload' && !rt.wc.isDestroyed()) { rt.crashed = false; rt.wc.reload(); } });
  };
  // Page qui ne répond plus : attendre, ou recharger.
  hooks.hung = (rt, on) => {
    if (rt.wc.isDestroyed()) return;
    if (!on) return sheets.closeAll(rt.wc, 'hung');
    if ((rt.hungWait || 0) > Date.now()) return;
    const sheet = sheets.open(rt.wc, 'hung', {}, {});
    if (sheet) sheet.result.then((a) => {
      if (rt.wc.isDestroyed()) return;
      if (a === 'wait') rt.hungWait = Date.now() + 20000;
      if (a === 'reload') { rt.expectGone = true; try { rt.wc.forcefullyCrashRenderer(); } catch {} rt.crashed = false; rt.wc.reload(); }
    });
  };
  hooks.action = (w, action, a) => {
    if (action === 'siteInfo') { siteInfo(w); return true; }
    if (action === 'siteControl') return !!siteControl(w);
    // Autorisations du site affiché, dans la mémoire de SA session (profil, navigation privée).
    if (action === 'resetSitePerms') {
      const rt = w.activeRt;
      if (rt && !rt.wc.isDestroyed()) { permissions.reset(rt.wc.session, permissions.originOf(rt.wc.getURL()), '*'); w.changed(); }
      return true;
    }
    if (action === 'popupMenu') { const items = popups.menu(w, w.activeRt, t); if (items.length) w.popup(items); return true; }
    if (action === 'captureMenu') { captureMenu(w, (typeof a === 'string' && live.get(a)) || w.activeRt); return true; }
    return undefined;
  };
  hooks.siteMenu = (w) => [{ label: t('site.info'), enabled: !!(w.activeRt && !w.activeRt.internal), click: () => siteInfo(w) }];
}

module.exports = { setup, siteInfo, siteControl, sheets, permissions, displayMedia, capture, certs, auth, unload, popups, downloads };
