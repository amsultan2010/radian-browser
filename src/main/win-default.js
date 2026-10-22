// Windows : inscription d'Orbe comme navigateur, sans installateur.
// Windows 10 et 11 ne laissent aucune application se déclarer navigateur par
// défaut : il faut s'inscrire dans le registre de l'utilisateur, puis laisser
// la personne choisir dans Paramètres → Applications par défaut.
// Trois endroits, tous sous HKEY_CURRENT_USER (aucun droit d'administrateur) :
//   Software\Classes\OrbeHTML               ce qu'Orbe sait ouvrir, et comment
//   Software\Clients\StartMenuInternet\Orbe le navigateur et ses capacités
//   Software\RegisteredApplications         l'annuaire que lisent les Paramètres
// Rien n'est écrit sans un clic sur « Définir Orbe par défaut ». L'écriture
// passe par « reg.exe import » (un seul appel, sans dépendance).
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ID = 'Orbe';
const ROOT = 'HKEY_CURRENT_USER';
const FILE_TYPES = ['.htm', '.html', '.shtml', '.xht', '.xhtml'];
const URL_TYPES = ['http', 'https'];

const regExe = () => path.join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'reg.exe');
const quote = (s) => `"${s}"`;

// Ligne de commande qui lance Orbe : l'exécutable seul une fois fabriqué ;
// en développement, le moteur suivi du dossier du projet.
function launcher() {
  const { app } = require('electron');
  return app.isPackaged ? { exe: process.execPath, args: [] } : { exe: process.execPath, args: [app.getAppPath()] };
}

// Description de l'inscription : clés à créer et valeurs à poser.
//   keys   : clés créées par Orbe, retirées en entier à l'annulation ;
//   values : valeurs posées dans des clés partagées, retirées une à une.
// id : nom d'inscription (« Orbe » ; les tests en prennent un autre).
function plan({ exe, args = [], id = ID, name = 'Orbe' } = {}) {
  const progId = id + 'HTML';
  const base = [quote(exe), ...args.map(quote)].join(' ');
  const icon = exe + ',0';
  const classes = `${ROOT}\\Software\\Classes\\${progId}`;
  const client = `${ROOT}\\Software\\Clients\\StartMenuInternet\\${id}`;
  const caps = `${client}\\Capabilities`;
  const description = 'Orbe — un navigateur à barre latérale, libre et en français.';
  const keys = [
    { key: classes, values: { '': `Document HTML ${name}`, FriendlyTypeName: `Document HTML ${name}` } },
    { key: `${classes}\\Application`, values: { ApplicationName: name, ApplicationIcon: icon, ApplicationDescription: description, ApplicationCompany: 'PIXEWORK' } },
    { key: `${classes}\\DefaultIcon`, values: { '': icon } },
    { key: `${classes}\\shell\\open\\command`, values: { '': `${base} "%1"` } },
    { key: client, values: { '': name } },
    { key: `${client}\\DefaultIcon`, values: { '': icon } },
    { key: `${client}\\shell\\open\\command`, values: { '': base } },
    { key: `${client}\\InstallInfo`, values: { IconsVisible: 1 } },
    { key: caps, values: { ApplicationName: name, ApplicationIcon: icon, ApplicationDescription: description } },
    { key: `${caps}\\FileAssociations`, values: Object.fromEntries(FILE_TYPES.map((x) => [x, progId])) },
    { key: `${caps}\\URLAssociations`, values: Object.fromEntries(URL_TYPES.map((x) => [x, progId])) },
    { key: `${caps}\\StartMenu`, values: { StartMenuInternet: id } },
  ];
  const values = [
    { key: `${ROOT}\\Software\\RegisteredApplications`, name: id, value: `Software\\Clients\\StartMenuInternet\\${id}\\Capabilities` },
    // « Ouvrir avec » de l'Explorateur, pour les fichiers HTML.
    ...['.htm', '.html'].map((ext) => ({ key: `${ROOT}\\Software\\Classes\\${ext}\\OpenWithProgids`, name: progId, value: '' })),
  ];
  return { id, progId, keys, values, roots: [classes, client] };
}

// Fichier .reg (format « Windows Registry Editor Version 5.00 »).
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const line = (name, value) => `${name === '' ? '@' : quote(esc(name))}=${typeof value === 'number' ? 'dword:' + value.toString(16).padStart(8, '0') : quote(esc(value))}`;

function regFile(p, remove = false) {
  const out = ['Windows Registry Editor Version 5.00', ''];
  if (remove) {
    for (const root of p.roots) out.push(`[-${root}]`, '');
    for (const v of p.values) out.push(`[${v.key}]`, `${quote(esc(v.name))}=-`, '');
  } else {
    for (const k of p.keys) out.push(`[${k.key}]`, ...Object.entries(k.values).map(([n, v]) => line(n, v)), '');
    for (const v of p.values) out.push(`[${v.key}]`, line(v.name, v.value), '');
  }
  return out.join('\r\n');
}

function reg(args) {
  return new Promise((resolve, reject) => {
    execFile(regExe(), args, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) { err.message = `reg ${args[0]} : ${String(stderr || err.message).trim()}`; reject(err); } else resolve(String(stdout));
    });
  });
}

async function apply(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-reg-'));
  const file = path.join(dir, 'orbe.reg');
  try {
    // UTF-16 avec marque d'ordre : le format attendu, accents compris.
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));
    await reg(['import', file]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Inscrit Orbe (rien d'autre : le choix reste à faire dans les Paramètres).
async function register(opts = {}) {
  const p = plan({ ...launcher(), ...opts });
  await apply(regFile(p));
  return p;
}

// Retire tout ce que register() a écrit.
async function unregister(opts = {}) {
  const p = plan({ ...launcher(), ...opts });
  await apply(regFile(p, true));
  return p;
}

// Vrai si l'inscription est en place (annuaire et capacités).
async function registered(opts = {}) {
  const p = plan({ ...launcher(), ...opts });
  try {
    await reg(['query', p.values[0].key, '/v', p.id]);
    await reg(['query', `${p.roots[1]}\\Capabilities\\URLAssociations`, '/v', 'https']);
    return true;
  } catch {
    return false;
  }
}

// Page des Paramètres. Windows 11 sait ouvrir directement la fiche d'une
// application inscrite pour l'utilisateur ; Windows 10 ouvre la liste.
function settingsUrl(id = ID) {
  const build = Number(os.release().split('.')[2]);
  return build >= 22000 ? `ms-settings:defaultapps?registeredAppUser=${encodeURIComponent(id)}` : 'ms-settings:defaultapps';
}

module.exports = { ID, plan, regFile, register, unregister, registered, settingsUrl, reg };
