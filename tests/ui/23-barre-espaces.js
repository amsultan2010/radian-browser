// Barre latérale, gestes sur les Espaces et les lignes : réordonner les
// Espaces en glissant leur pastille, déposer un onglet sur une pastille,
// ⌥glisser pour dupliquer, boutons 3 et 4 de la souris, invitation des favoris,
// menu d'un dossier, ⌃W dans la bascule ⌃Tab.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Barre latérale : Espaces, copies, dossiers',
  async test(ctx, t) {
    const { shell, jusqua } = ctx;
    const today = () => ctx.titres('#today');
    const espaces = async () => (await ctx.etat()).espaces.map((s) => s.nom);
    const pastille = (n) => shell.locator('#spaces .sp').nth(n);
    const ordre = () => shell.locator('#spaces .sp').evaluateAll((els) => els.map((el) => el.title));
    const repos = () => jusqua(() => shell.evaluate(() => !slide && !document.querySelector('#pager .ghost')), 'listes au repos'); // eslint-disable-line no-undef
    const nouvelEspace = async (nom) => {
      await ctx.menu('spaces.new');
      await ctx.creerEspace(nom);
      await jusqua(async () => (await ctx.etat()).espace === nom, 'Espace ' + nom);
      await repos();
    };
    const aller = async (n, nom) => {
      await ctx.clic(shell, pastille(n));
      await jusqua(async () => (await ctx.etat()).espace === nom, 'Espace ' + nom);
      await repos();
    };
    await ctx.principal(({ w }) => { w.popup = (tpl) => { w.menuVu = tpl; }; });

    for (const c of ['a', 'b', 'c']) await ctx.ouvrir('/' + c, 'Page ' + c.toUpperCase());
    await nouvelEspace('Deux');
    await nouvelEspace('Trois');

    await t.verifier('un nouvel Espace se place juste après celui d’où on le crée', async () => {
      assert.deepEqual(await espaces(), ['Personnel', 'Deux', 'Trois']);
      await aller(0, 'Personnel');
      await nouvelEspace('Entre');
      assert.deepEqual(await espaces(), ['Personnel', 'Entre', 'Deux', 'Trois']);
      assert.deepEqual(await ordre(), ['Personnel', 'Entre', 'Deux', 'Trois']);
    });

    await t.verifier('glisser la pastille d’un Espace : un trait montre son nouveau rang, il y tombe', async () => {
      const r = await ctx.glisser(await ctx.centre(pastille(3)), () => ctx.centre(pastille(0), 0.1, 0.5));
      assert.equal(r.ligne, true, 'trait de dépôt affiché');
      await jusqua(async () => (await espaces()).join() === 'Trois,Personnel,Entre,Deux', 'Trois en tête');
      assert.deepEqual(await ordre(), ['Trois', 'Personnel', 'Entre', 'Deux']);
      assert.equal((await ctx.etat()).espace, 'Entre', 'l’Espace affiché ne change pas');
      assert.equal(await shell.evaluate(() => document.querySelectorAll('.dragging-self').length + (getComputedStyle(document.getElementById('drop-line')).display === 'none' ? 0 : 1)), 0);
    });

    await t.verifier('⌘Z remet les Espaces dans leur ordre', async () => {
      await ctx.menu('Cmd+Z');
      await jusqua(async () => (await espaces()).join() === 'Personnel,Entre,Deux,Trois', 'ordre d’origine');
      await jusqua(async () => (await ordre()).join() === 'Personnel,Entre,Deux,Trois', 'pastilles à jour');
    });

    await t.verifier('glisser une pastille vers la fin de la rangée', async () => {
      await ctx.glisser(await ctx.centre(pastille(0)), () => ctx.centre(pastille(3), 0.95, 0.5));
      await jusqua(async () => (await espaces()).join() === 'Entre,Deux,Trois,Personnel', 'Personnel en dernier');
      await ctx.menu('Cmd+Z');
      await jusqua(async () => (await espaces()).join() === 'Personnel,Entre,Deux,Trois', 'ordre d’origine');
    });

    await t.verifier('boutons 4 et 3 de la souris sur la barre : Espace suivant, Espace précédent', async () => {
      const cdp = await shell.context().newCDPSession(shell);
      const c = await ctx.centre(shell.locator('#blank'));
      const bouton = async (button, buttons) => {
        for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: c.x, y: c.y, button, buttons: type === 'mousePressed' ? buttons : 0, clickCount: 1 });
      };
      assert.equal((await ctx.etat()).espace, 'Entre');
      await bouton('forward', 16);
      await jusqua(async () => (await ctx.etat()).espace === 'Deux', 'Espace suivant');
      await repos();
      await bouton('back', 8);
      await jusqua(async () => (await ctx.etat()).espace === 'Entre', 'Espace précédent');
      await repos();
      await cdp.detach().catch(() => {});
    });

    await aller(0, 'Personnel');

    await t.verifier('glisser un onglet sur la pastille d’un autre Espace : il y part', async () => {
      let visee = false;
      await ctx.glisser(await ctx.centre(ctx.ligne('Page A', '#today')), () => ctx.centre(pastille(2)), {
        avantLacher: async () => { visee = await pastille(2).evaluate((el) => el.classList.contains('drop-into')); },
      });
      assert.equal(visee, true, 'la pastille visée est mise en évidence');
      await jusqua(async () => (await today()).join() === 'Page C,Page B', 'A partie');
      assert.equal((await ctx.etat()).espace, 'Personnel');
      await aller(2, 'Deux');
      assert.deepEqual(await today(), ['Page A']);
      await aller(0, 'Personnel');
    });

    await t.verifier('⌘Z ramène l’onglet dans son Espace', async () => {
      await ctx.menu('Cmd+Z');
      await jusqua(async () => (await today()).join() === 'Page C,Page B,Page A', 'A revenue');
    });

    await t.verifier('favoris vides pendant un glisser : « Glisse un onglet ici… »', async () => {
      let texte = '';
      await ctx.glisser(await ctx.centre(ctx.ligne('Page B', '#today')), () => ctx.centre(ctx.ligne('Page B', '#today')), {
        avantLacher: async () => { texte = await shell.evaluate(() => getComputedStyle(document.getElementById('fav'), '::before').content); },
      });
      assert.ok(texte.includes(await ctx.texte('side.favHint')), texte);
      assert.deepEqual(await today(), ['Page C', 'Page B', 'Page A']);
    });

    await t.verifier('⌥glisser un onglet : une copie tombe à l’endroit visé, l’original reste', async () => {
      await shell.keyboard.down('Alt');
      try {
        await ctx.glisser(await ctx.centre(ctx.ligne('Page A', '#today')), () => ctx.centre(ctx.ligne('Page C', '#today'), 0.5, 0.15));
      } finally {
        await shell.keyboard.up('Alt');
      }
      await jusqua(async () => (await today()).join() === 'Page A,Page C,Page B,Page A', 'copie de A en tête');
      const e = await ctx.etat();
      assert.notEqual(e.aujourdhui[0].id, e.aujourdhui[3].id);
      assert.equal(e.aujourdhui[0].url, ctx.url('/a'));
      await jusqua(() => shell.evaluate(() => !document.body.classList.contains('dragging') && !document.querySelector('.dragging-self')), 'glisser terminé');
    });

    await t.verifier('sans ⌥, le même geste déplace', async () => {
      await ctx.glisser(await ctx.centre(shell.locator('#today .row.tab').nth(3)), () => ctx.centre(shell.locator('#today .row.tab').nth(1), 0.5, 0.15));
      await jusqua(async () => (await today()).join() === 'Page A,Page A,Page C,Page B', 'A déplacée');
      assert.equal((await ctx.etat()).aujourdhui.length, 4);
    });

    // --- Menu d'un dossier ---------------------------------------------------------
    await t.verifier('clic droit sur un dossier : dupliquer, copier tous les liens, sous-dossier, coller l’adresse, replier', async () => {
      await ctx.menu('tabs.newFolder');
      await jusqua(() => shell.locator('#pinned .folder input.rename').count(), 'nom du dossier');
      await shell.keyboard.type('Travail', { delay: 10 });
      await shell.keyboard.press('Enter');
      const tete = shell.locator('#pinned .folder > .row').first();
      await jusqua(async () => (await tete.locator('.title').textContent()) === 'Travail', 'dossier nommé');
      await ctx.principal(({ w }) => { w.menuVu = null; });
      await ctx.clic(shell, tete, { button: 'right' });
      const vu = await jusqua(() => ctx.principal(({ w }) => w.menuVu && w.menuVu.filter((x) => x.label).map((x) => x.label)), 'menu du dossier');
      const attendu = await Promise.all(['tabs.renameFolder', 'tabs.changeIcon', 'tabs.duplicateFolder', 'tabs.copyAllLinks', 'tabs.copyAllLinksMarkdown', 'tabs.newNestedFolder', 'tabs.pasteUrlTab', 'tabs.closeFolder', 'tabs.folderToSpace', 'tabs.deleteFolder'].map((k) => ctx.texte(k)));
      assert.deepEqual(vu, attendu);
    });

    await t.verifier('« Nouveau sous-dossier » : il paraît dans le dossier, prêt à être nommé', async () => {
      await ctx.principal(({ w, store }) => w.menuVu.find((x) => x.label === store.t('tabs.newNestedFolder')).click());
      await jusqua(() => shell.locator('#pinned .folder .folder input.rename').count(), 'nom du sous-dossier');
      await shell.keyboard.type('Dedans', { delay: 10 });
      await shell.keyboard.press('Enter');
      await jusqua(async () => JSON.stringify((await ctx.etat()).epingles) === JSON.stringify([{ dossier: 'Travail', ouvert: true, enfants: [{ dossier: 'Dedans', ouvert: true, enfants: [] }] }]), 'sous-dossier créé');
    });

    // --- Bascule ⌃Tab ---------------------------------------------------------------
    await t.verifier('bascule ⌃Tab : ⌃ maintenu + W archive l’onglet désigné, relâcher ⌃ affiche le suivant', async () => {
      await ctx.clic(shell, ctx.ligne('Page B', '#today'));
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/b'), 'B affichée');
      await ctx.clic(shell, ctx.ligne('Page C', '#today'));
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/c'), 'C affichée');
      // Frappes injectées par le navigateur lui-même : elles suivent le chemin
      // d'une vraie touche (avant la page), ce que celles de Playwright ne font pas.
      const touche = (type, keyCode, modifiers = []) => ctx.principal(({ w, win }, k) => {
        const cible = w.modalMode ? w.modal.webContents : w.activeRt.wc;
        cible.sendInputEvent({ type: k.type, keyCode: k.keyCode, modifiers: k.modifiers });
      }, { type, keyCode, modifiers });
      await touche('keyDown', 'Tab', ['control']);
      await jusqua(async () => (await ctx.etat()).modale === 'switcher', 'bascule ouverte');
      const designe = await ctx.principal(({ w }) => w.data.tabs[w.switcher.ids[w.switcher.index]].url);
      assert.equal(designe, ctx.url('/b'), 'la bascule désigne l’onglet précédent');
      await touche('keyDown', 'W', ['control']);
      await jusqua(async () => !(await today()).includes('Page B'), 'B archivée');
      assert.equal((await ctx.etat()).modale, 'switcher', 'la bascule reste ouverte');
      assert.ok((await ctx.etat()).archive.includes(ctx.url('/b')));
      // Le relâchement de ⌃ est vu par la vue de la bascule, qui a le clavier.
      await ctx.modal.keyboard.down('Control');
      await ctx.modal.keyboard.up('Control');
      await jusqua(async () => (await ctx.etat()).modale === null, 'bascule refermée');
      const e = await ctx.etat();
      assert.notEqual(e.actifUrl, ctx.url('/b'));
      assert.ok(e.actif);
    });

    await ctx.capture('barre-espaces');
  },
};
