// Extensions : ce que l'interface d'Orbe en montre et en fait (réglages, bouton
// de la barre latérale, menu contextuel du bouton) : page d'options, bouton
// épinglé ou non, mise à jour depuis le Chrome Web Store, désactivation,
// désinstallation. Aucune de ces actions n'est offerte aux extensions
// elles-mêmes : elles ne viennent que des pages de l'interface (orbe://).
const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');
const { store } = require('./store');
const extensions = require('./extensions');
const extApi = require('./ext-api');
const extHost = require('./ext-host');
const { OrbeWindow } = require('./window');

const t = (k, v) => store.t(k, null, v);
const ID = /^[a-p]{32}$/;
const hooks = {
  openSettings: () => {},
  changed: () => {},
  // Question posée quand une mise à jour demande de nouvelles autorisations (remplaçable par les essais).
  confirmUpdate: async (name, list) => {
    const w = OrbeWindow.primary;
    const opts = { type: 'warning', message: t('ext.updateAsk', { name }), detail: list.map((x) => '• ' + String(x).slice(0, 120)).slice(0, 20).join('\n'), buttons: [t('ext.update'), t('edit.undo')], defaultId: 1, cancelId: 1 };
    const r = await (w ? dialog.showMessageBox(w.win, opts) : dialog.showMessageBox(opts));
    return r.response === 0;
  },
};

const hidden = () => (Array.isArray(store.state.settings.extHidden) ? store.state.settings.extHidden : []);
const isPinned = (id) => !hidden().includes(id);

// Adresse de la page d'options, d'après le manifeste installé ; '' s'il n'y en a pas.
// Le chemin vient de l'extension : il est résolu dans son origine, et refusé s'il en sort.
function optionsUrl(id) {
  const x = extensions.get(id);
  if (!x) return '';
  let m;
  try { m = JSON.parse(fs.readFileSync(path.join(x.dir, 'manifest.json'), 'utf8').replace(/^﻿/, '')); } catch { return ''; }
  const page = (m.options_ui && m.options_ui.page) || m.options_page;
  if (typeof page !== 'string' || !page) return '';
  try {
    const u = new URL(page, `chrome-extension://${id}/`);
    return u.protocol === 'chrome-extension:' && u.host === id ? u.href : '';
  } catch { return ''; }
}

const listAll = () => list();
function list() {
  return extensions.list().map((x) => ({
    id: x.id, name: x.name, version: x.version, description: (x.description || '').slice(0, 160),
    enabled: extensions.isEnabled(x.id), popup: !!extensions.popupFor(x.id), options: !!optionsUrl(x.id), pinned: isPinned(x.id),
  }));
}

function setPinned(id, pinned) {
  if (!ID.test(id)) return false;
  const next = hidden().filter((x) => x !== id && ID.test(x));
  if (!pinned) next.push(id);
  store.state.settings.extHidden = next.slice(-200);
  store.save();
  OrbeWindow.pushAll();
  hooks.changed();
  return true;
}

function openOptions(w, id) {
  const url = optionsUrl(id);
  if (!url || !w || w.incognito || !extensions.isEnabled(id)) return false;
  // Déjà ouverte : on y revient.
  for (const [tid, tab] of Object.entries(w.data.tabs)) if ((tab.url || '').split(/[?#]/)[0] === url) { const loc = w.locate(tid); if (loc && loc.space.id !== w.spaceId) w.switchSpace(loc.space.id); w.activate(tid); return true; }
  const tab = w.createTab(url);
  w.activate(tab.id);
  return true;
}

// Numéros de version de Chrome : un à quatre entiers séparés par des points.
function compareVersions(a, b) {
  const x = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const y = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 4; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
  return 0;
}

const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 400) : []);
const isHost = (p) => /^(<all_urls>|[a-z*]+:\/\/)/.test(p);
// Ce qu'un manifeste demande : API d'un côté, sites de l'autre (accès déclarés et scripts de contenu).
function asks(m) {
  const perms = strings(m && m.permissions);
  const scripts = Array.isArray(m && m.content_scripts) ? m.content_scripts.slice(0, 200).flatMap((c) => strings(c && c.matches)) : [];
  return { api: new Set(perms.filter((p) => !isHost(p))), hosts: new Set([...strings(m && m.host_permissions), ...perms.filter(isHost), ...scripts]) };
}
const ALL_SITES = ['<all_urls>', '*://*/*'];
// Autorisations que `next` demande et que `prev` n'avait pas. Qui avait déjà tous les sites n'en gagne aucun.
function addedPermissions(prev, next) {
  const a = asks(prev);
  const b = asks(next);
  const everywhere = ALL_SITES.some((p) => a.hosts.has(p));
  return { api: [...b.api].filter((p) => !a.api.has(p)), hosts: everywhere ? [] : [...b.hosts].filter((p) => !a.hosts.has(p)) };
}

function readManifest(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8').replace(/^\uFEFF/, '')); } catch { return {}; }
}

// Réinstalle depuis le Store : même vérification de signature qu'à l'installation.
// Avant la bascule : une version plus ancienne que celle installée est refusée, et
// une version qui demande davantage (API ou sites) n'est installée qu'avec
// l'accord de l'utilisateur — Chromium, lui, accorderait tout ce que dit le
// nouveau manifeste sans rien demander.
async function update(id) {
  const before = extensions.get(id);
  if (!before) return { error: t('ext.failed') };
  const old = readManifest(before.dir);
  let added = { api: [], hosts: [] };
  let after;
  try {
    after = await extensions.install(id, {
      check: async (manifest) => {
        if (compareVersions(manifest.version, before.version) < 0) throw Object.assign(new Error('downgrade'), { code: 'EXT_DOWNGRADE', version: String(manifest.version).slice(0, 40) });
        added = addedPermissions(old, manifest);
        const list = [...added.api, ...added.hosts];
        if (list.length && !(await hooks.confirmUpdate(before.name, list))) throw Object.assign(new Error('refused'), { code: 'EXT_REFUSED' });
      },
    });
  } catch (err) {
    if (err.code === 'EXT_DOWNGRADE') return { error: t('ext.downgrade', { from: before.version, to: err.version }) };
    if (err.code === 'EXT_REFUSED') return { error: t('ext.updateRefused', { version: before.version }) };
    return { error: `${t('ext.updateFailed')} (${err.code || err.message})` };
  }
  const changed = after.version !== before.version;
  const list = [...added.api, ...added.hosts].map((x) => String(x).slice(0, 80)).slice(0, 12);
  const message = (changed ? t('ext.updated', { name: after.name, from: before.version, to: after.version }) : t('ext.upToDate', { name: after.name, version: after.version }))
    + (list.length ? ' ' + t('ext.newPerms', { list: list.join(', ') }) : '');
  return { list: listAll(), updated: changed, added, message };
}

async function remove(id) {
  await extensions.remove(id).catch(() => {});
  extApi.forget(id);
  extHost.more.forgetKeys(id);
  if (!isPinned(id)) setPinned(id, true);
  OrbeWindow.pushAll();
  return list();
}

// Menu contextuel du bouton d'une extension (barre latérale).
function menuTemplate(w, id) {
  const x = extensions.get(id);
  const action = (extHost.actionsFor(w) || []).find((a) => a.id === id);
  if (!x && !action) return [];
  const name = (x && x.name) || action.name || action.title || id;
  const sep = { type: 'separator' };
  return [
    { label: name, enabled: false },
    sep,
    { label: t('ext.options'), enabled: !!optionsUrl(id), click: () => openOptions(w, id) },
    { label: t('ext.unpin'), click: () => setPinned(id, false) },
    ...(x ? [
      { label: t('ext.disable'), click: () => { extensions.setEnabled(id, false); OrbeWindow.pushAll(); hooks.changed(); } },
      sep,
      { label: t('ext.removeFrom'), click: () => confirmRemove(w, id, name) },
    ] : []),
    sep,
    { label: t('ext.manage'), click: () => hooks.openSettings('extensions') },
  ];
}

async function confirmRemove(w, id, name) {
  const r = await dialog.showMessageBox(w.win, {
    type: 'warning', message: t('ext.removeAsk', { name }), detail: t('ext.removeDetail'),
    buttons: [t('ext.removeBtn'), t('edit.undo')], defaultId: 1, cancelId: 1,
  });
  if (r.response !== 0) return false;
  await remove(id);
  hooks.changed();
  return true;
}

async function action(name, a, sender) {
  const w = OrbeWindow.ownerOf(sender) || OrbeWindow.primary;
  const id = String((a && typeof a === 'object' ? a.id : a) || '');
  if (!ID.test(id)) return undefined;
  switch (name) {
    case 'ext:options': return openOptions(OrbeWindow.primary || w, id);
    case 'ext:pin': setPinned(id, !!a.pinned); return list();
    case 'ext:update': return update(id);
    case 'ext:menu': { const tpl = w ? menuTemplate(w, id) : []; if (tpl.length) w.popup(tpl); return tpl.length > 0; }
    default: return undefined;
  }
}

module.exports = { compareVersions, addedPermissions, list, action, remove, update, setPinned, isPinned, optionsUrl, openOptions, menuTemplate, hooks };
