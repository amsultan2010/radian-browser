// Feuille d'onglet (voir src/main/sheets.js) : demande d'autorisation, choix de
// l'écran à partager, identifiants HTTP, avertissement de certificat, page
// plantée… Tout ce qui est affiché vient du processus principal ; rien n'est
// jamais inséré comme du HTML : uniquement du texte.
const $ = (id) => document.getElementById(id);
let P = null; // ce que la feuille affiche
let shownAt = 0;
// Un clic (ou Entrée) tombé à l'instant où la feuille apparaît n'est pas un
// choix : une page peut prévoir quand elle s'ouvre, pas décider à notre place.
const GUARD = 500;
const settled = () => Date.now() - shownAt > GUARD;
const answer = (value) => O.send('sheet:answer', value);
const act = (name, arg) => O.send('sheet:act', { name, arg });

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

// Bouton. `risky` : choix qui engage (autoriser, continuer, partager) ; il
// attend que la feuille soit affichée depuis un instant.
function button(label, fn, { cls = '', risky = false, id = '' } = {}) {
  const b = el('button', 'b ' + cls, label);
  if (id) b.id = id;
  b.onclick = () => { if (!risky || settled()) fn(); };
  return b;
}

function rows(pairs) {
  const dl = el('dl', 'rows');
  for (const [k, v] of pairs) if (v) dl.append(el('dt', '', k), el('dd', '', v));
  return dl;
}

const day = (seconds) => (seconds ? new Date(seconds * 1000).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' }) : '');

function certRows(c) {
  if (!c) return el('p', '', t('cert.noDetails'));
  return rows([
    [t('cert.subject'), c.subject],
    [t('cert.issuer'), c.issuer],
    [t('cert.validFrom'), day(c.validStart)],
    [t('cert.validTo'), day(c.validExpiry)],
    [t('cert.fingerprint'), c.fingerprint],
    [t('cert.serial'), c.serial],
  ]);
}

function head(icon, title, site, warn) {
  $('mark-icon').setAttribute('href', '#i-' + icon);
  $('mark').className = warn ? 'warn' : '';
  $('title').textContent = title;
  $('site').textContent = site || '';
  document.title = title;
}

const KINDS = {
  // Demande d'autorisation d'un site (caméra, micro, position, notifications…).
  perm(p, body, buttons) {
    head(p.icon || 'info', t('perm.title', { origin: p.site }), '');
    for (const line of p.lines) body.append(el('p', 'strong', line));
    if (p.note) body.append(el('p', '', p.note));
    // Comme dans Arc : la réponse se change ensuite depuis le site (cadenas, bouclier).
    const later = el('p', 'hint', t('perm.changeLater'));
    later.id = 'later';
    body.append(later);
    buttons.append(button(t('perm.deny'), () => answer('deny'), { id: 'deny' }), button(t('perm.allow'), () => answer('allow'), { cls: 'primary', risky: true, id: 'allow' }));
    return 'deny';
  },
  // Le système refuse l'accès à Orbe : on dit lequel, et où le changer.
  os(p, body, buttons) {
    head(p.icon || 'warn', p.title, '', true);
    body.append(el('p', '', p.text));
    if (p.settings) buttons.append(button(t('os.openSettings'), () => act('settings'), { id: 'settings' }));
    buttons.append(button(t('sheet.ok'), () => answer('ok'), { cls: 'primary', id: 'ok' }));
    return 'ok';
  },
  // Partage d'écran : écrans, fenêtres, ou cet onglet.
  picker(p, body, buttons) {
    document.body.classList.add('wide');
    head('screen', t('share.title', { origin: p.site }), t('share.hint'));
    // Liste complétée après coup (écrans, fenêtres) : le choix déjà fait est gardé.
    let chosen = (p.sources || []).some((s) => s.id === pickerChoice) ? pickerChoice : null;
    const share = button(t('share.go'), () => answer({ id: chosen, audio: audio.checked }), { cls: 'primary', risky: true, id: 'share' });
    share.disabled = true;
    const audioLine = el('label', 'check');
    const audio = el('input');
    audio.type = 'checkbox';
    audio.id = 'audio';
    audioLine.append(audio, el('span', '', t('share.audio')));
    const sync = () => {
      const src = (P.sources || []).find((s) => s.id === chosen);
      share.disabled = !src;
      const can = !!src && P.audioRequested && (src.kind === 'tab' ? P.audio.tab : P.audio.screen);
      audioLine.hidden = !can;
      if (!can) audio.checked = false;
    };
    const grid = el('div', 'grid');
    const draw = () => {
      grid.textContent = '';
      const groups = [['tab', 'share.tab'], ['screen', 'share.screens'], ['window', 'share.windows']];
      for (const [kind] of groups) {
        for (const s of (P.sources || []).filter((x) => x.kind === kind)) {
          const b = el('button', 'src' + (s.id === chosen ? ' sel' : ''));
          b.dataset.id = s.id;
          b.dataset.kind = s.kind;
          const thumb = el('div', 'thumb');
          if (s.thumb && /^data:image\//.test(s.thumb)) { const img = el('img'); img.src = s.thumb; img.alt = ''; img.draggable = false; thumb.append(img); } else thumb.innerHTML = '<svg class="i"><use href="#i-screen"/></svg>';
          b.append(thumb, el('div', 'name', s.kind === 'tab' ? t('share.thisTab') : s.name));
          b.title = s.kind === 'tab' ? t('share.thisTab') : s.name;
          b.onclick = () => { chosen = s.id; pickerChoice = chosen; draw(); sync(); };
          b.ondblclick = () => share.click();
          grid.append(b);
        }
      }
      if (!grid.children.length) grid.append(el('p', '', t('share.none')));
    };
    if (p.os && p.os !== 'granted') {
      body.append(el('p', 'warn', t(p.os === 'not-determined' ? 'share.osAsk' : 'share.osDenied')));
      const open = button(t('os.openSettings'), () => act('settings'), { id: 'settings' });
      const again = button(t('share.refresh'), () => act('refresh'), { id: 'refresh' });
      const line = el('div', 'buttons');
      line.style.justifyContent = 'flex-start';
      line.style.marginTop = '0';
      line.append(open, again);
      body.append(line);
    }
    body.append(grid, audioLine);
    draw();
    sync();
    buttons.append(button(t('sheet.cancel'), () => answer(null), { id: 'cancel' }), share);
    return null;
  },
  // Certificat refusé : page d'avertissement. Le choix par défaut ramène en lieu sûr.
  cert(p, body, buttons) {
    head('warn', t('cert.title'), '', true);
    const site = $('site');
    site.textContent = '';
    site.append(el('b', '', p.host));
    body.append(el('p', 'strong', t('cert.lead', { host: p.host })), el('p', '', t('cert.why.' + p.reason)));
    if (p.hard) body.append(el('p', 'warn', t(p.hsts ? 'cert.hsts' : (p.unverified ? 'cert.unverified' : 'cert.hard'))));
    const details = el('div', '');
    details.id = 'details';
    details.hidden = true;
    details.style.display = 'flex';
    details.style.flexDirection = 'column';
    details.style.gap = '10px';
    details.append(rows([[t('cert.error'), p.error]]), certRows(p.cert));
    const back = button(t('cert.back'), () => answer('back'), { cls: 'primary', id: 'back' });
    const more = button(t('cert.details'), () => { details.hidden = !details.hidden; }, { id: 'more' });
    buttons.append(back, more);
    body.append(details);
    if (p.canProceed) {
      const go = button(t('cert.proceed', { host: p.host }), () => answer('proceed'), { cls: 'link danger', risky: true, id: 'proceed' });
      details.append(el('p', '', t('cert.proceedHint')), go);
    }
    setTimeout(() => back.focus(), 0);
    return 'back';
  },
  // Identifiants demandés par le serveur (ou par un proxy), en HTTP.
  auth(p, body, buttons) {
    head('key', t(p.proxy ? 'auth.titleProxy' : 'auth.title'), '');
    const site = $('site');
    site.textContent = '';
    site.append(el('b', '', p.host));
    // Demande faite par la page en cours de chargement : son adresse, bien en vue.
    if (p.pending) { const line = el('p', 'strong', p.pending); line.id = 'pending'; line.style.userSelect = 'text'; body.append(el('p', '', t('auth.pending')), line); }
    if (p.realm) { body.append(el('p', '', t('auth.realm'))); body.append(el('div', 'quote', p.realm)); }
    if (p.insecure) body.append(el('p', 'warn', t('auth.insecure')));
    if (p.retry) body.append(el('p', 'warn', t('auth.retry')));
    const field = (id, label, type) => {
      const wrap = el('label', 'field');
      const input = el('input');
      input.id = id;
      input.type = type;
      input.spellcheck = false;
      input.autocomplete = 'off';
      wrap.append(el('span', '', label), input);
      body.append(wrap);
      return input;
    };
    const user = field('user', t('auth.user'), 'text');
    const pass = field('pass', t('auth.pass'), 'password');
    const submit = () => answer({ username: user.value, password: pass.value });
    for (const input of [user, pass]) input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && settled()) submit(); });
    buttons.append(button(t('sheet.cancel'), () => answer(null), { id: 'cancel' }), button(t('auth.go'), submit, { cls: 'primary', risky: true, id: 'ok' }));
    setTimeout(() => user.focus(), 0);
    return null;
  },
  // Page dont le processus a disparu.
  crash(p, body, buttons) {
    head('sad', t('crash.title'), '');
    body.append(el('p', '', t(p.oom ? 'crash.oom' : 'crash.text')));
    buttons.append(button(t('crash.reload'), () => answer('reload'), { cls: 'primary', id: 'reload' }));
    return undefined;
  },
  // Page qui ne répond plus.
  hung(p, body, buttons) {
    head('sad', t('hung.title'), '');
    body.append(el('p', '', t('hung.text')));
    buttons.append(button(t('hung.wait'), () => answer('wait'), { id: 'wait' }), button(t('crash.reload'), () => answer('reload'), { cls: 'primary', id: 'reload' }));
    return 'wait';
  },
  // Lien vers une autre application (mailto:, tel:, lien d'application).
  external(p, body, buttons) {
    head('out', t('external.title', { scheme: p.scheme }), '');
    const site = $('site');
    site.textContent = '';
    site.append(el('b', '', p.site));
    body.append(el('p', '', t('external.text', { site: p.site })), el('div', 'quote', p.url));
    const line = el('label', 'check');
    const always = el('input');
    always.type = 'checkbox';
    always.id = 'always';
    line.append(always, el('span', '', t('external.always', { site: p.site, scheme: p.scheme })));
    if (p.note) body.append(el('p', '', p.note));
    if (p.canRemember) body.append(line);
    // « Annuler » est un refus (false), retenu tant que l'onglet reste sur cette page.
    buttons.append(button(t('sheet.cancel'), () => answer(false), { id: 'cancel' }), button(t('external.go'), () => answer({ open: true, always: always.checked }), { cls: 'primary', risky: true, id: 'ok' }));
    return false;
  },
  // Choix d'un certificat client demandé par le site.
  choose(p, body, buttons) {
    head('key', t('clientCert.title'), '');
    const site = $('site');
    site.textContent = '';
    site.append(el('b', '', p.host));
    body.append(el('p', '', t('clientCert.text')));
    let chosen = -1;
    const ok = button(t('sheet.ok'), () => answer(chosen), { cls: 'primary', risky: true, id: 'ok' });
    ok.disabled = true;
    const list = el('div', 'list');
    p.items.forEach((it, i) => {
      const row = el('button', 'item pick');
      row.dataset.i = String(i);
      const txt = el('div', 'grow');
      txt.style.textAlign = 'left';
      txt.append(el('div', '', it.label), el('div', 'sub', it.sub));
      row.append(txt);
      row.onclick = () => { chosen = i; ok.disabled = false; for (const r of list.children) r.classList.toggle('sel', r === row); };
      list.append(row);
    });
    body.append(list);
    buttons.append(button(t('sheet.cancel'), () => answer(null), { id: 'cancel' }), ok);
    return null;
  },
  // Informations du site : connexion, certificat, autorisations accordées ou refusées.
  site(p, body, buttons) {
    const secure = p.security === 'secure';
    head(secure ? 'lock' : (p.security === 'local' ? 'info' : 'warn'), t('site.sec.' + p.security), '', p.security === 'insecure' || p.security === 'broken');
    const site = $('site');
    site.textContent = '';
    site.append(el('b', '', p.site));
    body.append(el('p', '', t('site.secText.' + p.security)));
    if (p.cert) { body.append(el('h2', '', t('site.cert'))); body.append(certRows(p.cert)); }
    body.append(el('h2', '', t('site.perms')));
    if (!p.perms.length) body.append(el('p', '', t('site.noPerms')));
    else {
      const list = el('div', 'list');
      list.id = 'perms';
      for (const perm of p.perms) {
        const row = el('div', 'item');
        row.dataset.key = perm.key;
        const reset = button(t('site.reset'), async () => { const next = await act('reset', perm.key); if (next) show(next, true); }, {});
        reset.dataset.do = 'reset';
        row.append(el('div', 'grow', perm.label), el('span', 'state ' + (perm.value ? 'yes' : 'no'), t(perm.value ? 'site.allowed' : 'site.denied')), reset);
        list.append(row);
      }
      body.append(list);
    }
    if (p.capture && p.capture.length) body.append(el('p', 'warn', p.capture.join(' · ')));
    if (p.perms.length) buttons.append(button(t('site.resetAll'), async () => { const next = await act('reset', '*'); if (next) show(next, true); }, { id: 'reset-all' }));
    buttons.append(button(t('sheet.close'), () => answer(null), { cls: 'primary', id: 'close' }));
    return null;
  },
  // Centre de contrôle du site (bouclier) : bloqueur, autorisations, données, Boost,
  // mode développeur, extensions. Chaque clic part au processus principal, qui
  // revérifie le site de l'onglet avant d'agir et renvoie l'état à afficher.
  control(p, body, buttons) {
    const secure = p.security === 'secure';
    head(secure ? 'lock' : (p.security === 'local' ? 'info' : 'warn'), p.site, t('site.sec.' + p.security), p.security === 'insecure' || p.security === 'broken');
    const run = async (name, arg) => { const next = await act(name, arg); if (next) show(next, true); };
    const section = (title, id) => { const box = el('div', 'list'); box.id = id; body.append(el('h2', '', title), box); return box; };
    // Ligne : libellé (et précision), puis une case à cocher ou des boutons.
    const line = (box, label, sub, ...controls) => {
      const row = el('div', 'item');
      const text = el('div', 'grow');
      text.append(el('div', '', label));
      if (sub) text.append(el('div', 'sub', sub));
      row.append(text, ...controls);
      box.append(row);
      return row;
    };
    const toggle = (id, on, enabled, name) => {
      const input = el('input');
      input.type = 'checkbox';
      input.id = id;
      input.checked = !!on;
      input.disabled = !enabled;
      // L'état affiché est celui que renvoie le processus principal, pas celui du clic.
      input.onclick = (e) => { e.preventDefault(); if (settled()) run(name); };
      return input;
    };
    const small = (id, label, name, arg, cls = '') => button(label, () => run(name, arg), { id, cls: 'small ' + cls, risky: true });

    const quick = el('div', 'quick');
    quick.append(button(t('edit.copyUrl'), () => run('copy'), { id: 'c-copy', cls: 'small' }));
    if (p.share) quick.append(button(t('tb.share'), () => run('share'), { id: 'c-share', cls: 'small' }));
    quick.append(button(t('ctl.capture'), () => run('capture'), { id: 'c-capture', cls: 'small' }), button(t('ctl.details'), () => run('details'), { id: 'c-details', cls: 'small' }));
    body.append(quick);

    const shield = section(t('ctl.blocking'), 'c-shield');
    line(shield, t('adblock.thisSite'), p.adblock.on ? t('adblock.count', { n: p.blocked }) : t('ctl.blockingOff'), toggle('c-shield-site', p.adblock.on && p.adblock.site, p.adblock.on, 'shield'));
    line(shield, t('adblock.everywhere'), '', toggle('c-shield-all', p.adblock.on, true, 'shieldAll'));

    const perms = section(t('site.perms'), 'perms');
    if (!p.perms.length) line(perms, t('site.noPerms'), '');
    for (const perm of p.perms) {
      const row = line(perms, perm.label, '', el('span', 'state ' + (perm.value ? 'yes' : 'no'), t(perm.value ? 'site.allowed' : 'site.denied')), small('', t('site.reset'), 'reset', perm.key));
      row.dataset.key = perm.key;
      row.lastChild.dataset.do = 'reset';
    }
    if (p.capture && p.capture.length) body.append(el('p', 'warn', p.capture.join(' · ')));

    const data = section(t('ctl.data'), 'c-data');
    const n = el('span', '', p.cookies == null ? '' : t('ctl.cookieCount', { n: p.cookies }));
    n.id = 'c-cookies';
    line(data, t('ctl.cookies'), t('ctl.cookiesHint'), n, small('c-clear-cookies', t('ctl.clear'), 'cookies'));
    line(data, t('ctl.cache'), t('ctl.cacheHint'), small('c-clear-cache', t('ctl.empty'), 'cache'));

    const tools = section(t('ctl.tools'), 'c-tools');
    if (p.boost.can) {
      const controls = [];
      if (p.boost.has) controls.push(toggle('c-boost', p.boost.enabled, p.boost.all, 'boost'));
      line(tools, t('boost.thisSite'), p.boost.has ? '' : t('ctl.noBoost'), small('c-zap', t('ctl.zap'), 'zap'), small('c-boost-edit', t(p.boost.has ? 'set.edit' : 'ctl.create'), 'boostEdit'), ...controls);
    }
    line(tools, t('view.devMode'), p.dev.can ? (p.dev.auto ? t('ctl.devAuto') : t('ctl.devHint')) + (p.dev.keys ? ' ' + p.dev.keys : '') : t('ctl.devPrivate'), toggle('c-dev', p.dev.on, p.dev.can, 'dev'));

    if (p.extensions.length) {
      const exts = section(t('pane.extensions'), 'c-exts');
      for (const x of p.extensions) {
        const open = small('', t('ctl.open'), 'ext', x.id);
        open.disabled = !x.enabled;
        const row = line(exts, x.title, '', ...(x.badge ? [el('span', 'badge', x.badge)] : []), open);
        row.dataset.ext = x.id;
      }
    }
    buttons.append(button(t('sheet.close'), () => answer(null), { cls: 'primary', id: 'close' }));
    return null;
  },
};

let pickerChoice = null;
let onEscape; // réponse envoyée par Échap (undefined : Échap ne fait rien)

function show(p, keepGuard) {
  if (!p || !KINDS[p.kind]) return;
  P = p;
  if (!keepGuard) shownAt = Date.now();
  // Demande d'autorisation et centre de contrôle : une bulle ancrée en haut de la page, du côté
  // de l'adresse et du cadenas, plutôt qu'une carte au milieu. La vue couvre toujours toute la page.
  document.body.className = p.cover ? 'cover' : (p.kind === 'perm' || p.kind === 'control' ? 'anchor ' + p.kind : '');
  const body = $('body');
  const buttons = $('buttons');
  body.textContent = '';
  buttons.textContent = '';
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '10px';
  onEscape = KINDS[p.kind](p, body, buttons);
  $('card').hidden = false;
  $('card').dataset.kind = p.kind;
}

O.on('overlay', (m) => {
  // La feuille vient (de nouveau) d'apparaître : le délai de garde repart.
  if (m && m.arm) shownAt = Date.now();
  if (m && m.sheet) show(m.sheet, true);
});
O.on('settings', (s) => { if (setLang(s.lang) && P) show(P, true); });
// Centre de contrôle : un clic à côté de la carte le ferme.
document.addEventListener('mousedown', (e) => { if (P && P.kind === 'control' && e.target === document.body) answer(null); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && P && onEscape !== undefined) { e.preventDefault(); answer(onEscape); }
});
O.send('sheet:ready').then((p) => show(p));
