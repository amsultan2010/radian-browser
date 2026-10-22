// Sensations : fichiers récents au survol de l'icône de la Bibliothèque, sortes
// montrées (clic droit), captures rangées dans la Bibliothèque…
// Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/sensations.js node scripts/dev.js --selftest
// Rien n'est réellement glissé ni ouvert : ces gestes du système sont remplacés par des témoins.
const fs = require('fs');
const os = require('os');
const path = require('path');
const outils = require('./outils');

const { sleep } = outils;
const until = (fn, label, timeout = 10000) => outils.until(fn, label, timeout);

module.exports = async function sensationsTests(ctx) {
  const { first: w, store } = ctx;
  let failed = 0;
  const check = ctx.check || ((name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`); });
  const ui = (js) => w.ui.webContents.executeJavaScript(js);
  const library = require('../src/main/library');
  const downloads = require('../src/main/downloads');
  const T = (k, v) => store.t(k, null, v);
  await until(() => ui('typeof S === "object" && S !== null && typeof libPeek === "object"'), 'coque chargée');

  // === Fichiers récents (BIB-4, BIB-5) ===================================================
  {
    const saved = { downloads: store.state.downloads, peek: store.state.settings.libraryPeek, env: { ...library.env }, open: downloads.env.openPath };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-recents-'));
    const HOSTILE = '<img src=x onerror="window.pwned=1">.txt';
    const rec = (name, extra = {}) => {
      const file = path.join(dir, name.replace(/[<>"=/]/g, '_'));
      fs.writeFileSync(file, 'x');
      return { id: 'r-' + name.length + '-' + Math.random().toString(36).slice(2, 8), name, path: file, url: 'http://127.0.0.1:9/' + encodeURIComponent(name), total: 1, received: 1, state: 'completed', at: Date.now() - 5 * 60e3, marked: true, ...extra };
    };
    const gone = rec('disparu.txt');
    fs.rmSync(gone.path);
    const list = [rec(HOSTILE), rec('photo.png'), rec('Orbe 2026-10-09.png', { capture: true }), gone, { ...rec('encours.zip'), state: 'progressing' }, rec('a.pdf'), rec('b.pdf'), rec('c.pdf'), rec('d.pdf')];
    store.state.downloads = list;
    store.state.settings.libraryPeek = ['captures', 'downloads', 'media'];
    const lib = (name, a) => library.action(name, a, w.ui.webContents);

    const rows = await lib('lib:recent');
    check('fichiers récents : les cinq derniers encore sur le disque, du plus récent au plus ancien ; ni fichier disparu, ni téléchargement en cours',
      rows.length === 5 && rows.map((r) => r.name).join('|') === [HOSTILE, 'photo.png', 'Orbe 2026-10-09.png', 'a.pdf', 'b.pdf'].join('|'), JSON.stringify(rows.map((r) => r.name)));
    check('fichiers récents : chaque fiche dit sa sorte (capture, média, téléchargement) ; aucun chemin ni adresse ne part vers la barre',
      rows.map((r) => r.kind).join() === 'downloads,media,captures,downloads,downloads' && rows.every((r) => Object.keys(r).sort().join() === 'at,danger,id,kind,name'), JSON.stringify(rows[0]));

    // Clic droit : les sortes montrées.
    let menu = null;
    library.env.popup = (win, tpl) => { menu = tpl; };
    await lib('lib:peekMenu');
    const labels = menu.map((m) => m.label || '-');
    check('clic droit sur l’icône : « Au survol, montrer » Captures, Téléchargements, Médias (cochés), puis « Ouvrir la Bibliothèque »',
      labels.join('|') === [T('peek.show'), T('peek.kind.captures'), T('peek.kind.downloads'), T('peek.kind.media'), '-', T('peek.open')].join('|') && menu.slice(1, 4).every((m) => m.type === 'checkbox' && m.checked), labels.join('|'));
    menu[2].click(); // décoche « Téléchargements »
    const sansDl = await lib('lib:recent');
    check('« Téléchargements » décoché : le survol ne montre plus que captures et médias ; le choix est retenu',
      sansDl.map((r) => r.kind).join() === 'media,captures' && store.state.settings.libraryPeek.join() === 'captures,media', JSON.stringify(sansDl.map((r) => r.kind)));
    await lib('lib:peekMenu');
    check('le menu rouvert montre le choix (Téléchargements décoché)', menu[2].checked === false && menu[1].checked && menu[3].checked);
    menu[1].click(); menu[3].click();
    check('tout décoché : plus rien au survol', (await lib('lib:recent')).length === 0 && store.state.settings.libraryPeek.length === 0);
    menu[3].click(); menu[2].click(); menu[1].click();
    check('tout recoché : dans l’ordre fixe des sortes', store.state.settings.libraryPeek.join() === 'captures,downloads,media');
    store.state.settings.libraryPeek = 'n’importe quoi';
    check('réglage abîmé : les trois sortes par défaut', (await lib('lib:recent')).length === 5);
    store.state.settings.libraryPeek = ['captures', 'downloads', 'media'];

    // Le panneau, dans la barre : texte posé comme du texte, ouverture, glisser.
    const shown = await ui(`(async () => {
      const rows = await send('lib:recent');
      const b = document.getElementById('b-library');
      b.dispatchEvent(new PointerEvent('pointerenter'));
      // (sans vraie souris, « :hover » est faux : le panneau est posé par son nom d'essai)
      return rows.length;
    })()`);
    check('la barre latérale obtient les mêmes fiches par le canal de l’interface', shown === 5);
    const opened = [];
    const dragged = [];
    downloads.env.openPath = (f) => { opened.push(f); };
    library.env.startDrag = (wc, item) => { dragged.push(item.file); };
    await lib('lib:openFile', rows[1].id);
    check('ouvrir une fiche récente : le fichier s’ouvre par le système', opened.length === 1 && opened[0] === list[1].path, JSON.stringify(opened));
    // (l'icône du fichier est demandée au système au moment où la fiche est montrée)
    await until(() => !!library.internals.icons.get(list[1].path) || library.internals.dragIcon(list[1].path), 'icône du fichier');
    const okDrag = await lib('lib:drag', rows[1].id);
    check('glisser une fiche récente hors d’Orbe : le vrai fichier part, depuis la barre latérale', okDrag === true && dragged.join() === list[1].path, JSON.stringify(dragged));
    check('identifiant inconnu ou forgé : ni ouverture ni glisser', (await lib('lib:openFile', '../../etc/passwd')) === false && (await lib('lib:drag', { id: rows[0].id })) === false && opened.length === 1 && dragged.length === 1);

    // Captures d'Orbe : elles rejoignent la Bibliothèque (sauf en navigation privée).
    library.env.captureDir = () => dir;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const kept = await new Promise((done) => library.keepCapture('Orbe essai.png', png, { done }));
    const top = (await lib('lib:recent'))[0];
    check('capture enregistrée : le fichier est écrit et sa fiche prend la tête des récents, rangée parmi les captures',
      !!kept && fs.existsSync(path.join(dir, 'Orbe essai.png')) && top.name === 'Orbe essai.png' && top.kind === 'captures' && store.state.downloads[0].capture === true, JSON.stringify(top));
    const before = store.state.downloads.length;
    const priv = await new Promise((done) => library.keepCapture('Orbe privée.png', png, { incognito: true, done }));
    check('capture en navigation privée : le fichier est écrit, aucune fiche n’est gardée', priv === null && fs.existsSync(path.join(dir, 'Orbe privée.png')) && store.state.downloads.length === before);
    const all = await lib('lib:get', {});
    check('Bibliothèque → Médias : la capture y figure', all.media.some((r) => r.name === 'Orbe essai.png'));

    await ui('libPeek.close(true)');
    Object.assign(library.env, saved.env);
    downloads.env.openPath = saved.open;
    store.state.downloads = saved.downloads;
    store.state.settings.libraryPeek = saved.peek;
    store.save();
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // === Barre translucide : contraste sur le fond tel qu'il s'affiche (THM-13) ===============
  {
    const Theme = require('../src/renderer/theme');
    const SHOW = 0.2; // la barre translucide est peinte à 80 % d'opacité
    let seed = 20261010;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const alphaOf = (c) => Number(c.match(/, ([\d.]+)\)$/)[1]);
    // Recalcul indépendant : le texte principal et le texte discret, sur le fond nu et sur le
    // voile de survol, pour chaque arrêt mêlé aux deux extrêmes de ce qui peut être derrière.
    const seenWorst = (p, dark) => {
      const ink = p.family === 'dark' ? [255, 255, 255] : [0, 0, 0];
      const fg = Theme.rgb(p.fg);
      let min = Infinity;
      for (const stop of p.stops.map(Theme.rgb)) {
        for (const back of Theme.BACKDROP[dark ? 'dark' : 'light']) {
          const bg = Theme.over(back, SHOW, stop).map(Math.round);
          for (const surface of [bg, Theme.over(ink, alphaOf(p.hover), bg)]) {
            min = Math.min(min, Theme.contrast(fg, surface), Theme.contrast(Theme.over(ink, alphaOf(p.dim), surface), surface));
          }
        }
      }
      return min;
    };
    let worst = Infinity;
    let worstOf = '';
    let before = Infinity;
    let failing = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const colors = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => Theme.hex([rnd() * 255, rnd() * 255, rnd() * 255]));
      const theme = { colors, accent: colors[0], intensity: rnd(), grain: 0, texture: 'grain', mode: Theme.MODES[i % 3] };
      const dark = i % 2 === 0;
      const opaque = seenWorst(Theme.palette(theme, dark), dark);
      if (opaque < 4.5) failing += 1;
      before = Math.min(before, opaque);
      const c = seenWorst(Theme.palette(theme, dark, SHOW), dark);
      if (c < worst) { worst = c; worstOf = JSON.stringify([colors, theme.intensity, theme.mode, dark]); }
    }
    console.log(`  – barre translucide, ${N} thèmes au hasard : contraste le plus faible ${worst.toFixed(2)} (calculé pour un fond opaque : ${before.toFixed(2)}, ${failing} thème(s) sous 4,5)`);
    check('barre translucide : texte lisible (4,5 au moins) sur le fond tel qu’il s’affiche, du plus sombre au plus clair de ce qui peut être derrière — 3 000 thèmes au hasard',
      worst >= 4.5 && failing > 0, `${worst.toFixed(3)} pour ${worstOf} ; avant : ${failing} en défaut`);
    const base = { color: '#7c6cf0' };
    check('barre translucide : le thème d’origine garde son fond ; fond opaque : palette inchangée',
      Theme.palette(base, true, SHOW).stops.join() === Theme.palette(base, true).stops.join() && Theme.palette(base, false, SHOW).stops.join() === Theme.palette(base, false).stops.join()
      && JSON.stringify(Theme.palette(base, true, 0)) === JSON.stringify(Theme.palette(base, true)));
    // La barre latérale applique bien ce calcul selon le réglage.
    const dark = require('electron').nativeTheme.shouldUseDarkColors;
    const translucent0 = store.state.settings.translucent;
    const theme0 = { colors: [w.space.color, w.space.color2, w.space.color3].filter(Boolean), intensity: w.space.intensity, grain: w.space.grain, texture: w.space.texture, mode: w.space.mode, plain: w.space.plain };
    w.setTheme({ colors: ['#8a8f98'], intensity: 0.9, grain: 0, texture: 'grain', mode: 'light' });
    const read = () => ui('({ dim: getComputedStyle(document.body).getPropertyValue("--dim").trim(), bg: getComputedStyle(document.body).getPropertyValue("--bg").trim(), paint: getComputedStyle(document.body).getPropertyValue("--paint").trim() })');
    store.state.settings.translucent = true;
    ctx.OrbeWindow.pushAll();
    const through = Theme.palette(w.space, dark, SHOW);
    await until(async () => { const r = await read(); return r.bg === through.stops[0] && r.dim === through.dim && /0\.8\)$/.test(r.paint); }, 'palette de la barre translucide');
    store.state.settings.translucent = false;
    ctx.OrbeWindow.pushAll();
    const opaque = Theme.palette(w.space, dark);
    await until(async () => { const r = await read(); return r.bg === opaque.stops[0] && r.dim === opaque.dim && r.paint === opaque.stops[0]; }, 'palette de la barre opaque');
    check('la barre latérale prend la palette calculée pour son fond : translucide (80 %) ou opaque, selon le réglage', true);
    check('thème gris moyen : translucide, il est éloigné du texte plus que le même thème opaque', through.contrast >= 4.5 && (through.stops[0] !== opaque.stops[0] || through.dim !== opaque.dim), JSON.stringify([through.stops, through.dim, opaque.stops, opaque.dim]));
    store.state.settings.translucent = translucent0;
    w.setTheme(theme0.plain ? { colors: [] } : theme0);
    if (theme0.plain) w.setTheme({ intensity: theme0.intensity, grain: theme0.grain, texture: theme0.texture, mode: theme0.mode });
    ctx.OrbeWindow.pushAll();
  }

  // === Accueil : musique et vague du logo (SON-3, IMP-2, ANI-28) ============================
  {
    const { win } = ctx;
    const gen = require('../scripts/make-sounds');
    const sounds = require('../src/main/sounds');
    const file = path.join(__dirname, '..', 'src', 'renderer', 'musique', 'welcome.wav');
    const buf = fs.readFileSync(file);
    const { samples, rate, channels } = gen.read(buf);
    let peak = 0; let power = 0; let jump = 0;
    for (let i = 0; i < samples.length; i++) { const v = samples[i]; peak = Math.max(peak, Math.abs(v)); power += v * v; if (i) jump = Math.max(jump, Math.abs(v - samples[i - 1])); }
    const facts = { seconds: samples.length / rate, rate, channels, peak, rms: Math.sqrt(power / samples.length), edges: Math.max(Math.abs(samples[0]), Math.abs(samples[samples.length - 1])), jump, ko: Math.round(buf.length / 1024) };
    check('musique de l’accueil : exactement ce que produit le script de synthèse (aucun fichier tiers), seule dans son dossier',
      buf.equals(gen.wav([...gen.MUSIC.welcome()], gen.MUSIC_RATE)) && fs.readdirSync(path.dirname(file)).join() === 'welcome.wav');
    check('musique de l’accueil : sept secondes, mono, plus basse que les sons d’interface, crête à −6 dB au plus, début et fin à zéro, aucun claquement',
      facts.seconds === 7 && facts.channels === 1 && facts.rate === 22050 && facts.peak <= gen.PEAK + 0.001 && facts.rms < gen.LEVEL && facts.rms > 0.02 && facts.edges < 0.001 && facts.jump < 0.2 && facts.ko < 400, JSON.stringify(facts));
    const S0 = { sounds: store.state.settings.sounds, soundVolume: store.state.settings.soundVolume, welcomed: store.state.window.welcomed };
    store.state.settings.sounds = true;
    store.state.settings.soundVolume = 50;
    const m = sounds.music();
    store.state.settings.soundVolume = 0;
    const m0 = sounds.music();
    store.state.settings.soundVolume = 50;
    check('musique : permise par le réglage « Sons », à 70 % du volume des sons ; volume à zéro : coupée ; jamais jouée pendant les essais', m.on === true && m.volume === 0.35 && m.mute === sounds.QUIET && m0.on === false, JSON.stringify([m, m0]));
    const home = w.activeId;
    const open = async () => {
      const tab = w.openInternal('welcome.html');
      const js = (code) => win.live.get(tab.id).wc.executeJavaScript(code);
      await until(async () => (await js('typeof music === "object" && music.asked === true').catch(() => false)), 'accueil chargé');
      return { tab, js };
    };
    const a = await open();
    const seen = JSON.parse(await a.js(`JSON.stringify({ hidden: music.button.hidden, pressed: music.button.getAttribute('aria-pressed'), title: music.button.title, src: music.audio ? music.audio.src : '', volume: music.audio ? music.audio.volume : -1, paused: music.audio ? music.audio.paused : null, waves: document.querySelectorAll('.orb .wave').length })`));
    check('accueil : la musique est chargée au volume réglé (muette pendant les essais), un bouton permet de la couper',
      seen.hidden === false && seen.pressed === 'true' && seen.title === store.t('welcome.music') && seen.src.endsWith('musique/welcome.wav') && Math.abs(seen.volume - 0.35) < 1e-6 && seen.paused === (sounds.QUIET ? true : seen.paused) && seen.waves === 3, JSON.stringify(seen));
    await a.js('music.button.click()');
    const off = JSON.parse(await a.js(`JSON.stringify({ pressed: music.button.getAttribute('aria-pressed'), paused: music.audio.paused })`));
    check('bouton de la musique : un clic la coupe', off.pressed === 'false' && off.paused === true, JSON.stringify(off));
    w.close(a.tab.id, { ask: false });
    store.state.settings.sounds = false;
    const b = await open();
    const quiet = JSON.parse(await b.js(`JSON.stringify({ hidden: music.button.hidden, audio: !!music.audio })`));
    check('réglage « Sons » coupé : l’accueil reste silencieux, sans bouton ni fichier chargé', quiet.hidden === true && quiet.audio === false, JSON.stringify(quiet));
    w.close(b.tab.id, { ask: false });
    Object.assign(store.state.settings, { sounds: S0.sounds, soundVolume: S0.soundVolume });
    if (S0.welcomed === undefined) delete store.state.window.welcomed; else store.state.window.welcomed = S0.welcomed;
    if (home) w.activate(home);
  }

  // === Médias des dossiers de l'utilisateur (BIB-7) =========================================
  {
    const saved = { env: { ...library.env }, open: downloads.env.openPath, reveal: downloads.env.reveal, downloads: store.state.downloads };
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-medias-'));
    const desk = path.join(root, 'Bureau');
    const outside = path.join(root, 'ailleurs');
    fs.mkdirSync(desk); fs.mkdirSync(outside); fs.mkdirSync(path.join(desk, 'sous-dossier'));
    // (Windows refuse « < » et « > » dans un nom de fichier.)
    const HOSTILE = process.platform === 'win32' ? '&lt;img src=x onerror=alert(1)&gt;.png' : '<img src=x onerror=alert(1)>.png';
    const put = (dir, name, age) => { const f = path.join(dir, name); fs.writeFileSync(f, 'x'.repeat(10)); const at = new Date(Date.now() - age * 60e3); fs.utimesSync(f, at, at); return f; };
    put(desk, 'vieux.jpg', 300); put(desk, 'film.mp4', 20); put(desk, HOSTILE, 5); put(desk, 'notes.txt', 1); put(desk, '.cache.png', 1); put(path.join(desk, 'sous-dossier'), 'profond.png', 1);
    const secret = put(outside, 'secret.png', 1);
    let linked = true;
    try { fs.symlinkSync(secret, path.join(desk, 'lien.png')); } catch { linked = false; }
    const asked = [];
    library.env.mediaDir = (from) => { asked.push(from); return from === 'desktop' ? desk : path.join(root, 'absent'); };
    store.state.downloads = [];
    // Les dossiers de l'utilisateur ne se lisent qu'à la demande de la page Bibliothèque.
    const mediaTab = w.openInternal('library.html#media');
    const fenetres = require('../src/main/window');
    const mediaWc = () => { const rt = fenetres.live.get(mediaTab.id); return rt ? rt.wc : null; };
    await until(() => mediaWc() && mediaWc().getURL().startsWith('orbe://app/library.html') && !mediaWc().isLoading(), 'page Bibliothèque ouverte');
    const lib = (name, a) => library.action(name, a, mediaWc());
    const other = (name, a) => library.action(name, a, w.ui.webContents);
    await lib('lib:get', {});
    await lib('lib:get', { from: 'orbe' });
    await lib('lib:get', { from: '../../etc' });
    check('médias : sans choix d’un dossier (ou avec un choix inconnu), aucun dossier de l’utilisateur n’est lu', asked.length === 0, asked.join());
    const refused = await other('lib:get', { from: 'desktop' });
    check('dossier de l’utilisateur demandé par une autre page interne que la Bibliothèque : rien n’est lu', asked.length === 0 && refused.media.length === 0, asked.join());
    const got = await lib('lib:get', { from: 'desktop' });
    check('identifiant d’un fichier de dossier présenté par une autre page : ni ouvert ni glissé', (await other('lib:openFile', got.media[0].id)) === false && (await other('lib:drag', got.media[0].id)) === false);
    check('« Afficher les médias de : Bureau » : les médias du premier niveau, du plus récent au plus ancien — ni fichier caché, ni autre type, ni sous-dossier, ni lien',
      asked.join() === 'desktop' && got.media.map((r) => r.name).join('|') === [HOSTILE, 'film.mp4', 'vieux.jpg'].join('|'), JSON.stringify(got.media.map((r) => r.name)) + (linked ? '' : ' (liens non permis ici)'));
    check('médias d’un dossier : la page reçoit un identifiant et un nom, jamais un chemin', got.media.every((r) => /^f:[0-9a-f]{20}$/.test(r.id) && !JSON.stringify(r).includes(root) && r.folder === 'desktop' && r.total === 10));
    check('recherche dans un dossier ; dossier absent ou illisible : liste vide, sans erreur', (await lib('lib:get', { from: 'desktop', q: 'FILM' })).media.length === 1 && (await lib('lib:get', { from: 'documents' })).media.length === 0);
    const opened = []; const revealed = []; const dragged = [];
    downloads.env.openPath = (f) => { opened.push(f); };
    downloads.env.reveal = (f) => { revealed.push(f); };
    library.env.startDrag = (wc, item) => { dragged.push(item.file); };
    const film = got.media[1];
    const okOpen = await lib('lib:openFile', film.id);
    const okReveal = await lib('lib:reveal', film.id);
    const okDrag = await lib('lib:drag', film.id);
    check('fichier d’un dossier : ouvrir, afficher dans le Finder, glisser hors d’Orbe', okOpen === true && okReveal === true && okDrag === true && [opened[0], revealed[0], dragged[0]].every((f) => f === path.join(desk, 'film.mp4')), JSON.stringify([okOpen, okReveal, okDrag, opened, revealed, dragged]));
    // Le fichier est remplacé par un lien vers ailleurs : plus rien ne s'ouvre.
    let swapped = false;
    if (linked) { fs.rmSync(path.join(desk, 'film.mp4')); fs.symlinkSync(secret, path.join(desk, 'film.mp4')); swapped = (await lib('lib:openFile', film.id)) === false && (await lib('lib:drag', film.id)) === false; }
    check('identifiant inconnu, ou fichier remplacé depuis par un lien : refusé', (await lib('lib:openFile', 'f:' + '0'.repeat(20))) === false && (await lib('lib:reveal', 'f:../../x')) === false && (!linked || swapped) && opened.length === 1);
    Object.assign(library.env, saved.env);
    downloads.env.openPath = saved.open;
    downloads.env.reveal = saved.reveal;
    store.state.downloads = saved.downloads;
    fs.rmSync(root, { recursive: true, force: true });
  }

  // === Tableau neuf : onglet épinglé de l'Espace (TAB-2) =====================================
  {
    const { win } = ctx;
    const easels = require('../src/main/easels');
    const home = w.activeId;
    const pinned0 = w.space.pinned.length;
    const today0 = w.space.today.length;
    w.run('newEasel');
    const tabId = w.activeId;
    const tab = w.data.tabs[tabId];
    const board = new URL(tab.url).searchParams.get('id');
    const where = () => (w.locate(tabId) || {}).list;
    check('nouveau tableau (⌃⇧E) : il s’ouvre comme onglet épinglé de l’Espace, à la suite des épinglés, et il est affiché',
      where() === 'pinned' && w.space.pinned.length === pinned0 + 1 && w.space.pinned[pinned0].id === tabId && w.space.today.length === today0 && tab.internal === true, JSON.stringify([where(), w.space.pinned.length, pinned0]));
    await until(() => ui(`!!document.querySelector('#pinned [data-id=${JSON.stringify(tabId)}]')`), 'ligne du tableau parmi les épinglés');
    if (home) w.activate(home);
    easels.open(w, board);
    check('rouvrir ce tableau (Bibliothèque) : son onglet épinglé revient au premier plan, sans doublon', w.activeId === tabId && w.space.pinned.length === pinned0 + 1 && w.space.today.length === today0);
    easels.remove(board);
    check('tableau supprimé : son onglet n’est plus épinglé (il redevient un onglet du jour, qui se ferme comme un autre)', where() === 'today' && w.space.pinned.length === pinned0 && !easels.list().some((b) => b.id === board), String(where()));
    w.close(tabId, { ask: false });
    check('…et une fois fermé, il a quitté la barre', !w.data.tabs[tabId] && w.space.today.length === today0);
    if (home && w.data.tabs[home]) w.activate(home);
  }

  // === Changement d'onglet : coupe franche (ANI-24) ========================================
  {
    const { win } = ctx;
    const home = w.activeId;
    const motion0 = win.forceMotion(true); // animations permises : la coupe franche est un choix, pas un repli
    const a = w.newTab('http://127.0.0.1:9/coupe-a').id;
    const b = w.newTab('http://127.0.0.1:9/coupe-b').id;
    await until(() => win.live.has(a) && win.live.has(b) && !win.inFlight(win.live.get(b).view), 'deux onglets vivants');
    const shown = (id) => w.win.contentView.children.includes(win.live.get(id).view);
    const same = (x, y) => x.x === y.x && x.y === y.y && x.width === y.width && x.height === y.height;
    // Les deux lignes viennent de naître (elles glissent en place) : on attend qu'elles soient posées.
    const quiet = "document.getAnimations().filter((x) => x.playState === 'running' && x.effect && x.effect.target && x.effect.target.closest && x.effect.target.closest('#today')).map((x) => x.animationName || x.transitionProperty)";
    await until(async () => (await ui(`document.querySelectorAll('#today .row.tab').length >= 2 && ${quiet}.length === 0`)), 'lignes posées');
    const before = win.motionStats.animated;
    w.activate(a);
    // Lu dans le même tour : rien n'a le temps de s'animer.
    const cut = { a: shown(a), b: shown(b), flight: win.inFlight(win.live.get(a).view), animated: win.motionStats.animated - before, rect: same(win.live.get(a).view.getBounds(), w.contentRect()) };
    check('changement d’onglet : coupe franche — la page choisie est à sa place entière dans le même tour, l’autre est retirée, aucun trajet animé',
      cut.a && !cut.b && !cut.flight && cut.animated === 0 && cut.rect, JSON.stringify(cut));
    await until(() => ui(`(() => { const el = document.querySelector('#today .row.tab.active'); return !!el && el.dataset.id === ${JSON.stringify('ID')}; })()`.replace('"ID"', JSON.stringify(a))), 'ligne choisie');
    const row = await ui(`(async () => { await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return ${quiet}; })()`);
    check('changement d’onglet : dans la barre latérale rien ne bouge — au plus le fondu de 150 ms du fond des deux lignes', row.every((x) => x === 'background-color') && row.length <= 2, JSON.stringify(row));
    win.forceMotion(motion0);
    w.close(a, { ask: false });
    w.close(b, { ask: false });
    store.state.archive = store.state.archive.filter((x) => !/\/coupe-[ab]$/.test(x.url || ''));
    if (home) w.activate(home);
  }

  await sleep(0);
  return failed;
};
