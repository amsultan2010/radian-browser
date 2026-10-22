// Icône choisie par l'utilisateur pour un Espace, un dossier ou un onglet : un
// seul émoji. Le texte vient d'une vue de l'interface ; il est vérifié ici avant
// d'être enregistré, puis affiché comme du texte (jamais comme du HTML).
const MAX = 32; // un émoji composé (famille, drapeau de région) tient largement

const PART = String.raw`(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]️?⃣)`;
// Construits au premier émoji vérifié, pas au lancement : les tables Unicode qu'ils
// chargent coûtaient 7 ms avant la fenêtre (DEM-10), pour un geste rare.
let EMOJI = null;
let segmenter = null;
function tools() {
  if (!EMOJI) {
    EMOJI = new RegExp(`^${PART}(?:[\\u200D\\uFE0F\\u{1F3FB}-\\u{1F3FF}\\u{E0020}-\\u{E007F}]|${PART})*$`, 'u');
    segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  }
}

// Un émoji, et rien d'autre : ni lettre, ni espace, ni deux émojis à la suite.
function valid(text) {
  if (typeof text !== 'string' || !text || text.length > MAX) return false;
  tools();
  if (!EMOJI.test(text)) return false;
  let n = 0;
  for (const _ of segmenter.segment(text)) { n += 1; if (n > 1) return false; } // eslint-disable-line no-unused-vars
  return true;
}

// Ce qui est enregistré : l'émoji, ou '' (icône par défaut) ; null si le texte est refusé.
function clean(text) {
  if (text === '' || text == null) return '';
  return valid(text) ? text : null;
}

module.exports = { valid, clean, MAX, get loaded() { return !!EMOJI; } };
