// Sélection multiple dans la barre latérale : ⌘clic, ⇧clic, Échap, menu de la
// sélection, glisser tout le lot, Suppr et ⌘W.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Sélection multiple',
  async test(ctx, t) {
    const { shell, jusqua } = ctx;
    const CMD = process.platform === 'darwin' ? 'Meta' : 'Control';
    const today = () => ctx.titres('#today');
    const epingles = async () => (await ctx.etat()).epingles.map((n) => (n.dossier ? `[${n.dossier}: ${n.enfants.map((x) => x.title).join(', ')}]` : n.title));
    const selection = () => shell.locator('#sidebar .sel').evaluateAll((els) => els.map((el) => (el.querySelector('.title') ? el.querySelector('.title').textContent : el.title)));
    const actif = async () => (await shell.locator('#sidebar .row.tab.active .title').allTextContents()).join();
    const ligne = (titre, zone = '#today') => ctx.ligne(titre, zone);
    const clic = (titre, zone) => ctx.clic(shell, ligne(titre, zone));
    const cmdClic = (titre, zone) => ctx.clic(shell, ligne(titre, zone), { modifiers: [CMD] });
    const majClic = (titre, zone) => ctx.clic(shell, ligne(titre, zone), { modifiers: ['Shift'] });
    const attendreSelection = (attendu) => jusqua(async () => (await selection()).join() === attendu.join(), 'sélection ' + attendu.join(', '));
    // Sélectionne exactement ces lignes : clic sur la première, ⌘clic sur les autres.
    const choisir = async (premiere, ...autres) => {
      await ctx.clic(shell, premiere);
      for (const l of autres) await ctx.clic(shell, l, { modifiers: [CMD] });
      await jusqua(async () => (await selection()).length === autres.length + 1, 'lignes sélectionnées');
    };

    // Le menu contextuel est natif : on en retient le contenu au lieu de l'afficher,
    // puis on actionne un élément par son libellé, comme le ferait un clic.
    await ctx.principal(({ w }) => { w.popup = (tpl) => { w.menuVu = tpl; }; });
    const menuDe = async (loc) => {
      await ctx.principal(({ w }) => { w.menuVu = null; });
      await ctx.clic(shell, loc, { button: 'right' });
      return jusqua(() => ctx.principal(({ w }) => w.menuVu && w.menuVu.filter((x) => x.label && x.visible !== false).map((x) => x.label)), 'menu contextuel');
    };
    const actionner = (cle, vars) => ctx.principal(({ w, store }, a) => {
      const label = store.t(a.cle, null, a.vars);
      const it = w.menuVu.find((x) => x.label === label);
      if (!it || it.enabled === false) throw new Error('élément de menu absent : ' + label);
      it.click();
    }, { cle, vars });
    const libelle = (cle, vars) => ctx.principal(({ store }, a) => store.t(a.cle, null, a.vars), { cle, vars });

    for (const c of ['saisie', 'a', 'b', 'c', 'd', 'e']) await ctx.ouvrir('/' + c, 'Page ' + c.charAt(0).toUpperCase() + c.slice(1));
    assert.deepEqual(await today(), ['Page E', 'Page D', 'Page C', 'Page B', 'Page A', 'Page Saisie']);

    await t.verifier('⌘clic : la ligne rejoint la sélection, qui part de l’onglet affiché ; rien n’est activé', async () => {
      await cmdClic('Page C');
      await attendreSelection(['Page E', 'Page C']);
      assert.equal(await actif(), 'Page E');
      assert.equal((await ctx.etat()).actifUrl, ctx.url('/e'));
      await jusqua(async () => (await ctx.principal(({ w }) => w.selected().length)) === 2, 'le processus principal connaît la sélection');
    });

    await t.verifier('⌘clic sur une ligne sélectionnée la retire', async () => {
      await cmdClic('Page C');
      await attendreSelection(['Page E']);
      await cmdClic('Page E');
      await attendreSelection([]);
      assert.equal(await actif(), 'Page E');
    });

    await t.verifier('⇧clic : plage entre l’onglet affiché et la ligne cliquée, dans l’ordre visible', async () => {
      await clic('Page D');
      await jusqua(async () => (await actif()) === 'Page D', 'D actif');
      await majClic('Page A');
      await attendreSelection(['Page D', 'Page C', 'Page B', 'Page A']);
      assert.equal(await actif(), 'Page D', 'le ⇧clic n’active rien');
      // La plage repart du même point de départ, dans l'autre sens.
      await majClic('Page E');
      await attendreSelection(['Page E', 'Page D']);
    });

    await t.verifier('les lignes sélectionnées ont un surlignage distinct de la ligne active', async () => {
      await majClic('Page B');
      await attendreSelection(['Page D', 'Page C', 'Page B']);
      const style = (titre) => ligne(titre).evaluate((el) => { const s = getComputedStyle(el); return { fond: s.backgroundColor, ombre: s.boxShadow }; });
      const choisie = await style('Page C');
      const autre = await style('Page A');
      await shell.keyboard.press('Escape');
      await attendreSelection([]);
      const active = await style('Page D');
      assert.notEqual(choisie.fond, autre.fond, 'une ligne sélectionnée se distingue d’une ligne ordinaire');
      assert.notEqual(choisie.fond, active.fond, 'et de la ligne active');
      assert.match(choisie.ombre, /inset/, 'liseré autour de la ligne sélectionnée');
      assert.doesNotMatch(active.ombre, /inset/);
    });

    await t.verifier('Échap vide la sélection sans changer d’onglet', async () => {
      await cmdClic('Page B');
      await attendreSelection(['Page D', 'Page B']);
      await ctx.capture('selection');
      await shell.keyboard.press('Escape');
      await attendreSelection([]);
      assert.equal(await actif(), 'Page D');
      await jusqua(async () => (await ctx.principal(({ w }) => w.selected().length)) === 0, 'sélection vide côté principal');
    });

    await t.verifier('un clic simple vide la sélection et active la ligne', async () => {
      await majClic('Page B');
      await attendreSelection(['Page D', 'Page C', 'Page B']);
      await clic('Page A');
      await attendreSelection([]);
      await jusqua(async () => (await actif()) === 'Page A', 'A actif');
    });

    await t.verifier('glisser une ligne sélectionnée emporte toute la sélection (pastille du nombre, dépôt dans l’ordre)', async () => {
      await choisir(ligne('Page D'), ligne('Page B'));
      await shell.evaluate(() => {
        window.__pastille = null;
        new MutationObserver((ms) => {
          for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('drag-ghost')) window.__pastille = n.querySelector('.count').textContent;
        }).observe(document.body, { childList: true });
      });
      let enRoute = null;
      const geste = await ctx.glisser(await ctx.centre(ligne('Page B')), async () => {
        enRoute = await shell.evaluate(() => [...document.querySelectorAll('#today .dragging-self .title')].map((el) => el.textContent));
        return ctx.centre(ligne('Page E'), 0.5, 0.2);
      });
      await jusqua(async () => (await today()).join() === 'Page D,Page B,Page E,Page C,Page A,Page Saisie', 'D et B en tête, dans leur ordre — geste : ' + JSON.stringify({ ...geste, enRoute }));
      assert.deepEqual(enRoute, ['Page D', 'Page B'], 'les deux lignes sont emportées');
      assert.equal(await shell.evaluate(() => window.__pastille), '2', 'pastille « 2 » sur l’image du glisser');
      await attendreSelection([]);
    });

    await t.verifier('glisser la sélection vers les épinglés', async () => {
      await choisir(ligne('Page E'), ligne('Page C'));
      await ctx.glisser(await ctx.centre(ligne('Page C')), () => ctx.centre(shell.locator('#pinned'), 0.5, 0.5));
      await jusqua(async () => (await ctx.titres('#pinned')).join() === 'Page E,Page C', 'E et C épinglés');
      assert.deepEqual(await today(), ['Page D', 'Page B', 'Page A', 'Page Saisie']);
    });

    await t.verifier('glisser une ligne hors sélection : seule cette ligne part, la sélection tombe', async () => {
      await choisir(ligne('Page D'), ligne('Page B'));
      await ctx.glisser(await ctx.centre(ligne('Page Saisie')), () => ctx.centre(ligne('Page D'), 0.5, 0.2));
      await jusqua(async () => (await today()).join() === 'Page Saisie,Page D,Page B,Page A', 'Saisie seule en tête');
      await attendreSelection([]);
    });

    await t.verifier('Suppr, le clavier dans la barre latérale : la sélection est archivée', async () => {
      await choisir(ligne('Page A'), ligne('Page Saisie'));
      await shell.keyboard.press('Delete');
      await jusqua(async () => (await today()).join() === 'Page D,Page B', 'A et Saisie archivés');
      const e = await ctx.etat();
      assert.ok(e.archive.includes(ctx.url('/a')) && e.archive.includes(ctx.url('/saisie')));
      await attendreSelection([]);
    });

    await t.verifier('clic droit sur la sélection : menu de la sélection ; « Copier les liens », un par ligne', async () => {
      await choisir(ligne('Page D'), ligne('Page B'));
      const vu = await menuDe(ligne('Page B'));
      const attendu = [];
      for (const [cle, vars] of [['tabs.copyLinks'], ['tabs.duplicate'], ['tabs.pinMany', { n: 2 }], ['tabs.addFavorite'], ['tabs.folderFromSelection'], ['tabs.closeMany', { n: 2 }]]) attendu.push(await libelle(cle, vars));
      assert.deepEqual(vu, attendu);
      assert.equal(attendu[2], 'Épingler les 2 onglets');
      const avant = await ctx.principal(({ electron }) => electron.clipboard.readText());
      await actionner('tabs.copyLinks');
      const copie = await jusqua(async () => { const x = await ctx.principal(({ electron }) => electron.clipboard.readText()); return x !== avant && x; }, 'presse-papiers');
      await ctx.principal(({ electron }, x) => electron.clipboard.writeText(x), avant);
      assert.equal(copie, ctx.url('/d') + '\n' + ctx.url('/b'));
      assert.deepEqual(await selection(), ['Page D', 'Page B'], 'copier ne défait pas la sélection');
    });

    await t.verifier('clic droit hors de la sélection : elle tombe, le menu est celui de la ligne', async () => {
      const vu = await menuDe(ligne('Page E', '#pinned'));
      assert.equal(vu[0], await libelle('tabs.copyLink'));
      await attendreSelection([]);
    });

    await t.verifier('menu de la sélection : « Épingler les 2 onglets »', async () => {
      await choisir(ligne('Page D'), ligne('Page B'));
      await menuDe(ligne('Page D'));
      await actionner('tabs.pinMany', { n: 2 });
      await jusqua(async () => (await ctx.titres('#pinned')).join() === 'Page E,Page C,Page D,Page B', 'quatre épinglés');
      assert.deepEqual(await today(), []);
      await attendreSelection([]);
    });

    await t.verifier('menu de la sélection : « Nouveau dossier avec la sélection », puis saisie du nom', async () => {
      await ctx.clic(shell, ligne('Page E', '#pinned'));
      await ctx.clic(shell, ligne('Page C', '#pinned'), { modifiers: ['Shift'] });
      await attendreSelection(['Page E', 'Page C']);
      await menuDe(ligne('Page C', '#pinned'));
      await actionner('tabs.folderFromSelection');
      await jusqua(() => shell.locator('#pinned .folder input.rename').count(), 'champ de nom du dossier');
      await shell.keyboard.type('Lot', { delay: 10 });
      await shell.keyboard.press('Enter');
      await jusqua(async () => (await epingles()).join() === '[Lot: Page E, Page C],Page D,Page B', 'dossier créé à la place du premier onglet');
    });

    await t.verifier('menu de la sélection : « Dupliquer » puis « Ajouter aux favoris »', async () => {
      await choisir(ligne('Page D', '#pinned'), ligne('Page B', '#pinned'));
      await menuDe(ligne('Page B', '#pinned'));
      await actionner('tabs.duplicate');
      await jusqua(async () => (await today()).join() === 'Page D,Page B', 'deux copies en tête d’Aujourd’hui');
      assert.equal(await actif(), 'Page D', 'l’onglet affiché ne change pas');
      await choisir(ligne('Page D'), ligne('Page B'));
      await menuDe(ligne('Page B'));
      await actionner('tabs.addFavorite');
      await jusqua(async () => (await shell.locator('#fav .tile').count()) === 2, 'deux tuiles de favoris');
      assert.deepEqual(await today(), []);
      assert.deepEqual((await ctx.etat()).favoris.map((x) => x.url), [ctx.url('/d'), ctx.url('/b')]);
    });

    await t.verifier('les tuiles de favoris se sélectionnent aussi (⌘clic)', async () => {
      await ctx.clic(shell, shell.locator('#fav .tile').first());
      await ctx.clic(shell, shell.locator('#fav .tile').nth(1), { modifiers: [CMD] });
      await jusqua(async () => (await shell.locator('#fav .tile.sel').count()) === 2, 'deux tuiles sélectionnées');
      await shell.keyboard.press('Escape');
      await jusqua(async () => (await shell.locator('#sidebar .sel').count()) === 0, 'sélection vidée');
    });

    await ctx.ouvrir('/a', 'Page A');
    await ctx.ouvrir('/c', 'Page C');

    await t.verifier('⌘W (élément de menu) archive toute la sélection', async () => {
      await cmdClic('Page A');
      await attendreSelection(['Page C', 'Page A']);
      await ctx.menu('Cmd+W');
      await jusqua(async () => (await today()).length === 0, 'les deux onglets archivés');
      const e = await ctx.etat();
      assert.equal(e.archive[0], ctx.url('/c'));
      assert.equal(e.archive[1], ctx.url('/a'));
      assert.equal(e.epingles.length, 3, 'les épinglés ne bougent pas');
    });

    await ctx.capture('selection-fin');
  },
};
