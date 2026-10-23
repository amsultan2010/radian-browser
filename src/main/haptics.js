// Trackpad haptics, as Arc plays them while reordering tabs, on drops, on page swipes
// and on the theme dial. Electron has no haptics API, so a small helper (native/haptics.swift) plays
// them: started on first use, one line on its stdin per tap.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { store } = require('./store');

let child = null;
let off = process.platform !== 'darwin';

// Arc's "Haptic feedback when reordering tabs" switch turns every tap off.
function perform(kind) {
  if (off || store.state.settings.haptics === false) return;
  if (!child) {
    // Packaged: next to the main executable (scripts/build-mac.js). From source: built by scripts/dev.js.
    const bin = app.isPackaged ? path.join(path.dirname(process.execPath), 'radian-haptics') : process.env.RADIAN_HAPTICS;
    if (!bin || !fs.existsSync(bin)) { off = true; return; }
    child = spawn(bin, [], { stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('error', () => { off = true; child = null; });
    child.on('exit', () => { child = null; });
    child.stdin.on('error', () => {});
  }
  child.stdin.write(kind === 'level' ? 'level\n' : 'align\n');
}

module.exports = { perform };
