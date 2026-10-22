// Finitions, deuxième série : dossier « Premiers pas » du premier lancement, Échap en
// plein écran, onglet lâché sur les quatre côtés d'une page, onglet glissé hors de la
// fenêtre ou vers une autre fenêtre, dépôt dans un dossier fermé, nouvel Espace au bout
// de la rangée, lueur de chargement.
// Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/finitions2.js node scripts/dev.js --selftest
const outils = require('./outils');

const { sleep } = outils;
const until = (fn, label, timeout = 10000) => outils.until(fn, label, timeout);

module.exports = async function finitions2Tests(ctx) {
  const { first: w, store, win, OrbeWindow } = ctx;
  const starter = require('../src/main/starter');
  let failed = 0;
  const check = ctx.check || ((name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`); });
  const ignorer = outils.ignorer;
  const ui = (js) => w.ui.webContents.executeJavaScript(js);
  const d = w.data;
  const T = (k, v) => store.t(k, null, v);
  const dead = (n) => `http://127.0.0.1:9/fin2-${n}`;
  const mine = (x) => String(x.url || '').startsWith(dead(''));
  const walkTabs = function* walkTabs(sp) { const go = function* go(nodes) { for (const n of nodes) { if (n.type === 'folder') yield* go(n.children); else yield n.id; } }; yield* go(sp.pinned); yield* sp.today; };

  await until(() => ui('typeof S === "object" && S !== null'), 'coque chargée');
  const home = w.spaceId;
  const homeActive = w.activeBySpace[home];
  const sidebar0 = w.sidebarVisible;
  if (!w.sidebarVisible) w.toggleSidebar(true);
  const archive0 = store.state.archive.length;
  const spaces0 = d.spaces.length;
  const space = store.makeSpace('Finitions 2', '🧪', '#0ea5e9');
  d.spaces.push(space);
  w.switchSpace(space.id);
  const make = (letters, sp = space) => [...letters].map((c) => {
    const tab = w.createTab(dead(c), { space: sp, index: sp.today.length });
    tab.title = c;
    return tab.id;
  });

  // --- Dossier « Premiers pas » (IMP-5) ------------------------------------------------
  {
    const flag0 = store.state.window.starter;
    delete store.state.window.starter;
    const folder = starter.seed(w, space);
    const kids = folder ? folder.children.map((n) => d.tabs[n.id]) : [];
    check('premier lancement : un dossier « Premiers pas » est posé en tête des épinglés, ouvert, avec ses onglets',
      !!folder && space.pinned[0] === folder && folder.open === true && folder.name === T('starter.folder') && kids.length === starter.PAGES.length && kids.length >= 3
      && kids.every((tab, i) => tab && tab.url === starter.PAGES[i][1] && tab.homeUrl === tab.url && tab.title === T(starter.PAGES[i][0])));
    check('« Premiers pas » : seules des pages d’Orbe (marquées internes) et des adresses https écrites dans le code ; aucune page n’est chargée d’avance',
      kids.every((tab) => (tab.internal === true ? /^orbe:\/\/app\/[a-z]+\.html$/.test(tab.url) : /^https:\/\/github\.com\/amadoubaui\/orbe/.test(tab.url)) && !win.live.has(tab.id)));
    check('« Premiers pas » : posé une seule fois ; jamais dans une fenêtre privée', starter.seed(w, space) === null && store.state.window.starter === true && space.pinned.filter((n) => n.type === 'folder').length === 1
      && (() => { delete store.state.window.starter; const r = starter.seed({ incognito: true, shared: false, data: d, space, changed() {} }); return r === null && !store.state.window.starter; })());
    await until(() => ui(`[...document.querySelectorAll('#pinned .folder > .row .title')].some((el) => el.textContent === ${JSON.stringify(T('starter.folder'))})`), 'dossier dans la barre');
    check('« Premiers pas » : la barre latérale montre le dossier et ses lignes',
      await ui(`document.querySelectorAll('#pinned .folder.open .children .row.tab').length === ${kids.length}`));
    for (const tab of kids) delete d.tabs[tab.id];
    space.pinned = [];
    if (flag0 === undefined) delete store.state.window.starter; else store.state.window.starter = flag0;
    w.changed();
  }

  // --- Échap en plein écran (RAC-45) ---------------------------------------------------
  {
    const isFull0 = w.win.isFullScreen;
    const setFull0 = w.win.setFullScreen;
    let full = true;
    const asked = [];
    w.win.isFullScreen = () => full;
    w.win.setFullScreen = (v) => { asked.push(v); full = v; };
    const patched = w.win.isFullScreen() === true;
    const key = (extra = {}) => { const e = { prevented: false, preventDefault() { this.prevented = true; } }; w.onInput(e, { type: 'keyDown', key: 'Escape', ...extra }, false, null); return e.prevented; };
    if (!patched) ignorer('Échap doublé ou maintenu : sortie du plein écran', 'la fenêtre ne se laisse pas simuler en plein écran');
    else {
      w.escAt = 0;
      const one = key();
      check('plein écran : un seul Échap ne fait pas sortir (il va à la page)', one === false && asked.length === 0 && full === true);
      await sleep(450);
      const late = key();
      check('plein écran : deux Échap espacés de plus de 400 ms ne font pas sortir', late === false && asked.length === 0);
      const second = key();
      check('plein écran : Échap doublé fait sortir la fenêtre du plein écran, et la touche est consommée', second === true && asked.join() === 'false' && full === false);
      full = true; asked.length = 0; w.escAt = 0;
      key();
      const early = w.escFullScreen({ isAutoRepeat: true }, w.escAt + 300);
      const held = w.escFullScreen({ isAutoRepeat: true }, w.escAt + 650);
      check('plein écran : Échap maintenu 0,6 s fait sortir ; relâché avant, non', early === false && held === true && asked.join() === 'false');
      full = true; asked.length = 0; w.escAt = 0;
      w.htmlFullscreen = true;
      key(); const video = key();
      w.htmlFullscreen = false;
      check('page en plein écran (vidéo) : le moteur garde la main, Orbe ne s’en mêle pas', video === false && asked.length === 0);
      full = false; w.escAt = 0;
      key(); const plain = key();
      check('fenêtre ordinaire : Échap doublé ne fait rien de plus', plain === false && asked.length === 0);
    }
    w.win.isFullScreen = isFull0;
    w.win.setFullScreen = setFull0;
    w.escAt = 0;
  }

  // --- Onglet lâché sur la page : quatre côtés (BL-97) ----------------------------------
  const [A, B, C, D] = make('ABCD');
  w.activate(A);
  {
    const rect = w.contentRect();
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const at = (fx, fy) => w.dropTargetAt(rect.x + rect.width * fx, rect.y + rect.height * fy);
    const top = at(0.5, 0.1);
    const bottom = at(0.3, 0.9);
    const left = at(0.2, 0.5);
    const right = at(0.8, 0.5);
    check('page seule, glisser un onglet : le quart haut vise « au-dessus », le quart bas « au-dessous » ; la zone éclairée est la moitié correspondante',
      top.id === A && top.vertical === true && top.before === true && top.zone.y === 0 && top.zone.w === rect.width && top.zone.h === Math.round(rect.height / 2)
      && bottom.vertical === true && bottom.before === false && bottom.zone.y === Math.round(rect.height / 2), JSON.stringify([top, bottom]));
    check('page seule : le reste de la hauteur vise la gauche ou la droite', left.vertical === false && left.before === true && left.zone.x === 0 && left.zone.h === rect.height
      && right.vertical === false && right.before === false && right.zone.x === Math.round(rect.width / 2), JSON.stringify([left, right]));
    w.handle('dropSplit', { id: B, x: cx, y: rect.y + 12 });
    let g = w.groupOf(A);
    let pa = win.live.get(A).view.getBounds();
    let pb = win.live.get(B).view.getBounds();
    check('lâché en haut : vue empilée, le nouvel onglet au-dessus, et c’est lui qui a la main', !!g && g.join() === [B, A].join() && w.isVertical(g) && pb.y < pa.y && pb.x === pa.x && w.activeId === B, JSON.stringify([g, pa, pb]));
    const stacked = w.dropTargetAt(cx, rect.y + rect.height - 20);
    check('vue déjà empilée : elle garde son sens (le bas du second volet vise « après lui »)', stacked.id === A && stacked.vertical === true && stacked.before === false);
    w.leaveSplit(B); w.leaveSplit(A);
    w.activate(A);
    w.handle('dropSplit', { id: C, x: cx, y: rect.y + rect.height - 12 });
    g = w.groupOf(A);
    pa = win.live.get(A).view.getBounds();
    const pc = win.live.get(C).view.getBounds();
    check('lâché en bas : vue empilée, le nouvel onglet au-dessous', !!g && g.join() === [A, C].join() && w.isVertical(g) && pc.y > pa.y, JSON.stringify([g, pa, pc]));
    w.leaveSplit(C); w.leaveSplit(A);
    w.activate(A);
    w.handle('dropSplit', { id: D, x: rect.x + 20, y: cy });
    g = w.groupOf(A);
    check('lâché à gauche : côte à côte, le nouvel onglet à gauche (comme avant)', !!g && g.join() === [D, A].join() && !w.isVertical(g) && win.live.get(D).view.getBounds().x < win.live.get(A).view.getBounds().x);
    w.leaveSplit(D); w.leaveSplit(A);
    w.activate(A);
    w.layout();
    // La coque redemande la zone quand le pointeur change de bande (huit bandes sur la hauteur).
    await until(() => ui(`S.activeId === ${JSON.stringify(A)} && (S.panes || []).length === 0`), 'page seule dans la barre');
    check('coque : la clé de la zone change entre le haut, le milieu et le bas de la page (un envoi par bande, pas un par mouvement)',
      await ui(`(() => { const x = S.sidebar.width + 200; const k = [zoneKeyAt(x, 20), zoneKeyAt(x, 24), zoneKeyAt(x, innerHeight / 2), zoneKeyAt(x, innerHeight - 20)]; return k[0] === k[1] && new Set(k).size === 3; })()`));
  }

  // --- Onglet glissé hors de la fenêtre, ou vers une autre fenêtre (BL-95, BL-96) --------
  {
    const b = w.win.getBounds();
    const count0 = OrbeWindow.all.length;
    w.activate(A);
    check('lâché à l’intérieur de la fenêtre (glisser abandonné) : aucune fenêtre n’est créée', w.tearOff([B], { x: b.x + 50, y: b.y + 50 }) === null && OrbeWindow.all.length === count0);
    check('identifiants inconnus, dossier, point illisible : refusés', w.tearOff(['nope'], { x: b.x - 500, y: b.y }) === null && w.tearOff([B], { x: NaN, y: 1 }) === null && w.handle('tearOff', 'x') === false && w.handle('tearOff', { ids: 'x' }) === false && OrbeWindow.all.length === count0);
    const cursor0 = win.hooks.cursor;
    const out = { x: b.x + b.width + 300, y: b.y + 200 };
    win.hooks.cursor = () => out;
    const made = w.handle('tearOff', { ids: [A], x: 5, y: 5 }); // le point envoyé par l'interface est ignoré
    const w2 = OrbeWindow.all.find((x) => x !== w && x.activeId === A);
    check('onglet lâché hors de la fenêtre : une nouvelle fenêtre ordinaire l’affiche, sur le même Espace', made === true && OrbeWindow.all.length === count0 + 1 && !!w2 && w2.shared && w2.spaceId === space.id && win.live.get(A).owner === w2);
    check('… la fenêtre d’origine passe à l’onglet voisin (pas de page vide), l’onglet reste à sa place dans la liste', w.activeId === B && space.today.join() === [A, B, C, D].join(), String(w.activeId));
    if (w2) {
      const nb = w2.win.getBounds();
      const area = require('electron').screen.getDisplayNearestPoint(out).workArea;
      check('… la nouvelle fenêtre se pose sous le pointeur, dans l’écran, à la taille de la première',
        nb.x >= area.x && nb.y >= area.y && nb.x + nb.width <= area.x + area.width && nb.y + nb.height <= area.y + area.height && nb.width === Math.min(b.width, area.width),
        JSON.stringify([nb, area, out]));
      // Vers une autre fenêtre : le pointeur est au-dessus de la seconde fenêtre.
      // (Les fenêtres peuvent se recouvrir à l'écran : on vise un coin de la seconde que la première ne couvre pas.)
      const r = w.win.getBounds();
      const within = (p, q) => p.x >= q.x && p.x < q.x + q.width && p.y >= q.y && p.y < q.y + q.height;
      const corners = [[20, 20], [nb.width - 20, 20], [20, nb.height - 20], [nb.width - 20, nb.height - 20]].map(([dx, dy]) => ({ x: nb.x + dx, y: nb.y + dy }));
      const spot = corners.find((p) => !within(p, r));
      win.hooks.cursor = () => spot;
      const n1 = OrbeWindow.all.length;
      if (!spot) ignorer('onglet lâché sur une autre fenêtre : elle l’affiche', 'les deux fenêtres se recouvrent sur cet écran');
      else {
        w.activate(C);
        const moved = w.handle('tearOff', { ids: [C] });
        check('onglet lâché sur une autre fenêtre d’Orbe : elle l’affiche, sans créer de fenêtre ; la première passe au voisin', moved === true && OrbeWindow.all.length === n1 && w2.activeId === C && win.live.get(C).owner === w2 && w.activeId !== C && !!w.activeId, JSON.stringify([w2.activeId, w.activeId]));
      }
      // Ligne lâchée sur la barre latérale de l'autre fenêtre (l'interface n'envoie que l'identifiant).
      w.activate(D);
      check('ligne d’une autre fenêtre lâchée sur la barre latérale : l’onglet s’affiche ici ; identifiant inconnu ou déjà d’ici : refusé',
        w2.handle('adoptTab', D) === true && w2.activeId === D && w.activeId !== D && w2.handle('adoptTab', 'nope') === false && w2.handle('adoptTab', { id: D }) === false);
      // Fenêtre privée : ses onglets ne sortent pas, et elle n'en adopte pas.
      const iw = new OrbeWindow({ incognito: true });
      const it = iw.createTab(dead('prive'));
      win.hooks.cursor = () => ({ x: -9000, y: -9000 });
      const n2 = OrbeWindow.all.length;
      check('fenêtre privée : un onglet glissé dehors n’ouvre rien ; elle n’adopte aucun onglet', iw.tearOff([it.id]) === null && iw.handle('adoptTab', D) === false && iw.adopt([D], w2) === null && OrbeWindow.all.length === n2 && w2.activeId === D);
      // (Une fenêtre fermée pendant que sa barre se charge laisse des messages en route dans le moteur.)
      await until(() => !iw.ui.webContents.isLoading() && !w2.ui.webContents.isLoading(), 'barres des fenêtres d’essai chargées');
      await sleep(300);
      iw.win.close();
      w.activate(A); // reprend l'onglet avant de fermer la seconde fenêtre
      w2.win.close();
      await until(() => !OrbeWindow.all.includes(w2) && !OrbeWindow.all.includes(iw), 'fenêtres d’essai fermées');
    }
    win.hooks.cursor = cursor0;
    check('la position du pointeur vient du système', typeof win.hooks.cursor().x === 'number');
  }

  // --- Dépôt dans un dossier fermé (BL-76) ---------------------------------------------
  {
    const folder = { type: 'folder', id: 'fin2-dossier', name: 'Fermé', open: false, children: [] };
    space.pinned.push(folder);
    w.changed();
    w.handle('move', { id: D, to: 'folder', folderId: folder.id, index: 0 });
    check('déposer un onglet dans un dossier fermé : il y entre, le dossier reste fermé', folder.children.map((n) => n.id).join() === D && folder.open === false && !space.today.includes(D));
    await until(() => ui(`(() => { const f = document.querySelector('#pinned .folder'); return !!f && !f.classList.contains('open'); })()`), 'dossier fermé dans la barre');
    const reduced = await ui('reducedMotion.matches');
    const pulse = await ui(`(() => { const f = document.querySelector('#pinned .folder'); dropPulse(f); const a = f.querySelector('.ic').getAnimations().find((x) => x.id === 'drop-pulse'); return a ? Object.keys(a.effect.getKeyframes()[1]).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)).join() : ''; })()`);
    check('dépôt dans un dossier : son icône rebondit une fois, par transformation seulement (rien avec « Réduire les animations »)', pulse === (reduced ? '' : 'transform'), pulse);
  }

  // --- Nouvel Espace au bout de la rangée (ESP-10) ----------------------------------------
  {
    w.switchSpace(d.spaces[d.spaces.length - 1].id);
    await until(() => ui(`!slide && S.space.id === ${JSON.stringify(space.id)} && S.near.next === null`), 'dernier Espace affiché');
    const reduced = await ui('reducedMotion.matches');
    if (reduced) ignorer('tirer franchement au-delà du dernier Espace : le panneau de création s’ouvre', '« Réduire les animations » actif');
    else {
      const n = d.spaces.length;
      await ui(`(async () => { for (let i = 0; i < 40 && !wheelLocked; i++) { document.getElementById('scroll').dispatchEvent(new WheelEvent('wheel', { deltaX: 60, bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 8)); } })()`);
      await until(() => w.modalMode === 'space', 'panneau de création');
      check('tirer franchement au-delà du dernier Espace : le panneau de création s’ouvre, rien n’est encore créé', d.spaces.length === n && w.space === space);
      w.handle('spaceCreate', { name: 'Au bout', icon: '✨', profileId: 'default' });
      await until(() => d.spaces.length === n + 1, 'nouvel Espace');
      const created = d.spaces[d.spaces.length - 1];
      check('… « Créer » : le nouvel Espace est créé et affiché, à la suite du dernier', w.space === created && created.id !== space.id && created.name === 'Au bout');
      await until(() => ui('!slide'), 'fin du glissement');
      await sleep(200);
      w.hideModal();
      w.switchSpace(space.id);
      d.spaces.splice(d.spaces.indexOf(created), 1);
      delete w.activeBySpace[created.id];
      w.undoStack.length = 0;
      w.changed();
      await until(() => ui(`!slide && S.space.id === ${JSON.stringify(space.id)}`), 'retour à l’Espace d’essai');
    }
  }

  // --- Lueur de chargement (BL-32) ---------------------------------------------------------
  {
    w.activate(A);
    const rt = win.live.get(A);
    const loading0 = rt.loading;
    rt.loading = true;
    w.changed();
    await until(() => ui('document.body.classList.contains("loading")'), 'chargement annoncé à la coque');
    const g = await ui(`(() => { const el = document.getElementById('glow'); const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { left: Math.round(r.left), top: Math.round(r.top), events: cs.pointerEvents, sw: S.sidebar.width }; })()`);
    check('page en chargement : la lueur est posée le long du bord haut de la page (à droite de la barre latérale), sans prendre les clics', g.left === g.sw && g.top === 0 && g.events === 'none', JSON.stringify(g));
    rt.loading = loading0;
    w.changed();
    await until(() => ui('!document.body.classList.contains("loading")'), 'fin du chargement');
    check('chargement fini : la lueur s’éteint', true);
  }

  // --- Téléchargements en cours, au bas de la barre (BL-57) -----------------------------------
  {
    const dl = require('../src/main/downloads');
    const rec = { id: 'fin2-dl', name: 'gros <b>fichier</b>.zip', url: dead('dl'), path: '', state: 'progressing', received: 1048576, total: 10485760 };
    const done = { id: 'fin2-fini', name: 'fini.zip', url: dead('dl2'), path: '', state: 'completed', received: 5, total: 5 };
    store.state.downloads.push(done, rec);
    check('temps restant : inconnu tant que le débit n’est pas mesuré', dl.eta(rec) === null);
    dl.sample(rec, 1000);
    rec.received = 2097152;
    dl.sample(rec, 1200); // relevé trop rapproché : ignoré
    dl.sample(rec, 2000); // 1 Mo en 1 s
    check('temps restant : reste à recevoir ÷ débit lissé (8 Mo à 1 Mo/s : 8 s) ; en pause ou sans taille : inconnu',
      dl.eta(rec) === 8 && dl.eta({ ...rec }) === null && (() => { rec.paused = true; const p = dl.eta(rec); rec.paused = false; return p === null; })(), String(dl.eta(rec)));
    w.changed();
    await until(() => ui('document.querySelectorAll("#dls .dl").length === 1 && !document.getElementById("dls").hidden'), 'ligne du téléchargement');
    const row = await ui(`(() => { const el = document.querySelector('#dls .dl'); return { name: el.querySelector('.dl-name').textContent, tags: el.querySelector('.dl-name').children.length, sub: el.querySelector('.dl-sub').textContent, bar: el.querySelector('.dl-bar').style.transform, x: el.querySelector('.dl-x').title, id: el.dataset.dl }; })()`);
    const units = T('dl.units').split(' ');
    check('téléchargement en cours : une ligne au bas de la barre — nom posé comme du texte, taille reçue sur taille totale, temps restant, « × » pour annuler',
      row.name === rec.name && row.tags === 0 && row.sub === `2.0 ${units[2]} / 10.0 ${units[2]} · ${T('dl.leftSec', { n: 8 })}` && row.bar === 'scaleX(0.2)' && row.x === T('dl.cancel') && row.id === rec.id, JSON.stringify(row));
    const more = [1, 2, 3].map((n) => ({ ...rec, id: 'fin2-plus' + n, name: 'autre' + n }));
    store.state.downloads.push(...more);
    w.changed();
    await until(() => ui('document.querySelectorAll("#dls .dl").length === 3'), 'trois lignes');
    check('seuls les téléchargements en cours ont une ligne, trois au plus, le plus récent en haut', await ui('[...document.querySelectorAll("#dls .dl-name")].map((x) => x.textContent).join()') === 'autre3,autre2,autre1');
    store.state.downloads = store.state.downloads.filter((x) => !more.includes(x));
    w.changed();
    await until(() => ui('document.querySelectorAll("#dls .dl").length === 1'), 'une ligne');
    rec.paused = true;
    w.changed();
    await until(() => ui(`document.querySelector('#dls .dl-sub').textContent.endsWith(${JSON.stringify(T('dl.paused'))})`), 'en pause');
    check('téléchargement en pause : la ligne le dit, sans temps restant', true);
    rec.paused = false;
    const cancel0 = dl.cancel;
    const cancelled = [];
    dl.cancel = (d) => { cancelled.push(d.id); return true; };
    await ui('document.querySelector("#dls .dl-x").click()');
    await until(() => cancelled.length === 1, 'annulation demandée');
    check('« × » : le téléchargement est annulé ; identifiant inconnu, objet, ou téléchargement déjà fini : refusé',
      cancelled.join() === rec.id && w.handle('dlCancel', 'nope') === false && w.handle('dlCancel', { id: rec.id }) === false && w.handle('dlCancel', done.id) === false && cancelled.length === 1);
    dl.cancel = cancel0;
    store.state.downloads = store.state.downloads.filter((x) => x !== rec && x !== done);
    w.changed();
    await until(() => ui('document.getElementById("dls").hidden && document.querySelectorAll("#dls .dl").length === 0'), 'ligne retirée');
    check('téléchargement terminé : la ligne s’en va', true);
  }

  // --- Profil rappelé dans les menus (ESP-24) ---------------------------------------------------
  {
    const other = store.makeSpace('Travail <b>', '💼', '#f59e0b');
    d.spaces.push(other);
    const profiles0 = d.profiles.slice();
    const labelsOf = () => { const m = w.tabMenuTemplate(B).find((x) => x.label === T('tabs.moveTo')); return m ? m.submenu.map((x) => x.label).filter((x) => typeof x === 'string') : []; };
    d.profiles.length = 1;
    const single = win.spaceLabel(other, d, space.profileId);
    check('un seul profil : le nom d’un Espace dans un menu ne dit rien du profil', single === '💼 Travail <b>' && labelsOf().includes(single), single);
    d.profiles.splice(0, d.profiles.length, ...profiles0);
    const pro = { id: 'fin2-pro', name: 'Bureau' };
    d.profiles.push(pro);
    d.favs[pro.id] = [];
    other.profileId = pro.id;
    check('plusieurs profils : le profil d’un Espace d’un autre profil est rappelé à la suite de son nom (« Déplacer vers », menu Espaces)',
      win.spaceLabel(other, d, space.profileId) === '💼 Travail <b>  ·  Bureau' && labelsOf().includes('💼 Travail <b>  ·  Bureau') && win.spaceLabel(other, d, space.profileId, '  ') === '💼  Travail <b>  ·  Bureau'
      && win.spaceLabel({ icon: 'x', name: 'y', profileId: 'inconnu' }, d, space.profileId) === 'x y', JSON.stringify(labelsOf()));
    check('… mais pas pour un Espace du même profil que celui d’où l’on part', win.spaceLabel(other, d, pro.id) === '💼 Travail <b>' && win.spaceLabel(other, d) === '💼 Travail <b>'
      && labelsOf().filter((x) => x.includes('  ·  ')).length === 1, JSON.stringify(labelsOf()));
    w.selection = [B, C];
    const many = w.tabsMenuTemplate([B, C]).find((x) => x.label === T('tabs.moveTo'));
    check('… aussi dans le menu d’une sélection', !!many && many.submenu.some((x) => x.label === '💼 Travail <b>  ·  Bureau'));
    w.selection = [];
    d.profiles.splice(d.profiles.indexOf(pro), 1);
    delete d.favs[pro.id];
    d.spaces.splice(d.spaces.indexOf(other), 1);
    w.changed();
  }

  // --- Pastille de notification d'un favori (BL-134) ---------------------------------------------
  {
    const full = w.favorites.length >= 12;
    if (full) outils.ignorer('favori : « Afficher la pastille de notification » la coupe pour ce site', 'grille des favoris pleine dans ce profil');
    else {
      w.activate(A);
      w.toggleFavorite(A);
      d.tabs[A].title = '(3) Boîte';
      w.changed();
      const badge = () => ui(`(() => { const el = document.querySelector('#fav [data-id=${JSON.stringify(A)}] .count'); return el && !el.hidden ? el.textContent : ''; })()`);
      await until(async () => (await badge()) === '3', 'pastille du favori');
      const item = () => w.tabMenuTemplate(A).find((x) => x.label === T('tabs.showBadge'));
      check('menu d’un favori : « Afficher la pastille de notification », cochée ; absente du menu d’un onglet ordinaire', !!item() && item().type === 'checkbox' && item().checked === true && item().visible === true
        && w.tabMenuTemplate(B).find((x) => x.label === T('tabs.showBadge')).visible === false);
      item().click();
      await until(async () => (await badge()) === '', 'pastille coupée');
      check('case décochée : la pastille de ce favori disparaît, le choix est retenu avec l’onglet', d.tabs[A].noBadge === true && item().checked === false);
      item().click();
      await until(async () => (await badge()) === '3', 'pastille revenue');
      check('case recochée : la pastille revient', !('noBadge' in d.tabs[A]));
      d.tabs[A].title = 'A';
      w.toggleFavorite(A);
      w.changed();
    }
  }

  // --- Exporter un Espace (BL-132) -----------------------------------------------------------------
  {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-export-'));
    const file = path.join(dir, 'espace.html');
    const save0 = win.hooks.saveFile;
    let asked = null;
    win.hooks.saveFile = async (parent, options) => { asked = options; return file; };
    const evil = w.createTab('https://exemple.test/fin2-x?a="1"&b=<2>', { space, index: 0 });
    evil.title = '<script>alert(1)</script> & "co"';
    const inner = w.createTab('orbe://app/shortcuts.html', { space, index: 0 });
    inner.internal = true;
    const pinnedTab = w.createTab('https://exemple.test/fin2-epingle', { space, index: 0 });
    pinnedTab.title = 'Épinglé';
    space.today.splice(space.today.indexOf(pinnedTab.id), 1);
    const exportFolder = { type: 'folder', id: 'fin2-export', name: 'Lot & Cie', open: true, children: [{ type: 'tab', id: pinnedTab.id }] };
    space.pinned.unshift(exportFolder);
    check('menu de l’Espace : « Exporter l’Espace… »', w.spaceMenuTemplate().some((x) => x.label === T('spaces.export') && x.visible !== false));
    const toasts = [];
    const toast0 = w.toast;
    w.toast = (text) => { toasts.push(text); };
    const out = await w.spaceMenuTemplate().find((x) => x.label === T('spaces.export')).click();
    await until(() => fs.existsSync(file), 'fichier exporté');
    const html = fs.readFileSync(file, 'utf8');
    const webCount = [...walkTabs(space)].filter((id) => /^https?:/i.test(d.tabs[id].homeUrl || d.tabs[id].url)).length;
    check('export : un fichier de signets au nom de l’Espace est proposé, avec ses dossiers et « Aujourd’hui »',
      !!asked && /Finitions 2\.html$/.test(asked.defaultPath) && html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>') && html.includes('<H3>Finitions 2</H3>') && html.includes('<H3>Lot &amp; Cie</H3>') && html.includes(`<H3>${T('spaces.exportToday')}</H3>`) && html.includes('fin2-epingle">Épinglé</A>'));
    check('export : titres et adresses échappés (aucune balise du site ne passe), pages d’Orbe écartées',
      !html.includes('<script>') && html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;co&quot;') && html.includes('a=&quot;1&quot;&amp;b=&lt;2&gt;') && !html.includes('orbe://'));
    const parsed = require('../src/main/import-bookmarks').parse(html);
    const flat = JSON.stringify(parsed);
    check('export : le fichier se relit par l’import de signets d’Orbe, toutes les adresses web y sont', flat.includes('fin2-epingle') && flat.includes('Lot & Cie') && (html.match(/<DT><A /g) || []).length === webCount
      && toasts.join() === T('spaces.exported', { n: webCount }), `${(html.match(/<DT><A /g) || []).length}/${webCount} ${toasts.join()}`);
    win.hooks.saveFile = async () => null;
    check('export annulé : rien n’est écrit ; chemin relatif refusé ; fenêtre privée : pas d’export', (await w.exportSpace()) === null
      && (await (async () => { win.hooks.saveFile = async () => 'relatif.html'; return w.exportSpace(); })()) === null && !fs.existsSync('relatif.html')
      && !new Proxy(w, { get: (o, k) => (k === 'shared' ? false : o[k]) }).spaceMenuTemplate().some((x) => x.label === T('spaces.export') && x.visible !== false));
    void out;
    w.toast = toast0;
    win.hooks.saveFile = save0;
    fs.rmSync(dir, { recursive: true, force: true });
    for (const tab of [evil, inner, pinnedTab]) { const i = space.today.indexOf(tab.id); if (i >= 0) space.today.splice(i, 1); delete d.tabs[tab.id]; }
    space.pinned.splice(space.pinned.indexOf(exportFolder), 1);
    w.changed();
  }

  // --- Infobulles maison, avec le raccourci (BL-18) ---------------------------------------------
  {
    const shortcuts = ctx.shortcuts || require('../src/main/shortcuts');
    const over = (id) => ui(`document.getElementById(${JSON.stringify(id)}).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))`);
    const tip = () => ui(`(() => { const el = document.getElementById('tip'); const r = el.getBoundingClientRect(); return { on: !el.hidden && el.classList.contains('on'), text: document.getElementById('tip-text').textContent, key: document.getElementById('tip-key').hidden ? '' : document.getElementById('tip-key').textContent, left: r.left, right: r.right, top: r.top, sw: S.sidebar.width, events: getComputedStyle(el).pointerEvents }; })()`);
    check('boutons de la barre : plus d’infobulle native (pas de « title »), un nom pour les aides techniques',
      await ui(`['b-sidebar', 'b-back', 'b-forward', 'b-reload', 'b-library', 'b-clear', 'b-newtab'].every((id) => { const el = document.getElementById(id); return !el.title && el.getAttribute('aria-label') === t(el.dataset.tip); })`));
    await over('b-sidebar');
    await sleep(200);
    check('survol bref : pas encore d’infobulle', (await tip()).on === false);
    await until(async () => (await tip()).on, 'infobulle affichée');
    const t1 = await tip();
    const btn = await ui(`(() => { const r = document.getElementById('b-sidebar').getBoundingClientRect(); return { bottom: r.bottom }; })()`);
    check('survol d’une demi-seconde : infobulle maison avec le nom et le raccourci, sous le bouton, dans la barre latérale, sans prendre les clics',
      t1.text === T('side.sidebar') && t1.key === shortcuts.keysOf('toggleSidebar') && t1.key.length > 0 && t1.left >= 6 && t1.right <= t1.sw - 5 && t1.top >= btn.bottom && t1.events === 'none', JSON.stringify(t1));
    await over('b-menu');
    await until(async () => { const x = await tip(); return x.on && x.text === T('side.menu'); }, 'infobulle du menu');
    check('bouton sans raccourci : le nom seul', (await tip()).key === '');
    await ui(`document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
    check('un clic referme l’infobulle', (await tip()).on === false);
    // Raccourci changé par l'utilisateur : l'infobulle le suit.
    const free = ['Alt+Cmd+F9', 'Alt+Shift+Cmd+F9', 'Ctrl+Alt+Cmd+F9'].find((a) => !shortcuts.owner(shortcuts.canon(a), 'library'));
    const r = free ? shortcuts.assign('library', free) : { error: 'pris' };
    if (!r.ok) outils.ignorer('raccourci modifié : l’infobulle montre le nouveau', 'aucun raccourci libre pour l’essai');
    else {
      await until(() => ui(`KEYS.library === ${JSON.stringify(r.keys)}`), 'raccourci reçu par la coque');
      await over('b-library');
      await until(async () => { const x = await tip(); return x.on && x.text === T('side.library'); }, 'infobulle de la Bibliothèque');
      const t2 = await tip();
      check('raccourci modifié dans les réglages : l’infobulle montre le nouveau ; au bas de la barre elle se place au-dessus du bouton', t2.key === r.keys
        && await ui(`document.getElementById('tip').getBoundingClientRect().bottom <= document.getElementById('b-library').getBoundingClientRect().top`), JSON.stringify(t2));
      shortcuts.reset('library');
    }
    await ui(`document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
  }

  // --- Barre d'outils : extensions à droite de l'adresse (DIV-1) ------------------------------------
  {
    const seen = await ui(`(() => {
      const s0 = S;
      const ext = [{ id: 'abcdefghijklmnop', title: 'Essai <i>', icon: '', enabled: true, badge: '7' }];
      render({ ...s0, toolbar: true, extensions: ext });
      const on = { tb: document.querySelectorAll('#tb-exts .ext').length, side: document.querySelectorAll('#exts .ext').length, title: document.querySelector('#tb-exts .ext').title, tags: document.querySelector('#tb-exts .ext i') ? 1 : 0, badge: document.querySelector('#tb-exts .badge').textContent, after: document.getElementById('tb-url').nextElementSibling.id };
      render({ ...s0, toolbar: false, extensions: ext });
      const off = { tb: document.querySelectorAll('#tb-exts .ext').length, side: document.querySelectorAll('#exts .ext').length };
      render(s0);
      return { on, off, rest: document.querySelectorAll('#tb-exts .ext, #exts .ext').length === (s0.extensions || []).length };
    })()`);
    check('barre d’outils affichée : les boutons d’extension sont à droite de l’adresse (et plus sous la pastille) ; masquée, ils reviennent sous l’adresse',
      seen.on.tb === 1 && seen.on.side === 0 && seen.on.title === 'Essai <i>' && seen.on.tags === 0 && seen.on.badge === '7' && seen.on.after === 'tb-exts' && seen.off.tb === 0 && seen.off.side === 1 && seen.rest === true, JSON.stringify(seen));
  }

  // --- Barre resserrée au minimum, zones qui déplacent la fenêtre (BL-5, BL-12) ----------------------
  {
    const width0 = w.sidebarWidth;
    w.setSidebarWidth(40);
    await until(() => ui('S.sidebar.width === 200 && Math.round(document.getElementById("sidebar").getBoundingClientRect().width) === 200'), 'barre au minimum');
    const narrow = await ui(`(() => {
      const side = document.getElementById('sidebar').getBoundingClientRect();
      const ids = ['b-sidebar', 'b-back', 'b-forward', 'b-reload'];
      const boxes = ids.map((id) => document.getElementById(id).getBoundingClientRect());
      const inside = boxes.every((r) => r.width >= 24 && r.left >= side.left && r.right <= side.right);
      const apart = boxes.every((r, i) => i === 0 || r.left >= boxes[i - 1].right - 0.5);
      const hit = ids.every((id, i) => { const r = boxes[i]; const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return document.getElementById(id).disabled ? !!el && el.id === 'top' : !!el && !!el.closest('#' + id); });
      return { inside, apart, hit, lights: boxes[0].left };
    })()`);
    check('barre resserrée au minimum (200 px) : précédent, suivant et actualiser restent entiers, côte à côte, cliquables, à droite des boutons de la fenêtre',
      w.sidebarWidth === 200 && narrow.inside && narrow.apart && narrow.hit && (process.platform !== 'darwin' || narrow.lights >= 60), JSON.stringify(narrow));
    w.setSidebarWidth(width0);
    await until(() => ui(`S.sidebar.width === ${width0}`), 'largeur rétablie');
    const region = await ui(`(() => {
      const of = (el) => { const cs = getComputedStyle(el); return cs.getPropertyValue('app-region') || cs.getPropertyValue('-webkit-app-region') || cs.webkitAppRegion || ''; };
      const top = document.getElementById('top');
      const gap = top.querySelector('.drag').getBoundingClientRect();
      return { top: of(top), gap: of(top.querySelector('.drag')), gapW: gap.width, buttons: ['b-sidebar', 'b-back', 'b-forward', 'b-reload'].map((id) => of(document.getElementById(id))).join(), list: of(document.getElementById('scroll')), blank: of(document.getElementById('blank')), resize: of(document.getElementById('resize')) };
    })()`);
    check('le haut de la barre (entre les boutons) déplace la fenêtre ; les boutons, la liste et son vide (double-clic : nouvel onglet) non',
      region.top === 'drag' && region.gap === 'drag' && region.gapW > 20 && region.buttons === 'no-drag,no-drag,no-drag,no-drag' && region.list !== 'drag' && region.blank !== 'drag' && region.resize === 'no-drag', JSON.stringify(region));
  }

  // --- Témoin de capture animé, onglet partagé surligné, favori qui joue (BL-48, BL-38) ---------------
  {
    await until(() => ui('!drag && !slide && S.today.length > 0'), 'liste au repos');
    const seen = await ui(`(() => {
      const s0 = S;
      const reduced = reducedMotion.matches;
      const first = s0.today[0];
      const css = (sel) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); return { anim: cs.animationName, shadow: getComputedStyle(el.closest('.row, .tile')).boxShadow, cls: el.closest('.row, .tile').className }; };
      render({ ...s0, today: [{ ...first, capture: ['screen', 'microphone'] }, ...s0.today.slice(1)] });
      const share = css('#today .row.tab .act.cap');
      render({ ...s0, today: [{ ...first, capture: ['camera'] }, ...s0.today.slice(1)] });
      const cam = css('#today .row.tab .act.cap');
      const camRow = getComputedStyle(document.querySelector('#today .row.tab')).boxShadow;
      render({ ...s0, favorites: [{ ...first, id: 'fin2-tuile', audible: true, live: true }] });
      const bars = [...document.querySelectorAll('#fav .tile .dot i')].map((i) => { const cs = getComputedStyle(i); return cs.animationName + '/' + cs.display; });
      const frames = reduced ? [] : document.querySelector('#fav .tile .dot i').getAnimations().flatMap((a) => a.effect.getKeyframes().flatMap((k) => Object.keys(k))).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k));
      render({ ...s0, favorites: [{ ...first, id: 'fin2-tuile', audible: false, live: true }] });
      const quiet = [...document.querySelectorAll('#fav .tile .dot i')].map((i) => getComputedStyle(i).display).join();
      render(s0);
      return { reduced, share, cam, camRow, bars, frames: [...new Set(frames)].join(), quiet };
    })()`);
    const pulse = seen.reduced ? 'none' : 'capture-pulse';
    check('onglet dont l’écran est partagé : sa ligne est surlignée en jaune, son témoin bat ; caméra ou micro seuls : témoin sans surlignage',
      !!seen.share && seen.share.cls.includes('sharing') && /rgb\(250, 204, 21\)/.test(seen.share.shadow) && seen.share.anim === pulse
      && !!seen.cam && seen.cam.cls.includes('capturing') && !seen.cam.cls.includes('sharing') && !/rgb\(250, 204, 21\)/.test(seen.camRow) && seen.cam.anim === pulse, JSON.stringify(seen));
    check('favori qui joue du son : trois barres dansent sur sa tuile (transformation seule) ; silencieux : rien',
      seen.bars.length === 3 && seen.bars.every((x) => x === (seen.reduced ? 'none' : 'tile-notes') + '/block') && (seen.reduced || seen.frames === 'transform') && seen.quiet === 'none,none,none', JSON.stringify(seen));
  }

  // --- Économie de batterie (ONG-24) -----------------------------------------------------------------
  {
    const veille = require('../src/main/veille');
    check('économie de batterie : sur batterie et sous 20 % seulement ; branché, à 20 % ou plus, niveau illisible ou réglage coupé : non',
      veille.saving({ level: 0.19, charging: false }) === true && veille.saving({ level: 0.2, charging: false }) === false && veille.saving({ level: 0.05, charging: true }) === false
      && veille.saving(undefined) === false && veille.saving({ level: 'bas', charging: false }) === false && veille.saving({ level: 0.1, charging: false }, false) === false);
    check('… le délai de veille passe à dix minutes (jamais plus long que le réglage ; « jamais » compris)',
      veille.idleFor(3, true) === 600000 && veille.idleFor(0, true) === 600000 && veille.idleFor(3, false) === 3 * 36e5 && veille.idleFor(0, false) === 0 && veille.SAVER_IDLE === 600000);
    const reported = OrbeWindow.battery;
    if (reported) check('la barre latérale transmet le niveau de la batterie au démarrage (un nombre de 0 à 1, branché ou non)', Number.isFinite(reported.level) && reported.level >= 0 && reported.level <= 1 && typeof reported.charging === 'boolean', JSON.stringify(reported));
    else outils.ignorer('la barre latérale transmet le niveau de la batterie au démarrage', 'aucune batterie annoncée par le moteur sur cette machine');
    const battery0 = OrbeWindow.battery;
    const saver0 = store.state.settings.batterySaver;
    const hours0 = store.state.settings.sleepAfterHours;
    store.state.settings.batterySaver = true;
    store.state.settings.sleepAfterHours = 3;
    const toasts = [];
    const toast0 = w.toast;
    w.toast = (text) => { toasts.push(text); };
    const pick0 = veille.pick;
    const asked = [];
    veille.pick = (tabs, opts) => { asked.push(opts.idleMs); return []; };
    OrbeWindow.battery = { level: 0.8, charging: false };
    check('niveau refusé s’il n’est pas un nombre de 0 à 1 accompagné d’un booléen', w.handle('battery', { level: 2, charging: false }) === false && w.handle('battery', { level: 0.1 }) === false && w.handle('battery', '0.1') === false && w.handle('battery', { level: NaN, charging: false }) === false && OrbeWindow.battery.level === 0.8);
    OrbeWindow.trimLive({ deep: true });
    const normal = asked.pop();
    w.handle('battery', { level: 0.15, charging: false });
    const atDrop = asked.slice();
    w.handle('battery', { level: 0.14, charging: false });
    check('passage sous 20 % sur batterie : un message, une seule fois, et un passage de veille aussitôt avec le délai de dix minutes',
      normal === 3 * 36e5 && toasts.join() === T('toast.batterySaver') && atDrop.join() === '600000', JSON.stringify([normal, toasts, atDrop]));
    asked.length = 0;
    store.state.settings.batterySaver = false;
    OrbeWindow.trimLive({ deep: true });
    store.state.settings.batterySaver = true;
    w.handle('battery', { level: 0.14, charging: true });
    OrbeWindow.trimLive({ deep: true });
    check('réglage coupé, ou machine rebranchée : le délai choisi revient', asked.join() === `${3 * 36e5},${3 * 36e5}`, asked.join());
    check('réglage « Économie de batterie » : actif par défaut', require('../src/main/store').DEFAULT_SETTINGS.batterySaver === true);
    veille.pick = pick0;
    w.toast = toast0;
    OrbeWindow.battery = battery0;
    if (saver0 === undefined) delete store.state.settings.batterySaver; else store.state.settings.batterySaver = saver0;
    store.state.settings.sleepAfterHours = hours0;
  }

  // --- Nouvelle fenêtre depuis une fenêtre en plein écran (DIV-11) ------------------------------------
  {
    const enter0 = win.hooks.enterFullScreen;
    const entered = [];
    win.hooks.enterFullScreen = (bw) => { entered.push(bw); };
    const fake = (full) => ({ win: { isDestroyed: () => false, isFullScreen: () => full } });
    const a1 = OrbeWindow.open({ blank: true }, fake(true));
    const a2 = OrbeWindow.open({ blank: true }, fake(false));
    const a3 = OrbeWindow.open({ blank: true }, null);
    check('nouvelle fenêtre ouverte depuis une fenêtre en plein écran : elle passe en plein écran ; depuis une fenêtre ordinaire, ou sans fenêtre : non',
      entered.length === 1 && entered[0] === a1.win && a1.blank === true && !a2.win.isFullScreen() && !a3.win.isFullScreen());
    win.hooks.enterFullScreen = enter0;
    await until(() => [a1, a2, a3].every((x) => !x.ui.webContents.isLoading()), 'fenêtres d’essai chargées');
    await sleep(300);
    for (const x of [a1, a2, a3]) x.win.close();
    await until(() => ![a1, a2, a3].some((x) => OrbeWindow.all.includes(x)), 'fenêtres d’essai fermées');
    await until(() => ui('document.body.classList.contains("fullscreen") === S.fullScreen'), 'barre à jour');
    check('plein écran : la barre latérale le sait (plus de place réservée aux boutons de la fenêtre)',
      await ui(`(() => { const s0 = S; render({ ...s0, fullScreen: true }); const pad = getComputedStyle(document.getElementById('top')).paddingLeft; render(s0); return pad; })()`) === '0px');
  }

  // --- Déplacer la fenêtre par le haut de la page (BL-13) ---------------------------------------------
  {
    const band = await ui(`(() => {
      const el = document.getElementById('page-drag');
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const hit = document.elementFromPoint(S.sidebar.width + 200, 4);
      return { region: cs.getPropertyValue('app-region') || cs.getPropertyValue('-webkit-app-region'), left: Math.round(r.left), top: r.top, height: r.height, right: Math.round(innerWidth - r.right), sw: S.sidebar.width, hit: hit && hit.id };
    })()`);
    const page = w.contentRect();
    check('bande au-dessus de la page : elle déplace la fenêtre, de la barre latérale au bord droit, sans mordre sur la page',
      band.region === 'drag' && band.left === band.sw && band.top === 0 && band.height > 0 && band.height <= page.y && band.right === 10 && band.hit === 'page-drag', JSON.stringify([band, page]));
  }

  // --- Fenêtre → Médias (MEN-87) ---------------------------------------------------------------------
  {
    const { Menu } = require('electron');
    const find = (menu, label) => { for (const it of menu.items) { if (it.label === label) return it; if (it.submenu) { const f = find(it.submenu, label); if (f) return f; } } return null; };
    (ctx.menu || require('../src/main/menu')).refresh(true);
    await until(() => !!find(Menu.getApplicationMenu(), T('lib.media')), 'barre de menus à jour');
    const item = find(Menu.getApplicationMenu(), T('lib.media'));
    const before = w.activeId;
    item.click();
    const opened = await until(() => { const tab = w.activeId && d.tabs[w.activeId]; return tab && tab.internal && tab.url === 'orbe://app/library.html#media' ? tab : null; }, 'section Médias ouverte');
    check('barre de menus : « Médias » ouvre la Bibliothèque sur sa section Médias, dans un onglet d’Orbe', !!item && item.enabled !== false && !!opened && opened.internal === true);
    const rt = await until(() => { const x = win.live.get(opened.id); return x && !x.wc.isLoading() ? x : null; }, 'page chargée');
    check('… la section Médias y est affichée', await until(() => rt.wc.executeJavaScript(`(() => { const on = document.querySelector('[data-tab].on'); return !!on && on.dataset.tab === 'media'; })()`).catch(() => false), 'onglet Médias sélectionné').then(() => true, () => false));
    w.close(opened.id, { silent: true, ask: false });
    if (before && d.tabs[before]) w.activate(before);
  }

  // --- Remise en état ---------------------------------------------------------------------
  w.switchSpace(space.id);
  for (const id of Object.keys(d.tabs)) if (mine(d.tabs[id])) { OrbeWindow.destroyView(id); delete d.tabs[id]; }
  space.today = []; space.pinned = []; space.splits = [];
  delete w.activeBySpace[space.id];
  d.spaces.splice(d.spaces.indexOf(space), 1);
  store.state.archive = store.state.archive.filter((x) => !mine(x));
  check('remise en état : Espaces et archive retrouvent leur taille', d.spaces.length === spaces0 && store.state.archive.length === archive0, `${d.spaces.length}/${spaces0} ${store.state.archive.length}/${archive0}`);
  w.closed.length = 0;
  w.undoStack.length = 0;
  w.redoStack.length = 0;
  w.spaceId = home;
  if (homeActive && d.tabs[homeActive]) w.activeBySpace[home] = homeActive;
  if (w.sidebarVisible !== sidebar0) w.toggleSidebar(sidebar0);
  w.layout();
  w.changed();
  if (!ctx.check && failed) throw new Error(`${failed} vérification(s) en échec`);
};
