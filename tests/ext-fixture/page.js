// Page d'extension (fenêtre surgissante, options) : `call` et `sw` servent au test.
const at = (p) => p.split('.').reduce((o, k) => (o == null ? o : o[k]), chrome);
window.call = (path, ...args) => at(path).apply(at(path.split('.').slice(0, -1).join('.')), args);
window.sw = (msg) => chrome.runtime.sendMessage(msg);
// Ce que fait une vraie fenêtre surgissante en s'ouvrant : chercher l'onglet actif.
chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
  window.activeTab = tabs[0] || null;
  document.getElementById('out').textContent = tabs[0] ? tabs[0].title : 'aucun onglet actif';
});
// Ce que la page reçoit du service worker : message diffusé, changement de stockage.
window.received = [];
chrome.runtime.onMessage.addListener((msg) => { if (msg && msg.type === 'diffusion') window.received.push('message:' + msg.texte); });
chrome.storage.onChanged.addListener((changes, area) => { if (changes.diffusion) window.received.push('stockage:' + area + ':' + changes.diffusion.newValue); });
