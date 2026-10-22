// Couleurs que la page annonce : son fond (pour que la fenêtre redimensionnée
// découvre la couleur de la page, et non du blanc) et sa couleur de thème
// (`<meta name="theme-color">`, qui teinte la barre d'outils).
// Les deux viennent de la page : elles ne sont lues que comme des nombres.

// « rgb(12, 34, 56) » ou « rgba(12, 34, 56, 0.5) » (forme des styles calculés) → { r, g, b, a }.
function parse(value) {
  if (typeof value !== 'string' || value.length > 64) return null;
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d(?:\.\d{1,6})?|\.\d{1,6})\s*)?\)$/.exec(value);
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map(Number);
  const a = m[4] === undefined ? 1 : Number(m[4]);
  if (r > 255 || g > 255 || b > 255 || !(a >= 0 && a <= 1)) return null;
  return { r, g, b, a };
}
const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
// Couleur posée sur du blanc (fond du navigateur sous une page translucide).
const onWhite = (c) => ({ r: c.r * c.a + 255 * (1 - c.a), g: c.g * c.a + 255 * (1 - c.a), b: c.b * c.a + 255 * (1 - c.a), a: 1 });

// Fond de la page d'après les styles calculés de <body> puis de <html> : le
// premier qui n'est pas transparent ; sinon blanc.
function pick(values) {
  for (const v of Array.isArray(values) ? values.slice(0, 2) : []) {
    const c = parse(v);
    if (c && c.a > 0.02) return hex(onWhite(c));
  }
  return '#ffffff';
}
const BG = `(() => { try { const of = (el) => (el ? getComputedStyle(el).backgroundColor : ''); return [of(document.body), of(document.documentElement)]; } catch { return []; } })()`;
async function background(wc) {
  try {
    const values = await Promise.race([wc.executeJavaScript(BG), new Promise((r) => setTimeout(() => r(null), 2000))]);
    return pick(values);
  } catch { return '#ffffff'; }
}

// Couleur de thème donnée par le moteur (« #rrggbb », parfois « #rrggbbaa ») → « #rrggbb », ou null.
function theme(value) {
  const m = typeof value === 'string' ? /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(value) : null;
  return m ? '#' + m[1].toLowerCase() : null;
}

module.exports = { parse, pick, background, theme, hex };
