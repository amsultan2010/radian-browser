// Barre de commande, suite : barre vide sans onglet, ⇥ pour les actions seules,
// recherche dans un site, croix et ⌥⌘⌫ pour oublier une suggestion, copie de
// l'adresse avec son protocole, ⌘L puis Entrée, clic à travers le fond vers la
// barre latérale, Espace nommé, fenêtre neuve.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Barre de commande : portées et suggestions',
  async test(ctx, t) {
    const { shell, modal, jusqua, hote } = ctx;
    const champ = () => modal.inputValue('#cmd-input');
    const fermee = () => jusqua(async () => !(await ctx.commandeOuverte()), 'barre de commande refermée');
    const portee = () => modal.evaluate(() => { const c = document.getElementById('cmd-scope'); return c.hidden ? null : c.textContent; });
    const sous = () => modal.locator('#cmd-list .cmd .sub').allTextContents();
    const mac = process.platform === 'darwin';

    await t.verifier('aucun onglet : la barre ouverte propose de quoi démarrer (accueil, raccourcis, aide, réglages)', async () => {
      await ctx.nouvelOnglet();
      const titres = await ctx.suggestions();
      assert.ok(titres.includes('Bienvenue dans Orbe') && titres.includes('Centre d’aide') && titres.some((x) => /^Réglages/.test(x)), titres.join(' | '));
      assert.equal(await ctx.selection(), -1);
    });

    await t.verifier('⇥ sur la barre vide : pastille « Actions », la liste ne contient que des actions et défile', async () => {
      await modal.keyboard.press('Tab');
      await jusqua(async () => (await portee()) === 'Actions', 'pastille « Actions »');
      await jusqua(async () => (await ctx.suggestions()).length > 20, 'liste entière des actions');
      assert.equal(await modal.getAttribute('#cmd-input', 'placeholder'), 'Rechercher une action…');
      assert.equal(await modal.evaluate(() => document.activeElement.id), 'cmd-input');
      const liste = await modal.evaluate(() => { const l = document.getElementById('cmd-list'); return { vue: l.clientHeight, tout: l.scrollHeight }; });
      assert.ok(liste.tout > liste.vue + 200 && liste.vue <= 430, 'liste plus longue que le panneau : ' + JSON.stringify(liste));
      const panneau = await modal.locator('#command').boundingBox();
      assert.ok(panneau.y + panneau.height <= (await modal.evaluate(() => innerHeight)), 'le panneau tient dans la fenêtre');
    });

    await t.verifier('↓ au-delà du bas de la liste : la ligne sélectionnée défile à l’écran', async () => {
      for (let i = 0; i < 14; i++) await modal.keyboard.press('ArrowDown');
      assert.equal(await ctx.selection(), 13);
      const vu = await modal.evaluate(() => { const l = document.getElementById('cmd-list').getBoundingClientRect(); const r = document.querySelector('#cmd-list .cmd.sel').getBoundingClientRect(); return r.top >= l.top - 1 && r.bottom <= l.bottom + 1; });
      assert.equal(vu, true);
    });

    await t.verifier('la saisie filtre les actions ; aucune recherche ni page proposée', async () => {
      await ctx.taper('outils', false);
      await jusqua(async () => { const s = await ctx.suggestions(); return s.length > 0 && s.length < 8 && s.every((x) => /outils/i.test(x)); }, 'actions filtrées');
      assert.ok((await ctx.suggestions()).includes('Afficher la barre d’outils'));
      assert.ok(!(await sous()).some((s) => /Rechercher avec|Ouvrir la page/.test(s)));
    });

    await t.verifier('Entrée exécute l’action choisie', async () => {
      const i = (await ctx.suggestions()).indexOf('Afficher la barre d’outils');
      assert.ok(i >= 0, (await ctx.suggestions()).join(' | '));
      for (let k = 0; k < i; k++) await modal.keyboard.press('ArrowDown');
      await modal.keyboard.press('Enter');
      await fermee();
      await jusqua(() => shell.evaluate(() => document.body.classList.contains('toolbar')), 'barre d’outils affichée');
      await ctx.menu('Shift+Cmd+D');
      await jusqua(() => shell.evaluate(() => !document.body.classList.contains('toolbar')), 'barre d’outils masquée');
    });

    await t.verifier('retour arrière sur le champ vide : on quitte la portée « Actions »', async () => {
      await ctx.nouvelOnglet();
      await modal.keyboard.press('Tab');
      await jusqua(async () => (await portee()) === 'Actions', 'pastille « Actions »');
      await modal.keyboard.type('zo', { delay: 20 });
      await modal.keyboard.press('Backspace');
      await modal.keyboard.press('Backspace');
      assert.equal(await portee(), 'Actions', 'tant qu’il reste du texte à effacer, la portée tient');
      await modal.keyboard.press('Backspace');
      await jusqua(async () => (await portee()) === null, 'portée quittée');
      assert.equal(await modal.getAttribute('#cmd-input', 'placeholder'), 'Rechercher ou saisir une adresse…');
      assert.ok((await ctx.suggestions()).includes('Bienvenue dans Orbe'));
      await modal.keyboard.press('Escape');
      await fermee();
    });

    await ctx.ouvrir('/a', 'Page A');
    await ctx.ouvrir('/b', 'Page B');

    await t.verifier('nom d’un site : ligne « Rechercher sur YouTube », ⇥ ouvre la recherche dans ce site', async () => {
      await ctx.nouvelOnglet();
      await ctx.taper('youtube');
      const titres = await ctx.suggestions();
      assert.ok(titres.includes('Rechercher sur YouTube'), titres.join(' | '));
      await modal.keyboard.press('Tab');
      await jusqua(async () => (await portee()) === 'YouTube', 'pastille « YouTube »');
      assert.equal(await champ(), '');
      assert.equal(await modal.getAttribute('#cmd-input', 'placeholder'), 'Rechercher sur YouTube');
      assert.equal((await ctx.suggestions()).length, 0);
    });

    await t.verifier('la requête tapée donne une seule ligne, l’adresse de recherche du site', async () => {
      await ctx.taper('chats rigolos');
      assert.deepEqual(await ctx.suggestions(), ['chats rigolos']);
      assert.match((await sous())[0], /Rechercher sur YouTube/);
      assert.equal(await ctx.selection(), 0);
      const url = await ctx.principal(({ w }) => w.suggestLocal('chats rigolos', { site: 'youtube' })[0].url);
      assert.equal(url, 'https://www.youtube.com/results?search_query=chats%20rigolos');
      await modal.keyboard.press('Escape');
      await fermee();
    });

    await t.verifier('clic sur la ligne « Rechercher sur GitHub » : même portée, sans rien ouvrir', async () => {
      await ctx.nouvelOnglet();
      await ctx.taper('gh');
      await ctx.clic(modal, modal.locator('#cmd-list .cmd').filter({ hasText: 'Rechercher sur GitHub' }).first());
      await jusqua(async () => (await portee()) === 'GitHub', 'pastille « GitHub »');
      assert.equal(await ctx.commandeOuverte(), true);
      assert.equal(await modal.evaluate(() => document.activeElement.id), 'cmd-input');
      assert.equal((await ctx.etat()).aujourdhui.length, 2);
      await modal.keyboard.press('Backspace');
      await jusqua(async () => (await portee()) === null, 'portée quittée');
    });

    await t.verifier('domaine d’un site puis espace : portée du site ; un simple mot garde son espace', async () => {
      await ctx.taper('youtube.com');
      await modal.keyboard.press('Space');
      await jusqua(async () => (await portee()) === 'YouTube', 'pastille « YouTube »');
      await modal.keyboard.press('Backspace');
      await jusqua(async () => (await portee()) === null, 'portée quittée');
      await modal.keyboard.type('maps', { delay: 15 });
      await modal.keyboard.press('Space');
      await modal.keyboard.type('paris', { delay: 15 });
      await jusqua(async () => (await ctx.suggestions())[0] === 'maps paris', 'recherche ordinaire');
      assert.equal(await portee(), null);
      await modal.keyboard.press('Escape');
      await fermee();
    });

    // Une page visitée puis archivée : proposée depuis l'archive et l'historique.
    const pageC = await ctx.ouvrir('/c', 'Page C');
    assert.ok(pageC);
    await ctx.menu('Cmd+W');
    await jusqua(async () => (await ctx.etat()).archive.includes(ctx.url('/c')), 'page C archivée');
    await ctx.ouvrir('/d', 'Page D');
    await ctx.menu('Cmd+W');
    await jusqua(async () => (await ctx.etat()).archive.includes(ctx.url('/d')), 'page D archivée');

    const ligne = (titre) => modal.locator('#cmd-list .cmd').filter({ has: modal.locator('.title', { hasText: new RegExp('^' + titre + '$') }) }).filter({ has: modal.locator('.del') }).first();

    await t.verifier('survol d’une suggestion de l’archive : une croix apparaît ; les autres lignes n’en ont pas', async () => {
      await ctx.nouvelOnglet();
      await ctx.taper('Page');
      await jusqua(async () => (await ligne('Page C').count()) === 1, 'ligne « Page C » oubliable');
      const croix = ligne('Page C').locator('.del');
      assert.equal(await croix.isVisible(), false, 'croix cachée hors survol');
      await jusqua(async () => { await ligne('Page C').hover(); await ctx.sleep(40); return croix.isVisible(); }, 'croix au survol');
      assert.equal(await croix.getAttribute('title'), 'Oublier cette suggestion');
      const nb = await modal.locator('#cmd-list .cmd .del').count();
      const lignes = await modal.locator('#cmd-list .cmd').count();
      assert.ok(nb >= 2 && nb < lignes, `croix sur les seules lignes de l’historique et de l’archive (${nb}/${lignes})`);
    });

    await t.verifier('clic sur la croix : la suggestion disparaît, la page quitte l’archive et l’historique, la barre reste ouverte', async () => {
      await ctx.clic(modal, ligne('Page C').locator('.del'), { survol: ligne('Page C') });
      await jusqua(async () => !(await ctx.suggestions()).includes('Page C'), 'ligne « Page C » retirée');
      const reste = await ctx.principal(({ store }, url) => ({ archive: store.state.archive.some((a) => a.url === url), historique: !!store.state.history[url] }), ctx.url('/c'));
      assert.deepEqual(reste, { archive: false, historique: false });
      assert.equal(await ctx.commandeOuverte(), true);
      assert.equal(await champ(), 'Page');
      assert.equal(await modal.evaluate(() => document.activeElement.id), 'cmd-input', 'le clavier reste dans le champ');
      assert.ok((await ctx.suggestions()).includes('Page D'));
    });

    await t.verifier(`${mac ? '⌥⌘⌫' : 'Ctrl+Alt+⌫'} sur la ligne sélectionnée : même effet au clavier`, async () => {
      const titres = await ctx.suggestions();
      const i = titres.lastIndexOf('Page D');
      assert.ok(i > 0);
      for (let k = await ctx.selection(); k < i; k++) await modal.keyboard.press('ArrowDown');
      assert.equal(await ctx.selection(), i);
      await modal.keyboard.press(mac ? 'Alt+Meta+Backspace' : 'Control+Alt+Backspace');
      await jusqua(async () => !(await ctx.principal(({ store }, url) => !!store.state.history[url] || store.state.archive.some((a) => a.url === url), ctx.url('/d'))), 'page D oubliée');
      await jusqua(async () => (await modal.locator('#cmd-list .cmd .del').count()) === 0, 'plus aucune ligne oubliable');
      assert.equal(await champ(), 'Page', 'la saisie n’est pas effacée');
      // Sur une ligne qui ne s'oublie pas (la recherche) : sans effet.
      const avant = await ctx.suggestions();
      await modal.keyboard.press('ArrowUp');
      await modal.keyboard.press(mac ? 'Alt+Meta+Backspace' : 'Control+Alt+Backspace');
      await ctx.sleep(150);
      assert.deepEqual(await ctx.suggestions(), avant);
      await modal.keyboard.press('Escape');
      await fermee();
    });

    await t.verifier('copier l’adresse entière depuis la barre : le presse-papiers reçoit le protocole', async () => {
      const garde = await ctx.principal(({ electron }) => electron.clipboard.readText());
      try {
        await ctx.nouvelOnglet();
        await ctx.taper(hote + '/a');
        assert.equal(await champ(), hote + '/a');
        await modal.evaluate(() => document.getElementById('cmd-input').select());
        await modal.keyboard.press(mac ? 'Meta+C' : 'Control+C');
        const lu = () => ctx.principal(({ electron }) => electron.clipboard.readText());
        // Selon le système, la touche de copie envoyée à la page n'atteint pas l'éditeur : la commande d'édition la remplace.
        if ((await lu()) !== ctx.url('/a')) await modal.evaluate(() => document.execCommand('copy'));
        await jusqua(async () => (await lu()) === ctx.url('/a'), 'adresse complète dans le presse-papiers');
        // Une partie seulement de l'adresse : copiée telle quelle.
        await modal.evaluate(() => document.getElementById('cmd-input').setSelectionRange(0, 9));
        await modal.evaluate(() => document.execCommand('copy'));
        await jusqua(async () => (await lu()) === hote.slice(0, 9), 'partie copiée telle quelle');
        await modal.keyboard.press('Escape');
        await fermee();
      } finally {
        await ctx.principal(({ electron }, texte) => electron.clipboard.writeText(texte), garde);
      }
    });

    await t.verifier('⌘L puis Entrée sans rien changer : la page est actualisée, pas d’onglet de plus', async () => {
      await ctx.ouvrir('/compteur', 'Compteur 1');
      const avant = await ctx.etat();
      await ctx.menu('Cmd+L');
      await jusqua(ctx.commandeOuverte, 'ouverte par ⌘L');
      assert.equal(await champ(), ctx.url('/compteur'));
      await modal.keyboard.press('Enter');
      await fermee();
      await jusqua(async () => (await ctx.titres()).includes('Compteur 2'), 'page rechargée (« Compteur 2 »)');
      const apres = await ctx.etat();
      assert.equal(apres.actif, avant.actif);
      assert.equal(apres.aujourdhui.length, avant.aujourdhui.length);
      assert.equal(ctx.hits['/compteur'], 2);
    });

    await t.verifier('barre ouverte : un clic sur un onglet de la barre latérale la referme et active cet onglet', async () => {
      await ctx.nouvelOnglet();
      await ctx.taper('Page');
      const cible = await ctx.centre(ctx.ligne('Page A'));
      assert.notEqual((await ctx.etat()).actifUrl, ctx.url('/a'));
      await ctx.clic(modal, '#backdrop', { position: { x: Math.round(cible.x), y: Math.round(cible.y) } });
      await fermee();
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/a'), 'onglet A actif');
      assert.equal(await shell.locator('#sidebar .row.tab.active .title').textContent(), 'Page A');
    });

    await t.verifier('… et un clic sur un bouton de la barre latérale (« Actualiser ») l’atteint aussi', async () => {
      await ctx.menu('Cmd+L');
      await jusqua(ctx.commandeOuverte, 'ouverte par ⌘L');
      const b = await ctx.centre(shell.locator('#b-reload'));
      const n = ctx.hits['/a'];
      await ctx.clic(modal, '#backdrop', { position: { x: Math.round(b.x), y: Math.round(b.y) } });
      await fermee();
      await jusqua(() => ctx.hits['/a'] === n + 1, 'bouton « Actualiser » atteint à travers le fond');
      assert.equal((await ctx.etat()).actifUrl, ctx.url('/a'));
    });

    await t.verifier('nom d’un Espace : « Aller à l’Espace … », Entrée l’affiche', async () => {
      await ctx.principal(({ w, store }) => { w.data.spaces.push(store.makeSpace('Voyages', '🧳', '#f97316')); w.changed(); });
      await ctx.nouvelOnglet();
      await ctx.taper('voyag', false);
      const cible = modal.locator('#cmd-list .cmd').filter({ hasText: 'Aller à l’Espace 🧳 Voyages' }).first();
      await jusqua(async () => (await cible.count()) === 1, 'ligne « Aller à l’Espace »');
      assert.match(await cible.locator('.sub').textContent(), /Espace/);
      await ctx.clic(modal, cible);
      await fermee();
      await jusqua(async () => (await ctx.etat()).espace === 'Voyages', 'Espace « Voyages » affiché');
      await ctx.principal(({ w }) => w.switchSpace(w.data.spaces[0].id));
      await jusqua(async () => (await ctx.etat()).espace !== 'Voyages', 'retour au premier Espace');
    });

    await t.verifier('⌘N : la fenêtre neuve s’ouvre sur la barre de commande, champ prêt', async () => {
      await ctx.menu('Cmd+N');
      const autre = await jusqua(async () => {
        for (const p of ctx.pages()) {
          if (p === modal || !p.url().includes('overlay.html')) continue;
          if (await p.evaluate(() => { const c = document.getElementById('command'); return !!c && !c.hidden; }).catch(() => false)) return p;
        }
        return null;
      }, 'barre de commande de la fenêtre neuve');
      assert.equal(await autre.evaluate(() => document.activeElement && document.activeElement.id), 'cmd-input');
      assert.equal(await autre.inputValue('#cmd-input'), '');
      const etat = await ctx.principal(({ win }) => { const n = win.OrbeWindow.all[win.OrbeWindow.all.length - 1]; return { nb: win.OrbeWindow.all.length, mode: n.modalMode, actif: n.activeId }; });
      assert.deepEqual(etat, { nb: 2, mode: 'command', actif: null });
      await ctx.principal(({ win }) => { win.OrbeWindow.all[win.OrbeWindow.all.length - 1].win.close(); });
      await jusqua(async () => (await ctx.principal(({ win }) => win.OrbeWindow.all.length)) === 1, 'fenêtre neuve refermée');
    });

    await ctx.nouvelOnglet();
    await modal.keyboard.press('Tab');
    await ctx.capture('commande-actions', modal);
    await modal.keyboard.press('Escape');
  },
};
