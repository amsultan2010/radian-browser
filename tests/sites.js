// Essai sur de vrais sites (demande Internet) : chargement, titre, icône,
// temps de chargement. Sert à repérer les sites qui refusent Orbe.
//   ORBE_SCENARIO=tests/sites.js node scripts/dev.js --selftest
const fs = require('fs');
const path = require('path');

const SITES = [
  'https://fr.wikipedia.org/wiki/Dakar',
  'https://www.youtube.com/',
  'https://www.google.com/search?q=orbe+navigateur',
  'https://github.com/amadoubaui/orbe',
  'https://www.lemonde.fr/',
  'https://web.whatsapp.com/',
  'https://www.figma.com/',
  'https://accounts.google.com/',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function sites({ first: w, win }) {
  const shots = process.env.ORBE_SHOTS;
  console.log('\nOrbe — essai sur des sites réels\n');
  let failed = 0;
  for (const url of SITES) {
    const t0 = Date.now();
    const tab = w.newTab(url);
    const rt = win.live.get(tab.id);
    let error = '';
    rt.wc.once('did-fail-load', (e, code, desc, u, main) => { if (main && code !== -3) error = `${desc} (${code})`; });
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 20000);
      rt.wc.once('did-stop-loading', () => { clearTimeout(timer); resolve(); });
    });
    const ms = Date.now() - t0;
    await sleep(700);
    const data = w.data.tabs[tab.id];
    const blocked = await rt.wc.executeJavaScript('/navigateur (non pris en charge|obsolète)|browser (is not supported|not supported|is out of date)|unsupported browser/i.test(document.body ? document.body.innerText.slice(0, 4000) : "")').catch(() => false);
    const ok = !error && !!data.title && !blocked;
    if (!ok) failed += 1;
    console.log(`${ok ? '  ✓' : '  ✗'} ${url}\n      ${ms} ms · « ${(data.title || '').slice(0, 60)} » · icône ${data.favicon ? 'oui' : 'non'}${error ? ' · ' + error : ''}${blocked ? ' · NAVIGATEUR REFUSÉ' : ''}`);
    if (shots) {
      const id = w.win.getMediaSourceId().split(':')[1];
      const name = new URL(url).host.replace(/\W+/g, '-');
      try { require('child_process').execFileSync('screencapture', ['-x', '-o', '-l', id, path.join(shots, `site-${name}.png`)]); } catch {}
    }
  }
  console.log(`\n${SITES.length - failed}/${SITES.length} sites chargés correctement\n`);
  if (shots) fs.writeFileSync(path.join(shots, 'sites.txt'), 'ok');
};
