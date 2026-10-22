// Script de contenu : se signale au service worker et répond aux messages.
chrome.runtime.sendMessage({ type: 'hello' }).then((r) => { document.documentElement.dataset.orbeTab = String(r && r.tab); }).catch(() => {});
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg === 'titre') reply(document.title);
  // storage.sync depuis le monde isolé du script de contenu.
  if (msg === 'sync') {
    chrome.storage.sync.set({ contenu: 7 }).then(() => chrome.storage.sync.get('contenu')).then((r) => reply(r.contenu), (err) => reply('ERREUR ' + err.message));
    return true;
  }
  return undefined;
});
