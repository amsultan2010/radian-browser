// ⌘Z et ⇧⌘Z dans la barre latérale : chaque geste (glisser, ×, renommer,
// « Effacer », dossier, Espace, aperçu) se défait et se refait, et le menu
// Édition nomme l'action concernée.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Annuler et rétablir (barre latérale)',
  async test(ctx, t) {
    const { shell, jusqua, app } = ctx;
    const CMD = process.platform === 'darwin' ? 'Meta' : 'Control';
    const today = () => ctx.titres('#today');
    const epingles = async () => (await ctx.etat()).epingles.map((n) => (n.dossier ? `[${n.dossier}: ${n.enfants.map((x) => x.title).join(', ')}]` : n.title));
    const ligne = (titre, zone = '#today') => ctx.ligne(titre, zone);
    const glisser = async (source, cible, fx = 0.5, fy = 0.5) => ctx.glisser(await ctx.centre(source), () => ctx.centre(cible, fx, fy));
    const attendre = (attendu, quoi = today) => jusqua(async () => (await quoi()).join() === attendu.join(), attendu.join(', ') || '(vide)');
    // Libellé de l'élément du menu Édition qui porte ce raccourci.
    const libelleMenu = (accel) => app.evaluate(({ Menu }, a) => {
      const find = (m) => { for (const it of m.items) { if (it.accelerator === a) return it; const f = it.submenu && find(it.submenu); if (f) return f; } return null; };
      return find(Menu.getApplicationMenu()).label;
    }, accel);
    const menuDit = (accel, texte) => jusqua(async () => (await libelleMenu(accel)) === texte, `menu « ${texte} »`);
    const annuler = () => ctx.menu('Cmd+Z');
    const retablir = () => ctx.menu('Shift+Cmd+Z');
    // Menus contextuels (natifs) : contenu retenu, élément actionné par son libellé.
    await ctx.principal(({ w }) => { w.popup = (tpl) => { w.menuVu = tpl; }; });
    const menuContextuel = async (loc, cle) => {
      await ctx.principal(({ w }) => { w.menuVu = null; });
      await ctx.clic(shell, loc, { button: 'right' });
      await jusqua(() => ctx.principal(({ w }) => !!w.menuVu), 'menu contextuel');
      await ctx.principal(({ w, store }, k) => w.menuVu.find((x) => x.label === store.t(k)).click(), cle);
    };

    for (const c of ['a', 'b', 'c', 'd', 'e']) await ctx.ouvrir('/' + c, 'Page ' + c.toUpperCase());
    const depart = ['Page E', 'Page D', 'Page C', 'Page B', 'Page A'];
    assert.deepEqual(await today(), depart);

    await t.verifier('sans action à défaire, le menu dit simplement « Annuler » et « Rétablir »', async () => {
      await menuDit('Cmd+Z', 'Annuler');
      await menuDit('Shift+Cmd+Z', 'Rétablir');
    });

    await t.verifier('glisser un onglet puis ⌘Z : il retrouve son rang ; ⇧⌘Z le redéplace', async () => {
      await glisser(ligne('Page A'), ligne('Page E'), 0.5, 0.2);
      await attendre(['Page A', 'Page E', 'Page D', 'Page C', 'Page B']);
      await menuDit('Cmd+Z', 'Annuler Déplacer l’onglet');
      await annuler();
      await attendre(depart);
      await menuDit('Cmd+Z', 'Annuler');
      await menuDit('Shift+Cmd+Z', 'Rétablir Déplacer l’onglet');
      await retablir();
      await attendre(['Page A', 'Page E', 'Page D', 'Page C', 'Page B']);
      await annuler();
      await attendre(depart);
    });

    await t.verifier('× sur un onglet puis ⌘Z : il revient à sa place, sorti de l’archive', async () => {
      const l = ligne('Page C');
      await ctx.clic(shell, l.locator('.act.x'), { survol: l });
      await attendre(['Page E', 'Page D', 'Page B', 'Page A']);
      await menuDit('Cmd+Z', 'Annuler Archiver l’onglet');
      await annuler();
      await attendre(depart);
      const e = await ctx.etat();
      assert.ok(!e.archive.includes(ctx.url('/c')));
      assert.equal(e.actifUrl, ctx.url('/c'), 'l’onglet rouvert est affiché');
      await ctx.attendreOnglet('/c');
    });

    await t.verifier('glisser vers les épinglés puis ⌘Z : retour dans Aujourd’hui, au même rang', async () => {
      await glisser(ligne('Page D'), shell.locator('#pinned'), 0.5, 0.5);
      await attendre(['Page D'], () => ctx.titres('#pinned'));
      await annuler();
      await attendre(depart);
      assert.deepEqual(await ctx.titres('#pinned'), []);
      await retablir();
      await attendre(['Page D'], () => ctx.titres('#pinned'));
      await attendre(['Page E', 'Page C', 'Page B', 'Page A']);
    });

    await t.verifier('renommer un onglet épinglé puis ⌘Z : l’ancien titre revient', async () => {
      await ligne('Page D', '#pinned').locator('.title').dblclick();
      await jusqua(() => shell.locator('input.rename').count(), 'champ de renommage');
      await shell.keyboard.type('Dédé', { delay: 10 });
      await shell.keyboard.press('Enter');
      await attendre(['Dédé'], () => ctx.titres('#pinned'));
      await menuDit('Cmd+Z', 'Annuler Renommer l’onglet');
      await annuler();
      await attendre(['Page D'], () => ctx.titres('#pinned'));
      await retablir();
      await attendre(['Dédé'], () => ctx.titres('#pinned'));
      await annuler();
      await attendre(['Page D'], () => ctx.titres('#pinned'));
    });

    await t.avecFocus('verifier', 'pendant une saisie dans la barre latérale, ⌘Z reste l’annulation du texte', async () => {
      await ligne('Page D', '#pinned').locator('.title').dblclick();
      await jusqua(() => shell.locator('input.rename').count(), 'champ de renommage');
      await shell.keyboard.type('xyz', { delay: 10 });
      await annuler();
      await ctx.sleep(300);
      assert.deepEqual(await ctx.titres('#today'), ['Page E', 'Page C', 'Page B', 'Page A'], 'la barre latérale n’a pas bougé');
      assert.equal(await shell.locator('input.rename').count(), 1);
      await shell.keyboard.press('Escape');
    });

    await t.verifier('« Effacer » puis ⌘Z : tous les onglets reviennent, dans l’ordre', async () => {
      await ctx.clic(shell, ligne('Page C'));
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/c'), 'C affiché');
      await ligne('Page B').hover();
      await ctx.clic(shell, '#b-clear');
      await attendre(['Page C']);
      await menuDit('Cmd+Z', 'Annuler Effacer Aujourd’hui');
      await annuler();
      await attendre(['Page E', 'Page C', 'Page B', 'Page A']);
      assert.equal((await ctx.etat()).actifUrl, ctx.url('/c'), 'l’onglet affiché ne change pas');
      assert.equal((await ctx.etat()).archive.length, 0);
    });

    await t.verifier('sélection archivée (Suppr) puis ⌘Z : le lot revient d’un coup', async () => {
      await ctx.clic(shell, ligne('Page E'));
      await ctx.clic(shell, ligne('Page B'), { modifiers: [CMD] });
      await jusqua(async () => (await shell.locator('#today .sel').count()) === 2, 'deux lignes sélectionnées');
      await shell.keyboard.press('Delete');
      await attendre(['Page C', 'Page A']);
      await menuDit('Cmd+Z', 'Annuler Archiver les onglets');
      await annuler();
      await attendre(['Page E', 'Page C', 'Page B', 'Page A']);
    });

    await t.verifier('dossier créé, rempli puis supprimé : ⌘Z remonte chaque étape', async () => {
      await ctx.menu('tabs.newFolder');
      await jusqua(() => shell.locator('#pinned .folder input.rename').count(), 'champ de nom du dossier');
      await shell.keyboard.type('Lot', { delay: 10 });
      await shell.keyboard.press('Enter');
      await attendre(['Page D', '[Lot: ]'], epingles);
      await glisser(ligne('Page A'), shell.locator('#pinned .folder > .row'), 0.5, 0.5);
      await attendre(['Page D', '[Lot: Page A]'], epingles);
      // Comme dans Arc : la suppression est confirmée, et l'onglet du dossier part à l'archive.
      await ctx.principal(({ electron }) => { global.__boiteDossier = electron.dialog.showMessageBox; electron.dialog.showMessageBox = async () => ({ response: 0 }); });
      await menuContextuel(shell.locator('#pinned .folder > .row'), 'tabs.deleteFolder');
      await attendre(['Page D'], epingles);
      assert.equal((await ctx.etat()).archive[0], ctx.url('/a'));
      await ctx.principal(({ electron }) => { electron.dialog.showMessageBox = global.__boiteDossier; });
      await menuDit('Cmd+Z', 'Annuler Supprimer le dossier');
      await annuler();
      await attendre(['Page D', '[Lot: Page A]'], epingles);
      await menuDit('Cmd+Z', 'Annuler Déplacer l’onglet');
      await annuler();
      await attendre(['Page D', '[Lot: ]'], epingles);
      await attendre(['Page E', 'Page C', 'Page B', 'Page A']);
      await menuDit('Cmd+Z', 'Annuler Renommer le dossier');
      await annuler();
      await menuDit('Cmd+Z', 'Annuler Nouveau dossier');
      await annuler();
      await attendre(['Page D'], epingles);
      await retablir();
      await retablir();
      await retablir();
      await attendre(['Page D', '[Lot: Page A]'], epingles);
      await retablir();
      await attendre(['Page D'], epingles);
      assert.equal((await ctx.etat()).archive[0], ctx.url('/a'), 'rétablir la suppression archive de nouveau l’onglet, sans reposer la question');
    });

    await t.verifier('aperçu fermé par son bouton puis ⌘Z : il se rouvre', async () => {
      await ctx.clic(shell, ligne('Page C'));
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/c'), 'C affiché');
      await ctx.principal(({ w }, u) => { w.openPeek(u, w.activeId); }, ctx.url('/b') + '?apercu');
      const habillage = await ctx.attendrePage('overlay.html#peek');
      await jusqua(() => ctx.pages().some((p) => p.url() === ctx.url('/b') + '?apercu'), 'aperçu chargé');
      await jusqua(() => habillage.locator('#peek-close').isVisible(), 'bouton de fermeture');
      await habillage.locator('#peek-close').click();
      await jusqua(() => ctx.principal(({ w }) => !w.peekState), 'aperçu fermé');
      await menuDit('Cmd+Z', 'Annuler Fermer l’aperçu');
      await annuler();
      await jusqua(() => ctx.principal(({ w }) => !!w.peekState && w.peekState.url), 'aperçu rouvert');
      await jusqua(() => ctx.pages().some((p) => p.url() === ctx.url('/b') + '?apercu'), 'page de l’aperçu rechargée');
      await retablir();
      await jusqua(() => ctx.principal(({ w }) => !w.peekState), 'aperçu refermé');
      assert.equal((await ctx.etat()).actifUrl, ctx.url('/c'));
    });

    await t.verifier('Espace supprimé puis ⌘Z : il revient avec ses onglets et son thème', async () => {
      await ctx.principal(({ w }) => w.newSpace());
      await jusqua(() => shell.locator('#space-head input.rename').count(), 'nom du nouvel Espace');
      await shell.keyboard.type('Projets', { delay: 10 });
      await shell.keyboard.press('Enter');
      await jusqua(async () => (await shell.textContent('#space-name')) === 'Projets', 'Espace nommé');
      await ctx.principal(({ w }) => w.setTheme({ color: '#10b981', icon: '🚀' }));
      await ctx.ouvrir('/e', 'Page E');
      await ctx.ouvrir('/a', 'Page A');
      await ctx.menu('Cmd+D');
      await attendre(['Page A'], () => ctx.titres('#pinned'));
      // La confirmation est une boîte de dialogue native : acceptée d'office.
      await ctx.principal(({ electron }) => { electron.dialog.showMessageBox = async () => ({ response: 0 }); });
      await ctx.menu('spaces.delete');
      await jusqua(async () => (await ctx.etat()).espaces.length === 1, 'Espace supprimé');
      await jusqua(async () => (await shell.textContent('#space-name')) !== 'Projets', 'retour au premier Espace');
      assert.ok((await ctx.etat()).archive.includes(ctx.url('/e')), 'ses onglets du jour sont archivés');
      await menuDit('Cmd+Z', 'Annuler Supprimer l’Espace');
      await annuler();
      await jusqua(async () => (await shell.textContent('#space-name')) === 'Projets', 'Espace rétabli et affiché');
      await attendre(['Page E']);
      await attendre(['Page A'], () => ctx.titres('#pinned'));
      const e = await ctx.etat();
      assert.equal(e.espaces.length, 2);
      assert.equal(e.espaces[1].nom, 'Projets');
      assert.ok(!e.archive.includes(ctx.url('/e')));
      assert.equal(await shell.locator('#spaces .sp').count(), 2);
      assert.equal(await shell.textContent('#space-icon'), '🚀');
      assert.equal(await shell.evaluate(() => document.body.style.getPropertyValue('--accent')), '#10b981');
      // Ses pages avaient été fermées : un clic recharge l'onglet.
      await ctx.clic(shell, ligne('Page E'));
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/e'), 'E affiché');
      await ctx.attendreOnglet('/e');
    });

    await ctx.capture('annuler');
  },
};
