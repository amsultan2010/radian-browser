// Couche de compatibilité chrome.* : côté extension.
//
// Electron n'offre qu'une partie des API de Chrome. Ce script, enregistré sur
// la session (`registerPreloadScript`, types « frame » et « service-worker »),
// complète l'objet `chrome` des pages d'extension (fenêtre surgissante,
// options, page d'arrière-plan) et des service workers, avant que leur propre
// code ne s'exécute. Chaque appel part vers le processus principal
// (src/main/ext-api.js), qui seul décide : l'identité de l'extension y est
// tirée de l'émetteur du message, jamais de ce que ce script affirme.
//
// Les scripts de contenu ne sont pas concernés : Chrome ne leur donne que
// `runtime`, `storage` et `i18n`, qu'Electron fournit déjà.
//
// Écrit pour Orbe à partir de la documentation publique des API d'extension de
// Chrome ; aucun code tiers.
const { contextBridge, ipcRenderer } = require('electron');

const CHANNEL = 'orbe-ext';
const EVENT = 'orbe-ext-event';

// Dans un service worker, le script de préchargement n'a pas de `location`.
const inWorker = typeof location === 'undefined';
const inExtensionPage = !inWorker && location.protocol === 'chrome-extension:';

// Exécutée dans le monde principal : elle ne voit rien de ce fichier, seulement
// ses arguments (`invoke` et `listen`, relayés par le pont de contexte).
function install(invoke, listen) {
  const main = globalThis.chrome;
  // Service worker d'un site web, ou page sans API d'extension : rien à faire.
  if (!main || !main.runtime || !main.runtime.id || main.__orbe) return;
  Object.defineProperty(main, '__orbe', { value: 1 });
  // Chromium expose aussi `browser`, objet distinct de `chrome` : des
  // extensions le préfèrent (`self.browser || self.chrome`). Les deux sont complétés.
  const roots = [main];
  const other = globalThis.browser;
  if (other && typeof other === 'object' && other !== main && other.runtime && other.runtime.id) roots.push(other);

  const manifest = main.runtime.getManifest();
  const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  const declared = new Set([...strings(manifest.permissions), ...strings(manifest.optional_permissions)]);
  // Seul ce qui se sérialise traverse : fonctions et valeurs exotiques tombent.
  const clean = (v) => { try { return JSON.parse(JSON.stringify(v)); } catch { return null; } };

  // chrome.runtime.lastError, pour les appels à l'ancienne (avec rappel) : posé
  // le temps du rappel, puis retiré. Chromium fait de même pour ses propres
  // erreurs et retire la propriété après coup : un accesseur installé une fois
  // pour toutes disparaîtrait à la première erreur d'une API d'Electron.
  const runtimes = [...new Set(roots.map((r) => r.runtime))];
  const failWith = (err, cb) => {
    const value = { message: String((err && err.message) || err) };
    const set = [];
    for (const runtime of runtimes) {
      try {
        const own = Object.getOwnPropertyDescriptor(runtime, 'lastError');
        if (own && !own.configurable) continue;
        Object.defineProperty(runtime, 'lastError', { value, configurable: true, enumerable: true, writable: true });
        set.push(runtime);
      } catch {}
    }
    try { cb(); } finally {
      for (const runtime of set) { try { delete runtime.lastError; } catch {} }
    }
  };

  // Injection d'Electron, gardée telle quelle pour les besoins de ce script.
  const nativeExecute = main.scripting && typeof main.scripting.executeScript === 'function' ? main.scripting.executeScript.bind(main.scripting) : null;

  const call = (name, args) => invoke(name, clean(args) || []).then((r) => {
    if (r && r.error) throw new Error(r.error);
    return r ? r.value : undefined;
  });

  // Une méthode d'API : promesse (Manifest V3) ou rappel en dernier argument.
  const method = (name) => function (...args) {
    const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    const p = call(name, args);
    if (!cb) return p;
    p.then((v) => { cb(v); }, (err) => failWith(err, cb));
    return undefined;
  };

  // Événements : le processus principal n'envoie que ceux qui sont écoutés.
  const events = new Map();
  const made = new Map();
  const event = (name) => {
    if (made.has(name)) return made.get(name);
    const set = new Set();
    events.set(name, set);
    const api = {
      addListener(fn) {
        if (typeof fn !== 'function' || set.has(fn)) return;
        set.add(fn);
        if (set.size === 1) invoke('_listen', [name, true]);
      },
      removeListener(fn) {
        if (set.delete(fn) && !set.size) invoke('_listen', [name, false]);
      },
      hasListener: (fn) => set.has(fn),
      hasListeners: () => set.size > 0,
    };
    made.set(name, api);
    return api;
  };
  const fire = (name, args) => {
    const set = events.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(...args); } catch (err) { console.error(err); }
    }
  };

  // Rappels `onclick` des menus contextuels (Manifest V2) : ils restent ici.
  const menuClicks = new Map();
  let menuSeq = 0;

  // Changements de stockage relayés par les pages de l'extension (voir plus bas).
  const relays = [];

  listen((name, args) => {
    if (name === 'storage.relay') { for (const fn of relays) fn(args[0], args[1]); return; }
    // Une page vient de se charger : `storage.sync` y est corrigé pour les
    // scripts de contenu de l'extension (voir `wrapStorage`).
    if (name === 'content.sync') {
      try { Promise.resolve(nativeExecute({ target: args[0], world: 'ISOLATED', injectImmediately: true, func: wrapStorage })).catch(() => {}); } catch {}
      return;
    }
    if (name === 'contextMenus.onClicked') {
      const fn = menuClicks.get(String(args[0] && args[0].menuItemId));
      if (fn) { try { fn(...args); } catch (err) { console.error(err); } }
    }
    fire(name, args);
  });

  // chrome.storage. Deux manques d'Electron sont comblés ici :
  //   - `sync` est annoncé mais refusé (« not available in this instance »).
  //     Orbe n'a pas de compte : `sync` devient une zone locale à part, rangée
  //     dans `storage.local` sous un préfixe que `local` ne laisse pas voir ;
  //   - `onChanged` n'arrive jamais dans un service worker (il arrive bien
  //     dans les pages et les scripts de contenu). Le service worker calcule
  //     donc lui-même les changements qu'il écrit, et reçoit ceux des pages
  //     de l'extension, qui les lui relaient par le processus principal.
  //
  // Cette fonction ne dépend de rien d'autre que de ses arguments : le service
  // worker l'injecte aussi, telle quelle, dans le monde isolé des scripts de
  // contenu (`scripting.executeScript`), que ce script de préchargement
  // n'atteint pas. `h` : liens avec le processus principal, absents dans un
  // script de contenu.
  function wrapStorage(h) {
    const hooks = h || {};
    const root = typeof chrome === 'undefined' ? null : chrome;
    const storage = root && root.storage;
    if (!storage || !storage.local || typeof storage.local.get !== 'function' || storage.__orbe) return;
    try { Object.defineProperty(storage, '__orbe', { value: 1 }); } catch { return; }
    // runtime.lastError le temps d'un rappel (voir `failWith`, plus haut).
    const failWith = (err, cb) => {
      const value = { message: String((err && err.message) || err) };
      let set = false;
      try { Object.defineProperty(root.runtime, 'lastError', { value, configurable: true, enumerable: true, writable: true }); set = true; } catch {}
      try { cb(); } finally { if (set) { try { delete root.runtime.lastError; } catch {} } }
    };
    // Méthodes d'origine d'une zone, gardées avant tout remplacement.
    const bound = (o) => {
      const out = {};
      for (const k of ['get', 'set', 'remove', 'clear', 'getBytesInUse', 'setAccessLevel']) if (typeof o[k] === 'function') out[k] = o[k].bind(o);
      if (o.QUOTA_BYTES) out.QUOTA_BYTES = o.QUOTA_BYTES;
      return out;
    };
    const PREFIX = '__orbe_sync__/';
    const worker = typeof window === 'undefined';
    const localArea = storage.local;
    const syncArea = storage.sync;
    const native = bound(localArea);
    const nativeSession = storage.session && typeof storage.session.get === 'function' ? bound(storage.session) : null;
    const nativeChanged = storage.onChanged;
    const addNative = nativeChanged && typeof nativeChanged.addListener === 'function' ? nativeChanged.addListener.bind(nativeChanged) : null;
    const isSync = (k) => k.startsWith(PREFIX);
    const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    const withCallback = (fn) => function (...args) {
      const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
      const p = fn(...args);
      if (!cb) return p;
      p.then((v) => { cb(v); }, (err) => failWith(err, cb));
      return undefined;
    };

    // Événements : `storage.onChanged` et celui de chaque zone.
    const localEvent = () => {
      const set = new Set();
      return {
        set,
        api: { addListener(fn) { if (typeof fn === 'function') { set.add(fn); hook(); } }, removeListener(fn) { set.delete(fn); }, hasListener: (fn) => set.has(fn), hasListeners: () => set.size > 0 },
      };
    };
    const any = localEvent();
    const byArea = { local: localEvent(), sync: localEvent(), session: localEvent() };
    const run = (set, ...args) => { for (const fn of [...set]) { try { fn(...args); } catch (err) { console.error(err); } } };
    const deliver = (changes, area) => {
      if (!Object.keys(changes).length) return;
      run(any.set, changes, area);
      if (byArea[area]) run(byArea[area].set, changes);
    };
    // Changements tels que Chromium les annonce : la zone « local » y contient aussi « sync ».
    const split = (changes, area) => {
      if (area !== 'local') return [[changes, area]];
      const local = {};
      const sync = {};
      for (const k of Object.keys(changes)) {
        if (isSync(k)) sync[k.slice(PREFIX.length)] = changes[k]; else local[k] = changes[k];
      }
      return [[local, 'local'], [sync, 'sync']];
    };
    const signature = (changes, area) => area + '|' + Object.keys(changes).sort().map((k) => k + '=' + JSON.stringify(changes[k].newValue)).join('&');
    const own = []; // écritures récentes du service worker, pour ne pas les recevoir deux fois
    let hooked = false;
    function hook() {
      if (hooked) return;
      hooked = true;
      if (worker) { if (hooks.listen) hooks.listen(); }
      else if (addNative) addNative((changes, area) => { for (const [part, name] of split(changes, area)) deliver(part, name); });
    }
    if (worker) {
      (hooks.onRelay || (() => {}))((changes, area) => {
        for (const [part, name] of split(changes || {}, area)) {
          if (!Object.keys(part).length) continue;
          const sig = signature(part, name);
          const now = Date.now();
          const at = own.findIndex((o) => o.sig === sig && now - o.at < 5000);
          if (at >= 0) own.splice(at, 1); else deliver(part, name);
        }
      });
    } else if (addNative && hooks.relay) {
      // Page d'extension : ce qu'elle voit changer est relayé au service worker.
      addNative((changes, area) => { hooks.relay(copy(changes), area); });
    }

    // Une zone : lectures et écritures sous forme de promesses, sur les clés
    // « logiques » (sans préfixe).
    const zone = (area, raw) => {
      const toRaw = area === 'sync' ? (k) => PREFIX + k : (k) => k;
      const mine = area === 'session' ? () => true : (k) => isSync(k) === (area === 'sync');
      const all = async () => {
        const found = await raw.get(null);
        const out = {};
        for (const k of Object.keys(found)) if (mine(k)) out[area === 'sync' ? k.slice(PREFIX.length) : k] = found[k];
        return out;
      };
      const get = async (keys) => {
        if (keys == null) return all();
        if (area !== 'sync') return raw.get(keys);
        const defaults = typeof keys === 'object' && !Array.isArray(keys) ? keys : null;
        const names = defaults ? Object.keys(defaults) : [].concat(keys);
        const found = await raw.get(names.map(toRaw));
        const out = {};
        for (const k of names) {
          if (Object.prototype.hasOwnProperty.call(found, toRaw(k))) out[k] = found[toRaw(k)];
          else if (defaults && defaults[k] !== undefined) out[k] = defaults[k];
        }
        return out;
      };
      // Dans le service worker, chaque écriture annonce elle-même ses changements.
      // Ils sont calculés avant d'écrire (`next` : valeurs à venir), pour que le
      // même changement, relayé par une page, soit reconnu même s'il arrive
      // avant la fin de l'écriture.
      const announce = async (names, write, next = {}) => {
        if (!worker) return write();
        const before = names ? await get(names) : await all();
        const changes = {};
        for (const k of names || Object.keys(before)) {
          const had = Object.prototype.hasOwnProperty.call(before, k);
          const has = Object.prototype.hasOwnProperty.call(next, k) && next[k] !== undefined;
          if (!had && !has) continue;
          if (had && has && JSON.stringify(before[k]) === JSON.stringify(next[k])) continue;
          changes[k] = {};
          if (had) changes[k].oldValue = before[k];
          if (has) changes[k].newValue = copy(next[k]);
        }
        const changed = Object.keys(changes).length > 0;
        if (changed) {
          own.push({ sig: signature(changes, area), at: Date.now() });
          if (own.length > 50) own.shift();
        }
        await write();
        if (changed) deliver(changes, area);
        return undefined;
      };
      const api = {
        get: withCallback((keys) => get(keys)),
        set: withCallback((items) => {
          const names = Object.keys(items || {});
          const rawItems = {};
          for (const k of names) rawItems[toRaw(k)] = items[k];
          return announce(names, () => raw.set(rawItems), items);
        }),
        remove: withCallback((keys) => {
          const names = [].concat(keys);
          return announce(names, () => raw.remove(names.map(toRaw)));
        }),
        clear: withCallback(() => announce(null, async () => {
          if (area === 'session') await raw.clear();
          else await raw.remove(Object.keys(await all()).map(toRaw));
        })),
        getKeys: withCallback(async () => Object.keys(await all())),
        getBytesInUse: withCallback(async (keys) => {
          if (area !== 'sync' && typeof raw.getBytesInUse === 'function') return raw.getBytesInUse(keys == null ? null : keys);
          const found = await all();
          const names = keys == null ? Object.keys(found) : [].concat(keys);
          return names.reduce((n, k) => n + (k in found ? k.length + JSON.stringify(found[k]).length : 0), 0);
        }),
        setAccessLevel: withCallback(async (level) => { if (area !== 'sync' && typeof raw.setAccessLevel === 'function') await raw.setAccessLevel(level); }),
        onChanged: byArea[area].api,
      };
      if (area === 'sync') Object.assign(api, { QUOTA_BYTES: 102400, QUOTA_BYTES_PER_ITEM: 8192, MAX_ITEMS: 512, MAX_WRITE_OPERATIONS_PER_HOUR: 1800, MAX_WRITE_OPERATIONS_PER_MINUTE: 120 });
      else if (raw.QUOTA_BYTES) api.QUOTA_BYTES = raw.QUOTA_BYTES;
      return api;
    };
    const put = (key, value) => {
      try { Object.defineProperty(storage, key, { value, configurable: true, enumerable: true, writable: true }); } catch { try { storage[key] = value; } catch {} }
      return storage[key] === value;
    };
    // `managed` (réglages d'entreprise) : Electron le refuse ; sans stratégie,
    // Chrome rend un objet vide (ou les valeurs par défaut demandées).
    if (storage.managed && typeof storage.managed.get === 'function') {
      const managedGet = withCallback(async (keys) => (keys && typeof keys === 'object' && !Array.isArray(keys) ? { ...keys } : {}));
      try { Object.defineProperty(storage.managed, 'get', { value: managedGet, configurable: true, enumerable: true, writable: true }); } catch {}
    }
    // Tout ensemble, ou rien : sinon le préfixe deviendrait visible.
    if (put('sync', zone('sync', native))) {
      put('local', zone('local', native));
      put('onChanged', any.api);
      // `session` n'est enveloppé que là où ses événements manquent.
      if (worker && nativeSession) put('session', zone('session', nativeSession));
      // Script de contenu : il a pu garder les anciens objets avant ce correctif.
      // Ils reçoivent les mêmes méthodes.
      if (!h) {
        const graft = (old, api) => { if (old && old !== api) for (const k of Object.keys(api)) if (typeof api[k] === 'function') { try { old[k] = api[k]; } catch {} } };
        graft(syncArea, storage.sync);
        graft(localArea, storage.local);
        if (nativeChanged) graft(nativeChanged, any.api);
      }
    }
  }
  // Complète un objet racine (`chrome`, puis `browser` s'il existe).
  const equip = (c) => {
    // Ajoute méthodes, événements et constantes à un espace de noms, en gardant
    // ce qu'Electron fournit déjà et qui n'est pas redéfini ici.
    const define = (ns, { methods = [], events: evs = [], consts = {}, as = ns }) => {
      let target = c[ns];
      if (!target || typeof target !== 'object') {
        target = {};
        try { c[ns] = target; } catch {}
        if (c[ns] !== target) { try { Object.defineProperty(c, ns, { value: target, configurable: true, enumerable: true, writable: true }); } catch { return null; } }
      }
      const put = (key, value) => {
        try { Object.defineProperty(target, key, { value, configurable: true, enumerable: true, writable: true }); } catch { try { target[key] = value; } catch {} }
      };
      for (const m of methods) put(m, method(`${as}.${m}`));
      for (const e of evs) put(e, event(`${as}.${e}`));
      for (const k of Object.keys(consts)) put(k, consts[k]);
      return target;
    };

    define('permissions', { methods: ['contains', 'getAll', 'request', 'remove'], events: ['onAdded', 'onRemoved'] });

    define('tabs', {
      // Le zoom d'Electron ne connaît pas les onglets d'Orbe : il est refait ici.
      methods: ['query', 'get', 'getCurrent', 'create', 'remove', 'update', 'reload', 'duplicate', 'goBack', 'goForward', 'captureVisibleTab', 'detectLanguage', 'getZoom', 'setZoom', 'getZoomSettings', 'setZoomSettings', 'group', 'ungroup'],
      events: ['onCreated', 'onRemoved', 'onUpdated', 'onActivated', 'onReplaced'],
      consts: { TAB_ID_NONE: -1, MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND: 2 },
    });

    // « activeTab » : quand Orbe a dû donner à l'extension l'accès à tous les
    // sites pour que ses injections fonctionnent (src/main/ext-access.js), le
    // processus principal vérifie d'abord que l'onglet visé lui est ouvert.
    if (declared.has('activeTab')) {
      const guard = (holder, name, tabOf) => {
        const native = holder && typeof holder[name] === 'function' ? holder[name].bind(holder) : null;
        if (!native) return;
        const guarded = function (...args) {
          const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
          const p = call('_access', [tabOf(args)]).then(() => native(...args));
          if (!cb) return p;
          p.then((v) => { cb(v); }, (err) => failWith(err, cb));
          return undefined;
        };
        try { Object.defineProperty(holder, name, { value: guarded, configurable: true, enumerable: true, writable: true }); } catch {}
      };
      const scriptingTab = (args) => (args[0] && args[0].target ? args[0].target.tabId : undefined);
      const tabsTab = (args) => (typeof args[0] === 'number' ? args[0] : undefined);
      if (c.scripting && !c.scripting.__orbe) {
        for (const name of ['executeScript', 'insertCSS', 'removeCSS']) guard(c.scripting, name, scriptingTab);
        try { Object.defineProperty(c.scripting, '__orbe', { value: 1 }); } catch {}
      }
      if (c.tabs && !c.tabs.__orbeGuard) {
        for (const name of ['executeScript', 'insertCSS', 'removeCSS']) guard(c.tabs, name, tabsTab);
        try { Object.defineProperty(c.tabs, '__orbeGuard', { value: 1 }); } catch {}
      }
    }

    // Panneau latéral : la vue est tenue par Orbe (src/main/ext-panel.js).
    if (declared.has('sidePanel')) {
      define('sidePanel', {
        methods: ['setOptions', 'getOptions', 'open', 'close', 'setPanelBehavior', 'getPanelBehavior', 'getLayout'],
        events: ['onOpened', 'onClosed'],
        consts: { Side: { LEFT: 'left', RIGHT: 'right' } },
      });
      // runtime.getContexts : Electron ne sait pas qu'une de ces pages est un
      // panneau latéral. Les siennes sont requalifiées, ou ajoutées.
      const runtime = c.runtime;
      const nativeContexts = runtime && typeof runtime.getContexts === 'function' ? runtime.getContexts.bind(runtime) : null;
      if (runtime && !runtime.__orbeContexts) {
        const list = async (filter) => {
          const f = filter && typeof filter === 'object' ? filter : {};
          const { contextTypes, ...rest } = f;
          const [found, panels] = await Promise.all([nativeContexts ? nativeContexts(rest).catch(() => []) : [], call('runtime._panelContexts', [])]);
          const out = [];
          const left = [...panels];
          for (const x of found) {
            const at = x.tabId === -1 ? left.findIndex((p) => p.documentUrl === x.documentUrl) : -1;
            out.push(at >= 0 ? { ...x, contextType: 'SIDE_PANEL', windowId: left.splice(at, 1)[0].windowId } : x);
          }
          const has = (key, value) => !Array.isArray(f[key]) || f[key].includes(value);
          for (const p of left) if (has('contextIds', p.contextId) && has('documentUrls', p.documentUrl) && has('documentOrigins', p.documentOrigin) && has('windowIds', p.windowId) && has('tabIds', p.tabId) && has('frameIds', p.frameId) && f.incognito !== true) out.push(p);
          return Array.isArray(contextTypes) ? out.filter((x) => contextTypes.includes(x.contextType)) : out;
        };
        try {
          Object.defineProperty(runtime, 'getContexts', {
            configurable: true, enumerable: true, writable: true,
            value(filter, cb) {
              const p = list(filter);
              if (typeof cb !== 'function') return p;
              p.then((v) => cb(v), () => cb([]));
              return undefined;
            },
          });
          Object.defineProperty(runtime, '__orbeContexts', { value: 1 });
        } catch {}
      }
    }

    // Débogueur : relayé vers celui d'Electron, onglet par onglet (ext-debug.js).
    if (declared.has('debugger')) {
      define('debugger', { methods: ['attach', 'detach', 'sendCommand', 'getTargets'], events: ['onEvent', 'onDetach'], consts: { DetachReason: { TARGET_CLOSED: 'target_closed', CANCELED_BY_USER: 'canceled_by_user' }, TargetInfoType: { PAGE: 'page', BACKGROUND_PAGE: 'background_page', WORKER: 'worker', OTHER: 'other' } } });
    }

    // Groupes d'onglets : tenus en mémoire, sans dessin dans Orbe (ext-more.js).
    if (declared.has('tabGroups')) {
      define('tabGroups', {
        methods: ['get', 'query', 'update', 'move'],
        events: ['onCreated', 'onUpdated', 'onRemoved', 'onMoved'],
        consts: { TAB_GROUP_ID_NONE: -1, Color: { GREY: 'grey', BLUE: 'blue', RED: 'red', YELLOW: 'yellow', GREEN: 'green', PINK: 'pink', PURPLE: 'purple', CYAN: 'cyan', ORANGE: 'orange' } },
      });
    }

    // Connexion à un service tiers : petite fenêtre d'Orbe (ext-more.js).
    if (declared.has('identity')) {
      const identity = define('identity', { methods: ['launchWebAuthFlow', 'getAuthToken', 'getProfileUserInfo', 'getAccounts', 'removeCachedAuthToken', 'clearAllCachedAuthTokens'], events: ['onSignInChanged'] });
      if (identity) identity.getRedirectURL = (path) => `https://${main.runtime.id}.chromiumapp.org/${String(path == null ? '' : path).replace(/^\//, '')}`;
    }

    define('windows', {
      methods: ['get', 'getCurrent', 'getLastFocused', 'getAll', 'create', 'update', 'remove'],
      events: ['onCreated', 'onRemoved', 'onFocusChanged'],
      consts: { WINDOW_ID_NONE: -1, WINDOW_ID_CURRENT: -2, WindowType: { NORMAL: 'normal', POPUP: 'popup', PANEL: 'panel', APP: 'app', DEVTOOLS: 'devtools' } },
    });

    if (declared.has('cookies')) {
      define('cookies', { methods: ['get', 'getAll', 'set', 'remove', 'getAllCookieStores'], events: ['onChanged'] });
    }

    if (declared.has('contextMenus')) {
      const menus = define('contextMenus', { methods: ['update', 'remove', 'removeAll'], events: ['onClicked'], consts: { ACTION_MENU_TOP_LEVEL_LIMIT: 6 } });
      const remote = { remove: menus.remove, removeAll: menus.removeAll };
      // create() rend l'identifiant tout de suite, sans attendre le processus principal.
      menus.create = (props, cb) => {
        const p = { ...(props || {}) };
        if (p.id == null) p.id = `orbe-menu-${++menuSeq}`;
        if (typeof p.onclick === 'function') menuClicks.set(String(p.id), p.onclick);
        const done = call('contextMenus.create', [p]);
        if (typeof cb === 'function') {
          done.then(() => cb(), (err) => failWith(err, cb));
        } else done.catch((err) => console.error(err));
        return p.id;
      };
      menus.remove = function (id, ...rest) { menuClicks.delete(String(id)); return remote.remove.call(this, id, ...rest); };
      menus.removeAll = function (...rest) { menuClicks.clear(); return remote.removeAll.apply(this, rest); };
    }

    if (declared.has('webNavigation')) {
      define('webNavigation', {
        methods: ['getFrame', 'getAllFrames'],
        events: ['onBeforeNavigate', 'onCommitted', 'onDOMContentLoaded', 'onCompleted', 'onErrorOccurred', 'onHistoryStateUpdated', 'onReferenceFragmentUpdated', 'onCreatedNavigationTarget', 'onTabReplaced'],
      });
    }

    if (declared.has('notifications')) {
      define('notifications', { methods: ['create', 'update', 'clear', 'getAll', 'getPermissionLevel'], events: ['onClicked', 'onClosed', 'onButtonClicked'] });
    }

    if (declared.has('downloads')) {
      define('downloads', { methods: ['download', 'search', 'show', 'erase'], events: ['onChanged', 'onCreated', 'onErased'], consts: { State: { IN_PROGRESS: 'in_progress', INTERRUPTED: 'interrupted', COMPLETE: 'complete' } } });
    }

    if (declared.has('fontSettings')) define('fontSettings', { methods: ['getFontList'] });

    define('commands', { methods: ['getAll'], events: ['onCommand'] });

    // Bouton de l'extension : `action` (V3), `browserAction` / `pageAction` (V2).
    // L'état vit dans le processus principal, où Orbe le lit pour dessiner le bouton.
    const ACTION = ['setTitle', 'getTitle', 'setBadgeText', 'getBadgeText', 'setBadgeBackgroundColor', 'getBadgeBackgroundColor', 'setBadgeTextColor', 'getBadgeTextColor', 'setPopup', 'getPopup', 'enable', 'disable', 'isEnabled', 'openPopup', 'getUserSettings'];
    for (const ns of ['action', 'browserAction', 'pageAction']) {
      const key = ns === 'action' ? 'action' : ns === 'browserAction' ? 'browser_action' : 'page_action';
      if (!manifest[key] && !c[ns]) continue;
      const action = define(ns, { methods: ACTION, events: ['onClicked'], as: 'action' });
      if (ns === 'pageAction') { action.show = method('action.enable'); action.hide = method('action.disable'); }
      const setIcon = method('action.setIcon');
      // Une image fournie en pixels (ImageData) est réduite à un tableau simple.
      const pixels = (img) => (img && img.data && img.width ? { width: img.width, height: img.height, data: Array.from(img.data) } : null);
      action.setIcon = (details, cb) => {
        const d = { ...(details || {}) };
        if (d.imageData) {
          let img = d.imageData;
          if (!img.data) {
            const sizes = Object.keys(img).filter((k) => img[k] && img[k].data && img[k].width <= 128).sort((a, b) => Number(b) - Number(a));
            img = sizes.length ? img[sizes[0]] : null;
          }
          d.imageData = pixels(img);
        }
        return cb ? setIcon(d, cb) : setIcon(d);
      };
    }

    // chrome.storage : voir `wrapStorage`. `chrome.storage` et `browser.storage`
    // sont le même objet : la fonction ne l'enveloppe qu'une fois.
    if (c.storage) wrapStorage({ listen: () => invoke('_listen', ['storage.relay', true]), onRelay: (fn) => relays.push(fn), relay: (changes, area) => invoke('_storageRelay', [changes, area]) });

    // Compléments à des espaces de noms qu'Electron fournit en partie.
    define('runtime', { methods: ['openOptionsPage'] });
    define('extension', { methods: ['isAllowedIncognitoAccess', 'isAllowedFileSchemeAccess'] });
  };
  for (const root of roots) equip(root);
}

if (inWorker || inExtensionPage) {
  try {
    contextBridge.executeInMainWorld({
      func: install,
      args: [
        (name, args) => ipcRenderer.invoke(CHANNEL, name, args),
        (fn) => { ipcRenderer.on(EVENT, (e, name, args) => fn(name, args)); },
      ],
    });
  } catch (err) {
    console.error('[orbe] API d’extension indisponibles :', err);
  }
}
