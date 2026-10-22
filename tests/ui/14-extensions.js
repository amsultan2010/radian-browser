// Extensions, à la souris réelle : bouton sous l'adresse, fenêtre de
// l'extension, panneau latéral (ouverture, largeur, fermeture).
const assert = require('node:assert/strict');
const path = require('path');

module.exports = {
  nom: 'Extensions',
  async test(ctx, t) {
    const { shell, jusqua, sleep } = ctx;
    await ctx.ouvrir('/a', 'Page A');
    const id = await ctx.principal(async ({ req, win }, dir) => {
      const ses = req('sessions.js').mainSession();
      const ext = await ses.extensions.loadExtension(dir);
      req('ext-host.js').sync();
      win.OrbeWindow.pushAll();
      return ext.id;
    }, path.join(ctx.root, 'tests', 'ext-fixture'));
    const pageExt = (fichier) => ctx.pages().find((p) => p.url().startsWith(`chrome-extension://${id}/${fichier}`));
    const sousLePointeur = (page, sel) => page.evaluate((s) => {
      const el = document.querySelector(s);
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!top && (top === el || el.contains(top));
    }, sel);

    await t.verifier('le bouton de l’extension apparaît sous l’adresse, sans recouvrir ni être recouvert', async () => {
      await jusqua(() => shell.evaluate(() => document.querySelectorAll('#exts .ext').length === 1), 'bouton d’extension');
      assert.equal(await sousLePointeur(shell, '#exts .ext'), true);
      const boites = await shell.evaluate(() => ['url-row', 'exts', 'scroll'].map((x) => { const r = document.getElementById(x).getBoundingClientRect(); return [r.top, r.bottom]; }));
      assert.ok(boites[0][1] <= boites[1][0] + 1 && boites[1][1] <= boites[2][0] + 1, 'adresse, boutons et listes se suivent sans chevauchement : ' + JSON.stringify(boites));
      assert.equal(await shell.getAttribute('#exts .ext', 'title'), 'Essai');
    });

    await t.verifier('barre d’outils affichée (⇧⌘D) : le bouton de l’extension passe à droite de l’adresse, et s’y laisse cliquer ; barre masquée, il revient sous l’adresse', async () => {
      await ctx.menu('Shift+Cmd+D');
      await jusqua(() => shell.locator('#toolbar').isVisible(), 'barre d’outils');
      await jusqua(() => shell.evaluate(() => document.querySelectorAll('#tb-exts .ext').length === 1 && document.querySelectorAll('#exts .ext').length === 0), 'bouton dans la barre d’outils');
      const adresse = await shell.locator('#tb-url').boundingBox();
      const bouton = await shell.locator('#tb-exts .ext').boundingBox();
      const barre = await shell.locator('#toolbar').boundingBox();
      assert.ok(bouton.x >= adresse.x + adresse.width && bouton.x + bouton.width <= barre.x + barre.width + 1 && bouton.y >= barre.y && bouton.y + bouton.height <= barre.y + barre.height, JSON.stringify([adresse, bouton, barre]));
      assert.equal(await sousLePointeur(shell, '#tb-exts .ext'), true);
      await ctx.clic(shell, '#tb-exts .ext');
      await jusqua(() => pageExt('popup.html'), 'fenêtre de l’extension', 8000);
      await ctx.principal(({ req, w }) => req('ext-host.js').closePopup(w));
      await jusqua(() => !pageExt('popup.html'), 'fenêtre refermée', 8000);
      await ctx.menu('Shift+Cmd+D');
      await jusqua(() => shell.evaluate(() => document.querySelectorAll('#exts .ext').length === 1 && document.querySelectorAll('#tb-exts .ext').length === 0), 'bouton revenu sous l’adresse');
    });

    await t.verifier('un clic sur le bouton ouvre la fenêtre de l’extension', async () => {
      await ctx.clic(shell, '#exts .ext');
      const popup = await jusqua(() => pageExt('popup.html'), 'fenêtre de l’extension', 8000);
      await jusqua(() => popup.evaluate(() => !!document.getElementById('out')), 'contenu de la fenêtre');
      assert.equal(await popup.evaluate(() => typeof chrome.tabs.query), 'function');
      const actif = await popup.evaluate(() => chrome.tabs.query({ active: true, currentWindow: true }).then((x) => x.map((y) => y.url)));
      assert.deepEqual(actif, [ctx.url('/a')], 'la fenêtre voit l’onglet actif d’Orbe');
    });

    await t.verifier('le panneau latéral s’ouvre à droite et la page lui laisse la place', async () => {
      const avant = (await ctx.etat()).vuePage.width;
      const popup = pageExt('popup.html') || (await (async () => { await ctx.clic(shell, '#exts .ext'); return jusqua(() => pageExt('popup.html'), 'fenêtre', 8000); })());
      await popup.evaluate(() => chrome.windows.getCurrent().then((w) => chrome.sidePanel.open({ windowId: w.id })));
      await jusqua(() => pageExt('panel.html'), 'page du panneau', 8000);
      const apres = await jusqua(async () => { const l = (await ctx.etat()).vuePage.width; return l < avant - 200 ? l : null; }, 'page rétrécie');
      const cadre = await jusqua(() => ctx.pages().find((p) => p.url().includes('orbe://app/panel.html')), 'cadre du panneau');
      await jusqua(() => cadre.evaluate(() => !document.getElementById('panel').hidden), 'cadre affiché');
      assert.equal(await sousLePointeur(cadre, '#close'), true, 'le bouton de fermeture est atteignable');
      ctx.largeurAvecPanneau = apres;
      ctx.largeurSansPanneau = avant;
    });

    await t.verifier('un clic sur × ferme le panneau, la page reprend sa largeur', async () => {
      const cadre = ctx.pages().find((p) => p.url().includes('orbe://app/panel.html'));
      const b = await cadre.evaluate(() => { const r = document.getElementById('close').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await cadre.mouse.click(b.x, b.y);
      await jusqua(async () => (await ctx.etat()).vuePage.width === ctx.largeurSansPanneau, 'largeur rétablie');
      await sleep(100);
    });

    await t.verifier('fenêtre des mots de passe : « Ajouter » ouvre un formulaire utilisable à la souris', async () => {
      await ctx.principal(({ w }) => { w.run('passwords'); });
      const gestion = await jusqua(() => ctx.pages().find((p) => p.url().includes('passwords.html')), 'fenêtre des mots de passe', 8000);
      // La page est prête quand le bouton a pris sa taille (textes traduits posés).
      await jusqua(() => gestion.evaluate(() => { const b = document.getElementById('add'); return !!b && b.getBoundingClientRect().width > 40; }), 'bouton Ajouter');
      assert.equal(await sousLePointeur(gestion, '#add'), true);
      await gestion.click('#add');
      await jusqua(() => gestion.evaluate(() => !document.getElementById('new').hidden && document.querySelectorAll('#new input').length >= 2), 'formulaire d’ajout');
      assert.equal(await sousLePointeur(gestion, '#new input'), true, 'le premier champ n’est recouvert par rien');
      // Aucun élément masqué n'est dessiné.
      const fantomes = await gestion.evaluate(() => [...document.querySelectorAll('[hidden]')].filter((el) => el.getClientRects().length).map((el) => el.id || el.className));
      assert.deepEqual(fantomes, []);
    });

    // --- Raccourci d'une commande d'extension, enregistré avec de vraies touches (EXT-7) ---
    await t.verifier('Réglages → Raccourcis : le raccourci d’une commande d’extension s’enregistre au clavier, puis se rétablit', async () => {
      const mac = process.platform === 'darwin';
      await ctx.menu('Cmd+,');
      const r = await ctx.attendrePage('settings.html');
      await r.click('#tab-shortcuts');
      const ligne = r.locator(`.key-row[data-name="ext:${id}/essai"]`);
      await jusqua(async () => (await ligne.count()) === 1, 'ligne de la commande d’extension');
      await ligne.scrollIntoViewIfNeeded();
      assert.match(await ligne.locator('.label').textContent(), /Commande d'essai/);
      assert.equal((await ligne.locator('.key-btn').textContent()).trim(), mac ? '⌥⇧Y' : 'Alt+Shift+Y');
      await ligne.locator('.key-btn').click();
      await jusqua(async () => (await ligne.locator('.key-btn').textContent()).trim() === 'Appuie sur les touches…', 'enregistrement en cours');
      await r.keyboard.press('Control+Alt+F9');
      const nouvelle = r.locator(`.key-row[data-name="ext:${id}/essai"]`);
      await jusqua(async () => (await nouvelle.locator('.key-btn').textContent()).trim() === (mac ? '⌃⌥F9' : 'Ctrl+Alt+F9'), 'nouveau raccourci affiché');
      assert.equal(await ctx.principal(({ req }, x) => req('ext-more.js').shortcutOf(req('sessions.js').mainSession(), x, 'essai'), id), mac ? '⌃⌥F9' : 'Ctrl+Alt+F9');
      assert.ok(await nouvelle.evaluate((el) => el.classList.contains('changed')), 'la ligne est marquée comme modifiée');
      await nouvelle.locator('.key-reset').click();
      await jusqua(async () => (await r.locator(`.key-row[data-name="ext:${id}/essai"] .key-btn`).textContent()).trim() === (mac ? '⌥⇧Y' : 'Alt+Shift+Y'), 'raccourci proposé par l’extension rétabli');
      assert.deepEqual(await ctx.principal(({ store }) => store.state.settings.extShortcuts), {});
      // Échap ferme la fenêtre : la page disparaît pendant la frappe.
      await r.keyboard.press('Escape').catch(() => {});
      await jusqua(() => !ctx.page('settings.html'), 'réglages refermés');
    });

    // --- Clic droit sur le bouton : détacher (EXT-3, EXT-5) -------------------------------
    await t.verifier('clic droit sur le bouton de l’extension : son menu ; « Détacher » retire le bouton, qui revient une fois épinglé', async () => {
      // Le menu natif ne se pilote pas : il est relevé, puis son article actionné.
      await ctx.principal(({ w }) => { global.__menuExt = null; w.__popup = w.popup; w.popup = (tpl) => { global.__menuExt = tpl; }; });
      await shell.locator('#exts .ext').click({ button: 'right' });
      await jusqua(() => ctx.principal(() => !!global.__menuExt), 'menu de l’extension');
      const articles = await ctx.principal(() => global.__menuExt.filter((i) => i.type !== 'separator').map((i) => i.label));
      assert.deepEqual(articles.slice(1), ['Options', 'Détacher de la barre latérale', 'Gérer les extensions…']);
      await ctx.principal(() => { global.__menuExt.find((i) => i.label === 'Détacher de la barre latérale').click(); });
      await jusqua(() => shell.evaluate(() => document.querySelectorAll('#exts .ext').length === 0), 'bouton détaché');
      const boites = await shell.evaluate(() => document.getElementById('exts').getBoundingClientRect().height);
      assert.equal(boites, 0, 'la rangée vide ne garde pas de place');
      await ctx.principal(({ req, w }, x) => { req('ext-ui.js').setPinned(x, true); w.popup = w.__popup; }, id);
      await jusqua(() => shell.evaluate(() => document.querySelectorAll('#exts .ext').length === 1), 'bouton revenu');
    });
  },
};
