// Pont entre l'interface d'Orbe (pages orbe://) et le processus principal.
// Chargé uniquement dans les vues de l'interface, jamais dans les sites web.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

if (location.protocol === 'orbe:') {
  const boot = ipcRenderer.sendSync('i18n') || { locales: { fr: {} }, lang: 'en', settings: {} };
  const EVENTS = ['state', 'overlay', 'edit', 'suggest-more', 'find-result', 'settings', 'easel', 'sound', 'keys', 'theme', 'update'];
  contextBridge.exposeInMainWorld('orbe', {
    locales: boot.locales,
    lang: boot.lang,
    settings: boot.settings,
    // Shortcuts as displayed, by command name.
    keys: boot.keys || {},
    defaultKeys: boot.defaultKeys || {},
    send: (action, payload) => ipcRenderer.invoke('orbe', action, payload),
    // Path of a dropped file on disk; '' for a File a page built itself.
    filePath: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
    on: (event, fn) => {
      if (!EVENTS.includes(event)) return;
      ipcRenderer.on(event, (e, data) => fn(data));
    },
  });
}
