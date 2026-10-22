// Tests du bloqueur de publicités : logique pure, sans Electron.
//   node tests/adblock.test.js
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const adblock = require('../src/main/adblock');

const { shouldBlock, hostOf, registrableDomain } = adblock;
const PAGE = 'https://www.journal.fr/article/1';
const from = (firstPartyUrl, resourceType = 'script') => ({ firstPartyUrl, resourceType });

beforeEach(() => {
  adblock.configure({ enabled: true, allowlist: [], onChange: null, onCount: null });
  adblock.setDomains(['pub.test', 'traceur.co.uk', 'stats.journal.fr', 'mesure.exemple.com', 'regie.github.io']);
});

test('hostOf : extrait l\'hôte des URL http(s) et ws(s) seulement', () => {
  assert.equal(hostOf('https://Ads.Pub.TEST/x.js?a=1'), 'ads.pub.test');
  assert.equal(hostOf('http://pub.test:8080/x'), 'pub.test');
  assert.equal(hostOf('https://moi:secret@pub.test/x'), 'pub.test');
  assert.equal(hostOf('https://pub.test./x'), 'pub.test');
  assert.equal(hostOf('https://pub.test?x=a@b:c'), 'pub.test');
  assert.equal(hostOf('wss://pub.test/socket'), 'pub.test');
  assert.equal(hostOf('HTTPS://PUB.TEST/'), 'pub.test');
  assert.equal(hostOf('http://[::1]:3000/x'), '[::1]');
  assert.equal(hostOf('http://127.0.0.1:3000/x'), '127.0.0.1');
  for (const url of ['orbe://app/index.html', 'file:///tmp/a.html', 'devtools://devtools/x', 'chrome-extension://abc/x.js', 'data:text/html,<p>', 'blob:https://pub.test/1', 'about:blank', '', null, undefined]) {
    assert.equal(hostOf(url), '', String(url));
  }
});

test('registrableDomain : eTLD+1 approché', () => {
  assert.equal(registrableDomain('a.b.exemple.com'), 'exemple.com');
  assert.equal(registrableDomain('exemple.com'), 'exemple.com');
  assert.equal(registrableDomain('www.bbc.co.uk'), 'bbc.co.uk');
  assert.equal(registrableDomain('loja.uol.com.br'), 'uol.com.br');
  assert.equal(registrableDomain('news.yahoo.co.jp'), 'yahoo.co.jp');
  assert.equal(registrableDomain('m.abc.net.au'), 'abc.net.au');
  assert.equal(registrableDomain('www.service-public.gouv.fr'), 'service-public.gouv.fr');
  assert.equal(registrableDomain('moi.github.io'), 'moi.github.io');
  assert.equal(registrableDomain('co.uk'), 'co.uk');
  assert.equal(registrableDomain('192.168.1.10'), '192.168.1.10');
  assert.equal(registrableDomain('[::1]'), '[::1]');
  assert.equal(registrableDomain('localhost'), 'localhost');
  assert.equal(registrableDomain(''), '');
});

test('bloque un domaine listé et ses sous-domaines, vus depuis un autre site', () => {
  assert.equal(shouldBlock('https://pub.test/ad.js', from(PAGE)), true);
  assert.equal(shouldBlock('https://cdn.eu.pub.test/ad.js', from(PAGE, 'image')), true);
  assert.equal(shouldBlock('wss://live.pub.test/socket', from(PAGE, 'webSocket')), true);
  assert.equal(shouldBlock('https://x.traceur.co.uk/p.gif', from(PAGE, 'ping')), true);
  assert.equal(shouldBlock('https://pub.test/cadre.html', from(PAGE, 'subFrame')), true);
});

test('laisse passer ce qui n\'est pas listé', () => {
  assert.equal(shouldBlock('https://cdn.exemple.com/app.js', from(PAGE)), false);
  assert.equal(shouldBlock('https://exemple.com/app.js', from(PAGE)), false); // seul le sous-domaine `mesure.` est listé
  assert.equal(shouldBlock('https://pas-pub.test/x.js', from(PAGE)), false); // pas de correspondance partielle
  assert.equal(shouldBlock('https://test/x.js', from(PAGE)), false);
  assert.equal(shouldBlock('https://pub.test.exemple.org/x.js', from(PAGE)), false);
});

test('ne bloque jamais la navigation principale', () => {
  assert.equal(shouldBlock('https://pub.test/', from('', 'mainFrame')), false);
  assert.equal(shouldBlock('https://pub.test/', from(PAGE, 'mainFrame')), false);
});

test('ne bloque jamais les requêtes du site vers lui-même', () => {
  assert.equal(shouldBlock('https://stats.journal.fr/hit', from(PAGE, 'xhr')), false);
  assert.equal(shouldBlock('https://stats.journal.fr/hit', from('https://abonnes.journal.fr/')), false);
  assert.equal(shouldBlock('https://stats.journal.fr/hit', from('https://autre.fr/')), true);
  assert.equal(shouldBlock('https://ads.pub.test/a.js', from('https://pub.test/')), false);
  assert.equal(shouldBlock('https://x.traceur.co.uk/p.gif', from('https://www.traceur.co.uk/')), false);
});

test('deux sites sous un même suffixe public restent des tiers', () => {
  assert.equal(shouldBlock('https://x.traceur.co.uk/p.gif', from('https://www.bbc.co.uk/')), true);
  assert.equal(shouldBlock('https://regie.github.io/a.js', from('https://moi.github.io/')), true);
  assert.equal(shouldBlock('https://regie.github.io/a.js', from('https://regie.github.io/page')), false);
});

test('ignore les schémas internes et locaux', () => {
  for (const url of ['orbe://pub.test/x', 'file:///pub.test/x', 'devtools://pub.test/x', 'chrome-extension://pub.test/x.js', 'data:text/plain,pub.test', 'blob:https://pub.test/42']) {
    assert.equal(shouldBlock(url, from(PAGE)), false, url);
  }
  // Page interne ou origine inconnue : aucune exception « même site » possible.
  assert.equal(shouldBlock('https://pub.test/ad.js', from('orbe://app/nouvel-onglet.html')), true);
  assert.equal(shouldBlock('https://pub.test/ad.js'), true);
});

test('liste d\'exceptions : rien n\'est bloqué sur un site autorisé', () => {
  const changes = [];
  adblock.configure({ onChange: (s) => changes.push(s) });
  assert.equal(adblock.isSiteAllowed('www.journal.fr'), false);
  adblock.allowSite('www.journal.fr', true);
  adblock.allowSite('journal.fr', true); // déjà autorisé : pas de second signal
  assert.equal(adblock.isSiteAllowed('journal.fr'), true);
  assert.equal(adblock.isSiteAllowed('https://abonnes.journal.fr/compte'), true);
  assert.equal(shouldBlock('https://pub.test/ad.js', from(PAGE)), false);
  assert.equal(shouldBlock('https://pub.test/ad.js', from('https://abonnes.journal.fr/')), false);
  assert.equal(shouldBlock('https://pub.test/ad.js', from('https://autre.fr/')), true);
  adblock.allowSite('journal.fr', false);
  assert.equal(shouldBlock('https://pub.test/ad.js', from(PAGE)), true);
  assert.deepEqual(changes, [{ enabled: true, allowlist: ['journal.fr'] }, { enabled: true, allowlist: [] }]);
});

test('configure : reprend l\'état enregistré sans le signaler en retour', () => {
  const changes = [];
  adblock.configure({ enabled: false, allowlist: ['www.bbc.co.uk', 'https://exemple.com/page', ''], onChange: (s) => changes.push(s) });
  assert.equal(adblock.isEnabled(), false);
  assert.equal(adblock.isSiteAllowed('news.bbc.co.uk'), true);
  assert.equal(adblock.isSiteAllowed('exemple.com'), true);
  assert.deepEqual(changes, []);
  adblock.setEnabled(true);
  adblock.setEnabled(true);
  assert.deepEqual(changes, [{ enabled: true, allowlist: ['bbc.co.uk', 'exemple.com'] }]);
});

// Fausse session Electron : on appelle l'écouteur comme le ferait Chromium.
function fakeSession() {
  const ses = { calls: 0, listener: null };
  ses.webRequest = { onBeforeRequest: (filter, fn) => { ses.calls += 1; ses.listener = fn === undefined ? filter : fn; } };
  ses.request = (details) => {
    if (!ses.listener) return false;
    let out;
    ses.listener({ resourceType: 'script', referrer: '', ...details }, (r) => { out = r; });
    return !!out.cancel;
  };
  return ses;
}

function fakeTab(id, url) {
  const handlers = {};
  return {
    id, url, handlers,
    isDestroyed: () => false,
    getURL() { return this.url; },
    on(name, fn) { handlers[name] = fn; },
    once(name, fn) { handlers[name] = fn; },
  };
}

test('attach : un seul écouteur par session, retiré quand le bloqueur est coupé', () => {
  const ses = fakeSession();
  adblock.attach(ses);
  adblock.attach(ses);
  assert.equal(ses.calls, 1);
  assert.equal(typeof ses.listener, 'function');
  const tab = fakeTab(900, PAGE);
  const req = { url: 'https://pub.test/ad.js', webContentsId: 900, webContents: tab };
  assert.equal(ses.request(req), true);
  adblock.setEnabled(false);
  assert.equal(ses.listener, null);
  adblock.setEnabled(true);
  assert.equal(ses.request(req), true);
  adblock.resetTab(900);
});

test('écouteur : page de l\'onglet, iframes, service workers et compteurs', () => {
  const ses = fakeSession();
  adblock.attach(ses);
  const tab = fakeTab(901, PAGE);
  const base = { webContentsId: 901, webContents: tab };
  const before = adblock.stats().blockedTotal;

  assert.equal(ses.request({ ...base, url: 'https://pub.test/', resourceType: 'mainFrame' }), false);
  assert.equal(ses.request({ ...base, url: 'https://stats.journal.fr/hit' }), false);
  assert.equal(ses.request({ ...base, url: 'https://cdn.exemple.com/app.js' }), false);
  assert.equal(ses.request({ ...base, url: 'https://pub.test/ad.js' }), true);
  // Depuis une iframe tierce : c'est la page du haut qui compte, pas l'iframe.
  const iframe = { url: 'https://pub.test/cadre.html', top: { url: PAGE } };
  assert.equal(ses.request({ ...base, frame: iframe, url: 'https://ads.pub.test/ad.js' }), true);
  assert.equal(ses.request({ ...base, frame: iframe, url: 'https://stats.journal.fr/hit' }), false);
  // Cadre détruit entre-temps : repli sur l'URL de l'onglet.
  const dead = { get top() { throw new Error('Render frame was disposed'); } };
  assert.equal(ses.request({ ...base, frame: dead, url: 'https://stats.journal.fr/hit' }), false);
  // Service worker : ni cadre ni onglet, seulement l'origine qui l'a installé.
  assert.equal(ses.request({ url: 'https://stats.journal.fr/hit', initiatorOrigin: 'https://www.journal.fr' }), false);
  assert.equal(ses.request({ url: 'https://pub.test/ad.js', initiatorOrigin: 'https://www.journal.fr' }), true);
  assert.equal(ses.request({ url: 'https://stats.journal.fr/hit', referrer: PAGE }), false);

  let s = adblock.stats();
  assert.equal(s.blockedTotal - before, 3);
  assert.equal(s.blockedByTab.get(901), 2);
  s.blockedByTab.set(901, 99); // une copie : sans effet sur le module
  assert.equal(adblock.stats().blockedByTab.get(901), 2);

  // Site autorisé : plus rien n'est bloqué pour cet onglet.
  adblock.allowSite('journal.fr', true);
  assert.equal(ses.request({ ...base, url: 'https://pub.test/ad.js' }), false);
  adblock.allowSite('journal.fr', false);

  // Le compteur repart de zéro quand l'onglet change de page.
  assert.equal(typeof tab.handlers['did-navigate'], 'function');
  tab.handlers['did-navigate']();
  assert.equal(adblock.stats().blockedByTab.has(901), false);
  tab.url = 'https://autre.fr/';
  assert.equal(ses.request({ ...base, url: 'https://stats.journal.fr/hit' }), true);
  assert.equal(adblock.stats().blockedByTab.get(901), 1);
  adblock.resetTab(901);
  assert.equal(adblock.stats().blockedByTab.has(901), false);
});

test('onCount : signale le compteur d\'un onglet, de façon regroupée', async () => {
  const seen = [];
  adblock.configure({ onCount: (id, n) => seen.push([id, n]) });
  const ses = fakeSession();
  adblock.attach(ses);
  const base = { webContentsId: 902, webContents: fakeTab(902, PAGE) };
  for (let i = 0; i < 5; i++) ses.request({ ...base, url: `https://pub.test/ad${i}.js` });
  assert.deepEqual(seen, []);
  await new Promise((r) => setTimeout(r, 400));
  assert.deepEqual(seen, [[902, 5]]);
  adblock.resetTab(902);
  await new Promise((r) => setTimeout(r, 400));
  assert.deepEqual(seen, [[902, 5], [902, 0]]);
});

test('la liste fournie se charge et couvre les grandes régies', async () => {
  adblock.configure({ listPath: adblock.info().listPath + '.absent' }); // force un rechargement
  adblock.configure({ listPath: require('path').join(__dirname, '../assets/blocklist.txt') });
  assert.equal(adblock.info().loaded, false);
  await adblock.load();
  const info = adblock.info();
  assert.equal(info.loaded, true);
  assert.ok(info.domains > 20000, `${info.domains} domaines`);
  for (const url of ['https://securepubads.g.doubleclick.net/tag/js/gpt.js', 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', 'https://www.google-analytics.com/analytics.js', 'https://static.criteo.net/js/ld/publishertag.js', 'https://cdn.taboola.com/libtrc/loader.js']) {
    assert.equal(shouldBlock(url, from(PAGE)), true, url);
  }
  for (const url of ['https://www.google.com/search?q=orbe', 'https://fonts.googleapis.com/css2', 'https://fr.wikipedia.org/wiki/Orbe', 'https://cdn.jsdelivr.net/npm/x', 'https://www.youtube.com/embed/x']) {
    assert.equal(shouldBlock(url, from(PAGE)), false, url);
  }
  assert.equal(shouldBlock('https://ad.doubleclick.net/', from('', 'mainFrame')), false);
  assert.equal(shouldBlock('https://ad.doubleclick.net/x.js', from('https://www.doubleclick.net/')), false);
});
