// Captures d'écran des tests, pour relecture visuelle (ORBE_SHOTS=<dossier>).
// macOS : `screencapture` photographie la vraie fenêtre.
// Ailleurs : la fenêtre est recomposée à partir de ses vues (coque, pages,
// vues flottantes), chacune capturée par Chromium ; s'y ajoute, sous Windows,
// une photo de l'écran entier, où l'on voit les vrais boutons de fenêtre.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { nativeImage } = require('electron');

// Pose `src` (BGRA) sur `dst` en tenant compte de la transparence.
function blit(dst, W, H, src, sw, sh, x0, y0) {
  for (let y = 0; y < sh; y++) {
    const dy = y + y0;
    if (dy < 0 || dy >= H) continue;
    for (let x = 0; x < sw; x++) {
      const dx = x + x0;
      if (dx < 0 || dx >= W) continue;
      const s = (y * sw + x) * 4;
      const a = src[s + 3];
      if (!a) continue;
      const d = (dy * W + dx) * 4;
      if (a === 255) { dst[d] = src[s]; dst[d + 1] = src[s + 1]; dst[d + 2] = src[s + 2]; dst[d + 3] = 255; continue; }
      // Les captures sont en couleurs prémultipliées.
      const k = 1 - a / 255;
      dst[d] = Math.min(255, src[s] + dst[d] * k);
      dst[d + 1] = Math.min(255, src[s + 1] + dst[d + 1] * k);
      dst[d + 2] = Math.min(255, src[s + 2] + dst[d + 2] * k);
      dst[d + 3] = 255;
    }
  }
}

// Recompose la fenêtre : fond, puis chaque vue visible dans l'ordre d'empilement.
async function compose(win, background) {
  const [W, H] = win.getContentSize();
  const out = Buffer.alloc(W * H * 4);
  const m = /^#([0-9a-f]{6})$/i.exec(background || '');
  const [r, g, b] = m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [255, 255, 255];
  for (let i = 0; i < out.length; i += 4) { out[i] = b; out[i + 1] = g; out[i + 2] = r; out[i + 3] = 255; }
  for (const view of win.contentView.children) {
    const wc = view.webContents;
    if (!wc || wc.isDestroyed() || (view.getVisible && !view.getVisible())) continue;
    const rect = view.getBounds();
    if (!rect.width || !rect.height) continue;
    let img;
    // Une vue qui n'a encore rien peint ne répond jamais : on borne l'attente.
    try { img = await Promise.race([wc.capturePage(), new Promise((res) => setTimeout(() => res(null), 2000))]); } catch { continue; }
    if (!img || img.isEmpty()) continue;
    img = img.resize({ width: rect.width, height: rect.height });
    const size = img.getSize();
    blit(out, W, H, img.toBitmap(), size.width, size.height, rect.x, rect.y);
  }
  return nativeImage.createFromBitmap(out, { width: W, height: H }).toPNG();
}

// Photo de l'écran entier (Windows), par PowerShell et System.Drawing.
function screenWindows(file) {
  const ps = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Left,$b.Top,0,0,$bmp.Size); $bmp.Save('${file.replace(/'/g, "''")}'); $g.Dispose(); $bmp.Dispose()`;
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', timeout: 20000 });
}

// Enregistre <dossier>/<nom>.png (et <nom>-ecran.png sous Windows).
async function shoot(win, dir, name, background) {
  const file = path.join(dir, name + '.png');
  // Essais discrets (tests/discret.js) : la fenêtre est transparente à l'écran,
  // on la recompose à partir de ses vues.
  if (process.platform === 'darwin' && process.env.ORBE_DISCRET !== '1') {
    const id = win.getMediaSourceId().split(':')[1];
    try { execFileSync('screencapture', ['-x', '-o', '-l', id, file]); } catch {}
    return;
  }
  try { fs.writeFileSync(file, await compose(win, background)); } catch (err) { console.log('  (capture impossible : ' + err.message + ')'); }
  if (process.platform === 'win32') { try { screenWindows(path.join(dir, name + '-ecran.png')); } catch {} }
}

module.exports = { shoot, compose };
