// Téléchargements : dossier de destination, « toujours demander », pause,
// reprise, annulation, reprise après interruption, mise en garde pour les
// fichiers exécutables, PDF ouverts dans un onglet une fois téléchargés.
//
// Sécurité :
//  - le nom du fichier proposé par le site est réduit à un simple nom (jamais un
//    chemin) et ne remplace jamais un fichier existant ;
//  - un fichier exécutable n'est jamais ouvert tout seul : il est signalé, et
//    son ouverture depuis Orbe demande une confirmation qui nomme sa provenance ;
//  - seuls les PDF sont ouverts automatiquement, dans la visionneuse de Chromium
//    (bac à sable), jamais par une application du système. « PDF » se juge sur le
//    fichier enregistré : extension `.pdf` ET contenu qui commence par `%PDF-`.
//    Le type annoncé par le serveur ne compte pas : un fichier `.html` servi
//    comme « application/pdf » serait sinon ouvert en `file://` dans un onglet ;
//  - l'ouverture automatique n'a lieu que pour un téléchargement lancé par un
//    geste de l'utilisateur, et « toujours demander » ne laisse pas une page
//    enchaîner les fenêtres d'enregistrement ;
//  - le fichier terminé est marqué « venu d'Internet » AVANT d'être annoncé ou
//    ouvert, à l'endroit où il a réellement été écrit (une extension peut avoir
//    changé son nom en route). Si la marque ne peut pas être posée, le fichier est
//    tenu pour douteux : question avant de l'ouvrir, de le copier, de le partager
//    ou de le glisser hors d'Orbe, et la Bibliothèque le signale ;
//  - une image n'est décodée par Orbe (« Copier ») que si elle est petite, marquée
//    et sans risque connu ; sinon c'est le fichier qui est copié, sans être lu.
const { app, clipboard, ClipboardItem, dialog, nativeImage, shell, BaseWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { store, uid } = require('./store');

// Extensions de fichiers qui peuvent exécuter du code à l'ouverture.
const DANGEROUS = new Set(['dmg', 'pkg', 'mpkg', 'app', 'command', 'tool', 'terminal', 'workflow', 'action', 'scpt', 'scptd', 'applescript', 'sh', 'bash', 'zsh', 'csh', 'ksh', 'fish', 'run', 'bin',
  'exe', 'msi', 'msix', 'msp', 'appx', 'appxbundle', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl', 'lnk', 'ps1', 'psm1', 'vbs', 'vbe', 'jse', 'wsf', 'wsh', 'hta', 'reg', 'dll', 'sys', 'inf', 'url',
  'jar', 'jnlp', 'apk', 'deb', 'rpm', 'iso', 'img', 'webloc', 'desktop', 'appimage',
  'js', 'vb', 'wsc', 'ws', 'msc', 'chm', 'scf', 'application', 'appref-ms', 'settingcontent-ms', 'diagcab', 'gadget', 'xll', 'py', 'pyw', 'cab', 'vhd', 'vhdx',
  'inetloc', 'fileloc', 'mobileconfig', 'prefpane', 'xip']);

const env = {
  // Fenêtre Orbe (BaseWindow) de la page qui télécharge, pour y attacher les boîtes de dialogue.
  ownerWindow: () => null,
  profileSession: () => null, // identifiant de profil -> session
  openInTab: () => false, // (adresse, webContents d'origine) -> ouvre un onglet
  gate: () => true, // (session, webContents, item) -> ce téléchargement peut-il partir ? (téléchargements multiples)
  // Boîtes de dialogue du système ; remplacées pendant les tests.
  saveDialog: (parent, opts) => (parent ? dialog.showSaveDialogSync(parent, opts) : dialog.showSaveDialogSync(opts)),
  confirm: async (parent, opts) => (await (parent ? dialog.showMessageBox(parent, opts) : dialog.showMessageBox(opts))).response === 0,
  openPath: (file) => shell.openPath(file),
  quit: () => app.quit(),
  reveal: (file) => shell.showItemInFolder(file),
  // Marque « venu d'Internet » (voir `quarantine`) : true, false (échec) ou null (système sans marque).
  quarantine: (file, url, withUrl) => quarantine(file, url, withUrl),
  // Décodage d'une image (« Copier ») ; compté par les essais.
  decode: (file) => nativeImage.createFromPath(file),
  // Feuille de partage du système (macOS), pour un fichier dont la marque a manqué.
  share: (files, parent) => { const { ShareMenu } = require('electron'); new ShareMenu({ filePaths: files }).popup(parent ? { window: parent } : undefined); },
  // Corbeille du système : le fichier s'y retrouve, rien n'est détruit.
  trash: (file) => shell.trashItem(file),
  // Menu d'un téléchargement : rend la main quand il se referme.
  popup: (template, parent) => new Promise((resolve) => {
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ ...(parent ? { window: parent } : {}), callback: () => setTimeout(resolve, 30) });
  }),
};
const items = new Map(); // identifiant -> DownloadItem en cours (cette exécution d'Orbe)
const resuming = new Map(); // chemin du fichier -> enregistrement dont la reprise est demandée
const profiles = new WeakMap(); // session -> identifiant de profil
const t = (key, vars) => store.t(key, null, vars);

// Caractères invisibles qui retournent le sens de lecture (« exe.fdp » affiché
// « pdf.exe ») ou se cachent en fin de nom : retirés avant de lire l'extension.
const HIDDEN = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const clean = (name) => String(name || '').replace(HIDDEN, '').replace(/[. ]+$/, '');
const extOf = (name) => path.extname(clean(name)).slice(1).toLowerCase();
const isDangerous = (name) => DANGEROUS.has(extOf(name));
// Vrai PDF : le fichier enregistré porte l'extension .pdf et commence par « %PDF- ».
function isPdfFile(file) {
  if (extOf(file) !== 'pdf') return false;
  let fd = null;
  try {
    fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(5);
    return fs.readSync(fd, head, 0, 5, 0) === 5 && head.toString('latin1') === '%PDF-';
  } catch { return false; } finally { if (fd !== null) { try { fs.closeSync(fd); } catch {} } }
}
// Exécutable ? Jugé sur le fichier tel qu'il est sur disque, au moment de l'ouvrir.
const dangerNow = (d) => !!d.danger || isDangerous(d.path) || isDangerous(d.name);
// Téléchargements lancés par Orbe à la demande de l'utilisateur : id webContents -> adresses attendues.
const expected = new Map();
function saveFrom(wc, url) {
  if (!wc || wc.isDestroyed() || typeof url !== 'string' || !url) return;
  const id = wc.id;
  if (!expected.has(id)) { expected.set(id, new Set()); wc.once('destroyed', () => expected.delete(id)); }
  const set = expected.get(id);
  set.add(url);
  setTimeout(() => set.delete(url), 30000).unref();
  wc.downloadURL(url);
}
const asked = new Map(); // id webContents (0 : aucun) -> instant de la dernière fenêtre « enregistrer sous »
const ASK_GAP = 10000;

// Dossier de destination : celui des réglages (général, ou propre au profil de la
// session — voir prefs.js, par `sessions.hooks.downloadDir`), sinon Téléchargements.
let dirOf = () => '';
function downloadDir(ses) {
  let custom = '';
  try { custom = dirOf(ses) || ''; } catch {}
  return custom || app.getPath('downloads');
}

// Nom proposé par le site : un simple nom de fichier, sans dossier ni caractère interdit.
function safeName(name) {
  const base = clean(String(name || '').split(/[\\/]/).pop()).replace(/[<>:"|?*]/g, '_').replace(/^\.+/, '').slice(0, 200);
  return base || 'téléchargement';
}

function uniquePath(dir, name) {
  const parsed = path.parse(name);
  let target = path.join(dir, parsed.base);
  for (let i = 1; fs.existsSync(target); i++) target = path.join(dir, `${parsed.name} (${i})${parsed.ext}`);
  return target;
}

function findRecord(id) {
  return store.state.downloads.find((d) => d.id === id) || [...volatileRecords].find((d) => d.id === id) || null;
}
const volatileRecords = new Set(); // navigation privée : jamais écrits sur disque

// Marque « venu d'Internet » sur le fichier téléchargé, comme le font Safari et Chrome :
// c'est elle qui fait dire au système « téléchargé depuis Internet, voulez-vous l'ouvrir ? »
// (Gatekeeper sur macOS, SmartScreen et la zone Internet sur Windows). Electron ne la pose pas.
// `withUrl` : faux en navigation privée (l'adresse d'origine n'est pas écrite à côté du fichier).
function quarantine(file, url, withUrl = true) {
  return new Promise((resolve) => {
    if (process.platform === 'darwin') {
      const value = `0081;${Math.floor(Date.now() / 1000).toString(16)};Orbe;${require('crypto').randomUUID().toUpperCase()}`;
      require('child_process').execFile('/usr/bin/xattr', ['-w', 'com.apple.quarantine', value, file], { timeout: 5000 }, (err) => resolve(!err));
    } else if (process.platform === 'win32') {
      const host = withUrl && /^https?:/i.test(url || '') ? `HostUrl=${String(url).replace(/[\r\n]/g, '')}\r\n` : '';
      fs.writeFile(file + ':Zone.Identifier', `[ZoneTransfer]\r\nZoneId=3\r\n${host}`, (err) => resolve(!err));
    } else resolve(null); // autre système : pas de marque de ce genre
  });
}

// Pose la marque, avec une seconde tentative. Renvoie true, false (le fichier n'est
// pas marqué) ou null (système sans marque).
async function mark(file, url, withUrl = true) {
  let ok = await env.quarantine(file, url, withUrl);
  if (ok === false) ok = await env.quarantine(file, url, withUrl);
  return ok;
}

// « Enregistrer la page » : la page et son dossier « …_files » (images, scripts,
// feuilles de style) viennent d'Internet eux aussi. Electron n'annonce pas cet
// enregistrement par « will-download » : il est marqué ici, fichier par fichier.
const TREE_MAX = 5000;
async function markTree(file, url, withUrl = true) {
  const files = [file];
  const dir = file.replace(/\.[^./\\]+$/, '') + '_files';
  const walk = (d, depth) => {
    let names = [];
    try { names = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const n of names) {
      if (files.length >= TREE_MAX) return;
      const p = path.join(d, n.name);
      if (n.isDirectory()) { if (depth < 4) walk(p, depth + 1); } else if (n.isFile()) files.push(p);
    }
  };
  walk(dir, 0);
  let all = true;
  for (const f of files) { if (!fs.existsSync(f)) continue; if ((await mark(f, url, withUrl)) === false) all = false; }
  return { files, ok: all };
}

// Fichier resté sans marque : douteux jusqu'à ce qu'elle soit posée.
const unmarked = (d) => !!d && d.marked === false;
const accepted = new WeakSet(); // enregistrements sans marque que l'utilisateur a accepté d'utiliser (cette exécution)
const records = new WeakMap(); // DownloadItem -> enregistrement

// Avant d'ouvrir, de copier, de partager ou de glisser un fichier sans marque :
// nouvelle tentative, puis question. Renvoie true si l'on peut continuer.
async function cleared(d, parent) {
  if (!unmarked(d)) return true;
  const ok = await mark(d.path, d.url, !volatileRecords.has(d));
  if (ok !== false) { d.marked = true; if (!volatileRecords.has(d)) store.save(); return true; }
  let host = '';
  try { host = new URL(d.url).host; } catch {}
  const yes = await env.confirm(parent, {
    type: 'warning', message: t('dl.unmarkedTitle', { name: d.name }), detail: t('dl.unmarkedDetail', { host: host || '?' }), buttons: [t('dl.unmarkedGo'), t('sheet.cancel')], defaultId: 1, cancelId: 1,
  });
  if (yes) accepted.add(d);
  return yes;
}
// Glisser hors d'Orbe ne peut pas attendre une réponse : permis seulement si la
// marque est posée, ou si l'utilisateur a déjà accepté ce fichier.
const dragAllowed = (d) => !unmarked(d) || accepted.has(d);

// Nom voulu par une extension (chrome.downloads.download({ filename })) : réduit
// à un simple nom comme celui d'un site, dans le dossier déjà choisi, sans jamais
// remplacer un fichier. L'enregistrement de la Bibliothèque suit. Si l'utilisateur
// a choisi lui-même l'emplacement (« toujours demander »), son choix reste.
function rename(item, wanted) {
  let current = '';
  try { current = item.getSavePath() || ''; } catch {}
  if (!current || typeof wanted !== 'string' || !wanted.trim()) return current;
  const d = records.get(item);
  if (d && d.asked) return current;
  const target = uniquePath(path.dirname(current), safeName(wanted));
  item.setSavePath(target);
  if (d) adopt(d, target);
  return target;
}

// L'enregistrement décrit le fichier réellement écrit : chemin, nom, danger.
function adopt(d, file) {
  if (file && file !== d.path) { d.path = file; d.name = path.basename(file); }
  if (isDangerous(d.name) || isDangerous(d.path)) d.danger = true; else delete d.danger;
}

// Quitter pendant qu'un téléchargement avance : la question est posée (« Downloads in progress » d'Arc).
let quitConfirmed = false;
function beforeQuit(e) {
  const running = [...items.values()].filter((it) => { try { return it.getState() === 'progressing' && !it.isPaused(); } catch { return false; } }).length;
  if (!running || quitConfirmed) return false;
  e.preventDefault();
  Promise.resolve(env.confirm(BaseWindow.getFocusedWindow(), {
    type: 'warning', message: t('dl.quitTitle'), detail: t('dl.quitDetail', { n: running }), buttons: [t('dl.quitAnyway'), t('sheet.cancel')], defaultId: 1, cancelId: 1,
  })).then((ok) => { if (ok) { quitConfirmed = true; env.quit(); } }).catch(() => {});
  return true;
}
app.on('before-quit', beforeQuit);

// La même question, posée d'avance par qui s'apprête à quitter (restauration d'une
// sauvegarde) : true si l'on peut quitter. Un accord vaut pour l'arrêt qui suit.
async function confirmQuit() {
  const running = [...items.values()].filter((it) => { try { return it.getState() === 'progressing' && !it.isPaused(); } catch { return false; } }).length;
  if (!running || quitConfirmed) return true;
  const ok = await env.confirm(BaseWindow.getFocusedWindow(), {
    type: 'warning', message: t('dl.quitTitle'), detail: t('dl.quitDetail', { n: running }), buttons: [t('dl.quitAnyway'), t('sheet.cancel')], defaultId: 1, cancelId: 1,
  });
  if (ok) quitConfirmed = true;
  return !!ok;
}

// Débit lissé de chaque téléchargement en cours (jamais enregistré) : il donne le temps
// restant affiché au bas de la barre latérale. Un relevé toutes les 500 ms au plus.
const rates = new WeakMap();
function sample(d, now = Date.now()) {
  const r = rates.get(d);
  if (!r) { rates.set(d, { at: now, bytes: d.received || 0, rate: 0 }); return; }
  const dt = now - r.at;
  if (dt < 500) return;
  const inst = (Math.max(0, (d.received || 0) - r.bytes) * 1000) / dt;
  r.rate = r.rate ? r.rate * 0.7 + inst * 0.3 : inst;
  r.at = now;
  r.bytes = d.received || 0;
}
// Secondes restantes ; null si on ne peut pas le dire (taille inconnue, pause, débit pas encore mesuré).
function eta(d) {
  const r = rates.get(d);
  if (!r || !(r.rate > 0) || !d.total || d.paused || d.stalled || d.total <= d.received) return null;
  return Math.min(359999, Math.ceil((d.total - d.received) / r.rate));
}

function track(d, item, wc, { persist, hooks }) {
  items.set(d.id, item);
  records.set(item, d);
  const note = () => {
    d.received = item.getReceivedBytes();
    sample(d);
    d.total = item.getTotalBytes();
    d.paused = item.isPaused();
    d.canResume = item.canResume();
    // De quoi reprendre plus tard, même après un redémarrage d'Orbe.
    d.resume = { urlChain: item.getURLChain().slice(0, 20), mimeType: item.getMimeType(), eTag: item.getETag(), lastModified: item.getLastModifiedTime(), startTime: item.getStartTime() };
  };
  item.on('updated', (e, state) => {
    note();
    d.state = 'progressing';
    d.stalled = state === 'interrupted';
    hooks.onDownload('progress', d, wc, item);
  });
  item.once('done', async (e, state) => {
    try { d.received = item.getReceivedBytes(); d.total = item.getTotalBytes() || d.total; } catch {}
    // Chemin réel du fichier : il a pu changer depuis « will-download » (nom imposé
    // par une extension). Tout ce qui suit — marque, liste, question avant d'ouvrir
    // un exécutable — porte sur CE fichier.
    let real = '';
    try { real = item.getSavePath() || ''; } catch {}
    adopt(d, real);
    d.paused = false;
    d.stalled = false;
    d.canResume = state === 'interrupted';
    if (state !== 'interrupted') delete d.resume;
    // Annulé : Electron laisse sur disque le morceau déjà reçu ; ce fichier
    // incomplet, créé pour ce téléchargement, est retiré.
    if (state === 'cancelled' && d.path) fs.unlink(d.path, () => {});
    // La marque est posée avant que le téléchargement soit annoncé terminé : rien
    // ne peut ouvrir le fichier entre-temps. (L'état reste « en cours » jusque-là.)
    if (state === 'completed' && d.path) {
      let ok = false;
      try { ok = await mark(d.path, d.url, persist); } catch {}
      if (ok === false) d.marked = false; else if (ok === true) d.marked = true; else delete d.marked;
    }
    items.delete(d.id);
    d.state = state; // 'completed', 'cancelled' ou 'interrupted'
    if (persist) store.save();
    hooks.onDownload('done', d, wc, item);
    // Ouverture automatique : un vrai PDF, marqué, téléchargé à la demande de l'utilisateur.
    if (state === 'completed' && d.gesture && store.state.settings.downloadOpenPdf && !dangerNow(d) && !unmarked(d) && isPdfFile(d.path)) openFile(d, wc);
  });
}

function attach(ses, { persist, hooks }) {
  dirOf = (s) => hooks.downloadDir(s);
  ses.on('will-download', (event, item, wc) => {
    // Reprise d'un téléchargement interrompu : il garde son enregistrement.
    const again = resuming.get(item.getSavePath());
    if (again) {
      resuming.delete(item.getSavePath());
      again.state = 'progressing';
      again.stalled = false;
      track(again, item, wc, { persist, hooks });
      if (item.canResume()) item.resume();
      hooks.onDownload('progress', again, wc, item);
      return;
    }
    // Demandé par Orbe pour l'utilisateur (« Enregistrer l'image ») : hors de la règle qui suit.
    const wanted = wc && !wc.isDestroyed() ? expected.get(wc.id) : null;
    const mine = !!wanted && wanted.delete(item.getURL());
    // Téléchargements multiples lancés par la page sans rien demander (permissions.downloadGate).
    if (!mine && !env.gate(ses, wc, item)) { event.preventDefault(); return; }
    const name = safeName(item.getFilename());
    let target = uniquePath(downloadDir(ses), name);
    if (store.state.settings.downloadAsk) {
      // Sans geste de l'utilisateur, une page n'ouvre pas deux fenêtres
      // d'enregistrement de suite (elles bloquent toute l'application).
      const who = wc && !wc.isDestroyed() ? wc.id : 0;
      const now = Date.now();
      if (!item.hasUserGesture() && now - (asked.get(who) || 0) < ASK_GAP) { event.preventDefault(); return; }
      asked.set(who, now);
      if (asked.size > 500) asked.clear();
      const parent = (wc && env.ownerWindow(wc)) || BaseWindow.getFocusedWindow();
      const chosen = env.saveDialog(parent, { defaultPath: target, title: t('dl.saveAs') });
      // Annulé : pas de téléchargement.
      if (!chosen || typeof chosen !== 'string' || !path.isAbsolute(chosen)) { event.preventDefault(); return; }
      target = chosen;
    }
    const byUser = !!store.state.settings.downloadAsk; // emplacement choisi dans la fenêtre d'enregistrement
    item.setSavePath(target);
    const d = {
      id: uid(), name: path.basename(target), path: target, url: item.getURL(), total: item.getTotalBytes(), received: 0, state: 'progressing', at: Date.now(),
      mime: item.getMimeType(), profile: profiles.get(ses) || 'default', gesture: item.hasUserGesture(),
    };
    if (byUser) d.asked = true;
    if (isDangerous(d.name)) d.danger = true;
    if (persist) store.addDownload(d); else volatileRecords.add(d);
    track(d, item, wc, { persist, hooks });
    hooks.onDownload('start', d, wc, item);
  });
}

// Associe une session à son profil : la reprise repart avec les mêmes cookies.
function bindProfile(ses, id) {
  profiles.set(ses, id || 'default');
}

function fileSize(file) {
  try { return fs.statSync(file).size; } catch { return -1; }
}

// Reprend un téléchargement : en pause, calé, ou interrompu (même par la
// fermeture d'Orbe). Si la partie déjà reçue n'est plus là, il repart de zéro.
function resume(d) {
  const item = items.get(d.id);
  if (item) {
    if (item.isPaused() || item.canResume()) item.resume();
    return 'resumed';
  }
  if (d.state !== 'interrupted' && d.state !== 'cancelled') return 'none';
  const ses = env.profileSession(d.profile || 'default');
  if (!ses || !/^https?:/i.test(d.url || '')) return 'none';
  const size = fileSize(d.path);
  if (d.state === 'interrupted' && d.resume && size > 0 && (!d.total || size < d.total)) {
    resuming.set(d.path, d);
    try {
      ses.createInterruptedDownload({
        path: d.path, urlChain: d.resume.urlChain && d.resume.urlChain.length ? d.resume.urlChain : [d.url], mimeType: d.resume.mimeType || '', offset: size, length: d.total || 0,
        lastModified: d.resume.lastModified || '', eTag: d.resume.eTag || '', startTime: d.resume.startTime || 0,
      });
      return 'continued';
    } catch (err) {
      resuming.delete(d.path);
      console.error('[orbe] reprise du téléchargement', err.message);
    }
  }
  // Rien à continuer : nouveau téléchargement, l'ancienne ligne disparaît.
  const list = store.state.downloads;
  const i = list.indexOf(d);
  if (i >= 0) list.splice(i, 1);
  if (d.state === 'interrupted' && size >= 0 && d.total && size < d.total) { try { fs.unlinkSync(d.path); } catch {} }
  ses.downloadURL(d.url);
  store.save();
  return 'restarted';
}

function cancel(d) {
  const item = items.get(d.id);
  if (item) { item.cancel(); return true; }
  if (d.state !== 'interrupted') return false;
  // Enregistrement d'une exécution précédente : on retire le morceau resté sur disque.
  const size = fileSize(d.path);
  if (size >= 0 && d.total && size < d.total) { try { fs.unlinkSync(d.path); } catch {} }
  d.state = 'cancelled';
  d.canResume = false;
  delete d.resume;
  store.save();
  return true;
}

// Ouvre un fichier téléchargé : un PDF dans un onglet, le reste par le système.
// Un fichier exécutable demande d'abord confirmation.
async function openFile(d, wc, { parent = null, confirmed = false } = {}) {
  if (!d || d.state !== 'completed' || !fs.existsSync(d.path)) return false;
  const danger = dangerNow(d);
  // Sans marque « venu d'Internet » : nouvelle tentative de la poser avant toute question.
  if (unmarked(d) && (await mark(d.path, d.url, !volatileRecords.has(d))) !== false) { d.marked = true; if (!volatileRecords.has(d)) store.save(); }
  if (danger && !confirmed) {
    let host = '';
    try { host = new URL(d.url).host; } catch {}
    const ok = await env.confirm(parent, {
      type: 'warning', message: t('dl.dangerTitle', { name: d.name }), detail: t('dl.dangerDetail', { host: host || '?' }) + (unmarked(d) ? '\n\n' + t('dl.unmarkedDetail', { host: host || '?' }) : ''), buttons: [t('dl.dangerOpen'), t('sheet.cancel')], defaultId: 1, cancelId: 1,
    });
    if (!ok) return false;
    if (unmarked(d)) accepted.add(d);
  } else if (!confirmed && !(await cleared(d, parent))) return false;
  if (!fs.existsSync(d.path)) return false;
  if (!danger && isPdfFile(d.path) && env.openInTab(pathToFileURL(d.path).href, wc)) return true;
  env.openPath(d.path);
  return true;
}

// « Copier » : une image part comme image (elle se colle dans un message, un document) ;
// tout autre fichier part comme fichier (il se colle dans le Finder ou l'Explorateur).
// Une image n'est décodée ici (processus principal) que si elle est petite — en octets
// et en points, lus dans son en-tête sans la décoder —, marquée et sans risque connu.
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']);
const IMAGE_BYTES = 32 * 1024 * 1024;
const IMAGE_SIDE = 16384;
const IMAGE_PIXELS = 64e6;

// Dimensions annoncées par l'en-tête d'une image déjà en mémoire (PNG, JPEG, GIF, WebP,
// BMP), ou null. `n` : nombre d'octets valides de `b`. Rien n'est décodé.
function imageSizeOf(b, n = b ? b.length : 0) {
  try {
    if (n < 30) return null;
    if (b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a && b.toString('latin1', 12, 16) === 'IHDR') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (b.toString('latin1', 0, 4) === 'GIF8') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    if (b.toString('latin1', 0, 2) === 'BM') return { width: Math.abs(b.readInt32LE(18)), height: Math.abs(b.readInt32LE(22)) };
    if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
      const kind = b.toString('latin1', 12, 16);
      if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { width: (v & 0x3fff) + 1, height: ((v >>> 14) & 0x3fff) + 1 }; }
      if (kind === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
      return null;
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      for (let pos = 2; pos + 9 < n;) {
        if (b[pos] !== 0xff) return null;
        const m = b[pos + 1];
        if (m === 0xff) { pos += 1; continue; }
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: b.readUInt16BE(pos + 7), height: b.readUInt16BE(pos + 5) };
        if (m === 0xd8 || m === 0xd9 || m === 0xda || (m >= 0xd0 && m <= 0xd7)) return null;
        pos += 2 + b.readUInt16BE(pos + 2);
      }
    }
    return null;
  } catch { return null; }
}

// Les mêmes, lues dans le début d'un fichier.
function imageSize(file) {
  let fd = null;
  try {
    fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(512 * 1024);
    const n = fs.readSync(fd, b, 0, b.length, 0);
    return imageSizeOf(b, n);
  } catch { return null; } finally { if (fd !== null) { try { fs.closeSync(fd); } catch {} } }
}

function decodable(d) {
  if (!d || dangerNow(d) || unmarked(d) || !IMAGE.has(extOf(d.path))) return false;
  const bytes = fileSize(d.path);
  if (bytes <= 0 || bytes > IMAGE_BYTES) return false;
  const size = imageSize(d.path);
  return !!size && size.width > 0 && size.height > 0 && size.width <= IMAGE_SIDE && size.height <= IMAGE_SIDE && size.width * size.height <= IMAGE_PIXELS;
}

async function copyFile(d, { parent = null } = {}) {
  if (!d || d.state !== 'completed' || !fs.existsSync(d.path)) return false;
  if (!(await cleared(d, parent))) return false;
  try {
    // (`accepted` : fichier resté sans marque, accepté par l'utilisateur — copié tel quel, jamais décodé.)
    if (!accepted.has(d) && decodable(d)) {
      const img = env.decode(d.path);
      if (!img.isEmpty()) {
        await clipboard.write([new ClipboardItem({ 'image/png': new Blob([img.toPNG()], { type: 'image/png' }) })]);
        return 'image';
      }
    }
    // « text/uri-list » avec une adresse file: : Chromium y met le fichier lui-même, sur chaque système.
    await clipboard.write([new ClipboardItem({ 'text/uri-list': pathToFileURL(d.path).href })]);
    return 'file';
  } catch (err) {
    console.error('[orbe] copie du fichier', err.message);
    return false;
  }
}

// Retire un téléchargement de la liste (le fichier reste où il est).
function forget(d) {
  if (items.has(d.id)) return false;
  volatileRecords.delete(d);
  const i = store.state.downloads.indexOf(d);
  if (i >= 0) { store.state.downloads.splice(i, 1); store.save(); require('./backups').forget({ downloads: [d.id] }); }
  return true;
}

// « Placer dans la corbeille » : le fichier part à la corbeille du système, la ligne disparaît.
async function trash(d) {
  if (!d || items.has(d.id) || d.state === 'progressing') return false;
  if (d.path && fs.existsSync(d.path)) {
    try { await env.trash(d.path); } catch (err) { console.error('[orbe] corbeille', err.message); return false; }
  }
  return forget(d);
}

// Menu d'un téléchargement, comme dans Arc : Ouvrir, Copier, Afficher dans le Finder,
// Partager (macOS), Masquer de la liste, Placer dans la corbeille ; Pause, Reprendre, Annuler.
function menuTemplate(d, { parent = null } = {}) {
  const running = d.state === 'progressing';
  const exists = d.state === 'completed' && fs.existsSync(d.path);
  const stopped = d.state === 'interrupted' || d.state === 'cancelled';
  const live = items.has(d.id);
  const tpl = [
    { id: 'open', label: t('lib.open'), enabled: exists, click: () => openFile(d, null, { parent }) },
    { id: 'copy', label: t('edit.copy'), enabled: exists, click: () => copyFile(d, { parent }) },
    { id: 'reveal', label: t('lib.reveal'), enabled: exists, click: () => env.reveal(d.path) },
  ];
  // Feuille de partage du système (AirDrop, Messages, Mail…).
  // (Fichier resté sans marque : la question d'abord, puis la feuille de partage.)
  if (process.platform === 'darwin' && exists) {
    tpl.push(unmarked(d)
      ? { id: 'share', label: t('tb.share'), click: async () => { if (await cleared(d, parent)) env.share([d.path], parent); } }
      : { id: 'share', role: 'shareMenu', sharingItem: { filePaths: [d.path] } });
  }
  tpl.push({ type: 'separator' });
  if (running) {
    tpl.push(d.paused || d.stalled ? { id: 'resume', label: t('dl.resume'), click: () => resume(d) } : { id: 'pause', label: t('dl.pause'), enabled: live, click: () => action('dl:pause', d.id) });
    tpl.push({ id: 'cancel', label: t('dl.cancel'), click: () => cancel(d) });
  } else {
    if (stopped) tpl.push({ id: 'resume', label: t(d.state === 'interrupted' && d.canResume ? 'dl.resume' : 'dl.retry'), click: () => resume(d) });
    tpl.push({ id: 'hide', label: t('dl.hide'), click: () => forget(d) });
    tpl.push({ id: 'trash', label: t('dl.trash'), enabled: exists, click: () => trash(d) });
  }
  return tpl;
}

// Messages de la Bibliothèque et des réglages.
async function action(name, a, sender) {
  const parent = (sender && env.ownerWindow(sender)) || BaseWindow.getFocusedWindow();
  const d = findRecord(String(a));
  if (!d) return false;
  if (name === 'dl:pause') { const item = items.get(d.id); if (item && !item.isPaused()) { item.pause(); d.paused = true; } return !!item; }
  if (name === 'dl:resume') return resume(d);
  if (name === 'dl:cancel') return cancel(d);
  if (name === 'dl:open') return openFile(d, null, { parent });
  if (name === 'dl:remove') return forget(d);
  if (name === 'dl:trash') return trash(d);
  if (name === 'dl:copy') return copyFile(d, { parent });
  if (name === 'dl:menu') { await env.popup(menuTemplate(d, { parent }), parent); return true; }
  return undefined;
}

module.exports = { sample, eta, saveFrom, mark, markTree, rename, cleared, dragAllowed, unmarked, decodable, imageSize, imageSizeOf, findRecord, confirmQuit, quarantine, beforeQuit, attach, bindProfile, action, resume, cancel, openFile, copyFile, trash, forget, menuTemplate, downloadDir, isDangerous, isPdfFile, safeName, env, internals: { items, resuming, DANGEROUS, asked, extOf, track, accepted, volatileRecords } };
