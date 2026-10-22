// Finitions de la barre latérale et des menus : icônes (Espace, dossier, onglet),
// suppression d'un dossier ou d'un Espace qui archive, fenêtre vierge, « Gérer les
// Espaces », articles du menu Édition, rendu de la barre sans retouche inutile.
// Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/finitions.js node scripts/dev.js --selftest
const electron = require('electron');

const { clipboard, Menu, dialog, shell, app } = electron;
const outils = require('./outils');
const icons = require('../src/main/icons');
const emojis = require('../src/renderer/emojis');

const { sleep } = outils;
const until = (fn, label, timeout = 10000) => outils.until(fn, label, timeout);

module.exports = async function finitionsTests(ctx) {
  const { first: w, store, win, commands, OrbeWindow } = ctx;
  const menu = ctx.menu || require('../src/main/menu');
  const platform = require('../src/main/platform');
  const shortcuts = ctx.shortcuts || require('../src/main/shortcuts');
  let failed = 0;
  const check = ctx.check || ((name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`); });
  const ui = (js) => w.ui.webContents.executeJavaScript(js);
  const modal = (js) => w.modal.webContents.executeJavaScript(js);
  const d = w.data;
  const T = (k, v) => store.t(k, null, v);
  const dead = (n) => `http://127.0.0.1:9/fin-${n}`;
  const labels = (tpl) => tpl.filter((x) => x.label && x.visible !== false).map((x) => x.label);
  const pick = (tpl, key, vars) => {
    const it = tpl.find((x) => x.label === T(key, vars) && x.visible !== false);
    if (!it) throw new Error('article absent : ' + T(key, vars));
    return it;
  };
  const toasts = [];
  const toast0 = w.toast;
  w.toast = (text, ...rest) => { toasts.push(text); return toast0.call(w, text, ...rest); };
  const clip0 = await clipboard.readText();

  await until(() => ui('typeof S === "object" && S !== null'), 'coque chargée');
  const home = w.spaceId;
  const homeActive = w.activeBySpace[home];
  const sidebar0 = w.sidebarVisible;
  if (!w.sidebarVisible) w.toggleSidebar(true);
  const tone0 = store.state.window.emojiTone;
  const archive0 = store.state.archive.length;
  const space = store.makeSpace('Finitions', '🧭', '#0ea5e9');
  d.spaces.push(space);
  w.switchSpace(space.id);
  const make = (letters, sp = space) => [...letters].map((c) => {
    const tab = w.createTab(dead(c), { space: sp, index: sp.today.length });
    tab.title = c;
    return tab.id;
  });
  const mine = (x) => String(x.url || '').startsWith(dead(''));
  const pending = () => w.pendingLabel('undo');

  // --- Icônes : vérification du texte reçu ---------------------------------------
  check('icône : un seul émoji est accepté (simple, teinté, composé, drapeau, touche)',
    ['🏠', '👍🏽', '👨‍👩‍👧‍👦', '🇫🇷', '⚙️', '1️⃣', '🧑🏿‍💻'].every(icons.valid));
  check('icône : lettres, balises, deux émojis, espace, texte trop long sont refusés',
    !['a', '<b>', '🏠🏠', '🏠 ', '', ' ', '1', '🏠'.repeat(20), null, 12, {}].some(icons.valid));
  check('sélecteur : chaque émoji proposé passe la vérification, dans les six teintes',
    emojis.EMOJI_LIST.every((x) => icons.valid(x.e)) && [...emojis.EMOJI_TONED].every((e) => [1, 2, 3, 4, 5].every((n) => icons.valid(emojis.emojiTone(e, n)) && emojis.emojiTone(e, n) !== e))
    && emojis.emojiTone('🏠', 3) === '🏠', String(emojis.EMOJI_LIST.length));
  check('sélecteur : la recherche lit les mots-clés français et anglais, sans tenir compte des accents',
    emojis.emojiSearch('fusee')[0].e === '🚀' && emojis.emojiSearch('rocket')[0].e === '🚀' && emojis.emojiSearch('étoile').some((x) => x.e === '🌟') && !emojis.emojiSearch('zzzzqq').length);

  // --- Icône d'un dossier, d'un onglet, d'un Espace -------------------------------
  const [A, B, C] = make('ABC');
  const folder = { type: 'folder', id: 'fin-dossier', name: 'Lot', open: true, children: [] };
  space.pinned.push(folder);
  w.move({ id: A, to: 'folder', folderId: folder.id, index: 0 });
  w.activate(B);
  w.undoStack.length = 0;
  let tpl = w.folderMenuTemplate(folder.id, false);
  check('menu d’un dossier : « Changer l’icône… »', labels(tpl).includes(T('tabs.changeIcon')));
  pick(tpl, 'tabs.changeIcon').click();
  await until(() => w.modalMode === 'icons', 'sélecteur ouvert');
  await until(() => modal('!document.getElementById("icons").hidden && document.querySelectorAll(".em-pick").length'), 'émojis affichés');
  check('sélecteur d’icône : champ de recherche actif, six teintes, rubriques titrées, pas de « icône d’origine » tant qu’aucune n’est choisie',
    await modal('document.activeElement.id === "icons-input" && document.querySelectorAll("#icons-tones .tone").length === 6 && document.querySelectorAll("#icons-list h4").length === 10 && document.getElementById("icons-reset").hidden'));
  check('sélecteur : il se place à droite de la barre latérale', await modal('parseInt(document.getElementById("icons").style.left, 10)') === w.sidebarWidth + 10);
  await modal('(() => { const i = document.getElementById("icons-input"); i.value = "fusée"; i.dispatchEvent(new Event("input")); })()');
  check('sélecteur : la saisie filtre la grille', await modal('[...document.querySelectorAll(".em-pick")].map((b) => b.textContent).join("")') === '🚀');
  check('icône refusée si ce n’est pas un émoji : rien ne change', w.handle('icon', { emoji: '<img src=x>' }) === false && w.handle('icon', { emoji: 'abc' }) === false && w.handle('icon', 'x') === false && !folder.icon && w.modalMode === 'icons');
  await modal('document.querySelector(".em-pick").click()');
  await until(() => folder.icon === '🚀', 'icône du dossier');
  check('choisir un émoji : le dossier le porte, le sélecteur se referme, ⌘Z propose « Changer l’icône »', w.modalMode === null && pending() === 'undo.changeIcon');
  await until(() => ui(`document.querySelector('#pinned .folder > .row .ic .emoji')?.textContent === '🚀'`), 'émoji sur la ligne du dossier');
  check('barre latérale : l’émoji remplace le dessin du dossier', await ui(`!document.querySelector('#pinned .folder > .row .ic svg')`));
  check('icône : un message reçu sans sélecteur ouvert est ignoré', w.handle('icon', { emoji: '🔥' }) === false && folder.icon === '🚀');
  w.replay('undo');
  await until(() => ui(`!!document.querySelector('#pinned .folder > .row .ic svg') && !document.querySelector('#pinned .folder > .row .ic .emoji')`), 'dessin du dossier revenu');
  check('⌘Z rend au dossier son dessin ; ⇧⌘Z remet l’émoji', !folder.icon && (w.replay('redo'), folder.icon === '🚀'));

  // Onglet : émoji à la place de l'icône du site, teinte de peau retenue, retour à l'origine.
  tpl = w.tabMenuTemplate(B);
  check('menu d’un onglet : « Changer l’icône… » ; « Réinitialiser le nom et l’icône » absent tant que rien n’est personnalisé',
    labels(tpl).includes(T('tabs.changeIcon')) && !labels(tpl).includes(T('tabs.resetNameIcon')));
  pick(tpl, 'tabs.changeIcon').click();
  await until(() => w.modalMode === 'icons', 'sélecteur ouvert pour l’onglet');
  await until(() => modal('document.querySelectorAll(".em-pick").length > 100'), 'grille complète');
  await modal('document.querySelector(\'#icons-tones .tone[data-tone="4"]\').click()');
  await until(() => modal('[...document.querySelectorAll(".em-pick")].some((b) => b.textContent === "👍🏾")'), 'teinte appliquée à la grille');
  check('teinte de peau : les mains et les personnes la prennent, le reste ne change pas', await modal('[...document.querySelectorAll(".em-pick")].some((b) => b.textContent === "🏠") && ![...document.querySelectorAll(".em-pick")].some((b) => b.textContent === "👍")'));
  await modal('[...document.querySelectorAll(".em-pick")].find((b) => b.textContent === "👍🏾").click()');
  await until(() => d.tabs[B].icon === '👍🏾', 'icône de l’onglet');
  check('la teinte choisie est retenue pour la prochaine fois', store.state.window.emojiTone === 4);
  await until(() => ui(`document.querySelector('#today [data-id="${B}"] .ic .emoji')?.textContent === '👍🏾'`), 'émoji sur la ligne de l’onglet');
  check('barre latérale : l’émoji remplace l’icône du site sur la ligne de l’onglet', await ui(`!document.querySelector('#today [data-id="${B}"] .ic img')`));
  w.rename(B, 'Mon B');
  tpl = w.tabMenuTemplate(B);
  check('onglet personnalisé : « Réinitialiser le nom et l’icône » paraît', labels(tpl).includes(T('tabs.resetNameIcon')));
  w.openIcons('tab', B);
  await until(() => modal('!document.getElementById("icons-reset").hidden && !!document.querySelector(".em-pick.sel")'), 'bouton « icône d’origine » et émoji courant marqué');
  check('sélecteur rouvert : l’émoji en place est marqué, la teinte retenue est cochée',
    await modal('document.querySelector(".em-pick.sel").textContent === "👍🏾" && document.querySelector("#icons-tones .tone.sel").dataset.tone === "4"'));
  w.hideModal();
  pick(tpl, 'tabs.resetNameIcon').click();
  check('… et rend à l’onglet le titre et l’icône de sa page ; ⌘Z les remet', !d.tabs[B].icon && !d.tabs[B].customTitle && pending() === 'undo.resetNameIcon'
    && (w.replay('undo'), d.tabs[B].icon === '👍🏾' && d.tabs[B].customTitle === 'Mon B'));
  // Favori : la tuile porte aussi l'émoji.
  w.toggleFavorite(B);
  await until(() => ui(`document.querySelector('#fav [data-id="${B}"] .ic .emoji')?.textContent === '👍🏾'`), 'émoji sur la tuile du favori');
  check('favori : l’icône choisie paraît sur sa tuile', labels(w.tabMenuTemplate(B)).includes(T('tabs.changeIcon')));
  w.toggleFavorite(B);
  w.openIcons('tab', B);
  await until(() => w.modalMode === 'icons', 'sélecteur');
  await until(() => modal('!document.getElementById("icons-reset").hidden'), 'bouton de retour');
  await modal('document.getElementById("icons-reset").click()');
  await until(() => !d.tabs[B].icon, 'icône d’origine');
  check('« Revenir à l’icône d’origine » retire l’émoji de l’onglet', w.modalMode === null);

  // Espace : même sélecteur ; il garde toujours une icône.
  tpl = w.spaceMenuTemplate();
  pick(tpl, 'spaces.changeIcon').click();
  await until(() => w.modalMode === 'icons', 'sélecteur de l’Espace');
  await until(() => modal('document.querySelectorAll(".em-pick").length > 100'), 'grille');
  check('icône de l’Espace : pas de retour à « aucune icône », et une icône vide est refusée', await modal('document.getElementById("icons-reset").hidden') && w.handle('icon', { emoji: '' }) === false && space.icon === '🧭');
  await modal('(() => { const i = document.getElementById("icons-input"); i.value = "panda"; i.dispatchEvent(new Event("input")); i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); })()');
  await until(() => space.icon === '🐼', 'icône de l’Espace');
  await until(() => ui(`document.getElementById('space-icon').textContent === '🐼'`), 'en-tête de l’Espace');
  check('icône de l’Espace : recherche puis Entrée choisit le premier résultat ; l’en-tête et le menu Espaces suivent', true);
  w.replay('undo');
  check('⌘Z rend à l’Espace son icône', space.icon === '🧭');
  w.openIcons('space', space.id);
  await until(() => w.modalMode === 'icons', 'sélecteur');
  w.handle('closeOverlay');
  check('Échap ou clic à côté : le sélecteur se ferme sans rien changer', w.modalMode === null && space.icon === '🧭');

  // --- Supprimer un dossier : ses onglets vont dans l'archive -----------------------
  const ask = dialog.showMessageBox;
  const asked = [];
  let answer = 1;
  dialog.showMessageBox = async (...args) => { asked.push(args[args.length - 1]); return { response: answer }; };
  const empty = { type: 'folder', id: 'fin-vide', name: 'Vide', open: true, children: [] };
  space.pinned.push(empty);
  await w.deleteFolder(empty.id);
  check('dossier vide : supprimé sans question', !asked.length && !space.pinned.includes(empty) && pending() === 'undo.deleteFolder');
  w.replay('undo');
  check('… et ⌘Z le remet à sa place', space.pinned.indexOf(empty) === 1);
  space.pinned.splice(space.pinned.indexOf(empty), 1);
  const inner = { type: 'folder', id: 'fin-sous', name: 'Dedans', open: true, children: [] };
  folder.children.push(inner);
  w.move({ id: C, to: 'folder', folderId: inner.id, index: 0 });
  d.tabs[A].url = 'https://exemple.test/fin-A';
  d.tabs[C].url = 'https://exemple.test/fin-C';
  d.tabs[C].customTitle = 'Mon C';
  const before = JSON.stringify(space.pinned);
  toasts.length = 0;
  await w.deleteFolder(folder.id);
  check('dossier garni : la question le nomme et annonce l’archivage ; « Annuler » ne touche à rien',
    asked.length === 1 && asked[0].message === T('tabs.deleteFolderConfirm', { name: 'Lot' }) && asked[0].detail === T('tabs.deleteFolderDetail') && asked[0].cancelId === 1 && JSON.stringify(space.pinned) === before && !!d.tabs[A]);
  answer = 0;
  await w.deleteFolder(folder.id);
  const arch = () => store.state.archive.filter((x) => x.url.startsWith('https://exemple.test/fin-'));
  check('… confirmé : le dossier disparaît, ses onglets (sous-dossier compris) vont dans l’archive, avec leur nom',
    !space.pinned.length && !d.tabs[A] && !d.tabs[C] && arch().length === 2 && arch().some((x) => x.title === 'Mon C') && arch().every((x) => x.spaceId === space.id), JSON.stringify(arch()));
  check('… un message le dit et rappelle ⌘Z', toasts.length === 1 && toasts[0] === shortcuts.inText(T('toast.folderDeleted', { n: 2 }), 'undo'), toasts.join('|'));
  await until(() => ui(`!document.querySelector('#pinned .folder')`), 'dossier retiré de la barre');
  w.replay('undo');
  check('⌘Z : le dossier revient à sa place avec son icône, son sous-dossier et ses onglets, qui quittent l’archive',
    JSON.stringify(space.pinned) === before && !!d.tabs[A] && d.tabs[C].customTitle === 'Mon C' && !arch().length && folder.icon === '🚀');
  w.replay('redo');
  check('⇧⌘Z le supprime de nouveau, sans reposer la question', !space.pinned.length && arch().length === 2 && asked.length === 2);
  w.replay('undo');
  check('… et ⌘Z le rétablit encore', JSON.stringify(space.pinned) === before && !arch().length);

  // --- Supprimer un Espace : tout va dans l'archive, épinglés compris ----------------
  const doomed = store.makeSpace('Condamné', '🗑️', '#ef4444');
  d.spaces.push(doomed);
  const [P, Q] = make('PQ', doomed);
  d.tabs[P].url = 'https://exemple.test/fin-P';
  d.tabs[Q].url = 'https://exemple.test/fin-Q';
  doomed.today.splice(doomed.today.indexOf(P), 1);
  doomed.pinned.push({ type: 'folder', id: 'fin-d2', name: 'D', open: true, children: [{ type: 'tab', id: P }] });
  asked.length = 0;
  await w.deleteSpace(doomed.id);
  check('supprimer un Espace : la question annonce que tout est archivé (comme dans Arc)', asked.length === 1 && asked[0].detail === T('spaces.deleteDetail') && /archive/i.test(asked[0].detail));
  check('… ses épinglés rangés dans un dossier vont dans l’archive, comme ses onglets du jour', !d.spaces.includes(doomed) && arch().map((x) => x.url.slice(-1)).sort().join('') === 'PQ', JSON.stringify(arch()));
  w.replay('undo');
  check('⌘Z rétablit l’Espace et vide l’archive de ses onglets', d.spaces.includes(doomed) && !arch().length && !!d.tabs[P] && doomed.pinned[0].children[0].id === P);
  dialog.showMessageBox = ask;
  w.mute(() => w.removeSpace(doomed.id));
  store.state.archive = store.state.archive.filter((x) => !x.url.startsWith('https://exemple.test/fin-'));
  w.switchSpace(space.id);

  // --- Fenêtre vierge -----------------------------------------------------------------
  const appMenu = () => Menu.getApplicationMenu();
  const find = (items, label) => { for (const it of items) { if (it.label === label) return it; if (it.submenu) { const r = find(it.submenu.items, label); if (r) return r; } } return null; };
  const menuItem = (key, vars) => find(appMenu().items, T(key, vars));
  menu.refresh(true);
  await until(() => !!menuItem('file.newBlank'), 'menu reconstruit');
  check('Fichier → « Nouvelle fenêtre vierge », avec ⌃⌘N', menuItem('file.newBlank').accelerator === platform.accel('Ctrl+Cmd+N') && commands.byName.get('newBlank').global === true);
  const n0 = OrbeWindow.all.length;
  const saved0 = JSON.stringify(store.state.window);
  menuItem('file.newBlank').click();
  await until(() => OrbeWindow.all.length === n0 + 1, 'fenêtre vierge ouverte');
  const bw = OrbeWindow.all.find((x) => x.blank);
  check('fenêtre vierge : hors des Espaces — un seul Espace à elle, aucun onglet, données à part', !!bw && bw.data !== store.state && bw.data.spaces.length === 1 && bw.space.name === T('blank.title') && !Object.keys(bw.data.tabs).length && !bw.incognito && !bw.shared);
  check('fenêtre vierge : même session que les fenêtres ordinaires (cookies, historique), contrairement à la navigation privée', bw.session === w.session);
  await until(() => bw.modalMode === 'command', 'barre de commande de la fenêtre vierge');
  bw.hideModal();
  const bt = bw.createTab('https://exemple.test/fin-vierge', { space: bw.space, index: 0 });
  bt.title = 'Vierge';
  bw.changed();
  await until(() => bw.ui.webContents.executeJavaScript('typeof S === "object" && !!S && S.blank === true && S.today.length === 1 && S.spaces.length === 1'), 'barre de la fenêtre vierge');
  check('ses onglets n’entrent dans aucun Espace enregistré', !store.state.tabs[bt.id] && !store.state.spaces.some((s) => s.today.includes(bt.id)));
  check('elle ne devient jamais la fenêtre dont l’état est mémorisé, ni la fenêtre principale', !bw.persistent && w.persistent && (bw.remember(), JSON.stringify(store.state.window) === saved0) && OrbeWindow.all.find((x) => x.shared) === w);
  const spaces0 = store.state.spaces.length;
  bw.newSpace();
  bw.newProfile();
  check('pas de nouvel Espace ni de nouveau profil depuis une fenêtre vierge ; ses menus ne les proposent pas',
    bw.data.spaces.length === 1 && store.state.spaces.length === spaces0 && pick(bw.spaceMenuTemplate(), 'spaces.new').enabled === false && !labels(bw.spaceMenuTemplate()).includes(T('spaces.manage'))
    && !labels(bw.tabMenuTemplate(bt.id)).includes(T('tabs.addFavorite')));
  const note = await bw.ui.webContents.executeJavaScript('(() => { const el = document.getElementById("blank-note"); return { shown: getComputedStyle(el).display !== "none", text: el.textContent }; })()');
  const noteMain = await w.ui.webContents.executeJavaScript('getComputedStyle(document.getElementById("blank-note")).display');
  check('fenêtre vierge : une phrase dit ce qu’elle garde et ne garde pas (barre latérale, bulle du menu) ; rien dans une fenêtre ordinaire',
    note.shown && note.text.includes(T('blank.body')) && /historique|history/i.test(T('blank.body')) && /cookies/i.test(T('blank.body')) && menuItem('file.newBlank').toolTip === T('blank.body') && noteMain === 'none', JSON.stringify(note));
  const archiveVierge = JSON.stringify(store.state.archive);
  bw.close(bt.id);
  check('un onglet fermé dans la fenêtre vierge n’entre pas dans l’archive enregistrée (ni dans les sauvegardes)', JSON.stringify(store.state.archive) === archiveVierge && !store.state.archive.some((x) => x.url === 'https://exemple.test/fin-vierge') && bw.archives === false && w.archives === true);
  bw.reopenClosed();
  const rouvert = Object.values(bw.data.tabs).find((x) => x.url === 'https://exemple.test/fin-vierge');
  check('… mais il se rouvre par ⇧⌘T tant que la fenêtre est ouverte', !!rouvert && bw.space.today.includes(rouvert.id) && JSON.stringify(store.state.archive) === archiveVierge);
  if (rouvert) bw.close(rouvert.id);
  store.state.archive = store.state.archive.filter((x) => !x.url.startsWith('https://exemple.test/fin-'));
  bw.win.close();
  await until(() => OrbeWindow.all.length === n0, 'fenêtre vierge refermée');
  check('raccourcis : « Nouvelle fenêtre vierge » se règle dans le groupe Fichier', (shortcuts.list().find((g) => g.title === T('menu.file')) || { items: [] }).items.some((x) => x.name === 'newBlank'));

  // --- Gérer les Espaces -----------------------------------------------------------------
  w.win.focus();
  menu.refresh(true);
  await until(() => !!menuItem('spaces.manage'), 'article « Gérer les Espaces »');
  check('menu Espaces et menu de l’Espace : « Gérer les Espaces… »', labels(w.spaceMenuTemplate()).includes(T('spaces.manage')) && commands.byName.get('manageSpaces').palette !== false);
  menuItem('spaces.manage').click();
  await until(() => w.activeId && /library\.html#spaces$/.test(d.tabs[w.activeId].url), 'Bibliothèque, section Espaces');
  check('« Gérer les Espaces… » ouvre la section Espaces de la Bibliothèque', true);
  const libId = w.activeId;
  w.close(libId);

  // --- ⌘S sans onglet --------------------------------------------------------------------
  for (const id of [...space.today]) w.close(id, { silent: true });
  space.pinned = [];
  check('aucun onglet affiché', !w.activeId);
  commands.run(w, 'toggleSidebar');
  check('⌘S sans onglet : la barre latérale reste (comme dans Arc)', w.sidebarVisible === true);
  w.toggleSidebar(false);
  commands.run(w, 'toggleSidebar');
  check('… mais masquée, ⌘S la ramène toujours', w.sidebarVisible === true);
  const [Z] = make('Z');
  w.activate(Z);
  commands.run(w, 'toggleSidebar');
  check('avec un onglet, ⌘S masque la barre', w.sidebarVisible === false);
  commands.run(w, 'toggleSidebar');

  // --- Menu Édition : sélection, orthographe, transformations, police ------------------------
  menu.refresh(true);
  await until(() => !!menuItem('edit.jumpToSelection'), 'menu Édition');
  const sub = (key) => menuItem(key).submenu.items.filter((x) => x.type !== 'separator').map((x) => x.label).join('|');
  check('Édition → « Aller à la sélection » (⌘J)', menuItem('edit.jumpToSelection').accelerator === platform.accel('Cmd+J'));
  check('Édition → Orthographe et grammaire, Transformations, Format → Police',
    sub('edit.spelling') === T('edit.spellCheck') && menuItem('edit.spellCheck').role.toLowerCase() === 'togglespellchecker'
    && sub('edit.transformations') === [T('edit.upper'), T('edit.lower'), T('edit.capitalize')].join('|')
    && sub('edit.font') === [T('edit.bold'), T('edit.italic'), T('edit.underline')].join('|'));
  if (platform.isMac) {
    check('Édition → Substitutions et Parole (rôles de macOS)',
      sub('edit.substitutions') === [T('edit.showSubstitutions'), T('edit.smartQuotes'), T('edit.smartDashes'), T('edit.textReplacement')].join('|')
      && sub('edit.speech') === [T('edit.startSpeaking'), T('edit.stopSpeaking')].join('|') && menuItem('edit.startSpeaking').role.toLowerCase() === 'startspeaking');
    check('Fenêtre → « Tout placer dans le Dock » (⌥⌘M)', menuItem('window.minimizeAll').accelerator === 'Alt+Cmd+M');
  }
  check('gras, italique, souligné : aucun raccourci n’est attaché au menu — ⌘B, ⌘I et ⌘U restent aux pages',
    ['B', 'I', 'U'].every((k) => !commands.byName.get('format' + k).accel && !shortcuts.accelOf('format' + k)) && !menuItem('edit.bold').accelerator && !menuItem('edit.italic').accelerator && !menuItem('edit.underline').accelerator);
  check('transformations : majuscules, minuscules, capitales (apostrophes et traits d’union compris)',
    commands.TRANSFORMS.upper('été à Noël') === 'ÉTÉ À NOËL' && commands.TRANSFORMS.lower('ÉTÉ À NOËL') === 'été à noël' && commands.TRANSFORMS.capitalize('l’été à saint-malo') === 'L’Été À Saint-Malo', commands.TRANSFORMS.capitalize('l’été à saint-malo'));
  check('Présentation → Développeur → « Inspecteur réseau » ; Aide → Dépannage → « Enregistrer une trace… »', !!menuItem('view.network') && !!menuItem('help.recordTrace') && commands.tracing() === false);

  // --- Rendu de la barre : une ligne inchangée n'est pas retouchée (PERF-26) -----------------------
  const lot = make('abcdefghijklmnopqrstuvwxyz');
  const pinnedOne = lot[25];
  w.togglePin(pinnedOne);
  w.toggleFavorite(lot[24]);
  w.changed();
  await until(() => ui(`S.today.length === ${space.today.length} && S.favorites.some((x) => x.id === '${lot[24]}') && document.querySelectorAll('#today .row.tab').length === ${space.today.length}`), 'barre à jour');
  // Un onglet du lot peut être en train de charger son adresse morte : l'échec arrive un peu
  // plus tard, change l'état de sa ligne et la fait redessiner à bon droit (vu sur la machine
  // d'intégration macOS : « ERR_UNSAFE_PORT » tombé pendant la mesure). On attend qu'aucun ne charge.
  await until(() => lot.every((id) => { const rt = ctx.win.live.get(id); return !rt || (!rt.loading && !rt.wc.isLoading()); }), 'onglets du lot au repos');
  await sleep(450); // fin des animations d'apparition : les lignes sont au repos
  const rows = await ui(`document.querySelectorAll('#today .row.tab, #pinned .row.tab, #fav .tile').length`);
  const drawnAfter = async (act) => {
    await ui('window.__vu = 0; void O.on("state", () => { window.__vu += 1; }); rowStats.drawn = 0; rowStats.kept = 0; 1');
    const seen0 = await ui('window.__vu');
    await act();
    await until(() => ui(`window.__vu > ${seen0}`), 'état reçu par la coque');
    await sleep(60);
    return ui('({ drawn: rowStats.drawn, kept: rowStats.kept })');
  };
  let st = await drawnAfter(() => w.sendState());
  check('état identique renvoyé : aucune ligne n’est redessinée, toutes sont reconnues inchangées', st.drawn === 0 && st.kept >= rows, JSON.stringify([st, rows]));
  st = await drawnAfter(() => { d.tabs[lot[3]].title = 'Titre neuf'; w.sendState(); });
  check('un titre change : une seule ligne est redessinée', st.drawn === 1 && await ui(`document.querySelector('#today [data-id="${lot[3]}"] .title').textContent`) === 'Titre neuf', JSON.stringify(st));
  st = await drawnAfter(() => { d.tabs[pinnedOne].muted = true; d.tabs[lot[24]].icon = '🔥'; w.sendState(); });
  check('un épinglé coupé et un favori qui change d’icône : deux lignes redessinées, à jour à l’écran',
    st.drawn === 2 && await ui(`document.querySelector('#pinned [data-id="${pinnedOne}"]').classList.contains('muted') && document.querySelector('#fav [data-id="${lot[24]}"] .emoji').textContent === '🔥'`), JSON.stringify(st));
  d.tabs[pinnedOne].muted = false;
  delete d.tabs[lot[24]].icon;
  st = await drawnAfter(() => w.activate(lot[5]));
  // (La page appelée charge puis échoue : sa ligne change encore une ou deux fois, à bon droit.)
  check('changement d’onglet affiché : seules l’ancienne et la nouvelle ligne actives sont redessinées', st.drawn >= 2 && st.drawn <= 6 && await ui(`document.querySelector('#today .row.active').dataset.id`) === lot[5], JSON.stringify(st));
  await until(() => !win.live.get(lot[5]) || !win.live.get(lot[5]).loading, 'chargement retombé');
  await sleep(500);
  await ui(`document.querySelector('#today [data-id="${lot[7]}"]').classList.add('témoin')`);
  st = await drawnAfter(() => w.sendState());
  check('classe posée hors du rendu (geste, animation) : la ligne est redessinée et retrouve ses classes, comme avant',
    st.drawn >= 1 && st.drawn <= 2 && await ui(`!document.querySelector('#today [data-id="${lot[7]}"]').classList.contains('témoin')`), JSON.stringify(st));
  await ui(`setSel(${JSON.stringify([lot[8], lot[9]])}); 1`);
  st = await drawnAfter(() => w.sendState());
  check('sélection : les lignes choisies portent leur marque, les autres ne sont pas retouchées', st.drawn <= 2 && await ui('document.querySelectorAll("#today .row.tab.sel").length') === 2, JSON.stringify(st));
  await ui('setSel([]); 1');
  st = await drawnAfter(() => { w.move({ id: lot[10], to: 'today', index: 0 }); });
  check('ligne déplacée : l’ordre suit à l’écran, sans redessiner les lignes qui n’ont pas changé',
    st.drawn <= 2 && await ui(`document.querySelector('#today .row.tab').dataset.id`) === lot[10] && await ui(`[...document.querySelectorAll('#today .row.tab')].map((el) => el.dataset.id).join()`) === space.today.join(), JSON.stringify(st));
  w.toggleFavorite(lot[24]);
  for (const id of lot) if (d.tabs[id] && w.locate(id)) w.close(id, { silent: true });
  space.pinned = space.pinned.filter((x) => x.id !== pinnedOne);
  w.undoStack.length = 0;

  // --- Dossier ↔ Espace -------------------------------------------------------------------------
  const [K, L, M] = make('KLM');
  const lotF = { type: 'folder', id: 'fin-vers-espace', name: 'Voyage', icon: '🧳', open: true, children: [] };
  space.pinned.push(lotF);
  w.move({ id: K, to: 'folder', folderId: lotF.id, index: 0 });
  w.move({ id: L, to: 'folder', folderId: lotF.id, index: 1 });
  w.splitWith(K, L, true);
  w.activate(K);
  w.undoStack.length = 0;
  const nSpaces = d.spaces.length;
  const at = d.spaces.indexOf(space);
  const snapAll = () => JSON.stringify(d.spaces.map((s2) => [s2.name, s2.icon, s2.pinned, s2.today, (s2.splits || []).map((g) => [...g])]));
  const avantConv = snapAll();
  check('menu d’un dossier : « Transformer en Espace » ; menu de l’Espace : « Transformer en dossier »',
    labels(w.folderMenuTemplate(lotF.id, false)).includes(T('tabs.folderToSpace')) && labels(w.spaceMenuTemplate()).includes(T('spaces.toFolder')));
  pick(w.folderMenuTemplate(lotF.id, false), 'tabs.folderToSpace').click();
  const born = d.spaces[at + 1];
  check('dossier → Espace : un Espace à son nom et à son icône naît juste après, ses lignes en sont les épinglés, il s’affiche',
    d.spaces.length === nSpaces + 1 && born.name === 'Voyage' && born.icon === '🧳' && born.pinned.map((x) => x.id).join() === [K, L].join() && !space.pinned.includes(lotF) && w.spaceId === born.id && born.profileId === space.profileId);
  check('… sans fermer ni recharger ses onglets : même page affichée, vue scindée conservée', w.activeId === K && !!d.tabs[K] && !!d.tabs[L] && (w.groupOf(K) || []).join() === [K, L].join() && (born.splits || []).length === 1 && pending() === 'undo.folderToSpace');
  w.replay('undo');
  check('⌘Z : l’Espace redevient le dossier, à sa place, avec ses onglets', snapAll() === avantConv && w.spaceId === space.id && d.spaces.length === nSpaces, snapAll());
  w.replay('redo');
  check('⇧⌘Z le retransforme en Espace', d.spaces[at + 1] === born && born.pinned.length === 2 && w.spaceId === born.id);
  // Espace → dossier : ses épinglés forment un dossier dans l'Espace voisin, ses onglets du jour s'y ajoutent.
  const extra = w.createTab(dead('N'), { space: born, index: 0 });
  extra.title = 'N';
  w.undoStack.length = 0;
  const avantRetour = snapAll();
  pick(w.spaceMenuTemplate(), 'spaces.toFolder').click();
  const made = space.pinned[space.pinned.length - 1];
  check('Espace → dossier : l’Espace disparaît, ses épinglés forment un dossier à son nom dans l’Espace voisin, ses onglets du jour le rejoignent',
    !d.spaces.includes(born) && w.spaceId === space.id && made.type === 'folder' && made.name === 'Voyage' && made.icon === '🧳' && made.children.map((x) => x.id).join() === [K, L].join() && space.today.includes(extra.id) && pending() === 'undo.spaceToFolder');
  await until(() => ui(`S.space.id === '${space.id}' && [...document.querySelectorAll('#pinned .folder > .row .title')].some((el) => el.textContent === 'Voyage')`), 'dossier affiché dans la barre');
  w.replay('undo');
  check('⌘Z : l’Espace revient à son rang avec ses épinglés, ses onglets du jour et son thème', snapAll() === avantRetour && d.spaces[at + 1] === born && w.spaceId === born.id, snapAll());
  w.replay('redo');
  check('⇧⌘Z le retransforme en dossier', !d.spaces.includes(born) && space.pinned.some((x) => x.type === 'folder' && x.name === 'Voyage'));
  check('dernier Espace : pas de transformation en dossier', (() => { const bw2 = { ...w }; void bw2; return d.spaces.length > 1 || pick(w.spaceMenuTemplate(), 'spaces.toFolder').enabled === false; })());
  for (const id of [K, L, M, extra.id]) if (d.tabs[id]) { w.leaveSplit(id); OrbeWindow.destroyView(id); OrbeWindow.forget(id, d); const loc = w.locate(id); if (loc) loc.arr.splice(loc.index, 1); delete d.tabs[id]; }
  space.pinned = [];
  w.undoStack.length = 0;
  w.redoStack.length = 0;

  // --- Texte ou lien déposé sur la barre latérale ----------------------------------------------------
  const suggest = require('../src/main/suggest');
  const opened = [];
  const newTab0 = w.newTab;
  w.newTab = (url) => { opened.push(url); return null; };
  const dropOn = (types) => ui(`(() => {
    const dt = new DataTransfer();
    for (const [k, v] of ${JSON.stringify(types)}) dt.setData(k, v);
    const box = document.getElementById('sidebar').getBoundingClientRect();
    document.getElementById('sidebar').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: box.left + 40, clientY: box.bottom - 80 }));
    return true;
  })()`);
  await dropOn([['text/plain', 'recette de crêpes']]);
  await until(() => opened.length === 1, 'texte déposé reçu');
  check('glisser du texte sur la barre latérale : une recherche s’ouvre dans un nouvel onglet', opened[0] === suggest.searchUrl('recette de crêpes'), opened[0]);
  await dropOn([['text/uri-list', 'https://exemple.org/page\nhttps://autre.org/'], ['text/plain', 'ignoré']]);
  await until(() => opened.length === 2, 'lien déposé reçu');
  check('glisser un lien : sa page s’ouvre (la première adresse de la liste)', opened[1] === 'https://exemple.org/page');
  await dropOn([['text/plain', 'javascript:alert(1)']]);
  await dropOn([['text/plain', 'file:///etc/hosts']]);
  await dropOn([['application/x-orbe-item', 'x'], ['text/plain', 'https://exemple.org/autre']]);
  await sleep(200);
  check('… jamais une adresse javascript: ou file:, ni une ligne venue d’une autre fenêtre', opened.length === 2, opened.join(' | '));
  w.newTab = newTab0;

  // --- Deux fenêtres, mêmes Espaces : les mêmes onglets --------------------------------------------------
  const before2 = OrbeWindow.all.length;
  commands.run(w, 'newWindow');
  await until(() => OrbeWindow.all.length === before2 + 1, 'seconde fenêtre');
  const w2 = OrbeWindow.all.find((x) => x !== w && x.shared);
  w2.hideModal();
  w2.switchSpace(space.id);
  const [X1, X2] = make('XY');
  w.togglePin(X2);
  const ui2 = (js2) => w2.ui.webContents.executeJavaScript(js2);
  await until(() => ui2(`typeof S === 'object' && !!S && S.space.id === '${space.id}' && S.today.some((x) => x.id === '${X1}') && S.pinned.some((x) => x.id === '${X2}')`), 'seconde fenêtre à jour');
  check('deux fenêtres sur le même Espace montrent les mêmes onglets : un onglet ouvert ou épinglé dans l’une paraît dans l’autre',
    await ui2(`document.querySelectorAll('#today [data-id="${X1}"], #pinned [data-id="${X2}"]').length`) === 2 && w2.data === w.data);
  w2.rename(X1, 'Renommé ailleurs');
  await until(() => ui(`document.querySelector('#today [data-id="${X1}"] .title')?.textContent === 'Renommé ailleurs'`), 'renommage vu dans la première fenêtre');
  check('… et un changement fait dans la seconde revient dans la première', true);
  w2.win.close();
  await until(() => OrbeWindow.all.length === before2, 'seconde fenêtre refermée');
  for (const id of [X1, X2]) { const loc = w.locate(id); if (loc) loc.arr.splice(loc.index, 1); OrbeWindow.destroyView(id); delete d.tabs[id]; }
  w.undoStack.length = 0;
  w.win.focus();

  // --- Vue scindée : côté du nouveau volet, groupe épinglé ---------------------------------------------
  const [S1, S2, S3, S4] = make('1234');
  w.activate(S1);
  const order = () => (w.groupOf(S1) || []).map((id) => d.tabs[id].title).join('');
  const addSide = async (side, id) => {
    commands.run(w, 'addSplit' + side[0].toUpperCase() + side.slice(1));
    await until(() => w.modalMode === 'command' && w.commandMode === 'split', 'barre de commande (vue scindée)');
    w.runItem({ kind: 'tab', tabId: id });
  };
  await addSide('left', S2);
  check('« Ajouter un volet à gauche » : la page choisie se place avant la page affichée, côte à côte', order() === '21' && !w.isVertical(w.groupOf(S1)), order());
  w.activate(S1);
  await addSide('right', S3);
  check('« Ajouter un volet à droite » : juste après la page affichée', order() === '213' && !w.isVertical(w.groupOf(S1)), order());
  w.activate(S1);
  await addSide('top', S4);
  check('« Ajouter un volet en haut » : avant la page affichée, et la vue devient empilée', order() === '2413' && w.isVertical(w.groupOf(S1)), order());
  w.separateSplit(S4);
  w.activate(S1);
  await addSide('bottom', S4);
  check('« Ajouter un volet en bas » : après la page affichée, vue empilée', order() === '2143' && w.isVertical(w.groupOf(S1)), order());
  check('barre de commande : les quatre côtés y sont proposés', ['right', 'left', 'top', 'bottom'].every((k) => w.suggestLocal(T('view.addSplit.' + k)).some((i) => i.command === 'addSplit' + k[0].toUpperCase() + k.slice(1))));
  toasts.length = 0;
  commands.run(w, 'addSplitLeft');
  check('quatre volets déjà : pas de cinquième, un message le dit', w.modalMode !== 'command' && toasts[0] === T('toast.splitMax'));
  w.separateAll(S1);
  w.activate(S1);
  commands.run(w, 'addSplitLeft');
  await until(() => w.modalMode === 'command', 'barre ouverte');
  w.hideModal();
  commands.run(w, 'addSplit');
  await until(() => w.modalMode === 'command', 'barre ouverte (sans côté)');
  w.runItem({ kind: 'tab', tabId: S2 });
  check('côté demandé puis abandonné : la vue scindée suivante reprend la place habituelle (à droite)', order() === '12' && !w.isVertical(w.groupOf(S1)), order());
  // Le groupe est une seule ligne : il s'épingle, se renomme et se déplace d'un bloc.
  const head = w.groupOf(S1)[0];
  w.togglePin(head);
  w.rename(head, 'Mon duo');
  await until(() => ui(`(() => { const r = document.querySelector('#pinned [data-id="${head}"]'); return !!r && r.classList.contains('split') && r.querySelectorAll('.more > *').length === 1; })()`), 'vue scindée épinglée, une seule ligne');
  check('vue scindée épinglée : une seule ligne dans les épinglés, avec l’icône de l’autre volet ; l’autre onglet n’a pas de ligne à lui',
    w.locate(head).list === 'pinned' && (w.groupOf(head) || []).length === 2 && await ui(`!document.querySelector('#today [data-id="${S2}"]') || getComputedStyle(document.querySelector('#today [data-id="${S2}"]')).display === 'none'`));
  check('… renommée : le nom choisi s’affiche sur la ligne du groupe', await ui(`document.querySelector('#pinned [data-id="${head}"] .title').textContent.startsWith('Mon duo')`));
  w.activate(S3);
  w.activate(head);
  check('… un clic la rouvre avec ses deux volets', w.visibleIds().length === 2);
  w.separateAll(head);
  for (const id of [S1, S2, S3, S4]) { const loc = w.locate(id); if (loc) loc.arr.splice(loc.index, 1); OrbeWindow.destroyView(id); OrbeWindow.forget(id, d); delete d.tabs[id]; }
  w.undoStack.length = 0;

  // --- Plein écran (⌃⌘F), archivage d'office expliqué une fois ---------------------------------------------
  const full0 = w.win.setFullScreen;
  const asked2 = [];
  w.win.setFullScreen = (v) => asked2.push(v);
  commands.run(w, 'fullscreen');
  w.win.setFullScreen = full0;
  check('« Plein écran » (⌃⌘F) demande le plein écran de la fenêtre', asked2.length === 1 && asked2[0] === !w.win.isFullScreen() && commands.byName.get('fullscreen').accel === platform.accel('Ctrl+Cmd+F'));
  const noticed0 = store.state.window.archiveNoticed;
  delete store.state.window.archiveNoticed;
  const hours = require('../src/main/prefs').get('archiveAfterHours', space.profileId);
  if (hours) {
    const [O1, O2, O3] = make('OPQ');
    d.tabs[O1].url = 'https://exemple.test/fin-vieux1';
    d.tabs[O2].url = 'https://exemple.test/fin-vieux2';
    w.activate(O3);
    d.tabs[O1].lastActiveAt = Date.now() - (hours + 1) * 36e5;
    toasts.length = 0;
    win.archiveStale();
    check('premier archivage d’office : un message l’explique (nombre d’onglets, délai) et mène au réglage', !d.tabs[O1] && toasts.length === 1 && toasts[0] === T('toast.autoArchive', { n: 1, hours }) && store.state.window.archiveNoticed === true, toasts.join('|'));
    d.tabs[O2].lastActiveAt = Date.now() - (hours + 1) * 36e5;
    win.archiveStale();
    check('… une seule fois : les archivages suivants se font sans message', !d.tabs[O2] && toasts.length === 1);
    w.close(O3, { silent: true });
    store.state.archive = store.state.archive.filter((x) => !/exemple\.test\/fin-/.test(x.url) && !mine(x));
  }
  if (noticed0 === undefined) delete store.state.window.archiveNoticed; else store.state.window.archiveNoticed = noticed0;
  w.closed.length = 0;
  w.undoStack.length = 0;

  // --- Onglet déplacé vers un autre Espace : message cliquable ; favoris jamais chargés d'avance ------------
  const away = store.makeSpace('Ailleurs', '📦', '#f97316');
  d.spaces.push(away);
  const [G1, G2, G3] = make('GHI');
  w.activate(G3);
  toasts.length = 0;
  w.moveToSpace(G1, away.id);
  check('onglet déplacé vers un autre Espace : un message le dit, avec le nom de l’Espace', toasts.length === 1 && toasts[0] === T('toast.tabMoved', { space: 'Ailleurs' }) && away.today.includes(G1) && w.spaceId === space.id);
  w.toastClick();
  check('… un clic sur le message mène à l’onglet, dans son nouvel Espace', w.spaceId === away.id && w.activeId === G1);
  w.switchSpace(space.id);
  toasts.length = 0;
  w.selection = [G2, G3];
  w.moveManyToSpace([G2, G3], away.id);
  check('plusieurs onglets déplacés : un seul message, qui dit combien', toasts.length === 1 && toasts[0] === T('toast.tabsMoved', { space: 'Ailleurs', n: 2 }), toasts.join('|'));
  toasts.length = 0;
  w.replay('undo');
  check('⌘Z (retour des onglets) ne rejoue pas le message', toasts.length === 0 && space.today.includes(G2));
  const [FV] = make('J');
  w.toggleFavorite(FV);
  w.changed();
  await until(() => ui(`!!document.querySelector('#fav [data-id="${FV}"]')`), 'tuile du favori');
  check('favori jamais affiché : sa page n’est pas chargée d’avance (ni vue, ni processus) ; elle l’est au clic', !win.live.has(FV) && await ui(`!document.querySelector('#fav [data-id="${FV}"]').classList.contains('live')`)
    && (w.activate(FV), win.live.has(FV)));
  w.toggleFavorite(FV);
  for (const sp of [space, away]) for (const id of [...sp.today]) { OrbeWindow.destroyView(id); OrbeWindow.forget(id, d); delete d.tabs[id]; }
  space.today = [];
  d.spaces.splice(d.spaces.indexOf(away), 1);
  delete w.activeBySpace[away.id];
  w.hideToast();
  w.undoStack.length = 0;
  w.redoStack.length = 0;

  // --- Sites qui restent vivants, message de création d'Espace, menu d'un volet ----------------------
  const keepalive = require('../src/main/keepalive');
  check('sites qui restent vivants : messageries, courrier, agendas, musique — sur le nom d’hôte et le début du chemin',
    ['https://mail.google.com/mail/u/0/', 'https://app.slack.com/client/T1/C1', 'https://open.spotify.com/', 'https://web.whatsapp.com/', 'https://www.notion.so/page', 'https://calendar.google.com/calendar/u/0/r', 'https://docs.google.com/document/d/1', 'https://x.com/home'].every(keepalive.matches)
    && !['https://exemple.org/?u=mail.google.com/mail', 'https://mail.google.com.exemple.org/mail', 'https://docs.google.com/forms/x', 'https://app.slack.com/', 'orbe://mail.google.com/mail', 'file:///mail.google.com/mail', 'pas une adresse', '', null].some(keepalive.matches));
  const veille = require('../src/main/veille');
  const old = Date.now() - 10 * 36e5;
  const picked = veille.pick([
    { id: 'gmail', lastUsed: old, mb: 0, kept: false, typed: keepalive.matches('https://mail.google.com/mail/u/0/') },
    { id: 'blog', lastUsed: old, mb: 0, kept: false, typed: keepalive.matches('https://exemple.org/article') },
  ], { idleMs: 36e5 });
  check('veille après un temps sans être affiché : l’onglet de courrier reste vivant, la page ordinaire s’endort', picked.map((x) => x.id).join() === 'blog', JSON.stringify(picked));
  check('… mais la limite en nombre choisie par l’utilisateur reste tenue', veille.pick([
    { id: 'gmail', lastUsed: old, mb: 0, kept: false, typed: true }, { id: 'actif', lastUsed: Date.now(), mb: 0, kept: true, typed: false },
  ], { max: 1 }).map((x) => x.id).join() === 'gmail');
  toasts.length = 0;
  const spacesBefore = d.spaces.length;
  w.newSpace();
  check('nouvel Espace : un message « Nouvel Espace créé »', d.spaces.length === spacesBefore + 1 && toasts.includes(T('toast.spaceCreated')));
  await until(() => ui('!!document.querySelector("#space-name input.rename")'), 'nom de l’Espace à saisir');
  await ui('document.querySelector("input.rename").blur()');
  w.replay('undo');
  check('… et ⌘Z le retire', d.spaces.length === spacesBefore);
  w.switchSpace(space.id);
  const [V, W2] = make('VW');
  w.splitWith(V, W2, true);
  w.activate(V);
  const paneTpl = w.paneMenuTemplate(W2);
  check('menu d’un volet : « Dupliquer » et « Couper le son » propres à ce volet', labels(paneTpl).includes(T('tabs.duplicate')) && labels(paneTpl).includes(T('tabs.mute')));
  pick(paneTpl, 'tabs.mute').click();
  check('… le son n’est coupé que pour ce volet, et l’article devient « Rétablir le son »', d.tabs[W2].muted === true && !d.tabs[V].muted && labels(w.paneMenuTemplate(W2)).includes(T('tabs.unmute')));
  const count0 = space.today.length;
  pick(w.paneMenuTemplate(W2), 'tabs.duplicate').click();
  check('… « Dupliquer » ouvre la même adresse dans un nouvel onglet, hors de la vue scindée', space.today.length === count0 + 1 && space.today.filter((id) => d.tabs[id].url === dead('W')).length === 2 && (w.groupOf(V) || []).length === 2);
  for (const id of [...space.today]) { w.leaveSplit(id); w.close(id, { silent: true }); }
  w.undoStack.length = 0;

  // --- Articles de menu : leur effet dans une vraie page -------------------------------------------
  const http = require('http');
  const server = await new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      const etape = /^\/h(\d)$/.exec(req.url);
      if (etape) return res.end(`<!doctype html><meta charset="utf-8"><title>Étape ${etape[1]}</title><h1>Étape ${etape[1]}</h1>`);
      return res.end(`<!doctype html><meta charset="utf-8"><title>Édition</title><body style="font:16px sans-serif;margin:0">
        <textarea id="zone" style="width:300px;height:60px">l’été à saint-malo</textarea>
        <div id="riche" contenteditable style="min-height:30px">texte riche</div>
        <div style="height:4000px"></div><p id="bas">tout en bas de la page</p></body>`);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const page = w.newTab(`http://127.0.0.1:${server.address().port}/edition`);
  await until(() => d.tabs[page.id] && d.tabs[page.id].title === 'Édition', 'page d’édition chargée');
  const pwc = win.live.get(page.id).wc;
  const js = (code) => pwc.executeJavaScript(code);
  pwc.focus();
  // Transformations : la sélection d'un champ de texte.
  await js('(() => { const z = document.getElementById("zone"); z.focus(); z.setSelectionRange(0, z.value.length); })()');
  await commands.run(w, 'transformCapitalize');
  await until(async () => (await js('document.getElementById("zone").value')) === 'L’Été À Saint-Malo', 'capitales posées');
  await js('(() => { const z = document.getElementById("zone"); z.setSelectionRange(2, 5); })()');
  await commands.run(w, 'transformUpper');
  await until(async () => (await js('document.getElementById("zone").value')) === 'L’ÉTÉ À Saint-Malo', 'majuscules sur la seule sélection');
  check('Transformations : la sélection du champ est remplacée (capitales, puis majuscules sur trois lettres), le reste du texte est intact', true);
  await js('(() => { const z = document.getElementById("zone"); z.setSelectionRange(3, 3); })()');
  check('… sans sélection, rien ne change', (await commands.run(w, 'transformLower')) === false && (await js('document.getElementById("zone").value')) === 'L’ÉTÉ À Saint-Malo');
  // Gras, italique, souligné : dans une zone de texte enrichi.
  await js('(() => { const r = document.getElementById("riche"); r.focus(); getSelection().selectAllChildren(r); })()');
  await commands.run(w, 'formatB');
  await commands.run(w, 'formatI');
  await commands.run(w, 'formatU');
  await until(async () => /<b>|font-weight/.test(await js('document.getElementById("riche").innerHTML')), 'gras posé');
  const riche = await js('document.getElementById("riche").innerHTML');
  check('Format → Police : gras, italique et souligné s’appliquent à la sélection de la zone de texte enrichi', /<b>/.test(riche) && /<i>/.test(riche) && /<u>/.test(riche), riche);
  // La page qui gère elle-même ⌘B garde la main : la touche lui arrive, Orbe ne la prend pas.
  await js('window.vuB = 0; document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "b") { e.preventDefault(); window.vuB += 1; } }); document.getElementById("riche").innerHTML = "simple"; getSelection().selectAllChildren(document.getElementById("riche"));');
  const mod = platform.isMac ? 'meta' : 'control';
  pwc.sendInputEvent({ type: 'keyDown', keyCode: 'b', modifiers: [mod] });
  pwc.sendInputEvent({ type: 'keyUp', keyCode: 'b', modifiers: [mod] });
  // Session verrouillée : la page ne reçoit aucune touche (pas de fenêtre au premier plan).
  const vuB = await until(() => js('window.vuB === 1'), 'la page a reçu ⌘B', 4000).then(() => true, () => false);
  if (!vuB && (await outils.milieu(w)).verrouille) outils.ignorer('⌘B dans une page qui le gère elle-même', 'session verrouillée : la page ne reçoit pas les touches');
  else {
    await sleep(150);
    check('⌘B dans une page qui le gère elle-même : la touche lui arrive et sa décision tient (aucune mise en gras par Orbe)', vuB && (await js('document.getElementById("riche").innerHTML')) === 'simple');
  }
  // Rechercher et remplacer (⌥⌘F) : dans un champ de saisie, jamais dans le texte fixe de la page.
  await js('document.getElementById("zone").value = "chat et chat, puis Chat"; document.getElementById("riche").textContent = "un chat riche"; document.getElementById("bas").textContent = "un chat en bas"; document.activeElement.blur(); getSelection().removeAllRanges();');
  commands.run(w, 'findReplace');
  await until(() => w.findOpen && w.findView && !w.findView.webContents.isLoading(), 'barre de recherche ouverte');
  const fv = (code) => w.findView.webContents.executeJavaScript(code);
  await until(() => fv('!document.getElementById("find").hidden && !document.getElementById("find-replace").hidden'), 'ligne « Remplacer par » affichée');
  check('« Rechercher et remplacer… » (⌥⌘F) : la barre de recherche gagne une ligne « Remplacer par », avec « Remplacer » et « Tout »',
    menuItem('edit.findReplace').accelerator === platform.accel('Alt+Cmd+F') && w.findView.getBounds().height === 90 && await fv('document.getElementById("find-with").placeholder') === T('find.replaceWith')
    && await fv('[...document.querySelectorAll("#find-replace .fr")].map((b) => b.textContent).join("|")') === [T('find.replace'), T('find.replaceAll')].join('|'));
  check('… la ligne tient dans la barre, sous le champ de recherche', await fv('(() => { const a = document.getElementById("find-input").getBoundingClientRect(); const b = document.getElementById("find-with").getBoundingClientRect(); return b.top >= a.bottom && b.bottom <= innerHeight && b.height > 10; })()'));
  w.handle('find', { text: 'chat' });
  await until(() => w.findLast && w.findLast.matches === 5, 'cinq occurrences trouvées');
  toasts.length = 0;
  let replaced = await w.handle('findReplace', { text: 'chat', with: 'loup' });
  check('« Remplacer » : l’occurrence désignée, dans le champ de saisie, est remplacée ; la recherche passe à la suivante', replaced === 1 && (await js('document.getElementById("zone").value')) === 'loup et chat, puis Chat' && w.findLast.matches === 4, JSON.stringify([replaced, await js('document.getElementById("zone").value'), w.findLast]));
  replaced = await w.handle('findReplace', { text: 'chat', with: 'loup', all: true });
  check('« Tout » : toutes les occurrences des zones modifiables (champ de saisie, texte enrichi), sans tenir compte de la casse',
    replaced === 3 && (await js('document.getElementById("zone").value')) === 'loup et loup, puis loup' && (await js('document.getElementById("riche").textContent')) === 'un loup riche', JSON.stringify([replaced, await js('document.getElementById("zone").value'), await js('document.getElementById("riche").textContent')]));
  check('… le texte fixe de la page n’est jamais modifié, et un message dit le nombre de remplacements', (await js('document.getElementById("bas").textContent')) === 'un chat en bas' && toasts.includes(T('find.replaced', { n: 3 })), toasts.join('|'));
  replaced = await w.handle('findReplace', { text: 'chat', with: 'loup' });
  check('occurrence hors d’une zone modifiable : rien n’est remplacé, un message l’explique', replaced === 0 && (await js('document.getElementById("bas").textContent')) === 'un chat en bas' && toasts[toasts.length - 1] === T('find.replacedNone', { n: 0 }));
  // Machine chargée : la page pose la sélection sur l'occurrence après que la recherche a rendu
  // son résultat. Les six premières questions « la sélection est-elle l'occurrence ? » restent
  // sans réponse utile ; aucune occurrence ne doit être sautée pour autant.
  await js('document.getElementById("zone").value = "chat et chat"; document.getElementById("riche").textContent = "un chat riche"; document.getElementById("bas").textContent = "sans rien"; document.activeElement.blur(); getSelection().removeAllRanges();');
  w.handle('find', { text: 'chat' });
  await until(() => w.findLast && w.findLast.matches === 3, 'trois occurrences trouvées');
  {
    const page = w.activeRt.wc;
    const vraie = page.executeJavaScript;
    let muettes = 6;
    page.executeJavaScript = function tardive(code, ...rest) {
      if (muettes > 0 && String(code).includes('const want =')) { muettes -= 1; return Promise.resolve(null); }
      return vraie.call(this, code, ...rest);
    };
    try { replaced = await w.handle('findReplace', { text: 'chat', with: 'loup', all: true }); } finally { page.executeJavaScript = vraie; }
    check('« Tout » : une sélection qui arrive en retard (machine chargée) ne fait sauter aucune occurrence',
      replaced === 3 && muettes === 0 && (await js('document.getElementById("zone").value')) === 'loup et loup' && (await js('document.getElementById("riche").textContent')) === 'un loup riche', JSON.stringify([replaced, muettes, await js('document.getElementById("zone").value'), await js('document.getElementById("riche").textContent')]));
    await js('document.getElementById("bas").textContent = "un chat en bas"');
  }
  check('remplacement refusé sans barre « Remplacer » ouverte, ou avec une demande mal formée', (await w.handle('findReplace', null)) === 0 && (await w.handle('findReplace', { text: '' })) === 0);
  w.closeFind();
  commands.run(w, 'find');
  await until(() => w.findOpen, 'recherche simple');
  await until(() => fv('document.getElementById("find-replace").hidden'), 'ligne de remplacement masquée');
  check('⌘F rouvre la recherche simple : une seule ligne, et le remplacement n’y est pas accepté', w.findView.getBounds().height === 50 && (await w.handle('findReplace', { text: 'chat', with: 'x', all: true })) === 0 && (await js('document.getElementById("bas").textContent')) === 'un chat en bas');
  w.closeFind();
  // Aller à la sélection.
  // La fermeture de la recherche rend la main à la page un instant plus tard (elle
  // peut encore défiler vers la dernière occurrence ou défaire la sélection) : on
  // attend que la sélection posée ici tienne, page remontée, avant de demander le saut.
  const posed = () => js('(() => { const s = getSelection(); const ok = s.rangeCount === 1 && document.getElementById("bas").contains(s.anchorNode) && !s.isCollapsed && scrollY === 0; if (!ok) { s.selectAllChildren(document.getElementById("bas")); scrollTo(0, 0); } return ok; })()');
  await until(async () => (await posed()) && (await sleep(120), await posed()), 'sélection posée, page en haut');
  check('la sélection est hors de l’écran', (await js('scrollY')) === 0);
  commands.run(w, 'jumpToSelection');
  await until(() => js('scrollY > 1000'), 'page défilée jusqu’à la sélection');
  check('« Aller à la sélection » (⌘J) ramène la sélection au milieu de l’écran', await js('(() => { const r = document.getElementById("bas").getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight; })()'));
  // Inspecteur réseau.
  commands.run(w, 'network');
  await until(() => pwc.isDevToolsOpened(), 'outils de développement ouverts', 15000);
  check('« Inspecteur réseau » ouvre les outils de développement de la page', true);
  pwc.closeDevTools();
  await until(() => !pwc.isDevToolsOpened(), 'outils refermés');
  // Tout placer dans le Dock : chaque fenêtre visible, une fois (sans rien réduire vraiment ici).
  const { BaseWindow, contentTracing } = electron;
  const minimize0 = BaseWindow.prototype.minimize;
  const reduced = [];
  BaseWindow.prototype.minimize = function minimize() { reduced.push(this.id); };
  const n = commands.minimizeAll();
  BaseWindow.prototype.minimize = minimize0;
  check('« Tout placer dans le Dock » réduit chaque fenêtre visible d’Orbe', n === reduced.length && reduced.includes(w.win.id) && n === BaseWindow.getAllWindows().filter((x) => x.isVisible() && !x.isMinimized()).length);
  // Enregistrer une trace : premier appel, elle commence ; second, elle est rangée dans Téléchargements.
  const start0 = contentTracing.startRecording;
  const stop0 = contentTracing.stopRecording;
  const show0 = shell.showItemInFolder;
  const trace = [];
  contentTracing.stopRecording = async (file) => { trace.push(['stop', file]); return file; };
  shell.showItemInFolder = (f) => trace.push(['show', f]);
  contentTracing.startRecording = async (o) => { trace.push(['start', o]); };
  const traceLib = require('../src/main/trace');
  const box0 = dialog.showMessageBox;
  const questions = [];
  let traceAnswer = 1;
  dialog.showMessageBox = async (...args) => { questions.push(args[args.length - 1]); return { response: traceAnswer }; };
  const noteShown = (x = w) => x.ui.webContents.executeJavaScript('!document.getElementById("trace-note").hidden');
  toasts.length = 0;
  // La question d'abord : elle dit ce que la trace contient. Refusée, rien ne s'enregistre.
  await commands.run(w, 'recordTrace');
  check('« Enregistrer une trace… » : la question est posée d’abord, elle dit que la trace contient adresses et titres de toutes les fenêtres ; refusée, rien ne commence',
    questions.length === 1 && questions[0].message === T('trace.confirm') && questions[0].detail === T('trace.detail') && /toutes les fenêtres|every Orbe window/.test(questions[0].detail) && /adresses|addresses/.test(questions[0].detail) && questions[0].cancelId === 1 && questions[0].defaultId === 1 && commands.tracing() === false && trace.length === 0 && toasts.length === 0, JSON.stringify(questions));
  traceAnswer = 0;
  await commands.run(w, 'recordTrace');
  menu.refresh(true);
  await until(() => !!menuItem('help.stopTrace'), 'article « Arrêter la trace »');
  check('acceptée : l’enregistrement commence, un message le dit, l’article du menu devient « Arrêter… »', commands.tracing() === true && trace.length === 1 && toasts[0] === T('toast.traceOn'));
  const traceCats = (trace[0] && trace[0][1].included_categories) || [];
  check('catégories relevées : une liste courte, sans « * », sans journal du réseau ni catégorie détaillée', traceCats.length > 5 && traceCats.length < 30 && !traceCats.includes('*') && !traceCats.some((c) => /^disabled-by-default|netlog|^net$|navigation|cookie|history/i.test(c)) && traceCats.includes('toplevel') && traceCats.includes('v8') && Object.keys(trace[0][1]).join() === 'included_categories', traceCats.join());
  await until(() => noteShown(), 'témoin de la trace dans la barre latérale');
  check('trace en cours : la barre latérale le montre', (await w.ui.webContents.executeJavaScript('document.getElementById("trace-note").textContent')) === T('trace.note'));
  // Le témoin l'arrête.
  await w.ui.webContents.executeJavaScript('document.getElementById("trace-note").click()');
  await until(() => commands.tracing() === false && trace.length === 3, 'trace arrêtée par le témoin');
  check('… un clic sur le témoin l’arrête : la trace est écrite dans Téléchargements et montrée dans le dossier',
    trace[1][0] === 'stop' && trace[1][1].startsWith(app.getPath('downloads')) && /orbe-trace-[\dT-]+\.json$/.test(trace[1][1]) && trace[2][1] === trace[1][1] && toasts[1] === T('toast.traceSaved'), JSON.stringify(trace.slice(1)));
  await until(async () => !(await noteShown()), 'témoin retiré');
  // Arrêt seul au bout du délai (deux minutes ; raccourci pour l'essai).
  const limit0 = traceLib.LIMIT.ms;
  trace.length = 0; toasts.length = 0;
  traceLib.LIMIT.ms = 250;
  await commands.run(w, 'recordTrace');
  const traceRunning = commands.tracing();
  await until(() => commands.tracing() === false && trace.length === 3, 'trace arrêtée seule');
  traceLib.LIMIT.ms = limit0;
  check('la trace s’arrête seule au bout du délai (2 minutes), et un message le dit', limit0 === 120000 && traceRunning === true && trace[1][0] === 'stop' && trace[1][1].startsWith(app.getPath('downloads')) && toasts.includes(T('toast.traceAuto')), JSON.stringify([limit0, traceRunning, toasts]));
  // Navigation privée : une fenêtre qui s'ouvre arrête et jette la trace ; ouverte, elle l'interdit.
  trace.length = 0; toasts.length = 0; questions.length = 0;
  await commands.run(w, 'recordTrace');
  const nPriv = OrbeWindow.all.length;
  const privWin = commands.hooks.newWindow({ incognito: true });
  await until(() => commands.tracing() === false && trace.length === 2, 'trace jetée');
  check('une fenêtre de navigation privée s’ouvre pendant la trace : elle est arrêtée et jetée (rien dans Téléchargements, rien de montré)',
    trace[1][0] === 'stop' && !trace[1][1].startsWith(app.getPath('downloads')) && trace[1][1].startsWith(require('os').tmpdir()) && !trace.some((x) => x[0] === 'show') && !require('fs').existsSync(trace[1][1]) && toasts.includes(T('trace.discarded')), JSON.stringify(trace.slice(1)));
  trace.length = 0; toasts.length = 0; questions.length = 0;
  const refusedTrace = await commands.run(w, 'recordTrace');
  check('fenêtre de navigation privée ouverte : aucune trace, sans même poser la question', refusedTrace === false && commands.tracing() === false && trace.length === 0 && questions.length === 0 && toasts[0] === T('trace.private'), JSON.stringify([refusedTrace, toasts]));
  privWin.win.close();
  await until(() => OrbeWindow.all.length === nPriv, 'fenêtre privée refermée');
  dialog.showMessageBox = box0;
  contentTracing.startRecording = start0;
  contentTracing.stopRecording = stop0;
  shell.showItemInFolder = show0;
  menu.refresh(true);
  // Barre de commande : les nouvelles actions s'y trouvent, comme « Nouveau Boost » et « Voir les Boosts ».
  const found = (q, name) => w.suggestLocal(q).some((i) => i.command === name);
  check('barre de commande : « Nouvelle fenêtre vierge », « Gérer les Espaces », Boost du site et liste des Boosts',
    found(T('file.newBlank'), 'newBlank') && found(T('spaces.manage'), 'manageSpaces') && found(T('boost.edit'), 'boost') && found(T('boost.list'), 'boosts'));
  w.close(page.id);
  store.state.archive = store.state.archive.filter((x) => !x.url.endsWith('/edition'));

  // ⇧⌘T : l'onglet rouvert retrouve son parcours (précédent, suivant).
  const origin = `http://127.0.0.1:${server.address().port}`;
  const trail = w.newTab(origin + '/h1');
  await until(() => d.tabs[trail.id] && d.tabs[trail.id].title === 'Étape 1', 'étape 1');
  for (const n of [2, 3]) { win.live.get(trail.id).wc.loadURL(`${origin}/h${n}`); await until(() => d.tabs[trail.id].title === 'Étape ' + n, 'étape ' + n); }
  win.live.get(trail.id).wc.navigationHistory.goBack();
  await until(() => d.tabs[trail.id].title === 'Étape 2', 'retour à l’étape 2');
  w.close(trail.id);
  check('onglet fermé : son parcours est gardé avec la trace de fermeture (adresses et titres seulement)',
    !d.tabs[trail.id] && w.closed[w.closed.length - 1].history.index === 1 && w.closed[w.closed.length - 1].history.entries.map((e) => e.url.slice(-3)).join() === '/h1,/h2,/h3' && w.closed[w.closed.length - 1].history.entries.every((e) => Object.keys(e).join() === 'url,title'));
  w.reopenClosed();
  await until(() => d.tabs[trail.id] && win.live.get(trail.id) && d.tabs[trail.id].title === 'Étape 2' && !win.live.get(trail.id).loading, 'onglet rouvert sur l’étape 2');
  const back = win.live.get(trail.id).wc;
  check('⇧⌘T : l’onglet revient sur la page où il était, avec ses pages précédentes et suivantes', back.getURL() === origin + '/h2' && back.navigationHistory.canGoBack() && back.navigationHistory.canGoForward());
  back.navigationHistory.goBack();
  await until(() => d.tabs[trail.id].title === 'Étape 1', 'précédent après réouverture');
  back.navigationHistory.goForward();
  await until(() => d.tabs[trail.id].title === 'Étape 2', 'suivant');
  back.navigationHistory.goForward();
  await until(() => d.tabs[trail.id].title === 'Étape 3', 'suivant encore');
  check('… « précédent » et « suivant » y mènent réellement', true);
  w.close(trail.id);
  w.replay('undo');
  await until(() => d.tabs[trail.id] && win.live.get(trail.id) && d.tabs[trail.id].title === 'Étape 3' && !win.live.get(trail.id).loading, 'onglet rétabli par ⌘Z');
  check('⌘Z après une fermeture rend aussi le parcours', win.live.get(trail.id).wc.navigationHistory.canGoBack());
  w.close(trail.id, { silent: true });
  w.closed.length = 0;
  w.undoStack.length = 0;

  // Épinglé : « Modifier l'adresse épinglée… » ; favori : pastille de notification lue dans le titre.
  const pin = w.newTab(origin + '/h1');
  await until(() => d.tabs[pin.id].title === 'Étape 1', 'page à épingler');
  w.togglePin(pin.id);
  w.undoStack.length = 0;
  const [plain] = make('T');
  check('menu d’un épinglé : « Modifier l’adresse épinglée… » (absent pour un onglet du jour)', labels(w.tabMenuTemplate(pin.id)).includes(T('tabs.editPinned')) && !labels(w.tabMenuTemplate(plain)).includes(T('tabs.editPinned')));
  w.close(plain, { silent: true });
  pick(w.tabMenuTemplate(pin.id), 'tabs.editPinned').click();
  await until(() => w.modalMode === 'command' && w.commandMode === 'edit', 'barre d’adresse ouverte');
  await until(() => modal('document.getElementById("cmd-input").value') .then((v) => v === origin + '/h1'), 'adresse épinglée dans le champ');
  w.runItem({ kind: 'raw', url: origin + '/h2', title: origin + '/h2' });
  await until(() => d.tabs[pin.id].title === 'Étape 2', 'épinglé rendu à sa nouvelle adresse');
  check('adresse validée : elle devient celle de l’épinglé, qui s’y rend ; ⌘Z rend l’ancienne', d.tabs[pin.id].homeUrl === origin + '/h2' && pending() === 'undo.editPinned' && (w.replay('undo'), d.tabs[pin.id].homeUrl === origin + '/h1') && (w.replay('redo'), d.tabs[pin.id].homeUrl === origin + '/h2'));
  commands.run(w, 'commandBar');
  await until(() => w.modalMode === 'command', 'barre d’adresse ordinaire');
  w.runItem({ kind: 'raw', url: origin + '/h3', title: origin + '/h3' });
  await until(() => d.tabs[pin.id].title === 'Étape 3', 'navigation ordinaire');
  check('une navigation ordinaire (⌘L) ne touche pas à l’adresse épinglée', d.tabs[pin.id].homeUrl === origin + '/h2');
  w.toggleFavorite(pin.id);
  d.tabs[pin.id].title = '(3) Boîte de réception';
  w.changed();
  await until(() => ui(`(() => { const c = document.querySelector('#fav [data-id="${pin.id}"] .count'); return !!c && !c.hidden && c.textContent === '3'; })()`), 'pastille « 3 » sur le favori');
  check('favori : le nombre annoncé en tête du titre de sa page paraît en pastille', await ui(`(() => { const t = document.querySelector('#fav [data-id="${pin.id}"]').getBoundingClientRect(); const c = document.querySelector('#fav [data-id="${pin.id}"] .count').getBoundingClientRect(); return c.width >= 14 && c.right <= t.right && c.top >= t.top && c.bottom < t.top + t.height / 2; })()`));
  d.tabs[pin.id].title = '(1234) Fil';
  w.changed();
  await until(() => ui(`document.querySelector('#fav [data-id="${pin.id}"] .count').textContent === '99+'`), 'pastille plafonnée');
  d.tabs[pin.id].title = 'Boîte de réception';
  w.changed();
  await until(() => ui(`document.querySelector('#fav [data-id="${pin.id}"] .count').hidden`), 'pastille retirée');
  d.tabs[pin.id].title = '(7) Boîte';
  OrbeWindow.destroyView(pin.id);
  w.changed();
  await until(() => ui(`!document.querySelector('#fav [data-id="${pin.id}"]').classList.contains('live')`), 'favori endormi');
  check('… plafonnée à « 99+ », retirée quand le titre n’en annonce plus, et absente d’un favori dont la page n’est pas chargée', await ui(`document.querySelector('#fav [data-id="${pin.id}"] .count').hidden`));
  w.toggleFavorite(pin.id);
  { const loc = w.locate(pin.id); if (loc) loc.arr.splice(loc.index, 1); OrbeWindow.destroyView(pin.id); OrbeWindow.forget(pin.id, d); delete d.tabs[pin.id]; }
  w.undoStack.length = 0;
  w.redoStack.length = 0;
  store.state.archive = store.state.archive.filter((x) => !x.url.startsWith(origin));
  if (server.closeAllConnections) server.closeAllConnections();
  server.close();

  // --- Menu : une reconstruction prévue n'est pas repoussée sans fin ------------------------------
  w.toggleSidebar(false);
  const storm = setInterval(() => menu.refresh(), 40); // changements d'état rapprochés, comme une page qui charge
  const t0 = Date.now();
  await until(() => !!menuItem('view.showSidebar'), 'menu reconstruit malgré les appels rapprochés', 3000).catch(() => {});
  const took = Date.now() - t0;
  clearInterval(storm);
  check('barre de menus : des changements d’état rapprochés ne retardent pas sa mise à jour (elle suit en moins d’une seconde)', !!menuItem('view.showSidebar') && took < 1000, `${took} ms`);
  w.toggleSidebar(true);
  menu.refresh(true);
  await until(() => !!menuItem('view.hideSidebar'), 'menu à jour');
  check('« Nouvel Espace… » reste disponible dans le menu d’une fenêtre ordinaire', menuItem('spaces.new').enabled === true);

  // --- Remise en état ------------------------------------------------------------------------
  w.toast = toast0;
  for (const sp of [space]) {
    for (const id of [...sp.today]) { OrbeWindow.destroyView(id); delete d.tabs[id]; }
    sp.today = []; sp.pinned = []; sp.splits = [];
    delete w.activeBySpace[sp.id];
  }
  for (const id of Object.keys(d.tabs)) if (mine(d.tabs[id]) || /exemple\.test\/fin-/.test(d.tabs[id].url)) { OrbeWindow.destroyView(id); delete d.tabs[id]; }
  d.spaces.splice(d.spaces.indexOf(space), 1);
  store.state.archive = store.state.archive.filter((x) => !mine(x) && !/exemple\.test\/fin-/.test(x.url));
  check('remise en état : l’archive retrouve sa taille', store.state.archive.length === archive0, `${store.state.archive.length} / ${archive0}`);
  if (tone0 === undefined) delete store.state.window.emojiTone; else store.state.window.emojiTone = tone0;
  w.closed.length = 0;
  w.undoStack.length = 0;
  w.redoStack.length = 0;
  w.spaceId = home;
  if (homeActive && d.tabs[homeActive]) w.activeBySpace[home] = homeActive;
  if (w.sidebarVisible !== sidebar0) w.toggleSidebar(sidebar0);
  clipboard.writeText(clip0);
  w.layout();
  w.changed();
  if (!ctx.check && failed) throw new Error(`${failed} vérification(s) en échec`);
};
