// Import depuis un navigateur installé, accueil du premier lancement et mises à
// jour, à la souris : de faux profils de navigateurs dans un dossier temporaire,
// et un serveur local à la place de GitHub. Rien n'est lu des vrais navigateurs
// de la machine, rien ne part vers Internet.
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const fx = require('../fixtures/navigateurs');

module.exports = {
  nom: 'Import, accueil, mises à jour',
  async test(ctx, t) {
    const { shell, jusqua } = ctx;
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-ui-nav-'));
    const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-ui-maj-'));
    fx.profils(home, { platform: 'darwin' });
    await ctx.principal(({ req }, h) => {
      req('import-browsers.js').configure({ home: h, platform: 'darwin', sqlite: '' });
      // Le navigateur par défaut du système n'est jamais changé par un test.
      const platform = req('platform.js');
      global.__defaut = 0;
      platform.makeDefault = () => { global.__defaut += 1; };
    }, home);

    // --- Serveur qui joue GitHub -----------------------------------------------------
    const zip = Buffer.concat([Buffer.from('PK\u0003\u0004'), crypto.randomBytes(40000)]);
    const demandes = [];
    const serveur = http.createServer((req, res) => {
      demandes.push({ url: req.url, agent: req.headers['user-agent'], cookie: req.headers.cookie || '' });
      if (req.url.startsWith('/releases/download/v9.1.0/')) return res.end(zip);
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({
        tag_name: 'v9.1.0', name: 'Orbe 9.1', body: 'Import depuis Chrome, Firefox et Safari\n<b>pas du HTML</b>', draft: false, prerelease: false, published_at: '2026-10-08T09:00:00Z',
        assets: serveur.archive ? [{ name: serveur.archive, size: zip.length, digest: 'sha256:' + crypto.createHash('sha256').update(zip).digest('hex'), browser_download_url: 'https://pirate.example/ignoree.zip' }] : [],
      }));
    });
    await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
    serveur.archive = await ctx.principal(({ req }, a) => {
      const u = req('updates.js');
      global.__maj = { ouverts: [], montres: [] };
      u.configure({ test: true, endpoint: a.url, version: '0.12.0', downloadsDir: () => a.dl, reveal: (f) => global.__maj.montres.push(f), open: (x) => global.__maj.ouverts.push(x) });
      return u.assetName('9.1.0');
    }, { url: `http://127.0.0.1:${serveur.address().port}/repos/amadoubaui/orbe/releases/latest`, dl });

    await ctx.ouvrir('/a', 'Page A');
    let r = null;
    const volet = () => r.evaluate(() => [...document.querySelectorAll('.pane')].filter((p) => !p.hidden).map((p) => p.id.replace('pane-', '')).join());
    const ligne = (id) => r.locator(`#import-browsers .imp-row[data-browser="${id}"]`);

    // --- Import depuis un navigateur installé --------------------------------------------
    await t.verifier('volet Import : les navigateurs installés sont listés, avec leurs profils', async () => {
      await ctx.menu('Cmd+,');
      r = await ctx.attendrePage('settings.html');
      await r.click('#tab-import');
      await jusqua(async () => (await volet()) === 'import', 'volet Import');
      await jusqua(async () => (await r.locator('#import-browsers .imp-row').count()) === 5, 'navigateurs listés');
      assert.deepEqual(await r.locator('#import-browsers .imp-name').allTextContents(), ['Google Chrome', 'Brave', 'Opera', 'Firefox', 'Safari']);
      assert.deepEqual(await ligne('chrome').locator('.imp-profile option').allTextContents(), ['Amadou', 'Travail']);
      // La fenêtre a pris la hauteur du volet : la dernière ligne est visible sans défiler.
      await jusqua(() => r.evaluate(() => { const p = document.getElementById('panes'); return p.scrollHeight - p.clientHeight <= 0; }), 'volet à sa hauteur');
    });

    await t.verifier('« Aperçu… » compte les signets sans rien importer ; « Annuler » revient en arrière', async () => {
      const avant = await ctx.etat();
      await ligne('chrome').locator('.imp-go').click();
      await jusqua(async () => (await ligne('chrome').locator('.imp-apply').count()) === 1, 'aperçu de Chrome');
      assert.match(await ligne('chrome').locator('.imp-sub').textContent(), /^5 signets et 3 dossiers trouvés\. 2 entrées ignorées/);
      assert.equal((await ctx.etat()).espaces.length, avant.espaces.length);
      assert.equal(await ctx.principal(({ w }) => Object.keys(w.data.tabs).length), 1);
      await ligne('chrome').locator('.imp-cancel').click();
      await jusqua(async () => (await ligne('chrome').locator('.imp-go').count()) === 1, 'aperçu abandonné');
      assert.equal((await ctx.etat()).espaces.length, avant.espaces.length);
    });

    await t.verifier('« Importer » : un Espace au nom du navigateur, signets épinglés et dossiers dans la barre latérale', async () => {
      await ligne('chrome').locator('.imp-go').click();
      await ligne('chrome').locator('.imp-apply').click();
      await jusqua(async () => (await ctx.etat()).espace === 'Google Chrome', 'Espace « Google Chrome » affiché');
      const e = await ctx.etat();
      assert.deepEqual(e.epingles.map((n) => n.dossier || n.title), ['Wikipédia', 'Lecture', 'Titre piégé gras', 'Autres favoris']);
      assert.deepEqual(e.epingles[1].enfants.map((n) => n.dossier || n.title), ['Le Monde', 'Tech']);
      await jusqua(async () => (await ctx.titres('#pinned')).includes('Wikipédia'), 'signets dans la barre latérale');
      assert.equal(await ligne('chrome').locator('.imp-sub').textContent(), '5 signets importés dans 🔖 Google Chrome.');
    });

    await t.verifier('« Annuler l’import » retire l’Espace et ses onglets', async () => {
      await ligne('chrome').locator('.imp-undo').click();
      await jusqua(async () => !(await ctx.etat()).espaces.some((s) => s.nom === 'Google Chrome'), 'Espace retiré');
      assert.equal(await ctx.principal(({ w }) => Object.keys(w.data.tabs).length), 1);
      assert.match(await ligne('chrome').locator('.imp-sub').textContent(), /^Import annulé/);
      await jusqua(async () => !(await ctx.titres('#pinned')).includes('Wikipédia'), 'barre latérale revenue');
    });

    await t.verifier('Firefox (sauvegarde automatique) et Safari (liste binaire) s’importent de même, dans l’Espace choisi', async () => {
      await ligne('firefox').locator('.imp-go').click();
      await jusqua(async () => /sauvegarde automatique de Firefox du 2026-10-02/.test(await ligne('firefox').locator('.imp-sub').textContent()), 'aperçu de Firefox');
      const ici = await ctx.principal(({ w }) => 'space:' + w.spaceId);
      await ligne('firefox').locator('.imp-dest').selectOption(ici);
      await ligne('firefox').locator('.imp-apply').click();
      await jusqua(async () => (await ctx.titres('#pinned')).includes('Mozilla'), 'signets de Firefox épinglés dans l’Espace affiché');
      const e = await ctx.etat();
      assert.deepEqual(e.epingles.map((n) => n.dossier || n.title), ['Mozilla', 'Outils', 'Menu des signets', 'Autres signets']);
      await ligne('safari').locator('.imp-go').click();
      await jusqua(async () => /^5 signets et 3 dossiers/.test(await ligne('safari').locator('.imp-sub').textContent()), 'aperçu de Safari');
      await ligne('safari').locator('.imp-dest').selectOption(ici);
      await ligne('safari').locator('.imp-apply').click();
      // L'Espace a déjà des épinglés : Safari arrive dans un dossier à son nom.
      await jusqua(async () => (await ctx.etat()).epingles.some((n) => n.dossier === 'Safari'), 'dossier « Safari »');
      const s = (await ctx.etat()).epingles.find((n) => n.dossier === 'Safari');
      assert.deepEqual(s.enfants.map((n) => n.dossier || n.title), ['Apple', 'Sénégal', 'Menu des signets', 'Voyages']);
    });

    // --- Mises à jour --------------------------------------------------------------------
    await t.verifier('menu « Rechercher les mises à jour… » : la carte annonce la version et ses notes, comme du texte', async () => {
      await ctx.menu('app.checkUpdates');
      await jusqua(async () => (await volet()) === 'advanced', 'volet Avancé').catch(async () => { r = await ctx.attendrePage('settings.html'); });
      r = await ctx.attendrePage('settings.html');
      await jusqua(async () => (await volet()) === 'advanced' && (await r.locator('#update-new').isVisible()), 'carte de la nouvelle version');
      assert.equal(await r.textContent('#update-version'), 'Orbe 0.12.0');
      assert.equal(await r.textContent('#update-state'), 'Orbe 9.1.0 est disponible');
      assert.match(await r.textContent('#update-notes'), /Import depuis Chrome, Firefox et Safari\n<b>pas du HTML<\/b>/);
      assert.equal(await r.locator('#update-notes b').count(), 0);
      assert.equal(demandes[0].agent, 'Orbe');
      assert.equal(demandes[0].cookie, '');
    });

    await t.verifier('barre latérale : note « Orbe 9.1.0 est disponible », sur une ligne au-dessus des Espaces ; × l’écarte', async () => {
      await jusqua(() => shell.locator('#update-note').isVisible(), 'note affichée');
      assert.equal(await shell.textContent('#update-open'), 'Orbe 9.1.0 est disponible');
      const b = await shell.locator('#update-note').boundingBox();
      const bas = await shell.locator('#bottom').boundingBox();
      assert.ok(b.y + b.height <= bas.y + 1 && b.height < 40, 'la note tient au-dessus des Espaces, sur une ligne : ' + JSON.stringify(b));
      // Au repos : un cœur qui bat (transformation seule), pas de croix. Au survol : la ligne
      // devient un bouton en dégradé, la croix paraît — sans changer de taille.
      const aspect = () => shell.evaluate(() => {
        const note = document.getElementById('update-note');
        const coeur = document.getAnimations().find((a) => a.animationName === 'update-heart');
        return { coeur: coeur ? [...new Set(coeur.effect.getKeyframes().flatMap((k) => Object.keys(k)))].filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)).join() : '', pseudo: coeur ? coeur.effect.pseudoElement : '',
          degrade: getComputedStyle(note, '::before').opacity, image: getComputedStyle(note, '::before').backgroundImage.slice(0, 16), croix: getComputedStyle(document.getElementById('update-close')).opacity };
      });
      await shell.mouse.move(700, 400);
      await jusqua(async () => { const a = await aspect(); return a.degrade === '0' && a.croix === '0'; }, 'note au repos');
      const repos = await aspect();
      if (!(await shell.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches))) assert.deepEqual([repos.coeur, repos.pseudo], ['transform', '::before'], 'le cœur bat par une transformation seule');
      assert.equal(repos.image, 'linear-gradient(');
      await jusqua(async () => { await shell.locator('#update-open').hover(); await ctx.sleep(60); const a = await aspect(); return a.degrade === '1' && a.croix === '1'; }, 'survol : dégradé et croix');
      assert.deepEqual(await shell.locator('#update-note').boundingBox(), b, 'la ligne ne change pas de taille au survol');
      await ctx.clic(shell, '#update-close');
      await jusqua(async () => !(await shell.locator('#update-note').isVisible()), 'note écartée');
      assert.equal(await ctx.principal(({ store }) => store.state.updates.dismissed), '9.1.0');
    });

    await t.verifier('« Page de téléchargement » et « Télécharger » : page de la version dans le dépôt d’Orbe ; archive vérifiée, montrée, jamais ouverte', async () => {
      await r.click('#update-page');
      await jusqua(async () => (await ctx.principal(() => global.__maj.ouverts.length)) === 1, 'page demandée');
      assert.equal(await ctx.principal(() => global.__maj.ouverts[0]), 'https://github.com/amadoubaui/orbe/releases/tag/v9.1.0');
      if (!serveur.archive) return;
      await r.click('#update-download');
      await jusqua(async () => (await r.locator('#update-reveal').isVisible()), 'archive téléchargée');
      const fichier = path.join(dl, serveur.archive);
      assert.ok(fs.readFileSync(fichier).equals(zip));
      assert.deepEqual(await ctx.principal(() => global.__maj.montres), [fichier]);
      assert.match(await r.textContent('#update-dl-state'), /Empreinte SHA-256 vérifiée ; l’archive est marquée comme venue d’Internet/);
      assert.match(await r.textContent('#update-how'), process.platform === 'darwin' ? /Ouvrir quand même/ : /SmartScreen/);
      assert.deepEqual(fs.readdirSync(dl), [serveur.archive]);
    });

    await t.verifier('l’interrupteur coupe la recherche automatique', async () => {
      await r.click('#updateCheck');
      await jusqua(async () => (await ctx.principal(({ store }) => store.state.settings.updateCheck)) === false, 'réglage coupé');
      assert.equal((await ctx.principal(({ req }) => req('updates.js').check())).state, 'disabled');
      await r.click('#updateCheck');
      await jusqua(async () => (await ctx.principal(({ store }) => store.state.settings.updateCheck)) === true, 'réglage rétabli');
      await r.keyboard.press('Escape').catch(() => {});
    });

    // --- Accueil ---------------------------------------------------------------------------
    let a = null;
    const etape = () => a.evaluate(() => document.querySelector('.step.on').dataset.step);
    await t.verifier('accueil : cinq étapes, une seule à l’écran, sans défilement', async () => {
      await ctx.principal(({ w, req }) => { req('commands.js').run(w, 'welcome'); });
      a = await ctx.attendrePage('welcome.html');
      await jusqua(async () => (await a.locator('#dots i').count()) === 5, 'accueil chargé');
      assert.equal(await etape(), 'hello');
      assert.equal(await a.textContent('.step.on h1'), 'Bienvenue dans Orbe');
      assert.equal(await a.locator('.step:visible').count(), 1);
      assert.equal((await a.textContent('#next')).trim(), 'Commencer');
      assert.ok(await a.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), 'la première étape tient dans la fenêtre');
    });

    await t.verifier('étape import : aperçu, import dans un nouvel Espace, annulation', async () => {
      await a.click('#next');
      await jusqua(async () => (await etape()) === 'import' && (await a.locator('#welcome-browsers .imp-row').count()) === 5, 'navigateurs proposés');
      const brave = a.locator('#welcome-browsers .imp-row[data-browser="brave"]');
      await brave.locator('.imp-go').click();
      await jusqua(async () => (await brave.locator('.imp-apply').count()) === 1, 'aperçu de Brave');
      await brave.locator('.imp-apply').click();
      await jusqua(async () => (await ctx.etat()).espaces.some((s) => s.nom === 'Brave'), 'Espace « Brave »');
      // L'accueil reste à l'écran : l'import ne change pas d'Espace sous les yeux de qui le suit.
      assert.equal(await ctx.principal(({ w }) => (w.data.tabs[w.activeId] || {}).url), 'orbe://app/welcome.html');
      assert.equal(await brave.locator('.imp-undo').isVisible(), true);
      await brave.locator('.imp-undo').click();
      await jusqua(async () => !(await ctx.etat()).espaces.some((s) => s.nom === 'Brave'), 'import annulé');
    });

    await t.verifier('étape couleur : la pastille choisie teinte l’Espace', async () => {
      await a.click('#next');
      await jusqua(async () => (await etape()) === 'theme' && (await a.locator('#colors button').count()) === 12, 'pastilles');
      await a.click('#colors button[data-color="#f97316"]');
      await jusqua(async () => (await ctx.principal(({ w }) => w.space.color)) === '#f97316', 'couleur de l’Espace');
      assert.equal(await a.getAttribute('#colors button[data-color="#f97316"]', 'aria-pressed'), 'true');
      assert.equal(await a.locator('#colors button[aria-pressed=true]').count(), 1);
    });

    await t.verifier('étape navigateur par défaut, puis dernière étape avec le mot de soutien ; « Commencer à naviguer » referme l’accueil', async () => {
      await a.click('#next');
      await jusqua(async () => (await etape()) === 'default', 'étape navigateur par défaut');
      await a.click('#make-default');
      await jusqua(async () => (await ctx.principal(() => global.__defaut)) === 1, 'demande faite au système (remplacée)');
      await a.click('#back');
      await jusqua(async () => (await etape()) === 'theme', 'retour');
      await a.keyboard.press('ArrowRight');
      await a.keyboard.press('ArrowRight');
      await jusqua(async () => (await etape()) === 'ready', 'dernière étape');
      assert.equal(await a.textContent('.support b'), await ctx.texte('support.title'));
      assert.equal(await a.textContent('.support .sub'), await ctx.texte('support.body'));
      assert.equal(await a.locator('.tips .line').count(), 6);
      assert.equal(await a.locator('#skip').isVisible(), false);
      await a.click('#next');
      await jusqua(() => !ctx.page('welcome.html'), 'accueil refermé');
      assert.equal(await ctx.principal(({ store }) => store.state.window.welcomed), true);
    });

    await new Promise((res) => { if (serveur.closeAllConnections) serveur.closeAllConnections(); serveur.close(res); });
    for (const d of [home, dl]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
  },
};
