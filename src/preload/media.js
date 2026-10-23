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
//
// The same closure keeps the tracks the page got from getUserMedia, for the
// player's microphone and camera buttons: `(key, 'tracks')` gives their state,
// `(key, 'audio')` or `(key, 'video')` turns them off or back on.
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
  // Tracks the page got from getUserMedia, and their clones: the player's microphone and camera
  // buttons turn them off and on (a disabled track sends silence or black).
  // shortcut: only the main frame's tracks; a page can still reach the microphone from an iframe
  // or by swapping built-ins (the capture indicator stays the truth), upgrade if Electron gets a per-tab mic mute.
  const tracks = new Set();
  const T = MediaStreamTrack.prototype;
  const acc = (name) => Object.getOwnPropertyDescriptor(T, name);
  const kindOf = acc('kind').get, stateOf = acc('readyState').get, enabled = acc('enabled');
  const getTracks = MediaStream.prototype.getTracks;
  const then = Promise.prototype.then;
  // Live tracks of kind k; ended ones are forgotten on the way.
  const live = (k) => { const out = []; for (const tr of tracks) { if (apply(stateOf, tr, []) !== 'live') tracks.delete(tr); else if (apply(kindOf, tr, []) === k) out.push(tr); } return out; };
  const status = (k) => { const l = live(k); return !l.length ? '' : l.some((tr) => apply(enabled.get, tr, [])) ? 'on' : 'off'; };
  const flip = (k) => { const on = status(k) !== 'on'; for (const tr of live(k)) apply(enabled.set, tr, [on]); return status(k); };
  const wrap = (o, name, after) => {
    const d = Object.getOwnPropertyDescriptor(o, name);
    if (d && typeof d.value === 'function') Object.defineProperty(o, name, { ...d, value: new Proxy(d.value, { apply(target, self, args) { return after(apply(target, self, args), self); } }) });
  };
  if (typeof MediaDevices === 'function') wrap(MediaDevices.prototype, 'getUserMedia', (p) => apply(then, p, [(s) => { try { live(''); for (const tr of apply(getTracks, s, [])) tracks.add(tr); } catch {} return s; }]));
  wrap(T, 'clone', (c, self) => { if (tracks.has(self)) tracks.add(c); return c; });
  const patched = new Proxy(desc.value, { apply(target, self, args) {
    if (self === ms && args.length === 2 && args[0] === KEY) {
      if (args[1] === null) return names(table);
      // Not Media Session action names, so no page handler can be stored under them.
      if (args[1] === 'tracks') return [status('audio'), status('video')];
      if (args[1] === 'audio' || args[1] === 'video') return flip(args[1]);
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
