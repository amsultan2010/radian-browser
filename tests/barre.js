// Barre latérale : sélection multiple et pile d'annulation, sans réseau.
// Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/barre.js node scripts/dev.js --selftest
// Les onglets sont créés dans un Espace à part (jamais chargés : seules les
// données comptent ici) ; les messages passent par `handle`, la porte
// qu'emprunte la barre latérale, pour vérifier aussi le contrôle des arguments.
const { clipboard } = require('electron');

const { sleep, until } = require('./outils');

module.exports = async function barreTests(ctx) {
  const { first: w, store, win, commands } = ctx;
  let failed = 0;
  const check = ctx.check || ((name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`); });
  const ui = (js) => w.ui.webContents.executeJavaScript(js);
  const d = w.data;
  // Adresse locale qui refuse la connexion : rien ne sort de la machine.
  const url = (n) => `http://127.0.0.1:9/${n}`;
  const names = (ids) => ids.map((id) => (d.tabs[id] ? d.tabs[id].title : '?')).join('');
  const tree = (nodes) => nodes.map((n) => (n.type === 'folder' ? `[${tree(n.children)}]` : d.tabs[n.id].title)).join('');

  await until(() => ui('typeof S === "object" && S !== null'), 'coque chargée');
  const home = w.spaceId;
  const space = store.makeSpace('Essais', '🧪', '#0ea5e9');
  const other = store.makeSpace('Ailleurs', '📦', '#f97316');
  d.spaces.push(space, other);
  w.switchSpace(space.id);
  // Onglets A…H dans Aujourd'hui, dans cet ordre.
  const make = (letters, sp = space) => [...letters].map((c) => {
    const tab = w.createTab(url(c), { space: sp, index: sp.today.length });
    tab.title = c;
    return tab.id;
  });
  // Onglets créés par ces essais, et remise à vide des Espaces d'essai.
  const mine = (id) => !!d.tabs[id] && d.tabs[id].url.startsWith(url(''));
  const wipe = (...spaces) => {
    for (const sp of spaces.length ? spaces : [space, other]) {
      sp.pinned = [];
      sp.today = [];
      sp.splits = [];
      delete w.activeBySpace[sp.id];
    }
    const kept = new Set(d.spaces.flatMap((sp) => w.orderedIds(sp)));
    for (const list of Object.values(d.favs)) for (const id of list.filter((x) => mine(x) && !kept.has(x))) list.splice(list.indexOf(id), 1);
    for (const id of Object.keys(d.tabs)) if (mine(id) && !kept.has(id)) { win.OrbeWindow.destroyView(id); delete d.tabs[id]; }
    store.state.archive = store.state.archive.filter((x) => !x.url.startsWith(url('')));
    w.closed.length = 0;
    w.undoStack.length = 0;
    w.redoStack.length = 0;
  };
  const [A, B, C, D, E, F, G, H] = make('ABCDEFGH');
  const today = () => names(space.today);
  const pinned = () => tree(space.pinned);
  w.changed();
  await until(() => ui('document.querySelectorAll("#today .row.tab").length === 8'), 'huit lignes affichées');

  // --- Sélection multiple ---------------------------------------------------
  const foreign = make('Z', other)[0];
  const folderX = { type: 'folder', id: 'dossier-x', name: 'X', open: true, children: [] };
  space.pinned.push(folderX);
  check('sélection : seuls les onglets affichés sont retenus, dans l’ordre de la barre',
    w.checkIds([D, 'inconnu', B, 42, null, foreign, folderX.id, B, { id: A }]).join() === [B, D].join()
    && w.checkIds('abc').length === 0 && w.checkIds(null).length === 0 && w.checkIds({ length: 2, 0: A, 1: B }).length === 0);

  w.handle('move', { ids: [F, B, D], to: 'today', index: 1 });
  check('sélection : déposer trois onglets ensemble les insère dans leur ordre', today() === 'ABDFCEGH', today());
  w.handle('move', { ids: [B, D, F], to: 'today', index: 8 });
  check('sélection : dépôt en fin de liste', today() === 'ACEGHBDF', today());
  w.handle('move', { ids: [A, H], to: 'today', index: 4 });
  check('sélection : dépôt au milieu du lot lui-même, autour de la position visée', today() === 'CEGAHBDF', today());
  w.handle('move', { ids: [C, E], to: 'ailleurs', index: 0 });
  w.handle('move', { ids: [C, E], to: 'folder', folderId: 'inconnu' });
  w.handle('move', { ids: [foreign, folderX.id], to: 'today', index: 0 });
  check('sélection : destination inconnue ou identifiants étrangers, rien ne bouge', today() === 'CEGAHBDF' && other.today.join() === foreign && pinned() === '[]');
  w.handle('move', { id: F, to: 'today', index: 0 });
  check('un seul identifiant : le déplacement simple est inchangé', today() === 'FCEGAHBD', today());

  w.handle('move', { ids: [C, G], to: 'folder', folderId: folderX.id, index: 0 });
  check('sélection : déposée dans un dossier', pinned() === '[CG]' && today() === 'FEAHBD' && d.tabs[C].homeUrl === url('C'));
  w.handle('move', { ids: [E, C], to: 'pinned', index: 0 });
  check('sélection mêlée (dossier et Aujourd’hui) : déposée dans les épinglés', pinned() === 'CE[G]' && today() === 'FAHBD', pinned());

  w.pinMany([A, C, B]);
  check('sélection : épingler ajoute les onglets du jour aux épinglés', pinned() === 'CE[G]AB' && today() === 'FHD', pinned());
  w.pinMany([C, A, G]);
  check('sélection entièrement épinglée : désépingler les ramène en tête d’Aujourd’hui', pinned() === 'E[]B' && today() === 'CGAFHD' && !d.tabs[C].homeUrl, pinned() + ' ' + today());
  w.favoriteMany([A, E, D]);
  check('sélection : ajoutée aux favoris', names(w.favorites) === 'EAD' && today() === 'CGFH' && pinned() === '[]B');
  w.favoriteMany([D, E]);
  check('sélection de favoris : retirée des favoris', names(w.favorites) === 'A' && today() === 'EDCGFH', today());
  w.favoriteMany([A]);

  const tpl = w.tabsMenuTemplate(w.checkIds([C, G, F]));
  const labels = tpl.filter((x) => x.label && x.visible !== false).map((x) => x.label);
  check('menu de la sélection : copier les liens, dupliquer, épingler, favoris, dossier, déplacer, archiver',
    labels.join('|') === ['tabs.copyLinks', 'tabs.duplicate', 'tabs.pinMany', 'tabs.addFavorite', 'tabs.folderFromSelection', 'tabs.moveTo', 'tabs.closeMany'].map((k) => store.t(k, null, { n: 3 })).join('|'), labels.join('|'));

  const previousClipboard = await clipboard.readText();
  w.copyLinks([G, C, foreign]);
  await until(async () => (await clipboard.readText()) === `${url('C')}\n${url('G')}`, 'liens dans le presse-papiers');
  check('sélection : « Copier les liens », un par ligne', true);
  w.handle('select', [F, H]);
  w.run('copyUrl');
  await until(async () => (await clipboard.readText()) === `${url('F')}\n${url('H')}`, 'liens de la sélection');
  check('⇧⌘C avec une sélection copie tous ses liens', true);
  await clipboard.writeText(previousClipboard);
  w.handle('select', []);

  const before = space.today.length;
  w.duplicateMany([D, B]);
  const copies = space.today.filter((id) => ![A, B, C, D, E, F, G, H].includes(id));
  check('sélection : dupliquer place chaque copie sous son modèle (en tête pour un épinglé)',
    space.today.length === before + 2 && today() === 'BAEDDCGFH' && pinned() === '[]B' && win.live.has(copies[0]) && w.activeId === null, today());
  w.handle('close', { ids: copies });
  check('sélection : archiver par la barre latérale ({ ids })', today() === 'AEDCGFH' && copies.every((id) => !d.tabs[id]) && !win.live.has(copies[0]));

  w.folderFromSelection([G, B, E]);
  const made = space.pinned.find((n) => n.type === 'folder' && n.id !== folderX.id);
  check('« Nouveau dossier avec la sélection » : le dossier prend la place du premier épinglé', pinned() === '[][BEG]' && today() === 'ADCFH' && !!made, pinned());
  await until(() => ui('!!document.querySelector("#pinned .folder input.rename")'), 'nom du dossier à saisir');
  await ui('document.querySelector("input.rename").blur()');

  w.moveManyToSpace([D, F, B], other.id);
  check('sélection : déplacée vers un autre Espace, ordre conservé', names(other.today) === 'DFZ' && tree(other.pinned) === 'B' && today() === 'ACH' && pinned() === '[][EG]', names(other.today));

  // La barre latérale annonce sa sélection ; ⌘W l'archive, et la sélection tombe.
  await until(() => ui('S.today.length === 3'), 'barre à jour');
  await ui(`setSel(${JSON.stringify([C, H])}); sel.size`);
  await until(() => w.selected().join() === [C, H].join(), 'sélection annoncée');
  check('la barre latérale annonce sa sélection (lignes surlignées)', await ui('document.querySelectorAll("#today .row.tab.sel").length') === 2);
  w.run('closeTab');
  check('⌘W avec une sélection archive tous ses onglets', today() === 'A' && !d.tabs[C] && !d.tabs[H] && store.state.archive[0].url === url('C'));
  await until(() => ui('sel.size === 0 && document.querySelectorAll(".sel").length === 0'), 'sélection vidée après l’action');
  check('après l’action, la barre latérale vide sa sélection', w.selected().length === 0);
  check('sans sélection, ⌘W garde son sens habituel', (() => { const t = w.createTab(url('seul'), { space }); w.activate(t.id); w.run('closeTab'); return !d.tabs[t.id]; })());

  // --- Annulation (⌘Z, ⇧⌘Z) ------------------------------------------------
  const electron = require('electron');
  const T = (k) => store.t(k);
  const pending = (way = 'undo') => w.pendingLabel(way);
  // Tout ce que les actions de la barre peuvent changer, en une chaîne.
  const full = (nodes) => nodes.map((n) => (n.type === 'folder' ? `${n.name}[${full(n.children)}]` : (d.tabs[n.id] ? (d.tabs[n.id].customTitle || d.tabs[n.id].title) + (d.tabs[n.id].homeUrl ? '°' : '') : '?'))).join(' ');
  const flat = (ids) => full(ids.map((id) => ({ id })));
  const snap = () => d.spaces.filter((s) => s.id === space.id || s.id === other.id)
    .map((s) => `${s.icon}${s.name} | ${full(s.pinned)} | ${flat(s.today)}`).join(' // ') + ' // favoris ' + flat(w.favorites.filter((id) => mine(id)));
  wipe();
  w.switchSpace(space.id);
  const [a1, b1, c1, d1, e1, f1] = make('abcdef');
  make('z', other);
  w.undoStack.length = 0;
  w.redoStack.length = 0;
  let dossier = null;
  // Une suite d'actions variées ; l'état est relevé après chacune.
  const actions = [
    ['undo.move', () => w.handle('move', { id: c1, to: 'today', index: 0 })],
    ['undo.newFolder', () => { w.newFolder(); dossier = space.pinned[0].id; }],
    ['undo.move', () => w.move({ id: b1, to: 'folder', folderId: dossier, index: 0 })],
    ['undo.move', () => w.move({ id: d1, to: 'folder', folderId: dossier, index: 0 })],
    ['undo.pin', () => w.togglePin(e1)],
    ['undo.moveFolder', () => w.move({ id: dossier, to: 'pinned', index: 2 })],
    ['undo.addFavorite', () => w.toggleFavorite(a1)],
    ['undo.renameTab', () => w.handle('rename', { id: e1, name: 'Mon E' })],
    ['undo.renameFolder', () => w.rename(dossier, 'Rangement')],
    ['undo.renameSpace', () => w.rename(space.id, 'Renommé')],
    ['undo.moveMany', () => w.handle('move', { ids: [c1, f1], to: 'pinned', index: 1 })],
    ['undo.unpin', () => w.togglePin(c1)],
    ['undo.removeFavorite', () => w.toggleFavorite(a1)],
    ['undo.pinMany', () => w.pinMany([a1, c1])],
    ['undo.moveToSpace', () => w.moveToSpace(f1, other.id)],
    ['undo.moveToSpace', () => w.moveManyToSpace([b1, a1], other.id)],
    ['undo.newFolder', () => w.folderFromSelection([d1, c1])],
    ['undo.unpinMany', () => w.pinMany([d1, c1, e1])],
    ['undo.archive', () => w.handle('close', d1)],
    ['undo.archiveMany', () => w.handle('close', { ids: [c1, e1] })],
    // Dossier sans onglet : supprimé sans question (garni, il archive son contenu : tests/finitions.js).
    ['undo.deleteFolder', () => { w.deleteFolder(dossier); }],
  ];
  const states = [snap()];
  const seen = [];
  for (const [, run] of actions) { run(); states.push(snap()); seen.push(pending()); }
  await sleep(120);
  await ui('document.activeElement && document.activeElement.blur()');
  check('annulation : chaque action de la barre est retenue sous son libellé',
    seen.join() === actions.map((x) => x[0]).join() && states.every((s, i) => i === 0 || s !== states[i - 1]) && w.undoStack.length === actions.length,
    seen.map((l, i) => (l === actions[i][0] && states[i + 1] !== states[i] ? '' : `${i}:${l}`)).filter(Boolean).join(' '));
  check('annulation : onglets archivés présents dans l’archive', !d.tabs[d1] && !d.tabs[c1] && store.state.archive.filter((x) => x.url.startsWith(url(''))).length >= 3);
  let wrong = [];
  for (let i = actions.length - 1; i >= 0; i--) {
    const label = pending();
    const done = w.replay('undo');
    if (!done || label !== actions[i][0] || snap() !== states[i]) wrong.push(`${i} ${actions[i][0]} : ${snap()} ≠ ${states[i]}`);
  }
  check('⌘Z défait toute la suite, état pour état : déplacements (liste, dossier, rang), épinglage, favoris, noms, dossiers, autre Espace, archive', !wrong.length && snap() === states[0], wrong.join('\n'));
  check('⌘Z : les onglets archivés reviennent avec leur identifiant et sortent de l’archive', !!d.tabs[d1] && !!d.tabs[c1] && !!d.tabs[e1] && !store.state.archive.some((x) => x.url.startsWith(url(''))));
  check('⌘Z sans plus rien à défaire : rien ne se passe', w.replay('undo') === false && pending() === null && pending('redo') === actions[0][0]);
  wrong = [];
  for (let i = 0; i < actions.length; i++) {
    const label = pending('redo');
    const done = w.replay('redo');
    if (!done || label !== actions[i][0] || snap() !== states[i + 1]) wrong.push(`${i} ${actions[i][0]} : ${snap()} ≠ ${states[i + 1]}`);
  }
  check('⇧⌘Z refait toute la suite, état pour état', !wrong.length && pending('redo') === null, wrong.join('\n'));
  w.replay('undo');
  w.replay('undo');
  w.rename(space.id, 'Autre nom');
  check('une nouvelle action vide la liste de ce qui peut être rétabli', pending('redo') === null && pending() === 'undo.renameSpace');

  // Effacer Aujourd'hui : tout revient, dans l'ordre, l'onglet affiché ne change pas.
  wipe();
  const lot = make('ghijk');
  w.activate(lot[2]);
  const avantEffacer = snap();
  w.run('clearToday');
  check('⇧⌘K : une seule entrée « Effacer Aujourd’hui »', space.today.join() === lot[2] && pending() === 'undo.clearToday');
  w.replay('undo');
  check('⌘Z après « Effacer Aujourd’hui » : tous les onglets reviennent dans l’ordre', snap() === avantEffacer && space.today.join() === lot.join() && w.activeId === lot[2], snap());
  w.replay('redo');
  check('⇧⌘Z : Aujourd’hui est de nouveau effacé', space.today.join() === lot[2]);
  w.replay('undo');

  // ⌘Z et ⇧⌘T ne rouvrent pas deux fois le même onglet.
  w.handle('close', lot[0]);
  w.handle('close', lot[4]);
  w.run('reopen');
  check('⇧⌘T rouvre le dernier onglet fermé, sous le même identifiant et à sa place', space.today.join() === lot.slice(1).join() && w.activeId === lot[4]);
  check('⌘Z saute l’onglet déjà rouvert par ⇧⌘T', pending() === 'undo.archive' && w.replay('undo') && space.today.join() === lot.join() && pending() !== 'undo.archive', flat(space.today));

  // Une vue scindée archivée revient entière.
  w.splitWith(lot[0], lot[1], true);
  w.groupOf(lot[0]).ratios = [0.3, 0.7];
  w.handle('close', { ids: [lot[0], lot[1]] });
  w.replay('undo');
  const regroupe = w.groupOf(lot[0]);
  check('⌘Z rétablit aussi la vue scindée des onglets archivés', !!regroupe && regroupe.join() === [lot[0], lot[1]].join() && regroupe.ratios.join() === '0.3,0.7' && space.splits.length === 1);
  w.leaveSplit(lot[0]);

  // Suppression d'un Espace (la confirmation est acceptée d'office).
  w.switchSpace(other.id);
  wipe(other);
  const [p1, p2, t1, t2] = make('pqrs', other);
  other.today.splice(0, 2);
  other.pinned.push({ type: 'tab', id: p1 }, { type: 'folder', id: 'dossier-y', name: 'Y', open: true, children: [{ type: 'tab', id: p2 }] });
  d.tabs[p1].homeUrl = url('p');
  d.tabs[p2].homeUrl = url('q');
  Object.assign(other, { color: '#22c55e', color2: '#3b82f6', grain: 0.4, icon: '🌿' });
  w.activate(t1);
  const avantSuppr = snap();
  const rang = d.spaces.indexOf(other);
  const ask = electron.dialog.showMessageBox;
  electron.dialog.showMessageBox = async () => ({ response: 0 });
  await w.deleteSpace(other.id);
  electron.dialog.showMessageBox = ask;
  check('Espace supprimé : ses onglets disparaissent, ceux du jour vont à l’archive',
    !d.spaces.includes(other) && !d.tabs[p1] && !d.tabs[t1] && !win.live.has(t1) && store.state.archive.some((x) => x.url === url('r')) && w.spaceId !== other.id && pending() === 'undo.deleteSpace');
  w.replay('undo');
  check('⌘Z rétablit l’Espace : même rang, épinglés, dossier, onglets du jour, thème',
    d.spaces.indexOf(other) === rang && snap() === avantSuppr && w.spaceId === other.id && w.activeId === t1 && !!d.tabs[p2] && d.tabs[p2].homeUrl === url('q')
    && other.color === '#22c55e' && other.color2 === '#3b82f6' && other.grain === 0.4 && other.icon === '🌿' && !store.state.archive.some((x) => x.url === url('r') || x.url === url('s')), snap());
  w.replay('redo');
  check('⇧⌘Z supprime de nouveau l’Espace', !d.spaces.includes(other) && !d.tabs[t2]);
  w.replay('undo');
  check('… et ⌘Z le rétablit encore', d.spaces.indexOf(other) === rang && snap() === avantSuppr);

  // Aperçu fermé : ⌘Z le rouvre, ⇧⌘Z le referme, ⇧⌘T le rouvre aussi.
  w.openPeek(url('apercu'), t1);
  w.run('closeTab');
  check('⌘W ferme l’aperçu et le retient pour ⌘Z', !w.peekState && pending() === 'undo.closePeek' && w.activeId === t1);
  w.replay('undo');
  check('⌘Z rouvre l’aperçu fermé', !!w.peekState && w.peekState.url === url('apercu') && w.peekState.from === t1);
  w.replay('redo');
  check('⇧⌘Z le referme', !w.peekState && pending() === 'undo.closePeek');
  w.run('reopen');
  check('⇧⌘T rouvre aussi un aperçu fermé ; ⌘Z ne le rouvre pas une seconde fois', !!w.peekState && w.peekState.url === url('apercu') && pending() !== 'undo.closePeek');
  w.closePeek();

  // Libellé du menu Édition, par la commande elle-même.
  w.switchSpace(space.id);
  w.handle('close', lot[3]);
  const item = (name) => {
    const accel = commands.byName.get(name).accel;
    const find = (m) => { for (const it of m.items) { if (it.accelerator === accel) return it; const f = it.submenu && find(it.submenu); if (f) return f; } return null; };
    return find(electron.Menu.getApplicationMenu());
  };
  await until(() => item('undo').label === `${T('edit.undo')} ${T('undo.archive')}`, 'libellé du menu Édition');
  check('menu Édition : « Annuler Archiver l’onglet »', (store.state.settings.lang !== 'fr' || item('undo').label === 'Annuler Archiver l’onglet') && item('redo').label === T('edit.redo'), item('undo').label);
  // Le clavier dans un champ de texte de la barre : ⌘Z reste l'annulation du texte.
  const focused = electron.webContents.getFocusedWebContents;
  electron.webContents.getFocusedWebContents = () => w.ui.webContents;
  await until(() => ui(`S.space.id === ${JSON.stringify(space.id)} && !!document.querySelector('#today [data-id="${lot[2]}"]')`), 'ligne affichée');
  await ui(`startRename(${JSON.stringify(space.id)}); document.activeElement.tagName`);
  const taille = w.undoStack.length;
  await w.run('undo');
  check('dans un champ de texte, ⌘Z ne touche pas à la barre latérale', w.undoStack.length === taille && !d.tabs[lot[3]]);
  await ui('document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))');
  await w.run('undo');
  check('hors d’un champ de texte, la commande ⌘Z défait l’action', !!d.tabs[lot[3]] && space.today.join() === lot.join());
  await until(() => item('redo').label === `${T('edit.redo')} ${T('undo.archive')}`, 'libellé « Rétablir »');
  await w.run('redo');
  check('la commande ⇧⌘Z la refait ; le menu dit « Rétablir Archiver l’onglet »', !d.tabs[lot[3]] && pending() === 'undo.archive');
  electron.webContents.getFocusedWebContents = focused;

  // Création d'un Espace.
  const combien = d.spaces.length;
  w.newSpace();
  const neuf = w.space;
  w.replay('undo');
  check('⌘Z défait la création d’un Espace', d.spaces.length === combien && !d.spaces.includes(neuf) && w.spaceId !== neuf.id && pending('redo') === 'undo.newSpace');
  w.replay('redo');
  check('⇧⌘Z recrée l’Espace', d.spaces.includes(neuf) && w.spaceId === neuf.id);
  w.replay('undo');
  await sleep(150); // le temps que la demande de nom du nouvel Espace arrive, sans objet
  w.switchSpace(space.id);

  // Pile bornée, propre à la fenêtre.
  for (let i = 0; i < 60; i++) w.rename(space.id, 'Nom ' + i);
  check('la pile d’annulation est bornée à 50 actions', w.undoStack.length === 50 && space.name === 'Nom 59');
  for (let i = 0; i < 50; i++) w.replay('undo');
  check('… et se vide proprement', space.name === 'Nom 9' && w.replay('undo') === false);
  w.undoStack.length = 0;
  w.redoStack.length = 0;

  // Remise en état : les deux Espaces d'essai disparaissent.
  wipe();
  for (const sp of [space, other]) d.spaces.splice(d.spaces.indexOf(sp), 1);
  w.spaceId = home;
  w.layout();
  w.changed();
  if (!ctx.check && failed) throw new Error(`${failed} vérification(s) en échec`);
};
