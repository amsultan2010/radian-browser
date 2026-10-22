// Mesures de vitesse et de mémoire (pas un test : rien n'y est affirmé).
// Lancé par scripts/mesures.js, qui fournit le serveur local, le profil et
// l'arbre de sources à mesurer :
//   ORBE_BENCH=<mesure> ORBE_BENCH_BASE=http://127.0.0.1:<port> ORBE_SCENARIO=tests/mesures.js
// Chaque mesure écrit une ligne « MESURE {json} » sur la sortie.
const { app, WebContentsView } = require('electron');
const os = require('os');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const round = (v, n = 1) => Math.round(v * 10 ** n) / 10 ** n;
const out = (o) => console.log('MESURE ' + JSON.stringify({ ...o, charge: round(os.loadavg()[0], 1) }));

async function until(fn, timeout = 15000) {
  const t0 = Date.now();
  for (;;) {
    let v;
    try { v = await fn(); } catch { v = false; }
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('délai dépassé');
    await sleep(15);
  }
}

// Processus d'Orbe : nombre et mémoire (app.getAppMetrics, en Mo).
function processes() {
  const m = app.getAppMetrics();
  const mb = (list) => round(list.reduce((a, p) => a + p.memory.workingSetSize, 0) / 1024, 0);
  const tabs = m.filter((p) => p.type === 'Tab');
  return { processus: m.length, rendu: tabs.length, mo: mb(m), moRendu: mb(tabs) };
}

const paintOf = (wc) => wc.executeJavaScript(`new Promise((r) => {
  const read = () => { const e = performance.getEntriesByName('first-contentful-paint')[0]; if (e) r(performance.timeOrigin + e.startTime); else setTimeout(read, 5); };
  read();
})`);

// Mot de 4 à 9 lettres, toujours le même pour un même numéro.
function word(n) {
  let x = (n * 2654435761 + 97) >>> 0;
  let out = '';
  const len = 4 + (x % 6);
  for (let i = 0; i < len; i++) { x = (x * 1103515245 + 12345) >>> 0; out += 'aeioubcdfglmnprstvéèç'[(x >>> 16) % 21]; }
  return out;
}

// Variantes de la mesure « repos » (scripts/mesures.js --variante <nom>, ENER-4) : une petite
// animation posée dans la coque, page fixe, et une chose changée à la fois. L'élément d'essai a
// la taille et les règles de l'égaliseur d'un favori qui joue (`.tile.audible .dot i`).
const ANIM = `#mes-anim { position: fixed; left: 30px; top: 320px; z-index: 5; width: 11px; height: 8px; display: flex; align-items: flex-end; justify-content: space-between; pointer-events: none; }
  #mes-anim i { display: block; width: 3px; height: 8px; border-radius: 1.5px; background: var(--accent); transform-origin: center bottom; animation: tile-notes 900ms ease-in-out infinite; }
  #mes-anim i:nth-child(2) { animation-delay: -300ms; } #mes-anim i:nth-child(3) { animation-delay: -600ms; }`;
const POSE = (parent = 'document.body') => `(() => { const d = document.createElement('div'); d.id = 'mes-anim'; d.innerHTML = '<i></i><i></i><i></i>'; ${parent}.append(d); })()`;
const GROUPE = `(() => { const g = document.createElement('div'); g.id = 'mes-g'; g.textContent = 'x'; document.body.append(g); const d = document.createElement('div'); d.id = 'mes-anim'; d.innerHTML = '<i></i><i></i><i></i>'; g.append(d); })()`;
const VARIANTES = {
  temoin: {},
  egaliseur: { css: ANIM, js: POSE() },
  // Dans la barre latérale (couche propre : will-change: transform) plutôt que sur le fond.
  'dans-barre': { css: ANIM + ' #mes-anim { position: absolute; }', js: POSE('document.getElementById("sidebar")') },
  // Les vraies règles, à leur vraie place : un favori qui joue, la note de capture.
  'vrai-egaliseur': { main: async (w) => { const id = w.activeId; const sp = w.space; sp.today.splice(sp.today.indexOf(id), 1); (w.data.favs[sp.profileId] = w.data.favs[sp.profileId] || []).push(id); w.sendState(); await sleep(600); }, js: `document.querySelector('.tile').classList.add('audible')` },
  'vrai-capture': { js: `document.getElementById('capture-note').hidden = false` },
  'barre-fixe': { css: ANIM, js: POSE('document.getElementById("sidebar")') },
  'barre-sans-couche': { css: ANIM + ' #mes-anim { position: absolute; } #sidebar { will-change: auto !important; }', js: POSE('document.getElementById("sidebar")') },
  'barre-isole': { css: ANIM + ' #mes-anim { position: absolute; isolation: isolate; will-change: transform; }', js: POSE('document.getElementById("sidebar")') },
  // Fenêtre sans le clavier : `body.blurred #sidebar > *` est à 70 % d'opacité (groupe à composer à part).
  'barre-nette': { css: ANIM + ' #mes-anim { position: absolute; } body.blurred #sidebar > * { opacity: 1 !important; }', js: POSE('document.getElementById("sidebar")') },
  // L'animation dans un groupe à 70 % d'opacité, de trois tailles (hors de la barre latérale).
  'groupe-petit': { css: ANIM + ' #mes-g { position: fixed; left: 30px; top: 320px; width: 11px; height: 8px; opacity: 0.7; z-index: 5; } #mes-anim { position: absolute; left: 0; top: 0; }', js: GROUPE },
  'groupe-moyen': { css: ANIM + ' #mes-g { position: fixed; left: 14px; top: 300px; width: 44px; height: 44px; opacity: 0.7; z-index: 5; } #mes-anim { position: absolute; left: 16px; top: 30px; }', js: GROUPE },
  'groupe-grand': { css: ANIM + ' #mes-g { position: fixed; left: 0; top: 46px; width: 250px; height: 800px; opacity: 0.7; z-index: 5; } #mes-anim { position: absolute; left: 30px; top: 280px; }', js: GROUPE },
  // Deux façons de ne plus composer ce groupe, fenêtre sans le clavier : figer l'égaliseur ; estomper les feuilles plutôt que le groupe.
  'vrai-egaliseur-fige': { main: (w) => VARIANTES['vrai-egaliseur'].main(w), css: 'body.blurred .tile.audible .dot i { animation-play-state: paused; }', js: `document.querySelector('.tile').classList.add('audible')` },
  'vrai-egaliseur-feuilles': { main: (w) => VARIANTES['vrai-egaliseur'].main(w), css: 'body.blurred #fav { opacity: 1 !important; } body.blurred #fav .tile > :not(.dot), body.blurred #fav .tile .dot i { opacity: 0.7; }', js: `document.querySelector('.tile').classList.add('audible')` },
  'vrai-egaliseur-net': { main: (w) => VARIANTES['vrai-egaliseur'].main(w), css: 'body.blurred #sidebar > * { opacity: 1 !important; }', js: `document.querySelector('.tile').classList.add('audible')` },
  pulsation: { css: ANIM + ' #mes-anim i { animation: capture-pulse 1.6s ease-in-out infinite; }', js: POSE() },
  // Même mouvement sur une propriété que le compositeur ne sait pas animer seul.
  hauteur: { css: ANIM + ' @keyframes mes-h { 0%, 100% { height: 3px; } 50% { height: 8px; } } #mes-anim i { animation-name: mes-h; }', js: POSE() },
  'pas-8': { css: ANIM + ' #mes-anim i { animation-timing-function: steps(4, jump-none); }', js: POSE() },
  // Cadence réduite par le script : une image sur N (minuterie), sans animation CSS.
  'minuterie-12': { css: ANIM + ' #mes-anim i { animation: none; }', js: POSE() + `; (() => { const b = [...document.querySelectorAll('#mes-anim i')]; let n = 0; setInterval(() => { n += 1; b.forEach((x, i) => { x.style.transform = 'scaleY(' + (0.675 + 0.325 * Math.sin((n / 10.8 + i / 3) * 2 * Math.PI)).toFixed(3) + ')'; }); }, 83); })()` },
  'minuterie-30': { css: ANIM + ' #mes-anim i { animation: none; }', js: POSE() + `; (() => { const b = [...document.querySelectorAll('#mes-anim i')]; let n = 0; setInterval(() => { n += 1; b.forEach((x, i) => { x.style.transform = 'scaleY(' + (0.675 + 0.325 * Math.sin((n / 27 + i / 3) * 2 * Math.PI)).toFixed(3) + ')'; }); }, 33); })()` },
  'pas-30': { css: ANIM + ' #mes-anim i { animation-timing-function: steps(13, jump-none); }', js: POSE() },
  isole: { css: ANIM + ' #mes-anim { contain: strict; isolation: isolate; will-change: transform; }', js: POSE() },
  'sans-grain': { css: ANIM + ' body::before, #tint::after, #sidebar::before { display: none !important; }', js: POSE() },
  'sans-flou': { css: ANIM + ' * { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }', js: POSE() },
  'sans-masque': { css: ANIM + ' * , *::before, *::after { -webkit-mask: none !important; mask: none !important; }', js: POSE() },
  'sans-vibrancy': { css: ANIM, js: POSE(), main: (w) => { w.win.setVibrancy(null); w.win.setBackgroundColor('#ffffff'); } },
  'fond-opaque': { css: ANIM + ' html { background: #f2f2f4 !important; }', js: POSE(), main: (w) => { w.win.setVibrancy(null); w.win.setBackgroundColor('#f2f2f4'); w.ui.setBackgroundColor('#f2f2f4'); } },
  'petite-fenetre': { css: ANIM, js: POSE(), main: (w) => w.win.setSize(700, 500) },
  'grande-fenetre': { css: ANIM, js: POSE(), main: (w) => { const { screen } = require('electron'); const a = screen.getPrimaryDisplay().workArea; w.win.setBounds(a); } },
  'sans-page': { css: ANIM, js: POSE(), main: (w) => { w.activeRt.view.setVisible(false); } },
  'sans-modale': { css: ANIM, js: POSE(), main: (w) => { for (const v of w.win.contentView.children) if (v !== w.ui && !(w.activeRt && v === w.activeRt.view)) { try { v.setVisible(false); } catch {} } } },
};

const BENCHES = {
  // Prépare un profil : un onglet, et au besoin un gros historique et beaucoup d'onglets.
  async prepare({ first: w, store, base }) {
    const history = Number(process.env.ORBE_BENCH_HISTORY) || 0;
    const tabs = Number(process.env.ORBE_BENCH_TABS) || 0;
    const now = Date.now();
    // Historique varié (hôtes et titres tirés d'un vocabulaire), pour que la recherche
    // ait le même genre de travail qu'avec un vrai historique.
    for (let i = 0; i < history; i++) {
      const host = `${word(i % 400)}.exemple.fr`;
      const url = `https://${host}/${word(1000 + (i * 7) % 300)}/${i}-${word(2000 + (i * 13) % 900)}`;
      store.state.history[url] = { url, visits: 1 + (i % 9), last: now - i * 60000, title: `${word(i * 3)} ${word(i * 5 + 1)} ${word(i * 11 + 2)} — ${word(i % 400)}`, favicon: `https://${host}/favicon.ico` };
    }
    // Forme d'un vrai profil ancien : les onglets sont répartis dans plusieurs Espaces (un dossier
    // de trois onglets épinglés, deux épinglés seuls, le reste dans « Aujourd'hui »), eux-mêmes
    // répartis dans plusieurs profils. Sans cela : tous dans le premier Espace.
    const nSpaces = Number(process.env.ORBE_BENCH_SPACES) || 0;
    const nProfiles = Number(process.env.ORBE_BENCH_PROFILES) || 0;
    const d = w.data;
    for (let i = 1; i < nProfiles; i++) { const id = 'profil' + i; d.profiles.push({ id, name: 'Profil ' + (i + 1) }); d.favs[id] = []; }
    for (let i = 1; i < nSpaces; i++) { const sp = store.makeSpace('Espace ' + (i + 1), '✨'); if (nProfiles) sp.profileId = d.profiles[i % d.profiles.length].id; d.spaces.push(sp); }
    for (let i = 0; i < tabs; i++) {
      const space = d.spaces[nSpaces ? i % d.spaces.length : d.spaces.indexOf(w.space)];
      const tab = w.createTab(`https://site${i}.exemple.fr/page/${i}`, { space });
      tab.title = `Onglet ${i} — exemple`;
      if (!nSpaces) continue;
      const rank = Math.floor(i / d.spaces.length);
      if (rank < 5) {
        space.today.splice(space.today.indexOf(tab.id), 1);
        tab.homeUrl = tab.url;
        if (rank < 3) {
          let folder = space.pinned.find((n) => n.type === 'folder');
          if (!folder) { folder = { type: 'folder', id: 'dossier' + i, name: 'Dossier', open: true, children: [] }; space.pinned.push(folder); }
          folder.children.push({ type: 'tab', id: tab.id });
        } else space.pinned.push({ type: 'tab', id: tab.id });
      }
    }
    const tab = w.newTab(base + '/leger');
    await until(() => w.data.tabs[tab.id].title === 'Léger');
    store.saveHistory(true);
    await sleep(300);
    store.flush();
    out({ bench: 'prepare', history, tabs, espaces: d.spaces.length, profils: d.profiles.length });
  },

  // Démarrage : de la création du processus à la coque peinte et à la première page.
  async demarrage({ first: w, win }) {
    const t0 = process.getCreationTime();
    const shown = Date.now();
    const ui = w.ui.webContents;
    const loaded = new Promise((r) => ui.once('did-finish-load', () => r(Date.now())));
    const shellLoaded = await loaded;
    const shellPaint = await paintOf(ui);
    // Barre latérale rendue : l'état est arrivé et une image a suivi.
    const sidebar = await ui.executeJavaScript(`new Promise((r) => { const go = () => (typeof S === 'object' && S ? requestAnimationFrame(() => requestAnimationFrame(() => r(performance.timeOrigin + performance.now()))) : setTimeout(go, 2)); go(); })`);
    const rt = await until(() => w.activeRt);
    const page = await paintOf(rt.wc);
    // Vue modale prête (depuis la 0.12 elle naît de la coque, après son affichage), puis
    // barre de commande prête à répondre. Ouverte avant, la barre naîtrait à part, dans son
    // propre processus (une centaine de millisecondes, et un processus de plus) : ce cas-là
    // n'est pas celui d'une personne, qui n'appuie pas sur ⌘T dans la demi-seconde du lancement.
    await until(() => w.modal && !w.modal.webContents.isLoading(), 3000).catch(() => {});
    const modal = Date.now();
    const t1 = Date.now();
    w.openCommand();
    await until(() => w.modal && !w.modal.webContents.isLoading() && w.modal.webContents.executeJavaScript('!document.getElementById("command").hidden && document.activeElement === document.getElementById("cmd-input")'));
    const command = Date.now() - t1;
    await sleep(1500);
    out({
      bench: 'demarrage', fenetre: round(shown - t0, 0), coqueChargee: round(shellLoaded - t0, 0), coquePeinte: round(shellPaint - t0, 0),
      barreRendue: round(sidebar - t0, 0), pagePeinte: round(page - t0, 0), modalePrete: round(modal - t0, 0), commande: command, ...processes(), vivants: win.live.size,
    });
  },

  // Vue modale (DEM-12) : les étapes entre la coque chargée et la vue modale prête, en ms depuis
  // la création du processus, puis ce que la page de la vue a coûté (navigation, scripts).
  // Les méthodes sont enveloppées sur la fenêtre : la mesure se joue telle quelle sur une ancienne version.
  async modale({ first: w }) {
    const t0 = process.getCreationTime();
    const at = () => round(performance.timeOrigin + performance.now() - t0, 1);
    const ui = w.ui.webContents;
    const e = { demandes: 0 };
    const fill = w.fillSpares.bind(w);
    w.fillSpares = (...a) => { const before = w.wanted.length; const t = performance.now(); const r = fill(...a); if (w.wanted.length > before && !e.reserveDemandee) { e.reserveDemandee = at(); e.demandes = w.wanted.length - before; e.demandeMs = round(performance.now() - t, 2); } return r; };
    const adopt = w.adoptSpare.bind(w);
    w.adoptSpare = (d) => {
      const r = adopt(d);
      if (r && r.createWindow) { const make = r.createWindow; r.createWindow = (o) => { const t = performance.now(); const wc = make(o); e.vuesCreeesMs = round((e.vuesCreeesMs || 0) + performance.now() - t, 2); if (!e.premiereVueCreee) e.premiereVueCreee = at(); e.derniereVueCreee = at(); wc.once('dom-ready', () => { if (!e.premiereVueDom) e.premiereVueDom = at(); }); wc.once('did-finish-load', () => { if (!e.premiereVueChargee) e.premiereVueChargee = at(); e.derniereVueChargee = at(); }); return wc; }; }
      return r;
    };
    const ready = w.spareReady.bind(w);
    w.spareReady = (...a) => { const had = !!w.modal; const r = ready(...a); if (!had && w.modal) e.modaleCreee = at(); return r; };
    ui.once('dom-ready', () => { e.coqueDom = at(); });
    await new Promise((r) => ui.once('did-finish-load', r));
    e.coqueChargee = at();
    ui.executeJavaScript(`new Promise((r) => { const go = () => (typeof S === 'object' && S ? requestAnimationFrame(() => requestAnimationFrame(() => r())) : setTimeout(go, 2)); go(); })`).then(() => { e.barreRendue = at(); });
    await until(() => w.modal && !w.modal.webContents.isLoading(), 5000).catch(() => {});
    e.modalePrete = at();
    await sleep(1200);
    // Dans la page de la vue modale : navigation et ressources (durées, en ms).
    const page = await w.modal.webContents.executeJavaScript(`(() => { const n = performance.getEntriesByType('navigation')[0] || {}; const r = {}; for (const x of performance.getEntriesByType('resource')) r[x.name.split('/').pop().replace(/\W/g, '_')] = Math.round(x.duration * 10) / 10; return { reponse: n.responseEnd, interactif: n.domInteractive, domFini: n.domContentLoadedEventEnd, charge: n.loadEventEnd, scripts: n.domContentLoadedEventStart - n.responseEnd, ressources: r }; })()`).catch(() => ({}));
    const shell = await ui.executeJavaScript(`(() => { const n = performance.getEntriesByType('navigation')[0] || {}; return { interactif: n.domInteractive, charge: n.loadEventEnd }; })()`).catch(() => ({}));
    for (const k of Object.keys(page)) if (typeof page[k] === 'number') page[k] = round(page[k], 1);
    out({ bench: 'modale', etapes: e, ecarts: { chargeeADemande: round(e.reserveDemandee - e.coqueChargee, 1), demandeAVue: round(e.premiereVueCreee - e.reserveDemandee, 1), vueAChargee: round(e.premiereVueChargee - e.premiereVueCreee, 1), chargeeAPrete: round(e.modalePrete - e.premiereVueChargee, 1), coqueChargeeAPrete: round(e.modalePrete - e.coqueChargee, 1) }, page, coque: shell });
  },

  // Page de la coque (DEM-13) : de la navigation à l'événement « load », étape par étape, et
  // chaque fichier demandé (début, fin, en ms depuis le début de la navigation). Rien n'est
  // modifié dans la version mesurée : tout vient des relevés du moteur.
  async coque({ first: w }) {
    const t0 = process.getCreationTime();
    const ui = w.ui.webContents;
    if (ui.isLoading()) await new Promise((r) => ui.once('did-finish-load', r));
    const charge = round(performance.timeOrigin + performance.now() - t0, 1);
    await sleep(1200);
    const page = await ui.executeJavaScript(`(() => {
      const n = performance.getEntriesByType('navigation')[0] || {};
      const fichiers = {};
      let dernier = 0;
      for (const x of performance.getEntriesByType('resource')) {
        if (x.startTime > n.loadEventEnd) continue;
        const nom = x.name.split('/').pop().replace(/\W/g, '_');
        fichiers[nom] = { debut: x.startTime, fin: x.responseEnd };
        dernier = Math.max(dernier, x.responseEnd);
      }
      const peint = (performance.getEntriesByType('paint').find((x) => x.name === 'first-contentful-paint') || {}).startTime;
      // Repères posés à la main dans une copie jetable (performance.mark), s'il y en a.
      const reperes = {};
      for (const x of performance.getEntriesByType('mark')) reperes[x.name.replace(/[^a-z0-9]/gi, '_')] = x.startTime;
      return { origine: performance.timeOrigin, reponse: n.responseEnd, interactif: n.domInteractive, domFini: n.domContentLoadedEventEnd, charge: n.loadEventEnd,
        scripts: n.domContentLoadedEventStart - n.responseEnd, dernierFichier: dernier, peint, fichiers, reperes };
    })()`).catch(() => ({}));
    const r = (o) => { for (const k of Object.keys(o)) { if (typeof o[k] === 'number') o[k] = round(o[k], 1); else if (o[k] && typeof o[k] === 'object') r(o[k]); } return o; };
    const origine = round(page.origine - t0, 1);
    delete page.origine;
    out({ bench: 'coque', navigationDebut: origine, coqueChargee: charge, page: r(page) });
  },

  // Mémoire : au repos, puis après avoir ouvert toutes les vues d'appoint.
  async memoire({ first: w, base }) {
    const rt = await until(() => w.activeRt);
    await until(() => !rt.wc.isLoading());
    await sleep(2500);
    const repos = processes();
    const t = {};
    // Les ouvertures sont espacées, comme les gestes d'une personne.
    const timed = async (name, fn, ready) => { await sleep(400); const t0 = Date.now(); fn(); await until(ready); t[name] = Date.now() - t0; };
    const shown = (v) => () => { const view = v(); return view && !view.webContents.isDestroyed() && !view.webContents.isLoading() && w.win.contentView.children.includes(view); };
    await timed('toast', () => w.toast('Bonjour'), shown(() => w.toastView));
    await timed('recherche', () => w.openFind(), shown(() => w.findView));
    w.closeFind();
    await timed('statut', () => w.linkStatus(rt, base + '/leger?lien'), shown(() => w.statusView));
    w.linkStatus(rt, '');
    await timed('depot', () => w.dragZone(true), shown(() => w.dropView));
    w.dragZone(false);
    await timed('commande', () => w.openCommand(), () => w.modal && !w.modal.webContents.isLoading());
    w.hideModal();
    await sleep(3000);
    const ouvertes = processes();
    const wait = Number(process.env.ORBE_BENCH_IDLE) || 0;
    let apres = null;
    if (wait) { await sleep(wait); apres = processes(); }
    out({ bench: 'memoire', repos, ouvertes, apres, ouverture: t });
  },

  // Coût d'Orbe par navigation : loadURL → did-finish-load, vue d'onglet ordinaire.
  async navigation({ first: w, base }) {
    const rounds = Number(process.env.ORBE_BENCH_ROUNDS) || 14;
    const pages = ['leger', 'cadres', 'ressources'];
    const view = new WebContentsView({ webPreferences: { session: w.session, sandbox: true, contextIsolation: true, nodeIntegrationInSubFrames: true } });
    w.win.contentView.addChildView(view);
    view.setBounds({ x: 300, y: 60, width: 900, height: 700 });
    const wc = view.webContents;
    const load = async (p, i) => { const t0 = performance.now(); await wc.loadURL(`${base}/${p}?n=${i}`); return performance.now() - t0; };
    for (const p of pages) await load(p, 'chauffe');
    const res = Object.fromEntries(pages.map((p) => [p, []]));
    for (let i = 0; i < rounds; i++) for (const p of pages) res[p].push(await load(p, i));
    const o = { bench: 'navigation' };
    for (const p of pages) o[p] = round(median(res[p]), 2);
    wc.close();
    out(o);
  },

  // Barre de commande : de la frappe à la liste peinte, et calcul côté principal.
  async commande({ first: w, store }) {
    const rt = await until(() => w.activeRt);
    await until(() => !rt.wc.isLoading());
    await sleep(1200);
    w.openCommand();
    const wc = w.modal.webContents;
    await until(() => !wc.isLoading() && wc.executeJavaScript('!document.getElementById("command").hidden'));
    await wc.executeJavaScript(`(() => {
      window.__m = [];
      const input = document.getElementById('cmd-input');
      const list = document.getElementById('cmd-list');
      let t0 = 0;
      input.addEventListener('input', () => { t0 = performance.now(); }, true);
      window.__l = [];
      new MutationObserver(() => { if (!t0) return; const s = t0; t0 = 0; window.__l.push(performance.now() - s); requestAnimationFrame(() => { const c = new MessageChannel(); c.port1.onmessage = () => window.__m.push(performance.now() - s); c.port2.postMessage(0); }); }).observe(list, { childList: true });
    })()`);
    const local = [];
    const orig = w.suggestLocal.bind(w);
    w.suggestLocal = (q) => { const t0 = performance.now(); const r = orig(q); local.push(performance.now() - t0); return r; };
    const words = [word(21), word(40) + '.exemple', word(1003), word(305).slice(0, 5), word(2010), 'exemple.fr/' + word(1001)];
    // La frappe est rejouée dans la vue (valeur + événement « input ») : même chemin que le
    // clavier, sans dépendre de la fenêtre qui a le clavier pendant la mesure.
    const type = async (text) => {
      const n = await wc.executeJavaScript('window.__m.length');
      await wc.executeJavaScript(`(() => { const i = document.getElementById('cmd-input'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new InputEvent('input', { inputType: 'insertText' })); })()`);
      await until(() => wc.executeJavaScript('window.__m.length').then((x) => x > n), 3000).catch(() => {});
    };
    for (let round = 0; round < 3; round++) {
      for (const word of words) {
        for (let i = 1; i <= word.length; i++) { await type(word.slice(0, i)); await sleep(20); }
      }
    }
    const paints = await wc.executeJavaScript('window.__m');
    const lists = await wc.executeJavaScript('window.__l');
    const sorted = [...paints].sort((a, b) => a - b);
    out({
      bench: 'commande', historique: Object.keys(store.state.history).length, frappes: paints.length,
      frappeVersListe: round(median(lists), 2), listeP90: round([...lists].sort((a, b) => a - b)[Math.floor(lists.length * 0.9)] || 0, 2),
      frappeVersPeinture: round(median(paints), 1), p90: round(sorted[Math.floor(sorted.length * 0.9)] || 0, 1),
      calculPrincipal: round(median(local), 2), calculP90: round([...local].sort((a, b) => a - b)[Math.floor(local.length * 0.9)] || 0, 2),
    });
  },

  // Icônes devinées (/favicon.ico) : requêtes émises par la coque pour des onglets sans icône.
  async icones({ first: w }) {
    const { session } = require('electron');
    let n = 0;
    const hosts = new Set();
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/favicon.ico'] }, (d, cb) => { n += 1; hosts.add(new URL(d.url).host); cb({ cancel: true }); });
    await sleep(2500);
    const first = n;
    const home = w.spaceId;
    if (w.data.spaces.length < 2) { w.newSpace(); await sleep(1200); w.hideModal(); w.switchSpace(home); await sleep(900); }
    const other = w.data.spaces.find((sp) => sp.id !== home);
    for (let i = 0; i < 3; i++) { w.switchSpace(other.id); await sleep(900); w.switchSpace(home); await sleep(900); }
    out({ bench: 'icones', onglets: Object.keys(w.data.tabs).length, premieres: first, apresSixBascules: n, hotes: hosts.size });
  },

  // État envoyé à la coque : taille, temps d'envoi et nombre d'envois réels.
  async etat({ first: w }) {
    const rt = await until(() => w.activeRt);
    await until(() => !rt.wc.isLoading());
    await sleep(1500);
    const ui = w.ui.webContents;
    const send = ui.send.bind(ui);
    let bytes = 0;
    let sends = 0;
    ui.send = (ch, ...args) => { if (ch === 'state' || ch === 'state-patch') { sends += 1; bytes += JSON.stringify(args).length; } return send(ch, ...args); };
    const run = (n, mutate) => {
      const times = [];
      bytes = 0; sends = 0;
      for (let i = 0; i < n; i++) { mutate(i); const t0 = performance.now(); w.sendState(); times.push(performance.now() - t0); }
      return { ms: round(median(times), 3), octets: Math.round(bytes / n), envois: sends };
    };
    const tab = w.data.tabs[w.activeId];
    const tabs = Object.keys(w.data.tabs).length;
    const identique = run(60, () => {});
    const titre = run(60, (i) => { tab.title = 'Titre ' + i; });
    // Du début de l'envoi au retour de la coque, une fois l'état rendu (horloge du processus principal).
    let ack = null;
    const handle = w.handle.bind(w);
    w.handle = (action, a) => (action === 'mesureRendu' ? (ack && ack(), undefined) : handle(action, a));
    await ui.executeJavaScript(`void O.on('state', () => { O.send('mesureRendu'); })`);
    const lat = [];
    for (let i = 0; i < 40; i++) {
      tab.title = 'Latence ' + i;
      const done = new Promise((r) => { ack = r; });
      const t0 = performance.now();
      w.sendState();
      await done;
      lat.push(performance.now() - t0);
      await sleep(25);
    }
    // Travail de la coque par envoi (fil principal du processus de rendu, désérialisation comprise).
    const dbg = ui.debugger;
    dbg.attach('1.3');
    await dbg.sendCommand('Performance.enable');
    const metric = async () => Object.fromEntries((await dbg.sendCommand('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    const work = async (mutate) => {
      const a = await metric();
      for (let i = 0; i < 50; i++) { mutate(i); w.sendState(); await sleep(20); }
      const b = await metric();
      return { tache: round((b.TaskDuration - a.TaskDuration) * 1000 / 50, 2), script: round((b.ScriptDuration - a.ScriptDuration) * 1000 / 50, 2) };
    };
    const coqueIdentique = await work(() => {});
    const coqueTitre = await work((i) => { tab.title = 'Travail ' + i; });
    dbg.detach();
    out({ bench: 'etat', onglets: tabs, identique, titre, allerRetour: round(median(lat), 2), coqueIdentique, coqueTitre });
  },

  // Voisins (MEM-6) : dix onglets d'un même site, dont trois qui calculent 150 ms par seconde
  // en arrière-plan. Mémoire et processus, puis fluidité de l'onglet affiché pendant dix secondes
  // (images présentées, plus long trou entre deux images, aller-retour d'un message). Avec
  // `--renderer-process-limit`, les onglets du site partagent des processus : c'est ce qu'on mesure.
  async voisins({ first: w, win, base }) {
    const pidsOf = (id) => { const rt = win.live.get(id); const set = new Set(); try { for (const f of rt.wc.mainFrame.framesInSubtree) set.add(f.osProcessId); } catch {} return set; };
    const temoin = w.newTab(base + '/temoin');
    const lourds = [];
    for (let i = 0; i < 9; i++) lourds.push(w.newTab(`${base}/lourd?i=${i}${i < 3 ? '&travail=150' : ''}`, { background: true }));
    // Deux onglets d'un AUTRE site (même serveur, autre nom) : ils ne doivent jamais partager un processus avec les premiers.
    const autre = base.replace('127.0.0.1', 'localhost');
    const ailleurs = [w.newTab(autre + '/lourd?i=a', { background: true }), w.newTab(autre + '/lourd?i=b', { background: true })];
    await until(() => [...lourds, ...ailleurs].every((x) => /^Lourd/.test(w.data.tabs[x.id].title)) && w.data.tabs[temoin.id].title === 'Témoin', 30000);
    await sleep(4000);
    const site = new Set([temoin, ...lourds].flatMap((x) => [...pidsOf(x.id)]));
    const other = new Set(ailleurs.flatMap((x) => [...pidsOf(x.id)]));
    const mine = pidsOf(temoin.id);
    const voisins = lourds.filter((x) => [...pidsOf(x.id)].some((pid) => mine.has(pid))).length;
    const metrics = app.getAppMetrics().filter((m) => site.has(m.pid));
    const resident = round(metrics.reduce((a, m) => a + m.memory.workingSetSize, 0) / 1024, 0);
    let empreinte = 0;
    try {
      const e = require('../src/main/empreinte');
      if (await e.refresh(metrics.map((m) => ({ pid: m.pid, creationTime: m.creationTime })))) empreinte = round(e.state.total, 0);
    } catch {}
    // Fluidité de l'onglet affiché.
    const wc = win.live.get(temoin.id).wc;
    await wc.executeJavaScript(`window.trous = []; (() => { let last = performance.now(); const f = (t) => { window.trous.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); })()`, true);
    const lat = [];
    const fin = Date.now() + 10000;
    while (Date.now() < fin) {
      const t0 = performance.now();
      await wc.executeJavaScript('1', true);
      lat.push(performance.now() - t0);
      await sleep(100);
    }
    const trous = await wc.executeJavaScript('window.trous', true);
    const sorted = [...lat].sort((a, b) => a - b);
    out({
      bench: 'voisins', processusDuSite: site.size, voisinsDuTemoin: voisins, partagesEntreSites: [...site].filter((pid) => other.has(pid)).length,
      resident, empreinte, images: trous.length, pireTrou: round(Math.max(...trous), 0), trousDePlusDe50ms: trous.filter((x) => x > 50).length,
      messageMedian: round(median(lat), 1), messageP95: round(sorted[Math.floor(sorted.length * 0.95)], 1), messagePire: round(sorted[sorted.length - 1], 0),
    });
  },
  // Gestes courants sur le profil préparé : changement d'Espace (état poussé → barre latérale
  // peinte), changement d'onglet (activate → image de la page), temps de render() dans la coque,
  // défilement de la barre latérale (écarts entre images), puis mémoire avec dix onglets vivants.
  async gestes({ first: w, store, base }) {
    const rt = await until(() => w.activeRt);
    await until(() => !rt.wc.isLoading());
    await sleep(1500);
    const ui = w.ui.webContents;
    const depart = processes();
    let ack = null;
    const handle = w.handle.bind(w);
    w.handle = (action, a) => (action === 'mesureRendu' ? (ack && ack(), undefined) : handle(action, a));
    await ui.executeJavaScript(`(() => {
      window.__r = [];
      if (typeof render === 'function') { const r0 = render; window.render = function () { const t = performance.now(); const v = r0.apply(this, arguments); window.__r.push(performance.now() - t); return v; }; }
      O.on('state', () => { requestAnimationFrame(() => { const c = new MessageChannel(); c.port1.onmessage = () => O.send('mesureRendu'); c.port2.postMessage(0); }); });
    })()`);
    const painted = async (act) => { const done = new Promise((r) => { ack = r; }); const t0 = performance.now(); act(); await Promise.race([done, sleep(3000)]); return performance.now() - t0; };
    const renders = async () => { const r = await ui.executeJavaScript('window.__r.splice(0)'); return r; };
    // Changement d'Espace : aller-retour entre le premier et le suivant (ou un Espace créé pour l'occasion).
    const home = w.spaceId;
    let other = w.data.spaces.find((sp) => sp.id !== home);
    if (!other) { other = store.makeSpace('Autre', '✨'); w.data.spaces.push(other); }
    await painted(() => w.sendState());
    await renders();
    const espace = [];
    for (let i = 0; i < 16; i++) { espace.push(await painted(() => w.switchSpace(i % 2 ? home : other.id))); await sleep(500); }
    const renduEspace = await renders();
    // Un titre change : le cas le plus fréquent en naviguant.
    const tab = w.data.tabs[w.activeId];
    const titre = [];
    for (let i = 0; i < 20; i++) { titre.push(await painted(() => { tab.title = 'Titre ' + i; w.sendState(); })); await sleep(40); }
    const renduTitre = await renders();
    // Changement d'onglet entre deux onglets vivants.
    const a = w.activeId;
    const b = w.newTab(base + '/leger?b').id;
    await until(() => w.data.tabs[b].title === 'Léger');
    await sleep(600);
    const onglet = [];
    const synchrone = [];
    for (let i = 0; i < 20; i++) {
      const id = i % 2 ? b : a;
      const t0 = performance.now();
      w.activate(id);
      synchrone.push(performance.now() - t0);
      await w.activeRt.wc.executeJavaScript('new Promise((r) => requestAnimationFrame(() => r()))', true);
      onglet.push(performance.now() - t0);
      await sleep(150);
    }
    // Défilement de la barre latérale : 1,5 s de défilement continu, écarts entre images.
    const defilement = await ui.executeJavaScript(`new Promise((done) => {
      const el = document.getElementById('scroll');
      const gaps = []; let last = 0; const t0 = performance.now(); let dir = 1;
      const f = (t) => {
        if (last) gaps.push(t - last);
        last = t;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) dir = -1; else if (el.scrollTop <= 0) dir = 1;
        el.scrollTop += dir * 14;
        if (t - t0 < 1500) requestAnimationFrame(f); else done({ gaps, haut: el.scrollHeight, vue: el.clientHeight, lignes: document.querySelectorAll('#scroll .row').length });
      };
      requestAnimationFrame(f);
    })`);
    const g = [...defilement.gaps].sort((x, y) => x - y);
    // Dix onglets vivants de plus (même site local) : processus et mémoire.
    for (let i = 0; i < 9; i++) w.newTab(`${base}/leger?m=${i}`, { background: true });
    await sleep(3500);
    const p90 = (list) => round([...list].sort((x, y) => x - y)[Math.floor(list.length * 0.9)] || 0, 2);
    out({
      bench: 'gestes', onglets: Object.keys(w.data.tabs).length, espaces: w.data.spaces.length,
      espaceVersPeinture: round(median(espace), 2), espaceP90: p90(espace), renduEspace: round(median(renduEspace), 2), renduEspaceMax: round(Math.max(0, ...renduEspace), 2),
      titreVersPeinture: round(median(titre), 2), renduTitre: round(median(renduTitre), 3),
      ongletSynchrone: round(median(synchrone), 2), ongletVersImage: round(median(onglet), 2), ongletP90: p90(onglet),
      defilement: { images: g.length, mediane: round(median(g), 2), p95: round(g[Math.floor(g.length * 0.95)] || 0, 2), pire: round(g[g.length - 1] || 0, 1), lignes: defilement.lignes },
      depart, dixVivants: processes(),
    });
  },

  // Divers petits coûts hors du chemin des essais : sauvegarde de l'état (faite au lancement puis
  // chaque heure, sur le fil principal), surveillance du bord gauche quand la fenêtre est au premier plan.
  async divers({ first: w, store }) {
    const fs = require('fs');
    const { screen } = require('electron');
    store.flush();
    const backups = require(require('path').join(process.cwd(), 'src', 'main', 'backups'));
    const times = [];
    for (let i = 0; i < 15; i++) { const t0 = performance.now(); backups.snapshot(store.file, new Date(Date.now() + i * 1000)); times.push(performance.now() - t0); }
    const t1 = performance.now();
    for (let i = 0; i < 2000; i++) { screen.getCursorScreenPoint(); w.win.getContentBounds(); }
    const bord = (performance.now() - t1) / 2;
    const t2 = performance.now();
    for (let i = 0; i < 20; i++) store.flush(true);
    out({ bench: 'divers', onglets: Object.keys(w.data.tabs).length, etatKo: round(fs.statSync(store.file).size / 1024, 0), sauvegardeMs: round(median(times), 2), bordMicrosecondes: round(bord, 2), ecritureEtatMs: round((performance.now() - t2) / 20, 2) });
  },

  // Repos : ce que coûte Orbe quand rien ne se passe. Plusieurs périodes de `ORBE_BENCH_IDLE` ms
  // (20 s par défaut) : une page fixe ; la même avec un onglet qui joue hors de vue (lecteur
  // miniature) ; mise à jour annoncée ; fenêtre réduite dans le Dock ; fenêtre masquée. Pour chacune : secondes de
  // processeur par famille de processus (ms de calcul par seconde écoulée), réveils, états
  // poussés à la coque, animations en cours dans la coque, fichiers du profil réécrits.
  async repos({ first: w, win, base }) {
    const fs = require('fs');
    const path = require('path');
    const span = Number(process.env.ORBE_BENCH_IDLE) || 20000;
    const rt = await until(() => w.activeRt);
    await until(() => !rt.wc.isLoading());
    const ui = w.ui.webContents;
    const send = ui.send.bind(ui);
    let pushes = 0;
    let bytes = 0;
    ui.send = (ch, ...args) => { if (ch === 'state' || ch === 'state-patch') { pushes += 1; bytes += JSON.stringify(args).length; } return send(ch, ...args); };
    const dir = app.getPath('userData');
    const scan = (d, into = new Map()) => {
      let list = [];
      try { list = fs.readdirSync(d, { withFileTypes: true }); } catch {}
      for (const e of list) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) scan(p, into);
        else { try { const st = fs.statSync(p); into.set(p, st.mtimeMs + ':' + st.size + ':' + st.ino); } catch {} }
      }
      return into;
    };
    const cpu = () => {
      const o = { principal: process.cpuUsage().user / 1e6 + process.cpuUsage().system / 1e6, graphique: 0, coque: 0, pages: 0, autres: 0, reveils: 0 };
      for (const m of app.getAppMetrics()) {
        const s = (m.cpu && m.cpu.cumulativeCPUUsage) || 0;
        o.reveils += (m.cpu && m.cpu.idleWakeupsPerSecond) || 0;
        if (m.type === 'Browser') continue;
        if (m.type === 'GPU') o.graphique += s;
        else if (m.type === 'Tab') { if (m.pid === ui.getOSProcessId()) o.coque += s; else o.pages += s; } else o.autres += s;
      }
      return o;
    };
    const period = async () => {
      await sleep(2500);
      pushes = 0; bytes = 0;
      app.getAppMetrics();
      const a = cpu();
      const files = new Map();
      let before = scan(dir);
      const t0 = Date.now();
      while (Date.now() - t0 < span) {
        await sleep(2000);
        const now = scan(dir);
        for (const [p, sig] of now) if (before.get(p) !== sig) { const f = files.get(p) || { n: 0, octets: 0 }; f.n += 1; f.octets += Number(sig.split(':')[1]); files.set(p, f); }
        before = now;
      }
      const s = (Date.now() - t0) / 1000;
      const b = cpu();
      const vue = await Promise.race([ui.executeJavaScript(`({ etat: document.visibilityState, animations: document.getAnimations().filter((x) => x.playState === 'running').length, noms: document.getAnimations().filter((x) => x.playState === 'running').map((x) => (x.animationName || x.transitionProperty || '?') + ' (' + Math.round(x.currentTime) + ' ms) sur ' + (x.effect && x.effect.target ? x.effect.target.tagName.toLowerCase() + '#' + x.effect.target.id + '.' + x.effect.target.className + ' dans .' + (x.effect.target.parentElement || {}).className : '?')).join(' ; ') })`), sleep(1500).then(() => ({ etat: '?', animations: -1 }))]);
      if (vue.noms) console.log('ANIMATIONS ' + vue.noms);
      const ours = [...files].filter(([p]) => !/\/(Cache|Code Cache|GPUCache|DawnCache|GraphiteDawnCache|DawnGraphiteCache|DawnWebGPUCache|blob_storage|Shared Dictionary)\//.test(p));
      return {
        principal: round((b.principal - a.principal) * 1000 / s, 1), graphique: round((b.graphique - a.graphique) * 1000 / s, 1), coque: round((b.coque - a.coque) * 1000 / s, 1),
        pages: round((b.pages - a.pages) * 1000 / s, 1), autres: round((b.autres - a.autres) * 1000 / s, 1), reveils: round(b.reveils, 0),
        etats: round(pushes * 60 / s, 1), etatsKo: round(bytes * 60 / s / 1024, 1), visible: vue.etat === 'visible' ? 1 : 0, animations: vue.animations,
        ecritures: round(ours.reduce((n, [, f]) => n + f.n, 0) * 60 / s, 1), ecrituresKo: round(ours.reduce((n, [, f]) => n + f.octets, 0) * 60 / s / 1024, 0),
        fichiers: ours.map(([p, f]) => path.relative(dir, p) + '×' + f.n).join(' '),
      };
    };
    // ORBE_BENCH_PERIODES=lecteur,masquee : seulement ces périodes. ORBE_BENCH_CSS : règles ajoutées à la
    // coque avant la période « lecteur » (pour isoler le coût d'une animation en la coupant).
    const only = (process.env.ORBE_BENCH_PERIODES || '').split(',').filter(Boolean);
    const wanted = (name) => !only.length || only.includes(name);
    const res = {};
    if (wanted('fixe')) res.fixe = await period();
    // Une variante (voir VARIANTES) : page fixe, une animation posée dans la coque, une chose changée.
    if (wanted('variante') && process.env.ORBE_BENCH_VARIANTE) {
      const v = VARIANTES[process.env.ORBE_BENCH_VARIANTE];
      if (!v) throw new Error('variante inconnue : ' + process.env.ORBE_BENCH_VARIANTE);
      if (v.main) await v.main(w);
      if (v.css) await ui.insertCSS(v.css);
      if (v.js) await ui.executeJavaScript(v.js);
      await sleep(1500);
      // ORBE_BENCH_TRACE=<fichier> : trace du compositeur pendant 3 s (lue par scripts/trace-images.js).
      if (process.env.ORBE_BENCH_TRACE) {
        const { contentTracing } = require('electron');
        await contentTracing.startRecording({ included_categories: ['viz', 'gpu', 'cc', 'benchmark', 'disabled-by-default-viz.quads', 'disabled-by-default-viz.surface_id_flow', 'disabled-by-default-cc.debug'] });
        await sleep(3000);
        await contentTracing.stopRecording(process.env.ORBE_BENCH_TRACE);
      }
      const b = w.win.getBounds();
      res.variante = { ...(await period()), largeur: b.width, hauteur: b.height, vues: w.win.contentView.children.length, sansClavier: (await ui.executeJavaScript(`document.body.classList.contains('blurred')`)) ? 1 : 0 };
      out({ bench: 'repos', ...res, variante: (({ fichiers, ...r }) => r)(res.variante) });
      return;
    }
    // Barre latérale masquée : la surveillance du bord gauche (pollPeek) tourne. Coût d'un passage.
    if (wanted('bord') && typeof w.pollPeek === 'function') {
      const t0 = performance.now();
      for (let i = 0; i < 2000; i++) w.pollPeek();
      res.bord = { microsecondesParPassage: round((performance.now() - t0) / 2, 2), auPremierPlan: w.win.isFocused() ? 1 : 0 };
    }
    // Une mise à jour est annoncée au bas de la barre latérale (cœur qui bat), page fixe.
    if (wanted('note') && win.hooks && win.hooks.updateNote) {
      const note = win.hooks.updateNote;
      win.hooks.updateNote = () => ({ version: '9.9.9' });
      w.sendState();
      await sleep(Number(process.env.ORBE_BENCH_NOTE_WAIT) || 6000); // l'annonce est là depuis un moment
      res.note = await period();
      win.hooks.updateNote = note;
      w.sendState();
    }
    // Un onglet joue, puis on le quitte : son lecteur miniature apparaît dans la barre latérale.
    const calm = w.activeId;
    const piste = w.newTab(base + '/piste').id;
    await until(() => w.data.tabs[piste].title === 'Piste');
    await w.activeRt.wc.executeJavaScript('start()', true);
    await until(() => w.activeRt.wc.isCurrentlyAudible(), 8000).catch(() => {});
    w.activate(calm);
    if (process.env.ORBE_BENCH_CSS) await ui.insertCSS(process.env.ORBE_BENCH_CSS);
    // La carte du lecteur met un instant à paraître, son titre à défiler : sans cette attente, la
    // période commençait parfois avant le défilement et le comptait (107 ms/s au lieu de 11).
    await until(() => ui.executeJavaScript(`!!document.querySelector('#media .mp')`), 8000).catch(() => {});
    await sleep(800);
    // Régime établi : on laisse finir ce qui ne joue qu'une fois (40 s au plus ; un mouvement sans fin reste compté).
    await until(() => ui.executeJavaScript(`document.getAnimations().filter((x) => x.playState === 'running').length === 0`), Number(process.env.ORBE_BENCH_REST) || 40000).catch(() => {});
    if (wanted('lecteur')) { res.lecteur = await period(); res.lecteur.lecteurs = (w.players || []).length; }
    // Fenêtre entièrement recouverte par une autre (à lancer avec --naturel 1, sinon Chromium ne ralentit rien).
    if (wanted('recouverte')) {
      const { BaseWindow } = require('electron');
      const cover = new BaseWindow({ ...w.win.getBounds(), alwaysOnTop: true, backgroundColor: '#444444', focusable: false, title: 'Mesure : fenêtre qui recouvre' });
      cover.showInactive();
      await sleep(4000);
      res.recouverte = await period();
      cover.destroy();
      await sleep(500);
    }
    if (wanted('reduite')) { w.win.minimize(); res.reduite = await period(); w.win.restore(); await sleep(800); }
    if (wanted('masquee')) { w.win.hide(); res.masquee = await period(); w.win.showInactive(); }
    const fichiers = {};
    for (const k of Object.keys(res)) { if (res[k].fichiers !== undefined) fichiers[k] = res[k].fichiers; delete res[k].fichiers; }
    console.log('FICHIERS ' + JSON.stringify(fichiers));
    out({ bench: 'repos', ...res });
  },
};

module.exports = async function mesures(ctx) {
  const name = process.env.ORBE_BENCH || 'demarrage';
  const base = process.env.ORBE_BENCH_BASE || '';
  if (!BENCHES[name]) throw new Error('mesure inconnue : ' + name);
  await BENCHES[name]({ ...ctx, base });
};
