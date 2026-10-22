// Barre de commande : interprétation de la saisie et suggestions.
const { net } = require('electron');
const { store } = require('./store');
const palette = require('./palette');

const ENGINES = {
  google: { name: 'Google', search: 'https://www.google.com/search?q=%s', suggest: 'https://suggestqueries.google.com/complete/search?client=firefox&q=%s' },
  duckduckgo: { name: 'DuckDuckGo', search: 'https://duckduckgo.com/?q=%s', suggest: 'https://duckduckgo.com/ac/?type=list&q=%s' },
  bing: { name: 'Bing', search: 'https://www.bing.com/search?q=%s', suggest: 'https://api.bing.com/osjson.aspx?query=%s' },
  qwant: { name: 'Qwant', search: 'https://www.qwant.com/?q=%s', suggest: 'https://api.qwant.com/v3/suggest?q=%s' },
  ecosia: { name: 'Ecosia', search: 'https://www.ecosia.org/search?q=%s', suggest: 'https://ac.ecosia.org/autocomplete?type=list&q=%s' },
  brave: { name: 'Brave', search: 'https://search.brave.com/search?q=%s', suggest: 'https://search.brave.com/api/suggest?q=%s' },
};

// `profileId()` : profil dont les réglages s'appliquent (celui de l'Espace affiché).
const hooks = { profileId: () => 'default' };
const pref = (key) => require('./prefs').get(key, hooks.profileId());
const engine = () => ENGINES[pref('searchEngine')] || ENGINES.google;
const searchUrl = (q) => engine().search.replace('%s', encodeURIComponent(q));

// Renvoie une URL si la saisie ressemble à une adresse, sinon null.
function toUrl(input) {
  const s = input.trim();
  if (!s) return null;
  if (/^(https?|orbe|file|about|view-source|chrome|data|blob):/i.test(s)) return s;
  if (/\s/.test(s)) return null;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(s) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(s)) return 'http://' + s;
  if (/^[^\s/?#]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(s)) return 'https://' + s;
  return null;
}

const resolve = (input) => toUrl(input) || searchUrl(input.trim());

const strip = (url) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');

const normalized = new WeakMap(); // entrée (historique, archive, onglet) -> champs prêts à comparer

function norm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Normaliser (accents, casse) coûte cher : fait une fois par entrée, pas à chaque frappe.
function fields(x) {
  let c = normalized.get(x);
  if (!c || c.url !== x.url || c.rawTitle !== x.title) {
    c = { url: x.url, rawTitle: x.title, u: norm(strip(x.url || '')), title: norm(x.title) };
    normalized.set(x, c);
  }
  return c;
}

// Sites où la même page porte une foule d'adresses (une par vue, par onglet interne…) :
// l'historique n'y propose qu'une ligne par titre. Liste d'Arc (`command_bar_behavior.json`).
const DEDUP_HOSTS = ['figma.com', 'maps.google.com', 'notion.so', 'app.notion.com', 'zoom.us', 'opentable.com', 'zillow.com', 'github.com', 'app.mode.com', 'console.cloud.google.com'];
// Clé « site + titre » d'une entrée de ces sites, sinon '' (jamais dédoublonnée).
function dedupKey(c) {
  if (c.dedup === undefined) {
    const host = c.u.split(/[/?#]/, 1)[0];
    c.dedup = c.title && DEDUP_HOSTS.some((d) => host === d || host.endsWith('.' + d)) ? host + '\n' + c.title : '';
  }
  return c.dedup;
}

// Titre d'une action, prêt à comparer : calculé une fois par action (les listes sont gardées par palette.js).
const actionKey = (c) => (c.n === undefined ? (c.n = norm(c.title)) : c.n);
const actionItem = (c) => ({ kind: 'command', command: c.command, arg: c.arg, title: c.title, subtitle: c.shortcut || c.sub || store.t('cmd.action') });
const ACTIONS_MAX = 60; // ⇥ sur une barre vide : les actions seules, en liste déroulante

// Recherche incrémentale : quand la saisie prolonge la précédente (« nav » puis
// « navi »), seules les entrées d'historique déjà retenues peuvent encore
// convenir ; les autres ne sont pas relues. `rev` change à chaque modification
// de l'historique (store.historyRev), `history` quand il est remplacé.
let last = null; // { q, history, rev, kept }
const stats = { scanned: 0, incremental: false }; // dernière recherche, pour les mesures et les tests

// Suggestions locales, synchrones : la liste apparaît sans attendre le réseau.
function local(query, { tabs, commands, activeId, scope }) {
  const q = norm(query.trim());
  const out = [];
  if (scope === 'actions') {
    for (const c of commands) {
      if (q && !actionKey(c).includes(q)) continue;
      out.push(actionItem(c));
      if (out.length >= ACTIONS_MAX) break;
    }
    return out;
  }
  if (!q) {
    for (const t of tabs.filter((x) => x.id !== activeId).sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0)).slice(0, 6)) {
      out.push({ kind: 'tab', tabId: t.id, title: t.title || strip(t.url), subtitle: strip(t.url), favicon: t.favicon });
    }
    return out;
  }
  const url = toUrl(query);
  const hist = [];
  const now = Date.now();
  const history = store.state.history;
  const rev = store.historyRev || 0;
  const incremental = !!last && last.history === history && last.rev === rev && q.startsWith(last.q);
  const pool = incremental ? last.kept : Object.values(history);
  const kept = [];
  for (const h of pool) {
    const { u, title } = fields(h);
    let score = 0;
    if (u.startsWith(q)) score = 100;
    else if (u.includes(q)) score = 40;
    else if (title.includes(q)) score = 30;
    if (!score) continue;
    kept.push(h);
    score += Math.min(h.visits, 30) + Math.max(0, 20 - (now - h.last) / 864e5);
    score -= Math.min(u.length, 80) / 8;
    hist.push({ score, h, prefix: u.startsWith(q) });
  }
  last = { q, history, rev, kept };
  stats.scanned = pool.length;
  stats.incremental = incremental;
  hist.sort((a, b) => b.score - a.score);

  const best = hist[0];
  if (url) out.push({ kind: 'url', url, title: strip(url), subtitle: store.t('cmd.open') });
  else if (best && best.prefix) {
    out.push({ kind: 'history', url: best.h.url, title: best.h.title || strip(best.h.url), subtitle: strip(best.h.url), favicon: best.h.favicon, complete: strip(best.h.url), deletable: true });
    hist.shift();
  }
  out.push({ kind: 'search', url: searchUrl(query.trim()), title: query.trim(), subtitle: store.t('cmd.search', null, { engine: engine().name }) });
  // La saisie désigne un site (« youtube », « yt ») : ⇥ ou espace cherche dedans.
  const site = palette.siteHint(q);
  if (site) out.push(site);

  const seen = new Set(out.map((o) => o.url));
  const titles = new Set(); // « site + titre » déjà proposés (sites de DEDUP_HOSTS)
  if (best && best.prefix && !url) { const k = dedupKey(fields(best.h)); if (k) titles.add(k); }
  for (const t of tabs) {
    if (t.id === activeId) continue;
    const f = fields(t);
    if (f.title.includes(q) || f.u.includes(q)) {
      out.push({ kind: 'tab', tabId: t.id, title: t.title || strip(t.url), subtitle: store.t('cmd.switchTo'), favicon: t.favicon });
      seen.add(t.url);
      if (out.length >= 4) break;
    }
  }
  const room = site ? 7 : 6;
  for (const c of commands) {
    if (actionKey(c).includes(q)) {
      out.push(actionItem(c));
      if (out.length >= room) break;
    }
  }
  for (const a of store.state.archive) {
    if (out.length >= 7) break;
    if (seen.has(a.url)) continue;
    const f = fields(a);
    if (!(f.title.includes(q) || f.u.includes(q))) continue;
    seen.add(a.url);
    out.push({ kind: 'history', url: a.url, title: a.title || strip(a.url), subtitle: store.t('lib.archive'), favicon: a.favicon, deletable: true });
  }
  for (const { h } of hist) {
    if (out.length >= 8) break;
    if (seen.has(h.url)) continue;
    const k = dedupKey(fields(h));
    if (k) { if (titles.has(k)) continue; titles.add(k); }
    out.push({ kind: 'history', url: h.url, title: h.title || strip(h.url), subtitle: strip(h.url), favicon: h.favicon, deletable: true });
  }
  return out;
}

// Suggestions du moteur de recherche, asynchrones et annulables.
async function remote(query, signal) {
  const q = query.trim();
  if (!q || !pref('suggestions') || toUrl(q)) return [];
  try {
    const res = await net.fetch(engine().suggest.replace('%s', encodeURIComponent(q)), { signal });
    if (!res.ok) return [];
    const json = await res.json();
    const list = Array.isArray(json) && Array.isArray(json[1]) ? json[1] : [];
    return list.filter((s) => typeof s === 'string' && s.toLowerCase() !== q.toLowerCase()).slice(0, 4)
      .map((s) => ({ kind: 'search', url: searchUrl(s), title: s, subtitle: store.t('cmd.search', null, { engine: engine().name }) }));
  } catch {
    return [];
  }
}

module.exports = { DEDUP_HOSTS, ENGINES, resolve, toUrl, searchUrl, strip, local, remote, hooks, stats, forget: () => { last = null; } };
