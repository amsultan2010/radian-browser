// Premier lancement : un dossier « Premiers pas » dans les épinglés du premier
// Espace, comme le dossier « Arc Basics » d'Arc. Ses onglets dorment tant qu'on
// ne les ouvre pas (aucune requête au lancement) ; les adresses sont écrites
// ici, jamais lues d'ailleurs. Posé une seule fois : supprimé, il ne revient pas.
const { store, uid } = require('./store');

const REPO_URL = 'https://github.com/amadoubaui/orbe';
// [libellé, adresse, page interne d'Orbe ?]
const PAGES = [
  ['help.shortcuts', 'orbe://app/shortcuts.html', true],
  ['help.center', REPO_URL + '#readme', false],
  ['help.whatsNew', REPO_URL + '/releases', false],
];

function seed(w, space = w.space) {
  const state = store.state.window;
  if (!w || w.incognito || !w.shared || state.starter || !space) return null;
  state.starter = true;
  const folder = { type: 'folder', id: uid(), name: store.t('starter.folder'), open: true, children: [] };
  const now = Date.now();
  for (const [label, url, internal] of PAGES) {
    const tab = { id: uid(), url, homeUrl: url, title: store.t(label), favicon: '', createdAt: now, lastActiveAt: now };
    if (internal) tab.internal = true;
    w.data.tabs[tab.id] = tab;
    folder.children.push({ type: 'tab', id: tab.id });
  }
  space.pinned.unshift(folder);
  w.changed();
  return folder;
}

module.exports = { seed, PAGES };
