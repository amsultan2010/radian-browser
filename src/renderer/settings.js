// Réglages : chaque changement est appliqué immédiatement.
// Tout champ listé ici (case à cocher ou liste dont l'id est la clé du réglage)
// est rempli et enregistré automatiquement, quel que soit son volet.
const FIELDS = ['lang', 'searchEngine', 'suggestions', 'archiveAfterHours', 'maxLiveTabs', 'sleepAfterHours', 'memoryBudget', 'appearance', 'translucent', 'externalLinks', 'autoPip', 'batterySaver', 'adblock', 'peekLinks', 'passwordSave', 'passwordFill', 'sounds', 'soundGestures', 'soundVolume',
  'restoreSession', 'warnOnQuit', 'peekShift', 'littleAltClick', 'littleArchiveHours', 'tabKeysFavorites', 'tabKeysNinthLast', 'showToolbar', 'showFullUrl', 'cookieBanners', 'themeData', 'mediaControls', 'devLocalhost', 'boostsEnabled', 'boostsJs', 'downloadAsk', 'downloadOpenPdf', 'updateCheck'];
const NUMERIC = new Set(['archiveAfterHours', 'maxLiveTabs', 'sleepAfterHours', 'memoryBudget', 'littleArchiveHours', 'soundVolume']);
const el = (id) => document.getElementById(id);
const make = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; };

let DATA = null; // dernière réponse de « settings:get »
let S = {}; // réglages en vigueur

function fill(s) {
  S = s;
  for (const f of FIELDS) {
    const input = el(f);
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = !!s[f];
    else input.value = String(s[f]);
  }
  document.title = t('set.title');
  el('showFullUrl').disabled = !s.showToolbar;
  el('soundGestures').disabled = !s.sounds;
  el('soundVolume').disabled = !s.sounds;
  drawDownloadDir();
  drawDev();
  drawSleep();
}

// --- Volets -------------------------------------------------------------------
const tabs = [...document.querySelectorAll('#tabs button')];
const paneOf = (id) => el('pane-' + id);
let current = '';

// La fenêtre prend la hauteur du volet affiché (animée par le système sur macOS).
let fitQueued = false;
function fit(instant) {
  if (fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(() => {
    fitQueued = false;
    const pane = paneOf(current);
    if (!pane) return;
    // Hauteurs réelles (fractions comprises) : un demi-pixel de trop ferait apparaître une barre de défilement.
    const height = Math.ceil(el('bar').getBoundingClientRect().height + pane.getBoundingClientRect().height);
    O.send('settings:layout', { height, instant: !!instant });
  });
}

function show(id, { focus = false, instant = false, remember = true } = {}) {
  if (!paneOf(id)) id = 'general';
  if (id !== current) stopRecording();
  current = id;
  for (const b of tabs) {
    const on = b.dataset.pane === id;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    paneOf(b.dataset.pane).hidden = !on;
    if (on && focus) b.focus();
  }
  el('panes').scrollTop = 0;
  if (remember) O.send('settings:pane', id);
  if (id === 'shortcuts') loadKeys();
  fit(instant);
}

tabs.forEach((b, i) => {
  b.id = 'tab-' + b.dataset.pane;
  b.setAttribute('aria-controls', 'pane-' + b.dataset.pane);
  paneOf(b.dataset.pane).setAttribute('aria-labelledby', b.id);
  b.addEventListener('click', () => show(b.dataset.pane));
  // Flèches : volet voisin, comme une barre d'onglets.
  b.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + step + tabs.length) % tabs.length;
    if (!step && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    show(tabs[to].dataset.pane, { focus: true });
  });
});
// Le contenu d'un volet change (liste, message) : la fenêtre suit.
for (const p of document.querySelectorAll('.pane')) new ResizeObserver(() => { if (p.id === 'pane-' + current) fit(); }).observe(p);

// --- Général --------------------------------------------------------------------
function drawDefault() {
  el('defaultState').textContent = t(DATA.isDefault ? 'set.defaultYes' : 'set.defaultNo');
  el('makeDefault').hidden = !!DATA.isDefault;
}

function drawDownloadDir() {
  if (!DATA) return;
  el('downloadDirPath').textContent = S.downloadDir || DATA.downloads;
  el('downloadDirReset').hidden = !S.downloadDir;
}
el('downloadDirChoose').onclick = async () => { await O.send('settings:chooseDir', {}); };
el('downloadDirReset').onclick = () => O.send('settings:set', { downloadDir: '' });
el('toProfiles').onclick = () => show('profiles', { focus: true });

// --- Profils ----------------------------------------------------------------------
// Nom modifiable ; suppression possible si aucun Espace n'utilise le profil.
// Moteur, suggestions, archivage et dossier des téléchargements peuvent être
// propres au profil ; sinon ils suivent le volet Général.
const ARCHIVE_LABEL = { 0: 'set.never', 12: 'set.h12', 24: 'set.h24', 168: 'set.d7', 720: 'set.d30' };
function profileSelect(p, key, options, generalLabel) {
  const own = (S.profileSettings && S.profileSettings[p.id]) || {};
  const sel = make('select');
  sel.dataset.key = key;
  sel.append(new Option(t('set.inherit', { value: generalLabel }), ''));
  for (const [value, label] of options) sel.append(new Option(label, String(value)));
  sel.value = Object.hasOwn(own, key) ? String(own[key]) : '';
  sel.addEventListener('change', async () => {
    let value = sel.value === '' ? null : sel.value;
    if (value !== null && key === 'archiveAfterHours') value = Number(value);
    if (value !== null && key === 'suggestions') value = value === 'true';
    await O.send('settings:setProfile', { id: p.id, key, value });
  });
  return sel;
}

function drawProfiles(list) {
  if (!DATA) return;
  DATA.profiles = list;
  const box = el('profiles');
  const keep = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.profile') : null;
  const keepId = keep ? keep.dataset.id : '';
  const keepKey = keep && document.activeElement.dataset ? document.activeElement.dataset.key : '';
  box.textContent = '';
  const engines = DATA.engines.map((e) => [e.id, e.name]);
  const engineName = (DATA.engines.find((e) => e.id === S.searchEngine) || {}).name || '';
  for (const p of list) {
    const card = make('div', 'card profile');
    card.dataset.id = p.id;
    const own = (S.profileSettings && S.profileSettings[p.id]) || {};
    const row = (label, control, extra) => { const l = make('div', 'line'); l.append(make('span', 'grow', label), ...(extra || []), control); card.appendChild(l); return l; };

    const head = make('div', 'line head');
    const body = make('div', 'grow');
    const name = make('input', 'pname');
    name.value = p.name;
    name.dataset.key = 'name';
    name.spellcheck = false;
    name.addEventListener('change', async () => drawProfiles(await O.send('settings:renameProfile', { id: p.id, name: name.value })));
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
    body.append(name, make('div', 'sub', p.spaces.join(' · ') || t('set.profileUnused')));
    head.appendChild(body);
    if (p.id !== 'default' && !p.spaces.length) {
      const del = make('button', 'btn', t('set.profileDelete'));
      del.onclick = async () => drawProfiles(await O.send('settings:deleteProfile', p.id));
      head.appendChild(del);
    }
    card.appendChild(head);

    row(t('set.search'), profileSelect(p, 'searchEngine', engines, engineName));
    row(t('set.suggestionsShort'), profileSelect(p, 'suggestions', [[true, t('set.on')], [false, t('set.off')]], t(S.suggestions ? 'set.on' : 'set.off')));
    row(t('set.archiveAfter'), profileSelect(p, 'archiveAfterHours', DATA.archiveHours.filter((h) => h).concat(0).map((h) => [h, t(ARCHIVE_LABEL[h])]), t(ARCHIVE_LABEL[S.archiveAfterHours] || 'set.never')));

    const dl = make('div', 'line');
    const dlBody = make('div', 'grow');
    dlBody.append(make('div', '', t('set.downloadDir')), make('div', 'sub path', own.downloadDir || t('set.inherit', { value: S.downloadDir || DATA.downloads })));
    dl.appendChild(dlBody);
    if (own.downloadDir) {
      const reset = make('button', 'btn', t('set.useDefault'));
      reset.dataset.key = 'downloadDirReset';
      reset.onclick = () => O.send('settings:setProfile', { id: p.id, key: 'downloadDir', value: null });
      dl.appendChild(reset);
    }
    const choose = make('button', 'btn', t('set.choose'));
    choose.dataset.key = 'downloadDir';
    choose.onclick = () => O.send('settings:chooseDir', { id: p.id });
    dl.appendChild(choose);
    card.appendChild(dl);
    box.appendChild(card);
  }
  // Le focus clavier reste sur le réglage qu'on vient de changer.
  if (keepId && keepKey) {
    const again = [...box.querySelectorAll('.profile')].find((c) => c.dataset.id === keepId);
    const target = again && again.querySelector(`[data-key="${keepKey}"]`);
    if (target) target.focus();
  }
  const dest = el('import-profile');
  const chosen = dest.value;
  dest.textContent = '';
  for (const p of list) dest.append(new Option(p.name, p.id));
  dest.value = list.some((p) => p.id === chosen) ? chosen : 'default';
}

// --- Liens ------------------------------------------------------------------------
// Aiguillage des liens venus d'autres applications
let routes = [];
let spaceNames = [];
function drawRoutes() {
  const box = el('routes');
  box.textContent = '';
  routes.forEach((r, i) => {
    const line = document.createElement('div');
    line.className = 'line';
    const body = document.createElement('div');
    body.className = 'grow name';
    const dest = r.to === 'little' ? t('set.externalLittle') : ((spaceNames.find((x) => x.id === r.to) || {}).name || '?');
    body.textContent = `« ${r.match} »  →  ${dest}`;
    const del = document.createElement('button');
    del.className = 'btn';
    del.textContent = t('set.profileDelete');
    del.onclick = () => { routes.splice(i, 1); O.send('settings:set', { routes }); drawRoutes(); };
    line.append(body, del);
    box.appendChild(line);
  });
  el('route-to').innerHTML = spaceNames.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('') + `<option value="little">${esc(t('set.externalLittle'))}</option>`;
  // Règle d'avant qui ne nomme pas un site (un mot, un bout de chemin) : elle n'aiguille plus rien, la ligne le dit.
  const shown = routes.map((r) => r.match);
  O.send('settings:routeCheck', shown).then((ok) => {
    if (!Array.isArray(ok) || shown.join('\n') !== routes.map((r) => r.match).join('\n')) return;
    [...box.children].forEach((line, i) => {
      if (ok[i] !== false || line.querySelector('.sub')) return;
      line.classList.add('bad-route');
      const note = document.createElement('div');
      note.className = 'sub danger';
      note.textContent = t('route.invalid');
      line.firstChild.appendChild(note);
    });
  });
}
el('route-add').onclick = async () => {
  const raw = el('route-match').value.trim();
  if (!raw) return;
  // La règle nomme un site (« figma.com », « github.com/orbe ») : mise sous sa forme normale, ou refusée.
  const match = await O.send('settings:routeText', raw);
  el('route-msg').hidden = !!match;
  if (!match) return;
  if (!routes.some((r) => r.match === match)) routes.push({ match, to: el('route-to').value });
  O.send('settings:set', { routes });
  el('route-match').value = '';
  drawRoutes();
};
el('route-match').addEventListener('keydown', (e) => { if (e.key === 'Enter') el('route-add').click(); });

// « Ouvrir les liens des autres applications dans » : Espace affiché, petite
// fenêtre, ou un Espace précis.
function drawExternal() {
  const sel = el('externalLinks');
  for (const o of [...sel.options]) if (o.value.startsWith('space:')) o.remove();
  for (const sp of spaceNames) sel.append(new Option(t('set.externalSpace', { name: sp.name }), 'space:' + sp.id));
  sel.value = String(S.externalLinks);
  if (sel.value !== String(S.externalLinks)) sel.value = 'window';
}

function drawLittleKeys() {
  el('littleKeys').textContent = DATA.littleKeys || '';
  el('littleKeysEdit').textContent = t(DATA.littleKeys ? 'set.edit' : 'keys.add');
}
el('littleKeysEdit').onclick = async () => {
  show('shortcuts');
  await loadKeys();
  const row = document.querySelector('.key-row[data-name="@little"] .key-btn');
  if (row) { row.scrollIntoView({ block: 'nearest' }); row.focus(); startRecording(row.closest('.key-row')); }
};

// --- Raccourcis ---------------------------------------------------------------------
let KEYLIST = null;
let recording = null; // ligne en cours d'enregistrement
let pending = null; // { name, accel, reset } en attente de confirmation (conflit)
let keyError = null; // { name, text }

const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

async function loadKeys() {
  KEYLIST = await O.send('shortcuts:list');
  drawKeys();
}

function keyRow(item, { fixed = false } = {}) {
  const row = make('div', 'line key-row' + (item.changed ? ' changed' : ''));
  row.dataset.name = item.name || '';
  row.dataset.find = fold(item.label + ' ' + item.keys + ' ' + (item.extra || ''));
  const label = make('span', 'grow label', item.label);
  const btn = make('button', 'key-btn' + (item.keys ? '' : ' none'), item.keys || t('keys.add'));
  btn.setAttribute('aria-label', `${item.label} : ${item.keys || t('set.none')}`);
  row.append(label, btn);
  if (fixed) { btn.disabled = true; if (!item.keys) btn.textContent = '—'; return row; }
  btn.addEventListener('click', () => (recording === row ? stopRecording() : startRecording(row)));
  const clear = make('button', 'icon-btn key-clear' + (item.keys ? '' : ' ghost'), '×');
  clear.title = t('keys.clear');
  clear.setAttribute('aria-label', t('keys.clear'));
  clear.onclick = () => applyKeys(O.send('shortcuts:clear', item.name), item.name);
  const reset = make('button', 'icon-btn key-reset' + (item.changed ? '' : ' ghost'), '↺');
  reset.title = t('keys.reset') + (item.defaultKeys ? ` (${item.defaultKeys})` : '');
  reset.setAttribute('aria-label', t('keys.reset'));
  reset.onclick = () => resetKey(item.name, false);
  row.append(clear, reset);
  return row;
}

function drawKeys() {
  if (!KEYLIST) return;
  const box = el('keys-list');
  const top = box.scrollTop;
  const q = fold(el('keys-search').value.trim());
  box.textContent = '';
  let shown = 0;
  const group = (title, rows, hint) => {
    const visible = rows.filter((r) => !q || r.dataset.find.includes(q));
    if (!visible.length) return;
    shown += visible.length;
    const card = make('div', 'card');
    for (const r of visible) {
      card.appendChild(r);
      const name = r.dataset.name;
      if (pending && pending.name === name) card.appendChild(conflictRow());
      else if (keyError && keyError.name === name) card.appendChild(errorRow());
    }
    box.append(make('h3', '', title), card);
    if (hint) box.appendChild(make('p', 'muted note', hint));
  };
  group(t('keys.global'), [keyRow(KEYLIST.global)]);
  for (const g of KEYLIST.groups) group(g.title, g.items.map((i) => keyRow(i)));
  group(t('keys.extensions'), KEYLIST.extensions.map((x) => keyRow(x)), t('keys.extensionsHint'));
  if (!shown) box.appendChild(make('div', 'empty', t('keys.none')));
  box.scrollTop = top;
  el('keys-reset-all').disabled = !KEYLIST.changed;
}

function conflictRow() {
  const msg = make('div', 'key-msg conflict');
  msg.setAttribute('role', 'alert');
  const yes = make('button', 'btn primary reassign', t('keys.reassign'));
  const no = make('button', 'btn cancel', t('keys.cancel'));
  const p = pending;
  yes.onclick = () => (p.reset ? resetKey(p.name, true) : applyKeys(O.send('shortcuts:assign', { name: p.name, accel: p.accel, force: true }), p.name));
  no.onclick = () => { pending = null; drawKeys(); focusRow(p.name); };
  msg.append(make('span', 'grow', t('keys.conflict', { keys: p.keys, label: p.label })), no, yes);
  return msg;
}

function errorRow() {
  const msg = make('div', 'key-msg error');
  msg.setAttribute('role', 'alert');
  msg.appendChild(make('span', 'grow', keyError.text));
  return msg;
}

const rowOf = (name) => [...document.querySelectorAll('#keys-list .key-row')].find((r) => r.dataset.name === name);
function focusRow(name, flash) {
  const row = rowOf(name);
  if (!row) return;
  row.querySelector('.key-btn').focus();
  if (flash) row.classList.add('flash');
}

// Résultat d'une action sur un raccourci : la liste est redessinée ; un conflit
// ou une erreur s'affiche sous la ligne concernée.
let keysBusy = 0; // instant de la dernière action lancée d'ici : sa réponse porte déjà la liste
async function applyKeys(promise, name, extra = {}) {
  keysBusy = Date.now();
  const r = (await promise) || {};
  keysBusy = Date.now();
  pending = null;
  keyError = null;
  if (r.list) KEYLIST = r.list;
  if (r.conflict) pending = { name, accel: extra.accel, reset: !!extra.reset, keys: r.keys, label: r.label };
  else if (r.error) keyError = { name, text: t('keys.err.' + r.error) };
  drawKeys();
  if (pending) { const b = document.querySelector('#keys-list .reassign'); if (b) { b.scrollIntoView({ block: 'nearest' }); b.focus(); } }
  else if (name) focusRow(name, !!r.ok);
  return r;
}
const resetKey = (name, force) => applyKeys(O.send('shortcuts:reset', { name, force }), name, { reset: true });

function startRecording(row) {
  stopRecording();
  pending = null;
  keyError = null;
  for (const m of document.querySelectorAll('#keys-list .key-msg')) m.remove();
  recording = row;
  const btn = row.querySelector('.key-btn');
  btn.dataset.before = btn.textContent;
  btn.textContent = t('keys.recording');
  btn.classList.add('recording');
  O.send('settings:recording', true);
}

function stopRecording() {
  if (!recording) return;
  const btn = recording.querySelector('.key-btn');
  btn.classList.remove('recording');
  if (btn.dataset.before != null) btn.textContent = btn.dataset.before;
  recording = null;
  O.send('settings:recording', false);
}

// Touche d'un événement clavier -> nom de touche d'un accélérateur, ou null
// (touche de modification seule, touche sans équivalent).
const CODE_KEYS = {
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Space: 'Space', Tab: 'Tab', Enter: 'Return', NumpadEnter: 'Return',
  Backspace: 'Backspace', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Escape: 'Escape',
};
function keyOf(e) {
  if (['Meta', 'Control', 'Alt', 'Shift', 'CapsLock', 'AltGraph', 'Fn'].includes(e.key)) return null;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.key)) return e.key;
  // Lettre produite par la disposition du clavier (AZERTY compris) ; avec ⌥,
  // macOS produit un autre caractère : on lit alors la position de la touche.
  if (!e.altKey && /^[a-z]$/i.test(e.key)) return e.key.toUpperCase();
  let m = /^Key([A-Z])$/.exec(e.code);
  if (m) return m[1];
  m = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
  if (m) return m[1];
  return CODE_KEYS[e.code] || null;
}

function accelOf(e) {
  const key = keyOf(e);
  if (!key) return null;
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push(O.platform === 'mac' ? 'Cmd' : 'Meta');
  return { key, mods, accel: [...mods, key].join('+') };
}

window.addEventListener('keydown', (e) => {
  if (!recording) {
    // Échap ferme la fenêtre (sauf dans un champ en cours de saisie, qu'il quitte d'abord).
    if (e.key === 'Escape' && !e.defaultPrevented) {
      const a = document.activeElement;
      if (a && /^(INPUT|SELECT)$/.test(a.tagName) && a.type !== 'checkbox') { if (a.id === 'keys-search' && a.value) { a.value = ''; drawKeys(); } else a.blur(); return; }
      if (pending || keyError) { const n = (pending || keyError).name; pending = null; keyError = null; drawKeys(); focusRow(n); return; }
      O.send('settings:close');
    }
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  const a = accelOf(e);
  if (!a) return; // touche de modification seule : on attend la suite
  const row = recording;
  const name = row.dataset.name;
  if (!a.mods.length && a.key === 'Escape') { stopRecording(); row.querySelector('.key-btn').focus(); return; }
  if (!a.mods.length && (a.key === 'Backspace' || a.key === 'Delete')) { stopRecording(); applyKeys(O.send('shortcuts:clear', name), name); return; }
  stopRecording();
  applyKeys(O.send('shortcuts:assign', { name, accel: a.accel }), name, { accel: a.accel });
}, true);
// Cliquer ailleurs ou changer de fenêtre annule l'enregistrement.
window.addEventListener('mousedown', (e) => { if (recording && !recording.contains(e.target)) stopRecording(); }, true);
window.addEventListener('blur', () => stopRecording());

el('keys-search').addEventListener('input', () => drawKeys());
el('keys-reset-all').onclick = () => applyKeys(O.send('shortcuts:resetAll'), '');
el('keys-essential').onclick = () => O.send('settings:showShortcuts');

// --- Confidentialité ------------------------------------------------------------------
function listWithRemove(box, items, emptyKey, onRemove) {
  box.textContent = '';
  if (!items.length) { const l = make('div', 'line'); l.appendChild(make('span', 'grow muted', t(emptyKey))); box.appendChild(l); return; }
  for (const item of items) {
    const line = make('div', 'line');
    const del = make('button', 'btn', t('set.remove'));
    del.onclick = () => onRemove(item);
    line.append(make('span', 'grow name', item), del);
    box.appendChild(line);
  }
}
function drawAllow() {
  listWithRemove(el('allow-list'), DATA.allow || [], 'set.allowEmpty', async (host) => { DATA.allow = await O.send('settings:allowRemove', host); drawAllow(); });
}

// --- Extensions Chrome (expérimental) ----------------------------------------------------
function drawExtensions(list) {
  const box = el('ext-list');
  box.textContent = '';
  for (const x of list || []) {
    const line = document.createElement('div');
    line.className = 'line';
    line.style.borderTop = '0.5px solid var(--line)';
    const body = document.createElement('div');
    body.className = 'grow';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = `${x.name} ${x.version}`;
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = x.description;
    body.append(name, sub);
    line.appendChild(body);
    if (x.popup) {
      const open = document.createElement('button');
      open.className = 'btn';
      open.textContent = t('lib.open');
      open.onclick = () => O.send('ext:popup', x.id);
      line.appendChild(open);
    }
    const small = (cls, key, fn) => { const b = make('button', 'btn ' + cls, t(key)); b.onclick = fn; line.appendChild(b); return b; };
    if (x.options) small('ext-options', 'ext.options', () => O.send('ext:options', x.id)).disabled = !x.enabled;
    const pin = small('ext-pin', x.pinned ? 'ext.pinned' : 'ext.pin', async () => drawExtensions(await O.send('ext:pin', { id: x.id, pinned: !x.pinned })));
    pin.setAttribute('aria-pressed', String(!!x.pinned));
    pin.title = t('ext.pinHint');
    const up = small('ext-update', 'ext.update', async () => {
      up.disabled = true;
      el('ext-msg').textContent = t('ext.installing');
      const r = await O.send('ext:update', x.id);
      el('ext-msg').textContent = (r && (r.error || r.message)) || t('ext.hint');
      if (r && r.list) drawExtensions(r.list); else up.disabled = false;
    });
    line.dataset.ext = x.id;
    const on = document.createElement('input');
    on.type = 'checkbox';
    on.checked = x.enabled;
    on.title = t('ext.enabledHint');
    on.onchange = async () => drawExtensions(await O.send('ext:toggle', { id: x.id, enabled: on.checked }));
    const del = document.createElement('button');
    del.className = 'btn ext-remove';
    del.textContent = t('set.profileDelete');
    del.onclick = async () => drawExtensions(await O.send('ext:remove', x.id));
    line.append(on, del);
    box.appendChild(line);
  }
}

el('ext-add').onclick = async () => {
  const input = el('ext-url');
  if (!input.value.trim()) return;
  el('ext-add').disabled = true;
  el('ext-msg').textContent = t('ext.installing');
  const r = await O.send('ext:install', input.value.trim());
  el('ext-add').disabled = false;
  el('ext-msg').textContent = r && r.error ? r.error : t('ext.hint');
  if (r && r.list) { input.value = ''; drawExtensions(r.list); }
};

// --- Mises à jour ----------------------------------------------------------------------
// Tout ce qui vient de GitHub (nom, notes de version) est posé comme du texte.
function drawUpdate(u) {
  if (!u) return;
  drawUpdate.last = u;
  el('update-version').textContent = 'Orbe ' + u.current;
  const when = u.checkedAt ? new Date(u.checkedAt).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' }) : '';
  el('update-state').textContent = u.checking ? t('update.checking') : u.error ? t('update.err.' + u.error) : u.available ? t('update.available', { version: u.latest.version }) : when ? t('update.upToDate', { when }) : t('update.never');
  el('update-check').disabled = !!u.checking;
  el('update-new').hidden = !u.available;
  if (!u.available) return;
  el('update-headline').textContent = t('update.available', { version: u.latest.version }) + (u.latest.name && u.latest.name !== 'v' + u.latest.version && u.latest.name !== u.latest.version ? ' — ' + u.latest.name : '');
  el('update-notes').textContent = u.latest.notes;
  const d = u.download || {};
  el('update-download').hidden = !u.latest.asset || d.state === 'done' || d.state === 'running';
  el('update-cancel').hidden = d.state !== 'running';
  el('update-how').textContent = t('update.how') + ' ' + t(O.platform === 'mac' ? 'update.howMac' : 'update.howWin');
  el('update-download').disabled = d.state === 'running';
  el('update-reveal').hidden = d.state !== 'done';
  el('update-dl-state').textContent = d.state === 'running' ? t('update.downloading', { pct: d.total ? Math.floor((d.received / d.total) * 100) : 0 })
    : d.state === 'done' ? t(d.verified ? 'update.downloaded' : 'update.downloadedPlain', { name: d.name })
      : d.state === 'error' ? t('update.dlErr.' + d.error) : '';
}
for (const [id, action] of [['update-check', 'update:check'], ['update-page', 'update:open'], ['update-download', 'update:download'], ['update-cancel', 'update:cancel'], ['update-reveal', 'update:reveal']]) {
  el(id).onclick = async () => drawUpdate(await O.send(action));
}
O.on('update', drawUpdate);
O.send('update:status').then(drawUpdate);

// --- Import ------------------------------------------------------------------------------
function drawImport() {
  el('import-arc').disabled = !DATA.arc;
  el('import-arc-hint').textContent = t(DATA.arc ? 'imp.arcHint' : 'imp.arcMissing');
}
mountImport(el('import-browsers'), { onChange: () => refresh() });
el('import-arc').onclick = () => O.send('settings:importArc');
el('import-passwords').onclick = () => O.send('pw:open');
el('import-bookmarks').onclick = async () => {
  el('import-bookmarks').disabled = true;
  const r = await O.send('settings:importBookmarks', { profileId: el('import-profile').value });
  el('import-bookmarks').disabled = false;
  if (r && r.ok) { el('import-msg').textContent = t('bm.done', { n: r.bookmarks }); refresh(); }
  else if (r && r.error) el('import-msg').textContent = t('bm.err.' + r.error);
};

// --- Avancé : mode développeur --------------------------------------------------------------
function drawDev() {
  listWithRemove(el('dev-list'), S.devSites || [], 'set.devEmpty', (host) => O.send('settings:set', { devSites: (S.devSites || []).filter((h) => h !== host) }));
}
el('dev-add').onclick = () => {
  const raw = el('dev-host').value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!raw || (S.devSites || []).includes(raw)) { el('dev-host').value = ''; return; }
  O.send('settings:set', { devSites: [...(S.devSites || []), raw] });
  el('dev-host').value = '';
};
el('dev-host').addEventListener('keydown', (e) => { if (e.key === 'Enter') el('dev-add').click(); });

// --- Onglets : veille automatique ---------------------------------------------------------------
// Part de la mémoire de la machine laissée aux onglets ; la valeur en Go est donnée en clair.
const BUDGETS = [10, 15, 25, 35, 50];
function drawSleep() {
  const sel = el('memoryBudget');
  const gb = DATA && DATA.memoryGb ? DATA.memoryGb : 0;
  const values = BUDGETS.includes(Number(S.memoryBudget)) || !Number(S.memoryBudget) ? BUDGETS : [...BUDGETS, Number(S.memoryBudget)].sort((a, b) => a - b);
  sel.textContent = '';
  for (const p of values) sel.append(new Option(gb ? t('set.budgetOf', { p, gb: (Math.round(gb * p) / 100).toLocaleString(lang, { maximumFractionDigits: 1 }) }) : p + ' %', String(p)));
  sel.append(new Option(t('set.noLimit'), '0'));
  sel.value = String(S.memoryBudget);
  listWithRemove(el('never-sleep-list'), S.neverSleep || [], 'set.neverSleepEmpty', (site) => O.send('settings:set', { neverSleep: (S.neverSleep || []).filter((x) => x !== site) }));
}
el('never-sleep-add').onclick = async () => {
  const raw = el('never-sleep-site').value.trim();
  if (!raw) return;
  // Le texte nomme un site (« github.com », « exemple.fr/outil ») : mis sous sa forme normale, ou refusé.
  const site = await O.send('settings:routeText', raw);
  el('never-sleep-msg').hidden = !!site;
  if (!site) return;
  if (!(S.neverSleep || []).includes(site)) O.send('settings:set', { neverSleep: [...(S.neverSleep || []), site] });
  el('never-sleep-site').value = '';
};
el('never-sleep-site').addEventListener('keydown', (e) => { if (e.key === 'Enter') el('never-sleep-add').click(); });

// --- Chargement ---------------------------------------------------------------------------------
function draw(data) {
  DATA = data;
  S = data.settings;
  routes = (data.settings.routes || []).slice();
  spaceNames = data.spaces;
  el('searchEngine').innerHTML = data.engines.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
  el('version').textContent = `Orbe ${data.version} · Chromium ${data.chrome}`;
  drawExternal();
  fill(data.settings);
  drawProfiles(data.profiles);
  drawRoutes();
  drawDefault();
  drawLittleKeys();
  drawAllow();
  drawImport();
}

async function refresh() {
  draw(await O.send('settings:get'));
  if (current === 'shortcuts') loadKeys();
}

async function init() {
  drawExtensions(await O.send('ext:list'));
  const data = await O.send('settings:get');
  draw(data);
  show(data.pane, { instant: true, remember: false });
}

for (const f of FIELDS) {
  el(f).addEventListener('change', (e) => {
    const input = e.target;
    let value = input.type === 'checkbox' ? input.checked : input.value;
    if (NUMERIC.has(f)) value = Number(value);
    O.send('settings:set', { [f]: value });
  });
}

const flash = (btn) => { const old = btn.textContent; btn.textContent = '✓'; setTimeout(() => { btn.textContent = old; }, 1200); };
el('passwordManage').onclick = () => O.send('pw:open');
el('makeDefault').onclick = async (e) => { await O.send('settings:makeDefault'); flash(e.target); setTimeout(refresh, 1500); };
el('resetPerms').onclick = async (e) => { await O.send('settings:resetPerms'); flash(e.target); };
el('clearData').onclick = async (e) => { if (await O.send('settings:clearData')) flash(e.target); };

// Un réglage a changé (ici, dans le menu ou dans une autre fenêtre) : tout suit.
O.on('settings', (s) => {
  const langChanged = setLang(s.lang);
  S = s;
  if (DATA) { DATA.settings = s; routes = (s.routes || []).slice(); drawExternal(); fill(s); drawProfiles(DATA.profiles); drawRoutes(); drawDefault(); drawLittleKeys(); drawAllow(); drawImport(); drawUpdate(drawUpdate.last); O.send('ext:list').then(drawExtensions); }
  if (current === 'shortcuts' && !recording && !pending && !keyError && (langChanged || Date.now() - keysBusy > 800)) loadKeys();
});
// Raccourcis changés : celui de la petite fenêtre est rappelé dans le volet Liens.
O.on('keys', async () => { if (!DATA) return; const d = await O.send('settings:get'); DATA.littleKeys = d.littleKeys; DATA.allow = d.allow; drawLittleKeys(); });
// Retour dans la fenêtre : profils, Espaces et exceptions ont pu changer ailleurs.
// Rien n'est redessiné si rien n'a changé : le clic qui ramène la fenêtre au
// premier plan vise peut-être déjà une liste.
const outside = (d) => JSON.stringify([d.profiles, d.spaces, d.allow, d.isDefault, d.arc, d.littleKeys]);
window.addEventListener('focus', async () => {
  if (!DATA || recording) return;
  const d = await O.send('settings:get');
  if (outside(d) !== outside(DATA)) draw(d);
});
init();
