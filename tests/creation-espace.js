// Panneau de création d'un Espace (ESP-2) : validation dans le processus principal,
// entrées (commande, menus, Bibliothèque), annulation, création avec nom, icône,
// couleur et profil, ⌘Z. Le geste au bout de la rangée est vérifié dans finitions2.js
// et derniers.js.
// Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/creation-espace.js node scripts/dev.js --selftest
const outils = require('./outils');

const { sleep } = outils;
const until = (fn, label, timeout = 10000) => outils.until(fn, label, timeout);

module.exports = async function creationEspaceTests(ctx) {
  const { first: w, store, OrbeWindow } = ctx;
  const { Menu } = require('electron');
  let failed = 0;
  const check = ctx.check || ((name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`); });
  const ui = (js) => w.ui.webContents.executeJavaScript(js);
  const panel = (js) => w.modal.webContents.executeJavaScript(js);
  const d = w.data;
  const T = (k, v) => store.t(k, null, v);

  await until(() => ui('typeof S === "object" && S !== null'), 'coque chargée');
  const home = w.spaceId;
  const sidebar0 = w.sidebarVisible;
  const n0 = d.spaces.length;
  const profiles0 = d.profiles.length;
  const pile0 = w.undoStack.length;
  const opened = () => until(() => w.modalMode === 'space' && panel(`mode === 'space' && !document.getElementById('space').hidden`), 'panneau de création ouvert');
  const closed = () => until(() => !w.modalMode && panel('mode === null'), 'panneau refermé');

  // --- Validation ------------------------------------------------------------------------
  {
    const P = [{ id: 'default', name: 'Défaut' }, { id: 'p2', name: 'Travail' }];
    const ok = (a) => OrbeWindow.checkSpace({ name: 'A', icon: '🚀', profileId: 'default', ...a }, P);
    const good = ok({ name: '  Mes   projets \n', color: '#10B981', profileId: 'p2' });
    check('création d’un Espace : nom nettoyé, icône, couleur et profil acceptés', !!good && good.name === 'Mes projets' && good.icon === '🚀' && good.color === '#10b981' && good.profileId === 'p2', JSON.stringify(good));
    check('… nom vide accepté (nom par défaut), nom de plus de 80 caractères ou d’un autre type refusé',
      ok({ name: '' }).name === '' && !!ok({ name: 'x'.repeat(80) }) && ok({ name: 'x'.repeat(81) }) === null && ok({ name: 5 }) === null && ok({ name: {} }) === null);
    check('… icône : un seul émoji, rien d’autre', ['', 'ab', '🚀🚀', '<b>', 7, null].every((icon) => ok({ icon }) === null) && !!ok({ icon: '👨‍👩‍👧' }));
    check('… couleur : #rrggbb seulement ; thème prêt : un identifiant connu',
      ['red', '#12', '#12345g', 'url(x)', 3].every((color) => ok({ color }) === null) && ok({ preset: 'lagon' }).preset === 'lagon' && ok({ preset: 'inconnu' }) === null && ok({ preset: 4 }) === null);
    check('… profil : il doit exister ; « new » demande un profil neuf', ok({ profileId: 'absent' }) === null && ok({ profileId: undefined }) === null && ok({ profileId: 'new' }).newProfile === true);
    check('… une demande qui n’est pas un objet est refusée', [null, 'x', 4, undefined].every((a) => OrbeWindow.checkSpace(a, P) === null));
    check('sans panneau ouvert, « spaceCreate » ne crée rien', w.handle('spaceCreate', { name: 'Pirate', icon: '🚀', profileId: 'default' }) === false && d.spaces.length === n0);
  }

  // --- Entrées : toutes ouvrent le panneau, aucune ne crée ---------------------------------
  {
    const find = (menu, label) => { for (const it of menu.items) { if (it.label === label) return it; const sub = it.submenu && find(it.submenu, label); if (sub) return sub; } return null; };
    const tries = [
      ['la commande « Nouvel Espace… »', () => w.run('newSpace')],
      ['la barre de menus', () => find(Menu.getApplicationMenu(), T('spaces.new')).click()],
      ['le menu de l’Espace', () => w.spaceMenuTemplate().find((x) => x.label === T('spaces.new')).click()],
      ['le menu « + » de la barre latérale', () => w.sidebarMenuTemplate(true).find((x) => x.label === T('spaces.new')).click()],
      ['la Bibliothèque', () => require('../src/main/library').action('lib:newSpace', undefined, w.ui.webContents)],
    ];
    for (const [name, go] of tries) {
      let err = '';
      try { await go(); } catch (e) { err = String(e && e.message); }
      const ok = await opened().then(() => true, () => false);
      check(`${name} ouvre le panneau de création, sans rien créer`, ok && d.spaces.length === n0 && w.spaceId === home, err);
      w.hideModal();
      await closed();
    }
  }

  // --- Le panneau ----------------------------------------------------------------------------
  {
    const mechant = { id: 'creation-p', name: '<img src=x onerror=alert(1)>' };
    d.profiles.push(mechant);
    d.favs[mechant.id] = [];
    w.askNewSpace();
    await opened();
    const vu = await panel(`(() => {
      const q = (s) => [...document.querySelectorAll(s)];
      const i = document.getElementById('space-input');
      return {
        focus: document.activeElement === i, nom: i.value, ph: i.placeholder, icone: document.getElementById('space-icon').textContent,
        couleurs: q('#space-colors .sw-color').length, choisie: q('#space-colors .sw-color.sel').map((b) => b.dataset.c), themes: q('#space-presets .preset').length,
        profils: q('#space-profiles .space-profile').map((b) => b.textContent), profil: q('#space-profiles .space-profile.sel').map((b) => b.dataset.profile),
        aide: document.getElementById('space-hint').textContent, images: q('#space img').length,
        boutons: [document.getElementById('space-cancel').textContent, document.getElementById('space-create').textContent],
        anim: getComputedStyle(document.getElementById('space')).animationName,
      };
    })()`);
    const used = new Set(d.spaces.map((s) => s.color));
    const { SPACE_COLORS } = require('../src/main/store');
    check('panneau : champ de nom vide et actif, avec le nom par défaut en indication ; icône ✨', vu.focus && vu.nom === '' && vu.ph === T('spaces.defaultName') && vu.icone === '✨', JSON.stringify(vu));
    check('panneau : douze couleurs (la première libre est choisie) et huit thèmes prêts', vu.couleurs === 12 && vu.themes === 8 && vu.choisie.join() === (SPACE_COLORS.find((c) => !used.has(c)) || SPACE_COLORS[0]), JSON.stringify(vu.choisie));
    check('panneau : les profils existants puis « Nouveau profil… » ; celui de l’Espace affiché est choisi ; une ligne explique ce qu’un profil sépare',
      vu.profils.length === d.profiles.length + 1 && vu.profils[vu.profils.length - 1] === T('space.newProfile') && vu.profil.join() === w.space.profileId && vu.aide === T('space.profileHint'), JSON.stringify(vu.profils));
    check('panneau : un nom de profil est affiché comme du texte, jamais comme du HTML', vu.profils.includes(mechant.name) && vu.images === 0);
    check('panneau : « Annuler » et « Créer » ; entrée par transformation et opacité (la même que le panneau du thème)', vu.boutons.join() === [T('dialog.cancel'), T('space.create')].join() && vu.anim === 'panel-in', JSON.stringify(vu.boutons) + vu.anim);

    // Une demande refusée laisse le panneau ouvert.
    const refus = w.handle('spaceCreate', { name: 'x', icon: '<b>', profileId: 'default' });
    check('demande refusée (icône qui n’est pas un émoji) : rien n’est créé, le panneau reste ouvert', refus === false && d.spaces.length === n0 && w.modalMode === 'space');

    // Échap : le sélecteur d'émojis d'abord, puis le panneau.
    await panel(`document.getElementById('space-input').value = 'Brouillon'; document.getElementById('space-icon').click()`);
    const emojis = await panel(`!document.getElementById('icons').hidden && document.querySelectorAll('#icons .em-pick').length > 100 && document.getElementById('icons-reset').hidden`);
    await panel(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    const apres = await panel(`document.getElementById('icons').hidden && mode === 'space' && document.getElementById('space-input').value === 'Brouillon'`);
    check('clic sur l’icône : le sélecteur d’émojis s’ouvre à côté ; Échap le referme seul, le panneau et le nom tapé restent', emojis && apres && w.modalMode === 'space');
    await panel(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await closed();
    check('Échap : le panneau se referme, aucun Espace n’est créé, rien à annuler', d.spaces.length === n0 && w.spaceId === home && w.undoStack.length === pile0 && d.profiles.length === profiles0 + 1);

    // « Annuler », puis réouverture : le brouillon n'est pas gardé.
    w.askNewSpace();
    await opened();
    const vide = await panel(`document.getElementById('space-input').value === ''`);
    await panel(`document.getElementById('space-cancel').click()`);
    await closed();
    check('« Annuler » referme sans créer ; rouvert, le panneau repart d’un brouillon vide', vide && d.spaces.length === n0);

    // Création complète par le panneau : nom, émoji choisi dans le sélecteur, couleur, profil existant.
    const toasts = [];
    const toast0 = w.toast;
    w.toast = (...a) => { toasts.push(a[0]); return toast0.apply(w, a); };
    w.askNewSpace();
    await opened();
    await panel(`(() => {
      document.getElementById('space-input').value = '  Voyages  ';
      document.getElementById('space-icon').click();
      [...document.querySelectorAll('#icons .em-pick')].find((b) => b.dataset.e === '🚀').click();
      document.querySelector('#space-colors .sw-color[data-c="#ef4444"]').click();
      [...document.querySelectorAll('#space-profiles .space-profile')].find((b) => b.dataset.profile === 'creation-p').click();
    })()`);
    const pret = await panel(`document.getElementById('icons').hidden && document.getElementById('space-icon').textContent === '🚀' && document.querySelector('#space-colors .sel').dataset.c === '#ef4444' && document.querySelector('#space-profiles .sel').dataset.profile === 'creation-p'`);
    check('panneau : l’émoji choisi, la couleur et le profil s’y affichent ; toujours rien de créé', pret && d.spaces.length === n0);
    const avant = d.spaces.indexOf(w.space);
    await panel(`document.getElementById('space-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
    await until(() => d.spaces.length === n0 + 1, 'Espace créé');
    const sp = w.space;
    check('Entrée dans le champ de nom : l’Espace est créé avec son nom, son icône, sa couleur et son profil, juste après l’Espace affiché',
      sp.name === 'Voyages' && sp.icon === '🚀' && sp.color === '#ef4444' && sp.profileId === 'creation-p' && d.spaces.indexOf(sp) === avant + 1 && sp.id !== home, JSON.stringify({ n: sp.name, i: sp.icon, c: sp.color, p: sp.profileId }));
    await closed();
    await sleep(150);
    check('… le panneau est refermé, aucun champ de nom ne s’ouvre, le message « Nouvel Espace créé » propose « Annuler »',
      !w.modalMode && await ui(`!document.querySelector('input.rename')`) && toasts.includes(T('toast.spaceCreated')) && (w.toastShown || {}).label === T('edit.undo'), JSON.stringify(w.toastShown));
    w.toast = toast0;
    w.replay('undo');
    check('⌘Z : l’Espace créé est retiré, l’Espace d’avant est affiché ; le profil qui existait déjà reste', d.spaces.length === n0 && !d.spaces.includes(sp) && w.spaceId === home && d.profiles.includes(mechant));
    w.replay('redo');
    check('⇧⌘Z : il revient, avec son nom, son icône, sa couleur et son profil', d.spaces.some((x) => x.id === sp.id && x.name === 'Voyages' && x.icon === '🚀' && x.color === '#ef4444' && x.profileId === 'creation-p'));
    w.replay('undo');
    await until(() => ui('!slide'), 'fin du glissement', 4000).catch(() => {});

    // « Nouveau profil… » et thème prêt, par le bouton « Créer » ; puis le lien vers l'éditeur de thème.
    w.switchSpace(home);
    w.askNewSpace();
    await opened();
    await panel(`(() => {
      document.querySelector('#space-presets .preset[data-preset="lagon"]').click();
      [...document.querySelectorAll('#space-profiles .space-profile')].find((b) => b.dataset.profile === 'new').click();
      document.getElementById('space-create').click();
    })()`);
    await until(() => d.spaces.length === n0 + 1, 'Espace créé');
    const sp2 = w.space;
    const neufProfil = d.profiles.find((p) => p.id === sp2.profileId);
    check('« Créer », sans nom, thème prêt et « Nouveau profil… » : nom par défaut, couleurs du thème, profil neuf créé avec l’Espace',
      sp2.name === T('spaces.defaultName') && sp2.color === '#3b82f6' && sp2.color2 === '#06b6d4' && sp2.texture === 'grain' && !!neufProfil && neufProfil.id !== 'default' && d.profiles.length === profiles0 + 2 && Array.isArray(d.favs[neufProfil.id]),
      JSON.stringify({ n: sp2.name, c: sp2.color, c2: sp2.color2, p: sp2.profileId }));
    w.replay('undo');
    check('⌘Z : l’Espace et le profil créé avec lui repartent ensemble', d.spaces.length === n0 && d.profiles.length === profiles0 + 1 && !d.profiles.includes(neufProfil) && !(neufProfil.id in d.favs));
    await closed();
    w.switchSpace(home);
    w.askNewSpace();
    await opened();
    await panel(`document.getElementById('space-input').value = 'Thème'; document.getElementById('space-theme').click()`);
    await until(() => d.spaces.length === n0 + 1 && w.modalMode === 'theme', 'Espace créé, éditeur de thème ouvert');
    check('« Créer et personnaliser le thème… » : l’Espace est créé, puis l’éditeur de thème s’ouvre sur lui', w.space.name === 'Thème' && w.modalMode === 'theme' && await until(() => panel(`mode === 'theme'`), 'éditeur de thème'));
    w.hideModal();
    w.replay('undo');

    // Création directe (essais, import) : toujours là, avec ou sans réglages.
    const direct = w.newSpace({ name: 'Direct', icon: '📚', color: '#10b981', profileId: 'absent' });
    check('création directe (essais, import) : `newSpace({ … })` crée sans panneau ; un profil inconnu retombe sur le profil par défaut',
      !!direct && w.space === direct && direct.name === 'Direct' && direct.icon === '📚' && direct.color === '#10b981' && direct.profileId === 'default' && !w.modalMode);
    w.replay('undo');

    d.profiles.splice(d.profiles.indexOf(mechant), 1);
    delete d.favs[mechant.id];
  }

  // --- Remise en état ---------------------------------------------------------------------
  w.hideModal();
  if (w.spaceId !== home) w.switchSpace(home);
  check('remise en état : Espaces et profils retrouvent leur nombre', d.spaces.length === n0 && d.profiles.length === profiles0, `${d.spaces.length}/${n0} ${d.profiles.length}/${profiles0}`);
  w.undoStack.length = pile0;
  w.redoStack.length = 0;
  if (w.sidebarVisible !== sidebar0) w.toggleSidebar(sidebar0);
  w.layout();
  w.changed();
  if (!ctx.check && failed) throw new Error(`${failed} vérification(s) en échec`);
};
