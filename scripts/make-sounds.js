#!/usr/bin/env node
// Fabrique les sons d'Orbe (originaux, synthétisés ici : aucun fichier tiers,
// aucun son repris d'une autre application).
//   node scripts/make-sounds.js  -> src/renderer/sons/*.wav
// Chaque son est court (moins d'une demi-seconde), discret, et mixé comme les
// autres : même niveau moyen (LEVEL), crête bornée (PEAK), début et fin à zéro
// (aucun claquement). Les
// fichiers sont en mono, 16 bits, 44,1 kHz ; le calcul est déterministe, les
// fichiers produits sont donc toujours les mêmes.
const fs = require('fs');
const path = require('path');

const RATE = 44100;
const PEAK = 0.5; // crête que nul son ne dépasse (−6 dB)
const LEVEL = 0.075; // puissance moyenne visée (valeur efficace)
const TAU = 2 * Math.PI;

function wav(samples, rate = RATE) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

// Lit un fichier produit par ce script : échantillons entre −1 et 1.
function read(buf) {
  const n = buf.readUInt32LE(40) / 2;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(44 + i * 2) / 32767;
  return { rate: buf.readUInt32LE(24), channels: buf.readUInt16LE(22), samples: out };
}

// Bruit blanc à suite fixe.
function noiseSource(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 1073741823 - 1; };
}

// Calcule `seconds` de son : fn(t, i) -> échantillon ; puis fondu de 3 ms aux deux
// bouts et mise à la crête commune.
function render(seconds, fn) {
  const n = Math.round(RATE * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / RATE, i);
  const edge = Math.round(RATE * 0.003);
  for (let i = 0; i < edge; i++) { out[i] *= i / edge; out[n - 1 - i] *= i / edge; }
  // Même niveau perçu pour tous : on vise une puissance moyenne commune (LEVEL),
  // sans jamais dépasser la crête commune.
  let max = 0;
  let power = 0;
  for (const v of out) { max = Math.max(max, Math.abs(v)); power += v * v; }
  const rms = Math.sqrt(power / n);
  const gain = max ? Math.min(PEAK / max, LEVEL / rms) : 0;
  return out.map((v) => v * gain);
}

// Note qui s'éteint : sinus (et un peu d'octave) à partir de `at`.
const pluck = (t, at, freq, decay, octave = 0.18) => {
  const d = t - at;
  if (d < 0) return 0;
  const attack = Math.min(1, d / 0.004);
  return attack * Math.exp(-d * decay) * (Math.sin(TAU * freq * d) + octave * Math.sin(TAU * freq * 2 * d));
};

const SOUNDS = {
  // Capture : deux petits clics secs (obturateur) suivis d'une note douce qui s'éteint.
  capture() {
    const noise = noiseSource(7);
    let low = 0;
    return render(0.42, (t) => {
      const click = (at) => { const d = t - at; return d < 0 ? 0 : Math.exp(-d * 420); };
      low += (noise() - low) * 0.55;
      const shutter = low * (click(0) * 0.5 + click(0.055) * 0.38);
      const tone = t > 0.06 ? Math.sin(TAU * 880 * t) * Math.exp(-(t - 0.06) * 16) * 0.16 + Math.sin(TAU * 1320 * t) * Math.exp(-(t - 0.06) * 22) * 0.07 : 0;
      return shutter + tone;
    });
  },
  // Nouvel onglet : deux notes brèves qui montent (une quinte).
  tab() {
    return render(0.16, (t) => pluck(t, 0, 740, 46) * 0.8 + pluck(t, 0.045, 1110, 40));
  },
  // Onglet fermé ou archivé : un souffle court qui descend, sur une note grave.
  close() {
    const noise = noiseSource(19);
    let band = 0;
    let low = 0;
    return render(0.15, (t) => {
      // Filtre dont la fréquence baisse : le souffle « tombe ».
      const k = 0.5 * Math.exp(-t * 22) + 0.03;
      low += (noise() - low) * k;
      band += (low - band) * 0.5;
      const body = Math.sin(TAU * (300 - 620 * t) * t) * Math.exp(-t * 34) * 0.55;
      return band * Math.exp(-t * 26) * 1.6 + body;
    });
  },
  // Changement d'Espace : un glissement feutré, comme une page que l'on tourne.
  space() {
    const noise = noiseSource(31);
    let low = 0;
    let high = 0;
    return render(0.24, (t) => {
      const x = t / 0.24;
      const swell = Math.sin(Math.PI * x) ** 2; // monte puis retombe
      const k = 0.06 + 0.3 * x; // le filtre s'ouvre pendant le geste
      low += (noise() - low) * k;
      high += (low - high) * 0.6;
      const air = high * swell * 1.4;
      const note = Math.sin(TAU * (392 + 130 * x) * t) * swell * 0.22;
      return air + note;
    });
  },
  // Épingler : un « tic » net, puis une petite note claire.
  pin() {
    const noise = noiseSource(43);
    return render(0.14, (t) => noise() * Math.exp(-t * 900) * 0.5 + pluck(t, 0.012, 1480, 55, 0.1) * 0.9);
  },
  // Désépingler : le même geste à l'envers, plus grave.
  unpin() {
    const noise = noiseSource(47);
    return render(0.14, (t) => noise() * Math.exp(-t * 900) * 0.4 + pluck(t, 0.012, 880, 50, 0.1) * 0.9);
  },
  // Refus (action impossible) : deux pulsations graves et sourdes.
  error() {
    return render(0.22, (t) => pluck(t, 0, 196, 30, 0.35) + pluck(t, 0.085, 174.6, 26, 0.35) * 0.9);
  },
};

// --- Musique de l'accueil ---------------------------------------------------------
// Une phrase de sept secondes, composée ici : quatre accords tenus (nappe douce),
// un arpège de notes claires par-dessus, une dernière note qui s'éteint. Rien n'est
// repris d'une autre application. Mono, 22,05 kHz (rien n'y dépasse 5 kHz) : le
// fichier reste léger. Niveau plus bas que les sons d'interface : c'est un fond.
const MUSIC_RATE = 22050;
const MUSIC_LEVEL = 0.05;
const MUSIC = {
  welcome() {
    const seconds = 7;
    const n = Math.round(MUSIC_RATE * seconds);
    const out = new Float32Array(n);
    const hz = (semi) => 293.66 * 2 ** (semi / 12); // ré 4 = 0
    // Accords (demi-tons depuis ré) : ré add9, si mineur 7, sol majeur 7, la sus — puis ré.
    const chords = [[-12, 0, 4, 7, 14], [-15, -3, 0, 4, 9], [-19, -5, 2, 6, 11], [-17, -5, 2, 4, 9], [-12, 0, 7, 12, 16]];
    const BAR = 1.3;
    const notes = []; // [instant, fréquence, force]
    chords.forEach((c, k) => {
      const at = k * BAR;
      const up = [c[1], c[2], c[3], c[4], c[3], c[2]];
      if (k < 4) up.forEach((semi, j) => notes.push([at + 0.12 + j * 0.2, hz(semi + 12), 0.5 + 0.12 * (j % 3)]));
      else [c[1], c[2], c[3], c[4]].forEach((semi, j) => notes.push([at + 0.1 + j * 0.16, hz(semi + 12), 0.7]));
    });
    for (let i = 0; i < n; i++) {
      const t = i / MUSIC_RATE;
      let v = 0;
      // Nappe : chaque accord monte et retombe lentement, en se fondant dans le suivant.
      chords.forEach((c, k) => {
        const d = t - k * BAR;
        if (d < -0.25 || d > BAR + 1.2) return;
        const env = Math.min(1, Math.max(0, (d + 0.25) / 0.6)) * Math.min(1, Math.max(0, (BAR + 1.2 - d) / 1.2)) * (k === 4 ? 1.1 : 1);
        for (const semi of c) {
          const f = hz(semi);
          v += env * 0.11 * (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 1.004 * t + 1.3) + 0.12 * Math.sin(TAU * f * 2 * t));
        }
      });
      // Arpège : notes claires qui s'éteignent.
      for (const [at, f, force] of notes) {
        const d = t - at;
        if (d < 0 || d > 1.6) continue;
        v += force * 0.2 * Math.min(1, d / 0.006) * Math.exp(-d * 3.4) * (Math.sin(TAU * f * d) + 0.28 * Math.sin(TAU * f * 2 * d) * Math.exp(-d * 5) + 0.08 * Math.sin(TAU * f * 3 * d) * Math.exp(-d * 9));
      }
      // Entrée en 250 ms, sortie sur la dernière seconde et demie.
      out[i] = v * Math.min(1, t / 0.25) * Math.min(1, Math.max(0, (seconds - t) / 1.5)) ** 1.5;
    }
    let max = 0;
    let power = 0;
    for (const v of out) { max = Math.max(max, Math.abs(v)); power += v * v; }
    const gain = Math.min(PEAK / max, MUSIC_LEVEL / Math.sqrt(power / n));
    return out.map((v) => v * gain);
  },
};

if (require.main === module) {
  const music = path.join(__dirname, '..', 'src', 'renderer', 'musique');
  fs.mkdirSync(music, { recursive: true });
  for (const [name, make] of Object.entries(MUSIC)) {
    const file = wav([...make()], MUSIC_RATE);
    fs.writeFileSync(path.join(music, name + '.wav'), file);
    console.log(`musique/${name}.wav  ${(file.length / 1024).toFixed(1)} Ko`);
  }
  const dir = path.join(__dirname, '..', 'src', 'renderer', 'sons');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, make] of Object.entries(SOUNDS)) {
    const file = wav([...make()]);
    fs.writeFileSync(path.join(dir, name + '.wav'), file);
    console.log(`${name}.wav  ${(file.length / 1024).toFixed(1)} Ko`);
  }
  console.log('Sons écrits dans ' + dir);
}

module.exports = { RATE, PEAK, LEVEL, SOUNDS, MUSIC, MUSIC_RATE, MUSIC_LEVEL, wav, read };
