// Bibliothèque : historique, archive des onglets fermés, téléchargements, médias,
// tableaux, Espaces, Boosts.
// Titres, adresses et noms de fichiers viennent des pages web : ils ne sont
// jamais insérés comme HTML (textContent, ou `esc` pour les rares gabarits).
const KINDS = ['history', 'archive', 'downloads', 'media', 'easels', 'spaces', 'boosts'];
const CLEAR = { history: 'lib.clearHistory', archive: 'lib.clearArchive', downloads: 'lib.clearDownloads', media: 'lib.clearDownloads', easels: 'easel.new', spaces: 'spaces.new', boosts: '' };
const EMPTY = { archive: ['lib.emptyArchive', 'lib.emptyArchiveHint'], easels: ['easel.empty'], boosts: ['lib.emptyBoosts', 'lib.emptyBoostsHint'] };
const HOW = ['', 'manual', 'auto', 'little'];
const list = document.getElementById('list');
const q = document.getElementById('q');
const fHow = document.getElementById('f-how');
const fSpace = document.getElementById('f-space');
const fFrom = document.getElementById('f-from');
const FROM = ['orbe', 'downloads', 'desktop', 'documents'];
let kind = KINDS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'history';
let rows = [];
let data = null;
let timer = null;

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

function button(act, label, cls = '') {
  const b = el('button', 'btn' + (cls ? ' ' + cls : ''), label);
  b.dataset.do = act;
  return b;
}

function option(value, label) {
  const o = el('option', '', label);
  o.value = value;
  return o;
}

// Filtres de l'archive : façon dont l'onglet a été fermé, Espace où il était.
function drawFilters() {
  document.getElementById('filters').hidden = kind !== 'archive' && kind !== 'media';
  fHow.hidden = fSpace.hidden = kind !== 'archive';
  fFrom.hidden = document.getElementById('from-label').hidden = kind !== 'media';
  if (kind === 'media') {
    // Médias : d'où ils viennent. Le choix n'est pas retenu : un dossier de l'utilisateur
    // n'est lu que lorsqu'il vient d'être choisi ici.
    const from = fFrom.value;
    fFrom.textContent = '';
    for (const f of FROM) fFrom.appendChild(option(f, t('lib.from.' + f)));
    fFrom.value = FROM.includes(from) ? from : 'orbe';
    return;
  }
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
  const [title, hint] = EMPTY[kind] || ['lib.empty'];
  const box = el('div', 'empty');
  // Archive filtrée ou recherche sans résultat : le message ordinaire.
  const narrowed = q.value.trim() || (kind === 'archive' && (fHow.value || fSpace.value));
  box.appendChild(el('div', '', t(narrowed ? 'lib.empty' : title)));
  if (hint && !narrowed) box.appendChild(el('div', 'hint', t(hint)));
  list.appendChild(box);
}

function draw() {
  document.title = t('lib.title') + ' — ' + t('lib.' + kind);
  for (const b of document.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === kind);
  const clear = document.getElementById('clear');
  // (Médias d'un dossier de l'utilisateur : rien à vider, la liste n'est pas celle d'Orbe.)
  clear.hidden = !CLEAR[kind] || (kind === 'media' && FROM.includes(fFrom.value) && fFrom.value !== 'orbe');
  clear.textContent = CLEAR[kind] ? t(CLEAR[kind]) : '';
  drawFilters();
  list.textContent = '';
  if (!rows.length) return drawEmpty();
  if (kind === 'easels') return drawBoards();
  if (kind === 'spaces') return drawSpaces();
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
      const body = el('div', 'grow');
      body.append(el('div', 'name', r.title), el('div', 'sub', r.url));
      line.append(faviconEl(r.favicon, r.title), body);
      if (kind === 'archive') {
        // D'où vient l'entrée : son Espace, et « archivé d'office » ou « petite fenêtre » le cas échéant.
        if (r.space) line.appendChild(el('span', 'tag', r.space));
        if (r.by !== 'manual') line.appendChild(el('span', 'tag', t('lib.by.' + r.by)));
      }
      line.appendChild(el('span', 'muted', when(r.at, now)));
      if (kind === 'archive') {
        const x = button('delete', '✕', 'x');
        x.title = t('lib.archiveDelete');
        line.appendChild(x);
      }
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
  body.append(el('div', 'name', r.name), el('div', 'sub', r.folder ? `${status} · ${t('lib.from.' + r.folder)}` : `${status} · ${host(r.url)}`));
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
  if (!running) line.appendChild(el('span', 'muted', when(r.at, now)));
  // En cours : pause ou reprise, et annulation. Interrompu ou annulé : reprise (ou nouveau départ).
  if (running && kind === 'downloads') line.append(r.paused || r.stalled ? button('resume', t('dl.resume')) : button('pause', t('dl.pause')), button('cancel', t('dl.cancel')));
  else if ((r.state === 'interrupted' || r.state === 'cancelled') && kind === 'downloads') line.appendChild(button('resume', t(r.state === 'interrupted' && r.canResume ? 'dl.resume' : 'dl.retry')));
  if (r.exists) {
    line.append(button('open', t('lib.open')), button('reveal', t('lib.reveal')));
    line.draggable = true;
  }
  // (Fichier d'un dossier de l'utilisateur : Orbe n'en tient pas de fiche, donc pas de menu.)
  if (r.folder) return;
  const more = button('menu', '···', 'more');
  more.title = t('dl.more');
  line.appendChild(more);
}

// Tableaux : vignette, titre, date ; un clic ouvre le tableau dans un onglet.
function drawBoards() {
  const grid = document.createElement('div');
  grid.className = 'boards';
  rows.forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'card board';
    card.dataset.i = i;
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (r.thumb) { const img = document.createElement('img'); img.src = r.thumb; img.alt = ''; img.draggable = false; thumb.appendChild(img); }
    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = r.title || t('easel.untitled');
    const sub = document.createElement('div');
    sub.className = 'sub muted';
    sub.textContent = `${period(r.updated)} · ${t('easel.items', { n: r.count })}`;
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

// Espaces : un clic affiche l'Espace ; renommer, thème, supprimer.
function drawSpaces() {
  const card = el('div', 'card');
  rows.forEach((r, i) => {
    const line = el('div', 'line click');
    line.dataset.i = i;
    const dot = el('span', 'dot', r.icon);
    const body = el('div', 'grow');
    body.append(el('div', 'name', r.name), el('div', 'sub', `${t('lib.spaceCount', { pinned: r.pinned, today: r.today })} · ${r.profile}`));
    line.append(dot, body);
    if (r.current) line.appendChild(el('span', 'tag', t('lib.spaceCurrent')));
    line.append(button('rename', t('lib.spaceRename')), button('theme', t('lib.spaceTheme')));
    const del = button('delete', t('lib.spaceDelete'));
    del.disabled = r.only;
    line.appendChild(del);
    card.appendChild(line);
  });
  list.appendChild(card);
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
    rows = ((await O.send('easel:list')) || []).filter((b) => !needle || (b.title || t('easel.untitled')).toLowerCase().includes(needle));
    draw();
    return;
  }
  data = await O.send('lib:get', { q: q.value, how: fHow.value, space: fSpace.value, from: kind === 'media' && FROM.includes(fFrom.value) ? fFrom.value : 'orbe' });
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
  history.replaceState(null, '', '#' + kind);
  load();
});
document.getElementById('clear').onclick = async () => {
  // Onglet Tableaux : le bouton crée un tableau et l'ouvre. Onglet Espaces : un nouvel Espace.
  if (kind === 'easels') { await O.send('easel:open'); return; }
  if (kind === 'spaces') { await O.send('lib:newSpace'); load(); return; }
  await O.send('lib:clear', kind === 'media' ? 'downloads' : kind);
  load();
};
q.addEventListener('input', load);
fHow.addEventListener('change', load);
fSpace.addEventListener('change', load);
fFrom.addEventListener('change', load);

list.addEventListener('click', async (e) => {
  const board = e.target.closest('.board');
  if (board && kind === 'easels') {
    const b = rows[Number(board.dataset.i)];
    if (e.target.closest('[data-do=delete]')) { await O.send('easel:delete', b.id); load(); } else O.send('easel:open', b.id);
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
  } else if (kind === 'spaces') {
    await O.send('lib:space', { id: r.id, do: what || 'focus' });
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
list.addEventListener('dragstart', (e) => {
  const line = e.target.closest('.line[draggable=true]');
  if (!line || (kind !== 'downloads' && kind !== 'media')) return;
  e.preventDefault();
  O.send('lib:drag', rows[Number(line.dataset.i)].id);
});

window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (KINDS.includes(h) && h !== kind) { kind = h; load(); }
});
window.addEventListener('focus', load);
O.on('settings', (s) => { if (setLang(s.lang)) draw(); });
load();
