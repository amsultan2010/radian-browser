#!/usr/bin/env node
// Mesures de vitesse et de mémoire d'Orbe (voir docs/suivi/ameliorations.md).
//   node scripts/mesures.js <mesure> [--tours 8] [--variante <nom>]… [--arbre <dossier>]… [--app <Orbe.app>] [--avec "--drapeau=…"] [--historique 8500] [--onglets 300] [--espaces 13] [--profils 10] [--pause 0] [--naturel 1] [--visible 1]
// Mesures : demarrage, modale, coque, memoire, navigation, commande, etat, voisins, gestes, repos (tests/mesures.js).
// --espaces / --profils : les onglets du profil sont répartis dans autant d'Espaces et de profils
// (forme d'un vrai profil ancien). --naturel 1 : sans le drapeau qui empêche Chromium de mettre
// au ralenti une fenêtre recouverte (pour mesurer justement ce ralenti).
// Sur macOS les fenêtres mesurées sont invisibles et ne prennent ni le clavier ni la souris
// (tests/discret.js, comme les essais) ; --visible 1 : fenêtres visibles (mais qui ne prennent
// toujours pas le clavier), pour les mesures qui en dépendent (fenêtre réellement recouverte)
// ou pour comparer ; --compare-visible 1 : les deux, en alternance. Une application empaquetée
// (--app) ne charge pas ce module : ses fenêtres restent visibles.
// --variante <nom> (mesure « repos ») : chaque cible est doublée d'une jumelle par variante de
// tests/mesures.js (VARIANTES : une animation posée dans la coque, sans translucidité, etc.),
// toutes en alternance ; la période mesurée est alors « variante ».
// Plusieurs --arbre (ou --app) : les lancements alternent (A, B, A, B…) pour annuler
// la dérive d'une machine chargée ; la médiane de chaque valeur est affichée avec
// la charge moyenne relevée. Les profils sont temporaires, jamais le vrai.
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { ensure, root } = require('./dev');

const args = process.argv.slice(2);
const bench = args[0] && !args[0].startsWith('--') ? args.shift() : 'demarrage';
const opt = (name, def) => { const out = []; for (let i = 0; i < args.length; i++) if (args[i] === '--' + name) out.push(args[i + 1]); return out.length ? out : def; };
const rounds = Number(opt('tours', [8])[0]);
const pause = Number(opt('pause', [0])[0]);
const history = Number(opt('historique', [0])[0]);
const tabs = Number(opt('onglets', [0])[0]);
const spaces = Number(opt('espaces', [0])[0]);
const profiles = Number(opt('profils', [0])[0]);
const natural = !!Number(opt('naturel', [0])[0]);
const shown = !!Number(opt('visible', [0])[0]);
const targets = [
  ...opt('arbre', []).map((dir) => ({ name: path.basename(path.resolve(dir)), dir: path.resolve(dir) })),
  ...opt('app', []).map((p) => ({ name: path.basename(p), app: path.resolve(p) })),
];
if (!targets.length) targets.push({ name: 'sources', dir: root });
if (shown) for (const t of targets) t.visible = true;
// --compare-visible 1 : chaque cible est doublée d'une jumelle aux fenêtres visibles (tours alternés).
if (Number(opt('compare-visible', [0])[0])) for (const t of targets.filter((x) => !x.visible)) targets.push({ ...t, name: t.name + ' visible', visible: true });
// --avec "<drapeaux de Chromium>" : chaque cible est doublée d'une jumelle lancée avec ces drapeaux.
for (const flags of opt('avec', [])) {
  for (const t of targets.filter((x) => !x.extra)) targets.push({ ...t, name: t.name + ' ' + flags.replace(/^--/, ''), extra: flags.split(/\s+/).filter(Boolean) });
}

// --variante <nom> : jumelles par variante ; la cible d'origine ne sert alors plus.
const variants = opt('variante', []);
if (variants.length) {
  const bases = targets.splice(0);
  for (const t of bases) for (const v of variants) targets.push({ ...t, name: (bases.length > 1 ? t.name + ' ' : '') + v, env: { ORBE_BENCH_VARIANTE: v, ORBE_BENCH_PERIODES: 'variante' } });
}

function wav(seconds = 60) {
  const rate = 8000;
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(40 * Math.sin((2 * Math.PI * 220 * i) / rate)), 44 + i * 2);
  return buf;
}

function serve() {
  const sound = wav();
  const page = (title, body) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px sans-serif">${body}</body>`;
  const form = '<form action="/leger" method="post"><input name="login" autocomplete="username"><input type="password" name="pass"><button>Connexion</button></form>';
  const px = Buffer.from('R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', 'base64');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    res.setHeader('content-type', 'text/html; charset=utf-8');
    if (url.pathname === '/leger') return res.end(page('Léger', '<h1>Bonjour</h1><p>Une page légère.</p>'));
    if (url.pathname === '/cadre') return res.end(page('Cadre', form));
    if (url.pathname === '/cadres') return res.end(page('Cadres', Array.from({ length: 12 }, (_, i) => `<iframe src="/cadre?i=${i}" width="200" height="90"></iframe>`).join('')));
    if (url.pathname === '/ressources') return res.end(page('Ressources', Array.from({ length: 150 }, (_, i) => `<img src="/px?i=${i}&n=${url.searchParams.get('n')}" width="4" height="4">`).join('')));
    // Onglet lourd : 800 cartes et 200 000 objets ; « travail=N » : N ms de calcul toutes les secondes
    // (une application qui traite ce qui lui arrive du réseau). Témoin : page légère, même site.
    if (url.pathname === '/lourd') {
      const work = Number(url.searchParams.get('travail')) || 0;
      return res.end(page('Lourd ' + url.searchParams.get('i'), `<div id="c"></div><script>
        const c = document.getElementById('c');
        for (let i = 0; i < 800; i++) { const d = document.createElement('div'); d.style.cssText = 'display:inline-block;width:120px;height:60px;margin:4px;border:1px solid #ccc'; d.textContent = 'Carte ' + i; c.append(d); }
        window.objets = Array.from({ length: 200000 }, (_, i) => ({ i, nom: 'objet ' + i, t: [i, i + 1] }));
        if (${work}) setInterval(() => { const fin = performance.now() + ${work}; let x = 0; while (performance.now() < fin) x += Math.sqrt(x + 1); window.x = x; }, 1000);
      </script>`));
    }
    if (url.pathname === '/temoin') return res.end(page('Témoin', '<h1>Témoin</h1><p id="p">0</p><script>let n = 0; const p = document.getElementById("p"); const f = () => { p.textContent = String(n += 1); requestAnimationFrame(f); }; requestAnimationFrame(f);</script>'));
    // Un son quasi inaudible (−58 dB) qui tourne en boucle : l'onglet compte comme « audible ».
    if (url.pathname === '/son.wav') { res.setHeader('content-type', 'audio/wav'); res.setHeader('accept-ranges', 'bytes'); res.setHeader('content-length', sound.length); return res.end(sound); }
    if (url.pathname === '/piste') return res.end(page('Piste', '<audio id="a" src="/son.wav" loop></audio><h1>Piste</h1><script>window.start = async () => { navigator.mediaSession.metadata = new MediaMetadata({ title: "Un morceau au titre nettement plus long que la barre latérale", artist: "Artiste" }); await document.getElementById("a").play(); return true; };</script>'));
    if (url.pathname === '/px') { res.setHeader('content-type', 'image/gif'); return res.end(px); }
    res.statusCode = 404;
    return res.end(page('404', ''));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Fenêtre recouverte par une autre (machine partagée) : sans cela Chromium ralentit ses minuteries.
const SWITCHES = natural ? [] : ['--disable-backgrounding-occluded-windows'];

function launch(target, env) {
  const scenario = path.join(root, 'tests', 'mesures.js');
  const base = { ...process.env, ORBE_SCENARIO: scenario, ...env, ...(target.env || {}) };
  if (target.visible) base.ORBE_TEST_VISIBLE = 'inactif'; else delete base.ORBE_TEST_VISIBLE;
  delete base.ORBE_UI_FOCUS;
  // Le module vient de cet arbre-ci : les versions anciennes mesurées ne l'ont pas.
  const discreet = process.platform === 'darwin' && !process.env.CI ? ['-r', path.join(root, 'tests', 'discret.js')] : [];
  const child = target.app
    ? spawn(path.join(target.app, 'Contents', 'MacOS', 'Orbe'), ['--selftest', '--orbe-test', ...SWITCHES, ...(target.extra || [])], { env: base })
    : spawn(process.execPath, [ensure(), ...discreet, target.dir, '--selftest', ...SWITCHES, ...(target.extra || [])], { env: base });
  let text = '';
  child.stdout.on('data', (d) => { text += d; });
  child.stderr.on('data', (d) => { text += d; });
  return new Promise((resolve) => child.on('exit', (code) => {
    const line = text.split('\n').find((l) => l.startsWith('MESURE '));
    if (!line) console.error(`[${target.name}] sans mesure (code ${code})\n${text.slice(-1600)}`);
    // Animations encore en cours à la fin d'une période : dites une fois par cible.
    const anims = [...new Set(text.split('\n').filter((l) => l.startsWith('ANIMATIONS ')))];
    if (anims.length) target.anims = anims.map((l) => l.slice(11)).join(' | ');
    const extra = text.split('\n').find((l) => l.startsWith('FICHIERS '));
    if (extra) target.files = extra.slice(9);
    resolve(line ? JSON.parse(line.slice(7)) : null);
  }));
}

function flatten(o, prefix = '', into = {}) {
  for (const [k, v] of Object.entries(o || {})) {
    if (v && typeof v === 'object') flatten(v, prefix + k + '.', into);
    else if (typeof v === 'number') into[prefix + k] = v;
  }
  return into;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-mesures-'));
  for (const t of targets) {
    t.profile = path.join(tmp, t.name + '-' + targets.indexOf(t));
    t.runs = [];
    await launch(t, { ORBE_BENCH: 'prepare', ORBE_BENCH_BASE: base, ORBE_USER_DATA: t.profile, ORBE_BENCH_HISTORY: String(history), ORBE_BENCH_TABS: String(tabs), ORBE_BENCH_SPACES: String(spaces), ORBE_BENCH_PROFILES: String(profiles) });
  }
  for (let i = 0; i < rounds; i++) {
    for (const t of targets) {
      if (pause) await sleep(pause * 1000);
      const r = await launch(t, { ORBE_BENCH: bench, ORBE_BENCH_BASE: base, ORBE_USER_DATA: t.profile });
      if (r) t.runs.push(flatten(r));
    }
  }
  server.close();
  const keys = [...new Set(targets.flatMap((t) => t.runs.flatMap((r) => Object.keys(r))))];
  console.log(`\n${bench} — ${rounds} tours${pause ? `, ${pause} s de pause` : ''}${history ? `, ${history} visites` : ''}${tabs ? `, ${tabs} onglets` : ''}${spaces ? `, ${spaces} Espaces` : ''}${profiles ? `, ${profiles} profils` : ''}${natural ? ', fenêtre laissée à Chromium' : ''} — médianes (min–max)`);
  console.log(['mesure'.padEnd(28), ...targets.map((t) => t.name.padStart(26))].join(''));
  for (const k of keys) {
    const cells = targets.map((t) => {
      const v = t.runs.map((r) => r[k]).filter((x) => typeof x === 'number');
      return (v.length ? `${median(v)} (${Math.min(...v)}–${Math.max(...v)})` : '—').padStart(26);
    });
    console.log([k.padEnd(28), ...cells].join(''));
  }
  for (const t of targets) if (t.anims) console.log(`\nAnimations en cours en fin de période (dernier tour, ${t.name}) : ${t.anims}`);
  for (const t of targets) if (t.files) console.log(`\nFichiers du profil réécrits (dernier tour, ${t.name}) : ${t.files}`);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
})();
