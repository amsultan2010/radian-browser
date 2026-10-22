# Améliorations : vitesse, fluidité, agrément

Liste de contrôle **mesurée** des pistes pour rendre Orbe plus rapide, plus fluide et
plus agréable. Chaque point donne le problème avec un chiffre relevé sur cette machine,
le changement proposé, le gain attendu, le risque, l'effort (S = quelques heures,
M = un à deux jours, L = plus) et un état.

États : ✅ fait et vérifié · 🟡 partiel ou non vérifié · ⬜ à faire · ➖ écarté (avec la raison).

Ce document est d'abord un travail de recherche ; les points cochés ont été réalisés depuis
(mesures avant / après : sections 8 bis et 9).

Un **deuxième tour** de recherche (11 oct., de la 0.12 à la 0.15.1) est en section 8 ter :
mesures version contre version, coût au repos, et les points ENER, DEM-10 à 12, PERF-30 et 31.
Un **troisième tour** (section 8 quater) explique le coût d'une animation (ENER-4, ENER-7) et
décompose le retard de la vue modale (DEM-12, DEM-13).

## 1. Comment les chiffres ont été pris

| | |
| --- | --- |
| Date | 8 octobre 2026 |
| Machine | MacBook Pro M2 Pro (12 cœurs), 16 Go, macOS 26.4, écran intégré 3456 × 2234 à **120 Hz** (relevé : `screen.getPrimaryDisplay().displayFrequency` = 120) |
| Moteur | Electron 44.7.0 (`~/.orbe-dev`), lancé depuis les sources |
| Code mesuré | branche `main`, commit `9988bbf`, **plus** les modifications en cours dans le dossier pendant la séance (marge de 10 pt, barre latérale à 50 ms, barre de commande ; enregistrées depuis, jusqu'au commit `95b3c75`) — voir la remarque ci-dessous |
| Fenêtre | 1360 × 860 points, barre latérale de 250 points |
| Profils | toujours temporaires (`ORBE_USER_DATA=<dossier temporaire>` + `--selftest`, trousseau factice) ; le vrai profil n'a jamais été ouvert |

**Méthode.** Orbe est lancé par `Electron -r hook.js <dépôt> --selftest` avec
`ORBE_SCENARIO=<scénario>`. `hook.js` (chargé avant `main.js`) chronomètre les `require`,
les appels coûteux et les événements des vues sans toucher au code ; les scénarios pilotent
la fenêtre (`OrbeWindow`, `store`) et lisent :

- les temps : `performance.now()`, `process.getCreationTime()`, `performance.timeOrigin` des pages ;
- la mémoire : `app.getAppMetrics()` pour la liste des processus, puis `/usr/bin/footprint <pid>`
  pour l'empreinte réelle (`phys_footprint`, la colonne « Mémoire » du Moniteur d'activité) ;
- les images réellement affichées : `contentTracing` (catégories `cc`, `benchmark`, `viz`,
  `devtools.timeline`), événements `PipelineReporter` (une image présentée ou perdue) et durées
  `Layout` / `Paint` / `PrePaint` par processus ;
- le travail de la barre latérale : domaine `Performance` du débogueur (`webContents.debugger`) ;
- les pages d'essai : petit serveur local (`127.0.0.1:47811`) — page légère, page « lourde »
  (3 000 cartes en grille), page à 12 cadres avec formulaire de connexion, page à 150 sous-ressources ;
  et 30 vrais sites pour la mémoire.

Pour essayer une variante (ordre d'affichage de la fenêtre, etc.), une **copie jetable** du
dépôt reçoit des interrupteurs par variable d'environnement ; le dépôt lui-même reste intact.
Les scripts sont dans le dossier temporaire de la séance (`perfbench/`), ils ne sont pas dans le dépôt.

**Limites à garder en tête.**

1. *Machine chargée.* D'autres travaux tournaient en même temps (charge moyenne de 6 à 12, avec
   une pointe à 90 vers 16 h 45). Les mesures sont des médianes sur plusieurs passes, et les
   variantes sont comparées en alternance (A, B, A, B…) pour annuler la dérive. Les séries prises
   pendant la pointe (disque, saisie, démarrage avec gros profil) ont été jetées et refaites
   au calme ; seules les valeurs refaites figurent ici.
2. *Démarrage « à froid ».* Un vrai démarrage à froid (après redémarrage du Mac) n'est pas
   reproductible sans droits d'administrateur. Deux situations sont donc données :
   « **à chaud** » (lancements enchaînés) et « **refroidi** » (30 s d'attente entre deux lancements,
   ce qui suffit déjà à doubler tous les temps).
3. *Lancé depuis les sources.* L'application fabriquée (`asar`, fusibles) peut différer de
   quelques dizaines de millisecondes au démarrage : **à mesurer** sur le paquet.
4. *Code en mouvement.* Pendant la séance, le dossier a reçu des réglages d'animation
   (barre latérale : disparition immédiate, retour en 50 ms au lieu de 180 ms). Les mesures
   d'animation sont données pour les **deux** états (commit `9988bbf` et dossier de travail).

## 2. Tableau de bord (état mesuré aujourd'hui)

| Domaine | Mesure | Valeur | Verdict |
| --- | --- | --- | --- |
| Démarrage à chaud | création du processus → fenêtre affichée | **366 ms** (348–439, n = 10) | bon |
| | → barre latérale peinte | 398 ms | bon |
| | → première page peinte (page locale) | 422 ms | bon |
| Démarrage refroidi (30 s) | → fenêtre affichée | **809 ms** (405–1216, n = 6) | à améliorer |
| | → première page peinte | 872 ms | à améliorer |
| Mémoire au repos | fenêtre + 1 onglet léger | **≈ 305 Mo** (286–322), 6 processus | correct |
| | dont processus graphique | 160–183 Mo | normal pour Chromium en Retina |
| | chaque vue d'appoint déjà ouverte | **+18 à 25 Mo** chacune (un processus chacune) | à améliorer |
| Mémoire, vrais sites | 10 sites / 30 sites vivants | **1,87 Go / 3,86 Go** | attendu ; politique de veille à affiner |
| Navigation | surcoût d'Orbe sur une page légère | +0,5 ms sur 6,7 ms | négligeable |
| | page à 12 cadres | **+19 ms sur 31 ms** (+60 %) | à améliorer |
| | page à 150 sous-ressources (bloqueur) | **+14 ms sur 45 ms** (+31 %) | à surveiller |
| Barre latérale | un envoi d'état → image suivante, 50 / 400 / 1 000 onglets | 8,3 / 8,4 / 8,3 ms (une image à 120 Hz) | excellent |
| | défilement, 400 onglets | 333 images présentées, 0 à 1 perdue, cadence 8,33 ms | excellent |
| | reconstruction complète (changer d'Espace), 400 / 1 000 onglets | 24 ms / 40 ms | correct |
| Barre latérale, bascule | commit `9988bbf` : 180 ms | 18–19 positions pour 22 images (≈ 100 pas/s irréguliers) | à améliorer |
| | dossier de travail : 50 ms | 5–6 positions pour 6 images | correct |
| Vue scindée, glisser | 2 pages lourdes | 24–34 images > 25 ms par seconde de glisser | à améliorer |
| Saisie | frappe → suggestions peintes (8 000 visites) | **20–22 ms**, dont 14–15 ms de calcul sur le fil principal | à améliorer |
| | ⌘T → champ peint | 3–6 ms (première fois 19–28 ms) | excellent |
| | changement d'onglet (clic → page visible) | 4,5–5,4 ms + 2–3,5 ms | excellent |
| Disque | `orbe.json` au plafond d'historique | **4,1 à 6,4 Mo** réécrits en entier, deux fois (copie de secours) | à améliorer |
| | blocage du fil principal par sauvegarde | **9–12 ms** (`JSON.stringify`), soit plus d'une image | à améliorer |
| | fréquence en naviguant | 1 écriture toutes les 2 s environ | à améliorer |

Lecture rapide : Orbe est **déjà rapide là où on l'attendait le moins** (rendu de la barre
latérale, changement d'onglet, ⌘T, coût par page). Les vrais gisements sont ailleurs :
l'écriture du fichier d'état, la recherche dans l'historique à chaque frappe, les processus
des vues d'appoint, l'instant où la fenêtre s'affiche, et les animations pilotées par un
minuteur du processus principal.

## 3. Démarrage (DEM)

### Décomposition mesurée

Lancements enchaînés (à chaud), profil d'un onglet, médiane de 10, en millisecondes depuis la
création du processus :

| Étape | À chaud | Refroidi (30 s) |
| --- | --- | --- |
| Entrée dans le code JavaScript (Electron et Chromium ont démarré) | 119 | 299 |
| `app` prête (`ready`) | 165 | 433 |
| Première vue créée (session, fenêtre native, vues) | 252 | 567 |
| Coque : `did-finish-load` | 330 | 770 |
| **Fenêtre affichée** (`win.show()`) | **366** | **809** |
| Barre latérale rendue et peinte | 398 | 845 |
| Première page : `first-contentful-paint` | 422 | 872 |

Ce que fait le processus principal avant la fenêtre (profil CPU par `inspector`, un lancement refroidi) :

| Poste | Temps |
| --- | --- |
| Tous les `require` de `main.js` (20 modules d'Orbe) | **≈ 15 ms** au total ; le plus lourd : `shared/locales.js` 6 ms, `sessions.js` 7,5 ms (avec ses dépendances) |
| `store.load` | 1 ms (profil neuf) ; **17 ms** avec un fichier de 4,9 Mo (400 onglets, 8 500 visites) |
| `sessions.setupDefaultSession` (premier `protocol.handle`, crée la session par défaut) | 7 ms à chaud, **33–42 ms** refroidi |
| `menu.build` | 3–4 ms |
| `new OrbeWindow` | **108 ms** refroidi, dont ≈ 92 ms dans la création native de la fenêtre et 30 ms pour les deux vues d'interface |
| `extensions.loadInto` (asynchrone, ne bloque pas) | 70–140 ms **sans aucune extension installée** |
| `adblock.load` (différé de 1,2 s) | 6 ms pour 24 017 domaines |

Conclusions : (1) le code d'Orbe pèse peu — environ 250 ms à chaud sont pris par Electron et
Chromium eux-mêmes avant et pendant la création de la fenêtre ; (2) entre « première vue créée »
et « fenêtre affichée », 114 ms à chaud et **242 ms refroidi** passent à attendre que la coque
ait fini de charger ; (3) un gros profil (400 onglets, 8 500 visites, 4,9 Mo) retarde la fenêtre de 28 ms (392 contre
364 ms, 6 lancements alternés) et la barre latérale peinte de 37 ms (429 contre 392), dont 17 ms
de `store.load`.

### Variantes essayées (copie jetable, 8 tours en alternance, à chaud)

| Variante | Fenêtre affichée | Barre latérale peinte | Première page peinte |
| --- | --- | --- | --- |
| Référence | 369 | 397 | 427 |
| Afficher la fenêtre tout de suite, sans attendre la coque | **309** (−60) | 389 | **365** (−62) |
| Servir `orbe://` par lecture directe + cache mémoire (sans `net.fetch`) | 368 | 395 | 418 |
| Créer la vue modale après la coque | 373 | 397 | 419 |
| Sans `vibrancy` | 369 | 395 | 416 |
| `v8CacheOptions: 'bypassHeatCheck'` sur les vues d'interface | 371 | 399 | 426 |
| Les trois premières ensemble | **301** (−68) | **373** (−24) | **357** (−70) |

Même comparaison, lancements espacés de 25 s (6 tours, plus bruité) :

| Variante | Fenêtre affichée | Barre latérale peinte | Première page peinte |
| --- | --- | --- | --- |
| Référence | 788 (388–1172) | 819 | 846 |
| Afficher tout de suite, seul | 684 (295–719) | 838 | 806 |
| Les trois ensemble | **604** (356–699) | **700** | **670** |

### Points

- ✅ **DEM-1 — Afficher la fenêtre sans attendre la fin du chargement de la coque.** *(fait le 8 oct.)*
  *Problème* : `OrbeWindow` n'appelle `win.show()` que dans `did-finish-load` de la coque
  (`window.js`, constructeur). La fenêtre est prête 114 ms plus tôt à chaud, 242 ms refroidi.
  Et comme une page cachée ne peint pas, la première page attend aussi.
  *Changement* : appeler `this.layout(); this.win.show();` à la fin du constructeur ; garder
  `sendState()` et `focusContent()` dans `did-finish-load`. La fenêtre a déjà son matériau
  `vibrancy: 'sidebar'` et la page blanche à sa place : on voit la fenêtre vide teintée pendant
  80 ms, puis la barre apparaît (la faire entrer en fondu de 80 ms, voir ANIM-6).
  *Gain mesuré* : fenêtre −60 ms à chaud, −104 ms refroidi ; première page peinte −62 ms à chaud.
  *Risque* : faible ; vérifier qu'aucun test ne compte sur une fenêtre cachée pendant le
  chargement, et que la couleur de fond de l'Espace est posée avant (sinon éclair de couleur).
  *Effort* : S.

- ✅ **DEM-2 — Servir les fichiers de l'interface sans `net.fetch`, depuis la mémoire.** *(fait le 9 oct. : pages, scripts et styles servis depuis la mémoire ; les cinq fichiers de la coque en 0,9 ms au lieu de 1,7–2,0 ; aucun effet mesurable sur le démarrage à chaud (coque chargée 300 → 298 ms))*
  *Problème* : `serveInternal` (`sessions.js`) répond par `net.fetch(file://…)` : une requête
  réseau interne par fichier, 5 fichiers pour la coque, 4 pour chaque vue d'appoint. À chaud
  cela ne coûte rien de mesurable (62 → 57 ms pour charger la coque) ; refroidi, la coque met
  187 ms à charger contre 88 ms pour une page web locale.
  *Changement* : lire le fichier une fois (`fs.readFileSync`), garder le tampon dans une `Map`,
  répondre `new Response(buf, { headers: { 'content-type': … } })`. Vider le cache en développement
  (variable d'environnement) pour garder le rechargement à la volée.
  *Gain mesuré* : nul seul à chaud ; **avec DEM-1 et DEM-3**, refroidi : barre latérale peinte
  −119 ms, première page −176 ms (la part exacte de DEM-2 n'a pas été isolée refroidi : **à mesurer**).
  *Risque* : faible (types MIME à déclarer à la main ; 6 extensions de fichier). *Effort* : S.

- ✅ **DEM-3 — Ne créer la vue modale qu'après l'affichage de la coque.** *(fait le 9 oct. avec MEM-1 : la vue modale naît de la coque après son chargement ; un processus de moins au démarrage (6 → 5), −89 Mo résidents, première barre de commande en 14 ms au lieu de 25 ; ⌘T avant la fin du chargement : le message attend)*
  *Problème* : `overlay.html#modal` est créée dans le constructeur, en même temps que la coque :
  un second processus de rendu démarre en concurrence au pire moment (18 Mo, voir MEM-1).
  *Changement* : la créer dans `did-finish-load` de la coque (`setTimeout(…, 0)`), ou mieux la
  faire naître de la coque (MEM-1), ce qui ne coûte que 15 ms.
  *Gain mesuré* : nul seul à chaud ; fait partie du lot « les trois ensemble ». *Risque* : ⌘T
  tapé dans les 100 premières millisecondes doit attendre la vue (file d'attente d'un message).
  *Effort* : S.

- ✅ **DEM-4 — Sortir l'historique du fichier lu au démarrage.** *(fait le 9 oct. : history.json lu au premier accès ; store.load avec 4 Mo d’historique : 12,4 ms → 0,11 ms avant la fenêtre)*
  *Problème* : avec 8 500 visites (plafond de `store.js`), `store.load` passe de 1 ms à
  **17 ms**, en bloquant, avant toute fenêtre. *Changement* : voir PERF-1 (historique dans un
  fichier à part, lu après l'affichage). *Gain* : ≈ −17 ms sur les profils anciens.
  *Risque / effort* : ceux de PERF-1.

- ➖ **DEM-5 — Ne rien faire pour les extensions quand il n'y en a pas.** *(écarté le 9 oct. : la synchronisation sans extension coûte 0,15 ms ; les 70–140 ms relevés étaient le temps de création de la fenêtre, pendant lequel la promesse attendait son tour)*
  *Problème* : `extensions.loadInto` prend 70–140 ms (asynchrone) sur un profil sans extension.
  Il ne bloque pas le fil principal, mais il occupe le disque et la session pendant le
  chargement de la première page. *Changement* : sortir tout de suite de `sync(ses)` si le
  dossier `Extensions` n'existe pas ou si l'état ne liste rien ; sinon lancer la synchronisation
  après `did-finish-load` de la coque. *Gain* : **à mesurer** sur la première page (l'effet n'a
  pas été isolé). *Risque* : une extension dont le script de contenu doit agir sur la toute
  première page restaurée la raterait si le chargement est différé : ne différer que le cas
  « aucune extension ». *Effort* : S.

- ➖ **DEM-6 — Cache de code V8 / instantané V8 pour le processus principal.** Écarté :
  les 20 modules d'Orbe se chargent en ≈ 15 ms au total ; `v8CacheOptions` sur les vues
  d'interface ne change rien (371 contre 369 ms). Un instantané (`electron-mksnapshot`)
  gagnerait au mieux une dizaine de millisecondes pour une chaîne de fabrication bien plus fragile.

- ➖ **DEM-7 — Retirer `vibrancy` pour démarrer plus vite.** Écarté : aucune différence
  mesurée (369 contre 369 ms) ; la création de la fenêtre native coûte le même prix sans.

- ✅ **DEM-8 — Mesurer le paquet distribué.** Les chiffres ci-dessus viennent des sources. *(mesuré le 9 oct. : paquet 246 ms contre 243 ms depuis les sources pour la fenêtre, 304 contre 300 ms pour la coque chargée ; l’archive et les fusibles ne coûtent rien de mesurable)*
  *À mesurer* : même scénario sur `Orbe.app` fabriquée, avec `--orbe-test` et un profil à part
  (prévu par `testModeAllowed()`), pour vérifier l'effet de l'archive `asar` et des fusibles.
  *Effort* : S.

## 4. Mémoire (MEM)

### Relevé par processus (empreinte réelle, Mo)

Au repos (fenêtre + 1 onglet local léger) :

| Processus | Empreinte |
| --- | --- |
| Principal (navigateur) | 55–58 |
| Graphique (GPU) | 160–183 (deux paliers, sans lien avec les variantes) |
| Réseau | 8–10 |
| Coque (barre latérale) | 24 |
| Vue modale préchargée (cachée) | 16–18 |
| Onglet léger | 17–19 |
| **Total** | **286–322** |

Vues d'appoint, créées à la demande et **jamais détruites ensuite** (un processus chacune) :

| Vue | Empreinte du processus | Délai de première ouverture | Ouvertures suivantes |
| --- | --- | --- | --- |
| Notification (toast) | 18–19 | 94–98 ms | 16–23 ms |
| Recherche dans la page | 18–20 | 82–94 ms | 13–20 ms |
| Adresse du lien survolé | 18–20 | ≈ 95 ms | — |
| Zone de dépôt (vue scindée) | 18–19 | ≈ 78 ms | — |
| Habillage de l'aperçu (Peek) | 17–18 | 89–90 ms | 21–24 ms |
| Barre latérale flottante | 24–25 | ≈ 80 ms | — |
| **Les six, plus la modale** | **≈ 130 Mo** dans 7 processus | | |

Après quelques minutes d'usage normal (un lien survolé suffit à créer la vue « statut »),
le total au repos passe donc de ≈ 305 à **≈ 480–490 Mo** (mesuré : 478 et 492), processus
graphique compris.

Onglets :

| Situation | Total | Processus | Par onglet |
| --- | --- | --- | --- |
| 10 onglets locaux (même site) | 864–866 Mo | 21 | 32–34 Mo ; un processus par onglet, même pour un même site |
| 30 onglets locaux | 1 516–1 533 Mo | 41 | idem |
| 1 vrai site (Wikipédia) | 658 Mo | 13 | |
| **10 vrais sites** | **1 874 Mo** | 25 | 30 à 243 Mo, moyenne ≈ 106 Mo |
| **30 vrais sites** | **3 863 Mo** | 47 | moyenne ≈ 96 Mo |
| 30 sites, puis veille à 8 vivants | 1 699 Mo | 25 | 4 processus de rendu sans vue restent (249 Mo) |

Le processus principal grossit avec le nombre d'onglets : 55 Mo au repos, 131–159 Mo à 30 onglets.

Chrome et Arc n'ont pas été mesurés : les lancer proprement demande un profil vierge et
plusieurs minutes de chargement identique ; **à mesurer** si la comparaison est voulue
(`--user-data-dir=<temporaire>` pour Chrome ; Arc n'a pas d'option de profil à part, donc non).

### Essai : faire naître les vues d'appoint de la coque

Dans un scénario, la coque ouvre elle-même ses vues (`window.open('orbe://app/overlay.html#toast')`)
et `setWindowOpenHandler` renvoie `{ action: 'allow', overrideBrowserWindowOptions: { webPreferences: { preload: UI_PRELOAD, sandbox: true, contextIsolation: true } }, createWindow: (options) => new WebContentsView(options).webContents }`.
Résultat mesuré pour six vues (modale, toast, recherche, statut, dépôt, aperçu) :

| | Aujourd'hui (un processus par vue) | Vues nées de la coque |
| --- | --- | --- |
| Processus supplémentaires | 6 | **0** (même identifiant de processus que la coque) |
| Mémoire supplémentaire | ≈ 110 Mo | **+11 Mo** (coque : 25 → 36 Mo) |
| Délai de première ouverture | 75–178 ms | **7–15 ms** |
| Pont `window.orbe` et messages `overlay` | oui | oui (vérifié : la notification s'affiche) |

### Points

- ✅ **MEM-1 — Un seul processus de rendu pour toute l'interface d'Orbe.** *(fait le 9 oct. : vues d’appoint nées de la coque ; quatre vues ouvertes : 10 → 5 processus, 979 → 536 Mo résidents ; première ouverture 125–156 ms → 4–19 ms)*
  *Problème* : chaque vue d'appoint (`makeUiView`) démarre son propre processus : +18 à 25 Mo
  chacune, ≈ 130 Mo pour les sept, et 80–100 ms d'attente à la première ouverture.
  *Changement* : dans `makeUiView(page)`, pour tout sauf la coque, demander à la coque
  d'ouvrir la page (`ui.webContents.executeJavaScript('void window.open(…)')` ou un message
  `open-view`) et récupérer la vue dans `createWindow` du `setWindowOpenHandler` de la coque
  (aujourd'hui `deny`). Garder `trusted.add`, `wcOwner.set`, `will-navigate` et l'interdiction
  d'ouvrir d'autres fenêtres sur la vue fille. Création devenue asynchrone : renvoyer une
  promesse, ou créer les vues au repos après le démarrage puisqu'elles ne coûtent plus que 2 Mo.
  *Gain mesuré* : **≈ −100 Mo** après quelques minutes d'usage, première ouverture 6 à 20 fois
  plus rapide, démarrage allégé d'un processus (la modale).
  *Risque* : moyen. Toutes les vues partagent alors un seul fil : une barre latérale occupée
  retarderait la barre de commande (mesuré : le rendu de la barre coûte 0,04 à 0,4 ms, donc
  sans effet) ; un plantage de ce processus emporte toute l'interface (prévoir de la recréer
  sur `render-process-gone`) ; `window.opener` devient visible entre vues de confiance (même
  origine `orbe://app`, pas de fuite). La barre latérale flottante peut rester à part ou suivre.
  *Effort* : M.

- ➖ **MEM-2 — À défaut de MEM-1 : détruire les vues d'appoint inactives.** *(sans objet depuis MEM-1 : les vues d’appoint ne coûtent plus un processus)*
  *Problème* : toast, recherche, statut, dépôt, habillage d'aperçu et barre flottante vivent
  jusqu'à la fermeture de la fenêtre. *Changement* : fermer chaque vue 60 s après son dernier
  usage (`webContents.close()`), sauf la modale. *Gain* : jusqu'à ≈ 110 Mo rendus ; *coût* :
  80–100 ms à la réouverture suivante (mesuré), sensible pour l'adresse du lien survolé.
  *Risque* : faible. *Effort* : S. Sans objet si MEM-1 est fait.

- ✅ **MEM-3 — Mettre en veille selon la mémoire et l'ancienneté, pas seulement le nombre.** *(fait le 9 oct. : veille après 3 h sans affichage et au-delà de 25 % de la mémoire ; 12 onglets lourds, 2 196 Mo pour un budget de 1 638 : 6 endormis, 13 → 7 processus ; les pages où l’on a écrit sont épargnées)*
  *Problème* : `trimLive()` ne compte que les onglets (`maxLiveTabs` = 30 par défaut). Trente
  vrais sites = 3,86 Go ; un seul onglet va de 30 à 243 Mo. Sur un Mac de 8 Go, 30 est trop.
  *Changement* : (a) à l'activation et toutes les 60 s, lire `app.getAppMetrics()` et mettre
  en veille les onglets les plus anciens tant que la somme des processus d'onglets dépasse un
  budget (par exemple 25 % de `os.totalmem()`), en plus de la limite en nombre ; (b) mettre en
  veille un onglet non vu depuis N heures même sous la limite ; (c) ne jamais toucher un onglet
  audible, épinglé affiché, ou avec les outils de développement (déjà le cas).
  *Gain mesuré* : passer de 31 à 8 vivants rend **2,16 Go** (3 863 → 1 699 Mo).
  *Risque* : un onglet réveillé recharge sa page (167 ms pour une page locale lourde, plus le
  réseau) et perd un formulaire en cours : ne pas mettre en veille un onglet dont un champ a
  été modifié (drapeau posé par le script de page) — **à concevoir**. *Effort* : M.

- ✅ **MEM-4 — Vérifier les processus qui survivent à la mise en veille.** *(vérifié le 9 oct. sur 20 sites : 5 processus sans vue (860 Mo) juste après la veille, 1 à +33 s, 0 à +73 s ; ce sont des service workers, que Chromium arrête seul ; rien à changer)*
  *Problème* : après `trimLive` (23 vues détruites), **4 processus de rendu sans vue** restent,
  pour 249 Mo ; il y en avait déjà 3 (219 Mo) avec 30 sites ouverts. Probablement des cadres
  d'autres sites ou des service workers encore actifs. *À mesurer* : relever leur adresse
  (`webFrameMain`, `ses.serviceWorkers.getAllRunning()`), attendre 60 s pour voir s'ils partent
  seuls. *Changement possible* : arrêter les service workers d'un site quand son dernier onglet
  est mis en veille. *Effort* : S pour le diagnostic.

- ✅ **MEM-5 — Capture pour ⌃Tab : ne garder qu'un nombre borné de vignettes.** *(fait le 9 oct. : huit vignettes au plus (184 Ko au lieu de 690 Ko pour 30 onglets))*
  *Mesure* : une vignette pèse 23 Ko en base64 (JPEG 320 px) : négligeable par onglet, et
  `resize` + `toJPEG` bloquent le fil principal 3,1 ms par changement d'onglet. Rien d'urgent ;
  borner à 8 (la bascule n'en montre pas plus) évite tout de même de garder des chaînes pour
  30 onglets. *Effort* : S. *Gain* : faible.

- ➖ **MEM-6 — Processus par site : mesuré, écarté.** *(écarté le 9 oct. après mesure, écran déverrouillé : −211 Mo d'empreinte pour dix onglets d'un même site, mais l'onglet affiché se fige 143 ms chaque fois qu'un voisin calcule ; détail en section 8 bis)*
  *Constat* : dix onglets du même site occupent dix processus (10 × 32–34 Mo). Chrome fait de
  même sauf sous pression mémoire. `app.commandLine.appendSwitch('renderer-process-limit', N)`
  force le partage au-delà de N processus. *À mesurer* : mémoire et fluidité avec une limite de
  12 puis 20 sur les 30 sites réels ; risque connu : un onglet lourd ralentit ses voisins.
  Ne pas livrer sans mesure. *Effort* : S pour l'essai.
  *Mesuré le 9 oct.* (dix onglets d'un même site local, 800 cartes et 200 000 objets chacun) :
  sans limite, 10 processus et 804–893 Mo résidents ; avec `--renderer-process-limit=4`,
  3 processus et 383–464 Mo. Le gain ne vaut que pour des onglets d'un même site (deux sites
  différents ne partagent jamais un processus). La fluidité entre voisins n'a pas pu être
  mesurée (écran verrouillé pendant la séance) : **à refaire avant de livrer**.
  *Mesuré de nouveau le 9 oct., écran déverrouillé* (`node scripts/mesures.js voisins --arbre .
  --avec "--renderer-process-limit=4"`, 4 tours alternés, charge 5 à 14) : dix onglets d'un même
  site dont trois calculent 150 ms par seconde en arrière-plan. Sans limite : 10 processus,
  853 Mo résidents, **522 Mo d'empreinte**, aucun trou de plus de 50 ms dans l'onglet affiché
  (pire : 10 ms), message aller-retour au 95e centile en 1,1 ms. Avec la limite : 3 processus,
  439 Mo résidents, **311 Mo d'empreinte**, mais l'onglet affiché partage son processus avec
  quatre voisins : **dix trous de plus de 50 ms en dix secondes, le pire de 143 ms**, message
  au 95e centile en 85 ms (pire : 151 à 291 ms). *Décision* : non livré. Le gain (211 Mo pour
  dix onglets lourds d'un même site) est déjà obtenu sans rien coûter par la veille (MEM-3,
  MEM-9), alors que la limite rend l'onglet qu'on regarde tributaire de ceux qu'on ne regarde
  pas. *Sécurité* : la limite ne fait partager un processus qu'entre pages d'un **même site**
  (vérifié dans la même mesure : deux onglets d'un autre site, aucun processus commun) ;
  l'isolation entre sites, qui protège des attaques de type Spectre, n'aurait pas été entamée.
  Un partage entre sites différents, lui, ne serait pas acceptable et n'a pas été essayé.

- ➖ **MEM-7 — `backgroundThrottling: false`.** Écarté : le réglage par défaut (ralentissement
  des vues cachées) est le bon pour un navigateur ; le couper augmenterait la consommation des
  onglets non affichés sans rien rendre plus fluide.

## 5. Coût par navigation (PERF, première partie)

Mesure : une vue neuve par configuration (même session que les onglets), 14 tours en
alternance ; temps de `loadURL` jusqu'à `did-finish-load`, médiane (et 90ᵉ centile), en ms.

| Configuration | Page légère | Page mixte (400 cartes, 4 cadres, 60 images) | 12 cadres avec formulaire | 150 sous-ressources |
| --- | --- | --- | --- | --- |
| A. Tel que livré | 7,26 (7,93) | 36,6 (40,0) | 49,3 (53,4) | 59,2 (69,8) |
| B. Sans `page.js` (mots de passe) | 7,40 | 34,5 | 46,1 | 57,7 |
| C. Sans `ext.js` (extensions) | 6,89 | 35,2 | 47,2 | 56,7 |
| D. Sans aucun script de préchargement | 6,72 | 34,2 | 45,8 | 55,1 |
| E. Sans `nodeIntegrationInSubFrames` | 7,06 | 31,5 | 41,5 | 56,2 |
| F. Bloqueur coupé | 6,50 | 33,3 | 39,2 | **45,0** |
| G. Rien du tout (D + E + F) | 6,24 | 27,5 | **30,7** | 44,3 |

Création d'un processus de rendu et première page : 70–75 ms dans tous les cas (aucun effet des réglages).
`first-contentful-paint` : identique à 4 ms près dans toutes les configurations.
Décision du bloqueur elle-même (`adblock.decide`) : **0,25 µs** par requête (100 000 appels).

Lecture :

- sur une page sans cadre, les deux scripts de préchargement coûtent **0,5 ms** : rien à faire ;
- sur une page à 12 cadres, Orbe ajoute 19 ms (+60 %) : ≈ 8 ms pour exécuter les scripts dans
  les sous-cadres, ≈ 10 ms pour le passage de chaque requête par le bloqueur, ≈ 3,5 ms pour
  les scripts eux-mêmes ;
- le bloqueur coûte ≈ **0,09 ms par requête** (14 ms pour 150), et ce n'est pas la recherche
  dans la liste : c'est l'aller-retour entre le service réseau et le JavaScript du processus
  principal imposé par `webRequest.onBeforeRequest`.

### Points

- ✅ **PERF-10 — `ext.js` : ne plus l'exécuter dans les pages web.** *(fait le 9 oct. : script enregistré seulement sur une session qui porte une extension ; page à 12 cadres 39,1 → 37,6 ms sans extension ; inchangé avec)*
  *Problème* : `ext-api.js` enregistre `ext.js` (555 lignes) comme script de préchargement de
  type `frame` sur toute la session ; il se charge donc dans **chaque cadre de chaque page**
  pour constater, à sa dernière ligne, qu'il n'est pas dans une page d'extension. Coût mesuré :
  ≈ 2 ms sur la page à 12 cadres, 0,4 ms sur une page simple.
  *Changement* : faire le test en tête de fichier (`if (!inWorker && location.protocol !== 'chrome-extension:') return;`
  avant toute déclaration, dans une fonction englobante) pour que V8 n'ait rien à préparer ;
  ou, mieux, ne plus l'enregistrer sur la session mais le donner en `preload` aux seules vues
  d'extension (fenêtre surgissante, options, panneau) et garder l'enregistrement
  `service-worker`. *Gain* : 2 à 4 % sur les pages à cadres. *Risque* : faible si les pages
  d'extension ouvertes dans un onglet gardent le script (à tester avec `tests/ext-api.js`).
  *Effort* : S.

- ➖ **PERF-11 — `page.js` : rester inerte tant qu'aucun champ de mot de passe n'existe.** *(écarté le 9 oct. : sur 12 cadres, page.js coûte 2,2 ms dont environ 1 ms pour livrer le fichier et au plus 1 ms pour ses écouteurs, soit moins de 0,1 ms par cadre, dans le bruit de la mesure ; risque moyen sur les mots de passe pour un gain non mesurable)*
  *Problème* : dans chaque cadre, le script pose 12 écouteurs globaux (dont `scroll` en capture,
  `mousedown`, `keydown`, `input`, `click`) ; coût mesuré ≈ 3 ms sur 12 cadres. Chaque défilement
  de chaque page appelle `hide`.
  *Changement* : au chargement, ne poser que `focusin` (capture) et `submit` ; installer le reste
  à la première prise de focus dans un `input`. Ne rien poser du tout dans un cadre de moins de
  quelques pixels ou d'origine opaque (`about:blank`, publicités). *Gain* : ≈ −3 ms sur les
  pages à cadres, et plus aucun écouteur de défilement sur les pages sans formulaire.
  *Risque* : moyen (les mots de passe ont une batterie de tests : `tests/passwords.js`,
  `passwords-sites.js`). *Effort* : M.

- ✅ **PERF-12 — `nodeIntegrationInSubFrames` : confirmer qu'il reste nécessaire.** *(confirmé le 9 oct. : nécessaire (connexion dans un cadre, pages d’extension en cadre) ; il coûte 8 ms sur 12 cadres, dont nos scripts ne font que 3)*
  *Mesure* : le retirer gagne 8 ms sur la page à 12 cadres (49,3 → 41,5), 5 ms sur la page
  mixte. Il sert à remplir les formulaires de connexion placés dans un cadre.
  *Changement possible* : le garder (la fonction prime), mais combiner avec PERF-10 et PERF-11
  pour que ce qui s'exécute dans chaque sous-cadre soit minimal ; re-mesurer ensuite.
  *Effort* : S (mesure).

- ➖ **PERF-13 — Bloqueur : réduire le nombre de requêtes qui montent jusqu'au JavaScript.** *(écarté le 9 oct. : Electron 44.7 charge une extension à règles declarativeNetRequest mais ne les applique pas (essai : les deux requêtes à bloquer sont arrivées au serveur))*
  *Problème* : chaque requête http(s)/ws de chaque page fait un aller-retour par le fil
  principal : 0,09 ms pièce, et surtout autant de travail sur le fil qui anime les vues
  (une page d'actualité fait 200 à 400 requêtes).
  *Changements possibles, du plus simple au plus lourd* :
  (a) restreindre le filtre `FILTER.urls` n'apporte rien (il faut tout voir) — écarté ;
  (b) répondre plus vite ne change rien non plus (0,25 µs) ;
  (c) **à mesurer** : charger la liste comme règles `declarativeNetRequest` d'une extension
  interne, si Electron 44 les applique (Chromium filtre alors dans le service réseau, sans
  JavaScript). Vérifier d'abord la prise en charge réelle : l'étude `docs/etude-extensions-et-distribution.md`
  est le bon endroit pour la consigner.
  *Gain attendu* : jusqu'à −14 ms par tranche de 150 requêtes et un fil principal plus calme
  pendant les chargements. *Risque* : élevé si (c) (le compteur par onglet et la liste
  d'exceptions reposent sur l'écouteur actuel). *Effort* : L. À ne lancer qu'après les points S et M.

## 6. Écriture sur disque (PERF, deuxième partie)

Mesure dans le processus principal, sur des états fabriqués (titres et adresses réalistes,
une part d'icônes `data:` de moins de 2 Ko, que `lightIcon` autorise) :

| État | Taille du fichier | `JSON.stringify` (bloque le fil principal) | `write()` complet | `flush()` à la fermeture | Lecture + analyse au démarrage |
| --- | --- | --- | --- | --- | --- |
| Profil neuf | 4 Ko | 0,02 ms | 0,8 ms | 0,2 ms | 0,04 ms |
| 1 000 visites | 487 Ko | 0,8 ms | 2,6 ms | 2,0 ms | 1,3 ms |
| 4 000 visites | 1,9 Mo | 3,4 ms | 9,7 ms | 7,0 ms | 4,9 ms |
| 8 500 visites (plafond), 10 % d'icônes `data:` | **4,1 Mo** | **9,3 ms** (90ᵉ centile 10,5) | 24,5 ms | 19,9 ms | 12,6 ms |
| 8 500 visites, 30 % d'icônes `data:` | **6,4 Mo** | **12,1 ms** (90ᵉ centile 12,9) | 29,9 ms | 24,3 ms | 16,9 ms |

| Découpage | Taille | `JSON.stringify` |
| --- | --- | --- |
| Tout sauf l'historique | 381 Ko | 0,2–0,8 ms |
| Onglets, Espaces, réglages seuls (sans historique, archive ni téléchargements) | 4 Ko (profil d'essai) | 0,01 ms |
| Une ligne ajoutée à un journal (`appendFile`, ≈ 220 octets) | — | 0,03 ms synchrone, 0,1 ms asynchrone |

Fréquence : 12 navigations en 11,5 s déclenchent 48 appels à `store.save()` et **6 écritures
complètes**, soit une toutes les 2 s. Sur un profil ancien, naviguer coûte donc environ
**9 à 12 ms de blocage du fil principal toutes les 2 secondes** (une à deux images perdues à
120 Hz pour tout ce que ce fil anime : bascule de la barre, glisser de la séparation ; trois
fois plus sur une machine chargée, mesuré : 31 ms) et 130 à 200 Mo écrits par minute de
navigation active — le double en comptant la copie `.bak` refaite à chaque écriture.

### Points

- ✅ **PERF-1 — Historique dans son propre fichier, en journal d'ajouts.** *(fait le 8 oct. : history.json à part, écrit au plus toutes les 20 s)*
  *Problème* : voir ci-dessus ; l'historique fait 90 % du fichier et change à chaque page.
  *Changement* (`store.js`) :
  1. `orbe.json` ne contient plus `history` (ni, dans un second temps, `archive`).
  2. `history.log` : une ligne JSON par événement (`{"u":url,"t":titre,"f":icône,"a":date}`),
     ajoutée par `fs.appendFile` ; `visit()` et `touchHistory()` écrivent une ligne au lieu
     d'appeler `save()`.
  3. Au démarrage, **après** l'affichage de la fenêtre : lire le journal, reconstruire la table
     en mémoire (dernier gagne, compteur de visites cumulé), puis, s'il dépasse 2 fois la taille
     utile, le réécrire compacté (`history.log.tmp` puis `rename`).
  4. Migration : au premier lancement, si `orbe.json` contient `history`, l'écrire en journal
     et le retirer ; garder `orbe.json.bak` tel quel.
  5. `lib:clear` et « effacer les données » tronquent le journal.
  *Gain mesuré* : blocage par sauvegarde **9–12 ms → 0,2–0,8 ms**, écriture 4,1–6,4 Mo → 0,4 Mo,
  démarrage −17 ms (DEM-4), une visite = 0,03 à 0,1 ms.
  *Risque* : moyen — format de données, donc migration et retour arrière à tester ; une ligne
  tronquée par une coupure de courant doit être ignorée à la lecture (`try { JSON.parse }` par
  ligne). Pas de base SQLite, pas de dépendance. *Effort* : M.

- ✅ **PERF-2 — Ne pas sauvegarder l'état pour un simple changement de titre ou d'icône.** *(fait le 8 oct.)*
  *Problème* : `wire()` appelle `touch()` (donc `store.save()`) sur `page-title-updated`,
  `page-favicon-updated` et chaque `did-navigate-in-page` : 4 appels par page en moyenne (48
  pour 12 pages). Le regroupement à 1,5 s les réduit à une écriture toutes les 2 s, mais c'est
  encore un fichier entier. *Changement* : allonger le délai à 5 s pour ces causes « cosmétiques »
  (`save({ lazy: true })`), garder 1,5 s pour les changements de structure (onglet créé, fermé,
  déplacé), et `flush()` à la fermeture comme aujourd'hui. *Gain* : écritures divisées par 2 à 3
  en navigation. *Risque* : après un plantage, un titre d'onglet peut dater de 5 s. *Effort* : S.
  Complète PERF-1, ne le remplace pas.

- ✅ **PERF-3 — `write()` : ne pas recopier le fichier à chaque fois.** *(fait le 8 oct.)*
  *Problème* : chaque écriture fait `writeFile(tmp)` + `copyFile(orbe.json → .bak)` + `rename` :
  le fichier est écrit **deux fois** (24,5 ms au total pour 4,1 Mo, dont 9,3 de `stringify`).
  *Changement* : remplacer la copie par `rename(orbe.json → .bak)` puis `rename(tmp → orbe.json)`,
  ou ne rafraîchir `.bak` qu'une fois par session. *Gain* : moitié des octets écrits.
  *Risque* : faible (entre les deux `rename`, seul `.bak` existe : `load()` le lit déjà en secours).
  *Effort* : S.

## 7. Saisie et réactivité (PERF, troisième partie)

| Geste | Mesure | Valeur |
| --- | --- | --- |
| ⌘T | `openCommand()` → champ visible et peint | 3,1–6,4 ms (90ᵉ centile 8,6–12 ; première fois 19–28 ms) |
| Frappe dans la barre de commande | événement clavier → `input` dans la vue | 1,3 ms |
| | → liste de suggestions peinte | **19,6–21,8 ms** (90ᵉ centile 26–27 ; max 31) |
| | dont `suggestLocal` sur le fil principal (8 000 visites, 2 000 archives) | **14,1–15,4 ms** (90ᵉ centile 19–20 ; max 21–24) |
| | suggestions du moteur de recherche (Google, réseau) | 174 ms (90ᵉ centile 264) |
| `suggest.local` selon l'historique | 500 / 2 000 / 8 000 visites | 0,6 / 2,9 / 10,2 ms |
| Changement d'onglet | `activate()` (synchrone) | 4,5–5,4 ms (max 11) |
| | → première image de la page affichée | +2,2 à 3,5 ms (90ᵉ centile 5–11) |
| | capture pour la vignette : `capturePage` | 4,9–6,2 ms (asynchrone) |
| | réduction + JPEG sur le fil principal | 2,9–3,1 ms |
| Changement d'Espace | `switchSpace()` puis image de la page | 3–4 ms + 2 ms |
| Réveil d'un onglet en veille | clic → première peinture (page locale lourde) | 167–183 ms |

Deux séries (les fourchettes donnent les deux médianes) ; elles concordent.

### Points

- ✅ **PERF-4 — Barre de commande : index de recherche normalisé, calculé une fois.** *(fait le 8 oct.)*
  *Problème* : à chaque frappe, `suggest.local` parcourt tout l'historique et recalcule pour
  chaque entrée `norm(strip(url))` et `norm(title)` (minuscules + décomposition Unicode +
  expression régulière) : 14–15 ms de blocage du fil principal par caractère tapé avec 8 000
  visites, soit presque deux images à 120 Hz.
  *Changement* : garder à côté de chaque entrée ses deux chaînes normalisées, calculées à la
  première recherche et invalidées quand le titre change (une `WeakMap` suffit) ; même chose
  pour l'archive et les onglets.
  *Gain mesuré* (micro-essai Node sur la seule boucle d'historique, 8 003 entrées, mêmes
  résultats vérifiés) : **7,0–7,5 ms → 1,2–1,4 ms** par frappe, soit 5 à 6 fois moins ; dans
  l'application, où s'ajoutent l'archive et les onglets, attendre 15 → environ 3 ms.
  *Risque* : faible. *Effort* : S.

- ✅ **PERF-5 — Barre de commande : recherche incrémentale.** *(fait le 9 oct. : calcul par frappe 4,9 → 0,45 ms (médiane, 8 000 visites) ; frappe → liste à jour 5,8 → 1,9 ms ; la première lettre reste à 6 ms)*
  *Problème* : taper « navig » relance cinq recherches complètes. *Changement* : si la nouvelle
  saisie prolonge la précédente, ne filtrer que les résultats de la précédente (garder la liste
  des entrées retenues, pas seulement les 8 premières). *Gain attendu* : chaque frappe après la
  première passe sous 1 ms ; **à mesurer** après PERF-4. *Risque* : faible. *Effort* : S.

- ➖ **PERF-6 — Ne pas attendre le processus principal pour afficher la frappe complétée.** *(écarté le 9 oct. : après PERF-5 la liste est à jour 1,9 ms après la frappe, bien sous une image)*
  *Constat* : l'aller-retour `invoke('suggest')` coûte 5 ms hors calcul. Une fois PERF-4 et
  PERF-5 faits, la frappe → peinture devrait tomber vers 8 ms (une image). Si ce n'est pas le
  cas, envoyer à la vue modale, à l'ouverture, les 300 entrées les plus fréquentes pour une
  première réponse locale immédiate. **À décider après mesure.** *Effort* : M.

- ➖ **PERF-7 — Accélérer le changement d'onglet.** Écarté : 5,4 ms + 3,5 ms, c'est une image.
  Rien à gagner tant que l'onglet est vivant ; le sujet est la veille (MEM-3).

- ✅ **PERF-8 — Pré-réveiller l'onglet survolé.** *(fait le 9 oct., en pré-connexion seulement : première réponse en 148–175 ms au lieu de 452–467 (dix sites) ; la page n’est pas chargée d’avance)*
  *Problème* : un onglet en veille met 167 ms (local) à plusieurs secondes (réseau) à revenir.
  *Changement* : quand le pointeur reste 150 ms sur une ligne d'onglet en veille, créer sa vue
  en arrière-plan (`ensureView`) sans l'afficher. *Gain attendu* : le clic qui suit trouve la
  page déjà en cours de chargement (−150 à −300 ms ressentis) ; **à mesurer**. *Risque* : charge
  réseau inutile si l'utilisateur ne clique pas ; borner à un pré-réveil à la fois et annuler
  après 10 s. *Effort* : S.

## 8. Rendu de la barre latérale (PERF, quatrième partie)

| Mesure | 50 onglets | 400 onglets | 1 000 onglets |
| --- | --- | --- | --- |
| Nœuds DOM de la coque | 2 057 | 14 307 | 35 307 |
| `sendState()` côté principal | 0,15 ms | 0,49 ms | 1,04 ms |
| Taille de l'état envoyé | 18 Ko | 144 Ko | 359 Ko |
| `render()` sans changement (JavaScript seul) | 0,04 ms | 0,16 ms | 0,38 ms |
| Un titre change : script / style / mise en page | 0,06 / 0,15 / 0,27 ms | 0,03 / 0,08 / 0,24 ms | 0,03 / 0,11 / 0,51 ms |
| Un titre change : tâche complète (désérialisation comprise) | 1,9 ms | 2,3 ms | 5,1 ms |
| Envoi → image suivante | 8,3 ms | 8,4 ms | 8,3 ms |
| Changer d'Espace (toutes les lignes recréées) → image | 12 ms | 24 ms | 40 ms |
| Défilement 1,6 s : images présentées / perdues | 69 / 0 | 333 / 1 | 330 / 0 |
| Défilement : cadence médiane (90ᵉ centile) | 8,33 (16,7) ms | 8,33 (8,33) ms | 8,33 (8,33) ms |
| Défilement : test d'atteinte (`HitTest`) par appel | 0,03 ms | 0,17 ms | 0,38 ms |
| Défilement : observateur d'intersection (images paresseuses) | 5,8 ms | 51,6 ms | 124,6 ms |

Effet des habillages pendant le défilement (400 onglets) : translucide coupé, grain à 0,3,
dégradé + grain — **aucune différence mesurable** (333 à 339 images présentées, 0 ou 1 perdue,
même cadence). `color-mix`, le grain SVG et le fond translucide ne coûtent rien de visible.

Conclusion : la barre latérale tient 120 images par seconde jusqu'à 1 000 onglets. La
réconciliation par clé de `shell.js` et `content-visibility: auto` font leur travail. Il n'y a
**pas lieu de virtualiser la liste**.

### Points

- ➖ **PERF-20 — Virtualiser la liste d'onglets.** Écarté : 0 à 1 image perdue sur 330 à
  1 000 onglets, rendu à 0,38 ms.

- ➖ **PERF-21 — Retirer `color-mix`, le grain ou la translucidité pour la vitesse.** Écarté :
  aucun effet mesuré.

- ➖ **PERF-22 — État envoyé : ne transmettre que ce qui a changé au-delà de 300 onglets.** *(écarté le 9 oct. après essai complet : l’envoi par morceaux réduit l’état de 279 Ko à 1,2 Ko à 1 000 onglets, mais l’aller-retour ne bouge pas (8,2 → 9,7 ms) ; le temps est dans le rendu de la coque, voir PERF-26)*
  *Problème* : 144 Ko (400 onglets) à 359 Ko (1 000) sérialisés, envoyés et désérialisés à
  chaque changement, même pour un compteur de publicités bloquées ; la tâche complète monte à
  5 ms à 1 000 onglets. *Changement* : ne pas envoyer deux fois de suite un état identique
  (comparer la chaîne JSON ou un condensé) ; séparer l'état « navigation » (adresse, chargement,
  compteur du bouclier), qui change souvent, de l'état « listes ». *Gain* : 2 à 5 ms par envoi
  sur les très gros profils ; nul en dessous de 100 onglets. *Risque* : faible. *Effort* : M.
  Priorité basse.

- ➖ **PERF-23 — Limiter les envois d'état pendant le chargement d'une page.** Écarté après
  mesure sur cinq vrais sites (compteur posé sur `sendState`, du début du chargement à 3 s après
  la fin) : Le Monde 5 envois, YouTube 6, Wikipédia 4, GitHub 7, BBC News 17 ; au plus **6 par
  seconde**, 1 à 3 en moyenne. Le regroupement par `setImmediate` et les 250 ms du compteur du
  bloqueur suffisent.

- ✅ **PERF-24 — Icônes : ne pas demander `/favicon.ico` aux sites jamais chargés.** *(fait le 9 oct. : un échec est retenu par site ; 40 onglets sans icône, six changements d’Espace : 369 requêtes → 49)*
  *Constat* : `guessIcon` fait demander par la coque `origine/favicon.ico` pour chaque onglet
  sans icône connue ; avec 400 onglets restaurés, c'est autant de requêtes réseau (et d'erreurs)
  au fil du défilement, et c'est l'observateur d'intersection de ces images qui pèse le plus
  pendant le défilement (52 ms sur 1,6 s à 400 onglets). *Changement* : mémoriser l'icône par
  hôte dans l'état (table `hôte → adresse d'icône`, alimentée par `page-favicon-updated`) et
  n'essayer `/favicon.ico` qu'une fois par hôte et par session. *Gain* : moins de requêtes, un
  défilement encore plus léger ; **à mesurer** en nombre de requêtes. *Effort* : S.

- ✅ **PERF-25 — Glisser un onglet : relever la géométrie une fois, écarter par transformation.**
  *Constat* : à chaque mouvement du glisser, `dropTarget` relisait le rectangle de chaque ligne
  jusqu'à la cible, cherchait `.drop-into` dans tout le document, puis déplaçait le trait de dépôt
  par `left`/`top` : une mise en page relancée à chaque changement de cible. *Changement* (avec
  ANI-22 : les lignes s'écartent sous l'onglet déplacé) : les positions des lignes sont relevées
  une seule fois par glisser (`measure`), le pointeur est ensuite comparé à ce relevé ; les lignes
  et la place libre ne bougent que par `transform`, et seules celles dont le décalage change sont
  touchées. Une transformation neutre est posée dès le départ (`body.parting`), car passer de
  « aucune » à un décalage relançait la mise en page à chaque ligne. *Mesure* (Playwright, vrai
  glisser de trois allers-retours sur la hauteur de la barre, 404 lignes dans Aujourd'hui ;
  coût = temps entre un écouteur en capture et un écouteur en fin de propagation sur `window` ;
  mises en page et styles par le domaine `Performance` du débogueur ; cadence par
  `requestAnimationFrame` ; `tests/ui/17-ecarter.js` refait la mesure à chaque passage) :

  | 404 lignes | Avant (trait) | Après (lignes écartées) |
  | --- | --- | --- |
  | Coût moyen d'un mouvement (`dragover`) | 0,14 ms | 0,012 à 0,021 ms |
  | 95ᵉ centile / maximum | 0,6 / 0,8 à 1,5 ms | 0,1 / 0,1 à 0,2 ms (limite de l'horloge) |
  | Mises en page pendant le geste | 55 (3,7 ms) | 0 |
  | Recalculs de style | 162 (9 ms) | 336 à 346 (32 à 41 ms, soit 0,1 ms l'un) |
  | Script pendant le geste | 54 à 57 ms | 8 à 12 ms |
  | Cadence médiane / 95ᵉ centile | 8,3 / 9,2 ms | 8,3 / 9,2 ms |
  | Images de plus de 25 ms | 0 | 0 |

  Le relevé initial (404 rectangles lus d'un coup, au premier survol) n'est pas dans ces
  chiffres : il a lieu une fois par glisser. *Reste* : avec des favoris vides, leur zone de
  dépôt s'ouvre au départ du glisser et décale toute la colonne de 52 points sous le pointeur
  (comportement antérieur, non modifié) ; les épinglés vides, eux, ne s'agrandissent plus.

## 8 bis. Réalisé (branche `performances`, 9 oct.) : mesures avant / après

**Méthode.** Les mesures se refont par `node scripts/mesures.js <mesure> --arbre <avant> --arbre .`
(scénarios dans `tests/mesures.js`) : un petit serveur local, un profil temporaire par arbre de
sources, des lancements **en alternance** (avant, après, avant, après…) et la médiane de chaque
valeur avec son étendue et la charge moyenne relevée. « Avant » est le commit `13ff947`
(version 0.11.1) extrait à part ; « après », cette branche. La mémoire vient de
`app.getAppMetrics()` (mémoire résidente, qui compte les pages partagées : environ 60 Mo de plus
que l'empreinte réelle par processus léger ; les écarts entre avant et après restent valables,
les totaux sont majorés). Machine : celle de la section 1.

**Limite de cette séance.** À partir de 2 h 50 l'écran de la machine était verrouillé : plus
aucune image n'est présentée (une par seconde au mieux), et le son n'est plus « audible ». Les
temps **de peinture** du démarrage (coque peinte, première page peinte) n'ont donc pas pu être
comparés et restent **à refaire**, écran déverrouillé ; les temps sans peinture (fenêtre créée,
coque chargée, calculs, nombre de processus, mémoire, requêtes) n'en dépendent pas. La charge a
varié de 4 à 56 (tâches de fond du système) : elle est donnée avec chaque série.

### Mémoire et processus de l'interface (MEM-1, DEM-3)

Quatre vues d'appoint ouvertes l'une après l'autre (notification, recherche, adresse survolée,
zone de dépôt), 4 tours alternés, charge 27 :

| | Avant | Après |
| --- | --- | --- |
| Processus au repos (fenêtre + 1 onglet) | 6 | **5** |
| Mémoire résidente au repos | 592 Mo | **515 Mo** |
| Processus après les quatre vues | 10 | **5** |
| Mémoire résidente après les quatre vues | 979 Mo (885–979) | **536 Mo** (482–544) |
| Première ouverture : notification | 146 ms | **17 ms** |
| Première ouverture : recherche dans la page | 156 ms | **4 ms** |
| Première ouverture : adresse du lien survolé | 125 ms | **19 ms** |
| Première ouverture : zone de dépôt | 139 ms | **18 ms** |

Série au calme (charge 5), mêmes rapports : 963 → 569 Mo, 85–118 ms → 3–17 ms.

*Comment.* Après le chargement de la coque, le processus principal lui demande d'ouvrir
(`window.open`) quelques vues « de réserve » (`overlay.html#reserve-N`) ; `setWindowOpenHandler`
les adopte dans des `WebContentsView` (`createWindow`). Elles partagent le processus de la coque
et sont déjà chargées : `makeUiView` en prend une, lui donne son adresse de rôle (`#toast`,
`#find`…) et la réserve se regarnit (trois au plus, jamais plus qu'il ne reste de rôles). Barre
latérale masquée, la barre flottante (`shell.html#flottant`) est préparée de la même façon.
Réserve vide (coque pas encore chargée, rafale) : la vue naît à part, comme avant.

*Sécurité.* Aucune frontière de confiance n'est franchie : toutes ces vues avaient déjà la même
origine (`orbe://app`), le même script de préchargement, les mêmes droits (`trusted`) et le même
canal vers le processus principal ; une seule compromise avait déjà tous les droits des autres.
Les vues qui portent davantage — liste des mots de passe (`pw-overlay.html`), feuilles
d'autorisation (`sheet.html`), réglages, pages internes ouvertes dans un onglet — ne passent pas
par `makeUiView` et gardent chacune leur processus. La coque n'ouvre rien d'elle-même : seules les
adresses que le processus principal vient de demander sont acceptées, une fois chacune ; une vue
d'appoint ne peut ni naviguer ni ouvrir de fenêtre ; bac à sable et isolation du contexte sont
imposés à la création. Tout cela est vérifié par `tests/performances.js`.

*Ce que cela coûte.* Un seul fil pour toute l'interface d'une fenêtre, et un plantage de ce
processus emporte toutes ses vues : la coque est alors rechargée et les vues renaissent à la
demande (trois reprises par minute au plus) ; avant, une coque plantée restait morte.

### Démarrage (DEM-2, DEM-3, DEM-4, DEM-8)

Lancements alternés, profil d'un onglet, charge 5 ; en ms depuis la création du processus :

| | Avant | Après |
| --- | --- | --- |
| À chaud (10 tours) : fenêtre créée | 238 (230–253) | 242 (230–255) |
| À chaud : coque chargée (`did-finish-load`) | 300 (293–357) | 298 (287–320) |
| Espacés de 25 s (5 tours) : fenêtre créée | 500 (486–550) | 509 (481–622) |
| Espacés de 25 s : coque chargée | 634 (609–681) | 617 (579–740) |
| Barre de commande, première ouverture | 25 (19–28) | **14** (11–16) |
| Processus / mémoire résidente au démarrage | 6 / 620 Mo | **5 / 531 Mo** |
| Les cinq fichiers de la coque servis par `orbe://` | 1,7–2,0 ms | **0,9 ms** |
| `store.load` avec 4 Mo d'historique (8 000 visites) | 12,4 ms (11,2–15,3) | **0,11 ms** |

Lecture honnête : **le temps jusqu'à la coque chargée ne change pas** (les écarts sont dans le
bruit). Ce qui est acquis au démarrage, c'est un processus et 89 Mo de moins, une barre de
commande prête plus tôt, et 12 ms de blocage en moins avant la fenêtre sur un vieux profil.
L'effet sur la peinture reste à mesurer (voir la limite ci-dessus).

Paquet distribué (DEM-8), même scénario, 8 tours, charge 8 : fenêtre **246 ms** contre 243 depuis
les sources, coque chargée **304 ms** contre 300. L'archive `asar` et les fusibles ne coûtent rien
de mesurable ; les chiffres pris sur les sources valent pour l'application.

DEM-5 : `extensions.loadInto` sans extension coûte **0,15 ms** (dossier 0,10, liste 0,03). Les
70–140 ms de la section 3 étaient le délai avant que la promesse soit servie, c'est-à-dire la
création de la fenêtre.

### Démarrage de l'application fabriquée, écran déverrouillé (refait le 9 oct., 12 h 40)

Ce que la séance précédente n'avait pas pu mesurer (écran verrouillé : aucune image présentée).
Deux applications fabriquées par `scripts/build-mac.js` dans des dossiers à part
(`ORBE_RUNTIME`), l'une depuis l'étiquette `v0.11.1`, l'autre depuis cette branche ; même
moteur (Electron 44.7.0), profil d'un onglet, 14 lancements alternés, charge 5,6 à 12,2 ;
médiane (min–max), en ms depuis la création du processus :

| | 0.11.1 | 0.13.0 | Cette branche |
| --- | --- | --- | --- |
| Fenêtre créée | 267 (244–478) | 291 (255–519) | 279 (256–664) |
| Coque chargée (`did-finish-load`) | 373 (341–632) | 389 (345–673) | 379 (348–836) |
| Coque peinte (première image) | 386 (356–641) | 395 (351–663) | **384** (350–838) |
| Barre latérale rendue (utilisable) | 412 (375–667) | **457** (408–734) | **418** (375–924) |
| Première page peinte | 376 (331–616) | 382 (338–653) | 370 (338–813) |
| Vue modale prête (barre de commande) | 413 (375–668) | 457 (409–749) | 447 (416–940) |
| Barre de commande, une fois la vue prête | 28 (21–56) | 17 (10–30) | 19 (11–23) |
| Processus | 6 | 5 | 5 |
| Mémoire résidente | 617 Mo | 550 Mo | 549 Mo |

- **Régression trouvée et corrigée.** La barre latérale était rendue 45 ms plus tard en 0.13
  qu'en 0.11.1 (457 contre 412 ; au mieux 408 contre 375). Cause : à la fin du chargement de
  la coque, le processus principal lui faisait ouvrir trois vues de réserve (`window.open`,
  MEM-1) au moment même où elle recevait son premier état ; les deux se disputaient son seul
  fil. La réserve n'est plus demandée qu'une fois l'état reçu et deux images présentées
  (`afterFirstRender` dans `window.js`), au plus tard après 400 ms si aucune image n'est
  présentée (fenêtre masquée). Résultat : 418 ms (au mieux 375, comme la 0.11.1), et la vue
  modale n'en est pas retardée (447 contre 457). Vérifié par « réserve de vues : demandée après
  le premier rendu… » (`tests/performances.js`).
- Première image de la coque et première page : pas d'écart mesurable entre les trois (bruit
  de ±15 ms à cette charge).
- « Fenêtre créée » : une douzaine de millisecondes de plus qu'en 0.11.1 (279 contre 267, au
  mieux 256 contre 244) : davantage de modules chargés avant la fenêtre. Non traité : l'écart
  ne se retrouve pas sur la première image.
- Barre de commande demandée dans la demi-seconde qui suit le lancement, avant que la vue
  modale soit prête : elle naît à part, dans son propre processus (une centaine de
  millisecondes, et un sixième processus pour la séance). Le relevé « commande » de la
  mesure attend désormais la vue modale, ce qui est le cas d'une personne.

### Coût par navigation (PERF-10, PERF-11, PERF-12)

Variantes dans un même processus, 40 tours alternés, deux séries, charge 4,5–6,6 ; page à
12 cadres avec formulaire de connexion, `loadURL` → `did-finish-load`, médianes en ms :

| Variante | Série 1 | Série 2 |
| --- | --- | --- |
| Tel que livré avant (les deux scripts) | 46,6 | 47,0 |
| Sans `page.js` | 44,3 | 44,9 |
| Sans `ext.js` (avec `page.js`) | 48,8 | 45,7 |
| Sans aucun script | 43,4 | 43,8 |
| Sans `nodeIntegrationInSubFrames` (scripts gardés) | **38,3** | **38,8** |
| `page.js` vide (une ligne) | 45,3 | 44,1 |
| `page.js` entier, `start()` non appelé | 45,9 | 46,9 |

- `nodeIntegrationInSubFrames` coûte **8 ms pour 12 cadres** (0,65 ms par cadre), scripts ou non :
  c'est la mise en place du préchargement dans chaque cadre. Il reste nécessaire (PERF-12) :
  sans lui, plus de remplissage des connexions placées dans un cadre, et plus de complément
  `chrome.*` pour les pages d'extension affichées en cadre. Il est gardé.
- `ext.js` : environ 1 ms pour 12 cadres. Il n'est plus enregistré tant que la session ne porte
  aucune extension (PERF-10) ; avant / après sur la même page, 6 tours, charge 36 :
  **39,1 → 37,6 ms** ; page légère 5,84 → 5,79 ; page à 150 ressources inchangée. Avec une
  extension installée, rien ne change : Electron n'offre pas de filtre par adresse pour un script
  de session, et un script de bac à sable ne peut pas en charger un autre.
- `page.js` : 2,2 ms pour 12 cadres, dont la moitié pour livrer le fichier ; ses écouteurs pèsent
  moins de 0,1 ms par cadre, ce que la mesure ne distingue pas du bruit. PERF-11 n'est donc pas
  livré : un risque moyen sur les mots de passe pour un gain invisible.

*Sécurité.* PERF-10 retire du code des pages web (et des service workers des sites) au lieu d'en
ajouter ; l'enregistrement a lieu avant le chargement de la première extension
(`extensions.hooks.equip`), avec un filet sur `extension-loaded`. PERF-11 et PERF-12 : rien n'est
modifié ; les garanties de `docs/mots-de-passe.md` sont intactes.

### Barre de commande (PERF-5, PERF-6)

8 000 visites variées, 174 frappes rejouées, 3 tours alternés, charge 4,5 :

| | Avant | Après |
| --- | --- | --- |
| Calcul dans le processus principal, médiane | 4,89 ms | **0,45 ms** |
| Calcul, 90ᵉ centile (première lettre : parcours complet) | 6,98 ms | 5,93 ms |
| Frappe → liste à jour dans la vue, médiane | 5,8 ms | **1,9 ms** |
| Frappe → image suivante | 8,2 ms | 7,3 ms (une image à 120 Hz dans les deux cas) |

### État envoyé à la coque (PERF-22, écarté)

Essai complet (état en morceaux JSON, seuls les morceaux changés transmis, recomposition dans
la coque), puis retiré. 1 000 onglets, 3 tours alternés, charge 4,4 :

| | État entier | État par morceaux |
| --- | --- | --- |
| Octets par envoi (un titre change) | 278 715 | 1 203 |
| `sendState` côté principal | 0,68 ms | 0,80 ms |
| Envoi → retour de la coque après rendu | 8,2 ms (7,6–8,2) | 9,7 ms (9,1–10,1) |
| Travail de la coque par envoi (tâches) | 9,2 ms | 8,8 ms |

Le transport n'est pas le poste qui coûte : c'est `render()`, qui repasse sur toutes les lignes
(2,1–2,8 ms à 1 000 onglets, 0,8 ms à 300, 0,6 ms à 50), et la production de l'image.

- ✅ **PERF-26 — `render()` : ne pas repasser sur les lignes inchangées.** *(fait le 9 oct. : chaque ligne garde la description qui l’a dessinée et n’est redessinée que si un champ, la sélection, le renommage ou une classe posée hors du rendu a changé — comparaison champ par champ, sans allocation ; chemin court quand les lignes sont les mêmes dans le même ordre ; signature de la forme des listes calculée une fois par état. Mesuré à 1 000 onglets, état identique : `render()` 1,36 → 0,49 ms (la liste du jour 1,07 → 0,35 ms) ; tâche complète de la coque 8,9 → 7,8 ms et aller-retour 8,9 → 7,8 ms sur une machine chargée (charge 6,6), le reste étant la désérialisation de l’état (0,9 ms) et le travail du moteur. Le gain de 2 ms attendu était surestimé : le script du rendu n’en coûtait que 1,4. Verrouillé par self fin « état identique renvoyé : aucune ligne n’est redessinée… » et six autres vérifications)*
  *Constat* : à 1 000 onglets, chaque état reçu coûte 2,1 à 2,8 ms de script dans la coque même
  quand rien n'a changé (0,38 ms annoncé en section 8 : c'était sous-estimé), 5 ms de tâche au
  total. *Changement possible* : garder par ligne le texte JSON de sa dernière description et
  sauter `tabRow` quand il est identique, en tenant compte de la sélection et du renommage en
  cours. *Gain attendu* : 2 ms par envoi à 1 000 onglets, rien sous 300. *Risque* : faible.
  *Effort* : S. Priorité basse.

### Icônes (PERF-24), réveil (PERF-8)

| | Avant | Après |
| --- | --- | --- |
| Requêtes `/favicon.ico`, 40 onglets sans icône, à l'affichage | 41 | 41 |
| … après six changements d'Espace | 369 (287–369) | **49** (47–49) |
| Onglet en veille, dix vrais sites : `loadURL` → première réponse | 452–467 ms | **148–175 ms** (pré-connexion faite 300 ms plus tôt) |

PERF-8 ne charge pas la page d'avance : un survol n'est pas une visite (historique, lecture
automatique, mémoire). Seule la connexion au site est préparée (`session.preconnect`), une fois
par site toutes les dix secondes, jamais en navigation privée, en https seulement.

### Veille des onglets (MEM-3, MEM-4, MEM-5, MEM-6)

- MEM-3 : douze onglets lourds, 2 196 Mo résidents pour un budget de 1 638 Mo (10 % de 16 Go
  pour l'essai ; 25 % par défaut) : **6 endormis, 13 → 7 processus de rendu**, 1 458 Mo ensuite.
  Le passage de fond (une fois par minute) coûte 1,1 à 3,1 ms. Réglages `sleepAfterHours`
  (3 par défaut, 0 = jamais) et `memoryBudget` (25, 0 = sans limite), sans interface pour l'instant.
- *Après relecture de sécurité (9 oct.)* : l'ancienneté se compte depuis le dernier instant où
  l'onglet était **à l'écran** (volets d'une vue scindée compris), plus depuis sa dernière
  activation ; les règles automatiques épargnent tout onglet où l'utilisateur a agi depuis le
  chargement (touche reçue par la page — lettre, AltGr, coller, Suppr, Entrée — ou bouton de
  souris), ceux qui chargent, sont en image dans l'image, filmés par une autre page ou d'où part
  un téléchargement ; la page est consultée (`beforeunload`) et reste si elle s'y oppose, sans
  question. Seuls les onglets lus ou jamais touchés s'endorment donc d'eux-mêmes : la portée de
  MEM-3 en est réduite, c'est le prix d'un formulaire jamais perdu. Non couvert : une page
  modifiée sans clavier ni souris et sans `beforeunload` (détail en tête de `src/main/veille.js`).
- La mémoire résidente compte de moins en moins un onglet caché (macOS la compresse : 1 453 Mo
  → 1 025 Mo en dix secondes sans rien faire) : le budget se déclenche donc plutôt trop tard que
  trop tôt.
- MEM-4 : vingt vrais sites, veille à quatre : 5 processus sans vue (860 Mo) trois secondes après,
  **1 (117 Mo) à +33 s, 0 à +73 s**. Ce sont les service workers de Reddit, YouTube, Amazon et
  Spotify ; Chromium les arrête de lui-même.

- ✅ **MEM-8 — Budget mémoire : relever l'empreinte réelle plutôt que la mémoire résidente.** *(fait le 9 oct. : empreinte lue dans la colonne MEM de `top`, hors du fil principal — `src/main/empreinte.js` ; dix onglets lourds : 853 Mo résidents pour 522 Mo d'empreinte ; self « empreinte : … » (6 vérifications))*
  *Constat* : `app.getAppMetrics()` ne donne sur macOS que la mémoire résidente (un onglet
  léger : 80 Mo résidents pour 20 Mo d'empreinte ; Wikipédia : 105 pour 168). *Piste* : `footprint`
  ou `top -stats mem` une fois par minute, hors du fil principal. *Effort* : S.
  *Ce qu'Electron 44 expose* (relevé dans `electron.d.ts`) : `app.getAppMetrics()[].memory` ne
  porte que `workingSetSize` sur macOS (`privateBytes` est réservé à Windows, où il était déjà
  utilisé) ; `process.getProcessMemoryInfo()` donne la mémoire propre, mais du seul processus
  qui l'appelle ; rien par `webContents`. *Fait* : `top -l 1 -stats pid,mem -pid …` (un `-pid` par
  processus d'onglet), lancé par `execFile`. Coût mesuré : **1,1 s de processeur par appel**,
  quel que soit le nombre de processus (`footprint` : 6,5 s pour quarante). Il n'est donc
  appelé qu'au plus toutes les cinq minutes, toutes les minutes seulement quand le dernier
  relevé dépasse 60 % du budget, jamais si le budget est coupé ou s'il reste quatre onglets
  vivants ou moins. Relevé absent, trop ancien (6 min) ou processus né depuis : la mémoire
  résidente sert, comme avant. Le gestionnaire de tâches (EXT-22) affiche la même valeur.

- ✅ **MEM-9 — Veille automatique : réglages dans la fenêtre des réglages.** *(fait le 9 oct. : volet « Onglets » — délai de veille, part de mémoire donnée en Go, onglets gardés en mémoire, liste « Sites qui restent éveillés » ; self « sites gardés éveillés… », « veille automatique : le site de la liste… », ui « volet Onglets… », « sites qui restent éveillés… »)*
  Le volet Avancé était à la hauteur de l'écran (932 px pour 975) : un dixième volet « Onglets »
  reçoit ces réglages et « Onglets gardés en mémoire », qui quitte Avancé (841 px). La liste
  s'écrit et se lit comme les règles d'aiguillage (site, sous-domaines, port, début de chemin) ;
  ses sites sont épargnés par l'ancienneté et par la mémoire, et pris en dernier par la limite
  en nombre. Dans la barre latérale, un onglet en veille se reconnaît à son titre plus pâle
  (déjà le cas ; Arc ne le signale pas autrement), désormais vérifié.

### Essais : fenêtre recouverte ou écran verrouillé

Constat de la séance : une fenêtre d'essai recouverte voit ses minuteries ralenties à une par
seconde (« balayage lent » échoue), et sous écran verrouillé la vidéo d'essai n'est jamais
« audible » et la capture de page entière n'aboutit pas — sur `main` comme sur cette branche.
`--selftest` pose désormais `disable-backgrounding-occluded-windows`, ce qui règle le premier
cas ; les deux autres demandent un écran déverrouillé (l'intégration continue n'est pas concernée).

## 8 ter. Deuxième tour de recherche (branche `recherche-2`, 11 oct.) : de la 0.12 à la 0.15.1

Orbe a beaucoup grandi depuis le premier tour (0.12 → 0.15.1 : lecteurs miniatures, centre de
contrôle du site, survols, thèmes, sons, sauvegardes, recherche de mise à jour, trois scripts de
préchargement, rendu à clés de la barre latérale…). Le code du processus principal est passé de
677 Ko à 1 039 Ko (+53 %), celui de la coque de 105 à 150 Ko. Ce tour mesure ce que cette
croissance a coûté, version contre version, puis ce que coûte Orbe **quand rien ne se passe**.

**Lecture rapide.** Presque tout a tenu : gestes, frappe, navigation, mémoire et disque sont au
niveau de la 0.12. Deux régressions réelles ont été trouvées, toutes deux corrigées ici :
des **animations sans fin** qui faisaient travailler le processeur graphique en permanence
pendant qu'un onglet joue en arrière-plan ou qu'une mise à jour est annoncée (jusqu'à 20 % d'un
cœur, des heures durant), et **une vingtaine de millisecondes** de plus avant la fenêtre.

### Méthode

- `node scripts/mesures.js <mesure> --arbre <avant> --arbre .` : lancements **en alternance**,
  médiane (min–max), charge moyenne relevée à chaque tour. « 0.12 » et « 0.13 » sont les
  étiquettes `v0.12.0` et `v0.13.0` extraites à part ; « main » est `13f7c44` (0.15.1) ;
  « branche » est `recherche-2`. Les scénarios (`tests/mesures.js`) sont ceux de cette branche,
  joués tels quels sur les anciennes versions.
- **Profil** : temporaire, de la forme d'un vrai profil ancien — 13 Espaces, 10 profils,
  200 onglets (par Espace : un dossier de trois onglets épinglés, deux épinglés seuls, le reste
  dans « Aujourd'hui »). Options nouvelles : `--espaces`, `--profils`. Le vrai profil n'a
  jamais été ouvert.
- **Mesures nouvelles** : `gestes` (changement d'Espace et d'onglet jusqu'à l'image, temps de
  `render()`, défilement, dix onglets vivants), `repos` (processeur par famille de processus en
  ms de calcul par seconde écoulée, réveils, états poussés, animations en cours, fichiers du
  profil réécrits — page fixe, lecteur miniature, note de mise à jour, fenêtre recouverte,
  réduite, masquée), `divers` (sauvegarde de l'état, surveillance du bord gauche).
- **Machine** : celle de la section 1, partagée (une autre suite d'essais tournait) : charge
  moyenne de 4 à 11 selon les séries, donnée dans chaque tableau.
- Mémoire : `app.getAppMetrics()` (résidente, majorée comme en 8 bis).

**Fenêtres discrètes.** Depuis `13f7c44` les fenêtres d'essai sont invisibles sur macOS
(`tests/discret.js`). `scripts/mesures.js` charge désormais ce module de la même façon : l'écran
reste libre pendant les mesures. `--visible 1` les montre (sans jamais prendre le clavier :
`ORBE_TEST_VISIBLE=inactif`), `--compare-visible 1` alterne les deux. Une application empaquetée
(`--app`) ne charge pas le module et reste visible.

Ce que la transparence change (démarrage, branche, 5 tours en alternance) :

| ms depuis la création du processus | discrète | visible, sans le clavier (charge 7,2) | visible, au premier plan (charge 5,3 ; discrète : 2e colonne) |
| --- | --- | --- | --- |
| fenêtre créée | 309 (290–370) | 290 (274–308) | 309 → 307 |
| coque chargée | 401 (398–483) | 463 (443–500) | 414 → 554 |
| coque peinte | 390 (370–472) | 444 (426–472) | 393 → 473 |
| barre latérale rendue | 424 (413–499) | 490 (461–513) | 428 → 567 |
| première page peinte | 403 (392–480) | 422 (412–454) | 416 → 491 |
| vue modale prête | 479 (468–566) | 566 (529–591) | 483 → 646 |

Une fenêtre transparente **peint 20 à 90 ms plus tôt** qu'une fenêtre visible, et 75 à 160 ms
plus tôt qu'une fenêtre qui prend le premier plan (icône du Dock, activation). Les temps de
démarrage ci-dessous sont donc **comparables entre versions** (même mode) mais **optimistes
d'environ 60 à 140 ms en valeur absolue** ; les temps sans peinture (fenêtre créée, calculs,
mémoire, processus) ne bougent pas. Le coût des animations, lui, est le même fenêtre visible ou
non (lecteur, `main` : 185 ms/s discrète, 169 ms/s visible).

### Tableau : 0.12, 0.13, aujourd'hui

« Aujourd'hui » est `main` avant les corrections de ce tour (la colonne suivante les donne).

| Mesure | 0.12 | 0.13 | 0.15.1 (`main`) | Charge | Verdict |
| --- | --- | --- | --- | --- | --- |
| **Démarrage, profil vide** : fenêtre créée (ms) | 286 (281–321) | 303 (285–322) | **309** (296–313) | 5,2 | +23 ms |
| coque peinte | 380 | 382 | 397 | 5,2 | +17 ms |
| barre latérale rendue (interactive) | 432 | 443 | 455 | 5,2 | +23 ms |
| première page peinte | 392 | 401 | 412 | 5,2 | +20 ms |
| vue modale prête | 433 | 459 | 489 | 5,2 | +56 ms |
| première barre de commande | 18 | 21 | 21 | 5,2 | tenu |
| **Démarrage, 200 onglets / 13 Espaces / 10 profils** : fenêtre créée | 286 (279–291) | 294 (288–298) | **316** (293–321) | 7,2 | +30 ms |
| coque peinte / barre rendue / page peinte | 376 / 440 / 392 | 381 / 442 / 388 | 409 / 450 / 430 | 7,2 | +33 / +10 / +38 ms |
| vue modale prête | 441 | 457 | 516 | 7,2 | +75 ms |
| `require` du processus principal avant « prêt » | 13–21 ms | 17–25 ms | **28–36 ms** | 7–8 | +13 ms, dont 7 pour un seul module (DEM-10) |
| **Processus / mémoire au démarrage** (vide) | 5 / 482 Mo | 5 / 488 Mo | 5 / 480 Mo | 5,2 | tenu |
| avec 200 onglets restaurés (endormis) | 5 / 486 Mo | 5 / 488 Mo | 5 / 490 Mo | 7,2 | tenu : un onglet restauré ne coûte rien |
| avec 10 onglets vivants de plus (pages légères) | 15 / 1 313 Mo | 15 / 1 271 Mo | 15 / 1 289 Mo | 5,3 | tenu (≈ 75 Mo résidents par onglet vivant) |
| **Navigation** (chargement complet) : page légère | 8,0 ms | 7,7 | 8,4 | 10 | tenu |
| page à 12 cadres (trois scripts de préchargement) | 51,2 (49–56) | 51,2 (50–52) | 52,9 (51–56) | 10 | **+1,7 ms pour 12 cadres** : tenu |
| page à 150 sous-ressources | 77,1 (75–90) | 77,5 (76–87) | 86,2 (74–100) | 10 | dans le bruit (minimums égaux) |
| **État envoyé à la coque**, 200 onglets : taille | 11,1 Ko | 11,2 Ko | 11,8 Ko | 5,5 | tenu |
| construction + envoi (processus principal) | 0,09 ms | 0,10 | 0,12 | 5,5 | +30 %, négligeable |
| aller-retour jusqu'au rendu / tâche de la coque | 1,0 / 1,3 ms | 0,9 / 1,4 | 0,95 / 1,5 | 5,5 | tenu |
| 1 000 onglets : taille / envoi / aller-retour | 45,1 Ko / 0,23 / 1,8 ms | 45,1 / 0,24 / 1,8 | 47,6 / 0,35 / 1,9 | 7,2 | tenu |
| **`render()`**, un titre change, 200 lignes dans un Espace | 0,8 ms | 0,8 | **0,4** | 7 | mieux (rendu à clés) |
| reconstruction (changer d'Espace), 200 lignes | 4,2 ms | 4,7 | 4,8 | 7 | tenu |
| **Changement d'Espace** → barre peinte, 13 Espaces | 11,2 ms | 8,8 | 8,2 | 5,3 | une image |
| un Espace de 200 onglets | 14,2 | 13,4 | 16,2 (14,7–19,2) | 7 | deux images, tenu |
| **Changement d'onglet** → image de la page | 7,7 ms (dont 2,2 synchrones) | 7,6 | 7,5 | 5,3 | une image |
| **Barre de commande**, 8 000 visites : frappe → liste | 1,3 ms | 1,4 | 1,3 | 9 | tenu |
| frappe → peinture / calcul principal | 6,4 / 0,43 ms | 6,6 / 0,40 | 6,5 / 0,41 | 9 | tenu |
| **Défilement de la barre**, 213 lignes : médiane / 95e / pire | 8,3 / 9,3 / 9,4 ms | idem | idem | 7 | 120 images/s, aucune perdue |
| **Repos, page fixe** : graphique / coque / pages | — | — | 0,4 / 0,2 / 0,1 ms par s | 4,8 | excellent ; 9 réveils par s |
| états poussés à la coque, au repos | — | — | 0 par minute | 4,8 | excellent |
| **Repos, un onglet joue hors de vue** (lecteur miniature) | (pas de lecteur) | (pas de lecteur) | **185 ms/s** graphique (93–217), 40–47 coque, 334 réveils/s | 4–8 | **régression** (ENER-1) |
| **Repos, mise à jour annoncée** | (pas de note) | (pas de note) | **71 ms/s** graphique (40–71), 25 coque, 220 réveils/s | 5–10 | **régression** (ENER-2) |
| Fenêtre réduite ou masquée, lecteur présent | — | — | 0,3–0,5 / 0,1–0,6 ms par s | 5–8 | Chromium arrête tout |
| **Disque au repos** : fichiers du profil réécrits | — | — | `history.json` une fois après la visite, puis rien | 4,8 | excellent |

Non mesuré : 50 et 200 onglets **vivants** (≈ 4 et 15 Go sur une machine de 16 Go partagée ; la
veille automatique de MEM-3 les endormirait de toute façon). L'ordre de grandeur est donné par
les dix onglets vivants : 74 à 79 Mo résidents par page légère, inchangé depuis la 0.12.

### Ce qui tourne quand rien ne se passe

Toutes les minuteries périodiques du code (recherche de `setInterval`), et ce qu'elles coûtent :

| Minuterie | Période | Quand | Coût relevé |
| --- | --- | --- | --- |
| `media.js` : question posée aux pages qui jouent hors de vue | 1 s | seulement s'il y a un lecteur ; s'arrête seule | non mesurable (processus principal : 4,7 ms/s avec, 4,4 sans, mesure comprise) ; aucun état poussé tant que la position suit |
| `window.js` : `pollPeek`, bord gauche | 80 ms | seulement barre latérale masquée | 0,14 µs par passage fenêtre en arrière-plan, 0,96 µs au premier plan (12 µs par seconde) |
| `window.js` : `statusPoll`, adresse du lien survolé | — | seulement pendant un survol de lien | passager |
| `capture-state.js` | — | seulement pendant une capture | passager |
| `little.js` | — | seulement pendant l'animation de la petite fenêtre | passager |
| `page.js` (dans les pages) | 250 ms, 60 fois au plus | après la saisie d'un mot de passe | passager, borné à 15 s |
| `tasks.js` (gestionnaire de tâches) | 2,5 s | page ouverte et visible | — |
| `main.js` : veille des onglets | 60 s | toujours (pas en essai) | — |
| `main.js` : archivage | 10 min | toujours | — |
| `backups.js` : sauvegarde de l'état | 1 h, et au lancement | toujours (pas en essai) | 0,45 ms pour 44 Ko (200 onglets), 1,4 ms pour 189 Ko (1 000 onglets) |
| `updates.js` | 6 h | si la recherche est active | une requête |

Rien à reprendre de ce côté : aucune minuterie ne tourne sans raison. **Le coût au repos venait
des animations CSS**, pas des minuteries. Relevé en coupant chaque animation tour à tour
(`ORBE_BENCH_CSS`, lecteur miniature présent, 10 s, deux tours, charge 4–5) :

| Lecteur miniature (`main`) | graphique (ms/s) | coque (ms/s) | réveils/s | animations en cours |
| --- | --- | --- | --- | --- |
| tel quel (titre qui défile + trait d'avancement) | 207 / 217 | 47 / 47 | 338 / 318 | 2 |
| sans le défilement du titre | 188 / 185 | 46 / 44 | 320 / 323 | 1 |
| sans la transition de l'avancement | 201 / 193 | 46 / 43 | 335 / 328 | 1 |
| sans les deux | **1,4 / 1,1** | 0,6 / 0,6 | 41 / 40 | 0 |
| avancement en 60 pas (`steps(60)`) seul | 22 / 21 | 17 / 18 | 167 / 167 | 1 |

Une **seule** animation en cours, quelle que soit sa taille (un trait de 2 px), fait composer
la fenêtre à la cadence de l'écran (120 images par seconde) : c'est tout ou rien. Même une
animation « à pas », qui ne change rien entre deux pas, garde le compositeur éveillé (22 + 17 ms/s).
Les deux animations du lecteur duraient autant que la lecture : la musique d'une journée de
travail coûtait un cinquième de cœur en continu, écran allumé.

**Fenêtre recouverte.** Essai court, fenêtres visibles, sans le drapeau qui empêche Chromium de
ralentir (`--naturel 1 --visible 1`, `main`, 8 s) : recouverte par une autre fenêtre **d'Orbe**,
la coque reste « visible » et le coût ne baisse pas (169 → 173 ms/s graphique). Le cas d'une
fenêtre recouverte par **une autre application** n'a pas été mesuré (il aurait fallu occuper
l'écran) ; le constat de 8 bis (minuteries ralenties à une par seconde) laisse penser que
Chromium ralentit alors. Réduite ou masquée, tout s'arrête (tableau ci-dessus).

### Points

Classés par gain ressenti rapporté au risque.

- ✅ **ENER-1 — Lecteur miniature : plus rien ne tourne en continu pendant la lecture.** *(fait le 11 oct.)*
  Problème : la barre d'avancement était une transition CSS étirée jusqu'à la fin de la piste, le
  titre trop long défilait sans fin ; chacune suffisait à faire composer la fenêtre 120 fois par
  seconde. Changement : l'avancement est posé par une minuterie (un pas par point d'écran
  environ, quatre par seconde au plus, arrêtée fenêtre masquée — `STEP` dans `players.js`) ; le
  titre défile **un aller-retour** quand il apparaît ou change, et de nouveau quand le pointeur
  quitte la carte, puis se repose. Mesuré (12 s, piste de 60 s, deux tours en alternance,
  charge 5–8) : graphique **185 → 13 ms/s**, coque **40 → 5,9 ms/s**, réveils 334 → 165 par
  seconde ; fenêtre visible : 169 → 15 ms/s. Une piste de 4 min (un pas par seconde) coûte
  moins encore. Risque : le défilement du titre **se voit** — il ne tourne plus en boucle ;
  pour revenir en arrière, une valeur dans `shell.css` (`2 alternate` → `infinite alternate`).
  Essais : « l'avancement progresse par pas, sans transition ni animation en cours », « le titre
  trop long ne défile pas sans fin » (`tests/medias.js`), essai d'interface des lecteurs mis à jour.
- ✅ **ENER-2 — Note de mise à jour : le cœur bat trois fois, puis se repose.** *(fait le 11 oct.)*
  Problème : `update-heart` tournait sans fin tant que la note restait au bas de la barre — des
  jours, si l'on remet la mise à jour à plus tard. Mesuré (12 s, page fixe, charge 5–10) :
  graphique **71 → 0,1 ms/s**, coque **25 → 0,4 ms/s**, réveils 220 → 6 par seconde. Risque :
  nul (le cœur reste, immobile). Essai : « le cœur de la note bat quelques fois puis se repose »
  (`tests/mises-a-jour.js`).
- ✅ **ENER-0 — Verrou : aucune animation sans fin hors d'un état passager.** *(fait le 11 oct.)*
  `tests/performances.js` relit `shell.css` : seules six règles peuvent porter `infinite`
  (chargement : `#url.loading::after`, `#glow i`, `.spinner` ; capture : `#capture-note`,
  `.row.capturing .act.cap` ; favori qui joue : `.tile.audible .dot i`), et la coque au repos
  n'a aucune animation en cours. Toute nouvelle animation sans fin doit être justifiée ici.
- ✅ **DEM-10 — Icônes : ne rien construire au lancement.** *(fait le 11 oct.)*
  Problème : `src/main/icons.js` (24 lignes) construisait au chargement un `Intl.Segmenter` et une
  expression régulière à classes Unicode : **6,8 à 7,0 ms** avant la fenêtre, la moitié de ce
  que le processus principal a pris depuis la 0.12, pour un geste rare (choisir un émoji).
  Changement : construits au premier émoji vérifié. Mesuré : `require('./window')` 12,3–14,0 →
  4,4–6,9 ms ; « prêt » 64–85 → 55–77 ms (quatre tours en alternance, charge 7) ; démarrage avec
  200 onglets (7 tours, charge 6,4) : fenêtre **308 → 295 ms**, barre rendue 462 → 432, première
  page 421 → 400. Risque : nul (même vérification). Essai : « icônes : rien n'est construit au
  chargement du module ».
- ⬜ **ENER-3 — Favori qui joue, capture en cours : les deux animations sans fin qui restent.**
  L'égaliseur d'un favori audible (`tile-notes`) et la pulsation de capture (`capture-pulse`)
  tournent tant que dure l'état : une journée de musique, une heure de visioconférence. Mesuré
  en posant la même animation sur un élément de même taille (10 s, charge 10) : égaliseur
  **+45 ms/s** graphique et **+28 ms/s** coque, pulsation **+42** et **+24**, réveils 163 → 330
  par seconde. Proposé : égaliseur figé après quelques mesures (barres à mi-hauteur, comme en
  mouvement réduit) et relancé au survol ; pulsation remplacée par un point fixe après dix
  secondes. Gain : 7 % d'un cœur pendant ces états. Risque : goût — ce sont des signes de vie
  voulus ; à décider. Effort S.
  **Précision d'ENER-4 (8 quater)** : ces +45 et +42 ms/s avaient été relevés sur un élément posé
  hors de la barre latérale. À leur vraie place, fenêtre sans le clavier (le cas d'une musique
  d'ambiance ou d'une visioconférence dans une autre application), le coût est de **107 à 193 ms/s**
  de processeur graphique : voir ENER-7.
- ✅ **ENER-4 — Comprendre pourquoi une animation minuscule coûte une fenêtre entière.** *(compris et mesuré le 11 oct., section 8 quater ; aucun changement de l'application)*
  Compris et mesuré (section 8 quater). Deux causes qui s'ajoutent, aucune n'est la taille de la
  fenêtre : (1) un coût **fixe par image**, 120 fois par seconde, dans le processus graphique et
  dans la coque (35 à 42 + 18 à 23 ms/s), le même pour une fenêtre de 700 × 500 ou de
  1 728 × 1 035, avec ou sans translucidité, grain, couche isolée ; (2) fenêtre **sans le
  clavier**, `body.blurred #sidebar > * { opacity: 0.7 }` enferme l'animation dans un groupe
  translucide que le compositeur doit redessiner à part à chaque image : **×3 à ×5**
  (107 à 193 ms/s). Aucun changement sans effet sur l'aspect n'a été trouvé : rien n'est modifié
  dans l'application ; les suites possibles sont ENER-7.
- ⬜ **ENER-7 — Fenêtre à l'arrière-plan : ne plus composer un groupe translucide par image.**
  Décision de goût, chiffres en 8 quater (égaliseur d'un favori, charge 4 à 5, fenêtre sans le
  clavier) : tel quel **167 ms/s** graphique et 32 coque ; (a) animations sans fin **figées** tant
  que la fenêtre n'a pas le clavier (`animation-play-state: paused` sous `body.blurred`) :
  **0,6** et 0,6 — l'égaliseur et la pulsation de capture ne bougent plus dans une fenêtre
  d'arrière-plan ; (b) ne plus estomper le groupe qui contient l'animation : **35** et 18 — la
  rangée des favoris (ou la ligne d'adresse pendant une capture) reste à pleine opacité ;
  (c) estomper les éléments un à un plutôt que le groupe : **53** et 29 — presque invisible, mais
  pas identique (une tuile active laisse voir son fond à travers l'icône). Recommandé : (a), qui
  règle aussi ENER-3 pour le cas le plus long (Orbe derrière une autre application). Effort S.
- ⬜ **DEM-11 — Charger au besoin les modules que le lancement n'utilise pas.**
  Après DEM-10 il reste 20 à 28 ms de `require` avant « prêt » (13–21 en 0.12). `sessions.js`
  en tire 5 à 9 : `passwords` 1,1–2,1 ms, `ext-api` 1,3–1,8, `permissions` 0,7–1,4, `extensions`
  0,9–1,3, `downloads` 0,4–0,8. Gain attendu : 3 à 6 ms. Ces modules gardent des frontières de
  sécurité (mots de passe, autorisations, extensions) : l'ordre de leur chargement ne doit pas
  changer sans relecture. Risque moyen pour un gain faible : **en bas de liste**. Effort M.
- ➖ **DEM-12 — Vue modale : +56 à +75 ms depuis la 0.12.** Décomposé (8 quater, `mesures.js
  modale`), **rien à gagner pour la personne** : +24 ms viennent de la coque elle-même, chargée
  plus tard (DEM-13) ; +15 ms sont l'attente voulue du premier rendu de la barre latérale
  (8 bis), dont 12 se regagnent aussitôt (la demande n'attend plus derrière ce rendu) ; +11 ms
  sont la page de la vue, plus lourde (textes 79 → 132 Ko copiés deux fois par vue, `emojis.js`,
  `overlay.js` 20 → 39 Ko). Essayé puis **retiré** : ne demander d'abord qu'une vue (coque
  chargée → vue modale prête **85 → 49 ms**, « vue modale prête » 548 → 506 ms), car les deux
  autres se chargent alors juste après et la première barre de commande, demandée à cet
  instant, passe de 24 à 55 ms : le travail est déplacé, pas supprimé (barre affichée au plus
  tôt à 572 → 561 ms, dans le bruit). Essayé aussi : n'envoyer qu'une langue aux vues
  (516 → 511 ms, dans le bruit, pour un changement du pont de l'interface) : écarté.
- ✅ **DEM-13 — La page de la coque se charge 22 ms plus lentement qu'en 0.12.** *(décomposé et corrigé le 13 oct. : scripts différés, « load » 111 → 95 ms)*
  Relevé en 8 quater : de la navigation à l'événement `load` de `shell.html`, 95 ms (88–110) en
  0.12, 118 ms (104–136) en 0.15.2. Décomposé le 13 oct. par une trace du moteur au démarrage
  (`--trace-startup`, deux traces par version) et par des repères posés dans des copies jetables ;
  mesure `mesures.js coque` ajoutée (étapes de la page, repères s'il y en a). Trois faits :
  (1) **les scripts de la coque étaient demandés un par un**, chacun après la fin du précédent
  (1 à 3,5 ms l'aller-retour par le processus principal) : trois en 0.12, sept aujourd'hui, et
  les deux derniers (`libpeek.js`, `folderpeek.js`) partaient après le « ready » de `shell.js`,
  donc pendant que le processus principal envoie l'état (3 à 12 ms d'attente de plus) ;
  (2) le pont de l'interface coûte 3 à 5 ms de plus (textes des deux langues, 79 → 132 Ko :
  appel synchrone 3 → 5 à 10 ms) ; (3) l'exécution des scripts ne compte pas (3 ms en tout), et
  la première mise en page (5 à 12 ms) est la même dans les deux versions.
  Changement : les sept scripts portent `defer`. Placés en fin de page, ils s'exécutent au même
  moment et dans le même ordre, mais sont demandés tous ensemble. Mesuré, arbre d'avant contre
  arbre corrigé, 11 tours en alternance, charge 7,5 : `load` **111,4 (106–131) → 95,3 (86–116) ms**,
  coque chargée 421 → 399 ms depuis la création du processus ; même sens machine chargée
  (charge 31 : 137 → 119 ms). Les étapes suivantes (barre rendue, vue modale) suivent dans deux
  séries sur trois, la troisième est dans le bruit d'une machine partagée : gain pour la personne
  **non établi** au-delà du chargement lui-même. Essayés et non gardés : n'annoncer « ready »
  qu'à `DOMContentLoaded` (−4 à −12 ms, moins que `defer`), servir les sept scripts en une seule
  réponse (pas mieux que `defer`, et un fichier de 150 Ko arrive plus tard que le premier petit).
  Reste : le point (2), déjà essayé en 8 quater sur la vue modale (dans le bruit). DEM-14, ouvert
  à cette occasion, a été écarté après mesure.
  Risque : faible (ordre d'exécution inchangé). Essai : « coque : tous ses scripts sont différés… ».
- ➖ **DEM-14 — Chaque page de l'interface demande un `favicon.ico` qui n'existe pas ; les vues chargent leurs scripts un par un.** Écarté après mesure (13 oct., `mesures.js modale`, arbre d'avant contre arbre modifié, tours en alternance), **rien à gagner** :
  (a) répondre tout de suite à `orbe://app/favicon.ico` (réponse vide, sans passer par
  `net.fetch` d'un fichier absent) : coque chargée → vue modale prête 111 (96–167) → 116
  (99–223) ms, « vue modale prête » 645 → 641 ms (13 tours, charge 13 à 18) : dans le bruit ;
  la demande part après `load`, hors de tout chemin d'affichage.
  (b) `defer` sur les quatre scripts de `overlay.html`, comme pour la coque (DEM-13) : vue créée →
  vue chargée 67,4 (55–92) → 66,4 (59–81) ms, page de la vue 54 → 63 ms (11 tours, charge 12) :
  aucun gain. La raison se lit dans la trace de DEM-13 : les vues naissent dans le processus de
  la coque, et `base.css`, `common.js`, `theme.js` leur viennent de son cache en mémoire, sans
  aller-retour par le processus principal. Les deux changements ont été retirés.
- ➖ **PERF-30 — Ne pas envoyer un état identique au précédent.** Écarté après mesure :
  `sendState` envoie bien 60 fois sur 60 un état identique si on l'appelle 60 fois (0,12 ms côté
  principal, 1,5 ms de tâche dans la coque à 200 onglets), mais au repos **aucun** état n'est
  poussé (0 par minute, page fixe comme lecteur présent), et PERF-23 avait compté 1 à 3 envois par
  seconde en chargement. Rien à gagner.
- ➖ **ENER-5 — Arrêter la question posée aux pages qui jouent quand la fenêtre est masquée.**
  Écarté : une question par seconde, sans état poussé tant que la position suit ; le processus
  principal passe de 4,4 à 4,7 ms/s, mesure comprise.
- ➖ **ENER-6 — Surveillance du bord gauche (`pollPeek`, 80 ms).** Écarté : 0,96 µs par passage.
- ➖ **DISQUE-1 — Écritures au repos.** Écarté : aucune écriture récurrente du profil (une de
  `history.json` après la visite, une ligne de journal de `Local Storage`).
- ➖ **DISQUE-2 — Sauvegarde horaire de l'état, faite sur le fil principal avant la première
  fenêtre.** Écarté : 0,45 ms pour l'état d'un profil de 200 onglets (44 Ko), 1,4 ms à 1 000.
- ➖ **MEM-10 — Mémoire de la coque après trois versions de fonctions.** Écarté : 480 Mo
  résidents au démarrage contre 482 en 0.12, 5 processus ; rien n'a grossi.
- ➖ **PERF-31 — Coût des trois scripts de préchargement.** Écarté : +1,7 ms sur une page à
  12 cadres (51,2 → 52,9 ms, charge 10), soit 0,14 ms par cadre.

### Ce que je recommande ensuite

1. Décider d'ENER-7 et d'ENER-3 ensemble (affaire de goût ; les chiffres sont en 8 quater).
2. Refaire `repos` sur l'application empaquetée, fenêtre réellement recouverte par une autre
   application et sur batterie (`powermetrics` demande les droits d'administrateur) : la
   consommation en watts n'a pas pu être relevée ici, seulement le temps de processeur.

## 8 quater. Troisième tour (branche `ener-4`, 11 oct.) : coût d'une animation, vue modale

Deux points ouverts de 8 ter, repris par la mesure. Aucun changement dans l'application : les
causes sont trouvées et chiffrées, les suites sont des décisions (ENER-7) ou sans gain (DEM-12).
Outils ajoutés : `mesures.js repos --variante <nom>…` (une animation posée dans la coque, une
chose changée à la fois, variantes en alternance ; table `VARIANTES` de `tests/mesures.js`),
`ORBE_BENCH_TRACE=<fichier>` (trace du compositeur, 3 s) et la mesure `modale`.

**Lecture des chiffres.** Ce sont des temps de processeur (ms de calcul par seconde écoulée),
pas des durées. Ils dépendent de la charge autrement qu'on l'attend : le même égaliseur coûte
107 à 118 ms/s machine chargée (charge 14 à 22) et 167 à 193 ms/s machine calme (charge 4 à 5),
sans doute parce que le travail passe alors sur les cœurs économes (supposé, non vérifié). Ne
comparer que des colonnes d'une même série. Fenêtres discrètes pour toutes les séries (aucune
fenêtre visible n'a été utilisée) : la fenêtre d'essai n'a donc **jamais le clavier**.

### ENER-4 : ce que coûte une animation, et pourquoi

Égaliseur d'essai : trois barres de 3 × 8 px animées par `tile-notes` (transformation seule),
posées dans la coque, page fixe, fenêtre de 1 360 × 860. Série 1 : 3 tours de 8 s en alternance,
17 variantes, charge 9 à 16.

| Variante | graphique (ms/s) | coque (ms/s) | réveils/s |
| --- | --- | --- | --- |
| témoin, aucune animation | 0,6 (0,4–0,7) | 0,5 | 16 |
| égaliseur, sur le fond de la coque | **42,4** (31,5–42,8) | **23,1** | 328 |
| fenêtre de 700 × 500 | 38,0 (32,1–38,5) | 20,6 | 325 |
| fenêtre de 1 728 × 1 035 (tout l'écran) | 37,5 (35,8–39,5) | 20,9 | 318 |
| sans translucidité (`setVibrancy(null)`, fond blanc) | 34,8 (31,9–38,8) | 19,8 | 339 |
| fenêtre et coque à fond opaque | 38,0 (37,6–45,0) | 21,3 | 338 |
| sans le grain | 43,1 (40,2–47,0) | 25,9 | 320 |
| zone isolée (`contain: strict`, `isolation`, `will-change`) | 37,2 (31,3–53,8) | 21,1 | 341 |
| page de l'onglet masquée / vue modale masquée | 36,7 / 38,5 | 21,4 / 21,2 | 325 / 312 |
| pulsation d'opacité (`capture-pulse`) au lieu de l'égaliseur | 40,9 (30,4–42,5) | 22,5 | 313 |
| même mouvement sur `height` (hors compositeur) | 74,7 (67,0–87,9) | 66,5 | 340 |
| `steps(4)` : 8 positions par cycle | 20,8 (17,0–23,4) | 12,3 | 267 |
| `steps(13)` : 29 positions par seconde | 34,1 (28,3–43,2) | 19,6 | 314 |
| minuterie à 12 images par seconde, sans animation CSS | 20,2 (19,8–25,1) | 12,8 | 263 |
| minuterie à 30 images par seconde | 37,0 (33,8–41,1) | 31,6 | 325 |
| **le même égaliseur dans `#sidebar`** | **115** (76,7–117,8) | 27,5 | 322 |

Ce que la série écarte : **la taille de la fenêtre, la translucidité, le grain, l'isolation de
la zone** ne changent rien (les variantes `sans-flou` et `sans-masque` existent mais n'ont pas
été mesurées : la trace les rend sans objet). La trace du compositeur le confirme : 361 images en
3 s (120 par seconde), mais le dessin lui-même est négligeable (`DirectRenderer::DrawFrame`,
17 µs par image, aucune passe de rendu : chaque couche part telle quelle vers CoreAnimation). La
fenêtre n'est **pas** redessinée en entier ; ce qui coûte est le **tour de manège de chaque
image** (signal de l'écran, ordonnanceurs, envoi et accusé de l'image, remise à CoreAnimation) :
environ 0,3 ms de processeur graphique et 0,2 ms de coque, 120 fois par seconde. Ce coût ne
baisse pas en proportion du nombre d'images : 12 images par seconde coûtent encore la moitié de
120, parce que le compositeur reste éveillé entre deux images (263 réveils par seconde). Il n'y
a donc pas de demi-mesure utile : une animation tourne (≈ 40 + 20 ms/s) ou ne tourne pas (≈ 1).
`transform` et `opacity` restent le bon choix (`height` : le double, et le triple dans la coque).

Ce que la série trouve : dans la barre latérale, la même animation coûte **trois fois plus**.
La trace montre une passe de rendu de plus à chaque image (`DirectRenderer::DrawRenderPass`,
3 quadrilatères : les trois barres). Cause : `body.blurred #sidebar > * { opacity: 0.7 }`
(`shell.css`, « fenêtre passée à l'arrière-plan »). Un groupe translucide qui contient
plusieurs couches doit être composé à part puis fondu : dès qu'une animation tourne dans un
enfant de la barre, ce groupe est redessiné 120 fois par seconde. Série 2 (2 tours de 8 s,
charge 16 à 22) :

| Variante (fenêtre sans le clavier) | graphique (ms/s) | coque (ms/s) |
| --- | --- | --- |
| égaliseur sur le fond de la coque (hors de tout groupe) | 39,8 | 22,1 |
| égaliseur dans `#sidebar` | **114,6** | 26,3 |
| le même, sans l'opacité de l'arrière-plan | **36,5** | 20,0 |
| dans un groupe à 70 % de 11 × 8 px / 44 × 44 / 250 × 800 | 79,0 / 102,7 / 104,2 | 18,2 / 21,9 / 20,0 |
| **vraie règle** : favori qui joue (`.tile.audible .dot i`) | **118,1** (103–118) | 22,0 |
| **vraie règle** : note de capture (`#capture-note`) | **108,5** (102–109) | 21,5 |

La taille du groupe compte peu (79 à 104) : c'est d'avoir une passe de plus qui coûte. Série 3,
machine calme (3 tours de 8 s, charge 4 à 5), pour chiffrer les suites possibles (ENER-7) :

| Favori qui joue, fenêtre sans le clavier | graphique (ms/s) | coque (ms/s) | réveils/s |
| --- | --- | --- | --- |
| témoin, aucune animation | 0,6 | 0,4 | 16 |
| tel quel | **167,3** (jusqu'à 192,7) | 31,7 | 308 |
| sans l'opacité de l'arrière-plan (= fenêtre qui a le clavier, supposé) | 35,1 (32,5–40,4) | 18,0 | 335 |
| égaliseur figé tant que la fenêtre n'a pas le clavier | **0,6** (0,5–0,6) | 0,6 | 52 |
| opacité portée par les éléments, pas par le groupe | 52,9 (31,3–55,6) | 29,1 | 317 |
| note de capture, telle quelle | 106,5 (97,4–160,1) | 18,7 | 338 |

(Un tour de « tel quel » sur trois n'a pas reçu la classe `audible` — la tuile venait d'être
redessinée — et a mesuré 1,5 ms/s sans animation : défaut de la variante, pas de l'application ;
la médiane et le maximum viennent des deux autres.)

Conséquences :

- Le cas le plus long des animations sans fin est aussi le plus cher : une musique dans un
  favori ou une visioconférence **pendant qu'on travaille dans une autre application**, donc
  fenêtre d'Orbe sans le clavier : 11 à 19 % d'un cœur dans le processus graphique, plus 2 à 3 %
  dans la coque, tant que dure l'état.
- Les +45 ms/s d'ENER-3 étaient sous-estimés (élément d'essai hors de la barre).
- Les chiffres d'ENER-1 et d'ENER-2 ont tous été pris fenêtre sans le clavier, avant comme
  après : ils restent comparables entre eux.
- Non vérifié : la fenêtre qui **a** le clavier (interdit ici : prendre le clavier de la
  personne). La variante « sans l'opacité » en tient lieu.
- `tests/mesures.js` : la période « lecteur » commençait parfois avant que le titre du lecteur
  ait commencé à défiler et comptait ce défilement (107 ms/s et une animation en cours, au lieu
  de 11 à 18 ms/s et aucune). Vérifié à part : le défilement s'arrête bien après un aller-retour
  (27,9 s pour 221 px), avec ou sans note de mise à jour. Le scénario attend maintenant la carte.

### DEM-12 : d'où viennent les millisecondes de la vue modale

`mesures.js modale` horodate les étapes en enveloppant `fillSpares`, `adoptSpare` et
`spareReady` sur la fenêtre (rien à modifier dans la version mesurée). Profil vide, 7 tours en
alternance, charge 4,1 ; ms depuis la création du processus :

| Étape | 0.12 | aujourd'hui | écart |
| --- | --- | --- | --- |
| coque chargée | 403 (383–447) | 427 (404–458) | **+24** |
| dont : page de la coque, navigation → `load` | 95,5 (88–110) | 118 (104–136) | +22 |
| coque chargée → réserve demandée | −1,1 | 15,4 (11–21) | **+16,5** (attente voulue du premier rendu) |
| demandée → première vue créée | 14,5 (3,9–18,8) | 2,3 | **−12** (ne passe plus derrière ce rendu) |
| vue créée → vue chargée (trois vues de front) | 46,9 (42–64) | 58,3 (55–64) | **+11** |
| dont : scripts et styles de la page de la vue | 37,3 | 45,4 | +8 |
| vue chargée → vue modale prête | 3,9 | 4,2 | 0 |
| **vue modale prête** | 460 (448–511) | 506 (486–544) | **+46** |

Dans la page d'une vue (instrumentation provisoire, non gardée ; 5 tours, charge 4,9) : le
script de préchargement ne démarre que 26 ms après le début de la navigation (trois vues se
partagent le fil de la coque) ; l'appel synchrone qui rapporte les textes dure 4,1 ms, leur
recopie par le pont 4,2 ms ; feuilles de style puis scripts 7 ms (`emojis.js` 0,6 ms,
`overlay.js` 0,2 ms d'exécution : c'est leur chargement qui compte, pas leur exécution).

Deux essais, mesurés en alternance contre `main`, non gardés :

| Essai | « vue modale prête » | reste | Verdict |
| --- | --- | --- | --- |
| n'envoyer que le français aux vues (9 tours, charge 5,5) | 516 → 511 (492–623) | barre rendue 463 → 447 (422–528) | dans le bruit ; change le pont de l'interface |
| une seule vue demandée d'abord, les autres une fois la vue modale née (7 tours, charge 5,1) | coque chargée → prête **84,5 → 48,6** (46–57) | dernière vue de la réserve prête au même moment (95 → 94 ms après la coque) | gain réel sur l'étape… |
| le même, 200 onglets / 13 Espaces / 10 profils (9 tours, charge 5,6) | 548 → **506** (0.12 : 467) | première barre de commande **24 → 55 ms** | … mais déplacé : la barre demandée à cet instant attend les deux autres vues |

Le second essai ramène l'étape sous celle de la 0.12, mais la somme « vue modale prête +
première barre » passe de 572 à 561 ms : rien de plus tôt pour la personne, et rien du tout pour
qui n'appuie pas sur ⌘T dans la demi-seconde du lancement. Retiré.

## 9. Animations des vues natives (ANIM)

### Bascule de la barre latérale

`animateTo` (`window.js`) déplace la page par `setBounds` sur un `setInterval(…, 8)`.

| Mesure | Commit `9988bbf` (180 ms) | Dossier de travail (ouverture 50 ms, fermeture immédiate) |
| --- | --- | --- |
| Intervalle réel du minuteur de 8 ms | **10,1 ms** médian (8,2–11,1 ; 250 tics) | idem |
| Appels à `layout()` par animation | 18–19 | 6 (ouverture), 1 (fermeture) |
| Positions distinctes de la page | 16–17 pour **22 images** d'écran | 5–6 pour 6 images |
| Écart maximal entre deux positions | 12 à 21 ms (soit 1,5 à 2,5 images) | 12 à 17 ms |
| Coût de `layout()` côté principal | 0,09 ms médian, 1,6–2,0 ms au total | 0,3 ms, 0,7 ms au total |
| Remises en page de la page | 1 (la largeur ne change qu'une fois : bien vu) | 1 |
| Durée de cette remise en page | 3 ms (page légère), **20–24 ms** (page lourde) | idem |
| Images de la page > 25 ms pendant l'animation | 0 (légère), **1** (lourde, 32–38 ms) | 1 (lourde, 37–40 ms) |
| Images de la coque (transition CSS) | 22 présentées, 0 perdue, 8,33 ms | 6–7, 0 perdue |

Deux défauts mesurés : (1) le minuteur du processus principal bat à ≈ 100 Hz avec de la gigue,
alors que l'écran et la transition CSS de la barre sont à 120 Hz réguliers : la page et la
barre n'avancent pas au même pas, et une image sur cinq répète la position précédente ;
(2) sur une page lourde, l'unique remise en page (20–24 ms) tombe **au début** du mouvement et
fait sauter deux ou trois images au moment le plus visible.

### Essai : animation native de `View.setBounds`

`electron.d.ts` (44.7.0) déclare `setBounds(bounds: Rectangle, options?: BoundsOptions)` avec
`animate?: boolean | { duration?: number (250 par défaut), easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' }`.
Essai sur la vue d'un onglet (page lourde), 6 passes :

| Mesure | Déplacement seul (x), 180 ms `ease-out` | Déplacement + largeur |
| --- | --- | --- |
| Tics du processus principal | **0** (un seul appel) | 0 |
| Événements `resize` reçus par la page | **0** | 13–18 |
| Remises en page de la page | **0** (0 ms) | 1 (21–28 ms) |
| Images de la page > 12 ms | 0–1 | 1–2 (jusqu'à 42 ms) |
| `getBounds()` pendant l'animation | renvoie l'ancienne position jusqu'à la fin | idem |
| Événements `bounds-changed` | 1 | 1–2 |

Vérifié à l'œil par une capture de la fenêtre prise au milieu d'une animation de 900 ms : la
page est bien à une position intermédiaire. L'animation est faite par le système (Core
Animation), au rythme de l'écran, sans passer par le JavaScript ni redessiner la page.

### Autres gestes

| Geste | Mesure | Valeur |
| --- | --- | --- |
| Glisser la séparation de deux pages lourdes, un `resizeSplit` par image | appels en 1,2 s | 106 (`layout` 0,29 ms + `sendState` 0,15 ms chacun) |
| | remises en page réellement faites par chaque page | 32 (le moteur regroupe), 25–31 ms chacune, 790–800 ms au total |
| | images présentées / perdues par page | 64 / 105 |
| | images > 25 ms | 24–29 par page |
| Même geste limité à 30 appels par seconde | remises en page / images présentées | 34 / 68 (identique à l'œil, 3 fois moins d'appels) |
| Même geste limité à 15 par seconde | remises en page / images présentées | 18 / 36 (moitié moins de travail, mouvement saccadé) |
| Changement d'Espace | synchrone, puis image de la page | 3–4 ms, +2 ms |
| Première ouverture d'une vue d'appoint | toast / recherche / aperçu | 94–98 / 82–94 / 89–90 ms |

### Réalisé (branche `animations`, 8 oct.) : faits relevés et mesures avant / après

Ce que fait réellement `View.setBounds(rect, { animate })` dans Electron 44.7 sur macOS
(sondes : capture de la fenêtre pendant des animations de 1 à 2 s, lecture de `getBounds()`
toutes les 20 ms, compteur de `resize` et traçage `devtools.timeline` dans la page) :

| Question | Relevé |
| --- | --- |
| Options | `animate: true` (250 ms, `linear`) ou `{ duration, easing }` ; quatre courbes seulement (`linear`, `ease-in`, `ease-out`, `ease-in-out`), **pas de ressort** ; une durée de 0 ou 1 ms est acceptée et prend effet à l'image suivante |
| `getBounds()` pendant le trajet | rend l'**ancien** rectangle jusqu'à la fin, puis la cible |
| Fin du trajet | un événement `bounds-changed` sur la vue, à la durée demandée (1008 ms pour 1000, 257 pour 250, 52 à 60 pour 50) |
| Nouvel appel animé pendant le trajet | repart de la **position affichée** vers la nouvelle cible : interruption propre, cotes justes à l'arrivée |
| Appel **non** animé pendant le trajet | la vue saute bien à la nouvelle place, mais `getBounds()` reste ensuite sur la cible de l'animation interrompue (cote fausse) : à ne jamais faire |
| Largeur ou hauteur animée | la page ne reçoit qu'**un** `resize` et ne fait qu'**une** remise en page : au départ si elle grandit, à l'arrivée si elle rétrécit ; entre-temps son image est rognée par le cadre qui bouge (elle n'est ni étirée ni redessinée). Le relevé « 13 à 18 `resize` » du tableau ci-dessus ne s'est pas reproduit |
| Vue retirée puis rattachée pendant le trajet | à sa cible, cotes justes |
| Windows | même comportement, relevé sur la machine d'intégration (Windows Server, où « Réduire les animations » est actif : les essais imposent le chemin animé) : trajet de 400 ms, `getBounds()` encore à l'ancienne cote à 200 ms, arrivée signalée à 411 ms (73 ms pour 50 demandées), cotes finales exactes après interruptions, redimensionnement et vue scindée. Le rendu à l'œil sur un vrai poste Windows reste à voir ; si l'option était refusée, la vue serait posée directement |

D'où `place(vue, rect, ms)` dans `window.js` : un seul appel animé par vue ; tant qu'une vue est
en vol, toute nouvelle cible lui est donnée par un appel animé sur le temps qu'il lui reste.

Mesures (même scénario lancé sur le commit `a9ec705` puis sur la branche ; page de 6 000
éléments ; médianes de 6 passes, [min–max]) :

| Retour de la barre latérale (⌘S) | Avant (`setInterval` 8 ms) | Après (animation du système) |
| --- | --- | --- |
| Appels à `setBounds` sur la page | 7 | **1** |
| Tours du fil principal consacrés au mouvement | 7 (dernier à 56 ms) | **1** (le premier ; plus aucun ensuite) |
| Appels à `layout()` | 7 | 1 |
| Positions de la page | 6 calculées en JavaScript, à ≈ 100 Hz | toutes les images de l'écran, par le système |
| `resize` reçus par la page | 1 | 1 |
| Remises en page de la page (trace `Layout`) | 1 (2,8 ms) | 1 (2,9 ms), à l'arrivée |
| Écart maximal entre deux images de la page | 9,4 ms [9,3–13,3] | 11,9 ms [9,3–15,7] (bruit de la machine, chargée) |

| Autres mouvements | Avant | Après |
| --- | --- | --- |
| Aperçu : ouverture | la page est posée d'un coup, voile en fondu de 160 ms | la carte grandit depuis le lien en 200 ms (`ease-out`), 1 appel animé, 0 `resize` pendant le trajet ; page dessous : écart maximal 12,0 ms |
| Aperçu : fermeture | retrait immédiat | la carte se réduit vers le lien en 150 ms (`ease-in`), 1 appel animé ; écart maximal de ses images 11,7 ms |
| Aperçu → onglet (⌘O) | remplacement immédiat | la carte s'étend en 220 ms jusqu'à la place de la page, l'ancienne page reste dessous pendant ce temps |
| Changement d'Espace (raccourci), images de la coque en 450 ms | 57, écart max 9,5 ms, 0 image lente | 57, écart max 11,8 ms, 0 image lente |
| Changement d'Espace : rendu de la liste | aussitôt (≈ 60 ms), puis glissé-fondu de 36 px | différé à l'arrivée (≈ 265 ms) : pendant le glissement, rien n'est redessiné |
| `sendState` (3 Espaces × 40 onglets) | 0,021 ms, 12,5 ko | 0,046 ms, 36,6 ko (listes des deux Espaces voisins) |

Essais : 27 vérifications de bout en bout ajoutées (211 sur macOS, 210 sur Windows), 11 vérifications
d'interface ajoutées (172), toutes vertes sur les deux systèmes.

Ce qui reste à régler la main sur le pavé tactile : seuil (40 % de la largeur, 110 px au
plus), vitesse d'un geste vif (1,5 px/ms), délai « doigts levés » (90 ms sans événement),
raideur de l'élastique. Ni le DOM ni `input-event` ne disent quand les doigts quittent le pavé
quand une inertie suit ; les constantes sont regroupées dans `PAGER` (`shell.js`).

### Points

- ✅ **ANIM-1 — Bascule de la barre latérale par l'animation native de `setBounds`.** *(fait le 8 oct., branche animations)*
  *Problème* : minuteur à 100 Hz irrégulier dans le processus principal, désynchronisé de la
  transition CSS de la barre ; à la merci de tout blocage de ce fil (9 à 12 ms à chaque
  sauvegarde, 14 ms à chaque frappe).
  *Changement* (`animateTo`) : calculer le rectangle final et faire **un** appel
  `rt.view.setBounds(final, { animate: { duration: DUR, easing: 'ease-out' } })` pour chaque
  vue affichée ; garder la même durée et la même courbe côté CSS (`#sidebar { transition: transform <DUR>ms ease-out }`)
  pour que la barre et la page partent et arrivent ensemble. Ordre pour ne déclencher qu'une
  remise en page, et **hors du mouvement** : à l'ouverture, animer x seul (largeur inchangée,
  la page déborde à droite sous le bord de la fenêtre), puis fixer la largeur à la fin (`setTimeout(DUR)`) ;
  à la fermeture, élargir d'abord, puis animer x. Ne plus relire `getBounds()` pendant
  l'animation (valeur périmée, mesuré) : garder la cible dans `this`.
  *Gain mesuré* : 0 tic du fil principal au lieu de 6 à 19, 0 remise en page pendant le
  mouvement au lieu d'une de 20–24 ms, cadence de l'écran garantie.
  *Risque* : moyen — courbes limitées à quatre (pas de ressort : voir ANIM-4) ; les vues
  d'appoint ancrées à la page (recherche, statut) doivent suivre ; vérifier la vue scindée
  (plusieurs vues animées ensemble) et Windows (l'option est-elle animée hors macOS ? **à mesurer**).
  *Effort* : M.
  *Fait* : `place()` et `animateTo` (`window.js`) ; un seul appel animé de 50 ms par page
  (position et largeur ensemble : la page n'est remise en page qu'à l'arrivée, mesuré), plus
  aucun minuteur ; `#sidebar` suit avec la même durée et la même courbe (`--ease-out`).
  Interruptions, fenêtre redimensionnée en plein mouvement, vue scindée et place réservée à
  droite vérifiées par les essais de bout en bout (cotes exactes à l'arrivée). « Réduire les
  animations » coupe aussi ces mouvements (`motion()`).

- ➖ **ANIM-2 — À défaut d'ANIM-1 : caler le minuteur sur l'écran.** *(sans objet : ANIM-1 est fait, plus aucun minuteur ne déplace les vues)*
  *Changement* : remplacer `setInterval(…, 8)` par un pas calculé sur
  `1000 / screen.getDisplayMatching(win.getBounds()).displayFrequency`, en boucle `setTimeout`
  corrigée de la dérive (viser l'instant de l'image suivante, pas « dans 8 ms »). *Gain* :
  positions alignées sur les images (22 au lieu de 18 sur 180 ms). *Limite* : reste sensible
  aux blocages du fil principal. *Effort* : S.

- ✅ **ANIM-3 — Glisser la séparation : un `resizeSplit` par image d'écran au plus, sans `sendState`.** *(fait le 8 oct.)*
  *Problème* : 106 appels pour 32 remises en page effectives ; chaque appel refait `layout()`
  de toute la fenêtre et renvoie l'état complet à la coque. *Changement* : dans `resizeSplit`,
  ne déplacer que les deux vues concernées (`setBounds` direct), sans `sendState` (la poignée
  est déjà déplacée localement par `shell.js`), et ne garder qu'un appel par tranche de 16 ms ;
  `layout()` + `sendState()` complets au relâchement. *Gain mesuré* : 3 fois moins d'appels
  pour le même rendu (68 images contre 64). *Risque* : faible. *Effort* : S.

- ✅ **ANIM-4 — Courbes de ressort pour tout ce qui est en CSS.** *(fait le 8 oct., branche animations)*
  *Constat* : toute l'interface utilise une seule courbe, `--ease: cubic-bezier(0.33, 1, 0.68, 1)`
  (décélération simple, sans rebond). Chromium accepte `linear()` depuis la version 113 (Orbe
  est en 152), ce qui permet d'écrire un vrai ressort en CSS.
  *Changement* : ajouter dans `base.css` deux variables, calculées une fois par un petit script
  (oscillateur amorti échantillonné en 30 à 40 points) :
  `--spring-snappy` (amortissement critique, aucun dépassement, ≈ 250 ms perçus) pour les
  panneaux et les lignes ; `--spring-bouncy` (léger dépassement, 5 à 8 %) pour les seuls
  éléments ludiques : tuile de favori pressée, icône d'Espace, apparition de la bascule ⌃Tab.
  Points de départ usuels sur macOS : `response` 0,3 à 0,4 s et `dampingFraction` 0,8 à 1 pour
  l'interface ; la valeur par défaut la plus citée pour `.spring()` de SwiftUI est
  `response: 0,55, dampingFraction: 0,825` (sources en fin de document ; l'amortissement n'est
  pas confirmé par la documentation d'Apple). Conversion : raideur = (2π / response)²,
  amortissement = 4π × dampingFraction / response, masse 1.
  *Gain* : agrément (non mesurable en millisecondes) ; coût nul (les transitions `transform` et
  `opacity` sont composées hors du fil principal). *Risque* : affaire de goût — à régler à l'œil,
  en respectant `prefers-reduced-motion` (ANIM-7). *Effort* : S.
  *Fait* : trois jetons dans `base.css`, calculés par `scripts/make-springs.js` (durée + courbe
  `linear()` de 25 points) : `--spring-snappy` (réponse 0,2 s, amortissement 1, 240 ms),
  `--spring-smooth` (0,3 s, 1, 360 ms), `--spring-bouncy` (0,3 s, 0,7, dépassement 4,6 %,
  340 ms) ; plus `--ease-out` / `--ease-in` (les courbes du système, pour ce qui accompagne une
  vue native) et `--press` (enfoncement, 80 ms). Appliqués aux lignes (entrée), tuiles, boutons,
  pastilles d'Espace, chevron des dossiers, barre flottante, barre de commande ancrée, bascule
  ⌃Tab, éditeur de thème, messages. Le glissement entre Espaces calcule le même ressort à la
  volée, avec la vitesse des doigts.

- ✅ **ANIM-5 — Aperçu (Peek) : faire entrer la page au lieu de la poser.** *(fait le 8 oct., branche animations)*
  *Constat* : `openPeek` ajoute la vue à sa taille finale d'un coup ; seul le voile s'anime
  (160 ms). *Changement* : poser la vue 24 points plus bas et légèrement réduite, puis
  `setBounds(final, { animate: { duration: 200, easing: 'ease-out' } })` ; à la fermeture,
  l'inverse sur 120 ms avant `close()`. Animer la position plutôt que la taille pour éviter les
  remises en page (mesuré : 13 à 18 `resize` quand la largeur est animée). *Gain* : agrément ;
  **à mesurer** : images perdues pendant l'entrée sur une page réelle. *Effort* : S.
  *Fait, autrement* : la taille peut être animée sans coût (une seule remise en page, mesuré) ;
  la carte grandit donc depuis le lien cliqué (30 % de sa taille, 200 ms), se réduit vers lui à
  la fermeture (150 ms) et s'étend jusqu'à la place de la page pour ⌘O (220 ms). Fond de la carte
  aux couleurs du thème sombre jusqu'à `dom-ready` (pas d'éclair blanc).

- ✅ **ANIM-6 — Apparition de la barre latérale au démarrage.** *(fait le 8 oct., branche animations)*
  Si DEM-1 est fait, la fenêtre paraît 80 ms avant la barre : faire entrer `#sidebar` en fondu
  (`opacity` 0 → 1, 80–100 ms) au premier rendu plutôt que de la laisser surgir. *Effort* : S.
  *Fait* : fondu de 90 ms au premier rendu (`body.ready`), sans glissement.

- ✅ **ANIM-7 — Respecter « Réduire les animations ».** *(fait le 8 oct.)*
  *Constat* : aucun `@media (prefers-reduced-motion: reduce)` dans `shell.css` ni `overlay.css` ;
  `animateTo` ne consulte pas le réglage du système. *Changement* : en CSS, ramener durées et
  animations à 0 sous cette requête ; côté principal, lire
  `systemPreferences.getAnimationSettings().prefersReducedMotion` (présent dans `electron.d.ts`)
  et passer `DUR` à 0. *Risque* : nul. *Effort* : S.

- ✅ **ANIM-8 — Changement d'Espace : faire suivre le doigt jusqu'au bout.** *(fait le 8 oct. pour la barre latérale ; la page ne glisse pas)*
  *Constat* : le balayage à deux doigts déplace la liste (`#scroll`) puis, passé 70 px, change
  d'Espace d'un coup : la page, elle, est remplacée sans transition (3–4 ms). *Changement* :
  pendant le balayage, déplacer aussi la vue de la page de la même fraction (`setBounds` sur x,
  un appel par image au plus) ; au seuil, terminer par `setBounds(…, { animate })` et faire
  entrer la page du nouvel Espace par le côté opposé. *Coût mesuré* d'un `setBounds` sur x seul :
  aucune remise en page de la page. *Risque* : moyen (deux vues à l'écran pendant 150 ms ;
  l'onglet du nouvel Espace peut être en veille : montrer alors sa vignette ou un fond).
  *Effort* : M à L. À faire après ANIM-1.
  *Fait pour la barre latérale* : deux listes côte à côte dans `#pager`, qui suivent les doigts
  (1 px pour 1 px), teinte des deux Espaces fondue au même pas, changement au seuil ou sur un
  geste vif, retour au ressort, élastique au bout de la rangée ; même glissement pour un clic ou
  un raccourci. Animation composée (Web Animations), rien n'est redessiné pendant le trajet.
  *Non fait* : la page, elle, change d'un coup au moment où le geste est validé (elle ne glisse pas).

## 10. Design et sensations (DESIGN)

Ce chapitre est de la recherche : ce qu'Electron 44 expose réellement (relevé dans
`electron.d.ts`), ce qui a été mesuré, et ce qui reste affaire de goût.

### Ce que la machine sait faire

| Sujet | Relevé |
| --- | --- |
| Cadence | écran à 120 Hz ; la coque et les pages rendent déjà à 8,33 ms (mesuré par traçage) : **aucun drapeau à ajouter** pour le 120 Hz |
| Drapeaux graphiques | les processus de rendu sont déjà lancés avec `--enable-zero-copy`, `--num-raster-threads=4`, `--enable-gpu-memory-buffer-compositor-resources` (lu sur la ligne de commande des processus) : rien d'évident à activer en plus ; tout autre drapeau est **à mesurer** avant emploi |
| Matériaux `vibrancy` (macOS) | `titlebar`, `selection`, `menu`, `popover`, `sidebar` (utilisé), `header`, `sheet`, `window`, `hud`, `fullscreen-ui`, `tooltip`, `content`, `under-window`, `under-page`. Aucun matériau « verre liquide » de macOS 26 n'est exposé |
| `visualEffectState` | `followWindow` (utilisé), `active`, `inactive` |
| Flou par vue | `View.setBackgroundBlur(rayon)` existe (demande une couleur de fond avec transparence) : un flou natif derrière une vue, sans `backdrop-filter` |
| Animation de vue | `View.setBounds(rect, { animate })` (voir ANIM-1) ; `View.setBorderRadius` |
| Gestes | fenêtre : `swipe` (balayage à trois doigts, ancien style : n'est émis que si le réglage système « Balayer entre les pages » inclut trois doigts) et `rotate-gesture` ; pages : événement `input-event` de `webContents` avec les types `gestureScrollBegin/Update/End`, `gesturePinchBegin/Update/End`, `gestureFlingStart`, `mouseWheel`. Les anciens `scroll-touch-begin/end` **n'existent plus** dans cette version |
| Retour haptique | **aucune** interface dans Electron 44 (`NSHapticFeedbackManager` n'est pas exposé) ; il faut un module natif ou un petit exécutable d'appoint |
| Réglages d'accessibilité | `systemPreferences.getAnimationSettings()` (`prefersReducedMotion`, etc.), `accessibilityDisplayShouldReduceTransparency` |

### Points

- ✅ **DESIGN-1 — Retour au glisser : balayage de page qui suit le doigt.** *(fait : `src/preload/swipe.js` et `src/main/swipe.js` ; une pastille suit les doigts au bord de la page, navigation au seuil de 130 px ou sur un geste vif ; essais d'interface « Mouvements » : 120 images/s (médiane 8,3 ms, 95e centile 10,2 ms). La détection passe par la molette vue par la page (les événements `gestureScroll*` ne sont pas nécessaires). Seuils à régler main sur le pavé)*
  *Constat* : précédent / suivant se font au clavier ou au bouton ; rien ne suit le doigt sur la
  page. *Changement* : écouter `input-event` sur la vue de l'onglet actif ; sur
  `gestureScrollBegin` puis des `gestureScrollUpdate` majoritairement horizontaux alors que la
  page est en butée (elle n'a pas consommé le défilement : à détecter par un court script de
  page ou par `overscroll`), afficher une pastille « ← » qui grandit avec le déplacement ;
  au-delà du seuil, `navigationHistory.goBack()`. *À mesurer d'abord* : que ces événements sont
  bien émis sur macOS pour un balayage à deux doigts (présents dans le fichier de types, non
  essayés pendant cette séance). *Effort* : M.

- ✅ **DESIGN-2 — Rebond élastique de la barre latérale.** *(fait : rebond imité (`BOUNCE` dans `shell.js`, propriété `translate`, `overscroll-behavior: none`) ; médiane 8,3 ms par image, pas de mise en page par image ; essai « rebond élastique »)*
  *À vérifier à l'œil* : `#scroll` est un bloc défilant interne ; selon la version de Chromium
  l'élastique de macOS ne s'applique qu'au défilement principal du document. Si la liste bute
  sèchement, faire de `#scroll` le défilement principal de la coque n'est pas possible (la
  coque couvre la fenêtre) ; l'alternative est un rebond imité en CSS (`overscroll-behavior: contain`
  plus une translation amortie pilotée par `wheel`), comme le fait déjà le balayage d'Espace.
  *Effort* : S pour vérifier, M pour imiter.

- ⬜ **DESIGN-3 — Retour haptique, sans module natif : écarté pour l'instant.**
  Electron n'expose rien. Deux voies existent : un module natif (contraire au choix « aucune
  dépendance » du projet) ou un exécutable Swift d'une dizaine de lignes appelant
  `NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)`, lancé
  par `child_process` — mais le lancement d'un processus prend des dizaines de millisecondes,
  trop tard pour accompagner un geste, et le retour n'est produit que si un doigt est posé sur
  le pavé. À reprendre seulement si un module natif est accepté. État : ➖ écarté (avec la raison).

- ✅ **DESIGN-4 — Sons d'interface discrets, originaux.** *(fait : sept sons synthétisés par `scripts/make-sounds.js` (capture, tab, close, space, pin, unpin, error ; 0,14 à 0,42 s, 12 à 36 Ko, même niveau moyen, crête à −6 dB au plus), déduits des changements d'état après un geste (`src/main/sounds.js`) ; réglages « Sons des gestes » (coupé par défaut) et volume ; muets pendant les essais. Timbre à juger à l'oreille)*
  *Droit* : un son que l'on synthétise soi-même est une création originale dont on détient les
  droits ; il ne faut ni reprendre ni imiter de près les sons d'Arc ou de macOS, ni partir
  d'une banque sans licence claire (préférer CC0 ou création propre). Les fichiers doivent être
  publiés sous la licence du projet (MIT) avec leur source (le script de synthèse).
  *Déjà commencé pendant la séance* (commit `014fab0`) : un son de capture original, fabriqué
  par `scripts/make-sounds.js` (`src/renderer/sons/capture.wav`, 37 Ko) et un réglage « Sons » ;
  ce point couvre la suite (autres gestes) et la mesure du coût.
  *Technique la moins chère* : les synthétiser à la volée dans la coque avec l'API Web Audio
  (un oscillateur + une enveloppe de 40 à 120 ms, aucun fichier), contexte audio créé au premier
  son puis suspendu après 5 s de silence. *À mesurer* : mémoire du service audio de Chromium une
  fois lancé (processus utilitaire supplémentaire) et délai du premier son. Désactivés par
  défaut, réglage dans les préférences, coupés par le mode silencieux du système si possible.
  *Effort* : S pour un prototype.

- ➖ **DESIGN-5 — Panneaux flottants : flou natif plutôt que `backdrop-filter`.** *(mesuré : avec ou sans `backdrop-filter`, la barre de commande tient 120 images/s (médiane 8,3 ms, 95e centile 10,3 à 10,6 ms dans les deux cas) et le filtre ne montre rien, faute de contenu derrière lui dans la vue ; il est retiré (panneaux, barre flottante, zone de dépôt). `View.setBackgroundBlur()` existe dans Electron 44 mais demande des vues réduites au panneau et un fond plus transparent : choix à faire à l'œil, non fait ; **décision du 9 octobre 2026 : pas de flou natif.** Mesuré sur la barre de recherche (vue de 360 × 50 pt posée sur une page animée, session ouverte, deux passes) : sans flou, page et vue à 8,3 ms de médiane et 10,3 ms au 95e centile ; avec `setBackgroundBlur(30)` et un fond à 50 %, 8,3 ms et 10,2 à 10,3 ms — aucun coût mesurable, le flou n'est donc pas écarté pour sa lenteur. Il l'est pour son rendu : il remplit tout le rectangle de la vue, donc aussi la marge où le panneau dessine ses coins arrondis et son ombre (un cadre flou autour du panneau) ; l'éviter demande des vues rognées au panneau (`setBorderRadius`) et de renoncer à la grande ombre portée de la barre de commande, relevée sur Arc (M-9), dont les panneaux sont d'ailleurs presque opaques. De plus `capturePage` ne rend que la couche de la vue (le flou est composé par le système) : les deux captures prises ne montrent que le fond plus clair, la comparaison à l'œil reste impossible sans capture d'écran du bureau. À rouvrir seulement si le propriétaire veut cet effet après l'avoir vu)*
  *Constat* : `.panel` (barre de commande, recherche, thème) utilise
  `backdrop-filter: blur(30px) saturate(1.6)` dans une vue transparente de la taille de la
  fenêtre. Un `backdrop-filter` ne floute que ce que la **même** vue dessine derrière lui ; ici
  il n'y a rien derrière dans la vue (la page est une autre vue native) : l'effet visible vient
  surtout du fond `--panel` à 94–95 % d'opacité. *À mesurer* : coût en images de ce filtre à
  l'ouverture de la barre de commande, et rendu avec `View.setBackgroundBlur()` sur une vue
  réduite au rectangle du panneau (ce qui flouterait vraiment la page dessous).
  *Gain attendu* : un vrai effet de verre, et une vue modale plus petite à composer. *Risque* :
  la vue modale couvre aujourd'hui toute la fenêtre pour capter le clic « en dehors » : il
  faudrait le capter autrement. *Effort* : M.

- ✅ **DESIGN-6 — Typographie.** *(fait : `font-optical-sizing: auto`, `font-kerning: normal`, `text-rendering: auto`, chiffres alignés dans les messages ; essai « typographie ». Rendu à juger à l'œil)*
  *Constat* : `font: 13px/1.35 -apple-system`, lignes d'onglet en 14 px / 500, `letter-spacing: -0.005em`,
  `-webkit-font-smoothing: antialiased`. C'est cohérent avec macOS. Pistes à juger à l'œil,
  sans coût : `font-optical-sizing: auto` et `font-feature-settings: 'ss01', 'cv11'` selon les
  glyphes voulus pour SF ; `font-variant-numeric: tabular-nums` déjà posé sur les compteurs
  (à étendre au pourcentage de zoom du toast) ; `text-rendering: optimizeLegibility` à éviter
  sur les longues listes (coût de mise en page). *Effort* : S.

- ✅ **DESIGN-7 — États pressés et survols plus vivants.** *(fait le 8 oct., branche animations)*
  *Constat* : seules les tuiles de favoris et les boutons d'aperçu ont un état pressé
  (`transform: scale(0.96)`) ; les lignes d'onglet n'en ont pas, et leur survol change en 100 ms
  linéaires. *Changement* : `.row:active { transform: scale(0.985); }` avec `--spring-snappy`
  (ANIM-4) ; sur le survol, entrée immédiate (0 ms) et sortie en 150 ms, comme les listes de
  macOS. *Coût mesuré du survol aujourd'hui* : 0,13 ms de style par déplacement, 0 image perdue
  sur 252 : de la marge. *Effort* : S.
  *Fait* : lignes (0,985), tuiles (0,95), boutons ronds, pastille d'adresse, bouclier, pastilles
  d'Espace, boutons des extensions, du lecteur, de l'aperçu, de la recherche et de l'éditeur de
  thème ; enfoncement en 80 ms, relâchement au ressort ; survol des lignes immédiat à l'entrée,
  150 ms à la sortie. Vérifié à la souris (essai d'interface « Mise en page »).

- ✅ **DESIGN-8 — Fermeture d'un onglet : glissement des lignes suivantes.** *(fait : la hauteur n'est plus animée ; la ligne s'efface sur place, hors du flux, et les suivantes glissent par transformation (`flip` dans `shell.js`, ressort `--spring-snappy`) ; une mise en page par changement, 120 images/s pendant le glissement ; essai « fermer un onglet »)*
  *Constat* : `row-out` anime la hauteur de la ligne supprimée (`height` → 0, 150 ms), ce qui
  relance une mise en page par image pour toute la liste. Mesuré : la mise en page de la liste
  coûte 0,24 à 0,51 ms, donc cela tient à 120 Hz même à 1 000 onglets ; rien à corriger pour la
  vitesse. Pour l'agrément, passer la courbe à `--spring-snappy`. *Effort* : S.

- ➖ **DESIGN-9 — `will-change: transform` permanent sur `#sidebar`.** *(mesuré, sans gain : mémoire du processus graphique 83 à 89 Mo avec comme sans `will-change`, mêmes 12 couches de même surface ; la propriété est gardée)*
  *Constat* : la barre garde sa propre couche graphique en permanence pour une animation qui
  dure 50 à 180 ms. *À mesurer* : mémoire graphique avec et sans (le processus graphique oscille
  déjà entre 160 et 183 Mo sans cause identifiée) ; poser la propriété au début de la bascule et
  la retirer à la fin si le gain est réel. *Effort* : S.

## 11. Ce qui va déjà bien (à ne pas « optimiser »)

Mesuré, et à laisser tel quel :

- le rendu de la barre latérale (0,04 à 0,38 ms, 120 images par seconde jusqu'à 1 000 onglets) ;
- le changement d'onglet (une image) et d'Espace (une image) ;
- ⌘T (3 ms) ;
- l'idée de ne changer la largeur des pages qu'une fois pendant la bascule de la barre ;
- les onglets restaurés chargés seulement quand on les ouvre (un seul processus d'onglet au démarrage, quel que soit le nombre d'onglets) ;
- la liste du bloqueur chargée 1,2 s après le démarrage (6 ms) et la décision à 0,25 µs ;
- les scripts de préchargement sur les pages sans cadre (0,5 ms) ;
- les `require` du processus principal (15 ms pour tout Orbe en 0.12 ; 20 à 28 ms en 0.15.1 après DEM-10, voir 8 ter) ;
- les minuteries périodiques : aucune ne tourne sans raison (tableau en 8 ter) ;
- l'état envoyé à la coque (12 Ko et 0,12 ms à 200 onglets, aucun envoi au repos).

## 12. Les 20 premiers à faire

Classés par gain rapporté à l'effort ; les gains sont ceux mesurés plus haut.

| Rang | Point | Gain mesuré | Effort | Risque |
| --- | --- | --- | --- | --- |
| 1 | **PERF-4** index de recherche normalisé | frappe : 14–15 ms de blocage → ≈ 3 ms (boucle seule : 7,2 → 1,3 ms) | S | faible |
| 2 | **DEM-1** afficher la fenêtre tout de suite | fenêtre −60 ms à chaud, −104 ms refroidi ; première page −62 ms | S | faible |
| 3 | **MEM-1** une seule interface, un seul processus | ≈ −100 Mo ; première ouverture d'une vue 80–100 → 7–15 ms | M | moyen |
| 4 | **PERF-1** historique en journal à part | blocage par sauvegarde 9–12 → 0,2–0,8 ms ; 4,1–6,4 Mo → 0,4 Mo par écriture ; démarrage −17 ms sur vieux profil | M | moyen |
| 5 | **ANIM-1** bascule par animation native | 0 tic du fil principal, 0 remise en page pendant le mouvement, cadence de l'écran | M | moyen |
| 6 | **PERF-3** plus de copie du fichier à chaque écriture | moitié des octets écrits | S | faible |
| 7 | **PERF-2** sauvegarde paresseuse pour titres et icônes | écritures ÷ 2 à 3 en navigation | S | faible |
| 8 | **ANIM-3** glisser de séparation allégé | 3 fois moins d'appels pour le même rendu | S | faible |
| 9 | **PERF-10** `ext.js` hors des pages web | ≈ −2 ms par page à cadres | S | faible |
| 10 | **DEM-2 + DEM-3** fichiers d'interface en mémoire, modale après la coque | avec DEM-1, refroidi : barre −119 ms, page −176 ms | S | faible |
| 11 | **ANIM-7** « Réduire les animations » | accessibilité | S | nul |
| 12 | **ANIM-4** courbes de ressort en CSS (`linear()`) | agrément, coût nul | S | goût |
| 13 | **PERF-5** recherche incrémentale | frappes suivantes < 1 ms (à mesurer) | S | faible |
| 14 | **MEM-3** veille selon la mémoire | jusqu'à −2,2 Go à 30 sites | M | moyen |
| 15 | **PERF-11** `page.js` inerte sans champ de mot de passe | ≈ −3 ms par page à cadres ; plus d'écouteur de défilement | M | moyen |
| 16 | **DEM-5** rien pour les extensions s'il n'y en a pas | 70–140 ms d'activité évitée (à mesurer sur la page) | S | faible |
| 17 | **PERF-24** icônes mémorisées par hôte | moins de requêtes, défilement allégé | S | faible |
| 18 | **PERF-8** pré-réveil de l'onglet survolé | −150 à −300 ms ressentis (à mesurer) | S | faible |
| 19 | **DESIGN-7 + ANIM-6** états pressés, entrée de la barre | agrément | S | goût |
| 20 | **MEM-4** processus survivants à la veille | jusqu'à 249 Mo (diagnostic d'abord) | S | faible |

Ensuite, par ordre d'intérêt : ANIM-5 (entrée de l'aperçu), ANIM-8 (Espace qui suit le doigt),
DESIGN-1 (balayage de page), DESIGN-5 (flou natif), PERF-13 (bloqueur sans JavaScript),
PERF-22 (état partiel), DESIGN-4 (sons), MEM-6 (limite de processus), DEM-8 (mesure du paquet).

## 13. Sources

Relevés locaux : `~/.orbe-dev/node_modules/electron/electron.d.ts` (44.7.0) pour toutes les
interfaces citées (`View.setBounds` et `BoundsOptions`, `setBackgroundBlur`, `vibrancy`,
`visualEffectState`, `input-event`, `swipe`, `rotate-gesture`, `getAnimationSettings`,
`v8CacheOptions`, `registerPreloadScript`).

En ligne (consultées le 8 octobre 2026) :

- `linear()` en CSS, pris en charge depuis Chromium 113, et générateur de courbes de ressort :
  <https://developer.chrome.com/docs/css-ui/css-linear-easing-function>
- Ressorts de SwiftUI (signification de `response` et `dampingFraction`, valeurs usuelles) :
  <https://www.createwithswift.com/understanding-spring-animations-in-swiftui/> et
  <https://developer.apple.com/documentation/swiftui/spring>
- Retour haptique sur macOS : <https://developer.apple.com/documentation/appkit/nshapticfeedbackmanager>
  (limite « un doigt doit toucher le pavé » : <https://developer.apple.com/forums/thread/70605>)
