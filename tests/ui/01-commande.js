// Barre de commande : ouverture au clic, saisie au clavier, suggestions,
// flèches, Échap, clic sur le fond, clic sur une suggestion, ⌘L, complétion.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Barre de commande',
  async test(ctx, t) {
    const { shell, modal, jusqua, hote } = ctx;
    const champ = () => modal.inputValue('#cmd-input');
    const fermee = () => jusqua(async () => !(await ctx.commandeOuverte()), 'barre de commande refermée');

    await t.verifier('au départ : aucun onglet, message d’accueil, adresse vide', async () => {
      assert.equal(await shell.evaluate(() => document.body.classList.contains('no-tab')), true);
      assert.equal(await shell.textContent('#url-text'), 'Rechercher ou saisir une adresse…');
      assert.equal(await shell.locator('#empty').isVisible(), true);
      assert.equal(await shell.locator('#today .row.tab').count(), 0);
      assert.equal(await shell.locator('#b-reload').isDisabled(), true);
    });

    await t.verifier('clic sur « Nouvel onglet » : la barre de commande apparaît, champ prêt', async () => {
      await ctx.nouvelOnglet();
      assert.equal((await ctx.etat()).modale, 'command');
      assert.equal(await modal.evaluate(() => document.activeElement && document.activeElement.id), 'cmd-input');
      assert.equal(await modal.getAttribute('#cmd-input', 'placeholder'), 'Rechercher ou saisir une adresse…');
      const box = await modal.locator('#command').boundingBox();
      const vw = await modal.evaluate(() => innerWidth);
      assert.ok(Math.abs(box.x + box.width / 2 - vw / 2) <= 2, 'panneau centré dans la fenêtre');
    });

    await t.avecFocus('verifier', 'le clavier natif est dans la barre de commande', async () => {
      assert.equal((await ctx.etat()).focus, 'modale');
    });

    await t.verifier('saisie d’une adresse locale : suggestion « Ouvrir la page » sélectionnée', async () => {
      await ctx.taper(hote + '/a');
      assert.equal(await champ(), hote + '/a');
      assert.equal(await ctx.selection(), 0);
      assert.equal((await ctx.suggestions())[0], hote + '/a');
      assert.match(await modal.locator('#cmd-list .cmd.sel .sub').textContent(), /Ouvrir la page/);
    });

    await t.verifier('Entrée : l’onglet apparaît, la page se charge, la pastille affiche l’hôte', async () => {
      await modal.keyboard.press('Enter');
      await fermee();
      await jusqua(async () => (await ctx.titres()).join() === 'Page A', 'ligne « Page A »');
      const page = await ctx.attendreOnglet('/a');
      assert.equal(await page.textContent('h1'), 'Alpha');
      assert.equal(await shell.textContent('#url-text'), hote);
      assert.equal(await shell.locator('#today .row.tab.active').count(), 1);
      assert.equal(await shell.evaluate(() => document.body.classList.contains('no-tab')), false);
      const e = await ctx.etat();
      assert.equal(e.actifUrl, ctx.url('/a'));
      assert.equal(e.modale, null);
    });

    await t.avecFocus('verifier', 'après Entrée, le clavier natif est dans la page', async () => {
      assert.match(String((await ctx.etat()).focus), /^onglet:/);
    });

    await t.verifier('Échap ferme la barre sans ouvrir d’onglet', async () => {
      await ctx.nouvelOnglet();
      await ctx.taper(hote + '/b');
      await modal.keyboard.press('Escape');
      await fermee();
      assert.deepEqual(await ctx.titres(), ['Page A']);
      assert.equal((await ctx.etat()).modale, null);
    });

    await t.verifier('à la réouverture le champ est vide', async () => {
      await ctx.nouvelOnglet();
      assert.equal(await champ(), '');
    });

    await t.verifier('clic sur le fond (hors du panneau) ferme la barre', async () => {
      assert.equal(await ctx.commandeOuverte(), true);
      await ctx.clic(modal, '#backdrop', { position: { x: 40, y: 520 } });
      await fermee();
      assert.deepEqual(await ctx.titres(), ['Page A']);
    });

    await t.verifier('Entrée sur un champ vide ferme simplement la barre', async () => {
      await ctx.nouvelOnglet();
      await modal.keyboard.press('Enter');
      await fermee();
      assert.deepEqual(await ctx.titres(), ['Page A']);
    });

    await ctx.ouvrir('/b', 'Page B');

    await t.verifier('taper du texte affiche des suggestions (recherche, onglet ouvert, historique)', async () => {
      await ctx.nouvelOnglet();
      await ctx.taper('Page');
      const titres = await ctx.suggestions();
      assert.equal(titres[0], 'Page');
      assert.ok(titres.includes('Page A'), 'onglet ou historique « Page A » proposé : ' + titres.join(' | '));
      assert.ok(titres.length >= 3, 'au moins trois suggestions');
      assert.equal(await ctx.selection(), 0);
      const subs = await modal.locator('#cmd-list .cmd .sub').allTextContents();
      assert.match(subs[0], /Rechercher avec Google/);
      assert.ok(subs.some((s) => /Basculer vers l’onglet/.test(s)), 'bascule vers un onglet proposée');
    });

    await t.verifier('↓ et ↑ déplacent la sélection, avec retour en boucle', async () => {
      const n = (await ctx.suggestions()).length;
      await modal.keyboard.press('ArrowDown');
      assert.equal(await ctx.selection(), 1);
      await modal.keyboard.press('ArrowDown');
      assert.equal(await ctx.selection(), 2);
      await modal.keyboard.press('ArrowUp');
      assert.equal(await ctx.selection(), 1);
      await modal.keyboard.press('ArrowUp');
      await modal.keyboard.press('ArrowUp');
      assert.equal(await ctx.selection(), n - 1, '↑ depuis le premier élément va au dernier');
      await modal.keyboard.press('ArrowDown');
      assert.equal(await ctx.selection(), 0, '↓ depuis le dernier revient au premier');
      assert.equal(await modal.locator('#cmd-list .cmd.sel').count(), 1);
      assert.equal(await champ(), 'Page', 'les flèches ne modifient pas la saisie');
    });

    await t.verifier('⇥ et ⇧⇥ déplacent aussi la sélection', async () => {
      await modal.keyboard.press('Tab');
      assert.equal(await ctx.selection(), 1);
      await modal.keyboard.press('Shift+Tab');
      assert.equal(await ctx.selection(), 0);
      assert.equal(await modal.evaluate(() => document.activeElement.id), 'cmd-input');
    });

    await t.verifier('↓ jusqu’à « Basculer vers l’onglet » puis Entrée : bascule sans créer d’onglet', async () => {
      await ctx.taper(' A', 'Page A');
      const subs = await modal.locator('#cmd-list .cmd .sub').allTextContents();
      const i = subs.findIndex((s) => /Basculer vers l’onglet/.test(s));
      assert.ok(i > 0, 'suggestion de bascule présente');
      for (let k = 0; k < i; k++) await modal.keyboard.press('ArrowDown');
      assert.equal(await ctx.selection(), i);
      await modal.keyboard.press('Enter');
      await fermee();
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/a'), 'onglet A actif');
      assert.deepEqual(await ctx.titres(), ['Page B', 'Page A']);
    });

    await t.verifier('clic sur une suggestion : elle est exécutée', async () => {
      await ctx.nouvelOnglet();
      await ctx.taper('Page B');
      const cible = modal.locator('#cmd-list .cmd').filter({ hasText: 'Basculer vers l’onglet' }).first();
      await ctx.clic(modal, cible);
      await fermee();
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/b'), 'onglet B actif');
      assert.deepEqual(await ctx.titres(), ['Page B', 'Page A']);
    });

    await t.verifier('survol d’une suggestion : elle devient la sélection', async () => {
      await ctx.nouvelOnglet();
      await ctx.taper('Page');
      const lignes = modal.locator('#cmd-list .cmd');
      await lignes.nth(2).hover();
      await jusqua(async () => (await ctx.selection()) === 2, 'sélection sous la souris');
      await modal.keyboard.press('Escape');
      await fermee();
    });

    await t.verifier('barre ouverte sans texte : onglets récents proposés, ↓ puis Entrée y bascule', async () => {
      await ctx.nouvelOnglet();
      const titres = await ctx.suggestions();
      assert.ok(titres.includes('Page A') && titres.includes('Page B'), 'onglets récents : ' + titres.join(' | '));
      assert.equal(await ctx.selection(), -1, 'rien de sélectionné tant qu’on n’a rien tapé');
      const i = titres.indexOf('Page A');
      for (let k = 0; k <= i; k++) await modal.keyboard.press('ArrowDown');
      await modal.keyboard.press('Enter');
      await fermee();
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/a'), 'onglet A actif');
    });

    await t.verifier('⌘T (élément de menu) ouvre la barre, un second ⌘T la referme', async () => {
      await ctx.menu('Cmd+T');
      await jusqua(ctx.commandeOuverte, 'ouverte par ⌘T');
      await ctx.menu('Cmd+T');
      await fermee();
    });

    await t.verifier('⌘L (élément de menu) : adresse de l’onglet actif présélectionnée', async () => {
      await ctx.menu('Cmd+L');
      await jusqua(ctx.commandeOuverte, 'ouverte par ⌘L');
      assert.equal(await champ(), ctx.url('/a'));
      const sel = await modal.evaluate(() => { const i = document.getElementById('cmd-input'); return [i.selectionStart, i.selectionEnd, i.value.length]; });
      assert.deepEqual(sel.slice(0, 2), [0, sel[2]], 'toute l’adresse est sélectionnée');
      const titres = await ctx.suggestions();
      assert.ok(!titres.includes('Page A'), 'l’onglet actif n’est pas proposé');
    });

    await t.verifier('⌘L : taper une adresse puis Entrée navigue dans le même onglet', async () => {
      await ctx.taper(hote + '/c');
      assert.equal(await champ(), hote + '/c', 'la frappe remplace l’adresse sélectionnée');
      await modal.keyboard.press('Enter');
      await fermee();
      await jusqua(async () => (await ctx.titres()).join() === 'Page B,Page C', 'titre « Page C » à la place de A');
      assert.equal((await ctx.etat()).actifUrl, ctx.url('/c'));
      assert.equal((await ctx.etat()).aujourdhui.length, 2);
    });

    await t.verifier('clic sur la pastille d’adresse : même effet que ⌘L', async () => {
      await ctx.clic(shell, '#url');
      await jusqua(ctx.commandeOuverte, 'ouverte par la pastille');
      assert.equal(await champ(), ctx.url('/c'));
      // Comme dans Arc : avec ⌘L, le panneau s'ouvre à l'emplacement de la pastille d'adresse.
      const boite = await modal.evaluate(() => { const r = document.getElementById('command').getBoundingClientRect(); return { x: r.left, y: r.top }; });
      const pastille = await shell.evaluate(() => { const r = document.getElementById('url').getBoundingClientRect(); return { x: r.left, haut: r.top }; });
      assert.ok(Math.abs(boite.x - pastille.x) <= 4 && Math.abs(boite.y - pastille.haut) <= 8, `panneau ancré sur la pastille (${JSON.stringify([boite, pastille])})`);
      await modal.keyboard.press('Escape');
      await fermee();
    });

    await t.verifier('complétion automatique depuis l’historique : la suite de l’adresse est proposée et sélectionnée', async () => {
      await ctx.nouvelOnglet();
      await modal.keyboard.type('127', { delay: 30 });
      await jusqua(async () => (await champ()).length > 3, 'adresse complétée');
      const v = await champ();
      assert.match(v, new RegExp('^' + hote.replace(/\./g, '\\.') + '/[abc]$'));
      const sel = await modal.evaluate(() => { const i = document.getElementById('cmd-input'); return [i.selectionStart, i.selectionEnd]; });
      assert.deepEqual(sel, [3, v.length], 'seule la partie ajoutée est sélectionnée');
      assert.equal(await ctx.selection(), 0);
      assert.match(await modal.locator('#cmd-list .cmd.sel .sub').textContent(), new RegExp(v.replace(/[.]/g, '\\.')));
    });

    await t.verifier('retour arrière : la complétion disparaît et ne revient pas', async () => {
      await modal.keyboard.press('Backspace');
      assert.equal(await champ(), '127');
      await ctx.sleep(150);
      assert.equal(await champ(), '127');
      await modal.keyboard.press('Backspace');
      await ctx.sleep(150);
      assert.equal(await champ(), '12');
    });

    await t.verifier('complétion puis Entrée : la page de l’historique s’ouvre dans un nouvel onglet', async () => {
      await modal.keyboard.type('7', { delay: 30 });
      await jusqua(async () => (await champ()).length > 3, 'adresse complétée');
      const v = await champ();
      await modal.keyboard.press('Enter');
      await fermee();
      await jusqua(async () => (await ctx.etat()).actifUrl === 'http://' + v, 'page ouverte : ' + v);
      assert.equal((await ctx.etat()).aujourdhui.length, 3);
    });

    await t.verifier('⌘↵ ouvre la suggestion en arrière-plan', async () => {
      const avant = await ctx.etat();
      await ctx.nouvelOnglet();
      await ctx.taper(hote + '/d');
      await modal.keyboard.press('Meta+Enter');
      await fermee();
      await jusqua(async () => (await ctx.titres()).includes('Page D'), 'ligne « Page D »');
      const apres = await ctx.etat();
      assert.equal(apres.actif, avant.actif, 'l’onglet actif ne change pas');
      assert.equal(apres.aujourdhui.length, avant.aujourdhui.length + 1);
    });

    await ctx.nouvelOnglet();
    await ctx.taper('Page');
    await ctx.capture('commande', modal);
    await modal.keyboard.press('Escape');
  },
};
