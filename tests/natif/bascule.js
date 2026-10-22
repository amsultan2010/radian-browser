// Test au clavier réel de la bascule ⌃Tab (prend le clavier une seconde).
// Les touches sont envoyées au système, comme depuis un vrai clavier :
//   swiftc -O tests/natif/ctrltab.swift -o /tmp/ctrltab
//   CTRLTAB=/tmp/ctrltab ORBE_SCENARIO=tests/natif/bascule.js node scripts/dev.js --selftest
const { execFileSync } = require('child_process');
const { app } = require('electron');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async ({ first: w }) => {
  const a = w.newTab('data:text/html,<title>A</title><input autofocus>');
  const b = w.newTab('data:text/html,<title>B</title>bonjour');
  const c = w.newTab('data:text/html,<title>C</title>salut');
  await sleep(1200);
  app.focus({ steal: true });
  w.win.focus();
  w.focusContent();
  await sleep(800);
  const check = (name, ok) => { console.log(`${ok ? '  ✓' : '  ✗'} ${name}`); if (!ok) throw new Error(name); };
  if (!w.win.isFocused()) throw new Error('la fenêtre de test n’est pas au premier plan : test interrompu');
  execFileSync(process.env.CTRLTAB, ['1']);
  await sleep(600);
  check('⌃Tab puis relâchement de ⌃ : retour à l’onglet précédent', w.activeId === b.id && !w.modalMode);
  if (!w.win.isFocused()) throw new Error('la fenêtre de test n’est pas au premier plan : test interrompu');
  execFileSync(process.env.CTRLTAB, ['2']);
  await sleep(600);
  check('⌃Tab deux fois : deux onglets en arrière', w.activeId === a.id && !w.modalMode);
  void c;
};
