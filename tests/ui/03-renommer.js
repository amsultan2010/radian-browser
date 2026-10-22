// Renommage sur place : double-clic sur un onglet épinglé ou sur le nom de
// l'Espace, saisie, Entrée pour valider, Échap pour annuler.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Renommage sur place',
  async test(ctx, t) {
    const { shell, jusqua } = ctx;
    const champ = shell.locator('input.rename');
    const epingle = () => shell.locator('#pinned .row.tab').first();

    await ctx.ouvrir('/saisie', 'Page Saisie');
    await ctx.ouvrir('/a', 'Page A');

    await t.verifier('⌘D (élément de menu) épingle l’onglet actif', async () => {
      await ctx.menu('Cmd+D');
      await jusqua(async () => (await ctx.titres('#pinned')).join() === 'Page A', 'ligne épinglée');
      assert.deepEqual(await ctx.titres('#today'), ['Page Saisie']);
    });

    await t.verifier('double-clic sur le titre d’un onglet épinglé : champ de saisie prérempli et sélectionné', async () => {
      await epingle().locator('.title').dblclick();
      await jusqua(() => champ.count(), 'champ de renommage');
      assert.equal(await champ.inputValue(), 'Page A');
      const sel = await champ.evaluate((i) => [i.selectionStart, i.selectionEnd, document.activeElement === i]);
      assert.deepEqual(sel, [0, 6, true]);
      const b = await champ.boundingBox();
      const l = await epingle().boundingBox();
      assert.ok(b.x >= l.x && b.x + b.width <= l.x + l.width && b.y >= l.y && b.y + b.height <= l.y + l.height, 'le champ tient dans la ligne');
    });

    await t.avecFocus('bogue', 'après le double-clic, le clavier natif reste dans la barre latérale (champ de renommage)', async () => {
      assert.equal((await ctx.etat()).focus, 'coque', 'le clavier est parti dans la page de l’onglet');
    });

    await t.verifier('taper un nom puis Entrée : la ligne est renommée', async () => {
      await shell.keyboard.type('Mon onglet', { delay: 10 });
      assert.equal(await champ.inputValue(), 'Mon onglet');
      await shell.keyboard.press('Enter');
      await jusqua(async () => (await champ.count()) === 0, 'champ refermé');
      await jusqua(async () => (await ctx.titres('#pinned')).join() === 'Mon onglet', 'nouveau titre');
      assert.equal((await ctx.etat()).epingles[0].title, 'Mon onglet');
    });

    await t.verifier('Échap annule : le titre ne change pas', async () => {
      await epingle().locator('.title').dblclick();
      await jusqua(() => champ.count(), 'champ de renommage');
      await shell.keyboard.type('Brouillon', { delay: 10 });
      await shell.keyboard.press('Escape');
      await jusqua(async () => (await champ.count()) === 0, 'champ refermé');
      await ctx.sleep(150);
      assert.deepEqual(await ctx.titres('#pinned'), ['Mon onglet']);
      assert.equal((await ctx.etat()).epingles[0].title, 'Mon onglet');
    });

    await t.verifier('clic ailleurs pendant la saisie : le nom est validé', async () => {
      await epingle().locator('.title').dblclick();
      await jusqua(() => champ.count(), 'champ de renommage');
      await shell.keyboard.type('Validé au clic', { delay: 10 });
      await ctx.clic(shell, '#blank');
      await jusqua(async () => (await ctx.titres('#pinned')).join() === 'Validé au clic', 'nouveau titre');
      assert.equal(await champ.count(), 0);
    });

    await t.verifier('nom vidé puis Entrée : le titre de la page revient', async () => {
      await epingle().locator('.title').dblclick();
      await jusqua(() => champ.count(), 'champ de renommage');
      await shell.keyboard.press('Backspace');
      assert.equal(await champ.inputValue(), '');
      await shell.keyboard.press('Enter');
      await jusqua(async () => (await ctx.titres('#pinned')).join() === 'Page A', 'titre de la page');
    });

    await t.verifier('double-clic sur un onglet d’Aujourd’hui : il se renomme aussi (comme dans Arc), Échap annule', async () => {
      const titre = await shell.locator('#today .row.tab .title').first().textContent();
      await shell.locator('#today .row.tab .title').first().dblclick();
      await jusqua(() => shell.locator('#today input.rename').count(), 'champ de renommage');
      assert.equal(await shell.locator('#today input.rename').inputValue(), titre);
      await shell.keyboard.press('Escape');
      await jusqua(async () => (await shell.locator('input.rename').count()) === 0, 'champ refermé');
      assert.equal(await shell.locator('#today .row.tab .title').first().textContent(), titre);
    });

    await t.verifier('double-clic sur le nom de l’Espace : champ de saisie, Entrée valide', async () => {
      assert.equal(await shell.textContent('#space-name'), 'Personnel');
      await shell.locator('#space-name').dblclick();
      await jusqua(() => champ.count(), 'champ de renommage');
      assert.equal(await champ.inputValue(), 'Personnel');
      await shell.keyboard.type('Boulot', { delay: 10 });
      await shell.keyboard.press('Enter');
      await jusqua(async () => (await shell.textContent('#space-name')) === 'Boulot', 'nom de l’Espace');
      assert.equal((await ctx.etat()).espace, 'Boulot');
      assert.equal(await champ.count(), 0);
    });

    await t.verifier('nom de l’Espace : Échap annule', async () => {
      await shell.locator('#space-name').dblclick();
      await jusqua(() => champ.count(), 'champ de renommage');
      await shell.keyboard.type('Autre', { delay: 10 });
      await shell.keyboard.press('Escape');
      await jusqua(async () => (await champ.count()) === 0, 'champ refermé');
      assert.equal(await shell.textContent('#space-name'), 'Boulot');
      assert.equal((await ctx.etat()).espace, 'Boulot');
    });

    await t.verifier('« Renommer l’Espace… » (menu) ouvre le champ sur le nom de l’Espace', async () => {
      await ctx.menu('spaces.rename');
      await jusqua(() => shell.locator('#space-name input.rename').count(), 'champ de renommage');
      assert.equal(await champ.inputValue(), 'Boulot');
    });

    await t.avecFocus('verifier', '« Renommer l’Espace… » depuis le menu, un onglet étant actif : le clavier natif va dans le champ', async () => {
      assert.equal((await ctx.etat()).focus, 'coque', 'le clavier est resté dans la page de l’onglet');
    });

    await shell.keyboard.press('Escape');
    await ctx.capture('renommage');
  },
};
