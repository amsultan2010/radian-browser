// Extensions Chrome : installation depuis le Chrome Web Store et chargement
// dans les sessions des profils.
//
// Chemin d'une installation :
//   1. téléchargement du fichier CRX (sans compte Google) ;
//   2. lecture de l'en-tête CRX3 et vérification des signatures (voir plus bas
//      ce qui est garanti et ce qui ne l'est pas) ;
//   3. décompression du ZIP dans un dossier neuf, avec garde-fous ;
//   4. réinjection de la clé publique dans manifest.json (`key`), sans quoi
//      l'extension dépaquetée changerait d'identifiant ;
//   5. bascule atomique : `state.json` désigne le dossier de la version
//      courante, l'ancienne version n'est supprimée qu'ensuite.
//
// Ce qui est vérifié à l'installation :
//   - l'identifiant demandé est bien celui que donne la clé publique du
//     développeur (SHA-256, 16 premiers octets, écrits de « a » à « p ») ;
//   - TOUTES les signatures de l'en-tête (RSA et ECDSA, SHA-256) portent sur
//     l'archive reçue : l'archive n'a pas été modifiée depuis sa signature ;
//   - l'une de ces signatures est celle du Chrome Web Store (clé de
//     publication de Google, reconnue par son empreinte) : le fichier est bien
//     passé par le Store. Exigé par défaut, voir `requireStoreSignature`.
// Ce qui ne l'est PAS :
//   - le contenu de l'extension (aucune analyse, aucune liste noire) ;
//   - l'intégrité après installation : `_metadata/verified_contents.json`
//     n'est pas conservé (Chromium refuse un dossier dépaqueté qui contient
//     `_metadata`), donc un fichier modifié sur le disque ne sera pas détecté ;
//   - les autorisations : c'est à l'interface de les montrer avant d'installer.
//
// Ce module n'exécute jamais rien de ce qu'il extrait : il se contente de
// passer le dossier à Electron (`session.extensions.loadExtension`).
//
// Il ne dépend pas d'Electron : les sessions sont passées par l'appelant, si
// bien que la logique se teste avec Node seul (tests/extensions.test.js).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const ID_RE = /^[a-p]{32}$/;
const STORE_HOSTS = new Set(['chromewebstore.google.com', 'chrome.google.com']);
const STATE_FILE = 'state.json';
const DOWNLOAD_MAX = 256 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 120000;
const DEFAULT_LIMITS = { maxFiles: 20000, maxBytes: 512 * 1024 * 1024, maxEntryBytes: 256 * 1024 * 1024 };

// Empreinte SHA-256 de la clé de publication du Chrome Web Store (valeur de
// `kPublisherKeyHash` dans components/crx_file/crx_verifier.cc de Chromium).
const STORE_KEY_HASH = '61f7f2a6bfcf74cd0bc1fe2497cc9b04254c658f79f2145392867ea8366367cf';

let dir = null; // dossier des extensions (<userData>/Extensions)
let fetchImpl = null;
let lang = 'fr';
let requireStoreSignature = true;
let limits = { ...DEFAULT_LIMITS };
let state = null; // { version, extensions: { id: { enabled, current, installedAt } } }

const sessions = []; // WeakRef des sessions passées à loadInto()
const queues = new WeakMap(); // session -> promesse : une synchronisation à la fois
const installing = new Map(); // id -> promesse d'installation en cours

// Erreur portant un code stable, pour que l'interface puisse la traduire.
function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function configure(options = {}) {
  if (options.dir) {
    dir = path.resolve(options.dir);
    state = null;
  }
  if ('fetch' in options) fetchImpl = options.fetch || null;
  if (typeof options.lang === 'string' && options.lang) lang = options.lang;
  if ('requireStoreSignature' in options) requireStoreSignature = options.requireStoreSignature !== false;
  if (options.limits) limits = { ...DEFAULT_LIMITS, ...options.limits };
}

function needDir() {
  if (!dir) throw fail('EXT_NOT_CONFIGURED', 'extensions.configure({ dir }) doit être appelé d\'abord');
  return dir;
}

// --- Identifiants -----------------------------------------------------------

// Identifiant d'extension à partir d'une saisie : adresse du Chrome Web Store
// (nouvelle ou ancienne forme, avec ou sans « https:// ») ou identifiant nu.
function parseStoreInput(text) {
  if (typeof text !== 'string') return null;
  const raw = text.trim();
  if (ID_RE.test(raw)) return raw;
  if (!raw || /\s/.test(raw)) return null;
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!STORE_HOSTS.has(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const at = parts.indexOf('detail');
  if (at === -1) return null;
  if (url.hostname.toLowerCase() === 'chrome.google.com' && parts[0] !== 'webstore') return null;
  // .../detail/<nom>/<id> ou .../detail/<id>
  for (const part of parts.slice(at + 1, at + 3)) if (ID_RE.test(part)) return part;
  return null;
}

// Identifiant Chrome d'une clé publique (DER, SubjectPublicKeyInfo).
function idFromHash(bytes) {
  let out = '';
  for (let i = 0; i < 16; i++) out += String.fromCharCode(97 + (bytes[i] >> 4), 97 + (bytes[i] & 15));
  return out;
}
const idFromPublicKey = (key) => idFromHash(crypto.createHash('sha256').update(key).digest());

// --- Lecture du format CRX3 -------------------------------------------------

// Lecteur protobuf minimal : renvoie les champs d'un message, dans l'ordre.
// Seuls les types de fil 0, 1, 2 et 5 existent encore ; tout autre est refusé.
function readProto(buf) {
  const fields = [];
  let pos = 0;
  const varint = () => {
    let value = 0;
    let scale = 1;
    for (let i = 0; i < 10; i++) {
      if (pos >= buf.length) throw fail('EXT_BAD_CRX', 'En-tête CRX tronqué');
      const byte = buf[pos++];
      value += (byte & 0x7f) * scale;
      if (!(byte & 0x80)) return value;
      scale *= 128;
    }
    throw fail('EXT_BAD_CRX', 'Entier protobuf invalide');
  };
  while (pos < buf.length) {
    const tag = varint();
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (wire === 0) fields.push({ field, wire, value: varint() });
    else if (wire === 2) {
      const len = varint();
      if (len > buf.length - pos) throw fail('EXT_BAD_CRX', 'En-tête CRX tronqué');
      fields.push({ field, wire, value: buf.subarray(pos, pos + len) });
      pos += len;
    } else if (wire === 1 || wire === 5) {
      const len = wire === 1 ? 8 : 4;
      if (len > buf.length - pos) throw fail('EXT_BAD_CRX', 'En-tête CRX tronqué');
      fields.push({ field, wire, value: buf.subarray(pos, pos + len) });
      pos += len;
    } else throw fail('EXT_BAD_CRX', 'En-tête CRX illisible');
  }
  return fields;
}

// Découpe un fichier CRX3 : « Cr24 », version, longueur de l'en-tête, en-tête
// protobuf (CrxFileHeader), puis l'archive ZIP.
//
// ATTENTION : cette fonction ne vérifie AUCUNE signature. Elle garantit
// seulement que `publicKey` est la clé dont l'empreinte donne `id`. Appeler
// `verifyCrx()` avant de faire confiance à `zip`.
function parseCrx(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  if (buffer.length < 12 || buffer.toString('latin1', 0, 4) !== 'Cr24') throw fail('EXT_BAD_CRX', 'Ce fichier n\'est pas une extension Chrome (CRX)');
  const version = buffer.readUInt32LE(4);
  if (version !== 3) throw fail('EXT_BAD_CRX', `Format CRX${version} non pris en charge (CRX3 attendu)`);
  const headerSize = buffer.readUInt32LE(8);
  if (headerSize > buffer.length - 12) throw fail('EXT_BAD_CRX', 'En-tête CRX tronqué');
  const header = buffer.subarray(12, 12 + headerSize);
  const zip = buffer.subarray(12 + headerSize);

  const proofs = [];
  let signedHeaderData = null;
  for (const f of readProto(header)) {
    if (f.wire !== 2) continue;
    if (f.field === 2 || f.field === 3) { // sha256_with_rsa, sha256_with_ecdsa
      const proof = { type: f.field === 2 ? 'rsa' : 'ecdsa', publicKey: null, signature: null };
      for (const p of readProto(f.value)) {
        if (p.wire !== 2) continue;
        if (p.field === 1) proof.publicKey = Buffer.from(p.value);
        else if (p.field === 2) proof.signature = Buffer.from(p.value);
      }
      if (!proof.publicKey || !proof.signature) throw fail('EXT_BAD_CRX', 'Preuve de signature incomplète');
      proof.keyHash = crypto.createHash('sha256').update(proof.publicKey).digest();
      proofs.push(proof);
    } else if (f.field === 10000) signedHeaderData = Buffer.from(f.value);
  }
  if (!signedHeaderData) throw fail('EXT_BAD_CRX', 'En-tête CRX sans données signées');
  let crxId = null;
  for (const f of readProto(signedHeaderData)) if (f.field === 1 && f.wire === 2) crxId = Buffer.from(f.value);
  if (!crxId || crxId.length !== 16) throw fail('EXT_BAD_CRX', 'Identifiant absent de l\'en-tête CRX');

  // La clé du développeur est celle dont l'empreinte commence par l'identifiant.
  const developer = proofs.find((p) => p.keyHash.subarray(0, 16).equals(crxId));
  if (!developer) throw fail('EXT_BAD_CRX', 'Aucune clé ne correspond à l\'identifiant de l\'extension');
  return { version, id: idFromHash(crxId), publicKey: developer.publicKey, zip, proofs, signedHeaderData };
}

// Vérifie toutes les signatures d'un CRX découpé par parseCrx(). Comme
// Chromium, une seule signature fausse suffit à tout refuser.
// Renvoie { developer: true, store: bool, proofs: n } ou lève une erreur.
function verifyCrx(crx) {
  const size = Buffer.alloc(4);
  size.writeUInt32LE(crx.signedHeaderData.length);
  const prefix = Buffer.concat([Buffer.from('CRX3 SignedData\0', 'latin1'), size, crx.signedHeaderData]);
  let developer = false;
  let store = false;
  for (const proof of crx.proofs) {
    let ok = false;
    try {
      const key = crypto.createPublicKey({ key: proof.publicKey, format: 'der', type: 'spki' });
      const kind = key.asymmetricKeyType;
      if ((proof.type === 'rsa' && kind === 'rsa') || (proof.type === 'ecdsa' && kind === 'ec')) {
        ok = crypto.createVerify('sha256').update(prefix).update(crx.zip).verify(key, proof.signature);
      }
    } catch {
      ok = false;
    }
    if (!ok) throw fail('EXT_BAD_SIGNATURE', 'Signature de l\'extension invalide : fichier modifié ou corrompu');
    if (proof.publicKey.equals(crx.publicKey)) developer = true;
    if (proof.keyHash.toString('hex') === STORE_KEY_HASH) store = true;
  }
  if (!developer) throw fail('EXT_BAD_SIGNATURE', 'Signature du développeur absente');
  return { developer, store, proofs: crx.proofs.length };
}

// --- Décompression ZIP ------------------------------------------------------

let crcTable = null;
function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Nom d'entrée ZIP -> segments de chemin sûrs, ou erreur. Refuse les chemins
// absolus, les lettres de lecteur, « .. » et les octets nuls.
function safeSegments(name) {
  if (!name || name.includes('\0')) throw fail('EXT_UNSAFE_ZIP', 'Nom de fichier invalide dans l\'archive');
  const unix = name.replace(/\\/g, '/');
  if (unix.startsWith('/') || /^[a-zA-Z]:/.test(unix)) throw fail('EXT_UNSAFE_ZIP', `Chemin absolu refusé : ${name}`);
  const segments = [];
  for (const seg of unix.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') throw fail('EXT_UNSAFE_ZIP', `Chemin remontant refusé : ${name}`);
    segments.push(seg);
  }
  return segments;
}

// Lit le répertoire central d'une archive ZIP et valide chaque entrée, sans
// rien décompresser ni écrire. Les tailles annoncées sont déjà comparées aux
// plafonds ; elles sont revérifiées pendant la décompression.
function readZipEntries(buffer, lim = {}) {
  const max = { ...DEFAULT_LIMITS, ...lim };
  // Fin du répertoire central : cherchée depuis la fin (commentaire possible).
  let eocd = -1;
  for (let i = buffer.length - 22, stop = Math.max(0, buffer.length - 22 - 0xffff); i >= stop; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw fail('EXT_BAD_ZIP', 'Archive ZIP illisible');
  const count = buffer.readUInt16LE(eocd + 10);
  const cdSize = buffer.readUInt32LE(eocd + 12);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw fail('EXT_BAD_ZIP', 'Archive ZIP64 non prise en charge');
  if (buffer.readUInt16LE(eocd + 4) !== 0 || buffer.readUInt16LE(eocd + 6) !== 0) throw fail('EXT_BAD_ZIP', 'Archive en plusieurs volumes non prise en charge');
  if (count > max.maxFiles) throw fail('EXT_ZIP_TOO_BIG', `Trop de fichiers dans l'archive (${count})`);
  if (cdOffset + cdSize > eocd) throw fail('EXT_BAD_ZIP', 'Répertoire central du ZIP incohérent');

  const entries = [];
  let total = 0;
  let pos = cdOffset;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > eocd || buffer.readUInt32LE(pos) !== 0x02014b50) throw fail('EXT_BAD_ZIP', 'Répertoire central du ZIP corrompu');
    const flags = buffer.readUInt16LE(pos + 8);
    const method = buffer.readUInt16LE(pos + 10);
    const crc = buffer.readUInt32LE(pos + 16);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const size = buffer.readUInt32LE(pos + 24);
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const mode = buffer.readUInt32LE(pos + 38) >>> 16;
    const offset = buffer.readUInt32LE(pos + 42);
    if (pos + 46 + nameLen > eocd) throw fail('EXT_BAD_ZIP', 'Répertoire central du ZIP corrompu');
    const name = buffer.toString('utf8', pos + 46, pos + 46 + nameLen);
    pos += 46 + nameLen + extraLen + commentLen;

    if (flags & 1) throw fail('EXT_BAD_ZIP', `Fichier chiffré refusé : ${name}`);
    if (compressedSize === 0xffffffff || size === 0xffffffff || offset === 0xffffffff) throw fail('EXT_BAD_ZIP', 'Archive ZIP64 non prise en charge');
    // Type de fichier Unix : seuls les fichiers ordinaires et les dossiers
    // passent. Liens symboliques, périphériques, tubes… sont refusés.
    const type = mode & 0o170000;
    if (type === 0o120000) throw fail('EXT_UNSAFE_ZIP', `Lien symbolique refusé : ${name}`);
    if (type !== 0 && type !== 0o100000 && type !== 0o040000) throw fail('EXT_UNSAFE_ZIP', `Fichier spécial refusé : ${name}`);
    const segments = safeSegments(name);
    const isDir = /[\\/]$/.test(name) || type === 0o040000;
    if (!isDir) {
      if (method !== 0 && method !== 8) throw fail('EXT_BAD_ZIP', `Compression non prise en charge (${method}) : ${name}`);
      if (size > max.maxEntryBytes) throw fail('EXT_ZIP_TOO_BIG', `Fichier trop volumineux : ${name}`);
      total += size;
      if (total > max.maxBytes) throw fail('EXT_ZIP_TOO_BIG', 'Extension trop volumineuse une fois décompressée');
    }
    if (!segments.length) continue; // « ./ »
    entries.push({ name, segments, isDir, method, crc, compressedSize, size, offset });
  }
  return entries;
}

function inflate(data, maxOutputLength) {
  return new Promise((resolve, reject) => {
    zlib.inflateRaw(data, { maxOutputLength: Math.max(1, maxOutputLength) }, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

// Décompresse une archive ZIP dans `destDir` (créé au besoin, censé être neuf).
// `lim` : { maxFiles, maxBytes, maxEntryBytes, skip(nom) -> bool }.
// Les plafonds portent sur les octets réellement produits, pas seulement sur
// les tailles annoncées : une « bombe » qui ment sur sa taille est arrêtée.
// Renvoie { files, bytes }.
async function unzip(buffer, destDir, lim = {}) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  const max = { ...DEFAULT_LIMITS, ...lim };
  const entries = readZipEntries(buffer, max);
  const root = path.resolve(destDir);
  await fs.promises.mkdir(root, { recursive: true });
  const made = new Set([root]);
  const mkdir = async (d) => {
    if (made.has(d)) return;
    await fs.promises.mkdir(d, { recursive: true, mode: 0o755 });
    made.add(d);
  };
  let files = 0;
  let bytes = 0;
  for (const e of entries) {
    if (typeof max.skip === 'function' && max.skip(e.segments.join('/'))) continue;
    const target = path.join(root, ...e.segments);
    // Ceinture et bretelles : le chemin final doit rester sous la racine.
    if (!target.startsWith(root + path.sep)) throw fail('EXT_UNSAFE_ZIP', `Chemin hors du dossier refusé : ${e.name}`);
    if (e.isDir) { await mkdir(target); continue; }

    if (e.offset + 30 > buffer.length || buffer.readUInt32LE(e.offset) !== 0x04034b50) throw fail('EXT_BAD_ZIP', `Entrée ZIP corrompue : ${e.name}`);
    const start = e.offset + 30 + buffer.readUInt16LE(e.offset + 26) + buffer.readUInt16LE(e.offset + 28);
    if (start + e.compressedSize > buffer.length) throw fail('EXT_BAD_ZIP', `Entrée ZIP tronquée : ${e.name}`);
    const raw = buffer.subarray(start, start + e.compressedSize);
    let data = raw;
    if (e.method === 8) {
      const room = Math.min(max.maxEntryBytes, max.maxBytes - bytes);
      try {
        data = await inflate(raw, room);
      } catch (err) {
        if (err && err.code === 'ERR_BUFFER_TOO_LARGE') throw fail('EXT_ZIP_TOO_BIG', 'Extension trop volumineuse une fois décompressée');
        throw fail('EXT_BAD_ZIP', `Décompression impossible : ${e.name}`);
      }
    }
    if (data.length !== e.size) throw fail('EXT_BAD_ZIP', `Taille inattendue : ${e.name}`);
    bytes += data.length;
    if (bytes > max.maxBytes) throw fail('EXT_ZIP_TOO_BIG', 'Extension trop volumineuse une fois décompressée');
    if (crc32(data) !== e.crc) throw fail('EXT_BAD_ZIP', `Somme de contrôle fausse : ${e.name}`);
    await mkdir(path.dirname(target));
    // Jamais de bit d'exécution, quel que soit le mode annoncé par l'archive.
    await fs.promises.writeFile(target, data, { mode: 0o644 });
    files += 1;
  }
  return { files, bytes };
}

// --- Manifeste --------------------------------------------------------------

// JSON tolérant : Chromium accepte une marque d'ordre d'octets et des
// commentaires « // » ou « /* */ » dans manifest.json et messages.json.
function parseJsonLoose(text) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  try {
    return JSON.parse(src);
  } catch {}
  let out = '';
  let inString = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      out += c;
      if (c === '\\') out += src[++i] || '';
      else if (c === '"') inString = false;
    } else if (c === '"') { inString = true; out += c; }
    else if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; out += '\n'; }
    else if (c === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); i = end === -1 ? src.length : end + 1; }
    else out += c;
  }
  return JSON.parse(out);
}

function readJson(file) {
  try {
    const value = parseJsonLoose(fs.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

// Ajoute la clé publique au manifeste (texte -> texte). L'identifiant d'une
// extension dépaquetée vient de `key` ; sans elle, il viendrait du chemin.
function injectKey(manifestText, publicKey) {
  let manifest;
  try {
    manifest = parseJsonLoose(String(manifestText));
  } catch {
    throw fail('EXT_BAD_MANIFEST', 'manifest.json illisible');
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw fail('EXT_BAD_MANIFEST', 'manifest.json invalide');
  manifest.key = Buffer.from(publicKey).toString('base64');
  return JSON.stringify(manifest, null, 2);
}

// Chemin d'un fichier de l'extension, ou '' s'il sort du dossier ou n'existe pas.
function insideFile(extDir, rel) {
  if (typeof rel !== 'string' || !rel) return '';
  const file = path.resolve(extDir, rel.replace(/^[\\/]+/, '').split(/[?#]/)[0]);
  if (!file.startsWith(extDir + path.sep)) return '';
  try { return fs.statSync(file).isFile() ? file : ''; } catch { return ''; }
}

// Résout « __MSG_cle__ » dans _locales : langue d'Orbe, puis anglais, puis la
// langue par défaut de l'extension. Les clés ne tiennent pas compte de la casse.
function makeLocalizer(extDir, manifest) {
  const tried = new Map();
  const want = lang.replace('-', '_');
  const order = [...new Set([want, want.split('_')[0], 'en', manifest.default_locale, 'en_US', 'en_GB'].filter((l) => typeof l === 'string' && /^[A-Za-z0-9_]+$/.test(l)))];
  const messages = (locale) => {
    if (!tried.has(locale)) {
      const raw = readJson(path.join(extDir, '_locales', locale, 'messages.json'));
      const map = new Map();
      if (raw) for (const k of Object.keys(raw)) if (raw[k] && typeof raw[k].message === 'string') map.set(k.toLowerCase(), raw[k].message);
      tried.set(locale, map);
    }
    return tried.get(locale);
  };
  return (value) => {
    if (typeof value !== 'string') return '';
    return value.replace(/__MSG_([A-Za-z0-9_@]+)__/g, (all, key) => {
      for (const locale of order) {
        const found = messages(locale).get(key.toLowerCase());
        if (found != null) return found;
      }
      return '';
    }).trim();
  };
}

// Plus grande icône déclarée (objet { taille: chemin } ou chemin seul).
function pickIcon(extDir, icons) {
  if (typeof icons === 'string') return insideFile(extDir, icons);
  if (!icons || typeof icons !== 'object') return '';
  const sizes = Object.keys(icons).sort((a, b) => Number(b) - Number(a));
  for (const s of sizes) {
    const file = insideFile(extDir, icons[s]);
    if (file) return file;
  }
  return '';
}

const HOST_PATTERN = /^(<all_urls>|(\*|https?|wss?|ftp|file|chrome-extension):\/\/)/;
const actionOf = (m) => [m.action, m.browser_action, m.page_action].find((a) => a && typeof a === 'object') || null;

function describe(id, extDir, manifest, entry) {
  const t = makeLocalizer(extDir, manifest);
  const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  const declared = strings(manifest.permissions);
  const hosts = new Set([...strings(manifest.host_permissions), ...declared.filter((p) => HOST_PATTERN.test(p))]);
  // Les scripts de contenu donnent eux aussi accès aux pages visées.
  if (Array.isArray(manifest.content_scripts)) for (const cs of manifest.content_scripts) for (const m of strings(cs && cs.matches)) hosts.add(m);
  const action = actionOf(manifest);
  return {
    id,
    name: t(manifest.name) || id,
    version: String(manifest.version || ''),
    description: t(manifest.description),
    permissions: declared.filter((p) => !HOST_PATTERN.test(p)),
    hostPermissions: [...hosts],
    icon: pickIcon(extDir, manifest.icons) || pickIcon(extDir, action && action.default_icon),
    dir: extDir,
    enabled: !entry || entry.enabled !== false,
    manifestVersion: Number(manifest.manifest_version) || 0,
  };
}

// --- État sur le disque -----------------------------------------------------

function loadState() {
  if (state) return state;
  const raw = readJson(path.join(needDir(), STATE_FILE));
  state = { version: 1, extensions: {} };
  if (raw && raw.extensions && typeof raw.extensions === 'object') {
    for (const id of Object.keys(raw.extensions)) {
      const e = raw.extensions[id];
      if (!ID_RE.test(id) || !e || typeof e !== 'object') continue;
      state.extensions[id] = { enabled: e.enabled !== false, current: typeof e.current === 'string' ? e.current : '', installedAt: Number(e.installedAt) || 0 };
    }
  }
  return state;
}

// Écriture atomique : c'est elle qui fait basculer d'une version à l'autre.
function saveState() {
  const file = path.join(needDir(), STATE_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

const hasManifest = (d) => { try { return fs.statSync(path.join(d, 'manifest.json')).isFile(); } catch { return false; } };

// Dossier de la version courante d'une extension, ou '' si elle n'est pas là.
// Si state.json a disparu, on retombe sur le dossier de version le plus récent.
function currentDir(id) {
  if (!ID_RE.test(id)) return '';
  const base = path.join(needDir(), id);
  const entry = loadState().extensions[id];
  if (entry && entry.current && path.basename(entry.current) === entry.current && !entry.current.startsWith('.')) {
    const d = path.join(base, entry.current);
    if (hasManifest(d)) return d;
  }
  let names;
  try { names = fs.readdirSync(base); } catch { return ''; }
  const found = names.filter((n) => !n.startsWith('.') && hasManifest(path.join(base, n)))
    .map((n) => ({ n, at: fs.statSync(path.join(base, n)).mtimeMs }))
    .sort((a, b) => b.at - a.at)[0];
  return found ? path.join(base, found.n) : '';
}

function recordOf(id) {
  const extDir = currentDir(id);
  if (!extDir) return null;
  const manifest = readJson(path.join(extDir, 'manifest.json'));
  if (!manifest) return null;
  return describe(id, extDir, manifest, loadState().extensions[id]);
}

// Toutes les extensions installées, triées par nom.
function list() {
  let names;
  try { names = fs.readdirSync(needDir()); } catch { return []; }
  return names.filter((n) => ID_RE.test(n)).map(recordOf).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}

const get = (id) => (typeof id === 'string' && ID_RE.test(id) ? recordOf(id) : null);

function isEnabled(id) {
  const entry = loadState().extensions[id];
  return !!currentDir(id) && (!entry || entry.enabled !== false);
}

// Active ou désactive une extension. L'état est écrit tout de suite ; les
// sessions déjà chargées sont mises à jour en arrière-plan (voir syncAll()).
function setEnabled(id, on) {
  if (!currentDir(id)) return false;
  const s = loadState();
  const entry = s.extensions[id] || (s.extensions[id] = { enabled: true, current: path.basename(currentDir(id)), installedAt: 0 });
  entry.enabled = !!on;
  saveState();
  syncAll().catch(() => {});
  return true;
}

// Fenêtre surgissante du bouton de l'extension (action / browser_action).
function popupFor(id) {
  const extDir = currentDir(id);
  if (!extDir) return null;
  const manifest = readJson(path.join(extDir, 'manifest.json'));
  const action = manifest && actionOf(manifest);
  if (!action || typeof action.default_popup !== 'string' || !action.default_popup) return null;
  if (!insideFile(extDir, action.default_popup)) return null;
  const t = makeLocalizer(extDir, manifest);
  return {
    url: `chrome-extension://${id}/${action.default_popup.replace(/^[\\/]+/, '')}`,
    title: t(action.default_title) || t(manifest.name) || id,
    icon: pickIcon(extDir, action.default_icon) || pickIcon(extDir, manifest.icons),
  };
}

// --- Installation -----------------------------------------------------------

function crxUrl(id) {
  const chrome = (process.versions && process.versions.chrome) || '152.0.0.0';
  return `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${chrome}&acceptformat=crx2,crx3&x=id%3D${id}%26uc`;
}

async function download(id) {
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== 'function') throw fail('EXT_NO_FETCH', 'Aucune fonction fetch disponible');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await doFetch(crxUrl(id), { redirect: 'follow', signal: abort.signal, credentials: 'omit' });
    // 204 : le Store ne propose pas (ou plus) cette extension.
    if (!res || res.status === 204 || res.status === 404) throw fail('EXT_NOT_FOUND', 'Extension introuvable sur le Chrome Web Store');
    if (!res.ok) throw fail('EXT_DOWNLOAD', `Téléchargement refusé (HTTP ${res.status})`);
    const announced = Number(res.headers && res.headers.get && res.headers.get('content-length'));
    if (announced > DOWNLOAD_MAX) throw fail('EXT_DOWNLOAD', 'Extension trop volumineuse');
    const body = Buffer.from(await res.arrayBuffer());
    if (!body.length) throw fail('EXT_NOT_FOUND', 'Extension introuvable sur le Chrome Web Store');
    if (body.length > DOWNLOAD_MAX) throw fail('EXT_DOWNLOAD', 'Extension trop volumineuse');
    return body;
  } catch (err) {
    if (err && err.code && String(err.code).startsWith('EXT_')) throw err;
    throw fail('EXT_DOWNLOAD', `Téléchargement impossible : ${(err && err.message) || err}`);
  } finally {
    clearTimeout(timer);
  }
}

const rmrf = (p) => fs.promises.rm(p, { recursive: true, force: true }).catch(() => {});

// Installe un CRX déjà en mémoire. `expectedId` est l'identifiant demandé :
// un fichier signé pour une autre extension est refusé.
// `options.check(manifeste)` : appelé une fois l'archive vérifiée et son manifeste lu,
// avant la bascule ; s'il lève une erreur, rien n'est installé (mise à jour refusée).
async function installCrx(buffer, expectedId, options = {}) {
  needDir();
  const crx = parseCrx(buffer);
  if (expectedId && crx.id !== expectedId) throw fail('EXT_ID_MISMATCH', `Le fichier reçu est celui d'une autre extension (${crx.id})`);
  const proof = verifyCrx(crx);
  if (requireStoreSignature && !proof.store) throw fail('EXT_NOT_FROM_STORE', 'Ce fichier n\'est pas signé par le Chrome Web Store');
  const id = crx.id;

  await fs.promises.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.tmp-${id}-${crypto.randomBytes(4).toString('hex')}`);
  try {
    // `_metadata` (sommes de contrôle du Store) fait échouer le chargement
    // d'une extension dépaquetée : on ne l'extrait pas.
    await unzip(crx.zip, tmp, { ...limits, skip: (name) => name === '_metadata' || name.startsWith('_metadata/') });
    const manifestFile = path.join(tmp, 'manifest.json');
    let text;
    try { text = await fs.promises.readFile(manifestFile, 'utf8'); } catch { throw fail('EXT_BAD_MANIFEST', 'manifest.json absent de l\'extension'); }
    const injected = injectKey(text, crx.publicKey);
    const manifest = JSON.parse(injected);
    if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') throw fail('EXT_BAD_MANIFEST', 'manifest.json incomplet');
    if (manifest.theme || manifest.app) throw fail('EXT_UNSUPPORTED', 'Les thèmes et les applications Chrome ne sont pas pris en charge');
    if (typeof options.check === 'function') await options.check(manifest);
    await fs.promises.writeFile(manifestFile, injected);

    const base = path.join(dir, id);
    await fs.promises.mkdir(base, { recursive: true });
    const name = `${manifest.version.replace(/[^0-9A-Za-z.]/g, '_').slice(0, 40)}_${Date.now().toString(36)}`;
    await fs.promises.rename(tmp, path.join(base, name));

    // Bascule : à partir d'ici la nouvelle version est la version courante.
    const s = loadState();
    const before = s.extensions[id];
    s.extensions[id] = { enabled: !before || before.enabled !== false, current: name, installedAt: Date.now() };
    saveState();

    // Les sessions déjà ouvertes passent à la nouvelle version, puis les
    // anciennes versions sont supprimées.
    await syncAll().catch(() => {});
    for (const other of await fs.promises.readdir(base).catch(() => [])) if (other !== name) await rmrf(path.join(base, other));
    return { ...recordOf(id), verified: proof };
  } catch (err) {
    await rmrf(tmp);
    throw err;
  }
}

// Télécharge, vérifie et installe une extension du Chrome Web Store.
// Remplace une version déjà installée (en conservant son état activé ou non).
function install(idOrUrl, options = {}) {
  const id = parseStoreInput(String(idOrUrl == null ? '' : idOrUrl));
  if (!id) return Promise.reject(fail('EXT_BAD_ID', 'Adresse ou identifiant d\'extension non reconnu'));
  try { needDir(); } catch (err) { return Promise.reject(err); }
  if (installing.has(id)) return installing.get(id);
  const job = download(id).then((buffer) => installCrx(buffer, id, options)).finally(() => installing.delete(id));
  installing.set(id, job);
  return job;
}

// Désinstalle : retire l'extension des sessions connues, puis du disque.
async function remove(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) return false;
  const base = path.join(needDir(), id);
  const existed = fs.existsSync(base);
  const s = loadState();
  delete s.extensions[id];
  if (existed || fs.existsSync(path.join(dir, STATE_FILE))) saveState();
  for (const ses of liveSessions()) await unloadFrom(ses, id).catch(() => {});
  await rmrf(base);
  return existed;
}

// --- Sessions Electron ------------------------------------------------------

const apiOf = (ses) => (ses && ses.extensions) || ses; // Session.loadExtension est déprécié
const persistent = (ses) => !!ses && (typeof ses.isPersistent !== 'function' || ses.isPersistent());
const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };

// `beforeLoad(id, dossier)` : appelé juste avant de charger une extension
// (src/main/ext-access.js y reporte l'accès aux sites accordé par l'utilisateur).
// `equip(session)` : appelé avant de charger quoi que ce soit dans une session
// (src/main/ext-api.js y enregistre alors son script de préchargement).
const hooks = { beforeLoad: () => {}, equip: () => {} };

function liveSessions() {
  const alive = [];
  for (let i = sessions.length - 1; i >= 0; i--) {
    const ses = sessions[i].deref();
    if (ses) alive.unshift(ses);
    else sessions.splice(i, 1);
  }
  return alive;
}

async function sync(ses) {
  const report = { loaded: [], unloaded: [], failed: [], skipped: false };
  const api = apiOf(ses);
  const root = real(needDir()) + path.sep;
  const wanted = new Map(list().filter((r) => r.enabled).map((r) => [r.id, r]));

  // Ce qui est chargé depuis notre dossier mais ne doit plus l'être :
  // extension désinstallée, désactivée, ou restée sur une ancienne version.
  const here = new Set();
  for (const ext of api.getAllExtensions()) {
    if (!(real(ext.path) + path.sep).startsWith(root)) continue; // chargée par quelqu'un d'autre
    const want = wanted.get(ext.id);
    if (want && real(want.dir) === real(ext.path)) { here.add(ext.id); continue; }
    try { api.removeExtension(ext.id); report.unloaded.push(ext.id); } catch (err) { report.failed.push({ id: ext.id, error: String((err && err.message) || err) }); }
  }
  for (const [id, rec] of wanted) {
    if (here.has(id)) continue;
    try {
      hooks.equip(ses);
      hooks.beforeLoad(id, rec.dir);
      const ext = await api.loadExtension(rec.dir, { allowFileAccess: false });
      if (ext && ext.id !== id) {
        // Ne devrait pas arriver : la clé injectée fixe l'identifiant.
        try { api.removeExtension(ext.id); } catch {}
        throw fail('EXT_ID_MISMATCH', `Identifiant inattendu après chargement (${ext.id})`);
      }
      report.loaded.push(id);
    } catch (err) {
      report.failed.push({ id, name: rec.name, error: String((err && err.message) || err) });
    }
  }
  return report;
}

// Met la session en accord avec ce qui est installé et activé : charge ce qui
// manque, retire ce qui ne doit plus y être. Sans effet si rien n'a changé.
// Une session non persistante (navigation privée) est ignorée sans erreur :
// Electron refuse d'y charger des extensions.
// Renvoie { loaded: [id], unloaded: [id], failed: [{ id, error }], skipped }.
function loadInto(ses) {
  if (!ses || !persistent(ses)) return Promise.resolve({ loaded: [], unloaded: [], failed: [], skipped: true });
  if (!liveSessions().includes(ses)) sessions.push(new WeakRef(ses));
  const next = (queues.get(ses) || Promise.resolve()).then(() => sync(ses));
  queues.set(ses, next.catch(() => {}));
  return next;
}

// Resynchronise toutes les sessions déjà passées à loadInto().
async function syncAll() {
  const reports = [];
  for (const ses of liveSessions()) reports.push(await loadInto(ses));
  return reports;
}

// Retire une extension d'une session, sans la désinstaller ni la désactiver.
async function unloadFrom(ses, id) {
  if (!ses || !persistent(ses)) return false;
  await (queues.get(ses) || Promise.resolve());
  const api = apiOf(ses);
  if (!api.getExtension(id)) return false;
  api.removeExtension(id);
  return true;
}

module.exports = {
  configure, parseStoreInput, install, installCrx, list, get, remove,
  loadInto, unloadFrom, syncAll, setEnabled, isEnabled, popupFor,
  parseCrx, verifyCrx, unzip, readZipEntries, injectKey, idFromPublicKey, crxUrl, hooks,
};
