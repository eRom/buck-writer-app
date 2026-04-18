/**
 * Seed script : remplit la bible avec l'univers de Matrix
 * Usage : pnpm --filter @barda/mcp exec tsx scripts/seed-matrix.ts
 */
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/index.js";
import * as schema from "../src/db/schema.js";
import path from "node:path";

const dbPath = path.resolve(import.meta.dirname, "..", "data", "bible.db");
console.error(`[seed] DB: ${dbPath}`);
const { db, sqlite } = getDb(dbPath);

const now = Date.now();
function id() { return randomUUID(); }

// ═══════════════════════════════════════════════════════════════════
// PERSONNAGES
// ═══════════════════════════════════════════════════════════════════

const charIds: Record<string, string> = {};
const chars = [
  {
    key: "neo",
    name: "Thomas 'Neo' Anderson",
    description: "Homme d'une trentaine d'annees, mince, crane rase apres sa liberation. Dans la Matrice, il porte un long manteau noir et des lunettes de soleil. Hors de la Matrice, il porte des vetements gris usees, les bras couverts de prises metalliques.",
    traits: JSON.stringify({
      physical: ["crane rase", "mince", "regard intense", "prises metalliques sur les bras", "cicatrice a l'arriere du crane"],
      personality: ["introverti", "douteur", "obstine", "compassion silencieuse", "courage croissant", "sacrifice"]
    }),
    background: "Programmeur le jour chez Metacortex, hacker la nuit sous le pseudonyme 'Neo'. Cherche obsessionnellement la reponse a la question 'Qu'est-ce que la Matrice ?'. Libere par Morpheus, il decouvre que le monde reel est un cauchemar post-apocalyptique. L'Oracle lui dit qu'il n'est pas l'Elu — mais il le devient en choisissant de sauver Morpheus, puis en mourant et ressuscitant.",
    notes: "Arc central : du doute a l'acceptation. Neo ne croit pas etre l'Elu pendant les 2/3 du recit. C'est son amour pour Trinity et son sacrifice pour Morpheus qui declenchent sa transformation. Au chapitre 15, il arrete les balles — moment de bascule definitif. Apres sa resurrection, il voit le code de la Matrice : il est devenu partie integrante du systeme qu'il combat."
  },
  {
    key: "trinity",
    name: "Trinity",
    description: "Femme d'une trentaine d'annees, cheveux noirs courts, silhouette athletique et precise. Combinaison noire moulante dans la Matrice, equipement tactique minimal. Expression stoique mais regard intense.",
    traits: JSON.stringify({
      physical: ["cheveux noirs courts", "silhouette athletique", "regard intense", "combinaison noire"],
      personality: ["reservee", "loyale jusqu'a la mort", "competente", "emotive sous la carapace", "decisive"]
    }),
    background: "Hackeuse legendaire, premiere a avoir cracke le systeme de la Matrice selon la legende. Liberee par Morpheus avant Neo. Pilote du Nebuchadnezzar et combattante d'elite. L'Oracle lui a dit qu'elle tomberait amoureuse de l'Elu — information qu'elle garde secrete jusqu'au moment critique.",
    notes: "Arc : du soldat emotionnellement blinde a la femme qui assume son amour. Sa declaration d'amour au chapitre 16 est ce qui ressuscite Neo. Elle est le catalyseur de la prophetie, pas juste un temoin. Sans Trinity, pas d'Elu."
  },
  {
    key: "morpheus",
    name: "Morpheus",
    description: "Homme noir imposant, la quarantaine, crane rase, barbe soignee. Dans la Matrice : long manteau en cuir, lunettes miroir rondes sans branches, allure de predicateur guerrier. Voix grave et posee, chaque mot est choisi.",
    traits: JSON.stringify({
      physical: ["imposant", "crane rase", "barbe soignee", "lunettes miroir rondes", "presence magnetique"],
      personality: ["foi inebranlable", "charisme naturel", "patience infinie", "orateur ne", "mentor devote", "risque-tout pour ses convictions"]
    }),
    background: "Capitaine du Nebuchadnezzar, vaisseau hovership de Zion. Croit depuis des decennies que Neo est l'Elu prophetise par l'Oracle. A consacre sa vie a le chercher, sacrifiant sa reputation et ses relations. Considere comme un fanatique par certains a Zion, comme un prophete par d'autres.",
    notes: "Morpheus est le personnage le plus tragique du recit. Sa foi aveugle est a la fois sa force et sa faiblesse. L'Oracle lui a menti (ou l'a manipule) — Neo n'etait pas l'Elu au depart, il l'est devenu GRACE a la foi de Morpheus. La prophetie est auto-realisatrice."
  },
  {
    key: "smith",
    name: "Agent Smith",
    description: "Homme en costume noir sobre, cravate sombre, lunettes de soleil rectangulaires. Apparence generique, volontairement anonyme. Peau palide, expression de degout permanent. Apres sa 'mort', il revient altere : cravate defaite, lunettes cassees, plus erratique.",
    traits: JSON.stringify({
      physical: ["costume noir sobre", "lunettes rectangulaires", "peau pale", "expression de degout", "oreillette"],
      personality: ["mepris pour l'humanite", "obsession de l'ordre", "frustration croissante", "ego grandissant", "philosophe malgre lui"]
    }),
    background: "Programme sentient de la Matrice, charge de maintenir l'ordre et d'eliminer les anomalies (humains liberes). Contrairement aux autres Agents, Smith a developpe une forme de conscience et de degout pour sa mission. Il compare les humains a un virus — ironiquement, il deviendra lui-meme un virus dans la suite.",
    notes: "Smith est le miroir de Neo. Quand Neo se libere, Smith aussi se libere (de ses contraintes de programme). Chaque fois que Neo grandit, Smith grandit aussi. Ils sont lies : creation et destruction, ordre et chaos. Sa tirade sur l'humanite-virus au chapitre 12 est le manifeste philosophique du film."
  },
  {
    key: "oracle",
    name: "L'Oracle",
    description: "Femme afro-americaine d'age mur, chaleureuse, maternelle. Cuisine un appartement modeste dans la Matrice, toujours en train de preparer des cookies. Porte des vetements simples, un tablier. Sourit beaucoup, mais son regard trahit une connaissance ecrasante.",
    traits: JSON.stringify({
      physical: ["femme agee", "afro-americaine", "vetements simples", "tablier", "sourire chaleureux"],
      personality: ["manipulatrice bienveillante", "maternelle", "cryptique", "humour pince-sans-rire", "sagesse ambigue"]
    }),
    background: "Programme de la Matrice cree pour comprendre la psyche humaine. Elle est censee guider l'Elu vers la Source pour recharger la Matrice — c'est un mecanisme de controle. Mais l'Oracle a choisi de jouer un double jeu : elle guide Neo vers la liberte reelle, pas vers le cycle prevu par l'Architecte.",
    notes: "L'Oracle ne ment jamais, mais elle ne dit jamais toute la verite. Quand elle dit a Neo 'tu n'es pas l'Elu', elle dit la verite A CE MOMENT. Neo ne l'est pas encore. Sa phrase 'tu as le don, mais tu sembles attendre quelque chose — ta prochaine vie, peut-etre' est le veritable indice. Elle sait qu'il doit mourir d'abord."
  },
  {
    key: "cypher",
    name: "Cypher Reagan",
    description: "Homme d'age moyen, cheveux raides en arriere, bouc, air fourbe sous des dehors decontractes. Dans la Matrice, il s'habille en costume chic — le style qu'il regrette. Fume constamment.",
    traits: JSON.stringify({
      physical: ["cheveux plaques en arriere", "bouc", "regard fuyant", "cigarette permanente"],
      personality: ["cynique", "lache", "rancunier", "hedoniste", "manipulateur", "desespere"]
    }),
    background: "Membre de l'equipage du Nebuchadnezzar, libere par Morpheus. Regrette profondement d'avoir choisi la pilule rouge. Negocie secretement avec l'Agent Smith pour etre reinseree dans la Matrice en echange de Morpheus. Pret a sacrifier tout l'equipage pour retrouver l'ignorance.",
    notes: "Cypher est l'anti-these de Neo. La ou Neo choisit la verite douloureuse, Cypher choisit le mensonge confortable. Sa phrase 'L'ignorance est un bonheur' est le contrepoint exact de la quete de Neo. Son arc pose LA question centrale du film : et si la verite etait pire que l'illusion ?"
  },
  {
    key: "tank",
    name: "Tank",
    description: "Homme jeune, musculeux, peau sombre, sourire facile. Ne a Zion — pas de prises metalliques, jamais ete connecte a la Matrice. Operateur du Nebuchadnezzar.",
    traits: JSON.stringify({
      physical: ["musculeux", "peau sombre", "pas de prises metalliques", "sourire chaleureux"],
      personality: ["optimiste", "loyal", "enthousiaste", "fier d'etre ne libre", "courageux"]
    }),
    background: "Ne dans le monde reel a Zion, ce qui est rare — la plupart des humains sont cultives dans les fermes. Son frere Dozer est aussi dans l'equipage. Operateur du vaisseau : il charge les programmes d'entrainement et gere les entrees/sorties de la Matrice.",
    notes: "Tank represente l'espoir ne : quelqu'un qui n'a jamais connu le mensonge de la Matrice. Son meurtre de Cypher est un moment de justice brute — pas de dilemme moral, juste de la loyaute."
  },
  {
    key: "dozer",
    name: "Dozer",
    description: "Homme costaud, peau sombre, plus age que Tank. Calme et discret. Ne a Zion comme son frere Tank.",
    traits: JSON.stringify({
      physical: ["costaud", "peau sombre", "expression calme", "pas de prises metalliques"],
      personality: ["calme", "protecteur", "discret", "solide"]
    }),
    background: "Frere aine de Tank, ne a Zion. Membre de l'equipage du Nebuchadnezzar. Tue par Cypher lors de la trahison.",
    notes: "La mort de Dozer est le premier vrai cout de la trahison de Cypher. Elle rend la trahison concrète — ce n'est plus abstrait, c'est le frere de Tank."
  },
  {
    key: "mouse",
    name: "Mouse",
    description: "Jeune homme mince, nerveux, enthousiaste. Le plus jeune de l'equipage. Air d'eternel adolescent.",
    traits: JSON.stringify({
      physical: ["jeune", "mince", "nerveux", "air adolescent"],
      personality: ["enthousiaste", "philosophe amateur", "obsede par les sensations", "courageux malgre la peur"]
    }),
    background: "Programmeur de l'equipage, createur de programmes d'entrainement et du personnage de 'la femme en rouge'. Pose des questions philosophiques sur la nature de la realite et des sensations.",
    notes: "Mouse est la voix du doute philosophique leger : 'comment savoir si le poulet a le gout de poulet ?' Il pose la question de l'authenticite de l'experience. Sa mort lors du piege est brutale et rapide — aucun glamour."
  },
  {
    key: "switch",
    name: "Switch",
    description: "Femme blonde, vetements blancs dans la Matrice (contraste avec le noir des autres). Expression dure, peu bavarde.",
    traits: JSON.stringify({
      physical: ["blonde", "vetements blancs", "expression dure", "androgyne"],
      personality: ["froide", "directe", "meprisante envers les novices", "loyale"]
    }),
    background: "Membre de l'equipage du Nebuchadnezzar. Specialiste de la securite. Sa tenue blanche dans la Matrice la distingue volontairement du reste de l'equipage.",
    notes: "Sa derniere phrase 'Pas comme ca' avant d'etre debranchee par Cypher est l'un des moments les plus poignants. Elle refuse de mourir par trahison — mais n'a pas le choix."
  },
  {
    key: "apoc",
    name: "Apoc",
    description: "Homme brun, silencieux, air severe. Toujours en noir. Peu de lignes de dialogue.",
    traits: JSON.stringify({
      physical: ["brun", "severe", "vetements noirs", "regard dur"],
      personality: ["silencieux", "loyal", "stoique", "soldat"]
    }),
    background: "Membre de l'equipage du Nebuchadnezzar. Combattant. Tue par Cypher lors de la trahison.",
    notes: "Apoc et Switch forment un duo tacite. Leur mort simultanee lors de la trahison amplifie l'horreur."
  },
  {
    key: "merovingien",
    name: "Le Merovingien",
    description: "Homme elegant, accent français affecte, costume haute couture. Installé dans un restaurant chic au coeur de la Matrice. Maniere precieuse, vocabulaire recherche, air condescendant.",
    traits: JSON.stringify({
      physical: ["elegant", "costume haute couture", "accent francais", "maniere precieuse"],
      personality: ["arrogant", "manipulateur", "hedoniste", "obsede par la causalite", "collectionneur de pouvoir"]
    }),
    background: "Programme ancien de la Matrice, survivant de versions precedentes. Trafiquant d'informations et de programmes exiles. Possede le Keymaker. Dirige un reseau de programmes 'hors-la-loi' depuis son restaurant. Marie a Persephone.",
    notes: "Le Merovingien est un vestige des anciennes Matrices. Il incarne la decadence du pouvoir sans but. Sa philosophie de la causalite ('il n'y a pas de choix, seulement la raison du choix') est le contrepoint de la liberte defendue par Neo."
  }
];

const charInsert = db.insert(schema.characters);
for (const c of chars) {
  const cid = id();
  charIds[c.key] = cid;
  charInsert.values({ id: cid, name: c.name, description: c.description, traits: c.traits, background: c.background, notes: c.notes, createdAt: now, updatedAt: now }).run();
}
console.error(`[seed] ${chars.length} personnages crees`);

// ═══════════════════════════════════════════════════════════════════
// LIEUX
// ═══════════════════════════════════════════════════════════════════

const locIds: Record<string, string> = {};
const locs = [
  {
    key: "matrice",
    name: "La Matrice",
    description: "Simulation informatique photoréaliste reproduisant le monde tel qu'il etait en 1999. Mega-cite americaine generique, gratte-ciels, rues bondees, pluie frequente. Tout semble normal — c'est le piege.",
    atmosphere: "Teinte verdatre persistante sur toute l'image (filtre vert). Lumiere artificielle, ombres trop nettes. Sensation subtile de malaise, comme un reve dont on ne peut pas se reveiller. Silence anormal dans les moments de tension — la Matrice retient son souffle.",
    geography: "Mega-cite indefinie. Gratte-ciels, autoroutes, quartiers residentiels, metro. Les regles de la physique sont des suggestions, pas des lois — pour ceux qui le savent.",
    notes: "Le filtre vert est la signature visuelle de la Matrice. Chaque fois qu'on est DANS la Matrice, l'image a cette teinte. Le monde reel est bleu/gris. Le Construct est blanc."
  },
  {
    key: "neb",
    name: "Le Nebuchadnezzar",
    description: "Hovership (aeroglisseur) de Zion. Vaisseau militaire reconverti, vieux et rouille mais fiable. Immatriculation : Mark III No. 11. Plaque : 'Nebuchadnezzar — Made in the USA, Year 2069'.",
    atmosphere: "Metal froid, condensation, eclairage minimal rougeatre et bleuatre. Bruit constant des moteurs. Exigu, claustrophobique. Les sieges de connexion a la Matrice sont des fauteuils de dentiste cauchemardesque avec des aiguilles dans la nuque.",
    geography: "Interieur : pont principal (commandes + ecrans), salle de connexion (fauteuils + operateur), cantine, quartiers d'equipage, salle des machines. Navigue dans les egouts geants du monde reel, pres des lignes de broadcast pour entrer dans la Matrice.",
    notes: "Le Nebuchadnezzar est le foyer. C'est la que Neo apprend la verite, s'entraine, et ou l'equipage vit. Sa destruction (dans la suite) est symbolique — la fin de l'innocence."
  },
  {
    key: "zion",
    name: "Zion",
    description: "Derniere cite humaine libre, construite pres du noyau terrestre la ou il fait encore chaud. Immense caverne souterraine amenagee en ville. Population estimee : 250 000 ames.",
    atmosphere: "Chaleur humide, bruit metallique constant, foule dense. Melange de desespoir et de resistance feroce. Les gens dansent, prient, se battent. Lumiere artificielle chaude, vapeur omnipresente.",
    geography: "Profond sous la surface terrestre. Temple central (assemblees + celebrations). Docks pour les hoverships. Quartiers d'habitation tailles dans la roche. Systeme de defense : tourelles EMP et APU (armures mecaniques).",
    notes: "Zion est mentionnee mais jamais montree dans le premier film. Elle est l'enjeu abstrait — ce pourquoi on se bat. Son existence est la preuve que la liberte est possible."
  },
  {
    key: "oracle_apt",
    name: "Appartement de l'Oracle",
    description: "Appartement modeste dans un immeuble populaire de la Matrice. Cuisine simple, linoléum au sol, mobilier des annees 70. Odeur de cookies en permanence. Salle d'attente avec des enfants 'potentiels' qui tordent des cuilleres.",
    atmosphere: "Chaleureux, maternel, en contraste total avec le reste de la Matrice. Lumiere doree, sons de cuisine. Impression de securite — probablement fausse. Les enfants dans la salle d'attente sont a la fois rassurants et inquietants.",
    geography: "Etage d'un immeuble du quartier populaire. Salle d'attente avec banc et enfants. Cuisine ouverte. Vue sur la rue par la fenetre.",
    notes: "C'est dans cette cuisine que les destins se jouent. L'Oracle choisit ses mots avec une precision chirurgicale. Le vase qui tombe — 'ne t'inquiete pas pour le vase... quel vase ?' — montre qu'elle controle la conversation au millimetre."
  },
  {
    key: "construct",
    name: "Le Construct",
    description: "Espace de chargement virtuel, entierement blanc et vide. Espace infini sans murs, sol, plafond. On peut y charger n'importe quel programme : armes, vetements, environnements d'entrainement.",
    atmosphere: "Silence absolu. Blancheur aveuglante. Sensation de neant — pas oppressante, juste... vide. Puis soudain, des meubles, des armes, des batiments apparaissent de nulle part.",
    geography: "Espace virtuel infini. Pas de geographie fixe — tout est programmable. Le dojo d'entrainement, le programme de saut, l'armurerie sont tous charges dans le Construct.",
    notes: "Le Construct est ou Morpheus revele la verite a Neo ('Welcome to the real world'). C'est un espace de transition — entre le mensonge et la realite, entre l'ignorance et la connaissance."
  },
  {
    key: "metacortex",
    name: "Metacortex (bureau de Neo)",
    description: "Bureau open-space generique d'une grande entreprise de logiciels. Neons blancs, cubicles identiques, moquette grise. Neo y travaille comme programmeur sous son vrai nom Thomas Anderson.",
    atmosphere: "Sterilite corporate. Bruit de claviers, telephones, imprimantes. Lumiere blafarde. Tout est beige et gris — l'archetype de la prison mentale. Le patron de Neo (Rhineheart) est le gardien de cette prison.",
    geography: "Gratte-ciel du centre-ville. Etage de bureaux open-space. Cubicle de Neo avec double ecran. Salle du patron. Coursive exterieure (scene de l'echafaudage).",
    notes: "Le nom Metacortex contient 'meta' (au-dela) et 'cortex' (cerveau). Le nom meme de l'entreprise est un indice. La scene ou Neo essaie de fuir par la corniche et abandonne est un echo de son refus initial de croire."
  },
  {
    key: "hotel_lafayette",
    name: "Hotel Lafayette (murs humides)",
    description: "Hotel delabré dans un quartier mal fame de la Matrice. Murs moisis, papier peint decolle, escaliers grincants. C'est ici que Trinity et l'equipage attendent les appels. C'est aussi ici que Neo est 'debranche'.",
    atmosphere: "Humidite, moisissure, lumiere vacillante. Angoisse. La chambre 303 est la chambre de la renaissance — Neo y est extrait de la Matrice pour la premiere fois.",
    geography: "Vieil immeuble. Couloir sombre. Chambre 303 : chaise, equipement de hack, telephone fixe (sortie de la Matrice).",
    notes: "La chambre 303 est un clin d'oeil a la Trinite (3). Neo meurt dans le couloir de l'etage — et le numero de l'appartement de la fusillade est aussi charge de symbolisme numerologique."
  },
  {
    key: "dojo",
    name: "Le Dojo (programme d'entrainement)",
    description: "Salle d'arts martiaux traditionnelle japonaise chargee dans le Construct. Tatamis, colonnes en bois, lumiere tamisee. C'est ici que Morpheus et Neo se battent pour la premiere fois.",
    atmosphere: "Serenite martiale. Bruit des pieds sur les tatamis. Le dojo sent le bois et l'encens — meme si ces odeurs sont simulees. Tension entre meitre et eleve.",
    geography: "Salle rectangulaire. Tatamis au sol. Colonnes en bois. Pas de fenetre — c'est un programme ferme.",
    notes: "La scene du dojo est l'apprentissage accelere de Neo. 'Tu crois que c'est de l'air que tu respires ?' Morpheus lui enseigne que les regles de la Matrice sont des suggestions. C'est ici que Neo commence a comprendre — mais pas encore a croire."
  },
  {
    key: "lobby",
    name: "Le Hall d'entree gouvernemental",
    description: "Hall d'entree monumental d'un batiment gouvernemental. Colonnes de marbre, detecteurs de metaux, gardes armes. C'est ici que Neo et Trinity lancent l'assaut pour sauver Morpheus.",
    atmosphere: "Echo des pas sur le marbre. Silence tendu avant l'explosion de violence. Puis chaos total : debris de marbre, douilles, eclats de colonnes. La scene de fusillade la plus emblematique du cinema.",
    geography: "Grand hall avec colonnes. Bureau de securite. Detecteurs de metaux. Ascenseurs au fond. Etages superieurs : bureaux gouvernementaux ou Morpheus est retenu.",
    notes: "La scene du lobby est le point de non-retour pour Neo. Il entre avec un arsenal sous son manteau et un regard qui dit 'je n'ai plus peur'. C'est la premiere fois qu'il agit comme l'Elu — meme s'il ne le sait pas encore."
  },
  {
    key: "metro",
    name: "Station de metro Mobil Ave",
    description: "Station de metro souterraine, carrelage blanc sale, neons clignotants. La ou Neo et Smith s'affrontent pour la derniere fois dans le premier film.",
    atmosphere: "Resonance metallique. Eclairage dur. Solitude — la station est vide sauf les deux adversaires. Le grondement du metro approchant ajoute une urgence temporelle.",
    geography: "Quai de metro standard. Rails. Tunnel sombre. Escaliers de sortie.",
    notes: "Le combat Neo vs Smith dans le metro est le climax physique. Smith perd ses lunettes — il perd sa facade. Neo plonge dans Smith et le fait exploser de l'interieur. Mais Smith revient — il revient toujours."
  }
];

for (const l of locs) {
  const lid = id();
  locIds[l.key] = lid;
  db.insert(schema.locations).values({ id: lid, name: l.name, description: l.description, atmosphere: l.atmosphere, geography: l.geography, notes: l.notes, createdAt: now, updatedAt: now }).run();
}
console.error(`[seed] ${locs.length} lieux crees`);

// ═══════════════════════════════════════════════════════════════════
// EVENEMENTS (Timeline)
// ═══════════════════════════════════════════════════════════════════

const evts = [
  { title: "Arrestation de Neo par les Agents", description: "Neo est arrete a son bureau de Metacortex par l'Agent Smith et ses collegues. Interrogatoire ou Smith lui propose de cooperer. La bouche de Neo se soude — premier signe que la realite n'est pas ce qu'elle semble.", chapter: "Acte I - chapitre 2", sortOrder: 1, location: "metacortex", chars: ["neo", "smith"], notes: "La scene de la bouche scellee est le premier moment surrealiste pour Neo. Il doute encore — etait-ce un reve ?" },
  { title: "Neo suit le lapin blanc", description: "Neo recoit un message sur son ecran : 'Follow the white rabbit'. Des clients viennent acheter un disque pirate. L'une d'elles a un tatouage de lapin blanc. Il la suit dans un club ou il rencontre Trinity pour la premiere fois.", chapter: "Acte I - chapitre 1", sortOrder: 0, location: "matrice", chars: ["neo", "trinity"], notes: "Premiere rencontre Neo-Trinity. Elle lui murmure a l'oreille que la reponse le trouvera. Tension electrique immediate." },
  { title: "Rencontre sur le pont : Neo et Morpheus", description: "Neo est recupere par Trinity et l'equipage. Emmene a un point de rendez-vous. Morpheus l'attend, lui propose le choix : pilule rouge (verite) ou pilule bleue (oubli).", chapter: "Acte I - chapitre 3", sortOrder: 2, location: "hotel_lafayette", chars: ["neo", "morpheus", "trinity"], notes: "LE moment fondateur. 'This is your last chance. After this, there is no turning back.' La pilule rouge est un traceur — elle permet de localiser le corps physique de Neo dans les fermes." },
  { title: "Neo prend la pilule rouge", description: "Neo choisit la pilule rouge. Son corps physique est localise dans les fermes de culture humaine. Il est extrait de sa capsule, ses muscles atrophies, ses yeux n'ont jamais vu la vraie lumiere. Le Nebuchadnezzar le recupere.", chapter: "Acte I - chapitre 4", sortOrder: 3, location: "neb", chars: ["neo", "morpheus", "trinity", "tank"], notes: "La scene de l'extraction est volontairement traumatisante. Neo vomit, s'evanouit, hurle. La verite n'est pas une liberation — c'est un arrachement." },
  { title: "Morpheus revele la verite dans le Construct", description: "Morpheus emmene Neo dans le Construct et lui montre le monde reel : une Terre devastee, des champs d'humains cultives par les machines pour leur energie. 'Welcome to the real world.'", chapter: "Acte I - chapitre 5", sortOrder: 4, location: "construct", chars: ["neo", "morpheus"], notes: "Neo vomit en decouvrant la verite. Morpheus explique la guerre homme-machine, le blackout du ciel, les fermes humaines. C'est ici que Neo apprend ce qu'est la Matrice." },
  { title: "Entrainement de Neo — le Dojo", description: "Tank charge des dizaines de programmes d'entrainement dans le cerveau de Neo : kung-fu, judo, kendo, jiu-jitsu. Puis Morpheus l'emmene dans le dojo du Construct pour tester ses competences. 'Tu crois que c'est de l'air que tu respires ?'", chapter: "Acte I - chapitre 6", sortOrder: 5, location: "dojo", chars: ["neo", "morpheus", "tank"], notes: "10 heures d'upload de programmes. Neo ouvre les yeux et dit 'I know kung-fu'. Le combat dans le dojo est le debut de sa transformation — il est plus rapide qu'il ne le croit." },
  { title: "Le programme de saut", description: "Test dans le Construct : sauter d'un gratte-ciel a un autre. Morpheus saute et reussit. Neo saute... et tombe. 'Tout le monde tombe la premiere fois.'", chapter: "Acte I - chapitre 7", sortOrder: 6, location: "construct", chars: ["neo", "morpheus"], notes: "L'echec du saut est crucial narrativement. Neo n'est PAS encore pret. Son esprit n'est pas libre — il croit encore aux limites. Le sang dans sa bouche prouve que 'le corps ne vit pas sans l'esprit'." },
  { title: "Le diner de Cypher avec Agent Smith", description: "Cypher rencontre secretement l'Agent Smith dans un restaurant chic de la Matrice. Il negocie sa reinsertion : il livrera Morpheus en echange d'une vie confortable dans la Matrice. 'L'ignorance est un bonheur.'", chapter: "Acte I - chapitre 8", sortOrder: 7, location: "matrice", chars: ["cypher", "smith"], notes: "Le steak que mange Cypher est le symbole de son choix. Il SAIT que ce steak n'est pas reel. Il s'en fiche. Il prefere le mensonge savoureux a la verite insipide. Ce diner est la graine de la trahison." },
  { title: "Visite a l'Oracle", description: "Neo est emmene chez l'Oracle. Il attend avec les enfants 'potentiels' (dont celui qui tord la cuillere : 'Il n'y a pas de cuillere'). L'Oracle l'examine et lui dit qu'il n'est pas l'Elu. Mais elle ajoute que Morpheus croit en lui au point de mourir pour lui — et Neo devra choisir.", chapter: "Acte II - chapitre 9", sortOrder: 8, location: "oracle_apt", chars: ["neo", "oracle", "morpheus"], notes: "L'Oracle ment-elle ? Non. Neo n'est PAS l'Elu a ce stade. Il le deviendra. Son 'non' est la verite du present, pas du futur. Le choix qu'elle pose — ta vie ou celle de Morpheus — est le test reel." },
  { title: "La trahison de Cypher", description: "Cypher deconnecte violemment l'equipage un par un pendant qu'ils sont dans la Matrice. Il tue Dozer, puis Switch, puis Apoc en les debranchant. Mouse est deja mort dans le piege. Avant de tuer Neo, Tank (blesse) se releve et le tue.", chapter: "Acte II - chapitre 11", sortOrder: 10, location: "neb", chars: ["cypher", "tank", "dozer", "switch", "apoc", "mouse"], notes: "La trahison est le nadir du recit. 4 morts en quelques minutes. Tank sauve Neo in extremis. La phrase de Switch avant de mourir ('Pas comme ca...') est devastatrice." },
  { title: "Morpheus capture par les Agents", description: "Piege tendu grace aux informations de Cypher. Les Agents capturent Morpheus dans un immeuble. Il se sacrifie pour permettre a Neo de s'enfuir. Il est emmene dans un batiment gouvernemental pour etre 'cracke' — extraire les codes d'acces de Zion.", chapter: "Acte II - chapitre 10", sortOrder: 9, location: "matrice", chars: ["morpheus", "smith", "neo", "trinity"], notes: "Morpheus se jette sur Smith pour sauver Neo — il sait qu'il va perdre mais sa foi dicte qu'il protege l'Elu a tout prix. Cette capture declenche le dilemme de Neo." },
  { title: "Neo decide de sauver Morpheus", description: "L'Oracle avait dit : ta vie ou la sienne. L'equipage veut deconnecter Morpheus (le tuer pour proteger Zion). Neo refuse. 'Je vais le chercher.' Trinity le suit : 'Morpheus a plus foi en toi que tu n'en as en toi-meme. Si tu ne le sais pas maintenant, tu ne survivras pas.'", chapter: "Acte II - chapitre 12", sortOrder: 11, location: "neb", chars: ["neo", "trinity", "tank"], notes: "C'est LE choix qui transforme Neo. L'Oracle ne lui avait pas menti — elle lui avait donne le choix. Neo choisit de ne pas etre l'Elu qui laisse mourir les siens. En faisant ce choix impossible, il commence a devenir l'Elu." },
  { title: "L'assaut du lobby", description: "Neo et Trinity entrent dans le batiment gouvernemental par le hall d'entree. Equipement : mitraillettes, pistolets, grenades, tout un arsenal sous leurs manteaux noirs. Destruction totale des colonnes de marbre, des gardes, des detecteurs de metaux.", chapter: "Acte III - chapitre 13", sortOrder: 12, location: "lobby", chars: ["neo", "trinity"], notes: "La scene iconique. Neo et Trinity en slow motion, cartouches qui tombent au sol. Neo ne doute plus — il agit. La choreographie est une declaration : nous ne jouons plus selon vos regles." },
  { title: "Sauvetage de Morpheus sur le toit", description: "Neo et Trinity montent sur le toit en helicoptere. Trinity couvre pendant que Neo, suspendu a un cable, fonce dans le batiment et sauve Morpheus. L'helicoptere s'ecrase mais Morpheus est libre.", chapter: "Acte III - chapitre 14", sortOrder: 13, location: "matrice", chars: ["neo", "trinity", "morpheus"], notes: "Le moment ou Neo attrape Trinity en chute libre — premier exploit veritablement surhumain. Il commence a defier les limites de la Matrice, pas encore completement, mais suffisamment." },
  { title: "Combat Neo vs Smith dans le metro", description: "Morpheus et Trinity sortent par un telephone fixe. Neo reste pour affronter Smith. Combat brutal dans la station de metro. Smith est plus fort, plus rapide. Neo est battu, crache du sang — mais se releve. 'Mon nom est Neo.'", chapter: "Acte III - chapitre 15", sortOrder: 14, location: "metro", chars: ["neo", "smith"], notes: "Le combat le plus important. Neo perd techniquement — Smith le domine. Mais Neo refuse d'abandonner. 'Mon nom est Neo' est l'affirmation de son identite choisie, pas assignee. Smith fuit en possedant un passant — il reviendra." },
  { title: "Neo est tue par Smith", description: "Neo court dans les couloirs d'un hotel pour atteindre le telephone de sortie. Smith l'attend et lui tire dessus a bout portant. Neo s'effondre. Dans le monde reel, ses signes vitaux tombent a zero. Trinity refuse d'accepter sa mort.", chapter: "Acte III - chapitre 16", sortOrder: 15, location: "hotel_lafayette", chars: ["neo", "smith", "trinity"], notes: "Neo meurt. Pour de vrai. Le moniteur cardiaque est plat. C'est exactement ce que l'Oracle avait predit : 'ta prochaine vie, peut-etre'. La mort etait necessaire." },
  { title: "Trinity ressuscite Neo par son amour", description: "Trinity se penche sur le corps de Neo dans le Nebuchadnezzar et lui murmure : 'L'Oracle m'a dit que je tomberais amoureuse de l'Elu. Donc tu ne peux pas etre mort, parce que je t'aime.' Elle l'embrasse. Neo revient a la vie.", chapter: "Acte III - chapitre 16", sortOrder: 16, location: "neb", chars: ["neo", "trinity"], notes: "La prophetie se boucle : l'Oracle avait dit a Trinity qu'elle aimerait l'Elu. Trinity aime Neo. Donc Neo est l'Elu. La logique est circulaire et auto-realisatrice — c'est voulu. L'amour EST le mecanisme de la prophetie." },
  { title: "Neo arrete les balles", description: "Neo ressuscite voit le code de la Matrice. Smith et les autres Agents lui tirent dessus. Neo leve la main. Les balles s'arretent en l'air. Il les laisse tomber. Il est l'Elu.", chapter: "Acte III - chapitre 17", sortOrder: 17, location: "hotel_lafayette", chars: ["neo", "smith"], notes: "Le moment le plus iconique du film. Les balles qui s'arretent, le code vert qui se revele. Neo ne combat plus la Matrice — il la comprend, il la controle. Smith tente un dernier assaut, Neo l'arrete d'une seule main, plonge en lui et le detruit de l'interieur." },
  { title: "Appel final de Neo a la Matrice", description: "Neo passe un appel depuis une cabine telephonique dans la Matrice. Il s'adresse directement au systeme : 'Je sais que vous m'ecoutez. Je vais montrer a ces gens un monde sans vous.' Il raccroche et s'envole.", chapter: "Epilogue", sortOrder: 18, location: "matrice", chars: ["neo"], notes: "La declaration de guerre. Neo promet la liberation. Il s'envole — litteralement — au-dessus de la ville. 'Wake Up' de Rage Against the Machine. Credits." }
];

for (const e of evts) {
  db.insert(schema.events).values({
    id: id(),
    title: e.title,
    description: e.description,
    chapter: e.chapter,
    sortOrder: e.sortOrder,
    locationId: locIds[e.location],
    characters: JSON.stringify(e.chars.map(c => charIds[c])),
    notes: e.notes,
    createdAt: now,
    updatedAt: now,
  }).run();
}
console.error(`[seed] ${evts.length} evenements crees`);

// ═══════════════════════════════════════════════════════════════════
// INTERACTIONS
// ═══════════════════════════════════════════════════════════════════

const inters = [
  { description: "Morpheus est le mentor absolu de Neo. Il a consacre sa vie a le trouver et croit qu'il est l'Elu. Il le guide, le forme, le protege — au point de se sacrifier pour lui. Leur relation est celle d'un pere spirituel et de son fils choisi.", nature: "mentorat / foi absolue", chars: ["neo", "morpheus"], chapter: "Acte I a III", sortOrder: 1, notes: "La foi de Morpheus est ce qui cree l'Elu. Sans quelqu'un pour croire en lui, Neo ne serait jamais devenu ce qu'il est." },
  { description: "Neo et Trinity tombent amoureux progressivement. Leur connexion est immediate (club), puis construite par le combat partage. L'amour de Trinity est le catalyseur de la prophetie — c'est elle qui le ressuscite.", nature: "amour / partenariat", chars: ["neo", "trinity"], chapter: "Acte I a III", sortOrder: 2, notes: "L'amour Neo-Trinity n'est pas un ajout romantique — c'est le MECANISME NARRATIF central. Sans cet amour, pas de resurrection, pas d'Elu." },
  { description: "Neo et Smith sont des reflets inverses. Chaque fois que Neo grandit, Smith grandit aussi. Quand Neo se libere, Smith se libere de ses contraintes de programme. Ils sont lies par un lien metaphysique que ni l'un ni l'autre ne comprend encore.", nature: "nemesis / miroir", chars: ["neo", "smith"], chapter: "Acte I a III", sortOrder: 3, notes: "Smith deteste les humains mais envie leur liberte. Neo combat le systeme mais EN FAIT PARTIE (il est une anomalie prevue). Leur dualite est le coeur philosophique du film." },
  { description: "Cypher negocie secretement avec Smith pour etre reinseree dans la Matrice. Il est pret a trahir et tuer tous ses compagnons pour retrouver une vie d'ignorance confortable. Smith accepte — un humain corrompu est plus utile qu'un humain mort.", nature: "trahison / pacte faustien", chars: ["cypher", "smith"], chapter: "Acte I - chapitre 8", sortOrder: 4, notes: "Cypher est la reponse a 'et si Neo avait choisi la pilule bleue ?' Il represente tous ceux qui preferent le confort du mensonge." },
  { description: "L'Oracle guide Neo avec des demi-verites calibrees. Elle lui dit qu'il n'est pas l'Elu (vrai a ce moment) et qu'il devra choisir entre sa vie et celle de Morpheus (le vrai test). Chaque mot est un outil de manipulation bienveillante.", nature: "prophetie / manipulation bienveillante", chars: ["neo", "oracle"], chapter: "Acte II - chapitre 9", sortOrder: 5, notes: "L'Oracle est-elle du cote de Neo ou du systeme ? Les deux. Elle joue un jeu a long terme — guider l'Elu vers un choix que les versions precedentes n'ont pas fait." },
  { description: "Morpheus et Trinity sont des freres d'armes. Trinity le respecte profondement et le suit sans question — mais elle commence a remettre en question sa foi aveugle quand Neo est en danger.", nature: "loyaute / freres d'armes", chars: ["morpheus", "trinity"], chapter: "Acte I a III", sortOrder: 6, notes: "Trinity est tiree entre sa loyaute pour Morpheus et son amour pour Neo. Quand elle choisit de suivre Neo pour sauver Morpheus, les deux loyautes s'alignent." },
  { description: "Smith interroge Morpheus avec un programme d'extraction. Il en profite pour monologuer sur son degout de l'humanite et son desir de quitter la Matrice. L'ironie : il confie ses frustrations a son prisonnier.", nature: "tortionnaire / confesseur involontaire", chars: ["smith", "morpheus"], chapter: "Acte II - chapitre 12", sortOrder: 7, notes: "La tirade de Smith sur l'humanite-virus est le moment ou il cesse d'etre un simple programme et devient un personnage. Son degout est personnel, pas professionnel." },
  { description: "Tank forme Neo en chargeant les programmes d'entrainement. Leur relation est simple et directe : Tank est impressionne, Neo est reconnaissant. Tank croit en l'Elu avec une joie pure.", nature: "camaraderie / entrainement", chars: ["tank", "neo"], chapter: "Acte I - chapitre 6", sortOrder: 8, notes: "Tank est le premier a voir le potentiel de Neo pendant l'entrainement. Son '10 heures d'affilee, c'est un record' est dit avec emerveillement." },
  { description: "Cypher trahit et tue Dozer de sang-froid, puis debranche Switch et Apoc. La trahison est totale — ces gens etaient ses compagnons pendant des annees.", nature: "trahison / meurtre", chars: ["cypher", "dozer", "switch", "apoc"], chapter: "Acte II - chapitre 11", sortOrder: 9, notes: "Cypher ne montre aucun remords. Il est trop loin dans son choix. La vitesse des meurtres amplifie l'horreur — pas de pause pour la culpabilite." },
  { description: "Le Merovingien est un vestige des anciennes Matrices. L'Oracle le connait depuis des siecles. Ils s'affrontent indirectement — elle manipule les humains vers la liberte, il manipule les programmes vers le pouvoir.", nature: "rivaux anciens / jeu d'echecs", chars: ["merovingien", "oracle"], chapter: "Hors chronologie", sortOrder: 10, notes: "Cette rivalite n'est qu'esquissee dans le premier film mais devient centrale dans la suite. Le Merovingien possede le Keymaker, que l'Oracle veut liberer." }
];

for (const i of inters) {
  db.insert(schema.interactions).values({
    id: id(),
    description: i.description,
    nature: i.nature,
    characters: JSON.stringify(i.chars.map(c => charIds[c])),
    chapter: i.chapter,
    sortOrder: i.sortOrder,
    notes: i.notes,
    createdAt: now,
    updatedAt: now,
  }).run();
}
console.error(`[seed] ${inters.length} interactions creees`);

// ═══════════════════════════════════════════════════════════════════
// REGLES DU MONDE
// ═══════════════════════════════════════════════════════════════════

const rules = [
  { category: "simulation", title: "Nature de la Matrice", description: "La Matrice est une simulation neuronale interactive partagee par des milliards d'humains. Leurs corps physiques sont dans des capsules, connectes via des cables a l'arriere du crane. La simulation reproduit le monde tel qu'il etait approximativement en 1999. Les lois de la physique y sont simulees mais PEUVENT etre contournees par ceux qui comprennent la nature virtuelle du monde.", notes: "La Matrice n'est pas parfaite. Des glitchs existent (deja-vu = modification du code). Les anomalies (humains qui sentent que quelque chose cloche) sont un bug connu." },
  { category: "simulation", title: "Pilule rouge / Pilule bleue", description: "Le choix fondamental : la pilule rouge revele la verite (extraction de la Matrice), la pilule bleue efface la memoire et renvoie dans l'ignorance. La pilule rouge est en fait un traceur qui permet de localiser le corps physique de l'humain dans les fermes.", notes: "Le choix est irreversible une fois la pilule rouge avalee. Cypher est la preuve qu'on peut regretter — mais pas revenir en arriere naturellement." },
  { category: "simulation", title: "Regles de la physique dans la Matrice", description: "Les lois physiques (gravite, vitesse, resistance des materiaux) sont des PROGRAMMES, pas des lois naturelles. Un esprit suffisamment libere peut les contourner : courir plus vite, sauter plus haut, esquiver des balles. L'Elu peut les reecrire completement. MAIS : 'le corps ne vit pas sans l'esprit' — si tu meurs dans la Matrice, tu meurs pour de vrai.", notes: "C'est la regle la plus importante du recit. Mourir dans la Matrice = mort reelle. Ca donne du poids a chaque combat." },
  { category: "programmes", title: "Les Agents", description: "Programmes sentients charges de la securite de la Matrice. Costume noir, lunettes, oreillette. Capacites surhumaines : vitesse, force, esquive de balles. Ils peuvent POSSEDER n'importe quel humain encore connecte — prendre le controle de son corps. Impossibles a tuer definitivement tant que la Matrice fonctionne.", notes: "Les Agents sont terrifiants parce que tout le monde est potentiellement un Agent. N'importe quel passant peut soudain devenir mortel. C'est la paranoia ultime." },
  { category: "programmes", title: "L'Oracle — programme de comprehension", description: "L'Oracle est un programme cree pour comprendre la psyche humaine. Son role officiel : guider l'Elu vers la Source pour rechargr la Matrice (c'est un mecanisme de controle). Son role reel : elle a choisi de guider les humains vers une liberte reelle, en jouant sur les propheties auto-realisatrices.", notes: "L'Oracle ne ment jamais — mais elle ne dit jamais toute la verite. Elle manipule par omission et par timing." },
  { category: "prophetie", title: "La prophetie de l'Elu", description: "Un homme ne DANS la Matrice aura le pouvoir de la reecrire de l'interieur et de mettre fin a la guerre. L'Oracle prophetise sa venue. Morpheus y croit. MAIS : la prophetie est un mecanisme de controle — l'Elu est une anomalie prevue, redirigee vers la Source pour rechargement. Neo est le sixieme Elu.", notes: "La prophetie est vraie ET fausse. L'Elu existe, mais son role prevu est de maintenir le systeme, pas de le detruire. Neo brise le cycle en faisant un choix different des cinq precedents : il choisit l'amour plutot que le devoir." },
  { category: "prophetie", title: "Il n'y a pas de cuillere", description: "Phrase de l'enfant prodige chez l'Oracle. La cuillere n'existe pas — c'est un programme. Pour la tordre, il ne faut pas essayer de la tordre, mais comprendre la verite : il n'y a pas de cuillere. Metaphore centrale : ce n'est pas le monde qui change, c'est la perception.", notes: "Cette phrase resume toute la philosophie du film en 6 mots. Neo la comprend intellectuellement au chapitre 9 mais ne l'integre vraiment qu'au chapitre 17 quand il arrete les balles." },
  { category: "technologie", title: "Les hoverships et les egouts", description: "Les humains libres naviguent dans d'immenses tunnels d'egouts souterrains avec des aeroglisseurs (hoverships). Ces vaisseaux ont besoin de lignes de broadcast pour se connecter a la Matrice — des points d'entree specifiques. Arme ultime : l'EMP (impulsion electromagnetique) qui detruit toute machine a portee, y compris le vaisseau lui-meme.", notes: "L'EMP est l'arme de dernier recours — elle sauve mais au prix de tout. Le Nebuchadnezzar l'utilise pour echapper aux Sentinelles." },
  { category: "technologie", title: "Entree et sortie de la Matrice", description: "Entree : via les fauteuils de connexion du vaisseau + operateur qui charge le programme. Sortie : trouver un telephone fixe (lignes terrestres) dans la Matrice et decrocher. Les telephones portables NE FONCTIONNENT PAS pour la sortie. Si la ligne est coupee, le connecte est piege.", notes: "Les telephones fixes sont les portes de sortie. C'est pourquoi les Agents coupent les lignes — pour pieger les humains." },
  { category: "societe", title: "Zion et le conseil", description: "Zion est gouvernee par un conseil d'anciens et un commandement militaire. Tensions entre les pacifistes et les bellicistes. Commander Lock represente la prudence militaire, Morpheus represente la foi et l'audace. La population celebre, prie, et se prepare a la guerre.", notes: "Zion est un melange de democratie, de theocratie et de dictature militaire. Les decisions sont prises dans l'urgence constante — la destruction est toujours imminente." },
  { category: "machines", title: "Les Sentinelles", description: "Robots de combat des machines. Forme de pieuvre metallique avec des tentacules tranchantes. Patrouillent les egouts a la recherche des hoverships humains. Operent en essaims. Seule defense efficace : l'EMP ou les tourelles de Zion.", notes: "Les Sentinelles sont la menace constante du monde reel. Elles incarnent la peur : meme hors de la Matrice, on n'est pas en securite." }
];

for (const r of rules) {
  db.insert(schema.worldRules).values({ id: id(), category: r.category, title: r.title, description: r.description, notes: r.notes, createdAt: now, updatedAt: now }).run();
}
console.error(`[seed] ${rules.length} regles du monde creees`);

// ═══════════════════════════════════════════════════════════════════
// RECHERCHES
// ═══════════════════════════════════════════════════════════════════

const researchEntries = [
  { topic: "Philosophie de Baudrillard et Simulacres", content: "Jean Baudrillard, 'Simulacres et Simulation' (1981). Le film cite directement ce livre — Neo cache ses disques pirates dedans, ouvert au chapitre 'Du nihilisme'. Baudrillard argue que la realite a ete remplacee par des symboles de la realite (simulacres) au point que le 'reel' n'existe plus. La Matrice est la mise en fiction litterale de cette theorie : le monde est un simulacre, et les humains ne savent meme pas qu'ils vivent dans une copie.", sources: JSON.stringify(["Baudrillard, J. (1981). Simulacres et Simulation. Galilee.", "Irwin, W. (2002). The Matrix and Philosophy."]), notes: "Ironiquement, Baudrillard lui-meme a dit que Matrix etait une mauvaise interpretation de son travail. Il trouvait le film trop binaire (reel vs faux) alors que son propos est que la distinction n'existe plus." },
  { topic: "Le mythe de la caverne de Platon", content: "Livre VII de La Republique. Des prisonniers enchaines dans une caverne ne voient que des ombres projetees sur un mur. Ils prennent ces ombres pour la realite. Quand l'un d'eux est libere et voit le soleil, il est d'abord aveugle puis comprend. Quand il retourne prevenir les autres, ils le prennent pour un fou. Parallele direct : la Matrice = la caverne. Les humains = les prisonniers. Neo = le libere. Le monde reel = le soleil.", sources: JSON.stringify(["Platon, La Republique, Livre VII", "Falzon, C. (2002). Philosophy Goes to the Movies."]), notes: "Le film suit exactement la structure du mythe : liberation (pilule rouge), aveuglement (Neo qui ne voit pas), illumination (arret des balles), et le desir de liberer les autres (appel final)." },
  { topic: "Symbolisme christique dans Matrix", content: "Neo = anagramme de 'One' (l'Elu). Il meurt et ressuscite. Trinity (la Trinite) le ramene a la vie par l'amour/la foi. Morpheus = le prophete Jean-Baptiste qui annonce la venue du messie. Cypher (Lucifer) trahit le groupe. Le Nebuchadnezzar porte le nom du roi babylonien des textes bibliques. Le nom 'Anderson' signifie 'fils de l'homme' (Andre + son). La chambre 303 = Trinity (3).", sources: JSON.stringify(["Fontana, P. (2003). Finding God in The Matrix.", "Garrett, G. (2003). The Gospel Reloaded."]), notes: "Le symbolisme est dense mais pas exclusivement chretien. Le bouddhisme (l'enfant a la cuillere = koan zen), l'hindouisme (le cycle de renaissance), et le gnosticisme (le monde materiel comme prison) sont aussi presents." },
  { topic: "Cyberpunk et William Gibson", content: "Matrix est l'heritier direct du mouvement cyberpunk de la SF des annees 80. William Gibson, 'Neuromancien' (1984), invente le concept de cyberespace — un espace virtuel partage ou les esprits se connectent. Les Wachowski ont toujours cite Gibson comme influence majeure. Le terme 'Matrice' lui-meme vient de Gibson. L'esthetique (cuir noir, neons, pluie, hackers) est du cyberpunk pur.", sources: JSON.stringify(["Gibson, W. (1984). Neuromancien.", "Sterling, B. (1986). Mirrorshades: The Cyberpunk Anthology."]), notes: "Gibson a dit que Matrix etait 'le summum de ce que le cyberpunk essayait de faire'. Les Wachowski ont reussi la ou d'autres avaient echoue : rendre le cyberespace visuellement credible." }
];

for (const r of researchEntries) {
  db.insert(schema.research).values({ id: id(), topic: r.topic, content: r.content, sources: r.sources, notes: r.notes, createdAt: now, updatedAt: now }).run();
}
console.error(`[seed] ${researchEntries.length} recherches creees`);

// ═══════════════════════════════════════════════════════════════════
// NOTES
// ═══════════════════════════════════════════════════════════════════

const noteEntries = [
  { content: "Idee : developper le personnage de Switch davantage. Dans le script original, Switch etait un homme dans le monde reel et une femme dans la Matrice (d'ou le nom 'Switch'). Les Wachowski, elles-memes trans, ont du abandonner cette idee pour le studio. Ca vaudrait le coup d'explorer cette dimension dans notre adaptation.", tags: JSON.stringify(["personnage", "switch", "identite", "adaptation"]) },
  { content: "Le theme de l'identite choisie vs assignee est central. Neo choisit son nom. Trinity choisit son role. Cypher choisit de revenir. Meme Smith choisit de se rebeller contre le systeme. Chaque personnage est defini par un CHOIX, pas par sa nature. C'est la these du film : l'existence precede l'essence (Sartre).", tags: JSON.stringify(["theme", "philosophie", "identite", "choix"]) },
  { content: "Note pour les dialogues : le film a un rythme de dialogue tres particulier. Les phrases sont courtes, percutantes, souvent en forme de questions rhetorique ou de koans. 'What is real?', 'There is no spoon', 'I know kung-fu'. Chaque personnage a sa voix : Morpheus est biblique, Trinity est militaire, Neo est incertain puis assertif, Smith est meprisant.", tags: JSON.stringify(["dialogue", "style", "voix"]) },
  { content: "Probleme de coherence a verifier : si la Matrice simule 1999, comment les machines alimentent-elles le systeme ? La reponse officielle (les humains comme piles) est absurde thermodynamiquement. Le script original disait que les humains servaient de processeurs (cerveau = puissance de calcul), ce qui est plus logique. A decider pour notre version.", tags: JSON.stringify(["coherence", "worldbuilding", "a-verifier"]) },
  { content: "Le film a une structure en 3 actes tres classique mais la distribution du temps est atypique : Acte I (decouverte) = 50% du film, Acte II (crise) = 25%, Acte III (resolution) = 25%. Ca donne un rythme inhabituel ou le spectateur apprend AVEC Neo. A reproduire ?", tags: JSON.stringify(["structure", "rythme", "adaptation"]) },
  { content: "Piste a explorer : et si on ecrivait une scene ou Cypher et Neo ont une conversation AVANT la trahison ? On pourrait voir Cypher tester Neo, essayer de le convaincre que la verite ne vaut pas la souffrance. Ca ajouterait de la profondeur a la trahison — Cypher ne trahit pas par mechancete mais par desespoir.", tags: JSON.stringify(["scene", "cypher", "neo", "a-ecrire"]) },
  { content: "Musique et ambiance sonore : le film utilise un contraste net entre le silence de la Matrice (tout est trop calme) et le bruit constant du monde reel (moteurs, metal, condensation). A penser pour les descriptions d'atmosphere dans la bible.", tags: JSON.stringify(["ambiance", "son", "description"]) }
];

for (const n of noteEntries) {
  db.insert(schema.notes).values({ id: id(), content: n.content, tags: n.tags, createdAt: now, updatedAt: now }).run();
}
console.error(`[seed] ${noteEntries.length} notes creees`);

// ═══════════════════════════════════════════════════════════════════
// RESUME
// ═══════════════════════════════════════════════════════════════════

console.error("\n[seed] === SEED TERMINE ===");
console.error(`  Personnages    : ${chars.length}`);
console.error(`  Lieux          : ${locs.length}`);
console.error(`  Evenements     : ${evts.length}`);
console.error(`  Interactions   : ${inters.length}`);
console.error(`  Regles du monde: ${rules.length}`);
console.error(`  Recherches     : ${researchEntries.length}`);
console.error(`  Notes          : ${noteEntries.length}`);
console.error(`  TOTAL          : ${chars.length + locs.length + evts.length + inters.length + rules.length + researchEntries.length + noteEntries.length}`);
console.error(`\n  DB: ${dbPath}`);

sqlite.close();
