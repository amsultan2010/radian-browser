// Vitesse et mémoire : ce que les améliorations de docs/suivi/ameliorations.md
// garantissent, vérifié par des faits (processus, écouteurs, requêtes), jamais
// par des durées, qui varient avec la charge de la machine.
// Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/performances.js node scripts/dev.js --selftest
const { app, webContents } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label, timeout = 8000) {
  const t0 = Date.now();
  for (;;) {
    let v;
    try { v = await fn(); } catch { v = false; }
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('Délai dépassé : ' + label);
    await sleep(40);
  }
}

module.exports = async function performancesTests(ctx) {
  const { first: w, OrbeWindow, store, win } = ctx;
  let failed = 0;
  const check = ctx.check || ((name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`); });
  const sessions = require('../src/main/sessions');
  const suggest = require('../src/main/suggest');
  const veille = require('../src/main/veille');
  const ui = (js) => w.ui.webContents.executeJavaScript(js, true);
  const pidOf = (view) => view.webContents.getOSProcessId();
  const page = (title) => 'data:text/html;charset=utf-8,' + encodeURIComponent(`<title>${title}</title><input id="champ"><p>${title}</p>`);

  await until(() => ui('typeof S === "object" && S !== null'), 'coque chargée');

  // --- Page de la coque : ses scripts sont demandés ensemble (DEM-13) -----------------
  {
    const r = await ui(`(() => { const s = [...document.scripts].filter((x) => x.src); return { n: s.length, differes: s.filter((x) => x.defer).length, ordre: s.map((x) => x.src.split('/').pop()).join(' '), prets: typeof t === 'function' && !!window.OrbeTheme && !!window.renderPlayers && !!window.fxStart && typeof send === 'function' && !!window.libPeek && !!window.folderPeek }; })()`);
    check('coque : tous ses scripts sont différés (demandés ensemble, exécutés dans l’ordre de la page), et tous ont tourné',
      r.n >= 7 && r.differes === r.n && r.ordre.startsWith('common.js ') && r.ordre.indexOf('shell.js') < r.ordre.indexOf('libpeek.js') && r.prets, JSON.stringify(r));
  }

  // --- Vues d'appoint : nées de la coque, dans son processus -----------------------
  if (ctx.modalAtStart !== undefined) check('la vue modale n’est pas créée avec la fenêtre : elle attend l’affichage de la coque', ctx.modalAtStart === null);
  await until(() => w.modal && !w.modal.webContents.isLoading() && w.spares.some((s) => s.ready), 'vue modale et réserve prêtes');
  const shellPid = pidOf(w.ui);
  {
    // La réserve de vues n'est demandée à la coque qu'une fois la barre latérale rendue (démarrage : section 8 bis).
    let n = 0;
    w.afterFirstRender(() => { n += 1; });
    await until(() => n === 1, 'barre latérale rendue');
    const uiWc = w.ui.webContents;
    const realJs = uiWc.executeJavaScript;
    uiWc.executeJavaScript = () => new Promise(() => {}); // coque qui ne présente aucune image (fenêtre masquée)
    let late = -1;
    const t0 = Date.now();
    w.afterFirstRender(() => { late = Date.now() - t0; });
    await sleep(120);
    const early = late;
    await until(() => late >= 0, 'filet de sécurité').catch(() => {});
    uiWc.executeJavaScript = realJs;
    await sleep(60);
    check('réserve de vues : demandée après le premier rendu de la barre latérale, une seule fois ; sans image présentée, après un délai borné', n === 1 && early === -1 && late >= 300 && late < 3000, `${n} ${early} ${late}`);
  }
  check('la vue modale naît de la coque : même processus de rendu, adresse à son nom',
    pidOf(w.modal) === shellPid && w.modal.webContents.getURL() === 'orbe://app/overlay.html#modal', `${pidOf(w.modal)} / ${shellPid} ${w.modal.webContents.getURL()}`);
  const prefs = w.modal.webContents.getLastWebPreferences();
  check('elle garde le bac à sable, l’isolation du contexte et le pont de l’interface',
    prefs.sandbox === true && prefs.contextIsolation === true && prefs.nodeIntegration === false && prefs.nodeIntegrationInSubFrames === false
    && prefs.nodeIntegrationInWorker === false && prefs.webviewTag === false && prefs.webSecurity === true && prefs.allowRunningInsecureContent === false
    && Object.keys(win.UI_PREFS).every((k) => k === 'preload' || prefs[k] === win.UI_PREFS[k]) && win.trusted.has(w.modal.webContents)
    && await w.modal.webContents.executeJavaScript('typeof window.orbe === "object" && typeof window.orbe.send === "function" && typeof require === "undefined"'), JSON.stringify(prefs));
  w.toast('Essai');
  await until(() => w.toastView && w.win.contentView.children.includes(w.toastView), 'notification affichée');
  const hadTab = !!w.activeId;
  const tmp = hadTab ? null : w.newTab(page('Appoint'));
  if (tmp) await until(() => w.data.tabs[tmp.id].title === 'Appoint', 'onglet d’essai');
  w.openFind();
  await until(() => w.findView && w.findView.webContents.executeJavaScript('!document.getElementById("find").hidden'), 'recherche affichée');
  check('notification et recherche dans la page : aucune ne démarre de processus',
    pidOf(w.toastView) === shellPid && pidOf(w.findView) === shellPid && w.findView.webContents.getURL().endsWith('#find') && w.toastView.webContents.getURL().endsWith('#toast'),
    `${pidOf(w.toastView)} ${pidOf(w.findView)} / ${shellPid}`);
  w.closeFind();
  const uiViews = [w.ui, w.modal, w.toastView, w.findView, ...w.spares.map((s) => s.view)];
  check('toute l’interface de la fenêtre tient dans un seul processus de rendu', new Set(uiViews.map(pidOf)).size === 1, [...new Set(uiViews.map(pidOf))].join(' '));

  // Barre latérale masquée : la barre flottante est préparée par la coque, dans son processus.
  {
    const wasVisible = w.sidebarVisible;
    if (wasVisible) w.toggleSidebar(false);
    await until(() => w.floatView || w.spares.some((s) => s.ready && s.page === 'shell.html#flottant'), 'barre flottante préparée');
    w.setPeek(true);
    await until(() => w.floatView && w.floatView.webContents.executeJavaScript('typeof S === "object" && S !== null && document.documentElement.classList.contains("floating")', true), 'barre flottante affichée');
    check('barre latérale masquée : la barre flottante naît elle aussi de la coque', pidOf(w.floatView) === shellPid && w.floatView.webContents.getURL() === 'orbe://app/shell.html#flottant', `${pidOf(w.floatView)} / ${shellPid}`);
    w.setPeek(false);
    if (wasVisible) w.toggleSidebar(true);
    await sleep(300);
  }

  // Une vue prise dans la réserve a été chargée plus tôt : elle reçoit les couleurs du moment.
  {
    await until(() => w.spares.some((s) => s.ready), 'réserve prête');
    const seen = [];
    for (const sp of w.spares.filter((x) => x.ready)) { const wc = sp.view.webContents; const send = wc.send.bind(wc); wc.send = (ch, ...a) => { seen.push(ch); return send(ch, ...a); }; }
    const taken = w.makeUiView('overlay.html#essai');
    await until(() => taken.webContents.getURL().endsWith('#essai'), 'vue prise dans la réserve');
    check('une vue prise dans la réserve reçoit les couleurs de l’Espace affiché', seen.includes('theme') && pidOf(taken) === shellPid, seen.join());
    taken.webContents.close();
    await sleep(150);
  }

  // La coque n'ouvre rien d'elle-même, et une vue d'appoint ne va nulle part ailleurs.
  const strays = () => webContents.getAllWebContents().filter((wc) => /settings\.html|shell\.html$|exemple\.invalid|about:blank/.test(wc.getURL()) && wc !== w.ui.webContents).length
    + Math.max(0, webContents.getAllWebContents().filter((wc) => wc.getURL().endsWith('#modal')).length - OrbeWindow.all.length);
  const before = strays();
  const opened = await ui('[window.open("orbe://app/overlay.html#modal"), window.open("orbe://app/settings.html"), window.open("https://exemple.invalid/"), window.open("about:blank")].map(String).join()');
  await sleep(150);
  check('la coque ne peut ouvrir aucune fenêtre de son propre chef', opened === 'null,null,null,null' && strays() === before, `${opened} ${strays()}/${before}`);
  const spare = w.spares.find((s) => s.ready);
  const spareUrl = spare.view.webContents.getURL();
  await spare.view.webContents.executeJavaScript('location.href = "https://exemple.invalid/"; window.open("orbe://app/shell.html"); 1', true).catch(() => {});
  await w.modal.webContents.executeJavaScript('location.href = "orbe://app/settings.html"; 1', true).catch(() => {});
  await sleep(200);
  check('une vue d’appoint ne peut ni changer de page ni ouvrir de fenêtre',
    spare.view.webContents.getURL() === spareUrl && w.modal.webContents.getURL() === 'orbe://app/overlay.html#modal' && strays() === before);

  // Barre de commande demandée avant la fin du chargement de sa vue : le message attend.
  {
    const w2 = new OrbeWindow();
    w2.openCommand(); // la coque de cette fenêtre n'a pas encore chargé : la vue naît à part
    const own = w2.modal;
    await until(() => own.webContents.executeJavaScript('!document.getElementById("command").hidden'), 'barre de commande affichée dès le chargement');
    check('barre de commande demandée dès l’ouverture de la fenêtre : elle s’affiche quand même', w2.modalMode === 'command' && w2.modal === own);
    w2.hideModal();

    // Processus de la coque perdu : l'interface revient d'elle-même.
    await until(() => w2.ui.webContents.executeJavaScript('typeof S === "object" && S !== null', true), 'coque de la seconde fenêtre');
    await until(() => w2.spares.some((s) => s.ready), 'réserve de la seconde fenêtre');
    w2.toast('Avant');
    await until(() => w2.toastView, 'notification de la seconde fenêtre');
    const lost = pidOf(w2.ui);
    w2.wanted.push({ page: 'overlay.html#reserve', url: 'orbe://app/overlay.html#perime' }); // demande restée en plan
    const born = w2.toastView;
    const bornWc = born.webContents;
    w2.ui.webContents.forcefullyCrashRenderer();
    await until(() => pidOf(w2.ui) && pidOf(w2.ui) !== lost && w2.ui.webContents.executeJavaScript('typeof S === "object" && S !== null && S.space.id', true), 'coque rechargée', 15000);
    await until(() => w2.spares.some((s) => s.ready), 'réserve reconstituée', 15000);
    w2.toast('Après');
    await until(() => w2.toastView && w2.toastView !== born && w2.win.contentView.children.includes(w2.toastView), 'notification après la reprise');
    check('processus de la coque perdu : la coque se recharge, ses vues d’appoint renaissent avec elle',
      bornWc.isDestroyed() && !w2.wanted.some((x) => x.url.endsWith('#perime')) && pidOf(w2.toastView) === pidOf(w2.ui) && await w2.ui.webContents.executeJavaScript('S.space.id', true) === w2.spaceId);
    w2.win.close();
    await until(() => !OrbeWindow.all.includes(w2), 'seconde fenêtre fermée');
  }

  // --- Fichiers de l'interface servis depuis la mémoire ----------------------------
  const stats = { ...sessions.uiStats };
  const codes = await ui(`Promise.all(['overlay.html', 'absent.html', '%2e%2e/main/main.js', '..%2fpreload/ui.js'].map((p) => fetch('orbe://app/' + p).then((r) => r.status + ':' + (r.headers.get('content-type') || '').split(';')[0], () => 'refus'))).then((a) => a.join(' '))`);
  check('fichiers de l’interface : servis depuis la mémoire, rien hors du dossier de l’interface',
    codes.startsWith('200:text/html ') && !/200.*200/.test(codes) && sessions.uiStats.hits > stats.hits && sessions.uiStats.reads === stats.reads, `${codes} ${JSON.stringify(sessions.uiStats)}`);

  // --- Extensions : rien dans les pages web tant qu'aucune n'est chargée -------------
  {
    const ses = w.session;
    const ids = () => ses.getPreloadScripts().map((s) => s.id).filter((id) => id.startsWith('orbe-ext')).sort().join();
    const none = !ses.extensions.getAllExtensions().length;
    if (none) check('sans extension : le script des extensions n’est enregistré sur aucune page web', ids() === '', ids());
    const ext = await ses.extensions.loadExtension(path.join(__dirname, 'ext-fixture-sans'));
    check('dès qu’une extension est chargée, son script de complément est en place (pages et service workers)', ids() === 'orbe-ext-frame,orbe-ext-worker', ids());
    if (none) ses.extensions.removeExtension(ext.id);
  }

  // --- Barre de commande : recherche incrémentale ---------------------------------
  {
    const kept = store.state.history;
    const h = {};
    for (let i = 0; i < 400; i++) { const url = `https://${i % 2 ? 'pagaie' : 'montagne'}${i}.exemple.fr/`; h[url] = { url, visits: 1 + (i % 5), last: Date.now() - i * 1000, title: i % 7 ? 'Titre ' + i : 'Pagination ' + i }; }
    store.state.history = h;
    const opts = { tabs: [], commands: [], activeId: null };
    suggest.forget();
    suggest.local('pa', opts);
    const full = suggest.stats.scanned;
    const next = suggest.local('pagai', opts);
    const narrowed = { ...suggest.stats };
    suggest.forget();
    const fresh = suggest.local('pagai', opts);
    check('saisie prolongée : seules les entrées déjà retenues sont relues, avec le même résultat',
      full === 400 && narrowed.incremental && narrowed.scanned < 300 && JSON.stringify(next) === JSON.stringify(fresh), `${full} → ${narrowed.scanned}`);
    suggest.local('pagai', opts);
    store.visit('https://pagaie-nouvelle.exemple.fr/', 'Pagaie neuve');
    const after = suggest.local('pagaie-nouv', opts);
    check('l’historique change entre deux frappes : la recherche repart de tout l’historique',
      !suggest.stats.incremental && after.some((x) => x.url === 'https://pagaie-nouvelle.exemple.fr/'));
    suggest.local('montagne', opts);
    check('saisie différente (pas un prolongement) : recherche complète', !suggest.stats.incremental);
    store.state.history = kept;
    suggest.forget();
  }

  // --- Icônes devinées : une seule demande par site ---------------------------------
  {
    const r = await ui(`(() => {
      const page = 'https://sans-icone.invalid/page';
      const first = guessIcon(page);
      const img = faviconEl(first, 'S');
      img.dispatchEvent(new Event('error'));
      const real = faviconEl('https://autre.invalid/icone.png', 'A');
      real.dispatchEvent(new Event('error'));
      return [first, guessIcon(page), guessIcon('https://sans-icone.invalid/autre'), guessIcon('https://autre.invalid/x'), guessIcon('http://clair.invalid/')].join(' | ');
    })()`);
    check('/favicon.ico d’un site qui n’en a pas n’est demandé qu’une fois', r === 'https://sans-icone.invalid/favicon.ico |  |  | https://autre.invalid/favicon.ico | ', r);
  }

  // --- Veille des onglets -----------------------------------------------------------
  {
    const t = (id, age, extra = {}) => ({ id, lastUsed: 1e6 - age, mb: 100, ...extra });
    const ids = (list) => list.map((p) => p.id + ':' + p.why).join(' ');
    const now = 1e6;
    check('veille, nombre : les plus anciens d’abord, jamais un onglet affiché ou qui joue',
      ids(veille.pick([t('a', 50), t('b', 40, { kept: true }), t('c', 30), t('d', 20), t('e', 10)], { max: 3, now })) === 'a:count c:count');
    check('veille, ancienneté : un onglet resté trop longtemps sans être vu s’endort, sauf si l’on y a saisi du texte',
      ids(veille.pick([t('a', 500), t('b', 400, { typed: true }), t('c', 300, { kept: true }), t('d', 20)], { max: 30, idleMs: 100, now })) === 'a:idle');
    const six = [t('a', 60), t('b', 50, { typed: true }), t('c', 40), t('d', 30), t('e', 20), t('f', 10)];
    check('veille, mémoire : au-delà du budget, les plus anciens s’endorment jusqu’à y revenir',
      ids(veille.pick(six, { max: 30, budgetMb: 350, totalMb: 600, now })) === 'a:memory c:memory');
    check('veille, mémoire : jamais moins de quatre onglets vivants, et rien sous le budget',
      veille.pick(six, { max: 30, budgetMb: 10, totalMb: 600, now }).length === 2 && veille.pick(six, { max: 30, budgetMb: 600, totalMb: 600, now }).length === 0);
    check('budget mémoire : une part de la mémoire de la machine', veille.budget(8 * 1024 ** 3, 25) === 2048);

    const s = store.state.settings;
    const saved = { sleepAfterHours: s.sleepAfterHours, memoryBudget: s.memoryBudget, maxLiveTabs: s.maxLiveTabs };
    Object.assign(s, { sleepAfterHours: 3, memoryBudget: 0, maxLiveTabs: 60 });
    const tabs = ['Veille A', 'Veille B', 'Veille C'].map((title) => w.newTab(page(title), { background: true }));
    await until(() => tabs.every((x) => w.data.tabs[x.id].title.startsWith('Veille')), 'onglets d’essai chargés');
    const rendu = () => app.getAppMetrics().filter((m) => m.type === 'Tab').length;
    const mem = win.tabMemory();
    check('mémoire relevée par onglet et au total (processus comptés une fois)', mem.total > 0 && tabs.every((x) => mem.of(x.id) > 0) && mem.total >= tabs.reduce((a, x) => a + mem.of(x.id), 0) - 1,
      JSON.stringify({ total: mem.total, parOnglet: tabs.map((x) => mem.of(x.id)), processus: tabs.map((x) => { try { return win.live.get(x.id).wc.getOSProcessId(); } catch { return null; } }) }));
    const count0 = rendu();
    const old = Date.now() - 4 * 36e5;
    for (const x of tabs) win.live.get(x.id).lastUsed = old;
    // Une vraie frappe dans la page B : elle ne s'endormira pas toute seule.
    const typedWc = win.live.get(tabs[1].id).wc;
    await typedWc.executeJavaScript('document.getElementById("champ").focus()', true);
    typedWc.sendInputEvent({ type: 'keyDown', keyCode: 'a' });
    typedWc.sendInputEvent({ type: 'char', keyCode: 'a' });
    typedWc.sendInputEvent({ type: 'keyUp', keyCode: 'a' });
    await until(() => win.live.get(tabs[1].id).typed, 'frappe vue dans la page');
    check('aucune mise en veille par ancienneté à l’activation d’un onglet (seulement au passage de fond)', OrbeWindow.trimLive().length === 0 && tabs.every((x) => win.live.has(x.id)));
    await until(() => tabs.every((x) => !win.live.get(x.id).loading), 'onglets d’essai au repos');
    const slept = OrbeWindow.trimLive({ deep: true });
    await until(() => !win.live.has(tabs[0].id) && !win.live.has(tabs[2].id), 'onglets anciens endormis').catch(() => {});
    check('passage de fond : les onglets non vus depuis 3 h s’endorment ; celui où l’on a écrit reste',
      slept.filter((p) => p.why === 'idle').map((p) => p.id).sort().join() === [tabs[0].id, tabs[2].id].sort().join() && !win.live.has(tabs[0].id) && !win.live.has(tabs[2].id) && win.live.has(tabs[1].id) && !!w.data.tabs[tabs[0].id],
      JSON.stringify(slept));
    await until(() => rendu() <= count0 - 2, 'processus des onglets endormis rendus', 15000).catch(() => {});
    check('deux onglets endormis : deux processus de rendu en moins', rendu() <= count0 - 2, `${count0} → ${rendu()}`);

    // --- Relecture de sécurité : ce que la veille automatique ne doit jamais emporter ---
    {
      const fresh = async (titles, html = page) => {
        const list = titles.map((title) => w.newTab(html(title), { background: true }));
        await until(() => list.every((x) => w.data.tabs[x.id].title === titles[list.indexOf(x)] && !win.live.get(x.id).loading), 'onglets d’essai');
        return list;
      };
      const age = (x) => { win.live.get(x.id).lastUsed = old; };
      const settle = () => sleep(700);
      const before = w.activeId;

      // 1. « Dernière utilisation » = dernier instant à l'écran.
      const [longue, autre, volet] = await fresh(['Longue', 'Autre', 'Volet']);
      w.activate(longue.id);
      age(longue); // affichée depuis quatre heures, sans y revenir
      OrbeWindow.trimLive({ deep: true });
      const stamped = Date.now() - win.live.get(longue.id).lastUsed < 5000;
      age(longue);
      w.activate(autre.id); // on la quitte à l'instant
      for (const x of [autre]) age(x);
      OrbeWindow.trimLive({ deep: true });
      await settle();
      check('un onglet resté longtemps à l’écran ne s’endort pas dès qu’on le quitte : le délai court depuis qu’il est caché',
        stamped && win.live.has(longue.id) && Date.now() - win.live.get(longue.id).lastUsed < 5000);
      w.splitWith(autre.id, volet.id);
      await until(() => w.visibleIds().includes(volet.id) && w.visibleIds().includes(autre.id), 'vue scindée');
      age(volet); age(autre);
      OrbeWindow.trimLive({ deep: true });
      w.leaveSplit(volet.id);
      w.activate(longue.id);
      win.live.get(longue.id).typed = false;
      OrbeWindow.trimLive({ deep: true });
      await settle();
      check('le volet d’une vue scindée compte comme affiché : il ne s’endort pas en la quittant', win.live.has(volet.id) && win.live.has(autre.id));
      win.live.get(volet.id).lastUsed = old;
      win.live.get(volet.id).typed = false;
      OrbeWindow.trimLive({ deep: true });
      await until(() => !win.live.has(volet.id), 'volet endormi une fois le délai passé').catch(() => {});
      check('… et s’endort bien une fois le délai écoulé depuis qu’il est caché', !win.live.has(volet.id));

      // 2. Toute façon d'agir dans la page épargne l'onglet.
      const kinds = {
        'Coller': (wc) => wc.sendInputEvent({ type: 'keyDown', keyCode: 'V', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] }),
        'AltGr': (wc) => wc.sendInputEvent({ type: 'keyDown', keyCode: '@', modifiers: ['control', 'alt'] }),
        'Effacer': (wc) => wc.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' }),
        'Entrée': (wc) => wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' }),
        'Souris': (wc) => { wc.sendInputEvent({ type: 'mouseDown', x: 30, y: 30, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: 30, y: 30, button: 'left', clickCount: 1 }); },
      };
      const acted = await fresh(Object.keys(kinds));
      const [lu] = await fresh(['Seulement lu']);
      for (const x of acted) { const wc = win.live.get(x.id).wc; wc.focus(); kinds[w.data.tabs[x.id].title](wc); }
      win.live.get(lu.id).wc.sendInputEvent({ type: 'mouseWheel', x: 30, y: 30, deltaY: -40 });
      win.live.get(lu.id).wc.sendInputEvent({ type: 'keyDown', keyCode: 'Shift' });
      await until(() => acted.every((x) => win.live.get(x.id).typed), 'gestes vus', 4000).catch(() => {});
      const missed = acted.filter((x) => !win.live.get(x.id).typed).map((x) => w.data.tabs[x.id].title).join();
      for (const x of [...acted, lu]) age(x);
      OrbeWindow.trimLive({ deep: true });
      await until(() => !win.live.has(lu.id), 'onglet seulement lu endormi').catch(() => {});
      check('coller, AltGr, Suppr, Entrée, clic : l’onglet où l’on a agi ne s’endort pas de lui-même ; lire (molette, touche Maj seule) ne compte pas',
        !missed && acted.every((x) => win.live.has(x.id)) && !win.live.has(lu.id), missed || acted.filter((x) => !win.live.has(x.id)).length + ' endormis');
      check('limite en nombre : les onglets où l’on n’a pas agi partent d’abord',
        veille.pick([t('a', 50, { typed: true }), t('b', 40), t('c', 30), t('d', 20)], { max: 2, now }).map((p) => p.id).join() === 'b,c'
        && veille.pick([t('a', 50, { typed: true }), t('b', 40, { typed: true }), t('c', 30)], { max: 1, now }).map((p) => p.id).join() === 'c,a');

      // La page s'y oppose (beforeunload) : elle reste, sans aucune question.
      const unload = require('../src/main/unload');
      const [tient] = await fresh(['Tient'], (title) => 'data:text/html;charset=utf-8,' + encodeURIComponent(`<title>${title}</title><p>${title}</p><script>addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = 'x'; });</script>`));
      const twc = win.live.get(tient.id).wc;
      kinds.Souris(twc); // Chromium n'écoute beforeunload qu'après un geste dans la page
      await until(() => win.live.get(tient.id).typed, 'geste dans la page qui tient');
      const asked = unload.state.asked;
      Object.assign(win.live.get(tient.id), { typed: false, lastUsed: old }); // comme si le geste nous avait échappé
      OrbeWindow.trimLive({ deep: true });
      await until(() => win.live.get(tient.id) && win.live.get(tient.id).objected, 'refus de la page', 5000).catch(() => {});
      const rtT = win.live.get(tient.id);
      check('la page refuse la veille (beforeunload) : elle reste vivante, aucune question n’est posée, et elle n’est plus proposée',
        !!rtT && rtT.objected === true && !twc.isDestroyed() && unload.state.asked === asked && OrbeWindow.trimLive({ deep: true }).every((p) => p.id !== tient.id));

      // 3. Image dans l'image, téléchargement en cours.
      const [pip, dl] = await fresh(['Incrustée', 'Télécharge']);
      win.live.get(pip.id).pip = true;
      win.noteDownload('start', { id: 'essai-dl', state: 'progressing' }, win.live.get(dl.id).wc);
      age(pip); age(dl);
      OrbeWindow.trimLive({ deep: true });
      await settle();
      const keptBoth = win.live.has(pip.id) && win.live.has(dl.id);
      win.live.get(pip.id).pip = false;
      win.noteDownload('done', { id: 'essai-dl', state: 'completed' }, win.live.get(dl.id).wc);
      OrbeWindow.trimLive({ deep: true });
      await until(() => !win.live.has(pip.id) && !win.live.has(dl.id), 'onglets libérés endormis').catch(() => {});
      check('image dans l’image ou téléchargement en cours : l’onglet reste ; ensuite il peut s’endormir', keptBoth && !win.live.has(pip.id) && !win.live.has(dl.id));

      // 5. Textes venus des pages : bornés avant d'atteindre l'interface.
      const lwc = win.live.get(longue.id).wc;
      lwc.emit('page-favicon-updated', {}, ['data:image/png;base64,' + 'A'.repeat(win.ICON_MAX)]);
      const iconDropped = w.data.tabs[longue.id].favicon === '';
      lwc.emit('page-favicon-updated', {}, ['https://exemple.invalid/icone.png']);
      let statusText = null;
      w.linkStatus(win.live.get(longue.id), 'https://exemple.invalid/');
      await until(() => w.statusView && !w.statusView.webContents.isLoading(), 'vue de l’adresse survolée');
      const sv = w.statusView.webContents;
      const realSend = sv.send.bind(sv);
      sv.send = (ch, a) => { if (ch === 'overlay' && a && a.mode === 'status') statusText = a.text; return realSend(ch, a); };
      lwc.emit('update-target-url', {}, 'https://exemple.invalid/?' + 'a'.repeat(3 * win.STATUS_MAX));
      await until(() => statusText !== null, 'adresse survolée transmise');
      sv.send = realSend;
      lwc.emit('update-target-url', {}, '');
      check('icône démesurée refusée, adresse survolée coupée avant d’être envoyée à l’interface',
        iconDropped && w.data.tabs[longue.id].favicon === 'https://exemple.invalid/icone.png' && statusText.length === win.STATUS_MAX, String(statusText && statusText.length));
      check('coque perdue à répétition : les reprises s’espacent mais ne cessent jamais',
        win.uiRetryDelay(1) === 150 && win.uiRetryDelay(3) === 150 && win.uiRetryDelay(4) === 5000 && win.uiRetryDelay(5) === 10000 && win.uiRetryDelay(40) === 60000);

      for (const x of [longue, autre, volet, ...acted, lu, tient, pip, dl]) if (w.data.tabs[x.id]) w.close(x.id, { silent: true, ask: false });
      if (before && w.data.tabs[before]) w.activate(before);
    }

    // Onglet en veille survolé : la connexion est préparée, la page n'est pas chargée.
    const calls = [];
    const real = w.session.preconnect;
    w.session.preconnect = (o) => { calls.push(o.url); };
    const asleep = w.createTab('https://reveil.exemple.invalid/page');
    asleep.title = 'Réveil';
    const plain = w.createTab('http://clair.exemple.invalid/');
    OrbeWindow.pushAll();
    check('survol d’un onglet en veille : pré-connexion à son site, une seule fois, sans charger la page',
      w.prewake(asleep.id) === true && w.prewake(asleep.id) === false && calls.join() === 'https://reveil.exemple.invalid' && !win.live.has(asleep.id) && !store.state.history['https://reveil.exemple.invalid/page']);
    check('pas de pré-connexion pour un onglet vivant, une adresse en clair ou un identifiant inconnu',
      w.prewake(tabs[1].id) === false && w.prewake(plain.id) === false && w.prewake('inconnu') === false && w.prewake({}) === false && calls.length === 1);
    const priv = new OrbeWindow({ incognito: true });
    const privTab = priv.createTab('https://prive.exemple.invalid/');
    check('jamais de pré-connexion en navigation privée', priv.prewake(privTab.id) === false && calls.length === 1);
    priv.win.close();
    // La barre latérale signale le survol après 150 ms.
    const other = w.createTab('https://survol.exemple.invalid/');
    other.title = 'Survol';
    OrbeWindow.pushAll();
    await until(() => ui(`!!document.querySelector('#today .row.tab[data-id="${other.id}"]')`), 'ligne de l’onglet en veille');
    await ui(`document.querySelector('#today .row.tab[data-id="${other.id}"]').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))`);
    await until(() => calls.includes('https://survol.exemple.invalid'), 'pré-connexion au survol');
    check('la barre latérale signale le survol d’un onglet en veille', calls.length === 2);
    w.session.preconnect = real;
    for (const x of [asleep, plain, other, ...tabs]) w.close(x.id, { silent: true, ask: false });

    // --- Sites gardés éveillés par l'utilisateur (MEM-9) et empreinte réelle (MEM-8) ---
    {
      const keepalive = require('../src/main/keepalive');
      const mine = { neverSleep: ['exemple.fr/outil', 'messagerie.test', 'localhost:3000'] };
      check('sites gardés éveillés : le site, ses sous-domaines, son port et son début de chemin — jamais un texte trouvé ailleurs dans l’adresse',
        keepalive.user('https://git.exemple.fr/outil/1', mine) && keepalive.user('https://www.messagerie.test/x?y', mine) && keepalive.user('http://localhost:3000/', mine)
        && !keepalive.user('https://git.exemple.fr/autre', mine) && !keepalive.user('https://pirate.invalid/?u=https://messagerie.test/', mine) && !keepalive.user('https://messagerie.test.pirate.invalid/', mine)
        && !keepalive.user('http://localhost:4000/', mine) && !keepalive.user('file:///messagerie.test/', mine) && !keepalive.user('', mine) && !keepalive.user('https://messagerie.test/', {}));
      check('un seul mécanisme : la liste d’Orbe et celle de l’utilisateur passent par la même question, posée une fois par la veille',
        keepalive.matches('https://mail.google.com/mail/u/0/', {}) && keepalive.matches('https://git.exemple.fr/outil/1', mine) && !keepalive.matches('https://git.exemple.fr/outil/1', {}) && !keepalive.matches('https://exemple.org/', mine)
        && typeof veille.spared === 'undefined' && (fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'window.js'), 'utf8').match(/keepalive\.matches\(/g) || []).length === 1);
      const prefs = require('../src/main/prefs');
      check('réglage « neverSleep » : seules des règles bien écrites, sans doublon, cent au plus',
        prefs.SETTABLE.neverSleep(['github.com', 'exemple.fr/outil', 'localhost:3000']) && !prefs.SETTABLE.neverSleep(['https://GitHub.com/']) && !prefs.SETTABLE.neverSleep(['a.fr', 'a.fr'])
        && !prefs.SETTABLE.neverSleep(['<script>']) && !prefs.SETTABLE.neverSleep('a.fr') && !prefs.SETTABLE.neverSleep(Array(101).fill(0).map((_, i) => `s${i}.fr`)));

      // Un vrai site local : 127.0.0.1 est dans la liste de l'utilisateur, « localhost » (autre site) non.
      const http = require('http');
      const server = http.createServer((req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(`<title>Site ${req.headers.host.split(':')[0]}</title><p>veille</p>`); });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const port = server.address().port;
      const garde = w.newTab(`http://127.0.0.1:${port}/a`, { background: true });
      const libre = w.newTab(`http://localhost:${port}/a`, { background: true });
      await until(() => w.data.tabs[garde.id].title === 'Site 127.0.0.1' && w.data.tabs[libre.id].title === 'Site localhost' && !win.live.get(garde.id).loading && !win.live.get(libre.id).loading, 'sites locaux chargés');
      s.neverSleep = [`127.0.0.1:${port}`];
      const vieux = Date.now() - 4 * 36e5;
      win.live.get(garde.id).lastUsed = vieux;
      win.live.get(libre.id).lastUsed = vieux;
      const pris = OrbeWindow.trimLive({ deep: true }).map((p) => p.id);
      await until(() => !win.live.has(libre.id), 'site hors liste endormi').catch(() => {});
      check('veille automatique : le site de la liste « restent éveillés » ne s’endort pas, l’autre site oui',
        pris.includes(libre.id) && !pris.includes(garde.id) && win.live.has(garde.id) && !win.live.has(libre.id), JSON.stringify(pris));
      check('… et le dernier passage dit ce qu’il a relevé', !!win.lastSweep() && win.lastSweep().at > 0 && win.lastSweep().totalMb > 0);
      s.neverSleep = [];
      win.live.get(garde.id).lastUsed = vieux;
      OrbeWindow.trimLive({ deep: true });
      await until(() => !win.live.has(garde.id), 'site retiré de la liste endormi').catch(() => {});
      check('… retiré de la liste, il s’endort au passage suivant', !win.live.has(garde.id));
      // Barre latérale : la ligne d'un onglet en veille n'a plus la classe « live » (titre plus pâle).
      let rows = null;
      await until(() => ui(`(() => { const r = document.querySelector('.row.tab[data-id="${garde.id}"]'); return !!r && !r.classList.contains('live'); })()`), 'ligne de l’onglet endormi').catch(() => {});
      check('barre latérale : la ligne d’un onglet en veille est marquée (plus pâle), celle d’un onglet vivant ne l’est pas',
        (rows = await ui(`(() => { const z = document.querySelector('.row.tab[data-id="${garde.id}"]'); const v = document.querySelector('.row.tab[data-id="${w.activeId}"]'); return { z: !!z, v: !!v, zl: !!z && z.classList.contains('live'), vl: !!v && v.classList.contains('live'), zc: z && getComputedStyle(z.querySelector('.title')).color, vc: v && getComputedStyle(v.querySelector('.title')).color, va: !!v && v.classList.contains('active') }; })()`))
        && rows.z && rows.v && !rows.zl && rows.vl && rows.zc !== rows.vc, JSON.stringify(rows));
      for (const x of [garde, libre]) w.close(x.id, { silent: true, ask: false });
      server.close();

      // Empreinte réelle.
      const e = require('../src/main/empreinte');
      const lu = e.parse('Processes: 550 total\n\nPID    MEM\n15790  30M\n15785* 43M+\n77     1024K-\n88     2G\n99     512B\nabc    12M\n');
      check('empreinte : la colonne MEM de top est lue en Mo (K, M, G, signes de variation), le reste est ignoré',
        lu.size === 5 && lu.get(15790) === 30 && lu.get(15785) === 43 && lu.get(77) === 1 && lu.get(88) === 2048 && Math.abs(lu.get(99) - 512 / 1048576) < 1e-9);
      const realExec = e.state.exec;
      const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      const reset = () => Object.assign(e.state, { at: 0, byPid: new Map(), total: 0, running: null, failed: 0 });
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      try {
        reset();
        const procs = win.tabProcesses();
        let asked = null;
        e.state.exec = (file, args, opts, cb) => { asked = { file, args }; setImmediate(() => cb(null, 'PID MEM\n' + procs.map((p) => `${p.pid}  1G`).join('\n') + '\n')); };
        const before = win.tabMemory();
        const d0 = e.due({ budgetMb: 4000, tabs: 9, minTabs: 4 });
        const ok = await e.refresh(procs);
        const after = win.tabMemory();
        check('empreinte : relevée par un processus à part (top, un -pid par processus d’onglet), puis utilisée à la place de la mémoire résidente',
          // Sous Windows, `privateBytes` est déjà l'empreinte réelle : le relevé de top n'y est jamais consulté.
          (realPlatform.value !== 'darwin' && d0 && ok && before.real && after.real && Math.round(after.total) !== 1024 * procs.length) || (d0 && ok && asked.file === '/usr/bin/top' && asked.args.filter((x) => x === '-pid').length === procs.length && procs.length > 0
          && !before.real && after.real && Math.round(after.total) === 1024 * procs.length), JSON.stringify({ d0, ok, n: procs.length, total: after.total }));
        const now = Date.now();
        check('empreinte : pas de nouveau relevé avant cinq minutes loin du budget, toutes les minutes près du budget, jamais sans budget ni au-dessous de quatre onglets',
          !e.due({ budgetMb: 1e6, tabs: 9, minTabs: 4, now: now + 2 * 60e3 }) && e.due({ budgetMb: 1e6, tabs: 9, minTabs: 4, now: now + 5 * 60e3 + 10 })
          && !e.due({ budgetMb: 1024 * procs.length, tabs: 9, minTabs: 4, now: now + 30e3 }) && e.due({ budgetMb: 1024 * procs.length, tabs: 9, minTabs: 4, now: now + 61e3 })
          && !e.due({ budgetMb: 0, tabs: 9, minTabs: 4, now: now + 10 * 60e3 }) && !e.due({ budgetMb: 1e6, tabs: 4, minTabs: 4, now: now + 10 * 60e3 }));
        const p0 = procs[0];
        check('empreinte : un relevé trop ancien ne vaut plus, ni pour un processus né depuis sous le même numéro',
          e.of(p0.pid, p0.creationTime) === 1024 && e.of(p0.pid, p0.creationTime, now + e.FRESH + 1000) === undefined && e.of(p0.pid, p0.creationTime + 5000) === undefined);
        reset();
        e.state.exec = (file, args, opts, cb) => setImmediate(() => cb(new Error('absent'), ''));
        const r1 = await e.refresh(procs); await e.refresh(procs); await e.refresh(procs);
        check('empreinte : top absent ou muet, rien ne casse — la mémoire résidente sert, et on n’insiste pas',
          r1 === false && win.tabMemory().real === (realPlatform.value === 'win32') && win.tabMemory().total > 0 && !e.due({ budgetMb: 4000, tabs: 9, minTabs: 4 }));
        reset();
        e.state.exec = realExec;
        if (realPlatform.value === 'darwin') {
          const vrai = await e.refresh(procs);
          const m = win.tabMemory();
          check('empreinte (macOS, vrai top) : chaque processus d’onglet a son empreinte', vrai && m.real && m.total > 0 && procs.every((p) => e.of(p.pid, p.creationTime) > 0), JSON.stringify({ vrai, total: m.total }));
        }
      } finally {
        Object.defineProperty(process, 'platform', realPlatform);
        e.state.exec = realExec;
        reset();
      }
    }

    // --- Gestionnaire de tâches (EXT-22) ---
    {
      const tasks = require('../src/main/tasks');
      const commands = require('../src/main/commands');
      const piege = '<img src=x onerror="window.pirate=1">Piège';
      const [cible, temoin] = ['Tâche ' + piege, 'Tâche témoin'].map((title) => w.newTab(page(title), { background: true }));
      await until(() => w.data.tabs[cible.id].title.startsWith('Tâche') && w.data.tabs[temoin.id].title === 'Tâche témoin' && !win.live.get(cible.id).loading, 'onglets du gestionnaire');
      const pidCible = win.live.get(cible.id).wc.getOSProcessId();
      const data = tasks.list();
      const row = data.rows.find((r) => r.pid === pidCible);
      const kinds = new Set(data.rows.map((r) => r.kind));
      check('gestionnaire de tâches : chaque processus dit ce qu’il porte (Orbe, interface, graphique, onglets avec leur titre), sa mémoire et son processeur',
        kinds.has('app') && kinds.has('ui') && kinds.has('gpu') && kinds.has('tab') && !!row && row.kind === 'tab' && row.titles.join().includes('Piège') && row.mb > 0 && row.canEnd === true
        && data.total >= row.mb && data.rows.every((r) => Number.isInteger(r.pid) && typeof r.cpu === 'number') && data.rows.filter((r) => r.canEnd).every((r) => r.kind === 'tab'), JSON.stringify([...kinds]));
      const uiPid = w.ui.webContents.getOSProcessId();
      const gpu = data.rows.find((r) => r.kind === 'gpu');
      check('« Arrêter » ne vaut que pour le processus d’un onglet : jamais Orbe, son interface, le processus graphique, ni un numéro quelconque',
        tasks.end(process.pid) === 0 && tasks.end(uiPid) === 0 && tasks.end(gpu.pid) === 0 && tasks.end(-1) === 0 && tasks.end(NaN) === 0 && tasks.end('1') === 0
        && !w.ui.webContents.isCrashed() && !win.live.get(cible.id).wc.isCrashed());
      commands.run(w, 'taskManager');
      const tm = await until(() => { const id = Object.keys(w.data.tabs).find((x) => w.data.tabs[x].internal && w.data.tabs[x].url.includes('tasks.html')); const rt = id && win.live.get(id); return rt && !rt.wc.isLoading() ? { id, wc: rt.wc } : null; }, 'page du gestionnaire');
      await until(() => tm.wc.executeJavaScript(`!!document.querySelector('.line[data-pid="${pidCible}"] .btn')`), 'ligne de l’onglet');
      const vu = await tm.wc.executeJavaScript(`(() => { const l = document.querySelector('.line[data-pid="${pidCible}"]'); return { name: l.querySelector('.name').textContent, imgs: document.querySelectorAll('main img').length, pirate: typeof window.pirate, boutons: [...document.querySelectorAll('.line .btn')].every((b) => b.closest('.line').dataset.kind === 'tab'), note: document.getElementById('note').textContent.length > 20 }; })()`);
      check('page du gestionnaire : un titre piégé reste du texte ; le bouton « Arrêter » n’existe que sur les lignes d’onglets',
        vu.name.includes(piege) && vu.imgs === 0 && vu.pirate === 'undefined' && vu.boutons && vu.note, JSON.stringify(vu));
      await tm.wc.executeJavaScript(`document.querySelector('.line[data-pid="${pidCible}"] .btn').click(); 1`);
      await until(() => { const rt = win.live.get(cible.id); return !rt || rt.wc.isCrashed() || rt.crashed; }, 'onglet arrêté');
      const rtT = win.live.get(temoin.id);
      check('« Arrêter » un onglet : son processus s’arrête, sa ligne reste dans la barre latérale, les autres onglets vivent', !!w.data.tabs[cible.id] && !!rtT && !rtT.wc.isCrashed());
      for (const id of [cible.id, temoin.id, tm.id]) w.close(id, { silent: true, ask: false });
    }
    Object.assign(s, saved);

    // Vignettes de la bascule ⌃Tab : huit au plus.
    const many = Array.from({ length: win.thumbs.MAX + 3 }, (_, i) => w.newTab(page('Vignette ' + i), { background: true }));
    for (const x of many) win.thumbs.keep(win.live.get(x.id), 'image');
    win.thumbs.keep(win.live.get(many[3].id), 'image'); // reprise : elle redevient la plus récente
    const withThumb = many.filter((x) => win.live.get(x.id).thumb).map((x) => many.indexOf(x)).join();
    check('vignettes de la bascule d’onglets : seules les huit dernières sont gardées', withThumb === '3,4,5,6,7,8,9,10', withThumb);
    for (const x of many) w.close(x.id, { silent: true, ask: false });
  }
  if (tmp) w.close(tmp.id, { silent: true, ask: false });

  // --- Historique : lu au premier accès, pas avant la fenêtre -------------------------
  {
    const Store = store.constructor;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-historique-'));
    fs.writeFileSync(path.join(dir, 'orbe.json'), JSON.stringify({ tabs: {} }));
    fs.writeFileSync(path.join(dir, 'history.json'), JSON.stringify({ 'https://ancien.exemple.fr/': { url: 'https://ancien.exemple.fr/', visits: 4, last: 1, title: 'Ancien' } }));
    const st = new Store();
    st.load(dir);
    const pending = st.historyPending === true && st.hadHistory === true;
    st.visit('https://neuf.exemple.fr/', 'Neuf');
    st.flush();
    const disk = JSON.parse(fs.readFileSync(path.join(dir, 'history.json'), 'utf8'));
    check('historique : le fichier n’est lu qu’au premier accès, et rien ne se perd à l’écriture suivante',
      pending && st.historyPending === false && disk['https://ancien.exemple.fr/'].visits === 4 && disk['https://neuf.exemple.fr/'].visits === 1, JSON.stringify(Object.keys(disk)));
    const empty = new Store();
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-historique-'));
    empty.load(dir2);
    check('profil neuf : pas d’historique, premier lancement reconnu sans le lire', empty.hadHistory === false && empty.historyPending === true && Object.keys(empty.state.history).length === 0);
  }

  // --- Démarrage : les outils de vérification d'un émoji ne sont construits qu'au besoin (DEM-10) ---
  {
    const file = require.resolve('../src/main/icons');
    const kept = require.cache[file];
    delete require.cache[file];
    const fresh = require(file);
    const before = fresh.loaded;
    const ok = fresh.valid('🏠') && fresh.valid('👨‍👩‍👧') && !fresh.valid('ab') && !fresh.valid('🏠🏠') && fresh.clean('') === '' && fresh.clean('x') === null;
    check('icônes : rien n’est construit au chargement du module, et la vérification reste la même', before === false && fresh.loaded === true && ok, JSON.stringify({ before, apres: fresh.loaded, ok }));
    if (kept) require.cache[file] = kept; else delete require.cache[file];
  }

  // --- Repos : aucune animation sans fin hors d'un état passager (ENER-1, ENER-2) -----
  // Une animation en cours, même minuscule, fait composer la fenêtre entière à chaque image
  // d'écran (mesuré : 200 ms de processeur graphique par seconde). Seules celles liées à un
  // état passager (chargement, capture, son d'un favori) peuvent tourner sans fin.
  {
    const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'shell.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const endless = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (/animation[^;]*\binfinite\b/.test(m[2])) endless.push(m[1].trim().replace(/\s+/g, ' '));
    const allowed = ['#capture-note', '.row.capturing .act.cap', '#url.loading::after', '#glow i', '.tile.audible .dot i', '.spinner'];
    const extra = endless.filter((x) => !allowed.includes(x));
    check('coque : aucune animation sans fin hors d’un état passager (chargement, capture, favori qui joue)', extra.length === 0 && endless.length > 0, JSON.stringify(extra.length ? extra : endless));
    const idle = await until(() => ui(`document.getAnimations().filter((x) => x.playState === 'running').length === 0`), 'coque au repos', 20000).catch(() => false);
    check('coque au repos (page fixe) : aucune animation en cours', idle === true, await ui(`JSON.stringify(document.getAnimations().filter((x) => x.playState === 'running').map((x) => (x.animationName || x.transitionProperty || x.id) + ' ' + (x.effect && x.effect.target ? x.effect.target.id || x.effect.target.className : '')))`));
  }

  if (!ctx.check && failed) throw new Error(`${failed} vérification(s) en échec`);
};
