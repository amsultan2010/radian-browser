// Pure logic of the user's Site Search entries (src/main/palette.js) and of the
// Air Traffic Control rule kinds (src/main/prefs.js), without Electron or a window:
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

// --- Air Traffic Control: normal form of each kind -----------------------------------
assert.equal(prefs.routeText('HTTPS://GitHub.com/Radian#x', 'contains'), 'github.com/radian');
assert.equal(prefs.routeText('Example.com/Search?Q=1', 'contains'), 'example.com/search?q=1');
for (const bad of ['', '  ', 'a b', '#only', 'x'.repeat(201), 42]) assert.equal(prefs.routeText(bad, 'contains'), '', JSON.stringify(bad));
assert.equal(prefs.routeText('https://GitHub.com/radian/#readme', 'equals'), 'github.com/radian');
assert.equal(prefs.routeText('github.com', 'equals'), 'github.com');
assert.equal(prefs.routeText('localhost:3000/x/?a=1', 'equals'), 'localhost:3000/x?a=1');
for (const bad of ['', 'a b', 'ftp://x.com/', 'file:///x', 'javascript:alert(1)', 'https://u:p@x.com/', 'https://x.com/' + 'p'.repeat(200), null]) assert.equal(prefs.routeText(bad, 'equals'), '', JSON.stringify(bad));
assert.equal(prefs.routeText('github.com', 'regex'), '', 'unknown kind');
assert.equal(prefs.routeText('https://www.GitHub.com/Orbe/'), 'github.com/orbe', 'site rules unchanged');

// --- Air Traffic Control: matching --------------------------------------------------
const hits = (rule, urls) => urls.filter((u) => prefs.routeFor(u, [rule]) !== rule.to);
const misses = (rule, urls) => urls.filter((u) => prefs.routeFor(u, [rule]) !== null);
const contains = { match: 'github.com/radian', to: 'sp1', kind: 'contains' };
assert.deepEqual(hits(contains, ['https://github.com/radian', 'https://www.github.com/Radian/issues', 'http://GITHUB.com./radian-browser',
  'https://evil.tld/github.com/radian' /* the documented limit: any path can carry the text */]), []);
assert.deepEqual(misses(contains, ['https://evil.tld/?github.com/radian', 'https://evil.tld/#github.com/radian', 'https://github.com@evil.tld/radian',
  'https://github.com/orbe?radian', 'file:///github.com/radian', 'javascript:github.com/radian', 'not a url']), []);
const withQuery = { match: 'example.com/search?q=radian', to: 'sp1', kind: 'contains' };
assert.deepEqual(hits(withQuery, ['https://example.com/search?q=Radian&x=1']), []);
assert.deepEqual(misses(withQuery, ['https://example.com/search#?q=radian', 'https://example.com/search?x=1']), []);
const equals = { match: 'github.com/radian', to: 'little', kind: 'equals' };
assert.deepEqual(hits(equals, ['https://github.com/radian', 'http://github.com/radian/', 'https://GitHub.com/radian#readme']), []);
assert.deepEqual(misses(equals, ['https://github.com/radian/issues', 'https://github.com/radian?tab=1', 'https://gist.github.com/radian',
  'https://www.github.com/radian', 'https://evil.tld/github.com/radian', 'https://github.com/Radian', 'ftp://github.com/radian']), []);
assert.equal(prefs.routeFor('https://github.com/radian', [{ match: 'radian', to: 'x', kind: 'regex' }, equals, contains]), 'little', 'unknown kind skipped, first match wins');
assert.equal(prefs.routeFor('https://gist.github.com/x', [{ match: 'github.com', to: 'sp1' }]), 'sp1', 'site rules unchanged');

// --- Air Traffic Control: settings validation and migration ---------------------------
assert.equal(prefs.routes([contains, equals, { match: 'figma.com', to: 'sp1' }]), true);
for (const bad of [{ ...contains, kind: 'regex' }, { ...contains, kind: '' }, { ...contains, match: 'GitHub.com' }, { ...equals, match: 'https://github.com/radian' }, { ...contains, match: 'a b' }])
  assert.equal(prefs.routes([bad]), false, JSON.stringify(bad));
settings.routes = [{ match: 'a b', to: 'sp1' }];
assert.equal(prefs.routes([{ match: 'a b', to: 'sp1' }]), true, 'a stored rule may stay as it is');
assert.equal(prefs.routes([{ match: 'a b', to: 'sp1', kind: 'contains' }]), false, 'but not change kind without fitting it');
const old = { routes: [{ match: 'GitHub.com/X', to: 'sp1', kind: 'contains' }, { match: 'https://github.com/x/', to: 'sp1', kind: 'equals' },
  { match: 'whatever', to: 'sp1', kind: 'future' }, { match: '/chemin', to: 'sp1' }, { match: 'https://www.Figma.com/', to: 'sp1' }, null] };
assert.equal(prefs.migrateRoutes(old), true);
assert.deepEqual(old.routes, [{ match: 'github.com/x', to: 'sp1', kind: 'contains' }, { match: 'github.com/x', to: 'sp1', kind: 'equals' },
  { match: 'whatever', to: 'sp1', kind: 'future' }, { match: '/chemin', to: 'sp1' }, { match: 'figma.com', to: 'sp1' }]);
assert.equal(prefs.routeFor('https://x.tld/chemin', old.routes), null, 'an old free-text rule is not turned into "contains" on its own');
assert.equal(prefs.migrateRoutes(old), false, 'migration is stable');

// --- Default Document App (New Note): known apps only, never an inherited key ---------
for (const v of ['notes', 'notion', 'googleDocs', 'word', 'confluence']) assert.equal(prefs.SETTABLE.noteApp(v), true, v);
for (const v of ['constructor', 'toString', '', 'docs', null]) assert.equal(prefs.SETTABLE.noteApp(v), false, String(v));
assert.equal(prefs.PROFILE_KEYS.noteApp, prefs.SETTABLE.noteApp);

console.log('liens.test.js: ok');
