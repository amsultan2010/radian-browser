// Command Bar learning (src/main/suggest.js): pure logic, without Electron.
//   node tests/suggest.test.js
const assert = require('node:assert/strict');
const Module = require('module');

// suggest.js only needs electron's `net`, for the engine's remote suggestions.
const load = Module._load;
Module._load = function (request, ...rest) { return request === 'electron' ? {} : load.call(this, request, ...rest); };

const { store } = require('../src/main/store');
const suggest = require('../src/main/suggest');

store.state = store.normalize({ settings: { lang: 'en' } });
const DAY = 864e5;
const entry = (url, title, visits, age) => ({ url, title, visits, last: Date.now() - age });
const MAIL = 'https://mail.example.com/';
const GMAIL = 'https://gmail.com/';
const HOT = 'https://hotmail.example/';
const SEARCH = suggest.searchUrl('mail');
const reset = () => {
  store.state.history = {
    [MAIL]: entry(MAIL, 'Mail Example', 30, 0), // completes « mail »: the autocomplete row
    [GMAIL]: entry(GMAIL, 'Gmail', 1, 60 * DAY),
    [HOT]: entry(HOT, 'Hotmail', 10, 0),
    [SEARCH]: entry(SEARCH, 'mail - Google Search', 1, 60 * DAY),
  };
  suggest.forget();
};
const local = (q, more = {}) => suggest.local(q, { tabs: [], commands: [], activeId: null, ...more });
const urls = (items) => items.filter((i) => i.kind === 'history').map((i) => i.url);

// Nothing learned: the prefix match is completed inline, first.
reset();
let out = local('mail');
assert.equal(out[0].url, MAIL);
assert.equal(out[0].complete, 'mail.example.com');
assert.equal(out[1].kind, 'search');
assert.deepEqual(urls(out), [MAIL, HOT, GMAIL]);

// Recording: normalized typed text, existing history pages only, never an empty query.
assert.equal(suggest.learn('', GMAIL), false);
assert.equal(suggest.learn('mail', 'https://never.seen/'), false);
assert.equal(suggest.learn('mail', undefined), false);
assert.equal(suggest.learn('mail', 'constructor'), false);
const rev = store.historyRev || 0;
assert.equal(suggest.learn('  MÁIL ', GMAIL), true);
assert.equal(store.historyRev, rev + 1); // history saved, incremental search restarts
assert.equal(store.state.history[GMAIL].picks.length, 1);
assert.deepEqual(store.state.history[GMAIL].picks[0].slice(0, 2), ['mail', 1]);

// One pick ranks the page higher, but not yet above the inline completion.
out = local('mail');
assert.deepEqual(urls(out), [MAIL, GMAIL, HOT]);
assert.equal(out[0].url, MAIL);

// Picked again and again: it becomes the first row, without inline completion.
suggest.learn('mail', GMAIL);
suggest.learn('mail', GMAIL);
assert.deepEqual(store.state.history[GMAIL].picks.map((p) => p.slice(0, 2)), [['mail', 3]]);
out = local('mail');
assert.equal(out[0].kind, 'history');
assert.equal(out[0].url, GMAIL);
assert.equal(out[0].complete, undefined);
assert.equal(out[1].kind, 'search');
assert.ok(urls(out).includes(MAIL)); // the former autocomplete is still listed
// Also for a longer query, not for a shorter one.
assert.equal(local('maill').some((i) => i.url === GMAIL), false); // no longer matches: no boost
assert.equal(local('mai')[0].url, MAIL);

// Picked for a shorter prefix: boosted for what extends it.
reset();
for (let i = 0; i < 3; i++) suggest.learn('ma', GMAIL);
assert.equal(local('mail')[0].url, GMAIL);
assert.equal(local('m')[0].url, MAIL);

// Open tabs and actions keep their places after the first row and the search.
out = local('mail', { tabs: [{ id: 't', url: 'https://inbox.example/', title: 'Mail inbox' }], commands: [{ title: 'Mail settings', command: 'x' }] });
assert.deepEqual(out.slice(0, 4).map((i) => i.kind), ['history', 'search', 'tab', 'command']);
assert.equal(out[0].url, GMAIL);

// A typed address stays first.
for (let i = 0; i < 3; i++) suggest.learn('gmail.com', MAIL);
assert.equal(local('gmail.com')[0].kind, 'url');

// The search itself picked: the search row comes first, no autocomplete, no duplicate.
reset();
for (let i = 0; i < 3; i++) suggest.learn('mail', SEARCH);
out = local('mail');
assert.equal(out[0].kind, 'search');
assert.equal(out[0].url, SEARCH);
assert.equal(out.filter((i) => i.url === SEARCH).length, 1);

// Bounded: a few typed prefixes per page, most recent first; long input is cut.
reset();
for (const q of ['a', 'b', 'c', 'd', 'e', 'c']) suggest.learn(q, GMAIL);
assert.deepEqual(store.state.history[GMAIL].picks.map((p) => p.slice(0, 2)), [['c', 2], ['e', 1], ['d', 1], ['b', 1]]);
suggest.learn('x'.repeat(500), GMAIL);
assert.equal(store.state.history[GMAIL].picks[0][0].length, 64);

// Cleared with history: nothing is kept anywhere else.
store.state.history = {};
suggest.forget();
assert.equal(local('mail').filter((i) => i.kind === 'history').length, 0);

console.log('suggest: ok');
