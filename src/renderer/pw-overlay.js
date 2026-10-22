// Mots de passe : liste des comptes sous un champ de connexion, et proposition
// d'enregistrement. Ces vues ne reçoivent jamais de mot de passe : seulement
// des identifiants et un jeton, renvoyé au processus principal avec le choix.
const $ = (id) => document.getElementById(id);
let token = null;
let shownAt = 0;
let updating = false;
// Un clic (ou Entrée) tombé au moment où la vue apparaît n'est pas un choix :
// la page peut prévoir où et quand elle s'ouvre, pas décider à notre place.
const GUARD = 500;
const settled = () => Date.now() - shownAt > GUARD;

function icon(name) {
  const span = document.createElement('span');
  span.className = 'key';
  span.innerHTML = `<svg class="i"><use href="#i-${name}"/></svg>`;
  return span;
}

function row(item, p) {
  const b = document.createElement('button');
  b.className = 'acc ' + item.kind;
  b.dataset.id = item.id;
  const txt = document.createElement('span');
  txt.className = 'txt';
  const name = document.createElement('div');
  name.className = 'name';
  const sub = document.createElement('div');
  sub.className = 'sub';
  if (item.kind === 'generate') {
    name.textContent = t('pw.pickGenerate');
    sub.textContent = p.site;
  } else if (item.kind === 'manage') {
    name.textContent = t('pw.pickManage');
    name.style.fontWeight = '500';
  } else {
    name.textContent = item.label;
    // Compte d'une autre adresse du même site : dit en toutes lettres.
    sub.textContent = item.kind === 'related' ? t('pw.pickOther', { site: item.sub }) : (p.embedded ? t('pw.pickEmbedded', { site: p.site }) : item.sub);
  }
  txt.append(name);
  if (sub.textContent) txt.append(sub);
  if (item.kind !== 'manage') b.append(icon(item.kind === 'generate' ? 'spark' : 'key'));
  b.append(txt);
  b.onclick = () => { if (settled()) O.send('pw:pick', { token, id: item.id }); };
  return b;
}

function showPick(p) {
  const box = $('pick');
  box.textContent = '';
  for (const item of p.items) box.append(row(item, p));
  box.append(row({ id: 'manage', kind: 'manage' }, p));
  $('save').hidden = true;
  box.hidden = false;
}

function showSave(p) {
  $('pick').hidden = true;
  updating = !!p.update;
  // Remplacement d'un compte existant : le compte visé est nommé dans la
  // question, et rien n'est modifiable ni validé d'avance.
  $('save-title').textContent = p.update ? t('pw.updateAsk', { site: p.site, user: p.username }) : t('pw.saveAsk', { site: p.site });
  $('save-user').value = p.username || '';
  $('save-user').readOnly = updating;
  $('save-user').hidden = updating;
  $('save-ok').textContent = t(p.update ? 'pw.updateBtn' : 'pw.saveBtn');
  $('save').hidden = false;
}

const answer = (choice) => { if (settled()) O.send('pw:prompt', { token, choice, username: $('save-user').value }); };
$('save-ok').onclick = () => answer('save');
$('save-never').onclick = () => answer('never');
$('save-later').onclick = () => answer('later');
// Entrée dans le champ valide un nouvel enregistrement, jamais un remplacement.
$('save-user').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !updating) answer('save'); });

// Choix au clavier, relayé par Orbe depuis la page.
let keyIndex = -1;
function onKey(key) {
  const rows = [...document.querySelectorAll('#pick .acc')];
  if (!rows.length) return;
  if (key === 'Enter') { if (rows[keyIndex]) rows[keyIndex].click(); return; }
  keyIndex = (keyIndex + (key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
  rows.forEach((r, i) => r.classList.toggle('key-sel', i === keyIndex));
  rows[keyIndex].scrollIntoView({ block: 'nearest' });
}

O.on('overlay', (p) => {
  if (p.key) return onKey(p.key);
  keyIndex = -1;
  token = p.token || null;
  shownAt = Date.now();
  if (p.mode === 'pw-pick') showPick(p);
  else if (p.mode === 'pw-save') showSave(p);
  else { $('pick').hidden = true; $('save').hidden = true; }
});
O.on('settings', (s) => setLang(s.lang));
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !token) return;
  if (!$('pick').hidden) O.send('pw:pick', { token, id: 'close' });
  else answer('later');
});
// La liste a pris le clavier puis le perd (clic ailleurs) : elle se ferme.
window.addEventListener('blur', () => { if (!$('pick').hidden && token) O.send('pw:pick', { token, id: 'dismiss' }); });
