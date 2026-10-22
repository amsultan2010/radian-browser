// Lecteurs miniatures de la barre latérale : un par onglet qui joue hors de vue.
// Chargé avant shell.js, qui appelle `renderPlayers(liste)` à chaque état.
//
// Tout ce qui vient de la page (titre, artiste) est posé par `textContent` ; la
// pochette est une image recodée par le processus principal (src/main/media.js).
// Mouvements : transformations et opacité seulement — le titre trop long défile
// un aller-retour, la barre d'avancement avance par pas, les commandes remplacent
// le titre au survol. Au repos, aucune animation ne tourne (rien n'est composé).
(() => {
  const act = (id, name, value) => O.send('mediaAct', { id, act: name, value });
  const svg = (name) => `<svg class="i"><use href="#i-${name}"/></svg>`;
  const cards = new Map(); // id -> élément
  const FINE = { dead: 14, per: 34 }; // recherche fine : au-delà de `dead` px au-dessus, la vitesse est divisée par 1 + d / `per`

  function button(cls, iconName, key, onClick) {
    const b = document.createElement('button');
    b.className = cls;
    b.innerHTML = svg(iconName); // noms d'icônes fixes, écrits ici
    b.title = t(key);
    b.dataset.key = key;
    b.onclick = (e) => { e.stopPropagation(); onClick(); };
    return b;
  }

  function build(p) {
    const el = document.createElement('div');
    el.className = 'mp';
    el.dataset.id = p.id;
    const open = document.createElement('button');
    open.className = 'mp-open';
    open.title = t('media.open');
    open.onclick = () => act(p.id, 'open');
    const art = document.createElement('span');
    art.className = 'mp-art';
    const text = document.createElement('span');
    text.className = 'mp-text';
    const title = document.createElement('span');
    title.className = 'mp-title';
    const inner = document.createElement('span');
    title.appendChild(inner);
    const sub = document.createElement('span');
    sub.className = 'mp-sub';
    text.append(title, sub);
    open.append(art, text);
    const ctl = document.createElement('div');
    ctl.className = 'mp-ctl';
    const prev = button('ib mp-prev', 'prev', 'media.prev', () => act(p.id, 'prev'));
    const back = button('ib mp-back', 'back15', 'media.back', () => act(p.id, 'back'));
    const fwd = button('ib mp-fwd', 'fwd15', 'media.forward', () => act(p.id, 'forward'));
    const next = button('ib mp-next', 'next', 'media.next', () => act(p.id, 'next'));
    const mute = button('ib mp-mute', 'sound', 'media.mute', () => act(p.id, 'mute'));
    ctl.append(prev, back, fwd, next, mute);
    const play = button('ib mp-play', 'pause', 'media.pause', () => act(p.id, 'toggle'));
    const x = button('mp-x', 'x', 'media.close', () => act(p.id, 'close'));
    const bar = document.createElement('div');
    bar.className = 'mp-bar';
    const fill = document.createElement('i');
    bar.appendChild(fill);
    el.append(open, ctl, play, x, bar);
    el._ = { art, title, inner, sub, prev, back, fwd, next, mute, play, bar, fill };
    scrub(el, bar);
    el.addEventListener('pointerleave', () => replay(el));
    volume(el, mute);
    return el;
  }

  // Barre d'avancement : glisser pour chercher ; plus le pointeur monte au-dessus
  // de la barre, plus la recherche est fine.
  function scrub(el, bar) {
    let s = null;
    const ratio = (e) => { const r = bar.getBoundingClientRect(); return { r, v: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) }; };
    bar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !el._p || !el._p.duration) return;
      const { r, v } = ratio(e);
      s = { v, x: e.clientX, top: r.top, width: r.width };
      bar.setPointerCapture(e.pointerId);
      el.classList.add('scrub');
      show(el, v);
      e.preventDefault();
    });
    bar.addEventListener('pointermove', (e) => {
      if (!s) return;
      const up = Math.max(0, s.top - e.clientY - FINE.dead);
      const speed = 1 / (1 + up / FINE.per);
      s.v = Math.max(0, Math.min(1, s.v + ((e.clientX - s.x) / s.width) * speed));
      s.x = e.clientX;
      el.dataset.fine = speed < 1 ? speed.toFixed(2) : '';
      el.classList.toggle('fine', speed < 1);
      show(el, s.v);
    });
    const end = (e) => {
      if (!s) return;
      const v = s.v;
      s = null;
      el.classList.remove('scrub', 'fine');
      if (e.type === 'pointerup' && el._p && el._p.duration) {
        el._p = { ...el._p, position: v * el._p.duration };
        progress(el, el._p, true);
        act(el.dataset.id, 'seek', el._p.position);
      } else progress(el, el._p, true);
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  }

  // Volume : défiler sur le haut-parleur, ou le tirer vers le haut ou le bas. Un
  // clic sans mouvement coupe le son, comme avant. Le niveau se lit sous l'icône.
  function volume(el, btn) {
    let drag = null;
    let sent = 0;
    let later = null;
    const set = (v) => {
      v = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
      if (!el._p || v === el._vol) return;
      level(el, v);
      el._volAt = performance.now(); // l'état reçu d'ici là ne ramène pas l'ancien niveau
      clearTimeout(later);
      const go = () => { sent = performance.now(); act(el.dataset.id, 'volume', el._vol); };
      if (performance.now() - sent > 60) go(); else later = setTimeout(go, 60);
    };
    btn.addEventListener('wheel', (e) => {
      if (!e.deltaY) return;
      e.preventDefault();
      set((el._vol == null ? 1 : el._vol) - Math.max(-0.12, Math.min(0.12, e.deltaY / 500)));
    }, { passive: false });
    btn.addEventListener('pointerdown', (e) => { if (e.button === 0) { drag = { y: e.clientY, v: el._vol == null ? 1 : el._vol, moved: false }; btn.setPointerCapture(e.pointerId); } });
    btn.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dy = drag.y - e.clientY;
      if (!drag.moved && Math.abs(dy) < 4) return;
      drag.moved = true;
      el.classList.add('vol');
      set(drag.v + dy / 70);
    });
    const end = () => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      el.classList.remove('vol');
      // Le relâchement d'un glisser n'est pas un clic : le son n'est pas coupé.
      if (moved) btn.addEventListener('click', (e) => { e.stopImmediatePropagation(); e.preventDefault(); }, { capture: true, once: true });
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
  }
  function level(el, v) {
    el._vol = v;
    el._.mute.style.setProperty('--vol', String(v));
    el._.mute.classList.toggle('low', v < 1);
    el._.mute.dataset.vol = String(Math.round(v * 100));
  }

  function show(el, v) {
    el._.fill.style.transition = 'none';
    el._.fill.style.transform = `scaleX(${v.toFixed(4)})`;
  }

  // Avancement : posé à la position connue, puis avancé par petits pas (un point d'écran
  // environ, quatre fois par seconde au plus) par une minuterie. Le processus principal ne
  // renvoie une position que si elle s'écarte de celle-ci. Pas de transition étirée jusqu'à
  // la fin de la piste : une animation en cours, même d'un trait de 2 px, fait composer la
  // fenêtre entière à chaque image d'écran tant que dure la lecture (ENER-1 : 200 ms de
  // processeur graphique par seconde, contre 1 ms ainsi).
  const STEP = { points: 240, min: 250, max: 2000 }; // pas : durée / `points`, borné (ms)
  function step(el) {
    clearTimeout(el._tick);
    el._tick = 0;
    const g = el._prog;
    if (!g || !el.isConnected || el.classList.contains('scrub')) return;
    const pos = Math.min(g.duration, g.position + (g.playing ? (performance.now() - g.at) / 1000 : 0));
    el._.fill.style.transform = `scaleX(${Math.min(1, pos / g.duration).toFixed(4)})`;
    // Fenêtre masquée ou réduite : plus rien ne tourne ; `visibilitychange` relance.
    if (!g.playing || pos >= g.duration || document.hidden) return;
    el._tick = setTimeout(() => step(el), Math.max(STEP.min, Math.min(STEP.max, (g.duration / STEP.points) * 1000)));
  }
  function progress(el, p, force) {
    if (el.classList.contains('scrub')) return;
    const has = !!(p && p.duration);
    if (el._.bar.hidden === has) el._.bar.hidden = !has;
    if (!has) { el._prog = null; clearTimeout(el._tick); el._tick = 0; return; }
    const g = el._prog;
    const now = performance.now();
    if (!force && g && g.playing === !!p.playing && Math.abs(g.duration - p.duration) < 0.5
      && Math.abs(p.position - Math.min(p.duration, g.position + (g.playing ? (now - g.at) / 1000 : 0))) < 1.5) return;
    el._prog = { position: p.position, duration: p.duration, playing: !!p.playing, at: now };
    el._.fill.style.transition = 'none';
    step(el);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) for (const el of cards.values()) step(el); });

  // Titre plus long que sa place : il défile un aller-retour quand il apparaît ou change,
  // et de nouveau quand le pointeur quitte la carte, puis se repose (sauf mouvement réduit :
  // il ne défile pas). Un défilement sans fin coûtait autant que l'avancement (ENER-1).
  function marquee(el) {
    const { title, inner } = el._;
    requestAnimationFrame(() => {
      const over = Math.ceil(inner.scrollWidth - title.clientWidth);
      if (over > 4) {
        title.style.setProperty('--shift', -over + 'px');
        title.style.setProperty('--run', Math.round(4000 + over * 45) + 'ms');
        title.classList.add('run');
      } else title.classList.remove('run');
    });
  }
  function replay(el) {
    const { title, inner } = el._;
    if (!title.classList.contains('run') || inner.getAnimations().some((a) => a.playState === 'running')) return;
    title.classList.remove('run');
    void inner.offsetWidth; // l'animation repart de zéro
    title.classList.add('run');
  }

  function fill(el, p) {
    const _ = el._;
    el._p = p;
    const artKey = p.art || p.favicon || guessIcon(p.url) || '';
    if (el._art !== artKey) {
      el._art = artKey;
      _.art.textContent = '';
      _.art.classList.toggle('cover', !!p.art);
      const img = faviconEl(artKey, p.title);
      _.art.appendChild(img);
    }
    if (el._title !== p.title) {
      el._title = p.title;
      _.inner.textContent = p.title;
      _.title.classList.remove('run');
      marquee(el);
    }
    // Rien n'est réécrit qui n'ait changé : un état reçu ne coûte aucune mise en page.
    const key = [p.sub, p.playing, p.muted, p.prev, p.next, p.seek].join('\u0001');
    if (el._key !== key) {
      el._key = key;
      _.sub.textContent = p.sub || '';
      _.sub.hidden = !p.sub;
      el.classList.toggle('playing', !!p.playing);
      _.play.firstChild.firstChild.setAttribute('href', p.playing ? '#i-pause' : '#i-play');
      _.play.title = t(p.playing ? 'media.pause' : 'media.play');
      _.mute.firstChild.firstChild.setAttribute('href', p.muted ? '#i-mute' : '#i-sound');
      _.mute.title = t(p.muted ? 'media.unmute' : 'media.mute') + ' — ' + t('media.volume');
      _.prev.hidden = !p.prev;
      _.next.hidden = !p.next;
      _.back.hidden = !p.seek;
      _.fwd.hidden = !p.seek;
    }
    // Volume annoncé par la page — sauf pendant qu'on le règle ici (l'écho arrive après).
    if (el._vol !== p.volume && !(el._volAt && performance.now() - el._volAt < 1500)) level(el, typeof p.volume === 'number' ? p.volume : 1);
    progress(el, p);
  }

  window.renderPlayers = (list) => {
    const host = document.getElementById('media');
    const keep = new Set(list.map((p) => p.id));
    for (const [id, el] of cards) {
      if (keep.has(id)) continue;
      cards.delete(id);
      // Le lecteur s'efface sur place avant de laisser sa place.
      el.classList.add('out');
      const gone = () => { el.remove(); host.hidden = !host.children.length; };
      el.addEventListener('animationend', gone, { once: true });
      setTimeout(gone, 400);
    }
    list.forEach((p, i) => {
      let el = cards.get(p.id);
      if (!el) { el = build(p); cards.set(p.id, el); }
      fill(el, p);
      const at = [...host.children].filter((c) => !c.classList.contains('out'))[i];
      if (at !== el) host.insertBefore(el, at || null);
      // Carte neuve : remplie avant d'être posée, son avancement n'a pas pu démarrer.
      if (!el._tick) step(el);
    });
    const hide = !list.length && !host.children.length;
    if (list.length ? host.hidden : hide && !host.hidden) host.hidden = !list.length;
  };
})();
