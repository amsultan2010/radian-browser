#!/usr/bin/env node
// Lance les tests d'interface (tests/ui) : Playwright pilote le vrai navigateur
// à la souris et au clavier.
//   node scripts/test-ui.js [filtre…]
// Comme le moteur, playwright-core est installé une fois dans ~/.orbe-dev, hors
// du projet (rien n'est ajouté au dépôt, qui peut rester sur un disque réseau).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ensure, npm, runtime, root } = require('./dev');

function ensurePlaywright() {
  const pkg = path.join(runtime, 'node_modules', 'playwright-core', 'package.json');
  if (fs.existsSync(pkg)) return;
  console.log(`Installation de playwright-core dans ${runtime}…`);
  fs.mkdirSync(runtime, { recursive: true });
  const manifest = path.join(runtime, 'package.json');
  if (!fs.existsSync(manifest)) fs.writeFileSync(manifest, '{"name":"orbe-runtime","private":true}\n');
  npm(['install', 'playwright-core', '--no-audit', '--no-fund'], runtime);
}

ensure(); // Electron
ensurePlaywright();

const child = spawn(process.execPath, [path.join(root, 'tests', 'ui', 'run.js'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ORBE_RUNTIME: runtime },
});
child.on('exit', (code) => process.exit(code == null ? 1 : code));
