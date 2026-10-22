// Import depuis Arc, seconde partie : ce que chaque profil d'Arc garde dans son dossier
// Chromium — l'historique, les mots de passe enregistrés et les cookies (les connexions
// aux sites). La première partie (Espaces, dossiers, onglets, favoris) est import-arc.js.
//
// Ce que ce module lit est sensible : il ne tourne que sur un geste de l'utilisateur
// (commande « importArcData », après une fenêtre qui dit ce qui sera lu), et jamais
// pendant un essai sur les vrais profils (`env.root` est vide en mode test).
//
// Règles tenues ici, à relire avant d'y toucher (voir aussi docs/mots-de-passe.md) :
//  - Arc n'est jamais modifié : chaque base est COPIÉE dans un dossier temporaire privé
//    (0700), lue par le `sqlite3` du système en lecture seule, puis la copie est effacée.
//  - La clé qui déchiffre les mots de passe et les cookies d'Arc est dans le trousseau
//    de macOS (« Arc Safe Storage »). Orbe n'a pas de module natif : il la demande par
//    l'outil du système `/usr/bin/security`, donc c'est « security » que la fenêtre de macOS
//    nomme, pas Orbe. « Toujours autoriser » y laisserait l'accès ouvert à tout programme du
//    compte : la fenêtre d'Orbe l'explique avant, le bilan le redit si l'accès est resté
//    ouvert (relecture de sécurité, constat H1 ; voir docs/mots-de-passe.md). La clé dérivée
//    est effacée à la fin ; le secret lu et les mots de passe sont des chaînes JavaScript, que
//    rien ne permet d'effacer. Sans la clé, seul l'historique (en clair chez Arc) est repris.
//  - Tout ce qui est lu est une donnée étrangère — un autre programme du compte a pu écrire
//    dans ces bases sans connaître la clé : tailles et nombres bornés dès la requête, adresses
//    http(s) seulement, champs revérifiés. Un cookie n'entre que chiffré ET lié à son hôte par
//    l'empreinte que Chromium y met (base en version 24 au moins) : en clair, sans empreinte,
//    ou déplacé d'un autre site, il est rejeté. Un mot de passe n'entre que si son adresse et
//    son domaine d'authentification disent le même site. Aucun texte lu n'est exécuté ni passé
//    à un interpréteur de commandes.
//  - Les mots de passe entrent par le coffre d'Orbe (passwords.js, chiffré, par profil),
//    les cookies par la session Chromium du profil : rien n'est gardé ailleurs.
//  - macOS seulement : sous Windows, Arc chiffre avec une clé liée à son propre programme.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const MAX_DB = 600 * 1024 * 1024; // une base plus grosse n'est pas lue
const MAX_HISTORY = 20000; // adresses par profil, les plus récentes
const MAX_LOGINS = 5000;
const MAX_COOKIES = 30000;
const MAX_PROFILES = 40;
const MAX_VALUE = 4096; // un cookie plus long que ce que Chromium accepte est ignoré
const MAX_BLOB = 2 * MAX_VALUE + 64; // octets d'une valeur chiffrée (en-tête + bourrage) : au-delà, la ligne est écartée dès la requête
const COOKIE_DB_HASHED = 24; // version de la base Cookies d'où le clair porte l'empreinte de l'hôte
const SQLITE_TIMEOUT = 20000;
const KEY_TIMEOUT = 120000; // le temps de lire la demande de macOS et de taper son mot de passe
// Chromium compte en microsecondes depuis le 1er janvier 1601.
const EPOCH_GAP_MS = 11644473600000;
const fromChromeTime = (t) => (Number(t) > 0 ? Math.round(Number(t) / 1000 - EPOCH_GAP_MS) : 0);

// `root` : dossier « User Data » d'Arc ('' : rien n'est lu). `sqlite`, `security` : outils du
// système. `key` : remplace la demande au trousseau (essais). Posés par configure().
const env = { root: '', sqlite: '/usr/bin/sqlite3', security: '/usr/bin/security', key: null, tmp: os.tmpdir() };
function configure(o) {
  Object.assign(env, o);
}

// Profils d'Arc présents : « default » (dossier « Default ») et « Profile N ».
function profiles() {
  if (!env.root) return [];
  let names = [];
  try { names = fs.readdirSync(env.root); } catch { return []; }
  return names
    .filter((n) => n === 'Default' || /^Profile \d{1,4}$/.test(n))
    .slice(0, MAX_PROFILES)
    .map((n) => ({ key: n === 'Default' ? 'default' : n, dir: path.join(env.root, n) }))
    .filter((p) => { try { return fs.statSync(p.dir).isDirectory(); } catch { return false; } });
}

const available = () => profiles().length > 0;

function run(file, args, { timeout, maxBuffer = 256 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, maxBuffer, encoding: 'utf8', windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

// Copie une base d'Arc (et son journal, s'il y en a un) dans un dossier privé, lance la
// requête en lecture seule, efface la copie. Rend les lignes (tableau d'objets), ou [].
async function query(dir, name, sql) {
  const src = path.join(dir, name);
  let size = 0;
  try { size = fs.statSync(src).size; } catch { return []; }
  if (!size || size > MAX_DB || !env.sqlite || !fs.existsSync(env.sqlite)) return [];
  const tmp = fs.mkdtempSync(path.join(env.tmp, 'orbe-arc-'));
  try {
    fs.chmodSync(tmp, 0o700);
    const copy = path.join(tmp, 'base.db');
    fs.copyFileSync(src, copy);
    for (const ext of ['-wal', '-journal']) { try { if (fs.statSync(src + ext).size) fs.copyFileSync(src + ext, copy + ext); } catch {} }
    // `-init /dev/null` : ignore le ~/.sqliterc de l'utilisateur (un `.echo`/`.shell` y casserait
    // la lecture, voire exécuterait une commande). `immutable=1` : la copie est tenue pour figée,
    // ce qui évite le verrou et lit une base en mode WAL même sans son fichier `-wal`.
    const out = await run(env.sqlite, ['-init', '/dev/null', '-readonly', '-json', `file:${copy}?immutable=1`, sql], { timeout: SQLITE_TIMEOUT });
    const rows = out.trim() ? JSON.parse(out) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

// Ce qu'il y a à reprendre, sans rien déchiffrer : des nombres, pour la fenêtre de confirmation.
// `keys` (facultatif) : ne compter que ces profils d'Arc (ceux qui ont un profil d'Orbe).
async function survey(keys = null) {
  const out = { profiles: 0, history: 0, logins: 0, cookies: 0 };
  for (const p of profiles()) {
    if (keys && !keys.has(p.key)) continue;
    out.profiles += 1;
    const n = async (name, sql) => { const r = await query(p.dir, name, sql); return r[0] ? Number(r[0].n) || 0 : 0; };
    out.history += Math.min(MAX_HISTORY, await n('History', 'select count(*) as n from urls where hidden = 0'));
    out.logins += Math.min(MAX_LOGINS, await n('Login Data', 'select count(*) as n from logins where blacklisted_by_user = 0'));
    out.cookies += Math.min(MAX_COOKIES, await n('Cookies', 'select count(*) as n from cookies'));
  }
  return out;
}

// --- Clé d'Arc -------------------------------------------------------------------
// Le mot de passe « Arc Safe Storage » du trousseau, dérivé comme Chromium le fait sur
// macOS (PBKDF2-SHA1, sel « saltysalt », 1003 tours, 16 octets). Rend null si
// l'utilisateur refuse, ou si l'entrée n'existe pas.
async function readKey() {
  // Sans vrai dossier d'Arc (mode test, ou Arc absent), on ne touche jamais au trousseau.
  if (!env.root) return null;
  let secret = '';
  try {
    if (env.key) secret = await env.key();
    else if (env.security && fs.existsSync(env.security)) secret = (await run(env.security, ['find-generic-password', '-w', '-s', 'Arc Safe Storage', '-a', 'Arc'], { timeout: KEY_TIMEOUT, maxBuffer: 64 * 1024 })).replace(/\r?\n$/, '');
  } catch {
    return null;
  }
  if (!secret) return null;
  return crypto.pbkdf2Sync(Buffer.from(secret, 'utf8'), 'saltysalt', 1003, 16, 'sha1');
}

// Valeur chiffrée par Chromium sur macOS : « v10 » + AES-128-CBC (vecteur : 16 espaces).
// `host` (cookies récents) : le clair commence par l'empreinte SHA-256 de l'hôte, qui doit
// coller — sinon la valeur a été déplacée d'un site à un autre, et elle est rejetée.
function decrypt(hex, key, host) {
  if (!key || typeof hex !== 'string' || hex.length < 6 || hex.length > MAX_VALUE * 8) return null;
  const buf = Buffer.from(hex, 'hex');
  if (buf.subarray(0, 3).toString('latin1') !== 'v10' || (buf.length - 3) % 16 !== 0 || buf.length === 3) return null;
  let plain;
  try {
    const d = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20));
    plain = Buffer.concat([d.update(buf.subarray(3)), d.final()]);
  } catch {
    return null;
  }
  if (host != null) {
    if (plain.length < 32 || !crypto.createHash('sha256').update(String(host)).digest().equals(plain.subarray(0, 32))) return null;
    plain = plain.subarray(32);
  }
  // Une mauvaise clé donne presque toujours un remplissage faux (rejeté plus haut) ; sinon,
  // des octets au hasard : ce qui n'est pas un texte propre n'est pas une valeur.
  const text = plain.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(plain) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) return null;
  return text;
}

// --- Historique (en clair chez Arc) -------------------------------------------------
async function readHistory(dir) {
  const rows = await query(dir, 'History', `select url, title, visit_count as visits, last_visit_time as last from urls where hidden = 0 order by last_visit_time desc limit ${MAX_HISTORY}`);
  const out = [];
  for (const r of rows) {
    const url = typeof r.url === 'string' ? r.url : '';
    if (!/^https?:\/\//i.test(url) || url.length > 2000) continue;
    const last = fromChromeTime(r.last);
    if (!last || last > Date.now() + 86400e3) continue;
    out.push({ url, title: typeof r.title === 'string' ? r.title.slice(0, 300) : '', visits: Math.max(1, Math.min(1e6, Number(r.visits) || 1)), last });
  }
  return out;
}

// --- Mots de passe enregistrés --------------------------------------------------------
// Origine (schéma + hôte + port) d'une adresse http(s), sinon ''. Sert à vérifier que
// l'adresse et le domaine d'authentification d'un mot de passe disent bien le même site.
function originOf(u) {
  try { const x = new URL(String(u || '')); return /^https?:$/.test(x.protocol) && x.hostname ? x.origin : ''; } catch { return ''; }
}

async function readLogins(dir, key) {
  if (!key) return { list: [], unreadable: 0 };
  const rows = await query(dir, 'Login Data', `select origin_url as origin, signon_realm as realm, username_value as username, hex(password_value) as secret from logins where blacklisted_by_user = 0 and length(password_value) <= ${MAX_BLOB} limit ${MAX_LOGINS}`);
  const list = [];
  let unreadable = 0;
  for (const r of rows) {
    const origin = originOf(r.origin);
    if (!origin) continue; // applications Android, formulaires locaux…
    // Le domaine d'authentification doit désigner le même site que l'adresse : sinon la ligne a
    // été trafiquée (adresse d'un site pirate posée sur le mot de passe d'un autre). Un realm qui
    // n'est pas une URL (authentification HTTP « host:port/realm ») ne peut pas déplacer l'origine.
    const realmOrigin = originOf(r.realm);
    if (realmOrigin && realmOrigin !== origin) { unreadable += 1; continue; }
    const password = decrypt(r.secret, key);
    if (!password) { unreadable += 1; continue; }
    list.push({ origin, username: typeof r.username === 'string' ? r.username : '', password });
  }
  return { list, unreadable };
}

// --- Cookies (les connexions) -----------------------------------------------------------
const SAME_SITE = { 0: 'no_restriction', 1: 'lax', 2: 'strict' };
const HOST = /^\.?[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i;
const NAME = /^[\x21-\x7e]{1,255}$/; // un nom de cookie : caractères visibles, sans espace

// Rend des objets prêts pour `session.cookies.set`. Les cookies expirés, cloisonnés par site
// (CHIPS : ils ne valent que sous un site de premier plan donné), illisibles ou mal formés
// sont comptés à part.
async function readCookies(dir, key) {
  if (!key) return { list: [], skipped: 0 };
  const meta = await query(dir, 'Cookies', "select value from meta where key = 'version'");
  // Sans l'empreinte d'hôte (base d'avant la version 24), un cookie chiffré pourrait venir d'un
  // autre site, ou être une valeur de « Login Data » recopiée : on ne reprend alors aucun cookie.
  if (!(meta[0] && Number(meta[0].value) >= COOKIE_DB_HASHED)) return { list: [], skipped: 0, tooOld: true };
  const rows = await query(dir, 'Cookies', `select host_key as host, name, hex(encrypted_value) as secret, path, expires_utc as expires, is_secure as secure, is_httponly as httponly, has_expires as dated, samesite, top_frame_site_key as partition from cookies where length(encrypted_value) between 6 and ${MAX_BLOB} order by last_access_utc desc limit ${MAX_COOKIES}`);
  const list = [];
  let skipped = 0;
  const now = Date.now();
  for (const r of rows) {
    const host = typeof r.host === 'string' ? r.host : '';
    const name = typeof r.name === 'string' ? r.name : '';
    const p = typeof r.path === 'string' && r.path.startsWith('/') && r.path.length <= 1024 ? r.path : '';
    const expires = Number(r.dated) ? fromChromeTime(r.expires) : 0;
    if (!HOST.test(host) || !NAME.test(name) || !p || r.partition || (Number(r.dated) && expires <= now)) { skipped += 1; continue; }
    // Jamais la colonne `value` en clair : un cookie n'entre que déchiffré et lié à son hôte.
    const value = decrypt(r.secret, key, host);
    if (value == null || value.length > MAX_VALUE || /[\x00-\x1f\x7f;]/.test(value)) { skipped += 1; continue; }
    const secure = !!Number(r.secure);
    const bare = host.replace(/^\./, '');
    const c = { url: `${secure ? 'https' : 'http'}://${bare}${p}`, name, value, path: p, secure, httpOnly: !!Number(r.httponly) };
    if (host.startsWith('.')) c.domain = host; // cookie de domaine ; sinon il reste propre à l'hôte
    if (expires) c.expirationDate = Math.round(expires / 1000);
    if (SAME_SITE[r.samesite]) c.sameSite = SAME_SITE[r.samesite];
    list.push(c);
  }
  return { list, skipped };
}

// --- Import ------------------------------------------------------------------------------
// `targets` : clé de profil Arc → { pid, session } d'Orbe (un profil d'Arc sans profil d'Orbe
// n'est pas repris). `sinks` : où ranger ({ history(list), logins(pid, list) → décompte }).
// `want` : { history, logins, cookies }. Rend le décompte ; `noKey` si le trousseau a refusé.
async function importAll({ targets, sinks, want }) {
  const done = { profiles: 0, history: 0, logins: 0, cookies: 0, skipped: 0, noKey: false };
  const mine = profiles().filter((p) => targets.get(p.key)); // seuls les profils d'Arc qui ont un profil d'Orbe
  const wantSecrets = !!(want.logins || want.cookies);
  // La clé d'Arc (donc la demande de macOS) n'est lue que s'il y a bien un profil à reprendre.
  const key = wantSecrets && mine.length ? await readKey() : null;
  if (wantSecrets && mine.length && !key) done.noKey = true;
  try {
    for (const p of mine) {
      const target = targets.get(p.key);
      done.profiles += 1;
      if (want.history) done.history += sinks.history(await readHistory(p.dir));
      if (want.logins && key) {
        const { list, unreadable } = await readLogins(p.dir, key);
        done.skipped += unreadable;
        const count = list.length ? sinks.logins(target.pid, list) : null;
        if (count) { done.logins += count.created + count.updated + count.same; done.skipped += count.skipped; }
        else done.skipped += list.length;
        for (const e of list) e.password = ''; // plus rien en clair ici
      }
      if (want.cookies && key && target.session) {
        const { list, skipped } = await readCookies(p.dir, key);
        done.skipped += skipped;
        for (const c of list) {
          try { await target.session.cookies.set(c); done.cookies += 1; } catch { done.skipped += 1; }
          c.value = '';
        }
        try { await target.session.cookies.flushStore(); } catch {}
      }
    }
  } finally {
    if (key) key.fill(0);
  }
  return done;
}

module.exports = { env, configure, available, profiles, survey, readKey, decrypt, readHistory, readLogins, readCookies, importAll, fromChromeTime };
