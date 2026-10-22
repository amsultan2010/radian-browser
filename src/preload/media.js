// Lecteur miniature : retient les gestionnaires que la page déclare elle-même
// par `navigator.mediaSession.setActionHandler` (piste précédente, suivante…).
//
// Chromium ne laisse pas relire ces gestionnaires, et Electron n'ouvre pas la
// session multimédia du navigateur : pour que les boutons du lecteur d'Orbe
// (src/main/media.js) déclenchent ceux du site, on les note au passage. Le script
// tourne dans le monde de la page, avant ses scripts, cadre principal des pages
// web seulement.
//
// Rien n'est posé sur un objet de la page : la table vit dans une fermeture, et
// `setActionHandler` est remplacé par un mandataire de la fonction d'origine (même
// `name`, même `length`, texte « [native code] »). Orbe atteint la table en
// appelant cette même fonction avec une clé tirée au hasard pour ce document,
// que seuls ce script et le processus principal connaissent : `(clé, null)` rend
// la liste des actions déclarées, `(clé, 'nexttrack')` appelle le gestionnaire.
// Seule la session du cadre lui-même est notée et servie : un autre cadre qui
// emprunterait la fonction n'y lit rien et n'y écrit rien.
const { webFrame, ipcRenderer } = require('electron');

const CHANNEL = 'orbe:media-key';

const patch = (key) => `(() => { try {
  const ms = navigator.mediaSession;
  if (!ms) return;
  const proto = Object.getPrototypeOf(ms);
  const desc = Object.getOwnPropertyDescriptor(proto, 'setActionHandler');
  if (!desc || typeof desc.value !== 'function') return;
  const KEY = ${JSON.stringify(key)};
  const apply = Reflect.apply;
  const names = Object.keys;
  const table = Object.create(null);
  const patched = new Proxy(desc.value, { apply(target, self, args) {
    if (self === ms && args.length === 2 && args[0] === KEY) {
      if (args[1] === null) return names(table);
      const h = typeof args[1] === 'string' ? table[args[1]] : null;
      if (typeof h !== 'function') return false;
      h({ action: args[1] });
      return true;
    }
    const r = apply(target, self, args);
    try {
      if (self === ms) { const name = String(args[0]); if (typeof args[1] === 'function') table[name] = args[1]; else delete table[name]; }
    } catch {}
    return r;
  } });
  Object.defineProperty(proto, 'setActionHandler', { ...desc, value: patched });
} catch {} })()`;

try {
  if (process.isMainFrame && /^https?:$/.test(location.protocol)) {
    const key = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    webFrame.executeJavaScript(patch(key));
    ipcRenderer.send(CHANNEL, key);
  }
} catch {}
