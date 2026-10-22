// Éditeur de Boost : petite fenêtre liée au site de l'onglet actif au moment de
// l'ouverture, et liste de tous les Boosts (« Afficher les Boosts… »).
// Le site modifié est fixé à l'ouverture (`host`) : si l'onglet change de site
// pendant que l'éditeur est ouvert, rien n'est écrit pour le nouveau site.
// Chaque message de l'éditeur nomme le site qu'il croit modifier : s'il ne
// correspond plus à `host` (l'éditeur a été pointé ailleurs entre-temps, et un
// enregistrement différé de l'ancien site arrive après coup), il est refusé.
const { BrowserWindow, dialog, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');
const platform = require('./platform');
const boosts = require('./boosts');
const { store } = require('./store');
const { live, trusted, UI_PRELOAD, INTERNAL, OrbeWindow, applyBoosts } = require('./window');

let win = null;
let target = null; // webContents de l'onglet d'où l'éditeur a été ouvert
let host = ''; // site du Boost en cours de modification ('' : la liste seule)
let toReview = ''; // Boost importé dont la relecture est demandée à l'ouverture de la liste
const hooks = { openSettings: () => {} };

// Champs qu'un message de l'éditeur peut modifier (chacun est ensuite borné par boosts.set).
const EDITABLE = ['name', 'css', 'zaps', 'look', 'js', 'jsOn', 'enabled'];

function open(w, mode) {
  if (w && w.incognito) return null;
  const rt = w && w.activeRt;
  const site = rt && !rt.internal && !rt.wc.isDestroyed() ? boosts.hostOf(rt.wc.getURL()) : '';
  if (mode !== 'list' && !site) return null;
  host = mode === 'list' ? '' : site;
  target = host ? rt.wc : null;
  return show();
}

function show() {
  // (Un « ? » et non un « # » : passer de l'éditeur à la liste doit recharger la page.)
  const page = INTERNAL + 'boost.html' + (host ? '' : '?list');
  if (win && !win.isDestroyed()) {
    win.loadURL(page);
    win.focus();
    return win;
  }
  win = new BrowserWindow({
    width: 380, height: 640, minWidth: 320, minHeight: 380, ...platform.windowChrome({ inset: true, dark: nativeTheme.shouldUseDarkColors }),
    alwaysOnTop: true, fullscreenable: false, webPreferences: { preload: UI_PRELOAD, sandbox: true, contextIsolation: true },
  });
  trusted.add(win.webContents);
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('closed', () => { win = null; target = null; host = ''; });
  win.loadURL(page);
  return win;
}

// Onglet d'origine, s'il affiche encore le site du Boost.
const page = () => (target && !target.isDestroyed() && host && boosts.hostOf(target.getURL()) === host ? target : null);

const applyHost = (site) => applyBoosts(site);

function state() {
  if (!host) return null;
  const last = boosts.ran.last && boosts.ran.last.host === host ? boosts.ran.last : null;
  return {
    host, ...boosts.get(host), exists: boosts.has(host), shown: !!page(),
    jsAllowed: store.state.settings.boostsJs === true, boostsOn: store.state.settings.boostsEnabled !== false,
    fonts: Object.keys(boosts.FONTS), cases: Object.keys(boosts.CASES), swatches: boosts.SWATCHES,
    jsError: last ? last.error : '',
  };
}

const listState = () => ({ items: boosts.list(), jsAllowed: store.state.settings.boostsJs === true });

// Ouvre la liste sur la relecture d'un Boost importé (demandée depuis la Bibliothèque).
function review(w, site) {
  if ((w && w.incognito) || !boosts.has(site)) return null;
  host = '';
  target = null;
  toReview = site;
  return show();
}

// Site nommé par le message. Les messages de l'éditeur d'un site doivent nommer `host`.
const named = (a) => (a && typeof a === 'object' && typeof a.host === 'string' ? a.host : '');
const mine = (a) => !!host && named(a) === host;

async function exportTo(w, hosts) {
  const data = boosts.exportData(hosts);
  if (!data.boosts.length) return { ok: false };
  const name = data.boosts.length === 1 ? `boost-${data.boosts[0].host.replace(/[^a-z0-9.-]/gi, '_')}.json` : 'boosts-orbe.json';
  const r = await dialog.showSaveDialog(w || undefined, { defaultPath: name, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (!r || r.canceled || !r.filePath) return { ok: false };
  await fs.promises.writeFile(r.filePath, JSON.stringify(data, null, 2));
  return { ok: true, n: data.boosts.length, file: path.basename(r.filePath) };
}

async function importFrom(w) {
  const r = await dialog.showOpenDialog(w || undefined, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (!r || r.canceled || !r.filePaths || !r.filePaths[0]) return null;
  let text = null;
  try {
    const st = await fs.promises.stat(r.filePaths[0]);
    if (st.isFile() && st.size <= boosts.FILE_MAX) text = await fs.promises.readFile(r.filePaths[0], 'utf8');
  } catch {}
  return text === null ? { added: [], skipped: [], rejected: 0, error: 'size' } : boosts.importText(text);
}

// Messages de la fenêtre de l'éditeur — et d'elle seule.
async function action(name, a, sender) {
  if (!win || win.isDestroyed() || sender !== win.webContents) return null;
  switch (name) {
    case 'boost:get': return state();
    case 'boost:set': {
      if (!mine(a) || !a.patch || typeof a.patch !== 'object') return null;
      const patch = {};
      for (const k of EDITABLE) if (Object.hasOwn(a.patch, k)) patch[k] = a.patch[k];
      // Une liste de sélecteurs qui arrive par message est relue comme toute autre (filtre, puis moteur CSS).
      if (Object.hasOwn(patch, 'zaps')) patch.zaps = await boosts.vet(patch.zaps);
      if (!mine(a)) return null; // l'éditeur a été pointé ailleurs pendant la relecture
      boosts.set(host, patch);
      await applyHost(host);
      OrbeWindow.pushAll();
      return state();
    }
    case 'boost:zap': {
      if (!mine(a)) return null;
      const wc = page();
      if (!wc) return state();
      wc.focus();
      await boosts.zap(wc, a.host);
      if (win && !win.isDestroyed()) win.focus();
      return state();
    }
    // « Tout réinitialiser » : le Boost du site est retiré en entier.
    case 'boost:reset': if (!mine(a)) return null; boosts.remove(host); await applyHost(host); OrbeWindow.pushAll(); return state();
    // Le script d'un Boost ne s'exécute (ou ne disparaît) qu'au chargement de la page.
    case 'boost:reload': { if (!mine(a)) return null; const wc = page(); if (wc) wc.reload(); return state(); }
    case 'boost:settings': hooks.openSettings(); return null;
    case 'boost:list': { const r = listState(); if (toReview) { r.review = boosts.reviewOf(toReview); toReview = ''; } return r; }
    case 'boost:toggle': {
      const site = named(a);
      if (!boosts.has(site)) return listState();
      // Boost importé, jamais relu : son contenu est montré d'abord (voir « boost:approve »).
      if (a.enabled === true && boosts.get(site).review) return { ...listState(), review: boosts.reviewOf(site) };
      boosts.set(site, { enabled: a.enabled === true });
      await applyHost(site);
      OrbeWindow.pushAll();
      return listState();
    }
    // Contenu d'un Boost importé, pour la relecture (liste, ou éditeur de ce site).
    case 'boost:review': { const site = named(a); return host && site !== host ? null : boosts.reviewOf(site); }
    // « Activer ce Boost », après relecture. Depuis l'éditeur d'un site : ce site seulement.
    case 'boost:approve': {
      const site = named(a);
      if ((host && site !== host) || !boosts.has(site)) return null;
      boosts.approve(site);
      await applyHost(site);
      OrbeWindow.pushAll();
      return host ? state() : listState();
    }
    case 'boost:delete': {
      const site = named(a);
      if (boosts.remove(site)) { await applyHost(site); OrbeWindow.pushAll(); }
      return listState();
    }
    // Depuis la liste : ouvrir l'éditeur d'un Boost existant (l'onglet qui affiche ce site, s'il y en a un, sert d'aperçu).
    case 'boost:edit': {
      const site = named(a);
      if (!boosts.has(site)) return null;
      host = site;
      target = null;
      for (const rt of live.values()) if (!rt.owner.incognito && !rt.internal && !rt.wc.isDestroyed() && boosts.hostOf(rt.wc.getURL()) === site) { target = rt.wc; break; }
      show();
      return null;
    }
    case 'boost:showList': host = ''; target = null; show(); return null;
    // Depuis l'éditeur d'un site : ce site (nommé par le message) ; depuis la liste : le site de la ligne, ou tous.
    case 'boost:export': {
      if (host) return mine(a) ? exportTo(win, [host]) : null;
      return exportTo(win, named(a) ? [named(a)] : null);
    }
    case 'boost:import': {
      const r = await importFrom(win);
      // Sélecteurs du fichier : relus par le moteur CSS, en plus du filtre.
      if (r && r.added && r.added.length) await boosts.vetImported(r.added);
      return { result: r, ...listState() };
    }
    default: return null;
  }
}

module.exports = { open, review, action, hooks, state: () => ({ win, host, target }) };
