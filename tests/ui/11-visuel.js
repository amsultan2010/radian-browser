// Mise en page de la barre latérale bien remplie (favoris, épinglés, dossier,
// onglets du jour) : rien ne déborde ni ne se chevauche. Des captures sont
// enregistrées pour une relecture visuelle (dossier indiqué en fin de groupe).
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Mise en page',
  async test(ctx, t) {
    const { shell, jusqua } = ctx;
    const mesures = () => shell.evaluate(() => {
      const side = document.getElementById('sidebar').getBoundingClientRect();
      const rect = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
      const visibles = [...document.querySelectorAll('#sidebar .row, #sidebar .tile, #sidebar .ib, #url, #space-head, #divider, #bottom')]
        .filter((el) => el.getClientRects().length);
      const hors = visibles.filter((el) => { const r = rect(el); return r.l < side.left - 0.5 || r.r > side.right + 0.5; })
        .map((el) => el.id || el.className);
      // Les éléments empilés de la liste ne doivent pas se chevaucher.
      const pile = [...document.querySelectorAll('#fav, #space-head, #pinned > *, #divider, #b-newtab, #today > *')].filter((el) => el.getClientRects().length).map(rect);
      let chevauchements = 0;
      for (let i = 1; i < pile.length; i++) if (pile[i].t < pile[i - 1].b - 0.5) chevauchements += 1;
      const sc = document.getElementById('scroll');
      const bottom = rect(document.getElementById('bottom'));
      return {
        hors,
        chevauchements,
        debordementH: sc.scrollWidth - sc.clientWidth,
        basDeFenetre: Math.round(innerHeight - bottom.b),
        hauteurs: [...new Set([...document.querySelectorAll('#sidebar .row')].filter((el) => el.getClientRects().length).map((el) => Math.round(rect(el).h)))],
        tuiles: [...document.querySelectorAll('#fav .tile')].map((el) => { const r = rect(el); return [Math.round(r.w), Math.round(r.h)]; }),
        icones: [...document.querySelectorAll('#sidebar .row .ic')].filter((el) => el.getClientRects().length).every((el) => Math.round(rect(el).w) === 16),
      };
    });

    for (const c of ['a', 'b', 'c', 'd', 'e']) await ctx.ouvrir('/' + c, 'Page ' + c.toUpperCase());
    await ctx.ouvrir('/long');
    const vers = async (titre, cible, fx = 0.5, fy = 0.5) => ctx.glisser(await ctx.centre(ctx.ligne(titre)), () => ctx.centre(cible, fx, fy));
    await vers('Page A', shell.locator('#fav'));
    await jusqua(async () => (await shell.locator('#fav .tile').count()) === 1, 'favori A');
    await vers('Page B', shell.locator('#fav .tile').first(), 0.9, 0.5);
    await jusqua(async () => (await shell.locator('#fav .tile').count()) === 2, 'favori B');
    await vers('Page C', shell.locator('#pinned'));
    await jusqua(async () => (await ctx.titres('#pinned')).length === 1, 'C épinglé');
    await ctx.menu('tabs.newFolder');
    await jusqua(() => shell.locator('#pinned .folder input.rename').count(), 'champ de nom');
    await shell.keyboard.type('Lectures', { delay: 5 });
    await shell.keyboard.press('Enter');
    await jusqua(async () => (await shell.locator('#pinned .folder > .row .title').textContent()) === 'Lectures', 'dossier nommé');
    await vers('Page D', shell.locator('#pinned .folder > .row'));
    await jusqua(async () => (await ctx.titres('#pinned .folder .children')).length === 1, 'D dans le dossier');
    await shell.mouse.move(700, 500);
    await ctx.sleep(400);

    await t.verifier('barre latérale remplie : rien ne dépasse de la barre', async () => {
      const m = await mesures();
      assert.deepEqual(m.hors, []);
      assert.ok(m.debordementH <= 0, 'pas de défilement horizontal');
    });

    await t.verifier('favoris, épinglés, dossier et onglets du jour ne se chevauchent pas', async () => {
      const m = await mesures();
      assert.equal(m.chevauchements, 0);
      assert.equal(m.hauteurs.length, 1, 'toutes les lignes ont la même hauteur : ' + m.hauteurs.join(', '));
      assert.ok(m.tuiles.length === 2 && m.tuiles.every(([w, h]) => h >= 40 && w >= 52 && w === m.tuiles[0][0] && h === m.tuiles[0][1]), 'tuiles de favoris de même taille : ' + JSON.stringify(m.tuiles));
      assert.equal(m.icones, true, 'icônes de 16 px');
      assert.equal(m.basDeFenetre, 0, 'la rangée du bas touche le bas de la fenêtre');
    });

    await t.verifier('l’onglet actif est mis en évidence, et un seul', async () => {
      assert.equal(await shell.locator('#sidebar .row.tab.active, #sidebar .tile.active').count(), 1);
      const fond = await shell.locator('#sidebar .row.tab.active').evaluate((el) => getComputedStyle(el).backgroundColor);
      assert.notEqual(fond, 'rgba(0, 0, 0, 0)');
    });

    await ctx.capture('visuel-remplie');

    await t.verifier('beaucoup d’onglets : la liste défile verticalement, le haut et le bas restent fixes', async () => {
      for (let i = 0; i < 14; i++) {
        await ctx.nouvelOnglet();
        await ctx.taper(ctx.hote + '/c?n=' + i);
        await ctx.modal.keyboard.press('Meta+Enter');
        await jusqua(async () => !(await ctx.commandeOuverte()), 'barre refermée');
      }
      await jusqua(async () => (await shell.locator('#today .row.tab').count()) === 16, '16 onglets du jour');
      const m = await shell.evaluate(() => {
        const sc = document.getElementById('scroll');
        const r = (id) => document.getElementById(id).getBoundingClientRect();
        return { defile: sc.scrollHeight > sc.clientHeight, haut: r('top').top, url: r('url').bottom, scTop: r('scroll').top, scBottom: r('scroll').bottom, bas: r('bottom').top, fen: innerHeight };
      });
      assert.equal(m.defile, true, 'la liste dépasse et défile');
      assert.equal(m.haut, 0);
      assert.ok(m.scTop >= m.url, 'la liste commence sous la pastille d’adresse');
      assert.ok(m.scBottom <= m.bas + 0.5, 'la liste s’arrête au-dessus de la rangée du bas');
      const c = await ctx.centre(shell.locator('#scroll'));
      await shell.mouse.move(c.x, c.y);
      await shell.mouse.wheel(0, 2000);
      await jusqua(() => shell.evaluate(() => document.getElementById('scroll').scrollTop > 0), 'défilement à la molette');
      const dernier = await shell.locator('#today .row.tab').last().boundingBox();
      assert.ok(dernier.y + dernier.height <= m.bas + 0.5, 'le dernier onglet est visible au-dessus de la rangée du bas');
      const m2 = await mesures();
      assert.deepEqual(m2.hors, []);
    });

    await t.verifier('états pressés : une ligne et une tuile s’enfoncent sous le pointeur et reviennent au ressort', async () => {
      const echelle = (loc) => loc.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
      for (const [nom, loc, fond] of [['ligne', shell.locator('#today .row.tab').last(), 0.985], ['tuile', shell.locator('#fav .tile').first(), 0.95]]) {
        const c = await ctx.centre(loc);
        await shell.mouse.move(c.x, c.y);
        assert.equal(await echelle(loc), 1, nom + ' au repos');
        await shell.mouse.down();
        await jusqua(async () => Math.abs((await echelle(loc)) - fond) < 0.002, nom + ' enfoncée');
        // Le retour se fait sur une courbe de ressort (jeton de base.css), pas sur une durée fixe.
        const retour = await loc.evaluate((el) => getComputedStyle(el).transition);
        await shell.mouse.up();
        await jusqua(async () => (await echelle(loc)) === 1, nom + ' revenue');
        assert.match(await loc.evaluate((el) => getComputedStyle(el).transitionTimingFunction), /linear\(/, nom + ' : courbe de ressort au relâchement (' + retour + ')');
      }
    });

    await ctx.capture('visuel-defilement');
    console.log(`    captures enregistrées dans ${ctx.captures}`);
  },
};
