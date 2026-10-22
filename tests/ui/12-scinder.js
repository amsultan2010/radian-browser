// Vue scindée : glisser un onglet sur la page (côté visé compris), petite barre
// de chaque volet (adresse, fermeture), volet actif, ⌥clic sur un onglet ou un lien.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Glisser pour scinder',
  async test(ctx, t) {
    const { shell, jusqua, sleep } = ctx;
    const volets = () => ctx.principal(({ w, win }) => ({
      ids: w.visibleIds().map((id) => w.data.tabs[id].title),
      actif: w.activeId ? w.data.tabs[w.activeId].title : null,
      places: w.paneRects(w.contentRect(), w.visibleIds()).map((p) => ({ x: p.x, y: p.y, width: p.width, height: p.height, bar: p.bar })),
      pages: w.visibleIds().map((id) => win.live.get(id).view.getBounds()),
      modale: w.modalMode,
    }));
    const barres = () => shell.evaluate(() => [...document.querySelectorAll('#pane-bars .pane-bar')].map((b) => ({ texte: b.querySelector('.pane-text').textContent, actif: b.classList.contains('active') })));
    const pageA = await ctx.ouvrir('/a', 'Page A');
    await ctx.ouvrir('/b', 'Page B');

    await t.verifier('glisser un onglet sur la page crée une vue scindée, sur une seule ligne', async () => {
      const e = await ctx.etat();
      const cible = { x: e.vuePage.x + e.vuePage.width * 0.75, y: e.vuePage.y + e.vuePage.height / 2 };
      await ctx.glisser(await ctx.centre(ctx.ligne('Page A')), () => cible);
      await jusqua(() => shell.evaluate(() => document.querySelectorAll('#today .row.split').length === 1), 'ligne de vue scindée');
      const visibles = await shell.evaluate(() => [...document.querySelectorAll('#today .row.tab')].filter((el) => el.offsetParent).length);
      assert.equal(visibles, 1, 'les deux onglets partagent une ligne');
      assert.equal(await shell.evaluate(() => document.querySelectorAll('#dividers .divider').length), 1, 'une poignée entre les deux volets');
      assert.deepEqual((await volets()).ids, ['Page B', 'Page A'], 'lâché sur la moitié droite : le nouvel onglet se place après');
    });

    await t.verifier('chaque volet a sa petite barre : adresse, options, fermeture ; la page est dessous', async () => {
      await jusqua(async () => (await barres()).length === 2, 'deux petites barres');
      const b = await barres();
      assert.ok(b[0].texte.endsWith('/b') && b[1].texte.endsWith('/a'), JSON.stringify(b));
      const v = await volets();
      v.places.forEach((p, i) => {
        assert.ok(p.bar > 20, 'place réservée à la barre');
        assert.deepEqual(v.pages[i], { x: p.x, y: p.y + p.bar, width: p.width, height: p.height - p.bar });
      });
      // La barre est bien à l'écran, au-dessus de sa page (rien ne la recouvre).
      const boite = await shell.locator('#pane-bars .pane-bar').nth(1).boundingBox();
      // (La zone de dépôt reste un tiers de seconde après le lâcher, le temps du rebond de la bulle : on lit une fois qu'elle s'est retirée.)
      await jusqua(async () => (await ctx.vueAu(boite.x + boite.width / 2, boite.y + boite.height / 2)) === shell.url(), 'barre du volet à l’écran, zone de dépôt retirée');
      assert.equal(await shell.locator('#pane-bars .pane-bar').nth(1).locator('[data-pane="menu"]').isVisible(), true);
    });

    await t.verifier('cliquer dans une page : son volet devient actif (barre marquée, liseré autour de lui)', async () => {
      await jusqua(async () => (await volets()).actif === 'Page A', 'volet lâché actif');
      const pageB = ctx.onglet('/b');
      await pageB.locator('h1').click();
      await jusqua(async () => (await volets()).actif === 'Page B', 'volet cliqué actif');
      await jusqua(async () => { const b = await barres(); return b[0].actif && !b[1].actif; }, 'barre du volet actif marquée');
      const v = await volets();
      // Le liseré glisse d'un volet à l'autre : on attend qu'il soit arrivé.
      const p = v.places[0];
      let anneau = null;
      try {
        await jusqua(async () => { anneau = await shell.locator('#pane-ring').boundingBox(); return anneau && anneau.x === p.x && anneau.y === p.y && anneau.width === p.width && anneau.height === p.height; }, 'liseré autour du volet actif', 3000);
      } catch { assert.fail(`liseré ${JSON.stringify(anneau)} pour le volet ${JSON.stringify(p)}`); }
      await pageA.locator('h1').click();
      await jusqua(async () => (await volets()).actif === 'Page A', 'retour au second volet');
    });

    await t.verifier('clic sur l’adresse d’un volet : la barre de commande s’ouvre sur son adresse ; Entrée ne change que lui', async () => {
      await ctx.clic(shell, shell.locator('#pane-bars .pane-bar').nth(0).locator('.pane-url'));
      await jusqua(ctx.commandeOuverte, 'barre de commande ouverte');
      assert.equal((await volets()).actif, 'Page B');
      assert.equal(await ctx.modal.locator('#cmd-input').inputValue(), ctx.url('/b'));
      await ctx.modal.keyboard.type(ctx.hote + '/c', { delay: 10 });
      await ctx.modal.keyboard.press('Enter');
      await jusqua(async () => (await volets()).ids.join() === 'Page C,Page A', 'le volet a changé de page');
      assert.equal(ctx.onglet('/a') !== undefined, true, 'l’autre volet n’a pas bougé');
    });

    await ctx.ouvrir('/d', 'Page D');
    await t.verifier('glisser un onglet sur la moitié gauche d’un volet : il se place avant lui ; la zone de dépôt éclaire ce côté', async () => {
      await ctx.clic(shell, shell.locator('#today .row.split').first());
      await jusqua(async () => (await volets()).ids.length === 2, 'vue scindée affichée');
      const v = await volets();
      const p = v.places[1];
      const cible = { x: p.x + p.width * 0.2, y: p.y + p.height / 2 };
      let zone = null;
      await ctx.glisser(await ctx.centre(ctx.ligne('Page D')), () => cible, {
        avantLacher: async () => {
          const depot = await ctx.attendrePage('overlay.html#drop');
          zone = await jusqua(() => depot.evaluate(() => { const l = document.getElementById('drop-label'); return document.getElementById('drop').classList.contains('over') && l.style.left ? { left: parseFloat(l.style.left), width: parseFloat(l.style.width) } : null; }), 'côté éclairé');
        },
      });
      await jusqua(async () => (await volets()).ids.join() === 'Page C,Page D,Page A', 'onglet placé entre les deux volets');
      const zoneX = (await ctx.etat()).vuePage; // repère : la zone de dépôt couvre la zone des pages
      assert.ok(zoneX);
      const e = await ctx.principal(({ w }) => w.contentRect());
      assert.ok(Math.abs(e.x + zone.left - (p.x + 6)) <= 1 && Math.abs(zone.width - (p.width / 2 - 12)) <= 1, `zone éclairée ${JSON.stringify(zone)} pour le volet ${JSON.stringify(p)}`);
    });

    await t.verifier('« × » d’un volet : il quitte la vue scindée, son onglet reste dans la barre', async () => {
      const barre = shell.locator('#pane-bars .pane-bar').nth(1);
      await ctx.clic(shell, barre.locator('[data-pane="close"]'));
      await jusqua(async () => (await volets()).ids.join() === 'Page C,Page A', 'volet fermé');
      await jusqua(async () => (await ctx.titres()).includes('Page D'), 'onglet de retour dans la liste');
      assert.equal((await barres()).length, 2);
    });

    await t.verifier('⌥clic sur un onglet de la barre latérale : il rejoint la vue scindée', async () => {
      await ctx.ligne('Page D').click({ modifiers: ['Alt'] });
      await jusqua(async () => (await volets()).ids.length === 3 && (await volets()).ids.includes('Page D'), 'troisième volet');
      assert.equal((await volets()).actif, 'Page D');
      assert.equal(await shell.evaluate(() => document.querySelectorAll('#dividers .divider').length), 2);
    });

    await t.verifier('⌥clic sur un lien de la page : le lien s’ouvre dans un nouveau volet, à côté', async () => {
      // ⌥ est suivie par le filtre clavier du processus principal, que les frappes de
      // Playwright n'empruntent pas : elle est envoyée par Electron, comme une vraie touche.
      const alt = (type) => ctx.principal(({ w, win }, a) => { const id = w.visibleIds().find((x) => w.data.tabs[x].url === a.url); win.live.get(id).wc.sendInputEvent({ type: a.type, keyCode: 'Alt', modifiers: a.type === 'keyDown' ? ['alt'] : [] }); }, { type, url: ctx.url('/a') });
      await ctx.principal(({ w }) => w.separateAll());
      await ctx.clic(shell, ctx.ligne('Page A'));
      await jusqua(async () => (await volets()).ids.join() === 'Page A', 'page A seule');
      const lien = await pageA.locator('#vers-b').boundingBox();
      await pageA.mouse.move(lien.x + lien.width / 2, lien.y + lien.height / 2);
      await jusqua(() => ctx.principal(({ w, win }) => /\/b$/.test(win.live.get(w.activeId).hoverUrl || '')), 'lien survolé');
      await alt('keyDown');
      await sleep(80);
      await pageA.mouse.click(lien.x + lien.width / 2, lien.y + lien.height / 2);
      await alt('keyUp');
      await jusqua(async () => (await volets()).ids.join() === 'Page A,Page B', 'lien ouvert dans un second volet');
      assert.equal(pageA.url(), ctx.url('/a'), 'la page d’origine n’a pas suivi le lien');
      assert.equal((await ctx.principal(({ store }) => store.state.downloads.length)), 0, 'rien n’a été téléchargé');
    });
  },
};
