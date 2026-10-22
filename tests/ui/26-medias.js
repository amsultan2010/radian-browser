// Lecteurs miniatures de la barre latérale, à la souris : commandes révélées au
// survol, lecture / pause, recherche en glissant (fine quand le pointeur monte),
// croix, titre qui défile, cadence — et « Réduire les animations ».
// Le son des pages d'essai est une note à −58 dB, inaudible.
const assert = require('node:assert/strict');
const medias = require('../medias');

// Image PNG d'un point (pochette annoncée par la page d'essai).
const POINT = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

module.exports = {
  nom: 'Lecteurs miniatures',
  async test(ctx, t) {
    const { shell, jusqua, sleep } = ctx;
    const serveur = await medias.serve(POINT);
    const base = `http://127.0.0.1:${serveur.address().port}`;
    const reduit = await shell.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    const dansPage = (id, code) => ctx.principal(({ win }, a) => win.live.get(a.id).wc.executeJavaScript(a.code, true), { id, code });
    const temps = (id) => dansPage(id, 'document.getElementById("a").currentTime');
    const carte = (id) => shell.locator(`#media .mp[data-id="${id}"]`);
    // La carte arrive en glissant : on ne la mesure qu'une fois posée.
    const posee = (id) => jusqua(() => carte(id).evaluate((el) => !el.getAnimations().some((a) => a.animationName === 'mp-in' && a.playState === 'running')), 'carte posée');
    try {
      await ctx.ouvrir('/a', 'Page A');
      // Un onglet qui joue, puis quitté : son lecteur apparaît.
      const jouer = async (chemin, titre) => {
        const id = await ctx.principal(({ w }, u) => w.newTab(u).id, base + chemin);
        await jusqua(() => ctx.principal(({ w, win }, i) => !!win.live.get(i) && !win.live.get(i).wc.isLoading() && /^Piste/.test(w.data.tabs[i].title), id), 'page ' + chemin);
        await dansPage(id, `start(${JSON.stringify(titre)})`);
        return id;
      };
      const p1 = await jouer('/piste1', medias.HOSTILE);
      const audible = await jusqua(() => ctx.principal(({ win }, i) => win.live.get(i).wc.isCurrentlyAudible(), p1), 'onglet audible', 8000).then(() => true, () => false);
      if (!audible) {
        if (ctx.milieu.vivant) throw new Error('Délai dépassé : onglet audible');
        t.ignorer('lecteurs miniatures à la souris', ctx.milieu.raison + ' : aucun son joué');
        return;
      }
      await ctx.clic(shell, ctx.ligne('Page A'));
      await jusqua(async () => (await carte(p1).count()) === 1 && (await carte(p1).locator('.mp-bar').isVisible()), 'lecteur dans la barre');
      await shell.mouse.move(700, 400);

      await t.verifier('le lecteur apparaît au bas de la barre : pochette, titre posé comme du texte, artiste', async () => {
        await jusqua(() => carte(p1).locator('.mp-art.cover img').count(), 'pochette');
        await posee(p1);
        const vu = await carte(p1).evaluate((el) => ({ titre: el.querySelector('.mp-title').textContent, balises: el.querySelector('.mp-title span').childElementCount, sub: el.querySelector('.mp-sub').textContent, img: el.querySelector('.mp-art img').src.slice(0, 22), pwned: window.pwned === 1, bas: Math.round(document.getElementById('bottom').getBoundingClientRect().top - el.getBoundingClientRect().bottom) }));
        assert.equal(vu.titre, medias.HOSTILE.slice(0, 160));
        assert.equal(vu.balises, 0, 'aucune balise née du titre');
        assert.equal(vu.pwned, false);
        assert.equal(vu.sub, 'Artiste 1');
        assert.equal(vu.img, 'data:image/png;base64,');
        assert.ok(vu.bas >= 0 && vu.bas < 60, 'juste au-dessus de la rangée du bas : ' + vu.bas);
      });

      const animer = (titre, fn) => (reduit ? t.ignorer(titre, '« Réduire les animations » est actif') : t.avecEcran('verifier', titre, fn));
      await animer('titre trop long : il défile un aller-retour par une transformation seule, sans mise en page ; l’avancement progresse par pas, sans animation', async () => {
        // Le défilement se repose après un aller-retour ; le pointeur qui quitte la carte le relance.
        await carte(p1).dispatchEvent('pointerleave');
        const a = await jusqua(() => carte(p1).evaluate((el) => {
          const span = el.querySelector('.mp-title.run span');
          if (!span) return null;
          const an = span.getAnimations()[0];
          const fill = el.querySelector('.mp-bar i');
          const tr = fill.getAnimations().map((x) => x.transitionProperty);
          return an ? { nom: an.animationName, etat: an.playState, tours: an.effect.getTiming().iterations, props: [...new Set(an.effect.getKeyframes().flatMap((k) => Object.keys(k)))].filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)), duree: an.effect.getTiming().duration, decalage: parseFloat(getComputedStyle(span.parentElement).getPropertyValue('--shift')), barre: tr } : null;
        }), 'titre qui défile');
        assert.equal(a.nom, 'mp-marquee');
        assert.equal(a.etat, 'running');
        assert.deepEqual(a.props, ['transform']);
        assert.ok(a.decalage < -40 && a.duree > 4000, JSON.stringify(a));
        assert.equal(a.tours, 2, 'un aller-retour, pas un défilement sans fin');
        assert.deepEqual(a.barre, [], 'avancement : aucune transition en cours (pas posés par minuterie)');
        const x0 = await carte(p1).locator('.mp-bar i').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
        await jusqua(async () => (await carte(p1).locator('.mp-bar i').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a)) > x0, 'avancement qui progresse');
        const cdp = await shell.context().newCDPSession(shell);
        await cdp.send('Performance.enable');
        const compteurs = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
        await shell.evaluate(() => { const p = (window.__img = { t: [], on: true }); const f = () => { p.t.push(performance.now()); if (p.on) requestAnimationFrame(f); }; requestAnimationFrame(f); });
        const avant = await compteurs();
        await sleep(2500); // deux réponses de la page au moins arrivent pendant la mesure
        const apres = await compteurs();
        const t0 = await shell.evaluate(() => { window.__img.on = false; return window.__img.t; });
        const ecarts = t0.slice(1).map((x, i) => x - t0[i]).sort((x, y) => x - y);
        const m = { misesEnPage: apres.LayoutCount - avant.LayoutCount, images: ecarts.length, mediane: Math.round(ecarts[Math.floor(ecarts.length / 2)] * 10) / 10, p95: Math.round(ecarts[Math.floor(ecarts.length * 0.95)] * 10) / 10 };
        console.log(`    lecteur (titre qui défile + avancement, 2,5 s de lecture) : ${m.images} images, médiane ${m.mediane} ms, 95e centile ${m.p95} ms, ${m.misesEnPage} mise(s) en page`);
        assert.ok(m.misesEnPage <= 1, 'aucune mise en page pendant la lecture : ' + m.misesEnPage);
        assert.ok(m.mediane < 34, 'cadence médiane : ' + m.mediane + ' ms');
        await cdp.detach();
      });

      await t.verifier('survol : les commandes prennent la place du titre, la carte ne change pas de taille', async () => {
        const avant = await carte(p1).boundingBox();
        await jusqua(async () => { await carte(p1).locator('.mp-art').hover(); await sleep(60); return carte(p1).evaluate((el) => getComputedStyle(el.querySelector('.mp-ctl')).opacity === '1' && getComputedStyle(el.querySelector('.mp-text')).opacity === '0' && getComputedStyle(el.querySelector('.mp-x')).opacity === '1'); }, 'commandes révélées');
        assert.deepEqual(await carte(p1).boundingBox(), avant);
        const boutons = await carte(p1).locator('.mp-ctl .ib:visible').evaluateAll((els) => els.map((b) => b.dataset.key));
        assert.deepEqual(boutons, ['media.prev', 'media.back', 'media.forward', 'media.next', 'media.mute']);
        assert.equal(await carte(p1).locator('.mp-play').getAttribute('title'), await ctx.texte('media.pause'));
      });

      await t.verifier('clic sur pause puis lecture : la page obéit, l’icône suit', async () => {
        await ctx.clic(shell, carte(p1).locator('.mp-play'));
        await jusqua(async () => (await dansPage(p1, 'document.getElementById("a").paused')) === true, 'page en pause');
        await jusqua(async () => (await carte(p1).locator('.mp-play use').getAttribute('href')) === '#i-play', 'icône lecture');
        await ctx.clic(shell, carte(p1).locator('.mp-play'));
        await jusqua(async () => (await dansPage(p1, 'document.getElementById("a").paused')) === false, 'page en lecture');
        await jusqua(async () => (await carte(p1).locator('.mp-play use').getAttribute('href')) === '#i-pause', 'icône pause');
      });

      await t.verifier('+15 s, piste suivante : les boutons agissent sur la page', async () => {
        await dansPage(p1, 'document.getElementById("a").currentTime = 5');
        await ctx.clic(shell, carte(p1).locator('.mp-fwd'), { survol: carte(p1).locator('.mp-art') });
        await jusqua(async () => { const x = await temps(p1); return x >= 20 && x < 30; }, 'avance de 15 s');
        await ctx.clic(shell, carte(p1).locator('.mp-next'), { survol: carte(p1).locator('.mp-art') });
        await jusqua(async () => (await dansPage(p1, 'calls.join()')) === 'next', 'gestionnaire « suivant » de la page appelé');
      });

      await t.verifier('volume de l’onglet : défiler sur le haut-parleur le baisse, le tirer vers le haut le remonte — sans couper le son', async () => {
        const son = carte(p1).locator('.mp-mute');
        const vol = () => dansPage(p1, 'document.getElementById("a").volume');
        assert.equal(await vol(), 1);
        await jusqua(async () => { await carte(p1).locator('.mp-art').hover(); await sleep(60); return son.isVisible(); }, 'commandes révélées');
        await son.hover();
        for (let i = 0; i < 4; i++) { await shell.mouse.wheel(0, 60); await sleep(90); }
        await jusqua(async () => { const v = await vol(); return v > 0.4 && v < 0.6; }, 'volume baissé dans la page');
        const bas = await vol();
        // Le niveau se lit sous l'icône : un trait mis à l'échelle (transformation seule).
        const trait = await son.evaluate((el) => ({ vol: el.dataset.vol, low: el.classList.contains('low'), sx: new DOMMatrix(getComputedStyle(el, '::after').transform).a, op: getComputedStyle(el, '::after').opacity }));
        assert.equal(Number(trait.vol), Math.round(bas * 100));
        assert.equal(trait.low, true);
        assert.ok(Math.abs(trait.sx - bas) < 0.06 && Number(trait.op) > 0.9, JSON.stringify(trait));
        assert.match(await son.getAttribute('title'), /volume/);
        // Tirer vers le haut : le volume remonte ; le relâchement n'est pas un clic (le son n'est pas coupé).
        const b = await son.boundingBox();
        await shell.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        await shell.mouse.down();
        await shell.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - 60, { steps: 6 });
        await sleep(80);
        await shell.mouse.up();
        await jusqua(async () => (await vol()) === 1, 'volume remonté dans la page');
        await sleep(150);
        assert.equal(await ctx.principal(({ w }, i) => !!w.data.tabs[i].muted, p1), false, 'le relâchement du glisser n’a pas coupé le son');
        assert.equal(await son.evaluate((el) => el.classList.contains('low')), false);
      });

      await t.verifier('glisser sur la barre d’avancement : recherche ; pointeur remonté : recherche fine', async () => {
        const b = await carte(p1).locator('.mp-bar').boundingBox();
        const y = b.y + b.height - 4;
        await shell.mouse.move(b.x + b.width * 0.2, y);
        await shell.mouse.down();
        await shell.mouse.move(b.x + b.width * 0.5, y, { steps: 6 });
        assert.equal(await carte(p1).evaluate((el) => el.classList.contains('scrub') && !el.classList.contains('fine')), true, 'recherche en cours, pas fine');
        const large = await carte(p1).locator('.mp-bar i').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
        assert.ok(Math.abs(large - 0.5) < 0.03, 'la barre suit le pointeur : ' + large);
        // Le pointeur monte de 150 px : la vitesse tombe à un cinquième.
        await shell.mouse.move(b.x + b.width * 0.5, y - 150, { steps: 4 });
        await shell.mouse.move(b.x + b.width * 1.0, y - 150, { steps: 8 });
        const fin = await carte(p1).evaluate((el) => ({ fine: el.classList.contains('fine'), v: Number(el.dataset.fine), a: new DOMMatrix(getComputedStyle(el.querySelector('.mp-bar i')).transform).a }));
        assert.equal(fin.fine, true);
        assert.ok(fin.v > 0.15 && fin.v < 0.25, 'vitesse divisée par cinq environ : ' + fin.v);
        assert.ok(fin.a > 0.57 && fin.a < 0.63, 'un demi-trajet à vitesse fine : +10 % : ' + fin.a);
        await shell.mouse.up();
        await jusqua(async () => { const x = await temps(p1); return x >= 34 && x < 42; }, 'page placée vers 36 s');
        assert.equal(await carte(p1).evaluate((el) => el.classList.contains('scrub')), false);
      });

      const p2 = await jouer('/piste2', 'Deuxième morceau');
      await jusqua(() => ctx.principal(({ win }, i) => win.live.get(i).wc.isCurrentlyAudible(), p2), 'second onglet audible');
      await ctx.clic(shell, ctx.ligne('Page A'));
      await animer('second onglet qui joue : sa carte arrive au-dessus, en glissant (transformation et opacité)', async () => {
        await ctx.vitesseAnimations(0.2);
        try {
          // (La carte est née au clic ci-dessus : on en fait naître une autre pour voir l'entrée.)
          await ctx.principal(({ w, win }, i) => { win.media.drop(w, i); win.OrbeWindow.pushAll(); }, p2);
          await jusqua(async () => (await carte(p2).count()) === 0, 'carte retirée');
          await ctx.principal(({ w, win }, i) => { win.media.add(w, i); win.OrbeWindow.pushAll(); }, p2);
          const a = await jusqua(() => carte(p2).evaluate((el) => { const an = el.getAnimations().find((x) => x.animationName === 'mp-in'); return an && an.playState === 'running' ? { props: [...new Set(an.effect.getKeyframes().flatMap((k) => Object.keys(k)))].filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)).sort(), duree: an.effect.getTiming().duration } : null; }), 'entrée de la carte');
          assert.deepEqual(a.props, ['opacity', 'transform']);
          assert.equal(a.duree, 360);
        } finally { await ctx.vitesseAnimations(1); }
      });
      await t.verifier('deux lecteurs empilés, le plus récent en haut', async () => {
        await jusqua(async () => (await shell.locator('#media .mp:not(.out)').evaluateAll((els) => els.map((el) => el.dataset.id))).join() === [p2, p1].join(), 'ordre des cartes');
        await posee(p2);
        const [h, b] = [await carte(p2).boundingBox(), await carte(p1).boundingBox()];
        assert.ok(h.y + h.height <= b.y, 'la plus récente est au-dessus');
      });

      await t.verifier('la croix : la lecture s’arrête, la carte s’en va, l’onglet reste', async () => {
        await ctx.clic(shell, carte(p2).locator('.mp-x'), { survol: carte(p2).locator('.mp-art') });
        await jusqua(async () => (await carte(p2).count()) === 0, 'carte retirée');
        assert.equal(await dansPage(p2, 'document.getElementById("a").paused'), true);
        assert.ok((await ctx.titres()).includes('Piste 2'));
      });

      await t.verifier('« Réduire les animations » : le titre ne défile plus', async () => {
        await shell.emulateMedia({ reducedMotion: 'reduce' });
        try {
          const d = await carte(p1).evaluate((el) => { const an = el.querySelector('.mp-title span').getAnimations()[0]; return an ? an.effect.getComputedTiming().activeDuration : 0; });
          assert.ok(d < 1, 'durée du défilement : ' + d);
        } finally { await shell.emulateMedia({ reducedMotion: null }); }
      });

      await t.verifier('clic sur la pochette : retour à l’onglet, le lecteur disparaît', async () => {
        await ctx.clic(shell, carte(p1).locator('.mp-art'));
        await jusqua(async () => (await ctx.etat()).actif === p1, 'onglet affiché');
        await jusqua(async () => (await shell.locator('#media .mp').count()) === 0 && (await shell.locator('#media').isHidden()), 'plus de lecteur');
      });
    } finally {
      serveur.close();
      if (serveur.closeAllConnections) serveur.closeAllConnections();
    }
  },
};
