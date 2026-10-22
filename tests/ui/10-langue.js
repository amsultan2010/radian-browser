// Langue : le choix fait dans la fenêtre des réglages met à jour les libellés
// de la barre latérale, de la barre de commande et du menu.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Langue',
  async test(ctx, t) {
    const { shell, modal, jusqua } = ctx;
    const libelles = () => shell.evaluate(() => ({
      nouvel: document.querySelector('#b-newtab .title').textContent,
      effacer: document.getElementById('b-clear').textContent,
      adresse: document.getElementById('url-text').textContent,
      accueil: document.querySelector('#empty p').textContent,
      // Boutons à infobulle maison : leur nom est porté par « aria-label » (le raccourci est ajouté à l'affichage).
      bouton: document.getElementById('b-sidebar').getAttribute('aria-label'),
      retour: document.getElementById('b-back').getAttribute('aria-label'),
      langue: document.documentElement.lang,
    }));
    const menuCmdT = () => ctx.app.evaluate(({ Menu }) => {
      const walk = (m) => { for (const it of m.items) { if (it.accelerator === 'Cmd+T') return it.label; if (it.submenu) { const f = walk(it.submenu); if (f) return f; } } return null; };
      return walk(Menu.getApplicationMenu());
    });
    let reglages = null;

    await t.verifier('interface en français par défaut', async () => {
      assert.deepEqual(await libelles(), {
        nouvel: 'Nouvel onglet',
        effacer: 'Effacer',
        adresse: 'Rechercher ou saisir une adresse…',
        accueil: 'Appuie sur ⌘T pour ouvrir un onglet',
        bouton: 'Barre latérale',
        retour: 'Page précédente',
        langue: 'fr',
      });
      assert.match(await menuCmdT(), /^Nouvel onglet/);
    });

    await t.verifier('⌘, (élément de menu) ouvre la fenêtre des réglages', async () => {
      await ctx.menu('Cmd+,');
      reglages = await ctx.attendrePage('settings.html');
      await jusqua(async () => (await reglages.locator('#tab-general').textContent()).trim() === 'Général' && (await reglages.title()) === 'Réglages', 'fenêtre « Réglages »');
      assert.equal(await reglages.inputValue('#lang'), 'fr');
    });

    await t.verifier('choisir « English » : la barre latérale passe en anglais', async () => {
      await reglages.selectOption('#lang', 'en');
      await jusqua(async () => (await libelles()).nouvel === 'New Tab', 'libellé « New Tab »');
      assert.deepEqual(await libelles(), {
        nouvel: 'New Tab',
        effacer: 'Clear',
        adresse: 'Search or enter URL…',
        accueil: 'Press ⌘T to open a tab',
        bouton: 'Sidebar',
        retour: 'Go back',
        langue: 'en',
      });
      assert.equal((await ctx.etat()).langue, 'en');
    });

    await t.verifier('la fenêtre des réglages et le menu passent aussi en anglais', async () => {
      await jusqua(async () => (await reglages.locator('#tab-general').textContent()).trim() === 'General' && (await reglages.title()) === 'Settings', 'fenêtre « Settings »');
      await jusqua(async () => /^New Tab/.test(await menuCmdT()), 'menu « New Tab »');
    });

    await t.verifier('la barre de commande et ses suggestions sont en anglais', async () => {
      await ctx.nouvelOnglet();
      assert.equal(await modal.getAttribute('#cmd-input', 'placeholder'), 'Search or enter URL…');
      await ctx.taper(ctx.hote + '/a');
      assert.match(await modal.locator('#cmd-list .cmd.sel .sub').textContent(), /Open page/);
      await modal.keyboard.press('Enter');
      await jusqua(async () => (await ctx.titres()).join() === 'Page A', 'onglet ouvert');
    });

    await ctx.capture('langue-en');

    await t.verifier('la recherche dans la page est en anglais', async () => {
      await ctx.menu('Cmd+F');
      const barre = await ctx.attendrePage('overlay.html#find');
      await jusqua(async () => (await barre.getAttribute('#find-input', 'placeholder')) === 'Find in page', 'invite « Find in page »');
      await barre.keyboard.type('zzz', { delay: 20 });
      await jusqua(async () => (await barre.textContent('#find-count')) === 'No results', '« No results »');
      await barre.keyboard.press('Escape');
    });

    await t.verifier('retour au français : tous les libellés reviennent', async () => {
      await reglages.selectOption('#lang', 'fr');
      await jusqua(async () => (await libelles()).nouvel === 'Nouvel onglet', 'libellé « Nouvel onglet »');
      const l = await libelles();
      assert.equal(l.effacer, 'Effacer');
      assert.equal(l.bouton, 'Barre latérale');
      assert.equal(l.langue, 'fr');
      await jusqua(async () => /^Nouvel onglet/.test(await menuCmdT()), 'menu « Nouvel onglet »');
      await jusqua(async () => (await reglages.locator('#tab-general').textContent()).trim() === 'Général' && (await reglages.title()) === 'Réglages', 'fenêtre « Réglages »');
      await ctx.menu('Cmd+W');
      await jusqua(async () => (await libelles()).adresse === 'Rechercher ou saisir une adresse…', 'invite d’adresse en français');
    });
  },
};
