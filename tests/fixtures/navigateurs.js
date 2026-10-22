// Faux profils de navigateurs pour les essais d'import : fabriqués ici, octet par
// octet, d'après les formats. Aucun vrai profil de la machine n'est lu.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// --- Chrome et sa famille : fichier JSON « Bookmarks » ---------------------------------
const url = (name, u) => ({ type: 'url', name, url: u, id: String(Math.floor(Math.random() * 1e6)), date_added: '13300000000000000' });
const folder = (name, children) => ({ type: 'folder', name, children, id: String(Math.floor(Math.random() * 1e6)) });
const chromeBookmarks = (bar, other = [], synced = []) => JSON.stringify({
  checksum: 'x', version: 1,
  roots: { bookmark_bar: folder('Barre de favoris', bar), other: folder('Autres favoris', other), synced: folder('Favoris sur mobile', synced) },
});
const CHROME_DEFAULT = chromeBookmarks([
  url('Wikipédia', 'https://fr.wikipedia.org/'),
  folder('Lecture', [url('Le Monde', 'https://www.lemonde.fr/'), folder('Tech', [url('MDN', 'https://developer.mozilla.org/fr/')]), folder('Vide', [])]),
  url('Piège', 'javascript:alert(1)'),
  url('Réglages', 'chrome://settings/'),
  url('Titre ‮piégé\u0000 <b>gras</b>', 'https://exemple.org/titre'),
], [url('GitHub', 'https://github.com/')]);

// --- Firefox : sauvegarde « mozLz40 » ----------------------------------------------------
// Compresseur LZ4 (bloc) minimal, pour fabriquer une sauvegarde comme celles de Firefox.
function lz4Compress(src) {
  const out = [];
  const table = new Map();
  let anchor = 0;
  let i = 0;
  const ext = (n) => { while (n >= 255) { out.push(255); n -= 255; } out.push(n); };
  const emit = (litEnd, matchLen, off) => {
    const lit = litEnd - anchor;
    out.push((Math.min(lit, 15) << 4) | (matchLen ? Math.min(matchLen - 4, 15) : 0));
    if (lit >= 15) ext(lit - 15);
    for (let k = anchor; k < litEnd; k++) out.push(src[k]);
    if (matchLen) { out.push(off & 255, off >> 8); if (matchLen - 4 >= 15) ext(matchLen - 19); }
  };
  while (i < src.length - 12) {
    const key = src.readUInt32LE(i);
    const cand = table.get(key);
    table.set(key, i);
    if (cand !== undefined && i - cand <= 65535) {
      let len = 4;
      while (i + len < src.length - 5 && src[cand + len] === src[i + len]) len += 1;
      emit(i, len, i - cand);
      i += len;
      anchor = i;
    } else i += 1;
  }
  emit(src.length, 0, 0);
  return Buffer.from(out);
}
function mozlz4(json) {
  const raw = Buffer.from(JSON.stringify(json), 'utf8');
  const head = Buffer.alloc(12);
  head.write('mozLz40\0', 0, 'latin1');
  head.writeUInt32LE(raw.length, 8);
  return Buffer.concat([head, lz4Compress(raw)]);
}
const ffPlace = (title, uri) => ({ type: 'text/x-moz-place', title, uri, guid: 'g' + Math.random() });
const ffDir = (title, children, root) => ({ type: 'text/x-moz-place-container', title, children, ...(root ? { root } : {}) });
const ffBackup = (toolbar, menu = [], unfiled = []) => ffDir('', [
  ffDir('menu', menu, 'bookmarksMenuFolder'), ffDir('toolbar', toolbar, 'toolbarFolder'), ffDir('unfiled', unfiled, 'unfiledBookmarksFolder'), ffDir('mobile', [], 'mobileFolder'),
], 'placesRoot');
const FIREFOX_BACKUP = ffBackup(
  [ffPlace('Mozilla', 'https://www.mozilla.org/fr/'), ffDir('Outils', [ffPlace('Can I use', 'https://caniuse.com/'), { type: 'text/x-moz-place-separator' }, ffPlace('Requête', 'place:sort=8&maxResults=10')])],
  [ffPlace('Sauvegarde seulement', 'https://sauvegarde.exemple/')],
  [ffPlace('Dakar', 'https://fr.wikipedia.org/wiki/Dakar')],
);

// Base « places.sqlite », fabriquée par le sqlite3 du système s'il existe. Rend true si elle a été écrite.
function firefoxSqlite(file, sqlite) {
  if (!sqlite) return false;
  const sql = `
    CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT);
    CREATE TABLE moz_bookmarks (id INTEGER PRIMARY KEY, type INTEGER, fk INTEGER, parent INTEGER, position INTEGER, title TEXT, guid TEXT);
    INSERT INTO moz_places VALUES (1, 'https://www.mozilla.org/fr/'), (2, 'https://caniuse.com/'), (3, 'place:sort=8'), (4, 'https://fr.wikipedia.org/wiki/Dakar'), (5, 'https://base.exemple/seulement');
    INSERT INTO moz_bookmarks VALUES
      (1, 2, NULL, 0, 0, '', 'root________'), (2, 2, NULL, 1, 0, 'menu', 'menu________'), (3, 2, NULL, 1, 1, 'toolbar', 'toolbar_____'),
      (4, 2, NULL, 1, 2, 'tags', 'tags________'), (5, 2, NULL, 1, 3, 'unfiled', 'unfiled_____'), (6, 2, NULL, 1, 4, 'mobile', 'mobile______'),
      (10, 2, NULL, 3, 1, 'Outils', 'dossier00001'), (11, 1, 1, 3, 0, 'Mozilla', 'signet000001'), (12, 1, 2, 10, 0, 'Can I use', 'signet000002'),
      (13, 3, NULL, 10, 1, NULL, 'separateur01'), (14, 1, 3, 10, 2, 'Requête', 'signet000003'), (15, 1, 4, 5, 0, 'Dakar', 'signet000004'),
      (16, 1, 5, 2, 0, 'Base seulement', 'signet000005'), (17, 1, 5, 4, 0, 'étiquette', 'signet000006');`;
  try { execFileSync(sqlite, [file, sql], { stdio: 'ignore', timeout: 20000 }); return true; } catch { return false; }
}

// --- Safari : liste de propriétés binaire ---------------------------------------------------
// Écrit un « bplist00 » : chaînes (ASCII et UTF-16), entiers, booléens, données, dates, tableaux, dictionnaires.
function bplist(root) {
  const objs = [];
  const add = (v) => {
    const i = objs.length;
    objs.push(null);
    if (Array.isArray(v)) objs[i] = { t: 'a', refs: v.map(add) };
    else if (Buffer.isBuffer(v)) objs[i] = { t: 'd', v };
    else if (v instanceof Date) objs[i] = { t: 'date', v };
    else if (v && typeof v === 'object') { const keys = Object.keys(v); objs[i] = { t: 'o', k: keys.map(add), v: keys.map((k) => add(v[k])) }; }
    else objs[i] = { t: typeof v, v };
    return i;
  };
  add(root);
  const ref = (n) => Buffer.from([n >> 8, n & 255]);
  const head = (type, n) => (n < 15 ? Buffer.from([(type << 4) | n]) : n < 256 ? Buffer.from([(type << 4) | 15, 0x10, n]) : Buffer.from([(type << 4) | 15, 0x11, n >> 8, n & 255]));
  const enc = (o) => {
    if (o.t === 'string') {
      // eslint-disable-next-line no-control-regex
      if (/^[\x00-\x7f]*$/.test(o.v)) return Buffer.concat([head(5, o.v.length), Buffer.from(o.v, 'latin1')]);
      const b = Buffer.from(o.v, 'utf16le');
      b.swap16();
      return Buffer.concat([head(6, o.v.length), b]);
    }
    if (o.t === 'number') { const b = Buffer.alloc(9); b[0] = 0x13; b.writeBigUInt64BE(BigInt(o.v), 1); return b; }
    if (o.t === 'boolean') return Buffer.from([o.v ? 9 : 8]);
    if (o.t === 'd') return Buffer.concat([head(4, o.v.length), o.v]);
    if (o.t === 'date') { const b = Buffer.alloc(9); b[0] = 0x33; b.writeDoubleBE(o.v.getTime() / 1000 - 978307200, 1); return b; }
    if (o.t === 'a') return Buffer.concat([head(10, o.refs.length), ...o.refs.map(ref)]);
    return Buffer.concat([head(13, o.k.length), ...o.k.map(ref), ...o.v.map(ref)]);
  };
  const parts = [Buffer.from('bplist00', 'latin1')];
  const offsets = [];
  let at = 8;
  for (const o of objs) { const b = enc(o); offsets.push(at); parts.push(b); at += b.length; }
  const table = Buffer.alloc(offsets.length * 4);
  offsets.forEach((o, i) => table.writeUInt32BE(o, i * 4));
  const trailer = Buffer.alloc(32);
  trailer[6] = 4;
  trailer[7] = 2;
  trailer.writeBigUInt64BE(BigInt(objs.length), 8);
  trailer.writeBigUInt64BE(0n, 16);
  trailer.writeBigUInt64BE(BigInt(at), 24);
  return Buffer.concat([...parts, table, trailer]);
}
const leaf = (title, u) => ({ WebBookmarkType: 'WebBookmarkTypeLeaf', URLString: u, URIDictionary: { title }, WebBookmarkUUID: 'U-' + title, Sync: { Data: Buffer.from([1, 2, 3, 4]), ServerID: 'x' } });
const list = (title, children) => ({ WebBookmarkType: 'WebBookmarkTypeList', Title: title, Children: children, WebBookmarkUUID: 'L-' + title });
const SAFARI = {
  WebBookmarkType: 'WebBookmarkTypeList', Title: '', WebBookmarkFileVersion: 1, Modifie: new Date(1790000000000),
  Children: [
    { WebBookmarkType: 'WebBookmarkTypeProxy', Title: 'History', WebBookmarkIdentifier: 'History' },
    list('BookmarksBar', [leaf('Apple', 'https://www.apple.com/fr/'), list('Sénégal', [leaf('Présidence — République du Sénégal', 'https://www.presidence.sn/'), leaf('APS', 'https://aps.sn/')])]),
    list('BookmarksMenu', [leaf('iCloud', 'https://www.icloud.com/')]),
    list('com.apple.ReadingList', [leaf('À lire', 'https://exemple.org/a-lire')]),
    list('Voyages', [leaf('Fichier', 'file:///etc/passwd'), leaf('SNCF', 'https://www.sncf-connect.com/')]),
  ],
};

// --- Dossier personnel d'essai ------------------------------------------------------------------
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); };

// Pose de faux profils sous `home`, à la manière de macOS (ou de Windows). Rend ce qui a été écrit.
function profils(home, { platform = 'darwin', sqlite = '' } = {}) {
  const mac = platform !== 'win32';
  const app = (macPath, winBase, winPath) => (mac ? path.join(home, 'Library', 'Application Support', macPath) : path.join(home, 'AppData', winBase, winPath));
  const chrome = app('Google/Chrome', 'Local', 'Google/Chrome/User Data');
  write(path.join(chrome, 'Local State'), JSON.stringify({ profile: { info_cache: { Default: { name: 'Amadou' }, 'Profile 1': { name: 'Travail <b>' }, 'Profile 7': { name: 'Sans signets' } } } }));
  write(path.join(chrome, 'Default', 'Bookmarks'), CHROME_DEFAULT);
  write(path.join(chrome, 'Profile 1', 'Bookmarks'), chromeBookmarks([url('Intranet', 'http://intranet.exemple/')]));
  write(path.join(chrome, 'Profile 7', 'Preferences'), '{}');
  write(path.join(chrome, 'System Profile', 'Bookmarks'), chromeBookmarks([url('Système', 'https://systeme.exemple/')]));
  const brave = app('BraveSoftware/Brave-Browser', 'Local', 'BraveSoftware/Brave-Browser/User Data');
  write(path.join(brave, 'Default', 'Bookmarks'), chromeBookmarks([url('Brave', 'https://brave.com/')]));
  // Edge installé, mais sans aucun signet : il ne doit pas être proposé.
  const edge = app('Microsoft Edge', 'Local', 'Microsoft/Edge/User Data');
  write(path.join(edge, 'Default', 'Preferences'), '{}');
  const opera = app('com.operasoftware.Opera', 'Roaming', 'Opera Software/Opera Stable');
  write(path.join(opera, 'Bookmarks'), chromeBookmarks([url('Opera', 'https://www.opera.com/')]));
  const firefox = app('Firefox', 'Roaming', 'Mozilla/Firefox');
  const ffProfile = path.join(firefox, 'Profiles', 'abcd1234.default-release');
  write(path.join(firefox, 'profiles.ini'), [
    '[Install4F96D1932A9F858E]', 'Default=Profiles/abcd1234.default-release', '',
    '[Profile1]', 'Name=hors du dossier', 'IsRelative=1', 'Path=../../../ailleurs', '',
    '[Profile0]', 'Name=default-release', 'IsRelative=1', 'Path=Profiles/abcd1234.default-release', 'Default=1', '',
    '[General]', 'StartWithLastProfile=1', 'Version=2', '',
  ].join(mac ? '\n' : '\r\n'));
  write(path.join(ffProfile, 'bookmarkbackups', 'bookmarks-2026-09-30_11_AAAA==.jsonlz4'), mozlz4(ffBackup([ffPlace('Ancienne sauvegarde', 'https://ancienne.exemple/')])));
  write(path.join(ffProfile, 'bookmarkbackups', 'bookmarks-2026-10-02_12_BBBB==.jsonlz4'), mozlz4(FIREFOX_BACKUP));
  write(path.join(home, 'ailleurs', 'bookmarkbackups', 'bookmarks-2026-10-02_1_CCCC==.jsonlz4'), mozlz4(FIREFOX_BACKUP));
  const hasSqlite = firefoxSqlite(path.join(ffProfile, 'places.sqlite'), sqlite);
  let safari = '';
  if (mac) { safari = path.join(home, 'Library', 'Safari', 'Bookmarks.plist'); write(safari, bplist(SAFARI)); }
  return { chrome, brave, edge, opera, firefox, ffProfile, safari, hasSqlite };
}

module.exports = { profils, chromeBookmarks, url, folder, lz4Compress, mozlz4, ffBackup, ffPlace, ffDir, bplist, leaf, list, SAFARI, FIREFOX_BACKUP, firefoxSqlite };
