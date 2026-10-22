// Sessions Chromium : protocole interne orbe://, agent utilisateur,
// autorisations des sites et téléchargements.
const { app, session, protocol, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const adblock = require('./adblock');
const extensions = require('./extensions');
const extApi = require('./ext-api');
const passwords = require('./passwords');
const permissions = require('./permissions');
const displayMedia = require('./display-media');
const certs = require('./certs');
const downloads = require('./downloads');
const swipe = require('./swipe');

const RENDERER_DIR = path.join(__dirname, '../renderer');
const configured = new WeakSet();
const hooks = { onDownload: () => {}, ownerWindow: () => null, downloadDir: () => '' };
const profileIds = new WeakMap(); // session -> identifiant du profil

// À appeler avant app.ready.
function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'orbe', privileges: { standard: true, secure: true, supportFetchAPI: true } },
    // Déjà « standard » dans Chromium ; le redire ici l'ajoute à la liste des
    // schémas auxquels Electron ouvre le système de fichiers des pages web
    // (webkitRequestFileSystem, navigator.storage.getDirectory), que des
    // extensions utilisent pour ranger leurs données (captures de GoFullPage).
    { scheme: 'chrome-extension', privileges: { standard: true, secure: true } },
  ]);
}

// Fichiers de l'interface : lus une fois, puis servis depuis la mémoire. Passer
// par `net.fetch(file://…)` coûtait une requête réseau interne par fichier, à
// chaque vue (5 fichiers pour la coque, 4 par vue d'appoint). Seuls les textes
// (pages, scripts, styles) sont gardés ; le reste (sons) passe par `net.fetch`,
// qui sait répondre aux demandes partielles des lecteurs.
const UI_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const uiFiles = new Map(); // chemin -> { body, mtime }
const uiStats = { hits: 0, reads: 0 };

function readUiFile(file) {
  const kept = uiFiles.get(file);
  // Depuis les sources, un fichier modifié est relu (rechargement à la volée) ;
  // dans l'application fabriquée, l'archive ne change pas.
  const mtime = app.isPackaged ? 0 : fs.statSync(file).mtimeMs;
  if (kept && kept.mtime === mtime) { uiStats.hits += 1; return kept.body; }
  const body = fs.readFileSync(file);
  uiFiles.set(file, { body, mtime });
  uiStats.reads += 1;
  return body;
}

function serveInternal(request) {
  const url = new URL(request.url);
  if (url.host !== 'app') return new Response('Introuvable', { status: 404 });
  const file = path.normalize(path.join(RENDERER_DIR, decodeURIComponent(url.pathname)));
  if (!file.startsWith(RENDERER_DIR + path.sep)) return new Response('Interdit', { status: 403 });
  const type = UI_TYPES[path.extname(file).toLowerCase()];
  if (!type) return net.fetch(pathToFileURL(file).toString());
  try {
    return new Response(readUiFile(file), { headers: { 'content-type': type } });
  } catch {
    return new Response('Introuvable', { status: 404 });
  }
}

// Les sites (Google, banques…) refusent parfois les agents « Electron ».
function cleanUserAgent(ses) {
  return ses.getUserAgent().replace(/\sElectron\/\S+/, '').replace(/\s(Orbe|orbe)\/\S+/, '');
}

const originOf = permissions.originOf;

function configure(ses, { persist }) {
  if (configured.has(ses)) return ses;
  configured.add(ses);
  // Bloqueur de publicités : il occupe l'unique écouteur onBeforeRequest.
  adblock.attach(ses);
  ses.setUserAgent(cleanUserAgent(ses));
  if (ses !== session.defaultSession) ses.protocol.handle('orbe', serveInternal);

  // Autorisations des sites, partage d'écran, certificats, téléchargements :
  // chacun dans son module, par session (profils et navigation privée).
  permissions.attach(ses, { persist, profileOf: () => profileIds.get(ses) || 'default' });
  displayMedia.attach(ses);
  certs.attach(ses);
  downloads.attach(ses, { persist, hooks });
  swipe.attach(ses); // balayage à deux doigts : précédent / suivant
  require('./media').attach(ses); // lecteur miniature : piste précédente / suivante du site
  // Extensions installées : rechargées dans chaque profil à chaque démarrage.
  if (persist) {
    extApi.attach(ses); // API chrome.* manquantes, avant le premier chargement
    extensions.loadInto(ses).then((r) => {
      for (const f of (r && r.failed) || []) console.error('[orbe] extension', f.id, f.error);
    }).catch((err) => console.error('[orbe] extensions', err));
  }
  return ses;
}

// Une session Chromium par profil : cookies et connexions séparés.
function profileSession(id) {
  const partition = !id || id === 'default' ? 'persist:orbe' : 'persist:orbe-' + id;
  const ses = configure(session.fromPartition(partition), { persist: true });
  // Mots de passe : rattachés au profil ; jamais en navigation privée.
  passwords.attach(ses, id || 'default');
  downloads.bindProfile(ses, id || 'default');
  profileIds.set(ses, id || 'default');
  return ses;
}

const mainSession = () => profileSession('default');

let incognitoCount = 0;
function incognitoSession() {
  return configure(session.fromPartition('incognito-' + Date.now() + '-' + ++incognitoCount), { persist: false });
}

function setupDefaultSession() {
  protocol.handle('orbe', serveInternal);
  // La session par défaut ne sert qu'à l'interface : aucune autorisation web.
  session.defaultSession.setPermissionRequestHandler((wc, p, cb) => cb(false));
}

module.exports = { uiStats, registerScheme, setupDefaultSession, mainSession, profileSession, incognitoSession, hooks, originOf, profileIdOf: (ses) => profileIds.get(ses) || '' };
