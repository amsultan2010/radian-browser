// Barre de la petite fenêtre : une adresse, la copie du lien et le bouton
// « Ouvrir dans Orbe », avec son menu des Espaces (recherche comprise).
const u = document.getElementById('u');
const open = document.getElementById('open');
const copy = document.getElementById('copy');
const search = document.getElementById('space-search');
const list = document.getElementById('space-list');
let url = '';
let spaces = null; // Espaces du menu « Ouvrir dans… », ou null s'il est fermé
let sel = 0;

O.on('state', (s) => {
  setLang(s.lang);
  url = s.url;
  if (document.activeElement !== u) u.value = host(s.url);
  addressInto(document.getElementById('u-site'), s.url ? host(s.url) : '');
  document.getElementById('u-wrap').classList.toggle('site', !!s.url);
  open.disabled = !s.url;
  copy.disabled = !s.url;
  document.title = s.title || 'Orbe';
  document.getElementById('hint').hidden = !s.hint;
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
document.getElementById('hint-close').onclick = () => O.send('closeHint');
document.getElementById('open-in').onclick = () => O.send('openInMenu');
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
    b.textContent = `${sp.icon}  ${sp.name}`;
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
if (!url) u.focus();
