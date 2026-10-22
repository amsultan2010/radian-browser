// Recherche dans la page : ouverture, saisie, compteur, suivant/précédent,
// fermeture.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Recherche dans la page',
  async test(ctx, t) {
    const { shell, jusqua } = ctx;
    let barre = null;
    const compte = () => barre.textContent('#find-count');
    const attendre = (texte) => jusqua(async () => (await compte()) === texte, 'compteur « ' + texte + ' »');

    await t.verifier('sans onglet, ⌘F ne fait rien', async () => {
      await ctx.menu('Cmd+F');
      await ctx.sleep(300);
      assert.equal((await ctx.etat()).recherche, false);
    });

    await ctx.ouvrir('/a', 'Page A');

    await t.verifier('⌘F (élément de menu) : la barre de recherche apparaît en haut à droite de la page', async () => {
      await ctx.menu('Cmd+F');
      barre = await ctx.attendrePage('overlay.html#find');
      await jusqua(() => barre.locator('#find').isVisible(), 'panneau de recherche visible');
      const e = await ctx.etat();
      assert.equal(e.recherche, true);
      const b = await ctx.origine(barre);
      assert.ok(b.x >= e.vuePage.x && b.x + b.width <= e.vuePage.x + e.vuePage.width, 'dans la largeur de la page');
      assert.ok(b.x + b.width > e.vuePage.x + e.vuePage.width - 40, 'calée à droite');
      assert.ok(b.y >= e.vuePage.y && b.y < e.vuePage.y + 40, 'en haut de la page');
      assert.equal(await ctx.vueAu(b.x + 20, b.y + 20), barre.url(), 'au-dessus de la page');
      assert.equal(await barre.evaluate(() => document.activeElement.id), 'find-input');
      assert.equal(await barre.getAttribute('#find-input', 'placeholder'), 'Rechercher dans la page');
      assert.equal(await compte(), '');
    });

    await t.avecFocus('verifier', 'le clavier natif est dans la barre de recherche', async () => {
      assert.equal((await ctx.etat()).focus, 'recherche');
    });

    await t.verifier('saisie au clavier : le compteur indique 1/3', async () => {
      await barre.keyboard.type('orbe', { delay: 25 });
      await attendre('1/3');
      assert.equal(await barre.inputValue('#find-input'), 'orbe');
    });

    await t.verifier('Entrée passe au résultat suivant, et revient au premier après le dernier', async () => {
      await barre.keyboard.press('Enter');
      await attendre('2/3');
      await barre.keyboard.press('Enter');
      await attendre('3/3');
      await barre.keyboard.press('Enter');
      await attendre('1/3');
    });

    await t.verifier('⇧Entrée revient au résultat précédent', async () => {
      await barre.keyboard.press('Shift+Enter');
      await attendre('3/3');
      await barre.keyboard.press('Shift+Enter');
      await attendre('2/3');
    });

    await t.verifier('boutons ↓ et ↑ de la barre', async () => {
      await ctx.clic(barre, '#find-next');
      await attendre('3/3');
      await ctx.clic(barre, '#find-prev');
      await attendre('2/3');
    });

    await t.verifier('⌘G et ⇧⌘G (éléments de menu)', async () => {
      await ctx.menu('Cmd+G');
      await attendre('3/3');
      await ctx.menu('Shift+Cmd+G');
      await attendre('2/3');
    });

    await ctx.capture('recherche', barre);

    await t.verifier('après un clic sur ↓ ou ↑, le clavier reste dans le champ de recherche', async () => {
      await ctx.clic(barre, '#find-next');
      await attendre('3/3');
      assert.equal(await barre.evaluate(() => document.activeElement.id), 'find-input', 'le bouton cliqué a pris le focus : la frappe suivante est perdue');
    });

    // Retour dans le champ, comme le ferait quelqu'un : clic en fin de texte.
    const champ = await barre.locator('#find-input').boundingBox();
    await ctx.clic(barre, '#find-input', { position: { x: champ.width - 4, y: champ.height / 2 } });

    await t.verifier('texte introuvable : « Aucun résultat »', async () => {
      await barre.keyboard.type('zzz', { delay: 25 });
      await attendre('Aucun résultat');
    });

    await t.verifier('champ vidé : le compteur s’efface', async () => {
      for (let i = 0; i < 7; i++) await barre.keyboard.press('Backspace');
      assert.equal(await barre.inputValue('#find-input'), '');
      await attendre('');
    });

    await t.verifier('la recherche ignore la casse', async () => {
      await barre.keyboard.type('ALPHA', { delay: 25 });
      await attendre('1/1');
    });

    await t.verifier('Échap ferme la barre de recherche', async () => {
      await barre.keyboard.press('Escape');
      await jusqua(async () => !(await ctx.etat()).recherche, 'recherche fermée');
      const b = await ctx.origine(barre);
      const e = await ctx.etat();
      assert.equal(await ctx.vueAu(b.x + 20, b.y + 20), ctx.url('/a'), 'la page est de nouveau au premier plan');
      assert.equal(e.modale, null);
    });

    await t.avecFocus('verifier', 'après Échap, le clavier natif revient dans la page', async () => {
      assert.match(String((await ctx.etat()).focus), /^onglet:/);
    });

    await t.verifier('réouverture : le dernier texte est repris, sélectionné, et relancé', async () => {
      await ctx.menu('Cmd+F');
      await jusqua(async () => (await ctx.etat()).recherche, 'recherche ouverte');
      assert.equal(await barre.inputValue('#find-input'), 'ALPHA');
      const sel = await barre.evaluate(() => { const i = document.getElementById('find-input'); return [i.selectionStart, i.selectionEnd]; });
      assert.deepEqual(sel, [0, 5]);
      await attendre('1/1');
      await barre.keyboard.type('orbe', { delay: 25 });
      await attendre('1/3');
    });

    await t.verifier('clic sur × : la barre se ferme', async () => {
      await ctx.clic(barre, '#find-close');
      await jusqua(async () => !(await ctx.etat()).recherche, 'recherche fermée');
    });

    await t.verifier('changer d’onglet ferme la recherche', async () => {
      await ctx.ouvrir('/b', 'Page B');
      await ctx.menu('Cmd+F');
      await jusqua(async () => (await ctx.etat()).recherche, 'recherche ouverte');
      await ctx.clic(shell, ctx.ligne('Page A'));
      await jusqua(async () => !(await ctx.etat()).recherche, 'recherche fermée');
      assert.equal((await ctx.etat()).actifUrl, ctx.url('/a'));
    });
  },
};
