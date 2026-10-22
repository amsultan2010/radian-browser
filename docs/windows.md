# Orbe sous Windows

Orbe tourne sous Windows 10 et 11 avec le même code que sous macOS. Tout ce qui
dépend du système est regroupé dans `src/main/platform.js` (processus
principal) et dans un bloc « Plateformes » à la fin de `shell.css` et de
`base.css`, activé par la classe `html.win` (posée par `common.js`).

## Lancer, tester, fabriquer

```sh
npm start                    # lance le navigateur
npm test                     # tests de bout en bout
node scripts/build-win.js    # %USERPROFILE%\.orbe-dev\dist\Orbe\Orbe.exe
                             # et Orbe-<version>-windows-x64.zip
```

L'intégration continue (`.github/workflows/tests.yml`) lance les tests sur
`windows-latest` et `macos-latest`, fabrique l'application Windows, vérifie
qu'elle démarre, puis contrôle ce qui suit (fusibles, icône, version,
inscription comme navigateur). Elle publie l'archive et des captures d'écran.

## Ce que contient l'archive

`Orbe-<version>-windows-x64.zip` contient un seul dossier, `Orbe` : `Orbe.exe`,
ses fichiers voisins (le moteur) et `LISEZMOI.txt`. Il n'y a pas
d'installateur : on décompresse, on lance `Orbe.exe`. La notice
(`scripts/LISEZMOI-windows.txt`, écrite en UTF-8 avec marque d'ordre et fins
de ligne de Windows) explique le lancement, l'avertissement SmartScreen, où
sont les données, et comment faire d'Orbe le navigateur par défaut.

`Orbe.exe` **n'est pas signé** : au premier lancement, SmartScreen affiche
« Windows a protégé votre ordinateur » (« Informations complémentaires », puis
« Exécuter quand même »). Seul un certificat de signature de code, payant,
lèverait cet avertissement.

La pièce jointe de l'intégration continue porte le même nom ; GitHub
l'enveloppe dans un second zip au téléchargement.

## Ce qui change par rapport à macOS

| Sujet | macOS | Windows |
| --- | --- | --- |
| Boutons de fenêtre | feux tricolores à gauche, dans la barre latérale | boutons du système à droite (`titleBarOverlay`), aux couleurs de l'Espace |
| Haut de la fenêtre | la page monte jusqu'à 8 px du bord | une bande de 32 px reste libre au-dessus de la page (boutons de fenêtre, déplacement) ; avec la barre d'outils, les boutons sont à sa droite |
| Fond | `vibrancy` (translucide) | fond opaque teinté ; Mica (`backgroundMaterial`) sur Windows 11 22H2+ quand « fond translucide » est activé |
| Menu | barre de menus du système | pas de barre : bouton « ⋯ » en haut de la barre latérale, les raccourcis restent actifs |
| Police | San Francisco | Segoe UI Variable |
| Dernière fenêtre fermée | l'application reste ouverte | l'application se ferme |
| Navigateur par défaut | immédiat | Orbe s'inscrit dans le registre de l'utilisateur puis ouvre Paramètres → Applications par défaut (Windows impose le choix à la main) ; l'inscription se retire depuis le menu |
| Import depuis Arc | `~/Library/Application Support/Arc` | `%LOCALAPPDATA%\Packages\TheBrowserCompany.Arc_*\LocalCache\Local\Arc` (menu masqué si Arc est absent) |
| Données | `~/Library/Application Support/Orbe` | `%APPDATA%\Orbe` |
| Téléchargements | `~/Downloads` | dossier Téléchargements de l'utilisateur |

## Raccourcis clavier

Les commandes sont écrites une seule fois, avec les raccourcis d'Arc pour
macOS (`commands.js`). `platform.accel()` les traduit : **⌘ devient Ctrl**, et
⌥ devient Alt. Les exceptions ci-dessous sont dans la table `WIN_ACCEL`.
`platform.keys()` produit l'affichage (« Ctrl+Shift+T ») pour le menu, la
barre de commande, la page des raccourcis et les textes de l'interface.

Source : les raccourcis d'Arc pour Windows connus (aide d'Arc et relevés
d'utilisateurs : Ctrl+T, Ctrl+L, Ctrl+W, Ctrl+Shift+T, Ctrl+D, Ctrl+S, Ctrl+N,
Ctrl+H, Ctrl+Shift+C, Ctrl+Shift+Alt+C, Ctrl+Shift+=, Ctrl+Alt+flèches,
Ctrl+chiffre, Ctrl+Shift+I), complétés par les usages de Chrome sous Windows.

| Action | macOS | Windows | Pourquoi |
| --- | --- | --- | --- |
| Nouvel onglet / adresse | ⌘T / ⌘L | Ctrl+T / Ctrl+L | règle générale |
| Archiver / rouvrir l'onglet | ⌘W / ⇧⌘T | Ctrl+W / Ctrl+Shift+T | règle générale |
| Épingler | ⌘D | Ctrl+D | règle générale |
| Barre latérale / barre d'outils | ⌘S / ⇧⌘D | Ctrl+S / Ctrl+Shift+D | règle générale |
| Fenêtre / privée / petite | ⌘N / ⇧⌘N / ⌥⌘N | Ctrl+N / Ctrl+Shift+N / Ctrl+Alt+N | règle générale |
| Onglet suivant / précédent | ⌥⌘↓ / ⌥⌘↑ | Ctrl+Alt+↓ / Ctrl+Alt+↑ | comme Arc pour Windows |
| Espace suivant / précédent | ⌥⌘→ / ⌥⌘← | Ctrl+Alt+→ / Ctrl+Alt+← | comme Arc pour Windows |
| Onglets récents | ⌃⇥ | Ctrl+Tab | inchangé |
| Aller à l'onglet 1…9 | ⌘1…⌘9 | Ctrl+1…Ctrl+9 | comme Arc pour Windows |
| **Aller à l'Espace 1…9** | ⌃1…⌃9 | **Alt+1…Alt+9** | Ctrl+chiffre est pris par les onglets |
| Vue scindée / fermer le volet / volet n | ⌃⇧= / ⌃⇧- / ⌃⇧1…4 | Ctrl+Shift+= / Ctrl+Shift+- / Ctrl+Shift+1…4 | inchangé |
| **Capturer la page** | ⇧⌘2 | **Alt+Shift+2** | Ctrl+Shift+2 vise déjà le volet 2 |
| Copier l'URL / en Markdown | ⇧⌘C / ⌥⇧⌘C | Ctrl+Shift+C / Ctrl+Alt+Shift+C | comme Arc pour Windows |
| **Copier en citation** | ⌃⇧⌘C | **Alt+Shift+C** | ⌃ et ⌘ se confondraient en Ctrl+Shift+C |
| **Historique** | ⌘Y | **Ctrl+H** | Ctrl+Y rétablit une frappe sous Windows |
| Bibliothèque | ⇧⌘L | Ctrl+Shift+L | règle générale |
| **Téléchargements** | ⇧⌘J | **Ctrl+J** | usage de Windows ; libère Ctrl+Shift+J |
| **Page précédente / suivante** | ⌘[ / ⌘] | **Alt+← / Alt+→** | usage de Windows |
| **Plein écran** | ⌃⌘F | **F11** | usage de Windows |
| **Outils de développement** | ⌥⌘I | **Ctrl+Shift+I** | usage de Windows |
| **Console** | ⌥⌘J | **Ctrl+Shift+J** | usage de Windows |
| **Inspecter** | ⌥⌘C | **F12** | Ctrl+Shift+C copie l'URL, comme dans Arc |
| **Code source** | ⌥⌘U | **Ctrl+U** | usage de Windows |
| Recherche / suivant / précédent | ⌘F / ⌘G / ⇧⌘G | Ctrl+F / Ctrl+G / Ctrl+Shift+G | règle générale |
| Actualiser / forcer / arrêter | ⌘R / ⇧⌘R / ⌘. | Ctrl+R / Ctrl+Shift+R / Ctrl+. | règle générale |
| Zoom | ⌘+ / ⌘- / ⌘0 | Ctrl++ / Ctrl+- / Ctrl+0 | règle générale |
| Effacer Aujourd'hui | ⇧⌘K | Ctrl+Shift+K | règle générale (un relevé d'Arc pour Windows indique Ctrl+Alt+K) |
| Enregistrer / imprimer | ⇧⌘S / ⌘P | Ctrl+Shift+S / Ctrl+P | règle générale |
| Aperçu → onglet | ⌘O | Ctrl+O | règle générale |
| Réglages | ⌘, | Ctrl+, | règle générale |
| Ouvrir en arrière-plan (barre de commande) | ⌘↩ | Ctrl+Entrée | règle générale |

## Icône et informations de version de l'exécutable

`scripts/make-ico.js` fabrique `assets/orbe.ico` à partir de `assets/icon.png`
(décodage PNG, réduction et empaquetage ICO écrits en JavaScript, sans
dépendance). Cette icône est celle des fenêtres et de la barre des tâches.

`scripts/pe-resources.js` inscrit cette icône et les informations de version
**dans** `Orbe.exe` (ce que montrent l'Explorateur et les propriétés du
fichier), sans l'outil `rcedit` ni aucune dépendance :

- la section `.rsrc` est relue en entier (arbre type / nom / langue), modifiée
  en mémoire, puis réécrite à la même adresse ;
- l'icône principale (`RT_GROUP_ICON` et ses `RT_ICON`) est remplacée par les
  sept tailles du `.ico` : image classique (BMP et masque) jusqu'à 128 pixels,
  PNG pour 256 ; les autres ressources (curseurs, manifeste) ne changent pas ;
- les chaînes de `RT_VERSION` (`ProductName`, `FileDescription`,
  `CompanyName`, `FileVersion`, `ProductVersion`, `OriginalFilename`,
  `InternalName`, `LegalCopyright`) et les numéros binaires sont réécrits ;
- la section grossit : `.reloc`, qui la suit, est décalée dans le fichier et
  en mémoire ; sont mis à jour la table des sections, les répertoires de
  données, `SizeOfImage`, `SizeOfInitializedData` et la somme de contrôle.

Limite assumée : seul `.reloc` peut être décalé en mémoire (rien ne le désigne
hormis la table des répertoires). Si une autre section suivait `.rsrc`, le
script s'arrête au lieu de produire un exécutable faux ; `.reloc` seul derrière
`.rsrc` est la disposition d'`electron.exe` 44.7 (x64), la seule essayée. `node scripts/pe-resources.js Orbe.exe`
affiche sections, ressources et version, et vérifie leur cohérence.

Vérifié : `tests/pe-resources.test.js` (sur le vrai `electron.exe`) ; en
intégration continue, l'application démarre, PowerShell relit
`(Get-Item Orbe.exe).VersionInfo`, et l'icône extraite par Windows
(`Icon.ExtractAssociatedIcon`, puis chaque taille par `PrivateExtractIcons`)
est comparée pixel à pixel à `assets/orbe.ico` (`tests/win-package.js`,
images jointes à l'exécution).

## Fusibles

`scripts/build-win.js` coupe dans `Orbe.exe` les mêmes fusibles d'Electron que
sur macOS (`scripts/fuses.js`, commun aux deux fabrications) : `RunAsNode`,
`EnableNodeOptionsEnvironmentVariable` et `EnableNodeCliInspectArguments`, puis
relit leur état (`node scripts/build-win.js --fuses`). L'intégration continue
le met à l'épreuve : `ELECTRON_RUN_AS_NODE=1 Orbe.exe script.js` n'exécute pas
le script, `NODE_OPTIONS=--require` ne charge rien, `--inspect` et
`--inspect-brk` n'ouvrent aucun port — alors que le moteur d'origine, pris
comme témoin, obéit. Voir `docs/mots-de-passe.md`.

## Navigateur par défaut

Windows 10 et 11 n'acceptent le changement que depuis Paramètres →
Applications → Applications par défaut. « Définir Orbe par défaut » (Réglages,
page de bienvenue, menu) fait donc deux choses (`src/main/win-default.js`) :

1. il inscrit Orbe comme navigateur dans le registre de l'utilisateur, sans
   droit d'administrateur, par un seul appel à `reg.exe import` :
   - `HKCU\Software\Classes\OrbeHTML` : type de document, icône, commande
     d'ouverture (`"…\Orbe.exe" "%1"`) ;
   - `HKCU\Software\Clients\StartMenuInternet\Orbe` : le navigateur et ses
     capacités (`http`, `https`, `.htm`, `.html`, `.shtml`, `.xht`, `.xhtml`) ;
   - `HKCU\Software\RegisteredApplications` : valeur `Orbe`, qui mène aux
     capacités ; et `OrbeHTML` dans « Ouvrir avec » de `.htm` et `.html` ;
2. il ouvre les Paramètres : la fiche d'Orbe sous Windows 11
   (`ms-settings:defaultapps?registeredAppUser=Orbe`), la liste sous Windows 10.

Rien n'est écrit au lancement : seulement au clic. L'inscription retient
l'emplacement d'`Orbe.exe` ; si le dossier est déplacé, il faut recliquer.

« Retirer Orbe des navigateurs de Windows » (menu « ⋯ » et barre de commande,
sous Windows seulement) supprime les deux clés d'Orbe et ses valeurs dans les
clés partagées, sans toucher aux autres inscriptions.

Vérifié en intégration continue avec l'application fabriquée
(`tests/win-default.js`, puis relecture indépendante par `reg query` et
PowerShell) : rien avant le clic, toutes les valeurs après, plus rien après le
retrait, les autres inscriptions intactes. Ce que la machine ne dit pas : si
Orbe apparaît bien dans la page des Paramètres. L'ancienne interface de
Windows pour le demander (`IApplicationAssociationRegistration`) a été
essayée : elle répond « oui » à tout, même à un nom inconnu ; elle ne prouve
donc rien et n'est pas utilisée.

## Non vérifié sur un vrai poste Windows

Les tests tournent sur une machine d'intégration continue, sans personne
devant l'écran. Restent à voir sur un vrai poste :

- le rendu de Mica (fond translucide) sous Windows 11 ;
- la place des boutons de fenêtre à 125 %, 150 % et 200 % d'échelle ;
- les raccourcis au clavier réel, notamment Ctrl+Alt+… sur les claviers où
  AltGr produit Ctrl+Alt (AZERTY, polonais…) ;
- l'import depuis Arc sur de vraies données d'Arc pour Windows ;
- le dernier geste du choix du navigateur par défaut : Orbe est inscrit et
  le registre est vérifié, mais personne n'a encore vu Orbe dans la page des
  Paramètres ni cliqué sur « Définir par défaut » ; de même pour l'ouverture
  d'un lien depuis une autre application une fois Orbe choisi ;
- l'icône telle que l'affichent l'Explorateur, la barre des tâches et le menu
  Démarrer (l'intégration continue vérifie que Windows charge chacune des
  sept tailles à l'identique, pas leur rendu à l'écran) ;
- l'avertissement SmartScreen tel qu'il s'affiche pour une archive
  téléchargée, et la réaction des antivirus à un exécutable non signé dont
  les ressources ont été réécrites ;
- un installateur et la signature de l'exécutable.

Les tests natifs de `tests/natif` (frappe au clavier réel) restent propres à
macOS.
