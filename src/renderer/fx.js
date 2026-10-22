// Petits mouvements de la barre latérale, sans rôle dans son état : le fichier
// téléchargé qui tombe dans l'icône de la Bibliothèque, le reflet qui passe au
// premier affichage, le dossier qui « avale » ce qu'on y dépose.
// Chargé avant shell.js. Transformations et opacité seulement ; rien ne se joue
// quand « Réduire les animations » est actif.
(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const FILE = '<svg class="i" viewBox="0 0 16 16"><path d="M4.4 2.4h4.8l2.4 2.6v8.6H4.4z"/><path d="M9 2.6v2.6h2.4"/></svg>'; // dessin fixe, écrit ici
  let started = null; // téléchargements commencés depuis l'ouverture d'Orbe (compteur du processus principal)

  // Un fichier tombe dans l'icône ; l'icône le reçoit d'un petit rebond.
  function drop(delay) {
    const lib = document.getElementById('b-library');
    if (!lib || still.matches) return;
    const chip = document.createElement('span');
    chip.className = 'dl-drop';
    chip.innerHTML = FILE;
    chip.style.animationDelay = delay + 'ms';
    lib.appendChild(chip);
    const done = () => {
      chip.remove();
      lib.classList.remove('gulp');
      void lib.offsetWidth; // relance le rebond si un autre fichier suit
      lib.classList.add('gulp');
    };
    chip.addEventListener('animationend', done, { once: true });
    setTimeout(() => { if (chip.isConnected) done(); }, 1500 + delay);
  }

  // Appelé à chaque état : `n` téléchargements commencés en tout.
  window.fxDownloads = (n) => {
    if (typeof n !== 'number') return;
    const before = started;
    started = n;
    if (before === null || n <= before) return; // premier état : rien ne tombe pour les téléchargements déjà là
    for (let i = 0; i < Math.min(n - before, 4); i++) drop(i * 110);
  };

  // Premier affichage : un reflet traverse la barre latérale, une fois.
  window.fxStart = () => {
    const side = document.getElementById('sidebar');
    if (!side || still.matches || document.getElementById('shimmer')) return;
    const el = document.createElement('div');
    el.id = 'shimmer';
    document.documentElement.dataset.shimmer = String(Number(document.documentElement.dataset.shimmer || 0) + 1);
    el.appendChild(document.createElement('i'));
    side.appendChild(el);
    const done = () => el.remove();
    el.firstChild.addEventListener('animationend', done, { once: true });
    setTimeout(done, 2500);
  };

  // Barre d'outils teintée par la couleur de thème de la page (« #rrggbb » vérifié
  // par le processus principal, revérifié ici) ; le texte passe en clair ou en sombre.
  let tint = null;
  window.fxToolbar = (color) => {
    const c = typeof color === 'string' && /^#[0-9a-f]{6}$/.test(color) ? color : null;
    if (c === tint) return;
    tint = c;
    const bar = document.getElementById('toolbar');
    bar.classList.toggle('tinted', !!c);
    if (!c) { bar.classList.remove('on-dark'); bar.style.removeProperty('--page'); return; }
    const n = parseInt(c.slice(1), 16);
    const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    bar.classList.toggle('on-dark', lum < 0.55);
    bar.style.setProperty('--page', c);
  };

  // Dépôt dans un dossier (sur son en-tête ou parmi ses lignes) : son icône
  // rebondit, sa ligne s'éclaire un instant. `drag` est le glisser en cours de shell.js.
  document.addEventListener('drop', (e) => {
    let dragging = null;
    try { dragging = drag; } catch {}
    const folder = document.querySelector('.folder.drop-into') || (e.target && e.target.closest ? e.target.closest('.folder') : null);
    if (!folder || !dragging || still.matches) return;
    const head = folder.querySelector(':scope > .row');
    if (dragging.space || (dragging.folder && head && head.dataset.id === dragging.id)) return;
    folder.classList.remove('gulped');
    // Le dépôt fait redessiner la liste : la ligne du dossier peut être remplacée par
    // une neuve avant la fin du rebond (il disparaissait alors, une fois sur deux).
    // Le rebond est donc tenu par l'identifiant du dossier, et reposé sur la ligne neuve.
    const id = head ? head.dataset.id : '';
    const now = () => (id && [...document.querySelectorAll('.folder > .row')].find((r) => r.dataset.id === id) || { parentNode: folder }).parentNode;
    const mark = () => { const el = now(); if (el && el.isConnected && !el.classList.contains('gulped')) el.classList.add('gulped'); };
    const watch = new MutationObserver(mark);
    requestAnimationFrame(() => {
      mark();
      watch.observe(document.getElementById('scroll'), { childList: true, subtree: true });
      setTimeout(() => { watch.disconnect(); for (const el of document.querySelectorAll('.folder.gulped')) el.classList.remove('gulped'); }, 700);
    });
  }, true);
})();
