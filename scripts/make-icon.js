// Fabrique assets/icon.png (1024 px) à partir de assets/icon.svg.
// À lancer avec Electron : node scripts/build-mac.js --icon
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const assets = path.join(__dirname, '..', 'assets');

app.dock && app.dock.hide();
app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(assets, 'icon.svg'), 'utf8');
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 300));
  const image = (await win.webContents.capturePage()).resize({ width: 1024, height: 1024, quality: 'best' });
  fs.writeFileSync(process.argv[process.argv.length - 1], image.toPNG());
  app.exit(0);
});
