#!/usr/bin/env node
// Calcule les courbes de ressort de src/renderer/base.css (variables --spring-*).
//   node scripts/make-springs.js
// Un ressort amorti (masse 1) décrit comme dans SwiftUI par sa « réponse » (période
// propre, en secondes) et sa fraction d'amortissement : raideur = (2π / réponse)²,
// amortissement = 4π × fraction / réponse. La courbe est échantillonnée sur la
// durée au bout de laquelle le ressort est au repos (écart < 0,5 %), et écrite en
// `linear()`, que le moteur interpole entre les points. Chaque variable réunit la
// durée et la courbe : `transition: transform var(--spring-snappy)`.
const SPRINGS = [
  // Panneaux, lignes, états pressés : net, sans dépassement.
  { name: 'snappy', response: 0.2, damping: 1 },
  // Grands déplacements (barre flottante, messages) : même caractère, plus posé.
  { name: 'smooth', response: 0.3, damping: 1 },
  // Éléments ludiques (tuile relâchée, icône d'Espace) : léger dépassement (≈ 5 %).
  { name: 'bouncy', response: 0.3, damping: 0.7 },
];

// Position (0 → 1) et vitesse du ressort à l'instant t, partant de 0 à la vitesse v0.
function spring(response, damping, t, v0 = 0) {
  const w = (2 * Math.PI) / response;
  if (damping >= 1) {
    const b = v0 - w; // x(t) = 1 + (a + b·t)·e^(−w·t), a = −1
    return 1 + (-1 + b * t) * Math.exp(-w * t);
  }
  const wd = w * Math.sqrt(1 - damping * damping);
  const a = -1;
  const b = (v0 + damping * w * a) / wd;
  return 1 + Math.exp(-damping * w * t) * (a * Math.cos(wd * t) + b * Math.sin(wd * t));
}

// Durée au bout de laquelle le ressort ne s'écarte plus de 0,5 % de sa cible.
function settle(response, damping) {
  let last = 0;
  for (let t = 0; t < 3; t += 0.001) if (Math.abs(1 - spring(response, damping, t)) > 0.005) last = t;
  return Math.ceil((last + 0.001) * 100) / 100;
}

function curve({ response, damping }, points = 24) {
  const d = settle(response, damping);
  const out = [];
  for (let i = 0; i <= points; i++) out.push(i === points ? 1 : Number(spring(response, damping, (d * i) / points).toFixed(3)));
  return { ms: Math.round(d * 1000), css: `linear(${out.join(', ')})` };
}

if (require.main === module) {
  for (const s of SPRINGS) {
    const c = curve(s);
    const over = Math.max(...c.css.match(/[\d.]+/g).map(Number)) - 1;
    console.log(`  /* réponse ${s.response} s, amortissement ${s.damping}${over > 0.001 ? `, dépassement ${(over * 100).toFixed(1)} %` : ', sans dépassement'} */`);
    console.log(`  --spring-${s.name}: ${c.ms}ms ${c.css};`);
  }
}

module.exports = { spring, settle, curve, SPRINGS };
