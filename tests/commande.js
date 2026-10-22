// Barre de commande : actions, portées (actions seules, recherche dans un site),
// suppression d'une suggestion, dédoublonnage, clic qui traverse le fond.
// Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/commande.js node scripts/dev.js --selftest
// Les messages passent par `handle`, la porte qu'emprunte la vue de la barre,
// pour vérifier aussi le contrôle des arguments.
const http = require('http');
const path = require('path');
const { dialog } = require('electron');

const { sleep, until, profilPret } = require('./outils');

module.exports = async function commandeTests(ctx) {
  const { first: w, store, win, commands } = ctx;
  const { OrbeWindow } = win;
  let failed = 0;
  const check = ctx.check || ((name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`); });
  const ui = (js) => w.ui.webContents.executeJavaScript(js);
  const palette = require('../src/main/palette');
  const suggest = require('../src/main/suggest');
  const T = (k, v) => store.t(k, null, v);
  const d = w.data;

  const hits = {};
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    hits[url.pathname] = (hits[url.pathname] || 0) + 1;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(`<!doctype html><meta charset="utf-8"><title>Essai ${url.pathname.slice(1)}</title><body><h1>${url.pathname}</h1></body>`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  await until(() => ui('typeof S === "object" && S !== null'), 'coque chargée');
  await profilPret(w);
  const home = w.spaceId;
  const homeActive = w.activeId;
  const history0 = store.state.history;
  const archive0 = [...store.state.archive];
  const lang0 = store.state.settings.lang;
  const space = store.makeSpace('Atelier', '🧪', '#0ea5e9');
  const other = store.makeSpace('Voyages', '🧳', '#f97316');
  d.spaces.push(space, other);
  w.switchSpace(space.id);
  // Adresse locale qui refuse la connexion : rien ne sort de la machine.
  const dead = (n) => `http://127.0.0.1:9/${n}`;
  const make = (name, sp = space) => { const tab = w.createTab(dead(name), { space: sp, index: sp.today.length }); tab.title = name; return tab.id; };
  const titles = (items) => items.map((i) => i.title);
  const find = (q, command, arg) => w.suggestLocal(q).find((i) => i.kind === 'command' && i.command === command && (arg === undefined || i.arg === arg));

  // --- Actions de la table ---------------------------------------------------------
  const page = w.newTab(base + '/depart');
  await until(() => d.tabs[page.id].title === 'Essai depart', 'page d’essai chargée');
  const quiet = make('Silencieux');
  const wanted = [
    ['dupliquer', 'duplicate'], ['renommer l’onglet', 'renameTab'], ['favoris', 'toggleFavorite'], ['déplier tous', 'expandFolders'], ['replier tous', 'collapseFolders'],
    ['replier les onglets', 'collapsePinned'], ['vider l’archive', 'clearArchive'], ['afficher l’archive', 'viewArchive'], ['bibliothèque', 'library'], ['téléchargements', 'downloads'],
    ['tous les onglets', 'muteAll'], ['tous les onglets', 'unmuteAll'], ['coller l’adresse', 'pasteUrl'], ['copier l’url', 'copyUrl'], ['markdown', 'copyUrlMarkdown'],
    ['centre d’aide', 'helpCenter'], ['signaler', 'reportIssue'], ['nouveautés', 'whatsNew'], ['bienvenue', 'welcome'], ['réglages des liens', 'linkSettings'],
    ['raccourcis clavier', 'editShortcuts'], ['mots de passe', 'passwords'], ['à côté de la page', 'newNoteSplit'], ['nouveau dossier', 'newFolder'], ['nouvel espace', 'newSpace'],
    ['gérer les espaces', 'librarySpaces'], ['gérer les extensions', 'manageExtensions'], ['mode développeur', 'toggleDevMode'],
  ];
  const absent = wanted.filter(([q, name]) => !find(q, name)).map((x) => x[1]);
  check('la barre propose les actions d’Arc : dupliquer, renommer, favoris, dossiers, archive, son de tous les onglets, coller l’adresse, aide, réglages, note à côté, mode développeur', !absent.length, 'absentes : ' + absent.join(', '));

  // Favoris : le libellé suit l'onglet affiché.
  check('« Ajouter aux favoris » pour un onglet du jour', !!find('favoris', 'toggleFavorite') && find('favoris', 'toggleFavorite').title === T('tabs.addFavorite'));
  await w.runItem(find('favoris', 'toggleFavorite'));
  check('… exécutée : l’onglet devient un favori, et la barre propose « Retirer des favoris »', w.favorites.includes(page.id) && find('favoris', 'toggleFavorite').title === T('tabs.removeFavorite'));
  await w.runItem(find('favoris', 'toggleFavorite'));
  check('« Retirer des favoris » le rend à Aujourd’hui', !w.favorites.includes(page.id) && space.today.includes(page.id));

  // Onglet épinglé sorti de son adresse : revenir, ou remplacer l'adresse épinglée.
  check('onglet du jour : ni « Revenir à l’adresse épinglée » ni « Remplacer… » ne sont proposés', !find('épinglée', 'resetTab') && !find('épinglée', 'replacePin'));
  w.togglePin(page.id);
  w.navigate(base + '/ailleurs', page.id);
  await until(() => d.tabs[page.id].url === base + '/ailleurs' && d.tabs[page.id].title === 'Essai ailleurs', 'épinglé sorti de son adresse');
  check('épinglé sorti de son adresse : les deux actions apparaissent', !!find('adresse épinglée', 'resetTab') && !!find('adresse épinglée', 'replacePin'));
  await w.runItem(find('adresse épinglée', 'resetTab'));
  await until(() => d.tabs[page.id].url === base + '/depart', 'retour à l’adresse épinglée');
  check('« Revenir à l’adresse épinglée » y retourne', d.tabs[page.id].homeUrl === base + '/depart');
  w.navigate(base + '/nouveau', page.id);
  await until(() => d.tabs[page.id].url === base + '/nouveau', 'épinglé sorti de nouveau');
  await w.runItem(find('remplacer', 'replacePin'));
  check('« Remplacer l’adresse épinglée par l’adresse actuelle » la remplace', d.tabs[page.id].homeUrl === base + '/nouveau' && !find('épinglée', 'resetTab'));
  w.togglePin(page.id);

  // Dupliquer, renommer.
  const n0 = space.today.length;
  await w.runItem(find('dupliquer', 'duplicate'));
  const copy = space.today.find((id) => id !== page.id && d.tabs[id].url === base + '/nouveau');
  check('« Dupliquer l’onglet » ouvre une copie sous l’original', space.today.length === n0 + 1 && !!copy && space.today.indexOf(copy) === space.today.indexOf(page.id) + 1);
  w.close(copy, { ask: false });
  w.activate(page.id);
  await w.runItem(find('renommer l’onglet', 'renameTab'));
  await until(() => ui('!!document.querySelector("#today .row.tab input.rename")'), 'champ de renommage dans la barre latérale');
  check('« Renommer l’onglet » ouvre le champ de saisie sur sa ligne', await ui(`document.querySelector("#today .row.tab input.rename").closest("[data-id]").dataset.id`) === page.id);
  await ui('document.querySelector("input.rename").blur()');

  // Son de tous les onglets.
  const muted0 = Object.keys(d.tabs).filter((id) => d.tabs[id].muted);
  palette.muteAll(w, false);
  check('« Couper le son de tous les onglets » : tous, page chargée comprise', (await w.runItem(find('couper le son de tous', 'muteAll'))) >= 2
    && d.tabs[page.id].muted === true && d.tabs[quiet].muted === true && win.live.get(page.id).wc.isAudioMuted());
  check('« Rétablir le son de tous les onglets »', (await w.runItem(find('rétablir le son de tous', 'unmuteAll'))) >= 2 && !d.tabs[page.id].muted && !d.tabs[quiet].muted && !win.live.get(page.id).wc.isAudioMuted());
  for (const id of muted0) if (d.tabs[id]) { d.tabs[id].muted = true; const rt = win.live.get(id); if (rt) rt.wc.setAudioMuted(true); }

  // Vider l'archive depuis la barre : la question est posée.
  store.state.archive.unshift({ url: dead('archive-x'), title: 'x', at: Date.now() });
  const boxes = [];
  const box0 = dialog.showMessageBox;
  dialog.showMessageBox = async (...args) => { boxes.push(args[args.length - 1]); return { response: 1 }; };
  await w.runItem(find('vider l’archive', 'clearArchive'));
  dialog.showMessageBox = box0;
  check('« Vider l’archive » depuis la barre : confirmation demandée, « Annuler » garde tout', boxes.length === 1 && boxes[0].message === T('archive.clearConfirm') && store.state.archive.some((x) => x.url === dead('archive-x')));
  store.state.archive = store.state.archive.filter((x) => x.url !== dead('archive-x'));

  // Aide : chaque action ouvre sa page (adresses du dépôt, jamais chargées ici).
  const opened = [];
  const newTab0 = w.newTab;
  w.newTab = (url) => { opened.push(url); return null; };
  for (const name of ['helpCenter', 'reportIssue', 'whatsNew']) w.run(name);
  w.newTab = newTab0;
  check('Centre d’aide, Signaler un problème, Nouveautés : pages du dépôt d’Orbe', opened.join() === [commands.REPO_URL + '#readme', commands.REPO_URL + '/issues/new', commands.REPO_URL + '/releases'].join(), opened.join());

  // --- Espaces, dossiers, déplacements ---------------------------------------------
  const focus = find('voyages', 'focusSpace');
  check('taper le nom d’un Espace : « Aller à l’Espace … »', !!focus && focus.arg === other.id && focus.title === T('cmd.focusSpace', { space: '🧳 Voyages' }) && !find('atelier', 'focusSpace'));
  await w.handle('run', { item: focus });
  check('… exécutée : l’Espace s’affiche', w.spaceId === other.id);
  w.switchSpace(space.id);
  w.activate(page.id);
  w.undoStack.length = 0;
  const toPinned = find('épinglés de', 'moveTabPinned', other.id);
  check('« Déplacer vers Aujourd’hui dans … » et « … vers les épinglés de … » pour chaque Espace',
    !!toPinned && !!find('aujourd’hui dans', 'moveTabToday', other.id) && !!find('épinglés de', 'moveTabPinned', space.id) && !find('aujourd’hui dans', 'moveTabToday', space.id));
  await w.handle('run', { item: toPinned });
  check('« Déplacer vers les épinglés de Voyages » : l’onglet y est épinglé, avec son adresse d’origine',
    other.pinned.some((n) => n.id === page.id) && !space.today.includes(page.id) && d.tabs[page.id].homeUrl === base + '/nouveau' && w.undoStack.length === 1);
  w.replay('undo');
  check('… et ⌘Z le ramène d’un coup à sa place', space.today.includes(page.id) && !other.pinned.length && !d.tabs[page.id].homeUrl);
  w.activate(page.id);
  await w.handle('run', { item: find('aujourd’hui dans', 'moveTabToday', other.id) });
  check('« Déplacer vers Aujourd’hui dans Voyages »', other.today[0] === page.id && !space.today.includes(page.id));
  w.switchSpace(other.id);
  w.activate(page.id);
  await w.handle('run', { item: find('épinglés de', 'moveTabPinned', space.id) });
  check('retour dans les épinglés du premier Espace', space.pinned.some((n) => n.id === page.id) && !other.today.length);
  w.switchSpace(space.id);
  w.activate(page.id);
  await w.handle('run', { item: find('aujourd’hui dans', 'moveTabToday', space.id) });
  check('« Déplacer vers Aujourd’hui » dans son propre Espace : désépinglé', space.today[0] === page.id && !space.pinned.length);
  const snapshot = JSON.stringify([space.today, space.pinned, other.today, other.pinned]);
  for (const arg of ['inconnu', null, 42, { id: other.id }, '__proto__']) {
    w.run('focusSpace', arg);
    w.run('moveTabToday', arg);
    w.run('moveTabPinned', arg);
    w.run('openFolder', arg);
    w.run('extensionAction', arg);
  }
  check('identifiant d’Espace, de dossier ou d’extension inconnu ou mal formé : rien ne bouge', w.spaceId === space.id && JSON.stringify([space.today, space.pinned, other.today, other.pinned]) === snapshot);

  // Dossiers : le nom l'ouvre, parents compris, et le montre.
  const outer = { type: 'folder', id: 'dossier-ext', name: 'Recettes', open: false, children: [] };
  const inner = { type: 'folder', id: 'dossier-int', name: 'Desserts glacés', open: false, children: [] };
  outer.children.push(inner);
  space.pinned.push(outer);
  space.pinnedCollapsed = true;
  w.changed();
  const dir = find('desserts', 'openFolder');
  check('taper le nom d’un dossier le propose', !!dir && dir.arg === inner.id && dir.subtitle === T('cmd.folder') && !!find('recettes', 'openFolder'));
  const reveal0 = w.reveal ? w.reveal.n : 0;
  await w.handle('run', { item: dir });
  check('… exécutée : le dossier et son parent s’ouvrent, les épinglés se déplient, la ligne est montrée',
    inner.open === true && outer.open === true && !space.pinnedCollapsed && w.reveal.id === inner.id && w.reveal.n === reveal0 + 1);
  await until(() => ui(`!!document.querySelector('#pinned [data-id="dossier-int"]')`), 'dossier affiché dans la barre latérale');
  space.pinned.length = 0;
  w.changed();

  // Extensions : le nom d'une extension la déclenche.
  {
    const ses = w.session;
    const extHost = require('../src/main/ext-host');
    const ext = await ses.extensions.loadExtension(path.join(__dirname, 'ext-fixture-sans'));
    await until(() => extHost.actionsFor(w).some((x) => x.id === ext.id), 'bouton de l’extension connu d’Orbe');
    const item = find('marquer la page', 'extensionAction');
    const calls = [];
    const open0 = extHost.openPopup;
    extHost.openPopup = (win2, id) => { calls.push([win2 === w, id]); return true; };
    if (item) await w.handle('run', { item });
    w.run('extensionAction', 'a'.repeat(32));
    extHost.openPopup = open0;
    check('taper le nom d’une extension la déclenche (comme un clic sur son bouton)', !!item && item.arg === ext.id && item.subtitle === T('cmd.extension') && calls.length === 1 && calls[0][0] && calls[0][1] === ext.id, JSON.stringify(calls));
    ses.extensions.removeExtension(ext.id);
    await until(() => !extHost.actionsFor(w).some((x) => x.id === ext.id), 'extension retirée');
    check('extension retirée : elle n’est plus proposée', !find('marquer la page', 'extensionAction'));
  }

  // La liste des actions est gardée d'une frappe à l'autre.
  check('la liste des actions n’est pas refaite à chaque frappe', palette.commandList(w) === palette.commandList(w) && palette.commandList(w).every((c) => typeof c.title === 'string'));
  store.state.settings.lang = 'en';
  check('… mais suit la langue', !!find('focus on', 'focusSpace') && !!find('mute all', 'muteAll'));
  store.state.settings.lang = lang0;

  // --- ⇥ sur une barre vide : les actions seules ------------------------------------
  const all = await w.handle('suggest', { q: '', scope: 'actions' });
  const few = await w.handle('suggest', { q: 'espace', scope: 'actions' });
  check('portée « Actions » : rien que des actions, la liste entière puis filtrée par la saisie',
    all.length > 20 && all.every((i) => i.kind === 'command') && few.length > 1 && few.length < all.length && few.every((i) => /espace/i.test(i.title)) && few.some((i) => i.command === 'focusSpace'));
  check('portée inconnue : traitée comme une recherche ordinaire', (await w.handle('suggest', { q: 'essai', scope: 'tout' })).some((i) => i.kind === 'search'));

  // --- Recherche dans un site -------------------------------------------------------
  const hint = w.suggestLocal('youtube').find((i) => i.kind === 'site');
  check('la saisie désigne un site : ligne « Rechercher sur YouTube »', !!hint && hint.site === 'youtube' && hint.title === T('cmd.searchSite', { site: 'YouTube' }) && !!w.suggestLocal('yt').find((i) => i.kind === 'site')
    && !w.suggestLocal('youtu').some((i) => i.kind === 'site'));
  const inSite = await w.handle('suggest', { q: 'chats & chiens', scope: { site: 'youtube' } });
  check('recherche dans un site : une seule ligne, l’adresse de recherche du site',
    inSite.length === 1 && inSite[0].kind === 'search' && inSite[0].url === 'https://www.youtube.com/results?search_query=chats%20%26%20chiens' && inSite[0].subtitle === T('cmd.searchSite', { site: 'YouTube' }));
  check('site inconnu ou requête vide : aucune ligne', (await w.handle('suggest', { q: 'x', scope: { site: 'inconnu' } })).length === 0 && (await w.handle('suggest', { q: '  ', scope: { site: 'github' } })).length === 0);
  check('adresses propres à la langue (Wikipédia)', palette.siteUrl(palette.siteFor('wiki'), 'orbe') === 'https://fr.wikipedia.org/w/index.php?search=orbe');
  check('chaque site a une adresse https avec la requête, et des clés sans doublon',
    palette.SITES.every((s) => /^https:\/\/[^%]+%s/.test(s.url) && s.keys.length) && new Set(palette.SITES.flatMap((s) => s.keys)).size === palette.SITES.flatMap((s) => s.keys).length);

  // --- Suppression d'une suggestion, dédoublonnage ------------------------------------
  const h = {};
  const visit = (url, title, last = 0) => { h[url] = { url, title, visits: 2, last: Date.now() - last }; };
  visit('https://pagaie.exemple.fr/', 'Pagaie en mer');
  visit('https://pagaie.exemple.fr/sorties', 'Pagaie : sorties', 1000);
  visit('https://github.com/orbe/depot/pull/1', 'Fusion pagaie · orbe/depot', 2000);
  visit('https://github.com/orbe/depot/pull/1/files', 'Fusion pagaie · orbe/depot', 3000);
  visit('https://github.com/orbe/depot/pull/1/commits', 'Fusion pagaie · orbe/depot', 4000);
  visit('https://www.figma.com/file/abc?node-id=1', 'Maquette pagaie', 5000);
  visit('https://www.figma.com/file/abc?node-id=2', 'Maquette pagaie', 6000);
  visit('https://blog.exemple.org/pagaie-1', 'Carnet pagaie', 7000);
  visit('https://blog.exemple.org/pagaie-2', 'Carnet pagaie', 8000);
  store.state.history = h;
  store.state.archive = [{ url: 'https://archive.exemple.fr/pagaie', title: 'Pagaie archivée', at: Date.now() }];
  suggest.forget();
  // (Seulement l'historique : les lignes d'onglets et d'actions prennent sinon la place.)
  const hist = (q) => suggest.local(q, { tabs: [], commands: [], activeId: null }).filter((i) => i.kind === 'history');
  let got = hist('pagaie');
  const count = (re) => got.filter((i) => re.test(i.url)).length;
  check('historique : une seule ligne par titre pour GitHub et Figma, les autres sites gardent leurs doublons',
    count(/github\.com/) === 1 && count(/figma\.com/) === 1 && count(/blog\.exemple\.org/) === 2, titles(got).join(' | '));
  check('la ligne gardée est la mieux classée (la plus récente)', got.find((i) => /github/.test(i.url)).url === 'https://github.com/orbe/depot/pull/1');
  check('les suggestions de l’historique et de l’archive peuvent être oubliées, pas les autres',
    got.every((i) => i.deletable === true) && w.suggestLocal('pagaie').filter((i) => i.kind !== 'history').every((i) => !i.deletable));

  hist('pag');
  const rev0 = store.historyRev;
  const gone = await w.handle('suggestDelete', { url: 'https://pagaie.exemple.fr/sorties', deletable: true });
  got = hist('paga');
  check('oublier une suggestion : la page quitte l’historique, et la frappe suivante ne la propose plus',
    gone === true && !store.state.history['https://pagaie.exemple.fr/sorties'] && store.historyRev > rev0 && !got.some((i) => i.url === 'https://pagaie.exemple.fr/sorties') && !suggest.stats.incremental);
  check('oublier une entrée de l’archive la retire de l’archive', (await w.handle('suggestDelete', { url: 'https://archive.exemple.fr/pagaie', deletable: true })) === true && !store.state.archive.length);
  const size = Object.keys(store.state.history).length;
  const refused = [];
  for (const bad of [null, 'https://pagaie.exemple.fr/', { url: 42, deletable: true }, { url: 'https://pagaie.exemple.fr/' }, { url: 'constructor', deletable: true }, { url: 'https://jamais.vu/', deletable: true }]) refused.push(await w.handle('suggestDelete', bad));
  check('demande mal formée, sans marque « oubliable » ou adresse inconnue : rien n’est retiré', refused.every((r) => r === false) && Object.keys(store.state.history).length === size, JSON.stringify(refused));
  store.state.history = history0;
  store.state.archive = archive0;
  suggest.forget();

  // --- ⌘L puis Entrée sans rien changer : la page est actualisée -----------------------
  w.navigate(base + '/compteur', page.id);
  await until(() => d.tabs[page.id].title === 'Essai compteur', 'page compteur');
  const loads = hits['/compteur'];
  w.openCommand('edit');
  const shown = await until(() => w.modal.webContents.executeJavaScript('document.getElementById("cmd-input").value'), 'adresse dans la barre');
  await w.handle('run', { item: { kind: 'raw', title: shown } });
  await until(() => hits['/compteur'] === loads + 1, 'page actualisée');
  await sleep(150);
  check('⌘L puis Entrée sans rien changer : la page est actualisée, dans le même onglet', shown === base + '/compteur' && w.activeId === page.id && d.tabs[page.id].url === base + '/compteur' && hits['/compteur'] === loads + 1);

  // --- Aspect : pas de voile derrière, grande ombre, couleurs de l'Espace --------------
  w.openCommand('new');
  const look = await until(() => w.modal.webContents.executeJavaScript(`(() => {
    const box = document.getElementById('command');
    if (box.hidden) return null;
    const cs = getComputedStyle(box);
    return { voile: getComputedStyle(document.getElementById('backdrop')).backgroundColor, corps: getComputedStyle(document.body).backgroundColor, ombre: cs.boxShadow,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), teinte: getComputedStyle(document.documentElement).getPropertyValue('--panel-tint').trim(),
      sites: Object.keys(sites).length, portee: document.getElementById('cmd-scope').hidden };
  })()`), 'barre de commande affichée');
  const Theme = require('../src/renderer/theme');
  const expected = Theme.palette(w.themeNow().space, w.themeNow().dark).accent;
  check('barre de commande : aucun voile sur la page, grande ombre portée (70 px)', look.voile === 'rgba(0, 0, 0, 0)' && look.corps === 'rgba(0, 0, 0, 0)' && /70px/.test(look.ombre), JSON.stringify(look));
  check('elle prend les couleurs de l’Espace (accent, panneau teinté)', look.accent.toLowerCase() === expected.toLowerCase() && look.teinte === '9%', `${look.accent} / ${expected} / ${look.teinte}`);
  check('la vue connaît les sites où chercher, sans portée au départ', look.sites === palette.SITES.flatMap((s) => s.keys).length && look.portee === true);

  // --- La barre latérale reste cliquable ----------------------------------------------
  await until(() => ui(`!!document.querySelector('#today .row.tab[data-id="${quiet}"]')`), 'ligne de l’autre onglet');
  const at = await ui(`(() => { const r = document.querySelector('#today .row.tab[data-id="${quiet}"]').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  check('avant le clic : barre ouverte, autre onglet actif', w.modalMode === 'command' && w.activeId === page.id);
  w.handle('closeOverlay', at);
  await until(() => w.activeId === quiet, 'onglet cliqué à travers le fond');
  check('clic sur le fond, au-dessus d’un onglet de la barre latérale : la barre se ferme et l’onglet s’active', w.modalMode === null && w.activeId === quiet);
  w.activate(page.id);
  w.openCommand('new');
  const rect = w.contentRect();
  w.handle('closeOverlay', { x: rect.x + 200, y: rect.y + 200 });
  w.openCommand('new');
  for (const bad of [{ x: 'a', y: 3 }, { x: -5, y: 10 }, { x: 1e9, y: 1e9 }, 'ici']) { w.handle('closeOverlay', bad); w.openCommand('new'); }
  w.handle('closeOverlay');
  await sleep(150);
  check('clic sur le fond, au-dessus de la page ou point mal formé : la barre se ferme, rien d’autre', w.modalMode === null && w.activeId === page.id);

  // --- Fenêtre neuve : la barre s'ouvre seule ; barre vide sans onglet : de quoi démarrer ---
  const before = OrbeWindow.all.length;
  const w2 = commands.run(w, 'newWindow');
  check('⌘N : la fenêtre neuve, sans onglet, s’ouvre sur la barre de commande', OrbeWindow.all.length === before + 1 && !!w2 && w2 !== w && w2.modalMode === 'command' && w2.commandMode === 'new');
  check('barre vide : les onglets récents, tant qu’il y en a', w2.suggestLocal('').length > 0 && w2.suggestLocal('').every((i) => i.kind === 'tab'));
  w2.win.close();
  // Fenêtre de navigation privée : aucun onglet nulle part.
  const w3 = commands.run(w, 'newIncognito');
  const lone = w3.suggestLocal('');
  check('fenêtre sans aucun onglet : la barre s’ouvre, et propose de quoi démarrer (aide, raccourcis, réglages)',
    w3.modalMode === 'command' && lone.length >= 4 && lone.every((i) => i.kind === 'command') && ['welcome', 'shortcuts', 'helpCenter', 'settings'].every((n) => lone.some((i) => i.command === n)), titles(lone).join(' | '));
  w3.win.close();
  await until(() => OrbeWindow.all.length === before, 'fenêtres d’essai refermées');

  // --- Note à côté de la page ------------------------------------------------------------
  w.activate(page.id);
  const notes0 = store.state.notes.length;
  const note = await w.runItem(find('à côté de la page', 'newNoteSplit'));
  const group = w.groupOf(page.id);
  check('« Nouvelle note à côté de la page » : la note s’ouvre en vue scindée avec la page', !!note && d.tabs[note.id].internal === true && !!group && group.includes(note.id) && group.includes(page.id) && w.visibleIds().length === 2);
  await until(() => store.state.notes.length === notes0 + 1, 'note créée');
  w.close(note.id, { ask: false });
  store.state.notes.length = notes0;

  // --- Remise en état ---------------------------------------------------------------------
  w.hideModal();
  for (const sp of [space, other]) {
    for (const id of [...sp.today]) { win.OrbeWindow.destroyView(id); delete d.tabs[id]; }
    sp.today = [];
    sp.pinned = [];
    sp.splits = [];
    delete w.activeBySpace[sp.id];
    d.spaces.splice(d.spaces.indexOf(sp), 1);
  }
  store.state.archive = archive0;
  w.closed.length = 0;
  w.undoStack.length = 0;
  w.redoStack.length = 0;
  w.spaceId = home;
  if (homeActive && d.tabs[homeActive]) w.activeBySpace[home] = homeActive;
  w.layout();
  w.changed();
  if (server.closeAllConnections) server.closeAllConnections();
  server.close();
  if (!ctx.check && failed) throw new Error(`${failed} vérification(s) en échec`);
};
