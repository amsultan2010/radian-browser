// Certificat X.509 auto-signé pour les serveurs HTTPS des tests, fabriqué avec
// le seul module `crypto` de Node (aucune dépendance, pas d'openssl) : une clé
// ECDSA P-256 et un certificat écrit en DER à la main. Fonctionne à l'identique
// sous macOS et sous Windows.
const crypto = require('crypto');

function der(tag, ...parts) {
  const body = Buffer.concat(parts);
  let len;
  if (body.length < 128) len = Buffer.from([body.length]);
  else {
    const bytes = [];
    for (let n = body.length; n; n >>= 8) bytes.unshift(n & 255);
    len = Buffer.from([0x80 | bytes.length, ...bytes]);
  }
  return Buffer.concat([Buffer.from([tag]), len, body]);
}
const seq = (...p) => der(0x30, ...p);
const set = (...p) => der(0x31, ...p);
function oid(text) {
  const a = text.split('.').map(Number);
  const out = [a[0] * 40 + a[1]];
  for (const v of a.slice(2)) {
    const stack = [v & 127];
    for (let n = v >> 7; n; n >>= 7) stack.unshift((n & 127) | 128);
    out.push(...stack);
  }
  return der(0x06, Buffer.from(out));
}
const int = (buf) => der(0x02, buf[0] & 0x80 ? Buffer.concat([Buffer.from([0]), buf]) : buf);
const utc = (d) => der(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'));
const name = (cn) => seq(set(seq(oid('2.5.4.3'), der(0x0c, Buffer.from(cn)))));

// Renvoie { key, cert } au format PEM, prêts pour https.createServer.
// `notBefore` / `notAfter` permettent de fabriquer un certificat expiré.
function selfSigned({ cn = 'Orbe (test)', dns = ['localhost'], ips = ['127.0.0.1'], notBefore = new Date(Date.now() - 864e5), notAfter = new Date(Date.now() + 30 * 864e5) } = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const algorithm = seq(oid('1.2.840.10045.4.3.2')); // ecdsa-with-SHA256
  const serial = crypto.randomBytes(8);
  serial[0] = (serial[0] & 0x7f) | 0x01;
  const san = seq(...dns.map((d) => der(0x82, Buffer.from(d))), ...ips.map((ip) => der(0x87, Buffer.from(ip.split('.').map(Number)))));
  const extensions = der(0xa3, seq(seq(oid('2.5.29.17'), der(0x04, san))));
  const tbs = seq(der(0xa0, int(Buffer.from([2]))), int(serial), algorithm, name(cn), seq(utc(notBefore), utc(notAfter)), name(cn), publicKey.export({ type: 'spki', format: 'der' }), extensions);
  const signature = crypto.sign('sha256', tbs, privateKey);
  const cert = seq(tbs, algorithm, der(0x03, Buffer.from([0]), signature));
  const pem = '-----BEGIN CERTIFICATE-----\n' + cert.toString('base64').match(/.{1,64}/g).join('\n') + '\n-----END CERTIFICATE-----\n';
  return { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), cert: pem, cn };
}

module.exports = { selfSigned };
