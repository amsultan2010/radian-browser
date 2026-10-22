// Glisser pendant qu'une animation des listes est en cours : juste après un
// dépôt, ou pendant le retour des lignes après un abandon.
//
// Le relevé des lignes, fait au début de chaque glisser, lisait leur position à
// l'écran : une ligne encore en mouvement y figurait décalée et le dépôt tombait
// une ligne à côté. Sur une machine rapide l'animation est finie avant le geste
// suivant ; sur une machine chargée, non. On ralentit donc les animations dix
// fois au moment voulu, pour que le geste tombe toujours en plein dedans.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Glisser enchaîné pendant une animation',
  async test(ctx, t) {
    const { shell, jusqua } = ctx;
    const m = shell.mouse;
    const today = () => ctx.titres('#today');
    // Lignes des listes dont la transformation est en cours d'animation (retour
    // d'un glisser, ou glissement d'une ligne vers sa nouvelle place quand la liste
    // change), avec leur écart à leur place dans la mise en page.
    const enMouvement = () => shell.evaluate(() => document.getElementById('scroll').getAnimations({ subtree: true })
      .filter((a) => (a.transitionProperty === 'transform' || a.id === 'flip') && a.playState === 'running' && a.effect.target.matches('#today .row'))
      .map((a) => ({ titre: a.effect.target.textContent.trim(), dy: Math.round(new DOMMatrix(getComputedStyle(a.effect.target).transform).m42) })));
    const hauts = () => shell.locator('#today .row.tab').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));

    // Un favori dès le départ : sans lui, la zone de dépôt des favoris s'ouvre au
    // début de chaque glisser et décale toute la colonne sous le pointeur.
    await ctx.ouvrir('/connexion', 'Connexion');
    for (const c of ['a', 'b', 'c', 'd']) await ctx.ouvrir('/' + c, 'Page ' + c.toUpperCase());
    await ctx.principal(({ w }) => w.toggleFavorite(w.space.today[4]));
    await jusqua(async () => (await shell.locator('#fav .tile').count()) === 1, 'un favori');
    assert.deepEqual(await today(), ['Page D', 'Page C', 'Page B', 'Page A']);
    await jusqua(async () => !(await enMouvement()).length, 'lignes au repos');

    // Emplacements des quatre lignes, relevés au repos : les gestes visent ces
    // points fixes, pas des lignes en mouvement.
    const cases = await shell.locator('#today .row.tab').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }));
    const point = (i, fy) => ({ x: cases[i].x + cases[i].w / 2, y: cases[i].y + cases[i].h * fy });
    const lent = () => ctx.vitesseAnimations(0.1);

    try {
      await t.verifier('dépôt accepté : les lignes écartées sont aussitôt à leur place, sans revenir en glissant', async () => {
        // A, tout en bas, monte au-dessus de D : D, C et B descendent d'un cran.
        // Les animations sont ralenties une fois les lignes écartées, juste avant
        // de lâcher. (Dans ce sens, les lignes écartées ne sont pas réinsérées par
        // le nouvel état : leur transformation retirée s'animait.)
        await ctx.glisser(point(3, 0.5), point(0, 0.2), { pause: 300, avantLacher: lent });
        await jusqua(async () => (await today()).join() === 'Page A,Page D,Page C,Page B', 'ordre A D C B');
        assert.deepEqual((await hauts()).slice(1), cases.slice(1).map((c) => Math.round(c.y)), 'D, C et B sont à leur place définitive dès le dépôt');
        assert.deepEqual((await enMouvement()).filter((x) => x.dy), [], 'aucune ligne ne glisse encore');
      });

      await t.verifier('un glisser enchaîné aussitôt après un dépôt tombe où on le vise', async () => {
        // A, maintenant en haut, vise le bas de la troisième case : sous C.
        await ctx.glisser(point(0, 0.5), point(2, 0.8));
        await jusqua(async () => (await today()).join() === 'Page D,Page C,Page A,Page B', 'ordre D C A B');
      });

      await ctx.vitesseAnimations(1);
      await jusqua(async () => !(await enMouvement()).length, 'lignes au repos');

      await t.verifier('un glisser repris pendant le retour des lignes (abandon) tombe où on le vise', async () => {
        // B, tout en bas, survole la première ligne : D, C et A descendent d'un
        // cran. On sort alors des listes par le haut, animations ralenties, et on
        // lâche : rien ne change, les lignes reviennent en glissant.
        await ctx.glisser(point(3, 0.5), point(0, 0.2), {
          pause: 300,
          avantLacher: async () => { await lent(); await m.move(point(0, 0).x, 20, { steps: 3 }); await m.move(point(0, 0).x, 20); },
        });
        const retour = await enMouvement();
        assert.ok(retour.some((x) => x.dy > 8), 'les lignes sont encore loin de leur place : ' + JSON.stringify(retour));
        assert.deepEqual(await today(), ['Page D', 'Page C', 'Page A', 'Page B']);
        // Repris aussitôt : B vise le bas de la première case, donc sous D.
        await ctx.glisser(point(3, 0.5), point(0, 0.8));
        await jusqua(async () => (await today()).join() === 'Page D,Page B,Page C,Page A', 'ordre D B C A');
      });
    } finally {
      await ctx.vitesseAnimations(1);
    }
    await ctx.capture('glisser-enchaine');
  },
};
