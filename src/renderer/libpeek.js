// Survol de l'icône de la Bibliothèque : les derniers fichiers (captures,
// téléchargements, médias), à ouvrir d'un clic ou à glisser hors d'Orbe.
// Clic droit sur l'icône : le choix des sortes montrées (menu natif).
// Chargé après shell.js (`send`, `S`, `t`). Les noms de fichiers viennent des
// sites : ils ne sont posés que par textContent. Aucun fichier n'est lu ni
// décodé ici ; la barre ne reçoit ni chemin ni adresse.
// Mouvements : transformation et opacité seulement.
(() => {
  const DWELL = 320; // survol avant l'ouverture (ms)
  const GRACE = 180; // le temps d'aller de l'icône au panneau (ms)
  const NS = 'http://www.w3.org/2000/svg';
  // Dessins fixes, écrits ici : un par sorte de fichier.
  const GLYPH = {
    captures: ['M2.6 5.6V4a1.4 1.4 0 0 1 1.4-1.4h1.6M10.400 2.600H12A1.400 1.400 0 0 1 13.400 4v1.600M13.400 10.400V12a1.400 1.400 0 0 1-1.400 1.400h-1.600M5.600 13.400H4A1.400 1.400 0 0 1 2.600 12v-1.600', 'M6 8a2 2 0 1 0 4 0a2 2 0 1 0-4 0'],
    media: ['M3.8 2.8h8.400a1 1 0 0 1 1 1v8.400a1 1 0 0 1-1 1H3.800a1 1 0 0 1-1-1V3.800a1 1 0 0 1 1-1z', 'm3.200 11 3-3.200 2.400 2.400 1.600-1.600 2.600 2.600', 'M10 6h.01'],
    downloads: ['M4.4 2.4h4.8l2.4 2.6v8.6H4.400z', 'M9 2.600v2.600h2.400'],
  };
  const lib = document.getElementById('b-library');
  const side = document.getElementById('sidebar');
  if (!lib || !side) return;
  let panel = null;
  let timer = null;
  let asked = 0; // numéro de la dernière demande : une réponse en retard est ignorée

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  function glyph(kind) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'i');
    svg.setAttribute('viewBox', '0 0 16 16');
    for (const d of GLYPH[kind] || GLYPH.downloads) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    }
    return svg;
  }
  // « il y a 3 minutes », dans la langue de l'interface.
  function ago(at) {
    const s = Math.max(0, (Date.now() - at) / 1000);
    if (s < 60) return t('peek.now');
    const f = new Intl.RelativeTimeFormat(document.documentElement.lang || 'fr', { numeric: 'auto', style: 'short' });
    if (s < 3600) return f.format(-Math.round(s / 60), 'minute');
    if (s < 86400) return f.format(-Math.round(s / 3600), 'hour');
    return f.format(-Math.round(s / 86400), 'day');
  }

  function close(now) {
    clearTimeout(timer);
    timer = null;
    asked += 1;
    const p = panel;
    if (!p) return;
    panel = null;
    lib.classList.remove('peeking');
    if (now) { p.remove(); return; }
    p.classList.add('out');
    const gone = () => p.remove();
    p.addEventListener('animationend', gone, { once: true });
    setTimeout(gone, 400);
  }

  function show(rows) {
    if (panel) panel.remove();
    panel = el('div');
    panel.id = 'lib-peek';
    panel.setAttribute('role', 'menu');
    const head = el('div', 'lp-head');
    const all = el('button', 'lp-all', t('peek.all'));
    all.dataset.act = 'all';
    head.append(el('span', 'grow', t('peek.title')), all);
    panel.appendChild(head);
    for (const r of rows) {
      const row = el('button', 'lp-row' + (r.danger ? ' danger' : ''));
      row.dataset.file = r.id;
      row.draggable = true;
      row.setAttribute('role', 'menuitem');
      const ic = el('span', 'lp-ic');
      ic.appendChild(glyph(r.kind));
      const text = el('span', 'lp-text');
      text.append(el('span', 'lp-name', r.name), el('span', 'lp-sub', `${t('peek.kind.' + r.kind)} · ${ago(r.at)}`));
      row.append(ic, text);
      panel.appendChild(row);
    }
    side.appendChild(panel);
    lib.classList.add('peeking');
  }

  async function open() {
    timer = null;
    if (panel || !S || document.body.classList.contains('dragging')) return;
    const n = ++asked;
    let rows = null;
    try { rows = await send('lib:recent'); } catch {}
    // Le pointeur est parti pendant la demande, ou rien de récent : pas de panneau.
    if (n !== asked || !Array.isArray(rows) || !rows.length || !lib.matches(':hover')) return;
    show(rows);
  }

  const leaveSoon = () => { clearTimeout(timer); timer = setTimeout(() => { if (panel && !panel.matches(':hover') && !lib.matches(':hover')) close(); }, GRACE); };
  lib.addEventListener('pointerenter', () => { clearTimeout(timer); if (!panel) timer = setTimeout(open, DWELL); });
  lib.addEventListener('pointerleave', () => { if (panel) leaveSoon(); else { clearTimeout(timer); asked += 1; } });
  // Un clic sur l'icône ouvre la Bibliothèque (shell.js) : le panneau s'efface.
  lib.addEventListener('click', () => close());
  lib.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); close(true); send('lib:peekMenu'); });
  side.addEventListener('pointerleave', (e) => { if (panel && e.target === side) leaveSoon(); });
  side.addEventListener('pointerout', (e) => { if (panel && e.target.closest && e.target.closest('#lib-peek') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#lib-peek'))) leaveSoon(); });
  side.addEventListener('pointerover', (e) => { if (panel && e.target.closest && e.target.closest('#lib-peek')) clearTimeout(timer); });
  side.addEventListener('click', (e) => {
    const inPanel = panel && e.target.closest && e.target.closest('#lib-peek');
    if (!inPanel) return;
    const row = e.target.closest('.lp-row');
    if (row) send('lib:openFile', row.dataset.file);
    else if (e.target.closest('[data-act="all"]')) send('command', 'downloads');
    else return;
    close();
  });
  // Glisser un fichier hors d'Orbe : le système prend le relais avec le vrai fichier.
  // (Écoute en phase de capture : le glisser des lignes de la barre ne s'en mêle pas.)
  side.addEventListener('dragstart', (e) => {
    const row = e.target.closest && e.target.closest('#lib-peek .lp-row');
    if (!row) return;
    e.preventDefault();
    e.stopPropagation();
    send('lib:drag', row.dataset.file);
    close();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel) close(); });
  window.addEventListener('blur', () => close(true));
  window.libPeek = { close, open: () => panel };
})();
