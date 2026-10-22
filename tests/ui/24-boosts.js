// Boosts : l'éditeur d'un site (nuancier, curseurs, police, Zap, CSS, JavaScript),
// la case du centre de contrôle et la liste de tous les Boosts — à la souris et au clavier.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Boosts',
  async test(ctx, t) {
    const { jusqua } = ctx;
    const page = await ctx.ouvrir('/a', 'Page A');
    const style = (sel, prop) => page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [sel, prop]);
    const boost = () => ctx.principal(({ req }, hote) => { const b = req('boosts.js'); return b.has(hote) ? b.get(hote) : null; }, ctx.hote);
    let ed = null;

    await t.verifier('menu Présentation → « Modifier le Boost de ce site » : l’éditeur s’ouvre sur ce site', async () => {
      await ctx.menu('boost.edit');
      ed = await ctx.attendrePage('boost.html');
      ed.setDefaultTimeout(6000);
      await jusqua(() => ed.evaluate(() => !document.getElementById('editor').hidden), 'éditeur affiché');
      assert.equal(await ed.locator('#host').textContent(), 'Boost · ' + ctx.hote);
    });

    await t.verifier('nuancier : une pastille colore la page ; « aucune couleur » la rend', async () => {
      await ed.locator('#swatches .dot').nth(6).click();
      await jusqua(async () => (await style('body', 'backgroundColor')) === 'rgb(96, 165, 250)', 'fond coloré');
      assert.equal((await boost()).look.color, '#60a5fa');
      assert.equal(await ed.locator('#swatches .dot.on').count(), 1);
      await ed.locator('#swatches .dot').nth(0).click();
      await jusqua(async () => (await style('body', 'backgroundColor')) === 'rgba(0, 0, 0, 0)', 'fond rendu');
    });

    await t.verifier('inverser la luminosité, curseur de contraste au clavier, remise à zéro', async () => {
      await ed.locator('#invert').click();
      await jusqua(async () => /invert\(1\)/.test(await style('html', 'filter')), 'luminosité inversée');
      await ed.locator('#contrast').focus();
      await ed.keyboard.press('ArrowRight');
      await ed.keyboard.press('ArrowRight');
      await jusqua(async () => /contrast\(1\.1\)/.test(await style('html', 'filter')), 'contraste à 110 %');
      assert.equal(await ed.locator('#contrast-v').textContent(), '110 %');
      await ed.locator('#reset-look').click();
      await jusqua(async () => (await style('html', 'filter')) === 'none', 'apparence remise à zéro');
      assert.equal(await boost(), null, 'plus rien à garder : le Boost disparaît');
    });

    await t.verifier('police, taille et casse du texte', async () => {
      await ed.locator('#font').selectOption('mono');
      await jusqua(async () => /Menlo|monospace/.test(await style('p', 'fontFamily')), 'police à chasse fixe');
      await ed.locator('#case').selectOption('upper');
      await jusqua(async () => (await style('p', 'textTransform')) === 'uppercase', 'majuscules');
      await ed.locator('#size').focus();
      await ed.keyboard.press('ArrowRight');
      await jusqua(async () => (await style('html', 'zoom')) === '1.05', 'taille à 105 %');
    });

    await t.verifier('CSS tapé au clavier : appliqué en direct', async () => {
      await ed.locator('#css').click();
      await ed.keyboard.type('h1 { letter-spacing: 7px }', { delay: 5 });
      await jusqua(async () => (await style('h1', 'letterSpacing')) === '7px', 'CSS appliqué');
    });

    await t.verifier('Zap : cliquer un élément de la page le masque ; « × » le rétablit', async () => {
      await ed.locator('#zap').click();
      await jusqua(() => page.evaluate(() => [...document.documentElement.children].some((n) => n.tagName === 'DIV' && n.style.zIndex === '2147483647')), 'choix d’un élément en cours');
      const b = await page.locator('h1').boundingBox();
      await page.mouse.move(b.x + 20, b.y + b.height / 2);
      await page.mouse.click(b.x + 20, b.y + b.height / 2);
      await jusqua(async () => (await style('h1', 'display')) === 'none', 'élément masqué');
      await jusqua(async () => (await ed.locator('#zaps .zap').count()) === 1, 'élément listé dans l’éditeur');
      assert.deepEqual((await boost()).zaps, ['body > h1']);
      await ed.locator('#zaps .zap button').click();
      await jusqua(async () => (await style('h1', 'display')) === 'block', 'élément rétabli');
    });

    await t.verifier('JavaScript : case grisée tant que le réglage est coupé ; une fois permis, le script s’exécute au rechargement', async () => {
      assert.equal(await ed.locator('#js-on').isDisabled(), true);
      assert.equal(await ed.locator('#js-off').isVisible(), true);
      await ed.locator('#js').click();
      await ed.keyboard.type('document.title = "Titre boosté"', { delay: 5 });
      await jusqua(async () => ((await boost()) || {}).js === 'document.title = "Titre boosté"', 'script enregistré');
      await ed.locator('#reload').click();
      await ctx.sleep(600);
      assert.equal(await page.title(), 'Page A', 'réglage coupé : rien ne s’exécute');
      // Réglage « Autoriser le JavaScript des Boosts » (fenêtre des réglages : tests/ui/19-reglages.js).
      await ctx.principal(({ req }) => req('commands.js').setSetting('boostsJs', true));
      await ed.evaluate(() => O.send('boost:get').then(draw));
      await jusqua(async () => !(await ed.locator('#js-on').isDisabled()), 'case disponible');
      await ed.locator('#js-on').click();
      await jusqua(async () => (await boost()).jsOn === true, 'script permis pour ce site');
      await ed.locator('#reload').click();
      await jusqua(async () => (await page.title()) === 'Titre boosté', 'script exécuté au rechargement');
      await ed.locator('#js-on').click();
      await ed.locator('#reload').click();
      await jusqua(async () => (await page.title()) === 'Page A', 'script retiré au rechargement');
    });

    await t.verifier('liste « Tous les Boosts » : couper, puis supprimer le Boost du site', async () => {
      await ed.locator('#all').click();
      await jusqua(async () => ed.url().endsWith('?list') && (await ed.locator('#list-items .item').count()) === 1, 'liste affichée');
      assert.match(await ed.locator('#list-items .item .site').textContent(), new RegExp(ctx.hote.replace(/\./g, '\\.')));
      await ed.locator('#list-items .item input[type=checkbox]').click();
      await jusqua(async () => (await style('h1', 'letterSpacing')) !== '7px', 'Boost coupé : son CSS est retiré de la page');
      assert.equal((await boost()).enabled, false);
      await ed.locator('#list-items .item [data-act="delete"]').click();
      await jusqua(async () => (await boost()) === null, 'Boost supprimé');
      await jusqua(async () => (await ed.locator('#list-empty').isVisible()), 'liste vide');
    });
  },
};
