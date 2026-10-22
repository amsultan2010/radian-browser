// Fenêtre « Mots de passe » : rechercher, afficher, copier, modifier, supprimer,
// importer et exporter. Les mots de passe ne sont pas dans la liste reçue : un
// seul arrive à la fois, sur demande, après confirmation d'identité.
const el = (id) => document.getElementById(id);
let state = { status: 'ok', profile: 'default', profiles: [], entries: [], never: [] };
let editing = null; // identifiant du compte en cours de modification
const revealed = new Map(); // identifiant -> mot de passe affiché (oublié après 30 s)

const call = (action, a = {}) => O.send(action, { profile: state.profile, ...a });
const say = (text) => { el('msg').textContent = text || ''; };

function button(label, onclick, cls = 'btn') {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = label;
  b.onclick = onclick;
  return b;
}

function field(label, input, extra) {
  const l = document.createElement('label');
  l.textContent = label;
  if (!extra) input.classList.add('wide');
  return extra ? [l, input, extra] : [l, input];
}

// Formulaire d'ajout (sans `entry`) ou de modification.
function form(entry) {
  const box = document.createElement('div');
  box.className = 'form';
  const input = (value, ph) => { const i = document.createElement('input'); i.value = value || ''; i.spellcheck = false; i.autocomplete = 'off'; if (ph) i.placeholder = ph; return i; };
  const site = input(entry ? entry.site : '', 'exemple.fr');
  site.readOnly = !!entry;
  const user = input(entry ? entry.username : '');
  const pass = input('', entry ? t('pw.passwordKeep') : '');
  pass.className = 'secret';
  const note = input(entry ? entry.note : '');
  const err = document.createElement('span');
  err.className = 'err';
  const gen = button(t('pw.generate'), async () => { pass.value = await call('pw:generate'); });
  const save = button(t('pw.saveBtn'), async () => {
    const r = await call('pw:save', { id: entry ? entry.id : undefined, url: site.value, username: user.value, password: pass.value, note: note.value });
    if (r && r.error) { err.textContent = r.error; return; }
    editing = null;
    el('new').hidden = true;
    if (r) draw(r);
  }, 'btn primary');
  const cancel = button(t('pw.cancel'), () => { editing = null; el('new').hidden = true; draw(state); });
  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(err, cancel, save);
  box.append(...field(t('pw.site'), site), ...field(t('pw.username'), user), ...field(t('pw.password'), pass, gen), ...field(t('pw.note'), note), actions);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') save.click(); if (e.key === 'Escape') cancel.click(); });
  setTimeout(() => (entry ? user : site).focus(), 0);
  return box;
}

function line(e) {
  const row = document.createElement('div');
  row.className = 'line';
  row.dataset.id = e.id;
  const body = document.createElement('div');
  body.className = 'grow';
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = e.title && e.title !== e.site ? `${e.site} — ${e.title}` : e.site;
  const sub = document.createElement('div');
  sub.className = 'sub';
  const shown = revealed.get(e.id);
  sub.textContent = (e.username || t('pw.noUsername')) + '  ·  ';
  const secret = document.createElement('span');
  secret.className = shown ? 'secret' : '';
  secret.textContent = shown || '••••••••';
  sub.append(secret);
  body.append(name, sub);
  const show = button(t(shown ? 'pw.hide' : 'pw.show'), async () => {
    if (revealed.has(e.id)) revealed.delete(e.id);
    else {
      const p = await call('pw:reveal', { id: e.id });
      if (typeof p !== 'string') return;
      revealed.set(e.id, p);
      setTimeout(() => { if (revealed.delete(e.id)) draw(state); }, 30e3);
    }
    draw(state);
  });
  const copy = button(t('pw.copy'), async () => { if (await call('pw:copy', { id: e.id, what: 'password' })) say(t('pw.copied')); });
  const edit = button(t('pw.edit'), () => { editing = e.id; el('new').hidden = true; draw(state); });
  const del = button(t('pw.delete'), async () => {
    // Second clic pour confirmer.
    if (del.dataset.sure) { revealed.delete(e.id); draw(await call('pw:delete', { id: e.id })); return; }
    del.dataset.sure = '1';
    del.textContent = t('pw.deleteAsk');
    setTimeout(() => { delete del.dataset.sure; del.textContent = t('pw.delete'); }, 2500);
  });
  row.append(body, show, copy, edit, del);
  return row;
}

function draw(next) {
  if (!next || !Array.isArray(next.entries)) return;
  state = next;
  document.title = t('pw.heading');
  const usable = state.status === 'ok';
  el('notice').hidden = usable;
  el('notice-text').textContent = state.status === 'error' ? t('pw.errorState') : t('pw.unavailable');
  el('reset').hidden = state.status !== 'error';
  for (const id of ['add', 'import', 'export']) el(id).disabled = !usable;
  const sel = el('profile');
  sel.hidden = state.profiles.length < 2;
  sel.innerHTML = state.profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  sel.value = state.profile;
  const q = el('q').value.trim().toLowerCase();
  const list = el('list');
  list.textContent = '';
  const shown = state.entries.filter((e) => !q || e.site.toLowerCase().includes(q) || e.username.toLowerCase().includes(q) || e.title.toLowerCase().includes(q));
  for (const e of shown) list.append(e.id === editing ? form(e) : line(e));
  if (!shown.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = t(state.entries.length ? 'pw.noResult' : 'pw.empty');
    list.append(empty);
  }
  el('never-block').hidden = !state.never.length;
  const never = el('never');
  never.textContent = '';
  for (const n of state.never) {
    const row = document.createElement('div');
    row.className = 'line';
    const body = document.createElement('div');
    body.className = 'grow name';
    body.textContent = n.site;
    row.append(body, button(t('pw.neverRemove'), async () => draw(await call('pw:neverRemove', { origin: n.origin }))));
    never.append(row);
  }
}

const reload = async () => draw(await call('pw:state'));

el('q').addEventListener('input', () => draw(state));
el('profile').addEventListener('change', async (e) => { state.profile = e.target.value; revealed.clear(); editing = null; await reload(); });
el('add').onclick = () => { editing = null; const box = el('new'); box.textContent = ''; box.append(form(null)); box.hidden = false; draw(state); };
el('import').onclick = async () => {
  const r = await call('pw:import');
  if (!r) return;
  if (r.error) return say(r.error);
  say(t('pw.importDone', { n: r.count.created + r.count.updated, skipped: r.count.skipped }));
  draw(r.state);
};
el('export').onclick = async () => {
  const r = await call('pw:export');
  if (r) say(r.error || t('pw.exported', { file: r.file }));
};
el('reset').onclick = async () => draw(await call('pw:reset'));

// « settings » sert aussi de signal : un mot de passe vient d'être enregistré ailleurs.
O.on('settings', (s) => { setLang(s.lang); reload(); });
// (pas pendant une saisie : le formulaire serait redessiné)
window.addEventListener('focus', () => { if (!editing && el('new').hidden) reload(); });
// Rien d'affiché ne reste à l'écran quand la fenêtre passe à l'arrière-plan.
window.addEventListener('blur', () => { if (revealed.size) { revealed.clear(); draw(state); } });
reload();
