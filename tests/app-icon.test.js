// App icon variants (src/main/app-icon.js, assets/icons): pure logic and artwork, without Electron.
//   node --test tests/app-icon.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appIcon = require('../src/main/app-icon');
const { DEFAULT_SETTINGS } = require('../src/main/store');
const { fr, en } = require('../src/shared/locales');

const dir = path.join(__dirname, '..', 'assets', 'icons');
// Width and height from a PNG's IHDR chunk.
const size = (file) => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('the default is the original icon, and it comes first', () => {
  assert.equal(appIcon.NAMES[0], 'original');
  assert.equal(DEFAULT_SETTINGS.appIcon, 'original');
});

test('every variant has its SVG source, a 1024 px PNG for the Dock and a 128 px thumbnail', () => {
  for (const name of appIcon.NAMES) {
    assert.ok(fs.existsSync(path.join(dir, name + '.svg')), name + '.svg');
    assert.deepEqual(size(path.join(dir, name + '.png')), [1024, 1024], name + '.png');
    assert.deepEqual(size(path.join(dir, name + '-128.png')), [128, 128], name + '-128.png');
  }
});

test('every variant is named in French and in English', () => {
  for (const key of ['set.appIcon', 'set.appIconHint', ...appIcon.NAMES.map((n) => 'appIcon.' + n)]) {
    assert.ok(fr[key] && en[key], key);
  }
});

test('the settings grid gets every variant on macOS, none elsewhere', () => {
  const list = appIcon.list();
  if (process.platform !== 'darwin') return assert.deepEqual(list, []);
  assert.deepEqual(list.map((x) => x.name), appIcon.NAMES);
  assert.ok(list.every((x) => x.src.startsWith('data:image/png;base64,')));
});
