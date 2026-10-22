// Mise en veille des onglets : qui endormir, et pourquoi.
//
// Un onglet en veille garde sa ligne dans la barre latérale ; sa page est
// détruite et rechargée au retour. Trois règles, dans cet ordre :
//   1. le nombre : pas plus de `max` onglets vivants (réglage « maxLiveTabs ») ;
//   2. l'ancienneté : un onglet qui n'a plus été affiché depuis `idleMs` s'endort
//      (`lastUsed` est le dernier instant où il était à l'écran, pas sa dernière activation) ;
//   3. la mémoire : tant que les processus des onglets dépassent `budgetMb`,
//      les plus anciens s'endorment, sans descendre sous `MIN_LIVE` vivants.
//
// Les sites qui restent éveillés (keepalive.js : liste d'Orbe et liste de l'utilisateur) comptent
// comme des onglets où l'on a agi : les règles 2 et 3 les épargnent, la règle 1 ne les prend qu'en dernier.
//
// Jamais touchés, par aucune règle (`kept`, calculé dans window.js) : les onglets
// affichés, ceux qui jouent du son ou sont en image dans l'image, ceux dont les
// outils de développement sont ouverts, qui capturent l'écran, la caméra ou le
// micro, qui sont filmés par une autre page, ou d'où part un téléchargement en cours.
//
// Ce qui protège un travail en cours, et ce qui ne le protège pas :
//   - les règles 2 et 3 agissent sans que l'utilisateur ait rien demandé. Elles
//     épargnent tout onglet où il a AGI depuis le chargement de la page (`typed`) :
//     une touche reçue par la page (lettre, AltGr, coller, Suppr, Entrée, saisie
//     assistée) ou un bouton de souris. Seuls les onglets simplement lus (défilement)
//     ou jamais touchés peuvent donc s'endormir d'eux-mêmes. `typed` vaut aussi pour
//     une page qui charge encore (envoi de formulaire, de fichier) ;
//   - en plus, la page est consultée (beforeunload) : si elle s'y oppose, elle reste,
//     sans question posée, et n'est plus proposée avant sa prochaine navigation ;
//   - non couvert : une page modifiée sans clavier ni souris (dictée, données
//     arrivées du réseau, script) et qui ne déclare pas beforeunload ;
//   - la règle 1 (limite choisie par l'utilisateur) endort d'abord les onglets où
//     il n'a pas agi, mais doit tenir la limite : s'il n'en reste pas d'autre, un
//     onglet où il a agi s'endort aussi, comme avant.
//
// `pick` ne dépend pas d'Electron : il reçoit des relevés et rend des
// identifiants, ce qui le rend vérifiable sans navigateur.

const MIN_LIVE = 4;

// Économie de batterie (comme dans Arc, sous 20 %) : sur batterie et sous ce seuil, un
// onglet resté caché dix minutes s'endort, au lieu d'attendre le délai choisi. Seule la
// règle d'ancienneté est resserrée : elle épargne les onglets où l'on a agi et consulte
// la page ; la limite en nombre, qui ne consulte personne, n'est pas touchée.
const SAVER_LEVEL = 0.2;
const SAVER_IDLE = 10 * 60 * 1000;
// `battery` : { level: 0 à 1, charging } relevé par l'interface ; rien de lisible : pas d'économie.
function saving(battery, enabled = true) {
  return !!enabled && !!battery && battery.charging === false && Number.isFinite(battery.level) && battery.level >= 0 && battery.level < SAVER_LEVEL;
}
// Délai d'ancienneté à appliquer : celui du réglage (0 : jamais), ramené à dix minutes en économie de batterie.
function idleFor(hours, saver) {
  const ms = (Number(hours) || 0) * 36e5;
  return saver ? (ms ? Math.min(ms, SAVER_IDLE) : SAVER_IDLE) : ms;
}

// `tabs` : [{ id, lastUsed, mb, kept, typed }] — `mb` : mémoire propre à l'onglet (0 si inconnue).
// `totalMb` : mémoire de l'ensemble des processus d'onglets (les processus partagés comptés une fois).
// Renvoie [{ id, why }] dans l'ordre d'endormissement ; why : 'count', 'idle' ou 'memory'.
function pick(tabs, { max = Infinity, idleMs = 0, budgetMb = 0, totalMb = 0, now = Date.now() } = {}) {
  const out = [];
  const asleep = new Set();
  let alive = tabs.length;
  let total = totalMb;
  const sleep = (t, why) => { asleep.add(t.id); alive -= 1; total -= t.mb || 0; out.push({ id: t.id, why }); };
  const oldest = tabs.filter((t) => !t.kept).sort((a, b) => a.lastUsed - b.lastUsed);
  // Limite en nombre : d'abord les onglets où l'utilisateur n'a pas agi.
  for (const t of [...oldest.filter((x) => !x.typed), ...oldest.filter((x) => x.typed)]) {
    if (alive <= max) break;
    sleep(t, 'count');
  }
  if (idleMs > 0) {
    for (const t of oldest) if (!asleep.has(t.id) && !t.typed && now - t.lastUsed > idleMs) sleep(t, 'idle');
  }
  if (budgetMb > 0) {
    for (const t of oldest) {
      if (total <= budgetMb || alive <= MIN_LIVE) break;
      if (asleep.has(t.id) || t.typed) continue;
      sleep(t, 'memory');
    }
  }
  return out;
}

// Budget mémoire des onglets, en Mo : une part de la mémoire de la machine.
function budget(totalBytes, percent) {
  return Math.round((totalBytes / 1048576) * (percent / 100));
}

module.exports = { pick, budget, MIN_LIVE, saving, idleFor, SAVER_LEVEL, SAVER_IDLE };
