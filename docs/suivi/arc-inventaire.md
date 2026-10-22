# Inventaire d'Arc, point par point, et état dans Orbe

> Version de travail du 8 octobre 2026. Référence : Arc 1.166 pour macOS, installé sur ce Mac.
> Inventaire complet à cette date. Le bilan chiffré et la liste « À faire ensuite » sont en fin de fichier.

## Comment lire ce fichier

États : ✅ fait et vérifié (code + test ou vérification) · 🟡 partiel ou non vérifié · ⬜ à faire · ➖ écarté (avec la raison).

Provenance de chaque affirmation sur Arc :

- **mesuré** : chiffre relevé sur l'application réelle (capture d'écran ou enregistrement à 60 images/s, fenêtre de navigation privée ouverte pour l'occasion puis refermée) ;
- **observé** : lu dans l'application réelle (barre de menus par l'accessibilité, fenêtre) ;
- **binaire** : texte ou fichier présent dans `/Applications/Arc.app` (libellés de l'interface, fichiers son, polices, vidéos) ; prouve que la fonction existe et donne son libellé exact, pas son comportement ;
- **source : URL** : documentation ou article ;
- **non vérifié** : connu de mémoire ou déduit, à confirmer avant de s'y fier.

## Mesures relevées sur Arc 1.166 (fenêtre 1728 × 1035 pt, thème sombre, « Réduire les animations » désactivé)

| Réf. | Élément | Valeur | Provenance |
| --- | --- | --- | --- |
| M-1 | Largeur de la barre latérale | 228 pt (réglage de l'utilisateur) | mesuré |
| M-2 | Marge entre le bord de la fenêtre et la page, barre masquée | 10 pt à gauche | mesuré |
| M-3 | Masquer la barre latérale (⌘S) | instantané : la barre disparaît en une image (≤ 17 ms), sans glissement | mesuré |
| M-4 | Réafficher la barre latérale (⌘S) | 3 images, environ 50 ms (bord à 114 pt, 207 pt, puis 228 pt) | mesuré |
| M-5 | ⌘S sans aucun onglet ouvert | sans effet (l'article de menu est grisé) | mesuré + observé |
| M-6 | Barre de commande : largeur | environ 763 pt, centrée sur la fenêtre entière (pas sur la page) | mesuré |
| M-7 | Barre de commande : position verticale | bord haut à environ 350 pt du haut d'une fenêtre de 1035 pt (un tiers) | mesuré |
| M-8 | Barre de commande : hauteur avec 5 suggestions | environ 330 pt ; ligne de suggestion de 46 pt | mesuré |
| M-9 | Barre de commande : fond | aucun assombrissement de la page derrière ; grande ombre portée (environ 70 pt) | mesuré |
| M-10 | Barre de commande : ligne sélectionnée | aplat bleu sur toute la largeur intérieure | mesuré |
| M-11 | Nouvelle fenêtre sans onglet | la barre de commande s'ouvre d'elle-même | mesuré |
| M-12 | ⌘T quand la barre de commande est ouverte | la referme (bascule) | mesuré |
| M-13 | Ajouter une vue scindée (⌃⇧=) | le volet vide apparaît à droite sans animation visible, avec la barre de commande ouverte dedans ; chaque volet reçoit une petite barre d'adresse en haut | mesuré |
| M-14 | Fermer le volet (⌃⇧-) | retour immédiat à une seule page | mesuré |

Non mesuré, et pourquoi : le changement d'Espace, l'aperçu (Peek), le glisser-déposer et les gestes du pavé tactile demandent soit la souris, soit les Espaces réels du propriétaire ; ils n'ont pas été déclenchés pour ne rien modifier chez lui. La durée du fondu de la barre de commande n'a pas pu être chiffrée (l'enregistrement n'a pas produit d'images intermédiaires exploitables).

## Abréviations des preuves

Arc :
- `HC n` = article du centre d'aide, `https://resources.arc.net/hc/en-us/articles/n` (les notes de version sont les articles 20498417809815 pour 2021-2022, 20498377604887 pour 2023, 20498293324823 pour 2024 et après) ;
- `inverse` = https://www.inverse.com/gear/arc-web-browser-the-browser-company-josh-miller ; `warren` = https://blog.warrenweb.net/arc-setup/ ; `hongkiat` = https://www.hongkiat.com/blog/arc-browser-keyboard-shortcuts/ ; `howtogeek` = https://www.howtogeek.com/888738/ways-arc-transforms-your-web-browser-experience/ ; `allthings` = https://allthings.how/15-arc-browser-tips-tricks-to-make-web-browsing-effortless/ ; `slashgear` = https://www.slashgear.com/1634601/best-arc-browser-features/ ; `popsci` = https://www.popsci.com/diy/arc-browser-tips/ ;
- `M-n` = mesure du tableau ci-dessus ; `menu` = barre de menus d'Arc lue par l'accessibilité le 8 octobre 2026 ; `binaire` = libellé ou fichier trouvé dans l'application.

Orbe : `W` = `src/main/window.js`, `C` = `commands.js`, `M` = `menu.js`, `MA` = `main.js`, `SH` = `src/renderer/shell.js`, `SC` = `shell.css`, `OV`/`OC` = `overlay.js`/`overlay.css`, `SU` = `suggest.js`. Tests : `self` = `tests/selftest.js` (179 vérifications sur 179 réussies le 8 octobre 2026, profil temporaire), `ui NN` = `tests/ui/NN-*.js`, `nat` = `tests/natif/raccourcis.js`. Les tests `ui` et `nat` sont cités d'après leur lecture, ils n'ont pas été relancés pour cet inventaire.

`self lat` = `tests/laterale.js` (barre latérale et menus, 137 vérifications, appelé par `self`) ; `ui 22`, `ui 23` = gestes de la barre latérale, Espaces et dossiers (38 vérifications à la vraie souris), ajoutés le 9 octobre 2026.

`self cmd` = `tests/commande.js` (barre de commande, 55 vérifications), `self bib` = `tests/bibliotheque.js` (Bibliothèque, téléchargements, notes : 70 vérifications) et `self easels` = `tests/easels.js` (tableaux), appelés par `self` ; `ui 24`, `ui 25` = `tests/ui/24-commande-portees.js` et `25-bibliotheque.js` (36 vérifications à la vraie souris et au vrai clavier), ajoutés le 9 octobre 2026. `palette.js`, `library.js`, `downloads.js` : dans `src/main`.

Règle appliquée pour ✅ : le code existe **et** un test nommé le couvre. Du code sans test est noté 🟡, même s'il a l'air juste.

## BL — Barre latérale

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| BL-1 | Toute la navigation tient dans une barre à gauche : adresse et boutons en haut, favoris, titre de l'Espace, épinglés, séparateur, « + New Tab », onglets du jour, rangée du bas | allthings ; observé | ✅ | SH, `shell.html` ; self « la barre latérale reçoit son état » | |
| BL-2 | Largeur réglable en tirant le bord | HC 20498463803799 | ✅ | W:setSidebarWidth ; ui 07 (250 par défaut, 200 à 420) | |
| BL-3 | Double-clic sur le bord : retour à la largeur par défaut | HC 20498463803799 | ✅ | SH:405-422 (pas de double-clic) | self lat « double-clic sur le bord… » ; ui 07 (double-clic réel : 340 → 250 px) |
| BL-4 | Tirer le bord tout à gauche masque la barre | HC 20498293324823 | ✅ | aucun code | Sous 100 px la barre se masque et garde sa largeur d’avant ; ui 07 « tirer le bord tout à gauche » |
| BL-5 | Mode étroit : la barre très resserrée garde précédent/suivant | HC 20498417809815 | ✅ | minimum 200 px | Au minimum (200 px) précédent, suivant et actualiser restent entiers, côte à côte et cliquables ; self fin2 « barre resserrée au minimum (200 px)… » ; ui 29 « bord de la barre tiré jusqu’au minimum… » |
| BL-6 | ⌘S masque et réaffiche la barre | menu ; M-3, M-4 | ✅ | W:animate ; self « ⌘S masque… », « ⌘S la réaffiche » | |
| BL-7 | La bascule ⌘S est quasi instantanée (0 à 50 ms) | M-3, M-4 | ✅ | Orbe anime sur 180 ms (W:415-428, SC:20) | Fait le 8 oct. (cotes et durées d'Arc) |
| BL-8 | ⌘S est sans effet quand aucun onglet n'est ouvert | M-5 | ✅ | C:toggleSidebar | Tranché comme Arc : sans onglet, ⌘S ne masque pas la barre (masquée, il la ramène toujours) et l’action n’est pas proposée dans la barre de commande ; le bouton de la barre garde son effet. self fin « ⌘S sans onglet… » (3) ; ui 28, ui 24 |
| BL-9 | Barre masquée : approcher le bord gauche la fait apparaître par-dessus la page, y compris en plein écran | howtogeek | ✅ | W:setPeek ; self « survol du bord : la barre flotte, la page ne bouge pas » | Plein écran non testé |
| BL-10 | Marge de 10 pt autour de la page | M-2 | ✅ | 8 px (W:14-16) | Fait le 8 oct. (cotes et durées d'Arc) |
| BL-11 | La page est dans un cadre coloré aux coins arrondis, volontairement visible | inverse (entretien) ; observé | ✅ | W:layout, rayon 10 ; ui 02 | Rayon exact d'Arc non mesuré |
| BL-12 | Zone vide de la barre : sert à déplacer la fenêtre | HC 20498417809815 | ✅ | zones `drag` dans `#top` et `#empty` ; aucun test | Le haut de la barre (entre les boutons) déplace la fenêtre ; les boutons et le bord non. Le vide sous les onglets sert au double-clic « nouvel onglet » (BL-14) : une zone de déplacement d’Electron avale les clics, les deux ne peuvent pas cohabiter. self fin2 « le haut de la barre (entre les boutons) déplace la fenêtre… » ; ui 29 (zone lue sous le pointeur ; un vrai déplacement de fenêtre ne se pilote pas par Playwright) |
| BL-13 | On peut déplacer la fenêtre par le haut de la page (réglage, ⌘ pour neutraliser) | HC 20498377604887 ; binaire « Allow window dragging from the top of webpages » | ✅ | aucun code | La marge de 10 px au-dessus de la page déplace la fenêtre, de la barre latérale au bord droit (avec la barre d’outils, c’est elle). La bande est dans la marge d’Orbe, pas sur la page : rien à neutraliser par ⌘, donc pas de réglage. self fin2 « bande au-dessus de la page… » ; ui 29 « au-dessus de la page, une bande déplace la fenêtre… » (zone lue sous le pointeur ; un vrai déplacement de fenêtre ne se pilote pas par Playwright) |
| BL-14 | Double-clic dans le vide de la barre : nouvel onglet (barre de commande) | HC 20498377604887 | ✅ | aucun code | ui 22 « double-clic dans le vide de la liste : la barre de commande s’ouvre » |
| BL-15 | Glisser du texte sur la barre : recherche dans un nouvel onglet | HC 20498377604887 | ✅ | SH (dépôt), W:handle « dropUrl » | Texte déposé : recherche dans un nouvel onglet ; lien déposé : sa page ; jamais javascript:, file: ni orbe:. self fin (3), self (refus) |
| BL-16 | La barre s'estompe légèrement quand la fenêtre perd le focus | HC 20498377604887 | ✅ | aucun code | Contenu de la barre à 70 % d’opacité (état « side.focused ») ; self lat « fenêtre à l’arrière-plan : le contenu de la barre s’estompe » |
| BL-17 | Indicateur de débordement quand l'onglet actif est hors de vue dans la liste | HC 20498377604887 | ✅ | aucun code | Repère en haut ou en bas de la liste, un clic y ramène ; self lat ; ui 22 « onglet affiché hors de vue » |
| BL-18 | Infobulles maison avec le raccourci, au survol des boutons | HC 20498417809815 | ✅ | attribut `title` natif | Infobulle maison après une demi-seconde de survol : nom du bouton et raccourci en vigueur (celui que l’utilisateur a choisi s’il l’a changé), placée dans la barre latérale ; « Actualiser » devient « Arrêter le chargement » pendant un chargement ; plus de « title » natif sur ces boutons (aria-label à la place). self fin2 (6 vérifications) ; ui 29 « pointeur posé sur « actualiser »… » |
| BL-19 | Boutons en haut : afficher/masquer la barre, précédent, suivant, actualiser | observé (capture) | ✅ | `shell.html` ; ui 09 | |
| BL-20 | Appui long ou clic droit sur précédent/suivant : historique de l'onglet | HC 20498377604887 | ✅ | aucun code | W:navMenu (15 pages au plus) ; ui 22 (clic droit, appui long de 500 ms) ; self lat |
| BL-21 | ⌘clic ou clic molette sur précédent/suivant : ouvre dans un nouvel onglet | HC 20498377604887 | ✅ | aucun code | Nouvel onglet derrière, sous l’onglet courant ; ui 22 (⌘clic, clic molette) ; self lat |
| BL-22 | ⌘clic sur actualiser : duplique l'onglet | HC 20498377604887 | ✅ | aucun code | ui 22 « ⌘clic sur actualiser : l’onglet est dupliqué » |
| BL-23 | Le bouton actualiser a un menu d'options (forcer, effacer cookies) | binaire « A button that shows a list of reload options » | ✅ | aucun code | Actualiser, forcer, effacer les cookies, effacer le cache ; ui 22 ; self lat |
| BL-24 | Échap ou double-clic sur actualiser arrête le chargement | HC 20498377604887 | ✅ | bouton qui devient ✕ ; ⌘. ; ui 09 | ui 22 (double-clic, Échap injecté dans la page) ; self lat. Échap depuis un champ de l’interface n’arrête rien |
| BL-25 | Boutons animés (plus, fermer, actualiser, précédent, suivant) | HC 20498417809815 | ✅ | transitions de fond seulement | « Actualiser » fait un tour, les flèches partent dans leur sens, le « + » pivote, les boutons se pressent ; ui 23 « boutons animés : … » |
| BL-26 | Pastille d'adresse : 35 pt de haut, coins de 11 pt, adresse raccourcie | `docs/analyse-arc.md` (mesuré) | ✅ | SC `#url` 36 px r11 ; ui 11 | |
| BL-27 | Texte par défaut « Search or Enter URL… » | observé | ✅ | locales | |
| BL-28 | Pas de cadenas pour un site sûr ; icône explicite pour un site non sûr | HC 20498377604887 | 🟡 | `#lock` (SH), certs.js | Orbe affiche un cadenas discret en https (Arc : rien) et « Non sécurisé » en http ou certificat refusé ; self « état de la connexion… » ; ui 20. Seul écart : le cadenas des sites sûrs, gardé parce qu’un clic dessus ouvre le certificat — choix à trancher par le propriétaire |
| BL-29 | Bouton de copie du lien dans la pastille, au survol | HC 20498377604887 | ✅ | aucun code | ui 22 « pastille d’adresse : Copier le lien paraît au survol et copie l’adresse » |
| BL-30 | Extensions épinglées visibles dans la pastille au survol | HC 19434259167767 | ➖ | boutons `#exts` sous la pastille ; ui 14 | Écart voulu : les boutons d’extension sont sous la pastille d’adresse (ui 14), ou à droite de l’adresse quand la barre d’outils est affichée (DIV-1) — toujours visibles, sans survol ; Arc les montre dans la pastille, au survol. La fonction existe et est vérifiée ; seul l’emplacement d’Arc n’est pas repris |
| BL-31 | Bouton du centre de contrôle du site, à droite de l'adresse | HC 19434259167767 ; binaire | ✅ | bouclier + menu natif (W:shieldMenu) | Le bouclier ouvre le centre de contrôle du site (feuille d’Orbe ancrée du côté de l’adresse) ; le clic droit garde le menu ; self « le bouclier ouvre le centre de contrôle… » (essentiels) ; ui 20 « bouclier → centre de contrôle… » |
| BL-32 | Indicateur de chargement animé, en haut au centre de la fenêtre (lueur) | HC 20498377604887 ; binaire `ARC_GlowProgressLoadingIndicator` (shader Metal) | ✅ | balayage dans la pastille (SC `sweep` 1,1 s) | Lueur aux couleurs de l’Espace le long du bord haut de la page (`#glow`, transformation seule) ; self fin2 « page en chargement : la lueur est posée le long du bord haut de la page… » ; ui 23 « chargement : une lueur… » |
| BL-33 | Favoris : tuiles en haut, communes aux Espaces d'un même profil | HC 19230755904151 | ✅ | SH `#fav` ; self « ajout aux favoris » | |
| BL-34 | 12 favoris au plus | HC 19230755904151 | ✅ | pas de limite lue dans le code | Treizième refusé avec un message, au menu comme au glisser ; self lat (4 vérifications) |
| BL-35 | Tuile de 47 pt de haut, coins de 14 pt, espacement de 8 pt ; 3 × 3 pour 9, 4 colonnes pour 11 | `docs/analyse-arc.md` (mesuré) | ✅ | SC `.tile` ; ui 04 | |
| BL-36 | État vide des favoris : « Drag to add Favorites » | binaire | ✅ | zone en pointillés pendant un glisser seulement | Invitation affichée dans la zone en pointillés pendant un glisser (pas en permanence) ; ui 23 |
| BL-37 | Pastilles de notification sur les favoris (Gmail, Slack, WhatsApp, X, Agenda) | https://arc.net/integrations ; binaire (couleurs de badge) | ✅ | SH:tileEl (pastille `.count`) | Pastille sur la tuile d’un favori : le nombre que le site annonce en tête de son titre (« (3) Boîte de réception »), tant que sa page est chargée ; plafonnée à « 99+ ». Vaut pour tout site, sans liste. self fin (2) ; ui 28 |
| BL-38 | Favori d'un site de musique qui joue : icône animée par des notes | HC 20498417809815 | 🟡 | point de 4 px si audible | Trois barres dansent sur la tuile d’un favori qui joue du son (transformation seule ; fixes avec « Réduire les animations ») ; self fin2 « favori qui joue du son : trois barres dansent… ». Des barres, pas des notes ; pas d’essai à la vraie souris avec un vrai son : à constater à l’œil |
| BL-39 | Icône d'un favori personnalisable | HC 20498293324823 | ✅ | W:openIcons, icons.js, emojis.js | Menu de l’onglet (épinglé, favori ou du jour) → « Changer l’icône… » : sélecteur d’émojis (recherche français/anglais, teintes de peau, clavier) ; l’émoji remplace l’icône du site sur la ligne ou la tuile ; « Réinitialiser le nom et l’icône » ; ⌘Z. Texte vérifié dans le processus principal (icons.js). self fin (14 vérifications) ; ui 28 |
| BL-40 | Titre de l'Espace cliquable pour renommer ; « … » au survol | HC 20498377604887 | ✅ | double-clic ; ui 03 | Clic sur le texte du nom = renommer ; « … » au survol = menu de l’Espace ; ui 22 (3 vérifications) |
| BL-41 | Chevron pour replier la section épinglée | HC 19231060187159 ; menu « Collapse Pinned Tabs » | ✅ | aucun code | Chevron dans l’en-tête et menu Présentation ; seul l’onglet affiché reste visible ; self lat ; ui 22 |
| BL-42 | Séparateur avec « Clear » au survol | HC 20498377604887 | ✅ | SH `#b-clear` ; ui 02 | |
| BL-43 | Ligne « + New Tab » en tête des onglets du jour | observé | ✅ | `#b-newtab` ; ui 01 | |
| BL-44 | Les nouveaux onglets arrivent en haut | observé | ✅ | W:createTab ; self | |
| BL-45 | Pas des lignes d'onglet de 41 pt, texte d'environ 14 pt | `docs/analyse-arc.md` | ✅ | SC `.row` ; ui 11 | |
| BL-46 | Croix de fermeture au survol d'une ligne | observé (habituel) ; binaire (infobulle) | ✅ | ui 02 | |
| BL-47 | Bouton haut-parleur sur un onglet qui joue ; clic = muet | binaire « mutes the tab » | ✅ | SH:61,308 ; aucun test | ui 22 : le haut-parleur d’une ligne muette, un clic rétablit le son sans afficher l’onglet. Onglet réellement audible : non couvert par un test d’interface |
| BL-48 | Indicateur animé micro/caméra ; onglet partagé surligné en jaune | HC 25590627478935 | ✅ | témoin caméra / micro / écran sur la ligne de l’onglet et dans la pastille d’adresse (capture-state.js) ; self « le témoin apparaît dans la pastille d’adresse et sur la ligne de l’onglet » ; ui « témoin de partage… » | Témoin caméra / micro / écran sur la ligne de l’onglet et dans la pastille d’adresse, qui battent doucement (immobiles avec « Réduire les animations ») ; l’onglet dont l’écran est partagé est surligné en jaune. self « le témoin apparaît… », self fin2 « onglet dont l’écran est partagé : sa ligne est surlignée en jaune… » ; ui 20 « témoin de partage sur la ligne de l’onglet… » (liseré jaune vérifié). Le témoin reste allumé jusqu’au changement de page (Electron ne dit pas si un flux est encore ouvert) |
| BL-49 | « / » sur un épinglé qui a quitté son adresse ; clic sur l'icône = retour | HC 25625148480279 | ✅ | SH:36-37 ; aucun test | ui 22 « épinglé sorti de son adresse : / sur la ligne ; clic sur l’icône = retour » ; self lat |
| BL-50 | ⌘clic sur l'icône d'un épinglé : retour à l'adresse, l'ancienne page part dans un nouvel onglet | HC 20498293324823 | ✅ | aucun code | W:resetPinnedAside ; ui 22 (⌘clic réel) ; self lat |
| BL-51 | Double-clic sur un onglet pour le renommer | HC 19231060187159 ; binaire « Double-click to rename » | ✅ | épinglés seulement ; ui 03 | Dossiers, épinglés et onglets du jour ; ui 03, ui 22 |
| BL-52 | Icône d'un onglet personnalisable (émoji) ; « Reset Name and Icon » | HC 20498293324823 ; binaire | ✅ | W:openIcons, W:resetNameIcon | Menu de l’onglet (épinglé, favori ou du jour) → « Changer l’icône… » : sélecteur d’émojis (recherche français/anglais, teintes de peau, clavier) ; l’émoji remplace l’icône du site sur la ligne ou la tuile ; « Réinitialiser le nom et l’icône » ; ⌘Z. Texte vérifié dans le processus principal (icons.js). self fin (14 vérifications) ; ui 28 |
| BL-53 | Sélection multiple (⇧clic, ⌘clic) ; ⌘W et ⇧⌘C agissent sur la sélection ; menu commun, glisser le lot | HC 20498417809815 | ✅ | `SH:setSel`, `W:checkIds` (listes d’identifiants vérifiées) ; self « sélection : … » (tests/barre.js) ; ui 16 | La sélection part de l’onglet affiché, comme dans Chrome (non vérifié sur Arc) ; ⌘D et Suppr agissent aussi sur elle ; menu de la sélection : copier les liens, dupliquer, épingler, favoris, dossier, déplacer vers un Espace, archiver |
| BL-54 | Rangée du bas : Bibliothèque, icônes des Espaces, « + » | observé | ✅ | `#bottom` ; ui 06 | |
| BL-55 | « + » du bas : New Space, New Folder, New Split View, New Easel, New Boost, New Note | HC 19231142050071 ; binaire (icônes `add-space`, `folder`, `split-add-right`…) | ✅ | menu : onglet, dossier, Espace, thème | Onglet, dossier, Espace, vue scindée, tableau, note, Boost ; ui 22 ; self lat |
| BL-56 | Bandeau de mise à jour en bas de la barre | observé « New Arc Version Available » ; HC 21489650267031 | ✅ | note de la barre latérale (`#update-note`, `updates.js`) ; self « barre latérale : une ligne discrète annonce la version », « « Plus tard » : la note disparaît et ne revient pas pour cette version », « le lendemain : … une version plus récente que celle écartée se signale » ; ui 24 « barre latérale : note « Orbe 9.1.0 est disponible »… » | ligne « Orbe X est disponible » au-dessus des Espaces, × pour l’écarter (elle revient pour une version plus récente) ; un clic ouvre la carte des mises à jour. Orbe ne se remplace pas lui-même : voir IMP-10 |
| BL-57 | Téléchargement en cours affiché en bas de la barre (taille, temps restant, annuler) | HC 20498377604887 | ✅ | anneau de progression sur le bouton Bibliothèque | Une ligne par téléchargement en cours au bas de la barre (trois au plus) : nom, taille reçue sur taille totale, temps restant (débit lissé), trait de progression, « × » pour annuler ; un clic ouvre les téléchargements de la Bibliothèque ; l’anneau du bouton Bibliothèque reste. self fin2 (7 vérifications) ; ui 29 « téléchargement en cours : une ligne au bas de la barre… » |
| BL-58 | Lecteur audio miniature en bas de la barre | HC 19234766331799 | ✅ | `#media` ; voir BIB | Lecteurs miniatures au bas de la barre (pochette, titre, commandes, volume, avancement), empilés ; self medias ; ui 26 (11 vérifications) |
| BL-59 | Fenêtre privée : barre noire, mention « Incognito » | observé (capture) ; HC 20498377604887 | ✅ | `#incognito` ; self « navigation privée » | |
| BL-60 | Survol d'un lien : pastille d'état en bas, qui s'étend à l'adresse entière après 1,5 s et s'écarte de la souris | HC 20498377604887, 20498293324823 | ✅ | statut de lien (W:1498) | Pastille courte en bas à gauche, qui s’étend à toute l’adresse quand le pointeur reste sur le lien, et passe de l’autre côté quand le pointeur vient dessus ; self details « adresse longue survolée… », « pointeur resté sur le lien… », « pointeur sur la pastille : elle s’écarte… » |

### Dossiers

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| BL-70 | Dossiers dans la section épinglée | HC 19228419623447 | ✅ | W:newFolder ; ui 05 | |
| BL-71 | Dossiers imbriqués | HC 20498377604887 ; binaire « New Nested Folder » | ✅ | W:move ; self « dossier imbriqué… » | |
| BL-72 | Un dossier fermé laisse voir l'onglet actif qu'il contient | HC 20498377604887 | ✅ | SC:378-380 ; ui 05 | |
| BL-73 | Ouverture/fermeture animée | non vérifié | ✅ | chevron animé, contenu sans animation | Ouverture : le contenu paraît et la suite glisse ; fermeture : elle remonte (FLIP, sans mise en page pendant le mouvement) ; ui 23 « dossier : l’ouvrir fait paraître son contenu et glisser la suite ; le replier la fait remonter » |
| BL-74 | Aperçu du dossier au survol : liste cherchable de ses onglets | HC 19228419623447 | ✅ | aucun code | Survol d’un dossier replié (450 ms) : un panneau, dans la barre latérale et par-dessus les lignes (elles ne bougent pas), liste ses onglets, sous-dossiers compris, avec un champ qui filtre par titre, adresse ou sous-dossier (sans accents) ; clic ou Entrée affiche l’onglet, dossier toujours replié ; rien pour un dossier vide, ouvert, ou pendant un glisser (src/renderer/folderpeek.js ; titres posés par textContent, aucun message nouveau vers le processus principal) ; self tests/derniers.js (5 vérif. « dossier replié survolé… », « aperçu d’un dossier… ») ; ui 30 (3 vérif., vraie souris et vrai clavier) |
| BL-75 | Icône du dossier modifiable (« Change Icon ») | HC 20498377604887 | ✅ | W:openIcons, SH:folderRow | Menu du dossier → « Changer l’icône… » : même sélecteur ; l’émoji remplace le dessin du dossier ; ⌘Z. self fin ; ui 28 |
| BL-76 | Un dossier fermé ne s'ouvre pas quand on glisse dessus ; animation de dépôt | HC 20498377604887 | ✅ | dépôt géré (ui 04), sans animation | Un dossier fermé survolé pendant un glisser est mis en évidence sans s’ouvrir ; au dépôt l’onglet y entre, le dossier reste fermé et son icône rebondit une fois (transformation seule, rien avec « Réduire les animations ») ; self fin2 « déposer un onglet dans un dossier fermé… », « dépôt dans un dossier : son icône rebondit… » ; ui 29 « glisser un onglet sur un dossier fermé… » |
| BL-77 | Supprimer un dossier archive ses onglets, avec message et annulation | binaire « Deleting this folder will archive the tabs inside it. » | ✅ | W:deleteFolder, W:removeFolder | Comme dans Arc : un dossier garni demande confirmation (« Les onglets qu’il contient iront dans l’archive »), ses onglets (sous-dossiers compris) sont archivés, un message rappelle ⌘Z, qui remet le dossier, ses onglets et ses vues scindées ; vide, il part sans question. self fin (8) ; ui 28, ui 18 |
| BL-78 | Dossier transformable en Espace, et Espace en dossier | binaire « Turn into Folder » | ✅ | W:folderToSpace, W:spaceToFolder | Menu du dossier → « Transformer en Espace » (Espace à son nom et son icône, juste après, même profil) ; menu de l’Espace → « Transformer en dossier » (dossier dans l’Espace voisin, onglets du jour joints). Aucun onglet fermé ni rechargé, vues scindées conservées, ⌘Z / ⇧⌘Z. self fin (9) |
| BL-79 | « New Folder from Selection » | binaire | ✅ | `W:folderFromSelection` ; self « Nouveau dossier avec la sélection » ; ui 16 | Le dossier prend la place du premier onglet épinglé de la sélection |
| BL-80 | Commandes « Expand All Folders » / « Collapse All Folders » | binaire | ✅ | aucun code | Commandes de la barre de commande et du menu du vide de la barre ; self lat |
| BL-81 | Dossiers vivants GitHub (demandes de fusion) | HC 22731612065815 | ➖ | | Dépend d'un service tiers ; hors du socle |

### Glisser-déposer

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| BL-90 | Réordonner les onglets | observé (habituel) | ✅ | ui 04 | |
| BL-91 | Glisser à travers le séparateur pour épingler ou désépingler | HC 19231060187159 | ✅ | ui 04 | |
| BL-92 | Glisser vers ou depuis les favoris | HC 19230755904151 | ✅ | ui 04 | |
| BL-93 | Glisser dans un dossier | HC 19228419623447 | ✅ | ui 04 ; self | |
| BL-94 | Glisser un onglet à gauche ou à droite vers un autre Espace | HC 20498417809815 | ✅ | pas de dépôt sur les pastilles | Dépôt sur la pastille de l’Espace visé (Arc : glisser vers le bord, la barre défile) ; ui 23 ; self lat ; ⌘Z |
| BL-95 | Glisser un onglet hors de la fenêtre : nouvelle fenêtre | HC 20498377604887 | ✅ | aucun code | Onglet (ou sélection) lâché hors de la fenêtre : nouvelle fenêtre ordinaire posée sous le pointeur, qui l’affiche ; la première passe à l’onglet voisin. Les fenêtres montrent les mêmes Espaces : l’onglet reste dans sa liste. La position vient du système, jamais de l’interface ; pas en navigation privée ni en fenêtre vierge. W:tearOff ; self fin2 (5 vérifications) ; ui 29 « glisser un onglet hors de la fenêtre… » |
| BL-96 | Glisser entre deux fenêtres | non vérifié | ✅ | ignoré volontairement (SH:586) | Onglet lâché sur une autre fenêtre d’Orbe (sa barre latérale ou sa page) : c’est elle qui l’affiche, la première passe au voisin. W:adopt ; self fin2 « onglet lâché sur une autre fenêtre d’Orbe… », « ligne d’une autre fenêtre lâchée sur la barre latérale… », « fenêtre privée… » ; ui 29 « ligne lâchée sur la barre latérale de l’autre fenêtre… » (dépôt envoyé par le protocole DevTools : Playwright ne glisse pas d’une fenêtre à l’autre) |
| BL-97 | Glisser un onglet sur la page : vue scindée, le côté dépend de l'endroit du dépôt | HC 20498293324823 | ✅ | moitié droite seulement ; self « lâcher un onglet sur la page… » | Page seule : quart haut ou bas = vue empilée (au-dessus, au-dessous), le reste = gauche ou droite ; la zone de dépôt éclaire la moitié visée. Vue déjà scindée : elle garde son sens. self fin2 (7 vérifications) ; ui 29 « glisser un onglet en haut de la page… », « …au milieu, à droite… » ; ui 12 |
| BL-98 | Glisser un onglet sur un autre dans la barre : vue scindée | HC 20498293324823 | ➖ | aucun code | Écarté, volontairement : dans les listes d’Orbe les lignes s’écartent sous l’onglet glissé, le pointeur n’est donc jamais posé durablement « sur » une autre ligne ; y ajouter un dépôt « scinder » changerait le réordonnancement (ui 04, 17, 21). Le besoin est couvert autrement : ⌥clic sur un onglet, ou le lâcher sur la page (BL-97, quatre côtés ; bulle et rebond, ANI-12) |
| BL-99 | ⌥glisser un onglet : le duplique | HC 19231060187159 | ✅ | aucun code | W:copyTo ; ui 23 (⌥ tenu pendant un vrai glisser) ; self lat |
| BL-100 | Retour haptique léger pendant le déplacement d'un onglet | HC 20498377604887 ; binaire « Haptic feedback when reordering tabs » | ➖ | aucun code | Même cause que SON-6 : Electron n’expose aucune interface haptique, et Orbe n’embarque aucun module natif |
| BL-101 | Les lignes voisines s'écartent pendant le glisser | non vérifié | ✅ | `SH:measure`, `SH:part` ; ui 17 (9 vérifications, dont 404 lignes) | Place libre teintée à la place du trait ; la ligne emportée laisse la sienne ; « Réduire les animations » respecté. Le trait vertical reste dans la grille des favoris |
| BL-102 | Réordonner les Espaces en glissant leur icône | binaire « Drag to Reorder Space » | ✅ | aucun code | W:moveSpace, trait de dépôt, ⌘Z ; ui 23 (2 glissers réels) ; self lat |
| BL-103 | Message « Tab moved! Click to go there. » après un déplacement | binaire | ✅ | aucun code | Message « Onglet déplacé vers … — clique pour y aller » après un déplacement vers un autre Espace (un seul pour une sélection) ; le clic mène à l’onglet. self fin (4) |

### Menus contextuels de la barre

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| BL-110 | Onglet : Copy Link | binaire ; HC 20498417809815 | ✅ | W:tabMenu ; aucun test du menu | W:tabMenuTemplate ; self lat (chaque article actionné, ⌘Z vérifié) ; ui 22 pour le lien Markdown et « au-dessus » |
| BL-111 | Onglet : Copy link as Markdown | binaire | ✅ | absent du menu (commande ⌥⇧⌘C existe) | W:tabMenuTemplate ; self lat (chaque article actionné, ⌘Z vérifié) ; ui 22 pour le lien Markdown et « au-dessus » |
| BL-112 | Onglet : Duplicate | HC 19231060187159 | ✅ | W:duplicate ; aucun test | W:tabMenuTemplate ; self lat (chaque article actionné, ⌘Z vérifié) ; ui 22 pour le lien Markdown et « au-dessus » |
| BL-113 | Onglet : Rename | HC 19231060187159 | ✅ | ui 03 | |
| BL-114 | Onglet : Change Icon | HC 20498417809815 | ✅ | W:tabMenuTemplate | Menu de l’onglet (épinglé, favori ou du jour) → « Changer l’icône… » : sélecteur d’émojis (recherche français/anglais, teintes de peau, clavier) ; l’émoji remplace l’icône du site sur la ligne ou la tuile ; « Réinitialiser le nom et l’icône » ; ⌘Z. Texte vérifié dans le processus principal (icons.js). self fin (14 vérifications) ; ui 28 |
| BL-115 | Onglet : Mute / Unmute | binaire | ✅ | W:toggleMute ; aucun test | W:tabMenuTemplate ; self lat (chaque article actionné, ⌘Z vérifié) ; ui 22 pour le lien Markdown et « au-dessus » |
| BL-116 | Onglet : Move to (favoris, Espaces, dossiers) | HC 19230755904151 | ✅ | vers un Espace (self) et favoris ; pas vers un dossier | W:tabMenuTemplate ; self lat (chaque article actionné, ⌘Z vérifié) ; ui 22 pour le lien Markdown et « au-dessus » |
| BL-117 | Onglet : Pin / Unpin | binaire | ✅ | self ⌘D | |
| BL-118 | Onglet : Open in Split View | binaire | ✅ | W:tabMenu | W:tabMenuTemplate ; self lat (chaque article actionné, ⌘Z vérifié) ; ui 22 pour le lien Markdown et « au-dessus » |
| BL-119 | Onglet : Archive this tab | binaire | ✅ | self ⌘W | |
| BL-120 | Onglet : Archive Tabs Below | binaire | ✅ | présent ; aucun test | W:tabMenuTemplate ; self lat (chaque article actionné, ⌘Z vérifié) ; ui 22 pour le lien Markdown et « au-dessus » |
| BL-121 | Onglet : Archive Tabs Above | binaire | ✅ | | W:tabMenuTemplate ; self lat (chaque article actionné, ⌘Z vérifié) ; ui 22 pour le lien Markdown et « au-dessus » |
| BL-122 | Onglet : Archive Other Tabs | binaire | ✅ | | W:tabMenuTemplate ; self lat (chaque article actionné, ⌘Z vérifié) ; ui 22 pour le lien Markdown et « au-dessus » |
| BL-123 | Onglet : New Folder with… (sélection) | binaire | ✅ | `W:tabsMenu` ; ui 16 « menu de la sélection : Nouveau dossier avec la sélection » | |
| BL-124 | Onglet : Share | HC 19228534606743 | ➖ | | Demande un serveur de partage |
| BL-125 | Épinglé : Edit Pinned Page → Replace Pinned URL with Current, Edit… | HC 25541939922199 ; binaire | ✅ | W:tabMenuTemplate, W:editPinned | « Remplacer l’adresse épinglée par l’adresse actuelle » (self lat) ; « Modifier l’adresse épinglée… » ouvre la barre d’adresse sur l’adresse de l’épinglé ou du favori, l’adresse validée devient la sienne (⌘Z). self fin (3) ; ui 28 |
| BL-126 | Épinglé : Close and Keep Pinned | binaire | ✅ | ⌘W le fait (self) ; pas d'entrée de menu | W:tabMenuTemplate ; self lat (chaque article actionné, ⌘Z vérifié) ; ui 22 pour le lien Markdown et « au-dessus » |
| BL-127 | Vue scindée : Separate All Tabs, muet par onglet, Duplicate | HC 19335393146775 | ✅ | W:paneMenuTemplate | « Séparer tous les onglets » (self lat) ; menu « ⋯ » d’un volet : « Dupliquer » et « Couper le son » propres au volet. self fin (3), self fen (menu d’un volet) |
| BL-128 | Dossier : Rename | HC 19228419623447 | ✅ | ui 05 | |
| BL-129 | Dossier : Delete | HC 19228419623447 | ✅ | self « dossier supprimé » | |
| BL-130 | Dossier : Duplicate, Change Icon, Copy All Links, Copy All Links as Markdown, New Nested Folder, Paste URL as New Tab, Close This Folder | HC 20498377604887 ; binaire | ✅ | W:folderMenuTemplate | Tout y est, « Changer l’icône… » compris (voir BL-75) ; self lat (12 vérifications), self fin ; ui 23, ui 28 |
| BL-131 | Espace : Rename, Edit Theme Color, Change Space Icon, Profile, Delete | HC 19228534606743 ; binaire | ✅ | W:spaceMenu (renommer, thème, supprimer) ; aucun test du menu | Renommer, thème, icône (ouvre l’éditeur de thème), profil, en-tête, supprimer ; self lat ; ui 22 |
| BL-132 | Espace : Show/Hide Space Header, Manage Spaces, Export | binaire | ✅ | W:spaceMenuTemplate | En-tête affiché ou masqué (self lat, ESP-18) ; « Gérer les Espaces… » (self fin ; ui 28) ; « Exporter l’Espace… » écrit un fichier de signets HTML (épinglés avec leurs dossiers, onglets du jour ; titres et adresses échappés, pages d’Orbe écartées), que l’import d’Orbe relit ; self fin2 (5 vérifications) ; ui 29 « clic droit sur l’en-tête de l’Espace → « Exporter l’Espace… »… » |
| BL-133 | Zone vide : thème, profil | HC 19228064149143 | ✅ | W:sidebarMenu | Thème, profil, dossiers à déplier ou replier ; self lat ; ui 22 (clic droit réel) |
| BL-134 | Favori : Show Unread Badge, Show Hover Preview | binaire | 🟡 | | « Afficher la pastille de notification » : case du menu d’un favori, par favori (self fin2, 3 vérifications ; ui 29 « favori : la pastille montre le nombre… »). « Show Hover Preview » : pas d’aperçu au survol des favoris dans Orbe, donc pas de case |

## CMD — Barre de commande

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| CMD-1 | ⌘T ouvre la barre, sans créer d'onglet tant que rien n'est validé | HC 20595231349911 ; menu | ✅ | W:openCommand ; self ; ui 01 | |
| CMD-2 | ⌘L modifie l'adresse de l'onglet actif | menu ; HC 20498377604887 | ✅ | self « ⌘L remplace l'adresse… » | |
| CMD-3 | Le même raccourci referme la barre | M-12 | ✅ | ui 01 ; nat | |
| CMD-4 | Largeur d'environ 763 pt, centrée sur la fenêtre | M-6 | ✅ | 680 px (OC) | Fait le 8 oct. (cotes et durées d'Arc) |
| CMD-5 | Bord haut à un tiers de la hauteur | M-7 | ✅ | 19 vh | Fait le 8 oct. (cotes et durées d'Arc) |
| CMD-6 | Lignes de 46 pt | M-8 | ✅ | 42 px | Fait le 8 oct. (cotes et durées d'Arc) |
| CMD-7 | Pas d'assombrissement derrière, grande ombre | M-9 | ✅ | OC ; W | Fond transparent, ombre de 70 px ; self cmd « aucun voile sur la page, grande ombre portée » |
| CMD-8 | Sélection en aplat de couleur, texte blanc | M-10 | ✅ | OC:41-56 ; ui 01 | |
| CMD-9 | Elle prend les couleurs de l'Espace | HC 20498417809815 | ✅ | OV:applyLook | Accent et panneau teinté de l'Espace ; self cmd « elle prend les couleurs de l’Espace » |
| CMD-10 | Nouvelle fenêtre : la barre s'ouvre seule | M-11 | ✅ | C:greet | ⌘N et ⇧⌘N : la fenêtre sans onglet s'ouvre sur la barre (pas au démarrage) ; self cmd « ⌘N : la fenêtre neuve… » ; ui 24 |
| CMD-11 | Sources : onglets ouverts de tous les Espaces, historique, archive, épinglés, suggestions du moteur, actions | howtogeek | ✅ | SU ; self (historique, actions, bascule) | |
| CMD-12 | Ligne « Switch to Tab », y compris vers une vue scindée | HC 20498417809815 ; binaire « Switch to Split View » | ✅ | self « Basculer vers l'onglet » | Mention de vue scindée absente |
| CMD-13 | ⇥ juste après ⌘T : cherche seulement dans les actions | HC 20498293324823 | ✅ | OV ; SU | ⇥ sur barre vide : pastille « Actions », liste déroulante ; ⌫ quitte ; self cmd « portée Actions » ; ui 24 (5 vérifications) |
| CMD-14 | Recherche dans un site : raccourci du site, ⇥ ou espace, requête | HC 20855018192791 ; binaire | ✅ | | 19 sites (palette.js) : nom ou abréviation puis ⇥, domaine puis espace ; ligne cliquable ; self cmd « recherche dans un site » ; ui 24 |
| CMD-15 | Survol d'une suggestion : croix pour la supprimer ; ⌥⌘⌫ au clavier | HC 20498377604887 ; binaire « Delete Suggestion » | ✅ | | Croix au survol et ⌥⌘⌫ (historique, archive) ; self cmd « oublier une suggestion » ; ui 24 (3 vérifications) |
| CMD-16 | ⌘L puis Entrée sans rien changer : recharge | HC 20498293324823 | ✅ | W:runItem | self cmd « ⌘L puis Entrée sans rien changer » ; ui 24 |
| CMD-17 | La barre latérale reste cliquable quand la barre est ouverte | HC 20498293324823 | ✅ | `palette.js` | Clic sur le fond rendu à la barre latérale (palette.clickThrough) ; self cmd ; ui 24 (onglet, bouton Actualiser) |
| CMD-18 | Complétion de l'adresse dans le champ | observé (habituel) | ✅ | OV:query ; ui 01 | |
| CMD-19 | Dédoublonnage par titre et site pour certains domaines (Figma, Notion, GitHub…) | binaire `command_bar_behavior.json` | ✅ | | Liste d'Arc reprise (suggest.DEDUP_HOSTS) ; self cmd « une seule ligne par titre pour GitHub et Figma » |
| CMD-20 | Taper le nom d'une extension la déclenche | HC 19434259167767 | ✅ | | self cmd « taper le nom d’une extension la déclenche » |
| CMD-21 | Taper le nom d'un Espace : « Focus on <space> » | binaire | ✅ | | self cmd « Aller à l’Espace … » ; ui 24 |
| CMD-22 | Taper le nom d'un dossier : l'ouvre | HC 20498417809815 | ✅ | | Ouvre le dossier et ses parents, le montre ; self cmd « taper le nom d’un dossier » |
| CMD-23 | État vide : suggestions d'aide (Contact the Team, The Browser Company, Air Traffic Control, Tips for Organizing, Help Center) | mesuré (capture) | ✅ | `palette.js`:starters | Sans aucun onglet : accueil, raccourcis, aide, réglages ; sinon onglets récents ; self cmd ; ui 24 |
| CMD-24 | Message de confidentialité des suggestions de recherche | binaire | ➖ | | Écarté : les suggestions du moteur sont un réglage explicite (« Suggestions de recherche »), pas un message dans la barre |
| CMD-25 | ⌘Entrée : ouvre en arrière-plan | non vérifié | ✅ | ui 01 | |
| CMD-26 | ⇧Entrée : ouvre directement le premier résultat (Instant Links) | HC 20498293324823 | ➖ | | Fonction d'IA, écartée |
| CMD-27 | ChatGPT dans la barre (⌥⌘G) | HC 19335160678679 | ➖ | | Fonction d'IA, écartée |
| CMD-28 | Copier depuis la barre ajoute https | HC 20498417809815 | ✅ | | Copie de l'adresse entière : protocole ajouté ; ui 24 « copier l’adresse entière » |

Actions de la barre de commande relevées dans Arc (libellés du binaire et du centre d'aide). État : ✅ si Orbe propose l'action (test self « la barre de commande propose des actions »), ⬜ sinon.

| Id | Action d'Arc | État | Note |
| --- | --- | --- | --- |
| CMD-40 | Pin Tab / Unpin | ✅ | |
| CMD-41 | Reset Tab (retour à l'adresse épinglée) | ✅ | Proposée quand l'épinglé a quitté son adresse ; self cmd |
| CMD-42 | Replace Pin with Current Page | ✅ | self cmd « Remplacer l’adresse épinglée… » |
| CMD-43 | Duplicate Current Tab | ✅ | self cmd « Dupliquer l’onglet » |
| CMD-44 | Rename Current Tab | ✅ | self cmd « Renommer l’onglet » |
| CMD-45 | Move to Favorites / Remove from Favorites | ✅ | Libellé selon l'onglet ; self cmd (3 vérifications) |
| CMD-46 | Move to Today in <Espace> / Move to Pinned in <Espace> | ✅ | Par Espace, annulable d'un coup ; self cmd (5 vérifications) |
| CMD-47 | New Folder ; Expand All Folders ; Collapse All Folders | ✅ | self cmd (liste des actions) |
| CMD-48 | Collapse Pinned / Expand Pinned | ✅ | self cmd (liste des actions) |
| CMD-49 | New Space ; Manage Spaces ; Focus on <Espace> | ✅ | « Gérer les Espaces… » ouvre la section Espaces de la Bibliothèque ; self cmd, self bib ; ui 24, ui 25 |
| CMD-50 | Add Split View ; Add Right/Left/Top/Bottom Split | ✅ | « Ajouter une vue scindée », et « Ajouter un volet à droite / à gauche / en haut / en bas » : la page choisie se place de ce côté de la page affichée (haut et bas : vue empilée). self fin (7) |
| CMD-51 | Convert to Horizontal/Vertical Split View | ✅ | self « vue scindée empilée » |
| CMD-52 | New Window ; New Blank Window ; New Incognito Window ; Open Little Arc | ✅ | Fenêtre, fenêtre vierge, navigation privée, petite fenêtre ; self fin « barre de commande : Nouvelle fenêtre vierge… » |
| CMD-53 | View Archive ; Clear Archive ; Open Library ; View Downloads | ✅ | « Vider l'archive » proposé, avec confirmation ; self cmd |
| CMD-54 | Capture ; Capture Full Page ; Capture in Portrait Mode | ✅ | « Capturer en portrait » (menu Fichier, barre de commande) : page à coins arrondis et ombre portée sur un dégradé de la couleur de l’Espace, composée sans canevas (src/main/portrait.js, 231 ms pour 2508 × 1988 px) ; self tests/details.js (4 vérif.) |
| CMD-55 | New Easel ; New Note ; New Note (in Split) | ✅ | « Nouvelle note à côté de la page » ; self cmd |
| CMD-56 | New Boost ; View Boosts | ✅ | « Modifier le Boost de ce site » (le crée s’il n’existe pas) et « Voir les Boosts » ; self fin (barre de commande), self fen |
| CMD-57 | Turn on Developer Mode for this site | ✅ | « Mode développeur » du site (⌃D) ; self cmd (liste des actions) |
| CMD-58 | Settings ; Link Preferences ; Edit Keyboard Shortcuts ; Air Traffic Control ; Manage Passwords | ✅ | Réglages des liens (routage), raccourcis, mots de passe ; self cmd (liste des actions) |
| CMD-59 | Add Extension ; Manage Extensions | ✅ | « Gérer les extensions… » (volet où l'on en ajoute) ; self cmd (liste des actions) |
| CMD-60 | Mute all tabs / Unmute all tabs | ✅ | self cmd (2 vérifications) |
| CMD-61 | Toggle Sidebar ; Show Toolbar ; Theme | ✅ | |
| CMD-62 | Copy URL ; Copy URL as Markdown ; Paste URL as New Tab | ✅ | ⌥⌘V proposé dans la barre ; self cmd (liste des actions) |
| CMD-63 | Help Center ; Contact the Team ; What's new ; Getting Started | ✅ | Centre d'aide, Signaler un problème, Nouveautés (dépôt GitHub), Bienvenue ; aussi au menu Aide ; self cmd |
| CMD-64 | New Google Doc, New Linear Issue, New Google Meet, etc. | ➖ | Raccourcis vers des services tiers |

## ESP — Espaces et profils

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| ESP-1 | Un Espace a ses épinglés, ses onglets du jour, son thème, son icône | HC 19228064149143 | ✅ | self « nouvel Espace créé et affiché » | |
| ESP-2 | Création par le « + » : nom, icône, profil, thème, puis « Create Space » | HC 19228064149143 ; binaire `ARC_SpaceCreation` | ✅ | création directe puis renommage ; ui 06 | Panneau de création au-dessus du « + » : nom (champ actif, nom par défaut en indication), icône par le sélecteur d’émojis, douze couleurs et huit thèmes prêts, profil (existants, celui de l’Espace affiché par défaut, ou « Nouveau profil… ») avec une ligne d’explication, « Créer » / « Annuler », Entrée et Échap ; rien n’est créé avant « Créer ». Toutes les entrées y mènent (commande, barre de menus, menu de l’Espace, « + », Bibliothèque, geste au bout de la rangée) ; demande vérifiée dans le processus principal (W.checkSpace) ; message « Nouvel Espace créé » avec « Annuler » et ⌘Z gardés. self tests/creation-espace.js (31 vérifications) ; ui 31 (8 vérifications, souris et clavier réels) ; geste : self fin2 et derniers |
| ESP-3 | Le nouvel Espace se place à côté de l'Espace actif | HC 20498377604887 | ✅ | non vérifié | self lat « nouvel Espace : il se place juste après l’Espace affiché » ; ui 23 |
| ESP-4 | Changer d'Espace : clic sur l'icône du bas | HC 19228064149143 | ✅ | ui 06 | |
| ESP-5 | Balayage horizontal à deux doigts sur la barre | HC 19228064149143 ; binaire `space_swiping.mp4` | ✅ | SH:378-383 (seuil 70 px) ; ui 06 | Voir GES-1 |
| ESP-6 | ⌃1 … ⌃9 | menu | ✅ | self « ⌃2 va au deuxième Espace » ; nat | |
| ESP-7 | ⌥⌘→ / ⌥⌘← | menu | ✅ | self ; nat | |
| ESP-8 | Boutons 3 et 4 de la souris | HC 20498417809815 | ✅ | | Sur la barre latérale ; ui 23 (boutons « back » et « forward » envoyés par le protocole DevTools) |
| ESP-9 | Le contenu de la barre glisse d'un Espace à l'autre, avec transition de l'icône | HC 20498377604887 | ✅ | fondu-glissé de 36 px sur 220 ms (SC:103-106) | deux listes côte à côte qui suivent le doigt, teinte fondue, ressort (SH PAGER) ; l'icône grossit dans sa pastille ; self ; ui 06. Durées à régler face à Arc |
| ESP-10 | Au-delà du dernier Espace : résistance élastique, puis création d'un Espace | inverse | ✅ | | Au bout de la rangée la liste résiste ; vers la droite un « + » sort du bord et grandit ; tiré franchement, un nouvel Espace est créé. self « au bout de la rangée… » (3), self fin2 « tirer franchement au-delà du dernier Espace… » ; ui 06 |
| ESP-11 | Revenir dans un Espace réactive son dernier onglet | HC 20498377604887 | ✅ | W:210 ; self « ⌥⌘← revient… avec son onglet » | |
| ESP-12 | Renommer : clic sur le titre, ou menu Spaces → Rename Space | HC 20498377604887 ; menu | ✅ | ui 03 | |
| ESP-13 | Icône : sélecteur d'émojis avec recherche et teintes de peau | HC 20498293324823 ; binaire `ARC_Emojis` | ✅ | overlay (`#icons`), emojis.js | Sélecteur d’émojis : 493 émojis en dix rubriques, recherche par mots-clés (français et anglais, sans accents), six teintes de peau (retenue), flèches et Entrée. Menu de l’Espace → « Changer l’icône de l’Espace… ». self fin ; ui 28 |
| ESP-14 | Supprimer : confirmation qui nomme l'Espace ; « This will archive all the tabs and folders inside it. » | HC 20498377604887 ; binaire | ✅ | W:deleteSpace, W:removeSpace | Comme dans Arc : la question nomme l’Espace et annonce « Tous ses onglets et ses dossiers iront dans l’archive » ; épinglés et contenu des dossiers sont archivés comme les onglets du jour ; ⌘Z rétablit l’Espace et retire ses onglets de l’archive. self lat, self fin (3), self barre |
| ESP-15 | ⌘Z annule la suppression ou la création d'un Espace | binaire (« Undo/Redo prompt for deleting a space ») | ✅ | `W:removeSpace` ; self « ⌘Z rétablit l’Espace : même rang, épinglés, dossier, onglets du jour, thème », « ⌘Z défait la création d’un Espace » ; ui 18 | Les pages de l’Espace rétabli se rechargent à la demande ; pas de message « Undo/Redo » à l’écran, seulement le menu |
| ESP-16 | Réordonner les Espaces | binaire « Drag to Reorder Space » | ✅ | | Voir BL-102 ; ui 23 ; self lat |
| ESP-17 | Gestionnaire d'Espaces (Manage Spaces…) dans la Bibliothèque | menu ; HC 20498377604887 | ✅ | C:manageSpaces, library.js | « Gérer les Espaces… » (menu Espaces, menu de l’Espace, barre de commande) ouvre la section Espaces de la Bibliothèque (renommer, thème, supprimer, nouvel Espace : ui 25). self fin (2) ; ui 28 |
| ESP-18 | Masquer l'en-tête de l'Espace | binaire « Hide Space Header » | ✅ | | Menu de l’Espace, propre à chaque Espace ; self lat (3 vérifications) |
| ESP-19 | Message à la création d'un Espace | HC 20498417809815 | ✅ | W:newSpace | Message « Nouvel Espace créé » ; self fin |
| ESP-20 | Profil : identifiants, historique, cookies, favoris, extensions et délai d'archivage séparés | HC 19227964556183 | ✅ | self « le profil a sa propre session » | Extensions et délai par profil à vérifier |
| ESP-21 | Attribuer un profil à un Espace | menu « Change Profile » | ✅ | self « nouveau profil attribué à l'Espace » | |
| ESP-22 | File → New Profile | menu | ✅ | M | |
| ESP-23 | Supprimer un profil seulement s'il n'est lié à aucun Espace ; le profil par défaut ne se supprime pas | binaire | ✅ | Réglages ; self « les réglages listent les profils » | self « profils : renommer ; supprimer seulement si aucun Espace ne l’utilise… » (tests/reglages.js) |
| ESP-24 | Pastille de profil dans les menus | binaire « profile indicator » | ✅ | | Dès qu’il existe plusieurs profils, le nom d’un Espace dans un menu (« Déplacer vers », menu Espaces) est suivi du nom de son profil (W:spaceLabel) ; self fin2 (3 vérifications) ; ui 29 « plusieurs profils : « Déplacer vers » rappelle le profil… ». Le libellé « profile indicator » du binaire d’Arc ne dit pas où Arc l’affiche |

## ONG — Vie des onglets

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| ONG-1 | ⌘W archive l'onglet (« Archive Tab ») | menu | ✅ | self | |
| ONG-2 | ⌘W sur un épinglé : le décharge, il reste dans la barre | non vérifié (comportement connu) | ✅ | self « ⌘W sur un onglet épinglé le met en veille » | |
| ONG-3 | ⇧⌘T rouvre le dernier onglet fermé, avec son historique | menu ; HC 20498377604887 | ✅ | self ; ui 02 ; même identifiant et même rang (`W:restoreClosed`) ; parcours rendu (`W:historyOf`) | ⇧⌘T (et ⌘Z) rouvre l’onglet à sa place, sur la page où il était, avec ses pages précédentes et suivantes (adresses et titres gardés en mémoire avec la trace de fermeture, jamais sur disque ni en navigation privée). self, self fin (4) ; ui 02 |
| ONG-4 | ⌘Z annule les actions de la barre : déplacement, personnalisation, effacement, fermeture d’onglet ou d’aperçu | HC 20498377604887 ; menu « Annuler Close Peek » | ✅ | `W:record`, `W:replay`, `C:undo` ; self « ⌘Z défait toute la suite, état pour état » ; ui 18 | Pile de 50 actions par fenêtre, jamais enregistrée : archiver, déplacer (liste, dossier, rang), épingler, favoris, renommer, Effacer, dossiers, Espaces, aperçu. Hors pile : nouvel onglet, dupliquer, thème, vue scindée. Dans un champ de texte, ⌘Z reste l’annulation du texte |
| ONG-5 | ⇧⌘Z rétablit | menu | ✅ | `W:replay` ; self « ⇧⌘Z refait toute la suite, état pour état » ; ui 18 | |
| ONG-6 | Archivage automatique après 12 h par défaut ; 12 h, 24 h, 7 jours, 30 jours | HC 19228855311127 ; warren ; binaire « Archive tabs after » | ✅ | W:archiveStale (mêmes valeurs, plus « jamais ») ; aucun test | self lat « archivage automatique après 12 h… » ; self (reglages) « archivage après 24 h pour un profil » |
| ONG-7 | Délai réglable par profil | HC 19228855311127 | ✅ | réglage global | prefs.get('archiveAfterHours', profil) ; self (reglages) « archivage après 24 h pour un profil, jamais pour les autres » |
| ONG-8 | Voir ou cliquer un onglet remet son délai à zéro | HC 19228855311127 | ✅ | `lastUsed` | self lat « afficher un onglet remet son délai d’archivage à zéro » |
| ONG-9 | Un onglet qui joue un média n'est ni effacé ni archivé | HC 20498417809815 | ✅ | épargne les onglets audibles | « Effacer » et l’archivage automatique épargnent l’onglet audible ; self lat (2 vérifications, vraie page sonore) |
| ONG-10 | Bandeau unique expliquant l'archivage automatique | HC 20498293324823 ; binaire | ✅ | W:archiveStale | Au premier archivage d’office, un message dit combien d’onglets ont été archivés et après quel délai ; un clic mène au réglage. Une seule fois. self fin (2) |
| ONG-11 | ⇧⌘K efface les onglets du jour, avec une animation propre | menu ; HC 20498377604887 | ✅ | self ; sans animation dédiée ; ⌘Z rétablit tout (ui 18) | Les onglets du jour s’effacent en cascade (ANI-14) ; ⌘Z rétablit tout ; self ; ui 23 « « Effacer » : les onglets du jour s’effacent en cascade » ; ui 18 |
| ONG-12 | « Reset all tabs in this Space » | menu | ✅ | | Chaque épinglé de l’Espace retourne à son adresse ; self lat (par l’article du menu Onglets) |
| ONG-13 | ⌃⇥ : sélecteur des onglets récents, comme ⌘⇥ | binaire ; HC 25619402657303 | ✅ | SH `#switcher` ; nat (`ctrltab.swift`) | Arc montre 5 onglets, Orbe 8 |
| ONG-14 | Dans le sélecteur, ⌃ maintenu + W ferme l'onglet désigné | HC 25619402657303 | ✅ | | W:switcherClose ; self lat (4 vérifications) ; ui 23 (touches injectées par le moteur) |
| ONG-15 | ⌥⌘↓ / ⌥⌘↑ | menu | ✅ | self ; nat | |
| ONG-16 | ⌘1 … ⌘8, ⌘9 = neuvième ou dernier, favoris inclus ou non (réglage) | binaire ; HC 25619402657303 | ✅ | self « ⌘2 active le deuxième onglet » ; pas de réglage | Réglages tabKeysFavorites et tabKeysNinthLast ; self (reglages) « ⌘1…⌘9 : favoris comptés ou non, ⌘9 dernier ou neuvième » |
| ONG-17 | Onglets en arrière-plan suspendus ; pas ceux qui utilisent le micro | HC 20498293324823 | ✅ | W:trimLive + hooks.busy ; self « mise en veille au-delà de la limite », « un onglet qui capte n’est pas mis en veille » |  |
| ONG-18 | Certains sites restent vivants (Slack, Gmail, Agenda, Notion, Spotify, WhatsApp…) | binaire `web_content_behavior.json` (`keepaliveAllowList`) | ✅ | keepalive.js, W:trimLive | Liste des sites qui restent vivants reprise d’Arc et complétée (keepalive.js : courrier, messageries, agendas, musique, documents) : épargnés par la veille d’ancienneté et de mémoire, la limite en nombre choisie reste tenue ; self fin (3) |
| ONG-19 | Favoris chargés seulement s'ils ont servi récemment | HC 20498377604887 | ✅ | chargés au clic | Plus strict qu’Arc : un favori n’est jamais chargé d’avance, sa page ne naît qu’au clic (et s’endort comme les autres). self fin « favori jamais affiché… » |
| ONG-20 | Un onglet n'existe qu'en un exemplaire entre les fenêtres (« Tab Handoff ») | HC 20498377604887 | ✅ | self « un onglet n'est actif que dans une seule fenêtre » | |
| ONG-21 | Les fenêtres d'un même Espace montrent les mêmes onglets | HC 25590417429783 | ✅ | données partagées (`store.state`) | Les fenêtres ordinaires partagent les mêmes Espaces : un onglet ouvert, épinglé ou renommé dans l’une paraît dans l’autre. self fin (2) |
| ONG-22 | Session restaurée au redémarrage | HC 20498293324823 ; binaire | ✅ | self « état enregistré sur disque » | Une seule fenêtre mémorisée |
| ONG-23 | Page « onglet planté » | HC 20498377604887 ; binaire `ARC_SadTab` | ✅ | essentials.js (feuille « crash ») | Feuille « La page a planté » avec « Recharger » (essentials.js) ; self ess « page plantée… » |
| ONG-24 | Mode économie de batterie sous 20 % | HC 20498377604887 | ✅ | | Sur batterie et sous 20 % (niveau relevé par la barre latérale), un onglet resté caché dix minutes s’endort au lieu d’attendre le délai choisi ; les onglets où l’on a agi sont épargnés et la page est consultée (règle d’ancienneté de veille.js). Un message au passage sous le seuil ; réglage « Économie de batterie » (Réglages → Onglets), actif par défaut. self fin2 (6 vérifications) ; ui 29 « Réglages → Onglets : « Économie de batterie »… » |
| ONG-25 | ⌥⌘V : colle l'adresse du presse-papiers dans un nouvel onglet | HC 20498377604887 | ✅ | | Jamais file:, orbe: ni javascript: ; self lat ; ui 22 |
| ONG-26 | « Reveal Tab in Sidebar » | menu | ✅ | | La barre revient, les dossiers s’ouvrent, la ligne défile et s’illumine ; self lat ; ui 22 |
| ONG-27 | Lien ouvert en arrière-plan : message « New Tab Created » si la barre est masquée | HC 20498417809815 | ✅ | | « Nouvel onglet créé dans … » ; self lat |
| ONG-28 | Titres d'onglets raccourcis automatiquement à l'épinglage | HC 19335160678679 | ➖ | | Fonction d'IA, écartée |
| ONG-29 | Rangement automatique des onglets (« Tidy Tabs ») | allthings | ➖ | | Fonction d'IA, écartée |

## SCI — Vue scindée

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| SCI-1 | Jusqu'à 4 pages | HC 20498417809815 | ✅ | W:splitWith ; self | |
| SCI-2 | ⌃⇧= ajoute un volet, avec la barre de commande dedans | menu ; M-13 | ✅ | self ; nat | |
| SCI-3 | ⌃⇧- ferme le volet actif | menu ; M-14 | ✅ | self ; nat | |
| SCI-4 | Côte à côte ou empilée ; bascule depuis le bouton du volet | HC 20498377604887 | ✅ | self « vue scindée empilée », « retour côte à côte », « menu d’un volet, vue empilée… » | Bascule par la commande et par le menu « ⋯ » de chaque volet |
| SCI-5 | Chaque volet a une petite barre en haut (adresse, fermer, options) | M-13 ; binaire « Split View Controls Menu » | ✅ | petite barre en haut de chaque volet : adresse (clic : la modifier), « ⋯ » (déplacer, agrandir, empiler, séparer, fermer), « × » ; self « vue scindée à trois volets : chaque page sous la petite barre de son volet », « petite barre de chaque volet : son adresse, à sa place », « menu d’un volet… » ; ui 12 (trois vérifications) | |
| SCI-6 | ⌥clic sur un onglet ou un lien : l'ouvre en vue scindée | HC 20498293324823 | ✅ | ⌥clic sur un onglet de la barre latérale et sur un lien (clic retenu avant la page, adresse du lien survolé rapportée par le moteur) ; self « ⌥clic sur un onglet de la barre latérale… », « ⌥clic sur un lien… » (trois vérifications) ; ui 12 (deux vérifications) | |
| SCI-7 | Séparateur déplaçable | HC 19335393146775 | ✅ | self « la séparation se déplace à la souris » | |
| SCI-8 | Tailles conservées | non vérifié | ✅ | parts rangées avec l’Espace (`splitRatios`) ; self « tailles des volets conservées au redémarrage », « parts illisibles dans le fichier : ignorées » | |
| SCI-9 | ⌃⇧1 … 4 : aller au volet | binaire ; hongkiat | ✅ | nat | |
| SCI-10 | Volet suivant / précédent | binaire | ✅ | commandes `nextPane` / `prevPane` (⌃⇧] / ⌃⇧[, modifiables) ; self « ⌃⇧] / ⌃⇧[ : volet suivant et précédent, en boucle » | |
| SCI-11 | Le volet actif se distingue | non vérifié | ✅ | barre du volet actif marquée et liseré de 2 px autour de lui ; un clic dans une page active son volet ; self « le volet actif se distingue… » ; ui 12 « cliquer dans une page : son volet devient actif… » | |
| SCI-12 | La vue scindée est un seul élément dans la barre, épinglable, renommable, déplaçable | HC 20498417809815 | ✅ | une ligne par groupe (ui 12), épinglable | Une seule ligne par vue scindée ; épinglée, elle reste une ligne (icône de l’autre volet), se renomme et se rouvre avec ses volets. self fin (3) ; ui 12 |
| SCI-13 | « Separate Page from Split View », « Separate All Tabs » | menu ; binaire | ✅ | « Séparer la page de la vue scindée » et « Séparer tous les onglets » : menu Présentation, menu du volet, menu de l’onglet ; self « Séparer tous les onglets… », « Séparer la page de la vue scindée… » | |
| SCI-14 | « Expand Current Split » | menu | ✅ | « Agrandir ce volet » : le volet actif prend toute la place que les autres lui laissent, une seconde fois les parts redeviennent égales ; self. Comportement d’Arc déduit de son nom interne (« MaximizeCurrentPane »), non observé | |
| SCI-15 | Vue scindée enregistrée avec l'Espace | non vérifié | ✅ | self | |
| SCI-16 | ⌘L change l'adresse du volet actif | HC 19335393146775 | ✅ | self « ⌘L en vue scindée : seule l’adresse du volet actif change » ; ui 12 « clic sur l’adresse d’un volet… Entrée ne change que lui » | |
| SCI-17 | Pendant le glisser : zone de dépôt aux couleurs du thème, l'onglet devient une bulle, petit rebond au dépôt | inverse | ✅ | zone aux couleurs de l’Espace, qui éclaire le côté visé (moitié du volet survolé : avant ou après lui) ; self « glisser un onglet : la zone de dépôt éclaire le côté visé », « lâcher un onglet sur le bord gauche d’un volet… » ; ui 12 | Zone aux couleurs de l’Espace, qui éclaire le côté visé — moitié gauche, droite, haute ou basse (BL-97) ; l’onglet y devient une bulle à son nom, qui rebondit au dépôt (ANI-12) ; self « glisser un onglet : la zone de dépôt éclaire le côté visé », tests/derniers.js « glisser un onglet au-dessus de la page : il devient une bulle… », « onglet lâché sur la page… » ; ui 12, ui 29, ui 30 |
| SCI-18 | Messages affichés au-dessus du volet concerné | HC 20498293324823 | ✅ | le message se place au-dessus du volet actif ; self « message affiché au-dessus du volet actif, pas à cheval sur les deux », « le message suit le volet actif » | |

## APE — Aperçu (Peek)

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| APE-1 | Depuis un épinglé ou un favori, un lien vers un autre site s'ouvre en aperçu | HC 19335302900887 ; binaire | ✅ | self (deux vérifications) | |
| APE-2 | ⇧clic sur n'importe quel lien : aperçu | HC 20498377604887 ; binaire | ✅ | ui 19 « ⇧-clic sur un lien : aperçu… » | Corrigé : le ⇧clic levait une erreur et n’ouvrait rien |
| APE-3 | Deux réglages distincts pour ces deux déclencheurs | binaire | ✅ | réglages `peekLinks` (onglets épinglés) et `peekShift` (⇧clic) ; ui 19 « ⇧-clic sur un lien : aperçu, sauf si le réglage est coupé… », « onglet épinglé : un lien vers un autre site s’ouvre en aperçu, ou dans l’onglet si le réglage est coupé » | |
| APE-4 | Boutons à côté : fermer, ouvrir en onglet (⌘O), ouvrir en vue scindée | HC 19335302900887 | ✅ | self « ⌘O transforme l'aperçu en onglet sans recharger » | |
| APE-5 | Fermer : clic à l'extérieur, croix, ⌘W, Échap | HC 20498377604887 | ✅ | self « ⌘W ferme l'aperçu… » | |
| APE-6 | Geste de fermeture interactif | HC 20498377604887 | ✅ | | balayage à deux doigts vers la droite sur un aperçu sans page précédente : la carte suit les doigts (déplacée, jamais redimensionnée : 0 remise en page de sa page), le voile s’éclaircit ; passé 150 px ou d’un geste vif elle se ferme (annulable), sinon elle revient en 180 ms ; ouverture 200 ms, fermeture 150 ms, ⌘O 220 ms ; self « aperçu tiré… », ui 16 « balayage à deux doigts… », « balayage franc… ». Durées d’Arc non mesurées |
| APE-7 | ⌘Z ou ⇧⌘T rouvre un aperçu fermé | HC 20498377604887 ; menu « Annuler Close Peek » | ✅ | `W:dismissPeek` ; self « ⌘Z rouvre l’aperçu fermé », « ⇧⌘T rouvre aussi un aperçu fermé » ; ui 18 | La page de l’aperçu est rechargée (son défilement et ses saisies ne sont pas rendus) |
| APE-8 | Animation d'ouverture et de fermeture | HC 20498417809815 (existence) ; durée non mesurée | ✅ | fondu du voile seul, la page apparaît d'un coup | la carte grandit depuis le lien (200 ms), se réduit à la fermeture (150 ms) ; self ; ui 16. Durées d'Arc non mesurées |
| APE-9 | La barre d'outils s'affiche aussi dans l'aperçu | HC 20498293324823 | ✅ | barre d’outils affichée : l’adresse de l’aperçu s’affiche au-dessus de la carte et suit sa navigation ; self « barre d’outils affichée : l’aperçu montre son adresse… », « l’adresse de l’aperçu suit sa navigation » ; ui 16 | |
| APE-10 | Les liens de réunion s'ouvrent en onglet, pas en aperçu | HC 20498377604887 | ✅ | self « onglet épinglé, lien de réunion : un onglet à côté, pas d’aperçu » | |
| APE-11 | L'aperçu respecte les règles d'aiguillage | HC 20498293324823 | ✅ | une règle d’aiguillage passe avant l’aperçu (Espace ou petite fenêtre) ; self « onglet épinglé, lien couvert par une règle d’aiguillage… », « règle « petite fenêtre »… » | |
| APE-12 | Tableaux et notes ouverts depuis la Bibliothèque : en aperçu | HC 20498377604887 | ⬜ | ouverts en onglet | L’aperçu est une vue de page web sans privilège ; y loger une page d’Orbe (tableau, note) demanderait une vue de confiance : à concevoir avec la sécurité |

## PET — Petite fenêtre (Little Arc)

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| PET-1 | ⌥⌘N ouvre une petite fenêtre sans barre latérale | menu ; HC 19235387524503 | ✅ | self | |
| PET-2 | Les liens venus d'autres applications s'y ouvrent (par défaut) | HC 19235387524503 ; binaire | 🟡 | réglage « Liens venus d’autres applications » ; self « lien venu d’une autre application, réglage « petite fenêtre » : il s’y ouvre » | Le réglage existe et est vérifié (Réglages → Liens, « Liens venus d’autres applications » ; self « lien venu d’une autre application, réglage « petite fenêtre » : il s’y ouvre » ; ui 19). Seul le défaut diffère : fenêtre principale dans Orbe, petite fenêtre dans Arc — le propriétaire n’a pas tranché, le défaut d’Orbe est gardé |
| PET-3 | ⌥⌘clic sur un lien ou un onglet | slashgear ; binaire | ✅ | lien : ui 19 (réglage `littleAltClick`) ; onglet de la barre latérale : self « ⌥⌘clic sur un onglet de la barre latérale : sa page dans une petite fenêtre, l’onglet reste » | |
| PET-4 | Bouton « Open In » ; ⌘O vers l'Espace le plus récent ; ⌥⌘O pour choisir | HC 19235387524503 | ✅ | self « Ouvrir dans Orbe crée un onglet » | |
| PET-5 | Recherche d'Espace dans le menu « Open In » | binaire « Search Spaces » | ✅ | menu « Ouvrir dans… » dessiné dans la barre de la petite fenêtre, avec un champ de recherche (accents et casse ignorés) ; self « Ouvrir dans… : la liste des Espaces… », « recherche d’Espace… », « ⌥⌘O, recherche, Entrée… » ; ui 25 (deux vérifications) | |
| PET-6 | Plusieurs petites fenêtres ; le même lien externe refocalise celle qui existe | HC 20498377604887 | ✅ | self « le même lien une seconde fois : la petite fenêtre existante revient, sans en ouvrir une autre », « un autre lien : une seconde petite fenêtre » | |
| PET-7 | Fermées d'office après 6 h ; elles vont dans l'archive, filtre « Little Arc » | HC 19235387524503 ; binaire | 🟡 | délai réglable (`littleArchiveHours`), page rangée dans l’archive, filtre « petite fenêtre » de l’archive ; self | « Jamais » par défaut, et non 6 h : choix à trancher par le propriétaire |
| PET-8 | Flotte au-dessus du plein écran, s'ouvre sur le bureau courant | HC 20498377604887 | 🟡 | non vérifié | Non vérifiable par un essai (écran d’une autre application en plein écran, bureaux de macOS) et non vérifié à l’œil : la petite fenêtre est une fenêtre ordinaire, sans réglage particulier de bureau. À constater sur une machine déverrouillée avant de toucher au comportement des bureaux |
| PET-9 | Extensions disponibles ; bouton de copie du lien | binaire (infobulles) | 🟡 | bouton de copie du lien (sans paramètres de pistage) ; self « petite fenêtre : bouton de copie du lien… » ; ui 25 | Bouton de copie du lien : fait (self « petite fenêtre : bouton de copie du lien… » ; ui 25). Extensions : la petite fenêtre n’a pas de boutons d’extension, et l’hôte des extensions (ext-host.js) ne la connaît pas : sa page n’est pas un onglet pour elles. Reste à faire : la lui déclarer, ajouter les boutons, et les essais |
| PET-10 | Menu du Dock : afficher/masquer toutes les petites fenêtres, nouvelle fenêtre privée | HC 20498377604887 | ✅ | menu du Dock : navigation privée, masquer ou afficher toutes les petites fenêtres ; self lat « menu du Dock… » (cinq vérifications, voir MEN-96) | |
| PET-11 | Retient le profil choisi pour un domaine | HC 20498377604887 | ✅ | | le profil de l’Espace où une petite fenêtre est envoyée est retenu pour son site (200 sites) ; self tests/details.js |
| PET-12 | Taille mémorisée | binaire (préférence `LittleBrowserWindow_size`) | ✅ | taille de la dernière petite fenêtre redimensionnée reprise par la suivante ; self « petite fenêtre : la taille choisie est reprise par la suivante », « taille enregistrée illisible ou hors bornes… » | |
| PET-13 | Animation d'ouverture | HC 20498417809815 | ✅ | | opacité 0→1 et montée de 14 pt en 180 ms (position et opacité de la fenêtre seulement), coupée par « Réduire les animations » ; self tests/details.js, ui 25 |
| PET-14 | Première fois : bulle d'explication | binaire | ✅ | | bandeau de première fois entre la barre et la page, refermé par × ou après 12 s ; self, ui 25 |
| PET-15 | Aiguillage : règle « contient » ou « est égal à » → Espace ; défaut Little Arc, Espace le plus récent ou un Espace précis | HC 22932014625431 | ✅ | self « aiguillage : le lien s'ouvre dans l'Espace de la règle » | « est égal à » absent |
| PET-16 | Les liens Google Meet vont dans l'Espace le plus récent | HC 20498377604887 | ✅ | Meet, Zoom, Teams, Webex… : toujours un onglet de l’Espace affiché ; self « liens de réunion (Meet, Zoom, Teams) venus d’ailleurs : dans un onglet, jamais en petite fenêtre », « lien de réunion ou non » | |

## THM — Thèmes et apparence

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| THM-1 | Apparence Automatic / Light / Dark, commune à tous les Espaces ; libellé « Websites, Easels, and Notes will use: » | menu ; HC 19228064149143 | ✅ | MA:applyAppearance ; self « le thème clair s'applique » | |
| THM-2 | Dans le sélecteur de thème : trois boutons animés (étoiles, soleil, lune) | binaire `automatic.json`, `sun.json`, `moon.json` (Lottie) | ✅ | OV `#theme-modes` : trois boutons (étoiles, soleil, lune) dont l'icône s'anime au choix (CSS) ; ui 22 « apparence de l'Espace » | Apparence réglée par Espace (la barre et les panneaux suivent) ; les sites suivent toujours le réglage général. Icônes dessinées pour Orbe, pas les Lottie d'Arc |
| THM-3 | Couleurs choisies en déplaçant des points sur un nuancier, « + » et « − » pour ajouter ou retirer une couleur | HC 25625261733143 | ✅ | OV `#theme-wheel` : un point par couleur, déplacé à la souris ou aux flèches (teinte autour, saturation du centre au bord), « + » et « − » ; ui 22 « déplacer un point », « + ajoute » | Les points sont indépendants (pas d'harmonie imposée entre eux) |
| THM-4 | Jusqu'à trois couleurs en dégradé | slashgear ; variables `--arc-background-gradient-color0/1/2` (HC 19212718608151) | ✅ | `src/renderer/theme.js` (`color`, `color2`, `color3`) ; dégradé à trois arrêts ; self « thème : trois couleurs… », ui 22 |  |
| THM-5 | Retirer toutes les couleurs rend le thème par défaut | HC 25625261733143 | ✅ | theme.js `apply({ colors: [] })` : `plain`, fond neutre, accent d'origine ; self « sans aucune couleur, thème par défaut », ui 22 « − retire les couleurs » |  |
| THM-6 | Palettes prêtes : 9 pastel, 9 ternes, 9 gris | binaire `ColorPickerPastel1-9`, `ColorPickerDrab1-9`, `ColorPickerGreyscale1-9` | ✅ | theme.js `PALETTES` : 9 pastels, 9 ternes, 9 gris, plus 8 thèmes prêts (`PRESETS`) ; self « nuanciers », ui 22 | Teintes propres à Orbe (celles d'Arc ne sont pas relevées) |
| THM-7 | Réglage d'intensité | HC 20498417809815 | ✅ | theme.js `tintOf` : de 4 % à 72 % de couleur, le réglage d'origine (18 % / 24 %) à mi-course ; curseur dans l'éditeur ; self, ui 22 « l'intensité renforce ou allège le fond » |  |
| THM-8 | Réglage de grain par une molette | HC 20498417809815 ; binaire `GrainKnob` | ✅ | curseur de force dans l'éditeur ; `body.grainy::before` ; ui 22 « quatre textures… force nulle, plus de texture » | Curseur plutôt que molette |
| THM-9 | Quatre textures : grain, sable, tweed, denim | binaire `GrainKnob`, `SandKnob`, `TweedKnob`, `DenimKnob` ; images `grain`, `sand`, `tweed`, `denim` | ✅ | `scripts/make-textures.js` → `src/renderer/textures/{grain,sand,tweed,denim}.png` (carreaux gris de 192 px, 33 Ko chacun, fondus en « overlay » sous l'interface, rendus une fois) ; self « textures », ui 22 | Motifs calculés pour Orbe ; ressemblance avec ceux d'Arc non comparée à l'œil |
| THM-10 | Fond de fenêtre rendu par un shader (Metal) | binaire `ARC_WindowThemeUI/default.metallib` | 🟡 | dégradé CSS + carreau de texture (image fixe, aucun filtre par image) | À comparer à l'œil avec Arc |
| THM-11 | Retour haptique en tournant les molettes du thème | inverse ; HC 20498377604887 | ➖ | | Electron 44 n'expose aucune interface haptique (aucune occurrence de « haptic » dans `electron.d.ts`, `NSHapticFeedbackManager` absent) ; il faudrait un module natif, contraire au choix « aucune dépendance ». Le réglage reste enregistré, affiché comme indisponible |
| THM-12 | Les couleurs du thème gagnent menus, champs, barre de commande, sélecteur d'onglets, messages | HC 20498417809815 | ✅ | W `themeNow` → événement `theme` ; OV `applyLook` : accent, panneaux teintés à 9 %, ligne choisie, message et pastille d'adresse teintés, apparence de l'Espace ; ui 22 « barre de commande, bascule et messages » | Les menus natifs du système gardent leurs couleurs |
| THM-13 | Barre latérale translucide sur le bureau | non vérifié (mesure faite en thème sombre opaque) | 🟡 | réglage `translucent` : fond de la barre à 80 % d'opacité sur l'effet `sidebar` ; ui 22 « barre translucide » | Le contraste du texte est maintenant calculé sur le fond tel qu’il s’affiche (80 % du thème + 20 % de l’arrière-plan, aux deux extrêmes supposés du matériau : noir à gris foncé en sombre, gris moyen à blanc en clair) : 4,60 au pire sur 3 000 thèmes au hasard, contre 3,14 avant (2 367 thèmes sous 4,5) ; self tests/sensations.js (4 vérif.), ui 29-sensations « barre translucide, thème gris moyen… ». Reste à l’œil : le rendu du matériau sur un vrai bureau, et les bornes de l’arrière-plan (posées par hypothèse, non mesurées) |
| THM-14 | Fenêtre privée noire | observé | ✅ | W:105-112 | |
| THM-15 | Barre d'outils teintée par la couleur de la page | HC 20498293324823 ; binaire `TopBarColorCache` | ✅ | | couleur de thème de la page (meta theme-color, « #rrggbb » seulement) : la barre d’outils en prend la teinte, texte clair ou sombre selon la couleur ; self tests/details.js |
| THM-16 | Le redimensionnement de la fenêtre utilise la couleur de fond de la page | HC 20498293324823 | ✅ | fond blanc fixe | la vue de l’onglet prend la couleur de fond calculée de la page (lue comme des nombres) ; self tests/details.js |
| THM-17 | Les sites peuvent lire les couleurs du thème (variables CSS `--arc-palette-*`), réglage « Allow websites to get your theme data » | binaire ; HC 19212718608151 | ✅ | `panes.js` `extraCss` : `--orbe-theme-color`, `--orbe-theme-color-2`, `--orbe-theme-dark`, réglage « Donner les couleurs de l'Espace aux sites » ; self « couleurs de l'Espace données aux pages seulement sur demande » | Noms propres à Orbe ; la troisième couleur n'est pas transmise |
| THM-18 | Icône de l'application au choix (colorful, schoolbook, neon, hologram, fluted glass, candy, original) | binaire ; HC 20498293324823 | ⬜ | | Non fait : il manque les dessins (six variantes de l’icône, à dessiner — rien ne peut être repris d’Arc). Le code serait court sur macOS (icône du Dock changée à chaud, réglage mémorisé) ; sur Windows l’icône est celle du fichier .exe et ne change pas à chaud. Ce qui le débloquerait : les six dessins |
| THM-19 | Polices embarquées pour l'interface et les Boosts (Inter, Nunito, Marlin Soft, ABC Favorit, Söhne, etc.) | binaire `ARCClients_FontsManager` | ➖ | police du système | Polices sous licence, non reprises |
| THM-20 | Ouvrir le thème : menu Spaces → Edit Theme…, clic droit dans la barre, commande « Theme » | menu ; HC 19228064149143 | ✅ | M, W:sidebarMenu ; ui 22 (panneau ouvert par le menu, 14 vérifications) |  |

## ANI — Animations et mouvement

Chiffres d'Arc : seuls ANI-1 à ANI-4 ont été mesurés. Pour le reste, l'existence de l'animation est attestée par la documentation, pas sa durée ni sa courbe ; ces lignes demandent un enregistrement d'écran avec le propriétaire avant d'être réglées au chiffre près.

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| ANI-1 | Masquer la barre : instantané | M-3 | ✅ | 180 ms | Fait le 8 oct. (cotes et durées d'Arc) |
| ANI-2 | Réafficher la barre : environ 50 ms | M-4 | ✅ | 180 ms | Fait le 8 oct. (cotes et durées d'Arc) |
| ANI-3 | Barre de commande : apparition sans délai perceptible | mesuré (pas d'image intermédiaire à 60 images/s) | ✅ | `pop` 130 ms | Fait le 8 oct. (cotes et durées d'Arc) |
| ANI-4 | Vue scindée : ouverture et fermeture immédiates | M-13, M-14 | ✅ | sans animation ; self | Identique |
| ANI-5 | Miroitement au démarrage | HC 20498417809815 | ✅ | | reflet qui traverse la barre latérale au premier affichage (900 ms, transformation et opacité) ; ui 27-details : médiane 8,3 ms, 0 mise en page |
| ANI-6 | Animation de fenêtre au redémarrage | HC 20498417809815 | ⬜ | | Non fait : l’animation d’Arc n’a pas été observée (ni durée ni forme) ; macOS anime déjà l’ouverture de la fenêtre, et le reflet du premier affichage existe (ANI-5). Ce qui le débloquerait : un enregistrement d’écran d’Arc qui redémarre, pour savoir quoi reproduire |
| ANI-7 | Boutons plus, fermer, actualiser, précédent, suivant animés | HC 20498417809815 | ✅ | SC `.ib svg` : « actualiser » fait un tour à chaque clic, les flèches partent dans leur sens à la pression, le « + » et la croix pivotent ; ui 23 « boutons animés » |  |
| ANI-8 | Indicateur de chargement en lueur en haut de la fenêtre | HC 20498377604887 ; binaire (shader) | ✅ | SC `#glow` : lueur à la couleur de l'Espace le long du bord haut de la page, plus le reflet de la pastille ; transformations seules ; ui 23 « chargement » (120 images/s, pas de mise en page par image) | Lueur CSS, pas un shader ; à comparer à l'œil avec Arc |
| ANI-9 | Téléchargement : le fichier « saute » dans l'icône de la Bibliothèque ; plusieurs à la fois | HC 20498377604887 | ✅ | anneau de progression | un fichier tombe dans l’icône de la Bibliothèque à chaque téléchargement commencé (4 à la fois, décalés de 110 ms), l’icône rebondit ; self tests/details.js, ui 27-details : médiane 8,3 ms |
| ANI-10 | Changement d'Espace : la barre glisse d'un Espace à l'autre en suivant le doigt, l'icône se transforme | HC 20498377604887 ; binaire `space_swiping.mp4` | ✅ | glissé-fondu de 36 px, 220 ms | deux listes côte à côte qui suivent le doigt, teinte fondue, ressort (SH PAGER) ; l'icône grossit dans sa pastille ; self ; ui 06. Durées à régler face à Arc |
| ANI-11 | Aperçu : ouverture et fermeture animées, fermeture interactive | HC 20498417809815, 20498377604887 | ✅ | la carte grandit depuis le lien (200 ms), se réduit à la fermeture (150 ms), s'étend pour ⌘O (220 ms) ; self, ui 16 | balayage à deux doigts vers la droite sur un aperçu sans page précédente : la carte suit les doigts (déplacée, jamais redimensionnée : 0 remise en page de sa page), le voile s’éclaircit ; passé 150 px ou d’un geste vif elle se ferme (annulable), sinon elle revient en 180 ms ; ouverture 200 ms, fermeture 150 ms, ⌘O 220 ms ; self « aperçu tiré… », ui 16 « balayage à deux doigts… », « balayage franc… ». Durées d’Arc non mesurées |
| ANI-12 | Glisser vers une vue scindée : l'onglet devient une bulle, rebond au dépôt | inverse | ✅ | | Au-dessus de la page, l’onglet glissé devient une bulle (icône et titre) au milieu du côté visé, entrée au ressort ; lâché, la bulle rebondit une fois (transformation et opacité, 320 ms) pendant que la vue se scinde, puis la zone se retire ; rien avec « Réduire les animations » ; self tests/derniers.js (6 vérif. « glisser un onglet au-dessus de la page : il devient une bulle… », « onglet lâché sur la page… la bulle rebondit… ») ; ui 30 « glisser « Page D » au-dessus de la page… » (vrai glisser) |
| ANI-13 | Dépôt dans un dossier animé | HC 20498377604887 | ✅ | | l’icône du dossier rebondit (340 ms) et sa ligne s’éclaire au dépôt ; ui 27-details |
| ANI-14 | Effacement des onglets du jour animé | HC 20498377604887 | ✅ | SH `flipPlay` : les lignes s'effacent en cascade (22 ms d'écart, dix crans au plus) ; ui 23 « Effacer » |  |
| ANI-15 | Messages (toasts) animés, aux couleurs du thème | HC 20498293324823 | ✅ | entrée au ressort, sortie de 180 ms ; pilule sombre teintée à 26 % par la couleur de l'Espace ; ui 22 « messages » |  |
| ANI-16 | Petite fenêtre : animation d'ouverture | HC 20498417809815 | ✅ | | opacité 0→1 et montée de 14 pt en 180 ms (position et opacité de la fenêtre seulement), coupée par « Réduire les animations » ; self tests/details.js, ui 25 |
| ANI-17 | Passage en plein écran simplifié | HC 20498417809815 | 🟡 | natif | La transition est celle de macOS (Electron n’en propose pas d’autre et ne permet pas de la modifier) ; le plein écran lui-même est vérifié (ui 29 « fenêtre en plein écran… », « plein écran : un Échap ne fait rien… »). « Simplifié » ne peut se juger qu’à l’œil, à côté d’Arc |
| ANI-18 | Image dans l'image : élastique sous la taille minimale, lancer vers un coin | inverse ; HC 20498417809815 | ➖ | fenêtre native de Chromium | Sans objet tant qu’Orbe n’a pas sa propre fenêtre d’image dans l’image : celle de Chromium ne se pilote pas depuis Electron 44 (ni position, ni taille, ni gestes — étude dans BIB-28). Ce qui le débloquerait : une interface d’Electron sur cette fenêtre, ou le chantier « vue de l’onglet déplacée dans une petite fenêtre d’Orbe » |
| ANI-19 | Le lecteur audio rejoint la position de l'image dans l'image en s'animant | HC 20498377604887 | ➖ | | Sans objet tant qu’Orbe n’a pas sa propre fenêtre d’image dans l’image : celle de Chromium ne se pilote pas depuis Electron 44 (ni position, ni taille, ni gestes — étude dans BIB-28). Ce qui le débloquerait : une interface d’Electron sur cette fenêtre, ou le chantier « vue de l’onglet déplacée dans une petite fenêtre d’Orbe » |
| ANI-20 | Pastille d'état du lien : s'étend après 1,5 s, s'écarte de la souris | HC 20498377604887 | ✅ | | courte (420 pt) puis étendue après 1,5 s (160 ms), passe de l’autre côté quand le pointeur vient dessus (140 ms) ; self tests/details.js (5 vérif.) |
| ANI-21 | Apparition et retrait d'une ligne d'onglet | non vérifié | ✅ | SH `flip` : la ligne paraît ou s'efface (opacité, échelle), les voisines glissent à leur place (240 ms, ressort) ; ui 23 « fermer un onglet », « nouvel onglet » | Une mise en page par changement, aucune par image (mesuré) |
| ANI-22 | Les lignes s'écartent pendant un glisser | non vérifié | ✅ | ui 17 ; transformations de 140 ms, relevé unique des positions, aucune mise en page pendant le geste | Mesures dans ameliorations.md (PERF-25) |
| ANI-23 | Ouverture d'un dossier : hauteur animée | non vérifié | ✅ | SH `flip` : le contenu paraît en fondu, la suite de la liste glisse ; au repli elle remonte ; ui 23 « dossier » | Glissement par transformation plutôt qu'une hauteur animée |
| ANI-24 | Changement d'onglet : coupe franche | non vérifié | ✅ | coupe franche | coupe franche vérifiée : la page choisie est posée entière dans le même tour, l’autre retirée, aucun trajet animé ; dans la barre, seul le fond des deux lignes se fond en 150 ms ; self tests/sensations.js « changement d’onglet : coupe franche… ». Comportement d’Arc non mesuré |
| ANI-25 | Sélecteur ⌃⇥ : apparition | non vérifié | ✅ | sans animation | apparition au ressort (240 ms, échelle 0,96 → 1) ; durée d'Arc non vérifiée |
| ANI-26 | Bandeau de mise à jour : replié, s'ouvre au survol, bouton en dégradé ; cœur animé | HC 21489650267031 ; binaire `update-heart-animation.json` | ✅ | ligne discrète, cœur qui bat ; au survol elle devient un bouton en dégradé et la croix paraît, sans changer de taille ; ui 24 | Pas de repli en largeur (il déplacerait la barre) : fondu et transformations seulement |
| ANI-27 | Icônes animées de la Bibliothèque (archive, captures, Espaces, tableaux, téléchargements, Boosts) | binaire `ARC_HomeButton/*.json` (Lottie) | ✅ | | icônes dessinées pour Orbe (SVG) sur les sept sections de la Bibliothèque, animées une fois au survol et à la sélection (horloge qui tourne, couvercle, flèche qui tombe, etc. ; 420 à 620 ms, transformations et opacité), figées par « Réduire les animations » ; ui 29-sensations (3 vérif.). Pas de Lottie : mouvements CSS |
| ANI-28 | Logo animé (vague) et orbe vidéo | binaire `logo-wave.json`, `orb.mp4`, `background.mp4` | ✅ | | logo de l’accueil animé : trois anneaux partent du logo (1,8 s, décalés de 260 ms), l’anneau blanc s’enroule puis respire, halo de couleurs qui tourne ; transformations et opacité, coupé par « Réduire les animations » ; ui 29-sensations (médiane 8,3 ms, 95e centile 10,2 ms, 1 mise en page). Dessin CSS, pas de vidéo |
| ANI-29 | « Réduire les animations » du système respecté | non vérifié | ✅ | `base.css` (durées à zéro), SH (`reducedMotion` : ni glissement, ni rebond, ni balayage d'Espace animé), W `motion()` ; ui 23 « Réduire les animations », ui 17 |  |

## SON — Sons et retour haptique

Arc contient en tout trois fichiers son. Aucun autre son n'existe dans l'application (recherche de tous les fichiers audio du paquet).

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| SON-1 | Son de capture : `capture.wav`, 0,63 s, stéréo 48 kHz 24 bits | binaire `ARC_SoundEffects.bundle` | ✅ | aucun son dans Orbe (recherche dans `src/`) | Fait le 8 oct. (zone + choix de l'action, son original, réglage) |
| SON-2 | Son `event.m4a`, 3,52 s, stéréo 44,1 kHz | binaire | ➖ | | Écarté : le paquet de sons d’Arc ne contient que capture.wav et event.m4a, et rien dans le binaire ne relie ce dernier à un événement (recherche des libellés le 9 oct., sans lancer Arc). Un son sans moment connu n’a rien à accompagner ; Orbe a ses propres sons de gestes (réglage « Sons des gestes ») |
| SON-3 | Musique d'accueil `intro-music.mp3`, 21,3 s, pendant la création du compte ; vidéo `demo.mov` | binaire `ARC_AuthFeature` ; inverse | 🟡 | musique originale à l’ouverture de l’accueil (welcome.js, sounds.js `music`) | Musique originale de 7 s synthétisée par scripts/make-sounds.js (src/renderer/musique/welcome.wav, 301 Ko : quatre accords tenus, arpège, note finale), jouée une fois à l’ouverture de l’accueil à 70 % du volume des sons, coupable par un bouton, absente si « Sons » est coupé ; self tests/sensations.js (fichier identique au script, niveau, bords à zéro, réglages), ui 29-sensations (bouton). Reste : l’écouter (aucune oreille ne l’a jugée) ; pas de vidéo de démonstration |
| SON-4 | Réglage « Play Arc sound effects » (Advanced) | binaire ; HC 20498417809815 | ✅ | | Fait le 8 oct. (zone + choix de l'action, son original, réglage) |
| SON-5 | Pas de son pour copier l'adresse, changer d'Espace, fermer un onglet ou finir un téléchargement | binaire (seuls trois fichiers) | ✅ | par défaut, Orbe est muet aussi ; self « réglage par défaut : ouvrir un onglet ne demande aucun son » | Orbe propose en plus, sur demande, des sons de gestes (réglage « Sons des gestes », coupé par défaut : voir DESIGN-4) |
| SON-6 | Retour haptique en réordonnant les onglets, réglage « Haptic feedback when reordering tabs » | binaire ; HC 20498293324823, 20498377604887 | ➖ | | Electron 44 n'expose aucune interface haptique (aucune occurrence de « haptic » dans `electron.d.ts`, `NSHapticFeedbackManager` absent) ; il faudrait un module natif, contraire au choix « aucune dépendance ». Le réglage reste enregistré, affiché comme indisponible |
| SON-7 | Retour haptique au dépôt d'un glisser-déposer | binaire `dropHapticSubject`, `isDragDropHapticFeedbackEnabled` | ➖ | | Même cause que SON-6 |
| SON-8 | Retour haptique dans le sélecteur de thème | inverse ; HC 20498377604887 | ➖ | | Même cause que SON-6 |
| SON-9 | Retour haptique dans le lecteur vidéo miniature (taille maximale atteinte) | HC 20498377604887 ; binaire `_shouldPerformMaxScaleHaptic` | ➖ | | Même cause que SON-6 |
| SON-10 | Cran haptique en changeant de page | binaire `performsPageDetentHaptics` | ➖ | | Même cause que SON-6 |
| SON-11 | Notifications des sites avec son | binaire `UNAuthorizationOptions.sound` | 🟡 | notifications natives d'Electron ; non testé | Le son est celui du système : une notification de site le joue sauf si la page la demande silencieuse ; rien dans Orbe ne le coupe. Aucun essai automatique n’entend un son du système : à vérifier à l’oreille |

## GES — Gestes du pavé tactile

Aucun geste n'a été rejoué sur Arc pendant cet inventaire (ils demandent la main du propriétaire). Les lignes viennent de la documentation.

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| GES-1 | Balayage horizontal à deux doigts sur la barre : change d'Espace, le contenu suit le doigt | HC 19228064149143 | ✅ | SH `PAGER` : les deux listes suivent le doigt 1 px pour 1 px, seuil 40 % de la largeur (110 px au plus) ou geste vif, retour au ressort ; self ; ui 06 (sept vérifications, molette simulée) | Seuil, vitesse et inertie à régler face à Arc, main sur le pavé Gestes enchaînés (ORB-003, 13 oct.) : un nouveau balayage lancé dans l’inertie du précédent est reconnu (le mouvement remonte après être retombé : `wheelFresh`), on passe d’Espace en Espace sans s’arrêter ; ui 06 « trois balayages enchaînés… », « un seul balayage, même vif… ». Gestes simulés : seuils à confirmer sur un vrai trackpad. |
| GES-2 | Au bout de la liste des Espaces : résistance élastique puis nouvel Espace | inverse | ✅ | résistance élastique et retour au ressort (SH `PAGER`) ; self, ui 06 | Résistance élastique et retour au ressort (SH PAGER). Nouvel Espace : geste voulu, en deux temps — tirer franchement au-delà du dernier Espace arme la pastille « + » (couleur de l’Espace), puis garder les doigts posés 450 ms referme un anneau et crée l’Espace ; un balayage vif, même fort, ne crée rien (son inertie désarme la pastille), repartir en arrière renonce. Le message « Nouvel Espace créé » porte « Annuler » (5 s) ; ⌘Z annule aussi, même le champ de nom ouvert ; un Espace vide se supprime sans question. self tests/derniers.js (9 vérif. « balayage vif au bout de la rangée… », « doigts posés, immobiles… », « clic sur « Annuler »… », « supprimer un Espace vide… »), tests/finitions2.js ; ui 06 (« tirer franchement… », « balayage vif… aucun Espace n’est créé », « Espace vide… ») |
| GES-3 | Balayage à deux doigts sur la page : précédent / suivant | non vérifié (comportement de Chromium) | ✅ | `src/preload/swipe.js` + `src/main/swipe.js` : balayage horizontal que la page n'a pas consommé, pastille qui suit les doigts au bord de la page, navigation au seuil (130 px) ou sur un geste vif ; ui 23 (quatre vérifications, molette simulée) | Seuil et vitesse à régler main sur le pavé ; Arc fait glisser la page entière, Orbe montre une pastille |
| GES-4 | Pincer pour zoomer la page | non vérifié | ✅ | W : `setVisualZoomLevelLimits(1, 5)` sur chaque onglet (coupé par défaut dans Electron, d'après sa documentation) ; ui 23 « pincer pour zoomer la page » (pincement simulé) |  |
| GES-5 | Image dans l'image : pincer pour redimensionner, deux doigts pour déplacer, ⌘défilement pour zoomer, double-clic pour revenir à l'onglet | HC 20498417809815 | ➖ | fenêtre native | Sans objet tant qu’Orbe n’a pas sa propre fenêtre d’image dans l’image : celle de Chromium ne se pilote pas depuis Electron 44 (ni position, ni taille, ni gestes — étude dans BIB-28). Ce qui le débloquerait : une interface d’Electron sur cette fenêtre, ou le chantier « vue de l’onglet déplacée dans une petite fenêtre d’Orbe » ; la fenêtre native se déplace et se redimensionne à la souris |
| GES-6 | Tableaux : pincer pour zoomer | HC 20498293324823 | ✅ | `easel.js` : pincement (Ctrl + molette, tel que Chromium le transmet) = zoom centré sur le pointeur ; ui 15 « pincement » |  |
| GES-7 | Capture : zoomer et déplacer l'image avant de l'enregistrer | binaire « Zoom and pan to edit your screenshot » | ⬜ | | Non fait : une capture est enregistrée telle quelle, sans écran d’édition ; zoomer et déplacer l’image suppose cet écran (aperçu de la capture, cadrage, puis « Enregistrer »), qui n’existe pas. Ce qui le débloquerait : décider de cet écran d’édition (il porterait aussi le recadrage) |
| GES-8 | Lecteur miniature : glisser vers le haut pour chercher précisément | binaire « Drag upwards to seek precisely » | ✅ | | lecteurs empilés (4 au plus), titre/artiste/pochette de mediaSession (tenus pour hostiles : textContent, pochette recodée), titre défilant, croix, recherche en glissant, fine quand le pointeur monte ; self tests/medias.js (23 vérif.), ui 26-medias (11 vérif., médiane 8,3 ms, 0 mise en page) |
| GES-9 | Défilement élastique des listes de la barre | non vérifié | ✅ | SH `BOUNCE` : au bout de la liste elle se laisse tirer (72 px au plus, de moins en moins) et revient au ressort ; ui 23 « rebond élastique » (molette simulée) | Raideur et retour à régler main sur le pavé |

## BIB — Bibliothèque, archive, téléchargements, médias

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| BIB-1 | Bibliothèque ouverte par l'icône du bas ou ⇧⌘L | menu ; HC 19230634389911 | ✅ | M ; nat | S'ouvre dans un onglet, pas dans un panneau |
| BIB-2 | Sections : Media, Downloads, Easels & Notes, Spaces, Archived Tabs, Boosts | HC 19230634389911 ; menu Window | ✅ | `library.js` | Historique, Archive, Téléchargements, Médias, Tableaux, Espaces, Boosts (les notes ont leur page) ; self bib ; ui 25 |
| BIB-3 | Elle rouvre sur la dernière section utilisée | HC 20498377604887 | ✅ | | self bib « ⇧⌘L rouvre la Bibliothèque sur cette section » ; ui 25 |
| BIB-4 | Survol de l'icône : fichiers récents, à ouvrir ou à glisser dehors | HC 19230634389911 | ✅ | | survol de l’icône (320 ms) : panneau des 5 derniers fichiers encore sur le disque, dans la barre (libpeek.js) ; clic = ouvrir, glisser = vrai fichier hors d’Orbe ; noms posés par textContent, ni chemin ni adresse envoyés à la barre ; les captures d’Orbe rejoignent la Bibliothèque ; self tests/sensations.js (15 vérif.), ui 29-sensations (10 vérif., apparition 340 ms au ressort, médiane 8,3 ms, 0 mise en page) |
| BIB-5 | Clic droit sur l'icône : types de fichiers affichés (captures, téléchargements, médias) | HC 19230634389911 ; binaire | ✅ | | clic droit sur l’icône : « Au survol, montrer » Captures, Téléchargements, Médias (cases, réglage libraryPeek) et « Ouvrir la Bibliothèque » ; self tests/sensations.js, ui 29-sensations « clic droit sur l’icône… » |
| BIB-6 | Glisser un fichier hors de la Bibliothèque, même Arc en arrière-plan | HC 20498417809815 | ✅ | | webContents.startDrag avec l'icône du fichier ; self bib ; ui 25 (vraie souris, système remplacé par un témoin) |
| BIB-7 | Médias du Bureau, de Documents et de Téléchargements à côté des captures ; filtre « Show media from: » | binaire | ✅ | téléchargements et captures d'Orbe, en liste | Bibliothèque → Médias : « Afficher les médias de : » Orbe, Téléchargements, Bureau, Documents. Un dossier n’est lu que lorsqu’il vient d’être choisi (jamais au démarrage, choix non retenu : macOS demande alors l’accord) ; premier niveau seulement, ni liens ni fichiers cachés ; la page reçoit identifiant et nom, jamais de chemin ; ouvrir, afficher, glisser ; self tests/sensations.js (6 vérif.), ui 29-sensations (3 vérif.). En liste, sans vignettes (aucun fichier n’est décodé) |
| BIB-8 | Les vidéos se lisent en aperçu | HC 20498417809815 | ⬜ | | Non fait, pour une raison de conception : lire une vidéo téléchargée dans la page interne de la Bibliothèque y ferait décoder du contenu venu du web (voir docs/securite-navigation.md, « Fichiers récents et médias des dossiers ») ; il y faut une vue web à part, en bac à sable |
| BIB-9 | Supprimer un élément l'envoie à la corbeille | HC 20498293324823 ; binaire « Move to Trash » | ✅ | `downloads.js`:trash | shell.trashItem ; self bib « Placer dans la corbeille » ; ui 25 |
| BIB-10 | Menu d'un téléchargement : Open, Copy, Show in Finder, Hide from Arc, Move to Trash, Cancel | binaire « Download Context Menu » | ✅ | `downloads.js`:menuTemplate | Menu « ··· » et clic droit : Ouvrir, Copier, Afficher, Partager, Masquer, Corbeille, Pause/Reprendre/Annuler ; self bib (10 vérifications) ; ui 25 |
| BIB-11 | Envoyer une capture par iMessage ou AirDrop ; ouvrir dans Aperçu | binaire | ✅ | | Article « Partager » (feuille de partage macOS) dans le menu du fichier ; self bib ; la feuille elle-même reste à voir à l'œil |
| BIB-12 | Regroupement par période (« Earlier This Week »…) | binaire | ✅ | `library.js`:period | self bib « périodes, comme dans Arc » ; ui 25 |
| BIB-13 | Archive : recherche et filtres (fermé à la main ou d'office, par Espace, Little Arc) | allthings ; binaire « How was the tab closed? », « Where was the tab? » | ✅ | `library.js` (principal et page) | Cause de fermeture enregistrée (main, d'office, petite fenêtre) ; filtres par cause et par Espace ; self bib (8 vérifications) ; ui 25 |
| BIB-14 | Restaurer un onglet archivé : il retourne dans son Espace d'origine | HC 20498377604887 | ✅ | `library.js`:restore | self bib « restaurer un onglet archivé » ; ui 25 |
| BIB-15 | Supprimer une entrée d'archive | binaire | ✅ | | Croix par ligne ; self bib ; ui 25 |
| BIB-16 | Clear Archive avec confirmation « This action is permanent. » | binaire ; menu | ✅ | C:clearArchive | Même confirmation que par le menu ; self bib ; ui 25 |
| BIB-17 | État vide de l'archive : « Nothing here yet! » | binaire | ✅ | | « Rien ici pour l'instant ! » et une ligne d'explication ; self bib ; ui 25 |
| BIB-18 | View History ⌘Y | menu | ✅ | self | |
| BIB-19 | Emplacement des téléchargements par profil : dossier, « Other… », « Ask every time » | warren ; binaire `arc.promptForDownload` | ✅ | réglage « Dossier des téléchargements », général ou propre à un profil (prefs.js), et « Toujours demander où enregistrer » (downloads.js) ; self « dossier des téléchargements propre à un profil », « dossier propre au profil : il prime sur le dossier général… », « Toujours demander où enregistrer… » | |
| BIB-20 | Avertissements de sécurité du système sur les fichiers téléchargés | HC 20498377604887 | ✅ | `downloads.js`:quarantine | Marque « venu d'Internet » posée sur chaque fichier téléchargé (quarantaine macOS, zone Internet Windows) : Electron ne le fait pas ; self bib « le fichier téléchargé porte la marque… » |
| BIB-21 | « Downloads in progress » à la fermeture | binaire | ✅ | | Question « Des téléchargements sont en cours » avant de quitter ; self bib (4 vérifications) |
| BIB-22 | Téléchargements renommés automatiquement | HC 19335160678679 | ➖ | | Fonction d'IA, écartée |
| BIB-23 | Sauvegardes locales de la barre, Help → Restore Data (10 du jour, 1 par jour sur 10 jours…) | HC 25625071960215 ; menu | ✅ | `backups.js` | Copie à chaque lancement puis chaque heure (10 du jour, 1 par jour sur 10 jours) ; Aide → Dépannage → « Restaurer une sauvegarde » (relance) ; self bib (5 vérifications) |
| BIB-24 | Lecteur audio miniature en bas de la barre en quittant un onglet qui joue ; plusieurs lecteurs empilés ; titre défilant ; croix | HC 19234766331799 | ✅ | un seul média, lecture/pause et muet ; aucun test | lecteurs empilés (4 au plus), titre/artiste/pochette de mediaSession (tenus pour hostiles : textContent, pochette recodée), titre défilant, croix, recherche en glissant, fine quand le pointeur monte ; self tests/medias.js (23 vérif.), ui 26-medias (11 vérif., médiane 8,3 ms, 0 mise en page) |
| BIB-25 | Lecteur : précédent/suivant (Spotify), ±15 s, volume de l'onglet, micro | binaire | 🟡 | précédent / suivant (gestionnaires `mediaSession` de la page), ±15 s, recherche, muet de l’onglet, volume (défiler ou tirer le haut-parleur : règle les lecteurs de la page, niveau lisible sous l’icône) ; self tests/medias.js « volume depuis le lecteur… », ui 26-medias « volume de l’onglet… » | Reste le micro. Le volume est celui des lecteurs du cadre principal de la page (Electron n’offre que le muet par onglet) |
| BIB-26 | Touches multimédia du clavier | HC 20498417809815 | 🟡 | défaut de Chromium (touches multimédia vers la session active) | Demande une main sur le clavier : aucun essai automatique ne peut presser une touche multimédia |
| BIB-27 | Image dans l'image automatique en quittant un onglet vidéo ; pas si l'onglet est muet | HC 19234766331799 ; binaire | ✅ | self (deux vérifications) | |
| BIB-28 | Fenêtre d'image dans l'image propre à Arc : retour à l'onglet, fermer, réduire, vitesse, flèches pour chercher, espace pour pause | HC 20498377604887 ; binaire | 🟡 | fenêtre native de Chromium (lecture/pause, retour à l’onglet, fermer) | Étudié le 9 oct. sur Electron 44 : aucune interface ne donne la fenêtre native d’image dans l’image (ni position, ni taille, ni commandes) ; `documentPictureInPicture` est annoncé aux pages mais `requestWindow()` échoue (« Internal error: no window », essai sur une page locale) ; recopier la vidéo dans une fenêtre d’Orbe (captureStream) échoue pour les vidéos protégées ou d’une autre origine. Une fenêtre propre à Orbe demanderait de déplacer la vue de l’onglet dans une petite fenêtre : chantier à part, non livré faute de robustesse |
| BIB-29 | Désactivable par site et globalement | HC 25590734716823 | ✅ | réglage global `autoPip` | réglage global autoPip + case par site dans le menu d’une vidéo (pipOffSites) ; self tests/details.js |
| BIB-30 | Google Meet : image dans l'image avec commandes de réunion | HC 20498293324823 | ➖ | | Propre à un service |
| BIB-31 | Cast | menu | ➖ | | Écarté : Electron ne fournit ni Chromecast ni le sélecteur de diffusion de Chrome |

## BOO — Boosts

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| BOO-1 | Un Boost par domaine, actif dans tous les profils | HC 19212718608151 | ✅ | `boosts.js` ; self « Boost : le CSS du site et le Zap s'appliquent » | |
| BOO-2 | Créer : « + » → New Boost, commande, pinceau du centre de contrôle | HC 19212718608151 | ✅ | bouton « + », commandes « Modifier le Boost de ce site… » et « Afficher les Boosts… », centre de contrôle, menu de page ; self « créer un Boost : bouton « + », commande, centre de contrôle, menu de page » ; ui 24 | |
| BOO-3 | Nuancier de couleurs à points | HC 19212718608151 | ✅ | dix pastilles et « aucune couleur » : fond, texte lisible, liens et champs recolorés ; self « Boost, apparence : couleur du nuancier… », « éditeur : une pastille du nuancier colore la page aussitôt » ; ui 24 | |
| BOO-4 | Inverser la luminosité ; curseurs Contrast, Brightness, Original Saturation ; remise à zéro | HC 19212718608151 | ✅ | self « Boost, apparence : luminosité inversée, contraste, luminosité, saturation », « apparence remise à zéro… » ; ui 24 « inverser la luminosité, curseur de contraste au clavier, remise à zéro » | |
| BOO-5 | Polices prêtes (Aa), taille 90 à 150 %, casse | HC 19212718608151 | ✅ | cinq familles de polices du système, taille de 90 à 150 % (zoom de la page), casse ; self « Boost, texte : police prête, taille en pourcentage, casse » ; ui 24 | |
| BOO-6 | Zap : cliquer un élément pour le retirer ; le rétablir | HC 19212718608151 | ✅ | self | |
| BOO-7 | Éditeur CSS | HC 19212718608151 | ✅ | self « réappliqué à chaque chargement », « retiré quand il est vidé » | |
| BOO-8 | Éditeur JavaScript (désactivé par défaut) | HC 26681118599191 | ✅ | coupé par défaut : réglage « Autoriser le JavaScript des Boosts » puis case de chaque Boost ; exécuté dans le monde de la page, cadre principal seulement, site vérifié par le processus principal ; self (treize vérifications « JavaScript d’un Boost… ») ; ui 24 ; docs/securite-navigation.md « Boosts » | |
| BOO-9 | Renommer, « Reset all Edits » | HC 19212718608151 | ✅ | champ de nom et « Tout réinitialiser » dans l’éditeur ; self « éditeur : taille du texte et nom du Boost enregistrés », « Tout réinitialiser : le Boost du site disparaît… » | |
| BOO-10 | Activer/désactiver depuis le centre de contrôle (pinceau gris) | HC 19212718608151 | ✅ | case « Boost de ce site » du centre de contrôle (bouclier) ; self « centre de contrôle : décocher coupe le Boost sans le supprimer, recocher le rétablit » | |
| BOO-11 | Liste des Boosts dans la Bibliothèque, suppression | HC 19212718608151 ; menu « View Boosts… » | ✅ | liste dans la fenêtre des Boosts (« Afficher les Boosts… », menu Présentation), pas dans la Bibliothèque : activer, modifier, supprimer, exporter, importer (un Boost importé arrive désactivé) ; self « liste des Boosts… », « export… », « import… » (cinq vérifications) ; ui 24 | |
| BOO-12 | Réglage global « Enable Boosts on websites you visit » | binaire | ✅ | réglage « Appliquer les Boosts aux sites » (Réglages → Avancé) ; self « Boosts : appliqués ou non selon le réglage, sans recharger la page », « …Boosts coupés dans les réglages, le script ne part plus » | |
| BOO-13 | Partage de Boosts | HC 19212718608151 (retiré d'Arc) | ➖ | | Retiré d'Arc lui-même |

## TAB — Tableaux (Easels) et capture

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| TAB-1 | New Easel ⌃⇧E | menu | ✅ | self « ⌃⇧E crée un tableau » | |
| TAB-2 | Le tableau s'ouvre comme onglet épinglé de l'Espace | HC 19231142050071 | ✅ | onglet interne | un tableau neuf (⌃⇧E) s’ouvre comme onglet épinglé de l’Espace, à la suite des épinglés (pas en navigation privée) ; rouvert depuis la Bibliothèque, son onglet revient sans doublon ; supprimé, son onglet redevient un onglet du jour ; self tests/sensations.js (4 vérif.), ui 29-sensations « ⌃⇧E : le tableau neuf… » |
| TAB-3 | Dessin, texte, images, formes | HC 20498293324823 | ✅ | self (rectangle, texte, formes, flèche, image collée) ; `tests/easels.js` | |
| TAB-4 | Guides d'alignement et magnétisme | HC 20498293324823 | ✅ | | Bords et milieux, portée de 6 points, ⌘ pour s'en passer ; self easels (6 vérifications) ; ui 15 (2 vérifications) |
| TAB-5 | Correcteur dans le texte | HC 20498293324823 | ✅ | `easel.js`:startEdit | Correcteur actif pendant la saisie ; self easels « correcteur actif pendant la saisie, coupé au repos » |
| TAB-6 | Vidéos intégrées depuis une adresse collée | HC 20498293324823 | ⬜ | | Non fait, pour une raison de conception : la page du tableau est une page interne, de confiance (canal de l’interface, session interne). Y intégrer un lecteur d’un site (cadre YouTube, Vimeo…) y ferait entrer du contenu web : les autorisations, le bloqueur et les téléchargements sont jugés par webContents, donc au nom de la page interne. Il faudrait une vue web distincte (session du profil, bac à sable) posée par-dessus le tableau et suivie au défilement et au zoom : à concevoir avec la relecture de sécurité |
| TAB-7 | Captures vivantes (lecture/pause, ⌘R les rafraîchit) | HC 20498417809815 | ⬜ | captures figées | Non fait, pour la même raison de conception que TAB-6 : une capture vivante est une page web qui tourne dans le tableau, or le tableau est une page interne de confiance où aucun contenu web ne doit vivre (docs/securite-navigation.md). Il y faut la même vue web distincte, en bac à sable, posée par-dessus le tableau : à concevoir avec la relecture de sécurité. Les captures restent figées |
| TAB-8 | Le lien d'une capture rouvre la page d'origine | binaire `CaptureLinkIconBackground` | ✅ | self | |
| TAB-9 | Texte alternatif d'une image | binaire | ✅ | | Champ « Texte alternatif » de l'image sélectionnée ; self easels (3 vérifications) ; ui 15 |
| TAB-10 | Annuler / rétablir | binaire | ✅ | self | |
| TAB-11 | Export PNG (« Share Via… »), File → Save As | HC 19231142050071 | ✅ | | Bouton et commande « Exporter le tableau en PNG… » (boîte d'enregistrement) ; pas de feuille de partage ; self easels (4 vérifications) ; ui 15 |
| TAB-12 | Partage en lecture ou en édition, collaborateurs, commentaires | HC 19231142050071 ; binaire | ➖ | | Demande un serveur |
| TAB-13 | Liste des tableaux dans la Bibliothèque | menu « View Easels… » | ✅ | self (vignette, réouverture, suppression) | |
| TAB-14 | Capture… ⇧⌘2 : choisir une zone, les éléments de la page sont détectés ; infobulle « Click or drag to capture a portion of this page » ; curseur en appareil photo | menu ; HC 20498417809815 ; binaire | ✅ | ⇧⌘2 capture toute la partie visible ; la zone n'existe que pour « vers un tableau » (self « capture d'une zone choisie à la souris ») | Fait le 8 oct. (zone + choix de l'action, son original, réglage) |
| TAB-15 | Après la capture : envoyer, enregistrer, copier, reprendre, ajouter à un tableau | HC 20498417809815 ; binaire | ✅ | copie + fichier d'office | Fait le 8 oct. (zone + choix de l'action, son original, réglage) |
| TAB-16 | Son à la capture | binaire `capture.wav` | ✅ | | Déjà en place (son d'Arc, réglage « Sons ») ; self « capture : le son de capture est demandé » |
| TAB-17 | Capture Full Page (PNG dans le dossier de téléchargement) | menu ; HC 25481392111895 | ✅ | self | |
| TAB-18 | Capture in Portrait Mode (page posée sur un fond) | menu ; HC 20468488031511 | ✅ | | « Capturer en portrait » (menu Fichier, barre de commande) : page à coins arrondis et ombre portée sur un dégradé de la couleur de l’Espace, composée sans canevas (src/main/portrait.js, 231 ms pour 2508 × 1988 px) ; self tests/details.js (4 vérif.) |
| TAB-19 | Maintenir ⌘⇧ pour lancer une capture (option) | binaire | ⬜ | | Non fait : option d’Arc qui lance la capture en gardant ⌘⇧ enfoncées, sans autre touche. Faisable (les touches de modification se lisent à l’entrée des pages), mais ⌘⇧ est le début de beaucoup de raccourcis (⇧⌘T, ⇧⌘C, ⇧⌘2…) : sans délai bien réglé à la main, la capture partirait par mégarde. Ce qui le débloquerait : l’accord du propriétaire sur ce risque, et un réglage du délai sur un vrai clavier. La capture a déjà son raccourci (⇧⌘2) |

## NOT — Notes

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| NOT-1 | Les notes d'Arc ont été retirées en avril 2024 ; « New Note » ouvre l'application de documents du profil (Notion, Google Docs, Word, Confluence) | HC 22557798824855 | ✅ | Orbe garde des notes locales ; self « ⌃⌘N crée une note » | Orbe fait plus qu'Arc actuel |
| NOT-2 | Raccourci ⌃⇧N d'après les notes de version ; Orbe utilise ⌃⌘N | HC 22557798824855 | ✅ | C ; M | Tranché : ⌃⇧N (note) et ⌃⌥N (note à côté), comme dans Arc ; ⌃⌘N libéré ; self bib « notes : ⌃⇧N… » |
| NOT-3 | Note à côté de la page (en vue scindée) | binaire « Creates a new Note beside your current page » | ✅ | | Commande « Nouvelle note à côté de la page » ; self cmd |
| NOT-4 | Help → Export Arc Notes | menu | ✅ | | Aide → « Exporter les notes… » : un fichier texte par note ; self bib (7 vérifications) |
| NOT-5 | Mise en forme (titres 1 à 3, image, lien) | binaire `TextEditor` | ✅ | texte brut, première ligne en titre | titres 1 à 3, gras, italique, listes à puces / numérotées / à cocher, liens (⌘K, ⌘-clic), raccourcis de début de ligne (« # », « - », « 1. », « [] ») ; enregistrée comme un modèle de blocs vérifié par le processus principal, jamais du HTML ; collage : texte seul ; self tests/bibliotheque.js « notes mises en forme… », « page des notes… », « note altérée… » ; ui 28-notes (8). Les images ne sont pas reprises (elles vont dans un tableau) |

## EXT — Extensions et contrôles du site

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| EXT-1 | Extensions Chrome installables depuis le Chrome Web Store | HC 19434259167767 | ✅ | `extensions.js` (signatures du développeur et du Store vérifiées) ; `tests/extensions.test.js` (39 réussis) ; ext 163 (`tests/ext-api.js`) ; vraies extensions du Store relancées (`node scripts/test-ext.js reelles` : 42 vérifications, Dark Reader, Wappalyzer, uBlock Origin Lite) ; ui 14 ; réglages : options, mise à jour depuis le Store, désactivation, suppression (ext « « Mettre à jour » : nouvelle version annoncée… ») | Pas d’accès par site (« au clic / sur ce site ») ni d’option de navigation privée : Electron ne sait pas les garantir (docs/extensions.md). Messagerie native absente |
| EXT-2 | Menu Extensions : liste, Add Extension…, Manage Extensions… | menu | ✅ | menu Extensions de la barre de menus ; self « menu Extensions : une ligne par extension, puis « Ajouter une extension… » et « Gérer les extensions… » », « … une ligne agit comme le bouton de l’extension ; les deux autres ouvrent le volet Extensions des réglages » | Les deux articles ouvrent le volet Extensions des réglages |
| EXT-3 | Épingler une extension ; visible dans la pastille au survol ou dans la barre d'outils | HC 19434259167767 | ✅ | bouton sous l’adresse, détachable (réglage `extHidden`) : clic droit → « Détacher de la barre latérale », Réglages → Extensions → « Épinglée » ; ext « détacher : le bouton quitte la barre latérale, l’extension reste dans le menu du bouclier et le menu Extensions », « épingler : le bouton revient » ; ui 14 « clic droit sur le bouton de l’extension… » | Pas d’affichage « au survol de la pastille » : les boutons épinglés sont toujours visibles |
| EXT-4 | ⌘E fait défiler les extensions | HC 19434259167767 | ✅ | | ⌘E ouvre l’extension suivante (boutons inactifs sautés), referme après la dernière ; au menu Extensions, modifiable ; ext « ⌘E : une extension après l’autre… », « ⌘E avec les extensions installées… », « ⌘E est une commande d’Orbe… » |
| EXT-5 | Clic droit sur une extension : « Remove from Arc » | HC 19434259167767 | ✅ | clic droit sur le bouton : Options, Détacher, Désactiver, « Retirer d’Orbe… » (avec confirmation), Gérer ; ext « clic droit sur le bouton : nom, Options, Détacher, Désactiver, « Retirer d’Orbe… », Gérer », « « Retirer d’Orbe… » : la question nomme l’extension ; « Annuler » garde tout ; confirmé, elle est désinstallée… » |  |
| EXT-6 | Extension qui plante : désactivée avec un message | HC 20498377604887 ; binaire | ✅ | | page d’arrière-plan perdue (manifeste 2) : extension désactivée, message cliquable vers les réglages ; ext « extension qui plante : seule la perte de sa page d’arrière-plan compte », « … elle est désactivée, un message la nomme ». Un service worker (manifeste 3) est relancé par Chromium et Electron ne signale pas son plantage |
| EXT-7 | Raccourcis des extensions | binaire « Extension Shortcuts » | ✅ | raccourcis de `commands` lus dans les vues d’Orbe, modifiables dans Réglages → Raccourcis (`extShortcuts`) ; ext « commands : raccourci attribué, sauf s’il est pris par Orbe », « un raccourci choisi remplace celui que l’extension proposait… », « l’ancien raccourci ne fait plus rien, le nouveau émet commands.onCommand », « raccourci déjà donné à une autre commande d’extension : la question est posée… » ; ui 14 « Réglages → Raccourcis : le raccourci d’une commande d’extension s’enregistre au clavier… » | Valables seulement quand Orbe a le clavier (rien n’est enregistré auprès du système) |
| EXT-8 | Centre de contrôle du site : un panneau avec autorisations, mode développeur, aperçus, Boosts, extensions, capture, effacement du cache et des cookies | HC 19434259167767 | ✅ | menu natif du bouclier (W:shieldMenu) | le bouclier ouvre un panneau (feuille d’Orbe ancrée) : bloqueur, autorisations, cookies et données, cache, Boost, mode développeur, extensions, copie, partage, capture ; chaque action revérifiée contre l’origine du moment ; self « centre de contrôle : … » (12 vérifications), ui « bouclier → centre de contrôle… », « centre de contrôle : Échap… ». Sans aperçus ni accès des extensions par site (non applicable dans Electron) |
| EXT-9 | Demande d'autorisation dans une bulle : « Allow %@ to access your %@? », « Click the lock to change this any time » | binaire `PermissionRequestPopoverView` | ✅ | feuille d’Orbe posée sur l’onglet (sheets.js), pas une boîte native ; self « caméra : la question est une feuille d’Orbe… » ; ui « demande d’autorisation : feuille sur l’onglet » | la demande est une bulle ancrée en haut de la page, du côté de l’adresse, qui dit où changer d’avis ; self « la demande d’autorisation est une bulle ancrée… », ui « demande d’autorisation : feuille sur l’onglet » |
| EXT-10 | Autorisations : notifications, stockage, téléchargements multiples, détection d'inactivité, `mailto:` | binaire | ✅ | caméra, micro (séparés, avec l’accord du système), position, notifications, MIDI, presse-papiers, fenêtres surgissantes, liens `mailto:` et autres applications ; vue par site avec réinitialisation ; self « informations du site : autorisations accordées et refusées » | s’y ajoutent : détection d’inactivité, stockage durable, cookies d’un cadre intégré (par couple de sites), téléchargements multiples (question au deuxième téléchargement non demandé) ; self « détection d’inactivité… », « stockage durable… », « cookies d’un cadre intégré… », « téléchargements multiples… » (5 vérifications) |
| EXT-11 | Partage d'écran | binaire (« tab is being screen-shared ») | ✅ | sélecteur d’Orbe : cet onglet, écrans, fenêtres, vignettes, son (display-media.js) ; self « sélecteur : « Cet onglet », puis les écrans et fenêtres », « « Cet onglet » : la page reçoit un flux vidéo », « une source absente de la liste proposée est refusée » ; ui « partage d’écran : sélecteur d’Orbe » | Écran et fenêtre réels, et question de macOS : à vérifier à la main (application signée) |
| EXT-12 | « This tab is using your camera or microphone » | binaire | ✅ | témoin + menu « Arrêter (recharge la page) » ; self « témoin : la page utilise la caméra », « « Arrêter » recharge la page » ; ui « « Arrêter » recharge la page et l’éteint » | Voir BL-48 pour la limite du témoin |
| EXT-13 | Bloqueur : uBlock Origin installé d'office ; bloqueur natif en option ; « Block Cookie Banners » | HC 19335714372759 ; binaire | ✅ | bloqueur intégré ; self « le bloqueur annule la requête tierce… », `tests/adblock.test.js` | Bandeaux de cookies non traités |
| EXT-14 | Exception par site | binaire | ✅ | self | |
| EXT-15 | Traduction proposée quand la page est dans une autre langue | HC 25626093607703 ; binaire | ⬜ | | Non fait : Electron n’embarque pas le service de traduction de Chrome ; il faudrait choisir un service (en ligne : le texte des pages part chez un tiers, et il peut être payant ; sur la machine : un modèle à embarquer). Décision du propriétaire attendue (confidentialité, coût) avant tout code |
| EXT-16 | Mode développeur par site (⌃D) : barre d'adresse pleine largeur, liseré jaune et noir, automatique sur localhost | menu ; HC 20468488031511 | ✅ | par site : barre d’outils et adresse entière, ⌃D, liste dans Réglages → Avancé ; self « mode développeur d’un site : barre d’outils et adresse entière pour lui seul », « mode développeur : ⌃D sur macOS… » | liseré jaune et noir sous l’adresse ; automatique sur localhost, 127.0.0.1 et ::1 (réglage, ⌃D le coupe pour un site local) ; self « site local : mode développeur automatique… », « ⌃D sur un site local… », ui « bouclier → centre de contrôle… » (liseré) |
| EXT-17 | Clear Cookies and Refresh ; Clear Cache and Refresh | menu | ✅ | commandes et menus ; self « Présentation → « Effacer les cookies et actualiser » : cookies et données du site effacés, page rechargée », « Présentation → « Effacer le cache et actualiser » : le cache est vide, l’actualisation est demandée » ; ui 22 (menu du bouton Actualiser) |  |
| EXT-18 | Mots de passe : gestionnaire, import depuis Chrome ou Safari | binaire | ✅ | self (plus de 70 vérifications), `tests/passwords.js` | |
| EXT-19 | Clés d'accès du trousseau iCloud | HC 20498293324823 (v1.120) | ➖ |  | Écarté : les clés d’accès du trousseau iCloud demandent une application signée et un droit qu’Apple n’accorde qu’aux navigateurs enregistrés chez lui ; Electron ne les expose pas |
| EXT-20 | Cartes bancaires et remplissage automatique | warren | ⬜ | | Non fait : garder des numéros de carte demande la même rigueur que les mots de passe (trousseau du système, déverrouillage, jamais de remplissage hors du geste de l’utilisateur, sites en https seulement). À concevoir avec une relecture de sécurité avant tout code |
| EXT-21 | Erreurs de certificat, authentification HTTP | non vérifié (comportement de Chromium) | ✅ | avertissement de certificat (certs.js), feuille d’identifiants HTTP et proxy, choix du certificat client (auth.js) ; self « certificat refusé : avertissement d’Orbe… », « site HSTS : « Continuer quand même » n’est pas proposé », « l’exception n’est jamais écrite sur disque », « bons identifiants : la page protégée s’affiche » ; ui « certificat refusé… », « identifiant et mot de passe tapés au clavier » | À faire : proposer les comptes du gestionnaire de mots de passe pour l’authentification HTTP (docs/securite-navigation.md) ; vrai proxy à vérifier à la main |
| EXT-22 | Gestionnaire de tâches | menu Help → Troubleshooting | ✅ | | page « Gestionnaire de tâches » (Présentation → Développeur) : processus, contenu, mémoire, processeur ; « Arrêter » pour un onglet seulement ; self « gestionnaire de tâches : … » (4 vérifications) |

## REG — Réglages

Les libellés d'Arc viennent du binaire (texte exact) ; leur rangement par volet vient de `warren` et du centre d'aide. La fenêtre de réglages d'Arc n'a pas été ouverte, pour ne rien modifier.
Orbe : une seule page de réglages (`settings.html`), sans volets. Test : self « les réglages listent les profils », ui 10 (langue). Les autres options n'ont pas de test d'interface, d'où les 🟡.

| Id | Volet d'Arc → option | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| REG-1 | Fenêtre à volets : Account, General, Profiles, Max, Links, Shortcuts, Icon, Advanced | binaire (titres de volets) ; warren | ✅ | fenêtre à volets (`panes.js`, `settings.html`) : Général, Profils, Liens, Raccourcis, Apparence, Confidentialité, Extensions, Import, Avancé ; la hauteur suit le volet, le dernier volet est mémorisé ; self « fenêtre des réglages : neuf volets… » ; ui 19 | Pas de volets Account, Max ni Icon (voir REG-2, REG-18, REG-32) |
| REG-2 | Account → carte de membre, nom, courriel, mot de passe, suppression du compte | HC 19401542261911 | ➖ | | Orbe n'a pas de compte, par choix |
| REG-3 | Account → Arc Sync (chiffré de bout en bout), carte de récupération | HC 20272860828823 | ➖ | | Pas de synchronisation dans Orbe (ni compte ni serveur) : rien à régler ; elle reste à la feuille de route |
| REG-4 | General → navigateur par défaut (« … is not your default web browser ») | binaire | ✅ | état affiché (« est » ou « n’est pas » le navigateur par défaut), bouton seulement s’il reste à faire ; self « navigateur par défaut : l’état est affiché… » | La bascule elle-même n’est pas déclenchée par les tests (elle changerait le réglage de la machine) |
| REG-5 | General → Automatically update my Arc | binaire ; HC 21489650267031 | ✅ | réglage `updateCheck` (Réglages → Avancé) ; self ; ui 24 « l’interrupteur coupe la recherche automatique » | Réglages → Avancé → « Rechercher les mises à jour automatiquement » (une fois par jour ; rien n’est installé tout seul : IMP-10) ; self « réglage coupé : aucune question automatique, aucune note », « l’interrupteur de la carte coupe et rétablit la recherche automatique » |
| REG-6 | General → Warn before quitting | binaire | ✅ | `warnOnQuit`, boîte de confirmation ; self « quitter : confirmation demandée seulement si le réglage est actif… » | Une boîte de dialogue, pas le « maintenir ⌘Q » d’Arc |
| REG-7 | General → bloqueur : activer, Advanced Ad Block Settings, Block Cookie Banners | binaire | ✅ | interrupteur, liste des sites en exception (retrait un à un), bandeaux de cookies masqués (`cookieBanners`) ; self « exceptions du bloqueur… », « bandeaux de cookies… » | Bandeaux : une trentaine de plateformes de consentement, masquées par CSS, sans rien accepter |
| REG-8 | General → Previews Settings (« Show Arc Previews: » dossiers, Google, Outlook, Notion…) | binaire | ➖ | | Aperçus de services tiers, écartés pour l'instant |
| REG-9 | General → renvoi vers les réglages du profil | binaire | ✅ | bouton « Ouvrir Profils » du volet Général ; ui 19 | |
| REG-10 | Profiles → liste des profils, nombre d'Espaces liés | binaire | ✅ | self | |
| REG-11 | Profiles → renommer, supprimer (si aucun Espace) | binaire | ✅ | self « profils : renommer ; supprimer seulement si aucun Espace ne l’utilise… » | |
| REG-12 | Profiles → Default Search Engine (Google, Perplexity, Bing, DuckDuckGo, Yahoo, Yandex), Search Settings | warren ; binaire | ✅ | moteur général et moteur propre à chaque profil (`profileSettings`) ; self « moteur de recherche propre à un profil… » ; ui 19 | Google, DuckDuckGo, Bing, Qwant, Ecosia, Brave ; pas de moteur personnalisé |
| REG-13 | Profiles → Include search engine suggestions | binaire | ✅ | général et par profil ; self « suggestions coupées pour ce seul profil » | |
| REG-14 | Profiles → Archive tabs after (12 h, 24 h, 7 jours, 30 jours), avec la question « tous les profils ou seulement celui-ci ? » | binaire | ✅ | délai général, et délai propre à un profil (« Comme le réglage général » sinon) ; self « archivage après 24 h pour un profil, jamais pour les autres », « et l’inverse » ; ui 19 | Plus « Jamais » |
| REG-15 | Profiles → Default Document App (Notion, Google Docs, Word, Confluence) | binaire ; HC 22557798824855 | ➖ | | Orbe a ses notes |
| REG-16 | Profiles → Download location | binaire | ✅ | dossier général (volet Général) et par profil ; self « un téléchargement arrive dans le dossier choisi », « dossier des téléchargements propre à un profil » | Le choix du dossier passe par la boîte du système, non pilotée par les tests |
| REG-17 | Profiles → Privacy and Security, mots de passe, cartes, Clear Browsing Data | binaire | 🟡 | volet Confidentialité : mots de passe, effacement des données, autorisations des sites | Pas de cartes bancaires (voir EXT-20) |
| REG-18 | Max → toutes les fonctions d'IA | binaire | ➖ | | Écarté |
| REG-19 | Links → Air Traffic Control | binaire | ✅ | self « aiguillage » | |
| REG-20 | Links → Open a Peek window when clicking on links to other sites (favoris et épinglés) | binaire | ✅ | `peekLinks` ; aperçu : ui 16 ; ui 19 « onglet épinglé : un lien vers un autre site s’ouvre en aperçu, ou dans l’onglet si le réglage est coupé » | |
| REG-21 | Links → Open a Peek window when clicking on links with Shift held | binaire | ✅ | `peekShift` ; ui 19 « ⇧-clic sur un lien : aperçu, sauf si le réglage est coupé » | Le ⇧clic levait une erreur avant ce chantier (Electron ne fournit pas de contenu à adopter sans `window.opener`) : corrigé |
| REG-22 | Links → Links from other apps open in Little Arc | binaire | ✅ | Espace affiché en dernier, petite fenêtre, ou un Espace précis ; self « lien d’une autre application : ouvert dans l’Espace choisi » ; ui 19 | |
| REG-23 | Links → Open Little Arc when clicking on links with ⌥⌘ held | binaire | ✅ | `littleAltClick` ; ui 19 « ⌥⌘-clic sur un lien : petite fenêtre… » | Dans l’essai, ⌥ est envoyée par Electron et le clic par Playwright ; ⌥ doit être enfoncée pendant que la page a le clavier |
| REG-24 | Links → Open Little Arc when I press (raccourci global) | binaire | ✅ | raccourci global (`globalShortcut`), choisi dans le volet Raccourcis ; self « raccourci global de la petite fenêtre : enregistré auprès du système… » | Le déclenchement depuis une autre application n’est pas testé |
| REG-25 | Links → Archive Little Arcs after | binaire | ✅ | `littleArchiveHours` ; self « petites fenêtres inutilisées : fermées après le délai, leur page dans l’archive » | « Jamais » par défaut |
| REG-26 | Shortcuts → recherche (« Type a feature name or shortcut »), raccourcis modifiables, description de chaque action | binaire | ✅ | volet Raccourcis : toutes les commandes par menu, recherche par nom ou par raccourci, enregistrement au clavier (`shortcuts.js`) ; self (une vingtaine de vérifications sur les raccourcis) ; ui 19 | Pas de description sous chaque action |
| REG-27 | Shortcuts → Reset All Shortcuts, Reset Shortcut to Default, Remove, Remove Conflicting Shortcut | binaire | ✅ | Tout rétablir, ↺ par commande, × pour retirer, « Réattribuer » en cas de conflit ; self ; ui 19 | |
| REG-28 | Shortcuts → priorité par raccourci : Arc gagne, le site gagne, ou une fois le site puis Arc | binaire | ➖ | | Les raccourcis d’Orbe sont des accélérateurs du menu natif : ils passent toujours avant la page, sans priorité réglable par raccourci |
| REG-29 | Shortcuts → Extension Shortcuts | binaire | ✅ | chaque commande d’extension a sa ligne dans le volet Raccourcis, modifiable, effaçable, rétablie ; ext (voir EXT-7) ; ui 14 |  |
| REG-30 | Shortcuts → « Include Favorites in ordering », « Switch to ninth tab » (pour ⌘1…⌘9) | binaire | ✅ | `tabKeysFavorites`, `tabKeysNinthLast` ; self « ⌘1…⌘9 : favoris comptés ou non, ⌘9 dernier ou neuvième » | |
| REG-31 | Shortcuts → Learn the Essential Shortcuts | binaire ; menu Help | ✅ | `shortcuts.html`, générée depuis la table des commandes et les raccourcis en vigueur ; self « page des raccourcis essentiels… » | |
| REG-32 | Icon → choix de l'icône | binaire | ➖ | | Orbe n’a qu’une icône ; il faudrait d’abord en dessiner d’autres |
| REG-33 | Advanced → Enable Boosts on websites you visit | binaire | ✅ | `boostsEnabled` ; self « Boosts : appliqués ou non selon le réglage, sans recharger la page » | |
| REG-34 | Advanced → Allow websites to get your theme data | binaire | ✅ | `themeData` (coupé par défaut) ; self « couleurs de l’Espace données aux pages seulement sur demande » | Variables `--orbe-theme-color` et `--orbe-theme-color-2`, pas celles d’Arc |
| REG-35 | Advanced → Enable Picture in Picture when you leave a video tab | binaire | ✅ | `autoPip` ; self (image dans l’image) et « …rien n’est demandé à la page quand le réglage est coupé » | |
| REG-36 | Advanced → Allow window dragging from the top of webpages | binaire | ➖ | | La marge au-dessus de la page sert déjà à déplacer la fenêtre ; rendre le haut de la page saisissable demanderait une vue par-dessus chaque page |
| REG-37 | Advanced → Enable Shared Quotes when highlighting text | binaire | ➖ | | Lié au partage en ligne |
| REG-38 | Advanced → Show full URL when Toolbar is enabled | binaire | ✅ | `showFullUrl` ; self « barre d’outils : adresse entière, ou seulement le site » ; ui 19 | |
| REG-39 | Advanced → When opening Arc, restore windows from previous session | binaire | ✅ | `restoreSession` ; self « reprise à l’ouverture : Espace et onglet actif repris, ou rien si le réglage est coupé » | Coupé : premier Espace, aucun onglet actif ; les onglets restent dans la barre. L’essai porte sur la décision, pas sur un vrai redémarrage |
| REG-40 | Advanced → Haptic feedback when reordering tabs | binaire | ➖ |  | Electron n’expose pas le retour haptique du pavé tactile (NSHapticFeedbackManager), et Orbe n’embarque aucun module natif ; la case, grisée et sans effet, est retirée des réglages |
| REG-41 | Advanced → Play Arc sound effects | binaire | ✅ | `sounds` ; self (son joué, puis coupé) | |
| REG-42 | Advanced → Reset Translated-site Prompts | binaire | ➖ | | Orbe ne traduit pas les pages : aucune invite à réinitialiser |
| REG-43 | Advanced → More Settings (réglages de Chromium : langues, contenu, sécurité) | binaire ; HC 25628125368087 | ➖ | | Pas de `chrome://settings` dans Electron ; les réglages utiles sont dans les volets d’Orbe |
| REG-44 | Orbe en plus : langue de l'interface, onglets gardés en mémoire, translucidité | | ✅ | ui 10 (langue) ; onglets en mémoire : self ; translucidité | Arc n'est qu'en anglais |

## MEN — Barre de menus, article par article

Relevé complet d'Arc par l'accessibilité. Orbe : `menu.js` ; test self « les 42 raccourcis d'Arc sont dans le menu » (présence des raccourcis) et `nat` (touches réelles). Un article ✅ renvoie à la ligne de fonction correspondante quand elle existe.

| Id | Menu → article d'Arc | Raccourci | État | Note |
| --- | --- | --- | --- | --- |
| MEN-1 | Arc → About Arc | | ✅ | |
| MEN-2 | Arc → Preferences… | ⌘, | ✅ | |
| MEN-3 | Arc → Share Arc | | ➖ | Parrainage |
| MEN-4 | Arc → Set as Default Browser (coché quand c'est le cas) | | ✅ | Case cochée quand Orbe est le navigateur par défaut ; self lat (réponse du système simulée dans les deux sens) |
| MEN-5 | Arc → Import from Another Browser… | | ✅ | Import d’Arc, et import de signets exportés par Chrome, Safari ou Firefox ; self (import Arc ; reglages : signets) |
| MEN-6 | Arc → Check for Updates… / Update Available… | | ✅ | « Rechercher les mises à jour… » dans le menu Orbe : ouvre la carte des mises à jour (Réglages → Avancé) et interroge GitHub ; self « barre de menus : « Rechercher les mises à jour… » » ; ui 24 |
| MEN-7 | Arc → Services, Hide Arc ⌘H, Hide Other Windows ⌥⌘H, Show All, Quit ⌘Q | | ✅ | Rôles natifs |
| MEN-8 | Arc → Privacy Policy | | ➖ | |
| MEN-9 | Arc → Sign Out | | ➖ | Pas de compte |
| MEN-10 | File → New Tab… | ⌘T | ✅ | |
| MEN-11 | File → New Window | ⌘N | ✅ | |
| MEN-12 | File → Blank Window | ⌃⌘N | ✅ | « Nouvelle fenêtre vierge » (⌃⌘N ; Alt+Maj+B sous Windows) : fenêtre hors des Espaces — ses onglets ne sont enregistrés dans aucun Espace et ne reviennent pas au redémarrage ; même session (cookies, historique, archive) que les fenêtres ordinaires, à la différence de la navigation privée ; ni nouvel Espace, ni profil, ni favoris. self fin (8) ; ui 28 |
| MEN-13 | File → New Incognito Window | ⇧⌘N | ✅ | |
| MEN-14 | File → New Little Arc Window | ⌥⌘N | ✅ | |
| MEN-15 | File → Restore Last Closed Tab | ⇧⌘T | ✅ | |
| MEN-16 | File → Open Command Bar | ⌘L | ✅ | |
| MEN-17 | File → New Profile | | ✅ | Aussi dans Fichier ; self lat |
| MEN-18 | File → New Easel | ⌃⇧E | ✅ | |
| MEN-19 | File → Close Window | ⇧⌘W | ✅ | |
| MEN-20 | File → Archive Tab | ⌘W | ✅ | |
| MEN-21 | File → Share… | | ✅ | « Partager… » (macOS, `ShareMenu`) au menu Fichier et au clic droit sur la barre d’outils ; self « barre de menus… ». Feuille de partage non vérifiée à la main |
| MEN-22 | File → Capture… | ⇧⌘2 | ✅ | ⇧⌘2 ; voir TAB-14 (self « capture… », raccourci vérifié dans self « raccourcis du menu ») |
| MEN-23 | File → Capture Full Page | | ✅ | |
| MEN-24 | File → Capture in Portrait Mode | | ✅ | Fichier → « Capturer en portrait » : la page posée sur un fond aux couleurs de l’Espace (portrait.js) ; self details « capture en portrait… » (4 vérifications) |
| MEN-25 | File → Save Page As | ⇧⌘S | ✅ | self lat : le fichier choisi contient la page (boîte d’enregistrement simulée) |
| MEN-26 | File → Print | ⌘P | ✅ | self fen « ⌘P : l’impression est demandée à la page affichée » |
| MEN-27 | Edit → Undo (libellé dynamique, par exemple « Close Peek ») / Redo | ⌘Z / ⇧⌘Z | ✅ | `M:build` ; self « menu Édition : Annuler Archiver l’onglet » ; ui 18 (libellés après chaque geste) |
| MEN-28 | Edit → Cut, Copy, Paste, Paste and Match Style ⇧⌘V, Delete, Select All | | ✅ | Rôles natifs ; « Delete » à vérifier |
| MEN-29 | Edit → Copy URL | ⇧⌘C | ✅ | |
| MEN-30 | Edit → Copy URL as Markdown | ⌥⇧⌘C | ✅ | |
| MEN-31 | Edit → Copy URL as Quote | ⌃⇧⌘C | ✅ | self lat : sélection copiée en citation Markdown avec sa source |
| MEN-32 | Edit → Find → Find… | ⌘F | ✅ | |
| MEN-33 | Edit → Find → Find and Replace | ⌥⌘F | ✅ | « Rechercher et remplacer… » (⌥⌘F) : la barre de recherche gagne « Remplacer par », « Remplacer » et « Tout ». Le remplacement passe par la commande d’édition de la page (annulable par ⌘Z), dans les champs de saisie et les zones de texte modifiable seulement ; le texte fixe d’une page n’est jamais touché. self fin (8) ; ui 28 |
| MEN-34 | Edit → Find → Find Next / Find Previous | ⌘G / ⇧⌘G | ✅ | |
| MEN-35 | Edit → Find → Use Selection to Find | | ✅ | La barre de recherche s’ouvre sur le texte sélectionné ; self lat (2 vérifications) |
| MEN-36 | Edit → Find → Jump to Selection | ⌘J | ✅ | « Aller à la sélection » (⌘J ; Alt+Maj+J sous Windows) : la sélection revient au milieu de l’écran ; self fin (3) |
| MEN-37 | Edit → Spelling and Grammar (sous-menu complet) | | 🟡 | Sous-menu « Orthographe et grammaire » avec « Vérifier l’orthographe lors de la saisie » (seul rôle qu’Electron expose ; self fin) ; fenêtre d’orthographe, grammaire et correction automatique de macOS : non exposées par Electron ; suggestions au clic droit |
| MEN-38 | Edit → Substitutions, Transformations, Speech | | ✅ | Substitutions et Parole : rôles de macOS (afficher, guillemets, tirets, remplacement ; lire, arrêter). Transformations : majuscules, minuscules, capitales sur la sélection du champ de texte, sur tous les systèmes. self fin (5) |
| MEN-39 | Edit → Format → Font → Bold, Italic, Underline | ⌘B, ⌘I, ⌘U | ✅ | Tranché : Édition → Format → Police → Gras, Italique, Souligné, sans raccourci attaché au menu. ⌘B, ⌘I et ⌘U restent donc aux pages : un éditeur en ligne les gère lui-même, et Chromium les applique déjà dans les zones de texte enrichi ; le menu ne peut jamais passer avant un site. Un clic sur l’article applique la mise en forme ; un raccourci peut être choisi dans les réglages. self fin (3 : articles sans raccourci, mise en forme au clic, « ⌘B dans une page qui le gère elle-même ») |
| MEN-40 | View → Appearance → Automatic, Light, Dark | | ✅ | |
| MEN-41 | View → Hide Sidebar | ⌘S | ✅ | |
| MEN-42 | View → Show Toolbar | ⇧⌘D | ✅ | ui 07 |
| MEN-43 | View → Collapse Pinned Tabs | | ✅ | Voir BL-41 ; le libellé bascule ; self lat |
| MEN-44 | View → Stop Loading | ⌘. | ✅ | |
| MEN-45 | View → Refresh the Page | ⌘R | ✅ | |
| MEN-46 | View → Force Refresh the Page | ⇧⌘R | ✅ | |
| MEN-47 | View → Clear Cookies and Refresh | | ✅ | self lat : cookie et stockage local du site effacés, page rechargée |
| MEN-48 | View → Clear Cache and Refresh | | ✅ | self lat : cache vide après la commande, actualisation demandée |
| MEN-49 | View → Add Split View | ⌃⇧= | ✅ | |
| MEN-50 | View → Close this Split Pane | ⌃⇧- | ✅ | |
| MEN-51 | View → Separate Page from Split View | | ✅ | W:separateSplit, grisé hors d’une vue scindée ; self lat (3 vérifications) |
| MEN-52 | View → Expand Current Split | | ✅ | « Agrandir ce volet » ; self « barre de menus : Agrandir ce volet… » (voir SCI-14) |
| MEN-53 | View → Zoom to Actual Size, Zoom In, Zoom Out | ⌘0, ⌘+, ⌘- | ✅ | self lat : niveaux de zoom lus sur la page (0,5 ; −0,5 ; 0) |
| MEN-54 | View → Cast | | ➖ | Electron n’embarque pas le routeur de médias de Chrome (Cast) |
| MEN-55 | View → Developer → View Source | ⌥⌘U | ✅ | self lat : onglet « view-source: » chargé depuis le site |
| MEN-56 | View → Developer → Developer Tools, Inspect Elements, JavaScript Console | ⌥⌘I, ⌥⌘C, ⌥⌘J | ✅ | self lat : outils ouverts puis refermés, console, inspecteur |
| MEN-57 | View → Developer → Network Inspector | | ✅ | Présentation → Développeur → « Inspecteur réseau » : outils de développement sur l’onglet Réseau ; self fin |
| MEN-58 | View → Developer → Allow JavaScript from Apple Events | | ➖ | Pas d’AppleScript dans Orbe |
| MEN-59 | View → Developer → Turn on Developer Mode for this site | ⌃D | ✅ | W:toggleDevMode ; self (reglages) « mode développeur d’un site… », « ⌃D sur macOS… » |
| MEN-60 | View → Enter Full Screen | ⌃⌘F | ✅ | ⌃⌘F (F11 sous Windows) ; self fin « Plein écran (⌃⌘F) demande le plein écran de la fenêtre » |
| MEN-61 | Spaces → New Space… | | ✅ | |
| MEN-62 | Spaces → Edit Theme… | | ✅ | |
| MEN-63 | Spaces → Rename Space | | ✅ | |
| MEN-64 | Spaces → Change Profile | | ✅ | |
| MEN-65 | Spaces → Next Space / Previous Space | ⌥⌘→ / ⌥⌘← | ✅ | |
| MEN-66 | Spaces → liste des Espaces | ⌃1 … ⌃9 | ✅ | |
| MEN-67 | Spaces → Manage Spaces… | | ✅ | « Gérer les Espaces… » (menu Espaces, menu de l’Espace, barre de commande) ouvre la section Espaces de la Bibliothèque (renommer, thème, supprimer, nouvel Espace : ui 25). self fin (2) ; ui 28 |
| MEN-68 | Tabs → New Tab… | ⌘T | ✅ | |
| MEN-69 | Tabs → Pin Tab | ⌘D | ✅ | |
| MEN-70 | Tabs → New Folder… | | ✅ | |
| MEN-71 | Tabs → Next Tab / Previous Tab | ⌥⌘↓ / ⌥⌘↑ | ✅ | |
| MEN-72 | Tabs → Reveal Tab in Sidebar | | ✅ | Voir ONG-26 ; self lat ; ui 22 |
| MEN-73 | Tabs → Clear Today | ⇧⌘K | ✅ | |
| MEN-74 | Tabs → Reset all tabs in this Space | | ✅ | Voir ONG-12 ; self lat |
| MEN-75 | Archive → Go Back / Go Forward | ⌘[ / ⌘] | ✅ | |
| MEN-76 | Archive → View History | ⌘Y | ✅ | |
| MEN-77 | Archive → View Archive… | | ✅ | |
| MEN-78 | Archive → Clear Archive | | ✅ | Question avant de vider (nombre d’onglets) ; self lat (3 vérifications) |
| MEN-79 | Extensions → une ligne par extension | | ✅ | Une ligne par extension, même effet que son bouton ; self lat (liste d’extensions simulée) |
| MEN-80 | Extensions → Add Extension…, Manage Extensions… | | ✅ | Les deux articles ouvrent le volet Extensions des réglages, où se fait l’ajout ; self lat |
| MEN-81 | Window → Stay On Top | | ✅ | Commande stayOnTop, article coché ; self lat (2 vérifications) |
| MEN-82 | Window → Minimize ⌘M, Minimize All ⌥⌘M, Zoom | | ✅ | Placer dans le Dock (⌘M), Tout placer dans le Dock (⌥⌘M, macOS), Réduire/agrandir ; self fin (2) |
| MEN-83 | Window → disposition en moitiés et quarts (fournie par macOS) | | 🟡 | Le menu porte le rôle « window » : macOS y ajoute lui-même la disposition en moitiés et en quarts. Non vérifiable par un test (articles ajoutés par le système) : à constater à l’œil |
| MEN-84 | Window → Open Library… | ⇧⌘L | ✅ | |
| MEN-85 | Window → View Downloads… | ⇧⌘J | ✅ | |
| MEN-86 | Window → View Easels… | | ✅ | |
| MEN-87 | Window → View Media… | | ✅ | « Médias » ouvre la Bibliothèque sur sa section Médias (une liste ; la grille de vignettes est BIB-7) ; self fin2 « barre de menus : « Médias » ouvre la Bibliothèque… » (2) ; ui 29 « menu « Médias »… » |
| MEN-88 | Window → View Boosts… | | ✅ | « Afficher les Boosts… » (menu Présentation) ; self « barre de menus… » (voir BOO-11) |
| MEN-89 | Window → Bring All to Front, liste des fenêtres | | ✅ | Rôle natif |
| MEN-90 | Help → Getting Started | | ✅ | « Bienvenue dans Orbe » ; self « la page d'accueil s'affiche » |
| MEN-91 | Help → Essential Keyboard Shortcuts | | ✅ | self (reglages) « page des raccourcis, barre de commande et pages de l’interface : même nouveau raccourci » |
| MEN-92 | Help → Contact the Team, Visit Help Center | | ✅ | Centre d’aide, « Signaler un problème », nouveautés : pages du dépôt GitHub (Orbe n’a pas d’équipe d’assistance) ; self cmd (barre de commande et exécution) |
| MEN-93 | Help → Restore Data | | ✅ | Aide → Dépannage → « Restaurer une sauvegarde » (sauvegardes locales de l’état) ; self lat (menu), self bib (sauvegardes) |
| MEN-94 | Help → Export Arc Notes | | ✅ | Aide → « Exporter les notes… » ; self bib (5 vérifications) |
| MEN-95 | Help → Troubleshooting → Record Trace, Open Task Manager, Reveal Arc Data, Copy Arc Info | | ✅ | « Afficher les données d’Orbe », « Copier les infos d’Orbe », « Gestionnaire de tâches », « Enregistrer une trace… » ; self lat « Aide → Dépannage : … », self « gestionnaire de tâches : … » (EXT-22) |
| MEN-96 | Menu du Dock : New Incognito Window, Show/Hide All Little Arc Windows | HC 20498377604887 | ✅ | Navigation privée ; masquer ou afficher toutes les petites fenêtres ; self lat (modèle du menu actionné ; l’affichage dans le Dock lui-même n’est pas lisible par un test) |

## RAC — Raccourcis

Arc : `menu` pour ceux de la barre de menus, sinon la source indiquée. Orbe : `nat` = vérifié par touche réelle (`tests/natif/raccourcis.js`, à lancer à la main), `self` = présence dans le menu.

| Id | Raccourci | Action dans Arc | Preuve Arc | État | Note |
| --- | --- | --- | --- | --- | --- |
| RAC-1 | ⌘T | Barre de commande, nouvel onglet | menu | ✅ | |
| RAC-2 | ⌘L | Modifier l'adresse | menu | ✅ | |
| RAC-3 | ⌘N / ⇧⌘N / ⌥⌘N | Fenêtre, fenêtre privée, petite fenêtre | menu | ✅ | |
| RAC-4 | ⌃⌘N | Fenêtre vierge | menu | ✅ | « Nouvelle fenêtre vierge » (⌃⌘N ; Alt+Maj+B sous Windows) : fenêtre hors des Espaces — ses onglets ne sont enregistrés dans aucun Espace et ne reviennent pas au redémarrage ; même session (cookies, historique, archive) que les fenêtres ordinaires, à la différence de la navigation privée ; ni nouvel Espace, ni profil, ni favoris. self fin (8) ; ui 28 |
| RAC-5 | ⌘W / ⇧⌘W | Archiver l'onglet, fermer la fenêtre | menu | ✅ | |
| RAC-6 | ⇧⌘T | Rouvrir | menu | ✅ | |
| RAC-7 | ⌘Z / ⇧⌘Z | Annuler, rétablir (actions de la barre) | menu | ✅ | ui 18 (annuler et rétablir, geste par geste) ; self barre « ⌘Z défait toute la suite… », « ⇧⌘Z refait toute la suite… » |
| RAC-8 | ⌘D | Épingler | menu | ✅ | |
| RAC-9 | ⌘S | Barre latérale | menu | ✅ | |
| RAC-10 | ⇧⌘D | Barre d'outils | menu | ✅ | |
| RAC-11 | ⇧⌘K | Effacer les onglets du jour | menu | ✅ | |
| RAC-12 | ⇧⌘C / ⌥⇧⌘C / ⌃⇧⌘C | Copier l'adresse, en Markdown, en citation | menu | ✅ | Citation non testée |
| RAC-13 | ⌘1 … ⌘9 | Élément n de la barre | binaire | ✅ | |
| RAC-14 | ⌃1 … ⌃9 | Espace n | menu | ✅ | |
| RAC-15 | ⌃⇥ / ⌃⇧⇥ | Onglets récents | HC 25619402657303 | ✅ | |
| RAC-16 | ⌃` | Onglets récents (variante) | HC 25619402657303 | ✅ | ⌃` ouvre la bascule des onglets récents, comme ⌃Tab ; self « ⌃` : onglets récents, comme ⌃Tab » |
| RAC-17 | ⌥⌘↓ / ⌥⌘↑ | Onglet suivant, précédent | menu | ✅ | |
| RAC-18 | ⌥⌘→ / ⌥⌘← | Espace suivant, précédent | menu | ✅ | |
| RAC-19 | ⌘[ / ⌘] | Page précédente, suivante | menu | ✅ | |
| RAC-20 | ⌘← / ⌘→ | Page précédente, suivante | HC 20595231349911 | ✅ | macOS : ⌘← / ⌘→ hors d’un champ de saisie (la page est interrogée) ; self « ⌘← / ⌘→ hors d’un champ de saisie… », « ⌘← dans un champ de saisie : la page ne change pas ». Windows : Alt+← / Alt+→ (RAC-19) |
| RAC-21 | ⌘R / ⇧⌘R / ⌘. | Actualiser, forcer, arrêter | menu | ✅ | |
| RAC-22 | ⌃⇧= / ⌃⇧- | Ajouter, fermer un volet | menu | ✅ | |
| RAC-23 | ⌃⇧1 … ⌃⇧4 | Aller au volet | binaire ; hongkiat | ✅ | |
| RAC-24 | ⌃⇧[ / ⌃⇧] | Volet précédent, suivant | hongkiat (peu fiable) | ✅ | commandes `nextPane` / `prevPane` (⌃⇧] / ⌃⇧[, modifiables) ; self « ⌃⇧] / ⌃⇧[ : volet suivant et précédent, en boucle » |
| RAC-25 | ⌘F / ⌘G / ⇧⌘G | Chercher, suivant, précédent | menu | ✅ | |
| RAC-26 | ⌥⌘F / ⌘J | Chercher et remplacer, aller à la sélection | menu | ✅ | ⌥⌘F : rechercher et remplacer (MEN-33) ; ⌘J : aller à la sélection (MEN-36). self fin ; ui 28 |
| RAC-27 | ⌘0 / ⌘+ / ⌘- | Zoom | menu | ✅ | self « ⌘+ / ⌘- / ⌘0 : zoom de la page, pourcentage affiché à chaque fois » |
| RAC-28 | ⌘Y | Historique | menu | ✅ | |
| RAC-29 | ⇧⌘L / ⇧⌘J | Bibliothèque, téléchargements | menu | ✅ | |
| RAC-30 | ⇧⌘2 | Capture | menu | ✅ | self « capture d’une zone : enregistrée », « …l’image a les proportions de la zone » |
| RAC-31 | ⌃⇧E | Nouveau tableau | menu | ✅ | |
| RAC-32 | ⌃⇧N / ⌃⌥N | Nouvelle note, note en vue scindée | HC 22557798824855 | ✅ | ⌃⇧N et ⌃⌥N ; self bib « notes : ⌃⇧N… » |
| RAC-33 | ⇧⌘S / ⌘P | Enregistrer la page, imprimer | menu | ✅ | self « ⇧⌘S : la page est enregistrée dans le fichier choisi, nommé d’après son titre », « ⌘P : l’impression est demandée à la page affichée » (la boîte d’impression du système n’est pas ouverte dans l’essai) |
| RAC-34 | ⌥⌘U / ⌥⌘I / ⌥⌘C / ⌥⌘J | Source, outils, inspecteur, console | menu | ✅ | self « ⌥⌘U : le code source s’ouvre dans un nouvel onglet », « ⌥⌘I, ⌥⌘C, ⌥⌘J… au menu, avec leur raccourci » (l’ouverture des outils eux-mêmes n’est pas essayée) |
| RAC-35 | ⌃D | Mode développeur du site | menu | ✅ | `toggleDevMode` : barre d’outils et adresse entière pour le site ; Alt+Shift+D sous Windows ; self |
| RAC-36 | ⌃⌘F | Plein écran | menu | ✅ | ⌃⌘F (F11 sous Windows) ; self fin « Plein écran (⌃⌘F) demande le plein écran de la fenêtre » |
| RAC-37 | ⌘O / ⌥⌘O | Dans un aperçu ou une petite fenêtre : ouvrir en onglet, choisir l'Espace | HC 19235387524503 | ✅ | ⌥⌘O sans effet dans la fenêtre principale d'Orbe (corps vide) |
| RAC-38 | ⌥⌘V | Coller l'adresse dans un nouvel onglet | HC 20498377604887 | ✅ | voir ONG-25 ; self lat ; ui 22 |
| RAC-39 | ⌘E | Faire défiler les extensions | HC 19434259167767 | ✅ | Voir EXT-4 : ⌘E ouvre l’extension suivante, referme après la dernière ; ext « ⌘E : une extension après l’autre… » (3 vérifications) |
| RAC-40 | ⌥⌘⌫ | Supprimer la suggestion désignée | HC 20498377604887 | ✅ | ⌥⌘⌫ (Ctrl+Alt+⌫ sous Windows) oublie la suggestion désignée ; self cmd ; ui 24 |
| RAC-41 | ⌥⌘G | ChatGPT | HC 19335160678679 | ➖ | |
| RAC-42 | ⌃⌘J | Rejoindre la prochaine réunion | HC 24158102740631 | ➖ | |
| RAC-43 | ⌘, / ⌘H / ⌥⌘H / ⌘M / ⌥⌘M / ⌘Q | Réglages et raccourcis du système | menu | ✅ | |
| RAC-44 | ⇧⌘V | Coller en adaptant le style | menu | ✅ | |
| RAC-45 | Échap | Préfère le site ; maintenu ou doublé, quitte le plein écran | HC 25619348451223 | ✅ | Échap va d’abord à la page ; ferme aperçu, recherche, sélecteur d’icône, barre de commande. Fenêtre en plein écran : Échap doublé (400 ms) ou maintenu (0,6 s) en fait sortir (W:escFullScreen). self fin2 (6 vérifications) ; ui 29 « plein écran : un Échap ne fait rien, Échap doublé fait sortir la fenêtre du plein écran » (vrai plein écran ; ignoré si le système le refuse). Le plein écran d’une page (vidéo) garde le comportement du moteur : un Échap suffit |
| RAC-46 | ⇧clic / ⌥clic / ⌥⌘clic sur un lien | Aperçu, vue scindée, petite fenêtre | HC 20498377604887 | ✅ | ⇧clic et ⌥⌘clic : ui 19 ; ⌥clic (vue scindée) : self, ui 12 |
| RAC-47 | Raccourci global pour la petite fenêtre | Réglable | binaire | ✅ | Volet Raccourcis, « Partout sur l’ordinateur » ; self (voir REG-24) |
| RAC-48 | Tous les raccourcis modifiables | Volet Shortcuts | binaire | ✅ | self ; ui 19 (voir REG-26) |

## IMP — Import, accueil, mises à jour

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| IMP-1 | Accueil en plusieurs étapes : compte, import, thème, sites favoris, bloqueur, navigateur par défaut, carte de membre | popsci ; inverse | ✅ | accueil en cinq étapes (`welcome.html`) : bienvenue, import depuis les navigateurs trouvés, couleur de l’Espace, navigateur par défaut, premiers gestes et soutien ; « Passer l’accueil » à chaque étape, jamais réaffiché (`window.welcomed`) ; self « accueil : une étape à la fois… », « étape couleur : un clic teinte l’Espace affiché… », « « Commencer à naviguer » referme l’accueil, qui ne reviendra pas » (tests/accueil.js, 13) ; ui 24 « accueil : cinq étapes… » | Pas de compte, pas de carte de membre (Orbe n’en a pas) ; bloqueur actif d’office ; pas d’étape « sites favoris » : les signets importés arrivent épinglés |
| IMP-2 | Accueil avec éclat de couleurs et musique | inverse ; binaire `intro-music.mp3`, `orb.mp4` | ✅ | halo de couleurs animé autour de l’orbe à l’ouverture de l’accueil (CSS, coupé par « Réduire les animations ») ; aucun test | halo de couleurs, vague du logo et musique originale de 7 s à l’ouverture de l’accueil (réglage « Sons », bouton pour la couper, muette pendant les essais) ; self tests/sensations.js (6 vérif.), ui 29-sensations (3 vérif.). La musique reste à écouter : voir SON-3 |
| IMP-3 | Petites vidéos d'apprentissage : épingler, changer d'Espace, nouvel onglet, vue scindée | binaire `pinning.mp4`, `space_swiping.mp4`, `new_tab.mp4`, `split_view.mp4` | ✅ | six raccourcis listés | six démonstrations animées dessinées dans l’accueil (nouvel onglet, épingler, changer d’Espace, vue scindée, masquer la barre, petite fenêtre) : boucles de 4,2 s en transformations et opacité, figées par « Réduire les animations » ; ui 29-sensations (3 vérif., médiane 8,3 ms, 95e centile 10,1 ms, 0 mise en page). Dessins CSS à la place de vidéos enregistrées |
| IMP-4 | Textes d'accueil : « Open your first tab », « Pin tabs to save for later », « Spaces for work and life », « Multitask with Split View » | binaire | ✅ | dernière étape de l’accueil : « Ouvre ton premier onglet », « Épingle un onglet pour le garder », « Change d’Espace : travail, perso… », « Deux pages côte à côte », chacun avec son raccourci en vigueur ; self « dernière étape : premiers gestes avec leurs raccourcis… » | Textes propres à Orbe, français et anglais |
| IMP-5 | Onglets et dossier « Arc Basics » posés au départ | binaire | ✅ | | Premier lancement : dossier « Premiers pas » en tête des épinglés (raccourcis essentiels, centre d’aide, nouveautés), onglets en veille tant qu’on ne les ouvre pas ; posé une seule fois (starter.js) ; self fin2 « premier lancement… » (4) ; ui 29 « premier lancement : le dossier « Premiers pas »… » |
| IMP-6 | Import depuis Chrome, Safari, Firefox, Brave, Edge, Opera, Vivaldi : signets vers les épinglés, mots de passe, cookies, plusieurs profils | HC 19335089616791 ; binaire | ✅ | lecture directe des profils (`import-browsers.js`) : Chrome, Brave, Edge, Vivaldi, Opera, Chromium (JSON), Firefox (places.sqlite par le sqlite3 du système, sinon sauvegarde mozLz40), Safari (liste de propriétés binaire), plusieurs profils ; aperçu des comptes, import en onglets épinglés, annulation ; self « Chrome : barre de favoris au premier niveau… », « Firefox sans sqlite3 : dernière sauvegarde… », « Safari : liste de propriétés binaire décodée… », « Windows : Chrome, Brave et Opera sous AppData… », « signets par milliers… plafonnés » (tests/import-navigateurs.js, 36) ; ui 24 « « Importer » : un Espace au nom du navigateur… » ; Arc (self) ; fichier HTML (self, ui 19) ; mots de passe par CSV (self) | Signets seulement. Hors périmètre, par choix : mots de passe en lecture directe (CSV à la place), cookies (chiffrés par chaque navigateur), historique. Profils d’essai fabriqués d’après les formats : vrais profils et « Accès complet au disque » pour Safari à vérifier à la main |
| IMP-7 | Choix du profil de destination ; « Replace existing cookies with imported cookies » | binaire | ✅ | destination choisie avant l’import : nouvel Espace d’un profil, ou un Espace existant (dans un dossier au nom du navigateur) ; self « import dans un nouvel Espace du profil choisi… », « import dans un Espace existant… », « destination inconnue : refusée » ; ui 24 « Firefox… et Safari… s’importent de même, dans l’Espace choisi » | Pas d’import de cookies (hors périmètre : voir IMP-6) |
| IMP-8 | Favoris suggérés d'après l'historique importé | HC 20498377604887 | ➖ |  | Écarté : l’historique n’est pas importé (IMP-6), il n’y a donc rien d’où tirer des suggestions |
| IMP-9 | Invite « Arc works best as your default browser », avec essai d'une semaine | binaire | ✅ | étape « Ouvre tes liens dans Orbe » de l’accueil : état, bouton « Définir par défaut » ; self « étape navigateur par défaut : le bouton fait la demande au système, une fois » ; ui 24 | Pas d’« essai d’une semaine » : le choix se défait dans les réglages du système |
| IMP-10 | Mise à jour automatique (Sparkle), bandeau « Restart and Update », notes de version | binaire ; HC 21489650267031 | ✅ | recherche d’une nouvelle version sur GitHub Releases (`updates.js`) : une fois par jour et à la demande (menu Orbe, Réglages → Avancé), note dans la barre latérale, notes de version, page de téléchargement, archive téléchargée et vérifiée (taille, SHA-256), réglage pour couper ; self « une version plus récente est annoncée… », « la question ne porte aucun identifiant… », « automatique : pas de seconde question dans la journée », « quota de GitHub dépassé : rien n’est affiché… », « archive modifiée, plus longue ou tronquée : refusée… » (tests/mises-a-jour.js, 33) ; ui 24 « menu « Rechercher les mises à jour… »… » | Orbe ne se remplace pas lui-même (ni Sparkle ni Squirrel sans signature de développeur) : l’archive est montrée, l’utilisateur remplace l’application. Une vraie mise à jour d’une version à la suivante reste à vérifier à la main |
| IMP-11 | Fenêtre « Essential Keyboard Shortcuts » | menu ; binaire | ✅ | `shortcuts.html` ; self « page des raccourcis essentiels : cinq rubriques, chaque ligne avec son raccourci en vigueur » | Une page dans un onglet, pas une fenêtre |
| IMP-12 | Interface en anglais seulement | HC 19437072655255 | ✅ | français et anglais ; ui 10 | Orbe fait mieux |
| IMP-13 | Pilotage par AppleScript (fenêtres, Espaces, onglets, JavaScript) | binaire `Arc.sdef` | ➖ |  | AppleScript demande un dictionnaire (sdef) servi par du code natif (NSScriptCommand) ; Electron n’en fournit pas et Orbe n’embarque aucun module natif |
| IMP-14 | Handoff depuis iOS ; Touch ID pour les sites | HC 20498417809815 | 🟡 | Handoff : une page web reprise d’un autre appareil s’ouvre dans un onglet (`continue-activity`, adresses http(s) seulement) ; self « Handoff : une page web reprise d’un autre appareil… » | À vérifier avec un vrai iPhone (l’application doit être signée et navigateur par défaut). Touch ID pour les sites (WebAuthn) : absent d’Electron |

## DIV — Divers

| Id | Ce que fait Arc | Preuve Arc | État | Preuve Orbe | Note |
| --- | --- | --- | --- | --- | --- |
| DIV-1 | Barre d'outils (⇧⌘D) : précédent, suivant, actualiser, adresse, extensions épinglées à droite | HC 25625617866263 | ✅ | bandeau de 38 px sans extensions ; ui 07 | Bandeau de 38 px : précédent, suivant, actualiser, adresse, et les boutons d’extension à droite de l’adresse (ils quittent alors le dessous de la pastille) ; self fin2 « barre d’outils affichée : les boutons d’extension… » ; ui 07 ; ui 14 « barre d’outils affichée (⇧⌘D) : le bouton de l’extension passe à droite de l’adresse… » |
| DIV-2 | Clic droit sur la barre d'outils : Show Full URL, copier, capture, partager | HC 20498377604887 | ✅ | adresse entière, copier (aussi en Markdown), capture, partager (feuille de partage de macOS), masquer ; self « clic droit sur la barre d’outils… » (trois vérifications). Feuille de partage non vérifiée à la main | |
| DIV-3 | En vue scindée, la barre d'outils montre l'adresse de chaque volet | HC 20498377604887 | ✅ | chaque volet porte sa petite barre avec son adresse (la barre d’outils garde celle du volet actif) ; self, ui 12 (voir SCI-5) | |
| DIV-4 | Recherche dans la page | menu | ✅ | self « ⌘F trouve le texte dans la page » ; ui 08 | |
| DIV-5 | Zoom : pourcentage affiché | HC 20498293324823 | ✅ | message « Zoom N % » à chaque changement ; self « ⌘+ / ⌘- / ⌘0 : zoom de la page, pourcentage affiché à chaque fois » | |
| DIV-6 | Messages (toasts) au-dessus de la page, cliquables | HC 20498417809815 | ✅ | self « message (toast) : affiché par-dessus la page », « message cliquable : le clic lance son action et le fait disparaître » ; « Nouvel onglet créé » mène à l’onglet | |
| DIV-7 | Copie de l'adresse sans les paramètres de pistage (« Super Copy », cas d'Amazon et d'Instagram) | HC 20498293324823 ; binaire « without any trackers » | ✅ | utm_*, fbclid, gclid, igshid, etc. retirés à la copie (⇧⌘C, Markdown, citation, menus) ; fiche Amazon réduite à son produit ; self « copie d’adresse : paramètres de pistage retirés… », « ⇧⌘C et ⌥⇧⌘C copient l’adresse sans ses paramètres de pistage » | |
| DIV-8 | Fenêtre privée | menu | ✅ | self (deux vérifications) | |
| DIV-9 | Fenêtre vierge (hors Espaces, non synchronisée) | menu ; HC 20498377604887 | ✅ | W (fenêtre `blank`), C:newBlank | « Nouvelle fenêtre vierge » (⌃⌘N ; Alt+Maj+B sous Windows) : fenêtre hors des Espaces — ses onglets ne sont enregistrés dans aucun Espace et ne reviennent pas au redémarrage ; même session (cookies, historique, archive) que les fenêtres ordinaires, à la différence de la navigation privée ; ni nouvel Espace, ni profil, ni favoris. self fin (8) ; ui 28 |
| DIV-10 | Stay On Top | menu | ✅ | self « Toujours au premier plan : la fenêtre passe au-dessus des autres, puis revient » | |
| DIV-11 | Plein écran : nouvelles fenêtres en plein écran, barre au survol | HC 20498377604887 | ✅ | natif | Une fenêtre ouverte depuis une fenêtre en plein écran (⌘N, privée, vierge) s’ouvre en plein écran elle aussi (W:OrbeWindow.open) ; en plein écran la barre masquée se montre au survol du bord (BL-9) et ne réserve plus la place des boutons de la fenêtre. self fin2 (2 vérifications) ; ui 29 « fenêtre en plein écran : ⌘N ouvre la nouvelle fenêtre en plein écran elle aussi » (vrai plein écran ; ignoré si le système le refuse) |
| DIV-12 | Page d'erreur | non vérifié | ✅ | self (deux vérifications) ; ui 09 | |
| DIV-13 | Menu de page, lien : ouvrir dans un nouvel onglet, en vue scindée, en aperçu, dans Little Arc, copier | slashgear ; binaire « Open in Background Tab », « Open in Split View » | ✅ | self « menu de page, lien… » (cinq vérifications : contenu, nouvel onglet en arrière-plan, vue scindée, aperçu, petite fenêtre) | |
| DIV-14 | Menu de page, sélection : chercher, « Share Quote » | HC 20498293324823 ; binaire « Search With Google » | ✅ | copier, rechercher, « Copier la sélection en citation » (équivalent de Share Quote) ; self « menu de page, sélection… », « Copier la sélection en citation… » | |
| DIV-15 | Menu de page, image : ouvrir, copier, enregistrer | non vérifié (Chromium) | ✅ | self « menu de page, image : ouvrir, copier, copier l’adresse, enregistrer » (contenu du menu ; les actions elles-mêmes sont celles de Chromium) | |
| DIV-16 | Menu de page, vidéo : image dans l'image | HC 19234766331799 | ✅ | « Image dans l’image » au menu d’une vidéo : la détache, une seconde fois la ramène ; self « menu d’une vidéo… » (lecture réelle vérifiée en intégration sur macOS et Windows ; ignorée écran verrouillé) | |
| DIV-17 | Menu de page : traduire, « Customize Page » (Boost) | HC 25626093607703 ; binaire | ✅ | « Modifier le Boost de ce site… » et « Traduire la page » (page traduite par Google dans un nouvel onglet, sur un clic) ; self « menu de page, page… », « Traduire la page… » | |
| DIV-18 | Menu de page : Inspecter | non vérifié | ✅ | « Inspecter » en dernier article de chaque menu de page ; self (cinq menus vérifiés) | |
| DIV-19 | Boîte « quitter la page ? » (`beforeunload`) | non vérifié (Chromium) | ✅ | question « Quitter la page ? » à la navigation, à la fermeture de l’onglet, de plusieurs onglets et de la fenêtre (unload.js) ; self « fermer l’onglet puis « Rester » : l’onglet revient… », « archiver plusieurs onglets : une question par page… », « fermer la fenêtre puis « Rester »… » ; ui « page modifiée au clavier… » | Aperçu fermé sans question |
| DIV-20 | Fenêtres surgissantes bloquées | non vérifié (Chromium) | ✅ | bloquées sans geste, mention dans la pastille, « Ouvrir quand même », « Toujours autoriser pour ce site » (popups.js) ; self « window.open sans geste : bloqué », « après un vrai clic : la fenêtre s’ouvre, avec window.opener » ; ui « fenêtre ouverte sans geste : bloquée… » | Heuristique de geste documentée dans popups.js |
| DIV-21 | Lecture de PDF | non vérifié (Chromium) | ✅ | visionneuse de Chromium (aucun réglage à changer) ; PDF téléchargé ouvert dans un onglet ; self « un PDF s’affiche dans la visionneuse de Chromium », « PDF téléchargé : ouvert dans un onglet » |  |
| DIV-22 | Vidéos protégées (Netflix, etc.) | non vérifié | ➖ | seulement avec le moteur optionnel | Écarté : les vidéos protégées demandent le module Widevine, absent d’Electron ; elles ne fonctionnent qu’avec le moteur optionnel (voir docs), limite connue et acceptée |
| DIV-23 | La boîte « Quitter » montre l'icône choisie | HC 20498293324823 | ➖ | | Détail lié aux icônes |
| DIV-24 | Aperçus au survol des favoris (Gmail, Agenda, Notion, Linear, Figma) et agenda vivant | HC 19335284431639, 24158102740631 | ➖ | | Services tiers, écartés pour l'instant |
| DIV-25 | Partage d'Espaces, de dossiers, d'onglets par lien | HC 19228534606743 | ➖ | | Demande un serveur |
| DIV-26 | Résumés au survol des liens, questions à la page | HC 19335160678679 | ➖ | | Fonctions d'IA |
| DIV-27 | Cadenas / « Non sécurisé » dans la pastille d’adresse ; clic : résumé du certificat | usage courant des navigateurs | ✅ | certs.state + feuille « site » ; self « pastille d’adresse : « Non sécurisé » pendant l’avertissement », « résumé du certificat pour le cadenas » ; ui « après « continuer » : la pastille reste « Non sécurisé » » |  |
| DIV-28 | Page plantée (« La page a planté », Recharger) ; page qui ne répond plus (Attendre / Recharger) | usage courant des navigateurs | ✅ | essentials.js (render-process-gone, unresponsive) ; self « page plantée : feuille… », « page qui ne répond plus… » |  |
| DIV-29 | Liens vers d’autres applications (`mailto:`, `tel:`, liens d’application) : question, mémorisée par site et par schéma | usage courant des navigateurs | ✅ | permissions.js (openExternal) ; self « lien mailto: : Orbe demande avant d’ouvrir une autre application », « schémas dangereux… : jamais ouverts » |  |
| DIV-30 | Appareils USB, HID, série, Bluetooth demandés par une page | usage courant des navigateurs | 🟡 | demande annulée proprement avec un message, jamais d’appareil choisi d’office ; self « Bluetooth : la demande est annulée tout de suite… », « USB… », « port série… » | Demande annulée proprement avec un message, jamais d’appareil choisi d’office ; self « Bluetooth : la demande est annulée tout de suite… », « USB… », « port série… ». Reste à faire : un sélecteur d’appareil (feuille d’Orbe listant les appareils, comme pour le partage d’écran) |
| DIV-31 | Certificat client demandé par un site : choix explicite | usage courant des navigateurs | ✅ | auth.js ; self « certificat client : Electron n’envoie pas le premier d’office ; Orbe demande lequel » | Vrai certificat du trousseau : à vérifier à la main |
| DIV-32 | Téléchargements : reprise après interruption (même après fermeture), mise en garde pour les exécutables | usage courant des navigateurs | ✅ | downloads.js ; self « « Reprendre » demande la suite au serveur (Range)… », « interrompu par la fermeture d’Orbe : repris… », « ouvrir un exécutable demande confirmation… » |  |

## À faire ensuite : les 30 premiers, par gain ressenti rapporté à l'effort

1. **ANI-1, ANI-2, ANI-3, BL-7** — raccourcir la bascule de la barre (180 ms → 50 ms ou moins) et l'apparition de la barre de commande. Arc est presque instantané ; c'est la différence de « nervosité » la plus facile à corriger (deux constantes).
2. **CMD-4, CMD-5, CMD-6** — barre de commande aux cotes d'Arc : 760 de large, à un tiers de la hauteur, lignes de 46.
3. **BL-10** — marge de la page à 10.
4. **SON-1, TAB-16, SON-4** — un son de capture original et le réglage pour le couper. C'est le seul son d'usage courant d'Arc.
5. **TAB-14, TAB-15** — ⇧⌘2 choisit une zone (le code existe déjà pour « vers un tableau »), puis propose copier, enregistrer, ajouter à un tableau.
6. **SON-6, SON-7** — retour haptique au déplacement et au dépôt d'un onglet (petit module natif `NSHapticFeedbackManager`), avec le réglage REG-40.
7. ✅ **ANI-22, BL-101** — les lignes s'écartent sous l'onglet qu'on déplace. *(fait : ui 17)*
8. **ANI-10, ESP-9, GES-1** — vrai glissement côte à côte entre deux Espaces, qui suit le doigt ; à régler caméra en main avec Arc à côté.
9. **ANI-11, APE-8** — l'aperçu s'ouvre en s'agrandissant et se referme en se réduisant.
10. ✅ **BL-53** — sélection multiple d'onglets (⇧clic, ⌘clic), puis fermer, déplacer, copier, mettre en dossier. *(fait : ui 16)*
11. ✅ **ONG-4, ONG-5, ESP-15, APE-7** — une vraie pile d'annulation pour la barre (déplacer, renommer, effacer, supprimer, aperçu fermé), avec le libellé dynamique du menu. *(fait : ui 18)*
12. **SCI-5, SCI-11** — petite barre en haut de chaque volet (adresse, fermer) et repère du volet actif.
13. **BL-97, BL-98, SCI-6** — déposer à gauche, à droite, en haut, en bas ; déposer un onglet sur un autre ; ⌥clic.
14. **BL-94, BL-102** — glisser un onglet vers un autre Espace ; réordonner les Espaces.
15. **THM-4, THM-7, THM-9, THM-3** — troisième couleur, intensité, trois textures de plus, nuancier à deux dimensions.
16. **BL-32, ANI-8** — indicateur de chargement en lueur en haut de la page.
17. **BL-16, THM-12, CMD-9** — barre estompée quand la fenêtre est inactive ; couleurs du thème dans la barre de commande et les messages.
18. **ANI-23, BL-73, ANI-14** — hauteur des dossiers animée ; effacement des onglets du jour en cascade.
19. **ANI-9, BL-57** — le téléchargement saute dans l'icône de la Bibliothèque ; détail du téléchargement en cours avec annulation.
20. **BIB-4, BIB-6, BIB-7** — fichiers récents au survol de l'icône, à glisser dehors ; médias en grille.
21. ✅ **REG-26, RAC-48** — raccourcis modifiables. *(fait : self « réglages », ui 19)*
22. ~~**EXT-11, EXT-21, DIV-19**~~ — fait (branche `essentiels`) : partage d'écran, erreurs de certificat et authentification HTTP, boîte `beforeunload`, avec les fenêtres surgissantes (DIV-20) et les points DIV-27 à DIV-32. Notes de sécurité : `docs/securite-navigation.md`.
23. **EXT-8, EXT-9** — vrai panneau de contrôle du site et bulle d'autorisation.
24. **BL-3, BL-4, BL-14, BL-20, BL-21, BL-22** — petits gestes de la barre : double-clic sur le bord, tirer pour masquer, double-clic dans le vide, historique sur appui long, ⌘clic.
25. ✅ **BL-125, BL-121, BL-122, BL-111, BL-130** *(fait : self lat, self fin, ui 23, ui 28)* — compléter les menus contextuels (remplacer l'adresse épinglée, archiver au-dessus, archiver les autres, copier en Markdown, menu du dossier).
26. **CMD-13, CMD-14, CMD-15, CMD-21, CMD-22** — barre de commande : actions seules avec ⇥, recherche dans un site, suppression d'une suggestion, Espaces et dossiers par leur nom.
27. **BIB-13, BIB-14, BIB-16, PET-7** — archive : cause de fermeture, filtres, retour dans l'Espace d'origine, confirmation.
28. **DIV-7** — copie de l'adresse sans paramètres de pistage.
29. ~~**IMP-10, MEN-6, BL-56**~~ — fait (branche `extensions-import`), dans sa version honnête : Orbe cherche une nouvelle version sur GitHub, l’annonce, télécharge et vérifie l’archive, mais ne se remplace pas lui-même (cela suppose la signature et la notarisation). Notes de sécurité : `docs/securite-navigation.md`.
30. **IMP-3, SON-3** — accueil avec courtes vidéos et musique. ~~IMP-6~~ : fait (branche `extensions-import`), lecture directe des signets de Chrome, Brave, Edge, Opera, Vivaldi, Firefox et Safari, et accueil en cinq étapes (IMP-1).

## Ce qui n'a pas pu être observé sur Arc, et pourquoi

- **Changement d'Espace, glisser-déposer, gestes du pavé tactile, retour haptique** : ils se jouent dans les Espaces réels du propriétaire ou demandent sa main. Rien n'a été déclenché. Les durées et courbes correspondantes sont donc « non mesurées ».
- **Aperçu (Peek)** : il fallait cliquer dans la page avec la souris alors que d'autres fenêtres (essais automatiques d'Orbe en cours sur la machine) prenaient le focus par moments. Non tenté.
- **Fenêtre de réglages** : non ouverte. Les libellés viennent du binaire, leur rangement de la documentation. Aucun libellé « barre latérale à droite » n’y figure : ce réglage n’existe pas dans Arc 1.166.
- **Moment où joue `event.m4a`** : inconnu. Le fichier n'a pas été écouté ni relié à un événement.
- **Rendu exact des textures et teintes des palettes** : les noms sont dans le binaire, les images n'ont pas été extraites.
- **Menus contextuels** : aucun n'a été ouvert sur Arc ; les articles viennent des libellés du binaire et du centre d'aide. L'ordre et les séparateurs sont inconnus.
- Les mesures ont été faites dans une fenêtre de navigation privée ouverte pour l'occasion, sur `example.com`, puis refermée. Les captures ont été supprimées.

## Bilan chiffré

656 lignes au total : 572 ✅, 20 🟡, 10 ⬜, 54 ➖.

| Domaine | ✅ | 🟡 | ⬜ | ➖ | Total |
| --- | --- | --- | --- | --- | --- |
| Barre latérale (BL) | 103 | 3 | 0 | 5 | 111 |
| Barre de commande (CMD) | 49 | 0 | 0 | 4 | 53 |
| Espaces et profils (ESP) | 24 | 0 | 0 | 0 | 24 |
| Vie des onglets (ONG) | 27 | 0 | 0 | 2 | 29 |
| Vue scindée (SCI) | 18 | 0 | 0 | 0 | 18 |
| Aperçu (APE) | 11 | 0 | 1 | 0 | 12 |
| Petite fenêtre (PET) | 12 | 4 | 0 | 0 | 16 |
| Thèmes (THM) | 15 | 2 | 1 | 2 | 20 |
| Animations (ANI) | 25 | 1 | 1 | 2 | 29 |
| Sons et haptique (SON) | 3 | 2 | 0 | 6 | 11 |
| Gestes (GES) | 7 | 0 | 1 | 1 | 9 |
| Bibliothèque et médias (BIB) | 24 | 3 | 1 | 3 | 31 |
| Boosts (BOO) | 12 | 0 | 0 | 1 | 13 |
| Tableaux et capture (TAB) | 15 | 0 | 3 | 1 | 19 |
| Notes (NOT) | 5 | 0 | 0 | 0 | 5 |
| Extensions et site (EXT) | 19 | 0 | 2 | 1 | 22 |
| Réglages (REG) | 31 | 1 | 0 | 12 | 44 |
| Menus (MEN) | 89 | 2 | 0 | 5 | 96 |
| Raccourcis (RAC) | 46 | 0 | 0 | 2 | 48 |
| Import et accueil (IMP) | 11 | 1 | 0 | 2 | 14 |
| Divers (DIV) | 26 | 1 | 0 | 5 | 32 |
| **Total** | **572** | **20** | **10** | **54** | **656** |

Lecture : un 🟡 recouvre deux cas, que les colonnes « Preuve Orbe » et « Note » distinguent : du code présent mais sans test (un test suffit à le passer en ✅), ou une fonction réellement incomplète. La part de chacun n'a pas été comptée.

