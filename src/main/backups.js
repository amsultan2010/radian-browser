// Sauvegardes locales de l'état (Espaces, onglets, dossiers, réglages) : une copie
// d'orbe.json à chaque lancement puis toutes les heures, rangée dans
// « sauvegardes ». Comme dans Arc, on garde les dix dernières du jour et une
// par jour pour les dix jours d'avant. Aide → Dépannage → « Restaurer une
// sauvegarde » remet l'une d'elles en place et relance Orbe.
// L'historique (history.json) n'en fait pas partie.
//
// Confidentialité et sécurité (voir docs/securite-navigation.md, « Sauvegardes ») :
//  - une sauvegarde contient tout l'état (onglets, archive, liste des
//    téléchargements, notes, autorisations des sites, Boosts) : le dossier n'est
//    lisible que par l'utilisateur (0700), chaque fichier aussi (0600) ;
//  - ce que l'utilisateur supprime exprès (une entrée de l'archive ou toute
//    l'archive, une suggestion « oubliée », la liste des téléchargements, une note,
//    l'historique, les autorisations) est retiré aussi des sauvegardes déjà
//    faites (`forget`) : supprimé veut dire supprimé ;
//  - restaurer ne rend jamais un droit retiré depuis : les autorisations des sites
//    restent celles du moment, le JavaScript des Boosts n'est jamais rallumé, et un
//    Boost supprimé ou modifié depuis revient désactivé, à relire (`plan`) ;
//  - la restauration ne coupe pas Orbe d'un coup : elle demande un arrêt normal
//    (question des téléchargements en cours, pages qui retiennent, écritures en
//    attente) et ne remplace l'état qu'une fois l'arrêt acquis (`will-quit`).
const { app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { store } = require('./store');

const TODAY_MAX = 10;
const DAYS_MAX = 10;
const NAME = /^orbe-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/;

// Boîte de dialogue, arrêt et relance ; remplacés pendant les tests.
const env = {
  confirm: async (opts) => (await dialog.showMessageBox(opts)).response === 0,
  // « Des téléchargements sont en cours » : la question de l'arrêt, posée avant de rien toucher.
  quitOk: () => require('./downloads').confirmQuit(),
  // Arrêt normal : chaque module écrit ce qu'il a en attente, une page peut encore retenir.
  quit: () => app.quit(),
  relaunch: () => app.relaunch(),
};

// Fichier (ou dossier) lisible par son seul propriétaire. Sans effet sous Windows,
// où le dossier du profil n'est déjà ouvert qu'à l'utilisateur.
function own(p, mode) {
  try { fs.chmodSync(p, mode); } catch {}
}

const t = (key, vars) => store.t(key, null, vars);
const dirOf = (file) => path.join(path.dirname(file), 'sauvegardes');
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const dayOf = (name) => name.slice(5, 13);

// Noms à garder parmi `names`, pour un instant donné : les dix plus récentes du
// jour, puis la plus récente de chacun des dix jours précédents qui en ont.
function keep(names, now = new Date()) {
  const sorted = names.filter((n) => NAME.test(n)).sort().reverse();
  const today = stamp(now).slice(0, 8);
  const kept = new Set(sorted.filter((n) => dayOf(n) === today).slice(0, TODAY_MAX));
  const days = [];
  for (const n of sorted) {
    const day = dayOf(n);
    if (day === today || days.includes(day)) continue; // (un jour « futur », horloge reculée, compte comme un autre jour)
    if (days.length >= DAYS_MAX) break;
    days.push(day);
    kept.add(n);
  }
  return kept;
}

// Copie l'état enregistré (s'il est lisible) et retire les copies en trop. Renvoie le fichier créé, ou null.
// `fresh` : l'état en mémoire est d'abord écrit (copie horaire) — sinon une suppression
// faite à l'instant, pas encore écrite, repartirait dans la nouvelle sauvegarde.
function snapshot(file = store.file, now = new Date(), { fresh = false } = {}) {
  if (!file) return null;
  try {
    flushForget();
    if (fresh && file === store.file && store.state) store.flush();
    const raw = fs.readFileSync(file, 'utf8');
    JSON.parse(raw); // un fichier abîmé ne chasse pas une bonne sauvegarde
    const dir = dirOf(file);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    own(dir, 0o700);
    const target = path.join(dir, `orbe-${stamp(now)}.json`);
    fs.writeFileSync(target, raw, { mode: 0o600 });
    own(target, 0o600);
    const names = fs.readdirSync(dir);
    const kept = keep(names, now);
    for (const n of names) if (NAME.test(n) && !kept.has(n)) { try { fs.unlinkSync(path.join(dir, n)); } catch {} }
    return target;
  } catch {
    return null;
  }
}

// --- « Supprimé veut dire supprimé » -------------------------------------------------
// Ce que l'utilisateur vient de supprimer exprès est retiré des sauvegardes déjà
// faites, et de la copie de secours « orbe.json.bak ». `what` :
//   archiveAll, archiveIds, archiveUrls — l'archive (toute, ou ces entrées) ; avec
//     elles partent les onglets des sauvegardes qui ont été fermés depuis ;
//   historyAll, historyUrls — l'historique (copie de secours « history.json.bak »,
//     et l'ancien format, où il était rangé dans l'état) ;
//   downloads, notes — identifiants retirés de la liste ;
//   permissions — toutes les autorisations des sites.
// Les demandes rapprochées sont groupées : chaque fichier n'est récrit qu'une fois.
const waiting = [];
let forgetTimer = null;
function forget(what) {
  if (!what || typeof what !== 'object' || !store.file) return;
  // Onglets ouverts à cet instant : ceux-là ne sont pas « fermés depuis ».
  waiting.push({ ...what, file: store.file, open: new Set(Object.keys((store.state && store.state.tabs) || {})) });
  if (forgetTimer) return;
  forgetTimer = setTimeout(flushForget, 400);
  if (forgetTimer.unref) forgetTimer.unref();
}

// Applique une demande à un état lu d'une sauvegarde. Renvoie true s'il a changé.
function scrubState(s, w) {
  if (!s || typeof s !== 'object') return false;
  let changed = false;
  const drop = (key, test) => {
    if (!Array.isArray(s[key])) return;
    const kept = s[key].filter((x) => !test(x || {}));
    if (kept.length !== s[key].length) { s[key] = kept; changed = true; }
  };
  const ids = new Set(w.archiveIds || []);
  const urls = new Set(w.archiveUrls || []);
  if (w.archiveAll) drop('archive', () => true);
  else if (ids.size || urls.size) drop('archive', (a) => ids.has(a.id) || urls.has(a.url));
  // Onglets fermés depuis cette sauvegarde : ils y figurent encore comme ouverts.
  if ((w.archiveAll || urls.size) && s.tabs && typeof s.tabs === 'object') {
    for (const [id, tab] of Object.entries(s.tabs)) {
      if (w.open.has(id) || !tab || !/^https?:/i.test(tab.url || '')) continue;
      if (w.archiveAll || urls.has(tab.url)) { delete s.tabs[id]; changed = true; }
    }
  }
  if (w.downloads) { const d = new Set(w.downloads); drop('downloads', (x) => d.has(x.id)); }
  if (w.notes) { const n = new Set(w.notes); drop('notes', (x) => n.has(x.id)); }
  if (s.history && typeof s.history === 'object') {
    if (w.historyAll) { delete s.history; changed = true; }
    for (const u of w.historyUrls || []) if (Object.hasOwn(s.history || {}, u)) { delete s.history[u]; changed = true; }
  }
  if (w.permissions) {
    if (s.permissions && Object.keys(s.permissions).length) { s.permissions = {}; changed = true; }
    if (s.profilePermissions) { delete s.profilePermissions; changed = true; }
  }
  return changed;
}

function rewrite(file, change) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return; }
  if (!change(data)) return;
  try {
    fs.writeFileSync(file + '.tmp', JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
  } catch (err) {
    console.error('[orbe] sauvegarde : retrait impossible', err.message);
    // Un fichier qu'on ne peut pas récrire ne garde pas ce qui a été supprimé : il est retiré.
    try { fs.unlinkSync(file + '.tmp'); } catch {}
    try { fs.unlinkSync(file); } catch {}
  }
}

function flushForget() {
  if (forgetTimer) { clearTimeout(forgetTimer); forgetTimer = null; }
  if (!waiting.length) return 0;
  const todo = waiting.splice(0);
  for (const file of new Set(todo.map((w) => w.file))) {
    const mine = todo.filter((w) => w.file === file);
    const states = [...list(file).map((b) => b.file), file + '.bak'];
    for (const f of states) rewrite(f, (s) => mine.map((w) => scrubState(s, w)).some(Boolean));
    // Copie de secours de l'historique : vidée avec lui, ou allégée des pages oubliées.
    const bak = path.join(path.dirname(file), 'history.json.bak');
    if (mine.some((w) => w.historyAll)) { try { fs.unlinkSync(bak); } catch {} } else {
      const gone = mine.flatMap((w) => w.historyUrls || []);
      if (gone.length) rewrite(bak, (h) => { let c = false; for (const u of gone) if (h && Object.hasOwn(h, u)) { delete h[u]; c = true; } return c; });
    }
  }
  return todo.length;
}
app.on('before-quit', () => { flushForget(); });

// Sauvegardes présentes, de la plus récente à la plus ancienne : { name, file, at }.
function list(file = store.file) {
  if (!file) return [];
  let names = [];
  try { names = fs.readdirSync(dirOf(file)); } catch { return []; }
  return names.filter((n) => NAME.test(n)).sort().reverse().map((name) => {
    const m = NAME.exec(name);
    return { name, file: path.join(dirOf(file), name), at: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() };
  });
}

const label = (b) => new Date(b.at).toLocaleString(store.state.settings.lang, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// Ce qu'une sauvegarde remettrait en place, corrigé de ce qui ne doit jamais revenir :
//  - autorisations des sites : celles du moment (une autorisation retirée depuis ne revient pas) ;
//  - « JavaScript des Boosts » : jamais rallumé (il ne reste permis que s'il l'est aujourd'hui) ;
//  - Boost supprimé ou modifié depuis : il revient désactivé, script coupé, « à relire »
//    comme un Boost importé ; un Boost inchangé garde son état du moment.
// Renvoie { state, boosts : nombre de Boosts à relire, grants : autorisations de la
// sauvegarde qui ne reviennent pas, js : le script des Boosts y était permis et ne l'est plus }.
function plan(parsed, cur = store.state) {
  const s = parsed;
  const out = { state: s, boosts: 0, grants: 0, js: false };
  const settings = s.settings && typeof s.settings === 'object' ? s.settings : (s.settings = {});
  const jsNow = !!cur && cur.settings.boostsJs === true;
  out.js = settings.boostsJs === true && !jsNow;
  settings.boostsJs = settings.boostsJs === true && jsNow;
  const granted = (all) => {
    const set = new Set();
    for (const [profile, sites] of Object.entries(all)) for (const [origin, m] of Object.entries(sites || {})) for (const [k, v] of Object.entries(m || {})) if (v === true) set.add(`${profile}|${origin}|${k}`);
    return set;
  };
  const then = granted({ default: s.permissions || {}, ...(s.profilePermissions || {}) });
  const now = granted({ default: (cur && cur.permissions) || {}, ...((cur && cur.profilePermissions) || {}) });
  for (const g of then) if (!now.has(g)) out.grants += 1;
  s.permissions = JSON.parse(JSON.stringify((cur && cur.permissions) || {}));
  if (cur && cur.profilePermissions) s.profilePermissions = JSON.parse(JSON.stringify(cur.profilePermissions)); else delete s.profilePermissions;
  const boosts = s.boosts && typeof s.boosts === 'object' && !Array.isArray(s.boosts) ? s.boosts : (s.boosts = {});
  const sig = (b) => JSON.stringify([b.css || '', b.js || '', b.zaps || [], b.look || {}]);
  for (const [host, b] of Object.entries(boosts)) {
    if (!b || typeof b !== 'object') { delete boosts[host]; continue; }
    const mine = cur && cur.boosts && Object.hasOwn(cur.boosts, host) ? cur.boosts[host] : null;
    if (mine && sig(mine) === sig(b)) { b.enabled = mine.enabled !== false; b.jsOn = mine.jsOn === true; b.review = mine.review === true; continue; }
    b.enabled = false;
    b.jsOn = false;
    b.review = true;
    out.boosts += 1;
  }
  return out;
}

// Restauration demandée, en attente de l'arrêt d'Orbe : { file, raw }.
let armed = null;
const restoring = () => !!armed;
// L'arrêt a été retenu (une page a répondu « Rester ») : rien n'est restauré.
function disarm() { armed = null; }

// Remet une sauvegarde en place. Après accord, Orbe est arrêté normalement : la
// question des téléchargements en cours est posée d'abord, les pages peuvent
// retenir, chaque module écrit ce qu'il avait en attente. L'état n'est remplacé
// qu'une fois l'arrêt acquis (`apply`, sur « will-quit »), puis Orbe se relance.
// `name` doit être l'un des fichiers listés (jamais un chemin).
async function restore(name) {
  flushForget();
  const b = list().find((x) => x.name === name);
  if (!b || !store.file) return false;
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(b.file, 'utf8')); } catch { return false; }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.spaces)) return false;
  const p = plan(parsed);
  // La question dit ce qui revient, ce qui ne revient pas, et ce qu'Orbe garde comme sauvegardes.
  const detail = [
    t('backup.detail', { date: label(b) }),
    [t('backup.detailPerms'), p.boosts ? t('backup.detailBoosts', { n: p.boosts }) : '', p.js ? t('backup.detailJs') : ''].filter(Boolean).join('\n'),
    t('backup.detailRetention', { today: TODAY_MAX, days: DAYS_MAX }),
  ].join('\n\n');
  const ok = await env.confirm({ type: 'warning', message: t('backup.confirm'), detail, buttons: [t('backup.restore'), t('sheet.cancel')], defaultId: 1, cancelId: 1 });
  if (!ok) return false;
  if (!(await env.quitOk())) return false;
  armed = { file: store.file, raw: JSON.stringify(p.state) };
  env.quit();
  return true;
}

// Dernier instant de l'arrêt : plus rien ne le retient, plus rien n'écrira après.
function apply() {
  if (!armed) return false;
  const { file, raw } = armed;
  armed = null;
  store.flush(); // état quitté et historique en attente : écrits
  snapshot(file); // l'état quitté reste lui aussi récupérable
  fs.writeFileSync(file, raw);
  store.file = null; // plus rien ne doit réécrire l'état avant la relance
  env.relaunch();
  return true;
}
app.on('will-quit', apply);

// Articles du menu Aide → Dépannage → « Restaurer une sauvegarde ».
function menuItems(max = 14) {
  const all = list().slice(0, max);
  if (!all.length) return [{ label: t('backup.none'), enabled: false }];
  return all.map((b) => ({ label: label(b), click: () => { restore(b.name); } }));
}

let timer = null;
function start() {
  // Sauvegardes d'une version précédente : rendues lisibles par leur seul propriétaire.
  if (store.file) { own(dirOf(store.file), 0o700); for (const b of list()) own(b.file, 0o600); }
  snapshot();
  if (timer) clearInterval(timer);
  timer = setInterval(() => snapshot(store.file, new Date(), { fresh: true }), 60 * 60e3);
  if (timer.unref) timer.unref();
}

module.exports = { snapshot, list, keep, restore, plan, apply, restoring, disarm, forget, flushForget, scrubState, menuItems, start, env, dirOf, TODAY_MAX, DAYS_MAX };
