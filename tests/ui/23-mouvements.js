// Mouvements : lignes qui glissent quand la liste change (onglet fermé ou ouvert,
// dossier, « Effacer »), lueur de chargement, boutons animés, rebond élastique de
// la liste, balayage de page (précédent / suivant), « Réduire les animations ».
// Chaque mouvement est fait de transformations et d'opacité seulement : on
// vérifie qu'aucune mise en page n'a lieu pendant qu'il se joue, et la cadence.
const assert = require('node:assert/strict');

const PAS = 41; // une ligne (37) et l'écart qui la sépare de la suivante (4)

module.exports = {
  nom: 'Mouvements',
  async test(ctx, t) {
    const { shell, jusqua, sleep } = ctx;
    const today = () => ctx.titres('#today');
    const reduit = await shell.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    // Un mouvement ne se vérifie que s'il est joué : animations actives, et images
    // réellement présentées (écran verrouillé ou en veille : ignoré, avec la raison).
    const animer = (titre, fn) => (reduit ? t.ignorer(titre, '« Réduire les animations » est actif') : t.avecEcran('verifier', titre, fn));
    // Animations en cours sur les lignes : glissements (`flip`), apparition, retrait.
    const enCours = () => shell.evaluate(() => document.getElementById('scroll').getAnimations({ subtree: true }).filter((a) => a.playState === 'running').map((a) => {
      const el = a.effect.target;
      const props = [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)))].filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)).sort();
      return { nom: a.id || a.animationName || a.transitionProperty, ligne: (el.querySelector('.title') || el).textContent.trim() || el.id, props, dy: Math.round(new DOMMatrix(getComputedStyle(el).transform).m42), duree: a.effect.getTiming().duration, courbe: a.effect.getTiming().easing.slice(0, 7), retard: a.effect.getTiming().delay, hors: getComputedStyle(el).position === 'absolute' };
    }));
    const repos = () => jusqua(async () => !(await enCours()).length, 'lignes au repos');
    const hauts = (zone = '#today') => shell.locator(`${zone} .row.tab`).evaluateAll((els) => Object.fromEntries(els.filter((el) => !el.closest('.out')).map((el) => [el.querySelector('.title').textContent, Math.round(el.getBoundingClientRect().top)])));
    // Mesure d'un mouvement : mises en page et cadence pendant qu'il se joue.
    const cdp = await shell.context().newCDPSession(shell);
    await cdp.send('Performance.enable');
    const compteurs = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    const mesurer = async (ms) => {
      await shell.evaluate(() => { const p = (window.__img = { t: [], on: true }); const f = () => { p.t.push(performance.now()); if (p.on) requestAnimationFrame(f); }; requestAnimationFrame(f); }); // horloge réelle : celle des images suit la vitesse des animations
      const avant = await compteurs();
      await sleep(ms);
      const apres = await compteurs();
      const t0 = await shell.evaluate(() => { window.__img.on = false; return window.__img.t; });
      const ecarts = t0.slice(1).map((x, i) => x - t0[i]).sort((a, b) => a - b);
      return { misesEnPage: apres.LayoutCount - avant.LayoutCount, images: ecarts.length, mediane: Math.round(ecarts[Math.floor(ecarts.length / 2)] * 10) / 10, p95: Math.round(ecarts[Math.floor(ecarts.length * 0.95)] * 10) / 10, lentes: ecarts.filter((x) => x > 25).length };
    };
    const fermer = async (titre) => ctx.clic(shell, ctx.ligne(titre).locator('.act.x'), { survol: ctx.ligne(titre) });

    for (const c of ['a', 'b', 'c', 'd', 'e']) await ctx.ouvrir('/' + c, 'Page ' + c.toUpperCase());
    await shell.mouse.move(700, 400);
    await repos();

    await animer('fermer un onglet : la ligne s’efface sur place, les suivantes remontent en glissant — sans mise en page pendant le mouvement', async () => {
      const avant = await hauts();
      await ctx.vitesseAnimations(0.2);
      let pendant;
      try {
        await fermer('Page C');
        // Le pointeur s'écarte : sinon chaque ligne qui passe dessous révèle son bouton de fermeture.
        await shell.mouse.move(700, 400);
        pendant = await jusqua(async () => { const a = await enCours(); return a.some((x) => x.nom === 'flip') && a.some((x) => x.nom === 'row-out') ? a : null; }, 'glissement en cours');
        // Cadence et mises en page mesurées pendant que les lignes glissent (animations cinq fois plus lentes : 1,2 s).
        const m = await mesurer(600);
        console.log(`    fermeture : ${m.images} images, médiane ${m.mediane} ms, 95e centile ${m.p95} ms, ${m.lentes} image(s) de plus de 25 ms, ${m.misesEnPage} mise(s) en page pendant le glissement`);
        assert.ok(m.misesEnPage <= 1, 'pas de mise en page à chaque image pendant le glissement : ' + m.misesEnPage);
        assert.ok(m.mediane < 34, 'cadence médiane : ' + m.mediane + ' ms');
      } finally {
        await ctx.vitesseAnimations(1);
      }
      const sortie = pendant.find((x) => x.nom === 'row-out');
      assert.deepEqual([sortie.ligne, sortie.props, sortie.hors], ['Page C', ['opacity', 'transform'], true], 'la ligne retirée est hors du flux et ne change que d’opacité et d’échelle');
      const glissent = pendant.filter((x) => x.nom === 'flip');
      assert.deepEqual(glissent.map((x) => x.ligne).sort(), ['Page A', 'Page B'], 'seules les lignes du dessous glissent');
      for (const g of glissent) {
        assert.deepEqual(g.props, ['transform']);
        assert.ok(g.dy > 0 && g.dy <= PAS, 'en route depuis un cran plus bas : ' + g.dy);
        assert.equal(g.duree, 240);
        assert.equal(g.courbe, 'linear(', 'courbe de ressort');
      }
      await repos();
      const apres = await hauts();
      assert.deepEqual(await today(), ['Page E', 'Page D', 'Page B', 'Page A']);
      assert.equal(apres['Page B'], avant['Page C'], 'B a pris la place de C');
      assert.equal(apres['Page A'], avant['Page B']);
      assert.equal(await shell.locator('#today .out').count(), 0, 'la ligne retirée a quitté le document');
    });

    await animer('nouvel onglet : la ligne paraît (opacité, échelle) et les autres descendent d’un cran en glissant', async () => {
      const avant = await hauts();
      await ctx.vitesseAnimations(0.2);
      try {
        await ctx.nouvelOnglet();
        await ctx.taper(ctx.hote + '/c');
        await ctx.modal.keyboard.press('Enter');
        const a = await jusqua(async () => { const x = await enCours(); return x.some((y) => y.nom === 'row-in') && x.some((y) => y.nom === 'flip') ? x : null; }, 'entrée en cours');
        const entree = a.find((x) => x.nom === 'row-in');
        assert.deepEqual(entree.props, ['opacity', 'transform'], 'la hauteur de la nouvelle ligne n’est pas animée');
        const glissent = a.filter((x) => x.nom === 'flip');
        assert.deepEqual(glissent.map((x) => x.ligne).sort(), ['Page A', 'Page B', 'Page D', 'Page E']);
        assert.ok(glissent.every((g) => g.dy < 0 && g.dy >= -PAS && g.props.join() === 'transform'), JSON.stringify(glissent.map((g) => g.dy)));
      } finally {
        await ctx.vitesseAnimations(1);
      }
      await jusqua(async () => (await today())[0] === 'Page C', 'Page C en tête');
      await repos();
      const apres = await hauts();
      assert.equal(apres['Page E'], avant['Page E'] + PAS);
      assert.equal(apres['Page C'], avant['Page E']);
    });

    await animer('dossier : l’ouvrir fait paraître son contenu et glisser la suite ; le replier la fait remonter', async () => {
      await ctx.glisser(await ctx.centre(ctx.ligne('Page A')), () => ctx.centre(shell.locator('#pinned')));
      await jusqua(async () => (await ctx.titres('#pinned')).length === 1, 'A épinglé');
      await ctx.menu('tabs.newFolder');
      await jusqua(() => shell.locator('#pinned .folder input.rename').count(), 'champ de nom');
      await shell.keyboard.type('Lectures', { delay: 5 });
      await shell.keyboard.press('Enter');
      await jusqua(async () => (await shell.locator('#pinned .folder > .row .title').textContent()) === 'Lectures', 'dossier nommé');
      await ctx.glisser(await ctx.centre(ctx.ligne('Page B')), () => ctx.centre(shell.locator('#pinned .folder > .row')));
      await jusqua(async () => (await ctx.titres('#pinned .folder .children')).length === 1, 'B dans le dossier');
      await shell.mouse.move(700, 400);
      await repos();
      const tete = shell.locator('#pinned .folder > .row');
      const ouvert = () => shell.evaluate(() => document.querySelector('#pinned .folder').classList.contains('open'));
      const e0 = (await hauts())['Page E'];
      assert.equal(await ouvert(), true);
      await ctx.vitesseAnimations(0.2);
      try {
        await ctx.clic(shell, tete);
        const replie = await jusqua(async () => { const a = await enCours(); return a.some((x) => x.nom === 'flip') ? a : null; }, 'repli en cours');
        assert.ok(replie.filter((x) => x.nom === 'flip').every((x) => x.props.join() === 'transform' && x.dy > 0), 'la suite remonte par transformation : ' + JSON.stringify(replie.map((x) => [x.ligne, x.dy])));
        await ctx.vitesseAnimations(1);
        await repos();
        assert.equal(await ouvert(), false);
        assert.equal((await hauts())['Page E'], e0 - PAS, 'la liste est remontée de la hauteur du contenu (37 + 4)');
        await ctx.vitesseAnimations(0.2);
        await ctx.clic(shell, tete);
        const deplie = await jusqua(async () => { const a = await enCours(); return a.some((x) => x.ligne === 'Page B') ? a : null; }, 'ouverture en cours');
        const contenu = deplie.find((x) => x.ligne === 'Page B');
        assert.deepEqual([contenu.nom, contenu.props], ['flip', ['opacity', 'transform']], 'le contenu paraît en fondu, sans animer de hauteur');
        assert.ok(deplie.some((x) => x.ligne === 'Page E' && x.dy < 0), 'la suite descend en glissant');
      } finally {
        await ctx.vitesseAnimations(1);
      }
      await repos();
      assert.equal((await hauts())['Page E'], e0);
    });

    await animer('« Effacer » : les onglets du jour s’effacent en cascade', async () => {
      // Trois onglets en veille de plus, puis « Effacer » (l'onglet affiché reste).
      await ctx.principal(({ w }) => { for (let i = 0; i < 3; i++) { const tab = w.createTab('http://127.0.0.1:9/' + i, { index: w.space.today.length }); tab.title = 'Veille ' + i; } w.changed(); });
      await jusqua(async () => (await today()).length === 6, 'six onglets du jour');
      await repos();
      await ctx.vitesseAnimations(0.2);
      try {
        await ctx.clic(shell, '#b-clear', { survol: shell.locator('#scroll') });
        const a = await jusqua(async () => { const x = (await enCours()).filter((y) => y.nom === 'row-out'); return x.length >= 4 ? x : null; }, 'effacement en cours');
        const retards = a.map((x) => x.retard).sort((p, q) => p - q);
        assert.ok(retards[0] === 0 && retards[1] === 22 && retards[2] === 44 && retards[3] === 66, 'retards échelonnés : ' + retards.join(', '));
        assert.ok(a.every((x) => x.hors && x.props.join() === 'opacity,transform'));
      } finally {
        await ctx.vitesseAnimations(1);
      }
      await jusqua(async () => (await today()).length === 1, 'un seul onglet restant');
      await repos();
      assert.equal(await shell.locator('#today .out').count(), 0);
    });

    await t.avecEcran('verifier', 'chargement : une lueur aux couleurs de l’Espace court le long du bord haut de la page, par transformation', async () => {
      await ctx.nouvelOnglet();
      await ctx.taper(ctx.hote + '/lent?ms=1800');
      await ctx.modal.keyboard.press('Enter');
      const m = await jusqua(() => shell.evaluate(() => {
        const g = document.getElementById('glow');
        const i = g.firstElementChild;
        const cs = getComputedStyle(g);
        if (!document.body.classList.contains('loading') || Number(cs.opacity) < 0.99) return null;
        const a = i.getAnimations()[0];
        const page = S.sidebar.width; // bord gauche de la page
        const r = g.getBoundingClientRect();
        return { nom: a && a.animationName, etat: a && a.playState, props: a ? [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)))].filter((k) => k === 'transform' || k === 'left' || k === 'width' || k === 'backgroundPosition') : [], gauche: Math.round(r.left), page, haut: Math.round(r.top), h: Math.round(r.height), pastille: getComputedStyle(document.getElementById('url'), '::after').animationName };
      }), 'lueur affichée pendant le chargement', 5000);
      assert.deepEqual([m.nom, m.etat, m.props], ['glow-run', reduit ? m.etat : 'running', ['transform']]);
      assert.deepEqual([m.gauche, m.haut, m.h], [m.page, 0, 10], 'dans la marge au-dessus de la page');
      assert.equal(m.pastille, 'sweep', 'le reflet de la pastille d’adresse est une transformation lui aussi');
      const perf = reduit ? null : await mesurer(500);
      if (perf) {
        console.log(`    lueur : ${perf.images} images, médiane ${perf.mediane} ms, 95e centile ${perf.p95} ms, ${perf.misesEnPage} mise(s) en page`);
        // (Le chargement lui-même change l'état une fois ou deux : titre, icône.)
        assert.ok(perf.misesEnPage <= 3, 'pas de mise en page à chaque image pendant que la lueur court : ' + perf.misesEnPage);
      }
      await jusqua(() => shell.evaluate(() => !document.body.classList.contains('loading')), 'fin du chargement', 8000);
      await jusqua(() => shell.evaluate(() => Number(getComputedStyle(document.getElementById('glow')).opacity) === 0 && getComputedStyle(document.getElementById('glow').firstElementChild).animationPlayState === 'paused'), 'lueur éteinte et à l’arrêt');
    });

    await animer('boutons animés : « actualiser » fait un tour, les flèches partent dans leur sens, le « + » pivote', async () => {
      const angle = (sel) => shell.evaluate((s) => { const m = new DOMMatrix(getComputedStyle(document.querySelector(s)).transform); return { x: Math.round(m.m41 * 10) / 10, tourne: Math.abs(m.b) > 0.01 || m.a < 0.99 }; }, sel);
      await ctx.vitesseAnimations(0.2);
      try {
        await ctx.clic(shell, '#b-reload');
        await jusqua(() => shell.evaluate(() => document.querySelector('#b-reload svg').getAnimations().some((a) => a.animationName === 'reload-turn')), 'tour de l’icône');
        await jusqua(async () => (await angle('#b-reload svg')).tourne, 'icône en train de tourner');
      } finally {
        await ctx.vitesseAnimations(1);
      }
      await jusqua(() => shell.evaluate(() => !S.nav.loading), 'page rechargée', 8000);
      // Flèche « précédent » : enfoncée, l'icône part vers la gauche ; relâchée, elle revient.
      await ctx.onglet('/lent?ms=1800').click('#vers-b');
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/b'), 'page B');
      await jusqua(() => shell.evaluate(() => !document.getElementById('b-back').disabled), '« précédent » actif');
      const c = await ctx.centre(shell.locator('#b-back'));
      await shell.mouse.move(c.x, c.y);
      await shell.mouse.down();
      await jusqua(async () => (await angle('#b-back svg')).x === -3, 'flèche décalée de 3 px');
      await shell.mouse.up();
      await jusqua(async () => (await angle('#b-back svg')).x === 0, 'flèche revenue');
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/lent?ms=1800'), 'retour à la page précédente', 8000);
      const plus = await ctx.centre(shell.locator('#b-plus'));
      await shell.mouse.move(plus.x, plus.y);
      await jusqua(async () => (await angle('#b-plus svg')).tourne, 'le « + » pivote au survol');
      await shell.mouse.move(700, 400);
    });

    await animer('rebond élastique : au bout de la liste, elle se laisse tirer un peu puis revient, sans rien déplacer', async () => {
      const tire = () => shell.evaluate(() => { const v = getComputedStyle(document.getElementById('scroll')).translate; return v === 'none' ? 0 : parseFloat(v.split(' ')[1] || '0'); });
      const cotes = () => shell.evaluate(() => [...document.querySelectorAll('#scroll .row, #divider, #space-head')].filter((el) => el.getClientRects().length).map((el) => { const r = el.getBoundingClientRect(); return Math.round(r.top * 10) / 10; }).join(','));
      await jusqua(() => shell.evaluate(() => !S.nav.loading), 'page chargée', 8000);
      await repos();
      const avant = await cotes();
      const c = await ctx.centre(shell.locator('#scroll'));
      await shell.mouse.move(c.x, c.y);
      const releves = [];
      // Tirer vers le bas en haut de liste : petits déplacements, comme deux doigts sur le pavé.
      for (let i = 0; i < 8; i++) { await shell.mouse.wheel(0, -14); await sleep(16); releves.push(await tire()); }
      assert.ok(releves[0] > 0 && releves.every((y, i) => i === 0 || y >= releves[i - 1] - 0.2), 'la liste suit les doigts : ' + releves.join(', '));
      assert.ok(releves[7] < 72 && releves[7] - releves[6] < releves[1] - releves[0], 'de moins en moins (élastique) : ' + releves.join(', '));
      assert.equal(await shell.evaluate(() => document.getElementById('scroll').scrollTop), 0);
      const m = await mesurer(450);
      console.log(`    rebond : ${m.images} images, médiane ${m.mediane} ms, 95e centile ${m.p95} ms, ${m.misesEnPage} mise(s) en page pendant le retour`);
      assert.ok(m.misesEnPage <= 1, 'pas de mise en page à chaque image pendant le retour : ' + m.misesEnPage);
      await jusqua(async () => (await tire()) === 0 && !(await shell.evaluate(() => document.getElementById('scroll').getAnimations().length)), 'liste revenue');
      assert.equal(await cotes(), avant, 'chaque ligne a retrouvé sa place exacte');
      // En bas de liste, dans l'autre sens.
      await shell.mouse.wheel(0, 20);
      await sleep(16);
      await shell.mouse.wheel(0, 20);
      assert.ok((await tire()) < 0, 'tirée vers le haut en bout de liste');
      await jusqua(async () => (await tire()) === 0, 'liste revenue');
      // Un cran de molette (souris) ne tire pas la liste.
      await shell.evaluate(() => document.getElementById('scroll').dispatchEvent(new WheelEvent('wheel', { deltaY: -120, wheelDeltaY: 120, bubbles: true })));
      assert.equal(await tire(), 0);
    });

    // --- Balayage de page ---------------------------------------------------------
    const pastille = () => ctx.page('overlay.html#swipe');
    const vue = () => ctx.principal(({ w }) => (w.swipeView && w.swipeView.getVisible() ? w.swipeView.getBounds() : null));
    const lire = async () => { const p = pastille(); return p ? p.evaluate(() => { const el = document.getElementById('swipe-pill'); const box = document.getElementById('swipe'); const m = new DOMMatrix(getComputedStyle(el).transform); return { x: Math.round(m.m41 * 10) / 10, echelle: Math.round(m.a * 100) / 100, opacite: Number(getComputedStyle(el).opacity), sens: box.classList.contains('forward') ? 'forward' : 'back', go: box.classList.contains('go'), cache: box.hidden }; }) : null; };
    const balayer = async (page, dx, crans, pause = 16) => {
      const v = page.viewportSize() || await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      await page.mouse.move(v.width / 2, v.height / 2);
      for (let i = 0; i < crans; i++) { await page.mouse.wheel(dx, 0); await sleep(pause); }
    };

    await t.verifier('balayage à deux doigts sur la page : une pastille sort du bord et suit les doigts ; relâché avant le seuil, rien ne change', async () => {
      // Un onglet à part, avec deux pages dans son historique (adresses uniques).
      await ctx.ouvrir('/a?geste', 'Page A');
      await ctx.principal(({ w }, u) => w.navigate(u), ctx.url('/b?geste'));
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/b?geste'), 'page B');
      const b = await ctx.attendreOnglet('/b?geste');
      await jusqua(() => shell.evaluate(() => S.nav.canBack && !S.nav.loading), 'retour possible');
      // Doigts vers la droite (défilement négatif) : un premier effleurement fait paraître la pastille au bord de la page.
      await balayer(b, -6, 2);
      const rect = await jusqua(vue, 'pastille affichée');
      const page0 = (await ctx.etat()).vuePage;
      assert.deepEqual([rect.x, rect.width, rect.height], [page0.x, 76, 76], 'au bord gauche de la page');
      assert.ok(Math.abs(rect.y + 38 - (page0.y + page0.height / 2)) <= 1, 'à mi-hauteur de la page');
      await jusqua(async () => { const x = await lire(); return x && !x.cache; }, 'pastille dessinée');
      await jusqua(async () => !(await vue()), 'geste fini, pastille retirée', 3000);
      // Puis un geste continu, sous le seuil : cinq petits déplacements, la position relevée après chacun.
      const suivi = [];
      const v0 = await b.evaluate(() => ({ w: innerWidth, h: innerHeight }));
      await b.mouse.move(v0.w / 2, v0.h / 2);
      for (let i = 0; i < 5; i++) {
        await b.mouse.wheel(-14, 0);
        await sleep(20);
        suivi.push((await lire()).x);
      }
      assert.ok(suivi.every((x, i) => (i === 0 ? x > -60 : x > suivi[i - 1])), 'la pastille avance avec les doigts : ' + suivi.join(', '));
      assert.ok((await lire()).opacite > 0);
      const l = await lire();
      assert.deepEqual([l.sens, l.go], ['back', false]);
      assert.ok(l.x < 14 && l.echelle < 1, 'pas encore au seuil');
      // Doigts levés : elle rentre, la vue est retirée, la page n'a pas changé.
      await jusqua(async () => !(await vue()), 'pastille retirée', 3000);
      assert.equal((await ctx.etat()).actifUrl, ctx.url('/b?geste'));
      assert.equal((await lire()).opacite, 0);
    });

    await t.verifier('balayage franc vers la droite : page précédente ; vers la gauche : page suivante', async () => {
      const b = ctx.onglet('/b?geste');
      const avant = await ctx.principal(({ req }) => req('swipe.js').stats.navigations);
      await balayer(b, -30, 6);
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/a?geste'), 'retour à la page A');
      assert.equal(await ctx.principal(({ req }) => req('swipe.js').stats.navigations), avant + 1, 'une seule navigation pour tout le geste (inertie comprise)');
      await jusqua(async () => !(await vue()), 'pastille retirée', 3000);
      await jusqua(() => shell.evaluate(() => S.nav.canForward && !S.nav.loading), 'suivant possible');
      await sleep(200); // fin du geste précédent
      const a = await ctx.attendreOnglet('/a?geste');
      // Geste continu (les relevés se font entre deux déplacements, doigts posés).
      const page0 = (await ctx.etat()).vuePage;
      const va = await a.evaluate(() => ({ w: innerWidth, h: innerHeight }));
      await a.mouse.move(va.w / 2, va.h / 2);
      let vu = null;
      for (let i = 0; i < 9 && !vu; i++) {
        await a.mouse.wheel(8, 0);
        await sleep(20);
        const rect = await vue();
        const l = await lire();
        if (rect && l && l.sens === 'forward' && l.x < 58 && l.x > -14 && l.opacite > 0) vu = rect; // partie de +60 (hors du bord droit), elle avance vers la gauche
      }
      assert.ok(vu, 'pastille de droite, qui avance vers la gauche');
      assert.equal(vu.x + vu.width, page0.x + page0.width, 'au bord droit de la page');
      await balayer(a, 30, 5);
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/b?geste'), 'page suivante');
    });

    await t.verifier('balayage sans page où aller, vertical, ou sur un bloc qui défile en largeur : aucune pastille, aucune navigation', async () => {
      await jusqua(async () => !(await vue()), 'pastille retirée', 3000);
      await sleep(250);
      const b = await ctx.attendreOnglet('/b?geste');
      // Rien « après » la page B : balayer vers la gauche ne fait rien.
      await balayer(b, 30, 6);
      await sleep(200);
      assert.equal(await vue(), null);
      assert.equal((await ctx.etat()).actifUrl, ctx.url('/b?geste'));
      // Défilement vertical, même en biais.
      const v = await b.evaluate(() => ({ w: innerWidth, h: innerHeight }));
      await b.mouse.move(v.w / 2, v.h / 2);
      for (let i = 0; i < 6; i++) { await b.mouse.wheel(-8, 30); await sleep(16); }
      await sleep(200);
      assert.equal(await vue(), null);
      // Bloc qui défile en largeur : c'est lui qui prend le geste, tant qu'il peut défiler.
      await ctx.ouvrir('/large', 'Page large');
      await ctx.principal(({ w }, u) => w.navigate(u), ctx.url('/c?geste'));
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/c?geste'), 'page C depuis la page large');
      await jusqua(() => shell.evaluate(() => S.nav.canBack && !S.nav.loading), 'retour possible');
      await ctx.principal(({ w }) => w.run('back'));
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/large'), 'retour sur la page large');
      await jusqua(() => shell.evaluate(() => S.nav.canForward && !S.nav.loading), 'suivant possible');
      const l2 = ctx.onglet('/large');
      const bande = await l2.locator('#bande').boundingBox();
      await l2.mouse.move(bande.x + 100, bande.y + 60);
      for (let i = 0; i < 6; i++) { await l2.mouse.wheel(30, 0); await sleep(16); }
      await sleep(250);
      assert.ok(await l2.evaluate(() => document.getElementById('bande').scrollLeft > 100), 'le bloc a défilé');
      assert.equal(await vue(), null, 'aucune pastille pendant que le bloc défile');
      assert.equal((await ctx.etat()).actifUrl, ctx.url('/large'));
    });

    await animer('balayage de page : la pastille suit les doigts image par image (cadence mesurée)', async () => {
      await sleep(250);
      const l2 = ctx.onglet('/large');
      await l2.mouse.move(600, 500); // hors du bloc qui défile
      await l2.mouse.wheel(4, 0);
      await jusqua(vue, 'pastille affichée');
      const p = pastille();
      await p.evaluate(() => { const s = (window.__img = { t: [], on: true }); const f = (ts) => { s.t.push(ts); if (s.on) requestAnimationFrame(f); }; requestAnimationFrame(f); });
      for (let i = 0; i < 24; i++) { await l2.mouse.wheel(3, 0); await sleep(12); }
      const ts = await p.evaluate(() => { window.__img.on = false; return window.__img.t; });
      const ecarts = ts.slice(1).map((x, i) => x - ts[i]).sort((x, y) => x - y);
      const mediane = Math.round(ecarts[Math.floor(ecarts.length / 2)] * 10) / 10;
      console.log(`    balayage : ${ecarts.length} images, médiane ${mediane} ms, 95e centile ${Math.round(ecarts[Math.floor(ecarts.length * 0.95)] * 10) / 10} ms`);
      assert.ok(mediane < 34, 'cadence médiane : ' + mediane + ' ms');
      assert.deepEqual(await p.evaluate(() => { const cs = getComputedStyle(document.getElementById('swipe-pill')); return [cs.willChange, cs.position]; }), ['transform, opacity', 'absolute']);
      await jusqua(async () => !(await vue()), 'pastille retirée', 3000);
      assert.equal((await ctx.etat()).actifUrl, ctx.url('/large'));
    });

    await t.verifier('pincer pour zoomer la page : le zoom visuel suit le geste, puis revient', async () => {
      const page = await ctx.ouvrir('/e?pince', 'Page E');
      const session = await page.context().newCDPSession(page);
      try {
        assert.equal(await page.evaluate(() => visualViewport.scale), 1);
        await ctx.delai(session.send('Input.synthesizePinchGesture', { x: 300, y: 300, scaleFactor: 2, relativeSpeed: 1200, gestureSourceType: 'touch' }), 8000, 'pincement');
        await jusqua(() => page.evaluate(() => visualViewport.scale > 1.5), 'page agrandie par le pincement');
        await ctx.delai(session.send('Input.synthesizePinchGesture', { x: 300, y: 300, scaleFactor: 0.3, relativeSpeed: 1200, gestureSourceType: 'touch' }), 8000, 'pincement inverse');
        await jusqua(() => page.evaluate(() => visualViewport.scale === 1), 'page revenue à sa taille');
      } finally {
        await session.detach().catch(() => {});
      }
    });

    await t.verifier('typographie : police du système au dessin adapté au corps, chiffres alignés dans les compteurs et les messages', async () => {
      const m = await shell.evaluate(() => {
        const cs = (el) => getComputedStyle(el);
        const row = document.querySelector('#today .row.tab');
        return { corps: cs(document.body).fontSize, optique: cs(document.body).fontOpticalSizing, crenage: cs(document.body).fontKerning, rendu: cs(document.body).textRendering, lissage: cs(document.body).webkitFontSmoothing, ligne: [cs(row).fontSize, cs(row).fontWeight], bouclier: cs(document.getElementById('shield')).fontVariantNumeric };
      });
      assert.deepEqual(m, { corps: '13px', optique: 'auto', crenage: 'normal', rendu: 'auto', lissage: 'antialiased', ligne: ['14px', '500'], bouclier: 'tabular-nums' });
      await ctx.principal(({ w }) => w.toast('Zoom 110 %'));
      const toast = await ctx.attendrePage('overlay.html#toast');
      assert.equal(await toast.evaluate(() => getComputedStyle(document.getElementById('toast')).fontVariantNumeric), 'tabular-nums');
    });

    await t.verifier('« Réduire les animations » : la liste change sans glissement, la liste ne rebondit pas', async () => {
      await shell.emulateMedia({ reducedMotion: 'reduce' });
      try {
        await jusqua(() => shell.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'réglage pris en compte');
        // Page jamais ouverte dans ce groupe : la vérification ne dépend pas des précédentes.
        await ctx.ouvrir('/saisie', 'Page Saisie');
        await sleep(60);
        const apres = await enCours();
        assert.deepEqual(apres.filter((x) => x.nom === 'flip'), [], 'aucun glissement');
        const duree = await shell.evaluate(() => { const el = document.querySelector('#today .row.tab'); const cs = getComputedStyle(el); return [parseFloat(cs.transitionDuration) * 1000, parseFloat(cs.animationDuration) * 1000]; });
        assert.ok(duree.every((d) => d <= 0.011), 'durées ramenées à zéro : ' + duree.join(', '));
        const c = await ctx.centre(shell.locator('#scroll'));
        await shell.mouse.move(c.x, c.y);
        for (let i = 0; i < 4; i++) { await shell.mouse.wheel(0, -14); await sleep(16); }
        assert.equal(await shell.evaluate(() => getComputedStyle(document.getElementById('scroll')).translate), 'none');
        await fermer('Page Saisie');
        await jusqua(async () => !(await today()).includes('Page Saisie'), 'onglet fermé');
        assert.equal(await shell.locator('#today .out').count(), 0, 'la ligne est retirée aussitôt');
      } finally {
        await shell.emulateMedia({ reducedMotion: null });
      }
    });

    await cdp.detach().catch(() => {});
  },
};
