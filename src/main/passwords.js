// Gestionnaire de mots de passe intégré. Modèle de menace : docs/mots-de-passe.md.
//
// Trois règles tiennent tout le reste :
//   1. Le coffre est un fichier à part (passwords.json), chiffré en entier par
//      `safeStorage` ; sans chiffrement réel du système, rien n'est enregistré.
//   2. La page ne sait rien : ni les comptes enregistrés, ni même s'il y en a.
//      La liste des comptes s'affiche dans une vue d'Orbe posée par-dessus la
//      page, jamais dans son DOM. Le script de page (src/preload/page.js, monde
//      isolé) ne reçoit un mot de passe qu'après un choix explicite.
//   3. Ce qui décide « quels comptes pour ce cadre » est l'origine réelle du
//      cadre émetteur, donnée par Electron (`senderFrame.origin`), jamais un
//      champ du message.
const { app, ipcMain, safeStorage, session, dialog, clipboard, systemPreferences, shell, screen, nativeTheme, BaseWindow, BrowserWindow, WebContentsView } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { store, uid } = require('./store');
const { boundsOf } = require('./motion');
const platform = require('./platform');

const PAGE_PRELOAD = path.join(__dirname, '../preload/page.js');
const CHANNEL = 'orbe-pw';
const MAX_USER = 300;
const MAX_PASS = 1000;
// Délais que les tests raccourcissent.
const limits = { armedTtl: 20e3 }; // un envoi de formulaire attend au plus ce délai sa confirmation
const PROMPT_TTL = 45e3; // durée d'affichage de la proposition d'enregistrement
const USERNAME_TTL = 10 * 60e3; // connexion en deux étapes : identifiant retenu
const CHOICE_TTL = 45e3; // connexion en deux étapes : compte choisi à la première
const AUTH_GRACE = 90e3; // après Touch ID, pas de nouvelle demande pendant ce délai
const CLIPBOARD_TTL = 60e3;

// Fournis par main.js (évite une dépendance circulaire avec window.js).
const env = { trusted: null, uiPreload: '', internal: 'orbe://app/', toast: () => {} };
// Remplaçables par les tests : aucune boîte de dialogue ni Touch ID en test.
const hooks = {
  confirm: async (parent, opts) => (await (parent ? dialog.showMessageBox(parent, opts) : dialog.showMessageBox(opts))).response === 0,
  authenticate: null,
};

const t = (key, vars) => store.t(key, null, vars);
const profiles = new WeakMap(); // session de profil -> identifiant du profil
const states = new Map(); // id webContents -> état de la page (voir stateOf)
const overlays = new Map(); // id BaseWindow -> { win, picker, prompt, … }
let manager = null; // fenêtre « Mots de passe »
let ipcReady = false;

// --- Coffre chiffré ----------------------------------------------------------
const vault = { file: null, data: null, status: 'closed', lastGood: false };

// Chiffrement réel disponible ? Sous Linux, le repli « basic_text » chiffre
// avec une clé écrite en dur dans Chromium : autant dire en clair, donc refusé.
function encryptionAvailable() {
  try {
    if (!app.isReady() || !safeStorage.isEncryptionAvailable()) return false;
    if (process.platform === 'linux') {
      const backend = safeStorage.getSelectedStorageBackend();
      if (backend === 'basic_text' || backend === 'unknown') return false;
    }
    return true;
  } catch {
    return false;
  }
}

function emptyData() {
  return { profiles: {} };
}

function readFile(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!raw || raw.orbe !== 'passwords' || typeof raw.data !== 'string') throw new Error('format');
  const data = JSON.parse(safeStorage.decryptString(Buffer.from(raw.data, 'base64')));
  if (!data || typeof data !== 'object' || !data.profiles) throw new Error('contenu');
  return data;
}

// Ouvre le coffre à la première utilisation (jamais au démarrage : sur macOS
// c'est le premier accès au trousseau). Renvoie true s'il est utilisable.
function open() {
  if (vault.status === 'open') return true;
  if (vault.status === 'error') return false;
  if (!encryptionAvailable()) { vault.status = 'closed'; return false; }
  if (!vault.file) vault.file = path.join(app.getPath('userData'), 'passwords.json');
  const exists = fs.existsSync(vault.file);
  const backup = fs.existsSync(vault.file + '.bak');
  if (!exists && !backup) {
    vault.data = emptyData();
    vault.status = 'open';
    return true;
  }
  for (const file of [vault.file, vault.file + '.bak']) {
    try {
      vault.data = readFile(file);
      vault.status = 'open';
      // Ouvert depuis la copie de secours : ne pas la remplacer par l'original abîmé.
      vault.lastGood = file === vault.file;
      return true;
    } catch {}
  }
  // Illisible (clé du trousseau perdue, fichier abîmé) : on n'écrit plus rien,
  // pour ne pas écraser des données peut-être récupérables.
  vault.status = 'error';
  console.error('[orbe] coffre de mots de passe illisible');
  return false;
}

// Écriture atomique et immédiate : fichier temporaire, puis remplacement.
function write() {
  if (vault.status !== 'open') return false;
  const body = JSON.stringify({ orbe: 'passwords', version: 1, data: safeStorage.encryptString(JSON.stringify(vault.data)).toString('base64') });
  const tmp = vault.file + '.tmp';
  try {
    const fd = fs.openSync(tmp, 'w', 0o600);
    try { fs.writeSync(fd, body); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (vault.lastGood) { try { fs.copyFileSync(vault.file, vault.file + '.bak'); } catch {} }
    fs.renameSync(tmp, vault.file);
    vault.lastGood = true;
    return true;
  } catch (err) {
    console.error('[orbe] coffre de mots de passe : écriture impossible', err.code || '');
    try { fs.unlinkSync(tmp); } catch {}
    return false;
  }
}

function bucket(pid) {
  const all = vault.data.profiles;
  if (!Object.hasOwn(all, pid)) all[pid] = { entries: [], never: [] };
  return all[pid];
}

function status() {
  if (vault.status === 'error') return 'error';
  return encryptionAvailable() ? 'ok' : 'unavailable';
}

// Origine normalisée (schéma + hôte + port) d'une adresse http(s), sinon ''.
function originOf(input) {
  let s = String(input || '').trim();
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    return /^https?:$/.test(u.protocol) && u.hostname ? u.origin : '';
  } catch {
    return '';
  }
}

const clip = (v, max) => String(v == null ? '' : v).slice(0, max);
const siteOf = (origin) => origin.replace(/^https:\/\//, '');

// --- Domaine enregistrable ---------------------------------------------------
// « compte.exemple.fr » et « www.exemple.fr » partagent « exemple.fr », mais
// « a.github.io » et « b.github.io » ne partagent rien : il faut la liste des
// suffixes publics. Chromium l'embarque ; on l'interroge par les cookies, qu'il
// refuse de poser sur un suffixe public (session en mémoire, jamais utilisée
// pour naviguer). En cas de doute, le domaine enregistrable est l'hôte entier.
const registrableCache = new Map();
const suffixCache = new Map(); // domaine -> cookie de domaine accepté ?
let pslSession = null;

async function cookieAllowed(domain) {
  if (suffixCache.has(domain)) return suffixCache.get(domain);
  if (!pslSession) pslSession = session.fromPartition('orbe-suffixes');
  let ok;
  try {
    await pslSession.cookies.set({ url: `https://x.${domain}/`, name: 's', value: '1', domain: '.' + domain });
    ok = true;
  } catch {
    ok = false;
  }
  if (suffixCache.size > 5000) suffixCache.clear();
  suffixCache.set(domain, ok);
  return ok;
}

// Le domaine enregistrable est le PLUS LONG suffixe public de l'hôte, plus une
// étiquette. Les suffixes publics s'emboîtent (« amazonaws.com » est un
// domaine ordinaire, « s3.amazonaws.com » un suffixe public) : on sonde donc
// tous les suffixes de l'hôte, et le plus long qui est refusé l'emporte.
async function registrable(host) {
  if (registrableCache.has(host)) return registrableCache.get(host);
  let out = host;
  const ip = /^\[.*\]$/.test(host) || /^\d+(\.\d+){3}$/.test(host);
  // Hôte inhabituel (point final, caractères hors ASCII simple) : pas de parenté.
  if (!ip && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) {
    const labels = host.split('.');
    let longest = -1; // indice de début du plus long suffixe refusé
    for (let i = labels.length - 1; i >= 0; i--) {
      if (!(await cookieAllowed(labels.slice(i).join('.')))) longest = i;
    }
    // Un domaine de premier niveau est toujours refusé : si rien ne l'est, la
    // sonde ne fonctionne pas, et l'hôte entier reste la règle (la plus stricte).
    if (longest > 0) out = labels.slice(longest - 1).join('.');
  }
  if (registrableCache.size > 2000) registrableCache.clear();
  registrableCache.set(host, out);
  return out;
}

// Rapport entre l'origine d'un compte enregistré et celle de la page :
//   'exact'   même schéma, même hôte, même port ;
//   'related' même domaine enregistrable (autre sous-domaine, autre port, ou
//             http enregistré puis page en https) : proposé, jamais sans
//             confirmation ;
//   null      aucun rapport — dont un compte https sur une page http.
async function relation(saved, page) {
  if (saved === page) return 'exact';
  let a;
  let b;
  try { a = new URL(saved); b = new URL(page); } catch { return null; }
  if (a.protocol === 'https:' && b.protocol !== 'https:') return null;
  return (await registrable(a.hostname)) === (await registrable(b.hostname)) ? 'related' : null;
}

async function matchesFor(pid, origin) {
  const out = { exact: [], related: [] };
  if (!open()) return out;
  for (const e of bucket(pid).entries) {
    const r = await relation(e.origin, origin);
    if (r) out[r].push(e);
  }
  const recent = (x, y) => (y.usedAt || y.updatedAt || 0) - (x.usedAt || x.updatedAt || 0);
  out.exact.sort(recent);
  out.related.sort(recent);
  return out;
}

// --- Opérations sur le coffre ------------------------------------------------
function publicEntry(e) {
  return { id: e.id, origin: e.origin, site: siteOf(e.origin), username: e.username, title: e.title || '', note: e.note || '', hasOtp: !!e.otpAuth, updatedAt: e.updatedAt };
}

// Enregistre ou met à jour. Renvoie { id, result } : 'created', 'updated',
// 'same', ou null si le coffre n'est pas utilisable.
function save(pid, { origin, username, password, title, note, otpAuth }, { persist = true } = {}) {
  const o = originOf(origin);
  const user = clip(username, MAX_USER).trim();
  const pass = clip(password, MAX_PASS);
  if (!o || !pass || !open()) return null;
  const b = bucket(pid);
  const now = Date.now();
  let e = b.entries.find((x) => x.origin === o && x.username === user);
  let merged = false;
  // Compte enregistré sans identifiant (mot de passe généré avant l'envoi du
  // formulaire) : l'identifiant connu ensuite le complète au lieu de le doubler.
  if (!e && user) {
    e = b.entries.find((x) => x.origin === o && !x.username && x.password === pass);
    if (e) { e.username = user; merged = true; }
  }
  let result = e && !merged && e.password === pass ? 'same' : 'updated';
  if (!e) {
    e = { id: uid() + uid(), origin: o, username: user, password: pass, title: '', note: '', otpAuth: '', createdAt: now, updatedAt: now, usedAt: 0 };
    b.entries.push(e);
    result = 'created';
  }
  const before = JSON.stringify([e.title, e.note, e.otpAuth]);
  e.password = pass;
  if (title !== undefined) e.title = clip(title, 200);
  if (note !== undefined) e.note = clip(note, 4000);
  if (otpAuth !== undefined) e.otpAuth = clip(otpAuth, 1000);
  // Rien n'a changé : pas d'écriture.
  if (result === 'same' && before === JSON.stringify([e.title, e.note, e.otpAuth])) return { id: e.id, result };
  e.updatedAt = now;
  if (persist && !write()) return null;
  return { id: e.id, result };
}

function remove(pid, id) {
  if (!open()) return false;
  const b = bucket(pid);
  const n = b.entries.length;
  b.entries = b.entries.filter((e) => e.id !== id);
  return b.entries.length !== n && write();
}

function setNever(pid, origin, on) {
  const o = originOf(origin);
  if (!o || !open()) return false;
  const b = bucket(pid);
  b.never = b.never.filter((x) => x !== o);
  if (on) b.never.push(o);
  return write();
}

function forgetProfile(pid) {
  if (!open() || !Object.hasOwn(vault.data.profiles, pid)) return;
  delete vault.data.profiles[pid];
  write();
}

// Mot de passe fort, façon trousseau : trois groupes de six lettres et
// chiffres sans caractères ambigus (accepté par presque tous les sites).
function generate() {
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = lower + upper + digits;
  for (;;) {
    let s = '';
    for (let i = 0; i < 18; i++) s += all[crypto.randomInt(all.length)];
    if (/[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s)) return `${s.slice(0, 6)}-${s.slice(6, 12)}-${s.slice(12)}`;
  }
}

// --- CSV (formats de Chrome, Safari / Trousseau iCloud, Firefox, Bitwarden) ---
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

const CSV_COLUMNS = {
  url: ['url', 'website', 'login_uri', 'origin', 'hostname', 'web site', 'login url'],
  username: ['username', 'login', 'login_username', 'user', 'user name', 'email'],
  password: ['password', 'login_password', 'pass'],
  title: ['title', 'name'],
  note: ['notes', 'note', 'comment', 'comments', 'extra'],
  otpAuth: ['otpauth', 'totp', 'login_totp'],
};

// Fusionne un export CSV dans le coffre du profil. Renvoie le décompte, ou
// null si le fichier n'a pas les colonnes attendues ou si le coffre est fermé.
function importCsv(pid, text) {
  const rows = parseCsv(text);
  if (rows.length < 1 || !open()) return null;
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = {};
  for (const [key, names] of Object.entries(CSV_COLUMNS)) col[key] = header.findIndex((h) => names.includes(h));
  if (col.url < 0 || col.password < 0) return null;
  const count = { created: 0, updated: 0, same: 0, skipped: 0 };
  const at = (r, k) => (col[k] >= 0 && r[col[k]] != null ? r[col[k]] : '');
  for (const r of rows.slice(1)) {
    const origin = originOf(at(r, 'url'));
    const password = at(r, 'password');
    if (!origin || !password) { count.skipped += 1; continue; }
    const extra = {};
    if (at(r, 'title')) extra.title = at(r, 'title');
    if (at(r, 'note')) extra.note = at(r, 'note');
    if (at(r, 'otpAuth')) extra.otpAuth = at(r, 'otpAuth');
    const res = save(pid, { origin, username: at(r, 'username'), password, ...extra }, { persist: false });
    if (res) count[res.result] += 1; else count.skipped += 1;
  }
  if (!write()) return null;
  return count;
}

// Comptes repris d'un autre navigateur (import-arc-data.js) : mêmes règles que le CSV —
// adresse http(s) et mot de passe obligatoires, compte déjà présent mis à jour, une seule
// écriture du coffre à la fin. Renvoie le décompte, ou null si le coffre est fermé.
function importList(pid, list) {
  if (!Array.isArray(list) || !open()) return null;
  const count = { created: 0, updated: 0, same: 0, skipped: 0 };
  for (const x of list) {
    const origin = originOf(x && x.origin);
    if (!origin || !x.password) { count.skipped += 1; continue; }
    const res = save(pid, { origin, username: x.username || '', password: x.password }, { persist: false });
    if (res) count[res.result] += 1; else count.skipped += 1;
  }
  if (!write()) return null;
  return count;
}

// En clair, par nature : à n'écrire que sur demande explicite. Les colonnes
// sont celles de l'export Safari / Trousseau iCloud, que Chrome relit aussi.
function exportCsv(pid) {
  if (!open()) return null;
  // Valeurs exportées telles quelles (aucun préfixe « anti-formule » : il
  // fausserait un identifiant comme « +33… » ou « @nom » à la réimportation).
  const cell = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) || s !== s.trim() ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = ['Title,URL,Username,Password,Notes,OTPAuth'];
  for (const e of bucket(pid).entries) {
    lines.push([e.title || siteOf(e.origin), e.origin + '/', e.username, e.password, e.note, e.otpAuth].map(cell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

// --- Presse-papiers ----------------------------------------------------------
let clipboardSecret = null;
let clipboardTimer = null;

// Vide le presse-papiers s'il contient encore le mot de passe copié ; s'il a
// changé entre-temps, on n'y touche pas.
async function clearClipboardIfOurs() {
  clearTimeout(clipboardTimer);
  const secret = clipboardSecret;
  clipboardSecret = null;
  if (!secret) return;
  try { if ((await clipboard.readText()) === secret) clipboard.clear(); } catch {}
}

async function copySecret(text) {
  clearTimeout(clipboardTimer);
  await clipboard.writeText(text);
  clipboardSecret = text;
  clipboardTimer = setTimeout(clearClipboardIfOurs, CLIPBOARD_TTL);
}

// --- Confirmation d'identité -------------------------------------------------
let authUntil = 0;

async function authenticate(reason, parent, { fresh = false } = {}) {
  if (!fresh && Date.now() < authUntil) return true;
  let ok = false;
  if (hooks.authenticate) ok = !!(await hooks.authenticate(reason));
  else if (platform.isMac && systemPreferences.canPromptTouchID()) {
    ok = await systemPreferences.promptTouchID(reason).then(() => true, () => false);
  } else {
    // Sans Touch ID : simple confirmation. Elle protège d'un clic malheureux,
    // pas de quelqu'un qui a la main sur la session ouverte.
    ok = await hooks.confirm(parent, { type: 'question', message: t('pw.authTitle'), detail: t('pw.authDetail', { reason }), buttons: [t('pw.authOk'), t('pw.cancel')], defaultId: 1, cancelId: 1 });
  }
  if (ok) authUntil = Date.now() + AUTH_GRACE;
  return ok;
}

// --- Cadres et pages ---------------------------------------------------------
// Tout ce qu'on sait d'un cadre vient d'Electron. `embedded` : le cadre est
// inclus dans une page d'une autre origine (formulaire dans un iframe tiers).
function frameInfo(frame) {
  try {
    if (!frame || frame.detached || (typeof frame.isDestroyed === 'function' && frame.isDestroyed())) return null;
    const origin = frame.origin;
    if (!/^https?:\/\/[^/]+$/.test(origin) || new URL(frame.url).origin !== origin) return null;
    let embedded = false;
    let topOrigin = origin;
    for (let p = frame.parent; p; p = p.parent) {
      topOrigin = p.origin;
      if (p.origin !== origin) embedded = true;
    }
    return { origin, embedded, topOrigin, main: !frame.parent };
  } catch {
    return null;
  }
}

// Un envoi relevé ne reste en mémoire que le temps d'être confirmé.
function disarm(st) {
  clearTimeout(st.armedTimer);
  st.armedTimer = null;
  st.armed = null;
}

function stateOf(wc) {
  let st = states.get(wc.id);
  if (!st) {
    st = { wc, focus: null, armed: null, generated: null, lastUsername: null, chosen: null, tokens: 0, buckets: new Map(), windowStart: 0, hideTimer: null, armedTimer: null };
    states.set(wc.id, st);
    wc.once('destroyed', () => {
      clearTimeout(st.hideTimer);
      clearTimeout(st.armedTimer);
      states.delete(wc.id);
      for (const o of overlays.values()) {
        if (o.pick && o.pick.wc === wc) hidePicker(o);
        if (o.pending && o.pending.wc === wc) closePrompt(o);
      }
    });
    // Liste ouverte : ↑ ↓ pour choisir, Entrée pour remplir, Échap pour fermer.
    // Le clavier reste dans la page ; ces touches sont relayées à la liste.
    wc.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown' || input.meta || input.control || input.alt) return;
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(input.key)) return;
      const o = [...overlays.values()].find((x) => x.pick && x.pick.wc === wc && x.picker && !x.picker.webContents.isDestroyed());
      if (!o) return;
      if (input.key === 'Escape') { hidePicker(o); return; }
      // Entrée ne vaut choix que si une ligne a été désignée aux flèches.
      if (input.key === 'Enter' && !o.pick.keyed) return;
      o.pick.keyed = true;
      e.preventDefault();
      o.picker.webContents.send('overlay', { key: input.key });
    });
    // Un envoi de formulaire est confirmé par la navigation qui le suit.
    wc.on('did-start-navigation', (details) => {
      if (details.isSameDocument) return;
      if (details.isMainFrame) {
        // La page change : la liste ouverte pour l'ancienne ne lui survit pas,
        // et le champ signalé n'existe plus.
        hidePickerFor(wc);
        st.focus = null;
        st.generated = null;
        // Le compte choisi à la première étape ne suit pas vers un autre site.
        let next = '';
        try { next = new URL(details.url).origin; } catch {}
        if (st.chosen && st.chosen.origin !== next) st.chosen = null;
      }
      if (!st.armed) return;
      const armed = st.armed;
      // Seule compte la navigation de la page ou du cadre du formulaire.
      let node = -1;
      try { node = details.frame ? details.frame.frameTreeNodeId : -1; } catch {}
      if (!details.isMainFrame && node !== armed.node) return;
      disarm(st);
      if (Date.now() - armed.at < limits.armedTtl) offerSave(wc, armed);
    });
  }
  return st;
}

// Débit limité, par cadre : une publicité dans un iframe qui inonde le canal
// n'épuise que son propre quota, pas celui de la page. Un plafond plus large
// borne l'ensemble des iframes d'une page ; le cadre principal n'y est pas soumis.
const FRAME_LIMIT = 40;
const SUBFRAMES_LIMIT = 400;
function allowed(st, frame, main) {
  const now = Date.now();
  if (now - st.windowStart > 2000) { st.windowStart = now; st.tokens = 0; st.buckets.clear(); }
  let node = -1;
  try { node = frame.frameTreeNodeId; } catch {}
  const n = (st.buckets.get(node) || 0) + 1;
  st.buckets.set(node, n);
  if (n > FRAME_LIMIT) return false;
  if (main) return true;
  st.tokens += 1;
  return st.tokens <= SUBFRAMES_LIMIT;
}

const settings = () => store.state.settings;

async function onPageMessage(e, msg) {
  const wc = e.sender;
  const pid = profiles.get(wc.session);
  // Session inconnue (navigation privée, interface) : le canal n'existe pas.
  if (!pid || !msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
  if (env.trusted && env.trusted.has(wc)) return;
  const frame = e.senderFrame;
  const info = frameInfo(frame);
  if (!info) return;
  const st = stateOf(wc);
  if (!allowed(st, frame, info.main)) return;
  switch (msg.type) {
    case 'focus': return onFocus(st, pid, frame, info, msg);
    case 'blur': return scheduleHide(st);
    case 'username': {
      const username = clip(msg.username, MAX_USER).trim();
      if (username) st.lastUsername = { origin: info.origin, username, at: Date.now() };
      return undefined;
    }
    case 'armed': {
      const password = typeof msg.password === 'string' ? msg.password : '';
      if (!password || password.length > MAX_PASS) return undefined;
      disarm(st);
      st.armed = { pid, origin: info.origin, node: frame.frameTreeNodeId, username: clip(msg.username, MAX_USER).trim(), password, at: Date.now() };
      st.armedTimer = setTimeout(() => disarm(st), limits.armedTtl);
      return undefined;
    }
    case 'gone': {
      const armed = st.armed;
      if (!armed || armed.origin !== info.origin) return undefined;
      disarm(st);
      if (Date.now() - armed.at < limits.armedTtl) offerSave(wc, armed);
      return undefined;
    }
    case 'generated': {
      // Le mot de passe vient de notre mémoire, pas du message.
      const g = st.generated;
      if (!g || g.origin !== info.origin || Date.now() - g.at > 60e3) return undefined;
      st.generated = null;
      offerSave(wc, { pid, origin: info.origin, username: clip(msg.username, MAX_USER).trim(), password: g.password, at: Date.now() });
      return undefined;
    }
    default: return undefined;
  }
}

function numberRect(r) {
  const n = (v) => (Number.isFinite(v) ? Math.max(-1e5, Math.min(1e5, v)) : 0);
  return r && typeof r === 'object' ? { x: n(r.x), y: n(r.y), w: Math.max(0, n(r.w)), h: Math.max(0, n(r.h)) } : { x: 0, y: 0, w: 0, h: 0 };
}

async function onFocus(st, pid, frame, info, msg) {
  if (!settings().passwordFill) return;
  const field = ['username', 'password', 'new-password'].includes(msg.field) ? msg.field : null;
  if (!field) return;
  clearTimeout(st.hideTimer);
  const focus = { token: uid(), pid, frame, origin: info.origin, embedded: info.embedded, topOrigin: info.topOrigin, main: info.main, field, rect: numberRect(msg.rect), wantsPassword: msg.pass === true, hasUser: msg.user === true, at: Date.now() };
  st.focus = focus;
  // Clic droit dans un champ : on retient la cible, le menu contextuel décidera.
  if (msg.menu === true) return;
  const items = [];
  if (field === 'new-password') {
    if (encryptionAvailable()) items.push({ id: 'generate', kind: 'generate' });
  } else {
    const m = await matchesFor(pid, info.origin);
    if (st.focus !== focus) return;
    // Seconde étape d'une connexion en deux temps : le compte vient d'être
    // choisi pour cette même origine dans cet onglet. Rien n'est rempli d'office :
    // la liste se réduit à ce compte, et il faut encore le cliquer.
    const c = st.chosen;
    if (c && Date.now() - c.at > CHOICE_TTL) st.chosen = null;
    else if (c && field === 'password' && !focus.hasUser && c.origin === info.origin && c.frameMain === info.main) {
      const only = m.exact.find((x) => x.id === c.id);
      if (only) { m.exact = [only]; m.related = []; }
    }
    for (const e of m.exact) items.push({ id: e.id, kind: 'exact', label: e.username || t('pw.noUsername'), sub: siteOf(e.origin) });
    for (const e of m.related) items.push({ id: e.id, kind: 'related', label: e.username || t('pw.noUsername'), sub: siteOf(e.origin) });
  }
  if (!items.length) return hidePickerFor(st.wc);
  showPicker(st, focus, items);
}

function fill(st, focus, entry) {
  // Le cadre a pu naviguer entre l'affichage de la liste et le choix.
  const info = frameInfo(focus.frame);
  if (!info || info.origin !== focus.origin) return false;
  const withPassword = focus.wantsPassword || focus.field === 'password';
  const payload = { type: 'fill' };
  payload.username = entry.username;
  if (withPassword) payload.password = entry.password;
  try { focus.frame.send(CHANNEL, payload); } catch { return false; }
  entry.usedAt = Date.now();
  // Identifiant seul (première étape) : le mot de passe suivra à la seconde.
  st.chosen = withPassword ? null : { id: entry.id, origin: focus.origin, frameMain: info.main, at: Date.now() };
  return true;
}

// --- Vues d'Orbe posées sur la page ------------------------------------------
// Fenêtre et vue qui affichent ce webContents, en parcourant les vraies vues :
// aucune dépendance aux structures de window.js.
function locate(wc) {
  for (const win of BaseWindow.getAllWindows()) {
    if (win.isDestroyed() || !win.contentView) continue;
    for (const view of win.contentView.children) {
      if (view.webContents === wc) return { win, view };
    }
  }
  return null;
}

function overlayOf(win) {
  let o = overlays.get(win.id);
  if (!o) {
    o = { win, picker: null, prompt: null, pick: null, pending: null, promptTimer: null };
    const id = win.id; // la fenêtre détruite ne donne plus son identifiant
    overlays.set(id, o);
    win.once('closed', () => {
      clearTimeout(o.promptTimer);
      overlays.delete(id);
      o.pick = null;
      o.pending = null;
      for (const v of [o.picker, o.prompt]) { try { if (v && !v.webContents.isDestroyed()) v.webContents.close(); } catch {} }
    });
    win.on('resize', () => { hidePicker(o); placePrompt(o); });
  }
  return o;
}

function makeView(hash) {
  const view = new WebContentsView({ webPreferences: { preload: env.uiPreload, sandbox: true, contextIsolation: true } });
  view.setBackgroundColor('#00000000');
  const wc = view.webContents;
  env.trusted.add(wc);
  wc.on('will-navigate', (e) => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.loadURL(env.internal + 'pw-overlay.html#' + hash);
  return view;
}

function whenLoaded(view, fn) {
  const wc = view.webContents;
  if (wc.isDestroyed()) return;
  if (wc.isLoading() || !wc.getURL()) wc.once('did-finish-load', fn);
  else fn();
}

// (Sans jamais lever d'erreur : appelé aussi pendant la fermeture d'une fenêtre.)
function detach(o, view) {
  if (!view) return;
  try {
    view.setVisible(false);
    if (!o.win.isDestroyed()) o.win.contentView.removeChildView(view);
  } catch {}
}

function tell(view, payload) {
  try { if (view && !view.webContents.isDestroyed()) view.webContents.send('overlay', payload); } catch {}
}

// La liste s'ouvre sous le champ. La position vient de la page, donc sans
// valeur de preuve : elle est bornée à la vue de l'onglet, et ne recouvre
// jamais l'interface d'Orbe.
function showPicker(st, focus, items, at) {
  const where = locate(st.wc);
  if (!where) return;
  const o = overlayOf(where.win);
  const b = boundsOf(where.view);
  const width = Math.min(320, b.width);
  // Hauteur fixe (la liste défile à l'intérieur) : la taille de la vue ne dit
  // rien du nombre de comptes.
  const height = Math.min(b.height, 218);
  let x;
  let y;
  if (at) {
    x = b.x + at.x;
    y = b.y + at.y;
  } else if (focus.main) {
    const z = st.wc.getZoomFactor();
    x = b.x + focus.rect.x * z - 8;
    y = b.y + (focus.rect.y + focus.rect.h) * z;
    if (y + height > b.y + b.height) y = b.y + focus.rect.y * z - height;
  } else {
    // Champ dans un iframe : sa position dans la page est inconnue ; la liste
    // s'ouvre sous le pointeur.
    const p = screen.getCursorScreenPoint();
    const c = where.win.getContentBounds();
    x = p.x - c.x - 20;
    y = p.y - c.y + 14;
  }
  x = Math.round(Math.max(b.x, Math.min(b.x + b.width - width, x)));
  y = Math.round(Math.max(b.y, Math.min(b.y + b.height - height, y)));
  if (!o.picker) o.picker = makeView('pick');
  o.pick = { wc: st.wc, token: focus.token };
  const view = o.picker;
  whenLoaded(view, () => {
    if (!o.pick || o.pick.token !== focus.token || o.win.isDestroyed()) return;
    view.setBounds({ x, y, width, height });
    o.win.contentView.addChildView(view);
    view.setVisible(true);
    view.webContents.send('overlay', { mode: 'pw-pick', token: focus.token, site: siteOf(focus.origin), embedded: focus.embedded, items });
  });
}

function hidePicker(o) {
  if (!o.pick) return;
  o.pick = null;
  tell(o.picker, { mode: null });
  detach(o, o.picker);
}

function hidePickerFor(wc) {
  for (const o of overlays.values()) if (o.pick && o.pick.wc === wc) hidePicker(o);
}

// Le champ perd le clavier quand on clique la liste (autre vue) : on attend
// un instant, et on ne ferme pas une liste qui a pris le clavier.
function scheduleHide(st) {
  clearTimeout(st.hideTimer);
  st.hideTimer = setTimeout(() => {
    for (const o of overlays.values()) {
      if (!o.pick || o.pick.wc !== st.wc) continue;
      let focused = false;
      try { focused = !!o.picker && !o.picker.webContents.isDestroyed() && o.picker.webContents.isFocused(); } catch {}
      if (focused) continue;
      hidePicker(o);
    }
  }, 220);
}

async function onPick(sender, a) {
  const o = [...overlays.values()].find((x) => x.picker && x.picker.webContents === sender);
  if (!o || !o.pick || !a || a.token !== o.pick.token) return false;
  const wc = o.pick.wc;
  const st = states.get(wc.id);
  hidePicker(o);
  if (!st || !st.focus || st.focus.token !== a.token || wc.isDestroyed()) return false;
  const focus = st.focus;
  const back = () => { if (!wc.isDestroyed()) wc.focus(); };
  if (a.id === 'manage') { openManager(); return true; }
  if (a.id === 'close') { back(); return true; }
  if (a.id === 'dismiss') return true;
  if (a.id === 'generate') {
    if (focus.field !== 'new-password' || !encryptionAvailable()) return false;
    const info = frameInfo(focus.frame);
    if (!info || info.origin !== focus.origin) return false;
    const password = generate();
    st.generated = { origin: focus.origin, password, at: Date.now() };
    try { focus.frame.send(CHANNEL, { type: 'generated', password }); } catch { return false; }
    back();
    return true;
  }
  const m = await matchesFor(focus.pid, focus.origin);
  const exact = m.exact.find((e) => e.id === a.id);
  const entry = exact || m.related.find((e) => e.id === a.id);
  if (!entry) return false;
  // Autre sous-domaine, ou formulaire inclus dans la page d'un autre site :
  // jamais sans une confirmation qui nomme les deux origines.
  if (!exact || focus.embedded) {
    const detail = focus.embedded
      ? t('pw.confirmEmbedded', { saved: siteOf(entry.origin), here: siteOf(focus.origin), top: siteOf(focus.topOrigin) })
      : t('pw.confirmRelated', { saved: siteOf(entry.origin), here: siteOf(focus.origin) });
    const ok = await hooks.confirm(o.win, { type: 'warning', message: t('pw.confirmTitle', { here: siteOf(focus.origin) }), detail, buttons: [t('pw.fill'), t('pw.cancel')], defaultId: 1, cancelId: 1 });
    if (!ok || st.focus !== focus) { back(); return false; }
  }
  const done = fill(st, focus, entry);
  back();
  return done;
}

// --- Proposition d'enregistrement --------------------------------------------
function offerSave(wc, cand) {
  if (wc.isDestroyed() || !settings().passwordSave || !profiles.get(wc.session)) return;
  if (!open()) return;
  const st = states.get(wc.id);
  const b = bucket(cand.pid);
  if (b.never.includes(cand.origin)) return;
  let username = cand.username;
  if (!username && st && st.lastUsername && st.lastUsername.origin === cand.origin && Date.now() - st.lastUsername.at < USERNAME_TTL) username = st.lastUsername.username;
  const here = b.entries.filter((e) => e.origin === cand.origin);
  // Déjà connu tel quel : rien à proposer.
  if (here.some((e) => e.password === cand.password && (!username || e.username === username))) return;
  const existing = username ? here.find((e) => e.username === username) : null;
  const where = locate(wc);
  if (!where) return;
  const o = overlayOf(where.win);
  o.pending = { wc, token: uid(), pid: cand.pid, origin: cand.origin, username, password: cand.password, update: !!existing, expires: Date.now() + PROMPT_TTL };
  clearTimeout(o.promptTimer);
  o.promptTimer = setTimeout(() => closePrompt(o), PROMPT_TTL);
  if (!o.prompt) o.prompt = makeView('save');
  const pending = o.pending;
  whenLoaded(o.prompt, () => {
    if (o.pending !== pending || o.win.isDestroyed()) return;
    placePrompt(o);
    o.prompt.webContents.send('overlay', { mode: 'pw-save', token: pending.token, site: siteOf(pending.origin), username: pending.username, update: pending.update });
  });
}

function placePrompt(o) {
  if (!o.pending || !o.prompt || o.win.isDestroyed()) return;
  const where = locate(o.pending.wc);
  if (!where || where.win !== o.win) return detach(o, o.prompt);
  const b = boundsOf(where.view);
  const width = Math.min(372, b.width);
  const height = Math.min(168, b.height);
  o.prompt.setBounds({ x: b.x + b.width - width - 4, y: b.y + 4, width, height });
  o.win.contentView.addChildView(o.prompt);
  o.prompt.setVisible(true);
  return undefined;
}

function closePrompt(o) {
  clearTimeout(o.promptTimer);
  o.pending = null; // le mot de passe en attente quitte la mémoire
  tell(o.prompt, { mode: null });
  detach(o, o.prompt);
}

function onPrompt(sender, a) {
  const o = [...overlays.values()].find((x) => x.prompt && x.prompt.webContents === sender);
  if (!o || !o.pending || !a || a.token !== o.pending.token) return false;
  const p = o.pending;
  closePrompt(o);
  if (!p.wc.isDestroyed()) p.wc.focus();
  if (a.choice === 'never') return setNever(p.pid, p.origin, true);
  if (a.choice !== 'save') return true;
  // L'identifiant peut avoir été corrigé dans la proposition.
  const username = typeof a.username === 'string' ? a.username : p.username;
  const res = save(p.pid, { origin: p.origin, username, password: p.password });
  env.toast(p.wc, t(res ? (res.result === 'created' ? 'pw.saved' : 'pw.updated') : 'pw.saveFailed'));
  refreshManager();
  return !!res;
}

// Onglet changé, barre latérale déplacée… : les vues suivent ou se retirent.
function sync() {
  for (const o of overlays.values()) {
    if (o.win.isDestroyed()) continue;
    if (o.pick) {
      const where = locate(o.pick.wc);
      if (!where || where.win !== o.win) hidePicker(o);
    }
    if (o.pending) placePrompt(o);
  }
}

// Élément du menu contextuel d'un champ : secours quand le formulaire n'a pas
// été reconnu. La cible est le champ sous le clic droit.
function contextMenuItems(wc, params) {
  if (!params || !params.isEditable || !settings().passwordFill) return [];
  if (!profiles.get(wc.session) || !/^input-(text|email|password|telephone|url)$/.test(params.formControlType || '')) return [];
  const info = frameInfo(params.frame);
  if (!info) return [];
  return [{
    label: t('pw.menuFill'),
    click: async () => {
      const st = states.get(wc.id);
      const focus = st && st.focus;
      if (!focus || focus.origin !== info.origin || Date.now() - focus.at > 60e3) return;
      const m = await matchesFor(focus.pid, focus.origin);
      const items = [
        ...m.exact.map((e) => ({ id: e.id, kind: 'exact', label: e.username || t('pw.noUsername'), sub: siteOf(e.origin) })),
        ...m.related.map((e) => ({ id: e.id, kind: 'related', label: e.username || t('pw.noUsername'), sub: siteOf(e.origin) })),
      ];
      if (!items.length) { env.toast(wc, t('pw.none', { site: siteOf(focus.origin) })); return; }
      showPicker(st, focus, items, { x: params.x, y: params.y + 8 });
    },
  }];
}

// --- Fenêtre « Mots de passe » -----------------------------------------------
function openManager() {
  if (manager && !manager.isDestroyed()) { manager.focus(); return manager; }
  manager = new BrowserWindow({
    width: 680,
    height: 680,
    minWidth: 520,
    minHeight: 420,
    fullscreenable: false,
    ...platform.windowChrome({ inset: true, dark: nativeTheme.shouldUseDarkColors }),
    show: false,
    webPreferences: { preload: env.uiPreload, sandbox: true, contextIsolation: true },
  });
  env.trusted.add(manager.webContents);
  manager.webContents.on('will-navigate', (e) => e.preventDefault());
  manager.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  manager.loadURL(env.internal + 'passwords.html');
  manager.once('ready-to-show', () => manager.show());
  manager.on('closed', () => { manager = null; authUntil = 0; });
  return manager;
}

function refreshManager() {
  if (manager && !manager.isDestroyed()) manager.webContents.send('settings', store.state.settings);
}

function managerState(pid) {
  const usable = open();
  const b = usable ? bucket(pid) : { entries: [], never: [] };
  return {
    status: status(),
    profile: pid,
    profiles: store.state.profiles.map((p) => ({ id: p.id, name: p.name })),
    entries: b.entries.map(publicEntry).sort((x, y) => x.site.localeCompare(y.site) || x.username.localeCompare(y.username)),
    never: b.never.map((origin) => ({ origin, site: siteOf(origin) })),
  };
}

// Actions de l'interface (canal `orbe`, déjà réservé aux pages orbe:// de
// confiance). Les actions sensibles n'obéissent qu'à la fenêtre du gestionnaire.
async function action(name, a, sender) {
  if (name === 'pw:open') { openManager(); return true; }
  if (name === 'pw:pick') return onPick(sender, a);
  if (name === 'pw:prompt') return onPrompt(sender, a);
  if (!manager || manager.isDestroyed() || sender !== manager.webContents) return undefined;
  const p = a && typeof a === 'object' ? a : {};
  const pid = store.state.profiles.some((x) => x.id === p.profile) ? p.profile : 'default';
  const entry = () => (open() ? bucket(pid).entries.find((e) => e.id === p.id) : null);
  switch (name) {
    case 'pw:state':
      return managerState(pid);
    case 'pw:reveal': {
      const e = entry();
      if (!e || !(await authenticate(t('pw.authReveal'), manager))) return null;
      return e.password;
    }
    case 'pw:copy': {
      const e = entry();
      if (!e) return false;
      if (p.what === 'username') { await clipboard.writeText(e.username); return true; }
      if (!(await authenticate(t('pw.authCopy'), manager))) return false;
      await copySecret(e.password);
      return true;
    }
    case 'pw:save': {
      if (!open()) return { error: t('pw.unavailable') };
      const e = entry();
      if (p.id && !e) return { error: t('pw.saveFailed') };
      const origin = e ? e.origin : originOf(p.url);
      if (!origin) return { error: t('pw.badUrl') };
      const username = clip(p.username, MAX_USER).trim();
      const password = typeof p.password === 'string' && p.password ? clip(p.password, MAX_PASS) : (e ? e.password : '');
      if (!password) return { error: t('pw.needPassword') };
      const b = bucket(pid);
      if (b.entries.some((x) => x !== e && x.origin === origin && x.username === username)) return { error: t('pw.duplicate') };
      if (e) {
        e.username = username;
        e.password = password;
        if (typeof p.note === 'string') e.note = clip(p.note, 4000);
        e.updatedAt = Date.now();
        if (!write()) return { error: t('pw.saveFailed') };
      } else if (!save(pid, { origin, username, password, note: typeof p.note === 'string' ? p.note : undefined })) return { error: t('pw.saveFailed') };
      return managerState(pid);
    }
    case 'pw:delete':
      remove(pid, String(p.id));
      return managerState(pid);
    case 'pw:neverRemove':
      setNever(pid, String(p.origin), false);
      return managerState(pid);
    case 'pw:generate':
      return generate();
    case 'pw:import':
      return importDialog(pid);
    case 'pw:export':
      return exportDialog(pid);
    case 'pw:reset':
      return resetVault(pid);
    default:
      return undefined;
  }
}

async function importDialog(pid) {
  if (!open()) return { error: t('pw.unavailable') };
  const r = await dialog.showOpenDialog(manager, { title: t('pw.import'), properties: ['openFile'], filters: [{ name: 'CSV', extensions: ['csv'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const file = r.filePaths[0];
  let text = '';
  try {
    if (fs.statSync(file).size > 20e6) throw new Error('trop gros');
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { error: t('pw.importBad') };
  }
  const count = importCsv(pid, text);
  if (!count) return { error: t('pw.importBad') };
  // Le fichier importé contient tout en clair : proposer de s'en débarrasser.
  const trash = await hooks.confirm(manager, {
    type: 'warning',
    message: t('pw.importDone', { n: count.created + count.updated, skipped: count.skipped }),
    detail: t('pw.importPlain', { file: path.basename(file) }),
    buttons: [t('pw.trashFile'), t('pw.keepFile')],
    defaultId: 0,
    cancelId: 1,
  });
  if (trash) await shell.trashItem(file).catch(() => {});
  return { count, state: managerState(pid) };
}

async function exportDialog(pid) {
  if (!open()) return { error: t('pw.unavailable') };
  // Tout le coffre en clair : toujours une nouvelle confirmation d'identité.
  if (!(await authenticate(t('pw.authExport'), manager, { fresh: true }))) return null;
  const sure = await hooks.confirm(manager, { type: 'warning', message: t('pw.exportTitle'), detail: t('pw.exportPlain'), buttons: [t('pw.export'), t('pw.cancel')], defaultId: 1, cancelId: 1 });
  if (!sure) return null;
  const r = await dialog.showSaveDialog(manager, { title: t('pw.export'), defaultPath: path.join(app.getPath('documents'), 'Mots de passe Orbe.csv'), filters: [{ name: 'CSV', extensions: ['csv'] }] });
  if (r.canceled || !r.filePath) return null;
  try {
    fs.writeFileSync(r.filePath, exportCsv(pid), { mode: 0o600 });
  } catch {
    return { error: t('pw.saveFailed') };
  }
  return { file: path.basename(r.filePath) };
}

// Coffre illisible : on le met de côté (jamais supprimé) pour repartir de zéro.
async function resetVault(pid) {
  if (vault.status !== 'error') return managerState(pid);
  const ok = await hooks.confirm(manager, { type: 'warning', message: t('pw.resetTitle'), detail: t('pw.resetDetail'), buttons: [t('pw.reset'), t('pw.cancel')], defaultId: 1, cancelId: 1 });
  if (!ok) return managerState(pid);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const f of [vault.file, vault.file + '.bak']) { try { fs.renameSync(f, `${f}.illisible-${stamp}`); } catch {} }
  vault.status = 'closed';
  vault.data = null;
  vault.lastGood = false;
  return managerState(pid);
}

// --- Mise en place -----------------------------------------------------------
// Équipe une session de profil. Les sessions de navigation privée ne passent
// jamais ici : ni script de page, ni proposition, ni remplissage.
function attach(ses, profileId) {
  if (!ses || profiles.has(ses)) return;
  profiles.set(ses, profileId || 'default');
  ses.registerPreloadScript({ type: 'frame', filePath: PAGE_PRELOAD, id: 'orbe-pw' });
  if (ipcReady) return;
  ipcReady = true;
  ipcMain.on(CHANNEL, (e, msg) => { onPageMessage(e, msg).catch(() => {}); });
  // Un mot de passe copié ne survit pas à la fermeture d'Orbe.
  app.on('before-quit', (e) => {
    if (!clipboardSecret) return;
    e.preventDefault();
    clearClipboardIfOurs().finally(() => app.quit());
  });
}

function configure(options) {
  Object.assign(env, options);
}

module.exports = {
  attach, configure, action, sync, contextMenuItems, openManager, forgetProfile, hooks,
  // Pour les tests et l'import.
  save, remove, setNever, matchesFor, relation, registrable, importCsv, importList, exportCsv, parseCsv, generate, originOf, status, encryptionAvailable,
  internals: { vault, states, overlays, limits, allowed, CHOICE_TTL, copySecret, clearClipboardIfOurs, authenticate, open, bucket, get manager() { return manager; } },
};
