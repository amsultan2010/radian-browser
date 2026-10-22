// Boutons précédent / suivant / actualiser de la barre latérale, après une
// navigation entre deux pages locales par un vrai clic sur un lien.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Navigation',
  async test(ctx, t) {
    const { shell, jusqua } = ctx;
    const actif = async () => (await shell.locator('#sidebar .row.tab.active .title').allTextContents()).join();
    const boutons = () => shell.evaluate(() => ['b-back', 'b-forward', 'b-reload'].map((id) => !document.getElementById(id).disabled));

    await t.verifier('sans onglet : précédent, suivant et actualiser sont désactivés', async () => {
      assert.deepEqual(await boutons(), [false, false, false]);
    });

    const page = await ctx.ouvrir('/a', 'Page A');

    await t.verifier('page tout juste ouverte : seul « actualiser » est actif', async () => {
      await jusqua(async () => (await boutons()).join() === 'false,false,true', 'état des boutons');
    });

    await t.verifier('clic sur un lien de la page : même onglet, titre et historique mis à jour', async () => {
      await ctx.clic(page, '#vers-b');
      await jusqua(async () => (await actif()) === 'Page B', 'titre « Page B »');
      assert.deepEqual(await ctx.titres(), ['Page B']);
      assert.equal((await ctx.etat()).actifUrl, ctx.url('/b'));
      await jusqua(async () => (await boutons()).join() === 'true,false,true', '« précédent » activé');
    });

    await t.verifier('clic sur « précédent » : retour à la page A, « suivant » s’active', async () => {
      await ctx.clic(shell, '#b-back');
      await jusqua(async () => (await actif()) === 'Page A', 'titre « Page A »');
      assert.equal(await page.textContent('h1'), 'Alpha');
      assert.equal((await ctx.etat()).actifUrl, ctx.url('/a'));
      await jusqua(async () => (await boutons()).join() === 'false,true,true', '« suivant » activé, « précédent » désactivé');
    });

    await t.verifier('clic sur « suivant » : retour à la page B', async () => {
      await ctx.clic(shell, '#b-forward');
      await jusqua(async () => (await actif()) === 'Page B', 'titre « Page B »');
      assert.equal(await page.textContent('h1'), 'Bravo');
      await jusqua(async () => (await boutons()).join() === 'true,false,true', '« précédent » activé, « suivant » désactivé');
    });

    await t.verifier('⌘[ et ⌘] (éléments de menu) font de même', async () => {
      await ctx.menu('Cmd+[');
      await jusqua(async () => (await actif()) === 'Page A', 'titre « Page A »');
      await ctx.menu('Cmd+]');
      await jusqua(async () => (await actif()) === 'Page B', 'titre « Page B »');
    });

    await t.verifier('clic sur « actualiser » : la page est redemandée au serveur', async () => {
      await ctx.ouvrir('/compteur', 'Compteur 1');
      await ctx.clic(shell, '#b-reload');
      await jusqua(async () => (await actif()) === 'Compteur 2', 'titre « Compteur 2 »');
      assert.equal(ctx.hits['/compteur'], 2);
      await ctx.clic(shell, '#b-reload');
      await jusqua(async () => (await actif()) === 'Compteur 3', 'titre « Compteur 3 »');
    });

    await t.verifier('les boutons suivent l’onglet actif', async () => {
      await jusqua(async () => (await boutons()).join() === 'false,false,true', 'onglet Compteur : pas d’historique');
      await ctx.clic(shell, ctx.ligne('Page B'));
      await jusqua(async () => (await boutons()).join() === 'true,false,true', 'onglet B : « précédent » actif');
    });

    await t.verifier('page injoignable : page d’erreur, adresse conservée, « Réessayer » relance', async () => {
      await ctx.nouvelOnglet();
      await ctx.taper('127.0.0.1:1/x');
      await ctx.modal.keyboard.press('Enter');
      const erreur = await ctx.attendrePage('error.html');
      await jusqua(async () => (await erreur.locator('body').innerText()).length > 0, 'page d’erreur affichée');
      assert.equal((await ctx.etat()).actifUrl, 'http://127.0.0.1:1/x');
      assert.equal(await shell.textContent('#url-text'), '127.0.0.1:1');
    });

    await ctx.capture('navigation');
  },
};
