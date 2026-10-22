// Test au clavier réel des raccourcis (prend le clavier quelques secondes).
// Les codes de touche sont des positions physiques : le test vaut pour la
// disposition de clavier de la machine où il tourne.
//   swiftc -O tests/natif/touche.swift -o /tmp/touche
//   TOUCHE=/tmp/touche ORBE_SCENARIO=tests/natif/raccourcis.js node scripts/dev.js --selftest
const { execFileSync } = require('child_process');
const { app } = require('electron');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Positions physiques (clavier Mac) : chiffres, lettres, flèches, signes.
const K = { 1: 18, 2: 19, 3: 20, 9: 25, t: 17, d: 2, s: 1, w: 13, z: 6, l: 37, c: 8, k: 40, y: 16, left: 123, right: 124, down: 125, up: 126, equal: 24, minus: 27, lbracket: 33, rbracket: 30, esc: 53 };

module.exports = async ({ first: w, win }) => {
  let failed = 0;
  // Sécurité : les touches partent vers l'application au premier plan. Si la
  // fenêtre de test ne l'est plus (quelqu'un utilise la machine), on arrête.
  const press = async (key, ...mods) => {
    if (!w.win.isFocused()) throw new Error('la fenêtre de test n’est plus au premier plan : test interrompu, aucune touche envoyée');
    execFileSync(process.env.TOUCHE, [String(K[key]), ...mods]);
    await sleep(450);
  };
  const check = (name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : ' — ' + detail}`); };
  const title = () => (w.activeId ? w.data.tabs[w.activeId].title : null);
  const page = (t) => `data:text/html,<title>${t}</title><h1>${t}</h1><p>texte</p>`;

  const a = w.newTab(page('A'));
  const b = w.newTab(page('B'));
  const c = w.newTab(page('C'));
  await sleep(1200);
  w.newSpace();
  await sleep(300);
  w.spaceAt(1);
  app.focus({ steal: true });
  w.win.focus();
  w.focusContent();
  await sleep(900);
  console.log('\nRaccourcis au clavier réel\n');

  await press('down', 'cmd', 'alt');
  check('⌥⌘↓ onglet suivant', title() === 'B', title());
  await press('up', 'cmd', 'alt');
  check('⌥⌘↑ onglet précédent', title() === 'C', title());
  await press('3', 'cmd');
  check('⌘3 troisième onglet', title() === 'A', title());
  await press('1', 'cmd');
  check('⌘1 premier onglet', title() === 'C', title());
  await press('2', 'ctrl');
  check('⌃2 deuxième Espace', w.spaceId === w.data.spaces[1].id);
  await press('left', 'cmd', 'alt');
  check('⌥⌘← Espace précédent', w.spaceId === w.data.spaces[0].id);
  await press('right', 'cmd', 'alt');
  check('⌥⌘→ Espace suivant', w.spaceId === w.data.spaces[1].id);
  await press('1', 'ctrl');
  check('⌃1 premier Espace', w.spaceId === w.data.spaces[0].id);
  await press('d', 'cmd');
  check('⌘D épingle', w.space.pinned.some((n) => n.id === c.id));
  await press('d', 'cmd');
  check('⌘D désépingle', w.space.today.includes(c.id));
  await press('s', 'cmd');
  check('⌘S masque la barre latérale', !w.sidebarVisible);
  await press('s', 'cmd');
  check('⌘S la réaffiche', w.sidebarVisible);
  await press('t', 'cmd');
  check('⌘T ouvre la barre de commande', w.modalMode === 'command');
  await press('esc');
  check('Échap la ferme', !w.modalMode);
  await press('l', 'cmd');
  check('⌘L ouvre la barre de commande sur l’adresse', w.modalMode === 'command');
  await press('esc');
  await press('equal', 'ctrl', 'shift');
  check('⌃⇧= ouvre la barre pour une vue scindée', w.modalMode === 'command' && w.commandMode === 'split', `${w.modalMode} ${w.commandMode}`);
  await press('esc');
  w.splitWith(c.id, b.id);
  await sleep(400);
  await press('minus', 'ctrl', 'shift');
  check('⌃⇧- ferme le volet', !w.splits.length, JSON.stringify(w.splits));
  w.activate(c.id);
  w.navigate(page('C2'));
  await sleep(900);
  await press('lbracket', 'cmd');
  check('⌘[ page précédente', title() === 'C', title());
  await press('rbracket', 'cmd');
  check('⌘] page suivante', title() === 'C2', title());
  const clip = await require('electron').clipboard.readText().catch(() => '');
  await press('c', 'cmd', 'shift');
  check('⇧⌘C copie l’URL', (await require('electron').clipboard.readText()).startsWith('data:text/html,<title>C2'));
  await require('electron').clipboard.writeText(clip);
  const n = w.space.today.length;
  await press('w', 'cmd');
  check('⌘W archive l’onglet', w.space.today.length === n - 1);
  await press('z', 'cmd');
  check('⌘Z annule l’archivage', w.space.today.length === n);
  await press('w', 'cmd');
  await press('t', 'cmd', 'shift');
  check('⇧⌘T le rouvre', w.space.today.length === n);
  w.splitWith(w.activeId, b.id);
  await sleep(400);
  await press('1', 'ctrl', 'shift');
  const first = w.activeId;
  await press('2', 'ctrl', 'shift');
  check('⌃⇧1 / ⌃⇧2 passent d’un volet à l’autre', w.activeId !== first && w.visibleIds().length === 2, `${first} ${w.activeId}`);
  w.run('closeSplit');
  await press('k', 'cmd', 'shift');
  check('⇧⌘K efface Aujourd’hui', w.space.today.length === 1);
  await press('y', 'cmd');
  await sleep(500);
  check('⌘Y ouvre l’historique', !!w.activeId && w.data.tabs[w.activeId].internal === true);
  void a; void win;
  console.log(`\n${failed ? failed + ' raccourci(s) en échec' : 'Tous les raccourcis répondent'}\n`);
  if (failed) throw new Error('raccourcis en échec');
};
