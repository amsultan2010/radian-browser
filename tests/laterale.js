// Barre latérale et menus : menus contextuels, dossiers, Espaces, boutons du
// haut, articles de la barre de menus. Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/laterale.js node scripts/dev.js --selftest
// Les pages viennent d'un serveur local ; les menus natifs ne sont pas affichés :
// on lit leur contenu et on actionne leurs articles, comme le ferait un clic.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');

const { clipboard, Menu, app, dialog, shell } = electron;
const outils = require('./outils');

const { sleep } = outils;
const until = (fn, label, timeout = 10000) => outils.until(fn, label, timeout);

function serve() {
  const hits = {};
  const hanging = new Set();
  const page = (title, body) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px sans-serif;padding:40px">${body}</body>`;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    hits[url.pathname] = (hits[url.pathname] || 0) + 1;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    const m = /^\/p(\d)$/.exec(url.pathname);
    if (m) return res.end(page('P' + m[1], `<h1 id="h">Page ${m[1]}</h1><p id="texte">une phrase à citer</p>`));
    // Page mise en cache par le navigateur (pour « Effacer le cache et actualiser »).
    if (url.pathname === '/cache') { res.setHeader('cache-control', 'public, max-age=3600'); return res.end(page('Cache', '<p>' + 'x'.repeat(20000) + '</p>')); }
    // Page qui ne finit jamais de se charger (pour « Échap arrête le chargement »).
    if (url.pathname === '/lent') { hanging.add(res); res.write(page('Lente', '<h1>Lente</h1>')); return undefined; }
    if (url.pathname === '/son') return res.end(page('Son', `<video id="v" width="160" height="90" playsinline></video><script>
      window.start = async () => {
        const c = document.createElement('canvas'); c.width = 160; c.height = 90;
        const g = c.getContext('2d'); let n = 0;
        setInterval(() => { g.fillStyle = 'hsl(' + (n++ % 360) + ' 70% 50%)'; g.fillRect(0, 0, 160, 90); }, 40);
        const ac = new AudioContext(); const osc = ac.createOscillator(); const gain = ac.createGain(); gain.gain.value = 0.002;
        const dest = ac.createMediaStreamDestination(); osc.connect(gain).connect(dest); osc.start();
        const stream = c.captureStream(25); stream.addTrack(dest.stream.getAudioTracks()[0]);
        const v = document.getElementById('v'); v.srcObject = stream; await v.play(); return true;
      };
    </script>`));
    res.statusCode = 404;
    return res.end(page('404', 'introuvable'));
  });
  server.hits = hits;
  server.release = () => { for (const res of hanging) { try { res.end(); } catch {} } hanging.clear(); };
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

module.exports = async function lateraleTests(ctx) {
  const { first: w, store, win, commands, OrbeWindow, little } = ctx;
  const menu = ctx.menu || require('../src/main/menu');
  let failed = 0;
  const check = ctx.check || ((name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`); });
  const ui = (js) => w.ui.webContents.executeJavaScript(js);
  const d = w.data;
  const T = (k, v) => store.t(k, null, v);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  // Adresse locale qui refuse la connexion : pour les onglets jamais chargés.
  const dead = (n) => `http://127.0.0.1:9/lat-${n}`;
  const names = (ids) => ids.map((id) => (d.tabs[id] ? d.tabs[id].title : '?')).join('');
  const tree = (nodes) => nodes.map((n) => (n.type === 'folder' ? `${n.name}[${tree(n.children)}]` : d.tabs[n.id].title)).join('');
  const labels = (tpl) => tpl.filter((x) => x.label && x.visible !== false).map((x) => x.label);
  const pick = (tpl, key, vars) => {
    const it = tpl.find((x) => x.label === T(key, vars) && x.visible !== false);
    if (!it) throw new Error('article absent : ' + T(key, vars));
    return it;
  };
  const wcOf = (id) => win.live.get(id).wc;
  const titleOf = (id) => d.tabs[id] && d.tabs[id].title;
  const clip0 = await clipboard.readText();
  const toasts = [];
  const toast0 = w.toast;
  w.toast = (text) => { toasts.push(text); return toast0.call(w, text); };

  await until(() => ui('typeof S === "object" && S !== null'), 'coque chargée');
  const home = w.spaceId;
  const homeActive = w.activeBySpace[home];
  const sidebar0 = w.sidebarVisible;
  if (!w.sidebarVisible) w.toggleSidebar(true);
  const width0 = store.state.settings.sidebarWidth;
  const space = store.makeSpace('Latérale', '🧭', '#0ea5e9');
  const other = store.makeSpace('Voisin', '📦', '#f97316');
  d.spaces.push(space, other);
  w.switchSpace(space.id);
  const make = (letters, sp = space) => [...letters].map((c) => {
    const tab = w.createTab(dead(c), { space: sp, index: sp.today.length });
    tab.title = c;
    return tab.id;
  });
  const mine = (id) => !!d.tabs[id] && (d.tabs[id].url.startsWith(base) || d.tabs[id].url.startsWith(dead('')) || d.tabs[id].url.startsWith('view-source:' + base));
  const wipe = () => {
    for (const sp of [space, other]) { sp.pinned = []; sp.today = []; sp.splits = []; delete w.activeBySpace[sp.id]; }
    for (const list of Object.values(d.favs)) for (const id of list.filter(mine)) list.splice(list.indexOf(id), 1);
    for (const id of Object.keys(d.tabs)) if (mine(id) && !d.spaces.some((sp) => w.orderedIds(sp).includes(id))) { OrbeWindow.destroyView(id); delete d.tabs[id]; }
    store.state.archive = store.state.archive.filter((x) => !x.url.startsWith(base) && !x.url.startsWith(dead('')));
    w.closed.length = 0;
    w.undoStack.length = 0;
    w.redoStack.length = 0;
  };
  const today = () => names(space.today);
  const load = async (pathname, title) => {
    const tab = w.newTab(base + pathname);
    await until(() => titleOf(tab.id) === title, 'page ' + pathname);
    return tab.id;
  };

  // --- Menu d'un onglet -------------------------------------------------------
  let [A, B, C, D, E] = make('ABCDE');
  const folder = { type: 'folder', id: 'lat-dossier', name: 'Rangement', open: true, children: [] };
  const inner = { type: 'folder', id: 'lat-sous', name: 'Dedans', open: true, children: [] };
  folder.children.push(inner);
  space.pinned.push(folder);
  w.activate(A);
  let tpl = w.tabMenuTemplate(C);
  check('menu d’un onglet du jour : lien, lien Markdown, dupliquer, renommer, épingler, favoris, vue scindée, son, déplacer, archiver (celui-ci, en dessous, au-dessus, les autres)',
    labels(tpl).join('|') === ['tabs.copyLink', 'tabs.copyLinkMarkdown', 'tabs.duplicate', 'tabs.rename', 'tabs.changeIcon', 'tabs.pin', 'tabs.addFavorite', 'tabs.openSplit', 'tabs.mute', 'tabs.moveTo', 'tabs.close', 'tabs.closeOthers', 'tabs.closeAbove', 'tabs.closeAllOthers'].map((k) => T(k)).join('|'), labels(tpl).join('|'));
  pick(tpl, 'tabs.copyLink').click();
  await until(async () => (await clipboard.readText()) === dead('C'), 'lien copié');
  check('menu : « Copier le lien »', true);
  pick(tpl, 'tabs.copyLinkMarkdown').click();
  await until(async () => (await clipboard.readText()) === `[C](${dead('C')})`, 'lien Markdown copié');
  check('menu : « Copier le lien en Markdown »', true);
  pick(tpl, 'tabs.mute').click();
  check('menu : « Couper le son » puis « Rétablir le son »', d.tabs[C].muted === true && labels(w.tabMenuTemplate(C)).includes(T('tabs.unmute')));
  pick(w.tabMenuTemplate(C), 'tabs.unmute').click();
  check('menu : le son est rétabli', !d.tabs[C].muted);
  await until(() => ui(`!document.querySelector('#today [data-id="${C}"]').classList.contains('muted')`), 'ligne sans le témoin muet');

  const moveTo = pick(tpl, 'tabs.moveTo').submenu;
  check('menu « Déplacer vers » : les autres Espaces, puis les dossiers (sous-dossiers nommés par leur chemin)',
    labels(moveTo).slice(-3).join('|') === [`${other.icon} ${other.name}`, 'Rangement', 'Rangement / Dedans'].join('|') && moveTo.some((x) => x.type === 'separator'), labels(moveTo).join('|'));
  moveTo.find((x) => x.label === 'Rangement / Dedans').click();
  check('menu « Déplacer vers » un dossier : l’onglet y est épinglé', tree(space.pinned) === 'Rangement[Dedans[C]]' && today() === 'ABDE' && d.tabs[C].homeUrl === dead('C'));
  check('… et son dossier n’est plus proposé comme destination', !labels(pick(w.tabMenuTemplate(C), 'tabs.moveTo').submenu).includes('Rangement / Dedans'));
  w.replay('undo');
  check('⌘Z le ramène dans Aujourd’hui', today() === 'ABCDE' && !d.tabs[C].homeUrl);

  pick(w.tabMenuTemplate(D), 'tabs.closeOthers').click();
  check('menu : « Archiver les onglets en dessous »', today() === 'ABCD' && !d.tabs[E] && store.state.archive[0].url === dead('E'));
  w.replay('undo');
  E = space.today[4];
  w.activate(A);
  pick(w.tabMenuTemplate(B), 'tabs.closeAbove').click();
  check('menu : « Archiver les onglets au-dessus » (l’onglet affiché compris, le suivant prend sa place)', today() === 'BCDE' && !d.tabs[A] && w.activeId === B, today());
  w.replay('undo');
  check('⌘Z rouvre l’onglet archivé, à sa place et de nouveau affiché', today() === 'ABCDE' && w.activeId === space.today[0]);
  A = space.today[0];
  pick(w.tabMenuTemplate(C), 'tabs.closeAllOthers').click();
  check('menu : « Archiver les autres onglets »', today() === 'C' && w.activeId === C && w.pendingLabel('undo') === 'undo.archiveMany');
  w.replay('undo');
  check('⌘Z rouvre tous les autres', today() === 'ABCDE', today());
  [A, B, C, D, E] = space.today;
  tpl = w.tabMenuTemplate(A);
  check('menu : en haut de la liste, « au-dessus » est grisé ; en bas, « en dessous »', pick(tpl, 'tabs.closeAbove').enabled === false && pick(w.tabMenuTemplate(E), 'tabs.closeOthers').enabled === false);

  // Dupliquer : une vraie page, la copie se place sous son modèle.
  const p1 = await load('/p1', 'P1');
  pick(w.tabMenuTemplate(p1), 'tabs.duplicate').click();
  const copy = space.today[space.today.indexOf(p1) + 1];
  await until(() => titleOf(copy) === 'P1', 'copie chargée');
  check('menu : « Dupliquer » ouvre la même adresse, juste sous l’onglet', d.tabs[copy].url === base + '/p1' && copy !== p1 && w.activeId === copy);

  // Vue scindée, puis « Séparer ».
  w.activate(p1);
  pick(w.tabMenuTemplate(copy), 'tabs.openSplit').click();
  check('menu : « Ouvrir en vue scindée » avec l’onglet affiché', (w.groupOf(p1) || []).join() === [p1, copy].join());
  menu.build();
  const menuItem = (key, vars) => {
    const label = T(key, vars);
    const find = (m) => { for (const it of m.items) { if (it.label === label) return it; const f = it.submenu && find(it.submenu); if (f) return f; } return null; };
    return find(Menu.getApplicationMenu());
  };
  check('Présentation → « Séparer la page de la vue scindée » : actif dans une vue scindée', menuItem('view.separateSplit').enabled === true);
  w.activate(copy);
  menuItem('view.separateSplit').click();
  check('… la page affichée quitte la vue scindée et reste à l’écran', !w.groupOf(copy) && !w.groupOf(p1) && w.activeId === copy && w.visibleIds().join() === copy);
  menu.build();
  check('… et l’article est grisé hors d’une vue scindée', menuItem('view.separateSplit').enabled === false);
  w.splitWith(p1, copy, true);
  w.splitWith(copy, A, true);
  check('menu d’une vue scindée : « Séparer tous les onglets »', labels(w.tabMenuTemplate(p1)).includes(T('tabs.separateAll')) && !labels(w.tabMenuTemplate(B)).includes(T('tabs.separateAll')));
  pick(w.tabMenuTemplate(p1), 'tabs.separateAll').click();
  check('… chaque page redevient un onglet', !w.groupOf(p1) && !w.groupOf(copy) && !w.groupOf(A) && !(space.splits || []).length);

  // Épinglé : « Fermer et garder épinglé », adresse épinglée remplacée.
  w.togglePin(p1);
  w.activate(p1);
  tpl = w.tabMenuTemplate(p1);
  check('menu d’un épinglé : « Fermer et garder épinglé » à la place d’« Archiver », sans les archivages en série',
    labels(tpl).includes(T('tabs.closeKeep')) && !labels(tpl).includes(T('tabs.close')) && !labels(tpl).includes(T('tabs.closeAbove')) && pick(tpl, 'tabs.closeKeep').enabled === true);
  pick(tpl, 'tabs.closeKeep').click();
  check('… la page est fermée, l’onglet reste épinglé', !win.live.has(p1) && space.pinned.some((n) => n.id === p1) && !!d.tabs[p1]);
  check('… et l’article est grisé tant que la page est fermée', pick(w.tabMenuTemplate(p1), 'tabs.closeKeep').enabled === false);

  // « / » : l'épinglé a quitté son adresse ; retour, ⌘clic, adresse remplacée.
  w.activate(p1);
  await until(() => win.live.has(p1) && !wcOf(p1).isLoading(), 'épinglé rechargé');
  wcOf(p1).loadURL(base + '/p2').catch(() => {});
  await until(() => titleOf(p1) === 'P2', 'épinglé parti sur une autre page');
  await until(() => ui(`(() => { const r = document.querySelector('#pinned [data-id="${p1}"]'); return !!r && r.classList.contains('changed') && getComputedStyle(r.querySelector('.slash')).display !== 'none'; })()`), 'barre oblique affichée');
  check('épinglé sorti de son adresse : la ligne porte « / »', true);
  await ui(`document.querySelector('#pinned [data-id="${p1}"] .ic').click()`);
  await until(() => titleOf(p1) === 'P1' && d.tabs[p1].url === base + '/p1', 'retour à l’adresse épinglée');
  await until(() => ui(`!document.querySelector('#pinned [data-id="${p1}"]').classList.contains('changed')`), 'barre oblique retirée');
  check('clic sur son icône : il revient à son adresse, « / » disparaît', true);
  wcOf(p1).loadURL(base + '/p3').catch(() => {});
  await until(() => titleOf(p1) === 'P3', 'épinglé reparti');
  const before = space.today.length;
  w.handle('resetPinnedAside', p1);
  await until(() => titleOf(p1) === 'P1', 'retour à l’adresse épinglée (⌘clic)');
  const aside = space.today[0];
  check('⌘clic sur son icône : il revient à son adresse, la page qu’il montrait part dans un nouvel onglet',
    space.today.length === before + 1 && d.tabs[aside].url === base + '/p3' && w.activeId === p1 && win.live.has(aside));
  wcOf(p1).loadURL(base + '/p2').catch(() => {});
  await until(() => titleOf(p1) === 'P2', 'épinglé reparti (2)');
  tpl = w.tabMenuTemplate(p1);
  check('menu d’un épinglé sorti de son adresse : y revenir, ou la remplacer par l’adresse actuelle', labels(tpl).includes(T('tabs.resetPinned')) && labels(tpl).includes(T('tabs.replacePinned')));
  pick(tpl, 'tabs.replacePinned').click();
  check('« Remplacer l’adresse épinglée par l’adresse actuelle »', d.tabs[p1].homeUrl === base + '/p2' && !labels(w.tabMenuTemplate(p1)).includes(T('tabs.replacePinned')));

  // « Réinitialiser les onglets de cet Espace ».
  wcOf(p1).loadURL(base + '/p3').catch(() => {});
  await until(() => titleOf(p1) === 'P3', 'épinglé reparti (3)');
  w.togglePin(B);
  d.tabs[B].url = dead('ailleurs');
  menu.build();
  toasts.length = 0;
  menuItem('tabs.resetAll').click();
  await until(() => titleOf(p1) === 'P2', 'épinglé réinitialisé');
  check('Onglets → « Réinitialiser les onglets de cet Espace » : chaque épinglé retourne à son adresse, chargé ou non',
    d.tabs[p1].url === base + '/p2' && d.tabs[B].url === dead('B') && toasts.includes(T('toast.tabsReset')));
  w.togglePin(B);

  // --- Menu d'un dossier ------------------------------------------------------
  w.move({ id: C, to: 'folder', folderId: folder.id, index: 1 });
  w.move({ id: D, to: 'folder', folderId: inner.id, index: 0 });
  d.tabs[D].customTitle = 'Mon D';
  tpl = w.folderMenuTemplate(folder.id);
  check('menu d’un dossier : renommer, dupliquer, copier tous les liens (aussi en Markdown), sous-dossier, coller l’adresse, replier, supprimer',
    labels(tpl).join('|') === ['tabs.renameFolder', 'tabs.changeIcon', 'tabs.duplicateFolder', 'tabs.copyAllLinks', 'tabs.copyAllLinksMarkdown', 'tabs.newNestedFolder', 'tabs.pasteUrlTab', 'tabs.closeFolder', 'tabs.folderToSpace', 'tabs.deleteFolder'].map((k) => T(k)).join('|'), labels(tpl).join('|'));
  pick(tpl, 'tabs.copyAllLinks').click();
  await until(async () => (await clipboard.readText()) === `${dead('D')}\n${dead('C')}`, 'liens du dossier');
  check('dossier : « Copier tous les liens », sous-dossiers compris, un par ligne', true);
  pick(tpl, 'tabs.copyAllLinksMarkdown').click();
  await until(async () => (await clipboard.readText()) === `- [Mon D](${dead('D')})\n- [C](${dead('C')})`, 'liens du dossier en Markdown');
  check('dossier : « Copier tous les liens en Markdown », avec les titres choisis', true);
  check('dossier vide : la copie des liens est grisée', (() => { const empty = { type: 'folder', id: 'lat-vide', name: 'Vide', open: true, children: [] }; space.pinned.push(empty); const off = pick(w.folderMenuTemplate(empty.id), 'tabs.copyAllLinks').enabled === false; space.pinned.pop(); return off; })());

  const shape = () => tree(space.pinned);
  const shape0 = shape();
  w.undoStack.length = 0;
  pick(tpl, 'tabs.duplicateFolder').click();
  const twin = space.pinned[space.pinned.indexOf(folder) + 1];
  const twinIds = twin && twin.type === 'folder' ? [twin.children[0].children[0].id, twin.children[1].id] : [];
  check('dossier : « Dupliquer » pose une copie juste après, avec ses sous-dossiers et de nouveaux onglets épinglés',
    !!twin && twin.id !== folder.id && tree([twin]) === tree([folder]) && twinIds.every((id) => id !== C && id !== D && !!d.tabs[id] && !!d.tabs[id].homeUrl)
    && d.tabs[twinIds[0]].customTitle === 'Mon D' && d.tabs[twinIds[1]].url === dead('C') && w.pendingLabel('undo') === 'undo.duplicateFolder', shape());
  w.replay('undo');
  check('⌘Z retire la copie et ses onglets', shape() === shape0 && twinIds.every((id) => !d.tabs[id]));
  w.replay('redo');
  check('⇧⌘Z la repose', space.pinned[space.pinned.indexOf(folder) + 1] === twin && twinIds.every((id) => !!d.tabs[id]));
  w.replay('undo');

  pick(tpl, 'tabs.newNestedFolder').click();
  const nested = folder.children[folder.children.length - 1];
  check('dossier : « Nouveau sous-dossier » le crée dedans, prêt à être nommé', nested.type === 'folder' && nested.id !== inner.id && !space.pinned.includes(nested));
  await until(() => ui(`!!document.querySelector('#pinned .folder .folder input.rename')`), 'nom du sous-dossier à saisir');
  await ui('document.querySelector("input.rename").blur()');
  w.replay('undo');
  check('⌘Z défait le sous-dossier', !folder.children.includes(nested) && shape() === shape0);

  clipboard.writeText(base + '/p3');
  await until(async () => (await clipboard.readText()) === base + '/p3', 'adresse dans le presse-papiers');
  // Le menu affiché lit lui-même le presse-papiers (w.folderMenu) : on le relève.
  const seen = [];
  const popupF = w.popup;
  w.popup = (x) => { seen.push(x); };
  await w.folderMenu(inner.id);
  tpl = seen.pop();
  check('dossier : « Coller l’adresse dans un nouvel onglet » actif quand le presse-papiers en contient une', pick(tpl, 'tabs.pasteUrlTab').enabled === true);
  pick(tpl, 'tabs.pasteUrlTab').click();
  await until(() => inner.children.length === 2, 'adresse collée dans le dossier');
  const pasted = inner.children[inner.children.length - 1].id;
  await until(() => titleOf(pasted) === 'P3', 'adresse collée chargée');
  check('… l’onglet est épinglé dans le dossier et affiché', w.activeId === pasted && d.tabs[pasted].homeUrl === base + '/p3' && inner.children.length === 2);
  clipboard.writeText('file:///etc/passwd');
  await until(async () => (await clipboard.readText()) === 'file:///etc/passwd', 'adresse interdite dans le presse-papiers');
  await w.folderMenu(inner.id);
  check('… et grisé pour une adresse file:, orbe: ou javascript:', pick(seen.pop(), 'tabs.pasteUrlTab').enabled === false && (await w.clipboardUrl()) === null);
  w.popup = popupF;

  pick(w.folderMenuTemplate(folder.id), 'tabs.closeFolder').click();
  check('dossier : « Replier ce dossier », puis « Déplier ce dossier »', folder.open === false && labels(w.folderMenuTemplate(folder.id)).includes(T('tabs.openFolder')));
  w.run('expandFolders');
  check('commande « Déplier tous les dossiers »', folder.open === true && inner.open === true);
  w.run('collapseFolders');
  check('commande « Replier tous les dossiers », sous-dossiers compris', folder.open === false && inner.open === false);
  check('ces deux commandes sont proposées par la barre de commande', w.commandList().some((c) => c.command === 'expandFolders') && w.commandList().some((c) => c.command === 'collapseFolders'));

  // « Afficher l'onglet dans la barre latérale » : dossier replié, barre masquée.
  w.activate(pasted);
  folder.open = false;
  inner.open = false;
  w.toggleSidebar(false);
  menu.build();
  menuItem('tabs.reveal').click();
  check('Onglets → « Afficher l’onglet dans la barre latérale » : la barre revient, ses dossiers s’ouvrent', w.sidebarVisible && folder.open === true && inner.open === true);
  await until(() => ui(`(() => { const r = document.querySelector('#pinned [data-id="${pasted}"]'); if (!r || !r.classList.contains('flash')) return false; const b = r.getBoundingClientRect(); const s = document.getElementById('scroll').getBoundingClientRect(); return b.top >= s.top && b.bottom <= s.bottom; })()`), 'ligne montrée');
  check('… et la ligne de l’onglet est à l’écran, mise en évidence', true);

  // --- Menus de l'Espace, du vide de la barre et du « + » -----------------------
  tpl = w.spaceMenuTemplate();
  check('menu de l’Espace : renommer, thème, icône, profil, en-tête, gérer, exporter, dossier, Espace, supprimer',
    labels(tpl).join('|') === ['spaces.rename', 'spaces.editTheme', 'spaces.changeIcon', 'spaces.profile', 'spaces.hideHeader', 'spaces.toFolder', 'spaces.manage', 'spaces.export', 'tabs.newFolder', 'spaces.new', 'spaces.delete'].map((k) => T(k)).join('|'), labels(tpl).join('|'));
  const profs = pick(tpl, 'spaces.profile').submenu;
  check('menu de l’Espace → Profil : un article par profil, celui de l’Espace coché, puis « Nouveau profil »',
    profs.filter((x) => x.type === 'radio').length === d.profiles.length && profs.find((x) => x.checked).label === d.profiles.find((p) => p.id === space.profileId).name && labels(profs).pop() === T('spaces.newProfile'));
  pick(tpl, 'spaces.hideHeader').click();
  await until(() => ui('document.getElementById("space-head").hidden === true && getComputedStyle(document.getElementById("space-head")).display === "none"'), 'en-tête masqué');
  check('menu de l’Espace : « Masquer l’en-tête de l’Espace »', space.hideHeader === true && labels(w.spaceMenuTemplate()).includes(T('spaces.showHeader')));
  w.switchSpace(other.id);
  await until(() => ui(`!slide && S.space.id === ${JSON.stringify(other.id)} && document.getElementById("space-head").hidden === false`), 'autre Espace : en-tête affiché');
  check('… propre à cet Espace : les autres gardent le leur', !other.hideHeader);
  w.switchSpace(space.id);
  await until(() => ui(`!slide && S.space.id === ${JSON.stringify(space.id)}`), 'retour dans l’Espace');
  pick(w.spaceMenuTemplate(), 'spaces.showHeader').click();
  await until(() => ui('document.getElementById("space-head").hidden === false'), 'en-tête revenu');
  check('… et « Afficher l’en-tête de l’Espace » le ramène', !space.hideHeader);

  tpl = w.sidebarMenuTemplate(true);
  check('bouton « + » : onglet, dossier, Espace, vue scindée, tableau, note, Boost',
    labels(tpl).join('|') === ['tabs.newTab', 'tabs.newFolder', 'spaces.new', 'view.addSplit', 'easel.new', 'notes.new', 'boost.edit'].map((k) => T(k)).join('|'), labels(tpl).join('|'));
  tpl = w.sidebarMenuTemplate(false);
  check('clic droit dans le vide de la barre : thème et profil de l’Espace, dossiers à déplier ou replier',
    labels(tpl).join('|') === ['tabs.newTab', 'tabs.newFolder', 'spaces.new', 'spaces.editTheme', 'spaces.profile', 'tabs.expandFolders', 'tabs.collapseFolders'].map((k) => T(k)).join('|')
    && pick(tpl, 'spaces.profile').submenu.some((x) => x.type === 'radio' && x.checked), labels(tpl).join('|'));
  pick(tpl, 'tabs.expandFolders').click();
  check('… « Déplier tous les dossiers » depuis ce menu', folder.open === true && inner.open === true);

  // --- Espaces : rang du nouvel Espace, ordre, suppression ----------------------
  const order = () => d.spaces.map((s) => s.name).join(',');
  const rank = d.spaces.indexOf(space);
  w.newSpace();
  const fresh = w.space;
  check('nouvel Espace : il se place juste après l’Espace affiché', d.spaces.indexOf(fresh) === rank + 1 && d.spaces.indexOf(other) === rank + 2 && w.spaceId === fresh.id, order());
  await until(() => ui('!slide && !!document.querySelector("#space-name input.rename")'), 'nom du nouvel Espace à saisir');
  await ui('document.querySelector("input.rename").blur()');
  w.replay('undo');
  check('⌘Z le retire, on revient dans l’Espace d’où il venait', !d.spaces.includes(fresh) && w.spaceId === space.id, order());
  await until(() => ui(`!slide && S.space.id === ${JSON.stringify(space.id)}`), 'Espace d’essai affiché');

  const order0 = order();
  w.undoStack.length = 0;
  w.handle('moveSpace', { id: other.id, index: 0 });
  check('glisser la pastille d’un Espace : il prend le rang visé', d.spaces[0] === other && w.pendingLabel('undo') === 'undo.moveSpace' && w.spaceId === space.id, order());
  await until(() => ui(`document.querySelector('#spaces .sp').dataset.space === ${JSON.stringify(other.id)}`), 'pastilles dans le nouvel ordre');
  menu.build();
  check('… le menu Espaces et ⌃1 suivent le nouvel ordre', (() => { const m = Menu.getApplicationMenu().items.find((x) => x.label === T('menu.spaces')); const it = m.submenu.items.find((x) => x.label === `${other.icon}  ${other.name}`); return !!it && it.accelerator === require('../src/main/platform').accel('Ctrl+1'); })());
  w.replay('undo');
  check('⌘Z remet les Espaces dans leur ordre', order() === order0);
  w.replay('redo');
  w.handle('moveSpace', { id: other.id, index: d.spaces.length });
  check('⇧⌘Z, puis déplacement en fin de rangée', d.spaces[d.spaces.length - 1] === other && d.spaces[d.spaces.length - 2] === space, order());
  w.handle('moveSpace', { id: 'inconnu', index: 0 });
  w.handle('moveSpace', { id: other.id, index: NaN });
  w.handle('moveSpace', null);
  w.handle('moveSpace', { id: other.id, index: d.spaces.length });
  check('ordre des Espaces : identifiant inconnu, rang invalide ou rang déjà occupé, rien ne bouge', order() === order0);

  // Suppression : la question nomme l'Espace et dit ce que deviennent ses onglets.
  const doomed = store.makeSpace('À supprimer', '🗑️', '#ef4444');
  d.spaces.push(doomed);
  const [gone] = make('Y', doomed);
  const ask = dialog.showMessageBox;
  const asked = [];
  dialog.showMessageBox = async (...args) => { asked.push(args[args.length - 1]); return { response: asked.length === 1 ? 1 : 0 }; };
  await w.deleteSpace(doomed.id);
  check('supprimer un Espace : la question le nomme et annonce le sort de ses onglets ; « Annuler » ne touche à rien',
    asked.length === 1 && asked[0].message === T('spaces.deleteConfirm', { name: 'À supprimer' }) && asked[0].detail === T('spaces.deleteDetail') && asked[0].cancelId === 1 && d.spaces.includes(doomed) && !!d.tabs[gone]);
  await w.deleteSpace(doomed.id);
  check('… confirmé : l’Espace disparaît, ses onglets du jour vont dans l’archive', !d.spaces.includes(doomed) && !d.tabs[gone] && store.state.archive[0].url === dead('Y'));
  dialog.showMessageBox = ask;
  w.undoStack.length = 0;
  store.state.archive = store.state.archive.filter((x) => x.url !== dead('Y'));

  // --- Favoris : douze au plus ---------------------------------------------------
  wipe();
  w.switchSpace(space.id);
  // Les favoris déjà là sont mis de côté le temps de l'essai.
  const favs0 = w.favorites.splice(0);
  const lot = make('abcdefghijklmn');
  w.favoriteMany(lot.slice(0, 12));
  toasts.length = 0;
  w.toggleFavorite(lot[12]);
  check('favoris : douze au plus, le treizième est refusé avec un message', w.favorites.filter(mine).length === 12 && w.favorites.length === 12 && space.today.includes(lot[12]) && toasts.join() === T('toast.favMax', { n: 12 }), String(w.favorites.length));
  w.handle('move', { id: lot[12], to: 'favorites', index: 0 });
  w.handle('move', { ids: [lot[12], lot[13]], to: 'favorites', index: 0 });
  check('… aussi en le glissant, seul ou à plusieurs', w.favorites.length === 12 && today() === 'mn');
  w.handle('move', { id: lot[3], to: 'favorites', index: 0 });
  check('… réordonner les douze reste permis', w.favorites.length === 12 && w.favorites[0] === lot[3]);
  w.toggleFavorite(lot[0]);
  w.toggleFavorite(lot[12]);
  check('… une place libérée, l’ajout redevient possible', w.favorites.length === 12 && w.favorites.includes(lot[12]) && !w.favorites.includes(lot[0]));
  w.favoriteMany(w.favorites.filter(mine));
  w.favorites.push(...favs0);

  // --- ⌥glisser, dépôt sur la pastille d'un Espace --------------------------------
  wipe();
  [A, B, C, D, E] = make('ABCDE');
  w.handle('move', { id: D, to: 'today', index: 1, copy: true });
  check('⌥glisser un onglet : une copie est déposée à l’endroit visé, l’original ne bouge pas',
    today() === 'ADBCDE' && space.today[1] !== D && d.tabs[space.today[1]].url === dead('D') && space.today[4] === D, today());
  w.handle('move', { ids: [A, C], to: 'pinned', index: 0, copy: true });
  check('⌥glisser une sélection vers les épinglés : les copies y sont épinglées', tree(space.pinned) === 'AC' && today() === 'ADBCDE' && space.pinned.every((n) => n.id !== A && n.id !== C && !!d.tabs[n.id].homeUrl));
  const count = Object.keys(d.tabs).length;
  w.handle('move', { id: B, to: 'folder', folderId: 'inconnu', copy: true });
  w.handle('move', { id: B, to: 'ailleurs', copy: true });
  w.handle('move', { id: 'inconnu', to: 'today', index: 0, copy: true });
  check('⌥glisser vers une destination inconnue : aucune copie ne reste', Object.keys(d.tabs).length === count && today() === 'ADBCDE');
  w.undoStack.length = 0;
  w.handle('moveToSpace', { id: E, spaceId: other.id });
  check('onglet déposé sur la pastille d’un autre Espace : il y part, en tête de ses onglets du jour', other.today[0] === E && !space.today.includes(E) && w.pendingLabel('undo') === 'undo.moveToSpace');
  w.handle('moveToSpace', { ids: [A, B], spaceId: other.id });
  check('… une sélection aussi, dans son ordre', names(other.today) === 'ABE', names(other.today));
  w.handle('moveToSpace', { id: C, spaceId: 'inconnu' });
  w.handle('moveToSpace', 'n’importe quoi');
  check('… Espace inconnu ou message mal formé : rien ne bouge', space.today.includes(C));

  // --- Largeur de la barre ------------------------------------------------------
  w.setSidebarWidth(330);
  w.handle('sidebarWidthReset');
  check('double-clic sur le bord de la barre : largeur par défaut', w.sidebarWidth === 250 && store.state.settings.sidebarWidth === 250);

  // --- Fenêtre à l'arrière-plan : la barre s'estompe -----------------------------
  const focused = w.win.isFocused;
  // L'événement de la fenêtre lui-même, avec la réponse du système simulée.
  w.win.isFocused = () => false;
  w.win.emit('blur');
  // L'opacité change par une transition : sans image présentée (écran verrouillé),
  // elle n'avance pas. L'état, lui, se vérifie toujours.
  const milieu = await outils.milieu(w);
  await until(() => ui('document.body.classList.contains("blurred")'), 'barre marquée « à l’arrière-plan »');
  if (milieu.images) {
    await until(() => ui('getComputedStyle(document.getElementById("top")).opacity === "0.7"'), 'barre estompée');
    check('fenêtre à l’arrière-plan : le contenu de la barre s’estompe', true);
  } else {
    check('fenêtre à l’arrière-plan : la barre est marquée pour s’estomper', true);
    outils.ignorer('fenêtre à l’arrière-plan : le contenu de la barre s’estompe (opacité à 0,7 en fin de transition)', milieu.sansImages);
  }
  w.win.isFocused = () => true;
  w.win.emit('focus');
  await until(() => ui('!document.body.classList.contains("blurred")'), 'barre de nouveau au premier plan');
  if (milieu.images) await until(() => ui('getComputedStyle(document.getElementById("top")).opacity === "1"'), 'barre nette');
  check('… et revient quand la fenêtre repasse au premier plan', true);
  delete w.win.isFocused;
  if (w.win.isFocused !== focused) w.win.isFocused = focused;
  OrbeWindow.pushAll();

  // --- Précédent / suivant, actualiser -------------------------------------------
  wipe();
  const nav = await load('/p1', 'P1');
  const page = wcOf(nav);
  // Une page après l'autre, chacune arrivée au bout de son chargement.
  for (const n of [2, 3]) {
    await until(() => !page.isLoading(), 'page précédente chargée');
    page.loadURL(`${base}/p${n}`).catch(() => {});
    await until(() => titleOf(nav) === 'P' + n && !page.isLoading(), 'page ' + n);
  }
  check('historique de l’onglet : pages précédentes, de la plus proche à la plus lointaine', labels(w.navMenuTemplate(-1)).join() === 'P2,P1' && w.navMenuTemplate(1).length === 0);
  w.navMenuTemplate(-1)[1].click();
  await until(() => titleOf(nav) === 'P1' && page.getURL() === base + '/p1', 'retour deux pages en arrière');
  check('clic droit (ou appui long) sur précédent : un article ramène directement à cette page', labels(w.navMenuTemplate(1)).join() === 'P2,P3');
  const popups = [];
  const popup0 = w.popup;
  w.popup = (t) => { popups.push(t); };
  w.handle('navMenu', 1);
  w.handle('navMenu', -1);
  w.handle('reloadMenu');
  check('menus des boutons : suivant (deux pages), précédent (rien à montrer, pas de menu), actualiser',
    popups.length === 2 && labels(popups[0]).join() === 'P2,P3'
    && labels(popups[1]).join('|') === ['view.reload', 'view.forceReload', 'view.clearCookies', 'view.clearCache'].map((k) => T(k)).join('|'), JSON.stringify(popups.map(labels)));
  w.popup = popup0;
  const n0 = space.today.length;
  w.handle('navNew', 1);
  const opened = space.today[space.today.indexOf(nav) + 1];
  await until(() => titleOf(opened) === 'P2', 'page suivante dans un nouvel onglet');
  check('⌘clic ou clic molette sur suivant : la page s’ouvre dans un nouvel onglet, derrière, juste sous l’onglet',
    space.today.length === n0 + 1 && w.activeId === nav && page.getURL() === base + '/p1' && d.tabs[opened].url === base + '/p2');
  w.handle('navNew', -1);
  check('… rien à ouvrir en arrière : aucun onglet créé', space.today.length === n0 + 1);
  const r0 = server.hits['/p1'];
  popups.length = 0;
  w.reloadMenuTemplate()[1].click();
  await until(() => server.hits['/p1'] === r0 + 1 && !page.isLoading(), 'page rechargée');
  check('menu du bouton actualiser : « Forcer l’actualisation » recharge la page', true);

  // Échap arrête le chargement.
  const slow = w.newTab(base + '/lent');
  await until(() => titleOf(slow.id) === 'Lente' && win.live.get(slow.id).loading, 'page lente en cours de chargement');
  w.onInput({ preventDefault() {} }, { type: 'keyDown', key: 'Escape' }, true);
  await sleep(150);
  const stillLoading = win.live.get(slow.id).loading;
  w.onInput({ preventDefault() {} }, { type: 'keyDown', key: 'Escape' }, false);
  await until(() => !win.live.get(slow.id).loading, 'chargement arrêté');
  check('Échap dans la page arrête le chargement en cours (pas depuis un champ de l’interface)', stillLoading === true);
  server.release();
  w.close(slow.id);

  // --- Onglets : coller une adresse, message d'arrière-plan, délai d'archivage ----
  clipboard.writeText(base + '/p2');
  await until(async () => (await clipboard.readText()) === base + '/p2', 'adresse dans le presse-papiers');
  await w.run('pasteUrl');
  const pastedTab = w.activeId;
  await until(() => titleOf(pastedTab) === 'P2', 'adresse collée ouverte');
  check('⌥⌘V : l’adresse du presse-papiers s’ouvre dans un nouvel onglet', pastedTab !== nav && d.tabs[pastedTab].url === base + '/p2' && space.today[0] === pastedTab);
  const n1 = space.today.length;
  for (const bad of ['file:///etc/passwd', 'orbe://app/library.html', 'javascript:alert(1)', '   ']) {
    clipboard.writeText(bad);
    await until(async () => (await clipboard.readText()) === bad, 'presse-papiers');
    await w.run('pasteUrl');
  }
  check('… jamais une adresse file:, orbe: ou javascript:, ni un presse-papiers vide', space.today.length === n1 && w.activeId === pastedTab);
  check('⌥⌘V figure au menu Édition, sous le raccourci du système', menuItem('edit.pasteUrl').accelerator === require('../src/main/platform').accel('Alt+Cmd+V'));

  toasts.length = 0;
  w.newTab(base + '/p1', { background: true });
  check('lien ouvert en arrière-plan, barre affichée : pas de message', toasts.length === 0);
  w.toggleSidebar(false);
  const back = w.newTab(base + '/p3', { background: true });
  check('lien ouvert en arrière-plan, barre masquée : « Nouvel onglet créé dans … »', toasts.includes(T('toast.newTabCreated', { space: space.name })) && w.activeId === pastedTab && !!d.tabs[back.id], toasts.join());
  w.toggleSidebar(true);

  d.tabs[nav].lastActiveAt = Date.now() - 40 * 36e5;
  w.activate(nav);
  check('afficher un onglet remet son délai d’archivage à zéro', Date.now() - d.tabs[nav].lastActiveAt < 5000);
  w.activate(pastedTab);
  const hours0 = store.state.settings.archiveAfterHours;
  store.state.settings.archiveAfterHours = 12;
  d.tabs[nav].lastActiveAt = Date.now() - 11 * 36e5;
  d.tabs[back.id].lastActiveAt = Date.now() - 13 * 36e5;
  win.archiveStale();
  check('archivage automatique après 12 h : l’onglet vu il y a 13 h part, celui vu il y a 11 h reste', !d.tabs[back.id] && !!d.tabs[nav] && store.state.archive[0].url === base + '/p3');

  // Un onglet qui joue un média n'est ni effacé ni archivé.
  const son = await load('/son', 'Son');
  await wcOf(son).executeJavaScript('start()', true);
  // Session verrouillée : le système ne joue aucun son, rien à vérifier ici.
  const audible = await until(() => wcOf(son).isCurrentlyAudible(), 'onglet audible', 8000).then(() => true, () => false);
  if (!audible) {
    const env = await outils.milieu(w);
    if (!env.muet) throw new Error('Délai dépassé : onglet audible');
    outils.ignorer('onglet qui joue un média : ni effacé, ni archivé', env.muet);
  }
  else {
    w.activate(pastedTab);
    const quiet = space.today.filter((id) => id !== pastedTab && id !== son);
    w.run('clearToday');
    check('« Effacer » épargne l’onglet qui joue un média (et l’onglet affiché)', !!d.tabs[son] && !!d.tabs[pastedTab] && quiet.length > 0 && quiet.every((id) => !d.tabs[id]) && space.today.join() === [son, pastedTab].join());
    d.tabs[son].lastActiveAt = Date.now() - 40 * 36e5;
    win.archiveStale();
    check('… et l’archivage automatique aussi', !!d.tabs[son] && wcOf(son).isCurrentlyAudible());
  }
  store.state.settings.archiveAfterHours = hours0;
  w.close(son);
  w.undoStack.length = 0;

  // --- Bascule ⌃Tab : ⌃W ferme l'onglet désigné -----------------------------------
  wipe();
  const s1 = await load('/p1', 'P1');
  const s2 = await load('/p2', 'P2');
  const s3 = await load('/p3', 'P3');
  const key = (input) => { const e = { prevented: false, preventDefault() { e.prevented = true; } }; w.onInput(e, input, true); return e.prevented; };
  key({ type: 'keyDown', key: 'Tab', control: true });
  check('⌃Tab ouvre la bascule sur l’onglet précédent', w.modalMode === 'switcher' && w.switcher.ids.slice(0, 3).join() === [s3, s2, s1].join() && w.switcher.index === 1);
  const prevented = key({ type: 'keyDown', key: 'w', control: true });
  check('⌃ maintenu + W : l’onglet désigné est archivé, la bascule reste ouverte sur les autres',
    prevented && !d.tabs[s2] && w.modalMode === 'switcher' && w.switcher.ids.slice(0, 2).join() === [s3, s1].join() && w.switcher.ids[w.switcher.index] === s1 && store.state.archive[0].url === base + '/p2');
  key({ type: 'keyUp', key: 'Control' });
  check('… relâcher ⌃ affiche l’onglet alors désigné', w.modalMode === null && w.activeId === s1);
  check('hors de la bascule, ⌃W n’est pas intercepté', key({ type: 'keyDown', key: 'w', control: true }) === false && !!d.tabs[s1]);
  w.undoStack.length = 0;

  // --- Section épinglée repliée ---------------------------------------------------
  w.togglePin(s1);
  w.togglePin(s3);
  w.activate(s3);
  menu.build();
  menuItem('view.collapsePinned').click();
  await until(() => ui(`document.getElementById('scroll').classList.contains('pinned-collapsed') && [...document.querySelectorAll('#pinned > .row')].filter((r) => r.offsetHeight > 0).map((r) => r.dataset.id).join() === ${JSON.stringify(s3)}`), 'épinglés repliés');
  check('Présentation → « Replier les onglets épinglés » : seul l’onglet affiché reste visible', space.pinnedCollapsed === true);
  menu.build();
  check('… l’article devient « Déplier les onglets épinglés »', !!menuItem('view.expandPinned') && !menuItem('view.collapsePinned'));
  await ui('document.getElementById("pinned-toggle").click()');
  await until(() => !space.pinnedCollapsed && ui(`!document.getElementById('scroll').classList.contains('pinned-collapsed') && [...document.querySelectorAll('#pinned > .row')].filter((r) => r.offsetHeight > 0).length === 2`), 'épinglés dépliés');
  check('… le chevron de l’en-tête les déplie', true);

  // --- Repère de l'onglet affiché hors de vue ---------------------------------------
  make('0123456789012345678901234567890123456789');
  w.changed();
  await until(() => ui('document.querySelectorAll("#today .row.tab").length === 40'), 'quarante lignes');
  const last = space.today[39];
  w.activate(last);
  await until(() => ui(`!!document.querySelector('#today [data-id="${last}"].active')`), 'dernière ligne active');
  await ui('document.getElementById("scroll").scrollTop = 0');
  await until(() => ui('(() => { const o = document.getElementById("off-view"); return !o.hidden && o.classList.contains("down"); })()'), 'repère en bas');
  check('onglet affiché plus bas que la zone visible : un repère paraît en bas de la liste', true);
  await ui('document.getElementById("off-view").click()');
  // Le retour se fait par un défilement doux, qui n'avance qu'au rythme des images.
  if (milieu.images) {
    await until(() => ui(`(() => { const r = document.querySelector('#today [data-id="${last}"]').getBoundingClientRect(); const s = document.getElementById('scroll').getBoundingClientRect(); return r.top >= s.top - 1 && r.bottom <= s.bottom + 1 && document.getElementById('off-view').hidden; })()`), 'ligne revenue à l’écran');
    check('… un clic dessus ramène la ligne à l’écran, et le repère disparaît', true);
  } else outils.ignorer('… un clic dessus ramène la ligne à l’écran, et le repère disparaît', milieu.sansImages);
  w.activate(s3);
  await until(() => ui(`!!document.querySelector('#pinned [data-id="${s3}"].active')`), 'épinglé actif');
  await ui('document.getElementById("scroll").scrollTop = document.getElementById("scroll").scrollHeight');
  await until(() => ui('(() => { const o = document.getElementById("off-view"); return !o.hidden && o.classList.contains("up"); })()'), 'repère en haut');
  check('onglet affiché plus haut que la zone visible : le repère paraît en haut', true);
  await ui('document.getElementById("scroll").scrollTop = 0');
  if (milieu.images) await until(() => ui('document.getElementById("off-view").hidden'), 'repère retiré');

  // --- Barre de menus -----------------------------------------------------------------
  wipe();
  const m1 = await load('/p1', 'P1');
  const mwc = wcOf(m1);
  menu.build();
  const fileMenu = Menu.getApplicationMenu().items.find((x) => x.label === T('menu.file'));
  check('Fichier → « Nouveau profil »', !!fileMenu && fileMenu.submenu.items.some((x) => x.label === T('spaces.newProfile')));

  const isDefault = app.isDefaultProtocolClient;
  app.isDefaultProtocolClient = () => true;
  menu.build();
  const tick = menuItem('app.defaultBrowser');
  app.isDefaultProtocolClient = () => false;
  menu.build();
  check('« Définir comme navigateur par défaut » : coché quand Orbe l’est, décoché sinon', tick.type === 'checkbox' && tick.checked === true && menuItem('app.defaultBrowser').checked === false);
  app.isDefaultProtocolClient = isDefault;
  menu.build();

  const top0 = w.win.isAlwaysOnTop();
  menuItem('window.onTop').click();
  await until(() => w.win.isAlwaysOnTop() === !top0, 'fenêtre au premier plan');
  await until(() => menuItem('window.onTop').checked === !top0, 'coche du menu');
  check('Fenêtre → « Rester au premier plan » : la fenêtre y reste, l’article est coché', true);
  menuItem('window.onTop').click();
  await until(() => w.win.isAlwaysOnTop() === top0 && menuItem('window.onTop').checked === top0, 'retour à la normale');
  check('… un second clic rend la fenêtre à la normale', true);

  // Zoom.
  w.run('zoomIn');
  const z1 = mwc.getZoomLevel();
  w.run('zoomOut');
  w.run('zoomOut');
  const z2 = mwc.getZoomLevel();
  w.run('actualSize');
  check('Présentation → zoom avant, zoom arrière, taille réelle', z1 === 0.5 && z2 === -0.5 && mwc.getZoomLevel() === 0, `${z1} ${z2} ${mwc.getZoomLevel()}`);

  // Citation.
  await mwc.executeJavaScript('getSelection().selectAllChildren(document.getElementById("texte")); String(getSelection())');
  await w.run('copyUrlQuote');
  await until(async () => (await clipboard.readText()) === `> une phrase à citer\n>\n> — [P1](${base}/p1)`, 'citation copiée');
  check('Édition → « Copier l’URL en citation » : la sélection en citation Markdown, avec sa source', true);

  // « Utiliser la sélection pour rechercher ».
  await w.run('useSelectionFind');
  await until(() => w.findOpen && w.findText === 'une phrase à citer', 'recherche lancée sur la sélection');
  check('Édition → « Utiliser la sélection pour rechercher » : la barre de recherche s’ouvre sur ce texte', await w.findView.webContents.executeJavaScript('document.getElementById("find-input").value') === 'une phrase à citer');
  w.closeFind();
  await mwc.executeJavaScript('getSelection().removeAllRanges()');
  await w.run('useSelectionFind');
  await sleep(120);
  check('… sans sélection, elle ne s’ouvre pas', !w.findOpen);

  // Enregistrer la page.
  const saveAs = dialog.showSaveDialog;
  const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-page-')), 'page.html');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  await w.run('savePage');
  dialog.showSaveDialog = saveAs;
  await until(() => fs.existsSync(target) && fs.readFileSync(target, 'utf8').includes('une phrase à citer'), 'page enregistrée');
  check('Fichier → « Enregistrer la page sous » : le fichier choisi contient la page', true);
  fs.rmSync(path.dirname(target), { recursive: true, force: true });

  // Code source.
  const srcHits = server.hits['/p1'];
  w.run('source');
  const src = w.activeId;
  check('Présentation → Développeur → « Afficher le code source » : un onglet « view-source: » de la page', src !== m1 && d.tabs[src].url === 'view-source:' + base + '/p1');
  await until(() => win.live.has(src) && !wcOf(src).isLoading() && server.hits['/p1'] > srcHits, 'code source chargé');
  check('… chargé depuis le site, et affiché comme du code source', wcOf(src).getURL() === 'view-source:' + base + '/p1', wcOf(src).getURL());
  w.close(src);
  w.activate(m1);

  // Effacer les cookies, effacer le cache.
  const origin = base + '/';
  await mwc.session.cookies.set({ url: origin, name: 'orbe-lat', value: '1' });
  await mwc.executeJavaScript('localStorage.setItem("orbe-lat", "1")');
  const h0 = server.hits['/p1'];
  await w.run('clearCookies');
  await until(() => server.hits['/p1'] === h0 + 1 && !mwc.isLoading(), 'page rechargée après l’effacement');
  check('Présentation → « Effacer les cookies et actualiser » : cookies et données du site effacés, page rechargée',
    (await mwc.session.cookies.get({ url: origin, name: 'orbe-lat' })).length === 0 && await mwc.executeJavaScript('localStorage.getItem("orbe-lat")') === null);
  const cached = await load('/cache', 'Cache');
  const cwc = wcOf(cached);
  await until(async () => (await cwc.session.getCacheSize()) > 0, 'page en cache');
  const reloadIgnoring = cwc.reloadIgnoringCache;
  let reloaded = 0;
  cwc.reloadIgnoringCache = () => { reloaded += 1; };
  await w.run('clearCache');
  const size = await cwc.session.getCacheSize();
  cwc.reloadIgnoringCache = reloadIgnoring;
  check('Présentation → « Effacer le cache et actualiser » : le cache est vide, l’actualisation est demandée', size === 0 && reloaded === 1, `${size} octets`);
  w.close(cached);
  w.activate(m1);

  // Outils de développement.
  w.run('devtools');
  await until(() => mwc.isDevToolsOpened(), 'outils ouverts');
  check('Présentation → Développeur → « Outils de développement » les ouvre', true);
  w.run('devtools');
  await until(() => !mwc.isDevToolsOpened(), 'outils refermés');
  check('… et les referme', true);
  w.run('console');
  await until(() => mwc.isDevToolsOpened(), 'console ouverte');
  mwc.closeDevTools();
  await until(() => !mwc.isDevToolsOpened(), 'console refermée');
  w.run('inspect');
  await until(() => mwc.isDevToolsOpened(), 'inspecteur ouvert');
  mwc.closeDevTools();
  await until(() => !mwc.isDevToolsOpened(), 'inspecteur refermé');
  check('… « Console JavaScript » et « Inspecter les éléments » aussi', true);

  // Vider l'archive : confirmation.
  store.state.archive.unshift({ url: dead('archive-1'), title: 'a' }, { url: dead('archive-2'), title: 'b' });
  const kept = store.state.archive.length;
  const boxes = [];
  dialog.showMessageBox = async (...args) => { boxes.push(args[args.length - 1]); return { response: boxes.length === 1 ? 1 : 0 }; };
  const archive0 = [...store.state.archive];
  await w.run('clearArchive');
  check('Archive → « Vider l’archive » : une question dit combien d’onglets partent ; « Annuler » garde tout',
    boxes.length === 1 && boxes[0].message === T('archive.clearConfirm') && boxes[0].detail === T('archive.clearDetail', { n: kept }) && boxes[0].cancelId === 1 && store.state.archive.length === kept);
  await w.run('clearArchive');
  check('… confirmé : l’archive est vide', boxes.length === 2 && store.state.archive.length === 0);
  await w.run('clearArchive');
  check('… archive déjà vide : aucune question', boxes.length === 2);
  dialog.showMessageBox = ask;
  store.state.archive = archive0.filter((x) => !x.url.startsWith(dead('')));

  // Extensions.
  const extHost = require('../src/main/ext-host');
  const actionsFor = extHost.actionsFor;
  const openPopup = extHost.openPopup;
  const openSettings = commands.hooks.openSettings;
  const called = [];
  extHost.actionsFor = () => [{ id: 'ext-un', title: 'Première extension', enabled: true }, { id: 'ext-deux', title: 'Seconde', enabled: false }];
  extHost.openPopup = (win2, id) => { called.push('popup:' + id); return true; };
  commands.hooks.openSettings = (pane) => { called.push('reglages:' + pane); };
  menu.build();
  const extMenu = Menu.getApplicationMenu().items.find((x) => x.label === T('menu.extensions'));
  const extLabels = extMenu ? extMenu.submenu.items.filter((x) => x.type !== 'separator').map((x) => x.label) : [];
  check('menu Extensions : une ligne par extension, « Extension suivante » (⌘E), puis « Ajouter une extension… » et « Gérer les extensions… »',
    extLabels.join('|') === ['Première extension', 'Seconde', T('ext.cycle'), T('ext.add'), T('ext.manage')].join('|') && extMenu.submenu.items[1].enabled === false, extLabels.join('|'));
  extMenu.submenu.items[0].click();
  extMenu.submenu.items.find((x) => x.label === T('ext.manage')).click();
  extMenu.submenu.items.find((x) => x.label === T('ext.add')).click();
  check('… une ligne agit comme le bouton de l’extension ; les deux autres ouvrent le volet Extensions des réglages', called.join() === 'popup:ext-un,reglages:extensions,reglages:extensions', called.join());
  extHost.actionsFor = actionsFor;
  extHost.openPopup = openPopup;
  commands.hooks.openSettings = openSettings;
  menu.build();
  check('… sans extension : seulement les deux articles', Menu.getApplicationMenu().items.find((x) => x.label === T('menu.extensions')).submenu.items.filter((x) => x.type !== 'separator').length === actionsFor(w).length + 2);

  // Aide → Dépannage.
  const help = menuItem('help.troubleshooting');
  check('Aide → Dépannage : « Afficher les données d’Orbe », « Copier les infos d’Orbe », « Gestionnaire de tâches », « Restaurer une sauvegarde »', !!help && help.submenu.items.filter((x) => x.type !== 'separator').map((x) => x.label).join('|') === [T('help.revealData'), T('help.copyInfo'), T('help.taskManager'), T('help.recordTrace'), T('backup.menu')].join('|'));
  menuItem('help.copyInfo').click();
  await until(async () => (await clipboard.readText()).startsWith(`Orbe ${app.getVersion()}\nElectron ${process.versions.electron}\nChromium ${process.versions.chrome}\n${process.platform}`), 'infos copiées');
  check('« Copier les infos d’Orbe » : versions d’Orbe, d’Electron, de Chromium et du système', true);
  const reveal = shell.showItemInFolder;
  let shown = '';
  shell.showItemInFolder = (p) => { shown = p; };
  menuItem('help.revealData').click();
  shell.showItemInFolder = reveal;
  check('« Afficher les données d’Orbe » montre le dossier du profil', shown === app.getPath('userData'));

  // Menu du Dock.
  const dock = () => menu.dockTemplate();
  check('menu du Dock : navigation privée, petites fenêtres (grisé sans petite fenêtre)', labels(dock()).join('|') === [T('file.newIncognito'), T('dock.hideLittle')].join('|') && dock()[1].enabled === false);
  const lw = new little.LittleWindow(base + '/p2');
  await until(() => lw.win.isVisible(), 'petite fenêtre affichée');
  check('… avec une petite fenêtre : « Masquer toutes les petites fenêtres »', dock()[1].enabled === true && dock()[1].label === T('dock.hideLittle'));
  dock()[1].click();
  await until(() => !lw.win.isVisible(), 'petite fenêtre masquée');
  check('… elle se masque, l’article devient « Afficher toutes les petites fenêtres »', dock()[1].label === T('dock.showLittle'));
  dock()[1].click();
  await until(() => lw.win.isVisible(), 'petite fenêtre réaffichée');
  check('… puis revient', dock()[1].label === T('dock.hideLittle'));
  lw.win.close();
  const windows0 = OrbeWindow.all.length;
  dock()[0].click();
  await until(() => OrbeWindow.all.length === windows0 + 1 && OrbeWindow.all.some((x) => x.incognito), 'fenêtre privée ouverte');
  check('menu du Dock : « Navigation privée » ouvre une fenêtre privée', true);
  for (const x of OrbeWindow.all.filter((y) => y.incognito)) x.win.close();
  await until(() => OrbeWindow.all.length === windows0, 'fenêtre privée refermée');

  // Raccourcis : les nouvelles commandes se règlent comme les autres.
  const shortcuts = ctx.shortcuts || require('../src/main/shortcuts');
  const groups = shortcuts.list();
  const inGroup = (title, name) => (groups.find((g) => g.title === T(title)) || { items: [] }).items.some((x) => x.name === name);
  check('volet Raccourcis : les nouvelles commandes sont rangées dans leur menu',
    inGroup('menu.edit', 'pasteUrl') && inGroup('menu.view', 'collapsePinned') && inGroup('menu.view', 'separateSplit') && inGroup('menu.tabs', 'revealTab') && inGroup('menu.tabs', 'resetTabs') && inGroup('menu.window', 'stayOnTop'));
  const custom = require('../src/main/platform').isMac ? 'Ctrl+Cmd+R' : 'Ctrl+Alt+R';
  const given = shortcuts.assign('revealTab', custom);
  await until(() => menuItem('tabs.reveal') && menuItem('tabs.reveal').accelerator === custom, 'menu reconstruit avec le nouveau raccourci');
  check('un raccourci donné à « Afficher l’onglet dans la barre latérale » arrive au menu', given.ok === true);
  shortcuts.reset('revealTab');
  await until(() => !menuItem('tabs.reveal').accelerator, 'raccourci retiré');

  // --- Remise en état ---------------------------------------------------------------
  w.toast = toast0;
  wipe();
  for (const sp of [space, other]) d.spaces.splice(d.spaces.indexOf(sp), 1);
  w.spaceId = home;
  if (homeActive && d.tabs[homeActive]) w.activeBySpace[home] = homeActive;
  store.state.settings.sidebarWidth = width0;
  if (w.sidebarVisible !== sidebar0) w.toggleSidebar(sidebar0);
  clipboard.writeText(clip0);
  w.layout();
  w.changed();
  server.release();
  if (server.closeAllConnections) server.closeAllConnections();
  server.close();
  if (!ctx.check && failed) throw new Error(`${failed} vérification(s) en échec`);
};
