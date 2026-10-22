// Correctifs de la revue de sécurité (docs/securite-navigation.md, « Revue d'octobre 2026 ») :
// quarantaine des téléchargements, sauvegardes de l'état, aiguillage des liens,
// Boosts (navigation privée, exécution, sélecteurs, relecture d'un import),
// décodage d'images, adresses affichées à l'étroit, copie en Markdown.
// Chaque vérification échoue sur le code d'avant le correctif.
// Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/securite.js node scripts/dev.js --selftest
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { EventEmitter } = require('events');
const { clipboard, dialog, nativeImage } = require('electron');

const { until } = require('./outils');

module.exports = async function securiteTests(ctx) {
  const { first: w, store, win, OrbeWindow } = ctx;
  let failed = 0;
  const check = ctx.check || ((name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`); });
  const downloads = require('../src/main/downloads');
  const library = require('../src/main/library');
  const backups = require('../src/main/backups');
  const boosts = require('../src/main/boosts');
  const prefs = require('../src/main/prefs');
  const palette = require('../src/main/palette');
  const T = (k, v) => store.t(k, null, v);
  const mac = process.platform === 'darwin';
  const windows = process.platform === 'win32';
  const ui = (js) => w.ui.webContents.executeJavaScript(js);
  await until(() => ui('typeof S === "object" && S !== null'), 'coque chargée');

  const png = nativeImage.createFromBitmap(Buffer.alloc(2 * 2 * 4, 200), { width: 2, height: 2 }).toPNG();
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/image.png')) { res.setHeader('content-type', 'image/png'); return res.end(png); }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.end(`<!doctype html><meta charset="utf-8"><title>Sécurité ${req.url}</title><body><h1>Page</h1><p class="pub">pub</p><img src="/image.png"></body>`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const host = `127.0.0.1:${port}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-securite-'));
  // Chaque partie est indépendante : une erreur dans l'une compte comme un échec et laisse passer les suivantes.
  let part = 0;
  const section = async (fn) => {
    part += 1;
    try { await fn(); } catch (err) { check(`partie ${part} : sans erreur`, false, String((err && err.stack) || err).split('\n').slice(0, 3).join(' | ')); }
  };

  const state0 = { downloads: store.state.downloads, boosts: store.state.boosts, archive: store.state.archive, notes: store.state.notes, routes: store.state.settings.routes, boostsJs: store.state.settings.boostsJs, openPdf: store.state.settings.downloadOpenPdf };
  const env0 = { ...downloads.env };
  const libEnv0 = { ...library.env };
  store.state.downloads = [];
  store.state.boosts = {};

  // === 1. Téléchargement renommé en route (extension) : l'enregistrement suit le vrai fichier =====
  await section(async () => {
    const marked = [];
    downloads.env.quarantine = async (file) => { marked.push(file); return true; };
    const asked = [];
    let agree = false;
    downloads.env.confirm = async (parent, opts) => { asked.push(opts); return agree; };
    const opened = [];
    downloads.env.openPath = (f) => { opened.push(f); };
    const fakeItem = (savePath) => Object.assign(new EventEmitter(), {
      savePath,
      getSavePath() { return this.savePath; },
      setSavePath(p) { this.savePath = p; },
      getReceivedBytes: () => 7, getTotalBytes: () => 7, isPaused: () => false, canResume: () => false, getState: () => 'completed',
      getURLChain: () => [], getMimeType: () => 'text/plain', getETag: () => '', getLastModifiedTime: () => '', getStartTime: () => 0,
    });
    const first = path.join(dir, 'rapport.txt');
    const d = { id: 'sec-1', name: 'rapport.txt', path: first, url: 'https://fichiers.exemple.fr/rapport', total: 7, received: 0, state: 'progressing', at: Date.now(), profile: 'default' };
    store.state.downloads.unshift(d);
    const item = fakeItem(first);
    const announced = [];
    downloads.internals.track(d, item, null, { persist: true, hooks: { onDownload: (phase, rec) => { announced.push({ phase, path: rec.path, state: rec.state, marked: marked.slice() }); } } });
    // L'extension impose son nom après « will-download » : chemin piégé, caractère qui retourne le sens de lecture.
    fs.writeFileSync(path.join(dir, 'outil.command'), 'déjà là');
    const target = downloads.rename(item, '../../../ailleurs/outil.command');
    check('extension, nom imposé : réduit à un simple nom, dans le dossier du téléchargement, sans remplacer un fichier existant',
      target === path.join(dir, 'outil (1).command') && item.getSavePath() === target && fs.readFileSync(path.join(dir, 'outil.command'), 'utf8') === 'déjà là', target);
    check('extension, nom imposé : même nettoyage que pour un site (caractère caché qui retourne le sens de lecture, points finaux)',
      path.basename(downloads.rename(fakeItem(path.join(dir, 'a.txt')), 'facture‮fdp.exe. .')) === 'facturefdp.exe' && downloads.rename(fakeItem(path.join(dir, 'a.txt')), '   ') === path.join(dir, 'a.txt'));
    fs.writeFileSync(target, 'bonjour');
    item.emit('done', {}, 'completed');
    await until(() => d.state === 'completed', 'téléchargement terminé');
    const done = announced.find((a) => a.phase === 'done');
    check('téléchargement renommé par une extension : l’enregistrement décrit le fichier réellement écrit (chemin, nom, exécutable)',
      d.path === target && d.name === 'outil (1).command' && d.danger === true, JSON.stringify([d.path, d.name, d.danger]));
    check('…et c’est ce fichier-là qui reçoit la marque « venu d’Internet », avant que la fin soit annoncée',
      marked.join() === target && d.marked === true && !!done && done.marked.join() === target && done.path === target && done.state === 'completed', JSON.stringify([marked, done]));
    await downloads.openFile(d, null);
    check('…et son ouverture demande confirmation, comme pour tout exécutable', asked.length === 1 && asked[0].message === T('dl.dangerTitle', { name: 'outil (1).command' }) && opened.length === 0);
    // « Toujours demander » : l'utilisateur a choisi l'emplacement, l'extension ne le change pas.
    const chosen = fakeItem(path.join(dir, 'choisi.txt'));
    const dc = { id: 'sec-1b', name: 'choisi.txt', path: chosen.savePath, url: 'https://fichiers.exemple.fr/c', state: 'progressing', asked: true };
    downloads.internals.track(dc, chosen, null, { persist: false, hooks: { onDownload() {} } });
    check('emplacement choisi par l’utilisateur (« toujours demander ») : une extension ne le remplace pas', downloads.rename(chosen, 'autre.exe') === path.join(dir, 'choisi.txt') && dc.name === 'choisi.txt');
    chosen.emit('done', {}, 'cancelled');

    // === 2. Marque impossible à poser : jamais ouvert d'office, question avant tout usage ==========
    let attempts = 0;
    let works = false;
    downloads.env.quarantine = async () => { attempts += 1; return works; };
    const tabs = [];
    downloads.env.openInTab = (url) => { tabs.push(url); return true; };
    store.state.settings.downloadOpenPdf = true;
    const pdf = path.join(dir, 'facture.pdf');
    fs.writeFileSync(pdf, '%PDF-1.4\n');
    const d2 = { id: 'sec-2', name: 'facture.pdf', path: pdf, url: 'https://fichiers.exemple.fr/facture.pdf', total: 9, received: 0, state: 'progressing', at: Date.now(), profile: 'default', gesture: true };
    store.state.downloads.unshift(d2);
    const item2 = fakeItem(pdf);
    const order = [];
    downloads.internals.track(d2, item2, null, { persist: true, hooks: { onDownload: (phase) => { order.push(phase + ':' + attempts); } } });
    item2.emit('done', {}, 'completed');
    await until(() => d2.state === 'completed', 'second téléchargement terminé');
    await new Promise((r) => setTimeout(r, 80));
    check('marque impossible à poser : une seconde tentative, puis le fichier est noté « sans marque » — la fin n’est annoncée qu’après',
      attempts === 2 && d2.marked === false && order.join() === 'done:2', JSON.stringify([attempts, d2.marked, order]));
    check('fichier sans marque : un PDF n’est pas ouvert d’office', tabs.length === 0 && opened.length === 0);
    asked.length = 0;
    agree = false;
    const o1 = await downloads.openFile(d2, null);
    check('fichier sans marque : l’ouvrir repose d’abord la marque, puis demande confirmation ; « Annuler » n’ouvre rien',
      o1 === false && attempts >= 3 && asked.length === 1 && asked[0].message === T('dl.unmarkedTitle', { name: 'facture.pdf' }) && asked[0].detail.includes('fichiers.exemple.fr') && asked[0].cancelId === 1 && tabs.length === 0 && opened.length === 0, JSON.stringify(asked));
    const c1 = await downloads.copyFile(d2);
    check('fichier sans marque : le copier demande confirmation', c1 === false && asked.length === 2);
    const share = downloads.menuTemplate(d2).find((x) => x.id === 'share');
    if (mac) check('fichier sans marque : « Partager » passe par la question (plus de feuille de partage directe)', !!share && share.role === undefined && typeof share.click === 'function');
    const drags = [];
    library.env.startDrag = (wc, it) => { drags.push(it); };
    const sender = w.ui.webContents;
    const dragged = library.drag(sender, 'sec-2');
    await until(() => asked.length === 3, 'question posée au glisser');
    check('fichier sans marque : le glisser hors d’Orbe est refusé, la question est posée', dragged === false && drags.length === 0);
    const rows = await library.action('lib:get', {}, null);
    check('fichier sans marque : la Bibliothèque le dit (ligne signalée, icône du système non demandée)', rows.downloads.find((r) => r.id === 'sec-2').marked === false && !library.internals.icons.has(pdf));
    agree = true;
    const o2 = await downloads.openFile(d2, null);
    check('fichier sans marque, accord donné : il s’ouvre ; le glisser est alors permis', o2 === true && tabs.length === 1 && downloads.dragAllowed(d2) === true);
    works = true;
    asked.length = 0;
    const d3 = { ...d2, id: 'sec-3', marked: false };
    store.state.downloads.unshift(d3);
    check('la marque finit par se poser : plus de question, le fichier redevient ordinaire', (await downloads.cleared(d3, null)) === true && d3.marked === true && asked.length === 0);

    // === 12. « Copier » : pas de décodage d'une image trop grande, exécutable ou sans marque =======
    let decoded = 0;
    downloads.env.decode = (f) => { decoded += 1; return nativeImage.createFromPath(f); };
    const rec = (name, extra = {}) => { const r = { id: 'sec-' + name, name, path: path.join(dir, name), url: 'https://fichiers.exemple.fr/' + name, state: 'completed', marked: true, ...extra }; store.state.downloads.unshift(r); return r; };
    fs.writeFileSync(path.join(dir, 'petite.png'), png);
    // En-tête PNG qui annonce 60 000 × 60 000 points : rien n'est décodé.
    const huge = Buffer.from(png);
    huge.writeUInt32BE(60000, 16);
    huge.writeUInt32BE(60000, 20);
    fs.writeFileSync(path.join(dir, 'geante.png'), huge);
    fs.writeFileSync(path.join(dir, 'douteuse.png'), png);
    fs.writeFileSync(path.join(dir, 'pas-une-image.png'), 'MZ…');
    const clip0 = await clipboard.readText();
    const small = rec('petite.png');
    const sizes = [downloads.imageSize(small.path), downloads.imageSize(path.join(dir, 'geante.png')), downloads.imageSize(path.join(dir, 'pas-une-image.png'))];
    check('dimensions d’une image lues dans son en-tête, sans la décoder', sizes[0] && sizes[0].width === 2 && sizes[0].height === 2 && sizes[1].width === 60000 && sizes[2] === null, JSON.stringify(sizes));
    const how1 = await downloads.copyFile(small);
    const how2 = await downloads.copyFile(rec('geante.png'));
    const how3 = await downloads.copyFile(rec('douteuse.png', { danger: true }));
    const how4 = await downloads.copyFile(rec('pas-une-image.png'));
    agree = true;
    works = false;
    const how5 = await downloads.copyFile(rec('petite.png', { id: 'sec-sans-marque', marked: false }));
    check('« Copier » : seule une petite image, marquée et sans risque connu, est décodée ; les autres partent comme fichiers, sans être lues',
      how1 === 'image' && how2 === 'file' && how3 === 'file' && how4 === 'file' && how5 === 'file' && decoded === 1, JSON.stringify([how1, how2, how3, how4, how5, decoded]));
    await clipboard.writeText(clip0);
    const exe = rec('outil.exe', { danger: true });
    fs.writeFileSync(exe.path, 'MZ');
    await library.action('lib:get', {}, null);
    check('icône du système : jamais demandée pour un exécutable (le système lirait le fichier)', !library.internals.icons.has(exe.path) && library.internals.icons.has(small.path));
    Object.assign(downloads.env, env0);
  });

  // === 2 (suite). « Enregistrer la page » : la page et son dossier sont marqués ====================
  await section(async () => {
    const tab = w.createTab(base + '/a-enregistrer');
    w.activate(tab.id);
    await until(() => { const rt = win.live.get(tab.id); return rt && !rt.wc.isLoading() && rt.wc.getTitle().startsWith('Sécurité'); }, 'page à enregistrer chargée');
    const target = path.join(dir, 'page enregistrée.html');
    const save0 = dialog.showSaveDialog;
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
    const marked = [];
    const real = downloads.env.quarantine;
    downloads.env.quarantine = async (file, url, withUrl) => { marked.push(file); return real(file, url, withUrl); };
    const records = store.state.downloads.length;
    const saved = await w.savePage();
    dialog.showSaveDialog = save0;
    downloads.env.quarantine = real;
    const extras = marked.filter((f) => f !== target);
    check('« Enregistrer la page » : la page et les fichiers de son dossier reçoivent la marque « venu d’Internet »',
      !!saved && fs.existsSync(target) && marked.includes(target) && extras.length >= 1 && extras.every((f) => f.startsWith(path.join(dir, 'page enregistrée_files') + path.sep)), JSON.stringify([saved, marked]));
    if (mac) {
      const attr = (f) => { try { return require('child_process').execFileSync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', f]).toString().trim(); } catch { return ''; } };
      check('macOS : la page enregistrée et ses fichiers portent la quarantaine', saved.ok === true && [target, ...extras].every((f) => /^0081;/.test(attr(f))), JSON.stringify([target, ...extras].map(attr)));
    } else if (windows) {
      check('Windows : la page enregistrée et ses fichiers sont marqués « zone Internet »', saved.ok === true && [target, ...extras].every((f) => /ZoneId=3/.test(fs.readFileSync(f + ':Zone.Identifier', 'utf8'))));
    }
    // (Electron n'annonce pas cet enregistrement par « will-download » : sans le marquage explicite, rien ne le couvrirait.)
    check('« Enregistrer la page » n’est pas un téléchargement pour Electron : aucune ligne dans la liste, d’où le marquage à part', store.state.downloads.length === records);
    w.close(tab.id, { silent: true, ask: false });
  });

  // === 3. Sauvegardes : droits, « supprimé veut dire supprimé », restauration prudente ============
  await section(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-sauvegardes-sec-'));
    const file = path.join(tmp, 'orbe.json');
    const file0 = store.file;
    const flush0 = store.flush;
    const history0 = store.state.history;
    const historyFile0 = store.historyFile;
    const perms0 = store.state.permissions;
    const pperms0 = store.state.profilePermissions;
    // Un onglet ouvert en ce moment (adresse locale qui refuse la connexion : rien ne sort de la machine).
    const openTab = w.createTab('http://127.0.0.1:9/ouvert');
    const openId = openTab.id;
    const old = {
      spaces: [{ id: 'e1', name: 'Avant', today: ['fermé', 'fermé2', openId], pinned: [] }],
      tabs: { fermé: { id: 'fermé', url: 'https://secret.exemple.fr/dossier' }, fermé2: { id: 'fermé2', url: 'https://autre.exemple.fr/' }, [openId]: { id: openId, url: 'https://secret.exemple.fr/dossier' } },
      archive: [{ id: 'a1', url: 'https://secret.exemple.fr/dossier', title: 'Secret' }, { id: 'a2', url: 'https://garde.exemple.fr/', title: 'Gardé' }],
      downloads: [{ id: 'd1', name: 'releve.pdf', path: '/x/releve.pdf', url: 'https://banque.exemple.fr/releve.pdf', state: 'completed' }, { id: 'd2', name: 'autre.txt', state: 'completed' }],
      notes: [{ id: 'n1', text: 'mot de passe du wifi', at: 1 }, { id: 'n2', text: 'courses', at: 2 }],
      permissions: { 'https://camera.exemple.fr': { media: true, notifications: false }, 'https://reste.exemple.fr': { geolocation: true } },
      profilePermissions: { travail: { 'https://micro.exemple.fr': { media: true } } },
      boosts: {
        'supprime.exemple.fr': { css: 'body { background: url(https://pisteur.example/x) }', js: 'fetch("https://pisteur.example")', jsOn: true, enabled: true },
        'inchange.exemple.fr': { css: 'p { color: red }', enabled: true, jsOn: false },
      },
      settings: { boostsJs: true, lang: 'fr' },
      history: { 'https://secret.exemple.fr/dossier': { url: 'https://secret.exemple.fr/dossier' }, 'https://garde.exemple.fr/': { url: 'https://garde.exemple.fr/' } },
    };
    fs.writeFileSync(file, JSON.stringify(old));
    fs.writeFileSync(file + '.bak', JSON.stringify(old));
    fs.writeFileSync(path.join(tmp, 'history.json.bak'), JSON.stringify(old.history));
    const b1 = backups.snapshot(file, new Date(2026, 9, 20, 8, 0, 0));
    const b2 = backups.snapshot(file, new Date(2026, 9, 19, 8, 0, 0));
    if (!windows) {
      const mode = (f) => fs.statSync(f).mode & 0o777;
      check('sauvegardes : fichiers lisibles par leur seul propriétaire (0600), dossier aussi (0700)', mode(b1) === 0o600 && mode(b2) === 0o600 && mode(backups.dirOf(file)) === 0o700, [b1, b2, backups.dirOf(file)].map((f) => mode(f).toString(8)).join());
    }
    const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
    const all = () => [b1, b2, file + '.bak'].map(read);
    store.file = file;
    store.flush = () => {};
    store.historyFile = path.join(tmp, 'history.json');
    store.state.history = {};

    // Une entrée de l'archive supprimée depuis la Bibliothèque.
    store.state.archive = [{ id: 'a1', url: 'https://secret.exemple.fr/dossier', title: 'Secret' }, { id: 'a2', url: 'https://garde.exemple.fr/', title: 'Gardé' }];
    await library.action('lib:archiveDelete', 'a1', null);
    backups.flushForget();
    check('entrée d’archive supprimée : retirée aussi des sauvegardes et de la copie de secours, avec l’onglet fermé depuis qui la montrait ; le reste est intact',
      all().every((s) => s.archive.map((a) => a.id).join() === 'a2' && !s.tabs['fermé'] && !!s.tabs['fermé2'] && !!s.tabs[openId] && s.notes.length === 2 && s.downloads.length === 2), JSON.stringify(all().map((s) => [s.archive.length, Object.keys(s.tabs)])));
    // « Oublier cette suggestion » (barre de commande) : archive et historique.
    store.state.history = { 'https://garde.exemple.fr/': { url: 'https://garde.exemple.fr/' } };
    store.historyCount = 1;
    palette.forget({ url: 'https://garde.exemple.fr/', deletable: true });
    backups.flushForget();
    check('suggestion « oubliée » : retirée des sauvegardes (archive, ancien historique) et de la copie de secours de l’historique',
      all().every((s) => s.archive.length === 0 && !s.history['https://garde.exemple.fr/']) && !('https://garde.exemple.fr/' in read(path.join(tmp, 'history.json.bak'))) && ('https://secret.exemple.fr/dossier' in read(path.join(tmp, 'history.json.bak'))));
    // Liste des téléchargements vidée, une ligne masquée.
    store.state.downloads = [{ id: 'd1', name: 'releve.pdf', path: '/x/releve.pdf', state: 'completed' }, { id: 'd2', name: 'autre.txt', path: '/x/autre.txt', state: 'completed' }];
    downloads.forget(store.state.downloads[1]);
    backups.flushForget();
    const afterHide = all().map((s) => s.downloads.map((x) => x.id).join());
    await library.action('lib:clear', 'downloads', null);
    backups.flushForget();
    check('téléchargement masqué de la liste, puis liste vidée : retirés aussi des sauvegardes', afterHide.every((x) => x === 'd1') && all().every((s) => s.downloads.length === 0), JSON.stringify(afterHide));
    // Historique effacé ; autorisations réinitialisées ; note supprimée ; archive vidée.
    await library.action('lib:clear', 'history', null);
    backups.forget({ notes: ['n1'], permissions: true, archiveAll: true });
    backups.flushForget();
    check('historique effacé, note supprimée, autorisations réinitialisées, archive vidée : rien n’en reste dans les sauvegardes',
      all().every((s) => !('history' in s) && s.notes.map((n) => n.id).join() === 'n2' && Object.keys(s.permissions).length === 0 && !s.profilePermissions && !s.tabs['fermé2'] && !!s.tabs[openId]) && !fs.existsSync(path.join(tmp, 'history.json.bak')), JSON.stringify(all()[0]));
    if (!windows) check('sauvegarde récrite : toujours lisible par son seul propriétaire', (fs.statSync(b1).mode & 0o777) === 0o600);

    // Restauration : ce qui revient, ce qui ne revient pas.
    store.state.permissions = { 'https://reste.exemple.fr': { geolocation: true } };
    delete store.state.profilePermissions;
    store.state.settings.boostsJs = false;
    store.state.boosts = { 'inchange.exemple.fr': { css: 'p { color: red }', enabled: false, jsOn: false } };
    const p = backups.plan(JSON.parse(JSON.stringify(old)));
    check('restauration : aucune autorisation retirée depuis ne revient (les autorisations restent celles du moment)',
      JSON.stringify(p.state.permissions) === JSON.stringify(store.state.permissions) && !p.state.profilePermissions && p.grants === 2, JSON.stringify([p.state.permissions, p.grants]));
    check('restauration : « JavaScript des Boosts » n’est jamais rallumé', p.state.settings.boostsJs === false && p.js === true);
    const back = p.state.boosts['supprime.exemple.fr'];
    check('restauration : un Boost supprimé depuis revient désactivé, script coupé, à relire ; un Boost inchangé garde son état du moment',
      back.enabled === false && back.jsOn === false && back.review === true && p.boosts === 1 && p.state.boosts['inchange.exemple.fr'].enabled === false && p.state.boosts['inchange.exemple.fr'].review === false, JSON.stringify(p.state.boosts));

    const confirm0 = backups.env.confirm;
    const quitOk0 = backups.env.quitOk;
    const quit0 = backups.env.quit;
    const relaunch0 = backups.env.relaunch;
    const asked = [];
    let quitOk = false;
    let quits = 0;
    let relaunched = 0;
    backups.env.confirm = async (opts) => { asked.push(opts); return true; };
    backups.env.quitOk = async () => quitOk;
    backups.env.quit = () => { quits += 1; };
    backups.env.relaunch = () => { relaunched += 1; };
    fs.writeFileSync(b1, JSON.stringify(old));
    fs.writeFileSync(file, JSON.stringify({ spaces: [{ id: 'now' }], marque: 'maintenant' }));
    const name = path.basename(b1);
    const r1 = await backups.restore(name);
    check('« Restaurer une sauvegarde » : la question dit ce qui revient, ce qui ne revient pas, et ce qu’Orbe garde comme sauvegardes',
      asked.length === 1 && asked[0].detail.includes(T('backup.detailPerms')) && asked[0].detail.includes(T('backup.detailBoosts', { n: 1 })) && asked[0].detail.includes(T('backup.detailJs'))
      && asked[0].detail.includes(T('backup.detailRetention', { today: backups.TODAY_MAX, days: backups.DAYS_MAX })), asked[0] && asked[0].detail);
    check('restauration pendant un téléchargement, « Annuler » à la question de l’arrêt : rien n’est touché, Orbe ne quitte pas',
      r1 === false && quits === 0 && backups.restoring() === false && read(file).marque === 'maintenant');
    quitOk = true;
    const r2 = await backups.restore(name);
    check('restauration acceptée : arrêt normal demandé (plus d’arrêt forcé) ; l’état n’est pas encore remplacé',
      r2 === true && quits === 1 && relaunched === 0 && backups.restoring() === true && read(file).marque === 'maintenant' && store.file === file);
    backups.disarm();
    check('arrêt retenu par une page (« Rester ») : la restauration est abandonnée', backups.restoring() === false && backups.apply() === false && read(file).marque === 'maintenant');
    await backups.restore(name);
    let flushed = 0;
    store.flush = () => { flushed += 1; };
    const applied = backups.apply();
    const fileAfter = store.file;
    store.file = file0;
    store.flush = flush0;
    const got = read(file);
    check('arrêt acquis : écritures en attente faites, état quitté sauvegardé, sauvegarde remise en place (corrigée), relance',
      applied === true && flushed === 1 && relaunched === 1 && fileAfter === null && got.spaces[0].id === 'e1' && got.settings.boostsJs === false && got.boosts['supprime.exemple.fr'].enabled === false
      && JSON.stringify(got.permissions) === JSON.stringify({ 'https://reste.exemple.fr': { geolocation: true } }) && backups.list(file).some((b) => read(b.file).marque === 'maintenant'), JSON.stringify(got).slice(0, 300));
    Object.assign(backups.env, { confirm: confirm0, quitOk: quitOk0, quit: quit0, relaunch: relaunch0 });
    store.historyFile = historyFile0;
    store.state.history = history0;
    store.historyCount = null;
    store.state.permissions = perms0;
    if (pperms0) store.state.profilePermissions = pperms0; else delete store.state.profilePermissions;
    store.state.downloads = [];
    store.state.boosts = {};
    w.close(openId, { silent: true, ask: false });
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  });

  // === 4. Aiguillage : la règle nomme un site, elle ne cherche pas un texte dans l'adresse =========
  await section(async () => {
    const sp = store.state.spaces[0].id;
    store.state.settings.routes = [{ match: 'github.com', to: sp }, { match: 'exemple.fr/equipe', to: 'little' }, { match: 'localhost:3000', to: sp }];
    const yes = ['https://github.com/', 'https://gist.github.com/x?y=1', 'http://GITHUB.com./a', 'https://www.exemple.fr/equipe', 'https://exemple.fr/equipe/page?x', 'https://exemple.fr/Equipe/', 'http://localhost:3000/x'];
    const no = ['https://evil.tld/?github.com', 'https://evil.tld/github.com', 'https://evil.tld/#github.com', 'https://github.com.evil.tld/', 'https://notgithub.com/', 'https://github.com@evil.tld/', 'https://evil.tld/?u=https://github.com/',
      'https://exemple.fr/equipements', 'https://exemple.fr/?equipe', 'https://exemple.fr/x/../y/equipe', 'https://evil.tld/exemple.fr/equipe', 'http://localhost:4000/', 'http://localhost/', 'file:///github.com', 'javascript:github.com', 'pas une adresse'];
    check('aiguillage : la règle vaut pour son site et ses sous-domaines (et, si elle le dit, pour un début de chemin ou un port)', yes.every((u) => prefs.routeFor(u) !== null), JSON.stringify(yes.filter((u) => prefs.routeFor(u) === null)));
    check('aiguillage : une adresse qui contient seulement le texte de la règle (paramètre, chemin, sous-domaine piégé, identifiant) n’est pas aiguillée', no.every((u) => prefs.routeFor(u) === null), JSON.stringify(no.filter((u) => prefs.routeFor(u) !== null)));
    check('lien cliqué dans une page (onglet épinglé, ⇧clic) : « https://evil.tld/?github.com » s’ouvre en aperçu, pas dans l’Espace de la règle',
      w.peekTarget('https://evil.tld/?github.com') === 'peek' && w.peekTarget('https://github.com/orbe') === 'route');
    const s = { routes: [{ match: 'https://WWW.Figma.com/', to: sp }, { match: 'github.com/Orbe/', to: sp }, { match: 'figma', to: sp }, { match: '/chemin', to: sp }, { match: 'a b', to: sp }, null, { match: 4 }] };
    const changed = prefs.migrateRoutes(s);
    check('règles d’avant : adresse entière, « www. » et majuscules ramenés à la forme normale ; une règle qui ne nomme pas un site reste dans la liste, sans rien aiguiller',
      changed === true && s.routes.map((r) => r.match).join('|') === 'figma.com|github.com/orbe|figma|/chemin|a b' && prefs.routeRule('/chemin') === null && prefs.routeRule('a b') === null && prefs.routeFor('https://x.tld/chemin', s.routes) === null && prefs.routeFor('https://www.figma.com/file/1', s.routes) === sp);
    check('réglages : une nouvelle règle doit nommer un site (forme normale) ; un mot avec espace, un chemin seul ou une adresse avec identifiant sont refusés',
      prefs.routes([{ match: 'figma.com', to: sp }]) === true && prefs.routes([{ match: '/b', to: sp }]) === false && prefs.routes([{ match: 'Figma.com', to: sp }]) === false && prefs.routes([{ match: 'a@b.fr', to: sp }]) === false
      && prefs.routeText('https://www.Figma.com/File/?x#y') === 'figma.com/file' && prefs.routeText('*.exemple.fr') === 'exemple.fr' && prefs.routeText('?github.com') === '');
  });

  // === 5. Boost modifié depuis la Bibliothèque : jamais appliqué en navigation privée ==============
  await section(async () => {
    boosts.set(host, { css: 'body { outline: 3px solid rgb(255, 0, 0) !important; }' });
    const iw = new OrbeWindow({ incognito: true });
    const tab = iw.createTab(base + '/prive');
    iw.activate(tab.id);
    const wc = () => win.live.get(tab.id).wc;
    await until(() => win.live.get(tab.id) && !wc().isLoading() && wc().getTitle().startsWith('Sécurité'), 'page privée chargée');
    const outline = () => wc().executeJavaScript('getComputedStyle(document.body).outlineStyle');
    await library.action('lib:boost', { host, do: 'toggle' }, null);
    await library.action('lib:boost', { host, do: 'toggle' }, null);
    await new Promise((r) => setTimeout(r, 250));
    check('Boost coupé puis rétabli depuis la Bibliothèque : rien n’est injecté dans un onglet de navigation privée', boosts.get(host).enabled === true && (await outline()) === 'none' && !boosts.internals.applied.has(wc()), await outline());
    iw.win.close();
    boosts.remove(host);
  });

  // === 7, 8. Boosts : script et CSS liés au site réellement affiché ==============================
  await section(async () => {
    const tab = w.createTab(base + '/boost');
    w.activate(tab.id);
    const rt = () => win.live.get(tab.id);
    await until(() => rt() && !rt().wc.isLoading() && rt().wc.getTitle().startsWith('Sécurité'), 'page chargée');
    const wc = rt().wc;
    // Le script commence par vérifier, dans la page, qu'il est sur le site du Boost.
    const wrong = await wc.executeJavaScript(boosts.scriptCode('window.__boostAilleurs = 1', 'autre.exemple.fr', 'http:'));
    const proto = await wc.executeJavaScript(boosts.scriptCode('window.__boostAilleurs = 1', host, 'https:'));
    const right = await wc.executeJavaScript(boosts.scriptCode('window.__boostIci = 1', host, 'http:'));
    check('script d’un Boost : il vérifie dans la page qu’il est bien sur son site (et son protocole) avant de rien faire',
      wrong === boosts.internals.SKIPPED && proto === boosts.internals.SKIPPED && right === '' && (await wc.executeJavaScript('[window.__boostAilleurs, window.__boostIci].join()')) === ',1');
    check('script d’un Boost : jamais sur une page « http: » (sauf la machine elle-même) ; « https: » oui',
      boosts.scriptable('http://exemple.fr/') === false && boosts.scriptable('http://192.168.1.10/') === false && boosts.scriptable('https://exemple.fr/') === true && boosts.scriptable('http://127.0.0.1:8080/') === true
      && boosts.scriptable('http://localhost/') === true && boosts.scriptable('http://localhost.evil.tld/') === false && boosts.scriptable('file:///x') === false);
    // Page « http: » d'un site distant (simulée : le cadre de l'onglet annonce cette adresse).
    store.state.settings.boostsJs = true;
    boosts.set('exemple.fr', { js: 'window.__x = 1', jsOn: true });
    const ran = [];
    const fakeFrame = (url) => ({ url, isDestroyed: () => false, executeJavaScript: async (code) => { ran.push(url); return ''; } });
    const live = win.live.get(tab.id);
    const fake = (url) => ({ isDestroyed: () => false, getURL: () => url, mainFrame: fakeFrame(url) });
    const realWc = live.wc;
    const run = async (url) => { const f = fake(url); live.wc = f; try { return await boosts.runScript(f); } finally { live.wc = realWc; } };
    const r1 = await run('http://exemple.fr/page');
    const r2 = await run('https://exemple.fr/page');
    check('Boost avec script, site servi en « http: » : le script ne part pas ; en « https: », il part', r1 === false && r2 === true && ran.join() === 'https://exemple.fr/page', JSON.stringify([r1, r2, ran]));
    boosts.remove('exemple.fr');
    store.state.settings.boostsJs = state0.boostsJs;

    // CSS : inséré seulement dans le document du site du Boost ; retiré si la page change de site pendant l'insertion.
    boosts.set('site-a.exemple', { css: 'body { color: red }' });
    const log = [];
    const page = { frame: 'https://site-b.exemple/', visible: 'https://site-a.exemple/', during: null };
    const fwc = {
      isDestroyed: () => false,
      getURL: () => page.visible,
      get mainFrame() { return { url: page.frame }; },
      insertCSS: async (css) => { log.push('insert'); if (page.during) page.frame = page.during; return 'cle-' + log.length; },
      removeInsertedCSS: async (key) => { log.push('remove:' + key); },
    };
    // Navigation en attente vers A, document de B encore en place : rien pour A.
    await boosts.apply(fwc);
    check('CSS d’un Boost : jamais inséré dans le document d’un autre site (adresse en attente ≠ document en place)', log.length === 0 && !boosts.internals.applied.has(fwc), log.join());
    // Le document change de site pendant l'insertion : le CSS est aussitôt retiré.
    page.frame = 'https://site-a.exemple/';
    page.during = 'https://site-b.exemple/';
    await boosts.apply(fwc);
    check('CSS d’un Boost : si la page change de site pendant l’insertion, il est retiré aussitôt', log.join() === 'insert,remove:cle-1' && !boosts.internals.applied.has(fwc), log.join());
    // Inséré normalement, puis navigation vers un autre site : retiré.
    log.length = 0;
    page.frame = 'https://site-a.exemple/';
    page.during = null;
    await boosts.apply(fwc);
    page.frame = 'https://site-b.exemple/';
    page.visible = 'https://site-b.exemple/';
    await boosts.navigated(fwc);
    check('CSS d’un Boost : retiré dès que la page passe à un autre site', log.join() === 'insert,remove:cle-1' && !boosts.internals.applied.has(fwc), log.join());
    boosts.remove('site-a.exemple');

    // === 9, 10. Sélecteurs : « url( », lecture par le moteur, sélecteurs trop larges ==============
    const urls = ['a:is(url(x))', 'a:not(URL(x))', 'a:is(\\75rl(x))', 'a:is(u\\72 l(x))', 'p[title=url(x)]', 'a:is(url (x))'];
    check('Zap : tout sélecteur qui contient « url( », même échappé, est refusé', urls.every((s) => !boosts.validSelector(s)) && boosts.validSelector('a.curl > p') && boosts.validSelector('#hurler'), JSON.stringify(urls.filter(boosts.validSelector)));
    const vetted = await boosts.vet(['p.pub', ':pseudo-inconnu', 'a:nth-child(2n + 1)', 'div::selection::before', 'a:has(> img)', 'a b {', 'p.pub', 'x:is(']);
    check('Zap : en plus du filtre, chaque sélecteur est lu par le moteur CSS (dans la coque, pas dans la page) — ce qu’il refuse est écarté', vetted.join('|') === 'p.pub|a:nth-child(2n + 1)|a:has(> img)', vetted.join('|'));
    const broad = ['html', 'body', '*', ':root', 'HTML > BODY', 'body *', 'html:root', 'body:not(.x)', ':not(#zzz)', ':is(body, .a)', '* > *'];
    const fine = ['body > h1', '.pub', 'div.a *', '#x', 'main:not(.a)'];
    check('Zap : un sélecteur qui masquerait la page entière est refusé', broad.every(boosts.tooBroad) && !fine.some(boosts.tooBroad) && boosts.get(host).zaps.length === 0 && boosts.set(host, { zaps: ['body', '*', '.pub'] }).zaps.join() === '.pub', JSON.stringify([broad.filter((s) => !boosts.tooBroad(s)), fine.filter(boosts.tooBroad)]));
    boosts.remove(host);
    // Le sélecteur rendu par la page est une donnée non fiable.
    const gestures = [];
    let answer = 'body';
    const picker = { isDestroyed: () => false, getURL: () => 'https://zap.exemple.fr/', executeJavaScript: async (code, gesture) => { gestures.push(gesture); return answer; }, insertCSS: async () => 'k', removeInsertedCSS: async () => {}, get mainFrame() { return { url: 'https://zap.exemple.fr/' }; } };
    const z1 = await boosts.zap(picker, 'zap.exemple.fr');
    answer = 'html > body';
    const z2 = await boosts.zap(picker, 'zap.exemple.fr');
    answer = 'a:is(url(x))';
    const z3 = await boosts.zap(picker, 'zap.exemple.fr');
    answer = ':pseudo-inconnu';
    const z4 = await boosts.zap(picker, 'zap.exemple.fr');
    answer = '.pub';
    const z5 = await boosts.zap(picker, 'zap.exemple.fr');
    check('Zap à la souris : aucun « geste de l’utilisateur » n’est prêté à la page ; un sélecteur trop large, piégé ou que le moteur refuse n’est pas rangé',
      gestures.length === 5 && gestures.every((g) => g === false) && z1 === null && z2 === null && z3 === null && z4 === null && z5 === '.pub' && boosts.get('zap.exemple.fr').zaps.join() === '.pub', JSON.stringify([gestures, z1, z2, z3, z4, z5]));
    boosts.remove('zap.exemple.fr');

    // === 11. Boost importé : relecture avant la première activation =================================
    const res = boosts.importData({ orbeBoosts: 1, boosts: [{ host: 'importe.exemple.fr', css: '@import "https://pisteur.example/a.css"; body { background: url(https://pisteur.example/p.png) }', js: 'alert(1)', zaps: ['.pub'] }, { host: 'sage.exemple.fr', css: 'p { color: red }' }] });
    const imp = () => boosts.get('importe.exemple.fr');
    boosts.set('importe.exemple.fr', { enabled: true, jsOn: true });
    check('Boost importé : « à relire » ; un message qui demande de l’activer (ou d’armer son script) ne l’active pas', res.added.length === 2 && imp().review === true && imp().enabled === false && imp().jsOn === false && boosts.cssFor('importe.exemple.fr') === '');
    const reviewed = [];
    library.env.reviewBoost = (win2, h) => { reviewed.push(h); };
    const fromLib = await library.action('lib:boost', { host: 'importe.exemple.fr', do: 'toggle' }, null);
    check('Bibliothèque, « Activer » sur un Boost importé : la relecture s’ouvre, rien n’est activé', fromLib && fromLib.review === true && reviewed.join() === 'importe.exemple.fr' && imp().enabled === false);
    const rv = boosts.reviewOf('importe.exemple.fr');
    const rv2 = boosts.reviewOf('sage.exemple.fr');
    check('relecture : le CSS, le script et les éléments masqués sont montrés ; avertissement quand le CSS contient « url( » ou « @import »',
      rv.pending === true && rv.css.includes('pisteur.example') && rv.js === 'alert(1)' && rv.zaps.join() === '.pub' && rv.warnUrl === true && rv.warnImport === true && rv2.warnUrl === false && rv2.warnImport === false && boosts.reviewOf('inconnu.fr') === null);
    boosts.approve('importe.exemple.fr');
    check('« Activer ce Boost » après relecture : il s’active, son script reste coupé ; il se coupe et se rallume ensuite comme un autre',
      imp().review === false && imp().enabled === true && imp().jsOn === false && boosts.cssFor('importe.exemple.fr').includes('pisteur.example') && boosts.set('importe.exemple.fr', { enabled: false }).enabled === false && boosts.set('importe.exemple.fr', { enabled: true }).enabled === true);
    // La page de l'éditeur : la case d'un Boost importé ouvre la relecture.
    const editor = require('../src/main/boost-editor');
    const bw = ctx.commands.hooks.openBoost(w, 'list');
    const ed = (code) => bw.webContents.executeJavaScript(code);
    await until(() => !bw.webContents.isLoading() && ed('document.querySelectorAll("#list-items .item").length === 2').catch(() => false), 'liste des Boosts');
    await ed(`document.querySelector('#list-items .item[data-host="sage.exemple.fr"] input').click()`);
    await until(() => ed(`!document.getElementById('review').hidden`), 'relecture affichée');
    const seen = await ed(`({ hote: document.getElementById('review-host').textContent, css: document.getElementById('review-css').textContent, alerte: document.getElementById('review-warn').hidden, ok: document.getElementById('review-ok').textContent })`);
    check('liste des Boosts : cocher un Boost importé montre d’abord son contenu', seen.hote === 'sage.exemple.fr' && seen.css === 'p { color: red }' && seen.alerte === true && seen.ok === T('boost.reviewOk') && boosts.get('sage.exemple.fr').enabled === false, JSON.stringify(seen));
    await ed(`document.getElementById('review-ok').click()`);
    await until(() => boosts.get('sage.exemple.fr').enabled === true, 'Boost activé après relecture');
    check('…et « Activer ce Boost » l’active', boosts.get('sage.exemple.fr').review === false && editor.state().host === '');
    bw.close();
    boosts.remove('importe.exemple.fr');
    boosts.remove('sage.exemple.fr');
    w.close(tab.id, { silent: true, ask: false });
  });

  // === 13. Adresse affichée à l'étroit : la fin du nom d'hôte reste visible ====================
  await section(async () => {
    const long = 'compte.banque.fr.' + 'connexion-securisee.'.repeat(6) + 'orbe.example';
    const seen = await ui(`(() => {
      const parts = [['a.b.exemple.co.uk', 'exemple.co.uk'], ['exemple.fr', 'exemple.fr'], ['x.github.io', 'x.github.io'], ['127.0.0.1', '127.0.0.1'], ['localhost', 'localhost'], ['${long}', 'orbe.example']].map(([h, want]) => siteParts(h).domain === want);
      const el = document.createElement('span');
      const texts = ['https://user:pw@sous.exemple.fr:8443/chemin?x=1#y', 'sous.exemple.fr/chemin', 'Titre sans adresse', ''];
      const same = texts.map((t) => addressInto(el, t).textContent === t);
      addressInto(el, texts[0]);
      const split = [el.querySelector('.addr-sub').textContent, el.querySelector('.addr-domain').textContent, el.querySelector('.addr-rest').textContent];
      const keep = S.panes;
      drawPanes([{ id: 'essai-a', x: 300, y: 4, w: 190, h: 300, active: true, internal: false, url: 'https://${long}/un/chemin/tres/long/qui/ne/tient/pas', title: '', favicon: '' }]);
      const bar = document.querySelector('#pane-bars .pane-bar');
      const url = bar.querySelector('.pane-url').getBoundingClientRect();
      const hostEl = bar.querySelector('.addr-host');
      const dom = bar.querySelector('.addr-domain').getBoundingClientRect();
      const sub = bar.querySelector('.addr-sub').getBoundingClientRect();
      const out = { parts, same, split, domaine: bar.querySelector('.addr-domain').textContent, coupe: hostEl.scrollWidth > hostEl.clientWidth, dedans: dom.left >= url.left - 0.5 && dom.right <= url.right + 0.5 && dom.width > 20, debutCache: sub.left < hostEl.getBoundingClientRect().left - 1,
        gras: Number(getComputedStyle(bar.querySelector('.addr-domain')).fontWeight) > Number(getComputedStyle(bar.querySelector('.addr-sub')).fontWeight) };
      drawPanes(keep || []);
      return out;
    })()`);
    check('adresse étroite : le domaine enregistré est reconnu (suffixes à deux étages, adresses de la machine)', seen.parts.every(Boolean), JSON.stringify(seen.parts));
    check('adresse étroite : le texte affiché reste l’adresse entière, découpée en « avant le domaine », « domaine », « reste »', seen.same.every(Boolean) && seen.split.join('|') === 'https://user:pw@sous.|exemple.fr:8443|/chemin?x=1#y', JSON.stringify([seen.same, seen.split]));
    check('volet étroit, nom d’hôte trop long : il est coupé par la GAUCHE — le domaine enregistré, mis en avant, reste entièrement visible',
      seen.domaine === 'orbe.example' && seen.coupe === true && seen.dedans === true && seen.debutCache === true && seen.gras === true, JSON.stringify(seen));
    const peek = await ui(`(() => { const css = [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.selectorText === '.addr .addr-host' && r.style.direction === 'rtl'); } catch { return false; } }); return css; })()`);
    check('la même règle sert partout où une adresse est montrée à l’étroit (feuille de style commune)', peek === true);
  });

  // === 14, 15. Copie d'adresse : domaines d'Amazon nommés, Markdown échappé =====================
  await section(async () => {
    const { cleanUrl, mdLink } = win;
    const amazon = [
      ['https://www.amazon.fr/Livre-Titre/dp/B00ABCDEFG/ref=sr_1_1?keywords=x', 'https://www.amazon.fr/dp/B00ABCDEFG'],
      ['https://smile.amazon.co.uk/gp/product/B00ABCDEFG?th=1', 'https://smile.amazon.co.uk/dp/B00ABCDEFG'],
      ['https://amazon.attack/x/dp/B00ABCDEFG/ref=abc?token=1', 'https://amazon.attack/x/dp/B00ABCDEFG/ref=abc?token=1'],
      ['https://x.amazon.zip/dp/B00ABCDEFG?secret=1', 'https://x.amazon.zip/dp/B00ABCDEFG?secret=1'],
      ['https://amazon.com.evil.tld/dp/B00ABCDEFG?a=1', 'https://amazon.com.evil.tld/dp/B00ABCDEFG?a=1'],
    ];
    check('copie d’adresse : seule une fiche d’un vrai domaine d’Amazon est réduite à son produit (amazon.attack, amazon.zip : intactes)', amazon.every(([a, b]) => cleanUrl(a) === b), JSON.stringify(amazon.filter(([a, b]) => cleanUrl(a) !== b).map(([a]) => cleanUrl(a))));
    const md = mdLink('Bravo](https://evil.tld) [clique\\ ici', 'https://exemple.fr/a (b)/c)?x=<y>');
    check('lien Markdown : crochets et barre oblique inverse du titre échappés, parenthèses, espaces et chevrons de l’adresse encodés',
      md === '[Bravo\\](https://evil.tld) \\[clique\\\\ ici](https://exemple.fr/a%20%28b%29/c%29?x=%3Cy%3E)' && mdLink('Simple', 'https://exemple.fr/a') === '[Simple](https://exemple.fr/a)' && mdLink('', 'https://exemple.fr/') === '[https://exemple.fr/](https://exemple.fr/)', md);
    const tab = w.createTab(base + '/md (1)');
    w.activate(tab.id);
    await until(() => { const rt = win.live.get(tab.id); return rt && !rt.wc.isLoading(); }, 'page chargée');
    const clip0 = await clipboard.readText();
    tab.title = 'Titre] piégé [ici';
    w.copyUrl(true);
    const copied = await clipboard.readText();
    await clipboard.writeText(clip0);
    check('« Copier le lien en Markdown » : un titre de page ne peut pas refermer le lien ni en glisser un autre', /^\[Titre\\\] piégé \\\[ici\]\(http:\/\/127\.0\.0\.1:\d+\/md%20%281%29\)$/.test(copied), copied);
    w.close(tab.id, { silent: true, ask: false });
  });

  // --- Remise en état -------------------------------------------------------------------------
  Object.assign(downloads.env, env0);
  Object.assign(library.env, libEnv0);
  store.state.downloads = state0.downloads;
  store.state.boosts = state0.boosts;
  store.state.archive = state0.archive;
  store.state.notes = state0.notes;
  store.state.settings.routes = state0.routes;
  store.state.settings.boostsJs = state0.boostsJs;
  store.state.settings.downloadOpenPdf = state0.openPdf;
  w.closed.length = 0;
  w.undoStack.length = 0;
  w.redoStack.length = 0;
  server.close();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  w.changed();
  if (!ctx.check && failed) throw new Error(`${failed} vérification(s) en échec`);
};
