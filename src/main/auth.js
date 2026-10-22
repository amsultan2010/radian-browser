// Authentification HTTP (Basic, Digest, NTLM) et proxys : quand un serveur
// répond 401 ou 407, Orbe demande l'identifiant et le mot de passe dans une
// feuille posée sur l'onglet concerné (sheets.js). Annulable ; sans réponse, la
// demande est annulée et la page du serveur s'affiche.
//
// Sécurité :
//  - la feuille nomme l'hôte qui demande, tel que rapporté par Electron
//    (`authInfo`) ; le « domaine » (realm) est un texte choisi par le serveur :
//    il est affiché comme une citation, jamais comme un message d'Orbe ;
//  - quand c'est la page en cours de chargement qui demande, la feuille couvre
//    entièrement l'ancienne page et affiche l'adresse demandée : la question ne
//    peut pas passer pour celle du site encore affiché dessous ;
//  - un cadre ou une ressource d'un autre hôte que la page (publicité, image,
//    script, requête) ne peut pas faire apparaître la question : la demande est annulée (hameçonnage
//    classique : faire croire que le site visité demande un mot de passe) ;
//  - en HTTP simple, la feuille prévient que le mot de passe partira en clair ;
//  - rien n'est retenu par Orbe : Chromium garde l'identification pour la session.
// À FAIRE : proposer les comptes du gestionnaire de mots de passe (il faudrait
// une clé par hôte + domaine et passer par le déverrouillage du coffre ; pas
// trivial, donc laissé de côté — voir docs/securite-navigation.md).
const { app } = require('electron');
const sheets = require('./sheets');

const MAX = 1024;
const counts = new Map(); // id webContents -> { key, n } : tentatives pour une même demande
// Adresse de la navigation du cadre principal en cours, par page : seule façon
// sûre de savoir si la demande vient de la page qui se charge (et non d'un cadre
// intégré, que `isLoadingMainFrame()` ne distingue pas).
const pendingNav = new Map(); // id webContents -> adresse

function watchNavigation(wc) {
  const id = wc.id;
  wc.on('did-start-navigation', (d) => { if (d.isMainFrame && !d.isSameDocument) pendingNav.set(id, d.url); });
  wc.on('did-redirect-navigation', (d) => { if (d.isMainFrame) pendingNav.set(id, d.url); });
  wc.on('did-navigate', () => pendingNav.delete(id));
  wc.on('did-fail-load', (e, code, desc, url, isMainFrame) => { if (isMainFrame) pendingNav.delete(id); });
  wc.once('destroyed', () => pendingNav.delete(id));
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

// Qui peut faire apparaître la question ? Renvoie null (demande annulée) ou la
// façon de la présenter :
//  - un proxy : toujours ;
//  - la page en cours de chargement (navigation du cadre principal) : oui, en
//    couvrant l'ancienne page ;
//  - un cadre intégré ou une ressource : seulement du même hôte que la page.
function shouldAsk(wc, details, authInfo) {
  if (authInfo.isProxy) return { cover: false };
  let top = '';
  try { top = wc.getURL(); } catch {}
  if (details.isRequestForNavigation && pendingNav.get(wc.id) === details.url) return { cover: true };
  return top && hostOf(details.url) === hostOf(top) ? { cover: false } : null;
}

function onLogin(event, wc, details, authInfo, callback) {
  if (!wc || wc.isDestroyed()) return; // demande hors page : annulée (comportement par défaut)
  const how = shouldAsk(wc, details, authInfo);
  if (!how) return;
  const host = authInfo.host + (authInfo.port && ![80, 443].includes(authInfo.port) ? ':' + authInfo.port : '');
  const key = `${authInfo.isProxy ? 'proxy' : 'site'}|${host}|${authInfo.realm}`;
  const prev = counts.get(wc.id);
  const n = prev && prev.key === key && Date.now() - prev.at < 120000 ? prev.n + 1 : 1;
  const id = wc.id;
  if (!counts.has(id)) wc.once('destroyed', () => counts.delete(id));
  counts.set(id, { key, n, at: Date.now() });
  const sheet = sheets.open(wc, 'auth', {
    host,
    realm: String(authInfo.realm || '').slice(0, 200),
    proxy: !!authInfo.isProxy,
    scheme: String(authInfo.scheme || '').slice(0, 20),
    insecure: !authInfo.isProxy && /^http:/i.test(details.url) && !/^(localhost|127\.0\.0\.1)$/.test(authInfo.host),
    retry: n > 1 || details.firstAuthAttempt === false,
    pending: how.cover ? String(details.url || '').slice(0, 300) : '',
  }, { untilNavigation: false, cover: how.cover });
  // Page qui n'est pas un onglet (aperçu, petite fenêtre) : pas de feuille, demande annulée.
  if (!sheet) return;
  event.preventDefault();
  // Une autre navigation de l'onglet abandonne la demande.
  const onNav = (d) => { if (d.isMainFrame && !d.isSameDocument && Date.now() - sheet.openedAt > 300) sheet.close(null); };
  // Une navigation déjà en route qui aboutit pendant la question : même effet.
  const onCommit = () => sheet.close(null);
  wc.on('did-start-navigation', onNav);
  wc.on('did-navigate', onCommit);
  sheet.result.then((answer) => {
    if (!wc.isDestroyed()) { wc.off('did-start-navigation', onNav); wc.off('did-navigate', onCommit); }
    const ok = answer && typeof answer.username === 'string' && typeof answer.password === 'string' && answer.username.length <= MAX && answer.password.length <= MAX;
    try { if (ok) callback(answer.username, answer.password); else callback(); } catch {}
    if (!ok) counts.delete(id);
  });
}

// Certificat client demandé par un site. Sans réponse, Electron enverrait le
// premier certificat du trousseau : Orbe n'en envoie jamais sans un choix
// explicite, fait dans une feuille posée sur l'onglet.
function onClientCert(event, wc, url, list, callback) {
  event.preventDefault();
  const none = () => { try { callback(); } catch {} };
  if (!wc || wc.isDestroyed() || !Array.isArray(list) || !list.length) return none();
  let host = '';
  try { host = new URL(url).host; } catch {}
  const items = list.slice(0, 50).map((c) => ({ label: String(c.subjectName || '?').slice(0, 120), sub: String(c.issuerName || '').slice(0, 120) }));
  const sheet = sheets.open(wc, 'choose', { host, items });
  if (!sheet) return none();
  sheet.result.then((i) => {
    const cert = Number.isInteger(i) && i >= 0 && i < items.length ? list[i] : null;
    try { if (cert) callback(cert); else callback(); } catch {}
  });
  return undefined;
}

function setup() {
  app.on('web-contents-created', (e, wc) => watchNavigation(wc));
  app.on('login', onLogin);
  app.on('select-client-certificate', onClientCert);
}

module.exports = { setup, internals: { onLogin, onClientCert, shouldAsk, counts, pendingNav } };
