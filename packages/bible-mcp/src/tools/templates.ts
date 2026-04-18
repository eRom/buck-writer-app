import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ── Genres disponibles ──────────────────────────────────────────────

const GENRES = ["fantasy", "polar", "sf", "historique", "romance"] as const;
type Genre = (typeof GENRES)[number];
type EntityType = "character" | "location" | "world_rule";

// ── Templates par genre x entity_type ───────────────────────────────

const TEMPLATES: Record<Genre, Record<EntityType, Record<string, string>>> = {
  fantasy: {
    character: {
      name: "[Nom du personnage]",
      description: "Race, age, apparence physique, signes distinctifs magiques...",
      traits:
        '{"physical":["taille","cheveux","yeux","cicatrices","marques magiques"],"personality":["trait dominant","defaut","peur","lien avec la magie"]}',
      background:
        "Origines (peuple, clan, royaume), formation (apprenti mage, guerrier, artisan), evenement fondateur (prophetie, perte, decouverte de pouvoir)...",
      notes:
        "Arc narratif prevu, evolution du pouvoir, alliances, ennemis, artefact lie au personnage...",
    },
    location: {
      name: "[Nom du lieu]",
      description:
        "Type (cite fortifiee, foret ancienne, donjon, sanctuaire), epoque, civilisation...",
      atmosphere:
        "Lumiere, sons, odeurs, presence magique ressentie, niveau de danger...",
      geography:
        "Situation dans le monde (continent, royaume), taille, acces, defenses naturelles ou magiques, zones interdites...",
      notes:
        "Histoire du lieu, legendes associees, ressources magiques, factions presentes...",
    },
    world_rule: {
      category: "magie",
      title: "[Nom de la regle]",
      description:
        "Source de la magie (innee, divine, elementaire), cout (fatigue, sacrifice, composants), limites (portee, duree, interdits), apprentissage (ecole, mentor, don inne). Consequences d'un usage excessif.",
      notes:
        "Exceptions connues, evolution prevue dans l'intrigue, impact sur la societe...",
    },
  },
  polar: {
    character: {
      name: "[Nom]",
      description:
        "Age, apparence physique, signes distinctifs, style vestimentaire habituel...",
      traits:
        '{"physical":["corpulence","vetements habituels","tic nerveux","detail remarquable"],"personality":["methode d\'investigation","faille psychologique","motivation profonde","rapport a l\'autorite"]}',
      background:
        "Parcours professionnel (police, prive, journaliste), affaire marquante, vie personnelle (divorce, addiction, trauma), reputation dans le milieu...",
      notes:
        "Suspect ou enqueteur ? Mobile ? Alibi ? Secret cache ? Evolution au fil de l'enquete...",
    },
    location: {
      name: "[Nom du lieu]",
      description:
        "Type (commissariat, scene de crime, bar, appartement, entrepot), quartier, epoque...",
      atmosphere:
        "Eclairage (neon, obscurite), bruits (silence pesant, circulation), odeurs (tabac, sang, pluie), temperature, tension ressentie...",
      geography:
        "Adresse, acces (camera, digicode, issue de secours), voisinage, points de surveillance, itineraire de fuite...",
      notes:
        "Indices trouves ici, temoins, horaires d'ouverture, lien avec la victime ou le suspect...",
    },
    world_rule: {
      category: "procedure",
      title: "[Nom de la regle]",
      description:
        "Procedure judiciaire ou policiere en vigueur. Juridiction, hierarchie, droits de la defense, regles de preuve, delais legaux. Impact sur l'enquete.",
      notes:
        "Failles exploitables, differences avec la realite, adaptations narratives...",
    },
  },
  sf: {
    character: {
      name: "[Nom du personnage]",
      description:
        "Espece (humain, androide, alien), age, modifications corporelles (implants, protheses), apparence...",
      traits:
        '{"physical":["modifications cybernetiques","marques d\'espece","equipement integre","particularites biologiques"],"personality":["rapport a la technologie","conviction politique","peur existentielle","competence specialisee"]}',
      background:
        "Planete d'origine, formation (academie spatiale, colonies, autodidacte), evenement declencheur (guerre, catastrophe, decouverte), statut social (citoyen, refugie, hors-la-loi)...",
      notes:
        "Role dans l'equipage/la faction, technologies maitrisees, conflits internes, evolution prevue...",
    },
    location: {
      name: "[Nom du lieu]",
      description:
        "Type (planete, station orbitale, vaisseau, colonie, megastructure), secteur galactique...",
      atmosphere:
        "Gravite, composition atmospherique, temperature, bruit ambiant (machines, vide spatial), niveau technologique visible...",
      geography:
        "Coordonnees, taille, ponts d'acces (docks, portails), zones dangereuses (radiation, vide, faune hostile), infrastructure...",
      notes:
        "Technologie presente, ressources exploitees, gouvernance, population, menaces connues...",
    },
    world_rule: {
      category: "technologie",
      title: "[Nom de la regle]",
      description:
        "Principe technologique ou scientifique (voyage FTL, IA, terraforming). Fonctionnement, limites physiques, cout energetique, risques, impact societal. Coherence avec les autres technologies du monde.",
      notes:
        "Paradoxes a gerer, evolution prevue, factions qui controlent cette tech...",
    },
  },
  historique: {
    character: {
      name: "[Nom du personnage]",
      description:
        "Epoque, rang social, apparence conforme a l'epoque (vetements, coiffure, marqueurs de statut)...",
      traits:
        '{"physical":["signes d\'epoque (cicatrices, marques de variole, mains de travailleur)","vetements","posture","details d\'hygiene"],"personality":["convictions de l\'epoque","ambition","loyaute","rapport au pouvoir"]}',
      background:
        "Naissance (noble, roturier, esclave, clergy), formation (apprentissage, universite, armee), evenements historiques vecus, position dans la hierarchie sociale...",
      notes:
        "Personnage fictif ou reel ? Libertes prises avec l'histoire ? Role dans l'intrigue, evolution sociale prevue...",
    },
    location: {
      name: "[Nom du lieu]",
      description:
        "Type (chateau, marche, champ de bataille, monastere, port), epoque precise, region...",
      atmosphere:
        "Bruits (forge, marche, cloches), odeurs (foin, fumier, encens, sang), lumiere (bougies, torches, jour naturel), saison...",
      geography:
        "Position geographique reelle, taille, fortifications, voies d'acces (route, riviere, sentier), distances avec les lieux voisins...",
      notes:
        "Evenements historiques associes, personnages reels presents, anachronismes a eviter, vie quotidienne du lieu...",
    },
    world_rule: {
      category: "societe",
      title: "[Nom de la regle]",
      description:
        "Regle sociale, juridique ou religieuse de l'epoque. Hierarchie, droits et devoirs, tabous, coutumes, systeme economique. Sources historiques de reference.",
      notes:
        "Ecarts avec la realite historique (et justification narrative), impact sur les personnages...",
    },
  },
  romance: {
    character: {
      name: "[Nom du personnage]",
      description:
        "Age, apparence physique detaillee, style vestimentaire, premiere impression qu'il/elle donne...",
      traits:
        '{"physical":["regard","sourire","voix","gestuelle","detail attirant"],"personality":["qualite attachante","defaut charmant","blessure emotionnelle","langage amoureux (mots, gestes, cadeaux, temps)"]}',
      background:
        "Famille (relation avec les parents, fratrie), vie amoureuse passee (ex, trauma, idealisation), profession et ambitions, cercle social, mode de vie...",
      notes:
        "Ce qui le/la rend inaccessible au debut, evolution emotionnelle prevue, sceau de compatibilite ou d'incompatibilite avec l'autre personnage...",
    },
    location: {
      name: "[Nom du lieu]",
      description:
        "Type (cafe, appartement, plage, bureau, ville etrangere), lien emotionnel avec les personnages...",
      atmosphere:
        "Lumiere (doree, tamisee, neon), musique ambiante, temperature, intimite du lieu, details sensoriels (texture, parfum)...",
      geography:
        "Situation (ville, campagne, voyage), accessibilite, proximite avec d'autres lieux cles de l'histoire...",
      notes:
        "Premiere rencontre ici ? Lieu de rupture ou de reconciliation ? Symbolique du lieu dans la relation...",
    },
    world_rule: {
      category: "dynamique relationnelle",
      title: "[Nom de la regle]",
      description:
        "Convention sociale, familiale ou culturelle qui impacte la relation. Attentes, interdits, pressions exterieures, normes de genre, obstacles sociaux ou economiques.",
      notes:
        "Comment cette regle cree de la tension narrative, quand elle sera transgressee, impact sur le denouement...",
    },
  },
};

// ── Registration ────────────────────────────────────────────────────

export function registerTemplateTools(server: McpServer): void {
  // ── list_templates ──────────────────────────────────────────────────
  server.tool(
    "list_templates",
    "Liste les genres disponibles pour les templates de fiches d'écrivain.",
    {},
    async () => {
      const genreList = GENRES.map((g) => ({
        genre: g,
        entity_types: Object.keys(TEMPLATES[g]),
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ genres: genreList }, null, 2) }],
      };
    },
  );

  // ── get_template ────────────────────────────────────────────────────
  server.tool(
    "get_template",
    "Retourne un template de fiche prérempli pour un genre littéraire et un type d'entité. Utile pour guider la création d'une nouvelle fiche.",
    {
      genre: z
        .enum(GENRES)
        .describe("Genre littéraire : fantasy, polar, sf, historique, romance"),
      entity_type: z
        .enum(["character", "location", "world_rule"])
        .describe("Type d'entité : character, location, world_rule"),
    },
    async ({ genre, entity_type }) => {
      const template = TEMPLATES[genre]?.[entity_type];

      if (!template) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Template non trouvé pour genre="${genre}", entity_type="${entity_type}".`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ genre, entity_type, template }, null, 2),
          },
        ],
      };
    },
  );

  console.error("[tools] Templates tools enregistrés");
}
