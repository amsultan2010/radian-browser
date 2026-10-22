// Garde des essais : n'agit qu'en mode test (chargée par main.js avec --selftest).
//
// Un essai qui n'avance plus doit dire pourquoi. Cette garde :
//  - interdit toute boîte de dialogue native : sans réponse préparée par
//    l'essai, la demande est refusée (réponse « Annuler »), notée, et fait
//    échouer le scénario — personne n'est là pour répondre à une vraie boîte ;
//  - suit ce que le scénario attend (attentes de tests/outils.js, appels
//    executeJavaScript sans réponse) ;
//  - arrête le scénario s'il ne produit plus rien, en décrivant l'état du
//    processus principal : dernière vérification, attentes, fenêtres, pages ;
//  - écrit un battement dans un fichier (ORBE_HEARTBEAT) : le lanceur
//    (scripts/dev.js) y voit si le fil principal lui-même est figé, ce
//    qu'aucun minuteur de ce processus ne peut signaler.
const fs = require('fs');

const state = {
  started: Date.now(),
  last: '(aucune vérification encore)', // dernière ligne « ✓ / ✗ » écrite
  lastAt: Date.now(),
  waits: new Map(), // attentes en cours : jeton -> { label, since }
  scripts: new Map(), // executeJavaScript sans réponse : jeton -> { wc, code, since }
  dialogs: [], // boîtes de dialogue demandées sans réponse préparée
  errors: [], // exceptions non rattrapées du processus principal (tenu par main.js)
  skipped: [], // vérifications ignorées (avec la raison)
  notes: [], // faits utiles au diagnostic (fermetures de fenêtres…)
};
let seq = 0;

const ago = (t) => `${((Date.now() - t) / 1000).toFixed(1)} s`;

// --- Attentes ---------------------------------------------------------------
function waiting(label) {
  const token = ++seq;
  state.waits.set(token, { label, since: Date.now() });
  return () => state.waits.delete(token);
}

function note(text) {
  state.notes.push(`${new Date().toISOString().slice(11, 23)} ${text}`);
  if (state.notes.length > 300) state.notes.shift();
}

// --- Boîtes de dialogue -------------------------------------------------------
// Réponse de refus pour chaque fonction ; `sync` : la valeur est rendue telle quelle.
const REFUSALS = {
  showMessageBox: (o) => ({ response: cancelOf(o), checkboxChecked: false }),
  showMessageBoxSync: (o) => cancelOf(o),
  showOpenDialog: () => ({ canceled: true, filePaths: [] }),
  showOpenDialogSync: () => undefined,
  showSaveDialog: () => ({ canceled: true, filePath: '' }),
  showSaveDialogSync: () => undefined,
  showErrorBox: () => undefined,
  showCertificateTrustDialog: () => undefined,
};
function cancelOf(o) {
  if (o && Number.isInteger(o.cancelId)) return o.cancelId;
  const n = o && Array.isArray(o.buttons) ? o.buttons.length : 0;
  return n ? n - 1 : 0;
}

function guardDialogs(dialog) {
  for (const [name, refuse] of Object.entries(REFUSALS)) {
    if (typeof dialog[name] !== 'function') continue;
    const sync = /Sync$|showErrorBox/.test(name);
    const guarded = (...args) => {
      const opts = args.find((a) => a && typeof a === 'object' && !(typeof a.isDestroyed === 'function')) || {};
      // showErrorBox(titre, contenu) : c'est aussi la boîte qu'Electron ouvre de lui-même
      // pour une exception non rattrapée du processus principal — bloquante sous Windows.
      const what = name === 'showErrorBox' ? `${args[0]} — ${String(args[1]).split('\n').slice(0, 14).join(' | ')}` : String(opts.message || opts.title || '');
      const where = String(new Error().stack).split('\n').slice(2, 6).map((l) => l.trim()).join(' < ');
      state.dialogs.push({ name, what, where });
      console.error(`\n[orbe-test] boîte de dialogue native demandée sans réponse préparée : ${name} « ${what} »\n    ${where}`);
      const answer = refuse(opts);
      return sync ? answer : Promise.resolve(answer);
    };
    guarded.orbeGuard = true;
    dialog[name] = guarded;
  }
}

// --- Appels executeJavaScript sans réponse -----------------------------------
const orphans = new WeakMap(); // page -> appels en attente, à rendre si elle est détruite
function trackScripts(app) {
  let patched = false;
  app.on('web-contents-created', (e, wc) => {
    if (patched) return;
    const proto = Object.getPrototypeOf(wc);
    const real = proto.executeJavaScript;
    if (typeof real !== 'function') return;
    patched = true;
    proto.executeJavaScript = function executeJavaScript(code, ...rest) {
      const token = ++seq;
      let id = '?';
      try { id = this.id; } catch {}
      state.scripts.set(token, { wc: id, code: String(code).replace(/\s+/g, ' ').slice(0, 140), since: Date.now() });
      const done = () => state.scripts.delete(token);
      let p;
      try { p = real.call(this, code, ...rest); } catch (err) { done(); throw err; }
      p.then(done, done);
      // Page détruite avant d'avoir répondu (le script ferme sa propre fenêtre, par
      // exemple) : Electron ne règle jamais la promesse, et qui l'attend attend
      // toujours. En test, elle est alors rendue sans valeur, et le fait est noté.
      return new Promise((resolve, reject) => {
        const lost = () => { if (state.scripts.has(token)) { note(`page n° ${id} détruite avant la réponse à : ${state.scripts.get(token).code}`); done(); resolve(undefined); } };
        let waiting = orphans.get(this);
        if (!waiting) {
          waiting = new Set();
          orphans.set(this, waiting);
          const all = waiting;
          try { this.once('destroyed', () => { for (const fn of [...all]) fn(); all.clear(); }); } catch {}
        }
        waiting.add(lost);
        const settle = (fn) => (v) => { waiting.delete(lost); fn(v); };
        p.then(settle(resolve), settle(reject));
      });
    };
  });
}

// --- État du processus principal ----------------------------------------------
function describe() {
  const { BaseWindow, webContents } = require('electron');
  const lines = [];
  lines.push(`dernière vérification (il y a ${ago(state.lastAt)}) : ${state.last}`);
  lines.push(`scénario lancé depuis ${ago(state.started)}`);
  const waits = [...state.waits.values()];
  lines.push(`attentes en cours : ${waits.length ? '' : 'aucune'}`);
  for (const w of waits) lines.push(`  · « ${w.label} » depuis ${ago(w.since)}`);
  const scripts = [...state.scripts.values()].filter((s) => Date.now() - s.since > 1000);
  lines.push(`executeJavaScript sans réponse depuis plus d'une seconde : ${scripts.length ? '' : 'aucun'}`);
  for (const s of scripts) lines.push(`  · page ${s.wc}, depuis ${ago(s.since)} : ${s.code}`);
  lines.push(`boîtes de dialogue natives demandées sans réponse préparée : ${state.dialogs.length ? '' : 'aucune'}`);
  for (const d of state.dialogs) lines.push(`  · ${d.name} « ${d.what} » — ${d.where}`);
  lines.push(`exceptions non rattrapées : ${state.errors.length ? '' : 'aucune'}`);
  for (const e of state.errors) lines.push(`  · ${String(e).split('\n').slice(0, 6).join(' | ')}`);
  try {
    const wins = BaseWindow.getAllWindows();
    lines.push(`fenêtres : ${wins.length}`);
    for (const w of wins) {
      let d = `  · n° ${w.id}`;
      try {
        d += w.isDestroyed() ? ' détruite' : ` « ${w.getTitle()} » ${w.isVisible() ? 'visible' : 'masquée'}${w.isFocused() ? ', au premier plan' : ''}${w.isModal() ? ', modale' : ''}${w.isEnabled() ? '' : ', DÉSACTIVÉE (boîte modale ouverte ?)'} ${JSON.stringify(w.getBounds())}, ${w.contentView ? w.contentView.children.length : '?'} vue(s)`;
      } catch (err) { d += ' (illisible : ' + err.message + ')'; }
      lines.push(d);
    }
  } catch (err) { lines.push('fenêtres illisibles : ' + err.message); }
  try {
    const all = webContents.getAllWebContents();
    lines.push(`pages (webContents) : ${all.length}`);
    for (const wc of all) {
      let d = `  · n° ${wc.id}`;
      try {
        d += wc.isDestroyed() ? ' détruite' : ` ${wc.getType()} ${wc.isLoading() ? 'en chargement' : 'chargée'}${wc.isCrashed() ? ', PLANTÉE' : ''}${wc.isWaitingForResponse() ? ', attend une réponse' : ''} ${String(wc.getURL()).slice(0, 110)}`;
      } catch (err) { d += ' (illisible : ' + err.message + ')'; }
      lines.push(d);
    }
  } catch (err) { lines.push('pages illisibles : ' + err.message); }
  if (state.notes.length) {
    lines.push('derniers faits notés :');
    for (const n of state.notes.slice(-40)) lines.push('  · ' + n);
  }
  return lines.join('\n');
}

// --- Mise en place -------------------------------------------------------------
function install({ app, dialog, limit, stall }) {
  guardDialogs(dialog);
  trackScripts(app);

  // Chaque ligne de résultat écrite par un scénario est une preuve d'avancement.
  for (const stream of ['log', 'error']) {
    const real = console[stream].bind(console);
    console[stream] = (...args) => {
      const first = typeof args[0] === 'string' ? args[0] : '';
      if (/^\s*[✓✗–]/.test(first)) {
        state.lastAt = Date.now();
        if (/^\s*[✓✗]/.test(first)) state.last = first.trim().slice(0, 200);
      }
      real(...args);
    };
  }

  // Qui ferme une fenêtre, et quand elle l'est vraiment.
  const { BaseWindow } = require('electron');
  const caller = () => String(new Error().stack).split('\n').slice(3, 6).map((l) => l.trim().replace(/^at /, '')).join(' < ');
  for (const m of ['close', 'destroy']) {
    const real = BaseWindow.prototype[m];
    BaseWindow.prototype[m] = function guarded(...args) {
      let id = '?';
      try { id = this.id; } catch {}
      note(`fenêtre n° ${id} : ${m}() demandé par ${caller()}`);
      if (m === 'close' && !this.orbeNoted) { this.orbeNoted = true; try { this.once('closed', () => note(`fenêtre n° ${id} : fermée (closed)`)); } catch {} }
      return real.apply(this, args);
    };
  }
  // Vie des pages : navigations du cadre principal, fins et échecs de chargement.
  app.on('web-contents-created', (e, wc) => {
    const id = wc.id;
    const short = (u) => String(u).slice(0, 90);
    note(`page n° ${id} créée (${wc.getType()})`);
    wc.on('did-start-navigation', (ev, url, inPlace, mainFrame) => { if (mainFrame && !inPlace) note(`page n° ${id} : navigation vers ${short(url)}`); });
    wc.on('did-finish-load', () => { try { note(`page n° ${id} : chargée, ${short(wc.getURL())}`); } catch {} });
    wc.on('did-fail-load', (ev, code, desc, url, mainFrame) => { if (mainFrame) note(`page n° ${id} : ÉCHEC du chargement ${code} ${desc}, ${short(url)}`); });
    wc.on('unresponsive', () => note(`page n° ${id} : ne répond plus`));
    wc.on('destroyed', () => note(`page n° ${id} : détruite`));
  });
  app.on('render-process-gone', (e, wc, details) => note(`processus de rendu perdu (page ${wc.id}) : ${details.reason}, code ${details.exitCode}`));
  app.on('child-process-gone', (e, details) => note(`processus auxiliaire perdu : ${details.type} ${details.reason}, code ${details.exitCode}`));
  process.on('unhandledRejection', (err) => note(`promesse rejetée sans suite : ${String((err && err.stack) || err).split('\n').slice(0, 3).join(' | ')}`));

  const stop = (why) => {
    console.error(`\nÉCHEC : ${why}\n\nÉtat du processus principal :\n${describe()}\n`);
    app.exit(3);
  };
  // Durée totale, et silence trop long (ORBE_TEST_STALL, en secondes).
  setTimeout(() => stop(`scénario bloqué depuis ${limit} s`), limit * 1000).unref();
  setInterval(() => {
    if (Date.now() - state.lastAt > stall * 1000) stop(`plus aucune vérification depuis ${stall} s`);
  }, 1000).unref();

  // Battement pour le lanceur : tant que ce fichier est récrit, le fil principal vit.
  const beat = process.env.ORBE_HEARTBEAT;
  if (beat) {
    // Écrit à côté puis renommé : le lanceur ne lit jamais un fichier à moitié écrit.
    const write = () => { try { fs.writeFileSync(beat + '.tmp', `${Date.now()}\n${state.last}\n`); fs.renameSync(beat + '.tmp', beat); } catch {} };
    write();
    setInterval(write, 500).unref();
  }
}

module.exports = { install, state, waiting, note, describe };
