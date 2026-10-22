# Sécurité de la navigation de tous les jours

Notes de menace, fonction par fonction, pour ce qu'un navigateur doit décider
à la place de l'utilisateur ou lui demander : autorisations, partage d'écran,
certificats, identifiants HTTP, « quitter la page ? », fenêtres surgissantes,
téléchargements, liens vers d'autres applications.

Principes communs à tout ce qui suit :

- **La décision se prend dans le processus principal**, à partir de ce
  qu'Electron rapporte (origine du cadre demandeur, hôte, certificat, session).
  Jamais d'après un texte fourni par la page.
- **Ce qui vient du site est affiché comme du texte** (`textContent`), tronqué,
  et présenté comme une citation quand c'est le site qui l'a choisi (domaine
  d'authentification, nom d'une fenêtre, adresse d'un lien).
- **Rien n'affaiblit l'existant** : les pages web n'ont toujours ni
  préchargement privilégié ni `window.orbe` ; le gestionnaire de mots de passe
  et l'isolement des extensions ne sont pas touchés.

## Feuilles d'onglet (`src/main/sheets.js`, `src/renderer/sheet.*`)

Toutes les questions liées à une page passent par une « feuille » : une vue
d'Orbe (`orbe://app/sheet.html`, son propre `webContents`) posée par-dessus
l'onglet concerné, aux dimensions exactes de sa page.

| Menace | Réponse |
| --- | --- |
| La page imite la question (fausse fenêtre dessinée en HTML) | La vraie feuille n'est pas dans la page : elle couvre toute la page et suit l'onglet. Limite : rien n'empêche une page de dessiner une imitation ; elle ne peut pas en obtenir d'effet, aucune décision ne passant par elle. |
| La page répond à la place de l'utilisateur | La réponse (`sheet:answer`) n'est acceptée que de la vue de la feuille, reconnue à son `webContents` ; une page web n'a aucun canal vers le processus principal. Vérifié : « une page ne peut pas répondre à la place de la feuille ». |
| Clic piégé (la page fait cliquer au moment où la feuille apparaît) | Une réponse qui engage (autoriser, partager, continuer, se connecter, ouvrir) est refusée **par le processus principal** pendant 500 ms à compter du moment où la feuille devient visible — y compris quand elle réapparaît parce que celle du dessus s'est fermée, ou au retour sur l'onglet. La vue applique le même délai, remis à zéro par le processus principal. Une feuille non visible ne peut pas être validée. |
| La page ferme ou recouvre la feuille | La feuille est une vue native au-dessus de la page ; la page ne peut ni la fermer ni dessiner par-dessus. |
| Une réponse sert à une autre page | Une feuille se ferme sans réponse quand son onglet change de page (début d'une navigation, **ou arrivée d'une navigation lancée avant elle**) ou disparaît. Avant de retenir une réponse ou d'ouvrir un lien, Orbe vérifie que la page (ou le cadre) qui demandait est toujours là, avec la même origine. |
| Une page noie l'utilisateur sous les feuilles | Quatre feuilles au plus par onglet ; au-delà la demande est refusée. |
| Un autre onglet usurpe la demande | La feuille n'est visible que sur l'onglet demandeur, et nomme l'origine rapportée par Electron. |

Les pages qui ne sont pas des onglets (aperçu, petite fenêtre) n'ont pas de
feuille : la demande est refusée, ou passe par une boîte de dialogue du système
pour les autorisations simples.

## Caméra, micro et autres autorisations (`src/main/permissions.js`)

- Question par origine du **cadre demandeur** ; si elle vient d'un cadre
  intégré, la feuille dit dans quel site.
- Caméra et micro sont deux autorisations distinctes (la clé commune `media`
  des anciennes versions est encore lue). Une origine opaque (`file:`, `data:`)
  n'est jamais retenue.
- Navigation privée : réponses en mémoire seulement. **Chaque profil a ses
  propres réponses** (`store.state.permissions` pour le profil par défaut,
  `profilePermissions[id]` pour les autres) : un accord donné dans un profil ne
  vaut pas dans un autre.
- Caméra et micro demandés par un **cadre intégré à un autre site** : la
  réponse ne vaut que pour le couple (site intégré, site qui l'intègre). Un site
  hostile qui intègre un service déjà autorisé ailleurs (avec `allow="camera"`)
  fait donc réapparaître la question, qui nomme les deux sites.
- **Accord du système** (macOS : `askForMediaAccess` ; Windows : réglage de
  confidentialité) demandé *après* l'accord du site ; s'il manque, la page
  n'obtient rien et une feuille dit lequel manque et ouvre les réglages.
- **Témoin** (`src/main/capture-state.js`) : allumé quand Orbe accorde l'accès,
  éteint quand la page est remplacée, détruite ou arrêtée par l'utilisateur.
  Electron ne dit pas si un flux est encore ouvert : le témoin peut donc rester
  allumé après qu'une page a rendu la caméra, jamais l'inverse. Un témoin
  qu'une page pourrait éteindre ne vaudrait rien, d'où ce choix. « Arrêter »
  recharge la page : c'est le seul arrêt garanti.
- Appareils USB, HID, série, Bluetooth : aucun n'est jamais accordé. Sans
  écouteur, Electron choisirait **le premier appareil** (Bluetooth) : Orbe
  annule la demande et le dit.

- **Autres autorisations demandées** : détection d'inactivité (`idle-detection`), stockage
  durable (`persistent-storage`), accès d'un cadre intégré à ses propres cookies
  (`storage-access`). Ce dernier, comme la caméra et le micro, ne vaut que pour le couple
  (site intégré, site qui l'intègre).
- La demande est une **bulle ancrée** en haut de la page, du côté de l'adresse. La vue de la
  feuille couvre toujours toute la page (la page ne reçoit aucun clic tant qu'elle est là) :
  seule la carte a changé de place.

## Centre de contrôle du site (`siteControl` dans `src/main/essentials.js`)

Le panneau qu'ouvre le bouclier : bloqueur, autorisations, cookies et données, cache, Boost,
mode développeur, extensions, copie du lien. C'est une feuille d'onglet (`sheets.js`), avec
toutes ses garanties.

| Menace | Réponse |
| --- | --- |
| La page fournit ce que le panneau affiche | Tout vient du processus principal : origine de l'adresse **engagée** par l'onglet (`webContents.getURL()`), compteur du bloqueur, autorisations retenues, cookies comptés dans la session, réglages. Le nom du site et le nom d'une extension (choisis par d'autres) sont affichés par `textContent`. Vérifié avec un nom d'extension piégé. |
| L'action vaut pour un autre site que celui affiché à l'ouverture | Chaque action est revérifiée **au moment où elle arrive** : l'onglet du panneau existe encore, il est l'onglet actif de sa fenêtre, et l'origine de son adresse engagée est celle pour laquelle le panneau a été dressé. Sinon rien n'est fait et le panneau se ferme. Le panneau se ferme aussi de lui-même à toute navigation de l'onglet. Vérifié en neutralisant cette fermeture puis en changeant l'onglet de site : aucun cookie effacé, ni d'un côté ni de l'autre. |
| La page actionne le panneau, le recouvre ou y fait cliquer | Vue d'Orbe posée sur la page : la page n'y a ni accès ni canal (un message `sheet:act` venu d'une page est sans effet : vérifié). Les actions qui changent quelque chose (bloqueur, autorisations, cookies, cache, Boost, mode développeur) sont refusées par le processus principal pendant la demi-seconde qui suit l'apparition du panneau, comme les réponses des feuilles. |
| Une extension se fait ouvrir par un identifiant forgé | Seule une extension présente dans la liste du moment, et active, peut être ouverte ; le panneau ne transmet qu'un identifiant, relu dans cette liste. |
| « Effacer » emporte plus que demandé | Cookies et données : l'origine de l'onglet seulement (`clearStorageData({ origin })`). Le cache HTTP n'est pas rangé par site dans Chromium : le bouton dit qu'il vide celui de tout le profil. |

Ce que le panneau ne propose pas : accès des extensions site par site et extensions en
navigation privée, qu'Electron ne permet pas de faire respecter (voir `docs/extensions.md`).

## Téléchargements multiples (`downloadGate` dans `src/main/permissions.js`)

Une page peut lancer un téléchargement que personne n'a demandé ; au **deuxième**, Orbe pose
la question (« Télécharger plusieurs fichiers à la suite »), retenue par site comme les autres
autorisations. Est « demandé » : un téléchargement que le moteur rattache à un geste, celui
qui suit un geste dans l'onglet de moins de cinq secondes (un seul par geste), et ceux
qu'Orbe lance lui-même (« Enregistrer l'image »). La décision est synchrone (`will-download`) :
le téléchargement qui déclenche la question est refusé, puis relancé si la réponse est oui et
que la page est toujours là. Une seule question par page ; un refus vaut pour le site.

## Mode développeur automatique (`devAuto` dans `src/main/prefs.js`)

Sur `localhost`, `*.localhost`, `127.0.0.1` et `::1`, la barre d'outils et l'adresse entière
s'affichent d'elles-mêmes, avec un liseré jaune et noir. Cela ne donne **aucun droit** au
site : le mode développeur ne change que ce qu'Orbe affiche. Un nom qui ressemble à
`localhost` (`localhost.exemple.fr`) n'est pas un site local.

## Partage d'écran (`src/main/display-media.js`)

| Menace | Réponse |
| --- | --- |
| Capture sans consentement | Aucune autorisation retenue : chaque partage passe par le sélecteur. La demande doit venir d'un geste (`request.userGesture`). |
| La feuille renvoie une source arbitraire | Elle ne renvoie qu'un identifiant ; il est relu dans la liste dressée par le processus principal. Une source hors liste est refusée (vérifié). |
| Nom de fenêtre piégé (HTML) | Affiché comme du texte. |
| Vignettes : fuite vers la page | Les vignettes ne vont qu'à la feuille d'Orbe, jamais à la page. |
| Le son du système part sans le dire | Case décochée par défaut, proposée seulement là où c'est possible (onglet ; écran sous Windows). |

Sans l'accord de macOS pour l'enregistrement de l'écran, seul « Cet onglet »
est utilisable ; le sélecteur l'explique et ouvre les réglages.

### L'ancienne capture d'écran (`getUserMedia` + `chromeMediaSource`)

Relevé par essai sur Electron 44.7 (revue de sécurité du 9 octobre 2026) :

- `getDisplayMedia` arrive d'abord au gestionnaire d'autorisations comme une
  demande `media` **sans** `mediaTypes`, puis au sélecteur ;
- `getUserMedia({ video: { mandatory: { chromeMediaSource: 'desktop' } } })`
  (avec ou sans identifiant de source, ou `'screen'`, ou `'tab'`) arrive sous la
  **même** forme, sans geste… et, si la réponse est « oui », Electron livre
  aussitôt le flux — écran entier, 3456 × 2234 lors de l'essai — **sans appeler
  le sélecteur** ;
- répondre « non » refuse aussi `getDisplayMedia` ; rien, dans la demande, ne
  distingue les deux ;
- pour un vrai `getDisplayMedia`, le sélecteur est appelé **pendant** l'appel
  `callback(true)` (de façon synchrone).

Réponse d'Orbe (`displayGate`, `answerDisplay` dans `permissions.js`) :

1. la demande est refusée si la page n'est pas un onglet, ou si l'utilisateur
   n'y a pas agi dans les 5 secondes (vraie entrée vue par le processus
   principal). Une page ne peut donc rien obtenir sans un clic ou une frappe ;
2. sinon Orbe répond « oui » et regarde si le sélecteur a été appelé avant le
   retour de l'appel. S'il ne l'a pas été, c'était l'ancienne capture : tous
   les processus de la page (cadres compris) sont **arrêtés sur-le-champ**,
   dans le même tour de boucle, avant que le flux — dont l'ouverture demande
   plusieurs allers-retours entre processus — n'arrive à la page. Un message
   le dit ; la page plantée peut être rechargée.

Limite assumée : la seconde étape est une course gagnée par construction
(l'arrêt est synchrone, l'ouverture du flux ne l'est pas), pas une
impossibilité. Aucun site ordinaire n'emploie cet appel (dans Chrome il est
réservé aux extensions). Si une version d'Electron appelait un jour le
sélecteur de façon différée, l'essai « le partage d'écran par le sélecteur
fonctionne toujours » échouerait aussitôt.

## Certificats (`src/main/certs.js`)

- Un certificat refusé par Chromium **reste refusé** : Orbe ne répond « oui »
  à `certificate-error` que pour une exception posée par l'utilisateur.
- L'exception vaut pour **un hôte (avec son port) + l'empreinte de ce
  certificat + la session en cours**. Elle n'est jamais écrite sur disque
  (vérifié) et ne passe pas d'un profil ou d'une fenêtre privée à l'autre.
  La retirer coupe les connexions ouvertes (`closeAllConnections`), sinon
  Chromium continuerait à s'en servir.
- « Continuer quand même » n'est **pas proposé** pour un certificat révoqué
  (−206), invalide (−207) ou incohérent (−203), la transparence exigée (−214),
  une interception connue (−217), ni pour un site qui impose HTTPS (**HSTS**).
  Electron n'expose pas l'état HSTS : Orbe le lit par une sonde, une requête
  `HEAD http://hôte/` sans cookies ni suivi de redirection dans la session ; un
  site HSTS répond par une redirection interne de Chromium (307,
  `Non-Authoritative-Reason: HSTS`) avant tout échange.
- **Vérifié par essai** (hôte de la liste préchargée détourné vers un serveur
  local par `--host-resolver-rules`) : la sonde répond « HSTS » en quelques
  millisecondes sans trafic ; Electron 44 émet bien `certificate-error` pour un
  site HSTS, et **`callback(true)` passerait outre HSTS**. La sonde d'Orbe est
  donc la seule barrière : elle **échoue fermée**. Seule une preuve que le site
  n'impose pas HTTPS rend « continuer » possible — une réponse HTTP, une
  redirection ordinaire, ou une erreur de transport en HTTP simple (connexion
  refusée, nom introuvable… : la demande est partie en clair, donc Chromium ne
  l'a pas convertie). Délai dépassé (1,5 s), demande bloquée ou annulée : pas
  de « continuer ». Conséquence : un hôte dont le port 80 ne répond pas du tout
  (pare-feu qui avale les paquets) ne peut pas être accepté malgré son
  certificat. Limite : pour un site sans HSTS, la sonde peut ouvrir une
  connexion HTTP vers l'hôte déjà contacté (abandonnée aussitôt).
- La pastille dit « Non sécurisé » dès le refus du certificat (pendant la
  sonde, et si une autre navigation part avant sa fin), et tant qu'un
  avertissement attend, même recouvert par une autre feuille.
- Le choix par défaut de l'avertissement est « Revenir en lieu sûr » ;
  « Continuer » est derrière « Détails » et soumis au délai anti-clic.
- La pastille d'adresse reste « Non sécurisé » tant que l'exception existe.
- `setCertificateVerifyProc` ne sert qu'à relever le certificat présenté
  (pour le résumé) : il répond toujours −3, « décision de Chromium ».

## Authentification HTTP et certificats clients (`src/main/auth.js`)

- La feuille nomme l'hôte donné par Electron (`authInfo`) ; le domaine (realm)
  est cité comme message du serveur.
- Quand c'est **la page en cours de chargement** qui demande (reconnue à
  l'adresse de la navigation principale en cours, suivie par Orbe), la feuille
  **couvre entièrement l'ancienne page** et affiche l'adresse demandée : la
  question ne peut pas passer pour celle du site encore affiché.
- Un **cadre ou une ressource d'un autre hôte** que la page (publicité, image,
  script, requête) ne fait pas apparaître la question : demande annulée
  (hameçonnage classique). Un cadre du même hôte le peut.
- En HTTP simple, la feuille prévient que le mot de passe partira en clair.
- Rien n'est retenu par Orbe (Chromium garde l'identification pour la session).
- **À faire** : proposer les comptes du gestionnaire de mots de passe. Il
  faudrait une clé « hôte + domaine » et passer par le déverrouillage du
  coffre ; ce n'est ni trivial ni sans risque, donc laissé de côté.
- Certificat client : Electron enverrait le premier du trousseau ; Orbe n'en
  envoie aucun sans un choix explicite.

## « Quitter la page ? » (`src/main/unload.js`)

- Texte fixe, boîte de dialogue du système ; le texte voulu par la page est
  ignoré. « Rester » est le choix par défaut.
- Chromium n'émet l'événement que si l'utilisateur a agi dans la page : une
  page jamais touchée ne peut retenir ni un onglet ni une fenêtre.
- Une page qui ne répond pas ne retient rien (délai de 4 s). Ce délai est celui
  d'Orbe : Chromium, lui, ferme d'office une page consultée qui n'a pas répondu
  en une seconde, puis de nouveau une seconde après la réponse de l'utilisateur
  si la page tarde à en accuser réception. Sur une machine chargée, la page
  disparaissait donc juste après « Rester ». Chromium n'applique pas ce délai à
  une page dont le débogueur est attaché : Orbe attache celui d'Electron, sans
  rien lui demander, le temps de la consultation (« bouclier », `shield`), et le
  rend dès que la page a répondu (au plus dix secondes). Une extension ou la
  capture de page entière qui veut le débogueur à cet instant le reçoit.
- Si une page disparaît malgré tout dans les quinze secondes qui suivent
  « Rester » sans qu'Orbe l'ait demandé, son onglet garde sa ligne et se
  recharge : il n'est pas archivé comme une page qui se ferme d'elle-même, et le
  journal de la page est écrit dans la console.
- Veille automatique et fermeture demandée en même temps sur la même page : la
  réponse de la page vaut pour la demande de l'utilisateur, la question est posée.
- Limite connue : un aperçu ou une petite fenêtre se ferment sans consulter la page.
- Pas de boîtes en rafale (elles bloquent toute l'application) : pendant les
  2 secondes qui suivent « Rester », une nouvelle tentative de quitter la même
  page est refusée sans rien demander. « Quitter la page » reste toujours
  possible à la boîte suivante.
- L'archivage automatique des vieux onglets et la mise en veille ne posent pas
  la question (pas de boîte de dialogue surgie de nulle part).

## Fenêtres surgissantes (`src/main/popups.js`)

Electron 44 ne dit pas à `setWindowOpenHandler` si l'ouverture vient d'un
geste, et n'embarque pas le bloqueur de Chrome. Heuristique d'Orbe :

- un geste = une vraie entrée reçue par la page (`before-mouse-event`,
  `before-input-event`), qu'un script ne peut pas fabriquer ;
- il vaut 5 s (activation passagère de Chromium : laisse passer les connexions
  OAuth qui ouvrent leur fenêtre après un aller-retour réseau) et il est
  **consommé** par l'ouverture : un clic ouvre une fenêtre, une seule (le
  relâchement du bouton ne redonne pas de geste si l'appui a déjà servi) ;
- il **ne survit pas à un changement de page** ;
- « Toujours autoriser pour ce site » est une autorisation par origine,
  visible et réinitialisable dans les informations du site.

Limites : le geste profite à tous les cadres de la page pendant 5 s (Chromium
suit l'activation cadre par cadre) ; « Ouvrir quand même » ouvre l'adresse dans
un onglet sans lien `window.opener` avec la page.

## Téléchargements (`src/main/downloads.js`)

- Nom proposé par le site réduit à un simple nom ; jamais d'écrasement. Le nom
  qu'une **extension** impose (`chrome.downloads.download({ filename })`) passe
  par le même traitement (`rename` : `safeName`, dossier déjà choisi, numéro si
  le fichier existe) ; si l'utilisateur a choisi lui-même l'emplacement
  (« toujours demander »), l'extension ne le change pas.
- L'enregistrement de la Bibliothèque décrit le fichier **réellement écrit** :
  à la fin du téléchargement, le chemin est relu sur l'objet d'Electron
  (`item.getSavePath()`), et le nom, le caractère « exécutable » et la marque
  « venu d'Internet » portent sur ce fichier-là. (Avant : le chemin noté à
  « will-download » restait, alors qu'une extension pouvait le changer juste
  après — la marque partait sur un fichier qui n'existait pas, et un
  exécutable renommé n'était plus signalé.)
- Fichiers exécutables (`.dmg`, `.pkg`, `.exe`, `.app`, `.command`, scripts…) :
  signalés, jamais ouverts automatiquement ; les ouvrir depuis Orbe demande
  une confirmation qui nomme l'hôte d'origine.
- Seuls les PDF s'ouvrent seuls, dans la visionneuse de Chromium (bac à
  sable), jamais dans une application du système. « PDF » se juge sur le
  fichier enregistré : extension `.pdf` **et** contenu qui commence par
  `%PDF-`. Le type annoncé par le serveur ne compte jamais : un fichier
  `.html` servi comme `application/pdf` serait sinon ouvert en `file://` dans
  un onglet (trouvé par la revue de sécurité, corrigé et couvert par un essai).
  L'ouverture automatique exige en plus que le téléchargement vienne d'un
  geste de l'utilisateur (`DownloadItem.hasUserGesture()`).
- « Exécutable » se juge au moment d'ouvrir, sur le fichier tel qu'il est sur
  disque ; les caractères invisibles (inversion du sens de lecture, espaces de
  largeur nulle) et les points ou espaces en fin de nom sont retirés avant de
  lire l'extension. La liste couvre aussi les scripts et raccourcis de Windows
  (`.js`, `.vb`, `.chm`, `.settingcontent-ms`, `.xll`, `.vhdx`…) et de macOS
  (`.inetloc`, `.fileloc`, `.mobileconfig`, `.prefpane`, `.xip`).
- « Toujours demander » : sans geste de l'utilisateur, une page n'obtient pas
  deux fenêtres d'enregistrement à moins de 10 s d'intervalle.
- Reprise : même session (mêmes cookies) que le téléchargement d'origine ;
  validée par Chromium avec `ETag` / `Last-Modified`.
- Marque « venu d'Internet » : Electron ne la pose pas, Orbe le fait à la fin de
  chaque téléchargement (`quarantine`) — attribut `com.apple.quarantine` sur
  macOS, flux `Zone.Identifier` (zone 3) sur Windows — pour que le système
  avertisse à l'ouverture (Gatekeeper, SmartScreen). En navigation privée,
  l'adresse d'origine n'est pas écrite à côté du fichier.
  - Elle est posée **avant** que le téléchargement soit annoncé terminé (liste,
    notification, ouverture automatique d'un PDF) : rien n'ouvre le fichier
    entre-temps.
  - Si elle ne peut pas être posée (disque qui ne garde pas les attributs,
    `xattr` en échec), une seconde tentative est faite ; en cas de nouvel
    échec le fichier est noté **sans marque** (`marked: false`). Il n'est
    alors jamais ouvert d'office, la Bibliothèque le signale, et l'ouvrir, le
    copier, le partager ou le glisser hors d'Orbe repose d'abord la marque
    puis, si elle manque toujours, demande confirmation (le glisser, qui ne
    peut pas attendre une réponse, est refusé tant que l'accord n'a pas été
    donné).
  - « Enregistrer la page » : Electron ne l'annonce pas par « will-download »
    (vérifié par essai). La page et le contenu de son dossier « …_files » sont
    marqués un par un (`markTree`).
  - Fichiers écrits par l'API de téléchargement des extensions : ce sont des
    téléchargements de la session, marqués comme les autres.
- « Copier » un fichier téléchargé : une image n'est décodée dans le processus
  principal que si elle fait moins de 32 Mo, que son en-tête (lu sans la
  décoder) annonce au plus 16 384 points de côté et 64 millions de points, et
  qu'elle n'est ni exécutable ni sans marque ; sinon c'est le fichier qui est
  copié, sans être lu. L'icône du système (`app.getFileIcon`, pour le glisser)
  n'est jamais demandée pour un exécutable ou un fichier sans marque : le
  système lirait le fichier lui-même (icône d'un `.exe`, cible d'un raccourci).
- Bibliothèque : le menu d'un fichier, la corbeille, la copie et le glisser hors
  d'Orbe ne reçoivent de la page qu'un identifiant de téléchargement ; le chemin
  vient toujours des données d'Orbe (`library.js`, `downloads.js`).
- Quitter pendant un téléchargement en cours demande confirmation.

## Liens vers d'autres applications (`permissions.js`, `openExternal`)

- Toujours une question, qui montre l'adresse et le site demandeur.
- « Toujours autoriser » se retient par **site + schéma**, et reste limité à
  une ouverture toutes les 3 s par page (sinon la question revient). Le site
  est celui du **cadre qui lance le lien** : vérifié par essai, un cadre
  publicitaire qui fait `top.location = 'schéma:…'` est vu par Electron comme
  le demandeur (`requestingUrl` = son adresse, `isMainFrame: false`) ; il
  n'hérite donc pas de l'accord donné au site qui l'intègre, et la feuille dit
  qu'il est intégré.
- « Annuler » vaut pour ce schéma tant que l'onglet reste sur la page ; sans
  geste récent de l'utilisateur, une page ne fait apparaître la question
  qu'une fois (une page d'invitation qui lance son application reste
  possible, pas une boucle).
- Schémas jamais transmis au système : `file:`, `javascript:`, `data:`,
  `ms-msdt:`, `search-ms:`, `ms-officecmd:`, `shell:`, `smb:`… (liste dans
  `BLOCKED_SCHEMES`).
- Orbe ouvre le lien lui-même (`shell.openExternal`) et répond toujours « non »
  à Chromium : une seule porte, vérifiable.

## Boosts (`src/main/boosts.js`, `src/main/boost-editor.js`)

Un Boost est du contenu écrit par l'utilisateur — ou reçu d'un fichier — et
injecté dans les pages d'un site : apparence, éléments masqués, CSS, et
JavaScript si l'utilisateur l'a permis.

| Menace | Réponse |
| --- | --- |
| Le script d'un Boost atteint Orbe (pont `window.orbe`, Node) | Il s'exécute dans le **monde principal de la page** (`frame.executeJavaScript`), celui des scripts du site : il a les droits de la page, rien de plus. Les pages web n'ont ni préchargement privilégié ni `window.orbe`. Vérifié : `typeof window.orbe`, `require` et `process` valent `undefined` dans le script. |
| Le script s'exécute ailleurs que sur son site | Le site est relu **dans le processus principal, sur le cadre principal, au moment d'exécuter** (`hostOf(frame.url)`), jamais d'après la page. Le script part une fois par chargement (`dom-ready`), dans le cadre principal seulement — pas dans les cadres intégrés. Entre cette vérification et l'exécution la page peut encore changer : le script commence donc par vérifier **dans la page** (`scriptCode`) que `location.host` et le protocole sont ceux qui ont été vérifiés, et ne fait rien sinon. |
| Le CSS d'un Boost atterrit dans la page d'un autre site (navigation pendant l'insertion) | Le site est celui du **document en place** dans le cadre principal (`mainFrame.url`), pas celui d'une navigation en attente (`getURL()`). Il est vérifié juste avant `insertCSS` et juste après : si la page a changé de site entre-temps, le CSS est retiré aussitôt. À chaque changement de document (`did-navigate`), le CSS posé pour un autre site est retiré. |
| Page « http: » : le réseau peut servir autre chose que le site, sous son nom | Les Boosts sont rangés par nom d'hôte, sans le protocole. Le **script** d'un Boost ne part donc jamais sur une page `http:` (sauf la machine elle-même : `localhost`, `127.0.0.1`, `*.localhost`). Le CSS, l'apparence et les éléments masqués restent appliqués en `http:` — c'est le choix le plus strict qui laisse les Boosts utilisables. |
| Navigation privée | Aucun chemin n'y applique un Boost : chargement, réglages, éditeur, centre de contrôle et Bibliothèque passent tous par `applyBoosts`, qui écarte fenêtres privées et pages internes (la Bibliothèque avait son propre chemin, sans ce filtre : corrigé). |
| Le script s'exécute dans une page d'Orbe, une feuille, un aperçu, une petite fenêtre | `canScript` n'accepte que la page web d'un onglet ordinaire : ni page interne (`orbe://`), ni navigation privée ; aperçus, petites fenêtres, feuilles et vues de l'interface ne sont pas des onglets et ne reçoivent ni CSS ni script. Vérifié cas par cas. |
| Un script s'exécute sans que l'utilisateur l'ait voulu | Trois accords : les Boosts sont actifs, le réglage « Autoriser le JavaScript des Boosts » est coché (**décoché par défaut**), et la case du Boost l'est aussi. |
| Un Boost importé exécute du code, ou vole des données par son CSS (sélecteurs d'attributs + images distantes) | À l'import **rien n'est appliqué ni exécuté** : le Boost arrive désactivé, son script coupé, et ne remplace jamais un Boost existant. Le fichier est du JSON borné (2 Mo, 300 Boosts) ; seuls les champs connus sont lus, chacun borné. Il arrive aussi **« à relire »** (`review`) : tant qu'il l'est, aucun message ne peut l'activer ni armer son script (`boosts.set` le refuse). La première activation passe par une étape de relecture (liste des Boosts, éditeur, Bibliothèque) qui montre son CSS, ses éléments masqués et son script tels quels, avec un avertissement explicite quand le CSS contient `url(` ou `@import` (adresses chargées à chaque visite, choisies par l'auteur du fichier). « Activer ce Boost » l'active ; le script reste coupé (case à part). Un Boost revenu d'une sauvegarde après avoir été supprimé ou modifié suit le même chemin. |
| Sélecteur de « Zap » piégé (venu de la page cliquée ou d'un fichier) qui ferme la règle et injecte du CSS | `validSelector` : ni accolade, ni point-virgule, ni arobase, ni commentaire ; parenthèses, crochets et guillemets fermés ; pas de virgule hors parenthèses ; 500 caractères au plus ; **pas de `url(`**, même échappé (`\75rl(`) — le moteur CSS lit ce qui suit `url(` comme une adresse sans guillemets, où parenthèses et guillemets ne se comptent plus comme le fait ce filtre. En plus du filtre, chaque sélecteur venu de la page ou d'un fichier est **lu par le moteur CSS lui-même** (`vet` : `CSSStyleSheet.replaceSync` puis `document.querySelector`, dans la coque d'une fenêtre — page de l'interface en bac à sable —, jamais dans la page qui l'a fourni) : il doit donner exactement une règle, qui ne fait que masquer. Une règle par sélecteur. |
| La page cliquée au « Zap » rend un sélecteur qui masque tout (`html`, `body`, `*`, `:root`) | `tooBroad` : refusé, seul, enchaîné (`html > body`, `body *`) ou habillé (`body:not(.x)`, `:is(body, .a)`). Le sélecteur d'élément est lancé **sans** « geste de l'utilisateur » prêté à la page (`executeJavaScript(…, false)`) : il n'en a pas besoin, et la page n'en hérite pas. |
| Valeur d'apparence piégée (couleur, police, taille…) | Le CSS de l'apparence est **fabriqué** par Orbe à partir de nombres bornés et de valeurs prises dans une liste ; aucun texte du Boost n'y est recopié. |
| Une page web écrit ou lit des Boosts | Les messages `boost:*` ne sont acceptés que de la **fenêtre de l'éditeur** (reconnue à son `webContents`). L'éditeur est lié au site de l'onglet à son ouverture : si l'onglet change de site, rien n'est écrit pour le nouveau. Le sélecteur rendu par la page au « Zap » est rangé pour le site que le processus principal voit affiché. |
| L'éditeur est pointé sur un autre Boost pendant qu'un enregistrement différé de l'ancien site est en route | Chaque message de l'éditeur d'un site (`boost:set`, `zap`, `reset`, `reload`, `export`) **nomme le site** qu'il croit modifier ; le processus principal refuse celui qui ne correspond plus au site de l'éditeur. La page relève ce nom à la frappe, pas à l'envoi. |
| Retirer un Boost | Décocher, « Tout réinitialiser » ou supprimer depuis la liste retire le CSS aussitôt. Un script déjà exécuté ne se « retire » pas : il faut recharger la page (bouton de l'éditeur) — c'est dit dans l'éditeur. |

Limites assumées : le CSS libre d'un Boost est du CSS quelconque (`@import`,
images distantes) — c'est le but de la fonction ; un Boost activé par
l'utilisateur a donc sur son site le pouvoir d'une feuille de style
d'utilisateur. « Traduire la page » (menu de page) transmet l'adresse de la
page au service de traduction de Google, sur un clic seulement.

## Sauvegardes de l'état (`src/main/backups.js`)

Une sauvegarde est une copie entière d'`orbe.json` : onglets, archive, liste
des téléchargements, notes, autorisations des sites, Boosts. Orbe en garde les
dix dernières du jour et une par jour sur dix jours (une vingtaine de fichiers,
dans « sauvegardes », à côté de l'état), sur l'ordinateur seulement.

| Menace | Réponse |
| --- | --- |
| Un autre compte de la machine lit les sauvegardes | Dossier en `0700`, fichiers en `0600` (posé à la création, et au lancement pour les sauvegardes d'une version précédente). Sans effet sous Windows, où le profil n'est ouvert qu'à l'utilisateur. |
| Une donnée supprimée par l'utilisateur reste dix jours dans les sauvegardes | **Supprimé veut dire supprimé** (`forget`) : supprimer une entrée de l'archive, vider l'archive, « oublier » une suggestion de la barre de commande, masquer un téléchargement ou vider la liste, supprimer une note, effacer l'historique (Bibliothèque, « Effacer les données de navigation ») et réinitialiser les autorisations retirent la même donnée des sauvegardes déjà faites, qui sont récrites. Avec une entrée d'archive partent les onglets des sauvegardes fermés depuis (ils y figuraient encore comme ouverts). Les copies de secours `orbe.json.bak` et `history.json.bak` sont traitées de même. Une sauvegarde qu'on ne peut pas récrire est supprimée. Les demandes rapprochées sont groupées (une récriture par fichier), et exécutées au plus tard à l'arrêt, avant toute restauration et avant toute nouvelle sauvegarde ; la sauvegarde horaire écrit d'abord l'état en mémoire, pour ne pas recopier une suppression pas encore écrite. La question « Vider l'archive ? » le dit. |
| Restaurer rend un droit que l'utilisateur avait retiré | `plan` : les **autorisations des sites restent celles du moment** (rien de ce qui a été retiré depuis ne revient) ; « Autoriser le JavaScript des Boosts » n'est **jamais rallumé** ; un Boost supprimé ou modifié depuis revient **désactivé, script coupé, à relire** (comme un Boost importé) ; un Boost inchangé garde son état du moment. La question de la restauration le dit, compte les Boosts concernés, et rappelle ce qu'Orbe garde comme sauvegardes. |
| La restauration coupe Orbe d'un coup (`app.exit`) : historique en attente perdu, téléchargement en cours abandonné sans question | La restauration demande un **arrêt normal** (`app.quit`) : la question « Des téléchargements sont en cours » est posée d'abord (« Annuler » abandonne la restauration, rien n'est touché), chaque module écrit ce qu'il a en attente, une page peut encore retenir l'arrêt (« Rester » abandonne la restauration). L'état n'est remplacé qu'à `will-quit`, quand plus rien ne retient ni n'écrira, puis Orbe se relance. |

Limites : les onglets fermés par la suppression d'un Espace ou d'un profil ne
sont pas retirés des sauvegardes (ils en sortent avec elles, en dix jours au
plus) ; un Boost supprimé y reste lui aussi (il ne reviendrait que désactivé,
à relire). `orbe.json` lui-même garde les droits par défaut du système (`0644`
dans un dossier de profil que macOS réserve déjà à l'utilisateur).

## Aiguillage des liens (`src/main/prefs.js`, `routeFor`)

Une règle envoie les liens d'un site vers un Espace (donc un profil, avec ses
cookies) ou vers la petite fenêtre. Elle sert aux liens venus d'autres
applications et aux liens cliqués dans une page qui s'ouvriraient en aperçu
(onglet épinglé, ⇧clic).

- Avant, la règle cherchait son texte **n'importe où dans l'adresse** : un lien
  `https://evil.tld/?github.com` s'ouvrait dans l'Espace que l'utilisateur
  réserve à `github.com`.
- Maintenant, une règle **nomme un site** et se compare au nom d'hôte de
  l'adresse (`new URL(url).hostname`) : égal, ou sous-domaine (`gist.github.com`
  pour `github.com`). Elle peut préciser un port (`localhost:3000`) et, si elle
  contient un chemin, un **début de chemin** comparé segment par segment
  (`github.com/orbe` ne vaut pas pour `github.com/orbeX`). Paramètres,
  fragment et identifiant (`github.com@evil.tld`) ne comptent jamais ; seules
  les adresses `http(s):` sont aiguillées. Le même code sert aux deux chemins
  (`openUrl` et `peekTarget`).
- Règles d'avant : au lancement, celles qui nomment un site sont récrites sous
  leur forme normale (`https://www.Figma.com/` → `figma.com`). Celles qui ne
  nomment pas un site (un mot avec espace, un bout de chemin) restent dans la
  liste, signalées dans les réglages, et **n'aiguillent plus rien**. Un mot
  seul (`figma`) est lu comme un nom d'hôte sans point : il ne vaut plus pour
  `figma.com` — c'est dit dans l'aide du réglage.
- Les réglages n'acceptent une nouvelle règle que si elle nomme un site.

## Adresses affichées à l'étroit (`src/renderer/common.js`, `addressInto`)

Ce qui dit à qui l'on a affaire est la **fin** du nom d'hôte. Coupée par la
droite, `compte.banque.fr.connexion-securisee.example` ne montrait que
`compte.banque.fr…`. Dans la petite barre d'un volet (vue scindée), l'adresse
d'un aperçu et la barre d'une petite fenêtre :

- le domaine enregistré est mis en avant (plus gras ; le reste estompé) ;
- quand la place manque, le chemin cède d'abord, puis le nom d'hôte s'efface
  **par la gauche** : sa fin reste toujours visible.

Le domaine enregistré est estimé dans la page (deux étiquettes, trois pour les
suffixes à deux étages les plus courants) : pour un suffixe absent de cette
liste, la mise en avant peut tomber un étage trop court ; la coupe à gauche,
elle, ne dépend pas de la liste.

## Copie d'adresse (`cleanUrl`, `mdLink` dans `src/main/window.js`)

- Une fiche Amazon est réduite à son identifiant de produit — seulement sur un
  domaine d'Amazon **nommé dans une liste** (`amazon.fr`, `amazon.co.uk`…).
  `amazon.<n'importe quoi>` ne suffit plus (`amazon.zip`, `amazon.attack`).
- « Copier le lien en Markdown », la citation et « Copier tous les liens » :
  le titre vient de la page. Crochets et barre oblique inverse y sont échappés
  (un `]` fermait le texte du lien, et la suite du titre devenait l'adresse) ;
  dans l'adresse, parenthèses, espaces et chevrons sont encodés.

## Revue d'octobre 2026 : ce qui a été corrigé

Chaque ligne a un essai qui échoue sur le code d'avant (`tests/securite.js`,
sauf mention).

| Constat | Correctif | Essai |
| --- | --- | --- |
| Quarantaine posée sur un chemin périmé quand une extension impose un nom ; exécutable renommé non signalé | Chemin relu à la fin, enregistrement mis à jour, nom d'extension nettoyé comme celui d'un site | `securite.js` (partie 1), `ext-api.js` (téléchargement réel) |
| Quarantaine sans conséquence en cas d'échec, posée après l'annonce ; « Enregistrer la page » jamais marquée | Marque avant l'annonce, seconde tentative, fichier « sans marque » traité comme douteux ; `markTree` | parties 1 et 2 |
| Sauvegardes : données supprimées conservées, fichiers `0644`, restauration qui rend des droits, arrêt forcé | `forget`, `0600`/`0700`, `plan`, arrêt normal puis `will-quit` | partie 3, `bibliotheque.js` |
| Aiguillage : texte cherché dans toute l'adresse | Nom d'hôte (et début de chemin explicite) | partie 4, `fenetres.js`, `selftest.js` |
| Bibliothèque : Boost réappliqué en navigation privée | Chemin unique `applyBoosts` | partie 5 |
| Éditeur de Boost : site tenu par une seule variable | Site nommé dans chaque message | `fenetres.js` |
| Boosts : course à l'exécution (script, CSS) ; `http:` et `https:` confondus | Garde dans la page, document en place vérifié avant et après, retrait à la navigation ; pas de script en `http:` | partie 6 |
| `validSelector` et `url(` ; sélecteur du « Zap » : geste prêté, sélecteurs trop larges | Refus de `url(`, lecture par le moteur CSS, `tooBroad`, plus de geste | partie 6 |
| Boost importé activable sans l'avoir vu | Étape de relecture | partie 6 |
| Images et icônes de fichiers téléchargés décodées sans borne | Bornes lues dans l'en-tête ; jamais pour un fichier douteux | partie 1 |
| Adresse étroite coupée par la droite | Domaine en avant, coupe à gauche | partie 7 |
| Fiche Amazon : domaines sosies | Liste de domaines | partie 8 |
| Lien Markdown : titre non échappé | `mdLink` | partie 8 |

## Mises à jour (`src/main/updates.js`)

Orbe est signé « ad hoc » sur macOS et pas du tout sous Windows : il ne peut pas
se remplacer lui-même (Sparkle et Squirrel demandent une application signée par
un compte de développeur). Il fait donc seulement ceci : demander à GitHub la
dernière version publiée, comparer les numéros, et le dire.

- **Quand** : une fois par jour au plus (application fabriquée seulement), et à
  la demande (menu Orbe → « Rechercher les mises à jour… », Réglages → Avancé).
  Le réglage « Rechercher les mises à jour automatiquement » le coupe. Jamais en
  test ni depuis les sources : les essais remplacent GitHub par un serveur local
  (`tests/mises-a-jour.js`), accepté uniquement en mode test et sur `127.0.0.1`.
- **Ce qui part** : une requête `GET` vers
  `https://api.github.com/repos/amadoubaui/orbe/releases/latest`, depuis une
  session à part, en mémoire (`orbe-mises-a-jour`) : aucun cookie, aucun
  référent, aucun identifiant, agent « Orbe » sans numéro de version. Rien
  d'autre : ni statistique, ni la version installée.
- **Ce qui est cru** : rien. Hôte et chemin fixes, HTTPS, redirection refusée,
  réponse bornée à 512 Ko. Le numéro de version doit avoir la forme `x.y.z` ;
  brouillons et préversions sont ignorés ; l'adresse de la page est
  **reconstruite** (`…/releases/tag/vX.Y.Z`), jamais reprise. L'adresse de
  l'archive l'est aussi (`…/releases/download/<étiquette>/<nom>`, à partir de
  l'étiquette validée et du nom exact attendu pour ce système) : ce que la
  réponse dit de `browser_download_url` est ignoré. Les notes de version sont
  réduites à du texte (6 000 caractères, sans caractères de contrôle ni
  d'inversion du sens d'écriture) et affichées comme du texte.
- **Chaque saut est contrôlé** : la session des mises à jour n'a qu'un
  écouteur `webRequest.onBeforeRequest`, qui annule toute requête — la
  première comme chaque redirection — qui n'est pas en HTTPS vers
  `api.github.com`, `github.com`, `objects.githubusercontent.com` ou
  `release-assets.githubusercontent.com` (nom exact, port par défaut, sans
  identifiants). Une redirection vers un autre hôte, ou vers du HTTP, échoue
  avant de partir. (L'adresse finale d'une réponse de `net.fetch` est vide dans
  Electron 44 : un contrôle après coup ne voyait rien.)
- **Téléchargement** : proposé seulement si GitHub publie l'empreinte SHA-256
  du fichier (`digest`) ; sinon seule la page de la version l'est. Taille et
  empreinte sont vérifiées, puis le fichier est **marqué comme venu
  d'Internet** avant de prendre son nom : attribut `com.apple.quarantine`
  (`0081;<date>;Orbe;`) sur macOS, flux `Zone.Identifier` (zone 3) sous
  Windows. Gatekeeper, XProtect et SmartScreen le contrôlent donc comme un
  fichier téléchargé par un navigateur ; la carte le dit (« Ouvrir quand
  même » dans Réglages Système → Confidentialité et sécurité). Si la marque ne
  peut pas être posée et relue, le fichier est supprimé et la page de la
  version s'ouvre à la place. L'archive n'est **jamais** ouverte ni exécutée.
  Un silence de 30 s abandonne le téléchargement ; « Annuler » l'arrête ;
  l'état ne reste jamais « en cours ».
- **Échecs** : hors ligne, quota de GitHub (403, 429), réponse inattendue — rien
  n'est affiché pour une vérification automatique, et il n'y a pas de nouvelle
  tentative avant le lendemain ; à la demande, la carte des réglages le dit.

Limite assumée : l'empreinte vient du même hôte que l'archive. Elle protège
d'un fichier abîmé ou tronqué, pas d'un compte GitHub compromis ; seule une
signature de développeur le ferait.

## Import depuis un navigateur installé (`src/main/import-browsers.js`)

- **Seuls les signets sont lus.** Ni mots de passe (ils passent par un fichier
  CSV, dans la fenêtre des mots de passe), ni cookies (chiffrés par chaque
  navigateur avec une clé de son trousseau), ni historique.
- **Lecture seule.** Rien n'est écrit dans le profil d'un navigateur. La base
  `places.sqlite` de Firefox est copiée dans un dossier temporaire avant d'être
  ouverte par le `sqlite3` du système (`/usr/bin/sqlite3`, chemin fixe, jamais
  cherché dans le `PATH`), lancé avec `-safe -readonly -batch` : une base est
  un fichier étranger, dont une vue ou un déclencheur pourrait appeler
  `writefile()`, `edit()` ou `load_extension()` ; le mode sûr les refuse. Un
  sqlite3 trop ancien pour `-safe`, ou absent (Windows) : c'est la dernière
  sauvegarde automatique (`bookmarkbackups/*.jsonlz4`) qui est décodée.
  L'appel est asynchrone et borné à dix secondes.
- **Fichiers fabriqués pour coûter cher** : chaque dossier de Firefox n'est
  déroulé qu'une fois (identifiants en double), chaque objet d'une liste de
  propriétés n'est décodé qu'une fois (références partagées), un objet qui se
  contient est refusé, le texte décodé est borné (64 Mo), le nombre de nœuds
  aussi. Le décodage du JSON et des listes reste dans le processus principal :
  il est borné par la taille des fichiers (48 Mo), pas déporté.
- **Fichiers étrangers.** JSON de Chrome, LZ4 de Firefox et liste de propriétés
  binaire de Safari sont décodés ici, avec des bornes partout (taille des
  fichiers, décalages, nombre d'objets, profondeur). Mêmes plafonds que pour un
  fichier HTML : 3 000 signets, 600 dossiers, huit niveaux ; seules les adresses
  `http(s)` sans identifiants sont reprises ; titres nettoyés.
- **Le profil lu est choisi sur le disque, pas par l'interface** : l'identifiant
  reçu de la page n'est accepté que s'il figure dans la liste trouvée (pas de
  chemin, pas de `..`). Un chemin relatif de `profiles.ini` ne sort pas du
  dossier de Firefox.
- **Safari** : macOS protège `~/Library/Safari`. Sans « Accès complet au
  disque », la lecture est refusée ; Orbe le reconnaît (`EPERM`), l'explique et
  propose d'ouvrir le bon volet des Réglages Système. Il ne tente rien d'autre.
- **Aperçu, puis accord** : les comptes sont montrés avant tout import, et ce
  qui est importé est exactement ce qui a été montré (jeton d'aperçu à usage
  unique). L'import s'annule (bouton, ou Édition → Annuler) pendant une
  demi-heure et tant qu'aucun autre import n'a suivi ; l'annulation ne retire
  que ce que l'import a créé : un Espace créé pour l'occasion reste s'il
  contient autre chose.
- **En test**, aucun vrai profil n'est lu : sans dossier d'essai désigné, la
  recherche ne rend rien (`tests/fixtures/navigateurs.js` fabrique les profils).

## Mini-lecteurs (`src/main/media.js`, `src/main/media-art.js`, `src/preload/media.js`)

Un onglet qui joue hors de vue reçoit un lecteur dans la barre latérale. Tout ce
qu'il montre vient de la page (`navigator.mediaSession`, son élément `<audio>` ou
`<video>`) : c'est tenu pour hostile de bout en bout.

**Textes.** La question posée à la page (`infoCode`) coupe elle-même titre et
artiste à 320 caractères et écarte une pochette de plus de 400 Ko : une chaîne
de plusieurs méga-octets ne traverse jamais vers le processus principal. Là,
`clean` retire les caractères de contrôle et de sens d'écriture et borne à 160 ;
la coque pose le tout par `textContent`. À chaque navigation du cadre principal
(`did-navigate`), ce que l'ancienne page annonçait est oublié : le titre ou la
pochette d'un site ne s'affichent jamais sur le suivant.

**Pochette : le décodage.** L'image est décodée dans le processus principal
(`nativeImage`), donc jamais avant d'avoir lu son en-tête (`header`, sans rien
décoder) :

- quatre formats, reconnus à leurs premiers octets : PNG, JPEG, GIF, WebP. Le
  reste (BMP, SVG, ICO…) est refusé ;
- 2048 px de côté et 4 millions de points au plus. Un PNG de 30000 × 30000 en un
  bit par point pèse 110 Ko sur le fil et 3,6 Go une fois décodé : il est refusé
  d'après ses dimensions annoncées. Pour un GIF, c'est l'étendue de la première
  image qui compte, pas seulement l'écran logique ;
- le poids reste borné (2 Mo téléchargés, 400 Ko en `data:`), et l'image décodée
  est revérifiée puis recodée en PNG de 192 px : la coque ne reçoit jamais
  l'adresse ni les octets de la page.

**Pochette : la cadence.** Par onglet, une seule recherche à la fois et pas plus
d'une toutes les 4 secondes ; par session, les 24 dernières pochettes sont
gardées (échecs compris, une minute). Une page qui change `artwork.src` chaque
seconde obtient une requête et un décodage toutes les 4 secondes, pas un par
changement ; la dernière image annoncée finit par s'afficher.

**Pochette : le réseau.** La requête part du processus principal
(`net.request`, session de la page, ni témoins ni identifiants) : elle échappe
aux règles que le moteur applique à la page (contenu mixte, accès au réseau
local, CSP). `loadArtwork` les refait :

- pas de pochette en `http:` pour une page en `https:` ;
- pas d'hôte local pour une page qui n'en vient pas : `localhost`, `.local`,
  `.internal`, `.lan`, nom sans point, adresse de boucle locale, privée
  (10/8, 172.16/12, 192.168/16, 100.64/10), de lien local, IPv6 locale unique
  (`fc00::/7`) ou de lien (`fe80::/10`), IPv4 logée dans une IPv6. Un nom est
  résolu (`session.resolveHost`) et **toutes** ses adresses comptent ; un nom
  qui ne se résout pas est refusé. Une page servie depuis la machine ou le
  réseau local garde le droit d'y prendre sa pochette ;
- les redirections ne sont pas suivies par le moteur (`redirect: 'manual'`) :
  chacune est revérifiée de la même façon, trois au plus ;
- pas d'identifiants dans l'adresse ; 8 secondes pour le tout.

Limites connues : entre la résolution du nom et la requête, un serveur de noms
malveillant peut changer de réponse (le cache du moteur rend la fenêtre
étroite, pas nulle) ; derrière un mandataire qui résout lui-même les noms,
`resolveHost` peut échouer et la pochette manquer. Le décodage reste dans le
processus principal : l'en-tête borne la mémoire, pas un défaut éventuel du
décodeur. Deux autres voies ont été écartées : faire dessiner l'image par la
page sur un `<canvas>` (une image d'une autre origine sans CORS « souille » le
canevas, `toDataURL` lève `SecurityError` — or les pochettes viennent presque
toujours d'un CDN), et un `utilityProcess` (il n'a pas `nativeImage`).

**Gestes.** Un clic sur le lecteur exécute du code dans la page. Il ne lui prête
une activation d'utilisateur que là où la lecture en a besoin : lecture / pause,
piste précédente / suivante (`GESTURE`). Se déplacer dans le morceau, ±15 s,
couper le son et la croix n'en donnent aucune : la page ne peut pas s'en servir
pour ouvrir une fenêtre ou passer en plein écran.

**Empreinte.** `src/preload/media.js` note les gestionnaires que la page déclare
par `setActionHandler`. Rien n'est posé sur `navigator.mediaSession` (plus de
`__orbeActions`) : la table vit dans une fermeture, et la fonction est un
mandataire de l'originale — même `name`, même `length`, texte « [native code] »,
mêmes erreurs. Orbe l'atteint par une clé de 128 bits tirée au hasard pour chaque
document, que le script de préchargement transmet au processus principal (acceptée
du cadre principal seulement). Seule la session du cadre lui-même est notée et
servie : un autre cadre qui emprunte la fonction n'y lit ni n'y écrit rien. Reste
visible : `Function.prototype.toString` rend `function () { [native code] }`,
sans le nom ; et une page qui remplace elle-même `setActionHandler` verrait passer
la clé — qui n'ouvre que ses propres gestionnaires.

## Trace de Chromium (`src/main/trace.js`)

« Aide → Dépannage → Enregistrer une trace… » relève l'activité de **tout** le
navigateur : le traçage ne connaît ni profil ni fenêtre, et son fichier contient
des adresses et des titres de pages.

- La question est posée d'abord ; elle dit ce que la trace contient, qu'elle est
  écrite en clair dans Téléchargements et qu'elle s'arrête seule.
- Aucune trace tant qu'une fenêtre de navigation privée est ouverte. S'il s'en
  ouvre une pendant l'enregistrement, la trace est arrêtée et **jetée**.
- Arrêt automatique au bout de 2 minutes.
- Catégories réduites à celles d'un diagnostic de performance (`CATEGORIES`) :
  plus de `*`, pas de journal du réseau, aucune catégorie
  `disabled-by-default`. Le fichier contient encore des adresses (`loading`,
  `devtools.timeline`) : c'est pour cela que la question le dit.
- Tant qu'elle tourne, la barre latérale de chaque fenêtre montre un témoin
  rouge ; un clic l'arrête. L'article du menu devient « Arrêter la trace ».

## Fenêtre vierge et petite fenêtre

- **Fenêtre vierge.** Ses onglets ne sont pas enregistrés ; fermés, ils ne
  rejoignent plus l'archive (ni donc les sauvegardes de l'état). Ils restent
  rouvrables par ⇧⌘T tant que la fenêtre est ouverte. La session est celle des
  fenêtres ordinaires : historique et cookies sont conservés, et la fenêtre le
  dit (barre latérale, bulle de l'article du menu).
- **Petite fenêtre.** La table « site → profil » (`littleProfiles`) est un objet
  sans prototype ; ce qui vient du fichier d'état est relu, et seules les
  entrées dont la clé est un nom d'hôte valide et la valeur un identifiant de
  profil sont gardées. `__proto__` n'est pas un site.

## Fichiers récents et médias des dossiers (`src/main/library.js`, `src/renderer/libpeek.js`)

- **Survol de l'icône de la Bibliothèque.** La barre latérale reçoit, pour cinq
  fichiers au plus, un identifiant, un nom, une sorte et une date : ni chemin, ni
  adresse. Le nom vient d'un site ; il est posé par `textContent`, les dessins sont
  fixes, aucun fichier n'est lu ni décodé par la barre. Ouvrir et glisser passent par
  les mêmes portes que la Bibliothèque (`dl:open`, `drag`) : fichier exécutable
  confirmé, fichier sans marque « venu d'Internet » jamais glissé sans accord.
- **Captures d'Orbe.** Elles sont rangées dans la Bibliothèque, sauf en navigation
  privée, où le fichier est écrit sans laisser de fiche.
- **« Afficher les médias de : » Bureau, Documents, Téléchargements.** macOS demande
  l'accord de l'utilisateur à la première lecture de ces dossiers. Orbe ne les lit
  donc que lorsqu'un dossier vient d'être choisi dans la section Médias : jamais au
  démarrage, et le choix n'est pas retenu d'une ouverture à l'autre. Seul le premier
  niveau est lu ; liens symboliques, fichiers cachés et autres types sont écartés ;
  rien n'est ouvert ni décodé. La page reçoit un identifiant (empreinte du chemin) ;
  à chaque action, le fichier est revérifié : fichier ordinaire, toujours dans le
  dossier parcouru (un fichier remplacé depuis par un lien est refusé).
- **Vidéos dans un tableau, aperçu des vidéos de la Bibliothèque : non faits.** Les
  deux feraient décoder du contenu venu du web dans une page interne de confiance ;
  il y faudra une vue web à part, en bac à sable, dans la session du profil.

Essais : `tests/sensations.js`, `tests/ui/29-sensations.js`.

## Ce qui demande une vérification humaine

- Une vraie mise à jour, d'une version publiée à la suivante (annonce,
  téléchargement, remplacement de l'application à la main).
- L'import depuis de vrais profils de Chrome, Firefox et Safari, et l'accord
  « Accès complet au disque » pour Safari (application fabriquée).

- Les vraies questions du système (caméra, micro, enregistrement de l'écran)
  avec l'application signée ; le partage d'un écran ou d'une fenêtre réels.
- Un vrai proxy avec authentification ; un vrai certificat client.
- Un site HSTS réel avec un certificat refusé (la sonde est testée par
  substitution).
