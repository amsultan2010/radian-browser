#!/usr/bin/env node
// Vérifie l'application fabriquée pour Windows (intégration continue) :
//   node tests/win-package.js
//  1. l'archive : nom, dossier « Orbe », LISEZMOI.txt ;
//  2. les fusibles : relus dans Orbe.exe, puis à l'épreuve — ELECTRON_RUN_AS_NODE,
//     NODE_OPTIONS et --inspect ne doivent plus rien faire, alors qu'ils
//     fonctionnent avec le moteur d'origine (témoin) ;
//  3. les informations de version, relues par PowerShell ;
//  4. l'icône, extraite par Windows (System.Drawing) et comparée à assets/orbe.ico,
//     à chacune de ses sept tailles.
// Les images extraites vont dans ORBE_SHOTS (pièces jointes de l'exécution).
const { spawnSync, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dev = require('../scripts/dev');
const { fuseStates } = require('../scripts/fuses');
const peResources = require('../scripts/pe-resources');
const { decodePng, resize } = require('../scripts/make-ico');

const pkg = require('../package.json');
const root = dev.root;
const dist = path.join(dev.runtime, 'dist');
const exe = path.join(dist, 'Orbe', 'Orbe.exe');
const engine = path.join(dev.runtime, 'node_modules', 'electron', 'dist', 'electron.exe');
const zip = path.join(dist, `Orbe-${pkg.version}-windows-x64.zip`);
const probe = path.join(root, 'tests', 'win-probe.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-paquet-'));
const shots = process.env.ORBE_SHOTS || tmp;

let failed = 0;
function check(ok, label, detail = '') {
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}
const info = (label) => console.log(`     ${label}`);

// Lance un exécutable avec le scénario-sonde ; rend ce qu'il a dit et la trace laissée.
let runs = 0;
function launch(file, args, env) {
  const marker = path.join(tmp, `trace-${++runs}.txt`);
  const r = spawnSync(file, args, {
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, ORBE_SCENARIO: probe, ORBE_USER_DATA: path.join(tmp, `profil-${runs}`), ORBE_PROBE_MARKER: marker, ...env },
  });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  return { status: r.status, out, asNode: fs.existsSync(marker), asApp: /SONDE application=/.test(out), inspect: /Debugger listening on ws:/.test(out), portOpen: /inspection=ouverte/.test(out) };
}
const packaged = (args, env) => launch(exe, [...args, '--selftest', '--orbe-test'], env);
const sources = (args, env) => launch(engine, [...args, root, '--selftest'], env);

// --- 1. Archive -------------------------------------------------------------------
check(fs.existsSync(exe), 'Orbe.exe fabriqué', exe);
check(fs.existsSync(zip), 'archive nommée Orbe-<version>-windows-x64.zip', path.basename(zip));
const notice = fs.readFileSync(path.join(dist, 'Orbe', 'LISEZMOI.txt'), 'utf8');
check(/SmartScreen/.test(notice) && /%APPDATA%\\Orbe/.test(notice) && /navigateur par défaut/.test(notice) && notice.includes(pkg.version), 'LISEZMOI.txt : lancement, SmartScreen, données, navigateur par défaut');
check(notice.charCodeAt(0) === 0xfeff && /\r\n/.test(notice) && !/[^\r]\n/.test(notice), 'LISEZMOI.txt lisible par le Bloc-notes (UTF-8 avec marque, fins de ligne de Windows)');
if (process.platform === 'win32') {
  const list = execFileSync('tar.exe', ['-tf', zip], { encoding: 'utf8', maxBuffer: 1 << 26 }).split(/\r?\n/).filter(Boolean);
  check(list.every((f) => f.startsWith('Orbe/')) && list.includes('Orbe/Orbe.exe') && list.includes('Orbe/LISEZMOI.txt'), 'archive : un seul dossier « Orbe », avec Orbe.exe et LISEZMOI.txt', `${list.length} entrées`);
}

// --- 2. Fusibles ------------------------------------------------------------------
const states = fuseStates(fs.readFileSync(exe), exe);
check(states.length === 1 && states[0][0] === '0' && states[0][2] === '0' && states[0][3] === '0', 'fusibles relus dans Orbe.exe', states.join(' '));
peResources.verify(fs.readFileSync(exe));
check(true, 'Orbe.exe : sections, tailles et somme de contrôle cohérentes');

if (process.platform === 'win32') {
  // Témoin : le moteur d'origine, lui, obéit.
  let t = sources([probe], { ELECTRON_RUN_AS_NODE: '1' });
  check(t.asNode && !t.asApp, 'témoin : ELECTRON_RUN_AS_NODE fait du moteur d’origine un Node.js');
  let r = packaged([probe], { ELECTRON_RUN_AS_NODE: '1' });
  check(!r.asNode && r.asApp && r.status === 0, 'ELECTRON_RUN_AS_NODE=1 Orbe.exe script.js : le script n’est pas exécuté, Orbe démarre normalement', `code ${r.status}`);

  const preload = '--require ' + probe.replace(/\\/g, '/');
  t = sources([], { NODE_OPTIONS: preload });
  info(`témoin : NODE_OPTIONS=--require avec le moteur d’origine ${t.asNode ? 'charge le script' : 'ne charge pas le script'}`);
  r = packaged([], { NODE_OPTIONS: preload });
  check(!r.asNode && r.asApp && r.status === 0, 'NODE_OPTIONS=--require script.js : le script n’est pas chargé par Orbe.exe', `code ${r.status}`);

  t = sources(['--inspect=9339'], { ORBE_PROBE_PORT: '9339' });
  check(t.inspect && t.portOpen, 'témoin : --inspect ouvre un port de débogage sur le moteur d’origine');
  r = packaged(['--inspect=9340'], { ORBE_PROBE_PORT: '9340' });
  check(!r.inspect && !r.portOpen && r.asApp && r.status === 0, 'Orbe.exe --inspect : aucun port de débogage, Orbe démarre normalement', `code ${r.status}`);
  r = packaged(['--inspect-brk=9341'], { ORBE_PROBE_PORT: '9341' });
  check(!r.inspect && !r.portOpen && r.asApp && r.status === 0, 'Orbe.exe --inspect-brk : aucun port de débogage, aucun arrêt au démarrage', `code ${r.status}`);

  // --- 3. Informations de version, lues par Windows ---------------------------------
  const ps = (script, args = []) => {
    const file = path.join(tmp, `s${++runs}.ps1`);
    fs.writeFileSync(file, '﻿' + script);
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, ...args], { encoding: 'utf8' });
  };
  const v = JSON.parse(ps('param($f)\n[Console]::OutputEncoding = [Text.Encoding]::UTF8\n(Get-Item $f).VersionInfo | Select-Object ProductName, FileDescription, CompanyName, FileVersion, ProductVersion, OriginalFilename, InternalName, LegalCopyright, FileMajorPart, FileMinorPart, FileBuildPart | ConvertTo-Json', [exe]));
  info('(Get-Item Orbe.exe).VersionInfo : ' + JSON.stringify(v));
  const want = { ProductName: 'Orbe', FileDescription: 'Orbe', CompanyName: 'PIXEWORK', FileVersion: pkg.version, ProductVersion: pkg.version, OriginalFilename: 'Orbe.exe' };
  for (const [k, val] of Object.entries(want)) check(v[k] === val, `version : ${k} = ${val}`, v[k] === val ? '' : `lu : ${v[k]}`);
  check([v.FileMajorPart, v.FileMinorPart, v.FileBuildPart].join('.') === pkg.version.split(/[+-]/)[0], 'version : numéro binaire', [v.FileMajorPart, v.FileMinorPart, v.FileBuildPart].join('.'));

  // --- 4. Icône, extraite par Windows ------------------------------------------------
  const extract = 'param($f, $o)\nAdd-Type -AssemblyName System.Drawing\n$i = [System.Drawing.Icon]::ExtractAssociatedIcon($f)\n$b = $i.ToBitmap()\n$b.Save($o, [System.Drawing.Imaging.ImageFormat]::Png)\nWrite-Output "$($b.Width)x$($b.Height)"';
  const shot = (file, name) => { const o = path.join(shots, name); const size = ps(extract, [file, o]).trim(); return { size, img: decodePng(fs.readFileSync(o)) }; };
  const got = shot(exe, 'icone-Orbe.exe.png');
  const before = shot(engine, 'icone-electron.exe.png');
  // Référence : la même taille dans assets/orbe.ico (ou la plus grande, réduite).
  const entries = peResources.readIco(fs.readFileSync(path.join(root, 'assets', 'orbe.ico')));
  const same = entries.find((e) => (e.width || 256) === got.img.width);
  const ref = same ? decodePng(same.data) : resize(decodePng(entries[entries.length - 1].data), got.img.width);
  // Comparaison sur fond blanc : écart moyen par canal, et couleur moyenne.
  const flat = (im) => { const o = []; for (let i = 0; i < im.data.length; i += 4) { const a = im.data[i + 3] / 255; for (let c = 0; c < 3; c++) o.push(im.data[i + c] * a + 255 * (1 - a)); } return o; };
  const gap = (a, b) => { const x = flat(a); const y = flat(b); let s = 0; for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]); return s / x.length; };
  const mean = (im) => { const x = flat(im); const m = [0, 0, 0]; x.forEach((val, i) => { m[i % 3] += val; }); return '#' + m.map((val) => Math.round(val / (x.length / 3)).toString(16).padStart(2, '0')).join(''); };
  const dOrbe = gap(got.img, ref);
  const dElectron = before.img.width === ref.width ? gap(before.img, ref) : NaN;
  info(`icône extraite de Orbe.exe : ${got.size}, couleur moyenne ${mean(got.img)} ; assets/orbe.ico : ${mean(ref)} ; electron.exe : ${mean(before.img)}`);
  check(dOrbe < 6, 'icône de Orbe.exe = assets/orbe.ico', `écart moyen ${dOrbe.toFixed(2)} sur 255`);
  check(dElectron > 4 * Math.max(dOrbe, 1), 'témoin : l’icône d’electron.exe est bien différente', `écart moyen ${dElectron.toFixed(2)} sur 255`);

  // Les autres tailles, demandées une à une à Windows (PrivateExtractIcons) :
  // chacune doit se charger et correspondre à l'image de même taille du .ico.
  const sizes = entries.map((e) => e.width || 256).filter((n) => n !== got.img.width);
  const each = `param($f, $dir)
Add-Type -AssemblyName System.Drawing
Add-Type -Namespace Orbe -Name Native -MemberDefinition '[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern uint PrivateExtractIcons(string file, int index, int cx, int cy, IntPtr[] icons, uint[] ids, uint count, uint flags);'
foreach ($s in ${sizes.join(', ')}) {
  $h = New-Object IntPtr[] 1
  $ids = New-Object uint32[] 1
  $n = [Orbe.Native]::PrivateExtractIcons($f, 0, $s, $s, $h, $ids, 1, 0)
  if ($n -lt 1 -or $n -eq [uint32]::MaxValue -or $h[0] -eq [IntPtr]::Zero) { Write-Output "$($s):absente"; continue }
  $b = [System.Drawing.Icon]::FromHandle($h[0]).ToBitmap()
  $b.Save((Join-Path $dir "icone-Orbe.exe-$s.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output "$($s):$($b.Width)x$($b.Height)"
}`;
  const sizeReport = ps(each, [exe, shots]).trim().split(/\r?\n/);
  for (const size of sizes) {
    const file = path.join(shots, `icone-Orbe.exe-${size}.png`);
    const line = sizeReport.find((l) => l.startsWith(size + ':')) || `${size}:?`;
    if (!fs.existsSync(file)) { check(false, `icône ${size} × ${size} chargée par Windows`, line); continue; }
    const img = decodePng(fs.readFileSync(file));
    const d = img.width === size ? gap(img, decodePng(entries.find((e) => (e.width || 256) === size).data)) : NaN;
    check(d < 6, `icône ${size} × ${size} chargée par Windows = assets/orbe.ico`, `${line.split(':')[1]}, écart moyen ${d.toFixed(2)} sur 255`);
  }
}

fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
console.log(failed ? `\n${failed} vérification(s) en échec` : '\nApplication fabriquée : tout est vérifié');
process.exit(failed ? 1 : 0);
