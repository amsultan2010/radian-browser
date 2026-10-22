// Fusibles d'Electron : interrupteurs gravés dans le binaire, lus au démarrage.
// Ils suivent une sentinelle : un octet de version, un octet de longueur, puis
// un caractère par fusible (« 1 » actif, « 0 » coupé, « r » retiré). On coupe
// ceux qui feraient d'Orbe un Node.js à tout faire pour un autre programme
// (ELECTRON_RUN_AS_NODE, NODE_OPTIONS, --inspect) : il lirait sinon le coffre
// de mots de passe sous l'identité d'Orbe.
// Sur macOS, à faire avant la signature (binaire « Electron Framework ») ;
// sous Windows, la table est dans Orbe.exe.
const fs = require('fs');

const FUSE_SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
const FUSES_OFF = { 0: 'RunAsNode', 2: 'EnableNodeOptionsEnvironmentVariable', 3: 'EnableNodeCliInspectArguments' };

function fuseWires(buf) {
  const found = [];
  for (let at = buf.indexOf(FUSE_SENTINEL); at >= 0; at = buf.indexOf(FUSE_SENTINEL, at + 1)) {
    const start = at + FUSE_SENTINEL.length;
    const length = buf[start + 1];
    // Une vraie table : version 1, puis seulement des « 0 », « 1 » ou « r ».
    const states = buf.subarray(start + 2, start + 2 + length);
    if (buf[start] === 1 && length >= 4 && length < 64 && [...states].every((c) => c === 0x30 || c === 0x31 || c === 0x72)) found.push({ start: start + 2, length });
  }
  return found;
}

// Coupe les fusibles dans un tampon (modifié sur place) ; rend le nombre de tables.
function cutFusesIn(buf) {
  const wires = fuseWires(buf);
  for (const w of wires) for (const i of Object.keys(FUSES_OFF)) if (Number(i) < w.length && buf[w.start + Number(i)] === 0x31) buf[w.start + Number(i)] = 0x30;
  return wires.length;
}

function cutFuses(file) {
  const buf = fs.readFileSync(file);
  if (!cutFusesIn(buf)) throw new Error('Fusibles introuvables dans ' + file);
  fs.writeFileSync(file, buf);
}

// État des fusibles (une chaîne par table) ; échoue si l'un de ceux à couper est encore actif.
function fuseStates(buf, label = 'ce binaire') {
  const wires = fuseWires(buf);
  if (!wires.length) throw new Error('Fusibles introuvables dans ' + label);
  return wires.map((w) => {
    const states = buf.subarray(w.start, w.start + w.length).toString('latin1');
    for (const [i, name] of Object.entries(FUSES_OFF)) if (states[i] === '1') throw new Error(`Fusible ${name} encore actif`);
    return states;
  });
}

// Relit le fichier et affiche l'état.
function checkFuses(file) {
  for (const states of fuseStates(fs.readFileSync(file), file)) console.log('Fusibles : ' + states + ' (coupés : ' + Object.values(FUSES_OFF).join(', ') + ')');
}

module.exports = { FUSE_SENTINEL, FUSES_OFF, fuseWires, cutFusesIn, cutFuses, fuseStates, checkFuses };
