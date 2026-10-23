// App icon chosen in Settings > Appearance, like Arc's Icon pane: the Dock icon changes at once
// and the choice (setting `appIcon`) is applied again at every launch. Artwork: assets/icons.
// shortcut: only the Dock icon changes; Finder, and the Dock tile while Radian is not running, keep the
// bundle's original icon, because rewriting Radian.app's icon would break its code signature. Upgrade if
// macOS offers a signed way to swap a bundle's icon (Arc's own variants have the same limit).
const fs = require('fs');
const path = require('path');

const NAMES = ['original', 'midnight', 'ink', 'neon', 'sorbet', 'candy', 'glass', 'hologram', 'metal'];
const DIR = path.join(__dirname, '..', '..', 'assets', 'icons');
let shown = '';
let thumbs = null;

function apply(name) {
  if (!NAMES.includes(name)) name = 'original';
  if (process.platform !== 'darwin' || name === shown) return;
  const { app, nativeImage } = require('electron');
  const img = nativeImage.createFromPath(path.join(DIR, name + '.png'));
  if (!app.dock || img.isEmpty()) return; // artwork missing from the build: keep the bundle's icon
  app.dock.setIcon(img);
  shown = name;
}

// Thumbnails for the settings grid, as data: URLs (orbe://app only serves src/renderer).
// None outside macOS (the page then hides the section); a missing file drops its variant instead of breaking "settings:get".
function list() {
  if (process.platform !== 'darwin') return [];
  if (!thumbs) thumbs = NAMES.map((name) => path.join(DIR, name + '-128.png')).filter((f) => fs.existsSync(f))
    .map((f) => ({ name: path.basename(f, '-128.png'), src: 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') }));
  return thumbs;
}

module.exports = { NAMES, apply, list };
