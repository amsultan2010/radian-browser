// Éditeur de Boost : apparence, éléments masqués, CSS et JavaScript d'un site,
// appliqués en direct (le script, lui, au prochain chargement de la page).
// Avec « ?list » : la liste de tous les Boosts (activer, modifier, supprimer,
// exporter, importer).
const $ = (id) => document.getElementById(id);
const LIST = location.search === '?list';
const SLIDERS = ['contrast', 'brightness', 'saturation', 'size'];
let B = null; // dernier état reçu
const timers = {};

// Chaque message nomme le site que cette page modifie : si l'éditeur a été pointé
// sur un autre site entre-temps, le processus principal le refuse.
const HOST = () => (B ? B.host : '');
// Enregistre après une courte pause (frappe, glissement d'un curseur). Le site est
// relevé au moment de la frappe, pas à celui de l'envoi.
function later(key, patch, ms = 250) {
  clearTimeout(timers[key]);
  const host = HOST();
  timers[key] = setTimeout(async () => draw(await O.send('boost:set', { host, patch: patch() })), ms);
}
const save = async (patch) => draw(await O.send('boost:set', { host: HOST(), patch }));
const look = (patch) => ({ look: { ...B.look, ...patch } });

function options(sel, prefix, keys) {
  if (sel.options.length) return;
  for (const k of ['', ...keys]) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = t(prefix + (k || 'site'));
    sel.appendChild(o);
  }
}

// `force` : les champs sont récrits même si l'on est en train d'y écrire (« Tout réinitialiser »).
function draw(b, force) {
  if (!b) return;
  B = b;
  $('editor').hidden = false;
  $('host').textContent = 'Boost · ' + b.host;
  document.title = 'Boost · ' + b.host;
  const typing = force ? null : document.activeElement;
  if (typing !== $('name')) $('name').value = b.name;
  if (typing !== $('css')) $('css').value = b.css;
  if (typing !== $('js')) $('js').value = b.js;
  $('on').checked = b.enabled;
  $('to-review').hidden = !b.review;
  const note = !b.boostsOn ? t('boost.off') : (!b.shown ? t('boost.notShown') : '');
  $('note').hidden = !note;
  $('note').textContent = note;

  // Nuancier : « aucune couleur », puis une pastille par couleur.
  const sw = $('swatches');
  if (!sw.children.length) {
    for (const c of ['', ...b.swatches]) {
      const d = document.createElement('button');
      d.className = 'dot' + (c ? '' : ' none');
      d.dataset.color = c;
      d.title = c || t('boost.noColor');
      if (c) d.style.background = c;
      sw.appendChild(d);
    }
  }
  for (const d of sw.children) d.classList.toggle('on', d.dataset.color === b.look.color);
  $('invert').checked = b.look.invert;
  for (const k of SLIDERS) {
    if (typing !== $(k)) $(k).value = b.look[k];
    $(k + '-v').textContent = b.look[k] + ' %';
  }
  options($('font'), 'boost.font.', b.fonts);
  options($('case'), 'boost.case.', b.cases);
  $('font').value = b.look.font;
  $('case').value = b.look.case;

  const box = $('zaps');
  box.textContent = '';
  b.zaps.forEach((z, i) => {
    const line = document.createElement('div');
    line.className = 'zap';
    const s = document.createElement('span');
    s.textContent = z;
    s.title = z;
    const x = document.createElement('button');
    x.className = 'btn';
    x.textContent = '×';
    x.title = t('boost.restore');
    x.onclick = () => save({ zaps: B.zaps.filter((_, j) => j !== i) });
    line.append(s, x);
    box.appendChild(line);
  });
  $('zap').disabled = !b.shown;

  // JavaScript : la case du Boost ne se coche que si le réglage général le permet.
  $('js-on').checked = b.jsOn && b.jsAllowed;
  $('js-on').disabled = !b.jsAllowed;
  $('js-off').hidden = b.jsAllowed;
  $('js-error').hidden = !b.jsError;
  $('js-error').textContent = b.jsError || '';
  $('reload').disabled = !b.shown;
}

// Relecture d'un Boost importé, avant sa première activation : tout ce qu'il
// contient est montré tel quel (texte, jamais interprété), avec un avertissement
// quand son CSS fait charger des adresses (« url( », « @import »).
let reviewing = '';
function showReview(v) {
  if (!v) return;
  reviewing = v.host;
  $('review-host').textContent = v.name ? `${v.name} · ${v.host}` : v.host;
  const warn = [v.warnUrl ? t('boost.reviewUrl') : '', v.warnImport ? t('boost.reviewImport') : ''].filter(Boolean).join(' ');
  $('review-warn').hidden = !warn;
  $('review-warn').textContent = warn;
  $('review-css').textContent = v.css || t('boost.reviewNone');
  $('review-zaps-box').hidden = !v.zaps.length;
  $('review-zaps').textContent = v.zaps.join('\n');
  $('review-js-box').hidden = !v.js;
  $('review-js').textContent = v.js;
  $('review-look').hidden = !v.look;
  $('review').hidden = false;
}
function hideReview() { reviewing = ''; $('review').hidden = true; }
$('review-cancel').onclick = async () => { hideReview(); if (LIST) drawList(await O.send('boost:list')); else draw(await O.send('boost:get')); };
$('review-ok').onclick = async () => {
  const host = reviewing;
  hideReview();
  const r = await O.send('boost:approve', { host });
  if (LIST) drawList(r); else draw(r);
};

function drawList(r) {
  if (!r) return;
  if (r.review) showReview(r.review);
  $('list').hidden = false;
  document.title = t('boost.all');
  const box = $('list-items');
  box.textContent = '';
  $('list-empty').hidden = r.items.length > 0;
  $('export-all').disabled = !r.items.length;
  for (const it of r.items) {
    const line = document.createElement('div');
    line.className = 'item';
    line.dataset.host = it.host;
    const on = document.createElement('input');
    on.type = 'checkbox';
    on.checked = it.enabled;
    on.title = t('boost.enabled');
    on.onchange = async () => drawList(await O.send('boost:toggle', { host: it.host, enabled: on.checked }));
    if (it.review) on.title = t('boost.toReview');
    const text = document.createElement('div');
    text.className = 'grow';
    const site = document.createElement('div');
    site.className = 'site';
    site.textContent = it.name ? `${it.name} · ${it.host}` : it.host;
    const what = document.createElement('div');
    what.className = 'what';
    what.textContent = [it.review ? t('boost.toReview') : '', it.look ? t('boost.look') : '', it.zaps ? `Zap × ${it.zaps}` : '', it.css ? 'CSS' : '', it.js ? (it.jsOn && r.jsAllowed ? 'JavaScript' : t('boost.jsIdle')) : ''].filter(Boolean).join(' · ');
    text.append(site, what);
    const edit = document.createElement('button');
    edit.className = 'btn';
    edit.dataset.act = 'edit';
    edit.textContent = t('boost.modify');
    edit.onclick = () => O.send('boost:edit', { host: it.host });
    const exp = document.createElement('button');
    exp.className = 'btn';
    exp.dataset.act = 'export';
    exp.textContent = '↧';
    exp.title = t('boost.export');
    exp.onclick = () => O.send('boost:export', { host: it.host });
    const del = document.createElement('button');
    del.className = 'btn';
    del.dataset.act = 'delete';
    del.textContent = '×';
    del.title = t('boost.delete');
    del.onclick = async () => drawList(await O.send('boost:delete', { host: it.host }));
    line.append(on, text, edit, exp, del);
    box.appendChild(line);
  }
}

if (LIST) {
  $('import').onclick = async () => {
    const r = await O.send('boost:import');
    if (!r) return;
    drawList(r);
    const res = r.result;
    if (!res) return;
    const parts = [];
    if (res.error) parts.push(t('boost.importBad'));
    if (res.added.length) parts.push(t('boost.imported', { n: res.added.length }));
    if (res.skipped.length) parts.push(t('boost.importSkipped', { n: res.skipped.length }));
    if (res.rejected) parts.push(t('boost.importRejected', { n: res.rejected }));
    $('list-note').hidden = !parts.length;
    $('list-note').textContent = parts.join(' ');
  };
  $('export-all').onclick = () => O.send('boost:export', { all: true });
  O.send('boost:list').then(drawList);
} else {
  // La valeur est relevée à la frappe : un autre enregistrement, revenu entre-temps, peut redessiner le champ.
  for (const [k, ms] of [['name', 250], ['css', 250], ['js', 400]]) {
    $(k).addEventListener('input', () => { const value = $(k).value; later(k, () => ({ [k]: value }), ms); });
  }
  // Boost importé, pas encore relu : la case ouvre la relecture au lieu d'activer.
  const askReview = async () => { $('on').checked = false; showReview(await O.send('boost:review', { host: HOST() })); };
  $('on').addEventListener('change', () => (B && B.review && $('on').checked ? askReview() : save({ enabled: $('on').checked })));
  $('review-open').onclick = askReview;
  $('js-on').addEventListener('change', () => save({ jsOn: $('js-on').checked }));
  $('invert').addEventListener('change', () => save(look({ invert: $('invert').checked })));
  $('swatches').addEventListener('click', (e) => {
    const d = e.target.closest('.dot');
    if (d && B) save(look({ color: d.dataset.color }));
  });
  for (const k of SLIDERS) {
    $(k).addEventListener('input', () => { const value = Number($(k).value); $(k + '-v').textContent = value + ' %'; later(k, () => look({ [k]: value }), 60); });
    // Double-clic sur un curseur : sa valeur d'origine.
    $(k).addEventListener('dblclick', () => save(look({ [k]: 100 })));
  }
  $('font').addEventListener('change', () => save(look({ font: $('font').value })));
  $('case').addEventListener('change', () => save(look({ case: $('case').value })));
  $('reset-look').onclick = () => save({ look: {} });
  $('zap').onclick = async () => draw(await O.send('boost:zap', { host: HOST() }));
  $('reload').onclick = async () => draw(await O.send('boost:reload', { host: HOST() }));
  $('js-settings').onclick = () => O.send('boost:settings');
  $('reset').onclick = async () => { for (const k of Object.keys(timers)) clearTimeout(timers[k]); draw(await O.send('boost:reset', { host: HOST() }), true); };
  $('export').onclick = () => O.send('boost:export', { host: HOST() });
  $('all').onclick = () => O.send('boost:showList');
  O.send('boost:get').then(draw);
  // Retour sur la fenêtre : l'état a pu changer ailleurs (réglages, liste, page rechargée).
  addEventListener('focus', () => O.send('boost:get').then(draw));
}
