# Extensions Chrome

Module : `src/main/extensions.js` — tests : `node --test tests/extensions.test.js`
(Node seul, sans réseau). Aucune dépendance npm. Les API `chrome.*` qu'Electron
n'a pas sont décrites plus bas : « Couche d'API ».

## Principe

1. Téléchargement du CRX, sans compte Google :
   `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=<Chromium>&acceptformat=crx2,crx3&x=id%3D<ID>%26uc`
2. Lecture de l'en-tête CRX3 (`Cr24`, version, longueur, protobuf) et
   vérification des signatures.
3. Décompression du ZIP (`zlib`, entrées stockées ou « deflate ») dans un
   dossier temporaire.
4. Ajout de la clé publique du développeur dans `manifest.json` (`key`) : sans
   elle, une extension dépaquetée prend un identifiant tiré de son chemin.
5. Bascule : `state.json` désigne le dossier de la nouvelle version, puis
   l'ancienne est supprimée.

Le module n'exécute jamais rien de ce qu'il extrait. Il passe le dossier à
`session.extensions.loadExtension`, avec `allowFileAccess: false`.

Sur le disque :

```
<userData>/Extensions/
  state.json                       { extensions: { <id>: { enabled, current, installedAt } } }
  <id>/<version>_<horodatage>/     l'extension dépaquetée, clé injectée
```

## Ce qui est vérifié, ce qui ne l'est pas

Vérifié à chaque installation :

- **Identifiant** : la clé publique du développeur donne l'identifiant demandé
  (SHA-256, 16 premiers octets, écrits de `a` à `p`). Un fichier valide mais
  signé pour une autre extension est refusé (`EXT_ID_MISMATCH`).
- **Intégrité** : toutes les signatures de l'en-tête (RSA PKCS#1 v1.5 et ECDSA,
  SHA-256) sont vérifiées sur `"CRX3 SignedData\0"` + longueur + données
  signées + archive. Une seule signature fausse fait tout refuser, comme dans
  Chromium (`EXT_BAD_SIGNATURE`).
- **Provenance** : l'une des signatures doit venir de la clé de publication du
  Chrome Web Store, reconnue par son empreinte (`kPublisherKeyHash` de
  Chromium). Sinon `EXT_NOT_FROM_STORE`. Désactivable avec
  `configure({ requireStoreSignature: false })` — utile seulement aux tests.
- **Archive** : chemins absolus, lettres de lecteur, `..`, octets nuls, liens
  symboliques, fichiers spéciaux et fichiers chiffrés refusés avant toute
  écriture ; plafonds sur le nombre de fichiers (20 000), la taille totale
  (512 Mo) et la taille par fichier (256 Mo), appliqués aux octets réellement
  produits ; somme de contrôle CRC-32 de chaque fichier ; aucun bit
  d'exécution n'est posé. ZIP64 et archives en plusieurs volumes refusés.

Non vérifié :

- **Le contenu.** Aucune analyse du code, aucune liste noire d'extensions
  retirées du Store pour malveillance.
- **L'intégrité après installation.** `_metadata/verified_contents.json` n'est
  pas extrait (Chromium refuse un dossier dépaqueté qui le contient) : un
  fichier modifié sur le disque après coup n'est pas détecté.
- **Les autorisations.** Le module les renvoie (`permissions`,
  `hostPermissions`) ; c'est à l'interface de les montrer avant d'installer.
- Pas de mise à jour automatique : rappeler `install(id)` remplace la version.

## API

```js
const extensions = require('./extensions');

extensions.configure({ dir, fetch, lang, requireStoreSignature, limits });
extensions.parseStoreInput(texte)       // -> id | null
await extensions.install(idOuAdresse)   // -> fiche + { verified: { developer, store, proofs } }
extensions.list()                       // -> [fiche], triées par nom
extensions.get(id)                      // -> fiche | null
await extensions.remove(id)             // retire des sessions connues, puis du disque
await extensions.loadInto(session)      // -> { loaded, unloaded, failed: [{ id, error }], skipped }
await extensions.unloadFrom(session, id)
await extensions.syncAll()              // loadInto() sur toutes les sessions déjà vues
extensions.setEnabled(id, bool)         // écrit state.json, resynchronise en arrière-plan
extensions.isEnabled(id)
extensions.popupFor(id)                 // -> { url, title, icon } | null
extensions.parseCrx(buffer)             // -> { version, publicKey, id, zip, proofs, signedHeaderData }
extensions.verifyCrx(crx)               // -> { developer, store, proofs } ou lève une erreur
await extensions.unzip(buffer, dossier, { maxFiles, maxBytes, maxEntryBytes, skip })
```

Fiche : `{ id, name, version, description, permissions, hostPermissions, icon,
dir, enabled, manifestVersion }`. `icon` est un chemin absolu ou `''`.
`hostPermissions` réunit `host_permissions`, les motifs d'URL de `permissions`
(Manifest V2) et les `matches` des scripts de contenu. Les noms `__MSG_x__`
sont résolus dans `_locales` : langue d'Orbe (`lang`, `fr` par défaut), puis
`en`, puis `default_locale`.

`parseCrx` ne vérifie **aucune** signature : appeler `verifyCrx` ensuite.

`loadInto` est une synchronisation : elle charge ce qui manque, retire ce qui a
été désactivé, désinstallé ou mis à jour, et ne fait rien si tout est en place.
Elle ne touche pas aux extensions chargées depuis un autre dossier. Une session
non persistante (navigation privée) est ignorée (`skipped: true`).

Les erreurs portent un `code` stable : `EXT_BAD_ID`, `EXT_NOT_FOUND`,
`EXT_DOWNLOAD`, `EXT_BAD_CRX`, `EXT_ID_MISMATCH`, `EXT_BAD_SIGNATURE`,
`EXT_NOT_FROM_STORE`, `EXT_BAD_ZIP`, `EXT_UNSAFE_ZIP`, `EXT_ZIP_TOO_BIG`,
`EXT_BAD_MANIFEST`, `EXT_UNSUPPORTED` (thèmes, applications Chrome),
`EXT_NOT_CONFIGURED`.

## Branchement

Dans `main.js`, après `store.load(...)` dans `app.whenReady()` :

```js
extensions.configure({
  dir: path.join(app.getPath('userData'), 'Extensions'),
  fetch: (url, options) => net.fetch(url, options), // suit le proxy du système
  lang: store.state.settings.lang,
});
```

Dans `sessions.js`, à la fin de `configure(ses, { persist })` :

```js
if (persist) extensions.loadInto(ses).then((r) => {
  for (const f of r.failed) console.error('[orbe] extension', f.id, f.error);
});
```

`loadExtension` doit être rappelé à chaque démarrage et pour chaque profil :
c'est ce que fait cet appel, puisque `profileSession()` passe par `configure`.
Il faut donc que `extensions.configure` ait été appelé avant la première
`profileSession()`. Le chargement est asynchrone : un onglet restauré avant sa
fin s'affiche d'abord sans script de contenu.

Interface à écrire :

- **Barre de commande** : si `parseStoreInput(saisie)` renvoie un identifiant,
  proposer « Installer l'extension ». Montrer nom et autorisations avant de
  confirmer (elles ne sont connues qu'après téléchargement : installer
  désactivé, ou télécharger puis confirmer).
- **Réglages** : `list()` (icône, nom, version, autorisations), interrupteur
  `setEnabled`, bouton `remove`, bouton « Mettre à jour » (`install(id)`).
- **Bouton et fenêtre surgissante** : Electron n'affiche rien. Pour chaque
  extension où `popupFor(id)` n'est pas nul, un bouton ouvre une petite
  fenêtre sur `popup.url`, **dans la session du profil**.

À savoir : « effacer les données du profil » (`clearStorageData`) efface aussi
le stockage des extensions. Les requêtes `chrome-extension://` ne passent pas
par le bloqueur.

## Couche d'API `chrome.*`

Electron ne fournit qu'une partie des API de Chrome. Orbe ajoute le reste avec
sa propre couche, écrite à partir de la documentation publique de Chrome et
d'Electron (licence MIT, aucun code tiers, aucune dépendance) :

| Fichier | Rôle |
| --- | --- |
| `src/preload/ext.js` | complète `chrome` (et `browser`) dans les pages d'extension et les service workers |
| `src/main/ext-api.js` | les API elles-mêmes, les autorisations, les événements |
| `src/main/ext-host.js` | onglets et fenêtres d'Orbe vus comme ceux de Chrome, fenêtre surgissante |
| `src/main/ext-panel.js` | `sidePanel` : panneau latéral dans la fenêtre (habillage : `src/renderer/panel.*`, `src/preload/panel.js`) |
| `src/main/ext-debug.js` | `debugger`, sur le débogueur d'Electron, avec son bandeau |
| `src/main/ext-access.js` | `activeTab` : accès aux pages accordé par l'utilisateur |
| `src/main/ext-more.js` | raccourcis de `commands`, `identity`, `tabGroups`, zoom, `downloads` |

Les quatre derniers ajoutent leurs méthodes à `ext-api.js` par `extApi.extend({...})` et
se servent de ses outils (`extApi.internals`). `ORBE_EXT_TRACE=1` écrit dans le
terminal chaque appel, refus et événement : c'est le moyen le plus rapide de voir
ce qu'une extension attend.

Tests : `npm run test:ext` (extension `tests/ext-fixture`, sans réseau) et
`node scripts/test-ext.js reelles` (vraies extensions, demande Internet).

### Mécanisme

- `session.registerPreloadScript` enregistre `ext.js` sur chaque session de
  profil, pour les types `frame` et `service-worker`. Le script s'exécute
  **avant** le code de l'extension ; `contextBridge.executeInMainWorld` lui
  permet de compléter l'objet `chrome` du monde principal. Dans un service
  worker d'un site web ou une page ordinaire, il ne fait rien.
- Chaque appel part par IPC (`ipcMain` pour les pages, `ServiceWorkerMain.ipc`
  pour les service workers). L'extension appelante est déduite de l'émetteur
  — origine du cadre ou portée du service worker —, jamais de ce que le script
  affirme, puis les autorisations du manifeste sont vérifiées.
- Les événements ne sont envoyés qu'aux contextes qui les écoutent. Un service
  worker endormi est réveillé (`startWorkerForScope`) et gardé éveillé quelques
  secondes (`startTask`).
- Identifiant d'onglet = identifiant du `webContents` : c'est déjà celui
  qu'Electron donne dans `sender.tab.id` et attend dans `tabs.sendMessage` et
  `scripting.executeScript`. Seuls les onglets vivants existent pour une
  extension ; un onglet en veille, une page interne ou la fenêtre surgissante
  n'en sont pas.
- Chromium expose aussi `browser`, objet distinct de `chrome` : les deux sont
  complétés (uBlock Origin Lite utilise `self.browser || self.chrome`).

Un script de préchargement n'atteint pas le monde isolé des **scripts de
contenu**, qui gardent les API d'Electron (`runtime`, `storage`, `i18n`). Pour
`storage.sync`, que beaucoup utilisent (c'est la zone par défaut de Plasmo), le
correctif y est donc injecté par le service worker de l'extension lui-même, à
chaque page chargée (`scripting.executeScript`, monde `ISOLATED`) : cela vaut
pour les extensions Manifest V3 qui ont « scripting » et « storage ». Une page
ouverte avant l'installation de l'extension n'est corrigée qu'après
rechargement. Une écriture faite par un script de contenu n'est annoncée au
service worker que si une page de l'extension est ouverte.

Un service worker qui n'a pas encore tourné depuis le chargement de l'extension
(démarrage d'Orbe) est lancé au premier événement, qui lui est remis une fois
ses écouteurs posés.

`chrome-extension://` est déclaré « standard » dans `sessions.js` : sans cela
Electron refuse aux pages d'extension le système de fichiers du web
(`webkitRequestFileSystem`, `navigator.storage.getDirectory`), où GoFullPage
range ses captures.

### API fournies

| Espace | Ce qui est fait |
| --- | --- |
| `permissions` | `contains`, `getAll`, `request`, `remove`, `onAdded`, `onRemoved`. Une autorisation optionnelle est demandée à l'utilisateur, puis retenue (`Extensions/api-state.json`). Une **origine** hors du manifeste est refusée : Electron ne sait pas l'accorder après coup. |
| `tabs` | `query` (onglet actif, fenêtre courante, motifs d'URL…), `get`, `getCurrent`, `create`, `remove`, `update`, `reload`, `duplicate`, `goBack`, `goForward`, `captureVisibleTab`, `onCreated`, `onUpdated`, `onActivated`, `onRemoved`. `url` et `title` ne sont donnés qu'avec `tabs`, un accès au site ou `activeTab`. `getZoom`/`setZoom` agissent sur l'onglet d'Orbe ; `captureVisibleTab` est limité à deux appels par seconde, comme dans Chrome ; `group`/`ungroup` : voir `tabGroups`. `sendMessage` et `connect` sont ceux d'Electron. |
| `windows` | `get`, `getCurrent`, `getLastFocused`, `getAll`, `update` (premier plan), `onFocusChanged`, `onCreated`, `onRemoved`. `create` ouvre les adresses en onglets ; `remove` est refusé. |
| `cookies` | `get`, `getAll`, `set`, `remove`, `getAllCookieStores`, `onChanged`, limités aux sites du manifeste. |
| `contextMenus` | `create`, `update`, `remove`, `removeAll`, `onClicked` (et `onclick` en Manifest V2). Les éléments s'ajoutent au menu contextuel des pages. |
| `action` (`browserAction`, `pageAction`) | titre, pastille, couleurs, icône, fenêtre surgissante, activation, par onglet ou globalement ; `openPopup`, `onClicked`. |
| `storage` | `managed` rend un objet vide (aucune stratégie d'entreprise). `sync` devient une zone locale à part (Electron la refuse), séparée de `local`. `onChanged`, qu'Electron n'envoie jamais à un service worker, y est reconstitué : le service worker annonce ses propres écritures et reçoit celles des pages de l'extension. |
| `webNavigation` | `onBeforeNavigate`, `onCommitted`, `onDOMContentLoaded`, `onCompleted`, `onHistoryStateUpdated`, `getFrame`, `getAllFrames`. |
| `notifications` | minimum : `create`/`clear`/`onClicked`. |
| `downloads` | `download` (adresse web, `data:`, ou `blob:` de l'extension ; `filename` réduit à un nom de fichier, dans le dossier des téléchargements), `search`, `show`, `onCreated`, `onChanged`. |
| `fontSettings` | `getFontList` (liste fixe). |
| `commands` | `getAll`, `onCommand`. Les raccourcis du manifeste (`suggested_key`) sont lus dans les vues d'Orbe (`before-input-event`) : rien n'est enregistré auprès du système, ils ne valent que quand Orbe a le clavier. Un raccourci déjà pris par Orbe n'est pas attribué (`shortcut` vide). `_execute_action` vaut un clic sur le bouton. |
| `sidePanel` | `setOptions`, `getOptions`, `open`, `close`, `setPanelBehavior`, `getPanelBehavior`, `getLayout`, `onOpened`, `onClosed` ; `side_panel.default_path` du manifeste ; `runtime.getContexts` annonce le panneau (`SIDE_PANEL`). Voir « Panneau latéral ». |
| `debugger` | `attach`, `detach`, `sendCommand`, `getTargets`, `onEvent`, `onDetach`, sur les onglets seulement. Voir « Débogueur ». |
| `tabGroups`, `tabs.group` | groupes tenus en mémoire (`get`, `query`, `update`, `move`, événements, `groupId` des onglets). Orbe ne les dessine pas : ses onglets se rangent en Espaces et en dossiers. |
| `identity` | `launchWebAuthFlow` : petite fenêtre dans la session du profil, refermée dès que la page va vers `https://<id>.chromiumapp.org/…`, adresse rendue à l'extension (sans `interactive`, fenêtre invisible et « User interaction required » si rien ne redirige) ; `getRedirectURL`. `getAuthToken` est refusé : Orbe n'a pas de compte Google. |
| `activeTab` | voir « Accès à l'onglet en cours ». |
| `runtime`, `extension` | `openOptionsPage` (dans un onglet), `isAllowedIncognitoAccess`, `isAllowedFileSchemeAccess`. |

Un espace de noms n'apparaît que si le manifeste déclare l'autorisation
correspondante, et le processus principal la revérifie à chaque appel. Absents :
messagerie native (`runtime.connectNative` échoue : Electron ne la fournit pas),
`tts`, `history`, `bookmarks`, `management` complet, accès à un site accordé
après coup (`permissions.request({ origins })`).

### Panneau latéral

```js
const { panel } = require('./ext-host');
panel.shownIn(orbeWindow)       // { extId, tabId, url, wc, view } ou null
panel.userClose(orbeWindow)     // ferme le panneau affiché
panel.setWidth(orbeWindow, px)  // largeur, bornée et retenue (api-state.json, `_ui.panelWidth`)
```

Le panneau est une `WebContentsView` posée à droite de la zone des pages : la
page de l'extension, dans la session du profil de l'onglet, sous un en-tête
d'Orbe (nom, fermeture) dont le bord gauche se tire pour régler la largeur
(260 px au moins, 380 par défaut). `window.js` ne sait rien du panneau : il
appelle `hooks.rightInset(fenêtre)` dans `contentRect()` — la place à laisser à
droite — et `hooks.layout(fenêtre)` à la fin de `layout()`.

Comme dans Chrome, une extension a un panneau global par fenêtre et peut en
avoir un propre à un onglet (`setOptions({ tabId, path })`, `open({ tabId })`) :
celui-ci ne se montre que sur son onglet et y remplace le panneau global.
`setOptions({ enabled: false })` referme le panneau, `window.close()` dans sa
page aussi. Avec `setPanelBehavior({ openPanelOnActionClick: true })`, le bouton
de l'extension ouvre et referme le panneau.

Écarts : `open()` ne vérifie pas qu'un geste de l'utilisateur vient d'avoir
lieu ; un `windowId` inconnu désigne la fenêtre courante (l'onglet qu'Electron
donne dans `sender.tab` porte `windowId: 0`, et des extensions le repassent tel
quel). Un panneau s'ouvre à la demande de l'extension ; Orbe n'a pas de menu
pour ouvrir le panneau d'une extension qui ne le fait pas elle-même.

### Débogueur

`chrome.debugger` passe par `webContents.debugger`. Tant qu'un onglet est
piloté, un bandeau « « Nom » pilote cet onglet (débogueur) » reste affiché en
haut de la page, avec un bouton « Arrêter » qui détache (`onDetach`,
`canceled_by_user`). Un seul débogueur par onglet : ouvrir les outils de
développement détache l'extension. Le débogueur d'Electron a plus de pouvoirs
que celui que Chrome donne aux extensions ; sont donc refusés : les domaines
`Browser`, `Tethering`, `SystemInfo`, `Tracing`, `Extensions`, tout `Target.*`
qui sort de l'onglet (`getTargets`, `attachToTarget`, `createTarget`…), et
`Page.navigate` vers autre chose qu'une adresse web.

### Accès à l'onglet en cours (`activeTab`)

Chrome ouvre l'onglet en cours à une extension le temps d'un clic sur son
bouton. Electron ne connaît pas cet accès temporaire et ne sait pas accorder un
site après le chargement : sans accès déclaré, `scripting.executeScript` est
refusé. Pour une extension qui déclare `activeTab` sans accès à tous les sites,
Orbe demande donc au premier clic s'il peut lui donner cet accès ; si oui, il
ajoute `<all_urls>` au manifeste installé (reporté à chaque mise à jour) et
recharge l'extension. La couche d'API continue de raisonner sur le manifeste
d'origine, et n'accepte une injection que dans un onglet ouvert par un geste
(clic sur le bouton, menu contextuel, raccourci), tant qu'il reste sur le même
site. Ce contrôle imite Chrome mais n'est pas une barrière : pour Chromium,
l'extension a accès à tous les sites — c'est ce que dit la question posée.

### Bouton et fenêtre surgissante

```js
const extHost = require('./ext-host');
extHost.actionsFor(orbeWindow)                 // [{ id, name, title, icon, badgeText, badgeColor, badgeTextColor, popup, enabled }]
extHost.openPopup(orbeWindow, id, { x, y })    // fenêtre ancrée, ou action.onClicked s'il n'y a pas de fenêtre
extHost.closePopup(orbeWindow)
```

Depuis l'interface : `O.send('ext:actions')` et
`O.send('ext:popup', { id, x, y })` (`x`, `y` : point dans la fenêtre). L'état
envoyé à la coque est rafraîchi quand une extension change son bouton
(`extApi.hooks.actionChanged`). La fenêtre surgissante est une fenêtre sans
cadre, enfant de la fenêtre d'Orbe, dans la session du profil de l'onglet
actif ; elle prend la taille de son contenu (800 × 600 au plus) et se ferme en
perdant le focus ou avec Échap. Le bouton lui-même reste à dessiner dans la
barre latérale ; en attendant, Réglages → Extensions → « Ouvrir ».

## Relevé sur Electron 44.7.0 (Chromium 152)

Extensions à panneau latéral, capture et débogueur (`node scripts/test-ext.js
reelles`, `ORBE_EXT=peeper,gofullpage,claude`) :

| | Avant | Avec ces API |
| --- | --- | --- |
| **CSS Peeper 1.2.3** | clic sans effet visible ; inspecteur bloqué sur son écran de présentation (`"sync" is not available`) | inspecteur dans la page (`wordpress.org` : EB Garamond / Inter, 1 868 règles, 30 feuilles) ; panneau latéral ouvert par `sidePanel.open`, pages 1102 → 714 px, lit les styles de l'onglet (`scripting.executeScript`). Dans l'extension, la vue latérale de la page inspectée est réservée aux comptes payants. |
| **GoFullPage 8.9** | « Something went wrong » (système de fichiers refusé, puis injection refusée) | page entière de `fr.wikipedia.org/wiki/Dakar` : 2204 × 44 680 px en deux images (2204 × 28 800 et 2204 × 15 880), page de résultat avec téléchargement |
| **Claude 1.0.99** | service worker arrêté : `Cannot read properties of undefined (reading 'Color')` | service worker sans erreur, raccourci ⌘E, panneau propre à l'onglet, groupe d'onglets « Claude ». S'arrête à « Se connecter » (compte payant) ; `connectNative` échoue (pas de messagerie native dans Electron). |

Trois extensions vérifiées plus tôt :

Installation réelle depuis le Store dans un profil jetable d'Orbe, pages
`fr.wikipedia.org`, `wordpress.org` et `www.lemonde.fr`.

| | Dark Reader 4.9.133 | Wappalyzer 6.12.7 | uBlock Origin Lite 2026.1006 |
| --- | --- | --- | --- |
| Signatures (développeur, Store) | valides | valides | valides |
| Service worker | démarre, sans erreur | démarre, sans erreur | démarre, sans erreur |
| Scripts de contenu | s'exécutent | s'exécutent | s'exécutent |
| Fenêtre surgissante | réglages affichés, 276 × 580 | technologies de l'onglet actif, 496 × 544 | site de l'onglet actif, mode de filtrage |
| Rechargement au démarrage suivant | oui, réglages conservés | oui | oui |

Avant la couche d'API (Electron seul) :

- **Dark Reader** : service worker arrêté sur `chrome.permissions.onRemoved`,
  feuille de secours seule, fenêtre bloquée sur « Loading, please wait ».
- **Wappalyzer** : `chrome.tabs.create is not a function`, `chrome.cookies`
  absent, « getDetections: no active tab found ».
- **uBlock Origin Lite** : tant que `browser.permissions` manque, `Cannot read
  properties of undefined (reading 'onRemoved')` et fenêtre surgissante vide.

Avec elle (`tests/ext-reelles.js`) :

- **Dark Reader** : thème dynamique sur `fr.wikipedia.org` (11 feuilles
  `darkreader--sync`, feuille de secours vidée, liens `rgb(92, 152, 214)`) ;
  le bouton du site rend la page claire (`rgb(248, 249, 250)`) puis sombre ;
  la luminosité passe de 100 à 105, s'applique (`rgb(24, 26, 27)` →
  `rgb(25, 27, 28)`) et se retrouve après redémarrage.
- **Wappalyzer** : sur `wordpress.org`, la fenêtre liste WordPress, PHP, MySQL,
  Gutenberg, Google Tag Manager… ; pastille « 10 » ; page d'accueil ouverte par
  `tabs.create` dans un onglet d'Orbe.
- **uBlock Origin Lite** : fenêtre « www.lemonde.fr — filtering mode optimal ».

## ⌘E et extension qui plante (`cycle`, `backgroundGone` dans `src/main/ext-host.js`)

- **⌘E** ouvre l'extension suivante parmi celles dont le bouton est actif pour l'onglet (sa
  fenêtre, ou son action), et referme après la dernière. Rien de plus qu'un clic sur le bouton :
  mêmes vérifications (`openPopup`), jamais en navigation privée.
- **Plantage.** Quand le processus de la page d'arrière-plan d'une extension disparaît
  (`render-process-gone` sur un `webContents` de type `backgroundPage`, raison autre qu'un arrêt
  normal), l'extension est désactivée et un message cliquable mène au volet Extensions ; la
  réactiver la relance. L'identité vient de l'adresse du `webContents` rapportée par Electron.
  **Limite** : un service worker (manifeste 3) qui plante n'est pas signalé par Electron 44 —
  `running-status-changed` ne distingue pas un arrêt d'un plantage — et Chromium le relance au
  prochain événement : rien n'est fait pour lui.

## Interface (`src/main/ext-ui.js`)

- **Bouton** : chaque extension a son bouton sous l'adresse. Clic droit : nom,
  « Options », « Détacher de la barre latérale », « Désactiver », « Retirer
  d'Orbe… » (avec confirmation), « Gérer les extensions… ». Une extension
  détachée (réglage `extHidden`) reste dans le menu du bouclier et dans le menu
  Extensions ; Réglages → Extensions la ré-épingle.
- **Réglages → Extensions** : par extension, « Ouvrir » (fenêtre), « Options »
  (page d'options, dans un onglet ; le chemin du manifeste est résolu dans
  l'origine de l'extension, refusé s'il en sort), « Épinglée », « Mettre à
  jour » (réinstallation depuis le Store, avec la même vérification de
  signature ; la version est comparée et annoncée), interrupteur, suppression.
  Une version plus ancienne que celle installée est refusée. Une version qui
  demande davantage (API, sites, scripts de contenu sur de nouveaux sites)
  n'est installée qu'après une question qui liste ces ajouts : Chromium
  accorde à une extension dépaquetée tout ce que dit son manifeste, sans rien
  demander — c'est donc avant la bascule qu'Orbe demande. Une extension à qui
  l'accès à tous les sites a déjà été donné (manifeste, ou accord `activeTab`
  d'`ext-access.js`, reporté à chaque mise à jour) n'y gagne aucun site.
- **Réglages → Raccourcis** : chaque commande déclarée (`commands` du manifeste)
  a sa ligne, avec ou sans raccourci, modifiable comme ceux d'Orbe (réglage
  `extShortcuts`, `{ '<id>/<commande>': accélérateur | '' }`). Un raccourci
  d'Orbe ou du système est refusé ou demande confirmation ; pris à une autre
  extension, la question la nomme. `chrome.commands.getAll` rend le raccourci en
  vigueur.

Ces actions ne viennent que des pages de l'interface (`orbe://`, porte IPC
`orbe`) : aucune n'est exposée aux extensions ni aux pages web.

Non fait, et pourquoi :

- **Accès par site (« au clic / sur ce site / sur tous les sites »)** : Electron
  ne sait ni restreindre ni accorder l'accès à un site après le chargement d'une
  extension (voir « Accès à l'onglet en cours »). Un réglage qui l'afficherait
  sans le garantir serait trompeur.
- **Navigation privée** : les extensions n'y sont jamais chargées (session non
  persistante ignorée par `loadInto`). Une option par extension demanderait de
  rejouer toute la couche d'API dans une session jetable ; elle n'est pas faite.
- **Mise à jour automatique** : à la demande seulement.

Reste à faire : accès aux sites
accordé après coup (`permissions.request({ origins })`, modes « complet »
d'uBlock Origin Lite), messagerie native, retirer dans les Réglages un accès
`activeTab` accordé, dessiner les groupes d'onglets.
