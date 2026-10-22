// Test de bout en bout : lance le vrai navigateur sur un profil temporaire,
// avec un petit serveur local, et vérifie les fonctions principales.
//   npm test
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Menu, clipboard } = require('electron');

const platform = require('../src/main/platform');

const { sleep, until, milieu, ignorer, ignores, profilPret } = require('./outils');

function serve() {
  const page = (title, body) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px sans-serif;padding:40px">${body}</body>`;
  const hits = { pixel: 0 };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    res.setHeader('content-type', 'text/html; charset=utf-8');
    if (url.pathname === '/a') return res.end(page('Page A', '<h1>Alpha</h1><p>orbe orbe orbe</p><a id="pop" href="/c" target="_blank">ouvrir C</a>'));
    if (url.pathname === '/b') return res.end(page('Page B', '<h1>Bravo</h1>'));
    if (url.pathname === '/c') return res.end(page('Page C', '<h1>Charlie</h1><script>document.title = window.opener ? "C avec opener" : "C sans opener"</script>'));
    if (url.pathname === '/video') return res.end(page('Page vidéo', `<video id="v" width="320" height="180" playsinline></video><script>
      window.start = async () => {
        const c = document.createElement('canvas'); c.width = 320; c.height = 180;
        const g = c.getContext('2d'); let n = 0;
        setInterval(() => { g.fillStyle = 'hsl(' + (n++ % 360) + ' 70% 50%)'; g.fillRect(0, 0, 320, 180); }, 40);
        const ac = new AudioContext(); const osc = ac.createOscillator(); const gain = ac.createGain(); gain.gain.value = 0.002;
        const dest = ac.createMediaStreamDestination(); osc.connect(gain).connect(dest); osc.start();
        const stream = c.captureStream(25); stream.addTrack(dest.stream.getAudioTracks()[0]);
        const v = document.getElementById('v'); v.srcObject = stream; await v.play(); return true;
      };
    </script>`));
    if (url.pathname === '/pixel') { hits.pixel += 1; res.setHeader('content-type', 'image/gif'); return res.end(Buffer.from('R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', 'base64')); }
    if (url.pathname === '/pub') return res.end(page('Page avec pub', `<img src="http://pub.orbe.localhost:${server.address().port}/pixel"><img src="/pixel?local">`));
    if (url.pathname === '/liens') return res.end(page('Page à liens', `<a id="dehors" href="http://localhost:${server.address().port}/b" style="display:block;width:300px;height:60px;background:#def">ailleurs</a>`));
    if (url.pathname === '/long') return res.end(page('Page longue', '<div style="height:4000px;background:linear-gradient(#fde,#def)">haut</div><p>bas</p>'));
    if (url.pathname === '/file.txt') { res.setHeader('content-disposition', 'attachment; filename="orbe-test.txt"'); return res.end('bonjour'); }
    res.statusCode = 404;
    return res.end(page('404', 'introuvable'));
  });
  server.hits = hits;
  // Chaque connexion et chaque demande reçues sont notées : si une page ne se
  // charge pas, on sait si sa demande est arrivée jusqu'ici.
  const { note } = require('../src/main/test-guard');
  let seen = 0;
  server.on('connection', (socket) => { if ((seen += 1) <= 12) note(`serveur d’essai : connexion n° ${seen} depuis ${socket.remoteAddress}`); });
  server.on('request', (req) => { if (seen <= 12) note(`serveur d’essai : ${req.method} ${req.url}`); });
  // 127.0.0.1 seulement : à l'écoute partout (« :: »), le système peut donner le même numéro de port qu'au
  // serveur 127.0.0.1 d'une autre suite lancée en même temps, qui reçoit alors nos demandes (page jamais servie).
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => { note(`serveur d’essai à l’écoute : ${JSON.stringify(server.address())}`); resolve(server); }));
}

module.exports = async function selftest(ctx) {
  const { first: w, OrbeWindow, store, win, little, commands, openSettings, openUrl } = ctx;
  const modalAtStart = w.modal; // relevé avant toute attente (tests/performances.js)
  const results = [];
  let failed = 0;
  const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    if (!ok) failed += 1;
    console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`);
  };
  const ui = (js) => w.ui.webContents.executeJavaScript(js);
  const tabs = () => w.data.tabs;
  const titleOf = (id) => tabs()[id] && tabs()[id].title;
  const shots = process.env.ORBE_SHOTS;
  const shot = async (name) => {
    if (!shots) return;
    await sleep(350);
    // Capture de la fenêtre entière (coque + pages), pour relecture visuelle.
    await require('./capture').shoot(w.win, shots, name, platform.tint(w.space.color, require('electron').nativeTheme.shouldUseDarkColors));
  };

  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log('\nOrbe — tests de bout en bout\n');

  // Écran vivant ? (mesuré une fois : voir tests/outils.js)
  await until(() => ui('typeof S === "object" && S !== null'), 'coque chargée', 20000);
  const env = await milieu(w);

  // Coque
  await until(() => ui('!!window.S || typeof S === "object" && S !== null'), 'coque chargée');
  check('la barre latérale reçoit son état', await ui('S.space.name') === store.t('spaces.firstName'));
  check('aucun onglet au départ', w.activeId === null && await ui('document.body.classList.contains("no-tab")'));

  // Onglets (le profil d'abord : voir profilPret, tests/outils.js)
  await profilPret(w);
  const a = w.newTab(base + '/a');
  await until(() => titleOf(a.id) === 'Page A', 'titre de la page A');
  check('nouvel onglet chargé et actif', w.activeId === a.id && win.live.has(a.id));
  const b = w.newTab(base + '/b');
  await until(() => titleOf(b.id) === 'Page B', 'titre de la page B');
  check('le nouvel onglet se place en haut d’Aujourd’hui', w.space.today[0] === b.id && w.space.today[1] === a.id);
  await until(() => ui('document.querySelectorAll("#today .row.tab").length === 2'), 'deux lignes dans la barre');
  check('la barre latérale affiche les deux onglets', await ui('document.querySelector("#today .row.active .title").textContent') === 'Page B');
  check('historique enregistré', !!store.state.history[base + '/a'] && store.state.history[base + '/a'].title === 'Page A');

  w.run('nextTab');
  check('⌥⌘↓ passe à l’onglet suivant', w.activeId === a.id);
  w.run('prevTab');
  check('⌥⌘↑ revient à l’onglet précédent', w.activeId === b.id);
  w.tabAt(2);
  check('⌘2 active le deuxième onglet', w.activeId === a.id);

  // Épingler, favoris
  w.run('togglePin');
  check('⌘D épingle l’onglet', w.space.pinned.some((n) => n.id === a.id) && !w.space.today.includes(a.id) && tabs()[a.id].homeUrl === base + '/a');
  await until(() => ui('document.querySelectorAll("#pinned .row.tab").length === 1'), 'ligne épinglée');
  w.run('togglePin');
  check('⌘D désépingle l’onglet', w.space.today[0] === a.id && !tabs()[a.id].homeUrl);
  w.toggleFavorite(a.id);
  await until(() => ui('document.querySelectorAll("#fav .tile").length === 1'), 'tuile favori');
  check('ajout aux favoris (tuile en haut)', w.favorites[0] === a.id);
  w.toggleFavorite(a.id);
  check('retrait des favoris', !w.favorites.length && w.space.today[0] === a.id);

  // Dossiers et déplacements
  w.newFolder();
  const folder = w.space.pinned.find((n) => n.type === 'folder');
  w.move({ id: a.id, to: 'folder', folderId: folder.id, index: 0 });
  check('onglet déposé dans un dossier', folder.children[0].id === a.id);
  await until(() => ui('document.querySelectorAll("#pinned .folder .children .row.tab").length === 1'), 'onglet dans le dossier');
  w.rename(folder.id, 'Travail');
  await sleep(150);
  w.move({ id: a.id, to: 'today', index: 1 });
  check('onglet ressorti vers Aujourd’hui', w.space.today[1] === a.id && !folder.children.length);
  w.newFolder();
  const inner = w.space.pinned.find((n) => n.type === 'folder' && n.id !== folder.id);
  w.move({ id: inner.id, to: 'folder', folderId: folder.id, index: 0 });
  check('dossier imbriqué dans un dossier', folder.children[0] === inner && !w.space.pinned.includes(inner));
  w.move({ id: folder.id, to: 'folder', folderId: inner.id, index: 0 });
  check('un dossier ne peut pas entrer dans son propre sous-dossier', w.space.pinned.includes(folder) && !inner.children.length);
  w.deleteFolder(inner.id);
  w.deleteFolder(folder.id);
  check('dossier supprimé', !w.space.pinned.length);

  // Copie d'URL (le presse-papiers de la machine est restauré ensuite)
  const previousClipboard = await clipboard.readText().catch(() => '');
  w.activate(a.id);
  w.run('copyUrl');
  await until(async () => (await clipboard.readText()) === base + '/a', 'URL dans le presse-papiers');
  check('⇧⌘C copie l’URL', true);
  w.run('copyUrlMarkdown');
  await until(async () => (await clipboard.readText()) === `[Page A](${base}/a)`, 'lien Markdown dans le presse-papiers');
  check('⌥⇧⌘C copie le lien Markdown', true);
  await clipboard.writeText(previousClipboard);

  // Barre de commande
  w.openCommand('new');
  check('⌘T ouvre la barre de commande', w.modalMode === 'command');
  const sugg = await w.suggest('127');
  check('suggestions issues de l’historique', sugg.some((i) => i.kind === 'history' && i.url.startsWith(base)));
  const cmds = await w.suggest('scind');
  check('la barre de commande propose des actions', cmds.some((i) => i.kind === 'command' && i.command === 'addSplit'));
  const sw = await w.suggest('Page B');
  check('« Basculer vers l’onglet » proposé', sw.some((i) => i.kind === 'tab' && i.tabId === b.id));
  await shot('commande');
  w.runItem(sw.find((i) => i.kind === 'tab'));
  check('choisir un onglet y bascule', w.activeId === b.id && w.modalMode === null);
  w.openCommand('edit');
  w.runItem({ kind: 'raw', title: base + '/c' });
  await until(() => tabs()[b.id].url === base + '/c', '⌘L navigue dans l’onglet courant');
  check('⌘L remplace l’adresse de l’onglet actif', w.activeId === b.id);
  await until(() => titleOf(b.id) === 'C sans opener', 'titre C');

  // Fenêtre ouverte par la page (window.opener conservé). L'ouverture suit une
  // vraie entrée de l'utilisateur : sans geste, elle serait bloquée (popups.js).
  const gesture = async (id) => {
    const rt = win.live.get(id);
    rt.gesture = 0;
    for (const type of ['mouseDown', 'mouseUp']) rt.wc.sendInputEvent({ type, x: 3, y: 3, button: 'left', clickCount: 1 });
    await until(() => rt.gesture > 0, 'entrée reçue par la page');
  };
  w.activate(a.id);
  const before = w.space.today.length;
  await gesture(a.id);
  await win.live.get(a.id).wc.executeJavaScript('document.getElementById("pop").removeAttribute("target"); window.open("/c"); 1', true);
  await until(() => w.space.today.length === before + 1, 'onglet ouvert par la page');
  const child = w.activeId;
  await until(() => titleOf(child) === 'C avec opener', 'opener conservé');
  check('window.open ouvre un onglet avec window.opener', w.space.today[w.space.today.indexOf(a.id) + 1] === child);

  // Vue scindée
  w.splitWith(a.id, b.id);
  await sleep(120);
  const ba = win.live.get(a.id).view.getBounds();
  const bb = win.live.get(b.id).view.getBounds();
  check('vue scindée : deux volets côte à côte', w.visibleIds().length === 2 && bb.x > ba.x && Math.abs(ba.width - bb.width) <= 1 && ba.y === bb.y);
  w.resizeSplit(0, ba.x + ba.width + 4 + 120);
  const ra = win.live.get(a.id).view.getBounds();
  const rb = win.live.get(b.id).view.getBounds();
  check('vue scindée : la séparation se déplace à la souris', ra.width > ba.width + 100 && rb.width < bb.width - 100 && rb.x + rb.width === bb.x + bb.width, JSON.stringify([ra, rb]));
  await until(() => ui('document.querySelectorAll("#dividers .divider").length === 1'), 'poignée de séparation');
  const reread = store.normalize(JSON.parse(JSON.stringify(store.state)));
  check('vue scindée : enregistrée avec l’Espace (retrouvée au redémarrage)', reread.spaces[0].splits.length === 1 && reread.spaces[0].splits[0].join() === [a.id, b.id].join());
  w.run('splitDirection');
  const va = win.live.get(a.id).view.getBounds();
  const vb = win.live.get(b.id).view.getBounds();
  check('vue scindée empilée : les volets sont l’un au-dessus de l’autre', va.x === vb.x && va.width === vb.width && vb.y > va.y && w.isVertical(w.groupOf(a.id)));
  w.run('splitDirection');
  check('retour côte à côte', win.live.get(b.id).view.getBounds().x > win.live.get(a.id).view.getBounds().x);
  await shot('scinde');
  w.run('closeSplit');
  w.dragZone(true);
  await until(() => w.dropView && w.dropView.webContents.executeJavaScript('!document.getElementById("drop").hidden'), 'zone de dépôt');
  w.handle('dropSplit', w.activeId === a.id ? b.id : a.id);
  check('lâcher un onglet sur la page crée une vue scindée', w.visibleIds().length === 2);
  w.run('closeSplit');
  check('⌃⇧- ferme le volet', w.visibleIds().length === 1 && w.splits.length === 0);

  // Barre latérale
  const x0 = win.live.get(w.activeId).view.getBounds().x;
  w.run('toggleSidebar');
  await sleep(320);
  const x1 = win.live.get(w.activeId).view.getBounds().x;
  check('⌘S masque la barre latérale', !w.sidebarVisible && x1 < x0 && x1 === 10);
  w.run('toggleSidebar');
  await sleep(320);
  check('⌘S la réaffiche', w.sidebarVisible && win.live.get(w.activeId).view.getBounds().x === x0);

  // Barre masquée : au survol du bord, elle flotte par-dessus la page sans la déplacer
  w.toggleSidebar(false);
  await sleep(320);
  const hiddenX = win.live.get(w.activeId).view.getBounds();
  clearInterval(w.peekTimer); // le test remplace la souris
  w.peekTimer = null;
  w.setPeek(true);
  // (si la fenêtre de test perd le premier plan, le survol est annulé : on le redemande)
  await until(() => { w.setPeek(true); return w.floatView && w.floatView.webContents.executeJavaScript('document.body.classList.contains("open") && document.querySelectorAll(".row.tab").length > 0'); }, 'barre flottante affichée');
  await sleep(260);
  const peekX = win.live.get(w.activeId).view.getBounds();
  check('survol du bord : la barre flotte, la page ne bouge pas', peekX.x === hiddenX.x && peekX.width === hiddenX.width && w.floatView.getBounds().width > 200);
  await shot('flottante');
  w.setPeek(false);
  await sleep(300);
  w.toggleSidebar(true);
  await sleep(320);

  // Mouvements des pages : animation du système (View.setBounds animé), sans minuteur
  {
    // Les machines d'intégration sous Windows ont les animations coupées : on les
    // impose pour toute la suite, afin que le chemin animé y soit essayé aussi.
    const system = win.motion(1) > 0;
    win.forceMotion(true);
    const moving = win.motion(1) > 0;
    const view = () => win.live.get(w.activeId).view;
    const same = (r1, r2) => r1.x === r2.x && r1.y === r2.y && r1.width === r2.width && r1.height === r2.height;
    const pane = (i = 0) => w.pageRect(w.paneRects(w.contentRect(), w.visibleIds())[i]);
    const docked = pane();
    w.toggleSidebar(false);
    await sleep(120);
    const hidden = pane();
    check('barre masquée : la page prend la largeur d’un coup', same(view().getBounds(), hidden) && hidden.x === 10);
    // Arrivée des pages : attendue, jamais supposée. Le trajet demandé dure 50 ms,
    // mais il ne commence qu'à la première image composée : sur une machine lente
    // il finit bien plus tard (plus de 320 ms relevés sur les machines macOS).
    const flying = () => w.visibleIds().some((x) => win.inFlight(win.live.get(x).view));
    const settled = async () => { const t = Date.now(); await until(() => !flying(), 'arrivée des pages', 6000); return Date.now() - t; };
    const before = { ...win.motionStats };
    const t0 = Date.now();
    let landed = 0;
    view().once('bounds-changed', () => { landed = Date.now() - t0; });
    w.toggleSidebar(true);
    const during = view().getBounds();
    check('retour de la barre : un seul appel par page, animé par le système, aucun minuteur',
      win.motionStats.animated - before.animated === (moving ? 1 : 0) && win.motionStats.direct - before.direct === (moving ? 0 : 1) && !w.anim);
    check('retour de la barre : pendant le trajet, la place annoncée à ce qui s’ancre à la page est déjà l’arrivée', same(win.boundsOf(view()), docked) && win.inFlight(view()) === moving, JSON.stringify([win.boundsOf(view()), docked, win.inFlight(view())]));
    await settled();
    const arrival = Date.now() - t0;
    check('retour de la barre : la page finit à sa place exacte', same(view().getBounds(), docked) && same(docked, { ...hidden, x: docked.x, width: hidden.width - (docked.x - hidden.x) }), JSON.stringify([view().getBounds(), docked, hidden]));
    console.log(`  – animation native des vues (${process.platform}, « Réduire les animations » ${system ? 'inactif' : 'actif, ignoré pour l’essai'}) : ${win.MOTION.sidebarIn} ms demandées ; position lue aussitôt après l’appel : x=${during.x} (départ ${hidden.x}, arrivée ${docked.x}) ; arrivée signalée à ${landed} ms, constatée à ${arrival} ms`);
    // Trajet plus long, pour voir si le système anime vraiment : cote lue à mi-course.
    {
      const probe = { ...docked, x: docked.x + 120 };
      const t1 = Date.now();
      let end = 0;
      view().once('bounds-changed', () => { end = Date.now() - t1; });
      view().setBounds(probe, { animate: { duration: 400, easing: 'linear' } });
      await sleep(200);
      const mid = view().getBounds().x;
      await until(() => end > 0, 'fin du trajet d’essai', 6000).catch(() => {});
      const fin = view().getBounds().x;
      console.log(`  – trajet d’essai de 400 ms : cote à 200 ms x=${mid}, à l’arrivée x=${fin} (départ ${docked.x}, cible ${probe.x}) ; fin signalée à ${end} ms`);
      check('trajet animé : la vue arrive à sa cible', fin === probe.x);
      let back = 0;
      view().once('bounds-changed', () => { back = 1; });
      view().setBounds(docked, { animate: { duration: 1 } });
      await until(() => back > 0, 'retour du trajet d’essai', 6000).catch(() => {});
      check('retour par un appel animé de 1 ms : cote exacte', same(view().getBounds(), docked));
    }
    // Interruptions : la dernière demande l'emporte, les cotes lues sont les bonnes
    w.toggleSidebar(false);
    await sleep(100);
    w.toggleSidebar(true);
    await sleep(15);
    w.toggleSidebar(false);
    await settled();
    await sleep(150);
    check('barre masquée pendant son retour : la page revient à la pleine largeur', same(view().getBounds(), hidden), JSON.stringify([view().getBounds(), hidden]));
    w.toggleSidebar(true);
    w.toggleSidebar(false);
    w.toggleSidebar(true);
    await settled();
    await sleep(150);
    check('bascules coup sur coup : la page finit à la place de la dernière demande', same(view().getBounds(), docked), JSON.stringify([view().getBounds(), docked]));
    // Machine lente : le trajet n'est pas fini alors que l'horloge le dit fini
    // depuis longtemps. Une pose directe à ce moment-là était défaite à la fin du
    // trajet interrompu, et la page restait à son ancienne place, barre masquée.
    if (moving) {
      w.toggleSidebar(false);
      await settled();
      await sleep(100);
      const realNow = Date.now;
      w.toggleSidebar(true);
      const late = view().getBounds();
      Date.now = () => realNow() + 60e3;
      try { w.toggleSidebar(false); } finally { Date.now = realNow; }
      await settled();
      await sleep(400);
      check('trajet plus long que prévu (machine lente) : masquer la barre en plein vol laisse la page à la pleine largeur', same(late, hidden) && same(view().getBounds(), hidden) && !flying(), JSON.stringify({ lue: view().getBounds(), attendue: hidden, enVol: late }));
      w.toggleSidebar(true);
      await settled();
      await sleep(100);
    }
    // Fenêtre redimensionnée pendant le mouvement
    const [cw, ch] = w.win.getContentSize();
    w.toggleSidebar(false);
    await sleep(100);
    w.toggleSidebar(true);
    w.win.setContentSize(cw - 60, ch);
    await until(() => w.win.getContentSize()[0] !== cw, 'fenêtre rétrécie');
    await settled();
    await sleep(200);
    const narrow = w.win.getContentSize()[0];
    check('fenêtre redimensionnée pendant le retour de la barre : la page suit', narrow < cw && same(view().getBounds(), pane()) && pane().width === docked.width - (cw - narrow), JSON.stringify([narrow, cw, view().getBounds(), pane()]));
    w.win.setContentSize(cw, ch);
    await until(() => w.win.getContentSize()[0] === cw, 'fenêtre rétablie');
    await settled();
    await sleep(200);
    // Vue scindée : les deux volets glissent ensemble
    const solo = w.activeId;
    const mate = w.orderedIds().find((x) => x !== solo);
    w.splitWith(solo, mate);
    w.toggleSidebar(false);
    await sleep(100);
    w.toggleSidebar(true);
    await settled();
    await sleep(150);
    const ids = w.visibleIds();
    check('vue scindée : chaque volet à sa place après le retour de la barre', ids.length === 2 && ids.every((x, i) => same(win.live.get(x).view.getBounds(), pane(i))));
    // Place réservée à droite (panneau latéral d'une extension)
    const inset = win.hooks.rightInset;
    win.hooks.rightInset = () => 140;
    w.toggleSidebar(false);
    await sleep(100);
    w.toggleSidebar(true);
    await settled();
    await sleep(150);
    const last = pane(1);
    check('place réservée à droite respectée après le retour de la barre', same(win.live.get(ids[1]).view.getBounds(), last) && last.x + last.width === cw - 10 - 140);
    win.hooks.rightInset = inset;
    w.closeSplitPane();
    w.activate(solo);
    await settled();
    await sleep(150);
    check('retour à une seule page, à sa place', w.visibleIds().length === 1 && same(view().getBounds(), docked));
  }

  // Recherche dans la page
  w.activate(a.id);
  w.openFind();
  let found = null;
  win.live.get(a.id).wc.on('found-in-page', (e, r) => { if (r.finalUpdate) found = r; });
  await sleep(250);
  w.find('orbe');
  await until(() => found, 'résultats de recherche');
  check('⌘F trouve le texte dans la page', found.matches === 3);
  w.closeFind();

  // Archive
  const cUrl = tabs()[child].url;
  w.close(child);
  check('⌘W archive l’onglet', !tabs()[child] && store.state.archive[0].url === cUrl);
  w.run('reopen');
  check('⇧⌘T rouvre le dernier onglet fermé', tabs()[w.activeId].url === cUrl && !store.state.archive.some((x) => x.url === cUrl));
  w.activate(a.id);
  w.run('clearToday');
  check('⇧⌘K efface Aujourd’hui sauf l’onglet actif', w.space.today.length === 1 && w.space.today[0] === a.id);

  // Onglet épinglé : ⌘W le décharge sans le supprimer
  w.togglePin(a.id);
  w.close(a.id);
  check('⌘W sur un onglet épinglé le met en veille', !!tabs()[a.id] && !win.live.has(a.id) && w.activeId === null);
  w.activate(a.id);
  await until(() => win.live.has(a.id), 'réveil de l’onglet épinglé');

  // Aperçu (Peek) : lien sortant d'un onglet épinglé
  const other = base.replace('127.0.0.1', 'localhost');
  const todayBefore = w.space.today.length;
  await until(() => !win.live.get(a.id).wc.isLoading(), 'onglet épinglé chargé');
  await gesture(a.id);
  await win.live.get(a.id).wc.executeJavaScript(`window.open(${JSON.stringify(other + '/b')}); 1`, true);
  await until(() => w.peekState && w.peekState.title === 'Page B', 'aperçu ouvert');
  check('un lien sortant d’un onglet épinglé s’ouvre en aperçu', w.activeId === a.id && w.space.today.length === todayBefore);
  await shot('apercu');
  const peekWc = w.peekState.view.webContents;
  w.run('expandPeek');
  check('⌘O transforme l’aperçu en onglet sans recharger', !w.peekState && win.live.get(w.activeId).wc === peekWc && tabs()[w.activeId].title === 'Page B' && w.space.today.length === todayBefore + 1);
  w.close(w.activeId);
  w.activate(a.id);
  w.openPeek(base + '/c', a.id);
  await until(() => w.peekState && w.peekState.title.startsWith('C '), 'second aperçu');
  // Fermeture interactive : la carte tirée se déplace sans changer de taille, relâchée elle revient.
  {
    const { boundsOf } = require('../src/main/motion');
    const view = w.peekState.view;
    await until(() => !win.inFlight(view), 'aperçu posé');
    const final = w.peekRect();
    const okPull = w.pullPeek(80);
    const pulled = boundsOf(view);
    const far = (w.pullPeek(5000), boundsOf(view));
    const bad = [w.pullPeek(-10), w.pullPeek(NaN), w.pullPeek('x')];
    const back = w.releasePeek();
    const again = w.releasePeek();
    check('aperçu tiré (fermeture interactive) : la carte suit de 80 px sans changer de taille, bornée à 60 % de sa largeur ; relâchée, elle revient à sa place',
      okPull === true && pulled.x === final.x + 80 && pulled.y === final.y && pulled.width === final.width && pulled.height === final.height
      && far.x === final.x + Math.round(final.width * 0.6) && far.width === final.width && bad.every((r) => r === false)
      && back === true && again === false && JSON.stringify(boundsOf(view)) === JSON.stringify(final) && !!w.peekState, JSON.stringify({ final, pulled, far, bad, back, again }));
    await until(() => !win.inFlight(view), 'aperçu revenu');
  }
  w.run('closeTab');
  check('⌘W ferme l’aperçu sans fermer l’onglet', !w.peekState && w.activeId === a.id && !!tabs()[a.id]);

  // Aperçu sur un clic ordinaire depuis un onglet épinglé (comme dans Arc)
  const pinL = w.newTab(base + '/liens');
  await until(() => titleOf(pinL.id) === 'Page à liens' && !win.live.get(pinL.id).loading, 'page à liens');
  w.togglePin(pinL.id);
  const lwc = win.live.get(pinL.id).wc;
  const pt = await lwc.executeJavaScript('(() => { const r = document.getElementById("dehors").getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + 20) }; })()');
  let clicks = 0;
  let skippedClick = false;
  await until(() => {
    if (w.peekState) return w.peekState.title === 'Page B';
    if (clicks++ % 25 === 0) { lwc.focus(); for (const type of ['mouseDown', 'mouseUp']) lwc.sendInputEvent({ type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 }); }
    return false;
  }, 'aperçu ouvert par un clic').catch((err) => {
    // Fenêtre de test en arrière-plan : Chromium ignore les clics simulés. Ce
    // n'est pas un défaut d'Orbe ; on le signale et on poursuit.
    if (lwc.getURL() === base + '/liens' && !w.win.isFocused()) { skippedClick = true; w.openPeek(base.replace('127.0.0.1', 'localhost') + '/b', pinL.id); return until(() => w.peekState && w.peekState.title === 'Page B', 'aperçu'); }
    throw err;
  });
  if (skippedClick) ignorer('clic sur un lien sortant d’un onglet épinglé', 'fenêtre de test en arrière-plan');
  else check('clic sur un lien sortant d’un onglet épinglé : aperçu, la page épinglée reste', lwc.getURL() === base + '/liens' && w.activeId === pinL.id);
  w.closePeek();
  w.togglePin(pinL.id);
  w.close(pinL.id);
  w.activate(a.id);

  // Aperçu : la carte grandit depuis le lien, se réduit à la fermeture, s'étend en onglet
  {
    const same = (r1, r2) => r1.x === r2.x && r1.y === r2.y && r1.width === r2.width && r1.height === r2.height;
    const kids = () => w.win.contentView.children;
    const final = w.peekRect();
    const zone = w.contentRect();
    const inside = (r) => r.x >= zone.x && r.y >= zone.y && r.x + r.width <= zone.x + zone.width && r.y + r.height <= zone.y + zone.height;
    const point = { x: final.x + 240, y: final.y + final.height - 30 };
    const seed = w.peekSeed(final, point);
    const centre = w.peekSeed(final, null);
    check('aperçu : départ autour du lien cliqué (sans sortir de la zone des pages), ou du centre à défaut',
      inside(seed) && seed.width < final.width / 2 && Math.abs(seed.x + seed.width / 2 - point.x) <= 1 && seed.y + seed.height === zone.y + zone.height
      && inside(centre) && Math.abs((centre.x + centre.width / 2) - (final.x + final.width / 2)) <= 1 && centre.width > final.width * 0.9);
    const v1 = w.openPeek(base + '/b', a.id, undefined, point);
    await until(() => w.peekState && w.peekState.title === 'Page B', 'aperçu animé ouvert');
    await sleep(450);
    check('aperçu : la carte finit à sa place, au-dessus du voile', same(v1.getBounds(), final) && kids().indexOf(v1) > kids().indexOf(w.peekChrome) && kids().includes(w.peekChrome));
    await until(() => w.peekChrome.webContents.executeJavaScript('document.body.classList.contains("peek") && !document.getElementById("peek").hidden'), 'voile de l’aperçu');
    const wc1 = v1.webContents;
    w.closePeek({ animate: true });
    const moving = win.motion(1) > 0;
    check('fermeture animée : l’aperçu n’existe plus pour le reste, sa vue reste le temps du mouvement', !w.peekState && w.activeWc === win.live.get(a.id).wc && kids().includes(v1) === moving);
    if (moving) await until(() => w.peekChrome.webContents.executeJavaScript('document.body.classList.contains("peek-out")'), 'voile qui s’efface');
    await sleep(350);
    check('fermeture animée : vue et voile retirés, page fermée', !kids().includes(v1) && !kids().includes(w.peekChrome) && wc1.isDestroyed());
    // Interruption : un nouvel aperçu pendant la fermeture du précédent
    const v2 = w.openPeek(base + '/b', a.id);
    const wc2 = v2.webContents;
    await sleep(60);
    w.closePeek({ animate: true });
    const v3 = w.openPeek(base + '/c', a.id);
    check('nouvel aperçu pendant une fermeture : le précédent est retiré aussitôt', !kids().includes(v2) && kids().includes(v3) && w.peekState.view === v3 && kids().filter((k) => k === w.peekChrome).length === 1);
    await until(() => wc2.isDestroyed(), 'page de l’aperçu précédent fermée');
    await until(() => w.peekState && w.peekState.title.startsWith('C '), 'troisième aperçu');
    await sleep(450);
    check('aperçu rouvert : carte à sa place', same(v3.getBounds(), final));
    // Passage en onglet : la carte s'étend jusqu'à la place de la page
    const under = win.live.get(a.id).view;
    w.expandPeek();
    const grown = w.activeId;
    check('aperçu agrandi : onglet créé aussitôt, la page quittée reste dessous pendant le mouvement', win.live.get(grown).view === v3 && !w.peekState && kids().includes(under) === moving);
    await sleep(500);
    const rect = w.paneRects(w.contentRect(), w.visibleIds())[0];
    check('aperçu agrandi : la page occupe toute la zone, au rang des pages ; l’ancienne et le voile sont retirés',
      same(v3.getBounds(), { x: rect.x, y: rect.y, width: rect.width, height: rect.height }) && kids().indexOf(v3) === 1 && !kids().includes(under) && !kids().includes(w.peekChrome));
    w.close(grown);
    w.activate(a.id);
  }

  // Espaces
  w.newSpace();
  const s2 = w.space;
  check('nouvel Espace créé et affiché', w.data.spaces.length === 2 && w.activeId === null);
  // Le nouvel Espace ouvre son champ de nom : on y tape le nom et on valide, comme
  // quelqu'un le ferait. (Renommé d'ici sans passer par le champ, celui-ci restait
  // ouvert quand la fenêtre d'essai n'a pas le premier plan — et tant qu'un
  // renommage est en cours, la barre ignore le balayage entre Espaces, à dessein.)
  await until(() => ui('!!document.querySelector("#space-name input.rename")'), 'champ de nom du nouvel Espace');
  await ui(`(() => { const i = document.querySelector('#space-name input.rename'); i.value = 'Projets'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
  await until(() => s2.name === 'Projets' && ui('!document.querySelector("input.rename") && editing === null'), 'Espace renommé par son champ');
  w.setTheme({ color: '#10b981', icon: '🚀' });
  const c = w.newTab(base + '/b');
  await until(() => titleOf(c.id) === 'Page B', 'page dans le second Espace');
  await until(() => ui('S.space.name === "Projets" && S.today.length === 1'), 'barre latérale du second Espace');
  w.setThemeExtra({ color2: '#3b82f6', grain: 0.3 });
  await until(() => ui('document.body.classList.contains("gradient") && getComputedStyle(document.body).backgroundImage.includes("gradient")'), 'thème en dégradé');
  check('thème d’Espace en dégradé avec grain', w.space.color2 === '#3b82f6' && w.space.grain === 0.3);
  await shot('espace-2');
  w.run('prevSpace');
  check('⌥⌘← revient à l’Espace précédent avec son onglet', w.space !== s2 && w.activeId === a.id);
  w.spaceAt(2);
  check('⌃2 va au deuxième Espace', w.space === s2 && w.activeId === c.id);

  // Glissement entre Espaces : les deux listes côte à côte, qui suivent les doigts
  {
    const firstSpace = w.data.spaces[0];
    await until(() => ui(`!slide && S.space.id === ${JSON.stringify(s2.id)}`), 'second Espace affiché');
    check('l’état donne à la barre la liste des Espaces voisins',
      await ui(`S.near.next === null && S.near.prev.space.id === ${JSON.stringify(firstSpace.id)} && S.near.prev.today.length === ${firstSpace.today.length} && [...S.near.prev.pinned, ...S.near.prev.today].some((x) => x.active)`));
    const reduced = await ui('matchMedia("(prefers-reduced-motion: reduce)").matches');
    // Balayage simulé : une suite d'événements de molette horizontaux sur la barre.
    const swipe = (dx, n, gap) => ui(`(async () => { for (let i = 0; i < ${n}; i++) { document.getElementById('scroll').dispatchEvent(new WheelEvent('wheel', { deltaX: ${dx}, bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, ${gap})); } })()`);
    const look = () => ui(`(() => { const g = document.querySelector('#pager .ghost'); const W = document.getElementById('pager').clientWidth; const x = (el) => new DOMMatrix(getComputedStyle(el).transform).m41; return { ghost: g ? g.dataset.space : null, rows: g ? g.querySelectorAll('.row.tab').length : 0, live: x(document.getElementById('scroll')), ghostX: g ? x(g) : null, W, tint: Number(getComputedStyle(document.getElementById('tint')).opacity), phase: slide ? slide.phase : null }; })()`);
    const SLOW = ['balayage lent : les deux listes suivent les doigts, côte à côte, la teinte se fond au même pas', 'doigts levés avant le seuil : la liste revient, l’Espace ne change pas', 'au bout de la rangée : la liste résiste, sans autre liste à côté', 'au bout de la rangée : rien ne change'];
    if (reduced) {
      for (const n of SLOW) ignorer(n, '« Réduire les animations » actif');
    } else if (!env.images) {
      // Le geste simulé est une suite d'événements espacés de 30 ms : minuteries
      // ralenties, la coque le croit fini entre deux événements.
      for (const n of SLOW) ignorer(n, env.sansImages);
    } else {
      await swipe(-12, 4, 30); // lent et court : en dessous du seuil
      const mid = await look();
      check('balayage lent : les deux listes suivent les doigts, côte à côte, la teinte se fond au même pas',
        mid.ghost === firstSpace.id && mid.rows >= firstSpace.today.length && mid.rows > 0 && mid.phase === 'drag'
        && Math.abs(mid.live - 48) < 1 && Math.abs(mid.ghostX - (48 - mid.W)) < 1 && Math.abs(mid.tint - 48 / mid.W) < 0.02, JSON.stringify(mid));
      await until(() => ui('!slide'), 'retour de la liste');
      const back = await look();
      check('doigts levés avant le seuil : la liste revient, l’Espace ne change pas', w.space === s2 && !back.ghost && back.live === 0 && back.tint === 0);
      await swipe(14, 5, 30); // vers la droite alors qu'il n'y a plus d'Espace : élastique
      const edge = await look();
      const plus = await ui('(() => { const el = document.querySelector("#pager .pager-plus"); return el ? Number(el.dataset.p) : -1; })()');
      check('au bout de la rangée, vers la droite : un « + » paraît et grandit avec le geste ; un balayage ordinaire ne crée pas d’Espace', plus > 0 && plus < 0.5 && w.data.spaces.length === 2, String(plus));
      check('au bout de la rangée : la liste résiste, sans autre liste à côté', !edge.ghost && edge.live < 0 && edge.live > -70 && edge.tint === 0, JSON.stringify(edge));
      await until(() => ui('!slide'), 'retour de l’élastique');
      check('au bout de la rangée : rien ne change', w.space === s2 && (await look()).live === 0);
    }
    await sleep(150);
    await swipe(-30, 6, 16); // franc : au-delà du seuil
    // (en cas d'échec : l'état du geste dans la coque, pour savoir ce qui l'a retenu)
    await until(() => w.space === firstSpace, 'changement d’Espace par balayage').catch(async (err) => {
      const etat = await ui('JSON.stringify({ wheelLocked, swipeSum, lastWheel, editing: !!editing, drag: !!drag, reduit: reducedMotion.matches, slide: slide ? slide.phase : null, espace: S && S.space.id, voisins: S && S.near ? [!!S.near.prev, !!S.near.next] : null })').catch((e) => String(e));
      err.message += ` — coque : ${etat} ; fenêtre : espace ${w.spaceId}, attendu ${firstSpace.id}`;
      throw err;
    });
    await until(() => ui(`!slide && S.space.id === ${JSON.stringify(firstSpace.id)}`), 'fin du glissement');
    const done = await look();
    check('balayage franc : l’Espace change une seule fois, la liste est rendue à l’arrivée', w.space === firstSpace && w.activeId === a.id && !done.ghost && done.live === 0 && done.tint === 0);
    await sleep(200);
    w.spaceAt(2);
    if (reduced || !env.images) ignorer('changement par raccourci : même glissement, dans le bon sens', reduced ? '« Réduire les animations » actif' : env.sansImages);
    else {
      await until(() => ui('!!slide'), 'glissement lancé par le raccourci');
      const fly = await look();
      check('changement par raccourci : même glissement, dans le bon sens', fly.ghost === s2.id && fly.ghostX >= 0 && fly.live <= 0, JSON.stringify(fly));
    }
    await until(() => ui(`!slide && S.space.id === ${JSON.stringify(s2.id)}`), 'second Espace rendu');
    check('changement par raccourci : arrivée sur le second Espace', w.space === s2 && w.activeId === c.id && await ui('document.getElementById("space-name").textContent === "Projets"'));
  }
  w.moveToSpace(c.id, w.data.spaces[0].id);
  check('déplacer un onglet vers un autre Espace', w.data.spaces[0].today.includes(c.id) && !s2.today.length);
  w.spaceAt(1);

  // Profils : cookies séparés par profil
  const sesBefore = win.live.get(a.id).wc.session;
  w.newProfile();
  check('nouveau profil attribué à l’Espace', w.data.profiles.length === 2 && w.space.profileId !== 'default');
  w.activate(a.id);
  await until(() => win.live.has(a.id), 'onglet rechargé dans le nouveau profil');
  check('le profil a sa propre session', win.live.get(a.id).wc.session !== sesBefore);
  w.setProfile('default');
  w.activate(a.id);

  // Import depuis Arc (fichier d'exemple, jamais les vraies données)
  const arc = require('../src/main/import-arc');
  const sample = path.join(require('os').tmpdir(), `orbe-arc-${Date.now()}.json`);
  const tabItem = (id, url, title, parent) => [id, { id, title: null, parentID: parent, childrenIds: [], data: { tab: { savedURL: url, savedTitle: title } } }];
  fs.writeFileSync(sample, JSON.stringify({ sidebar: { containers: [{ global: {} }, {
    items: [
      'pin', { id: 'pin', childrenIds: ['t1', 'f1'], data: { itemContainer: {} } },
      ...tabItem('t1', 'https://exemple.org/un', 'Un', 'pin'),
      'f1', { id: 'f1', title: 'Dossier Arc', parentID: 'pin', childrenIds: ['t2'], data: { list: {} } },
      ...tabItem('t2', 'https://exemple.org/deux', 'Deux', 'f1'),
      'unp', { id: 'unp', childrenIds: ['t3'], data: { itemContainer: {} } },
      ...tabItem('t3', 'https://exemple.org/trois', 'Trois', 'unp'),
      'top', { id: 'top', childrenIds: ['t4'], data: { itemContainer: {} } },
      ...tabItem('t4', 'https://exemple.org/favori', 'Favori', 'top'),
    ],
    spaces: ['s1', { id: 's1', title: 'Espace Arc', customInfo: { iconType: { emoji_v2: '🌾' } }, profile: { custom: { _0: { directoryBasename: 'Profile 3' } } }, containerIDs: ['pinned', 'pin', 'unpinned', 'unp'] }],
    topAppsContainerIDs: [{ custom: { _0: { directoryBasename: 'Profile 3' } } }, 'top'],
  }] } }));
  const arcData = arc.read(sample);
  const spacesBefore = w.data.spaces.length;
  arc.merge(arcData);
  const imported = w.data.spaces.find((x) => x.arcId === 's1');
  const importedFolder = imported && imported.pinned.find((n) => n.type === 'folder');
  check('import Arc : Espace, épinglés, dossier, onglet du jour',
    w.data.spaces.length === spacesBefore + 1 && imported.name === 'Espace Arc' && imported.icon === '🌾'
    && imported.pinned.length === 2 && importedFolder.name === 'Dossier Arc' && importedFolder.children.length === 1 && imported.today.length === 1);
  check('import Arc : profil et favoris du profil', imported.profileId !== 'default' && w.data.favs[imported.profileId].length === 1);
  check('import Arc : pas de doublon au second import', arc.merge(arcData) === 0);
  // Mise à jour d'après Arc : Arc a changé depuis l'import (ordre, dossier neuf, onglet neuf, doublon,
  // favori neuf, nom), et Orbe a un épinglé et un favori que Arc n'a pas.
  {
    // Données seules, sans vue : rien n'est chargé.
    const pose = (id, url) => { w.data.tabs[id] = { id, url, homeUrl: url, title: id, favicon: '', createdAt: Date.now(), lastActiveAt: Date.now() }; return w.data.tabs[id]; };
    const propre = pose('arc-essai-epingle', 'https://exemple.org/orbe-seul');
    imported.pinned.push({ type: 'tab', id: propre.id });
    const favOrbe = pose('arc-essai-favori', 'https://exemple.org/favori-orbe');
    w.data.favs[imported.profileId].push(favOrbe.id);
    const idUn = imported.pinned.find((n) => n.type === 'tab' && w.data.tabs[n.id].url === 'https://exemple.org/un').id;
    const idDossier = importedFolder.id;
    const plus = JSON.parse(JSON.stringify(arcData));
    plus.spaces[0].name = 'Espace Arc renommé';
    plus.spaces[0].pinned = [
      { type: 'folder', name: 'Dossier neuf', children: [{ type: 'tab', url: 'https://exemple.org/quatre', title: 'Quatre', name: '' }] },
      plus.spaces[0].pinned[1], // « Dossier Arc », passé devant
      plus.spaces[0].pinned[0], // « Un », passé derrière
      { type: 'tab', url: 'https://exemple.org/un', title: 'Un', name: '' }, // le même une seconde fois
    ];
    plus.spaces[0].today.push({ type: 'tab', url: 'https://exemple.org/cinq', title: 'Cinq', name: '' });
    plus.favorites['Profile 3'].unshift({ type: 'tab', url: 'https://exemple.org/favori-neuf', title: 'Favori neuf', name: '' });
    plus.spaces.unshift({ arcId: 's0', name: 'Espace d’avant', icon: '', color: null, profile: 'default', pinned: [], today: [] });
    const copie = JSON.parse(JSON.stringify(w.data));
    const plan = arc.sync(plus, copie);
    const avant = JSON.stringify(w.data);
    check('mise à jour d’après Arc, essai à blanc : le compte est fait sur une copie, l’état ne bouge pas',
      plan.spaces === 1 && plan.tabs === 2 && plan.folders === 1 && plan.favorites === 1 && plan.today === 1 && plan.changed > 0 && JSON.stringify(w.data) === avant, JSON.stringify(plan));
    const fait = arc.sync(plus);
    const noms = imported.pinned.map((n) => (n.type === 'folder' ? '[' + n.name + ':' + n.children.map((c) => w.data.tabs[c.id].url.split('/').pop()).join(',') + ']' : w.data.tabs[n.id].url.split('/').pop())).join(' ');
    check('… appliquée : dossiers et onglets dans l’ordre d’Arc, le doublon d’Arc créé, l’épinglé d’Orbe seul gardé à la suite',
      noms === '[Dossier neuf:quatre] [Dossier Arc:deux] un un orbe-seul' && imported.name === 'Espace Arc renommé', noms + ' / ' + imported.name);
    check('… un onglet et un dossier déjà là sont réutilisés (mêmes identifiants), rien n’est supprimé',
      imported.pinned[2].id === idUn && imported.pinned[1].id === idDossier && !!w.data.tabs[propre.id] && fait.tabs === 2);
    const favs = w.data.favs[imported.profileId].map((id) => w.data.tabs[id].url.split('/').pop()).join(' ');
    check('… favoris : ceux d’Arc d’abord, dans son ordre, celui d’Orbe seul ensuite ; onglet du jour ajouté', favs === 'favori-neuf favori favori-orbe' && imported.today.length === 2, favs);
    const iAvant = w.data.spaces.findIndex((x) => x.arcId === 's0');
    check('… Espaces : le nouvel Espace d’Arc vient juste avant, comme dans Arc ; les Espaces d’Orbe seul ne bougent pas',
      iAvant >= 0 && w.data.spaces[iAvant + 1] === imported && w.data.spaces[0].id === JSON.parse(avant).spaces[0].id, w.data.spaces.map((x) => x.name).join(' | '));
    const encore = arc.sync(plus);
    check('… une seconde mise à jour ne change plus rien', encore.changed === 0, JSON.stringify(encore));
    // Ménage : l'Espace d'avant, et ce que la mise à jour a créé.
    const s0 = w.data.spaces[iAvant];
    w.data.spaces.splice(iAvant, 1);
    void s0;
    const garde = new Set([...imported.today.slice(0, 1), w.data.favs[imported.profileId][1], idUn, importedFolder.children[0].id]);
    const tous = [];
    const voir = (nodes) => { for (const n of nodes) { if (n.type === 'folder') voir(n.children); else tous.push(n.id); } };
    voir(imported.pinned);
    for (const id of [...tous, ...imported.today, ...w.data.favs[imported.profileId]]) if (!garde.has(id)) { if (win.live.has(id)) OrbeWindow.destroyView(id); delete w.data.tabs[id]; }
    imported.pinned = [{ type: 'tab', id: idUn }, { type: 'folder', id: idDossier, name: 'Dossier Arc', open: false, children: [{ type: 'tab', id: importedFolder.children[0].id }] }];
    imported.today = imported.today.slice(0, 1);
    w.data.favs[imported.profileId] = [w.data.favs[imported.profileId][1]];
  }
  fs.unlinkSync(sample);
  w.data.spaces.splice(w.data.spaces.indexOf(imported), 1);
  for (const id of [...imported.today, ...w.data.favs[imported.profileId], imported.pinned[0].id, importedFolder.children[0].id]) delete w.data.tabs[id];
  w.data.favs[imported.profileId] = [];
  OrbeWindow.pushAll();

  // Aiguillage des liens venus d'autres applications
  store.state.settings.routes = [{ match: '127.0.0.1/b', to: s2.id }];
  openUrl(base + '/b');
  check('aiguillage : le lien s’ouvre dans l’Espace de la règle', w.space === s2 && tabs()[w.activeId].url === base + '/b');
  w.close(w.activeId);
  store.state.settings.routes = [];
  w.spaceAt(1);

  // Handoff (macOS) : page reprise d'un autre appareil. L'événement d'Electron est rejoué tel quel.
  {
    const { app } = require('electron');
    const before = Object.keys(tabs()).length;
    const emit = (type, details) => { let prevented = false; app.emit('continue-activity', { preventDefault: () => { prevented = true; } }, type, {}, details); return prevented; };
    const refused = [
      emit('NSUserActivityTypeBrowsingWeb', { webpageURL: 'file:///etc/passwd' }),
      emit('NSUserActivityTypeBrowsingWeb', { webpageURL: 'javascript:alert(1)' }),
      emit('NSUserActivityTypeBrowsingWeb', { webpageURL: 'orbe://app/settings.html' }),
      emit('NSUserActivityTypeBrowsingWeb', { webpageURL: 'https://' + 'a'.repeat(5000) + '.exemple/' }),
      emit('NSUserActivityTypeBrowsingWeb', {}),
      emit('com.exemple.autre', { webpageURL: base + '/a' }),
    ];
    const none = Object.keys(tabs()).length === before;
    const taken = emit('NSUserActivityTypeBrowsingWeb', { webpageURL: base + '/b?handoff' });
    check('Handoff : une page web reprise d’un autre appareil s’ouvre dans un onglet ; toute autre adresse ou activité est ignorée',
      refused.every((x) => x === false) && none && taken === true && tabs()[w.activeId].url === base + '/b?handoff', JSON.stringify(refused));
    w.close(w.activeId);
  }

  // Langue
  await until(() => ui('document.querySelector("#b-newtab .title").textContent === "Nouvel onglet"'), 'libellé français');
  store.state.settings.lang = 'en';
  OrbeWindow.pushAll();
  await until(() => ui('document.querySelector("#b-newtab .title").textContent === "New Tab"'), 'libellé anglais');
  check('l’interface passe en anglais', true);
  store.state.settings.lang = 'fr';
  OrbeWindow.pushAll();
  await until(() => ui('document.querySelector("#b-newtab .title").textContent === "Nouvel onglet"'), 'retour au français');

  // Menu : raccourcis d'Arc
  const accels = new Set();
  const collect = (m) => { for (const it of m.items) { if (it.accelerator) accels.add(it.accelerator); if (it.submenu) collect(it.submenu); } };
  require('../src/main/menu').build();
  collect(Menu.getApplicationMenu());
  const wanted = ['Cmd+T', 'Cmd+N', 'Shift+Cmd+N', 'Alt+Cmd+N', 'Shift+Cmd+T', 'Cmd+L', 'Shift+Cmd+W', 'Shift+Cmd+2', 'Shift+Cmd+S', 'Cmd+P', 'Shift+Cmd+C', 'Alt+Shift+Cmd+C', 'Cmd+F', 'Cmd+G', 'Cmd+S', 'Shift+Cmd+D', 'Cmd+.', 'Cmd+R', 'Shift+Cmd+R', 'Ctrl+Shift+=', 'Ctrl+Shift+-', 'Cmd+0', 'Alt+Cmd+U', 'Alt+Cmd+I', 'Alt+Cmd+C', 'Alt+Cmd+J', 'Ctrl+Cmd+F', 'Alt+Cmd+Right', 'Alt+Cmd+Left', 'Ctrl+1', 'Cmd+D', 'Alt+Cmd+Down', 'Alt+Cmd+Up', 'Shift+Cmd+K', 'Cmd+[', 'Cmd+]', 'Cmd+Y', 'Shift+Cmd+L', 'Shift+Cmd+J', 'Cmd+,', 'Cmd+1', 'Cmd+9'];
  // Hors macOS, les mêmes commandes portent les raccourcis du système (⌘ -> Ctrl…).
  const missing = wanted.map((k) => platform.accel(k)).filter((k) => !accels.has(k));
  check(`les ${wanted.length} raccourcis d’Arc sont dans le menu`, !missing.length, 'manquants : ' + missing.join(', '));

  // Windows : habillage et raccourcis propres au système
  if (platform.isWin) {
    const list = [];
    const all = (m) => { for (const it of m.items) { if (it.accelerator) list.push(it.accelerator); if (it.submenu) all(it.submenu); } };
    all(Menu.getApplicationMenu());
    const twice = list.filter((k, i) => list.indexOf(k) !== i && k !== platform.accel('Cmd+T'));
    check('Windows : raccourcis en Ctrl, sans doublon, affichés en notation Windows',
      commands.byName.get('newTab').accel === 'Ctrl+T' && commands.byName.get('newTab').keys === 'Ctrl+T' && commands.byName.get('history').keys === 'Ctrl+H'
      && !twice.length && !list.some((k) => /Cmd/.test(k)) && !/[⌘⌃⌥⇧]/.test(store.t('side.empty')), 'doublons : ' + twice.join(', '));
    const chrome = await ui('JSON.stringify([document.documentElement.classList.contains("win"), getComputedStyle(document.getElementById("b-menu")).display, getComputedStyle(document.getElementById("top")).paddingLeft, getComputedStyle(document.body).fontFamily])');
    const [isWinClass, menuDisplay, topPad, font] = JSON.parse(chrome);
    check('Windows : bouton de menu visible, pas de marge pour les feux tricolores, police Segoe', isWinClass && menuDisplay !== 'none' && topPad === '0px' && /Segoe/.test(font), chrome);
    const vb = win.live.get(w.activeId).view.getBounds();
    const [cw] = w.win.getContentSize();
    check('Windows : la page laisse libre la bande des boutons de fenêtre', vb.y === platform.CAPTION_H && vb.x + vb.width === cw - 10, JSON.stringify(vb));
    // Vraie frappe envoyée à la page : le menu est invisible, ses raccourcis doivent rester actifs.
    const kwc = win.live.get(w.activeId).wc;
    kwc.focus();
    let tries = 0;
    const opened = await until(() => {
      if (w.modalMode === 'command') return true;
      if (tries++ % 25 === 0) { kwc.sendInputEvent({ type: 'keyDown', keyCode: 'T', modifiers: ['control'] }); kwc.sendInputEvent({ type: 'keyUp', keyCode: 'T', modifiers: ['control'] }); }
      return false;
    }, 'Ctrl+T', 5000).catch(() => false);
    check('Windows : Ctrl+T frappé dans la page ouvre la barre de commande (menu masqué)', opened === true);
    if (w.modalMode) w.hideModal();
    // Barre d'outils : elle s'arrête avant les boutons de fenêtre.
    commands.setSetting('showToolbar', true);
    await until(() => ui('document.body.classList.contains("toolbar")'), 'barre d’outils affichée');
    await sleep(250);
    const tb = JSON.parse(await ui('JSON.stringify([document.getElementById("toolbar").getBoundingClientRect().right, innerWidth])'));
    const vt = win.live.get(w.activeId).view.getBounds();
    check('Windows : la barre d’outils s’arrête avant les boutons de fenêtre', tb[0] <= tb[1] - 138 && vt.y === 50, JSON.stringify([tb, vt]));
    await shot('win-barre-outils');
    commands.setSetting('showToolbar', false);
    await until(() => ui('!document.body.classList.contains("toolbar")'), 'barre d’outils masquée');
    // Thème sombre : capture seulement (symboles clairs des boutons de fenêtre).
    if (shots) {
      commands.setSetting('appearance', 'dark');
      await until(() => ui('matchMedia("(prefers-color-scheme: dark)").matches'), 'interface en sombre');
      await shot('win-sombre');
      commands.setSetting('appearance', 'auto');
    }
  }

  // Téléchargement
  win.live.get(a.id).wc.downloadURL(base + '/file.txt');
  await until(() => store.state.downloads[0] && store.state.downloads[0].state === 'completed', 'téléchargement terminé');
  const dl = store.state.downloads[0];
  check('téléchargement enregistré', fs.existsSync(dl.path) && fs.readFileSync(dl.path, 'utf8') === 'bonjour');
  fs.unlinkSync(dl.path);

  // Capture d'une zone (⇧⌘2) : zone choisie, puis action
  w.activate(a.id);
  const dlDir0 = require('electron').app.getPath('downloads');
  const pngs0 = fs.readdirSync(dlDir0).filter((f) => f.endsWith('.png')).length;
  let played = '';
  const sendOrig = w.ui.webContents.send.bind(w.ui.webContents);
  w.ui.webContents.send = (ch, ...rest) => { if (ch === 'sound') played = rest[0] && rest[0].name; return sendOrig(ch, ...rest); };
  // La page vient d'être réaffichée : la capture peut être vide tant qu'elle n'a pas été peinte.
  const zoneSaved = await until(async () => (await w.capture({ area: { x: 10, y: 10, width: 200, height: 120 }, then: 'save' })) === 'save', 'capture d’une zone').catch((e) => e.message);
  // Écran en veille ou session verrouillée : Chromium ne peut rien capturer.
  const canCapture = zoneSaved === true;
  if (!canCapture && env.vivant) check('capture d’une zone : enregistrée', false, String(zoneSaved));
  else if (!canCapture) for (const n of ['capture d’une zone : enregistrée', 'capture d’une zone : l’image a les proportions de la zone', 'capture : le son de capture est demandé', 'réglage « Sons » coupé : aucun son']) ignorer(n, env.raison);
  else {
  check('capture d’une zone : enregistrée', true);
  await until(() => fs.readdirSync(dlDir0).filter((f) => f.endsWith('.png')).length >= pngs0 + 1, 'zone enregistrée');
  const zone = fs.readdirSync(dlDir0).filter((f) => f.endsWith('.png')).map((f) => path.join(dlDir0, f)).sort().pop();
  const zoneSize = await until(() => { const sz = require('electron').nativeImage.createFromPath(zone).getSize(); return sz.width ? sz : null; }, 'zone lisible');
  check('capture d’une zone : l’image a les proportions de la zone', Math.abs(zoneSize.width / zoneSize.height - 200 / 120) < 0.02, JSON.stringify(zoneSize));
  check('capture : le son de capture est demandé', played === 'capture');
  store.state.settings.sounds = false;
  played = '';
  await w.capture({ area: 'full', then: 'copy' });
  check('réglage « Sons » coupé : aucun son', played === '');
  }
  store.state.settings.sounds = true;
  w.ui.webContents.send = sendOrig;
  check('le fichier du son existe et se charge', await ui('fetch("sons/capture.wav").then((r) => r.ok && r.headers.get("content-type"))').then((x) => !!x).catch(() => false));

  // Sons : fichiers fabriqués par scripts/make-sounds.js, courts, au même niveau, sans claquement
  {
    const sounds = require('../src/main/sounds');
    const gen = require('../scripts/make-sounds');
    const dir = path.join(__dirname, '..', 'src', 'renderer', 'sons');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.wav')).map((f) => f.replace('.wav', '')).sort();
    check('sons : un fichier par son connu, rien d’autre', JSON.stringify(files) === JSON.stringify([...sounds.NAMES].sort()) && JSON.stringify(files) === JSON.stringify(Object.keys(gen.SOUNDS).sort()), files.join(','));
    const facts = files.map((name) => {
      const buf = fs.readFileSync(path.join(dir, name + '.wav'));
      const { samples, rate, channels } = gen.read(buf);
      let peak = 0; let power = 0;
      for (const v of samples) { peak = Math.max(peak, Math.abs(v)); power += v * v; }
      return { name, same: buf.equals(gen.wav([...gen.SOUNDS[name]()])), seconds: samples.length / rate, peak, rms: Math.sqrt(power / samples.length), edges: Math.max(Math.abs(samples[0]), Math.abs(samples[samples.length - 1])), mono: channels === 1 && rate === 44100 };
    });
    check('sons : chaque fichier est exactement ce que produit le script de synthèse (aucun fichier tiers)', facts.every((x) => x.same), facts.filter((x) => !x.same).map((x) => x.name).join(','));
    check('sons : brefs (moins d’une demi-seconde), mono 44,1 kHz', facts.every((x) => x.seconds > 0.08 && x.seconds < 0.5 && x.mono), JSON.stringify(facts.map((x) => [x.name, x.seconds])));
    check('sons : même niveau moyen pour tous, crête à −6 dB au plus, début et fin à zéro', facts.every((x) => x.peak <= gen.PEAK + 0.001 && x.rms > gen.LEVEL * 0.9 && x.rms < gen.LEVEL * 1.05 && x.edges < 0.001), JSON.stringify(facts.map((x) => [x.name, x.peak.toFixed(3), x.rms.toFixed(3)])));
    check('pendant les essais, aucun son n’est joué (demande transmise « muette »)', sounds.QUIET === (process.env.ORBE_TEST_SOUNDS !== '1'));

    // Sons des gestes : déduits des changements d'état, après un geste seulement
    const S0 = { sounds: store.state.settings.sounds, soundGestures: store.state.settings.soundGestures, soundVolume: store.state.settings.soundVolume };
    const sent = [];
    const send0 = w.ui.webContents.send.bind(w.ui.webContents);
    w.ui.webContents.send = (ch, ...rest) => { if (ch === 'sound') sent.push(rest[0]); return send0(ch, ...rest); };
    const heard = async (act) => { sent.length = 0; await act(); await sleep(120); return sent.map((x) => x.name).join(','); };
    check('sons des gestes : coupés par défaut', S0.soundGestures === false && S0.soundVolume === 50);
    w.activate(a.id);
    await sleep(150);
    check('réglage par défaut : ouvrir un onglet ne demande aucun son', (await heard(() => { sounds.arm(w); w.newTab(base + '/b'); })) === '' && w.activeId !== a.id);
    const fresh = w.activeId;
    store.state.settings.soundGestures = true;
    store.state.settings.soundVolume = 30;
    check('sons des gestes activés : fermer un onglet (commande) demande « close », au volume réglé', (await heard(() => commands.run(w, 'closeTab'))) === 'close' && sent[0].volume === 0.3 && sent[0].mute === sounds.QUIET && !w.data.tabs[fresh], JSON.stringify(sent));
    let made = null;
    check('nouvel onglet (geste) : « tab »', (await heard(() => { sounds.arm(w); made = w.newTab(base + '/b'); })) === 'tab');
    check('épingler : « pin » ; désépingler : « unpin »', (await heard(() => { sounds.arm(w); w.move({ id: made.id, to: 'pinned', index: 0 }); })) === 'pin' && (await heard(() => { sounds.arm(w); w.move({ id: made.id, to: 'today', index: 0 }); })) === 'unpin', JSON.stringify(sent));
    check('changer d’Espace : « space »', (await heard(() => { w.handle('switchSpace', w.data.spaces[1].id); })) === 'space');
    await until(() => ui('!slide'), 'fin du glissement');
    check('revenir par un raccourci : « space » aussi', (await heard(() => commands.run(w, 'prevSpace'))) === 'space');
    await until(() => ui('!slide'), 'fin du glissement');
    check('refus (cinquième volet d’une vue scindée) : « error »', (await heard(() => w.toast('refus', 'error'))) === 'error');
    check('un changement qui ne suit aucun geste (archivage automatique, page qui ouvre un onglet) reste muet', (await heard(() => { w.soundArmed = 0; w.close(made.id); })) === '' && !w.data.tabs[made.id]);
    check('un geste, un son : le changement suivant est muet', (await heard(async () => { sounds.arm(w); const x = w.newTab(base + '/b'); await sleep(60); w.soundArmed = 0; w.close(x.id); })) === 'tab');
    store.state.settings.soundVolume = 0;
    check('volume à zéro : aucun son', (await heard(() => w.sound('capture'))) === '' && !sounds.wanted('tab'));
    store.state.settings.soundVolume = 50;
    store.state.settings.sounds = false;
    check('réglage « Sons » coupé : ni capture ni gestes', (await heard(() => { w.sound('capture'); sounds.arm(w); const x = w.newTab(base + '/b'); w.close(x.id); })) === '');
    store.state.settings.sounds = true;
    check('son inconnu : refusé', sounds.play(w, '../x') === false && sounds.play(w, 'boum') === false);
    w.sound('tab');
    check('la coque charge le fichier du son demandé, sans le jouer pendant les essais', await until(() => ui('typeof sounds === "object" && !!sounds.tab && sounds.tab.src.endsWith("sons/tab.wav") && sounds.tab.paused'), 'son chargé').then(() => true).catch(() => false));
    check('sons : la suite des changements se lit (Espace, épingle, onglet, fermeture)', sounds.diff({ space: 'a', today: new Set(['1']), kept: new Set() }, { space: 'b', today: new Set(), kept: new Set() }) === 'space'
      && sounds.diff({ space: 'a', today: new Set(['1']), kept: new Set() }, { space: 'a', today: new Set(), kept: new Set(['1']) }) === 'pin'
      && sounds.diff({ space: 'a', today: new Set(['1']), kept: new Set() }, { space: 'a', today: new Set(['1', '2']), kept: new Set() }) === 'tab'
      && sounds.diff({ space: 'a', today: new Set(['1']), kept: new Set() }, { space: 'a', today: new Set(), kept: new Set() }) === 'close'
      && sounds.diff({ space: 'a', today: new Set(['1']), kept: new Set() }, { space: 'a', today: new Set(['1']), kept: new Set() }) === '' && sounds.diff(null, { space: 'a' }) === '');
    Object.assign(store.state.settings, S0);
    w.ui.webContents.send = send0;
    w.activate(a.id);
  }

  // Thème d'un Espace : validation, thème par défaut, palette lisible, textures
  {
    const Theme = require('../src/renderer/theme');
    const tx = require('../scripts/make-textures');
    const sp = { color: '#7c6cf0', icon: '🏠' };
    Theme.apply(sp, { colors: ['#FF0000', '#00ff00', '#0000ff'], intensity: 0.737, grain: 0.256, texture: 'tweed', mode: 'dark', icon: '🚀' });
    check('thème : trois couleurs, intensité, texture, mode et icône enregistrés (valeurs arrondies, couleurs en minuscules)',
      JSON.stringify([sp.color, sp.color2, sp.color3, sp.intensity, sp.grain, sp.texture, sp.mode, sp.icon]) === JSON.stringify(['#ff0000', '#00ff00', '#0000ff', 0.74, 0.26, 'tweed', 'dark', '🚀']), JSON.stringify(sp));
    const before = JSON.stringify(sp);
    const changed = Theme.apply(sp, { colors: ['#ff0000', 'red'], color: 'javascript:1', color2: '#12', intensity: 3, grain: -1, texture: '../x', mode: 'sepia', icon: 'x'.repeat(40), preset: 'inconnu' });
    Theme.apply(sp, { colors: ['#111111', '#222222', '#333333', '#444444'] });
    Theme.apply(sp, null);
    check('thème : toute valeur invalide est ignorée (couleur, quatrième couleur, bornes, texture, mode)', changed === false && JSON.stringify(sp) === before);
    Theme.apply(sp, { colors: [] });
    check('thème : sans aucune couleur, thème par défaut (fond neutre, accent d’origine)', sp.plain === true && sp.color === Theme.DEFAULT_COLOR && sp.color2 === '' && sp.color3 === ''
      && Theme.palette({ ...sp, mode: 'light' }, true).stops.join() === '#f3f3f5' && Theme.palette({ ...sp, mode: 'auto' }, true).stops.join() === '#16161a');
    Theme.apply(sp, { color: '#10b981' });
    check('thème : choisir une couleur quitte le thème par défaut', !sp.plain && Theme.normalize(sp).colors.join() === '#10b981');
    Theme.apply(sp, { preset: 'lagon' });
    check('thème prêt : couleurs, intensité et texture appliquées d’un coup', sp.color === '#3b82f6' && sp.color3 === '#9fdcc4' && sp.texture === 'grain' && sp.grain === 0.25 && sp.intensity === 0.62);
    check('nuanciers : trois familles de neuf teintes, toutes valides et distinctes ; huit thèmes prêts',
      ['pastel', 'drab', 'grey'].every((f) => Theme.PALETTES[f].length === 9 && Theme.PALETTES[f].every(Theme.isHex)) && new Set(Object.values(Theme.PALETTES).flat()).size === 27
      && Theme.PRESETS.length === 8 && Theme.PRESETS.every((x) => x.colors.every(Theme.isHex) && x.colors.length <= 3 && Theme.TEXTURES.includes(x.texture)));
    check('thème d’origine inchangé : 18 % de couleur en clair, 24 % en sombre à l’intensité moyenne',
      Math.abs(Theme.tintOf(Theme.normalize({ color: '#7c6cf0' }), false) - 0.18) < 1e-9 && Math.abs(Theme.tintOf(Theme.normalize({ color: '#7c6cf0' }), true) - 0.24) < 1e-9
      && Theme.tintOf(Theme.normalize({ color: '#7c6cf0', intensity: 0 }), false) < 0.05 && Theme.tintOf(Theme.normalize({ color: '#7c6cf0', intensity: 1 }), false) > 0.7);
    // Lisibilité : thèmes prêts, nuanciers, et 3 000 thèmes au hasard, en clair et en sombre.
    let seed = 20261009;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let worst = Infinity;
    let worstOf = '';
    const see = (theme, dark) => { const p = Theme.palette(theme, dark); if (p.contrast < worst) { worst = p.contrast; worstOf = JSON.stringify([theme.colors, theme.intensity, theme.mode, dark]); } return p; };
    for (const preset of Theme.PRESETS) for (const mode of Theme.MODES) for (const dark of [false, true]) see({ colors: preset.colors, accent: preset.colors[0], intensity: preset.intensity, grain: 0, texture: 'grain', mode }, dark);
    for (const c of Object.values(Theme.PALETTES).flat()) for (const i of [0, 0.5, 1]) for (const dark of [false, true]) see({ colors: [c], accent: c, intensity: i, grain: 0, texture: 'grain', mode: 'auto' }, dark);
    for (let i = 0; i < 3000; i++) {
      const colors = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => Theme.hex([rnd() * 255, rnd() * 255, rnd() * 255]));
      see({ colors, accent: colors[0], intensity: rnd(), grain: 0, texture: 'grain', mode: Theme.MODES[i % 3] }, i % 2 === 0);
    }
    check('thème : le texte de la barre garde un contraste d’au moins 4,5 sur tout fond (thèmes prêts, nuanciers, 3 000 thèmes au hasard)', worst >= 4.5, `${worst.toFixed(3)} pour ${worstOf}`);
    console.log(`  – contraste le plus faible calculé : ${worst.toFixed(2)}`);
    const navy = Theme.palette({ colors: ['#0b1d4a'], accent: '#0b1d4a', intensity: 1, grain: 0, texture: 'grain', mode: 'light' }, false);
    const lemon = Theme.palette({ colors: ['#fff27a'], accent: '#fff27a', intensity: 1, grain: 0, texture: 'grain', mode: 'dark' }, true);
    check('thème : fond foncé en mode clair = texte clair ; fond pâle en mode sombre = texte sombre ; texte sur l’accent choisi de même', navy.family === 'dark' && navy.fg === '#f3f3f5' && navy.onAccent === '#ffffff' && lemon.family === 'light' && lemon.fg === '#1d1d1f' && lemon.onAccent === '#141416');
    // Textures : quatre carreaux, exactement ceux que produit le script, gris moyen neutre.
    const txDir = path.join(__dirname, '..', 'src', 'renderer', 'textures');
    const tiles = Theme.TEXTURES.map((name) => {
      const buf = fs.readFileSync(path.join(txDir, name + '.png'));
      const img = tx.read(buf);
      let mean = 0;
      for (const v of img.pixels) mean += v;
      mean /= img.pixels.length;
      let sd = 0;
      for (const v of img.pixels) sd += (v - mean) ** 2;
      return { name, same: buf.equals(tx.png(tx.TEXTURES[name]())), size: img.size, grey: img.depth === 8 && img.color === 0, mean, sd: Math.sqrt(sd / img.pixels.length), bytes: buf.length };
    });
    check('textures : grain, sable, tweed, denim — fichiers identiques à ce que calcule le script, carreaux gris de 192 px', JSON.stringify(fs.readdirSync(txDir).sort()) === JSON.stringify(Theme.TEXTURES.map((x) => x + '.png').sort()) && tiles.every((x) => x.same && x.size === 192 && x.grey && x.bytes < 40000), JSON.stringify(tiles));
    check('textures : gris moyen neutre (la texture ne change ni la teinte ni la clarté du fond), relief net', tiles.every((x) => Math.abs(x.mean - 128) < 1.5 && x.sd > 25 && x.sd < 45), JSON.stringify(tiles.map((x) => [x.name, x.mean.toFixed(1), x.sd.toFixed(1)])));
    check('textures : quatre motifs distincts', new Set(tiles.map((x) => x.bytes)).size === 4);
    // L'état transmis à la barre porte le thème entier, pour l'Espace affiché et ses voisins.
    w.setTheme({ colors: ['#10b981', '#3b82f6', '#f59e0b'], intensity: 0.7, texture: 'sand', grain: 0.4, mode: 'dark' });
    await until(() => ui('S.space.color3 === "#f59e0b" && S.space.texture === "sand" && S.space.mode === "dark" && S.space.intensity === 0.7'), 'thème transmis');
    const body = await ui('({ fam: document.documentElement.dataset.family, grainy: document.body.classList.contains("grainy"), paint: getComputedStyle(document.body).backgroundImage, tx: getComputedStyle(document.body, "::before").backgroundImage, fg: getComputedStyle(document.body).getPropertyValue("--fg").trim() })');
    const want = Theme.palette(w.space, false);
    check('thème appliqué à la barre : dégradé à trois arrêts, texture, couleurs de texte calculées', body.fam === want.family && body.grainy && (body.paint.match(/rgba?\(/g) || []).length === 3 && body.tx.includes('textures/sand.png') && body.fg === want.fg, JSON.stringify(body));
    check('les vues flottantes reçoivent le thème de l’Espace', JSON.stringify(w.handle('themeGet').space) === JSON.stringify(await ui('(({ color, color2, color3, plain, intensity, grain, texture, mode }) => ({ color, color2, color3, plain, intensity, grain, texture, mode }))(S.space)')));
    w.setTheme({ colors: ['#7c6cf0'], intensity: 0.5, grain: 0, texture: 'grain', mode: 'auto' });
    await until(() => ui('S.space.color === "#7c6cf0" && !document.body.classList.contains("grainy")'), 'thème d’origine rendu');
  }

  // Capture de la page entière
  const tall = w.newTab(base + '/long');
  await until(() => titleOf(tall.id) === 'Page longue', 'page longue chargée');
  const dlDir = require('electron').app.getPath('downloads');
  const pngsBefore = new Set(fs.readdirSync(dlDir).filter((f) => f.endsWith('.png')));
  const pngBefore = pngsBefore.size;
  await w.captureFull();
  await until(() => fs.readdirSync(dlDir).filter((f) => f.endsWith('.png')).length === pngBefore + 1, 'capture enregistrée');
  const png = path.join(dlDir, fs.readdirSync(dlDir).filter((f) => f.endsWith('.png') && !pngsBefore.has(f))[0]);
  const pngSize = await until(() => { const sz = require('electron').nativeImage.createFromPath(png).getSize(); return sz.height ? sz : null; }, 'capture lisible');
  check('capture de la page entière (au-delà de la zone visible)', pngSize.height >= 4000, JSON.stringify(pngSize));
  w.close(tall.id);
  w.activate(a.id);

  // Image dans l'image : la vidéo suit quand on change d'onglet
  const vid = w.newTab(base + '/video');
  await until(() => titleOf(vid.id) === 'Page vidéo', 'page vidéo chargée');
  const vwc = win.live.get(vid.id).wc;
  await vwc.executeJavaScript('start()', true);
  // Session verrouillée : le système ne joue aucun son, l'onglet n'est jamais « audible ».
  const audible = await until(() => vwc.isCurrentlyAudible(), 'vidéo audible', 8000).then(() => true, () => false);
  if (!audible && !env.muet) throw new Error('Délai dépassé : vidéo audible');
  if (!audible) {
    for (const n of ['la vidéo en cours passe en image dans l’image en quittant l’onglet', 'elle revient dans la page au retour sur l’onglet']) ignorer(n, env.muet);
  } else {
    w.activate(a.id);
    await until(() => vwc.executeJavaScript('!!document.pictureInPictureElement'), 'vidéo passée en image dans l’image');
    check('la vidéo en cours passe en image dans l’image en quittant l’onglet', w.mediaId === vid.id);
    w.activate(vid.id);
    await until(async () => !(await vwc.executeJavaScript('!!document.pictureInPictureElement')), 'retour de la vidéo dans la page');
    check('elle revient dans la page au retour sur l’onglet', w.mediaId === null);
  }
  w.close(vid.id);
  w.activate(a.id);

  // Réglages
  const sw2 = openSettings();
  await until(async () => (await sw2.webContents.executeJavaScript('document.querySelectorAll("#profiles .profile").length')) === w.data.profiles.length, 'réglages affichés');
  check('les réglages listent les profils', await sw2.webContents.executeJavaScript('document.getElementById("lang").value') === 'fr');
  if (shots) fs.writeFileSync(path.join(shots, 'reglages.png'), (await sw2.webContents.capturePage()).toPNG());
  sw2.close();

  // Notes
  w.run('newNote');
  const noteTab = w.activeId;
  const nwc = win.live.get(noteTab).wc;
  await until(() => store.state.notes.length === 1 && nwc.executeJavaScript('document.querySelectorAll("#items .note").length === 1'), 'note créée');
  await nwc.executeJavaScript(`(() => { const e = document.getElementById('editor'); e.textContent = 'Idées pour Orbe'; e.dispatchEvent(new InputEvent('input')); })()`);
  await until(() => store.state.notes[0].text.startsWith('Idées pour Orbe'), 'note enregistrée');
  check('⌃⇧N crée une note, enregistrée au fil de la frappe', tabs()[noteTab].internal === true);
  w.close(noteTab);
  w.activate(a.id);

  // Page d'accueil
  const wel = w.openInternal('welcome.html');
  await until(() => win.live.get(wel.id).wc.executeJavaScript('document.querySelector("h1").textContent === "Bienvenue dans Orbe" && document.querySelectorAll("[data-cmd]").length >= 3'), 'page d’accueil');
  check('la page d’accueil s’affiche', tabs()[wel.id].internal === true);
  if (shots) fs.writeFileSync(path.join(shots, 'accueil.png'), (await win.live.get(wel.id).wc.capturePage()).toPNG());
  w.close(wel.id);
  w.activate(a.id);

  // Bibliothèque (page interne)
  w.run('history');
  const libId = w.activeId;
  await until(async () => (await win.live.get(libId).wc.executeJavaScript('document.querySelectorAll("#list .line").length')) > 0, 'historique affiché');
  check('⌘Y affiche l’historique', tabs()[libId].url.endsWith('library.html#history'));
  await shot('bibliotheque');
  w.close(libId);

  // Page d'erreur
  const bad = w.newTab('http://127.0.0.1:1/');
  await until(() => win.live.get(bad.id).wc.getURL().includes('error.html'), 'page d’erreur');
  check('page d’erreur en cas d’échec, adresse conservée', tabs()[bad.id].url === 'http://127.0.0.1:1/');
  w.close(bad.id);

  // Robustesse (défauts trouvés en relecture)
  const pop = w.newTab(base + '/b');
  await until(() => titleOf(pop.id) === 'Page B', 'onglet à fermer');
  await win.live.get(pop.id).wc.executeJavaScript('window.close(); 1', true).catch(() => {});
  win.live.get(pop.id) && win.live.get(pop.id).wc.close();
  await until(() => !tabs()[pop.id] && !win.live.has(pop.id), 'onglet retiré');
  check('une page qui se ferme elle-même ne laisse pas d’onglet fantôme', w.activeId !== pop.id && !w.space.today.includes(pop.id));

  const sv1 = w.newTab(base + '/a');
  const sv2 = w.newTab(base + '/b');
  await until(() => titleOf(sv2.id) === 'Page B', 'onglets pour la vue scindée');
  w.splitWith(sv1.id, sv2.id);
  const w2 = new OrbeWindow();
  w2.close(sv2.id);
  let layoutError = null;
  try { w.layout(); } catch (err) { layoutError = err; }
  check('fermer depuis une autre fenêtre un onglet en vue scindée ne casse rien', !layoutError && !w.splits.length && w.visibleIds().every((id) => tabs()[id]));
  w2.activate(sv1.id);
  await sleep(60);
  check('un onglet n’est actif que dans une seule fenêtre', w2.activeId === sv1.id && w.activeId !== sv1.id && win.live.get(sv1.id).owner === w2);
  w2.win.close();
  await sleep(150);
  check('la fenêtre restante continue de mémoriser son état', w.persistent === true);
  w.close(sv1.id);

  const trap = w.newTab(base + '/a');
  await until(() => titleOf(trap.id) === 'Page A', 'page de test');
  await win.live.get(trap.id).wc.executeJavaScript('location.href = "orbe://app/library.html"; 1', true).catch(() => {});
  await sleep(500);
  check('une page web ne peut pas se rendre sur une page interne', tabs()[trap.id].url === base + '/a' && !tabs()[trap.id].internal && win.live.get(trap.id).wc.getURL() === base + '/a');
  const before2 = Object.keys(tabs()).length;
  w.handle('dropUrl', 'file:///etc/hosts');
  w.handle('dropUrl', 'orbe://app/shell.html');
  w.handle('open', 'file:///etc/hosts');
  check('les adresses file: et orbe: venant d’une page sont refusées', Object.keys(tabs()).length === before2);
  w.close(trap.id);

  const retry = w.newTab('http://127.0.0.1:1/x');
  await until(() => win.live.get(retry.id).wc.getURL().includes('error.html'), 'page d’erreur');
  let reloaded = '';
  win.live.get(retry.id).wc.once('did-start-navigation', (e, u) => { reloaded = u; });
  w.run('reload');
  await until(() => reloaded, 'nouvelle tentative');
  check('⌘R sur la page d’erreur retente l’adresse d’origine', reloaded === 'http://127.0.0.1:1/x');
  w.close(retry.id);
  w.activate(a.id);

  // Bloqueur de publicités (« orbe.localhost » joue le rôle du domaine publicitaire)
  const adblock = require('../src/main/adblock');
  adblock.setDomains(['orbe.localhost']);
  server.hits.pixel = 0;
  const pub = w.newTab(base + '/pub');
  await until(() => titleOf(pub.id) === 'Page avec pub' && !win.live.get(pub.id).loading, 'page avec publicité');
  await sleep(300);
  const pubWc = win.live.get(pub.id).wc;
  check('le bloqueur annule la requête tierce listée, pas celle du site', server.hits.pixel === 1 && adblock.stats().blockedByTab.get(pubWc.id) === 1, JSON.stringify([server.hits.pixel, adblock.stats().blockedByTab.get(pubWc.id)]));
  await until(() => ui('document.getElementById("shield-n").textContent === "1"'), 'compteur du bouclier');
  server.hits.pixel = 0;
  w.toggleSiteBlocking();
  await until(() => server.hits.pixel === 2, 'exception pour le site');
  check('une exception par site laisse tout passer', adblock.isSiteAllowed(base) && store.state.settings.adblockAllow.length === 1);
  w.toggleSiteBlocking();
  await sleep(200);
  w.close(pub.id);
  w.activate(a.id);

  // Boosts : CSS par site et Zap
  const boostsMod = require('../src/main/boosts');
  const bt = w.newTab(base + '/a');
  await until(() => titleOf(bt.id) === 'Page A' && !win.live.get(bt.id).loading, 'page pour le Boost');
  const bwc = win.live.get(bt.id).wc;
  boostsMod.set(boostsMod.hostOf(base), { css: 'h1 { color: rgb(1, 2, 3) !important; }', zaps: ['p'] });
  await boostsMod.apply(bwc);
  check('Boost : le CSS du site et le Zap s’appliquent', await bwc.executeJavaScript('getComputedStyle(document.querySelector("h1")).color + "|" + getComputedStyle(document.querySelector("p")).display') === 'rgb(1, 2, 3)|none');
  bwc.reload();
  await until(async () => (await bwc.executeJavaScript('document.readyState === "complete" && getComputedStyle(document.querySelector("h1")).color').catch(() => '')) === 'rgb(1, 2, 3)', 'Boost réappliqué au rechargement');
  check('Boost : réappliqué à chaque chargement', true);
  boostsMod.set(boostsMod.hostOf(base), { css: '', zaps: [] });
  await boostsMod.apply(bwc);
  check('Boost : retiré quand il est vidé', await bwc.executeJavaScript('getComputedStyle(document.querySelector("p")).display') !== 'none' && !store.state.boosts[boostsMod.hostOf(base)], JSON.stringify([await bwc.executeJavaScript('getComputedStyle(document.querySelector("p")).display'), store.state.boosts]));
  w.close(bt.id);
  w.activate(a.id);

  // Navigation privée
  const inc = new OrbeWindow({ incognito: true });
  const it = inc.newTab(base + '/b');
  await until(() => inc.data.tabs[it.id].title === 'Page B', 'page en navigation privée');
  check('navigation privée : données séparées', inc.data !== store.state && !store.state.tabs[it.id] && inc.session !== w.session);
  const visitsBefore = store.state.history[base + '/b'].visits;
  check('navigation privée : pas d’historique', store.state.history[base + '/b'].visits === visitsBefore);
  inc.win.close();

  // Fenêtre fermée avant que sa barre latérale ait fini de se charger : la fin du
  // chargement arrive sur une fenêtre détruite. Y toucher levait une exception que
  // rien ne rattrapait — Electron ouvrait alors une boîte d'erreur native, qui fige
  // tout le processus : c'était le blocage des essais après « pas d'historique ».
  {
    const guard = require('../src/main/test-guard');
    const errors = guard.state.errors.length;
    const quick = new OrbeWindow({ incognito: true });
    const quickUi = quick.ui.webContents;
    const late = quickUi.listeners('did-finish-load'); // ce qui attend la fin du chargement
    quick.win.close();
    await until(() => quick.win.isDestroyed(), 'fenêtre refermée');
    let thrown = null;
    for (const fn of late) { try { fn.call(quickUi); } catch (err) { thrown = err; } }
    await sleep(300);
    check('fenêtre fermée avant la fin du chargement de sa barre : plus rien n’y touche', late.length > 0 && !thrown && guard.state.errors.length === errors, thrown ? thrown.message : `${late.length} écouteur(s), ${guard.state.errors.length - errors} exception(s)`);
    check('aucune exception non rattrapée dans le processus principal jusqu’ici', guard.state.errors.length === 0, guard.state.errors.map((e) => String(e).split('\n').slice(0, 3).join(' | ')).join(' ; '));
  }

  // Petite fenêtre
  const lw = new little.LittleWindow(base + '/a');
  await until(() => lw.title === 'Page A', 'petite fenêtre chargée');
  check('⌥⌘N ouvre une petite fenêtre', !!lw.view);
  if (shots && platform.isWin) { await sleep(400); await require('./capture').shoot(lw.win, shots, 'win-petite-fenetre', platform.tint('', require('electron').nativeTheme.shouldUseDarkColors)); }
  const count = w.space.today.length;
  lw.openInOrbe();
  await until(() => w.space.today.length === count + 1, 'ouverture dans Orbe');
  check('« Ouvrir dans Orbe » crée un onglet', tabs()[w.activeId].url === base + '/a');

  // Mise en veille des onglets
  store.state.settings.maxLiveTabs = 2;
  OrbeWindow.trimLive();
  check('mise en veille au-delà de la limite', win.live.size <= 2 && win.live.has(w.activeId));
  store.state.settings.maxLiveTabs = 14;

  // Thème clair (le menu Présentation → Apparence applique le thème)
  commands.setSetting('appearance', 'light');
  check('le thème clair s’applique', require('electron').nativeTheme.themeSource === 'light');
  await until(() => ui('matchMedia("(prefers-color-scheme: light)").matches'), 'interface en clair');
  await shot('clair');
  commands.setSetting('appearance', 'auto');

  // Barre latérale : sélection multiple, annulation (tests/barre.js)
  await require('./barre')({ ...ctx, check });

  // Barre latérale et menus : menus contextuels, dossiers, Espaces, barre de menus (tests/laterale.js)
  await require('./laterale')({ ...ctx, check });

  // Finitions : icônes, dossier et Espace archivés à la suppression, fenêtre vierge, menus (tests/finitions.js)
  await require('./finitions')({ ...ctx, check });

  // Finitions, deuxième série : « Premiers pas », Échap en plein écran, quatre côtés, onglet hors de la fenêtre (tests/finitions2.js)
  await require('./finitions2')({ ...ctx, check });

  // Panneau de création d'un Espace (tests/creation-espace.js)
  await require('./creation-espace')({ ...ctx, check });

  // Tableaux (tests/easels.js)
  await require('./easels')({ ...ctx, check });

  // Mots de passe (tests/passwords.js)
  await require('./passwords')({ ...ctx, check });

  // Navigation de tous les jours : autorisations, partage d'écran, certificats,
  // authentification, « quitter la page ? », fenêtres surgissantes… (tests/essentiels.js)
  await require('./essentiels')({ ...ctx, check });

  // Vue scindée, petite fenêtre, aperçu, Boosts, menus de page (tests/fenetres.js)
  await require('./fenetres')({ ...ctx, check });

  // Réglages à volets, raccourcis modifiables, import de signets (tests/reglages.js)
  await require('./reglages')({ ...ctx, check });

  // Import direct des signets des navigateurs installés, sur de faux profils (tests/import-navigateurs.js)
  await require('./import-navigateurs')({ ...ctx, check });

  // Historique, mots de passe et cookies d'Arc, sur de fausses bases (tests/import-arc-donnees.js)
  await require('./import-arc-donnees')({ ...ctx, check });

  // Accueil du premier lancement, étape par étape (tests/accueil.js)
  await require('./accueil')({ ...ctx, check });

  // Mises à jour : GitHub remplacé par un serveur local (tests/mises-a-jour.js)
  await require('./mises-a-jour')({ ...ctx, check });

  // Vitesse et mémoire : vues d'appoint, veille, recherche… (tests/performances.js)
  await require('./performances')({ ...ctx, check, modalAtStart });

  // Barre de commande : actions, portées, suppression d'une suggestion… (tests/commande.js)
  // (Après les mesures : cet essai charge une extension, dont le script de complément reste en place.)
  await require('./commande')({ ...ctx, check });

  // Bibliothèque : archive, téléchargements, Espaces, Boosts ; notes (tests/bibliotheque.js)
  await require('./bibliotheque')({ ...ctx, check });

  // Médias : lecteurs miniatures de la barre latérale (tests/medias.js)
  await require('./medias')({ ...ctx, check });

  // Petite fenêtre, image dans l'image par site, capture… (tests/details.js)
  await require('./details')({ ...ctx, check });

  // Sensations : fichiers récents au survol de la Bibliothèque… (tests/sensations.js)
  await require('./sensations')({ ...ctx, check });

  // Derniers points : onglet réveillé puis arrêté, raccourcis dans la barre de commande, nouvel Espace au bout de la rangée… (tests/derniers.js)
  await require('./derniers')({ ...ctx, check });

  // Correctifs de la revue de sécurité : quarantaine, sauvegardes, aiguillage, Boosts, adresses étroites.
  await require('./securite')({ ...ctx, check });

  // Persistance
  await shot('final');
  w.remember();
  store.flush();
  const saved = JSON.parse(fs.readFileSync(store.file, 'utf8'));
  const histFile = path.join(path.dirname(store.file), 'history.json');
  const onDisk = fs.existsSync(histFile) ? Object.keys(JSON.parse(fs.readFileSync(histFile, 'utf8'))) : null;
  const inMemory = Object.keys(store.state.history);
  check('historique enregistré dans son propre fichier, hors de l’état', !!onDisk && onDisk.length === inMemory.length && !('history' in JSON.parse(fs.readFileSync(store.file, 'utf8'))),
    JSON.stringify({ fichier: onDisk ? onDisk.length : 'absent', memoire: inMemory.length, seulementEnMemoire: onDisk ? inMemory.filter((k) => !onDisk.includes(k)).slice(0, 5) : [], seulementSurDisque: onDisk ? onDisk.filter((k) => !inMemory.includes(k)).slice(0, 5) : [], dansEtat: 'history' in JSON.parse(fs.readFileSync(store.file, 'utf8')) }));
  // Ancien format (historique dans orbe.json) : repris tel quel au chargement.
  const { Store: StoreClass } = { Store: store.constructor };
  const old = new StoreClass();
  const oldDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'orbe-ancien-'));
  fs.writeFileSync(path.join(oldDir, 'orbe.json'), JSON.stringify({ history: { 'https://exemple.org/': { url: 'https://exemple.org/', visits: 3, last: 1 } } }));
  old.load(oldDir);
  old.flush();
  check('ancien fichier : l’historique est déplacé sans perte', old.state.history['https://exemple.org/'].visits === 3 && JSON.parse(fs.readFileSync(path.join(oldDir, 'history.json'), 'utf8'))['https://exemple.org/'].visits === 3 && !('history' in JSON.parse(fs.readFileSync(path.join(oldDir, 'orbe.json'), 'utf8'))));
  check('état enregistré sur disque', saved.spaces.length === 2 && Object.keys(saved.tabs).length === Object.keys(tabs()).length && saved.window.spaceId === w.spaceId);

  server.close();
  console.log(`\n${results.length - failed}/${results.length} vérifications réussies${ignores.length ? `, ${ignores.length} ignorée(s)` : ''}\n`);
  if (ignores.length) console.log('Ignorées :\n' + ignores.map((x) => `  – ${x.nom} (${x.raison})`).join('\n') + '\n');
  if (failed) throw new Error(`${failed} vérification(s) en échec`);
};
