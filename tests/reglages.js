// Réglages à volets, raccourcis modifiables et import de signets.
// Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/reglages.js node scripts/dev.js --selftest
// Chaque réglage passe par « settings:set », la porte de la fenêtre des
// réglages, pour vérifier aussi le refus des valeurs invalides.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Menu, dialog, globalShortcut } = require('electron');
const platform = require('../src/main/platform');

const { sleep, until } = require('./outils');

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/f.txt') { res.setHeader('content-disposition', 'attachment; filename="reglages-essai.txt"'); return res.end('bonjour'); }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.end(`<!doctype html><meta charset="utf-8"><title>Page réglages${url.search}</title><body style="font:16px sans-serif">
      <div id="onetrust-banner-sdk" style="height:60px;background:#fc0">Nous utilisons des cookies</div><p>contenu</p></body>`);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

module.exports = async function reglagesTests(ctx) {
  const { first: w, OrbeWindow, store, win, little, commands, menu, openSettings, openUrl, panes, prefs, shortcuts, globalAction } = ctx;
  let failed = 0;
  const check = ctx.check || ((name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`); });
  const ui = (js) => w.ui.webContents.executeJavaScript(js);
  const s = () => store.state.settings;
  const set = (patch) => globalAction('settings:set', patch, null);
  const suggest = require('../src/main/suggest');
  const sessions = require('../src/main/sessions');
  const boosts = require('../src/main/boosts');
  const bm = require('../src/main/import-bookmarks');
  const more = require('../src/main/ext-more');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-reglages-'));

  await until(() => ui('typeof S === "object" && S !== null'), 'coque chargée');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = w.spaceId;
  const before = JSON.parse(JSON.stringify(s()));

  // --- Validation ---------------------------------------------------------------
  const bools = Object.keys(prefs.SETTABLE).filter((k) => typeof before[k] === 'boolean');
  let okBools = bools.length >= 12;
  for (const k of bools) {
    await set({ [k]: !before[k] });
    okBools = okBools && s()[k] === !before[k];
    await set({ [k]: 'oui' });
    await set({ [k]: 1 });
    await set({ [k]: null });
    okBools = okBools && s()[k] === !before[k];
    await set({ [k]: before[k] });
    okBools = okBools && s()[k] === before[k];
  }
  check(`les ${bools.length} nouveaux réglages à bascule s’enregistrent, et refusent ce qui n’est pas un booléen`, okBools, bools.join(', '));

  await set({ littleArchiveHours: 5 });
  await set({ littleArchiveHours: '24' });
  const badHours = s().littleArchiveHours === 0;
  await set({ littleArchiveHours: 24 });
  check('délai des petites fenêtres : seules les valeurs proposées sont acceptées', badHours && s().littleArchiveHours === 24);
  await set({ littleArchiveHours: 0 });

  await set({ devSites: ['pas un hôte !'] });
  await set({ devSites: ['a.fr', 'a.fr'] });
  await set({ devSites: 'localhost' });
  await set({ devSites: ['<script>'] });
  const badDev = s().devSites.length === 0;
  await set({ devSites: ['localhost:3000', 'exemple.org'] });
  check('mode développeur : liste de sites validée (hôtes bien formés, sans doublon)', badDev && s().devSites.join() === 'localhost:3000,exemple.org');
  await set({ devSites: [] });

  await set({ downloadDir: 'relatif/dossier' });
  await set({ downloadDir: path.join(tmp, 'absent') });
  await set({ downloadDir: 42 });
  const badDir = s().downloadDir === '';
  await set({ downloadDir: tmp });
  check('dossier des téléchargements : chemin absolu d’un dossier existant, sinon refus', badDir && s().downloadDir === tmp);

  const s2 = store.makeSpace('Réglages', '⚙️', '#10b981');
  w.data.spaces.push(s2);
  await set({ externalLinks: 'space:inconnu' });
  await set({ externalLinks: 'ailleurs' });
  const badExt = s().externalLinks === 'window';
  await set({ externalLinks: 'space:' + s2.id });
  check('liens des autres applications : Espace existant accepté, valeur inconnue refusée', badExt && s().externalLinks === 'space:' + s2.id);

  // Profil d'essai
  const pid = 'p-reglages';
  store.state.profiles.push({ id: pid, name: 'Essai réglages' });
  store.state.favs[pid] = [];
  const sp = store.makeSpace('Profil à part', '🧪', '#f97316');
  sp.profileId = pid;
  w.data.spaces.push(sp);
  await set({ profileSettings: { inconnu: { searchEngine: 'bing' } } });
  await set({ profileSettings: { [pid]: { lang: 'en' } } });
  await set({ profileSettings: { [pid]: { searchEngine: 'altavista' } } });
  await set({ profileSettings: { [pid]: { archiveAfterHours: 3 } } });
  const badProfile = Object.keys(s().profileSettings).length === 0;
  const r1 = await globalAction('settings:setProfile', { id: pid, key: 'searchEngine', value: 'altavista' }, null);
  const r2 = await globalAction('settings:setProfile', { id: 'inconnu', key: 'searchEngine', value: 'bing' }, null);
  const r3 = await globalAction('settings:setProfile', { id: pid, key: 'lang', value: 'en' }, null);
  check('réglages par profil : profil, clé et valeur vérifiés', badProfile && !r1.ok && !r2.ok && !r3.ok && Object.keys(s().profileSettings).length === 0);

  const info = await globalAction('settings:get', null, null);
  check('« settings:get » garde ses champs et décrit les volets',
    info.settings === s() && Array.isArray(info.spaces) && Array.isArray(info.profiles) && Array.isArray(info.engines) && typeof info.version === 'string'
    && info.panes.length === 10 && info.panes.includes('shortcuts') && info.panes.includes('tabs') && info.memoryGb > 0 && typeof info.isDefault === 'boolean' && typeof info.downloads === 'string', JSON.stringify(Object.keys(info)));

  // Profils : renommer, supprimer
  store.state.profiles.push({ id: 'p-tmp', name: 'Temporaire' });
  store.state.favs['p-tmp'] = [];
  const renamed = await globalAction('settings:renameProfile', { id: 'p-tmp', name: '  Renommé  ' }, null);
  await globalAction('settings:setProfile', { id: 'p-tmp', key: 'searchEngine', value: 'bing' }, null);
  const keptProfile = await globalAction('settings:deleteProfile', pid, null);
  const afterDelete = await globalAction('settings:deleteProfile', 'p-tmp', null);
  check('profils : renommer ; supprimer seulement si aucun Espace ne l’utilise, ses réglages propres partent avec lui',
    renamed.find((x) => x.id === 'p-tmp').name === 'Renommé' && keptProfile.some((x) => x.id === pid) && !afterDelete.some((x) => x.id === 'p-tmp') && !s().profileSettings['p-tmp']);

  // Exceptions du bloqueur
  const adblock = require('../src/main/adblock');
  adblock.allowSite('exemple-reglages.org');
  const listed = (await globalAction('settings:get', null, null)).allow.includes('exemple-reglages.org');
  const left = await globalAction('settings:allowRemove', 'exemple-reglages.org', null);
  check('exceptions du bloqueur : listées dans les réglages, retirées une à une', listed && !left.includes('exemple-reglages.org') && !adblock.isSiteAllowed('exemple-reglages.org'));

  // --- Effets -------------------------------------------------------------------
  // Liens des autres applications vers un Espace précis
  openUrl(base + '/?externe');
  check('lien d’une autre application : ouvert dans l’Espace choisi', w.space === s2 && w.data.tabs[w.activeId].url === base + '/?externe');
  const ext = w.activeId;
  await until(() => win.live.get(ext) && !win.live.get(ext).loading && w.data.tabs[ext].title.startsWith('Page réglages'), 'page chargée');
  const wc = win.live.get(ext).wc;
  await set({ externalLinks: 'window' });

  // Moteur de recherche et suggestions par profil
  await globalAction('settings:setProfile', { id: pid, key: 'searchEngine', value: 'duckduckgo' }, null);
  await globalAction('settings:setProfile', { id: pid, key: 'suggestions', value: false }, null);
  const general = suggest.resolve('chats noirs');
  w.switchSpace(sp.id);
  const own = suggest.resolve('chats noirs');
  const noSuggest = await suggest.remote('chats');
  check('moteur de recherche propre à un profil, le général ailleurs', /google\./.test(general) && /duckduckgo\.com/.test(own), general + ' / ' + own);
  check('suggestions coupées pour ce seul profil', Array.isArray(noSuggest) && noSuggest.length === 0 && s().suggestions === true);
  await globalAction('settings:setProfile', { id: pid, key: 'searchEngine', value: null }, null);
  await globalAction('settings:setProfile', { id: pid, key: 'suggestions', value: null }, null);
  check('« comme le réglage général » : le profil retombe sur le moteur général', /google\./.test(suggest.resolve('chats noirs')) && !s().profileSettings[pid]);

  // Archivage par profil
  const old = Date.now() - 30 * 36e5;
  const mk = (space, name) => { const tab = w.createTab(`http://127.0.0.1:9/${name}`, { space, index: space.today.length }); tab.lastActiveAt = old; tab.title = name; return tab; };
  w.switchSpace(s2.id);
  const stale1 = mk(sp, 'vieux-profil');
  const stale2 = mk(s2, 'vieux-general');
  const hoursBefore = s().archiveAfterHours;
  await set({ archiveAfterHours: 0 });
  await globalAction('settings:setProfile', { id: pid, key: 'archiveAfterHours', value: 24 }, null);
  win.archiveStale();
  check('archivage après 24 h pour un profil, jamais pour les autres', !w.data.tabs[stale1.id] && !!w.data.tabs[stale2.id]);
  await set({ archiveAfterHours: 24 });
  await globalAction('settings:setProfile', { id: pid, key: 'archiveAfterHours', value: 0 }, null);
  const stale3 = mk(sp, 'garde-profil');
  win.archiveStale();
  check('et l’inverse : « jamais » pour le profil, 24 h en général', !!w.data.tabs[stale3.id] && !w.data.tabs[stale2.id]);
  await globalAction('settings:setProfile', { id: pid, key: 'archiveAfterHours', value: null }, null);
  await set({ archiveAfterHours: hoursBefore });
  w.close(stale3.id, { silent: true });

  // Dossier des téléchargements
  const own2 = path.join(tmp, 'profil');
  fs.mkdirSync(own2);
  await globalAction('settings:setProfile', { id: pid, key: 'downloadDir', value: own2 }, null);
  check('dossier des téléchargements propre à un profil', sessions.hooks.downloadDir(sessions.profileSession(pid)) === own2 && sessions.hooks.downloadDir(sessions.mainSession()) === tmp);
  wc.downloadURL(base + '/f.txt');
  await until(() => fs.existsSync(path.join(tmp, 'reglages-essai.txt')), 'fichier téléchargé');
  check('un téléchargement arrive dans le dossier choisi', fs.readFileSync(path.join(tmp, 'reglages-essai.txt'), 'utf8') === 'bonjour');
  fs.rmSync(own2, { recursive: true });
  check('dossier supprimé depuis : retour au dossier général', prefs.downloadDirFor(pid) === '' && prefs.get('downloadDir', pid) === own2);
  await globalAction('settings:setProfile', { id: pid, key: 'downloadDir', value: null }, null);
  await set({ downloadDir: '' });
  check('dossier vide : celui du système', sessions.hooks.downloadDir(sessions.mainSession()) === '');

  // Reprise de la session
  const saved = { spaceId: s2.id, activeBySpace: { [s2.id]: ext } };
  const on = win.resumed(saved, w.data.spaces, true);
  const off = win.resumed(saved, w.data.spaces, false);
  check('reprise à l’ouverture : Espace et onglet actif repris, ou rien si le réglage est coupé',
    on.spaceId === s2.id && on.activeBySpace[s2.id] === ext && off.spaceId === w.data.spaces[0].id && Object.keys(off.activeBySpace).length === 0
    && win.resumed({ spaceId: 'disparu' }, w.data.spaces, true).spaceId === w.data.spaces[0].id);

  // Confirmation avant de quitter
  const ask = panes.quit.ask;
  let asked = 0;
  let prevented = 0;
  panes.quit.ask = async () => { asked += 1; return false; };
  panes.beforeQuit({ preventDefault: () => { prevented += 1; } });
  const quiet = asked === 0 && prevented === 0;
  await set({ warnOnQuit: true });
  panes.beforeQuit({ preventDefault: () => { prevented += 1; } });
  await sleep(50);
  check('quitter : confirmation demandée seulement si le réglage est actif, et un refus garde Orbe ouvert', quiet && asked === 1 && prevented === 1 && !panes.quit.confirmed && OrbeWindow.all.length > 0);
  await set({ warnOnQuit: false });
  panes.quit.ask = ask;

  // ⌘1 … ⌘9
  const sk = store.makeSpace('Numéros', '🔢', '#3b82f6');
  w.data.spaces.push(sk);
  const idsK = ['a', 'b', 'c'].map((n) => w.createTab(`http://127.0.0.1:9/${n}`, { space: sk, index: sk.today.length }).id);
  const fav = w.createTab('http://127.0.0.1:9/fav', { space: sk, index: sk.today.length });
  sk.today.splice(sk.today.indexOf(fav.id), 1);
  w.data.favs.default.unshift(fav.id);
  const realActivate = w.activate;
  const realSpace = w.spaceId;
  const got = [];
  w.spaceId = sk.id;
  w.activate = (id) => { got.push(id); };
  w.tabAt(1); w.tabAt(9);
  await set({ tabKeysFavorites: false });
  w.tabAt(1);
  await set({ tabKeysNinthLast: false });
  w.tabAt(9);
  w.tabAt(3);
  w.activate = realActivate;
  w.spaceId = realSpace;
  check('⌘1…⌘9 : favoris comptés ou non, ⌘9 dernier ou neuvième', got.join() === [fav.id, idsK[2], idsK[0], idsK[2]].join(), got.join());
  await set({ tabKeysFavorites: true, tabKeysNinthLast: true });
  w.data.favs.default.splice(w.data.favs.default.indexOf(fav.id), 1);
  delete w.data.tabs[fav.id];
  for (const id of idsK) delete w.data.tabs[id];
  w.data.spaces.splice(w.data.spaces.indexOf(sk), 1);

  // Barre d'outils : adresse entière ou nom du site
  w.activate(ext);
  await set({ showToolbar: true, showFullUrl: true });
  await until(async () => (await ui('document.getElementById("tb-url-text").textContent')) === base + '/?externe', 'adresse entière');
  await set({ showFullUrl: false });
  await until(async () => (await ui('document.getElementById("tb-url-text").textContent')) === base.replace('http://', ''), 'nom du site');
  check('barre d’outils : adresse entière, ou seulement le site', true);
  await set({ showToolbar: false, showFullUrl: true });

  // Mode développeur du site
  const yBefore = w.contentRect().y;
  commands.run(w, 'toggleDevMode');
  const hostDev = base.replace('http://', '');
  await sleep(60);
  const devOn = s().devSites.includes(hostDev) && w.toolbarShown && !s().showToolbar && w.contentRect().y > yBefore;
  await set({ showFullUrl: false });
  await until(async () => (await ui('document.getElementById("tb-url-text").textContent')) === base + '/?externe' && (await ui('document.body.classList.contains("toolbar")')), 'barre d’outils du mode développeur');
  commands.run(w, 'toggleDevMode');
  await sleep(60);
  check('mode développeur d’un site : barre d’outils et adresse entière pour lui seul', devOn && !s().devSites.length && !w.toolbarShown && w.contentRect().y === yBefore);
  // Automatique sur les sites locaux (localhost, 127.0.0.1), avec son liseré jaune et noir.
  {
    const prefs2 = require('../src/main/prefs');
    check('site local : localhost, ses sous-domaines, 127.0.0.1 et ::1 — pas un nom qui y ressemble',
      prefs2.isLocal('http://localhost:3000/') && prefs2.isLocal('https://app.localhost/x') && prefs2.isLocal('http://127.0.0.1:8080/') && prefs2.isLocal('http://[::1]:5173/')
      && !prefs2.isLocal('https://localhost.pirate.invalid/') && !prefs2.isLocal('https://exemple.fr/?localhost') && !prefs2.isLocal('file:///localhost') && !prefs2.isLocal('http://127.0.0.2/'));
    check('pendant les essais, le mode développeur automatique est coupé au départ (les pages d’essai sont locales)', s().devLocalhost === false && !w.toolbarShown);
    const stripe = () => ui('(() => { const b = document.body.classList.contains("dev-site"); const g = getComputedStyle(document.getElementById("tb-url"), "::after"); return b + "|" + (g.content !== "none" && g.backgroundImage.includes("repeating-linear-gradient")); })()');
    const noStripe = await stripe();
    await set({ devLocalhost: true });
    await until(async () => (await stripe()) === 'true|true', 'liseré du mode développeur');
    check('site local : mode développeur automatique — barre d’outils, adresse entière et liseré jaune et noir, sans que le site soit noté',
      noStripe === 'false|false' && prefs2.devMode(base + '/') && prefs2.devAuto(base + '/') && w.toolbarShown && !s().devSites.length && w.contentRect().y > yBefore);
    commands.run(w, 'toggleDevMode');
    await until(async () => (await stripe()) === 'false|false', 'liseré retiré');
    const offLocal = s().devOff.join() === hostDev && !s().devSites.length && !w.toolbarShown;
    commands.run(w, 'toggleDevMode');
    await sleep(60);
    check('⌃D sur un site local : coupé pour ce site seulement (noté à part), puis rétabli', offLocal && !s().devOff.length && !s().devSites.length && w.toolbarShown);
    await set({ devOff: ['pas un hôte !'] });
    await set({ devLocalhost: 'oui' });
    check('réglages « devOff » et « devLocalhost » validés', s().devOff.length === 0 && s().devLocalhost === true);
    await set({ devLocalhost: false });
    await until(async () => (await stripe()) === 'false|false', 'liseré retiré');
    check('réglage coupé : plus de mode développeur automatique', !prefs2.devMode(base + '/') && !w.toolbarShown && w.contentRect().y === yBefore);
  }
  await set({ showFullUrl: true });
  check('mode développeur : ⌃D sur macOS, hors du raccourci d’épinglage sous Windows',
    commands.byName.get('toggleDevMode').accel === (platform.isMac ? 'Ctrl+D' : 'Alt+Shift+D') && commands.byName.get('togglePin').accel === platform.accel('Cmd+D'));

  // CSS ajouté aux pages : bandeaux de cookies, couleurs du thème, Boosts
  const css = (code) => wc.executeJavaScript(code, true);
  const banner = 'getComputedStyle(document.getElementById("onetrust-banner-sdk")).display';
  const shown = await css(banner);
  await set({ cookieBanners: true });
  await until(async () => (await css(banner)) === 'none', 'bandeau masqué');
  await set({ cookieBanners: false });
  await until(async () => (await css(banner)) === 'block', 'bandeau rétabli');
  check('bandeaux de cookies : masqués quand le réglage est actif, rétablis sinon', shown === 'block');
  const themeVar = 'getComputedStyle(document.documentElement).getPropertyValue("--orbe-theme-color").trim()';
  const noTheme = await css(themeVar);
  await set({ themeData: true });
  await until(async () => (await css(themeVar)).toLowerCase() === s2.color.toLowerCase(), 'couleur du thème');
  await set({ themeData: false });
  await until(async () => (await css(themeVar)) === '', 'couleur retirée');
  check('couleurs de l’Espace données aux pages seulement sur demande', noTheme === '');
  const bh = boosts.hostOf(base);
  boosts.set(bh, { css: 'body { outline: 3px solid rgb(255, 0, 0) !important; }', enabled: true });
  await boosts.apply(wc);
  const outlineCss = 'getComputedStyle(document.body).outlineStyle';
  await until(async () => (await css(outlineCss)) === 'solid', 'Boost appliqué');
  await set({ boostsEnabled: false });
  await until(async () => (await css(outlineCss)) === 'none', 'Boost retiré');
  await set({ boostsEnabled: true });
  await until(async () => (await css(outlineCss)) === 'solid', 'Boost revenu');
  check('Boosts : appliqués ou non selon le réglage, sans recharger la page', true);
  boosts.set(bh, { css: '', zaps: [] });
  await boosts.apply(wc);

  // Image dans l'image
  const rtx = win.live.get(ext);
  s().autoPip = false;
  delete rtx.pip;
  w.pip(rtx, true);
  const pipOff = !('pip' in rtx);
  s().autoPip = true;
  w.pip(rtx, false);
  check('image dans l’image : rien n’est demandé à la page quand le réglage est coupé', pipOff && rtx.pip === false);

  // Lecteur réduit
  const other = w.newTab(base + '/?autre');
  await until(() => win.live.get(other.id) && !win.live.get(other.id).loading, 'second onglet');
  const sent = [];
  const realSend = w.ui.webContents.send.bind(w.ui.webContents);
  w.ui.webContents.send = (channel, payload) => { if (channel === 'state') sent.push(payload); return realSend(channel, payload); };
  win.media.add(w, ext);
  w.sendState();
  const withPlayer = sent.length && sent[sent.length - 1].players.length === 1 && sent[sent.length - 1].players[0].id === ext;
  s().mediaControls = false;
  w.sendState();
  const withoutPlayer = sent[sent.length - 1].players.length === 0;
  s().mediaControls = true;
  win.media.drop(w, ext);
  w.ui.webContents.send = realSend;
  check('lecteur réduit de la barre latérale : affiché ou non selon le réglage', !!withPlayer && withoutPlayer);
  w.close(other.id, { silent: true });

  // Petites fenêtres : fermeture après le délai
  const lw = new little.LittleWindow(base + '/?petite');
  await until(() => lw.title.startsWith('Page réglages'), 'petite fenêtre chargée');
  lw.usedAt = Date.now() - 13 * 36e5;
  const never = little.LittleWindow.archiveStale();
  await set({ littleArchiveHours: 24 });
  const tooEarly = little.LittleWindow.archiveStale();
  await set({ littleArchiveHours: 12 });
  // Une petite fenêtre au premier plan n'est jamais fermée : on la quitte d'abord.
  lw.win.blur();
  w.win.focus();
  const closed = await until(() => { if (lw.win.isDestroyed()) return true; lw.usedAt = Date.now() - 13 * 36e5; little.LittleWindow.archiveStale(); return false; }, 'petite fenêtre fermée').catch(() => false);
  check('petites fenêtres inutilisées : fermées après le délai, leur page dans l’archive',
    never === 0 && tooEarly === 0 && !!closed && lw.win.isDestroyed() && store.state.archive[0].url === base + '/?petite', JSON.stringify([never, tooEarly, closed]));
  await set({ littleArchiveHours: 0 });

  // --- Raccourcis -----------------------------------------------------------------
  const menuItem = (label) => {
    const walk = (m) => { for (const it of m.items) { if (it.label === label) return it; if (it.submenu) { const f = walk(it.submenu); if (f) return f; } } return null; };
    return walk(Menu.getApplicationMenu());
  };
  const label = (name) => store.t(commands.byName.get(name).label);
  const accelIn = (name) => { const it = menuItem(label(name)); return it ? it.accelerator || '' : null; };
  const withAccel = commands.COMMANDS.filter((c) => c.accel);
  const canon = withAccel.map((c) => shortcuts.canon(c.accel));
  check('raccourcis par défaut : bien formés, sans doublon sur ce système', canon.every(Boolean) && new Set(canon).size === canon.length,
    canon.filter((c, i) => canon.indexOf(c) !== i).join(', '));
  const mismatch = withAccel.filter((c) => shortcuts.display(c.accel) !== c.keys).map((c) => `${c.name} ${c.keys} ≠ ${shortcuts.display(c.accel)}`);
  check('l’affichage calculé d’un raccourci redonne celui de la table des commandes', !mismatch.length, mismatch.join(' ; '));

  const main = platform.isMac ? 'Cmd' : 'Ctrl';
  const bad = ['', 'T', 'Shift+T', main + '+', main + '+' + main + '+T', 'Hyper+T', main + '+TT', main + '+' + 'A'.repeat(60), main + '++', platform.isMac ? 'Alt+T' : 'Cmd+T', 42, null];
  const reserved = [platform.isMac ? 'Cmd+Q' : 'Alt+F4', platform.accel('Cmd+C'), platform.accel('Cmd+1'), platform.accel('Ctrl+3'), 'Ctrl+Tab'];
  check('accélérateurs mal formés ou sans touche de modification : refusés', bad.every((a) => !!shortcuts.check(a).error), bad.filter((a) => !shortcuts.check(a).error).join(' | '));
  check('combinaisons réservées au système ou à Orbe : refusées', reserved.every((a) => shortcuts.check(a).error === 'reserved'), reserved.map((a) => a + ':' + shortcuts.check(a).error).join(' '));
  check('formes acceptées, rendues sous forme canonique',
    shortcuts.check('shift+' + main.toLowerCase() + '+k').accel === (platform.isMac ? 'Shift+Cmd+K' : 'Ctrl+Shift+K') && shortcuts.check('F5').accel === 'F5' && shortcuts.check('Ctrl+Alt+Left').accel === 'Ctrl+Alt+Left');

  const freeA = 'Ctrl+Alt+R';
  const reloadDefault = commands.byName.get('reload').accel;
  const tDefault = commands.byName.get('newTab').accel;
  let r = shortcuts.assign('reload', freeA);
  await until(() => accelIn('reload') === freeA, 'menu reconstruit');
  check('nouveau raccourci : le menu est reconstruit avec lui, la table des commandes garde le défaut',
    r.ok && accelIn('reload') === freeA && commands.byName.get('reload').accel === reloadDefault && s().shortcuts.reload === freeA && shortcuts.accelOf('reload') === freeA);
  const groups = await globalAction('shortcuts:get', null, null);
  const shownKeys = groups.flatMap((g) => g.items).find((i) => i.label === label('reload'));
  check('page des raccourcis, barre de commande et pages de l’interface : même nouveau raccourci',
    shownKeys && shownKeys.keys === shortcuts.display(freeA) && w.commandList().find((c) => c.command === 'reload').shortcut === shortcuts.display(freeA)
    && shortcuts.keysMap().reload === shortcuts.display(freeA) && shortcuts.display(freeA) === (platform.isMac ? '⌃⌥R' : 'Ctrl+Alt+R'), JSON.stringify(shownKeys));

  // Page « Raccourcis clavier essentiels » (menu Aide)
  commands.run(w, 'shortcuts');
  const helpId = w.activeId;
  await until(async () => (await win.live.get(helpId).wc.executeJavaScript('[...document.querySelectorAll(".line")].map((l) => l.textContent).join("|")')).includes(label('reload') + shortcuts.display(freeA)), 'page des raccourcis');
  const helpRows = await win.live.get(helpId).wc.executeJavaScript('[document.querySelectorAll("h2").length, document.querySelectorAll(".line kbd").length]');
  check('page des raccourcis essentiels : cinq rubriques, chaque ligne avec son raccourci en vigueur', helpRows[0] === 5 && helpRows[1] > 40, JSON.stringify(helpRows));
  w.close(helpId, { silent: true });
  w.activate(ext);

  r = shortcuts.assign('forceReload', tDefault);
  check('conflit : signalé, rien n’est changé', r.conflict === 'newTab' && !!r.label && accelIn('newTab') === tDefault && !('forceReload' in s().shortcuts));
  r = shortcuts.assign('forceReload', tDefault, { force: true });
  await until(() => accelIn('forceReload') === shortcuts.canon(tDefault), 'réattribution dans le menu');
  check('réattribution : le raccourci passe à la nouvelle commande, l’ancienne n’en a plus',
    r.ok && r.removed === 'newTab' && s().shortcuts.newTab === null && accelIn('newTab') === '' && shortcuts.keysOf('newTab') === '' && shortcuts.owner(tDefault) === 'forceReload');

  r = shortcuts.reset('newTab');
  const resetConflict = r.conflict === 'forceReload';
  r = shortcuts.reset('newTab', { force: true });
  await until(() => accelIn('newTab') === tDefault, 'raccourci par défaut rétabli');
  check('rétablir un raccourci dont le défaut a été donné ailleurs : même question, puis reprise', resetConflict && r.ok && !('newTab' in s().shortcuts) && s().shortcuts.forceReload === null);

  shortcuts.clear('find');
  await until(() => accelIn('find') === '', 'raccourci retiré');
  shortcuts.assign('find', commands.byName.get('find').accel);
  check('retirer un raccourci, puis redonner le défaut : aucune trace dans les réglages', !('find' in s().shortcuts) && shortcuts.accelOf('find') === commands.byName.get('find').accel);

  // Extensions : elles voient les raccourcis en vigueur.
  const histDefault = more.parseAccelerator(commands.byName.get('downloads').accel);
  const hadDefault = more.reserved().has(histDefault);
  shortcuts.assign('downloads', 'Ctrl+Alt+Y');
  const nowReserved = more.reserved();
  check('extensions : un raccourci d’Orbe déplacé est réservé à sa nouvelle place, l’ancienne est libérée',
    hadDefault && nowReserved.has(more.parseAccelerator('Ctrl+Alt+Y')) && !nowReserved.has(histDefault));

  // Coque : le libellé qui cite ⌘S suit le raccourci.
  // (L'infobulle est celle d'Orbe : le raccourci y est lu au moment de l'afficher.)
  const titleBefore = await ui('KEYS[document.getElementById("b-sidebar").dataset.tipKey]');
  shortcuts.assign('toggleSidebar', 'Ctrl+Alt+B');
  await until(async () => (await ui('KEYS[document.getElementById("b-sidebar").dataset.tipKey]')) === shortcuts.display('Ctrl+Alt+B'), 'infobulle à jour');
  check('coque : l’infobulle de la barre latérale cite le nouveau raccourci', titleBefore === commands.byName.get('toggleSidebar').keys);

  check('Windows : la table de correspondance n’est pas touchée par les changements',
    platform.WIN_ACCEL['Cmd+Y'] === 'Ctrl+H' && platform.accel('Cmd+Y') === (platform.isMac ? 'Cmd+Y' : 'Ctrl+H') && commands.byName.get('history').accel === platform.accel('Cmd+Y')
    && commands.byName.get('history').keys === (platform.isMac ? '⌘Y' : 'Ctrl+H'));

  const kept = JSON.parse(JSON.stringify(s().shortcuts));
  await set({ shortcuts: { inconnue: 'Ctrl+Alt+U' } });
  await set({ shortcuts: { reload: 'ctrl+alt+r' } });
  await set({ shortcuts: { reload: reserved[0] } });
  await set({ shortcuts: { reload: 'Ctrl+Alt+U', find: 'Ctrl+Alt+U' } });
  await set({ shortcuts: { reload: tDefault } });
  await set({ shortcuts: ['reload'] });
  const rejected = JSON.stringify(s().shortcuts) === JSON.stringify(kept);
  await set({ shortcuts: { reload: 'Ctrl+Alt+U', find: null } });
  check('réglage « shortcuts » reçu en bloc : commandes inconnues, formes non canoniques, réservés et doublons refusés',
    rejected && s().shortcuts.reload === 'Ctrl+Alt+U' && s().shortcuts.find === null && Object.keys(s().shortcuts).length === 2);

  shortcuts.resetAll();
  await until(() => accelIn('reload') === reloadDefault && accelIn('find') === commands.byName.get('find').accel, 'tout rétabli');
  check('tout rétablir : plus aucun changement, le menu retrouve les raccourcis par défaut',
    Object.keys(s().shortcuts).length === 0 && accelIn('newTab') === tDefault && accelIn('toggleSidebar') === commands.byName.get('toggleSidebar').accel);

  // Raccourci global de la petite fenêtre
  const g = 'Ctrl+Alt+Shift+F9';
  const gConflict = panes.setGlobal(tDefault);
  const gBad = panes.setGlobal('F');
  const gSet = panes.setGlobal(g);
  const gOn = globalShortcut.isRegistered(g);
  const gTaken = shortcuts.assign('reload', g);
  const gOff = panes.setGlobal('');
  check('raccourci global de la petite fenêtre : enregistré auprès du système, vérifié, puis retiré',
    gConflict.conflict === 'newTab' && !!gBad.error && gSet.ok && gOn && s().littleShortcut === '' && !globalShortcut.isRegistered(g) && gTaken.error === 'reserved' && gOff.ok,
    JSON.stringify([gConflict, gBad, gSet, gOn, gTaken]));

  // --- Import de signets -----------------------------------------------------------
  const fixture = (name) => path.join(__dirname, 'fixtures', `signets-${name}.html`);
  const outline = (nodes) => nodes.map((n) => (n.type === 'folder' ? `[${n.name}:${outline(n.children)}]` : n.title)).join(',');
  const chrome = bm.read(fixture('chrome'));
  check('signets de Chrome : barre de favoris au premier niveau, dossiers imbriqués, dossier vide et page interne écartés',
    chrome.bookmarks === 7 && chrome.folders === 3 && chrome.dropped === 1
    && outline(chrome.nodes) === 'Wikipédia,Café & croissants <3,[Travail:GitHub,MDN,[Docs:Electron]],[Autres favoris:Exemple],Hacker News'
    && chrome.nodes[1].url === 'https://example.org/recherche?q=caf%C3%A9&lang=fr', outline(chrome.nodes));
  const safari = bm.read(fixture('safari'));
  check('signets de Safari : Favoris, Menu Signets et Liste de lecture en dossiers',
    safari.bookmarks === 7 && safari.folders === 4 && outline(safari.nodes) === '[Favoris:Apple,iCloud,[Actualités:Le Monde,Libération]],[Menu Signets:WebKit],[Liste de lecture:Navigateur web — Wikipédia],DuckDuckGo', outline(safari.nodes));
  const firefox = bm.read(fixture('firefox'));
  check('signets de Firefox : barre personnelle au premier niveau ; « place: », « javascript: » et « file: » écartés',
    firefox.bookmarks === 6 && firefox.dropped === 3
    && outline(firefox.nodes) === 'Débuter avec Firefox,Framasoft,[Mozilla Firefox:Obtenir de l’aide,À propos],Qwant,[Autres marque-pages:OpenStreetMap]', outline(firefox.nodes));

  const head = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<TITLE>Bookmarks</TITLE><H1>Bookmarks</H1>\n<DL><p>\n';
  const hostile = bm.parse(head + [
    '<DT><A HREF="javascript:alert(1)">js</A>', '<DT><A HREF="JaVaScRiPt:alert(1)">js2</A>', '<DT><A HREF="file:///etc/passwd">fichier</A>',
    '<DT><A HREF="data:text/html,<script>alert(1)</script>">data</A>', '<DT><A HREF="chrome://settings">chrome</A>', '<DT><A HREF="orbe://app/settings.html">orbe</A>',
    '<DT><A HREF="vbscript:x">vb</A>', '<DT><A HREF="https://utilisateur:secret@exemple.org/">identifiants</A>', '<DT><A HREF="  ">vide</A>', '<DT><A>sans adresse</A>',
    '<DT><A HREF="https://bon.exemple/">Bon <script>alert(1)</script><img src=x onerror=alert(2)> titre</A>',
    '<DT><H3>Dossier <b onclick="x()">piégé</b>&#0;&#x202e;</H3><DL><p><DT><A HREF="http://dedans.exemple/a?b=1&amp;c=2">Dedans</A></DL><p>',
    '<script>document.write(\'<DT><A HREF="https://injecte.exemple/">x</A>\')</script>',
    `<DT><A HREF="https://long.exemple/${'a'.repeat(3000)}">trop long</A>`, `<DT><A HREF="https://titre.exemple/">${'T'.repeat(1000)}</A>`,
  ].join('\n') + '\n</DL>');
  const flat = (nodes) => nodes.flatMap((n) => (n.type === 'folder' ? flat(n.children) : [n]));
  const urls = flat(hostile.nodes).map((n) => n.url);
  const titles = JSON.stringify(hostile.nodes);
  check('fichier piégé : seules les adresses http(s) sans identifiants sont reprises',
    urls.every((u) => /^https?:\/\/[^@]+$/.test(u)) && urls.includes('https://bon.exemple/') && urls.includes('http://dedans.exemple/a?b=1&c=2') && !urls.some((u) => /passwd|secret|settings|long\.exemple/.test(u)) && hostile.dropped >= 10,
    urls.join(' ') + ' / écartés : ' + hostile.dropped);
  check('fichier piégé : aucune balise ni attribut ne survit dans les titres, longueurs bornées',
    !/[<>]|onerror|onclick/.test(titles.replace(/alert\(\d\)/g, '')) && flat(hostile.nodes).every((n) => n.title.length <= 200) && hostile.nodes.some((n) => n.type === 'folder' && n.name === 'Dossier piégé'), titles.slice(0, 300));

  const depth = (nodes) => nodes.reduce((m, n) => Math.max(m, n.type === 'folder' ? 1 + depth(n.children) : 0), 0);
  const deep = bm.parse(head + Array.from({ length: 60 }, (_, i) => `<DT><H3>n${i}</H3><DL><p><DT><A HREF="https://niveau.exemple/${i}">n${i}</A>`).join('') + '</DL>'.repeat(60) + '</DL>');
  check('imbrication profonde : aplatie à huit niveaux, sans perdre un signet', depth(deep.nodes) === bm.MAX_DEPTH && deep.bookmarks === 60, depth(deep.nodes) + ' niveaux, ' + deep.bookmarks);
  let t0 = Date.now();
  const many = bm.parse(head + Array.from({ length: 8000 }, (_, i) => `<DT><A HREF="https://n.exemple/${i}">n${i}</A>`).join('\n') + '</DL>');
  const junk = [bm.parse(head + '<a '.repeat(700000)), bm.parse(head + '<DT><H3>'.repeat(400000)), bm.parse(head + '<DT><A HREF="https://x.exemple/">'.repeat(200000)), bm.parse('<'.repeat(2000000))];
  const spent = Date.now() - t0;
  check('fichier démesuré : nombre de signets plafonné, temps d’analyse borné', many.bookmarks === bm.MAX_BOOKMARKS && many.truncated && junk.every((x) => x.bookmarks <= bm.MAX_BOOKMARKS) && spent < 6000, `${many.bookmarks} signets, ${spent} ms`);
  const big = path.join(tmp, 'gros.html');
  fs.writeFileSync(big, head + ' '.repeat(bm.MAX_BYTES + 10));
  const notBm = path.join(tmp, 'page.html');
  fs.writeFileSync(notBm, '<!doctype html><title>Page</title><a href="https://exemple.org/">lien</a>');
  check('fichier trop gros, absent ou qui n’est pas un export de signets : refusé',
    bm.read(big).error === 'tooBig' && bm.read(path.join(tmp, 'absent.html')).error === 'unreadable' && bm.read(tmp).error === 'unreadable' && bm.read(notBm).error === 'notBookmarks');

  // Import complet, comme depuis le volet Import (dialogues remplacés).
  const realOpen = dialog.showOpenDialog;
  const realBox = dialog.showMessageBox;
  const boxes = [];
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture('chrome')] });
  dialog.showMessageBox = async (...args) => { boxes.push(args[args.length - 1]); return { response: 0 }; };
  const spacesBefore = w.data.spaces.length;
  const tabsBefore = Object.keys(w.data.tabs).length;
  const done = await panes.importBookmarks(null, { profileId: pid });
  const made = w.data.spaces.find((x) => x.id === done.space);
  const pinnedOutline = (nodes) => nodes.map((n) => (n.type === 'folder' ? `[${n.name}:${pinnedOutline(n.children)}]` : w.data.tabs[n.id].title)).join(',');
  check('import de signets : un nouvel Espace du profil choisi, dossiers et onglets épinglés',
    done.ok && done.bookmarks === 7 && w.data.spaces.length === spacesBefore + 1 && made.profileId === pid && made.today.length === 0
    && pinnedOutline(made.pinned) === outline(chrome.nodes) && Object.keys(w.data.tabs).length === tabsBefore + 7
    && w.data.tabs[made.pinned[0].id].homeUrl === 'https://www.wikipedia.org/' && w.spaceId === made.id && boxes.length === 1 && /7/.test(boxes[0].detail), JSON.stringify(done));
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [notBm] });
  const refused = await panes.importBookmarks(null, {});
  dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  const cancelled = await panes.importBookmarks(null, {});
  check('import de signets : fichier refusé ou choix annulé, rien n’est ajouté', refused.error === 'notBookmarks' && cancelled.canceled && w.data.spaces.length === spacesBefore + 1 && boxes.length === 2);
  dialog.showOpenDialog = realOpen;
  dialog.showMessageBox = realBox;
  w.switchSpace(home);
  const drop = (nodes) => { for (const n of nodes) { if (n.type === 'folder') drop(n.children); else delete w.data.tabs[n.id]; } };
  drop(made.pinned);
  w.data.spaces.splice(w.data.spaces.indexOf(made), 1);

  // --- Fenêtre des réglages -----------------------------------------------------------
  store.state.window.settingsPane = 'general';
  const sw = openSettings();
  const js = (code) => sw.webContents.executeJavaScript(code);
  await until(() => sw.isVisible(), 'fenêtre des réglages affichée');
  await until(async () => (await js('document.querySelectorAll("#profiles .profile").length')) === w.data.profiles.length, 'profils listés');
  const struct = await js(`JSON.stringify({
    tabs: [...document.querySelectorAll('#tabs [role=tab]')].map((b) => b.dataset.pane + ':' + b.textContent.trim()),
    shown: [...document.querySelectorAll('.pane')].filter((p) => !p.hidden).map((p) => p.id),
    selected: document.querySelector('#tabs [aria-selected=true]').dataset.pane,
    missing: FIELDS.filter((f) => !document.getElementById(f)),
    ghosts: [...document.querySelectorAll('[hidden]')].filter((e) => e.getClientRects().length).map((e) => e.id),
    overflow: document.documentElement.scrollWidth > innerWidth,
    defaut: [document.getElementById('defaultState').textContent, document.getElementById('makeDefault').hidden],
    scroll: document.getElementById('panes').scrollHeight - document.getElementById('panes').clientHeight,
  })`).then(JSON.parse);
  check('fenêtre des réglages : dix volets, un seul affiché, tous les réglages présents',
    struct.tabs.length === 10 && struct.tabs[0] === 'general:Général' && struct.tabs[2] === 'tabs:Onglets' && struct.tabs[4] === 'shortcuts:Raccourcis' && struct.shown.join() === 'pane-general' && struct.selected === 'general'
    && !struct.missing.length && !struct.ghosts.length && !struct.overflow, JSON.stringify(struct));
  const isDefault = panes.isDefaultBrowser();
  check('navigateur par défaut : l’état est affiché, le bouton n’apparaît que s’il reste à faire',
    struct.defaut[0] === store.t(isDefault ? 'set.defaultYes' : 'set.defaultNo') && struct.defaut[1] === isDefault, JSON.stringify(struct.defaut));
  const hGeneral = sw.getContentSize();
  // Petit écran (machines d'intégration) : la fenêtre s'arrête au bord de l'écran, le volet défile.
  const roomy = require('electron').screen.getDisplayMatching(sw.getBounds()).workAreaSize.height - 60 > hGeneral[1];
  check('la fenêtre a la hauteur de son volet : rien à faire défiler', hGeneral[0] === panes.WIDTH && (roomy ? struct.scroll <= 0 : struct.scroll > 0), JSON.stringify([hGeneral, struct.scroll, roomy]));
  await js('document.querySelector(\'#tabs [data-pane="extensions"]\').click()');
  await until(() => sw.getContentSize()[1] < hGeneral[1] - 100, 'fenêtre réduite au volet Extensions');
  await until(async () => (await js('document.getElementById("panes").scrollHeight - document.getElementById("panes").clientHeight')) <= 0, 'hauteur ajustée');
  check('changer de volet : la hauteur de la fenêtre suit, le volet est mémorisé', store.state.window.settingsPane === 'extensions' && (await js('[...document.querySelectorAll(".pane")].filter((p) => !p.hidden).map((p) => p.id).join()')) === 'pane-extensions');
  if (process.env.ORBE_SHOTS) {
    for (const pane of panes.PANES) {
      await js(`document.querySelector('#tabs [data-pane="${pane}"]').click()`);
      await sleep(700);
      fs.writeFileSync(path.join(process.env.ORBE_SHOTS, `reglages-${pane}.png`), (await sw.webContents.capturePage()).toPNG());
    }
    await js('document.querySelector(\'#tabs [data-pane="extensions"]\').click()');
  }
  // Enregistrement d'une touche : traduction d'un événement clavier en accélérateur.
  const ev = (o) => js(`(() => { const r = accelOf(${JSON.stringify(o)}); return r ? r.accel : null; })()`);
  const combos = [
    await ev({ key: 'k', code: 'KeyK', ctrlKey: true, shiftKey: true }),
    await ev({ key: 'a', code: 'KeyQ', ctrlKey: true }), // AZERTY : la lettre produite, pas la position
    await ev({ key: '†', code: 'KeyT', altKey: true, ctrlKey: true }), // ⌥ change le caractère : position de la touche
    await ev({ key: '@', code: 'Digit2', shiftKey: true, ctrlKey: true }),
    await ev({ key: 'ArrowLeft', code: 'ArrowLeft', ctrlKey: true, altKey: true }),
    await ev({ key: 'F5', code: 'F5' }),
    await ev({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }),
    await ev({ key: 'Meta', code: 'MetaLeft', metaKey: true }),
  ];
  check('enregistrement : l’événement clavier donne le bon accélérateur (AZERTY, ⌥, chiffres, flèches, touches seules)',
    combos.join('|') === 'Ctrl+Shift+K|Ctrl+A|Ctrl+Alt+T|Ctrl+Shift+2|Ctrl+Alt+Left|F5||', combos.join('|'));
  sw.close();
  await until(() => sw.isDestroyed(), 'fenêtre fermée');
  const sw3 = openSettings();
  await until(async () => sw3.isVisible() && (await sw3.webContents.executeJavaScript('(document.querySelector("#tabs [aria-selected=true]") || {dataset:{}}).dataset.pane')) === 'extensions', 'dernier volet rouvert');
  // Sans attendre la réponse : Échap ferme la fenêtre, qui peut être détruite avant
  // d'avoir répondu — la promesse n'était alors jamais réglée (essai bloqué).
  sw3.webContents.executeJavaScript('window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); 1').catch(() => {});
  await until(() => sw3.isDestroyed(), 'fermeture par Échap');
  check('la fenêtre rouvre sur le dernier volet ; Échap la ferme', true);
  store.state.window.settingsPane = 'general';

  // --- Ménage -----------------------------------------------------------------------
  w.switchSpace(home);
  w.close(ext, { silent: true });
  if (w.data.tabs[stale2.id]) w.close(stale2.id, { silent: true });
  for (const space of [s2, sp]) {
    for (const id of [...space.today]) { OrbeWindow.destroyView(id); delete w.data.tabs[id]; }
    w.data.spaces.splice(w.data.spaces.indexOf(space), 1);
  }
  store.state.profiles.splice(store.state.profiles.findIndex((p) => p.id === pid), 1);
  delete store.state.favs[pid];
  store.state.downloads = store.state.downloads.filter((d) => d.name !== 'reglages-essai.txt');
  store.state.archive = store.state.archive.filter((a) => !a.url.startsWith(base) && !a.url.startsWith('http://127.0.0.1:9/'));
  const after = s();
  const drift = Object.keys(before).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  check('après ces essais, tous les réglages ont retrouvé leur valeur', !drift.length, drift.join(', '));
  w.layout();
  OrbeWindow.pushAll();
  menu.refresh(true);
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!ctx.check && failed) throw new Error(`${failed} vérification(s) en échec`);
};
