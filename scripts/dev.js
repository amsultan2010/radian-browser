#!/usr/bin/env node
// Lance Orbe en développement.
// Le moteur (Electron) est installé une fois dans ~/.orbe-dev, hors du projet :
// le dépôt reste léger et fonctionne aussi depuis un disque réseau, où les
// exécutables ne peuvent pas être lancés.
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
// ORBE_DRM=1 : moteur castlabs (Electron avec Widevine), pour lire les vidéos
// protégées. Il suit Electron avec un peu de retard : ce n'est pas le défaut.
const drm = !!process.env.ORBE_DRM;
const conf = require('../package.json').orbe;
const version = drm ? conf.electronDrm : conf.electron;
const runtime = process.env.ORBE_RUNTIME || path.join(os.homedir(), drm ? '.orbe-dev-drm' : '.orbe-dev');
const spec = drm ? `https://github.com/castlabs/electron-releases#v${version}` : `electron@${version}`;
const pkg = path.join(runtime, 'node_modules', 'electron', 'package.json');

function installed() {
  try { return JSON.parse(fs.readFileSync(pkg, 'utf8')).version; } catch { return null; }
}

// Sous Windows, npm est un script « npm.cmd » : il lui faut un interpréteur.
function npm(args, cwd) {
  execFileSync('npm', args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
}

function ensure() {
  if (installed() !== version) {
    console.log(`Installation d'Electron ${version} dans ${runtime}…`);
    fs.mkdirSync(runtime, { recursive: true });
    const manifest = path.join(runtime, 'package.json');
    if (!fs.existsSync(manifest)) fs.writeFileSync(manifest, '{"name":"orbe-runtime","private":true}\n');
    npm(['install', spec, '--no-audit', '--no-fund'], runtime);
  }
  return path.join(runtime, 'node_modules', 'electron', 'cli.js');
}

// --- Essais surveillés ----------------------------------------------------------
// En mode test, le processus principal récrit deux fois par seconde un fichier
// (« battement », src/main/test-guard.js). Tant qu'il bat, c'est à lui de dire
// ce qui bloque. S'il s'arrête, le fil principal est figé dans du code natif et
// plus aucun minuteur n'y tourne : c'est d'ici, de l'extérieur, que l'on relève
// ce qui se voit (fenêtres, boîte modale, piles d'appels) avant d'arrêter l'essai.
function nativeDiagnostic(pid) {
  const shots = process.env.ORBE_SHOTS || '';
  const run = (cmd, args, timeout) => {
    try { return execFileSync(cmd, args, { encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (err) { return `${(err && err.stdout) || ''}\n(${cmd} : ${err.message.split('\n')[0]})`; }
  };
  if (process.platform === 'win32') {
    return run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'diagnostic-win.ps1'), '-ProcessId', String(pid), '-Out', shots], 12 * 60e3);
  }
  if (process.platform === 'darwin') {
    // `sample` : piles d'appels de tous les fils, relevées pendant deux secondes.
    const out = run('/usr/bin/sample', [String(pid), '2', '-mayDie'], 60e3);
    const from = out.indexOf('Call graph:');
    return (from >= 0 ? out.slice(from) : out).split('\n').slice(0, 220).join('\n');
  }
  return run('ps', ['-o', 'pid,stat,wchan:32,cmd', '-p', String(pid)], 10e3);
}

function killTree(child) {
  if (process.platform === 'win32') { try { execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} }
  try { child.kill('SIGKILL'); } catch {}
}

// Lance Orbe en mode test et le surveille. Renvoie le processus.
function supervise(args, env = process.env) {
  ensure();
  const exe = require(path.join(runtime, 'node_modules', 'electron'));
  const beat = path.join(os.tmpdir(), `orbe-battement-${process.pid}-${Date.now()}.txt`);
  const frozen = (Number(process.env.ORBE_TEST_FROZEN) || 30) * 1000;
  // Sur macOS, hors intégration continue, les fenêtres d'essai sont invisibles et
  // ne prennent ni le clavier ni la souris (tests/discret.js ; ORBE_TEST_VISIBLE=1
  // pour les voir).
  const discret = process.platform === 'darwin' && !env.CI ? ['-r', path.join(root, 'tests', 'discret.js')] : [];
  const child = spawn(exe, [...discret, root, ...args], { stdio: 'inherit', env: { ...env, ORBE_HEARTBEAT: beat } });
  const started = Date.now();
  let over = false;
  let at = 0; // dernier battement lu
  let last = '';
  const watch = setInterval(() => {
    if (over) return;
    // Une lecture peut tomber pendant la réécriture du fichier (vide un instant) :
    // on garde alors le dernier battement connu.
    try { const [t, l] = fs.readFileSync(beat, 'utf8').split('\n'); if (Number(t) > at) { at = Number(t); last = l || ''; } } catch {}
    // Avant le premier battement (démarrage du moteur), on laisse deux minutes.
    const silent = at ? Date.now() - at : Date.now() - started - 90e3;
    if (silent < frozen) return;
    over = true;
    clearInterval(watch);
    console.error(at
      ? `\nÉCHEC : le fil principal d'Orbe ne répond plus depuis ${Math.round(silent / 1000)} s (aucun minuteur n'y tourne).\nDernière vérification : ${last}`
      : '\nÉCHEC : Orbe n’a jamais commencé à battre (démarrage figé).');
    console.error(`\nDiagnostic natif du processus ${child.pid} :\n${nativeDiagnostic(child.pid)}\n`);
    killTree(child);
    process.exit(4);
  }, 2000);
  child.on('exit', (code, signal) => {
    if (over) return;
    over = true;
    clearInterval(watch);
    try { fs.rmSync(beat, { force: true }); } catch {}
    if (signal) console.error(`\nÉCHEC : Orbe arrêté par le signal ${signal}`);
    process.exit(code == null ? 1 : code);
  });
  return child;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) supervise(args);
  else {
    const cli = ensure();
    const child = spawn(process.execPath, [cli, root, ...args], { stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code == null ? 1 : code));
  }
}

module.exports = { ensure, npm, runtime, version, root, drm, supervise };
