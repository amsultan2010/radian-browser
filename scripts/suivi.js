#!/usr/bin/env node
// Suivi : coche des points de docs/suivi/*.md et affiche le bilan.
//   node scripts/suivi.js                      -> bilan par état
//   node scripts/suivi.js fait BL-10 CMD-4 "note"  -> passe ces points à ✅ (la note remplace la dernière colonne)
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'docs', 'suivi');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md');
const STATES = ['✅', '🟡', '⬜', '➖'];
const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'fait') {
  const note = rest.length && !/^[A-Z]+-\d+$/.test(rest[rest.length - 1]) ? rest.pop() : '';
  const ids = new Set(rest);
  for (const f of files) {
    const file = path.join(dir, f);
    const lines = fs.readFileSync(file, 'utf8').split('\n').map((line) => {
      const bullet = /^- (✅|🟡|⬜|➖) \*\*([A-Z]+-\d+) /.exec(line);
      if (bullet && ids.has(bullet[2])) {
        ids.delete(bullet[2]);
        return line.replace(/^- (✅|🟡|⬜|➖) /, '- ✅ ') + (note ? ` *(${note})*` : '');
      }
      const cells = line.split('|');
      const id = (cells[1] || '').trim();
      if (!ids.has(id)) return line;
      const i = cells.findIndex((c) => STATES.includes(c.trim()));
      if (i < 0) return line;
      cells[i] = ' ✅ ';
      if (note) cells[cells.length - 2] = ` ${note} `;
      ids.delete(id);
      return cells.join('|');
    });
    fs.writeFileSync(file, lines.join('\n'));
  }
  if (ids.size) { console.error('Introuvables : ' + [...ids].join(', ')); process.exit(1); }
}

for (const f of files) {
  const count = Object.fromEntries(STATES.map((s) => [s, 0]));
  for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
    const bullet = /^- (✅|🟡|⬜|➖) \*\*[A-Z]+-\d+ /.exec(line);
    if (bullet) { count[bullet[1]] += 1; continue; }
    if (!/^\| [A-Z]+-\d+ \|/.test(line)) continue;
    const state = line.split('|').map((c) => c.trim()).find((c) => STATES.includes(c));
    if (state) count[state] += 1;
  }
  console.log(f.padEnd(22) + STATES.map((s) => `${s} ${count[s]}`).join('   '));
}
