// Tests de la fabrication pour Windows, sans lancer le navigateur :
// fusibles (scripts/fuses.js), ressources de l'exécutable
// (scripts/pe-resources.js) et inscription au registre (src/main/win-default.js).
//   node --test tests/pe-resources.test.js
// Les tests sur un vrai exécutable prennent electron.exe : celui du moteur
// installé sous Windows, ou ORBE_PE_SAMPLE=<chemin vers electron.exe>
// (archive « electron-v…-win32-x64.zip » décompressée). Sans lui, ils sont sautés.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pe = require('../scripts/pe-resources');
const fuses = require('../scripts/fuses');
const { decodePng } = require('../scripts/make-ico');
const winDefault = require('../src/main/win-default');

const root = path.join(__dirname, '..');
const ico = path.join(root, 'assets', 'orbe.ico');
const runtime = process.env.ORBE_RUNTIME || path.join(os.homedir(), '.orbe-dev');
const sample = [process.env.ORBE_PE_SAMPLE, path.join(runtime, 'node_modules', 'electron', 'dist', 'electron.exe')].find((f) => f && fs.existsSync(f));
const real = { skip: sample ? false : 'electron.exe absent (voir ORBE_PE_SAMPLE)' };
let cached = null;
const exe = () => cached || (cached = fs.readFileSync(sample));

const VERSION = { ProductName: 'Orbe', FileDescription: 'Orbe', CompanyName: 'PIXEWORK', FileVersion: '1.2.3', ProductVersion: '1.2.3', OriginalFilename: 'Orbe.exe' };

// --- Fusibles -------------------------------------------------------------------
test('fusibles : coupe RunAsNode, NODE_OPTIONS et --inspect, garde les autres', () => {
  const table = Buffer.concat([Buffer.from('xx'), fuses.FUSE_SENTINEL, Buffer.from([1, 9]), Buffer.from('101100011'), Buffer.from('yy')]);
  // Une fausse sentinelle (texte quelconque derrière) ne doit pas être prise pour une table.
  const buf = Buffer.concat([fuses.FUSE_SENTINEL, Buffer.from('pas une table'), table]);
  assert.throws(() => fuses.fuseStates(buf), /RunAsNode encore actif/);
  assert.strictEqual(fuses.cutFusesIn(buf), 1);
  assert.deepStrictEqual(fuses.fuseStates(buf), ['000000011']);
  assert.throws(() => fuses.fuseStates(Buffer.from('rien')), /introuvables/);
});

test('fusibles : electron.exe', real, () => {
  const buf = Buffer.from(exe());
  assert.strictEqual(fuses.fuseWires(buf).length, 1);
  fuses.cutFusesIn(buf);
  const [states] = fuses.fuseStates(buf);
  assert.strictEqual(states[0] + states[2] + states[3], '000');
});

// --- Informations de version ------------------------------------------------------
test('version : numéros', () => {
  assert.deepStrictEqual(pe.versionParts('0.8.1'), [0, 8, 1, 0]);
  assert.deepStrictEqual(pe.versionParts('44.5.1+wvcus'), [44, 5, 1, 0]);
  assert.deepStrictEqual(pe.versionParts('1.2.3.4.5'), [1, 2, 3, 4]);
});

test('version : bloc écrit puis relu, aligné sur 4 octets', () => {
  const fixed = Buffer.alloc(52);
  fixed.writeUInt32LE(0xfeef04bd, 0);
  const info = { fixed, tables: [{ lang: '040c04b0', strings: [['ProductName', 'Orbe'], ['LegalCopyright', 'Logiciel libre — licence MIT'], ['Vide', '']] }], others: [] };
  const data = pe.buildVersion(info);
  assert.strictEqual(data.readUInt16LE(0), data.length);
  const back = pe.parseVersion(data);
  assert.deepStrictEqual(back.tables, info.tables);
  assert.ok(back.fixed.equals(fixed));
  // Chaque chaîne commence sur un multiple de 4.
  const at = data.indexOf(Buffer.from('LegalCopyright', 'utf16le')) - 6;
  assert.strictEqual(at % 4, 0);
});

// --- Icône ------------------------------------------------------------------------
test('icône : image classique (BMP et masque) à partir de pixels RVBA', () => {
  const img = { width: 2, height: 2, data: Buffer.from([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 9, 8, 7, 255]) };
  const dib = pe.dibIcon(img);
  assert.strictEqual(dib.readUInt32LE(0), 40);
  assert.strictEqual(dib.readInt32LE(8), 4, 'hauteur doublée');
  assert.strictEqual(dib.length, 40 + 16 + 8);
  // Lignes de bas en haut, pixels en BVRA : le premier écrit est celui d'en bas à gauche.
  assert.deepStrictEqual([...dib.subarray(40, 44)], [255, 0, 0, 0]);
  assert.deepStrictEqual([...dib.subarray(48, 52)], [0, 0, 255, 255]);
  // Masque : seul le pixel transparent (en bas à gauche) est marqué.
  assert.strictEqual(dib[56], 0x80);
  assert.strictEqual(dib[60], 0);
});

test('icône : assets/orbe.ico se relit, toutes tailles', () => {
  const images = pe.readIco(fs.readFileSync(ico));
  assert.deepStrictEqual(images.map((i) => i.width || 256), [16, 24, 32, 48, 64, 128, 256]);
  for (const im of images) assert.strictEqual(decodePng(im.data).width, im.width || 256);
});

// --- Arbre des ressources -----------------------------------------------------------
test('ressources : arbre écrit puis relu (noms avant numéros, tri, données)', () => {
  const leaf = (data) => ({ head: Buffer.alloc(12), entries: [{ id: 1036, data: Buffer.from(data), codepage: 1252 }] });
  const dir = (entries) => ({ head: Buffer.alloc(12), entries });
  const tree = dir([{ id: 24, dir: dir([{ id: 1, dir: leaf('manifeste') }]) }, { id: 3, dir: dir([{ id: 2, dir: leaf('b') }, { name: 'zeta', dir: leaf('z') }, { name: 'ALPHA', dir: leaf('a') }, { id: 1, dir: leaf('abc') }]) }]);
  const rva = 0x5000;
  const data = pe.writeTree(tree, rva);
  assert.strictEqual(data.length % 8, 0);
  // Relecture par un faux exécutable réduit à sa table de sections.
  const fake = { sections: [{ name: '.rsrc', rva, vsize: data.length, raw: 0, rawSize: data.length }], dir: () => ({ rva, size: data.length }) };
  const back = pe.readTree(data, fake).root;
  assert.deepStrictEqual(pe.listResources(back), [
    { type: 3, name: 'ALPHA', lang: 1036, size: 1 }, { type: 3, name: 'zeta', lang: 1036, size: 1 },
    { type: 3, name: 1, lang: 1036, size: 3 }, { type: 3, name: 2, lang: 1036, size: 1 },
    { type: 24, name: 1, lang: 1036, size: 9 },
  ]);
  assert.strictEqual(back.entries[1].dir.entries[0].dir.entries[0].data.toString(), 'manifeste');
  assert.strictEqual(back.entries[1].dir.entries[0].dir.entries[0].codepage, 1252);
  // Données désignées hors de la section : refus net.
  const bad = Buffer.from(data);
  bad.writeUInt32LE(0x7fff0000, tree.entries[0].dir.entries[0].dir.entries[0].off);
  assert.throws(() => pe.readTree(bad, fake), /abîmées/);
});

// --- Sur le vrai exécutable -----------------------------------------------------------
test('electron.exe : se relit et se vérifie tel quel', real, () => {
  const { pe: head, root: tree } = pe.verify(exe());
  assert.ok(head.plus, 'exécutable 64 bits');
  assert.strictEqual(pe.getVersion(tree).strings.ProductName, 'Electron');
  assert.ok(pe.getIcon(tree).length >= 1);
  assert.ok(pe.listResources(tree).some((r) => r.type === 24), 'manifeste présent');
});

test('electron.exe : réécriture sans changement, ressources identiques', real, () => {
  const before = pe.readTree(exe(), pe.parsePE(exe())).root;
  const out = pe.rebuild(exe(), pe.readTree(exe(), pe.parsePE(exe())).root);
  assert.strictEqual(out.length, exe().length);
  const { pe: head, root: after } = pe.verify(out);
  assert.deepStrictEqual(pe.listResources(after), pe.listResources(before));
  assert.strictEqual(out.readUInt32LE(head.checksumAt), pe.checksum(out, head.checksumAt));
  // Tout ce qui précède .rsrc est intact, somme de contrôle et tailles mises à part.
  const rsrc = head.sections.find((s) => s.name === '.rsrc');
  const a = Buffer.from(exe().subarray(0, rsrc.raw));
  const b = Buffer.from(out.subarray(0, rsrc.raw));
  for (const x of [a, b]) { x.fill(0, 0, pe.parsePE(exe()).sections[0].raw); }
  assert.ok(a.equals(b), 'code et données inchangés');
});

test('electron.exe : version seule, sans déplacement de section', real, () => {
  const before = pe.parsePE(exe());
  const { root: tree } = pe.readTree(exe(), before);
  pe.setVersion(tree, VERSION);
  const out = pe.rebuild(exe(), tree);
  const { pe: head, root: after } = pe.verify(out);
  const v = pe.getVersion(after);
  for (const [k, val] of Object.entries(VERSION)) assert.strictEqual(v.strings[k], val);
  assert.strictEqual(v.fileVersion, '1.2.3.0');
  assert.strictEqual(v.productVersion, '1.2.3.0');
  assert.strictEqual(head.sizeOfImage, before.sizeOfImage);
  assert.deepStrictEqual(head.sections.map((s) => s.rva), before.sections.map((s) => s.rva));
});

test('electron.exe : icône et version, .reloc déplacée, tout reste cohérent', real, () => {
  const before = pe.parsePE(exe());
  const { root: tree } = pe.readTree(exe(), before);
  const kept = pe.listResources(tree).filter((r) => r.type !== pe.RT_ICON && r.type !== pe.RT_GROUP_ICON && r.type !== pe.RT_VERSION);
  assert.strictEqual(pe.setIcon(tree, fs.readFileSync(ico), { decodePng }), 7);
  pe.setVersion(tree, { ...VERSION, SquirrelAwareVersion: null });
  const out = pe.rebuild(exe(), tree);
  const { pe: head, root: after } = pe.verify(out);

  // Sections : .rsrc a grossi, .reloc a suivi, dans le fichier comme en mémoire.
  const [rsrc0, reloc0] = ['.rsrc', '.reloc'].map((n) => before.sections.find((s) => s.name === n));
  const [rsrc, reloc] = ['.rsrc', '.reloc'].map((n) => head.sections.find((s) => s.name === n));
  assert.ok(rsrc.vsize > rsrc0.vsize);
  assert.strictEqual(rsrc.rva, rsrc0.rva);
  assert.strictEqual(reloc.raw, rsrc.raw + rsrc.rawSize);
  assert.ok(reloc.rva > reloc0.rva);
  assert.strictEqual(head.dir(5).rva, reloc.rva, 'répertoire des relocalisations suivi');
  assert.strictEqual(head.dir(5).size, before.dir(5).size);
  assert.strictEqual(head.dir(2).size, rsrc.vsize);
  assert.strictEqual(head.sizeOfImage - before.sizeOfImage, reloc.rva - reloc0.rva);
  assert.strictEqual(out.length - exe().length, rsrc.rawSize - rsrc0.rawSize);
  // Le contenu de .reloc et de tout ce qui précède .rsrc n'a pas bougé d'un octet.
  assert.ok(out.subarray(reloc.raw, reloc.raw + reloc.rawSize).equals(exe().subarray(reloc0.raw, reloc0.raw + reloc0.rawSize)));
  assert.ok(out.subarray(before.sections[0].raw, rsrc.raw).equals(exe().subarray(before.sections[0].raw, rsrc0.raw)));
  // Les autres répertoires de données sont intacts.
  for (let i = 0; i < before.dirCount; i++) if (i !== 2 && i !== 5) assert.deepStrictEqual(head.dir(i), before.dir(i));

  // Icône : les sept tailles, celle de 32 pixels identique à celle du .ico.
  const icon = pe.getIcon(after);
  assert.deepStrictEqual(icon.map((i) => i.width), [16, 24, 32, 48, 64, 128, 256]);
  assert.ok(icon.every((i) => i.data && i.data.length === i.size));
  assert.strictEqual(icon[6].data.readUInt32BE(0), 0x89504e47, '256 pixels en PNG');
  const ref = decodePng(pe.readIco(fs.readFileSync(ico))[2].data);
  const dib = icon[2].data;
  assert.strictEqual(dib.readUInt32LE(0), 40);
  for (const [x, y] of [[0, 0], [16, 16], [31, 31], [5, 20]]) {
    const o = 40 + ((31 - y) * 32 + x) * 4;
    const i = (y * 32 + x) * 4;
    assert.deepStrictEqual([dib[o + 2], dib[o + 1], dib[o], dib[o + 3]], [...ref.data.subarray(i, i + 4)]);
  }
  // Version, et les autres ressources (curseurs, manifeste…) gardées telles quelles.
  const v = pe.getVersion(after);
  assert.strictEqual(v.strings.ProductName, 'Orbe');
  assert.strictEqual(v.strings.SquirrelAwareVersion, undefined);
  assert.deepStrictEqual(pe.listResources(after).filter((r) => r.type !== pe.RT_ICON && r.type !== pe.RT_GROUP_ICON && r.type !== pe.RT_VERSION), kept);
  const manifest = (t) => t.entries.find((e) => e.id === 24).dir.entries[0].dir.entries[0].data;
  assert.ok(manifest(after).equals(manifest(pe.readTree(exe(), before).root)));

  // Une seconde passe sur le résultat donne exactement le même fichier.
  const again = pe.readTree(out, pe.parsePE(out)).root;
  pe.setIcon(again, fs.readFileSync(ico), { decodePng });
  pe.setVersion(again, { ...VERSION, SquirrelAwareVersion: null });
  assert.ok(pe.rebuild(out, again).equals(out), 'opération répétable');
});

test('electron.exe : refuse de déplacer autre chose que .reloc', real, () => {
  const buf = Buffer.from(exe());
  const head = pe.parsePE(buf);
  const reloc = head.sections.find((s) => s.name === '.reloc');
  buf.write('.autre\0\0', reloc.at, 'latin1');
  const { root: tree } = pe.readTree(buf, pe.parsePE(buf));
  pe.setIcon(tree, fs.readFileSync(ico), { decodePng });
  assert.throws(() => pe.rebuild(buf, tree), /décalage refusé/);
});

test('exécutable abîmé : somme de contrôle fausse détectée', real, () => {
  const { root: tree } = pe.readTree(exe(), pe.parsePE(exe()));
  const out = pe.rebuild(exe(), tree);
  out[out.length - 1] ^= 0xff;
  assert.throws(() => pe.verify(out), /Somme de contrôle/);
});

// --- Inscription comme navigateur (registre) ------------------------------------------
test('registre : plan de l’inscription et fichier .reg', () => {
  const p = winDefault.plan({ exe: 'C:\\Outils\\Orbe\\Orbe.exe' });
  const flat = Object.fromEntries(p.keys.map((k) => [k.key.replace('HKEY_CURRENT_USER\\', ''), k.values]));
  assert.strictEqual(flat['Software\\Classes\\OrbeHTML\\shell\\open\\command'][''], '"C:\\Outils\\Orbe\\Orbe.exe" "%1"');
  assert.strictEqual(flat['Software\\Clients\\StartMenuInternet\\Orbe\\shell\\open\\command'][''], '"C:\\Outils\\Orbe\\Orbe.exe"');
  assert.deepStrictEqual(flat['Software\\Clients\\StartMenuInternet\\Orbe\\Capabilities\\URLAssociations'], { http: 'OrbeHTML', https: 'OrbeHTML' });
  assert.strictEqual(flat['Software\\Clients\\StartMenuInternet\\Orbe\\Capabilities\\FileAssociations']['.html'], 'OrbeHTML');
  assert.deepStrictEqual(p.values[0], { key: 'HKEY_CURRENT_USER\\Software\\RegisteredApplications', name: 'Orbe', value: 'Software\\Clients\\StartMenuInternet\\Orbe\\Capabilities' });
  // Tout est sous HKEY_CURRENT_USER.
  assert.ok([...p.keys, ...p.values].every((k) => k.key.startsWith('HKEY_CURRENT_USER\\Software\\')));

  const reg = winDefault.regFile(p);
  assert.ok(reg.startsWith('Windows Registry Editor Version 5.00\r\n'));
  assert.ok(reg.includes('[HKEY_CURRENT_USER\\Software\\Classes\\OrbeHTML\\shell\\open\\command]\r\n@="\\"C:\\\\Outils\\\\Orbe\\\\Orbe.exe\\" \\"%1\\""\r\n'));
  assert.ok(reg.includes('"IconsVisible"=dword:00000001'));
  assert.ok(reg.includes('[HKEY_CURRENT_USER\\Software\\RegisteredApplications]\r\n"Orbe"="Software\\\\Clients\\\\StartMenuInternet\\\\Orbe\\\\Capabilities"'));

  const undo = winDefault.regFile(p, true);
  assert.ok(undo.includes('[-HKEY_CURRENT_USER\\Software\\Classes\\OrbeHTML]'));
  assert.ok(undo.includes('[-HKEY_CURRENT_USER\\Software\\Clients\\StartMenuInternet\\Orbe]'));
  assert.ok(undo.includes('[HKEY_CURRENT_USER\\Software\\RegisteredApplications]\r\n"Orbe"=-'));
  // L'annulation ne retire aucune clé partagée, seulement des valeurs.
  assert.deepStrictEqual(undo.match(/^\[-.*\]$/gm).length, 2);

  // En développement : le moteur suivi du dossier du projet.
  const devPlan = winDefault.plan({ exe: 'C:\\e\\electron.exe', args: ['C:\\src\\orbe'], id: 'OrbeEssai' });
  assert.strictEqual(devPlan.keys.find((k) => k.key.endsWith('OrbeEssaiHTML\\shell\\open\\command')).values[''], '"C:\\e\\electron.exe" "C:\\src\\orbe" "%1"');
});
