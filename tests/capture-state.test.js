// Which tab is outlined as shared, and when the screen indicator may go off
// (src/main/capture-state.js), with stand-in webContents:
//   node tests/capture-state.test.js
const assert = require('node:assert/strict');
const capture = require('../src/main/capture-state');

const tab = (id) => ({ id, captured: false, isDestroyed: () => false, isBeingCaptured() { return this.captured; }, on() {}, once() {}, reload() {} });
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const meet = tab(1);
  const doc = tab(2);
  const cam = tab(3);
  capture.mark(cam, 'camera');
  assert.equal(capture.shared(cam), false, 'a camera alone is not a share');

  // A screen or a window: the page sharing it is outlined.
  capture.mark(meet, 'screen');
  assert.deepEqual([capture.shared(meet), capture.shared(doc)], [true, false]);

  // Share this tab instead: the picked tab is outlined, the indicator stays on the page,
  // and it holds even once that tab is no longer captured (the screen may still be).
  capture.mark(meet, 'screen', { tab: doc });
  assert.deepEqual([capture.shared(meet), capture.shared(doc), capture.of(meet).join()], [false, true, 'screen']);
  capture.clearAll(meet);

  // The page's own tab, shared alone: the indicator goes off when the capture ends.
  doc.captured = true;
  capture.mark(meet, 'screen', { tab: doc });
  assert.equal(capture.shared(doc), true);
  doc.captured = false;
  await tick(4000 + 700 * 3 + 300);
  assert.deepEqual([capture.of(meet).join(), capture.shared(doc)], ['', false]);
  console.log('capture-state: ok');
})().catch((err) => { console.error(err); process.exit(1); });
