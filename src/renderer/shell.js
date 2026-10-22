// Barre latérale d'Orbe. Reçoit l'état complet de la fenêtre et ne modifie que
// les éléments qui ont changé, pour rester fluide avec beaucoup d'onglets.
const $ = (id) => document.getElementById(id);
const send = O.send;
let S = null; // dernier état reçu
let editing = null; // id en cours de renommage
let drag = null;
let animate = false;
let present = new Set();
let flashId = null; // ligne mise en évidence par « Afficher l'onglet dans la barre latérale »
let flashTimer = null;
// Sélection multiple (⌘clic, ⇧clic) : identifiants d'onglets ; `anchor` est le
// point de départ d'une plage ⇧clic.
const sel = new Set();
let anchor = null;
let selRev = 0;
const FLOATING = location.hash === '#flottant';
if (FLOATING) document.documentElement.classList.add('floating');

const icon = (name, cls = 'i') => `<svg class="${cls}"><use href="#i-${name}"/></svg>`;
const emojiEl = (text) => Object.assign(document.createElement('span'), { className: 'emoji', textContent: text });

// --- Rendu ------------------------------------------------------------------
function setIcon(el, it) {
  // Navigation privée : aucune icône n'est téléchargée par l'interface.
  const src = S && S.incognito ? '' : (it.favicon || guessIcon(it.url));
  // Icône choisie par l'utilisateur (un émoji) : elle remplace celle du site.
  const key = it.loading ? 'L' : (it.icon ? 'E' + it.icon : (src || '#' + it.title.charAt(0)));
  if (el._icon === key) return;
  el._icon = key;
  const slot = el._ic;
  slot.textContent = '';
  if (it.icon && !it.loading) {
    slot.appendChild(emojiEl(it.icon));
  } else if (it.loading) {
    const sp = document.createElement('span');
    sp.className = 'spinner';
    slot.appendChild(sp);
  } else {
    slot.appendChild(faviconEl(src, it.title));
  }
}

function tabRow(el, it) {
  if (!el._built) {
    el._built = true;
    el.innerHTML = `<span class="ic" data-act="icon"></span><span class="more"></span><span class="slash">/</span><span class="title"></span>`
      + `<button class="act reset" data-act="reset">${icon('reset')}</button>`
      + `<button class="act cap" data-act="capture">${icon('screen')}</button>`
      + `<button class="act snd" data-act="mute">${icon('sound')}</button>`
      + `<button class="act x" data-act="close">${icon('x')}</button>`;
    el._ic = el.firstChild;
    el._title = el.children[3];
    el._more = el.children[1];
    el._snd = el.querySelector('.snd use');
    el._cap = el.querySelector('.cap use');
    el.draggable = true;
  }
  el.className = 'row tab' + (it.active ? ' active' : '') + (it.shown ? ' shown' : '') + (it.live ? ' live' : '')
    + (it.audible ? ' audible' : '') + (it.muted ? ' muted' : '') + (it.changed ? ' changed' : '') + (it.partners ? ' split' : '') + (it.grouped ? ' grouped' : '')
    + (it.capture && it.capture.length ? ' capturing' : '') + (it.capture && it.capture.includes('screen') ? ' sharing' : '')
    + (sel.has(it.id) ? ' sel' : '') + (flashId === it.id ? ' flash' : '');
  // Témoin de capture : écran, caméra ou micro (le premier de la liste).
  const cap = (it.capture && it.capture[0]) || '';
  if (el._c !== cap) { el._c = cap; if (cap) { el._cap.setAttribute('href', '#i-' + cap); el._cap.closest('button').title = it.capture.map((k) => t('capture.' + k)).join(' · '); } }
  // Vue scindée : une seule ligne, avec les icônes et les titres de chaque volet.
  const label = it.partners ? [it.title, ...it.partners.map((p) => p.title)].join('  |  ') : it.title;
  if (editing !== it.id && el._t !== label) {
    el._t = label;
    el._title.textContent = label;
    el.title = label;
  }
  const moreKey = it.partners ? it.partners.map((p) => p.id + p.favicon + (p.icon || '')).join(',') : '';
  if (el._mk !== moreKey) {
    el._mk = moreKey;
    el._more.textContent = '';
    for (const p of it.partners || []) el._more.appendChild(p.icon ? emojiEl(p.icon) : faviconEl(S && S.incognito ? '' : (p.favicon || guessIcon(p.url)), p.title));
  }
  if (el._m !== it.muted) { el._m = it.muted; el._snd.setAttribute('href', it.muted ? '#i-mute' : '#i-sound'); }
  setIcon(el, it);
  keepRow(el, it);
}

// --- Lignes inchangées : on n'y repasse pas (PERF-26) --------------------------
// Chaque état reçu décrit toutes les lignes, alors que presque aucune ne change.
// Une ligne garde la description qui l'a dessinée ; si la nouvelle est la même, et
// que rien d'autre n'a touché la ligne depuis (classes posées par un geste, une
// animation, la sélection), elle est laissée telle quelle. Comparaison champ par
// champ, sans rien allouer : à 1 000 onglets, c'est ce passage qui coûtait.
const ROW_FIELDS = ['title', 'url', 'favicon', 'icon', 'loading', 'audible', 'muted', 'live', 'changed', 'grouped', 'active', 'shown', 'split', 'noBadge'];
const rowStats = { drawn: 0, kept: 0 };
function keepRow(el, it) {
  el._vm = it;
  el._cls = el.className;
  el._sel = sel.has(it.id);
  el._flash = flashId === it.id;
  el._edit = editing === it.id;
  el._inc = !!(S && S.incognito);
  rowStats.drawn += 1;
}
function sameList(a, b, same) {
  const n = a ? a.length : 0;
  if (n !== (b ? b.length : 0)) return false;
  for (let i = 0; i < n; i++) if (!same(a[i], b[i])) return false;
  return true;
}
const samePartner = (a, b) => a.id === b.id && a.title === b.title && a.favicon === b.favicon && a.icon === b.icon && a.url === b.url;
const sameValue = (a, b) => a === b;
function rowKept(el, it) {
  const was = el._vm;
  if (!was) return false;
  for (let i = 0; i < ROW_FIELDS.length; i++) if (was[ROW_FIELDS[i]] !== it[ROW_FIELDS[i]]) return false;
  if (!sameList(was.capture, it.capture, sameValue) || !!was.partners !== !!it.partners || !sameList(was.partners, it.partners, samePartner)) return false;
  if (el._sel !== sel.has(it.id) || el._flash !== (flashId === it.id) || el._edit !== (editing === it.id) || el._inc !== !!(S && S.incognito)) return false;
  // Une classe ajoutée ou retirée hors du rendu (glisser, apparition, pression) : la ligne est redessinée, comme avant.
  if (el.className !== el._cls) return false;
  rowStats.kept += 1;
  return true;
}

function folderRow(el, it) {
  if (!el._built) {
    el._built = true;
    el.innerHTML = `<div class="row" draggable="true"><span class="ic">${icon('folder')}</span><span class="title"></span>${icon('chevron', 'i chev')}</div><div class="children" data-drop="folder:${it.id}"></div>`;
    el._title = el.querySelector('.title');
    el._children = el.lastChild;
    el._head = el.firstChild;
    el._head.dataset.id = it.id;
    el._head.dataset.folder = '1';
  }
  el.className = 'folder' + (it.open ? ' open' : '');
  if (editing !== it.id && el._t !== it.name) { el._t = it.name; el._title.textContent = it.name; }
  // Icône du dossier : l'émoji choisi, sinon le dessin du dossier.
  if ((el._fi || '') !== (it.icon || '')) {
    el._fi = it.icon || '';
    const slot = el._head.firstChild;
    if (it.icon) { slot.textContent = ''; slot.appendChild(emojiEl(it.icon)); } else slot.innerHTML = icon('folder');
  }
  reconcile(el._children, it.children);
}

function tileEl(el, it) {
  if (!el._built) {
    el._built = true;
    el.innerHTML = `<span class="ic"></span><span class="dot"><i></i><i></i><i></i></span>`;
    el._ic = el.firstChild;
    el.draggable = true;
  }
  el.className = 'tile' + (it.active ? ' active' : '') + (it.live ? ' live' : '') + (it.audible ? ' audible' : '') + (sel.has(it.id) ? ' sel' : '') + (flashId === it.id ? ' flash' : '');
  el.title = it.title;
  // Pastille de notification : le nombre que le site annonce en tête de son titre (« (3) Boîte de
  // réception »), tant que sa page est vivante — un titre resté d'une session passée ne dit rien.
  const n = it.live && !it.noBadge ? (/^\((\d{1,4})\+?\)/.exec(it.title) || [])[1] || '' : '';
  if ((el._n || '') !== n) {
    el._n = n;
    if (!el._badge) { el._badge = Object.assign(document.createElement('span'), { className: 'count' }); el.appendChild(el._badge); }
    el._badge.textContent = n.length > 2 ? '99+' : n;
    el._badge.hidden = !n;
  }
  setIcon(el, it);
  keepRow(el, it);
}

// Met à jour une liste en réutilisant les éléments existants (clé = id).
function reconcile(container, items, tile) {
  // Cas de loin le plus courant : mêmes lignes, même ordre. Rien à ranger ni à
  // retirer ; chaque ligne est seulement comparée à sa nouvelle description.
  if (container.childElementCount === items.length) {
    let el = container.firstElementChild;
    let i = 0;
    for (; el && el._key === items[i].id; el = el.nextElementSibling) i += 1;
    if (i === items.length) {
      el = container.firstElementChild;
      for (i = 0; el; el = el.nextElementSibling, i++) {
        const it = items[i];
        if (it.type === 'folder') folderRow(el, it);
        else if (rowKept(el, it)) el._vm = it;
        else if (tile) tileEl(el, it);
        else tabRow(el, it);
      }
      return;
    }
  }
  const old = new Map();
  for (const el of container.children) old.set(el.dataset.key, el);
  let prev = null;
  let fresh = null;
  for (const it of items) {
    const key = it.id;
    let el = old.get(key);
    if (el) old.delete(key);
    else {
      el = document.createElement('div');
      el.dataset.key = key;
      el._key = key;
      if (it.type !== 'folder') el.dataset.id = it.id;
      fresh = animate ? el : null;
    }
    if (it.type === 'folder') folderRow(el, it);
    else if (rowKept(el, it)) el._vm = it; // rien à refaire
    else if (tile) tileEl(el, it);
    else tabRow(el, it);
    if (fresh === el) { el.classList.add('in'); fresh = null; }
    const ref = prev ? prev.nextSibling : container.firstChild;
    if (el !== ref) container.insertBefore(el, ref);
    prev = el;
  }
  // Disparition : la ligne s'efface sur place pendant que les suivantes remontent (voir `flip`).
  for (const el of old.values()) {
    // Une ligne seulement déplacée (encore présente ailleurs) part sans délai.
    if (!flip || !el.dataset.key || tile || present.has(el.dataset.key)) { el.remove(); continue; }
    el.dataset.key = '';
    el._key = '';
    el.removeAttribute('data-id');
    flip.gone.push(el);
  }
}

// --- Lignes qui glissent ----------------------------------------------------
// Quand la liste change (onglet ouvert ou fermé, dossier ouvert ou replié,
// « Effacer »), les lignes ne sautent pas à leur nouvelle place : elles y
// glissent. Technique « FLIP » : on relève la position des lignes avant le
// changement (une lecture), on laisse la mise en page se faire d'un coup, on
// relève les nouvelles positions (une lecture), puis chaque ligne déplacée part
// de son ancienne place par une transformation animée par le compositeur. Il
// n'y a donc qu'une mise en page par changement, jamais une par image ; la ligne
// retirée, elle, s'efface sur place, sortie du flux.
let flip = null; // relevé en cours, pendant un rendu
const SPRING = (() => {
  const m = /^\s*([\d.]+)ms\s+(.+)$/.exec(getComputedStyle(document.documentElement).getPropertyValue('--spring-snappy'));
  return m ? { duration: Number(m[1]), easing: m[2].trim() } : { duration: 240, easing: 'ease-out' };
})();
const FLIP = { id: 'flip', out: 150, cascade: 22, cascadeMax: 10, margin: 240 };
const flipRows = () => scroller.querySelectorAll('.row, #divider');

function flipFirst() {
  const tops = new Map();
  for (const el of flipRows()) {
    const r = el.getBoundingClientRect();
    if (r.height) tops.set(el, r.top);
  }
  const boxes = new Map();
  for (const el of scroller.querySelectorAll('.list > [data-key], .children > [data-key]')) boxes.set(el, el.getBoundingClientRect());
  for (const el of scroller.querySelectorAll('.list, .children')) boxes.set(el, el.getBoundingClientRect());
  return { tops, boxes, gone: [] };
}

function flipPlay(f) {
  // Les lignes retirées quittent le flux et s'effacent là où elles étaient ; plusieurs
  // à la fois (« Effacer ») : en cascade.
  f.gone.forEach((el, i) => {
    const box = f.boxes.get(el);
    const home = f.boxes.get(el.parentElement);
    if (!box || !home || !box.height) { el.remove(); return; }
    const delay = Math.min(i, FLIP.cascadeMax) * FLIP.cascade;
    el.style.cssText += `;position:absolute;left:${box.left - home.left}px;top:${box.top - home.top}px;width:${box.width}px;animation-delay:${delay}ms`;
    el.classList.add('out');
    setTimeout(() => el.remove(), FLIP.out + delay);
  });
  // Un glissement encore en cours s'arrête : sa position du moment a été relevée.
  for (const a of scroller.getAnimations({ subtree: true })) if (a.id === FLIP.id) a.cancel();
  const view = scroller.getBoundingClientRect();
  const moves = [];
  for (const el of flipRows()) {
    if (el.closest('.out')) continue;
    const r = el.getBoundingClientRect();
    if (!r.height) continue;
    const was = f.tops.get(el);
    const seen = (y) => y > view.top - FLIP.margin && y < view.bottom + FLIP.margin;
    if (was === undefined) {
      // Ligne qui paraît sans être nouvelle (contenu d'un dossier qu'on ouvre).
      if (!el.closest('.in') && seen(r.top)) moves.push([el, null]);
    } else if (Math.abs(was - r.top) >= 0.5 && (seen(was) || seen(r.top))) moves.push([el, was - r.top]);
  }
  for (const [el, dy] of moves) {
    const frames = dy === null
      ? { opacity: [0, 1], transform: ['translateY(-8px)', 'translateY(0)'] }
      : { transform: [`translateY(${dy}px)`, 'translateY(0)'] };
    el.animate(frames, { duration: SPRING.duration, easing: SPRING.easing, id: FLIP.id });
  }
  return moves.length;
}

// --- Thème de l'Espace ------------------------------------------------------
// Fond (une à trois couleurs en dégradé, texture) et couleurs de texte, calculés
// par theme.js pour rester lisibles sur n'importe quelle couleur. Posés sur
// <body> pour l'Espace courant ; sur #tint et sur la liste de l'autre Espace
// pendant un changement d'Espace (fondu enchaîné).
function themeVars(space, s) {
  // Barre translucide : le fond laisse passer un peu du bureau ; le texte est
  // calculé pour rester lisible sur ce fond-là (theme.js, `show`).
  const alpha = FLOATING ? 0.96 : (s.translucent ? 0.8 : 1);
  const p = OrbeTheme.palette(space, s.dark, FLOATING ? 0 : 1 - alpha);
  return { p, vars: OrbeTheme.cssVars(p, alpha) };
}
function paintTheme(el, space, s, only) {
  const sig = JSON.stringify([space.color, space.color2, space.color3, space.plain, space.intensity, space.grain, space.texture, space.mode, s.dark, s.translucent, only ? 1 : 0]);
  if (el._theme === sig) return;
  el._theme = sig;
  const { p, vars } = themeVars(space, s);
  for (const k of only || Object.keys(vars)) el.style.setProperty(k, vars[k]);
  if (only) return;
  el.classList.toggle('grainy', p.grain > 0);
  el.classList.toggle('gradient', p.stops.length > 1);
  if (el === document.body) document.documentElement.dataset.family = p.family;
}

// Pastilles des Espaces, en bas : un point par Espace, l'icône pour l'Espace courant.
function drawSpaces(list, current) {
  const spaces = $('spaces');
  const sig = list.map((x) => x.id + x.icon + x.name).join('|') + '>' + current;
  if (spaces._sig === sig) return;
  spaces._sig = sig;
  spaces.innerHTML = list.length > 1
    ? list.map((x) => `<button class="sp${x.id === current ? ' active' : ''}" data-space="${esc(x.id)}" title="${esc(x.name)}" draggable="true"><span class="em">${esc(x.icon) || '•'}</span></button>`).join('')
    : '';
}

function render(s) {
  const prev = S;
  // Animations seulement pour un changement dans le même Espace, pas au premier affichage.
  animate = !!prev && prev.space.id === s.space.id && !drag;
  present = new Set();
  const collect = (list) => { for (const it of list) { present.add(it.id); if (it.children) collect(it.children); } };
  collect(s.favorites); collect(s.pinned); collect(s.today);
  // La sélection ne garde que les onglets encore affichés ; elle tombe quand une
  // action l'a consommée (selRev) ou quand un autre onglet passe au premier plan.
  if (sel.size) {
    const kept = (s.selRev || 0) !== selRev || (prev && prev.activeId !== s.activeId) ? [] : [...sel].filter((id) => present.has(id));
    if (kept.length !== sel.size) setSel(kept);
  }
  selRev = s.selRev || 0;
  // Glisser en cours : si les listes changent, le relevé des lignes est à refaire.
  if (drag && !drag.settling && geom && prev && structSig(prev) !== structSig(s)) dropGeom();
  S = s;
  setLang(s.lang);
  const b = document.body;
  // Vue flottante : la barre n'y apparaît qu'au survol du bord, barre masquée.
  const open = FLOATING ? s.sidebar.peek && !s.sidebar.visible : s.sidebar.visible;
  if (FLOATING && !open && prev && !(prev.sidebar.peek && !prev.sidebar.visible)) { S = s; b.classList.remove('open'); return; }
  paintTheme(b, s.space, s);
  b.style.setProperty('--sw', s.sidebar.width + 'px');
  b.classList.toggle('open', open);
  b.classList.toggle('docked', s.sidebar.visible);
  b.classList.toggle('translucent', s.translucent);
  b.classList.toggle('incognito', s.incognito);
  b.classList.toggle('blank-window', !!s.blank);
  b.classList.toggle('toolbar', s.toolbar);
  b.classList.toggle('dev-site', !!s.devMode); // liseré jaune et noir sous l'adresse (mode développeur du site)
  fxToolbar(s.pageColor);
  b.classList.toggle('fullscreen', s.fullScreen);
  b.classList.toggle('no-tab', !s.activeId && !FLOATING);
  // Compléments : fenêtre à l'arrière-plan, en-tête de l'Espace, section épinglée repliée.
  const side = s.side || {};
  b.classList.toggle('blurred', side.focused === false && !FLOATING);
  $('space-head').hidden = (side.noHeader || []).includes(s.space.id);
  scroller.classList.toggle('pinned-collapsed', (side.collapsed || []).includes(s.space.id));
  $('fav').dataset.hint = t('side.favHint');
  $('url-copy').hidden = !s.activeId || s.nav.internal || !s.nav.url;

  const label = s.nav.internal ? (s.nav.title || 'Orbe') : host(s.nav.url);
  $('url-text').textContent = label || t('side.search');
  $('url-text').classList.toggle('placeholder', !label);
  $('url').classList.toggle('loading', s.nav.loading);
  // Lueur de chargement le long du bord haut de la page.
  b.classList.toggle('loading', !!s.nav.loading && !!s.activeId);
  $('url').title = s.nav.internal ? '' : s.nav.url;
  const shield = $('shield');
  shield.hidden = !s.activeId || s.nav.internal || false;
  shield.className = s.nav.shield;
  $('shield-n').textContent = s.nav.shield === 'on' && s.nav.blocked ? (s.nav.blocked > 99 ? '99+' : String(s.nav.blocked)) : '';
  // Connexion : cadenas discret en https, « Non sécurisé » en http ou avec un certificat refusé.
  const sec = s.activeId && !s.nav.internal ? (s.nav.security || '') : '';
  const lock = $('lock');
  lock.hidden = !(sec === 'secure' || sec === 'insecure' || sec === 'broken');
  lock.className = sec;
  $('lock-icon').setAttribute('href', sec === 'secure' ? '#i-lock' : '#i-warn');
  $('lock-text').textContent = sec === 'secure' ? '' : t('site.notSecure');
  lock.title = sec ? t('site.sec.' + sec) : '';
  const blocked = s.activeId ? (s.nav.popups || 0) : 0;
  $('popup-note').hidden = !blocked;
  $('popup-note').title = t('popup.blocked');
  const caps = s.activeId ? (s.nav.capture || []) : [];
  $('capture-note').hidden = !caps.length;
  if (caps.length) { $('capture-icon').setAttribute('href', '#i-' + caps[0]); $('capture-note').title = caps.map((k) => t('capture.' + k)).join(' · '); }
  // Adresse entière, ou seulement le site (réglage « Afficher l'adresse entière »).
  $('tb-url-text').textContent = s.nav.internal ? label : ((s.fullUrl === false ? label : s.nav.url) || t('side.search'));
  for (const p of ['b', 'tb']) {
    $(p + '-back').disabled = !s.nav.canBack;
    $(p + '-forward').disabled = !s.nav.canForward;
    $(p + '-reload').disabled = !s.activeId;
  }
  $('reload-icon').setAttribute('href', s.nav.loading ? '#i-stop' : '#i-reload');

  if (editing !== s.space.id) $('space-name').textContent = s.space.name;
  $('space-icon').textContent = s.space.icon;

  // La forme des listes change : relevé des lignes avant, glissement après (voir `flip`).
  flip = animate && prev && !reducedMotion.matches && document.body.classList.contains('open') && structSig(prev) !== structSig(s) ? flipFirst() : null;
  reconcile($('fav'), s.favorites, true);
  // Comme dans Arc (relevé sur l'application) : jusqu'à 4 favoris sur une ligne,
  // puis une grille aussi carrée que possible (9 favoris = 3 × 3), 4 colonnes au plus.
  const nf = s.favorites.length;
  $('fav').style.gridTemplateColumns = `repeat(${nf <= 4 ? Math.max(nf, 1) : Math.min(4, Math.ceil(Math.sqrt(nf)))}, 1fr)`;
  reconcile($('pinned'), s.pinned);
  reconcile($('today'), s.today);
  if (flip) { const f = flip; flip = null; flipPlay(f); }
  $('b-clear').classList.toggle('can', s.today.length > (s.today.some((x) => x.active) ? 1 : 0));

  drawSpaces(s.spaces, s.space.id);

  // Boutons des extensions : icône, pastille, clic = fenêtre de l'extension.
  // Barre d'outils affichée : ils sont à sa droite (comme dans Arc), et non plus sous l'adresse.
  const exts = s.toolbar && !FLOATING ? $('tb-exts') : $('exts');
  const extSig = JSON.stringify(s.extensions || []);
  if (exts._sig !== extSig) {
    exts._sig = extSig;
    const idle = exts === $('exts') ? $('tb-exts') : $('exts');
    idle._sig = '';
    idle.textContent = '';
    exts.textContent = '';
    for (const x of s.extensions || []) {
      const b = document.createElement('button');
      b.className = 'ext' + (x.enabled === false ? ' off' : '');
      b.title = x.title;
      b.dataset.ext = x.id;
      b.appendChild(/^data:image\//.test(x.icon) ? Object.assign(document.createElement('img'), { src: x.icon, draggable: false }) : letterIcon(x.title));
      if (x.badge) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = String(x.badge).slice(0, 4);
        badge.style.background = x.badgeColor || '';
        badge.style.color = x.badgeTextColor || '';
        b.appendChild(badge);
      }
      exts.appendChild(b);
    }
  }

  // Mise à jour disponible : une ligne discrète ; le détail est dans les réglages.
  $('trace-note').hidden = !s.tracing;
  const upd = $('update-note');
  upd.hidden = !s.update;
  if (s.update) $('update-open').textContent = t('update.note', { version: s.update.version });

  renderPlayers(s.players || []);

  // Poignées entre les volets d'une vue scindée (dans l'espace qui les sépare).
  const dv = $('dividers');
  const list = splitDrag ? null : (s.dividers || []);
  if (list) {
    while (dv.children.length > list.length) dv.lastChild.remove();
    list.forEach((d, i) => {
      let h = dv.children[i];
      if (!h) { h = document.createElement('div'); h.className = 'divider'; h.dataset.i = i; dv.appendChild(h); }
      h.className = 'divider' + (d.v ? ' v' : '');
      h.style.cssText = d.v ? `left:${d.x}px;top:${d.y}px;width:${d.w}px` : `left:${d.x}px;top:${d.y}px;height:${d.h}px`;
    });
  }

  drawPanes(s.panes || []);

  const lib = $('b-library');
  lib.classList.toggle('downloading', !!s.downloads);
  fxDownloads(s.downloadsStarted);
  if (s.downloads) lib.querySelector('circle').style.strokeDashoffset = String(75.4 * (1 - s.downloads.progress));
  renderDownloads(s.downloads ? s.downloads.items || [] : []);

  // Dépôt en attente : les listes viennent de prendre leur ordre définitif.
  if (drag && drag.settling && drag.settling !== structSig(s)) endDrag();

  // « Afficher l'onglet dans la barre latérale » : une demande nouvelle (jamais
  // celle déjà là au premier affichage) fait défiler la ligne à l'écran.
  const reveal = side.reveal || null;
  if (reveal && prev && reveal.n !== revealed) showRow(reveal.id);
  revealed = reveal ? reveal.n : 0;
  offViewSoon();
}

// --- Téléchargements en cours, au bas de la barre -----------------------------
// Une ligne par téléchargement (trois au plus) : nom, taille reçue sur taille
// totale, temps restant, et « × » pour annuler. Un clic sur la ligne ouvre les
// téléchargements de la Bibliothèque. Le nom vient du site : posé comme du texte.
function byteSize(n) {
  if (!(n > 0)) return '';
  const u = t('dl.units').split(' ');
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}
function timeLeft(sec) {
  if (sec === null || sec === undefined || !(sec >= 0)) return '';
  if (sec < 60) return t('dl.leftSec', { n: Math.max(1, Math.round(sec)) });
  if (sec < 3600) return t('dl.leftMin', { n: Math.round(sec / 60) });
  return t('dl.leftHour', { h: Math.floor(sec / 3600), m: Math.round((sec % 3600) / 60) });
}
function renderDownloads(list) {
  const box = $('dls');
  box.hidden = !list.length;
  while (box.children.length > list.length) box.lastChild.remove();
  list.forEach((d, i) => {
    let el = box.children[i];
    if (!el) {
      el = document.createElement('div');
      el.className = 'dl';
      el.innerHTML = '<div class="dl-text"><span class="dl-name"></span><span class="dl-sub"></span></div><button class="ib dl-x"><svg class="i"><use href="#i-x"/></svg></button><i class="dl-bar"></i>';
      box.appendChild(el);
    }
    el.dataset.dl = d.id;
    el.querySelector('.dl-name').textContent = d.name;
    el.title = d.name;
    const sizes = d.total ? `${byteSize(d.received) || '0'} / ${byteSize(d.total)}` : byteSize(d.received);
    el.querySelector('.dl-sub').textContent = [sizes, d.paused ? t('dl.paused') : timeLeft(d.left)].filter(Boolean).join(' · ');
    el.querySelector('.dl-x').title = t('dl.cancel');
    el.querySelector('.dl-bar').style.transform = `scaleX(${d.total ? Math.max(0, Math.min(1, d.received / d.total)).toFixed(3) : 0})`;
  });
}
$('dls').addEventListener('click', (e) => {
  const el = e.target.closest('.dl');
  if (!el) return;
  e.stopPropagation();
  if (e.target.closest('.dl-x')) send('dlCancel', el.dataset.dl);
  else send('command', 'downloads');
});

// --- Ligne de l'onglet affiché : la montrer, signaler qu'elle est hors de vue --
let revealed = 0;
function showRow(id) {
  const el = document.querySelector(`#sidebar [data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  // La mise en évidence tient d'un rendu à l'autre (chaque rendu réécrit les
  // classes de la ligne) ; elle repart de zéro si la ligne vient d'être montrée.
  flashId = id;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flashId = null;
    for (const x of document.querySelectorAll('#sidebar .flash')) x.classList.remove('flash');
  }, 1200);
}

// Repère en haut ou en bas de la liste quand la ligne de l'onglet affiché a
// défilé hors de vue ; un clic y ramène.
const offEl = $('off-view');
let offFrame = 0;
function offView() {
  offFrame = 0;
  const row = document.querySelector('#scroll .row.tab.active');
  let where = '';
  if (row && row.offsetParent !== null && !slide && !drag) {
    const r = row.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    if (r.bottom < sr.top + 6) where = 'up';
    else if (r.top > sr.bottom - 6) where = 'down';
  }
  if (offEl._where === where) return;
  offEl._where = where;
  offEl.className = where;
  offEl.hidden = !where;
}
// Par minuterie, pas par image : une fenêtre masquée ou recouverte ne dessine
// pas, et le repère resterait en attente.
function offViewSoon() { if (!offFrame) offFrame = setTimeout(offView, 60); }
// Écart entre la ligne de l'onglet affiché et la partie visible de la liste : négatif
// si elle est au-dessus, positif si elle est en dessous, 0 si elle est entièrement
// en vue ; null s'il n'y a pas de ligne.
function offGap() {
  const row = document.querySelector('#scroll .row.tab.active');
  if (!row) return null;
  const r = row.getBoundingClientRect();
  const sr = scroller.getBoundingClientRect();
  return r.top < sr.top ? r.top - sr.top : (r.bottom > sr.bottom ? r.bottom - sr.bottom : 0);
}
let offWatch = 0;
offEl.onclick = () => {
  const row = document.querySelector('#scroll .row.tab.active');
  if (!row) return;
  row.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  // Le défilement doux avance image par image : fenêtre recouverte ou écran
  // verrouillé (aucune image présentée), ou liste redessinée en route, il peut
  // caler à mi-chemin, et le repère resterait. On le SUIT donc, au lieu d'attendre
  // un délai fixe : s'il n'avance plus alors que la ligne n'est pas en vue, on y va
  // d'un coup ; et si la liste part dans l'autre sens (l'utilisateur a défilé
  // ailleurs entre-temps), on n'y touche plus. (Un rattrapage à délai fixe ramenait
  // la liste sur l'onglet 900 ms après le clic, quoi qu'on ait fait depuis.)
  clearTimeout(offWatch);
  let last = scroller.scrollTop;
  let tries = 0;
  const watch = () => {
    const gap = offGap();
    if (!gap) { offViewSoon(); return; } // arrivée (ou plus de ligne)
    const moved = (scroller.scrollTop - last) * Math.sign(gap); // > 0 : vers la ligne
    last = scroller.scrollTop;
    if (moved < -1) return; // on s'en éloigne : quelqu'un d'autre défile
    tries += 1;
    if (moved < 0.5 || tries > 15) {
      const now = document.querySelector('#scroll .row.tab.active');
      if (now) now.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      offViewSoon();
      return;
    }
    offWatch = setTimeout(watch, 120);
  };
  offWatch = setTimeout(watch, 120);
};
addEventListener('resize', offViewSoon);
// Les lignes qui apparaissent ou se replient déplacent les autres : on revérifie à la fin.
document.getElementById('scroll').addEventListener('animationend', offViewSoon);

// --- Renommage sur place ----------------------------------------------------
// Renommage en cours ? Si le champ a disparu sans prévenir (liste redessinée
// pendant la saisie : un champ retiré de la page ne signale pas qu'il perd le
// clavier), l'état est remis à zéro — sinon plus aucun renommage, balayage entre
// Espaces ni Suppr sur la sélection n'était accepté jusqu'au rechargement.
function editingNow() {
  if (editing && !document.querySelector('input.rename')) editing = null;
  return editing;
}

function startRename(id) {
  if (!S) return;
  let holder;
  let current;
  if (id === S.space.id) {
    holder = $('space-name');
    current = S.space.name;
  } else {
    const row = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!row) return;
    holder = row.querySelector('.title');
    current = holder.textContent;
    row.scrollIntoView({ block: 'nearest' });
  }
  if (!holder || editingNow()) return;
  editing = id;
  const input = document.createElement('input');
  input.className = 'rename';
  input.defaultValue = current; // « pas encore touché » se lit ainsi (⌘Z, voir commands.js)
  input.value = current;
  holder.textContent = '';
  holder.appendChild(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    editing = null;
    const name = input.value.trim();
    holder.textContent = commit && name ? name : current;
    const owner = holder.closest('[data-key]');
    if (owner) owner._t = null;
    if (commit && name !== current) send('rename', { id, name });
    else if (S) render(S);
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  for (const ev of ['click', 'dblclick', 'mousedown']) input.addEventListener(ev, (e) => e.stopPropagation());
}

// --- Sélection multiple -----------------------------------------------------
const rowOf = (id) => document.querySelector(`#sidebar [data-id="${CSS.escape(id)}"]`);
// Onglets dans l'ordre où on les voit : favoris, épinglés, Aujourd'hui (les
// lignes masquées — dossier replié, volet d'une vue scindée — n'en font pas partie).
const visibleTabIds = () => [...document.querySelectorAll('#fav .tile, #pinned .row.tab, #today .row.tab')]
  .filter((el) => el.dataset.id && el.offsetParent !== null).map((el) => el.dataset.id);
// Ligne de l'onglet affiché (pour une vue scindée : la ligne du groupe).
const activeRowId = () => { const el = document.querySelector('#sidebar .row.tab.active, #sidebar .tile.active'); return el ? el.dataset.id : null; };

function setSel(ids) {
  sel.clear();
  for (const id of ids) sel.add(id);
  if (!sel.size) anchor = null;
  for (const el of document.querySelectorAll('#sidebar .sel')) if (!sel.has(el.dataset.id)) el.classList.remove('sel');
  for (const id of sel) { const el = rowOf(id); if (el) el.classList.add('sel'); }
  send('select', [...sel]);
}

// ⌘clic : ajoute ou retire un onglet. Comme dans Arc, la sélection part de
// l'onglet affiché : le premier ⌘clic sur un autre onglet les réunit.
function toggleSel(id) {
  const next = new Set(sel);
  const current = activeRowId();
  if (!next.size && current && current !== id) next.add(current);
  if (next.has(id)) next.delete(id); else next.add(id);
  setSel(next);
  anchor = sel.size ? id : null;
}

// ⇧clic : tout ce qui se trouve entre le point de départ et la ligne cliquée.
function rangeSel(id) {
  const order = visibleTabIds();
  const from = anchor && order.includes(anchor) ? anchor : (activeRowId() || id);
  const a = order.indexOf(from);
  const b = order.indexOf(id);
  if (a < 0 || b < 0) return setSel([id]);
  setSel(order.slice(Math.min(a, b), Math.max(a, b) + 1));
  anchor = from;
  return undefined;
}

// --- Clics ------------------------------------------------------------------
const sidebar = $('sidebar');

sidebar.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]');
  const row = e.target.closest('[data-id]');
  // ⌘clic (Ctrl hors macOS) ou ⇧clic sur un onglet : sélection, sans l'afficher.
  // (⌘clic sur l'icône d'un épinglé sorti de son adresse : c'est un retour, plus bas.)
  const aside = !!act && act.dataset.act === 'icon' && !!row && row.classList.contains('changed') && modKey(e);
  // ⌥clic sur un onglet : vue scindée avec la page affichée ; ⌥⌘clic : petite fenêtre (comme dans Arc).
  if (row && !row.dataset.folder && e.altKey && !e.shiftKey && !act) {
    e.stopPropagation();
    if (sel.size) setSel([]);
    return send(modKey(e) ? 'littleTab' : 'splitTab', row.dataset.id);
  }
  if (row && !row.dataset.folder && (modKey(e) || e.shiftKey) && !(act && act.dataset.act !== 'icon') && !aside) {
    e.stopPropagation();
    return modKey(e) ? toggleSel(row.dataset.id) : rangeSel(row.dataset.id);
  }
  // Tout autre clic dans la barre abandonne la sélection.
  if (sel.size) setSel([]);
  if (act && row) {
    e.stopPropagation();
    const id = row.dataset.id;
    if (act.dataset.act === 'close') send('close', id);
    else if (act.dataset.act === 'mute') send('toggleMute', id);
    else if (act.dataset.act === 'capture') send('captureMenu', id);
    else if (act.dataset.act === 'reset') send('resetPinned', id);
    // Clic sur l'icône d'un épinglé sorti de son adresse : retour à celle-ci.
    // ⌘clic : la page qu'il affichait part dans un nouvel onglet.
    else if (act.dataset.act === 'icon') send(row.classList.contains('changed') ? (aside ? 'resetPinnedAside' : 'resetPinned') : (row.dataset.folder ? 'toggleFolder' : 'activate'), id);
    return undefined;
  }
  if (row) {
    if (row.dataset.folder) send('toggleFolder', row.dataset.id);
    else send('activate', row.dataset.id);
    return undefined;
  }
  const sp = e.target.closest('[data-space]');
  if (sp) return send('switchSpace', sp.dataset.space);
  // En-tête de l'Espace : « … » ouvre son menu, le chevron replie les épinglés,
  // un clic sur le nom le renomme (comme dans Arc).
  if (e.target.closest('#space-more')) return send('spaceMenu', null);
  if (e.target.closest('#pinned-toggle')) return send('command', 'collapsePinned');
  if (e.target.closest('#space-name') && !editing && S && overText($('space-name'), e)) return startRename(S.space.id);
  return undefined;
});

// Le pointeur est-il sur le texte de l'élément (et non dans le vide à sa droite) ?
function overText(el, e) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const r = range.getBoundingClientRect();
  return e.clientX >= r.left - 2 && e.clientX <= r.right + 6;
}

// Boutons 3 et 4 de la souris (précédent / suivant) sur la barre : Espace voisin.
sidebar.addEventListener('mouseup', (e) => {
  if (e.button !== 3 && e.button !== 4) return;
  e.preventDefault();
  send('stepSpace', e.button === 3 ? -1 : 1);
});

// Clic molette : archive l'onglet.
sidebar.addEventListener('auxclick', (e) => {
  const row = e.target.closest('[data-id]');
  if (e.button === 1 && row && !row.dataset.folder) send('close', row.dataset.id);
});

sidebar.addEventListener('dblclick', (e) => {
  const row = e.target.closest('[data-id]');
  // Double-clic sur une ligne (dossier, épinglé, onglet du jour) : renommer.
  if (row && !row.closest('#fav')) return e.target.closest('.act') ? undefined : startRename(row.dataset.id);
  if (e.target.closest('#space-head')) return e.target.closest('button') ? undefined : startRename(S.space.id);
  // Double-clic dans le vide de la liste : nouvel onglet.
  if (!row && e.target.closest('#scroll') && !e.target.closest('button, input, #divider')) return send('openCommand', 'new');
  return undefined;
});

sidebar.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const row = e.target.closest('[data-id]');
  const sp = e.target.closest('[data-space]');
  if (row) {
    // Clic droit hors de la sélection : elle tombe, le menu est celui de la ligne.
    const id = row.dataset.id;
    if (sel.size && !sel.has(id)) setSel([]);
    send('tabMenu', sel.size > 1 ? { id, ids: [...sel] } : id);
  } else if (sp) send('spaceMenu', sp.dataset.space);
  else if (e.target.closest('#space-head')) send('spaceMenu', null);
  else send('sidebarMenu');
});

$('trace-note').onclick = () => send('trace:stop');
$('update-open').onclick = () => send('update:show');
$('update-close').onclick = () => send('update:dismiss');
for (const box of [$('exts'), $('tb-exts')]) {
  box.addEventListener('contextmenu', (e) => {
    const b = e.target.closest('[data-ext]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    send('ext:menu', { id: b.dataset.ext });
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ext]');
    if (!b) return;
    const r = b.getBoundingClientRect();
    send('ext:popup', { id: b.dataset.ext, x: Math.round(r.left), y: Math.round(r.bottom + 6) });
  });
}
$('b-sidebar').onclick = () => send('toggleSidebar');
$('b-menu').onclick = () => send('command', 'appMenu');
$('url').onclick = () => send('openCommand', 'edit');
$('shield').onclick = () => send('siteControl');
$('shield').addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); send('shieldMenu'); });
$('lock').onclick = () => send('siteInfo');
$('popup-note').onclick = () => send('popupMenu');
$('capture-note').onclick = () => send('captureMenu');
$('tb-url').onclick = () => send('openCommand', 'edit');
// Clic droit sur la barre d'outils : adresse entière, copie, capture, partage.
$('toolbar').addEventListener('contextmenu', (e) => { e.preventDefault(); send('toolbarMenu'); });
$('b-newtab').onclick = () => send('openCommand', 'new');
$('b-clear').onclick = () => send('command', 'clearToday');
$('b-library').onclick = () => send('command', S && S.downloads ? 'downloads' : 'library');
$('b-plus').onclick = () => send('sidebarMenu', 'plus');
$('url-copy').onclick = () => send('command', 'copyUrl');
const LONG_PRESS = 500; // appui long sur précédent / suivant (ms)
for (const p of ['b', 'tb']) {
  // Précédent, suivant : clic = aller ; ⌘clic ou clic molette = dans un nouvel
  // onglet ; clic droit ou appui long = l'historique de l'onglet.
  for (const [name, dir] of [['back', -1], ['forward', 1]]) {
    const el = $(`${p}-${name}`);
    let held = null;
    let long = false;
    el.onclick = (e) => {
      if (long) { long = false; return; }
      if (modKey(e)) send('navNew', dir); else send('command', name);
    };
    el.addEventListener('auxclick', (e) => { if (e.button === 1) { e.stopPropagation(); send('navNew', dir); } });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); clearTimeout(held); send('navMenu', dir); });
    el.addEventListener('pointerdown', (e) => {
      long = false;
      clearTimeout(held);
      if (e.button === 0) held = setTimeout(() => { long = true; send('navMenu', dir); }, LONG_PRESS);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => clearTimeout(held));
  }
  // Actualiser : clic = actualiser (ou arrêter pendant le chargement) ; ⌘clic =
  // dupliquer l'onglet ; double-clic = arrêter ; clic droit = les variantes.
  const reload = $(p + '-reload');
  reload.onclick = (e) => {
    if (modKey(e)) return send('command', 'duplicate');
    const stop = S && S.nav.loading;
    // L'icône fait un tour (animation relancée à chaque clic).
    const svg = e.currentTarget.querySelector('svg');
    if (!stop && svg) { svg.classList.remove('spin'); void svg.getBoundingClientRect(); svg.classList.add('spin'); }
    return send('command', stop ? 'stop' : 'reload');
  };
  reload.addEventListener('dblclick', (e) => { e.stopPropagation(); send('command', 'stop'); });
  reload.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); send('reloadMenu'); });
}

// --- Changement d'Espace : deux listes côte à côte ---------------------------
// La liste de l'Espace courant (#scroll) et celle de l'autre Espace (une image
// fixe, `.ghost`) glissent ensemble dans #pager, pendant que la teinte de l'autre
// Espace (#tint) se fond par-dessus au même pas.
//  - Balayage à deux doigts : les listes suivent les doigts ; passé un seuil, ou
//    sur un geste vif, on change d'Espace ; sinon elles reviennent au ressort. Au
//    bout de la rangée, la liste résiste (élastique) et revient.
//  - Clic sur une pastille ou raccourci : le même glissement, sans les doigts.
// Rien n'est redessiné pendant le mouvement : le nouvel état reçu est gardé de
// côté et rendu à l'arrivée, sous l'image fixe qui montrait déjà la même liste.
// Le mouvement lui-même est une animation composée (Web Animations) dont la
// courbe est un ressort calculé avec la vitesse des doigts au lâcher.
const PAGER = {
  commit: 0.4, // part de la largeur au-delà de laquelle le balayage change d'Espace…
  commitMax: 110, // …sans dépasser tant de pixels
  flick: 1.5, // vitesse (px/ms) d'un geste vif, qui suffit à changer d'Espace
  flickMin: 40, // déplacement minimal pour qu'un geste vif compte
  idle: 90, // sans événement pendant ce temps (ms), les doigts sont considérés levés
  // Nouveau geste pendant l'inertie du précédent (voir wheelFresh) : l'inertie ne fait que
  // décroître ; un geste qui repart, lui, remonte nettement après être retombé.
  freshDrop: 0.6, // le geste décidé doit d'abord être retombé sous cette part de son sommet…
  freshRise: 1.8, // …puis remonter d'autant de fois son creux…
  freshMin: 4, // …plus tant de pixels (les frémissements de fin d'inertie ne comptent pas)
  response: 0.2, // ressort du glissement : réponse (s), amortissement critique (≈ 240 ms)
  elastic: 0.55, // raideur de l'élastique au bout de la rangée
  // Nouvel Espace au bout de la rangée : un geste voulu, en deux temps. Tirer d'autant (px,
  // relâchement déduit) au-delà du dernier Espace ARME la pastille « + » (elle prend la
  // couleur de l'Espace) ; il faut alors garder les doigts posés, immobiles, le temps
  // qu'un anneau se referme. Un balayage vif, même fort, ne crée rien : son inertie continue
  // d'envoyer des événements qui s'éteignent, et la pastille se désarme avant tout silence.
  create: 320,
  createKeep: 0.7, // armée, la pastille le reste tant que le geste ne retombe pas sous cette part du seuil
  createHold: 450, // doigts immobiles pendant ce temps (ms, après `idle`) : l'Espace est créé
  jitter: 2, // armée : un frémissement des doigts (px) ne compte pas comme un mouvement
};
const pagerEl = $('pager');
const scroller = $('scroll');
const tintEl = $('tint');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let slide = null; // glissement en cours
let wheelIdle = null;
let wheelLocked = false; // suite (inertie) d'un geste déjà décidé : ignorée
let wheelPeak = 0; // sommet du geste décidé (px par événement), depuis le verrou
let wheelFloor = 0; // creux atteint depuis ce sommet
let lastWheel = 0;
let swipeSum = 0;

// Image fixe de la liste d'un Espace : mêmes lignes, sans aucune interaction.
function ghostNode(it) {
  const el = document.createElement('div');
  if (it.type === 'folder') {
    el.className = 'folder' + (it.open ? ' open' : '');
    el.innerHTML = `<div class="row"><span class="ic">${icon('folder')}</span><span class="title"></span>${icon('chevron', 'i chev')}</div><div class="children"></div>`;
    el.querySelector('.title').textContent = it.name;
    if (it.icon) { const slot = el.querySelector('.ic'); slot.textContent = ''; slot.appendChild(emojiEl(it.icon)); }
    for (const child of it.children) el.lastChild.appendChild(ghostNode(child));
  } else {
    tabRow(el, it);
    el.draggable = false;
  }
  return el;
}

function ghostPanel(vm) {
  const el = document.createElement('div');
  el.className = 'ghost';
  el.dataset.space = vm.space.id;
  el.innerHTML = `<div class="g-head"><span class="g-icon"></span><span class="g-name grow"></span></div><div class="list"></div>`
    + `<div class="g-divider"><span class="rule"></span></div>`
    + `<div class="row g-new"><span class="ic">${icon('plus')}</span><span class="title"></span></div><div class="list"></div>`;
  el.querySelector('.g-icon').textContent = vm.space.icon;
  el.querySelector('.g-name').textContent = vm.space.name;
  el.querySelector('.g-new .title').textContent = t('side.newTab');
  const lists = el.querySelectorAll('.list');
  for (const it of vm.pinned) lists[0].appendChild(ghostNode(it));
  for (const it of vm.today) lists[1].appendChild(ghostNode(it));
  return el;
}

// Ressort amorti (amortissement critique) de 0 vers 1, parti à la vitesse v0
// (en parts du trajet par seconde). Rend la position à l'instant t (s).
function springAt(t, v0, response = PAGER.response) {
  const w = (2 * Math.PI) / response;
  return 1 + (-1 + (v0 - w) * t) * Math.exp(-w * t);
}
// Durée (ms) et courbe `linear()` de ce ressort, pour une animation composée.
function springTiming(v0, response = PAGER.response) {
  let end = 0.12;
  for (let t = 0.6; t > 0.12; t -= 0.01) if (Math.abs(1 - springAt(t, v0, response)) > 0.004) { end = t + 0.01; break; }
  const pts = [];
  // Jamais au-delà de la cible : un dépassement montrerait un vide entre les listes.
  for (let i = 0; i <= 24; i++) pts.push(i === 24 ? 1 : Math.min(1, Math.max(0, springAt((end * i) / 24, v0, response))).toFixed(3));
  return { duration: Math.round(end * 1000), easing: `linear(${pts.join(', ')})`, at: (ms) => (ms >= end * 1000 ? 1 : Math.min(1, Math.max(0, springAt(ms / 1000, v0, response)))) };
}

const pagerWidth = () => pagerEl.clientWidth || 1;
// Au bout de la rangée : la liste suit de moins en moins (élastique).
const elastic = (x, W) => Math.sign(x) * W * (1 - 1 / ((Math.abs(x) * PAGER.elastic) / W + 1));

// Place les deux listes : `x` > 0 découvre l'Espace suivant (à droite), < 0 le précédent.
function slideSet(x) {
  const W = pagerWidth();
  slide.x = x;
  scroller.style.transform = `translateX(${-x}px)`;
  if (slide.ghost) slide.ghost.style.transform = `translateX(${slide.dir * W - x}px)`;
  tintEl.style.opacity = slide.ghost ? String(Math.min(1, Math.abs(x) / W)) : '0';
}

// Pastille « + » du bout de la rangée : `p` de 0 (absente) à 1 (nouvel Espace).
// Opacité et transformation seulement.
function slidePlus(p) {
  if (!slide) return;
  if (!p) { if (slide.plus) { slide.plus.remove(); slide.plus = null; } return; }
  if (!slide.plus) {
    const el = (slide.plus = document.createElement('div'));
    el.className = 'pager-plus';
    el.innerHTML = '<svg class="i"><use href="#i-plus"/></svg>'; // icône fixe, écrite ici
    el.title = t('spaces.new');
    pagerEl.appendChild(el);
  }
  slide.plus.dataset.p = p.toFixed(2);
  slide.plus.style.opacity = String(Math.min(1, p * 1.6));
  slide.plus.style.transform = `translateX(${Math.round((1 - p) * 26)}px) scale(${(0.6 + 0.4 * p).toFixed(3)})`;
}

// Pastille armée ou non (voir PAGER.create). Désarmée, le compte à rebours s'arrête.
function slideArm(on) {
  if (!slide || !!slide.armed === !!on) return;
  slide.armed = !!on;
  if (!on) slideHoldStop();
  if (slide.plus) slide.plus.classList.toggle('armed', !!on);
}

function slideHoldStop() {
  if (!slide || !slide.hold) return;
  clearTimeout(slide.hold);
  slide.hold = null;
  if (slide.plus) slide.plus.classList.remove('hold');
}

// Les doigts se sont immobilisés, pastille armée : l'anneau se referme, puis l'Espace est créé.
function slideHold() {
  if (!slide || !slide.armed || slide.hold || !slide.plus) return;
  slide.plus.style.setProperty('--hold', PAGER.createHold + 'ms');
  slide.plus.classList.add('hold');
  slide.hold = setTimeout(() => {
    if (!slide || !slide.armed || !slide.plus) return;
    slide.hold = null;
    slide.armed = false;
    slide.plus.classList.add('go');
    send('command', 'newSpace');
    slideFly(0, slideEnd);
  }, PAGER.createHold);
}

// Prépare l'image fixe et la teinte de l'Espace `vm`, du côté `dir` (+1 : à droite).
function slideGhost(vm, dir) {
  if (slide.ghost) slide.ghost.remove();
  slide.dir = dir;
  slide.ghost = null;
  if (!vm) return;
  slide.ghost = ghostPanel(vm);
  slide.targetId = vm.space.id;
  slide.targetSpace = vm.space;
  pagerEl.appendChild(slide.ghost);
  // La teinte porte le fond de l'autre Espace ; sa liste, ses couleurs de texte.
  paintTheme(tintEl, vm.space, S);
  paintTheme(slide.ghost, vm.space, S, OrbeTheme.TEXT_VARS);
}

function slideBegin() {
  slide = { x: 0, dir: 0, ghost: null, v: 0, phase: 'drag', commit: false, anims: [], after: [] };
  pagerEl.classList.add('sliding');
}

// Position affichée en ce moment, y compris au milieu d'une animation.
function slideNow() {
  if (!slide.fly) return slide.x;
  const f = slide.fly;
  return f.from + (f.to - f.from) * f.timing.at(performance.now() - f.t0);
}

function slideStop() {
  for (const a of slide.anims) a.cancel();
  slide.anims = [];
  slide.fly = null;
  clearTimeout(slide.timer);
}

// Lance les listes vers `to` (0 : retour ; ±largeur : l'autre Espace) au ressort.
function slideFly(to, done) {
  const W = pagerWidth();
  const from = slideNow();
  slideStop();
  const dist = to - from;
  // Vitesse des doigts, en parts du trajet restant par seconde.
  const v0 = Math.abs(dist) > 1 ? Math.max(0, Math.min(40, (slide.v * 1000) / dist)) : 0;
  const timing = springTiming(v0);
  const opts = { duration: timing.duration, easing: timing.easing, fill: 'forwards' };
  slide.phase = 'settle';
  slide.fly = { from, to, t0: performance.now(), timing };
  slide.x = to;
  const move = (el, a, b) => slide.anims.push(el.animate({ transform: [`translateX(${a}px)`, `translateX(${b}px)`] }, opts));
  move(scroller, -from, -to);
  if (slide.ghost) {
    move(slide.ghost, slide.dir * W - from, slide.dir * W - to);
    slide.anims.push(tintEl.animate({ opacity: [Math.min(1, Math.abs(from) / W), Math.min(1, Math.abs(to) / W)] }, opts));
  }
  // Changement décidé : à mi-course, quand la teinte de l'autre Espace domine, le
  // reste de la barre (adresse, favoris, pastilles) prend ses couleurs de texte.
  clearTimeout(slide.swap);
  if (to !== 0 && slide.commit && slide.targetSpace) {
    const space = slide.targetSpace;
    slide.swap = setTimeout(() => { if (slide && S) paintTheme(document.body, space, S, OrbeTheme.TEXT_VARS); }, timing.duration * 0.4);
  }
  // La fin est donnée par une minuterie plutôt que par l'animation : celle-ci ne
  // « finit » pas dans une vue qui n'est pas affichée.
  slide.timer = setTimeout(done, timing.duration);
}

// Fin du glissement : tout revient à sa place, puis l'état gardé de côté est rendu.
function slideEnd() {
  if (!slide) return;
  const { pending, other, after, ghost, plus } = slide;
  clearTimeout(slide.hold);
  if (plus) plus.remove();
  slideStop();
  clearTimeout(slide.swap);
  slide = null;
  document.body._theme = ''; // les couleurs de l'Espace affiché sont reposées par le rendu
  if (ghost) ghost.remove();
  scroller.style.transform = '';
  tintEl.style.opacity = '';
  pagerEl.classList.remove('sliding');
  const next = pending || other;
  if (next) render(next);
  else if (S) paintTheme(document.body, S.space, S);
  for (const fn of after) fn();
}

// Un geste est décidé : sa suite (doigts encore posés, puis inertie) est ignorée.
function wheelLock(dx) {
  wheelLocked = true;
  wheelPeak = wheelFloor = Math.abs(dx || 0);
}

// Pendant le verrou : cet événement ouvre-t-il un NOUVEAU geste ? macOS envoie l'inertie d'un
// balayage pendant près d'une seconde, sans silence : attendre qu'elle s'éteigne obligeait à
// s'arrêter entre deux Espaces. L'inertie ne fait que décroître ; des doigts reposés font
// remonter le mouvement après qu'il est retombé (ou le font repartir dans l'autre sens).
function wheelFresh(dx) {
  const m = Math.abs(dx);
  // Le geste décidé accélère encore (pas encore retombé) : son sommet monte, rien de nouveau.
  if (m > wheelPeak && wheelFloor > wheelPeak * PAGER.freshDrop) { wheelPeak = wheelFloor = m; return false; }
  const fallen = wheelFloor <= wheelPeak * PAGER.freshDrop;
  wheelFloor = Math.min(wheelFloor, m);
  return fallen && m >= wheelFloor * PAGER.freshRise + PAGER.freshMin;
}

// Le balayage a franchi le seuil : on change d'Espace et les listes finissent leur course.
function slideCommit(dx) {
  const W = pagerWidth();
  slide.commit = true;
  wheelLock(dx);
  drawSpaces(S.spaces, slide.targetId); // la pastille change tout de suite
  send('switchSpace', slide.targetId);
  slideFly(slide.dir * W, () => {
    // L'état du nouvel Espace arrive d'ordinaire bien avant ; sinon on l'attend un peu.
    if (slide.pending) return slideEnd();
    slide.waiting = true;
    slide.timer = setTimeout(slideEnd, 600);
    return undefined;
  });
}

// Les doigts sont levés (ou le geste s'est arrêté) : retour à l'Espace courant.
function slideRelease() {
  if (!slide || slide.phase !== 'drag') return;
  // Pastille armée : doigts posés, immobiles — la liste reste tirée le temps de l'anneau.
  if (slide.armed) return void slideHold();
  slideFly(0, slideEnd);
}

// Changement d'Espace décidé ailleurs (pastille, raccourci, menu) : même glissement.
function slideTo(s) {
  const from = s.spaces.findIndex((x) => x.id === S.space.id);
  const to = s.spaces.findIndex((x) => x.id === s.space.id);
  slideBegin();
  slideGhost({ space: s.space, pinned: s.pinned, today: s.today }, from >= 0 && to < from ? -1 : 1);
  slide.commit = true;
  slide.pending = s;
  slideSet(0);
  drawSpaces(s.spaces, s.space.id);
  slideFly(slide.dir * pagerWidth(), slideEnd);
}

// Tout état reçu passe par ici : pendant un glissement, il attend la fin.
function onState(s) {
  if (slide && slide.commit) {
    if (s.space.id === slide.targetId) {
      slide.pending = s;
      if (slide.waiting) slideEnd();
      return;
    }
    if (S && s.space.id === S.space.id) { slide.other = s; return; }
    slideEnd(); // un troisième Espace : on termine d'abord celui-ci
  } else if (slide && S && s.space.id !== S.space.id) {
    slideEnd(); // changement venu d'ailleurs pendant un balayage : le balayage est abandonné
  }
  const visible = FLOATING ? s.sidebar.peek && !s.sidebar.visible : s.sidebar.visible;
  if (S && !slide && s.space.id !== S.space.id && visible && document.body.classList.contains('open') && !reducedMotion.matches && !drag) return slideTo(s);
  const first = !S;
  render(s);
  // Premier affichage : la barre paraît en fondu, sans glisser.
  if (first && !FLOATING) {
    const b = document.body;
    b.classList.add('ready', 'no-anim');
    fxStart();
    requestAnimationFrame(() => requestAnimationFrame(() => b.classList.remove('no-anim')));
  }
  return undefined;
}

sidebar.addEventListener('wheel', (e) => {
  const dragging = slide && slide.phase === 'drag';
  if (!dragging && Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
  e.preventDefault();
  const now = performance.now();
  const dt = Math.max(4, Math.min(64, lastWheel ? now - lastWheel : 16));
  lastWheel = now;
  clearTimeout(wheelIdle);
  wheelIdle = setTimeout(() => { wheelLocked = false; lastWheel = 0; slideRelease(); }, PAGER.idle);
  let fresh = false;
  if (wheelLocked) {
    if (!wheelFresh(e.deltaX)) return;
    wheelLocked = false; // un nouveau geste commence dans l'inertie du précédent
    fresh = true;
    swipeSum = 0;
  }
  if (!S || drag || editingNow()) return;
  if (reducedMotion.matches) {
    // Sans animation : un geste franc change d'Espace, rien ne glisse.
    swipeSum += e.deltaX;
    if (Math.abs(swipeSum) > 70) { wheelLock(e.deltaX); send('stepSpace', swipeSum > 0 ? 1 : -1); swipeSum = 0; }
    return;
  }
  if (slide && slide.commit) {
    // Un glissement décidé va à son terme. Mais si le geste suivant est déjà là et que le
    // nouvel Espace est arrivé, il se pose tout de suite : les listes repartent sous les doigts.
    if (!fresh || !slide.pending) return;
    slideEnd();
  }
  if (slide && slide.armed) {
    if (Math.abs(e.deltaX) <= PAGER.jitter) return; // doigts posés : un frémissement ne change rien
    // Le geste repart dans l'autre sens : on renonce, la liste revient, le reste du geste est ignoré.
    if (e.deltaX < 0) { wheelLock(e.deltaX); slideArm(false); slideFly(0, slideEnd); return; }
    slideHoldStop(); // il continue : le compte à rebours reprendra au prochain arrêt
  }
  let x = e.deltaX;
  if (!slide) slideBegin();
  else { x += slideNow(); slideStop(); slide.phase = 'drag'; } // reprise en plein retour
  const W = pagerWidth();
  const v = e.deltaX / dt;
  slide.v = slide.v ? slide.v * 0.6 + v * 0.4 : v;
  const dir = Math.sign(x) || slide.dir || 1;
  const vm = S.near && (dir > 0 ? S.near.next : S.near.prev);
  if (dir !== slide.dir || !!vm !== !!slide.ghost) slideGhost(vm, dir);
  if (!vm) {
    // Bout de la rangée : la liste résiste, et ce qui a été tiré se relâche peu à peu.
    slide.raw = (slide.raw || 0) * 0.92 + e.deltaX;
    slideSet(elastic(slide.raw, W));
    // Au-delà du dernier Espace : un « + » sort du bord et grandit avec le geste ; tiré
    // franchement jusqu'au bout, il s'arme, et c'est en gardant les doigts posés qu'on crée
    // le nouvel Espace (voir PAGER.create). Rien n'est créé pendant le mouvement.
    if (dir > 0 && slide.raw > 0 && !S.incognito) {
      slidePlus(Math.min(1, slide.raw / PAGER.create));
      slideArm(slide.armed ? slide.raw >= PAGER.create * PAGER.createKeep : slide.raw >= PAGER.create);
    } else { slideArm(false); slidePlus(0); }
    return;
  }
  slide.raw = 0;
  slideArm(false);
  slidePlus(0);
  slideSet(Math.max(-W, Math.min(W, x)));
  const far = Math.abs(slide.x) >= Math.min(W * PAGER.commit, PAGER.commitMax);
  const brisk = Math.abs(slide.v) >= PAGER.flick && Math.abs(slide.x) >= PAGER.flickMin && Math.sign(slide.v) === dir;
  if (far || brisk) slideCommit(e.deltaX);
}, { passive: false });

// --- Rebond élastique de la liste ---------------------------------------------
// Au bout de la liste (en haut ou en bas), continuer de faire défiler la tire un
// peu, de moins en moins, puis elle revient au ressort — comme les listes de
// macOS. Le moteur ne le fait de lui-même que pour le défilement principal d'une
// page, pas pour un bloc défilant interne comme celui-ci. Seule la propriété
// `translate` de la liste change (aucune mise en page) ; elle est distincte de
// `transform`, que le changement d'Espace utilise.
const BOUNCE = { max: 72, stiff: 0.45, idle: 70, back: 360 };
const bounce = { raw: 0, y: 0, timer: null, anim: null };

function bounceReset() {
  clearTimeout(bounce.timer);
  if (bounce.anim) { try { bounce.anim.cancel(); } catch {} bounce.anim = null; }
  if (bounce.raw || bounce.y) scroller.style.translate = '';
  bounce.raw = 0;
  bounce.y = 0;
}

function bounceRelease() {
  const from = bounce.y;
  bounceReset();
  if (Math.abs(from) < 0.5) return;
  bounce.anim = scroller.animate({ translate: [`0 ${from}px`, '0 0'] }, { duration: BOUNCE.back, easing: SPRING.easing, id: 'bounce' });
  bounce.anim.onfinish = () => { bounce.anim = null; };
}

scroller.addEventListener('wheel', (e) => {
  if (slide || drag || editing || e.ctrlKey || reducedMotion.matches || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
  const top = scroller.scrollTop <= 0;
  const end = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
  const pulling = (e.deltaY < 0 && top) || (e.deltaY > 0 && end);
  if (!bounce.raw) {
    if (!pulling) return;
    // Molette à crans (grand saut d'un coup, par crans entiers) : elle ne tire pas la liste.
    if (e.deltaMode !== 0 || (Math.abs(e.deltaY) >= 50 && Math.abs(e.wheelDeltaY) >= 120 && Math.abs(e.wheelDeltaY) % 120 === 0)) return;
    if (bounce.anim) { try { bounce.anim.cancel(); } catch {} bounce.anim = null; }
  } else if (Math.sign(e.deltaY) === Math.sign(bounce.raw)) {
    // Défilement dans l'autre sens : la liste est rendue aussitôt.
    return bounceRelease();
  }
  // Ce qui a été tiré se relâche peu à peu (l'inertie du pavé s'éteint).
  bounce.raw = bounce.raw * 0.9 - e.deltaY;
  bounce.y = Math.sign(bounce.raw) * BOUNCE.max * (1 - 1 / ((Math.abs(bounce.raw) * BOUNCE.stiff) / BOUNCE.max + 1));
  scroller.style.translate = `0 ${bounce.y.toFixed(1)}px`;
  clearTimeout(bounce.timer);
  bounce.timer = setTimeout(bounceRelease, BOUNCE.idle);
  return undefined;
}, { passive: true });

// --- Redimensionnement ------------------------------------------------------
const HIDE_AT = 100; // tirer le bord en deçà (px) masque la barre
$('resize').addEventListener('pointerdown', (e) => {
  const el = e.currentTarget;
  el.setPointerCapture(e.pointerId);
  document.body.classList.add('no-anim');
  let frame = 0;
  let x = e.clientX;
  const before = S ? S.sidebar.width : 0;
  const move = (ev) => {
    x = ev.clientX;
    // Tiré tout à gauche : la barre se masque, le geste s'arrête là ; elle
    // reviendra à la largeur qu'elle avait avant.
    if (x < HIDE_AT && S && S.sidebar.visible) {
      cancelAnimationFrame(frame);
      up();
      try { el.releasePointerCapture(e.pointerId); } catch {}
      if (before) send('sidebarWidth', before);
      send('toggleSidebar');
      return;
    }
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; send('sidebarWidth', x); });
  };
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    document.body.classList.remove('no-anim');
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
});

// Double-clic sur le bord : retour à la largeur par défaut.
$('resize').addEventListener('dblclick', () => send('sidebarWidthReset'));

// --- Petite barre des volets d'une vue scindée -------------------------------
// Une par volet, au-dessus de sa page : adresse (clic : la modifier), « ⋯ »
// (déplacer, agrandir, séparer…), « × » (fermer le volet). Un liseré entoure le
// volet actif.
function drawPanes(list) {
  const box = $('pane-bars');
  const ring = $('pane-ring');
  while (box.children.length > list.length) box.lastChild.remove();
  const active = list.find((p) => p.active);
  ring.classList.toggle('on', !!active);
  if (active) ring.style.cssText = `left:${active.x}px;top:${active.y}px;width:${active.w}px;height:${active.h}px`;
  list.forEach((p, i) => {
    let bar = box.children[i];
    if (!bar) {
      bar = document.createElement('div');
      bar.innerHTML = '<button class="pane-url"></button><button class="pb" data-pane="menu"><svg class="i"><use href="#i-more"/></svg></button><button class="pb" data-pane="close"><svg class="i"><use href="#i-x"/></svg></button>';
      box.appendChild(bar);
    }
    bar.className = 'pane-bar' + (p.active ? ' active' : '');
    bar.dataset.pane = p.id;
    bar.style.cssText = `left:${p.x}px;top:${p.y}px;width:${p.w}px`;
    const text = p.internal ? (p.title || '') : (S && S.fullUrl === false ? host(p.url) : (p.url || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''));
    const url = bar.firstChild;
    const sig = (p.favicon || '') + '|' + text;
    if (url.dataset.sig !== sig) {
      url.dataset.sig = sig;
      url.textContent = '';
      url.appendChild(faviconEl(p.favicon, host(p.url) || p.title || '?'));
      const span = document.createElement('span');
      span.className = 'pane-text';
      // Page web : domaine en avant, nom d'hôte jamais coupé par la droite (common.js).
      if (p.internal) span.textContent = text; else addressInto(span, text);
      url.appendChild(span);
    }
    url.title = p.internal ? '' : p.url;
    bar.children[1].title = t('pane.options');
    bar.children[2].title = t('view.closeSplit');
  });
}
$('pane-bars').addEventListener('click', (e) => {
  const bar = e.target.closest('.pane-bar');
  if (!bar) return;
  const b = e.target.closest('[data-pane]');
  const what = b && b !== bar ? b.dataset.pane : 'edit';
  send(what === 'menu' ? 'paneMenu' : (what === 'close' ? 'paneClose' : 'paneEdit'), bar.dataset.pane);
});
$('pane-bars').addEventListener('contextmenu', (e) => {
  const bar = e.target.closest('.pane-bar');
  if (!bar) return;
  e.preventDefault();
  send('paneMenu', bar.dataset.pane);
});

// --- Largeur des volets d'une vue scindée -----------------------------------
let splitDrag = false;
$('dividers').addEventListener('pointerdown', (e) => {
  const h = e.target.closest('.divider');
  if (!h) return;
  h.setPointerCapture(e.pointerId);
  splitDrag = true;
  h.classList.add('on');
  const i = Number(h.dataset.i);
  let frame = 0;
  const vertical = h.classList.contains('v');
  let x = vertical ? e.clientY : e.clientX;
  const move = (ev) => {
    x = vertical ? ev.clientY : ev.clientX;
    if (vertical) h.style.top = (x - 4) + 'px'; else h.style.left = (x - 4) + 'px';
    // 30 envois par seconde suffisent : au-delà, la page ne se remet pas en page plus vite.
    if (!frame) frame = setTimeout(() => { frame = 0; send('splitResize', { i, at: x }); }, 33);
  };
  const up = () => {
    h.removeEventListener('pointermove', move);
    h.removeEventListener('pointerup', up);
    h.classList.remove('on');
    splitDrag = false;
    send('splitResize', { i, at: x });
  };
  h.addEventListener('pointermove', move);
  h.addEventListener('pointerup', up);
});

// --- Glisser-déposer --------------------------------------------------------
// Dans les listes, les lignes voisines s'écartent pour montrer où l'onglet va
// tomber (transformations seulement : la mise en page ne change pas pendant le
// geste). Dans la grille des favoris, un trait vertical marque la position.
const line = $('drop-line');
const ROW_SLOT = 41; // place d'une ligne (37 + 4), quand rien n'est emporté des listes
let geom = null; // relevé des listes, fait une fois par glisser (voir measure)
let target = null; // destination affichée
let intoEl = null; // dossier mis en évidence

// Ordre et forme des listes : sert à savoir si un nouvel état les a changées.
// Calculée une fois par état (jusqu'à trois lectures par rendu).
const structSigs = new WeakMap();
function structSig(s) {
  let sig = structSigs.get(s);
  if (sig === undefined) structSigs.set(s, sig = structSigOf(s));
  return sig;
}
function structSigOf(s) {
  let out = String(s.activeId);
  const walk = (list) => {
    for (const it of list) {
      out += '/' + it.id + (it.grouped ? '~' : '');
      if (it.children) { out += it.open ? '[' : '('; walk(it.children); out += ']'; }
    }
  };
  for (const list of [s.favorites, s.pinned, s.today]) { out += '|'; walk(list); }
  return out;
}

// Mène à leur terme les animations qui déplacent encore des lignes : retour
// après un glisser abandonné, ligne qui apparaît ou se replie, ressort de la
// ligne pressée. Le relevé lit la position des lignes à l'écran ; fait au milieu
// d'une de ces animations (geste enchaîné, machine chargée), il plaçait les
// lignes là où elles n'étaient que de passage, et le dépôt tombait à côté.
function settleRows() {
  bounceReset(); // le rebond élastique décale toute la liste
  for (const a of scroller.getAnimations({ subtree: true })) {
    if (a.transitionProperty === 'transform' || a.animationName === 'row-in' || a.animationName === 'row-out' || a.id === FLIP.id) {
      try { a.finish(); } catch {}
    }
  }
}

// Relevé fait au premier survol : chaque ligne visible des épinglés et
// d'Aujourd'hui (et ce qui les sépare), de haut en bas, avec sa position dans
// le contenu défilant. Ensuite le glisser ne lit plus la mise en page : il
// compare le pointeur à ces positions, quel que soit le nombre de lignes.
function measure() {
  settleRows();
  const sr = scroller.getBoundingClientRect();
  const scroll = scroller.scrollTop;
  const base = sr.top - scroll;
  const flow = [];
  const dragged = new Set(drag.ids || [drag.id]);
  const add = (el, gap, origin) => {
    const r = el.getBoundingClientRect();
    if (!r.height) return false;
    // Hauteur de mise en page, pas la hauteur affichée : la ligne qu'on saisit
    // est légèrement rétrécie (état pressé), ce qui fausserait la place à ouvrir.
    const h = el.offsetHeight || r.height;
    flow.push({ el, top: r.top - (h - r.height) / 2 - base, h, size: h + gap, origin, off: 0 });
    return true;
  };
  const scan = (el, to, folderId, inOrigin) => {
    const r = el.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(el).rowGap) || 0;
    const zone = { to, folderId, top: r.top - base, bottom: r.bottom - base, left: r.left, width: r.width, gap, kids: [], count: 0, end: 0 };
    let i = -1;
    for (const child of el.children) {
      // Ligne fermée qui finit de se replier : elle n'est plus dans la liste et
      // ne compte pas dans les positions.
      if (child.classList.contains('out')) continue;
      i += 1;
      const key = child.dataset.key;
      const origin = inOrigin || (!!key && dragged.has(key));
      const a = flow.length;
      if (child.classList.contains('folder')) {
        if (!add(child._head, gap, origin)) continue;
        const fr = child.getBoundingClientRect();
        const kid = { i, a, top: fr.top - base, bottom: fr.bottom - base, head: flow[a], id: key, el: child, sub: null };
        if (child._children.getBoundingClientRect().height) kid.sub = scan(child._children, 'folder', key, origin);
        zone.kids.push(kid);
      } else if (add(child, gap, origin)) {
        zone.kids.push({ i, a, top: flow[a].top, bottom: flow[a].top + flow[a].h });
      }
    }
    zone.count = i + 1;
    zone.end = flow.length;
    return zone;
  };
  const pinned = scan($('pinned'), 'pinned', null, false);
  add($('divider'), 0, false);
  add($('b-newtab'), 0, false);
  const today = scan($('today'), 'today', null, false);
  // cum[k] : place libérée, au-dessus de la ligne k, par les lignes emportées.
  const cum = new Float64Array(flow.length + 1);
  for (let k = 0; k < flow.length; k++) cum[k + 1] = cum[k] + (flow[k].origin ? flow[k].size : 0);
  geom = { top: sr.top, scroll, flow, pinned, today, cum, total: cum[flow.length] || ROW_SLOT };
}

// Écarte les lignes pour ouvrir une place de hauteur `room` devant la ligne `gi`
// du relevé ; les lignes emportées laissent la leur. `null` : tout revient en
// place. Seules les lignes dont le décalage change sont touchées.
function part(gi, room) {
  const { flow, cum } = geom;
  for (let k = 0; k < flow.length; k++) {
    const f = flow[k];
    const off = gi === null || f.origin ? 0 : (k >= gi ? room : 0) - cum[k];
    if (off !== f.off) {
      f.off = off;
      f.el.style.transform = off ? `translateY(${off}px)` : '';
    }
  }
}

// Abandonne le relevé (les listes ont changé) : les lignes reprennent leur place.
function dropGeom() {
  if (!geom) return;
  part(null);
  geom = null;
  showTarget(null);
}

// Affiche la destination : dossier mis en évidence, lignes écartées et place
// libre, ou trait dans la grille des favoris.
function showTarget(t) {
  const same = t === target || (t && target && t.to === target.to && t.folderId === target.folderId && t.index === target.index && t.into === target.into && !t.pos && t.g === target.g);
  if (same) return;
  target = t;
  const into = (t && t.into) || null;
  if (into !== intoEl) {
    if (intoEl) intoEl.classList.remove('drop-into');
    if (into) into.classList.add('drop-into');
    intoEl = into;
  }
  if (geom) part(t && t.g != null ? t.g : null, t ? t.room : 0);
  if (t && t.slot) placeSlot();
  else if (t && t.pos) {
    const p = t.pos;
    line._size = '';
    line.className = 'v';
    line.style.cssText = `display:block;left:${p.x}px;top:${p.y}px;height:${p.h}px`;
  } else if (line._size !== '-') {
    line._size = '-';
    line.style.display = 'none';
  }
}

// Place libre entre les lignes écartées (suit le défilement de la liste). Tant
// que sa taille ne change pas, seule sa transformation est modifiée : la mise en
// page n'est pas touchée.
function placeSlot() {
  const s = target.slot;
  const move = `translate(${s.x}px,${Math.round(s.y + geom.top - geom.scroll)}px)`;
  const size = `display:block;width:${s.w}px;height:${s.h}px;transform:`;
  if (line._size === size) line.style.transform = move;
  else { line._size = size; line.className = 'slot'; line.style.cssText = size + move; }
}
scroller.addEventListener('scroll', () => {
  if (!geom) return;
  geom.scroll = scroller.scrollTop;
  if (target && target.slot) placeSlot();
}, { passive: true });
scroller.addEventListener('scroll', offViewSoon, { passive: true });

function endDrag() {
  if (!drag) return;
  clearTimeout(drag.timer);
  const settled = drag.settling;
  if (!settled && !drag.space) send('dragZone', false);
  zoneOn = false;
  // Dépôt accepté : les lignes sont déjà à leur place définitive, on retire les
  // décalages sans animation. Abandon : elles reviennent en glissant.
  const b = document.body;
  if (settled) b.classList.remove('parting');
  else setTimeout(() => { if (!drag) b.classList.remove('parting'); }, 180);
  if (geom) part(null);
  geom = null;
  showTarget(null);
  b.classList.remove('dragging');
  for (const el of document.querySelectorAll('.dragging-self')) el.classList.remove('dragging-self');
  // Sans « parting », les lignes gardent la transition de leur état pressé : le
  // décalage qu'on vient de retirer s'animerait quand même (les lignes, déjà à
  // leur place, sautaient d'un cran puis revenaient). On coupe court.
  if (settled) settleRows();
  drag = null;
}

sidebar.addEventListener('dragstart', (e) => {
  // Pastille d'un Espace : on la glisse pour réordonner les Espaces.
  const dot = e.target.closest('#spaces [data-space]');
  if (dot) {
    if (editing || drag || !S || S.incognito) return e.preventDefault();
    drag = { space: dot.dataset.space };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-orbe-space', dot.dataset.space);
    requestAnimationFrame(() => { if (drag && drag.space) dot.classList.add('dragging-self'); });
    return undefined;
  }
  const row = e.target.closest('[data-id]');
  if (!row || editing || drag) return e.preventDefault();
  const item = row.dataset.folder ? row.parentElement : row;
  // Glisser une ligne sélectionnée emporte toute la sélection, dans l'ordre affiché ;
  // glisser une autre ligne abandonne la sélection.
  const many = !row.dataset.folder && sel.size > 1 && sel.has(row.dataset.id) ? visibleTabIds().filter((id) => sel.has(id)) : null;
  if (sel.size && !many) setSel([]);
  drag = { id: row.dataset.id, folder: !!row.dataset.folder, ids: many && many.length > 1 ? many : null };
  if (drag.ids) dragGhost(e, row, drag.ids.length);
  // « copyMove » : ⌥ pendant le glisser dépose une copie (voir `drop`).
  e.dataTransfer.effectAllowed = 'copyMove';
  e.dataTransfer.setData('text/plain', row.dataset.id);
  e.dataTransfer.setData('application/x-orbe-item', row.dataset.id);
  // Les zones de dépôt ne s'agrandissent qu'après le départ du glisser :
  // déplacer la ligne saisie pendant « dragstart » annule le geste.
  requestAnimationFrame(() => {
    if (!drag || drag.settling) return;
    if (drag.ids) for (const id of drag.ids) { const el = rowOf(id); if (el) el.classList.add('dragging-self'); }
    item.classList.add('dragging-self');
    document.body.classList.add('dragging', 'parting');
    dropGeom(); // les zones vides viennent de s'agrandir : relevé à refaire
    if (!drag.folder) send('dragZone', true);
  });
  return undefined;
});
// Fin d'un glisser que personne n'a accepté. Onglet lâché hors de la fenêtre : il part
// dans une nouvelle fenêtre (ou dans l'autre fenêtre d'Orbe qui se trouve dessous) ; le
// processus principal le vérifie avec la position réelle du pointeur.
sidebar.addEventListener('dragend', (e) => {
  if (!drag || drag.settling) return;
  const d = drag;
  const out = !d.folder && !d.space && e.dataTransfer.dropEffect === 'none'
    && (e.clientX < 0 || e.clientY < 0 || e.clientX > innerWidth || e.clientY > innerHeight);
  endDrag();
  if (out && S && !S.incognito && !S.blank) send('tearOff', { ids: d.ids || [d.id] });
});

// Image du glisser pour une sélection : la ligne saisie, une carte derrière
// elle et le nombre d'onglets emportés. Posée hors de l'écran, le temps que le
// système en prenne une copie.
function dragGhost(e, row, n) {
  const r = row.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.style.width = (r.width + 10) + 'px';
  const copy = row.cloneNode(true);
  copy.removeAttribute('data-id');
  copy.removeAttribute('data-key');
  copy.classList.remove('sel', 'active', 'shown');
  const badge = document.createElement('span');
  badge.className = 'count';
  badge.textContent = String(n);
  ghost.append(copy, badge);
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, e.clientX - r.left, e.clientY - r.top + 8);
  setTimeout(() => ghost.remove(), 0);
}

// Grille des favoris : position parmi les tuiles et trait vertical.
function gridTarget(e, zone) {
  if (drag.folder) return null;
  const kids = [...zone.children];
  let index = kids.length;
  let rect = null;
  for (let i = 0; i < kids.length; i++) {
    const r = kids[i].getBoundingClientRect();
    if ((e.clientY < r.bottom && e.clientX < r.left + r.width / 2) || e.clientY < r.top) { index = i; rect = r; break; }
  }
  const zr = zone.getBoundingClientRect();
  const last = kids.length ? kids[kids.length - 1].getBoundingClientRect() : zr;
  const pos = rect ? { x: rect.left - 4, y: rect.top, h: rect.height } : { x: (kids.length ? last.right + 2 : zr.left), y: last.top, h: last.height || 40 };
  return { to: 'favorites', folderId: null, index, pos };
}

// Listes : destination d'après le relevé. `y` est dans le contenu défilant.
function listTarget(y) {
  const g = geom;
  // Tant que le pointeur reste dans la place ouverte, la destination ne change pas.
  if (target && target.slot && y >= target.slot.y && y < target.slot.y + target.slot.h + 4) return target;
  // Épinglés vides : la liste n'a pas de hauteur, on vise du nom de l'Espace au séparateur.
  const none = g.pinned.kids.length ? 0 : 1;
  let zone = y >= g.pinned.top - 30 * none && y < g.pinned.bottom + 11 * none ? g.pinned : g.today;
  for (;;) {
    let kid = null;
    for (const k of zone.kids) { if (k.top > y) break; kid = k; }
    if (!kid || !kid.head || y >= kid.bottom) break;
    // Un dossier ne se dépose ni dans lui-même ni dans l'un de ses sous-dossiers.
    const own = drag.folder && kid.id === drag.id;
    const h = kid.head;
    // Sur l'en-tête d'un dossier : dépose dedans.
    if (!own && y > h.top + h.h * 0.25 && y < h.top + h.h * 0.75) return { to: 'folder', folderId: kid.id, into: kid.el, g: null };
    if (!kid.sub || y < kid.sub.top || y >= kid.sub.bottom) break;
    if (own) return null;
    zone = kid.sub;
  }
  // Un dossier se dépose dans les épinglés ou dans un autre dossier.
  if (drag.folder && zone.to === 'today') return null;
  let index = zone.count;
  let hit = null;
  for (const k of zone.kids) { if (y < (k.top + k.bottom) / 2) { index = k.i; hit = k; break; } }
  const t = { to: zone.to, folderId: zone.folderId, index, g: hit ? hit.a : zone.end, room: g.total };
  const lastKid = zone.kids[zone.kids.length - 1];
  const pad = zone.to === 'folder' ? 4 : 0;
  // Liste vide : elle a déjà un peu de hauteur, et la première ligne n'ajoute pas d'écart.
  if (!lastKid) t.room -= zone.bottom - zone.top - pad + 4;
  const natural = hit ? g.flow[hit.a].top : (lastKid ? lastKid.bottom + zone.gap : zone.top + pad);
  t.slot = { x: zone.left, w: zone.width, y: natural - g.cum[t.g], h: g.total - 4 };
  return t;
}

// Dépôt sur l'en-tête d'un dossier : il ne s'ouvre pas, son icône rebondit une fois
// (transformation seulement) pour dire que l'onglet y est entré.
function dropPulse(folderEl) {
  const ic = folderEl && folderEl._head && folderEl._head.querySelector('.ic');
  if (!ic || reducedMotion.matches) return;
  ic.animate({ transform: ['scale(1)', 'scale(1.35)', 'scale(1)'] }, { duration: 280, easing: SPRING.easing, id: 'drop-pulse' });
}

// Pastilles des Espaces : rang où tomberait l'Espace glissé, et trait vertical.
function spaceTarget(e) {
  if (!e.target.closest('#bottom')) return null;
  const kids = [...$('spaces').children];
  if (!kids.length) return null;
  let index = kids.length;
  let rect = null;
  for (let i = 0; i < kids.length; i++) {
    const r = kids[i].getBoundingClientRect();
    if (e.clientX < r.left + r.width / 2) { index = i; rect = r; break; }
  }
  const last = kids[kids.length - 1].getBoundingClientRect();
  return { space: true, index, pos: { x: rect ? rect.left - 1 : last.right, y: last.top + 3, h: last.height - 6 } };
}

// Calcule la destination sous le pointeur : liste, position et repère visuel.
function dropTarget(e) {
  if (drag.space) return spaceTarget(e);
  // Onglet au-dessus de la pastille d'un autre Espace : il y sera déplacé.
  const dot = e.target.closest('#spaces [data-space]');
  if (dot) return drag.folder || dot.dataset.space === S.space.id ? null : { toSpace: dot.dataset.space, into: dot, g: null };
  const fav = e.target.closest('#fav');
  if (fav) return gridTarget(e, fav);
  if (!e.target.closest('#scroll')) return null;
  if (!geom) measure();
  return listTarget(e.clientY - geom.top + geom.scroll);
}

// Au-dessus de la page : lâcher l'onglet crée une vue scindée. Pendant un
// glisser, c'est la coque qui reçoit les événements, même au-dessus des pages.
const overPage = (e) => !!drag && !drag.settling && !drag.folder && !drag.space && !!S && S.sidebar.visible && !!S.activeId && e.clientX > S.sidebar.width + 12;
// Le côté visé (moitié gauche ou droite du volet survolé) est éclairé par la zone
// de dépôt : le processus principal le calcule d'après le point transmis.
let zoneOn = false;
let zoneKey = '';
function setZone(on, e) {
  // Un envoi par moitié de volet traversée, pas un par mouvement.
  const key = on && e ? zoneKeyAt(e.clientX, e.clientY) : '';
  if (on === zoneOn && key === zoneKey) return;
  zoneOn = on;
  zoneKey = key;
  send('dragZoneOver', on && e ? { x: e.clientX, y: e.clientY, id: drag ? drag.id : '' } : false);
}
function zoneKeyAt(x, y) {
  const panes = (S && S.panes) || [];
  const p = panes.find((q) => x >= q.x && x < q.x + q.w + 8 && y >= q.y && y < q.y + q.h + 8);
  // Page seule : quatre côtés ; la hauteur est découpée en huit bandes, le processus principal tranche.
  if (!p) return (x < (S.sidebar.width + innerWidth) / 2 ? 'g' : 'd') + Math.floor((8 * y) / Math.max(1, innerHeight));
  const stacked = panes.length > 1 && panes[0].x === panes[1].x;
  return p.id + (stacked ? (y < p.y + p.h / 2 ? 'h' : 'b') : (x < p.x + p.w / 2 ? 'g' : 'd'));
}
// « dragenter » compte autant que « dragover » : quand l'élément sous le pointeur
// change (une ligne qui s'écarte suffit), le moteur n'envoie que « dragenter »,
// et un lâcher à cet instant serait refusé si lui seul n'acceptait pas le dépôt.
function overDocument(e) {
  if (!overPage(e)) return setZone(false);
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  showTarget(null);
  return setZone(true, e);
}
document.addEventListener('dragover', overDocument, true);
document.addEventListener('dragenter', overDocument, true);
document.addEventListener('drop', (e) => {
  if (!overPage(e)) return;
  e.preventDefault();
  e.stopPropagation();
  const id = drag.id;
  // Le dépôt d'abord : la zone, encore affichée, y fait rebondir la bulle de l'onglet.
  send('dropSplit', { id, x: e.clientX, y: e.clientY });
  endDrag();
}, true);

function overSidebar(e) {
  if (overPage(e) || (drag && drag.settling)) return;
  if (!drag) {
    const types = [...e.dataTransfer.types];
    // Ligne venue d'une autre fenêtre d'Orbe : cette fenêtre va l'afficher.
    if (types.includes('application/x-orbe-item')) {
      if (!S || S.incognito || S.blank) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      return;
    }
    // Adresse ou texte venu d'ailleurs.
    if (!types.some((x) => x === 'text/uri-list' || x === 'text/plain')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    return;
  }
  const t = dropTarget(e);
  showTarget(t);
  if (!t) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = copying(e, t) ? 'copy' : 'move';
}
// ⌥glisser un onglet : il est dupliqué à l'endroit du dépôt (ni dossier, ni autre Espace).
const copying = (e, t) => e.altKey && !drag.folder && !drag.space && !t.toSpace;
sidebar.addEventListener('dragover', overSidebar);
sidebar.addEventListener('dragenter', overSidebar);

sidebar.addEventListener('drop', (e) => {
  if (overPage(e)) return undefined;
  e.preventDefault();
  if (!drag) {
    // Ligne venue d'une autre fenêtre Orbe : ce n'est pas une adresse ; l'onglet s'affiche ici
    // (le processus principal vérifie l'identifiant et la fenêtre d'où il vient).
    if ([...e.dataTransfer.types].includes('application/x-orbe-item')) {
      const id = e.dataTransfer.getData('application/x-orbe-item');
      if (id && S && !S.incognito && !S.blank) send('adoptTab', String(id).slice(0, 80));
      return undefined;
    }
    const url = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '').split('\n')[0].trim();
    if (url) send('dropUrl', url);
    return undefined;
  }
  if (drag.settling) return undefined;
  const t = dropTarget(e);
  if (!t) return endDrag();
  if (drag.space) { send('moveSpace', { id: drag.space, index: t.index }); return endDrag(); }
  if (t.toSpace) { send('moveToSpace', { ...(drag.ids ? { ids: drag.ids } : { id: drag.id }), spaceId: t.toSpace }); return endDrag(); }
  showTarget(t);
  if (t.into) dropPulse(t.into);
  send('move', { ...(drag.ids ? { ids: drag.ids } : { id: drag.id }), to: t.to, folderId: t.folderId, index: t.index, ...(copying(e, t) ? { copy: true } : {}) });
  // Lâché à sa propre place, ou rien d'emporté dans les listes (tuile de favori) : fin immédiate.
  if (!geom) measure();
  const still = !!t.slot && t.g !== null && geom.flow.every((f) => !f.off);
  if (still || !geom.flow.some((f) => f.origin)) return endDrag();
  // Sinon les lignes restent écartées, et la ligne emportée masquée, jusqu'à
  // l'état suivant, qui les trouve à leur place définitive : pas d'aller-retour visible.
  send('dragZone', false);
  drag.settling = structSig(S);
  drag.timer = setTimeout(endDrag, 400);
  return undefined;
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && drag) { if (!drag.settling) endDrag(); }
  else if (e.key === 'Escape' && sel.size) setSel([]);
  // Suppr ou Retour arrière, la barre latérale ayant le clavier : archive la sélection.
  else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size && !editingNow()) {
    e.preventDefault();
    send('close', { ids: [...sel] });
  }
});

// --- Infobulles maison ---------------------------------------------------------
// Un bouton de la barre survolé une demi-seconde montre son nom et le raccourci en
// vigueur (celui que l'utilisateur a choisi, s'il l'a changé). L'infobulle reste
// dans la barre latérale : les pages sont posées par-dessus le reste de la fenêtre.
const TIP_DELAY = 500;
const tipEl = $('tip');
let tipFor = null;
let tipTimer = null;
function tipHide() {
  clearTimeout(tipTimer);
  tipFor = null;
  if (tipEl.hidden) return;
  tipEl.classList.remove('on');
  tipEl.hidden = true;
}
function tipShow(el) {
  if (!el.isConnected || el.disabled || drag) return;
  // « Actualiser » devient « Arrêter » pendant le chargement, comme son icône.
  const stop = el.id === 'b-reload' && S && S.nav.loading;
  $('tip-text').textContent = t(stop ? 'view.stop' : el.dataset.tip);
  const keys = (stop ? KEYS.stop : KEYS[el.dataset.tipKey]) || '';
  $('tip-key').textContent = keys;
  $('tip-key').hidden = !keys;
  tipEl.hidden = false;
  const r = el.getBoundingClientRect();
  const w = tipEl.offsetWidth;
  const h = tipEl.offsetHeight;
  const right = (FLOATING || !S || !S.sidebar.visible ? innerWidth : Math.min(innerWidth, S.sidebar.width)) - 6;
  const x = Math.max(6, Math.min(right - w, r.left + r.width / 2 - w / 2));
  const y = r.bottom + 6 + h > innerHeight - 4 ? r.top - h - 6 : r.bottom + 6;
  tipEl.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  tipEl.classList.add('on');
}
document.addEventListener('mouseover', (e) => {
  const el = e.target.closest ? e.target.closest('[data-tip]') : null;
  if (el === tipFor) return;
  tipHide();
  if (!el) return;
  tipFor = el;
  tipTimer = setTimeout(() => { if (tipFor === el) tipShow(el); }, TIP_DELAY);
});
for (const ev of ['mousedown', 'keydown', 'wheel', 'dragstart', 'blur']) addEventListener(ev, tipHide, true);
// Le pointeur quitte le bouton : l'infobulle s'efface, même s'il passe sur un bouton
// grisé (qui ne signale aucun survol).
document.addEventListener('mouseout', (e) => { if (tipFor && e.target.closest && e.target.closest('[data-tip]') === tipFor && !(e.relatedTarget && tipFor.contains(e.relatedTarget))) tipHide(); });
document.addEventListener('mouseleave', tipHide);

// Pointeur posé 150 ms sur un onglet en veille : le processus principal prépare
// la connexion à son site, pour un réveil plus rapide au clic.
let hoverId = null;
let hoverTimer = null;
sidebar.addEventListener('mouseover', (e) => {
  const row = e.target.closest ? e.target.closest('.row.tab, .tile') : null;
  const id = row && !row.classList.contains('live') && !drag ? row.dataset.id : null;
  if (id === hoverId) return;
  hoverId = id || null;
  clearTimeout(hoverTimer);
  if (id) hoverTimer = setTimeout(() => { if (hoverId === id) send('hoverTab', id); }, 150);
});
sidebar.addEventListener('mouseleave', () => { hoverId = null; clearTimeout(hoverTimer); });

// Niveau de la batterie : relevé ici (le processus principal n'y a pas accès) et transmis à
// chaque changement, pour l'économie de batterie (veille.js). Absent sur un poste fixe : rien.
if (!FLOATING && navigator.getBattery) {
  navigator.getBattery().then((b) => {
    const tell = () => send('battery', { level: b.level, charging: b.charging });
    b.addEventListener('levelchange', tell);
    b.addEventListener('chargingchange', tell);
    tell();
  }).catch(() => {});
}

O.on('state', onState);
// Renommer pendant un glissement (nouvel Espace) : après l'arrivée.
O.on('edit', (id) => (slide && slide.commit ? slide.after.push(() => startRename(id)) : startRename(id)));
// Sons d'interface (fichiers originaux, src/renderer/sons).
// Chaque son est chargé à sa première demande, puis rejoué depuis le début.
// `mute` (pendant les essais) : le fichier est chargé, rien n'est joué.
const sounds = {};
O.on('sound', (p) => {
  const { name, volume = 0.5, mute = false } = typeof p === 'string' ? { name: p } : (p || {});
  if (!/^[a-z-]+$/.test(String(name))) return;
  const a = sounds[name] || (sounds[name] = new Audio(`sons/${name}.wav`));
  a.volume = Math.max(0, Math.min(1, Number(volume) || 0));
  if (mute) { a.load(); return; }
  a.currentTime = 0;
  a.play().catch(() => {});
});
send('ready');
