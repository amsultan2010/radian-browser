// Service worker de l'extension d'essai : exécute les appels que le test lui
// dicte et consigne les événements reçus.

// Relevé fait avant toute autre chose : la couche d'Orbe doit déjà être là.
const early = {
  permissions: typeof chrome.permissions,
  onRemoved: typeof (chrome.permissions && chrome.permissions.onRemoved && chrome.permissions.onRemoved.addListener),
  windows: typeof chrome.windows,
  cookies: typeof chrome.cookies,
  tabsCreate: typeof chrome.tabs.create,
  // Chromium expose aussi `browser` : il doit être complété de la même façon.
  browser: typeof browser === 'undefined' ? 'absent' : typeof (browser.permissions && browser.permissions.onRemoved && browser.windows && browser.storage.sync.get),
};

const log = [];
const at = (p) => p.split('.').reduce((o, k) => (o == null ? o : o[k]), chrome);
const EVENTS = [
  'tabs.onCreated', 'tabs.onUpdated', 'tabs.onRemoved', 'tabs.onActivated', 'windows.onFocusChanged',
  'permissions.onAdded', 'permissions.onRemoved', 'cookies.onChanged', 'action.onClicked', 'commands.onCommand',
  'contextMenus.onClicked', 'webNavigation.onCommitted', 'webNavigation.onCompleted',
  'sidePanel.onOpened', 'sidePanel.onClosed', 'debugger.onEvent', 'debugger.onDetach',
  'tabGroups.onCreated', 'tabGroups.onUpdated', 'tabGroups.onRemoved', 'downloads.onChanged',
];
for (const name of EVENTS) {
  const ev = at(name);
  if (ev) ev.addListener((...args) => log.push({ name, args }));
}

chrome.storage.onChanged.addListener((changes, area) => log.push({ name: 'storage.onChanged', args: [Object.keys(changes), area] }));

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || typeof msg !== 'object') return undefined;
  if (msg.type === 'early') reply(early);
  else if (msg.type === 'log') reply(log);
  else if (msg.type === 'hello') reply({ tab: sender.tab && sender.tab.id });
  else if (msg.type === 'call' || msg.type === 'callback') {
    const fn = at(msg.path);
    const self = at(msg.path.split('.').slice(0, -1).join('.'));
    if (typeof fn !== 'function') { reply({ error: 'absent : ' + msg.path }); return undefined; }
    if (msg.type === 'callback') {
      // Style Manifest V2 : rappel en dernier argument, erreur dans runtime.lastError.
      fn.call(self, ...(msg.args || []), (value) => reply({ value, lastError: chrome.runtime.lastError ? chrome.runtime.lastError.message : null }));
      return true;
    }
    Promise.resolve().then(() => fn.apply(self, msg.args || [])).then((value) => reply({ value }), (err) => reply({ error: String(err && err.message) }));
    return true;
  }
  return undefined;
});
