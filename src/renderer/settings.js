// Réglages : chaque changement est appliqué immédiatement.
// Tout champ listé ici (case à cocher ou liste dont l'id est la clé du réglage)
// est rempli et enregistré automatiquement, quel que soit son volet.
// Search engine, suggestions, archive delay, document app and download location are set per profile (Profiles pane).
const FIELDS = ['lang', 'maxLiveTabs', 'sleepAfterHours', 'memoryBudget', 'appearance', 'translucent', 'externalLinks', 'autoPip', 'batterySaver', 'adblock', 'peekLinks', 'passwordSave', 'passwordFill', 'sounds', 'soundGestures', 'soundVolume',
  'restoreSession', 'warnOnQuit', 'peekShift', 'littleAltClick', 'littleArchiveHours', 'tabKeysFavorites', 'tabKeysNinthLast', 'showFullUrl', 'cookieBanners', 'themeData', 'mediaControls', 'devLocalhost', 'boostsEnabled', 'boostsJs', 'downloadOpenPdf', 'updateCheck', 'haptics'];
const NUMERIC = new Set(['maxLiveTabs', 'sleepAfterHours', 'memoryBudget', 'littleArchiveHours', 'soundVolume']);
const el = (id) => document.getElementById(id);
const make = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; };

let DATA = null; // dernière réponse de « settings:get »
let S = {}; // réglages en vigueur

// Glyphs in the style of SF Symbols (24 × 24, drawn here, nothing taken from Arc). `.f` parts are filled.
const ICONS = {
  gear: '<circle cx="12" cy="12" r="8.4" stroke-width="3" stroke-dasharray="3.3 3.3"/><circle cx="12" cy="12" r="6.9"/><circle cx="12" cy="12" r="2.6"/>',
  person: '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20c.9-3.7 3.7-5.7 7.2-5.7s6.3 2 7.2 5.7"/>',
  windows: '<path d="M8 6V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v8a1.5 1.5 0 0 1-1.5 1.5H17"/><rect x="4" y="8" width="13" height="11" rx="1.6"/><path d="M4 11.2h13"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.4"/><path d="M6 9.6h.01M9.3 9.6h.01M12.6 9.6h.01M15.9 9.6h.01M18 9.6h.01M7.5 14.4h9"/>',
  appicon: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.6"/><path d="M8 16h8M8 16l5.2-6.6"/><path d="M11.4 16a3.4 3.4 0 0 0-1.4-2.7"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  heart: '<path class="f" d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.6-6.5l.8.8.8-.8a4.6 4.6 0 0 1 6.6 6.5z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  arrow: '<path d="M5 12h13M13 7l5 5-5 5"/>',
  ellipsis: '<circle cx="5.5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18.5" cy="12" r="1.8"/>',
  smile: '<circle cx="9" cy="10" r=".6"/><circle cx="15" cy="10" r=".6"/><path d="M8 14.5a5 5 0 0 0 8 0"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  key: '<circle cx="8" cy="12" r="3.6"/><path d="M11.6 12H20M17 12v3M20 12v2.4"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l.8 12.2c.1.9.8 1.6 1.7 1.6h5c.9 0 1.6-.7 1.7-1.6L17 7"/>',
  speaker: '<path class="f" d="M4 9.5h3l4.5-4v13L7 14.5H4z"/><path d="M15 9a4 4 0 0 1 0 6M17.6 6.6a7.4 7.4 0 0 1 0 10.8"/>',
  hand: '<path d="M10 20v-9.5a1.6 1.6 0 0 1 3.2 0V14l3.3.6a2 2 0 0 1 1.6 2.3L17.6 20"/><path d="M7.6 8.6a4.2 4.2 0 0 1 8 0"/>',
  window: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 9h17"/>',
  dots: '<rect x="3" y="7" width="18" height="10" rx="3"/><path d="M8 12h.01M12 12h.01M16 12h.01" stroke-width="2.4"/>',
  doc: '<path d="M7 3.5h6.5L18 8v12.5H7z"/><path d="M13.5 3.5V8H18"/>',
  play: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path class="f" d="M10 8.5v7l6-3.5z"/>',
  player: '<rect x="3" y="5" width="18" height="14" rx="2"/><rect class="f" x="12" y="12" width="7" height="5" rx="1"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.8-.9 1.4-1.9-.5-1.2.2-2.4 1.6-2.4H17a3.5 3.5 0 0 0 3.5-3.5c0-5.1-3.8-9.2-8.5-9.2z"/><circle class="f" cx="8" cy="11" r="1.2"/><circle class="f" cx="11" cy="7.6" r="1.2"/><circle class="f" cx="15.2" cy="8.6" r="1.2"/>',
  brush: '<path d="M19.5 4.5 11 13"/><path class="f" d="M10.4 13.2c-2-.4-3.9 1-4.1 3l-.3 2.3c-.1.6-.6 1-1.2 1H4c1.2 1.3 3 1.9 4.8 1.6 2.4-.4 3.9-2.7 3.3-5z"/>',
  moon: '<path class="f" d="M15.8 15.4A7.4 7.4 0 0 1 8.6 5a7.4 7.4 0 1 0 10.4 8.9 7.4 7.4 0 0 1-3.2 1.5z"/>',
  battery: '<rect x="3" y="8" width="16" height="8" rx="2"/><path d="M21 11v2"/><rect class="f" x="5" y="10" width="7" height="4" rx=".8"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3"/>',
  stack: '<rect x="4" y="8" width="13" height="12" rx="2"/><path d="M8 5h10a2 2 0 0 1 2 2v9"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  code: '<path d="M8.5 7.5 4 12l4.5 4.5M15.5 7.5 20 12l-4.5 4.5M13.4 5.5l-2.8 13"/>',
};
for (const n of document.querySelectorAll('[data-icon]')) {
  const svg = n.tagName === 'svg' ? n : n.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[n.dataset.icon] || '';
}

function fill(s) {
  S = s;
  for (const f of FIELDS) {
    const input = el(f);
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = !!s[f];
    else input.value = String(s[f]);
  }
  el('soundGestures').disabled = !s.sounds;
  el('soundVolume').disabled = !s.sounds;
  el('externalLittle').checked = s.externalLinks === 'little';
  titled();
  drawDev();
  drawSleep();
  drawAppIcons();
  drawSites();
  drawProfile();
}

// --- Volets -------------------------------------------------------------------
const tabs = [...document.querySelectorAll('#tabs button')];
const paneOf = (id) => el('pane-' + id);
let current = '';

// The window keeps Arc's size; it widens by the scroll bar's width when the pane is taller than it (panes.js).
let fitQueued = false;
let scrolls = null;
function fit(instant) {
  if (fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(() => {
    fitQueued = false;
    const p = el('panes');
    const scroll = p.scrollHeight > p.clientHeight + 1;
    if (scroll === scrolls) return;
    scrolls = scroll;
    O.send('settings:layout', { scroll, instant: !!instant });
  });
}

// As in Arc, the window is named after the pane it shows.
function titled() {
  if (current) document.title = el('title').textContent = t('pane.' + current);
}

function show(id, { focus = false, instant = false, remember = true } = {}) {
  if (!paneOf(id) || el('tab-' + id).hidden) id = 'general';
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
  titled();
  if (remember) O.send('settings:pane', id);
  if (id === 'shortcuts') loadKeys();
  fit(instant);
}

tabs.forEach((b) => {
  b.id = 'tab-' + b.dataset.pane;
  b.setAttribute('aria-controls', 'pane-' + b.dataset.pane);
  paneOf(b.dataset.pane).setAttribute('aria-labelledby', b.id);
  b.addEventListener('click', () => show(b.dataset.pane));
  // Flèches : volet voisin, comme une barre d'onglets.
  b.addEventListener('keydown', (e) => {
    const shown = tabs.filter((x) => !x.hidden);
    const i = shown.indexOf(b);
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? shown.length - 1 : (i + step + shown.length) % shown.length;
    if (!step && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    show(shown[to].dataset.pane, { focus: true });
  });
});
// Le contenu d'un volet change (liste, message) : la fenêtre suit.
for (const p of document.querySelectorAll('.pane')) new ResizeObserver(() => { if (p.id === 'pane-' + current) fit(); }).observe(p);

// --- Sheets -----------------------------------------------------------------------
// A button with data-sheet="x" opens <dialog id="sheet-x">; Escape or Done closes it.
function openSheet(id) {
  const d = el('sheet-' + id);
  if (!d || d.open) return;
  if (id === 'extkeys') loadKeys();
  d.showModal();
}
for (const b of document.querySelectorAll('[data-sheet]')) b.addEventListener('click', () => openSheet(b.dataset.sheet));
for (const b of document.querySelectorAll('.sheet [data-close]')) b.addEventListener('click', () => b.closest('dialog').close());
for (const d of document.querySelectorAll('dialog.sheet')) d.addEventListener('close', () => stopRecording());

// --- General --------------------------------------------------------------------
function drawDefault() {
  el('default-banner').hidden = !!DATA.isDefault;
}
el('toProfiles').onclick = () => show('profiles', { focus: true });

// --- Profiles ---------------------------------------------------------------------
// Arc sets these per profile only: the selected profile's own value, or the old general value it still
// falls back on (prefs.get), so nobody loses a setting made before profiles had their own.
let profileId = 'default';
const own = (id) => (S.profileSettings && S.profileSettings[id]) || {};
const pval = (key) => (Object.hasOwn(own(profileId), key) ? own(profileId)[key] : S[key]);
const setProfile = (key, value) => O.send('settings:setProfile', { id: profileId, key, value });

function drawProfiles(list) {
  if (!DATA) return;
  DATA.profiles = list;
  if (!list.some((p) => p.id === profileId)) profileId = 'default';
  const box = el('profiles');
  const focused = box.contains(document.activeElement);
  box.textContent = '';
  for (const p of list) {
    const row = make('div', 'prow');
    row.setAttribute('role', 'option');
    row.dataset.id = p.id;
    row.setAttribute('aria-selected', String(p.id === profileId));
    row.tabIndex = p.id === profileId ? 0 : -1;
    row.title = p.spaces.join(' · ');
    row.append(make('span', 'pn', p.name), make('span', 'count', t(p.spaces.length === 1 ? 'set.spaceCountOne' : 'set.spaceCount', { n: p.spaces.length })));
    row.onclick = () => pickProfile(p.id);
    box.appendChild(row);
  }
  if (focused) box.querySelector('[aria-selected="true"]').focus();
  drawProfile();
  const dest = el('import-profile');
  const chosen = dest.value;
  dest.textContent = '';
  for (const p of list) dest.append(new Option(p.name, p.id));
  dest.value = list.some((p) => p.id === chosen) ? chosen : 'default';
}
function pickProfile(id, focus) {
  profileId = id;
  drawProfiles(DATA.profiles);
  if (focus) el('profiles').querySelector('[aria-selected="true"]').focus();
}
el('profiles').addEventListener('keydown', (e) => {
  const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
  if (!step) return;
  e.preventDefault();
  const list = DATA.profiles;
  const i = list.findIndex((p) => p.id === profileId);
  pickProfile(list[Math.min(list.length - 1, Math.max(0, i + step))].id, true);
});

function drawProfile() {
  const p = DATA && (DATA.profiles || []).find((x) => x.id === profileId);
  if (!p) return;
  const name = el('profile-name');
  if (document.activeElement !== name) name.value = p.name;
  name.setAttribute('aria-label', t('set.profileName'));
  const del = el('profile-remove');
  del.disabled = p.id === 'default' || p.spaces.length > 0;
  del.title = t(p.id === 'default' ? 'set.profileDefaultLocked' : p.spaces.length ? 'set.profileInUse' : 'set.profileRemove');
  el('p-searchEngine').value = pval('searchEngine');
  el('p-suggestions').checked = !!pval('suggestions');
  el('p-archiveAfterHours').value = String(pval('archiveAfterHours'));
  el('p-noteApp').value = pval('noteApp');
  drawDownload();
}

// Arc's download location popup: the chosen folder, Downloads, Other…, then Ask every time.
const folderName = (dir) => dir.split('/').filter(Boolean).pop() || dir;
function drawDownload() {
  const sel = el('p-download');
  const dir = pval('downloadDir') || '';
  sel.textContent = '';
  if (dir) sel.append(new Option(folderName(dir), 'dir'));
  sel.append(new Option(t('set.dlDownloads'), ''), new Option(t('set.dlOther'), 'other'), make('hr'), new Option(t('set.dlAsk'), 'ask'));
  sel.value = pval('downloadAsk') ? 'ask' : dir ? 'dir' : '';
  sel.title = dir || DATA.downloads;
}
el('p-download').addEventListener('change', async () => {
  const v = el('p-download').value;
  if (v === 'other') {
    if ((await O.send('settings:chooseDir', { id: profileId })).ok) await setProfile('downloadAsk', false);
    else drawDownload();
    return;
  }
  if (v === '') await setProfile('downloadDir', '');
  await setProfile('downloadAsk', v === 'ask');
});
for (const [id, key, as] of [['p-searchEngine', 'searchEngine', String], ['p-archiveAfterHours', 'archiveAfterHours', Number], ['p-noteApp', 'noteApp', String]]) {
  el(id).addEventListener('change', () => setProfile(key, as(el(id).value)));
}
el('p-suggestions').addEventListener('change', () => setProfile('suggestions', el('p-suggestions').checked));

// + adds a profile and selects it, its name ready to type; − deletes the selected one (never Default, nor one a Space uses).
el('profile-add').onclick = async () => {
  const list = await O.send('settings:addProfile');
  profileId = list[list.length - 1].id;
  drawProfiles(list);
  el('profile-name').focus();
  el('profile-name').select();
};
el('profile-remove').onclick = async () => drawProfiles(await O.send('settings:deleteProfile', profileId));
el('profile-name').addEventListener('change', async () => drawProfiles(await O.send('settings:renameProfile', { id: profileId, name: el('profile-name').value })));
el('profile-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

// --- Site Search ------------------------------------------------------------------
// The user's own sites for the Command Bar: one row of inputs each, saved on change.
// The rows on screen are the list; prefs.js validates it, and a refused list is drawn back as stored.
const SITE_FIELDS = ['name', 'keyword', 'url'];
const siteSig = (list) => lang + JSON.stringify(list);
let sitesShown = '';
const siteEntry = (row) => {
  const [name, keyword, url] = SITE_FIELDS.map((f) => row.querySelector('.s-' + f).value.trim());
  return { name, keyword: keyword.toLowerCase(), url };
};
const siteRows = () => [...el('site-list').children].map(siteEntry);
async function saveSites(list, redraw) {
  sitesShown = siteSig(list); // the broadcast that follows must not redraw the rows (and steal the focus)
  const s = await O.send('settings:set', { siteSearch: list });
  const ok = JSON.stringify(s.siteSearch || []) === JSON.stringify(list);
  el('site-msg').hidden = ok;
  if (!ok || redraw) { S = s; sitesShown = ''; drawSites(); }
  return ok;
}
function drawSites() {
  const list = S.siteSearch || [];
  if (siteSig(list) === sitesShown) return;
  sitesShown = siteSig(list);
  const box = el('site-list');
  box.textContent = '';
  for (const entry of list) {
    const line = make('div', 'line site-row');
    for (const f of SITE_FIELDS) {
      const input = make('input', 'search s-' + f);
      input.value = entry[f];
      input.maxLength = el('site-' + f).maxLength;
      input.spellcheck = false;
      input.placeholder = t('siteSearch.' + f);
      input.setAttribute('aria-label', t('siteSearch.' + f));
      input.addEventListener('change', () => saveSites(siteRows()));
      line.appendChild(input);
    }
    const del = make('button', 'btn', t('set.remove'));
    del.onclick = () => { line.remove(); saveSites(siteRows()); };
    line.appendChild(del);
    box.appendChild(line);
  }
}
el('site-add').onclick = async () => {
  const entry = siteEntry(el('site-add').parentElement);
  if (!entry.name && !entry.keyword && !entry.url) return;
  if (await saveSites([...siteRows(), entry], true)) for (const f of SITE_FIELDS) el('site-' + f).value = '';
};
for (const f of SITE_FIELDS) el('site-' + f).addEventListener('keydown', (e) => { if (e.key === 'Enter') el('site-add').click(); });

// --- Liens ------------------------------------------------------------------------
// Aiguillage des liens venus d'autres applications (Air Traffic Control…)
let routes = [];
let spaceNames = [];
// Rule kinds, as in Arc: '' names a site (stored without `kind`), 'contains' and 'equals' read the URL (prefs.js).
const ROUTE_KINDS = { '': 'route.kindSite', contains: 'route.kindContains', equals: 'route.kindEquals' };
const ROUTE_BAD = { '': 'route.bad', contains: 'route.badContains', equals: 'route.badEquals' };
const ROUTE_PH = { '': 'route.placeholder', contains: 'route.placeholderContains', equals: 'route.placeholderEquals' };
const withKind = (match, to, kind) => (kind ? { match, to, kind } : { match, to });
function routeBad(kind, bad) {
  const msg = el('route-msg');
  msg.dataset.t = ROUTE_BAD[kind];
  msg.textContent = t(msg.dataset.t);
  msg.hidden = !bad;
}
function drawRoutes() {
  const box = el('routes');
  box.textContent = '';
  routes.forEach((r, i) => {
    const line = document.createElement('div');
    line.className = 'line';
    // The kind of each rule can be changed in place: the text is put in the new kind's normal form, or the change is refused.
    const kind = document.createElement('select');
    for (const [k, label] of Object.entries(ROUTE_KINDS)) kind.append(new Option(t(label), k));
    kind.value = r.kind || '';
    kind.title = t('route.kind');
    kind.onchange = async () => {
      const match = await O.send('settings:routeText', { text: r.match, kind: kind.value });
      routeBad(kind.value, !match);
      if (!match) { kind.value = r.kind || ''; return; }
      routes[i] = withKind(match, r.to, kind.value);
      O.send('settings:set', { routes });
      drawRoutes();
    };
    const body = document.createElement('div');
    body.className = 'grow name';
    const dest = r.to === 'little' ? t('set.externalLittle') : ((spaceNames.find((x) => x.id === r.to) || {}).name || '?');
    body.textContent = `« ${r.match} »  →  ${dest}`;
    const del = document.createElement('button');
    del.className = 'btn';
    del.textContent = t('set.profileDelete');
    del.onclick = () => { routes.splice(i, 1); O.send('settings:set', { routes }); drawRoutes(); };
    line.append(kind, body, del);
    box.appendChild(line);
  });
  el('route-to').innerHTML = spaceNames.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('') + `<option value="little">${esc(t('set.externalLittle'))}</option>`;
  // Règle d'avant qui ne nomme pas un site (un mot, un bout de chemin) : elle n'aiguille plus rien, la ligne le dit.
  const shown = JSON.stringify(routes);
  O.send('settings:routeCheck', routes.map((r) => ({ match: r.match, kind: r.kind }))).then((ok) => {
    if (!Array.isArray(ok) || shown !== JSON.stringify(routes)) return;
    [...box.children].forEach((line, i) => {
      if (ok[i] !== false || line.querySelector('.sub')) return;
      line.classList.add('bad-route');
      const note = document.createElement('div');
      note.className = 'sub danger';
      note.textContent = t('route.invalid');
      line.querySelector('.grow').appendChild(note);
    });
  });
}
el('route-kind').onchange = () => {
  const input = el('route-match');
  input.dataset.tPh = ROUTE_PH[el('route-kind').value];
  input.placeholder = t(input.dataset.tPh);
  el('route-msg').hidden = true;
};
el('route-add').onclick = async () => {
  const raw = el('route-match').value.trim();
  if (!raw) return;
  // La règle nomme un site (« figma.com », « github.com/orbe ») : mise sous sa forme normale, ou refusée.
  // Same for "URL contains" / "URL is equal to", in the normal form of that kind.
  const kind = el('route-kind').value;
  const match = await O.send('settings:routeText', { text: raw, kind });
  routeBad(kind, !match);
  if (!match) return;
  if (!routes.some((r) => r.match === match && (r.kind || '') === kind)) routes.push(withKind(match, el('route-to').value, kind));
  O.send('settings:set', { routes });
  el('route-match').value = '';
  drawRoutes();
};
el('route-match').addEventListener('keydown', (e) => { if (e.key === 'Enter') el('route-add').click(); });

// Default destination of links from other apps (Air Traffic Control's Default popup): the most
// recent Space, Little Radian, or a given Space. The Links pane's switch is the Little Radian case.
function drawExternal() {
  const sel = el('externalLinks');
  for (const o of [...sel.options]) if (o.value.startsWith('space:')) o.remove();
  for (const sp of spaceNames) sel.append(new Option(t('set.externalSpace', { name: sp.name }), 'space:' + sp.id));
  sel.value = String(S.externalLinks);
  if (sel.value !== String(S.externalLinks)) sel.value = 'window';
}
el('externalLittle').addEventListener('change', () => O.send('settings:set', { externalLinks: el('externalLittle').checked ? 'little' : 'window' }));

// Global key for Little Radian: on is "a key is set"; turning it on records one in the Shortcuts pane.
function drawLittleKeys() {
  const keys = DATA.littleKeys || '';
  el('littleKeysLabel').textContent = keys ? t('set.littleKeys', { keys }) : t('set.littleKeysNone');
  el('littleKeysOn').checked = !!keys;
}
el('littleKeysOn').addEventListener('change', async () => {
  if (!el('littleKeysOn').checked) { O.send('shortcuts:clear', '@little'); return; }
  el('littleKeysOn').checked = false;
  show('shortcuts');
  await loadKeys();
  const row = rowOf('@little');
  if (row) { row.scrollIntoView({ block: 'nearest' }); row.querySelector('.key-btn').focus(); startRecording(row); }
});

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
  const btn = make('button', 'key-btn' + (item.keys ? '' : ' none'), item.keys || '---');
  btn.setAttribute('aria-label', `${item.label} : ${item.keys || t('set.none')}`);
  row.append(label, btn);
  if (fixed) { btn.disabled = true; return row; }
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

// As in Arc: one alphabetical list ("Default Shortcuts"); extension commands are in their own sheet.
function drawKeys() {
  if (!KEYLIST) return;
  const box = el('keys-list');
  const top = box.scrollTop;
  const q = fold(el('keys-search').value.trim());
  const items = [...KEYLIST.groups.flatMap((g) => g.items), KEYLIST.global].sort((a, b) => a.label.localeCompare(b.label, lang));
  const rows = items.map((i) => keyRow(i)).filter((r) => !q || r.dataset.find.includes(q));
  box.textContent = '';
  box.appendChild(make('h3', '', t('keys.defaults')));
  for (const r of rows) { box.appendChild(r); keyMessage(box, r.dataset.name); }
  if (!rows.length) box.appendChild(make('div', 'empty', t('keys.none')));
  box.scrollTop = top;
  const ext = el('ext-keys-list');
  ext.textContent = '';
  for (const x of KEYLIST.extensions) { ext.appendChild(keyRow(x)); keyMessage(ext, x.name); }
  if (!KEYLIST.extensions.length) ext.appendChild(make('div', 'empty', t('keys.none')));
  el('keys-reset-all').disabled = !KEYLIST.changed;
}
function keyMessage(box, name) {
  if (pending && pending.name === name) box.appendChild(conflictRow());
  else if (keyError && keyError.name === name) box.appendChild(errorRow());
}

function conflictRow() {
  const msg = make('div', 'key-msg conflict');
  msg.setAttribute('role', 'alert');
  const yes = make('button', 'btn blue reassign', t('keys.reassign'));
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

const rowOf = (name) => [...document.querySelectorAll('.key-row')].find((r) => r.dataset.name === name);
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
  if (pending) { const b = document.querySelector('.key-msg .reassign'); if (b) { b.scrollIntoView({ block: 'nearest' }); b.focus(); } }
  else if (name) focusRow(name, !!r.ok);
  return r;
}
const resetKey = (name, force) => applyKeys(O.send('shortcuts:reset', { name, force }), name, { reset: true });

function startRecording(row) {
  stopRecording();
  pending = null;
  keyError = null;
  for (const m of document.querySelectorAll('.key-msg')) m.remove();
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
  if (e.metaKey) mods.push('Cmd');
  return { key, mods, accel: [...mods, key].join('+') };
}

window.addEventListener('keydown', (e) => {
  if (!recording) {
    // Échap ferme la fenêtre (sauf dans un champ en cours de saisie, qu'il quitte d'abord).
    if (e.key === 'Escape' && !e.defaultPrevented) {
      const a = document.activeElement;
      if (a && /^(INPUT|SELECT)$/.test(a.tagName) && !/^(checkbox|radio)$/.test(a.type)) { if (a.id === 'keys-search' && a.value) { a.value = ''; drawKeys(); e.preventDefault(); } else a.blur(); return; }
      if (pending || keyError) { const n = (pending || keyError).name; pending = null; keyError = null; drawKeys(); focusRow(n); e.preventDefault(); return; }
      if (document.querySelector('dialog[open]')) return; // the open sheet closes itself
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
// "…": a native menu with Extension Shortcuts…, as in Arc.
el('keys-more').onclick = async () => {
  const r = el('keys-more').getBoundingClientRect();
  if ((await O.send('settings:keysMenu', { x: Math.round(r.left), y: Math.round(r.bottom + 4) })) === 'extkeys') openSheet('extkeys');
};

// --- Icon -----------------------------------------------------------------------------
// Arc's list: radio, preview, name, "Current icon" under the chosen one. Built once (rebuilding would lose
// keyboard focus at each settings broadcast), then only the checked state follows.
function drawAppIcons() {
  const list = el('appIcons');
  list.setAttribute('aria-label', t('set.appIcon'));
  if (!list.childElementCount) {
    for (const { name, src } of DATA.appIcons || []) {
      const row = make('label', 'line icon-row');
      const radio = make('input');
      radio.type = 'radio';
      radio.name = 'appIcon';
      radio.value = name;
      radio.onchange = () => O.send('settings:set', { appIcon: name });
      const img = make('img');
      img.src = src;
      img.alt = '';
      const body = make('span', 'grow');
      const label = make('span', 'iname', t('appIcon.' + name));
      label.dataset.t = 'appIcon.' + name;
      const caption = make('span', 'caption', t('set.currentIcon'));
      caption.dataset.t = 'set.currentIcon';
      body.append(label, caption);
      row.append(radio, img, body);
      list.append(row);
    }
  }
  for (const r of list.querySelectorAll('input')) r.checked = r.value === S.appIcon;
  // No variants (artwork missing from the build): no Icon pane.
  el('tab-icon').hidden = !list.childElementCount;
}

// --- Privacy and Security ------------------------------------------------------------
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
  el('update-version').textContent = 'Radian ' + u.current;
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
  el('update-how').textContent = t('update.how') + ' ' + t('update.howMac');
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

// --- Avancé : veille automatique ---------------------------------------------------------------
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
  el('p-searchEngine').innerHTML = data.engines.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
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
  // Opened for a control that lives in a sheet (Manage Extensions…, an import).
  if (data.sheet) openSheet(data.sheet);
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
el('makeDefault').onclick = async () => { await O.send('settings:makeDefault'); setTimeout(refresh, 1500); };
el('resetPerms').onclick = async (e) => { await O.send('settings:resetPerms'); flash(e.currentTarget); };
el('clearData').onclick = () => O.send('settings:clearData');

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
