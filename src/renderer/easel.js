// Tableau (l'« Easel » d'Arc) : un plan infini où poser textes, images, captures
// de pages, formes, flèches, traits et pense-bêtes.
//
// Rendu : des éléments du DOM (du SVG pour les flèches et les traits), pas un
// <canvas>. Le texte s'édite sur place, les images sont des calques que le
// moteur compose seul, et surtout déplacer ou zoomer la vue ne change qu'UNE
// transformation (#world) : aucun élément n'est redessiné. Pendant un glisser,
// seule la transformation des éléments déplacés est réécrite, une fois par
// image, sans jamais relire la mise en page.
//
// État : `items` est une liste d'objets jamais modifiés en place. Chaque
// changement produit une nouvelle liste qui partage les objets intacts ; un
// cran d'annulation n'est donc qu'une référence vers l'ancienne liste, et la
// mise à jour de l'écran ne repeint que les éléments dont l'objet a changé.
//
// Sécurité : tout ce qui est collé ou déposé est traité comme du texte brut ou
// comme une image validée ; rien n'est jamais interprété comme du HTML.
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const boardId = new URLSearchParams(location.search).get('id') || '';
const stage = $('stage');
const world = $('world');
const selbox = $('selbox');
const marquee = $('marquee');
const inkPath = $('ink-path');

const COLORS = ['ink', 'red', 'orange', 'yellow', 'green', 'blue', 'purple'];
const SIZES = [14, 18, 24, 32, 48, 72];
const DRAW_TOOLS = ['text', 'note', 'rect', 'ellipse', 'arrow', 'pen'];
const MIN = 8; // plus petite dimension d'un élément
const Z_MIN = 0.1;
const Z_MAX = 8;
const IMAGE_MAX_SIDE = 4096;
const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const DIRECT_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

let items = [];
const els = new Map(); // id -> élément du DOM
let sel = new Set();
const view = { x: 0, y: 0, z: 1 };
let tool = 'select';
const cur = { color: 'ink', sw: 2 }; // réglages des prochains éléments
const undoStack = [];
const redoStack = [];
let editing = null; // { id, el, tx, fresh }
let drag = null;
let frame = 0;
let spaceDown = false;
let loaded = false;
let dead = false;
let title = '';
let lastClick = { id: null, at: 0, x: 0, y: 0 };
let lastPointer = null; // dernière position de la souris, pour coller à cet endroit
let clip = null; // { items, text } : éléments copiés
// Coût mesuré pendant les glissers (voir tests/ui/15-tableaux.js).
const perf = { moves: 0, moveMs: 0, moveMax: 0, frames: 0, frameMs: 0, frameMax: 0, gapMax: 0, lastFrame: 0 };

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v) => Math.round(v * 100) / 100;
const typing = () => { const e = document.activeElement; return !!e && (e.isContentEditable || /^(INPUT|TEXTAREA)$/.test(e.tagName)); };
const toWorld = (cx, cy) => ({ x: (cx - view.x) / view.z, y: (cy - view.y) / view.z });
const byId = (id) => items.find((it) => it.id === id);
const colorOf = (it) => (COLORS.includes(it.color) ? it.color : 'ink');

// Rectangle occupé par un élément. Une flèche va de (x, y) à (x + w, y + h).
function bounds(it) {
  if (it.type !== 'arrow') return { x: it.x, y: it.y, w: it.w, h: it.h };
  return { x: Math.min(it.x, it.x + it.w), y: Math.min(it.y, it.y + it.h), w: Math.abs(it.w), h: Math.abs(it.h) };
}

function union(list) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const it of list) {
    const b = bounds(it);
    if (b.x < x0) x0 = b.x;
    if (b.y < y0) y0 = b.y;
    if (b.x + b.w > x1) x1 = b.x + b.w;
    if (b.y + b.h > y1) y1 = b.y + b.h;
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// --- Vue ------------------------------------------------------------------------
let shownZ = 0;
function applyView() {
  world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.z})`;
  // Grille de points : elle suit la vue ; trop serrée, elle passe à un point sur quatre.
  const step = 24 * view.z * (view.z < 0.45 ? 4 : 1);
  stage.style.backgroundSize = `${step}px ${step}px`;
  stage.style.backgroundPosition = `${view.x}px ${view.y}px`;
  if (shownZ !== view.z) {
    shownZ = view.z;
    world.style.setProperty('--z', view.z);
    $('zoom-val').textContent = Math.round(view.z * 100) + ' %';
  }
  drawSel();
}

function zoomAt(cx, cy, factor) {
  const z = clamp(view.z * factor, Z_MIN, Z_MAX);
  const k = z / view.z;
  view.x = cx - (cx - view.x) * k;
  view.y = cy - (cy - view.y) * k;
  view.z = z;
  applyView();
  touch(true);
}

const zoomCenter = (factor) => zoomAt(innerWidth / 2, innerHeight / 2, factor);

function fit() {
  const b = union(items);
  if (!b) { view.x = 0; view.y = 0; view.z = 1; applyView(); return; }
  const pad = 90;
  view.z = clamp(Math.min((innerWidth - pad * 2) / Math.max(b.w, 1), (innerHeight - pad * 2) / Math.max(b.h, 1)), Z_MIN, 1);
  view.x = innerWidth / 2 - (b.x + b.w / 2) * view.z;
  view.y = innerHeight / 2 - (b.y + b.h / 2) * view.z;
  applyView();
  touch(true);
}

// --- Images -----------------------------------------------------------------------
const imageUrls = new Map(); // nom de fichier -> promesse d'adresse blob:

function imageUrl(name) {
  if (!imageUrls.has(name)) {
    imageUrls.set(name, O.send('easel:getImage', { board: boardId, name }).then((r) => (r && r.data ? URL.createObjectURL(new Blob([r.data], { type: r.type })) : '')).catch(() => ''));
  }
  return imageUrls.get(name);
}

// Décode une image par <img> : c'est aussi ce qui rend un SVG inoffensif (dans
// ce mode, ni script ni ressource externe).
function decode(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image illisible')); };
    img.src = url;
  });
}

// Prépare une image collée ou déposée : vérifie qu'elle se décode, la ramène à
// une taille raisonnable et, pour tout autre format que PNG, JPEG, GIF ou WebP
// (SVG compris), n'en garde que les pixels. Le processus principal revérifie le
// type d'après les octets avant d'écrire le fichier.
async function ingest(blob) {
  if (!blob || !/^image\//.test(blob.type) || blob.size > 60 * 1024 * 1024) throw new Error('refusé');
  const { img, url } = await decode(blob);
  let w = img.naturalWidth || 300;
  let h = img.naturalHeight || 150;
  let out = blob;
  if (!DIRECT_TYPES.includes(blob.type) || Math.max(w, h) > IMAGE_MAX_SIDE || blob.size > IMAGE_MAX_BYTES) {
    const k = Math.min(1, IMAGE_MAX_SIDE / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    out = await new Promise((resolve, reject) => { try { c.toBlob((b) => (b ? resolve(b) : reject(new Error('conversion'))), 'image/png'); } catch (err) { reject(err); } });
    w = c.width; h = c.height;
  }
  URL.revokeObjectURL(url);
  const stored = await O.send('easel:putImage', { board: boardId, data: new Uint8Array(await out.arrayBuffer()) });
  if (!stored || !stored.name) throw new Error('refusé');
  imageUrls.set(stored.name, Promise.resolve(URL.createObjectURL(out)));
  return { name: stored.name, w, h };
}

// Ajoute des fichiers image autour d'un point du plan.
async function addImages(files, at) {
  const added = [];
  let x = at.x;
  for (const f of files.slice(0, 20)) {
    try {
      const im = await ingest(f);
      const k = Math.min(1, 480 / Math.max(im.w, im.h));
      const it = { id: uid(), type: 'image', img: im.name, x: round(x), y: round(at.y), w: Math.round(im.w * k), h: Math.round(im.h * k) };
      if (!added.length) { it.x = round(at.x - it.w / 2); it.y = round(at.y - it.h / 2); x = it.x; }
      x += it.w + 24;
      added.push(it);
    } catch {
      flash(t('easel.badImage'));
    }
  }
  if (!added.length || dead) return [];
  commit(items.concat(added));
  setSel(added.map((it) => it.id));
  return added;
}

// --- Dessin des éléments --------------------------------------------------------
const svgEl = (name, cls) => { const e = document.createElementNS(NS, name); if (cls) e.setAttribute('class', cls); return e; };

function make(it) {
  const el = document.createElement('div');
  el.className = 'it ' + it.type;
  el.dataset.id = it.id;
  if (it.type === 'text' || it.type === 'note') {
    el._tx = document.createElement('div');
    el._tx.className = 'tx';
    el._tx.spellcheck = false;
    el.appendChild(el._tx);
  } else if (it.type === 'image') {
    el._img = document.createElement('img');
    el._img.draggable = false;
    el._img.decoding = 'async';
    el._img.alt = '';
    el.appendChild(el._img);
  } else if (it.type === 'arrow') {
    const g = svgEl('svg', 'g');
    el._hit = svgEl('line', 'hit');
    el._ln = svgEl('line', 'ln');
    el._head = svgEl('polygon', 'head');
    g.append(el._hit, el._ln, el._head);
    el.appendChild(g);
  } else if (it.type === 'pen') {
    el._g = svgEl('svg', 'g');
    el._g.setAttribute('preserveAspectRatio', 'none');
    el._hit = svgEl('path', 'hit');
    el._ln = svgEl('path', 'ln');
    el._g.append(el._hit, el._ln);
    el.appendChild(el._g);
  }
  return el;
}

function paint(el, it) {
  const b = bounds(it);
  el._it = it;
  el._bx = b.x;
  el._by = b.y;
  el.style.transform = `translate(${b.x}px,${b.y}px)`;
  el.style.width = Math.max(1, b.w) + 'px';
  el.style.height = it.type === 'text' ? '' : Math.max(1, b.h) + 'px';
  if (el._color !== it.color) { el._color = it.color; el.style.setProperty('--c', `var(--c-${colorOf(it)})`); }
  switch (it.type) {
    case 'text':
    case 'note':
      el.style.fontSize = it.size + 'px';
      // Texte brut, toujours : textContent n'interprète rien.
      if (el._text !== it.text && !(editing && editing.el === el)) { el._text = it.text; el._tx.textContent = it.text; }
      break;
    case 'rect':
    case 'ellipse':
      el.style.borderWidth = it.sw + 'px';
      el.classList.toggle('filled', !!it.fill);
      break;
    case 'image':
      if (el._img.alt !== (it.alt || '')) el._img.alt = it.alt || '';
      if (el._name !== it.img) {
        el._name = it.img;
        imageUrl(it.img).then((u) => { if (u && el._name === it.img) el._img.src = u; });
      }
      if (el._source !== it.sourceUrl) {
        el._source = it.sourceUrl;
        if (el._src) { el._src.remove(); el._src = null; }
        el.classList.toggle('captured', !!it.sourceUrl);
        if (it.sourceUrl) {
          el._src = document.createElement('a');
          el._src.className = 'src';
          const icon = svgEl('svg', 'i');
          icon.setAttribute('viewBox', '0 0 16 16');
          const p = svgEl('path');
          p.setAttribute('d', 'M6.500 3.500H3.500v9h9V9.500M9.500 3h3.500v3.500M13 3L7.500 8.500');
          icon.appendChild(p);
          const label = document.createElement('span');
          label.textContent = host(it.sourceUrl);
          el._src.append(icon, label);
          el._src.title = (it.sourceTitle ? it.sourceTitle + '\n' : '') + it.sourceUrl;
          el.appendChild(el._src);
        }
      }
      break;
    case 'arrow': {
      const x1 = it.x - b.x; const y1 = it.y - b.y; const x2 = x1 + it.w; const y2 = y1 + it.h;
      for (const ln of [el._hit, el._ln]) { ln.setAttribute('x1', x1); ln.setAttribute('y1', y1); ln.setAttribute('x2', x2); ln.setAttribute('y2', y2); }
      el._ln.setAttribute('stroke-width', it.sw);
      const a = Math.atan2(it.h, it.w);
      const s = 7 + it.sw * 2.4;
      const pt = (da) => `${round(x2 - s * Math.cos(a + da))},${round(y2 - s * Math.sin(a + da))}`;
      el._head.setAttribute('points', `${x2},${y2} ${pt(0.42)} ${pt(-0.42)}`);
      el._head.setAttribute('stroke-width', it.sw);
      break;
    }
    case 'pen':
      if (el._pts !== it.pts) {
        el._pts = it.pts;
        let d = `M${it.pts[0]} ${it.pts[1]}`;
        for (let i = 2; i < it.pts.length; i += 2) d += `L${it.pts[i]} ${it.pts[i + 1]}`;
        if (it.pts.length === 2) d += `L${it.pts[0]} ${it.pts[1]}`;
        el._hit.setAttribute('d', d);
        el._ln.setAttribute('d', d);
        el._g.setAttribute('viewBox', `0 0 ${it.pw} ${it.ph}`);
      }
      el._ln.setAttribute('stroke-width', it.sw);
      break;
    default:
  }
}

// Hauteur d'un texte : elle dépend de la mise en page, on la relève après coup.
function fitText(el) {
  const h = el.offsetHeight;
  if (el._it && el._it.h !== h) el._it.h = h;
}

// Met l'écran en accord avec `items` : ne touche qu'aux éléments dont l'objet a
// changé, et relève les hauteurs de texte en une seule passe, après les écritures.
function reconcile() {
  const seen = new Set();
  const texts = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    seen.add(it.id);
    let el = els.get(it.id);
    if (!el) { el = make(it); els.set(it.id, el); world.appendChild(el); }
    if (el._it !== it) { paint(el, it); if (it.type === 'text') texts.push(el); }
    if (el._z !== i) { el._z = i; el.style.zIndex = i; }
  }
  for (const [id, el] of els) {
    if (seen.has(id)) continue;
    el.remove();
    els.delete(id);
    sel.delete(id);
  }
  for (const el of texts) fitText(el);
  $('hint').hidden = items.length > 0 || !loaded;
  drawSel();
  drawBars();
}

// --- Changements et annulation -----------------------------------------------------
// `from` : état à retrouver par ⌘Z quand il diffère de l'état courant (glisser
// qui a déjà créé des copies, texte tout juste créé).
function commit(next, { record = true, from } = {}) {
  if (next === items) return;
  if (record) {
    undoStack.push(from || items);
    if (undoStack.length > 300) undoStack.shift();
    redoStack.length = 0;
  }
  items = next;
  reconcile();
  touch();
}

const patch = (ids, fn) => commit(items.map((it) => (ids.has(it.id) ? fn(it) : it)));

function undo() {
  if (!undoStack.length || drag) return;
  endEdit();
  redoStack.push(items);
  items = undoStack.pop();
  reconcile();
  touch();
}

function redo() {
  if (!redoStack.length || drag) return;
  endEdit();
  undoStack.push(items);
  items = redoStack.pop();
  reconcile();
  touch();
}

// --- Sélection ---------------------------------------------------------------------
function setSel(ids) {
  const next = new Set(ids);
  for (const id of sel) if (!next.has(id) && els.has(id)) els.get(id).classList.remove('sel');
  for (const id of next) if (!sel.has(id) && els.has(id)) els.get(id).classList.add('sel');
  sel = next;
  drawSel();
  drawBars();
}

const selected = () => items.filter((it) => sel.has(it.id));

// Cadre de sélection et poignées, en coordonnées d'écran : ils gardent la même
// taille quel que soit le zoom.
function drawSel() {
  if (!sel.size || (drag && drag.kind === 'draw')) { selbox.hidden = true; return; }
  const list = drag && drag.live ? null : selected();
  const b = drag && drag.live ? drag.live : union(list);
  if (!b) { selbox.hidden = true; return; }
  const one = sel.size === 1 ? (drag && drag.cur) || byId([...sel][0]) : null;
  selbox.hidden = false;
  selbox.dataset.mode = !one ? 'multi' : (one.type === 'text' || one.type === 'image' || one.type === 'arrow' ? one.type : 'box');
  selbox.style.transform = `translate(${b.x * view.z + view.x}px,${b.y * view.z + view.y}px)`;
  selbox.style.width = b.w * view.z + 'px';
  selbox.style.height = b.h * view.z + 'px';
  if (one && one.type === 'arrow') {
    const ends = selbox.querySelectorAll('.end');
    ends[0].style.left = (one.x - b.x) * view.z + 'px';
    ends[0].style.top = (one.y - b.y) * view.z + 'px';
    ends[1].style.left = (one.x + one.w - b.x) * view.z + 'px';
    ends[1].style.top = (one.y + one.h - b.y) * view.z + 'px';
  }
}

// --- Barres ------------------------------------------------------------------------
function setTool(next) {
  if (tool === next) return;
  endEdit();
  tool = next;
  stage.dataset.tool = next;
  for (const b of document.querySelectorAll('#tools [data-tool]')) b.classList.toggle('on', b.dataset.tool === next);
  drawBars();
}

function drawBars() {
  const list = selected();
  const drawing = DRAW_TOOLS.includes(tool);
  const bar = $('style');
  bar.hidden = (!list.length && !drawing) || !!editing;
  if (!bar.hidden) {
    const has = (types) => list.some((it) => types.includes(it.type));
    const show = { sel: list.length > 0, shape: has(['rect', 'ellipse']), stroke: has(['rect', 'ellipse', 'arrow', 'pen']) || ['rect', 'ellipse', 'arrow', 'pen'].includes(tool), text: has(['text', 'note']), image: list.length === 1 && list[0].type === 'image' };
    for (const el of bar.querySelectorAll('[data-for]')) el.hidden = !show[el.dataset.for];
    // Texte alternatif de l'image sélectionnée (lu par les lecteurs d'écran, gardé dans le tableau).
    bar.classList.toggle('wide', show.image);
    const alt = $('alt');
    if (show.image && document.activeElement !== alt) { alt.value = list[0].alt || ''; alt.dataset.id = list[0].id; }
    const active = list.length ? colorOf(list[0]) : cur.color;
    for (const s of bar.querySelectorAll('.sw')) s.classList.toggle('on', s.dataset.color === active);
    bar.querySelector('[data-do=fill]').classList.toggle('on', list.some((it) => it.fill));
    bar.querySelector('[data-do=thick]').classList.toggle('on', list.length ? list.some((it) => it.sw > 2) : cur.sw > 2);
  }
  $('b-undo').disabled = !undoStack.length;
  $('b-redo').disabled = !redoStack.length;
}

let flashTimer = 0;
function flash(text, ms = 1600) {
  $('saved').textContent = text;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { $('saved').textContent = ''; }, ms);
}

// --- Actions sur la sélection -----------------------------------------------------
function removeSelected() {
  if (!sel.size) return;
  const gone = sel;
  setSel([]);
  commit(items.filter((it) => !gone.has(it.id)));
}

const cloneOf = (it, dx, dy) => ({ ...it, id: uid(), x: round(it.x + dx), y: round(it.y + dy) });

function duplicate() {
  const list = selected();
  if (!list.length) return;
  const copies = list.map((it) => cloneOf(it, 24, 24));
  commit(items.concat(copies));
  setSel(copies.map((it) => it.id));
}

function reorder(front) {
  if (!sel.size) return;
  const a = items.filter((it) => sel.has(it.id));
  const b = items.filter((it) => !sel.has(it.id));
  const next = front ? b.concat(a) : a.concat(b);
  if (next.every((it, i) => it === items[i])) return;
  commit(next);
}

function nudge(dx, dy) {
  if (sel.size) patch(sel, (it) => ({ ...it, x: round(it.x + dx), y: round(it.y + dy) }));
}

function setColor(color) {
  cur.color = color;
  if (sel.size) patch(sel, (it) => ({ ...it, color }));
  else drawBars();
}

function styleAction(name) {
  const list = selected();
  if (name === 'fill') {
    const on = !list.some((it) => it.fill);
    patch(sel, (it) => (it.type === 'rect' || it.type === 'ellipse' ? { ...it, fill: on } : it));
  } else if (name === 'thick') {
    const thick = list.length ? !list.some((it) => it.sw > 2) : cur.sw <= 2;
    cur.sw = thick ? 5 : 2;
    if (list.length) patch(sel, (it) => (it.sw ? { ...it, sw: cur.sw } : it));
    else drawBars();
  } else if (name === 'smaller' || name === 'bigger') {
    const step = name === 'bigger' ? 1 : -1;
    patch(sel, (it) => {
      if (it.type !== 'text' && it.type !== 'note') return it;
      let i = SIZES.findIndex((s) => s >= it.size);
      if (i < 0) i = SIZES.length - 1;
      return { ...it, size: SIZES[clamp(i + step, 0, SIZES.length - 1)] };
    });
  } else if (name === 'front') reorder(true);
  else if (name === 'back') reorder(false);
  else if (name === 'duplicate') duplicate();
  else if (name === 'delete') removeSelected();
}

// --- Texte ---------------------------------------------------------------------------
function startEdit(id, fresh = false) {
  const el = els.get(id);
  const it = byId(id);
  if (!el || !it || (it.type !== 'text' && it.type !== 'note')) return;
  endEdit();
  editing = { id, el, tx: el._tx, fresh, before: fresh ? undoStack[undoStack.length - 1] : null };
  el.classList.add('editing');
  // « plaintext-only » : la zone n'accepte que du texte, même au collage.
  el._tx.contentEditable = 'plaintext-only';
  el._tx.spellcheck = true; // correcteur pendant la saisie seulement (pas de soulignés sur un tableau au repos)
  el._tx.focus();
  const range = document.createRange();
  range.selectNodeContents(el._tx);
  if (!fresh) range.collapse(false);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(range);
  drawBars();
}

function endEdit() {
  if (!editing) return;
  const { id, el, tx, fresh } = editing;
  editing = null;
  tx.contentEditable = 'false';
  tx.spellcheck = false;
  el.classList.remove('editing');
  if (document.activeElement === tx) tx.blur();
  getSelection().removeAllRanges();
  const it = byId(id);
  if (!it) return;
  const text = tx.innerText.replace(/\n$/, '').slice(0, 20000);
  el._text = undefined; // force la remise à plat du contenu
  if (!text.trim() && it.type === 'text') {
    // Un texte laissé vide disparaît ; s'il venait d'être créé, il ne laisse aucune trace.
    setSel([...sel].filter((x) => x !== id));
    if (fresh) { undoStack.pop(); commit(items.filter((x) => x.id !== id), { record: false }); } else commit(items.filter((x) => x.id !== id));
    return;
  }
  if (text !== it.text) {
    // Texte tout juste créé : création et saisie ne font qu'un cran d'annulation.
    if (fresh) commit(items.map((x) => (x.id === id ? { ...x, text } : x)), { record: false });
    else patch(new Set([id]), (x) => ({ ...x, text }));
  } else { paint(el, it); if (it.type === 'text') fitText(el); drawSel(); }
  drawBars();
}

function addText(type, p, text = '') {
  const it = type === 'note'
    ? { id: uid(), type: 'note', x: round(p.x - 90), y: round(p.y - 90), w: 180, h: 180, text, size: 18, color: cur.color === 'ink' ? 'yellow' : cur.color }
    : { id: uid(), type: 'text', x: round(p.x), y: round(p.y - 14), w: 260, h: 28, text, size: 18, color: cur.color };
  commit(items.concat(it));
  setSel([it.id]);
  return it;
}

// --- Souris ----------------------------------------------------------------------------
// Redimensionne `it` depuis la poignée `h`, la souris ayant bougé de (dx, dy).
function resized(it, h, dx, dy, keep) {
  if (it.type === 'arrow') {
    return h === 'a' ? { ...it, x: round(it.x + dx), y: round(it.y + dy), w: round(it.w - dx), h: round(it.h - dy) } : { ...it, w: round(it.w + dx), h: round(it.h + dy) };
  }
  let x0 = it.x; let y0 = it.y; let x1 = it.x + it.w; let y1 = it.y + it.h;
  if (h.includes('w')) x0 = Math.min(x0 + dx, x1 - MIN);
  if (h.includes('e')) x1 = Math.max(x1 + dx, x0 + MIN);
  if (h.includes('n')) y0 = Math.min(y0 + dy, y1 - MIN);
  if (h.includes('s')) y1 = Math.max(y1 + dy, y0 + MIN);
  // Proportions conservées (images toujours, formes avec ⇧) : depuis un coin.
  if (keep && h.length === 2) {
    const k = Math.max((x1 - x0) / it.w, (y1 - y0) / it.h);
    const w = it.w * k; const hh = it.h * k;
    if (h.includes('w')) x0 = x1 - w; else x1 = x0 + w;
    if (h.includes('n')) y0 = y1 - hh; else y1 = y0 + hh;
  }
  return { ...it, x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0) };
}

function shapeFrom(type, a, b, square) {
  if (type === 'arrow') return { id: uid(), type, x: round(a.x), y: round(a.y), w: round(b.x - a.x), h: round(b.y - a.y), color: cur.color, sw: cur.sw };
  let w = Math.abs(b.x - a.x); let h = Math.abs(b.y - a.y);
  if (square) { w = Math.max(w, h); h = w; }
  return { id: uid(), type, x: round(b.x < a.x ? a.x - w : a.x), y: round(b.y < a.y ? a.y - h : a.y), w: round(Math.max(w, 1)), h: round(Math.max(h, 1)), color: cur.color, sw: cur.sw, fill: false };
}

function penItem(pts) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i] < x0) x0 = pts[i];
    if (pts[i] > x1) x1 = pts[i];
    if (pts[i + 1] < y0) y0 = pts[i + 1];
    if (pts[i + 1] > y1) y1 = pts[i + 1];
  }
  const w = Math.max(1, round(x1 - x0)); const h = Math.max(1, round(y1 - y0));
  const local = new Array(pts.length);
  for (let i = 0; i < pts.length; i += 2) { local[i] = Math.round((pts[i] - x0) * 10) / 10; local[i + 1] = Math.round((pts[i + 1] - y0) * 10) / 10; }
  return { id: uid(), type: 'pen', x: round(x0), y: round(y0), w, h, pw: w, ph: h, pts: local, color: cur.color, sw: cur.sw };
}

stage.addEventListener('pointerdown', (e) => {
  if (dead || drag || !loaded) return;
  const target = e.target;
  if (target.closest && target.closest('.src')) return; // lien vers la page d'origine : simple clic
  if (editing) { if (editing.el.contains(target)) return; endEdit(); }
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  const pan = spaceDown || tool === 'hand' || e.button === 1;
  if (!pan && e.button !== 0) return;
  const p = toWorld(e.clientX, e.clientY);
  const d = { pointer: e.pointerId, sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, p0: p, moved: false, shift: e.shiftKey, alt: e.altKey };
  if (pan) Object.assign(d, { kind: 'pan', vx: view.x, vy: view.y });
  else if (tool === 'select') {
    const handle = target.dataset && target.dataset.h;
    const el = target.closest ? target.closest('.it') : null;
    if (handle && sel.size === 1) {
      const it = byId([...sel][0]);
      Object.assign(d, { kind: 'resize', handle, it0: it, el: els.get(it.id), cur: it });
    } else if (el) {
      const id = el.dataset.id;
      const was = sel.has(id);
      if (e.shiftKey) {
        setSel(was ? [...sel].filter((x) => x !== id) : [...sel, id]);
        if (was) return;
      } else if (!was) setSel([id]);
      Object.assign(d, { kind: 'move', hit: id, was });
    } else {
      Object.assign(d, { kind: 'marquee', base: e.shiftKey ? new Set(sel) : new Set() });
      if (!e.shiftKey) setSel([]);
    }
  } else if (tool === 'text' || tool === 'note') d.kind = 'place';
  else if (tool === 'pen') {
    Object.assign(d, { kind: 'pen', pts: [round(p.x), round(p.y)], d: `M${round(p.x)} ${round(p.y)}` });
    inkPath.style.stroke = `var(--c-${cur.color})`;
    inkPath.setAttribute('stroke-width', cur.sw);
    inkPath.setAttribute('d', d.d + `L${round(p.x)} ${round(p.y)}`);
  } else Object.assign(d, { kind: 'draw', type: tool });
  drag = d;
  try { stage.setPointerCapture(e.pointerId); } catch {}
  if (d.kind === 'pan') stage.classList.add('panning');
  e.preventDefault();
});

stage.addEventListener('pointermove', (e) => {
  lastPointer = { x: e.clientX, y: e.clientY };
  if (!drag || e.pointerId !== drag.pointer) return;
  const t0 = performance.now();
  drag.cx = e.clientX;
  drag.cy = e.clientY;
  drag.shift = e.shiftKey;
  drag.free = modKey(e);
  if (!drag.moved && Math.hypot(drag.cx - drag.sx, drag.cy - drag.sy) > 3) { drag.moved = true; beginMove(e); }
  if (drag.kind === 'pen') {
    // Tous les points intermédiaires, pas seulement le dernier de l'image.
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const gap = 1.5 / view.z;
    for (const ev of evs.length ? evs : [e]) {
      const p = toWorld(ev.clientX, ev.clientY);
      const n = drag.pts.length;
      if (Math.hypot(p.x - drag.pts[n - 2], p.y - drag.pts[n - 1]) < gap) continue;
      drag.pts.push(round(p.x), round(p.y));
      drag.d += `L${round(p.x)} ${round(p.y)}`;
    }
  }
  // Une seule mise à jour de l'écran par image, quel que soit le rythme de la souris.
  if (drag.moved && !frame) frame = requestAnimationFrame(step);
  const dt = performance.now() - t0;
  perf.moves += 1; perf.moveMs += dt; if (dt > perf.moveMax) perf.moveMax = dt;
});

// Premier mouvement franc d'un glisser.
function beginMove(e) {
  if (drag.kind !== 'move') return;
  drag.before = items;
  if (e.altKey) {
    // ⌥-glisser : ce sont des copies qui partent, les originaux restent en place.
    const copies = selected().map((it) => cloneOf(it, 0, 0));
    commit(items.concat(copies), { record: false });
    setSel(copies.map((it) => it.id));
  }
  drag.list = selected();
  drag.els = drag.list.map((it) => els.get(it.id));
  drag.base = union(drag.list);
  // Repères des autres éléments : bords et milieux, pour l'aimantation.
  const ids = new Set(drag.list.map((it) => it.id));
  drag.gx = [];
  drag.gy = [];
  for (const it of items) {
    if (ids.has(it.id)) continue;
    const b = bounds(it);
    drag.gx.push(b.x, b.x + b.w / 2, b.x + b.w);
    drag.gy.push(b.y, b.y + b.h / 2, b.y + b.h);
    if (drag.gx.length >= 3000) break;
  }
}

// Aimantation d'un déplacement : si un bord ou le milieu du lot déplacé passe à
// moins de SNAP points (à l'écran) d'un bord ou du milieu d'un autre élément, il
// s'y cale. Renvoie le décalage à ajouter et la position des guides (ou null).
const SNAP = 6;
function nearest(marks, at, size, reach) {
  let best = null;
  for (const m of marks) {
    for (const edge of [0, size / 2, size]) {
      const gap = m - (at + edge);
      if (Math.abs(gap) <= reach && (!best || Math.abs(gap) < Math.abs(best.gap))) best = { gap, at: m };
    }
  }
  return best;
}
function snapMove(d, dx, dy) {
  const reach = SNAP / view.z;
  const x = nearest(d.gx, d.base.x + dx, d.base.w, reach);
  const y = nearest(d.gy, d.base.y + dy, d.base.h, reach);
  return { dx: x ? x.gap : 0, dy: y ? y.gap : 0, x: x ? x.at : null, y: y ? y.at : null };
}
function drawGuides(snap) {
  const gx = $('guide-x');
  const gy = $('guide-y');
  gx.hidden = !snap || snap.x === null;
  gy.hidden = !snap || snap.y === null;
  if (!gx.hidden) gx.style.transform = `translateX(${Math.round(snap.x * view.z + view.x)}px)`;
  if (!gy.hidden) gy.style.transform = `translateY(${Math.round(snap.y * view.z + view.y)}px)`;
}

function step(now) {
  frame = 0;
  if (!drag) return;
  const t0 = performance.now();
  const d = drag;
  const dx = (d.cx - d.sx) / view.z;
  const dy = (d.cy - d.sy) / view.z;
  switch (d.kind) {
    case 'pan':
      view.x = d.vx + (d.cx - d.sx);
      view.y = d.vy + (d.cy - d.sy);
      applyView();
      break;
    case 'move': {
      // ⌘ (Ctrl ailleurs) maintenu : déplacement libre, sans aimantation.
      const snap = d.free ? null : snapMove(d, dx, dy);
      d.mx = dx + (snap ? snap.dx : 0);
      d.my = dy + (snap ? snap.dy : 0);
      for (const el of d.els) el.style.transform = `translate(${el._bx + d.mx}px,${el._by + d.my}px)`;
      d.live = { x: d.base.x + d.mx, y: d.base.y + d.my, w: d.base.w, h: d.base.h };
      drawGuides(snap);
      drawSel();
      break;
    }
    case 'resize':
      d.cur = resized(d.it0, d.handle, dx, dy, d.it0.type === 'image' ? !d.shift : d.shift);
      paint(d.el, d.cur);
      if (d.cur.type === 'text') fitText(d.el);
      d.live = bounds(d.cur);
      drawSel();
      break;
    case 'marquee': {
      const x = Math.min(d.sx, d.cx); const y = Math.min(d.sy, d.cy);
      const w = Math.abs(d.cx - d.sx); const h = Math.abs(d.cy - d.sy);
      marquee.hidden = false;
      marquee.style.transform = `translate(${x}px,${y}px)`;
      marquee.style.width = w + 'px';
      marquee.style.height = h + 'px';
      const a = toWorld(x, y); const b = toWorld(x + w, y + h);
      const hit = new Set(d.base);
      for (const it of items) {
        const r = bounds(it);
        if (r.x < b.x && r.x + r.w > a.x && r.y < b.y && r.y + r.h > a.y) hit.add(it.id);
      }
      if (hit.size !== sel.size || [...hit].some((id) => !sel.has(id))) setSel(hit);
      break;
    }
    case 'draw':
      d.cur = { ...shapeFrom(d.type, d.p0, toWorld(d.cx, d.cy), d.shift), id: d.cur ? d.cur.id : uid() };
      if (!d.el) { d.el = make(d.cur); d.el.style.zIndex = 99999; world.appendChild(d.el); }
      paint(d.el, d.cur);
      break;
    case 'pen':
      inkPath.setAttribute('d', d.d);
      break;
    default:
  }
  const dt = performance.now() - t0;
  perf.frames += 1; perf.frameMs += dt; if (dt > perf.frameMax) perf.frameMax = dt;
  if (perf.lastFrame && now - perf.lastFrame > perf.gapMax) perf.gapMax = now - perf.lastFrame;
  perf.lastFrame = now;
}

function finish(cancel) {
  const d = drag;
  if (!d) return;
  if (frame) { cancelAnimationFrame(frame); frame = 0; if (!cancel) step(performance.now()); }
  drag = null;
  perf.lastFrame = 0;
  try { stage.releasePointerCapture(d.pointer); } catch {}
  stage.classList.remove('panning');
  marquee.hidden = true;
  drawGuides(null);
  // Déplacement : la position retenue est celle affichée, aimantation comprise.
  const dx = d.kind === 'move' && d.mx !== undefined ? d.mx : (d.cx - d.sx) / view.z;
  const dy = d.kind === 'move' && d.my !== undefined ? d.my : (d.cy - d.sy) / view.z;
  const p = toWorld(d.cx, d.cy);
  switch (d.kind) {
    case 'pan':
      touch(true);
      break;
    case 'move':
      if (cancel && d.moved) {
        // Retour à l'état d'avant : positions, et copies éventuelles retirées.
        for (const el of d.els) el.style.transform = `translate(${el._bx}px,${el._by}px)`;
        if (items !== d.before) { setSel([]); commit(d.before, { record: false }); }
      } else if (d.moved) {
        const ids = new Set(d.list.map((it) => it.id));
        commit(items.map((it) => (ids.has(it.id) ? { ...it, x: round(it.x + dx), y: round(it.y + dy) } : it)), { from: d.before });
      } else if (!cancel) {
        // Simple clic : il isole l'élément ; deux clics rapprochés ouvrent le texte.
        if (!d.shift && d.was && sel.size > 1) setSel([d.hit]);
        const now = performance.now();
        const twice = lastClick.id === d.hit && now - lastClick.at < 450 && Math.hypot(d.cx - lastClick.x, d.cy - lastClick.y) < 6;
        lastClick = { id: twice ? null : d.hit, at: now, x: d.cx, y: d.cy };
        if (twice) startEdit(d.hit);
      }
      break;
    case 'resize':
      if (cancel || !d.moved) { paint(d.el, d.it0); if (d.it0.type === 'text') fitText(d.el); } else commit(items.map((it) => (it.id === d.it0.id ? d.cur : it)));
      break;
    case 'marquee':
      if (!d.moved && !cancel) {
        const now = performance.now();
        const twice = lastClick.id === '' && now - lastClick.at < 450 && Math.hypot(d.cx - lastClick.x, d.cy - lastClick.y) < 6;
        lastClick = { id: twice ? null : '', at: now, x: d.cx, y: d.cy };
        // Double-clic dans le vide : un texte, tout de suite.
        if (twice) startEdit(addText('text', p).id, true);
      }
      break;
    case 'draw': {
      if (d.el) d.el.remove();
      if (cancel) break;
      let it = d.cur;
      if (!d.moved || (it.type !== 'arrow' && (it.w < 4 || it.h < 4)) || (it.type === 'arrow' && Math.hypot(it.w, it.h) < 4)) {
        // Simple clic : une forme de taille courante, centrée sur le point.
        it = d.type === 'arrow' ? shapeFrom('arrow', { x: p.x - 70, y: p.y + 35 }, { x: p.x + 70, y: p.y - 35 }) : shapeFrom(d.type, { x: p.x - 80, y: p.y - 55 }, { x: p.x + 80, y: p.y + 55 }, d.type === 'ellipse');
      }
      commit(items.concat(it));
      setTool('select');
      setSel([it.id]);
      break;
    }
    case 'place':
      if (!cancel) { const it = addText(tool, p); setTool('select'); startEdit(it.id, true); }
      break;
    case 'pen':
      inkPath.setAttribute('d', '');
      if (!cancel) commit(items.concat(penItem(d.pts)));
      break;
    default:
  }
  drawSel();
}

stage.addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.pointer) finish(false); });
stage.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.pointer) finish(true); });
stage.addEventListener('contextmenu', (e) => e.preventDefault());

// Défilement à deux doigts : déplace la vue. Pincement, ou ⌘/Ctrl + molette :
// zoom centré sur le pointeur.
let wheelFrame = 0;
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (dead || !loaded) return;
  if (e.ctrlKey || e.metaKey) {
    const k = e.deltaMode ? 16 : 1;
    zoomAt(e.clientX, e.clientY, Math.exp(-clamp(e.deltaY * k, -40, 40) * 0.01));
    return;
  }
  const k = e.deltaMode ? 16 : 1;
  // ⇧ + molette d'une souris : défilement horizontal.
  const horizontal = e.shiftKey && !e.deltaX;
  view.x -= (horizontal ? e.deltaY : e.deltaX) * k;
  view.y -= (horizontal ? 0 : e.deltaY) * k;
  if (!wheelFrame) wheelFrame = requestAnimationFrame(() => { wheelFrame = 0; applyView(); touch(true); });
}, { passive: false });

// --- Clavier ---------------------------------------------------------------------------
const TOOL_KEYS = { v: 'select', h: 'hand', t: 'text', n: 'note', r: 'rect', o: 'ellipse', a: 'arrow', p: 'pen' };

window.addEventListener('keydown', (e) => {
  if (dead) return;
  const mod = modKey(e);
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (typing()) {
    // Dans un texte : Échap (ou ⌘Entrée) termine la saisie, le reste appartient au texte.
    if (key === 'Escape' || (mod && key === 'Enter') || (key === 'Enter' && document.activeElement === $('title'))) { e.preventDefault(); if (editing) endEdit(); else document.activeElement.blur(); }
    return;
  }
  const done = () => { e.preventDefault(); e.stopPropagation(); };
  if (mod && !e.altKey) {
    if (key === 'z') { done(); if (e.shiftKey) redo(); else undo(); } else if (key === 'y') { done(); redo(); } else if (key === 'a') { done(); setTool('select'); setSel(items.map((it) => it.id)); } else if (key === 'd' && sel.size) { done(); duplicate(); } else if (key === '0') { done(); zoomCenter(1 / view.z); } else if (key === '=' || key === '+') { done(); zoomCenter(1.25); } else if (key === '-') { done(); zoomCenter(0.8); }
    return;
  }
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (key === ' ') { done(); if (!spaceDown) { spaceDown = true; stage.classList.add('space'); } return; }
  if (key === 'Escape') { done(); if (drag) finish(true); else if (tool !== 'select') setTool('select'); else setSel([]); return; }
  if (key === 'Delete' || key === 'Backspace') { done(); removeSelected(); return; }
  if (key === 'Enter' && sel.size === 1) { done(); startEdit([...sel][0]); return; }
  if (key.startsWith('Arrow')) {
    done();
    const k = e.shiftKey ? 10 : 1;
    nudge(key === 'ArrowLeft' ? -k : key === 'ArrowRight' ? k : 0, key === 'ArrowUp' ? -k : key === 'ArrowDown' ? k : 0);
    return;
  }
  if (key === ']') { done(); reorder(true); return; }
  if (key === '[') { done(); reorder(false); return; }
  if (e.shiftKey && (key === '1' || e.code === 'Digit1')) { done(); fit(); return; }
  if (!e.shiftKey && TOOL_KEYS[key]) { done(); setTool(TOOL_KEYS[key]); }
});
window.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; stage.classList.remove('space'); } });
window.addEventListener('blur', () => { spaceDown = false; stage.classList.remove('space'); });

// --- Presse-papiers et dépôt ---------------------------------------------------------
const pastePoint = () => (lastPointer ? toWorld(lastPointer.x, lastPointer.y) : toWorld(innerWidth / 2, innerHeight / 2));
const imageFiles = (dt) => [...((dt && dt.files) || [])].filter((f) => /^image\//.test(f.type));

document.addEventListener('copy', (e) => {
  if (typing() || !sel.size) return;
  const list = selected();
  const text = list.map((it) => it.text || it.sourceUrl || '').filter(Boolean).join('\n') || ' ';
  clip = { items: list, text };
  e.clipboardData.setData('text/plain', text);
  e.preventDefault();
});
document.addEventListener('cut', (e) => {
  if (typing() || !sel.size) return;
  const list = selected();
  const text = list.map((it) => it.text || it.sourceUrl || '').filter(Boolean).join('\n') || ' ';
  clip = { items: list, text };
  e.clipboardData.setData('text/plain', text);
  e.preventDefault();
  removeSelected();
});
document.addEventListener('paste', (e) => {
  if (typing() || dead || !loaded) return;
  e.preventDefault();
  const files = imageFiles(e.clipboardData);
  if (files.length) { addImages(files, pastePoint()); return; }
  // Seul le texte brut est lu : jamais « text/html ».
  const text = e.clipboardData.getData('text/plain');
  if (clip && text === clip.text) {
    const b = union(clip.items);
    const p = pastePoint();
    const copies = clip.items.map((it) => cloneOf(it, p.x - (b.x + b.w / 2), p.y - (b.y + b.h / 2)));
    commit(items.concat(copies));
    setSel(copies.map((it) => it.id));
  } else if (text.trim()) {
    const it = addText('text', pastePoint(), text.slice(0, 20000));
    setSel([it.id]);
  }
});

stage.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
stage.addEventListener('drop', (e) => {
  e.preventDefault();
  if (dead || !loaded) return;
  const p = toWorld(e.clientX, e.clientY);
  const files = imageFiles(e.dataTransfer);
  if (files.length) { addImages(files, p); return; }
  const text = e.dataTransfer.getData('text/plain');
  if (text && text.trim()) addText('text', p, text.slice(0, 20000));
});
// Un fichier lâché à côté du plan ne doit jamais faire quitter la page.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

// --- Boutons ---------------------------------------------------------------------------
$('tools').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.tool) setTool(b.dataset.tool);
  else if (b.id === 'b-undo') undo();
  else if (b.id === 'b-redo') redo();
  else if (b.id === 'b-image') $('file').click();
});
$('file').addEventListener('change', () => {
  const files = [...$('file').files];
  $('file').value = '';
  if (files.length) addImages(files, toWorld(innerWidth / 2, innerHeight / 2));
});
for (const c of COLORS) {
  const b = document.createElement('button');
  b.className = 'sw';
  b.dataset.color = c;
  b.style.setProperty('--c', `var(--c-${c})`);
  $('swatches').appendChild(b);
}
$('style').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.color) setColor(b.dataset.color);
  else if (b.dataset.do) styleAction(b.dataset.do);
});
// Un clic sur une barre ne doit pas faire perdre la saisie en cours ni le clavier.
for (const id of ['tools', 'style', 'zoom']) $(id).addEventListener('mousedown', (e) => { if (e.target.id !== 'alt') e.preventDefault(); });
// Texte alternatif : validé par Entrée ou en quittant le champ ; Échap rend la valeur d'avant.
function setAlt() {
  const alt = $('alt');
  const it = byId(alt.dataset.id);
  const value = alt.value.trim().slice(0, 500);
  if (!it || it.type !== 'image' || (it.alt || '') === value) return;
  patch(new Set([it.id]), (x) => { const next = { ...x }; if (value) next.alt = value; else delete next.alt; return next; });
}
$('alt').addEventListener('change', setAlt);
$('alt').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') { e.preventDefault(); $('alt').blur(); }
  if (e.key === 'Escape') { e.preventDefault(); const it = byId($('alt').dataset.id); $('alt').value = (it && it.alt) || ''; $('alt').blur(); }
});
$('b-export').addEventListener('mousedown', (e) => e.preventDefault());
$('b-export').onclick = () => exportPng();
$('zoom-in').onclick = () => zoomCenter(1.25);
$('zoom-out').onclick = () => zoomCenter(0.8);
$('zoom-val').onclick = () => zoomCenter(1 / view.z);
$('fit').onclick = fit;
world.addEventListener('click', (e) => {
  const a = e.target.closest('.src');
  const el = a && a.closest('.it');
  // « open » n'accepte que http(s) : validé de nouveau par le processus principal.
  if (el && el._it && /^https?:\/\//i.test(el._it.sourceUrl || '')) O.send('open', el._it.sourceUrl);
});

$('title').addEventListener('input', () => { title = $('title').value.slice(0, 120); document.title = title || t('easel.untitled'); touch(); });

// --- Enregistrement ----------------------------------------------------------------------
let saveTimer = 0;
let dirty = false;
let thumbStale = false;
let saving = Promise.resolve();

// `viewOnly` : seul le cadrage a changé (pas besoin de refaire la vignette).
function touch(viewOnly) {
  if (!loaded || dead) return;
  dirty = true;
  if (!viewOnly) thumbStale = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, viewOnly ? 900 : 500);
}

const THUMB_INK = { ink: '#8a8a93', red: '#e5484d', orange: '#f2711c', yellow: '#e0a800', green: '#30a46c', blue: '#3b82f6', purple: '#7c6cf0' };

// Vignette pour la bibliothèque : un dessin simplifié du contenu, sur fond transparent.
// Lignes d'un texte coupées à la largeur de son cadre, comme à l'écran.
function wrapLines(g, text, width) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      if (line && g.measureText(line + word).width > width && word.trim()) { out.push(line.trimEnd()); line = word; } else line += word;
    }
    out.push(line);
  }
  return out;
}

// Dessine le tableau dans une image : `k` points d'image par point du tableau,
// `pad` de marge, `bg` de fond (aucun : transparent), `full` : texte entier, coupé à la largeur.
function raster({ W, H, k, cx, cy, bg, full }) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, W, H); }
  g.translate(W / 2 - cx * k, H / 2 - cy * k);
  g.scale(k, k);
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const it of items) {
    const col = THUMB_INK[colorOf(it)];
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = Math.max(it.sw || 2, 1.2 / k);
    try {
      if (it.type === 'image') {
        const el = els.get(it.id);
        if (el && el._img.complete && el._img.naturalWidth) g.drawImage(el._img, it.x, it.y, it.w, it.h);
        else { g.globalAlpha = 0.25; g.fillRect(it.x, it.y, it.w, it.h); g.globalAlpha = 1; }
      } else if (it.type === 'rect') {
        if (it.fill) { g.globalAlpha = 0.2; g.fillRect(it.x, it.y, it.w, it.h); g.globalAlpha = 1; }
        g.strokeRect(it.x, it.y, it.w, it.h);
      } else if (it.type === 'ellipse') {
        g.beginPath(); g.ellipse(it.x + it.w / 2, it.y + it.h / 2, it.w / 2, it.h / 2, 0, 0, Math.PI * 2);
        if (it.fill) { g.globalAlpha = 0.2; g.fill(); g.globalAlpha = 1; }
        g.stroke();
      } else if (it.type === 'arrow') {
        g.beginPath(); g.moveTo(it.x, it.y); g.lineTo(it.x + it.w, it.y + it.h); g.stroke();
        if (full) {
          const a = Math.atan2(it.h, it.w); const s = 7 + it.sw * 2.4; const x2 = it.x + it.w; const y2 = it.y + it.h;
          g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - s * Math.cos(a + 0.42), y2 - s * Math.sin(a + 0.42)); g.lineTo(x2 - s * Math.cos(a - 0.42), y2 - s * Math.sin(a - 0.42)); g.closePath(); g.fill(); g.stroke();
        }
      } else if (it.type === 'pen') {
        const sx = it.w / it.pw; const sy = it.h / it.ph;
        g.beginPath(); g.moveTo(it.x + it.pts[0] * sx, it.y + it.pts[1] * sy);
        for (let i = 2; i < it.pts.length; i += 2) g.lineTo(it.x + it.pts[i] * sx, it.y + it.pts[i + 1] * sy);
        g.stroke();
      } else {
        if (it.type === 'note') { g.globalAlpha = 0.45; g.fillRect(it.x, it.y, it.w, it.h); g.globalAlpha = 1; g.fillStyle = '#333'; }
        g.font = `${it.size}px -apple-system, "Segoe UI", sans-serif`;
        g.textBaseline = 'top';
        const pad = it.type === 'note' ? 12 : 4;
        const width = Math.max(it.w - pad * 2, 10);
        const lines = full ? wrapLines(g, it.text, width) : (it.text || '').split('\n').slice(0, 12).map((l) => l.slice(0, 80));
        lines.forEach((line, i) => (full ? g.fillText(line, it.x + pad, it.y + pad + i * it.size * 1.3) : g.fillText(line, it.x + pad, it.y + pad + i * it.size * 1.3, width)));
      }
    } catch {}
  }
  return new Promise((resolve) => { try { c.toBlob(async (blob) => resolve(blob ? new Uint8Array(await blob.arrayBuffer()) : null), 'image/png'); } catch { resolve(null); } });
}

function thumbnail() {
  const b = union(items);
  if (!b) return Promise.resolve(null);
  const W = 400; const H = 250;
  const k = Math.min((W - 24) / Math.max(b.w, 1), (H - 24) / Math.max(b.h, 1), 2);
  return raster({ W, H, k, cx: b.x + b.w / 2, cy: b.y + b.h / 2 });
}

// Export du tableau entier en PNG (« Share Via… », « Save As » d'Arc) : fond blanc, marge,
// deux points d'image par point du tableau, au plus EXPORT_MAX de côté.
const EXPORT_MAX = 8000;
const EXPORT_PAD = 40;
function exportSize() {
  const b = union(items);
  if (!b) return null;
  const k = Math.min(2, EXPORT_MAX / (b.w + EXPORT_PAD * 2), EXPORT_MAX / (b.h + EXPORT_PAD * 2));
  return { W: Math.max(1, Math.round((b.w + EXPORT_PAD * 2) * k)), H: Math.max(1, Math.round((b.h + EXPORT_PAD * 2) * k)), k, cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
}
async function exportPng() {
  endEdit();
  const size = exportSize();
  if (!size) { flash(t('easel.exportEmpty')); return null; }
  const data = await raster({ ...size, bg: '#ffffff', full: true });
  if (!data) return null;
  const file = await O.send('easel:export', { board: boardId, title, data });
  if (file) flash(t('easel.exported'));
  return file;
}

// Le document part sous forme de texte JSON (une seule chaîne à transmettre,
// quelle que soit la taille des tracés) ; le processus principal le revalide.
function save(quick) {
  clearTimeout(saveTimer);
  if (!dirty || dead || !loaded) return saving;
  dirty = false;
  const json = JSON.stringify({ title, view: { x: round(view.x), y: round(view.y), z: view.z }, items });
  const withThumb = thumbStale && !quick;
  if (withThumb) thumbStale = false;
  saving = saving.then(async () => {
    const thumb = withThumb ? await thumbnail() : null;
    const ok = await O.send('easel:save', { id: boardId, json, thumb });
    if (ok && !dead) flash(t('easel.saved'));
    return ok;
  }).catch(() => false);
  return saving;
}

// Onglet masqué ou fermé : on n'attend pas le délai.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { endEdit(); save(true); return; }
  // De retour : l'enregistrement fait en partant n'a pas pu dessiner la vignette, elle est due.
  if (thumbStale && loaded && !dead) { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(save, 500); }
});
window.addEventListener('pagehide', () => { endEdit(); save(true); });

// --- Messages du processus principal ---------------------------------------------------
async function takeInbox() {
  const got = (await O.send('easel:inbox', boardId)) || [];
  if (!got.length || dead) return;
  // Les captures arrivent au centre de la vue, décalées si plusieurs.
  const c = toWorld(innerWidth / 2, innerHeight / 2);
  const added = got.map((it, i) => ({ ...it, id: uid(), x: round(c.x - it.w / 2 + i * 24), y: round(c.y - it.h / 2 + i * 24) }));
  commit(items.concat(added));
  setTool('select');
  setSel(added.map((it) => it.id));
}

O.on('easel', (m) => {
  if (!m || dead) return;
  if (m.op === 'undo' || m.op === 'redo') {
    // Choisi dans le menu : en cours de saisie, c'est le texte qui annule.
    if (typing()) document.execCommand(m.op);
    else if (m.op === 'undo') undo();
    else redo();
  } else if (m.op === 'export') exportPng();
  else if (m.op === 'inbox' && m.board === boardId && loaded) takeInbox();
  else if (m.op === 'deleted' && m.board === boardId) { dead = true; clearTimeout(saveTimer); $('gone').hidden = false; }
});
O.on('settings', (s) => { if (setLang(s.lang)) document.title = title || t('easel.untitled'); });

// --- Démarrage ---------------------------------------------------------------------------
async function boot() {
  stage.dataset.tool = tool;
  document.querySelector('#tools [data-tool=select]').classList.add('on');
  const raw = boardId ? await O.send('easel:load', boardId) : null;
  let doc = null;
  try { doc = raw ? JSON.parse(raw) : null; } catch {}
  if (!doc) { dead = true; $('gone').hidden = false; document.title = t('easel.title'); return; }
  title = doc.title || '';
  $('title').value = title;
  document.title = title || t('easel.untitled');
  Object.assign(view, { x: doc.view.x, y: doc.view.y, z: doc.view.z });
  items = doc.items;
  loaded = true;
  applyView();
  reconcile();
  await takeInbox();
}

// Accès pour les tests : mêmes fonctions que celles qu'appellent la souris et le clavier.
const E = {
  get items() { return items; },
  get sel() { return [...sel]; },
  get view() { return { ...view }; },
  get tool() { return tool; },
  get undoDepth() { return undoStack.length; },
  perf,
  resetPerf() { Object.assign(perf, { moves: 0, moveMs: 0, moveMax: 0, frames: 0, frameMs: 0, frameMax: 0, gapMax: 0, lastFrame: 0 }); },
  setView(x, y, z) { Object.assign(view, { x, y, z: clamp(z, Z_MIN, Z_MAX) }); applyView(); touch(true); },
  add(list) { const added = list.map((it) => ({ ...it, id: uid() })); commit(items.concat(added)); return added.map((it) => it.id); },
  addText, addImages, setSel, setTool, undo, redo, duplicate, removeSelected, fit, save, startEdit, endEdit, ingest, exportPng, exportSize, snapMove,
  get editing() { return editing ? { id: editing.id, spellcheck: editing.tx.spellcheck } : null; },
  ready: null,
};
window.E = E;
E.ready = boot();
