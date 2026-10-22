// Thème d'un Espace : modèle, validation et palette calculée.
// Le même fichier sert au processus principal (validation, essais) et aux pages
// de l'interface (application du thème) : aucune dépendance, aucun accès au DOM.
//
// Un thème, c'est : zéro à trois couleurs (zéro = thème par défaut, neutre),
// une intensité, une texture et sa force, et un mode clair / sombre / automatique.
// La palette qui en découle donne le fond (un à trois arrêts de dégradé) et des
// couleurs de texte dont le contraste est garanti (4,5 au moins) sur ce fond,
// quelle que soit la couleur choisie.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OrbeTheme = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const HEX = /^#[0-9a-f]{6}$/i;
  const DEFAULT_COLOR = '#7c6cf0';
  const TEXTURES = ['grain', 'sand', 'tweed', 'denim'];
  const MODES = ['auto', 'light', 'dark'];
  const MAX_COLORS = 3;
  const MIN_CONTRAST = 4.5;
  const TARGET = 4.56; // visé par le calcul : une marge sur le minimum, pour les arrondis du moteur

  // Nuanciers prêts, comme dans Arc : neuf pastels, neuf teintes ternes, neuf gris
  // (teintes propres à Orbe).
  const PALETTES = {
    pastel: ['#f6a5a0', '#f8bd92', '#f5d98b', '#bfe3a1', '#9fdcc4', '#9fd3ec', '#aab9f5', '#c9aef2', '#f1acd3'],
    drab: ['#a8665f', '#a97c56', '#9c8a4f', '#6f8a5b', '#56897b', '#557f98', '#6470a3', '#84659f', '#a0607f'],
    grey: ['#f1f1f3', '#d9dadd', '#bfc1c6', '#a3a6ad', '#868a92', '#6a6e77', '#50545c', '#383b42', '#222429'],
  };

  // Thèmes prêts à l'emploi (couleurs, intensité, texture).
  const PRESETS = [
    { id: 'aube', colors: ['#f8a37a', '#f1acd3'], intensity: 0.6, texture: 'grain', grain: 0.22 },
    { id: 'lagon', colors: ['#3b82f6', '#06b6d4', '#9fdcc4'], intensity: 0.62, texture: 'grain', grain: 0.25 },
    { id: 'foret', colors: ['#10b981', '#56897b'], intensity: 0.58, texture: 'sand', grain: 0.3 },
    { id: 'braise', colors: ['#ef4444', '#f59e0b'], intensity: 0.6, texture: 'grain', grain: 0.2 },
    { id: 'orchidee', colors: ['#a855f7', '#ec4899', '#7c6cf0'], intensity: 0.64, texture: 'grain', grain: 0.28 },
    { id: 'ardoise', colors: ['#64748b', '#50545c'], intensity: 0.7, texture: 'tweed', grain: 0.35 },
    { id: 'sable', colors: ['#f5d98b', '#a97c56'], intensity: 0.55, texture: 'sand', grain: 0.4 },
    { id: 'denim', colors: ['#557f98', '#6470a3'], intensity: 0.72, texture: 'denim', grain: 0.4 },
  ];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isHex = (c) => typeof c === 'string' && HEX.test(c);

  // --- Couleurs ---------------------------------------------------------------
  const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const hex = (c) => '#' + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  // Mélange comme `color-mix(in srgb, a t, b)` : t = part de a.
  const mix = (a, b, t) => [0, 1, 2].map((i) => a[i] * t + b[i] * (1 - t));
  // Couleur `top` d'opacité `alpha` posée sur `under`.
  const over = (top, alpha, under) => mix(top, under, alpha);
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const contrast = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  function hsvToHex(h, s, v) {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return hex([f(5) * 255, f(3) * 255, f(1) * 255]);
  }
  function hexToHsv(c) {
    const [r, g, b] = rgb(c).map((v) => v / 255);
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
    }
    return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
  }

  // --- Modèle -----------------------------------------------------------------
  // Thème d'un Espace tel qu'il est enregistré (champs `color`, `color2`, `color3`,
  // `plain`, `intensity`, `grain`, `texture`, `mode`), remis dans une forme sûre.
  function normalize(space) {
    const s = space || {};
    const colors = s.plain ? [] : [s.color, s.color2, s.color3].filter(isHex);
    return {
      colors,
      accent: isHex(s.color) ? s.color : DEFAULT_COLOR,
      intensity: typeof s.intensity === 'number' && s.intensity >= 0 && s.intensity <= 1 ? s.intensity : 0.5,
      grain: typeof s.grain === 'number' && s.grain >= 0 && s.grain <= 1 ? s.grain : 0,
      texture: TEXTURES.includes(s.texture) ? s.texture : 'grain',
      mode: MODES.includes(s.mode) ? s.mode : 'auto',
    };
  }

  // Applique à un Espace des changements venus de l'interface ; tout ce qui n'est
  // pas valide est ignoré. Renvoie true si quelque chose a changé.
  function apply(space, patch) {
    if (!space || !patch || typeof patch !== 'object') return false;
    const before = JSON.stringify(normalize(space)) + space.icon;
    if (Array.isArray(patch.colors) && patch.colors.length <= MAX_COLORS && patch.colors.every(isHex)) {
      const c = patch.colors.map((x) => x.toLowerCase());
      if (c.length) {
        space.color = c[0];
        space.color2 = c[1] || '';
        space.color3 = c[2] || '';
        delete space.plain;
      } else {
        // Plus aucune couleur : thème par défaut (fond neutre, accent d'origine).
        space.color = DEFAULT_COLOR;
        space.color2 = '';
        space.color3 = '';
        space.plain = true;
      }
    }
    if (isHex(patch.color)) { space.color = patch.color.toLowerCase(); delete space.plain; }
    if (patch.color2 === '' || isHex(patch.color2)) { space.color2 = patch.color2.toLowerCase(); if (!patch.color2) space.color3 = ''; }
    if (patch.color3 === '' || isHex(patch.color3)) { if (!patch.color3 || space.color2) space.color3 = patch.color3.toLowerCase(); }
    if (typeof patch.intensity === 'number' && patch.intensity >= 0 && patch.intensity <= 1) space.intensity = Math.round(patch.intensity * 100) / 100;
    if (typeof patch.grain === 'number' && patch.grain >= 0 && patch.grain <= 1) space.grain = Math.round(patch.grain * 100) / 100;
    if (TEXTURES.includes(patch.texture)) space.texture = patch.texture;
    if (MODES.includes(patch.mode)) space.mode = patch.mode;
    if (typeof patch.icon === 'string' && patch.icon.length <= 8) space.icon = patch.icon;
    const preset = typeof patch.preset === 'string' && PRESETS.find((p) => p.id === patch.preset);
    if (preset) apply(space, { colors: preset.colors, intensity: preset.intensity, texture: preset.texture, grain: preset.grain });
    return JSON.stringify(normalize(space)) + space.icon !== before;
  }

  // Part de la couleur dans le fond (le reste est la base, claire ou sombre).
  // À mi-course on retrouve le réglage d'origine d'Orbe : 18 % en clair, 24 % en
  // sombre (8 points de plus pour un dégradé).
  function tintOf(theme, dark) {
    const mid = (dark ? 0.24 : 0.18) + (theme.colors.length > 1 ? 0.08 : 0);
    const i = theme.intensity;
    return i <= 0.5 ? 0.04 + (mid - 0.04) * (i / 0.5) : mid + (0.72 - mid) * ((i - 0.5) / 0.5);
  }

  const FAMILY = {
    // Texte sombre sur fond clair.
    light: { ink: [0, 0, 0], fg: [29, 29, 31], dim: 0.52, faint: 0.28, hover: 0.06, pill: 0.07, line: 0.1, active: [[255, 255, 255], 1], push: [255, 255, 255] },
    // Texte clair sur fond sombre.
    dark: { ink: [255, 255, 255], fg: [243, 243, 245], dim: 0.55, faint: 0.3, hover: 0.07, pill: 0.09, line: 0.12, active: [[255, 255, 255], 0.17], push: [0, 0, 0] },
  };
  const BASE = { light: [243, 243, 245], dark: [22, 22, 26] };
  const SECONDARY = 0.78; // titre d'un onglet en veille : texte principal à 78 %

  // Contraste le plus faible entre les textes de la barre et les surfaces où ils
  // se posent, pour un arrêt du fond et une opacité de texte discret données.
  function worst(stop, fam, dimAlpha) {
    const hover = over(fam.ink, fam.hover, stop);
    const pill = over(fam.ink, fam.pill, stop);
    const active = over(fam.active[0], fam.active[1], stop);
    let min = Infinity;
    const see = (text, alpha, surface) => { min = Math.min(min, contrast(over(text, alpha, surface), surface)); };
    for (const s of [stop, hover, pill, active]) see(fam.fg, 1, s);
    for (const s of [stop, hover]) see(fam.fg, SECONDARY, s);
    for (const s of [stop, hover, pill]) see(fam.ink, dimAlpha, s);
    return min;
  }

  // Barre translucide : ce qui peut se trouver derrière elle. Le matériau du système
  // (barre latérale de macOS, mica de Windows) suit l'apparence du système, pas le mode
  // de l'Espace : sombre, il va du noir à un gris foncé ; clair, d'un gris moyen au blanc.
  // (Bornes posées par hypothèse, non mesurées sur un bureau réel.)
  const BACKDROP = { dark: [[0, 0, 0], [96, 96, 96]], light: [[128, 128, 128], [255, 255, 255]] };

  // Palette d'un thème. `dark` : apparence sombre du système (suivie en mode auto).
  // `show` : part de ce qui est derrière la barre et se voit à travers elle (0 : fond
  // opaque ; 0,2 pour la barre translucide). Le contraste est alors garanti sur le fond
  // tel qu'il s'affiche, aux deux extrêmes de ce qui peut se trouver derrière.
  function palette(input, dark, show = 0) {
    const theme = input && Array.isArray(input.colors) && typeof input.intensity === 'number' ? input : normalize(input);
    const isDark = theme.mode === 'auto' ? !!dark : theme.mode === 'dark';
    const base = isDark ? BASE.dark : BASE.light;
    const t = tintOf(theme, isDark);
    let stops = theme.colors.length ? theme.colors.map((c) => mix(rgb(c), base, t)) : [base];
    // Famille de texte : celle qui se lit le mieux sur la moyenne du fond.
    const mean = stops.reduce((a, s) => a + lum(s), 0) / stops.length;
    const name = mean < 0.2 ? 'dark' : 'light';
    const fam = FAMILY[name];
    // Un arrêt trop proche du texte (zone moyenne, illisible des deux côtés) est
    // éloigné, par petits pas, jusqu'à ce que tout texte y soit lisible.
    // (Les arrêts sont arrondis à l'octet avant chaque mesure : c'est la couleur affichée.)
    const DIM_MAX = 0.9;
    const whole = (c) => c.map(Math.round);
    // Un arrêt tel qu'il s'affiche : lui-même, ou mêlé à ce qui se voit à travers la barre.
    const through = show > 0 ? clamp(show, 0, 0.5) : 0;
    const seen = (c) => (through ? [c, ...BACKDROP[dark ? 'dark' : 'light'].map((b) => whole(over(b, through, c)))] : [c]);
    const worstSeen = (c, alpha) => Math.min(...seen(c).map((x) => worst(x, fam, alpha)));
    stops = stops.map((s) => {
      let c = whole(s);
      for (let i = 0; i < 80 && worstSeen(c, DIM_MAX) < TARGET; i++) c = whole(mix(fam.push, c, 0.04));
      return c;
    });
    // Texte discret : l'opacité la plus faible qui reste lisible partout.
    let dim = fam.dim;
    while (dim < DIM_MAX && stops.some((s) => worstSeen(s, dim) < TARGET)) dim = Math.round((dim + 0.01) * 100) / 100;
    const accent = rgb(theme.accent);
    // Couleur employée comme texte sur une pastille (compteur du bouclier, « Non
    // sécurisé ») : rapprochée du texte tant qu'elle ne s'y lit pas.
    const legible = (color) => {
      let c = whole(color);
      for (let i = 0; i < 40 && stops.some((s) => seen(s).some((x) => contrast(c, over(fam.ink, fam.pill, x)) < TARGET)); i++) c = whole(mix(fam.fg, c, 0.1));
      return c;
    };
    const accentText = legible(mix(accent, fam.fg, 0.55));
    // Texte posé sur l'accent (ligne choisie de la barre de commande) : blanc, sauf sur un accent pâle.
    const onAccent = contrast([255, 255, 255], accent) >= 3 ? [255, 255, 255] : [20, 20, 22];
    const rgba = (c, a) => `rgba(${c.map(Math.round).join(', ')}, ${a})`;
    return {
      dark: isDark,
      family: name,
      stops: stops.map(hex),
      accent: theme.accent,
      onAccent: hex(onAccent),
      accentText: hex(accentText),
      warn: hex(legible([194, 65, 12])),
      danger: hex(legible([220, 38, 38])),
      fg: hex(fam.fg),
      secondary: rgba(fam.fg, SECONDARY),
      dim: rgba(fam.ink, dim),
      faint: rgba(fam.ink, fam.faint),
      hover: rgba(fam.ink, fam.hover),
      pill: rgba(fam.ink, fam.pill),
      line: rgba(fam.ink, fam.line),
      active: fam.active[1] === 1 ? hex(fam.active[0]) : rgba(fam.active[0], fam.active[1]),
      activeShadow: name === 'light' ? '0 1px 3px rgba(0, 0, 0, 0.13), 0 0 0 0.5px rgba(0, 0, 0, 0.05)' : 'none',
      grain: theme.grain,
      texture: theme.texture,
      // Contraste le plus faible de la barre (texte principal, onglet en veille, texte discret).
      // (Barre translucide : sur le fond tel qu'il s'affiche, aux deux extrêmes de l'arrière-plan.)
      contrast: Math.min(...stops.map((s) => worstSeen(s, dim))),
    };
  }

  // Fond CSS d'une palette ; `alpha` < 1 pour la barre translucide.
  function paint(p, alpha = 1) {
    const c = (h) => (alpha >= 1 ? h : `rgba(${rgb(h).join(', ')}, ${alpha})`);
    if (p.stops.length === 1) return c(p.stops[0]);
    return `linear-gradient(160deg, ${p.stops.map(c).join(', ')})`;
  }

  // Variables CSS d'une palette (fond compris), à poser sur un élément.
  function cssVars(p, alpha = 1) {
    return {
      '--accent': p.accent,
      '--on-accent': p.onAccent,
      '--accent-text': p.accentText,
      '--warn': p.warn,
      '--danger': p.danger,
      '--fg': p.fg,
      '--secondary': p.secondary,
      '--dim': p.dim,
      '--faint': p.faint,
      '--hover': p.hover,
      '--pill': p.pill,
      '--line': p.line,
      '--active': p.active,
      '--active-shadow': p.activeShadow,
      '--bg': p.stops[0],
      '--paint': paint(p, alpha),
      '--grain': String(p.grain),
      '--texture': `url("textures/${p.texture}.png")`,
    };
  }
  // Celles qui ne concernent que le texte et les surfaces (pas le fond).
  const TEXT_VARS = ['--accent', '--on-accent', '--accent-text', '--warn', '--danger', '--fg', '--secondary', '--dim', '--faint', '--hover', '--pill', '--line', '--active', '--active-shadow'];

  return { BACKDROP, DEFAULT_COLOR, TEXTURES, MODES, MAX_COLORS, MIN_CONTRAST, PALETTES, PRESETS, TEXT_VARS, isHex, rgb, hex, mix, over, lum, contrast, hsvToHex, hexToHsv, normalize, apply, tintOf, palette, paint, cssVars };
});
