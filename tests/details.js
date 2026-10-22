// Détails de la branche « médias et capture » : petite fenêtre (ouverture animée,
// bandeau de première fois, profil retenu par site), image dans l'image par site…
// Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/details.js node scripts/dev.js --selftest
const outils = require('./outils');

const { sleep } = outils;
const until = (fn, label, timeout = 10000) => outils.until(fn, label, timeout);

module.exports = async function detailsTests(ctx) {
  const { first: w, store, win, little } = ctx;
  let failed = 0;
  const check = ctx.check || ((name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`); });
  const { LittleWindow } = little;
  const d = w.data;
  await outils.profilPret(w);

  // === Petite fenêtre ==================================================================
  {
    for (const l of LittleWindow.all) l.win.close();
    await until(() => LittleWindow.all.length === 0, 'petites fenêtres fermées');
    const saved = { seen: store.state.window.littleSeen, profiles: store.state.window.littleProfiles, hooks: { ...little.hooks } };
    const uiOf = (l, js) => l.ui.webContents.executeJavaScript(js);

    // Ouverture animée : opacité et position seulement.
    delete store.state.window.littleSeen;
    const motion0 = win.forceMotion(true);
    const l1 = new LittleWindow('');
    const at0 = { opacity: l1.win.getOpacity(), opening: !!l1.opening, visible: l1.win.isVisible(), size: l1.win.getSize().join('x') };
    const pos0 = l1.win.getPosition();
    await until(() => !l1.opening, 'ouverture terminée', 3000);
    const steps = l1.win.getOpacity();
    check('petite fenêtre : elle s’ouvre en se dévoilant (opacité de 0 à 1) et en montant de quelques points, sans changer de taille',
      // (Près du haut de l'écran, le système retient la fenêtre sous la barre des menus : elle monte alors moins.)
      at0.opacity === 0 && at0.opening && at0.visible && steps === 1 && l1.win.getPosition()[1] <= pos0[1] && l1.win.getPosition()[1] >= pos0[1] - little.OPEN.rise && l1.win.getPosition()[0] === pos0[0] && l1.win.getSize().join('x') === at0.size,
      JSON.stringify({ at0, pos0, fin: l1.win.getPosition(), opacite: steps }));

    // Première fois : bandeau d'explication, une seule fois.
    await until(() => uiOf(l1, 'typeof O === "object" && !document.getElementById("hint").hidden').catch(() => false), 'bandeau affiché');
    check('première petite fenêtre : un bandeau dit à quoi elle sert, et la chose est retenue', l1.hint === true && store.state.window.littleSeen === true && (await uiOf(l1, 'document.querySelector("#hint span").textContent')) === store.t('little.hint'));
    l1.load('http://127.0.0.1:9/petite');
    const yHint = win.boundsOf(l1.view).y;
    await uiOf(l1, 'document.getElementById("hint-close").click()');
    await until(() => !l1.hint && win.boundsOf(l1.view).y === 42, 'bandeau refermé');
    check('bandeau refermé : la page reprend sa place sous la barre', yHint === 42 + little.HINT && (await uiOf(l1, 'document.getElementById("hint").hidden')) === true);
    win.forceMotion(false);
    const l2 = new LittleWindow('');
    check('fenêtres suivantes : pas de bandeau ; « Réduire les animations » : ouverte d’un coup', l2.hint === false && !l2.opening && l2.win.getOpacity() === 1 && l2.win.isVisible());
    win.forceMotion(motion0);

    // Profil retenu par site.
    little.hooks.profiles = () => ['default', 'travail'];
    little.hooks.profileId = () => 'default';
    little.hooks.profileOfSpace = (id) => (id === 'esp-travail' ? 'travail' : null);
    little.hooks.spaces = () => [{ id: 'esp-travail', name: 'Travail', icon: '💼' }];
    const sent = [];
    little.hooks.openInOrbe = (url, spaceId) => sent.push([url, spaceId]);
    store.state.window.littleProfiles = {};
    const l3 = new LittleWindow('http://www.intranet.exemple.invalid/a');
    const first = l3.profileId;
    l3.openInSpace('esp-travail');
    await until(() => !LittleWindow.all.includes(l3), 'petite fenêtre envoyée');
    const l4 = new LittleWindow('http://intranet.exemple.invalid/autre');
    const l5 = new LittleWindow('http://ailleurs.exemple.invalid/');
    check('profil retenu par site : envoyée dans un Espace d’un autre profil, la petite fenêtre suivante du même site s’ouvre avec ce profil', first === 'default' && sent.length === 1 && l4.profileId === 'travail' && l5.profileId === 'default' && store.state.window.littleProfiles['intranet.exemple.invalid'] === 'travail', JSON.stringify([first, l4.profileId, l5.profileId, store.state.window.littleProfiles]));
    little.hooks.profiles = () => ['default'];
    check('profil retenu disparu, adresse d’Orbe ou sans site : profil de l’Espace affiché', little.rememberedProfile('http://intranet.exemple.invalid/') === null && little.rememberProfile('orbe://settings', 'travail') === false && little.rememberProfile('http://x.test/', { a: 1 }) === false && little.siteOf('file:///etc/hosts') === '');
    for (let i = 0; i < 230; i++) little.rememberProfile(`http://site${i}.test/`, 'default');
    check('profils retenus : 200 sites au plus, les plus anciens oubliés', Object.keys(store.state.window.littleProfiles).length === 200 && !('site0.test' in store.state.window.littleProfiles) && 'site229.test' in store.state.window.littleProfiles);

    // Table relue du fichier d'état : sans prototype, noms d'hôte valides seulement.
    store.state.window.littleProfiles = JSON.parse('{"__proto__":"default","bon.test":"default","pas un hôte":"default","nombre.test":7,"toString":"default"}');
    const viaProto = little.rememberedProfile('http://__proto__/');
    const kept = little.rememberedProfile('http://bon.test/');
    const table = store.state.window.littleProfiles;
    check('profils retenus : table sans prototype, entrées relues (nom d’hôte valide, identifiant de profil) — « __proto__ » n’y désigne rien',
      viaProto === null && kept === 'default' && Object.getPrototypeOf(table) === null && Object.keys(table).join() === 'bon.test' && little.rememberProfile('http://__proto__/', 'default') === false && little.siteOf('http://__proto__/') === ''
      && little.rememberProfile('http://constructor/', 'default') === true && little.rememberedProfile('http://constructor/') === 'default' && little.rememberedProfile('http://valueof/') === null && typeof ({}).constructor === 'function' && JSON.stringify(table) === '{"bon.test":"default","constructor":"default"}',
      JSON.stringify([viaProto, kept, Object.keys(table)]));

    for (const l of LittleWindow.all) l.win.close();
    await until(() => LittleWindow.all.length === 0, 'petites fenêtres fermées');
    Object.assign(little.hooks, saved.hooks);
    if (saved.seen === undefined) delete store.state.window.littleSeen; else store.state.window.littleSeen = saved.seen;
    if (saved.profiles === undefined) delete store.state.window.littleProfiles; else store.state.window.littleProfiles = saved.profiles;
  }

  // === Image dans l'image automatique, site par site =====================================
  {
    const t = (k, v) => store.t(k, null, v);
    const s = store.state.settings;
    const saved = { autoPip: s.autoPip, pipOffSites: s.pipOffSites };
    s.autoPip = true;
    s.pipOffSites = [];
    const tab = w.newTab('http://127.0.0.1:9/video');
    const rt = win.live.get(tab.id);
    await until(() => !rt.wc.isLoading(), 'onglet chargé');
    const url = 'https://Video.Exemple.test/regarder?v=1';
    const getURL = rt.wc.getURL;
    rt.wc.getURL = () => url;
    const asked = [];
    const run = rt.wc.executeJavaScript;
    rt.wc.executeJavaScript = (code) => { asked.push(code.includes('requestPictureInPicture') ? 'entrer' : 'sortir'); return Promise.resolve(); };
    const menu = () => w.pageMenuTemplate(rt, { x: 10, y: 10, mediaType: 'video', srcURL: '' });
    const box = () => menu().find((x) => x.label === t('ctx.pipAuto', { site: 'video.exemple.test' }));
    check('menu d’une vidéo : case « Automatique en quittant l’onglet, sur <site> », cochée par défaut', !!box() && box().type === 'checkbox' && box().checked === true);
    box().click();
    check('case décochée : le site est retenu, la case le montre', s.pipOffSites.join() === 'video.exemple.test' && box().checked === false && win.OrbeWindow.pipOff(url) && !win.OrbeWindow.pipOff('https://autre.test/'));
    delete rt.pip;
    w.pip(rt, true);
    const refused = asked.length === 0 && !('pip' in rt);
    w.pip(rt, false);
    check('site coupé : la vidéo n’y entre plus d’elle-même en image dans l’image ; en sortir reste permis', refused && asked.join() === 'sortir');
    box().click();
    w.pip(rt, true);
    check('case recochée : le site est oublié, la vidéo suit de nouveau', s.pipOffSites.length === 0 && asked.join() === 'sortir,entrer' && rt.pip === true);
    s.autoPip = false;
    check('réglage général coupé : la case par site n’est pas proposée', !box());
    s.autoPip = true;
    const prefs = require('../src/main/prefs');
    check('liste des sites : seuls des noms d’hôte, sans doublon, 200 au plus', prefs.SETTABLE.pipOffSites(['a.test', 'b.test']) && !prefs.SETTABLE.pipOffSites(['a.test', 'a.test']) && !prefs.SETTABLE.pipOffSites(['<script>']) && !prefs.SETTABLE.pipOffSites('a.test') && !prefs.SETTABLE.pipOffSites(Array.from({ length: 201 }, (_, i) => `s${i}.test`))
      && win.OrbeWindow.togglePipSite('orbe://settings') === false && win.OrbeWindow.pipSite('file:///x') === '');
    rt.wc.getURL = getURL;
    rt.wc.executeJavaScript = run;
    rt.pip = false;
    w.close(tab.id, { silent: true, ask: false });
    Object.assign(s, saved);
  }

  // === Pastille de l'adresse du lien survolé ============================================
  {
    const tab = w.newTab('http://127.0.0.1:9/liens');
    const rt = win.live.get(tab.id);
    await until(() => !rt.wc.isLoading(), 'onglet chargé');
    const S = win.STATUS;
    const saved = { ...S, pointer: w.statusPointer };
    let pointer = { x: -500, y: -500 };
    w.statusPointer = () => pointer;
    S.expandAfter = 120;
    const motion0 = win.forceMotion(false);
    const page = win.boundsOf(rt.view);
    const long = 'https://exemple.invalid/' + 'chemin/'.repeat(40);
    const shortUrl = 'https://exemple.invalid/a';
    const box = () => win.boundsOf(w.statusView);
    w.linkStatus(rt, long);
    await until(() => w.status && w.statusView && w.statusView.getVisible(), 'pastille affichée');
    const b0 = box();
    check('adresse longue survolée : la pastille est d’abord courte, en bas à gauche de la page', b0.width === Math.min(S.short, page.width - 16) && b0.x === page.x + 6 && b0.y === page.y + page.height - 30 && b0.height === 26, JSON.stringify([b0, page]));
    await until(() => box().width > b0.width, 'pastille étendue', 3000);
    const full = Math.round(Math.min(page.width - 16, 14 + long.length * 6.6));
    check('pointeur resté sur le lien : elle s’étend à toute l’adresse (dans la limite de la page)', page.width - 16 <= S.short || box().width === full, JSON.stringify([box(), full]));
    // Le pointeur vient sur la pastille : elle passe de l'autre côté (et redevient courte si elle tenait toute la largeur).
    const b1 = box();
    pointer = { x: b1.x + 20, y: b1.y + 10 };
    await until(() => w.status.side === 'right', 'pastille écartée', 3000);
    const b2 = box();
    check('pointeur sur la pastille : elle s’écarte de l’autre côté de la page, hors du pointeur', b2.x + b2.width === page.x + page.width - 6 && (pointer.x < b2.x - S.margin || b2.width >= page.width / 2) && w.status.dodged === 1, JSON.stringify([b1, b2, pointer]));
    pointer = { x: -500, y: -500 };
    // Adresse courte : jamais étendue.
    w.linkStatus(rt, shortUrl);
    await until(() => w.status && w.status.url === shortUrl, 'adresse courte');
    const b3 = box();
    await sleep(S.expandAfter + 150);
    check('adresse courte : la pastille prend sa largeur et n’en change plus ; elle reste du côté où elle s’est écartée', box().width === b3.width && b3.width < S.short && w.status.side === 'right');
    w.linkStatus(rt, '');
    await until(() => !w.status && !w.statusView.getVisible() && !w.statusPoll, 'pastille retirée');
    check('lien quitté : la pastille disparaît et plus rien ne surveille le pointeur', true);
    Object.assign(S, { short: saved.short, expandAfter: saved.expandAfter });
    w.statusPointer = saved.pointer;
    win.forceMotion(motion0);
    w.close(tab.id, { silent: true, ask: false });
  }

  // === Téléchargement : un fichier tombe dans l'icône de la Bibliothèque ==================
  {
    const ui = (js) => w.ui.webContents.executeJavaScript(js);
    const sent = [];
    const realSend = w.ui.webContents.send.bind(w.ui.webContents);
    w.ui.webContents.send = (ch, p) => { if (ch === 'state') sent.push(p.downloadsStarted); return realSend(ch, p); };
    win.OrbeWindow.pushAll();
    await until(() => sent.length > 0, 'état envoyé à la barre');
    const n0 = sent[sent.length - 1];
    sent.length = 0;
    win.noteDownload('start', { id: 'essai-1', state: 'progressing' }, null);
    win.noteDownload('progress', { id: 'essai-1', state: 'progressing' }, null);
    win.noteDownload('start', { id: 'essai-2', state: 'progressing' }, null);
    win.OrbeWindow.pushAll();
    await until(() => sent.length > 0, 'état suivant envoyé');
    check('téléchargements commencés : comptés un par un (même sans page d’origine), et donnés à la barre latérale', typeof n0 === 'number' && sent[sent.length - 1] === n0 + 2, JSON.stringify(sent.slice(-3)));
    w.ui.webContents.send = realSend;
    win.noteDownload('done', { id: 'essai-1' }, null);
    win.noteDownload('done', { id: 'essai-2' }, null);
    check('compteur illisible : la barre n’anime rien et ne casse pas', (await ui('(() => { try { fxDownloads(undefined); fxDownloads("3"); fxDownloads(null); return true; } catch { return false; } })()')) === true);
  }

  // === Capture en portrait ===============================================================
  {
    const { nativeImage } = require('electron');
    const portrait = require('../src/main/portrait');
    const commands = require('../src/main/commands');
    // Image d'essai : 300 × 200 points, vert uni (ordre des octets : bleu, vert, rouge, alpha).
    const W = 300; const H = 200;
    const raw = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) raw.set([20, 200, 40, 255], i * 4);
    const page = nativeImage.createFromBitmap(raw, { width: W, height: H });
    const t0 = Date.now();
    const out = portrait.compose(page, { color: '#7c5cff', dark: false });
    const ms = Date.now() - t0;
    const size = out.getSize();
    const bmp = out.toBitmap();
    const px = (x, y) => [...bmp.subarray((y * size.width + x) * 4, (y * size.width + x) * 4 + 4)];
    const m = (size.width - W) / 2;
    const center = px(m + W / 2, m + H / 2);
    const corner = px(m, m); // coin de la page : arrondi, c'est le fond qu'on y voit
    const far = px(2, 2);
    const under = px(m + W / 2, m + H + 6); // juste sous la page : l'ombre
    const side = px(size.width - 3, 3);
    const lum = (p) => p[0] + p[1] + p[2];
    check('capture en portrait : la page est posée, entière, au centre d’un fond plus grand (marge égale des quatre côtés)', size.width === W + 2 * m && size.height === H + 2 * m && m >= portrait.LOOK.minMargin && center.join() === '20,200,40,255' && px(m + 30, m + 100).join() === '20,200,40,255' && px(m + W - 1, m + 100).join() === '20,200,40,255', JSON.stringify([size, m, center]));
    check('… coins arrondis (le fond se voit au coin), fond en dégradé (deux coins opposés diffèrent), ombre sous la page, image opaque', corner.join() !== '20,200,40,255' && far.join() !== side.join() && lum(under) < lum(px(m + W / 2, size.height - 2)) && bmp.every((v, i) => i % 4 !== 3 || v === 255), JSON.stringify({ corner, far, side, under }));
    const darkOut = portrait.compose(page, { color: '#7c5cff', dark: true }).toBitmap();
    check('thème sombre : fond plus sombre ; couleur d’Espace illisible : fond par défaut ; image vide : rien', darkOut[0] + darkOut[1] + darkOut[2] < lum(far) && !!portrait.compose(page, { color: 'javascript:1' }) && portrait.compose(nativeImage.createEmpty(), {}) === null && portrait.compose(null, {}) === null);
    console.log(`  – portrait de ${W} × ${H} points composé en ${ms} ms`);
    // La commande : elle prend l'image de la page affichée.
    const tab = w.newTab('http://127.0.0.1:9/portrait');
    await until(() => win.live.get(tab.id) && !win.live.get(tab.id).wc.isLoading(), 'onglet chargé');
    const made = await w.capturePortrait({ image: page, write: false });
    check('« Capturer en portrait » : commande de la barre de commande et du menu Fichier, qui rend l’image composée', !!commands.byName.get('capturePortrait') && !!made && made.getSize().width === size.width && store.t('file.capturePortrait', 'en') === 'Capture in Portrait Mode');
    w.close(tab.id, { silent: true, ask: false });
  }

  // === Couleurs de la page : fond de la vue, barre d'outils teintée =======================
  {
    const http = require('http');
    const pageColor = require('../src/main/page-color');
    const ui = (js) => w.ui.webContents.executeJavaScript(js);
    check('couleur de fond annoncée par la page : lue comme des nombres seulement (rgb, rgba posé sur blanc), sinon blanc',
      pageColor.pick(['rgb(18, 18, 20)', 'rgb(255, 0, 0)']) === '#121214' && pageColor.pick(['rgba(0, 0, 0, 0)', 'rgb(10, 20, 30)']) === '#0a141e' && pageColor.pick(['rgba(0, 0, 0, 0.5)']) === '#808080'
      && ['url(javascript:1)', 'rgb(999, 0, 0)', 'red', 'rgb(1,2,3);background:url(x)', { a: 1 }, 'rgba(1, 2, 3, 7)', 'x'.repeat(100)].every((v) => pageColor.pick([v]) === '#ffffff') && pageColor.pick(null) === '#ffffff');
    check('couleur de thème : « #rrggbb » seulement (l’alpha est écarté), tout le reste est refusé', pageColor.theme('#1DB954') === '#1db954' && pageColor.theme('#1db954ff') === '#1db954' && [null, 'red', '#fff', 'url(x)', '#1db95', 12].every((v) => pageColor.theme(v) === null));
    const server = http.createServer((req, res) => {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(req.url === '/sombre'
        ? '<!doctype html><meta charset="utf-8"><meta name="theme-color" content="#1db954"><title>Sombre</title><body style="background:#121214;color:#eee">sombre</body>'
        : '<!doctype html><meta charset="utf-8"><title>Claire</title><body>claire</body>');
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const toolbar0 = store.state.settings.showToolbar;
    store.state.settings.showToolbar = true;
    const tab = w.newTab(base + '/sombre');
    const rt = () => win.live.get(tab.id);
    await until(() => rt() && rt().bg === '#121214', 'fond de la page relevé');
    check('page sombre : la vue de l’onglet prend la couleur de fond de la page (redimensionner ne découvre plus de blanc)', rt().bg === '#121214');
    await until(() => rt().themeColor === '#1db954', 'couleur de thème reçue');
    w.layout();
    win.OrbeWindow.pushAll();
    await until(() => ui('document.getElementById("toolbar").classList.contains("tinted")'), 'barre d’outils teintée');
    const look = () => ui('(() => { const b = document.getElementById("toolbar"); return { page: b.style.getPropertyValue("--page"), sombre: b.classList.contains("on-dark"), fond: getComputedStyle(b, "::before").backgroundColor }; })()');
    // (La teinte arrive en fondu : on lit la couleur une fois posée.)
    await until(async () => (await look()).fond === 'rgb(29, 185, 84)', 'teinte posée').catch(() => {});
    const tinted = await look();
    const darkTint = await ui('(() => { fxToolbar("#101014"); const d = document.getElementById("toolbar").classList.contains("on-dark"); fxToolbar("#1db954"); return d; })()');
    check('barre d’outils : teintée par la couleur de thème de la page ; texte sombre sur couleur claire, clair sur couleur sombre', tinted.page === '#1db954' && tinted.fond === 'rgb(29, 185, 84)' && tinted.sombre === false && darkTint === true, JSON.stringify(tinted));
    w.navigate(base + '/claire', tab.id);
    await until(() => w.data.tabs[tab.id].title === 'Claire' && rt().bg === '#ffffff', 'page claire');
    win.OrbeWindow.pushAll();
    await until(() => ui('!document.getElementById("toolbar").classList.contains("tinted")'), 'teinte retirée');
    check('page sans couleur de thème : la barre reprend ses couleurs, la vue redevient blanche', rt().themeColor === null && rt().bg === '#ffffff' && (await ui('document.getElementById("toolbar").style.getPropertyValue("--page")')) === '');
    check('couleur illisible donnée à la barre : ignorée', (await ui('(() => { fxToolbar("red;background:url(x)"); fxToolbar({}); return document.getElementById("toolbar").classList.contains("tinted"); })()')) === false);
    w.close(tab.id, { silent: true, ask: false });
    store.state.settings.showToolbar = toolbar0;
    w.layout();
    win.OrbeWindow.pushAll();
    server.close();
    if (server.closeAllConnections) server.closeAllConnections();
  }

  await sleep(30);
  return failed;
};
