// Settings model behind the Arc-style settings window (src/main/store.js, src/main/prefs.js), without Electron:
//   node --test tests/reglages.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { store } = require('../src/main/store');
const prefs = require('../src/main/prefs');

test('a new install gets Arc\'s defaults; a saved settings file keeps its own values', () => {
  const fresh = store.normalize({}).settings;
  assert.equal(fresh.warnOnQuit, true);
  assert.equal(fresh.restoreSession, false);
  const saved = store.normalize({ settings: { lang: 'en', warnOnQuit: false, restoreSession: true } }).settings;
  assert.equal(saved.warnOnQuit, false);
  assert.equal(saved.restoreSession, true);
  const older = store.normalize({ settings: { lang: 'fr' } }).settings; // saved before these keys existed: Radian's old defaults
  assert.equal(older.warnOnQuit, false);
  assert.equal(older.restoreSession, true);
});

test('per-profile values, with the old general value as the fallback ("Ask every time" included)', () => {
  store.state = { settings: { searchEngine: 'bing', downloadAsk: false, profileSettings: { p2: { downloadAsk: true, searchEngine: 'duckduckgo' } } }, profiles: [{ id: 'default' }, { id: 'p2' }], spaces: [] };
  assert.equal(prefs.get('searchEngine', 'default'), 'bing');
  assert.equal(prefs.get('searchEngine', 'p2'), 'duckduckgo');
  assert.equal(prefs.get('downloadAsk', 'p2'), true);
  assert.equal(prefs.get('downloadAsk', 'default'), false);
  assert.equal(prefs.PROFILE_KEYS.downloadAsk('yes'), false);
});

test('Little Radian archive delays: Arc\'s 1, 6 and 12 hours, and Radian\'s longer ones', () => {
  for (const h of [1, 6, 12, 24, 168, 720, 0]) assert.equal(prefs.SETTABLE.littleArchiveHours(h), true, String(h));
  for (const h of [2, 3, '6', null]) assert.equal(prefs.SETTABLE.littleArchiveHours(h), false, String(h));
});
