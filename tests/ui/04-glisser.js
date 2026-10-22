// Glisser-déposer à la souris dans la barre latérale : réordonner Aujourd'hui,
// épingler, ranger dans un dossier, mettre en favori, et ressortir.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Glisser-déposer',
  async test(ctx, t) {
    const { shell, jusqua } = ctx;
    const today = () => ctx.titres('#today');
    const epingles = async () => (await ctx.etat()).epingles.map((n) => (n.dossier ? `[${n.dossier}: ${n.enfants.map((x) => x.title).join(', ')}]` : n.title));
    const favoris = async () => (await ctx.etat()).favoris.map((x) => x.title);
    const tuiles = () => shell.locator('#fav .tile').evaluateAll((els) => els.map((el) => el.title));
    const ligne = (titre, zone) => ctx.ligne(titre, zone);
    // Glisse `source` vers un point de `cible` (fractions de sa largeur/hauteur).
    const glisser = async (source, cible, fx = 0.5, fy = 0.5) => ctx.glisser(await ctx.centre(source), () => ctx.centre(cible, fx, fy));

    for (const c of ['a', 'b', 'c', 'd', 'e']) await ctx.ouvrir('/' + c, 'Page ' + c.toUpperCase());
    assert.deepEqual(await today(), ['Page E', 'Page D', 'Page C', 'Page B', 'Page A']);

    await t.verifier('glisser une ligne quand les favoris sont vides : le glisser démarre et tient', async () => {
      // Régression à surveiller : si `body.dragging` est posé pendant le dragstart,
      // #fav et #pinned vides s'agrandissent, la ligne saisie n'est plus sous la
      // souris et Chromium annule aussitôt le glisser (dragstart puis dragend).
      const r = await ctx.tenterGlisser(await ctx.centre(ligne('Page C')));
      assert.deepEqual(r.evenements, ['dragstart'], 'dragend immédiat : le glisser est annulé dès le départ');
    });
    assert.deepEqual(await today(), ['Page E', 'Page D', 'Page C', 'Page B', 'Page A']);


    await t.verifier('Aujourd’hui : glisser le dernier onglet tout en haut (repère de dépôt visible)', async () => {
      const r = await glisser(ligne('Page A'), ligne('Page E'), 0.5, 0.2);
      assert.equal(r.enCours, true, 'la coque sait qu’un glisser est en cours');
      assert.equal(r.ligne, true, 'le trait de dépôt est affiché');
      await jusqua(async () => (await today()).join() === 'Page A,Page E,Page D,Page C,Page B', 'ordre A E D C B');
      assert.deepEqual((await ctx.etat()).aujourdhui.map((x) => x.title), ['Page A', 'Page E', 'Page D', 'Page C', 'Page B']);
    });

    await t.verifier('après le dépôt : plus de repère ni d’état « glisser »', async () => {
      const m = await shell.evaluate(() => ({
        ligne: getComputedStyle(document.getElementById('drop-line')).display,
        corps: document.body.classList.contains('dragging'),
        soi: document.querySelectorAll('.dragging-self').length,
      }));
      assert.deepEqual(m, { ligne: 'none', corps: false, soi: 0 });
    });

    await t.verifier('Aujourd’hui : glisser le premier onglet sous le troisième', async () => {
      await glisser(ligne('Page A'), ligne('Page D'), 0.5, 0.8);
      await jusqua(async () => (await today()).join() === 'Page E,Page D,Page A,Page C,Page B', 'ordre E D A C B');
    });

    await t.verifier('Aujourd’hui : déposer dans le vide sous la liste place l’onglet en dernier', async () => {
      await glisser(ligne('Page E'), shell.locator('#blank'), 0.5, 0.5);
      await jusqua(async () => (await today()).join() === 'Page D,Page A,Page C,Page B,Page E', 'ordre D A C B E');
    });

    await t.verifier('lâcher un onglet sur lui-même ne change rien', async () => {
      await glisser(ligne('Page C'), ligne('Page C'), 0.6, 0.7);
      await ctx.sleep(200);
      assert.deepEqual(await today(), ['Page D', 'Page A', 'Page C', 'Page B', 'Page E']);
    });

    await t.verifier('Aujourd’hui → Épinglés : l’onglet passe dans la zone épinglée', async () => {
      await glisser(ligne('Page B'), shell.locator('#pinned'), 0.5, 0.5);
      await jusqua(async () => (await ctx.titres('#pinned')).join() === 'Page B', 'B épinglé');
      assert.deepEqual(await today(), ['Page D', 'Page A', 'Page C', 'Page E']);
      assert.deepEqual(await epingles(), ['Page B']);
    });

    await t.verifier('Aujourd’hui → Épinglés, au-dessus d’un onglet déjà épinglé', async () => {
      await glisser(ligne('Page C'), ligne('Page B', '#pinned'), 0.5, 0.2);
      await jusqua(async () => (await ctx.titres('#pinned')).join() === 'Page C,Page B', 'C puis B');
      assert.deepEqual(await today(), ['Page D', 'Page A', 'Page E']);
    });

    await t.verifier('« Nouveau dossier » (menu) puis saisie du nom', async () => {
      await ctx.menu('tabs.newFolder');
      await jusqua(() => shell.locator('#pinned .folder input.rename').count(), 'champ de nom du dossier');
      await shell.keyboard.type('Dossier', { delay: 10 });
      await shell.keyboard.press('Enter');
      await jusqua(async () => (await epingles()).join() === 'Page C,Page B,[Dossier: ]', 'dossier créé');
    });

    const tete = shell.locator('#pinned .folder > .row');

    await t.verifier('glisser un onglet sur un dossier : le dossier se met en évidence et reçoit l’onglet', async () => {
      const r = await glisser(ligne('Page A'), tete, 0.5, 0.5);
      assert.equal(r.dossier, true, 'dossier surligné pendant le survol');
      assert.equal(r.ligne, false, 'pas de trait de dépôt en même temps');
      await jusqua(async () => (await epingles()).join() === 'Page C,Page B,[Dossier: Page A]', 'A dans le dossier');
      assert.deepEqual(await ctx.titres('#pinned .folder .children'), ['Page A']);
      assert.deepEqual(await today(), ['Page D', 'Page E']);
    });

    await t.verifier('glisser un onglet dans un dossier ouvert, au-dessus de son contenu', async () => {
      await glisser(ligne('Page D'), ligne('Page A', '#pinned .folder'), 0.5, 0.2);
      await jusqua(async () => (await epingles()).join() === 'Page C,Page B,[Dossier: Page D, Page A]', 'D avant A dans le dossier');
      assert.deepEqual(await today(), ['Page E']);
    });

    await t.verifier('glisser le dossier lui-même en tête des épinglés', async () => {
      await glisser(tete, ligne('Page C', '#pinned'), 0.5, 0.2);
      await jusqua(async () => (await epingles()).join() === '[Dossier: Page D, Page A],Page C,Page B', 'dossier en tête');
    });

    await t.verifier('un dossier ne peut pas être déposé dans Aujourd’hui', async () => {
      await glisser(tete, ligne('Page E', '#today'), 0.5, 0.5);
      await ctx.sleep(200);
      assert.deepEqual(await epingles(), ['[Dossier: Page D, Page A]', 'Page C', 'Page B']);
      assert.deepEqual(await today(), ['Page E']);
    });

    await t.verifier('Aujourd’hui → grille des favoris : une tuile apparaît', async () => {
      await glisser(ligne('Page E'), shell.locator('#fav'), 0.5, 0.5);
      await jusqua(async () => (await tuiles()).join() === 'Page E', 'tuile E');
      assert.deepEqual(await today(), []);
      assert.deepEqual(await favoris(), ['Page E']);
    });

    await t.verifier('Épinglés → favoris, à gauche de la tuile existante', async () => {
      await glisser(ligne('Page B', '#pinned'), shell.locator('#fav .tile').first(), 0.2, 0.5);
      await jusqua(async () => (await tuiles()).join() === 'Page B,Page E', 'tuiles B puis E');
      assert.deepEqual(await epingles(), ['[Dossier: Page D, Page A]', 'Page C']);
    });

    await t.verifier('clic sur une tuile de favori : l’onglet devient actif', async () => {
      await ctx.clic(shell, shell.locator('#fav .tile').nth(1));
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/e'), 'favori E actif');
      assert.equal(await shell.locator('#fav .tile.active').count(), 1);
    });

    await t.verifier('favoris : glisser une tuile après l’autre change l’ordre', async () => {
      await glisser(shell.locator('#fav .tile').first(), shell.locator('#fav .tile').nth(1), 0.8, 0.5);
      await jusqua(async () => (await tuiles()).join() === 'Page E,Page B', 'tuiles E puis B');
    });

    await t.verifier('favori → Aujourd’hui : la tuile redevient une ligne', async () => {
      await glisser(shell.locator('#fav .tile').first(), shell.locator('#today'), 0.5, 0.5);
      await jusqua(async () => (await today()).join() === 'Page E', 'E de retour dans Aujourd’hui');
      assert.deepEqual(await tuiles(), ['Page B']);
    });

    await t.verifier('dossier → Aujourd’hui : l’onglet ressort du dossier, sous la ligne visée', async () => {
      await glisser(ligne('Page A', '#pinned .folder'), ligne('Page E', '#today'), 0.5, 0.8);
      await jusqua(async () => (await today()).join() === 'Page E,Page A', 'A sous E');
      assert.deepEqual(await epingles(), ['[Dossier: Page D]', 'Page C']);
    });

    await t.verifier('épinglé → Aujourd’hui : l’onglet est désépinglé', async () => {
      await glisser(ligne('Page C', '#pinned'), ligne('Page E', '#today'), 0.5, 0.2);
      await jusqua(async () => (await today()).join() === 'Page C,Page E,Page A', 'C en tête d’Aujourd’hui');
      assert.deepEqual(await epingles(), ['[Dossier: Page D]']);
    });


    await t.verifier('sans contournement, avec des favoris et des épinglés : le glisser fonctionne', async () => {
      await glisser(ligne('Page A', '#today'), ligne('Page C', '#today'), 0.5, 0.2);
      await jusqua(async () => (await today()).join() === 'Page A,Page C,Page E', 'ordre A C E');
    });

    await ctx.capture('glisser');
  },
};
