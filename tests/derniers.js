// Derniers points : onglet réveillé puis arrêté, raccourcis dans la barre de commande,
// nouvel Espace au bout de la rangée (geste délibéré, annulable), aperçu d'un dossier au
// survol, bulle et rebond du glisser vers une vue scindée, écran de création d'un Espace.
// Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/derniers.js node scripts/dev.js --selftest
const http = require('http');
const outils = require('./outils');

const { sleep } = outils;
const until = (fn, label, timeout = 10000) => outils.until(fn, label, timeout);
const PAGER_HOLD = 90 + 450; // PAGER.idle + PAGER.createHold (src/renderer/shell.js)

module.exports = async function derniersTests(ctx) {
  const { first: w, store, win, OrbeWindow, shortcuts } = ctx;
  let failed = 0;
  const check = ctx.check || ((name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`); });
  const ui = (js) => w.ui.webContents.executeJavaScript(js);
  const d = w.data;
  const T = (k, v) => store.t(k, null, v);

  await until(() => ui('typeof S === "object" && S !== null'), 'coque chargée');
  const home = w.spaceId;
  const homeActive = w.activeBySpace[home];
  const sidebar0 = w.sidebarVisible;
  if (!w.sidebarVisible) w.toggleSidebar(true);
  const archive0 = store.state.archive.length;
  const spaces0 = d.spaces.length;

  // Pages locales ; « /lente » ne répond qu'après un délai (le temps d'arrêter le chargement).
  const hits = {};
  const server = await new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      hits[req.url] = (hits[req.url] || 0) + 1;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      const page = () => res.end(`<!doctype html><meta charset="utf-8"><title>Derniers ${req.url}</title><h1>${req.url}</h1>`);
      if (req.url === '/lente' && hits[req.url] === 1) return setTimeout(page, 1500);
      return page();
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const mine = (x) => String(x.url || '').startsWith(base);

  const space = store.makeSpace('Derniers', '🧪', '#0ea5e9');
  d.spaces.push(space);
  w.switchSpace(space.id);

  // --- Onglet réveillé, chargement arrêté, puis « Actualiser » ---------------------------
  {
    const a = w.createTab(base + '/a', { space, index: 0 });
    const b = w.createTab(base + '/lente', { space, index: 1 });
    w.activate(a.id);
    await until(() => { const rt = win.live.get(a.id); return rt && !rt.wc.isLoading() && rt.wc.getURL() === base + '/a'; }, 'page A chargée');
    OrbeWindow.destroyView(b.id); // endormi : la ligne reste, la page n'existe plus
    w.activate(b.id); // réveil : le chargement commence
    const rt = await until(() => win.live.get(b.id), 'onglet réveillé');
    await until(() => rt.wc.isLoading(), 'chargement commencé');
    w.run('stop'); // « Arrêter » (le bouton pendant le chargement, ⌘. ou Échap)
    await until(() => !rt.wc.isLoading(), 'chargement arrêté');
    const vide = rt.wc.getURL();
    w.reload(false);
    const ok = await until(() => !rt.wc.isLoading() && rt.wc.getURL() === base + '/lente' && rt.wc.getTitle() === 'Derniers /lente', 'page rechargée', 6000).then(() => true, () => false);
    check('onglet réveillé dont le chargement a été arrêté : « Actualiser » charge sa page (elle ne reste pas vide)', ok, `adresse après l’arrêt : « ${vide} », après actualiser : « ${rt.wc.getURL()} »`);
  }

  // --- Barre de commande : raccourci changé dans les Réglages --------------------------------
  {
    const keys0 = store.state.settings.shortcuts;
    const row = (name) => w.commandList().find((c) => c.command === name && !c.arg);
    // Écriture des raccourcis selon le système (⌘R sur macOS, Ctrl+R ailleurs).
    const defauts = [shortcuts.keysOf('reload'), shortcuts.keysOf('toggleSidebar')];
    const neufs = [shortcuts.display('Ctrl+Alt+R'), shortcuts.display('Ctrl+Alt+B')];
    const avant = [row('reload') && row('reload').shortcut, row('toggleSidebar') && row('toggleSidebar').shortcut];
    const r1 = shortcuts.assign('reload', 'Ctrl+Alt+R');
    const r2 = shortcuts.assign('toggleSidebar', 'Ctrl+Alt+B');
    const apres = [row('reload') && row('reload').shortcut, row('toggleSidebar') && row('toggleSidebar').shortcut];
    check('raccourci changé : la barre de commande le montre aussitôt, y compris pour une action dont le nom dépend de la fenêtre (« Masquer la barre latérale »)',
      r1.ok && r2.ok && defauts.every(Boolean) && avant.join() === defauts.join() && apres.join() === neufs.join() && neufs.join() !== defauts.join(), JSON.stringify([avant, apres]));
    const tape = w.suggestLocal(T('view.hideSidebar')).find((x) => x.command === 'toggleSidebar');
    check('… et la suggestion tapée porte le nouveau raccourci', !!tape && tape.subtitle === neufs[1], JSON.stringify(tape || null));
    store.state.settings.shortcuts = keys0;
    shortcuts.hooks.changed();
    check('… raccourcis rétablis : la barre de commande revient aux raccourcis d’origine', row('reload').shortcut === defauts[0] && row('toggleSidebar').shortcut === defauts[1]);
  }

  // --- Nouvel Espace au bout de la rangée : geste voulu, annulable (GES-2) ---------------------
  {
    w.hideModal();
    w.switchSpace(space.id);
    await until(() => ui(`!slide && S.space.id === ${JSON.stringify(space.id)} && S.near.next === null`), 'dernier Espace affiché');
    if (await ui('reducedMotion.matches')) {
      for (const n of ['balayage vif au bout de la rangée', 'tirer puis garder les doigts posés', 'tirer, puis repartir dans l’autre sens']) outils.ignorer(n, '« Réduire les animations » actif');
    } else {
      const n0 = d.spaces.length;
      // Suite d'événements de molette (px), espacés de 8 ms ; rend ce que la pastille a montré en route.
      const geste = (deltas) => ui(`(async () => { const vu = { arme: false, compte: false, max: 0 }; for (const dx of ${JSON.stringify(deltas)}) { document.getElementById('scroll').dispatchEvent(new WheelEvent('wheel', { deltaX: dx, bubbles: true, cancelable: true })); const el = document.querySelector('#pager .pager-plus'); if (el) { vu.arme = vu.arme || el.classList.contains('armed'); vu.compte = vu.compte || el.classList.contains('hold'); vu.max = Math.max(vu.max, Number(el.dataset.p)); } await new Promise((r) => setTimeout(r, 8)); } const el = document.querySelector('#pager .pager-plus'); vu.fin = el ? { arme: el.classList.contains('armed'), compte: el.classList.contains('hold') } : null; return vu; })()`);
      // 1. Balayage vif et fort, doigts levés en plein élan : l'inertie s'éteint peu à peu.
      const elan = []; for (let v = 110; v >= 1; v *= 0.93) elan.push(Math.round(v));
      const vif = await geste(elan);
      await until(() => ui('!slide'), 'retour de la liste', 4000);
      await sleep(PAGER_HOLD + 200);
      check('balayage vif au bout de la rangée, même fort (la pastille s’arme en route) : son élan s’éteint, la pastille se désarme, aucun Espace n’est créé',
        vif.arme && vif.max === 1 && !vif.compte && d.spaces.length === n0 && w.space === space, JSON.stringify(vif) + ' ' + d.spaces.length);
      // 2. Tirer, puis repartir dans l'autre sens : on renonce.
      const renonce = await geste([...Array(12).fill(70), -20, -20, -10]);
      await until(() => ui('!slide'), 'retour de la liste', 4000);
      await sleep(PAGER_HOLD + 200);
      check('tirer jusqu’à armer la pastille, puis repartir dans l’autre sens : la liste revient, aucun Espace n’est créé', renonce.arme && d.spaces.length === n0, JSON.stringify(renonce));
      // 3. Tirer franchement, puis garder les doigts posés (plus aucun événement, à un frémissement près).
      const tire = await geste([...Array(12).fill(70), 1, -1, 1]);
      check('tirer franchement au-delà du dernier Espace : la pastille s’arme (couleur de l’Espace), rien n’est créé pendant le mouvement', tire.arme && tire.fin && tire.fin.arme && d.spaces.length === n0, JSON.stringify(tire));
      await until(() => ui(`(() => { const el = document.querySelector('#pager .pager-plus.hold'); return !!el && getComputedStyle(el, '::after').animationName === 'pager-hold'; })()`), 'anneau du compte à rebours', 3000).catch(() => {});
      const anneau = await ui(`!!document.querySelector('#pager .pager-plus.hold')`) && d.spaces.length === n0;
      await until(() => w.modalMode === 'space', 'panneau de création', 4000).catch(() => {});
      const panneau = w.modalMode === 'space' && d.spaces.length === n0;
      await sleep(300); // un second déclenchement se verrait ici
      w.handle('spaceCreate', { name: '', icon: '✨', profileId: 'default' });
      const cree = d.spaces.length === n0 + 1 ? w.space : null;
      check('doigts posés, immobiles : un anneau se referme autour de la pastille, puis le panneau de création s’ouvre ; « Créer » crée l’Espace — un seul', anneau && panneau && !!cree && cree !== space && d.spaces.length === n0 + 1, `${anneau} ${panneau} ${d.spaces.length}/${n0 + 1}`);
      await until(() => ui('!slide'), 'fin du glissement', 4000);
      const msg = w.toastShown || {};
      check('le message « Nouvel Espace créé » propose « Annuler »', msg.text === T('toast.spaceCreated') && msg.label === T('edit.undo') && typeof w.toastAction === 'function', JSON.stringify(msg));
      const pile = w.undoStack.length;
      w.toastClick();
      check('clic sur « Annuler » : l’Espace créé est retiré, l’Espace d’avant est affiché, et ⌘Z n’a plus rien à annuler pour lui',
        d.spaces.length === n0 && !d.spaces.includes(cree) && w.space === space && w.undoStack.length === pile - 1, `${d.spaces.length}/${n0} ${w.undoStack.length}/${pile}`);
      await sleep(120); // la demande de nom (60 ms) est passée
      w.hideModal();
    }
    // ⌘Z après une création, et suppression d'un Espace vide : sans question.
    const n1 = d.spaces.length;
    w.newSpace();
    const neuf = w.space;
    const champ = `document.querySelector('#space-name input.rename')`;
    await until(() => ui(`!slide && !!${champ} && document.activeElement === ${champ}`), 'champ de nom du nouvel Espace');
    const intact = await ctx.commands.typingIn(w.shellView.webContents, w);
    await ui(`${champ}.value = 'Travail'`);
    const touche = await ctx.commands.typingIn(w.shellView.webContents, w);
    await ui(`${champ}.value = ${champ}.defaultValue`);
    check('nouvel Espace, champ de nom pas encore touché : ⌘Z n’est pas pris par le champ (il annulera la création) ; dès qu’on y a tapé, ⌘Z annule la saisie', intact === false && touche === true, `${intact} ${touche}`);
    w.undoStack.push({ label: 'undo.move', undo() {}, redo() {} });
    const autre = await ctx.commands.typingIn(w.shellView.webContents, w);
    w.undoStack.pop();
    check('… et si une autre action a eu lieu depuis la création, ⌘Z reste au champ de nom', autre === true, String(autre));
    w.replay('undo');
    check('nouvel Espace, puis ⌘Z : il est retiré', d.spaces.length === n1 && !d.spaces.includes(neuf) && w.space === space);
    await until(() => ui(`!slide && !${champ}`), 'champ de nom retiré');
    w.newSpace();
    const vide = w.space;
    const fini = await Promise.race([w.deleteSpace(vide.id).then(() => true), sleep(1500).then(() => false)]);
    check('supprimer un Espace vide : aucune question, il part aussitôt ; ⌘Z le rétablit', fini && !d.spaces.includes(vide) && d.spaces.length === n1 && (w.replay('undo'), d.spaces.some((x) => x.id === vide.id)), String(fini));
    const remis = d.spaces.find((x) => x.id === vide.id);
    if (remis) w.removeSpace(remis.id);
    w.hideToast();
    w.undoStack.length = 0;
    w.redoStack.length = 0;
    await sleep(120);
    w.switchSpace(space.id);
    w.changed();
    await until(() => ui(`!slide && S.space.id === ${JSON.stringify(space.id)}`), 'retour à l’Espace d’essai');
  }

  // --- Aperçu d'un dossier replié au survol (BL-74) -----------------------------------------
  {
    const dead = (n) => `${base}/dossier-${n}`;
    const mk = (n, title) => { const tab = w.createTab(dead(n), { space, index: space.today.length }); tab.title = title; tab.homeUrl = tab.url; space.today.splice(space.today.indexOf(tab.id), 1); return tab; };
    const t1 = mk(1, 'Été à Saint-Malo');
    const t2 = mk(2, '<b>Gras</b> & <img src=x onerror=alert(1)>');
    const t3 = mk(3, 'Recette de crêpes');
    const sous = { type: 'folder', id: 'der-sous', name: 'Cuisine', open: false, children: [{ type: 'tab', id: t3.id }] };
    const dossier = { type: 'folder', id: 'der-dossier', name: 'Voyages', open: false, children: [{ type: 'tab', id: t1.id }, { type: 'tab', id: t2.id }, sous] };
    const videF = { type: 'folder', id: 'der-vide', name: 'Vide', open: false, children: [] };
    space.pinned.push(dossier, videF);
    w.changed();
    const tete = (id) => `document.querySelector('#pinned .row[data-id="${id}"]')`;
    await until(() => ui(`!slide && !!${tete('der-dossier')} && !!${tete('der-vide')} && typeof folderPeek === 'object'`), 'dossiers dans la barre');
    const survol = (id) => ui(`${tete(id)}.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))`);
    const vu = () => ui(`(() => { const p = document.getElementById('folder-peek'); if (!p || p.classList.contains('out')) return null; const s = document.getElementById('sidebar').getBoundingClientRect(); const r = p.getBoundingClientRect(); const h = ${tete('der-dossier')}.getBoundingClientRect();
      return { noms: [...p.querySelectorAll('.fp-name')].map((e) => e.textContent), subs: [...p.querySelectorAll('.fp-sub')].map((e) => e.textContent), balises: p.querySelectorAll('.fp-name *').length, dedans: r.left >= s.left && r.right <= s.right && r.top >= s.top && r.bottom <= s.bottom, sous: Math.round(r.top - h.bottom), invite: p.querySelector('.fp-search').placeholder, vide: p.querySelectorAll('.fp-empty').length, sel: [...p.querySelectorAll('.fp-row')].findIndex((e) => e.classList.contains('sel')), ferme: !${tete('der-dossier')}.parentElement.classList.contains('open') }; })()`);
    // L'attente du survol (450 ms) est vérifiée à la vraie souris (ui 30). Ici, un survol simulé :
    // le panneau ne paraît pas tout de suite ; puis l'ouverture est demandée directement, aux mêmes
    // conditions — le vrai pointeur de la machine ou un changement de premier plan peuvent couper
    // l'attente d'un survol simulé.
    await survol('der-dossier');
    const tot = await vu();
    const ouvert = await ui(`folderPeek.show('der-dossier')`);
    const p1 = await vu();
    const gene = p1 ? '' : await ui(`JSON.stringify({ renommage: !!document.querySelector('input.rename'), glissement: document.getElementById('pager').classList.contains('sliding'), glisser: document.body.classList.contains('dragging'), ouvert: ${tete('der-dossier')}.parentElement.classList.contains('open') })`);
    check('dossier replié survolé : rien au premier instant ; puis la liste de ses onglets paraît sous lui, dans la barre, sous-dossiers compris',
      tot === null && ouvert === true && !!p1 && p1.noms.join('|') === [t1.title, t2.title, t3.title].join('|') && p1.subs.join() === 'Cuisine' && p1.dedans && p1.sous >= 0 && p1.sous <= 8 && p1.ferme && p1.invite === T('fpeek.search', { name: 'Voyages' }), JSON.stringify([tot, ouvert, p1, gene]));
    check('aperçu d’un dossier : un titre venu d’un site est du texte, jamais du HTML', !!p1 && p1.balises === 0 && p1.noms[1] === t2.title);
    const taper = (q) => ui(`(() => { const i = document.querySelector('#folder-peek .fp-search'); i.focus(); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await taper('ete');
    const f1 = await vu();
    await taper('cuisine');
    const f2 = await vu();
    await taper('zzz');
    const f3 = await vu();
    check('aperçu d’un dossier : le champ filtre les onglets (sans tenir compte des accents ; le nom d’un sous-dossier compte), le premier résultat est sélectionné ; rien ne correspond : c’est dit',
      !!f1 && f1.noms.join() === t1.title && f1.sel === 0 && !!f2 && f2.noms.join() === t3.title && !!f3 && f3.noms.length === 0 && f3.vide === 1, JSON.stringify([f1, f2, f3]));
    await taper('crêpes');
    await ui(`document.querySelector('#folder-peek .fp-search').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
    await until(() => w.activeId === t3.id, 'onglet du dossier affiché', 4000).catch(() => {});
    check('aperçu d’un dossier : Entrée affiche l’onglet trouvé ; le dossier reste replié et l’aperçu s’efface', w.activeId === t3.id && dossier.open === false && sous.open === false && (await until(async () => (await vu()) === null, 'aperçu effacé', 3000).then(() => true, () => false)));
    await until(() => ui(`!document.getElementById('folder-peek')`), 'panneau retiré', 3000).catch(() => {});
    // Dossier vide, dossier ouvert, glisser en cours : pas d'aperçu. (Ouverture demandée
    // directement, aux mêmes conditions qu'un survol : sur une machine d'essai, le vrai pointeur
    // ou un changement de premier plan peut couper l'attente d'un survol simulé.)
    const montrer = (id) => ui(`folderPeek.show(${JSON.stringify(id)})`);
    const pasVide = await montrer('der-vide');
    await ui(`document.body.classList.add('dragging')`);
    const pasGlisser = await montrer('der-dossier');
    await ui(`document.body.classList.remove('dragging')`);
    const p2 = await montrer('der-dossier');
    dossier.open = true;
    w.changed();
    const efface = await until(async () => (await ui(`!document.getElementById('folder-peek')`)), 'aperçu effacé à l’ouverture', 3000).then(() => true, () => false);
    const pasOuvert = await montrer('der-dossier');
    check('pas d’aperçu pour un dossier vide, pendant un glisser, ni pour un dossier ouvert ; l’aperçu s’efface quand son dossier s’ouvre',
      pasVide === false && pasGlisser === false && p2 === true && efface && pasOuvert === false, JSON.stringify([pasVide, pasGlisser, p2, efface, pasOuvert]));
    await ui('folderPeek.close(true)');
    w.activate(space.today[0]);
    space.pinned = space.pinned.filter((n) => n !== dossier && n !== videF);
    for (const tab of [t1, t2, t3]) { OrbeWindow.destroyView(tab.id); delete d.tabs[tab.id]; }
    w.changed();
  }

  // --- Glisser vers une vue scindée : l'onglet devient une bulle, rebond au dépôt (ANI-12, SCI-17) ---
  {
    const { forceMotion } = require('../src/main/motion');
    const A = space.today[0];
    const x1 = w.createTab(base + '/bulle-1', { space, index: space.today.length });
    x1.title = '<i>Bulle</i> & <img src=x onerror=alert(1)>';
    const x2 = w.createTab(base + '/bulle-2', { space, index: space.today.length });
    x2.title = 'Seconde';
    w.activate(A);
    w.changed();
    const zone = (js) => w.dropView.webContents.executeJavaScript(js);
    const r = w.contentRect();
    const droite = { x: r.x + r.width * 0.75, y: r.y + r.height / 2 };
    const before = forceMotion(true);
    w.dragZone(true);
    await until(() => w.dropView && !w.dropView.webContents.isLoading() && zone('!document.getElementById("drop").hidden'), 'zone de dépôt');
    w.handle('dragZoneOver', { ...droite, id: x1.id });
    const lu = `(() => { const d = document.getElementById('drop'); const l = document.getElementById('drop-label'); const b = l.querySelector('.drop-bubble'); const lr = l.getBoundingClientRect(); const br = b ? b.getBoundingClientRect() : null;
      return { over: d.classList.contains('over'), done: d.classList.contains('done'), nom: b ? b.querySelector('.drop-name').textContent : null, balises: b ? b.querySelectorAll('.drop-name *').length : -1, texte: b ? '' : l.textContent,
        centre: br ? Math.abs((br.left + br.right) / 2 - (lr.left + lr.right) / 2) < 2 && Math.abs((br.top + br.bottom) / 2 - (lr.top + lr.bottom) / 2) < 2 : false, gauche: Math.round(lr.left),
        anim: b ? getComputedStyle(b).animationName : '', props: b ? [...new Set(b.getAnimations().filter((a) => a.animationName === 'drop-bounce').flatMap((a) => a.effect.getKeyframes().flatMap((k) => Object.keys(k))))].filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)).sort().join() : '' }; })()`;
    // La zone glisse vers le côté visé (120 ms) : la bulle se lit une fois la zone arrivée.
    const b1 = await until(async () => { const v = await zone(lu); return v.over && v.nom && v.centre && v.gauche > r.width / 2 - 20 ? v : null; }, 'bulle de l’onglet, zone en place', 4000).catch(() => zone(lu));
    check('glisser un onglet au-dessus de la page : il devient une bulle (icône et titre) au milieu du côté visé ; son titre est du texte, jamais du HTML',
      !!b1 && b1.nom === x1.title && b1.balises === 0 && b1.centre && b1.gauche > r.width / 2 - 20 && !b1.done, JSON.stringify(b1));
    w.handle('dragZoneOver', { ...droite, id: 'inconnu' });
    const b0 = await until(async () => { const v = await zone(lu); return v.nom === null ? v : null; }, 'libellé seul', 3000).catch(() => null);
    check('zone de dépôt : un identifiant qui ne désigne aucun onglet de la fenêtre ne montre aucune bulle (le libellé seul)', !!b0 && b0.texte === T('view.addSplit') && w.dropBubble(42) === null && w.dropBubble('inconnu') === null, JSON.stringify(b0));
    w.handle('dragZoneOver', { ...droite, id: x1.id });
    await until(async () => (await zone(lu)).nom === x1.title, 'bulle revenue', 3000).catch(() => {});
    w.handle('dropSplit', { id: x1.id, ...droite });
    w.handle('dragZone', false); // la coque annonce ensuite la fin du glisser : le rebond n'est pas coupé
    const b2 = await until(async () => { const v = await zone(lu); return v.done ? v : null; }, 'rebond', 3000).catch(() => null);
    // « Réduire les animations » du système (machines d'intégration) : la feuille de style coupe le rebond.
    const calme = await zone('matchMedia("(prefers-reduced-motion: reduce)").matches');
    check('onglet lâché sur la page : la vue est scindée aussitôt, la zone de dépôt reste le temps du rebond',
      w.visibleIds().join() === [A, x1.id].join() && !!b2 && w.dropView.getVisible(), JSON.stringify(b2) + ' ' + w.visibleIds().length);
    if (calme) outils.ignorer('la bulle rebondit une fois à sa place (transformation et opacité seulement)', '« Réduire les animations » actif');
    else check('la bulle rebondit une fois à sa place (transformation et opacité seulement)', !!b2 && b2.anim === 'drop-bounce' && b2.props === 'opacity,transform', JSON.stringify(b2));
    const parti = await until(() => !w.dropView.getVisible(), 'zone retirée', 3000).then(() => true, () => false);
    check('… puis la zone de dépôt se retire d’elle-même', parti);
    // « Réduire les animations » : pas de rebond, la zone part aussitôt.
    forceMotion(false);
    w.activate(A);
    w.dragZone(true);
    await until(() => w.dropView.getVisible(), 'zone de dépôt');
    w.handle('dragZoneOver', { ...droite, id: x2.id });
    w.handle('dropSplit', { id: x2.id, ...droite });
    check('« Réduire les animations » : l’onglet lâché scinde la vue, sans rebond — la zone de dépôt part aussitôt', w.visibleIds().includes(x2.id) && !w.dropView.getVisible(), String(w.dropView.getVisible()));
    forceMotion(before);
    // Glisser abandonné : la zone part aussitôt, rien ne rebondit.
    w.dragZone(true);
    w.handle('dragZoneOver', { ...droite, id: x2.id });
    w.handle('dragZone', false);
    check('glisser abandonné au-dessus de la page : la zone part aussitôt', !w.dropView.getVisible());
    w.run('separateAll');
    w.activate(A);
    for (const tab of [x1, x2]) { OrbeWindow.destroyView(tab.id); space.today.splice(space.today.indexOf(tab.id), 1); delete d.tabs[tab.id]; }
    space.splits = [];
    w.layout();
    w.changed();
  }

  // --- Remise en état ---------------------------------------------------------------------
  w.switchSpace(space.id);
  for (const id of Object.keys(d.tabs)) if (mine(d.tabs[id])) { OrbeWindow.destroyView(id); delete d.tabs[id]; }
  space.today = []; space.pinned = []; space.splits = [];
  delete w.activeBySpace[space.id];
  d.spaces.splice(d.spaces.indexOf(space), 1);
  store.state.archive = store.state.archive.filter((x) => !mine(x));
  for (const u of Object.keys(store.state.history)) if (u.startsWith(base)) delete store.state.history[u];
  check('derniers points, remise en état : Espaces et archive retrouvent leur taille', d.spaces.length === spaces0 && store.state.archive.length === archive0, `${d.spaces.length}/${spaces0} ${store.state.archive.length}/${archive0}`);
  w.closed.length = 0;
  w.undoStack.length = 0;
  w.redoStack.length = 0;
  w.spaceId = home;
  if (homeActive && d.tabs[homeActive]) w.activeBySpace[home] = homeActive;
  if (w.sidebarVisible !== sidebar0) w.toggleSidebar(sidebar0);
  w.layout();
  w.changed();
  await new Promise((r) => server.close(r));
  if (!ctx.check && failed) throw new Error(`${failed} vérification(s) en échec`);
};
