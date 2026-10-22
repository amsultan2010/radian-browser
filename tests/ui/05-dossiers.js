// Dossiers : création par le menu, nom saisi sur place, ouverture et fermeture
// au clic, contenu masqué quand le dossier est fermé.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Dossiers',
  async test(ctx, t) {
    const { shell, jusqua } = ctx;
    const champ = shell.locator('input.rename');
    const dossier = shell.locator('#pinned .folder').first();
    const tete = dossier.locator('> .row');
    const ouvert = () => dossier.evaluate((el) => el.classList.contains('open'));

    await ctx.ouvrir('/saisie', 'Page Saisie');
    await ctx.ouvrir('/a', 'Page A');

    await t.verifier('« Nouveau dossier » (élément de menu) : le dossier apparaît, ouvert, prêt à être nommé', async () => {
      await ctx.menu('tabs.newFolder');
      await jusqua(() => shell.locator('#pinned .folder').count(), 'dossier dans les épinglés');
      await jusqua(() => dossier.locator('input.rename').count(), 'champ de nom');
      assert.equal(await champ.inputValue(), 'Nouveau dossier');
      assert.equal(await ouvert(), true);
      assert.deepEqual((await ctx.etat()).epingles, [{ dossier: 'Nouveau dossier', ouvert: true, enfants: [] }]);
    });

    await t.avecFocus('verifier', '« Nouveau dossier » depuis le menu, un onglet étant actif : le clavier natif va dans le champ de nom', async () => {
      assert.equal((await ctx.etat()).focus, 'coque', 'le clavier est resté dans la page de l’onglet');
    });

    await t.verifier('saisie du nom puis Entrée', async () => {
      await shell.keyboard.type('Travail', { delay: 10 });
      await shell.keyboard.press('Enter');
      await jusqua(async () => (await champ.count()) === 0, 'champ refermé');
      await jusqua(async () => (await tete.locator('.title').textContent()) === 'Travail', 'nom affiché');
      assert.equal((await ctx.etat()).epingles[0].dossier, 'Travail');
    });

    await t.verifier('un onglet glissé sur le dossier s’y range', async () => {
      await ctx.glisser(await ctx.centre(ctx.ligne('Page A', '#today')), () => ctx.centre(tete));
      await jusqua(async () => (await ctx.titres('#pinned .folder .children')).join() === 'Page A', 'A dans le dossier');
      const enfant = await ctx.ligne('Page A', '#pinned .folder').boundingBox();
      const parent = await tete.boundingBox();
      assert.ok(enfant.x > parent.x, 'le contenu est en retrait');
      assert.ok(enfant.y >= parent.y + parent.height, 'le contenu est sous l’en-tête');
    });

    await t.verifier('clic sur l’en-tête : le dossier se ferme ; l’onglet actif qu’il contient reste visible (comme dans Arc)', async () => {
      await ctx.clic(shell, tete);
      await jusqua(async () => !(await ouvert()), 'dossier fermé');
      assert.equal(await ctx.ligne('Page A', '#pinned .folder').isVisible(), true);
      assert.equal((await ctx.etat()).epingles[0].ouvert, false);
      assert.equal((await ctx.etat()).actifUrl, ctx.url('/a'), 'l’onglet rangé reste actif');
    });

    await t.verifier('second clic : le dossier se rouvre', async () => {
      await ctx.clic(shell, tete);
      await jusqua(ouvert, 'dossier ouvert');
      assert.equal(await ctx.ligne('Page A', '#pinned .folder').isVisible(), true);
      assert.equal((await ctx.etat()).epingles[0].ouvert, true);
    });

    await t.verifier('clic sur le chevron : même effet', async () => {
      await ctx.clic(shell, tete.locator('.chev'));
      await jusqua(async () => !(await ouvert()), 'dossier fermé');
      await ctx.clic(shell, tete.locator('.chev'));
      await jusqua(ouvert, 'dossier ouvert');
    });

    await t.verifier('clic sur un onglet du dossier : il devient actif', async () => {
      await ctx.clic(shell, ctx.ligne('Page Saisie', '#today'));
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/saisie'), 'Saisie active');
      await ctx.clic(shell, ctx.ligne('Page A', '#pinned .folder'));
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/a'), 'A active');
    });

    await t.verifier('double-clic sur l’en-tête : renommage, le dossier garde son état ouvert', async () => {
      await tete.locator('.title').dblclick();
      await jusqua(() => dossier.locator('input.rename').count(), 'champ de nom');
      assert.equal(await champ.inputValue(), 'Travail');
      await shell.keyboard.type('Perso', { delay: 10 });
      await shell.keyboard.press('Enter');
      await jusqua(async () => (await tete.locator('.title').textContent()) === 'Perso', 'nom affiché');
      await ctx.sleep(200);
      assert.equal(await ouvert(), true);
      assert.deepEqual((await ctx.etat()).epingles.map((n) => [n.dossier, n.ouvert]), [['Perso', true]]);
    });

    await t.verifier('renommage du dossier : Échap annule', async () => {
      await tete.locator('.title').dblclick();
      await jusqua(() => dossier.locator('input.rename').count(), 'champ de nom');
      await shell.keyboard.type('Annulé', { delay: 10 });
      await shell.keyboard.press('Escape');
      await jusqua(async () => (await champ.count()) === 0, 'champ refermé');
      assert.equal(await tete.locator('.title').textContent(), 'Perso');
    });

    await ctx.capture('dossiers');
  },
};
