// The Library is a panel, never a tab: a Library tab saved by an older version is
// dropped when the state is read (src/main/store.js, `normalize`), without Electron:
//   node tests/library.test.js
const assert = require('node:assert/strict');
const { store } = require('../src/main/store');

const s = store.normalize({
  version: 2,
  tabs: {
    lib: { id: 'lib', url: 'orbe://app/library.html#downloads', internal: true },
    pinnedLib: { id: 'pinnedLib', url: 'orbe://app/library.html', internal: true },
    note: { id: 'note', url: 'orbe://app/notes.html#n1', internal: true },
    web: { id: 'web', url: 'https://example.com/library.html' },
  },
  favs: { default: ['lib', 'web'] },
  spaces: [{
    id: 'sp', name: 'Home', icon: '🏠', color: '#7c6cf0', profileId: 'default',
    pinned: [{ type: 'folder', id: 'f', name: 'F', open: true, children: [{ type: 'tab', id: 'pinnedLib' }] }],
    today: ['note', 'lib'],
  }],
});

assert.deepEqual(Object.keys(s.tabs).sort(), ['note', 'web'], 'Library tabs are dropped, other internal pages and web pages stay');
assert.deepEqual(s.favs.default, ['web']);
assert.deepEqual(s.spaces[0].today, ['note']);
assert.deepEqual(s.spaces[0].pinned[0].children, []);
console.log('library.test.js: ok');
