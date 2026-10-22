// Reconnaissance des champs de connexion sur de vraies pages (demande Internet).
// Aucun identifiant n'est saisi ni envoyé : chaque champ visible reçoit le
// clavier, et on relève ce que le gestionnaire de mots de passe en a compris.
//   ORBE_SCENARIO=tests/passwords-sites.js node scripts/dev.js --selftest
const SITES = [
  ['https://github.com/login', { username: 1, password: 1 }],
  ['https://login.wordpress.org/', { username: 1, password: 1 }],
  ['https://fr.wikipedia.org/w/index.php?title=Sp%C3%A9cial:Connexion', { username: 1, password: 1 }],
  // Connexions en deux étapes : l'identifiant seul d'abord.
  ['https://accounts.google.com/', { username: 1 }],
  ['https://login.microsoftonline.com/', { username: 1 }],
  ['https://login.live.com/', { username: 1 }],
  ['https://login.yahoo.com/', { username: 1 }],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Une page qui navigue ou se fige ne doit pas bloquer l'essai.
const soon = (p, fallback) => Promise.race([p.catch(() => fallback), sleep(5000).then(() => fallback)]);

module.exports = async function sites({ first: w, win, passwords }) {
  console.log('\nOrbe — champs de connexion sur des sites réels\n');
  const states = passwords.internals.states;
  let failed = 0;
  for (const [url, expected] of SITES) {
    const tab = w.newTab(url);
    const rt = win.live.get(tab.id);
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 25000);
      rt.wc.once('did-stop-loading', () => { clearTimeout(timer); resolve(); });
    });
    await sleep(5000); // formulaires montés après le chargement
    const wc = rt.wc;
    try { wc.debugger.attach('1.3'); await wc.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch {}
    const fields = await soon(wc.executeJavaScript(`[...document.querySelectorAll('input')].map((el, i) => { const r = el.getBoundingClientRect(); return { i, type: el.type, name: el.name || el.id, ac: el.autocomplete, shown: r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden' }; }).filter((f) => f.shown && ['text', 'email', 'tel', 'password'].includes(f.type))`), []);
    const seen = [];
    for (const f of fields) {
      const st0 = states.get(wc.id);
      if (st0) st0.focus = null;
      await soon(wc.executeJavaScript(`(() => { const el = document.querySelectorAll('input')[${f.i}]; if (document.activeElement) document.activeElement.blur(); el.focus(); })()`), null);
      await sleep(350);
      const st = states.get(wc.id);
      const focus = st && st.focus;
      seen.push({ ...f, kind: focus ? focus.field : '—', withPassword: !!(focus && focus.wantsPassword) });
    }
    const got = { username: seen.filter((s) => s.kind === 'username').length, password: seen.filter((s) => s.kind === 'password').length };
    const ok = Object.entries(expected).every(([k, n]) => got[k] >= n);
    if (!ok) failed += 1;
    console.log(`${ok ? '  ✓' : '  ✗'} ${url}\n      → ${wc.getURL().slice(0, 90)}`);
    for (const s of seen) console.log(`      ${s.type.padEnd(8)} ${String(s.name).slice(0, 28).padEnd(28)} autocomplete=${String(s.ac || '—').padEnd(18)} reconnu : ${s.kind}${s.kind === 'username' ? (s.withPassword ? ' (+ mot de passe)' : ' (seul)') : ''}`);
    if (!seen.length) console.log('      aucun champ visible');
    w.close(tab.id, { silent: true });
  }
  console.log(`\n${SITES.length - failed}/${SITES.length} pages reconnues comme attendu\n`);
};
