#!/usr/bin/env node
// Réécrit les ressources d'un exécutable Windows (format PE), sans dépendance :
// l'icône (RT_GROUP_ICON et RT_ICON) et les informations de version
// (RT_VERSION). C'est ce que fait l'outil « rcedit ».
//
//   node scripts/pe-resources.js <fichier.exe>   -> affiche sections, ressources et version
//
// Méthode : la section .rsrc est relue en entier (arbre type / nom / langue),
// modifiée en mémoire, puis réécrite à la même adresse. Si elle grossit, les
// sections qui la suivent sont décalées dans le fichier et, si besoin, en
// mémoire. Un décalage en mémoire n'est sûr que pour .reloc, que rien ne
// désigne hormis la table des répertoires : toute autre section derrière
// .rsrc fait échouer l'opération plutôt que de produire un exécutable faux.
// Sont mis à jour : la table des sections, les répertoires de données,
// SizeOfImage, SizeOfInitializedData et la somme de contrôle. Une signature
// Authenticode, devenue fausse, est retirée.
const fs = require('fs');

const RT_ICON = 3;
const RT_GROUP_ICON = 14;
const RT_VERSION = 16;
const DIR_RESOURCE = 2;
const DIR_SECURITY = 4;

const align = (n, a) => Math.ceil(n / a) * a;

// --- En-têtes -------------------------------------------------------------------
function parsePE(buf) {
  if (buf.readUInt16LE(0) !== 0x5a4d) throw new Error('Pas un exécutable Windows (MZ absent).');
  const pe = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(pe) !== 0x4550) throw new Error('En-tête PE absent.');
  const coff = pe + 4;
  const count = buf.readUInt16LE(coff + 2);
  const optSize = buf.readUInt16LE(coff + 16);
  const opt = coff + 20;
  const magic = buf.readUInt16LE(opt);
  if (magic !== 0x20b && magic !== 0x10b) throw new Error('En-tête optionnel inconnu.');
  const plus = magic === 0x20b;
  const dirs = opt + (plus ? 112 : 96);
  const dirCount = buf.readUInt32LE(dirs - 4);
  const table = opt + optSize;
  const sections = [];
  for (let i = 0; i < count; i++) {
    const at = table + 40 * i;
    sections.push({
      at,
      name: buf.toString('latin1', at, at + 8).replace(/\0+$/, ''),
      vsize: buf.readUInt32LE(at + 8),
      rva: buf.readUInt32LE(at + 12),
      rawSize: buf.readUInt32LE(at + 16),
      raw: buf.readUInt32LE(at + 20),
      flags: buf.readUInt32LE(at + 36),
    });
  }
  return {
    opt, plus, dirs, dirCount, sections,
    sectionAlign: buf.readUInt32LE(opt + 32),
    fileAlign: buf.readUInt32LE(opt + 36),
    sizeOfImage: buf.readUInt32LE(opt + 56),
    checksumAt: opt + 64,
    dir: (i) => ({ rva: buf.readUInt32LE(dirs + 8 * i), size: buf.readUInt32LE(dirs + 8 * i + 4) }),
  };
}

// Somme de contrôle d'un PE : addition des mots de 16 bits avec report, le
// champ lui-même compté pour zéro, plus la taille du fichier.
function checksum(buf, checksumAt) {
  let sum = 0;
  const even = buf.length & ~1;
  for (let i = 0; i < even; i += 2) {
    if (i === checksumAt || i === checksumAt + 2) continue;
    sum += buf.readUInt16LE(i);
    if (sum > 0xffffffff) sum = (sum & 0xffff) + Math.floor(sum / 0x10000);
  }
  if (buf.length & 1) sum += buf[buf.length - 1];
  sum = (sum & 0xffff) + Math.floor(sum / 0x10000);
  sum = (sum & 0xffff) + (sum >>> 16);
  return ((sum & 0xffff) + buf.length) >>> 0;
}

// --- Arbre des ressources ---------------------------------------------------------
// Un répertoire : { head: 16 octets d'en-tête, entries: [{ id | name, dir | data, codepage }] }.
function readTree(buf, pe) {
  const d = pe.dir(DIR_RESOURCE);
  if (!d.rva) throw new Error('Cet exécutable n’a pas de ressources.');
  const sec = pe.sections.find((s) => d.rva >= s.rva && d.rva < s.rva + Math.max(s.vsize, s.rawSize));
  if (!sec || sec.rva !== d.rva) throw new Error('Les ressources ne commencent pas une section.');
  const base = sec.raw;
  const limit = Math.min(sec.rawSize, sec.vsize || sec.rawSize);
  const within = (off, len) => { if (off < 0 || off + len > limit) throw new Error('Ressources abîmées (hors de la section).'); };
  const readDir = (off, depth) => {
    if (depth > 8) throw new Error('Ressources abîmées (arbre trop profond).');
    within(off, 16);
    const named = buf.readUInt16LE(base + off + 12);
    const ids = buf.readUInt16LE(base + off + 14);
    within(off + 16, 8 * (named + ids));
    const dir = { head: Buffer.from(buf.subarray(base + off, base + off + 12)), entries: [] };
    for (let i = 0; i < named + ids; i++) {
      const e = base + off + 16 + 8 * i;
      const key = buf.readUInt32LE(e);
      const to = buf.readUInt32LE(e + 4);
      const entry = {};
      if (key & 0x80000000) {
        const s = key & 0x7fffffff;
        within(s, 2);
        const len = buf.readUInt16LE(base + s);
        within(s + 2, 2 * len);
        entry.name = buf.toString('utf16le', base + s + 2, base + s + 2 + 2 * len);
      } else entry.id = key;
      if (to & 0x80000000) entry.dir = readDir(to & 0x7fffffff, depth + 1);
      else {
        within(to, 16);
        const rva = buf.readUInt32LE(base + to);
        const size = buf.readUInt32LE(base + to + 4);
        const at = rva - sec.rva;
        within(at, size);
        entry.data = Buffer.from(buf.subarray(base + at, base + at + size));
        entry.codepage = buf.readUInt32LE(base + to + 8);
      }
      dir.entries.push(entry);
    }
    return dir;
  };
  return { root: readDir(0, 0), section: sec };
}

// Ordre imposé par le format : les noms d'abord (ordre alphabétique sans
// casse), puis les numéros croissants.
function sortDir(dir) {
  const key = (e) => e.name.toUpperCase();
  dir.entries.sort((a, b) => {
    if ((a.name !== undefined) !== (b.name !== undefined)) return a.name !== undefined ? -1 : 1;
    if (a.name !== undefined) return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
    return a.id - b.id;
  });
  for (const e of dir.entries) if (e.dir) sortDir(e.dir);
}

// Arbre -> contenu de la section, pour une adresse en mémoire donnée.
// Disposition : répertoires, descripteurs de données, noms, puis données.
function writeTree(root, rva) {
  sortDir(root);
  const dirs = [];
  const leaves = [];
  const names = [];
  (function walk(dir) {
    dirs.push(dir);
    for (const e of dir.entries) {
      if (e.name !== undefined) names.push(e);
      if (e.dir) walk(e.dir); else leaves.push(e);
    }
  })(root);
  let off = 0;
  for (const d of dirs) { d.off = off; off += 16 + 8 * d.entries.length; }
  for (const l of leaves) { l.off = off; off += 16; }
  for (const n of names) { n.nameOff = off; off += 2 + 2 * n.name.length; }
  off = align(off, 8);
  for (const l of leaves) { l.dataOff = off; off = align(off + l.data.length, 8); }
  const out = Buffer.alloc(off);
  for (const d of dirs) {
    d.head.copy(out, d.off);
    const named = d.entries.filter((e) => e.name !== undefined).length;
    out.writeUInt16LE(named, d.off + 12);
    out.writeUInt16LE(d.entries.length - named, d.off + 14);
    d.entries.forEach((e, i) => {
      const at = d.off + 16 + 8 * i;
      out.writeUInt32LE(e.name !== undefined ? (0x80000000 | e.nameOff) >>> 0 : e.id, at);
      out.writeUInt32LE(e.dir ? (0x80000000 | e.dir.off) >>> 0 : e.off, at + 4);
    });
  }
  for (const l of leaves) {
    out.writeUInt32LE(rva + l.dataOff, l.off);
    out.writeUInt32LE(l.data.length, l.off + 4);
    out.writeUInt32LE(l.codepage || 0, l.off + 8);
    l.data.copy(out, l.dataOff);
  }
  for (const n of names) {
    out.writeUInt16LE(n.name.length, n.nameOff);
    out.write(n.name, n.nameOff + 2, 'utf16le');
  }
  return out;
}

const emptyDir = () => ({ head: Buffer.alloc(12), entries: [] });
const typeDir = (root, type) => { const e = root.entries.find((x) => x.id === type); return e ? e.dir : null; };
function ensureType(root, type) {
  let e = root.entries.find((x) => x.id === type);
  if (!e) { e = { id: type, dir: emptyDir() }; root.entries.push(e); }
  return e.dir;
}

// Liste à plat : [{ type, name, lang, size }], pour l'affichage et les tests.
function listResources(root) {
  const out = [];
  for (const t of root.entries) for (const n of t.dir ? t.dir.entries : []) for (const l of n.dir ? n.dir.entries : []) {
    out.push({ type: t.name !== undefined ? t.name : t.id, name: n.name !== undefined ? n.name : n.id, lang: l.id, size: l.data ? l.data.length : 0 });
  }
  return out;
}

// --- Icône ------------------------------------------------------------------------
// Fichier .ico -> [{ width, height, colors, planes, bits, data }].
function readIco(ico) {
  if (ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) throw new Error('Ce fichier n’est pas une icône .ico.');
  const images = [];
  for (let i = 0; i < ico.readUInt16LE(4); i++) {
    const e = 6 + 16 * i;
    const size = ico.readUInt32LE(e + 8);
    const at = ico.readUInt32LE(e + 12);
    images.push({ width: ico[e], height: ico[e + 1], colors: ico[e + 2], planes: ico.readUInt16LE(e + 4), bits: ico.readUInt16LE(e + 6), data: Buffer.from(ico.subarray(at, at + size)) });
  }
  return images;
}

// Image RVBA -> image d'icône classique (BITMAPINFOHEADER, pixels BVRA de bas
// en haut, puis masque de transparence à 1 bit). Les petites tailles sont
// rangées ainsi dans l'exécutable : c'est le format que tout Windows et tout
// outil relit ; le PNG n'est d'usage que pour 256 × 256.
function dibIcon(img) {
  const { width: w, height: h, data } = img;
  const maskStride = align(w, 32) / 8;
  const out = Buffer.alloc(40 + w * h * 4 + maskStride * h);
  out.writeUInt32LE(40, 0);
  out.writeInt32LE(w, 4);
  out.writeInt32LE(h * 2, 8); // hauteur doublée : image + masque
  out.writeUInt16LE(1, 12);
  out.writeUInt16LE(32, 14);
  out.writeUInt32LE(w * h * 4 + maskStride * h, 20);
  for (let y = 0; y < h; y++) {
    const row = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const o = 40 + (row * w + x) * 4;
      out[o] = data[i + 2]; out[o + 1] = data[i + 1]; out[o + 2] = data[i]; out[o + 3] = data[i + 3];
      if (data[i + 3] === 0) out[40 + w * h * 4 + row * maskStride + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return out;
}

const isPng = (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47;

// Remplace l'icône principale (le premier groupe, celui que montre
// l'Explorateur) par le contenu d'un .ico. Les images du groupe remplacé sont
// retirées ; les autres groupes, s'il y en a, sont gardés.
// decodePng (facultatif) : sert à convertir les petites images PNG du .ico.
function setIcon(root, ico, { decodePng } = {}) {
  const images = readIco(ico).map((im) => {
    const size = im.width || 256;
    if (decodePng && isPng(im.data) && size < 256) return { ...im, planes: 1, bits: 32, data: dibIcon(decodePng(im.data)) };
    return im;
  });
  if (!images.length) throw new Error('Icône vide.');
  const groups = ensureType(root, RT_GROUP_ICON);
  const icons = ensureType(root, RT_ICON);
  sortDir(groups);
  let group = groups.entries[0];
  if (!group) { group = { id: 1, dir: emptyDir() }; groups.entries.push(group); }
  // Images désignées par l'ancien groupe (dans toutes ses langues).
  const old = new Set();
  for (const l of group.dir.entries) {
    const n = l.data.length >= 6 ? l.data.readUInt16LE(4) : 0;
    for (let i = 0; i < n && 6 + 14 * i + 14 <= l.data.length; i++) old.add(l.data.readUInt16LE(6 + 14 * i + 12));
  }
  icons.entries = icons.entries.filter((e) => e.id === undefined || !old.has(e.id));
  const lang = group.dir.entries.length ? group.dir.entries[0].id : 1033;
  const codepage = group.dir.entries.length ? group.dir.entries[0].codepage : 0;
  const taken = new Set(icons.entries.map((e) => e.id));
  const head = Buffer.alloc(6 + 14 * images.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let id = 1;
  images.forEach((im, i) => {
    while (taken.has(id)) id++;
    taken.add(id);
    const e = 6 + 14 * i;
    head[e] = im.width; head[e + 1] = im.height; head[e + 2] = im.colors;
    head.writeUInt16LE(im.planes || 1, e + 4);
    head.writeUInt16LE(im.bits || 32, e + 6);
    head.writeUInt32LE(im.data.length, e + 8);
    head.writeUInt16LE(id, e + 12);
    const leafDir = emptyDir();
    leafDir.entries.push({ id: lang, data: im.data, codepage });
    icons.entries.push({ id, dir: leafDir });
  });
  group.dir.entries = [{ id: lang, data: head, codepage }];
  return images.length;
}

// Icône principale relue : [{ width, height, bits, id, data }].
function getIcon(root) {
  const groups = typeDir(root, RT_GROUP_ICON);
  const icons = typeDir(root, RT_ICON);
  if (!groups || !icons || !groups.entries.length) return [];
  sortDir(groups);
  const head = groups.entries[0].dir.entries[0].data;
  const out = [];
  for (let i = 0; i < head.readUInt16LE(4); i++) {
    const e = 6 + 14 * i;
    const id = head.readUInt16LE(e + 12);
    const entry = icons.entries.find((x) => x.id === id);
    out.push({ width: head[e] || 256, height: head[e + 1] || 256, bits: head.readUInt16LE(e + 6), id, size: head.readUInt32LE(e + 8), data: entry ? entry.dir.entries[0].data : null });
  }
  return out;
}

// --- Informations de version --------------------------------------------------------
// VS_VERSIONINFO est un arbre de blocs : longueur totale, longueur de la
// valeur, type (1 = texte), clé en UTF-16, valeur, puis les blocs enfants ;
// le tout aligné sur 4 octets.
function readBlock(buf, at) {
  const length = buf.readUInt16LE(at);
  const valueLength = buf.readUInt16LE(at + 2);
  const type = buf.readUInt16LE(at + 4);
  let p = at + 6;
  while (p + 1 < buf.length && buf.readUInt16LE(p) !== 0) p += 2;
  const key = buf.toString('utf16le', at + 6, p);
  return { length, valueLength, type, key, value: align(p + 2, 4), end: Math.min(at + length, buf.length) };
}

function block(key, type, value, valueLength, children = []) {
  const k = Buffer.from(key + '\0', 'utf16le');
  const headLen = align(6 + k.length, 4);
  const body = [value];
  let len = headLen + value.length;
  for (const c of children) {
    const pad = align(len, 4) - len;
    if (pad) body.push(Buffer.alloc(pad));
    body.push(c);
    len += pad + c.length;
  }
  const head = Buffer.alloc(headLen);
  head.writeUInt16LE(len, 0);
  head.writeUInt16LE(valueLength, 2);
  head.writeUInt16LE(type, 4);
  k.copy(head, 6);
  return Buffer.concat([head, ...body]);
}

function parseVersion(data) {
  const top = readBlock(data, 0);
  if (top.key !== 'VS_VERSION_INFO') throw new Error('Informations de version illisibles.');
  const fixed = Buffer.from(data.subarray(top.value, top.value + top.valueLength));
  const info = { fixed, tables: [], others: [] };
  for (let at = align(top.value + top.valueLength, 4); at + 6 <= top.end;) {
    const child = readBlock(data, at);
    if (!child.length) break;
    if (child.key === 'StringFileInfo') {
      for (let t = child.value; t + 6 <= child.end;) {
        const table = readBlock(data, t);
        if (!table.length) break;
        const strings = [];
        for (let s = table.value; s + 6 <= table.end;) {
          const str = readBlock(data, s);
          if (!str.length) break;
          strings.push([str.key, data.toString('utf16le', str.value, str.end).replace(/\0[\s\S]*$/, '')]);
          s = align(s + str.length, 4);
        }
        info.tables.push({ lang: table.key, strings });
        t = align(t + table.length, 4);
      }
    } else info.others.push(Buffer.from(data.subarray(at, child.end)));
    at = align(at + child.length, 4);
  }
  return info;
}

function buildVersion(info) {
  const tables = info.tables.map((t) => block(t.lang, 1, Buffer.alloc(0), 0, t.strings.map(([k, v]) => {
    const value = Buffer.from(v + '\0', 'utf16le');
    return block(k, 1, value, value.length / 2);
  })));
  const children = [];
  if (tables.length) children.push(block('StringFileInfo', 1, Buffer.alloc(0), 0, tables));
  children.push(...info.others);
  return block('VS_VERSION_INFO', 0, info.fixed, info.fixed.length, children);
}

// « 0.8.1 » -> [0, 8, 1, 0]
function versionParts(v) {
  const p = String(v).split(/[.+-]/).map((x) => parseInt(x, 10)).filter((x) => Number.isFinite(x)).slice(0, 4);
  while (p.length < 4) p.push(0);
  return p.map((x) => Math.min(65535, Math.max(0, x)));
}

// Change des chaînes (ProductName, FileDescription, CompanyName, FileVersion,
// ProductVersion, OriginalFilename…) et les numéros de version binaires qui
// vont avec. Une valeur null retire la chaîne.
function setVersion(root, strings) {
  const dir = typeDir(root, RT_VERSION);
  if (!dir || !dir.entries.length || !dir.entries[0].dir.entries.length) throw new Error('Cet exécutable n’a pas d’informations de version.');
  for (const name of dir.entries) for (const leaf of name.dir.entries) {
    const info = parseVersion(leaf.data);
    if (!info.tables.length) info.tables.push({ lang: '040904b0', strings: [] });
    for (const table of info.tables) for (const [k, v] of Object.entries(strings)) {
      const i = table.strings.findIndex((s) => s[0] === k);
      if (v === null || v === undefined) { if (i >= 0) table.strings.splice(i, 1); }
      else if (i >= 0) table.strings[i][1] = String(v);
      else table.strings.push([k, String(v)]);
    }
    if (info.fixed.length >= 24 && info.fixed.readUInt32LE(0) === 0xfeef04bd) {
      const put = (v, at) => { const p = versionParts(v); info.fixed.writeUInt32LE(((p[0] << 16) | p[1]) >>> 0, at); info.fixed.writeUInt32LE(((p[2] << 16) | p[3]) >>> 0, at + 4); };
      if (strings.FileVersion) put(strings.FileVersion, 8);
      if (strings.ProductVersion) put(strings.ProductVersion, 16);
    }
    leaf.data = buildVersion(info);
  }
}

function getVersion(root) {
  const dir = typeDir(root, RT_VERSION);
  if (!dir || !dir.entries.length) return null;
  const info = parseVersion(dir.entries[0].dir.entries[0].data);
  const f = info.fixed;
  const quad = (at) => f.length >= at + 8 ? [f.readUInt16LE(at + 2), f.readUInt16LE(at), f.readUInt16LE(at + 6), f.readUInt16LE(at + 4)].join('.') : '';
  return { strings: Object.fromEntries(info.tables.length ? info.tables[0].strings : []), lang: info.tables.length ? info.tables[0].lang : '', fileVersion: quad(8), productVersion: quad(16) };
}

// --- Réécriture de l'exécutable -------------------------------------------------------
// buf : l'exécutable ; root : l'arbre modifié. Rend un nouveau tampon.
function rebuild(buf, root) {
  const pe = parsePE(buf);
  const { section: rsrc } = readTree(buf, pe);
  const index = pe.sections.indexOf(rsrc);
  const after = pe.sections.slice(index + 1);
  // Les sections doivent se suivre dans le fichier comme dans la table.
  let cursor = rsrc.raw + rsrc.rawSize;
  for (const s of after) {
    if (s.rawSize && s.raw !== cursor) throw new Error(`Disposition inattendue : la section ${s.name} ne suit pas la précédente dans le fichier.`);
    cursor += s.rawSize;
  }
  const security = pe.dirCount > DIR_SECURITY ? pe.dir(DIR_SECURITY) : { rva: 0, size: 0 };
  // Ce qui suit la dernière section (hors signature) est gardé tel quel.
  const tailEnd = security.rva && security.rva >= cursor ? security.rva : buf.length;
  const tail = buf.subarray(cursor, Math.max(cursor, tailEnd));

  const data = writeTree(root, rsrc.rva);
  const rawSize = align(data.length, pe.fileAlign);
  const newSpan = align(data.length, pe.sectionAlign);
  const next = after[0];
  // Place réellement libre en mémoire derrière .rsrc.
  const room = next ? next.rva - rsrc.rva : Infinity;
  const shift = newSpan > room ? newSpan - room : 0;
  if (shift) {
    const blocking = after.filter((s) => s.name !== '.reloc');
    if (blocking.length) throw new Error(`Les ressources ne tiennent plus et la section ${blocking[0].name} suit .rsrc : décalage refusé.`);
  }
  const rawDelta = rawSize - rsrc.rawSize;

  const head = Buffer.from(buf.subarray(0, rsrc.raw));
  const padded = Buffer.alloc(rawSize);
  data.copy(padded);
  const rest = buf.subarray(rsrc.raw + rsrc.rawSize, cursor);
  const out = Buffer.concat([head, padded, rest, tail]);

  // Table des sections.
  out.writeUInt32LE(data.length, rsrc.at + 8);
  out.writeUInt32LE(rawSize, rsrc.at + 16);
  for (const s of after) {
    out.writeUInt32LE(s.rva + shift, s.at + 12);
    if (s.raw) out.writeUInt32LE(s.raw + rawDelta, s.at + 20);
  }
  // Répertoires de données : ressources, puis tout ce qui vise une section décalée.
  for (let i = 0; i < pe.dirCount; i++) {
    const d = pe.dir(i);
    const at = pe.dirs + 8 * i;
    if (i === DIR_RESOURCE) { out.writeUInt32LE(data.length, at + 4); continue; }
    if (i === DIR_SECURITY) { out.writeUInt32LE(0, at); out.writeUInt32LE(0, at + 4); continue; }
    if (shift && d.rva && next && d.rva >= next.rva) out.writeUInt32LE(d.rva + shift, at);
  }
  // Tailles globales.
  const all = parsePE(out).sections;
  const last = all.reduce((a, b) => (b.rva > a.rva ? b : a));
  out.writeUInt32LE(align(last.rva + Math.max(last.vsize, 1), pe.sectionAlign), pe.opt + 56);
  const initialized = all.filter((s) => s.flags & 0x40).reduce((n, s) => n + s.rawSize, 0);
  out.writeUInt32LE(initialized >>> 0, pe.opt + 8);
  out.writeUInt32LE(checksum(out, pe.checksumAt), pe.checksumAt);
  return out;
}

// Vérifie la cohérence d'un exécutable : sections sans chevauchement, dans le
// fichier, SizeOfImage et somme de contrôle justes, ressources relisibles.
function verify(buf) {
  const pe = parsePE(buf);
  let prev = null;
  for (const s of pe.sections) {
    if (s.rva % pe.sectionAlign) throw new Error(`Section ${s.name} mal alignée en mémoire.`);
    if (s.rawSize && s.raw % pe.fileAlign) throw new Error(`Section ${s.name} mal alignée dans le fichier.`);
    if (s.raw + s.rawSize > buf.length) throw new Error(`Section ${s.name} hors du fichier.`);
    if (prev && s.rva < prev.rva + align(Math.max(prev.vsize, 1), pe.sectionAlign)) throw new Error(`Sections ${prev.name} et ${s.name} en chevauchement.`);
    if (prev && s.rva !== prev.rva + align(Math.max(prev.vsize, 1), pe.sectionAlign)) throw new Error(`Trou en mémoire entre ${prev.name} et ${s.name}.`);
    prev = s;
  }
  if (pe.sizeOfImage !== align(prev.rva + Math.max(prev.vsize, 1), pe.sectionAlign)) throw new Error('SizeOfImage faux.');
  const sum = buf.readUInt32LE(pe.checksumAt);
  if (sum && sum !== checksum(buf, pe.checksumAt)) throw new Error('Somme de contrôle fausse.');
  for (let i = 0; i < pe.dirCount; i++) {
    const d = pe.dir(i);
    if (!d.rva || i === DIR_SECURITY) continue;
    if (!pe.sections.some((s) => d.rva >= s.rva && d.rva + d.size <= s.rva + Math.max(s.vsize, s.rawSize))) throw new Error(`Répertoire de données ${i} hors de toute section.`);
  }
  const { root } = readTree(buf, pe);
  return { pe, root };
}

// Tout en un : modifie le fichier sur place.
//   icon : chemin d'un .ico ; version : { ProductName: …, FileVersion: … }
function edit(file, { icon, version, decodePng } = {}) {
  const buf = fs.readFileSync(file);
  const { root } = readTree(buf, parsePE(buf));
  if (icon) setIcon(root, fs.readFileSync(icon), { decodePng });
  if (version) setVersion(root, version);
  const out = rebuild(buf, root);
  verify(out);
  fs.writeFileSync(file, out);
  return out;
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('Usage : node scripts/pe-resources.js <fichier.exe>'); process.exit(1); }
  const buf = fs.readFileSync(file);
  const { pe, root } = verify(buf);
  for (const s of pe.sections) console.log(`${s.name.padEnd(9)} mémoire ${s.rva.toString(16).padStart(8)} +${s.vsize.toString(16).padStart(8)}  fichier ${s.raw.toString(16).padStart(8)} +${s.rawSize.toString(16).padStart(8)}`);
  console.log(`SizeOfImage ${pe.sizeOfImage.toString(16)}, somme de contrôle ${buf.readUInt32LE(pe.checksumAt).toString(16)} (calculée : ${checksum(buf, pe.checksumAt).toString(16)})`);
  console.log(`${listResources(root).length} ressources`);
  console.log('Icône : ' + getIcon(root).map((i) => `${i.width}×${i.height}`).join(', '));
  console.log('Version : ' + JSON.stringify(getVersion(root), null, 2));
}

module.exports = { parsePE, checksum, readTree, writeTree, listResources, readIco, dibIcon, setIcon, getIcon, parseVersion, buildVersion, setVersion, getVersion, versionParts, rebuild, verify, edit, RT_ICON, RT_GROUP_ICON, RT_VERSION };
