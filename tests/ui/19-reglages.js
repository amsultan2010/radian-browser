// Fenêtre des réglages à volets, à la souris et au clavier réels : changer de
// volet, agir sur chaque sorte de réglage, enregistrer un raccourci avec de
// vraies touches, résoudre un conflit, rétablir ; import de signets.
// Arc's layout (docs/parity/settings-spec.md): six panes, a 684 × 650 window (701 wide when the pane scrolls), sheets.
const assert = require('node:assert/strict');
const path = require('path');

module.exports = {
  nom: 'Réglages',
  async test(ctx, t) {
    const { shell, jusqua, sleep } = ctx;
    const reglage = (cle) => ctx.principal(({ store }, k) => store.state.settings[k], cle);
    const taille = () => ctx.principal(({ req }) => { const w = req('panes.js').window; return w && !w.isDestroyed() ? w.getContentSize().join('x') : ''; });
    // Raccourci d'une commande dans le menu natif (« » : aucun).
    const auMenu = (nom) => ctx.principal(({ electron, req, store }, n) => {
      const label = store.t(req('commands.js').byName.get(n).label);
      const walk = (m) => { for (const it of m.items) { if (it.label === label) return it; if (it.submenu) { const f = walk(it.submenu); if (f) return f; } } return null; };
      const it = walk(electron.Menu.getApplicationMenu());
      return it ? it.accelerator || '' : null;
    }, nom);
    let r = null;
    const volet = () => r.evaluate(() => [...document.querySelectorAll('.pane')].filter((p) => !p.hidden).map((p) => p.id.replace('pane-', '')).join());
    const defile = () => r.evaluate(() => { const p = document.getElementById('panes'); return p.scrollHeight > p.clientHeight + 1; });
    // Arc's size: 684 × 650, or 701 × 650 when the pane scrolls; never a horizontal scroll.
    const aSaTaille = async () => (await taille()) === ((await defile()) ? '701x650' : '684x650') && (await r.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const feuille = async (nom) => { await r.click(`[data-sheet="${nom}"]`); await jusqua(() => r.evaluate((n) => document.getElementById('sheet-' + n).open, nom), 'feuille ' + nom); };
    const fermerFeuille = async (nom) => { await r.click(`#sheet-${nom} [data-close]`); await jusqua(() => r.evaluate((n) => !document.getElementById('sheet-' + n).open, nom), 'feuille refermée'); };
    const touche = (nom) => r.locator(`.key-row[data-name="${nom}"] .key-btn`);
    const texteTouche = async (nom) => (await touche(nom).textContent()).trim();
    const enregistrer = async (nom, combinaison) => {
      await touche(nom).scrollIntoViewIfNeeded();
      await touche(nom).click();
      await jusqua(async () => (await texteTouche(nom)) === 'Appuie sur les touches…', 'enregistrement en cours');
      await r.keyboard.press(combinaison);
    };

    await ctx.ouvrir('/a', 'Page A');

    await t.verifier('⌘, ouvre les réglages sur le volet Général, à la taille d’Arc, la fenêtre au nom du volet', async () => {
      await ctx.menu('Cmd+,');
      r = await ctx.attendrePage('settings.html');
      await jusqua(async () => (await volet()) === 'general', 'volet Général');
      assert.deepEqual(await r.locator('#tabs [role=tab]').allTextContents().then((x) => x.map((s) => s.trim())),
        ['Général', 'Profils', 'Liens', 'Raccourcis', 'Icône', 'Avancé']);
      await jusqua(aSaTaille, 'fenêtre à la taille d’Arc');
      assert.equal(await r.getAttribute('#tab-general', 'aria-selected'), 'true');
      assert.equal(await r.title(), 'Général');
      assert.equal((await r.textContent('#title')).trim(), 'Général');
    });

    await t.verifier('un clic sur chaque volet l’affiche sous son nom ; la fenêtre garde sa hauteur et s’élargit quand le volet défile', async () => {
      const tailles = {};
      for (const [id, nom] of [['profiles', 'Profils'], ['links', 'Liens'], ['shortcuts', 'Raccourcis'], ['icon', 'Icône'], ['advanced', 'Avancé'], ['general', 'Général']]) {
        await r.click('#tab-' + id);
        await jusqua(async () => (await volet()) === id, 'volet ' + id);
        await jusqua(aSaTaille, 'taille du volet ' + id);
        assert.equal(await r.title(), nom);
        tailles[id] = await taille();
        // Aucun élément masqué n'est dessiné.
        assert.deepEqual(await r.evaluate(() => [...document.querySelectorAll('[hidden]')].filter((el) => el.getClientRects().length).map((el) => el.id)), []);
      }
      assert.equal(tailles.advanced, '701x650', 'Avancé défile : ' + JSON.stringify(tailles));
      assert.equal(await ctx.principal(({ store }) => store.state.window.settingsPane), 'general');
    });

    await t.verifier('au clavier : les flèches changent de volet, Tab atteint le premier réglage avec un repère de focus', async () => {
      await r.focus('#tab-general');
      await r.keyboard.press('ArrowRight');
      await jusqua(async () => (await volet()) === 'profiles', 'volet suivant');
      await r.keyboard.press('ArrowLeft');
      await jusqua(async () => (await volet()) === 'general', 'retour');
      assert.equal(await r.evaluate(() => document.activeElement.id), 'tab-general');
      await r.keyboard.press('Tab');
      const focus = await r.evaluate(() => ({ volet: !!document.activeElement.closest('#pane-general'), contour: getComputedStyle(document.activeElement).outlineStyle }));
      assert.deepEqual(focus, { volet: true, contour: 'solid' });
    });

    await t.verifier('interrupteur : un clic l’enregistre aussitôt', async () => {
      await r.click('#tab-general');
      assert.equal(await reglage('warnOnQuit'), false);
      await r.click('#warnOnQuit');
      await jusqua(async () => (await reglage('warnOnQuit')) === true, 'réglage enregistré');
      assert.equal(await r.isChecked('#warnOnQuit'), true);
      await r.click('#warnOnQuit');
      await jusqua(async () => (await reglage('warnOnQuit')) === false, 'réglage rétabli');
    });

    await t.verifier('« Réglages des profils… » mène au volet Profils ; les réglages du profil choisi s’enregistrent pour lui et gardent le focus', async () => {
      await r.click('#toProfiles');
      await jusqua(async () => (await volet()) === 'profiles', 'volet Profils');
      assert.equal(await r.getAttribute('#profiles .prow[data-id="default"]', 'aria-selected'), 'true');
      assert.match(await r.textContent('#profiles .prow[data-id="default"] .count'), /^\d+ Espaces?$/);
      assert.equal(await r.isDisabled('#profile-remove'), true, 'le profil par défaut ne se supprime pas');
      const moteur = r.locator('#p-searchEngine');
      assert.equal(await moteur.inputValue(), 'google', 'l’ancien réglage général vaut pour le profil');
      await moteur.focus();
      await moteur.selectOption('duckduckgo');
      await jusqua(async () => { const p = await reglage('profileSettings'); return p.default && p.default.searchEngine === 'duckduckgo'; }, 'moteur du profil');
      assert.equal(await reglage('searchEngine'), 'google', 'le réglage général ne bouge pas');
      await jusqua(() => r.evaluate(() => document.activeElement && document.activeElement.id === 'p-searchEngine'), 'focus conservé');
      await moteur.selectOption('google');
      await r.selectOption('#p-archiveAfterHours', '24');
      await jusqua(async () => (await reglage('profileSettings')).default.archiveAfterHours === 24, 'délai du profil');
      await r.selectOption('#p-download', 'ask');
      await jusqua(async () => (await reglage('profileSettings')).default.downloadAsk === true, '« Toujours demander »');
      await r.selectOption('#p-download', '');
      await jusqua(async () => (await reglage('profileSettings')).default.downloadAsk === false, 'Téléchargements');
      await r.selectOption('#p-archiveAfterHours', '12');
      await jusqua(async () => (await reglage('profileSettings')).default.archiveAfterHours === 12, 'délai rétabli');
    });

    await t.verifier('champ et bouton : une règle d’aiguillage tapée au clavier s’ajoute, puis se supprime', async () => {
      await r.click('#tab-links');
      await feuille('atc');
      await r.click('#route-match');
      await r.keyboard.type('figma.com', { delay: 10 });
      await r.keyboard.press('Enter');
      await jusqua(async () => (await reglage('routes')).length === 1, 'règle enregistrée');
      assert.match(await r.locator('#routes .line').first().textContent(), /figma\.com/);
      await r.locator('#routes .line .btn').first().click();
      await jusqua(async () => (await reglage('routes')).length === 0, 'règle supprimée');
    });

    await t.verifier('règle d’aiguillage : elle doit nommer un site — un bout d’adresse est refusé, une adresse entière est ramenée à son site', async () => {
      await r.click('#route-match');
      await r.keyboard.type('?github.com', { delay: 10 });
      await r.keyboard.press('Enter');
      await jusqua(() => r.locator('#route-msg').isVisible(), 'refus expliqué');
      assert.equal((await reglage('routes')).length, 0, 'rien n’est enregistré');
      await r.locator('#route-match').fill('');
      await r.keyboard.type('https://www.GitHub.com/Orbe/', { delay: 10 });
      await r.keyboard.press('Enter');
      await jusqua(async () => (await reglage('routes')).length === 1, 'règle enregistrée');
      assert.equal((await reglage('routes'))[0].match, 'github.com/orbe');
      assert.equal(await r.locator('#route-msg').isVisible(), false);
      await r.locator('#routes .line .btn').first().click();
      await jusqua(async () => (await reglage('routes')).length === 0, 'règle supprimée');
    });

    await t.verifier('liens des autres applications : la destination par défaut propose chaque Espace ; l’interrupteur du volet Liens, c’est la petite fenêtre', async () => {
      const espace = (await ctx.etat()).espaces[0];
      await r.selectOption('#externalLinks', 'space:' + espace.id);
      await jusqua(async () => (await reglage('externalLinks')) === 'space:' + espace.id, 'Espace choisi');
      await fermerFeuille('atc');
      assert.equal(await r.isChecked('#externalLittle'), false);
      await r.click('#externalLittle');
      await jusqua(async () => (await reglage('externalLinks')) === 'little', 'petite fenêtre');
      await r.click('#externalLittle');
      await jusqua(async () => (await reglage('externalLinks')) === 'window', 'Espace le plus récent');
    });

    await t.verifier('le changement s’applique en direct : l’adresse de la barre d’outils suit « Afficher l’adresse entière »', async () => {
      await r.click('#tab-advanced');
      await ctx.menu('Shift+Cmd+D'); // the toolbar itself is a View menu item, as in Arc
      await jusqua(() => shell.evaluate(() => document.body.classList.contains('toolbar')), 'barre d’outils affichée');
      assert.equal(await shell.textContent('#tb-url-text'), ctx.url('/a'));
      await r.click('#showFullUrl');
      await jusqua(async () => (await shell.textContent('#tb-url-text')) === ctx.hote, 'seulement le site');
      await r.click('#showFullUrl');
      await ctx.menu('Shift+Cmd+D');
      await jusqua(() => shell.evaluate(() => !document.body.classList.contains('toolbar')), 'barre d’outils masquée');
    });

    await t.verifier('mode développeur : un site ajouté au clavier figure dans la liste, puis se retire', async () => {
      await r.click('#tab-advanced');
      await r.click('#dev-host');
      await r.keyboard.type('http://localhost:3000/chemin', { delay: 8 });
      await r.keyboard.press('Enter');
      await jusqua(async () => (await reglage('devSites')).join() === 'localhost:3000', 'site enregistré, réduit à son hôte');
      await jusqua(async () => (await r.locator('#dev-list .line .name').allTextContents()).join() === 'localhost:3000', 'site listé');
      await r.locator('#dev-list .line .btn').click();
      await jusqua(async () => (await reglage('devSites')).length === 0, 'site retiré');
    });

    await t.verifier('Avancé, veille des onglets : délai de veille et part de mémoire enregistrés, la part est donnée en Go', async () => {
      await r.click('#tab-advanced');
      await jusqua(async () => (await volet()) === 'advanced', 'volet Avancé');
      assert.equal(await r.inputValue('#sleepAfterHours'), '3');
      assert.equal(await r.inputValue('#memoryBudget'), '25');
      assert.match(await r.locator('#memoryBudget option[value="25"]').textContent(), /^25 % \(\d+(,\d)? Go\)$/);
      await r.selectOption('#sleepAfterHours', '6');
      await jusqua(async () => (await reglage('sleepAfterHours')) === 6, 'veille après six heures');
      await r.selectOption('#sleepAfterHours', '0');
      await jusqua(async () => (await reglage('sleepAfterHours')) === 0, 'jamais');
      await r.selectOption('#memoryBudget', '0');
      await jusqua(async () => (await reglage('memoryBudget')) === 0, 'sans limite');
      await r.selectOption('#memoryBudget', '35');
      await jusqua(async () => (await reglage('memoryBudget')) === 35, 'trente-cinq pour cent');
      await r.selectOption('#maxLiveTabs', '20');
      await jusqua(async () => (await reglage('maxLiveTabs')) === 20, 'vingt onglets vivants');
      await r.selectOption('#sleepAfterHours', '3');
      await r.selectOption('#memoryBudget', '25');
      await r.selectOption('#maxLiveTabs', '30');
      await jusqua(async () => (await reglage('memoryBudget')) === 25 && (await reglage('sleepAfterHours')) === 3 && (await reglage('maxLiveTabs')) === 30, 'réglages rétablis');
    });

    await t.verifier('sites qui restent éveillés : ajout au clavier sous sa forme normale, texte qui ne nomme pas un site refusé, retrait', async () => {
      await feuille('awake');
      await r.click('#never-sleep-site');
      await r.keyboard.type('pas un site !', { delay: 8 });
      await r.keyboard.press('Enter');
      await jusqua(() => r.locator('#never-sleep-msg').isVisible(), 'refus affiché');
      assert.deepEqual(await reglage('neverSleep'), []);
      await r.fill('#never-sleep-site', '');
      await r.keyboard.type('https://www.GitHub.com/Orbe/', { delay: 8 });
      await r.keyboard.press('Enter');
      await jusqua(async () => (await reglage('neverSleep')).join() === 'github.com/orbe', 'site enregistré sous sa forme normale');
      await jusqua(async () => (await r.locator('#never-sleep-list .line .name').allTextContents()).join() === 'github.com/orbe', 'site listé');
      assert.equal(await r.locator('#never-sleep-msg').isVisible(), false);
      assert.equal(await r.inputValue('#never-sleep-site'), '');
      await r.locator('#never-sleep-list .line .btn').click();
      await jusqua(async () => (await reglage('neverSleep')).length === 0, 'site retiré');
      await fermerFeuille('awake');
    });

    // --- Raccourcis ---------------------------------------------------------------
    await t.verifier('volet Raccourcis : toutes les commandes en une liste alphabétique, avec leur raccourci ; la recherche filtre', async () => {
      await r.click('#tab-shortcuts');
      await jusqua(async () => (await r.locator('#keys-list .key-row').count()) > 60, 'liste des commandes');
      assert.deepEqual(await r.locator('#keys-list h3').allTextContents(), ['Raccourcis par défaut']);
      const noms = await r.locator('#keys-list .key-row .label').allTextContents();
      assert.deepEqual(noms, [...noms].sort((a, b) => a.localeCompare(b, 'fr')), 'ordre alphabétique');
      assert.equal(await texteTouche('newTab'), '⌘T');
      assert.equal(await texteTouche('captureFull'), '---');
      assert.equal(await r.isDisabled('#keys-reset-all'), true);
      await r.click('#keys-search');
      await r.keyboard.type('Forcer l', { delay: 10 });
      await jusqua(async () => (await r.locator('.key-row .label').allTextContents()).join('|') === 'Forcer l’actualisation', 'filtre par nom');
      await r.fill('#keys-search', '');
      await r.keyboard.type('⇧⌘T');
      await jusqua(async () => (await r.locator('#keys-list .key-row').count()) === 1, 'filtre par raccourci');
      assert.equal(await r.locator('#keys-list .key-row').getAttribute('data-name'), 'reopen');
      await r.fill('#keys-search', 'zzzz');
      await jusqua(async () => (await r.locator('#keys-list .empty').count()) === 1, '« Aucun résultat »');
      await r.fill('#keys-search', '');
      await jusqua(async () => (await r.locator('#keys-list .key-row').count()) > 60, 'liste entière');
    });

    await t.verifier('enregistrer un raccourci avec de vraies touches : il s’affiche dans la liste et dans le menu', async () => {
      await enregistrer('reload', 'Control+Alt+KeyR');
      await jusqua(async () => (await texteTouche('reload')) === '⌃⌥R', 'nouveau raccourci affiché');
      await jusqua(async () => (await auMenu('reload')) === 'Ctrl+Alt+R', 'menu reconstruit');
      assert.equal((await reglage('shortcuts')).reload, 'Ctrl+Alt+R');
      assert.equal(await r.locator('.key-row[data-name="reload"]').evaluate((el) => el.classList.contains('changed')), true);
      assert.equal(await r.isDisabled('#keys-reset-all'), false);
      assert.equal(await r.evaluate(() => document.activeElement.closest('.key-row').dataset.name), 'reload', 'le focus reste sur la ligne');
    });

    await t.verifier('la barre de commande montre le nouveau raccourci', async () => {
      await ctx.nouvelOnglet();
      try {
        await ctx.modal.keyboard.type('Actualiser la page', { delay: 8 });
        await jusqua(async () => (await ctx.modal.locator('#cmd-list .cmd').allTextContents()).some((x) => x.includes('Actualiser la page') && x.includes('⌃⌥R')), 'raccourci dans les suggestions');
      } catch (err) {
        // Échec rare, jamais reproduit à la demande : ce que la barre montrait à cet instant.
        const vu = await ctx.modal.evaluate(() => ({ fermee: document.getElementById('command').hidden, saisie: document.getElementById('cmd-input').value, lignes: [...document.querySelectorAll('#cmd-list .cmd')].map((x) => x.textContent) })).catch(() => null);
        const su = await ctx.principal(({ w, req }) => ({ mode: w.modalMode, raccourci: req('shortcuts.js').keysOf('reload') })).catch(() => null);
        err.message += ' — barre : ' + JSON.stringify(vu) + ' ; processus principal : ' + JSON.stringify(su);
        throw err;
      } finally {
        // Barre laissée ouverte, elle ferait échouer toute la suite du groupe.
        if (await ctx.commandeOuverte()) await ctx.modal.keyboard.press('Escape');
      }
      await jusqua(async () => !(await ctx.commandeOuverte()), 'barre refermée');
    });

    await t.verifier('Échap annule l’enregistrement sans fermer la fenêtre ; une touche de modification seule ne suffit pas', async () => {
      await touche('find').scrollIntoViewIfNeeded();
      await touche('find').click();
      await jusqua(async () => (await texteTouche('find')) === 'Appuie sur les touches…', 'enregistrement');
      await r.keyboard.press('Shift');
      await r.keyboard.press('Meta');
      assert.equal(await texteTouche('find'), 'Appuie sur les touches…');
      await r.keyboard.press('Escape');
      await jusqua(async () => (await texteTouche('find')) === '⌘F', 'raccourci inchangé');
      assert.equal(r.isClosed(), false);
      assert.equal('find' in (await reglage('shortcuts')), false);
    });

    await t.verifier('combinaison réservée ou sans modificateur : refusée, avec l’explication sous la ligne', async () => {
      await enregistrer('find', 'Meta+KeyC');
      await jusqua(async () => (await r.locator('.key-msg.error').count()) === 1, 'message d’erreur');
      assert.match(await r.textContent('.key-msg.error'), /réservé/);
      assert.equal(await texteTouche('find'), '⌘F');
      await enregistrer('find', 'KeyK');
      await jusqua(async () => /touche de modification/.test(await r.textContent('.key-msg.error').catch(() => '')), 'modificateur manquant');
      assert.equal('find' in (await reglage('shortcuts')), false);
    });

    await t.verifier('conflit : le raccourci déjà pris est signalé ; « Annuler » ne change rien', async () => {
      await enregistrer('forceReload', 'Meta+KeyT');
      await jusqua(async () => (await r.locator('.key-msg.conflict').count()) === 1, 'conflit signalé');
      assert.match(await r.textContent('.key-msg.conflict .grow'), /⌘T est déjà le raccourci de « Nouvel onglet »/);
      assert.equal(await r.evaluate(() => document.activeElement.classList.contains('reassign')), true, 'le focus est sur « Réattribuer »');
      await r.click('.key-msg.conflict .cancel');
      await jusqua(async () => (await r.locator('.key-msg').count()) === 0, 'message retiré');
      assert.equal(await texteTouche('forceReload'), '⇧⌘R');
      assert.equal(await auMenu('newTab'), 'Cmd+T');
    });

    await t.verifier('conflit, puis « Réattribuer » : le raccourci change de commande, dans la liste et dans le menu', async () => {
      await enregistrer('forceReload', 'Meta+KeyT');
      await jusqua(async () => (await r.locator('.key-msg.conflict').count()) === 1, 'conflit signalé');
      await r.click('.key-msg.conflict .reassign');
      await jusqua(async () => (await texteTouche('forceReload')) === '⌘T', 'raccourci réattribué');
      assert.equal(await texteTouche('newTab'), '---');
      await jusqua(async () => (await auMenu('forceReload')) === 'Cmd+T' && (await auMenu('newTab')) === '', 'menu à jour');
      // La coque suit : l'invite « Appuie sur ⌘T… » ne cite plus un raccourci retiré.
      await jusqua(async () => !(await shell.evaluate(() => t('side.empty'))).includes('⌘T'), 'invite de la coque');
    });

    await t.verifier('× retire un raccourci ; Retour arrière pendant l’enregistrement aussi', async () => {
      await r.locator('.key-row[data-name="find"] .key-clear').click();
      await jusqua(async () => (await texteTouche('find')) === '---', 'raccourci retiré');
      await jusqua(async () => (await auMenu('find')) === '', 'menu sans raccourci');
      await enregistrer('findNext', 'Backspace');
      await jusqua(async () => (await texteTouche('findNext')) === '---', 'retiré au clavier');
      assert.equal((await reglage('shortcuts')).findNext, null);
    });

    await t.verifier('↺ rétablit le raccourci d’une commande ; « Rétablir tous les raccourcis » efface tous les changements', async () => {
      await r.locator('.key-row[data-name="find"] .key-reset').click();
      await jusqua(async () => (await texteTouche('find')) === '⌘F', 'raccourci par défaut');
      assert.equal('find' in (await reglage('shortcuts')), false);
      // Rétablir ⌘T pour « Nouvel onglet » alors qu'une autre commande l'a pris : même question.
      await r.locator('.key-row[data-name="newTab"] .key-reset').click();
      await jusqua(async () => (await r.locator('.key-msg.conflict').count()) === 1, 'conflit au rétablissement');
      await r.click('.key-msg.conflict .reassign');
      await jusqua(async () => (await texteTouche('newTab')) === '⌘T' && (await texteTouche('forceReload')) === '---', 'défaut repris');
      await r.click('#keys-reset-all');
      await jusqua(async () => Object.keys(await reglage('shortcuts')).length === 0, 'plus aucun changement');
      await jusqua(async () => (await texteTouche('reload')) === '⌘R' && (await texteTouche('forceReload')) === '⇧⌘R' && (await texteTouche('findNext')) === '⌘G', 'liste rétablie');
      await jusqua(async () => (await auMenu('reload')) === 'Cmd+R' && (await auMenu('newTab')) === 'Cmd+T', 'menu rétabli');
      assert.equal(await r.isDisabled('#keys-reset-all'), true);
      assert.equal(await r.locator('.key-row.changed').count(), 0);
    });

    await ctx.capture('reglages-raccourcis', r);

    // --- Liens : clics modifiés ------------------------------------------------------
    const pageL = await ctx.ouvrir('/liens', 'Page à liens');
    const boite = await pageL.locator('#dehors').boundingBox();
    // Orbe suit la touche ⌥ par les événements clavier de la fenêtre, que les
    // frappes de Playwright n'empruntent pas : ⌥ est donc envoyée par Electron
    // (comme une vraie touche), le clic et les autres touches par Playwright.
    // Avec ⌥, Orbe regarde aussi si une autre touche de modification est tenue (⌥ seule ouvre une
    // vue scindée, ⌥⌘ une petite fenêtre) : celle-ci lui est donc envoyée de la même façon.
    const alt = (type, avecMeta) => ctx.principal(({ w, win }, a) => {
      const wc = win.live.get(w.activeId).wc;
      const bas = a.type === 'keyDown';
      wc.sendInputEvent({ type: a.type, keyCode: 'Alt', modifiers: bas ? ['alt'] : [] });
      if (a.meta) wc.sendInputEvent({ type: a.type, keyCode: 'Meta', modifiers: bas ? ['alt', 'meta'] : [] });
    }, { type, meta: !!avecMeta });
    const clicModifie = async (touches) => {
      const autres = touches.filter((k) => k !== 'Alt');
      if (touches.includes('Alt')) { await alt('keyDown', touches.includes('Meta')); await sleep(80); }
      for (const k of autres) await pageL.keyboard.down(k);
      await pageL.mouse.click(boite.x + boite.width / 2, boite.y + boite.height / 2);
      for (const k of autres.reverse()) await pageL.keyboard.up(k);
      if (touches.includes('Alt')) await alt('keyUp', touches.includes('Meta'));
    };
    const apercu = () => ctx.principal(({ w }) => (w.peekState ? w.peekState.url || true : false));
    // La page à liens redevient l'onglet affiché (un clic n'atteint qu'une page visible).
    const surLaPage = async () => {
      await ctx.principal(({ w }, url) => { const id = Object.keys(w.data.tabs).find((x) => w.data.tabs[x].url === url); if (id && w.activeId !== id) w.activate(id); }, ctx.url('/liens'));
      await jusqua(async () => (await ctx.etat()).actifUrl === ctx.url('/liens'), 'page à liens affichée');
      await sleep(150);
    };
    const petites = () => ctx.principal(({ req }) => req('little.js').LittleWindow.all.map((l) => l.url));

    await t.verifier('⇧-clic sur un lien : aperçu, sauf si le réglage est coupé (le lien s’ouvre alors en onglet)', async () => {
      await clicModifie(['Shift']);
      await jusqua(apercu, 'aperçu ouvert');
      await ctx.principal(({ w }) => w.dismissPeek());
      await jusqua(async () => !(await apercu()), 'aperçu refermé');
      await r.click('#tab-links');
      await r.click('#peekShift');
      await jusqua(async () => (await reglage('peekShift')) === false, 'réglage coupé');
      const avant = (await ctx.titres()).length;
      await clicModifie(['Shift']);
      await jusqua(async () => (await ctx.titres()).length === avant + 1, 'nouvel onglet');
      assert.equal(await apercu(), false);
      await r.click('#peekShift');
      await jusqua(async () => (await reglage('peekShift')) === true, 'réglage rétabli');
      await ctx.principal(({ w }) => { w.close(w.activeId); });
      await surLaPage();
    });

    await t.verifier('⌥⌘-clic sur un lien : petite fenêtre, sauf si le réglage est coupé (onglet en arrière-plan)', async () => {
      await surLaPage();
      await clicModifie(['Alt', 'Meta']);
      await jusqua(async () => (await petites()).length === 1, 'petite fenêtre ouverte');
      assert.match((await petites())[0], /\/b$/);
      await ctx.principal(({ req }) => { for (const l of req('little.js').LittleWindow.all) l.win.close(); });
      await jusqua(async () => (await petites()).length === 0, 'petite fenêtre fermée');
      await r.click('#littleAltClick');
      await jusqua(async () => (await reglage('littleAltClick')) === false, 'réglage coupé');
      const avant = (await ctx.titres()).length;
      await clicModifie(['Alt', 'Meta']);
      await jusqua(async () => (await ctx.titres()).length === avant + 1, 'onglet en arrière-plan');
      assert.equal((await petites()).length, 0);
      await r.click('#littleAltClick');
    });

    await t.verifier('onglet épinglé : un lien vers un autre site s’ouvre en aperçu, ou dans l’onglet si le réglage est coupé', async () => {
      await surLaPage();
      await ctx.principal(({ w }) => w.togglePin(w.activeId));
      await jusqua(async () => (await ctx.titres('#pinned')).includes('Page à liens'), 'onglet épinglé');
      await sleep(150);
      await pageL.mouse.click(boite.x + boite.width / 2, boite.y + boite.height / 2);
      await jusqua(apercu, 'aperçu ouvert');
      await ctx.principal(({ w }) => w.dismissPeek());
      await jusqua(async () => !(await apercu()), 'aperçu refermé');
      await sleep(300);
      await r.click('#peekLinks');
      await jusqua(async () => (await reglage('peekLinks')) === false, 'réglage coupé');
      await pageL.mouse.click(boite.x + boite.width / 2, boite.y + boite.height / 2);
      await jusqua(async () => /^http:\/\/localhost:\d+\/b$/.test((await ctx.etat()).actifUrl), 'le lien est suivi dans l’onglet');
      assert.equal(await apercu(), false);
      await r.click('#peekLinks');
      await jusqua(async () => (await reglage('peekLinks')) === true, 'réglage rétabli');
    });

    // --- Import ---------------------------------------------------------------------
    await t.verifier('Avancé → « Importer depuis un autre navigateur… » : dit ce que chaque import apporte ; les signets d’un fichier HTML arrivent dans un nouvel Espace', async () => {
      await r.click('#tab-advanced');
      await jusqua(async () => (await volet()) === 'advanced', 'volet Avancé');
      await feuille('import');
      const texte = await r.textContent('#sheet-import');
      for (const mot of ['Depuis Arc', 'Signets de Chrome, Safari, Firefox', 'onglets épinglés', 'Mots de passe', 'CSV', 'Depuis un navigateur installé', 'l’historique ne sont pas importés']) assert.ok(texte.includes(mot), mot);
      // Les dialogues du système ne se pilotent pas : ils sont remplacés le temps de l'import.
      await ctx.principal(({ electron }, fichier) => {
        electron.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fichier] });
        electron.dialog.showMessageBox = async () => ({ response: 0 });
      }, path.join(ctx.root, 'tests', 'fixtures', 'signets-firefox.html'));
      const avant = (await ctx.etat()).espaces.length;
      await r.click('#import-bookmarks');
      await jusqua(async () => (await ctx.etat()).espaces.length === avant + 1, 'Espace créé');
      const e = await ctx.etat();
      assert.equal(e.espace, 'Signets importés');
      assert.deepEqual(e.epingles.map((n) => n.dossier || n.title), ['Débuter avec Firefox', 'Framasoft', 'Mozilla Firefox', 'Qwant', 'Autres marque-pages']);
      assert.deepEqual(e.epingles[2].enfants.map((n) => n.title), ['Obtenir de l’aide', 'À propos']);
      await jusqua(async () => (await r.textContent('#import-msg')) === '6 signets importés', 'compte rendu dans le volet');
      await jusqua(async () => (await ctx.titres('#pinned')).includes('Framasoft'), 'signets dans la barre latérale');
      await fermerFeuille('import');
    });

    await t.verifier('anglais : volets et réglages traduits ; retour au français', async () => {
      await r.click('#tab-general');
      await r.selectOption('#lang', 'en');
      await jusqua(async () => (await r.locator('#tabs [role=tab]').allTextContents()).map((s) => s.trim()).join() === 'General,Profiles,Links,Shortcuts,Icon,Advanced', 'volets en anglais');
      assert.equal(await r.title(), 'General');
      assert.equal((await r.textContent('#pane-general .card .line .grow')).trim(), 'Check for updates automatically');
      // La barre des volets tient dans la fenêtre dans les deux langues, et la part de mémoire se dit en GB.
      assert.equal(await r.evaluate(() => document.getElementById('tabs').scrollWidth <= document.getElementById('tabs').clientWidth), true);
      assert.match(await r.locator('#memoryBudget option[value="25"]').textContent(), /^25% \(\d+(\.\d)? GB\)$/);
      await r.click('#tab-shortcuts');
      await jusqua(async () => (await r.locator('#keys-list h3').allTextContents())[0] === 'Default Shortcuts', 'raccourcis en anglais');
      await r.click('#tab-general');
      await r.selectOption('#lang', 'fr');
      await jusqua(async () => (await r.textContent('#tab-general')).trim() === 'Général', 'retour au français');
    });

    await ctx.capture('reglages-general', r);

    await t.verifier('la fenêtre se rouvre sur le dernier volet ; Échap la ferme', async () => {
      await r.click('#tab-links');
      await jusqua(async () => (await volet()) === 'links', 'volet Liens');
      await r.keyboard.press('Escape').catch(() => {}); // la fenêtre se ferme pendant la frappe
      await jusqua(() => r.isClosed(), 'fenêtre fermée par Échap');
      await ctx.menu('Cmd+,');
      r = await jusqua(() => ctx.pages().find((p) => p.url().includes('settings.html')), 'fenêtre rouverte', 8000);
      await jusqua(async () => (await volet()) === 'links', 'volet mémorisé');
      await jusqua(aSaTaille, 'taille du volet');
      await sleep(50);
      await r.keyboard.press('Escape').catch(() => {});
      await jusqua(() => r.isClosed(), 'fenêtre fermée');
    });
  },
};
