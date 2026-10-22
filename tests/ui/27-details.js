// Petits mouvements de la barre latérale : reflet du premier affichage, fichier
// téléchargé qui tombe dans l'icône de la Bibliothèque (plusieurs à la fois),
// dossier qui « avale » ce qu'on y dépose. Transformations et opacité seulement,
// cadence mesurée, rien quand « Réduire les animations » est actif.
const assert = require('node:assert/strict');

const PROPS = `(a) => [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)))].filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)).sort()`;

module.exports = {
  nom: 'Petits mouvements',
  async test(ctx, t) {
    const { shell, jusqua, sleep } = ctx;
    const reduit = await shell.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    const animer = (titre, fn) => (reduit ? t.ignorer(titre, '« Réduire les animations » est actif') : t.avecEcran('verifier', titre, fn));
    const cdp = await shell.context().newCDPSession(shell);
    await cdp.send('Performance.enable');
    const compteurs = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    const mesurer = async (ms) => {
      await shell.evaluate(() => { const p = (window.__img = { t: [], on: true }); const f = () => { p.t.push(performance.now()); if (p.on) requestAnimationFrame(f); }; requestAnimationFrame(f); });
      const avant = await compteurs();
      await sleep(ms);
      const apres = await compteurs();
      const t0 = await shell.evaluate(() => { window.__img.on = false; return window.__img.t; });
      const ecarts = t0.slice(1).map((x, i) => x - t0[i]).sort((a, b) => a - b);
      return { misesEnPage: apres.LayoutCount - avant.LayoutCount, images: ecarts.length, mediane: Math.round(ecarts[Math.floor(ecarts.length / 2)] * 10) / 10, p95: Math.round(ecarts[Math.floor(ecarts.length * 0.95)] * 10) / 10 };
    };
    const commencer = (n) => ctx.principal(({ win }, k) => { for (let i = 0; i < k; i++) win.noteDownload('start', { id: 'ui-' + Date.now() + '-' + i, state: 'progressing' }, null); win.OrbeWindow.pushAll(); }, n);

    await t.verifier('premier affichage : le reflet a traversé la barre latérale une fois, et n’y est plus', async () => {
      if (reduit) return assert.equal(await shell.evaluate(() => document.documentElement.dataset.shimmer), undefined);
      await jusqua(() => shell.evaluate(() => document.documentElement.dataset.shimmer === '1' && !document.getElementById('shimmer')), 'reflet joué puis retiré', 5000);
      return undefined;
    });

    await animer('reflet : une bande qui glisse (transformation et opacité), 900 ms, sans mise en page', async () => {
      await ctx.vitesseAnimations(0.25);
      try {
        await shell.evaluate(() => fxStart());
        const a = await jusqua(() => shell.evaluate(`(() => { const el = document.querySelector('#shimmer > i'); const a = el && el.getAnimations()[0]; return a ? { nom: a.animationName, props: (${PROPS})(a), duree: a.effect.getTiming().duration, clic: getComputedStyle(el.parentElement).pointerEvents } : null; })()`), 'reflet en cours');
        assert.deepEqual(a, { nom: 'shimmer', props: ['opacity', 'transform'], duree: 900, clic: 'none' });
        const m = await mesurer(700);
        console.log(`    reflet : ${m.images} images, médiane ${m.mediane} ms, 95e centile ${m.p95} ms, ${m.misesEnPage} mise(s) en page`);
        assert.ok(m.misesEnPage <= 1, 'mises en page pendant le reflet : ' + m.misesEnPage);
        assert.ok(m.mediane < 34, 'cadence médiane : ' + m.mediane);
      } finally { await ctx.vitesseAnimations(1); }
      await jusqua(() => shell.evaluate(() => !document.getElementById('shimmer')), 'reflet retiré', 5000);
    });

    await animer('deux téléchargements commencent : deux fichiers tombent l’un après l’autre dans l’icône de la Bibliothèque, qui rebondit', async () => {
      await ctx.vitesseAnimations(0.25);
      try {
        await commencer(2);
        const a = await jusqua(() => shell.evaluate(`(() => { const els = [...document.querySelectorAll('#b-library .dl-drop')]; if (els.length !== 2) return null; return els.map((el) => { const a = el.getAnimations()[0]; return a ? { nom: a.animationName, props: (${PROPS})(a), duree: a.effect.getTiming().duration, retard: a.effect.getTiming().delay } : null; }); })()`), 'deux fichiers en vol');
        assert.deepEqual(a, [{ nom: 'dl-drop', props: ['opacity', 'transform'], duree: 560, retard: 0 }, { nom: 'dl-drop', props: ['opacity', 'transform'], duree: 560, retard: 110 }]);
        const m = await mesurer(700);
        console.log(`    fichier qui tombe : ${m.images} images, médiane ${m.mediane} ms, 95e centile ${m.p95} ms, ${m.misesEnPage} mise(s) en page`);
        assert.ok(m.misesEnPage <= 1, 'mises en page pendant la chute : ' + m.misesEnPage);
        assert.ok(m.mediane < 34, 'cadence médiane : ' + m.mediane);
        await jusqua(() => shell.evaluate(() => document.getElementById('b-library').classList.contains('gulp') && (document.querySelector('#b-library > svg.i').getAnimations()[0] || {}).animationName === 'dl-gulp'), 'rebond de l’icône', 8000);
      } finally { await ctx.vitesseAnimations(1); }
      await jusqua(() => shell.evaluate(() => !document.querySelector('#b-library .dl-drop')), 'fichiers retirés', 8000);
    });

    await t.verifier('« Réduire les animations » : rien ne tombe, rien ne brille', async () => {
      await shell.emulateMedia({ reducedMotion: 'reduce' });
      try {
        await commencer(1);
        await shell.evaluate(() => fxStart());
        await sleep(200);
        assert.equal(await shell.evaluate(() => document.querySelectorAll('.dl-drop, #shimmer').length), 0);
      } finally { await shell.emulateMedia({ reducedMotion: null }); }
    });

    // Dépôt dans un dossier.
    await ctx.ouvrir('/a', 'Page A');
    await ctx.menu('tabs.newFolder');
    await jusqua(() => shell.locator('#pinned .folder input.rename').count(), 'champ de nom');
    await shell.keyboard.press('Enter');
    const tete = shell.locator('#pinned .folder').first().locator('> .row');
    await animer('un onglet déposé sur un dossier : l’icône du dossier rebondit, sa ligne s’éclaire (transformation et opacité)', async () => {
      // Le dossier vient de naître : ses lignes glissent encore. On attend qu'elles soient posées avant de
      // ralentir les animations, sinon le point de dépôt est relevé sur une ligne en mouvement (dépôt à côté).
      await jusqua(() => shell.evaluate(() => !document.getElementById('scroll').getAnimations({ subtree: true }).some((x) => x.playState === 'running')), 'lignes au repos');
      await ctx.vitesseAnimations(0.2);
      try {
        await ctx.glisser(await ctx.centre(ctx.ligne('Page A', '#today')), () => ctx.centre(tete));
        const a = await jusqua(() => shell.evaluate(`(() => { const f = document.querySelector('#pinned .folder.gulped'); if (!f) return null; const ic = f.querySelector(':scope > .row .ic').getAnimations().find((x) => x.animationName === 'folder-gulp'); const fl = f.querySelector(':scope > .row').getAnimations({ subtree: true }).find((x) => x.animationName === 'folder-flash'); return ic && fl ? { ic: (${PROPS})(ic), fl: (${PROPS})(fl), duree: ic.effect.getTiming().duration } : null; })()`), 'dossier qui avale');
        assert.deepEqual(a, { ic: ['transform'], fl: ['opacity'], duree: 340 });
      } finally { await ctx.vitesseAnimations(1); }
      await jusqua(async () => (await ctx.titres('#pinned .folder .children')).join() === 'Page A', 'A dans le dossier');
      await jusqua(() => shell.evaluate(() => !document.querySelector('.folder.gulped')), 'fin du rebond');
    });
    await cdp.detach();
  },
};
