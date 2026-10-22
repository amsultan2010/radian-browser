// Autorisations des sites : caméra, micro, position, notifications, MIDI,
// presse-papiers, liens vers d'autres applications, appareils (USB, HID, série,
// Bluetooth).
//
// Tout se décide ici, dans le processus principal, à partir de ce qu'Electron
// rapporte (origine du cadre demandeur, session) : jamais d'après un texte
// fourni par la page. Une réponse est retenue par origine, dans le profil
// (store.state.permissions) ou, en navigation privée, en mémoire seulement.
const { app, dialog, BaseWindow, systemPreferences, shell, webContents } = require('electron');
const { store } = require('./store');
const sheets = require('./sheets');
const capture = require('./capture-state');

// Accordées sans question : sans danger, ou confirmées autrement (le partage
// d'écran passe par le sélecteur d'Orbe, qui vaut consentement à chaque fois —
// voir `displayGate` pour la demande « media » qui le précède).
const AUTO_ALLOW = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write', 'keyboardLock', 'window-management', 'speaker-selection', 'display-capture']);
// Détection d'inactivité, stockage durable, accès aux cookies depuis un cadre intégré (Storage Access API) : demandés aussi.
const ASKABLE = new Set(['media', 'geolocation', 'notifications', 'midi', 'midiSysex', 'clipboard-read', 'idle-detection', 'persistent-storage', 'storage-access', 'top-level-storage-access']);
// Appareils : la vérification passe (la page peut demander), mais aucun appareil
// n'est jamais accordé : la demande est annulée proprement, avec un message.
const DEVICES = new Set(['hid', 'serial', 'usb']);
// Schémas qu'une page ne fait jamais ouvrir par le système.
const BLOCKED_SCHEMES = new Set(['http', 'https', 'file', 'ftp', 'orbe', 'chrome', 'chrome-extension', 'devtools', 'javascript', 'data', 'blob', 'about', 'view-source', 'ws', 'wss', 'filesystem',
  'afp', 'disk', 'disks', 'hcp', 'ie.http', 'ms-help', 'nntp', 'shell', 'vbscript', 'vnd.ms.radio', 'ms-msdt', 'search-ms', 'search', 'ms-officecmd', 'ms-cxh', 'ms-cxh-full', 'ms-its', 'mk', 'res', 'jar', 'smb', 'ssh', 'telnet', 'vnc']);

const env = {
  toast: () => {},
  ownerWindow: () => null, // webContents -> BaseWindow de sa fenêtre Orbe
  // Boîte de dialogue du système, pour les pages qui ne sont pas des onglets.
  confirm: async (parent, opts) => (await (parent ? dialog.showMessageBox(parent, opts) : dialog.showMessageBox(opts))).response === 0,
  openExternal: (url) => shell.openExternal(url).catch(() => {}),
  // Temps écoulé (ms) depuis la dernière vraie entrée de l'utilisateur dans cet
  // onglet ; Infinity s'il n'y en a pas eu ; null si ce n'est pas un onglet.
  gesture: () => null,
};
const GESTURE = 5000; // durée de l'activation passagère de Chromium

// Accès accordé à Orbe par le système (macOS, Windows). Remplacé pendant les
// tests : aucune vraie demande au système n'y est faite.
const SETTINGS_URL = {
  darwin: { camera: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera', microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone', screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture' },
  win32: { camera: 'ms-settings:privacy-webcam', microphone: 'ms-settings:privacy-microphone', screen: 'ms-settings:privacy' },
};
const os = {
  status(kind) {
    if (process.platform !== 'darwin' && process.platform !== 'win32') return 'granted';
    try { return systemPreferences.getMediaAccessStatus(kind); } catch { return 'unknown'; }
  },
  async ask(kind) {
    if (process.platform !== 'darwin' || kind === 'screen') return os.status(kind) !== 'denied';
    try { return await systemPreferences.askForMediaAccess(kind); } catch { return false; }
  },
  openSettings(kind) {
    const url = (SETTINGS_URL[process.platform] || {})[kind];
    if (url) env.openExternal(url);
  },
};

const memories = new WeakMap(); // session -> { memory(), persist }
const pending = new Map(); // « id onglet|origine|clés » -> promesse de la réponse en cours
const lastExternal = new Map(); // id webContents -> instant de la dernière ouverture sans question
// Liens externes, par page (oubliés quand l'onglet change de page) :
// schémas refusés par l'utilisateur, et question déjà posée sans geste.
const pages = new Map(); // id webContents -> { refused: Set(schéma), asked: bool, at: instant de la dernière question }

const t = (key, vars) => store.t(key, null, vars);

function originOf(url) {
  try { return new URL(url).origin; } catch { return ''; }
}

// Nom du site à afficher : l'hôte, sans le schéma quand il est sûr.
function siteName(origin) {
  try { const u = new URL(origin); return u.protocol === 'https:' ? u.host : origin; } catch { return origin; }
}

// Réponse retenue (true, false) ou undefined. L'ancienne clé « media » valait
// pour la caméra et le micro.
function lookup(memory, origin, key) {
  const m = memory[origin];
  if (!m) return undefined;
  if (typeof m[key] === 'boolean') return m[key];
  if ((key === 'camera' || key === 'microphone') && typeof m.media === 'boolean') return m.media;
  return undefined;
}

function remember(entry, origin, key, value) {
  if (origin === 'null' || !origin) return; // origine opaque (file:, data:) : rien n'est retenu
  const memory = entry.memory();
  (memory[origin] || (memory[origin] = {}))[key] = value;
  if (entry.persist) store.save();
}

function forget(entry, origin, key) {
  const memory = entry.memory();
  const m = memory[origin];
  if (!m) return;
  if (key === '*') delete memory[origin];
  else {
    delete m[key];
    if (key === 'camera' || key === 'microphone') {
      // Ancienne clé commune : l'autre moitié garde sa réponse.
      if (typeof m.media === 'boolean') { const other = key === 'camera' ? 'microphone' : 'camera'; if (typeof m[other] !== 'boolean') m[other] = m.media; delete m.media; }
    }
    if (!Object.keys(m).length) delete memory[origin];
  }
  if (entry.persist) store.save();
}

// Caméra et micro demandés par un cadre intégré à un autre site : la réponse ne
// vaut que pour ce couple (site intégré, site qui l'intègre). Un site hostile ne
// peut donc pas hériter, en l'intégrant, de l'accord donné ailleurs à un service.
const EMBED = '|';
// De même pour l'accès aux cookies d'un cadre intégré : il se donne site par site.
const EMBEDDED_KEYS = new Set(['camera', 'microphone', 'storage-access']);
const keyFor = (key, embedder) => (embedder && EMBEDDED_KEYS.has(key) ? key + EMBED + embedder : key);

// La page (ou le cadre) qui a posé la question est-elle toujours là ? Sinon la
// réponse ne sert à rien ni à personne : rien n'est retenu, rien n'est ouvert.
function stillThere(wc, origin, isMainFrame) {
  if (!wc || wc.isDestroyed()) return false;
  try {
    if (isMainFrame !== false) return originOf(wc.getURL()) === origin;
    return wc.mainFrame.framesInSubtree.some((f) => originOf(f.url) === origin);
  } catch { return false; }
}

function labelOf(key) {
  if (key.startsWith('external:')) return t('perm.external', { scheme: key.slice(9) });
  const at = key.indexOf(EMBED);
  if (at > 0) return labelOf(key.slice(0, at)) + ' — ' + t('perm.embeddedIn', { site: siteName(key.slice(at + 1)) });
  const k = 'perm.' + (key === 'midiSysex' ? 'midi' : key);
  const label = t(k);
  return label === k ? t('perm.other', { name: key }) : label;
}

function mediaKeys(details) {
  const types = (details && details.mediaTypes) || [];
  const keys = [];
  if (types.includes('video')) keys.push('camera');
  if (types.includes('audio')) keys.push('microphone');
  return keys;
}

// Question posée à l'utilisateur. Renvoie true, false, ou null si la question a
// disparu sans réponse (la page a changé) : rien n'est alors retenu.
async function ask(wc, origin, keys, top) {
  const id = (wc ? wc.id : 0) + '|' + origin + '|' + keys.join(',');
  if (pending.has(id)) return pending.get(id);
  const lines = keys.map(labelOf);
  const site = siteName(origin);
  const note = top && top !== origin ? t('perm.embedded', { site: siteName(top) }) : '';
  let p;
  const sheet = wc ? sheets.open(wc, 'perm', { site, lines, note, icon: keys[0] === 'camera' ? 'camera' : (keys[0] === 'microphone' ? 'mic' : 'info') }, { exclusive: false }) : null;
  if (sheet) p = sheet.result.then((r) => (r === 'allow' ? true : (r === 'deny' ? false : null)));
  else {
    const parent = (wc && env.ownerWindow(wc)) || BaseWindow.getFocusedWindow();
    p = env.confirm(parent, { type: 'question', message: t('perm.title', { origin: site }), detail: lines.join('\n') + (note ? '\n' + note : ''), buttons: [t('perm.allow'), t('perm.deny')], defaultId: 1, cancelId: 1 });
  }
  pending.set(id, p);
  p.finally(() => pending.delete(id));
  return p;
}

// Caméra, micro : il faut aussi l'accord du système pour Orbe. Dit lequel manque.
async function osAccess(wc, keys) {
  const missing = [];
  for (const key of keys) {
    let status = os.status(key);
    if (status === 'not-determined') status = (await os.ask(key)) ? 'granted' : 'denied';
    if (status === 'denied' || status === 'restricted') missing.push(key);
  }
  if (!missing.length) return true;
  const what = missing.map((k) => t('os.name.' + k)).join(t('os.and'));
  const text = t(process.platform === 'darwin' ? 'os.deniedMac' : 'os.deniedWin', { what });
  const sheet = wc && !wc.isDestroyed() ? sheets.open(wc, 'os', { title: t('os.title', { what }), text, settings: true, icon: missing[0] === 'camera' ? 'camera' : 'mic' }, { onAction: (name) => { if (name === 'settings') os.openSettings(missing[0]); } }) : null;
  if (!sheet && wc && !wc.isDestroyed()) env.toast(wc, t('os.title', { what }));
  return false;
}

// Lien vers une autre application (mailto:, tel:, lien d'application). Orbe
// demande, puis ouvre lui-même le lien : la réponse donnée à Chromium est
// toujours « non ». Contre le harcèlement : un refus vaut pour le schéma tant
// que l'onglet reste sur cette page ; sans geste récent de l'utilisateur, une
// page ne fait apparaître la question qu'une fois ; une question à la fois.
function pageState(wc) {
  let st = pages.get(wc.id);
  if (st) return st;
  const id = wc.id;
  st = { refused: new Set(), asked: false, at: 0 };
  pages.set(id, st);
  wc.on('did-navigate', () => { st.refused.clear(); st.asked = false; st.downloads = 0; st.dlAsked = false; });
  wc.once('destroyed', () => pages.delete(id));
  return st;
}

async function external(entry, wc, origin, details) {
  const url = String((details && details.externalURL) || '');
  const scheme = (/^([a-z][a-z0-9+.-]*):/i.exec(url) || [])[1];
  if (!scheme || !wc || wc.isDestroyed() || !origin || url.length > 4096) return false;
  const name = scheme.toLowerCase();
  if (BLOCKED_SCHEMES.has(name)) return false;
  const key = 'external:' + name;
  const now = Date.now();
  const st = pageState(wc);
  if (st.refused.has(name)) return false;
  // Autorisation permanente : au plus une ouverture toutes les trois secondes
  // par page, sinon la question revient.
  const quiet = lookup(entry.memory(), origin, key) === true && now - (lastExternal.get(wc.id) || 0) > 3000;
  if (!quiet) {
    const id = wc.id + '|external';
    if (pending.has(id)) return false; // une question à la fois par page
    const since = env.gesture(wc);
    const fresh = since !== null && since < GESTURE;
    // Sans geste : une seule question par page (une page d'invitation qui lance
    // son application toute seule reste possible, pas une boucle) ; hors onglet,
    // au plus une question toutes les dix secondes.
    if (!fresh) {
      if (st.asked || (since === null && now - st.at < 10000)) return false;
      st.asked = true;
    }
    st.at = now;
    const embedded = details && details.isMainFrame === false ? originOf(wc.getURL()) : '';
    const note = embedded && embedded !== origin ? t('perm.embedded', { site: siteName(embedded) }) : '';
    const sheet = sheets.open(wc, 'external', { site: siteName(origin), scheme: name, url: url.slice(0, 300), canRemember: origin !== 'null', note });
    const parent = env.ownerWindow(wc);
    const p = sheet
      ? sheet.result
      : env.confirm(parent, { type: 'question', message: t('external.title', { scheme: name }), detail: t('external.text', { site: siteName(origin) }) + '\n' + url.slice(0, 300), buttons: [t('external.go'), t('sheet.cancel')], defaultId: 1, cancelId: 1 }).then((ok) => (ok ? { open: true } : false));
    pending.set(id, p);
    const res = await p.finally(() => pending.delete(id));
    // Refus explicite (pas une feuille fermée par un changement de page) : retenu pour cette page.
    if (res === false || (res && res.open !== true)) st.refused.add(name);
    if (!res || res.open !== true) return false;
    // La page qui demandait n'est plus là : rien n'est ouvert, rien n'est retenu.
    if (!stillThere(wc, origin, details && details.isMainFrame)) return false;
    if (res.always === true) remember(entry, origin, key, true);
  }
  lastExternal.set(wc.id, Date.now());
  if (lastExternal.size > 500) lastExternal.clear();
  env.openExternal(url);
  return false;
}

// Téléchargements multiples. Un téléchargement que l'utilisateur n'a pas demandé
// (ni clic rapporté par le moteur, ni geste récent dans l'onglet, ni action d'Orbe)
// est « automatique ». Une page a droit à un téléchargement automatique ; pour le
// suivant, Orbe demande (autorisation « downloads », retenue par site comme les
// autres). Décision synchrone, comme l'exige « will-download » : le téléchargement
// qui déclenche la question est refusé, puis relancé si la réponse est oui.
// Renvoie true si le téléchargement peut partir.
function downloadGate(ses, wc, { gesture = false, url = '' } = {}) {
  if (gesture || !wc || wc.isDestroyed()) return true;
  const since = env.gesture(wc);
  if (since === null) return true; // pas un onglet (page d'extension, vue d'Orbe) : hors sujet
  const entry = memories.get(ses);
  if (!entry) return true;
  const st = pageState(wc);
  const now = Date.now();
  // Un geste récent dans l'onglet couvre UN téléchargement (lancé par script après le clic).
  if (since < GESTURE && now - since > (st.dlGesture || 0)) { st.dlGesture = now - since; return true; }
  st.downloads = (st.downloads || 0) + 1;
  if (st.downloads <= 1) return true;
  const origin = originOf(wc.getURL());
  const known = origin && origin !== 'null' ? lookup(entry.memory(), origin, 'downloads') : undefined;
  if (known === true) return true;
  if (known === false || st.dlAsked) return false;
  st.dlAsked = true; // une seule question par page
  ask(wc, origin || 'null', ['downloads'], '').then((ok) => {
    if (ok === null || !stillThere(wc, origin, true)) return;
    remember(entry, origin, 'downloads', ok);
    if (ok && /^https?:/i.test(url)) { try { wc.downloadURL(url); } catch {} }
  });
  return false;
}

// Demande « media » sans caméra ni micro. Relevé sur Electron 44.7 : c'est ce
// que reçoit Orbe pour un partage d'écran (`getDisplayMedia`), juste avant
// l'appel du sélecteur… mais AUSSI pour l'ancienne capture d'écran
// `getUserMedia({ video: { mandatory: { chromeMediaSource: 'desktop' } } })`,
// qu'Electron accorde alors directement, écran entier, sans sélecteur ni geste.
// Les deux demandes sont identiques à ce stade. Orbe ne laisse donc passer que
// ce qui peut être un vrai partage : un onglet (le sélecteur n'existe que là)
// où l'utilisateur vient d'agir. Le reste se joue dans `answerDisplay`.
function displayGate(wc) {
  if (!wc || wc.isDestroyed()) return false;
  const since = env.gesture(wc);
  return since !== null && since < GESTURE ? 'display' : false;
}

// Réponse « oui » à la demande ci-dessus. Pour un vrai `getDisplayMedia`,
// Electron appelle le sélecteur (display-media.js) AVANT que `callback(true)` ne
// rende la main (vérifié par un essai) : `noteDisplay` le signale. S'il n'a pas
// été appelé, c'était l'ancienne capture d'écran, et Electron vient de
// l'accorder : les processus de la page sont arrêtés sur-le-champ, avant
// qu'aucune image ne leur parvienne (l'ouverture du flux demande plusieurs
// allers-retours entre processus). Aucun site ordinaire n'emploie cet appel :
// dans Chrome il est réservé aux extensions.
const display = { armed: null, blocked: 0 };
function noteDisplay() {
  if (display.armed) display.armed.seen = true;
}

function contain(wc) {
  display.blocked += 1;
  if (!wc || wc.isDestroyed()) return;
  const pids = new Set();
  try { for (const f of wc.mainFrame.framesInSubtree) pids.add(f.osProcessId); } catch {}
  try { wc.forcefullyCrashRenderer(); } catch {}
  for (const pid of pids) { try { if (pid > 0 && pid !== process.pid) process.kill(pid, 'SIGKILL'); } catch {} }
  console.error('[orbe] capture d’écran sans sélecteur (getUserMedia chromeMediaSource) : page arrêtée');
  env.toast(wc, t('share.legacyBlocked'));
}

function answerDisplay(wc, callback) {
  const armed = { seen: false };
  display.armed = armed;
  try { callback(true); } finally { display.armed = null; }
  if (!armed.seen) contain(wc);
}

async function request(entry, wc, permission, details) {
  const origin = originOf((details && details.requestingUrl) || (wc && !wc.isDestroyed() && wc.getURL()) || '');
  if (origin.startsWith('orbe://') || AUTO_ALLOW.has(permission)) return true;
  if (permission === 'openExternal') return external(entry, wc, origin, details);
  if (!ASKABLE.has(permission) || !origin) return false;
  const kinds = permission === 'media' ? mediaKeys(details) : [permission];
  if (!kinds.length) return displayGate(wc);
  const top = wc && !wc.isDestroyed() && details && details.isMainFrame === false ? originOf(wc.getURL()) : '';
  const embedder = top && top !== origin ? top : '';
  const keys = kinds.map((k) => keyFor(k, embedder));
  const known = keys.map((k) => lookup(entry.memory(), origin, k));
  if (known.includes(false)) return false;
  const unknown = kinds.filter((k, i) => known[i] === undefined);
  if (unknown.length) {
    const ok = await ask(wc, origin, unknown, top);
    if (ok === null) return false;
    // Réponse arrivée après le départ de la page qui demandait : sans effet.
    if (!stillThere(wc, origin, details && details.isMainFrame)) return false;
    for (const k of unknown) remember(entry, origin, keyFor(k, embedder), ok);
    if (!ok) return false;
  }
  if (permission === 'media') {
    if (!(await osAccess(wc, kinds))) return false;
    if (wc && !wc.isDestroyed()) for (const k of kinds) capture.mark(wc, k);
  }
  return true;
}

function check(entry, permission, requestingOrigin, details) {
  if (AUTO_ALLOW.has(permission) || DEVICES.has(permission) || (requestingOrigin || '').startsWith('orbe://')) return true;
  const origin = originOf(requestingOrigin || '');
  const memory = entry.memory();
  if (permission === 'media') {
    const top = details && details.isMainFrame === false ? originOf(details.embeddingOrigin || '') : '';
    const embedder = top && top !== origin ? top : '';
    const has = (k) => lookup(memory, origin, keyFor(k, embedder)) === true;
    const type = details && details.mediaType;
    if (type === 'video') return has('camera');
    if (type === 'audio') return has('microphone');
    return has('camera') || has('microphone');
  }
  if (permission === 'storage-access') {
    const top = originOf((details && details.embeddingOrigin) || '');
    return lookup(memory, origin, keyFor(permission, top && top !== origin ? top : '')) === true;
  }
  return lookup(memory, origin, permission) === true;
}

// Appareils USB, HID, série : Orbe n'a pas (encore) de sélecteur. La demande est
// annulée tout de suite, avec un message, plutôt que de rester sans réponse —
// et surtout sans jamais laisser Electron choisir le premier appareil.
function denyDevice(kind, wc, callback, value) {
  try { callback(value); } catch {}
  if (wc && !wc.isDestroyed()) env.toast(wc, t('device.unsupported', { kind: t('device.' + kind) }));
}

// `profileOf()` : identifiant du profil de la session (lu à chaque demande).
// Chaque profil a ses propres réponses : le profil « default » garde
// `store.state.permissions`, les autres `store.state.profilePermissions[id]`.
function attach(ses, { persist, profileOf = () => 'default' }) {
  const volatile = {};
  // Lu à chaque demande : « réinitialiser les autorisations » agit tout de suite.
  const memory = () => {
    if (!persist) return volatile;
    const id = profileOf() || 'default';
    if (id === 'default') return store.state.permissions;
    const all = store.state.profilePermissions || (store.state.profilePermissions = {});
    return all[id] || (all[id] = {});
  };
  const entry = { memory, persist };
  memories.set(ses, entry);
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    request(entry, wc, permission, details).then((ok) => {
      if (ok === 'display') answerDisplay(wc, callback); else callback(ok === true);
    }, (err) => { console.error('[orbe] autorisation', err); callback(false); });
  });
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => check(entry, permission, requestingOrigin, details));
  ses.setDevicePermissionHandler(() => false);
  const fromFrame = (frame) => { try { return frame ? webContents.fromFrame(frame) : null; } catch { return null; } };
  ses.on('select-hid-device', (event, details, callback) => { event.preventDefault(); denyDevice('hid', fromFrame(details && details.frame), callback, undefined); });
  ses.on('select-usb-device', (event, details, callback) => { event.preventDefault(); denyDevice('usb', fromFrame(details && details.frame), callback, undefined); });
  ses.on('select-serial-port', (event, portList, wc, callback) => { event.preventDefault(); denyDevice('serial', wc, callback, ''); });
  return entry;
}

function setup({ test = false, ...options } = {}) {
  Object.assign(env, options);
  // Tests : ni question du système, ni application lancée.
  if (test) Object.assign(os, { status: () => 'granted', ask: async () => true, openSettings: () => {} }, { real: false });
  if (test) env.openExternal = () => {};
  // Bluetooth : sans réponse, Electron prendrait le premier appareil trouvé.
  app.on('web-contents-created', (e, wc) => {
    wc.on('select-bluetooth-device', (event, devices, callback) => { event.preventDefault(); denyDevice('bluetooth', wc, callback, ''); });
  });
}

// --- Vue des autorisations d'un site ------------------------------------------
function list(ses, origin) {
  const entry = memories.get(ses);
  const m = (entry && entry.memory()[origin]) || {};
  const out = [];
  for (const [key, value] of Object.entries(m)) {
    if (typeof value !== 'boolean') continue;
    if (key === 'media') { for (const k of ['camera', 'microphone']) if (typeof m[k] !== 'boolean') out.push({ key: k, label: labelOf(k), value }); } else out.push({ key, label: labelOf(key), value });
  }
  return out;
}

function reset(ses, origin, key) {
  const entry = memories.get(ses);
  if (entry && origin) forget(entry, origin, String(key));
}

// Réglage direct d'une autorisation (fenêtres surgissantes : « toujours autoriser »).
function set(ses, origin, key, value) {
  const entry = memories.get(ses);
  if (entry) remember(entry, origin, key, !!value);
}

function get(ses, origin, key) {
  const entry = memories.get(ses);
  return entry ? lookup(entry.memory(), origin, key) : undefined;
}

// « Réinitialiser les autorisations des sites » : tous les profils.
function resetAll() {
  for (const k of Object.keys(store.state.permissions)) delete store.state.permissions[k];
  delete store.state.profilePermissions;
  store.save();
}

function forgetProfile(id) {
  const all = store.state.profilePermissions;
  if (all && all[id]) { delete all[id]; store.save(); }
}

module.exports = { attach, setup, list, reset, set, get, downloadGate, resetAll, forgetProfile, noteDisplay, originOf, siteName, labelOf, os, env, internals: { request, check, external, osAccess, memories, BLOCKED_SCHEMES, lastExternal, pages, display, stillThere, keyFor } };
