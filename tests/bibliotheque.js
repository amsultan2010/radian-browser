// Bibliothèque : archive (cause de fermeture, filtres, restauration, suppression,
// confirmation), périodes, dernière section, Espaces, Boosts, menu d'un
// téléchargement (copier, masquer, corbeille, partage), glisser hors d'Orbe.
// Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/bibliotheque.js node scripts/dev.js --selftest
// Aucun fichier ne part réellement à la corbeille, rien n'est réellement glissé :
// ces deux gestes du système sont remplacés par des témoins.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { clipboard, ClipboardItem, dialog, nativeImage } = require('electron');

const { until } = require('./outils');

module.exports = async function bibliothequeTests(ctx) {
  const { first: w, store, win } = ctx;
  let failed = 0;
  const check = ctx.check || ((name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`); });
  const ui = (js) => w.ui.webContents.executeJavaScript(js);
  const library = require('../src/main/library');
  const downloads = require('../src/main/downloads');
  const commands = require('../src/main/commands');
  const T = (k, v) => store.t(k, null, v);
  const d = w.data;
  const lib = (name, a) => library.action(name, a, null);

  await until(() => ui('typeof S === "object" && S !== null'), 'coque chargée');
  const home = w.spaceId;
  const homeActive = w.activeId;
  const archive0 = store.state.archive;
  const downloads0 = store.state.downloads;
  const boosts0 = store.state.boosts;
  const section0 = store.state.window.librarySection;
  const archiveHours0 = store.state.settings.archiveAfterHours;
  const space = store.makeSpace('Lecture', '📚', '#10b981');
  const other = store.makeSpace('Musique', '🎧', '#ec4899');
  d.spaces.push(space, other);
  w.switchSpace(space.id);
  store.state.archive = [];
  // Adresse locale qui refuse la connexion : rien ne sort de la machine.
  const site = (n) => `http://127.0.0.1:9/${n}`;
  const make = (name, sp = space) => { const tab = w.createTab(site(name), { space: sp, index: sp.today.length }); tab.title = 'Article ' + name; return tab.id; };

  // --- Archive : cause de fermeture ---------------------------------------------------
  const a1 = make('main');
  const a2 = make('office');
  const a3 = make('musique', other);
  w.close(a1, { ask: false });
  // Onglet resté sans visite au-delà du délai : archivé d'office.
  store.state.settings.archiveAfterHours = 12;
  d.tabs[a2].lastActiveAt = Date.now() - 13 * 36e5;
  d.tabs[a3].lastActiveAt = Date.now();
  const keep = make('gardé');
  d.tabs[keep].lastActiveAt = Date.now();
  // (Les onglets des autres essais ne sont pas concernés : ils passent pour récents le temps de ce passage.)
  const seenAt = Object.entries(d.tabs).filter(([id]) => ![a1, a2, a3, keep].includes(id)).map(([id, tab]) => [id, tab.lastActiveAt]);
  for (const [id] of seenAt) d.tabs[id].lastActiveAt = Date.now();
  win.archiveStale();
  for (const [id, at] of seenAt) if (d.tabs[id]) { if (at === undefined) delete d.tabs[id].lastActiveAt; else d.tabs[id].lastActiveAt = at; }
  w.close(a3, { ask: false });
  store.archive({ url: site('petite'), title: 'Vu en petite fenêtre' });
  const by = (name) => (store.state.archive.find((x) => x.url === site(name)) || {}).by;
  check('archive : chaque entrée retient comment l’onglet a été fermé (à la main, d’office, petite fenêtre) et son Espace',
    by('main') === 'manual' && by('office') === 'auto' && by('musique') === 'manual' && by('petite') === 'little' && !!d.tabs[keep]
    && store.state.archive.find((x) => x.url === site('musique')).spaceId === other.id && store.state.archive.every((x) => typeof x.id === 'string' && x.id.length >= 6),
    JSON.stringify(store.state.archive.map((x) => [x.url, x.by])));
  check('archive : identifiants tous différents', new Set(store.state.archive.map((x) => x.id)).size === store.state.archive.length);

  // Anciennes entrées (sans identifiant ni cause) : lues comme fermées à la main.
  store.state.archive.push({ url: site('ancienne'), title: 'Ancienne entrée', spaceId: space.id, at: Date.now() - 40 * 864e5 });
  let got = await lib('lib:get', {});
  const urls = (rows) => rows.map((r) => r.url.split('/').pop()).join();
  check('ancienne entrée d’archive : reçoit un identifiant à la lecture, comptée « à la main »', got.archive.length === 5 && got.archive.every((r) => r.id) && got.archive.find((r) => r.url === site('ancienne')).by === 'manual');
  check('filtre « fermés à la main »', urls((await lib('lib:get', { how: 'manual' })).archive) === 'musique,main,ancienne');
  check('filtre « archivés d’office »', urls((await lib('lib:get', { how: 'auto' })).archive) === 'office');
  check('filtre « petite fenêtre »', urls((await lib('lib:get', { how: 'little' })).archive) === 'petite');
  check('filtre par Espace', urls((await lib('lib:get', { space: other.id })).archive) === 'musique' && urls((await lib('lib:get', { space: space.id })).archive) === 'office,main,ancienne');
  check('filtres et recherche ensemble', urls((await lib('lib:get', { space: space.id, how: 'manual', q: 'ANCIENNE' })).archive) === 'ancienne');
  check('filtre inconnu ou mal formé : ignoré', (await lib('lib:get', { how: 'tout', space: 42 })).archive.length === 5 && (await lib('lib:get', 'x')).archive.length === 5 && (await lib('lib:get', null)).archive.length === 5);
  check('chaque ligne dit son Espace', got.archive.find((r) => r.url === site('musique')).space === '🎧 Musique' && got.archive.find((r) => r.url === site('petite')).space === '');

  // --- Restaurer, supprimer ------------------------------------------------------------
  const idOf = (name) => store.state.archive.find((x) => x.url === site(name)).id;
  const wanted = idOf('musique');
  const back = await lib('lib:restore', wanted);
  const tab = back && d.tabs[back.tabId];
  check('restaurer un onglet archivé : il retourne dans son Espace d’origine, qui s’affiche, et quitte l’archive',
    !!tab && tab.url === site('musique') && tab.title === 'Article musique' && other.today[0] === back.tabId && w.spaceId === other.id && w.activeId === back.tabId && !store.state.archive.some((x) => x.id === wanted));
  check('restaurer deux fois, ou un identifiant inconnu : rien', (await lib('lib:restore', wanted)) === false && (await lib('lib:restore', 'inconnu')) === false && (await lib('lib:restore', null)) === false && other.today.length === 1);
  // L'Espace d'origine n'existe plus : l'onglet revient dans l'Espace affiché.
  store.state.archive.find((x) => x.url === site('ancienne')).spaceId = 'disparu';
  w.switchSpace(space.id);
  const back2 = await lib('lib:restore', idOf('ancienne'));
  check('Espace d’origine disparu : l’onglet revient dans l’Espace affiché', !!back2 && back2.spaceId === space.id && space.today.includes(back2.tabId));
  const n = store.state.archive.length;
  check('supprimer une entrée de l’archive', (await lib('lib:archiveDelete', idOf('petite'))) === true && store.state.archive.length === n - 1 && !store.state.archive.some((x) => x.url === site('petite'))
    && (await lib('lib:archiveDelete', 'inconnu')) === false && store.state.archive.length === n - 1);

  // --- La page : périodes, filtres, croix, état vide -------------------------------------
  const now = Date.now();
  const old = new Date(new Date(now).getFullYear(), new Date(now).getMonth() - 2, 15, 12).getTime(); // le 15, deux mois plus tôt
  store.state.archive = [
    { id: 'p1', url: site('p1'), title: 'Lu ce matin', spaceId: space.id, by: 'manual', at: now - 1000 },
    { id: 'p2', url: site('p2'), title: 'Lu il y a deux mois', spaceId: space.id, by: 'auto', at: old },
    { id: 'p3', url: site('p3'), title: '<img src=x onerror="window.__xss=1">', spaceId: other.id, by: 'little', at: old - 1000 },
  ];
  const libTab = w.openInternal('library.html#archive');
  const page = () => win.live.get(libTab.id).wc;
  const js = (code) => page().executeJavaScript(code);
  await until(() => js('document.querySelectorAll("#list .line").length === 3'), 'archive affichée');
  const fixed = new Date(2026, 9, 14, 15, 0).getTime(); // mercredi 14 octobre 2026
  const labels = await js(`[0, 1, 2, 3, 9, 12, 13, 14, 40, 400].map((n) => period(${fixed} - n * 864e5, ${fixed}))`);
  check('périodes, comme dans Arc : aujourd’hui, hier, plus tôt cette semaine, la semaine dernière, plus tôt ce mois-ci, puis le mois',
    labels.join('|') === [T('lib.today'), T('lib.yesterday'), T('lib.thisWeek'), T('lib.lastWeek'), T('lib.lastWeek'), T('lib.thisMonth'), T('lib.thisMonth'), 'Septembre', 'Septembre', 'Septembre 2025'].join('|'), labels.join('|'));
  const seen = await js(`({ titres: [...document.querySelectorAll('#list h2')].map((h) => h.textContent), filtres: !document.getElementById('filters').hidden,
    choix: [...document.getElementById('f-how').options].map((o) => o.textContent), espaces: [...document.getElementById('f-space').options].map((o) => o.textContent),
    croix: document.querySelectorAll('#list .line [data-do=delete]').length, etiquettes: [...document.querySelectorAll('#list .line .tag')].map((x) => x.textContent),
    injecte: document.querySelectorAll('#list img[src="x"]').length, brut: document.querySelectorAll('#list .line .name')[2].textContent, xss: window.__xss || 0 })`);
  check('page de l’archive : lignes groupées par période', seen.titres.length === 2 && seen.titres[0] === T('lib.today') && seen.titres[1] !== T('lib.today'), seen.titres.join(' | '));
  check('page de l’archive : filtres (façon de fermer, Espace), croix par ligne, étiquettes d’Espace et de cause',
    seen.filtres && seen.choix.join('|') === ['all', 'manual', 'auto', 'little'].map((k) => T('lib.how.' + k)).join('|') && seen.espaces[0] === T('lib.allSpaces') && seen.espaces.includes('📚 Lecture')
    && seen.croix === 3 && seen.etiquettes.includes('📚 Lecture') && seen.etiquettes.includes(T('lib.by.auto')) && seen.etiquettes.includes(T('lib.by.little')), JSON.stringify(seen));
  check('un titre de page n’est jamais interprété comme du HTML', seen.injecte === 0 && seen.xss === 0 && seen.brut === '<img src=x onerror="window.__xss=1">');
  await js(`(() => { const s = document.getElementById('f-how'); s.value = 'auto'; s.dispatchEvent(new Event('change')); })()`);
  await until(() => js('document.querySelectorAll("#list .line").length === 1 && document.querySelector("#list .line .name").textContent === "Lu il y a deux mois"'), 'archive filtrée');
  check('le filtre choisi dans la page réduit la liste', true);
  await js(`(() => { const s = document.getElementById('f-how'); s.value = ''; s.dispatchEvent(new Event('change')); })()`);
  await until(() => js('document.querySelectorAll("#list .line").length === 3'), 'archive entière');

  // Vider l'archive depuis la page : question d'abord.
  const boxes = [];
  const box0 = dialog.showMessageBox;
  let answer = 1;
  dialog.showMessageBox = async (...args) => { boxes.push(args[args.length - 1]); return { response: answer }; };
  await js('document.getElementById("clear").click()');
  await until(() => boxes.length === 1, 'question posée');
  check('« Vider l’archive » dans la Bibliothèque : confirmation « Cette action ne peut pas être annulée » ; « Annuler » garde tout',
    boxes[0].message === T('archive.clearConfirm') && /annul/i.test(boxes[0].detail) && boxes[0].detail.includes('3') && store.state.archive.length === 3);
  answer = 0;
  await js('document.getElementById("clear").click()');
  await until(() => store.state.archive.length === 0, 'archive vidée');
  dialog.showMessageBox = box0;
  await until(() => js('!!document.querySelector("#list .empty")'), 'état vide');
  const empty = await js('[...document.querySelectorAll("#list .empty > div")].map((x) => x.textContent)');
  check('archive vide : « Rien ici pour l’instant ! », avec une ligne d’explication', empty.join('|') === [T('lib.emptyArchive'), T('lib.emptyArchiveHint')].join('|') && boxes.length === 2, empty.join('|'));

  // --- Dernière section -------------------------------------------------------------------
  await until(() => store.state.window.librarySection === 'archive', 'section retenue');
  await js(`document.querySelector('[data-tab="downloads"]').click()`);
  await until(() => store.state.window.librarySection === 'downloads', 'section retenue après un clic');
  for (const bad of ['inconnue', null, 42, { a: 1 }, '__proto__']) await lib('lib:section', bad);
  check('la Bibliothèque retient la dernière section affichée ; une valeur inconnue est ignorée', store.state.window.librarySection === 'downloads' && commands.librarySection() === 'downloads');
  w.close(libTab.id, { ask: false });
  w.run('library');
  const again = w.activeId;
  check('⇧⌘L rouvre la Bibliothèque sur cette section', d.tabs[again].url.endsWith('library.html#downloads'));
  w.run('history');
  await until(() => d.tabs[again].url.endsWith('library.html#history') && store.state.window.librarySection === 'history', 'historique demandé');
  check('⌘Y demande toujours l’historique, dans le même onglet', w.activeId === again);
  store.state.window.librarySection = 'inconnue';
  check('section retenue illisible : l’historique', commands.librarySection() === 'history');

  // --- Espaces --------------------------------------------------------------------------
  w.run('librarySpaces');
  const page2 = () => win.live.get(w.activeId).wc;
  const libId = w.activeId;
  await until(() => page2().executeJavaScript(`location.hash === '#spaces' && document.querySelectorAll('#list .line').length === ${d.spaces.length}`), 'section Espaces');
  got = await lib('lib:get', {});
  const row = got.spaces.find((s) => s.id === space.id);
  check('section « Espaces » : chaque Espace avec son profil et le nombre de ses onglets ; l’Espace affiché est marqué',
    got.spaces.length === d.spaces.length && !!row && row.name === 'Lecture' && row.icon === '📚' && row.today === space.today.length && row.pinned === 0 && row.current === (w.spaceId === space.id)
    && got.spaces.filter((s) => s.current).length === 1 && typeof row.profile === 'string' && row.profile.length > 0);
  check('« Gérer les Espaces… » ouvre cette section, onglet « Espaces » allumé', await page2().executeJavaScript(`document.querySelector('[data-tab].on').dataset.tab === 'spaces' && document.getElementById('clear').textContent === ${JSON.stringify(T('spaces.new'))}`));
  w.switchSpace(space.id);
  check('aller à un Espace depuis la Bibliothèque', (await lib('lib:space', { id: other.id, do: 'focus' })) === true && w.spaceId === other.id);
  const spaces0 = d.spaces.length;
  const refused = [];
  for (const bad of [null, 'x', { id: 'inconnu', do: 'focus' }, { id: other.id, do: 'exploser' }, { id: other.id }, { do: 'delete' }]) refused.push(await lib('lib:space', bad));
  check('Espace inconnu ou action inconnue : refusé', refused.every((r) => r === false) && d.spaces.length === spaces0, JSON.stringify(refused));
  // Supprimer : la question habituelle est posée ; « Annuler » garde l'Espace.
  const asked = [];
  dialog.showMessageBox = async (...args) => { asked.push(args[args.length - 1]); return { response: 1 }; };
  await lib('lib:space', { id: other.id, do: 'delete' });
  dialog.showMessageBox = box0;
  check('supprimer un Espace depuis la Bibliothèque : même confirmation que par le menu', asked.length === 1 && asked[0].message === T('spaces.deleteConfirm', { name: 'Musique' }) && d.spaces.includes(other));
  w.switchSpace(space.id);
  w.activate(libId);

  // --- Boosts ---------------------------------------------------------------------------
  store.state.boosts = { 'exemple.fr': { css: 'body { color: red }', zaps: ['.pub', '#bandeau'], enabled: true }, 'autre.org': { css: '', zaps: ['.x'], enabled: false } };
  got = await lib('lib:get', {});
  check('section « Boosts » : un par site, avec ce qu’il change',
    got.boosts.map((b) => b.host).join() === 'autre.org,exemple.fr' && got.boosts[1].zaps === 2 && got.boosts[1].css > 0 && got.boosts[1].enabled === true && got.boosts[0].enabled === false && got.boosts[0].css === 0);
  check('désactiver puis réactiver un Boost', (await lib('lib:boost', { host: 'exemple.fr', do: 'toggle' })) === true && store.state.boosts['exemple.fr'].enabled === false
    && (await lib('lib:boost', { host: 'exemple.fr', do: 'toggle' })) === true && store.state.boosts['exemple.fr'].enabled === true && require('../src/main/boosts').get('exemple.fr').zaps.length === 2);
  check('supprimer un Boost', (await lib('lib:boost', { host: 'autre.org', do: 'delete' })) === true && !store.state.boosts['autre.org']);
  const kept = JSON.stringify(store.state.boosts);
  const no = [];
  for (const bad of [null, { host: 'inconnu.fr', do: 'delete' }, { host: '__proto__', do: 'toggle' }, { host: 'constructor', do: 'delete' }, { host: 'exemple.fr', do: 'autre' }, { do: 'toggle' }]) no.push(await lib('lib:boost', bad));
  check('site sans Boost, nom piégé ou action inconnue : refusé', no.every((r) => r === false) && JSON.stringify(store.state.boosts) === kept, JSON.stringify(no));
  await page2().executeJavaScript(`document.querySelector('[data-tab="boosts"]').click()`);
  await until(() => page2().executeJavaScript(`document.querySelectorAll('#list .line').length === 1 && document.querySelector('#list .line .name').textContent === 'exemple.fr'`), 'section Boosts');
  const boostLine = await page2().executeJavaScript(`({ sous: document.querySelector('#list .line .sub').textContent, boutons: [...document.querySelectorAll('#list .line [data-do]')].map((b) => b.dataset.do), vider: document.getElementById('clear').hidden })`);
  check('page des Boosts : résumé, boutons « Désactiver » et « Supprimer »', boostLine.sous.includes(T('lib.boostZaps', { n: 2 })) && boostLine.boutons.join() === 'toggle,delete' && boostLine.vider === true, JSON.stringify(boostLine));
  store.state.boosts = {};
  await page2().executeJavaScript(`document.querySelector('[data-tab="boosts"]').click()`);
  await until(() => page2().executeJavaScript(`!!document.querySelector('#list .empty') && document.querySelector('#list .empty > div').textContent === ${JSON.stringify(T('lib.emptyBoosts'))}`), 'aucun Boost');
  check('aucun Boost : message propre à la section', true);

  // --- Téléchargements : menu, copier, masquer, corbeille, glisser -------------------------
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-biblio-'));
  const file = (name, content) => { const p = path.join(dir, name); fs.writeFileSync(p, content); return p; };
  const png = nativeImage.createFromBitmap(Buffer.alloc(2 * 2 * 4, 200), { width: 2, height: 2 }).toPNG();
  const rec = (name, extra = {}) => ({ id: 'dl-' + name, name, path: path.join(dir, name), url: 'https://fichiers.exemple.fr/' + name, total: 10, received: 10, state: 'completed', at: Date.now(), profile: 'default', ...extra });
  file('notes.txt', 'bonjour');
  file('image.png', png);
  file('garde.txt', 'reste');
  store.state.downloads = [rec('notes.txt'), rec('image.png'), rec('garde.txt'), rec('parti.txt'), rec('encours.bin', { state: 'progressing', received: 4 }), rec('coupe.bin', { state: 'interrupted', canResume: false })];
  const find = (name) => store.state.downloads.find((x) => x.name === name);
  const ids = (tpl) => tpl.filter((x) => x.type !== 'separator').map((x) => x.id + (x.enabled === false ? '(grisé)' : '')).join();
  const mac = process.platform === 'darwin';
  const full = downloads.menuTemplate(find('notes.txt'));
  check('menu d’un téléchargement, comme dans Arc : Ouvrir, Copier, Afficher dans le Finder, Partager (macOS), Masquer, Placer dans la corbeille',
    ids(full) === ['open', 'copy', 'reveal', ...(mac ? ['share'] : []), 'hide', 'trash'].join()
    && full.find((x) => x.id === 'copy').label === T('edit.copy') && full.find((x) => x.id === 'hide').label === T('dl.hide') && full.find((x) => x.id === 'trash').label === T('dl.trash'), ids(full));
  if (mac) {
    const share = full.find((x) => x.id === 'share');
    check('macOS : « Partager » ouvre la feuille de partage du système avec le fichier (AirDrop, Messages…)', share.role === 'shareMenu' && share.sharingItem.filePaths.join() === find('notes.txt').path);
  }
  check('fichier disparu : ouvrir, copier, afficher et corbeille grisés ; masquer reste', ids(downloads.menuTemplate(find('parti.txt'))) === 'open(grisé),copy(grisé),reveal(grisé),hide,trash(grisé)', ids(downloads.menuTemplate(find('parti.txt'))));
  check('téléchargement en cours : Pause et Annuler, ni Masquer ni corbeille', /pause\(grisé\),cancel$/.test(ids(downloads.menuTemplate(find('encours.bin')))) && !/hide|trash/.test(ids(downloads.menuTemplate(find('encours.bin')))), ids(downloads.menuTemplate(find('encours.bin'))));
  check('téléchargement interrompu : Réessayer', downloads.menuTemplate(find('coupe.bin')).find((x) => x.id === 'resume').label === T('dl.retry'));

  // Le menu s'ouvre par le message de la page ; chaque article agit sur ce téléchargement.
  const env0 = { ...downloads.env };
  const startDrag0 = library.env.startDrag;
  const trashed = [];
  const revealed = [];
  let pick = null;
  let shown = null;
  downloads.env.trash = async (f) => { trashed.push(f); };
  downloads.env.reveal = (f) => { revealed.push(f); };
  downloads.env.popup = async (tpl) => { shown = tpl; const it = tpl.find((x) => x.id === pick); if (it && it.enabled !== false) await it.click(); };
  pick = 'reveal';
  await downloads.action('dl:menu', 'dl-notes.txt', null);
  check('message « dl:menu » : le menu du bon téléchargement s’ouvre ; « Afficher dans le Finder »', !!shown && ids(shown) === ids(full) && revealed.join() === find('notes.txt').path);
  check('« dl:menu » pour un identifiant inconnu : aucun menu', (shown = null, await downloads.action('dl:menu', 'inconnu', null)) === false && shown === null);

  // Presse-papiers de la machine : relevé avant, rétabli après.
  const clip0 = [];
  for (const it of await clipboard.read().catch(() => [])) {
    const o = {};
    for (const ty of it.types) { if (!ty.startsWith('electron application/')) { try { o[ty] = await it.getType(ty); } catch {} } }
    if (Object.keys(o).length) clip0.push(o);
  }
  const types = async () => (await clipboard.read()).flatMap((it) => it.types);
  const typed = async (ty) => { for (const it of await clipboard.read()) if (it.types.includes(ty)) return it.getType(ty); return null; };
  pick = 'copy';
  await clipboard.writeText('avant');
  await downloads.action('dl:menu', 'dl-image.png', null);
  await until(async () => (await types()).includes('image/png'), 'image dans le presse-papiers');
  const copied = nativeImage.createFromBuffer(Buffer.from(await (await typed('image/png')).arrayBuffer()));
  check('« Copier » une image : l’image elle-même est dans le presse-papiers', !copied.isEmpty() && copied.getSize().width === 2 && copied.getSize().height === 2, JSON.stringify(copied.getSize()));
  await clipboard.writeText('avant');
  // (Selon le système, l'adresse relue peut finir par un caractère nul ou différer par la casse du lecteur.)
  const samePath = (uri, file) => { try { return path.normalize(require('url').fileURLToPath(String(uri).replace(/[\0\s]+$/g, '').split(/\r?\n/)[0])).toLowerCase() === path.normalize(file).toLowerCase(); } catch { return false; } };
  const how = await downloads.action('dl:copy', 'dl-notes.txt', null);
  const uri = await typed('text/uri-list');
  const uriText = uri ? (typeof uri === 'string' ? uri : await uri.text()) : '';
  check('« Copier » un autre fichier : le fichier lui-même (à coller dans le Finder ou l’Explorateur)', how === 'file' && samePath(uriText, find('notes.txt').path), `${how} ${JSON.stringify(uriText)} ${(await types()).join()}`);
  await clipboard.writeText('avant');
  check('« Copier » un fichier disparu : rien, le presse-papiers reste tel quel', (await downloads.action('dl:copy', 'dl-parti.txt', null)) === false && (await clipboard.readText()) === 'avant');
  if (clip0.length) await clipboard.write(clip0.map((o) => new ClipboardItem(o))).catch(() => {}); else clipboard.clear();

  pick = 'hide';
  await downloads.action('dl:menu', 'dl-garde.txt', null);
  check('« Masquer de la liste » : la ligne disparaît, le fichier reste', !find('garde.txt') && fs.existsSync(path.join(dir, 'garde.txt')) && trashed.length === 0);
  pick = 'trash';
  await downloads.action('dl:menu', 'dl-notes.txt', null);
  check('« Placer dans la corbeille » : le fichier part à la corbeille du système, la ligne disparaît', trashed.join() === path.join(dir, 'notes.txt') && !find('notes.txt'));
  check('corbeille pour un téléchargement en cours ou un identifiant inconnu : refusé', (await downloads.action('dl:trash', 'dl-encours.bin', null)) !== true && !!find('encours.bin') && (await downloads.action('dl:trash', 'inconnu', null)) === false && trashed.length === 1);
  downloads.env.trash = async () => { throw new Error('corbeille indisponible'); };
  const err0 = console.error;
  console.error = () => {};
  const failedTrash = await downloads.action('dl:trash', 'dl-image.png', null);
  console.error = err0;
  check('la corbeille refuse : la ligne reste, rien n’est perdu', failedTrash === false && !!find('image.png') && fs.existsSync(path.join(dir, 'image.png')));

  // Glisser hors d'Orbe.
  const drags = [];
  library.env.startDrag = (wc, item) => { drags.push(item); };
  got = await lib('lib:get', {});
  check('liste des fichiers : présence vérifiée sur le disque', got.downloads.find((r) => r.name === 'image.png').exists === true && got.downloads.find((r) => r.name === 'parti.txt').exists === false
    && got.media.map((r) => r.name).join() === 'image.png');
  const dragged = await library.action('lib:drag', 'dl-image.png', page2());
  check('glisser un fichier hors de la Bibliothèque : le système reçoit le vrai fichier et une icône', dragged === true && drags.length === 1 && drags[0].file === path.join(dir, 'image.png') && !drags[0].icon.isEmpty());
  const noDrag = [await library.action('lib:drag', 'dl-parti.txt', page2()), await library.action('lib:drag', 'dl-encours.bin', page2()), await library.action('lib:drag', 'inconnu', page2()), await library.action('lib:drag', { path: '/etc/hosts' }, page2()), await library.action('lib:drag', 'dl-image.png', null)];
  check('fichier disparu, téléchargement en cours, identifiant inconnu ou chemin fourni par la page : rien n’est glissé', noDrag.every((r) => r === false) && drags.length === 1, JSON.stringify(noDrag));

  // La page : lignes à glisser, bouton « ··· », fichier disparu signalé.
  await page2().executeJavaScript(`document.querySelector('[data-tab="downloads"]').click()`);
  await until(() => page2().executeJavaScript(`document.querySelectorAll('#list .line').length === ${store.state.downloads.length}`), 'téléchargements affichés');
  const lines = await page2().executeJavaScript(`[...document.querySelectorAll('#list .line')].map((l) => ({ nom: l.querySelector('.name').textContent, glisser: l.draggable, menu: !!l.querySelector('[data-do=menu]'), sous: l.querySelector('.sub').textContent, boutons: [...l.querySelectorAll('[data-do]')].map((b) => b.dataset.do).join() }))`);
  const line = (name) => lines.find((l) => l.nom === name);
  check('page des téléchargements : un fichier présent se glisse et s’ouvre ; chaque ligne a son menu « ··· »',
    line('image.png').glisser === true && line('image.png').boutons === 'open,reveal,menu' && lines.every((l) => l.menu) && line('parti.txt').glisser === false && line('encours.bin').glisser === false, JSON.stringify(lines));
  check('fichier déplacé ou supprimé : la ligne le dit', line('parti.txt').sous.includes(T('dl.missing')) && line('parti.txt').boutons === 'menu');
  // Clic sur « ··· » : le menu de cette ligne.
  shown = null;
  pick = null;
  await page2().executeJavaScript(`[...document.querySelectorAll('#list .line')].find((l) => l.querySelector('.name').textContent === 'image.png').querySelector('[data-do=menu]').click()`);
  await until(() => shown, 'menu ouvert depuis la page');
  check('clic sur « ··· » dans la page : le menu du fichier', ids(shown).startsWith('open,copy,reveal'));

  // --- Fichier téléchargé : marqué « venu d'Internet » pour le système ---------------------
  {
    const http = require('http');
    const server = http.createServer((req, res) => { res.setHeader('content-disposition', 'attachment; filename="orbe-quarantaine.txt"'); res.end('bonjour'); });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}/fichier`;
    const before = store.state.downloads[0];
    w.session.downloadURL(origin);
    const got2 = await until(() => { const x = store.state.downloads[0]; return x && x !== before && x.state === 'completed' && x.marked !== undefined ? x : null; }, 'fichier téléchargé et marqué');
    if (mac) {
      const attr = require('child_process').execFileSync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', got2.path]).toString().trim();
      check('macOS : le fichier téléchargé porte la marque de quarantaine (avertissement du système à l’ouverture)', got2.marked === true && /^0081;[0-9a-f]{8};Orbe;[0-9A-F-]{36}$/.test(attr), attr);
    } else if (process.platform === 'win32') {
      const zone = fs.readFileSync(got2.path + ':Zone.Identifier', 'utf8');
      check('Windows : le fichier téléchargé est marqué « zone Internet » (SmartScreen, avertissement à l’ouverture)', got2.marked === true && /\[ZoneTransfer\]\r\nZoneId=3\r\n/.test(zone) && zone.includes('HostUrl=' + origin), JSON.stringify(zone));
    }
    check('la marque ne touche pas au contenu du fichier', fs.readFileSync(got2.path, 'utf8') === 'bonjour');
    if (process.platform === 'win32') {
      const priv = path.join(dir, 'prive.txt');
      fs.writeFileSync(priv, 'x');
      await downloads.quarantine(priv, origin, false);
      check('navigation privée : l’adresse d’origine n’est pas écrite à côté du fichier', !fs.readFileSync(priv + ':Zone.Identifier', 'utf8').includes('HostUrl'));
    }
    try { fs.unlinkSync(got2.path); } catch {}
    store.state.downloads.splice(store.state.downloads.indexOf(got2), 1);
    server.close();
  }

  // --- Quitter pendant un téléchargement ----------------------------------------------------
  {
    const asked2 = [];
    let agree = false;
    let quits = 0;
    downloads.env.confirm = async (parent, opts) => { asked2.push(opts); return agree; };
    downloads.env.quit = () => { quits += 1; };
    const event = () => ({ n: 0, preventDefault() { this.n += 1; } });
    const e0 = event();
    check('quitter sans téléchargement en cours : aucune question', downloads.beforeQuit(e0) === false && e0.n === 0 && asked2.length === 0);
    const fake = { state: 'progressing', paused: false, getState() { return this.state; }, isPaused() { return this.paused; } };
    downloads.internals.items.set('essai-quitter', fake);
    const e1 = event();
    downloads.beforeQuit(e1);
    await until(() => asked2.length === 1, 'question posée');
    check('quitter pendant un téléchargement : « Des téléchargements sont en cours », l’arrêt est retenu ; « Annuler » ne quitte pas',
      e1.n === 1 && asked2[0].message === T('dl.quitTitle') && asked2[0].detail.includes('1') && asked2[0].cancelId === 1 && quits === 0);
    fake.paused = true;
    const e2 = event();
    check('téléchargement en pause : il reprendra plus tard, aucune question', downloads.beforeQuit(e2) === false && e2.n === 0);
    fake.paused = false;
    agree = true;
    const e3 = event();
    downloads.beforeQuit(e3);
    await until(() => quits === 1, 'arrêt demandé après accord');
    const e4 = event();
    check('« Quitter quand même » : Orbe quitte, sans reposer la question', e3.n === 1 && asked2.length === 2 && downloads.beforeQuit(e4) === false && e4.n === 0);
    downloads.internals.items.delete('essai-quitter');
  }

  // --- Notes : raccourcis d'Arc, export en fichiers texte -------------------------------------
  {
    const notes = require('../src/main/notes');
    const platform = require('../src/main/platform');
    const { Menu } = require('electron');
    const accels = [];
    const collect = (m) => { for (const it of m.items) { if (it.accelerator) accels.push(it.accelerator); if (it.submenu) collect(it.submenu); } };
    collect(Menu.getApplicationMenu());
    check('notes : ⌃⇧N (nouvelle note) et ⌃⌥N (à côté de la page), comme dans Arc ; ⌃⌘N ouvre la fenêtre vierge',
      commands.byName.get('newNote').accel === platform.accel('Ctrl+Shift+N') && commands.byName.get('newNoteSplit').accel === platform.accel('Ctrl+Alt+N')
      && accels.includes(platform.accel('Ctrl+Shift+N')) && accels.includes(platform.accel('Ctrl+Alt+N')) && commands.byName.get('newBlank').accel === platform.accel('Ctrl+Cmd+N') && accels.includes(platform.accel('Ctrl+Cmd+N')) && new Set(accels).size === accels.length,
      accels.filter((x, i) => accels.indexOf(x) !== i).join());
    const notes0 = store.state.notes;
    store.state.notes = [
      { id: 'n1', text: 'Courses\npain, lait', at: Date.UTC(2026, 0, 5) },
      { id: 'n2', text: 'Courses\nautre liste', at: Date.UTC(2026, 0, 6) },
      { id: 'n3', text: '\n  ../../etc/passwd: <secret>?*  \nsuite', at: Date.UTC(2026, 0, 7) },
      { id: 'n4', text: 'CON', at: Date.UTC(2026, 0, 8) },
      { id: 'n5', text: '   \n', at: Date.UTC(2026, 0, 9) },
      { id: 'n6', text: '.caché\nx', at: Date.UTC(2026, 0, 10) },
    ];
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-notes-'));
    const toasts = [];
    const toast0 = w.toast;
    w.toast = (text) => { toasts.push(text); };
    const pick0 = notes.env.pickFolder;
    const reveal0 = notes.env.reveal;
    const opened = [];
    notes.env.reveal = (x) => { opened.push(x); };
    notes.env.pickFolder = async () => '';
    check('export des notes : dossier non choisi, rien n’est écrit', (await w.run('exportNotes')) === null && fs.readdirSync(out).length === 0);
    notes.env.pickFolder = async (parent, opts) => (opts.properties.includes('openDirectory') ? out : '');
    const done = await w.run('exportNotes');
    const names = done ? done.files.map((f) => path.basename(f)).sort() : [];
    check('« Exporter les notes… » : un fichier texte par note, nommé d’après sa première ligne, dans un sous-dossier daté',
      !!done && path.dirname(done.dir) === out && path.basename(done.dir).startsWith(T('notes.exportFolder') + ' ') && names.length === 5 && names.includes('Courses.txt') && names.includes('Courses (2).txt')
      && fs.readFileSync(path.join(done.dir, 'Courses.txt'), 'utf8') === 'Courses\nautre liste' && opened.join() === done.dir && toasts[toasts.length - 1] === T('notes.exported', { n: 5 }), names.join(' | '));
    check('titre piégé : jamais de chemin, de caractère interdit ni de nom réservé ; tout reste dans le dossier choisi',
      !!done && done.files.every((f) => path.dirname(f) === done.dir) && names.includes('etc passwd secret.txt') && names.includes(T('notes.untitled') + '.txt') && names.includes('caché.txt')
      && notes.fileName('a/b\\c:d') === 'a b c d' && notes.fileName('...') === T('notes.untitled') && notes.fileName('x'.repeat(300)).length === 80, names.join(' | '));
    check('la date du fichier est celle de la note', !!done && Math.abs(fs.statSync(path.join(done.dir, 'Courses.txt')).mtimeMs - Date.UTC(2026, 0, 6)) < 2000);
    const again2 = await w.run('exportNotes');
    check('second export le même jour : un autre dossier, rien n’est écrasé', !!again2 && again2.dir !== done.dir && fs.readdirSync(done.dir).length === 5 && fs.readdirSync(again2.dir).length === 5);
    store.state.notes = [];
    check('aucune note : un message, pas de dossier à choisir', (await w.run('exportNotes')) === null && toasts[toasts.length - 1] === T('notes.exportNone'));
    check('« Exporter les notes… » est au menu Aide et dans la barre de commande', (() => {
      const help = Menu.getApplicationMenu().items.find((m) => m.role === 'help' || m.label === T('menu.help'));
      return !!help && help.submenu.items.some((it) => it.label === T('notes.export')) && w.suggestLocal('exporter les notes').some((i) => i.command === 'exportNotes');
    })());
    // Mise en forme : un modèle de blocs vérifié, jamais du HTML.
    {
      const hostile = [
        { t: 'h1', runs: [{ s: 'Titre', b: true }] },
        { t: 'script', runs: [{ s: 'alert(1)' }] },
        { t: 'p', runs: [{ s: '<img src=x onerror=alert(1)>', i: 'oui' }, { s: 'lien', a: 'javascript:alert(1)' }, { s: 'site', a: 'https://exemple.test/a b' }, { s: 'fichier', a: 'file:///etc/passwd' }, { s: 7 }, null] },
        { t: 'todo', done: true, runs: [{ s: 'fait' }], onclick: 'x' },
        { t: 'todo', done: 'oui', runs: [{ s: 'à faire‮' }] },
        { t: 'ol', runs: [{ s: 'un' }] }, { t: 'ol', runs: [{ s: 'deux' }] }, { t: 'ul', runs: 'pas une liste' },
        'chaîne', null,
      ];
      const clean = notes.cleanBlocks(hostile);
      check('notes mises en forme : seuls les types de bloc connus sont gardés, le texte reste du texte, un lien ne mène qu’au web ou à un courriel',
        JSON.stringify(clean) === JSON.stringify([
          { t: 'h1', runs: [{ s: 'Titre', b: true }] },
          { t: 'p', runs: [{ s: '<img src=x onerror=alert(1)>' }, { s: 'lien' }, { s: 'site', a: 'https://exemple.test/a%20b' }, { s: 'fichier' }] },
          { t: 'todo', runs: [{ s: 'fait' }], done: true },
          { t: 'todo', runs: [{ s: 'à faire' }] },
          { t: 'ol', runs: [{ s: 'un' }] }, { t: 'ol', runs: [{ s: 'deux' }] }, { t: 'ul', runs: [] },
        ]), JSON.stringify(clean));
      check('texte seul d’une note mise en forme (titre, export) : puces, numéros et cases en clair',
        notes.plain(clean) === 'Titre\n<img src=x onerror=alert(1)>liensitefichier\n[x] fait\n[ ] à faire\n1. un\n2. deux\n- ');
      const big = notes.cleanBlocks(Array.from({ length: 6000 }, () => ({ t: 'p', runs: [{ s: 'x'.repeat(100) }] })));
      check('note démesurée : 5000 blocs et 200 000 caractères au plus', big.length === 5000 && big.reduce((n, b) => n + b.runs.reduce((m, r) => m + r.s.length, 0), 0) === 200000);
      const { globalAction } = ctx;
      {
        store.state.notes = [];
        const saved = await globalAction('notes:save', { blocks: hostile, text: 'ignoré' });
        check('« notes:save » : ce qui est enregistré est le modèle vérifié et son texte seul', JSON.stringify(saved.blocks) === JSON.stringify(clean) && saved.text === notes.plain(clean) && store.state.notes.length === 1);
        const old = await globalAction('notes:save', { id: saved.id, text: 'simple\ntexte' });
        check('« notes:save » sans blocs (ancienne forme) : texte brut, sans mise en forme', old.text === 'simple\ntexte' && !('blocks' in old));
      }
      // La page reconstruit l'affichage élément par élément : une note dont le texte ressemble à du HTML n'en devient pas.
      store.state.notes = [{ id: 'n-hostile', at: Date.now(), text: '', blocks: clean.concat([{ t: 'p', runs: [{ s: '<b>pas gras</b><script>window.__pwn = 1</script>', a: 'https://orbe.test/' }] }]) },
        { id: 'n-brute', at: Date.now() - 1000, text: '', blocks: [{ t: 'iframe', runs: [{ s: 'x' }] }, { t: 'p', runs: [{ s: 'clic', a: 'javascript:window.__pwn=2' }] }] }];
      const tab = w.openInternal('notes.html');
      const nwc = win.live.get(tab.id).wc;
      await until(() => nwc.executeJavaScript('document.querySelectorAll("#items .note").length === 2 && document.querySelector("#editor h1") !== null'), 'notes mises en forme affichées');
      const seen = await nwc.executeJavaScript(`(() => { const e = document.getElementById('editor'); const tags = [...new Set([...e.querySelectorAll('*')].map((x) => x.tagName))].sort().join(); const links = [...e.querySelectorAll('a')].map((a) => a.getAttribute('href')); return { tags, links, pwn: window.__pwn || 0, last: e.lastElementChild.textContent, todo: e.querySelectorAll('ul.todo > li').length, done: e.querySelectorAll('ul.todo > li[data-done]').length, ol: e.querySelectorAll('ol > li').length, editable: e.contentEditable }; })()`);
      check('page des notes : titres, listes, cases et liens redessinés ; le texte « <script> » reste du texte, aucun autre élément n’entre',
        seen.tags === 'A,B,BR,H1,LI,OL,P,UL' && seen.pwn === 0 && seen.last === '<b>pas gras</b><script>window.__pwn = 1</script>' && seen.todo === 2 && seen.done === 1 && seen.ol === 2
        && seen.links.join() === 'https://exemple.test/a%20b,https://orbe.test/' && seen.editable === 'true', JSON.stringify(seen));
      await nwc.executeJavaScript('document.querySelectorAll("#items .note")[1].click()');
      const brute = await nwc.executeJavaScript(`(() => { const e = document.getElementById('editor'); return { tags: [...e.querySelectorAll('*')].map((x) => x.tagName).join(), a: e.querySelectorAll('a').length, text: e.textContent }; })()`);
      check('note altérée sur le disque (type inconnu, lien « javascript: ») : le bloc inconnu est ignoré, le lien n’est pas créé', brute.tags === 'P' && brute.a === 0 && brute.text === 'clic', JSON.stringify(brute));
      w.close(tab.id);
    }
    store.state.notes = notes0;
    notes.env.pickFolder = pick0;
    notes.env.reveal = reveal0;
    w.toast = toast0;
    try { fs.rmSync(out, { recursive: true, force: true }); } catch {}
  }

  // --- Sauvegardes locales de l'état ---------------------------------------------------------
  {
    const backups = require('../src/main/backups');
    const name = (y, mo, da, h = 12, mi = 0) => `orbe-${y}${String(mo).padStart(2, '0')}${String(da).padStart(2, '0')}-${String(h).padStart(2, '0')}${String(mi).padStart(2, '0')}00.json`;
    const now = new Date(2026, 9, 20, 18, 0, 0);
    const names = [];
    for (let h = 1; h <= 14; h++) names.push(name(2026, 10, 20, h));
    for (let day = 1; day <= 19; day++) { names.push(name(2026, 10, day, 9)); names.push(name(2026, 10, day, 17)); }
    names.push('autre.json', 'orbe-20261020.json');
    const kept = [...backups.keep(names, now)].sort();
    const today = kept.filter((n) => n.startsWith('orbe-20261020-'));
    const older = kept.filter((n) => !n.startsWith('orbe-20261020-'));
    check('sauvegardes gardées : les dix dernières du jour, et la dernière de chacun des dix jours précédents',
      today.length === 10 && today[0] === name(2026, 10, 20, 5) && older.length === 10 && older[0] === name(2026, 10, 10, 17) && older.every((n) => n.endsWith('-170000.json')) && !kept.includes('autre.json'), kept.join(' '));

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-sauvegardes-'));
    const state = path.join(tmp, 'orbe.json');
    fs.writeFileSync(state, JSON.stringify({ spaces: [{ id: 'a', name: 'Avant' }], marque: 1 }));
    const first = backups.snapshot(state, new Date(2026, 9, 20, 8, 0, 0));
    fs.writeFileSync(state, '{ abîmé');
    const broken = backups.snapshot(state, new Date(2026, 9, 20, 9, 0, 0));
    fs.writeFileSync(state, JSON.stringify({ spaces: [{ id: 'a', name: 'Après' }], marque: 2 }));
    for (let h = 10; h <= 21; h++) backups.snapshot(state, new Date(2026, 9, 20, h, 0, 0));
    const listed = backups.list(state);
    check('une copie de l’état par passage, jamais d’un fichier illisible ; au-delà de dix dans la journée, les plus anciennes partent',
      !!first && broken === null && listed.length === 10 && listed[0].name === name(2026, 10, 20, 21) && listed[9].name === name(2026, 10, 20, 12)
      && listed[0].at === new Date(2026, 9, 20, 21, 0, 0).getTime() && JSON.parse(fs.readFileSync(listed[0].file, 'utf8')).marque === 2, listed.map((b) => b.name).join(' '));

    // Restauration : sur un état d'essai, sans relancer Orbe.
    const file0 = store.file;
    const flush0 = store.flush;
    const confirm0 = backups.env.confirm;
    const relaunch0 = backups.env.relaunch;
    const quit0 = backups.env.quit;
    const quitOk0 = backups.env.quitOk;
    const asked3 = [];
    let agree3 = false;
    let relaunched = 0;
    let quits3 = 0;
    backups.env.confirm = async (opts) => { asked3.push(opts); return agree3; };
    backups.env.relaunch = () => { relaunched += 1; };
    backups.env.quit = () => { quits3 += 1; };
    backups.env.quitOk = async () => true;
    store.flush = () => {};
    store.file = state;
    fs.writeFileSync(path.join(backups.dirOf(state), name(2026, 10, 19, 9)), JSON.stringify({ spaces: [{ id: 'a', name: 'Hier' }], marque: 0 }));
    fs.writeFileSync(path.join(backups.dirOf(state), name(2026, 10, 18, 9)), '{ "spaces": "pas une liste" }');
    const wanted3 = name(2026, 10, 19, 9);
    const refused3 = [await backups.restore('../orbe.json'), await backups.restore('inconnue.json'), await backups.restore(name(2026, 10, 18, 9)), await backups.restore(null)];
    check('restauration : nom inconnu, chemin, ou sauvegarde qui n’est pas un état d’Orbe : refusés sans question', refused3.every((r) => r === false) && asked3.length === 0 && store.file === state, JSON.stringify(refused3));
    const cancelled = await backups.restore(wanted3);
    check('« Restaurer une sauvegarde » : la question dit la date ; « Annuler » ne touche à rien', cancelled === false && asked3.length === 1 && asked3[0].message === T('backup.confirm') && /19/.test(asked3[0].detail) && JSON.parse(fs.readFileSync(state, 'utf8')).marque === 2 && relaunched === 0 && quits3 === 0);
    agree3 = true;
    const before3 = backups.list(state).length;
    const done3 = await backups.restore(wanted3);
    // Orbe s'arrête normalement ; l'état n'est remplacé qu'une fois l'arrêt acquis (« will-quit »).
    const pending3 = JSON.parse(fs.readFileSync(state, 'utf8')).marque === 2 && quits3 === 1 && backups.restoring();
    const applied3 = backups.apply();
    const fileAfter = store.file;
    store.file = file0;
    store.flush = flush0;
    check('restauration acceptée : l’état revient à la sauvegarde, l’état quitté est sauvegardé d’abord, Orbe se relance sans rien réécrire',
      done3 === true && pending3 && applied3 === true && JSON.parse(fs.readFileSync(state, 'utf8')).marque === 0 && relaunched === 1 && fileAfter === null
      && backups.list(state).some((b) => JSON.parse(fs.readFileSync(b.file, 'utf8')).marque === 2) && before3 > 0);
    store.file = state;
    const items3 = backups.menuItems();
    store.file = path.join(tmp, 'vide', 'orbe.json');
    const none3 = backups.menuItems();
    store.file = file0;
    const { Menu } = require('electron');
    const help = Menu.getApplicationMenu().items.find((m) => m.role === 'help' || m.label === T('menu.help'));
    const trouble = help && help.submenu.items.find((it) => it.label === T('help.troubleshooting'));
    check('Aide → Dépannage → « Restaurer une sauvegarde » : une ligne par sauvegarde, datée ; sans sauvegarde, une ligne grisée',
      items3.length >= 2 && items3.every((it) => typeof it.click === 'function' && /\d/.test(it.label)) && none3.length === 1 && none3[0].enabled === false && none3[0].label === T('backup.none')
      && !!trouble && trouble.submenu.items.some((it) => it.label === T('backup.menu') && !!it.submenu));
    backups.env.confirm = confirm0;
    backups.env.relaunch = relaunch0;
    backups.env.quit = quit0;
    backups.env.quitOk = quitOk0;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }

  // --- Remise en état ---------------------------------------------------------------------
  Object.assign(downloads.env, env0);
  library.env.startDrag = startDrag0;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  w.close(libId, { ask: false });
  for (const sp of [space, other]) {
    for (const id of [...sp.today]) { win.OrbeWindow.destroyView(id); delete d.tabs[id]; }
    sp.today = [];
    sp.pinned = [];
    sp.splits = [];
    delete w.activeBySpace[sp.id];
    d.spaces.splice(d.spaces.indexOf(sp), 1);
  }
  store.state.archive = archive0;
  store.state.downloads = downloads0;
  store.state.boosts = boosts0;
  store.state.settings.archiveAfterHours = archiveHours0;
  if (section0) store.state.window.librarySection = section0; else delete store.state.window.librarySection;
  w.closed.length = 0;
  w.undoStack.length = 0;
  w.redoStack.length = 0;
  w.spaceId = home;
  if (homeActive && d.tabs[homeActive]) w.activeBySpace[home] = homeActive;
  w.layout();
  w.changed();
  if (!ctx.check && failed) throw new Error(`${failed} vérification(s) en échec`);
};
