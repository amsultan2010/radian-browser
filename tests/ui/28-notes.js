// Notes mises en forme : titres, gras, italique, listes, cases à cocher et liens,
// au vrai clavier et à la vraie souris. Ce qui est enregistré est un modèle de
// blocs ; un collage de HTML n'apporte que son texte.
const assert = require('node:assert/strict');

module.exports = {
  nom: 'Notes',
  async test(ctx, t) {
    const { jusqua } = ctx;
    await ctx.menu('Ctrl+Shift+N');
    const page = await ctx.attendrePage('notes.html', 10000);
    await jusqua(() => page.evaluate(() => document.querySelectorAll('#items .note').length === 1 && document.getElementById('editor').contentEditable === 'true'), 'note prête');
    const k = page.keyboard;
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    const blocs = () => page.evaluate(() => JSON.parse(JSON.stringify(read(document.getElementById('editor')))));
    const enregistre = () => page.evaluate(async () => (await O.send('notes:list'))[0]);
    const tags = () => page.evaluate(() => [...document.getElementById('editor').children].map((e) => e.tagName + (e.className ? '.' + e.className : '')).join());

    await t.verifier('⌃⇧N : une note vide, la barre de mise en forme est là et la saisie a le clavier', async () => {
      assert.equal(await page.evaluate(() => document.activeElement.id), 'editor');
      assert.equal(await page.locator('#tools').isVisible(), true);
      assert.deepEqual(await page.locator('#tools button').evaluateAll((els) => els.map((b) => b.dataset.do)), ['b', 'i', 'h1', 'h2', 'h3', 'ul', 'ol', 'todo', 'link']);
      assert.equal(await page.locator('#tools button[data-do=b]').getAttribute('title'), 'Gras');
    });

    await t.verifier('frappe : la première ligne est le titre ; ⌘B et ⌘I mettent en gras et en italique', async () => {
      await k.type('Courses');
      await k.press('Enter');
      await k.type('du ');
      await k.press(`${mod}+b`);
      await k.type('pain');
      await k.press(`${mod}+b`);
      await k.type(' et du ');
      await k.press(`${mod}+i`);
      assert.equal(await page.locator('#tools button[data-do=i]').getAttribute('aria-pressed'), 'true');
      await k.type('lait');
      await k.press(`${mod}+i`);
      assert.deepEqual(await blocs(), [{ t: 'p', runs: [{ s: 'Courses' }] }, { t: 'p', runs: [{ s: 'du ' }, { s: 'pain', b: true }, { s: ' et du ' }, { s: 'lait', i: true }] }]);
      assert.equal(await page.locator('#items .note b').textContent(), 'Courses');
      assert.equal(parseFloat(await page.locator('#editor > p').first().evaluate((el) => getComputedStyle(el).fontSize)), 28);
    });

    await t.verifier('début de ligne « ## », « - », « 1. », « [] » : titre, puces, numéros, cases — et Entrée sur une ligne vide sort de la liste', async () => {
      await k.press('Enter');
      await k.type('## Marché');
      await k.press('Enter');
      await k.type('- pommes');
      await k.press('Enter');
      await k.type('poires');
      await k.press('Enter');
      await k.press('Enter');
      await k.type('1. un');
      await k.press('Enter');
      await k.type('deux');
      await k.press('Enter');
      await k.press('Enter');
      await k.type('[] appeler');
      await k.press('Enter');
      await k.type('écrire');
      assert.deepEqual((await blocs()).slice(2).map((b) => [b.t, b.runs.map((r) => r.s).join('')]), [['h2', 'Marché'], ['ul', 'pommes'], ['ul', 'poires'], ['ol', 'un'], ['ol', 'deux'], ['todo', 'appeler'], ['todo', 'écrire']]);
      assert.equal(await tags(), 'P,P,H2,UL,OL,UL.todo');
      assert.equal(await page.locator('#tools button[data-do=todo]').getAttribute('aria-pressed'), 'true');
    });

    await t.verifier('clic sur une case : elle se coche (texte barré), un second clic la décoche ; la ligne suivante commence décochée', async () => {
      const li = page.locator('#editor ul.todo > li').first();
      const b = await li.boundingBox();
      await page.mouse.click(b.x - 16, b.y + b.height / 2);
      assert.equal(await li.getAttribute('data-done'), '1');
      assert.match(await li.evaluate((el) => getComputedStyle(el).textDecorationLine), /line-through/);
      assert.deepEqual((await blocs()).filter((x) => x.t === 'todo').map((x) => !!x.done), [true, false]);
      // Entrée au bout de la ligne cochée : la nouvelle case est vide.
      await page.mouse.click(b.x + b.width - 4, b.y + b.height / 2);
      await k.press('End');
      await k.press('Enter');
      await k.type('relire');
      assert.deepEqual((await blocs()).filter((x) => x.t === 'todo').map((x) => [x.runs[0].s, !!x.done]), [['appeler', true], ['relire', false], ['écrire', false]]);
      await page.mouse.click(b.x - 16, b.y + b.height / 2);
      assert.equal(await li.getAttribute('data-done'), null);
    });

    await t.verifier('bouton « Titre 1 » de la barre, puis ⌘K : le texte sélectionné devient un lien vers une adresse web seulement', async () => {
      await k.press(`${mod}+ArrowDown`);
      await k.press('Enter');
      await k.press('Enter');
      assert.equal((await blocs()).pop().t, 'p');
      await ctx.clic(page, '#tools button[data-do=h3]');
      await k.type('Voir orbe');
      assert.deepEqual((await blocs()).pop(), { t: 'h3', runs: [{ s: 'Voir orbe' }] });
      await k.press('Shift+Alt+ArrowLeft');
      await k.press(`${mod}+k`);
      assert.equal(await page.locator('#link').isVisible(), true);
      await k.type('javascript:alert(1)');
      await k.press('Enter');
      assert.equal(await page.locator('#editor a').count(), 0, 'une adresse « javascript: » ne fait pas un lien');
      await k.press(`${mod}+k`);
      await k.type(ctx.url('/a'));
      await k.press('Enter');
      assert.deepEqual((await blocs()).pop(), { t: 'h3', runs: [{ s: 'Voir ' }, { s: 'orbe', a: ctx.url('/a') }] });
      assert.equal(await page.evaluate(() => document.activeElement.id), 'editor');
    });

    await t.verifier('coller du HTML : seul son texte entre dans la note, aucun élément n’est créé', async () => {
      await k.press(`${mod}+ArrowDown`);
      await k.press('Enter');
      await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.setData('text/html', '<img src=x onerror="window.__pwn=1"><script>window.__pwn=2</script><b style="font-size:90px">gros</b><iframe src="https://exemple.test"></iframe>');
        dt.setData('text/plain', 'gros <img src=x onerror=window.__pwn=3>');
        document.getElementById('editor').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      });
      const vu = await page.evaluate(() => ({ n: document.querySelectorAll('#editor img, #editor script, #editor iframe, #editor [style]').length, pwn: window.__pwn || 0 }));
      assert.deepEqual(vu, { n: 0, pwn: 0 });
      assert.equal((await blocs()).pop().runs.map((r) => r.s).join(''), 'gros <img src=x onerror=window.__pwn=3>');
    });

    await t.verifier('enregistrée au fil de la frappe comme un modèle de blocs ; rouverte, la note revient avec sa mise en forme', async () => {
      await jusqua(async () => (await page.textContent('#saved')) === 'Enregistré', 'note enregistrée');
      const avant = await blocs();
      const n = await enregistre();
      assert.deepEqual(n.blocks, avant);
      assert.ok(n.text.startsWith('Courses\ndu pain et du lait\nMarché\n- pommes\n- poires\n1. un\n2. deux\n[ ] appeler\n[ ] relire\n[ ] écrire'), n.text);
      await page.reload();
      await jusqua(() => page.evaluate(() => document.querySelectorAll('#editor > *').length > 3), 'note rechargée');
      assert.deepEqual(await blocs(), avant);
      assert.equal(await tags(), 'P,P,H2,UL,OL,UL.todo,H3,P');
      assert.equal(await page.locator('#editor a').getAttribute('href'), ctx.url('/a'));
    });

    await t.verifier('⌘-clic sur un lien de la note : la page s’ouvre dans un nouvel onglet', async () => {
      const a = await page.locator('#editor a').boundingBox();
      await page.mouse.click(a.x + a.width / 2, a.y + a.height / 2);
      assert.equal(await ctx.onglet('/a'), undefined, 'un clic simple place le curseur, sans ouvrir le lien');
      await k.down(mod);
      await page.mouse.click(a.x + a.width / 2, a.y + a.height / 2);
      await k.up(mod);
      await ctx.attendreOnglet('/a');
    });
  },
};
