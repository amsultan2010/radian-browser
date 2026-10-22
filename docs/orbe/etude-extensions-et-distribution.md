# Étude : extensions Chrome, DRM, connexion Google, distribution

Relevé fait sur Electron 44.7.0 (Chromium 152), en chargeant réellement les
extensions concernées dans une sonde jetable. Ce document guide les prochains
chantiers ; il ne décrit pas ce qu'Orbe fait déjà.

## Extensions Chrome

Electron charge les extensions dépaquetées (Manifest V3 compris), par profil,
mais n'offre qu'une partie des API de Chrome.

- **Disponibles** : `runtime`, `scripting`, `alarms`, `offscreen`,
  `declarativeNetRequest`, `storage.local`, `storage.session`, `webRequest`,
  `i18n`, et une partie de `tabs` (pas `tabs.create` ni `tabs.remove`).
- **Absentes** : `sidePanel`, `contextMenus`, `windows`, `webNavigation`,
  `identity`, `cookies`, `downloads`, `notifications`, `debugger`, `tabGroups`,
  `tts`, `commands`, `storage.sync`, et la messagerie native.
- Electron n'affiche ni bouton ni fenêtre pour les extensions : c'est à Orbe de
  le faire.

| Extension | Electron seul | Avec une couche `tabs`/`windows`/boutons | Blocage principal |
| --- | --- | --- | --- |
| Dark Reader | Partiel | Probable | — |
| Wappalyzer | Partiel | Probable | `cookies`, `tabs.create` |
| vidIQ | Partiel | Partiel | connexion par `identity` |
| GoFullPage | Non | Incertain | `tabs.captureVisibleTab` |
| Read Aloud | Non | Partiel | `tts`, `identity` |
| CSS Peeper | Non | Non | interface en panneau latéral |
| NaturalReader | Non | Non | panneau latéral, `tts` |
| Claude | Non | Non | panneau latéral, `debugger`, messagerie native |
| Mots de passe iCloud | Non | Non | messagerie native |
| html.to.design | Non | Non | `debugger`, `identity` |

**Conséquence.** Viser d'abord les extensions à scripts de contenu et à
fenêtre surgissante. Pour le reste — capture de page entière, lecture vocale,
mots de passe — mieux vaut des fonctions intégrées à Orbe.

**Couche manquante.** La bibliothèque `electron-chrome-extensions` apporte
`tabs`, `windows`, `contextMenus`, `cookies` et les boutons d'extension, mais
elle est sous licence GPL-3 : l'utiliser ferait passer l'application distribuée
sous GPL-3. Sinon, il faut écrire cette couche (plusieurs semaines).
*Décision à prendre avant de commencer.*

**Installation depuis le Chrome Web Store.** Le fichier CRX se télécharge sans
compte. Il faut vérifier sa signature, le décompresser, puis réinjecter la clé
publique dans le manifeste, faute de quoi l'extension change d'identifiant.
Environ 250 lignes, sans dépendance.

## Vidéo protégée (Netflix, Disney+, Prime Video, Spotify web)

Electron de série ne lit pas les contenus protégés par Widevine. Une variante
maintenue par castlabs le fait ; Orbe peut l'utiliser à la demande :

```sh
ORBE_DRM=1 npm start          # moteur avec Widevine, installé dans ~/.orbe-dev-drm
ORBE_DRM=1 npm run build      # application fabriquée avec ce moteur
```

Vérifié sur macOS (Apple Silicon) avec ce moteur : les flux de test publics
(Shaka, Bitmovin) se lisent, les tests d'Orbe passent à l'identique.

Non vérifié : Netflix, Disney+, Prime Video et Spotify. Ils exigent très
probablement une signature supplémentaire de l'application (« VMP »), fournie
gratuitement par castlabs contre la création d'un compte :

```sh
python3 -m pip install --upgrade castlabs-evs
python3 -m castlabs_evs.account signup
ORBE_DRM=1 ORBE_EVS=1 npm run build
```

À savoir : ce moteur suit Electron avec retard (correctifs de sécurité plus
tardifs), la qualité est limitée (protection logicielle, souvent 480–720p), et
rien n'a été essayé sous Windows. C'est pourquoi il n'est pas le moteur par
défaut.

## Connexion Google

Google refuse parfois les navigateurs qu'il ne reconnaît pas. Orbe se présente
comme un Chromium ordinaire (sans la mention « Electron »). À tester avec un
vrai compte ; prévoir un bouton « ouvrir dans le navigateur par défaut » en
secours. Orbe ne se fera pas passer pour Google Chrome.

## Touch ID, clés d'accès, mots de passe

Touch ID pour les clés d'accès demande une application signée avec un
identifiant de développeur Apple. Les mots de passe iCloud ne sont pas
accessibles (l'extension Apple repose sur la messagerie native). Un
gestionnaire de mots de passe intégré est envisageable à plus long terme.

## Distribution

Orbe est aujourd'hui signé localement : macOS demande de passer par
*Réglages → Confidentialité et sécurité → Ouvrir quand même* au premier
lancement d'une copie téléchargée. Pour une installation sans friction et des
mises à jour automatiques, il faut le programme Apple Developer (payant, à
l'année), une signature « Developer ID » et la notarisation ; ensuite,
publication sur GitHub Releases et mise à jour automatique.

## Windows

À adapter : le fond translucide (`backgroundMaterial` au lieu de `vibrancy`),
les boutons de fenêtre (à droite, via `titleBarOverlay`), les raccourcis
(Ctrl à la place de ⌘), le script de fabrication et l'import depuis Arc.
C'est fait : voir [windows.md](windows.md).

## Ordre proposé

1. Identifiant de développeur Apple, notarisation, mises à jour automatiques.
2. Installation d'extensions depuis le Chrome Web Store.
3. Décision de licence, puis boutons et API d'extensions.
4. Fonctions intégrées : capture de page entière, lecture vocale.
5. Prototype Widevine.
6. Version Windows.
