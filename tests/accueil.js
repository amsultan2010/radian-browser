// Accueil du premier lancement (welcome.html) : cinq étapes, chacune facultative.
// Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/accueil.js node scripts/dev.js --selftest
const fs = require('fs');
const os = require('os');
const path = require('path');

const { until } = require('./outils');
const fx = require('./fixtures/navigateurs');

module.exports = async function accueilTests(ctx) {
  const { first: w, store, win } = ctx;
  let failed = 0;
  const check = ctx.check || ((name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`); });
  const br = require('../src/main/import-browsers');
  const platform = require('../src/main/platform');
  const real = { ...br.conf };
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-accueil-'));
  fx.profils(home, { platform: 'darwin' });
  br.configure({ home, platform: 'darwin', sqlite: '' });
  // Le navigateur par défaut du système n'est jamais changé par un essai.
  const realDefault = platform.makeDefault;
  let asked = 0;
  platform.makeDefault = () => { asked += 1; };

  const before = { active: w.activeId, space: w.spaceId, color: w.space.color, welcomed: store.state.window.welcomed };
  delete store.state.window.welcomed;
  const tab = w.openInternal('welcome.html');
  const wc = () => win.live.get(tab.id).wc;
  const js = (code) => wc().executeJavaScript(code);
  const step = () => js('document.querySelector(".step.on").dataset.step');
  const click = (sel) => js(`document.querySelector(${JSON.stringify(sel)}).click()`);
  await until(async () => (await js('typeof show === "function" && document.querySelectorAll("#dots i").length')) === 5, 'accueil chargé');

  const hello = JSON.parse(await js(`JSON.stringify({ step: document.querySelector('.step.on').dataset.step, h1: document.querySelector('.step.on h1').textContent, next: document.getElementById('next').textContent,
    skip: document.getElementById('skip').textContent, back: document.getElementById('back').hidden, shown: [...document.querySelectorAll('.step')].filter((s) => s.getClientRects().length).length })`));
  check('accueil : une étape à la fois, « Commencer », « Passer l’accueil », cinq points',
    hello.step === 'hello' && hello.h1 === 'Bienvenue dans Orbe' && hello.next === 'Commencer' && hello.skip === 'Passer l’accueil' && hello.back && hello.shown === 1, JSON.stringify(hello));

  // Langue : choisie dès la première étape, appliquée tout de suite à toute l'interface.
  await click('#langs [data-lang="en"]');
  await until(async () => (await js('document.querySelector(".step.on h1").textContent')) === 'Welcome to Orbe', 'accueil en anglais');
  const en = { next: await js('document.getElementById("next").textContent'), lang: store.state.settings.lang, pressed: await js('document.querySelector("#langs [aria-pressed=true]").dataset.lang') };
  await click('#langs [data-lang="fr"]');
  await until(async () => (await js('document.querySelector(".step.on h1").textContent')) === 'Bienvenue dans Orbe', 'accueil en français');
  check('première étape : la langue se choisit (français, anglais) et s’applique aussitôt', en.next === 'Get started' && en.lang === 'en' && en.pressed === 'en' && store.state.settings.lang === 'fr', JSON.stringify(en));

  await click('#next');
  await until(async () => (await step()) === 'import' && (await js('document.querySelectorAll("#welcome-browsers .imp-row").length')) === 5, 'étape import : navigateurs trouvés');
  const names = await js('[...document.querySelectorAll("#welcome-browsers .imp-name")].map((n) => n.textContent).join()');
  check('étape import : les navigateurs installés sont proposés', names === 'Google Chrome,Brave,Opera,Firefox,Safari', names);
  const tabs0 = Object.keys(w.data.tabs).length;
  const spaces0 = w.data.spaces.length;
  await click('#welcome-browsers .imp-row[data-browser="brave"] .imp-go');
  await until(() => js('!!document.querySelector("#welcome-browsers .imp-row[data-browser=brave] .imp-apply")'), 'aperçu de Brave');
  const sub = await js('document.querySelector("#welcome-browsers .imp-row[data-browser=brave] .imp-sub").textContent');
  check('aperçu avant import : le compte est montré, rien n’est ajouté', sub.startsWith('1 signets') && Object.keys(w.data.tabs).length === tabs0, sub);
  await click('#welcome-browsers .imp-row[data-browser="brave"] .imp-apply');
  await until(() => js('!!document.querySelector("#welcome-browsers .imp-row[data-browser=brave] .imp-undo")'), 'import de Brave');
  check('import depuis l’accueil : le signet arrive épinglé', Object.keys(w.data.tabs).length === tabs0 + 1 && Object.values(w.data.tabs).some((x) => x.url === 'https://brave.com/'));
  await click('#welcome-browsers .imp-row[data-browser="brave"] .imp-undo');
  await until(() => Object.keys(w.data.tabs).length === tabs0 && w.data.spaces.length === spaces0, 'import annulé depuis l’accueil');
  check('« Annuler l’import » depuis l’accueil : rien ne reste', !Object.values(w.data.tabs).some((x) => x.url === 'https://brave.com/'));
  check('l’import lancé depuis l’accueil ne change pas d’Espace : l’accueil reste à l’écran', w.spaceId === before.space && w.activeId === tab.id);

  await click('#next');
  await until(async () => (await step()) === 'theme' && (await js('document.querySelectorAll("#colors button").length')) === 12, 'étape couleur');
  const pick = '#10b981';
  await click(`#colors button[data-color="${pick}"]`);
  await until(() => w.space.color === pick, 'couleur appliquée à l’Espace');
  // La pastille n'est marquée qu'une fois la réponse du processus principal revenue à la page.
  await until(() => js(`(document.querySelector('#colors button[aria-pressed=true]') || { dataset: {} }).dataset.color === '${pick}'`), 'pastille choisie marquée');
  check('étape couleur : un clic teinte l’Espace affiché, la pastille choisie est marquée',
    (await js(`document.querySelector('#colors button[aria-pressed=true]').dataset.color`)) === pick && (await js('document.querySelectorAll("#colors button[aria-pressed=true]").length')) === 1);

  await click('#next');
  await until(async () => (await step()) === 'default', 'étape navigateur par défaut');
  await click('#make-default');
  await until(() => asked === 1, 'navigateur par défaut demandé');
  check('étape navigateur par défaut : le bouton fait la demande au système, une fois', asked === 1);
  await click('#back');
  await until(async () => (await step()) === 'theme', 'retour');
  await click('#next');
  await click('#next');
  await until(async () => (await step()) === 'ready', 'dernière étape');
  const ready = JSON.parse(await js(`JSON.stringify({ title: document.querySelector('.support b').textContent, body: document.querySelector('.support .sub').textContent, btn: document.querySelector('.support [data-cmd=support]').textContent,
    tips: [...document.querySelectorAll('.tips .line')].map((l) => l.textContent.trim()).length, next: document.getElementById('next').textContent, skip: document.getElementById('skip').hidden })`));
  check('dernière étape : premiers gestes avec leurs raccourcis, et le mot de soutien tel qu’il est écrit',
    ready.title === store.t('support.title') && ready.body === store.t('support.body') && ready.btn === 'Soutenir le projet' && ready.tips === 6 && ready.next === 'Commencer à naviguer' && ready.skip, JSON.stringify(ready));
  check('le lien de soutien est celui du projet', /^https:\/\/buymeacoffee\.com\/amadouba$/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'main', 'commands.js'), 'utf8').match(/SUPPORT_URL = '([^']+)'/)[1]));
  await click('#next');
  await until(() => !w.data.tabs[tab.id], 'accueil refermé');
  check('« Commencer à naviguer » referme l’accueil, qui ne reviendra pas', store.state.window.welcomed === true && !w.data.tabs[tab.id]);

  // « Passer l'accueil » dès la première étape.
  const again = w.openInternal('welcome.html');
  await until(() => win.live.get(again.id) && win.live.get(again.id).wc.executeJavaScript('typeof show === "function" && !!document.getElementById("skip")'), 'accueil rouvert depuis l’aide');
  await win.live.get(again.id).wc.executeJavaScript('document.getElementById("skip").click()');
  // « Passer » ne ferme pas : il mène à la dernière étape, celle du mot de soutien.
  const awc = win.live.get(again.id).wc;
  await until(() => awc.executeJavaScript('document.querySelector(".step.on").dataset.step === "ready"'), 'dernière étape après « Passer »');
  const skipped = JSON.parse(await awc.executeJavaScript(`JSON.stringify({ soutien: document.querySelector('.support').getClientRects().length > 0, bouton: document.querySelector('.support [data-cmd="support"]').textContent, passer: document.getElementById('skip').hidden, suite: document.getElementById('next').textContent })`));
  check('« Passer l’accueil » mène à la dernière étape : le mot de soutien est affiché, puis « Commencer à naviguer »',
    !!w.data.tabs[again.id] && skipped.soutien && skipped.bouton === 'Soutenir le projet' && skipped.passer === true && skipped.suite === 'Commencer à naviguer', JSON.stringify(skipped));
  await awc.executeJavaScript('document.getElementById("next").click()');
  await until(() => !w.data.tabs[again.id], 'accueil refermé');
  check('après « Passer », « Commencer à naviguer » referme l’accueil', !w.data.tabs[again.id]);

  platform.makeDefault = realDefault;
  br.configure(real);
  w.setTheme({ color: before.color });
  if (before.welcomed === undefined) delete store.state.window.welcomed; else store.state.window.welcomed = before.welcomed;
  if (before.active && w.data.tabs[before.active]) w.activate(before.active);
  w.undoStack.length = 0;
  w.redoStack.length = 0;
  try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
  if (!ctx.check && failed) throw new Error(`${failed} vérification(s) en échec`);
};
