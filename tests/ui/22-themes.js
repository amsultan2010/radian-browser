// Thème d'un Espace : éditeur (nuancier à points, une à trois couleurs, thème par
// défaut, intensité, textures, apparence, thèmes et nuanciers prêts), application
// immédiate à la barre, lisibilité du texte sur toutes les couleurs, fondu entre
// deux Espaces, couleurs des vues flottantes.
//   ORBE_DOC_SHOTS=<dossier> : enregistre aussi les captures du LISEZMOI.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const Theme = require('../../src/renderer/theme');

module.exports = {
  nom: 'Thèmes',
  async test(ctx, t) {
    const { shell, modal, jusqua, sleep } = ctx;
    const espace = () => ctx.principal(({ w }) => ({ ...w.space, pinned: undefined, today: undefined }));
    const regler = (patch) => ctx.principal(({ w }, p) => { w.setTheme(p); }, patch);
    const editeurOuvert = () => modal.evaluate(() => !document.getElementById('theme').hidden);
    const ouvrirEditeur = async () => { await ctx.menu('spaces.editTheme'); await jusqua(editeurOuvert, 'éditeur de thème ouvert'); };
    // Ce que la barre affiche vraiment : fond, texture, famille de texte.
    const rendu = () => shell.evaluate(() => {
      const b = document.body;
      const cs = getComputedStyle(b);
      const grain = getComputedStyle(b, '::before');
      return {
        fond: cs.backgroundImage !== 'none' ? cs.backgroundImage : cs.backgroundColor,
        arrets: ((cs.backgroundImage !== 'none' ? cs.backgroundImage : cs.backgroundColor).match(/rgba?\([^)]+\)/g) || []),
        grainy: b.classList.contains('grainy'),
        texture: grain.backgroundImage,
        force: grain.content === 'none' ? 0 : Number(grain.opacity),
        melange: grain.mixBlendMode,
        famille: document.documentElement.dataset.family,
      };
    });
    // Contraste, lu dans les styles calculés : chaque texte de la barre, posé sur sa
    // surface (fond de la ligne par-dessus chaque arrêt du fond de la barre).
    const contraste = () => shell.evaluate(() => {
      // Couleur calculée : « rgb(r, g, b) », « rgba(…) » ou « color(srgb r g b / a) » (issue d'un color-mix).
      const parse = (c) => { const m = c.replace('srgb', '').match(/[\d.]+(e-?\d+)?/g).map(Number); const k = c.startsWith('color(') ? 255 : 1; return { c: m.slice(0, 3).map((v) => v * k), a: m.length > 3 ? m[3] : 1 }; };
      const over = (top, under) => top.c.map((v, i) => v * top.a + under[i] * (1 - top.a));
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const cs = getComputedStyle(document.body);
      // Barre translucide : le fond laisse passer le matériau du système, tenu ici pour
      // proche de la base (claire ou sombre) de la famille de texte.
      const base = document.documentElement.dataset.family === 'dark' ? [22, 22, 26] : [243, 243, 245];
      const stops = ((cs.backgroundImage !== 'none' ? cs.backgroundImage : cs.backgroundColor).match(/rgba?\([^)]+\)/g) || []).map(parse).map((s) => over(s, base));
      const out = {};
      const see = (name, el, surfaceEl) => {
        if (!el || !el.getClientRects().length) return;
        const text = parse(getComputedStyle(el).color);
        const bg = parse(getComputedStyle(surfaceEl || el).backgroundColor);
        out[name] = Math.min(...stops.map((s) => { const surface = over(bg, s); return ratio(over(text, surface), surface); }));
      };
      const q = (s) => document.querySelector(s);
      see('onglet actif', q('#sidebar .row.tab.active .title'), q('#sidebar .row.tab.active'));
      see('onglet', q('#today .row.tab.live:not(.active) .title'), q('#today .row.tab.live:not(.active)'));
      see('onglet en veille', q('#today .row.tab:not(.live):not(.active) .title'), q('#today .row.tab:not(.live):not(.active)'));
      see('nom de l’Espace', q('#space-name'), q('#space-head'));
      see('nouvel onglet', q('#b-newtab .title'), q('#b-newtab'));
      see('adresse', q('#url-text'), q('#url'));
      return out;
    });
    const lisible = async (quoi) => {
      // Le fond des lignes change en 150 ms d'un thème à l'autre : on mesure au repos.
      await jusqua(() => shell.evaluate(() => !document.getElementById('sidebar').getAnimations({ subtree: true }).some((a) => a.transitionProperty && a.playState === 'running')), 'couleurs au repos');
      const c = await contraste();
      const noms = Object.keys(c);
      assert.ok(noms.length >= 5, 'textes mesurés : ' + noms.join(', '));
      for (const n of noms) assert.ok(c[n] >= 4.5, `${quoi} — ${n} : contraste ${c[n].toFixed(2)}`);
      return Math.min(...Object.values(c));
    };
    const applique = (attendu) => jusqua(async () => JSON.stringify((await rendu()).arrets) === JSON.stringify(attendu.map((h) => `rgb(${Theme.rgb(h).join(', ')})`)), 'fond appliqué : ' + attendu.join(' '));
    // Composantes (0 à 255) d'une couleur calculée, quelle que soit sa notation.
    const rvb = (c) => { const m = c.replace('srgb', '').match(/[\d.]+(e-?\d+)?/g).map(Number); return m.slice(0, 3).map((v) => (c.startsWith('color(') ? v * 255 : v)); };
    const palette = async () => Theme.palette(await espace(), await ctx.principal(({ electron }) => electron.nativeTheme.shouldUseDarkColors));

    // Fond opaque pour lire les couleurs exactes (la translucidité a sa vérification).
    await ctx.principal(({ store, win }) => { store.state.settings.translucent = false; win.OrbeWindow.pushAll(); });
    await ctx.ouvrir('/a', 'Page A');
    await ctx.ouvrir('/b', 'Page B');
    await ctx.ouvrir('/c', 'Page C');
    // Un onglet en veille (non chargé), pour mesurer aussi son texte atténué.
    await ctx.principal(({ w }) => { const tab = w.createTab('http://127.0.0.1:9/veille', { index: w.space.today.length }); tab.title = 'En veille'; w.changed(); });
    await jusqua(async () => (await shell.locator('#today .row.tab').count()) === 4, 'quatre onglets');

    await t.verifier('l’éditeur s’ouvre : nuancier, 3 apparences, 8 thèmes, 27 teintes en trois familles de neuf, 4 textures', async () => {
      await ouvrirEditeur();
      const m = await modal.evaluate(() => ({
        points: document.querySelectorAll('#theme-wheel .dot').length,
        modes: [...document.querySelectorAll('#theme-modes .mode')].map((b) => b.dataset.mode),
        themes: document.querySelectorAll('#theme-presets .preset').length,
        familles: ['pastel', 'drab', 'grey'].map((f) => document.querySelectorAll(`#theme-palettes .sw-color[data-family=${f}]`).length),
        textures: [...document.querySelectorAll('#theme-textures .tx')].map((b) => b.dataset.tx),
        visible: (() => { const r = document.getElementById('theme').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.width > 250; })(),
      }));
      assert.deepEqual(m, { points: 1, modes: ['auto', 'light', 'dark'], themes: 8, familles: [9, 9, 9], textures: ['grain', 'sand', 'tweed', 'denim'], visible: true });
    });

    await t.verifier('déplacer un point du nuancier à la souris change la couleur de l’Espace, tout de suite', async () => {
      const avant = (await espace()).color;
      // (Le panneau finit de paraître : on attend que le nuancier ne bouge plus.)
      const roue = (await ctx.centre(modal.locator('#theme-wheel'))).box;
      const point = await ctx.centre(modal.locator('#theme-wheel .dot').first());
      // Vers la droite du cercle, à mi-rayon : teinte 90°, saturation 0,5.
      const cible = { x: roue.x + roue.width * 0.75, y: roue.y + roue.height * 0.5 };
      await modal.mouse.move(point.x, point.y);
      await modal.mouse.down();
      await modal.mouse.move((point.x + cible.x) / 2, (point.y + cible.y) / 2, { steps: 4 });
      const enRoute = (await espace()).color;
      await modal.mouse.move(cible.x, cible.y, { steps: 4 });
      await modal.mouse.up();
      await jusqua(async () => { const hsv = Theme.hexToHsv((await espace()).color); return Math.abs(hsv.h - 90) < 4 && Math.abs(hsv.s - 0.5) < 0.04; }, 'teinte 90°, saturation 0,5');
      assert.notEqual(enRoute, avant, 'la couleur suit le point pendant le geste');
      await applique((await palette()).stops);
      // Le point est resté sous le pointeur.
      const apres = await ctx.centre(modal.locator('#theme-wheel .dot').first());
      assert.ok(Math.hypot(apres.x - cible.x, apres.y - cible.y) < 2, 'point sous le pointeur');
    });

    await t.verifier('« + » ajoute une deuxième puis une troisième couleur : dégradé à trois arrêts, pas davantage', async () => {
      await ctx.clic(modal, '#theme-more');
      await jusqua(async () => !!(await espace()).color2, 'deuxième couleur');
      await ctx.clic(modal, '#theme-more');
      await jusqua(async () => !!(await espace()).color3, 'troisième couleur');
      const e = await espace();
      assert.equal(new Set([e.color, e.color2, e.color3]).size, 3, 'trois couleurs distinctes');
      assert.equal(await modal.locator('#theme-wheel .dot').count(), 3);
      assert.equal(await modal.locator('#theme-more').isDisabled(), true, '« + » désactivé à trois couleurs');
      const p = await palette();
      assert.equal(p.stops.length, 3);
      await applique(p.stops);
      assert.match((await rendu()).fond, /^linear-gradient\(160deg/);
      await lisible('dégradé à trois couleurs');
    });

    await t.verifier('« − » retire les couleurs ; sans aucune couleur, l’Espace reprend le thème par défaut', async () => {
      for (let n = 2; n >= 0; n--) {
        await ctx.clic(modal, '#theme-less');
        await jusqua(async () => (await modal.locator('#theme-wheel .dot').count()) === n, n + ' point(s)');
      }
      await jusqua(async () => (await espace()).plain === true, 'thème par défaut enregistré');
      const e = await espace();
      assert.deepEqual([e.color, e.color2, e.color3], [Theme.DEFAULT_COLOR, '', '']);
      const p = await palette();
      assert.equal(p.stops.length, 1);
      assert.ok(['#f3f3f5', '#16161a'].includes(p.stops[0]), 'fond neutre : ' + p.stops[0]);
      await applique(p.stops);
      assert.equal(await modal.locator('#theme-less').isDisabled(), true);
      assert.equal(await modal.locator('#theme-plain').isVisible(), true, 'le nuancier annonce le thème par défaut');
      await lisible('thème par défaut');
      // Un clic dans le nuancier repose une première couleur.
      const roue = (await ctx.centre(modal.locator('#theme-wheel'))).box;
      await modal.mouse.click(roue.x + roue.width * 0.5, roue.y + roue.height * 0.2);
      await jusqua(async () => (await espace()).plain !== true && (await modal.locator('#theme-wheel .dot').count()) === 1, 'une couleur reposée');
    });

    await t.verifier('une teinte des nuanciers s’applique au point choisi ; l’intensité renforce ou allège le fond', async () => {
      await ctx.clic(modal, '#theme-palettes .sw-color[data-family=drab] >> nth=5');
      await jusqua(async () => (await espace()).color === Theme.PALETTES.drab[5], 'teinte terne appliquée');
      const dist = async () => { const p = await palette(); const base = p.dark ? [22, 22, 26] : [243, 243, 245]; const s = Theme.rgb(p.stops[0]); return Math.hypot(...s.map((v, i) => v - base[i])); };
      const fixer = async (v) => {
        await modal.locator('#theme-intensity').evaluate((el, x) => { el.value = String(x); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
        await jusqua(async () => (await espace()).intensity === v / 100, 'intensité ' + v);
        await applique((await palette()).stops);
        return dist();
      };
      const faible = await fixer(10);
      const moyenne = await fixer(50);
      const forte = await fixer(95);
      assert.ok(faible < moyenne && moyenne < forte, `le fond s’éloigne de la base avec l’intensité : ${faible.toFixed(0)} < ${moyenne.toFixed(0)} < ${forte.toFixed(0)}`);
      await lisible('intensité forte');
      await fixer(50);
    });

    await t.verifier('quatre textures : chacune pose son carreau sous l’interface, à la force réglée ; force nulle, plus de texture', async () => {
      for (const nom of Theme.TEXTURES) {
        await ctx.clic(modal, `#theme-textures .tx[data-tx=${nom}]`);
        await jusqua(async () => (await espace()).texture === nom, 'texture ' + nom);
        const r = await jusqua(async () => { const x = await rendu(); return x.grainy && x.texture.includes(`textures/${nom}.png`) ? x : null; }, 'carreau ' + nom);
        assert.equal(r.melange, 'overlay');
        assert.ok(Math.abs(r.force - (await espace()).grain) < 0.011 && r.force > 0, 'force ' + r.force);
        // Le carreau existe et se charge : 192 px de côté.
        assert.equal(await shell.evaluate((n) => new Promise((res) => { const i = new Image(); i.onload = () => res(i.naturalWidth); i.onerror = () => res(0); i.src = `textures/${n}.png`; }), nom), 192);
      }
      const regle = async (v) => {
        await modal.locator('#theme-grain').evaluate((el, x) => { el.value = String(x); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
        await jusqua(async () => (await espace()).grain === v / 100, 'force ' + v);
      };
      await regle(60);
      await jusqua(async () => Math.abs((await rendu()).force - 0.6) < 0.011, 'force 0,6 affichée');
      // La texture est sous l'interface : elle ne recouvre ni les lignes ni le texte.
      assert.equal(await shell.evaluate(() => getComputedStyle(document.body, '::before').zIndex), '-1');
      await regle(0);
      await jusqua(async () => !(await rendu()).grainy, 'texture retirée');
    });

    await t.avecEcran('verifier', 'apparence de l’Espace (automatique, claire, sombre) : l’icône s’anime, la barre et les panneaux suivent', async () => {
      for (const [mode, anim] of [['dark', 'moon-rock'], ['light', 'rays-turn'], ['auto', 'star-twinkle']]) {
        await ctx.clic(modal, `#theme-modes .mode[data-mode=${mode}]`);
        const joue = await modal.evaluate((m) => [...document.querySelector(`.mode[data-mode=${m}]`).getAnimations({ subtree: true })].map((a) => a.animationName), mode);
        assert.ok(joue.includes(anim), `icône « ${mode} » animée (${joue.join(', ') || 'aucune animation'})`);
        await jusqua(async () => ((await espace()).mode || 'auto') === mode, 'mode ' + mode);
        if (mode === 'auto') continue;
        await jusqua(async () => (await rendu()).famille === mode, 'barre ' + mode);
        await jusqua(() => modal.evaluate((m) => document.documentElement.dataset.scheme === m, mode), 'panneau ' + mode);
        const fg = await shell.evaluate(() => getComputedStyle(document.querySelector('#sidebar .row.tab.active .title')).color);
        assert.equal(fg, mode === 'dark' ? 'rgb(243, 243, 245)' : 'rgb(29, 29, 31)');
        await lisible('apparence ' + mode);
      }
    });

    await t.verifier('les huit thèmes prêts s’appliquent d’un clic et restent lisibles, en clair comme en sombre', async () => {
      const mini = [];
      for (const preset of Theme.PRESETS) {
        await ctx.clic(modal, `#theme-presets .preset[data-preset=${preset.id}]`);
        await jusqua(async () => { const e = await espace(); return e.color === preset.colors[0] && e.texture === preset.texture && e.grain === preset.grain; }, 'thème ' + preset.id);
        for (const mode of ['light', 'dark']) {
          await regler({ mode });
          await applique((await palette()).stops);
          mini.push(await lisible(`thème ${preset.id} (${mode})`));
        }
      }
      console.log(`    contraste le plus faible sur les 16 combinaisons : ${Math.min(...mini).toFixed(2)}`);
      await regler({ mode: 'auto' });
    });

    await ctx.clic(modal, '#theme-done');
    await jusqua(async () => !(await editeurOuvert()), 'éditeur fermé');

    await t.verifier('couleurs au hasard (une à trois, toute intensité, clair et sombre) : le texte de la barre garde un contraste d’au moins 4,5', async () => {
      let graine = 20261009;
      const hasard = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
      const couleur = () => Theme.hex([hasard() * 255, hasard() * 255, hasard() * 255]);
      const mini = [];
      for (let i = 0; i < 36; i++) {
        const colors = Array.from({ length: 1 + Math.floor(hasard() * 3) }, couleur);
        await regler({ colors, intensity: Math.round(hasard() * 100) / 100, mode: i % 2 ? 'dark' : 'light', grain: 0 });
        await applique((await palette()).stops);
        mini.push(await lisible(`${colors.join(' ')} (${i % 2 ? 'sombre' : 'clair'})`));
      }
      console.log(`    36 thèmes au hasard : contraste le plus faible ${Math.min(...mini).toFixed(2)}`);
    });

    await t.verifier('changer de thème ne déplace rien dans la barre', async () => {
      const cotes = () => shell.evaluate(() => [...document.querySelectorAll('#sidebar .row, #url, #space-head, #divider, #bottom')].filter((el) => el.getClientRects().length).map((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(','); }).join('|'));
      await regler({ colors: ['#3b82f6'], intensity: 0.5, grain: 0, mode: 'light' });
      await applique((await palette()).stops);
      const avant = await cotes();
      await regler({ preset: 'orchidee', mode: 'dark', grain: 0.5, texture: 'tweed' });
      await applique((await palette()).stops);
      assert.equal(await cotes(), avant);
    });

    await t.verifier('barre translucide (réglage) : le fond laisse passer le bureau ; réglage coupé, il est opaque', async () => {
      const alpha = () => shell.evaluate(() => { const cs = getComputedStyle(document.body); const m = (cs.backgroundImage !== 'none' ? cs.backgroundImage : cs.backgroundColor).match(/rgba?\([^)]+\)/g).map((c) => c.match(/[\d.]+/g).map(Number)); return m.map((c) => (c.length > 3 ? c[3] : 1)); });
      assert.ok((await alpha()).every((a) => a === 1), 'opaque quand le réglage est coupé');
      await ctx.principal(({ store, win }) => { store.state.settings.translucent = true; win.OrbeWindow.pushAll(); });
      await jusqua(async () => (await alpha()).every((a) => a === 0.8), 'fond à 80 %');
      await lisible('barre translucide');
      await ctx.principal(({ store, win }) => { store.state.settings.translucent = false; win.OrbeWindow.pushAll(); });
      await jusqua(async () => (await alpha()).every((a) => a === 1), 'fond opaque');
    });

    await t.verifier('barre de commande, bascule et messages prennent la couleur de l’Espace', async () => {
      await regler({ colors: ['#10b981'], intensity: 0.5, mode: 'light', grain: 0 });
      await jusqua(() => modal.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === '#10b981'), 'accent transmis aux vues flottantes');
      await ctx.nouvelOnglet();
      await ctx.taper('Page', 'Page A');
      const m = await modal.evaluate(() => {
        const sel = document.querySelector('#cmd-list .cmd.sel');
        return { ligne: getComputedStyle(sel).backgroundColor, panneau: getComputedStyle(document.getElementById('command')).backgroundColor };
      });
      assert.equal(m.ligne, 'rgb(16, 185, 129)', 'ligne choisie à la couleur de l’Espace');
      // Panneau : base claire (250, 250, 252) teintée à 9 % par l'accent.
      const p = rvb(m.panneau);
      assert.ok(p[0] < 240 && p[1] > p[0] + 4 && p[1] >= p[2], 'panneau teinté de vert : ' + m.panneau);
      await modal.keyboard.press('Escape');
      await jusqua(async () => !(await ctx.commandeOuverte()), 'barre refermée');
      // Message : pilule sombre teintée.
      await ctx.principal(({ w }) => w.toast('Essai de message'));
      const toast = await ctx.attendrePage('overlay.html#toast');
      await jusqua(() => toast.evaluate(() => document.getElementById('toast').textContent === 'Essai de message' && getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === '#10b981'), 'message aux couleurs de l’Espace');
      const fond = rvb(await toast.evaluate(() => getComputedStyle(document.getElementById('toast')).backgroundColor));
      assert.ok(fond[1] > fond[0] + 15 && fond[1] > fond[2], 'pilule teintée de vert : ' + fond.map(Math.round).join(', '));
      assert.ok(Theme.contrast([255, 255, 255], fond) >= 4.5, 'texte du message lisible');
    });

    await t.verifier('d’un Espace à l’autre : le fond de l’autre Espace se fond par-dessus pendant le glissement, sa liste a déjà ses couleurs', async () => {
      await regler({ colors: ['#f5d98b'], intensity: 0.8, mode: 'light', grain: 0.3, texture: 'sand' });
      await ctx.menu('spaces.new');
      await ctx.creerEspace('Nuit');
      await jusqua(async () => (await shell.textContent('#space-name')) === 'Nuit', 'second Espace');
      await regler({ colors: ['#1e3a8a', '#0f172a'], intensity: 0.9, mode: 'dark', grain: 0.2, texture: 'denim' });
      const nuit = await palette();
      await applique(nuit.stops);
      assert.equal(nuit.family, 'dark');
      const reduit = await shell.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (reduit) return t.ignorer('fondu entre Espaces', '« Réduire les animations » est actif');
      // Le fondu se lit à mi-course : sans image présentée, il n'avance pas. Les deux
      // Espaces et leurs thèmes, eux, sont en place pour la vérification suivante.
      if (!ctx.milieu.vivant) return t.ignorer('fondu entre Espaces (lu à mi-course)', ctx.milieu.raison);
      await jusqua(() => shell.evaluate(() => !slide), 'listes au repos'); // eslint-disable-line no-undef
      await ctx.vitesseAnimations(0.15);
      try {
        await ctx.clic(shell, '#spaces .sp >> nth=0');
        const milieu = await jusqua(() => shell.evaluate(() => {
          /* global slide */
          const tint = document.getElementById('tint');
          const o = Number(getComputedStyle(tint).opacity);
          const g = document.querySelector('#pager .ghost');
          if (!slide || !g || !(o > 0.05 && o < 0.95)) return null;
          return { o, fond: getComputedStyle(tint).backgroundColor, grain: tint.classList.contains('grainy'), texture: getComputedStyle(tint, '::after').backgroundImage, fantome: getComputedStyle(g).getPropertyValue('--fg').trim(), corps: getComputedStyle(document.body).backgroundImage };
        }), 'fondu en cours');
        // La teinte porte le fond (clair, sable) du premier Espace ; le fond courant est encore celui de « Nuit ».
        assert.match(milieu.texture, /textures\/sand\.png/);
        assert.equal(milieu.grain, true);
        assert.equal(milieu.fantome, '#1d1d1f', 'la liste qui arrive a son texte sombre');
        assert.ok(milieu.corps.includes('linear-gradient'), 'le fond de l’Espace quitté reste dessous');
      } finally {
        await ctx.vitesseAnimations(1);
      }
      await jusqua(() => shell.evaluate(() => !slide && Number(getComputedStyle(document.getElementById('tint')).opacity) === 0), 'fin du fondu');
      const sable = await palette();
      await applique(sable.stops);
      assert.equal((await rendu()).famille, 'light');
      assert.match((await rendu()).texture, /sand\.png/);
      return undefined;
    });

    await t.verifier('le thème est enregistré avec l’Espace et retrouvé tel quel', async () => {
      // Écriture immédiate sur disque (profil d'essai), puis relecture du fichier.
      const file = await ctx.principal(({ store }) => { store.flush(); return store.file || null; });
      const saved = await ctx.principal(({ store }) => JSON.parse(JSON.stringify(store.state.spaces.map((s) => ({ color: s.color, color2: s.color2 || '', intensity: s.intensity, grain: s.grain, texture: s.texture, mode: s.mode })))));
      assert.deepEqual(saved[0], { color: '#f5d98b', color2: '', intensity: 0.8, grain: 0.3, texture: 'sand', mode: 'light' });
      assert.deepEqual(saved[1], { color: '#1e3a8a', color2: '#0f172a', intensity: 0.9, grain: 0.2, texture: 'denim', mode: 'dark' });
      const disque = JSON.parse(fs.readFileSync(file, 'utf8')).spaces;
      assert.deepEqual(Theme.normalize(disque[1]), { colors: ['#1e3a8a', '#0f172a'], accent: '#1e3a8a', intensity: 0.9, grain: 0.2, texture: 'denim', mode: 'dark' });
      // Un fichier abîmé ou ancien (valeurs hors bornes, champs absents) retombe sur des valeurs sûres.
      assert.deepEqual(Theme.normalize({ color: 'rouge', color2: '#12345', intensity: 7, grain: -1, texture: 'soie', mode: 'x' }), { colors: [], accent: Theme.DEFAULT_COLOR, intensity: 0.5, grain: 0, texture: 'grain', mode: 'auto' });
      assert.deepEqual(Theme.normalize({ color: '#10b981', color2: '#3b82f6', grain: 0.3 }).colors, ['#10b981', '#3b82f6'], 'ancien format (deux couleurs, grain) repris tel quel');
    });

    // --- Captures du LISEZMOI (profil d'essai, pages locales) ---------------------
    const dossier = process.env.ORBE_DOC_SHOTS;
    if (dossier) {
      fs.mkdirSync(dossier, { recursive: true });
      const photo = (nom) => ctx.principal(async ({ w }, a) => {
        const cap = process.mainModule.require(a.racine + '/tests/capture.js');
        process.mainModule.require('fs').writeFileSync(a.fichier, await cap.compose(w.win, '#ffffff'));
      }, { racine: ctx.root, fichier: path.join(dossier, nom + '.png') });
      await ctx.principal(({ w }) => { w.win.setContentSize(1180, 760); clearTimeout(w.toastTimer); if (w.toastView) { w.toastView.setVisible(false); try { w.win.contentView.removeChildView(w.toastView); } catch {} } });
      await sleep(300);
      await regler({ colors: ['#3b82f6'], intensity: 0.5, mode: 'light', grain: 0 });
      await sleep(400);
      await photo('theme-clair');
      await regler({ colors: ['#7c6cf0'], intensity: 0.55, mode: 'dark', grain: 0 });
      await sleep(400);
      await photo('theme-sombre');
      await regler({ preset: 'lagon', mode: 'light' });
      await regler({ grain: 0.45 });
      await sleep(400);
      await photo('theme-degrade-grain');
      await ouvrirEditeur();
      await sleep(500);
      await photo('theme-editeur');
      console.log(`    captures du LISEZMOI enregistrées dans ${dossier}`);
    }
  },
};
