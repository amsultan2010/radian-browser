// Pure logic of the user's Site Search entries (src/main/palette.js, src/main/prefs.js),
// without Electron or a window:
//   node tests/liens.test.js
const assert = require('node:assert/strict');
const { store } = require('../src/main/store');
const prefs = require('../src/main/prefs');
const palette = require('../src/main/palette');

store.state = { settings: { lang: 'en', routes: [] }, spaces: [{ id: 'sp1' }], profiles: [] };
const settings = store.state.settings;

// --- Site Search: validation -------------------------------------------------------
const ok = { name: 'Docs', keyword: 'd', url: 'https://docs.example.com/search?q=%s' };
assert.equal(prefs.siteSearch([]), true);
assert.equal(prefs.siteSearch([ok]), true);
assert.equal(prefs.siteSearch([{ ...ok, url: 'http://intra.local/?q=%s&again=%s' }]), true);
for (const bad of [
  { ...ok, url: 'https://docs.example.com/search' }, // no %s
  { ...ok, url: 'javascript:alert(%s)' },
  { ...ok, url: 'file:///%s' },
  { ...ok, url: '%shttps://x.com' }, // the query would choose the scheme
  { ...ok, url: 'https://x.com/?q=%s ' + 'x' }, // whitespace
  { ...ok, url: 'https://' + 'a'.repeat(500) + '%s' },
  { ...ok, keyword: 'two words' },
  { ...ok, keyword: 'YT' }, // stored lowercased
  { ...ok, keyword: '' },
  { ...ok, keyword: 'k'.repeat(31) },
  { ...ok, name: '' },
  { ...ok, name: ' Docs' },
  { ...ok, name: 'n'.repeat(41) },
  { ...ok, extra: 1 },
  { name: 'Docs', keyword: 'd' },
  null,
]) assert.equal(prefs.siteSearch([bad]), false, JSON.stringify(bad));
assert.equal(prefs.siteSearch([ok, { ...ok, name: 'Other' }]), false, 'duplicate keyword');
assert.equal(prefs.siteSearch(Array.from({ length: 51 }, (_, i) => ({ ...ok, keyword: 'k' + i }))), false, 'too many');
assert.equal(prefs.siteSearch('nope'), false);
assert.equal(prefs.SETTABLE.siteSearch, prefs.siteSearch);

// --- Site Search: merge with built-ins and template expansion -----------------------
settings.siteSearch = [ok, { name: 'Invidious', keyword: 'yt', url: 'https://yewtu.be/search?q=%s' }, { name: 'Twice', keyword: 'tw', url: 'https://x.org/%s/?q=%s' }];
assert.equal(palette.siteFor('D').name, 'Docs');
assert.equal(palette.siteFor(' yt ').name, 'Invidious', 'a custom keyword replaces the built-in one');
assert.equal(palette.siteFor('youtube').name, 'YouTube', 'the built-in keeps its other keys');
assert.equal(palette.siteFor('nothing'), null);
const keys = palette.siteKeys();
assert.deepEqual(keys.d, ['kw:d', 'Docs']);
assert.deepEqual(keys.yt, ['kw:yt', 'Invidious']);
assert.deepEqual(keys.youtube, ['youtube', 'YouTube']);
const [item] = palette.siteItems('kw:d', ' a&b c/é ');
assert.equal(item.url, 'https://docs.example.com/search?q=a%26b%20c%2F%C3%A9');
assert.equal(item.kind, 'search');
assert.equal(palette.siteItems('kw:tw', 'q')[0].url, 'https://x.org/q/?q=q', 'every %s is replaced');
assert.equal(palette.siteItems('youtube', 'x')[0].url, 'https://www.youtube.com/results?search_query=x');
assert.deepEqual(palette.siteItems('kw:missing', 'x'), []);
assert.equal(palette.siteHint('yt').site, 'kw:yt');
settings.siteSearch = [];
assert.deepEqual(palette.siteKeys().yt, ['youtube', 'YouTube'], 'removing the custom keyword brings the built-in back');

console.log('liens.test.js: ok');
