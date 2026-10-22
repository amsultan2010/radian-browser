// Pont de l'habillage des extensions (orbe://app/panel.html) : en-tête du
// panneau latéral et bandeau du débogueur. Rien d'autre ne reçoit ce pont, et
// le processus principal vérifie de son côté d'où vient chaque message
// (src/main/ext-panel.js).
const { contextBridge, ipcRenderer } = require('electron');

const CHANNEL = 'orbe-panel';

if (location.protocol === 'orbe:' && location.pathname === '/panel.html') {
  contextBridge.exposeInMainWorld('orbePanel', {
    send: (action, data) => ipcRenderer.send(CHANNEL, String(action), data),
    on: (fn) => { ipcRenderer.on(CHANNEL, (e, data) => fn(data)); },
  });
}
