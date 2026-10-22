// Au clic sur le bouton : marque la page de l'onglet, ce que seul « activeTab »
// permet (aucun accès aux sites dans le manifeste). Le résultat de chaque
// injection est gardé pour le test.
const results = [];
const mark = (tabId) => chrome.scripting.executeScript({ target: { tabId }, func: () => { document.documentElement.dataset.marque = 'oui'; return location.pathname; } })
  .then((r) => results.push('ok ' + r[0].result), (err) => results.push('refus ' + err.message));
chrome.action.onClicked.addListener((tab) => { mark(tab.id); });
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === 'resultats') reply(results);
  else if (msg && msg.type === 'marquer') { mark(msg.tabId).then(() => reply(results)); return true; }
  return undefined;
});
