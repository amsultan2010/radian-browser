// Navigation de tous les jours, à la souris et au clavier réels : avertissement
// de certificat, identifiants HTTP, fenêtre surgissante bloquée, demande
// d'autorisation, partage d'écran, « quitter la page ? », téléchargements.
// Les feuilles d'onglet (orbe://app/sheet.html) sont pilotées comme le ferait
// quelqu'un : on lit ce qu'elles affichent, on clique leurs boutons.
const assert = require('node:assert/strict');
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { selfSigned } = require('../certificat');

const GROS = Buffer.alloc(256 * 1024, 7);

function servir() {
  const page = (title, body) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px sans-serif;padding:40px">${body}</body>`;
  const vus = [];
  const handler = (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    vus.push({ chemin: p, auth: req.headers.authorization || '' });
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    if (p === '/auth') {
      if (req.headers.authorization !== 'Basic ' + Buffer.from('alice:secret').toString('base64')) {
        res.statusCode = 401;
        res.setHeader('www-authenticate', 'Basic realm="Espace membres"');
        return res.end(page('Refusé', 'accès refusé'));
      }
      return res.end(page('Entré', 'bienvenue'));
    }
    // Ouvre une fenêtre toute seule au chargement (sans geste), et une autre au clic.
    if (p === '/surgit') return res.end(page('Surgit', '<button id="ouvre" style="width:200px;height:50px">ouvrir</button><script>window.open("/pub"); document.getElementById("ouvre").onclick = () => window.open("/fille");</script>'));
    if (p === '/demandes') return res.end(page('Demandes', `<button id="notif" style="width:200px;height:50px">notifications</button> <button id="partage" style="width:200px;height:50px">partager</button> <button id="stop" style="width:200px;height:50px">arrêter</button><script>
      document.getElementById('notif').onclick = async () => { document.title = 'notif:' + await Notification.requestPermission(); };
      document.getElementById('partage').onclick = () => navigator.mediaDevices.getDisplayMedia({ video: true }).then((s) => { window.flux = s; document.title = 'flux:' + s.getVideoTracks().length; }, (e) => { document.title = 'refus:' + e.name; });
      document.getElementById('stop').onclick = () => { window.flux.getTracks().forEach((x) => x.stop()); document.title = 'arrêté'; };
    </script>`));
    if (p === '/sale') return res.end(page('Brouillon', '<textarea id="t" style="width:300px;height:80px"></textarea><script>let sale = false; document.getElementById("t").addEventListener("input", () => { sale = true; }); window.addEventListener("beforeunload", (e) => { if (sale) { e.preventDefault(); e.returnValue = "x"; } });</script>'));
    if (p === '/gros.bin') {
      res.setHeader('content-type', 'application/octet-stream');
      res.setHeader('content-disposition', 'attachment; filename="gros.bin"');
      res.setHeader('content-length', String(GROS.length));
      let at = 0;
      const timer = setInterval(() => {
        if (res.destroyed) return clearInterval(timer);
        res.write(GROS.subarray(at, at + 2048));
        at += 2048;
        if (at >= GROS.length) { clearInterval(timer); res.end(); }
      }, 60);
      res.on('close', () => clearInterval(timer));
      return undefined;
    }
    return res.end(page('Page ' + p, `<h1>${p}</h1>`));
  };
  const clair = http.createServer(handler);
  const pem = selfSigned();
  const chiffre = https.createServer({ key: pem.key, cert: pem.cert }, handler);
  return new Promise((resolve) => clair.listen(0, '127.0.0.1', () => chiffre.listen(0, '127.0.0.1', () => resolve({ clair, chiffre, vus, pem }))));
}

module.exports = {
  nom: 'Navigation de tous les jours (certificats, identifiants, fenêtres surgissantes, autorisations)',
  async test(ctx, t) {
    const { jusqua, sleep, shell } = ctx;
    const { clair, chiffre, vus, pem } = await servir();
    const A = `http://127.0.0.1:${clair.address().port}`;
    const S = `https://127.0.0.1:${chiffre.address().port}`;
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-ui-dl-'));

    // Rien du système n'est sollicité : ni boîte de dialogue, ni réglages, ni
    // capture de l'écran de la machine, ni vrai dossier Téléchargements.
    await ctx.principal(({ req, w, store }, dir) => {
      const e = req('essentials.js');
      e.permissions.os.status = () => 'granted';
      e.permissions.os.ask = async () => true;
      e.permissions.os.openSettings = () => {};
      e.permissions.env.openExternal = () => {};
      e.displayMedia.env.sources = async () => [];
      global.__quitter = { reponse: 1, questions: [] };
      e.unload.env.ask = (parent, opts) => { global.__quitter.questions.push(opts.message); return global.__quitter.reponse; };
      store.state.settings.downloadDir = dir;
      w.popup = (tpl) => { w.menuVu = tpl; };
    }, dossier);

    const allerA = (url) => ctx.principal(({ w }, u) => { w.newTab(u); }, url);
    const naviguer = (url) => ctx.principal(({ w }, u) => { w.activeRt.wc.loadURL(u).catch(() => {}); }, url);
    const pageDe = (url) => jusqua(() => ctx.pages().find((p) => p.url() === url), 'page ' + url, 10000);
    const titreActif = () => shell.locator('#sidebar .row.tab.active .title').first().textContent();
    // Feuille d'onglet affichée, de la sorte voulue.
    const feuille = (sorte) => jusqua(async () => {
      for (const p of ctx.pages().filter((x) => x.url().includes('sheet.html'))) {
        const ok = await p.evaluate((k) => { const c = document.getElementById('card'); return !!c && !c.hidden && c.dataset.kind === k; }, sorte).catch(() => false);
        if (ok) return p;
      }
      return null;
    }, 'feuille « ' + sorte + ' »', 10000);
    const plusDeFeuille = () => jusqua(() => ctx.principal(({ req, w }) => !req('sheets.js').top(w.activeRt.wc)), 'feuille refermée');
    const menuDe = async (selecteur) => {
      await ctx.principal(({ w }) => { w.menuVu = null; });
      await ctx.clic(shell, selecteur);
      return jusqua(() => ctx.principal(({ w }) => w.menuVu && w.menuVu.filter((x) => x.label).map((x) => x.label)), 'menu');
    };
    const choisir = (label) => ctx.principal(({ w }, l) => w.menuVu.find((x) => x.label === l).click(), label);
    const GARDE = 700; // les boutons qui engagent ignorent un clic trop rapide
    // Touche qui referme la feuille : la vue disparaît pendant la frappe, ce que
    // Playwright signale comme une erreur ; le résultat est vérifié ensuite.
    const touche = (f, nom) => f.keyboard.press(nom).catch(() => {});

    // ------------------------------------------------------------- Certificat
    await t.verifier('certificat refusé : page d’avertissement d’Orbe, « Revenir en lieu sûr » par défaut', async () => {
      await allerA(A + '/depart');
      await pageDe(A + '/depart');
      await naviguer(S + '/prive');
      const f = await feuille('cert');
      assert.equal(await f.textContent('#title'), await ctx.texte('cert.title'));
      assert.equal(await f.textContent('#site'), new URL(S).host);
      assert.deepEqual(await f.locator('#buttons button').evaluateAll((bs) => bs.map((b) => b.id)), ['back', 'more']);
      assert.equal(await f.locator('#proceed').isVisible(), false, '« Continuer quand même » n’est pas visible d’emblée');
      await jusqua(() => f.evaluate(() => document.activeElement && document.activeElement.id === 'back'), '« Revenir en lieu sûr » a le clavier');
      assert.ok(!vus.some((x) => x.chemin === '/prive'), 'la page du site n’a pas été demandée');
      await ctx.capture('19-certificat', f);
    });

    await t.verifier('pastille d’adresse : « Non sécurisé » pendant l’avertissement', async () => {
      await jusqua(async () => (await shell.locator('#lock').isVisible()) && (await shell.textContent('#lock-text')) === await ctx.texte('site.notSecure'), 'pastille « Non sécurisé »');
      assert.match(await shell.getAttribute('#lock', 'class'), /broken/);
    });

    await t.verifier('Entrée (choix par défaut) ramène à la page précédente', async () => {
      const f = await feuille('cert');
      await touche(f, 'Enter');
      await jusqua(async () => (await titreActif()) === 'Page /depart', 'retour à la page de départ');
      await plusDeFeuille();
      await jusqua(async () => !(await shell.locator('#lock').isVisible()), 'plus d’alerte dans la pastille');
    });

    await t.verifier('« Détails » montre l’émetteur et l’empreinte, puis « Continuer quand même » charge la page', async () => {
      await naviguer(S + '/prive');
      const f = await feuille('cert');
      await f.click('#more');
      const details = await f.textContent('#details');
      assert.ok(details.includes(pem.cn) && /sha256\//.test(details) && details.includes('ERR_CERT_AUTHORITY_INVALID'), details);
      await jusqua(() => f.locator('#proceed').isVisible(), 'lien « Continuer quand même »');
      await sleep(GARDE);
      await f.click('#proceed');
      await jusqua(async () => (await titreActif()) === 'Page /prive', 'page chargée');
      assert.ok(vus.some((x) => x.chemin === '/prive'));
    });

    await t.verifier('après « continuer » : la pastille reste « Non sécurisé » ; un clic dessus montre le certificat et l’exception', async () => {
      await jusqua(async () => /broken/.test((await shell.getAttribute('#lock', 'class')) || ''), 'pastille toujours en alerte');
      await ctx.clic(shell, '#lock');
      const f = await feuille('site');
      assert.equal(await f.textContent('#title'), await ctx.texte('site.sec.broken'));
      assert.ok((await f.textContent('#body')).includes(pem.cn));
      assert.equal(await f.locator('#perms .item').first().getAttribute('data-key'), 'cert-exception');
      await f.click('#close');
      await plusDeFeuille();
    });

    // ------------------------------------------------------------- Identifiants HTTP
    await t.verifier('authentification HTTP : la feuille nomme l’hôte et cite le serveur ; Échap annule', async () => {
      await allerA(A + '/auth');
      const f = await feuille('auth');
      assert.equal(await f.textContent('#site'), new URL(A).host);
      assert.equal(await f.textContent('.quote'), 'Espace membres');
      assert.equal(await f.textContent('#pending'), A + '/auth', 'l’adresse demandée est affichée');
      assert.equal(await f.evaluate(() => document.body.classList.contains('cover')), true, 'la feuille couvre l’ancienne page');
      await jusqua(() => f.evaluate(() => document.activeElement && document.activeElement.id === 'user'), 'champ « identifiant » prêt');
      await touche(f, 'Escape');
      await jusqua(async () => (await titreActif()) === 'Refusé', 'page de refus du serveur');
      assert.ok(!vus.some((x) => x.chemin === '/auth' && x.auth), 'aucun identifiant envoyé');
    });

    await t.verifier('identifiant et mot de passe tapés au clavier, Entrée : la page protégée s’affiche', async () => {
      await naviguer(A + '/auth');
      const f = await feuille('auth');
      await jusqua(() => f.evaluate(() => document.activeElement && document.activeElement.id === 'user'), 'champ « identifiant » prêt');
      await f.keyboard.type('alice');
      await f.keyboard.press('Tab');
      await f.keyboard.type('secret');
      assert.equal(await f.getAttribute('#pass', 'type'), 'password');
      await sleep(GARDE);
      await touche(f, 'Enter');
      await jusqua(async () => (await titreActif()) === 'Entré', 'page protégée');
      await plusDeFeuille();
      await ctx.capture('19-apres-auth');
    });

    // ------------------------------------------------------------- Fenêtres surgissantes
    let avant = 0;
    await t.verifier('fenêtre ouverte sans geste : bloquée, mention discrète dans la pastille d’adresse', async () => {
      avant = (await ctx.etat()).aujourdhui.length;
      await allerA(A + '/surgit');
      await pageDe(A + '/surgit');
      await jusqua(() => shell.locator('#popup-note').isVisible(), 'mention affichée');
      assert.equal(await shell.getAttribute('#popup-note', 'title'), await ctx.texte('popup.blocked'));
      assert.equal((await ctx.etat()).aujourdhui.length, avant + 1, 'aucun onglet ouvert par la page');
      assert.ok(!vus.some((x) => x.chemin === '/pub'));
      await ctx.capture('19-surgissante');
    });

    await t.verifier('un vrai clic dans la page ouvre bien sa fenêtre (connexions OAuth)', async () => {
      const page = await pageDe(A + '/surgit');
      await page.click('#ouvre');
      await jusqua(async () => (await titreActif()) === 'Page /fille', 'onglet ouvert par le clic');
      const fille = await pageDe(A + '/fille');
      assert.equal(await fille.evaluate(() => !!window.opener), true, 'window.opener conservé');
    });

    await t.verifier('clic sur la mention : « Ouvrir quand même » et « Toujours autoriser pour ce site »', async () => {
      await ctx.clic(shell, ctx.ligne('Surgit'));
      await jusqua(() => shell.locator('#popup-note').isVisible(), 'mention toujours là');
      const labels = await menuDe('#popup-note');
      const ouvrir = (await ctx.texte('popup.open')).replace('{url}', A + '/pub');
      const toujours = (await ctx.texte('popup.always')).replace('{site}', A);
      assert.ok(labels.includes(ouvrir) && labels.includes(toujours), labels.join(' | '));
      await choisir(ouvrir);
      await jusqua(async () => (await titreActif()) === 'Page /pub', '« ouvrir quand même »');
      await ctx.clic(shell, ctx.ligne('Surgit'));
      await menuDe('#popup-note');
      await choisir(toujours);
      await jusqua(async () => !(await shell.locator('#popup-note').isVisible()), 'mention retirée');
      assert.equal(await ctx.principal(({ store }, o) => store.state.permissions[o].popups, A), true);
    });

    // ------------------------------------------------------------- Autorisations
    await t.verifier('demande d’autorisation : feuille sur l’onglet, « Autoriser » au clic', async () => {
      await allerA(A + '/demandes');
      const page = await pageDe(A + '/demandes');
      await page.click('#notif');
      const f = await feuille('perm');
      assert.match(await f.textContent('#title'), /127\.0\.0\.1/);
      assert.equal(await f.locator('#body p').first().textContent(), await ctx.texte('perm.notifications'));
      assert.deepEqual(await f.locator('#buttons button').evaluateAll((bs) => bs.map((b) => b.id)), ['deny', 'allow']);
      await sleep(GARDE);
      await f.click('#allow');
      await jusqua(async () => (await page.title()) === 'notif:granted', 'autorisation reçue par la page');
      await plusDeFeuille();
    });

    await t.verifier('menu du site → « Connexion et autorisations » : l’autorisation y figure et se réinitialise', async () => {
      // Le bouclier ouvre le centre de contrôle du site ; « Connexion et certificat… » mène aux informations du site.
      await ctx.clic(shell, '#shield');
      const c = await feuille('control');
      assert.ok((await c.locator('#perms .item').evaluateAll((rows) => rows.map((r) => r.dataset.key))).includes('notifications'));
      await c.click('#c-details');
      const f = await feuille('site');
      assert.equal(await f.textContent('#title'), await ctx.texte('site.sec.local'));
      const cles = await f.locator('#perms .item').evaluateAll((rows) => rows.map((r) => r.dataset.key + ':' + r.querySelector('.state').textContent));
      assert.ok(cles.includes('notifications:' + await ctx.texte('site.allowed')) && cles.some((c) => c.startsWith('popups:')), cles.join(' | '));
      await f.click('#perms .item[data-key=notifications] [data-do=reset]');
      await jusqua(() => f.evaluate(() => !document.querySelector('#perms .item[data-key=notifications]')), 'ligne retirée');
      assert.equal(await ctx.principal(({ store }, o) => 'notifications' in store.state.permissions[o], A), false);
      await ctx.capture('19-site', f);
      await touche(f, 'Escape');
      await plusDeFeuille();
    });

    await t.verifier('bouclier → centre de contrôle : bulle ancrée du côté de l’adresse, nom du site, bloqueur, données, outils ; un clic trop rapide est ignoré', async () => {
      await ctx.clic(shell, '#shield');
      const c = await feuille('control');
      const vu = await c.evaluate(() => { const r = document.getElementById('card').getBoundingClientRect(); return { haut: r.top, gauche: r.left, titre: document.getElementById('title').textContent, sections: [...document.querySelectorAll('#body h2')].map((h) => h.textContent), dev: document.getElementById('c-dev').checked }; });
      assert.ok(vu.haut < 40 && vu.gauche < 40, JSON.stringify(vu));
      assert.equal(vu.titre, new URL(A).host === vu.titre ? vu.titre : A);
      assert.deepEqual(vu.sections, [await ctx.texte('ctl.blocking'), await ctx.texte('site.perms'), await ctx.texte('ctl.data'), await ctx.texte('ctl.tools')]);
      assert.equal(vu.dev, false);
      // Clic tombé dans la demi-seconde qui suit l'apparition : rien ne change.
      await c.click('#c-dev');
      await sleep(150);
      assert.equal((await ctx.principal(({ store }) => store.state.settings.devSites.length)), 0);
      await sleep(GARDE);
      await c.click('#c-dev');
      await jusqua(() => ctx.principal(({ store }, h) => store.state.settings.devSites.includes(h), new URL(A).host), 'mode développeur activé pour le site');
      await jusqua(() => c.evaluate(() => document.getElementById('c-dev').checked), 'case cochée par l’état rendu');
      await jusqua(() => shell.evaluate(() => document.body.classList.contains('toolbar') && document.body.classList.contains('dev-site') && getComputedStyle(document.getElementById('tb-url'), '::after').backgroundImage.includes('repeating-linear-gradient')), 'barre d’outils et liseré jaune et noir');
      await ctx.capture('19-centre-de-controle', c);
      await c.click('#c-dev');
      await jusqua(() => ctx.principal(({ store }) => store.state.settings.devSites.length === 0), 'mode développeur coupé');
      await jusqua(() => shell.evaluate(() => !document.body.classList.contains('dev-site')), 'liseré retiré');
      // Un clic à côté de la carte ferme le panneau.
      const taille = await c.evaluate(() => ({ w: innerWidth, h: innerHeight }));
      await c.mouse.click(taille.w - 20, taille.h - 20).catch(() => {});
      await plusDeFeuille();
    });

    await t.verifier('centre de contrôle : Échap le ferme ; « Copier l’URL » copie l’adresse ; le clic droit sur le bouclier garde le menu', async () => {
      await ctx.clic(shell, '#shield');
      const c = await feuille('control');
      await ctx.principal(({ electron }) => electron.clipboard.writeText(''));
      await c.click('#c-copy');
      await jusqua(async () => (await ctx.principal(({ electron }) => electron.clipboard.readText())).startsWith(A), 'adresse copiée');
      await touche(c, 'Escape');
      await plusDeFeuille();
      await ctx.principal(({ w }) => { w.menuVu = null; });
      await shell.click('#shield', { button: 'right' });
      const menu = await jusqua(() => ctx.principal(({ w }) => w.menuVu && w.menuVu.filter((x) => x.label).map((x) => x.label)), 'menu du bouclier');
      assert.ok(menu.includes(await ctx.texte('site.info')), menu.join(' | '));
    });

    // ------------------------------------------------------------- Partage d'écran
    await t.verifier('partage d’écran : sélecteur d’Orbe, rien n’est partagé avant « Partager »', async () => {
      const page = await pageDe(A + '/demandes');
      await page.click('#partage');
      const f = await feuille('picker');
      assert.match(await f.textContent('#title'), /127\.0\.0\.1/);
      assert.equal(await f.locator('#share').isDisabled(), true);
      await f.click('.src[data-kind=tab]');
      assert.equal(await f.locator('.src.sel .name').textContent(), await ctx.texte('share.thisTab'));
      await ctx.capture('19-partage', f);
      await sleep(GARDE);
      await f.click('#share');
      await jusqua(async () => (await page.title()) === 'flux:1', 'flux reçu par la page');
    });

    await t.verifier('témoin de partage sur la ligne de l’onglet et dans la pastille ; « Arrêter » recharge la page et l’éteint', async () => {
      const page = await pageDe(A + '/demandes');
      await jusqua(() => shell.locator('#capture-note').isVisible(), 'témoin dans la pastille');
      assert.equal(await shell.locator('#sidebar .row.tab.active.capturing').count(), 1);
      // Écran partagé : la ligne de l'onglet est surlignée en jaune.
      const ligne = await shell.locator('#sidebar .row.tab.active.sharing').evaluate((el) => getComputedStyle(el).boxShadow);
      assert.ok(/rgb\(250, 204, 21\)/.test(ligne), 'liseré jaune : ' + ligne);
      assert.equal(await shell.getAttribute('#capture-note', 'title'), await ctx.texte('capture.screen'));
      const labels = await menuDe('#capture-note');
      assert.ok(labels.includes(await ctx.texte('capture.stop')), labels.join(' | '));
      await choisir(await ctx.texte('capture.stop'));
      await jusqua(async () => (await page.title()) === 'Demandes', 'page rechargée');
      await jusqua(async () => !(await shell.locator('#capture-note').isVisible()), 'témoin éteint');
      assert.equal(await page.evaluate(() => typeof window.flux), 'undefined', 'le flux n’existe plus');
      assert.equal(await shell.locator('#sidebar .row.tab.capturing').count(), 0);
      assert.equal(await shell.locator('#sidebar .row.tab.sharing').count(), 0, 'plus de surlignage');
    });

    // ------------------------------------------------------------- « Quitter la page ? »
    await t.verifier('page modifiée au clavier : fermer l’onglet demande « Quitter la page ? » ; « Rester » le garde', async () => {
      await allerA(A + '/sale');
      const page = await pageDe(A + '/sale');
      await page.click('#t');
      await page.keyboard.type('un texte pas encore enregistré');
      const ligne = ctx.ligne('Brouillon');
      await ctx.clic(shell, ligne.locator('.act.x'), { survol: ligne });
      await jusqua(() => ctx.principal(() => global.__quitter.questions.length === 1), 'question posée');
      assert.equal(await ctx.principal(() => global.__quitter.questions[0]), await ctx.texte('unload.title'));
      await jusqua(async () => (await titreActif()) === 'Brouillon', 'onglet revenu');
      assert.equal(await page.inputValue('#t'), 'un texte pas encore enregistré', 'la saisie est intacte');
    });

    await t.verifier('« Quitter la page » ferme l’onglet', async () => {
      await ctx.principal(() => { global.__quitter.reponse = 0; });
      await sleep(2100); // pas de boîte de dialogue dans les deux secondes qui suivent « Rester »
      const ligne = ctx.ligne('Brouillon');
      await ctx.clic(shell, ligne.locator('.act.x'), { survol: ligne });
      await jusqua(async () => !(await ctx.titres()).includes('Brouillon'), 'onglet fermé');
      assert.equal(await ctx.principal(() => global.__quitter.questions.length), 2);
    });

    // ------------------------------------------------------------- Téléchargements
    await t.verifier('Bibliothèque : pause, reprise et annulation d’un téléchargement en cours', async () => {
      await ctx.principal(({ w }, u) => { w.activeRt.wc.downloadURL(u); }, A + '/gros.bin');
      await jusqua(() => fs.existsSync(path.join(dossier, 'gros.bin')), 'fichier créé dans le dossier choisi', 10000);
      await ctx.menu('Shift+Cmd+J');
      const lib = await ctx.attendrePage('library.html');
      const ligne = lib.locator('#list .line').first();
      await jusqua(() => ligne.locator('[data-do=pause]').isVisible(), 'bouton « Pause »');
      await ligne.locator('[data-do=pause]').click();
      await jusqua(() => ligne.locator('[data-do=resume]').isVisible(), 'bouton « Reprendre »');
      assert.ok((await ligne.locator('.sub').first().textContent()).includes(await ctx.texte('dl.paused')));
      await ligne.locator('[data-do=resume]').click();
      await jusqua(() => ligne.locator('[data-do=pause]').isVisible(), 'de nouveau en cours');
      await ctx.capture('19-telechargement', lib);
      await ligne.locator('[data-do=cancel]').click();
      await jusqua(async () => (await ligne.locator('.sub').first().textContent()).includes(await ctx.texte('dl.cancelled')), 'annulé');
      await jusqua(() => !fs.existsSync(path.join(dossier, 'gros.bin')), 'morceau retiré');
    });

    clair.closeAllConnections();
    chiffre.closeAllConnections();
    clair.close();
    chiffre.close();
    try { fs.rmSync(dossier, { recursive: true, force: true }); } catch {}
  },
};
