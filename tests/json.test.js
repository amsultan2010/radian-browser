// Pure logic of the JSON view (src/preload/json.js): which documents it takes, and the
// escaping of the tree it draws, without Electron or a window:
//   node tests/json.test.js
const assert = require('node:assert/strict');
const { parse, render, MAX } = require('../src/preload/json');

// --- Which documents ------------------------------------------------------------------
const doc = (text, more = {}) => parse({ contentType: 'application/json', tags: ['PRE'], text, ...more });
assert.deepEqual(doc('{"a":1}'), { a: 1 });
assert.deepEqual(doc('  [1, 2]'), [1, 2]);
assert.deepEqual(doc('{"a":1}', { contentType: 'application/problem+json' }), { a: 1 });
assert.deepEqual(doc('{"a":1}', { contentType: 'text/json' }), { a: 1 });
// Chrome's own pretty-print box beside the <pre> does not matter.
assert.deepEqual(doc('{"a":1}', { tags: ['PRE', 'DIV'] }), { a: 1 });
// Plain text holding an object or array; an empty content type too (file without a header).
assert.deepEqual(doc('\n{"a":1}', { contentType: 'text/plain' }), { a: 1 });
assert.deepEqual(doc('[]', { contentType: '' }), []);
for (const [text, more, why] of [
  ['{"a":1}', { contentType: 'text/html' }, 'an HTML page'],
  ['{"a":1}', { contentType: 'application/xhtml+xml' }, 'an XHTML page'],
  ['{"a":1}', { title: 'API' }, 'a page with a title'],
  ['{"a":1}', { tags: ['PRE', 'PRE'] }, 'two <pre>'],
  ['{"a":1}', { tags: ['H1', 'PRE'] }, 'a heading beside the <pre>'],
  ['{"a":1}', { tags: [] }, 'no <pre>'],
  ['hello {"a":1}', { contentType: 'text/plain' }, 'plain text'],
  ['"just a string"', {}, 'a lone string'],
  ['42', {}, 'a lone number'],
  ['null', {}, 'null'],
  ['{"a":', {}, 'broken JSON'],
  ['', {}, 'nothing'],
  ['[' + ' '.repeat(MAX) + ']', {}, 'over the size limit'],
]) assert.equal(doc(text, more), null, why);

// --- The tree -------------------------------------------------------------------------
const html = render(doc('{"name":"Arc","n":1.5,"ok":true,"none":null,"list":[1,"two"],"empty":{},"none2":[]}'));
const count = (s, re) => (s.match(re) || []).length;
assert.equal(count(html, /<div/g), count(html, /<\/div>/g), 'balanced');
assert.equal(count(html, /class="en"/g), 10, 'one entry per value');
assert.equal(count(html, /class="ex"/g), 2, 'expanders only on non-empty objects and arrays');
assert.match(html, /<span class="k">&quot;name&quot;<\/span>: <span class="s">&quot;Arc&quot;<\/span>,/);
assert.match(html, /<span class="n">1\.5<\/span>/);
assert.match(html, /<span class="b">true<\/span>/);
assert.match(html, /<span class="nl">null<\/span>/);
assert.match(html, /<span class="k">&quot;empty&quot;<\/span>: \{\},/);
assert.match(html, /\[\]<\/div><\/div>\}<\/div>$/, 'no comma after the last entry');

// Keys and values never become markup; strings show their JSON escapes.
const evil = render(doc(JSON.stringify({ '<img src=x onerror=alert(1)>': '</div><script>alert(1)</script>', "q'\"": 'line\nbreak & more' })));
assert.doesNotMatch(evil, /<img|<script|<\/div><script/);
assert.match(evil, /&lt;img src=x onerror=alert\(1\)&gt;/);
assert.match(evil, /&quot;q&#39;\\&quot;&quot;/);
assert.match(evil, /line\\nbreak &amp; more/);

// Web addresses become links; nothing else does, and the address stays inside its attribute.
const links = render(doc(JSON.stringify(['https://example.com/?a=1&b="x"', 'javascript:alert(1)', 'ftp://example.com', 'see https://example.com'])));
assert.equal(count(links, /<a /g), 1);
assert.match(links, /<a href="https:\/\/example\.com\/\?a=1&amp;b=&quot;x&quot;">/);
assert.doesNotMatch(links, /href="javascript/);

// Nested too deeply to draw: render throws, and the page stays raw.
const deep = doc('['.repeat(200000) + ']'.repeat(200000));
assert.ok(Array.isArray(deep));
assert.throws(() => render(deep), RangeError);

console.log('json view: ok');
