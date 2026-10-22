// Lignes d'onglets : activer au clic, archiver avec ×, au clic molette, ⌘W,
// rouvrir, bouton « Effacer ».
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Onglets',
  async test(ctx, t) {
    const { shell, jusqua } = ctx;
    const actif = async () => (await shell.locator('#sidebar .row.tab.active .title').allTextContents()).join();

    await ctx.ouvrir('/a', 'Page A');
    await ctx.ouvrir('/b', 'Page B');
    await ctx.ouvrir('/c', 'Page C');

    await t.verifier('les nouveaux onglets s’empilent en haut d’Aujourd’hui, le dernier est actif', async () => {
      assert.deepEqual(await ctx.titres(), ['Page C', 'Page B', 'Page A']);
      assert.equal(await actif(), 'Page C');
    });

    await t.verifier('clic sur une ligne : l’onglet devient actif et sa page passe au premier plan', async () => {
      await ctx.clic(shell, ctx.ligne('Page A'));
      await jusqua(async () => (await actif()) === 'Page A', 'ligne A active');
      const e = await ctx.etat();
      assert.equal(e.actifUrl, ctx.url('/a'));
      assert.equal(await ctx.vueAu(e.vuePage.x + 50, e.vuePage.y + 50), ctx.url('/a'), 'la page A est la vue affichée');
      assert.equal(await shell.textContent('#url-text'), ctx.hote);
      assert.equal(await shell.locator('#sidebar .row.tab.active').count(), 1);
    });

    await t.verifier('la page affichée occupe la zone à droite de la barre latérale', async () => {
      const e = await ctx.etat();
      const sw = (await shell.locator('#sidebar').boundingBox()).width;
      assert.equal(e.vuePage.x, Math.round(sw));
      assert.equal(e.vuePage.y, 10);
      const taille = await shell.evaluate(() => [innerWidth, innerHeight]);
      assert.equal(e.vuePage.x + e.vuePage.width, taille[0] - 10);
      assert.equal(e.vuePage.y + e.vuePage.height, taille[1] - 10);
    });

    await t.verifier('le × n’apparaît qu’au survol de la ligne', async () => {
      const ligne = ctx.ligne('Page B');
      await jusqua(async () => { await shell.mouse.move(600, 600); return !(await ligne.locator('.act.x').isVisible()); }, '× masqué hors survol');
      await jusqua(async () => { await ligne.hover(); return ligne.locator('.act.x').isVisible(); }, '× visible au survol');
    });

    await t.verifier('clic sur × : l’onglet (inactif) est archivé, l’actif ne change pas', async () => {
      const ligne = ctx.ligne('Page B');
      await ctx.clic(shell, ligne.locator('.act.x'), { survol: ligne });
      await jusqua(async () => (await ctx.titres()).join() === 'Page C,Page A', 'ligne B retirée');
      const e = await ctx.etat();
      assert.equal(e.actifUrl, ctx.url('/a'));
      assert.equal(e.archive[0], ctx.url('/b'));
      await jusqua(() => !ctx.onglet('/b'), 'page B déchargée');
    });

    await t.verifier('⇧⌘T (élément de menu) rouvre l’onglet à sa place', async () => {
      await ctx.menu('Shift+Cmd+T');
      await jusqua(async () => (await ctx.titres()).join() === 'Page C,Page B,Page A', 'ligne B revenue au milieu');
      assert.equal(await actif(), 'Page B');
      assert.ok(!(await ctx.etat()).archive.includes(ctx.url('/b')));
    });

    await t.verifier('clic sur × de l’onglet actif : le suivant devient actif', async () => {
      const ligne = ctx.ligne('Page B');
      await ctx.clic(shell, ligne.locator('.act.x'), { survol: ligne });
      await jusqua(async () => (await ctx.titres()).join() === 'Page C,Page A', 'ligne B retirée');
      assert.equal(await actif(), 'Page A');
      assert.equal((await ctx.etat()).actifUrl, ctx.url('/a'));
    });

    await t.verifier('clic molette sur une ligne : l’onglet est archivé', async () => {
      await ctx.clic(shell, ctx.ligne('Page C'), { button: 'middle' });
      await jusqua(async () => (await ctx.titres()).join() === 'Page A', 'ligne C retirée');
      assert.equal((await ctx.etat()).archive[0], ctx.url('/c'));
      assert.equal(await actif(), 'Page A');
    });

    await t.verifier('⌘W (élément de menu) archive l’onglet actif ; sans onglet, l’accueil revient', async () => {
      await ctx.menu('Cmd+W');
      await jusqua(async () => (await ctx.titres()).length === 0, 'plus aucune ligne');
      assert.equal(await shell.evaluate(() => document.body.classList.contains('no-tab')), true);
      assert.equal(await shell.locator('#empty').isVisible(), true);
      assert.equal(await shell.textContent('#url-text'), 'Rechercher ou saisir une adresse…');
      assert.equal((await ctx.etat()).actif, null);
    });

    await ctx.ouvrir('/a', 'Page A');
    await ctx.ouvrir('/b', 'Page B');
    await ctx.ouvrir('/long');
    await ctx.ouvrir('/c', 'Page C');

    await t.verifier('un titre trop long est coupé par des points de suspension, sans déborder', async () => {
      const ligne = shell.locator('#today .row.tab').nth(1);
      const m = await ligne.evaluate((el) => {
        const titre = el.querySelector('.title');
        const side = document.getElementById('sidebar').getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return { coupe: titre.scrollWidth > titre.clientWidth, style: getComputedStyle(titre).textOverflow, dedans: r.right <= side.right && r.left >= side.left, infobulle: el.title };
      });
      assert.equal(m.coupe, true, 'le titre dépasse la place disponible');
      assert.equal(m.style, 'ellipsis');
      assert.equal(m.dedans, true, 'la ligne reste dans la barre latérale');
      assert.match(m.infobulle, /^Un titre de page vraiment très long/);
    });

    await t.verifier('« Effacer » apparaît au survol de la liste et ne garde que l’onglet actif', async () => {
      const bouton = shell.locator('#b-clear');
      assert.equal(await bouton.textContent(), 'Effacer');
      await ctx.ligne('Page B').hover();
      await jusqua(async () => (await bouton.evaluate((el) => getComputedStyle(el).opacity)) === '1', 'bouton visible au survol');
      await ctx.clic(shell, '#b-clear');
      await jusqua(async () => (await ctx.titres()).join() === 'Page C', 'seul l’onglet actif reste');
      assert.equal((await ctx.etat()).archive.length >= 3, true);
      const toast = await ctx.attendrePage('overlay.html#toast');
      await jusqua(async () => (await toast.textContent('#toast')).length > 0, 'notification affichée');
    });

    await t.verifier('sans rien à effacer, « Effacer » reste masqué', async () => {
      await ctx.ligne('Page C').hover();
      await ctx.sleep(200);
      assert.equal(await shell.locator('#b-clear').evaluate((el) => getComputedStyle(el).opacity), '0');
    });

    await ctx.capture('onglets');
  },
};
