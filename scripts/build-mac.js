#!/usr/bin/env node
// Fabrique Orbe.app pour macOS, sans dépendance : copie le moteur Electron,
// le renomme, y place le code d'Orbe et signe le tout localement.
//
//   npm run build               -> ~/.orbe-dev/dist/Orbe.app
//   npm run build -- --install  -> copie aussi dans /Applications
//   npm run build -- --icon     -> régénère d'abord l'icône depuis le SVG
//   npm run build -- --fuses    -> relit seulement les fusibles de l'application fabriquée
//
// La fabrication se fait sur le disque local : une application ne peut pas
// être signée ni lancée depuis un disque réseau.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dev = require('./dev');
const { cutFuses, checkFuses } = require('./fuses');

const pkg = require('../package.json');
const root = dev.root;
const args = process.argv.slice(2);
const out = path.join(dev.runtime, 'dist');
const appPath = path.join(out, 'Orbe.app');
const contents = path.join(appPath, 'Contents');
const plist = path.join(contents, 'Info.plist');
const run = (cmd, a, opts) => execFileSync(cmd, a, { stdio: 'pipe', ...opts });

function plutil(key, type, value) {
  try { run('plutil', ['-replace', key, type, value, plist]); } catch { run('plutil', ['-insert', key, type, value, plist]); }
}

function makeIcon(cli) {
  const png = path.join(root, 'assets', 'icon.png');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-icon-'));
  const tmpPng = path.join(tmp, 'icon.png');
  run(process.execPath, [cli, path.join(root, 'scripts', 'make-icon.js'), tmpPng]);
  const set = path.join(tmp, 'orbe.iconset');
  fs.mkdirSync(set);
  for (const size of [16, 32, 128, 256, 512]) {
    run('sips', ['-z', String(size), String(size), tmpPng, '--out', path.join(set, `icon_${size}x${size}.png`)]);
    run('sips', ['-z', String(size * 2), String(size * 2), tmpPng, '--out', path.join(set, `icon_${size}x${size}@2x.png`)]);
  }
  run('iconutil', ['-c', 'icns', set, '-o', path.join(tmp, 'orbe.icns')]);
  fs.copyFileSync(tmpPng, png);
  fs.copyFileSync(path.join(tmp, 'orbe.icns'), path.join(root, 'assets', 'orbe.icns'));
  console.log('Icône régénérée.');
}

// Fusibles d'Electron (scripts/fuses.js) : coupés avant la signature.
const framework = path.join(contents, 'Frameworks', 'Electron Framework.framework', 'Versions', 'A', 'Electron Framework');
if (args.includes('--fuses')) {
  // Relecture seule de l'application déjà fabriquée.
  checkFuses(framework);
  process.exit(0);
}

const cli = dev.ensure();
if (args.includes('--icon') || !fs.existsSync(path.join(root, 'assets', 'orbe.icns'))) makeIcon(cli);

const electronApp = path.join(dev.runtime, 'node_modules', 'electron', 'dist', 'Electron.app');
if (!fs.existsSync(electronApp)) run(process.execPath, [cli, '--version']);

console.log('Copie du moteur…');
fs.rmSync(appPath, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
run('ditto', [electronApp, appPath]);
fs.renameSync(path.join(contents, 'MacOS', 'Electron'), path.join(contents, 'MacOS', 'Orbe'));

console.log('Installation du code d’Orbe…');
const resources = path.join(contents, 'Resources');
fs.rmSync(path.join(resources, 'default_app.asar'), { force: true });
fs.rmSync(path.join(resources, 'electron.icns'), { force: true });
const target = path.join(resources, 'app');
fs.mkdirSync(target);
fs.cpSync(path.join(root, 'src'), path.join(target, 'src'), { recursive: true });
fs.copyFileSync(path.join(root, 'package.json'), path.join(target, 'package.json'));
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(target, 'LICENSE'));
fs.mkdirSync(path.join(target, 'assets'));
fs.copyFileSync(path.join(root, 'assets', 'blocklist.txt'), path.join(target, 'assets', 'blocklist.txt'));
fs.copyFileSync(path.join(root, 'assets', 'orbe.icns'), path.join(resources, 'orbe.icns'));

plutil('CFBundleName', '-string', 'Orbe');
plutil('CFBundleDisplayName', '-string', 'Orbe');
plutil('CFBundleExecutable', '-string', 'Orbe');
plutil('CFBundleIdentifier', '-string', 'org.pixework.orbe');
plutil('CFBundleIconFile', '-string', 'orbe.icns');
plutil('CFBundleShortVersionString', '-string', pkg.version);
plutil('CFBundleVersion', '-string', pkg.version);
plutil('LSApplicationCategoryType', '-string', 'public.app-category.productivity');
plutil('NSHumanReadableCopyright', '-string', 'Logiciel libre — licence MIT');
plutil('NSCameraUsageDescription', '-string', 'Un site web ouvert dans Orbe demande à utiliser la caméra.');
plutil('NSMicrophoneUsageDescription', '-string', 'Un site web ouvert dans Orbe demande à utiliser le micro.');
plutil('NSLocationUsageDescription', '-string', 'Un site web ouvert dans Orbe demande ta position.');
// Déclare Orbe comme navigateur web (liens http/https et fichiers HTML).
plutil('CFBundleURLTypes', '-json', JSON.stringify([{ CFBundleURLName: 'Web', CFBundleTypeRole: 'Viewer', CFBundleURLSchemes: ['http', 'https'] }]));
// Handoff : reprendre ici une page ouverte sur un autre appareil (événement « continue-activity »).
plutil('NSUserActivityTypes', '-json', JSON.stringify(['NSUserActivityTypeBrowsingWeb']));
plutil('CFBundleDocumentTypes', '-json', JSON.stringify([{ CFBundleTypeName: 'Document HTML', CFBundleTypeRole: 'Viewer', LSItemContentTypes: ['public.html', 'public.xhtml'] }]));

cutFuses(framework);

console.log('Signature locale…');
run('xattr', ['-cr', appPath]);
// Moteur avec Widevine : la signature VMP (compte EVS de castlabs) se fait
// après toute modification de l'application et avant la signature de code.
// Sans elle, les flux de test se lisent mais les services commerciaux refusent.
if (dev.drm && process.env.ORBE_EVS) {
  console.log('Signature VMP (EVS)…');
  run('python3', ['-m', 'castlabs_evs.vmp', 'sign-pkg', out]);
}
run('codesign', ['--force', '--deep', '--sign', '-', appPath]);
checkFuses(framework);
console.log('Application prête : ' + appPath);

if (args.includes('--install')) {
  const dest = '/Applications/Orbe.app';
  fs.rmSync(dest, { recursive: true, force: true });
  run('ditto', [appPath, dest]);
  console.log('Installée dans ' + dest);
}
