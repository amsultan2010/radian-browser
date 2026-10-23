// Vues flottantes. La même page sert de fenêtre modale (barre de commande,
// bascule d'onglets, thème), de barre de recherche ou de notification.
const $ = (id) => document.getElementById(id);
const send = O.send;
const panels = ['command', 'switcher', 'theme', 'space', 'icons', 'find', 'toast', 'peek', 'status', 'drop', 'swipe'];
let mode = null;

function show(name) {
  mode = name;
  $('icons').classList.remove('beside');
  for (const p of panels) $(p).hidden = p !== name;
}

// --- Barre de commande ------------------------------------------------------
const input = $('cmd-input');
const list = $('cmd-list');
let items = [];
let sel = -1;
let seq = 0;
let typed = '';
let deleting = false;
// Portée de la recherche : null (tout), 'actions' (⇥ sur une barre vide), ou
// { site, name } (recherche dans un site : son nom, ⇥ ou espace, la requête).
let scope = null;
let sites = {}; // clé tapée -> [identifiant, nom] (donnée à l'ouverture)

const KIND_ICON = { search: 'search', url: 'globe', history: 'globe', command: 'bolt', tab: 'globe', site: 'search' };

function setScope(next) {
  scope = next;
  const chip = $('cmd-scope');
  chip.hidden = !scope;
  chip.textContent = scope === 'actions' ? t('cmd.actions') : (scope ? scope.name : '');
  input.placeholder = scope === 'actions' ? t('cmd.actionsPlaceholder') : (scope ? t('cmd.searchSite', { site: scope.name }) : t('cmd.placeholder'));
}

// Entre dans une portée : le champ se vide, les suggestions suivent.
function enterScope(next) {
  setScope(next);
  input.value = '';
  typed = '';
  deleting = false;
  input.focus();
  query();
}

// Site désigné par la saisie entière (« yt », « youtube.com »), ou null.
function siteTyped() {
  const hit = sites[typed.trim().toLowerCase()];
  return hit ? { site: hit[0], name: hit[1] } : null;
}

function drawItems() {
  list.textContent = '';
  items.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = `cmd k-${it.kind}` + (i === sel ? ' sel' : '');
    row.dataset.i = i;
    const ic = document.createElement('span');
    ic.className = 'ic';
    // Sans icône de site (ou icône introuvable) : un globe, comme dans Arc, pas une lettre.
    const glyph = () => { ic.innerHTML = `<svg class="i"><use href="#i-${KIND_ICON[it.kind] || 'globe'}"/></svg>`; };
    const fav = it.favicon && faviconEl(it.favicon, it.title);
    if (fav && fav.tagName === 'IMG') { fav.addEventListener('error', glyph); ic.appendChild(fav); } else glyph();
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = it.title;
    // Comme dans Arc : un onglet ouvert dit « Switch to Tab » à droite (flèche dans un carré),
    // sur chaque ligne ; une action montre son raccourci à droite, sans « — Action ».
    const sub = document.createElement('span');
    sub.className = 'sub';
    const plain = it.kind === 'command' && (it.shortcut || it.subtitle === t('cmd.action'));
    // Onglet d'un autre Espace : le nom de cet Espace à la place de « Switch to Tab ».
    sub.textContent = it.kind === 'tab' ? it.space || t('cmd.switchTo') : (it.subtitle && !plain ? '— ' + it.subtitle : '');
    row.append(ic, title, sub);
    if (it.kind === 'tab') {
      const go = document.createElement('span');
      go.className = 'go';
      go.innerHTML = '<svg class="i"><use href="#i-arrow"/></svg>';
      row.appendChild(go);
    } else {
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = it.kind === 'site' ? '⇥' : (it.kind === 'command' && it.shortcut) || '';
      row.appendChild(hint);
    }
    // Suggestion venue de l'historique ou de l'archive : une croix l'oublie.
    if (it.deletable) {
      const del = document.createElement('button');
      del.className = 'del';
      del.tabIndex = -1;
      del.title = t('cmd.forget');
      del.innerHTML = '<svg class="i"><use href="#i-x"/></svg>';
      row.appendChild(del);
    }
    list.appendChild(row);
  });
}

function select(i) {
  sel = i;
  for (const row of list.children) {
    const on = Number(row.dataset.i) === sel;
    row.classList.toggle('sel', on);
    if (on) row.scrollIntoView({ block: 'nearest' });
  }
}

async function query() {
  const q = typed;
  const mine = ++seq;
  const res = (await send('suggest', scope ? { q, scope } : q)) || [];
  if (mine !== seq || mode !== 'command') return;
  items = res;
  // Comme dans Arc, la première ligne est toujours choisie : Entrée l'exécute, même champ vide.
  sel = items.length ? 0 : -1;
  // Complète l'adresse la plus probable, comme dans une barre d'adresse.
  const first = items[0];
  if (q && !scope && !deleting && first && first.complete && first.complete.toLowerCase().startsWith(q.toLowerCase()) && input.selectionStart === input.value.length) {
    input.value = q + first.complete.slice(q.length);
    input.setSelectionRange(q.length, input.value.length);
  }
  drawItems();
}

function run(background) {
  const text = input.value.trim();
  const item = sel >= 0 && items[sel] ? items[sel] : (text ? { kind: 'raw', title: text } : null);
  if (!item) return send('closeOverlay');
  // « Rechercher sur YouTube » : la ligne ouvre la recherche dans ce site.
  if (item.kind === 'site') return enterScope({ site: item.site, name: item.name });
  return send('run', { item, background });
}

// Oublie la suggestion (croix au survol, ou ⌥⌘⌫ sur la ligne sélectionnée).
async function forget(i) {
  const it = items[i];
  if (!it || !it.deletable) return;
  await send('suggestDelete', { url: it.url, deletable: true });
  const keep = Math.min(i, items.length - 2);
  await query();
  if (keep >= 0 && items[keep]) select(keep);
}

// Icône du champ : un globe tant qu'il montre l'adresse de la page (⌘L), une loupe sinon.
const fieldIcon = (url) => $('cmd-icon').querySelector('use').setAttribute('href', url ? '#i-globe' : '#i-search');

input.addEventListener('input', (e) => {
  deleting = !!e.inputType && e.inputType.startsWith('delete');
  typed = input.value;
  sel = -1; // until the new suggestions arrive, Enter goes to what was typed, not the old first row
  fieldIcon(false);
  query();
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !e.shiftKey && !scope && (!input.value || siteTyped())) {
    // ⇥ sur une barre vide : les actions seules. ⇥ après le nom d'un site : la recherche dans ce site.
    e.preventDefault();
    enterScope(input.value ? siteTyped() : 'actions');
  } else if (e.key === ' ' && !scope && typed.includes('.') && siteTyped() && input.selectionStart === typed.length && typed === typed.trim()) {
    // Domaine d'un site (« youtube.com ») puis espace : même effet que ⇥. Un simple mot
    // (« maps », « google ») garde l'espace : il commence souvent une recherche ordinaire.
    e.preventDefault();
    enterScope(siteTyped());
  } else if (e.key === 'Backspace' && scope && !input.value) {
    // Retour arrière sur un champ vide : on quitte la portée.
    e.preventDefault();
    enterScope(null);
  } else if (e.key === 'Backspace' && e.altKey && modKey(e)) {
    e.preventDefault();
    forget(sel);
  } else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
    e.preventDefault();
    if (items.length) select((sel + 1) % items.length);
  } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
    e.preventDefault();
    if (items.length) select(sel <= 0 ? items.length - 1 : sel - 1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    run(modKey(e));
  }
});

list.addEventListener('mousemove', (e) => {
  const row = e.target.closest('.cmd');
  if (row && Number(row.dataset.i) !== sel) select(Number(row.dataset.i));
});
// Un clic dans la liste ne prend pas le clavier : on continue de taper dans le champ
// (croix « oublier », ligne « Rechercher sur … » qui ouvre une portée).
list.addEventListener('mousedown', (e) => e.preventDefault());
list.addEventListener('click', (e) => {
  const row = e.target.closest('.cmd');
  if (!row) return;
  if (e.target.closest('.del')) return void forget(Number(row.dataset.i));
  sel = Number(row.dataset.i);
  run(modKey(e));
});

// Copier l'adresse entière depuis le champ : le presse-papiers reçoit « https:// »
// même si le champ ne montre que « exemple.fr/page » (adresse complétée ou tapée sans protocole).
input.addEventListener('copy', (e) => {
  const whole = input.selectionStart === 0 && input.selectionEnd === input.value.length && input.value.trim();
  const first = items[0];
  if (!whole || scope || !first || !first.url || !/^https?:/i.test(first.url)) return;
  const shown = input.value.trim().toLowerCase();
  const bare = first.url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '').toLowerCase();
  if ((first.kind !== 'url' && first.kind !== 'history') || (shown !== bare && shown !== bare + '/' && 'www.' + bare !== shown)) return;
  e.preventDefault();
  e.clipboardData.setData('text/plain', first.url);
});

function openCommand(p) {
  show('command');
  const box = $('command');
  box.classList.toggle('anchored', !!p.anchor);
  if (p.anchor) box.style.cssText = `left:${p.anchor.x}px;top:${p.anchor.y}px;width:${p.anchor.width}px`;
  else box.style.cssText = `left:${p.centerX ? p.centerX + 'px' : '50%'}`;
  input.value = p.value || '';
  fieldIcon(!!p.value);
  typed = '';
  deleting = false;
  sites = p.sites || {};
  setScope(null);
  items = p.items || [];
  // Première ligne choisie dès l'ouverture (Arc). ⌘L : c'est la page affichée, Entrée la recharge.
  sel = items.length ? 0 : -1;
  seq++;
  drawItems();
  input.focus();
  input.select();
}

O.on('suggest-more', (p) => {
  if (mode !== 'command' || scope || p.q !== typed) return;
  items = items.concat(p.items).slice(0, 9);
  drawItems();
});

// --- Bascule d'onglets ------------------------------------------------------
function openSwitcher(p) {
  show('switcher');
  const box = $('switcher');
  box.textContent = '';
  p.items.forEach((it, i) => {
    const el = document.createElement('div');
    el.className = 'sw' + (i === p.index ? ' sel' : '');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = it.title;
    // Vignette de la page quand elle existe, sinon l'icône du site.
    if (it.thumb) {
      const shot = document.createElement('img');
      shot.className = 'shot';
      shot.src = it.thumb;
      const cap = document.createElement('span');
      cap.className = 'cap';
      cap.append(faviconEl(it.favicon, it.title), name);
      el.classList.add('has-shot');
      el.append(shot, cap);
    } else {
      el.append(faviconEl(it.favicon, it.title), name);
    }
    box.appendChild(el);
  });
}

// --- Thème de l'Espace ------------------------------------------------------
// Sélecteur disposé comme celui d'Arc : apparence (claire, automatique, sombre),
// un champ de couleurs où chaque couleur est une poignée que l'on déplace (teinte
// autour du centre, saturation vers le bord), « − » et « + » pour passer de zéro à
// trois couleurs (zéro : thème par défaut), des pastilles par pages de neuf,
// l'intensité (vague) et le grain (molette). Chaque geste part aussitôt vers la
// fenêtre, qui se repeint : l'aperçu, c'est la fenêtre elle-même.
const SMAX = 0.8; // saturation au bord du champ
const V_FIELD = 0.93; // clarté des couleurs du champ : des pastels vifs, comme les fonds clairs d'Arc
const wheel = $('theme-wheel');
let theme = null; // { dots: [{h, s, v}], sel, intensity, grain, texture, mode, page }
let themeFrame = 0;
let themePatch = {};

const dotHex = (d) => OrbeTheme.hsvToHex(d.h, d.s, d.v);
// Envoi groupé : un message par image au plus, pendant qu'un point ou un curseur bouge.
function pushTheme(patch) {
  Object.assign(themePatch, patch);
  if (themeFrame) return;
  themeFrame = requestAnimationFrame(() => {
    themeFrame = 0;
    const out = themePatch;
    themePatch = {};
    send('theme', out);
  });
}
const pushColors = () => pushTheme({ colors: theme.dots.map(dotHex) });

// Grille du champ : chaque point a la couleur de sa place (plus gros vers le bord).
function drawGrid() {
  const c = $('theme-grid');
  const w = c.clientWidth;
  const k = devicePixelRatio || 1;
  if (!w || c.width === Math.round(w * k)) return;
  c.width = c.height = Math.round(w * k);
  const g = c.getContext('2d');
  g.scale(k, k);
  const n = 15;
  const step = w / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x + 0.5) * step - w / 2;
    const dy = (y + 0.5) * step - w / 2;
    const s = Math.min(1, Math.hypot(dx, dy) / (w / 2));
    g.fillStyle = OrbeTheme.hsvToHex(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360, s * SMAX, V_FIELD);
    g.beginPath();
    g.arc(w / 2 + dx, w / 2 + dy, 1.4 + s * 1.2, 0, Math.PI * 2);
    g.fill();
  }
}

const pageOf = (colors) => Math.max(0, OrbeTheme.SWATCHES.findIndex((page) => page.some((c) => c.join() === colors.join())));
function drawSwatches() {
  $('theme-presets').innerHTML = OrbeTheme.SWATCHES[theme.page].map((c, i) => `<button class="swatch" data-i="${i}" style="background:${c.length > 1 ? `linear-gradient(131deg, ${c.join(', ')})` : c[0]}"></button>`).join('');
}

function drawTheme() {
  const colors = theme.dots.map(dotHex);
  // Poignées : créées une fois, puis seulement déplacées.
  const R = wheel.clientWidth / 2;
  const dots = wheel.querySelectorAll('.dot');
  for (let i = theme.dots.length; i < dots.length; i++) dots[i].remove();
  theme.dots.forEach((d, i) => {
    let el = wheel.querySelectorAll('.dot')[i];
    if (!el) {
      el = document.createElement('button');
      el.className = 'dot';
      wheel.appendChild(el);
    }
    el.dataset.i = i;
    el.classList.toggle('sel', i === theme.sel);
    el.style.background = colors[i];
    const r = R * Math.min(1, d.s / SMAX);
    const a = (d.h * Math.PI) / 180;
    el.style.transform = `translate(${(R + r * Math.sin(a)).toFixed(1)}px, ${(R - r * Math.cos(a)).toFixed(1)}px)`;
  });
  wheel.classList.toggle('plain', !theme.dots.length);
  $('theme-less').disabled = !theme.dots.length;
  $('theme-more').disabled = theme.dots.length >= OrbeTheme.MAX_COLORS;
  const page = OrbeTheme.SWATCHES[theme.page];
  for (const b of $('theme-presets').children) b.classList.toggle('sel', page[b.dataset.i].join() === colors.join());
  $('theme-prev').disabled = theme.page === 0;
  $('theme-next').disabled = theme.page === OrbeTheme.SWATCHES.length - 1;
  for (const b of $('theme-modes').children) { b.classList.toggle('sel', b.dataset.mode === theme.mode); b.setAttribute('aria-checked', String(b.dataset.mode === theme.mode)); }
  $('theme-dial').style.setProperty('--turn', `${-135 + 270 * theme.grain}deg`);
  $('theme-dial').style.setProperty('--knob', `url("textures/${theme.texture}.png")`);
  $('theme-dial').style.setProperty('--amount', String(theme.grain));
  // Le panneau suit la couleur principale.
  document.documentElement.style.setProperty('--accent', colors[0] || OrbeTheme.DEFAULT_COLOR);
}

function openTheme(p) {
  show('theme');
  const t0 = OrbeTheme.normalize(p.space);
  theme = { dots: t0.colors.map(OrbeTheme.hexToHsv), sel: 0, intensity: t0.intensity, grain: t0.grain, texture: t0.texture, mode: t0.mode, page: pageOf(t0.colors) };
  $('theme').style.left = (p.x || 260) + 'px';
  $('theme-intensity').value = String(Math.round(t0.intensity * 100));
  $('theme-grain').value = String(Math.round(t0.grain * 100));
  drawGrid();
  drawSwatches();
  drawTheme();
}

// Position du pointeur dans le champ -> teinte et saturation.
function wheelAt(e) {
  const r = wheel.getBoundingClientRect();
  const x = e.clientX - r.left - r.width / 2;
  const y = e.clientY - r.top - r.height / 2;
  return { h: ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360, s: Math.min(1, Math.hypot(x, y) / (r.width / 2)) * SMAX };
}
wheel.addEventListener('pointerdown', (e) => {
  if (!theme || e.button !== 0) return;
  e.preventDefault();
  const hit = e.target.closest('.dot');
  if (hit) theme.sel = Number(hit.dataset.i);
  else if (!theme.dots.length) { theme.dots.push({ ...wheelAt(e), v: V_FIELD }); theme.sel = 0; } // thème par défaut : un clic pose la première couleur
  const dot = theme.dots[theme.sel];
  const move = (ev) => {
    Object.assign(dot, wheelAt(ev));
    // Hors du centre, une couleur éteinte (gris foncé d'une pastille) retrouve de l'éclat.
    if (dot.s > 0.15 && dot.v < 0.55) dot.v = V_FIELD;
    drawTheme();
    pushColors();
  };
  wheel.setPointerCapture(e.pointerId);
  if (!hit) move(e);
  else drawTheme();
  const up = () => {
    wheel.removeEventListener('pointermove', move);
    wheel.removeEventListener('pointerup', up);
    wheel.removeEventListener('pointercancel', up);
  };
  wheel.addEventListener('pointermove', move);
  wheel.addEventListener('pointerup', up);
  wheel.addEventListener('pointercancel', up);
});
// Au clavier : les flèches déplacent la poignée qui a le focus.
wheel.addEventListener('keydown', (e) => {
  const hit = e.target.closest('.dot');
  const step = { ArrowLeft: [-6, 0], ArrowRight: [6, 0], ArrowUp: [0, 0.04], ArrowDown: [0, -0.04] }[e.key];
  if (!hit || !step) return;
  e.preventDefault();
  theme.sel = Number(hit.dataset.i);
  const dot = theme.dots[theme.sel];
  dot.h = (dot.h + step[0] + 360) % 360;
  dot.s = Math.max(0, Math.min(SMAX, dot.s + step[1]));
  drawTheme();
  pushColors();
});
$('theme-more').onclick = () => {
  if (theme.dots.length >= OrbeTheme.MAX_COLORS) return;
  const last = theme.dots[theme.dots.length - 1];
  // La nouvelle couleur part de la voisine, un peu plus loin sur le cercle.
  theme.dots.push(last ? { h: (last.h + 48) % 360, s: Math.max(0.36, last.s), v: Math.max(0.55, last.v) } : OrbeTheme.hexToHsv(OrbeTheme.FIRST[0]));
  theme.sel = theme.dots.length - 1;
  drawTheme();
  pushColors();
};
$('theme-less').onclick = () => {
  if (!theme.dots.length) return;
  theme.dots.splice(theme.sel, 1);
  theme.sel = Math.max(0, Math.min(theme.sel, theme.dots.length - 1));
  drawTheme();
  pushColors(); // plus aucune couleur : thème par défaut
};
$('theme-presets').addEventListener('click', (e) => {
  const b = e.target.closest('.swatch');
  if (!b) return;
  const colors = OrbeTheme.SWATCHES[theme.page][b.dataset.i];
  theme.dots = colors.map(OrbeTheme.hexToHsv);
  theme.sel = 0;
  drawTheme();
  // Les teintes exactes de la pastille, sans passer par le champ.
  pushTheme({ colors });
});
function turnPage(d) {
  theme.page = Math.max(0, Math.min(OrbeTheme.SWATCHES.length - 1, theme.page + d));
  drawSwatches();
  drawTheme();
}
$('theme-prev').onclick = () => turnPage(-1);
$('theme-next').onclick = () => turnPage(1);
$('theme-intensity').addEventListener('input', (e) => { theme.intensity = Number(e.target.value) / 100; pushTheme({ intensity: theme.intensity }); });
$('theme-grain').addEventListener('input', (e) => { theme.grain = Number(e.target.value) / 100; drawTheme(); pushTheme({ grain: theme.grain }); });
// Arc's "Cycle noise texture": a click on the dial (or Enter / Space on it) moves to the next texture.
function cycleTexture() {
  const all = OrbeTheme.TEXTURES;
  theme.texture = all[(all.indexOf(theme.texture) + 1) % all.length];
  drawTheme();
  pushTheme({ texture: theme.texture });
}
$('theme-grain').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  cycleTexture();
});
// Molette : on la tourne en tirant autour de son centre, de −135° (sans grain) à +135°.
$('theme-dial').addEventListener('pointerdown', (e) => {
  if (!theme || e.button !== 0) return;
  e.preventDefault();
  const dial = e.currentTarget;
  const input = $('theme-grain');
  input.focus();
  let turned = false;
  const turn = (ev) => {
    // Under 3 px of travel the gesture is still a click (texture), not a turn.
    if (!turned && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 3) return;
    turned = true;
    const r = dial.getBoundingClientRect();
    const a = (Math.atan2(ev.clientX - r.left - r.width / 2, r.top + r.height / 2 - ev.clientY) * 180) / Math.PI;
    const v = String(Math.round(Math.max(0, Math.min(1, (a + 135) / 270)) * 100));
    if (v === input.value) return;
    // A tap on every tenth, and a firmer one at either end, like Arc's dial.
    if (v === '0' || v === '100') send('haptic', 'level');
    else if (Math.floor(v / 10) !== Math.floor(input.value / 10)) send('haptic', 'align');
    input.value = v;
    input.dispatchEvent(new Event('input'));
  };
  dial.setPointerCapture(e.pointerId);
  dial.onpointermove = turn;
  dial.onpointerup = () => { dial.onpointermove = null; if (!turned) cycleTexture(); };
  dial.onpointercancel = () => { dial.onpointermove = null; };
});
$('theme-modes').addEventListener('click', (e) => {
  const b = e.target.closest('.mode');
  if (!b) return;
  theme.mode = b.dataset.mode;
  drawTheme();
  pushTheme({ mode: theme.mode });
});

// Les vues flottantes prennent les couleurs de l'Espace : accent, panneaux et
// messages légèrement teintés, apparence claire ou sombre de l'Espace.
function applyLook(look) {
  if (!look || !look.space) return;
  const p = OrbeTheme.palette(look.space, look.dark);
  const root = document.documentElement;
  root.dataset.scheme = p.dark ? 'dark' : 'light';
  root.style.setProperty('--accent', p.accent);
  root.style.setProperty('--on-accent', p.onAccent);
  root.style.setProperty('--panel-tint', look.space.plain ? '0%' : '9%');
}
O.on('theme', applyLook);
send('themeGet').then(applyLook).catch(() => {});

// --- Balayage de page : la pastille suit les doigts ----------------------------
// `p` : avancée du geste (0 à 1, le seuil) ; `release` : geste abandonné, la
// pastille rentre ; `go` : seuil franchi, elle s'allume et s'efface.
const SWIPE = { hidden: -60, shown: 14 };
function drawSwipe(msg) {
  const box = $('swipe');
  const pill = $('swipe-pill');
  if (mode !== 'swipe') show('swipe');
  const side = msg.dir === 'forward' ? -1 : 1; // la pastille de droite avance vers la gauche
  box.classList.toggle('forward', msg.dir === 'forward');
  box.classList.toggle('release', !!msg.release);
  box.classList.toggle('go', !!msg.go);
  const p = Math.max(0, Math.min(1, Number(msg.p) || 0));
  // Elle sort vite, puis ralentit en approchant du seuil.
  const eased = 1 - (1 - p) ** 2;
  const x = side * (SWIPE.hidden + (SWIPE.shown - SWIPE.hidden) * eased);
  if (msg.go) {
    pill.style.transform = `translateX(${side * (SWIPE.shown + 10)}px) scale(1.12)`;
    pill.style.opacity = '0';
  } else {
    pill.style.transform = `translateX(${x.toFixed(1)}px) scale(${(0.6 + 0.4 * eased).toFixed(3)})`;
    pill.style.opacity = msg.release ? '0' : String(Math.min(1, p * 2.2).toFixed(3));
  }
  box._p = p;
}

// --- Sélecteur d'icône --------------------------------------------------------
// Un émoji pour un Espace, un dossier ou un onglet (emojis.js). Recherche par
// mots-clés, teinte de peau retenue, flèches et Entrée au clavier ; le choix
// part au processus principal, qui le vérifie.
const iconsInput = $('icons-input');
const iconsList = $('icons-list');
let iconsState = null; // { kind, current, tone, at }
const iconButtons = () => [...iconsList.querySelectorAll('.em-pick')];

function drawIcons() {
  const q = iconsInput.value.trim();
  const found = emojiSearch(q);
  iconsList.textContent = '';
  let grid = null;
  let group = null;
  for (const x of found) {
    // Sans recherche : une rubrique par titre ; avec : une seule grille.
    if (!grid || (!q && x.group !== group)) {
      group = x.group;
      if (!q) iconsList.appendChild(Object.assign(document.createElement('h4'), { textContent: t('icons.group.' + x.group) }));
      grid = Object.assign(document.createElement('div'), { className: 'icons-grid' });
      iconsList.appendChild(grid);
    }
    const e = emojiTone(x.e, iconsState.tone);
    const b = Object.assign(document.createElement('button'), { className: 'em-pick' + (e === iconsState.current ? ' sel' : ''), textContent: e });
    b.dataset.e = e;
    grid.appendChild(b);
  }
  if (!found.length) iconsList.appendChild(Object.assign(document.createElement('div'), { id: 'icons-empty', textContent: t('icons.none') }));
  iconsState.at = -1;
  for (const b of $('icons-tones').children) b.classList.toggle('sel', Number(b.dataset.tone) === iconsState.tone);
}

function iconsMove(delta) {
  const all = iconButtons();
  if (!all.length) return;
  const at = Math.max(0, Math.min(all.length - 1, iconsState.at < 0 ? 0 : iconsState.at + delta));
  if (all[iconsState.at]) all[iconsState.at].classList.remove('at');
  iconsState.at = at;
  all[at].classList.add('at');
  all[at].scrollIntoView({ block: 'nearest' });
}

function openIcons(p) {
  if (p.kind !== 'draft') show('icons');
  iconsState = { kind: p.kind, current: p.current || '', tone: p.tone || 0, at: -1 };
  $('icons').style.left = (p.x || 260) + 'px';
  $('icons-tones').textContent = '';
  EMOJI_TONES.forEach((m, i) => {
    const b = Object.assign(document.createElement('button'), { className: 'tone', textContent: '✋' + m, title: t('icons.tone') });
    b.dataset.tone = i;
    $('icons-tones').appendChild(b);
  });
  // Un Espace garde toujours une icône ; un dossier ou un onglet peut reprendre la sienne.
  $('icons-reset').hidden = p.kind === 'space' || p.kind === 'draft' || !p.current;
  iconsInput.value = '';
  drawIcons();
  iconsList.scrollTop = 0;
  iconsInput.focus();
}

iconsInput.addEventListener('input', drawIcons);
iconsInput.addEventListener('keydown', (e) => {
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 9, ArrowUp: -9 }[e.key];
  if (step && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || iconsState.at >= 0)) { e.preventDefault(); iconsMove(step); }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const all = iconButtons();
  const b = all[iconsState.at] || (iconsInput.value.trim() ? all[0] : null);
  if (b) pickIcon(b.dataset.e);
});
iconsList.addEventListener('click', (e) => {
  const b = e.target.closest('.em-pick');
  if (b) pickIcon(b.dataset.e);
});
// Les boutons ne prennent pas le clavier : on continue de taper dans le champ.
for (const id of ['icons-list', 'icons-tones', 'icons-reset']) $(id).addEventListener('mousedown', (e) => e.preventDefault());
$('icons-tones').addEventListener('click', (e) => {
  const b = e.target.closest('.tone');
  if (!b) return;
  iconsState.tone = Number(b.dataset.tone);
  const top = iconsList.scrollTop;
  drawIcons();
  iconsList.scrollTop = top;
});
$('icons-reset').onclick = () => send('icon', { emoji: '', tone: iconsState.tone });

// Émoji choisi : pour un Espace en cours de création, il reste dans le panneau (rien n'est
// encore créé) ; sinon il part au processus principal.
function pickIcon(emoji) {
  if (iconsState.kind !== 'draft') return send('icon', { emoji, tone: iconsState.tone });
  draft.icon = emoji;
  draft.tone = iconsState.tone;
  closeDraftIcons();
  return drawSpace();
}

// --- Création d'un Espace -----------------------------------------------------
// Nom, icône, couleur (ou thème prêt), profil. Le brouillon reste ici : seul « Créer »
// (ou Entrée) l'envoie, et le processus principal le vérifie avant de créer l'Espace.
const SPACE_W = 316;
const spaceInput = $('space-input');
let draft = null; // { icon, tone, color, preset, profileId, x }
const draftIconsOpen = () => mode === 'space' && !$('icons').hidden;

function closeDraftIcons() {
  $('icons').hidden = true;
  $('icons').classList.remove('beside');
  spaceInput.focus();
}

function drawSpace() {
  $('space-icon').textContent = draft.icon;
  for (const b of $('space-colors').children) { const on = !draft.preset && b.dataset.c === draft.color; b.classList.toggle('sel', on); b.setAttribute('aria-checked', String(on)); }
  for (const b of $('space-presets').children) { const on = b.dataset.preset === draft.preset; b.classList.toggle('sel', on); b.setAttribute('aria-checked', String(on)); }
  for (const b of $('space-profiles').children) { const on = b.dataset.profile === draft.profileId; b.classList.toggle('sel', on); b.setAttribute('aria-checked', String(on)); }
  // Le panneau prend la couleur choisie : c'est l'aperçu.
  const preset = OrbeTheme.PRESETS.find((x) => x.id === draft.preset);
  const look = OrbeTheme.palette({ color: preset ? preset.colors[0] : draft.color }, document.documentElement.dataset.scheme === 'dark');
  document.documentElement.style.setProperty('--accent', look.accent);
  document.documentElement.style.setProperty('--on-accent', look.onAccent);
}

function openSpace(p) {
  show('space');
  const colors = (p.colors || []).filter(OrbeTheme.isHex);
  draft = { icon: p.icon || '✨', tone: p.tone || 0, color: OrbeTheme.isHex(p.color) ? p.color : colors[0] || OrbeTheme.DEFAULT_COLOR, preset: '', profileId: String(p.profileId || 'default'), x: p.x || 260 };
  $('space').style.left = draft.x + 'px';
  $('icons').hidden = true;
  const colorsBox = $('space-colors');
  colorsBox.textContent = '';
  for (const c of colors) {
    const b = Object.assign(document.createElement('button'), { className: 'sw-color' });
    b.dataset.c = c;
    b.style.background = c;
    b.setAttribute('role', 'radio');
    colorsBox.appendChild(b);
  }
  const presetsBox = $('space-presets');
  presetsBox.textContent = '';
  for (const x of OrbeTheme.PRESETS) {
    const look = OrbeTheme.palette({ colors: x.colors, accent: x.colors[0], intensity: 1, grain: 0, texture: x.texture, mode: 'light' }, false);
    const b = Object.assign(document.createElement('button'), { className: 'preset', title: t('theme.preset.' + x.id) });
    b.dataset.preset = x.id;
    b.style.background = OrbeTheme.paint(look);
    b.setAttribute('role', 'radio');
    presetsBox.appendChild(b);
  }
  // Les noms de profil viennent de l'utilisateur : posés comme du texte.
  const profilesBox = $('space-profiles');
  profilesBox.textContent = '';
  for (const pr of [...(p.profiles || []), { id: 'new', name: t('space.newProfile') }]) {
    const b = Object.assign(document.createElement('button'), { className: 'space-profile', textContent: String(pr.name) });
    b.dataset.profile = String(pr.id);
    b.setAttribute('role', 'radio');
    profilesBox.appendChild(b);
  }
  spaceInput.value = '';
  drawSpace();
  // L'animation d'entrée rejoue à chaque ouverture.
  const el = $('space');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  spaceInput.focus();
}

function submitSpace(theme) {
  if (!draft) return;
  const a = { name: spaceInput.value, icon: draft.icon, tone: draft.tone, profileId: draft.profileId, theme: !!theme };
  if (draft.preset) a.preset = draft.preset; else a.color = draft.color;
  send('spaceCreate', a);
}

$('space-icon').onclick = () => {
  if (draftIconsOpen()) return closeDraftIcons();
  // À droite du panneau si la place y est, sinon par-dessus.
  const beside = draft.x + SPACE_W + 8;
  openIcons({ kind: 'draft', current: draft.icon, tone: draft.tone, x: beside + SPACE_W + 8 <= window.innerWidth ? beside : draft.x });
  $('icons').classList.add('beside');
  $('icons').hidden = false;
  iconsInput.focus();
  return undefined;
};
$('space-colors').addEventListener('click', (e) => {
  const b = e.target.closest('.sw-color');
  if (!b) return;
  draft.color = b.dataset.c;
  draft.preset = '';
  drawSpace();
});
$('space-presets').addEventListener('click', (e) => {
  const b = e.target.closest('.preset');
  if (!b) return;
  draft.preset = b.dataset.preset;
  drawSpace();
});
$('space-profiles').addEventListener('click', (e) => {
  const b = e.target.closest('.space-profile');
  if (!b) return;
  draft.profileId = b.dataset.profile;
  drawSpace();
});
// Pastilles et profils ne prennent pas le clavier : on continue de taper le nom.
for (const id of ['space-colors', 'space-presets', 'space-profiles']) $(id).addEventListener('mousedown', (e) => e.preventDefault());
$('space-theme').onclick = () => submitSpace(true);
$('space-create').onclick = () => submitSpace(false);
$('space-cancel').onclick = () => send('closeOverlay');
spaceInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  submitSpace(false);
});

// --- Recherche dans la page -------------------------------------------------
const findInput = $('find-input');
findInput.addEventListener('input', () => send('find', { text: findInput.value }));
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); send('find', { text: findInput.value, forward: !e.shiftKey, next: true }); }
});
// Les boutons ne prennent pas le clavier : on continue de taper dans le champ.
for (const id of ['find-next', 'find-prev', 'find-one', 'find-all']) $(id).addEventListener('mousedown', (e) => e.preventDefault());
// Remplacer : l'occurrence désignée (Entrée dans « Remplacer par », ou le bouton), ou toutes.
const findWith = $('find-with');
const replaceFound = (all) => { if (findInput.value) send('findReplace', { text: findInput.value, with: findWith.value, all }); };
findWith.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); replaceFound(false); }
  // ⇥ et ⇧⇥ passent d'un champ à l'autre, sans s'arrêter sur les boutons.
  if (e.key === 'Tab') { e.preventDefault(); findInput.focus(); findInput.select(); }
});
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !$('find-replace').hidden) { e.preventDefault(); findWith.focus(); findWith.select(); }
});
$('find-one').onclick = () => replaceFound(false);
$('find-all').onclick = () => replaceFound(true);
$('find-next').onclick = () => send('find', { text: findInput.value, forward: true, next: true });
$('find-prev').onclick = () => send('find', { text: findInput.value, forward: false, next: true });
$('find-close').onclick = () => send('findClose');
O.on('find-result', (r) => {
  $('find-count').textContent = findInput.value ? (r.matches ? `${r.current}/${r.matches}` : t('find.none')) : '';
});

// --- Messages ---------------------------------------------------------------
O.on('overlay', (p) => {
  if (p.mode === 'command') openCommand(p);
  else if (p.mode === 'switcher') openSwitcher(p);
  else if (p.mode === 'theme') openTheme(p);
  else if (p.mode === 'icons') openIcons(p);
  else if (p.mode === 'space') openSpace(p);
  else if (p.mode === 'command-value') {
    // Barre de commande déjà ouverte : une autre adresse à modifier (adresse d'un épinglé).
    if (mode === 'command' && typeof p.value === 'string') { input.value = p.value; input.select(); input.dispatchEvent(new Event('input')); fieldIcon(true); }
  }
  else if (p.mode === 'find') {
    show('find');
    $('find').classList.toggle('replace', !!p.replace);
    $('find-replace').hidden = !p.replace;
    $('find-count').textContent = '';
    // « Utiliser la sélection pour rechercher » : le texte vient de la page.
    if (typeof p.text === 'string') findInput.value = p.text;
    findInput.focus();
    findInput.select();
    if (findInput.value) send('find', { text: findInput.value });
  } else if (p.mode === 'peek-url') {
    // Adresse de l'aperçu (barre d'outils affichée) : au-dessus de la carte.
    // Domaine en avant ; trop longue, elle s'efface par la gauche du nom d'hôte, jamais par sa fin.
    addressInto($('peek-url'), p.text || '');
    $('peek-url').hidden = !p.text;
  } else if (p.mode === 'peek-pull') {
    // Carte tirée par un balayage : le voile s'éclaircit avec elle (opacité seule) ;
    // relâchée (`ms`), il revient en même temps qu'elle.
    const v = Math.max(0, Math.min(1, Number(p.p) || 0));
    const b = document.body;
    b.style.setProperty('--pull-ms', (Number(p.ms) || 0) + 'ms');
    b.style.setProperty('--pull-o', String(1 - 0.6 * v));
    b.classList.add('peek-pull');
  } else if (p.mode === 'peek') {
    // Ouverture : le voile et les boutons paraissent en fondu ; `leaving` : ils s'effacent
    // pendant que la carte se réduit ou s'étend (durée donnée par le processus principal).
    show('peek');
    document.body.style.setProperty('--peek-ms', (p.ms || 0) + 'ms');
    document.body.classList.remove('peek', 'peek-out');
    if (!p.leaving) document.body.classList.remove('peek-pull'); // fermeture après un tirage : le fondu part de l'opacité atteinte
    void document.body.offsetWidth;
    document.body.classList.add(p.leaving ? 'peek-out' : 'peek');
  } else if (p.mode === 'drop') {
    show('drop');
    const label = $('drop-label');
    const box = $('drop');
    // L'onglet glissé devient une bulle au milieu du côté visé (icône et titre, posés comme
    // du texte) ; sans onglet connu, le libellé « Ajouter à la vue scindée ».
    const key = p.tab ? JSON.stringify(p.tab) : '';
    if (label._key !== key || (!p.tab && label.textContent !== p.label)) {
      label._key = key;
      label.textContent = '';
      if (p.tab) {
        const bubble = document.createElement('span');
        bubble.className = 'drop-bubble';
        const ic = document.createElement('span');
        ic.className = 'drop-ic';
        ic.appendChild(p.tab.icon ? emojiEl(p.tab.icon) : faviconEl(p.tab.favicon, p.tab.title));
        const name = document.createElement('span');
        name.className = 'drop-name';
        name.textContent = p.tab.title;
        bubble.append(ic, name);
        label.appendChild(bubble);
        label.title = p.label;
      } else label.textContent = p.label;
    }
    box.classList.toggle('over', !!p.over);
    // Côté visé (moitié d'un volet), donné par le processus principal ; sinon la moitié droite.
    const z = p.zone;
    label.style.cssText = z ? `position:absolute;margin:0;left:${z.x + 6}px;top:${z.y + 6}px;width:${Math.max(40, z.w - 12)}px;height:${Math.max(40, z.h - 12)}px` : '';
    // Lâché : la bulle rebondit une fois (transformation et opacité), la zone s'efface.
    box.classList.remove('done');
    if (p.done) { void box.offsetWidth; box.classList.add('done'); }
  } else if (p.mode === 'swipe') {
    drawSwipe(p);
  } else if (p.mode === 'status') {
    show('status');
    $('status').textContent = p.text;
  } else if (p.mode === 'toast') {
    show('toast');
    const el = $('toast');
    el.textContent = p.text;
    // Action nommée (« Annuler ») : montrée comme un bouton, à la suite du message.
    if (p.action && p.label) {
      const act = document.createElement('span');
      act.className = 'act';
      act.textContent = p.label;
      el.appendChild(act);
    }
    el.style.setProperty('--stay', (Math.max(600, Number(p.stay) || 2100) - 200) + 'ms');
    el.style.cursor = p.action ? 'pointer' : '';
    el.classList.remove('in');
    void el.offsetWidth;
    el.classList.add('in');
  } else {
    // Panneau de création refermé : la vue reprend les couleurs de l'Espace affiché.
    if (draft) { draft = null; send('themeGet').then(applyLook).catch(() => {}); }
    show(null);
  }
});
O.on('settings', (s) => setLang(s.lang));

// Zone de dépôt : un onglet de la barre latérale lâché ici crée une vue scindée.
const dropBox = $('drop');
dropBox.addEventListener('dragover', (e) => {
  if (![...e.dataTransfer.types].includes('application/x-orbe-item')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  dropBox.classList.add('over');
});
dropBox.addEventListener('dragleave', () => dropBox.classList.remove('over'));
dropBox.addEventListener('drop', (e) => {
  e.preventDefault();
  dropBox.classList.remove('over');
  const id = e.dataTransfer.getData('application/x-orbe-item');
  if (id) send('dropSplit', id);
});

// Clic sur un message : son action (aller à l'onglet…), ou simple disparition.
$('toast').onclick = () => send('toastClick');
$('peek-close').onclick = () => send('peekClose');
$('peek-expand').onclick = () => send('peekExpand');
$('peek-split').onclick = () => send('peekSplit');

$('backdrop').addEventListener('mousedown', (e) => {
  // Barre de commande : le point du clic part avec la fermeture (la barre latérale reste cliquable).
  if (mode === 'command') send('closeOverlay', { x: e.clientX, y: e.clientY });
  else if (draftIconsOpen()) closeDraftIcons();
  else if (mode === 'theme' || mode === 'icons' || mode === 'space') send('closeOverlay');
  else if (mode === 'peek') send('peekClose');
});
// Bascule d'onglets : Tab ne déplace pas le focus, relâcher ⌃ valide.
document.addEventListener('keyup', (e) => {
  if (mode === 'switcher' && e.key === 'Control') send('switcherCommit');
});
document.addEventListener('keydown', (e) => {
  if (mode === 'switcher' && e.key === 'Tab') e.preventDefault();
  if (e.key !== 'Escape') return;
  if (draftIconsOpen()) { e.preventDefault(); closeDraftIcons(); return; }
  if (mode === 'find') send('findClose');
  else if (mode === 'peek') send('peekClose');
  else if (mode) send('closeOverlay');
});
