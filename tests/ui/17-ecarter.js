// Pendant un glisser dans les listes, les lignes voisines s'écartent pour
// montrer où l'onglet va tomber ; la ligne emportée laisse sa place. Vérifié à
// la souris, y compris avec 400 lignes (coût par mouvement, mises en page).
const assert = require('node:assert/strict');

const PAS = 41; // une ligne (37) et l'écart qui la sépare de la suivante (4)

module.exports = {
  nom: 'Lignes qui s’écartent pendant le glisser',
  async test(ctx, t) {
    const { shell, jusqua, sleep, delai } = ctx;
    const m = shell.mouse;
    const today = () => ctx.titres('#today');
    const ligne = (titre, zone = '#today') => ctx.ligne(titre, zone);

    // État visible de la colonne : position réelle à l'écran de chaque ligne
    // (transformations comprises), décalage appliqué, et place libre affichée.
    // Les ordonnées sont comptées depuis le nom de l'Espace : pendant un glisser,
    // la zone de dépôt des favoris s'ouvre au-dessus et décale toute la colonne.
    const lire = () => shell.evaluate(() => {
      const nom = (el) => el.id || el.querySelector('.title').textContent;
      const ref = document.getElementById('space-head').getBoundingClientRect().top;
      const lignes = {};
      for (const el of document.querySelectorAll('#pinned .row, #divider, #b-newtab, #today .row')) {
        const r = el.getBoundingClientRect();
        if (!r.height) continue;
        const s = getComputedStyle(el);
        lignes[nom(el)] = { y: Math.round(r.top - ref), bas: Math.round(r.bottom - ref), dy: Math.round(new DOMMatrix(s.transform).m42), opacite: Number(s.opacity), duree: s.transitionProperty.split(', ').includes('transform') ? parseFloat(s.transitionDuration.split(', ')[s.transitionProperty.split(', ').indexOf('transform')]) : -1 };
      }
      const l = document.getElementById('drop-line');
      const r = l.getBoundingClientRect();
      const place = getComputedStyle(l).display === 'none' ? null : { y: Math.round(r.top - ref), bas: Math.round(r.bottom - ref), genre: l.className };
      const z = document.getElementById('pinned').getBoundingClientRect();
      return { lignes, place, epingles: { y: Math.round(z.top - ref), bas: Math.round(z.bottom - ref) }, ecarte: document.body.classList.contains('parting'), enCours: document.body.classList.contains('dragging'), dossier: !!document.querySelector('.drop-into') };
    });
    // Distance verticale entre deux lignes (indépendante de ce qui s'ouvre au-dessus).
    const ecart = (etat, a, b) => etat.lignes[a].y - etat.lignes[b].y;
    // Position de chaque ligne dans la mise en page, décalage retiré.
    const naturel = (etat) => Object.fromEntries(Object.entries(etat.lignes).map(([k, v]) => [k, { y: v.y - v.dy }]));
    const decalages = (etat) => Object.fromEntries(Object.entries(etat.lignes).map(([k, v]) => [k, v.dy]));
    // Aucune ligne visible ne recouvre la place libre.
    const placeLibre = (etat) => Object.entries(etat.lignes).every(([, v]) => v.opacite === 0 || v.bas <= etat.place.y + 1 || v.y >= etat.place.bas - 1);

    // Saisit une ligne, s'arrête à chaque point (le temps que les lignes
    // finissent de glisser) et y relève l'état. Ne relâche pas : voir `lacher`.
    // Les points sont visés une fois le glisser commencé : la zone de dépôt des
    // favoris s'ouvre à ce moment-là et décale la colonne.
    const saisir = async (de, viser) => {
      const releves = [];
      const geste = (async () => {
        await m.move(de.x, de.y);
        await m.down();
        await m.move(de.x + 3, de.y + 3, { steps: 2 });
        await m.move(de.x + 8, de.y + 8, { steps: 2 });
        await sleep(150);
        const points = await viser();
        releves.push(await lire()); // au départ, avant tout mouvement
        for (const p of points) {
          await m.move(p.x, p.y, { steps: 6 });
          await m.move(p.x, p.y);
          await sleep(280);
          releves.push(await lire());
        }
      })();
      try { await delai(geste, 15000, 'glisser (annulé par la page ?)'); } catch (err) { ctx.bloque = true; throw err; }
      return releves;
    };
    const lacher = async () => { await delai(m.up(), 5000, 'déposer'); await sleep(60); };
    const repos = () => jusqua(async () => { const e = await lire(); return !e.ecarte && !e.enCours && !e.place && Object.values(e.lignes).every((v) => v.dy === 0 && v.opacite === 1) && e; }, 'lignes revenues au repos');

    // Un favori dès le départ : sans lui, la zone de dépôt des favoris s'ouvre au
    // début de chaque glisser et décale toute la colonne sous le pointeur.
    await ctx.ouvrir('/connexion', 'Connexion');
    for (const c of ['a', 'b', 'c', 'd', 'e']) await ctx.ouvrir('/' + c, 'Page ' + c.toUpperCase());
    await ctx.principal(({ w }) => w.toggleFavorite(w.space.today[5]));
    await jusqua(async () => (await shell.locator('#fav .tile').count()) === 1, 'un favori');
    assert.deepEqual(await today(), ['Page E', 'Page D', 'Page C', 'Page B', 'Page A']);
    // L'onglet devenu favori a quitté la liste : les lignes finissent de glisser à leur place.
    await repos();

    await t.verifier('saisir une ligne ne déplace rien : elle disparaît, sa place devient la place libre', async () => {
      const repere = await lire();
      const [depart] = await saisir(await ctx.centre(ligne('Page C')), async () => []);
      assert.deepEqual(decalages(depart), { divider: 0, 'b-newtab': 0, 'Page E': 0, 'Page D': 0, 'Page C': 0, 'Page B': 0, 'Page A': 0 });
      assert.equal(depart.lignes['Page C'].opacite, 0);
      assert.equal(depart.place.y, repere.lignes['Page C'].y, 'la colonne ne bouge pas au départ du glisser');
      assert.equal(depart.place.bas, repere.lignes['Page C'].bas);
      assert.equal(depart.ecarte && depart.enCours, true);
      await lacher();
      await repos();
      assert.deepEqual(await today(), ['Page E', 'Page D', 'Page C', 'Page B', 'Page A']);
    });

    await t.verifier('remonter une ligne : celles du dessous de la cible descendent d’un cran et ouvrent une place libre', async () => {
      const [depart, haut, milieu] = await saisir(await ctx.centre(ligne('Page A')), async () => [await ctx.centre(ligne('Page E'), 0.5, 0.2), await ctx.centre(ligne('Page B'), 0.5, 0.5)]);
      const avant = naturel(depart);
      assert.deepEqual(decalages(haut), { divider: 0, 'b-newtab': 0, 'Page E': PAS, 'Page D': PAS, 'Page C': PAS, 'Page B': PAS, 'Page A': 0 });
      assert.equal(haut.lignes['Page A'].opacite, 0, 'la ligne emportée laisse sa place');
      assert.equal(haut.place.genre, 'slot');
      assert.equal(haut.place.y, avant['Page E'].y, 'la place libre est là où se trouvait la première ligne');
      assert.equal(haut.place.bas - haut.place.y, 37);
      assert.ok(placeLibre(haut), 'aucune ligne ne recouvre la place libre');
      assert.ok(Math.abs(haut.lignes['Page E'].duree - 0.14) < 0.001, 'glissement de 140 ms : ' + haut.lignes['Page E'].duree);
      // Plus bas : seules les lignes entre la cible et l'origine restent décalées.
      assert.deepEqual(decalages(milieu), { divider: 0, 'b-newtab': 0, 'Page E': 0, 'Page D': 0, 'Page C': 0, 'Page B': PAS, 'Page A': 0 });
      assert.equal(milieu.place.y, avant['Page B'].y);
      assert.ok(placeLibre(milieu));
      await lacher();
      await jusqua(async () => (await today()).join() === 'Page E,Page D,Page C,Page A,Page B', 'A entre C et B');
      const apres = await repos();
      assert.equal(ecart(apres, 'Page A', 'Page E'), milieu.place.y - milieu.lignes['Page E'].y, 'la ligne tombe exactement dans la place ouverte');
      assert.equal(ecart(apres, 'Page B', 'Page E'), ecart(milieu, 'Page B', 'Page E'), 'les autres ne bougent plus au dépôt');
    });

    await t.verifier('descendre une ligne : les suivantes remontent dans la place qu’elle laisse', async () => {
      const [depart, bas] = await saisir(await ctx.centre(ligne('Page E')), async () => [await ctx.centre(ligne('Page A'), 0.5, 0.8)]);
      const avant = naturel(depart);
      assert.deepEqual(decalages(bas), { divider: 0, 'b-newtab': 0, 'Page E': 0, 'Page D': -PAS, 'Page C': -PAS, 'Page A': -PAS, 'Page B': 0 });
      assert.equal(bas.lignes['Page D'].y, avant['Page E'].y, 'la ligne suivante occupe la place de la ligne emportée');
      assert.equal(bas.place.y, avant['Page A'].y);
      assert.ok(placeLibre(bas));
      await lacher();
      await jusqua(async () => (await today()).join() === 'Page D,Page C,Page A,Page E,Page B', 'E entre A et B');
      const apres = await repos();
      assert.equal(ecart(apres, 'Page E', 'Page D'), bas.place.y - bas.lignes['Page D'].y);
    });

    await t.verifier('glisser abandonné (lâché hors des listes) : les lignes reviennent en place, rien ne change', async () => {
      const [, ecarte] = await saisir(await ctx.centre(ligne('Page B')), async () => [await ctx.centre(ligne('Page D'), 0.5, 0.2)]);
      assert.equal(ecarte.lignes['Page D'].dy, PAS);
      await m.move(120, 20, { steps: 4 });
      await m.move(120, 20);
      await sleep(250);
      const dehors = await lire();
      assert.equal(dehors.place, null, 'hors des listes : plus de place libre');
      assert.ok(Object.values(dehors.lignes).every((v) => v.dy === 0), 'les lignes sont revenues');
      await lacher();
      await repos();
      assert.deepEqual(await today(), ['Page D', 'Page C', 'Page A', 'Page E', 'Page B']);
    });

    await t.verifier('vers les épinglés vides : une place s’ouvre sous le nom de l’Espace, sans que la liste change de taille', async () => {
      const [depart, e] = await saisir(await ctx.centre(ligne('Page B')), async () => [await ctx.centre(shell.locator('#pinned'), 0.5, 0.5)]);
      assert.equal(depart.epingles.bas - depart.epingles.y, 4, 'la zone vide ne s’agrandit pas pendant le glisser');
      // 33 et non 41 : la liste vide occupe déjà 4 points, et une ligne seule n'a pas d'écart.
      assert.deepEqual(decalages(e), { divider: 33, 'b-newtab': 33, 'Page D': 33, 'Page C': 33, 'Page A': 33, 'Page E': 33, 'Page B': 0 });
      assert.equal(e.place.y, e.epingles.y);
      assert.equal(e.place.bas - e.place.y, 37);
      assert.ok(placeLibre(e));
      await lacher();
      await jusqua(async () => (await ctx.titres('#pinned')).join() === 'Page B', 'B épinglé');
      const apres = await repos();
      assert.equal(ecart(apres, 'Page D', 'Page B'), e.lignes['Page D'].y - e.place.y, 'tout est déjà à sa place définitive');
    });

    await t.verifier('d’une liste à l’autre : tout ce qui sépare l’origine de la cible se décale (séparateur, « Nouvel onglet »)', async () => {
      const [depart, e] = await saisir(await ctx.centre(ligne('Page E')), async () => [await ctx.centre(ligne('Page B', '#pinned'), 0.5, 0.2)]);
      assert.deepEqual(decalages(e), { 'Page B': PAS, divider: PAS, 'b-newtab': PAS, 'Page D': PAS, 'Page C': PAS, 'Page A': PAS, 'Page E': 0 });
      assert.equal(e.place.y, naturel(depart)['Page B'].y);
      await ctx.capture('ecarter-glisser');
      assert.ok(placeLibre(e));
      await lacher();
      await jusqua(async () => (await ctx.titres('#pinned')).join() === 'Page E,Page B', 'E épinglé au-dessus de B');
      const apres = await repos();
      assert.equal(ecart(apres, 'Page B', 'Page E'), e.lignes['Page B'].y - e.place.y, 'la ligne tombe dans la place ouverte');
      assert.equal(ecart(apres, 'Page D', 'Page B'), ecart(e, 'Page D', 'Page B'), 'la liste du bas est déjà à sa place définitive');
    });

    await t.verifier('« Réduire les animations » : même écartement, sans glissement', async () => {
      await shell.emulateMedia({ reducedMotion: 'reduce' });
      try {
        const [, e] = await saisir(await ctx.centre(ligne('Page A')), async () => [await ctx.centre(ligne('Page D'), 0.5, 0.2)]);
        assert.equal(e.lignes['Page D'].dy, PAS);
        assert.equal(e.lignes['Page C'].dy, PAS);
        assert.ok(e.lignes['Page D'].duree >= 0 && e.lignes['Page D'].duree < 0.001, 'durée ' + e.lignes['Page D'].duree);
        await lacher();
        await jusqua(async () => (await today()).join() === 'Page A,Page D,Page C', 'A en tête');
        await repos();
      } finally {
        await shell.emulateMedia({ reducedMotion: null });
      }
    });

    await ctx.ouvrir('/saisie', 'Page Saisie');

    await t.verifier('glisser une sélection : chaque ligne emportée laisse sa place, la place ouverte a leur hauteur', async () => {
      // Saisie, A, D, C : on emporte Saisie et D sous C.
      await ctx.clic(shell, ligne('Page D'), { modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
      await jusqua(async () => (await shell.locator('#today .sel').count()) === 2, 'deux lignes sélectionnées');
      const [depart, e] = await saisir(await ctx.centre(ligne('Page D')), async () => [await ctx.centre(ligne('Page C'), 0.5, 0.8)]);
      assert.equal(e.lignes['Page A'].dy, -PAS, 'A remonte dans la place de Saisie');
      assert.equal(e.lignes['Page C'].dy, -2 * PAS, 'C remonte de deux crans');
      assert.equal(e.lignes['Page Saisie'].opacite + e.lignes['Page D'].opacite, 0, 'les deux lignes emportées laissent leur place');
      assert.equal(e.place.bas - e.place.y, 2 * PAS - 4, 'place pour deux lignes');
      assert.equal(e.place.y, naturel(depart)['Page A'].y + PAS);
      assert.ok(placeLibre(e));
      await lacher();
      await jusqua(async () => (await today()).join() === 'Page A,Page C,Page Saisie,Page D', 'sélection sous C');
      await repos();
    });

    // --- 400 lignes : le geste reste léger ---------------------------------------
    await ctx.principal(({ w }) => {
      for (let i = 0; i < 400; i++) { const tab = w.createTab('http://127.0.0.1:9/' + i, { index: w.space.today.length }); tab.title = 'Ligne ' + i; }
      w.changed();
    });
    await jusqua(async () => (await shell.locator('#today .row.tab').count()) === 404, '404 lignes');

    await t.verifier('400 lignes : un mouvement de glisser coûte moins d’une demi-milliseconde, sans mise en page', async () => {
      const cdp = await shell.context().newCDPSession(shell);
      await cdp.send('Performance.enable');
      const mesures = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
      await shell.evaluate(() => {
        const p = (window.__perf = { couts: [], images: [], actif: true });
        let t0 = 0;
        for (const n of ['dragover', 'dragenter']) {
          window.addEventListener(n, () => { t0 = performance.now(); }, true);
          window.addEventListener(n, () => { p.couts.push(performance.now() - t0); });
        }
        const image = (ts) => { p.images.push(ts); if (p.actif) requestAnimationFrame(image); };
        requestAnimationFrame(image);
      });
      const de = await ctx.centre(ligne('Page C'));
      const haut = (await ctx.centre(ligne('Page A'), 0.5, 0.3)).y;
      const bas = (await shell.locator('#scroll').boundingBox());
      const fond = bas.y + bas.height - 30;
      let avant = null;
      let apres = null;
      const geste = (async () => {
        await m.move(de.x, de.y);
        await m.down();
        await m.move(de.x + 3, de.y + 3, { steps: 2 });
        await m.move(de.x + 8, de.y + 8, { steps: 2 });
        await sleep(200);
        await m.move(de.x, de.y + 30);
        await sleep(300); // premier survol : relevé des 404 lignes, hors mesure
        await shell.evaluate(() => { window.__perf.couts.length = 0; window.__perf.images.length = 0; });
        avant = await mesures();
        // Trois allers-retours sur toute la hauteur visible, par petits pas.
        for (let tour = 0; tour < 3; tour++) {
          for (let y = haut; y < fond; y += 6) { await m.move(de.x, y); await sleep(4); }
          for (let y = fond; y > haut; y -= 6) { await m.move(de.x, y); await sleep(4); }
        }
        apres = await mesures();
      })();
      try { await delai(geste, 30000, 'glisser (annulé par la page ?)'); } catch (err) { ctx.bloque = true; throw err; }
      const perf = await shell.evaluate(() => { const p = window.__perf; p.actif = false; return { couts: p.couts, images: p.images }; });
      await m.move(120, 20, { steps: 3 });
      await lacher();
      await repos();
      await cdp.detach().catch(() => {});
      const tri = [...perf.couts].sort((a, b) => a - b);
      const ecarts = perf.images.slice(1).map((x, i) => x - perf.images[i]).sort((a, b) => a - b);
      const r = {
        mouvements: tri.length,
        coutMoyen: tri.reduce((a, b) => a + b, 0) / tri.length,
        cout95: tri[Math.floor(tri.length * 0.95)],
        coutMax: tri[tri.length - 1],
        misesEnPage: apres.LayoutCount - avant.LayoutCount,
        dureeMiseEnPage: (apres.LayoutDuration - avant.LayoutDuration) * 1000,
        stylesRecalcules: apres.RecalcStyleCount - avant.RecalcStyleCount,
        dureeStyles: (apres.RecalcStyleDuration - avant.RecalcStyleDuration) * 1000,
        dureeScript: (apres.ScriptDuration - avant.ScriptDuration) * 1000,
        images: ecarts.length,
        imageMediane: ecarts[Math.floor(ecarts.length / 2)],
        image95: ecarts[Math.floor(ecarts.length * 0.95)],
        imagesLentes: ecarts.filter((x) => x > 25).length,
      };
      console.log('    mesure : ' + JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v * 1000) / 1000]))));
      assert.ok(r.mouvements > 300, 'assez de mouvements mesurés : ' + r.mouvements);
      assert.ok(r.coutMoyen < 0.5, 'coût moyen par mouvement : ' + r.coutMoyen.toFixed(3) + ' ms');
      assert.ok(r.misesEnPage <= 6, 'mises en page pendant le geste : ' + r.misesEnPage);
      // Machine partagée, parfois très chargée : la cadence n'est vérifiée que largement.
      assert.ok(r.imageMediane < 34, 'cadence médiane : ' + r.imageMediane + ' ms');
      assert.deepEqual((await today()).slice(0, 4), ['Page A', 'Page C', 'Page Saisie', 'Page D']);
    });

    await ctx.capture('ecarter');
  },
};
