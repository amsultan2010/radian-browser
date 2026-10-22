// Vue scindée, petite fenêtre, aperçu, Boosts, menus de page et raccourcis divers.
// Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/fenetres.js node scripts/dev.js --selftest
const http = require('http');
const { clipboard, Menu } = require('electron');

const { sleep, until, milieu, ignorer, profilPret } = require('./outils');

function serve() {
  const page = (title, body) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px sans-serif;margin:0;padding:40px">${body}</body>`;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    const m = /^\/p\/(\w+)$/.exec(url.pathname);
    if (m) return res.end(page('Page ' + m[1], `<h1>${m[1]}</h1><p class="texte">orbe</p>`));
    if (url.pathname === '/liens') return res.end(page('Liens', `<a id="lien" href="/p/cible" style="position:fixed;left:0;top:0;width:300px;height:120px;background:#def;display:block">vers la cible</a><input id="champ" style="position:fixed;left:0;top:200px">`));
    if (url.pathname === '/boost') return res.end(page('Boost', '<h1 id="t">Titre</h1><p class="pub">publicité</p><p id="reste">reste</p><iframe id="cadre" src="/p/cadre" style="width:200px;height:80px"></iframe>'));
    if (url.pathname === '/video') return res.end(page('Vidéo', `<video id="v" style="position:fixed;left:0;top:0;width:320px;height:180px;background:#000" playsinline muted></video><script>
      window.start = async () => {
        const c = document.createElement('canvas'); c.width = 320; c.height = 180;
        const g = c.getContext('2d'); let n = 0;
        setInterval(() => { g.fillStyle = 'hsl(' + (n++ % 360) + ' 70% 50%)'; g.fillRect(0, 0, 320, 180); }, 40);
        const v = document.getElementById('v'); v.srcObject = c.captureStream(25); await v.play(); return true;
      };
    </script>`));
    res.statusCode = 404;
    return res.end(page('404', 'introuvable'));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

module.exports = async function fenetresTests(ctx) {
  const { first: w, store, win, little, commands, openUrl } = ctx;
  let failed = 0;
  const check = ctx.check || ((name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`); });
  const ui = (js) => w.ui.webContents.executeJavaScript(js);
  const d = w.data;
  const t = (k, v) => store.t(k, null, v);
  const labels = (tpl) => tpl.filter((x) => x.type !== 'separator' && x.visible !== false).map((x) => x.label);
  const item = (tpl, key, vars) => tpl.find((x) => x.label === t(key, vars));

  await until(() => ui('typeof S === "object" && S !== null'), 'coque chargée', 20000);
  const env = await milieu(w);
  await profilPret(w);
  const server = await serve();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const home = w.spaceId;
  const space = store.makeSpace('Fenêtres', '🪟', '#22c55e');
  d.spaces.push(space);
  w.switchSpace(space.id);
  const open = async (path, title) => {
    const tab = w.newTab(base + path);
    await until(() => d.tabs[tab.id] && d.tabs[tab.id].title === title && !win.live.get(tab.id).loading, 'page ' + path, 15000);
    return tab.id;
  };
  const bounds = (id) => win.live.get(id).view.getBounds();
  const panes = () => w.paneRects(w.contentRect(), w.visibleIds());
  console.log('\nVue scindée, petite fenêtre, aperçu, Boosts\n');

  // === Vue scindée ===========================================================
  const A = await open('/p/a', 'Page a');
  const B = await open('/p/b', 'Page b');
  const C = await open('/p/c', 'Page c');
  w.splitWith(A, B);
  w.splitWith(B, C);
  await sleep(150);
  {
    const ps = panes();
    check('vue scindée à trois volets : chaque page sous la petite barre de son volet',
      w.visibleIds().join() === [A, B, C].join() && ps.every((p, i) => p.bar === win.SPLIT_BAR && bounds(w.visibleIds()[i]).y === p.y + p.bar && bounds(w.visibleIds()[i]).height === p.height - p.bar && bounds(w.visibleIds()[i]).x === p.x),
      JSON.stringify([ps, [A, B, C].map(bounds)]));
    await until(() => ui('document.querySelectorAll("#pane-bars .pane-bar").length === 3'), 'trois petites barres');
    const bars = await ui(`[...document.querySelectorAll('#pane-bars .pane-bar')].map((b) => ({ id: b.dataset.pane, actif: b.classList.contains('active'), texte: b.querySelector('.pane-text').textContent, x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth }))`);
    check('petite barre de chaque volet : son adresse, à sa place', bars.map((b) => b.id).join() === [A, B, C].join() && bars.every((b, i) => b.x === ps[i].x && b.y === ps[i].y && b.w === ps[i].width && b.texte.includes('/p/' + 'abc'[i])), JSON.stringify(bars));
    await until(() => ui(`document.querySelector('#pane-bars .pane-bar.active') && document.querySelector('#pane-bars .pane-bar.active').dataset.pane === ${JSON.stringify(w.activeId)}`), 'barre du volet actif');
    const ring = await ui(`(() => { const r = document.getElementById('pane-ring'); return { on: r.classList.contains('on'), x: r.offsetLeft, y: r.offsetTop, w: r.offsetWidth, h: r.offsetHeight }; })()`);
    const act = ps[w.visibleIds().indexOf(w.activeId)];
    check('le volet actif se distingue : barre marquée et liseré autour de lui', ring.on && ring.x === act.x && ring.y === act.y && ring.w === act.width && ring.h === act.height, JSON.stringify([ring, act]));
  }

  w.activate(A);
  w.run('nextPane');
  const n1 = w.activeId;
  w.run('nextPane');
  const n2 = w.activeId;
  w.run('nextPane');
  const n3 = w.activeId;
  w.run('prevPane');
  check('⌃⇧] / ⌃⇧[ : volet suivant et précédent, en boucle', n1 === B && n2 === C && n3 === A && w.activeId === C, [n1, n2, n3, w.activeId].join());
  await until(() => ui(`document.querySelector('#pane-bars .pane-bar.active').dataset.pane === ${JSON.stringify(C)}`), 'liseré sur le volet atteint');
  check('⌃⇧] et ⌃⇧[ figurent parmi les raccourcis modifiables', ['nextPane', 'prevPane', 'expandSplit', 'separateAll'].every((n) => require('../src/main/shortcuts').list().some((g) => g.items.some((x) => x.name === n))));

  // Déplacer un volet, parts conservées
  w.activate(A);
  w.resizeSplit(0, panes()[0].x + panes()[0].width + 4 + 90);
  const wide = panes()[0].width;
  check('déplacer un volet : il change de place avec son voisin et garde sa largeur', w.movePane(A, 1) && w.visibleIds().join() === [B, A, C].join() && Math.abs(panes()[1].width - wide) <= 1 && bounds(A).x > bounds(B).x, JSON.stringify(panes()));
  check('déplacer un volet : rien au bout de la rangée', w.movePane(C, 1) === false && w.movePane(B, -1) === false);
  w.movePane(A, -1);

  // Parts conservées au redémarrage (SCI-8)
  {
    const ratios = [...w.groupOf(A).ratios];
    const reread = store.normalize(JSON.parse(JSON.stringify(store.packSplits(store.state))));
    const sp = reread.spaces.find((x) => x.id === space.id);
    check('tailles des volets conservées au redémarrage', sp.splits.length === 1 && Array.isArray(sp.splits[0].ratios) && sp.splits[0].ratios.every((r, i) => Math.abs(r - ratios[i]) < 1e-9), JSON.stringify([ratios, sp.splits[0].ratios, sp.splitRatios]));
    const broken = JSON.parse(JSON.stringify(store.state));
    broken.spaces.find((x) => x.id === space.id).splitRatios = { [A]: [5, 'x', -1] };
    check('parts illisibles dans le fichier : ignorées (parts égales)', !store.normalize(broken).spaces.find((x) => x.id === space.id).splits[0].ratios);
  }

  // Agrandir le volet actif (« Expand Current Split »)
  w.activate(B);
  w.run('expandSplit');
  const big = panes().map((p) => p.width);
  w.run('expandSplit');
  const even = panes().map((p) => p.width);
  check('« Agrandir ce volet » : le volet actif prend la place, une seconde fois les parts redeviennent égales', big[1] > big[0] * 3 && big[1] > big[2] * 3 && Math.abs(even[0] - even[1]) <= 1 && Math.abs(even[1] - even[2]) <= 1, JSON.stringify([big, even]));

  // Sens conservé quand le premier volet s'en va
  w.run('splitDirection');
  check('vue empilée : la barre de chaque volet reste au-dessus de sa page', w.isVertical(w.groupOf(A)) && panes().every((p, i) => bounds(w.visibleIds()[i]).y === p.y + p.bar) && bounds(B).y > bounds(A).y);
  w.closeSplitPane(A);
  check('fermer le premier volet d’une vue empilée : les autres restent empilés', w.visibleIds().join() === [B, C].join() && w.isVertical(w.groupOf(B)) && bounds(C).y > bounds(B).y && !!d.tabs[A]);
  w.run('splitDirection');
  w.splitWith(B, A, true, true);
  w.layout();
  check('nouveau volet placé avant un autre', w.visibleIds().join() === [A, B, C].join());

  // Menu de la petite barre
  {
    const tpl = w.paneMenuTemplate(B);
    check('menu d’un volet : copier l’adresse, actualiser, déplacer, agrandir, empiler, séparer, fermer',
      labels(tpl).join('|') === ['edit.copyUrl', 'ctx.reload', 'tabs.duplicate', 'tabs.mute', 'pane.moveLeft', 'pane.moveRight', 'view.expandSplit', 'pane.stacked', 'view.separateSplit', 'tabs.separateAll', 'view.closeSplit'].map((k) => t(k)).join('|'), labels(tpl).join('|'));
    item(tpl, 'pane.moveRight').click();
    check('menu d’un volet : « Déplacer vers la droite »', w.visibleIds().join() === [A, C, B].join());
    item(w.paneMenuTemplate(B), 'pane.moveLeft').click();
    item(w.paneMenuTemplate(B), 'pane.stacked').click();
    const stacked = w.isVertical(w.groupOf(B));
    check('menu d’un volet, vue empilée : « vers le haut », « vers le bas », « côte à côte »', stacked && [t('pane.moveUp'), t('pane.moveDown'), t('pane.sideBySide')].every((l) => labels(w.paneMenuTemplate(B)).includes(l)));
    item(w.paneMenuTemplate(B), 'pane.sideBySide').click();
    check('une page seule n’a pas de menu de volet', w.paneMenuTemplate('inconnu').length === 0);
  }

  // Petite barre : adresse (⌘L du volet), fermeture
  w.activate(A);
  await w.handle('paneEdit', C);
  check('clic sur l’adresse d’un volet : il devient actif et son adresse se modifie', w.activeId === C && w.modalMode === 'command' && w.commandMode === 'edit');
  w.runItem({ url: base + '/p/d' });
  await until(() => d.tabs[C].title === 'Page d', 'le volet a suivi la nouvelle adresse');
  check('⌘L en vue scindée : seule l’adresse du volet actif change', d.tabs[A].url === base + '/p/a' && d.tabs[B].url === base + '/p/b' && d.tabs[C].url === base + '/p/d' && w.visibleIds().length === 3);
  await w.handle('paneClose', B);
  check('« × » d’un volet : il quitte la vue scindée, son onglet reste ouvert', w.visibleIds().join() === [A, C].join() && !!d.tabs[B] && space.today.includes(B) && w.activeId === C);
  check('messages de la barre d’un volet : identifiant inconnu ou non affiché ignoré', w.handle('paneClose', 'nimporte') === undefined && w.handle('paneMenu', B) === undefined && w.handle('paneEdit', B) === undefined && w.visibleIds().length === 2);

  // Dépôt d'un onglet sur un côté d'un volet
  {
    const ps = panes();
    const left = { x: ps[0].x + 20, y: ps[0].y + ps[0].height / 2 };
    const tgt = w.dropTargetAt(left.x, left.y);
    check('glisser un onglet : la moitié gauche d’un volet vise la place avant lui, la droite la place après', tgt.id === A && tgt.before === true && tgt.zone.x === 0 && tgt.zone.w === Math.round(ps[0].width / 2) && w.dropTargetAt(ps[1].x + ps[1].width - 10, left.y).before === false && w.dropTargetAt(ps[1].x + ps[1].width - 10, left.y).id === C, JSON.stringify(tgt));
    w.dragZone(true);
    await until(() => w.dropView && !w.dropView.webContents.isLoading() && w.dropView.webContents.executeJavaScript('!document.getElementById("drop").hidden'), 'zone de dépôt');
    w.handle('dragZoneOver', left);
    await until(() => w.dropView.webContents.executeJavaScript(`(() => { const l = document.getElementById('drop-label'); return document.getElementById('drop').classList.contains('over') && l.style.left === '6px' && l.style.width === '${Math.round(ps[0].width / 2) - 12}px'; })()`), 'côté gauche éclairé');
    check('glisser un onglet : la zone de dépôt éclaire le côté visé', true);
    w.handle('dropSplit', { id: B, x: left.x, y: left.y });
    check('lâcher un onglet sur le bord gauche d’un volet : il se place avant lui', w.visibleIds().join() === [B, A, C].join() && w.activeId === B, w.visibleIds().join());
    const now = panes();
    w.handle('dropSplit', { id: B, x: now[2].x + now[2].width - 10, y: left.y });
    check('lâcher un volet de la vue scindée sur un autre bord : il change seulement de place', w.visibleIds().join() === [A, C, B].join() && w.splits.filter((g) => g.includes(B)).length === 1);
    const E = w.createTab('http://127.0.0.1:9/e', { space }).id;
    const F = w.createTab('http://127.0.0.1:9/f', { space }).id;
    w.handle('dropSplit', { id: E, x: now[0].x + 10, y: left.y });
    const toasts = [];
    const toast = w.toast;
    w.toast = (text) => toasts.push(text);
    w.handle('dropSplit', { id: F, x: now[0].x + 10, y: left.y });
    w.toast = toast;
    check('cinquième volet refusé, avec un message', w.visibleIds().length === 4 && !w.groupOf(F) && toasts.join() === t('toast.splitMax'), JSON.stringify([w.visibleIds().length, toasts]));
    w.closeSplitPane(E);
    for (const id of [E, F]) w.close(id, { silent: true, ask: false });
    w.layout();
  }

  // ⌥clic sur un onglet de la barre latérale ; ⌥⌘clic : petite fenêtre
  {
    w.separateAll(A);
    check('« Séparer tous les onglets » : chaque page redevient un onglet', w.splits.every((g) => !g.includes(A)) && w.visibleIds().length === 1 && [A, B, C].every((id) => space.today.includes(id)));
    w.activate(A);
    await until(() => ui(`!!document.querySelector('#today .row.tab[data-id="${B}"]') && !document.querySelector('#pane-bars .pane-bar')`), 'lignes de la barre');
    await ui(`document.querySelector('#today .row.tab[data-id="${B}"]').dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }))`);
    await until(() => w.visibleIds().join() === [A, B].join(), '⌥clic : vue scindée');
    check('⌥clic sur un onglet de la barre latérale : vue scindée avec la page affichée', w.groupOf(A).join() === [A, B].join() && w.activeId === B);
    const before = little.LittleWindow.all.length;
    const meta = process.platform === 'darwin' ? 'metaKey' : 'ctrlKey';
    await until(() => ui(`!!document.querySelector('#today .row.tab[data-id="${C}"]')`), 'ligne C');
    await ui(`document.querySelector('#today .row.tab[data-id="${C}"]').dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true, ${meta}: true }))`);
    await until(() => little.LittleWindow.all.length === before + 1, '⌥⌘clic : petite fenêtre');
    const lw = little.LittleWindow.all[little.LittleWindow.all.length - 1];
    check('⌥⌘clic sur un onglet de la barre latérale : sa page dans une petite fenêtre, l’onglet reste', lw.url === d.tabs[C].url && space.today.includes(C) && w.visibleIds().join() === [A, B].join());
    lw.win.close();
    w.run('separateSplit');
    check('« Séparer la page de la vue scindée » : la page affichée reste seule', w.visibleIds().join() === [B].join() && !w.groupOf(A));
  }

  // Message au-dessus du volet concerné
  {
    w.splitWith(A, B);
    w.activate(B);
    w.toast('essai');
    await until(() => w.toastView && w.win.contentView.children.includes(w.toastView) && w.toastView.getBounds().width > 0, 'message affiché');
    const tb = w.toastView.getBounds();
    const pb = bounds(B);
    check('message affiché au-dessus du volet actif, pas à cheval sur les deux', tb.x >= pb.x && tb.x + tb.width <= pb.x + pb.width && tb.y >= pb.y && tb.y < pb.y + 40, JSON.stringify([tb, pb]));
    w.activate(A);
    w.toast('essai');
    await sleep(60);
    const ta = w.toastView.getBounds();
    check('le message suit le volet actif', ta.x >= bounds(A).x && ta.x + ta.width <= bounds(A).x + bounds(A).width, JSON.stringify([ta, bounds(A)]));
    w.separateAll(A);
  }

  // ⌥clic sur un lien de la page : vue scindée
  {
    const L = await open('/liens', 'Liens');
    const rt = win.live.get(L);
    const wc = rt.wc;
    const key = (type, on) => wc.sendInputEvent({ type, keyCode: 'Alt', modifiers: on ? ['alt'] : [] });
    const mouse = (type, extra = {}) => wc.sendInputEvent({ type, x: 60, y: 50, button: 'left', clickCount: 1, ...extra });
    wc.focus();
    mouse('mouseMove', { button: undefined });
    await sleep(60);
    mouse('mouseMove', { x: 70, y: 60, button: undefined });
    let hovered = true;
    try { await until(() => rt.hoverUrl === base + '/p/cible', 'lien survolé', 4000); } catch { hovered = false; }
    if (!hovered) {
      // Écran inactif : le moteur ne signale pas le lien survolé. Le reste du chemin est essayé tel quel.
      if (env.vivant) check('⌥clic sur un lien : le moteur signale le lien survolé', false, String(rt.hoverUrl));
      else ignorer('⌥clic sur un lien : survol signalé par le moteur', env.raison);
      rt.hoverUrl = base + '/p/cible';
    }
    key('keyDown', true);
    await until(() => rt.alt === true, '⌥ vue par Orbe');
    const count = space.today.length;
    mouse('mouseDown');
    mouse('mouseUp');
    await until(() => space.today.length === count + 1 && w.visibleIds().length === 2, 'lien ouvert en vue scindée');
    key('keyUp', false);
    const N = w.visibleIds()[1];
    await until(() => d.tabs[N].title === 'Page cible', 'page du lien chargée');
    check('⌥clic sur un lien : il s’ouvre dans un nouveau volet, à droite de la page', w.visibleIds()[0] === L && d.tabs[N].url === base + '/p/cible' && w.activeId === N && d.tabs[L].url === base + '/liens');
    check('⌥clic sur un lien : rien n’est téléchargé, la page d’origine ne reçoit pas le clic', !store.state.downloads.some((x) => String(x.url || '').includes('/p/cible')) && await wc.executeJavaScript('location.pathname') === '/liens');
    // Sans ⌥ : le clic suit le lien normalement.
    w.closeSplitPane(N);
    w.close(N, { silent: true, ask: false });
    w.activate(L);
    await sleep(80);
    wc.focus();
    mouse('mouseMove', { button: undefined });
    mouse('mouseDown');
    mouse('mouseUp');
    await until(() => d.tabs[L].title === 'Page cible', 'clic ordinaire : lien suivi');
    check('sans ⌥, le clic suit le lien dans la page', w.visibleIds().length === 1 && d.tabs[L].url === base + '/p/cible');
    check('adresse survolée venue d’ailleurs que du Web : ⌥clic sans effet', w.splitLink(L, 'file:///etc/passwd') === undefined && w.splitLink(L, 'orbe://app/settings.html') === undefined && w.splitLink('inconnu', base + '/p/a') === undefined && w.visibleIds().length === 1);
    w.close(L, { silent: true, ask: false });
  }


  // === Boosts ================================================================
  {
    const boosts = require('../src/main/boosts');
    const editor = require('../src/main/boost-editor');
    const { dialog } = require('electron');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const host = boosts.hostOf(base);
    const set = (patch) => { store.state.settings = { ...store.state.settings, ...patch }; };
    const T = await open('/boost', 'Boost');
    const wc = win.live.get(T).wc;
    const js = (code) => wc.executeJavaScript(code);
    const reload = async () => {
      const n = wc.navigationHistory.length();
      wc.reload();
      await sleep(50);
      await until(() => !win.live.get(T).loading && js('document.readyState === "complete" && !!document.getElementById("reste")').catch(() => false), 'page rechargée', 15000);
      await sleep(120);
      return n;
    };

    // Apparence : couleur, luminosité inversée, curseurs, police, taille, casse
    boosts.set(host, { look: { color: '#1F2937', invert: true, contrast: 120, brightness: 90, saturation: 150, font: 'serif', size: 120, case: 'upper' } });
    await boosts.apply(wc);
    const seen = await js(`(() => { const h = getComputedStyle(document.documentElement); const b = getComputedStyle(document.body); const p = getComputedStyle(document.getElementById('reste')); return { filter: h.filter, zoom: h.zoom, bg: b.backgroundColor, ink: p.color, font: p.fontFamily, cas: p.textTransform }; })()`);
    check('Boost, apparence : couleur du nuancier (fond, texte lisible dessus)', seen.bg === 'rgb(31, 41, 55)' && seen.ink === 'rgb(255, 255, 255)', JSON.stringify(seen));
    check('Boost, apparence : luminosité inversée, contraste, luminosité, saturation', /invert\(1\)/.test(seen.filter) && /contrast\(1\.2\)/.test(seen.filter) && /brightness\(0\.9\)/.test(seen.filter) && /saturate\(1\.5\)/.test(seen.filter), seen.filter);
    check('Boost, texte : police prête, taille en pourcentage, casse', /Georgia/.test(seen.font) && seen.zoom === '1.2' && seen.cas === 'uppercase', JSON.stringify(seen));
    boosts.set(host, { look: {} });
    await boosts.apply(wc);
    check('Boost : apparence remise à zéro, le Boost vide disparaît', await js('getComputedStyle(document.documentElement).filter') === 'none' && !boosts.has(host));
    const junk = boosts.cleanLook({ color: 'red;} body{display:none', invert: 'oui', contrast: 9999, brightness: 'x', saturation: -5, font: 'serif; } * { display: none', size: 10, case: 'upper } html { x' });
    const junkCss = boosts.lookCss({ color: 'red;} body{display:none', font: 'x', size: '1e9', case: '}' });
    check('Boost, apparence : toute valeur hors liste ou hors bornes est ramenée à une valeur permise', JSON.stringify(junk) === JSON.stringify({ color: '', invert: false, contrast: 150, brightness: 100, saturation: 0, font: '', size: 90, case: '' }) && junkCss === 'html { zoom: 1.5 !important; }\n', JSON.stringify([junk, junkCss]));

    // Sélecteurs de Zap : vérifiés, une règle chacun
    const good = ['div.a > p:nth-of-type(2)', '#x\\:y', 'a[href="x,y{}"]'.replace('{}', ''), ':is(a, b)', 'p.pub'];
    const bad = ['a{}', 'a, b', 'a;b', '@import url(x)', 'a[', "a['", 'a)', '', ' a', 'a/*', 'a\nb', 'x'.repeat(501), 'a\\', 'a } body { display: none', '</style><script>', 12, null];
    check('Zap : sélecteurs acceptés et refusés', good.every(boosts.validSelector) && !bad.some(boosts.validSelector), JSON.stringify([good.filter((x) => !boosts.validSelector(x)), bad.filter(boosts.validSelector)]));
    boosts.set(host, { zaps: ['a } body { display: none', ':pseudo-inconnu', '.pub', '.pub', 42] });
    await boosts.apply(wc);
    check('Zap : sélecteur piégé écarté, doublon retiré ; un sélecteur que le moteur refuse n’empêche pas les autres', boosts.get(host).zaps.join('|') === ':pseudo-inconnu|.pub' && await js('getComputedStyle(document.querySelector(".pub")).display + "|" + getComputedStyle(document.body).display') === 'none|block');
    boosts.set(host, { zaps: [] });
    await boosts.apply(wc);
    // Zap à la souris : le sélecteur est fabriqué dans la page, vérifié ici
    const picking = boosts.zap(wc, host);
    await until(() => js('[...document.documentElement.children].some((n) => n.tagName === "DIV" && n.style.zIndex === "2147483647")'), 'sélecteur d’élément actif');
    const at = await js('(() => { const r = document.querySelector(".pub").getBoundingClientRect(); return { x: Math.round(r.left + 20), y: Math.round(r.top + r.height / 2) }; })()');
    w.activate(T);
    wc.focus();
    wc.sendInputEvent({ type: 'mouseMove', x: at.x - 4, y: at.y });
    await sleep(60);
    wc.sendInputEvent({ type: 'mouseMove', x: at.x, y: at.y });
    await sleep(60);
    // (Un clic envoyé par Electron juste après que la page a pris le clavier peut se perdre — relevé
    // aussi sur la branche principale, jamais avec une vraie souris : il est renvoyé tant que rien n'est choisi.)
    let picked = null;
    for (let i = 0; i < 12 && picked === null; i++) {
      wc.sendInputEvent({ type: 'mouseDown', x: at.x, y: at.y, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x: at.x, y: at.y, button: 'left', clickCount: 1 });
      picked = await Promise.race([picking, sleep(400).then(() => null)]);
    }
    check('Zap : cliquer un élément le masque ; le retirer de la liste le rétablit', picked === 'body > p.pub' && await js('getComputedStyle(document.querySelector(".pub")).display') === 'none', String(picked));
    boosts.set(host, { zaps: [] });
    await boosts.apply(wc);
    check('Zap rétabli', await js('getComputedStyle(document.querySelector(".pub")).display') === 'block');
    check('Zap : rien n’est rangé pour un autre site que celui affiché', await boosts.zap(wc, 'autre.example') === null);

    // JavaScript : coupé par défaut, trois accords, page seulement
    const script = 'document.documentElement.dataset.boost = [typeof window.orbe, typeof require, typeof process, window.top === window, location.host].join("|"); window.__boostRuns = (window.__boostRuns || 0) + 1;';
    boosts.set(host, { js: script, jsOn: true });
    const runs0 = boosts.ran.count;
    await reload();
    check('JavaScript d’un Boost : rien ne s’exécute tant que le réglage général est coupé (défaut)', store.state.settings.boostsJs === false && boosts.ran.count === runs0 && await js('document.documentElement.dataset.boost') === undefined);
    set({ boostsJs: true });
    await reload();
    await until(() => js('!!document.documentElement.dataset.boost'), 'script du Boost exécuté');
    check('JavaScript d’un Boost : exécuté dans la page, avec les droits de la page (ni window.orbe, ni require, ni process)', await js('document.documentElement.dataset.boost') === `undefined|undefined|undefined|true|127.0.0.1:${port}` && boosts.ran.count === runs0 + 1, await js('document.documentElement.dataset.boost'));
    check('JavaScript d’un Boost : une fois par chargement, pas dans les cadres', await js('window.__boostRuns') === 1 && await js('document.getElementById("cadre").contentDocument.documentElement.dataset.boost') === undefined);
    await boosts.apply(wc);
    boosts.set(host, { css: 'h1 { color: rgb(9, 9, 9) }' });
    await boosts.apply(wc);
    check('modifier le Boost ne relance pas son script', await js('window.__boostRuns') === 1);
    for (const [why, patch, undo] of [['case du Boost décochée', () => boosts.set(host, { jsOn: false }), () => boosts.set(host, { jsOn: true })], ['Boost désactivé', () => boosts.set(host, { enabled: false }), () => boosts.set(host, { enabled: true })], ['Boosts coupés dans les réglages', () => set({ boostsEnabled: false }), () => set({ boostsEnabled: true })]]) {
      patch();
      await reload();
      const ran = await js('document.documentElement.dataset.boost');
      undo();
      check(`JavaScript d’un Boost : ${why}, le script ne part plus (page rechargée : il a disparu)`, ran === undefined, String(ran));
    }
    // Même serveur sous un autre nom d'hôte : ce n'est pas le site du Boost.
    const other = w.newTab(`http://localhost:${port}/boost`);
    await until(() => d.tabs[other.id].title === 'Boost' && !win.live.get(other.id).loading, 'autre hôte');
    await sleep(150);
    check('JavaScript et CSS d’un Boost : jamais sur un autre site', await win.live.get(other.id).wc.executeJavaScript('document.documentElement.dataset.boost') === undefined && await win.live.get(other.id).wc.executeJavaScript('getComputedStyle(document.querySelector("h1")).color') !== 'rgb(9, 9, 9)' && boosts.scriptFor(`localhost:${port}`) === '');
    w.close(other.id, { silent: true, ask: false });
    // Page interne, aperçu, petite fenêtre : jamais.
    const inner = w.openInternal('shortcuts.html');
    await until(() => win.live.get(inner.id) && !win.live.get(inner.id).loading, 'page interne');
    check('JavaScript d’un Boost : jamais dans une page interne d’Orbe', await boosts.runScript(win.live.get(inner.id).wc) === false && boosts.hooks.canScript(win.live.get(inner.id).wc) === false && boosts.hostOf('orbe://app/shortcuts.html') === '');
    w.close(inner.id, { silent: true, ask: false });
    w.activate(T);
    const before = boosts.ran.count;
    const pv = w.openPeek(base + '/boost', T);
    await until(() => !pv.webContents.isLoading() && pv.webContents.executeJavaScript('document.readyState === "complete"'), 'aperçu chargé');
    await sleep(150);
    check('JavaScript d’un Boost : jamais dans un aperçu', await pv.webContents.executeJavaScript('document.documentElement.dataset.boost') === undefined && await boosts.runScript(pv.webContents) === false);
    w.closePeek({ animate: false });
    const lw = new little.LittleWindow(base + '/boost');
    await until(() => lw.view && !lw.view.webContents.isLoading() && lw.title === 'Boost', 'petite fenêtre chargée');
    await sleep(150);
    check('JavaScript d’un Boost : jamais dans une petite fenêtre ni dans une vue de l’interface', await lw.view.webContents.executeJavaScript('document.documentElement.dataset.boost') === undefined && await boosts.runScript(lw.view.webContents) === false && await boosts.runScript(lw.ui.webContents) === false && await boosts.runScript(w.ui.webContents) === false && boosts.ran.count === before);
    lw.win.close();
    boosts.set(host, { js: 'throw new Error("aïe")' });
    await reload();
    await until(() => boosts.ran.last && boosts.ran.last.error, 'erreur du script rapportée');
    check('JavaScript d’un Boost : son erreur est rapportée à l’éditeur, la page continue', /aïe/.test(boosts.ran.last.error) && boosts.ran.last.host === host && await js('document.title') === 'Boost');
    boosts.set(host, { js: script, css: '' });

    // Éditeur : lié au site, seul à pouvoir écrire
    const bw = commands.hooks.openBoost(w);
    const bwc = bw.webContents;
    await until(() => !bwc.isLoading() && bwc.executeJavaScript('typeof B === "object" && B !== null && !document.getElementById("editor").hidden').catch(() => false), 'éditeur de Boost');
    const ed = (code) => bwc.executeJavaScript(code);
    check('éditeur de Boost : nom du site, nuancier à points, curseurs, polices, casse, CSS, JavaScript', await ed(`document.getElementById('host').textContent`) === 'Boost · ' + host && await ed(`document.querySelectorAll('#swatches .dot').length`) === boosts.SWATCHES.length + 1 && await ed(`['contrast','brightness','saturation','size'].every((k) => document.getElementById(k).type === 'range')`) && await ed(`document.getElementById('font').options.length`) === 6 && await ed(`document.getElementById('case').options.length`) === 4 && await ed(`!!document.getElementById('css') && !!document.getElementById('js')`));
    await ed(`document.querySelectorAll('#swatches .dot')[3].click()`);
    await until(() => boosts.get(host).look.color === boosts.SWATCHES[2], 'couleur choisie');
    await until(async () => (await js('getComputedStyle(document.body).backgroundColor')) !== 'rgba(0, 0, 0, 0)', 'couleur appliquée à la page');
    // L'éditeur marque la pastille quand l'état lui revient du processus principal : un message
    // distinct de celui qui colore la page, et qui peut arriver juste après lui (machine lente,
    // batterie faible). On l'attend donc, au lieu de le lire à l'instant où la page est colorée.
    const marked = await until(() => ed(`document.querySelectorAll('#swatches .dot')[3].classList.contains('on')`), 'pastille marquée dans l’éditeur', 4000).then(() => true, () => false);
    check('éditeur : une pastille du nuancier colore la page aussitôt', marked);
    await ed(`(() => { const r = document.getElementById('size'); r.value = '130'; r.dispatchEvent(new Event('input', { bubbles: true })); const n = document.getElementById('name'); n.value = '  Mon   Boost  '; n.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await until(() => boosts.get(host).look.size === 130 && boosts.get(host).name === 'Mon Boost', 'taille et nom enregistrés');
    // (Le Boost est rangé d'abord, appliqué à la page ensuite : on attend la page.)
    await until(async () => (await js('getComputedStyle(document.documentElement).zoom')) === '1.3', 'taille appliquée à la page');
    check('éditeur : taille du texte et nom du Boost enregistrés', true);
    check('éditeur : la case JavaScript suit le réglage général', await ed(`!document.getElementById('js-on').disabled && document.getElementById('js-on').checked && document.getElementById('js-off').hidden`));
    set({ boostsJs: false });
    await ed(`O.send('boost:get').then(draw)`);
    check('éditeur : JavaScript coupé dans les réglages → case grisée, avec l’explication', await ed(`document.getElementById('js-on').disabled && !document.getElementById('js-on').checked && !document.getElementById('js-off').hidden`));
    const untouched = JSON.stringify(boosts.get(host));
    check('messages « boost: » venus d’une autre vue que l’éditeur : ignorés', await editor.action('boost:set', { host, patch: { css: 'body { display: none }' } }, w.ui.webContents) === null && await editor.action('boost:reset', { host }, wc) === null && JSON.stringify(boosts.get(host)) === untouched);
    await editor.action('boost:set', { host, patch: { css: 'p { margin: 1px }', inconnu: 1, host: 'ailleurs.example' } }, bwc);
    check('éditeur : seuls les champs connus sont écrits, pour le site de l’éditeur', boosts.get(host).css === 'p { margin: 1px }' && !boosts.has('ailleurs.example') && !('inconnu' in store.state.boosts[host]));
    // Chaque message nomme le site qu'il croit modifier : sans ce nom, ou avec un autre, rien n'est écrit.
    const before6 = JSON.stringify(store.state.boosts);
    const refused6 = [
      await editor.action('boost:set', { css: 'p { margin: 9px }' }, bwc),
      await editor.action('boost:set', { host: 'ailleurs.example', patch: { css: 'p { margin: 9px }' } }, bwc),
      await editor.action('boost:reset', { host: 'ailleurs.example' }, bwc),
      await editor.action('boost:reset', null, bwc),
      await editor.action('boost:zap', null, bwc),
      await editor.action('boost:reload', { host: 'ailleurs.example' }, bwc),
      await editor.action('boost:export', { host: 'ailleurs.example' }, bwc),
    ];
    check('éditeur : un message sans site, ou pour un autre site que celui de l’éditeur, est refusé', refused6.every((r) => r === null) && JSON.stringify(store.state.boosts) === before6, JSON.stringify(refused6));
    // L'éditeur est pointé sur un autre Boost pendant qu'un enregistrement différé de
    // l'ancien site est en route : il ne doit pas atterrir sur le nouveau.
    boosts.set('autre-site.example', { css: 'a { color: blue }' });
    const editorHost = () => editor.state().host;
    await editor.action('boost:edit', { host: 'autre-site.example' }, bwc);
    const late = await editor.action('boost:set', { host, patch: { css: 'body { display: none }' } }, bwc);
    check('éditeur pointé sur un autre site : l’enregistrement en retard de l’ancien site n’atterrit pas sur le nouveau', editorHost() === 'autre-site.example' && late === null && boosts.get('autre-site.example').css === 'a { color: blue }' && boosts.get(host).css === 'p { margin: 1px }');
    boosts.remove('autre-site.example');
    commands.hooks.openBoost(w);
    await until(() => editorHost() === host && !bwc.isLoading() && bwc.executeJavaScript('typeof B === "object" && !!B && B.host').then((h) => h === host).catch(() => false), 'éditeur revenu sur le site de l’onglet');
    // L'onglet change de site pendant que l'éditeur est ouvert : rien n'est écrit pour le nouveau site.
    wc.loadURL(`http://localhost:${port}/p/ailleurs`);
    await until(() => d.tabs[T].title === 'Page ailleurs', 'onglet parti ailleurs');
    const st = await editor.action('boost:set', { host, patch: { css: 'p { margin: 2px }' } }, bwc);
    check('éditeur ouvert, onglet parti sur un autre site : le Boost modifié reste celui du site d’origine', st.host === host && st.shown === false && boosts.get(host).css === 'p { margin: 2px }' && !boosts.has(`localhost:${port}`) && await editor.action('boost:zap', { host }, bwc).then((x) => x.zaps.length === 0));
    wc.loadURL(base + '/boost');
    await until(() => d.tabs[T].title === 'Boost' && !win.live.get(T).loading, 'retour sur le site');

    // Centre de contrôle : activer ou couper le Boost du site
    w.activate(T);
    const shield = () => w.shieldMenuTemplate().find((x) => x.label === t('boost.thisSite'));
    await until(async () => (await js('getComputedStyle(document.body).backgroundColor')) === 'rgb(250, 204, 21)', 'Boost appliqué au retour');
    check('centre de contrôle : « Boost de ce site », coché, à côté de « Modifier le Boost »', shield().visible === true && shield().checked === true && w.shieldMenuTemplate().some((x) => x.label === t('boost.edit')));
    shield().click();
    await until(async () => (await js('getComputedStyle(document.body).backgroundColor')) === 'rgba(0, 0, 0, 0)', 'Boost coupé');
    check('centre de contrôle : décocher coupe le Boost sans le supprimer, recocher le rétablit', boosts.get(host).enabled === false && shield().checked === false && boosts.has(host));
    shield().click();
    await until(async () => (await js('getComputedStyle(document.body).backgroundColor')) === 'rgb(250, 204, 21)', 'Boost rétabli');
    check('Boost rétabli depuis le centre de contrôle', boosts.get(host).enabled === true);
    check('créer un Boost : bouton « + », commande, centre de contrôle, menu de page', labels(w.sidebarMenuTemplate(true)).includes(t('boost.edit')) && w.commandList().some((c) => c.command === 'boost') && w.commandList().some((c) => c.command === 'boosts') && labels(w.pageMenuTemplate(win.live.get(T), { x: 5, y: 5, mediaType: 'none' })).includes(t('boost.edit')));

    // Liste des Boosts, export, import
    boosts.set('exemple.org', { css: 'a { color: red }', name: 'Exemple' });
    await editor.action('boost:showList', null, bwc);
    await until(() => bwc.getURL().endsWith('?list') && !bwc.isLoading() && bwc.executeJavaScript('document.querySelectorAll("#list-items .item").length === 2').catch(() => false), 'liste des Boosts');
    check('liste des Boosts : un par site, avec ce qu’il contient', await ed(`[...document.querySelectorAll('#list-items .item')].map((i) => i.dataset.host + ':' + i.querySelector('.what').textContent).join(' / ')`) === `${host}:${t('boost.look')} · CSS · ${t('boost.jsIdle')} / exemple.org:CSS`, await ed(`[...document.querySelectorAll('#list-items .item')].map((i) => i.dataset.host + ':' + i.querySelector('.what').textContent).join(' / ')`));
    await ed(`document.querySelector('#list-items .item[data-host="exemple.org"] input').click()`);
    await until(() => boosts.get('exemple.org').enabled === false, 'Boost coupé depuis la liste');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-boosts-'));
    const file = path.join(tmp, 'boosts.json');
    const dialogs = { save: dialog.showSaveDialog, open: dialog.showOpenDialog };
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    await ed(`document.getElementById('export-all').click()`);
    await until(() => fs.existsSync(file) && fs.statSync(file).size > 10, 'fichier exporté');
    await sleep(60);
    const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
    check('export : un fichier JSON avec chaque Boost (site, nom, CSS, Zap, apparence, script), sans son état', exported.orbeBoosts === 1 && exported.boosts.map((b) => b.host).join() === [host, 'exemple.org'].sort().join() && exported.boosts.every((b) => !('enabled' in b) && !('jsOn' in b)) && exported.boosts.find((b) => b.host === host).js === script);
    await ed(`document.querySelector('#list-items .item[data-host="exemple.org"] [data-act="delete"]').click()`);
    await until(() => !boosts.has('exemple.org'), 'Boost supprimé depuis la liste');
    // La liste se redessine un instant après la suppression : on attend son nouvel état.
    const listed = await until(async () => (await ed(`document.querySelectorAll('#list-items .item').length`)) === 1, 'liste redessinée').then(() => true, () => false);
    check('liste des Boosts : supprimer', listed);
    // Fichier importé : données non fiables
    const hostile = {
      orbeBoosts: 1,
      boosts: [
        { host: 'exemple.org', name: 'x'.repeat(500), css: 'a { color: red }', zaps: ['ok > p', 'a{} body{display:none}', 7, 'a, b'], look: { color: 'red;}', size: 9999, font: '__proto__' }, js: 'window.__importe = 1', jsOn: true, enabled: true, autre: { a: 1 } },
        { host, css: 'remplacé' },
        { host: 'evil.example/chemin', css: 'x' },
        { host: '__proto__', css: 'x' },
        { host: 'vide.example' },
        'pas un objet',
        { host: 'EXEMPLE.org', css: 'doublon' },
      ],
    };
    fs.writeFileSync(file, JSON.stringify(hostile));
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    const ranBefore = boosts.ran.count;
    await ed(`document.getElementById('import').click()`);
    await until(() => boosts.has('exemple.org'), 'Boost importé');
    const imp = boosts.get('exemple.org');
    check('import : le Boost arrive désactivé, son script coupé, sans rien exécuter', imp.enabled === false && imp.jsOn === false && imp.js === 'window.__importe = 1' && boosts.ran.count === ranBefore && boosts.cssFor('exemple.org') === '' && boosts.scriptFor('exemple.org') === '');
    check('import : champs bornés, sélecteurs vérifiés, apparence ramenée aux valeurs permises, champs inconnus ignorés', imp.name.length === 60 && imp.zaps.join() === 'ok > p' && imp.look.color === '' && imp.look.size === 150 && imp.look.font === '' && !('autre' in store.state.boosts['exemple.org']), JSON.stringify(imp));
    check('import : un Boost existant n’est jamais remplacé ; hôtes invalides et entrées vides refusés', boosts.get(host).css === 'p { margin: 2px }' && !boosts.has('evil.example/chemin') && !Object.hasOwn(store.state.boosts, '__proto__') && !boosts.has('vide.example') && Object.keys(store.state.boosts).sort().join() === [host, 'exemple.org'].sort().join());
    await until(() => ed(`!document.getElementById('list-note').hidden && document.querySelectorAll('#list-items .item').length === 2`), 'compte rendu de l’import');
    check('import : compte rendu affiché (importés, déjà présents, refusés)', (await ed(`document.getElementById('list-note').textContent`)) === [t('boost.imported', { n: 1 }), t('boost.importSkipped', { n: 2 }), t('boost.importRejected', { n: 4 })].join(' '), await ed(`document.getElementById('list-note').textContent`));
    check('import : fichier illisible, trop gros ou d’un autre format refusé', boosts.importText('{').error === 'format' && boosts.importText(JSON.stringify({ boosts: [] })).error === 'format' && boosts.importText('x'.repeat(boosts.FILE_MAX + 1)).error === 'size' && boosts.importData(null).error === 'format' && boosts.importData({ orbeBoosts: 1, boosts: 'x' }).error === 'format');
    dialog.showSaveDialog = dialogs.save;
    dialog.showOpenDialog = dialogs.open;
    fs.rmSync(tmp, { recursive: true, force: true });
    // Depuis la liste : modifier un Boost, puis tout réinitialiser
    await ed(`document.querySelector('#list-items .item[data-host="${host}"] [data-act="edit"]').click()`);
    await until(() => !bwc.getURL().includes('?list') && !bwc.isLoading() && bwc.executeJavaScript('typeof B === "object" && B !== null && B.host === ' + JSON.stringify(host)).catch(() => false), 'éditeur rouvert depuis la liste');
    await ed(`document.getElementById('reset').click()`);
    await until(() => !boosts.has(host), 'Boost réinitialisé');
    await until(async () => (await js('getComputedStyle(document.body).backgroundColor')) === 'rgba(0, 0, 0, 0)', 'page rendue à elle-même');
    // (La page est rendue à elle-même avant que l'éditeur ait reçu la réponse : on attend ses champs.)
    await until(() => ed(`document.getElementById('name').value === '' && document.getElementById('css').value === '' && document.getElementById('size').value === '100'`), 'champs de l’éditeur vidés');
    check('« Tout réinitialiser » : le Boost du site disparaît, la page retrouve son aspect', !boosts.has(host));
    // En pleine saisie aussi : le champ où l'on écrit est vidé, et la frappe en attente n'est pas enregistrée après coup.
    await ed(`(() => { const c = document.getElementById('css'); c.focus(); c.value = 'p { color: red }'; c.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('reset').click(); })()`);
    await until(() => ed(`document.getElementById('css').value === ''`), 'champ en cours de saisie vidé');
    await sleep(500);
    check('« Tout réinitialiser » pendant une saisie : le champ est vidé, rien n’est enregistré après coup', !boosts.has(host) && await ed(`document.getElementById('css').value`) === '');
    bw.close();
    boosts.remove('exemple.org');
    set({ boostsJs: false });
    w.close(T, { silent: true, ask: false });
  }


  // === Divers : copie d'adresse, menus de page et de la barre d'outils, raccourcis ===
  {
    const { cleanUrl } = win;
    const cases = [
      ['https://exemple.org/a?utm_source=x&utm_medium=y&id=3&fbclid=abc#ancre', 'https://exemple.org/a?id=3#ancre'],
      ['https://exemple.org/a?gclid=1&msclkid=2&mc_eid=3', 'https://exemple.org/a'],
      ['https://www.instagram.com/p/Cabc/?igshid=xyz&igsh=abc', 'https://www.instagram.com/p/Cabc/'],
      ['https://www.amazon.fr/Un-Produit-Long/dp/B0ABCDEFGH/ref=sr_1_1?crid=1&keywords=x&qid=2', 'https://www.amazon.fr/dp/B0ABCDEFGH'],
      ['https://www.amazon.com/gp/product/B0ABCDEFGH?psc=1', 'https://www.amazon.com/dp/B0ABCDEFGH'],
      ['https://youtu.be/abc?si=jeton&t=10', 'https://youtu.be/abc?t=10'],
      ['https://exemple.org/recherche?si=utile&q=orbe', 'https://exemple.org/recherche?si=utile&q=orbe'],
      ['https://exemple.org/a?b=1', 'https://exemple.org/a?b=1'],
      ['orbe://app/library.html?utm_source=x', 'orbe://app/library.html?utm_source=x'],
      ['pas une adresse', 'pas une adresse'],
    ];
    check('copie d’adresse : paramètres de pistage retirés (utm_*, fbclid, igshid…), fiche Amazon réduite au produit, le reste intact', cases.every(([a, b]) => cleanUrl(a) === b), JSON.stringify(cases.filter(([a, b]) => cleanUrl(a) !== b).map(([a]) => [a, cleanUrl(a)])));
    const P = w.newTab(base + '/p/suivi?utm_source=lettre&id=7&fbclid=zzz');
    await until(() => d.tabs[P.id].title === 'Page suivi' && !win.live.get(P.id).loading, 'page à l’adresse pistée');
    const clip = await clipboard.readText();
    const toasts = [];
    const toast = w.toast;
    w.toast = (text) => toasts.push(text);
    w.run('copyUrl');
    await until(async () => (await clipboard.readText()) === base + '/p/suivi?id=7', 'adresse copiée sans pistage');
    w.run('copyUrlMarkdown');
    await until(async () => (await clipboard.readText()) === `[Page suivi](${base}/p/suivi?id=7)`, 'Markdown sans pistage');
    check('⇧⌘C et ⌥⇧⌘C copient l’adresse sans ses paramètres de pistage', d.tabs[P.id].url.includes('utm_source') && toasts.length === 2);

    // Zoom : pourcentage affiché
    toasts.length = 0;
    const pwc = win.live.get(P.id).wc;
    w.run('zoomIn');
    const z1 = pwc.getZoomLevel();
    w.run('zoomOut');
    w.run('zoomOut');
    const z2 = pwc.getZoomLevel();
    w.run('actualSize');
    check('⌘+ / ⌘- / ⌘0 : zoom de la page, pourcentage affiché à chaque fois', z1 === 0.5 && z2 === -0.5 && pwc.getZoomLevel() === 0 && toasts.join('|') === 'Zoom 110 %|Zoom 100 %|Zoom 91 %|Zoom 100 %', JSON.stringify([z1, z2, toasts]));
    w.toast = toast;
    await clipboard.writeText(clip);

    // Messages : au-dessus de la page, cliquables
    let clicked = 0;
    w.toast('Message d’essai', null, () => { clicked += 1; });
    await until(() => w.toastView && !w.toastView.webContents.isLoading() && w.win.contentView.children.includes(w.toastView) && w.toastView.webContents.executeJavaScript(`!document.getElementById('toast').hidden && document.getElementById('toast').textContent === 'Message d’essai'`), 'message affiché');
    const kids = w.win.contentView.children;
    check('message (toast) : affiché par-dessus la page', kids.indexOf(w.toastView) > kids.indexOf(win.live.get(P.id).view) && w.toastView.getBounds().y >= win.live.get(P.id).view.getBounds().y);
    await w.toastView.webContents.executeJavaScript(`document.getElementById('toast').click()`);
    await until(() => clicked === 1 && !w.win.contentView.children.includes(w.toastView), 'clic sur le message');
    check('message cliquable : le clic lance son action et le fait disparaître', clicked === 1 && w.toastAction === null);
    w.toast('Sans action');
    await until(() => w.win.contentView.children.includes(w.toastView), 'second message');
    await w.handle('toastClick');
    check('message sans action : le clic le fait seulement disparaître', !w.win.contentView.children.includes(w.toastView) && clicked === 1);

    // Menus de page
    const rt = win.live.get(P.id);
    const menu = (p) => w.pageMenuTemplate(rt, { x: 10, y: 10, mediaType: 'none', ...p });
    const link = menu({ linkURL: base + '/p/cible' });
    check('menu de page, lien : nouvel onglet, vue scindée, aperçu, petite fenêtre, copier, inspecter', labels(link).join('|') === ['ctx.openNewTab', 'ctx.openSplit', 'ctx.openPeek', 'ctx.openLittle', 'ctx.copyLink', 'ctx.inspect'].map((k) => t(k)).join('|'), labels(link).join('|'));
    const n0 = space.today.length;
    item(link, 'ctx.openNewTab').click();
    check('menu de page, lien : « nouvel onglet » l’ouvre en arrière-plan, juste après', space.today.length === n0 + 1 && w.activeId === P.id && space.today[space.today.indexOf(P.id) + 1] && d.tabs[space.today[space.today.indexOf(P.id) + 1]].url === base + '/p/cible');
    const bg = space.today[space.today.indexOf(P.id) + 1];
    item(link, 'ctx.openSplit').click();
    const sv = w.visibleIds();
    check('menu de page, lien : « vue scindée » l’ouvre dans un volet à côté', sv.length === 2 && sv[0] === P.id && d.tabs[sv[1]].url === base + '/p/cible');
    w.closeSplitPane(sv[1]);
    w.activate(P.id);
    item(link, 'ctx.openPeek').click();
    check('menu de page, lien : « aperçu »', !!w.peekState && w.peekState.url === base + '/p/cible');
    w.closePeek({ animate: false });
    const lw0 = little.LittleWindow.all.length;
    item(link, 'ctx.openLittle').click();
    check('menu de page, lien : « petite fenêtre »', little.LittleWindow.all.length === lw0 + 1 && little.LittleWindow.all[lw0].url === base + '/p/cible');
    little.LittleWindow.all[lw0].win.close();
    for (const id of [bg, sv[1]]) w.close(id, { silent: true, ask: false });
    w.activate(P.id);
    const selMenu = menu({ selectionText: 'orbe' });
    check('menu de page, sélection : copier, rechercher, copier en citation', labels(selMenu).join('|') === [t('edit.copy'), t('ctx.searchFor', { text: 'orbe' }), t('edit.copyUrlQuote'), t('ctx.inspect')].join('|'), labels(selMenu).join('|'));
    await pwc.executeJavaScript('getSelection().selectAllChildren(document.querySelector(".texte")); true');
    item(selMenu, 'edit.copyUrlQuote').click();
    await until(async () => (await clipboard.readText()) === `> orbe\n>\n> — [Page suivi](${base}/p/suivi?id=7)`, 'citation copiée');
    check('menu de page : « Copier la sélection en citation » (texte, titre et adresse de la page, sans pistage)', true);
    await clipboard.writeText(clip);
    const img = menu({ mediaType: 'image', srcURL: base + '/image.png' });
    check('menu de page, image : ouvrir, copier, copier l’adresse, enregistrer', labels(img).join('|') === ['ctx.openImage', 'ctx.copyImage', 'ctx.copyImageUrl', 'ctx.saveImage', 'ctx.inspect'].map((k) => t(k)).join('|'), labels(img).join('|'));
    const vid = menu({ mediaType: 'video', srcURL: base + '/film.mp4' });
    check('menu de page, vidéo : image dans l’image, copier l’adresse', labels(vid).join('|') === [t('ctx.pip'), t('ctx.copyVideoUrl'), t('ctx.pipAuto', { site: '127.0.0.1' }), t('ctx.inspect')].join('|'), labels(vid).join('|'));
    const pageMenu = menu({});
    check('menu de page, page : précédent, suivant, actualiser, copier l’adresse, enregistrer, imprimer, Boost, traduire, inspecter', labels(pageMenu).join('|') === ['ctx.back', 'ctx.forward', 'ctx.reload', 'edit.copyUrl', 'file.savePage', 'file.print', 'boost.edit', 'ctx.translate', 'ctx.inspect'].map((k) => t(k)).join('|'), labels(pageMenu).join('|'));
    const opened = [];
    const newTab = w.newTab;
    w.newTab = (url, opts) => { opened.push([url, opts]); };
    item(pageMenu, 'ctx.translate').click();
    w.newTab = newTab;
    check('menu de page : « Traduire la page » ouvre la page traduite dans un nouvel onglet, à côté', opened.length === 1 && opened[0][0] === `https://translate.google.com/translate?sl=auto&tl=${store.state.settings.lang === 'en' ? 'en' : 'fr'}&u=${encodeURIComponent(d.tabs[P.id].url)}` && opened[0][1].after === P.id && w.translate('file:///etc/passwd') === undefined, JSON.stringify(opened));
    const peekMenu = w.pageMenuTemplate({ wc: pwc, id: P.id }, { x: 1, y: 1, mediaType: 'none' });
    check('menu de page d’un aperçu : pas de « Modifier le Boost » (un aperçu n’est pas un onglet)', !labels(peekMenu).includes(t('boost.edit')) && labels(peekMenu).includes(t('ctx.inspect')));

    // Barre d'outils : clic droit
    const full = store.state.settings.showFullUrl;
    const tb = w.toolbarMenuTemplate();
    check('clic droit sur la barre d’outils : adresse entière, copier, capture, partager, masquer', labels(tb).join('|') === ['tb.showFullUrl', 'edit.copyUrl', 'edit.copyUrlMarkdown', ...(process.platform === 'darwin' ? ['tb.share'] : []), 'view.hideToolbar'].map((k) => t(k)).join('|').replace(t('edit.copyUrlMarkdown'), t('edit.copyUrlMarkdown') + '|' + t('file.capture').replace('…', '')), labels(tb).join('|'));
    item(tb, 'tb.showFullUrl').click();
    const flipped = store.state.settings.showFullUrl;
    item(w.toolbarMenuTemplate(), 'tb.showFullUrl').click();
    check('barre d’outils : « Afficher l’adresse entière » se coche et se décoche', flipped === !(full !== false) && store.state.settings.showFullUrl === (full !== false) && w.toolbarMenuTemplate()[0].checked === (full !== false));
    commands.setSetting('showToolbar', true);
    await until(() => ui('document.body.classList.contains("toolbar")'), 'barre d’outils affichée');
    const asked = [];
    const popup = w.popup;
    w.popup = (tpl) => asked.push(labels(tpl)[0]);
    await ui(`document.getElementById('toolbar').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`);
    await until(() => asked.length === 1, 'menu de la barre d’outils demandé');
    w.popup = popup;
    check('la barre d’outils demande son menu au clic droit', asked[0] === t('tb.showFullUrl'));
    commands.setSetting('showToolbar', false);

    // Toujours au premier plan
    const top0 = w.win.isAlwaysOnTop();
    w.run('stayOnTop');
    const top1 = w.win.isAlwaysOnTop();
    w.run('stayOnTop');
    check('« Toujours au premier plan » : la fenêtre passe au-dessus des autres, puis revient', top0 === false && top1 === true && w.win.isAlwaysOnTop() === false);

    // Raccourcis : ⌃`, ⌘← / ⌘→, source et outils de développement
    const fake = () => ({ prevented: false, preventDefault() { this.prevented = true; } });
    const ev = fake();
    w.onInput(ev, { type: 'keyDown', key: '`', code: 'Backquote', control: true }, false, pwc);
    check('⌃` : onglets récents, comme ⌃Tab', !!w.switcher && w.modalMode === 'switcher' && ev.prevented);
    w.hideModal();
    pwc.loadURL(base + '/liens');
    await until(() => d.tabs[P.id].title === 'Liens' && !rt.loading, 'seconde page dans l’historique');
    if (process.platform === 'darwin') {
      w.onInput(fake(), { type: 'keyDown', key: 'ArrowLeft', meta: true }, false, pwc);
      await until(() => d.tabs[P.id].title === 'Page suivi', '⌘← : page précédente');
      w.onInput(fake(), { type: 'keyDown', key: 'ArrowRight', meta: true }, false, pwc);
      await until(() => d.tabs[P.id].title === 'Liens' && !rt.loading, '⌘→ : page suivante');
      check('⌘← / ⌘→ hors d’un champ de saisie : page précédente, suivante', true);
      await pwc.executeJavaScript('document.getElementById("champ").focus(); true');
      const moved = await w.arrowNav(pwc, -1);
      check('⌘← dans un champ de saisie : la page ne change pas (la touche déplace le curseur)', moved === false && d.tabs[P.id].title === 'Liens');
      w.onInput(fake(), { type: 'keyDown', key: 'ArrowLeft', meta: true, shift: true }, false, pwc);
      w.onInput(fake(), { type: 'keyDown', key: 'ArrowLeft', meta: true }, true, null);
      await sleep(150);
      check('⇧⌘← (sélection) et touches venues de l’interface : sans effet sur la page', d.tabs[P.id].title === 'Liens');
    }
    w.run('source');
    const src = w.activeId;
    check('⌥⌘U : le code source s’ouvre dans un nouvel onglet', src !== P.id && d.tabs[src].url === 'view-source:' + base + '/liens');
    w.close(src, { silent: true, ask: false });
    w.activate(P.id);
    const acc = (name) => require('../src/main/shortcuts').accelOf(name);
    check('⌥⌘I, ⌥⌘C, ⌥⌘J : outils de développement, inspecteur, console (au menu, avec leur raccourci)', ['devtools', 'inspect', 'console', 'source'].every((n) => !!acc(n) && !!Menu.getApplicationMenu() && (function find(m) { return m.items.some((it) => it.accelerator === acc(n) || (it.submenu && find(it.submenu))); })(Menu.getApplicationMenu())));
    w.close(P.id, { silent: true, ask: false });
  }


  // === Petite fenêtre ========================================================
  {
    const { LittleWindow } = little;
    const { dialog } = require('electron');
    const count = () => LittleWindow.all.length;
    const closeAll = async () => { for (const l of LittleWindow.all) l.win.close(); await until(() => count() === 0, 'petites fenêtres fermées'); };
    await closeAll();
    const settings = store.state.settings;
    const before = { externalLinks: settings.externalLinks, routes: settings.routes, size: store.state.window.littleSize };
    const calls = [];
    const openInOrbe = little.hooks.openInOrbe;

    // Liens venus d'autres applications
    settings.externalLinks = 'little';
    settings.routes = [];
    openUrl(base + '/p/externe');
    await until(() => count() === 1 && LittleWindow.all[0].title === 'Page externe', 'lien externe en petite fenêtre');
    const l1 = LittleWindow.all[0];
    check('lien venu d’une autre application, réglage « petite fenêtre » : il s’y ouvre', l1.url === base + '/p/externe' && !Object.values(d.tabs).some((x) => x.url === base + '/p/externe'));
    openUrl(base + '/p/externe');
    await sleep(120);
    check('le même lien une seconde fois : la petite fenêtre existante revient, sans en ouvrir une autre', count() === 1 && LittleWindow.all[0] === l1);
    openUrl(base + '/p/autre');
    await until(() => count() === 2, 'seconde petite fenêtre');
    check('un autre lien : une seconde petite fenêtre', LittleWindow.all[1].url === base + '/p/autre');
    const tabsBefore = Object.keys(d.tabs).length;
    const meet = [];
    const newTab = w.newTab;
    w.newTab = (url) => { meet.push(url); };
    for (const url of ['https://meet.google.com/abc-defg-hij', 'https://us02web.zoom.us/j/123456789?pwd=x', 'https://teams.microsoft.com/l/meetup-join/19%3ameeting']) openUrl(url);
    w.newTab = newTab;
    check('liens de réunion (Meet, Zoom, Teams) venus d’ailleurs : dans un onglet, jamais en petite fenêtre', count() === 2 && meet.length === 3 && Object.keys(d.tabs).length === tabsBefore, JSON.stringify(meet));
    check('lien de réunion ou non', ['https://meet.google.com/abc-defg-hij', 'https://zoom.us/j/1', 'https://teams.live.com/meet/9', 'https://exemple.webex.com/meet/nom'].every(win.isMeetingUrl) && !['https://meet.google.com/', 'https://zoom.us/pricing', 'https://exemple.org/j/1', 'https://faux-zoom.us.exemple.org/j/1', 'javascript:alert(1)', 'pas une adresse'].some(win.isMeetingUrl));
    settings.externalLinks = before.externalLinks;
    LittleWindow.all[1].win.close();
    await until(() => count() === 1, 'seconde fenêtre fermée');

    // Barre : copie du lien, menu « Ouvrir dans… » avec recherche
    const lui = (code) => l1.ui.webContents.executeJavaScript(code);
    await until(() => lui(`!document.getElementById('copy').disabled && !document.getElementById('open').disabled`), 'barre de la petite fenêtre prête');
    l1.url = base + '/p/externe?utm_source=x&id=1';
    const clip = await clipboard.readText();
    await lui(`document.getElementById('copy').click()`);
    await until(async () => (await clipboard.readText()) === base + '/p/externe?id=1', 'lien copié');
    check('petite fenêtre : bouton de copie du lien (sans paramètres de pistage)', await lui(`document.getElementById('copy').classList.contains('done')`));
    await clipboard.writeText(clip);
    l1.url = base + '/p/externe';
    const extra = store.makeSpace('Été à Paris', '🌞', '#f59e0b');
    d.spaces.push(extra);
    little.hooks.openInOrbe = (url, spaceId) => calls.push([url, spaceId]);
    await lui(`document.getElementById('open-in').click()`);
    await until(() => lui(`!document.getElementById('spaces').hidden && document.querySelectorAll('#space-list button').length`).then((n) => n === d.spaces.length), 'menu des Espaces');
    const kids = l1.win.contentView.children;
    check('« Ouvrir dans… » : la liste des Espaces, par-dessus la page, avec un champ de recherche', kids[kids.length - 1] === l1.ui && await lui(`document.activeElement === document.getElementById('space-search') && document.body.classList.contains('menu')`));
    await lui(`(() => { const s = document.getElementById('space-search'); s.value = 'ete a'; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    check('recherche d’Espace : sans tenir compte des accents ni de la casse', await lui(`[...document.querySelectorAll('#space-list button')].map((b) => b.dataset.space).join()`) === extra.id);
    await lui(`(() => { const s = document.getElementById('space-search'); s.value = 'zzz'; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    check('recherche d’Espace sans résultat : dit', await lui(`document.querySelectorAll('#space-list button').length === 0 && !document.getElementById('space-none').hidden`));
    await lui(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await until(() => !l1.menu && l1.win.contentView.children[l1.win.contentView.children.length - 1] === l1.view, 'menu refermé');
    check('Échap referme le menu : la page repasse devant, la fenêtre reste', await lui(`document.getElementById('spaces').hidden && !document.body.classList.contains('menu')`) && count() === 1);
    check('Espace inconnu ou message forgé : rien ne s’ouvre', l1.handle('openInSpace', 'inconnu') === undefined && l1.handle('openInSpace', { id: extra.id }) === undefined && calls.length === 0 && count() === 1);
    l1.run('openInSpace');
    await until(() => lui(`document.querySelectorAll('#space-list button').length`).then((n) => n === d.spaces.length), 'menu rouvert par ⌥⌘O');
    await lui(`(() => { const s = document.getElementById('space-search'); s.value = 'paris'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
    await until(() => calls.length === 1 && count() === 0, 'page envoyée dans l’Espace choisi');
    check('⌥⌘O, recherche, Entrée : la page part dans l’Espace trouvé et la petite fenêtre se ferme', calls[0][0] === base + '/p/externe' && calls[0][1] === extra.id);
    little.hooks.openInOrbe = openInOrbe;
    d.spaces.splice(d.spaces.indexOf(extra), 1);

    // Taille mémorisée
    const l2 = new LittleWindow(base + '/p/taille');
    l2.win.setSize(702, 505);
    l2.rememberSize();
    l2.win.close();
    await until(() => count() === 0, 'fenêtre fermée');
    const l3 = new LittleWindow('');
    check('petite fenêtre : la taille choisie est reprise par la suivante', l3.win.getSize().join('x') === '702x505' && store.state.window.littleSize.width === 702, l3.win.getSize().join('x'));
    store.state.window.littleSize = { width: 'x', height: -5 };
    check('taille enregistrée illisible ou hors bornes : taille par défaut, puis bornée', JSON.stringify(little.savedSize()) === JSON.stringify({ width: 860, height: 640 }) && (store.state.window.littleSize = { width: 10, height: 99999 }) && JSON.stringify(little.savedSize()) === JSON.stringify({ width: 380, height: 3000 }));
    if (before.size) store.state.window.littleSize = before.size; else delete store.state.window.littleSize;

    // Jamais une page d'Orbe dans une petite fenêtre
    l3.load('orbe://app/settings.html');
    check('petite fenêtre : une adresse interne d’Orbe n’y est jamais chargée', !l3.view && l3.url === '' && new LittleWindow('orbe://app/library.html').url === '');
    l3.load(base + '/p/garde');
    await until(() => l3.title === 'Page garde', 'page de la petite fenêtre');
    await l3.view.webContents.executeJavaScript(`location.href = 'orbe://app/settings.html'; true`).catch(() => {});
    await sleep(300);
    check('… ni atteinte par une navigation de la page', l3.view.webContents.getURL() === base + '/p/garde' && !win.trusted.has(l3.view.webContents));
    const asked = [];
    const box = dialog.showMessageBoxSync;
    dialog.showMessageBoxSync = (...args) => { asked.push(args); return 0; };
    await closeAll();
    dialog.showMessageBoxSync = box;
    settings.routes = before.routes;
  }

  // === Aperçu : réunions, aiguillage, adresse ================================
  {
    const settings = store.state.settings;
    const routes = settings.routes;
    const other = store.makeSpace('Travail', '💼', '#6366f1');
    d.spaces.push(other);
    settings.routes = [{ match: '127.0.0.1/p/regle', to: other.id }, { match: 'localhost/p/regle', to: other.id }, { match: '127.0.0.1/p/petite', to: 'little' }, { match: 'localhost/p/petite', to: 'little' }];
    check('lien qui s’ouvrirait en aperçu : aperçu, onglet pour une réunion, aiguillage pour une règle', w.peekTarget(base + '/p/x') === 'peek' && w.peekTarget('https://meet.google.com/abc-defg-hij') === 'tab' && w.peekTarget(base + '/p/regle') === 'route' && w.peekTarget(base + '/p/petite') === 'route');
    const Pn = await open('/liens', 'Liens');
    w.togglePin(Pn);
    const rt = win.live.get(Pn);
    // Clic sur un lien sortant de l'onglet épinglé, tel que le moteur le rapporte : relâchement
    // du bouton, puis navigation de la page.
    const follow = (url) => {
      rt.wc.emit('before-mouse-event', { preventDefault() {} }, { type: 'mouseUp', button: 'left', x: 20, y: 20 });
      const e = { isMainFrame: true, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      rt.wc.emit('will-navigate', e, url);
      return e.defaultPrevented;
    };
    const outside = `http://localhost:${port}`;
    check('onglet épinglé, lien vers un autre site : aperçu', follow(outside + '/p/x') === true && !!w.peekState && w.peekState.url === outside + '/p/x');
    w.closePeek({ animate: false });
    const opened = [];
    const newTab = w.newTab;
    w.newTab = (url, opts) => { opened.push([url, opts && opts.after]); };
    const held = follow('https://meet.google.com/abc-defg-hij');
    w.newTab = newTab;
    check('onglet épinglé, lien de réunion : un onglet à côté, pas d’aperçu', held === true && !w.peekState && opened.length === 1 && opened[0][0] === 'https://meet.google.com/abc-defg-hij' && opened[0][1] === Pn);
    const held2 = follow(outside + '/p/regle');
    await until(() => w.spaceId === other.id && other.today.length === 1, 'lien aiguillé vers son Espace');
    check('onglet épinglé, lien couvert par une règle d’aiguillage : il s’ouvre dans l’Espace de la règle, pas en aperçu', held2 === true && !w.peekState && d.tabs[other.today[0]].url === outside + '/p/regle');
    w.close(other.today[0], { silent: true, ask: false });
    w.switchSpace(space.id);
    w.activate(Pn);
    const lw0 = little.LittleWindow.all.length;
    follow(outside + '/p/petite');
    await until(() => little.LittleWindow.all.length === lw0 + 1, 'lien aiguillé vers une petite fenêtre');
    check('règle « petite fenêtre » : le lien y va, pas en aperçu', !w.peekState && little.LittleWindow.all[lw0].url === outside + '/p/petite');
    little.LittleWindow.all[lw0].win.close();
    settings.routes = routes;

    // Adresse de l'aperçu quand la barre d'outils est affichée
    w.activate(Pn);
    const plain = w.peekRect();
    const zone = w.contentRect();
    check('aperçu sans barre d’outils : la carte commence à 16 px du haut de la zone des pages', plain.y === zone.y + 16);
    commands.setSetting('showToolbar', true);
    await until(() => w.toolbarShown && w.contentRect().y > zone.y, 'barre d’outils affichée');
    w.openPeek(base + '/p/adresse', Pn);
    await until(() => w.peekState && w.peekChrome && !w.peekChrome.webContents.isLoading() && w.peekChrome.webContents.executeJavaScript(`!document.getElementById('peek-url').hidden && document.getElementById('peek-url').textContent`).then((x) => x === base + '/p/adresse'), 'adresse de l’aperçu affichée');
    const z2 = w.contentRect();
    const card = w.peekRect();
    const pill = await w.peekChrome.webContents.executeJavaScript(`(() => { const r = document.getElementById('peek-url').getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; })()`);
    check('barre d’outils affichée : l’aperçu montre son adresse, au-dessus de la carte', card.y === z2.y + 40 && pill.bottom <= card.y - z2.y && pill.top >= 0, JSON.stringify([card, z2, pill]));
    w.peekState.view.webContents.loadURL(base + '/p/suite');
    await until(() => w.peekChrome.webContents.executeJavaScript(`document.getElementById('peek-url').textContent`).then((x) => x === base + '/p/suite'), 'adresse suivie');
    check('l’adresse de l’aperçu suit sa navigation', true);
    commands.setSetting('showToolbar', false);
    await until(() => !w.toolbarShown && w.peekChrome.webContents.executeJavaScript(`document.getElementById('peek-url').hidden`), 'barre d’outils masquée');
    check('barre d’outils masquée : plus d’adresse, la carte remonte', w.peekRect().y === w.contentRect().y + 16);
    w.closePeek({ animate: false });
    w.togglePin(Pn);
    d.spaces.splice(d.spaces.indexOf(other), 1);
    w.close(Pn, { silent: true, ask: false });
  }


  // === Menus : partage, Boosts, volets ; enregistrer, imprimer ; vidéo en image dans l'image ===
  {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const { dialog } = require('electron');
    const menuHas = (key) => (function find(m) { return m.items.some((it) => it.label === t(key) || (it.submenu && find(it.submenu))); })(Menu.getApplicationMenu());
    const V = await open('/video', 'Vidéo');
    const vrt = win.live.get(V);
    require('../src/main/menu').refresh(true);
    check('barre de menus : « Agrandir ce volet », « Séparer tous les onglets… », « Afficher les Boosts… »' + (process.platform === 'darwin' ? ', « Partager… »' : ''), ['view.expandSplit', 'view.separateAll', 'boost.list', ...(process.platform === 'darwin' ? ['tb.share'] : [])].every(menuHas), ['view.expandSplit', 'view.separateAll', 'boost.list', 'tb.share'].filter((k) => !menuHas(k)).join());
    // Enregistrer la page (⇧⌘S)
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-page-'));
    const file = path.join(tmp, 'page.html');
    const save = dialog.showSaveDialog;
    let proposed = '';
    dialog.showSaveDialog = async (win0, opts) => { proposed = path.basename(opts.defaultPath); return { canceled: false, filePath: file }; };
    await w.run('savePage');
    await until(() => fs.existsSync(file) && fs.statSync(file).size > 50, 'page enregistrée');
    dialog.showSaveDialog = save;
    check('⇧⌘S : la page est enregistrée dans le fichier choisi, nommé d’après son titre', proposed === 'Vidéo.html' && /<title>Vidéo<\/title>/.test(fs.readFileSync(file, 'utf8')));
    fs.rmSync(tmp, { recursive: true, force: true });
    // Imprimer (⌘P) : la demande part bien à la page affichée (la boîte du système n'est pas ouverte ici).
    let printed = 0;
    const print = vrt.wc.print;
    vrt.wc.print = () => { printed += 1; };
    w.run('print');
    vrt.wc.print = print;
    check('⌘P : l’impression est demandée à la page affichée', printed === 1);
    // Image dans l'image depuis le menu de la vidéo
    const vmenu = w.pageMenuTemplate(vrt, { x: 100, y: 90, mediaType: 'video', srcURL: '' });
    check('menu d’une vidéo sans adresse propre (flux) : image dans l’image seulement', labels(vmenu).join('|') === [t('ctx.pip'), t('ctx.pipAuto', { site: '127.0.0.1' }), t('ctx.inspect')].join('|'), labels(vmenu).join('|'));
    if (!env.vivant) {
      ignorer('menu d’une vidéo : « Image dans l’image » la détache, une seconde fois la ramène', env.muet || env.raison);
    } else {
      await vrt.wc.executeJavaScript('start()', true);
      await until(() => vrt.wc.executeJavaScript('document.getElementById("v").readyState > 2 && document.getElementById("v").videoWidth > 0'), 'vidéo en lecture');
      item(vmenu, 'ctx.pip').click();
      await until(() => vrt.wc.executeJavaScript('document.pictureInPictureElement === document.getElementById("v")'), 'vidéo en image dans l’image');
      item(vmenu, 'ctx.pip').click();
      await until(async () => !(await vrt.wc.executeJavaScript('!!document.pictureInPictureElement')), 'vidéo revenue dans la page');
      check('menu d’une vidéo : « Image dans l’image » la détache, une seconde fois la ramène', true);
    }
    w.close(V, { silent: true, ask: false });
  }

  // === Ménage ================================================================
  for (const id of [...space.today]) w.close(id, { silent: true, ask: false });
  w.switchSpace(home);
  w.removeSpace(space.id);
  w.layout();
  w.changed();
  server.close();
  if (!ctx.check && failed) throw new Error(`${failed} vérification(s) en échec`);
};
