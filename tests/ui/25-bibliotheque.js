// Bibliothèque : sections, dernière section rouverte, archive (périodes,
// filtres, croix, restauration dans l'Espace d'origine, vidage confirmé),
// Espaces, Boosts, fichiers (menu « ··· », clic droit, glisser hors d'Orbe).
// Les gestes du système (menu natif, corbeille, glisser réel, boîte de
// dialogue) sont remplacés par des témoins dans le processus principal : la
// souris et le clavier, eux, sont vrais.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

module.exports = {
  nom: 'Bibliothèque',
  async test(ctx, t) {
    const { shell, jusqua } = ctx;
    const mac = process.platform === 'darwin';

    await ctx.ouvrir('/a', 'Page A');
    await ctx.ouvrir('/b', 'Page B');
    await ctx.menu('Cmd+W');
    await jusqua(async () => (await ctx.etat()).archive.includes(ctx.url('/b')), 'page B archivée');
    await ctx.ouvrir('/c', 'Page C');
    await ctx.menu('Cmd+W');
    await jusqua(async () => (await ctx.etat()).archive.includes(ctx.url('/c')), 'page C archivée');
    // Un second Espace, avec un onglet archivé qui en vient, vieux de deux mois.
    const autre = await ctx.principal(({ w, store }, url) => {
      const sp = store.makeSpace('Voyages', '🧳', '#f97316');
      w.data.spaces.push(sp);
      const d = new Date();
      store.state.archive.push({ id: 'vieux', url, title: 'Vieille page', favicon: '', spaceId: sp.id, by: 'auto', at: new Date(d.getFullYear(), d.getMonth() - 2, 15, 12).getTime() });
      w.changed();
      return sp.id;
    }, ctx.url('/d'));

    await ctx.menu('Shift+Cmd+L');
    const lib = await ctx.attendrePage('library.html');
    lib.setDefaultTimeout(6000);
    const onglet = (nom) => lib.locator(`.tabs [data-tab="${nom}"]`);
    const lignes = () => lib.locator('#list .line');
    const noms = () => lib.locator('#list .line .name').allTextContents();
    const ligne = (nom) => lignes().filter({ has: lib.locator('.name', { hasText: new RegExp('^' + nom + '$') }) }).first();

    await t.verifier('⇧⌘L ouvre la Bibliothèque : sept sections, l’historique d’abord', async () => {
      await jusqua(async () => (await lignes().count()) >= 3, 'historique affiché');
      assert.deepEqual(await lib.locator('.tabs [data-tab]').allTextContents(), ['Historique', 'Archive', 'Téléchargements', 'Médias', 'Tableaux', 'Espaces', 'Boosts']);
      assert.equal(await lib.locator('.tabs [data-tab].on').textContent(), 'Historique');
      assert.equal(await lib.locator('#filters').isVisible(), false);
      const barre = await lib.locator('.tabs').boundingBox();
      const vue = await lib.evaluate(() => innerWidth);
      assert.ok(barre.x >= 0 && barre.x + barre.width <= vue, 'les onglets tiennent dans la page');
    });

    await t.verifier('section Archive : lignes groupées par période, étiquettes d’Espace et de cause, filtres', async () => {
      await onglet('archive').click();
      await jusqua(async () => (await lignes().count()) === 3, 'trois onglets archivés');
      assert.deepEqual(await noms(), ['Page C', 'Page B', 'Vieille page']);
      const titres = await lib.locator('#list h2').allTextContents();
      assert.equal(titres.length, 2);
      assert.equal(titres[0], 'Aujourd’hui');
      assert.notEqual(titres[1], 'Aujourd’hui');
      assert.deepEqual(await ligne('Vieille page').locator('.tag').allTextContents(), ['🧳 Voyages', 'archivé d’office']);
      assert.equal(await lib.locator('#filters').isVisible(), true);
      assert.deepEqual(await lib.locator('#f-how option').allTextContents(), ['Toutes les fermetures', 'Fermés à la main', 'Archivés d’office', 'Petite fenêtre']);
    });

    await t.verifier('filtre « Archivés d’office », puis par Espace : la liste se réduit ; sans résultat, message ordinaire', async () => {
      await lib.selectOption('#f-how', 'auto');
      await jusqua(async () => (await noms()).join() === 'Vieille page', 'archivés d’office seuls');
      await lib.selectOption('#f-how', 'little');
      await jusqua(async () => (await lib.locator('#list .empty').count()) === 1, 'aucun résultat');
      assert.equal((await lib.locator('#list .empty').textContent()).trim(), 'Rien ici pour l’instant.');
      await lib.selectOption('#f-how', '');
      await lib.selectOption('#f-space', autre);
      await jusqua(async () => (await noms()).join() === 'Vieille page', 'onglets de l’Espace « Voyages »');
      await lib.selectOption('#f-space', '');
      await jusqua(async () => (await lignes().count()) === 3, 'liste entière');
    });

    await t.verifier('recherche dans l’archive, au clavier', async () => {
      await lib.locator('#q').click();
      await lib.keyboard.type('vieille', { delay: 15 });
      await jusqua(async () => (await noms()).join() === 'Vieille page', 'recherche');
      for (let i = 0; i < 7; i++) await lib.keyboard.press('Backspace');
      await jusqua(async () => (await lignes().count()) === 3, 'liste entière');
    });

    await t.verifier('survol d’une ligne : la croix apparaît ; un clic retire l’entrée sans rouvrir la page', async () => {
      const croix = ligne('Page C').locator('[data-do=delete]');
      assert.equal(await croix.evaluate((b) => getComputedStyle(b).opacity), '0');
      await jusqua(async () => { await ligne('Page C').hover(); await ctx.sleep(40); return (await croix.evaluate((b) => getComputedStyle(b).opacity)) === '1'; }, 'croix au survol');
      const avant = (await ctx.etat()).aujourdhui.length;
      await croix.click();
      await jusqua(async () => (await noms()).join() === 'Page B,Vieille page', 'entrée retirée');
      const e = await ctx.etat();
      assert.ok(!e.archive.includes(ctx.url('/c')));
      assert.equal(e.aujourdhui.length, avant);
    });

    await t.verifier('clic sur un onglet archivé venu d’un autre Espace : il y retourne, l’Espace s’affiche, l’entrée quitte l’archive', async () => {
      await ligne('Vieille page').locator('.name').click();
      await jusqua(async () => (await ctx.etat()).espace === 'Voyages', 'Espace d’origine affiché');
      const e = await jusqua(async () => { const x = await ctx.etat(); return x.actifUrl === ctx.url('/d') ? x : null; }, 'page rouverte et active');
      assert.equal(e.aujourdhui.length, 1);
      assert.ok(!e.archive.includes(ctx.url('/d')));
      await jusqua(async () => (await shell.locator('#today .row.tab.active .title').allTextContents())[0] === 'Page D', 'ligne « Page D » dans la barre latérale');
      await ctx.principal(({ w }) => w.switchSpace(w.data.spaces[0].id));
      await jusqua(async () => (await ctx.etat()).espace !== 'Voyages', 'retour au premier Espace');
    });

    await t.verifier('la Bibliothèque se rouvre sur la dernière section affichée', async () => {
      await jusqua(async () => (await ctx.principal(({ store }) => store.state.window.librarySection)) === 'archive', 'section retenue');
      await ctx.principal(({ w }) => { const id = Object.keys(w.data.tabs).find((x) => w.data.tabs[x].internal && w.data.tabs[x].url.includes('library.html')); w.close(id, { ask: false }); });
      await jusqua(() => !ctx.page('library.html'), 'Bibliothèque fermée');
      await ctx.menu('Shift+Cmd+L');
    });
    const lib2 = await ctx.attendrePage('library.html');
    lib2.setDefaultTimeout(6000);
    const onglet2 = (nom) => lib2.locator(`.tabs [data-tab="${nom}"]`);
    const lignes2 = () => lib2.locator('#list .line');
    const ligne2 = (nom) => lignes2().filter({ has: lib2.locator('.name', { hasText: new RegExp('^' + nom + '$') }) }).first();

    await t.verifier('… ici l’archive, avec ce qu’il en reste', async () => {
      await jusqua(async () => (await lib2.locator('.tabs [data-tab].on').textContent()) === 'Archive', 'onglet « Archive » allumé');
      await jusqua(async () => (await lib2.locator('#list .line .name').allTextContents()).join() === 'Page B', 'une entrée');
      assert.match(lib2.url(), /#archive$/);
    });

    await t.verifier('« Vider l’archive » : une question d’abord ; « Annuler » garde tout, la confirmation vide et affiche « Rien ici pour l’instant ! »', async () => {
      await ctx.principal(({ electron }) => {
        global.__boites = [];
        global.__reponse = 1;
        global.__boite0 = electron.dialog.showMessageBox;
        electron.dialog.showMessageBox = async (...args) => { global.__boites.push(args[args.length - 1].message); return { response: global.__reponse }; };
      });
      try {
        await lib2.locator('#clear').click();
        await jusqua(async () => (await ctx.principal(() => global.__boites.length)) === 1, 'question posée');
        assert.equal(await ctx.principal(() => global.__boites[0]), 'Vider l’archive ?');
        assert.equal(await lignes2().count(), 1);
        await ctx.principal(() => { global.__reponse = 0; });
        await lib2.locator('#clear').click();
        await jusqua(async () => (await lib2.locator('#list .empty').count()) === 1, 'archive vide');
        assert.deepEqual(await lib2.locator('#list .empty > div').allTextContents(), ['Rien ici pour l’instant !', 'Les onglets que tu fermes, ou qui s’archivent d’eux-mêmes, se retrouvent ici.']);
        assert.equal((await ctx.etat()).archive.length, 0);
      } finally {
        await ctx.principal(({ electron }) => { electron.dialog.showMessageBox = global.__boite0; });
      }
    });

    await t.verifier('section Espaces : chaque Espace, celui affiché marqué ; un clic sur une ligne l’affiche', async () => {
      await onglet2('spaces').click();
      await jusqua(async () => (await lignes2().count()) === 2, 'deux Espaces');
      assert.equal(await lib2.locator('#clear').textContent(), 'Nouvel Espace…');
      assert.equal(await ligne2('Voyages').locator('.tag').count(), 0);
      assert.equal(await lignes2().first().locator('.tag').textContent(), 'affiché');
      assert.match(await ligne2('Voyages').locator('.sub').textContent(), /0 épinglés, 1 aujourd’hui/);
      await ligne2('Voyages').locator('.name').click();
      await jusqua(async () => (await ctx.etat()).espace === 'Voyages', 'Espace « Voyages » affiché');
      await ctx.principal(({ w }) => w.switchSpace(w.data.spaces[0].id));
      await jusqua(async () => (await ctx.etat()).espace !== 'Voyages', 'retour au premier Espace');
    });

    await t.verifier('section Boosts : résumé du Boost d’un site, « Désactiver » puis « Activer », « Supprimer »', async () => {
      await ctx.principal(({ store }) => { store.state.boosts['exemple.fr'] = { css: 'body { color: red }', zaps: ['.pub'], enabled: true }; });
      await onglet2('boosts').click();
      await jusqua(async () => (await lignes2().count()) === 1, 'un Boost');
      assert.equal(await lib2.locator('#clear').isVisible(), false);
      assert.match(await lignes2().first().locator('.sub').textContent(), /style personnalisé · 1 éléments masqués/);
      await lignes2().first().locator('[data-do=toggle]').click();
      await jusqua(async () => (await lignes2().first().locator('[data-do=toggle]').textContent()) === 'Activer', 'Boost désactivé');
      assert.equal(await ctx.principal(({ store }) => store.state.boosts['exemple.fr'].enabled), false);
      await lignes2().first().locator('[data-do=toggle]').click();
      await jusqua(async () => (await lignes2().first().locator('[data-do=toggle]').textContent()) === 'Désactiver', 'Boost réactivé');
      await lignes2().first().locator('[data-do=delete]').click();
      await jusqua(async () => (await lib2.locator('#list .empty').count()) === 1, 'plus de Boost');
      assert.equal((await lib2.locator('#list .empty > div').first().textContent()), 'Aucun Boost pour l’instant.');
      assert.equal(await ctx.principal(({ store }) => Object.keys(store.state.boosts).length), 0);
    });

    // --- Fichiers ---------------------------------------------------------------------
    const dossier = path.join(ctx.userData, 'fichiers-essai');
    fs.mkdirSync(dossier, { recursive: true });
    for (const n of ['rapport.txt', 'photo.txt', 'vieux.txt']) fs.writeFileSync(path.join(dossier, n), 'contenu de ' + n);
    await ctx.principal(({ req, store }, dir) => {
      const p = (n) => dir + '/' + n;
      const rec = (n, extra = {}) => ({ id: 'dl-' + n, name: n, path: p(n), url: 'https://fichiers.exemple.fr/' + n, total: 20, received: 20, state: 'completed', at: Date.now(), profile: 'default', ...extra });
      store.state.downloads = [rec('rapport.txt'), rec('photo.txt'), rec('vieux.txt'), rec('disparu.txt')];
      const downloads = req('downloads.js');
      const library = req('library.js');
      global.__dl = { menus: [], choix: null, corbeille: [], glisses: [] };
      downloads.env.popup = async (tpl) => {
        global.__dl.menus.push(tpl.filter((x) => x.type !== 'separator').map((x) => x.id + (x.enabled === false ? '(grisé)' : '')).join());
        const it = tpl.find((x) => x.id === global.__dl.choix);
        if (it && it.enabled !== false) await it.click();
      };
      downloads.env.trash = async (f) => { global.__dl.corbeille.push(f); process.mainModule.require('fs').unlinkSync(f); };
      library.env.startDrag = (wc, item) => { global.__dl.glisses.push({ file: item.file, icone: !item.icon.isEmpty() }); };
    }, dossier.split(path.sep).join('/'));
    const temoin = () => ctx.principal(() => global.__dl);
    const complet = ['open', 'copy', 'reveal', ...(mac ? ['share'] : []), 'hide', 'trash'].join();

    await t.verifier('section Téléchargements : boutons, menu « ··· » sur chaque ligne, fichier disparu signalé', async () => {
      await onglet2('downloads').click();
      await jusqua(async () => (await lignes2().count()) === 4, 'quatre fichiers');
      assert.deepEqual(await ligne2('rapport.txt').locator('[data-do]').evaluateAll((bs) => bs.map((b) => b.dataset.do)), ['open', 'reveal', 'menu']);
      assert.deepEqual(await ligne2('disparu.txt').locator('[data-do]').evaluateAll((bs) => bs.map((b) => b.dataset.do)), ['menu']);
      assert.match(await ligne2('disparu.txt').locator('.sub').textContent(), /Fichier déplacé ou supprimé/);
      assert.equal(await ligne2('rapport.txt').getAttribute('draggable'), 'true');
      assert.equal(await ligne2('disparu.txt').getAttribute('draggable'), null);
    });

    await t.verifier('clic sur « ··· » : menu du fichier (Ouvrir, Copier, Afficher, Partager sur macOS, Masquer, Corbeille)', async () => {
      await ligne2('rapport.txt').locator('[data-do=menu]').click();
      await jusqua(async () => (await temoin()).menus.length === 1, 'menu ouvert');
      assert.equal((await temoin()).menus[0], complet);
    });

    await t.verifier('clic droit sur une ligne : même menu ; « Masquer de la liste » retire la ligne, le fichier reste', async () => {
      await ctx.principal(() => { global.__dl.choix = 'hide'; });
      await ligne2('photo.txt').locator('.name').click({ button: 'right' });
      await jusqua(async () => (await lignes2().count()) === 3, 'ligne masquée');
      assert.equal((await temoin()).menus[1], complet);
      assert.ok(fs.existsSync(path.join(dossier, 'photo.txt')));
      assert.equal(await ligne2('photo.txt').count(), 0);
    });

    await t.verifier('« Placer dans la corbeille » : le fichier part à la corbeille, la ligne disparaît', async () => {
      await ctx.principal(() => { global.__dl.choix = 'trash'; });
      await ligne2('vieux.txt').locator('[data-do=menu]').click();
      await jusqua(async () => (await lignes2().count()) === 2, 'ligne retirée');
      const vu = await temoin();
      assert.equal(vu.corbeille.length, 1);
      assert.equal(path.basename(vu.corbeille[0]), 'vieux.txt');
      assert.ok(!fs.existsSync(path.join(dossier, 'vieux.txt')));
    });

    await t.verifier('fichier disparu : menu réduit (ouvrir, copier, afficher et corbeille grisés)', async () => {
      await ctx.principal(() => { global.__dl.choix = null; });
      await ligne2('disparu.txt').locator('.name').click({ button: 'right' });
      await jusqua(async () => (await temoin()).menus.length === 4, 'menu ouvert');
      assert.equal((await temoin()).menus[3], 'open(grisé),copy(grisé),reveal(grisé),hide,trash(grisé)');
    });

    await t.verifier('glisser une ligne à la souris : le système reçoit le vrai fichier (glisser hors d’Orbe)', async () => {
      const b = await ligne2('rapport.txt').locator('.name').boundingBox();
      const x = b.x + 30;
      const y = b.y + b.height / 2;
      const geste = (async () => {
        await lib2.mouse.move(x, y);
        await lib2.mouse.down();
        await lib2.mouse.move(x + 4, y + 4, { steps: 2 });
        await lib2.mouse.move(x + 40, y + 30, { steps: 4 });
      })();
      // Le glisser est repris par le système (ici, par le témoin) : la page l'annule, la souris peut rester en attente.
      await ctx.delai(geste, 5000, 'début du glisser').catch(() => {});
      await jusqua(async () => (await temoin()).glisses.length >= 1, 'glisser confié au système');
      await ctx.delai(lib2.mouse.up(), 3000, 'relâcher').catch(() => {});
      const g = (await temoin()).glisses[0];
      assert.equal(path.basename(g.file), 'rapport.txt');
      assert.equal(g.icone, true);
      assert.equal(await lignes2().count(), 2, 'la liste ne change pas');
    });

    await ctx.capture('bibliotheque-telechargements', lib2);
    try { fs.rmSync(dossier, { recursive: true, force: true }); } catch {}
  },
};
