// Reprise de l'historique, des mots de passe et des cookies d'Arc (src/main/import-arc-data.js).
// Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/import-arc-donnees.js node scripts/dev.js --selftest
// Les profils d'Arc sont fabriqués dans un dossier temporaire, chiffrés avec une clé d'essai :
// ni le vrai dossier d'Arc ni le trousseau de la machine ne sont jamais lus.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { ignorer } = require('./outils');

module.exports = async function arcDonneesTests(ctx) {
  const { first: w, store, commands, passwords } = ctx;
  let failed = 0;
  const check = ctx.check || ((name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`); });
  const data = require('../src/main/import-arc-data');
  const sessions = require('../src/main/sessions');
  const real = { ...data.env };

  check('en test, le vrai dossier d’Arc n’est pas désigné : aucun profil n’est cherché, rien n’est lu',
    real.root === '' && !data.available() && data.profiles().length === 0 && (await data.survey()).profiles === 0);
  check('commande « Reprendre l’historique et les connexions d’Arc » présente', !!commands.byName.get('importArcData'));

  const sqlite = ['/usr/bin/sqlite3', '/bin/sqlite3'].find((p) => fs.existsSync(p)) || '';
  if (!sqlite) {
    ignorer('reprise des données d’Arc sur de fausses bases', 'pas de sqlite3 sur cette machine (la fonction est réservée à macOS)');
    if (!ctx.check && failed) throw new Error(`${failed} vérification(s) en échec`);
    return;
  }

  // --- Faux dossier d'Arc ---------------------------------------------------------------
  const SECRET = 'cle-d-essai-arc';
  const key = crypto.pbkdf2Sync(Buffer.from(SECRET), 'saltysalt', 1003, 16, 'sha1');
  const chiffrer = (texte, hote, cle = key) => {
    const c = crypto.createCipheriv('aes-128-cbc', cle, Buffer.alloc(16, 0x20));
    const clair = hote == null ? Buffer.from(texte) : Buffer.concat([crypto.createHash('sha256').update(hote).digest(), Buffer.from(texte)]);
    return 'X\'' + Buffer.concat([Buffer.from('v10'), c.update(clair), c.final()]).toString('hex') + '\'';
  };
  const chrome = (ms) => String(Math.round((ms + 11644473600000) * 1000));
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-arc-essai-'));
  const tmp = path.join(root, 'tmp');
  fs.mkdirSync(tmp);
  const now = Date.now();
  const base = (dir, name, sql) => { fs.mkdirSync(path.join(root, dir), { recursive: true }); execFileSync(sqlite, [path.join(root, dir, name), sql]); };
  const HISTORY = 'create table urls(id integer primary key, url longvarchar, title longvarchar, visit_count integer, typed_count integer, last_visit_time integer, hidden integer);';
  const LOGINS = 'create table logins(origin_url varchar, signon_realm varchar, username_value varchar, password_value blob, blacklisted_by_user integer);';
  const COOKIES = "create table meta(key longvarchar, value longvarchar); insert into meta values('version','24'); create table cookies(creation_utc integer, host_key text, top_frame_site_key text, name text, value text, encrypted_value blob, path text, expires_utc integer, is_secure integer, is_httponly integer, last_access_utc integer, has_expires integer, is_persistent integer, priority integer, samesite integer);";
  const cookie = (host, name, valeur, o = {}) => `insert into cookies values(0, ${q(host)}, ${q(o.partition || '')}, ${q(name)}, '', ${chiffrer(valeur, o.empreinte === undefined ? host : o.empreinte, o.cle)}, ${q(o.path || '/')}, ${o.session ? 0 : chrome(now + (o.dans === undefined ? 86400e3 : o.dans))}, ${o.secure === false ? 0 : 1}, ${o.httponly ? 1 : 0}, ${chrome(now)}, ${o.session ? 0 : 1}, 1, 1, ${o.samesite === undefined ? 1 : o.samesite});`;

  base('Default', 'History', HISTORY
    + `insert into urls values(1, 'https://exemple.org/lu', 'Page lue', 7, 0, ${chrome(now - 3600e3)}, 0);`
    + `insert into urls values(2, 'https://exemple.org/cachee', 'Cachée', 1, 0, ${chrome(now - 60e3)}, 1);`
    + `insert into urls values(3, 'chrome://settings/', 'Réglages', 3, 0, ${chrome(now - 60e3)}, 0);`
    + `insert into urls values(4, 'https://exemple.org/connue', 'Titre d’Arc', 2, 0, ${chrome(now - 30e3)}, 0);`);
  base('Default', 'Login Data', LOGINS
    + `insert into logins values('https://compte.exemple.org/connexion', 'https://compte.exemple.org/', 'amadou', ${chiffrer('mot-de-passe-1')}, 0);`
    + `insert into logins values('https://jamais.exemple.org/', 'https://jamais.exemple.org/', '', X'', 1);`
    + `insert into logins values('android://abc@com.exemple/', 'android://abc@com.exemple/', 'appli', ${chiffrer('appli')}, 0);`
    + `insert into logins values('https://abime.exemple.org/', 'https://abime.exemple.org/', 'x', ${chiffrer('autre', undefined, crypto.randomBytes(16))}, 0);`
    + `insert into logins values('https://pirate.example/login', 'https://compte.exemple.org/', 'vole', ${chiffrer('mot-de-passe-vole')}, 0);`);
  base('Default', 'Cookies', COOKIES
    + cookie('.exemple.org', 'session', 'valeur-de-domaine', { httponly: true })
    + cookie('compte.exemple.org', '__Host-id', 'valeur-d-hote', { samesite: 2 })
    + cookie('.exemple.org', 'perime', 'vieux', { dans: -3600e3 })
    + cookie('.exemple.org', 'cloisonne', 'chips', { partition: 'https://autre.example' })
    + cookie('.exemple.org', 'deplace', 'vole', { empreinte: '.banque.example' })
    + cookie('.exemple.org', 'abime', 'x', { cle: crypto.randomBytes(16) })
    + cookie('.exemple.org', 'ephemere', 'le-temps-d-une-session', { session: true }));
  base('Profile 3', 'History', HISTORY + `insert into urls values(1, 'https://travail.exemple.org/', 'Travail', 1, 0, ${chrome(now - 7200e3)}, 0);`);
  base('Profile 3', 'Login Data', LOGINS + `insert into logins values('https://travail.exemple.org/', 'https://travail.exemple.org/', 'pro', ${chiffrer('mot-de-passe-pro')}, 0);`);
  base('Profile 3', 'Cookies', COOKIES + cookie('travail.exemple.org', 'pro', 'connexion-pro'));
  base('Profile 9', 'History', HISTORY + `insert into urls values(1, 'https://sans-profil.exemple.org/', 'Sans profil', 1, 0, ${chrome(now)}, 0);`);
  fs.mkdirSync(path.join(root, 'Crowd Deny'));
  const empreinte = () => ['Default', 'Profile 3'].flatMap((d) => ['History', 'Login Data', 'Cookies'].map((n) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, d, n))).digest('hex'))).join();
  const avant = empreinte();

  let demandes = 0;
  data.configure({ root, sqlite, tmp, key: async () => { demandes += 1; return SECRET; } });
  const n = await data.survey();
  check('faux dossier d’Arc : trois profils reconnus (« Default », « Profile N »), les autres dossiers ignorés ; le décompte ne demande pas la clé',
    data.profiles().map((p) => p.key).join() === 'default,Profile 3,Profile 9' && n.profiles === 3 && n.history === 5 && n.logins === 5 && n.cookies === 8 && demandes === 0, JSON.stringify(n));

  // Profil d'Orbe né du « Profile 3 » d'Arc ; « Profile 9 » n'en a pas.
  const pro = { id: 'arc-essai-pro', name: 'Pro (essai)', arcKey: 'Profile 3' };
  store.state.profiles.push(pro);
  store.state.favs[pro.id] = [];
  const targets = new Map([['default', { pid: 'default', session: sessions.profileSession('default') }], ['Profile 3', { pid: pro.id, session: sessions.profileSession(pro.id) }]]);
  const sinks = { history: (list) => store.mergeHistory(list), logins: (pid, list) => passwords.importList(pid, list) };
  store.state.history['https://exemple.org/connue'] = { url: 'https://exemple.org/connue', visits: 9, last: now - 86400e3, title: 'Titre d’Orbe' };
  const total = () => Object.keys(store.state.history).length;
  const h0 = total();

  // --- Trousseau refusé : l'historique seul ------------------------------------------------
  data.configure({ key: async () => { throw new Error('refus'); } });
  let r = await data.importAll({ targets, sinks, want: { history: true, logins: true, cookies: true } });
  const h = store.state.history;
  check('trousseau refusé : l’historique est repris quand même, ni mot de passe ni cookie, et c’est dit',
    r.noKey === true && r.history === 2 && r.logins === 0 && r.cookies === 0 && total() === h0 + 2, JSON.stringify(r));
  check('historique : adresses web seulement, les cachées et les pages internes écartées, dates d’Arc converties',
    !!h['https://exemple.org/lu'] && h['https://exemple.org/lu'].visits === 7 && Math.abs(h['https://exemple.org/lu'].last - (now - 3600e3)) < 2 && !h['https://exemple.org/cachee'] && !h['chrome://settings/'] && !!h['https://travail.exemple.org/'], JSON.stringify(h['https://exemple.org/lu']));
  check('… une adresse déjà connue garde le plus grand nombre de visites, et prend la date et le titre les plus récents',
    h['https://exemple.org/connue'].visits === 9 && h['https://exemple.org/connue'].title === 'Titre d’Arc' && Math.abs(h['https://exemple.org/connue'].last - (now - 30e3)) < 2);
  check('… le profil d’Arc sans profil d’Orbe n’est pas repris', !h['https://sans-profil.exemple.org/'] && r.profiles === 2);

  // --- « L'historique seulement » : la clé n'est même pas demandée ---------------------------
  demandes = 0;
  data.configure({ key: async () => { demandes += 1; return SECRET; } });
  r = await data.importAll({ targets, sinks, want: { history: true, logins: false, cookies: false } });
  check('« L’historique seulement » : la clé d’Arc n’est pas demandée, rien de neuf la seconde fois', demandes === 0 && r.history === 0 && r.noKey === false, JSON.stringify(r));

  // --- Mauvaise clé : rien n'entre ---------------------------------------------------------
  const sesDefaut = sessions.profileSession('default');
  const cookiesDe = async (ses, url) => (await ses.cookies.get({ url })).map((c) => `${c.name}=${c.value}`).sort().join(' ');
  data.configure({ key: async () => 'pas-la-bonne-cle' });
  r = await data.importAll({ targets, sinks, want: { history: false, logins: true, cookies: true } });
  check('mauvaise clé : aucun mot de passe, aucun cookie ; tout est compté comme laissé de côté',
    r.logins === 0 && r.cookies === 0 && r.skipped >= 8 && (await cookiesDe(sesDefaut, 'https://compte.exemple.org/')) === '' && (await passwords.matchesFor('default', 'https://compte.exemple.org')).exact.length === 0, JSON.stringify(r));

  // --- Bonne clé ---------------------------------------------------------------------------
  demandes = 0;
  data.configure({ key: async () => { demandes += 1; return SECRET; } });
  r = await data.importAll({ targets, sinks, want: { history: false, logins: true, cookies: true } });
  const m = await passwords.matchesFor('default', 'https://compte.exemple.org');
  const mPro = await passwords.matchesFor(pro.id, 'https://travail.exemple.org');
  check('mots de passe : déchiffrés et rangés dans le coffre du profil correspondant ; la clé est demandée une seule fois',
    demandes === 1 && r.logins === 2 && m.exact.length === 1 && m.exact[0].username === 'amadou' && m.exact[0].password === 'mot-de-passe-1'
    && mPro.exact.length === 1 && mPro.exact[0].password === 'mot-de-passe-pro' && (await passwords.matchesFor('default', 'https://travail.exemple.org')).exact.length === 0, JSON.stringify(r));
  check('… « jamais pour ce site », application Android et mot de passe illisible : écartés',
    (await passwords.matchesFor('default', 'https://jamais.exemple.org')).exact.length === 0 && (await passwords.matchesFor('default', 'https://abime.exemple.org')).exact.length === 0);
  check('… un mot de passe dont l’adresse et le domaine d’authentification ne disent pas le même site est rejeté (non posé sur le site pirate)',
    (await passwords.matchesFor('default', 'https://pirate.example')).exact.length === 0);
  const surCompte = await cookiesDe(sesDefaut, 'https://compte.exemple.org/');
  const surAutre = await cookiesDe(sesDefaut, 'https://autre.exemple.org/');
  check('cookies : posés dans la session du profil ; le cookie de domaine vaut pour tout le domaine, celui d’un hôte pour lui seul',
    r.cookies === 4 && surCompte === '__Host-id=valeur-d-hote ephemere=le-temps-d-une-session session=valeur-de-domaine' && surAutre === 'ephemere=le-temps-d-une-session session=valeur-de-domaine', surCompte + ' | ' + surAutre + ' | ' + JSON.stringify(r));
  const lus = await sesDefaut.cookies.get({ url: 'https://compte.exemple.org/' });
  const un = (nom) => lus.find((c) => c.name === nom) || {};
  check('… leurs attributs suivent : sécurisé, inaccessible aux scripts, même site strict, date de fin ; le cookie de session n’a pas de date',
    un('session').httpOnly === true && un('session').secure === true && un('__Host-id').sameSite === 'strict' && un('__Host-id').hostOnly === true && Math.abs(un('session').expirationDate - (now + 86400e3) / 1000) < 5 && un('ephemere').session === true, JSON.stringify(lus));
  check('… expiré, cloisonné par site, déplacé d’un autre site (empreinte d’hôte fausse), illisible : aucun n’entre',
    !/perime|cloisonne|deplace|abime/.test(surCompte) && r.skipped >= 5, surCompte + ' ' + r.skipped);
  check('… chaque profil d’Arc dans son profil d’Orbe, sans mélange',
    (await cookiesDe(sessions.profileSession(pro.id), 'https://travail.exemple.org/')) === 'pro=connexion-pro' && !/pro=/.test(await cookiesDe(sesDefaut, 'https://travail.exemple.org/')) && !/session=|__Host/.test(await cookiesDe(sessions.profileSession(pro.id), 'https://compte.exemple.org/')),
    (await cookiesDe(sessions.profileSession(pro.id), 'https://travail.exemple.org/')) + ' | ' + (await cookiesDe(sesDefaut, 'https://travail.exemple.org/')));
  check('Arc n’est pas modifié (bases identiques à l’octet), et aucune copie temporaire ne reste', empreinte() === avant && fs.readdirSync(tmp).length === 0, fs.readdirSync(tmp).join());
  check('valeur chiffrée mal formée (trop courte, pas « v10 », longueur fausse, sans clé) : rejetée sans erreur',
    data.decrypt('', key) === null && data.decrypt('763131' + '00'.repeat(16), key) === null && data.decrypt('763130' + '00'.repeat(15), key) === null && data.decrypt('763130' + '00'.repeat(16), null) === null && data.decrypt(null, key) === null);

  // --- Bases trafiquées par un autre programme du compte (sans la clé) --------------------------
  // Un cookie « en clair » (colonne value, encrypted_value vide) ne doit pas entrer : un logiciel
  // du compte fixerait sinon une session de son choix sur n'importe quel site.
  base('Clair', 'Cookies', COOKIES + `insert into cookies values(0, 'compte.exemple.org', '', '__Host-vole', 'session-pirate', X'', '/', ${chrome(now + 86400e3)}, 1, 0, ${chrome(now)}, 1, 1, 1, 0);`);
  const rClair = await data.readCookies(path.join(root, 'Clair'), key);
  check('cookie en clair (sans valeur chiffrée) : rejeté, jamais posé', rClair.list.length === 0);

  // Base d'avant la version 24 (sans empreinte d'hôte) : aucun cookie n'est repris.
  base('Vieille', 'Cookies', "create table meta(key longvarchar, value longvarchar); insert into meta values('version','18'); create table cookies(creation_utc integer, host_key text, top_frame_site_key text, name text, value text, encrypted_value blob, path text, expires_utc integer, is_secure integer, is_httponly integer, last_access_utc integer, has_expires integer, is_persistent integer, priority integer, samesite integer);"
    + cookie('compte.exemple.org', 'id', 'valeur', { empreinte: null }));
  const rVieille = await data.readCookies(path.join(root, 'Vieille'), key);
  check('base de cookies d’avant la version 24 (pas d’empreinte d’hôte) : aucun cookie repris', rVieille.list.length === 0 && rVieille.tooOld === true);

  // --- Jamais le trousseau sans vrai dossier d'Arc (mode test) ------------------------------------
  {
    let touche = false;
    data.configure({ root: '', security: '/bin/echo', key: async () => { touche = true; return SECRET; } });
    const k = await data.readKey();
    check('sans dossier d’Arc désigné, la clé n’est jamais demandée (ni le trousseau, ni une clé d’essai)', k === null && touche === false);
    data.configure({ root, security: real.security, key: async () => { demandes += 1; return SECRET; } });
  }

  // --- Par la commande : la fenêtre dit ce qui sera lu ; « Annuler » ne lit rien ----------------
  {
    const { dialog } = require('electron');
    const vraie = dialog.showMessageBox;
    const vues = [];
    let reponse = 2;
    dialog.showMessageBox = async (...args) => { const o = args.find((x) => x && typeof x === 'object' && !(typeof x.isDestroyed === 'function')) || {}; vues.push(o); return { response: vues.length === 1 ? reponse : 0, checkboxChecked: false }; };
    try {
      demandes = 0;
      await commands.run(w, 'importArcData');
      check('commande : la fenêtre ne compte que les profils d’Arc qui ont un profil d’Orbe, annonce la demande de macOS et le risque de « Toujours autoriser » ; par défaut l’historique seul ; « Annuler » ne lit rien',
        vues.length === 1 && /2 profils/.test(vues[0].detail) && /5 mots de passe/.test(vues[0].detail) && /8 cookies/.test(vues[0].detail) && /security/.test(vues[0].detail) && /Toujours autoriser/.test(vues[0].detail) && vues[0].buttons.length === 3 && vues[0].defaultId === 1 && vues[0].cancelId === 2 && demandes === 0, JSON.stringify(vues[0] && vues[0].detail));
      vues.length = 0; reponse = 1;
      await commands.run(w, 'importArcData');
      check('« L’historique seulement » : la clé n’est toujours pas demandée ; le bilan est affiché', demandes === 0 && vues.length === 2 && vues[1].type === 'info' && /0 mots de passe, 0 cookies/.test(vues[1].detail), JSON.stringify(vues[1] && vues[1].detail));
      vues.length = 0; reponse = 0;
      await commands.run(w, 'importArcData');
      check('« Tout reprendre » : la clé est demandée une fois, le bilan compte les mots de passe et les cookies', demandes === 1 && vues.length === 2 && vues[1].type === 'info' && /2 mots de passe, 4 cookies/.test(vues[1].detail), JSON.stringify(vues[1] && vues[1].detail));
      vues.length = 0;
      data.configure({ key: async () => '' });
      await commands.run(w, 'importArcData');
      check('accord refusé à macOS : le bilan le dit (avertissement), sans mot de passe ni cookie', vues.length === 2 && vues[1].type === 'warning' && /0 mots de passe, 0 cookies/.test(vues[1].detail), JSON.stringify(vues[1] && vues[1].detail));
    } finally {
      dialog.showMessageBox = vraie;
    }
  }

  // --- Ménage -----------------------------------------------------------------------------------
  for (const pid of ['default', pro.id]) for (const o of ['https://compte.exemple.org', 'https://travail.exemple.org']) for (const e of (await passwords.matchesFor(pid, o)).exact) passwords.remove(pid, e.id);
  for (const ses of [sesDefaut, sessions.profileSession(pro.id)]) for (const c of await ses.cookies.get({})) if (/exemple\.org$/.test(c.domain || '')) await ses.cookies.remove(`https://${c.domain.replace(/^\./, '')}${c.path}`, c.name);
  for (const u of ['https://exemple.org/lu', 'https://exemple.org/connue', 'https://travail.exemple.org/']) delete store.state.history[u];
  store.historyCount = null;
  store.state.profiles.splice(store.state.profiles.indexOf(pro), 1);
  delete store.state.favs[pro.id];
  data.configure(real);
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  store.save();
  if (!ctx.check && failed) throw new Error(`${failed} vérification(s) en échec`);
};
