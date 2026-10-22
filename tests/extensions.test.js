// Tests du module d'extensions : node --test tests/extensions.test.js
// Aucun accès réseau : le fichier CRX3 est fabriqué ici (clé RSA neuve,
// en-tête protobuf et archive ZIP assemblés à la main).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const ext = require('../src/main/extensions');

// --- Fabrication d'un ZIP ---------------------------------------------------

// entries : [{ name, data, method (0 ou 8), mode (type Unix), declaredSize }]
function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = Buffer.from(e.data || '');
    const method = e.method == null ? 8 : e.method;
    const body = method === 8 ? zlib.deflateRawSync(data) : data;
    const size = e.declaredSize == null ? data.length : e.declaredSize;
    const crc = zlib.crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // créé sous Unix
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((e.mode == null ? 0o100644 : e.mode) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// --- Fabrication d'un CRX3 --------------------------------------------------

function varint(n) {
  const out = [];
  while (n > 127) { out.push((n % 128) | 128); n = Math.floor(n / 128); }
  out.push(n);
  return Buffer.from(out);
}
const bytesField = (field, data) => Buffer.concat([varint(field * 8 + 2), varint(data.length), data]);

function makeCrx(zip, keys, { extraProofs = [], breakSignature = false } = {}) {
  const pub = keys.publicKey.export({ type: 'spki', format: 'der' });
  const crxId = crypto.createHash('sha256').update(pub).digest().subarray(0, 16);
  const signedHeaderData = bytesField(1, crxId);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(signedHeaderData.length);
  const payload = Buffer.concat([Buffer.from('CRX3 SignedData\0', 'latin1'), size, signedHeaderData, zip]);
  const proof = (k) => Buffer.concat([
    bytesField(1, k.publicKey.export({ type: 'spki', format: 'der' })),
    bytesField(2, crypto.sign('sha256', payload, k.privateKey)),
  ]);
  const parts = [bytesField(2, proof(keys))];
  for (const p of extraProofs) parts.push(bytesField(p.type === 'ecdsa' ? 3 : 2, proof(p.keys)));
  parts.push(bytesField(10000, signedHeaderData));
  const header = Buffer.concat(parts);
  const head = Buffer.alloc(12);
  head.write('Cr24', 0, 'latin1');
  head.writeUInt32LE(3, 4);
  head.writeUInt32LE(header.length, 8);
  const out = Buffer.concat([head, header, zip]);
  if (breakSignature) out[out.length - 30] ^= 0xff; // un octet de l'archive change après signature
  return { crx: out, pub, id: ext.idFromPublicKey(pub) };
}

const rsa = () => crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KEYS = rsa();

const MANIFEST = {
  manifest_version: 3,
  name: '__MSG_extName__',
  description: '__MSG_extDesc__',
  version: '1.2.3',
  default_locale: 'en',
  permissions: ['storage', 'tabs'],
  host_permissions: ['https://*.example.com/*'],
  content_scripts: [{ matches: ['<all_urls>'], js: ['content.js'] }],
  icons: { 16: 'icons/16.png', 128: 'icons/128.png' },
  action: { default_popup: 'ui/popup.html', default_title: '__MSG_extName__', default_icon: { 32: 'icons/16.png' } },
};

function extensionZip(manifest = MANIFEST, more = []) {
  return makeZip([
    { name: 'manifest.json', data: JSON.stringify(manifest) },
    { name: 'content.js', data: '// rien', method: 0 },
    { name: 'icons/', data: '', method: 0, mode: 0o040755 },
    { name: 'icons/16.png', data: 'png16' },
    { name: 'icons/128.png', data: 'png128' },
    { name: 'ui/popup.html', data: '<p>popup</p>' },
    { name: '_locales/en/messages.json', data: JSON.stringify({ extName: { message: 'Test extension' }, extDesc: { message: 'English description' } }) },
    { name: '_locales/fr/messages.json', data: '\ufeff// commentaire\n' + JSON.stringify({ EXTNAME: { message: 'Extension de test' } }) },
    { name: '_metadata/verified_contents.json', data: '[]' },
    ...more,
  ]);
}

const tmpDirs = [];
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-ext-test-'));
  tmpDirs.push(d);
  return d;
}
test.after(() => { for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true }); });

const serve = (buffer, status = 200) => async () => new Response(buffer, { status });

// --- parseStoreInput --------------------------------------------------------

test('parseStoreInput : adresses du Store et identifiants', () => {
  const id = 'eimadpbcbfnmbkopoojfekhnkhdbieeh';
  assert.equal(ext.parseStoreInput(id), id);
  assert.equal(ext.parseStoreInput(`  ${id}\n`), id);
  assert.equal(ext.parseStoreInput(`https://chromewebstore.google.com/detail/dark-reader/${id}`), id);
  assert.equal(ext.parseStoreInput(`https://chromewebstore.google.com/detail/dark-reader/${id}?hl=fr&pli=1#x`), id);
  assert.equal(ext.parseStoreInput(`https://chromewebstore.google.com/detail/${id}`), id);
  assert.equal(ext.parseStoreInput(`chromewebstore.google.com/detail/dark-reader/${id}/reviews`), id);
  assert.equal(ext.parseStoreInput(`https://chrome.google.com/webstore/detail/dark-reader/${id}?hl=en`), id);
  assert.equal(ext.parseStoreInput(`https://chrome.google.com/webstore/detail/${id}`), id);

  assert.equal(ext.parseStoreInput(''), null);
  assert.equal(ext.parseStoreInput(null), null);
  assert.equal(ext.parseStoreInput('eimadpbcbfnmbkopoojfekhnkhdbiee'), null); // 31 caractères
  assert.equal(ext.parseStoreInput('eimadpbcbfnmbkopoojfekhnkhdbieez'), null); // hors a–p
  assert.equal(ext.parseStoreInput(id.toUpperCase()), null);
  assert.equal(ext.parseStoreInput(`https://evil.example/detail/x/${id}`), null);
  assert.equal(ext.parseStoreInput(`https://chromewebstore.google.com.evil.example/detail/x/${id}`), null);
  assert.equal(ext.parseStoreInput(`https://chromewebstore.google.com/category/extensions?x=${id}`), null);
  assert.equal(ext.parseStoreInput(`javascript://chromewebstore.google.com/detail/x/${id}`), null);
  assert.equal(ext.parseStoreInput('dark reader'), null);
});

// --- parseCrx / verifyCrx ---------------------------------------------------

test('parseCrx : en-tête, clé publique, identifiant et archive', () => {
  const zip = extensionZip();
  const { crx, pub, id } = makeCrx(zip, KEYS);
  const parsed = ext.parseCrx(crx);
  assert.equal(parsed.version, 3);
  assert.ok(parsed.publicKey.equals(pub));
  assert.ok(parsed.zip.equals(zip));
  assert.match(parsed.id, /^[a-p]{32}$/);
  assert.equal(parsed.id, id);
  // Dérivation indépendante : SHA-256, 16 premiers octets, chiffres hexadécimaux -> a–p.
  const hex = crypto.createHash('sha256').update(pub).digest('hex').slice(0, 32);
  assert.equal(parsed.id, [...hex].map((c) => 'abcdefghijklmnop'[parseInt(c, 16)]).join(''));
  assert.deepEqual(ext.verifyCrx(parsed), { developer: true, store: false, proofs: 1 });
});

test('idFromPublicKey : valeur connue', () => {
  // SHA-256 d'un tampon vide : e3b0c442 98fc1c14 9afbf4c8 996fb924…
  assert.equal(ext.idFromPublicKey(Buffer.alloc(0)), 'odlameecjipmbmbejkplpemijjgpljce');
});

test('parseCrx : fichiers invalides refusés', () => {
  const { crx } = makeCrx(extensionZip(), KEYS);
  assert.throws(() => ext.parseCrx(Buffer.from('PK\x03\x04 pas un crx')), { code: 'EXT_BAD_CRX' });
  assert.throws(() => ext.parseCrx(Buffer.alloc(4)), { code: 'EXT_BAD_CRX' });
  const v2 = Buffer.from(crx); v2.writeUInt32LE(2, 4);
  assert.throws(() => ext.parseCrx(v2), { code: 'EXT_BAD_CRX' });
  const long = Buffer.from(crx); long.writeUInt32LE(crx.length, 8);
  assert.throws(() => ext.parseCrx(long), { code: 'EXT_BAD_CRX' });
  assert.throws(() => ext.parseCrx(crx.subarray(0, 40)), { code: 'EXT_BAD_CRX' });
});

test('verifyCrx : archive modifiée après signature refusée', () => {
  const { crx } = makeCrx(extensionZip(), KEYS, { breakSignature: true });
  assert.throws(() => ext.verifyCrx(ext.parseCrx(crx)), { code: 'EXT_BAD_SIGNATURE' });
});

test('verifyCrx : toutes les preuves comptent (RSA et ECDSA)', () => {
  const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const good = makeCrx(extensionZip(), KEYS, { extraProofs: [{ type: 'ecdsa', keys: ec }, { type: 'rsa', keys: rsa() }] });
  assert.deepEqual(ext.verifyCrx(ext.parseCrx(good.crx)), { developer: true, store: false, proofs: 3 });
  // Une preuve ECDSA rangée dans le champ RSA : type de clé incohérent.
  const mixed = makeCrx(extensionZip(), KEYS, { extraProofs: [{ type: 'rsa', keys: ec }] });
  assert.throws(() => ext.verifyCrx(ext.parseCrx(mixed.crx)), { code: 'EXT_BAD_SIGNATURE' });
  // Une seconde signature fausse fait tout refuser, même si celle du développeur est juste.
  const parsed = ext.parseCrx(good.crx);
  parsed.proofs[2].signature[10] ^= 1;
  assert.throws(() => ext.verifyCrx(parsed), { code: 'EXT_BAD_SIGNATURE' });
});

test('parseCrx : identifiant annoncé sans clé correspondante refusé', () => {
  // En-tête dont le crx_id ne correspond à aucune clé : on ne peut pas se
  // faire passer pour une autre extension en ne changeant que l'identifiant.
  const { crx } = makeCrx(extensionZip(), KEYS);
  const forged = Buffer.from(crx);
  const headerSize = forged.readUInt32LE(8);
  forged[12 + headerSize - 1] ^= 0xff; // dernier octet du crx_id
  assert.throws(() => ext.parseCrx(forged), { code: 'EXT_BAD_CRX' });
});

// --- Clé injectée -----------------------------------------------------------

test('injectKey : la clé donne le même identifiant, le reste est conservé', () => {
  const { pub, id } = makeCrx(extensionZip(), KEYS);
  const out = JSON.parse(ext.injectKey('\ufeff{\n // commentaire\n "name": "a // b", /* x */ "version": "1"\n}', pub));
  assert.equal(out.name, 'a // b');
  assert.equal(out.version, '1');
  assert.equal(ext.idFromPublicKey(Buffer.from(out.key, 'base64')), id);
  assert.throws(() => ext.injectKey('[]', pub), { code: 'EXT_BAD_MANIFEST' });
  assert.throws(() => ext.injectKey('{ pas du json', pub), { code: 'EXT_BAD_MANIFEST' });
});

// --- unzip ------------------------------------------------------------------

test('unzip : fichiers stockés et compressés, dossiers', async () => {
  const dest = path.join(tmp(), 'out');
  const big = 'abc'.repeat(5000);
  const res = await ext.unzip(makeZip([
    { name: 'a.txt', data: 'bonjour', method: 0 },
    { name: 'sub/', data: '', method: 0, mode: 0o040755 },
    { name: 'sub/deep/b.txt', data: big },
    { name: 'win\\c.txt', data: 'c' },
    { name: 'exec.sh', data: '#!/bin/sh', mode: 0o100755 },
  ]), dest);
  assert.deepEqual(res, { files: 4, bytes: 7 + big.length + 1 + 9 });
  assert.equal(fs.readFileSync(path.join(dest, 'a.txt'), 'utf8'), 'bonjour');
  assert.equal(fs.readFileSync(path.join(dest, 'sub/deep/b.txt'), 'utf8'), big);
  assert.equal(fs.readFileSync(path.join(dest, 'win/c.txt'), 'utf8'), 'c');
  // Le bit d'exécution annoncé par l'archive n'est pas repris.
  assert.equal(fs.statSync(path.join(dest, 'exec.sh')).mode & 0o111, 0);
});

test('unzip : chemins dangereux refusés, rien n\'est écrit dehors', async () => {
  const root = tmp();
  const cases = ['../evil.txt', 'a/../../evil.txt', '/etc/evil.txt', 'C:\\evil.txt', '..\\evil.txt', 'a/b/../../../evil.txt', 'nul\0.txt'];
  for (const name of cases) {
    const dest = path.join(root, 'out');
    await assert.rejects(ext.unzip(makeZip([{ name: 'ok.txt', data: 'ok' }, { name, data: 'evil' }]), dest), { code: 'EXT_UNSAFE_ZIP' }, name);
    // Le refus a lieu avant toute écriture : même l'entrée saine n'est pas extraite.
    assert.equal(fs.existsSync(path.join(dest, 'ok.txt')), false, name);
  }
  assert.equal(fs.existsSync(path.join(root, 'evil.txt')), false);
  assert.deepEqual(fs.readdirSync(root).filter((n) => n !== 'out'), []);
});

test('unzip : liens symboliques et fichiers spéciaux refusés', async () => {
  const dest = path.join(tmp(), 'out');
  await assert.rejects(ext.unzip(makeZip([{ name: 'link', data: '/etc/passwd', method: 0, mode: 0o120777 }]), dest), { code: 'EXT_UNSAFE_ZIP' });
  await assert.rejects(ext.unzip(makeZip([{ name: 'fifo', data: '', method: 0, mode: 0o010644 }]), dest), { code: 'EXT_UNSAFE_ZIP' });
  assert.equal(fs.existsSync(path.join(dest, 'link')), false);
});

test('unzip : plafonds de taille et de nombre de fichiers', async () => {
  const dest = path.join(tmp(), 'out');
  const kb = 'x'.repeat(1024);
  // Taille totale annoncée au-dessus du plafond.
  await assert.rejects(ext.unzip(makeZip([{ name: 'a', data: kb }, { name: 'b', data: kb }]), dest, { maxBytes: 1500 }), { code: 'EXT_ZIP_TOO_BIG' });
  // Un seul fichier trop gros.
  await assert.rejects(ext.unzip(makeZip([{ name: 'a', data: kb }]), dest, { maxEntryBytes: 1000 }), { code: 'EXT_ZIP_TOO_BIG' });
  // Trop de fichiers.
  await assert.rejects(ext.unzip(makeZip([{ name: 'a', data: '1' }, { name: 'b', data: '2' }, { name: 'c', data: '3' }]), dest, { maxFiles: 2 }), { code: 'EXT_ZIP_TOO_BIG' });
  // Bombe : 1 Mo de zéros annoncé comme 10 octets. La décompression s'arrête au plafond.
  const bomb = makeZip([{ name: 'bomb', data: Buffer.alloc(1024 * 1024), declaredSize: 10 }]);
  await assert.rejects(ext.unzip(bomb, dest, { maxBytes: 4096 }), { code: 'EXT_ZIP_TOO_BIG' });
  // Même sans plafond atteint, une taille mensongère est refusée.
  await assert.rejects(ext.unzip(bomb, dest), { code: 'EXT_BAD_ZIP' });
  assert.equal(fs.existsSync(path.join(dest, 'bomb')), false);
  // Juste sous le plafond : accepté.
  await ext.unzip(makeZip([{ name: 'a', data: kb }]), dest, { maxBytes: 1024, maxEntryBytes: 1024, maxFiles: 1 });
});

test('unzip : archive corrompue refusée', async () => {
  const dest = path.join(tmp(), 'out');
  await assert.rejects(ext.unzip(Buffer.from('pas un zip'), dest), { code: 'EXT_BAD_ZIP' });
  const zip = makeZip([{ name: 'a.txt', data: 'bonjour bonjour bonjour', method: 0 }]);
  zip[30 + 5 + 3] ^= 0xff; // contenu modifié : la somme de contrôle ne correspond plus
  await assert.rejects(ext.unzip(zip, dest), { code: 'EXT_BAD_ZIP' });
});

// --- Installation complète (faux Store) -------------------------------------

test('install : un contrôle qui refuse la mise à jour laisse la version installée intacte', async () => {
  const dir = path.join(tmp(), 'Extensions');
  const v1 = makeCrx(extensionZip(), KEYS);
  const v2 = makeCrx(extensionZip({ ...MANIFEST, version: '2.0.0', permissions: ['storage', 'tabs', 'history'] }), KEYS);
  let served = v1.crx;
  ext.configure({ dir, lang: 'fr', requireStoreSignature: false, fetch: async () => new Response(served) });
  const rec = await ext.install(v1.id);
  served = v2.crx;
  const seen = [];
  await assert.rejects(ext.install(v1.id, { check: async (m) => { seen.push(m.version, m.permissions.join()); throw Object.assign(new Error('refus'), { code: 'EXT_REFUSED' }); } }), { code: 'EXT_REFUSED' });
  assert.deepEqual(seen, ['2.0.0', 'storage,tabs,history']); // le contrôle voit le manifeste vérifié de la nouvelle version
  assert.equal(ext.get(v1.id).version, '1.2.3');
  assert.equal(ext.get(v1.id).dir, rec.dir);
  assert.deepEqual(fs.readdirSync(dir).filter((n) => n.startsWith('.tmp-')), []);
  assert.deepEqual(fs.readdirSync(path.join(dir, v1.id)).length, 1);
  // Accepté : la bascule se fait.
  const ok = await ext.install(v1.id, { check: async () => {} });
  assert.equal(ok.version, '2.0.0');
});

test('install : téléchargement, vérification, clé, liste, mise à jour, suppression', async () => {
  const dir = path.join(tmp(), 'Extensions');
  const v1 = makeCrx(extensionZip(), KEYS);
  const id = v1.id;
  let asked = '';
  ext.configure({ dir, lang: 'fr', requireStoreSignature: false, fetch: async (url) => { asked = url; return new Response(v1.crx); } });

  assert.deepEqual(ext.list(), []);
  assert.equal(ext.isEnabled(id), false);
  const rec = await ext.install(`https://chromewebstore.google.com/detail/test/${id}`);
  assert.ok(asked.startsWith('https://clients2.google.com/service/update2/crx?'));
  assert.ok(asked.includes(`x=id%3D${id}%26uc`));
  assert.equal(rec.id, id);
  assert.equal(rec.name, 'Extension de test'); // français d'abord
  assert.equal(rec.description, 'English description'); // puis anglais
  assert.equal(rec.version, '1.2.3');
  assert.deepEqual(rec.permissions, ['storage', 'tabs']);
  assert.deepEqual(rec.hostPermissions, ['https://*.example.com/*', '<all_urls>']);
  assert.equal(rec.icon, path.join(rec.dir, 'icons/128.png'));
  assert.ok(rec.dir.startsWith(path.join(dir, id) + path.sep));
  assert.deepEqual(rec.verified, { developer: true, store: false, proofs: 1 });

  // La clé injectée redonne l'identifiant du Store ; _metadata n'est pas extrait.
  const manifest = JSON.parse(fs.readFileSync(path.join(rec.dir, 'manifest.json'), 'utf8'));
  assert.equal(ext.idFromPublicKey(Buffer.from(manifest.key, 'base64')), id);
  assert.equal(manifest.name, '__MSG_extName__');
  assert.equal(fs.existsSync(path.join(rec.dir, '_metadata')), false);
  assert.deepEqual(fs.readdirSync(dir).filter((n) => n.startsWith('.tmp-')), []);

  assert.equal(ext.list().length, 1);
  assert.equal(ext.list()[0].dir, rec.dir);
  assert.deepEqual(ext.popupFor(id), { url: `chrome-extension://${id}/ui/popup.html`, title: 'Extension de test', icon: path.join(rec.dir, 'icons/16.png') });
  assert.equal(ext.popupFor('a'.repeat(32)), null);

  // État activé/désactivé, conservé sur le disque et à travers une mise à jour.
  assert.equal(ext.isEnabled(id), true);
  assert.equal(ext.setEnabled(id, false), true);
  assert.equal(ext.setEnabled('a'.repeat(32), false), false);
  ext.configure({ dir }); // relit state.json
  assert.equal(ext.isEnabled(id), false);

  const v2 = makeCrx(extensionZip({ ...MANIFEST, version: '2.0.0', action: undefined }), KEYS);
  ext.configure({ fetch: serve(v2.crx) });
  const rec2 = await ext.install(id);
  assert.equal(rec2.version, '2.0.0');
  assert.notEqual(rec2.dir, rec.dir);
  assert.equal(fs.existsSync(rec.dir), false); // ancienne version supprimée
  assert.deepEqual(fs.readdirSync(path.join(dir, id)), [path.basename(rec2.dir)]);
  assert.equal(ext.isEnabled(id), false);
  assert.equal(ext.popupFor(id), null);

  assert.equal(await ext.remove(id), true);
  assert.deepEqual(ext.list(), []);
  assert.equal(fs.existsSync(path.join(dir, id)), false);
  assert.equal(await ext.remove(id), false);
});

test('install : refus, sans rien laisser sur le disque', async () => {
  const dir = path.join(tmp(), 'Extensions');
  const mine = makeCrx(extensionZip(), KEYS);
  const other = makeCrx(extensionZip(), rsa());
  const clean = () => assert.deepEqual(fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n !== 'state.json') : [], []);

  ext.configure({ dir, requireStoreSignature: false, fetch: serve(other.crx) });
  await assert.rejects(ext.install('pas un identifiant'), { code: 'EXT_BAD_ID' });
  // Le serveur renvoie une extension valide, mais pas celle demandée.
  await assert.rejects(ext.install(mine.id), { code: 'EXT_ID_MISMATCH' });
  clean();

  ext.configure({ fetch: serve(makeCrx(extensionZip(), KEYS, { breakSignature: true }).crx) });
  await assert.rejects(ext.install(mine.id), { code: 'EXT_BAD_SIGNATURE' });
  clean();

  // Signature du Store exigée (réglage par défaut) : un CRX signé par son seul auteur est refusé.
  ext.configure({ requireStoreSignature: true, fetch: serve(mine.crx) });
  await assert.rejects(ext.install(mine.id), { code: 'EXT_NOT_FROM_STORE' });
  clean();
  ext.configure({ requireStoreSignature: false });

  // Archive piégée, pourtant correctement signée : l'extraction échoue et le dossier temporaire disparaît.
  const evil = makeCrx(extensionZip(MANIFEST, [{ name: '../../evil.txt', data: 'x' }]), KEYS);
  ext.configure({ fetch: serve(evil.crx) });
  await assert.rejects(ext.install(mine.id), { code: 'EXT_UNSAFE_ZIP' });
  clean();
  assert.equal(fs.existsSync(path.join(dir, '..', 'evil.txt')), false);

  ext.configure({ fetch: serve(makeCrx(makeZip([{ name: 'readme.txt', data: 'x' }]), KEYS).crx) });
  await assert.rejects(ext.install(mine.id), { code: 'EXT_BAD_MANIFEST' });
  ext.configure({ fetch: serve(makeCrx(extensionZip({ ...MANIFEST, theme: {} }), KEYS).crx) });
  await assert.rejects(ext.install(mine.id), { code: 'EXT_UNSUPPORTED' });
  clean();

  ext.configure({ fetch: serve(null, 204) });
  await assert.rejects(ext.install(mine.id), { code: 'EXT_NOT_FOUND' });
  ext.configure({ fetch: serve('non', 500) });
  await assert.rejects(ext.install(mine.id), { code: 'EXT_DOWNLOAD' });
  ext.configure({ fetch: async () => { throw new Error('hors ligne'); } });
  await assert.rejects(ext.install(mine.id), { code: 'EXT_DOWNLOAD' });
  clean();
  assert.deepEqual(ext.list(), []);
});

// --- Sessions (fausse session Electron) -------------------------------------

function fakeSession({ persistent = true, failOn = null } = {}) {
  const loaded = new Map();
  const calls = [];
  return {
    calls,
    isPersistent: () => persistent,
    extensions: {
      getAllExtensions: () => [...loaded.values()],
      getExtension: (id) => loaded.get(id) || null,
      removeExtension: (id) => { calls.push('remove ' + id); loaded.delete(id); },
      loadExtension: async (p, options) => {
        assert.deepEqual(options, { allowFileAccess: false });
        const manifest = JSON.parse(fs.readFileSync(path.join(p, 'manifest.json'), 'utf8'));
        const id = ext.idFromPublicKey(Buffer.from(manifest.key, 'base64'));
        calls.push('load ' + id);
        if (failOn === id) throw new Error('Manifest refusé');
        const e = { id, path: p, version: manifest.version };
        loaded.set(id, e);
        return e;
      },
    },
  };
}

test('loadInto : charge, ne recharge pas, suit activation, mise à jour et suppression', async () => {
  const dir = path.join(tmp(), 'Extensions');
  const a = makeCrx(extensionZip(), KEYS);
  const bKeys = rsa();
  const b = makeCrx(extensionZip({ ...MANIFEST, name: 'Autre', version: '0.1' }), bKeys);
  ext.configure({ dir, requireStoreSignature: false, fetch: serve(a.crx) });
  await ext.install(a.id);
  ext.configure({ fetch: serve(b.crx) });
  await ext.install(b.id);

  // Navigation privée : ignorée sans erreur, aucun appel à Electron.
  const priv = fakeSession({ persistent: false });
  assert.deepEqual(await ext.loadInto(priv), { loaded: [], unloaded: [], failed: [], skipped: true });
  assert.deepEqual(priv.calls, []);
  assert.equal(await ext.unloadFrom(priv, a.id), false);

  const ses = fakeSession();
  const first = await ext.loadInto(ses);
  assert.deepEqual(first.loaded.sort(), [a.id, b.id].sort());
  assert.deepEqual(first.failed, []);
  // Idempotent : un second appel, même simultané, ne recharge rien.
  const [r1, r2] = await Promise.all([ext.loadInto(ses), ext.loadInto(ses)]);
  assert.deepEqual([r1.loaded, r2.loaded, r1.unloaded], [[], [], []]);
  assert.equal(ses.calls.filter((c) => c.startsWith('load')).length, 2);

  // Une extension étrangère (chargée par ailleurs) n'est jamais retirée.
  const foreign = tmp();
  fs.writeFileSync(path.join(foreign, 'manifest.json'), ext.injectKey('{"name":"x","version":"1"}', rsa().publicKey.export({ type: 'spki', format: 'der' })));
  await ses.extensions.loadExtension(foreign, { allowFileAccess: false });
  assert.equal(ses.extensions.getAllExtensions().length, 3);

  // Désactiver retire l'extension des sessions connues.
  ext.setEnabled(a.id, false);
  await ext.syncAll();
  assert.equal(ses.extensions.getExtension(a.id), null);
  assert.ok(ses.extensions.getExtension(b.id));
  assert.equal(ses.extensions.getAllExtensions().length, 2);
  // Réactiver la recharge (setEnabled lance la synchronisation en arrière-plan).
  ext.setEnabled(a.id, true);
  await ext.syncAll();
  assert.ok(ses.extensions.getExtension(a.id));

  // unloadFrom ne désactive pas : le prochain loadInto la recharge.
  assert.equal(await ext.unloadFrom(ses, b.id), true);
  assert.equal(await ext.unloadFrom(ses, b.id), false);
  assert.deepEqual((await ext.loadInto(ses)).loaded, [b.id]);

  // Mise à jour : la session passe au nouveau dossier.
  const b2 = makeCrx(extensionZip({ ...MANIFEST, name: 'Autre', version: '0.2' }), bKeys);
  ext.configure({ fetch: serve(b2.crx) });
  const rec = await ext.install(b.id);
  assert.equal(ses.extensions.getExtension(b.id).version, '0.2');
  assert.equal(ses.extensions.getExtension(b.id).path, rec.dir);

  // Suppression : retirée de la session avant de quitter le disque.
  await ext.remove(b.id);
  assert.equal(ses.extensions.getExtension(b.id), null);
  assert.equal(ses.extensions.getAllExtensions().length, 2);
  assert.deepEqual((await ext.loadInto(ses)).loaded, []);
});

test('loadInto : l\'échec d\'une extension n\'empêche pas les autres', async () => {
  const dir = path.join(tmp(), 'Extensions');
  const a = makeCrx(extensionZip(), rsa());
  const b = makeCrx(extensionZip({ ...MANIFEST, name: 'Autre' }), rsa());
  ext.configure({ dir, requireStoreSignature: false, fetch: serve(a.crx) });
  await ext.install(a.id);
  ext.configure({ fetch: serve(b.crx) });
  await ext.install(b.id);
  const ses = fakeSession({ failOn: a.id });
  const report = await ext.loadInto(ses);
  assert.deepEqual(report.loaded, [b.id]);
  assert.equal(report.failed.length, 1);
  assert.equal(report.failed[0].id, a.id);
  assert.match(report.failed[0].error, /Manifest refusé/);
  assert.equal(report.skipped, false);
});

test('list : survit à la perte de state.json', async () => {
  const dir = path.join(tmp(), 'Extensions');
  const a = makeCrx(extensionZip(), rsa());
  ext.configure({ dir, lang: 'de', requireStoreSignature: false, fetch: serve(a.crx) });
  const rec = await ext.install(a.id);
  assert.equal(rec.name, 'Test extension'); // pas d'allemand : anglais
  fs.rmSync(path.join(dir, 'state.json'));
  fs.mkdirSync(path.join(dir, 'pas-une-extension'));
  ext.configure({ dir, lang: 'fr' });
  assert.equal(ext.list().length, 1);
  assert.equal(ext.list()[0].dir, rec.dir);
  assert.equal(ext.isEnabled(a.id), true);
});
