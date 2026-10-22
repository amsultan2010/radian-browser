// Essai de fumée de l'application fabriquée : elle démarre, la coque se charge,
// une page interne s'affiche. Lancé par l'intégration continue :
//   ORBE_SCENARIO=tests/smoke.js ORBE_USER_DATA=<dossier temporaire> Orbe.exe --selftest --orbe-test
// (l'application fabriquée refuse le mode test sans ces deux garde-fous)
// N'utilise que ce que lui passe l'application (aucun module du dépôt).
module.exports = async function smoke({ first: w, win }) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, label) => {
    const t0 = Date.now();
    for (;;) {
      let v = false;
      try { v = await fn(); } catch {}
      if (v) return v;
      if (Date.now() - t0 > 15000) throw new Error('Délai dépassé : ' + label);
      await sleep(50);
    }
  };
  await until(() => w.ui.webContents.executeJavaScript('typeof S === "object" && S !== null && !!S.space'), 'coque chargée');
  const tab = w.openInternal('shortcuts.html');
  const n = await until(() => win.live.get(tab.id).wc.executeJavaScript('document.querySelectorAll("kbd").length'), 'page des raccourcis');
  const first = await win.live.get(tab.id).wc.executeJavaScript('document.querySelector("kbd").textContent');
  console.log(`Orbe ${require('electron').app.getVersion()} démarre (${process.platform}) : ${n} raccourcis affichés, le premier : ${first}`);
  if (process.env.ORBE_SHOTS) require('fs').writeFileSync(require('path').join(process.env.ORBE_SHOTS, 'raccourcis.png'), (await win.live.get(tab.id).wc.capturePage()).toPNG());
};
