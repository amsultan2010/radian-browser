// Tableaux (les « Easels » d'Arc) : des plans libres où poser captures de pages,
// images, textes, formes et dessins.
// Chaque tableau est un fichier userData/easels/<id>.json, écrit de façon
// atomique ; ses images sont des fichiers à part dans userData/easels/<id>/.
// Rien ne passe par orbe.json, réécrit bien trop souvent pour porter des images.
// La page (src/renderer/easel.js) ne lit et n'écrit qu'à travers les actions
// « easel:* » ci-dessous : identifiants et noms de fichiers sont validés ici, la
// page ne fournit jamais de chemin.
const { app, dialog, webContents } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { store } = require('./store');
const { boundsOf } = require('./motion');

const PAGE = 'orbe://app/easel.html';
const ID = /^[a-f0-9]{16}$/;
const IMAGE = /^[a-f0-9]{16}\.(png|jpg|gif|webp)$/;
const ITEM_ID = /^[A-Za-z0-9_-]{1,32}$/;
const TOKEN = /^[a-z]{1,12}$/;
const TYPES = new Set(['text', 'note', 'image', 'rect', 'ellipse', 'arrow', 'pen']);
const MAX_ITEMS = 5000;
const MAX_JSON = 24 * 1024 * 1024;
const MAX_IMAGE = 25 * 1024 * 1024;
const MAX_THUMB = 512 * 1024;
const MAX_POINTS = 40000; // nombres (x, y alternés) par tracé
const MIME = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

const t = (key, vars) => store.t(key, null, vars);
const newId = () => crypto.randomBytes(8).toString('hex');
const root = () => path.join(app.getPath('userData'), 'easels');
const fileOf = (id) => path.join(root(), id + '.json');
const dirOf = (id) => path.join(root(), id);

let index = null; // id -> { id, title, created, updated, count }
const pending = new Map(); // id -> dernier JSON à écrire
const writing = new Map(); // id -> écriture en cours
const thumbs = new Map(); // id -> vignette à écrire avec le prochain enregistrement
const inbox = new Map(); // id -> éléments en attente pour une page ouverte
let quitting = false;

// --- Validation ---------------------------------------------------------------
const num = (v, min, max, dflt = 0) => (Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : dflt);
const coord = (v) => Math.round(num(v, -1e7, 1e7) * 100) / 100;
const webUrl = (u) => (typeof u === 'string' && u.length <= 2000 && /^https?:\/\//i.test(u) ? u : '');

// Ne garde d'un élément que les champs connus, dans leurs bornes. Ce qui vient
// de la page — ou d'un fichier modifié à la main — n'est jamais repris tel quel.
function cleanItem(it) {
  if (!it || typeof it !== 'object' || !TYPES.has(it.type) || !ITEM_ID.test(String(it.id || ''))) return null;
  const arrow = it.type === 'arrow';
  const o = {
    id: String(it.id),
    type: it.type,
    x: coord(it.x),
    y: coord(it.y),
    // Une flèche va de (x, y) à (x + w, y + h) : ses dimensions sont signées.
    w: arrow ? coord(it.w) : Math.max(1, coord(it.w)),
    h: arrow ? coord(it.h) : Math.max(1, coord(it.h)),
  };
  if (typeof it.color === 'string' && TOKEN.test(it.color)) o.color = it.color;
  if (it.type === 'text' || it.type === 'note') {
    o.text = String(it.text == null ? '' : it.text).slice(0, 20000);
    o.size = num(it.size, 8, 200, 18);
  }
  if (it.type === 'rect' || it.type === 'ellipse') o.fill = it.fill === true;
  if (it.type === 'rect' || it.type === 'ellipse' || arrow || it.type === 'pen') o.sw = num(it.sw, 1, 24, 2);
  if (it.type === 'image') {
    if (!IMAGE.test(String(it.img || ''))) return null;
    o.img = it.img;
    const src = webUrl(it.sourceUrl);
    if (src) { o.sourceUrl = src; o.sourceTitle = String(it.sourceTitle || '').slice(0, 300); }
    // Texte alternatif saisi par l'utilisateur.
    if (typeof it.alt === 'string' && it.alt.trim()) o.alt = it.alt.trim().slice(0, 500);
  }
  if (it.type === 'pen') {
    if (!Array.isArray(it.pts) || it.pts.length < 2 || it.pts.length > MAX_POINTS) return null;
    o.pts = it.pts.slice(0, it.pts.length - (it.pts.length % 2)).map((v) => Math.round(num(v, -1e7, 1e7) * 10) / 10);
    o.pw = Math.max(1, coord(it.pw));
    o.ph = Math.max(1, coord(it.ph));
  }
  return o;
}

function cleanDoc(d, id) {
  const src = d && typeof d === 'object' ? d : {};
  const seen = new Set();
  const items = [];
  for (const raw of Array.isArray(src.items) ? src.items.slice(0, MAX_ITEMS) : []) {
    const it = cleanItem(raw);
    if (it && !seen.has(it.id)) { seen.add(it.id); items.push(it); }
  }
  const v = src.view && typeof src.view === 'object' ? src.view : {};
  return {
    id,
    title: String(src.title || '').slice(0, 120),
    created: num(src.created, 0, 9e15, Date.now()),
    updated: num(src.updated, 0, 9e15, Date.now()),
    view: { x: coord(v.x), y: coord(v.y), z: num(v.z, 0.1, 8, 1) },
    items,
  };
}

// Type réel d'une image, d'après ses premiers octets (jamais d'après son nom).
function sniff(b) {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 6 && b.toString('latin1', 0, 4) === 'GIF8' && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'gif';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return '';
}

const bytes = (data) => {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return null;
};

// --- Disque -------------------------------------------------------------------
async function atomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, data);
  if (quitting) { await fs.promises.unlink(tmp).catch(() => {}); return; } // flush() a déjà écrit plus récent
  await fs.promises.rename(tmp, file);
}

function atomicSync(file, data) {
  const tmp = file + '.sync.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

// Une seule écriture à la fois par tableau ; les enregistrements rapprochés
// se résument au dernier.
function queue(id, json) {
  pending.set(id, json);
  if (!writing.has(id)) {
    writing.set(id, (async () => {
      try {
        while (pending.has(id) && !quitting) {
          const data = pending.get(id);
          pending.delete(id);
          await atomic(fileOf(id), data);
          const thumb = thumbs.get(id);
          thumbs.delete(id);
          if (thumb && index.has(id) && !quitting) {
            await fs.promises.mkdir(dirOf(id), { recursive: true });
            await atomic(path.join(dirOf(id), 'thumb.png'), thumb);
          }
        }
      } catch (err) {
        console.error('[orbe] tableau : écriture impossible', err.message);
      } finally {
        writing.delete(id);
        if (!index.has(id)) sweepDeleted(id); // supprimé pendant l'écriture : rien ne doit rester
      }
    })());
  }
  return writing.get(id);
}

// Supprime les fichiers d'un tableau. Une écriture encore en cours (page du
// tableau restée ouverte) ou un verrou passager (Windows, antivirus) peuvent
// faire échouer ou annuler le premier passage : on repasse quelques fois.
function sweepDeleted(id, attempt = 0) {
  let left = false;
  try {
    fs.rmSync(fileOf(id), { force: true, maxRetries: 4, retryDelay: 60 });
    fs.rmSync(dirOf(id), { recursive: true, force: true, maxRetries: 4, retryDelay: 60 });
  } catch (err) {
    left = true;
    if (attempt >= 5) console.error('[orbe] tableau : suppression incomplète', err.message);
  }
  if (attempt >= 5 || loadIndex().has(id)) return;
  const again = [150, 400, 1000, 2500, 6000][attempt];
  const timer = setTimeout(() => {
    if (loadIndex().has(id)) return; // recréé entre-temps sous le même identifiant : on n'y touche plus
    if (left || fs.existsSync(fileOf(id)) || fs.existsSync(dirOf(id)) || attempt < 2) sweepDeleted(id, attempt + 1);
  }, again);
  if (timer.unref) timer.unref();
}

function readDoc(id) {
  if (!ID.test(String(id))) return null;
  // Une version plus récente attend peut-être encore d'être écrite.
  const raw = pending.has(id) ? pending.get(id) : (() => { try { return fs.readFileSync(fileOf(id), 'utf8'); } catch { return null; } })();
  if (raw == null) return null;
  try { return cleanDoc(JSON.parse(raw), id); } catch { return null; }
}

const meta = (d) => ({ id: d.id, title: d.title, created: d.created, updated: d.updated, count: d.items.length });

function loadIndex() {
  if (index) return index;
  index = new Map();
  let names = [];
  try { names = fs.readdirSync(root()); } catch {}
  for (const name of names) {
    const m = /^([a-f0-9]{16})\.json$/.exec(name);
    const d = m && readDoc(m[1]);
    if (d) index.set(d.id, meta(d));
  }
  return index;
}

function writeDoc(doc, { sync = false } = {}) {
  fs.mkdirSync(root(), { recursive: true });
  loadIndex().set(doc.id, meta(doc));
  const json = JSON.stringify(doc);
  if (!sync) return queue(doc.id, json);
  pending.delete(doc.id);
  atomicSync(fileOf(doc.id), json);
  return undefined;
}

// --- Tableaux -----------------------------------------------------------------
function list() {
  return [...loadIndex().values()].sort((a, b) => b.updated - a.updated);
}

function create(title = '') {
  const now = Date.now();
  const doc = cleanDoc({ title, created: now, updated: now }, newId());
  writeDoc(doc, { sync: true });
  return doc;
}

async function save(a) {
  const id = String((a && a.id) || '');
  if (!ID.test(id) || !loadIndex().has(id)) return false; // inconnu ou supprimé entre-temps
  if (typeof a.json !== 'string' || a.json.length > MAX_JSON) return false;
  let parsed;
  try { parsed = JSON.parse(a.json); } catch { return false; }
  const doc = cleanDoc(parsed, id);
  doc.created = index.get(id).created;
  doc.updated = Date.now();
  const thumb = bytes(a.thumb);
  if (thumb && thumb.length <= MAX_THUMB && sniff(thumb) === 'png') {
    // Écrite à la suite du document : jamais deux écritures en même temps, et rien
    // n'est recréé si le tableau a été supprimé entre-temps.
    thumbs.set(id, thumb);
  }
  await writeDoc(doc);
  return true;
}

// Tableau supprimé : son onglet épinglé redevient un onglet du jour (épinglé, il resterait
// dans la barre sans plus rien ouvrir). La page, si elle est ouverte, dit que le tableau n'existe plus.
function unpin(id) {
  let all = [];
  try { all = require('./window').OrbeWindow.all; } catch { return; }
  for (const w of all) {
    for (const [tabId, tab] of Object.entries(w.data.tabs)) {
      if (!tab.internal || !String(tab.url).split('#')[0].endsWith('easel.html?id=' + id)) continue;
      const loc = w.locate(tabId);
      if (!loc || loc.list === 'today') continue;
      try { w.move({ id: tabId, to: 'today', index: 0 }); } catch (err) { console.error('[orbe] tableau supprimé', err.message); }
    }
  }
}

function remove(id) {
  if (!ID.test(String(id)) || !loadIndex().has(id)) return false;
  index.delete(id);
  pending.delete(id);
  inbox.delete(id);
  thumbs.delete(id);
  sweepDeleted(id);
  // Une page encore ouverte sur ce tableau cesse d'enregistrer.
  for (const wc of pagesOf(id)) wc.send('easel', { op: 'deleted', board: id });
  unpin(id);
  return true;
}

async function putImage(id, data) {
  const buf = bytes(data);
  if (!ID.test(String(id)) || !loadIndex().has(id) || !buf || !buf.length || buf.length > MAX_IMAGE) return null;
  const ext = sniff(buf);
  if (!ext) return null;
  const name = `${newId()}.${ext}`;
  await fs.promises.mkdir(dirOf(id), { recursive: true });
  await fs.promises.writeFile(path.join(dirOf(id), name), buf);
  if (!index.has(id)) { sweepDeleted(id); return null; }
  return { name };
}

async function getImage(id, name) {
  if (!ID.test(String(id)) || !IMAGE.test(String(name))) return null;
  try {
    const data = await fs.promises.readFile(path.join(dirOf(id), name));
    return { type: MIME[name.split('.').pop()], data };
  } catch {
    return null;
  }
}

function thumbOf(id) {
  try { return 'data:image/png;base64,' + fs.readFileSync(path.join(dirOf(id), 'thumb.png')).toString('base64'); } catch { return ''; }
}

// Images que plus aucun élément n'utilise (élément supprimé, annulation perdue
// à la fermeture) : retirées à l'ouverture du tableau, passé une heure.
function sweep(doc) {
  const used = new Set(doc.items.filter((it) => it.img).map((it) => it.img));
  fs.promises.readdir(dirOf(doc.id)).then(async (names) => {
    for (const name of names) {
      if (!IMAGE.test(name) || used.has(name)) continue;
      const file = path.join(dirOf(doc.id), name);
      const st = await fs.promises.stat(file).catch(() => null);
      if (st && Date.now() - st.mtimeMs > 3600e3) fs.promises.unlink(file).catch(() => {});
    }
  }).catch(() => {});
}

// --- Pages ouvertes -------------------------------------------------------------
function trustedSet() { return require('./window').trusted; }

// Le tableau affiché par un webContents, s'il s'agit bien d'une page de tableau
// d'Orbe (une page web ne peut ni porter cette adresse ni être « de confiance »).
function boardOf(wc) {
  if (!wc || wc.isDestroyed() || !trustedSet().has(wc)) return '';
  const url = wc.getURL();
  if (!url.startsWith(PAGE)) return '';
  try { const id = new URL(url).searchParams.get('id') || ''; return ID.test(id) ? id : ''; } catch { return ''; }
}

const pagesOf = (id) => webContents.getAllWebContents().filter((wc) => boardOf(wc) === id);

// ⌘Z / ⇧⌘Z choisis dans le menu : si la page au premier plan est un tableau,
// c'est lui qui annule ou rétablit (il laisse faire le texte en cours de saisie).
// Export en PNG : la page dessine l'image, le processus principal vérifie que c'en est une,
// demande où l'enregistrer et l'écrit. Le nom proposé vient du titre, réduit à un nom de fichier.
const EXPORT_MAX_BYTES = 60 * 1024 * 1024;
const env = {
  saveDialog: async (parent, opts) => { const r = await (parent ? dialog.showSaveDialog(parent, opts) : dialog.showSaveDialog(opts)); return r.canceled ? '' : r.filePath; },
};
async function exportImage(a, sender) {
  const id = String((a && a.board) || '');
  const data = bytes(a && a.data);
  if (!ID.test(id) || !loadIndex().has(id) || !data || data.length > EXPORT_MAX_BYTES || sniff(data) !== 'png') return null;
  const name = String((a && a.title) || '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+/, '').replace(/[. ]+$/, '').slice(0, 80) || t('easel.untitled');
  const { BaseWindow } = require('electron');
  const { OrbeWindow } = require('./window');
  const owner = sender && OrbeWindow.ownerOf(sender);
  const file = await env.saveDialog(owner ? owner.win : BaseWindow.getFocusedWindow(), { title: t('easel.export'), defaultPath: path.join(app.getPath('downloads'), name + '.png'), filters: [{ name: 'PNG', extensions: ['png'] }] });
  if (!file || typeof file !== 'string' || !path.isAbsolute(file)) return null;
  const target = /\.png$/i.test(file) ? file : file + '.png';
  try { await fs.promises.writeFile(target, data); } catch (err) { console.error('[orbe] export du tableau', err.message); return null; }
  return target;
}

// « Exporter le tableau en PNG… » (menu, barre de commande) : demandé à la page du tableau affiché.
function exportActive(w) {
  const rt = w && w.activeRt;
  if (!rt || rt.wc.isDestroyed() || !boardOf(rt.wc)) return false;
  rt.wc.send('easel', { op: 'export' });
  return true;
}

function history(wc, op) {
  if (!boardOf(wc)) return false;
  wc.send('easel', { op: op === 'redo' ? 'redo' : 'undo' });
  return true;
}

// Ajoute un élément à un tableau depuis le processus principal. Si une page
// l'affiche, c'est elle qui l'ajoute (elle seule connaît son état, annulation
// comprise) : l'élément attend dans une boîte qu'elle vide. Sinon il est écrit
// dans le fichier, sous le contenu existant.
function deliver(id, item) {
  const pages = pagesOf(id);
  if (pages.length) {
    inbox.set(id, [...(inbox.get(id) || []), item]);
    pages[0].send('easel', { op: 'inbox', board: id });
    return 'page';
  }
  appendToFile(id, [item]);
  return 'file';
}

function appendToFile(id, added) {
  const doc = readDoc(id);
  if (!doc) return;
  let left = 0;
  let bottom = 0;
  if (doc.items.length) {
    left = Math.min(...doc.items.map((it) => Math.min(it.x, it.x + it.w)));
    bottom = Math.max(...doc.items.map((it) => Math.max(it.y, it.y + it.h))) + 40;
  }
  for (const it of added) {
    const c = cleanItem({ ...it, x: left, y: bottom });
    if (!c) continue;
    doc.items.push(c);
    bottom += c.h + 40;
  }
  doc.updated = Date.now();
  writeDoc(doc, { sync: true });
}

function takeInbox(id) {
  const got = inbox.get(id) || [];
  inbox.delete(id);
  return got;
}

// --- Ouverture ------------------------------------------------------------------
// Ouvre un tableau dans un onglet (un onglet par tableau) ; sans identifiant, en crée un.
function open(w, id) {
  if (!w) return null;
  const known = !!id && loadIndex().has(id);
  const board = known ? id : create().id;
  const tab = w.openInternal('easel.html?id=' + board);
  // Un tableau neuf s'ouvre comme onglet épinglé de l'Espace, comme dans Arc : il reste
  // dans la barre d'une séance à l'autre. (Ni en navigation privée ni dans une fenêtre vierge : rien n'y est épinglé.
  // Un tableau rouvert depuis la Bibliothèque reste un onglet du jour.)
  if (!known && tab && w.shared) {
    try { w.move({ id: tab.id, to: 'pinned', index: w.space.pinned.length }); } catch (err) { console.error('[orbe] tableau épinglé', err.message); }
  }
  return board;
}

// --- Capture d'une page vers un tableau -------------------------------------------
// Voile posé sur la page, dans un monde isolé (la page ne peut ni le lire ni le
// détourner) : glisser choisit une zone, Entrée ou un simple clic prend toute la
// partie visible, Échap annule. Renvoie un rectangle, 'full' ou null.
const PICK_WORLD = 4217;
const pickCode = (hint) => `new Promise((resolve) => {
  const d = document;
  const veil = d.createElement('div');
  veil.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,.22);touch-action:none';
  const box = d.createElement('div');
  box.style.cssText = 'all:initial;position:fixed;display:none;pointer-events:none;border:1.5px solid #7c6cf0;border-radius:3px;background:rgba(124,108,240,.10);box-shadow:0 0 0 99999px rgba(0,0,0,.30)';
  const tip = d.createElement('div');
  tip.style.cssText = 'all:initial;position:fixed;top:18px;left:50%;transform:translateX(-50%);pointer-events:none;padding:8px 14px;border-radius:10px;background:rgba(28,28,32,.92);color:#fff;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:nowrap';
  tip.textContent = ${JSON.stringify(hint)};
  veil.append(box, tip);
  d.documentElement.appendChild(veil);
  let from = null;
  let rect = null;
  const done = (value) => {
    removeEventListener('keydown', key, true);
    veil.remove();
    // Deux images plus tard, le voile a disparu de l'écran : la capture est propre.
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(value)));
  };
  const key = (e) => {
    if (e.key !== 'Escape' && e.key !== 'Enter') return;
    e.preventDefault(); e.stopPropagation();
    done(e.key === 'Enter' ? 'full' : null);
  };
  addEventListener('keydown', key, true);
  veil.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    from = { x: e.clientX, y: e.clientY };
    try { veil.setPointerCapture(e.pointerId); } catch {}
  });
  veil.addEventListener('pointermove', (e) => {
    if (!from) return;
    rect = { x: Math.min(from.x, e.clientX), y: Math.min(from.y, e.clientY), width: Math.abs(e.clientX - from.x), height: Math.abs(e.clientY - from.y) };
    if (rect.width < 4 && rect.height < 4) return;
    veil.style.background = 'transparent';
    tip.style.display = 'none';
    box.style.display = 'block';
    box.style.left = rect.x + 'px'; box.style.top = rect.y + 'px'; box.style.width = rect.width + 'px'; box.style.height = rect.height + 'px';
  });
  veil.addEventListener('pointerup', () => {
    if (!from) return;
    done(rect && rect.width >= 8 && rect.height >= 8 ? rect : 'full');
  });
  veil.addEventListener('pointercancel', () => done(null));
})`;

// Capture la page active (zone choisie, ou partie visible) et l'ajoute comme
// image au tableau le plus récent — créé au besoin — avec l'adresse et le titre
// de la page d'origine. `opts.full` ou `opts.rect` évitent le choix à la souris.
// Laisse choisir une zone de la page à la souris. Renvoie le rectangle en
// points de la vue, 'full' (Entrée ou simple clic) ou null (Échap).
async function pickArea(wc, hint) {
  if (!wc || wc.isDestroyed()) return null;
  if (!/^https?:/i.test(wc.getURL())) return 'full';
  wc.focus();
  const area = await wc.executeJavaScriptInIsolatedWorld(PICK_WORLD, [{ code: pickCode(hint || t('easel.pickHint')) }], true).catch(() => null);
  if (!area || wc.isDestroyed()) return null;
  if (area === 'full') return 'full';
  const k = wc.getZoomFactor();
  return { x: Math.round(num(area.x, 0, 1e5) * k), y: Math.round(num(area.y, 0, 1e5) * k), width: Math.round(num(area.width, 1, 1e5, 1) * k), height: Math.round(num(area.height, 1, 1e5, 1) * k) };
}

async function capture(w, opts = {}) {
  const wc = w && w.activeWc;
  // Jamais depuis la navigation privée : un tableau garde l'adresse de la page.
  if (!wc || wc.isDestroyed() || w.incognito || wc.getURL().startsWith(PAGE)) return null;
  const url = wc.getURL();
  const title = wc.getTitle();
  let area = opts.rect || (opts.full ? 'full' : undefined);
  if (area === undefined) {
    if (/^https?:/i.test(url)) {
      wc.focus();
      area = await wc.executeJavaScriptInIsolatedWorld(PICK_WORLD, [{ code: pickCode(t('easel.pickHint')) }], true).catch(() => null);
    } else area = 'full';
  }
  if (!area || wc.isDestroyed()) return null;
  let rect;
  if (area !== 'full') {
    // La page raisonne en pixels CSS, la capture en points de la vue.
    const k = wc.getZoomFactor();
    rect = { x: Math.round(num(area.x, 0, 1e5) * k), y: Math.round(num(area.y, 0, 1e5) * k), width: Math.round(num(area.width, 1, 1e5, 1) * k), height: Math.round(num(area.height, 1, 1e5, 1) * k) };
  }
  const image = await wc.capturePage(rect).catch(() => null);
  if (!image || image.isEmpty()) return null;
  // Taille à l'écran (points), pas en pixels de l'image : une capture « Retina » en compte le double.
  const shown = w.activeRt && w.activeRt.wc === wc ? boundsOf(w.activeRt.view) : image.getSize();
  const size = rect || { width: Math.max(1, shown.width), height: Math.max(1, shown.height) };
  const board = list()[0] || meta(create());
  const stored = await putImage(board.id, image.toPNG());
  if (!stored) return null;
  const k = Math.min(1, 720 / size.width);
  const item = { id: 'c' + newId(), type: 'image', img: stored.name, x: 0, y: 0, w: Math.round(size.width * k), h: Math.round(size.height * k) };
  if (webUrl(url)) { item.sourceUrl = url; item.sourceTitle = title; }
  const via = deliver(board.id, item);
  w.toast(t('easel.captured', { name: board.title || t('easel.untitled') }));
  return { board: board.id, item, via };
}

// --- Actions de la page ---------------------------------------------------------
async function action(name, a, sender) {
  switch (name) {
    case 'easel:list': return list().map((b) => ({ ...b, thumb: thumbOf(b.id) }));
    case 'easel:create': return meta(create());
    case 'easel:load': {
      const doc = readDoc(String(a || ''));
      if (!doc || !loadIndex().has(doc.id)) return null;
      sweep(doc);
      return JSON.stringify(doc);
    }
    case 'easel:save': return save(a);
    case 'easel:delete': return remove(String(a || ''));
    case 'easel:putImage': return putImage(a && a.board, a && a.data);
    case 'easel:getImage': return getImage(a && a.board, a && a.name);
    case 'easel:export': return exportImage(a, sender);
    case 'easel:inbox': return ID.test(String(a || '')) ? takeInbox(String(a)) : [];
    case 'easel:open': {
      const { OrbeWindow } = require('./window');
      const w = OrbeWindow.ownerOf(sender) || OrbeWindow.primary;
      return open(w, a ? String(a) : '');
    }
    default: return undefined;
  }
}

// À la fermeture : ce qui attendait d'être écrit l'est tout de suite, et les
// captures qu'aucune page n'a eu le temps de prendre rejoignent leur fichier.
function flush() {
  quitting = true;
  for (const [id, json] of pending) {
    try { atomicSync(fileOf(id), json); } catch (err) { console.error('[orbe] tableau : écriture impossible', err.message); }
  }
  pending.clear();
  for (const [id, added] of inbox) { try { appendToFile(id, added); } catch {} }
  inbox.clear();
}
app.on('before-quit', flush);

module.exports = { action, list, create, open, capture, pickArea, history, exportActive, exportImage, env, remove, flush, readDoc, cleanDoc, sniff, root, PAGE };
