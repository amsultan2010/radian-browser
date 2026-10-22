# Bloqueur de publicités et de traqueurs

Module : `src/main/adblock.js` — liste : `assets/blocklist.txt` — mise à jour :
`node scripts/update-blocklist.js` — tests : `node tests/adblock.test.js`.

## Principe

Blocage par nom de domaine, sans filtrage cosmétique. Une requête est annulée
(`ERR_BLOCKED_BY_CLIENT`) si son hôte ou l'un de ses domaines parents est listé
**et** qu'elle part vers un autre site que la page affichée.

Jamais bloqué : la navigation principale, les requêtes d'un site vers lui-même
(même domaine enregistrable), les schémas autres que http/https/ws/wss, et tout
ce qui part d'un site placé en liste d'exceptions.

## Branchement

Electron n'accepte qu'**un seul** écouteur `onBeforeRequest` par session :
`attach()` l'occupe. Si un autre module doit filtrer les requêtes, ne pas
appeler `attach()` et composer avec `adblock.decide(details)` :

```js
ses.webRequest.onBeforeRequest(adblock.FILTER, (details, callback) => {
  if (adblock.decide(details)) return callback({ cancel: true });
  // … autres règles
  callback({});
});
```

Dans Orbe, le branchement est fait ainsi :

- `sessions.js` appelle `adblock.attach(ses)` pour chaque profil et pour la
  navigation privée ;
- `main.js` appelle `adblock.configure(…)` au démarrage avec les réglages
  `adblock` et `adblockAllow`, et charge la liste une seconde plus tard pour
  ne pas ralentir l'ouverture ;
- le bouclier de la barre latérale affiche le compteur de la page et propose
  l'exception par site (`toggleSiteBlocking` dans `window.js`), suivie d'un
  rechargement de l'onglet ;
- `scripts/build-mac.js` copie la liste dans l'application.

Les compteurs par onglet se remettent à zéro tout seuls quand la page change
(`did-navigate`) et sont oubliés à la fermeture de l'onglet ; `resetTab(id)`
reste disponible.

## Liste et licences

Le code est MIT ; les données gardent la licence de leurs sources, rappelée en
tête de `assets/blocklist.txt` :

| Source | Licence |
| --- | --- |
| Anudeep's Blacklist (adservers) | MIT |
| AdAway default blocklist | CC BY 3.0 |
| Steven Black's ad-hoc list | MIT |

Écartées : EasyList, EasyPrivacy, AdGuard, OISD, HaGeZi (GPLv3 ou CC BY-SA) ;
le fichier unifié de StevenBlack (agrège des sources non commerciales) ; la
liste de Peter Lowe (licence interdisant tout usage lucratif).

## Limites

- Pas de filtrage cosmétique : les emplacements vides restent visibles, et les
  publicités servies par le site lui-même (YouTube, réseaux sociaux) passent.
- Le domaine enregistrable est estimé par une heuristique (`co.uk`, `com.br`,
  hébergeurs courants), pas par la Public Suffix List.
- Deux domaines d'un même éditeur (`exemple.com` et `exemple-cdn.net`) sont vus
  comme des tiers : un hôte listé de l'un est bloqué sur l'autre.
- Pas de parade au camouflage par CNAME.
- Les requêtes de la toute première page peuvent passer pendant les quelques
  millisecondes de lecture de la liste, sauf appel préalable à `load()`.
