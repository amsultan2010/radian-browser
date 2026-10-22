// Couche d'API chrome.* (src/main/ext-api.js, src/preload/ext.js) : essai de
// bout en bout dans le vrai navigateur, sans réseau, avec l'extension
// tests/ext-fixture et un petit serveur local.
//   npm run test:ext      (ou : ORBE_SCENARIO=tests/ext-api.js node scripts/dev.js --selftest)
const http = require('http');
const path = require('path');
const { BrowserWindow } = require('electron');

const { sleep, until, profilPret } = require('./outils');

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const name = url.pathname.slice(1) || 'accueil';
    // Page de connexion d'un service tiers : renvoie vers l'adresse de retour
    // de l'extension, par redirection HTTP (/auth) ou par script (/authjs).
    if (name === 'auth') { res.statusCode = 302; res.setHeader('location', url.searchParams.get('to')); res.end(); return; }
    if (name === 'authjs') { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(`<!doctype html><title>Connexion</title><script>location.href = ${JSON.stringify(url.searchParams.get('to'))};</script>`); return; }
    if (name === 'fichier.txt') { res.setHeader('content-type', 'text/plain'); res.setHeader('content-disposition', 'attachment; filename="fichier.txt"'); res.end('bonjour'); return; }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta charset="utf-8"><title>Page ${name}</title><body><h1>${name}</h1><a id="lien" href="/autre">lien</a></body>`);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

module.exports = async function extApiTest({ first: w, OrbeWindow, win, extApi, extHost }) {
  const results = [];
  let failed = 0;
  const check = (name, ok, detail = '') => {
    results.push(name);
    if (!ok) failed += 1;
    console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))}`);
  };
  // Une exception non rattrapée ferait apparaître une boîte d'erreur bloquante.
  const uncaught = [];
  process.on('uncaughtException', (err) => { uncaught.push(String((err && err.stack) || err)); });
  console.log('\nOrbe — API des extensions\n');

  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const ses = w.session;
  const swLogs = [];
  ses.serviceWorkers.on('console-message', (e, d) => swLogs.push(d.message));
  // Pas de boîte de dialogue pendant l'essai : la demande est notée, puis acceptée.
  const asked = [];
  extApi.host.confirmPermissions = async (ext, names) => { asked.push(names.join(',')); return true; };

  const ext = await ses.extensions.loadExtension(path.join(__dirname, 'ext-fixture'));
  // Ouvert après le chargement de l'extension : son script de contenu s'y exécute.
  await profilPret(w);
  const a = w.newTab(base + '/a');
  await until(() => w.data.tabs[a.id].title === 'Page a', 'page a');
  const rtA = win.live.get(a.id);
  // Juste après le chargement de l'extension, Chromium peut ne pas avoir encore
  // transmis ses scripts de contenu au nouveau processus : on recharge alors la page.
  for (let i = 0; i < 4; i++) {
    if (await until(() => rtA.wc.executeJavaScript('!!document.documentElement.dataset.orbeTab'), 'script de contenu', 1500).catch(() => false)) break;
    rtA.wc.reload();
  }
  // Page d'extension pilotée par le test : ni onglet, ni fenêtre surgissante.
  const pilot = new BrowserWindow({ show: false, webPreferences: { session: ses, sandbox: true, contextIsolation: true } });
  await pilot.loadURL(ext.url + 'options.html');
  const page = (js) => pilot.webContents.executeJavaScript(js);
  const sw = (msg) => page(`sw(${JSON.stringify(msg)})`);
  const call = async (p, ...args) => {
    const r = await sw({ type: 'call', path: p, args });
    if (!r || r.error) throw new Error((r && r.error) || 'sans réponse');
    return r.value;
  };
  const events = async (name) => (await sw({ type: 'log' })).filter((e) => e.name === name);

  // Motifs d'URL et couleurs (fonctions pures)
  const mp = extApi.matchPattern;
  check('motifs d’URL de Chrome', mp('<all_urls>', 'https://a.fr/x') && !mp('<all_urls>', 'chrome://settings/') && mp('*://*.exemple.fr/*', 'http://www.exemple.fr/a?b=1') && mp('*://*.exemple.fr/*', 'https://exemple.fr/')
    && !mp('*://*.exemple.fr/*', 'https://mauvaisexemple.fr/') && !mp('https://exemple.fr/*', 'http://exemple.fr/') && mp('https://exemple.fr/a/*', 'https://exemple.fr/a/b') && !mp('https://exemple.fr/a/*', 'https://exemple.fr/b')
    && mp('http://127.0.0.1/*', 'http://127.0.0.1:8080/x') && !mp('*://*/*', 'file:///etc/hosts') && !mp('n’importe quoi', 'https://a.fr/'));
  check('couleurs de pastille', extApi.parseColor('#f00').join() === '255,0,0,255' && extApi.parseColor([1, 2, 3]).join() === '1,2,3,255' && extApi.parseColor('rgba(0, 128, 255, 0.5)').join() === '0,128,255,128' && extApi.parseColor('#11223344').join() === '17,34,51,68');

  // Mise en place
  const early = await until(() => sw({ type: 'early' }), 'service worker');
  check('le service worker voit les API ajoutées dès sa première ligne', early.permissions === 'object' && early.onRemoved === 'function' && early.windows === 'object' && early.cookies === 'object', early);
  check('`browser`, quand Chromium le fournit, est complété comme `chrome`', early.browser === 'absent' || early.browser === 'function', early.browser);
  check('les pages d’extension les voient aussi', await page('typeof chrome.permissions.contains === "function" && typeof chrome.windows.getAll === "function" && typeof chrome.cookies.get === "function"'));
  check('une API non déclarée reste absente (notifications)', await page('typeof chrome.notifications === "undefined"'));

  // permissions
  const all = await call('permissions.getAll');
  check('permissions.getAll reprend le manifeste', all.permissions.includes('tabs') && all.permissions.includes('cookies') && !all.permissions.includes('contextMenus') && all.origins.includes('http://127.0.0.1/*'), all);
  check('permissions.contains : requise oui, optionnelle non', await call('permissions.contains', { permissions: ['tabs'] }) === true && await call('permissions.contains', { permissions: ['contextMenus'] }) === false);
  check('une API optionnelle non accordée est refusée', await call('contextMenus.removeAll').then(() => false, (e) => /contextMenus/.test(e.message)));
  check('permissions.request refuse ce qui n’est pas au manifeste', await call('permissions.request', { permissions: ['history'] }).then(() => false, () => true));
  check('permissions.request refuse une origine hors manifeste', await call('permissions.request', { origins: ['https://exemple.fr/*'] }) === false);
  check('permissions.request demande, puis accorde', await call('permissions.request', { permissions: ['contextMenus'] }) === true && asked.join() === 'contextMenus' && await call('permissions.contains', { permissions: ['contextMenus'] }) === true);
  await until(async () => (await events('permissions.onAdded')).length === 1, 'permissions.onAdded');
  check('permissions.onAdded est émis', true);

  // tabs
  let tabs = await call('tabs.query', {});
  check('tabs.query liste les onglets d’Orbe, avec l’identifiant du webContents', tabs.length === 1 && tabs[0].id === rtA.wc.id && tabs[0].url === base + '/a' && tabs[0].title === 'Page a' && tabs[0].windowId === w.win.id, tabs);
  let active = await call('tabs.query', { active: true, currentWindow: true });
  check('tabs.query({ active, currentWindow }) donne l’onglet actif d’Orbe', active.length === 1 && active[0].id === rtA.wc.id && active[0].active === true);
  check('l’identifiant d’onglet est celui qu’Electron attend (tabs.sendMessage natif)', await call('tabs.sendMessage', rtA.wc.id, 'titre') === 'Page a');
  check('le script de contenu reçoit le même identifiant (sender.tab.id)', await until(() => rtA.wc.executeJavaScript('document.documentElement.dataset.orbeTab'), 'script de contenu') === String(rtA.wc.id));

  const created = await call('tabs.create', { url: base + '/b' });
  const bId = Object.keys(w.data.tabs).find((id) => win.live.get(id) && win.live.get(id).wc.id === created.id);
  check('tabs.create ouvre un onglet actif dans Orbe', !!bId && w.activeId === bId && created.active === true && created.windowId === w.win.id, created);
  await until(() => w.data.tabs[bId].title === 'Page b', 'page b');
  await until(async () => (await events('tabs.onUpdated')).some((e) => e.args[0] === created.id && e.args[1].status === 'complete'), 'tabs.onUpdated');
  const upd = (await events('tabs.onUpdated')).filter((e) => e.args[0] === created.id);
  check('tabs.onCreated, onActivated et onUpdated sont émis', (await events('tabs.onCreated')).some((e) => e.args[0].id === created.id) && (await events('tabs.onActivated')).some((e) => e.args[0].tabId === created.id)
    && upd.some((e) => e.args[1].url === base + '/b') && upd.some((e) => e.args[1].title === 'Page b') && upd.every((e) => e.args[2].id === created.id), upd.map((e) => e.args[1]));
  check('webNavigation.onCommitted et onCompleted suivent la page', (await events('webNavigation.onCommitted')).some((e) => e.args[0].tabId === created.id && e.args[0].url === base + '/b' && e.args[0].frameId === 0)
    && (await events('webNavigation.onCompleted')).some((e) => e.args[0].tabId === created.id));
  const bg = await call('tabs.create', { url: base + '/c', active: false });
  check('tabs.create({ active: false }) n’active pas l’onglet', w.activeId === bId && bg.active === false);
  check('tabs.get et tabs.query({ url })', (await call('tabs.get', bg.id)).id === bg.id && (await call('tabs.query', { url: base + '/c*' })).length === 1 && (await call('tabs.query', { url: 'https://*/*' })).length === 0);
  await call('tabs.update', rtA.wc.id, { active: true });
  check('tabs.update({ active }) change d’onglet', w.activeId === a.id);
  await call('tabs.update', bg.id, { url: base + '/d' });
  await until(async () => (await call('tabs.get', bg.id)).title === 'Page d', 'tabs.update url');
  check('tabs.update({ url }) navigue', true);
  check('tabs.update sans identifiant vise l’onglet actif', (await call('tabs.update', { muted: true })).id === rtA.wc.id && rtA.wc.isAudioMuted());
  rtA.wc.setAudioMuted(false);
  check('tabs.create refuse file: et les pages d’Orbe', await call('tabs.create', { url: 'file:///etc/hosts' }).then(() => false, () => true) && await call('tabs.create', { url: 'orbe://app/settings.html' }).then(() => false, () => true));
  await call('tabs.remove', [bg.id]);
  check('tabs.remove ferme l’onglet', (await call('tabs.query', {})).length === 2 && !Object.keys(w.data.tabs).some((id) => win.live.get(id) && win.live.get(id).wc.id === bg.id));
  await until(async () => (await events('tabs.onRemoved')).some((e) => e.args[0] === bg.id), 'tabs.onRemoved');
  check('tabs.onRemoved est émis', true);
  const failedGet = await sw({ type: 'callback', path: 'tabs.get', args: [987654] });
  check('appel avec rappel : erreur dans runtime.lastError', failedGet.value === undefined && /987654/.test(failedGet.lastError || ''), failedGet);
  const okGet = await sw({ type: 'callback', path: 'tabs.get', args: [rtA.wc.id] });
  check('appel avec rappel : résultat', okGet.value && okGet.value.id === rtA.wc.id && okGet.lastError === null);
  const nativeErr = await sw({ type: 'callback', path: 'tabs.sendMessage', args: [987654, 'x'] });
  check('runtime.lastError d’Electron reste lisible', typeof nativeErr.lastError === 'string' && nativeErr.lastError.length > 0, nativeErr);
  // Écran éteint ou fenêtre masquée : Chromium ne peut rien capturer, ce n'est pas la couche d'API.
  const shot = await call('tabs.captureVisibleTab').catch((err) => err);
  if (shot instanceof Error && /Viz|capture/i.test(shot.message)) console.log('  – tabs.captureVisibleTab non vérifié : ' + shot.message);
  else check('tabs.captureVisibleTab rend une image', /^data:image\/jpeg;base64,.{100,}/.test(shot), String(shot).slice(0, 80));

  // windows
  const cur = await call('windows.getCurrent', { populate: true });
  check('windows.getCurrent décrit la fenêtre d’Orbe', cur.id === w.win.id && cur.type === 'normal' && cur.tabs.length === 2 && cur.width > 0, cur);
  check('windows.getAll et getLastFocused', (await call('windows.getAll')).length === OrbeWindow.all.length && (await call('windows.getLastFocused')).id === w.win.id);

  // cookies
  await call('cookies.set', { url: base + '/', name: 'orbe', value: 'bonjour', expirationDate: Math.floor(Date.now() / 1000) + 3600 });
  const cookie = await call('cookies.get', { url: base + '/', name: 'orbe' });
  check('cookies.set puis cookies.get', cookie && cookie.value === 'bonjour' && cookie.domain === '127.0.0.1' && cookie.session === false, cookie);
  check('le cookie est bien dans la session du profil', (await ses.cookies.get({ url: base + '/', name: 'orbe' })).length === 1);
  check('cookies.getAll filtre par nom', (await call('cookies.getAll', { name: 'orbe' })).length === 1);
  check('cookies.get refuse un site hors des autorisations', await call('cookies.get', { url: 'https://exemple.fr/', name: 'x' }).then(() => false, () => true));
  await ses.cookies.set({ url: 'https://exemple.fr/', name: 'secret', value: '1' });
  check('cookies.getAll ne rend que les sites autorisés', !(await call('cookies.getAll', {})).some((c) => c.name === 'secret'));
  await call('cookies.remove', { url: base + '/', name: 'orbe' });
  check('cookies.remove', await call('cookies.get', { url: base + '/', name: 'orbe' }) === null);
  await until(async () => (await events('cookies.onChanged')).some((e) => e.args[0].removed && e.args[0].cookie.name === 'orbe'), 'cookies.onChanged');
  check('cookies.onChanged est émis, sans les cookies des autres sites', !(await events('cookies.onChanged')).some((e) => e.args[0].cookie.name === 'secret'));

  // contextMenus
  await call('contextMenus.create', { id: 'm1', title: 'Chercher « %s »', contexts: ['selection'] });
  await call('contextMenus.create', { id: 'm2', title: 'Sur la page', contexts: ['page'] });
  await call('contextMenus.create', { id: 'm3', title: 'Coché', type: 'checkbox', contexts: ['all'] });
  let menu = extApi.contextMenuItems(rtA.wc, { pageURL: base + '/a', selectionText: 'orbe' });
  check('contextMenus : éléments regroupés sous le nom de l’extension', menu.length === 1 && menu[0].label === ext.name && menu[0].submenu.map((m) => m.label).join('|') === 'Chercher « orbe »|Coché', menu);
  menu = extApi.contextMenuItems(rtA.wc, { pageURL: base + '/a' });
  check('contextMenus : le contexte choisit les éléments', menu[0].submenu.map((m) => m.label).join('|') === 'Sur la page|Coché');
  menu[0].submenu[1].click();
  await until(async () => (await events('contextMenus.onClicked')).length === 1, 'contextMenus.onClicked');
  const clicked = (await events('contextMenus.onClicked'))[0].args;
  check('contextMenus.onClicked reçoit l’élément et l’onglet', clicked[0].menuItemId === 'm3' && clicked[0].checked === true && clicked[0].pageUrl === base + '/a' && clicked[1].id === rtA.wc.id, clicked);
  await call('contextMenus.update', 'm2', { title: 'Renommé' });
  await call('contextMenus.remove', 'm1');
  check('contextMenus.update et remove', extApi.contextMenuItems(rtA.wc, { pageURL: base + '/a' })[0].submenu.map((m) => m.label).join('|') === 'Renommé|Coché');
  let tpl = null;
  const popupMenu = w.popup;
  w.popup = (t) => { tpl = t; };
  w.pageMenu(rtA, { pageURL: base + '/a', x: 5, y: 5 });
  w.popup = popupMenu;
  check('le menu contextuel d’Orbe contient ceux de l’extension', !!tpl && tpl.some((i) => i.label === ext.name && i.submenu.length === 2));
  await call('contextMenus.removeAll');
  check('contextMenus.removeAll', extApi.contextMenuItems(rtA.wc, { pageURL: base + '/a' }).length === 0);
  check('permissions.remove retire l’API optionnelle', await call('permissions.remove', { permissions: ['contextMenus'] }) === true && await call('permissions.contains', { permissions: ['contextMenus'] }) === false);
  await until(async () => (await events('permissions.onRemoved')).length === 1, 'permissions.onRemoved');
  check('permissions.onRemoved est émis', true);

  // action et fenêtre surgissante
  await call('action.setBadgeText', { text: '7' });
  await call('action.setBadgeBackgroundColor', { color: '#ff0000' });
  await call('action.setBadgeText', { text: '9', tabId: created.id });
  await call('action.setTitle', { title: 'Titre changé' });
  let info = extHost.actionsFor(w).find((x) => x.id === ext.id);
  check('action : pastille, couleur et titre lus par Orbe', info && info.badgeText === '7' && info.badgeColor === 'rgba(255, 0, 0, 1.000)' && info.title === 'Titre changé' && info.popup === ext.url + 'popup.html' && info.enabled, info);
  check('action : valeur propre à un onglet', await call('action.getBadgeText', { tabId: created.id }) === '9' && await call('action.getBadgeText', {}) === '7' && extApi.actionInfo(ses, ext.id, created.id).badgeText === '9');
  check('action.getBadgeBackgroundColor rend [r, v, b, a]', (await call('action.getBadgeBackgroundColor', {})).join() === '255,0,0,255');

  const pop = extHost.openPopup(w, ext.id, { x: 240, y: 60 }, { keepOpen: true });
  check('openPopup ouvre une fenêtre sur la page de l’extension', pop instanceof BrowserWindow);
  const seen = await until(() => pop.webContents.executeJavaScript('window.activeTab'), 'onglet actif vu par la fenêtre surgissante');
  check('la fenêtre surgissante trouve l’onglet actif d’Orbe', seen.id === rtA.wc.id && seen.url === base + '/a' && seen.title === 'Page a', seen);
  check('…et n’apparaît pas elle-même parmi les onglets', (await pop.webContents.executeJavaScript('call("tabs.query", {})')).every((t) => t.id !== pop.webContents.id) && await pop.webContents.executeJavaScript('call("tabs.getCurrent")') === undefined);
  await until(() => pop.getContentSize()[0] === 300 && pop.getContentSize()[1] === 180, 'taille de la fenêtre surgissante').then(() => check('elle prend la taille de son contenu (300 × 180)', true), () => check('elle prend la taille de son contenu (300 × 180)', false, pop.getContentSize().join('×')));
  const wb = w.win.getContentBounds();
  check('elle est ancrée dans la fenêtre d’Orbe', pop.getBounds().x === wb.x + 240 && pop.getBounds().y === wb.y + 60 && pop.getParentWindow() === w.win, pop.getBounds());
  check('le service worker voit la même fenêtre courante pendant ce temps', (await call('tabs.query', { active: true, lastFocusedWindow: true }))[0].id === rtA.wc.id);
  extHost.closePopup(w);
  await until(() => pop.isDestroyed(), 'fermeture de la fenêtre surgissante');
  check('closePopup la referme', extHost.popups.size === 0);

  await call('action.setPopup', { popup: '' });
  check('sans fenêtre surgissante, le clic émet action.onClicked', extHost.openPopup(w, ext.id) === true);
  await until(async () => (await events('action.onClicked')).length === 1, 'action.onClicked');
  check('action.onClicked reçoit l’onglet actif', (await events('action.onClicked'))[0].args[0].id === rtA.wc.id);

  // Fenêtre d'Orbe fermée alors que la fenêtre surgissante est ouverte.
  await call('action.setPopup', { popup: 'popup.html' });
  const w2 = new OrbeWindow();
  await until(() => w2.win.isVisible(), 'seconde fenêtre');
  const pop2 = extHost.openPopup(w2, ext.id, null, { keepOpen: true });
  await until(() => pop2.webContents.executeJavaScript('document.readyState === "complete"'), 'seconde fenêtre surgissante');
  w2.win.close();
  await until(() => pop2.isDestroyed() && OrbeWindow.all.length === 1, 'fermeture de la seconde fenêtre');
  await sleep(300);
  check('fermer la fenêtre d’Orbe ferme sa fenêtre surgissante, sans erreur', extHost.popups.size === 0 && uncaught.length === 0, uncaught.join(' | '));
  await until(async () => (await call('windows.getAll')).length === 1, 'windows.getAll');
  w.win.focus();

  // Panneau latéral (chrome.sidePanel) : une vue à droite des pages, qui rétrécissent.
  const panel = extHost.panel;
  const PW = () => panel.widthIn(w);
  const r0 = w.contentRect();
  const viewA = () => rtA.view.getBounds();
  const inWindow = (view) => w.win.contentView.children.includes(view);
  const options0 = await call('sidePanel.getOptions', {});
  check('sidePanel : API présentes, réglages tirés du manifeste', await page('typeof chrome.sidePanel.open === "function" && typeof chrome.sidePanel.onOpened.addListener === "function"') && options0.enabled === true && options0.path === 'panel.html', options0);
  await call('sidePanel.open', { windowId: w.win.id });
  const shown = panel.shownIn(w);
  check('sidePanel.open ouvre la page de l’extension dans une vue de la fenêtre', !!shown && shown.url === ext.url + 'panel.html' && shown.wc.session === ses && inWindow(shown.view));
  const r1 = w.contentRect();
  const [winW] = w.win.getContentSize();
  check('la zone des pages rétrécit de la largeur du panneau', r1.width === r0.width - PW() - panel.GAP && r1.x === r0.x && viewA().width === r1.width, { avant: r0, apres: r1, page: viewA() });
  const pb = shown.view.getBounds();
  check('le panneau est posé à droite des pages, sous son en-tête', pb.x === r1.x + r1.width + panel.GAP && pb.x + pb.width === winW - panel.PAD && pb.y === r1.y + panel.HEADER && pb.y + pb.height === r1.y + r1.height, pb);
  const seenP = await until(() => shown.wc.executeJavaScript('window.activeTab'), 'onglet actif vu par le panneau');
  check('la page du panneau trouve l’onglet actif d’Orbe, sans être elle-même un onglet', seenP.id === rtA.wc.id && seenP.url === base + '/a' && await shown.wc.executeJavaScript('call("tabs.getCurrent")') === undefined, seenP);
  check('…et dialogue avec la page (tabs.sendMessage)', await shown.wc.executeJavaScript(`call("tabs.sendMessage", ${rtA.wc.id}, "titre")`) === 'Page a');
  await until(() => shown.wc.executeJavaScript('document.readyState === "complete" && Array.isArray(window.received)'), 'panneau chargé');
  await sw({ type: 'call', path: 'runtime.sendMessage', args: [{ type: 'diffusion', texte: 'bonjour' }] });
  await call('storage.sync.set', { diffusion: 'oui' });
  const heard = await until(() => shown.wc.executeJavaScript('window.received.length >= 2 && window.received'), 'messages reçus par le panneau', 4000).catch(() => shown.wc.executeJavaScript('window.received'));
  check('le panneau reçoit les messages et les changements de stockage du service worker', heard.includes('message:bonjour') && heard.includes('stockage:sync:oui'), heard);
  await call('storage.sync.remove', 'diffusion');
  const ctxs = await call('runtime.getContexts', { contextTypes: ['SIDE_PANEL'] });
  check('runtime.getContexts connaît le panneau (SIDE_PANEL)', ctxs.length === 1 && ctxs[0].documentUrl === ext.url + 'panel.html' && ctxs[0].windowId === w.win.id, ctxs);
  await until(async () => (await events('sidePanel.onOpened')).length === 1, 'sidePanel.onOpened');
  check('sidePanel.onOpened est émis', (await events('sidePanel.onOpened'))[0].args[0].windowId === w.win.id);

  // En-tête d'Orbe : nom, largeur réglable à la souris, fermeture.
  const head = panel.records.get(w).chrome;
  const headTitle = await until(() => head.webContents.executeJavaScript('document.getElementById("title").textContent'), 'en-tête du panneau');
  check('l’en-tête d’Orbe nomme l’extension', headTitle === ext.name && head.getBounds().x === pb.x - panel.GAP && head.getBounds().y === r1.y, headTitle);
  const cb = w.win.getContentBounds();
  await head.webContents.executeJavaScript(`orbePanel.send('resize', { screenX: ${cb.x + cb.width - panel.PAD - 320} }); orbePanel.send('resizeEnd')`);
  await until(() => PW() === 320, 'largeur du panneau');
  check('tirer le bord gauche règle la largeur (320)', w.contentRect().width === r0.width - 328 && shown.view.getBounds().width === 320 && viewA().width === r0.width - 328, shown.view.getBounds());
  panel.setWidth(w, 40);
  check('la largeur est bornée (260 au moins)', PW() === 260 && w.contentRect().width === r0.width - 268);
  panel.setWidth(w, 300);
  await sleep(400);
  const savedUi = JSON.parse(require('fs').readFileSync(path.join(require('electron').app.getPath('userData'), 'Extensions', 'api-state.json'), 'utf8'))._ui;
  check('…et retenue sur le disque', !!savedUi && savedUi.panelWidth === 300, savedUi);

  // Page propre à un onglet : elle remplace le panneau global sur cet onglet.
  await call('sidePanel.setOptions', { tabId: created.id, path: 'panel.html?onglet=1' });
  const optionsB = await call('sidePanel.getOptions', { tabId: created.id });
  check('sidePanel.setOptions : réglage propre à un onglet', optionsB.path === 'panel.html?onglet=1' && optionsB.tabId === created.id && (await call('sidePanel.getOptions', { tabId: rtA.wc.id })).path === 'panel.html', optionsB);
  w.activate(bId);
  await until(() => panel.shownIn(w) && panel.shownIn(w).url === ext.url + 'panel.html?onglet=1', 'panneau propre à l’onglet');
  check('panneau global ouvert : l’onglet qui a sa propre page la montre', panel.shownIn(w).tabId === created.id && w.contentRect().width === r0.width - 308 && !inWindow(shown.view));
  w.activate(a.id);
  await until(() => panel.shownIn(w) === shown, 'retour au panneau global');
  check('…et les autres onglets gardent le panneau global', !shown.wc.isDestroyed() && inWindow(shown.view));
  await head.webContents.executeJavaScript('document.getElementById("close").click()');
  await until(() => !panel.shownIn(w) && shown.wc.isDestroyed(), 'fermeture du panneau');
  check('le bouton de fermeture referme le panneau et rend la place aux pages', w.contentRect().width === r0.width && viewA().width === r0.width && shown.wc.isDestroyed() && !inWindow(head) && panel.records.get(w).tabs.size === 0);
  await until(async () => (await events('sidePanel.onClosed')).length >= 1, 'sidePanel.onClosed');
  check('sidePanel.onClosed est émis', true);

  await call('sidePanel.open', { tabId: created.id });
  check('sidePanel.open({ tabId }) : rien sur un autre onglet', !panel.shownIn(w) && w.contentRect().width === r0.width);
  w.activate(bId);
  await until(() => panel.shownIn(w), 'panneau de l’onglet');
  check('…le panneau apparaît sur son onglet', panel.shownIn(w).tabId === created.id && panel.shownIn(w).url.endsWith('?onglet=1') && w.contentRect().width === r0.width - 308);
  w.activate(a.id);
  await until(() => !panel.shownIn(w), 'panneau masqué');
  check('…et disparaît quand on le quitte', w.contentRect().width === r0.width && viewA().width === r0.width);
  await call('sidePanel.setOptions', { tabId: created.id, enabled: false });
  w.activate(bId);
  await sleep(200);
  check('setOptions({ enabled: false }) ferme le panneau', !panel.shownIn(w) && panel.records.get(w).tabs.size === 0);
  check('sidePanel.open refuse un panneau désactivé', await call('sidePanel.open', { tabId: created.id }).then(() => false, (e) => /No active side panel/.test(e.message)));
  check('setOptions refuse une page hors de l’extension', await call('sidePanel.setOptions', { path: 'https://exemple.fr/' }).then(() => false, () => true));
  w.activate(a.id);
  await sleep(100);

  await call('sidePanel.setPanelBehavior', { openPanelOnActionClick: true });
  check('setPanelBehavior et getPanelBehavior', (await call('sidePanel.getPanelBehavior')).openPanelOnActionClick === true);
  check('openPanelOnActionClick : le bouton ouvre le panneau, pas la fenêtre surgissante', extHost.openPopup(w, ext.id) === true && !!panel.shownIn(w) && extHost.popups.size === 0 && w.contentRect().width === r0.width - 308);
  check('second clic : le panneau se referme', extHost.openPopup(w, ext.id) === true && !panel.shownIn(w) && w.contentRect().width === r0.width);
  await call('sidePanel.setPanelBehavior', { openPanelOnActionClick: false });
  await call('sidePanel.open', { windowId: w.win.id });
  const closing = panel.shownIn(w);
  await until(() => closing.wc.executeJavaScript('document.readyState === "complete"'), 'panneau chargé');
  closing.wc.executeJavaScript('window.close()').catch(() => {});
  check('window.close() dans le panneau le referme', await until(() => !panel.shownIn(w) && w.contentRect().width === r0.width, 'window.close()', 4000).catch(() => false));
  await call('sidePanel.open', { windowId: w.win.id });
  await call('sidePanel.close', { windowId: w.win.id });
  check('sidePanel.close', !panel.shownIn(w) && w.contentRect().width === r0.width);

  // Une extension qui ne déclare pas ces autorisations n'obtient rien.
  // Copiée dans le profil d'essai : Orbe en modifiera le manifeste (« activeTab »).
  const bareDir = path.join(require('electron').app.getPath('userData'), 'ext-fixture-sans');
  require('fs').cpSync(path.join(__dirname, 'ext-fixture-sans'), bareDir, { recursive: true });
  let bare = await ses.extensions.loadExtension(bareDir);
  const barePage = new BrowserWindow({ show: false, webPreferences: { session: ses, sandbox: true, contextIsolation: true } });
  await barePage.loadURL(bare.url + 'page.html');
  check('sans l’autorisation, ni sidePanel ni debugger ni identity ni tabGroups n’existent', await barePage.webContents.executeJavaScript('typeof chrome.permissions === "object" && typeof chrome.sidePanel === "undefined" && typeof chrome.debugger === "undefined" && typeof chrome.identity === "undefined" && typeof chrome.tabGroups === "undefined"'));
  const refused = await Promise.all([['sidePanel.open', [{ windowId: w.win.id }]], ['debugger.attach', [{ tabId: rtA.wc.id }, '1.3']], ['identity.launchWebAuthFlow', [{ url: base + '/auth' }]], ['tabGroups.query', [{}]], ['downloads.download', [{ url: base + '/fichier.txt' }]]].map(([n, args]) => extApi.call(ses, bare.id, n, args)));
  check('…et un appel forcé est refusé par le processus principal', refused.every((r) => /autorisation/.test(r.error || '')) && !panel.shownIn(w) && extHost.debug.sessions.size === 0, refused);

  // « activeTab » : l'extension n'a accès à aucun site ; un clic sur son bouton
  // lui ouvre l'onglet en cours, après accord de l'utilisateur (ext-access.js).
  const access = extHost.access;
  const bareSw = (msg) => barePage.webContents.executeJavaScript(`chrome.runtime.sendMessage(${JSON.stringify(msg)})`);
  check('avant le clic, l’injection est refusée (aucun accès aux sites)', access.needed(ses, bare.id) && (await bareSw({ type: 'marquer', tabId: rtA.wc.id })).some((r) => /^refus/.test(r)) && await rtA.wc.executeJavaScript('document.documentElement.dataset.marque') === undefined, await bareSw({ type: 'resultats' }));
  asked.length = 0;
  check('premier clic : Orbe demande l’accord de l’utilisateur', extHost.openPopup(w, bare.id) === true);
  await until(() => access.widened(bare.id) && ses.extensions.getExtension(bare.id) && !access.needed(ses, bare.id), 'accès accordé, extension rechargée');
  await until(() => rtA.wc.executeJavaScript('document.documentElement.dataset.marque === "oui"'), 'page marquée');
  const bareManifest = JSON.parse(require('fs').readFileSync(path.join(bareDir, 'manifest.json'), 'utf8'));
  check('…puis le clic aboutit : le script de l’extension s’exécute dans l’onglet', asked.length === 1 && bareManifest.host_permissions.includes('<all_urls>'), { asked, hosts: bareManifest.host_permissions });
  await barePage.loadURL(bare.url + 'page.html');
  const bareAll = await extApi.call(ses, bare.id, 'permissions.getAll', []);
  check('la couche d’API garde le manifeste d’origine (aucun site annoncé)', bareAll.value.origins.length === 0 && (await extApi.call(ses, bare.id, 'tabs.get', [created.id])).value.url === undefined, bareAll);
  const otherTab = await bareSw({ type: 'marquer', tabId: created.id });
  check('un onglet qui n’a pas reçu le clic reste fermé à l’extension', /^refus Cannot access contents/.test(otherTab[otherTab.length - 1]) && await win.live.get(bId).wc.executeJavaScript('document.documentElement.dataset.marque') === undefined, otherTab);
  await call('tabs.update', rtA.wc.id, { url: 'http://localhost:' + server.address().port + '/ailleurs' });
  await until(() => rtA.wc.getURL().includes('/ailleurs') && !rtA.wc.isLoading(), 'changement de site');
  const afterNav = await bareSw({ type: 'marquer', tabId: rtA.wc.id });
  check('changer de site dans l’onglet met fin à l’accès', /^refus/.test(afterNav[afterNav.length - 1]), afterNav);
  await call('tabs.update', rtA.wc.id, { url: base + '/a' }).catch(() => rtA.wc.loadURL(base + '/a'));
  await until(() => w.data.tabs[a.id].title === 'Page a' && !rtA.wc.isLoading(), 'retour à la page a');
  await until(() => call('tabs.sendMessage', rtA.wc.id, 'titre').then((v) => v === 'Page a'), 'script de contenu de retour');
  barePage.destroy();

  // Débogueur (chrome.debugger) : celui d'Electron, avec un bandeau visible.
  const dbg = extHost.debug;
  const target = { tabId: rtA.wc.id };
  await call('debugger.attach', target, '1.3');
  check('debugger.attach branche le débogueur d’Electron sur l’onglet', dbg.sessions.has(rtA.wc.id) && rtA.wc.debugger.isAttached());
  const banner = await until(() => dbg.banners.get(w) && dbg.banners.get(w).shown && dbg.banners.get(w), 'bandeau');
  const bannerText = await until(() => banner.view.webContents.executeJavaScript('document.getElementById("banner").hidden ? "" : document.getElementById("text").textContent'), 'texte du bandeau');
  const bb = banner.view.getBounds();
  check('un bandeau signale l’onglet piloté et nomme l’extension', bannerText.includes(ext.name) && inWindow(banner.view) && bb.y === w.contentRect().y + 8 && bb.x >= w.contentRect().x && bb.x + bb.width <= w.contentRect().x + w.contentRect().width, { bannerText, bb });
  const evald = await call('debugger.sendCommand', target, 'Runtime.evaluate', { expression: 'document.title + (6 * 7)', returnByValue: true });
  check('debugger.sendCommand exécute une commande du protocole', !!evald.result && evald.result.value === 'Page a42', evald);
  await call('debugger.sendCommand', target, 'Runtime.enable');
  await until(async () => (await events('debugger.onEvent')).some((e) => e.args[1] === 'Runtime.executionContextCreated' && e.args[0].tabId === rtA.wc.id), 'debugger.onEvent');
  check('debugger.onEvent relaie les événements du protocole', true);
  check('debugger.getTargets', (await call('debugger.getTargets')).some((t) => t.tabId === rtA.wc.id && t.attached === true && t.type === 'page'));
  check('un second attachement est refusé', await call('debugger.attach', target, '1.3').then(() => false, (e) => /already attached/.test(e.message)));
  const denied = await Promise.all([['Target.getTargets', {}], ['Browser.getVersion', {}], ['Page.navigate', { url: 'file:///etc/hosts' }], ['Page.navigate', { url: 'orbe://app/settings.html' }]].map(([m, p]) => call('debugger.sendCommand', target, m, p).then(() => 'accepté', (e) => e.message)));
  check('les commandes qui sortent de l’onglet sont refusées', denied.every((m) => /refusée/.test(m)), denied);
  const protoErr = await call('debugger.sendCommand', target, 'Runtime.inexistante').then(() => '', (e) => e.message);
  check('une erreur du protocole revient à l’extension', protoErr.length > 0 && !/refusée/.test(protoErr), protoErr);
  await call('debugger.detach', target);
  check('debugger.detach libère l’onglet et retire le bandeau', !dbg.sessions.size && !rtA.wc.debugger.isAttached() && !banner.shown && !inWindow(banner.view));
  check('…après quoi les commandes sont refusées', await call('debugger.sendCommand', target, 'Runtime.evaluate', { expression: '1' }).then(() => false, (e) => /not attached/.test(e.message)));
  await call('debugger.attach', target, '1.3');
  await until(() => banner.shown, 'bandeau');
  await banner.view.webContents.executeJavaScript('document.getElementById("stop").click()');
  await until(async () => (await events('debugger.onDetach')).some((e) => e.args[0].tabId === rtA.wc.id && e.args[1] === 'canceled_by_user'), 'debugger.onDetach');
  check('le bouton « Arrêter » détache le débogueur et prévient l’extension (onDetach)', !dbg.sessions.size && !rtA.wc.debugger.isAttached() && !banner.shown && (await events('debugger.onDetach')).length === 1);
  const doomed = await call('tabs.create', { url: base + '/debogue', active: false });
  await call('debugger.attach', { tabId: doomed.id }, '1.3');
  await call('tabs.remove', doomed.id);
  await until(async () => (await events('debugger.onDetach')).some((e) => e.args[0].tabId === doomed.id && e.args[1] === 'target_closed'), 'target_closed');
  check('onglet fermé pendant le débogage : onDetach(target_closed)', !dbg.sessions.size);

  // Groupes d'onglets : tenus en mémoire.
  const gid = await call('tabs.group', { tabIds: [rtA.wc.id, created.id] });
  check('tabs.group crée un groupe, visible dans tabs.get et tabs.query', typeof gid === 'number' && (await call('tabs.get', rtA.wc.id)).groupId === gid && (await call('tabs.query', {})).filter((t) => t.groupId === gid).length === 2);
  const g1 = await call('tabGroups.update', gid, { title: 'Travail', color: 'purple' });
  check('tabGroups.update, get et query', g1.title === 'Travail' && g1.color === 'purple' && (await call('tabGroups.get', gid)).windowId === w.win.id && (await call('tabGroups.query', { title: 'Travail' })).length === 1 && (await call('tabGroups.query', { title: 'Autre' })).length === 0, g1);
  check('constantes de tabGroups', await page('chrome.tabGroups.Color.BLUE === "blue" && chrome.tabGroups.TAB_GROUP_ID_NONE === -1'));
  await call('tabs.ungroup', [rtA.wc.id, created.id]);
  check('tabs.ungroup défait le groupe', (await call('tabs.get', rtA.wc.id)).groupId === -1 && await call('tabGroups.get', gid).then(() => false, (e) => /No group/.test(e.message)));
  await until(async () => (await events('tabGroups.onRemoved')).length === 1, 'tabGroups.onRemoved');
  check('tabGroups.onCreated, onUpdated et onRemoved sont émis', (await events('tabGroups.onCreated')).length === 1 && (await events('tabGroups.onUpdated')).length === 1);

  // Connexion à un service tiers (chrome.identity).
  const redirect = `https://${ext.id}.chromiumapp.org/`;
  check('identity.getRedirectURL', await page('chrome.identity.getRedirectURL("retour")') === redirect + 'retour');
  const flow = (p) => call('identity.launchWebAuthFlow', { url: `${base}/${p}?to=${encodeURIComponent(redirect + 'retour?code=42')}`, interactive: false });
  check('launchWebAuthFlow rend l’adresse de retour (redirection HTTP)', await flow('auth').catch((e) => e.message) === redirect + 'retour?code=42');
  check('…et quand la page redirige par script', await flow('authjs').catch((e) => e.message) === redirect + 'retour?code=42');
  check('sans redirection ni interaction : « User interaction required »', await call('identity.launchWebAuthFlow', { url: base + '/connexion', interactive: false }).then(() => false, (e) => /interaction required/i.test(e.message)));
  check('launchWebAuthFlow refuse une adresse qui n’est pas web', await call('identity.launchWebAuthFlow', { url: 'file:///etc/hosts', interactive: false }).then(() => false, () => true));
  check('identity.getAuthToken est refusé proprement', await call('identity.getAuthToken', { interactive: false }).then(() => false, (e) => /OAuth2/.test(e.message)) && /OAuth2/.test((await sw({ type: 'callback', path: 'identity.getAuthToken', args: [{}] })).lastError || ''));
  check('aucune fenêtre de connexion ne reste ouverte', BrowserWindow.getAllWindows().filter((x) => x !== pilot && !x.isDestroyed()).length === 0);

  // Raccourcis des commandes (chrome.commands).
  const keysOf = Object.fromEntries((await call('commands.getAll')).map((c) => [c.name, c.shortcut]));
  check('commands : raccourci attribué, sauf s’il est pris par Orbe', keysOf.essai === (process.platform === 'darwin' ? '⌥⇧Y' : 'Alt+Shift+Y') && keysOf.prise === '' && keysOf._execute_action !== '', keysOf);
  const press = (keyCode) => { for (const type of ['keyDown', 'keyUp']) rtA.wc.sendInputEvent({ type, keyCode, modifiers: ['alt', 'shift'] }); };
  press('Y');
  await until(async () => (await events('commands.onCommand')).length === 1, 'commands.onCommand');
  const cmd = (await events('commands.onCommand'))[0].args;
  check('le raccourci, frappé dans la page, émet commands.onCommand avec l’onglet', cmd[0] === 'essai' && cmd[1].id === rtA.wc.id, cmd);
  const primary = process.platform === 'darwin' ? { meta: true, control: false } : { meta: false, control: true };
  check('un raccourci d’Orbe ne va jamais à une extension', extHost.more.onKey(w, { type: 'keyDown', code: 'KeyT', alt: false, shift: false, ...primary }) === false && (await events('commands.onCommand')).length === 1);
  press('U');
  await until(() => extHost.popups.size === 1, '_execute_action');
  check('« _execute_action » agit comme un clic sur le bouton', true);
  extHost.closePopup(w);
  await until(() => extHost.popups.size === 0, 'fermeture de la fenêtre surgissante');

  // Raccourcis modifiables depuis Réglages → Raccourcis (EXT-7).
  const panes = require('../src/main/panes');
  const store = require('../src/main/store').store;
  const keyName = (c) => `ext:${ext.id}/${c}`;
  const rows = () => Object.fromEntries(panes.shortcutList().extensions.map((x) => [x.command, x]));
  const shortcutNow = async (c) => (await call('commands.getAll')).find((x) => x.name === c).shortcut;
  const mac = process.platform === 'darwin';
  const listed = rows();
  check('réglages : chaque commande d’extension est listée, avec son raccourci en vigueur et celui que l’extension propose',
    Object.keys(listed).sort().join() === '_execute_action,essai,prise' && listed.essai.keys === (mac ? '⌥⇧Y' : 'Alt+Shift+Y') && listed.essai.label === 'Orbe — extension d\'essai — Commande d\'essai' && listed.essai.name === keyName('essai')
    && listed.prise.keys === '' && listed.prise.defaultKeys !== '' && !listed.essai.changed && /bouton/.test(listed._execute_action.label), listed);
  const mine = mac ? 'Ctrl+Alt+F9' : 'Ctrl+Alt+F9';
  const set1 = await panes.handle('shortcuts:assign', { name: keyName('essai'), accel: mine });
  check('un raccourci choisi remplace celui que l’extension proposait : commands.getAll le rend', set1.ok && (await shortcutNow('essai')) === (mac ? '⌃⌥F9' : 'Ctrl+Alt+F9') && rows().essai.changed && store.state.settings.extShortcuts[`${ext.id}/essai`] === 'Ctrl+Alt+F9', set1);
  press('Y');
  await sleep(250);
  const stillOne = (await events('commands.onCommand')).length === 1;
  for (const type of ['keyDown', 'keyUp']) rtA.wc.sendInputEvent({ type, keyCode: 'F9', modifiers: ['control', 'alt'] });
  await until(async () => (await events('commands.onCommand')).length === 2, 'commande par le nouveau raccourci');
  check('l’ancien raccourci ne fait plus rien, le nouveau émet commands.onCommand', stillOne && (await events('commands.onCommand'))[1].args[0] === 'essai');
  const orbeKey = mac ? 'Cmd+T' : 'Ctrl+T';
  const clash = await panes.handle('shortcuts:assign', { name: keyName('essai'), accel: orbeKey });
  const odd = await panes.handle('shortcuts:assign', { name: keyName('essai'), accel: mac ? 'Cmd+Tab' : 'Alt+Tab' });
  const noMod = await panes.handle('shortcuts:assign', { name: keyName('essai'), accel: 'J' });
  const ghost = await panes.handle('shortcuts:assign', { name: keyName('inconnue'), accel: 'Ctrl+Alt+K' });
  const alien = await panes.handle('shortcuts:assign', { name: 'ext:' + 'a'.repeat(32) + '/essai', accel: 'Ctrl+Alt+K' });
  check('raccourci d’Orbe, du système, sans touche de modification, commande ou extension inconnue : refusés, rien ne change',
    (clash.conflict === 'newTab' || clash.error === 'reserved') && !!odd.error && noMod.error === 'modifier' && ghost.error === 'unknown' && alien.error === 'unknown' && (await shortcutNow('essai')) === (mac ? '⌃⌥F9' : 'Ctrl+Alt+F9'), { clash, odd, noMod, ghost, alien });
  const dup = await panes.handle('shortcuts:assign', { name: keyName('prise'), accel: mine });
  check('raccourci déjà donné à une autre commande d’extension : la question est posée, en la nommant', dup.conflict === keyName('essai') && /essai/.test(dup.label) && (await shortcutNow('prise')) === '', dup);
  const forced = await panes.handle('shortcuts:assign', { name: keyName('prise'), accel: mine, force: true });
  check('« Réattribuer » : la seconde commande le prend, la première le perd', forced.ok && (await shortcutNow('prise')) === (mac ? '⌃⌥F9' : 'Ctrl+Alt+F9') && (await shortcutNow('essai')) === '', forced);
  await panes.handle('shortcuts:clear', keyName('prise'));
  const cleared = await shortcutNow('prise');
  await panes.handle('shortcuts:reset', { name: keyName('essai') });
  await panes.handle('shortcuts:reset', { name: keyName('prise') });
  check('retirer un raccourci, puis rétablir : chaque commande retrouve ce que l’extension proposait', cleared === '' && (await shortcutNow('essai')) === (mac ? '⌥⇧Y' : 'Alt+Shift+Y') && (await shortcutNow('prise')) === '' && Object.keys(store.state.settings.extShortcuts).length === 0, store.state.settings.extShortcuts);
  await panes.handle('shortcuts:assign', { name: keyName('essai'), accel: mine });
  extHost.more.forgetKeys(ext.id);
  check('extension désinstallée : ses raccourcis choisis sont oubliés', Object.keys(store.state.settings.extShortcuts).length === 0);

  // Zoom, téléchargements, réglages d'entreprise, quota de captures.
  await call('tabs.setZoom', rtA.wc.id, 1.5);
  check('tabs.setZoom et getZoom agissent sur l’onglet d’Orbe', Math.abs(rtA.wc.getZoomFactor() - 1.5) < 0.01 && Math.abs(await call('tabs.getZoom', rtA.wc.id) - 1.5) < 0.01 && Math.abs(await call('tabs.getZoom') - 1.5) < 0.01);
  await call('tabs.setZoom', 0);
  check('tabs.setZoom(0) remet le zoom par défaut', Math.abs(rtA.wc.getZoomFactor() - 1) < 0.01);
  const dl = await call('downloads.download', { url: base + '/fichier.txt', filename: '../../essai.txt' });
  await until(async () => (await events('downloads.onChanged')).some((e) => e.args[0].id === dl && e.args[0].state.current === 'complete'), 'downloads.onChanged');
  const got = (await call('downloads.search', { id: dl }))[0];
  check('downloads.download puis search : fichier dans le dossier des téléchargements, sous le nom demandé', got.state === 'complete' && path.dirname(got.filename) === require('electron').app.getPath('downloads') && path.basename(got.filename) === 'essai.txt' && require('fs').readFileSync(got.filename, 'utf8') === 'bonjour', got);
  // Le nom imposé par l'extension change le chemin après « will-download » : la liste
  // d'Orbe, la marque « venu d'Internet » et la mise en garde suivent le vrai fichier.
  {
    const fs = require('fs');
    const rec = store.state.downloads.find((x) => x.path === got.filename);
    // (L'extension apprend la fin dès que le fichier est écrit ; Orbe ne l'annonce qu'une fois la marque posée.)
    await until(() => rec && rec.state === 'completed', 'téléchargement marqué puis annoncé');
    let marked = !!rec && rec.marked === true;
    if (marked && process.platform === 'darwin') { try { marked = /^0081;/.test(require('child_process').execFileSync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', got.filename]).toString()); } catch { marked = false; } }
    if (marked && process.platform === 'win32') { try { marked = /ZoneId=3/.test(fs.readFileSync(got.filename + ':Zone.Identifier', 'utf8')); } catch { marked = false; } }
    check('téléchargement d’une extension sous un nom imposé : la liste d’Orbe décrit le fichier réellement écrit, et c’est lui qui est marqué « venu d’Internet »',
      !!rec && rec.name === 'essai.txt' && rec.state === 'completed' && marked, JSON.stringify(rec || store.state.downloads.slice(0, 2)));
    const dl2 = await call('downloads.download', { url: base + '/fichier.txt', filename: 'sous/dossier/orbe-essai-outil.command' });
    await until(async () => (await events('downloads.onChanged')).some((e) => e.args[0].id === dl2 && e.args[0].state.current === 'complete'), 'second téléchargement');
    const got2 = (await call('downloads.search', { id: dl2 }))[0];
    const rec2 = store.state.downloads.find((x) => x.path === got2.filename);
    await until(() => rec2 && rec2.state === 'completed', 'second téléchargement marqué puis annoncé');
    check('extension, fichier exécutable sous un nom imposé : signalé comme tel (confirmation avant ouverture), rangé à plat dans le dossier des téléchargements',
      !!rec2 && rec2.danger === true && /^orbe-essai-outil( \(\d+\))?\.command$/.test(rec2.name) && path.dirname(got2.filename) === require('electron').app.getPath('downloads') && rec2.marked === true, JSON.stringify(rec2 || got2));
    try { fs.unlinkSync(got2.filename); } catch {}
    if (rec2) store.state.downloads.splice(store.state.downloads.indexOf(rec2), 1);
  }
  check('storage.managed.get rend un objet vide, comme Chrome sans stratégie', JSON.stringify(await call('storage.managed.get', null)) === '{}');
  await sleep(1100);
  const shots = await Promise.all([1, 2, 3].map(() => call('tabs.captureVisibleTab').then(() => 'ok', (e) => e.message)));
  check('captureVisibleTab : pas plus de deux captures par seconde, comme Chrome', /MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND/.test(shots[2]) && !/MAX_CAPTURE/.test(shots[0]), shots);

  // divers
  check('fontSettings.getFontList', (await call('fontSettings.getFontList')).some((f) => f.fontId === 'Arial'));
  const cmds = await call('commands.getAll');
  check('commands.getAll lit le manifeste', cmds.map((c) => c.name).sort().join() === '_execute_action,essai,prise', cmds);
  await call('storage.sync.set', { cle: 'valeur' });
  await call('storage.local.set', { ici: 1 });
  const syncAll = await call('storage.sync.get', null);
  const localAll = await call('storage.local.get', null);
  check('storage.sync garde ses valeurs, à part de storage.local', (await call('storage.sync.get', 'cle')).cle === 'valeur' && Object.keys(syncAll).join() === 'cle' && Object.keys(localAll).join() === 'ici'
    && (await call('storage.sync.get', { cle: 0, absente: 5 })).absente === 5 && (await call('storage.local.get', 'cle')).cle === undefined, { syncAll, localAll });
  // Electron n'annonce pas les changements de stockage au service worker : il
  // les calcule pour ses propres écritures, et reçoit ceux des pages par relais.
  await page('chrome.storage.local.set({ page: 2 })');
  await until(async () => (await events('storage.onChanged')).length >= 3, 'storage.onChanged', 4000).catch(() => {});
  await sleep(600);
  const allChanged = await events('storage.onChanged');
  const changed = allChanged.filter((e) => e.args[0][0] !== 'diffusion');
  check('deux pages ouvertes (options, panneau) : chaque changement n’arrive qu’une fois', allChanged.length - changed.length === 2, allChanged.map((e) => e.args));
  check('storage.onChanged arrive au service worker, une seule fois, avec la bonne zone', changed.map((e) => e.args[0].join() + ':' + e.args[1]).join(' ') === 'cle:sync ici:local page:local', changed.map((e) => e.args));
  check('…et dans les pages de l’extension', await page('new Promise((r) => { chrome.storage.onChanged.addListener((c, a) => r(Object.keys(c).join() + ":" + a)); chrome.storage.sync.set({ vu: 1 }); })') === 'vu:sync');
  // Le correctif est posé au chargement de la page : celle-ci s'est ouverte
  // alors que l'extension venait à peine d'être chargée, on la recharge.
  rtA.wc.reload();
  await until(() => call('tabs.sendMessage', rtA.wc.id, 'titre').then((v) => v === 'Page a'), 'page a rechargée');
  await sleep(300);
  check('storage.sync fonctionne aussi dans un script de contenu, et partage la zone des pages', await call('tabs.sendMessage', rtA.wc.id, 'sync') === 7 && (await call('storage.sync.get', 'contenu')).contenu === 7 && !Object.keys(await call('storage.local.get', null)).some((k) => /contenu|__orbe/.test(k)));
  await call('storage.sync.remove', 'vu');
  await call('storage.sync.clear');
  check('storage.sync.clear ne touche pas à storage.local', Object.keys(await call('storage.sync.get', null)).length === 0 && (await call('storage.local.get', 'ici')).ici === 1);
  await call('runtime.openOptionsPage');
  const optRt = await until(() => win.live.get(w.activeId) && win.live.get(w.activeId).wc.getURL() === ext.url + 'options.html' && win.live.get(w.activeId), 'page d’options');
  await until(() => optRt.wc.executeJavaScript('typeof window.call === "function"'), 'page d’options chargée');
  check('runtime.openOptionsPage ouvre la page dans un onglet d’Orbe', (await optRt.wc.executeJavaScript('call("tabs.getCurrent")')).id === optRt.wc.id);
  check('un site web ne reçoit aucune API ajoutée', await rtA.wc.executeJavaScript('typeof chrome === "undefined" || typeof chrome.permissions === "undefined"'));

  // Service worker endormi (Chromium l'arrête après 30 s d'inactivité) : un
  // événement doit le réveiller. Son journal, en mémoire, repart alors de zéro.
  pilot.destroy();
  const asleep = () => !Object.values(ses.serviceWorkers.getAllRunning()).some((i) => i.scope === ext.url);
  if (await until(asleep, 'arrêt du service worker', 50000).catch(() => false)) {
    const late = w.newTab(base + '/tard');
    await until(() => w.data.tabs[late.id].title === 'Page tard', 'page tard');
    const pilot2 = new BrowserWindow({ show: false, webPreferences: { session: ses, sandbox: true, contextIsolation: true } });
    await pilot2.loadURL(ext.url + 'options.html');
    const log = await until(async () => { const l = await pilot2.webContents.executeJavaScript('sw({ type: "log" })'); return l.some((e) => e.name === 'tabs.onUpdated' && e.args[1].title === 'Page tard') && l; }, 'événement après réveil');
    check('un événement réveille le service worker endormi', !log.some((e) => e.name === 'permissions.onAdded') && log.some((e) => e.name === 'tabs.onCreated'), log.map((e) => e.name));
    check('les autorisations accordées survivent au réveil', (await pilot2.webContents.executeJavaScript('sw({ type: "call", path: "permissions.contains", args: [{ permissions: ["contextMenus"] }] })')).value === false);
    pilot2.destroy();
  } else console.log('  – réveil du service worker non vérifié : il ne s’est pas arrêté');

  // --- Interface : bouton épinglé, menu du bouton, options, mise à jour, retrait (EXT-1, EXT-3, EXT-5) ---
  // L'extension d'essai est aussi posée comme une extension installée par Orbe (dossier Extensions du profil).
  {
    const fs = require('fs');
    const { app, dialog } = require('electron');
    const extUi = require('../src/main/ext-ui');
    const extensions = require('../src/main/extensions');
    const dirExt = path.join(app.getPath('userData'), 'Extensions');
    fs.cpSync(path.join(__dirname, 'ext-fixture'), path.join(dirExt, ext.id, '1.0.0_essai'), { recursive: true });
    fs.writeFileSync(path.join(dirExt, 'state.json'), JSON.stringify({ version: 1, extensions: { [ext.id]: { enabled: true, current: '1.0.0_essai', installedAt: 1 } } }));
    extensions.configure({ dir: dirExt });
    const ui = (js) => w.ui.webContents.executeJavaScript(js);
    const button = () => ui(`!!document.querySelector('#exts [data-ext="${ext.id}"]')`);
    w.activate(a.id);
    const one = extUi.list()[0];
    check('réglages : l’extension installée est décrite (options, bouton épinglé, fenêtre)', extUi.list().length === 1 && one.id === ext.id && one.options && one.pinned && one.popup && one.enabled && one.name === 'Orbe — extension d\'essai', one);
    await until(button, 'bouton de l’extension dans la barre latérale');
    extUi.setPinned(ext.id, false);
    await until(async () => !(await button()), 'bouton détaché');
    check('détacher : le bouton quitte la barre latérale, l’extension reste dans le menu du bouclier et le menu Extensions',
      store.state.settings.extHidden.join() === ext.id && extHost.actionsFor(w).some((x) => x.id === ext.id) && !extUi.list()[0].pinned);
    await extUi.action('ext:pin', { id: ext.id, pinned: true }, w.ui.webContents);
    await until(button, 'bouton épinglé de nouveau');
    check('épingler : le bouton revient', store.state.settings.extHidden.length === 0 && extUi.list()[0].pinned);

    // Clic droit sur le bouton : menu de l'extension.
    const realPopup = w.popup;
    const menus = [];
    w.popup = (tpl) => { menus.push(tpl); };
    await ui(`document.querySelector('#exts [data-ext="${ext.id}"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`);
    await until(() => menus.length === 1, 'menu contextuel du bouton');
    const labels = menus[0].filter((i) => i.type !== 'separator').map((i) => i.label);
    check('clic droit sur le bouton : nom, Options, Détacher, Désactiver, « Retirer d’Orbe… », Gérer',
      labels.join('|') === ['Orbe — extension d\'essai', 'Options', 'Détacher de la barre latérale', 'Désactiver', 'Retirer d’Orbe…', 'Gérer les extensions…'].join('|') && menus[0][0].enabled === false, labels.join('|'));
    const item = (label) => menus[0].find((i) => i.label === label);
    const tabsBefore = Object.keys(w.data.tabs).length;
    item('Options').click();
    await until(() => Object.values(w.data.tabs).some((x) => x.url === ext.url + 'options.html'), 'page d’options ouverte');
    item('Options').click();
    check('« Options » ouvre la page d’options dans un onglet, ou y revient si elle est déjà ouverte : jamais deux', Object.keys(w.data.tabs).length <= tabsBefore + 1 && Object.values(w.data.tabs).filter((x) => x.url === ext.url + 'options.html').length === 1 && w.data.tabs[w.activeId].url === ext.url + 'options.html', { n: Object.keys(w.data.tabs).length - tabsBefore, actif: w.data.tabs[w.activeId] && w.data.tabs[w.activeId].url, urls: Object.values(w.data.tabs).map((x) => x.url) });
    w.close(w.activeId);
    check('page d’options hors de l’extension (manifeste piégé) : refusée', (() => {
      const mf = path.join(dirExt, ext.id, '1.0.0_essai', 'manifest.json');
      const keep = fs.readFileSync(mf, 'utf8');
      const bad = (page) => { fs.writeFileSync(mf, JSON.stringify({ ...JSON.parse(keep), options_page: page })); return extUi.optionsUrl(ext.id); };
      const r = [bad('https://pirate.example/x.html'), bad('//pirate.example/x.html'), bad('chrome-extension://' + 'b'.repeat(32) + '/x.html'), bad('javascript:alert(1)'), bad(42)];
      fs.writeFileSync(mf, keep);
      return r.every((u) => u === '') && extUi.optionsUrl(ext.id) === ext.url + 'options.html';
    })());
    item('Détacher de la barre latérale').click();
    await until(async () => !(await button()), 'détaché par le menu');
    check('« Détacher de la barre latérale » depuis le menu', !extUi.isPinned(ext.id));
    extUi.setPinned(ext.id, true);

    // Mise à jour : réinstallation depuis le Store (remplacée ici), version comparée.
    const realInstall = extensions.install;
    // Le faux Store rend un manifeste ; le contrôle d'avant bascule (options.check) est appelé comme le fait extensions.install.
    const installed = JSON.parse(fs.readFileSync(path.join(dirExt, ext.id, '1.0.0_essai', 'manifest.json'), 'utf8'));
    const store2 = (manifest) => async (id, o) => { await o.check(manifest); return { ...extensions.get(ext.id), version: manifest.version }; };
    extensions.install = store2({ ...installed, version: '1.0.1' });
    const up1 = await extUi.action('ext:update', ext.id, w.ui.webContents);
    extensions.install = store2(installed);
    const up2 = await extUi.update(ext.id);
    // Version plus ancienne : refusée. Autorisations en plus : demandées avant d'installer (finding 7).
    extensions.install = store2({ ...installed, version: '0.9.9' });
    const down = await extUi.update(ext.id);
    const realConfirm = extUi.hooks.confirmUpdate;
    const askedUp = [];
    let answer = false;
    extUi.hooks.confirmUpdate = async (name, list) => { askedUp.push(list.join(' | ')); return answer; };
    const greedy = { ...installed, version: '1.1.0', permissions: [...installed.permissions, 'history'], host_permissions: [...installed.host_permissions, 'https://nouveau.exemple/*'], content_scripts: [...installed.content_scripts, { matches: ['https://banque.exemple/*'], js: ['content.js'] }] };
    extensions.install = store2(greedy);
    const refusedUp = await extUi.update(ext.id);
    answer = true;
    const acceptedUp = await extUi.update(ext.id);
    extUi.hooks.confirmUpdate = realConfirm;
    check('mise à jour vers une version plus ancienne : refusée, rien n’est installé', /plus ancienne \(0\.9\.9\) que celle installée \(1\.0\.0\)/.test(down.error || '') && !down.list, down);
    check('mise à jour qui demande davantage (API, site, script de contenu sur un nouveau site) : la question les liste ; refusée, l’ancienne version reste ; acceptée, le compte rendu les nomme',
      askedUp.length === 2 && askedUp[0] === 'history | https://nouveau.exemple/* | https://banque.exemple/*' && /non installée/.test(refusedUp.error || '') && /reste en place/.test(refusedUp.error)
      && acceptedUp.updated && /Nouvelles autorisations : history, https:\/\/nouveau\.exemple\/\*, https:\/\/banque\.exemple\/\*\./.test(acceptedUp.message), { askedUp, refusedUp, acceptedUp: acceptedUp.message });
    const ap = extUi.addedPermissions;
    check('extension qui a déjà tous les sites (manifeste ou accès accordé au clic) : un site de plus n’est pas une autorisation nouvelle ; une API de plus, si',
      ap({ host_permissions: ['<all_urls>'], permissions: ['tabs'] }, { host_permissions: ['<all_urls>', 'https://x.exemple/*'], permissions: ['tabs', 'cookies'] }).hosts.length === 0
      && ap({ host_permissions: ['<all_urls>'], permissions: ['tabs'] }, { host_permissions: ['https://x.exemple/*'], permissions: ['tabs', 'cookies'] }).api.join() === 'cookies'
      && ap({ permissions: ['https://a.exemple/*'] }, { permissions: ['https://a.exemple/*', '*://*/*'] }).hosts.join() === '*://*/*' && ap({}, {}).api.length === 0 && ap(null, { permissions: 'x', content_scripts: [null, { matches: 7 }] }).hosts.length === 0
      && extUi.compareVersions('1.10.0', '1.9.9') > 0 && extUi.compareVersions('1.0', '1.0.0.0') === 0 && extUi.compareVersions('2', '10') < 0);
    extensions.install = async () => { throw Object.assign(new Error('x'), { code: 'EXT_BAD_SIGNATURE' }); };
    const up3 = await extUi.update(ext.id);
    extensions.install = realInstall;
    check('« Mettre à jour » : nouvelle version annoncée, « à jour » sinon, signature refusée dite',
      up1.updated === true && /1\.0\.0 → 1\.0\.1/.test(up1.message) && up1.list.length === 1 && up2.updated === false && /à jour \(1\.0\.0\)/.test(up2.message) && /EXT_BAD_SIGNATURE/.test(up3.error), { up1: up1.message, up2: up2.message, up3 });
    check('ces actions n’existent que pour l’interface : identifiant mal formé ignoré', (await extUi.action('ext:pin', { id: '../x', pinned: false }, w.ui.webContents)) === undefined && (await extUi.action('ext:menu', { id: 'x' }, w.ui.webContents)) === undefined);

    // ⌘E : d'une extension à la suivante (EXT-4).
    {
      const commands = require('../src/main/commands');
      const realActions = extHost.actionsFor;
      const opened = [];
      const open = (ow, id) => { opened.push(id); };
      const cmd = commands.byName.get('cycleExtensions');
      // Trois extensions, dont une au bouton inactif : elle est sautée ; après la dernière, le tour se referme.
      const three = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B', enabled: false }, { id: 'c', title: 'C' }];
      const fake = { win: w.win, incognito: false, extCycle: null };
      const tour = [0, 300, 600, 900].map((dt) => extHost.cycle(fake, open, 1e6 + dt, three));
      check('⌘E : une extension après l’autre, les boutons inactifs sautés, puis le tour se referme et recommence', tour.join('|') === 'a|c||a' && opened.join() === 'a,c,a', tour.join('|'));
      opened.length = 0;
      // La vraie liste (une extension d'essai) : premier appui l'ouvre, second referme le tour.
      const t0 = Date.now();
      w.extCycle = null;
      extHost.closePopup(w);
      const ids = extHost.actionsFor(w).filter((x) => x.enabled !== false).map((x) => x.id);
      const seen = ids.map((_, k) => extHost.cycle(w, open, t0 + k * 300));
      const end = extHost.cycle(w, open, t0 + ids.length * 300);
      const restart = extHost.cycle(w, open, t0 + ids.length * 300 + 300);
      const late = (() => { w.extCycle = { id: ids[0], at: t0 }; return extHost.cycle(w, open, t0 + extHost.CYCLE_HOLD + 10); })();
      w.extCycle = null;
      check('⌘E avec les extensions installées : chacune à son tour, puis le tour se referme et recommence ; passé quelques secondes il repart du début',
        ids.includes(ext.id) && seen.join() === ids.join() && end === '' && restart === ids[0] && late === ids[0] && opened.join() === [...ids, ids[0], ids[0]].join(), JSON.stringify({ ids, seen, end, restart, late, opened }));
      check('⌘E est une commande d’Orbe : au menu Extensions, modifiable dans Réglages → Raccourcis, libre de tout conflit',
        !!cmd && cmd.accel === require('../src/main/platform').accel('Cmd+E') && require('../src/main/shortcuts').keysOf('cycleExtensions') !== ''
        && [...commands.byName.values()].filter((c) => c.accel === cmd.accel).length === 1);
      const priv = { win: w.win, incognito: true };
      check('⌘E en navigation privée (aucune extension) : rien à ouvrir', extHost.cycle(priv, open) === null && realActions(priv).length === 0);
    }

    // Extension qui plante (EXT-6) : page d'arrière-plan perdue -> extension désactivée, avec un message.
    {
      const toasts = [];
      const realToast = w.toast;
      w.toast = (text, sound, action) => { toasts.push({ text, action }); };
      const bg = (url, type = 'backgroundPage') => ({ getType: () => type, getURL: () => url });
      const home = `chrome-extension://${ext.id}/_generated_background_page.html`;
      const ignored = [
        extHost.backgroundGone(bg(home), { reason: 'clean-exit' }),
        extHost.backgroundGone(bg(home), { reason: 'killed' }),
        extHost.backgroundGone(bg(home, 'window'), { reason: 'crashed' }),
        extHost.backgroundGone(bg('https://exemple.invalid/'), { reason: 'crashed' }),
        extHost.backgroundGone(null, { reason: 'crashed' }),
      ];
      const stillOn = extensions.isEnabled(ext.id);
      const done = extHost.backgroundGone(bg(home), { reason: 'crashed' });
      const again = extHost.backgroundGone(bg(home), { reason: 'oom' });
      check('extension qui plante : seule la perte de sa page d’arrière-plan compte (pas un arrêt normal, pas une autre page)', ignored.every((x) => x === false) && stillOn && toasts.length === 1);
      check('… elle est désactivée, un message la nomme et mène aux réglages ; une seule fois',
        done === true && again === false && !extensions.isEnabled(ext.id) && toasts[0].text.includes('Orbe — extension d\'essai') && typeof toasts[0].action === 'function');
      w.toast = realToast;
      extensions.setEnabled(ext.id, true);
      await extensions.syncAll();
      await until(() => extensions.isEnabled(ext.id), 'extension réactivée');
    }

    // « Retirer d'Orbe… » : question, puis désinstallation.
    const realBox = dialog.showMessageBox;
    const boxes = [];
    dialog.showMessageBox = async (...args) => { boxes.push(args[args.length - 1]); return { response: boxes.length === 1 ? 1 : 0 }; };
    await require('../src/main/panes').handle('shortcuts:assign', { name: keyName('essai'), accel: 'Ctrl+Alt+F9' });
    extUi.setPinned(ext.id, false);
    await item('Retirer d’Orbe…').click();
    await until(() => boxes.length === 1, 'question posée');
    await sleep(100);
    const kept = !!extensions.get(ext.id);
    await item('Retirer d’Orbe…').click();
    await until(() => !extensions.get(ext.id), 'extension retirée');
    check('« Retirer d’Orbe… » : la question nomme l’extension ; « Annuler » garde tout ; confirmé, elle est désinstallée, ses raccourcis et son réglage d’épingle oubliés',
      boxes[0].message === 'Retirer l’extension « Orbe — extension d\'essai » ?' && boxes[0].cancelId === 1 && kept && extUi.list().length === 0 && !fs.existsSync(path.join(dirExt, ext.id))
      && Object.keys(store.state.settings.extShortcuts).length === 0 && store.state.settings.extHidden.length === 0, boxes[0]);
    dialog.showMessageBox = realBox;
    w.popup = realPopup;
  }

  const errors = swLogs.filter((m) => /error|not a function|undefined/i.test(m));
  check('aucune erreur dans la console du service worker', errors.length === 0, errors.join(' | '));

  check('aucune exception dans le processus principal', uncaught.length === 0, uncaught.join(' | '));
  server.close();
  console.log(`\n${results.length - failed}/${results.length} vérifications réussies\n`);
  if (failed) throw new Error(`${failed} vérification(s) en échec`);
};
