// Barre de la petite fenêtre : une loupe, une adresse, les extensions, la copie du lien et le bouton
// « Ouvrir dans ‹Espace› ⌘O », avec son menu des Espaces (recherche comprise).
// little.html#float is the view over the page (little.js): the coach mark and the right edge's buttons.
const FLOAT = location.hash === '#float';
document.body.classList.toggle('float', FLOAT);
const u = document.getElementById('u');
const open = document.getElementById('open');
const copy = document.getElementById('copy');
const exts = document.getElementById('exts');
const search = document.getElementById('space-search');
const list = document.getElementById('space-list');
let url = '';
let spaces = null; // Espaces du menu « Ouvrir dans… », ou null s'il est fermé
let sel = 0;
let first = true; // premier état reçu : sans page, le champ prend le clavier

O.on('state', (s) => {
  setLang(s.lang);
  url = s.url;
  if (first) { first = false; if (!url && !FLOAT) u.focus(); }
  if (document.activeElement !== u) u.value = host(s.url);
  addressInto(document.getElementById('u-site'), s.url ? host(s.url) : '');
  document.getElementById('u-wrap').classList.toggle('site', !!s.url);
  open.disabled = !s.url;
  copy.disabled = !s.url;
  copy.title = `${t('edit.copyUrl')}  ${KEYS.copyUrl || ''}`.trim(); // Arc: "Copy URL ⇧⌘C"
  exts.hidden = !s.extensions;
  document.title = s.title || 'Radian';
  // Comme dans Arc : la fenêtre prend les couleurs de l'Espace où ⌘O enverra la page, et le bouton le nomme.
  if (s.target) {
    const vars = OrbeTheme.cssVars(OrbeTheme.palette(s.target.space, s.target.dark));
    for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  }
  // Arc: "Open in" grey, the Space's name bold white.
  const label = document.getElementById('open-label');
  const [before, after = ''] = t('little.openSpace').split('{space}');
  const name = document.createElement('b');
  name.textContent = s.target ? s.target.name : '';
  if (s.target) label.replaceChildren(before, name, after); else label.textContent = t('little.open');
  const [lead, tail = ''] = t('little.coachTitle').split('{name}');
  const brand = document.createElement('i');
  brand.textContent = t('little.coachName');
  document.getElementById('coach-title').replaceChildren(lead, brand, tail);
  document.getElementById('coach').hidden = !s.hint;
  document.getElementById('edge').hidden = !s.edge;
  if (FLOAT) fitFloat();
  const was = !!spaces;
  spaces = Array.isArray(s.spaces) ? s.spaces : null;
  document.body.classList.toggle('menu', !!spaces);
  document.getElementById('spaces').hidden = !spaces;
  document.getElementById('veil').hidden = !spaces;
  if (spaces && !was) { search.value = ''; sel = 0; search.focus(); }
  if (spaces) drawSpaces();
});
O.on('edit', () => { u.focus(); });
u.addEventListener('focus', () => { u.value = url; u.select(); });
u.addEventListener('blur', () => { u.value = host(url); });
u.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && u.value.trim()) { O.send('navigate', u.value.trim()); u.blur(); }
  if (e.key === 'Escape') u.blur();
});
open.onclick = () => O.send('openInOrbe');
document.getElementById('find-u').onclick = () => u.focus();
document.getElementById('coach-close').onclick = () => O.send('closeHint');
document.getElementById('edge-close').onclick = () => O.send('closeWindow');
document.getElementById('edge-full').onclick = () => O.send('openInOrbe');
document.getElementById('space-close').onclick = () => O.send('closeMenu');
// The float view takes the size of what it shows; nothing shown, it goes away (little.js `placeFloat`).
// Measured right away too: a hidden view does not render, so its ResizeObserver would never fire.
let floatSent = '';
function fitFloat() {
  const box = document.getElementById('float');
  const size = { width: box.offsetWidth, height: box.offsetHeight };
  if (floatSent === size.width + 'x' + size.height) return;
  floatSent = size.width + 'x' + size.height;
  O.send('floatSize', size);
}
if (FLOAT) new ResizeObserver(fitFloat).observe(document.getElementById('float'));
document.getElementById('open-in').onclick = () => O.send('openInMenu');
// The menu and the popups open under the button, right-aligned to it.
exts.onclick = () => {
  const r = exts.getBoundingClientRect();
  O.send('extMenu', { x: Math.round(r.left), y: Math.round(r.bottom + 6), right: Math.round(r.right) });
};
copy.onclick = () => {
  O.send('copyUrl');
  copy.classList.add('done');
  setTimeout(() => copy.classList.remove('done'), 900);
};

// Espaces dont le nom contient le texte cherché (sans tenir compte de la casse ni des accents).
const plain = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const matches = () => (spaces || []).filter((sp) => plain(sp.name).includes(plain(search.value.trim())));
function drawSpaces() {
  const found = matches();
  sel = Math.max(0, Math.min(sel, found.length - 1));
  list.textContent = '';
  found.forEach((sp, i) => {
    const b = document.createElement('button');
    b.dataset.space = sp.id;
    b.className = i === sel ? 'sel' : '';
    const ic = document.createElement('span');
    ic.className = 'ic';
    ic.textContent = sp.icon;
    b.append(ic, sp.name);
    list.appendChild(b);
  });
  document.getElementById('space-none').hidden = found.length > 0;
}
search.addEventListener('input', () => { sel = 0; drawSpaces(); });
search.addEventListener('keydown', (e) => {
  const found = matches();
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + found.length) % Math.max(1, found.length); drawSpaces(); }
  if (e.key === 'Enter' && found[sel]) O.send('openInSpace', found[sel].id);
});
list.addEventListener('click', (e) => {
  const b = e.target.closest('[data-space]');
  if (b) O.send('openInSpace', b.dataset.space);
});
document.getElementById('veil').addEventListener('mousedown', () => O.send('closeMenu'));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && spaces) { e.preventDefault(); O.send('closeMenu'); } });
O.send('ready');
