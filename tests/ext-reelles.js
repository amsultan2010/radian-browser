// Essai sur de vraies extensions (demande Internet) : installation depuis le
// Chrome Web Store dans un profil jetable, pages réelles, puis relevé de ce qui
// fonctionne — styles calculés, contenu des fenêtres surgissantes, erreurs des
// service workers.
//   node scripts/test-ext.js reelles      (ou : ORBE_SCENARIO=tests/ext-reelles.js node scripts/dev.js --selftest)
//   ORBE_EXT_KEEP=1 avec ORBE_USER_DATA=<dossier> : second passage sur le même profil, sans réinstaller
//   ORBE_EXT=darkreader,wappalyzer,ublock,peeper,gofullpage,claude   pour n'en essayer que certaines
//   ORBE_SHOTS=<dossier>   pour garder des captures des fenêtres et panneaux
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const IDS = {
  darkreader: 'eimadpbcbfnmbkopoojfekhnkhdbieeh',
  wappalyzer: 'gppongmhjkpfnbhagpmjfkannfbllamg',
  ublock: 'ddkjiahejlhfcafbddmgiahcphecmpfh',
  peeper: 'mbnbehikldjhnfehhnaidhjhoofhpehk', // CSS Peeper : panneau latéral
  gofullpage: 'fdpohaocaechififmbbbbbknoalclacl', // GoFullPage : capture de page entière
  claude: 'fcoeoabgfenejglbffodgkkbkcdhcgfn', // Claude : panneau latéral, débogueur, groupes d'onglets
};

async function until(fn, timeout = 15000) {
  const t0 = Date.now();
  for (;;) {
    let v;
    try { v = await fn(); } catch { v = false; }
    if (v) return v;
    if (Date.now() - t0 > timeout) return null;
    await sleep(100);
  }
}

module.exports = async function realExtensions({ first: w, win, extensions, extApi, extHost }) {
  const wanted = (process.env.ORBE_EXT || 'darkreader,wappalyzer,ublock,peeper,gofullpage,claude').split(',').map((s) => s.trim()).filter(Boolean);
  const ses = w.session;
  let failed = 0;
  const check = (name, ok, detail = '') => {
    if (!ok) failed += 1;
    console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? '\n      ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
  };
  const consoleOf = {};
  ses.serviceWorkers.on('console-message', (e, d) => {
    const id = (/^chrome-extension:\/\/([a-p]{32})\//.exec(d.sourceUrl || '') || [])[1] || '?';
    (consoleOf[id] || (consoleOf[id] = [])).push(`[${d.level}] ${d.message}`);
  });
  extApi.host.confirmPermissions = async () => true;
  const open = async (url, wait = 2500) => {
    const tab = w.newTab(url);
    const rt = win.live.get(tab.id);
    await new Promise((resolve) => { const timer = setTimeout(resolve, 25000); rt.wc.once('did-stop-loading', () => { clearTimeout(timer); resolve(); }); });
    await sleep(wait);
    return rt;
  };
  const popup = async (id) => {
    const pop = extHost.openPopup(w, id, { x: 260, y: 60 }, { keepOpen: true });
    if (!pop || pop === true) return null;
    const errors = [];
    // « navigate-to » : directive que Chromium ne connaît plus, sans conséquence.
    pop.webContents.on('console-message', (e) => { if ((e.level === 'error' || e.level === 3) && !/navigate-to/.test(e.message)) errors.push(e.message); });
    await until(async () => (await js(pop.webContents, 'document.readyState === "complete"')) === true);
    await sleep(2500);
    pop.errors = errors;
    return pop;
  };
  // Borné dans le temps : executeJavaScript attend la fin du chargement, qui peut ne jamais venir.
  const js = (wc, code) => Promise.race([wc.executeJavaScript(code).catch((err) => 'ERREUR ' + err.message), sleep(8000).then(() => 'ERREUR délai dépassé')]);
  const swErrors = (id) => (consoleOf[id] || []).filter((m) => /^\[(error|3)\]|Uncaught|is not a function|Cannot read|undefined/i.test(m));

  // Sans cela, Electron affiche une boîte d'erreur bloquante et l'essai ne se termine jamais.
  process.on('uncaughtException', (err) => { failed += 1; console.error('  ✗ exception dans le processus principal\n', err); });
  console.log('\nOrbe — vraies extensions\n');
  for (const key of wanted) {
    const id = IDS[key] || key;
    if (process.env.ORBE_EXT_KEEP && extensions.get(id)) { console.log(`  · ${extensions.get(id).name} déjà installée`); continue; }
    try {
      const r = await extensions.install(id);
      console.log(`  · ${r.name} ${r.version} installée (signature du Store : ${r.verified.store})`);
    } catch (err) {
      check(`installation de ${key}`, false, `${err.code || ''} ${err.message}`);
    }
  }
  await sleep(4000);

  if (wanted.includes('darkreader')) {
    const id = IDS.darkreader;
    console.log('\nDark Reader');
    const rt = await open('https://fr.wikipedia.org/wiki/Dakar', 5000);
    const probe = `(() => {
      const styles = [...document.querySelectorAll('style.darkreader, link.darkreader')].map((s) => s.className.replace('darkreader', '').trim());
      const count = {};
      for (const c of styles) count[c] = (count[c] || 0) + 1;
      const bg = (el) => (el ? getComputedStyle(el).backgroundColor : '');
      const fb = document.querySelector('.darkreader--fallback');
      return { classes: count, fallback: !!(fb && fb.textContent.trim()), html: bg(document.documentElement), body: bg(document.body),
        text: getComputedStyle(document.body).color, link: getComputedStyle(document.querySelector('#bodyContent a[href^="/wiki/"]')).color,
        scheme: document.documentElement.getAttribute('data-darkreader-scheme'), mode: document.documentElement.getAttribute('data-darkreader-mode') };
    })()`;
    // Dark Reader attend que la page soit visible : on laisse le temps au thème.
    const dynamic = (r) => r && !r.fallback && r.mode === 'dynamic' && Object.keys(r.classes).some((c) => /sync/.test(c));
    await until(async () => dynamic(await js(rt.wc, probe)), 12000);
    const before = await js(rt.wc, probe);
    check('thème dynamique appliqué (feuilles du site réécrites, feuille de secours vidée)', dynamic(before), before);
    check('aucune erreur dans le service worker', swErrors(id).length === 0, swErrors(id).slice(0, 6).join(' | '));

    const pop = await popup(id);
    check('la fenêtre surgissante s’ouvre', !!pop);
    if (pop) {
      const text = await js(pop.webContents, 'document.body.innerText.replace(/\\s+/g, " ").slice(0, 400)');
      const loader = await js(pop.webContents, '(() => { const l = document.querySelector(".loader"); if (!l) return "absent"; const c = getComputedStyle(l); return l.className + " opacité " + c.opacity + " " + c.visibility; })()');
      check('elle affiche ses réglages (écran « Loading » terminé)', typeof text === 'string' && /Brightness/.test(text) && /loader--complete/.test(loader), `${pop.getContentSize().join('×')} · écran d’attente : ${loader} · ${text}`);
      check('aucune erreur dans sa console', pop.errors.length === 0, pop.errors.slice(0, 4).join(' | '));
      console.log('      structure : ' + await js(pop.webContents, '[...document.querySelectorAll("button, [role=button], .toggle, .site-toggle, input")].slice(0, 40).map((e) => e.tagName.toLowerCase() + "." + String(e.className).split(" ").join(".") + (e.innerText ? ":" + e.innerText.trim().slice(0, 18).replace(/\\s+/g, " ") : "")).join(" | ")'));
      if (process.env.ORBE_SHOTS) require('fs').writeFileSync(require('path').join(process.env.ORBE_SHOTS, 'ext-darkreader-popup.png'), (await pop.webContents.capturePage()).toPNG());

      // Réglage : luminosité +, lue ensuite dans le stockage de l'extension.
      const stored = () => js(pop.webContents, 'Promise.all([chrome.storage.local.get(null), chrome.storage.sync.get(null)]).then(([l, s]) => JSON.stringify({ local: l, sync: s }).slice(0, 900))');
      console.log('      stockage avant : ' + await stored());
      const clicked = await js(pop.webContents, `(() => {
        const site = document.querySelector('.site-toggle');
        if (!site) return 'bouton du site introuvable';
        site.click();
        return 'clic : ' + site.innerText.trim().replace(/\\s+/g, ' ').slice(0, 40);
      })()`);
      console.log('      ' + clicked);
      await sleep(2500);
      const after = await js(rt.wc, probe);
      check('« activer/désactiver pour ce site » agit sur la page', after && JSON.stringify(after.classes) !== JSON.stringify(before.classes) && after.body !== before.body, { avant: before.body, apres: after.body, classes: after.classes });
      console.log('      stockage après : ' + await stored());
      await js(pop.webContents, 'document.querySelector(".site-toggle") && document.querySelector(".site-toggle").click()');
      await sleep(2500);
      const again = await js(rt.wc, probe);
      check('second clic : la page redevient sombre', again && again.body === before.body, again && again.body);
      // Luminosité : trois crans vers le haut, relus dans le stockage puis sur la page.
      const brightness = () => js(pop.webContents, 'chrome.storage.sync.get(null).then((s) => (s.theme ? s.theme.brightness : "défaut"))');
      const b0 = await brightness();
      // Second passage sur le même profil (ORBE_EXT_KEEP) : le réglage a survécu au redémarrage.
      if (process.env.ORBE_EXT_KEEP) check('réglage conservé après redémarrage', Number(b0) > 100, { luminosite: b0 });
      await js(pop.webContents, '(() => { const up = [...document.querySelectorAll(".updown__button")][1]; for (let i = 0; i < 3; i++) up.click(); })()');
      // Dark Reader regroupe ses écritures : le réglage arrive dans le stockage après un délai.
      await until(async () => { const b = await brightness(); return b !== b0 && Number(b) > 100; }, 20000);
      await sleep(1500);
      const b1 = await brightness();
      const lit = await js(rt.wc, probe);
      check('la luminosité se règle et s’enregistre', b1 !== b0 && Number(b1) > 100, { avant: b0, apres: b1 });
      check('…et la page suit', lit && lit.body !== before.body, { avant: before.body, apres: lit && lit.body });
      extHost.closePopup(w);
    }
    const info = extHost.actionsFor(w).find((x) => x.id === id);
    check('bouton décrit pour la barre latérale', !!(info && info.icon && info.popup), info && { title: info.title, badge: info.badgeText, icon: info.icon.slice(0, 30) + '…' });
  }

  if (wanted.includes('wappalyzer')) {
    const id = IDS.wappalyzer;
    console.log('\nWappalyzer');
    // À l'installation, l'extension ouvre sa page d'accueil (tabs.create) : on
    // l'attend, pour qu'elle ne prenne pas la place de l'onglet étudié.
    const welcome = await until(() => extHost.tabs().some((t) => /wappalyzer\.com/.test(t.url)), 20000);
    check('sa page d’accueil s’ouvre dans un onglet d’Orbe (tabs.create)', !!welcome || !!process.env.ORBE_EXT_KEEP);
    const rt = await open('https://wordpress.org/', 6000);
    w.activate(rt.id);
    await sleep(500);
    check('aucune erreur dans le service worker', swErrors(id).length === 0, swErrors(id).slice(0, 6).join(' | '));
    const pop = await popup(id);
    check('la fenêtre surgissante s’ouvre', !!pop);
    if (pop) {
      await sleep(2500);
      const text = await js(pop.webContents, 'document.body.innerText.replace(/\\s+/g, " ").slice(0, 700)');
      const techs = await js(pop.webContents, '[...document.querySelectorAll(".technology__name, .technology .technology__link, [class*=technology__name]")].map((e) => e.innerText.trim()).filter(Boolean).slice(0, 30)');
      const seen = await js(pop.webContents, 'chrome.tabs.query({ active: true, currentWindow: true }).then((t) => t.map((x) => x.url))');
      console.log('      onglet actif vu par la fenêtre surgissante : ' + JSON.stringify(seen) + ' · onglets : ' + JSON.stringify(extHost.tabs().map((t) => (t.active ? '*' : '') + t.url)));
      check('elle liste des technologies pour l’onglet actif', Array.isArray(techs) && techs.some((x) => /^WordPress/.test(x)) && Array.isArray(seen) && seen[0] === rt.wc.getURL(), `${pop.getContentSize().join('×')} · ${JSON.stringify(techs)} · ${text}`);
      check('aucune erreur dans sa console', pop.errors.length === 0, pop.errors.slice(0, 4).join(' | '));
      if (process.env.ORBE_SHOTS) require('fs').writeFileSync(require('path').join(process.env.ORBE_SHOTS, 'ext-wappalyzer-popup.png'), (await pop.webContents.capturePage()).toPNG());
      extHost.closePopup(w);
    }
    const info = extHost.actionsFor(w).find((x) => x.id === id);
    check('bouton décrit pour la barre latérale', !!(info && info.icon), info && { title: info.title, badge: info.badgeText });
  }

  if (wanted.includes('ublock')) {
    const id = IDS.ublock;
    console.log('\nuBlock Origin Lite');
    const rt = await open('https://www.lemonde.fr/', 5000);
    w.activate(rt.id);
    check('aucune erreur dans le service worker', swErrors(id).length === 0, swErrors(id).slice(0, 6).join(' | '));
    const pop = await popup(id);
    check('la fenêtre surgissante s’ouvre', !!pop);
    if (pop) {
      const text = await js(pop.webContents, 'document.body.innerText.replace(/\\s+/g, " ").slice(0, 300)');
      check('elle affiche le site de l’onglet actif', typeof text === 'string' && /lemonde/i.test(text), `${pop.getContentSize().join('×')} · ${text}`);
      check('aucune erreur dans sa console', pop.errors.length === 0, pop.errors.slice(0, 4).join(' | '));
      extHost.closePopup(w);
    }
  }

  if (wanted.includes('peeper')) {
    const id = IDS.peeper;
    console.log('\nCSS Peeper');
    const rt = await open('https://wordpress.org/', 6000);
    w.activate(rt.id);
    await sleep(500);
    const full = w.contentRect();
    // Son bouton n'a pas de fenêtre : il ouvre un inspecteur dans la page (un
    // cadre posé par le script de contenu). Parcours de ce cadre :
    const HELP = `const all = (root, out = []) => { for (const el of root.querySelectorAll('*')) { out.push(el); if (el.tagName === 'IFRAME') { try { if (el.contentDocument) all(el.contentDocument, out); } catch {} } } return out; };
      const label = (el) => (el.innerText || '').trim().replace(/\\s+/g, ' ');
      const box = document.getElementById('csspeeper-extension-container');
      const els = box ? all(box) : [];`;
    const inspector = (expr) => js(rt.wc, `(() => { ${HELP} return ${expr}; })()`);
    const press = (re) => inspector(`(() => { const b = els.find((x) => x.tagName === 'BUTTON' && ${re}.test(label(x))); if (!b) return false; b.click(); return true; })()`);
    const inspectorText = () => inspector(`els.filter((e) => e.tagName === 'BODY').map((e) => label(e)).join(' ').slice(0, 600)`);
    check('le clic sur son bouton est transmis (action.onClicked)', extHost.openPopup(w, id) === true);
    await until(async () => (await inspector('els.some((e) => e.tagName === "BUTTON")')) === true, 15000);
    // Premier lancement : quatre écrans de présentation, puis l'inspecteur. Les
    // refermer écrit dans storage.sync depuis le script de contenu.
    for (let i = 0; i < 3; i++) { if (!(await press('/^Next/i'))) break; await sleep(700); }
    await press("/^Let's get started/i");
    await until(async () => { const t = await inspectorText(); return typeof t === 'string' && /Typography/.test(t) && !/Let's get started/.test(t); }, 15000);
    const seen = await inspectorText();
    check('l’inspecteur s’ouvre dans la page et décrit ses styles (polices, couleurs, feuilles de style)', typeof seen === 'string' && /WordPress/.test(seen) && /Typography/.test(seen) && /Style Rules/.test(seen) && !/Let's get started/.test(seen), seen);
    if (process.env.ORBE_SHOTS) await rt.wc.capturePage().then((img) => require('fs').writeFileSync(require('path').join(process.env.ORBE_SHOTS, 'ext-peeper-page.png'), img.toPNG()), () => {});

    // Panneau latéral. Dans l'inspecteur, « Open Side Bar » est réservé aux
    // comptes payants (« Premium Sidebar view ») : on envoie donc au service
    // worker le message que ce bouton envoie, depuis une page de l'extension.
    const { BrowserWindow } = require('electron');
    const pilot = new BrowserWindow({ show: false, webPreferences: { session: ses, sandbox: true, contextIsolation: true } });
    // Une image de l'extension suffit comme page : charger sidepanel.html ouvrirait
    // un second « panneau », dont la fermeture refermerait le vrai.
    await pilot.loadURL(`chrome-extension://${id}/${Object.values(ses.extensions.getExtension(id).manifest.icons)[0]}`).catch(() => {});
    await js(pilot.webContents, 'chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }).then(() => true, (e) => e.message)');
    const p = await until(() => extHost.panel.shownIn(w), 10000);
    pilot.destroy();
    check('sidePanel.open ouvre son panneau à droite des pages, qui rétrécissent', !!p && p.url === `chrome-extension://${id}/sidepanel.html` && w.contentRect().width === full.width - extHost.panel.widthIn(w) - 8, p && { url: p.url, pages: `${full.width} → ${w.contentRect().width}`, panneau: p.view.getBounds() });
    if (p) {
      const errors = [];
      // Mesure d'audience bloquée par Orbe : sans conséquence.
      p.wc.on('console-message', (e) => { if ((e.level === 'error' || e.level === 3) && !/Analytics error|Failed to fetch/.test(e.message)) errors.push(e.message); });
      await until(async () => /Overview/.test(String(await js(p.wc, 'document.body.innerText'))), 15000);
      await sleep(2500);
      const text = await js(p.wc, 'document.body.innerText.replace(/\\s+/g, " ").slice(0, 500)');
      check('le panneau affiche l’interface de CSS Peeper (Overview, Typography, Color Palette)', typeof text === 'string' && /Overview/.test(text) && /Typography/.test(text) && /Color Palette/.test(text), text);
      const reach = await js(p.wc, `chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => chrome.scripting.executeScript({ target: { tabId: t.id }, func: () => { const e = document.getElementById('__cssInfoPeeper__'); return e ? e.dataset.reduxState : ''; } }).then(([r]) => { const s = JSON.parse(r.result || '{}'); return { onglet: t.url, corps: s.bodyFontFamily, titres: s.headingsFontFamily, couleurs: (s.pageColors || []).length, regles: s.styleRules }; }))`);
      check('depuis le panneau, l’extension lit les styles de la page inspectée (polices, couleurs)', !!reach && reach.onglet === rt.wc.getURL() && typeof reach.corps === 'string' && reach.corps.length > 0 && reach.couleurs > 0, reach);
      // Onglet « Colors » du panneau (barre du bas), par un vrai clic.
      const b = p.view.getBounds();
      for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) p.wc.sendInputEvent({ type, x: Math.round(b.width * 0.37), y: b.height - 32, button: 'left', clickCount: 1 });
      await sleep(3000);
      const colors = await js(p.wc, '({ titre: (document.body.innerText.match(/Colors \\d+/) || [""])[0], couleurs: [...new Set(document.body.innerText.match(/#[0-9A-F]{6}/g) || [])].slice(0, 12) })');
      check('il répond aux clics : l’onglet « Colors » liste des couleurs', !!colors && Array.isArray(colors.couleurs) && colors.couleurs.length > 2, colors);
      console.log('      (compte gratuit : le panneau décrit sa propre page ; la vue latérale de la page inspectée est réservée aux comptes payants)');
      check('aucune erreur dans la console du panneau', errors.length === 0, errors.slice(0, 4).join(' | '));
      if (process.env.ORBE_SHOTS) await p.wc.capturePage().then((img) => require('fs').writeFileSync(require('path').join(process.env.ORBE_SHOTS, 'ext-peeper-panneau.png'), img.toPNG()), () => {});
      extHost.panel.userClose(w);
      await sleep(1500);
      check('fermer le panneau rend la place aux pages', !extHost.panel.shownIn(w) && w.contentRect().width === full.width, { pages: w.contentRect().width });
    }
    check('aucune erreur dans le service worker', swErrors(id).length === 0, swErrors(id).slice(0, 6).join(' | '));
  }

  if (wanted.includes('gofullpage')) {
    const id = IDS.gofullpage;
    console.log('\nGoFullPage');
    const rt = await open('https://fr.wikipedia.org/wiki/Dakar', 5000);
    w.activate(rt.id);
    await sleep(500);
    const page = await js(rt.wc, '({ largeur: innerWidth, hauteur: innerHeight, total: document.documentElement.scrollHeight, dpr: devicePixelRatio })');
    const canCapture = await rt.wc.capturePage().then((img) => !img.isEmpty(), () => false);
    if (!canCapture) console.log('  – capture non vérifiée : l’écran est éteint ou verrouillé, Chromium ne peut rien capturer');
    else {
      // Premier clic : l'extension compte sur « activeTab » ; Orbe demande l'accord
      // (accepté ici), recharge l'extension, puis ouvre sa fenêtre.
      check('premier clic : accès à l’onglet demandé puis accordé (activeTab)', extHost.openPopup(w, id, { x: 260, y: 60 }, { keepOpen: true }) === true && !!(await until(() => extHost.access.widened(id) && extHost.popups.size === 1, 20000)));
      const pop = [...extHost.popups.values()][0];
      const popText = () => (pop && !pop.win.isDestroyed() ? js(pop.win.webContents, 'document.body.innerText.replace(/\\s+/g, " ").slice(0, 160)') : Promise.resolve('(fermée)'));
      await sleep(1500);
      console.log('      fenêtre : ' + await popText());
      // La capture défile la page et l'assemble, puis ouvre le résultat dans un onglet.
      const result = await until(() => extHost.tabs().find((t) => t.url.startsWith(`chrome-extension://${id}/capture.html`)), 180000);
      check('la capture va au bout et ouvre sa page de résultat', !!result, result ? result.url.slice(0, 90) : await popText());
      if (result) {
        const shots = await until(async () => { const r = await js(result.wc, '[...document.querySelectorAll("img")].filter((i) => i.src.startsWith("filesystem:") && i.naturalWidth > 0).map((i) => ({ largeur: i.naturalWidth, hauteur: i.naturalHeight }))'); return Array.isArray(r) && r.length ? r : null; }, 30000);
        const height = (shots || []).reduce((n, s) => n + s.hauteur, 0);
        const expected = { largeur: Math.round(page.largeur * page.dpr), hauteur: Math.round(page.total * page.dpr) };
        check('image de la page entière, à la taille de la page', !!shots && Math.abs(shots[0].largeur - expected.largeur) <= 4 && height >= expected.hauteur * 0.95 && height > page.hauteur * page.dpr * 2, { images: shots, total: `${shots ? shots[0].largeur : 0} × ${height}`, page: `${expected.largeur} × ${expected.hauteur}`, ecran: `${page.largeur} × ${page.hauteur} @${page.dpr}` });
        const text = await js(result.wc, 'document.body.innerText.replace(/\\s+/g, " ").slice(0, 160)');
        check('la page de résultat propose le téléchargement', /Download/.test(String(text)), text);
        // Le contenu de l'image : un échantillon de pixels, relu dans un canevas.
        const pixels = await js(result.wc, `(() => { const img = [...document.querySelectorAll('img')].find((i) => i.src.startsWith('filesystem:')); const c = document.createElement('canvas'); c.width = 400; c.height = 400; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 800, 800, 0, 0, 400, 400); const d = g.getImageData(0, 0, 400, 400).data; const seen = new Set(); for (let k = 0; k < d.length; k += 4 * 37) seen.add(d[k] + ',' + d[k + 1] + ',' + d[k + 2]); return { source: img.src.slice(0, 60), couleurs: seen.size }; })()`);
        check('l’image contient bien la page (pixels variés), rangée dans le système de fichiers de l’extension', !!pixels && pixels.couleurs > 20 && /^filesystem:chrome-extension:/.test(pixels.source), pixels);
      }
      extHost.closePopup(w);
    }
    check('aucune erreur dans le service worker', swErrors(id).length === 0, swErrors(id).slice(0, 6).join(' | '));
  }

  if (wanted.includes('claude')) {
    const id = IDS.claude;
    console.log('\nClaude');
    const running = () => Object.values(ses.serviceWorkers.getAllRunning()).some((x) => x.scope === `chrome-extension://${id}/`);
    const rt = await open('https://example.com/', 3000);
    w.activate(rt.id);
    await sleep(500);
    const full = w.contentRect();
    check('son service worker démarre, sans erreur (tabGroups, debugger, sidePanel présents)', swErrors(id).length === 0 && (running() || !!ses.extensions.getExtension(id)), swErrors(id).slice(0, 4).join(' | '));
    const keys = (await extApi.call(ses, id, 'commands.getAll', [])).value;
    check('son raccourci est attribué', Array.isArray(keys) && keys.some((k) => k.name === 'toggle-side-panel' && k.shortcut), keys);
    check('le clic sur son bouton est transmis (action.onClicked)', extHost.openPopup(w, id) === true);
    const p = await until(() => extHost.panel.shownIn(w), 15000);
    check('il ouvre son panneau latéral, propre à l’onglet', !!p && p.tabId === rt.wc.id && p.url.startsWith(`chrome-extension://${id}/sidepanel.html?tabId=${rt.wc.id}`) && w.contentRect().width < full.width, p && { url: p.url, pages: `${full.width} → ${w.contentRect().width}` });
    if (p) {
      const errors = [];
      p.wc.on('console-message', (e) => { if (e.level === 'error' || e.level === 3) errors.push(e.message.slice(0, 200)); });
      await until(async () => String(await js(p.wc, 'document.body.innerText')).trim().length > 20, 20000);
      await sleep(2000);
      const text = await js(p.wc, 'document.body.innerText.replace(/\\s+/g, " ").slice(0, 300)');
      check('le panneau affiche sa page', typeof text === 'string' && text.trim().length > 20, text);
      const groups = (await extApi.call(ses, id, 'tabGroups.query', [{}])).value;
      console.log('      groupe d’onglets créé par l’extension : ' + JSON.stringify(groups));
      console.log('      console du panneau : ' + (errors.slice(0, 4).join(' | ') || 'aucune erreur'));
      // Ce qui suit dépend du compte de l'utilisateur : rien n'est tenté.
      if (/Se connecter|Sign in|Log in/i.test(String(text))) console.log('      → s’arrête ici : l’extension demande une connexion à un compte Claude payant');
      const native = await js(p.wc, 'new Promise((r) => { try { const port = chrome.runtime.connectNative("com.anthropic.claude_browser_extension"); port.onDisconnect.addListener(() => r(chrome.runtime.lastError ? chrome.runtime.lastError.message : "déconnecté")); setTimeout(() => r("resté ouvert"), 3000); } catch (e) { r("exception : " + e.message); } })');
      console.log('      messagerie native (pont vers Claude Code ou l’application) : ' + native);
      if (process.env.ORBE_SHOTS) await p.wc.capturePage().then((img) => require('fs').writeFileSync(require('path').join(process.env.ORBE_SHOTS, 'ext-claude-panneau.png'), img.toPNG()), () => {});
      w.activate(Object.keys(w.data.tabs).find((k) => k !== rt.id && win.live.get(k)) || rt.id);
      await sleep(600);
      check('le panneau ne suit pas sur un autre onglet', !extHost.panel.shownIn(w) || extHost.panel.shownIn(w) !== p, extHost.panel.shownIn(w) && extHost.panel.shownIn(w).url);
      w.activate(rt.id);
      await sleep(600);
      check('…et revient avec le sien', extHost.panel.shownIn(w) === p);
      extHost.panel.userClose(w);
    }
  }

  for (const id of Object.keys(consoleOf)) {
    const lines = consoleOf[id].filter((m) => !/^\[(info|log|debug|0|1)\]/.test(m));
    if (lines.length) console.log(`\n  console du service worker ${id} :\n    ` + lines.slice(0, 15).join('\n    '));
  }
  console.log(`\n${failed ? failed + ' point(s) en échec' : 'Tout fonctionne'}\n`);
};
