# Gestionnaire de mots de passe

Orbe enregistre et remplit les mots de passe lui-même : les extensions de
trousseau (Mots de passe iCloud, entre autres) ont besoin d'un pont natif que
Chromium embarqué n'offre pas.

Ce document décrit ce qui est protégé, contre qui, et ce qui ne l'est pas. Une
première relecture de sécurité indépendante a eu lieu ; ses constats sont
corrigés et chacun a son test (voir « Tests »). Les points encore ouverts sont
listés à la fin.

## Ce que fait la fonction

- **Enregistrer** : après l'envoi d'un formulaire de connexion, une proposition
  apparaît en haut à droite de la page (Enregistrer / Jamais pour ce site / Plus
  tard). Jamais en navigation privée.
- **Remplir** : quand tu cliques un champ de connexion (ou l'atteins avec
  Tabulation) et que des comptes existent pour ce site, leur liste s'ouvre sous
  le champ. Rien n'est rempli sans un clic sur un compte. Un champ qui prend le
  clavier tout seul au chargement n'ouvre pas la liste : il faut le cliquer. Clic droit dans un champ → « Remplir un mot de
  passe… » sert de secours quand le formulaire n'est pas reconnu.
- **Gérer** : menu Orbe → Mots de passe… (ou Réglages → Mots de passe → Gérer…) :
  recherche, affichage et copie après confirmation d'identité, modification,
  suppression, liste « jamais », import et export CSV.
- **Suggérer** : sur un champ `autocomplete="new-password"` (ou un formulaire à
  deux mots de passe), un mot de passe fort est proposé.

## Architecture

| Élément | Fichier | Rôle |
| --- | --- | --- |
| Coffre et décisions | `src/main/passwords.js` | chiffrement, correspondance des origines, canal de la page, vues, fenêtre de gestion |
| Script de page | `src/preload/page.js` | repère les champs, remplit le compte choisi, signale les envois |
| Liste et proposition | `src/renderer/pw-overlay.{html,js}` | vues d'Orbe posées sur la page |
| Fenêtre de gestion | `src/renderer/passwords.{html,js}` | interface `orbe://` de confiance |

Le script de page est enregistré sur les sessions de profil
(`session.registerPreloadScript`, type `frame`). Les onglets sont créés avec
`sandbox: true` et `contextIsolation: true` : il s'exécute donc dans un **monde
isolé**, avec ses propres objets JavaScript. `nodeIntegrationInSubFrames` est
activé sur les vues d'onglet pour qu'il s'exécute aussi dans les iframes ; avec
le bac à sable, ce réglage ne donne aucun accès à Node.

## Ce qui est protégé

### Au repos

- Fichier à part, `passwords.json` dans le dossier de données, jamais
  `orbe.json`. Écrit en entier à chaque changement : fichier temporaire (droits
  `0600`), `fsync`, puis remplacement ; la version précédente est gardée en
  `.bak`.
- Tout le contenu — mots de passe, identifiants, sites, liste « jamais » — est
  un seul bloc chiffré par `safeStorage` : clé dans le trousseau sur macOS,
  DPAPI sous Windows, libsecret ou kwallet sous Linux.
- **Pas de chiffrement réel, pas d'enregistrement.** Si `isEncryptionAvailable()`
  est faux, ou si Linux retombe sur `basic_text` (clé écrite en dur dans
  Chromium), Orbe refuse d'enregistrer et le dit dans la fenêtre de gestion.
- Coffre illisible (clé perdue, fichier abîmé) : la copie `.bak` est essayée,
  puis plus rien n'est écrit. « Repartir de zéro » met le fichier de côté, sans
  le supprimer.
- Le coffre n'est déchiffré qu'à la première utilisation, pas au démarrage.
- Un compte appartient au profil dans lequel il a été enregistré. Supprimer un
  profil supprime ses comptes.

### Face à la page web

La page est l'adversaire principal : elle exécute du code arbitraire, y compris
avant le script d'Orbe.

- **Elle ne peut pas lire ni énumérer les comptes.** La liste est une vue
  d'Orbe (`WebContentsView`) posée par-dessus la page, hors de son DOM. Le
  script de page ne reçoit jamais la liste ; il ne sait même pas s'il existe un
  compte. Aucun élément n'est inséré dans la page.
- **L'origine vient d'Electron**, pas du message : `senderFrame.origin`, et
  `senderFrame.url` doit avoir la même origine en http(s). Les champs du message
  ne servent qu'à placer la liste et à savoir quel type de champ a le clavier.
- **Un mot de passe ne part vers le moteur de rendu qu'après un choix
  explicite**, et seulement vers le cadre qui a signalé le champ, après une
  nouvelle vérification de son origine au moment de l'envoi (le cadre a pu
  naviguer entre-temps).
- Le script de page vit dans un monde isolé : altérer les prototypes de la
  page, écouter ses événements ou envoyer des `postMessage` ne l'atteint pas.
- La liste n'est pas falsifiable par la page (autre processus, autre vue). Sa
  position, donnée par la page, est bornée à la vue de l'onglet : elle ne peut
  pas recouvrir l'interface d'Orbe. Sa hauteur est fixe (elle ne dit rien du
  nombre de comptes). Un clic arrivé dans les 500 ms qui suivent son apparition
  est ignoré, pour la liste comme pour la proposition d'enregistrement.
- **La liste ne s'ouvre que sur un geste réel** : clic de confiance sur le
  champ, ou Tabulation. Un `focus()` de la page, un champ en `autofocus` ou un
  événement fabriqué n'ouvrent rien. Le champ doit être réellement visible :
  au moins 8 px, opacité (ancêtres compris) d'au moins 0,1, dans la fenêtre.
- **La liste ne survit pas à une navigation** de la page : elle est retirée dès
  que la navigation commence, et le champ signalé est oublié.
- **Proposition d'enregistrement** : seul un mot de passe réellement saisi (ou
  collé) par l'utilisateur est proposé — le champ devait être de type
  `password` à la première saisie, et sa valeur doit être restée celle de la
  dernière saisie. Un champ de texte changé en mot de passe par la page, ou une
  valeur remplacée par script, ne propose rien. Le remplacement d'un compte
  existant nomme ce compte dans la question, n'a rien de modifiable, et Entrée
  ne le valide pas.
- Débit du canal limité par cadre (un iframe bavard n'épuise que son quota),
  avec un plafond pour l'ensemble des iframes d'une page ; longueurs bornées.
- Un envoi de formulaire relevé mais non confirmé quitte la mémoire au bout de
  20 secondes.

### Règles d'origine

| Compte enregistré pour | Page affichée | Résultat |
| --- | --- | --- |
| même schéma, hôte et port | — | proposé ; rempli au clic |
| `https://exemple.fr` | `http://exemple.fr` | **jamais proposé** |
| autre sous-domaine, autre port, ou http → https du même domaine enregistrable | — | proposé avec la mention de son site ; rempli après une boîte de confirmation qui nomme les deux adresses |
| autre domaine | — | jamais proposé |
| iframe d'une autre origine que la page | — | seuls les comptes de l'origine **de l'iframe** ; confirmation qui nomme la page hôte |

Le domaine enregistrable s'appuie sur la liste des suffixes publics embarquée
dans Chromium. Electron ne l'expose pas : Orbe l'interroge en posant un cookie
de domaine dans une session en mémoire qui ne sert à rien d'autre — Chromium le
refuse sur un suffixe public. La règle : **le plus long suffixe refusé de
l'hôte, plus une étiquette**. Tous les suffixes de l'hôte sont sondés, car les
suffixes publics s'emboîtent : `amazonaws.com` est un domaine ordinaire, mais
`s3.amazonaws.com` est un suffixe public ; `victime.s3.amazonaws.com` et
`pirate.s3.amazonaws.com` ne partagent donc rien, pas plus que `a.github.io` et
`b.github.io`. Si aucun suffixe n'est refusé (la sonde ne fonctionne pas), si
l'hôte est une adresse IP ou s'il a une forme inhabituelle (point final), le
domaine enregistrable est l'hôte entier — la règle la plus stricte.

Limite : la règle vaut ce que vaut la liste. Des hébergeurs mutualisés qui n'y
figurent pas (ou pas à ce niveau) restent « liés » entre locataires, comme ils
partagent déjà leurs cookies dans tout navigateur. Seule la boîte de
confirmation, qui nomme les deux adresses, sépare alors les deux sites.

### Connexion en deux étapes

À la première étape, seul l'identifiant est rempli ; le mot de passe n'est pas
envoyé au moteur de rendu. **Rien n'est rempli d'office à la seconde étape.**
Quand tu cliques ensuite le champ du mot de passe (même onglet, même origine
exacte, dans les 45 secondes), la liste s'ouvre réduite au seul compte choisi :
un second clic l'envoie. Ce souvenir du compte choisi est effacé dès que
l'onglet navigue vers un autre site.

### Interface d'Orbe

- Les actions passent par le canal `orbe` existant (vues de la liste
  `trusted`, émetteur en `orbe://`). Lister, afficher, copier, modifier,
  exporter n'obéissent qu'à la fenêtre de gestion ; le choix d'un compte
  n'obéit qu'à la vue de liste de la fenêtre, avec un jeton à usage unique.
- La liste des comptes envoyée à l'interface ne contient aucun mot de passe.
- Afficher, copier, exporter demandent Touch ID (ou le mot de passe de session)
  via `systemPreferences.promptTouchID` quand il existe ; la confirmation vaut
  90 secondes pour afficher et copier. **L'export la redemande toujours.** Un mot de passe affiché est masqué au bout de 30 secondes ou dès
  que la fenêtre passe à l'arrière-plan.
- Un mot de passe copié est effacé du presse-papiers après 60 secondes, et à la
  fermeture d'Orbe, s'il s'y trouve encore.
- Aucun mot de passe n'est écrit dans les journaux, l'historique ou `orbe.json`.

### Navigation privée

Le script de page n'est pas enregistré sur les sessions privées, et le canal
ignore toute session qui n'est pas celle d'un profil : ni liste, ni
proposition, ni enregistrement.

## Import et export CSV

Import : exports de Safari / Mots de passe iCloud
(`Title,URL,Username,Password,Notes,OTPAuth`), Chrome
(`name,url,username,password,note`), Firefox et Bitwarden, reconnus par leurs
en-têtes. Les lignes sans adresse http(s) ou sans mot de passe sont ignorées et
comptées. Un compte déjà présent (même site, même identifiant) est mis à jour.

**Un fichier CSV est en clair.** À l'import, Orbe propose de mettre le fichier
à la corbeille ; la corbeille n'efface pas le disque. À l'export, il demande
la confirmation d'identité, avertit, puis écrit le fichier en `0600`.

## Ce qui n'est pas protégé

- **Un moteur de rendu compromis** (faille de Chromium exploitée par une page)
  peut se faire passer pour le script de page de sa propre origine. Il peut
  alors : faire apparaître la liste des comptes de cette origine (sans la
  lire), obtenir le mot de passe du compte que l'utilisateur choisit — que la
  page aurait reçu de toute façon —, et provoquer des propositions
  d'enregistrement avec des valeurs inventées, pour son origine (les gardes
  « geste réel » et « valeur réellement saisie » vivent dans le script de page,
  donc dans ce même processus). Il ne peut pas obtenir un compte d'une autre
  origine, ni un compte non choisi. L'isolation des sites de Chromium fait que
  ce processus n'héberge en principe qu'un site.
- **Une page malveillante ou une injection de script sur le site légitime**
  reçoit le mot de passe dès que l'utilisateur le remplit. Aucun gestionnaire
  n'y peut rien.
- **Un logiciel malveillant sous le compte de l'utilisateur** peut demander la
  clé au trousseau (macOS affiche une demande pour un autre programme), lire la
  mémoire d'Orbe, ou enregistrer les frappes. Le coffre déchiffré reste en
  mémoire du processus principal tant qu'Orbe est ouvert.
- **Pas d'intégrité cryptographique du fichier** : `safeStorage` chiffre sans
  authentifier. Qui peut écrire dans le dossier de données peut abîmer ou
  remplacer le coffre (pas le lire).
- **Sans Touch ID** (Windows, Linux, Mac sans capteur), afficher, copier et
  exporter ne demandent qu'une confirmation : elle n'arrête pas quelqu'un qui a
  la main sur la session ouverte. Et quiconque utilise la session peut de toute
  façon remplir un compte sur son site.
- Le presse-papiers est lisible par toute application pendant les 60 secondes ;
  les gestionnaires d'historique de presse-papiers peuvent garder la copie.
  Marquer la copie comme confidentielle (`org.nspasteboard.ConcealedType`)
  n'est pas possible : l'API `clipboard` d'Electron 44 ignore les types qu'elle
  ne connaît pas (vérifié), et Orbe n'a pas de module natif.
- **Sous Windows**, DPAPI protège contre les autres comptes de la machine, pas
  contre un programme du même utilisateur.
- **Détection des formulaires par heuristique** : un formulaire peut ne pas
  être reconnu (secours : clic droit), et une connexion refusée par un site
  classique peut tout de même déclencher la proposition d'enregistrement.
- Pas de synchronisation, pas de clés d'accès (passkeys), pas de codes à usage
  unique (le champ `OTPAuth` d'un import est conservé et réexporté, pas utilisé).

## Reprise des mots de passe d'Arc

La commande « Reprendre l'historique et les connexions d'Arc… » (menu Orbe,
macOS) lit les profils Chromium d'Arc et range les mots de passe trouvés dans le
coffre, les cookies dans les sessions, l'historique à part. Le détail et les
règles tenues sont en tête de `src/main/import-arc-data.js` ; les essais sont
`tests/import-arc-donnees.js` (25 vérifications, fausses bases, clé d'essai, le
vrai trousseau jamais touché). Une relecture de sécurité indépendante a eu lieu
le 13 octobre 2026 ; ses constats sont corrigés.

Ce que la fonction garantit : rien ne tourne hors d'un geste de l'utilisateur
(commande atteignable par la seule interface de confiance, jamais par une page,
une extension ou un raccourci), rien n'est lu en mode test, Arc n'est jamais
modifié (bases copiées, lues en lecture seule par `sqlite3`, copies effacées).
Un cookie n'entre que chiffré **et** lié à son hôte par l'empreinte de Chromium
(base en version 24 au moins) : jamais la colonne en clair, jamais une base plus
ancienne. Un mot de passe n'entre que si l'adresse et le domaine
d'authentification désignent le même site. La clé d'Arc est lue par
`/usr/bin/security` (c'est « security » que macOS nomme, pas Orbe) ; la fenêtre
d'Orbe l'explique et met en garde contre « Toujours autoriser » ; sans la clé,
seul l'historique est repris.

Limites assumées, à relire (constats de la relecture) :

1. **« Toujours autoriser »** laisserait l'accès à la clé d'Arc ouvert à tout
   programme du compte. Orbe le dit avant et après, mais ne le vérifie pas
   après coup (une seconde lecture risquerait une demande inutile). À essayer :
   confirmer que tuer `security` referme la demande, puis signaler l'accès resté
   ouvert. Mieux : lire la clé depuis Orbe (module natif), à terme.
2. **Déplacement d'origine par réécriture des deux colonnes** (`origin_url` et
   `signon_realm`, ou `host_key` et son empreinte) : un programme du compte qui
   récrit tout de façon cohérente pourrait encore déplacer un secret. Limite du
   format de Chromium ; seule la cohérence interne est vérifiée.
3. **Un mot de passe d'Arc écrase un compte d'Orbe du même site** sans comparer
   les dates (comme l'import CSV). La fenêtre l'annonce ; le remplacement n'est
   pas compté à part.
4. Pas d'intégrité cryptographique des bases d'Arc : `safeStorage` et le
   chiffrement de Chromium ne font pas foi de l'auteur de la valeur.

## Application fabriquée

- **Mode test verrouillé** : `--selftest`, `ORBE_SCENARIO` et le trousseau
  factice n'existent que lancé depuis les sources (`!app.isPackaged`).
  L'application fabriquée les refuse (code de sortie 2), sauf avec `--orbe-test`
  **et** un `ORBE_USER_DATA` distinct du vrai dossier de données : c'est ce
  qu'utilise l'essai de fumée de l'intégration continue. Le mode test ne peut
  donc jamais s'appliquer au vrai profil.
- **Fusibles d'Electron (macOS et Windows)** : `scripts/build-mac.js` et
  `scripts/build-win.js` coupent `RunAsNode`,
  `EnableNodeOptionsEnvironmentVariable` et `EnableNodeCliInspectArguments`
  dans le binaire (`scripts/fuses.js`, sans dépendance), puis relisent leur
  état (`npm run build -- --fuses`, `node scripts/build-win.js --fuses`). Sur
  macOS, avant la signature. Sans cela, un autre programme pourrait lancer
  Orbe comme un simple Node.js et demander la clé du coffre sous son identité.
  Sous Windows, l'intégration continue le vérifie sur l'application fabriquée
  (`tests/win-package.js`) : `ELECTRON_RUN_AS_NODE=1 Orbe.exe script.js`
  n'exécute pas le script, `NODE_OPTIONS=--require` ne charge rien,
  `--inspect` et `--inspect-brk` n'ouvrent aucun port, alors que le moteur
  d'origine, pris comme témoin, obéit.
- **Limite sous Windows** : `Orbe.exe` n'est pas signé, et le dossier d'Orbe
  est modifiable par l'utilisateur. Un programme qui tourne déjà sous le même
  compte peut donc remplacer `Orbe.exe` ou le code placé à côté
  (`resources\app`), et DPAPI lui ouvrirait le coffre de toute façon (voir
  « Ce qui n'est pas protégé »). Les fusibles ferment la voie la plus simple,
  pas celle-là. Les fusibles d'intégrité (`OnlyLoadAppFromAsar`,
  `EnableEmbeddedAsarIntegrityValidation`) ne sont pas posés : ils demandent
  une archive asar et, pour avoir un sens, un exécutable signé.

## Tests

`tests/passwords.js` (72 vérifications, sans réseau, appelées par `npm test`) :
proposition à l'envoi, remplissage sur l'origine exacte, refus sur une autre
origine et en http, sous-domaine avec confirmation, deux étapes, application
monopage, iframe d'une autre origine, navigation privée, profils, page hostile
(prototypes altérés avant chargement, `postMessage`, événements, envoi par
script), chiffrement au repos, coffre abîmé, presse-papiers, CSV aller-retour.
En test, le trousseau du système n'est jamais touché (`use-mock-keychain`).

Régressions de la relecture de sécurité (section « Pages hostiles ») : pas de
remplissage silencieux à la seconde étape (champ invisible, focus fabriqué,
aller-retour par un autre site) ; locataires voisins d'un suffixe public
emboîté ; champ de commentaire changé en mot de passe, valeur remplacée par la
page ; clic précoce et Entrée sur la proposition ; quota de débit par cadre et
iframe bavard ; liste sans geste réel, champ transparent, liste après
navigation, hauteur fixe ; export sans délai de grâce ; envoi non confirmé
oublié à l'échéance.

`tests/passwords-sites.js` (Internet) relève ce qui est reconnu sur de vraies
pages de connexion, sans rien saisir.

## À faire relire

Points encore ouverts :

1. Sous Windows : exécutable non signé et code modifiable à côté de lui
   (les fusibles `RunAsNode`, `NODE_OPTIONS` et `--inspect` sont coupés et
   vérifiés, pas ceux d'intégrité).
2. Copie confidentielle dans le presse-papiers (demande un module natif).
3. Hébergeurs mutualisés absents de la liste des suffixes publics.
4. Un champ recouvert par un autre élément mais réellement cliqué ouvre la
   liste à cet endroit : la page choisit où elle apparaît, pas ce qu'elle
   contient ni ce qui est choisi.
5. `nodeIntegrationInSubFrames` sur les vues d'onglet.
6. La valeur réelle de `promptTouchID` comme barrière, et le délai de 90 s.
7. Pas d'intégrité cryptographique du fichier du coffre.
8. Reprise d'Arc : les quatre limites listées sous « Reprise des mots de passe
   d'Arc » (accès « Toujours autoriser » non revérifié, déplacement d'origine
   par réécriture cohérente, écrasement sans comparer les dates, pas d'intégrité
   des bases d'Arc).
