// Médias : lecteurs miniatures de la barre latérale (plusieurs à la fois, titre,
// artiste et pochette annoncés par la page, précédent / suivant, ±15 s, recherche,
// croix), données de la page tenues pour hostiles.
// Appelé par tests/selftest.js, ou seul :
//   ORBE_SCENARIO=tests/medias.js node scripts/dev.js --selftest
// Le son des pages d'essai est une note à −58 dB : inaudible, mais comptée
// comme un son par le moteur.
const http = require('http');

const outils = require('./outils');

const { sleep } = outils;
const until = (fn, label, timeout = 10000) => outils.until(fn, label, timeout);

// Fichier WAV d'une minute, mono 8 kHz 16 bits, note de 220 Hz à très faible niveau.
function wav(seconds = 60) {
  const rate = 8000;
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(40 * Math.sin((2 * Math.PI * 220 * i) / rate)), 44 + i * 2);
  return buf;
}
function png(side, color = [200, 80, 40, 255]) {
  const { nativeImage } = require('electron');
  const raw = Buffer.alloc(side * side * 4);
  for (let i = 0; i < side * side; i++) raw.set(color, i * 4);
  return nativeImage.createFromBitmap(raw, { width: side, height: side }).toPNG();
}

// PNG valide d'un bit par point, tout noir, aux dimensions voulues : quelques kilo-octets
// sur le fil, des dizaines ou des centaines de méga-octets une fois décodé.
function pngBits(width, height) {
  const zlib = require('zlib');
  const chunk = (type, data) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 1; // 1 bit, niveaux de gris
  const rows = zlib.deflateSync(Buffer.alloc(height * (1 + Math.ceil(width / 8))), { level: 9 });
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', rows), chunk('IEND', Buffer.alloc(0))]);
}

const HOSTILE = '<img src=x onerror="window.pwned=1">Un titre de morceau vraiment très long, bien plus large que la barre latérale';

function serve(cover) {
  const sound = wav();
  if (!cover) cover = png(300);
  const hits = {};
  const page = (title, body, head = '') => `<!doctype html><meta charset="utf-8"><title>${title}</title>${head}<body style="font:16px sans-serif;padding:40px">${body}</body>`;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    hits[url.pathname] = (hits[url.pathname] || 0) + 1;
    if (url.pathname === '/son.wav') { res.setHeader('content-type', 'audio/wav'); res.setHeader('accept-ranges', 'bytes'); res.setHeader('content-length', sound.length); return res.end(sound); }
    if (url.pathname === '/pochette.png') { res.setHeader('content-type', 'image/png'); return res.end(cover); }
    if (server.extra && server.extra[url.pathname]) { res.setHeader('content-type', 'image/png'); return res.end(server.extra[url.pathname]); }
    if (url.pathname === '/interne.png' || url.pathname === '/rebond.png') { res.setHeader('content-type', 'image/png'); return res.end(cover); }
    // Redirections : vers la machine elle-même, vers un autre hôte « public », sans fin.
    if (url.pathname === '/redir') { res.statusCode = 302; res.setHeader('location', `http://127.0.0.1:${server.address().port}/interne.png`); return res.end(); }
    if (url.pathname === '/redir-ok') { res.statusCode = 302; res.setHeader('location', 'http://images.exemple.test/pochette.png'); return res.end(); }
    if (url.pathname === '/boucle') { res.statusCode = 302; res.setHeader('location', 'http://img.exemple.test/boucle'); return res.end(); }
    if (url.pathname === '/faux.png') { res.setHeader('content-type', 'text/html'); return res.end('<script>1</script>'); }
    if (url.pathname === '/menteur.png') { res.setHeader('content-type', 'image/png'); return res.end('pas une image'); }
    if (url.pathname === '/enorme.png') { res.setHeader('content-type', 'image/png'); return res.end(Buffer.alloc(3 * 1024 * 1024, 1)); }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    const m = /^\/piste(\d)$/.exec(url.pathname);
    if (m) {
      // Les gestionnaires sont déclarés dans l'en-tête, avant la fin du chargement.
      return res.end(page('Piste ' + m[1], `<audio id="a" src="/son.wav" loop></audio><h1>Piste ${m[1]}</h1>`, `<script>
        window.calls = [];
        navigator.mediaSession.setActionHandler('previoustrack', () => calls.push('prev'));
        navigator.mediaSession.setActionHandler('nexttrack', () => calls.push('next'));
        window.start = async (title) => {
          navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'Artiste ${m[1]}', artwork: [{ src: '/pochette.png', sizes: '300x300', type: 'image/png' }] });
          await document.getElementById('a').play();
          return true;
        };
        window.setArt = (n, title) => { navigator.mediaSession.metadata = new MediaMetadata({ title: title || 'Titre', artist: 'Artiste ${m[1]}', artwork: [{ src: '/pochette.png?n=' + n, sizes: '300x300', type: 'image/png' }] }); return true; };
      </script>`));
    }
    if (url.pathname === '/calme') return res.end(page('Calme', '<h1>Calme</h1>'));
    res.statusCode = 404;
    return res.end(page('404', 'introuvable'));
  });
  server.hits = hits;
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

module.exports = async function mediasTests(ctx) {
  const { nativeImage } = require('electron');
  const { first: w, store, win } = ctx;
  let failed = 0;
  const check = ctx.check || ((name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`); });
  const mediaLib = require('../src/main/media');
  const { media } = win;
  const d = w.data;
  const ui = (js) => w.ui.webContents.executeJavaScript(js);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const wcOf = (id) => win.live.get(id).wc;
  const js = (id, code) => wcOf(id).executeJavaScript(code, true);
  const load = async (pathname, title) => {
    const tab = w.newTab(base + pathname);
    await until(() => d.tabs[tab.id] && d.tabs[tab.id].title === title && !wcOf(tab.id).isLoading(), 'page ' + pathname);
    return tab.id;
  };
  const players = () => media.payload(w, store.state.settings);
  await outils.profilPret(w);
  await until(() => ui('typeof S === "object" && S !== null'), 'coque chargée');
  const mediaControls0 = store.state.settings.mediaControls;
  store.state.settings.mediaControls = true;

  // --- Données de la page : tout est borné et typé -------------------------------------
  const c = mediaLib.clean({ has: 1, paused: 'non', t: 1e12, d: Infinity, title: 'A\u0000B‮' + 'x'.repeat(999), artist: { toString: () => 'x' }, art: 'javascript:alert(1)', acts: ['nexttrack', 7, {}, 'previoustrack'] });
  check('lecteur : réponse hostile de la page remise au propre (types, longueurs, caractères de contrôle, adresse de pochette)',
    c.has === false && c.paused === true && c.duration === 0 && c.position === 360000 && c.track.length === mediaLib.LIMITS.text && !/[\u0000‮]/.test(c.track) && c.artist === '' && c.artSrc === '' && c.next && c.prev, JSON.stringify(c).slice(0, 200));
  check('lecteur : réponse absente ou d’un autre type → lecteur vide, sans erreur', [null, undefined, 'x', 42, []].every((v) => { const r = mediaLib.clean(v); return r.has === false && r.track === '' && r.duration === 0 && !r.prev && !r.next; }));
  const kinds = ['javascript:alert(1)', 'file:///etc/passwd', 'blob:http://x/1', 'orbe://settings', 'data:text/html;base64,AAAA', 'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,' + 'A'.repeat(mediaLib.LIMITS.dataUrl), 'http://' + 'a'.repeat(3000), '', 7].map(mediaLib.artworkKind);
  check('pochette : seules http(s) et data:image (png, jpeg, webp, gif) bornées sont acceptées', kinds.every((k) => k === '') && mediaLib.artworkKind('https://exemple.test/a.png') === 'http' && mediaLib.artworkKind('data:image/png;base64,AAAA') === 'data', kinds.join('|'));
  const artLib = mediaLib.art;
  const page = base + '/';
  const art = await mediaLib.loadArtwork(w.session, base + '/pochette.png', page);
  const artSize = art ? nativeImage.createFromDataURL(art).getSize() : {};
  check('pochette : téléchargée dans la session de la page, recodée en PNG de 192 px au plus', art.startsWith('data:image/png;base64,') && artSize.width === 192 && artSize.height === 192, JSON.stringify(artSize));
  const refused = [await mediaLib.loadArtwork(w.session, base + '/faux.png', page), await mediaLib.loadArtwork(w.session, base + '/menteur.png', page), await mediaLib.loadArtwork(w.session, base + '/enorme.png', page), await mediaLib.loadArtwork(w.session, 'file:///etc/hosts', page), await mediaLib.loadArtwork(w.session, 'data:image/png;base64,' + Buffer.from('pas une image').toString('base64'), page), await mediaLib.loadArtwork(w.session, base + '/pochette.png', 'file:///tmp/page.html'), await mediaLib.loadArtwork(w.session, base.replace('http://', 'http://moi:secret@') + '/pochette.png', page)];
  check('pochette refusée : pas une image, fausse image, trop lourde (plus de 2 Mo), autre protocole, page qui n’est pas du web, identifiants dans l’adresse', refused.every((r) => r === ''), refused.map((r) => r.length).join());
  const dataArt = await mediaLib.loadArtwork(w.session, 'data:image/png;base64,' + png(64).toString('base64'), page);
  check('pochette en data:image : redessinée par Orbe', dataArt.startsWith('data:image/png;base64,') && nativeImage.createFromDataURL(dataArt).getSize().width === 64);

  // --- Image minuscule sur le fil, immense une fois décodée : jamais décodée -----------
  const decoded = [];
  const realDecode = artLib.hooks.decode;
  artLib.hooks.decode = (buf) => { decoded.push(buf.length); return realDecode(buf); };
  const geante = pngBits(8192, 8192);
  const colossale = pngBits(30000, 30000);
  // GIF dont l'écran logique est petit mais la première image immense ; BMP (format non admis).
  const gif = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.from([10, 0, 10, 0, 0, 0, 0, 0x21, 0xf9, 4, 0, 0, 0, 0, 0, 0x2c, 0, 0, 0, 0, 0x30, 0x75, 0x30, 0x75, 0, 2, 2, 0x4c, 1, 0, 0x3b])]);
  const bmp = Buffer.alloc(64); bmp.write('BM', 0, 'latin1'); bmp.writeInt32LE(16, 18); bmp.writeInt32LE(16, 22);
  server.extra = { '/geante.png': geante, '/colossale.png': colossale, '/large.png': pngBits(2049, 8), '/dense.png': pngBits(2048, 2000), '/limite.png': pngBits(2048, 1900), '/ecran.gif': gif, '/image.bmp': bmp };
  check('images d’essai : PNG de 8192 × 8192 et de 30000 × 30000 points en quelques kilo-octets', geante.length < 64 * 1024 && colossale.length < 400 * 1024 && artLib.header(geante).width === 8192 && artLib.header(colossale).height === 30000, [geante.length, colossale.length].join());
  const huge = [];
  for (const name of ['geante.png', 'colossale.png', 'large.png', 'dense.png', 'ecran.gif', 'image.bmp']) huge.push(await mediaLib.loadArtwork(w.session, base + '/' + name, page));
  huge.push(await mediaLib.loadArtwork(w.session, 'data:image/png;base64,' + geante.toString('base64'), page));
  huge.push(await mediaLib.loadArtwork(w.session, 'data:image/png;base64,' + pngBits(30000, 2).toString('base64'), page));
  check('pochette aux dimensions démesurées (8192², 30000², plus de 2048 px de côté, plus de 4 millions de points, GIF à l’image plus grande que son écran) ou d’un autre format : refusée d’après son en-tête, sans jamais être décodée',
    huge.every((r) => r === '') && decoded.length === 0 && server.hits['/geante.png'] === 1 && server.hits['/colossale.png'] === 1, JSON.stringify({ rendu: huge.map((r) => r.length), decodages: decoded }));
  const limite = await mediaLib.loadArtwork(w.session, base + '/limite.png', page);
  check('pochette à la limite (2048 × 1900) : décodée une fois, rendue en 192 px', decoded.length === 1 && limite.startsWith('data:image/png;base64,') && nativeImage.createFromDataURL(limite).getSize().width === 192, String(decoded.length));
  artLib.hooks.decode = realDecode;
  server.extra = null;

  // --- Règles de réseau refaites pour la pochette ---------------------------------------
  const L = artLib.localAddress;
  const locals = ['127.0.0.1', '127.8.9.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.33', '169.254.169.254', '100.103.131.21', '0.0.0.0', '224.0.0.1', '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:c0a8:0101', '64:ff9b::7f00:1', 'ff02::1', 'pas une adresse'];
  const publics = ['93.184.216.34', '8.8.8.8', '172.32.0.1', '172.15.0.1', '100.128.0.1', '2606:4700:10::6814:179a', '::ffff:8.8.8.8'];
  check('adresses locales reconnues : boucle locale, réseaux privés, lien local, CGNAT, IPv6 locales uniques et de lien, IPv4 logée dans une IPv6', locals.every((a) => L(a) === true) && publics.every((a) => L(a) === false), locals.filter((a) => !L(a)).concat(publics.filter(L)).join());
  check('noms locaux : localhost, .local, nom sans point ; hôte résolu vers une adresse privée parmi d’autres',
    artLib.hostLocal('localhost') === true && artLib.hostLocal('imprimante.local') === true && artLib.hostLocal('routeur') === true && artLib.hostLocal('[::1]') === true && artLib.hostLocal('192.168.0.1') === true
    && artLib.hostLocal('exemple.test', ['93.184.216.34']) === false && artLib.hostLocal('exemple.test', ['93.184.216.34', '10.0.0.5']) === true && artLib.hostLocal('exemple.test', []) === null && artLib.hostLocal('8.8.8.8') === false);
  const R = artLib.refusal;
  check('règle : pochette en http refusée pour une page en https ; hôte local refusé pour une page publique, permis pour une page locale ; hôte inconnu refusé',
    R('https://site.test/', 'http://img.test/a.png', false, false) === 'contenu mixte' && R('https://site.test/', 'https://img.test/a.png', false, false) === '' && R('http://site.test/', 'http://img.test/a.png', false, false) === ''
    && R('https://site.test/', 'https://192.168.1.1/a.png', false, true) === 'réseau local' && R('http://site.test/', 'http://127.0.0.1/a.png', null, true) === 'réseau local' && R('http://127.0.0.1:3000/', 'http://192.168.1.1/a.png', true, true) === ''
    && R('http://site.test/', 'http://img.test/a.png', false, null) === 'hôte inconnu' && R('http://site.test/', 'ftp://img.test/a.png', false, false) === 'protocole' && R('http://site.test/', 'http://a:b@img.test/a.png', false, false) === 'identifiants');
  // Serveurs « publics » : une session d'essai dont le mandataire est le serveur local, et une
  // résolution de noms simulée. Les adresses de la machine, elles, sont jointes directement.
  const { session } = require('electron');
  const pub = session.fromPartition('essai-pochette-' + Date.now());
  await pub.setProxy({ proxyRules: `http=127.0.0.1:${server.address().port}` });
  const resolve = async (host) => (host === 'double.exemple.test' ? ['93.184.216.34', '10.0.0.5'] : /\.test$/.test(host) ? ['93.184.216.34'] : []);
  const reasons = [];
  const fetchArt = (src, from = 'http://site.exemple.test/') => mediaLib.loadArtwork(pub, src, from, { resolve, trace: (u, why) => reasons.push(why) });
  const direct = await fetchArt('http://img.exemple.test/pochette.png');
  const followed = await fetchArt('http://img.exemple.test/redir-ok');
  check('pochette d’un hôte public, directe ou après une redirection vers un autre hôte public : acceptée', direct.startsWith('data:image/png') && followed.startsWith('data:image/png') && server.hits['/redir-ok'] === 1, [direct.length, followed.length].join());
  const before = { ...server.hits };
  const toLoop = await fetchArt('http://img.exemple.test/redir');
  check('redirection d’un hôte public vers 127.0.0.1 : refusée, la machine ne reçoit aucune requête', toLoop === '' && server.hits['/redir'] === (before['/redir'] || 0) + 1 && !server.hits['/interne.png'] && reasons.includes('réseau local'), JSON.stringify([toLoop.length, server.hits['/interne.png'], reasons]));
  const blind = [await fetchArt(`http://127.0.0.1:${server.address().port}/interne.png`), await fetchArt(`http://localhost:${server.address().port}/interne.png`), await fetchArt(`http://[::1]:${server.address().port}/interne.png`), await fetchArt('http://double.exemple.test/rebond.png'), await fetchArt('http://inconnu.invalid/rebond.png')];
  check('page publique : pochette sur la boucle locale, sur un nom résolu vers une adresse privée ou sur un hôte introuvable → aucune requête', blind.every((r) => r === '') && !server.hits['/interne.png'] && !server.hits['/rebond.png'], JSON.stringify(server.hits));
  const mixedBefore = server.hits['/pochette.png'];
  const mixed = await fetchArt('http://img.exemple.test/pochette.png', 'https://site.exemple.test/');
  check('pochette en http pour une page en https : refusée, aucune requête', mixed === '' && server.hits['/pochette.png'] === mixedBefore && reasons.includes('contenu mixte'));
  const loop = await fetchArt('http://img.exemple.test/boucle');
  check('redirections sans fin : trois suivies, pas une de plus', loop === '' && server.hits['/boucle'] === 4, String(server.hits['/boucle']));
  const fromLocal = await mediaLib.loadArtwork(w.session, base + '/redir', page);
  check('page de la machine elle-même : sa pochette locale, même après redirection, reste permise', fromLocal.startsWith('data:image/png') && server.hits['/interne.png'] === 1);
  await pub.clearStorageData().catch(() => {});

  // --- Gestes refusés ------------------------------------------------------------------
  const calme = await load('/calme', 'Calme');
  check('geste sur un lecteur : action inconnue, onglet sans lecteur ou valeur absurde → refusé',
    w.mediaAct({ act: 'evil' }) === false && w.mediaAct({ id: calme, act: 'toggle' }) === false && w.mediaAct('toggle') === false && w.mediaAct({ id: { a: 1 }, act: 'close' }) === false && w.mediaAct(null) === false);

  // --- Un onglet qui joue, quitté : lecteur avec titre, artiste, pochette ---------------
  const p1 = await load('/piste1', 'Piste 1');
  await js(p1, `start(${JSON.stringify(HOSTILE)})`);
  const audible = await until(() => wcOf(p1).isCurrentlyAudible(), 'onglet audible', 8000).then(() => true, () => false);
  if (!audible) {
    const env = await outils.milieu(w);
    if (!env.muet) throw new Error('Délai dépassé : onglet audible');
    for (const nom of ['lecteur miniature à la sortie d’un onglet qui joue', 'titre, artiste et pochette de la page', 'lecture / pause, ±15 s, recherche', 'piste précédente / suivante', 'plusieurs lecteurs', 'croix', 'retour à l’onglet']) outils.ignorer(nom, env.muet);
  } else {
    check('l’onglet affiché qui joue n’a pas de lecteur', players().length === 0 && w.mediaId === null);
    w.activate(calme);
    win.OrbeWindow.pushAll();
    const first = await until(() => { const p = players()[0]; return p && p.art && p.duration > 0 ? p : null; }, 'lecteur renseigné');
    check('onglet quitté pendant qu’il joue : un lecteur, en lecture', players().length === 1 && first.id === p1 && first.playing === true && w.mediaId === p1);
    check('titre et artiste annoncés par la page (bornés), durée et pochette recodée', first.title === HOSTILE.slice(0, mediaLib.LIMITS.text) && first.sub === 'Artiste 1' && Math.round(first.duration) === 60 && first.art.startsWith('data:image/png;base64,') && !('artSrc' in first), JSON.stringify({ ...first, art: first.art.slice(0, 30) }));
    check('piste précédente / suivante proposées : gestionnaires déclarés par la page dès son en-tête', first.prev === true && first.next === true && first.seek === true);

    // La coque : le titre hostile reste du texte ; la pochette est l'image d'Orbe.
    const card = await until(() => ui(`(() => { const el = document.querySelector('#media .mp[data-id="${p1}"]'); if (!el || !el.querySelector('.mp-art img')) return null;
      return { titre: el.querySelector('.mp-title').textContent, enfants: el.querySelector('.mp-title span').childElementCount, img: el.querySelector('.mp-art img').src.slice(0, 22), sub: el.querySelector('.mp-sub').textContent, pwned: window.pwned === 1,
        prev: !el.querySelector('.mp-prev').hidden, next: !el.querySelector('.mp-next').hidden, bar: !el.querySelector('.mp-bar').hidden, visible: !document.getElementById('media').hidden }; })()`), 'carte du lecteur');
    check('barre latérale : titre posé comme du texte (aucune balise créée), pochette en data:image/png, commandes présentes',
      card.titre === HOSTILE.slice(0, mediaLib.LIMITS.text) && card.enfants === 0 && !card.pwned && card.img === 'data:image/png;base64,' && card.sub === 'Artiste 1' && card.prev && card.next && card.bar && card.visible, JSON.stringify(card));

    // Avancement et titre : rien ne tourne en continu pendant la lecture (ENER-1).
    {
      const read = () => ui(`(() => { const el = document.querySelector('#media .mp[data-id="${p1}"]'); const f = el.querySelector('.mp-bar i'); const sp = el.querySelector('.mp-title span');
        return { x: new DOMMatrix(getComputedStyle(f).transform).a, barre: f.getAnimations().length, tours: sp.getAnimations().map((a) => a.effect.getTiming().iterations) }; })()`);
      const a1 = await read();
      const a2 = await until(async () => { const r = await read(); return r.x > a1.x + 0.002 ? r : null; }, 'avancement qui progresse');
      check('lecteur : l’avancement progresse par pas, sans transition ni animation en cours', a1.barre === 0 && a2.barre === 0 && a2.x > a1.x && a2.x < 1, JSON.stringify([a1, a2]));
      check('lecteur : le titre trop long ne défile pas sans fin', a1.tours.every((n) => Number.isFinite(n) && n <= 2), JSON.stringify(a1.tours));
    }

    // Lecture / pause.
    await w.mediaAct({ id: p1, act: 'toggle' });
    await until(async () => (await js(p1, 'document.getElementById("a").paused')) === true, 'pause dans la page');
    await until(() => players()[0].playing === false, 'lecteur en pause');
    check('pause : la page s’arrête, le lecteur reste', players().length === 1);
    await w.mediaAct({ id: p1, act: 'toggle' });
    await until(async () => (await js(p1, 'document.getElementById("a").paused')) === false, 'lecture dans la page');
    await until(() => players()[0].playing === true, 'lecteur en lecture');

    // Recherche.
    await w.mediaAct({ id: p1, act: 'seek', value: 30 });
    const at30 = await js(p1, 'document.getElementById("a").currentTime');
    await w.mediaAct({ id: p1, act: 'forward' });
    const at45 = await js(p1, 'document.getElementById("a").currentTime');
    await w.mediaAct({ id: p1, act: 'back' });
    await w.mediaAct({ id: p1, act: 'back' });
    const at15 = await js(p1, 'document.getElementById("a").currentTime');
    check('recherche : aller à 30 s, avancer de 15 s, reculer deux fois de 15 s', at30 >= 30 && at30 < 33 && at45 >= 45 && at45 < 49 && at15 >= 15 && at15 < 20, [at30, at45, at15].join());
    await w.mediaAct({ id: p1, act: 'seek', value: 9999 });
    const end = await js(p1, 'document.getElementById("a").currentTime');
    check('recherche au-delà de la fin : bornée à la durée ; valeur qui n’est pas un nombre : refusée', end <= 60.5 && w.mediaAct({ id: p1, act: 'seek', value: 'NaN' }) === false && w.mediaAct({ id: p1, act: 'seek', value: -4 }) === false, String(end));
    await w.mediaAct({ id: p1, act: 'seek', value: 5 });

    // Précédent / suivant : ce sont les gestionnaires de la page qui répondent.
    const okNext = await w.mediaAct({ id: p1, act: 'next' });
    const okPrev = await w.mediaAct({ id: p1, act: 'prev' });
    check('piste suivante puis précédente : les gestionnaires de la page sont appelés', okNext === true && okPrev === true && (await js(p1, 'calls.join()')) === 'next,prev');

    // Ce que la page peut voir du relevé de ses gestionnaires : rien qui trahisse Orbe.
    const quiet = (code) => wcOf(p1).executeJavaScript(code, false);
    const seen = await quiet(`(() => { const ms = navigator.mediaSession; const f = ms.setActionHandler; const d = Object.getOwnPropertyDescriptor(MediaSession.prototype, 'setActionHandler');
      let wrong = ''; try { ms.setActionHandler('0'.repeat(32), null); } catch (e) { wrong = e.name; }
      let bad = ''; try { f.call({}, 'play', null); } catch (e) { bad = e.name; }
      return { own: Object.getOwnPropertyNames(ms).concat(Object.getOwnPropertySymbols(ms).map(String)).join(), old: '__orbeActions' in ms, name: f.name, length: f.length,
        text: Function.prototype.toString.call(f), flags: [d.enumerable, d.writable, d.configurable, 'get' in d].join(), wrong, bad, globals: Object.keys(window).filter((k) => /orbe/i.test(k)).join() }; })()`);
    check('gestionnaires de la page : rien de posé sur `navigator.mediaSession` (plus de `__orbeActions`), aucune variable d’Orbe dans la page', seen.own === '' && seen.old === false && seen.globals === '', JSON.stringify(seen));
    check('`setActionHandler` garde l’allure de la fonction d’origine : nom, nombre d’arguments, texte « [native code] », mêmes attributs, mêmes erreurs',
      seen.name === 'setActionHandler' && seen.length === 2 && /\[native code\]/.test(seen.text) && !/table|KEY|apply/.test(seen.text) && seen.flags === 'true,true,true,false' && seen.wrong === 'TypeError' && seen.bad === 'TypeError', JSON.stringify(seen));
    // Un autre cadre qui emprunte la fonction n'écrit ni ne lit la table du cadre principal.
    const cross = await quiet(`(() => { const f = document.createElement('iframe'); document.body.append(f); const other = f.contentWindow.navigator.mediaSession; const set = navigator.mediaSession.setActionHandler;
      set.call(other, 'seekto', () => calls.push('intrus'));
      let read = 'rien'; try { read = String(set.call(other, ${JSON.stringify(mediaLib.keyOf(wcOf(p1)))}, null)); } catch (e) { read = e.name; }
      f.remove(); return read; })()`);
    const acts = (await quiet(mediaLib.infoCode(mediaLib.keyOf(wcOf(p1))))).acts;
    check('autre cadre : il ne lit pas les gestionnaires du cadre principal, même avec la clé, et n’en ajoute pas', cross === 'TypeError' && acts.slice().sort().join() === 'nexttrack,previoustrack' && /^[0-9a-f]{32}$/.test(mediaLib.keyOf(wcOf(p1))), cross + ' ' + acts.join());
    check('sans la clé du document : aucune action n’est lue ni déclenchée', (await quiet(mediaLib.infoCode(''))).acts.length === 0 && (await quiet(mediaLib.infoCode('f'.repeat(32)))).acts.length === 0 && (await quiet('calls.join()')) === 'next,prev');

    // Geste prêté à la page : lecture / pause et pistes seulement.
    const flagOf = (id, a) => {
      const wc = wcOf(id);
      const real = wc.executeJavaScript;
      const seen = [];
      wc.executeJavaScript = function spy(code, gesture) { seen.push(gesture === true); return real.call(this, code, gesture); };
      let r;
      try { r = w.mediaAct({ id, ...a }); } finally { wc.executeJavaScript = real; }
      return Promise.resolve(r).then(() => seen.join());
    };
    const flags = {};
    for (const a of [{ act: 'toggle' }, { act: 'toggle' }, { act: 'prev' }, { act: 'next' }, { act: 'back' }, { act: 'forward' }, { act: 'seek', value: 5 }]) flags[a.act] = await flagOf(p1, a);
    check('geste prêté à la page : oui pour lecture / pause et piste précédente / suivante, non pour ±15 s et la recherche',
      flags.toggle === 'true' && flags.prev === 'true' && flags.next === 'true' && flags.back === 'false' && flags.forward === 'false' && flags.seek === 'false', JSON.stringify(flags));
    await until(async () => (await js(p1, 'document.getElementById("a").paused')) === false, 'lecture reprise');
    // L'activation laissée par les gestes précédents s'éteint seule (5 s) ; une recherche n'en redonne pas.
    const active = () => wcOf(p1).executeJavaScript('navigator.userActivation.isActive', false);
    await until(async () => (await active()) === false, 'activation éteinte', 15000);
    await w.mediaAct({ id: p1, act: 'seek', value: 8 });
    check('après une recherche depuis le lecteur : la page n’a aucune activation d’utilisateur (navigator.userActivation.isActive)', (await active()) === false && (await wcOf(p1).executeJavaScript('document.getElementById("a").currentTime', false)) >= 8);

    // Page qui change de pochette sans arrêt : une recherche en cours au plus, puis une attente.
    // (Le moteur va lui aussi chercher ces images, pour les commandes du système : ce sont
    // les recherches d'Orbe que l'on compte, par ses décodages.)
    const rt1 = win.live.get(p1);
    const every0 = artLib.ART.every;
    await until(() => !rt1.artBusy, 'aucune pochette en cours');
    let decodes = 0;
    const decode0 = artLib.hooks.decode;
    artLib.hooks.decode = (buf) => { decodes += 1; return decode0(buf); };
    artLib.ART.every = 60000;
    rt1.artAt = 0;
    for (let n = 0; n < 12; n++) { await quiet(`setArt(${n})`); await media.refresh(w, p1); }
    await until(() => !rt1.artBusy, 'pochette cherchée');
    await media.refresh(w, p1);
    check('pochette changée douze fois de suite : une seule recherche, une seule image décodée', decodes === 1 && rt1.media.artSrc.endsWith('n=11') && rt1.media.art === '', String(decodes));
    // Le délai passé, la dernière image annoncée est cherchée ; une image déjà vue revient sans recherche.
    artLib.ART.every = 0;
    await media.refresh(w, p1);
    await until(() => !!rt1.media.art, 'dernière pochette affichée');
    const seenArt = rt1.media.art;
    await quiet('setArt(0)'); await media.refresh(w, p1);
    await until(() => !rt1.artBusy, 'pochette cherchée');
    const mid = decodes;
    await quiet('setArt(11)'); await media.refresh(w, p1);
    check('délai passé : la dernière pochette annoncée s’affiche ; image déjà cherchée : rendue de mémoire, sans nouveau décodage', mid <= 3 && decodes === mid && rt1.media.art === seenArt && rt1.media.artSrc.endsWith('n=11'), [mid, decodes].join());
    artLib.ART.every = every0;
    artLib.hooks.decode = decode0;
    // Textes et pochette démesurés : coupés dans la page, avant de traverser vers Orbe.
    await quiet(`(() => { navigator.mediaSession.metadata = new MediaMetadata({ title: 'T'.repeat(3e6), artist: 'A'.repeat(3e6), artwork: [{ src: 'data:image/png;base64,' + 'A'.repeat(1e6), sizes: '300x300', type: 'image/png' }] }); return true; })()`);
    const big = await quiet(mediaLib.infoCode(mediaLib.keyOf(wcOf(p1))));
    check('titre, artiste et pochette de plusieurs méga-octets : tronqués par la question posée à la page (320 caractères, pochette écartée)', big.title.length === mediaLib.LIMITS.raw && big.artist.length === mediaLib.LIMITS.raw && big.art === '' && JSON.stringify(big).length < 2000, [big.title.length, big.artist.length, big.art.length].join());
    await quiet(`setArt(11, ${JSON.stringify(HOSTILE)})`);
    await media.refresh(w, p1);

    // Son coupé depuis le lecteur.
    w.mediaAct({ id: p1, act: 'mute' });
    check('muet depuis le lecteur : son de l’onglet coupé, puis rétabli', d.tabs[p1].muted === true && wcOf(p1).isAudioMuted() && players()[0].muted === true && (w.mediaAct({ id: p1, act: 'mute' }), d.tabs[p1].muted === false));

    // Volume de l'onglet : celui des lecteurs de la page (le son d'essai reste quasi inaudible : on ne fait que baisser).
    {
      const v0 = await js(p1, 'document.getElementById("a").volume');
      const okVol = await w.mediaAct({ id: p1, act: 'volume', value: v0 * 0.5 });
      const v1 = await js(p1, 'document.getElementById("a").volume');
      const shown = await until(() => { const p = players()[0]; return p && Math.abs(p.volume - v1) < 0.02 ? p.volume : null; }, 'volume annoncé par le lecteur').catch(() => null);
      check('volume depuis le lecteur : les lecteurs de la page baissent, le lecteur miniature annonce le nouveau niveau', okVol === true && Math.abs(v1 - Math.round(v0 * 50) / 100) < 0.011 && shown !== null, [v0, v1, shown].join());
      check('volume : valeur hors de 0 à 1, ou qui n’est pas un nombre → refusée, rien ne change',
        w.mediaAct({ id: p1, act: 'volume', value: 1.5 }) === false && w.mediaAct({ id: p1, act: 'volume', value: -0.1 }) === false && w.mediaAct({ id: p1, act: 'volume', value: '0.5); alert(1); (' }) === false && w.mediaAct({ id: p1, act: 'volume' }) === false
        && (await js(p1, 'document.getElementById("a").volume')) === v1);
      await w.mediaAct({ id: p1, act: 'volume', value: v0 });
    }

    // Deuxième onglet qui joue : deux lecteurs, le plus récent en tête.
    const p2 = await load('/piste2', 'Piste 2');
    await js(p2, 'start("Deuxième morceau")');
    await until(() => wcOf(p2).isCurrentlyAudible(), 'second onglet audible');
    w.activate(calme);
    win.OrbeWindow.pushAll();
    await until(() => players().length === 2 && players()[0].title === 'Deuxième morceau', 'deux lecteurs');
    check('deux onglets qui jouent : deux lecteurs empilés, le plus récent en tête', players().map((p) => p.id).join() === [p2, p1].join());
    await until(() => ui('document.querySelectorAll("#media .mp:not(.out)").length === 2'), 'deux cartes');
    check('barre latérale : deux cartes, dans le même ordre', (await ui('[...document.querySelectorAll("#media .mp:not(.out)")].map((el) => el.dataset.id).join()')) === [p2, p1].join());

    // La croix : le son s'arrête, le lecteur s'en va, l'onglet reste.
    const closeFlag = await flagOf(p2, { act: 'close' });
    check('croix : la page est mise en pause sans geste prêté', closeFlag === 'false', closeFlag);
    await until(async () => (await js(p2, 'document.getElementById("a").paused')) === true, 'second onglet en pause');
    check('croix : lecture arrêtée, lecteur retiré, onglet gardé', players().map((p) => p.id).join() === p1 && !!d.tabs[p2] && win.live.has(p2));
    await until(() => ui('document.querySelectorAll("#media .mp").length === 1'), 'carte retirée');

    // Réglage coupé : aucun lecteur montré.
    store.state.settings.mediaControls = false;
    check('réglage « Lecteur réduit » coupé : rien n’est montré', players().length === 0);
    store.state.settings.mediaControls = true;

    // Autre site dans le même onglet : ce que l'ancien annonçait est oublié.
    check('avant de changer de page : titre et pochette annoncés sont retenus', !!win.live.get(p1).media && win.live.get(p1).media.track !== '');
    wcOf(p1).loadURL(base + '/calme');
    await until(() => d.tabs[p1].title === 'Calme' && !wcOf(p1).isLoading(), 'onglet passé sur une autre page');
    const after = win.live.get(p1).media;
    check('navigation du cadre principal : titre, artiste et pochette de l’ancienne page ne sont plus montrés', !after || (after.track === '' && after.artist === '' && !after.art && !after.artSrc), JSON.stringify(after || null).slice(0, 160));
    wcOf(p1).loadURL(base + '/piste1');
    await until(() => d.tabs[p1].title === 'Piste 1' && !wcOf(p1).isLoading(), 'onglet revenu sur la piste');
    await js(p1, 'start("Retour")');
    await until(() => wcOf(p1).isCurrentlyAudible(), 'onglet de nouveau audible');
    await until(() => players().length === 1 && players()[0].title === 'Retour', 'lecteur de retour');

    // Retour à l'onglet : son lecteur disparaît.
    w.mediaAct({ id: p1, act: 'open' });
    check('« Revenir à l’onglet » : l’onglet s’affiche, son lecteur disparaît', w.activeId === p1 && players().length === 0);
    win.OrbeWindow.pushAll();
    await until(() => ui('document.getElementById("media").hidden === true && !document.querySelector("#media .mp")'), 'lecteurs retirés de la barre');
    // Onglet fermé pendant qu'il a un lecteur : le lecteur part avec lui.
    w.activate(calme);
    await until(() => players().length === 1, 'lecteur revenu');
    w.close(p1, { silent: true, ask: false });
    check('onglet fermé : son lecteur part avec lui', players().length === 0);
    if (d.tabs[p2]) w.close(p2, { silent: true, ask: false });
  }
  for (const id of [p1, calme]) if (d.tabs[id]) w.close(id, { silent: true, ask: false });
  store.state.settings.mediaControls = mediaControls0;
  win.OrbeWindow.pushAll();
  await sleep(50);
  // Carte neuve dont la durée est connue d'emblée : l'avancement démarre quand même (elle est
  // remplie avant d'être posée dans la barre ; il restait figé une fois sur trois).
  {
    const neuf = await ui(`(() => { renderPlayers([{ id: 'essai-avancement', title: 'Essai', url: 'https://exemple.test/', playing: true, duration: 60, position: 1 }]);
      const el = document.querySelector('#media .mp[data-id="essai-avancement"]'); const ok = !!el && el.isConnected && !!el._tick; renderPlayers([]); return ok; })()`);
    check('lecteur : une carte neuve qui joue fait avancer sa barre dès qu’elle est posée', neuf === true);
    await until(() => ui('!document.querySelector("#media .mp")'), 'carte d’essai retirée');
  }
  server.close();
  if (server.closeAllConnections) server.closeAllConnections();
  return failed;
};
module.exports.serve = serve;
module.exports.HOSTILE = HOSTILE;
