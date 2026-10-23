// Petite fenêtre (⌥⌘N) : Arc's command window first, then the window itself: adresse, copie du lien,
// coach mark, « Ouvrir dans… » avec la recherche d'Espace — à la souris et au clavier.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Petite fenêtre',
  async test(ctx, t) {
    const { jusqua } = ctx;
    const petites = () => ctx.principal(({ req }) => req('little.js').LittleWindow.all.map((l) => ({ url: l.url, titre: l.title, menu: !!l.menu, barreDevant: l.win.contentView.children[l.win.contentView.children.length - 1] === l.ui })));
    await ctx.principal(({ w, store, win }) => { w.data.spaces.push(store.makeSpace('Projets', '📁', '#0ea5e9')); win.OrbeWindow.pushAll(); });
    await jusqua(() => ctx.shell.evaluate(() => document.querySelectorAll('#spaces [data-space]').length === 2), 'second Espace dans la barre');
    let barre = null;

    await t.verifier('⌥⌘N opens Little Radian’s command window; an address typed then Enter opens it in a Little Radian window', async () => {
      await ctx.menu('Alt+Cmd+N');
      const commande = await ctx.attendrePage('overlay.html#little');
      await jusqua(() => commande.evaluate(() => document.activeElement === document.getElementById('cmd-input')), 'command field ready');
      assert.deepEqual(await petites(), [], 'no Little Radian window yet');
      await commande.keyboard.type(ctx.hote + '/c', { delay: 8 });
      await commande.keyboard.press('Enter');
      await jusqua(async () => { const p = await petites(); return p.length === 1 && p[0].titre === 'Page C'; }, 'page chargée dans la petite fenêtre');
      await jusqua(() => !ctx.page('overlay.html#little'), 'command window closed');
      barre = await jusqua(() => ctx.pages().find((p) => p.url().endsWith('/little.html')), 'barre de la petite fenêtre');
      barre.setDefaultTimeout(6000);
      assert.equal(await barre.locator('#u').inputValue(), ctx.hote, 'la barre montre le site');
      assert.deepEqual(await ctx.titres(), [], 'aucun onglet dans la fenêtre principale');
    });

    await t.verifier('première petite fenêtre : ouverte sans à-coup (opaque, à sa place), Arc’s coach mark over the page that « × » closes, the page does not move', async () => {
      const etat = () => ctx.principal(({ req, win }) => { const l = req('little.js').LittleWindow.all[0]; return { ouverture: !!l.opening, opacite: l.win.getOpacity(), bandeau: l.hint, y: win.boundsOf(l.view).y, dessus: !!l.float && l.float.getVisible() }; });
      await jusqua(async () => { const e = await etat(); return !e.ouverture && e.opacite === 1; }, 'ouverture terminée');
      const dessus = await ctx.attendrePage('little.html#float');
      await jusqua(() => dessus.locator('#coach').isVisible(), 'coach mark');
      const texte = await ctx.principal(({ store }) => store.t('little.coachBody'));
      assert.ok((await dessus.locator('#coach').textContent()).includes(texte));
      assert.equal((await etat()).y, 47, 'la page reste sous la barre de 47 pt');
      await dessus.locator('#coach-close').click();
      await jusqua(async () => { const e = await etat(); return !e.bandeau && !e.dessus; }, 'coach mark closed');
      assert.equal((await etat()).y, 47);
    });

    await t.verifier('bouton de copie du lien', async () => {
      await barre.locator('#copy').click();
      // (Le presse-papiers d'Electron se lit de façon asynchrone.)
      await jusqua(() => ctx.principal(async ({ electron }, u) => (await electron.clipboard.readText()) === u, ctx.url('/c')), 'lien dans le presse-papiers');
      await jusqua(() => barre.locator('#copy').evaluate((b) => !b.classList.contains('done')), 'le bouton reprend son aspect');
    });

    await t.verifier('« ▾ » : le menu des Espaces s’ouvre par-dessus la page ; la recherche le réduit ; Échap le referme', async () => {
      await barre.locator('#open-in').click();
      await jusqua(async () => (await barre.locator('#space-list button').count()) === 2, 'deux Espaces proposés');
      assert.equal((await petites())[0].barreDevant, true, 'la barre est passée devant la page');
      await barre.keyboard.type('proj', { delay: 8 });
      await jusqua(async () => (await barre.locator('#space-list button').allTextContents()).join() === '📁Projets', 'un seul Espace retenu');
      await barre.keyboard.press('Escape');
      await jusqua(async () => { const p = (await petites())[0]; return !p.menu && !p.barreDevant; }, 'menu refermé, page devant');
      assert.equal(await barre.locator('#spaces').isVisible(), false);
    });

    await t.verifier('choisir un Espace : la page y devient un onglet, la petite fenêtre se ferme', async () => {
      await barre.locator('#open-in').click();
      await jusqua(async () => (await barre.locator('#space-list button').count()) === 2, 'menu rouvert');
      await barre.locator('#space-list button', { hasText: 'Projets' }).click();
      await jusqua(async () => (await petites()).length === 0, 'petite fenêtre fermée');
      await jusqua(async () => (await ctx.etat()).espace === 'Projets' && (await ctx.titres()).join() === 'Page C', 'onglet ouvert dans l’Espace choisi');
    });
  },
};
