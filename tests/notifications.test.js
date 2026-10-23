// Pure logic of the page-world notification hook (src/preload/page.js `notificationHook`),
// without Electron or a window:
//   node tests/notifications.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The preload as a plain script, on a page that is not a web page: only its declarations run.
const preload = { require: () => ({ ipcRenderer: {}, contextBridge: {} }), location: { protocol: 'about:' } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/preload/page.js'), 'utf8'), preload);
assert.equal(typeof preload.notificationHook, 'function');

// A page world. Its EventTarget keeps its listeners, so the test can hand them an event the
// browser would mark trusted (a script cannot make one).
function pageWorld({ notifications = true } = {}) {
  const page = vm.createContext({});
  vm.runInContext(`
    globalThis.window = globalThis;
    globalThis.EventTarget = class { addEventListener(type, fn) { (this.heard || (this.heard = [])).push([type, fn]); } };
    ${notifications ? `Object.defineProperty(window, 'Notification', { writable: true, enumerable: false, configurable: true, value: class Notification extends EventTarget {
      constructor(title) { super(); this.title = title; }
      static get permission() { return 'granted'; }
      static requestPermission() { return 'asked'; }
    } });` : ''}
  `, page);
  let clicks = 0;
  // Electron sends the function's source to the page world: it is rebuilt there from its text.
  vm.runInContext(`(${preload.notificationHook})`, page)(() => { clicks += 1; });
  return { page, run: (code) => vm.runInContext(code, page), clicks: () => clicks };
}

const { run, clicks } = pageWorld();
// The page replaces what the hook relies on, after the hook is in place.
run(`EventTarget.prototype.addEventListener = () => {}; Reflect.construct = () => ({});`);
assert.equal(run(`globalThis.n = new Notification('Hi'); n.title`), 'Hi');
assert.equal(run(`n instanceof Notification && Notification.name === 'Notification'`), true);
assert.equal(run(`Notification.permission + ' ' + Notification.requestPermission()`), 'granted asked');
const d = run(`Object.getOwnPropertyDescriptor(window, 'Notification')`);
assert.deepEqual([d.writable, d.enumerable, d.configurable], [true, false, true]);

const heard = run(`n.heard`);
assert.equal(heard.length, 1);
assert.equal(heard[0][0], 'click');
heard[0][1]({ isTrusted: false }); // n.dispatchEvent(new Event('click')) from the page
assert.equal(clicks(), 0, 'a click the page fakes does not count');
heard[0][1]({ isTrusted: true });
assert.equal(clicks(), 1, 'a real click is reported');

// A page subclass of Notification is hooked too.
assert.equal(run(`class Mine extends Notification {}; globalThis.m = new Mine('x'); m instanceof Mine && m.heard.length`), 1);

// No Notification in the page (insecure context): nothing is added.
assert.equal(pageWorld({ notifications: false }).run(`'Notification' in window`), false);

console.log('notifications.test.js: ok');
