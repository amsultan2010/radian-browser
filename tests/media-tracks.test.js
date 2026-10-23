// The player's microphone and camera buttons (src/preload/media.js), without
// Electron: the preload runs in a bare context with stand-ins for the page's media APIs.
//   node tests/media-tracks.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ crypto: globalThis.crypto, Promise, Proxy, Reflect, Object, Set, String, Array });
vm.runInContext(`
  class MediaStreamTrack {
    constructor(kind, on = true) { this._k = kind; this._on = on; this._s = 'live'; }
    get kind() { return this._k; }
    get readyState() { return this._s; }
    get enabled() { return this._on; }
    set enabled(v) { this._on = !!v; }
    clone() { return new MediaStreamTrack(this._k, this._on); }
    stop() { this._s = 'ended'; }
  }
  class MediaStream { constructor(list) { this._t = list; } getTracks() { return [...this._t]; } }
  class MediaDevices {
    getUserMedia(c) {
      if (!c) return Promise.reject(new Error('TypeError'));
      return Promise.resolve(new MediaStream([...(c.audio ? [new MediaStreamTrack('audio')] : []), ...(c.video ? [new MediaStreamTrack('video')] : [])]));
    }
  }
  class MediaSession { setActionHandler() {} }
  var navigator = { mediaSession: new MediaSession(), mediaDevices: new MediaDevices() };
  var location = { protocol: 'https:' };
  var process = { isMainFrame: true };
`, ctx);
let key = '';
ctx.require = () => ({
  webFrame: { executeJavaScript: (code) => vm.runInContext(code, ctx) },
  ipcRenderer: { send: (channel, k) => { key = k; } },
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/preload/media.js'), 'utf8'), ctx);
assert.match(key, /^[0-9a-f]{32}$/);
const run = (code) => vm.runInContext(code, ctx);
const ask = (arg) => run(`navigator.mediaSession.setActionHandler(${JSON.stringify(key)}, ${JSON.stringify(arg)})`);

(async () => {
  assert.deepEqual([...ask('tracks')], ['', ''], 'no call yet: no buttons');
  await run(`navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then((s) => { window = { s }; })`);
  assert.deepEqual([...ask('tracks')], ['on', 'on']);

  // Microphone off: the page's audio track is disabled, its camera is untouched.
  assert.equal(ask('audio'), 'off');
  assert.equal(run('window.s.getTracks()[0].enabled'), false);
  assert.equal(run('window.s.getTracks()[1].enabled'), true);
  assert.deepEqual([...ask('tracks')], ['off', 'on']);

  // A clone the page makes later is turned back on with the original.
  run('window.c = window.s.getTracks()[0].clone()');
  assert.equal(ask('audio'), 'on');
  assert.equal(run('window.c.enabled && window.s.getTracks()[0].enabled'), true);

  // The page cannot make the button lie by swapping the track's getter.
  run(`Object.defineProperty(MediaStreamTrack.prototype, 'enabled', { get() { return true; }, set() {} })`);
  assert.equal(ask('audio'), 'off');
  assert.equal(run('window.c._on || window.s.getTracks()[0]._on'), false);

  // Camera button, then every track stopped: nothing left to control.
  assert.equal(ask('video'), 'off');
  run('window.s.getTracks().forEach((t) => t.stop()); window.c.stop()');
  assert.deepEqual([...ask('tracks')], ['', '']);

  // The page's own calls behave as before; a wrong key reads nothing.
  run('navigator.mediaSession.setActionHandler("play", () => {})');
  assert.deepEqual([...ask(null)], ['play']);
  assert.equal(run('navigator.mediaSession.setActionHandler("0".repeat(32), "tracks")'), undefined);
  assert.equal(await run('navigator.mediaDevices.getUserMedia().then(() => "ok", () => "refused")'), 'refused');
  console.log('media-tracks: ok');
})().catch((err) => { console.error(err); process.exit(1); });
