#!/usr/bin/env node
// Fabrique Orbe pour Windows, sans dépendance : copie le moteur Electron, le
// renomme, y place le code d'Orbe, coupe les fusibles, inscrit l'icône et les
// informations de version dans Orbe.exe, puis en fait une archive zip.
//
//   node scripts/build-win.js          -> <runtime>/dist/Orbe/Orbe.exe
//                                         <runtime>/dist/Orbe-<version>-windows-x64.zip
//   node scripts/build-win.js --icon   -> régénère d'abord assets/orbe.ico
//   node scripts/build-win.js --fuses  -> relit seulement les fusibles de l'application fabriquée
//
// À lancer sous Windows (le moteur installé doit être celui de Windows).
// ORBE_WIN_DIST=<dossier> : moteur Windows déjà décompressé, pour fabriquer
// depuis un autre système (l'archive « electron-v…-win32-x64.zip »).
//
// L'archive contient un dossier « Orbe » : Orbe.exe et LISEZMOI.txt. Rien
// n'est signé : Windows SmartScreen prévient au premier lancement.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dev = require('./dev');
const { makeIco, decodePng } = require('./make-ico');
const { cutFuses, checkFuses } = require('./fuses');
const peResources = require('./pe-resources');

const pkg = require('../package.json');
const root = dev.root;
const args = process.argv.slice(2);
const arch = process.env.ORBE_WIN_ARCH || (process.arch === 'arm64' && process.platform === 'win32' ? 'arm64' : 'x64');
const name = 'Orbe';
const zipName = `Orbe-${pkg.version}-windows-${arch}.zip`;
const out = path.join(dev.runtime, 'dist');
const appDir = path.join(out, name);
const exe = path.join(appDir, 'Orbe.exe');
const ico = path.join(root, 'assets', 'orbe.ico');

if (args.includes('--fuses')) {
  // Relecture seule de l'application déjà fabriquée.
  checkFuses(exe);
  process.exit(0);
}

if (args.includes('--icon') || !fs.existsSync(ico)) {
  makeIco(path.join(root, 'assets', 'icon.png'), ico);
  console.log('Icône régénérée.');
}

let dist = process.env.ORBE_WIN_DIST;
if (!dist) {
  const cli = dev.ensure();
  dist = path.join(dev.runtime, 'node_modules', 'electron', 'dist');
  if (!fs.existsSync(path.join(dist, 'electron.exe'))) {
    // Le téléchargement du moteur a pu être différé : un lancement à vide le déclenche.
    try { execFileSync(process.execPath, [cli, '--version'], { stdio: 'pipe' }); } catch {}
  }
}
if (!fs.existsSync(path.join(dist, 'electron.exe'))) {
  console.error(`Moteur Windows introuvable dans ${dist}. Ce script se lance sous Windows (ou avec ORBE_WIN_DIST).`);
  process.exit(1);
}

console.log('Copie du moteur…');
fs.rmSync(appDir, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(dist, appDir, { recursive: true });
fs.renameSync(path.join(appDir, 'electron.exe'), exe);

console.log('Installation du code d’Orbe…');
const resources = path.join(appDir, 'resources');
fs.rmSync(path.join(resources, 'default_app.asar'), { force: true });
const target = path.join(resources, 'app');
fs.mkdirSync(path.join(target, 'assets'), { recursive: true });
fs.cpSync(path.join(root, 'src'), path.join(target, 'src'), { recursive: true });
for (const f of ['package.json', 'LICENSE']) fs.copyFileSync(path.join(root, f), path.join(target, f));
for (const f of ['blocklist.txt', 'orbe.ico']) fs.copyFileSync(path.join(root, 'assets', f), path.join(target, 'assets', f));

// Fusibles d'Electron (scripts/fuses.js) : sous Windows, la table est dans Orbe.exe.
cutFuses(exe);

// Icône et informations de version inscrites dans Orbe.exe (scripts/pe-resources.js) :
// ce que montrent l'Explorateur, la barre des tâches et les propriétés du fichier.
console.log('Icône et informations de version…');
peResources.edit(exe, {
  icon: ico,
  decodePng,
  version: {
    ProductName: 'Orbe',
    FileDescription: 'Orbe',
    CompanyName: 'PIXEWORK',
    FileVersion: pkg.version,
    ProductVersion: pkg.version,
    OriginalFilename: 'Orbe.exe',
    InternalName: 'Orbe',
    LegalCopyright: 'Logiciel libre — licence MIT',
    // Marque posée par Electron pour l'installateur Squirrel, sans objet ici.
    SquirrelAwareVersion: null,
  },
});
checkFuses(exe);

// Notice : UTF-8 avec marque d'ordre et fins de ligne de Windows, pour le Bloc-notes.
const notice = fs.readFileSync(path.join(__dirname, 'LISEZMOI-windows.txt'), 'utf8').replace(/\{version\}/g, pkg.version);
fs.writeFileSync(path.join(appDir, 'LISEZMOI.txt'), '﻿' + notice.replace(/\r?\n/g, '\r\n'));
console.log('Application prête : ' + exe);

// Archive : « tar » de Windows 10 et suivants (bsdtar) sait écrire du zip.
const zip = path.join(out, zipName);
fs.rmSync(zip, { force: true });
try {
  if (process.platform === 'win32') execFileSync('tar.exe', ['-a', '-c', '-f', zip, name], { cwd: out, stdio: 'inherit' });
  else execFileSync('zip', ['-qr', zip, name], { cwd: out, stdio: 'inherit' });
  console.log('Archive : ' + zip);
} catch (err) {
  console.error('Archive non créée : ' + err.message);
  process.exitCode = 1;
}
