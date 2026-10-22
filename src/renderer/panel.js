// Habillage des extensions : en-tête du panneau latéral (titre, fermeture,
// poignée de largeur) et bandeau du débogueur. Les textes viennent du processus
// principal, avec l'état à afficher.
const P = window.orbePanel;
const $ = (id) => document.getElementById(id);

P.on((d) => {
  const data = d || {};
  $('panel').hidden = data.mode !== 'panel';
  $('banner').hidden = data.mode !== 'banner';
  if (data.mode === 'panel') {
    $('title').textContent = data.title || '';
    $('icon').hidden = !data.icon;
    if (data.icon) $('icon').src = data.icon;
    $('close').title = data.close || '';
  } else if (data.mode === 'banner') {
    $('text').textContent = data.text || '';
    $('stop').textContent = data.stop || '';
  }
});

$('close').addEventListener('click', () => P.send('close'));
$('stop').addEventListener('click', () => P.send('stop'));

// Largeur du panneau : on tire son bord gauche. La vue se déplace pendant le
// geste, d'où la position à l'écran plutôt que dans la page.
const grip = $('grip');
grip.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  grip.setPointerCapture(e.pointerId);
  grip.classList.add('on');
  const offset = e.clientX; // distance entre le pointeur et le bord de la vue
  const move = (ev) => P.send('resize', { screenX: ev.screenX - offset + grip.offsetWidth });
  const end = () => {
    grip.classList.remove('on');
    grip.removeEventListener('pointermove', move);
    grip.removeEventListener('pointerup', end);
    grip.removeEventListener('pointercancel', end);
    P.send('resizeEnd');
  };
  grip.addEventListener('pointermove', move);
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
});
