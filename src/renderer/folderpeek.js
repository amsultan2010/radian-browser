// Survol d'un dossier replié : la liste de ses onglets, avec un champ pour y chercher
// (comme dans Arc). Un clic sur une ligne affiche l'onglet, sans ouvrir le dossier.
// Chargé après shell.js (`send`, `S`, `t`, `faviconEl`, `emojiEl`, `guessIcon`). Tout vient
// de l'état déjà reçu par la barre : aucun message nouveau vers le processus principal
// (« activate » est celui d'un clic sur une ligne). Les titres viennent des sites : ils ne
// sont posés que par textContent. Le panneau vit dans la barre latérale, par-dessus les
// lignes : il ne les déplace pas, et sa place est lue une fois les lignes au repos.
// Mouvements : transformation et opacité seulement.
(() => {
  const DWELL = 450; // survol avant l'ouverture (ms)
  const GRACE = 200; // le temps d'aller du dossier au panneau (ms)
  const MAX_H = 300; // hauteur maximale du panneau (px)
  const side = document.getElementById('sidebar');
  const pinned = document.getElementById('pinned');
  if (!side || !pinned) return;
  let panel = null; // { el, input, list, id, head, rows }
  let timer = null;
  let over = null; // ligne de dossier survolée

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const find = (nodes, id) => { for (const n of nodes) { if (n.type !== 'folder') continue; if (n.id === id) return n; const f = find(n.children, id); if (f) return f; } return null; };
  // Onglets du dossier, sous-dossiers compris (leur nom accompagne alors la ligne).
  const flat = (folder, path = []) => folder.children.flatMap((n) => (n.type === 'folder' ? flat(n, [...path, n.name]) : [{ tab: n, path: path.join(' › ') }]));
  const busy = () => document.body.classList.contains('dragging') || !!document.querySelector('input.rename') || document.getElementById('pager').classList.contains('sliding');

  function close(now) {
    clearTimeout(timer);
    timer = null;
    const p = panel;
    if (!p) return;
    panel = null;
    p.head.classList.remove('peeking');
    if (now) { p.el.remove(); return; }
    p.el.classList.add('out');
    const gone = () => p.el.remove();
    p.el.addEventListener('animationend', gone, { once: true });
    setTimeout(gone, 400);
  }

  function select(i) {
    if (!panel) return;
    const rows = [...panel.list.querySelectorAll('.fp-row')];
    panel.sel = rows.length ? Math.max(0, Math.min(rows.length - 1, i)) : -1;
    rows.forEach((r, k) => r.classList.toggle('sel', k === panel.sel));
    if (rows[panel.sel]) rows[panel.sel].scrollIntoView({ block: 'nearest' });
  }

  function draw() {
    const q = fold(panel.input.value.trim());
    panel.list.textContent = '';
    const rows = panel.rows.filter((r) => !q || fold(r.tab.customTitle || r.tab.title).includes(q) || fold(r.tab.url).includes(q) || fold(r.path).includes(q));
    for (const r of rows) {
      const row = el('button', 'fp-row' + (r.tab.active ? ' active' : ''));
      row.dataset.tab = r.tab.id;
      row.setAttribute('role', 'menuitem');
      const ic = el('span', 'fp-ic');
      ic.appendChild(r.tab.icon ? emojiEl(r.tab.icon) : faviconEl(S && S.incognito ? '' : (r.tab.favicon || guessIcon(r.tab.url)), r.tab.title));
      row.append(ic, el('span', 'fp-name', r.tab.title));
      if (r.path) row.appendChild(el('span', 'fp-sub', r.path));
      panel.list.appendChild(row);
    }
    if (!rows.length) panel.list.appendChild(el('div', 'fp-empty', t('fpeek.none')));
    select(q && rows.length ? 0 : -1);
  }

  function open(head) {
    timer = null;
    if (panel || !S || busy() || !head.isConnected || head !== over) return;
    const box = head.parentElement;
    const folder = find(S.pinned, head.dataset.id);
    if (!folder || box.classList.contains('open')) return;
    const rows = flat(folder);
    if (!rows.length) return; // dossier vide : rien à montrer
    if (typeof settleRows === 'function') settleRows(); // la place du dossier se lit lignes au repos
    const node = el('div');
    node.id = 'folder-peek';
    node.setAttribute('role', 'menu');
    node.dataset.folder = folder.id;
    const input = el('input', 'fp-search');
    input.type = 'text';
    input.spellcheck = false;
    input.placeholder = t('fpeek.search', { name: folder.name });
    const list = el('div', 'fp-list');
    node.append(input, list);
    panel = { el: node, input, list, id: folder.id, head, rows, sel: -1 };
    draw();
    side.appendChild(node);
    // Sous le dossier s'il y a la place, sinon au-dessus ; jamais hors de la barre.
    const s = side.getBoundingClientRect();
    const r = head.getBoundingClientRect();
    const h = Math.min(MAX_H, node.offsetHeight);
    const below = s.bottom - r.bottom - 12;
    if (below >= h || below >= r.top - s.top) {
      node.style.top = Math.round(r.bottom - s.top + 4) + 'px';
      node.style.maxHeight = Math.max(80, Math.min(MAX_H, below)) + 'px';
    } else {
      node.classList.add('above');
      node.style.bottom = Math.round(s.bottom - r.top + 4) + 'px';
      node.style.maxHeight = Math.max(80, Math.min(MAX_H, r.top - s.top - 12)) + 'px';
    }
    head.classList.add('peeking');
  }

  const inside = (t0) => !!(t0 && t0.closest && t0.closest('#folder-peek'));
  const headOf = (t0) => (t0 && t0.closest ? t0.closest('#pinned .folder:not(.open) > .row') : null);
  const leaveSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (panel && !panel.el.matches(':hover') && !panel.head.matches(':hover') && document.activeElement !== panel.input) close(); }, GRACE);
  };

  side.addEventListener('pointerover', (e) => {
    if (inside(e.target)) { clearTimeout(timer); return; }
    const head = headOf(e.target);
    if (head === over) { if (panel && head === panel.head) clearTimeout(timer); return; }
    over = head;
    if (panel && head !== panel.head) leaveSoon();
    if (!panel) clearTimeout(timer);
    if (head && !panel && !busy() && !e.buttons) timer = setTimeout(() => open(head), DWELL); // bouton enfoncé : un glisser passe, pas un survol
  });
  side.addEventListener('pointerleave', (e) => { if (e.target !== side) return; over = null; if (panel) leaveSoon(); else clearTimeout(timer); });
  side.addEventListener('pointerdown', (e) => { if (!inside(e.target)) { clearTimeout(timer); close(true); } }, true);
  side.addEventListener('dragstart', () => { clearTimeout(timer); close(true); }, true);
  side.addEventListener('wheel', (e) => { if (!inside(e.target)) { clearTimeout(timer); close(true); } }, { capture: true, passive: true });
  side.addEventListener('click', (e) => {
    if (!panel || !inside(e.target)) return;
    e.stopPropagation();
    const row = e.target.closest('.fp-row');
    if (!row) return;
    send('activate', row.dataset.tab);
    close();
  }, true);
  side.addEventListener('input', (e) => { if (panel && e.target === panel.input) draw(); });
  side.addEventListener('focusout', (e) => { if (panel && e.target === panel.input) leaveSoon(); });
  side.addEventListener('keydown', (e) => {
    if (!panel || e.target !== panel.input) return;
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); select(panel.sel + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); select(panel.sel - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const rows = panel.list.querySelectorAll('.fp-row');
      const row = rows[panel.sel >= 0 ? panel.sel : 0];
      if (row) { send('activate', row.dataset.tab); close(); }
    }
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel) close(); });
  window.addEventListener('blur', () => close(true));
  // La barre a changé sous le panneau (dossier ouvert, retiré, autre Espace) : il s'efface.
  new MutationObserver(() => {
    if (!panel) return;
    const box = panel.head.parentElement;
    if (!panel.head.isConnected || !box || box.classList.contains('open') || !S || !find(S.pinned, panel.id)) close(true);
  }).observe(pinned, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  // Ouvre tout de suite l'aperçu du dossier `id`, aux mêmes conditions qu'un survol
  // (replié, non vide, aucun glisser ni renommage en cours). Rend vrai s'il s'est ouvert.
  function show(id) {
    const head = pinned.querySelector(`.folder > .row[data-id="${CSS.escape(String(id))}"]`);
    if (!head) return false;
    close(true);
    over = head;
    open(head);
    return !!panel && panel.head === head;
  }
  window.folderPeek = { close, show, open: () => (panel ? panel.id : null), DWELL };
})();
