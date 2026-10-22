// Panneau de création d'un Espace (ESP-2), à la vraie souris et au vrai clavier :
// ouverture par le « + » de la barre et par le menu, nom, émoji, couleur, profil,
// Échap et clic au-dehors (rien n'est créé), « Créer », message « Annuler », ⌘Z.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Création d’un Espace : le panneau',
  async test(ctx, t) {
    const { shell, modal, jusqua } = ctx;
    const espaces = async () => (await ctx.etat()).espaces.map((s) => s.nom);
    const ouvert = () => modal.evaluate(() => mode === 'space' && !document.getElementById('space').hidden); // eslint-disable-line no-undef
    const ferme = () => jusqua(async () => !(await ctx.etat()).modale && !(await ouvert()), 'panneau refermé');
    const dernier = () => ctx.principal(({ w }) => { const s = w.space; const p = w.data.profiles.find((x) => x.id === s.profileId); return { nom: s.name, icone: s.icon, couleur: s.color, couleur2: s.color2 || '', profil: s.profileId, profilNom: p ? p.name : null, profils: w.data.profiles.length, rang: w.data.spaces.indexOf(s) }; });
    await ctx.principal(({ w }) => { w.popup = (tpl) => { w.menuVu = tpl; }; });

    await ctx.ouvrir('/a', 'Page A');

    await t.verifier('bouton « + » de la barre, puis « Nouvel Espace… » : le panneau s’ouvre au-dessus de la barre, champ de nom actif ; rien n’est créé', async () => {
      await ctx.clic(shell, '#b-plus');
      await jusqua(() => ctx.principal(({ w }) => !!w.menuVu), 'menu « + »');
      await ctx.principal(({ w, store }) => w.menuVu.find((x) => x.label === store.t('spaces.new')).click());
      await ctx.panneauEspace();
      assert.equal(await modal.textContent('#space h3'), 'Nouvel Espace');
      assert.equal(await modal.getAttribute('#space-input', 'placeholder'), 'Nouvel Espace');
      assert.equal(await modal.textContent('#space-create'), 'Créer');
      assert.equal(await modal.textContent('#space-cancel'), 'Annuler');
      assert.match(await modal.textContent('#space-hint'), /cookies/);
      assert.deepEqual(await modal.locator('#space-profiles .space-profile').allTextContents(), [await ctx.principal(({ w }) => w.data.profiles[0].name), 'Nouveau profil…']);
      const b = await modal.locator('#space').boundingBox();
      const e = await ctx.etat();
      const vue = await ctx.principal(({ w }) => w.win.getContentSize());
      assert.ok(b.x >= e.largeur && b.x + b.width <= vue[0] && b.y >= 0 && b.y + b.height <= vue[1], 'panneau entier dans la fenêtre, à droite de la barre : ' + JSON.stringify(b));
      assert.deepEqual(await espaces(), ['Personnel']);
    });

    await t.verifier('nom tapé, émoji cherché et cliqué, couleur et profil cliqués : tout reste dans le panneau ; Échap referme d’abord les émojis, puis le panneau — aucun Espace créé', async () => {
      await modal.keyboard.type('Brouillon', { delay: 5 });
      await ctx.clic(modal, '#space-icon');
      await jusqua(() => modal.evaluate(() => !document.getElementById('icons').hidden && document.activeElement.id === 'icons-input'), 'sélecteur d’émojis');
      // Le sélecteur se range à côté du panneau, sans le recouvrir (quand la fenêtre est assez large).
      const [p, i] = [await modal.locator('#space').boundingBox(), await modal.locator('#icons').boundingBox()];
      const large = (await ctx.principal(({ w }) => w.win.getContentSize()))[0] >= p.x + p.width * 2 + 16;
      if (large) assert.ok(i.x >= p.x + p.width, 'émojis à droite du panneau : ' + JSON.stringify([p, i]));
      await modal.keyboard.type('fus', { delay: 10 });
      await jusqua(() => modal.evaluate(() => [...document.querySelectorAll('#icons .em-pick')].some((b) => b.dataset.e === '🚀')), 'fusée trouvée');
      await ctx.clic(modal, modal.locator('#icons .em-pick[data-e="🚀"]'));
      await jusqua(async () => (await modal.textContent('#space-icon')) === '🚀' && modal.evaluate(() => document.getElementById('icons').hidden && document.activeElement.id === 'space-input'), 'émoji posé, retour au nom');
      await ctx.clic(modal, '#space-colors .sw-color[data-c="#ef4444"]');
      await jusqua(() => modal.evaluate(() => document.querySelector('#space-colors .sel')?.dataset.c === '#ef4444'), 'couleur choisie');
      await ctx.clic(modal, '#space-profiles .space-profile[data-profile="new"]');
      await jusqua(() => modal.evaluate(() => document.querySelector('#space-profiles .sel')?.dataset.profile === 'new' && document.activeElement.id === 'space-input'), 'profil choisi, clavier resté au nom');
      assert.equal(await modal.inputValue('#space-input'), 'Brouillon');
      await ctx.clic(modal, '#space-icon');
      await jusqua(() => modal.evaluate(() => !document.getElementById('icons').hidden), 'émojis rouverts');
      await ctx.capture('creation-espace-panneau', modal);
      await modal.keyboard.press('Escape');
      await jusqua(() => modal.evaluate(() => document.getElementById('icons').hidden), 'émojis refermés');
      assert.equal(await ouvert(), true, 'le panneau reste');
      await modal.keyboard.press('Escape');
      await ferme();
      const e = await ctx.principal(({ w }) => ({ n: w.data.spaces.length, p: w.data.profiles.length, pile: w.undoStack.filter((x) => x.label === 'undo.newSpace').length }));
      assert.deepEqual(e, { n: 1, p: 1, pile: 0 });
    });

    await t.verifier('rouvert par le menu : brouillon vide ; un clic au-dehors du panneau le referme sans rien créer', async () => {
      await ctx.menu('spaces.new');
      await ctx.panneauEspace();
      assert.equal(await modal.inputValue('#space-input'), '');
      assert.equal(await modal.textContent('#space-icon'), '✨');
      const b = await modal.locator('#space').boundingBox();
      await modal.mouse.click(b.x + b.width + 60, Math.max(20, b.y - 30));
      await ferme();
      assert.deepEqual(await espaces(), ['Personnel']);
    });

    await t.verifier('« Annuler » (vrai clic) referme sans rien créer', async () => {
      await ctx.menu('spaces.new');
      await ctx.panneauEspace();
      await modal.keyboard.type('Non', { delay: 5 });
      await ctx.clic(modal, '#space-cancel');
      await ferme();
      assert.deepEqual(await espaces(), ['Personnel']);
    });

    await t.verifier('nom, fusée, rouge, « Nouveau profil… », puis clic sur « Créer » : l’Espace paraît avec tout cela, juste après l’Espace affiché, sans champ de nom', async () => {
      await ctx.menu('spaces.new');
      await ctx.panneauEspace();
      await modal.keyboard.type('Voyages', { delay: 5 });
      await ctx.clic(modal, '#space-icon');
      await jusqua(() => modal.evaluate(() => document.activeElement.id === 'icons-input'), 'sélecteur d’émojis');
      await modal.keyboard.type('fus', { delay: 10 });
      await ctx.clic(modal, modal.locator('#icons .em-pick[data-e="🚀"]'));
      await ctx.clic(modal, '#space-colors .sw-color[data-c="#ef4444"]');
      await ctx.clic(modal, '#space-profiles .space-profile[data-profile="new"]');
      await jusqua(() => modal.evaluate(() => document.querySelector('#space-profiles .sel')?.dataset.profile === 'new'), 'profil choisi');
      await ctx.clic(modal, '#space-create');
      await jusqua(async () => (await ctx.etat()).espace === 'Voyages', 'Espace créé');
      await ferme();
      const s = await dernier();
      assert.deepEqual({ nom: s.nom, icone: s.icone, couleur: s.couleur, rang: s.rang, profils: s.profils }, { nom: 'Voyages', icone: '🚀', couleur: '#ef4444', rang: 1, profils: 2 });
      assert.ok(s.profil !== 'default' && s.profilNom === 'Profil 2', JSON.stringify(s));
      await jusqua(async () => (await shell.textContent('#space-name')) === 'Voyages', 'nom dans la barre');
      assert.equal(await shell.locator('input.rename').count(), 0);
      assert.equal((await shell.evaluate(() => document.body.style.getPropertyValue('--accent'))).toLowerCase(), '#ef4444');
    });

    await t.verifier('le message « Nouvel Espace créé » propose « Annuler » : un clic retire l’Espace et le profil créé avec lui', async () => {
      const toast = await ctx.attendrePage('overlay.html#toast');
      await jusqua(async () => (await toast.locator('#toast .act').count()) === 1, 'bouton « Annuler » du message');
      assert.ok((await toast.locator('#toast').textContent()).startsWith(await ctx.texte('toast.spaceCreated')));
      await ctx.clic(toast, '#toast .act');
      await jusqua(async () => (await espaces()).join() === 'Personnel', 'Espace retiré');
      assert.equal(await ctx.principal(({ w }) => w.data.profiles.length), 1);
    });

    await t.verifier('thème prêt cliqué, Entrée dans le champ de nom : Espace créé aux couleurs du thème ; ⌘Z le retire, ⇧⌘Z le rétablit', async () => {
      await ctx.menu('spaces.new');
      await ctx.panneauEspace();
      await modal.keyboard.type('Lagon', { delay: 5 });
      await ctx.clic(modal, '#space-presets .preset[data-preset="lagon"]');
      await jusqua(() => modal.evaluate(() => document.querySelector('#space-presets .sel')?.dataset.preset === 'lagon' && !document.querySelector('#space-colors .sel')), 'thème choisi');
      await modal.keyboard.press('Enter');
      await jusqua(async () => (await ctx.etat()).espace === 'Lagon', 'Espace créé');
      const s = await dernier();
      assert.deepEqual([s.couleur, s.couleur2, s.profil], ['#3b82f6', '#06b6d4', 'default']);
      await ctx.menu('Cmd+Z');
      await jusqua(async () => (await espaces()).join() === 'Personnel', 'création annulée');
      await ctx.menu('Shift+Cmd+Z');
      await jusqua(async () => (await espaces()).join() === 'Personnel,Lagon' && (await ctx.etat()).espace === 'Lagon', 'création rétablie');
    });

    await t.verifier('« Créer et personnaliser le thème… » : l’Espace est créé, l’éditeur de thème s’ouvre sur lui', async () => {
      await ctx.menu('spaces.new');
      await ctx.panneauEspace();
      await modal.keyboard.type('Atelier', { delay: 5 });
      await ctx.clic(modal, '#space-theme');
      await jusqua(async () => { const e = await ctx.etat(); return e.espace === 'Atelier' && e.modale === 'theme'; }, 'Espace créé, éditeur de thème ouvert');
      assert.equal(await modal.evaluate(() => !document.getElementById('theme').hidden && document.getElementById('space').hidden), true);
      await modal.keyboard.press('Escape');
      await ferme();
      assert.deepEqual(await espaces(), ['Personnel', 'Lagon', 'Atelier']);
    });

    await ctx.capture('creation-espace');
  },
};
