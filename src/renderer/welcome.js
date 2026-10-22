// Accueil du premier lancement : bienvenue, import, couleur, navigateur par
// défaut, premiers gestes. Chaque étape est facultative ; « Passer » mène droit à
// la dernière (premiers gestes et mot de soutien), d'où l'on commence à naviguer.
const steps = [...document.querySelectorAll('.step')];
const dots = document.getElementById('dots');
const next = document.getElementById('next');
const back = document.getElementById('back');
let at = 0;
let info = null;

for (const s of steps) dots.appendChild(document.createElement('i')).dataset.step = s.dataset.step;

function show(i) {
  at = Math.max(0, Math.min(steps.length - 1, i));
  steps.forEach((s, k) => s.classList.toggle('on', k === at));
  [...dots.children].forEach((d, k) => d.classList.toggle('on', k === at));
  back.hidden = at === 0;
  next.textContent = t(at === 0 ? 'welcome.begin' : at === steps.length - 1 ? 'welcome.finish' : 'welcome.next');
  document.getElementById('skip').hidden = at === steps.length - 1;
  document.title = t('welcome.title');
  scrollTo(0, 0);
  if (steps[at].dataset.step === 'default') refreshInfo();
}

// Fin de l'accueil : l'onglet se ferme, la barre de commande s'ouvre pour un premier onglet.
const finish = () => O.send('welcome:done');
next.onclick = () => (at === steps.length - 1 ? finish() : show(at + 1));
back.onclick = () => show(at - 1);
document.getElementById('skip').onclick = () => show(steps.length - 1);

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cmd]');
  if (!b) return;
  O.send('command', b.dataset.cmd).then(() => { if (b.dataset.cmd === 'defaultBrowser') setTimeout(refreshInfo, 600); });
});
document.addEventListener('keydown', (e) => {
  if (e.target.closest('select, input')) return;
  if (e.key === 'ArrowRight' && at < steps.length - 1) show(at + 1);
  if (e.key === 'ArrowLeft') show(at - 1);
});

// Langue de l'interface, dès la première étape.
const drawLangs = () => { for (const b of document.querySelectorAll('#langs [data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang)); };
document.getElementById('langs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]');
  if (b) O.send('settings:set', { lang: b.dataset.lang });
});

function drawColors() {
  const box = document.getElementById('colors');
  box.textContent = '';
  for (const c of info.colors) {
    const b = document.createElement('button');
    b.style.setProperty('--c', c);
    b.dataset.color = c;
    b.title = c;
    b.setAttribute('aria-pressed', String(c === info.color));
    b.onclick = async () => { await O.send('theme', { color: c }); info.color = c; drawColors(); };
    box.appendChild(b);
  }
}

function drawDefault() {
  document.getElementById('default-state').textContent = t(info.isDefault ? 'set.defaultYes' : 'welcome.defaultHint');
  document.getElementById('make-default').hidden = !!info.isDefault;
}

async function refreshInfo() {
  info = (await O.send('welcome:info')) || { colors: [] };
  document.getElementById('row-import').hidden = !info.arc;
  drawColors();
  drawDefault();
  startMusic();
}

// Musique de l'accueil : une phrase de sept secondes (fichier original, fabriqué par
// scripts/make-sounds.js), jouée une fois à l'ouverture si le réglage « Sons » le
// permet. Le bouton en haut à droite la coupe, ou la rejoue. Pendant les essais, le
// fichier est chargé mais rien n'est joué (`mute`).
const music = { audio: null, asked: false, button: document.getElementById('music') };
function playMusic(m) {
  if (!music.audio) {
    music.audio = new Audio('musique/welcome.wav');
    music.audio.addEventListener('playing', () => music.button.classList.add('playing'));
    for (const n of ['ended', 'pause']) music.audio.addEventListener(n, () => music.button.classList.remove('playing'));
  }
  const a = music.audio;
  a.volume = Math.max(0, Math.min(1, Number(m.volume) || 0));
  if (m.mute) { a.load(); return; }
  a.currentTime = 0;
  a.play().catch(() => {});
}
function startMusic() {
  if (music.asked || !info || !info.music) return;
  music.asked = true;
  music.button.hidden = !info.music.on;
  if (info.music.on) playMusic(info.music);
}
music.button.onclick = () => {
  const on = music.button.getAttribute('aria-pressed') !== 'true';
  music.button.setAttribute('aria-pressed', String(on));
  if (!on) { if (music.audio) music.audio.pause(); } else if (info && info.music) playMusic(info.music);
};

const browsers = mountImport(document.getElementById('welcome-browsers'), { preferCurrent: true, stay: true });
refreshInfo();
show(0);
window.addEventListener('focus', refreshInfo);
O.on('settings', (s) => { if (setLang(s.lang)) { show(at); if (info) drawDefault(); browsers.refresh(); } drawLangs(); });
drawLangs();
