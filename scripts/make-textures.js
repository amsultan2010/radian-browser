#!/usr/bin/env node
// Fabrique les textures du fond des Espaces (originales, calculées ici : aucun
// fichier tiers).
//   node scripts/make-textures.js  -> src/renderer/textures/{grain,sand,tweed,denim}.png
// Chaque texture est un petit carreau gris qui se répète sans raccord visible.
// Le gris moyen (128) est neutre : posé en « overlay » sur le fond, le carreau
// n'en change que le relief, pas la teinte ni la clarté. Il est rendu une fois
// par le moteur, puis recopié : aucun filtre n'est recalculé à chaque image.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 192; // carreau affiché sur 96 px : un point de texture par point d'écran Retina

// Suite pseudo-aléatoire fixe : les fichiers produits sont toujours les mêmes.
function random(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}
// Bruit à peu près gaussien, entre −1 et 1.
const gauss = (rnd) => (rnd() + rnd() + rnd() + rnd() - 2) / 2;
const wrap = (v) => ((v % SIZE) + SIZE) % SIZE;

// Flou léger qui boucle sur les bords (le carreau reste répétable).
function blur(src, radius) {
  const out = new Float32Array(src.length);
  const tmp = new Float32Array(src.length);
  const n = radius * 2 + 1;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { let a = 0; for (let k = -radius; k <= radius; k++) a += src[y * SIZE + wrap(x + k)]; tmp[y * SIZE + x] = a / n; }
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { let a = 0; for (let k = -radius; k <= radius; k++) a += tmp[wrap(y + k) * SIZE + x]; out[y * SIZE + x] = a / n; }
  return out;
}

function field(fn) {
  const f = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) f[y * SIZE + x] = fn(x, y);
  return f;
}

// Ramène le champ à une moyenne nulle et à l'écart-type voulu (en niveaux de gris).
function level(f, deviation) {
  let mean = 0;
  for (const v of f) mean += v;
  mean /= f.length;
  let sd = 0;
  for (const v of f) sd += (v - mean) ** 2;
  sd = Math.sqrt(sd / f.length) || 1;
  return Uint8Array.from(f, (v) => Math.max(0, Math.min(255, Math.round(128 + ((v - mean) / sd) * deviation))));
}

const TEXTURES = {
  // Grain de pellicule : bruit fin, à peine adouci.
  grain() {
    const rnd = random(11);
    const fine = field(() => gauss(rnd));
    const soft = blur(fine, 1);
    return level(fine.map((v, i) => v * 0.55 + soft[i] * 1.6), 34);
  },
  // Sable : grains plus gros et inégaux, quelques points clairs et sombres.
  sand() {
    const rnd = random(23);
    const coarse = blur(field(() => gauss(rnd)), 2);
    const dunes = blur(field(() => gauss(rnd)), 9);
    const specks = field(() => { const r = rnd(); return r > 0.985 ? 1.8 : (r < 0.015 ? -1.8 : 0); });
    return level(coarse.map((v, i) => v * 3 + dunes[i] * 7 + specks[i] * 0.5 + gauss(rnd) * 0.18), 36);
  },
  // Tweed : tissage en chevrons, fils irréguliers.
  tweed() {
    const rnd = random(37);
    const P = 16; // pas du chevron (192 = 12 × 16)
    const yarn = blur(field(() => gauss(rnd)), 1);
    return level(field((x, y) => {
      const band = Math.floor(x / P) % 2;
      const d = band ? (x + y) : (x - y);
      const twill = Math.sin((wrap(d) * 2 * Math.PI) / 4) * 0.9;
      const seam = x % P === 0 ? -0.5 : 0;
      return twill + seam + yarn[y * SIZE + x] * 2.2 + gauss(rnd) * 0.35;
    }), 36);
  },
  // Denim : sergé en diagonale fine, fils verticaux délavés par endroits.
  denim() {
    const rnd = random(53);
    const threads = new Float32Array(SIZE);
    for (let x = 0; x < SIZE; x++) threads[x] = gauss(rnd);
    const worn = blur(field(() => gauss(rnd)), 6);
    return level(field((x, y) => {
      const twill = Math.sin((wrap(x + y) * 2 * Math.PI) / 6);
      return twill * 0.8 + threads[x] * 0.7 + worn[y * SIZE + x] * 5 + gauss(rnd) * 0.45;
    }), 36);
  },
};

// --- PNG en niveaux de gris, 8 bits ------------------------------------------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'latin1');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}
function png(pixels) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(SIZE, 0);
  head.writeUInt32BE(SIZE, 4);
  head[8] = 8; // profondeur
  head[9] = 0; // niveaux de gris
  const raw = Buffer.alloc((SIZE + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) Buffer.from(pixels.buffer, y * SIZE, SIZE).copy(raw, y * (SIZE + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Lit un PNG produit par ce script (pour les essais) : taille et pixels.
function read(buf) {
  const size = buf.readUInt32BE(16);
  let pos = 8;
  const parts = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    if (buf.toString('latin1', pos + 4, pos + 8) === 'IDAT') parts.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const pixels = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) raw.copy(pixels, y * size, y * (size + 1) + 1, (y + 1) * (size + 1));
  return { size, depth: buf[24], color: buf[25], pixels };
}

if (require.main === module) {
  const dir = path.join(__dirname, '..', 'src', 'renderer', 'textures');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, make] of Object.entries(TEXTURES)) {
    const file = png(make());
    fs.writeFileSync(path.join(dir, name + '.png'), file);
    console.log(`${name}.png  ${file.length} octets`);
  }
}

module.exports = { SIZE, TEXTURES, png, read };
