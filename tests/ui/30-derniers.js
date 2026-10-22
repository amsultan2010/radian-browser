// Derniers points : aperçu d'un dossier replié au survol (vraie souris, vrai clavier),
// bulle et rebond du glisser vers une vue scindée.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Derniers points : aperçu d’un dossier, bulle du glisser',
  async test(ctx, t) {
    const { shell, jusqua, sleep } = ctx;
    const reduit = await shell.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    const animer = (titre, fn) => (reduit ? t.ignorer(titre, '« Réduire les animations » est actif') : t.verifier(titre, fn));
    void animer;
    for (const c of ['a', 'b', 'c', 'd']) await ctx.ouvrir('/' + c, 'Page ' + c.toUpperCase());

    // Pages B et C rangées dans un dossier replié des épinglés ; A et D restent dans Aujourd'hui.
    await ctx.principal(({ w }) => {
      const id = (titre) => Object.keys(w.data.tabs).find((i) => w.data.tabs[i].title === titre);
      const ids = [id('Page B'), id('Page C')];
      w.space.today = w.space.today.filter((i) => !ids.includes(i));
      for (const i of ids) w.data.tabs[i].homeUrl = w.data.tabs[i].url;
      w.space.pinned.push({ type: 'folder', id: 'ui-dossier', name: 'Lectures', open: false, children: ids.map((i) => ({ type: 'tab', id: i })) });
      w.activate(id('Page A'));
      w.changed();
    });
    const tete = shell.locator('#pinned .row[data-id="ui-dossier"]');
    const panneau = shell.locator('#folder-peek:not(.out)');
    await jusqua(async () => (await tete.count()) === 1 && (await shell.locator('#pinned .folder.open').count()) === 0, 'dossier replié dans la barre');
    const actif = async () => (await ctx.etat()).actifUrl;

    await t.verifier('survol d’un dossier replié : la liste de ses onglets paraît sous lui, dans la barre ; les lignes de la barre ne bougent pas', async () => {
      const avant = await ctx.centre(ctx.ligne('Page D'));
      const c = await ctx.centre(tete);
      await shell.mouse.move(c.x, c.y, { steps: 4 });
      await sleep(150);
      assert.equal(await panneau.count(), 0, 'pas d’aperçu au premier instant du survol');
      await jusqua(async () => (await panneau.count()) === 1, 'aperçu du dossier');
      assert.deepEqual(await panneau.locator('.fp-name').allTextContents(), ['Page B', 'Page C']);
      assert.equal(await panneau.locator('.fp-search').getAttribute('placeholder'), (await ctx.texte('fpeek.search')).replace('{name}', 'Lectures'));
      const p = await panneau.boundingBox();
      const b = await shell.locator('#sidebar').boundingBox();
      const h = await tete.boundingBox();
      assert.ok(p.x >= b.x && p.x + p.width <= b.x + b.width && p.y >= h.y + h.height && p.y - (h.y + h.height) <= 8, 'sous le dossier, dans la barre : ' + JSON.stringify([p, h, b]));
      assert.deepEqual(await ctx.centre(ctx.ligne('Page D')), avant, 'les lignes n’ont pas bougé');
      assert.equal(await shell.locator('#pinned .folder.open').count(), 0, 'le dossier reste replié');
      await ctx.capture('apercu-dossier');
    });

    await t.verifier('aller du dossier à son aperçu : il reste ; taper dans le champ filtre la liste ; Entrée affiche l’onglet, dossier toujours replié', async () => {
      const champ = panneau.locator('.fp-search');
      const c = await ctx.centre(champ);
      await shell.mouse.move(c.x, c.y, { steps: 6 });
      await sleep(350); // plus long que le délai de grâce : le panneau ne s'est pas refermé
      assert.equal(await panneau.count(), 1, 'le panneau est resté sous le pointeur');
      await shell.mouse.click(c.x, c.y);
      await shell.keyboard.type('page c', { delay: 10 });
      await jusqua(async () => (await panneau.locator('.fp-name').allTextContents()).join() === 'Page C', 'liste filtrée');
      assert.equal(await panneau.locator('.fp-row.sel').count(), 1, 'premier résultat sélectionné');
      await shell.keyboard.press('Enter');
      await jusqua(async () => (await actif()) === ctx.url('/c'), 'Page C affichée');
      await jusqua(async () => (await shell.locator('#folder-peek').count()) === 0, 'aperçu effacé');
      assert.equal(await shell.locator('#pinned .folder.open').count(), 0, 'le dossier reste replié');
    });

    await t.verifier('clic sur une ligne de l’aperçu : l’onglet s’affiche ; pointeur parti : l’aperçu s’efface ; clic sur le dossier : il s’ouvre, sans aperçu', async () => {
      await shell.mouse.move(700, 500, { steps: 3 });
      const c = await ctx.centre(tete);
      await shell.mouse.move(c.x, c.y, { steps: 4 });
      await jusqua(async () => (await panneau.count()) === 1, 'aperçu du dossier');
      await ctx.clic(shell, panneau.locator('.fp-row', { hasText: 'Page B' }));
      await jusqua(async () => (await actif()) === ctx.url('/b'), 'Page B affichée');
      await jusqua(async () => (await shell.locator('#folder-peek').count()) === 0, 'aperçu effacé après le clic');
      // De nouveau au-dessus du dossier, puis le pointeur s'en va vers la page.
      await shell.mouse.move(700, 500, { steps: 3 });
      await shell.mouse.move(c.x, c.y, { steps: 4 });
      await jusqua(async () => (await panneau.count()) === 1, 'aperçu de nouveau');
      await shell.mouse.move(700, 500, { steps: 6 });
      await jusqua(async () => (await shell.locator('#folder-peek').count()) === 0, 'aperçu effacé quand le pointeur s’en va');
      // Un clic sur le dossier l'ouvre ; survolé ouvert, il ne montre pas d'aperçu.
      await ctx.clic(shell, tete);
      await jusqua(async () => (await shell.locator('#pinned .folder.open').count()) === 1, 'dossier ouvert');
      await sleep(800);
      assert.equal(await shell.locator('#folder-peek').count(), 0, 'pas d’aperçu pour un dossier ouvert');
      await ctx.clic(shell, tete);
      await jusqua(async () => (await shell.locator('#pinned .folder.open').count()) === 0, 'dossier replié');
      await shell.mouse.move(700, 500, { steps: 3 });
    });

    // --- Bulle et rebond du glisser vers une vue scindée (ANI-12, SCI-17) -------------------
    await t.verifier('glisser « Page D » au-dessus de la page : l’onglet devient une bulle à son nom au milieu du côté visé ; lâché, la vue est scindée et la bulle rebondit, puis la zone se retire', async () => {
      await ctx.clic(shell, ctx.ligne('Page A'));
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/a'), 'Page A affichée');
      const e = await ctx.principal(({ w }) => w.contentRect());
      let vu = null;
      await ctx.glisser(await ctx.centre(ctx.ligne('Page D')), () => ({ x: e.x + e.width * 0.75, y: e.y + e.height / 2 }), {
        avantLacher: async () => {
          const zone = await ctx.attendrePage('overlay.html#drop');
          vu = await jusqua(() => zone.evaluate(() => {
            const b = document.querySelector('#drop.over .drop-bubble');
            if (!b || getComputedStyle(b).opacity !== '1') return null;
            const l = document.getElementById('drop-label').getBoundingClientRect();
            const r = b.getBoundingClientRect();
            return { nom: b.querySelector('.drop-name').textContent, dx: Math.round((r.left + r.right) / 2 - (l.left + l.right) / 2), dy: Math.round((r.top + r.bottom) / 2 - (l.top + l.bottom) / 2), gauche: Math.round(l.left), largeur: innerWidth };
          }), 'bulle de l’onglet dans la zone');
        },
      });
      assert.equal(vu.nom, 'Page D');
      assert.ok(Math.abs(vu.dx) <= 2 && Math.abs(vu.dy) <= 2 && vu.gauche >= vu.largeur / 2 - 2, 'bulle au milieu de la moitié droite : ' + JSON.stringify(vu));
      const zone = await ctx.attendrePage('overlay.html#drop');
      const visible = () => ctx.principal(({ w }) => !!w.dropView && w.dropView.getVisible());
      if (!reduit) {
        // Le rebond se lit pendant qu'il joue ; il est bref : on l'accepte déjà fini si la zone est déjà partie.
        const rebond = await zone.evaluate(() => { const d = document.getElementById('drop'); const b = d.querySelector('.drop-bubble'); return { fini: d.classList.contains('done'), anim: b ? getComputedStyle(b).animationName : '' }; });
        assert.ok((rebond.fini && rebond.anim === 'drop-bounce') || !(await visible()), 'rebond de la bulle : ' + JSON.stringify(rebond));
      }
      await jusqua(async () => (await ctx.principal(({ w }) => w.visibleIds().map((id) => w.data.tabs[id].title).join())) === 'Page A,Page D', 'vue scindée A | D');
      await jusqua(async () => !(await visible()), 'zone de dépôt retirée');
      // La page du nouveau volet reçoit de nouveau les clics.
      const page = ctx.onglet('/d');
      await page.evaluate(() => { window.__clics = 0; document.addEventListener('mousedown', () => { window.__clics += 1; }, true); });
      await page.mouse.click(40, 40);
      assert.equal(await page.evaluate(() => window.__clics), 1);
      await ctx.menu('view.closeSplit');
    });
  },
};
