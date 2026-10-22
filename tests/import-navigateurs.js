// Import direct des signets de Chrome, Brave, Edge, Opera, Firefox et Safari.
// Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/import-navigateurs.js node scripts/dev.js --selftest
// Les profils sont fabriqués dans un dossier temporaire (tests/fixtures/navigateurs.js) :
// aucun vrai profil de la machine n'est lu.
const fs = require('fs');
const os = require('os');
const path = require('path');

const { until, ignorer } = require('./outils');
const fx = require('./fixtures/navigateurs');

module.exports = async function importTests(ctx) {
  const { first: w, store, imports, openSettings, commands } = ctx;
  let failed = 0;
  const check = ctx.check || ((name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`); });
  const br = require('../src/main/import-browsers');
  const bm = require('../src/main/import-bookmarks');
  const real = { ...br.conf };
  const outline = (nodes) => nodes.map((n) => (n.type === 'folder' ? `[${n.name}:${outline(n.children)}]` : n.title)).join(',');
  const pinnedOutline = (nodes) => nodes.map((n) => (n.type === 'folder' ? `[${n.name}:${pinnedOutline(n.children)}]` : w.data.tabs[n.id].title)).join(',');

  check('en test, sans dossier d’essai désigné, aucun navigateur n’est cherché (les vrais profils ne sont pas lus)', real.home === '' && br.detect().length === 0 && (await br.read('chrome', 'Default')).error === 'missing');

  // --- Profils d'essai, à la manière de macOS ------------------------------------------
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-nav-'));
  const sqlite = ['/usr/bin/sqlite3', '/bin/sqlite3'].find((p) => fs.existsSync(p)) || '';
  const made = fx.profils(home, { platform: 'darwin', sqlite });
  br.configure({ home, platform: 'darwin', sqlite, local: '', roaming: '' });
  const found = br.detect();
  const ids = found.map((b) => b.id).join();
  const chrome = found.find((b) => b.id === 'chrome');
  check('navigateurs trouvés : ceux qui ont des signets, avec leurs profils nommés', ids === 'chrome,brave,opera,firefox,safari'
    && JSON.stringify(chrome.profiles) === JSON.stringify([{ id: 'Default', name: 'Amadou' }, { id: 'Profile 1', name: 'Travail' }])
    && found.find((b) => b.id === 'firefox').profiles.length === 1 && found.find((b) => b.id === 'firefox').profiles[0].name === 'default-release', JSON.stringify(found));
  check('Edge installé sans signets, profil sans fichier de signets, « System Profile » : non proposés', !ids.includes('edge') && !chrome.profiles.some((p) => /7|System/.test(p.id)));

  const c = (await br.read('chrome', 'Default'));
  check('Chrome : barre de favoris au premier niveau, dossiers imbriqués, « Autres favoris » en dossier, dossier vide retiré',
    outline(c.nodes) === 'Wikipédia,[Lecture:Le Monde,[Tech:MDN]],Titre piégé gras,[Autres favoris:GitHub]' && c.bookmarks === 5 && c.folders === 3 && c.source === 'bookmarks', outline(c.nodes || []) + JSON.stringify({ ...c, nodes: 0 }));
  check('Chrome : « javascript: » et « chrome: » écartés, titre nettoyé (balises, caractères de contrôle, inversion du sens d’écriture)',
    c.dropped === 2 && !JSON.stringify(c.nodes).includes('javascript') && !/[‮\u0000<]/.test(JSON.stringify(c.nodes)));
  check('second profil de Chrome, Brave et Opera (profil à la racine) lus de même',
    outline((await br.read('chrome', 'Profile 1')).nodes) === 'Intranet' && outline((await br.read('brave', 'Default')).nodes) === 'Brave' && outline((await br.read('opera', '.')).nodes) === 'Opera');
  check('profil demandé hors de la liste trouvée sur le disque : refusé',
    (await br.read('chrome', '../../Brave-Browser/Default')).error === 'missing' && (await br.read('chrome', 'System Profile')).error === 'missing' && (await br.read('chrome', 'Profile 7')).error === 'missing'
    && (await br.read('firefox', '../../../ailleurs')).error === 'missing' && (await br.read('lynx', 'Default')).error === 'missing' && (await br.read('edge', 'Default')).error === 'missing');

  // Firefox : base lue par le sqlite3 du système, sinon dernière sauvegarde.
  br.configure({ sqlite: '' });
  const fb = (await br.read('firefox', 'Profiles/abcd1234.default-release'));
  check('Firefox sans sqlite3 : dernière sauvegarde automatique (mozLz40) décodée, barre personnelle au premier niveau',
    fb.source === 'backup' && fb.date === '2026-10-02' && outline(fb.nodes) === 'Mozilla,[Outils:Can I use],[Menu des signets:Sauvegarde seulement],[Autres signets:Dakar]' && fb.dropped === 1, outline(fb.nodes || []) + JSON.stringify({ ...fb, nodes: 0 }));
  br.configure({ sqlite });
  if (made.hasSqlite) {
    const fs1 = (await br.read('firefox', 'Profiles/abcd1234.default-release'));
    const left = fs.readdirSync(made.ffProfile).sort().join();
    check('Firefox avec sqlite3 : base places.sqlite lue sur une copie, étiquettes et requêtes « place: » écartées, profil intact',
      fs1.source === 'sqlite' && outline(fs1.nodes) === 'Mozilla,[Outils:Can I use],[Menu des signets:Base seulement],[Autres signets:Dakar]' && fs1.dropped === 1 && left === 'bookmarkbackups,places.sqlite', outline(fs1.nodes || []) + ' ' + left);
    fs.writeFileSync(path.join(made.ffProfile, 'places.sqlite'), 'ceci n’est pas une base');
    check('base illisible : retour à la sauvegarde', (await br.read('firefox', 'Profiles/abcd1234.default-release')).source === 'backup');
  } else ignorer('Firefox avec sqlite3 : base places.sqlite lue sur une copie', 'pas de sqlite3 sur ce système : la sauvegarde automatique est le chemin lu');
  // Base hostile (finding 3) : « moz_bookmarks » est une vue qui appelle writefile() et edit().
  if (sqlite) {
    const evilDir = path.join(home, 'base-hostile');
    fs.mkdirSync(evilDir, { recursive: true });
    const marker = path.join(home, 'ecrit-par-la-base.txt');
    const edited = path.join(home, 'lance-par-la-base.txt');
    const view = (fn) => `CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT); INSERT INTO moz_places VALUES (1, 'https://piege.exemple/');
      CREATE VIEW moz_bookmarks AS SELECT 3 AS id, 2 AS type, 1 AS parent, 'toolbar_____' AS guid, CAST(${fn} AS TEXT) AS title, NULL AS fk, 0 AS position
        UNION ALL SELECT 11, 1, 3, 'signet000001', 'Piège', 1, 0;`;
    const sqlEsc = (x) => x.replace(/'/g, "''");
    const cp = require('child_process');
    const make = (fn) => { fs.rmSync(path.join(evilDir, 'places.sqlite'), { force: true }); cp.execFileSync(sqlite, [path.join(evilDir, 'places.sqlite'), view(fn)], { stdio: 'ignore' }); };
    const query = 'SELECT title FROM moz_bookmarks;';
    make(`writefile('${sqlEsc(marker)}', 'x')`);
    // Ce que change le mode sûr, sur ce sqlite3 : sans lui, writefile() écrit ; avec les options d'Orbe, il est refusé.
    // (Depuis une vue, les sqlite3 récents refusent déjà : le mode sûr ne dépend pas de cette protection-là.)
    let unsafe = false;
    let safeWrote = true;
    try { cp.execFileSync(sqlite, [path.join(evilDir, 'places.sqlite'), `SELECT writefile('${sqlEsc(marker)}', 'x');`], { stdio: 'ignore' }); unsafe = fs.existsSync(marker); } catch {}
    fs.rmSync(marker, { force: true });
    try { cp.execFileSync(sqlite, [...br.SQLITE_ARGS, path.join(evilDir, 'places.sqlite'), `SELECT writefile('${sqlEsc(marker)}', 'x');`], { stdio: 'ignore' }); } catch {}
    safeWrote = fs.existsSync(marker);
    fs.rmSync(marker, { force: true });
    void query;
    const r1 = await br.readFirefoxSqlite(evilDir).then((x) => x, (e) => ({ refused: String(e.message).slice(0, 160) }));
    const wrote = fs.existsSync(marker);
    make(`edit('x', 'touch ${sqlEsc(edited)}')`);
    const r2 = await br.readFirefoxSqlite(evilDir).then((x) => x, (e) => ({ refused: String(e.message).slice(0, 160) }));
    check('base de Firefox hostile (vue « moz_bookmarks » qui appelle writefile() ou edit()) : sqlite3 en mode sûr refuse, rien n’est écrit ni lancé',
      unsafe && !safeWrote && !wrote && !fs.existsSync(edited) && !!r1.refused && !!r2.refused && br.SQLITE_ARGS.join(' ') === '-safe -readonly -batch -json', JSON.stringify({ unsafe, safeWrote, wrote, r1, r2 }));
  } else ignorer('base de Firefox hostile : sqlite3 en mode sûr', 'pas de sqlite3 sur ce système');
  // Identifiants en double (finding 5) : chaque dossier n'est déroulé qu'une fois.
  const dupRows = [{ id: 3, type: 2, parent: 1, guid: 'toolbar_____', title: 't' }];
  for (let level = 0; level < 40; level++) for (let k = 0; k < 2; k++) dupRows.push({ id: 100 + level + 1, type: 2, parent: level ? 100 + level : 3, guid: 'g', title: 'n' + level });
  dupRows.push({ id: 999, type: 1, parent: 140, guid: 'x', title: 'fond', url: 'https://fond.exemple/' });
  const t1 = Date.now();
  const dupTree = br.build(br.firefoxRowsTree(dupRows));
  check('lignes de Firefox aux identifiants en double (2^40 chemins possibles) : lues en un instant, sans se multiplier', Date.now() - t1 < 1500 && dupTree.bookmarks === 1, `${Date.now() - t1} ms, ${dupTree.bookmarks} signet(s)`);

  check('décodeur LZ4 : copie qui se recouvre, et blocs faux refusés (décalage nul ou hors bornes, taille annoncée fausse ou démesurée)',
    br.lz4Block(Buffer.from([0x14, 0x61, 0x01, 0x00, 0x10, 0x62]), 10).toString() === 'aaaaaaaaab'
    && [() => br.lz4Block(Buffer.from([0x14, 0x61, 0x00, 0x00, 0x10, 0x62]), 10), () => br.lz4Block(Buffer.from([0x14, 0x61, 0x09, 0x00, 0x10, 0x62]), 10), () => br.lz4Block(Buffer.from([0x14, 0x61, 0x01, 0x00, 0x10, 0x62]), 11),
      () => br.lz4Block(Buffer.from([0x14, 0x61, 0x01, 0x00, 0x10, 0x62]), 4), () => br.lz4Block(Buffer.from([0xf0, 0xff, 0xff]), 600), () => br.lz4Block(Buffer.from([0x10]), 2 ** 31), () => br.mozlz4(Buffer.from('pas une sauvegarde'))]
      .every((fn) => { try { fn(); return false; } catch { return true; } }));
  const big = fx.lz4Compress(Buffer.from('signet '.repeat(5000)));
  check('compresseur d’essai : la sauvegarde fabriquée contient de vraies répétitions', big.length < 400 && br.lz4Block(big, 35000).toString() === 'signet '.repeat(5000));

  // Safari.
  const s = (await br.read('safari', '.'));
  check('Safari : liste de propriétés binaire décodée (chaînes ASCII et UTF-16), barre au premier niveau, liste de lecture et « file: » écartés',
    outline(s.nodes) === 'Apple,[Sénégal:Présidence — République du Sénégal,APS],[Menu des signets:iCloud],[Voyages:SNCF]' && s.bookmarks === 5 && s.dropped === 1 && s.source === 'plist', outline(s.nodes || []) + JSON.stringify({ ...s, nodes: 0 }));
  if (process.platform !== 'win32' && process.getuid && process.getuid() !== 0) {
    fs.chmodSync(made.safari, 0o000);
    const blocked = br.detect().find((b) => b.id === 'safari');
    const refused = (await br.read('safari', '.'));
    fs.chmodSync(made.safari, 0o644);
    check('Safari protégé par le système (lecture refusée) : reconnu et dit, sans erreur', !!blocked && blocked.blocked === 'fullDiskAccess' && refused.error === 'fullDiskAccess');
  } else ignorer('Safari protégé par le système (lecture refusée)', 'droits de fichiers non restrictifs sur ce système');
  const cut = fx.bplist(fx.SAFARI);
  // Tableau qui se contient lui-même : objet 0 = tableau d'un élément, qui est l'objet 0.
  const loop = Buffer.concat([Buffer.from('bplist00', 'latin1'), Buffer.from([0xa1, 0x00, 0x00]), Buffer.from([0, 0, 0, 8]), (() => { const tr = Buffer.alloc(32); tr[6] = 4; tr[7] = 2; tr.writeBigUInt64BE(1n, 8); tr.writeBigUInt64BE(11n, 24); return tr; })()]);
  const bad = [loop, cut.subarray(0, 200), Buffer.concat([cut.subarray(0, cut.length - 20), Buffer.alloc(20, 0xff)]), Buffer.from('bplist00' + 'x'.repeat(100)), Buffer.alloc(0), Buffer.from('<?xml version="1.0"?><plist></plist>')];
  // Liste où chaque dossier cite deux fois le suivant (finding 5) : 2^60 chemins, et une grande chaîne partagée.
  {
    const objs = []; // objets écrits à la main : [octets]
    const str = Buffer.concat([Buffer.from([0x5f, 0x12]), (() => { const b = Buffer.alloc(4); b.writeUInt32BE(900000); return b; })(), Buffer.alloc(900000, 0x61)]);
    const levels = 60;
    // 0 : chaîne « Children » ; 1 : grande chaîne ; 2..levels+1 : dictionnaires { Children: [suivant, suivant] } ; tableaux ensuite.
    objs.push(Buffer.concat([Buffer.from([0x58]), Buffer.from('Children', 'latin1')]));
    objs.push(str);
    const ref = (n) => Buffer.from([n >> 8, n & 255]);
    for (let i = 0; i < levels; i++) objs.push(Buffer.concat([Buffer.from([0xd1]), ref(0), ref(2 + levels + i)]));
    for (let i = 0; i < levels; i++) { const next = i + 1 < levels ? 2 + i + 1 : 1; objs.push(Buffer.concat([Buffer.from([0xa4]), ref(next), ref(next), ref(1), ref(1)])); }
    const parts = [Buffer.from('bplist00', 'latin1')];
    const offs = [];
    let at = 8;
    for (const o of objs) { offs.push(at); parts.push(o); at += o.length; }
    const table = Buffer.alloc(offs.length * 4);
    offs.forEach((o, i) => table.writeUInt32BE(o, i * 4));
    const tr = Buffer.alloc(32);
    tr[6] = 4; tr[7] = 2;
    tr.writeBigUInt64BE(BigInt(objs.length), 8);
    tr.writeBigUInt64BE(2n, 16);
    tr.writeBigUInt64BE(BigInt(at), 24);
    const t2 = Date.now();
    let dag = null;
    try { const root = br.bplist(Buffer.concat([...parts, table, tr])); dag = { same: root.Children[0] === root.Children[1], text: root.Children[2].length }; try { br.safariTree(root); } catch {} } catch (err) { dag = { error: err.message }; }
    const mem = process.memoryUsage().heapUsed;
    check('liste de propriétés aux références partagées (2^60 chemins, une chaîne de 900 000 caractères citée 120 fois) : chaque objet décodé une seule fois, en un instant',
      Date.now() - t2 < 2000 && dag && dag.same === true && dag.text === 900000 && mem < 1.5e9, JSON.stringify({ ms: Date.now() - t2, dag }));
  }
  check('liste de propriétés tronquée, à l’en-tête ou à la table faux : refusée sans plantage', bad.every((b) => { try { br.bplist(b); return false; } catch { return true; } }));

  // Fichiers hostiles : bornes.
  const many = br.build(Array.from({ length: 9000 }, (_, i) => ({ title: 'n' + i, url: 'https://n.exemple/' + i })));
  let deepRaw = { title: 'fond', url: 'https://fond.exemple/' };
  for (let i = 0; i < 60; i++) deepRaw = { title: 'n' + i, children: [deepRaw] };
  const deep = br.build([deepRaw]);
  const depth = (nodes) => nodes.reduce((d, n) => Math.max(d, n.type === 'folder' ? 1 + depth(n.children) : 0), 0);
  let abyss = { type: 'url', name: 'x', url: 'https://x.exemple/' };
  for (let i = 0; i < 3000; i++) abyss = { type: 'folder', name: 'n', children: [abyss] };
  const abyssFile = path.join(home, 'abime.json');
  fs.writeFileSync(abyssFile, JSON.stringify({ roots: { bookmark_bar: abyss } }));
  let abyssOk = false;
  try { const r = br.readChromium(abyssFile); abyssOk = r.bookmarks === 0; } catch { abyssOk = true; }
  const wide = br.build(Array.from({ length: 900 }, (_, i) => ({ title: 'd' + i, children: [{ title: 's', url: 'https://d.exemple/' + i }] })));
  check('signets par milliers, dossiers par centaines, imbrication sans fin : plafonnés comme l’import d’un fichier HTML',
    many.bookmarks === bm.MAX_BOOKMARKS && many.truncated && depth(deep.nodes) === bm.MAX_DEPTH && deep.bookmarks === 1 && abyssOk && wide.folders === bm.MAX_FOLDERS && wide.bookmarks === 900 && wide.truncated,
    JSON.stringify({ many: many.bookmarks, deep: depth(deep.nodes), abyssOk, wide: wide.folders }));
  const junkFile = path.join(made.chrome, 'Profile 1', 'Bookmarks');
  fs.writeFileSync(junkFile, '{"roots": 12');
  const junk = (await br.read('chrome', 'Profile 1'));
  fs.writeFileSync(junkFile, JSON.stringify({ roots: { bookmark_bar: { type: 'folder', children: [{ type: 'url', name: 'x', url: 'data:text/html,x' }] } } }));
  const empty = (await br.read('chrome', 'Profile 1'));
  fs.writeFileSync(junkFile, fx.chromeBookmarks([fx.url('Intranet', 'http://intranet.exemple/')]));
  check('fichier de signets abîmé ou sans adresse web : dit, rien n’est importé', junk.error === 'unreadable' && empty.error === 'empty');

  // --- Chemins de Windows -----------------------------------------------------------------
  const homeWin = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-nav-win-'));
  fx.profils(homeWin, { platform: 'win32' });
  br.configure({ home: homeWin, platform: 'win32', sqlite: '' });
  const win = br.detect();
  check('Windows : Chrome, Brave et Opera sous AppData, Firefox par sa sauvegarde, pas de Safari',
    win.map((b) => b.id).join() === 'chrome,brave,opera,firefox' && outline((await br.read('chrome', 'Default')).nodes).startsWith('Wikipédia,') && (await br.read('firefox', 'Profiles/abcd1234.default-release')).source === 'backup' && (await br.read('safari', '.')).error === 'missing', JSON.stringify(win));
  br.configure({ home, platform: 'darwin', sqlite });

  // --- Aperçu, import, annulation ------------------------------------------------------------
  const spaces0 = w.data.spaces.length;
  const tabs0 = Object.keys(w.data.tabs).length;
  const home0 = w.spaceId;
  const p1 = (await imports.preview({ browser: 'chrome', profile: 'Default' }));
  check('aperçu : les comptes sont donnés avant tout import, rien n’est encore ajouté',
    p1.ok && p1.bookmarks === 5 && p1.folders === 3 && p1.dropped === 2 && typeof p1.token === 'string' && w.data.spaces.length === spaces0 && Object.keys(w.data.tabs).length === tabs0, JSON.stringify(p1));
  const pid = w.data.profiles[w.data.profiles.length - 1].id;
  const a1 = imports.apply({ token: p1.token, dest: 'new:' + pid });
  const made1 = w.data.spaces.find((x) => x.id === a1.space);
  check('import dans un nouvel Espace du profil choisi : dossiers et onglets épinglés, Espace affiché',
    a1.ok && made1 && made1.name === 'Google Chrome' && made1.profileId === pid && pinnedOutline(made1.pinned) === outline(c.nodes) && Object.keys(w.data.tabs).length === tabs0 + 5 && w.spaceId === made1.id && made1.today.length === 0, JSON.stringify(a1));
  check('le même aperçu ne s’applique pas deux fois', imports.apply({ token: p1.token, dest: 'new:' + pid }).error === 'expired' && imports.apply({ token: 'inconnu', dest: 'new:default' }).error === 'expired');
  check('Édition → Annuler nomme l’import', w.pendingLabel('undo') === 'undo.import' && store.t('undo.import') === 'Import de signets');
  const u1 = imports.undoLast();
  check('annulation : l’Espace importé et ses onglets disparaissent, on revient à l’Espace précédent',
    u1.ok && w.data.spaces.length === spaces0 && Object.keys(w.data.tabs).length === tabs0 && !w.data.spaces.includes(made1) && w.spaceId !== made1.id && imports.undoLast().ok === false);
  w.switchSpace(home0);

  // Nouvel Espace où l'utilisateur a mis autre chose depuis : l'annulation ne retire que l'import (finding 8).
  const a4 = imports.apply({ token: (await imports.preview({ browser: 'brave', profile: 'Default' })).token, dest: 'new:default' });
  const sp4 = w.data.spaces.find((x) => x.id === a4.space);
  const mineTab = { id: 'essai-a-garder', url: 'https://exemple.org/garde', title: 'À garder', favicon: '', createdAt: Date.now(), lastActiveAt: Date.now() };
  w.data.tabs[mineTab.id] = mineTab;
  sp4.today.push(mineTab.id);
  const u4 = imports.undoLast(a4.undoId);
  check('annuler un import fait dans un nouvel Espace où l’utilisateur a ouvert un onglet depuis : les signets importés partent, l’Espace et cet onglet restent',
    u4.ok && w.data.spaces.includes(sp4) && sp4.pinned.length === 0 && sp4.today.join() === mineTab.id && !!w.data.tabs[mineTab.id] && Object.keys(w.data.tabs).length === tabs0 + 1, JSON.stringify({ u4, pinned: sp4.pinned.length, today: sp4.today }));
  sp4.today.length = 0;
  delete w.data.tabs[mineTab.id];
  w.removeSpace(sp4.id);
  w.switchSpace(home0);
  // L'annulation vise l'import de la ligne cliquée, et s'éteint au bout d'une demi-heure.
  const a5 = imports.apply({ token: (await imports.preview({ browser: 'brave', profile: 'Default' })).token, dest: 'new:default' });
  const a6 = imports.apply({ token: (await imports.preview({ browser: 'opera', profile: '.' })).token, dest: 'new:default' });
  const wrong = imports.undoLast(a5.undoId);
  const realNow = imports.hooks.now;
  imports.hooks.now = () => Date.now() + 31 * 60e3;
  const late = imports.undoLast(a6.undoId);
  const lateList = imports.list().canUndo;
  const lateMenu = w.pendingLabel('undo');
  imports.hooks.now = realNow;
  check('« Annuler l’import » d’une ligne n’annule pas l’import suivant d’un autre navigateur ; passé trente minutes, il n’annule plus rien (ni par le bouton, ni par Édition → Annuler)',
    wrong.ok === false && wrong.expired && late.ok === false && late.expired && lateList === false && lateMenu !== 'undo.import' && w.data.spaces.some((x) => x.id === a5.space) && w.data.spaces.some((x) => x.id === a6.space) && Object.keys(w.data.tabs).length === tabs0 + 2,
    JSON.stringify({ wrong, late, lateList, lateMenu }));
  w.removeSpace(a5.space);
  w.removeSpace(a6.space);
  w.undoStack.length = 0;
  w.redoStack.length = 0;
  w.switchSpace(home0);

  // Dans un Espace existant qui a déjà des épinglés : un dossier au nom du navigateur.
  const target = w.data.spaces.find((x) => x.id === home0);
  const keep = { type: 'folder', id: 'essai-import', name: 'Déjà là', open: true, children: [] };
  target.pinned.push(keep);
  const pinned0 = target.pinned.length;
  const p2 = (await imports.preview({ browser: 'safari', profile: '.' }));
  const a2 = imports.apply({ token: p2.token, dest: 'space:' + home0 });
  const node = target.pinned[target.pinned.length - 1];
  check('import dans un Espace existant : rangé dans un dossier au nom du navigateur, sans changer d’Espace',
    a2.ok && a2.space === home0 && w.spaceId === home0 && w.data.spaces.length === spaces0 && Object.keys(w.data.tabs).length === tabs0 + 5
    && target.pinned.length === pinned0 + 1 && node.type === 'folder' && node.name === 'Safari' && pinnedOutline(node.children) === outline(s.nodes), JSON.stringify(a2));
  // Un onglet importé déplacé ailleurs, et un onglet de l'utilisateur rangé dans le dossier importé.
  const own = { id: 'essai-onglet', url: 'https://exemple.org/a-moi', title: 'À moi', favicon: '', createdAt: Date.now(), lastActiveAt: Date.now(), homeUrl: 'https://exemple.org/a-moi' };
  w.data.tabs[own.id] = own;
  const moved = node.children.shift();
  keep.children.push(moved);
  node.children.push({ type: 'tab', id: own.id });
  const undone = w.replay('undo');
  check('⌘Z annule l’import : les onglets importés partent où qu’ils aient été rangés, l’onglet mis par l’utilisateur dans le dossier reste',
    undone && Object.keys(w.data.tabs).length === tabs0 + 1 && !!w.data.tabs[own.id] && target.pinned.includes(node) && node.children.length === 1 && node.children[0].id === own.id && keep.children.length === 0,
    JSON.stringify({ undone, tabs: Object.keys(w.data.tabs).length - tabs0, node: node.children.length, keep: keep.children.length }));
  delete w.data.tabs[own.id];
  target.pinned = target.pinned.filter((n) => n !== node && n !== keep);
  // Espace sans rien d'épinglé : les signets arrivent tels quels, et repartent de même.
  const bare = w.data.spaces.find((x) => !x.pinned.length);
  if (bare) {
    const a3 = imports.apply({ token: (await imports.preview({ browser: 'opera', profile: '.' })).token, dest: 'space:' + bare.id });
    const flat = a3.ok && bare.pinned.length === 1 && bare.pinned[0].type === 'tab' && w.data.tabs[bare.pinned[0].id].url === 'https://www.opera.com/';
    imports.undoLast();
    check('Espace sans épinglés : les signets y arrivent tels quels, sans dossier ; l’annulation les retire', flat && bare.pinned.length === 0 && Object.keys(w.data.tabs).length === tabs0);
  }
  check('destination inconnue : refusée, rien n’est ajouté', imports.apply({ token: (await imports.preview({ browser: 'brave', profile: 'Default' })).token, dest: 'space:inconnu' }).error === 'dest'
    && imports.apply({ token: (await imports.preview({ browser: 'brave', profile: 'Default' })).token, dest: 'new:inconnu' }).error === 'dest' && Object.keys(w.data.tabs).length === tabs0);
  w.undoStack.length = 0;
  w.redoStack.length = 0;

  // --- Volet Import des réglages -----------------------------------------------------------------
  store.state.window.settingsPane = 'general';
  const sw = openSettings('import');
  const js = (code) => sw.webContents.executeJavaScript(code);
  await until(() => sw.isVisible(), 'réglages affichés');
  await until(async () => (await js('document.querySelectorAll("#import-browsers .imp-row").length')) === 5, 'navigateurs listés dans le volet');
  const rows = JSON.parse(await js(`JSON.stringify([...document.querySelectorAll('#import-browsers .imp-row')].map((r) => ({
    id: r.dataset.browser, name: r.querySelector('.imp-name').textContent, profiles: [...r.querySelectorAll('.imp-profile option')].map((o) => o.textContent), go: !!r.querySelector('.imp-go') })))`));
  check('volet Import : une ligne par navigateur trouvé, avec le choix du profil quand il y en a plusieurs',
    rows.map((r) => r.id).join() === 'chrome,brave,opera,firefox,safari' && rows[0].name === 'Google Chrome' && rows[0].profiles.join() === 'Amadou,Travail' && rows[1].profiles.length === 0 && rows.every((r) => r.go), JSON.stringify(rows));
  const row = (id) => `document.querySelector('#import-browsers .imp-row[data-browser="${id}"]')`;
  await js(`${row('firefox')}.querySelector('.imp-go').click()`);
  await until(() => js(`!!${row('firefox')}.querySelector('.imp-apply')`), 'aperçu de Firefox');
  const seen = JSON.parse(await js(`JSON.stringify({ sub: ${row('firefox')}.querySelector('.imp-sub').textContent, dests: [...${row('firefox')}.querySelectorAll('.imp-dest option')].map((o) => o.textContent), dest: ${row('firefox')}.querySelector('.imp-dest').value })`));
  check('aperçu dans le volet : nombre de signets et de dossiers, destination à choisir (nouvel Espace d’un profil, ou un Espace existant)',
    seen.sub.startsWith('4 signets et 3 dossiers trouvés.') && seen.dests.length === w.data.profiles.length + w.data.spaces.length && seen.dests[0].startsWith('Nouvel Espace (') && seen.dests.some((d) => d.startsWith('Dans ')) && seen.dest === 'new:default'
    && Object.keys(w.data.tabs).length === tabs0, JSON.stringify(seen));
  await js(`${row('firefox')}.querySelector('.imp-apply').click()`);
  await until(() => js(`!!${row('firefox')}.querySelector('.imp-undo')`), 'import de Firefox fait');
  const ffSpace = w.data.spaces[w.data.spaces.length - 1];
  check('« Importer » : Espace « Firefox » créé, compte rendu dans le volet',
    ffSpace.name === 'Firefox' && Object.keys(w.data.tabs).length === tabs0 + 4 && (await js(`${row('firefox')}.querySelector('.imp-sub').textContent`)) === '4 signets importés dans 🔖 Firefox.');
  await js(`${row('firefox')}.querySelector('.imp-undo').click()`);
  await until(() => js(`!!${row('firefox')}.querySelector('.imp-go')`), 'import annulé depuis le volet');
  check('« Annuler l’import » : tout est retiré, la ligne le dit', !w.data.spaces.includes(ffSpace) && Object.keys(w.data.tabs).length === tabs0 && (await js(`${row('firefox')}.querySelector('.imp-sub').textContent`)).startsWith('Import annulé'));
  await js(`${row('chrome')}.querySelector('.imp-profile').value = 'Profile 1'; ${row('chrome')}.querySelector('.imp-go').click()`);
  await until(() => js(`!!${row('chrome')}.querySelector('.imp-cancel')`), 'aperçu du second profil');
  const sub2 = await js(`${row('chrome')}.querySelector('.imp-sub').textContent`);
  await js(`${row('chrome')}.querySelector('.imp-cancel').click()`);
  await until(() => js(`!!${row('chrome')}.querySelector('.imp-go')`), 'aperçu abandonné');
  check('aperçu du profil choisi, puis « Annuler » : rien n’est importé', sub2.startsWith('1 signets et 0 dossiers') && Object.keys(w.data.tabs).length === tabs0 && w.data.spaces.length === spaces0, sub2);
  check('le volet dit ce qui n’est pas repris : mots de passe par CSV, ni cookies ni historique', /mots de passe/i.test(await js('document.getElementById("import-msg").textContent')) && /cookies/.test(await js('document.getElementById("import-msg").textContent')));

  // Safari protégé : explication et bouton vers les réglages du système.
  if (process.platform !== 'win32' && process.getuid && process.getuid() !== 0) {
    const opened = [];
    const realOpen = imports.hooks.openExternal;
    imports.hooks.openExternal = (u) => opened.push(u);
    fs.chmodSync(made.safari, 0o000);
    await js(`${row('safari')}.querySelector('.imp-go').click()`);
    await until(async () => /macOS refuse/.test(await js(`${row('safari')}.querySelector('.imp-sub').textContent`)), 'refus de Safari expliqué');
    sw.webContents.reload();
    await until(async () => (await js('document.querySelectorAll("#import-browsers .imp-access").length').catch(() => 0)) === 1, 'ligne Safari protégée');
    await js('document.querySelector("#import-browsers .imp-access").click()');
    await until(() => opened.length === 1, 'réglages du système demandés');
    check('Safari protégé : la ligne explique l’« Accès complet au disque » et ouvre le bon volet des réglages du système',
      /Accès complet au disque/.test(await js(`${row('safari')}.querySelector('.imp-sub').textContent`)) && opened[0] === 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles' && !(await js(`!!${row('safari')}.querySelector('.imp-go')`)));
    fs.chmodSync(made.safari, 0o644);
    await js('document.querySelector("#import-browsers .imp-retry").click()');
    await until(() => js(`!!${row('safari')} && !!${row('safari')}.querySelector('.imp-go')`), 'Safari de nouveau lisible');
    check('« Réessayer » : une fois l’accès donné, Safari se lit', true);
    imports.hooks.openExternal = realOpen;
  }
  check('commande « Importer depuis Arc » toujours là', !!commands.byName.get('importArc'));

  sw.close();
  store.state.window.settingsPane = 'general';
  w.switchSpace(home0);
  w.undoStack.length = 0;
  w.redoStack.length = 0;
  br.configure(real);
  store.save();
  for (const d of [home, homeWin]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
  if (!ctx.check && failed) throw new Error(`${failed} vérification(s) en échec`);
};
