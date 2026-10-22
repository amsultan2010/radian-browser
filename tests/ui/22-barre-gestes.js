// Barre latérale, gestes repris d'Arc : boutons du haut (historique, nouvel
// onglet, dupliquer, arrêter), pastille d'adresse, en-tête de l'Espace, menus
// contextuels, témoins des lignes, repère de l'onglet hors de vue.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Barre latérale : gestes et menus',
  async test(ctx, t) {
    const { shell, jusqua } = ctx;
    const CMD = process.platform === 'darwin' ? 'Meta' : 'Control';
    const today = () => ctx.titres('#today');
    const etat = () => ctx.etat();
    const champ = shell.locator('input.rename');

    // Les menus contextuels sont natifs : on en retient le contenu au lieu de
    // l'afficher, puis on actionne un article par son libellé.
    await ctx.principal(({ w }) => { w.popup = (tpl) => { w.menuVu = tpl; }; });
    const oublier = () => ctx.principal(({ w }) => { w.menuVu = null; });
    const menuVu = () => jusqua(() => ctx.principal(({ w }) => w.menuVu && w.menuVu.filter((x) => x.label && x.visible !== false).map((x) => x.label)), 'menu contextuel');
    const menuDe = async (loc, options = {}) => {
      await oublier();
      await ctx.clic(shell, loc, { button: 'right', ...options });
      return menuVu();
    };
    const actionner = (cle) => ctx.principal(({ w, store }, k) => {
      const label = store.t(k);
      const it = w.menuVu.find((x) => x.label === label);
      if (!it || it.enabled === false) throw new Error('article absent ou grisé : ' + label);
      it.click();
    }, cle);
    const textes = (...cles) => Promise.all(cles.map((k) => ctx.texte(k)));
    const pressePapiers = () => ctx.principal(({ electron }) => electron.clipboard.readText());
    const avant = await pressePapiers();

    const pageA = await ctx.ouvrir('/a', 'Page A');

    // --- Précédent, suivant, actualiser -----------------------------------------
    await pageA.click('#vers-b');
    await jusqua(async () => (await etat()).actifUrl === ctx.url('/b'), 'page B');
    await jusqua(() => shell.locator('#b-back').isEnabled(), 'précédent actif');

    await t.verifier('clic droit sur précédent : l’historique de l’onglet ; un article y ramène', async () => {
      assert.deepEqual(await menuDe('#b-back'), ['Page A']);
      await ctx.principal(({ w }) => w.menuVu[0].click());
      await jusqua(async () => (await etat()).actifUrl === ctx.url('/a'), 'retour en A');
    });

    await t.verifier('appui long sur suivant : le même menu, sans naviguer', async () => {
      await jusqua(() => shell.locator('#b-forward').isEnabled(), 'suivant actif');
      await oublier();
      const c = await ctx.centre(shell.locator('#b-forward'));
      // Le vrai pointeur de la personne qui travaille sur ce Mac peut traverser la
      // fenêtre et interrompre l'appui : on réessaie.
      let vu = null;
      for (let i = 0; i < 4 && !vu; i++) {
        await shell.mouse.move(c.x, c.y);
        await shell.mouse.down();
        await ctx.sleep(750);
        vu = await ctx.principal(({ w }) => w.menuVu && w.menuVu.map((x) => x.label));
        await shell.mouse.up();
      }
      assert.deepEqual(vu, ['Page B']);
      await ctx.sleep(200);
      assert.equal((await etat()).actifUrl, ctx.url('/a'), 'le relâchement ne navigue pas');
    });

    await t.verifier('⌘clic sur suivant : la page s’ouvre dans un nouvel onglet, derrière', async () => {
      await ctx.clic(shell, '#b-forward', { modifiers: [CMD] });
      await jusqua(async () => (await today()).join() === 'Page A,Page B', 'nouvel onglet B sous A');
      const e = await etat();
      assert.equal(e.actifUrl, ctx.url('/a'));
      assert.equal(e.aujourdhui[1].url, ctx.url('/b'));
    });

    await t.verifier('clic molette sur suivant : pareil', async () => {
      await ctx.clic(shell, '#b-forward', { button: 'middle' });
      await jusqua(async () => (await today()).join() === 'Page A,Page B,Page B', 'second onglet B');
      assert.equal((await etat()).actifUrl, ctx.url('/a'));
    });

    await t.verifier('clic droit sur actualiser : actualiser, forcer, effacer les cookies, effacer le cache', async () => {
      assert.deepEqual(await menuDe('#b-reload'), await textes('view.reload', 'view.forceReload', 'view.clearCookies', 'view.clearCache'));
      const n = ctx.hits['/a'];
      await actionner('view.forceReload');
      await jusqua(() => ctx.hits['/a'] === n + 1, 'page A rechargée');
    });

    await t.verifier('⌘clic sur actualiser : l’onglet est dupliqué', async () => {
      await ctx.clic(shell, '#b-reload', { modifiers: [CMD] });
      await jusqua(async () => (await today()).join() === 'Page A,Page A,Page B,Page B', 'copie de A sous A');
      const e = await etat();
      assert.equal(e.actif, e.aujourdhui[1].id, 'la copie est affichée');
    });

    await t.verifier('double-clic sur actualiser : le chargement s’arrête', async () => {
      await ctx.ouvrir('/relent', 'Page Relente');
      await jusqua(async () => !(await shell.evaluate(() => S.nav.loading)), 'première visite chargée');
      // Sans l'arrêt du double-clic, l'actualisation (qui ne finit jamais) resterait en cours.
      await shell.locator('#b-reload').dblclick();
      await ctx.sleep(400);
      await jusqua(async () => !(await shell.evaluate(() => S.nav.loading)), 'chargement arrêté');
      await ctx.sleep(400);
      assert.equal(await shell.evaluate(() => S.nav.loading), false);
      assert.equal(await shell.getAttribute('#reload-icon', 'href'), '#i-reload');
    });

    await t.verifier('Échap dans la page : le chargement en cours s’arrête', async () => {
      await ctx.clic(shell, '#b-reload');
      await jusqua(() => shell.evaluate(() => S.nav.loading), 'chargement en cours');
      // Frappe injectée dans la page par le navigateur lui-même : elle suit le
      // chemin d'une vraie touche (celles de Playwright n'y passent pas).
      await ctx.principal(({ w }) => { for (const type of ['keyDown', 'keyUp']) w.activeRt.wc.sendInputEvent({ type, keyCode: 'Escape' }); });
      await jusqua(async () => !(await shell.evaluate(() => S.nav.loading)), 'chargement arrêté');
    });

    // --- Pastille d'adresse ---------------------------------------------------------
    await t.verifier('pastille d’adresse : « Copier le lien » paraît au survol et copie l’adresse', async () => {
      assert.equal(await shell.locator('#url-copy').isVisible(), false);
      await ctx.clic(shell, '#url-copy', { survol: shell.locator('#url') });
      await jusqua(async () => (await pressePapiers()) === ctx.url('/relent'), 'adresse dans le presse-papiers');
      const r = await shell.evaluate(() => {
        const u = document.getElementById('url').getBoundingClientRect();
        const c = document.getElementById('url-copy').getBoundingClientRect();
        return c.left >= u.left && c.right <= u.right && c.top >= u.top && c.bottom <= u.bottom;
      });
      assert.equal(r, true, 'le bouton tient dans la pastille');
    });

    // --- En-tête de l'Espace ----------------------------------------------------------
    await t.verifier('en-tête de l’Espace : « … » au survol ouvre le menu de l’Espace', async () => {
      await oublier();
      await ctx.clic(shell, '#space-more', { survol: shell.locator('#space-head') });
      const vu = await menuVu();
      const [renommer, icone, entete] = await textes('spaces.rename', 'spaces.changeIcon', 'spaces.hideHeader');
      assert.ok(vu.includes(renommer) && vu.includes(icone) && vu.includes(entete), vu.join(' | '));
    });

    await t.verifier('un clic sur le nom de l’Espace le renomme', async () => {
      await ctx.clic(shell, '#space-name', { position: { x: 12, y: 8 } });
      await jusqua(() => shell.locator('#space-name input.rename').count(), 'champ de nom');
      await shell.keyboard.type('Maison', { delay: 10 });
      await shell.keyboard.press('Enter');
      await jusqua(async () => (await etat()).espace === 'Maison', 'Espace renommé');
    });

    await t.verifier('clic dans le vide à droite du nom : pas de renommage', async () => {
      const b = await shell.locator('#space-name').boundingBox();
      await ctx.clic(shell, '#space-name', { position: { x: b.width - 6, y: 8 } });
      await ctx.sleep(200);
      assert.equal(await champ.count(), 0);
    });

    // --- Double-clics -------------------------------------------------------------------
    await t.verifier('double-clic dans le vide de la liste : la barre de commande s’ouvre pour un nouvel onglet', async () => {
      const b = await shell.locator('#blank').boundingBox();
      await shell.mouse.dblclick(b.x + b.width / 2, b.y + b.height - 30);
      await jusqua(ctx.commandeOuverte, 'barre de commande ouverte');
      await ctx.modal.keyboard.press('Escape');
      await jusqua(async () => !(await ctx.commandeOuverte()), 'barre de commande refermée');
    });

    await t.verifier('double-clic sur un onglet du jour : renommer, Entrée valide', async () => {
      await ctx.ligne('Page Relente', '#today').locator('.title').dblclick();
      await jusqua(() => shell.locator('#today input.rename').count(), 'champ de renommage');
      await shell.keyboard.type('Lente', { delay: 10 });
      await shell.keyboard.press('Enter');
      await jusqua(async () => (await today())[0] === 'Lente', 'titre choisi');
      assert.equal((await etat()).aujourdhui[0].title, 'Lente');
    });

    // --- Menus de la barre ----------------------------------------------------------------
    await t.verifier('bouton « + » : onglet, dossier, Espace, vue scindée, tableau, note, Boost', async () => {
      await oublier();
      await ctx.clic(shell, '#b-plus');
      assert.deepEqual(await menuVu(), await textes('tabs.newTab', 'tabs.newFolder', 'spaces.new', 'view.addSplit', 'easel.new', 'notes.new', 'boost.edit'));
    });

    await t.verifier('clic droit dans le vide de la barre : thème, profil, dossiers', async () => {
      const b = await shell.locator('#blank').boundingBox();
      await oublier();
      await shell.mouse.click(b.x + b.width / 2, b.y + b.height - 30, { button: 'right' });
      assert.deepEqual(await menuVu(), await textes('tabs.newTab', 'tabs.newFolder', 'spaces.new', 'spaces.editTheme', 'spaces.profile', 'tabs.expandFolders', 'tabs.collapseFolders'));
    });

    await t.verifier('clic droit sur un onglet : « Copier le lien en Markdown », archiver au-dessus, les autres', async () => {
      const vu = await menuDe(ctx.ligne('Page B', '#today'));
      const [md, dessus, autres, dessous] = await textes('tabs.copyLinkMarkdown', 'tabs.closeAbove', 'tabs.closeAllOthers', 'tabs.closeOthers');
      assert.ok([md, dessus, autres, dessous].every((x) => vu.includes(x)), vu.join(' | '));
      await actionner('tabs.copyLinkMarkdown');
      await jusqua(async () => (await pressePapiers()) === `[Page B](${ctx.url('/b')})`, 'lien Markdown');
    });

    await t.verifier('menu → « Archiver les onglets au-dessus » : ils partent, ⌘Z les ramène', async () => {
      assert.deepEqual(await today(), ['Lente', 'Page A', 'Page A', 'Page B', 'Page B']);
      await menuDe(shell.locator('#today .row.tab').nth(3));
      await actionner('tabs.closeAbove');
      await jusqua(async () => (await today()).join() === 'Page B,Page B', 'trois onglets archivés');
      await ctx.menu('Cmd+Z');
      await jusqua(async () => (await today()).join() === 'Lente,Page A,Page A,Page B,Page B', 'onglets revenus');
    });

    // --- Témoins des lignes ---------------------------------------------------------------
    await t.verifier('son coupé par le menu : le haut-parleur paraît sur la ligne, un clic dessus rétablit le son', async () => {
      const ligne = shell.locator('#today .row.tab').nth(3);
      await menuDe(ligne);
      await actionner('tabs.mute');
      await jusqua(() => ligne.evaluate((el) => el.classList.contains('muted')), 'ligne muette');
      const bouton = ligne.locator('.act.snd');
      await jusqua(() => bouton.isVisible(), 'haut-parleur visible');
      assert.equal(await bouton.locator('use').getAttribute('href'), '#i-mute');
      await ctx.clic(shell, bouton);
      await jusqua(async () => !(await ligne.evaluate((el) => el.classList.contains('muted'))), 'son rétabli');
      assert.equal((await etat()).actifUrl, ctx.url('/relent'), 'le clic sur le bouton n’affiche pas l’onglet');
    });

    await t.verifier('épinglé sorti de son adresse : « / » sur la ligne ; clic sur l’icône = retour', async () => {
      await ctx.clic(shell, shell.locator('#today .row.tab').nth(1));
      await jusqua(async () => (await etat()).actifUrl === ctx.url('/a'), 'A affichée');
      await ctx.menu('Cmd+D');
      await jusqua(async () => (await ctx.titres('#pinned')).join() === 'Page A', 'A épinglée');
      const actif = (await etat()).actif;
      const vue = await jusqua(async () => { for (const p of ctx.pages()) { if (p.url() === ctx.url('/a') && await p.evaluate(() => document.visibilityState === 'visible').catch(() => false)) return p; } return null; }, 'page épinglée visible');
      await vue.click('#vers-b');
      const ligne = shell.locator('#pinned .row.tab').first();
      await jusqua(() => ligne.evaluate((el) => el.classList.contains('changed')), 'ligne « / »');
      assert.equal(await ligne.locator('.slash').isVisible(), true);
      await ctx.clic(shell, ligne.locator('.ic'));
      await jusqua(async () => (await etat()).actifUrl === ctx.url('/a'), 'retour en A');
      await jusqua(async () => !(await ligne.evaluate((el) => el.classList.contains('changed'))), '« / » retiré');
      assert.equal((await etat()).actif, actif);
    });

    await t.verifier('⌘clic sur l’icône : retour à l’adresse, la page quittée part dans un nouvel onglet', async () => {
      const combien = (await today()).length;
      const vue = await jusqua(async () => { for (const p of ctx.pages()) { if (p.url() === ctx.url('/a') && await p.evaluate(() => document.visibilityState === 'visible').catch(() => false)) return p; } return null; }, 'page épinglée visible');
      await vue.click('#vers-b');
      const ligne = shell.locator('#pinned .row.tab').first();
      await jusqua(() => ligne.evaluate((el) => el.classList.contains('changed')), 'ligne « / »');
      await ctx.clic(shell, ligne.locator('.ic'), { modifiers: [CMD] });
      await jusqua(async () => (await today()).length === combien + 1, 'nouvel onglet');
      await jusqua(async () => (await etat()).actifUrl === ctx.url('/a'), 'épinglé revenu en A');
      const e = await etat();
      assert.equal(e.aujourdhui[0].url, ctx.url('/b'));
      assert.equal(e.epingles[0].id, e.actif);
      assert.equal(await shell.locator('#sidebar .sel').count(), 0, 'ce ⌘clic ne sélectionne rien');
    });

    // --- Section épinglée, en-tête ------------------------------------------------------------
    await t.verifier('chevron de l’en-tête : la section épinglée se replie, seul l’onglet affiché reste', async () => {
      await ctx.clic(shell, ctx.ligne('Lente', '#today'));
      await jusqua(async () => (await etat()).actifUrl === ctx.url('/relent'), 'onglet du jour affiché');
      await ctx.clic(shell, '#pinned-toggle', { survol: shell.locator('#space-head') });
      await jusqua(async () => !(await shell.locator('#pinned .row.tab').first().isVisible()), 'épinglé masqué');
      await shell.mouse.move(600, 500);
      await jusqua(async () => (await shell.locator('#pinned-toggle').evaluate((el) => getComputedStyle(el).opacity)) === '1', 'le chevron reste visible, section repliée, hors survol');
      await ctx.clic(shell, '#pinned-toggle');
      await jusqua(() => shell.locator('#pinned .row.tab').first().isVisible(), 'épinglé revenu');
    });

    await t.verifier('« Afficher l’onglet dans la barre latérale » (menu), barre masquée : elle revient, la ligne est mise en évidence', async () => {
      await ctx.clic(shell, '#b-sidebar');
      await jusqua(async () => (await etat()).lateraleVisible === false, 'barre masquée');
      await ctx.menu('tabs.reveal');
      await jusqua(async () => (await etat()).lateraleVisible === true, 'barre revenue');
      await jusqua(() => shell.locator('#today .row.tab.active.flash').count(), 'ligne mise en évidence');
    });

    await t.verifier('⌥⌘V (élément de menu) : l’adresse du presse-papiers s’ouvre dans un nouvel onglet', async () => {
      await ctx.principal(({ electron }, u) => electron.clipboard.writeText(u), ctx.url('/c'));
      await ctx.menu('Alt+Cmd+V');
      await jusqua(async () => (await etat()).actifUrl === ctx.url('/c'), 'page C ouverte');
      await jusqua(async () => (await today())[0] === 'Page C', 'ligne en tête');
    });

    // --- Repère de l'onglet hors de vue -----------------------------------------------------------
    await t.verifier('onglet affiché hors de vue : un repère paraît en bas de la liste ; un clic y ramène', async () => {
      await ctx.principal(({ w }) => {
        for (let i = 0; i < 40; i++) { const tab = w.createTab('http://127.0.0.1:9/n' + i, { index: 0 }); tab.title = 'N' + i; }
        w.changed();
      });
      await jusqua(async () => (await today()).length >= 40, 'quarante lignes de plus');
      await shell.locator('#scroll').evaluate((el) => { el.scrollTop = 0; });
      const repere = shell.locator('#off-view');
      await jusqua(() => repere.isVisible(), 'repère visible');
      assert.equal(await repere.getAttribute('class'), 'down');
      await ctx.clic(shell, repere);
      await jusqua(async () => !(await repere.isVisible()), 'repère retiré');
      // Défilement doux qui n'avance pas (aucune image présentée : écran verrouillé, fenêtre
      // recouverte) : simulé ici en le rendant sans effet. Le clic doit quand même ramener la ligne.
      await shell.locator('#scroll').evaluate((el) => { el.scrollTop = 0; });
      await jusqua(() => repere.isVisible(), 'repère de nouveau visible');
      // On a défilé ailleurs aussitôt après le clic : la liste reste où on l'a mise. (Avant, un
      // rattrapage à délai fixe la ramenait sur l'onglet 900 ms après le clic, quoi qu'on ait fait
      // entre-temps — et retirait le repère sous le pointeur : cet essai échouait une fois sur cinq.)
      await ctx.sleep(1100);
      // (Quelques points au plus : un dernier pas du défilement doux, déjà en route quand on a défilé.)
      assert.ok((await shell.locator('#scroll').evaluate((el) => el.scrollTop)) < 40, 'la liste n’a pas été ramenée de force sur l’onglet');
      assert.equal(await repere.isVisible(), true, 'le repère est toujours là');
      await shell.evaluate(() => {
        const vrai = Element.prototype.scrollIntoView;
        window.__doux = 0;
        Element.prototype.scrollIntoView = function scrollIntoView(o) { if (o && o.behavior === 'smooth') { window.__doux += 1; return undefined; } return vrai.call(this, o); };
        window.__retablir = () => { Element.prototype.scrollIntoView = vrai; };
      });
      await ctx.clic(shell, repere);
      await jusqua(async () => !(await repere.isVisible()), 'repère retiré malgré un défilement doux à l’arrêt', 5000);
      const vue = await shell.evaluate(() => { window.__retablir(); const r = document.querySelector('#scroll .row.tab.active').getBoundingClientRect(); const s = document.getElementById('scroll').getBoundingClientRect(); return { doux: window.__doux, dedans: r.top >= s.top && r.bottom <= s.bottom }; });
      assert.ok(vue.dedans, 'la ligne de l’onglet affiché est entièrement en vue : ' + JSON.stringify(vue));
      await jusqua(() => shell.evaluate(() => {
        const r = document.querySelector('#today .row.tab.active').getBoundingClientRect();
        const s = document.getElementById('scroll').getBoundingClientRect();
        return r.top >= s.top - 1 && r.bottom <= s.bottom + 1;
      }), 'la ligne de l’onglet affiché est à l’écran');
    });

    await ctx.capture('barre-gestes');
    await ctx.principal(({ electron }, texte) => electron.clipboard.writeText(texte), avant);
  },
};
