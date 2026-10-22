// Mots de passe, à la souris et au clavier réels : proposition d'enregistrer
// après une connexion, puis remplissage par le sélecteur d'Orbe.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Mots de passe',
  async test(ctx, t) {
    const { jusqua, sleep } = ctx;
    const fenetre = (mode) => ctx.pages().find((p) => p.url().includes('pw-overlay.html') && p.url().includes(mode));
    const visible = (page, id) => page.evaluate((x) => { const el = document.getElementById(x); return !!el && !el.hidden; }, id).catch(() => false);
    const flottante = async (id) => jusqua(async () => {
      for (const p of ctx.pages().filter((x) => x.url().includes('pw-overlay.html'))) if (await visible(p, id)) return p;
      return null;
    }, 'vue « ' + id + ' » affichée', 8000);
    void fenetre;

    await ctx.ouvrir('/connexion', 'Connexion');
    const page = () => ctx.onglet('/connexion');

    await t.verifier('après une connexion saisie au clavier, Orbe propose d’enregistrer le mot de passe', async () => {
      await page().click('#u');
      await page().keyboard.type('amadou');
      await page().click('#p');
      await page().keyboard.type('Secret-123');
      await page().keyboard.press('Enter');
      const prompt = await flottante('save');
      assert.equal(await prompt.inputValue('#save-user'), 'amadou');
      assert.match(await prompt.textContent('#save-title'), /127\.0\.0\.1/);
      await sleep(700); // les boutons ignorent un clic trop rapide (protection)
      await prompt.click('#save-ok');
      await jusqua(async () => !(await visible(prompt, 'save')), 'proposition refermée');
    });

    await t.verifier('le mot de passe n’est écrit en clair ni dans le coffre ni dans l’état', async () => {
      const fs = require('fs');
      const path = require('path');
      await jusqua(() => fs.existsSync(path.join(ctx.userData, 'passwords.json')), 'coffre écrit', 8000);
      for (const f of ['passwords.json', 'orbe.json']) {
        const file = path.join(ctx.userData, f);
        if (fs.existsSync(file)) assert.ok(!fs.readFileSync(file, 'utf8').includes('Secret-123'), f + ' contient le mot de passe en clair');
      }
    });

    await t.verifier('de retour sur la page : un clic dans le champ ouvre le sélecteur, un clic sur le compte remplit', async () => {
      await ctx.ouvrir('/connexion', 'Connexion');
      const p = ctx.pages().filter((x) => x.url() === ctx.url('/connexion')).pop();
      assert.equal(await p.inputValue('#p'), '', 'rien n’est rempli sans geste');
      await p.click('#u', { timeout: 3000 }).catch((e) => { throw new Error('clic champ: ' + e.message.split('\n')[0] + ' — pages: ' + ctx.pages().map((x) => x.url().slice(-28)).join(' | ')); });
      const pick = await flottante('pick');
      await jusqua(() => pick.evaluate(() => document.querySelectorAll('#pick .acc').length > 0), 'compte proposé');
      assert.match(await pick.textContent('#pick'), /amadou/);
      assert.ok(!(await pick.textContent('#pick')).includes('Secret-123'), 'le sélecteur n’affiche pas le mot de passe');
      await sleep(700);
      // Clic réel aux coordonnées du compte (la vue du sélecteur est toute petite).
      const box = await pick.evaluate(() => { const r = document.querySelector('#pick .acc').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      // Le clic doit tomber sur le compte lui-même (régression : le formulaire
      // d'enregistrement, masqué, était dessiné par-dessus la liste).
      const dessous = await pick.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return !!e && !!e.closest('.acc'); }, box);
      assert.equal(dessous, true, 'le compte est bien l’élément sous le pointeur');
      await pick.mouse.click(box.x, box.y);
      await jusqua(async () => (await p.inputValue('#p')) === 'Secret-123', 'mot de passe rempli');
      assert.equal(await p.inputValue('#u'), 'amadou');
    });
  },
};
