#!/usr/bin/env node
// Met à jour assets/blocklist.txt : télécharge les listes sources, les
// normalise, retire les doublons et écrit un domaine par ligne.
//   node scripts/update-blocklist.js            écrit assets/blocklist.txt
//   node scripts/update-blocklist.js --dry      affiche le bilan sans écrire
//
// Orbe est sous licence MIT : seules des listes dont la licence autorise la
// redistribution, y compris commerciale, sont embarquées. Écartées exprès :
//   - EasyList / EasyPrivacy, AdGuard, OISD, HaGeZi : GPLv3 ou CC BY-SA ;
//   - le fichier unifié de StevenBlack : son dépôt est MIT, mais il agrège des
//     sources non commerciales (MVPS, someonewhocares) ou « partage à
//     l'identique » (KADhosts). On ne prend que sa liste personnelle ;
//   - la liste de Peter Lowe (pgl.yoyo.org) : excellente, mais sa licence
//     « McRae GPL » interdit tout usage pouvant rapporter de l'argent.
const fs = require('fs');
const path = require('path');
const { registrableDomain, isSuffix } = require('../src/main/adblock');

const OUT = path.join(__dirname, '..', 'assets', 'blocklist.txt');
const MIN_DOMAINS = 20000; // en dessous, une source a sûrement changé de format

const SOURCES = [
  {
    name: "Anudeep's Blacklist (adservers)",
    home: 'https://github.com/anudeepND/blacklist',
    url: 'https://raw.githubusercontent.com/anudeepND/blacklist/master/adservers.txt',
    license: 'MIT — © 2018 Anudeep ND',
  },
  {
    name: 'AdAway default blocklist',
    home: 'https://github.com/AdAway/adaway.github.io',
    url: 'https://raw.githubusercontent.com/AdAway/adaway.github.io/master/hosts.txt',
    license: 'CC BY 3.0 — Kicelo, Dominik Schuermann et contributeurs',
  },
  {
    name: "Steven Black's ad-hoc list",
    home: 'https://github.com/StevenBlack/hosts',
    url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/data/StevenBlack/hosts',
    license: 'MIT — © Steven Black',
  },
];

// Garde-fou : une source ne doit jamais pouvoir bloquer ces sites en entier
// (leurs sous-domaines publicitaires restent bloquables).
const PROTECTED = new Set(['google.com', 'google.fr', 'youtube.com', 'gstatic.com', 'googleapis.com', 'googlevideo.com', 'ytimg.com', 'facebook.com', 'instagram.com', 'whatsapp.com', 'apple.com', 'icloud.com', 'microsoft.com', 'live.com', 'office.com', 'bing.com', 'amazon.com', 'amazon.fr', 'wikipedia.org', 'github.com', 'githubusercontent.com', 'cloudflare.com', 'twitter.com', 'x.com', 'linkedin.com', 'reddit.com', 'netflix.com', 'paypal.com', 'yahoo.com', 'duckduckgo.com', 'mozilla.org', 'jsdelivr.net', 'unpkg.com']);

const VALID = /^(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

// Accepte le format hosts (« 0.0.0.0 domaine ») comme un domaine nu par ligne.
function extract(text) {
  const out = [];
  for (let line of text.split('\n')) {
    const hash = line.indexOf('#');
    if (hash !== -1) line = line.slice(0, hash);
    const parts = line.trim().toLowerCase().split(/\s+/);
    if (!parts[0]) continue;
    const hosts = /^(?:\d+\.\d+\.\d+\.\d+|::1?|[0-9a-f:]*:[0-9a-f:]+)$/.test(parts[0]) ? parts.slice(1) : parts.slice(0, 1);
    for (let h of hosts) {
      if (h.endsWith('.')) h = h.slice(0, -1);
      if (h.length > 253 || !VALID.test(h)) continue;
      if (h === 'localhost.localdomain' || h.endsWith('.local') || h.endsWith('.localhost')) continue;
      if (isSuffix(h) || PROTECTED.has(h)) continue; // jamais un suffixe public entier
      out.push(h);
    }
  }
  return out;
}

// Retire les domaines déjà couverts par un parent listé : le bloqueur remonte
// les domaines parents, `pub.exemple.com` est inutile si `exemple.com` y est.
function prune(set) {
  const kept = [];
  for (const d of set) {
    let covered = false;
    for (let dot = d.indexOf('.'); dot !== -1 && !covered; dot = d.indexOf('.', dot + 1)) {
      covered = set.has(d.slice(dot + 1));
    }
    if (!covered) kept.push(d);
  }
  return kept;
}

async function download(src) {
  const res = await fetch(src.url, { redirect: 'follow', signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${src.name} : HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const dry = process.argv.includes('--dry');
  const all = new Set();
  const lines = [];
  for (const src of SOURCES) {
    const found = extract(await download(src));
    if (!found.length) throw new Error(`${src.name} : aucune entrée lisible`);
    for (const d of found) all.add(d);
    console.log(`  ${String(found.length).padStart(6)}  ${src.name}`);
    lines.push(`#   - ${src.name}`, `#     ${src.home}`, `#     Licence : ${src.license}`);
  }
  // Tri par domaine enregistrable : les hôtes d'une même régie restent groupés
  // et les différences entre deux mises à jour se relisent facilement.
  const kept = prune(all).map((d) => [registrableDomain(d), d]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1)).map((x) => x[1]);
  if (kept.length < MIN_DOMAINS) throw new Error(`seulement ${kept.length} domaines : abandon, fichier inchangé`);

  const header = [
    '# Orbe — liste de blocage (publicités et traqueurs)',
    '# Fichier généré par scripts/update-blocklist.js : ne pas modifier à la main.',
    `# Mise à jour : ${new Date().toISOString().slice(0, 10)} — ${kept.length} domaines`,
    '#',
    '# Un domaine par ligne ; un domaine listé couvre aussi ses sous-domaines.',
    '#',
    '# Ces données ne sont PAS sous la licence MIT du code d\'Orbe : chaque source',
    '# garde sa licence, citée ci-dessous. Toutes autorisent la redistribution et',
    '# la modification, y compris commerciales, à condition de conserver ces',
    '# mentions (CC BY 3.0 : https://creativecommons.org/licenses/by/3.0/ ;',
    '# les listes ont été fusionnées, dédoublonnées et réduites aux domaines).',
    '#',
    '# Sources :',
    ...lines,
    '#',
  ];
  const body = header.join('\n') + '\n' + kept.join('\n') + '\n';
  console.log(`  ${String(all.size).padStart(6)}  domaines uniques`);
  console.log(`  ${String(kept.length).padStart(6)}  après retrait des sous-domaines déjà couverts`);
  console.log(`  ${(Buffer.byteLength(body) / 1024).toFixed(0)} Ko`);
  if (dry) return;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT + '.tmp', body);
  fs.renameSync(OUT + '.tmp', OUT);
  console.log(`Écrit : ${path.relative(process.cwd(), OUT)}`);
}

main().catch((err) => {
  console.error('Mise à jour impossible —', err.message);
  process.exit(1);
});
