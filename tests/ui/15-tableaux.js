// Tableaux : dessin, déplacement, redimensionnement, texte, vue, annulation et
// sélection au lasso, à la vraie souris et au vrai clavier. La dernière
// vérification mesure le coût d'un glisser avec 300 éléments.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Tableaux',
  async test(ctx, t) {
    const { jusqua, sleep } = ctx;
    await ctx.menu('Ctrl+Shift+E');
    const page = await ctx.attendrePage('easel.html', 10000);
    await jusqua(() => page.evaluate(() => typeof E === 'object' && E.ready.then(() => true)), 'tableau prêt');
    const m = page.mouse;
    const items = () => page.evaluate(() => JSON.parse(JSON.stringify(E.items)));
    const etat = () => page.evaluate(() => ({ n: E.items.length, sel: E.sel.length, tool: E.tool, view: E.view }));
    const proche = (a, b, tol = 2) => Math.abs(a - b) <= tol;
    const glisser = async (x0, y0, x1, y1, pas = 8) => {
      await m.move(x0, y0);
      await m.down();
      await m.move(x1, y1, { steps: pas });
      await sleep(40);
      await m.up();
      await sleep(60);
    };

    await t.verifier('⌃⇧E ouvre un tableau vide dans un onglet', async () => {
      assert.match((await ctx.etat()).actifUrl, /^orbe:\/\/app\/easel\.html\?id=[a-f0-9]{16}$/);
      assert.equal((await etat()).n, 0);
      assert.equal(await page.locator('#hint').isVisible(), true);
    });

    await t.verifier('outil rectangle : glisser dessine un rectangle, puis retour à la sélection', async () => {
      await ctx.clic(page, '#tools [data-tool=rect]');
      await glisser(300, 250, 460, 350);
      const [r] = await items();
      assert.equal(r.type, 'rect');
      assert.ok(proche(r.x, 300) && proche(r.y, 250) && proche(r.w, 160) && proche(r.h, 100), JSON.stringify(r));
      const e = await etat();
      assert.deepEqual([e.tool, e.sel], ['select', 1]);
      const box = await page.locator('#world .it.rect').boundingBox();
      assert.ok(proche(box.width, 160) && proche(box.height, 100), JSON.stringify(box));
    });

    await t.verifier('glisser le rectangle le déplace', async () => {
      await glisser(380, 300, 500, 360);
      const [r] = await items();
      assert.ok(proche(r.x, 420) && proche(r.y, 310) && proche(r.w, 160), JSON.stringify(r));
      const box = await page.locator('#world .it.rect').boundingBox();
      assert.ok(proche(box.x, 420) && proche(box.y, 310), JSON.stringify(box));
    });

    await t.verifier('la poignée du coin bas-droit le redimensionne', async () => {
      const h = await ctx.centre(page.locator('#selbox .h[data-h=se]'));
      assert.ok(proche(h.x, 580, 3) && proche(h.y, 410, 3), JSON.stringify(h));
      await glisser(h.x, h.y, h.x + 60, h.y + 40);
      const [r] = await items();
      assert.ok(proche(r.x, 420) && proche(r.y, 310) && proche(r.w, 220) && proche(r.h, 140), JSON.stringify(r));
    });

    await t.verifier('outil texte : un clic pose une zone, on y tape, Échap valide', async () => {
      await ctx.clic(page, '#tools [data-tool=text]');
      await m.click(700, 180);
      await jusqua(() => page.evaluate(() => !!document.activeElement && document.activeElement.isContentEditable), 'zone de texte active');
      await page.keyboard.type('Bonjour Orbe', { delay: 10 });
      await page.keyboard.press('Escape');
      const list = await items();
      assert.equal(list.length, 2);
      assert.equal(list[1].type, 'text');
      assert.equal(list[1].text, 'Bonjour Orbe');
      assert.equal(await page.locator('#world .it.text .tx').textContent(), 'Bonjour Orbe');
      assert.equal(await page.evaluate(() => document.activeElement.isContentEditable), false);
    });

    await t.verifier('double-clic sur le texte : on le modifie sur place', async () => {
      const c = await ctx.centre(page.locator('#world .it.text .tx'));
      await m.dblclick(c.box.x + 20, c.y);
      await jusqua(() => page.evaluate(() => !!document.activeElement && document.activeElement.isContentEditable), 'texte en cours de modification');
      await page.keyboard.press('End');
      await page.keyboard.type(' !');
      await page.keyboard.press('Escape');
      assert.equal((await items())[1].text, 'Bonjour Orbe !');
    });

    await t.verifier('Espace + glisser déplace la vue, sans toucher aux éléments', async () => {
      const avant = await items();
      await page.keyboard.down('Space');
      await glisser(200, 500, 290, 440);
      await page.keyboard.up('Space');
      const e = await etat();
      assert.ok(proche(e.view.x, 90) && proche(e.view.y, -60), JSON.stringify(e.view));
      assert.deepEqual(await items(), avant);
      const box = await page.locator('#world .it.rect').boundingBox();
      assert.ok(proche(box.x, 510) && proche(box.y, 250), JSON.stringify(box));
    });

    await t.verifier('défilement à deux doigts : la vue suit', async () => {
      await m.move(300, 300);
      await m.wheel(-90, 60);
      await jusqua(async () => { const v = (await etat()).view; return proche(v.x, 180) && proche(v.y, -120); }, 'vue défilée');
      await m.wheel(180, -120);
      await jusqua(async () => { const v = (await etat()).view; return proche(v.x, 0) && proche(v.y, 0); }, 'vue revenue');
    });

    await t.verifier('pincement (Ctrl + molette) : zoom centré sur le pointeur', async () => {
      // Le point du plan sous le pointeur ne doit pas bouger : ici le coin du rectangle.
      await m.move(420, 310);
      await page.keyboard.down('Control');
      for (let i = 0; i < 6; i++) await m.wheel(0, -30);
      await page.keyboard.up('Control');
      await jusqua(async () => (await etat()).view.z > 1.5, 'zoom avant');
      const e = await etat();
      const box = await page.locator('#world .it.rect').boundingBox();
      assert.ok(proche(box.x, 420, 1.5) && proche(box.y, 310, 1.5), JSON.stringify([box, e.view]));
      assert.ok(proche(box.width, 220 * e.view.z, 2), JSON.stringify([box, e.view]));
      assert.equal(await page.locator('#zoom-val').textContent(), Math.round(e.view.z * 100) + ' %');
      await ctx.clic(page, '#zoom-val');
      await jusqua(async () => (await etat()).view.z === 1, 'retour à 100 %');
      await page.evaluate(() => { E.fit(); });
    });

    await t.verifier('⌘Z annule, ⇧⌘Z rétablit, cran par cran', async () => {
      // Remet la vue à plat pour la suite.
      await page.evaluate(() => { const v = E.view; document.getElementById('zoom-val').click(); return v; });
      const n = (await etat()).n;
      await m.click(60, 600); // rien de sélectionné, le clavier est au tableau
      await page.keyboard.press('ControlOrMeta+z');
      assert.equal((await items())[1].text, 'Bonjour Orbe', 'la modification du texte est annulée');
      await page.keyboard.press('ControlOrMeta+z');
      assert.equal((await etat()).n, n - 1, 'le texte disparaît');
      await page.keyboard.press('ControlOrMeta+z');
      assert.ok(proche((await items())[0].w, 160), 'le redimensionnement est annulé');
      await page.keyboard.press('ControlOrMeta+Shift+z');
      assert.ok(proche((await items())[0].w, 220), 'le redimensionnement est rétabli');
      await page.keyboard.press('ControlOrMeta+Shift+z');
      await page.keyboard.press('ControlOrMeta+Shift+z');
      const list = await items();
      assert.equal(list.length, n);
      assert.equal(list[1].text, 'Bonjour Orbe !');
      assert.equal(await page.locator('#world .it.text .tx').textContent(), 'Bonjour Orbe !');
    });

    await t.verifier('⌥-glisser duplique, les originaux restent en place', async () => {
      const r = await page.locator('#world .it.rect').boundingBox();
      await m.move(r.x + 20, r.y + 20);
      await page.keyboard.down('Alt');
      await m.down();
      await m.move(r.x + 20, r.y + 220, { steps: 6 });
      await m.up();
      await page.keyboard.up('Alt');
      const list = await items();
      assert.equal(list.length, 3);
      assert.ok(list[2].type === 'rect' && proche(list[2].y, list[0].y + 200) && list[2].id !== list[0].id, JSON.stringify(list[2]));
      await page.keyboard.press('ControlOrMeta+z');
      assert.equal((await etat()).n, 2, 'un seul cran pour la copie et son déplacement');
      await page.keyboard.press('ControlOrMeta+Shift+z');
      assert.equal((await etat()).n, 3);
    });

    await t.verifier('lasso : glisser dans le vide sélectionne ce qu’il touche ; ⇧-clic retire', async () => {
      const b = await page.evaluate(() => { const r = [...document.querySelectorAll('#world .it')].map((el) => el.getBoundingClientRect()); return { x0: Math.min(...r.map((x) => x.left)), y0: Math.min(...r.map((x) => x.top)), x1: Math.max(...r.map((x) => x.right)), y1: Math.max(...r.map((x) => x.bottom)) }; });
      await glisser(b.x0 - 30, b.y0 - 30, b.x1 + 30, b.y1 + 30);
      assert.equal((await etat()).sel, 3);
      assert.equal(await page.locator('#world .it.sel').count(), 3);
      assert.equal(await page.locator('#selbox .h[data-h=se]').isVisible(), false, 'pas de poignée pour plusieurs éléments');
      const txt = await ctx.centre(page.locator('#world .it.text .tx'));
      await page.keyboard.down('Shift');
      await m.click(txt.box.x + 10, txt.y);
      await page.keyboard.up('Shift');
      assert.equal((await etat()).sel, 2);
    });

    await t.verifier('Suppr efface la sélection ; ⌘Z la ramène', async () => {
      await page.keyboard.press('Delete');
      const list = await items();
      assert.deepEqual(list.map((it) => it.type), ['text']);
      assert.equal(await page.locator('#world .it').count(), 1);
      await page.keyboard.press('ControlOrMeta+z');
      assert.equal(await page.locator('#world .it').count(), 3);
    });

    await t.verifier('le titre saisi et les éléments sont enregistrés sur disque ; l’onglet prend le titre', async () => {
      await ctx.clic(page, '#title');
      await page.keyboard.type('Essai', { delay: 10 });
      await page.keyboard.press('Enter');
      const id = new URL(page.url()).searchParams.get('id');
      await jusqua(() => ctx.principal(({ electron }, bid) => {
        const fs = process.mainModule.require('fs');
        const path = process.mainModule.require('path');
        try { const d = JSON.parse(fs.readFileSync(path.join(electron.app.getPath('userData'), 'easels', bid + '.json'), 'utf8')); return d.title === 'Essai' && d.items.length === 3; } catch { return false; }
      }, id), 'fichier du tableau à jour');
      await jusqua(async () => (await ctx.shell.locator('#sidebar .row.tab.active .title').allTextContents())[0] === 'Essai', 'titre de l’onglet');
    });

    await t.verifier('aimantation : un élément amené à 5 points de l’alignement d’un autre s’y cale ; un guide le montre pendant le geste', async () => {
      const avant = await items();
      const boites = page.locator('#world .it.rect');
      const b = await boites.nth(1).boundingBox();
      const vue = (await etat()).view;
      // La copie remonte jusqu'à 5 points sous le haut de l'original, décalée de 53 points vers la droite.
      const dy = (avant[0].y + 5 - avant[2].y) * vue.z;
      await m.move(b.x + 20, b.y + 20);
      await m.down();
      await m.move(b.x + 20 + 53, b.y + 20 + dy, { steps: 8 });
      await sleep(80);
      const guide = await page.evaluate(() => { const g = document.getElementById('guide-y'); return g.hidden ? null : Math.round(g.getBoundingClientRect().top); });
      const haut = (await boites.nth(0).boundingBox()).y;
      await m.up();
      await sleep(60);
      const apres = await items();
      assert.equal(apres[2].y, avant[0].y, 'bord haut calé sur celui de l’original');
      assert.ok(proche(apres[2].x, avant[2].x + 53, 1), 'aucun calage en largeur : ' + JSON.stringify(apres[2]));
      assert.ok(guide !== null && proche(guide, haut, 1), `guide horizontal sur le bord commun (${guide} / ${haut})`);
      assert.equal(await page.locator('.guide:visible').count(), 0, 'guides effacés au relâchement');
      await page.keyboard.press('ControlOrMeta+z');
      assert.equal((await items())[2].y, avant[2].y);
    });

    await t.verifier('⌘ maintenu pendant le glisser : pas d’aimantation', async () => {
      const avant = await items();
      const b = await page.locator('#world .it.rect').nth(1).boundingBox();
      const vue = (await etat()).view;
      const dy = (avant[0].y + 5 - avant[2].y) * vue.z;
      await m.move(b.x + 20, b.y + 20);
      await m.down();
      await page.keyboard.down('ControlOrMeta');
      await m.move(b.x + 20 + 53, b.y + 20 + dy, { steps: 8 });
      await sleep(60);
      assert.equal(await page.locator('.guide:visible').count(), 0);
      await m.up();
      await page.keyboard.up('ControlOrMeta');
      await sleep(60);
      assert.ok(proche((await items())[2].y, avant[0].y + 5, 1), 'position libre, à 5 points de l’alignement');
      await page.keyboard.press('ControlOrMeta+z');
      assert.equal((await items())[2].y, avant[2].y);
    });

    await t.verifier('image sélectionnée : on tape son texte alternatif dans la barre, Entrée valide', async () => {
      await page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 120; c.height = 80;
        const g = c.getContext('2d'); g.fillStyle = '#3b82f6'; g.fillRect(0, 0, 120, 80);
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        await E.addImages([new File([blob], 'carte.png', { type: 'image/png' })], { x: 900, y: 120 });
        E.setSel([]);
      });
      const image = page.locator('#world .it.image');
      await jusqua(async () => (await image.count()) === 1 && (await image.locator('img').evaluate((i) => i.complete && i.naturalWidth > 0)), 'image affichée');
      assert.equal(await page.locator('#alt').isVisible(), false);
      const c = await ctx.centre(image);
      await m.click(c.x, c.y);
      await jusqua(() => page.locator('#alt').isVisible(), 'champ « Texte alternatif »');
      assert.equal(await page.getAttribute('#alt', 'placeholder'), 'Texte alternatif');
      await ctx.clic(page, '#alt');
      await page.keyboard.type('Carte du trajet', { delay: 10 });
      assert.equal((await etat()).n, 4, 'taper dans le champ ne touche pas au tableau (ni suppression, ni outil)');
      await page.keyboard.press('Enter');
      await jusqua(async () => (await image.locator('img').getAttribute('alt')) === 'Carte du trajet', 'attribut alt posé');
      assert.equal((await items()).find((it) => it.type === 'image').alt, 'Carte du trajet');
      assert.equal(await page.evaluate(() => document.activeElement.id), '', 'le champ rend le clavier');
      // Sélectionnée de nouveau : le champ montre le texte enregistré.
      await m.click(40, 700);
      await m.click(c.x, c.y);
      await jusqua(async () => (await page.inputValue('#alt')) === 'Carte du trajet', 'texte relu');
    });

    await t.verifier('bouton « Exporter le tableau en PNG… » : l’image entière est enregistrée à l’endroit choisi', async () => {
      const fs = require('fs');
      const path = require('path');
      const cible = path.join(ctx.userData, 'export-tableau.png');
      await ctx.principal(({ req }, file) => { const e = req('easels.js'); global.__export = { avant: e.env.saveDialog, demandes: [] }; e.env.saveDialog = async (parent, opts) => { global.__export.demandes.push(opts.defaultPath); return file; }; }, cible);
      try {
        assert.equal(await page.getAttribute('#b-export', 'title'), 'Exporter le tableau en PNG…');
        // Image sélectionnée : la barre de style, élargie par le champ, ne recouvre ni le titre ni ce bouton.
        const haut = await page.locator('#top').boundingBox();
        const style = await page.locator('#style').boundingBox();
        assert.ok(style.y >= haut.y + haut.height || style.x >= haut.x + haut.width, JSON.stringify([haut, style]));
        await ctx.clic(page, '#b-export');
        await jusqua(() => fs.existsSync(cible) && fs.statSync(cible).size > 500, 'fichier PNG écrit');
        assert.equal(fs.readFileSync(cible).subarray(1, 4).toString(), 'PNG');
        const taille = await page.evaluate(() => E.exportSize());
        const lue = await ctx.principal(({ electron }, file) => electron.nativeImage.createFromPath(file).getSize(), cible);
        assert.deepEqual([lue.width, lue.height], [taille.W, taille.H]);
        assert.match(path.basename((await ctx.principal(() => global.__export.demandes))[0]), /^Essai\.png$/);
      } finally {
        await ctx.principal(({ req }) => { req('easels.js').env.saveDialog = global.__export.avant; });
      }
      // L'image d'essai est retirée : la suite compte les éléments.
      await page.keyboard.press('Delete');
      assert.equal((await etat()).n, 3);
    });

    await t.verifier('300 éléments : glisser, déplacer la vue et zoomer restent fluides', async () => {
      await page.evaluate(() => {
        const list = [];
        const types = ['rect', 'ellipse', 'note', 'text', 'arrow', 'pen'];
        for (let i = 0; i < 297; i++) {
          const type = types[i % types.length];
          const x = 40 + (i % 24) * 52; const y = 60 + Math.floor(i / 24) * 52;
          const it = { type, x, y, w: 40, h: 40, color: ['ink', 'red', 'blue', 'green'][i % 4], sw: 2 };
          if (type === 'note' || type === 'text') { it.text = 'Note ' + i; it.size = 14; if (type === 'text') it.w = 48; }
          if (type === 'pen') { it.pw = 40; it.ph = 40; it.pts = []; for (let k = 0; k <= 40; k++) it.pts.push(k, 20 + 18 * Math.sin(k / 3 + i)); }
          if (type === 'arrow') it.h = -30;
          list.push(it);
        }
        E.add(list);
        E.setView(0, 0, 1);
      });
      assert.equal(await page.locator('#world .it').count(), 300);
      // Compteur d'images indépendant du code du tableau.
      const mesurer = async (geste) => {
        await page.evaluate(() => {
          E.resetPerf();
          const c = { n: 0, max: 0, last: 0, on: true, t0: performance.now(), gaps: [], long: [] };
          if (window.__obs) window.__obs.disconnect();
          window.__obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) c.long.push(Math.round(e.duration)); });
          window.__obs.observe({ entryTypes: ['longtask'] });
          window.__c = c;
          const tick = (now) => { if (!c.on) return; if (c.last) { const g = now - c.last; c.gaps.push(g); if (g > c.max) c.max = g; } c.last = now; c.n += 1; requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
        });
        await geste();
        return page.evaluate(() => {
          const c = window.__c; c.on = false;
          const g = c.gaps.slice().sort((a, b) => a - b);
          const p = E.perf;
          return {
            longues: c.long, pires: c.gaps.map((x, i) => [i, Math.round(x)]).filter((x) => x[1] > 30),
            images: c.n, duree: Math.round(performance.now() - c.t0), ips: Math.round((c.n * 1000) / (performance.now() - c.t0)),
            ecartMedian: +(g[Math.floor(g.length / 2)] || 0).toFixed(1), ecart95: +(g[Math.floor(g.length * 0.95)] || 0).toFixed(1), ecartMax: +c.max.toFixed(1),
            mouvements: p.moves, coutMouvement: +(p.moveMs / Math.max(p.moves, 1)).toFixed(3), coutMouvementMax: +p.moveMax.toFixed(2),
            majEcran: p.frames, coutMaj: +(p.frameMs / Math.max(p.frames, 1)).toFixed(3), coutMajMax: +p.frameMax.toFixed(2),
          };
        });
      };
      const trajet = async (x0, y0, dx, dy, n = 90) => {
        await m.move(x0, y0);
        await m.down();
        for (let i = 1; i <= n; i++) { await m.move(x0 + (dx * i) / n, y0 + (dy * i) / n); await sleep(8); }
        await m.up();
      };
      // 1. Tout sélectionner (⌘A) puis glisser les 300 éléments.
      await m.click(20, 130);
      await page.keyboard.press('ControlOrMeta+a');
      assert.equal((await etat()).sel, 300);
      const avant = (await items())[0];
      const g300 = await mesurer(() => trajet(60, 80, 120, 90));
      const apres = (await items())[0];
      assert.ok(proche(apres.x - avant.x, 120) && proche(apres.y - avant.y, 90), JSON.stringify([avant, apres]));
      // 2. Glisser un seul élément parmi les 300.
      await m.click(20, 130);
      const un = await mesurer(() => trajet(180, 170, 140, 100));
      // 3. Déplacer la vue (Espace + glisser), puis zoomer à la molette.
      await page.keyboard.down('Space');
      const vue = await mesurer(() => trajet(500, 400, -160, -120));
      await page.keyboard.up('Space');
      await m.move(600, 400);
      await page.keyboard.down('Control');
      const zoom = await mesurer(async () => { for (let i = 0; i < 60; i++) { await m.wheel(0, i < 30 ? -8 : 8); await sleep(8); } });
      await page.keyboard.up('Control');
      const ligne = (nom, r) => `      ${nom} : ${r.ips} images/s (écart médian ${r.ecartMedian} ms, 95e centile ${r.ecart95} ms, max ${r.ecartMax} ms) ; `
        + `mouvement de souris ${r.coutMouvement} ms (max ${r.coutMouvementMax}) × ${r.mouvements} ; mise à jour de l’écran ${r.coutMaj} ms (max ${r.coutMajMax}) × ${r.majEcran}`;
      console.log(ligne('glisser 300 éléments', g300));
      console.log(ligne('glisser 1 élément sur 300', un));
      console.log(ligne('déplacer la vue', vue));
      console.log(`      zoom à la molette : ${zoom.ips} images/s (écart médian ${zoom.ecartMedian} ms, 95e centile ${zoom.ecart95} ms, max ${zoom.ecartMax} ms) ${JSON.stringify([zoom.longues, zoom.pires])}`);
      // Budget : le travail du tableau par image doit tenir très largement dans 16 ms.
      assert.ok(g300.coutMaj < 6, 'mise à jour de l’écran trop lente : ' + g300.coutMaj + ' ms');
      assert.ok(g300.coutMouvement < 1 && un.coutMaj < 2 && vue.coutMaj < 2, JSON.stringify([g300, un, vue]));
      await ctx.capture('tableau-300', page);
    });
  },
};
