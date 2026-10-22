// Capture « en portrait » : l'image de la page, coins arrondis et ombre portée,
// posée sur un fond en dégradé aux couleurs de l'Espace (« Capture in Portrait
// Mode » d'Arc). Tout est calculé ici, point par point, sur les octets de
// l'image : ni page, ni canevas, donc rien de la page ne s'exécute.
const { nativeImage } = require('electron');

const LOOK = { margin: 0.07, minMargin: 40, radius: 14, shadow: 0.34, spread: 0.85, drop: 0.2, maxSide: 12000 };

function rgb(hex, fallback = [124, 92, 255]) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));

// Distance (signée) d'un point au bord d'un rectangle à coins arrondis centré en (cx, cy).
function distance(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
}

// Compose le portrait. `image` : capture de la page ; `color` : couleur de
// l'Espace ; `dark` : thème sombre. Rend une image, ou null si la capture est
// vide ou démesurée.
function compose(image, { color, dark = false } = {}) {
  if (!image || image.isEmpty()) return null;
  const factors = image.getScaleFactors();
  let sf = factors.length ? Math.max(...factors) : 1;
  const dip = image.getSize();
  let src = image.toBitmap({ scaleFactor: sf });
  let W = Math.round(dip.width * sf);
  let H = src.length / 4 / W;
  if (!Number.isInteger(H) || H < 1) { sf = 1; src = image.toBitmap({ scaleFactor: 1 }); W = dip.width; H = src.length / 4 / W; }
  if (!Number.isInteger(H) || W < 1 || H < 1 || W > LOOK.maxSide || H > LOOK.maxSide) return null;

  const m = Math.round(Math.max(LOOK.minMargin * sf, Math.max(W, H) * LOOK.margin));
  const r = LOOK.radius * sf;
  const OW = W + 2 * m;
  const OH = H + 2 * m;
  const out = Buffer.alloc(OW * OH * 4);
  // Fond : dégradé en diagonale entre deux teintes de la couleur de l'Espace.
  const base = rgb(color);
  const c1 = mix(base, dark ? [20, 18, 30] : [255, 255, 255], dark ? 0.35 : 0.3);
  const c2 = mix([base[2], base[0], base[1]], base, 0.55).map((v, i) => Math.round(v * (dark ? 0.6 : 0.92) + (dark ? 0 : 20 * (i === 0))));
  const cx = m + W / 2;
  const cy = m + H / 2;
  const blur = m * LOOK.spread;
  const drop = m * LOOK.drop;
  for (let y = 0; y < OH; y++) {
    const inRow = y >= m && y < m + H;
    for (let x = 0; x < OW; x++) {
      const o = (y * OW + x) * 4;
      // Intérieur de la page, loin des coins : copié par rangées plus bas.
      if (inRow && x === m + Math.ceil(r) && y >= m + r && y < m + H - r) { x = m + W - Math.ceil(r) - 1; continue; }
      const k = (x / OW + y / OH) / 2;
      let R = c1[0] + (c2[0] - c1[0]) * k;
      let G = c1[1] + (c2[1] - c1[1]) * k;
      let B = c1[2] + (c2[2] - c1[2]) * k;
      // Ombre portée : sous la page, un peu décalée vers le bas.
      const ds = distance(x + 0.5, y + 0.5, cx, cy + drop, W / 2, H / 2, r);
      if (ds < blur) { const a = LOOK.shadow * (ds <= 0 ? 1 : (1 - ds / blur) ** 2); R *= 1 - a; G *= 1 - a; B *= 1 - a; }
      // La page, avec ses coins adoucis.
      const d = distance(x + 0.5, y + 0.5, cx, cy, W / 2, H / 2, r);
      if (d < 0.5 && inRow && x >= m && x < m + W) {
        const cover = Math.min(1, 0.5 - d);
        const s = ((y - m) * W + (x - m)) * 4;
        B += (src[s] - B) * cover; G += (src[s + 1] - G) * cover; R += (src[s + 2] - R) * cover;
      }
      out[o] = B; out[o + 1] = G; out[o + 2] = R; out[o + 3] = 255;
    }
    // Rangée de la page entre les deux coins : copie directe.
    if (inRow) {
      const full = y >= m + r && y < m + H - r;
      const x0 = full ? Math.ceil(r) : 0;
      if (full) src.copy(out, (y * OW + m + x0) * 4, ((y - m) * W + x0) * 4, ((y - m) * W + W - x0) * 4);
    }
  }
  // (Les rangées pleines ont sauté l'intérieur ; celles des coins ont tout calculé point par point.)
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return nativeImage.createFromBitmap(out, { width: OW, height: OH, scaleFactor: sf });
}

module.exports = { compose, distance, LOOK };
