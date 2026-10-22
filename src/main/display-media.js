// Partage d'écran (navigator.mediaDevices.getDisplayMedia) : le sélecteur d'Orbe
// propose cet onglet, les écrans et les fenêtres, avec leur vignette.
//
// Sécurité :
//  - rien n'est jamais partagé sans un choix explicite dans le sélecteur, qui
//    est une feuille d'Orbe posée sur l'onglet demandeur (voir sheets.js) ;
//  - la demande doit venir d'un geste de l'utilisateur (rapporté par Electron) ;
//  - la source renvoyée est relue dans la liste dressée par le processus
//    principal : la feuille ne renvoie qu'un identifiant de cette liste ;
//  - aucune réponse n'est retenue : chaque partage redemande.
const { desktopCapturer, webContents } = require('electron');
const { store } = require('./store');
const sheets = require('./sheets');
const capture = require('./capture-state');
const permissions = require('./permissions');

const THUMB = { width: 320, height: 200 };
// Remplaçable par les tests (aucune capture réelle de l'écran de la machine).
const env = {
  test: false,
  sources: async () => (await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: THUMB })).map((s) => ({
    id: s.id, name: s.name, kind: s.id.startsWith('screen:') ? 'screen' : 'window', thumb: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : '', source: s,
  })),
  toast: () => {},
};
const t = (key, vars) => store.t(key, null, vars);

// Vignette de l'onglet. Bornée dans le temps : écran en veille, la capture ne revient pas.
async function tabThumb(wc) {
  try {
    const img = await Promise.race([wc.capturePage(), new Promise((r) => setTimeout(() => r(null), 900))]);
    return !img || img.isEmpty() ? '' : img.resize({ width: THUMB.width, quality: 'good' }).toDataURL();
  } catch { return ''; }
}

// Écrans et fenêtres. Sans l'accord du système (macOS), la liste est vide ou
// trompeuse ; la demander fait apparaître Orbe dans les réglages de confidentialité.
async function desktopSources() {
  try { return await env.sources(); } catch (err) { console.error('[orbe] partage d’écran', err.message); return []; }
}

const forSheet = (list) => list.map(({ id, name, kind, thumb }) => ({ id, name: String(name || '').slice(0, 120), kind, thumb }));

async function handle(request, callback) {
  let answered = false;
  const reply = (streams) => { if (answered) return; answered = true; try { callback(streams); } catch (err) { console.error('[orbe] partage d’écran', err.message); } };
  const deny = () => reply(null);
  const frame = request.frame;
  let wc = null;
  try { wc = frame ? webContents.fromFrame(frame) : null; } catch {}
  if (!wc || wc.isDestroyed() || !request.videoRequested) return deny();
  if (!request.userGesture) return deny();
  const origin = permissions.originOf(request.securityOrigin || frame.url || '');
  // « Cet onglet » d'abord, sans attendre : les écrans et les fenêtres suivent.
  let list = [{ id: 'tab', name: '', kind: 'tab', thumb: '' }];
  const audio = { tab: true, screen: process.platform === 'win32' };
  const osState = () => { const st = permissions.os.status('screen'); return st === 'unknown' ? 'granted' : st; };
  const payload = () => ({ site: permissions.siteName(origin), sources: forSheet(list), os: osState(), audio, audioRequested: !!request.audioRequested });
  let sheet = null;
  const fill = async () => {
    const [thumb, desktop] = await Promise.all([tabThumb(wc), desktopSources()]);
    list = [{ id: 'tab', name: '', kind: 'tab', thumb }, ...desktop];
    if (sheet && !sheet.closed) sheet.update(payload());
  };
  sheet = sheets.open(wc, 'picker', payload(), {
    onAction: async (name) => {
      if (name === 'settings') { permissions.os.openSettings('screen'); return null; }
      if (name === 'refresh') { await fill(); return null; }
      return null;
    },
  });
  // Page qui n'est pas un onglet (aperçu, petite fenêtre) : pas de sélecteur, donc pas de partage.
  if (!sheet) { env.toast(wc, t('share.onlyTabs')); return deny(); }
  const filling = fill().catch(() => {});
  const choice = await sheet.result;
  // La vignette de l'onglet est une capture de la page : on la laisse finir (un
  // instant au plus) avant de lancer le partage du même onglet.
  await Promise.race([filling, new Promise((r) => setTimeout(r, 1200))]);
  const picked = choice && typeof choice === 'object' ? list.find((s) => s.id === choice.id) : null;
  if (!picked || wc.isDestroyed()) return deny();
  const wantAudio = choice.audio === true && !!request.audioRequested;
  if (picked.kind === 'tab') {
    // Cet onglet : pas besoin de l'accord du système, et la fin du partage est observable.
    let main = null;
    try { main = wc.mainFrame; } catch {}
    if (!main) return deny();
    capture.mark(wc, 'screen', { self: true });
    return reply(wantAudio ? { video: main, audio: main } : { video: main });
  }
  capture.mark(wc, 'screen');
  return reply(wantAudio && audio.screen ? { video: picked.source, audio: 'loopback' } : { video: picked.source });
}

function attach(ses) {
  ses.setDisplayMediaRequestHandler((request, callback) => {
    // Dit tout de suite (appel synchrone) à permissions.js que cette demande
    // « media » était bien un partage d'écran, et non l'ancienne capture directe.
    permissions.noteDisplay();
    handle(request, callback).catch((err) => { console.error('[orbe] partage d’écran', err); try { callback(null); } catch {} });
  }, { useSystemPicker: false });
}

function setup({ test = false, toast } = {}) {
  env.test = test;
  if (toast) env.toast = toast;
  // Tests : pas de capture de l'écran de la machine (ni de question du système).
  if (test) env.sources = async () => [];
}

module.exports = { attach, setup, env, internals: { handle } };
