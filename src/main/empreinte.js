// Empreinte mémoire réelle des processus (MEM-8).
//
// `app.getAppMetrics()` ne donne sur macOS que la mémoire résidente : elle compte
// les pages partagées entre processus (une soixantaine de Mo de trop par onglet
// léger) et oublie la mémoire compressée d'un onglet caché (de moins en moins, à
// mesure que le système la compresse). Le budget mémoire de la veille se
// déclenchait donc trop tôt avec beaucoup d'onglets légers, trop tard avec des
// onglets lourds restés cachés.
//
// Ce qu'Electron 44 expose, relevé dans electron.d.ts :
//   - `app.getAppMetrics()[].memory` : `workingSetSize` partout, `privateBytes`
//     sous Windows seulement (c'est la bonne valeur, déjà utilisée) ;
//   - `process.getProcessMemoryInfo()` : la mémoire propre (`private`), mais du
//     seul processus qui l'appelle — rien, depuis le processus principal, pour un
//     autre processus ni pour un `webContents` ;
// d'où, sur macOS, la colonne MEM de `top` (l'empreinte, celle du Moniteur
// d'activité), lue par un processus à part, donc hors du fil principal.
//
// `top` relève tous les processus de la machine : une seconde de processeur par
// appel (mesuré). Il n'est donc appelé que lorsque c'est utile (voir `due`) : au
// plus toutes les cinq minutes, toutes les minutes seulement près du budget.
// À défaut de relevé récent, l'appelant retombe sur la mémoire résidente.
const { execFile } = require('child_process');

const TOP = '/usr/bin/top';
const FRESH = 6 * 60e3; // au-delà, un relevé ne vaut plus
const SLOW = 5 * 60e3; // cadence ordinaire
const FAST = 60e3; // cadence près du budget
const NEAR = 0.6; // « près du budget » : 60 %

const UNIT = { B: 1 / 1048576, K: 1 / 1024, M: 1, G: 1024, T: 1048576 };

// Sortie de `top -l 1 -stats pid,mem` -> Map(pid -> Mo). Les lignes « 1234  56M+ »
// (les signes + et - marquent une variation) ; tout le reste est ignoré.
function parse(text) {
  const out = new Map();
  for (const line of String(text || '').split('\n')) {
    const m = /^\s*(\d+)\*?\s+(\d+(?:\.\d+)?)([BKMGT])[+-]?\s*$/.exec(line);
    if (m) out.set(Number(m[1]), Number(m[2]) * UNIT[m[3]]);
  }
  return out;
}

const state = { at: 0, byPid: new Map(), total: 0, running: null, failed: 0, runs: 0, exec: execFile };
const key = (pid, born) => pid + ':' + Math.round(born || 0);

// Faut-il un nouveau relevé ? `budgetMb` : 0 si le budget est coupé (aucun relevé n'est alors utile).
function due({ budgetMb = 0, tabs = 0, minTabs = 0, now = Date.now() } = {}) {
  if (process.platform !== 'darwin' || !budgetMb || tabs <= minTabs || state.running) return false;
  if (state.failed >= 3) return false; // `top` absent ou muet : on n'insiste pas
  const age = now - state.at;
  if (!state.at || age >= SLOW) return true;
  return state.total >= budgetMb * NEAR && age >= FAST;
}

// Relève l'empreinte des processus `procs` : [{ pid, creationTime }]. Ne rejette jamais.
function refresh(procs) {
  if (process.platform !== 'darwin' || !procs.length) return Promise.resolve(false);
  if (state.running) return state.running;
  const args = ['-l', '1', '-stats', 'pid,mem'];
  for (const p of procs) args.push('-pid', String(p.pid));
  state.runs += 1;
  state.running = new Promise((resolve) => {
    state.exec(TOP, args, { timeout: 8000, maxBuffer: 4 << 20, windowsHide: true }, (err, stdout) => {
      state.running = null;
      const read = err ? new Map() : parse(stdout);
      if (!read.size) { state.failed += 1; return resolve(false); }
      state.failed = 0;
      state.byPid = new Map();
      state.total = 0;
      for (const p of procs) {
        if (!read.has(p.pid)) continue;
        state.byPid.set(key(p.pid, p.creationTime), read.get(p.pid));
        state.total += read.get(p.pid);
      }
      state.at = Date.now();
      resolve(true);
    });
  });
  return state.running;
}

// Empreinte connue de ce processus (Mo), ou undefined : relevé trop ancien, ou
// processus né depuis (un numéro de processus peut resservir : la date de
// naissance fait partie de la clé).
function of(pid, creationTime, now = Date.now()) {
  if (!state.at || now - state.at > FRESH) return undefined;
  return state.byPid.get(key(pid, creationTime));
}

module.exports = { parse, due, refresh, of, state, FRESH, SLOW, FAST, NEAR };
