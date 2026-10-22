#!/usr/bin/env node
// Fabrique assets/orbe.ico à partir de assets/icon.png, sans dépendance :
// décodage du PNG, réduction aux tailles voulues, puis empaquetage ICO
// (chaque taille y est rangée sous forme de PNG, format accepté depuis Vista).
//   node scripts/make-ico.js [entrée.png] [sortie.ico]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// PNG -> { width, height, data RGBA }. Seul le cas utile est géré : 8 bits par
// canal, RVB ou RVBA, non entrelacé.
function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('Ce fichier n’est pas un PNG.');
  let pos = 8;
  let head = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') head = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], color: body[9], interlace: body[12] };
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!head || head.depth !== 8 || (head.color !== 6 && head.color !== 2) || head.interlace) throw new Error('PNG non géré (il faut 8 bits, RVB ou RVBA, non entrelacé).');
  const { width, height } = head;
  const bpp = head.color === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    const up = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0;
      const b = up ? up[i] : 0;
      const c = up && i >= bpp ? up[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[i] = v & 255;
    }
  }
  if (bpp === 4) return { width, height, data: px };
  const data = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < width * height; i++) px.copy(data, i * 4, i * 3, i * 3 + 3);
  return { width, height, data };
}

// Réduction par moyenne des pixels couverts (pondérée par l'opacité).
function resize(img, size) {
  const out = Buffer.alloc(size * size * 4);
  const fx = img.width / size;
  const fy = img.height / size;
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * img.width + xx) * 4;
          const al = img.data[i + 3];
          r += img.data[i] * al; g += img.data[i + 1] * al; b += img.data[i + 2] * al; a += al;
        }
      }
      const o = (y * size + x) * 4;
      if (a) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
      out[o + 3] = Math.round(a / ((y1 - y0) * (x1 - x0)));
    }
  }
  return { width: size, height: size, data: out };
}

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
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

function encodePng(img) {
  const stride = img.width * 4;
  const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) img.data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// En-tête ICO, une entrée de 16 octets par image, puis les images.
function packIco(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach((im, i) => {
    const e = 6 + 16 * i;
    head[e] = im.size >= 256 ? 0 : im.size;
    head[e + 1] = im.size >= 256 ? 0 : im.size;
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(im.png.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += im.png.length;
  });
  return Buffer.concat([head, ...images.map((im) => im.png)]);
}

function makeIco(pngFile, icoFile) {
  const source = decodePng(fs.readFileSync(pngFile));
  const images = SIZES.map((size) => ({ size, png: encodePng(resize(source, size)) }));
  fs.writeFileSync(icoFile, packIco(images));
  return icoFile;
}

if (require.main === module) {
  const assets = path.join(__dirname, '..', 'assets');
  const out = makeIco(process.argv[2] || path.join(assets, 'icon.png'), process.argv[3] || path.join(assets, 'orbe.ico'));
  console.log('Icône écrite : ' + out);
}

module.exports = { makeIco, decodePng, encodePng, resize, packIco };
