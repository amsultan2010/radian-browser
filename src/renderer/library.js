// Bibliothèque : médias, téléchargements, tableaux et notes, Espaces, Boosts, archive
// des onglets fermés, historique — dans l'ordre et la disposition de la Library d'Arc.
// Titres, adresses et noms de fichiers viennent des pages web : ils ne sont
// jamais insérés comme HTML (textContent, ou `esc` pour les rares gabarits).
const KINDS = ['media', 'downloads', 'easels', 'spaces', 'boosts', 'archive', 'history'];
const SEARCH = { media: 'lib.searchMedia', downloads: 'lib.searchDownloads', easels: 'lib.searchEasels', boosts: 'lib.searchBoosts', archive: 'lib.searchArchive', history: 'lib.searchHistory' };
// Behind the Filter button (Arc: Downloads and Archived Tabs; Radian adds its media folders and History).
const FILTERED = ['media', 'downloads', 'archive', 'history'];
const CLEAR = { history: 'lib.clearHistory', archive: 'lib.clearArchive', downloads: 'lib.clearDownloads', media: 'lib.clearDownloads' };
const EMPTY = { downloads: ['lib.emptyDownloads', 'lib.emptyDownloadsHint'], easels: ['lib.emptyEasels', 'lib.emptyEaselsHint'], boosts: ['lib.emptyBoosts', 'lib.emptyBoostsHint'], archive: ['lib.emptyArchive', 'lib.emptyArchiveHint'] };
const HOW = ['', 'manual', 'auto', 'little'];
const list = document.getElementById('list');
const q = document.getElementById('q');
const fHow = document.getElementById('f-how');
const fSpace = document.getElementById('f-space');
const fFrom = document.getElementById('f-from');
const filterBtn = document.getElementById('filter');
const FROM = ['orbe', 'downloads', 'desktop', 'documents'];
let kind = KINDS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'media';
let rows = [];
let data = null;
let timer = null;
let filtersOpen = false;
let dark = matchMedia('(prefers-color-scheme: dark)').matches;

const DAY = 864e5;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// Période d'une date, comme dans Arc : aujourd'hui, hier, plus tôt cette semaine,
// la semaine dernière, plus tôt ce mois-ci, puis le mois (et l'année si ce n'est pas la nôtre).
// La semaine commence le lundi.
function period(ts, now = Date.now()) {
  const today = new Date(now);
  const start = startOfDay(today);
  if (ts >= start) return t('lib.today');
  if (ts >= start - DAY) return t('lib.yesterday');
  const monday = start - ((today.getDay() + 6) % 7) * DAY;
  if (ts >= monday) return t('lib.thisWeek');
  if (ts >= monday - 7 * DAY) return t('lib.lastWeek');
  const d = new Date(ts);
  if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()) return t('lib.thisMonth');
  const label = d.toLocaleDateString(lang, { month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Jour d'une ligne plus ancienne qu'hier (les groupes couvrent alors plusieurs jours).
function when(ts, now = Date.now()) {
  const hour = new Date(ts).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  if (ts >= startOfDay(new Date(now)) - DAY) return hour;
  return new Date(ts).toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + hour;
}

function size(n) {
  if (!n) return '';
  const u = lang === 'fr' ? ['o', 'Ko', 'Mo', 'Go'] : ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < 3) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// An icon of the page's sprite (library.html).
function icon(id, cls = 'i') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-' + id);
  svg.appendChild(use);
  return svg;
}

function button(act, label, cls = '') {
  const b = el('button', 'btn' + (cls ? ' ' + cls : ''), label);
  b.dataset.do = act;
  return b;
}

// A row button drawn as an icon, named by its tooltip.
function iconButton(act, id, title) {
  const b = button(act, null, 'icon');
  b.title = title;
  b.appendChild(icon(id));
  return b;
}

function option(value, label) {
  const o = el('option', '', label);
  o.value = value;
  return o;
}

// Sous « Filtrer » : filtres de l'archive (façon de fermer, Espace), dossier des médias, vider la liste.
function drawFilters() {
  filterBtn.hidden = !FILTERED.includes(kind);
  filterBtn.classList.toggle('on', filtersOpen);
  document.getElementById('filters').hidden = !filtersOpen || !FILTERED.includes(kind);
  fHow.hidden = fSpace.hidden = kind !== 'archive';
  fFrom.hidden = document.getElementById('from-label').hidden = kind !== 'media';
  // Médias : d'où ils viennent. Le choix n'est pas retenu : un dossier de l'utilisateur
  // n'est lu que lorsqu'il vient d'être choisi ici.
  const from = fFrom.value;
  fFrom.textContent = '';
  for (const f of FROM) fFrom.appendChild(option(f, t('lib.from.' + f)));
  fFrom.value = FROM.includes(from) ? from : 'orbe';
  const clear = document.getElementById('clear');
  // (Médias d'un dossier de l'utilisateur : rien à vider, la liste n'est pas celle d'Orbe.)
  clear.hidden = !CLEAR[kind] || (kind === 'media' && fFrom.value !== 'orbe');
  clear.textContent = CLEAR[kind] ? t(CLEAR[kind]) : '';
  if (kind !== 'archive') return;
  const how = fHow.value;
  fHow.textContent = '';
  for (const h of HOW) fHow.appendChild(option(h, t('lib.how.' + (h || 'all'))));
  fHow.value = HOW.includes(how) ? how : '';
  const space = fSpace.value;
  const names = (data && data.spaceNames) || [];
  fSpace.textContent = '';
  fSpace.appendChild(option('', t('lib.allSpaces')));
  for (const s of names) fSpace.appendChild(option(s.id, s.name));
  fSpace.value = names.some((s) => s.id === space) ? space : '';
}

function drawEmpty() {
  const box = el('div', 'empty');
  // Archive filtrée ou recherche sans résultat : le message ordinaire.
  const narrowed = q.value.trim() || (kind === 'archive' && (fHow.value || fSpace.value));
  if (kind === 'media' && !narrowed && fFrom.value === 'orbe') {
    // Arc's tip: "Show Media" lists the user's Downloads folder (read only when asked, as the filter does).
    const tip = el('div', 'tip');
    tip.append(document.querySelector('[data-tab="media"] svg').cloneNode(true), el('b', '', t('lib.mediaTipTitle')), el('p', '', t('lib.mediaTip')));
    const go = el('button', 'go', t('lib.showMedia'));
    go.dataset.do = 'show-media';
    const note = el('small');
    note.append(icon('lock'), el('span', '', t('lib.mediaPrivate')));
    tip.append(go, note);
    box.appendChild(tip);
    list.appendChild(box);
    return;
  }
  const [title, hint] = EMPTY[kind] || ['lib.empty'];
  if (!narrowed) box.appendChild(document.querySelector(`[data-tab="${kind}"] svg`).cloneNode(true));
  box.appendChild(el('div', '', t(narrowed ? 'lib.empty' : title)));
  if (hint && !narrowed) box.appendChild(el('div', 'hint', t(hint)));
  list.appendChild(box);
}

function draw() {
  document.title = t('lib.title') + ' — ' + t('lib.' + kind);
  document.body.dataset.kind = kind;
  for (const b of document.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === kind);
  q.placeholder = t(SEARCH[kind] || 'lib.search');
  drawFilters();
  list.textContent = '';
  list.className = '';
  if (kind === 'spaces') return drawSpaces();
  if (!rows.length) return drawEmpty();
  if (kind === 'easels') return drawBoards();
  if (kind === 'boosts') return drawBoosts();
  let card = null;
  let group = '';
  const now = Date.now();
  rows.forEach((r, i) => {
    const label = period(r.at, now);
    if (label !== group) {
      group = label;
      card = el('div', 'card');
      list.append(el('h2', '', label), card);
    }
    const files = kind === 'downloads' || kind === 'media';
    const line = el('div', 'line' + (files ? '' : ' click'));
    line.dataset.i = i;
    if (files) drawFile(line, r, now);
    else {
      // As Arc's Archived Tabs: favicon, title over address.
      const body = el('div', 'grow');
      body.append(el('div', 'name', r.title), el('div', 'sub', r.url));
      line.append(faviconEl(r.favicon, r.title), body);
      if (kind === 'history') line.appendChild(el('span', 'muted when', when(r.at, now)));
      if (kind === 'archive') line.appendChild(iconButton('delete', 'x', t('lib.archiveDelete')));
    }
    card.appendChild(line);
  });
}

// Ligne d'un fichier : état, boutons, menu « … » ; un fichier présent se glisse hors d'Orbe.
function drawFile(line, r, now) {
  const body = el('div', 'grow');
  const pct = r.total ? Math.round((r.received / r.total) * 100) : 0;
  const running = r.state === 'progressing';
  const progress = `${pct} %${r.total ? ' — ' + size(r.received) + ' / ' + size(r.total) : (r.received ? ' — ' + size(r.received) : '')}`;
  let status = t('lib.failed');
  if (running) status = `${t(r.paused ? 'dl.paused' : (r.stalled ? 'dl.stalled' : 'lib.inProgress'))} — ${progress}`;
  else if (r.state === 'completed') status = r.exists ? size(r.total || r.received) : t('dl.missing');
  else if (r.state === 'cancelled') status = t('dl.cancelled');
  else if (r.received) status = `${t('lib.failed')} — ${progress}`;
  const at = running ? '' : ' · ' + when(r.at, now);
  body.append(el('div', 'name', r.name), el('div', 'sub', (r.folder ? `${status} · ${t('lib.from.' + r.folder)}` : `${status} · ${host(r.url)}`) + at));
  if (r.danger) body.appendChild(el('div', 'sub danger', t('dl.dangerNote')));
  // Marque « venu d'Internet » impossible à poser : le système n'avertira pas à l'ouverture.
  if (r.marked === false) body.appendChild(el('div', 'sub danger unmarked', t('dl.unmarkedNote')));
  if (running) {
    const bar = el('div', 'bar');
    const fill = el('i');
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    body.appendChild(bar);
  }
  line.dataset.state = r.state;
  line.append(letterIcon(r.name), body);
  // En cours : pause ou reprise, et annulation. Interrompu ou annulé : reprise (ou nouveau départ).
  if (running && kind === 'downloads') line.append(r.paused || r.stalled ? button('resume', t('dl.resume')) : button('pause', t('dl.pause')), button('cancel', t('dl.cancel')));
  else if ((r.state === 'interrupted' || r.state === 'cancelled') && kind === 'downloads') line.appendChild(button('resume', t(r.state === 'interrupted' && r.canResume ? 'dl.resume' : 'dl.retry')));
  if (r.exists) {
    line.append(iconButton('open', 'open', t('lib.open')), iconButton('reveal', 'search', t('lib.reveal')));
    line.draggable = true;
  }
  // (Fichier d'un dossier de l'utilisateur : Orbe n'en tient pas de fiche, donc pas de menu.)
  if (r.folder) return;
  line.appendChild(iconButton('menu', 'more', t('dl.more')));
}

// Tableaux et notes : vignette (ou début du texte), titre, date ; un clic ouvre en aperçu (Peek), comme dans Arc.
function drawBoards() {
  const grid = document.createElement('div');
  grid.className = 'boards';
  rows.forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'card board';
    card.dataset.i = i;
    const thumb = document.createElement('div');
    thumb.className = r.note ? 'thumb text' : 'thumb';
    if (r.note) thumb.textContent = r.text;
    if (r.thumb) { const img = document.createElement('img'); img.src = r.thumb; img.alt = ''; img.draggable = false; thumb.appendChild(img); }
    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = r.title || t(r.note ? 'notes.untitled' : 'easel.untitled');
    const sub = document.createElement('div');
    sub.className = 'sub muted';
    sub.textContent = r.note ? period(r.updated) : `${period(r.updated)} · ${t('easel.items', { n: r.count })}`;
    meta.append(name, sub);
    const del = document.createElement('button');
    del.className = 'btn del';
    del.dataset.do = 'delete';
    del.textContent = t('easel.delete');
    card.append(thumb, meta, del);
    grid.appendChild(card);
  });
  list.appendChild(grid);
}

// A tab or folder in a Space column.
function spaceItem(it) {
  const b = el('button', 'item' + (it.folder ? ' folder' : ''));
  b.dataset.tab = it.id;
  const body = el('div', 'grow');
  body.appendChild(el('div', 'name', it.title));
  if (it.folder) b.appendChild(icon('folder', 'folder-i'));
  else { b.appendChild(faviconEl(it.favicon, it.title)); body.appendChild(el('div', 'sub', host(it.url))); }
  b.appendChild(body);
  return b;
}

// Espaces : le gestionnaire d'Arc. Une colonne par Espace, à ses couleurs : en-tête (icône, nom,
// thème), épinglés, « ↓ Clear », onglets du jour, poignée et menu « … » ; un + rond pour un nouvel Espace.
function drawSpaces() {
  list.className = 'cols';
  rows.forEach((r, i) => {
    const col = el('div', 'col');
    col.dataset.i = i;
    col.style.setProperty('--col-paint', OrbeTheme.paint(OrbeTheme.palette(r.theme, dark), 0.6));
    const head = el('div', 'col-head');
    const name = el('button', 'col-name');
    name.dataset.do = 'focus';
    name.title = r.profile;
    name.append(el('span', '', r.icon), el('span', '', r.name));
    const theme = el('button', 'ib');
    theme.dataset.do = 'theme';
    theme.title = t('spaces.editTheme');
    theme.appendChild(icon('pencil'));
    head.append(name, theme);
    const items = el('div', 'col-list');
    for (const it of r.items.pinned) items.appendChild(spaceItem(it));
    const clear = el('div', 'col-clear');
    const clearBtn = el('button');
    clearBtn.dataset.do = 'clear';
    clearBtn.append(icon('down'), el('span', '', t('side.clear')));
    clear.appendChild(clearBtn);
    items.appendChild(clear);
    for (const it of r.items.today) items.appendChild(spaceItem(it));
    const foot = el('div', 'col-foot');
    const move = el('div', 'ib col-move');
    move.draggable = true;
    move.appendChild(icon('move'));
    const more = el('button', 'ib');
    more.dataset.do = 'menu';
    more.title = t('side.spaceMore');
    more.appendChild(icon('more'));
    foot.append(move, more);
    col.append(head, items, foot);
    list.appendChild(col);
  });
  const add = el('button', 'add-space');
  add.dataset.do = 'new';
  add.title = t('spaces.new');
  add.appendChild(icon('plus'));
  list.appendChild(add);
}

// Boosts : un par site ; activer, couper, supprimer.
function drawBoosts() {
  const card = el('div', 'card');
  rows.forEach((r, i) => {
    const line = el('div', 'line click' + (r.enabled ? '' : ' off'));
    line.dataset.i = i;
    const body = el('div', 'grow');
    const parts = [];
    if (r.css) parts.push(t('lib.boostCss'));
    if (r.zaps) parts.push(t('lib.boostZaps', { n: r.zaps }));
    if (r.review) parts.push(t('boost.toReview')); else if (!r.enabled) parts.push(t('lib.boostOff'));
    body.append(el('div', 'name', r.host), el('div', 'sub', parts.join(' · ')));
    line.append(letterIcon(r.host), body, button('toggle', t(r.enabled ? 'lib.boostDisable' : (r.review ? 'boost.reviewBtn' : 'lib.boostEnable'))), button('delete', t('lib.boostDelete')));
    card.appendChild(line);
  });
  list.appendChild(card);
}

async function load() {
  O.send('lib:section', kind);
  if (kind === 'easels') {
    const needle = q.value.trim().toLowerCase();
    const [boards, notes] = await Promise.all([O.send('easel:list'), O.send('notes:list')]);
    // A Note: its first line as title, the start of its text as thumbnail (plain text, never HTML).
    const noteRows = (notes || []).map((n) => {
      const lines = String(n.text || '').split('\n').filter((l) => l.trim());
      return { note: true, id: n.id, title: (lines[0] || '').replace(/^(- |\d+\. |\[[ x]\] )/, '').slice(0, 80), text: lines.slice(1).join('\n').slice(0, 300), updated: n.at };
    });
    rows = [...(boards || []), ...noteRows].filter((b) => !needle || (b.title || t(b.note ? 'notes.untitled' : 'easel.untitled')).toLowerCase().includes(needle))
      .sort((a, b) => b.updated - a.updated);
    draw();
    return;
  }
  // (Spaces: no search field, as in Arc: every Space.)
  data = await O.send('lib:get', { q: kind === 'spaces' ? '' : q.value, how: fHow.value, space: fSpace.value, from: kind === 'media' && FROM.includes(fFrom.value) ? fFrom.value : 'orbe' });
  rows = (data && data[kind]) || [];
  draw();
  clearTimeout(timer);
  // Tant qu'un téléchargement avance, la liste se rafraîchit (sauf pendant un clic sur un bouton).
  if (kind === 'downloads' && rows.some((r) => r.state === 'progressing' && !r.paused)) timer = setTimeout(load, 700);
}

document.querySelector('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  kind = b.dataset.tab;
  filtersOpen = false;
  history.replaceState(null, '', '#' + kind);
  load();
});
filterBtn.onclick = () => { filtersOpen = !filtersOpen; drawFilters(); };
document.getElementById('clear').onclick = async () => {
  await O.send('lib:clear', kind === 'media' ? 'downloads' : kind);
  load();
};
q.addEventListener('input', load);
fHow.addEventListener('change', load);
fSpace.addEventListener('change', load);
fFrom.addEventListener('change', load);

list.addEventListener('click', async (e) => {
  if (e.target.closest('[data-do=show-media]')) { fFrom.value = 'downloads'; load(); return; }
  if (kind === 'spaces') {
    // Space manager: the column's tab, its header, theme, "↓ Clear", "…" menu; the round + makes a Space.
    if (e.target.closest('[data-do=new]')) { await O.send('lib:newSpace'); load(); return; }
    const col = e.target.closest('.col');
    const act = e.target.closest('[data-do], .item');
    if (!col || !act) return;
    const r = rows[Number(col.dataset.i)];
    const item = act.classList.contains('item') && !act.classList.contains('folder');
    await O.send('lib:space', item ? { id: r.id, do: 'tab', tab: act.dataset.tab } : { id: r.id, do: act.dataset.do || 'focus' });
    load();
    return;
  }
  const board = e.target.closest('.board');
  if (board && kind === 'easels') {
    const b = rows[Number(board.dataset.i)];
    if (e.target.closest('[data-do=delete]')) { await O.send(b.note ? 'notes:delete' : 'easel:delete', b.id); load(); }
    else O.send('lib:peek', { [b.note ? 'note' : 'easel']: b.id, x: e.clientX, y: e.clientY });
    return;
  }
  const line = e.target.closest('.line');
  if (!line) return;
  const r = rows[Number(line.dataset.i)];
  const act = e.target.closest('[data-do]');
  const what = act && act.dataset.do;
  if (kind === 'downloads' || kind === 'media') {
    if (what === 'open') O.send('lib:openFile', r.id);
    else if (what === 'reveal') O.send('lib:reveal', r.id);
    else if (what) { await O.send('dl:' + what, r.id); load(); }
  } else if (kind === 'archive') {
    // Un clic rouvre l'onglet dans son Espace d'origine ; la croix retire l'entrée.
    await O.send(what === 'delete' ? 'lib:archiveDelete' : 'lib:restore', r.id);
    load();
  } else if (kind === 'boosts') {
    await O.send('lib:boost', { host: r.host, do: what || 'open' });
    load();
  } else O.send('open', r.url);
});

// Clic droit sur un fichier : son menu (ouvrir, copier, afficher, partager, masquer, corbeille).
list.addEventListener('contextmenu', async (e) => {
  const line = e.target.closest('.line');
  if (!line || (kind !== 'downloads' && kind !== 'media')) return;
  e.preventDefault();
  if (rows[Number(line.dataset.i)].folder) return;
  await O.send('dl:menu', rows[Number(line.dataset.i)].id);
  load();
});

// Glisser un fichier hors de la Bibliothèque : le système prend le relais avec le vrai fichier.
// Space manager: a column's move handle drags it before or after another column.
let movingSpace = null;
list.addEventListener('dragstart', (e) => {
  const handle = kind === 'spaces' && e.target.closest('.col-move');
  if (handle) {
    movingSpace = rows[Number(handle.closest('.col').dataset.i)].id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(handle.closest('.col'), 20, 20);
    return;
  }
  const line = e.target.closest('.line[draggable=true]');
  if (!line || (kind !== 'downloads' && kind !== 'media')) return;
  e.preventDefault();
  O.send('lib:drag', rows[Number(line.dataset.i)].id);
});
const dropCol = (e) => (movingSpace && e.target.closest ? e.target.closest('.col') : null);
list.addEventListener('dragover', (e) => {
  const col = dropCol(e);
  for (const c of list.querySelectorAll('.col.drop')) if (c !== col) c.classList.remove('drop');
  if (!col) return;
  e.preventDefault();
  col.classList.add('drop');
});
list.addEventListener('drop', async (e) => {
  const col = dropCol(e);
  if (!col) return;
  e.preventDefault();
  const box = col.getBoundingClientRect();
  const index = Number(col.dataset.i) + (e.clientX > box.left + box.width / 2 ? 1 : 0);
  await O.send('lib:space', { id: movingSpace, do: 'move', index });
  load();
});
list.addEventListener('dragend', () => {
  movingSpace = null;
  for (const c of list.querySelectorAll('.col.drop')) c.classList.remove('drop');
});

window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (KINDS.includes(h) && h !== kind) { kind = h; filtersOpen = false; load(); }
});
window.addEventListener('focus', load);
document.getElementById('exit').onclick = () => O.send('lib:close');

// The Space's colours (window.js `themeNow`): text over the shell's paint, and the Space columns.
function applyLook(look) {
  if (!look || !look.space) return;
  const p = OrbeTheme.palette(look.space, look.dark);
  const vars = OrbeTheme.cssVars(p);
  const root = document.documentElement;
  for (const k of OrbeTheme.TEXT_VARS) root.style.setProperty(k, vars[k]);
  root.dataset.scheme = p.dark ? 'dark' : 'light';
  if (dark !== !!look.dark) { dark = !!look.dark; if (kind === 'spaces') draw(); }
}
O.on('theme', applyLook);
// Each time the panel is shown: it slides in from the left, in the colours of the Space shown.
const panel = document.getElementById('panel');
O.on('overlay', (p) => {
  if (!p || p.mode !== 'library-in') return;
  O.send('themeGet').then(applyLook).catch(() => {});
  panel.classList.remove('in');
  void panel.offsetWidth;
  panel.classList.add('in');
});
O.on('settings', (s) => { if (setLang(s.lang)) draw(); });
O.send('themeGet').then(applyLook).catch(() => {});
load();
