import { z } from "zod";
import { eq } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DbInstance } from "../db/index.js";
import {
  characters,
  locations,
  events,
  interactions,
  worldRules,
  research,
  notes,
} from "../db/schema.js";

const VALID_ENTITY_TYPES = [
  "characters",
  "locations",
  "events",
  "interactions",
  "world_rules",
  "research",
  "notes",
] as const;

type EntityType = (typeof VALID_ENTITY_TYPES)[number];

/** Resolve character names from a JSON array of UUIDs */
function resolveNames(
  db: DbInstance["db"],
  characterJson: string | null,
): string[] {
  if (!characterJson) return [];
  const ids: string[] = JSON.parse(characterJson);
  return ids.map((cid) => {
    const c = db.select().from(characters).where(eq(characters.id, cid)).get();
    return c ? c.name : "(inconnu)";
  });
}

function exportCharacters(db: DbInstance["db"]): string {
  const all = db.select().from(characters).all();
  if (all.length === 0) return "";

  const lines: string[] = ["## Personnages\n"];
  for (const c of all) {
    lines.push(`### ${c.name}`);
    if (c.description) lines.push(`- **Description** : ${c.description}`);
    if (c.traits) lines.push(`- **Traits** : ${c.traits}`);
    if (c.background) lines.push(`- **Background** : ${c.background}`);
    if (c.notes) lines.push(`- **Notes** : ${c.notes}`);
    lines.push("");
  }
  return lines.join("\n");
}

function exportLocations(db: DbInstance["db"]): string {
  const all = db.select().from(locations).all();
  if (all.length === 0) return "";

  const lines: string[] = ["## Lieux\n"];
  for (const l of all) {
    lines.push(`### ${l.name}`);
    if (l.description) lines.push(`- **Description** : ${l.description}`);
    if (l.atmosphere) lines.push(`- **Atmosphere** : ${l.atmosphere}`);
    if (l.geography) lines.push(`- **Geographie** : ${l.geography}`);
    if (l.notes) lines.push(`- **Notes** : ${l.notes}`);
    lines.push("");
  }
  return lines.join("\n");
}

function exportEvents(db: DbInstance["db"]): string {
  const all = db.select().from(events).orderBy(events.sortOrder).all();
  if (all.length === 0) return "";

  const lines: string[] = ["## Evenements (Timeline)\n"];
  for (const e of all) {
    const chapterInfo = e.chapter ? ` (${e.chapter})` : "";
    lines.push(`### ${e.sortOrder ?? "?"}. ${e.title}${chapterInfo}`);
    if (e.description) lines.push(e.description);

    const charNames = resolveNames(db, e.characters);
    if (charNames.length > 0) lines.push(`Personnages : ${charNames.join(", ")}`);

    if (e.locationId) {
      const loc = db.select().from(locations).where(eq(locations.id, e.locationId)).get();
      lines.push(`Lieu : ${loc ? loc.name : "(inconnu)"}`);
    }

    if (e.notes) lines.push(`Notes : ${e.notes}`);
    lines.push("");
  }
  return lines.join("\n");
}

function exportInteractions(db: DbInstance["db"]): string {
  const all = db.select().from(interactions).orderBy(interactions.sortOrder).all();
  if (all.length === 0) return "";

  const lines: string[] = ["## Interactions\n"];
  for (const i of all) {
    const charNames = resolveNames(db, i.characters);
    const nature = i.nature ?? "Relation";
    lines.push(`### ${nature} — ${charNames.join(", ")}`);
    lines.push(i.description);
    if (i.notes) lines.push(`Notes : ${i.notes}`);
    lines.push("");
  }
  return lines.join("\n");
}

function exportWorldRules(db: DbInstance["db"]): string {
  const all = db.select().from(worldRules).all();
  if (all.length === 0) return "";

  const lines: string[] = ["## Regles du Monde\n"];
  for (const r of all) {
    lines.push(`### ${r.category} — ${r.title}`);
    lines.push(r.description);
    if (r.notes) lines.push(`Notes : ${r.notes}`);
    lines.push("");
  }
  return lines.join("\n");
}

function exportResearch(db: DbInstance["db"]): string {
  const all = db.select().from(research).all();
  if (all.length === 0) return "";

  const lines: string[] = ["## Recherches\n"];
  for (const r of all) {
    lines.push(`### ${r.topic}`);
    lines.push(r.content);
    if (r.sources) {
      const sourceList: string[] = JSON.parse(r.sources);
      if (sourceList.length > 0) lines.push(`Sources : ${sourceList.join(", ")}`);
    }
    if (r.notes) lines.push(`Notes : ${r.notes}`);
    lines.push("");
  }
  return lines.join("\n");
}

function exportNotes(db: DbInstance["db"]): string {
  const all = db.select().from(notes).all();
  if (all.length === 0) return "";

  const lines: string[] = ["## Notes\n"];
  for (const n of all) {
    lines.push(n.content);
    if (n.tags) {
      const tagList: string[] = JSON.parse(n.tags);
      if (tagList.length > 0) lines.push(`Tags : ${tagList.join(", ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

const SECTION_MAP: Record<EntityType, (db: DbInstance["db"]) => string> = {
  characters: exportCharacters,
  locations: exportLocations,
  events: exportEvents,
  interactions: exportInteractions,
  world_rules: exportWorldRules,
  research: exportResearch,
  notes: exportNotes,
};

export function registerExportTools(server: McpServer, { db }: DbInstance): void {
  server.tool(
    "export_bible",
    "Exporte la bible complète (ou un type d'entité) en document Markdown structuré.",
    {
      entity_type: z
        .enum(VALID_ENTITY_TYPES)
        .optional()
        .describe(
          "Type d'entité à exporter (characters, locations, events, interactions, world_rules, research, notes). Si omis, exporte tout.",
        ),
    },
    async ({ entity_type }) => {
      const lines: string[] = ["# Bible d'Ecrivain\n"];

      if (entity_type) {
        // Export d'un seul type
        const exportFn = SECTION_MAP[entity_type];
        const section = exportFn(db);
        if (section) {
          lines.push(section);
        } else {
          lines.push(`_Aucune donnée pour le type "${entity_type}"._`);
        }
      } else {
        // Export complet — toutes les sections dans l'ordre
        for (const key of VALID_ENTITY_TYPES) {
          const section = SECTION_MAP[key](db);
          if (section) {
            lines.push(section);
          }
        }
      }

      const markdown = lines.join("\n");

      console.error(
        `[export] Bible exportée${entity_type ? ` (${entity_type})` : ""} — ${markdown.length} caractères`,
      );

      return {
        content: [{ type: "text" as const, text: markdown }],
      };
    },
  );

  console.error("[tools] Export tools enregistrés");
}
