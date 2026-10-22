// Espaces : création, passage de l'un à l'autre par les pastilles du bas et
// par balayage horizontal (molette) sur la barre latérale.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Espaces',
  async test(ctx, t) {
    const { shell, jusqua } = ctx;
    const pastilles = shell.locator('#spaces .sp');
    const nom = () => shell.textContent('#space-name');
    const active = () => pastilles.evaluateAll((els) => els.findIndex((el) => el.classList.contains('active')));
    // Balayage horizontal : plusieurs crans de molette, comme un geste à deux doigts.
    const balayer = async (dx, dy = 0) => {
      const c = await ctx.centre(shell.locator('#scroll'));
      await shell.mouse.move(c.x, c.y);
      for (let i = 0; i < 4; i++) { await shell.mouse.wheel(dx, dy); await ctx.sleep(16); }
    };
    // Balayage lent : petits crans espacés, les doigts restent posés.
    const glisser = async (dx, crans) => {
      const c = await ctx.centre(shell.locator('#scroll'));
      await shell.mouse.move(c.x, c.y);
      for (let i = 0; i < crans; i++) { await shell.mouse.wheel(dx, 0); await ctx.sleep(25); }
    };
    // Où en sont les deux listes (celle de l'Espace courant et l'image de l'autre) et la teinte.
    const listes = () => shell.evaluate(() => {
      const x = (el) => new DOMMatrix(getComputedStyle(el).transform).m41;
      const g = document.querySelector('#pager .ghost');
      /* global slide */
      return {
        phase: slide ? slide.phase : null,
        courante: x(document.getElementById('scroll')),
        autre: g ? x(g) : null,
        autreNom: g ? g.querySelector('.g-name').textContent : null,
        autreTitres: g ? [...g.querySelectorAll('.row.tab .title')].map((el) => el.textContent) : [],
        largeur: document.getElementById('pager').clientWidth,
        teinte: Number(getComputedStyle(document.getElementById('tint')).opacity),
      };
    });
    const repos = () => jusqua(async () => { const l = await listes(); return !l.phase && l.autre === null && l.courante === 0 && l.teinte === 0; }, 'listes au repos');
    const anime = !(await shell.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
    const animer = (titre, fn) => (anime ? t.verifier(titre, fn) : t.ignorer(titre, '« Réduire les animations » est actif'));

    await ctx.ouvrir('/a', 'Page A');

    await t.verifier('avec un seul Espace, aucune pastille en bas', async () => {
      assert.equal(await pastilles.count(), 0);
      assert.equal(await nom(), 'Personnel');
    });

    await t.verifier('« Nouvel Espace » (élément de menu) : le panneau de création s’ouvre, rien n’est créé ; nom tapé puis Entrée : nouvel Espace affiché, vide', async () => {
      await ctx.menu('spaces.new');
      await ctx.panneauEspace();
      assert.equal(await ctx.modal.getAttribute('#space-input', 'placeholder'), 'Nouvel Espace');
      assert.equal((await ctx.etat()).espaces.length, 1, 'rien n’est créé avant « Créer »');
      await ctx.creerEspace('Projets');
      await jusqua(async () => (await nom()) === 'Projets', 'nom affiché');
      assert.equal(await shell.locator('#space-name input.rename').count(), 0, 'aucun champ de nom dans la barre');
      assert.deepEqual(await ctx.titres(), []);
      assert.equal(await shell.evaluate(() => document.body.classList.contains('no-tab')), true);
      assert.deepEqual((await ctx.etat()).espaces.map((s) => s.nom), ['Personnel', 'Projets']);
    });

    await t.verifier('deux pastilles en bas, la seconde active, chacune avec son nom en infobulle', async () => {
      assert.equal(await pastilles.count(), 2);
      assert.equal(await active(), 1);
      assert.deepEqual(await pastilles.evaluateAll((els) => els.map((el) => el.title)), ['Personnel', 'Projets']);
    });

    await t.verifier('la couleur d’accent change avec l’Espace', async () => {
      const c2 = await shell.evaluate(() => document.body.style.getPropertyValue('--accent'));
      assert.match(c2, /^#[0-9a-f]{6}$/i);
      assert.notEqual(c2.toLowerCase(), '#7c6cf0');
    });

    await ctx.ouvrir('/b', 'Page B');

    await t.verifier('clic sur la première pastille : retour au premier Espace et à son onglet', async () => {
      await ctx.clic(shell, pastilles.nth(0));
      await jusqua(async () => (await nom()) === 'Personnel', 'Espace Personnel');
      assert.deepEqual(await ctx.titres(), ['Page A']);
      assert.equal(await active(), 0);
      const e = await ctx.etat();
      assert.equal(e.actifUrl, ctx.url('/a'));
      assert.equal(await ctx.vueAu(e.vuePage.x + 40, e.vuePage.y + 40), ctx.url('/a'), 'la page A est affichée');
      assert.equal(await shell.evaluate(() => document.body.style.getPropertyValue('--accent').toLowerCase()), '#7c6cf0');
    });

    await t.verifier('clic sur la seconde pastille : second Espace et son onglet', async () => {
      await ctx.clic(shell, pastilles.nth(1));
      await jusqua(async () => (await nom()) === 'Projets', 'Espace Projets');
      assert.deepEqual(await ctx.titres(), ['Page B']);
      const e = await ctx.etat();
      assert.equal(await ctx.vueAu(e.vuePage.x + 40, e.vuePage.y + 40), ctx.url('/b'), 'la page B est affichée');
    });

    await animer('clic sur une pastille : les deux listes glissent côte à côte, dans le sens du changement', async () => {
      await repos();
      // Vers l'Espace précédent : sa liste entre par la gauche, la liste courante sort par la droite.
      await ctx.clic(shell, pastilles.nth(0));
      const vers = await jusqua(async () => { const l = await listes(); return l.autre !== null ? l : null; }, 'glissement en cours');
      assert.equal(vers.autreNom, 'Personnel');
      assert.deepEqual(vers.autreTitres, ['Page A']);
      assert.ok(vers.autre <= 0 && vers.courante >= 0, JSON.stringify(vers));
      assert.ok(Math.abs((vers.courante - vers.autre) - vers.largeur) < 1.5, 'les deux listes se touchent : ' + JSON.stringify(vers));
      assert.equal(await active(), 0, 'la pastille change dès le départ');
      await jusqua(async () => (await nom()) === 'Personnel', 'Espace Personnel');
      await repos();
      assert.deepEqual(await ctx.titres(), ['Page A']);
      // Vers l'Espace suivant : l'inverse.
      await ctx.clic(shell, pastilles.nth(1));
      const retour = await jusqua(async () => { const l = await listes(); return l.autre !== null ? l : null; }, 'glissement en cours');
      assert.equal(retour.autreNom, 'Projets');
      assert.ok(retour.autre >= 0 && retour.courante <= 0, JSON.stringify(retour));
      await jusqua(async () => (await nom()) === 'Projets', 'Espace Projets');
      await repos();
      assert.deepEqual(await ctx.titres(), ['Page B']);
    });

    await animer('balayage lent : la liste voisine suit les doigts, la teinte se fond ; doigts levés avant le seuil, tout revient', async () => {
      // Le pilotage peut prendre du retard sur une machine chargée (les doigts
      // sont alors « levés » trop tôt) : on recommence le geste.
      let l = null;
      await jusqua(async () => {
        await repos();
        await glisser(-8, 4);
        l = await listes();
        if (l.phase === 'drag' && l.courante === 32) return true;
        await ctx.sleep(500);
        return false;
      }, 'balayage lent suivi', 15000);
      assert.equal(l.autreNom, 'Personnel');
      assert.deepEqual(l.autreTitres, ['Page A']);
      assert.equal(l.autre, 32 - l.largeur, 'la liste voisine est collée à la liste courante');
      assert.ok(Math.abs(l.teinte - 32 / l.largeur) < 0.02, 'teinte au même pas : ' + l.teinte);
      await repos();
      assert.equal(await nom(), 'Projets');
      assert.equal(await active(), 1);
      assert.deepEqual(await ctx.titres(), ['Page B']);
    });

    await animer('balayage lent au bout de la rangée : la liste résiste (élastique) puis revient', async () => {
      let l = null;
      await jusqua(async () => {
        await repos();
        await glisser(10, 6);
        l = await listes();
        if (l.phase === 'drag') return true;
        await ctx.sleep(500);
        return false;
      }, 'balayage au bout de la rangée', 15000);
      assert.equal(l.autre, null, 'aucune liste à côté');
      assert.ok(l.courante < -5 && l.courante > -45, 'déplacement amorti : ' + l.courante + ' px pour 60 px de geste');
      assert.equal(l.teinte, 0);
      await repos();
      assert.equal(await nom(), 'Projets');
    });

    await animer('balayage lent poursuivi au-delà du seuil : l’Espace change, une seule fois', async () => {
      await repos();
      await jusqua(async () => {
        await glisser(-10, 14);
        if ((await ctx.etat()).espace === 'Personnel') return true;
        await ctx.sleep(500);
        return false;
      }, 'changement par balayage lent', 15000);
      await jusqua(async () => (await nom()) === 'Personnel', 'Espace Personnel');
      await repos();
      assert.equal(await active(), 0);
      assert.deepEqual(await ctx.titres(), ['Page A']);
      await ctx.sleep(400);
      await ctx.clic(shell, pastilles.nth(1));
      await jusqua(async () => (await nom()) === 'Projets', 'Espace Projets');
      await repos();
      await ctx.sleep(300);
    });

    await t.verifier('balayage horizontal vers la gauche sur la barre latérale : Espace précédent', async () => {
      await balayer(-40);
      await jusqua(async () => (await nom()) === 'Personnel', 'Espace Personnel');
      assert.deepEqual(await ctx.titres(), ['Page A']);
    });

    await t.verifier('un seul changement par geste, même si le balayage continue', async () => {
      await ctx.sleep(400);
      const c = await ctx.centre(shell.locator('#scroll'));
      await shell.mouse.move(c.x, c.y);
      for (let i = 0; i < 12; i++) { await shell.mouse.wheel(40, 0); await ctx.sleep(16); }
      await jusqua(async () => (await nom()) === 'Projets', 'Espace Projets');
      await ctx.sleep(300);
      assert.equal(await nom(), 'Projets');
      assert.equal(await active(), 1);
    });

    await t.verifier('balayage au-delà du dernier Espace : rien ne change', async () => {
      await ctx.sleep(400);
      await balayer(40);
      await ctx.sleep(300);
      assert.equal(await nom(), 'Projets');
    });

    await t.verifier('défilement vertical : ne change pas d’Espace', async () => {
      await ctx.sleep(400);
      await balayer(0, 60);
      await balayer(10, 60);
      await ctx.sleep(300);
      assert.equal(await nom(), 'Projets');
    });

    await animer('tirer franchement au-delà du dernier Espace : un « + » sort du bord et grandit ; au bout, le panneau de création s’ouvre ; Entrée crée l’Espace — un seul', async () => {
      await ctx.sleep(400);
      await repos();
      const plus = () => shell.evaluate(() => { const el = document.querySelector('#pager .pager-plus'); if (!el) return null; const cs = getComputedStyle(el); const m = new DOMMatrix(cs.transform); return { p: Number(el.dataset.p), opacite: Number(cs.opacity), x: m.m41, echelle: Math.round(m.a * 100) / 100, pos: cs.position }; });
      const c = await ctx.centre(shell.locator('#scroll'));
      await shell.mouse.move(c.x, c.y);
      // Début du geste : le « + » paraît, petit et pâle, et grandit à chaque pas.
      const vus = [];
      for (let i = 0; i < 3; i++) { await shell.mouse.wheel(30, 0); await ctx.sleep(16); vus.push(await plus()); }
      assert.ok(vus.every((v) => v && v.pos === 'absolute'), 'pastille présente dès le premier pas : ' + JSON.stringify(vus));
      assert.ok(vus[2].p > vus[1].p && vus[1].p > vus[0].p && vus[2].p < 1 && vus[2].echelle > vus[0].echelle && vus[2].x < vus[0].x && vus[2].opacite > vus[0].opacite, 'elle avance et grandit avec le geste : ' + JSON.stringify(vus));
      assert.equal((await ctx.etat()).espaces.length, 2, 'rien n’est créé avant le bout');
      // Le geste continue, franc : la pastille s'arme (couleur de l'Espace) ; rien n'est créé pendant le mouvement.
      const armee = () => shell.evaluate(() => { const el = document.querySelector('#pager .pager-plus'); return !!el && el.classList.contains('armed'); });
      let vueArmee = false;
      for (let i = 0; i < 14; i++) { await shell.mouse.wheel(60, 0); await ctx.sleep(16); vueArmee = vueArmee || await armee(); }
      assert.ok(vueArmee, 'pastille armée au bout du geste');
      assert.equal((await ctx.etat()).espaces.length, 2, 'rien n’est créé tant que les doigts bougent');
      // Doigts posés (plus aucun événement) : l'anneau se referme, puis le nouvel Espace — un seul.
      await jusqua(() => shell.evaluate(() => !!document.querySelector('#pager .pager-plus.hold')), 'anneau du compte à rebours');
      // Le geste ouvre le panneau de création — rien n'est créé avant Entrée (ou « Créer »).
      await ctx.panneauEspace();
      await ctx.sleep(300);
      assert.equal((await ctx.etat()).espaces.length, 2, 'le geste seul ne crée rien');
      await ctx.creerEspace('');
      await jusqua(async () => (await ctx.etat()).espaces.length === 3, 'nouvel Espace créé');
      await ctx.sleep(300);
      const e = await ctx.etat();
      assert.equal(e.espaces.length, 3, 'un seul Espace créé');
      assert.equal(e.espaces[2].nom, e.espace, 'il est affiché, à la suite du dernier');
      assert.equal(await shell.locator('#pager .pager-plus').count(), 0, 'la pastille est retirée');
      // Le message propose « Annuler » : un vrai clic dessus retire l'Espace créé.
      const toast = await ctx.attendrePage('overlay.html#toast');
      await jusqua(async () => (await toast.locator('#toast .act').count()) === 1 && (await toast.locator('#toast .act').textContent()) === (await ctx.texte('edit.undo')), 'bouton « Annuler » du message');
      assert.ok((await toast.locator('#toast').textContent()).startsWith(await ctx.texte('toast.spaceCreated')));
      await ctx.clic(toast, '#toast .act');
      await jusqua(async () => (await ctx.etat()).espaces.length === 2 && (await pastilles.count()) === 2, 'Espace créé retiré par « Annuler »');
      // La barre revient à l'Espace d'avant en glissant ; le champ de nom part avec l'Espace retiré.
      await repos();
      await jusqua(async () => (await shell.locator('#space-name input.rename').count()) === 0 && (await nom()) === 'Projets', 'Espace d’avant affiché, sans champ de nom');
      await ctx.menu('Ctrl+2');
      await jusqua(async () => (await nom()) === 'Projets', 'Espace Projets');
      await repos();
    });

    await animer('balayage vif au bout de la rangée, doigts levés en plein élan : la pastille se désarme avec l’inertie, aucun Espace n’est créé', async () => {
      await ctx.sleep(400);
      await repos();
      const c = await ctx.centre(shell.locator('#scroll'));
      await shell.mouse.move(c.x, c.y);
      let arme = false;
      for (let v = 110; v >= 1; v *= 0.9) { await shell.mouse.wheel(Math.round(v), 0); await ctx.sleep(12); arme = arme || await shell.evaluate(() => !!document.querySelector('#pager .pager-plus.armed')); }
      assert.ok(arme, 'le geste était assez fort pour armer la pastille');
      await repos();
      await ctx.sleep(700); // plus long que le compte à rebours : rien ne vient
      assert.equal((await ctx.etat()).espaces.length, 2, 'aucun Espace créé');
      assert.equal(await nom(), 'Projets');
    });

    await t.verifier('Espace vide : « Supprimer l’Espace » le retire sans poser de question ; ⌘Z le rétablit', async () => {
      await ctx.principal(({ w }) => { w.newSpace(); });
      await jusqua(async () => (await ctx.etat()).espaces.length === 3, 'Espace vide créé');
      await jusqua(() => shell.locator('#space-name input.rename').count(), 'champ de nom');
      await shell.keyboard.press('Escape');
      await ctx.menu('spaces.delete');
      await jusqua(async () => (await ctx.etat()).espaces.length === 2 && (await pastilles.count()) === 2, 'Espace vide supprimé sans question');
      await ctx.menu('Cmd+Z');
      await jusqua(async () => (await ctx.etat()).espaces.length === 3, 'Espace rétabli');
      await ctx.principal(({ w }) => { const s = w.data.spaces[w.data.spaces.length - 1]; w.removeSpace(s.id); w.undoStack.length = 0; });
      await jusqua(async () => (await ctx.etat()).espaces.length === 2 && (await pastilles.count()) === 2, 'remise en place');
      await ctx.menu('Ctrl+2');
      await jusqua(async () => (await nom()) === 'Projets', 'Espace Projets');
      await repos();
    });

    await t.verifier('⌥⌘← et ⌃1/⌃2 (éléments de menu) changent d’Espace', async () => {
      await ctx.menu('Alt+Cmd+Left');
      await jusqua(async () => (await nom()) === 'Personnel', 'Espace Personnel');
      await ctx.menu('Ctrl+2');
      await jusqua(async () => (await nom()) === 'Projets', 'Espace Projets');
      await ctx.menu('Ctrl+1');
      await jusqua(async () => (await nom()) === 'Personnel', 'Espace Personnel');
    });

    await ctx.capture('espaces');

    // Beaucoup d'Espaces : toutes les pastilles doivent rester atteignables.
    for (let i = 3; i <= 9; i++) {
      await ctx.menu('spaces.new');
      await ctx.creerEspace('Espace ' + i);
      await jusqua(async () => (await nom()) === 'Espace ' + i, 'Espace ' + i);
    }
    await ctx.capture('espaces-9');

    await t.verifier('avec 9 Espaces, toutes les pastilles restent visibles dans la rangée du bas', async () => {
      assert.equal(await pastilles.count(), 9);
      const zone = await shell.locator('#spaces').boundingBox();
      const boites = await pastilles.evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return [r.left, r.right]; }));
      const coupees = boites.filter(([l, r]) => l < zone.x - 0.5 || r > zone.x + zone.width + 0.5).length;
      assert.equal(coupees, 0, `${coupees} pastille(s) sur 9 sont coupées par #spaces (overflow: hidden) et impossibles à cliquer`);
    });

    await t.verifier('avec 9 Espaces, un clic sur la première pastille y mène', async () => {
      await ctx.clic(shell, pastilles.nth(0));
      await jusqua(async () => (await nom()) === 'Personnel', 'Espace Personnel');
      assert.equal(await active(), 0);
      // Un nouvel Espace se place après celui d'où on le crée : le dernier de la
      // rangée n'est pas forcément le dernier créé.
      const dernier = (await ctx.etat()).espaces[8].nom;
      await ctx.clic(shell, pastilles.nth(8));
      await jusqua(async () => (await nom()) === dernier, 'dernier Espace de la rangée');
      assert.equal(await active(), 8);
    });

    // --- Gestes enchaînés (ORB-003) -------------------------------------------------
    // Un vrai balayage : les doigts accélèrent puis se lèvent, et macOS continue d'envoyer
    // l'inertie, qui décroît sans jamais se taire pendant près d'une seconde. Tout est envoyé
    // sans pause de plus de 12 ms : aucun silence ne peut servir de séparation entre deux gestes.
    const DOIGTS = [4, 10, 20, 35, 45, 45, 40, 30];
    const envoyer = async (dx) => { await shell.mouse.wheel(dx, 0); await ctx.sleep(12); };
    const doigts = async (sens) => { for (const v of DOIGTS) await envoyer(sens * v); };
    const inertie = async (sens, depuis, jusque) => { for (let v = depuis; v >= jusque; v *= 0.9) await envoyer(sens * Math.round(v)); };
    const surLaBarre = async () => { const c = await ctx.centre(shell.locator('#scroll')); await shell.mouse.move(c.x, c.y); };

    await animer('trois balayages enchaînés sans s’arrêter, chacun lancé dans l’inertie du précédent : trois Espaces de suite', async () => {
      await repos();
      await surLaBarre();
      for (let i = 0; i < 3; i++) { await doigts(-1); await inertie(-1, 27, 5); }
      await inertie(-1, 5, 1);
      await jusqua(async () => (await active()) === 5, 'trois Espaces plus loin');
      await repos();
      assert.equal(await active(), 5);
    });

    await animer('… et retour dans l’autre sens, sans pause non plus', async () => {
      await surLaBarre();
      for (let i = 0; i < 2; i++) { await doigts(1); await inertie(1, 27, 5); }
      await inertie(1, 5, 1);
      await jusqua(async () => (await active()) === 7, 'deux Espaces en arrière');
      await repos();
      assert.equal(await active(), 7);
    });

    await animer('un seul balayage, même vif et suivi de toute son inertie : un seul Espace', async () => {
      await ctx.sleep(300);
      await surLaBarre();
      await doigts(-1);
      await inertie(-1, 27, 1);
      await repos();
      assert.equal(await active(), 6);
      // Le geste accélère encore après avoir changé d'Espace, puis s'éteint : toujours un seul.
      await ctx.sleep(300);
      for (const v of [20, 40, 60, 80, 100, 90]) await envoyer(-v);
      await inertie(-1, 80, 1);
      await repos();
      assert.equal(await active(), 5);
    });
  },
};
