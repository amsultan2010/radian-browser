// JSON view, after the JSON Formatter extension that Arc installs with Developer Mode:
// a JSON document (served as JSON, or plain text holding an object or array) is shown
// as a collapsible tree, with Raw and Parsed buttons to switch back and forth.
//
// Isolated world, top frame of web pages only. The text is read with JSON.parse, never
// run; every key and value is escaped before it reaches the page; the tree's listeners
// live here, so the page gets nothing it did not have. Documents over MAX characters,
// or too deeply nested to draw, stay raw. `parse` and `render` are pure, for
// tests/json.test.js.

// JSON Formatter's own limit, in characters.
const MAX = 3000000;
// Text elements at the top of the body: an HTML page, not a JSON document (as JSON Formatter).
const PROSE = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL']);
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

// The document's object or array, or null when the page should stay as it is.
// `tags`: tag names of the body's children; `text`: the text of its <pre>.
function parse({ contentType = '', title = '', tags = [], text = '' }) {
  if (/html/i.test(contentType) || title || tags.filter((t) => t === 'PRE').length !== 1 || tags.some((t) => PROSE.has(t))) return null;
  if (!text || text.length > MAX) return null;
  if (!/^(application|text)\/([\w.-]+\+)?json$/i.test(contentType) && !/^\s*[{[]/.test(text)) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

const leaf = (v) => {
  if (typeof v !== 'string') return `<span class="${v === null ? 'nl' : typeof v === 'number' ? 'n' : 'b'}">${esc(v)}</span>`;
  const shown = esc(JSON.stringify(v));
  return `<span class="s">${/^https?:\/\//i.test(v) ? `"<a href="${esc(v)}">${shown.slice(1, -1)}</a>"` : shown}</span>`;
};

// The tree's HTML. Recursive: a document nested deeply enough throws RangeError.
function render(value) {
  const out = [];
  (function entry(v, key, last) {
    const box = v !== null && typeof v === 'object';
    const arr = Array.isArray(v);
    const keys = box && !arr ? Object.keys(v) : null;
    const n = box ? (arr ? v.length : keys.length) : 0;
    out.push('<div class="en">');
    if (n) out.push('<button class="ex" aria-expanded="true"></button>');
    if (key !== undefined) out.push(`<span class="k">${esc(JSON.stringify(key))}</span>: `);
    if (!box) out.push(leaf(v));
    else {
      out.push(arr ? '[' : '{');
      if (n) {
        out.push('<span class="ell"></span><div class="in">');
        for (let i = 0; i < n; i++) entry(arr ? v[i] : v[keys[i]], arr ? undefined : keys[i], i === n - 1);
        out.push('</div>');
      }
      out.push(arr ? ']' : '}');
    }
    out.push(last ? '</div>' : ',</div>');
  })(value, undefined, true);
  return out.join('');
}

const CSS = `
:root { color-scheme: light dark; }
body { margin: 0; }
.jv-bar { position: fixed; top: 8px; right: 12px; z-index: 1; display: flex; padding: 2px; border-radius: 8px; background: Canvas; box-shadow: 0 0 0 1px rgba(127, 127, 127, 0.25), 0 2px 8px rgba(0, 0, 0, 0.12); font: 12px system-ui, sans-serif; user-select: none; }
.jv-bar button { padding: 4px 12px; border: 0; border-radius: 6px; background: none; color: inherit; font: inherit; opacity: 0.7; }
.jv-bar button[aria-pressed="true"] { background: rgba(127, 127, 127, 0.2); opacity: 1; }
.jv { padding: 8px 120px 16px 28px; font: 13px/1.5 ui-monospace, 'SF Mono', Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; color: #444; }
body > pre { margin: 0; padding: 40px 12px 12px; }
body > [hidden] { display: none !important; }
.jv .en { position: relative; }
.jv .in { margin-left: 3px; padding-left: 24px; border-left: 1px dotted rgba(127, 127, 127, 0.45); }
.jv .ex { position: absolute; left: -20px; top: 0; width: 20px; height: 19px; padding: 0; border: 0; background: none; color: inherit; opacity: 0.3; }
.jv .ex:hover { opacity: 0.6; }
.jv .ex::after { content: ''; display: block; margin: auto; border-style: solid; border-width: 4px 0 4px 7px; border-color: transparent transparent transparent currentColor; width: 0; transform: rotate(90deg); }
.jv .shut > .ex::after { transform: none; }
.jv .shut > .in { display: none; }
.jv .shut > .ell::after { content: '…'; margin: 0 4px; opacity: 0.6; }
.jv .k { color: #111; }
.jv .s { color: #16803c; }
.jv .n, .jv .b, .jv .nl { color: #1d4ed8; font-weight: 600; }
.jv a { color: inherit; text-decoration: none; }
.jv a:hover { text-decoration: underline; }
@media (prefers-color-scheme: dark) {
  .jv { color: #b6b6b6; }
  .jv .k { color: #f2f2f2; }
  .jv .s { color: #4ade80; }
  .jv .n, .jv .b, .jv .nl { color: #60a5fa; }
}
`;

function start() {
  const { ipcRenderer } = require('electron');
  addEventListener('DOMContentLoaded', () => {
    if (!document.body) return;
    const kids = [...document.body.children];
    const pre = kids.find((el) => el.tagName === 'PRE');
    const value = pre && parse({ contentType: document.contentType, title: document.title, tags: kids.map((el) => el.tagName), text: pre.textContent });
    if (!value) return;
    const labels = ipcRenderer.sendSync('orbe-json');
    const tree = document.createElement('div');
    tree.className = 'jv';
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      tree.innerHTML = render(value); // throws on a document nested too deeply, or under Trusted Types
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    } catch {
      return;
    }
    tree.addEventListener('click', (e) => {
      const ex = e.target.closest('.ex');
      if (!ex) return;
      const shut = ex.getAttribute('aria-expanded') === 'true';
      // ⌘-click: the whole level, as in JSON Formatter.
      for (const el of e.metaKey ? ex.parentElement.parentElement.children : [ex.parentElement]) {
        const b = el.firstElementChild;
        if (!b || !b.classList.contains('ex')) continue;
        el.classList.toggle('shut', shut);
        b.setAttribute('aria-expanded', String(!shut));
      }
    });
    const bar = document.createElement('div');
    bar.className = 'jv-bar';
    const show = (view) => {
      tree.hidden = view === 'raw';
      pre.hidden = view !== 'raw';
      for (const b of bar.children) b.setAttribute('aria-pressed', String(b.dataset.view === view));
    };
    for (const view of ['raw', 'parsed']) {
      const b = document.createElement('button');
      b.textContent = labels[view];
      b.dataset.view = view;
      b.onclick = () => show(view);
      bar.append(b);
    }
    for (const el of kids) el.hidden = true; // Chrome's own pretty-print box goes too
    document.body.prepend(bar, tree);
    show('parsed');
  }, { once: true });
}

if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && window.top === window) start();

if (typeof module !== 'undefined') module.exports = { parse, render, MAX }; // sandboxed preloads may have no `module`
