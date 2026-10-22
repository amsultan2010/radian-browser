// Bibliothèque : ce que la page interne `library.html` demande au processus
// principal. Historique, archive (recherche, filtres, restauration, suppression),
// téléchargements et médias, Espaces, Boosts.
// Chaque message vient d'une page de l'interface, mais ce qu'il porte est
// vérifié ici : identifiants recherchés dans les données, jamais de chemin ni
// d'adresse pris tels quels.
const { app, shell, nativeImage } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { store, uid } = require('./store');
const downloads = require('./downloads');

const SECTIONS = ['history', 'archive', 'downloads', 'media', 'easels', 'spaces', 'boosts'];
const HOW = ['manual', 'auto', 'little']; // façon dont un onglet a rejoint l'archive
const MEDIA = /\.(png|jpe?g|gif|webp|avif|svg|mp4|mov|webm|mp3|wav|m4a)$/i;

// `window(sender)` : fenêtre Orbe de la page qui demande ; `startDrag` : remplacé pendant les tests.
const env = {
  window: () => null,
  startDrag: (wc, item) => wc.startDrag(item),
  clearArchive: (w) => require('./commands').clearArchive(w),
  // Relecture d'un Boost importé avant sa première activation : posé par main.js.
  reviewBoost: () => {},
  // Menu natif (clic droit sur l'icône de la Bibliothèque) ; remplacé pendant les tests.
  popup: (w, tpl) => { if (w) w.popup(tpl); },
  // Dossier où Orbe enregistre ses captures ; remplacé pendant les tests.
  captureDir: () => app.getPath('downloads'),
  // Dossier de l'utilisateur à parcourir pour ses médias ('downloads', 'desktop', 'documents') ;
  // remplacé pendant les tests, qui ne lisent jamais les vrais dossiers.
  mediaDir: (from) => app.getPath(from),
};

const t = (key, vars) => store.t(key, null, vars);

// --- Archive -------------------------------------------------------------------
// Les entrées d'avant cette version n'ont pas d'identifiant : elles en reçoivent un à la lecture.
function archive() {
  const list = store.state.archive;
  for (const a of list) if (!a.id) a.id = uid();
  return list;
}

function archiveRows({ q, how, space }) {
  const spaces = new Map(store.state.spaces.map((s) => [s.id, s]));
  const match = (a) => !q || (a.title || '').toLowerCase().includes(q) || (a.url || '').toLowerCase().includes(q);
  const rows = [];
  for (const a of archive()) {
    if (how && (a.by || 'manual') !== how) continue;
    if (space && a.spaceId !== space) continue;
    if (!match(a)) continue;
    const sp = spaces.get(a.spaceId);
    rows.push({ id: a.id, url: a.url, title: a.title, favicon: a.favicon || '', at: a.at, by: a.by || 'manual', space: sp ? `${sp.icon} ${sp.name}` : '' });
    if (rows.length >= 400) break;
  }
  return rows;
}

// Rouvre un onglet archivé dans son Espace d'origine (s'il existe encore) ; l'entrée quitte l'archive.
function restore(w, id) {
  const list = archive();
  const i = list.findIndex((a) => a.id === id);
  if (i < 0 || !w || w.incognito) return false;
  const a = list[i];
  if (!/^https?:/i.test(a.url || '')) return false;
  const space = w.data.spaces.find((s) => s.id === a.spaceId) || w.space;
  list.splice(i, 1);
  const tab = w.createTab(a.url, { space });
  if (a.title && a.title !== a.url) tab.title = a.title;
  if (a.favicon) tab.favicon = a.favicon;
  w.activate(tab.id);
  store.save();
  return { tabId: tab.id, spaceId: space.id };
}

function removeArchived(id) {
  const list = archive();
  const i = list.findIndex((a) => a.id === id);
  if (i < 0) return false;
  const [gone] = list.splice(i, 1);
  store.save();
  // Supprimée ici, supprimée aussi des sauvegardes de l'état.
  require('./backups').forget({ archiveIds: [gone.id], archiveUrls: gone.url ? [gone.url] : [] });
  return true;
}

// --- Téléchargements et médias ---------------------------------------------------
const icons = new Map(); // chemin -> icône du fichier (pour le glisser hors d'Orbe)
let fallbackIcon = null;

// L'icône d'un fichier se demande au système, sans attendre : elle doit être prête
// au moment où l'utilisateur commence à glisser.
// Jamais pour un fichier exécutable ou resté sans marque « venu d'Internet » : le
// système lirait le fichier lui-même (icône d'un .exe, cible d'un raccourci).
function warmIcon(file, d) {
  if (d && (d.danger || downloads.isDangerous(file) || downloads.unmarked(d))) return;
  if (icons.has(file)) return;
  icons.set(file, null);
  if (icons.size > 400) icons.delete(icons.keys().next().value);
  app.getFileIcon(file, { size: 'normal' }).then((img) => { if (img && !img.isEmpty()) icons.set(file, img); }).catch(() => {});
}

function dragIcon(file) {
  const known = icons.get(file);
  if (known) return known;
  if (!fallbackIcon) {
    const img = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'icon.png'));
    fallbackIcon = img.isEmpty() ? img : img.resize({ width: 48, height: 48 });
  }
  return fallbackIcon;
}

function fileRows(list, q, media) {
  const match = (d) => !q || (d.name || '').toLowerCase().includes(q) || (d.url || '').toLowerCase().includes(q);
  const rows = [];
  for (const d of list) {
    if (media && !(d.state === 'completed' && MEDIA.test(d.name || ''))) continue;
    if (!match(d)) continue;
    const exists = d.state === 'completed' && fs.existsSync(d.path);
    if (media && !exists) continue;
    if (exists) warmIcon(d.path, d);
    rows.push({ ...d, exists });
    if (rows.length >= 200) break;
  }
  return rows;
}

// Glisser un fichier hors de la Bibliothèque : vers le Finder, un courriel, une autre application.
function drag(sender, id) {
  const d = store.state.downloads.find((x) => x.id === id);
  if (!d || d.state !== 'completed' || !sender || sender.isDestroyed() || !fs.existsSync(d.path)) return false;
  // Fichier resté sans marque « venu d'Internet » : glissé tel quel, le système l'ouvrirait
  // sans rien demander. La question est posée ; le geste suivant passera s'il est accepté.
  if (!downloads.dragAllowed(d)) { downloads.cleared(d, null).catch(() => {}); return false; }
  const icon = dragIcon(d.path);
  if (!icon || icon.isEmpty()) return false;
  env.startDrag(sender, { file: d.path, icon });
  return true;
}

// --- Médias des dossiers de l'utilisateur (« Afficher les médias de : ») ----------------
// Bureau, Documents, Téléchargements : macOS demande l'accord de l'utilisateur à la
// première lecture de chacun. Un dossier n'est donc lu que lorsqu'il vient d'être choisi
// dans la Bibliothèque — jamais au démarrage, jamais de lui-même, et le choix n'est pas
// retenu. Seul le premier niveau est lu : fichiers ordinaires (ni liens, ni fichiers
// cachés) dont l'extension est celle d'un média. Aucun fichier n'est ouvert ni décodé.
// La page reçoit un identifiant et un nom (posé comme du texte), jamais un chemin.
const FROM = ['orbe', 'downloads', 'desktop', 'documents'];
const FOLDER_MAX = 200;
const folderFiles = new Map(); // identifiant -> { file, dir }
const folderId = (file) => 'f:' + crypto.createHash('sha256').update(file).digest('hex').slice(0, 20);

async function folderRows(from, q) {
  if (!FROM.includes(from) || from === 'orbe') return [];
  let dir = '';
  let entries = [];
  try {
    dir = env.mediaDir(from);
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch { return []; }
  const found = [];
  // Un fichier téléchargé par Orbe que le système n'a pas pu marquer garde sa confirmation :
  // il ne reparaît pas ici, où il s'ouvrirait sans elle.
  const unmarked = new Set(store.state.downloads.filter((d) => d && d.marked === false && d.path).map((d) => d.path));
  for (const e of entries) {
    if (!e.isFile() || e.name.startsWith('.') || !MEDIA.test(e.name)) continue;
    if (unmarked.has(path.join(dir, e.name))) continue;
    if (q && !e.name.toLowerCase().includes(q)) continue;
    const file = path.join(dir, e.name);
    try {
      const st = await fs.promises.lstat(file);
      if (st.isFile()) found.push({ file, name: e.name, at: st.mtimeMs, size: st.size });
    } catch {}
    if (found.length >= 5000) break;
  }
  found.sort((a, b) => b.at - a.at);
  return found.slice(0, FOLDER_MAX).map((f) => {
    const id = folderId(f.file);
    folderFiles.delete(id);
    folderFiles.set(id, { file: f.file, dir });
    if (folderFiles.size > 4000) folderFiles.delete(folderFiles.keys().next().value);
    warmIcon(f.file);
    return { id, name: f.name.slice(0, 200), state: 'completed', exists: true, total: f.size, received: f.size, at: Math.round(f.at), url: '', folder: from };
  });
}

// Fichier d'un dossier parcouru, d'après son identifiant : toujours un fichier ordinaire,
// toujours directement dans ce dossier (il a pu être remplacé depuis par un lien).
function folderFile(id) {
  const known = typeof id === 'string' ? folderFiles.get(id) : null;
  if (!known) return null;
  try {
    if (path.dirname(known.file) !== known.dir || !MEDIA.test(known.file) || !fs.lstatSync(known.file).isFile()) return null;
    if (store.state.downloads.some((d) => d && d.marked === false && d.path === known.file)) return null;
  } catch { return null; }
  return known.file;
}

// --- Fichiers récents (survol de l'icône de la Bibliothèque) -----------------------
// Trois sortes, au choix de l'utilisateur (clic droit sur l'icône) : captures d'Orbe,
// médias téléchargés (images, vidéos, sons), autres téléchargements.
const PEEK_KINDS = ['captures', 'downloads', 'media'];
const PEEK_MAX = 5;
const kindOf = (d) => (d.capture ? 'captures' : (MEDIA.test(d.name || '') ? 'media' : 'downloads'));

function peekKinds() {
  const v = store.state.settings.libraryPeek;
  return Array.isArray(v) ? PEEK_KINDS.filter((k) => v.includes(k)) : [...PEEK_KINDS];
}

// Les derniers fichiers encore présents sur le disque, du plus récent au plus ancien.
// Ce qui part vers la barre latérale : un identifiant, un nom, une sorte, une date —
// jamais de chemin. Le nom vient d'un site : la barre le pose comme du texte.
function recent() {
  const kinds = peekKinds();
  const rows = [];
  for (const d of store.state.downloads) {
    if (d.state !== 'completed' || !kinds.includes(kindOf(d))) continue;
    if (!d.path || !fs.existsSync(d.path)) continue;
    warmIcon(d.path, d);
    rows.push({ id: d.id, name: String(d.name || '').slice(0, 200), kind: kindOf(d), at: d.at || 0, danger: !!d.danger });
    if (rows.length >= PEEK_MAX) break;
  }
  return rows;
}

// Clic droit sur l'icône : ce que le survol montre.
function peekMenuTemplate() {
  const kinds = peekKinds();
  const toggle = (k) => {
    const now = peekKinds();
    const next = now.includes(k) ? now.filter((x) => x !== k) : PEEK_KINDS.filter((x) => x === k || now.includes(x));
    store.state.settings.libraryPeek = next;
    store.save();
  };
  return [
    { label: t('peek.show'), enabled: false },
    ...PEEK_KINDS.map((k) => ({ label: t('peek.kind.' + k), type: 'checkbox', checked: kinds.includes(k), click: () => toggle(k) })),
  ];
}

// Une capture enregistrée par Orbe rejoint la Bibliothèque (pas en navigation privée).
// `done(fiche)` : appelé une fois le fichier écrit (essais).
function keepCapture(name, png, { incognito = false, done = null } = {}) {
  const file = path.join(env.captureDir(), name);
  fs.writeFile(file, png, (err) => {
    let d = null;
    if (!err && !incognito) {
      d = { id: uid(), name, path: file, url: '', total: png.length, received: png.length, state: 'completed', at: Date.now(), mime: 'image/png', capture: true };
      store.addDownload(d);
    }
    if (done) done(d);
  });
  return file;
}

// --- Espaces, Boosts --------------------------------------------------------------
const count = (nodes) => nodes.reduce((n, x) => n + (x.type === 'folder' ? count(x.children) : 1), 0);

function spaceRows(w, q) {
  const profiles = new Map(store.state.profiles.map((p) => [p.id, p.name]));
  return store.state.spaces
    .filter((s) => !q || s.name.toLowerCase().includes(q))
    .map((s) => ({ id: s.id, name: s.name, icon: s.icon, color: s.color, profile: profiles.get(s.profileId) || '', pinned: count(s.pinned), today: s.today.length, current: !!w && w.spaceId === s.id, only: store.state.spaces.length < 2 }));
}

function boostRows(q) {
  return Object.entries(store.state.boosts)
    .filter(([host]) => !q || host.toLowerCase().includes(q))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([host, b]) => ({ host, review: b.review === true, enabled: b.enabled !== false, zaps: (b.zaps || []).length, css: (b.css || '').trim().length }));
}

// Après un changement de Boost : les onglets ordinaires de ce site le reprennent
// (même chemin que partout ailleurs : ni navigation privée, ni page interne).
function reapplyBoost(host) {
  return require('./window').applyBoosts(host);
}

// --- Messages ----------------------------------------------------------------------
// Les dossiers de l'utilisateur (Bureau, Documents, Téléchargements) ne sont lus, et leurs
// fichiers ouverts ou glissés, qu'à la demande de la page Bibliothèque elle-même.
const fromLibrary = (sender) => { try { return !!sender && !sender.isDestroyed() && sender.getURL().startsWith('orbe://app/library.html'); } catch { return false; } };

async function action(name, a, sender) {
  const s = store.state;
  const w = env.window(sender);
  switch (name) {
    case 'lib:get': {
      const o = a && typeof a === 'object' ? a : {};
      const q = String(o.q || '').toLowerCase().slice(0, 200);
      const match = (x) => !q || (x.title || '').toLowerCase().includes(q) || (x.url || '').toLowerCase().includes(q);
      return {
        history: Object.values(s.history).filter(match).sort((x, y) => y.last - x.last).slice(0, 400)
          .map((h) => ({ url: h.url, title: h.title || h.url, favicon: h.favicon || '', at: h.last })),
        archive: archiveRows({ q, how: HOW.includes(o.how) ? o.how : '', space: typeof o.space === 'string' ? o.space : '' }),
        downloads: fileRows(s.downloads, q, false),
        // Médias : images, vidéos et sons téléchargés, plus les captures d'Orbe.
        // (`from` : un dossier de l'utilisateur, lu parce qu'il vient d'être choisi.)
        media: FROM.includes(o.from) && o.from !== 'orbe' && fromLibrary(sender) ? await folderRows(o.from, q) : fileRows(s.downloads, q, true),
        spaces: spaceRows(w, q),
        boosts: boostRows(q),
        // Pour les filtres de l'archive.
        spaceNames: s.spaces.map((sp) => ({ id: sp.id, name: `${sp.icon} ${sp.name}` })),
        archiveTotal: s.archive.length,
      };
    }
    // Dernière section affichée : la Bibliothèque s'y rouvre (⇧⌘L).
    case 'lib:section':
      if (SECTIONS.includes(a) && s.window.librarySection !== a) { s.window.librarySection = a; store.save(true); }
      return true;
    case 'lib:clear':
      if (a === 'history') { s.history = {}; store.historyCount = 0; store.saveHistory(true); require('./backups').forget({ historyAll: true }); }
      // Vider l'archive ne se rattrape pas : la question est posée d'abord.
      if (a === 'archive') return env.clearArchive(w);
      if (a === 'downloads') {
        const gone = s.downloads.filter((d) => d.state !== 'progressing').map((d) => d.id);
        s.downloads = s.downloads.filter((d) => d.state === 'progressing');
        if (gone.length) require('./backups').forget({ downloads: gone });
      }
      store.save();
      return true;
    case 'lib:restore':
      return restore(w, String(a));
    case 'lib:archiveDelete':
      return removeArchived(String(a));
    case 'lib:reveal': {
      if (typeof a === 'string' && a.startsWith('f:')) { const file = folderFile(a); if (file) downloads.env.reveal(file); return !!file; }
      const d = s.downloads.find((x) => x.id === a);
      if (d) shell.showItemInFolder(d.path);
      return true;
    }
    // Un PDF s'ouvre dans un onglet ; un fichier exécutable demande confirmation.
    case 'lib:openFile':
      if (typeof a === 'string' && a.startsWith('f:')) { const file = fromLibrary(sender) ? folderFile(a) : null; if (file) downloads.env.openPath(file); return !!file; }
      return downloads.action('dl:open', a, sender);
    case 'lib:drag': {
      const file = typeof a === 'string' && a.startsWith('f:') && fromLibrary(sender) ? folderFile(a) : null;
      if (file && sender && !sender.isDestroyed()) {
        const icon = dragIcon(file);
        if (!icon || icon.isEmpty()) return false;
        env.startDrag(sender, { file, icon });
        return true;
      }
      return drag(sender, String(a));
    }
    case 'lib:recent':
      return recent();
    case 'lib:peekMenu':
      if (!w) return false;
      env.popup(w, [...peekMenuTemplate(), { type: 'separator' }, { label: t('peek.open'), click: () => w.run('library') }]);
      return true;
    case 'lib:space': {
      const o = a && typeof a === 'object' ? a : {};
      const sp = s.spaces.find((x) => x.id === o.id);
      if (!w || !sp) return false;
      if (o.do === 'focus') { w.switchSpace(sp.id); return true; }
      if (o.do === 'rename') { w.switchSpace(sp.id); w.askRename(sp.id); return true; }
      if (o.do === 'theme') { w.switchSpace(sp.id); w.openTheme(); return true; }
      if (o.do === 'delete') { await w.deleteSpace(sp.id); return true; }
      return false;
    }
    case 'lib:newSpace':
      if (w) w.askNewSpace();
      return !!w;
    case 'lib:boost': {
      const o = a && typeof a === 'object' ? a : {};
      const host = String(o.host || '');
      if (!Object.hasOwn(s.boosts, host)) return false;
      if (o.do === 'toggle') {
        const boosts = require('./boosts');
        const b = boosts.get(host);
        // Boost importé, pas encore relu : son contenu est d'abord montré (éditeur de Boost).
        if (b.review && !b.enabled) { env.reviewBoost(w, host); return { review: true }; }
        boosts.set(host, { enabled: !b.enabled });
      }
      else if (o.do === 'delete') delete s.boosts[host];
      else if (o.do === 'open') return w ? !!w.newTab('https://' + host) : false;
      else return false;
      store.save();
      reapplyBoost(host);
      return true;
    }
    default:
      return undefined;
  }
}

module.exports = { action, env, SECTIONS, HOW, MEDIA, FROM, PEEK_KINDS, archive, restore, removeArchived, drag, recent, keepCapture, peekMenuTemplate, internals: { icons, dragIcon, warmIcon } };
