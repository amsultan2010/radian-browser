// Sonde des fusibles, utilisée par tests/win-package.js. Ce fichier joue deux rôles :
//  - chargé par Orbe comme scénario (ORBE_SCENARIO), il attend la coque, dit si
//    un port d'inspection est ouvert, puis rend la main ;
//  - exécuté comme un script Node (ELECTRON_RUN_AS_NODE, NODE_OPTIONS=--require),
//    il laisse une trace dans ORBE_PROBE_MARKER : c'est ce qui ne doit plus
//    arriver avec l'application fabriquée.
const fs = require('fs');

const asScenario = !!(module.parent && /main\.js$/.test(module.parent.filename || ''));
if (!asScenario && process.env.ORBE_PROBE_MARKER) {
  try { fs.appendFileSync(process.env.ORBE_PROBE_MARKER, `node ${process.version}\n`); } catch {}
}

module.exports = async function probe({ first: w }) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const t0 = Date.now();
  for (;;) {
    let ok = false;
    try { ok = await w.ui.webContents.executeJavaScript('typeof S === "object" && S !== null && !!S.space'); } catch {}
    if (ok) break;
    if (Date.now() - t0 > 15000) throw new Error('Délai dépassé : coque chargée');
    await sleep(50);
  }
  const port = Number(process.env.ORBE_PROBE_PORT);
  let open = false;
  if (port) {
    open = await new Promise((resolve) => {
      const req = require('http').get({ host: '127.0.0.1', port, path: '/json/version', timeout: 2000 }, (res) => { res.resume(); resolve(true); });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
  }
  console.log(`SONDE application=${require('electron').app.isPackaged ? 'fabriquée' : 'sources'} inspection=${port ? (open ? 'ouverte' : 'fermée') : 'non demandée'}`);
};
