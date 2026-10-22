// Outils communs aux tests d'interface : lance le vrai navigateur avec
// Playwright sur un profil temporaire, sert des pages locales, et expose les
// vues d'Orbe (coque, barre de commande, recherche, onglets) comme des pages
// Playwright que l'on pilote à la souris et au clavier.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const runtime = process.env.ORBE_RUNTIME || path.join(os.homedir(), '.orbe-dev');
const electronBin = path.join(runtime, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron');

const { PROBE, juger, mesurer } = require('../outils');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function delai(promise, ms, label) {
  let timer;
  const limite = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Délai dépassé : ' + label)), ms); });
  return Promise.race([promise, limite]).finally(() => clearTimeout(timer));
}

// Attend qu'une condition devienne vraie ; renvoie sa valeur.
async function jusqua(fn, label, timeout = 6000) {
  const t0 = Date.now();
  let last;
  for (;;) {
    let v;
    try { v = await fn(); last = undefined; } catch (err) { v = false; last = err; }
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('Délai dépassé : ' + label + (last ? ' (' + String(last.message).split('\n')[0] + ')' : ''));
    await sleep(40);
  }
}

// --- Pages locales ------------------------------------------------------------
function servir() {
  const hits = {};
  const page = (title, body) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px sans-serif;padding:40px">${body}</body>`;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    hits[url.pathname] = (hits[url.pathname] || 0) + 1;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    switch (url.pathname) {
      case '/a': return res.end(page('Page A', '<h1>Alpha</h1><p>orbe orbe orbe</p><a id="vers-b" href="/b">aller en B</a>'));
      case '/b': return res.end(page('Page B', '<h1>Bravo</h1><a id="vers-a" href="/a">aller en A</a>'));
      case '/c': return res.end(page('Page C', '<h1>Charlie</h1>'));
      // Lien vers un autre hôte (même serveur, sous le nom « localhost ») : depuis un onglet épinglé, il s'ouvre en aperçu.
      case '/liens': return res.end(page('Page à liens', `<h1>Liens</h1><p style="margin-top:300px"><a id="dehors" href="http://localhost:${server.address().port}/b">ailleurs</a></p>`));
      case '/d': return res.end(page('Page D', '<h1>Delta</h1>'));
      case '/e': return res.end(page('Page E', '<h1>Echo</h1>'));
      case '/long': return res.end(page('Un titre de page vraiment très long pour vérifier la coupe du texte dans la barre latérale', '<h1>Long</h1>'));
      case '/compteur': return res.end(page('Compteur ' + hits['/compteur'], '<h1>Compteur</h1>'));
      case '/connexion': return res.end(page('Connexion', '<form action="/b" method="get"><input id="u" name="u" autocomplete="username" placeholder="identifiant"><br><br><input id="p" type="password" autocomplete="current-password" placeholder="mot de passe"><br><br><button id="ok">Se connecter</button></form>'));
      // Page lente à répondre (indicateur de chargement) ; page plus large que la fenêtre, avec un bloc qui défile en largeur.
      case '/lent': return void setTimeout(() => res.end(page('Page lente', '<h1>Lente</h1><a id="vers-b" href="/b">aller en B</a>')), Number(url.searchParams.get('ms')) || 1500);
      case '/large': return res.end(page('Page large', '<h1>Large</h1><div id="bande" style="width:320px;height:120px;overflow-x:scroll;border:1px solid #999"><div style="width:2400px;height:80px;background:linear-gradient(90deg,#fde,#def)">bande</div></div><a id="vers-b" href="/b" style="display:block;margin-top:260px">aller en B</a>'));
      // Première visite normale ; les suivantes (actualisation) ne finissent jamais de se charger.
      case '/relent':
        if (hits['/relent'] === 1) return res.end(page('Page Relente', '<h1>Relente</h1>'));
        res.write(page('Page Relente', '<h1>Relente</h1>'));
        return undefined;
      case '/saisie': return res.end(page('Page Saisie', '<input id="champ" autofocus><script>document.getElementById("champ").focus()</script>'));
      default:
        res.statusCode = 404;
        return res.end(page('404', 'introuvable'));
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, hits })));
}

// --- Lancement ------------------------------------------------------------------
async function lancer() {
  const { _electron } = require(path.join(runtime, 'node_modules', 'playwright-core'));
  const { server, hits } = await servir();
  const hote = `127.0.0.1:${server.address().port}`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-ui-'));
  const app = await _electron.launch({
    executablePath: electronBin,
    // Trousseau factice : les tests ne touchent jamais au vrai trousseau du système.
    // ORBE_UI_ARGS : options de plus pour le moteur, séparées par des espaces. Session
    // verrouillée ou fenêtre recouverte (les minuteries de la coque y sont ralenties) :
    //   ORBE_UI_ARGS="--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling"
    args: ['-r', path.join(__dirname, 'prelude.js'), '--use-mock-keychain', root, ...(process.env.ORBE_UI_ARGS || '').split(/\s+/).filter(Boolean)],
    env: { ...process.env, ORBE_USER_DATA: userData, ORBE_NO_WELCOME: '1', ORBE_UI_TEST: '1' },
  });

  const ctx = { app, hote, hits, userData, root, sleep, jusqua, delai };

  // --- Journal du processus principal ---------------------------------------------
  // Tout ce qu'il écrit est gardé, avec le code ou le signal de sa fin : si
  // l'application s'arrête au milieu d'un groupe, on sait comment et après quoi.
  // (tests/ui/prelude.js y écrit qui ferme une fenêtre ou demande à quitter.)
  const proc = app.process();
  ctx.journal = [];
  ctx.sortie = null; // { code, signal, at } une fois le processus terminé
  ctx.fermeture = false; // vrai dès que c'est le test qui ferme l'application
  const noter = (flux) => (buf) => {
    for (const l of String(buf).split('\n')) {
      if (!l.trim()) continue;
      ctx.journal.push(`${new Date().toISOString().slice(11, 23)} ${flux} ${l}`);
      if (ctx.journal.length > 2000) ctx.journal.shift();
    }
  };
  if (proc.stdout) proc.stdout.on('data', noter('sortie'));
  if (proc.stderr) proc.stderr.on('data', noter('erreur'));
  proc.on('exit', (code, signal) => { ctx.sortie = { code, signal, at: Date.now(), voulue: ctx.fermeture }; });
  ctx.arretInattendu = () => (ctx.sortie && !ctx.sortie.voulue ? ctx.sortie : null);
  ctx.constat = () => {
    const s = ctx.sortie;
    if (!s) return 'application toujours en marche';
    const comment = s.signal ? `tuée par le signal ${s.signal} (arrêt venu de l’extérieur ou plantage natif)` : `terminée d’elle-même, code ${s.code}`;
    return `application arrêtée il y a ${((Date.now() - s.at) / 1000).toFixed(1)} s : ${comment}`;
  };
  ctx.url = (chemin) => `http://${hote}${chemin}`;

  // Chaque webContents (coque, vues flottantes, onglets, réglages) est une
  // « fenêtre » pour Playwright ; on les reconnaît à leur adresse.
  ctx.pages = () => app.windows().filter((p) => !p.isClosed());
  ctx.page = (fragment) => ctx.pages().find((p) => p.url().includes(fragment));
  ctx.attendrePage = (fragment, timeout) => jusqua(() => ctx.page(fragment), 'vue ' + fragment, timeout);
  // Page d'un onglet d'après son chemin local (« /a »).
  ctx.onglet = (chemin) => ctx.pages().find((p) => p.url() === ctx.url(chemin));
  ctx.attendreOnglet = (chemin) => jusqua(() => ctx.onglet(chemin), 'onglet ' + chemin);

  ctx.shell = await ctx.attendrePage('shell.html', 15000);
  ctx.modal = await ctx.attendrePage('overlay.html#modal', 15000);
  for (const p of [ctx.shell, ctx.modal]) p.setDefaultTimeout(6000);
  app.on('window', (p) => p.setDefaultTimeout(6000));
  await jusqua(() => ctx.shell.evaluate(() => typeof S === 'object' && S !== null), 'coque prête', 15000);
  // La barre latérale glisse en place au premier affichage : on attend la fin.
  await jusqua(async () => { const b = await ctx.shell.locator('#sidebar').boundingBox(); return b && b.x === 0; }, 'barre latérale en place', 15000);

  // --- Écran vivant ? -----------------------------------------------------------
  // Mesuré une fois par groupe, dans la coque (voir tests/outils.js) : sans image
  // présentée, une cadence ou une animation ne prouve rien.
  // (ORBE_UI_ECRAN=inactif : fait comme si aucune image n'était présentée, pour essayer ce chemin.)
  ctx.milieu = process.env.ORBE_UI_ECRAN === 'inactif' ? juger({ frames: 0, ticks: 25, ms: 500, visible: 'simulé' }) : await mesurer(() => ctx.shell.evaluate(PROBE));

  // --- Processus principal ----------------------------------------------------
  // `require` n'existe pas dans le contexte d'évaluation de Playwright ; on
  // retrouve les modules d'Orbe déjà chargés par leur chemin absolu.
  ctx.principal = (fn, arg) => app.evaluate(
    (electron, { src, racine, arg: a }) => {
      const req = (m) => process.mainModule.require(racine + '/src/main/' + m);
      const win = req('window.js');
      const w = win.OrbeWindow.all.find((x) => !x.incognito) || win.OrbeWindow.all[0];
      // eslint-disable-next-line no-eval
      return (0, eval)('(' + src + ')')({ electron, req, win, w, store: req('store.js').store }, a);
    },
    { src: fn.toString(), racine: root, arg },
  );

  // Résumé de l'état réel de la fenêtre, pour les vérifications.
  ctx.etat = () => ctx.principal(({ w, win, store }) => {
    const tab = (id) => { const t = w.data.tabs[id]; return t ? { id, url: t.url, title: t.customTitle || t.title, live: win.live.has(id) } : { id }; };
    const node = (n) => (n.type === 'folder' ? { dossier: n.name, ouvert: n.open !== false, enfants: n.children.map(node) } : tab(n.id));
    const focusDe = () => {
      const vues = { coque: w.ui, modale: w.modal, recherche: w.findView, notification: w.toastView };
      for (const [nom, v] of Object.entries(vues)) if (v && !v.webContents.isDestroyed() && v.webContents.isFocused()) return nom;
      for (const [id, rt] of win.live) if (!rt.wc.isDestroyed() && rt.wc.isFocused()) return 'onglet:' + id;
      return null;
    };
    const rt = w.activeRt;
    return {
      actif: w.activeId,
      actifUrl: w.activeId ? w.data.tabs[w.activeId].url : null,
      aujourdhui: w.space.today.map(tab),
      epingles: w.space.pinned.map(node),
      favoris: w.favorites.map(tab),
      espaces: w.data.spaces.map((s) => ({ id: s.id, nom: s.name })),
      espace: w.space.name,
      lateraleVisible: w.sidebarVisible,
      largeur: w.sidebarWidth,
      modale: w.modalMode,
      recherche: w.findOpen,
      focus: focusDe(),
      vuePage: rt ? rt.view.getBounds() : null,
      langue: store.state.settings.lang,
      archive: store.state.archive.map((a) => a.url),
    };
  });

  // Vue native située au premier plan à un point de la fenêtre : un vrai clic
  // n'atteint que celle-là. Renvoie l'adresse de son contenu.
  ctx.vueAu = (x, y) => ctx.principal(({ w }, pt) => {
    const kids = w.win.contentView.children;
    for (let i = kids.length - 1; i >= 0; i--) {
      const v = kids[i];
      if (typeof v.getVisible === 'function' && !v.getVisible()) continue;
      const b = v.getBounds();
      if (pt.x >= b.x && pt.x < b.x + b.width && pt.y >= b.y && pt.y < b.y + b.height) return v.webContents ? v.webContents.getURL() : '?';
    }
    return null;
  }, { x, y });

  // Position dans la fenêtre d'un point d'une page (les vues flottantes et les
  // onglets ne commencent pas en 0,0).
  ctx.origine = (page) => ctx.principal(({ w, win }, url) => {
    const vues = [w.ui, w.modal, w.findView, w.toastView].filter(Boolean);
    for (const rt of win.live.values()) vues.push(rt.view);
    const v = vues.find((x) => !x.webContents.isDestroyed() && x.webContents.getURL() === url);
    return v ? v.getBounds() : null;
  }, page.url());

  // Vrai clic de souris sur un élément, après avoir vérifié qu'aucune autre vue
  // (page web, vue flottante) ne le recouvre à l'écran.
  ctx.clic = async (page, selecteur, options = {}) => {
    const loc = typeof selecteur === 'string' ? page.locator(selecteur).first() : selecteur;
    // Élément révélé au survol : le vrai pointeur de la personne qui travaille
    // sur ce Mac peut traverser la fenêtre et annuler le survol ; on réessaie.
    if (options.survol) {
      await jusqua(async () => { await options.survol.hover(); await sleep(50); return loc.isVisible(); }, 'élément révélé au survol : ' + selecteur);
    }
    // Attend que l'élément ne bouge plus (barre latérale en cours d'animation).
    let box = null;
    await jusqua(async () => {
      let b = await loc.boundingBox();
      // Survol perdu entre-temps (même cause) : l'élément a disparu, on le révèle de nouveau.
      if (!b && options.survol) { await options.survol.hover(); await sleep(50); b = await loc.boundingBox(); }
      const stable = b && box && b.x === box.x && b.y === box.y && b.width === box.width;
      box = b;
      if (!stable) await sleep(50);
      return stable;
    }, 'élément visible et immobile : ' + selecteur);
    const pos = options.position || { x: box.width / 2, y: box.height / 2 };
    const o = await ctx.origine(page);
    if (o) {
      // Quelques essais : une animation ou une mise en page peut être en cours.
      let dessus = null;
      for (let i = 0; i < 25; i++) {
        dessus = await ctx.vueAu(o.x + box.x + pos.x, o.y + box.y + pos.y);
        if (dessus === page.url()) break;
        await sleep(60);
      }
      if (dessus !== page.url()) {
        const diag = await ctx.principal(({ w }) => JSON.stringify({
          taille: w.win.getContentSize(), visible: w.win.isVisible(), mini: w.win.isMinimized(),
          vues: w.win.contentView.children.map((v) => [v.webContents ? v.webContents.getURL().slice(-22) : '?', v.getVisible ? v.getVisible() : '?', v.getBounds()]),
        })).catch((e) => String(e));
        throw new Error(`« ${selecteur} » est recouvert par la vue ${dessus} — point ${Math.round(o.x + box.x + pos.x)},${Math.round(o.y + box.y + pos.y)} ${diag}`);
      }
    }
    const { survol, ...reste } = options;
    await loc.click({ ...reste, position: pos });
  };

  // --- Menu de l'application --------------------------------------------------
  // Les raccourcis ⌘T, ⌘L, ⌘W… sont des accélérateurs du menu natif : les
  // touches envoyées par Playwright à une page ne les déclenchent pas. On
  // retrouve l'élément de menu qui porte le raccourci (ou le libellé) et on
  // l'actionne, exactement comme le ferait le menu.
  ctx.menu = async (cible) => {
    const ok = await app.evaluate(({ Menu }, c) => {
      const walk = (menu) => {
        for (const it of menu.items) {
          if ((c.accel && it.accelerator === c.accel) || (c.label && it.label === c.label)) return it;
          if (it.submenu) { const f = walk(it.submenu); if (f) return f; }
        }
        return null;
      };
      const it = walk(Menu.getApplicationMenu());
      if (!it || it.enabled === false) return false;
      it.click();
      return true;
    }, cible.includes('+') ? { accel: cible } : { label: await ctx.texte(cible) });
    if (!ok) throw new Error('Élément de menu introuvable ou désactivé : ' + cible);
  };

  // Texte de l'interface dans la langue courante (clé de src/shared/locales.js).
  // Panneau de création d'un Espace (déjà demandé : menu, « + », geste) : on attend qu'il soit
  // ouvert et que son champ de nom ait le clavier, on tape le nom, Entrée crée l'Espace.
  ctx.panneauEspace = () => jusqua(async () => (await ctx.etat()).modale === 'space'
    && ctx.modal.evaluate(() => { const i = document.getElementById('space-input'); return !!i && !document.getElementById('space').hidden && document.activeElement === i; }), 'panneau de création d’un Espace');
  ctx.creerEspace = async (nom) => {
    await ctx.panneauEspace();
    if (nom) await ctx.modal.keyboard.type(nom, { delay: 5 });
    await ctx.modal.keyboard.press('Enter');
    await jusqua(async () => { const e = await ctx.etat(); return !e.modale && (!nom || e.espace === nom); }, 'Espace créé' + (nom ? ' : ' + nom : ''));
  };

  ctx.texte = (cle) => ctx.shell.evaluate((k) => t(k), cle);

  // --- Gestes courants --------------------------------------------------------
  ctx.titres = (zone = '#today') => ctx.shell.locator(`${zone} .row.tab .title`).allTextContents();
  ctx.ligne = (titre, zone = '#sidebar') => ctx.shell.locator(`${zone} .row.tab`).filter({ has: ctx.shell.locator('.title', { hasText: new RegExp('^' + titre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).first();
  ctx.commandeOuverte = () => ctx.modal.evaluate(() => !document.getElementById('command').hidden);
  ctx.suggestions = () => ctx.modal.locator('#cmd-list .cmd .title').allTextContents();
  ctx.selection = () => ctx.modal.evaluate(() => { const el = document.querySelector('#cmd-list .cmd.sel'); return el ? Number(el.dataset.i) : -1; });

  // Ouvre la barre de commande en cliquant « Nouvel onglet ».
  ctx.nouvelOnglet = async () => {
    await ctx.clic(ctx.shell, '#b-newtab');
    await jusqua(ctx.commandeOuverte, 'barre de commande ouverte');
  };

  // Tape au clavier dans la barre de commande et attend que les suggestions
  // correspondent à la saisie (comme quelqu'un qui regarde l'écran).
  ctx.taper = async (texte, attendu) => {
    await ctx.modal.keyboard.type(texte, { delay: 12 });
    if (attendu !== false) {
      await jusqua(async () => (await ctx.suggestions()).some((s) => s === (attendu || texte)), 'suggestions pour « ' + texte + ' »');
    }
  };

  // Ouvre une page locale dans un nouvel onglet, entièrement à la souris et au
  // clavier, et attend qu'elle soit chargée et active.
  ctx.ouvrir = async (chemin, titre) => {
    await ctx.nouvelOnglet();
    await ctx.taper(hote + chemin);
    await ctx.modal.keyboard.press('Enter');
    await jusqua(async () => !(await ctx.commandeOuverte()), 'barre de commande refermée');
    if (titre) await jusqua(async () => (await ctx.shell.locator('#sidebar .row.tab.active .title').allTextContents())[0] === titre, 'onglet « ' + titre + ' » actif');
    return ctx.attendreOnglet(chemin);
  };

  // Glisser-déposer à la souris, d'un point à un autre de la coque. Playwright
  // attend indéfiniment si le glisser est annulé par la page : on borne.
  // `vers` peut être une fonction : la cible est alors visée une fois le
  // glisser commencé, car les zones vides (favoris, épinglés) s'agrandissent à
  // ce moment-là et décalent les listes — comme quelqu'un qui vise à l'œil.
  // `avantLacher` : appelé pointeur arrivé, bouton encore enfoncé.
  ctx.glisser = async (de, vers, { pause = 120, avantLacher = null } = {}) => {
    const m = ctx.shell.mouse;
    // Trace du geste vue par la coque (début, survols, dépôt, fin), rendue avec le
    // repère : un glisser qui ne donne rien dit ainsi où il s'est arrêté.
    await ctx.shell.evaluate(() => {
      if (!window.__geste) {
        window.__geste = [];
        for (const n of ['dragstart', 'dragenter', 'drop', 'dragend']) document.addEventListener(n, (e) => window.__geste.push(`${n}@${Math.round(e.clientX)},${Math.round(e.clientY)}`), true);
        // Événements répétés : comptés (« dragover×12 », « mousemove×7 », « rendu×2 »).
        const compter = (nom) => { const g = window.__geste; const d = g[g.length - 1]; if (d && d.startsWith(nom + '×')) g[g.length - 1] = nom + '×' + (Number(d.slice(nom.length + 1)) + 1); else g.push(nom + '×1'); };
        document.addEventListener('dragover', () => compter('dragover'), true);
        for (const n of ['mousedown', 'mouseup']) document.addEventListener(n, () => window.__geste.push(n), true);
        document.addEventListener('mousemove', () => compter('mousemove'), true);
        // Liste redessinée pendant le geste (lignes ajoutées ou retirées).
        new MutationObserver((ms) => { if (ms.some((m) => [...m.addedNodes, ...m.removedNodes].some((n) => n.classList && n.classList.contains('row')))) compter('rendu'); }).observe(document.getElementById('scroll') || document.body, { childList: true, subtree: true });
      }
      window.__geste.length = 0;
    }).catch(() => {});
    // Vues de l'interface nées pendant le geste (réserve de la coque) : notées aussi.
    const nees = [];
    const nee = (p) => nees.push(`${Date.now() - debut} ms ${p.url().slice(-24)}`);
    const debut = Date.now();
    app.on('window', nee);
    const geste = (async () => {
      await m.move(de.x, de.y);
      await m.down();
      await m.move(de.x + 3, de.y + 3, { steps: 2 });
      await m.move(de.x + 8, de.y + 8, { steps: 2 });
      await sleep(120);
      if (typeof vers === 'function') vers = await vers();
      await m.move(vers.x, vers.y, { steps: 8 });
      await m.move(vers.x, vers.y);
      await sleep(pause);
    })();
    try {
      await delai(geste, 8000, 'glisser (annulé par la page ?)');
    } catch (err) {
      ctx.bloque = true; // la souris de Playwright reste en attente : il faut relancer l'application
      throw err;
    }
    const repere = await ctx.shell.evaluate(() => ({
      ligne: getComputedStyle(document.getElementById('drop-line')).display !== 'none',
      dossier: !!document.querySelector('.drop-into'),
      enCours: document.body.classList.contains('dragging'),
    }));
    if (avantLacher) await delai(avantLacher(), 8000, 'avant de lâcher');
    await delai(m.up(), 5000, 'déposer');
    await sleep(60);
    app.off('window', nee);
    repere.geste = await ctx.shell.evaluate(() => (window.__geste || []).slice()).catch(() => []);
    repere.vuesNees = nees;
    repere.duree = Date.now() - debut;
    repere.de = de;
    repere.vers = { x: Math.round(vers.x), y: Math.round(vers.y) };
    return repere;
  };

  // Tentative de glisser en événements bruts (protocole DevTools), sans risque de
  // blocage : dit si le glisser a démarré et s'il a tenu. Sert à mettre en
  // évidence un glisser annulé par la page dès son départ.
  ctx.tenterGlisser = async (de) => {
    const cdp = await ctx.shell.context().newCDPSession(ctx.shell);
    let donnees = null;
    cdp.on('Input.dragIntercepted', (e) => { donnees = e.data; });
    await cdp.send('Input.setInterceptDrags', { enabled: true });
    await ctx.shell.evaluate(() => {
      if (!window.__glisser) {
        window.__glisser = [];
        for (const n of ['dragstart', 'dragend']) document.addEventListener(n, () => window.__glisser.push(n), true);
      }
      window.__glisser.length = 0;
    });
    const souris = (type, x, y, buttons) => delai(cdp.send('Input.dispatchMouseEvent', {
      type, x, y, buttons, clickCount: 1, button: type === 'mouseMoved' && !buttons ? 'none' : 'left',
    }), 3000, type).catch(() => {});
    await souris('mouseMoved', de.x, de.y, 0);
    await souris('mousePressed', de.x, de.y, 1);
    await souris('mouseMoved', de.x + 3, de.y + 3, 1);
    await souris('mouseMoved', de.x + 8, de.y + 8, 1);
    await sleep(300);
    const evenements = await ctx.shell.evaluate(() => window.__glisser.slice());
    const enCours = await ctx.shell.evaluate(() => document.body.classList.contains('dragging'));
    if (donnees) await delai(cdp.send('Input.dispatchDragEvent', { type: 'dragCancel', x: de.x + 8, y: de.y + 8, data: donnees }), 3000, 'annulation').catch(() => {});
    await souris('mouseReleased', de.x + 8, de.y + 8, 0);
    await cdp.send('Input.setInterceptDrags', { enabled: false }).catch(() => {});
    await cdp.detach().catch(() => {});
    await ctx.shell.keyboard.press('Escape'); // au cas où la coque se croirait encore en plein glisser
    return { evenements, enCours, intercepte: !!donnees };
  };

  // Vitesse des animations de la coque (1 : normale ; 0.1 : dix fois plus
  // lentes). Rend certain, sur n'importe quelle machine, qu'un geste tombe au
  // milieu d'une animation — ce qui n'arrive sinon que sur une machine chargée.
  let cdpCoque = null;
  const coque = async () => cdpCoque || (cdpCoque = await ctx.shell.context().newCDPSession(ctx.shell));
  ctx.vitesseAnimations = async (taux) => {
    const cdp = await coque();
    await cdp.send('Animation.enable');
    await cdp.send('Animation.setPlaybackRate', { playbackRate: taux });
  };
  // ORBE_UI_CPU=4 : la coque tourne quatre fois plus lentement pendant tout le
  // groupe (machine chargée simulée).
  const frein = Number(process.env.ORBE_UI_CPU || 0);
  if (frein > 1) await (await coque()).send('Emulation.setCPUThrottlingRate', { rate: frein });

  // Point d'un élément, une fois celui-ci immobile : les lignes glissent à leur
  // place quand la liste change, et un point relevé en plein glissement viserait
  // à côté.
  ctx.centre = async (loc, dx = 0.5, dy = 0.5) => {
    let prev = null;
    const b = await jusqua(async () => {
      const box = await loc.boundingBox();
      const stable = box && prev && box.x === prev.x && box.y === prev.y && box.width === prev.width && box.height === prev.height;
      prev = box;
      if (box && !stable) await sleep(40);
      return stable ? box : null;
    }, 'élément visible et immobile');
    return { x: b.x + b.width * dx, y: b.y + b.height * dy, box: b };
  };

  // Captures de la coque et des vues flottantes, pour relecture visuelle.
  ctx.captures = process.env.ORBE_UI_SHOTS || path.join(os.tmpdir(), 'orbe-ui-captures');
  ctx.capture = async (nom, page = ctx.shell) => {
    try {
      fs.mkdirSync(ctx.captures, { recursive: true });
      await page.screenshot({ path: path.join(ctx.captures, nom + '.png') });
    } catch {}
  };

  ctx.fermer = async () => {
    ctx.fermeture = true;
    try { await delai(app.close(), 6000, 'fermeture'); } catch { try { app.process().kill('SIGKILL'); } catch {} }
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((r) => server.close(r));
    try { fs.rmSync(userData, { recursive: true, force: true }); } catch {}
  };

  // Pas d'appel au réseau pendant les tests : les suggestions du moteur de
  // recherche sont coupées (les suggestions locales restent actives).
  await ctx.principal(({ store }) => { store.state.settings.suggestions = false; });
  return ctx;
}

module.exports = { lancer, sleep, jusqua, delai, root, runtime, electronBin };
