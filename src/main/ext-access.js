// Extensions Chrome : l'autorisation « activeTab ».
//
// Dans Chrome, un clic sur le bouton d'une extension lui ouvre l'onglet en
// cours, le temps de ce geste : elle peut alors y injecter un script
// (`scripting.executeScript`) sans avoir demandé l'accès à tous les sites.
// Electron ne connaît pas cet accès temporaire, et ne sait pas non plus accorder
// un site après le chargement de l'extension : sans accès déclaré dans le
// manifeste, l'injection est refusée (GoFullPage, par exemple, ne capture alors
// que la partie visible de la page).
//
// Orbe fait donc ainsi, avec l'accord de l'utilisateur, demandé au premier clic :
//   - le manifeste installé reçoit l'accès à tous les sites (`<all_urls>`), et
//     l'extension est rechargée ;
//   - la couche d'API continue de raisonner sur le manifeste d'origine (onglets
//     visibles, cookies…), et n'autorise l'injection que dans un onglet ouvert
//     à l'extension par un geste (`_access`, appelé par src/preload/ext.js avant
//     chaque injection).
// Ce second point imite Chrome mais n'est pas une barrière de sécurité : pour
// Chromium, l'extension a bel et bien accès à tous les sites. D'où la question
// posée à l'utilisateur, qui le dit.
const fs = require('fs');
const path = require('path');
const api = require('./ext-api');
const extensions = require('./extensions');
const { store } = require('./store');

const X = api.internals;
const ALL = '<all_urls>';
const refused = new Set(); // extensions à qui l'accès vient d'être refusé (jusqu'au redémarrage)
const pending = new Map(); // id -> promesse de la question en cours

const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const hostsOf = (m) => [...strings(m.host_permissions), ...strings(m.permissions).filter((p) => /^(<all_urls>|[a-z*]+:\/\/)/.test(p))];
const everywhere = (m) => { const h = hostsOf(m); return h.includes(ALL) || h.includes('*://*/*') || (h.includes('http://*/*') && h.includes('https://*/*')); };

// L'extension compte-t-elle sur « activeTab » pour agir sur les pages ?
function wantsActiveTab(manifest) {
  const m = manifest || {};
  if (!strings(m.permissions).includes('activeTab') || everywhere(m)) return false;
  return m.manifest_version === 3 ? strings(m.permissions).includes('scripting') : true;
}

const widened = (id) => !!X.diskOf(id).widened;

// Faut-il poser la question avant de traiter un clic sur le bouton ?
function needed(ses, id) {
  const ext = ses.extensions.getExtension(id);
  return !!ext && !widened(id) && !refused.has(id) && wantsActiveTab(ext.manifest);
}

// Ajoute l'accès à tous les sites au manifeste d'un dossier d'extension.
// Renvoie true si le fichier a changé.
function patch(dir) {
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  if (everywhere(manifest)) return false;
  const key = manifest.manifest_version === 3 ? 'host_permissions' : 'permissions';
  manifest[key] = [...strings(manifest[key]), ALL];
  fs.writeFileSync(file + '.tmp', JSON.stringify(manifest, null, 2));
  fs.renameSync(file + '.tmp', file);
  return true;
}

// Appelé par extensions.js avant chaque chargement : une mise à jour remet le
// manifeste d'origine, l'accès accordé y est reporté.
function beforeLoad(id, dir) {
  if (!widened(id)) return;
  try { patch(dir); } catch (err) { console.error('[orbe] extension', id, 'accès aux sites non reporté :', err.message); }
}

// Pose la question, puis élargit l'accès et recharge l'extension. Renvoie true
// si l'extension a maintenant l'accès.
function offer(ses, id) {
  if (pending.has(id)) return pending.get(id);
  const run = (async () => {
    const ext = ses.extensions.getExtension(id);
    if (!ext) return false;
    const ok = await api.host.confirmPermissions(ext, [store.t('ext.accessDetail')]);
    if (!ok) { refused.add(id); return false; }
    const before = { host_permissions: strings(ext.manifest.host_permissions), permissions: strings(ext.manifest.permissions) };
    patch(ext.path);
    X.diskOf(id).widened = before;
    X.persist();
    // Rechargement dans toutes les sessions où elle est chargée.
    const reloaded = [];
    for (const s of X.attached) {
      if (!s.extensions.getExtension(id)) continue;
      reloaded.push(new Promise((resolve) => {
        const done = (e, loaded) => { if (loaded.id !== id) return; s.extensions.removeListener('extension-ready', done); resolve(); };
        s.extensions.on('extension-ready', done);
        setTimeout(resolve, 8000);
      }));
      const dir = ext.path;
      s.extensions.removeExtension(id);
      // Extension installée par Orbe : la synchronisation la recharge. Sinon
      // (chargée d'ailleurs, tests), on la recharge depuis son dossier.
      if (!extensions.get(id)) s.extensions.loadExtension(dir, { allowFileAccess: false }).catch(() => {});
    }
    await extensions.syncAll().catch(() => {});
    await Promise.all(reloaded);
    return true;
  })().finally(() => pending.delete(id));
  pending.set(id, run);
  return run;
}

// Manifeste tel que l'extension l'a écrit : c'est sur lui que la couche d'API
// décide de ce qu'elle montre (onglets, cookies…).
function original(ext) {
  const d = X.diskOf(ext.id).widened;
  const m = ext.manifest || {};
  return d ? { ...m, host_permissions: strings(d.host_permissions), permissions: strings(d.permissions) } : m;
}

api.extend({
  // Avant une injection de script : l'onglet visé est-il ouvert à l'extension ?
  // Sans effet pour une extension dont Orbe n'a pas élargi l'accès : Chromium
  // fait alors le contrôle lui-même.
  _access(ctx, [tabId]) {
    if (!widened(ctx.id)) return true;
    const t = X.targetTab(ctx, typeof tabId === 'number' ? tabId : undefined);
    if (X.hostAccess(ctx, t.url) || ctx.st.activeTabs.has(t.id)) return true;
    throw X.fail('Cannot access contents of the page. Extension manifest must request permission to access the respective host.');
  },
});

function setup() {
  api.host.manifestOf = original;
  extensions.hooks.beforeLoad = beforeLoad;
}

module.exports = { setup, needed, offer, widened, wantsActiveTab, patch };
