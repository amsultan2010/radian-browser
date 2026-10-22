// Pont entre l'interface d'Orbe (pages orbe://) et le processus principal.
// Chargé uniquement dans les vues de l'interface, jamais dans les sites web.
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'orbe:') {
  const boot = ipcRenderer.sendSync('i18n') || { locales: { fr: {} }, lang: 'fr', settings: {} };
  const EVENTS = ['state', 'overlay', 'edit', 'suggest-more', 'find-result', 'settings', 'easel', 'sound', 'keys', 'theme', 'update'];
  contextBridge.exposeInMainWorld('orbe', {
    locales: boot.locales,
    lang: boot.lang,
    settings: boot.settings,
    // Système (« mac », « win ») et raccourcis dans sa notation, par nom de commande.
    platform: boot.platform || 'mac',
    keys: boot.keys || {},
    defaultKeys: boot.defaultKeys || {},
    send: (action, payload) => ipcRenderer.invoke('orbe', action, payload),
    on: (event, fn) => {
      if (!EVENTS.includes(event)) return;
      ipcRenderer.on(event, (e, data) => fn(data));
    },
  });
}
