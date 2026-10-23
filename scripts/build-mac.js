#!/usr/bin/env node
// Builds Radian.app for macOS with no dependencies: copies the Electron engine,
// renames it, puts Radian's code inside and signs it locally.
//
//   npm run build               -> ~/.orbe-dev/dist/Radian.app
//   npm run build -- --install  -> also copies it to /Applications
//   npm run build -- --icon     -> regenerates the icon from the SVG first
//   npm run build -- --fuses    -> only re-checks the fuses of the built app
//
// Build on a local disk: an app can't be signed or run from a network drive.
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
const appPath = path.join(out, 'Radian.app');
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
  run('iconutil', ['-c', 'icns', set, '-o', path.join(tmp, 'radian.icns')]);
  fs.copyFileSync(tmpPng, png);
  fs.copyFileSync(path.join(tmp, 'radian.icns'), path.join(root, 'assets', 'radian.icns'));
  console.log('Icon regenerated.');
}

// Electron fuses (scripts/fuses.js): cut before signing.
const framework = path.join(contents, 'Frameworks', 'Electron Framework.framework', 'Versions', 'A', 'Electron Framework');
if (args.includes('--fuses')) {
  // Only re-reads the app that is already built.
  checkFuses(framework);
  process.exit(0);
}

const cli = dev.ensure();
if (args.includes('--icon') || !fs.existsSync(path.join(root, 'assets', 'radian.icns'))) makeIcon(cli);

const electronApp = path.join(dev.runtime, 'node_modules', 'electron', 'dist', 'Electron.app');
if (!fs.existsSync(electronApp)) run(process.execPath, [cli, '--version']);

console.log('Copying the engine…');
fs.rmSync(appPath, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
run('ditto', [electronApp, appPath]);
fs.renameSync(path.join(contents, 'MacOS', 'Electron'), path.join(contents, 'MacOS', 'Radian'));

console.log('Installing Radian’s code…');
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
fs.copyFileSync(path.join(root, 'assets', 'radian.icns'), path.join(resources, 'radian.icns'));

plutil('CFBundleName', '-string', 'Radian');
plutil('CFBundleDisplayName', '-string', 'Radian');
plutil('CFBundleExecutable', '-string', 'Radian');
plutil('CFBundleIdentifier', '-string', 'com.radian.browser');
plutil('CFBundleIconFile', '-string', 'radian.icns');
plutil('CFBundleShortVersionString', '-string', pkg.version);
plutil('CFBundleVersion', '-string', pkg.version);
plutil('LSApplicationCategoryType', '-string', 'public.app-category.productivity');
plutil('NSHumanReadableCopyright', '-string', 'Free software — MIT license. Based on Orbe.');
plutil('NSCameraUsageDescription', '-string', 'A website open in Radian wants to use your camera.');
plutil('NSMicrophoneUsageDescription', '-string', 'A website open in Radian wants to use your microphone.');
plutil('NSLocationUsageDescription', '-string', 'A website open in Radian wants to know your location.');
// Declares Radian as a web browser (http/https links and HTML files).
plutil('CFBundleURLTypes', '-json', JSON.stringify([{ CFBundleURLName: 'Web', CFBundleTypeRole: 'Viewer', CFBundleURLSchemes: ['http', 'https'] }]));
// Handoff: continue here a page opened on another device ("continue-activity" event).
plutil('NSUserActivityTypes', '-json', JSON.stringify(['NSUserActivityTypeBrowsingWeb']));
plutil('CFBundleDocumentTypes', '-json', JSON.stringify([{ CFBundleTypeName: 'HTML Document', CFBundleTypeRole: 'Viewer', LSItemContentTypes: ['public.html', 'public.xhtml'] }]));

cutFuses(framework);

console.log('Signing locally…');
run('xattr', ['-cr', appPath]);
// Engine with Widevine: VMP signing (castLabs EVS account) comes after every
// change to the app and before code signing. Without it, test streams play but
// commercial services refuse.
if (dev.drm && process.env.ORBE_EVS) {
  console.log('VMP signing (EVS)…');
  run('python3', ['-m', 'castlabs_evs.vmp', 'sign-pkg', out]);
}
run('codesign', ['--force', '--deep', '--sign', '-', appPath]);
checkFuses(framework);
console.log('App ready: ' + appPath);

if (args.includes('--install')) {
  const dest = '/Applications/Radian.app';
  fs.rmSync(dest, { recursive: true, force: true });
  run('ditto', [appPath, dest]);
  console.log('Installed in ' + dest);
}
