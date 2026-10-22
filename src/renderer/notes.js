// Notes : textes mis en forme (titres, gras, italique, listes, cases à cocher,
// liens), enregistrés au fil de la frappe.
// Une note est une liste de blocs — { t: type, runs: [{ s: texte, b, i, a }] } —
// et jamais du HTML : la zone de saisie est relue élément par élément vers ce
// modèle (ce qui n'y figure pas devient du simple texte), et l'affichage est
// reconstruit avec createElement / textContent. Un collage n'apporte que du texte.
const $ = (id) => document.getElementById(id);
let notes = [];
let current = null;
let timer = null;

const titleOf = (n) => (n.text.split('\n').map((l) => l.replace(/^(- |\d+\. |\[[ x]\] )/, '')).find((l) => l.trim()) || t('notes.untitled')).slice(0, 80);

// --- Modèle <-> zone de saisie -------------------------------------------------------
const TYPES = ['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'todo'];
const BLOCK_TAGS = { P: 'p', DIV: 'p', H1: 'h1', H2: 'h2', H3: 'h3', BLOCKQUOTE: 'p', PRE: 'p' };

function safeLink(href) {
  try {
    const u = new URL(String(href).trim());
    return ['http:', 'https:', 'mailto:'].includes(u.protocol) && u.href.length <= 2000 ? u.href : '';
  } catch { return ''; }
}

// Blocs d'une note : ceux qu'elle porte, ou ses lignes de texte (notes d'avant la mise en forme).
function blocksOf(n) {
  if (Array.isArray(n.blocks)) return n.blocks;
  return String(n.text || '').split('\n').map((line) => ({ t: 'p', runs: line ? [{ s: line }] : [] }));
}

function draw(root, blocks) {
  root.textContent = '';
  let list = null;
  for (const b of blocks) {
    if (!b || !TYPES.includes(b.t)) continue;
    const inList = b.t === 'ul' || b.t === 'ol' || b.t === 'todo';
    let el;
    if (inList) {
      if (!list || list.dataset.kind !== b.t) {
        list = document.createElement(b.t === 'ol' ? 'ol' : 'ul');
        list.dataset.kind = b.t;
        if (b.t === 'todo') list.className = 'todo';
        root.appendChild(list);
      }
      el = document.createElement('li');
      if (b.t === 'todo' && b.done === true) el.dataset.done = '1';
      list.appendChild(el);
    } else {
      list = null;
      el = document.createElement(b.t);
      root.appendChild(el);
    }
    for (const r of Array.isArray(b.runs) ? b.runs : []) {
      if (!r || typeof r.s !== 'string') continue;
      let box = el;
      const href = r.a ? safeLink(r.a) : '';
      if (href) { const a = document.createElement('a'); a.href = href; a.title = href; a.rel = 'noreferrer'; box.appendChild(a); box = a; }
      if (r.b === true) { const x = document.createElement('b'); box.appendChild(x); box = x; }
      if (r.i === true) { const x = document.createElement('i'); box.appendChild(x); box = x; }
      r.s.split('\n').forEach((part, i) => {
        if (i) box.appendChild(document.createElement('br'));
        if (part) box.appendChild(document.createTextNode(part));
      });
    }
    if (!el.firstChild) el.appendChild(document.createElement('br'));
  }
}

function read(root) {
  const blocks = [];
  let cur = null;
  const open = (ctx) => { cur = { t: ctx.t, runs: [] }; if (ctx.t === 'todo' && ctx.done) cur.done = true; blocks.push(cur); };
  const push = (s, ctx) => {
    if (!s) return;
    if (!cur) open(ctx);
    const last = cur.runs[cur.runs.length - 1];
    if (last && !!last.b === !!ctx.b && !!last.i === !!ctx.i && (last.a || '') === (ctx.a || '')) { last.s += s; return; }
    const run = { s };
    if (ctx.b) run.b = true;
    if (ctx.i) run.i = true;
    if (ctx.a) run.a = ctx.a;
    cur.runs.push(run);
  };
  const walk = (node, ctx) => {
    if (node.nodeType === 3) return push(node.data.replace(/ /g, ' '), ctx);
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    if (tag === 'BR') {
      // Dernier élément de son bloc : simple marque de ligne vide ; ailleurs, un retour à la ligne.
      let last = !node.nextSibling;
      for (let p = node.parentNode; last && p && p !== root && !(p.tagName in BLOCK_TAGS) && p.tagName !== 'LI'; p = p.parentNode) last = !p.nextSibling;
      if (!cur) open(ctx);
      if (!last) push('\n', ctx);
      return;
    }
    if (tag === 'UL' || tag === 'OL') {
      const kind = tag === 'OL' ? 'ol' : node.classList.contains('todo') ? 'todo' : 'ul';
      cur = null;
      for (const c of node.childNodes) walk(c, { t: kind });
      cur = null;
      return;
    }
    if (tag === 'LI' || tag in BLOCK_TAGS) {
      const list = tag === 'LI' && ['ul', 'ol', 'todo'].includes(ctx.t);
      const inner = { t: list ? ctx.t : BLOCK_TAGS[tag] || 'p', done: list && ctx.t === 'todo' && node.dataset.done === '1' };
      const before = blocks.length;
      cur = null;
      for (const c of node.childNodes) walk(c, inner);
      if (blocks.length === before) open(inner);
      cur = null;
      return;
    }
    const next = { ...ctx };
    if (tag === 'B' || tag === 'STRONG') next.b = true;
    else if (tag === 'I' || tag === 'EM') next.i = true;
    else if (tag === 'A') { const href = safeLink(node.getAttribute('href') || ''); if (href) next.a = href; }
    for (const c of node.childNodes) walk(c, next);
  };
  for (const c of root.childNodes) walk(c, { t: 'p' });
  return blocks;
}

function plain(blocks) {
  let n = 0;
  return blocks.map((b) => {
    n = b.t === 'ol' ? n + 1 : 0;
    const mark = b.t === 'ul' ? '- ' : b.t === 'ol' ? `${n}. ` : b.t === 'todo' ? (b.done ? '[x] ' : '[ ] ') : '';
    return mark + b.runs.map((r) => r.s).join('');
  }).join('\n');
}

// --- Liste ---------------------------------------------------------------------------
function drawList() {
  const box = $('items');
  box.textContent = '';
  for (const n of notes) {
    const el = document.createElement('div');
    el.className = 'note' + (current && n.id === current.id ? ' on' : '');
    const b = document.createElement('b');
    b.textContent = titleOf(n);
    const s = document.createElement('span');
    s.textContent = new Date(n.at).toLocaleDateString(lang, { day: 'numeric', month: 'short' });
    el.append(b, s);
    el.onclick = () => select(n.id);
    box.appendChild(el);
  }
  document.title = current ? titleOf(current) : t('notes.title');
}

function select(id) {
  flush();
  current = notes.find((n) => n.id === id) || null;
  draw($('editor'), current ? blocksOf(current) : []);
  $('editor').contentEditable = current ? 'true' : 'false';
  $('del').hidden = !current;
  $('tools').hidden = !current;
  $('saved').textContent = '';
  closeLink();
  drawList();
  if (current) $('editor').focus();
  if (current && location.hash !== '#new') history.replaceState(null, '', '#' + current.id);
  marks();
}

async function load(selectId) {
  notes = (await O.send('notes:list')) || [];
  select(selectId || (current && current.id) || (notes[0] && notes[0].id));
}

// --- Saisie ----------------------------------------------------------------------------
const editor = $('editor');
// Bloc (paragraphe, titre, élément de liste) qui porte le curseur.
function blockAt() {
  const sel = getSelection();
  let n = sel.rangeCount ? sel.anchorNode : null;
  while (n && n !== editor && !(n.nodeType === 1 && (n.tagName in BLOCK_TAGS || n.tagName === 'LI'))) n = n.parentNode;
  return n && n !== editor && editor.contains(n) ? n : null;
}
const listAt = () => { const b = blockAt(); return b && b.tagName === 'LI' ? b.parentNode : null; };

function changed() {
  if (!current) return;
  current.blocks = read(editor);
  current.text = plain(current.blocks);
  current.at = Date.now();
  drawList();
  clearTimeout(timer);
  timer = setTimeout(flush, 400);
}
// Enregistre tout de suite ce qui attend (changement de note, fermeture de la page).
function flush() {
  if (!timer || !current) return;
  clearTimeout(timer);
  timer = null;
  const note = current;
  O.send('notes:save', { id: note.id, blocks: note.blocks }).then(() => { if (current === note) $('saved').textContent = t('notes.saved'); });
}

// Raccourcis de début de ligne, à la manière de Markdown : « # », « ## », « ### », « - », « 1. », « [] ».
const STARTS = { '#': 'h1', '##': 'h2', '###': 'h3', '-': 'ul', '*': 'ul', '1.': 'ol', '[]': 'todo', '[ ]': 'todo' };
function lineStart() {
  const b = blockAt();
  if (!b || b.tagName !== 'P' && b.tagName !== 'DIV') return false;
  const m = /^(#{1,3}|-|\*|1\.|\[ ?\])[  ]$/.exec(b.textContent);
  if (!m) return false;
  b.textContent = '';
  b.appendChild(document.createElement('br'));
  getSelection().collapse(b, 0);
  apply(STARTS[m[1]]);
  return true;
}

// Le navigateur pose parfois la liste DANS le paragraphe qu'elle remplace : elle remonte à sa place.
function tidy() {
  const sel = getSelection();
  for (const list of editor.querySelectorAll('p > ul, p > ol, h1 > ul, h2 > ul, h3 > ul, h1 > ol, h2 > ol, h3 > ol')) {
    const box = list.parentNode;
    const at = sel.rangeCount ? [sel.anchorNode, sel.anchorOffset] : null;
    box.replaceWith(...[...box.childNodes].filter((n) => n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL')));
    if (at && editor.contains(at[0])) sel.collapse(at[0], at[1]);
  }
}

function apply(what, value) {
  if (!current) return;
  editor.focus();
  const run = (cmd, arg) => document.execCommand(cmd, false, arg);
  const list = listAt();
  switch (what) {
    case 'b': run('bold'); break;
    case 'i': run('italic'); break;
    case 'h1': case 'h2': case 'h3': {
      const b = blockAt();
      if (list) run(list.tagName === 'OL' ? 'insertOrderedList' : 'insertUnorderedList');
      run('formatBlock', b && b.tagName === what.toUpperCase() ? 'p' : what);
      break;
    }
    case 'ul': case 'todo': {
      const same = list && list.tagName === 'UL' && list.classList.contains('todo') === (what === 'todo');
      if (list && list.tagName === 'UL' && !same) { list.classList.toggle('todo', what === 'todo'); break; } // puces <-> cases : même liste
      if (list && list.tagName === 'OL') run('insertOrderedList');
      if (!list) run('formatBlock', 'p');
      run('insertUnorderedList');
      const now = listAt();
      if (now && now.tagName === 'UL') now.classList.toggle('todo', what === 'todo');
      break;
    }
    case 'ol':
      if (list && list.tagName === 'UL') { list.classList.remove('todo'); run('insertUnorderedList'); }
      else if (!list) run('formatBlock', 'p');
      run('insertOrderedList');
      break;
    case 'link': {
      const href = safeLink(value) || safeLink('https://' + String(value || '').trim());
      if (href && !/\s/.test(String(value).trim())) run('createLink', href); else run('unlink');
      break;
    }
    default: return;
  }
  tidy();
  changed();
  marks();
}

// Boutons de la barre : enfoncés selon ce qui porte le curseur.
function marks() {
  const inside = current && editor.contains(getSelection().anchorNode);
  const b = inside ? blockAt() : null;
  const list = b && b.tagName === 'LI' ? b.parentNode : null;
  const kind = list ? (list.tagName === 'OL' ? 'ol' : list.classList.contains('todo') ? 'todo' : 'ul') : b ? BLOCK_TAGS[b.tagName] : '';
  let state = {};
  try { state = inside ? { b: document.queryCommandState('bold') && !/^h[123]$/.test(kind), i: document.queryCommandState('italic') } : {}; } catch {}
  let a = inside ? getSelection().anchorNode : null;
  while (a && a !== editor && a.tagName !== 'A') a = a.parentNode;
  state.link = !!(a && a.tagName === 'A');
  for (const btn of $('tools').querySelectorAll('button[data-do]')) {
    const on = btn.dataset.do === kind || state[btn.dataset.do] === true;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}

// Champ d'adresse du lien : garde la sélection de la note pendant la saisie.
let saved = null;
function openLink() {
  const sel = getSelection();
  if (!current || !sel.rangeCount || !editor.contains(sel.anchorNode)) return;
  saved = sel.getRangeAt(0).cloneRange();
  let a = sel.anchorNode;
  while (a && a !== editor && a.tagName !== 'A') a = a.parentNode;
  $('link').hidden = false;
  $('href').value = a && a.tagName === 'A' ? a.getAttribute('href') : '';
  $('href').focus();
  $('href').select();
}
function closeLink(value) {
  if ($('link').hidden) return;
  $('link').hidden = true;
  if (value === undefined || !saved) { saved = null; return; }
  editor.focus();
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(saved);
  // Rien de sélectionné : le lien s'étend à celui qui porte le curseur, ou s'écrit avec son adresse pour texte.
  if (sel.isCollapsed) {
    let a = sel.anchorNode;
    while (a && a !== editor && a.tagName !== 'A') a = a.parentNode;
    if (a && a.tagName === 'A') sel.selectAllChildren(a);
    else {
      const href = /\s/.test(value.trim()) ? '' : safeLink(value) || safeLink('https://' + value.trim());
      const range = saved;
      saved = null;
      if (!href || !blockAt()) return;
      const link = document.createElement('a');
      link.href = href;
      link.title = href;
      link.rel = 'noreferrer';
      link.textContent = value.trim();
      range.insertNode(link);
      sel.collapse(link.parentNode, [...link.parentNode.childNodes].indexOf(link) + 1);
      changed();
      return;
    }
  }
  saved = null;
  apply('link', value);
}

editor.dataset.ph = t('notes.placeholder');
document.execCommand('defaultParagraphSeparator', false, 'p');
document.execCommand('styleWithCSS', false, false);
editor.addEventListener('input', (e) => {
  if (!current) return;
  // Texte tapé hors de tout bloc (note vide) : il prend place dans un paragraphe.
  if (editor.firstChild && editor.firstChild.nodeType === 3) document.execCommand('formatBlock', false, 'p');
  // Nouvelle ligne d'une liste à cocher : la case commence vide.
  if (e.inputType === 'insertParagraph') { const b = blockAt(); if (b && b.tagName === 'LI') delete b.dataset.done; }
  if (e.inputType === 'insertText' && e.data === ' ' && lineStart()) return;
  changed();
});
// Collage et dépôt : le texte seul, jamais le HTML du presse-papiers.
editor.addEventListener('paste', (e) => {
  e.preventDefault();
  const text = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
  if (text) document.execCommand('insertText', false, text.slice(0, 200000));
});
editor.addEventListener('drop', (e) => {
  e.preventDefault();
  const text = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || '';
  if (text) { editor.focus(); document.execCommand('insertText', false, text.slice(0, 200000)); }
});
editor.addEventListener('click', (e) => {
  const li = e.target.closest && e.target.closest('ul.todo > li');
  // La case est dessinée dans la marge de la ligne : un clic à sa gauche la coche.
  if (li && e.clientX < li.getBoundingClientRect().left) {
    if (li.dataset.done === '1') delete li.dataset.done; else li.dataset.done = '1';
    changed();
    return;
  }
  const a = e.target.closest && e.target.closest('a');
  if (a && modKey(e)) { const href = safeLink(a.getAttribute('href') || ''); if (href && !href.startsWith('mailto:')) O.send('open', href); }
});
editor.addEventListener('keydown', (e) => {
  if (!modKey(e) || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'k') { e.preventDefault(); openLink(); }
  // Gras et italique passent par ici : le navigateur poserait sinon ses propres balises de style.
  else if (k === 'b' && !e.shiftKey) { e.preventDefault(); apply('b'); }
  else if (k === 'i' && !e.shiftKey) { e.preventDefault(); apply('i'); }
});
document.addEventListener('selectionchange', marks);
for (const btn of $('tools').querySelectorAll('button[data-do]')) {
  btn.addEventListener('mousedown', (e) => e.preventDefault()); // la sélection reste dans la note
  btn.addEventListener('click', () => (btn.dataset.do === 'link' ? openLink() : apply(btn.dataset.do)));
}
$('href').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); closeLink($('href').value); }
  else if (e.key === 'Escape') { e.preventDefault(); closeLink(); editor.focus(); }
});
$('href').addEventListener('blur', () => closeLink());
addEventListener('pagehide', flush);

$('new').onclick = async () => { flush(); const n = await O.send('notes:save', { blocks: [] }); await load(n.id); };
$('del').onclick = async () => { if (!current) return; clearTimeout(timer); timer = null; await O.send('notes:delete', current.id); current = null; await load(); };
O.on('settings', (s) => { if (setLang(s.lang)) { editor.dataset.ph = t('notes.placeholder'); drawList(); } });
// L'adresse retient la note ouverte : actualiser la page (ou rouvrir l'onglet) la retrouve,
// au lieu de créer une note de plus à chaque fois (« #new » ne sert qu'une fois).
const asked = location.hash.slice(1);
const keep = () => { if (current) history.replaceState(null, '', '#' + current.id); };
load(asked === 'new' ? null : asked || undefined).then(async () => {
  if (asked === 'new' || !notes.length) await $('new').onclick();
  keep();
});
