// Notes : export en fichiers texte (Aide → « Exporter les notes… », comme
// « Export Arc Notes »). Une note par fichier, nommé d'après sa première ligne.
const { dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { store } = require('./store');

const t = (key, vars) => store.t(key, null, vars);

// Boîte de dialogue du système ; remplacée pendant les tests.
const env = {
  pickFolder: async (parent, opts) => {
    const r = await (parent ? dialog.showOpenDialog(parent, opts) : dialog.showOpenDialog(opts));
    return r.canceled || !r.filePaths.length ? '' : r.filePaths[0];
  },
  reveal: (dir) => shell.openPath(dir),
};

// --- Mise en forme ------------------------------------------------------------------
// Une note mise en forme est une liste de blocs, jamais du HTML : le type de bloc
// vient d'une liste fermée, le texte reste du texte, un lien n'est gardé que s'il
// mène à une adresse web ou à un courriel. Ce qui arrive de la page (qui a pu
// recevoir un collage hostile) repasse ici avant d'être enregistré, et la page
// reconstruit son affichage élément par élément à partir de ce modèle.
const BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'todo']);
const MAX_TEXT = 200000;
const MAX_BLOCKS = 5000;
const MAX_RUNS = 400;

function safeLink(href) {
  if (typeof href !== 'string' || href.length > 2000) return '';
  let u;
  try { u = new URL(href.trim()); } catch { return ''; }
  return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.href : '';
}

function cleanBlocks(input) {
  if (!Array.isArray(input)) return null;
  const out = [];
  let room = MAX_TEXT;
  for (const b of input.slice(0, MAX_BLOCKS)) {
    if (!b || typeof b !== 'object' || !BLOCKS.has(b.t)) continue;
    const block = { t: b.t, runs: [] };
    if (b.t === 'todo' && b.done === true) block.done = true;
    for (const r of (Array.isArray(b.runs) ? b.runs : []).slice(0, MAX_RUNS)) {
      if (!r || typeof r !== 'object' || typeof r.s !== 'string' || !r.s || room <= 0) continue;
      // Ni caractère de commande (sauf le saut de ligne), ni marque de sens d'écriture qui maquillerait un lien.
      const run = { s: r.s.replace(/[\u0000-\u0009\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, room) };
      if (!run.s) continue;
      room -= run.s.length;
      if (r.b === true) run.b = true;
      if (r.i === true) run.i = true;
      const a = safeLink(r.a);
      if (a) run.a = a;
      block.runs.push(run);
    }
    out.push(block);
  }
  return out;
}

// Texte seul d'une note mise en forme : titre, recherche, export.
function plain(blocks) {
  let n = 0;
  return blocks.map((b) => {
    n = b.t === 'ol' ? n + 1 : 0;
    const mark = b.t === 'ul' ? '- ' : b.t === 'ol' ? `${n}. ` : b.t === 'todo' ? (b.done ? '[x] ' : '[ ] ') : '';
    return mark + b.runs.map((r) => r.s).join('');
  }).join('\n');
}

// Enregistre le contenu reçu de la page dans `note` : blocs vérifiés, et leur texte seul.
function setContent(note, a) {
  const blocks = cleanBlocks(a && a.blocks);
  if (blocks) {
    note.blocks = blocks;
    note.text = plain(blocks).slice(0, MAX_TEXT);
  } else {
    delete note.blocks;
    note.text = String((a && a.text) || '').slice(0, MAX_TEXT);
  }
  return note;
}

const titleOf = (note) => (String(note.text || '').split('\n').find((l) => l.trim()) || t('notes.untitled')).trim();

// Nom de fichier tiré d'un titre saisi par l'utilisateur : ni séparateur de dossier,
// ni caractère interdit, ni nom réservé de Windows, ni point en tête.
function fileName(title) {
  const base = String(title).normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+/, '').replace(/[. ]+$/, '').slice(0, 80).trim();
  if (!base || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) return t('notes.untitled');
  return base;
}

// Écrit chaque note dans `dir` (créé au besoin). Renvoie les fichiers écrits.
function writeAll(dir, notes = store.state.notes) {
  fs.mkdirSync(dir, { recursive: true });
  const used = new Set(fs.readdirSync(dir).map((n) => n.toLowerCase()));
  const files = [];
  for (const note of notes.slice().sort((a, b) => b.at - a.at)) {
    if (!String(note.text || '').trim()) continue;
    const base = fileName(titleOf(note));
    let name = base + '.txt';
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} (${i}).txt`;
    used.add(name.toLowerCase());
    const file = path.join(dir, name);
    fs.writeFileSync(file, String(note.text), { flag: 'wx' });
    const when = new Date(note.at || Date.now());
    try { fs.utimesSync(file, when, when); } catch {}
    files.push(file);
  }
  return files;
}

// « Exporter les notes… » : l'utilisateur choisit un dossier ; un sous-dossier daté y reçoit les notes.
async function exportNotes(w) {
  const count = store.state.notes.filter((n) => String(n.text || '').trim()).length;
  if (!count) { if (w) w.toast(t('notes.exportNone')); return null; }
  const parent = await env.pickFolder(w ? w.win : null, { title: t('notes.export'), buttonLabel: t('notes.exportHere'), properties: ['openDirectory', 'createDirectory'] });
  if (!parent || typeof parent !== 'string' || !path.isAbsolute(parent)) return null;
  const day = new Date().toISOString().slice(0, 10);
  let dir = path.join(parent, `${t('notes.exportFolder')} ${day}`);
  for (let i = 2; fs.existsSync(dir); i++) dir = path.join(parent, `${t('notes.exportFolder')} ${day} (${i})`);
  let files;
  try { files = writeAll(dir); } catch (err) {
    console.error('[orbe] export des notes', err.message);
    if (w) w.toast(t('notes.exportFailed'), 'error');
    return null;
  }
  if (w) w.toast(t('notes.exported', { n: files.length }));
  env.reveal(dir);
  return { dir, files };
}

module.exports = { cleanBlocks, plain, setContent, safeLink, exportNotes, writeAll, fileName, titleOf, env };
