// Barre de commande : ce qui s'ajoute aux suggestions de base (suggest.js).
//  - la liste des actions proposées : celles de la table des commandes, plus
//    celles qui dépendent de la fenêtre (aller à un Espace, y déplacer l'onglet,
//    ouvrir un dossier, déclencher une extension) ;
//  - la recherche dans un site (« youtube », ⇥ ou espace, puis la requête) ;
//  - la suppression d'une suggestion (historique ou archive) ;
//  - le clic qui traverse le fond vers la barre latérale.
// Tout ce qui revient de la vue (identifiant d'Espace, de dossier, d'extension,
// adresse à oublier) est vérifié ici avant d'agir.
const { store } = require('./store');

const t = (key, vars) => store.t(key, null, vars);

// --- Recherche dans un site ----------------------------------------------------
// `keys` : ce que l'on tape avant ⇥ ou espace (nom, domaine, abréviation).
const SITES = [
  { id: 'youtube', name: 'YouTube', keys: ['youtube', 'youtube.com', 'yt'], url: 'https://www.youtube.com/results?search_query=%s' },
  { id: 'wikipedia', name: 'Wikipédia', keys: ['wikipedia', 'wikipedia.org', 'wiki'], url: 'https://{lang}.wikipedia.org/w/index.php?search=%s' },
  { id: 'github', name: 'GitHub', keys: ['github', 'github.com', 'gh'], url: 'https://github.com/search?q=%s' },
  { id: 'google', name: 'Google', keys: ['google', 'google.com'], url: 'https://www.google.com/search?q=%s' },
  { id: 'duckduckgo', name: 'DuckDuckGo', keys: ['duckduckgo', 'duckduckgo.com', 'ddg'], url: 'https://duckduckgo.com/?q=%s' },
  { id: 'bing', name: 'Bing', keys: ['bing', 'bing.com'], url: 'https://www.bing.com/search?q=%s' },
  { id: 'maps', name: 'Google Maps', keys: ['maps', 'maps.google.com'], url: 'https://www.google.com/maps/search/%s' },
  { id: 'amazon', name: 'Amazon', keys: ['amazon', 'amazon.fr', 'amazon.com'], url: 'https://www.amazon.{tld}/s?k=%s' },
  { id: 'reddit', name: 'Reddit', keys: ['reddit', 'reddit.com'], url: 'https://www.reddit.com/search/?q=%s' },
  { id: 'x', name: 'X', keys: ['twitter', 'twitter.com', 'x.com'], url: 'https://x.com/search?q=%s' },
  { id: 'stackoverflow', name: 'Stack Overflow', keys: ['stackoverflow', 'stackoverflow.com', 'so'], url: 'https://stackoverflow.com/search?q=%s' },
  { id: 'mdn', name: 'MDN', keys: ['mdn', 'developer.mozilla.org'], url: 'https://developer.mozilla.org/search?q=%s' },
  { id: 'npm', name: 'npm', keys: ['npm', 'npmjs.com'], url: 'https://www.npmjs.com/search?q=%s' },
  { id: 'imdb', name: 'IMDb', keys: ['imdb', 'imdb.com'], url: 'https://www.imdb.com/find/?q=%s' },
  { id: 'spotify', name: 'Spotify', keys: ['spotify', 'open.spotify.com'], url: 'https://open.spotify.com/search/%s' },
  { id: 'ebay', name: 'eBay', keys: ['ebay', 'ebay.fr', 'ebay.com'], url: 'https://www.ebay.{tld}/sch/i.html?_nkw=%s' },
  { id: 'linkedin', name: 'LinkedIn', keys: ['linkedin', 'linkedin.com'], url: 'https://www.linkedin.com/search/results/all/?keywords=%s' },
  { id: 'twitch', name: 'Twitch', keys: ['twitch', 'twitch.tv'], url: 'https://www.twitch.tv/search?term=%s' },
  { id: 'leboncoin', name: 'leboncoin', keys: ['leboncoin', 'leboncoin.fr', 'lbc'], url: 'https://www.leboncoin.fr/recherche?text=%s' },
];
const SITE_BY_ID = new Map(SITES.map((s) => [s.id, s]));
const SITE_BY_KEY = new Map(SITES.flatMap((s) => s.keys.map((k) => [k, s])));

// Site désigné par la saisie entière (« yt », « youtube.com »), ou null.
const siteFor = (text) => SITE_BY_KEY.get(String(text || '').trim().toLowerCase()) || null;

function siteUrl(site, q) {
  const fr = store.state.settings.lang === 'fr';
  return site.url.replace('{lang}', fr ? 'fr' : 'en').replace('{tld}', fr ? 'fr' : 'com').replace('%s', encodeURIComponent(q));
}

// Ce que la vue doit savoir pour entrer dans la recherche d'un site sans attendre : clé tapée -> [identifiant, nom].
const siteKeys = () => Object.fromEntries(SITES.flatMap((s) => s.keys.map((k) => [k, [s.id, s.name]])));

// Ligne « Rechercher sur YouTube — ⇥ » quand la saisie désigne un site.
function siteHint(q) {
  const site = siteFor(q);
  return site ? { kind: 'site', site: site.id, name: site.name, title: t('cmd.searchSite', { site: site.name }), subtitle: t('cmd.siteHint') } : null;
}

// Suggestions pendant la recherche dans un site : la requête, rien d'autre.
function siteItems(id, q) {
  const site = SITE_BY_ID.get(String(id));
  const text = String(q || '').trim();
  if (!site || !text) return [];
  return [{ kind: 'search', url: siteUrl(site, text), title: text, subtitle: t('cmd.searchSite', { site: site.name }) }];
}

// --- Actions ---------------------------------------------------------------------
let fixed = null; // { lang, keys, list } : actions de la table, dans la langue et avec les raccourcis du moment

function fixedList() {
  const { COMMANDS } = require('./commands');
  const s = store.state.settings;
  if (fixed && fixed.lang === s.lang && fixed.keys === s.shortcuts) return fixed.list;
  const shortcuts = require('./shortcuts');
  fixed = {
    lang: s.lang,
    keys: s.shortcuts,
    list: COMMANDS.filter((c) => c.palette !== false && !c.paletteLabel).map((c) => ({ command: c.name, title: t(c.label), shortcut: shortcuts.keysOf(c.name) })),
  };
  return fixed.list;
}

function folders(nodes, out = []) {
  for (const n of nodes) if (n.type === 'folder') { out.push(n); folders(n.children, out); }
  return out;
}

function extensionActions(w) {
  try { return require('./ext-host').actionsFor(w) || []; } catch { return []; }
}

const dynamic = new WeakMap(); // fenêtre -> { sig, list }

// Actions propres à la fenêtre. Refaites seulement quand ce qu'elles nomment a changé.
function dynamicList(w) {
  const { COMMANDS } = require('./commands');
  const d = w.data;
  const tab = w.activeId ? d.tabs[w.activeId] : null;
  const loc = tab ? w.locate(w.activeId) : null;
  const dirs = folders(w.space.pinned);
  const exts = w.incognito ? [] : extensionActions(w);
  const shortcuts = require('./shortcuts');
  // Le raccourci affiché fait partie de la ligne : changé dans les Réglages, la liste est refaite.
  const labelled = COMMANDS.filter((c) => c.palette !== false && c.paletteLabel).map((c) => [c, c.paletteLabel(w), shortcuts.keysOf(c.name)]);
  const sig = [
    store.state.settings.lang, w.spaceId, loc ? loc.list : '', d.spaces.map((s) => s.id + s.icon + s.name).join('\n'),
    dirs.map((f) => f.id + f.name).join('\n'), exts.map((x) => x.id + (x.title || x.name) + x.enabled).join('\n'), labelled.map((x) => x[1] + '\t' + x[2]).join('\n'),
  ].join('\u0001');
  const had = dynamic.get(w);
  if (had && had.sig === sig) return had.list;
  const list = [];
  for (const [c, key, keys] of labelled) if (key) list.push({ command: c.name, title: t(key), shortcut: keys });
  for (const s of d.spaces) {
    const name = `${s.icon} ${s.name}`;
    if (s.id !== w.spaceId) list.push({ command: 'focusSpace', arg: s.id, title: t('cmd.focusSpace', { space: name }), sub: t('cmd.space') });
    if (loc && !(s.id === w.spaceId && loc.list === 'today')) list.push({ command: 'moveTabToday', arg: s.id, title: t('cmd.moveToday', { space: name }) });
    if (loc && !(s.id === w.spaceId && loc.list === 'pinned')) list.push({ command: 'moveTabPinned', arg: s.id, title: t('cmd.movePinned', { space: name }) });
  }
  for (const f of dirs) list.push({ command: 'openFolder', arg: f.id, title: f.name, sub: t('cmd.folder') });
  for (const x of exts) if (x.enabled !== false) list.push({ command: 'extensionAction', arg: x.id, title: x.title || x.name || x.id, sub: t('cmd.extension') });
  dynamic.set(w, { sig, list });
  return list;
}

// Toutes les actions que la barre peut proposer dans cette fenêtre.
function commandList(w) {
  const own = dynamicList(w);
  if (!own.length) return fixedList();
  let all = own.all;
  if (!all || own.from !== fixedList()) { all = fixedList().concat(own); own.all = all; own.from = fixedList(); }
  return all;
}

// Barre ouverte sans aucun onglet : de quoi démarrer (aide, réglages, import).
const STARTERS = ['welcome', 'shortcuts', 'helpCenter', 'reportIssue', 'whatsNew', 'settings'];
function starters(w) {
  const by = new Map(commandList(w).map((c) => [c.command, c]));
  return STARTERS.map((n) => by.get(n)).filter(Boolean).map((c) => ({ kind: 'command', command: c.command, title: c.title, subtitle: c.shortcut || t('cmd.action') }));
}

// --- Actions à paramètre ---------------------------------------------------------
const spaceOf = (w, id) => w.data.spaces.find((s) => s.id === id) || null;

function focusSpace(w, id) {
  const s = spaceOf(w, String(id));
  if (s) w.switchSpace(s.id);
  return !!s;
}

// « Déplacer vers Aujourd'hui / les épinglés de <Espace> » : l'onglet actif.
function moveTab(w, spaceId, list) {
  const target = spaceOf(w, String(spaceId));
  const id = w.activeId;
  if (!target || !id || (list !== 'today' && list !== 'pinned')) return false;
  const before = w.places([id]);
  w.mute(() => {
    let loc = w.locate(id);
    if (loc.list === 'favorites') w.toggleFavorite(id); // un favori redevient d'abord un onglet du jour
    loc = w.locate(id);
    if (loc.space !== target) w.moveToSpace(id, target.id);
    loc = w.locate(id);
    if (loc && loc.list !== list) w.togglePin(id);
  });
  const loc = w.locate(id);
  if (!loc || loc.space !== target || loc.list !== list) return false;
  w.recordPlaces(target.id === w.spaceId ? 'undo.move' : 'undo.moveToSpace', before);
  w.changed();
  return true;
}

// Taper le nom d'un dossier : il s'ouvre (ses parents aussi) et se montre dans la barre latérale.
function openFolder(w, id) {
  const open = (nodes) => nodes.some((n) => n.type === 'folder' && (n.id === id || open(n.children)) && (n.open = true));
  if (!open(w.space.pinned)) return false;
  if (w.space.pinnedCollapsed) w.space.pinnedCollapsed = false;
  if (!w.sidebarVisible && !w.peek) w.toggleSidebar(true);
  w.reveal = { id, n: ((w.reveal && w.reveal.n) || 0) + 1 };
  w.changed();
  return true;
}

function extensionAction(w, id) {
  if (!extensionActions(w).some((x) => x.id === id && x.enabled !== false)) return false;
  return !!require('./ext-host').openPopup(w, String(id));
}

// « Couper le son de tous les onglets » et son contraire : tous les Espaces de la fenêtre.
function muteAll(w, muted) {
  const { live } = require('./window');
  let n = 0;
  for (const [id, tab] of Object.entries(w.data.tabs)) {
    if (!!tab.muted === muted) continue;
    if (muted) tab.muted = true; else delete tab.muted;
    const rt = live.get(id);
    if (rt && !rt.wc.isDestroyed()) rt.wc.setAudioMuted(muted);
    n += 1;
  }
  if (n) w.changed();
  return n;
}

// --- Suppression d'une suggestion --------------------------------------------------
// Seules une page de l'historique ou une entrée de l'archive s'oublient ainsi.
function forget(item) {
  const url = item && typeof item.url === 'string' ? item.url : '';
  if (!url || !item.deletable) return false;
  const s = store.state;
  let done = false;
  if (Object.hasOwn(s.history, url)) {
    delete s.history[url];
    if (store.historyCount != null) store.historyCount -= 1;
    store.saveHistory(); // change aussi `historyRev` : la recherche incrémentale repart d'une liste juste
    done = true;
  }
  const kept = s.archive.filter((a) => a.url !== url);
  if (kept.length !== s.archive.length) { s.archive = kept; store.save(); done = true; }
  // Oubliée ici, oubliée aussi dans les sauvegardes de l'état et la copie de secours de l'historique.
  if (done) require('./backups').forget({ archiveUrls: [url], historyUrls: [url] });
  return done;
}

// --- Clic sur le fond ----------------------------------------------------------
// La barre latérale reste cliquable quand la barre de commande est ouverte : un
// clic tombé sur elle referme la barre, puis lui est rendu.
function clickThrough(w, pt) {
  const x = Math.round(Number(pt && pt.x));
  const y = Math.round(Number(pt && pt.y));
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return false;
  if (!w.sidebarVisible || x >= w.sidebarWidth || w.ui.webContents.isDestroyed()) return false;
  const wc = w.ui.webContents;
  wc.sendInputEvent({ type: 'mouseMove', x, y });
  wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
  wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  return true;
}

module.exports = { SITES, siteFor, siteUrl, siteKeys, siteHint, siteItems, commandList, starters, focusSpace, moveTab, openFolder, extensionAction, muteAll, forget, clickThrough };
