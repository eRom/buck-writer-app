#!/usr/bin/env tsx
/**
 * Ingestion : "Les Souvenirs du mal" — Philippe
 * Source    : tests/souvenirs-du-mal-phil.md (350 Ko, extraction Claude mai 2026)
 * Usage     : tsx scripts/ingest-souvenirs-du-mal.ts
 */
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOW = Date.now();
const uid = () => randomUUID();

const DB_PATHS = [
  path.resolve(__dirname, "../../..", "data/bible/bible.db"),
  path.resolve(__dirname, "..", "data/bible.db"),
];

// ─────────────────────────────────────────────────────────────────────
// UUIDs pré-assignés pour les cross-références
// ─────────────────────────────────────────────────────────────────────
const C = {
  CORINNE:      uid(), PATRICK:     uid(), INCONNU:   uid(),
  EMMA:         uid(), DOUVIER:     uid(), CHAMBERTIN: uid(),
  LAROCHE:      uid(), LEROCK:      uid(), NICOLAS:   uid(),
  OLIVIA:       uid(), FEMME_DOUV: uid(), SIMON:      uid(),
  PATXI:        uid(), ALESSIA:     uid(), SERGE:     uid(),
  ADELINA:      uid(), JUMEAU:      uid(), CAPTIVE8:  uid(),
  VANESSA:      uid(), ELODY:       uid(), DOMINIQUE: uid(),
  DELPHINE:     uid(), OLIVIER:     uid(), POUJEAUX:  uid(),
  LASCOMBES:    uid(), STEPHANIE:   uid(), ERIC:      uid(),
} as const;

const L = {
  DEMEURE:      uid(), LOFT_PATRICK:  uid(), APPART_OLIVIA: uid(),
  PAVILLON_EMMA:uid(), FORET_PAV:     uid(), BARLONG:       uid(),
  PETIT_BASQUE: uid(), MARCHE:        uid(), APPART_SIMON:  uid(),
  ESCALE:       uid(), COMMISSARIAT:  uid(), FLORENCE:      uid(),
  SABLES:       uid(), PLAGE_SABLES:  uid(), PORNICHET:     uid(),
  CAMPING:      uid(), DEMEURE_CAP8:  uid(), MARSEILLE:     uid(),
  BAR_REMBLAI:  uid(), WILTON:        uid(), APPART_VAN:    uid(),
  PIECE_DET:    uid(), ANNEMASSE:     uid(), LYON:          uid(),
  CALIFORNIE:   uid(), MAISON_LAS:    uid(), APPART_SMERMER:uid(),
  TONNEAU:      uid(), CLUB_HOUSE:    uid(), CEVENNES:      uid(),
  QUANTICO:     uid(),
} as const;

// ─────────────────────────────────────────────────────────────────────
// PERSONNAGES
// ─────────────────────────────────────────────────────────────────────
const characters = [
  {
    id: C.CORINNE,
    name: "Corinne Ledillard",
    description: "Première victime du tueur en série. Femme de Patrick Ledillard, gérante d'un magasin de vêtements de marque pour homme. Née en 1983, mariée depuis quatre ans au moment de sa mort.",
    traits: JSON.stringify({ physical: ["cheveux longs bruns", "corps avantageux aux rondeurs naturelles", "fessier musclé", "porte des escarpins et des bottes"], personality: ["impatience légendaire", "soucieuse de son apparence", "aime sa demeure", "calme sous pression"] }),
    background: "Vivait dans un modeste appartement avant de rencontrer Patrick. A eu une liaison secrète de 3 mois avec l'inconnu avant son mariage. A rencontré Patrick quand il est entré dans son magasin. Patrick lui a offert son loft puis la grande demeure bourgeoise comme cadeau de mariage.",
  },
  {
    id: C.PATRICK,
    name: "Patrick Ledillard",
    description: "Mari de Corinne Ledillard. Responsable commercial dans une entreprise américaine de matériel informatique. Souvent absent pour son travail.",
    traits: JSON.stringify({ physical: [], personality: ["riche", "souvent absent"] }),
    background: "A rencontré Corinne en entrant dans son magasin de vêtements. Lui a offert son loft puis la grande demeure bourgeoise comme cadeau de mariage. Était à Marseille au moment du meurtre de Corinne — alibi vérifié par la police.",
  },
  {
    id: C.INCONNU,
    name: "L'inconnu / Le tueur",
    description: "Tueur en série dont l'identité n'est pas révélée dans les chapitres 1 à 13. Ex-amant de Corinne Ledillard. Psychopathe méthodique qui planifie ses crimes pendant des mois, se déguise en livreur express, prévient lui-même la police après chaque meurtre.",
    traits: JSON.stringify({ physical: ["portait moustache, casquette, lunettes de soleil pour son déguisement de livreur", "sourire insidieux"], personality: ["calme et calculateur", "méticuleux", "sadique", "fumeur de cigares havanais Churchill", "amateur de whisky Talisker", "écoute musique tropicale", "rancunier", "obsessionnel", "maîtrise absolue de la situation", "jubile en prévenant la police"] }),
    background: "A rencontré Corinne chez son ami Nicolas quelques semaines avant le mariage de Corinne. Liaison secrète de 3 mois. Corinne a mis fin à la relation en cessant tout contact. Prétend avoir été trahi par quatre femmes. A eu une relation sentimentale avec Delphine il y a 5 ans — rupture brutale de sa part. A sévi dans plusieurs régions : Cévennes (premier meurtre chronologique), Annemasse, Lyon, et la ville du roman. Laisse un cigare cubain sur chaque scène. Appelle systématiquement la police en donnant l'adresse de la victime encore en vie mais trop tard.",
  },
  {
    id: C.EMMA,
    name: "Emma Andrénetti",
    description: "Commissaire de police, enquêtrice principale sur l'affaire des meurtres en série. Amie intime et ancienne amoureuse de Simon. Petite trentaine. Conduit une Triumph TR6 de 1974 vert anglais.",
    traits: JSON.stringify({ physical: ["ravissante", "silhouette élégante", "lèvres fardées brun café", "chevelure de mèches laquées", "dos nu et musclé", "porte bottes et pantalon en cuir"], personality: ["intuitive", "autoritaire", "directe", "déterminée", "impatiente des résultats", "courageuse", "parfois vulgaire quand elle boit"] }),
    background: "A grandi dans une grande demeure similaire à celle des Ledillard. Possède un pavillon. A rencontré Simon en août 1985 lors d'un concours de pétanque dans un camping. Relation amoureuse de deux ans avec Simon, soldée par un échec. Dirige une brigade : Douvier, Laroche, Chambertin. Fait appel à Hubert Lascombes comme consultant en psycho-criminologie.",
  },
  {
    id: C.DOUVIER,
    name: "Douvier",
    description: "Lieutenant de police, adjoint et bras droit d'Emma Andrénetti. Sérieux, méthodique, fiable. Marié. Pointure 42. Connaisseur en cigares Churchill et en whiskys écossais.",
    traits: JSON.stringify({ physical: ["chausse du 42", "porte des mocassins"], personality: ["sérieux", "méticuleux", "naturel et franc", "patient", "connaisseur en cigares et whiskys", "passionné de cuisine"] }),
    background: "Marié — profite de l'absence de sa femme pour fumer ses havanes (problèmes d'estomac lui imposent la modération). Un des trois premiers policiers à pénétrer dans la demeure Ledillard. A établi le procès-verbal de description des lieux.",
  },
  {
    id: C.CHAMBERTIN,
    name: "Chambertin",
    description: "Inspecteur de police dans l'équipe d'Emma Andrénetti. Fumeur. Parfois désinvolte et sarcastique.",
    traits: JSON.stringify({ physical: [], personality: ["fumeur", "sarcastique", "pragmatique", "parfois présomptueux"] }),
    background: "Membre de la brigade d'Emma. A vérifié la piste du quad volé, les traces de pneus rechapés, les sex-shops de la ville. A découvert l'emplacement de départ du tueur et retrouvé le quad brûlé à 6 km.",
  },
  {
    id: C.LAROCHE,
    name: "Laroche",
    description: "Inspecteur de police (prénom : Maxime) dans l'équipe d'Emma Andrénetti. Intuitif, observateur. Emma l'appelle par son prénom.",
    traits: JSON.stringify({ physical: [], personality: ["analytique", "intuitif", "réfléchi", "tenace"] }),
    background: "Chargé d'enquêter sur l'entourage des victimes et les passés qui semblent trop lisses. A été chargé d'aller chercher Patrick Ledillard à l'aéroport.",
  },
  {
    id: C.LEROCK,
    name: "Lerock (Docteur Laroch)",
    description: "Médecin légiste. Intervient sur les scènes de crime et réalise les autopsies. Transmet ses résultats par fax.",
    traits: JSON.stringify({ physical: [], personality: ["rigoureux", "précis", "catégorique dans ses conclusions"] }),
    background: "A autopsié Corinne Ledillard : rapport sexuel avant la mort, corps nettoyé, pubis rasé post-mortem, gifle, 25 incisions au scalpel, 10 brûlures, 4 incisions profondes aux poignets (cause du décès). Agonie d'au moins une heure. Cigare Churchill fumé sur place sans trace de salive. A également confirmé l'absence de violence sexuelle caractérisée sur Mme Ledillard.",
  },
  {
    id: C.NICOLAS,
    name: "Nicolas",
    description: "Ami de l'inconnu. Connaissait Patrick et Corinne Ledillard comme voisins. C'est lors d'une soirée chez lui que l'inconnu a rencontré Corinne.",
    traits: JSON.stringify({ physical: [], personality: ["plaisantin", "farceur"] }),
    background: "A invité Patrick et Corinne (ses voisins) à une soirée où l'inconnu était présent.",
  },
  {
    id: C.OLIVIA,
    name: "Olivia",
    description: "Meilleure amie de Corinne Ledillard. Jeune et séduisante. A accueilli la dernière soirée de célibataire de Corinne.",
    traits: JSON.stringify({ physical: ["jeune", "séduisante"], personality: ["observatrice", "discrète", "complice"] }),
    background: "Meilleure amie de Corinne. C'est chez elle (et Nicolas) qu'ont eu lieu la soirée de rencontre avec l'inconnu et la dernière soirée de célibataire de Corinne.",
  },
  {
    id: C.FEMME_DOUV,
    name: "La femme de Douvier",
    description: "Épouse de Douvier. Personnage secondaire, mentionné uniquement.",
    traits: JSON.stringify({ physical: [], personality: [] }),
    background: "Parfois absente, ce qui permet à Douvier de fumer ses cigares sans contraintes domestiques.",
  },
  {
    id: C.SIMON,
    name: "Simon",
    description: "Ami intime et ancien amant d'Emma Andrénetti. Ex-commercial, sans emploi depuis 4 mois. Écrit un roman policier/thriller inspiré des anecdotes criminelles d'Emma.",
    traits: JSON.stringify({ physical: [], personality: ["romantique", "attentionné", "plaisantin", "curieux", "fasciné par les affaires criminelles", "espiègle", "nonchalant", "passionné de cuisine"] }),
    background: "A rencontré Emma en août 1985 lors d'un concours de pétanque dans un camping. Correspondance épistolaire un an, puis relation amoureuse deux ans — échec douloureux. La considère comme la femme de sa vie. Ancien commercial 7 ans, licencié pour baisse de chiffre. A un frère jumeau. Ses parents ont cédé leur maison de bord de mer à des promoteurs contre deux appartements — il les a fusionnés en un 150m² avec deux terrasses vue sur la baie.",
  },
  {
    id: C.PATXI,
    name: "Patxi",
    description: "Propriétaire et barman du Petit Basque. Ami de Simon. Basque d'origine, émigré en Bretagne pour raisons politiques liées au mouvement nationaliste basque.",
    traits: JSON.stringify({ physical: ["voix grave", "accent basque prononcé"], personality: ["courageux (sens de son prénom en basque)", "accueillant", "entreprenant", "discret", "franc"] }),
    background: "A quitté le Pays Basque pour des raisons politiques, contraint de se faire oublier des autorités. Arrivé en Bretagne sans contacts, a repris son métier de barman et racheté un petit bar qu'il a rénové dans un style Rock'n'roll révolutionnaire.",
  },
  {
    id: C.ALESSIA,
    name: "Alessia",
    description: "Jeune femme franco-italienne originaire de Florence. Rencontre d'un soir avec Simon au Petit Basque.",
    traits: JSON.stringify({ physical: ["carré plongeant", "yeux turquoise", "brune", "épaules dénudées", "dos finement musclé"], personality: ["directe", "assurée", "provocatrice", "classe", "indépendante"] }),
    background: "Née à Florence, y a passé toute son adolescence. Ses parents — Serge et Adélina — dirigeaient une fabrication de vêtements en Italie avant d'émigrer en France pour raisons économiques. A opté pour la nationalité française. Simon était commercial chez leur fournisseur principal.",
  },
  {
    id: C.SERGE,
    name: "Serge",
    description: "Père d'Alessia. Copropriétaire du magasin L'Escale du Pécheur avec son épouse Adélina.",
    traits: JSON.stringify({ physical: [], personality: [] }),
    background: "Ancien dirigeant d'une fabrication de vêtements en Italie. Emigré en France pour raisons économiques. Marié à Adélina. Tient L'Escale du Pécheur depuis une quinzaine d'années.",
  },
  {
    id: C.ADELINA,
    name: "Adélina",
    description: "Mère d'Alessia. Copropriétaire du magasin L'Escale du Pécheur avec son époux Serge.",
    traits: JSON.stringify({ physical: [], personality: [] }),
    background: "Ancienne dirigeante d'une fabrication de vêtements en Italie avec Serge. Emigrée en France. Tient L'Escale du Pécheur depuis une quinzaine d'années.",
  },
  {
    id: C.JUMEAU,
    name: "Le frère jumeau de Simon",
    description: "Frère jumeau de Simon, inséparable dans leur jeunesse. Taquinait Simon sur son coup de foudre pour Emma.",
    traits: JSON.stringify({ physical: [], personality: ["pragmatique", "direct", "taquineur"] }),
    background: "Jumeau de Simon. Présent lors du concours de pétanque au camping en août 1985 où Simon a rencontré Emma.",
  },
  {
    id: C.CAPTIVE8,
    name: "La captive (chapitre 8)",
    description: "Femme séquestrée dans sa propre demeure luxueuse par le meurtrier au chapitre 8. Cheveux blonds longs. Connaissait son agresseur avant l'attaque. Identité non révélée.",
    traits: JSON.stringify({ physical: ["longs cheveux blonds"], personality: ["résistante mentalement", "courageuse", "essaie de ne pas céder à la panique"] }),
    background: "Était en train de ranger ses courses quand on a frappé à sa porte. A ouvert à un homme déguisé en livreur express. L'a reconnu quand il a ôté son déguisement ('Surprise!'). Ligotée ventre contre terre avec du fil de fer (technique Papillon), séquestrée dans sa salle de bain luxueuse.",
  },
  {
    id: C.VANESSA,
    name: "Vanessa",
    description: "Femme résidant en bord de mer avec Elody. Habituée de la plage des Sables. Connaissait Corinne Ledillard pour l'avoir fréquentée lors de fêtes.",
    traits: JSON.stringify({ physical: [], personality: ["amoureuse du soleil et de la plage", "lectrice assidue du journal", "sensible", "discrète sur ses émotions"] }),
    background: "Vit en couple avec Elody dans un appartement en bord de mer acquis après une longue attente. A chanté et dansé avec Corinne lors d'une fête l'été précédant le meurtre.",
  },
  {
    id: C.ELODY,
    name: "Elody",
    description: "Compagne de Vanessa. Co-propriétaire de l'appartement en bord de mer. Homosexualité assumée et affichée.",
    traits: JSON.stringify({ physical: [], personality: ["fêtarde", "légère", "tendre"] }),
    background: "Vit en couple avec Vanessa. Fait partie des habitués de la plage des Sables et du Wilton-Club.",
  },
  {
    id: C.DOMINIQUE,
    name: "Dominique (Dom)",
    description: "Patronne du bar du remblai sur la plage des Sables. Surnommée 'Dom' par les fidèles. Mixe elle-même la musique.",
    traits: JSON.stringify({ physical: [], personality: ["franc-parler", "en apparence bourrue, en réalité drôle et sympathique", "accueil selon son humeur"] }),
    background: "Attirée par le même sexe une quinzaine d'années auparavant. A fait de Vanessa et Elody ses clientes favorites.",
  },
  {
    id: C.DELPHINE,
    name: "Delphine",
    description: "Victime du tueur au chapitre 10. A eu une relation avec le tueur il y a 5 ans, qu'elle a rompue brutalement. Mariée à Olivier.",
    traits: JSON.stringify({ physical: [], personality: ["prend ses décisions sur un coup de tête", "indépendante", "avait besoin de solitude périodique"] }),
    background: "Mariée à Olivier. A rencontré le tueur lors d'une période de solitude (mari absent). L'a quitté sans explication et est retournée auprès de son mari. A encouragé Olivier à partir en week-end pour être seule. Enlevée, torturée (attachée crucifiée, corps lacéré), laissée pour morte. Le tueur a appelé les secours en donnant son adresse : 18 avenue des roses.",
  },
  {
    id: C.OLIVIER,
    name: "Olivier",
    description: "Mari de Delphine. Absent en week-end entre amis au moment de l'enlèvement de sa femme.",
    traits: JSON.stringify({ physical: ["visage et sourire classiques mais séduisants", "goût pour les belles choses"], personality: [] }),
    background: "Mari de Delphine. Parti en week-end à l'encouragement de sa femme, au moment où le tueur s'est présenté chez elle.",
  },
  {
    id: C.POUJEAUX,
    name: "Poujeaux",
    description: "Divisionnaire de police. Supérieur hiérarchique direct d'Emma Andrénetti. Préoccupé par les relations avec la presse.",
    traits: JSON.stringify({ physical: ["porte des lunettes"], personality: ["prudent vis-à-vis de la presse", "sceptique", "expérimenté"] }),
    background: "Divisionnaire, supérieur d'Emma. Confie la totalité de l'enquête à Emma. Saisit officiellement l'OCLCO. Accorde des renforts à Emma. Gère la communication avec les médias.",
  },
  {
    id: C.LASCOMBES,
    name: "Hubert Lascombes",
    description: "Profiler et consultant en psycho-criminologie. Ancien commandant de police français, formé à l'école du FBI à Quantico. Engagé par Emma sur l'affaire. Cinquantaine approchante, cheveux courts grisonnants, barbe taillée.",
    traits: JSON.stringify({ physical: ["cinquantaine approchante", "cheveux courts grisonnants", "barbe taillée", "traits marqués par le temps et les épreuves", "carrure équilibrée", "élégance naturelle"], personality: ["calme", "posé", "analytique", "charisme discret", "protecteur", "rassurant", "sang-froid étonnant"] }),
    background: "Ancien commandant de police démissionné pour s'installer aux États-Unis. Sa famille a été massacrée et décapitée par un tueur en série à peine arrivé. A collaboré avec le FBI, intégré l'école de Quantico, créé un fichier classant le degré d'agressivité des criminels. A traité des affaires en Belgique, Allemagne et Espagne (jardinier 'The granny rapist'). Sa femme Stéphanie, paysagiste, est décédée.",
  },
  {
    id: C.STEPHANIE,
    name: "Stéphanie",
    description: "Épouse décédée de Hubert Lascombes. Paysagiste reconnue. A conçu et entretenu le jardin multi-niveaux de la maison de Lascombes.",
    traits: JSON.stringify({ physical: [], personality: ["passionnée de jardinage", "chef d'orchestre du jardin"] }),
    background: "Passée de petite jardinière du dimanche à paysagiste reconnue en quelques années. Décédée avant les événements du roman.",
  },
  {
    id: C.ERIC,
    name: "Éric",
    description: "Ami de Simon. Partagent le goût des vacances à la plage et des sorties nocturnes.",
    traits: JSON.stringify({ physical: [], personality: ["festif", "noctambule", "amateur de plage"] }),
    background: "Ami de Simon. Ensemble, ils ont établi un record de 7h30 passées sur la plage en une journée.",
  },
];

// ─────────────────────────────────────────────────────────────────────
// LIEUX
// ─────────────────────────────────────────────────────────────────────
const locations = [
  {
    id: L.DEMEURE,
    name: "La demeure bourgeoise des Ledillard",
    description: "Immense maison bourgeoise avec façade blanche, hauts murs blancs, longue allée de gravier bordée de grands chênes, située à quelques kilomètres d'une grande ville. Escalier à vis en pierre (style manoir anglais). Parquet en chêne massif. Chambre au 1er étage avec moquette épaisse et placards à persiennes. Grand salon-bibliothèque, canapés face à face, murs en chaux jaune pâle, tommettes cirées, grande table thaïlandaise, portes-fenêtres. Bar bien garni. Cuisine plan de travail bois exotique. Porte de jardin forcée par le tueur.",
    atmosphere: "Élégance, confort, raffinement, calme. Odeurs de mousse et de fougères. Cachée des regards. Scène du premier meurtre.",
    geography: "À quelques kilomètres d'une grande ville en Bretagne. Accessible depuis Barlong : à droite en sortant du bourg puis deuxième à gauche. Proche d'un sentier se fondant dans une forêt.",
  },
  {
    id: L.LOFT_PATRICK,
    name: "Le loft de Patrick Ledillard",
    description: "Immense loft avec décoration nautique inspirée des anciens voiliers de luxe. Pierre, bois et verre en grands espaces. Larges baies vitrées. Parquet huilé en teck massif évoquant le pont d'un bateau. Toute la décoration conçue sur le thème maritime.",
    atmosphere: "Invitation au voyage, détente, confort, style. Ambiance de bateaux anciens.",
    geography: "Non précisée.",
  },
  {
    id: L.APPART_OLIVIA,
    name: "L'appartement de Nicolas et Olivia",
    description: "Appartement avec salon (canapé), salle de bain (baignoire), couloir. Lieu des soirées chez Nicolas où l'inconnu a rencontré Corinne, et de la dernière soirée de célibataire de Corinne.",
    atmosphere: "Intime, lieu de confidences.",
    geography: "Non précisée.",
  },
  {
    id: L.PAVILLON_EMMA,
    name: "Le pavillon d'Emma Andrénetti",
    description: "Pavillon avec véranda en bois laqué double vitrage feuilleté, donnant sur un jardin. Terrasse en dalle calcaire de Bourgogne avec pergola en teck naturel. Parterre de rosiers, petites statues, banc au design épuré. Nombreuses plantes et cactus. Méridienne en rotin tressé dans la véranda.",
    atmosphere: "Calme, cocooning, atmosphère de détente et de soin personnel.",
    geography: "En Bretagne.",
  },
  {
    id: L.FORET_PAV,
    name: "La forêt de Pavotière",
    description: "Forêt traversée par Emma en voiture pour se rendre sur la scène du crime, dans une nuit de tempête d'avril.",
    atmosphere: "Sombre, nuit de tempête, bourrasques et pluie violente.",
    geography: "Sur le trajet entre le domicile d'Emma et le bourg de Barlong.",
  },
  {
    id: L.BARLONG,
    name: "Barlong",
    description: "Bourg à traverser pour accéder à la demeure des Ledillard. En sortant, prendre à droite puis la deuxième à gauche.",
    atmosphere: "Village de province calme.",
    geography: "Après la forêt de Pavotière, en Bretagne.",
  },
  {
    id: L.PETIT_BASQUE,
    name: "Le Petit Basque",
    description: "Bar atypique rénové par Patxi. Lambris orange effet détrempé, tables et banquettes en bois arrondies, éclairage en appliques murales verre dépoli. Sur les murs : portraits de Che Guevara, Ramones, Poncho Villa, Iggy Pop, Noirs Désir, Emiliano Zapata, Angus Young. Drapeau Breton et drapeau Basque. Musique style Tarantino (Kill Bill, Pulp Fiction).",
    atmosphere: "Rock'n'roll révolutionnaire, chaleureuse et conviviale. Clientèle habituée et nocturne.",
    geography: "Dans une petite rue étroite entièrement pavée, en Bretagne.",
  },
  {
    id: L.MARCHE,
    name: "Le Marché Couvert",
    description: "Marché couvert de la ville, fréquenté par des commerçants, gitans et charlatans. Entouré de bars. Simon y allait depuis enfant avec ses parents pour acheter des huîtres.",
    atmosphere: "Animé, lieu de vie populaire.",
    geography: "En ville, en Bretagne.",
  },
  {
    id: L.APPART_SIMON,
    name: "Appartement de Simon (en ville)",
    description: "Appartement au quatrième étage avec salon donnant sur un parking, cuisine donnant sur l'extérieur, une chambre avec tenture mexicaine et moquette jaune, volets en espagnolette. Dispose d'un bar.",
    atmosphere: "Intime, chaleureux, décoré avec goût. Ambiance romantique lors des dîners.",
    geography: "En ville, en Bretagne, à quelques minutes du Petit Basque.",
  },
  {
    id: L.ESCALE,
    name: "L'Escale du Pécheur",
    description: "Magasin de vêtements marins tenu par les parents d'Alessia, Serge et Adélina.",
    atmosphere: "Commerce maritime.",
    geography: "En ville, en Bretagne.",
  },
  {
    id: L.COMMISSARIAT,
    name: "Commissariat de police",
    description: "Bâtiment avec escaliers, parking, salle de réunion. Bureau d'Emma : petit bureau avec une unique fenêtre donnant sur des blocs de béton, machine à café dans le couloir, vue sur la ville bétonnée sous pluie diluvienne. Bureau de Douvier : vieux bureau en métal rouillé, siège de peu de valeur, cendrier, panneau d'affichage avec photos du meurtre.",
    atmosphere: "Blafard, bourdonnement des néons, tendu lors des réunions d'enquête.",
    geography: "En ville.",
  },
  {
    id: L.FLORENCE,
    name: "Florence (Italie)",
    description: "Ville natale d'Alessia, où elle a passé toute son adolescence. Lieu où ses parents dirigeaient une fabrication de vêtements avant d'émigrer en France.",
    atmosphere: "Ville d'attache sentimentale pour Alessia.",
    geography: "Italie.",
  },
  {
    id: L.SABLES,
    name: "Les Sables-d'Olonne",
    description: "Station balnéaire en bord de mer sur la côte atlantique. Front de mer impressionnant créé par des promoteurs. La 'plus belle plage d'Europe' selon Simon. Lieu de triathlon national. Ancienne promenade de bord de mer transformée en station huppée.",
    atmosphere: "Ensoleillée, animée en été, lieu d'évasion et de festivités.",
    geography: "Côte atlantique française.",
  },
  {
    id: L.PLAGE_SABLES,
    name: "La grande plage des Sables",
    description: "Immense plage de sable fin, très fréquentée en période estivale. Son étendue varie selon les marées (un après-midi sur deux recouverte de moitié lors des forts coefficients). Terrain de jeux colossal deux mois durant.",
    atmosphere: "Animée, festive, rires, conversations, bruit des vagues. Lieu de convivialité pour les habitués.",
    geography: "Station balnéaire des Sables-d'Olonne, côte atlantique.",
  },
  {
    id: L.PORNICHET,
    name: "Pornichet",
    description: "Ville côtière appréciée d'Emma. Elle dit qu'elle aurait dû y acheter son appartement.",
    atmosphere: null,
    geography: "Côte atlantique française.",
  },
  {
    id: L.CAMPING,
    name: "Le camping (août 1985)",
    description: "Camping où Simon et Emma se sont rencontrés en août 1985 lors d'une finale de pétanque. Dispose de sanitaires communs, emplacements pour tentes, organisation de concours de pétanque.",
    atmosphere: "Vacances estivales, ambiance de camping provincial.",
    geography: "Non précisée.",
  },
  {
    id: L.DEMEURE_CAP8,
    name: "Demeure de la captive (chapitre 8)",
    description: "Grande demeure luxueuse. Vaste salon avec enfilade de grandes fenêtres, parquet en chêne blond, murs blancs immaculés, escalier aux courbes arrondies en bois et métal patiné. Bar caché dans les accoudoirs d'un canapé blanc. Salle de bain avec carreaux de marbre vieilli, sol en terre cuite espagnole, vasques aux essences nobles, robinetterie rétro.",
    atmosphere: "Espace lumineux, architecture pure et calculée, intime et chaleureuse. Plafonds très hauts. Lieu de séquestration de la captive.",
    geography: "Non précisée.",
  },
  {
    id: L.MARSEILLE,
    name: "Marseille",
    description: "Ville où Patrick Ledillard se trouvait pour une réunion et un séminaire professionnel au moment du meurtre de sa femme. Alibi vérifié.",
    atmosphere: null,
    geography: "Sud de la France.",
  },
  {
    id: L.BAR_REMBLAI,
    name: "Le bar du remblai",
    description: "Bar situé au beau milieu du remblai de la plage des Sables. Devenu au fil des années le lieu essentiel pour se faire voir, connaître et se tenir au courant des fêtes. Musique hétéroclite mixée par Dominique (Dom).",
    atmosphere: "Lieu de rencontre social, animé, musical.",
    geography: "Front de mer, remblai, plage des Sables-d'Olonne.",
  },
  {
    id: L.WILTON,
    name: "Le Wilton-Club",
    description: "Discothèque favorite de Vanessa et Elody.",
    atmosphere: "Endiablée, nuits festives.",
    geography: "Près de la station balnéaire, localisation précise non mentionnée.",
  },
  {
    id: L.APPART_VAN,
    name: "L'appartement de Vanessa et Elody",
    description: "Appartement en bord de mer acquis après une longue attente par Vanessa et Elody. Leur fierté de propriétaires.",
    atmosphere: "Propriété valorisée, symbole de fierté.",
    geography: "En bordure de mer, station balnéaire.",
  },
  {
    id: L.PIECE_DET,
    name: "La pièce de détention (18 avenue des roses)",
    description: "Endroit choisi par le tueur pour séquestrer Delphine. Ambiance pesante et calfeutrée, temps arrêté, poussière et innombrables toiles d'araignées. Vieux outils rouillés ou mangés par le temps, une faux médiévale rongée par la corrosion, une vieille hache plantée dans un billot. Un vieux canapé. Delphine y est attachée debout en position de croix.",
    atmosphere: "Pesante, calfeutrée, effrayante. Lumière à la fois trop basse et aveuglante.",
    geography: "18 avenue des roses (adresse donnée par le tueur aux secours).",
  },
  {
    id: L.ANNEMASSE,
    name: "Annemasse",
    description: "Ville mentionnée comme lieu d'un meurtre similaire au mode opératoire du tueur en série, enquête toujours en cours au moment des événements.",
    atmosphere: null,
    geography: "France, sud-est.",
  },
  {
    id: L.LYON,
    name: "Lyon",
    description: "Ville mentionnée comme lieu d'un autre meurtre similaire au mode opératoire du tueur en série, enquête toujours en cours.",
    atmosphere: null,
    geography: "France, sud-est.",
  },
  {
    id: L.CALIFORNIE,
    name: "Californie (États-Unis)",
    description: "État américain où Lascombes s'était installé avec sa famille et où sa femme et ses enfants ont été assassinés par un tueur en série local. Les têtes des victimes retrouvées dans le congélateur du tueur.",
    atmosphere: null,
    geography: "États-Unis, côte ouest.",
  },
  {
    id: L.MAISON_LAS,
    name: "Maison de Lascombes",
    description: "Petit salon intime avec bibliothèque, canapés, murs en patine ocre orangée, dalles de pierre reconstituées en opus romains. Collection d'antiquités ramenées des États-Unis, poteries californiennes, statuettes rustiques aux couleurs vives, pièces d'art contemporain. Jardin à plusieurs niveaux : lys, iris, rosiers grimpants, cabane en bois, arbres fruitiers, vignes vierges, terrasse ombragée avec mobilier épuré, poteries avec cactus.",
    atmosphere: "Élégant, subtil, réfléchi. Chaque objet placé intentionnellement. Air frais et doucement parfumé dans le jardin.",
    geography: "Non précisée.",
  },
  {
    id: L.APPART_SMERMER,
    name: "Appartement de Simon (front de mer)",
    description: "Appartement de 150 m², deux terrasses attenantes, vue imprenable sur la mer et l'ensemble de la baie. Résultat de la fusion de deux appartements obtenus lors de la vente de la maison familiale aux promoteurs. Parmi les biens les plus chers et prisés du parc immobilier de la station.",
    atmosphere: "Chaleureux, lumineux. Vue sur l'horizon. Terrasse ombragée sous un immense parasol en toile multicolore.",
    geography: "Front de mer, côte atlantique, Les Sables-d'Olonne.",
  },
  {
    id: L.TONNEAU,
    name: "Le Tonneau",
    description: "Restaurant préféré de Simon. Cuisine traditionnelle au feu de bois. Incontournable et authentique par son accueil.",
    atmosphere: "Chaleureux, authentique, cuisine au feu de bois.",
    geography: "Non précisée, près des Sables-d'Olonne.",
  },
  {
    id: L.CLUB_HOUSE,
    name: "Le Club House",
    description: "Boîte de nuit fréquentée régulièrement par Simon et Emma. Dispose d'une piste de danse avec des plots sur lesquels les clients peuvent monter danser.",
    atmosphere: "Festif, musical. Slows puis morceaux de plus en plus dansants.",
    geography: "Non précisée, près des Sables-d'Olonne.",
  },
  {
    id: L.CEVENNES,
    name: "Région des Cévennes",
    description: "Lieu du premier meurtre chronologique de la série commis par le tueur, passé complètement sous les radars des services de police.",
    atmosphere: null,
    geography: "Région des Cévennes, France.",
  },
  {
    id: L.QUANTICO,
    name: "Quantico (FBI)",
    description: "École de formation du FBI où Lascombes a été intégré après sa collaboration avec les services américains suite au massacre de sa famille. Il y a créé un fichier classant le degré et le pouvoir d'agressivité des criminels.",
    atmosphere: null,
    geography: "États-Unis.",
  },
];

// ─────────────────────────────────────────────────────────────────────
// ÉVÉNEMENTS (sort_order global sur l'ensemble du roman)
// ─────────────────────────────────────────────────────────────────────
type Event = {
  id: string; title: string; description: string; chapter: string;
  sort_order: number; location_id: string | null; characters: string; notes: string | null;
};

const events: Event[] = [
  // ── Chapitre 1 ──────────────────────────────────────────────────────
  { id: uid(), chapter: "1", sort_order: 10, location_id: L.DEMEURE,
    title: "Corinne rentre seule à la demeure",
    description: "Corinne arrive à son domicile en Land Rover, décharge les courses, monte se changer. Patrick est absent — ne devait rentrer que le dimanche. Elle prévoit une soirée télé au calme.",
    characters: JSON.stringify([C.CORINNE]), notes: null },
  { id: uid(), chapter: "1", sort_order: 20, location_id: L.DEMEURE,
    title: "L'inconnu observe Corinne depuis le placard",
    description: "Caché dans le placard de la chambre derrière des persiennes, l'inconnu observe Corinne qui se déshabille. Il contrôle sa respiration et son pouls pour rester calme. A planifié ce moment pendant des mois.",
    characters: JSON.stringify([C.INCONNU, C.CORINNE]), notes: null },
  { id: uid(), chapter: "1", sort_order: 30, location_id: L.DEMEURE,
    title: "L'inconnu surgit et s'empare de Corinne",
    description: "L'inconnu sort du placard et surgit derrière Corinne pendant qu'elle se dégrafe son soutien-gorge. Corinne le reconnaît après un moment de stupeur. Elle tente de se défendre et menace d'appeler la police. Il la force à s'agenouiller, la gifle violemment. Elle perd connaissance. Il la ligote aux montants du lit.",
    characters: JSON.stringify([C.INCONNU, C.CORINNE]), notes: null },
  { id: uid(), chapter: "1", sort_order: 40, location_id: L.DEMEURE,
    title: "L'inconnu torture Corinne et la laisse mourir",
    description: "L'inconnu viole Corinne ligotée, lui brûle le corps avec sa cigarette (plus d'une vingtaine de brûlures). Il lui reproche sa conduite passée et lui explique sa vengeance. Il lui montre une panoplie d'instruments tranchants et procède aux lacérations.",
    characters: JSON.stringify([C.INCONNU, C.CORINNE]), notes: null },
  { id: uid(), chapter: "1", sort_order: 50, location_id: L.DEMEURE,
    title: "L'inconnu savoure un cigare après le meurtre",
    description: "Assis dans un fauteuil colonial dans la chambre, l'inconnu fume un cigare cubain Churchill, boit du Talisker, écoute de la musique tropicale. Il se remémore ses souvenirs avec Corinne et se remémore les quatre femmes qui l'ont trahi.",
    characters: JSON.stringify([C.INCONNU]), notes: null },
  { id: uid(), chapter: "1", sort_order: 55, location_id: L.DEMEURE,
    title: "L'inconnu appelle anonymement la police",
    description: "Après le meurtre, l'inconnu compose un numéro. Un appel anonyme signale une femme agonisant, nue, attachée à son lit, se vidant de son sang.",
    characters: JSON.stringify([C.INCONNU]), notes: null },
  // Flashbacks ch1
  { id: uid(), chapter: "1 (flashback)", sort_order: 5, location_id: L.APPART_OLIVIA,
    title: "[Flashback] Première rencontre inconnu-Corinne chez Nicolas",
    description: "L'inconnu arrive tard chez son ami Nicolas où Patrick et Corinne (leurs voisins) sont invités. Patrick s'est endormi ivre. Corinne passe la soirée à taquiner l'inconnu. Sur le balcon, Olivia avertit l'inconnu que Corinne l'allume. Corinne propose à l'inconnu de passer la chercher un soir à son travail — alors qu'elle se marie dans 3 mois.",
    characters: JSON.stringify([C.INCONNU, C.CORINNE, C.PATRICK, C.NICOLAS, C.OLIVIA]), notes: null },
  { id: uid(), chapter: "1 (flashback)", sort_order: 6, location_id: null,
    title: "[Flashback] Liaison secrète de 3 mois avant le mariage",
    description: "Simon et Corinne se voient régulièrement en secret durant 3 mois avant le mariage : jardins publics, plages de la côte atlantique, endroits discrets. Corinne ment quotidiennement à Patrick. La semaine précédant le mariage, elle cesse brusquement tout contact.",
    characters: JSON.stringify([C.INCONNU, C.CORINNE]), notes: null },
  { id: uid(), chapter: "1 (flashback)", sort_order: 7, location_id: L.APPART_OLIVIA,
    title: "[Flashback] Dernière soirée de célibataire de Corinne",
    description: "La veille du mariage, Corinne invite l'inconnu chez Olivia. Elle est dans la baignoire, lui demande de lui frotter le dos. Olivia se couche. Corinne se déshabille devant lui et s'assoit sur ses genoux. Ils s'embrassent mais elle refuse d'aller plus loin. L'arrivée de Nicolas met fin à l'intimité. L'inconnu repart avec le sentiment d'avoir été définitivement désavoué.",
    characters: JSON.stringify([C.INCONNU, C.CORINNE, C.OLIVIA, C.NICOLAS]), notes: null },
  // ── Chapitre 2 ──────────────────────────────────────────────────────
  { id: uid(), chapter: "2", sort_order: 60, location_id: L.PAVILLON_EMMA,
    title: "Emma reçoit l'appel de Douvier à 4h15",
    description: "Emma est réveillée à 4h15 par un appel de Douvier qui lui signale la découverte d'une femme agonisant. Douvier insiste pour qu'elle vienne sur place.",
    characters: JSON.stringify([C.EMMA, C.DOUVIER]), notes: null },
  { id: uid(), chapter: "2", sort_order: 70, location_id: L.DEMEURE,
    title: "Emma arrive sur la scène de crime et découvre le corps",
    description: "Emma arrive à la demeure des Ledillard dans une nuit de tempête. Douvier l'accueille avec un parapluie. Elle monte au premier étage et découvre le corps de Corinne nue, attachée, couverte de sang, lacérée. Elle ordonne à la scientifique de commencer l'investigation.",
    characters: JSON.stringify([C.EMMA, C.DOUVIER, C.CHAMBERTIN, C.LAROCHE]), notes: null },
  { id: uid(), chapter: "2", sort_order: 80, location_id: L.DEMEURE,
    title: "Identification de Corinne et bilan légiste sur place",
    description: "La victime est identifiée via ses papiers : Corinne Ledillard, née en 1983, mariée depuis 4 ans à Patrick. Le Docteur Laroch (légiste) constate : mort par incisions profondes aux poignets, plus de 20 brûlures de cigarettes, hématome joue gauche, relation sexuelle avant le décès. Corps emmené en salle d'autopsie.",
    characters: JSON.stringify([C.EMMA, C.DOUVIER, C.LEROCK]), notes: null },
  { id: uid(), chapter: "2", sort_order: 90, location_id: L.DEMEURE,
    title: "Analyse de la scène — le tueur attendait dans le placard",
    description: "Vêtements du placard de la chambre déplacés, indiquant que le tueur y attendait. Porte de jardin forcée. Traces de boue dans toutes les pièces. Douvier repère les cendres du cigare : Churchill, consommé en 1h30 minimum. Empreintes de Rangers pointure 42 sur un massif de fleurs. Traces de pas suivies sur 1 km jusqu'à la forêt puis la route.",
    characters: JSON.stringify([C.EMMA, C.DOUVIER, C.LAROCHE, C.CHAMBERTIN]), notes: null },
  // ── Chapitre 3 ──────────────────────────────────────────────────────
  { id: uid(), chapter: "3", sort_order: 100, location_id: L.PETIT_BASQUE,
    title: "Simon retrouve Patxi au Petit Basque sous la pluie",
    description: "Simon roule sous une pluie diluvienne dans sa vieille Polo noire. Retrouve Patxi au bar. Ils évoquent la situation professionnelle de Simon (sans emploi 4 mois, deux entretiens passés) et Emma.",
    characters: JSON.stringify([C.SIMON, C.PATXI]), notes: null },
  { id: uid(), chapter: "3", sort_order: 110, location_id: L.PETIT_BASQUE,
    title: "Simon rencontre Alessia au bar",
    description: "Une femme élégante s'installe à l'autre bout du bar et commande la même chose que Simon. Il la remarque. Ils découvrent en discutant qu'il était commercial chez le fournisseur principal des parents d'Alessia (L'Escale du Pécheur).",
    characters: JSON.stringify([C.SIMON, C.ALESSIA, C.PATXI]), notes: null },
  { id: uid(), chapter: "3", sort_order: 120, location_id: L.APPART_SIMON,
    title: "Nuit partagée entre Simon et Alessia",
    description: "À la fermeture du bar, Alessia propose de continuer la soirée chez Simon. Ils passent la nuit ensemble. Le lendemain matin, Simon va au marché. À son retour, Alessia est partie, laissant un mot : 'Désolé, cette nuit était très bien, mais je dois partir. À bientôt j'espère, Alessia.'",
    characters: JSON.stringify([C.SIMON, C.ALESSIA]), notes: null },
  { id: uid(), chapter: "3", sort_order: 130, location_id: L.APPART_SIMON,
    title: "Emma appelle Simon, Simon l'invite à dîner",
    description: "Emma appelle Simon pour prendre de ses nouvelles. Il est de mauvaise humeur après le départ d'Alessia. Il l'invite à dîner le soir même en tenue habillée. Elle accepte.",
    characters: JSON.stringify([C.SIMON, C.EMMA]), notes: null },
  // ── Chapitre 4 ──────────────────────────────────────────────────────
  { id: uid(), chapter: "4", sort_order: 140, location_id: L.PAVILLON_EMMA,
    title: "Emma appelle Douvier pour un bilan de l'enquête Ledillard",
    description: "Emma, dans sa véranda, écoute Compay Segundo. Elle laisse un message à Douvier qui la rappelle : pas de viol, rapport sexuel normal sans trace de sperme, pas d'empreintes inconnues, pas d'effraction, pas de témoin. Traces de pas et de quad retrouvées dans le jardin et en forêt. Alibi du mari vérifié (était en Italie). Emma émet l'hypothèse d'une relation lesbienne. Elle confie l'enquête à Douvier pour le week-end.",
    characters: JSON.stringify([C.EMMA, C.DOUVIER]), notes: null },
  // ── Chapitre 5 ──────────────────────────────────────────────────────
  { id: uid(), chapter: "5", sort_order: 150, location_id: L.COMMISSARIAT,
    title: "Douvier développe la théorie du meurtrier obsessionnel",
    description: "Douvier seul dans son bureau analyse les témoignages de riverains (tous négatifs). Il développe à voix haute une théorie : l'assassin connaissait la victime, l'obsédait, a tué par vengeance après avoir été rejeté ou humilié.",
    characters: JSON.stringify([C.DOUVIER]), notes: null },
  { id: uid(), chapter: "5", sort_order: 160, location_id: L.COMMISSARIAT,
    title: "Laroche et Chambertin rejoignent Douvier — théorie serial killer",
    description: "Laroche propose l'hypothèse du détraqué sexuel connaissant sa victime. Chambertin est sceptique. Ils évoquent la possibilité d'un serial killer. Douvier répartit les tâches : Laroche sur l'entourage des Ledillard, lui-même sur les affaires similaires non résolues. Le cigare cubain laissé sur place est mentionné comme indice.",
    characters: JSON.stringify([C.DOUVIER, C.LAROCHE, C.CHAMBERTIN]), notes: null },
  // ── Chapitre 6 ──────────────────────────────────────────────────────
  { id: uid(), chapter: "6", sort_order: 170, location_id: L.APPART_SIMON,
    title: "Emma arrive chez Simon pour le dîner",
    description: "Emma arrive en robe cocktail noire très élégante dans son petit roadster. Simon a dressé la table avec bouquet floral et bougeoir à cinq branches. Dîner avec salade de magret fumé, entrecôte marchand de vin, îles flottantes. Jim Beam en apéro puis grand cru bordelais (Smith Haut Laffitte 98).",
    characters: JSON.stringify([C.SIMON, C.EMMA]), notes: null },
  { id: uid(), chapter: "6", sort_order: 180, location_id: L.APPART_SIMON,
    title: "Emma révèle à Simon l'affaire criminelle en cours",
    description: "Simon interroge Emma sur sa vie professionnelle. Emma, après hésitation, lui relate les faits : appel téléphonique, découverte du corps ensanglanté de la victime attachée avec du fil de fer. Simon est choqué. Emma exprime sa détermination à attraper le coupable.",
    characters: JSON.stringify([C.SIMON, C.EMMA]), notes: null },
  { id: uid(), chapter: "6", sort_order: 190, location_id: L.APPART_SIMON,
    title: "Emma s'enivre et reste dormir chez Simon",
    description: "Les verres s'enchaînent (cognac). Emma, ivre, danse et tente de séduire Simon. Il résiste. Emma finit par vomir sur Simon. Elle dort dans son lit, il la déshabille. Le matin, elle prépare le petit-déjeuner. Simon révèle qu'elle l'a vomi dessus.",
    characters: JSON.stringify([C.SIMON, C.EMMA]), notes: null },
  // ── Chapitre 7 ──────────────────────────────────────────────────────
  { id: uid(), chapter: "7", sort_order: 200, location_id: L.COMMISSARIAT,
    title: "Réunion d'enquête — résultats autopsie et piste du quad",
    description: "Emma convoque Douvier, Laroche et Chambertin. Résultats de Lerock : rapport sexuel consenti, corps nettoyé, pubis rasé post-mortem, 1 gifle, 25 incisions au scalpel, 10 brûlures, 4 incisions profondes aux poignets (cause du décès). Agonie min 1h. Cigare Churchill sans trace de salive. Le quad retrouvé brûlé à 6 km. Empreintes pointure 42.",
    characters: JSON.stringify([C.EMMA, C.DOUVIER, C.LAROCHE, C.CHAMBERTIN, C.LEROCK]), notes: null },
  { id: uid(), chapter: "7", sort_order: 210, location_id: L.COMMISSARIAT,
    title: "La théorie du 'chasseur' exposée par l'équipe",
    description: "Douvier, Laroche et Chambertin présentent la théorie du 'chasseur' : individu développant une fixation obsessionnelle sur une femme, la traquant, apprenant tout d'elle, s'introduisant chez elle avant de passer à l'acte. L'appel téléphonique est un défi lancé à la police.",
    characters: JSON.stringify([C.EMMA, C.DOUVIER, C.LAROCHE, C.CHAMBERTIN]), notes: null },
  { id: uid(), chapter: "7", sort_order: 215, location_id: L.COMMISSARIAT,
    title: "Patrick Ledillard identifié — à Marseille au moment du crime",
    description: "Patrick Ledillard est responsable commercial dans une entreprise américaine de matériel informatique. Était à Marseille pour réunion et séminaire professionnel depuis le début de la semaine. Laroche chargé de le chercher à l'aéroport.",
    characters: JSON.stringify([C.EMMA, C.DOUVIER, C.LAROCHE, C.CHAMBERTIN, C.PATRICK]), notes: null },
  // ── Chapitre 8 ──────────────────────────────────────────────────────
  { id: uid(), chapter: "8", sort_order: 220, location_id: L.DEMEURE_CAP8,
    title: "Le meurtrier regarde la F1 avec sa captive ligotée au pied du canapé",
    description: "Le meurtrier est dans un salon luxueux, regarde un Grand Prix de F1 sur le circuit de Sépang sous la pluie. Une femme ligotée est au pied du canapé. Quand elle gémit, il lui donne des claques et la traîne dans une autre pièce.",
    characters: JSON.stringify([C.INCONNU, C.CAPTIVE8]), notes: null },
  { id: uid(), chapter: "8", sort_order: 230, location_id: L.DEMEURE_CAP8,
    title: "[Flashback] Le meurtrier pénètre chez la captive déguisé en livreur",
    description: "La captive se souvient : en début d'après-midi, on a frappé à la porte. Un homme en uniforme de livreur express (moustache, casquette, lunettes de soleil) se présente. Quand il prononce son prénom, elle se retourne. Il ôte son déguisement : 'Surprise !'. Elle l'avait reconnu.",
    characters: JSON.stringify([C.INCONNU, C.CAPTIVE8]), notes: null },
  // ── Chapitre 9 ──────────────────────────────────────────────────────
  { id: uid(), chapter: "9", sort_order: 240, location_id: L.PLAGE_SABLES,
    title: "Vanessa découvre le meurtre de Corinne dans le journal",
    description: "Sur la plage, Vanessa lit un gros article : 'Un homicide d'une rare violence, découvert dans une propriété en périphérie de la ville'. Elle reconnaît le nom de Corinne Ledillard — elles s'étaient fréquentées lors de fêtes. Elle montre l'article à Elody. Toutes deux sous le choc.",
    characters: JSON.stringify([C.VANESSA, C.ELODY, C.CORINNE]), notes: null },
  // ── Chapitre 10 ──────────────────────────────────────────────────────
  { id: uid(), chapter: "10", sort_order: 250, location_id: null,
    title: "L'inconnu se présente chez Delphine",
    description: "Le tueur se présente à la porte de Delphine. Elle est surprise et déstabilisée. Elle lui demande de partir, le menace d'appeler la police. Il reste impassible. Alors qu'elle tente de s'en aller, il lui saisit le poignet et lui assène un coup qui lui fait virevolter la tête. Il la capture.",
    characters: JSON.stringify([C.INCONNU, C.DELPHINE]), notes: null },
  { id: uid(), chapter: "10", sort_order: 260, location_id: L.PIECE_DET,
    title: "Delphine séquestrée, droguée, torturée",
    description: "Delphine ligotée, bras écartés, dos contre une surface verticale, quasiment nue. Le tueur fume un cigare cubain, contemple son 'œuvre'. Il sélectionne une lame dans un étui parfaitement aligné et commence à la lacérer méthodiquement — entailles aux poignets et sur le corps, suffisamment pour faire durer la souffrance.",
    characters: JSON.stringify([C.INCONNU, C.DELPHINE]), notes: null },
  { id: uid(), chapter: "10", sort_order: 270, location_id: L.PIECE_DET,
    title: "Le tueur appelle les secours et quitte les lieux",
    description: "Alors que Delphine se meurt de ses blessures, le tueur compose un numéro : '18 avenue des roses... dépêchez-vous... elle est encore en vie... mais pas pour très longtemps.' Il jette un dernier regard à sa 'nouvelle œuvre' et quitte la pièce.",
    characters: JSON.stringify([C.INCONNU, C.DELPHINE]), notes: null },
  // ── Chapitre 11 ──────────────────────────────────────────────────────
  { id: uid(), chapter: "11", sort_order: 280, location_id: L.COMMISSARIAT,
    title: "Réunion de brigade — 4 meurtres liés, serial killer confirmé",
    description: "Réunion dirigée par Poujeaux. Douvier annonce 4 meurtres liés : Ledillard et Lalouvière locaux, plus deux cas similaires à Annemasse et Lyon. Même profil de victime, même mise en scène, police prévenue à chaque fois trop tard. Plus de 60 lacérations sur chacune des victimes, 4 plus profondes aux poignets, plusieurs brûlures sur les poitrines avec sections des tétons.",
    characters: JSON.stringify([C.EMMA, C.POUJEAUX, C.DOUVIER, C.CHAMBERTIN, C.LAROCHE]), notes: null },
  { id: uid(), chapter: "11", sort_order: 290, location_id: L.COMMISSARIAT,
    title: "Présentation de Lascombes — confirmation tueur en série",
    description: "Emma présente Lascombes, consultant externe en comportement de psychopathes. Elle retrace son parcours (Crime, USA, famille assassinée, FBI, retour en Europe). Lascombes confirme la théorie du tueur en série. Poujeaux accepte de faire appel à lui.",
    characters: JSON.stringify([C.EMMA, C.POUJEAUX, C.LASCOMBES]), notes: null },
  { id: uid(), chapter: "11", sort_order: 300, location_id: L.COMMISSARIAT,
    title: "Poujeaux alloue les renforts et saisit l'OCLCO",
    description: "Emma demande des renforts, convaincue que le tueur frappera à nouveau. Poujeaux accède. Saisit officiellement l'OCLCO. Confie la totalité de l'enquête à Emma. Délai de 48h avant pression médiatique. Rôles : Laroche seconde Emma, Chambertin filtre les remontées de services, Douvier trouve le lien entre toutes les victimes.",
    characters: JSON.stringify([C.EMMA, C.POUJEAUX, C.LAROCHE, C.CHAMBERTIN, C.DOUVIER]), notes: null },
  // ── Chapitre 12 ──────────────────────────────────────────────────────
  { id: uid(), chapter: "12", sort_order: 310, location_id: L.MAISON_LAS,
    title: "Emma chez Lascombes — révélation : cinq meurtres, pas quatre",
    description: "Lascombes révèle qu'il a recensé non pas quatre mais cinq meurtres. Le cinquième (premier chronologiquement) a été signalé dans la région des Cévennes et est passé sous les radars. Modus operandi identique sur toutes les victimes.",
    characters: JSON.stringify([C.EMMA, C.LASCOMBES]), notes: null },
  { id: uid(), chapter: "12", sort_order: 320, location_id: L.MAISON_LAS,
    title: "Lascombes profile le tueur : Lust Killer",
    description: "Lascombes déclare être en présence d'un 'Lust Killer'. Trois motivations : plaisir, pouvoir, vengeance. Le tueur déshumanise ses victimes, les humilie, prend son temps. Le cigare laissé sur les scènes est délibéré : message pour montrer qu'il a tout observé. Il a une signature qui ne s'improvise pas — elle se répète du premier au dernier meurtre.",
    characters: JSON.stringify([C.EMMA, C.LASCOMBES]), notes: null },
  { id: uid(), chapter: "12", sort_order: 330, location_id: L.MAISON_LAS,
    title: "Lascombes recommande la victimologie",
    description: "Depuis la terrasse du jardin, Lascombes expose la victimologie : étude complète des victimes (statut social, style de vie, éducation, santé, intimité) pour comprendre pourquoi elles ont été choisies. Emma appelle Douvier pour lui ordonner de creuser dans le passé des victimes, délai deux jours.",
    characters: JSON.stringify([C.EMMA, C.LASCOMBES, C.DOUVIER]), notes: null },
  { id: uid(), chapter: "12", sort_order: 340, location_id: L.MAISON_LAS,
    title: "Lascombes révèle que le tueur connaissait toutes ses victimes",
    description: "Lascombes est convaincu que le tueur connaissait ses victimes, qu'elles l'avaient toutes fréquenté d'une manière ou d'une autre. Il note également que toutes les victimes avaient épousé des hommes fortunés en partant de conditions modestes. Demande la confidentialité à Emma.",
    characters: JSON.stringify([C.EMMA, C.LASCOMBES]), notes: null },
  // ── Chapitre 13 ──────────────────────────────────────────────────────
  { id: uid(), chapter: "13", sort_order: 350, location_id: L.APPART_SMERMER,
    title: "Journée de plage de Simon et Emma — soirée au Club House",
    description: "Simon observe Emma depuis sa terrasse qui remonte de la plage. Il l'appelle, ils passent la journée ensemble sur la plage. Dînent au Tonneau puis soirée dans plusieurs bars et au Club House. Emma ivre monte sur un plot et danse de façon provocante. Simon la fait descendre. Ils rentrent. Simon la déshabille et ils dorment ensemble.",
    characters: JSON.stringify([C.SIMON, C.EMMA]), notes: null },
  { id: uid(), chapter: "13", sort_order: 360, location_id: L.APPART_SMERMER,
    title: "Simon révèle qu'il écrit un roman policier inspiré des anecdotes d'Emma",
    description: "Simon avoue à Emma qu'il écrit un thriller inspiré de ce qu'elle lui raconte. Roman d'un homme qui fait le bilan de sa vie, devient le contraire de ce qu'il est à force d'échecs et de frustrations, et décide de tuer les femmes qu'il tient responsables une par une. Il demande à rencontrer Lascombes.",
    characters: JSON.stringify([C.SIMON, C.EMMA]), notes: null },
];

// ─────────────────────────────────────────────────────────────────────
// INTERACTIONS
// ─────────────────────────────────────────────────────────────────────
type Interaction = {
  id: string; description: string; nature: string;
  characters: string; chapter: string; sort_order: number; notes: string | null;
};

const interactions: Interaction[] = [
  { id: uid(), nature: "mariage", chapter: "1", sort_order: 1,
    characters: JSON.stringify([C.CORINNE, C.PATRICK]),
    description: "Corinne et Patrick sont mariés depuis quatre ans au moment du meurtre. Patrick a rencontré Corinne en entrant dans son magasin. Il lui a offert son loft puis la grande demeure bourgeoise comme cadeau de mariage. Couple décrit comme sans histoire par les voisins.",
    notes: null },
  { id: uid(), nature: "ex-liaison / hostile", chapter: "1", sort_order: 2,
    characters: JSON.stringify([C.INCONNU, C.CORINNE]),
    description: "L'inconnu et Corinne ont eu une liaison secrète durant les 3 mois précédant le mariage de Corinne avec Patrick. Corinne a mis fin unilatéralement à la liaison en cessant tout contact la semaine avant le mariage. L'inconnu nourrit depuis une rancœur obsessionnelle qui l'a conduit au meurtre.",
    notes: null },
  { id: uid(), nature: "amitié", chapter: "1", sort_order: 3,
    characters: JSON.stringify([C.INCONNU, C.NICOLAS]),
    description: "L'inconnu et Nicolas sont amis. Nicolas l'a invité à une soirée où l'inconnu a rencontré Corinne pour la première fois.",
    notes: null },
  { id: uid(), nature: "amitié", chapter: "1", sort_order: 4,
    characters: JSON.stringify([C.CORINNE, C.OLIVIA]),
    description: "Corinne et Olivia sont meilleures amies. Olivia a accueilli Corinne pour sa dernière soirée de célibataire. C'est chez Olivia (et Nicolas) que l'inconnu a rencontré Corinne.",
    notes: null },
  { id: uid(), nature: "professionnel / hiérarchique", chapter: "2", sort_order: 5,
    characters: JSON.stringify([C.EMMA, C.DOUVIER]),
    description: "Emma est la commissaire et supérieure directe de Douvier (lieutenant). Relation franche et directe. Emma reconnaît avoir besoin du soutien de Douvier. Douvier la suit même quand il n'est pas d'accord, après l'avoir dit franchement.",
    notes: null },
  { id: uid(), nature: "professionnel / hiérarchique", chapter: "2", sort_order: 6,
    characters: JSON.stringify([C.EMMA, C.LAROCHE]),
    description: "Emma est la supérieure hiérarchique de Laroche (Maxime). Relation plus informelle que celle avec Douvier — Emma l'appelle par son prénom.",
    notes: null },
  { id: uid(), nature: "professionnel / hiérarchique", chapter: "2", sort_order: 7,
    characters: JSON.stringify([C.EMMA, C.CHAMBERTIN]),
    description: "Emma est la supérieure hiérarchique de Chambertin. Le reprend sur ses 'a priori' et lui demande d'éteindre sa cigarette.",
    notes: null },
  { id: uid(), nature: "mariage", chapter: "2", sort_order: 8,
    characters: JSON.stringify([C.DOUVIER, C.FEMME_DOUV]),
    description: "Douvier est marié. Sa femme est parfois absente, ce qui lui permet de fumer ses cigares havanes (il a des problèmes d'estomac).",
    notes: null },
  { id: uid(), nature: "amitié", chapter: "3", sort_order: 9,
    characters: JSON.stringify([C.SIMON, C.PATXI]),
    description: "Simon et Patxi sont amis proches. Ils se voient régulièrement au Petit Basque. Patxi connaît la vie sentimentale et professionnelle de Simon. Ils se saluent par accolade et bise.",
    notes: null },
  { id: uid(), nature: "amitié / amour non réciproque", chapter: "3", sort_order: 10,
    characters: JSON.stringify([C.SIMON, C.EMMA]),
    description: "Emma et Simon sont amis intimes depuis l'adolescence (rencontre au camping, août 1985). Ont entretenu une relation amoureuse de deux ans soldée par un échec douloureux pour Simon. Ont couché ensemble deux fois sans sentiment romantique. Simon considère Emma comme la femme de sa vie. Emma le considère comme sa 'soupape de sécurité'.",
    notes: null },
  { id: uid(), nature: "rencontre amoureuse", chapter: "3", sort_order: 11,
    characters: JSON.stringify([C.SIMON, C.ALESSIA]),
    description: "Simon et Alessia ont une rencontre au Petit Basque et passent la nuit ensemble dans l'appartement de Simon. Alessia part sans explication le lendemain matin en laissant un mot.",
    notes: null },
  { id: uid(), nature: "professionnel", chapter: "3", sort_order: 12,
    characters: JSON.stringify([C.SIMON, C.SERGE, C.ADELINA]),
    description: "Simon était commercial chez le fournisseur principal du magasin des parents d'Alessia (L'Escale du Pécheur). Il les voyait en moyenne une fois par mois et les connaissait par leurs prénoms.",
    notes: null },
  { id: uid(), nature: "mariage", chapter: "3", sort_order: 13,
    characters: JSON.stringify([C.SERGE, C.ADELINA]),
    description: "Serge et Adélina sont les parents d'Alessia et dirigeaient ensemble une fabrication de vêtements en Italie avant d'émigrer en France où ils se sont mariés et ont ouvert L'Escale du Pécheur.",
    notes: null },
  { id: uid(), nature: "fraternité / gémellité", chapter: "6", sort_order: 14,
    characters: JSON.stringify([C.SIMON, C.JUMEAU]),
    description: "Simon et son frère jumeau sont inséparables dans leur jeunesse. Le frère taquinait Simon sur son coup de foudre pour Emma au camping en août 1985.",
    notes: null },
  { id: uid(), nature: "amour / couple", chapter: "9", sort_order: 15,
    characters: JSON.stringify([C.VANESSA, C.ELODY]),
    description: "Vanessa et Elody forment un couple homosexuel assumé et affiché. Vivent ensemble dans un appartement en bord de mer dont elles sont co-propriétaires.",
    notes: null },
  { id: uid(), nature: "amitié", chapter: "9", sort_order: 16,
    characters: JSON.stringify([C.VANESSA, C.ELODY, C.DOMINIQUE]),
    description: "Vanessa et Elody sont les clientes favorites de Dom, la patronne du bar du remblai, qui a été séduite par leur homosexualité assumée (elle-même attirée par le même sexe).",
    notes: null },
  { id: uid(), nature: "connaissance sociale", chapter: "9", sort_order: 17,
    characters: JSON.stringify([C.VANESSA, C.ELODY, C.CORINNE]),
    description: "Vanessa, Elody et Corinne Ledillard se connaissaient pour s'être fréquentées lors de diverses fêtes. L'été précédent, Vanessa avait chanté et dansé avec Corinne.",
    notes: null },
  { id: uid(), nature: "ancienne relation / hostile", chapter: "10", sort_order: 18,
    characters: JSON.stringify([C.DELPHINE, C.INCONNU]),
    description: "Delphine et le tueur ont eu une relation sentimentale il y a environ 5 ans. Delphine l'a quitté brutalement sans explication après quelques semaines de divergences de caractères, et est retournée auprès de son mari. Pour le tueur, la désillusion fut totale — il avait envisagé sa vie avec elle. La rupture a alimenté sa rancœur.",
    notes: null },
  { id: uid(), nature: "mariage", chapter: "10", sort_order: 19,
    characters: JSON.stringify([C.DELPHINE, C.OLIVIER]),
    description: "Delphine est mariée à Olivier. Elle l'a encouragé à partir en week-end entre amis pour profiter de quelques jours en solitaire, se retrouvant ainsi vulnérable.",
    notes: null },
  { id: uid(), nature: "professionnel / hiérarchique", chapter: "11", sort_order: 20,
    characters: JSON.stringify([C.EMMA, C.POUJEAUX]),
    description: "Emma Andrénetti est Commissaire. Poujeaux est son Divisionnaire supérieur. Poujeaux lui confie la totalité de l'enquête sur les meurtres en série.",
    notes: null },
  { id: uid(), nature: "professionnel / consultation", chapter: "11", sort_order: 21,
    characters: JSON.stringify([C.EMMA, C.LASCOMBES]),
    description: "Emma a contacté Lascombes grâce à un ami travaillant en psychopathologie. Lascombes accepte d'aider la brigade. Emma ressent une fascination/attirance discrète envers son charisme et sa maturité.",
    notes: null },
  { id: uid(), nature: "mariage", chapter: "12", sort_order: 22,
    characters: JSON.stringify([C.LASCOMBES, C.STEPHANIE]),
    description: "Lascombes aimait profondément sa femme Stéphanie. Elle a conçu le jardin de leur maison, est devenue paysagiste reconnue. La mentionner lui cause encore une émotion visible. Elle est décédée.",
    notes: null },
  { id: uid(), nature: "amitié", chapter: "13", sort_order: 23,
    characters: JSON.stringify([C.SIMON, C.ERIC]),
    description: "Simon et Éric partagent le goût des vacances à la plage et des sorties nocturnes jusqu'au petit matin. Ont établi un record de 7h30 passées sur la plage en une journée.",
    notes: null },
];

// ─────────────────────────────────────────────────────────────────────
// RÈGLES DU MONDE
// ─────────────────────────────────────────────────────────────────────
type WorldRule = { id: string; category: string; title: string; description: string; notes: string | null };

const worldRules: WorldRule[] = [
  { id: uid(), category: "légal", title: "Protocole de scène de crime (police française)",
    description: "À l'arrivée : établir un périmètre de sécurité avec rubalise jaune et noir, geler les lieux, limiter les accès. La scientifique en combinaison blanche attend les ordres du commissaire. Procès-verbal de description des lieux dressé par l'adjoint. Chaque détail et prélèvement est enregistré, noté, classé.",
    notes: null },
  { id: uid(), category: "légal", title: "Rôle du médecin légiste",
    description: "Le légiste intervient sur la scène de crime, examine le corps sur place (hématomes, brûlures, lacérations, rapport sexuel). Emmène le corps en salle d'autopsie. Fait parvenir un rapport d'autopsie détaillé au commissaire, transmis par fax.",
    notes: null },
  { id: uid(), category: "légal", title: "Hiérarchie policière du roman",
    description: "Le commissaire dirige l'enquête. Le lieutenant/adjoint (Douvier) coordonne les premières interventions. Des inspecteurs/lieutenants (Laroche, Chambertin) exécutent les tâches de terrain. Le divisionnaire (Poujeaux) est le supérieur du commissaire. L'OCLCO est saisi pour les affaires multi-juridictions.",
    notes: null },
  { id: uid(), category: "légal", title: "Définition officielle du tueur en série (France)",
    description: "L'appellation 'tueur en série' n'est officiellement prise en compte qu'à partir de trois assassinats avec un modus operandi similaire. Avec seulement deux meurtres locaux, la désignation n'est pas formellement applicable même si des cas similaires existent ailleurs.",
    notes: null },
  { id: uid(), category: "légal", title: "Secret de l'instruction",
    description: "Les policiers n'ont pas le droit de parler d'une affaire en cours à des personnes extérieures. Emma enfreint cette règle en racontant l'affaire à Simon, ami civil. Les affaires peuvent être interrompues pour des raisons budgétaires, permettant à des tueurs de continuer à sévir.",
    notes: null },
  { id: uid(), category: "légal", title: "OCLCO — Office Central de Lutte contre la Criminalité Organisée",
    description: "Service national français permettant de rechercher et recenser des affaires similaires sur l'ensemble du territoire. Saisi par Poujeaux pour trouver d'autres meurtres avec le même mode opératoire.",
    notes: null },
  { id: uid(), category: "légal", title: "Succession et héritage en cas de décès du conjoint",
    description: "Dans le cas du mari de Lalouvière, en cas de décès de sa femme, les trois quarts de sa fortune (plusieurs millions d'euros) devaient lui revenir, le reste allant à une association caritative.",
    notes: null },
  { id: uid(), category: "légal", title: "L'appel anonyme comme déclencheur d'intervention",
    description: "Un appel anonyme signalant une femme agonisant avec des détails précis déclenche une intervention immédiate. La police considère que l'auteur de l'appel pourrait être le tueur lui-même, cherchant à narguer la police et à s'assurer que son 'œuvre' est découverte dans l'état voulu.",
    notes: null },
  { id: uid(), category: "professionnel", title: "Signature du tueur en série",
    description: "La signature d'un tueur est très distinctive d'une agression normale. Elle se manifeste dans le choix du même outil à chaque fois, la méthode (séquestration, terrorisation, humiliation, meurtre lent), et la façon d'abandonner le corps. La signature ne s'improvise pas, elle se répète du premier au dernier meurtre.",
    notes: null },
  { id: uid(), category: "professionnel", title: "Lust Killer — terminologie FBI",
    description: "Un 'Lust Killer' est un individu qui exige une victime vivante pour se nourrir de sa terreur. Le meurtre est un processus lent et déchirant. L'individu peut se masturber devant la victime, ressent un état d'euphorie et d'invulnérabilité. Il se sert de la police et des médias pour faire parler de lui.",
    notes: null },
  { id: uid(), category: "professionnel", title: "Victimologie comme méthode d'investigation",
    description: "La victimologie consiste à collecter le maximum d'informations sur les victimes : statut social, style de vie, niveau d'éducation, santé, habitudes, intimité, relations personnelles. Permet de comprendre pourquoi elles ont été choisies et de dresser le profil de la prochaine victime.",
    notes: null },
  { id: uid(), category: "professionnel", title: "Profiler / Psycho-criminaliste",
    description: "Des spécialistes en psycho-criminologie (profilers) établissent des profils de tueurs. Ils peuvent avoir accès à des criminels incarcérés pour s'entretenir avec eux. Techniques développées par le FBI à Quantico, adoptées et enseignées en Europe.",
    notes: null },
  { id: uid(), category: "professionnel", title: "Le profil du 'chasseur'",
    description: "Type de criminel qui développe une fixation obsessionnelle sur une femme. Il la traque, apprend ses habitudes, s'introduit chez elle en son absence, inspecte ses affaires intimes. D'apparence tout à fait normale, effacé ou respecté, passant inaperçu. L'appel téléphonique à la police est un défi moral.",
    notes: null },
  { id: uid(), category: "professionnel", title: "Statistiques criminologiques",
    description: "Seulement 5% des agressions se font au hasard — le reste du temps les personnes se connaissent (famille, voisin, milieu professionnel). Le pourcentage de serial killers en Europe est très faible par rapport aux États-Unis.",
    notes: null },
  { id: uid(), category: "professionnel", title: "Analyse des pneus en criminologie",
    description: "La taille des pneumatiques permet d'identifier le type de véhicule. Des pneus 135 à l'avant comme à l'arrière sont caractéristiques des petits véhicules du début des années 1990 (Fiat, Citroën, Volkswagen, Ford).",
    notes: null },
  { id: uid(), category: "professionnel", title: "Motivations du tueur — trois catégories",
    description: "Lascombes identifie trois motivations principales pour ce tueur : le plaisir (frisson nécessaire), le pouvoir (domination et rassurance de sa propre puissance), et la vengeance (haine profonde envers les victimes). La violence est structurée, pensée, préparée, répétée.",
    notes: null },
  { id: uid(), category: "professionnel", title: "Profil commun des victimes",
    description: "Les cinq victimes partagent un point commun : issues de milieux modestes (vendeuses, secrétaire, préparatrice de commandes, serveuse), elles avaient toutes épousé des hommes fortunés. Le tueur les choisit selon ce critère social précis — et les connaissait toutes.",
    notes: null },
  { id: uid(), category: "social", title: "Cigare Churchill — caractéristiques",
    description: "Un cigare au format Churchill correctement fumé nécessite minimum 1h30 de tirage. Ses cendres sont blanches, longues, fermes avec une cassure nette. Le fumeur laisse tomber les cendres d'elles-mêmes. La coiffe doit être humidifiée pour fumer normalement, laissant de la salive sur la tête du cigare — absence de salive = port de gants.",
    notes: null },
  { id: uid(), category: "social", title: "Technique de ligotage 'façon Papillon'",
    description: "Technique d'immobilisation : la personne est attachée ventre contre terre, pieds et poings liés ensemble derrière le dos. Inspirée du film 'Papillon'. Le meurtrier utilise du fil de fer au lieu de la corde, rendant la technique encore plus douloureuse.",
    notes: null },
  { id: uid(), category: "social", title: "Whiskys écossais de prestige",
    description: "Certains whiskys écossais sont des produits de luxe. L'Ardberg 10 ans d'âge est nommé meilleur whisky tourbé du monde. Le Talisker a des arômes de tourbe iodée. Ces produits existent dans la 'bande des 5' (les 5 meilleurs whiskys représentant l'Écosse).",
    notes: null },
  { id: uid(), category: "social", title: "Pression médiatique sur les enquêtes criminelles",
    description: "La presse couvre intensivement les affaires de meurtres en série, créant une pression invivable sur les enquêteurs. Les brigades cherchent à travailler le plus longtemps possible à l'écart de cette pression.",
    notes: null },
  { id: uid(), category: "social", title: "Comportement des quartiers riches face aux crimes",
    description: "Dans les quartiers aisés, les voisins préfèrent fermer les rideaux et ignorer ce qui dérange. Ils téléphonent au plus pour se plaindre anonymement, par peur des représailles ou par indifférence.",
    notes: null },
  { id: uid(), category: "social", title: "Trauma d'enfance et comportement criminel",
    description: "Des traumatismes d'enfance (violences parentales, abus sexuels, échecs scolaires, alcoolisme paternel) peuvent conduire à un goût de la violence exercée d'abord sur les animaux, puis sur des humains. Les victimes représentent souvent une figure symbolique liée au traumatisme.",
    notes: null },
  { id: uid(), category: "social", title: "Exil politique basque en Bretagne",
    description: "Patxi a quitté le Pays Basque pour des raisons politiques liées au mouvement nationaliste basque, contraint de se faire oublier des autorités. A émigré en Bretagne sans contacts et a réussi à s'y établir comme commerçant.",
    notes: null },
  { id: uid(), category: "géographique", title: "Régime des marées sur la plage des Sables",
    description: "La plage des Sables voit son étendue varier selon le cycle des marées. Un après-midi sur deux, elle est recouverte de moitié lors des forts coefficients.",
    notes: null },
  { id: uid(), category: "géographique", title: "Pression immobilière sur la côte atlantique",
    description: "Des promoteurs immobiliers peu scrupuleux ont massivement investi sur la côte atlantique pour créer des stations balnéaires huppées. Ils ont racheté parcelle après parcelle, proposant parfois le double de la valeur aux récalcitrants. Des familles ont résisté pendant trois décennies avant de céder.",
    notes: null },
];

// ─────────────────────────────────────────────────────────────────────
// INSERTION
// ─────────────────────────────────────────────────────────────────────
function insertAll(dbPath: string) {
  console.error(`\n[ingest] → ${dbPath}`);
  const db = new Database(dbPath);
  db.pragma("foreign_keys = OFF");
  db.pragma("journal_mode = WAL");

  const insertChar = db.prepare(`
    INSERT OR IGNORE INTO characters (id, name, description, traits, background, notes, created_at, updated_at)
    VALUES (@id, @name, @description, @traits, @background, @notes, @created_at, @updated_at)
  `);
  const insertLoc = db.prepare(`
    INSERT OR IGNORE INTO locations (id, name, description, atmosphere, geography, notes, created_at, updated_at)
    VALUES (@id, @name, @description, @atmosphere, @geography, @notes, @created_at, @updated_at)
  `);
  const insertEvt = db.prepare(`
    INSERT OR IGNORE INTO events (id, title, description, chapter, sort_order, location_id, characters, notes, created_at, updated_at)
    VALUES (@id, @title, @description, @chapter, @sort_order, @location_id, @characters, @notes, @created_at, @updated_at)
  `);
  const insertInter = db.prepare(`
    INSERT OR IGNORE INTO interactions (id, description, nature, characters, chapter, sort_order, notes, created_at, updated_at)
    VALUES (@id, @description, @nature, @characters, @chapter, @sort_order, @notes, @created_at, @updated_at)
  `);
  const insertRule = db.prepare(`
    INSERT OR IGNORE INTO world_rules (id, category, title, description, notes, created_at, updated_at)
    VALUES (@id, @category, @title, @description, @notes, @created_at, @updated_at)
  `);

  const run = db.transaction(() => {
    for (const c of characters) {
      insertChar.run({ ...c, notes: null, created_at: NOW, updated_at: NOW });
    }
    for (const l of locations) {
      insertLoc.run({ ...l, notes: null, created_at: NOW, updated_at: NOW });
    }
    for (const e of events) {
      insertEvt.run({ ...e, created_at: NOW, updated_at: NOW });
    }
    for (const i of interactions) {
      insertInter.run({ ...i, created_at: NOW, updated_at: NOW });
    }
    for (const r of worldRules) {
      insertRule.run({ ...r, created_at: NOW, updated_at: NOW });
    }
  });

  run();

  // Vérification counts
  const counts = {
    characters: (db.prepare("SELECT COUNT(*) as n FROM characters").get() as { n: number }).n,
    locations:  (db.prepare("SELECT COUNT(*) as n FROM locations").get()  as { n: number }).n,
    events:     (db.prepare("SELECT COUNT(*) as n FROM events").get()     as { n: number }).n,
    interactions:(db.prepare("SELECT COUNT(*) as n FROM interactions").get() as { n: number }).n,
    world_rules:(db.prepare("SELECT COUNT(*) as n FROM world_rules").get() as { n: number }).n,
  };

  console.error(`  ✓ characters   : ${counts.characters}`);
  console.error(`  ✓ locations    : ${counts.locations}`);
  console.error(`  ✓ events       : ${counts.events}`);
  console.error(`  ✓ interactions : ${counts.interactions}`);
  console.error(`  ✓ world_rules  : ${counts.world_rules}`);

  db.pragma("foreign_keys = ON");
  db.close();
}

for (const p of DB_PATHS) {
  insertAll(p);
}
console.error("\n[ingest] Done. 'Les Souvenirs du mal' ingéré dans la Bible.");
