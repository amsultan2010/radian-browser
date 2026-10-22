// Émojis du sélecteur d'icônes (Espace, dossier, onglet) : par rubrique, avec des
// mots-clés en français et en anglais pour la recherche. Liste écrite pour Orbe.
// Une ligne : « émoji|mots français|english words ».
const EMOJI_GROUPS = [
  ['usual', `
🏠|maison accueil domicile|home house
💼|travail bureau mallette|work briefcase office
✨|étincelles nouveau magie|sparkles new magic
🎬|cinéma film clap vidéo|movie film clapper video
🎨|art design palette peinture|art design palette paint
🎧|musique casque audio|music headphones audio
📚|livres lecture études|books reading study
🧪|test labo science essai|test lab science experiment
🛒|achats courses panier|shopping cart groceries
💬|discussion message chat|chat message talk
🧭|boussole navigation explorer|compass navigation explore
🌍|monde terre web planète|world earth globe web
🚀|fusée lancement projet|rocket launch project startup
⚙️|réglages engrenage outils|settings gear tools
❤️|cœur amour favori|heart love favorite
🌙|lune nuit soir|moon night evening
☀️|soleil jour matin|sun day morning
🌿|nature plante vert|nature plant green herb
🔥|feu urgent chaud|fire hot urgent
🎮|jeux manette console|games controller gaming
📷|photo appareil image|photo camera picture
✈️|voyage avion vol|travel plane flight
🍿|popcorn séries divertissement|popcorn shows entertainment
🧠|cerveau idées réflexion|brain ideas thinking
💡|idée ampoule lumière|idea bulb light
📈|graphique croissance finances|chart growth finance
🔒|cadenas sécurité privé|lock security private
🎓|études diplôme école|study graduation school
⚽️|football sport ballon|soccer football sport ball
🏦|banque argent finances|bank money finance
📝|notes écrire mémo|notes write memo
⭐️|étoile favori important|star favorite important`],
  ['faces', `
😀|sourire content joie|grin happy smile
😃|sourire joie heureux|smile happy joy
😄|rire heureux|laugh happy smile
😁|rayonnant sourire dents|beaming grin
😆|rire éclat|laughing
😅|soulagé sueur rire|sweat relief laugh
😂|larmes de joie rire|tears of joy laugh
🤣|mort de rire|rolling laughing rofl
😊|sourire timide heureux|blush smile happy
😇|ange innocent|angel innocent halo
🙂|léger sourire|slight smile
🙃|tête à l’envers ironie|upside down irony
😉|clin d’œil|wink
😍|amoureux yeux cœur|heart eyes love
🥰|affection cœurs|affection hearts love
😘|bisou baiser|kiss
😋|miam délicieux|yum delicious
😎|lunettes cool soleil|cool sunglasses
🤓|intello lunettes geek|nerd glasses geek
🧐|monocle curieux examiner|monocle curious inspect
🤔|réfléchir hmm doute|thinking hmm doubt
🤨|sourcil sceptique|raised eyebrow skeptical
😐|neutre|neutral
😑|blasé|expressionless
😶|sans bouche silence|no mouth silent
🙄|yeux au ciel|eye roll
😏|narquois|smirk
😴|dormir sommeil|sleep sleeping
🤤|bave envie|drool
😷|masque malade|mask sick
🤒|fièvre malade|fever sick thermometer
🤯|tête qui explose choc|mind blown shock
🥳|fête anniversaire|party celebrate birthday
😢|pleurer triste larme|cry sad tear
😭|sanglots pleurer|sob crying
😤|agacé souffle|huff annoyed
😠|colère fâché|angry mad
😡|furieux rage|rage furious
😱|peur cri horreur|scream fear horror
😳|rougir gêné|flushed embarrassed
🥺|suppliant s’il te plaît|pleading please
😬|grimace gêne|grimace awkward
🤗|câlin accueil|hug
🤫|chut silence secret|shush quiet secret
🤐|bouche cousue secret|zipper mouth secret
🤖|robot automate ia|robot bot ai
👻|fantôme|ghost
💀|crâne mort|skull dead
👽|extraterrestre alien|alien
🤡|clown|clown
💩|caca|poop`],
  ['people', `
👋|salut bonjour main|wave hello hand
👍|pouce oui bien|thumbs up yes good
👎|pouce non mauvais|thumbs down no bad
👏|applaudir bravo|clap applause bravo
🙌|hourra mains levées|raised hands hooray
🙏|merci prière s’il te plaît|thanks pray please
🤝|poignée de main accord|handshake deal
💪|force muscle sport|strong muscle gym
✌️|victoire paix|victory peace
🤞|doigts croisés chance|fingers crossed luck
👌|ok parfait|ok perfect
🤙|appelle-moi|call me shaka
👉|pointer droite|point right
👈|pointer gauche|point left
👆|pointer haut|point up
👇|pointer bas|point down
✍️|écrire signature|writing hand sign
🫶|cœur mains|heart hands
👀|yeux regarder|eyes look watch
🧑|personne|person
👩|femme|woman
👨|homme|man
🧒|enfant|child kid
👶|bébé|baby
🧑‍💻|développeur ordinateur code|developer technologist coder
🧑‍🎨|artiste|artist
🧑‍🍳|cuisinier chef|cook chef
🧑‍🏫|professeur enseignant|teacher
🧑‍🎓|étudiant|student
🧑‍🔬|scientifique chercheur|scientist researcher
🧑‍⚕️|médecin santé|doctor health
🧑‍🚀|astronaute|astronaut
🕵️|détective enquête|detective spy
👨‍👩‍👧‍👦|famille|family
👥|personnes équipe groupe|people team group
🏃|courir course|run running
🚶|marcher|walk walking
💃|danse|dance
🧘|yoga méditation|yoga meditation
🏋️|haltères musculation|weights gym lifting
🚴|vélo cyclisme|bike cycling
🏊|natation nager|swim swimming`],
  ['nature', `
🐶|chien|dog
🐱|chat|cat
🐭|souris|mouse
🐰|lapin|rabbit bunny
🦊|renard|fox
🐻|ours|bear
🐼|panda|panda
🐨|koala|koala
🦁|lion|lion
🐯|tigre|tiger
🐮|vache|cow
🐷|cochon|pig
🐸|grenouille|frog
🐵|singe|monkey
🐔|poule|chicken
🐧|pingouin manchot|penguin
🐦|oiseau|bird
🦉|chouette hibou|owl
🦄|licorne|unicorn
🐝|abeille|bee
🦋|papillon|butterfly
🐢|tortue|turtle
🐍|serpent python|snake python
🐙|pieuvre|octopus
🐬|dauphin|dolphin
🐳|baleine|whale
🐟|poisson|fish
🦈|requin|shark
🐘|éléphant|elephant
🦒|girafe|giraffe
🐎|cheval|horse
🌱|pousse jardin|seedling sprout garden
🌲|sapin forêt|evergreen tree forest
🌳|arbre|tree
🌴|palmier vacances|palm tree vacation
🌵|cactus|cactus
🍀|trèfle chance|clover luck
🍁|érable automne|maple fall autumn
🌸|fleur cerisier printemps|cherry blossom spring flower
🌹|rose|rose
🌻|tournesol|sunflower
🌈|arc-en-ciel|rainbow
⭐|étoile|star
🌟|étoile brillante|glowing star
⚡|éclair énergie rapide|lightning energy fast
❄️|neige flocon hiver|snowflake winter
☁️|nuage|cloud
🌧️|pluie|rain
🌊|vague mer océan|wave sea ocean
💧|goutte eau|drop water
🌋|volcan|volcano
🪐|planète saturne espace|planet saturn space`],
  ['food', `
🍎|pomme|apple
🍊|orange|orange
🍋|citron|lemon
🍌|banane|banana
🍉|pastèque|watermelon
🍇|raisin|grapes
🍓|fraise|strawberry
🍒|cerises|cherries
🍑|pêche|peach
🥑|avocat|avocado
🍅|tomate|tomato
🥕|carotte|carrot
🌽|maïs|corn
🥦|brocoli|broccoli
🍞|pain|bread
🥐|croissant|croissant
🧀|fromage|cheese
🥚|œuf|egg
🍳|cuisine poêle|cooking pan
🥓|bacon|bacon
🍔|burger|burger hamburger
🍟|frites|fries
🍕|pizza|pizza
🌮|taco|taco
🍣|sushi|sushi
🍜|nouilles ramen|noodles ramen
🍝|pâtes|pasta spaghetti
🥗|salade|salad
🍰|gâteau dessert|cake dessert
🎂|anniversaire gâteau|birthday cake
🍪|biscuit cookie|cookie
🍫|chocolat|chocolate
🍩|beignet|donut
🍦|glace|ice cream
☕|café|coffee
🍵|thé|tea
🥤|boisson soda|drink soda
🍺|bière|beer
🍷|vin|wine
🍸|cocktail|cocktail
🍽️|repas restaurant|meal restaurant dining`],
  ['activity', `
⚽|football|soccer football
🏀|basket|basketball
🏈|football américain|american football
⚾|baseball|baseball
🎾|tennis|tennis
🏐|volley|volleyball
🏉|rugby|rugby
🎱|billard|pool billiards
🏓|ping-pong|ping pong table tennis
🏸|badminton|badminton
🥊|boxe|boxing
🥋|arts martiaux judo|martial arts judo
⛳|golf|golf
🎿|ski|ski
🏂|snowboard|snowboard
🏄|surf|surf
🏆|trophée victoire|trophy win
🥇|médaille or premier|gold medal first
🎯|cible objectif|target goal dart
🎲|dé jeu hasard|dice game
♟️|échecs stratégie|chess strategy
🧩|puzzle pièce|puzzle piece
🎮|jeu vidéo manette|video game controller
🕹️|arcade manette|joystick arcade
🎭|théâtre|theater
🎤|micro chant|microphone sing
🎹|piano clavier|piano keyboard
🎸|guitare|guitar
🥁|batterie|drum
🎺|trompette|trumpet
🎻|violon|violin
🎵|note musique|music note
🎶|notes musique|music notes
🎟️|billets tickets|tickets
🎪|cirque chapiteau|circus
🎉|fête confettis|party tada celebrate
🎁|cadeau|gift present
🎈|ballon fête|balloon
🧶|laine tricot|yarn knitting
🪡|couture aiguille|sewing needle`],
  ['travel', `
🚗|voiture|car
🚕|taxi|taxi
🚌|bus|bus
🚎|trolley|trolleybus
🚑|ambulance|ambulance
🚒|pompiers|fire engine
🚚|camion livraison|truck delivery
🚲|vélo|bike bicycle
🛴|trottinette|scooter
🏍️|moto|motorcycle
🚆|train|train
🚇|métro|metro subway
🚄|tgv train rapide|high speed train
✈️|avion|airplane plane
🛫|décollage départ|departure takeoff
🚁|hélicoptère|helicopter
🚢|navire bateau|ship boat
⛵|voilier|sailboat
🚀|fusée|rocket
🛸|soucoupe ovni|ufo saucer
🗺️|carte plan|map
🧳|valise bagage|luggage suitcase
🏖️|plage|beach
🏝️|île|island
🏔️|montagne|mountain
⛰️|montagne|mountain
🏕️|camping|camping
🏠|maison|house home
🏡|maison jardin|house garden
🏢|immeuble bureau|office building
🏫|école|school
🏥|hôpital|hospital
🏦|banque|bank
🏪|magasin|store shop
🏭|usine|factory
🏰|château|castle
🗼|tour tokyo|tower
🗽|statue liberté new york|statue liberty new york
🌉|pont|bridge
🌆|ville soir|city dusk
🌃|ville nuit|city night
⛪|église|church
🕌|mosquée|mosque
⛩️|temple|shrine temple`],
  ['objects', `
💻|ordinateur portable|laptop computer
🖥️|ordinateur écran|desktop screen monitor
⌨️|clavier|keyboard
🖱️|souris|mouse
📱|téléphone mobile|phone mobile
☎️|téléphone|telephone
📺|télévision|tv television
📻|radio|radio
🎥|caméra film|movie camera
📸|photo flash|camera flash photo
🔋|batterie|battery
🔌|prise électricité|plug power
💾|disquette sauvegarde|floppy save
💿|disque cd|disc cd
🧮|boulier calcul|abacus math
🔍|loupe recherche|search magnifier
🔑|clé|key
🔐|cadenas clé|locked key
🔓|déverrouillé|unlocked
🛡️|bouclier protection|shield protection
🔨|marteau|hammer
🛠️|outils|tools
🔧|clé à molette|wrench
🧰|boîte à outils|toolbox
🧲|aimant|magnet
🔬|microscope|microscope
🔭|télescope|telescope
📡|antenne satellite|satellite antenna
💊|médicament pilule|pill medicine
🩺|stéthoscope santé|stethoscope health
🧬|adn|dna
📦|colis carton paquet|package box
📫|boîte aux lettres courrier|mailbox mail
✉️|enveloppe courriel|envelope email
📧|e-mail courriel|email
📅|calendrier agenda|calendar
📆|calendrier date|calendar date
🗓️|agenda planning|calendar planner
⏰|réveil alarme|alarm clock
⏱️|chronomètre|stopwatch
⌛|sablier temps|hourglass time
📌|punaise épingle|pin pushpin
📎|trombone pièce jointe|paperclip attachment
✂️|ciseaux couper|scissors cut
📁|dossier|folder
📂|dossier ouvert|open folder
🗂️|intercalaires classement|dividers index
🗃️|fichier boîte|card file box
🗄️|classeur archives|file cabinet archive
🗑️|corbeille supprimer|trash delete
📄|document page|document page
📃|page|page
📑|signets onglets|bookmark tabs
📊|graphique barres|bar chart
📉|graphique baisse|chart down
📋|presse-papiers liste|clipboard list
📓|carnet|notebook
📔|carnet|notebook
📒|registre|ledger
📕|livre rouge|red book
📗|livre vert|green book
📘|livre bleu|blue book
📙|livre orange|orange book
📖|livre ouvert lire|open book read
🔖|marque-page signet|bookmark
🏷️|étiquette|label tag
💰|argent sac|money bag
💵|billets dollar|dollar cash
💶|billets euro|euro cash
💳|carte bancaire paiement|credit card payment
🧾|reçu facture|receipt invoice
💎|diamant|gem diamond
🛍️|sacs achats|shopping bags
🎒|sac à dos|backpack
👓|lunettes|glasses
👕|t-shirt vêtements|shirt clothes
👟|chaussure sport|sneaker shoe
👑|couronne|crown
🕶️|lunettes de soleil|sunglasses
🧸|peluche ours|teddy bear
🛏️|lit|bed
🛋️|canapé salon|couch sofa
🚪|porte|door
🪴|plante pot|potted plant
🕯️|bougie|candle
🔦|lampe torche|flashlight
📰|journal actualités|newspaper news
🗞️|journal|newspaper
🔔|cloche notification|bell notification
📣|mégaphone annonce|megaphone announcement
🎙️|micro studio podcast|studio microphone podcast`],
  ['symbols', `
❤️|cœur rouge|red heart
🧡|cœur orange|orange heart
💛|cœur jaune|yellow heart
💚|cœur vert|green heart
💙|cœur bleu|blue heart
💜|cœur violet|purple heart
🖤|cœur noir|black heart
🤍|cœur blanc|white heart
💔|cœur brisé|broken heart
💯|cent parfait|hundred perfect
✅|coche fait validé|check done
☑️|case cochée|checkbox
✔️|coche|check mark
❌|croix non erreur|cross no error
❓|question|question
❗|exclamation important|exclamation important
⚠️|attention avertissement|warning
🚫|interdit|forbidden prohibited
⛔|sens interdit|no entry
♻️|recycler|recycle
🔴|rond rouge|red circle
🟠|rond orange|orange circle
🟡|rond jaune|yellow circle
🟢|rond vert|green circle
🔵|rond bleu|blue circle
🟣|rond violet|purple circle
⚫|rond noir|black circle
⚪|rond blanc|white circle
🟥|carré rouge|red square
🟧|carré orange|orange square
🟨|carré jaune|yellow square
🟩|carré vert|green square
🟦|carré bleu|blue square
🟪|carré violet|purple square
⬛|carré noir|black square
⬜|carré blanc|white square
🔶|losange orange|orange diamond
🔷|losange bleu|blue diamond
➕|plus|plus
➖|moins|minus
➗|diviser|divide
♾️|infini|infinity
🔁|répéter boucle|repeat loop
🔄|actualiser synchroniser|refresh sync
⏩|avance rapide|fast forward
▶️|lecture|play
⏸️|pause|pause
⏹️|stop|stop
🔀|aléatoire|shuffle
🔊|son fort|loud sound
🔇|muet|mute
💤|sommeil zzz|sleep zzz
💭|pensée bulle|thought bubble
🆕|nouveau|new
🆗|ok|ok
🆘|sos aide|sos help
🔟|dix|ten
#️⃣|dièse|hash
1️⃣|un|one
2️⃣|deux|two
3️⃣|trois|three
♿|accessibilité|accessibility wheelchair
☮️|paix|peace
☯️|yin yang|yin yang
⚛️|atome react|atom react
🏁|drapeau arrivée|checkered flag finish
🚩|drapeau rouge|red flag
🏳️|drapeau blanc|white flag
🏴|drapeau noir|black flag
🏳️‍🌈|arc-en-ciel fierté|rainbow pride flag`],
  ['flags', `
🇫🇷|france|france
🇧🇪|belgique|belgium
🇨🇭|suisse|switzerland
🇨🇦|canada|canada
🇸🇳|sénégal|senegal
🇨🇮|côte d’ivoire|ivory coast
🇲🇱|mali|mali
🇬🇳|guinée|guinea
🇨🇲|cameroun|cameroon
🇲🇦|maroc|morocco
🇩🇿|algérie|algeria
🇹🇳|tunisie|tunisia
🇺🇸|états-unis usa|united states usa
🇬🇧|royaume-uni|united kingdom uk
🇩🇪|allemagne|germany
🇪🇸|espagne|spain
🇮🇹|italie|italy
🇵🇹|portugal|portugal
🇳🇱|pays-bas|netherlands
🇧🇷|brésil|brazil
🇲🇽|mexique|mexico
🇯🇵|japon|japan
🇨🇳|chine|china
🇰🇷|corée|korea
🇮🇳|inde|india
🇦🇺|australie|australia
🇿🇦|afrique du sud|south africa
🇳🇬|nigeria|nigeria
🇪🇺|europe union|europe eu
🇺🇳|nations unies onu|united nations un`],
];

// Émojis qui acceptent une teinte de peau (mains et personnes seules).
const EMOJI_TONED = new Set('👋 👍 👎 👏 🙌 🙏 💪 ✌️ 🤞 👌 🤙 👉 👈 👆 👇 ✍️ 🫶 🧑 👩 👨 🧒 👶 🧑‍💻 🧑‍🎨 🧑‍🍳 🧑‍🏫 🧑‍🎓 🧑‍🔬 🧑‍⚕️ 🧑‍🚀 🕵️ 🏃 🚶 💃 🧘 🏋️ 🚴 🏊 🏄 🏂'.split(' '));
const EMOJI_TONES = ['', '\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];

// Applique une teinte (1 à 5) : le modificateur suit le premier caractère de
// l'émoji, dont le sélecteur de présentation (U+FE0F) tombe.
function emojiTone(emoji, tone) {
  if (!tone || !EMOJI_TONED.has(emoji)) return emoji;
  const cps = [...emoji];
  const rest = cps.slice(1);
  if (rest[0] === '️') rest.shift();
  return cps[0] + EMOJI_TONES[tone] + rest.join('');
}

// Liste à plat : [{ e, group, words }] (mots-clés des deux langues, sans accents).
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const EMOJI_LIST = [];
for (const [group, text] of EMOJI_GROUPS) {
  for (const line of text.trim().split('\n')) {
    const [e, fr, en] = line.split('|');
    EMOJI_LIST.push({ e, group, words: fold(`${fr} ${en}`) });
  }
}

// Recherche : chaque mot tapé doit commencer un mot-clé. Sans saisie, tout, par rubrique.
function emojiSearch(query) {
  const terms = fold(String(query || '')).split(/\s+/).filter(Boolean);
  if (!terms.length) return EMOJI_LIST;
  const seen = new Set();
  return EMOJI_LIST.filter((x) => {
    if (seen.has(x.e) || !terms.every((q) => x.words.split(/[\s’'-]+/).some((w) => w.startsWith(q)))) return false;
    seen.add(x.e);
    return true;
  });
}

if (typeof module !== 'undefined') module.exports = { EMOJI_GROUPS, EMOJI_LIST, EMOJI_TONED, EMOJI_TONES, emojiTone, emojiSearch };
