// Navigation de tous les jours : autorisations (caméra, micro), partage d'écran,
// certificats, authentification HTTP, « quitter la page ? », fenêtres
// surgissantes, téléchargements, pages plantées, appareils, liens externes.
// Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/essentiels.js node scripts/dev.js --selftest
// Serveurs locaux HTTP et HTTPS (certificat auto-signé fabriqué par
// tests/certificat.js, sans dépendance). Aucune boîte de dialogue du système,
// aucune vraie caméra, aucune capture de l'écran de la machine : les réponses
// sont pilotées, et Chromium tourne avec des appareils factices.
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');
const { selfSigned } = require('./certificat');

const outils = require('./outils');

const { sleep } = outils;
const until = (fn, label, timeout = 12000) => outils.until(fn, label, timeout);

const PDF = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const BIG = Buffer.alloc(320 * 1024);
for (let i = 0; i < BIG.length; i++) BIG[i] = (i * 31 + (i >> 8)) & 255;
const MODIFIED = 'Wed, 01 Jan 2025 00:00:00 GMT';

function handler(state) {
  const page = (title, body) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px sans-serif;margin:0;padding:120px 40px">${body}</body>`;
  return (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    state.seen.push({ path: p, host: req.headers.host, auth: req.headers.authorization || '', range: req.headers.range || '' });
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    if (p === '/auth' || p === '/auth.png') {
      const ok = req.headers.authorization === 'Basic ' + Buffer.from('alice:secret').toString('base64');
      if (!ok) { res.statusCode = 401; res.setHeader('www-authenticate', 'Basic realm="Zone <b>reservee</b>"'); return res.end(page('Refusé', 'accès refusé')); }
      return res.end(page('Entré', 'bienvenue'));
    }
    if (p === '/embarque') return res.end(page('Embarque', `<img src="http://localhost:${state.port}/auth.png" width="10" height="10">`));
    if (p === '/sale') return res.end(page('Brouillon', '<textarea id="t"></textarea><script>window.addEventListener("beforeunload", (e) => { if (window.lent) { const t0 = Date.now(); while (Date.now() - t0 < window.lent); } if (window.sale) { e.preventDefault(); e.returnValue = "un texte que le navigateur ignore"; } });</script>'));
    if (p === '/lien') return res.end(page('Lien externe', '<a id="m" href="mailto:test@orbe.invalid?subject=x" style="position:fixed;left:0;top:0;width:200px;height:60px;background:#def">écrire</a>'));
    if (p === '/vue.pdf') { res.setHeader('content-type', 'application/pdf'); return res.end(PDF); }
    if (p === '/doc.pdf') { res.setHeader('content-type', 'application/pdf'); res.setHeader('content-disposition', 'attachment; filename="document.pdf"'); return res.end(PDF); }
    if (p === '/installe.dmg') { res.setHeader('content-type', 'application/octet-stream'); res.setHeader('content-disposition', 'attachment; filename="Installe.dmg"'); return res.end('faux disque'); }
    // Piège : annoncé comme PDF, enregistré sous un nom de page web.
    if (p === '/piege') { res.setHeader('content-type', 'application/pdf'); res.setHeader('content-disposition', 'attachment; filename="facture.html"'); return res.end('<script>document.title = "piège"</script>'); }
    // Piège : extension .pdf, contenu qui n'en est pas un.
    if (p === '/faux.pdf') { res.setHeader('content-type', 'application/pdf'); res.setHeader('content-disposition', 'attachment; filename="faux.pdf"'); return res.end('<html>pas un PDF</html>'); }
    if (p === '/lent') return setTimeout(() => res.end(page('Page lente', 'enfin')), 900);
    // Cadres : `?autre` intègre l'autre site (localhost), sinon le même.
    if (p === '/hote') return res.end(page('Hôte', `<iframe id="f" allow="camera; microphone; display-capture" src="${url.searchParams.has('autre') ? 'http://localhost:' + state.port : ''}/${url.searchParams.get('vers') || 'cadre'}" width="300" height="100"></iframe>`));
    if (p === '/cadre') return res.end(page('Cadre', 'cadre'));
    if (p === '/note.txt') { res.setHeader('content-disposition', 'attachment; filename="note.txt"'); return res.end('bonjour'); }
    if (p === '/gros.bin') {
      const range = /bytes=(\d+)-/.exec(req.headers.range || '');
      const start = range ? Number(range[1]) : 0;
      res.statusCode = range ? 206 : 200;
      res.setHeader('content-type', 'application/octet-stream');
      res.setHeader('content-disposition', 'attachment; filename="gros.bin"');
      res.setHeader('accept-ranges', 'bytes');
      res.setHeader('etag', '"orbe-gros-1"');
      res.setHeader('last-modified', MODIFIED);
      res.setHeader('content-length', String(BIG.length - start));
      if (range) res.setHeader('content-range', `bytes ${start}-${BIG.length - 1}/${BIG.length}`);
      let at = start;
      // « coupe » : la connexion tombe à chaque essai, après quelques dizaines de
      // kilo-octets (Chromium réessaie de lui-même plusieurs fois avant de renoncer).
      const cut = state.mode === 'coupe';
      const step = state.mode === 'vite' ? BIG.length : 8 * 1024;
      const stop = start + 40 * 1024;
      const timer = setInterval(() => {
        if (res.destroyed) return clearInterval(timer);
        if (cut && at >= stop) { clearInterval(timer); return res.destroy(); }
        res.write(BIG.subarray(at, Math.min(BIG.length, at + step)));
        at += step;
        if (at >= BIG.length) { clearInterval(timer); res.end(); }
      }, 50);
      res.on('close', () => clearInterval(timer));
      return undefined;
    }
    return res.end(page('Page ' + p, `<h1>${p}</h1>`));
  };
}

module.exports = async function essentielsTests(ctx) {
  const { first: w, OrbeWindow, store, win, essentials } = ctx;
  const standalone = !ctx.check;
  let failed = 0;
  let total = 0;
  const check = ctx.check || ((name, ok, detail = '') => {
    total += 1;
    if (!ok) failed += 1;
    console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))}`);
  });
  if (standalone) console.log('\nOrbe — navigation de tous les jours\n');
  const { sheets, permissions, displayMedia, capture, certs, auth, unload, popups, downloads } = essentials;
  const t = (k, v) => store.t(k, null, v);
  const ui = (js) => w.ui.webContents.executeJavaScript(js);

  const state = { seen: [], mode: 'lent', port: 0 };
  const server = http.createServer(handler(state));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  state.port = server.address().port;
  const A = `http://127.0.0.1:${state.port}`;
  const B = `http://localhost:${state.port}`;
  const pem = selfSigned();
  const tls = https.createServer({ key: pem.key, cert: pem.cert }, handler(state));
  await new Promise((r) => tls.listen(0, '127.0.0.1', r));
  const S = `https://127.0.0.1:${tls.address().port}`;

  // Réponses pilotées : aucune boîte de dialogue du système pendant les tests.
  const saved = {
    ask: unload.env.ask, confirm: permissions.env.confirm, openExternal: permissions.env.openExternal, osStatus: permissions.os.status, osAsk: permissions.os.ask,
    sources: displayMedia.env.sources, hsts: certs.internals.probes.hsts, dl: { ...downloads.env }, settings: { ...store.state.settings },
  };
  const opened = [];
  const launched = [];
  permissions.env.openExternal = (url) => { launched.push(url); };
  const asks = [];
  let leave = false;
  let onAsk = null; // appelé pendant que la question est « à l'écran »
  unload.env.ask = (parent, opts) => { asks.push(opts); if (onAsk) onAsk(); return leave ? 0 : 1; };

  const rtOf = (id) => win.live.get(id);
  const open = async (url, title, owner = w) => {
    const tab = owner.newTab(url);
    opened.push([owner, tab.id]);
    if (title) await until(() => owner.data.tabs[tab.id] && owner.data.tabs[tab.id].title === title, 'page « ' + title + ' »');
    return { tab, id: tab.id, get rt() { return rtOf(tab.id); }, wc: rtOf(tab.id).wc };
  };
  const js = (wc, code, gesture = false) => wc.executeJavaScript(code, gesture);
  // Entrée de l'utilisateur dans la page. Orbe la voit par `before-mouse-event`
  // (c'est ce qu'il compte comme un geste). La page, elle, ne reçoit rien quand
  // elle est masquée (écran en veille, fenêtre recouverte, machine d'intégration :
  // Chromium écarte alors les entrées) ; son activation est donc donnée par
  // Electron (`executeJavaScript` avec geste), ce qui vaut quel que soit l'affichage.
  const click = async (wc) => {
    const rt = [...win.live.values()].find((r) => r.wc === wc);
    await until(() => js(wc, 'document.readyState === "complete"'), 'page entièrement chargée');
    rt.gesture = 0;
    for (const type of ['mouseDown', 'mouseUp']) wc.sendInputEvent({ type, x: 230, y: 90, button: 'left', clickCount: 1 });
    await until(() => rt.gesture > 0, 'entrée reçue par Orbe');
    await js(wc, '1', true);
  };
  // Clic sur un lien de la page (déclenché dans la page, avec geste, pour la même raison).
  const clickLink = async (wc, id) => {
    await click(wc);
    await js(wc, `document.getElementById(${JSON.stringify(id)}).click(); 1`, true);
  };
  const sheetOf = (wc, kind, timeout) => until(() => { const s = sheets.top(wc); return s && s.kind === kind ? s : null; }, 'feuille « ' + kind + ' »', timeout);
  const noSheet = async (wc, ms = 500) => { await sleep(ms); return !sheets.top(wc); };
  // Contenu réellement affiché par une feuille, et clic dans la feuille.
  const inSheet = async (sheet, code) => {
    const vwc = sheet.view.webContents;
    await until(() => vwc.executeJavaScript('!document.getElementById("card").hidden'), 'feuille affichée');
    // Borné : si la feuille se ferme pendant l'appel, sa réponse n'arrive jamais.
    return Promise.race([vwc.executeJavaScript(code), sleep(10000).then(() => { throw new Error('Délai dépassé : script dans la feuille'); })]);
  };
  // Clic sur un bouton qui referme la feuille : le clic part après le retour du
  // script (la vue est détruite par la réponse), puis on attend la fermeture.
  const press = async (sheet, id) => {
    await until(() => sheet.armedAt && Date.now() - sheet.armedAt > sheets.GUARD + 40, 'délai de garde écoulé');
    await inSheet(sheet, `shownAt = 0; setTimeout(() => document.getElementById(${JSON.stringify(id)}).click(), 0); 1`);
    await until(() => sheet.closed, 'feuille refermée par « ' + id + ' »');
  };
  const origin = (url) => new URL(url).origin;

  // ---------------------------------------------------------------- Autorisations
  const cam = await open(A + '/camera', 'Page /camera');
  check('une page web n’a aucun accès à l’interface d’Orbe', await js(cam.wc, 'typeof window.orbe') === 'undefined');
  let pending = js(cam.wc, 'navigator.mediaDevices.getUserMedia({ video: true }).then((s) => { window.flux = s; return "flux:" + s.getTracks().map((x) => x.kind).join(); }, (e) => "err:" + e.name)', true);
  let sheet = await sheetOf(cam.wc, 'perm');
  check('caméra : la question est une feuille d’Orbe posée sur l’onglet, qui ne nomme que la caméra',
    sheet.payload.lines.length === 1 && sheet.payload.lines[0] === t('perm.camera') && sheet.payload.site === A && sheet.parent === w, sheet.payload);
  const shown = await inSheet(sheet, '({ title: document.getElementById("title").textContent, lines: [...document.querySelectorAll("#body p")].map((p) => p.textContent), buttons: [...document.querySelectorAll("#buttons button")].map((b) => b.id) })');
  check('la feuille affiche le site, ce qui est demandé, et « Refuser » / « Autoriser »', shown.title.includes('127.0.0.1') && shown.lines[0] === t('perm.camera') && shown.buttons.join() === 'deny,allow', shown);
  // Vue de la feuille : au-dessus de la page, aux mêmes dimensions.
  const same = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  check('la feuille couvre exactement la page de son onglet', same(sheet.view.getBounds(), cam.rt.view.getBounds()) && w.win.contentView.children.indexOf(sheet.view) > w.win.contentView.children.indexOf(cam.rt.view));
  check('une page ne peut pas répondre à la place de la feuille', await sheets.action('sheet:answer', 'allow', cam.wc) === undefined && !sheet.closed);
  await inSheet(sheet, 'shownAt = Date.now(); document.getElementById("allow").click(); 1');
  await sleep(250);
  check('un clic tombé à l’instant où la feuille apparaît est ignoré', !sheet.closed);
  await press(sheet, 'allow');
  check('caméra autorisée : la page reçoit son flux (appareil factice)', await pending === 'flux:video');
  check('la réponse est retenue pour la caméra seule, par origine', store.state.permissions[A] && store.state.permissions[A].camera === true && !('microphone' in store.state.permissions[A]) && !('media' in store.state.permissions[A]), store.state.permissions[A]);
  check('témoin : la page utilise la caméra', capture.of(cam.wc).join() === 'camera');
  await until(() => ui('S.nav.capture && S.nav.capture.join() === "camera" && !document.getElementById("capture-note").hidden && !!document.querySelector("#today .row.capturing")'), 'témoin dans la barre latérale');
  check('le témoin apparaît dans la pastille d’adresse et sur la ligne de l’onglet', true);
  check('un onglet qui capte n’est pas mis en veille', win.hooks.busy(cam.rt) === true);

  pending = js(cam.wc, 'navigator.mediaDevices.getUserMedia({ video: true }).then((s) => "flux", (e) => "err:" + e.name)', true);
  check('deuxième demande : plus de question', await pending === 'flux' && !sheets.top(cam.wc));

  pending = js(cam.wc, 'navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => "flux", (e) => "err:" + e.name)', true);
  sheet = await sheetOf(cam.wc, 'perm');
  check('micro : question distincte de celle de la caméra', sheet.payload.lines.join() === t('perm.microphone'));
  await press(sheet, 'deny');
  check('micro refusé : la page reçoit une erreur, le refus est retenu', await pending === 'err:NotAllowedError' && store.state.permissions[A].microphone === false);
  pending = js(cam.wc, 'navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => "flux", (e) => "err:" + e.name)', true);
  check('micro refusé : plus de question ensuite', await pending === 'err:NotAllowedError' && !sheets.top(cam.wc));

  // Accord du système (macOS, Windows) : en plus de celui du site.
  const asked = [];
  permissions.os.status = (kind) => (kind === 'camera' ? 'denied' : 'granted');
  pending = js(cam.wc, 'navigator.mediaDevices.getUserMedia({ video: true }).then((s) => "flux", (e) => "err:" + e.name)', true);
  sheet = await sheetOf(cam.wc, 'os');
  check('site autorisé mais système qui refuse : la page n’a rien, et Orbe dit que c’est le système qui bloque la caméra',
    await pending === 'err:NotAllowedError' && sheet.payload.title.includes(t('os.name.camera')) && sheet.payload.settings === true && store.state.permissions[A].camera === true, sheet.payload);
  sheet.close('ok');
  permissions.os.status = (kind) => (asked.includes(kind) ? 'granted' : 'not-determined');
  permissions.os.ask = async (kind) => { asked.push(kind); return true; };
  pending = js(cam.wc, 'navigator.mediaDevices.getUserMedia({ video: true }).then((s) => "flux", (e) => "err:" + e.name)', true);
  check('accord du système pas encore donné : Orbe le demande (askForMediaAccess), pour la caméra seulement', await pending === 'flux' && asked.join() === 'camera', asked);
  permissions.os.status = saved.osStatus;
  permissions.os.ask = saved.osAsk;

  // Vue des autorisations du site (menu du bouclier, cadenas).
  essentials.siteInfo(w);
  sheet = await sheetOf(cam.wc, 'site');
  const listed = await inSheet(sheet, '[...document.querySelectorAll("#perms .item")].map((r) => r.dataset.key + ":" + r.querySelector(".state").className)');
  check('informations du site : autorisations accordées et refusées, une par ligne', listed.join() === 'camera:state yes,microphone:state no', listed);
  check('le menu du site y mène', win.hooks.siteMenu(w)[0].label === t('site.info') && win.hooks.siteMenu(w)[0].enabled === true);
  await inSheet(sheet, 'document.querySelector("#perms .item[data-key=microphone] [data-do=reset]").click(); 1');
  await until(() => !('microphone' in (store.state.permissions[A] || {})), 'micro réinitialisé');
  await until(() => inSheet(sheet, 'document.querySelectorAll("#perms .item").length === 1'), 'liste mise à jour');
  check('« Réinitialiser » oublie une autorisation, sans toucher aux autres', store.state.permissions[A].camera === true);
  await press(sheet, 'close');
  await until(() => !sheets.top(cam.wc), 'feuille fermée');

  // ---------------------------------------------------------------- Centre de contrôle du site (bouclier)
  {
    const prefs = require('../src/main/prefs');
    const adblock = require('../src/main/adblock');
    const hostA = A.replace('http://', '');
    const ctl = await open(A + '/controle', 'Page /controle');
    const ses = ctl.wc.session;
    const act = (sh, name, arg) => sheets.action('sheet:act', { name, arg }, sh.view.webContents);
    const armed = (sh) => until(() => sh.armedAt && Date.now() - sh.armedAt > sheets.GUARD + 40, 'délai de garde écoulé');
    const cookiesOf = async (o) => (await ses.cookies.get({ url: o })).map((c) => c.name).join();
    await js(ctl.wc, 'document.cookie = "essai=1; path=/"; 1');
    const popups = [];
    const evil = '<img src=x onerror="window.pirate=1"> Extension';
    const deps = { extActions: () => [{ id: 'ext-a', title: evil, badgeText: '3', enabled: true }, { id: 'ext-b', title: 'Coupée', enabled: false }], openExtPopup: (ow, id) => popups.push(id) };
    check('le bouclier ouvre le centre de contrôle : une feuille d’Orbe sur l’onglet, pas un menu', win.hooks.action(w, 'siteControl') === true && sheets.top(ctl.wc).kind === 'control');
    sheets.top(ctl.wc).close(null);
    let panel = essentials.siteControl(w, deps);
    await until(() => panel.payload.cookies === 1, 'cookies comptés');
    check('centre de contrôle : site, bloqueur, autorisations, cookies, Boost, mode développeur et extensions viennent du processus principal',
      panel.payload.site === permissions.siteName(A) && panel.payload.perms.map((x) => x.key + ':' + x.value).join() === 'camera:true' && panel.payload.adblock.on === true && panel.payload.adblock.site === true
      && panel.payload.dev.on === false && panel.payload.dev.can === true && panel.payload.boost.has === false && panel.payload.extensions.length === 2 && panel.origin === A, panel.payload);
    const shown = await inSheet(panel, `(() => { const c = document.getElementById('card'); const r = c.getBoundingClientRect(); return {
      anchor: document.body.classList.contains('anchor') && r.top < 40 && r.left < 40, title: document.getElementById('title').textContent,
      perms: [...document.querySelectorAll('#perms .item')].map((x) => x.dataset.key).join(), cookies: document.getElementById('c-cookies').textContent,
      ext: document.querySelector('#c-exts .item .grow').textContent, imgs: c.querySelectorAll('img, script, iframe').length, pirate: typeof window.pirate,
      extOff: document.querySelectorAll('#c-exts .item button')[1].disabled, dev: document.getElementById('c-dev').checked, site: document.getElementById('c-shield-site').checked }; })()`);
    check('… affiché en bulle ancrée, tout en texte : un nom d’extension piégé reste du texte',
      shown.anchor && shown.title === permissions.siteName(A) && shown.perms === 'camera' && shown.cookies === t('ctl.cookieCount', { n: 1 }) && shown.ext === evil && shown.imgs === 0 && shown.pirate === 'undefined'
      && shown.extOff === true && shown.dev === false && shown.site === true, shown);
    // Garde : une action qui change quelque chose est refusée dans la demi-seconde qui suit l'apparition.
    panel.armedAt = Date.now();
    const early = await act(panel, 'dev');
    check('action tombée à l’instant où le panneau apparaît : ignorée', early === null && !prefs.devMode(A + '/controle') && !panel.closed);
    await armed(panel);
    // Une page web n'a aucun canal : un message qui ne vient pas de la vue du panneau n'a pas d'effet.
    const fromPage = await sheets.action('sheet:act', { name: 'cookies' }, ctl.wc);
    check('une page ne peut pas actionner le panneau à la place de l’utilisateur', fromPage === undefined && (await cookiesOf(A)) === 'essai' && !panel.closed);
    let next = await act(panel, 'dev');
    const devOn = next && next.dev.on === true && store.state.settings.devSites.includes(hostA) && w.toolbarShown;
    next = await act(panel, 'dev');
    check('mode développeur : activé puis coupé depuis le panneau, qui réaffiche l’état rendu par le processus principal', devOn && next.dev.on === false && !store.state.settings.devSites.includes(hostA) && !w.toolbarShown);
    next = await act(panel, 'shieldAll');
    const offAll = store.state.settings.adblock === false && next.adblock.on === false;
    next = await act(panel, 'shieldAll');
    check('bloqueur : coupé puis rétabli partout', offAll && store.state.settings.adblock === true && next.adblock.on === true);
    next = await act(panel, 'reset', 'camera');
    check('autorisation réinitialisée depuis le panneau', next.perms.length === 0 && !(store.state.permissions[A] && 'camera' in store.state.permissions[A]));
    permissions.set(ses, A, 'camera', true);
    await act(panel, 'ext', 'inconnue');
    const closedByExt = panel.closed;
    panel = essentials.siteControl(w, deps);
    await act(panel, 'ext', 'ext-b');
    panel = essentials.siteControl(w, deps);
    await act(panel, 'ext', 'ext-a');
    check('extensions : seule une extension de la liste, et active, s’ouvre ; le panneau se ferme', closedByExt && popups.join() === 'ext-a' && panel.closed);

    // L'onglet n'est plus l'onglet actif : rien n'est fait, le panneau se ferme.
    panel = essentials.siteControl(w, deps);
    await armed(panel);
    const other = await open(A + '/autre', 'Page /autre');
    const stale = await act(panel, 'cookies');
    check('action reçue alors que l’onglet du panneau n’est plus l’onglet actif : refusée, panneau fermé', stale === null && panel.closed && (await cookiesOf(A)) === 'essai');
    w.close(other.id, { silent: true, ask: false });
    w.activate(ctl.id);

    // Le site de l'onglet a changé depuis l'ouverture : l'action vaudrait pour un autre site. Refusée.
    panel = essentials.siteControl(w, deps);
    panel.untilNavigation = false; // comme si la fermeture à la navigation avait manqué
    await armed(panel);
    ctl.wc.loadURL(B + '/controle');
    await until(() => w.data.tabs[ctl.id].url.startsWith(B) && !ctl.wc.isLoading(), 'onglet passé sur un autre site');
    await js(ctl.wc, 'document.cookie = "autre=1; path=/"; 1');
    const crossed = await act(panel, 'cookies');
    check('action reçue après que l’onglet a changé de site : validée contre l’origine du moment, refusée — aucun cookie effacé, ni ici ni là',
      crossed === null && panel.closed && (await cookiesOf(A)) === 'essai' && (await cookiesOf(B)).includes('autre'));
    ctl.wc.loadURL(A + '/controle');
    await until(() => w.data.tabs[ctl.id].url === A + '/controle' && !ctl.wc.isLoading(), 'retour sur le site');

    // Navigation ordinaire : le panneau se ferme de lui-même.
    panel = essentials.siteControl(w, deps);
    await armed(panel);
    const cleared = act(panel, 'cookies');
    await until(() => panel.closed, 'panneau fermé par le rechargement');
    await cleared;
    await until(() => !ctl.wc.isLoading(), 'page rechargée');
    check('« Effacer » les cookies du site : effacés pour cette origine seulement, page rechargée, panneau fermé', (await cookiesOf(A)) === '' && panel.closed);
    panel = essentials.siteControl(w, deps);
    await armed(panel);
    act(panel, 'shield');
    await until(() => adblock.isSiteAllowed(A + '/controle') && panel.closed, 'bloqueur coupé pour le site');
    await until(() => !ctl.wc.isLoading(), 'page rechargée');
    panel = essentials.siteControl(w, deps);
    const siteOff = panel.payload.adblock.site === false;
    await armed(panel);
    act(panel, 'shield');
    await until(() => !adblock.isSiteAllowed(A + '/controle') && panel.closed, 'bloqueur rétabli pour le site');
    await until(() => !ctl.wc.isLoading(), 'page rechargée');
    check('« Bloquer sur ce site » : coupé puis rétabli, la page se recharge', siteOff);

    // Page interne, navigation privée.
    const inner = w.openInternal('shortcuts.html');
    check('page interne d’Orbe : pas de centre de contrôle (le bouclier garde son menu)', essentials.siteControl(w) === null && win.hooks.action(w, 'siteControl') === false);
    if (inner && inner.id) w.close(inner.id, { silent: true, ask: false });
    w.activate(ctl.id);

    // Autres autorisations demandées par une feuille : détection d'inactivité, stockage durable, cookies d'un cadre intégré.
    w.activate(ctl.id);
    await until(() => w.activeRt && w.activeRt.wc === ctl.wc && !ctl.wc.isLoading(), 'page du centre de contrôle');
    const entry = permissions.internals.memories.get(ses);
    let wait = js(ctl.wc, 'IdleDetector.requestPermission()', true);
    sheet = await sheetOf(ctl.wc, 'perm');
    const idleLine = sheet.payload.lines.join();
    await press(sheet, 'allow');
    check('détection d’inactivité : demandée par une feuille, accord retenu pour le site', idleLine === t('perm.idle-detection') && (await wait) === 'granted' && store.state.permissions[A]['idle-detection'] === true);
    wait = permissions.internals.request(entry, ctl.wc, 'persistent-storage', { requestingUrl: A + '/controle', isMainFrame: true });
    sheet = await sheetOf(ctl.wc, 'perm');
    const persistLine = sheet.payload.lines.join();
    await press(sheet, 'deny');
    check('stockage durable : demandé, refus retenu', persistLine === t('perm.persistent-storage') && (await wait) === false && store.state.permissions[A]['persistent-storage'] === false);
    await js(ctl.wc, `(() => { const f = document.createElement('iframe'); f.src = ${JSON.stringify(B + '/cadre')}; document.body.append(f); return new Promise((r) => { f.onload = () => r(1); }); })()`);
    wait = permissions.internals.request(entry, ctl.wc, 'storage-access', { requestingUrl: B + '/cadre', isMainFrame: false });
    sheet = await sheetOf(ctl.wc, 'perm');
    const embedNote = sheet.payload.note;
    await press(sheet, 'allow');
    check('cookies d’un cadre intégré (Storage Access) : la feuille nomme le site qui intègre, et l’accord ne vaut que pour ce couple de sites',
      (await wait) === true && embedNote === t('perm.embedded', { site: permissions.siteName(A) }) && store.state.permissions[B]['storage-access|' + A] === true
      && permissions.internals.check(entry, 'storage-access', B, { isMainFrame: false, embeddingOrigin: A }) === true
      && permissions.internals.check(entry, 'storage-access', B, { isMainFrame: false, embeddingOrigin: 'https://ailleurs.exemple' }) === false
      && permissions.internals.check(entry, 'storage-access', B, {}) === false);
    for (const k of ['idle-detection', 'persistent-storage']) permissions.reset(ses, A, k);
    permissions.reset(ses, B, '*');
    w.close(ctl.id, { silent: true, ask: false });
    w.activate(cam.id);
    await until(() => w.activeRt && w.activeRt.wc === cam.wc, 'retour sur la page');
  }

  // Délai de garde tenu par le processus principal : une feuille qui réapparaît
  // (celle du dessus vient de se fermer) ne se laisse pas valider dans l'instant.
  const under = sheets.open(cam.wc, 'perm', { site: 'essai', lines: ['essai'] }, { exclusive: false });
  const over = sheets.open(cam.wc, 'os', { title: 'essai', text: 'essai' });
  await until(() => over.armedAt > 0 && !under.armedAt, 'feuille du dessus affichée');
  over.close('ok');
  await until(() => under.armedAt > 0, 'feuille du dessous réaffichée');
  check('feuille qui réapparaît : « Autoriser » envoyé dans la demi-seconde est refusé par le processus principal', await sheets.action('sheet:answer', 'allow', under.view.webContents) === false && !under.closed);
  await sleep(sheets.GUARD + 60);
  check('passé le délai, la même réponse est acceptée ; un refus l’est toujours', await sheets.action('sheet:answer', 'allow', under.view.webContents) === true && under.closed && sheets.internals.engages('deny') === false && sheets.internals.engages({ open: true }) === true);
  const pile = [];
  for (let i = 0; i < sheets.MAX_STACK + 2; i++) pile.push(sheets.open(cam.wc, 'perm', { site: 'essai', lines: ['n° ' + i] }, { exclusive: false }));
  check('une page ne peut pas empiler les feuilles : ' + sheets.MAX_STACK + ' au plus par onglet', pile.filter(Boolean).length === sheets.MAX_STACK && pile.slice(sheets.MAX_STACK).every((x) => x === null));
  for (const x of pile.filter(Boolean)) x.close(null);
  check('la page qui demandait n’est plus là : la réponse est sans effet', permissions.internals.stillThere(cam.wc, A, true) === true && permissions.internals.stillThere(cam.wc, 'https://ailleurs.exemple', true) === false && permissions.internals.stillThere(cam.wc, 'https://ailleurs.exemple', false) === false);

  // Ancien format : « media » valait pour la caméra et le micro.
  store.state.permissions['https://ancien.exemple'] = { media: true };
  check('ancien réglage « media » : lu comme caméra et micro', permissions.get(cam.wc.session, 'https://ancien.exemple', 'camera') === true && permissions.get(cam.wc.session, 'https://ancien.exemple', 'microphone') === true
    && permissions.list(cam.wc.session, 'https://ancien.exemple').map((x) => x.key).join() === 'camera,microphone');
  permissions.reset(cam.wc.session, 'https://ancien.exemple', 'camera');
  check('ancien réglage : réinitialiser la caméra garde le micro', JSON.stringify(store.state.permissions['https://ancien.exemple']) === '{"microphone":true}', store.state.permissions['https://ancien.exemple']);
  delete store.state.permissions['https://ancien.exemple'];

  // Arrêt depuis le témoin : la page est rechargée, le témoin s'éteint.
  check('« Arrêter » recharge la page', capture.stop(cam.wc) === true);
  await until(() => !capture.of(cam.wc).length && !cam.wc.isLoading(), 'témoin éteint');
  await until(() => ui('!S.nav.capture.length && document.getElementById("capture-note").hidden'), 'témoin retiré de la barre');
  check('après l’arrêt, le témoin disparaît et le flux n’existe plus', await js(cam.wc, 'typeof window.flux') === 'undefined');

  // Une question disparaît avec la page qui l'a posée, sans rien retenir.
  js(cam.wc, 'Notification.requestPermission(); 1', true).catch(() => {});
  sheet = await sheetOf(cam.wc, 'perm');
  cam.wc.loadURL(A + '/autre');
  await until(() => sheet.closed, 'question fermée par la navigation');
  check('la page change : la question se ferme, rien n’est retenu', !('notifications' in store.state.permissions[A]));
  await until(() => w.data.tabs[cam.id].title === 'Page /autre', 'page suivante');
  // Navigation déjà en route quand la question arrive : son arrivée la ferme aussi.
  cam.wc.loadURL(A + '/lent').catch(() => {});
  await until(() => state.seen.some((x) => x.path === '/lent'), 'navigation en route');
  // (demande faite par la page encore affichée : son cadre, pas celui qui arrive)
  cam.wc.mainFrame.executeJavaScript('Notification.requestPermission(); 1', true).catch(() => {});
  sheet = await sheetOf(cam.wc, 'perm');
  const early = w.data.tabs[cam.id].title !== 'Page lente';
  await until(() => w.data.tabs[cam.id].title === 'Page lente', 'navigation aboutie');
  check('une navigation lancée avant la question aboutit : la question se ferme, rien n’est retenu', early && sheet.closed && !('notifications' in store.state.permissions[A]), { early, closed: sheet.closed, perms: store.state.permissions[A] });

  // Cadre d'un autre site : son autorisation ne vaut que dans le site qui l'intègre.
  const hostTab = await open(A + '/hote?autre', 'Hôte');
  const frameOf = (x) => until(() => { const f = x.wc.mainFrame.frames[0]; return f && /\/(cadre|auth)$/.test(f.url) ? f : null; }, 'cadre chargé');
  let frame = await frameOf(hostTab);
  pending = frame.executeJavaScript('navigator.mediaDevices.getUserMedia({ video: true }).then(() => "flux", (e) => "err:" + e.name)', true);
  sheet = await sheetOf(hostTab.wc, 'perm');
  check('caméra demandée par un cadre : la feuille nomme le cadre et le site qui l’intègre', sheet.payload.site === B && sheet.payload.note === t('perm.embedded', { site: A }), sheet.payload);
  await press(sheet, 'allow');
  const embedded = permissions.internals.memories.get(hostTab.wc.session);
  const can = (details) => permissions.internals.check(embedded, 'media', B, { mediaType: 'video', ...details });
  check('l’accord donné à un cadre ne vaut que pour ce couple (cadre, site qui l’intègre)',
    await pending === 'flux' && store.state.permissions[B]['camera|' + A] === true && !('camera' in store.state.permissions[B])
    && can({ isMainFrame: false, embeddingOrigin: A + '/' }) === true && can({ isMainFrame: false, embeddingOrigin: 'https://hostile.exemple/' }) === false && can({ isMainFrame: true }) === false, store.state.permissions[B]);
  check('informations du site : l’autorisation du cadre dit où elle vaut', permissions.list(hostTab.wc.session, B)[0].label.includes(t('perm.embeddedIn', { site: A })));

  // Chaque profil a ses propres réponses.
  const other = require('../src/main/sessions').profileSession('essai-autorisations');
  permissions.set(other, 'https://profil.exemple', 'popups', true);
  check('autorisations rangées par profil : celles d’un profil ne valent pas dans un autre',
    permissions.get(other, 'https://profil.exemple', 'popups') === true && permissions.get(cam.wc.session, 'https://profil.exemple', 'popups') === undefined && permissions.get(other, A, 'camera') === undefined
    && !store.state.permissions['https://profil.exemple'] && store.state.profilePermissions['essai-autorisations']['https://profil.exemple'].popups === true);
  permissions.forgetProfile('essai-autorisations');
  check('profil supprimé : ses autorisations aussi', permissions.get(other, 'https://profil.exemple', 'popups') === undefined && store.state.permissions[A].camera === true);

  // Navigation privée : les réponses restent en mémoire.
  const iw = new OrbeWindow({ incognito: true });
  const priv = await open(B + '/prive', 'Page /prive', iw);
  js(priv.wc, 'Notification.requestPermission(); 1', true).catch(() => {});
  sheet = await sheetOf(priv.wc, 'perm');
  sheet.close('allow');
  await until(() => permissions.get(priv.wc.session, B, 'notifications') === true, 'réponse retenue en mémoire');
  check('navigation privée : la réponse n’est pas écrite dans le profil', !('notifications' in (store.state.permissions[B] || {})));

  // ---------------------------------------------------------------- Partage d'écran
  const fake = { id: 'screen:9999:0', name: 'Écran <b>factice</b>', kind: 'screen', thumb: '', source: { id: 'screen:9999:0', name: 'Écran factice' } };
  displayMedia.env.sources = async () => [fake];
  const share = await open(A + '/partage', 'Page /partage');
  check('partage sans geste de l’utilisateur : refusé, sans sélecteur', (await js(share.wc, 'navigator.mediaDevices.getDisplayMedia({ video: true }).then(() => "flux", (e) => "err:" + e.name)')).startsWith('err:') && !sheets.top(share.wc));
  await click(share.wc);
  pending = js(share.wc, 'navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }).then((s) => { window.flux = s; return "flux:" + s.getVideoTracks().length; }, (e) => "err:" + e.name)', true);
  sheet = await sheetOf(share.wc, 'picker');
  await until(() => sheet.payload.sources.length === 2, 'écrans listés');
  check('sélecteur : « Cet onglet », puis les écrans et fenêtres (relevés par le processus principal)', sheet.payload.sources.map((s) => s.kind).join() === 'tab,screen' && sheet.payload.audioRequested === true && !('source' in sheet.payload.sources[1]), sheet.payload.sources.map((s) => s.kind));
  const tiles = await until(async () => { const v = await inSheet(sheet, '[...document.querySelectorAll(".src")].map((b) => b.dataset.kind + ":" + b.querySelector(".name").textContent + ":" + b.querySelectorAll("b").length)'); return v.length === 2 && v; }, 'vignettes');
  check('sélecteur : les noms venus du système sont affichés comme du texte', tiles[0].startsWith('tab:' + t('share.thisTab')) && tiles[1] === 'screen:Écran <b>factice</b>:0', tiles);
  check('rien n’est partagé avant le choix', await inSheet(sheet, 'document.getElementById("share").disabled') === true && await js(share.wc, 'typeof window.flux') === 'undefined' && !capture.of(share.wc).length);
  // Les captures d'Orbe lui-même (vignettes) comptent dans isBeingCaptured() ; écran
  // en veille, elles n'aboutissent jamais et la fin du partage n'est pas observable.
  const noisy = share.wc.isBeingCaptured();
  await inSheet(sheet, 'document.querySelector(".src[data-kind=tab]").click(); 1');
  check('« Partager aussi le son » proposé pour l’onglet', await inSheet(sheet, '!document.getElementById("audio").closest("label").hidden && !document.getElementById("share").disabled'));
  await press(sheet, 'share');
  await until(() => capture.of(share.wc).includes('screen'), 'capture en cours');
  await until(() => ui('S.nav.capture.includes("screen")'), 'témoin de partage');
  check('« Partager » : le témoin « partage d’écran » s’allume sur l’onglet', true);
  // Sans écran qui affiche (machine d'intégration, écran en veille), Chromium peut
  // ne jamais livrer le flux de l'onglet : l'essai est alors sauté, pas bloqué.
  const stream = await Promise.race([pending, sleep(20000).then(() => 'délai')]);
  if (stream === 'délai') {
    outils.ignorer('« Cet onglet » : la page reçoit un flux vidéo', 'Chromium n’a pas livré le flux en 20 s : pas d’affichage sur cette machine');
    outils.ignorer('partage de l’onglet arrêté par la page : le témoin s’éteint', 'le flux n’a pas été livré');
    check('« Arrêter » coupe un partage qui n’aboutit pas', capture.stop(share.wc) === true);
    await until(() => !capture.of(share.wc).length && !share.wc.isLoading(), 'page rechargée');
  } else {
    check('« Cet onglet » : la page reçoit un flux vidéo', stream === 'flux:1', stream);
    await js(share.wc, 'window.flux.getTracks().forEach((x) => x.stop()); 1');
    if (noisy) {
      outils.ignorer('partage de l’onglet arrêté par la page : le témoin s’éteint', 'une capture d’Orbe est restée en attente, écran en veille');
      capture.clearAll(share.wc);
    } else {
      await until(() => !capture.of(share.wc).includes('screen'), 'fin du partage observée', 20000);
      check('partage de l’onglet arrêté par la page : le témoin s’éteint (isBeingCaptured)', !share.wc.isBeingCaptured());
    }
  }

  permissions.os.status = (kind) => (kind === 'screen' ? 'denied' : 'granted');
  await click(share.wc);
  pending = js(share.wc, 'navigator.mediaDevices.getDisplayMedia({ video: true }).then(() => "flux", (e) => "err:" + e.name)', true);
  sheet = await sheetOf(share.wc, 'picker');
  check('macOS n’autorise pas l’enregistrement de l’écran : le sélecteur le dit et propose d’ouvrir les réglages',
    sheet.payload.os === 'denied' && await inSheet(sheet, '!!document.getElementById("settings") && document.querySelector("#body p.warn").textContent') === t('share.osDenied'));
  // Réponse forgée : une source qui n'est pas dans la liste du processus principal.
  sheet.close({ id: 'screen:1:0', audio: true });
  check('une source absente de la liste proposée est refusée', (await pending).startsWith('err:'), await pending);
  permissions.os.status = saved.osStatus;
  await click(share.wc);
  pending = js(share.wc, 'navigator.mediaDevices.getDisplayMedia({ video: true }).then(() => "flux", (e) => "err:" + e.name)', true);
  sheet = await sheetOf(share.wc, 'picker');
  await inSheet(sheet, 'setTimeout(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })), 0); 1');
  check('Échap annule le partage : la page reçoit une erreur', (await pending).startsWith('err:'));
  check('aucune autorisation de partage n’est retenue', !store.state.permissions[A] || !Object.keys(store.state.permissions[A]).some((k) => /display|screen/.test(k)));
  await click(priv.wc);
  pending = js(priv.wc, 'navigator.mediaDevices.getDisplayMedia({ video: true }).then(() => "flux", (e) => "err:" + e.name)', true);
  sheet = await sheetOf(priv.wc, 'picker');
  sheet.close(null);
  check('navigation privée : même sélecteur', (await pending).startsWith('err:'));
  displayMedia.env.sources = saved.sources;

  // Ancienne capture d'écran (getUserMedia + chromeMediaSource) : pour Electron,
  // la même demande qu'un partage, mais accordée sans sélecteur. Jamais de flux.
  const LEGACY = (extra) => `navigator.mediaDevices.getUserMedia({ video: { mandatory: { chromeMediaSource: 'desktop'${extra} } } }).then((s) => { window.vol = s; return 'FLUX:' + s.getVideoTracks().length; }, (e) => 'err:' + e.name)`;
  const outcome = (promise) => Promise.race([promise.catch(() => 'page arrêtée'), sleep(4000).then(() => 'sans réponse')]);
  const blocked = () => permissions.internals.display.blocked;
  const legacy = await open(A + '/ancienne', 'Page /ancienne');
  let got1 = await outcome(js(legacy.wc, LEGACY('')));
  let got2 = await outcome(js(legacy.wc, LEGACY(", chromeMediaSourceId: 'screen:0:0'"), true));
  check('ancienne capture d’écran sans geste de l’utilisateur : refusée, aucun flux, aucun sélecteur', got1 === 'err:NotAllowedError' && got2 === 'err:NotAllowedError' && !sheets.top(legacy.wc) && blocked() === 0 && !capture.of(legacy.wc).length, [got1, got2]);
  // Juste après un vrai clic, la demande ne se distingue plus d'un partage :
  // Orbe constate que le sélecteur n'a pas été appelé et arrête la page aussitôt.
  await click(legacy.wc);
  got1 = await outcome(js(legacy.wc, LEGACY('')));
  await until(() => legacy.wc.isCrashed(), 'page arrêtée');
  check('ancienne capture d’écran après un clic : la page est arrêtée avant de recevoir la moindre image', blocked() === 1 && !String(got1).startsWith('FLUX') && legacy.wc.isCrashed(), got1);
  sheet = await sheetOf(legacy.wc, 'crash');
  await press(sheet, 'reload');
  await until(() => !legacy.wc.isCrashed() && !legacy.wc.isLoading(), 'page rechargée');
  check('après l’arrêt, aucun flux n’existe dans la page rechargée', await js(legacy.wc, 'typeof window.vol') === 'undefined');
  // Depuis un cadre d'un autre site (autre processus).
  const legacyHost = await open(A + '/hote?autre', 'Hôte');
  frame = await frameOf(legacyHost);
  got1 = await outcome(frame.executeJavaScript(LEGACY('')));
  check('ancienne capture d’écran depuis un cadre, sans geste : refusée', got1 === 'err:NotAllowedError' && blocked() === 1, got1);
  await click(legacyHost.wc);
  got1 = await outcome(frame.executeJavaScript(LEGACY(''), true));
  await until(() => legacyHost.wc.isCrashed(), 'page et cadre arrêtés');
  check('ancienne capture d’écran depuis un cadre, après un clic : page et cadre arrêtés, aucun flux', blocked() === 2 && !String(got1).startsWith('FLUX'), got1);
  (await sheetOf(legacyHost.wc, 'crash')).close(null);
  // Le vrai partage fonctionne toujours après cela.
  await click(share.wc);
  pending = js(share.wc, 'navigator.mediaDevices.getDisplayMedia({ video: true }).then(() => "flux", (e) => "err:" + e.name)', true);
  sheet = await sheetOf(share.wc, 'picker');
  check('le partage d’écran par le sélecteur fonctionne toujours (aucune page arrêtée à tort)', blocked() === 2 && !share.wc.isCrashed());
  sheet.close(null);
  await pending;

  // ---------------------------------------------------------------- Certificats
  check('état de la connexion : https sûr, http « non sécurisé », machine locale à part',
    certs.state(null, 'https://exemple.org/') === 'secure' && certs.state(null, 'http://exemple.org/') === 'insecure' && certs.state(null, A + '/') === 'local' && certs.state(null, 'file:///x') === '');
  const sec = await open(A + '/avant', 'Page /avant');
  sec.wc.loadURL(S + '/secret').catch(() => {});
  sheet = await sheetOf(sec.wc, 'cert');
  const host = new URL(S).host;
  check('certificat refusé : avertissement d’Orbe par-dessus l’onglet, avec le nom du site et la cause',
    sheet.payload.cover === true && sheet.payload.host === host && sheet.payload.reason === 'authority' && sheet.payload.error === 'net::ERR_CERT_AUTHORITY_INVALID' && sheet.payload.canProceed === true, sheet.payload);
  check('le certificat présenté est décrit : émetteur, validité, empreinte', sheet.payload.cert.issuer === pem.cn && sheet.payload.cert.subject === pem.cn && /^sha256\//.test(sheet.payload.cert.fingerprint) && sheet.payload.cert.validExpiry > Date.now() / 1000, sheet.payload.cert);
  check('la page du site n’a pas été chargée', !state.seen.some((x) => x.path === '/secret') && w.data.tabs[sec.id].url === S + '/secret');
  await until(() => ui('S.nav.security === "broken" && !document.getElementById("lock").hidden && document.getElementById("lock-text").textContent === ' + JSON.stringify(t('site.notSecure'))), 'pastille « Non sécurisé »');
  check('pastille d’adresse : « Non sécurisé » pendant l’avertissement', true);
  const warn = await inSheet(sheet, '({ title: document.getElementById("title").textContent, focus: document.activeElement && document.activeElement.id, hidden: document.getElementById("details").hidden, proceedShown: !!document.getElementById("proceed") && document.getElementById("proceed").offsetParent !== null, first: document.querySelector("#buttons button").id })');
  check('« Revenir en lieu sûr » est le choix par défaut ; « Continuer quand même » est caché derrière « Détails »', warn.title === t('cert.title') && warn.first === 'back' && warn.hidden === true && warn.proceedShown === false, warn);
  await inSheet(sheet, 'document.getElementById("more").click(); 1');
  const det = await inSheet(sheet, '({ text: document.getElementById("details").textContent, proceedShown: document.getElementById("proceed").offsetParent !== null })');
  check('« Détails » montre l’émetteur, l’empreinte et l’erreur', det.text.includes(pem.cn) && det.text.includes(sheet.payload.cert.fingerprint) && det.text.includes('ERR_CERT_AUTHORITY_INVALID') && det.proceedShown === true);
  await press(sheet, 'back');
  await until(() => w.data.tabs[sec.id].url === A + '/avant' && !sheets.top(sec.wc), 'retour à la page précédente');
  check('« Revenir en lieu sûr » ramène à la page précédente, sans exception', !certs.hasException(sec.wc.session, S + '/'));
  await until(() => ui('S.nav.security === "local" && document.getElementById("lock").hidden'), 'pastille sans alerte');

  // Site qui impose HTTPS (HSTS) ou refus sans appel : pas de « continuer ».
  certs.internals.probes.hsts = async () => true;
  sec.wc.loadURL(S + '/secret').catch(() => {});
  sheet = await sheetOf(sec.wc, 'cert');
  check('site HSTS : « Continuer quand même » n’est pas proposé', sheet.payload.canProceed === false && sheet.payload.hsts === true && await inSheet(sheet, '!document.getElementById("proceed")'));
  sheet.close('proceed'); // réponse forgée
  await sleep(600);
  check('site HSTS : une réponse « continuer » forgée est ignorée', !certs.hasException(sec.wc.session, S + '/') && !state.seen.some((x) => x.path === '/secret'));
  // La sonde ne conclut pas (délai, demande bloquée) : pas de « continuer » non plus.
  certs.internals.probes.hsts = async () => null;
  sec.wc.loadURL(S + '/secret').catch(() => {});
  sheet = await sheetOf(sec.wc, 'cert');
  check('sonde HSTS sans réponse : échec fermé, « Continuer quand même » n’est pas proposé', sheet.payload.canProceed === false && sheet.payload.hard === true && sheet.payload.unverified === true && sheet.payload.hsts === false && (await inSheet(sheet, 'document.querySelector("#body p.warn").textContent')) === t('cert.unverified'));
  // Avertissement recouvert par une autre feuille : la pastille reste en alerte.
  const above = sheets.open(sec.wc, 'os', { title: 'essai', text: 'essai' });
  check('avertissement sous une autre feuille : la connexion reste « non sécurisée »', sheets.top(sec.wc) === above && certs.state(sec.wc, S + '/secret') === 'broken');
  above.close('ok');
  sheet.close(null);
  // Pendant la sonde, et si une autre navigation part avant sa fin : jamais « sécurisé ».
  let release;
  certs.internals.probes.hsts = () => new Promise((r) => { release = () => r(false); });
  sec.wc.loadURL(S + '/secret').catch(() => {});
  await until(() => sec.rt.failed === true && typeof release === 'function', 'chargement refusé');
  await until(() => ui('S.nav.security === "broken"'), 'pastille en alerte pendant la sonde');
  check('certificat refusé, sonde en cours : la pastille dit déjà « Non sécurisé », jamais « sécurisé »', !sheets.top(sec.wc) && win.hooks.navState(w, sec.rt, w.data.tabs[sec.id]).security === 'broken');
  sec.wc.loadURL(A + '/avant').catch(() => {});
  await until(() => w.data.tabs[sec.id].url === A + '/avant' && sec.rt.failed === false, 'autre navigation aboutie');
  release();
  await sleep(300);
  check('une autre navigation part pendant la sonde : pas d’avertissement tardif, état de la nouvelle page', !sheets.top(sec.wc) && win.hooks.navState(w, sec.rt, w.data.tabs[sec.id]).security === 'local');
  certs.internals.probes.hsts = async () => false;
  for (const code of [-203, -207]) {
    certs.failed(sec.wc, { code, url: S + '/secret' }, { back() {}, load() {} });
    sheet = await sheetOf(sec.wc, 'cert');
    check('certificat invalide (' + code + ') : refus sans appel', sheet.payload.hard === true && sheet.payload.canProceed === false);
    sheet.close(null);
  }
  certs.failed(sec.wc, { code: -206, url: S + '/secret' }, { back() {}, load() {} });
  sheet = await sheetOf(sec.wc, 'cert');
  check('certificat révoqué : refus sans appel', sheet.payload.hard === true && sheet.payload.canProceed === false && sheet.payload.reason === 'revoked');
  sheet.close(null);
  check('la sonde HSTS ne sort pas de la machine pour une adresse locale', await certs.internals.probeHsts(sec.wc.session, '127.0.0.1') === false && await certs.internals.probeHsts(sec.wc.session, 'localhost') === false);
  certs.internals.probes.hsts = saved.hsts;

  sec.wc.loadURL(S + '/secret').catch(() => {});
  sheet = await sheetOf(sec.wc, 'cert');
  const fingerprint = sheet.payload.cert.fingerprint;
  await inSheet(sheet, 'document.getElementById("more").click(); 1');
  await press(sheet, 'proceed');
  await until(() => w.data.tabs[sec.id].title === 'Page /secret', 'page chargée après « continuer »');
  check('« Continuer quand même » : la page se charge, pour cet hôte et ce certificat', certs.internals.isAllowed(sec.wc.session, S + '/x', fingerprint) && !certs.internals.isAllowed(sec.wc.session, S + '/x', 'sha256/autre') && !certs.internals.isAllowed(sec.wc.session, S.replace('127.0.0.1', 'localhost') + '/', fingerprint));
  await until(() => ui('S.nav.security === "broken"'), 'toujours signalé');
  check('après « continuer », la pastille reste « Non sécurisé »', true);
  store.flush();
  check('l’exception n’est jamais écrite sur disque', fs.readdirSync(path.dirname(store.file)).filter((f) => f.endsWith('.json')).every((f) => !fs.readFileSync(path.join(path.dirname(store.file), f), 'utf8').includes(fingerprint)));
  priv.wc.loadURL(S + '/secret').catch(() => {});
  sheet = await sheetOf(priv.wc, 'cert');
  check('l’exception ne vaut pas pour une autre session (navigation privée)', sheet.payload.canProceed === true && !certs.hasException(priv.wc.session, S + '/'));
  sheet.close(null);
  check('résumé du certificat pour le cadenas', (certs.certFor(sec.wc.session, S + '/') || {}).fingerprint === fingerprint);
  essentials.siteInfo(w);
  sheet = await sheetOf(sec.wc, 'site');
  check('informations du site : connexion non sécurisée, certificat, exception en cours', sheet.payload.security === 'broken' && sheet.payload.cert.fingerprint === fingerprint && sheet.payload.perms[0].key === 'cert-exception');
  await inSheet(sheet, 'document.querySelector("#perms .item[data-key=cert-exception] [data-do=reset]").click(); 1');
  sheet = await sheetOf(sec.wc, 'cert');
  check('retirer l’exception : l’avertissement revient', !certs.hasException(sec.wc.session, S + '/'));
  sheet.close(null);
  iw.win.close();
  await until(() => !OrbeWindow.all.includes(iw), 'fenêtre privée fermée');

  // ---------------------------------------------------------------- Authentification HTTP
  const au = await open(A + '/zero', 'Page /zero');
  au.wc.loadURL(A + '/auth').catch(() => {});
  sheet = await sheetOf(au.wc, 'auth');
  check('authentification HTTP : feuille sur l’onglet, avec l’hôte rapporté par Electron', sheet.payload.host === new URL(A).host && sheet.payload.proxy === false && sheet.payload.retry === false && sheet.payload.insecure === false, sheet.payload);
  check('demande de la page en cours de chargement : la feuille couvre l’ancienne page et affiche l’adresse demandée', sheet.payload.cover === true && sheet.payload.pending === A + '/auth' && await inSheet(sheet, 'document.body.classList.contains("cover") && document.getElementById("pending").textContent') === A + '/auth');
  const realm = await inSheet(sheet, '({ quote: document.querySelector(".quote").textContent, tags: document.querySelectorAll(".quote b").length, pass: document.getElementById("pass").type })');
  check('le message du serveur est cité comme du texte ; le mot de passe est masqué', realm.quote === 'Zone <b>reservee</b>' && realm.tags === 0 && realm.pass === 'password', realm);
  await press(sheet, 'cancel');
  await until(() => w.data.tabs[au.id].title === 'Refusé', 'page 401');
  check('annuler : la page de refus du serveur s’affiche, sans identifiant envoyé', !state.seen.some((x) => x.path === '/auth' && x.auth));
  au.wc.loadURL(A + '/auth').catch(() => {});
  sheet = await sheetOf(au.wc, 'auth');
  await inSheet(sheet, 'document.getElementById("user").value = "alice"; document.getElementById("pass").value = "faux"; 1');
  await press(sheet, 'ok');
  await until(() => sheet.closed, 'première réponse');
  sheet = await sheetOf(au.wc, 'auth');
  check('identifiants refusés : la question revient et le dit', sheet.payload.retry === true);
  await inSheet(sheet, 'document.getElementById("user").value = "alice"; document.getElementById("pass").value = "secret"; 1');
  await press(sheet, 'ok');
  await until(() => w.data.tabs[au.id].title === 'Entré', 'page protégée');
  check('bons identifiants : la page protégée s’affiche', state.seen.some((x) => x.path === '/auth' && x.auth === 'Basic ' + Buffer.from('alice:secret').toString('base64')));
  // Ressource d'un autre site qui réclame un mot de passe : aucune question.
  const emb = await open(A + '/embarque', 'Embarque');
  await until(() => state.seen.some((x) => x.path === '/auth.png'), 'image demandée');
  check('une image d’un autre site ne peut pas faire apparaître la question', await noSheet(emb.wc, 700));
  // Cadre intégré qui navigue vers une page protégée.
  await au.wc.session.clearAuthCache();
  const sameFrame = await open(A + '/hote?vers=auth', 'Hôte');
  sheet = await sheetOf(sameFrame.wc, 'auth');
  check('cadre du même hôte : la question est posée, sans couvrir la page', sheet.payload.cover === false && sheet.payload.pending === '' && sheet.payload.host === new URL(A).host);
  sheet.close(null);
  const before401 = state.seen.filter((x) => x.path === '/auth' && x.host.startsWith('localhost')).length;
  const otherFrame = await open(A + '/hote?autre&vers=auth', 'Hôte');
  await until(() => state.seen.filter((x) => x.path === '/auth' && x.host.startsWith('localhost')).length > before401, 'cadre demandé');
  check('cadre d’un autre hôte : la question n’apparaît pas sur la page qui l’intègre', await noSheet(otherFrame.wc, 800));
  w.activate(emb.id);
  // Réponse forgée (pas des chaînes) : demande annulée.
  let got = 'rien';
  const fakeEvent = { preventDefault() {} };
  auth.internals.onLogin(fakeEvent, emb.wc, { url: A + '/auth', isRequestForNavigation: true, firstAuthAttempt: true }, { isProxy: true, scheme: 'basic', host: 'proxy.exemple', port: 3128, realm: 'r' }, (...args) => { got = args; });
  sheet = await sheetOf(emb.wc, 'auth');
  check('proxy : la feuille nomme le proxy et son port', sheet.payload.proxy === true && sheet.payload.host === 'proxy.exemple:3128');
  sheet.close({ username: { toString() { return 'x'; } }, password: 1 });
  await until(() => got !== 'rien', 'réponse');
  check('réponse mal formée : la demande est annulée', Array.isArray(got) && got.length === 0, got);

  // Certificat client : jamais envoyé sans un choix.
  let chosen = 'rien';
  let prevented = false;
  const certs2 = [{ subjectName: 'Alice', issuerName: 'AC Test', fingerprint: 'a' }, { subjectName: 'Bob', issuerName: 'AC Test', fingerprint: 'b' }];
  app.emit('select-client-certificate', { preventDefault() { prevented = true; } }, emb.wc, 'https://client.exemple/', certs2, (c) => { chosen = c; });
  sheet = await sheetOf(emb.wc, 'choose');
  check('certificat client : Electron n’envoie pas le premier d’office ; Orbe demande lequel', prevented && chosen === 'rien' && sheet.payload.items.map((x) => x.label).join() === 'Alice,Bob' && sheet.payload.host === 'client.exemple');
  await inSheet(sheet, 'document.querySelector(".item[data-i=\\"1\\"]").click(); 1');
  await press(sheet, 'ok');
  await until(() => chosen !== 'rien', 'choix');
  check('certificat client : celui qui est choisi est envoyé', chosen === certs2[1]);
  chosen = 'rien';
  app.emit('select-client-certificate', { preventDefault() {} }, emb.wc, 'https://client.exemple/', certs2, (c) => { chosen = c; });
  (await sheetOf(emb.wc, 'choose')).close(null);
  await until(() => chosen !== 'rien', 'annulation');
  check('certificat client : annuler n’en envoie aucun', chosen === undefined);

  // ---------------------------------------------------------------- « Quitter la page ? »
  const dirty = await open(A + '/sale', 'Brouillon');
  await js(dirty.wc, 'window.sale = true; 1');
  asks.length = 0;
  w.close(dirty.id);
  await until(() => dirty.wc.isDestroyed(), 'page fermée');
  check('page jamais touchée : elle ne retient pas l’onglet, aucune question', asks.length === 0 && !w.data.tabs[dirty.id]);

  const d2 = await open(A + '/sale', 'Brouillon');
  await click(d2.wc);
  await js(d2.wc, 'window.sale = true; 1');
  leave = false;
  d2.wc.loadURL(A + '/ailleurs').catch(() => {});
  await until(() => asks.length === 1, 'question posée');
  check('navigation depuis une page modifiée : « Quitter la page ? Les modifications peuvent ne pas être enregistrées »',
    asks[0].message === t('unload.title') && asks[0].detail.includes(t('unload.detail')) && asks[0].detail.includes('127.0.0.1') && !asks[0].detail.includes('ignore') && asks[0].defaultId === 1 && asks[0].buttons[1] === t('unload.stay'), asks[0]);
  await sleep(400);
  check('« Rester » : la page reste, intacte', d2.wc.getURL() === A + '/sale' && await js(d2.wc, 'window.sale') === true);
  const row = w.space.today.indexOf(d2.id);
  const inArchive = () => store.state.archive.filter((x) => x.url === A + '/sale').length;
  const archivedBefore = inArchive();
  const undoBefore = w.pendingLabel('undo');
  // Nouvelle tentative dans les deux secondes qui suivent « Rester » : refusée sans boîte de dialogue.
  d2.wc.loadURL(A + '/ailleurs').catch(() => {});
  await sleep(400);
  check('tentatives en rafale : pas de seconde boîte de dialogue, la page reste', asks.length === 1 && d2.wc.getURL() === A + '/sale');
  unload.forget(d2.wc);
  w.close(d2.id);
  await until(() => asks.length === 2, 'question à la fermeture');
  await until(() => w.data.tabs[d2.id] && w.activeId === d2.id && win.live.get(d2.id) === d2.rt, 'onglet revenu');
  check('fermer l’onglet puis « Rester » : l’onglet revient à sa place, avec la même page', w.space.today.indexOf(d2.id) === row && !d2.wc.isDestroyed() && await js(d2.wc, 'window.sale') === true && w.win.contentView.children.includes(d2.rt.view));
  check('l’onglet revenu n’est plus dans l’archive, et sa fermeture n’est plus à annuler', inArchive() === archivedBefore && w.pendingLabel('undo') === undoBefore && !w.closed.some((r) => r.tab && r.tab.id === d2.id));
  await js(d2.wc, 'document.title = "Brouillon modifié"; 1');
  await until(() => w.data.tabs[d2.id].title === 'Brouillon modifié', 'titre suivi');
  check('l’onglet revenu suit toujours sa page (titre, adresse)', true);

  // Plusieurs onglets archivés d'un coup : une question par page qui s'y oppose.
  const d3 = await open(A + '/sale', 'Brouillon');
  await click(d3.wc);
  await js(d3.wc, 'window.sale = true; 1');
  const calm = await open(A + '/calme', 'Page /calme');
  asks.length = 0;
  leave = true;
  unload.forget(d2.wc);
  w.closeMany([d2.id, d3.id, calm.id]);
  await until(() => d2.wc.isDestroyed() && d3.wc.isDestroyed(), 'pages fermées');
  check('archiver plusieurs onglets : une question par page qui s’y oppose, pas pour les autres', asks.length === 2 && !w.data.tabs[d2.id] && !w.data.tabs[d3.id] && !w.data.tabs[calm.id], asks.length);

  // Fermeture d'une fenêtre.
  const w2 = new OrbeWindow();
  const d4 = await open(A + '/sale', 'Brouillon', w2);
  const rt4 = d4.rt;
  let gone4 = 0;
  d4.wc.once('destroyed', () => { gone4 = Date.now(); });
  await click(d4.wc);
  await js(d4.wc, 'window.sale = true; 1');
  asks.length = 0;
  leave = false;
  const archived = store.state.archive.length;
  // Pages vivantes servies par le même processus que celle-ci (un processus occupé par une autre retarde sa réponse).
  const pid4 = d4.wc.getOSProcessId();
  const sharing4 = [...win.live.values()].filter((r) => r !== rt4 && !r.wc.isDestroyed() && r.wc.getOSProcessId() === pid4).length;
  w2.win.close();
  await until(() => asks.length === 1, 'question à la fermeture de la fenêtre');
  const asked4 = Date.now();
  await sleep(500);
  // Si la page a disparu : quand (après la question), et ce qu'Orbe lui a fait (journal de la page).
  const stayed = { fenetre: !w2.win.isDestroyed(), connue: OrbeWindow.all.includes(w2), page: !d4.wc.isDestroyed(), questions: asks.length, detruiteApres: gone4 ? gone4 - asked4 : null, attente: Date.now() - asked4, journal: rt4.trail, memeProcessus: sharing4 };
  stayed.sale = stayed.page ? await js(d4.wc, 'window.sale').catch((e) => String(e)) : null;
  stayed.adresse = stayed.page ? d4.wc.getURL() : null;
  check('fermer la fenêtre puis « Rester » : la fenêtre et la page restent', stayed.fenetre && stayed.connue && stayed.page && stayed.sale === true, JSON.stringify(stayed));
  leave = true;
  unload.forget(d4.wc);
  w2.win.close();
  await until(() => !OrbeWindow.all.includes(w2), 'fenêtre fermée');
  check('fermer la fenêtre puis « Quitter » : elle se ferme, l’onglet reste dans l’Espace (non archivé)', asks.length === 2 && !!store.state.tabs[d4.id] && store.state.archive.length === archived && d4.wc.isDestroyed(),
    JSON.stringify({ questions: asks.length, onglet: !!store.state.tabs[d4.id], archive: [archived, store.state.archive.length], pageDetruite: d4.wc.isDestroyed() }));
  leave = false;

  // « Rester » tient même quand la page tarde. Chromium donne une seconde à une page
  // consultée (beforeunload) pour répondre, puis de nouveau une seconde, après la
  // réponse de l'utilisateur, pour en accuser réception ; passé ce délai il la ferme
  // d'office. Orbe l'en empêche (bouclier, src/main/unload.js).
  const dirtyTab = async (owner = w) => {
    const d = await open(A + '/sale', 'Brouillon', owner);
    await click(d.wc);
    await js(d.wc, 'window.sale = true; 1');
    d.rt0 = d.rt;
    return d;
  };
  const intact = async (d) => !d.wc.isDestroyed() && await js(d.wc, 'window.sale') === true;
  const closeWindow = async (ow, d) => {
    if (ow.win.isDestroyed()) return;
    leave = true;
    if (d) unload.forget(d.wc);
    ow.win.close();
    await until(() => !OrbeWindow.all.includes(ow), 'fenêtre fermée');
    leave = false;
  };
  // Page qui met une seconde et demie à répondre à beforeunload, puis s'y oppose.
  const slowTab = await dirtyTab();
  const slowWin = new OrbeWindow();
  const slowIn = await dirtyTab(slowWin);
  const slowSleep = await dirtyTab();
  for (const d of [slowTab, slowIn, slowSleep]) await js(d.wc, 'window.lent = 1500; 1');
  asks.length = 0;
  leave = false;
  let t0 = Date.now();
  w.close(slowTab.id);
  await until(() => asks.length === 1 || slowTab.wc.isDestroyed(), 'réponse de la page lente (onglet)');
  check('fermer l’onglet d’une page qui met plus d’une seconde à répondre : la question est posée quand même, « Rester » garde la page',
    asks.length === 1 && Date.now() - t0 >= 1400 && await intact(slowTab), JSON.stringify({ questions: asks.length, ms: Date.now() - t0, page: !slowTab.wc.isDestroyed(), journal: slowTab.rt0.trail }));
  if (!slowTab.wc.isDestroyed()) await until(() => w.data.tabs[slowTab.id] && win.live.get(slowTab.id) === slowTab.rt0, 'onglet lent revenu');
  if (!slowTab.wc.isDestroyed()) {
    check('pendant la consultation, la page est à l’abri du délai de Chromium (bouclier levé)', unload.shielded(slowTab.wc) && slowTab.wc.debugger.isAttached());
    await until(() => !unload.shielded(slowTab.wc), 'bouclier retombé', 14000).catch(() => {});
    check('la page a répondu : le bouclier retombe, le débogueur est rendu', !unload.shielded(slowTab.wc) && !slowTab.wc.debugger.isAttached());
  }
  asks.length = 0;
  t0 = Date.now();
  slowWin.win.close();
  await until(() => asks.length === 1 || slowIn.wc.isDestroyed(), 'réponse de la page lente (fenêtre)');
  await sleep(300);
  check('fermer la fenêtre d’une page qui met plus d’une seconde à répondre : la question est posée quand même, « Rester » garde fenêtre et page',
    asks.length === 1 && Date.now() - t0 >= 1400 && !slowWin.win.isDestroyed() && await intact(slowIn), JSON.stringify({ questions: asks.length, ms: Date.now() - t0, page: !slowIn.wc.isDestroyed(), journal: slowIn.rt0.trail }));
  asks.length = 0;
  OrbeWindow.sleepView(slowSleep.id);
  await until(() => slowSleep.rt0.objected || slowSleep.wc.isDestroyed(), 'réponse de la page lente (veille)');
  check('veille automatique d’une page lente à répondre : elle est consultée, s’y oppose et reste, sans question',
    asks.length === 0 && slowSleep.rt0.objected === true && !slowSleep.rt0.sleeping && win.live.get(slowSleep.id) === slowSleep.rt0 && await intact(slowSleep), JSON.stringify({ questions: asks.length, page: !slowSleep.wc.isDestroyed(), journal: slowSleep.rt0.trail }));
  for (const d of [slowTab, slowIn, slowSleep]) if (!d.wc.isDestroyed()) await js(d.wc, 'window.lent = 0; 1');
  await closeWindow(slowWin, slowIn);

  // Le processus de la page figé juste après « Rester » (machine chargée) : c'est ainsi que la
  // page se perdait. Figer un processus se fait par signal : pas sous Windows.
  if (process.platform === 'win32') {
    outils.ignorer('« Rester » puis processus de la page figé : la page reste', 'pas de signal pour figer un processus sous Windows');
    outils.ignorer('page détruite par Chromium après « Rester » : l’onglet garde sa ligne', 'pas de signal pour figer un processus sous Windows');
  } else {
    const freeze = (wc, ms) => () => {
      const pid = wc.getOSProcessId();
      process.kill(pid, 'SIGSTOP');
      setTimeout(() => { try { process.kill(pid, 'SIGCONT'); } catch {} }, ms);
    };
    const fw = new OrbeWindow();
    const fz = await dirtyTab(fw);
    const before = store.state.archive.length;
    asks.length = 0;
    onAsk = freeze(fz.wc, 1800);
    fw.win.close();
    await until(() => asks.length === 1, 'question (processus figé)');
    onAsk = null;
    await sleep(2600);
    check('« Rester » puis processus de la page figé deux secondes : la page reste, intacte',
      !fw.win.isDestroyed() && await intact(fz) && !!store.state.tabs[fz.id] && store.state.archive.length === before && !win.lostAfterStay(), JSON.stringify({ page: !fz.wc.isDestroyed(), perdue: win.lostAfterStay(), journal: fz.rt0.trail }));
    // Bouclier coupé : Chromium ferme la page. Elle n'est pas pour autant « fermée par
    // elle-même » : l'onglet garde sa ligne, rien n'est archivé, et la page se recharge.
    if (!fz.wc.isDestroyed()) {
      unload.env.shield = false;
      unload.unshield(fz.wc);
      unload.forget(fz.wc);
      asks.length = 0;
      onAsk = freeze(fz.wc, 1800);
      fw.win.close();
      await until(() => asks.length === 1, 'question (processus figé, sans bouclier)');
      onAsk = null;
      await until(() => fz.wc.isDestroyed(), 'page fermée d’office par Chromium');
      unload.env.shield = true;
      await sleep(200);
      const lost = win.lostAfterStay();
      const again = win.live.get(fz.id);
      check('page détruite par Chromium après « Rester » (bouclier coupé) : l’onglet garde sa ligne, rien n’est archivé, la page se recharge',
        !fw.win.isDestroyed() && !!store.state.tabs[fz.id] && fw.space.today.includes(fz.id) && store.state.archive.length === before && !!lost && lost.id === fz.id && !!again && again !== fz.rt0 && !again.wc.isDestroyed(),
        JSON.stringify({ onglet: !!store.state.tabs[fz.id], archive: [before, store.state.archive.length], perdue: lost, vue: !!again }));
    }
    unload.env.shield = true;
    await closeWindow(fw, fz);
  }

  // Veille automatique et demande de l'utilisateur sur la même page, en même temps : la
  // réponse de la page vaut pour l'utilisateur. (Elle restait sans rien dire, puis était
  // fermée de force quatre secondes plus tard, sans question.)
  const both = await dirtyTab();
  const bothWin = new OrbeWindow();
  const bothIn = await dirtyTab(bothWin);
  asks.length = 0;
  leave = false;
  OrbeWindow.sleepView(both.id);
  w.close(both.id);
  bothWin.win.close();
  OrbeWindow.sleepView(bothIn.id);
  await until(() => asks.length === 2 || (both.wc.isDestroyed() && bothIn.wc.isDestroyed()), 'questions (veille et fermeture ensemble)', 6000).catch(() => {});
  const asked2 = asks.length;
  await sleep(4500);
  check('veille en cours puis fermeture de l’onglet : la question est posée, « Rester » garde l’onglet et sa page',
    asked2 === 2 && await intact(both) && !!w.data.tabs[both.id] && win.live.get(both.id) === both.rt0 && !both.rt0.sleeping, JSON.stringify({ questions: asked2, page: !both.wc.isDestroyed(), onglet: !!w.data.tabs[both.id], journal: both.rt0.trail }));
  check('fermeture de la fenêtre et veille en même temps : la question est posée, « Rester » garde la fenêtre et la page',
    asked2 === 2 && !bothWin.win.isDestroyed() && await intact(bothIn) && !bothIn.rt0.sleeping && !bothIn.rt0.windowClosing, JSON.stringify({ questions: asked2, fenetre: !bothWin.win.isDestroyed(), page: !bothIn.wc.isDestroyed(), journal: bothIn.rt0.trail }));
  await closeWindow(bothWin, bothIn);

  // ---------------------------------------------------------------- Fenêtres surgissantes
  const pop = await open(A + '/surgit', 'Page /surgit');
  let count = w.space.today.length;
  check('window.open sans geste : bloqué, la page reçoit null', await js(pop.wc, 'window.open("/pub") === null', true) === true && w.space.today.length === count);
  await until(() => ui('S.nav.popups === 1 && !document.getElementById("popup-note").hidden && document.getElementById("popup-note").title === ' + JSON.stringify(t('popup.blocked'))), 'mention dans la pastille');
  check('mention « Fenêtre surgissante bloquée » dans la pastille d’adresse', popups.count(pop.rt) === 1);
  await js(pop.wc, 'const a = document.createElement("a"); a.href = "/pub2"; a.target = "_blank"; document.body.append(a); a.click(); 1', true);
  await sleep(300);
  check('lien target=_blank cliqué par script : bloqué aussi', w.space.today.length === count && popups.count(pop.rt) === 2);
  const menu = popups.menu(w, pop.rt, t);
  check('menu de la mention : « Ouvrir quand même » et « Toujours autoriser pour ce site »', menu.some((m) => m.label === t('popup.open', { url: A + '/pub' })) && menu.some((m) => m.label === t('popup.always', { site: A })), menu.map((m) => m.label));
  await click(pop.wc);
  check('après un vrai clic : la fenêtre s’ouvre, avec window.opener', await js(pop.wc, 'window.fille = window.open("/fille"); !!window.fille') === true);
  await until(() => w.space.today.length === count + 1, 'onglet ouvert');
  const child = w.activeId;
  opened.push([w, child]);
  check('l’onglet ouvert par le clic se place sous sa page d’origine', w.space.today[w.space.today.indexOf(pop.id) + 1] === child && await until(() => js(rtOf(child).wc, '!!window.opener'), 'opener'));
  w.activate(pop.id);
  check('un geste n’ouvre qu’une fenêtre : la suivante est bloquée', await js(pop.wc, 'window.open("/encore") === null') === true);
  menu.find((m) => m.label === t('popup.open', { url: A + '/pub' })).click();
  await until(() => w.space.today.length === count + 2, '« ouvrir quand même »');
  opened.push([w, w.activeId]);
  check('« Ouvrir quand même » ouvre l’adresse bloquée dans un onglet', w.data.tabs[w.activeId].url === A + '/pub');
  w.activate(pop.id);
  popups.menu(w, pop.rt, t).find((m) => m.label === t('popup.always', { site: A })).click();
  check('« Toujours autoriser pour ce site » : retenu comme une autorisation, la mention disparaît', store.state.permissions[A].popups === true && popups.count(pop.rt) === 0 && permissions.list(pop.wc.session, A).some((x) => x.key === 'popups' && x.label === t('perm.popups')));
  pop.rt.gesture = 0;
  count = w.space.today.length;
  await js(pop.wc, 'window.open("/libre"); 1');
  await until(() => w.space.today.length === count + 1, 'ouverture autorisée');
  opened.push([w, w.activeId]);
  check('site autorisé : window.open passe sans geste', true);
  permissions.reset(pop.wc.session, A, 'popups');
  w.activate(pop.id);
  // Fenêtre ouverte dès l'appui du bouton : le relâchement du même clic n'en autorise pas une seconde.
  pop.rt.gesture = 0;
  pop.wc.sendInputEvent({ type: 'mouseDown', x: 230, y: 90, button: 'left', clickCount: 1 });
  await until(() => pop.rt.gesture > 0, 'appui reçu');
  count = w.space.today.length;
  await js(pop.wc, 'window.open("/appui"); 1');
  await until(() => w.space.today.length === count + 1, 'fenêtre ouverte à l’appui');
  opened.push([w, w.activeId]);
  w.activate(pop.id);
  pop.wc.sendInputEvent({ type: 'mouseUp', x: 230, y: 90, button: 'left', clickCount: 1 });
  await sleep(300);
  check('un clic = une fenêtre : le relâchement du bouton ne redonne pas de geste', pop.rt.gesture === 0 && await js(pop.wc, 'window.open("/relache") === null') === true && w.space.today.length === count + 1);
  await click(pop.wc);
  pop.wc.loadURL(A + '/apres-clic');
  await until(() => w.data.tabs[pop.id].title === 'Page /apres-clic', 'page suivante');
  check('le geste ne survit pas au changement de page', pop.rt.gesture === 0 && await js(pop.wc, 'window.open("/heritee") === null') === true);
  popups.reset(pop.rt);
  pop.rt.gesture = 0;
  await js(pop.wc, 'window.open("/x"); 1');
  await until(() => popups.count(pop.rt) === 1, 'bloquée de nouveau');
  pop.wc.loadURL(A + '/suite');
  await until(() => w.data.tabs[pop.id].title === 'Page /suite', 'page suivante');
  check('une nouvelle page efface la mention', popups.count(pop.rt) === 0);

  // ---------------------------------------------------------------- Liens vers d'autres applications
  const ext = await open(A + '/lien', 'Lien externe');
  await clickLink(ext.wc, 'm');
  sheet = await sheetOf(ext.wc, 'external');
  check('lien mailto: : Orbe demande avant d’ouvrir une autre application', sheet.payload.scheme === 'mailto' && sheet.payload.url.startsWith('mailto:test@orbe.invalid') && sheet.payload.site === A && launched.length === 0, sheet.payload);
  await press(sheet, 'cancel');
  await sleep(300);
  check('annuler : rien n’est ouvert, la page reste affichée (pas de page d’erreur)', launched.length === 0 && w.data.tabs[ext.id].url === A + '/lien' && w.data.tabs[ext.id].title === 'Lien externe');
  await clickLink(ext.wc, 'm');
  check('après « Annuler », la page ne peut pas reposer la question pour ce schéma', await noSheet(ext.wc, 600) && launched.length === 0);
  // Sans geste : une seule question par page.
  ext.wc.reload();
  await until(() => !ext.wc.isLoading() && permissions.internals.pages.get(ext.wc.id).refused.size === 0, 'page rechargée');
  ext.rt.gesture = 0;
  await js(ext.wc, 'location.href = "tel:0100000000"; 1');
  sheet = await sheetOf(ext.wc, 'external');
  sheet.close(null);
  await js(ext.wc, 'location.href = "tel:0100000001"; 1');
  check('sans geste de l’utilisateur, une page ne fait apparaître la question qu’une fois', await noSheet(ext.wc, 600) && launched.length === 0);
  await clickLink(ext.wc, 'm');
  sheet = await sheetOf(ext.wc, 'external');
  await inSheet(sheet, 'document.getElementById("always").checked = true; 1');
  await press(sheet, 'ok');
  await until(() => launched.length === 1, 'application lancée');
  check('« Ouvrir » avec « Toujours autoriser » : lien ouvert, retenu par site et par schéma', launched[0].startsWith('mailto:test@orbe.invalid') && store.state.permissions[A]['external:mailto'] === true);
  await clickLink(ext.wc, 'm');
  sheet = await sheetOf(ext.wc, 'external');
  check('ouvertures rapprochées : la question revient malgré l’autorisation', launched.length === 1);
  sheet.close(null);
  permissions.internals.lastExternal.clear();
  await clickLink(ext.wc, 'm');
  await until(() => launched.length === 2, 'ouverture sans question');
  check('plus tard, le site autorisé ouvre son lien sans question', !sheets.top(ext.wc));
  const entry = permissions.internals.memories.get(ext.wc.session);
  const refused = [];
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'ms-msdt:/id', 'https://exemple.org/', 'pas une adresse']) refused.push(await permissions.internals.external(entry, ext.wc, A, { externalURL: url }));
  check('schémas dangereux (file:, javascript:, ms-msdt:…) : jamais ouverts, sans question', refused.every((x) => x === false) && launched.length === 2 && !sheets.top(ext.wc));

  // ---------------------------------------------------------------- Appareils
  let answer = 'rien';
  prevented = false;
  ext.wc.emit('select-bluetooth-device', { preventDefault() { prevented = true; } }, [{ deviceId: 'premier', deviceName: 'Casque' }], (id) => { answer = id; });
  check('Bluetooth : la demande est annulée tout de suite, jamais le premier appareil d’office', prevented && answer === '');
  answer = 'rien';
  prevented = false;
  ext.wc.session.emit('select-usb-device', { preventDefault() { prevented = true; } }, { deviceList: [{ deviceId: 'cle' }], frame: ext.wc.mainFrame }, (id) => { answer = id; });
  check('USB : la demande est annulée proprement', prevented && answer === undefined);
  answer = 'rien';
  ext.wc.session.emit('select-serial-port', { preventDefault() {} }, [{ portId: 'p1' }], ext.wc, (id) => { answer = id; });
  check('port série : la demande est annulée proprement', answer === '');
  check('aucun appareil n’est jamais accordé d’avance', (await js(ext.wc, 'navigator.usb ? navigator.usb.getDevices().then((d) => d.length) : 0')) === 0);

  // ---------------------------------------------------------------- Page plantée, page qui ne répond plus
  const crash = await open(A + '/fragile', 'Page /fragile');
  crash.wc.forcefullyCrashRenderer();
  sheet = await sheetOf(crash.wc, 'crash');
  check('page plantée : feuille « La page a planté » avec « Recharger »', sheet.payload.cover === true && await inSheet(sheet, 'document.getElementById("title").textContent') === t('crash.title'));
  await press(sheet, 'reload');
  await until(() => !sheets.top(crash.wc) && !crash.wc.isCrashed() && !crash.wc.isLoading(), 'page rechargée');
  check('« Recharger » relance la page', await js(crash.wc, 'document.title') === 'Page /fragile' && crash.rt.crashed === false);
  crash.wc.emit('unresponsive');
  sheet = await sheetOf(crash.wc, 'hung');
  check('page qui ne répond plus : « Attendre » ou « Recharger »', (await inSheet(sheet, '[...document.querySelectorAll("#buttons button")].map((b) => b.id)')).join() === 'wait,reload');
  crash.wc.emit('responsive');
  await until(() => sheet.closed, 'feuille fermée');
  check('la page répond de nouveau : la feuille se ferme toute seule', !sheets.top(crash.wc));

  // ---------------------------------------------------------------- Téléchargements
  const dlDir = app.getPath('downloads');
  const custom = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-dl-'));
  const dl = await open(A + '/fichiers', 'Page /fichiers');
  // Téléchargements multiples : une page a droit à un téléchargement qu'on ne lui a pas demandé ; au suivant, Orbe demande.
  {
    const ses = dl.wc.session;
    const count = () => store.state.downloads.length;
    const n0 = count();
    dl.wc.downloadURL(A + '/note.txt');
    await until(() => count() === n0 + 1, 'premier téléchargement automatique');
    dl.wc.downloadURL(A + '/note.txt');
    sheet = await sheetOf(dl.wc, 'perm');
    check('téléchargements multiples : le deuxième téléchargement lancé par la page sans geste attend une réponse, sur une feuille qui nomme le site',
      count() === n0 + 1 && sheet.payload.lines.join() === t('perm.downloads') && sheet.payload.site === permissions.siteName(A), sheet.payload);
    check('la demande d’autorisation est une bulle ancrée en haut de la page, qui dit où changer d’avis',
      await inSheet(sheet, '(() => { const c = document.getElementById("card").getBoundingClientRect(); return document.body.classList.contains("anchor") && c.top < 40 && c.left < 40 && document.getElementById("later").textContent.length > 20; })()'));
    await press(sheet, 'deny');
    dl.wc.downloadURL(A + '/note.txt');
    check('refus : retenu pour le site, plus de question ni de téléchargement automatique', store.state.permissions[A].downloads === false && await noSheet(dl.wc) && count() === n0 + 1);
    downloads.saveFrom(dl.wc, A + '/note.txt');
    await until(() => count() === n0 + 2, 'téléchargement demandé par Orbe');
    await click(dl.wc);
    dl.wc.downloadURL(A + '/note.txt');
    await until(() => count() === n0 + 3, 'téléchargement après un geste');
    dl.wc.downloadURL(A + '/note.txt');
    await sleep(300);
    check('« Enregistrer l’image » (demandé par Orbe) et un téléchargement qui suit un geste passent toujours ; un geste n’en couvre qu’un', count() === n0 + 3);
    // Site sans réponse retenue, page rechargée : la question revient, et « Autoriser » relance le fichier refusé.
    permissions.reset(ses, A, 'downloads');
    win.live.get(dl.id).gesture = 0;
    dl.wc.reload();
    await until(() => !dl.wc.isLoading() && permissions.internals.pages.get(dl.wc.id).downloads === 0, 'page rechargée');
    dl.wc.downloadURL(A + '/note.txt');
    await until(() => count() === n0 + 4, 'premier téléchargement de la page rechargée');
    dl.wc.downloadURL(A + '/note.txt');
    sheet = await sheetOf(dl.wc, 'perm');
    await press(sheet, 'allow');
    await until(() => count() === n0 + 5, 'téléchargement relancé après l’accord');
    dl.wc.downloadURL(A + '/note.txt');
    await until(() => count() === n0 + 6, 'téléchargements suivants sans question');
    check('accord : retenu pour le site, le fichier refusé repart et les suivants passent sans question', store.state.permissions[A].downloads === true && !sheets.top(dl.wc));
    check('… et l’autorisation figure parmi celles du site', permissions.list(ses, A).some((x) => x.key === 'downloads' && x.value === true && x.label === t('perm.downloads')));
    await until(() => store.state.downloads.slice(0, 6).every((d) => d.state !== 'progressing'), 'téléchargements d’essai terminés');
    // Les fichiers de cet essai ne restent pas : la suite compte sur un dossier sans « note.txt ».
    for (const d of store.state.downloads.slice(0, 6)) { try { fs.rmSync(d.path, { force: true }); } catch {} }
  }
  const newest = () => store.state.downloads[0];
  const start = async (file) => { const before = newest(); dl.wc.downloadURL(A + file); return until(() => (newest() !== before ? newest() : null), 'téléchargement lancé : ' + file); };
  const lib = (name, id) => downloads.action(name, id, null);
  const opens = [];
  const confirms = [];
  let agree = false;
  downloads.env.openPath = (file) => { opens.push(file); };
  downloads.env.confirm = async (parent, opts) => { confirms.push(opts); return agree; };

  check('nom proposé par un site : réduit à un simple nom de fichier', downloads.safeName('../../.ssh/authorized_keys') === 'authorized_keys' && downloads.safeName('C:\\Windows\\x.exe') === 'x.exe' && downloads.safeName('') !== '');
  check('extension masquée (sens de lecture inversé, points ou espaces en fin de nom) : reconnue quand même',
    downloads.isDangerous('facture\u202efdp.exe') && downloads.isDangerous('installe.exe. ') && downloads.isDangerous('x.scr\u200b') && downloads.safeName('doc\u202efdp.exe') === 'docfdp.exe' && downloads.safeName('a.pdf . ') === 'a.pdf'
    && ['x.js', 'x.py', 'x.chm', 'x.mobileconfig', 'x.inetloc', 'x.settingcontent-ms', 'x.vhdx', 'x.xll'].every((n) => downloads.isDangerous(n)) && !downloads.isDangerous('notes.txt'));
  state.mode = 'lent';
  let d = await start('/gros.bin');
  await until(() => d.received > 0, 'premiers octets');
  check('pause depuis la Bibliothèque', await lib('dl:pause', d.id) === true && d.paused === true && downloads.internals.items.get(d.id).isPaused());
  await sleep(2600);
  check('en pause, le téléchargement ne se termine pas', d.state === 'progressing' && d.received < BIG.length);
  check('reprise après une pause', await lib('dl:resume', d.id) === 'resumed');
  await until(() => d.state === 'completed', 'téléchargement terminé', 20000);
  check('le fichier repris est complet et exact', fs.readFileSync(d.path).equals(BIG) && path.dirname(d.path) === dlDir && d.paused === false);
  fs.unlinkSync(d.path);

  d = await start('/gros.bin');
  await until(() => d.received > 0, 'premiers octets');
  check('annulation depuis la Bibliothèque', await lib('dl:cancel', d.id) === true);
  await until(() => d.state === 'cancelled', 'annulé');
  await until(() => !fs.existsSync(d.path), 'morceau retiré');
  check('téléchargement annulé : aucun fichier laissé', !fs.existsSync(d.path));

  // Connexion coupée en route : le téléchargement se reprend là où il s'est arrêté.
  state.mode = 'coupe';
  state.seen.length = 0;
  d = await start('/gros.bin');
  await until(() => d.stalled === true || d.state === 'interrupted', 'interruption', 40000).catch(() => { console.log('    (état :', d.state, d.received, state.seen.map((x) => x.range).join('|'), ')'); });
  check('connexion coupée : le téléchargement est « interrompu, reprise possible »', d.received > 0 && d.received < BIG.length && (d.canResume === true || d.state === 'interrupted'), { state: d.state, stalled: d.stalled, canResume: d.canResume });
  state.mode = 'vite';
  const how = await lib('dl:resume', d.id);
  await until(() => d.state === 'completed', 'reprise terminée', 20000);
  check('« Reprendre » demande la suite au serveur (Range) et le fichier est exact', fs.readFileSync(d.path).equals(BIG) && state.seen.some((x) => x.path === '/gros.bin' && /^bytes=[1-9]/.test(x.range)), { how, ranges: state.seen.map((x) => x.range) });
  fs.unlinkSync(d.path);

  // Interrompu par la fermeture d'Orbe : l'enregistrement et le morceau reçu suffisent.
  const partial = path.join(dlDir, 'reprise.bin');
  fs.writeFileSync(partial, BIG.subarray(0, 100000));
  const old = { id: 'ancien-' + Date.now(), name: 'reprise.bin', path: partial, url: A + '/gros.bin', total: BIG.length, received: 100000, state: 'interrupted', at: Date.now(), profile: 'default', canResume: true,
    resume: { urlChain: [A + '/gros.bin'], mimeType: 'application/octet-stream', eTag: '"orbe-gros-1"', lastModified: MODIFIED, startTime: Date.now() / 1000 } };
  store.state.downloads.unshift(old);
  state.seen.length = 0;
  const way = await lib('dl:resume', old.id);
  await until(() => old.state === 'completed', 'reprise après redémarrage', 20000);
  check('interrompu par la fermeture d’Orbe : repris depuis le morceau déjà reçu', way === 'continued' && fs.readFileSync(partial).equals(BIG) && state.seen.some((x) => x.range === 'bytes=100000-'), { way, ranges: state.seen.map((x) => x.range) });
  fs.unlinkSync(partial);
  // Morceau disparu : nouveau départ.
  const lost = { ...old, id: 'perdu-' + Date.now(), state: 'interrupted', path: path.join(dlDir, 'perdu.bin'), name: 'perdu.bin' };
  store.state.downloads.unshift(lost);
  const before = store.state.downloads.length;
  const known = new Set(store.state.downloads);
  check('morceau disparu : le téléchargement repart de zéro', await lib('dl:resume', lost.id) === 'restarted');
  d = await until(() => store.state.downloads.find((x) => !known.has(x)), 'nouveau téléchargement');
  await until(() => d.state === 'completed', 'terminé', 20000);
  check('l’ancienne ligne est remplacée par la nouvelle', !store.state.downloads.includes(lost) && store.state.downloads.length === before && fs.readFileSync(d.path).equals(BIG));
  fs.unlinkSync(d.path);

  // Fichier exécutable.
  d = await start('/installe.dmg');
  await until(() => d.state === 'completed', 'dmg téléchargé');
  check('fichier exécutable (.dmg) : signalé', d.danger === true && downloads.isDangerous('a.EXE') && downloads.isDangerous('x.command') && downloads.isDangerous('x.pkg') && !downloads.isDangerous('photo.jpg') && !downloads.isDangerous('doc.pdf'));
  agree = false;
  check('ouvrir un exécutable demande confirmation, en nommant sa provenance ; refus : rien n’est ouvert',
    await lib('dl:open', d.id) === false && opens.length === 0 && confirms.length === 1 && confirms[0].detail.includes('127.0.0.1') && confirms[0].defaultId === 1, confirms[0]);
  agree = true;
  check('confirmation donnée : le fichier est ouvert par le système', await lib('dl:open', d.id) === true && opens.join() === d.path);
  fs.unlinkSync(d.path);

  // PDF : affiché par la visionneuse ; téléchargé, il s'ouvre dans un onglet.
  const viewer = await open(A + '/vue.pdf');
  await until(() => viewer.wc.mainFrame.framesInSubtree.some((f) => f.url.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/')), 'visionneuse PDF', 20000);
  check('un PDF s’affiche dans la visionneuse de Chromium, sans téléchargement', viewer.wc.getURL() === A + '/vue.pdf' && !store.state.downloads.some((x) => x.url === A + '/vue.pdf'));
  count = Object.keys(w.data.tabs).length;
  store.state.settings.downloadOpenPdf = true;
  // Téléchargement lancé par la page à la suite d'un geste de l'utilisateur (lien cliqué).
  const startByUser = async (file) => { const known = new Set(store.state.downloads); await click(dl.wc); await js(dl.wc, `location.href = ${JSON.stringify(file)}; 1`, true); return until(() => store.state.downloads.find((x) => !known.has(x)), 'téléchargement lancé : ' + file); };
  // Annoncé « application/pdf », mais enregistré en .html : jamais ouvert dans un onglet.
  d = await startByUser('/piege');
  await until(() => d.state === 'completed', 'piège téléchargé');
  await sleep(400);
  check('fichier .html annoncé comme PDF : ni ouvert tout seul, ni ouvert dans un onglet à la demande', path.basename(d.path) === 'facture.html' && d.mime === 'application/pdf' && Object.keys(w.data.tabs).length === count && !downloads.isPdfFile(d.path)
    && await lib('dl:open', d.id) === true && Object.keys(w.data.tabs).length === count && opens[opens.length - 1] === d.path, { name: d.name, mime: d.mime });
  fs.unlinkSync(d.path);
  d = await startByUser('/faux.pdf');
  await until(() => d.state === 'completed', 'faux PDF téléchargé');
  await sleep(400);
  check('extension .pdf mais contenu qui n’en est pas un : pas ouvert dans un onglet', Object.keys(w.data.tabs).length === count && !downloads.isPdfFile(d.path));
  fs.unlinkSync(d.path);
  // Vrai PDF, mais téléchargement que personne n'a demandé : pas d'ouverture automatique.
  d = await start('/doc.pdf');
  await until(() => d.state === 'completed', 'pdf non demandé');
  await sleep(400);
  check('PDF téléchargé sans geste de l’utilisateur : pas ouvert tout seul', d.gesture === false && downloads.isPdfFile(d.path) && Object.keys(w.data.tabs).length === count, { gesture: d.gesture });
  fs.unlinkSync(d.path);
  const opensBefore = opens.length;
  d = await startByUser('/doc.pdf');
  await until(() => d.state === 'completed', 'pdf téléchargé');
  const pdfTab = await until(() => Object.values(w.data.tabs).find((x) => x.url.startsWith('file:') && x.url.endsWith('/document.pdf')), 'onglet du PDF');
  opened.push([w, pdfTab.id]);
  await until(() => rtOf(pdfTab.id) && rtOf(pdfTab.id).wc.mainFrame.framesInSubtree.some((f) => f.url.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/')), 'visionneuse sur le fichier', 20000);
  check('PDF téléchargé à la demande : ouvert dans un onglet, par la visionneuse intégrée', d.gesture === true && Object.keys(w.data.tabs).length === count + 1 && opens.length === opensBefore);
  // Exécutable ? Jugé au moment de l'ouvrir, sur le fichier tel qu'il est.
  const renamed = path.join(dlDir, 'renommé.command');
  fs.writeFileSync(renamed, 'echo');
  const sly = { id: 'rusé-' + Date.now(), name: 'notes.txt', path: renamed, url: A + '/note.txt', total: 4, received: 4, state: 'completed', at: Date.now() };
  store.state.downloads.unshift(sly);
  confirms.length = 0;
  agree = false;
  check('fichier devenu exécutable après coup : la confirmation est demandée à l’ouverture', await lib('dl:open', sly.id) === false && confirms.length === 1);
  store.state.downloads.shift();
  fs.unlinkSync(renamed);
  store.state.settings.downloadOpenPdf = false;
  const pdf1 = d.path;
  d = await startByUser('/doc.pdf');
  await until(() => d.state === 'completed', 'second pdf');
  await sleep(300);
  check('réglage coupé : le PDF téléchargé n’ouvre pas d’onglet', Object.keys(w.data.tabs).length === count + 1 && path.basename(d.path) === 'document (1).pdf');
  fs.unlinkSync(d.path);
  w.close(pdfTab.id, { ask: false });
  fs.unlinkSync(pdf1);

  // Dossier de destination et « toujours demander ».
  store.state.settings.downloadDir = custom;
  d = await start('/note.txt');
  await until(() => d.state === 'completed', 'note téléchargée');
  check('dossier des téléchargements choisi dans les réglages', d.path === path.join(custom, 'note.txt') && fs.readFileSync(d.path, 'utf8') === 'bonjour' && downloads.downloadDir(dl.wc.session) === custom);
  store.state.settings.downloadDir = path.join(custom, 'disparu');
  check('dossier choisi introuvable : retour au dossier Téléchargements', downloads.downloadDir(dl.wc.session) === dlDir);
  store.state.settings.downloadDir = '';
  store.state.settings.downloadAsk = true;
  const dialogs = [];
  const target = path.join(custom, 'renommée.txt');
  downloads.env.saveDialog = (parent, opts) => { dialogs.push(opts); return target; };
  d = await start('/note.txt');
  await until(() => d.state === 'completed', 'note enregistrée ailleurs');
  check('« Toujours demander où enregistrer » : la fenêtre propose le dossier habituel, le fichier va où on le dit', dialogs.length === 1 && dialogs[0].defaultPath === path.join(dlDir, 'note.txt') && d.path === target && fs.existsSync(target));
  downloads.env.saveDialog = (parent, opts) => { dialogs.push(opts); return undefined; };
  const lengthBefore = store.state.downloads.length;
  // Sans geste, pas de seconde fenêtre d'enregistrement coup sur coup (elles bloquent l'application).
  dl.wc.downloadURL(A + '/note.txt');
  await sleep(700);
  check('« toujours demander » : une page ne peut pas enchaîner les fenêtres d’enregistrement', dialogs.length === 1 && store.state.downloads.length === lengthBefore);
  downloads.internals.asked.clear();
  dl.wc.downloadURL(A + '/note.txt');
  await until(() => dialogs.length === 2, 'fenêtre d’enregistrement');
  await sleep(400);
  check('enregistrement annulé : aucun téléchargement', store.state.downloads.length === lengthBefore && !fs.existsSync(path.join(dlDir, 'note.txt')));
  store.state.settings.downloadAsk = false;
  // Un seul réglage de dossier (fenêtre des réglages, prefs.js) : celui du profil prime sur le général.
  const prefs = require('../src/main/prefs');
  const own = path.join(custom, 'profil');
  fs.mkdirSync(own);
  store.state.settings.downloadDir = custom;
  prefs.setForProfile('default', 'downloadDir', own);
  d = await start('/note.txt');
  await until(() => d.state === 'completed', 'note dans le dossier du profil');
  check('dossier propre au profil : il prime sur le dossier général, et la navigation privée garde celui du système', d.path === path.join(own, 'note.txt') && downloads.downloadDir(dl.wc.session) === own && downloads.downloadDir(require('electron').session.fromPartition('incognito-essai-dossier')) === dlDir);
  prefs.setForProfile('default', 'downloadDir', null);
  store.state.settings.downloadDir = '';
  check('réglages « demander où enregistrer » et « PDF dans un onglet » : validés comme les autres (prefs.SETTABLE)', prefs.SETTABLE.downloadAsk(true) && !prefs.SETTABLE.downloadAsk('oui') && prefs.SETTABLE.downloadOpenPdf(false) && !prefs.SETTABLE.downloadOpenPdf(1));
  // La Bibliothèque montre l'état et les boutons.
  store.state.downloads.unshift({ id: 'vue-1', name: 'calé.bin', path: path.join(dlDir, 'calé.bin'), url: A + '/gros.bin', total: 1000, received: 400, state: 'interrupted', canResume: true, at: Date.now() });
  const libTab = w.openInternal('library.html#downloads');
  const libWc = () => rtOf(libTab.id).wc;
  await until(() => libWc().executeJavaScript('document.querySelectorAll("#list .line").length > 0'), 'liste des téléchargements');
  const firstLine = await libWc().executeJavaScript('(() => { const l = document.querySelector("#list .line"); return { state: l.dataset.state, sub: l.querySelector(".sub").textContent, buttons: [...l.querySelectorAll("button")].map((b) => b.dataset.do) }; })()');
  check('Bibliothèque : un téléchargement interrompu affiche où il en est et propose « Reprendre » (et son menu « ··· »)', firstLine.state === 'interrupted' && firstLine.sub.includes(t('lib.failed')) && firstLine.sub.includes('40 %') && firstLine.buttons.join() === 'resume,menu', firstLine);
  store.state.downloads.shift();
  w.close(libTab.id, { ask: false });

  // ---------------------------------------------------------------- Ménage
  for (const [owner, id] of opened) if (owner === w && w.data.tabs[id]) w.close(id, { silent: true, ask: false });
  w.undoStack.length = 0;
  for (const key of [A, B]) delete store.state.permissions[key];
  delete store.state.profilePermissions;
  permissions.internals.display.blocked = 0;
  store.state.downloads = store.state.downloads.filter((x) => !String(x.url).startsWith(A));
  Object.assign(store.state.settings, { downloadAsk: saved.settings.downloadAsk, downloadDir: saved.settings.downloadDir, downloadOpenPdf: saved.settings.downloadOpenPdf });
  unload.env.ask = saved.ask;
  permissions.env.confirm = saved.confirm;
  permissions.env.openExternal = saved.openExternal;
  Object.assign(downloads.env, saved.dl);
  try { fs.rmSync(custom, { recursive: true, force: true }); } catch {}
  w.layout();
  OrbeWindow.pushAll();
  server.closeAllConnections();
  tls.closeAllConnections();
  server.close();
  tls.close();
  if (standalone) {
    console.log(`\n${total - failed}/${total} vérifications réussies\n`);
    if (failed) throw new Error(`${failed} vérification(s) en échec`);
  }
};
