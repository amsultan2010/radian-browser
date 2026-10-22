// Import depuis un navigateur installé : liste, aperçu (comptes), application,
// annulation. Sert le volet Import des réglages et la page d'accueil.
// La lecture des profils est dans import-browsers.js ; ici, on ne fait que
// porter ce qui a été lu dans l'état d'Orbe.
const crypto = require('crypto');
const { shell } = require('electron');
const { store } = require('./store');
const browsers = require('./import-browsers');
const bm = require('./import-bookmarks');
const win = require('./window');
const { OrbeWindow } = win;

const t = (k, v) => store.t(k, null, v);
const hooks = { refreshMenu: () => {}, openExternal: (url) => shell.openExternal(url), now: () => Date.now() };
const UNDO_TTL = 30 * 60e3;
// Aperçus en attente : ce qui a été montré est exactement ce qui sera importé.
const previews = new Map(); // jeton -> { data, at }
const PREVIEW_TTL = 15 * 60e3;
let last = null; // dernier import : { undo() -> redo }, tant qu'il peut être annulé

const mainWindow = () => OrbeWindow.all.find((w) => !w.incognito) || null;

function dests() {
  const s = store.state;
  const w = mainWindow();
  return {
    current: w ? 'space:' + w.spaceId : '',
    list: [
      ...s.profiles.map((p) => ({ id: 'new:' + p.id, kind: 'new', name: p.name })),
      ...s.spaces.map((sp) => ({ id: 'space:' + sp.id, kind: 'space', name: `${sp.icon} ${sp.name}`, empty: !sp.pinned.length })),
    ],
  };
}

function list() {
  return { browsers: browsers.detect(), dests: dests(), canUndo: !!last && !last.expired() };
}

async function preview(a) {
  browsers.configure({ labels: { menu: t('impb.rootMenu'), other: t('impb.rootOther'), mobile: t('impb.rootMobile') } });
  const data = await browsers.read(String((a && a.browser) || ''), String((a && a.profile) || ''));
  if (data.error) return { error: data.error };
  const now = Date.now();
  for (const [k, v] of previews) if (now - v.at > PREVIEW_TTL || previews.size > 8) previews.delete(k);
  const token = crypto.randomUUID();
  previews.set(token, { data, at: now });
  return { ok: true, token, name: data.name, bookmarks: data.bookmarks, folders: data.folders, dropped: data.dropped, truncated: data.truncated, max: bm.MAX_BOOKMARKS, source: data.source, date: data.date || '' };
}

function refresh() {
  store.save();
  for (const w of OrbeWindow.all) w.layout();
  OrbeWindow.pushAll();
  hooks.refreshMenu();
}

const tabIds = (nodes) => nodes.flatMap((n) => (n.type === 'folder' ? tabIds(n.children) : [n.id]));

// Retire les onglets importés (`ids`), où qu'ils aient été rangés depuis, ferme
// leurs pages, puis retire de l'Espace les dossiers importés restés vides. Ce
// que l'utilisateur a ajouté lui-même dans un dossier importé n'est pas touché.
// Rend de quoi tout remettre.
function removeImported(space, added, ids, folders) {
  const s = store.state;
  const before = JSON.parse(JSON.stringify(added));
  const tabs = {};
  for (const id of ids) {
    if (!s.tabs[id]) continue;
    tabs[id] = s.tabs[id];
    OrbeWindow.destroyView(id);
    OrbeWindow.forget(id, s);
    delete s.tabs[id];
  }
  const gone = new Set(Object.keys(tabs));
  // Un dossier importé resté vide part aussi ; un dossier de l'utilisateur, jamais.
  const prune = (nodes) => nodes.filter((n) => { if (n.type === 'folder') { n.children = prune(n.children); return n.children.length > 0 || !folders.has(n.id); } return !gone.has(n.id); });
  for (const sp of s.spaces) {
    sp.pinned = prune(sp.pinned);
    sp.today = sp.today.filter((id) => !gone.has(id));
    sp.splits = (sp.splits || []).map((g) => Object.assign(g.filter((id) => !gone.has(id)), g.ratios ? { ratios: g.ratios } : {})).filter((g) => g.length > 1);
  }
  for (const k of Object.keys(s.favs)) s.favs[k] = s.favs[k].filter((id) => !gone.has(id));
  const removed = added.filter((n) => n.type === 'folder' && !space.pinned.includes(n));
  return () => {
    const back = before.filter((n, i) => n.type !== 'folder' || removed.includes(added[i]));
    const need = new Set(tabIds(back));
    for (const [id, tab] of Object.entries(tabs)) if (need.has(id)) s.tabs[id] = tab;
    space.pinned.push(...back);
  };
}

function apply(a) {
  const p = previews.get(String((a && a.token) || ''));
  if (!p) return { error: 'expired' };
  const s = store.state;
  const dest = String((a && a.dest) || '');
  const data = p.data;
  const w = mainWindow();
  let space = null;
  let added = null;
  const fresh = !dest.startsWith('space:');
  if (!fresh) {
    space = s.spaces.find((sp) => sp.id === dest.slice(6));
    if (!space) return { error: 'dest' };
    added = bm.mergeInto(data, space, { name: data.name });
    if (!added) return { error: 'empty' };
  } else {
    const profileId = dest.startsWith('new:') ? dest.slice(4) : 'default';
    if (!s.profiles.some((x) => x.id === profileId)) return { error: 'dest' };
    space = bm.merge(data, { name: data.name, profileId });
    if (!space) return { error: 'empty' };
    added = space.pinned.slice();
  }
  // Ce que l'import a créé, et rien d'autre : c'est tout ce qu'une annulation retirera.
  const ids = tabIds(added);
  const folderIds = (nodes) => nodes.flatMap((n) => (n.type === 'folder' ? [n.id, ...folderIds(n.children)] : []));
  const folders = new Set(folderIds(added));
  const undo = () => {
    if (!s.spaces.includes(space)) return null;
    const back = removeImported(space, added, ids, folders);
    // Espace créé par l'import : il ne part que s'il ne contient plus rien. Un onglet
    // ouvert ou épinglé depuis par l'utilisateur le fait rester, avec cet onglet.
    let backSpace = null;
    const win0 = mainWindow();
    if (fresh && !space.pinned.length && !space.today.length && win0) backSpace = win0.removeSpace(space.id);
    refresh();
    return () => {
      if (backSpace) backSpace();
      if (s.spaces.includes(space)) back();
      refresh();
    };
  };
  previews.delete(a.token);
  refresh();
  // `stay` (accueil) : on reste sur la page d'où l'import a été lancé.
  if (w && space.id !== w.spaceId && fresh && !(a && a.stay)) w.switchSpace(space.id);
  // Annulable depuis l'interface d'import et par Édition → Annuler, pendant une
  // demi-heure et tant qu'aucun autre import n'a suivi : au-delà, ce que l'on
  // retirerait ne ressemble plus à ce qui a été importé.
  const entry = { id: crypto.randomUUID(), at: hooks.now(), redo: null, done: true };
  entry.expired = () => hooks.now() - entry.at > UNDO_TTL;
  entry.undo = () => { if (!entry.done || entry.expired()) return false; entry.redo = undo(); entry.done = false; if (last === entry) last = null; return true; };
  last = entry;
  if (w) w.record('undo.import', () => entry.undo(), () => { if (!entry.done && entry.redo) { entry.redo(); entry.done = true; } }, (way) => (way === 'undo' ? !entry.done || entry.expired() : entry.done || !entry.redo));
  if (w) w.toast(t('bm.done', { n: data.bookmarks }));
  return { ok: true, space: space.id, spaceName: `${space.icon} ${space.name}`, bookmarks: data.bookmarks, folders: data.folders, canUndo: true, undoId: entry.id };
}

// Annule le dernier import — celui que désigne `id`, quand l'interface en donne un :
// le bouton d'une ligne ne doit pas annuler l'import d'un autre navigateur fait depuis.
function undoLast(id) {
  if (last && last.expired()) last = null;
  if (!last || (id && last.id !== id)) return { ok: false, expired: true };
  const ok = last.undo();
  return { ok };
}

// Réglages du système → Confidentialité → Accès complet au disque (pour Safari).
function openDiskAccess() {
  hooks.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles');
  return true;
}

async function action(name, a) {
  switch (name) {
    case 'import:list': return list();
    case 'import:preview': return preview(a);
    case 'import:apply': return apply(a);
    case 'import:undo': return undoLast(a && typeof a === 'object' ? String(a.id || '') : '');
    case 'import:diskAccess': return openDiskAccess();
    default: return undefined;
  }
}

module.exports = { action, list, preview, apply, undoLast, hooks, get last() { return last; } };
