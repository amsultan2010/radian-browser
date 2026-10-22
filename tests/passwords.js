// Gestionnaire de mots de passe : tests de bout en bout, sans réseau.
// Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/passwords.js node scripts/dev.js --selftest
// Les mots de passe ci-dessous sont factices. Le trousseau du système n'est
// jamais touché (main.js passe « use-mock-keychain » en test).
const http = require('http');
const fs = require('fs');
const { clipboard } = require('electron');

const { sleep, until } = require('./outils');

// Page hostile : avant tout chargement, elle altère les prototypes et écoute
// tout ce qu'elle peut, pour tenter d'apprendre quelque chose du gestionnaire.
const SPY = `<script>
window.__log = [];
const L = (x) => { try { window.__log.push(String(x)); } catch {} };
const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
Object.defineProperty(HTMLInputElement.prototype, 'value', { get() { return d.get.call(this); }, set(v) { L('set:' + v); d.set.call(this, v); }, configurable: true });
const add = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function (t, f, o) { L('listen:' + t); return add.call(this, t, f, o); };
const qsa = Document.prototype.querySelectorAll;
Document.prototype.querySelectorAll = function (s) { L('qsa:' + s); return qsa.call(this, s); };
add.call(window, 'message', (e) => L('msg:' + JSON.stringify(e.data)));
for (const t of ['input', 'change', 'orbe-pw', 'fill']) add.call(document, t, (e) => L('ev:' + t + ':' + (e.target && d.get.call(e.target))), true);
window.__probe = () => ({
  keys: Object.getOwnPropertyNames(window).filter((k) => /orbe|electron|ipc|^require$|^process$|^module$/i.test(k)),
  req: typeof require, proc: typeof process, orbe: typeof window.orbe,
});
</script>`;

function serve() {
  const page = (title, body, head = '') => `<!doctype html><meta charset="utf-8">${head}<title>${title}</title><body style="font:16px sans-serif;padding:30px">${body}</body>`;
  const login = `<form id="f" action="/done" method="post">
    <input id="user" name="username" autocomplete="username"><br><br>
    <input id="pass" name="password" type="password" autocomplete="current-password"><br><br>
    <button id="go" type="submit">Connexion</button></form>`;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const port = server.address().port;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    if (url.pathname.startsWith('/p/')) return res.end(server.pages[url.pathname.slice(3)] || 'introuvable');
    if (url.pathname === '/login') return res.end(page('Connexion', login, SPY));
    if (url.pathname === '/done') return res.end(page('Fait', '<h1>Connecté</h1>'));
    if (url.pathname === '/step1') return res.end(page('Étape 1', '<form action="/step2"><input id="login" name="login" autocomplete="username"><br><br><button id="next">Suivant</button></form>'));
    if (url.pathname === '/step2') return res.end(page('Étape 2', '<form action="/done" method="post"><input id="pass" type="password" autocomplete="current-password"><br><br><button id="go">Connexion</button></form>'));
    if (url.pathname === '/signup') return res.end(page('Inscription', '<form action="/done" method="post"><input id="mail" name="email" type="email"><br><br><input id="p1" type="password" autocomplete="new-password"><br><br><input id="p2" type="password" autocomplete="new-password"><br><br><button id="go">Créer le compte</button></form>'));
    // Application monopage : champs ajoutés après coup, sans <form>, retirés à la connexion.
    if (url.pathname === '/spa') return res.end(page('Application', `<div id="app"></div><script>
      window.mount = () => { document.getElementById('app').innerHTML = '<div id="box"><input id="user" type="email" name="email"><br><br><input id="pass" type="password"><br><br><div id="go" role="button" style="display:inline-block;padding:8px 14px;background:#ddd">Se connecter</div></div>';
        document.getElementById('go').onclick = () => { document.getElementById('app').innerHTML = '<h1>Bienvenue</h1>'; history.pushState({}, '', '/accueil'); }; };
    </script>`));
    if (url.pathname === '/frame') return res.end(page('Page hôte', `<h1>Hôte</h1><iframe id="fr" src="http://localhost:${port}/login" style="width:420px;height:260px;border:1px solid #999"></iframe>`, SPY));
    res.statusCode = 404;
    return res.end(page('404', 'introuvable'));
  });
  server.pages = {}; // pages hostiles, ajoutées par les tests
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

module.exports = async function passwordTests(ctx) {
  const { first: w, OrbeWindow, store, win, passwords } = ctx;
  const standalone = !ctx.check;
  let failed = 0;
  let total = 0;
  const check = ctx.check || ((name, ok, detail = '') => {
    total += 1;
    if (!ok) failed += 1;
    console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`);
  });
  if (standalone) console.log('\nOrbe — mots de passe\n');

  const server = await serve();
  const port = server.address().port;
  const A = `http://127.0.0.1:${port}`; // site principal
  const B = `http://localhost:${port}`; // autre site
  const sub = (name) => `http://${name}.coffre.localhost:${port}`;
  const X = passwords.internals;
  const P1 = 'motdepasse-Alice-1!';
  const P2 = 'motdepasse-Bob-2?';

  // Ni boîte de dialogue ni Touch ID en test : réponses pilotées.
  const saved = { confirm: passwords.hooks.confirm, authenticate: passwords.hooks.authenticate };
  const asked = [];
  let confirmAnswer = false;
  let authAnswer = true;
  passwords.hooks.confirm = async (parent, opts) => { asked.push(opts); return confirmAnswer; };
  let authCalls = 0;
  passwords.hooks.authenticate = async () => { authCalls += 1; return authAnswer; };

  const ov = (win_ = w) => X.overlays.get(win_.win.id);
  const opened = [];
  const open = async (url, owner = w) => {
    const tab = owner.newTab(url);
    opened.push([owner, tab.id]);
    await until(() => win.live.get(tab.id) && !win.live.get(tab.id).loading && win.live.get(tab.id).wc.getURL() === url, 'chargement de ' + url);
    const wc_ = win.live.get(tab.id).wc;
    // La page se comporte comme si elle avait le clavier, même si la fenêtre de
    // test est masquée ou l'écran verrouillé (sinon clics et saisie sont ignorés).
    try { wc_.debugger.attach('1.3'); await wc_.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch {}
    return wc_;
  };
  const js = (target, code) => target.executeJavaScript(code, true);
  const center = (target, sel) => js(target, `(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  // Vrai clic (événement de confiance). Dans un iframe d'un autre site (autre
  // processus), sendInputEvent n'arrive pas : le clic passe par le protocole de
  // débogage, qui l'aiguille vers le bon cadre comme une vraie souris.
  const click = async (wc, sel, frame) => {
    // L'onglet visé doit être celui qui est affiché.
    const mine = opened.find(([owner, id]) => win.live.get(id) && win.live.get(id).wc === wc);
    if (mine && mine[0].activeId !== mine[1]) { mine[0].activate(mine[1]); await sleep(120); }
    const p = await center(frame || wc, sel);
    wc.focus();
    if (frame) {
      const o = await js(wc, '(() => { const f = document.querySelector("iframe"); const r = f.getBoundingClientRect(); return { x: r.left + f.clientLeft, y: r.top + f.clientTop }; })()');
      for (const type of ['mousePressed', 'mouseReleased']) await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type, x: Math.round(o.x + p.x), y: Math.round(o.y + p.y), button: 'left', clickCount: 1 });
      return;
    }
    for (const type of ['mouseDown', 'mouseUp']) wc.sendInputEvent({ type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
  };
  // Clique jusqu'à ce que la condition soit vraie (la fenêtre de test peut perdre le premier plan).
  const clickUntil = (wc, sel, cond, label, frame) => {
    let n = 0;
    return until(async () => {
      if (await cond()) return true;
      if (n++ % 25 === 0) await click(wc, sel, frame);
      return false;
    }, label);
  };
  const value = (target, sel) => js(target, `document.querySelector(${JSON.stringify(sel)}).value`);
  // Saisie réelle dans un champ (événements de confiance).
  const type = async (wc, sel, text, frame) => {
    const t = frame || wc;
    await clickUntil(wc, sel, () => js(t, `document.activeElement === document.querySelector(${JSON.stringify(sel)})`), 'champ actif ' + sel, frame);
    await wc.insertText(text);
    await until(async () => (await value(t, sel)) === text, 'saisie dans ' + sel);
  };
  const focusSeen = (wc) => { const st = X.states.get(wc.id); return st && st.focus; };
  const pickShown = async (wc, selector = '.acc') => {
    const o = ov();
    return !!(o && o.pick && o.pick.wc === wc && await o.picker.webContents.executeJavaScript(`!document.getElementById('pick').hidden && document.querySelectorAll(${JSON.stringify(selector)}).length > 0`));
  };
  const pickItems = () => ov().picker.webContents.executeJavaScript('[...document.querySelectorAll("#pick .acc")].map((b) => b.className.replace("acc ", "") + ":" + b.querySelector(".name").textContent)');
  const GUARD = 560; // un clic trop précoce est ignoré exprès (500 ms)
  const choose = async (selector) => {
    await sleep(GUARD);
    await ov().picker.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const pending = (wc) => { const o = ov(); return o && o.pending && o.pending.wc === wc ? o.pending : null; };
  const answer = async (id) => {
    await until(() => ov().prompt.webContents.executeJavaScript('!document.getElementById("save").hidden'), 'proposition affichée');
    await sleep(GUARD);
    await ov().prompt.webContents.executeJavaScript(`document.getElementById(${JSON.stringify(id)}).click()`);
    await until(() => !ov().pending, 'proposition refermée');
  };
  const entries = (pid = 'default') => X.bucket(pid).entries;
  const submitLogin = async (wc, user, pass) => {
    await type(wc, '#user', user);
    await type(wc, '#pass', pass);
    await click(wc, '#go');
  };

  check('mots de passe : chiffrement du système disponible', passwords.status() === 'ok' && passwords.encryptionAvailable());
  if (passwords.status() !== 'ok') {
    // Sans chiffrement réel, tout le reste est refusé : c'est le comportement voulu.
    check('mots de passe : sans chiffrement, rien n’est enregistré', passwords.save('default', { origin: A, username: 'x', password: 'y' }) === null);
    server.close();
    Object.assign(passwords.hooks, saved);
    return;
  }

  // --- Enregistrement à l'envoi d'un formulaire -------------------------------
  let wc = await open(A + '/login');
  await submitLogin(wc, 'alice', P1);
  await until(() => pending(wc), 'proposition d’enregistrement');
  check('envoi d’un formulaire : proposition d’enregistrer, avec l’identifiant et le site', pending(wc).username === 'alice' && pending(wc).origin === A && !pending(wc).update);
  const promptText = await ov().prompt.webContents.executeJavaScript('document.body.innerText');
  check('la proposition n’affiche jamais le mot de passe', !promptText.includes(P1) && promptText.includes('127.0.0.1'));
  await answer('save-ok');
  check('« Enregistrer » range le compte dans le coffre du profil', entries().length === 1 && entries()[0].origin === A && entries()[0].username === 'alice' && entries()[0].password === P1);

  // --- Chiffrement au repos ----------------------------------------------------
  const file = X.vault.file;
  const raw = fs.readFileSync(file);
  const text = raw.toString('latin1');
  const leaks = [P1, 'alice', '127.0.0.1', Buffer.from(P1).toString('base64'), Buffer.from('alice').toString('base64')].filter((s) => text.includes(s));
  check('coffre : fichier à part, sans mot de passe, identifiant ni site en clair', file.endsWith('passwords.json') && !leaks.length && JSON.parse(raw.toString('utf8')).orbe === 'passwords', String(leaks.length));
  store.flush();
  check('coffre : rien dans orbe.json', !fs.readFileSync(store.file, 'utf8').includes(P1));
  if (process.platform !== 'win32') check('coffre : fichier lisible par son seul propriétaire', (fs.statSync(file).mode & 0o077) === 0);

  // --- Même compte, mot de passe changé, « jamais » ---------------------------
  wc.loadURL(A + '/login');
  await until(() => !wc.isLoading() && wc.getURL() === A + '/login', 'retour au formulaire');
  await submitLogin(wc, 'alice', P1);
  await until(() => wc.getURL() === A + '/done', 'formulaire envoyé');
  await sleep(500);
  check('compte déjà enregistré tel quel : aucune proposition', !pending(wc));
  wc.loadURL(A + '/login');
  await until(() => !wc.isLoading() && wc.getURL() === A + '/login', 'retour au formulaire');
  await submitLogin(wc, 'alice', 'autre-mot-de-passe');
  await until(() => pending(wc), 'proposition de mise à jour');
  check('mot de passe changé : proposition de mise à jour', pending(wc).update === true);
  await until(() => ov().prompt.webContents.executeJavaScript('!document.getElementById("save").hidden'), 'proposition affichée');
  const upd = JSON.parse(await ov().prompt.webContents.executeJavaScript('JSON.stringify([document.getElementById("save-title").textContent, document.getElementById("save-user").hidden])'));
  check('mise à jour : le compte remplacé est nommé, l’identifiant n’est pas modifiable', upd[0].includes('alice') && upd[0].includes('127.0.0.1') && upd[1] === true, upd[0]);
  await answer('save-later');
  check('« Plus tard » ne change rien', entries().length === 1 && entries()[0].password === P1);

  let wcB = await open(B + '/login');
  await submitLogin(wcB, 'zoe', 'peu-importe');
  await until(() => pending(wcB), 'proposition sur un autre site');
  await answer('save-never');
  check('« Jamais pour ce site » retient le site, pas le compte', X.bucket('default').never.includes(B) && entries().length === 1);
  wcB.loadURL(B + '/login');
  await until(() => !wcB.isLoading() && wcB.getURL() === B + '/login', 'retour au formulaire');
  await submitLogin(wcB, 'zoe', 'peu-importe');
  await until(() => wcB.getURL() === B + '/done', 'formulaire envoyé');
  await sleep(500);
  check('site en « jamais » : plus de proposition', !pending(wcB));
  passwords.setNever('default', B, false);

  // Formulaire rempli et envoyé par le script de la page : pas de proposition.
  wc.loadURL(A + '/login');
  await until(() => !wc.isLoading() && wc.getURL() === A + '/login', 'retour au formulaire');
  await js(wc, 'document.querySelector("#user").value = "mallory"; document.querySelector("#pass").value = "forge"; document.querySelector("#f").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); document.querySelector("#go").click(); 1');
  await until(() => wc.getURL() === A + '/done', 'envoi par script');
  await sleep(500);
  check('formulaire envoyé par la page sans saisie de l’utilisateur : aucune proposition', !pending(wc));

  // --- Remplissage sur l'origine exacte ---------------------------------------
  passwords.save('default', { origin: A, username: 'bob', password: P2 });
  wc.loadURL(A + '/login');
  await until(() => !wc.isLoading() && wc.getURL() === A + '/login', 'retour au formulaire');
  await clickUntil(wc, '#user', () => pickShown(wc, '.acc.exact'), 'liste des comptes');
  const items = await pickItems();
  check('champ de connexion : la liste des comptes du site s’ouvre hors de la page', items.filter((i) => i.startsWith('exact:')).length === 2 && items.includes('exact:alice') && items.includes('exact:bob'), items.join(' | '));
  const pb = ov().picker.getBounds();
  const vb = win.live.get(w.activeId).view.getBounds();
  check('la liste reste dans la zone de la page', pb.x >= vb.x && pb.y >= vb.y && pb.x + pb.width <= vb.x + vb.width && pb.y + pb.height <= vb.y + vb.height, JSON.stringify([pb, vb]));
  check('rien n’est rempli avant le choix', (await value(wc, '#user')) === '' && (await value(wc, '#pass')) === '');
  const pickerText = await ov().picker.webContents.executeJavaScript('document.documentElement.innerHTML');
  check('la liste ne contient aucun mot de passe', !pickerText.includes(P1) && !pickerText.includes(P2));
  const before = await js(wc, 'JSON.stringify({ log: window.__log, html: document.documentElement.outerHTML, probe: window.__probe() })');
  check('avant le choix, la page ne peut rien apprendre (ni comptes, ni mots de passe, ni pont vers Orbe)',
    !before.includes(P1) && !before.includes(P2) && !before.includes('alice') && !/\bbob\b/.test(before)
    && JSON.parse(before).probe.keys.length === 0 && JSON.parse(before).probe.req === 'undefined' && JSON.parse(before).probe.orbe === 'undefined');
  await js(wc, 'window.postMessage({ type: "fill" }, "*"); window.postMessage({ channel: "orbe-pw", type: "focus" }, "*"); document.dispatchEvent(new CustomEvent("orbe-pw", { detail: { type: "fill" } })); 1');
  // Choix au clavier : ↓ jusqu'au compte voulu, puis Entrée (touches de confiance,
  // relayées par Orbe ; la page ne les reçoit pas).
  const aliceKeyId = entries().find((e) => e.username === 'alice').id;
  const key = (keyCode) => { for (const type of ['keyDown', 'keyUp']) wc.sendInputEvent({ type, keyCode }); };
  const designated = () => ov().picker.webContents.executeJavaScript('(document.querySelector("#pick .acc.key-sel") || { dataset: {} }).dataset.id || ""');
  await sleep(GUARD);
  wc.focus();
  for (let i = 0; i < 6 && (await designated()) !== aliceKeyId; i++) { key('Down'); await sleep(120); }
  check('liste des comptes : ↓ désigne un compte au clavier', (await designated()) === aliceKeyId);
  key('Enter');
  await until(async () => (await value(wc, '#pass')) === P1, 'remplissage');
  check('Entrée remplit le compte désigné sans envoyer le formulaire', wc.getURL() === (await js(wc, 'location.href')) && !(await js(wc, 'JSON.stringify(window.__log || [])')).includes('keydown:Enter'));
  check('choisir un compte remplit l’identifiant et le mot de passe', (await value(wc, '#user')) === 'alice' && !ov().pick);
  const after = JSON.parse(await js(wc, 'JSON.stringify(window.__log)'));
  check('après le choix, la page ne connaît que le compte choisi', !after.some((l) => l.includes(P2) || /\bbob\b/.test(l)));
  check('le script de page vit dans un monde isolé (prototypes altérés sans effet)', !after.some((l) => l === 'listen:focusin' || l.startsWith('set:') || l.startsWith('qsa:')), after.filter((l) => !l.startsWith('ev:')).slice(0, 4).join(' | '));
  await click(wc, '#go'); // envoi du compte rempli, inchangé
  await until(() => wc.getURL() === A + '/done', 'formulaire envoyé');
  await sleep(400);
  check('compte rempli par Orbe puis envoyé : aucune proposition', !pending(wc));

  // --- Autre origine, http contre https ---------------------------------------
  wcB.loadURL(B + '/login');
  await until(() => !wcB.isLoading() && wcB.getURL() === B + '/login', 'formulaire de l’autre site');
  await clickUntil(wcB, '#user', () => focusSeen(wcB) && focusSeen(wcB).origin === B, 'champ signalé sur l’autre site');
  await sleep(500);
  check('autre site : aucun compte proposé', !ov().pick);
  const hs = sub('sur');
  passwords.save('default', { origin: hs.replace('http:', 'https:'), username: 'carol', password: 'pw-carol' });
  let wcS = await open(hs + '/login');
  await clickUntil(wcS, '#user', () => focusSeen(wcS) && focusSeen(wcS).origin === hs, 'champ signalé en http');
  await sleep(500);
  check('compte enregistré en https : jamais proposé sur la même adresse en http', !ov().pick);
  check('règles d’origine : https→http refusé, sous-domaine et http→https « liés », suffixe public cloisonné',
    (await passwords.relation('https://exemple.fr', 'http://exemple.fr')) === null
    && (await passwords.relation('http://exemple.fr', 'https://exemple.fr')) === 'related'
    && (await passwords.relation('https://compte.exemple.fr', 'https://www.exemple.fr')) === 'related'
    && (await passwords.relation('https://exemple.fr', 'https://exemple.fr')) === 'exact'
    && (await passwords.relation('https://exemple.fr', 'https://exemple.fr:8443')) === 'related'
    && (await passwords.relation('https://a.github.io', 'https://b.github.io')) === null
    && (await passwords.relation('https://a.co.uk', 'https://b.co.uk')) === null
    && (await passwords.relation('https://exemple.fr', 'https://exemple.com')) === null
    && (await passwords.relation('https://exemple.fr', 'https://mauvais-exemple.fr')) === null
    && (await passwords.relation('http://127.0.0.1:1', 'http://localhost:1')) === null);

  // --- Autre sous-domaine : proposé, jamais sans confirmation -----------------
  passwords.save('default', { origin: sub('a'), username: 'dan', password: 'pw-dan' });
  const wcR = await open(sub('b') + '/login');
  await clickUntil(wcR, '#user', () => pickShown(wcR, '.acc.related'), 'compte d’un autre sous-domaine proposé');
  asked.length = 0;
  confirmAnswer = false;
  await choose('.acc.related');
  await until(() => asked.length === 1, 'confirmation demandée');
  await sleep(300);
  check('autre sous-domaine : confirmation demandée, refus = rien de rempli', asked[0].detail.includes('a.coffre.localhost') && asked[0].detail.includes('b.coffre.localhost') && (await value(wcR, '#pass')) === '' && (await value(wcR, '#user')) === '');
  confirmAnswer = true;
  await js(wcR, 'document.activeElement.blur(); 1');
  await sleep(300);
  await clickUntil(wcR, '#user', () => pickShown(wcR, '.acc.related'), 'liste rouverte');
  await choose('.acc.related');
  await until(async () => (await value(wcR, '#pass')) === 'pw-dan', 'remplissage après confirmation');
  check('autre sous-domaine : rempli après confirmation explicite', (await value(wcR, '#user')) === 'dan');

  // --- Connexion en deux étapes ------------------------------------------------
  const two = sub('deux');
  passwords.save('default', { origin: two, username: 'erin', password: 'pw-erin' });
  const wc2 = await open(two + '/step1');
  await clickUntil(wc2, '#login', () => pickShown(wc2, '.acc.exact'), 'liste à la première étape');
  await choose('.acc.exact');
  await until(async () => (await value(wc2, '#login')) === 'erin', 'identifiant rempli');
  check('deux étapes : l’identifiant seul est rempli à la première', true);
  await click(wc2, '#next');
  await until(() => wc2.getURL().startsWith(two + '/step2') && !wc2.isLoading(), 'seconde étape');
  passwords.save('default', { origin: two, username: 'autre', password: 'pw-autre' });
  await clickUntil(wc2, '#pass', () => pickShown(wc2, '.acc.exact'), 'liste à la seconde étape');
  const step2 = await pickItems();
  check('deux étapes : à la seconde, rien n’est rempli d’office ; la liste ne propose que le compte choisi', (await value(wc2, '#pass')) === '' && step2.filter((i) => i.startsWith('exact:')).join() === 'exact:erin', step2.join());
  await choose('.acc.exact');
  await until(async () => (await value(wc2, '#pass')) === 'pw-erin', 'mot de passe à la seconde étape');
  check('deux étapes : le mot de passe arrive après ce second clic', true);
  const three = sub('trois');
  const wc3 = await open(three + '/step1');
  await type(wc3, '#login', 'fay');
  await click(wc3, '#next');
  await until(() => wc3.getURL().startsWith(three + '/step2') && !wc3.isLoading(), 'seconde étape');
  await type(wc3, '#pass', 'pw-fay');
  await click(wc3, '#go');
  await until(() => pending(wc3), 'proposition après deux étapes');
  check('deux étapes : l’enregistrement réunit l’identifiant de la première et le mot de passe de la seconde', pending(wc3).username === 'fay' && pending(wc3).origin === three);
  await answer('save-ok');

  // --- Application monopage ----------------------------------------------------
  const spa = sub('app');
  passwords.save('default', { origin: spa, username: 'gus@exemple.fr', password: 'pw-gus' });
  const wcA = await open(spa + '/spa');
  await sleep(300);
  await js(wcA, 'window.mount(); 1');
  await clickUntil(wcA, '#user', () => pickShown(wcA, '.acc.exact'), 'liste sur un formulaire ajouté après coup');
  await choose('.acc.exact');
  await until(async () => (await value(wcA, '#pass')) === 'pw-gus', 'remplissage monopage');
  check('application monopage : formulaire ajouté après le chargement, sans <form>, reconnu et rempli', (await value(wcA, '#user')) === 'gus@exemple.fr');
  await js(wcA, 'window.mount(); 1');
  await type(wcA, '#user', 'hal@exemple.fr');
  await type(wcA, '#pass', 'pw-hal');
  await click(wcA, '#go');
  await until(() => pending(wcA), 'proposition sans navigation');
  check('application monopage : proposition d’enregistrer quand le formulaire disparaît, sans navigation', pending(wcA).username === 'hal@exemple.fr' && wcA.getURL() === spa + '/accueil');
  await answer('save-later');

  // --- Formulaire dans un iframe d'une autre origine --------------------------
  const wcF = await open(A + '/frame');
  const inner = () => wcF.mainFrame.frames[0];
  await until(() => inner() && inner().url === B + '/login', 'iframe chargé');
  await clickUntil(wcF, '#user', () => focusSeen(wcF) && focusSeen(wcF).origin === B, 'champ de l’iframe signalé', inner());
  await sleep(500);
  check('iframe d’une autre origine : les comptes de la page hôte n’y sont jamais proposés', !ov().pick && focusSeen(wcF).embedded === true);
  passwords.save('default', { origin: B, username: 'ivy', password: 'pw-ivy' });
  await sleep(300);
  await clickUntil(wcF, '#user', () => pickShown(wcF, '.acc.exact'), 'compte de l’origine de l’iframe proposé', inner());
  const frameItems = await pickItems();
  asked.length = 0;
  confirmAnswer = true;
  await choose('.acc.exact');
  await until(async () => (await value(inner(), '#pass')) === 'pw-ivy', 'remplissage dans l’iframe');
  const hostLog = await js(wcF, 'JSON.stringify(window.__log) + document.documentElement.outerHTML');
  check('iframe : seul le compte de sa propre origine, après une confirmation qui nomme la page hôte', frameItems.join() === 'exact:ivy,manage:' + store.t('pw.pickManage') && asked.length === 1 && asked[0].detail.includes('127.0.0.1') && asked[0].detail.includes('localhost'), frameItems.join());
  check('iframe : la page hôte n’apprend rien', !hostLog.includes('pw-ivy') && !hostLog.includes('ivy'));

  // === Pages hostiles : régressions de la relecture de sécurité ================
  {
  const page = (host, html) => { const id = 'p' + Object.keys(server.pages).length; server.pages[id] = '<!doctype html><meta charset="utf-8"><body style="font:16px sans-serif;padding:30px">' + html; return `${sub(host)}/p/${id}`; };
  const GOT = '<script>window.got=[];addEventListener("input",(e)=>got.push(e.target.id+"="+e.target.value),true)</script>';
  const SYN = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true })); e.focus(); })()`;
  const go = async (wc_, url) => { wc_.loadURL(url); await until(() => !wc_.isLoading() && wc_.getURL() === url, 'navigation'); };
  const attached = () => !!ov() && !!ov().picker && w.win.contentView.children.includes(ov().picker);
  const enter = (wc_) => { for (const type_ of ['keyDown', 'keyUp']) wc_.sendInputEvent({ type: type_, keyCode: 'Enter' }); };

  // 1. Deux étapes : jamais de remplissage sans clic à la seconde.
  const r1 = sub('r1');
  passwords.save('default', { origin: r1, username: 'rita', password: 'pw-rita' });
  const step1 = '<form action="/login"><input id="u" name="login" autocomplete="username"></form>' + GOT;
  let wcH = await open(page('r1', step1));
  await clickUntil(wcH, '#u', () => pickShown(wcH, '.acc.exact'), 'liste (première étape)');
  await choose('.acc.exact');
  await until(async () => (await value(wcH, '#u')) === 'rita', 'identifiant rempli');
  const chosenSet = !!X.states.get(wcH.id).chosen;
  await go(wcH, page('r1', '<h1>autre page du même site</h1><input id="p" type="password" style="opacity:0;position:fixed;width:5px;height:5px">' + GOT + `<script>onload = () => ${SYN('#p')}</script>`));
  await sleep(700);
  const silent1 = await js(wcH, 'JSON.stringify(got)');
  await go(wcH, page('r1', '<input id="p" type="password">' + GOT + `<script>onload = () => ${SYN('#p')}</script>`));
  await sleep(700);
  const silent2 = await js(wcH, 'JSON.stringify(got)');
  check('hostile : après le choix d’un identifiant, une autre page du même site n’obtient pas le mot de passe (champ invisible, focus fabriqué ou focus() sans geste)', chosenSet && silent1 === '[]' && silent2 === '[]' && !ov().pick, silent1 + silent2);
  await go(wcH, page('r1b', '<h1>ailleurs</h1>'));
  check('hostile : le compte choisi est oublié dès que l’onglet part sur un autre site, et au bout de 45 s', X.states.get(wcH.id).chosen === null && X.CHOICE_TTL <= 45e3);

  // 2. Domaine enregistrable : suffixes publics emboîtés.
  const rel = (a, b) => passwords.relation('https://' + a, 'https://' + b);
  const siblings = [
    ['victim.s3.amazonaws.com', 'evil.s3.amazonaws.com'], ['victim.z6.web.core.windows.net', 'evil.z13.web.core.windows.net'],
    ['victim.global.ssl.fastly.net', 'evil.global.ssl.fastly.net'], ['a.execute-api.us-east-1.amazonaws.com', 'b.execute-api.us-east-1.amazonaws.com'],
    ['a.github.io', 'b.github.io'], ['a.co.uk', 'b.co.uk'], ['192.168.1.1', '192.168.1.2'], ['a.localhost', 'b.localhost'], ['bank.com.', 'evil.com.'], ['a.corp', 'b.corp'],
  ];
  const leaks2 = [];
  for (const [a, b] of siblings) if ((await rel(a, b)) !== null) leaks2.push(a);
  const reg = {};
  for (const h of ['x.s3.amazonaws.com', 'www.amazonaws.com', 'a.b.example.com', 'example.com', 'www.bbc.co.uk', 'localhost', '127.0.0.1', 'a.b.github.io']) reg[h] = await passwords.registrable(h);
  check('hostile : des locataires voisins d’un suffixe public (s3.amazonaws.com, web.core.windows.net, fastly, execute-api, github.io, co.uk) ne sont jamais « liés »', !leaks2.length, leaks2.join());
  check('domaine enregistrable : plus long suffixe public + une étiquette',
    reg['x.s3.amazonaws.com'] === 'x.s3.amazonaws.com' && reg['www.amazonaws.com'] === 'amazonaws.com' && reg['a.b.example.com'] === 'example.com' && reg['example.com'] === 'example.com'
    && reg['www.bbc.co.uk'] === 'bbc.co.uk' && reg.localhost === 'localhost' && reg['127.0.0.1'] === '127.0.0.1' && reg['a.b.github.io'] === 'b.github.io'
    && (await rel('www.example.com', 'app.example.com')) === 'related' && (await passwords.relation('http://192.168.1.1', 'http://192.168.1.1:8080')) === 'related', JSON.stringify(reg));

  // 3. Proposition d'enregistrement : valeurs choisies par la page.
  const r3 = sub('r3');
  passwords.save('default', { origin: r3, username: 'victime', password: 'VRAI-MDP' });
  wcH = await open(page('r3', '<div id="box"><input id="name" name="username" value="victime" style="display:none"><input id="c" placeholder="commentaire"></div><script>const c = document.getElementById("c"); window.swap = () => { c.type = "password"; c.dispatchEvent(new Event("input", { bubbles: true })); c.value = "MDP-ATTAQUANT"; };</script>'));
  await type(wcH, '#c', 'bonjour');
  await js(wcH, 'swap(); 1');
  enter(wcH);
  await sleep(300);
  const armed3 = X.states.get(wcH.id) && X.states.get(wcH.id).armed;
  await js(wcH, 'document.getElementById("box").remove(); 1');
  await sleep(900);
  check('hostile : champ de commentaire changé en mot de passe et rempli par la page : aucune proposition, le vrai compte est intact', !armed3 && !pending(wcH) && entries().find((e) => e.origin === r3).password === 'VRAI-MDP');
  await go(wcH, page('r3', '<div id="box"><input id="name" name="username" value="victime" style="display:none"><input id="p" type="password"></div>'));
  await type(wcH, '#p', 'saisi-par-moi');
  await js(wcH, 'document.getElementById("p").value = "MDP-ATTAQUANT"; 1');
  enter(wcH);
  await sleep(300);
  const armed3b = X.states.get(wcH.id) && X.states.get(wcH.id).armed;
  await js(wcH, 'document.getElementById("box").remove(); 1');
  await sleep(900);
  check('hostile : valeur du mot de passe remplacée par la page après la saisie : aucune proposition', !armed3b && !pending(wcH));
  await go(wcH, r3 + '/login');
  await submitLogin(wcH, 'victime', 'nouveau-mdp');
  await until(() => pending(wcH), 'proposition de remplacement');
  await until(() => ov().prompt.webContents.executeJavaScript('!document.getElementById("save").hidden'), 'proposition affichée');
  await ov().prompt.webContents.executeJavaScript('document.getElementById("save-ok").click(); document.getElementById("save-user").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); 1');
  await sleep(200);
  check('proposition : un clic dans la demi-seconde qui suit son apparition est ignoré, Entrée ne valide pas un remplacement', !!pending(wcH) && entries().find((e) => e.origin === r3).password === 'VRAI-MDP');
  await sleep(GUARD);
  await ov().prompt.webContents.executeJavaScript('document.getElementById("save-user").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); 1');
  await sleep(200);
  check('proposition : même passé ce délai, Entrée ne valide pas un remplacement', !!pending(wcH));
  await answer('save-later');

  // 4. Débit : un iframe bavard n'épuise que son propre quota.
  const fake = { windowStart: 0, tokens: 0, buckets: new Map() };
  let adOk = 0;
  for (let i = 0; i < 1000; i++) if (X.allowed(fake, { frameTreeNodeId: 7 }, false)) adOk += 1;
  const topOk = X.allowed(fake, { frameTreeNodeId: 1 }, true);
  let manyOk = 0;
  for (let f = 10; f < 60; f++) for (let i = 0; i < 40; i++) if (X.allowed(fake, { frameTreeNodeId: f }, false)) manyOk += 1;
  check('débit : quota par cadre, plafond pour l’ensemble des iframes, le cadre principal garde le sien', adOk === 40 && topOk && manyOk <= 400 && X.allowed(fake, { frameTreeNodeId: 1 }, true), JSON.stringify([adOk, topOk, manyOk]));
  const r4 = sub('r4');
  passwords.save('default', { origin: r4, username: 'tess', password: 'pw-tess' });
  const flood = page('r4pub', '<input id="u" name="username" autocomplete="username"><input id="p" type="password"><script>setInterval(() => { for (let i = 0; i < 40; i++) document.getElementById("u").dispatchEvent(new FocusEvent("focusin", { bubbles: true })); }, 100);</script>');
  wcH = await open(page('r4', `<input id="u" name="username" autocomplete="username"><input id="p" type="password"><br><iframe src="${flood}" style="width:300px;height:80px"></iframe>`));
  await sleep(800);
  await clickUntil(wcH, '#u', () => pickShown(wcH, '.acc.exact'), 'liste malgré l’iframe bavard');
  check('hostile : un iframe publicitaire qui inonde de faux événements ne coupe pas le gestionnaire pour la page', true);
  const h1 = ov().picker.getBounds().height;

  // 5. La liste : geste réel exigé, champ réellement visible, ne survit pas à la navigation.
  passwords.save('default', { origin: r4, username: 'tess2', password: 'pw-tess2' });
  await js(wcH, 'document.activeElement.blur(); 1');
  await until(() => !ov().pick, 'liste refermée');
  await clickUntil(wcH, '#u', () => pickShown(wcH, '.acc.exact'), 'liste rouverte');
  check('la liste garde la même hauteur quel que soit le nombre de comptes', ov().picker.getBounds().height === h1 && (await pickItems()).filter((i) => i.startsWith('exact:')).length === 2);
  await ov().picker.webContents.executeJavaScript('document.querySelector(".acc.exact").click(); 1');
  await sleep(250);
  check('la liste ignore un clic tombé dans la demi-seconde qui suit son apparition', (await value(wcH, '#u')) === '' && (await value(wcH, '#p')) === '' && !!ov().pick);
  await go(wcH, page('r4b', '<h1>autre site, sans champ</h1>'));
  await sleep(300);
  check('hostile : la liste ouverte disparaît dès que la page navigue', !ov().pick && !attached() && !focusSeen(wcH));
  const r5 = sub('r5');
  passwords.save('default', { origin: r5, username: 'uma', password: 'pw-uma' });
  wcH = await open(page('r5', '<input id="u" name="username" autocomplete="username" style="opacity:0;position:fixed;left:300px;top:200px;width:5px;height:5px"><input id="p" type="password" style="opacity:0;position:fixed;left:0;top:0;width:5px;height:5px">' + GOT));
  await js(wcH, SYN('#u'));
  await sleep(600);
  const noGesture = !ov().pick && !focusSeen(wcH);
  await go(wcH, page('r5', '<input id="u" name="username" autocomplete="username"><input id="p" type="password">' + GOT));
  await js(wcH, SYN('#u'));
  await sleep(600);
  check('hostile : focus fabriqué ou focus() sans geste de l’utilisateur, champ visible ou non : la liste ne s’ouvre pas', noGesture && !ov().pick && !focusSeen(wcH));
  await go(wcH, page('r5', '<input id="u" name="username" autocomplete="username" style="opacity:0.01;width:260px;height:40px"><input id="p" type="password" style="opacity:0.01;width:260px;height:40px">' + GOT));
  // Le clic doit réellement atteindre le champ, sinon la vérification ne prouve
  // rien. Or Chromium écarte les entrées reçues entre la fin d'une navigation et
  // la première image de la nouvelle page : un clic envoyé trop tôt est perdu
  // (vu sur les machines d'intégration macOS). On clique donc jusqu'à ce que le
  // champ ait le clavier, et l'on surveille la liste pendant tout ce temps.
  const seen = { clics: 0, liste: false, focus: false };
  const watch = () => { if (ov().pick) seen.liste = true; if (focusSeen(wcH)) seen.focus = true; };
  await until(async () => {
    watch();
    if ((await js(wcH, 'document.activeElement.id')) === 'u') return true;
    if (seen.clics === 0 || Date.now() - seen.dernier > 700) { seen.clics += 1; seen.dernier = Date.now(); await click(wcH, '#u'); }
    return false;
  }, 'champ transparent réellement cliqué');
  for (let i = 0; i < 15; i++) { await sleep(40); watch(); }
  if (seen.clics > 1) console.log(`  – champ transparent : ${seen.clics - 1} clic(s) perdu(s) avant que la page n’en reçoive un (entrées écartées juste après la navigation)`);
  const transparent = !seen.liste && !seen.focus && (await js(wcH, 'document.activeElement.id')) === 'u';
  await go(wcH, page('r5', '<input id="u" name="username" autocomplete="username"><input id="p" type="password">' + GOT));
  await clickUntil(wcH, '#u', () => pickShown(wcH, '.acc.exact'), 'liste sur un vrai clic');
  check('hostile : un champ transparent, même réellement cliqué, n’ouvre pas la liste ; un champ visible cliqué l’ouvre', transparent, JSON.stringify(seen));
  await js(wcH, 'document.activeElement.blur(); 1');
  await until(() => !ov().pick, 'liste refermée');

  // 6. Un envoi relevé ne reste pas en mémoire au-delà de son délai.
  X.limits.armedTtl = 300;
  await go(wcH, page('r5', '<div><input id="u" name="username" autocomplete="username"><input id="p" type="password"></div>'));
  await type(wcH, '#p', 'en-attente');
  enter(wcH);
  await until(() => X.states.get(wcH.id).armed, 'envoi relevé');
  await sleep(500);
  check('un envoi de formulaire non confirmé quitte la mémoire à l’échéance', X.states.get(wcH.id).armed === null && !pending(wcH));
  X.limits.armedTtl = 20e3;
  }

  // --- Mot de passe suggéré à l'inscription -----------------------------------
  const wcN = await open(sub('neuf') + '/signup');
  await type(wcN, '#mail', 'jo@exemple.fr');
  await clickUntil(wcN, '#p1', () => pickShown(wcN, '.acc.generate'), 'suggestion de mot de passe');
  await choose('.acc.generate');
  await until(async () => /^[A-Za-z2-9]{6}-[A-Za-z2-9]{6}-[A-Za-z2-9]{6}$/.test(await value(wcN, '#p1')), 'mot de passe généré');
  const gen = await value(wcN, '#p1');
  await until(() => pending(wcN), 'proposition après génération');
  check('inscription : mot de passe fort suggéré, rempli dans les deux champs, enregistrement proposé', (await value(wcN, '#p2')) === gen && pending(wcN).password === gen && pending(wcN).username === 'jo@exemple.fr' && passwords.generate() !== passwords.generate());
  await answer('save-ok');

  // --- Navigation privée -------------------------------------------------------
  const count = entries().length;
  const inc = new OrbeWindow({ incognito: true });
  const wcI = await open(A + '/login', inc);
  await type(wcI, '#user', 'alice');
  await click(wcI, '#user');
  await sleep(500);
  const noPick = !X.states.has(wcI.id) && !X.overlays.has(inc.win.id);
  await type(wcI, '#pass', 'secret-prive');
  await click(wcI, '#go');
  await until(() => wcI.getURL() === A + '/done', 'envoi en navigation privée');
  await sleep(500);
  check('navigation privée : ni liste, ni proposition, ni script de page', noPick && !X.states.has(wcI.id) && !X.overlays.has(inc.win.id) && entries().length === count && (await js(wcI, 'typeof window.__log')) === 'undefined');
  inc.win.close();
  await sleep(150);

  // --- Profils -----------------------------------------------------------------
  const m1 = await passwords.matchesFor('default', A);
  const m2 = await passwords.matchesFor('autre-profil', A);
  check('profils : les comptes d’un profil ne sont pas proposés dans un autre', m1.exact.length === 2 && m2.exact.length === 0 && m2.related.length === 0);

  // --- Fenêtre de gestion ------------------------------------------------------
  const mw = passwords.openManager();
  await until(() => mw.webContents.executeJavaScript('document.querySelectorAll("#list .line").length'), 'liste du gestionnaire');
  const dom = await mw.webContents.executeJavaScript('document.documentElement.outerHTML + JSON.stringify(state)');
  // Tous les mots de passe réellement rangés dans le coffre, tous profils confondus
  // (et non le seul préfixe « pw- » des essais, qu'un identifiant tiré au hasard
  // peut contenir) ; les très courts (« v », « y ») ne prouveraient rien.
  const secrets = [...new Set(store.state.profiles.flatMap((p) => entries(p.id).map((e) => e.password)).concat([P1, P2]))].filter((x) => typeof x === 'string' && x.length >= 6);
  const leaked = secrets.filter((x) => dom.includes(x));
  // En cas d'échec, on dit lequel des constats tombe, avec ce qui entoure le texte trouvé.
  const around = (needle) => { const i = dom.indexOf(needle); return i < 0 ? null : dom.slice(Math.max(0, i - 60), i + needle.length + 30); };
  check('gestionnaire : la liste s’affiche sans aucun mot de passe', dom.includes('alice') && secrets.length >= 8 && leaked.length === 0,
    JSON.stringify({ alice: dom.includes('alice'), lignes: (dom.match(/class="line/g) || []).length, secrets: secrets.length, fuites: leaked.map(around), 'pw-': around('pw-') }));
  const aliceId = entries().find((e) => e.username === 'alice').id;
  authAnswer = false;
  const refused = await mw.webContents.executeJavaScript(`O.send('pw:reveal', { profile: 'default', id: ${JSON.stringify(aliceId)} })`);
  authAnswer = true;
  const shown = await mw.webContents.executeJavaScript(`O.send('pw:reveal', { profile: 'default', id: ${JSON.stringify(aliceId)} })`);
  check('gestionnaire : afficher un mot de passe exige la confirmation d’identité', refused === null && shown === P1);
  const calls0 = authCalls;
  confirmAnswer = false; // l'export s'arrête à l'avertissement « en clair »
  await mw.webContents.executeJavaScript(`O.send('pw:reveal', { profile: 'default', id: ${JSON.stringify(aliceId)} })`);
  const afterReveal = authCalls;
  await mw.webContents.executeJavaScript("O.send('pw:export', { profile: 'default' })");
  await mw.webContents.executeJavaScript("O.send('pw:export', { profile: 'default' })");
  check('gestionnaire : l’export redemande toujours la confirmation d’identité (pas de délai de grâce)', afterReveal === calls0 && authCalls === calls0 + 2, JSON.stringify([calls0, afterReveal, authCalls]));
  const fromShell = await w.ui.webContents.executeJavaScript(`Promise.all([orbe.send('pw:state', {}), orbe.send('pw:reveal', { id: ${JSON.stringify(aliceId)} }), orbe.send('pw:export', {})])`);
  check('les autres vues d’Orbe ne peuvent ni lister ni afficher les mots de passe', fromShell.every((r) => r === undefined));
  const edited = await mw.webContents.executeJavaScript(`O.send('pw:save', { profile: 'default', id: ${JSON.stringify(aliceId)}, username: 'alice2', password: '' })`);
  check('gestionnaire : modifier l’identifiant garde le mot de passe', edited.entries.some((e) => e.username === 'alice2') && entries().find((e) => e.id === aliceId).password === P1);
  const afterDelete = await mw.webContents.executeJavaScript(`O.send('pw:delete', { profile: 'default', id: ${JSON.stringify(aliceId)} })`);
  check('gestionnaire : supprimer un compte', !afterDelete.entries.some((e) => e.id === aliceId) && !entries().some((e) => e.id === aliceId));
  passwords.setNever('default', B, true);
  const afterNever = await mw.webContents.executeJavaScript(`O.send('pw:neverRemove', { profile: 'default', origin: ${JSON.stringify(B)} })`);
  check('gestionnaire : retirer un site de la liste « jamais »', afterNever.never.length === 0);

  // Presse-papiers (celui de la machine est restauré ensuite)
  const previous = await clipboard.readText().catch(() => '');
  const previousItems = await clipboard.read().catch(() => null); // images comprises
  await X.copySecret('copie-factice');
  const copied = (await clipboard.readText()) === 'copie-factice';
  await X.clearClipboardIfOurs();
  const cleared = (await clipboard.readText()) === '';
  await X.copySecret('copie-factice');
  await clipboard.writeText('autre chose');
  await X.clearClipboardIfOurs();
  check('presse-papiers : vidé à l’échéance s’il contient encore le mot de passe, laissé sinon', copied && cleared && (await clipboard.readText()) === 'autre chose');
  if (previousItems && previousItems.length) await clipboard.write(previousItems).catch(() => clipboard.writeText(previous));
  else await clipboard.writeText(previous);
  mw.close();

  // --- Import et export CSV ----------------------------------------------------
  const icloud = 'Title,URL,Username,Password,Notes,OTPAuth\r\n'
    + 'Exemple,https://exemple.fr/connexion,"moi, toujours","a""b,c","note sur\ndeux lignes",otpauth://totp/x?secret=ABC\r\n'
    + 'Sans schéma,autre.exemple.fr,+33600000000,=1+1,,\r\n'
    + 'Appli,android://com.exemple/,x,y,,\r\n'
    + 'Vide,https://vide.exemple.fr,x,,,\r\n';
  const r1 = passwords.importCsv('csv', icloud);
  const csvEntries = X.bucket('csv').entries;
  const e1 = csvEntries.find((e) => e.origin === 'https://exemple.fr');
  check('import CSV (format Safari / iCloud) : guillemets, virgules, retours à la ligne, lignes inutilisables ignorées',
    r1 && r1.created === 2 && r1.skipped === 2 && e1 && e1.username === 'moi, toujours' && e1.password === 'a"b,c' && e1.note === 'note sur\ndeux lignes' && e1.otpAuth.startsWith('otpauth://')
    && csvEntries.some((e) => e.origin === 'https://autre.exemple.fr' && e.username === '+33600000000' && e.password === '=1+1'));
  const r2 = passwords.importCsv('csv', 'name,url,username,password,note\nChrome,https://chrome.exemple.fr/,u,p,\nExemple,https://exemple.fr/,"moi, toujours",nouveau,\n');
  check('import CSV (format Chrome) : ajout et mise à jour sans doublon', r2 && r2.created === 1 && r2.updated === 1 && csvEntries.length === 3 && e1.password === 'nouveau');
  const out = passwords.exportCsv('csv');
  passwords.importCsv('csv2', out);
  const strip = (list) => JSON.stringify(list.map((e) => [e.origin, e.username, e.password, e.title, e.note, e.otpAuth]).sort());
  check('export CSV puis réimport : aller-retour fidèle', out.startsWith('Title,URL,Username,Password,Notes,OTPAuth\r\n') && strip(X.bucket('csv2').entries) === strip(csvEntries));
  check('import CSV : fichier sans les colonnes attendues refusé', passwords.importCsv('csv', 'a,b\n1,2\n') === null && passwords.importCsv('csv', '') === null);
  passwords.forgetProfile('csv');
  passwords.forgetProfile('csv2');

  // --- Coffre : relecture et fichier abîmé ------------------------------------
  const reopen = () => { X.vault.status = 'closed'; X.vault.data = null; return X.open(); };
  const snapshot = strip(entries());
  check('coffre : relu et déchiffré à l’identique', reopen() && strip(entries()) === snapshot && !fs.readFileSync(file, 'latin1').includes('pw-'));
  const good = fs.readFileSync(file);
  const goodBak = fs.existsSync(file + '.bak') ? fs.readFileSync(file + '.bak') : null;
  fs.writeFileSync(file, '{"orbe":"passwords","version":1,"data":"AAAA"}');
  check('coffre : fichier abîmé, la copie de secours prend le relais', reopen() && entries().length > 0);
  fs.writeFileSync(file + '.bak', 'illisible');
  const opens = reopen();
  const refusedSave = passwords.save('default', { origin: A, username: 'k', password: 'v' });
  check('coffre illisible : rien n’est écrit par-dessus', !opens && passwords.status() === 'error' && refusedSave === null && fs.readFileSync(file, 'utf8').includes('"AAAA"'));
  fs.writeFileSync(file, good);
  if (goodBak) fs.writeFileSync(file + '.bak', goodBak); else fs.unlinkSync(file + '.bak');
  check('coffre : de nouveau lisible une fois le fichier rétabli', reopen() && strip(entries()) === snapshot);

  // Ménage : onglets fermés, réglages et crochets rétablis.
  for (const [owner, id] of opened) if (owner === w && w.data.tabs[id]) w.close(id, { silent: true });
  Object.assign(passwords.hooks, saved);
  server.close();
  if (standalone) {
    console.log(`\n${total - failed}/${total} vérifications réussies\n`);
    if (failed) throw new Error(`${failed} vérification(s) en échec`);
  }
};
