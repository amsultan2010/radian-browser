// CPU rule of the tab sleep policy (veille.burning): pure logic, no Electron.
//   node tests/veille.test.js
const assert = require('node:assert/strict');
const { burning, CPU, CPU_SAVER } = require('../src/main/veille');

const tab = (id, pids, extra = {}) => ({ id, pids, kept: false, typed: false, ...extra });

// Feeds `steps` samples, `every` ms apart. `load(step)`: Map pid -> % of one core used since the
// previous sample (turned into cumulative seconds here). Returns the ids slept at each step.
function run(tabs, load, steps, { every = CPU.everyMs, saver = false, tabsAt = () => tabs } = {}) {
  let state = new Map();
  const cum = new Map();
  const out = [];
  for (let i = 0; i < steps; i += 1) {
    for (const [pid, pct] of load(i)) cum.set(pid, (cum.get(pid) || 0) + (pct / 100) * (every / 1000));
    const r = burning(tabsAt(i), new Map(cum), state, { now: 1e6 + i * every, saver });
    state = r.state;
    out.push(r.ids.join());
  }
  return out;
}
const flat = (entries) => () => new Map(entries);

// A hidden tab at a full core: baseline, then four samples above the line, then sleep.
assert.deepEqual(run([tab('a', [1])], flat([[1, 100]]), 6), ['', '', '', '', 'a', 'a']);

// Under the line, never.
assert.deepEqual(run([tab('a', [1])], flat([[1, CPU.pct - 1]]), 8), Array(8).fill(''));

// A dip below the line starts the count again.
assert.deepEqual(run([tab('a', [1])], (i) => new Map([[1, i === 3 ? 10 : 90]]), 8), ['', '', '', '', '', '', '', 'a']);

// Never a tab that is shown, plays, captures (kept) or that the user acted on (typed).
assert.deepEqual(run([tab('a', [1], { kept: true }), tab('b', [2], { typed: true })], flat([[1, 100], [2, 100]]), 8), Array(8).fill(''));

// Shared process: an innocent shown tab keeps both awake; two hidden tabs sleep together.
assert.deepEqual(run([tab('a', [1]), tab('b', [1], { kept: true })], flat([[1, 100]]), 8), Array(8).fill(''));
assert.deepEqual(run([tab('a', [1]), tab('b', [1])], flat([[1, 100]]), 5).at(-1), 'a,b');

// A hot process used only by one tab's iframe sleeps that tab, not the tab sharing its main process.
assert.deepEqual(run([tab('a', [1, 9]), tab('b', [1])], flat([[1, 0], [9, 100]]), 5).at(-1), 'a');

// CPU burnt while on screen does not count: once hidden, the count starts from a fresh baseline.
assert.deepEqual(
  run([], flat([[1, 100]]), 8, { tabsAt: (i) => [tab('a', [1], { kept: i < 3 })] }),
  ['', '', '', '', '', '', '', 'a'],
);

// Battery Saver: a lower line, sampled faster.
const third = flat([[1, 30]]);
assert.deepEqual(run([tab('a', [1])], third, 8), Array(8).fill(''));
assert.deepEqual(run([tab('a', [1])], third, 5, { every: CPU_SAVER.everyMs, saver: true }).at(-1), 'a');
assert.ok(CPU_SAVER.everyMs < CPU.everyMs && CPU_SAVER.pct < CPU.pct);

// A reused pid (its counter went back) or a missing reading is a baseline, not a spike.
{
  const prev = new Map([[1, { cum: 500, at: 0, streak: 3 }]]);
  const r = burning([tab('a', [1])], new Map([[1, 2]]), prev, { now: 30e3 });
  assert.deepEqual(r.ids, []);
  assert.equal(r.state.get(1).streak, 0);
  assert.equal(burning([tab('a', [1])], new Map([[1, undefined]]), prev, { now: 30e3 }).state.size, 0);
}

// Only processes still in use are remembered.
assert.deepEqual([...burning([tab('a', [1])], new Map([[1, 1], [2, 1]]), new Map([[3, { cum: 0, at: 0, streak: 1 }]]), { now: 1 }).state.keys()], [1]);

console.log('veille.test.js: ok');
