// Finitions de la barre latérale : sélecteur d'icône (dossier, onglet, Espace) à
// la souris et au clavier, dossier supprimé dont les onglets partent à l'archive,
// ⌘S sans onglet, « Gérer les Espaces », fenêtre vierge.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Finitions : icônes, dossier archivé, fenêtre vierge',
  async test(ctx, t) {
    const { shell, modal, jusqua } = ctx;
    const dossier = shell.locator('#pinned .folder').first();
    const tete = dossier.locator('> .row');
    const panneau = modal.locator('#icons');
    const choix = modal.locator('#icons .em-pick');
    const ouvert = () => modal.evaluate(() => !document.getElementById('icons').hidden);
    await ctx.principal(({ w }) => { w.popup = (tpl) => { w.menuVu = tpl; }; });
    const menuContextuel = async (loc, cle) => {
      await ctx.principal(({ w }) => { w.menuVu = null; });
      await ctx.clic(shell, loc, { button: 'right' });
      await jusqua(() => ctx.principal(({ w }) => !!w.menuVu), 'menu contextuel');
      await ctx.principal(({ w, store }, k) => w.menuVu.find((x) => x.label === store.t(k) && x.visible !== false).click(), cle);
    };
    const libelles = () => ctx.principal(({ w }) => w.menuVu.filter((x) => x.label && x.visible !== false).map((x) => x.label));

    await ctx.ouvrir('/a', 'Page A');
    await ctx.ouvrir('/b', 'Page B');
    await ctx.menu('tabs.newFolder');
    await jusqua(() => dossier.locator('input.rename').count(), 'champ de nom');
    await shell.keyboard.type('Lot', { delay: 10 });
    await shell.keyboard.press('Enter');
    await jusqua(async () => (await tete.locator('.title').textContent()) === 'Lot', 'dossier nommé');

    await t.verifier('clic droit sur un dossier → « Changer l’icône… » : le sélecteur s’ouvre à côté de la barre, le clavier dans la recherche', async () => {
      await menuContextuel(tete, 'tabs.changeIcon');
      await jusqua(ouvert, 'sélecteur affiché');
      await jusqua(async () => (await choix.count()) > 100, 'grille d’émojis');
      // Le panneau paraît en grandissant : sa place se lit une fois l'animation finie.
      const boite = (await ctx.centre(panneau)).box;
      const barre = await shell.locator('#sidebar').boundingBox();
      assert.ok(boite.x >= barre.x + barre.width, `le panneau ne recouvre pas la barre latérale : ${JSON.stringify([boite, barre])}`);
      assert.ok(boite.height <= 421 && Math.round(boite.width) === 316, JSON.stringify(boite));
      await ctx.capture('selecteur-icones', modal);
      assert.equal(await modal.evaluate(() => document.activeElement.id), 'icons-input');
      assert.equal(await modal.locator('#icons-tones .tone').count(), 6);
    });

    await t.avecFocus('verifier', 'le clavier natif va dans le champ de recherche du sélecteur', async () => {
      assert.equal((await ctx.etat()).focus, 'modale');
    });

    await t.verifier('taper « fus » filtre la grille ; un clic sur la fusée la pose sur le dossier et referme le sélecteur', async () => {
      await modal.keyboard.type('fus', { delay: 15 });
      await jusqua(async () => (await choix.allTextContents()).join('') === '🚀', 'une seule proposition');
      await ctx.clic(modal, choix.first());
      await jusqua(async () => !(await ouvert()), 'sélecteur refermé');
      await jusqua(async () => (await tete.locator('.ic .emoji').count()) === 1, 'émoji sur le dossier');
      assert.equal(await tete.locator('.ic .emoji').textContent(), '🚀');
      assert.equal(await tete.locator('.ic svg').count(), 0, 'le dessin du dossier a laissé la place');
      const ic = await tete.locator('.ic').boundingBox();
      const em = await tete.locator('.ic .emoji').boundingBox();
      assert.ok(em.x >= ic.x - 1 && em.x + em.width <= ic.x + ic.width + 1, 'l’émoji tient dans la case de l’icône');
    });

    await t.verifier('⌘Z rend au dossier son dessin, ⇧⌘Z remet l’émoji', async () => {
      await ctx.menu('Cmd+Z');
      await jusqua(async () => (await tete.locator('.ic svg').count()) === 1, 'dessin du dossier');
      await ctx.menu('Shift+Cmd+Z');
      await jusqua(async () => (await tete.locator('.ic .emoji').count()) === 1, 'émoji revenu');
    });

    await t.verifier('onglet : teinte de peau choisie à la souris, flèches et Entrée au clavier ; l’émoji remplace l’icône du site', async () => {
      await menuContextuel(ctx.ligne('Page A', '#today'), 'tabs.changeIcon');
      await jusqua(ouvert, 'sélecteur affiché');
      await ctx.clic(modal, modal.locator('#icons-tones .tone').nth(3));
      await jusqua(() => modal.evaluate(() => document.querySelector('#icons-tones .tone.sel').dataset.tone === '3'), 'teinte cochée');
      await modal.keyboard.type('pouce', { delay: 15 });
      await jusqua(async () => (await choix.allTextContents()).join(' ') === '👍🏽 👎🏽', 'pouces teintés');
      await modal.keyboard.press('ArrowDown');
      await modal.keyboard.press('ArrowRight');
      await jusqua(() => modal.evaluate(() => document.querySelector('.em-pick.at')?.textContent === '👎🏽'), 'second émoji désigné');
      await modal.keyboard.press('ArrowLeft');
      await modal.keyboard.press('Enter');
      await jusqua(async () => !(await ouvert()), 'sélecteur refermé');
      const ligne = ctx.ligne('Page A', '#today');
      await jusqua(async () => (await ligne.locator('.ic .emoji').count()) === 1, 'émoji sur la ligne');
      assert.equal(await ligne.locator('.ic .emoji').textContent(), '👍🏽');
      assert.equal(await ligne.locator('.ic img').count(), 0);
    });

    await t.verifier('le menu de l’onglet propose alors « Réinitialiser le nom et l’icône », qui rend l’icône du site', async () => {
      await menuContextuel(ctx.ligne('Page A', '#today'), 'tabs.resetNameIcon');
      assert.ok((await libelles()).includes(await ctx.texte('tabs.changeIcon')));
      await jusqua(async () => (await ctx.ligne('Page A', '#today').locator('.ic .emoji').count()) === 0, 'émoji retiré');
    });

    await t.verifier('Espace : « Changer l’icône de l’Espace… » ouvre le même sélecteur ; Échap le ferme sans rien changer, un clic à côté aussi', async () => {
      const avant = await shell.locator('#space-icon').textContent();
      await menuContextuel(shell.locator('#space-head'), 'spaces.changeIcon');
      await jusqua(ouvert, 'sélecteur affiché');
      assert.equal(await modal.locator('#icons-reset').isVisible(), false, 'un Espace garde toujours une icône');
      await modal.keyboard.press('Escape');
      await jusqua(async () => !(await ouvert()) && (await ctx.etat()).modale === null, 'fermé par Échap');
      await menuContextuel(shell.locator('#space-head'), 'spaces.changeIcon');
      await jusqua(ouvert, 'sélecteur rouvert');
      await ctx.clic(modal, '#backdrop', { position: { x: 900, y: 600 } });
      await jusqua(async () => (await ctx.etat()).modale === null, 'fermé par un clic à côté');
      assert.equal(await shell.locator('#space-icon').textContent(), avant);
      await menuContextuel(shell.locator('#space-head'), 'spaces.changeIcon');
      await jusqua(ouvert, 'sélecteur rouvert');
      await modal.keyboard.type('panda', { delay: 15 });
      await jusqua(async () => (await choix.count()) === 1, 'panda seul');
      await modal.keyboard.press('Enter');
      await jusqua(async () => (await shell.locator('#space-icon').textContent()) === '🐼', 'icône de l’Espace');
    });

    await t.verifier('supprimer un dossier garni : la question annonce l’archivage ; confirmé, ses onglets quittent la barre pour l’archive, un message le dit', async () => {
      await ctx.glisser(await ctx.centre(ctx.ligne('Page A', '#today')), () => ctx.centre(tete));
      await jusqua(async () => (await ctx.titres('#pinned .folder .children')).join() === 'Page A', 'A dans le dossier');
      await ctx.principal(({ electron }) => {
        global.__q = [];
        global.__boite = electron.dialog.showMessageBox;
        electron.dialog.showMessageBox = async (...a) => { global.__q.push(a[a.length - 1]); return { response: global.__q.length === 1 ? 1 : 0 }; };
      });
      await menuContextuel(tete, 'tabs.deleteFolder');
      await jusqua(() => ctx.principal(() => global.__q.length === 1), 'question posée');
      const q = await ctx.principal(() => ({ message: global.__q[0].message, detail: global.__q[0].detail }));
      assert.equal(q.message, 'Supprimer le dossier « Lot » ?');
      assert.equal(q.detail, await ctx.texte('tabs.deleteFolderDetail'));
      await ctx.sleep(150);
      assert.equal(await dossier.count(), 1, '« Annuler » laisse le dossier');
      await menuContextuel(tete, 'tabs.deleteFolder');
      await jusqua(async () => (await shell.locator('#pinned .folder').count()) === 0, 'dossier retiré');
      const e = await ctx.etat();
      assert.deepEqual(e.epingles, []);
      assert.equal(e.archive[0], ctx.url('/a'));
      assert.equal(e.aujourdhui.some((x) => x.url === ctx.url('/a')), false, 'l’onglet ne remonte pas dans la barre');
      const toast = await ctx.attendrePage('overlay.html#toast');
      await jusqua(async () => /Dossier supprimé, 1 onglet/.test(await toast.locator('#toast').textContent()), 'message affiché');
    });

    await t.verifier('⌘Z : le dossier revient avec son icône et son onglet, qui quitte l’archive', async () => {
      await ctx.menu('Cmd+Z');
      await jusqua(async () => (await ctx.titres('#pinned .folder .children')).join() === 'Page A', 'dossier rétabli');
      assert.equal(await tete.locator('.ic .emoji').textContent(), '🚀');
      assert.equal((await ctx.etat()).archive.includes(ctx.url('/a')), false);
      await ctx.principal(({ electron }) => { electron.dialog.showMessageBox = global.__boite; });
    });

    await t.verifier('« Gérer les Espaces… » (menu Espaces) ouvre la Bibliothèque sur ses Espaces', async () => {
      await ctx.menu('spaces.manage');
      const lib = await ctx.attendrePage('library.html');
      await jusqua(() => lib.evaluate(() => document.querySelector('.tabs [data-tab].on, .tabs [data-tab].active, .tabs [data-tab][aria-selected="true"]')?.dataset.tab === 'spaces' || location.hash === '#spaces'), 'section Espaces');
      await ctx.menu('Cmd+W');
    });

    await t.verifier('clic droit sur le dossier → « Transformer en Espace » : un Espace à son nom et à son icône s’affiche, avec ses onglets épinglés ; ⌘Z le refait dossier', async () => {
      await menuContextuel(tete, 'tabs.folderToSpace');
      await jusqua(async () => (await ctx.etat()).espace === 'Lot', 'Espace « Lot » affiché');
      await jusqua(async () => (await shell.locator('#spaces .sp').count()) === 2, 'deux pastilles d’Espace');
      await jusqua(() => shell.evaluate(() => !slide && !document.querySelector('#pager .ghost')), 'listes au repos'); // eslint-disable-line no-undef
      assert.equal(await shell.locator('#space-icon').textContent(), '🚀');
      assert.deepEqual(await ctx.titres('#pinned'), ['Page A']);
      assert.equal(await shell.locator('#pinned .folder').count(), 0);
      await ctx.menu('Cmd+Z');
      await jusqua(async () => (await ctx.etat()).espaces.length === 1, 'un seul Espace');
      await jusqua(async () => (await ctx.titres('#pinned .folder .children')).join() === 'Page A', 'dossier revenu avec son onglet');
      await jusqua(() => shell.evaluate(() => !slide && !document.querySelector('#pager .ghost')), 'listes au repos'); // eslint-disable-line no-undef
      assert.equal(await tete.locator('.ic .emoji').textContent(), '🚀');
    });

    await t.verifier('favori : pastille de notification lue dans le titre de la page ; « Modifier l’adresse épinglée… » ouvre la barre d’adresse sur l’adresse du favori', async () => {
      const page = await ctx.ouvrir('/c', 'Page C');
      await menuContextuel(ctx.ligne('Page C', '#today'), 'tabs.addFavorite');
      const tuile = shell.locator('#fav .tile').first();
      await jusqua(() => tuile.count(), 'tuile du favori');
      await page.evaluate(() => { document.title = '(3) Page C'; });
      const pastille = tuile.locator('.count');
      await jusqua(async () => (await pastille.isVisible()) && (await pastille.textContent()) === '3', 'pastille « 3 »');
      const t0 = await tuile.boundingBox();
      const p0 = await pastille.boundingBox();
      assert.ok(p0.x + p0.width <= t0.x + t0.width && p0.y >= t0.y && p0.x > t0.x + t0.width / 2, 'pastille dans le coin haut droit de la tuile : ' + JSON.stringify([t0, p0]));
      await page.evaluate(() => { document.title = 'Page C'; });
      await jusqua(async () => !(await pastille.isVisible()), 'pastille retirée');
      await menuContextuel(tuile, 'tabs.editPinned');
      await jusqua(ctx.commandeOuverte, 'barre d’adresse ouverte');
      await jusqua(async () => (await modal.inputValue('#cmd-input')) === ctx.url('/c'), 'adresse du favori dans le champ, sélectionnée');
      await modal.keyboard.type(ctx.hote + '/d', { delay: 12 });
      await modal.keyboard.press('Enter');
      await jusqua(async () => (await ctx.etat()).favoris[0].url === ctx.url('/d'), 'le favori affiche la nouvelle page');
      assert.equal(await ctx.principal(({ w }) => w.data.tabs[w.favorites[0]].homeUrl), ctx.url('/d'), 'la nouvelle adresse est celle du favori');
      await menuContextuel(tuile, 'tabs.removeFavorite');
      await jusqua(async () => (await ctx.etat()).favoris.length === 0, 'favori retiré');
      await ctx.menu('Cmd+W');
      await jusqua(async () => !(await ctx.etat()).aujourdhui.some((x) => x.url === ctx.url('/d')), 'onglet refermé');
    });

    await t.verifier('⌘S sans aucun onglet : la barre latérale reste (comme dans Arc) ; avec un onglet, elle se masque', async () => {
      await ctx.clic(shell, ctx.ligne('Page B', '#today'));
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/b'), 'B actif');
      await ctx.menu('Cmd+W');
      await jusqua(async () => (await ctx.etat()).actif === null || (await ctx.etat()).actifUrl !== ctx.url('/b'), 'B fermé');
      // L'onglet du dossier se ferme sans partir : plus aucune page affichée.
      await ctx.principal(({ w }) => { for (const id of w.visibleIds()) w.close(id); });
      await jusqua(() => shell.evaluate(() => document.body.classList.contains('no-tab')), 'aucun onglet');
      await ctx.menu('Cmd+S');
      await ctx.sleep(250);
      assert.equal((await ctx.etat()).lateraleVisible, true);
      assert.equal(await shell.evaluate(() => document.body.classList.contains('docked')), true);
      await ctx.clic(shell, ctx.ligne('Page A', '#pinned'));
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/a'), 'A actif');
      await ctx.menu('Cmd+S');
      await jusqua(async () => (await ctx.etat()).lateraleVisible === false, 'barre masquée');
      await ctx.menu('Cmd+S');
      await jusqua(async () => (await ctx.etat()).lateraleVisible === true, 'barre revenue');
    });

    await t.verifier('⌥⌘F : « Rechercher et remplacer » — recherche tapée, ⇥, texte de remplacement, Entrée : le mot du champ de saisie est remplacé', async () => {
      const page = await ctx.ouvrir('/saisie', 'Page Saisie');
      await page.locator('#champ').click();
      await page.keyboard.type('un chat, deux chats', { delay: 10 });
      await ctx.menu('Alt+Cmd+F');
      const barre = await ctx.attendrePage('overlay.html#find');
      await jusqua(() => barre.locator('#find-with').isVisible(), 'ligne « Remplacer par »');
      const o = await ctx.origine(barre);
      assert.equal(o.height, 90);
      const b1 = await barre.locator('#find-input').boundingBox();
      const b2 = await barre.locator('#find-with').boundingBox();
      const bouton = await barre.locator('#find-all').boundingBox();
      assert.ok(b2.y >= b1.y + b1.height && b2.y + b2.height <= o.height && bouton.x + bouton.width <= o.width, 'la seconde ligne tient dans la barre : ' + JSON.stringify([b1, b2, bouton, o]));
      await barre.keyboard.type('chat', { delay: 15 });
      await jusqua(async () => (await barre.textContent('#find-count')) === '1/2', 'deux occurrences');
      await barre.keyboard.press('Tab');
      await jusqua(() => barre.evaluate(() => document.activeElement.id === 'find-with'), 'clavier dans « Remplacer par »');
      await barre.keyboard.type('loup', { delay: 15 });
      await barre.keyboard.press('Enter');
      await jusqua(async () => (await page.inputValue('#champ')) === 'un loup, deux chats', 'première occurrence remplacée');
      await jusqua(async () => (await barre.textContent('#find-count')) === '1/1', 'une occurrence restante');
      await ctx.clic(barre, '#find-all');
      await jusqua(async () => (await page.inputValue('#champ')) === 'un loup, deux loups', 'tout remplacé');
      assert.equal(await barre.evaluate(() => document.activeElement.id), 'find-with', 'le bouton n’a pas pris le clavier');
      await barre.keyboard.press('Escape');
      await jusqua(async () => (await ctx.etat()).recherche === false, 'barre refermée');
    });

    await t.verifier('⌃⌘N (élément de menu) : une fenêtre vierge s’ouvre, hors des Espaces, sur la barre de commande', async () => {
      const avant = ctx.pages().filter((p) => p.url().endsWith('shell.html')).length;
      await ctx.menu('Ctrl+Cmd+N');
      await jusqua(() => ctx.pages().filter((p) => p.url().endsWith('shell.html')).length === avant + 1, 'seconde coque');
      const coque = ctx.pages().filter((p) => p.url().endsWith('shell.html')).find((p) => p !== shell);
      await jusqua(() => coque.evaluate(() => typeof S === 'object' && !!S && S.blank === true), 'coque de la fenêtre vierge');
      assert.equal(await coque.locator('#space-name').textContent(), 'Fenêtre vierge');
      assert.equal(await coque.locator('#spaces .sp').count(), 0, 'aucune pastille d’Espace');
      assert.equal(await coque.locator('#sidebar .row.tab').count(), 0, 'aucun onglet des Espaces');
      const r = await ctx.principal(({ win, store }) => {
        const b = win.OrbeWindow.all.find((x) => x.blank);
        return { a: !!b, donnees: b.data !== store.state, commande: b.modalMode, persistante: b.persistent, session: b.session === win.OrbeWindow.all.find((x) => x.shared).session };
      });
      assert.deepEqual(r, { a: true, donnees: true, commande: 'command', persistante: false, session: true });
      await ctx.principal(({ win }) => win.OrbeWindow.all.find((x) => x.blank).win.close());
      await jusqua(() => ctx.principal(({ win }) => !win.OrbeWindow.all.some((x) => x.blank)), 'fenêtre vierge refermée');
    });
  },
};
