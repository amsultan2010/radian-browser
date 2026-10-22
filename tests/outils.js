// Outils communs aux scénarios de bout en bout (processus principal).
const garde = require('../src/main/test-guard');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NEVER = Symbol('sans réponse');

// Attend qu'une condition devienne vraie ; renvoie sa valeur.
// La condition elle-même est bornée : une page qui ne répond jamais à un
// executeJavaScript donnait une attente sans fin, que seul le garde-fou général
// arrêtait, sans dire où. L'attente en cours est connue de la garde (src/main/test-guard.js).
async function until(fn, label, timeout = 8000) {
  const t0 = Date.now();
  const done = garde.waiting(label);
  let mute = 0;
  try {
    for (;;) {
      let v;
      let timer;
      const left = Math.max(50, timeout - (Date.now() - t0));
      try {
        v = await Promise.race([
          Promise.resolve().then(fn),
          new Promise((r) => { timer = setTimeout(() => r(NEVER), left + 2000); }),
        ]);
      } catch { v = false; }
      clearTimeout(timer);
      if (v === NEVER) { v = false; mute += 1; }
      if (v) return v;
      if (Date.now() - t0 > timeout) throw new Error('Délai dépassé : ' + label + (mute ? ' (la condition n’a jamais répondu)' : ''));
      await sleep(40);
    }
  } finally { done(); }
}

// --- Milieu de l'essai ------------------------------------------------------------
// Écran verrouillé, en veille ou fenêtre recouverte : Chromium ne présente plus
// aucune image de la fenêtre, ralentit ses minuteries à une par seconde, ne
// capture rien et le système ne joue aucun son. Les vérifications qui ont besoin
// d'un écran vivant ne peuvent alors rien prouver : elles sont ignorées, une par
// une et avec la raison — jamais en silence, jamais en élargissant un seuil.
// La mesure est faite une fois, dans la coque : images présentées
// (requestAnimationFrame) et cadence d'une minuterie de 20 ms.
let measured = null;
const PROBE = `(async () => {
  const t0 = performance.now();
  let frames = 0, stop = false, ticks = 0;
  const frame = () => { frames += 1; if (!stop) requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  await new Promise((done) => {
    const id = setInterval(() => { ticks += 1; if (ticks >= 25) { clearInterval(id); done(); } }, 20);
    setTimeout(() => { clearInterval(id); done(); }, 1500);
  });
  stop = true;
  return { frames, ticks, ms: Math.round(performance.now() - t0), visible: document.visibilityState };
})()`;
// Lit la mesure : 25 tics de 20 ms font une demi-seconde ; écran vivant, au moins
// dix images sont présentées dans ce temps.
function juger(m) {
  if (!m) m = { frames: 0, ticks: 0, ms: 6000, visible: 'sans réponse' };
  const vivant = m.frames >= 10 && m.ticks >= 25 && m.ms < 1200;
  return {
    ...m,
    vivant,
    raison: vivant ? '' : `écran inactif : ${m.frames} image(s) présentée(s), minuteries ${m.ticks >= 25 && m.ms < 1200 ? 'normales' : 'ralenties'}`,
    resume: `${m.frames} image(s) présentée(s), ${m.ticks}/25 tics de 20 ms en ${m.ms} ms, page « ${m.visible} » → ${vivant ? 'écran vivant' : 'ÉCRAN INACTIF : les vérifications qui en dépendent seront ignorées'}`,
  };
}
// Une machine occupée (démarrage) peut manquer une mesure : l'écran n'est dit
// inactif que si trois mesures de suite le disent.
async function mesurer(sonde) {
  let j = null;
  for (let i = 0; i < 3; i++) {
    let m = null;
    try { m = await Promise.race([sonde(), sleep(6000).then(() => null)]); } catch {}
    j = juger(m);
    if (j.vivant) break;
    await sleep(700);
  }
  return j;
}
// Session verrouillée, dit par le système.
function verrouillee() {
  // macOS : l'état de la session figure au registre du système (powerMonitor ne le
  // voit pas quand Orbe est lancé hors de la session graphique, par un terminal distant).
  if (process.platform === 'darwin') {
    try {
      const out = require('child_process').execFileSync('/usr/sbin/ioreg', ['-n', 'Root', '-d1'], { encoding: 'utf8', timeout: 5000 });
      if (/"CGSSessionScreenIsLocked"\s*=\s*Yes/.test(out)) return true;
    } catch {}
  }
  try { return require('electron').powerMonitor.getSystemIdleState(24 * 3600) === 'locked'; } catch { return false; }
}
async function milieu(w) {
  if (measured) return measured;
  measured = await mesurer(() => w.ui.webContents.executeJavaScript(PROBE));
  // Session verrouillée : même si la coque présente encore des images, les pages
  // des onglets ne sont plus peintes ni capturées, et aucun son n'est joué.
  // `images` : la coque présente des images (ses animations se vérifient).
  // `vivant` : de plus, la session n'est pas verrouillée (pages peintes, capturables, son joué).
  measured.images = measured.vivant;
  measured.sansImages = measured.raison;
  measured.verrouille = verrouillee();
  if (measured.verrouille) {
    measured.vivant = false;
    measured.raison = 'session verrouillée : pages ni peintes ni capturées, aucun son joué';
  }
  measured.muet = measured.raison;
  console.log(`  – milieu de l’essai : ${measured.resume}${measured.verrouille ? ' ; SESSION VERROUILLÉE : les vérifications qui ont besoin d’un écran vivant ou du son seront ignorées' : ''}`);
  return measured;
}

// --- Profil prêt -----------------------------------------------------------------
// À appeler avant la première page d'un scénario. Une requête n'est envoyée
// qu'une fois le magasin de témoins de la session ouvert (relevé sur 240
// démarrages sous Windows : la page arrive toujours après lui, 70 ms plus tard en
// médiane). Son ouverture prend d'ordinaire moins d'une seconde, parfois plus de
// huit sur une machine d'intégration : la première page dépassait alors son
// délai. On attend donc le profil, et on le dit s'il tarde.
let pret = null;
function profilPret(w) {
  if (pret) return pret;
  const t0 = Date.now();
  const fin = garde.waiting('magasin de témoins du profil');
  pret = Promise.race([w.session.cookies.get({}).then(() => true, () => true), sleep(60000).then(() => false)]).then((ok) => {
    fin();
    if (!ok) throw new Error('Délai dépassé : magasin de témoins du profil toujours fermé après 60 s');
    const ms = Date.now() - t0;
    if (ms > 3000) console.log(`  – profil prêt après ${ms} ms (magasin de témoins lent à s’ouvrir)`);
    return ms;
  });
  return pret;
}

// Vérification ignorée : dite, avec sa raison, et comptée.
function ignorer(nom, raison) {
  garde.state.skipped.push({ nom, raison });
  console.log(`  – ignoré : ${nom} (${raison})`);
}

module.exports = { sleep, until, milieu, ignorer, ignores: garde.state.skipped, PROBE, juger, mesurer, profilPret };
