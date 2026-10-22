// Outils partagés par toutes les pages de l'interface.
const O = window.orbe;
let lang = O.lang || 'fr';

// Classe « mac » ou « win » sur <html> : les feuilles de style adaptent
// l'habillage (boutons de fenêtre, police) dans un bloc à part.
document.documentElement.classList.add(O.platform || 'mac');
// Touche « principale » d'un événement clavier ou souris : ⌘ sur macOS, Ctrl ailleurs.
const modKey = (e) => (O.platform === 'mac' || !O.platform ? e.metaKey : e.ctrlKey);

// Raccourcis en vigueur, par nom de commande : suivent les changements faits
// dans les réglages (événement « keys »).
let KEYS = O.keys || {};
// Textes qui citent le raccourci d'une commande.
const KEY_IN_TEXT = { 'side.empty': 'newTab', 'side.toggle': 'toggleSidebar' };

function t(key, vars) {
  let s = (O.locales[lang] && O.locales[lang][key]) || O.locales.fr[key] || key;
  const cmd = KEY_IN_TEXT[key];
  const before = cmd && O.defaultKeys && O.defaultKeys[cmd];
  if (before && KEYS[cmd] !== before) s = KEYS[cmd] ? s.replace(before, KEYS[cmd]) : s.replace(` (${before})`, '').replace(before, '…');
  if (vars) for (const k of Object.keys(vars)) s = s.replace(`{${k}}`, vars[k]);
  return s;
}

function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  for (const el of root.querySelectorAll('[data-t-title]')) el.title = t(el.dataset.tTitle);
  // Bouton à infobulle maison : pas de `title` (deux infobulles se suivraient), mais un nom lisible par les aides techniques.
  for (const el of root.querySelectorAll('[data-tip]')) el.setAttribute('aria-label', t(el.dataset.tip));
  for (const el of root.querySelectorAll('[data-t-ph]')) el.placeholder = t(el.dataset.tPh);
  // Raccourci d'une commande, dans la notation du système.
  for (const el of root.querySelectorAll('[data-key]')) if (KEYS[el.dataset.key]) el.textContent = KEYS[el.dataset.key];
}

// Renvoie true si la langue a changé (la page doit alors se redessiner).
function setLang(next) {
  if (!next || next === lang) return false;
  lang = next;
  document.documentElement.lang = next;
  applyI18n();
  return true;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function host(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'orbe:') return 'Orbe';
    return u.host.replace(/^www\./, '') || url;
  } catch {
    return url || '';
  }
}

// --- Adresse affichée à l'étroit (volet d'une vue scindée, aperçu, petite fenêtre) ----
// Ce qui dit à qui l'on a affaire, c'est la FIN du nom d'hôte : le domaine que
// quelqu'un a enregistré. Dans « compte.banque.fr.connexion-securisee.example »,
// c'est « connexion-securisee.example ». Coupée à droite, une adresse longue ne
// montrerait que son début, choisi par le site. Ici le domaine est mis en avant,
// et quand la place manque c'est la GAUCHE qui s'efface (puis le chemin, avant
// le nom d'hôte) : la fin du nom d'hôte reste toujours visible.
// Suffixes à deux étages les plus courants. Ce n'est pas la liste publique entière : pour
// un suffixe absent d'ici, la mise en avant peut tomber un étage trop court — la fin du
// nom d'hôte, elle, reste visible dans tous les cas.
const SUFFIX2 = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'ltd.uk', 'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'co.nz', 'org.nz', 'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
  'co.kr', 'or.kr', 'co.in', 'net.in', 'org.in', 'co.za', 'org.za', 'co.il', 'com.br', 'net.br', 'org.br', 'gov.br', 'com.mx', 'com.ar', 'com.co', 'com.pe', 'com.ve', 'com.tr', 'com.cn', 'net.cn', 'org.cn',
  'com.hk', 'com.sg', 'com.tw', 'com.my', 'com.ph', 'com.vn', 'co.th', 'co.id', 'com.ua', 'com.pl', 'com.ru', 'com.eg', 'com.sa', 'com.ng', 'com.gh', 'co.ke', 'co.ma', 'com.sn', 'gouv.fr', 'asso.fr', 'com.fr',
  'gouv.sn', 'com.be', 'com.es', 'com.pt', 'com.gr', 'co.at', 'or.at', 'com.de', 'github.io', 'gitlab.io', 'pages.dev', 'workers.dev', 'web.app', 'firebaseapp.com', 'vercel.app', 'netlify.app', 'herokuapp.com',
  'appspot.com', 'blogspot.com', 'cloudfront.net', 'azurewebsites.net', 's3.amazonaws.com', 'glitch.me', 'repl.co', 'ngrok.io', 'ngrok-free.app', 'onrender.com', 'fly.dev', 'r2.dev']);
// Nom d'hôte -> { sub : ce qui précède le domaine enregistré (avec son point), domain }.
function siteParts(hostname) {
  const h = String(hostname || '');
  const labels = h.split('.');
  if (labels.length < 3 || /^\[.*\]$/.test(h) || /^\d+(\.\d+){3}$/.test(h)) return { sub: '', domain: h };
  const n = SUFFIX2.has(labels.slice(-2).join('.').toLowerCase()) ? 3 : 2;
  return { sub: labels.slice(0, -n).join('.') + (labels.length > n ? '.' : ''), domain: labels.slice(-n).join('.') };
}
// Écrit `text` (une adresse, avec ou sans « https:// ») dans `el`, en trois parties :
// ce qui précède le domaine, le domaine (et son port), le reste. Le texte de `el`
// reste exactement `text`.
function addressInto(el, text) {
  const s = String(text || '');
  el.textContent = '';
  el.classList.add('addr');
  const m = /^([a-z][a-z0-9+.-]*:\/\/)?([^/?#\s]*)([^]*)$/i.exec(s);
  const at = m ? m[2].lastIndexOf('@') : -1;
  const hostport = m ? m[2].slice(at + 1) : '';
  const hp = /^(\[[^\]]*\]|[^:]*)(:\d*)?$/.exec(hostport);
  if (!m || !hp || !hp[1] || !/^[^\s]+$/.test(hp[1]) || (!m[1] && !/[.:]|^localhost$/i.test(hostport))) { el.classList.remove('addr'); el.textContent = s; return el; }
  const parts = siteParts(hp[1]);
  const hostEl = document.createElement('span');
  hostEl.className = 'addr-host';
  const inner = document.createElement('bdi');
  inner.dir = 'ltr';
  const sub = document.createElement('span');
  sub.className = 'addr-sub';
  sub.textContent = (m[1] || '') + m[2].slice(0, at + 1) + parts.sub;
  const dom = document.createElement('span');
  dom.className = 'addr-domain';
  dom.textContent = parts.domain + (hp[2] || '');
  inner.append(sub, dom);
  hostEl.appendChild(inner);
  const rest = document.createElement('span');
  rest.className = 'addr-rest';
  rest.textContent = m[3];
  el.append(hostEl, rest);
  return el;
}

// Pastille de remplacement quand un site n'a pas d'icône.
function letterIcon(text) {
  const span = document.createElement('span');
  span.className = 'letter';
  span.textContent = (text || '?').trim().charAt(0).toUpperCase() || '?';
  return span;
}

// Icône probable d'un site dont la page n'a pas encore été chargée :
// demandée au site lui-même, jamais à un service tiers, et une seule fois par
// site : un échec est retenu tant que la vue vit. Sans cela, chaque nouveau
// rendu des lignes (changement d'Espace) redemandait /favicon.ico à tous les
// sites qui n'en ont pas.
const guessedIcons = new Set();
const missingIcons = new Set();
function guessIcon(pageUrl) {
  try {
    const u = new URL(pageUrl);
    if (u.protocol !== 'https:') return '';
    const url = u.origin + '/favicon.ico';
    if (missingIcons.has(url)) return '';
    guessedIcons.add(url);
    return url;
  } catch {
    return '';
  }
}

function faviconEl(url, fallbackText) {
  if (!url || !/^(https?|data):/i.test(url)) return letterIcon(fallbackText);
  const img = document.createElement('img');
  img.className = 'favicon';
  img.draggable = false;
  img.decoding = 'async';
  img.loading = 'lazy';
  img.onerror = () => { if (guessedIcons.has(url)) missingIcons.add(url); img.replaceWith(letterIcon(fallbackText)); };
  img.src = url;
  return img;
}

document.documentElement.lang = lang;
document.addEventListener('DOMContentLoaded', () => applyI18n());
O.on('keys', (k) => { KEYS = k || {}; applyI18n(); });
