// Finitions, deuxième série, à la vraie souris et au vrai clavier : dossier « Premiers
// pas », onglet lâché en haut de la page (vue empilée), dépôt dans un dossier fermé,
// onglet glissé hors de la fenêtre puis vers une autre fenêtre, Échap doublé en plein écran.
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

module.exports = {
  nom: 'Finitions 2 : premiers pas, quatre côtés, onglet hors de la fenêtre',
  async test(ctx, t) {
    const { shell, jusqua } = ctx;
    const volets = () => ctx.principal(({ w, win }) => {
      const ids = w.visibleIds();
      const g = ids.length > 1 ? w.groupOf(ids[0]) : null;
      return { titres: ids.map((id) => w.data.tabs[id].title), actif: w.activeId ? w.data.tabs[w.activeId].title : null, empile: !!g && w.isVertical(g), pages: ids.map((id) => win.live.get(id).view.getBounds()) };
    });
    // Page B à l'écran et chargée : le bouton montre « Actualiser » (et non « Arrêter »).
    const pageBChargee = () => jusqua(async () => (await shell.locator('#reload-icon').getAttribute('href')) === '#i-reload'
      && (await ctx.principal(({ w }, u) => !!w.activeRt && !w.activeRt.loading && w.activeRt.wc.getURL() === u, ctx.url('/b'))), 'Page B chargée, bouton « Actualiser »');
    const fenetres = () => ctx.principal(({ win }) => win.OrbeWindow.all.map((x) => ({ actif: x.activeId ? x.data.tabs[x.activeId].title : null, prive: x.incognito })));

    // --- Premiers pas -------------------------------------------------------------------
    await t.verifier('premier lancement : le dossier « Premiers pas » est en tête des épinglés ; un clic sur « Raccourcis clavier essentiels » ouvre la page d’Orbe', async () => {
      const n = await ctx.principal(({ w, req }) => { const f = req('starter.js').seed(w); return f ? f.children.length : 0; });
      assert.ok(n >= 3, 'dossier posé');
      const dossier = shell.locator('#pinned .folder').first();
      await jusqua(async () => (await dossier.locator('> .row .title').textContent()) === (await ctx.texte('starter.folder')), 'dossier affiché');
      assert.equal(await dossier.locator('.children .row.tab').count(), n);
      const ligne = dossier.locator('.children .row.tab').first();
      assert.equal(await ligne.locator('.title').textContent(), await ctx.texte('help.shortcuts'));
      await ctx.clic(shell, ligne);
      const page = await ctx.attendrePage('shortcuts.html');
      await jusqua(async () => (await page.locator('h1').count()) > 0, 'page des raccourcis chargée');
      assert.equal((await ctx.etat()).actifUrl, 'orbe://app/shortcuts.html');
      // Remise à plat pour la suite.
      await ctx.principal(({ w, win }) => { const f = w.space.pinned.shift(); for (const c of f.children) { win.OrbeWindow.destroyView(c.id); delete w.data.tabs[c.id]; } delete w.activeBySpace[w.space.id]; w.layout(); w.changed(); });
      await jusqua(async () => (await shell.locator('#pinned .folder').count()) === 0, 'dossier retiré');
    });

    for (const c of ['a', 'b', 'c', 'd']) await ctx.ouvrir('/' + c, 'Page ' + c.toUpperCase());

    // --- Quatre côtés -------------------------------------------------------------------
    await t.verifier('glisser un onglet en haut de la page : la zone de dépôt éclaire la moitié haute ; lâché, la vue est empilée, l’onglet au-dessus', async () => {
      await ctx.clic(shell, ctx.ligne('Page A'));
      await jusqua(async () => (await volets()).actif === 'Page A', 'Page A affichée');
      const e = await ctx.principal(({ w }) => w.contentRect());
      let zone = null;
      await ctx.glisser(await ctx.centre(ctx.ligne('Page B')), () => ({ x: e.x + e.width / 2, y: e.y + e.height * 0.1 }), {
        avantLacher: async () => {
          const depot = await ctx.attendrePage('overlay.html#drop');
          zone = await jusqua(() => depot.evaluate(() => { const l = document.getElementById('drop-label'); return document.getElementById('drop').classList.contains('over') && l.style.left ? { left: parseFloat(l.style.left), top: parseFloat(l.style.top), width: parseFloat(l.style.width), height: parseFloat(l.style.height) } : null; }), 'côté éclairé');
        },
      });
      assert.ok(Math.abs(zone.top - 6) <= 1 && Math.abs(zone.width - (e.width - 12)) <= 1 && Math.abs(zone.height - (e.height / 2 - 12)) <= 1, `moitié haute éclairée : ${JSON.stringify(zone)} dans ${JSON.stringify(e)}`);
      await jusqua(async () => (await volets()).titres.join() === 'Page B,Page A', 'vue scindée B au-dessus de A');
      const v = await volets();
      assert.equal(v.empile, true, 'vue empilée');
      assert.ok(v.pages[0].y < v.pages[1].y && v.pages[0].x === v.pages[1].x, JSON.stringify(v.pages));
      assert.equal(v.actif, 'Page B');
      await ctx.capture('quatre-cotes-haut');
    });

    await t.verifier('glisser un onglet au milieu, à droite : côte à côte, comme avant', async () => {
      await ctx.menu('view.closeSplit');
      await jusqua(async () => (await volets()).titres.length === 1, 'vue scindée fermée');
      await ctx.principal(({ w }) => { for (const id of w.space.today) w.leaveSplit(id); w.layout(); w.changed(); });
      await ctx.clic(shell, ctx.ligne('Page A'));
      await jusqua(async () => (await volets()).titres.join() === 'Page A', 'Page A seule');
      const e = await ctx.principal(({ w }) => w.contentRect());
      await ctx.glisser(await ctx.centre(ctx.ligne('Page C')), () => ({ x: e.x + e.width * 0.8, y: e.y + e.height / 2 }));
      await jusqua(async () => (await volets()).titres.join() === 'Page A,Page C', 'vue scindée A | C');
      assert.equal((await volets()).empile, false);
      await ctx.principal(({ w }) => { for (const id of w.space.today) w.leaveSplit(id); w.layout(); w.changed(); });
      await jusqua(async () => (await volets()).titres.length === 1, 'vue scindée défaite');
    });

    // --- Dossier fermé ------------------------------------------------------------------
    await t.verifier('glisser un onglet sur un dossier fermé : il ne s’ouvre pas pendant le survol ; au dépôt l’onglet y entre et l’icône du dossier rebondit', async () => {
      await ctx.principal(({ w }) => { w.space.pinned.push({ type: 'folder', id: 'f-ferme', name: 'Fermé', open: false, children: [] }); w.changed(); });
      const dossier = shell.locator('#pinned .folder').first();
      await jusqua(async () => (await dossier.count()) === 1, 'dossier affiché');
      const reduit = await shell.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
      await ctx.vitesseAnimations(0.1); // le rebond dure 280 ms : ralenti, il se laisse observer
      let survol = null;
      try {
        const r = await ctx.glisser(await ctx.centre(ctx.ligne('Page D')), () => ctx.centre(dossier.locator('> .row')), {
          pause: 500,
          avantLacher: async () => { survol = await shell.evaluate(() => { const f = document.querySelector('#pinned .folder'); return { ouvert: f.classList.contains('open'), vise: f.classList.contains('drop-into') }; }); },
        });
        assert.equal(r.dossier, true, 'le dossier est mis en évidence pendant le survol');
        assert.deepEqual(survol, { ouvert: false, vise: true });
        if (!reduit) {
          const anime = await jusqua(() => shell.evaluate(() => { const ic = document.querySelector('#pinned .folder > .row .ic'); return ic ? ic.getAnimations().filter((a) => a.id === 'drop-pulse').length : 0; }), 'rebond de l’icône', 3000);
          assert.equal(anime, 1);
        }
      } finally { await ctx.vitesseAnimations(1); }
      await jusqua(async () => { const p = (await ctx.etat()).epingles[0]; return p && p.enfants.map((x) => x.title).join() === 'Page D'; }, 'onglet dans le dossier');
      assert.equal((await ctx.etat()).epingles[0].ouvert, false, 'le dossier est resté fermé');
      assert.equal(await dossier.evaluate((f) => f.classList.contains('open')), false);
    });

    // --- Hors de la fenêtre -------------------------------------------------------------
    // Le glisser est mené en événements bruts (protocole DevTools) : la souris de Playwright
    // ne sort pas de la fenêtre. Le point « hors de la fenêtre » est celui que le système
    // donnerait : il est fourni au processus principal à la place du vrai pointeur.
    const lacherDehors = async (de) => {
      const cdp = await shell.context().newCDPSession(shell);
      let donnees = null;
      cdp.on('Input.dragIntercepted', (e) => { donnees = e.data; });
      await cdp.send('Input.setInterceptDrags', { enabled: true });
      const souris = (type, x, y, buttons) => cdp.send('Input.dispatchMouseEvent', { type, x, y, buttons, clickCount: 1, button: type === 'mouseMoved' && !buttons ? 'none' : 'left' }).catch(() => {});
      await souris('mouseMoved', de.x, de.y, 0);
      await souris('mousePressed', de.x, de.y, 1);
      await souris('mouseMoved', de.x + 3, de.y + 3, 1);
      await souris('mouseMoved', de.x + 8, de.y + 8, 1);
      await jusqua(() => donnees, 'glisser commencé', 3000);
      await ctx.sleep(200);
      await cdp.send('Input.dispatchDragEvent', { type: 'dragCancel', x: -240, y: de.y, data: donnees });
      await souris('mouseReleased', -240, de.y, 0);
      await cdp.send('Input.setInterceptDrags', { enabled: false }).catch(() => {});
      await cdp.detach().catch(() => {});
      return donnees;
    };

    let donneesGlisser = null;
    await t.verifier('glisser un onglet hors de la fenêtre : il s’ouvre dans une nouvelle fenêtre ; la première passe à l’onglet voisin', async () => {
      await ctx.clic(shell, ctx.ligne('Page A'));
      await jusqua(async () => (await volets()).actif === 'Page A', 'Page A affichée');
      await ctx.principal(({ w, win }) => { const b = w.win.getBounds(); win.hooks.cursor0 = win.hooks.cursor0 || win.hooks.cursor; win.hooks.cursor = () => ({ x: b.x + b.width + 400, y: b.y + 120 }); });
      donneesGlisser = await lacherDehors(await ctx.centre(ctx.ligne('Page A')));
      await jusqua(async () => (await fenetres()).length === 2, 'seconde fenêtre');
      await jusqua(async () => (await fenetres()).some((f, i) => i > 0 && f.actif === 'Page A'), 'Page A dans la nouvelle fenêtre');
      const f = await fenetres();
      assert.notEqual(f[0].actif, 'Page A', 'la première fenêtre est passée à un autre onglet');
      assert.ok(f[0].actif, 'la première fenêtre garde une page');
      assert.equal(f[1].prive, false);
      assert.deepEqual(await shell.evaluate(() => ({ corps: document.body.classList.contains('dragging'), soi: document.querySelectorAll('.dragging-self').length })), { corps: false, soi: 0 });
      assert.ok((await ctx.titres()).includes('Page A'), 'l’onglet reste dans la liste, commune aux fenêtres');
    });

    await t.verifier('glisser abandonné à l’intérieur de la fenêtre : aucune fenêtre de plus', async () => {
      await ctx.principal(({ w, win }) => { const b = w.win.getBounds(); win.hooks.cursor = () => ({ x: b.x + 60, y: b.y + 60 }); });
      const r = await ctx.tenterGlisser(await ctx.centre(ctx.ligne('Page B')));
      assert.equal(r.intercepte, true);
      await ctx.sleep(300);
      assert.equal((await fenetres()).length, 2);
    });

    await t.verifier('ligne lâchée sur la barre latérale de l’autre fenêtre : c’est elle qui affiche l’onglet', async () => {
      const autre = await jusqua(() => ctx.pages().find((p) => p !== shell && /shell\.html$/.test(p.url())), 'barre de la seconde fenêtre');
      await jusqua(() => autre.evaluate(() => typeof S === 'object' && !!S && document.querySelectorAll('#today .row.tab').length > 0), 'seconde barre prête');
      const idB = await ctx.principal(({ w }) => Object.keys(w.data.tabs).find((id) => w.data.tabs[id].title === 'Page B'));
      await ctx.clic(shell, ctx.ligne('Page B'));
      await jusqua(async () => (await fenetres())[0].actif === 'Page B', 'Page B dans la première fenêtre');
      const cdp = await autre.context().newCDPSession(autre);
      const data = { items: [{ mimeType: 'application/x-orbe-item', data: idB }, { mimeType: 'text/plain', data: idB }], dragOperationsMask: 19 };
      const box = await autre.locator('#today').boundingBox();
      const pt = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + 20) };
      for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, x: pt.x, y: pt.y, data });
      await cdp.detach().catch(() => {});
      await jusqua(async () => (await fenetres())[1].actif === 'Page B', 'Page B dans la seconde fenêtre');
      const f = await fenetres();
      assert.notEqual(f[0].actif, 'Page B');
      // Aucun onglet n'a été créé par ce dépôt (ce n'est pas une adresse).
      assert.equal((await ctx.titres()).filter((x) => x === 'Page B').length, 1);
      await ctx.principal(({ win }) => { win.hooks.cursor = win.hooks.cursor0; const w2 = win.OrbeWindow.all[1]; win.OrbeWindow.all[0].activate(win.OrbeWindow.all[0].space.today[0]); w2.win.close(); });
      await jusqua(async () => (await fenetres()).length === 1, 'seconde fenêtre fermée');
    });

    // --- Téléchargement en cours au bas de la barre -----------------------------------------
    await t.verifier('téléchargement en cours : une ligne au bas de la barre (nom, taille, progression) ; un clic ouvre les téléchargements ; « × » l’annule', async () => {
      const GROS = Buffer.alloc(4 * 1024 * 1024, 7);
      const serveur = http.createServer((req, res) => {
        res.setHeader('content-type', 'application/octet-stream');
        res.setHeader('content-disposition', 'attachment; filename="gros.bin"');
        res.setHeader('content-length', String(GROS.length));
        let at = 0;
        const timer = setInterval(() => {
          if (res.destroyed || at >= GROS.length) { clearInterval(timer); if (!res.destroyed) res.end(); return; }
          res.write(GROS.subarray(at, at + 16384));
          at += 16384;
        }, 100);
      });
      await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
      const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-ui-dl2-'));
      try {
        await ctx.clic(shell, ctx.ligne('Page A'));
        await jusqua(async () => (await volets()).actif === 'Page A', 'Page A affichée');
        await ctx.principal(({ w, store }, a) => { store.state.settings.downloadDir = a.dir; w.activeRt.wc.downloadURL(a.url); }, { dir: dossier, url: `http://127.0.0.1:${serveur.address().port}/gros.bin` });
        const ligne = shell.locator('#dls .dl').first();
        await jusqua(() => ligne.isVisible(), 'ligne du téléchargement', 10000);
        assert.equal(await ligne.locator('.dl-name').textContent(), 'gros.bin');
        const unites = (await ctx.texte('dl.units')).split(' ');
        await jusqua(async () => new RegExp(`^[\\d.]+ (${unites.join('|')}) / 4\\.0 ${unites[2]}( · .+)?$`).test(await ligne.locator('.dl-sub').textContent()), 'taille reçue sur taille totale', 8000);
        await jusqua(async () => /restantes|left/.test(await ligne.locator('.dl-sub').textContent()), 'temps restant affiché', 8000);
        // La ligne tient au-dessus de la rangée du bas, dans la barre.
        const b = await ligne.boundingBox();
        const bas = await shell.locator('#bottom').boundingBox();
        const barre = await shell.locator('#sidebar').boundingBox();
        assert.ok(b.y + b.height <= bas.y + 1 && b.x >= barre.x && b.x + b.width <= barre.x + barre.width, JSON.stringify([b, bas, barre]));
        await ctx.capture('telechargement-barre');
        await ctx.clic(shell, ligne.locator('.dl-name'));
        await ctx.attendrePage('library.html');
        await ctx.clic(shell, ligne.locator('.dl-x'));
        await jusqua(async () => (await shell.locator('#dls .dl').count()) === 0, 'ligne retirée');
        await jusqua(() => !fs.existsSync(path.join(dossier, 'gros.bin')), 'morceau retiré');
        assert.equal(await ctx.principal(({ store }) => store.state.downloads.filter((d) => d.name === 'gros.bin').map((d) => d.state).join()), 'cancelled');
      } finally {
        serveur.closeAllConnections();
        serveur.close();
        try { fs.rmSync(dossier, { recursive: true, force: true }); } catch {}
      }
    });

    // --- Menus : pastille d'un favori, export d'un Espace, profil rappelé ---------------------
    // (Un menu natif ne se pilote pas : il est relevé au moment où Orbe l'ouvre, après un vrai clic droit.)
    await ctx.principal(({ w }) => { w.popup = (tpl) => { w.menuVu = tpl; }; });
    const menuContextuel = async (loc) => {
      await ctx.principal(({ w }) => { w.menuVu = null; });
      await ctx.clic(shell, loc, { button: 'right' });
      await jusqua(() => ctx.principal(({ w }) => !!w.menuVu), 'menu contextuel');
    };
    const choisir = (cle) => ctx.principal(({ w, store }, k) => { const it = w.menuVu.find((x) => x.label === store.t(k) && x.visible !== false); if (!it) throw new Error('article absent : ' + k); return it.click(); }, cle);

    await t.verifier('favori : la pastille montre le nombre annoncé par le site ; « Afficher la pastille de notification » décochée la retire', async () => {
      await ctx.clic(shell, ctx.ligne('Page A'));
      await jusqua(async () => (await volets()).actif === 'Page A', 'Page A affichée');
      await menuContextuel(ctx.ligne('Page A'));
      await choisir('tabs.addFavorite');
      const tuile = shell.locator('#fav .tile').first();
      await jusqua(async () => (await tuile.count()) === 1, 'tuile du favori');
      await ctx.onglet('/a').evaluate(() => { document.title = '(3) Boîte de réception'; });
      const pastille = tuile.locator('.count');
      await jusqua(async () => (await pastille.count()) === 1 && (await pastille.isVisible()) && (await pastille.textContent()) === '3', 'pastille « 3 »');
      await menuContextuel(tuile);
      assert.equal(await ctx.principal(({ w, store }) => w.menuVu.find((x) => x.label === store.t('tabs.showBadge')).checked), true);
      await choisir('tabs.showBadge');
      await jusqua(async () => !(await pastille.isVisible()), 'pastille retirée');
      await menuContextuel(tuile);
      assert.equal(await ctx.principal(({ w, store }) => w.menuVu.find((x) => x.label === store.t('tabs.showBadge')).checked), false);
      await choisir('tabs.removeFavorite');
      await jusqua(async () => (await shell.locator('#fav .tile').count()) === 0, 'favori retiré');
      await ctx.onglet('/a').evaluate(() => { document.title = 'Page A'; });
      await jusqua(async () => (await ctx.titres()).includes('Page A'), 'titre rétabli');
    });

    await t.verifier('clic droit sur l’en-tête de l’Espace → « Exporter l’Espace… » : un fichier de signets est écrit, avec les onglets', async () => {
      const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-ui-export-'));
      const fichier = path.join(dossier, 'espace.html');
      try {
        await ctx.principal(({ win }, f) => { win.hooks.saveFile0 = win.hooks.saveFile; win.hooks.saveFile = async () => f; }, fichier);
        await menuContextuel(shell.locator('#space-head'));
        await choisir('spaces.export');
        await jusqua(() => fs.existsSync(fichier), 'fichier écrit');
        const html = fs.readFileSync(fichier, 'utf8');
        assert.ok(html.includes(`<A HREF="${ctx.url('/b')}">Page B</A>`) && html.includes(`<A HREF="${ctx.url('/d')}">Page D</A>`) && html.includes('<H3>Fermé</H3>'), html);
      } finally {
        await ctx.principal(({ win }) => { win.hooks.saveFile = win.hooks.saveFile0; });
        try { fs.rmSync(dossier, { recursive: true, force: true }); } catch {}
      }
    });

    await t.verifier('plusieurs profils : « Déplacer vers » rappelle le profil de chaque Espace', async () => {
      await ctx.principal(({ w, store }) => { const sp = store.makeSpace('Travail', '💼', '#f59e0b'); w.data.profiles.push({ id: 'pro', name: 'Bureau' }); w.data.favs.pro = []; sp.profileId = 'pro'; w.data.spaces.push(sp); w.changed(); });
      await menuContextuel(ctx.ligne('Page B'));
      const noms = await ctx.principal(({ w, store }) => w.menuVu.find((x) => x.label === store.t('tabs.moveTo')).submenu.map((x) => x.label));
      assert.ok(noms.includes('💼 Travail  ·  Bureau'), JSON.stringify(noms));
    });

    // --- Infobulles maison ---------------------------------------------------------------------
    await t.verifier('pointeur posé sur « actualiser » : infobulle maison avec le raccourci ; elle suit le bouton survolé et s’efface quand le pointeur s’en va', async () => {
      const tip = shell.locator('#tip');
      await shell.mouse.move(600, 500);
      const b = await ctx.centre(shell.locator('#b-reload'));
      await shell.mouse.move(b.x, b.y, { steps: 4 });
      await jusqua(() => tip.evaluate((el) => !el.hidden && el.classList.contains('on')), 'infobulle affichée');
      assert.equal(await shell.locator('#tip-text').textContent(), await ctx.texte('side.reload'));
      assert.equal(await shell.locator('#tip-key').textContent(), await shell.evaluate(() => KEYS.reload));
      assert.ok((await shell.locator('#tip-key').textContent()).length > 0);
      const boite = await tip.boundingBox();
      const barre = await shell.locator('#sidebar').boundingBox();
      assert.ok(boite.x >= barre.x && boite.x + boite.width <= barre.x + barre.width, 'l’infobulle tient dans la barre latérale : ' + JSON.stringify([boite, barre]));
      assert.ok(boite.y >= b.box.y + b.box.height, 'sous le bouton');
      assert.equal(await shell.locator('#b-reload').getAttribute('title'), null);
      await ctx.capture('infobulle');
      // Bouton grisé voisin (aucune page précédente) : l'infobulle d'« actualiser » ne reste pas.
      assert.equal(await shell.locator('#b-forward').isDisabled(), true);
      const g = await ctx.centre(shell.locator('#b-forward'));
      await shell.mouse.move(g.x, g.y, { steps: 3 });
      await jusqua(() => tip.evaluate((el) => el.hidden), 'infobulle effacée sur un bouton grisé');
      const c = await ctx.centre(shell.locator('#b-sidebar'));
      await shell.mouse.move(c.x, c.y, { steps: 3 });
      await jusqua(async () => (await tip.evaluate((el) => !el.hidden)) && (await shell.locator('#tip-text').textContent()) === (await ctx.texte('side.sidebar')), 'infobulle de la barre latérale');
      await shell.mouse.move(600, 500, { steps: 3 });
      await jusqua(() => tip.evaluate((el) => el.hidden), 'infobulle effacée');
    });

    // --- Barre resserrée -----------------------------------------------------------------------
    await t.verifier('bord de la barre tiré jusqu’au minimum : précédent, suivant et actualiser restent visibles ; « actualiser » répond au clic ; le haut de la barre reste une zone qui déplace la fenêtre', async () => {
      const avant = (await ctx.etat()).largeur;
      const bord = await ctx.centre(shell.locator('#resize'), 0.5, 0.4);
      await shell.mouse.move(bord.x, bord.y);
      await shell.mouse.down();
      await shell.mouse.move(150, bord.y, { steps: 6 });
      await shell.mouse.up();
      await jusqua(async () => (await ctx.etat()).largeur === 200, 'largeur minimale');
      const barre = await shell.locator('#sidebar').boundingBox();
      for (const id of ['#b-back', '#b-forward', '#b-reload']) {
        const b = await shell.locator(id).boundingBox();
        assert.ok(b && b.width >= 24 && b.x >= barre.x && b.x + b.width <= barre.x + barre.width, `${id} entier dans la barre : ${JSON.stringify([b, barre])}`);
      }
      await ctx.clic(shell, ctx.ligne('Page B'));
      await jusqua(async () => (await volets()).actif === 'Page B', 'Page B affichée');
      // Page B dormait (elle a changé de fenêtre plus haut) : le clic la réveille, et tant qu'elle
      // charge le bouton est « Arrêter ». On attend qu'il redevienne « Actualiser », comme on le
      // lirait à l'écran ; cliquer avant arrêterait le réveil au lieu d'actualiser.
      await pageBChargee();
      const vus = ctx.hits['/b'];
      await ctx.clic(shell, '#b-reload');
      await jusqua(() => ctx.hits['/b'] > vus, 'page rechargée');
      await pageBChargee();
      await ctx.principal(({ w }, l) => w.setSidebarWidth(l), avant);
      await jusqua(async () => (await ctx.etat()).largeur === avant, 'largeur rétablie');
      // Entre le bouton de la barre et les flèches : la zone qui déplace la fenêtre (un vrai déplacement ne se pilote pas d'ici).
      const zone = await shell.evaluate(() => {
        const a = document.getElementById('b-sidebar').getBoundingClientRect();
        const b = document.getElementById('b-back').getBoundingClientRect();
        const el = document.elementFromPoint((a.right + b.left) / 2, a.top + a.height / 2);
        const cs = getComputedStyle(el);
        return { large: b.left - a.right, region: cs.getPropertyValue('app-region') || cs.getPropertyValue('-webkit-app-region') };
      });
      assert.ok(zone.large > 20 && zone.region === 'drag', JSON.stringify(zone));
    });

    // --- Économie de batterie ------------------------------------------------------------------
    await t.verifier('Réglages → Onglets : « Économie de batterie », cochée par défaut ; un clic la coupe, sans que le volet ait besoin de défiler', async () => {
      await ctx.menu('Cmd+,');
      const r = await ctx.attendrePage('settings.html');
      await ctx.clic(r, r.locator('#tabs [role=tab][data-pane=tabs]'));
      const boite = r.locator('#batterySaver');
      await jusqua(() => boite.isVisible(), 'case « Économie de batterie »');
      assert.equal(await boite.isChecked(), true);
      assert.equal(await r.locator('.line', { has: boite }).locator('.grow > div').first().textContent(), await ctx.texte('set.batterySaver'));
      await jusqua(() => r.evaluate(() => { const p = document.getElementById('panes'); return p.scrollHeight - p.clientHeight <= 0; }), 'fenêtre à la hauteur du volet');
      await ctx.clic(r, boite);
      await jusqua(() => ctx.principal(({ store }) => store.state.settings.batterySaver === false), 'réglage coupé');
      await ctx.clic(r, boite);
      await jusqua(() => ctx.principal(({ store }) => store.state.settings.batterySaver === true), 'réglage rétabli');
      await ctx.principal(({ req }) => { const win = req('panes.js').window; if (win && !win.isDestroyed()) win.close(); });
    });

    // --- Bande au-dessus de la page ------------------------------------------------------------
    await t.verifier('au-dessus de la page, une bande déplace la fenêtre ; elle s’arrête où la page commence, et la page reçoit toujours les clics', async () => {
      await ctx.clic(shell, ctx.ligne('Page B'));
      await jusqua(async () => (await volets()).actif === 'Page B', 'Page B affichée');
      await pageBChargee(); // l'écouteur posé plus bas ne survivrait pas à un chargement en cours
      const e = await ctx.principal(({ w }) => w.contentRect());
      const sous = (x, y) => shell.evaluate(([px, py]) => { const el = document.elementFromPoint(px, py); const cs = el ? getComputedStyle(el) : null; return el ? { id: el.id, region: cs.getPropertyValue('app-region') || cs.getPropertyValue('-webkit-app-region') } : null; }, [x, y]);
      assert.deepEqual(await sous(e.x + e.width / 2, 4), { id: 'page-drag', region: 'drag' });
      const bande = await shell.locator('#page-drag').boundingBox();
      assert.ok(bande.y + bande.height <= e.y, 'la bande ne recouvre pas la page : ' + JSON.stringify([bande, e]));
      // Un vrai clic en haut de la page arrive à la page (la vue de l'onglet est au-dessus de la coque).
      const page = ctx.onglet('/b');
      await page.evaluate(() => { window.__clics = 0; document.addEventListener('mousedown', () => { window.__clics += 1; }, true); });
      await page.mouse.click(e.width / 2, 3);
      assert.equal(await page.evaluate(() => window.__clics), 1);
    });

    // --- Fenêtre → Médias ------------------------------------------------------------------------
    await t.verifier('menu « Médias » : la Bibliothèque s’ouvre sur ses médias ; un clic sur « Téléchargements » change de section', async () => {
      await ctx.menu('lib.media');
      const lib = await ctx.attendrePage('library.html');
      await jusqua(() => lib.evaluate(() => { const on = document.querySelector('[data-tab].on'); return !!on && on.dataset.tab === 'media'; }), 'section Médias');
      await ctx.clic(lib, lib.locator('[data-tab=downloads]'));
      await jusqua(() => lib.evaluate(() => document.querySelector('[data-tab].on').dataset.tab === 'downloads'), 'section Téléchargements');
    });

    // --- Échap en plein écran -------------------------------------------------------------
    const plein = () => ctx.principal(({ w }) => w.win.isFullScreen());
    await ctx.menu('Ctrl+Cmd+F');
    let entre = await jusqua(plein, 'plein écran', 6000).catch(() => false);
    // Session verrouillée : le système annonce le plein écran puis y renonce ; on attend qu'il tienne.
    if (entre) { await ctx.sleep(1500); entre = await plein(); }
    if (!entre) {
      t.ignorer('plein écran : un Échap ne fait rien, Échap doublé fait sortir la fenêtre du plein écran', 'la fenêtre n’entre pas en plein écran ici (session verrouillée ou écran absent)');
      await ctx.principal(({ w }) => w.win.setFullScreen(false));
    } else {
      await t.verifier('fenêtre en plein écran : ⌘N ouvre la nouvelle fenêtre en plein écran elle aussi', async () => {
        // La demande de plein écran est relevée sans être exécutée : deux fenêtres en plein écran se disputeraient l'écran de la machine d'essai.
        await ctx.principal(({ win }) => { win.hooks.enterFullScreen0 = win.hooks.enterFullScreen; global.__plein = []; win.hooks.enterFullScreen = (bw) => { global.__plein.push(bw.id); }; });
        try {
          await ctx.menu('Cmd+N');
          await jusqua(async () => (await fenetres()).length === 2, 'seconde fenêtre');
          const vu = await ctx.principal(({ win }) => ({ demandes: global.__plein, nouvelle: win.OrbeWindow.all[1].win.id }));
          assert.deepEqual(vu.demandes, [vu.nouvelle]);
        } finally {
          await ctx.principal(({ win }) => { win.hooks.enterFullScreen = win.hooks.enterFullScreen0; const w2 = win.OrbeWindow.all[1]; if (w2) w2.win.close(); });
          await jusqua(async () => (await fenetres()).length === 1, 'seconde fenêtre fermée');
        }
      });

      await t.verifier('plein écran : un Échap ne fait rien, Échap doublé fait sortir la fenêtre du plein écran', async () => {
        // La touche est envoyée par Electron à la vue de la barre (les frappes du protocole DevTools
        // ne passent pas par le filtre des raccourcis d'Orbe).
        const echap = () => ctx.principal(({ w }) => { for (const type of ['keyDown', 'keyUp']) w.ui.webContents.sendInputEvent({ type, keyCode: 'Escape' }); });
        await echap();
        await ctx.sleep(700);
        assert.equal(await plein(), true, 'un seul Échap : toujours en plein écran');
        assert.ok(await ctx.principal(({ w }) => w.escAt > 0), 'la touche est arrivée jusqu’à Orbe');
        await echap();
        await ctx.sleep(80);
        await echap();
        await jusqua(async () => !(await plein()), 'sortie du plein écran', 6000);
      });
    }
  },
};
