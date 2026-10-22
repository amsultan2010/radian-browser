// Certificats : avertissement quand un site présente un certificat refusé, état
// de la connexion dans la pastille d'adresse, résumé du certificat.
//
// Sécurité :
//  - un certificat refusé par Chromium reste refusé : Orbe n'accepte rien de
//    lui-même. La page d'avertissement est une feuille d'Orbe (sheets.js), pas
//    une page web : le site ne peut ni l'imiter de l'intérieur ni la fermer ;
//  - « Continuer quand même » vaut pour un hôte (avec son port), pour CE
//    certificat (empreinte), dans la session en cours : jamais écrit sur disque,
//    oublié à la fermeture d'Orbe ; un autre certificat redemande ;
//  - le choix n'est pas proposé pour les refus sans appel (certificat révoqué,
//    invalide ou incohérent, transparence exigée, interception connue) ni pour
//    un site qui impose HTTPS (HSTS), reconnu par une sonde locale du réseau de
//    Chromium. Vérifié sur Electron 44 : `certificate-error` est émis même pour
//    un site HSTS et `callback(true)` passerait outre — cette vérification est
//    donc la seule barrière. La sonde échoue fermée : sans preuve que le site
//    n'impose pas HTTPS, pas de « continuer » ;
//  - tout ce qui est affiché du certificat vient d'Electron, en simple texte.
const { app, net } = require('electron');
const sheets = require('./sheets');

const exceptions = new WeakMap(); // session -> Map(hôte:port -> Set(empreintes acceptées))
const seen = new WeakMap(); // session -> Map(hôte -> résumé du dernier certificat vérifié)
const lastError = new Map(); // id webContents -> { url, error, cert, at } (dernier refus, cadre principal)
const SEEN_MAX = 400;
// Refus sans appel : jamais de « continuer quand même ».
const HARD = new Set([-203, -206, -207, -214, -217]);
const REASONS = { '-200': 'name', '-201': 'date', '-202': 'authority', '-206': 'revoked', '-207': 'invalid', '-208': 'weak', '-211': 'weak', '-213': 'date' };
const env = { hstsTimeout: 1500 };
// Erreurs de transport : la demande est bien partie en HTTP simple vers l'hôte,
// ce qui prouve que Chromium ne l'a pas convertie en HTTPS (HSTS agit avant
// toute connexion). Toute autre erreur (demande bloquée, annulée…) ne prouve rien.
const TRANSPORT = /ERR_(CONNECTION_REFUSED|CONNECTION_RESET|CONNECTION_CLOSED|CONNECTION_TIMED_OUT|CONNECTION_FAILED|NAME_NOT_RESOLVED|ADDRESS_UNREACHABLE|EMPTY_RESPONSE|INTERNET_DISCONNECTED|TIMED_OUT)\b/;

const isCertError = (code) => Number.isInteger(code) && code <= -200 && code > -220;

function summary(cert) {
  if (!cert) return null;
  return {
    subject: String(cert.subjectName || (cert.subject && cert.subject.commonName) || '').slice(0, 200),
    issuer: String(cert.issuerName || (cert.issuer && cert.issuer.commonName) || '').slice(0, 200),
    validStart: Number(cert.validStart) || 0,
    validExpiry: Number(cert.validExpiry) || 0,
    fingerprint: String(cert.fingerprint || '').slice(0, 200),
    serial: String(cert.serialNumber || '').slice(0, 120),
  };
}

function hostKey(url) {
  try { const u = new URL(url); return u.protocol === 'https:' || u.protocol === 'wss:' ? u.host : ''; } catch { return ''; }
}

function isAllowed(ses, url, fingerprint) {
  const map = exceptions.get(ses);
  const key = hostKey(url);
  return !!(map && key && fingerprint && map.has(key) && map.get(key).has(fingerprint));
}

function allow(ses, url, fingerprint) {
  const key = hostKey(url);
  if (!key || !fingerprint) return false;
  let map = exceptions.get(ses);
  if (!map) exceptions.set(ses, (map = new Map()));
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(fingerprint);
  return true;
}

function hasException(ses, url) {
  const map = exceptions.get(ses);
  const key = hostKey(url);
  return !!(map && key && map.has(key));
}

// Retire les exceptions d'un hôte (« réinitialiser » depuis les informations du site).
function revoke(ses, url) {
  const map = exceptions.get(ses);
  const key = hostKey(url);
  return !!(map && key && map.delete(key));
}

const isLocal = (hostname) => hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1' || hostname === '[::1]';
const isIp = (hostname) => /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.startsWith('[');

// Le site impose-t-il HTTPS (HSTS, liste préchargée comprise) ? Chromium le sait,
// Electron ne le dit pas : on demande au réseau de la session d'ouvrir
// http://hôte/ sans suivre la redirection. Un site HSTS répond par une
// redirection interne (307, « Non-Authoritative-Reason: HSTS ») avant tout
// échange (vérifié sur un hôte de la liste préchargée : réponse en quelques
// millisecondes, sans trafic) ; sinon la demande est abandonnée aussitôt, sans cookies.
// Renvoie true (HSTS), false (prouvé que non : une réponse HTTP, une autre
// redirection, ou une erreur de transport en HTTP simple), ou null (on ne sait
// pas : délai dépassé, demande bloquée ou annulée) — null vaut refus.
function probeHsts(ses, hostname) {
  if (!hostname || isIp(hostname) || isLocal(hostname)) return Promise.resolve(false);
  return new Promise((resolve) => {
    let req = null;
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { if (req) req.abort(); } catch {}
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), env.hstsTimeout);
    try {
      req = net.request({ method: 'HEAD', url: `http://${hostname}/`, session: ses, redirect: 'manual', credentials: 'omit', useSessionCookies: false });
      req.on('redirect', (status, method, redirectUrl, headers) => {
        const reason = Object.entries(headers || {}).find(([k]) => k.toLowerCase() === 'non-authoritative-reason');
        finish(status === 307 && /^https:/i.test(redirectUrl || '') && !!reason && String(reason[1]).toUpperCase().includes('HSTS'));
      });
      req.on('response', () => finish(false));
      req.on('error', (err) => finish(TRANSPORT.test(String(err && err.message)) ? false : null));
      req.end();
    } catch { finish(null); }
  });
}
const probes = { hsts: probeHsts };

// Échec de chargement d'un onglet : si c'est un certificat refusé, affiche
// l'avertissement et renvoie true (pas de page d'erreur ordinaire).
// `actions` : { back(), load(url) }, fournis par la fenêtre.
function failed(wc, { code, url }, actions) {
  if (!isCertError(code) || !wc || wc.isDestroyed()) return false;
  const ses = wc.session;
  let hostname = '';
  let host = '';
  try { const u = new URL(url); hostname = u.hostname; host = u.host; } catch {}
  const err = lastError.get(wc.id);
  const mine = err && hostKey(err.url) === hostKey(url) && Date.now() - err.at < 60000 ? err : null;
  let stale = false;
  const onNav = (details) => { if (details.isMainFrame && !details.isSameDocument) stale = true; };
  wc.on('did-start-navigation', onNav);
  (async () => {
    const probed = await probes.hsts(ses, hostname).catch(() => null);
    const hsts = probed === true;
    if (!wc.isDestroyed()) wc.off('did-start-navigation', onNav);
    if (stale || wc.isDestroyed()) return;
    // Seul « false » (prouvé sans HSTS) laisse la possibilité de continuer.
    const hard = HARD.has(code) || probed !== false;
    const canProceed = !hard && !!mine && !!mine.cert && !!mine.cert.fingerprint;
    const sheet = sheets.open(wc, 'cert', {
      host, reason: REASONS[String(code)] || 'other', error: (mine && mine.error) || `net::${code}`, cert: mine ? mine.cert : null, canProceed, hard, hsts, unverified: probed === null,
    }, { cover: true });
    if (!sheet) return;
    const choice = await sheet.result;
    if (wc.isDestroyed()) return;
    if (choice === 'proceed' && canProceed) {
      allow(ses, url, mine.cert.fingerprint);
      actions.load(url);
    } else if (choice === 'back') actions.back();
  })().catch((err2) => console.error('[orbe] certificat', err2));
  return true;
}

// État de la connexion pour la pastille d'adresse :
// 'secure' (https), 'insecure' (http), 'broken' (https avec certificat refusé,
// accepté ou non), 'local' (cette machine), '' (pages d'Orbe, fichiers…).
function state(wc, url) {
  let u;
  try { u = new URL(url); } catch { return ''; }
  if (u.protocol === 'https:') {
    // Avertissement en attente (même sous une autre feuille), ou exception en cours.
    if (wc && !wc.isDestroyed() && (sheets.has(wc, 'cert') || hasException(wc.session, url))) return 'broken';
    return 'secure';
  }
  if (u.protocol === 'http:') return isLocal(u.hostname) ? 'local' : 'insecure';
  return '';
}

// Résumé du certificat présenté par l'hôte de cette adresse, tel que vérifié par Chromium.
function certFor(ses, url) {
  try { const map = seen.get(ses); return (map && map.get(new URL(url).hostname)) || null; } catch { return null; }
}

function attach(ses) {
  const map = new Map();
  seen.set(ses, map);
  // Simple relevé : la décision reste entièrement celle de Chromium (-3).
  ses.setCertificateVerifyProc((request, callback) => {
    try {
      if (map.size >= SEEN_MAX) map.delete(map.keys().next().value);
      map.set(request.hostname, { ...summary(request.certificate), result: String(request.verificationResult || '') });
    } catch {}
    callback(-3);
  });
}

function setup() {
  app.on('certificate-error', (event, wc, url, error, certificate, callback, isMainFrame) => {
    if (!wc || wc.isDestroyed()) return; // refusé (comportement par défaut)
    if (isAllowed(wc.session, url, certificate && certificate.fingerprint)) {
      event.preventDefault();
      callback(true);
      return;
    }
    if (isMainFrame) {
      const id = wc.id;
      if (!lastError.has(id)) wc.once('destroyed', () => lastError.delete(id));
      lastError.set(id, { url, error: String(error || ''), cert: summary(certificate), at: Date.now() });
    }
  });
}

module.exports = { setup, attach, failed, state, certFor, isCertError, hasException, revoke, summary, internals: { exceptions, lastError, allow, isAllowed, probeHsts, probes, HARD, env } };
