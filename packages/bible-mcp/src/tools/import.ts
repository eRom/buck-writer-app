import { z } from "zod";
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
import { indexEntity } from "../embeddings/index.js";

// ── Schemas Zod par type d'entite ────────────────────────────────────

const characterSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  traits: z.string().optional(),
  background: z.string().optional(),
  notes: z.string().optional(),
});

const locationSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  atmosphere: z.string().optional(),
  geography: z.string().optional(),
  notes: z.string().optional(),
});

const eventSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  chapter: z.string().optional(),
  sort_order: z.number().optional(),
  location_id: z.string().optional(),
  characters: z.string().optional(),
  notes: z.string().optional(),
});

const interactionSchema = z.object({
  description: z.string(),
  nature: z.string().optional(),
  characters: z.string(),
  chapter: z.string().optional(),
  sort_order: z.number().optional(),
  notes: z.string().optional(),
});

const worldRuleSchema = z.object({
  category: z.string(),
  title: z.string(),
  description: z.string(),
  notes: z.string().optional(),
});

const researchSchema = z.object({
  topic: z.string(),
  content: z.string(),
  sources: z.string().optional(),
  notes: z.string().optional(),
});

const noteSchema = z.object({
  content: z.string(),
  tags: z.string().optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────

type EntityType = "characters" | "locations" | "events" | "interactions" | "world_rules" | "research" | "notes";

const ENTITY_CONFIG: Record<
  EntityType,
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema: z.ZodType<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    table: any;
    embeddingType: string;
    buildRow: (data: Record<string, unknown>, id: string, now: number) => Record<string, unknown>;
    textForEmbedding: (data: Record<string, unknown>) => string;
  }
> = {
  characters: {
    schema: characterSchema,
    table: characters,
    embeddingType: "character",
    buildRow: (data, id, now) => ({
      id,
      name: data.name,
      description: data.description ?? null,
      traits: data.traits ?? null,
      background: data.background ?? null,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    }),
    textForEmbedding: (d) =>
      [d.name, d.description, d.traits, d.background, d.notes].filter(Boolean).join(" "),
  },
  locations: {
    schema: locationSchema,
    table: locations,
    embeddingType: "location",
    buildRow: (data, id, now) => ({
      id,
      name: data.name,
      description: data.description ?? null,
      atmosphere: data.atmosphere ?? null,
      geography: data.geography ?? null,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    }),
    textForEmbedding: (d) =>
      [d.name, d.description, d.atmosphere, d.geography, d.notes].filter(Boolean).join(" "),
  },
  events: {
    schema: eventSchema,
    table: events,
    embeddingType: "event",
    buildRow: (data, id, now) => ({
      id,
      title: data.title,
      description: data.description ?? null,
      chapter: data.chapter ?? null,
      sortOrder: data.sort_order ?? null,
      locationId: data.location_id ?? null,
      characters: data.characters ?? null,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    }),
    textForEmbedding: (d) =>
      [d.title, d.description, d.chapter, d.notes].filter(Boolean).join(" "),
  },
  interactions: {
    schema: interactionSchema,
    table: interactions,
    embeddingType: "interaction",
    buildRow: (data, id, now) => ({
      id,
      description: data.description,
      nature: data.nature ?? null,
      characters: data.characters,
      chapter: data.chapter ?? null,
      sortOrder: data.sort_order ?? null,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    }),
    textForEmbedding: (d) =>
      [d.description, d.nature, d.chapter, d.notes].filter(Boolean).join(" "),
  },
  world_rules: {
    schema: worldRuleSchema,
    table: worldRules,
    embeddingType: "world_rule",
    buildRow: (data, id, now) => ({
      id,
      category: data.category,
      title: data.title,
      description: data.description,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    }),
    textForEmbedding: (d) =>
      [d.category, d.title, d.description, d.notes].filter(Boolean).join(" "),
  },
  research: {
    schema: researchSchema,
    table: research,
    embeddingType: "research",
    buildRow: (data, id, now) => ({
      id,
      topic: data.topic,
      content: data.content,
      sources: data.sources ?? null,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    }),
    textForEmbedding: (d) =>
      [d.topic, d.content, d.sources, d.notes].filter(Boolean).join(" "),
  },
  notes: {
    schema: noteSchema,
    table: notes,
    embeddingType: "note",
    buildRow: (data, id, now) => ({
      id,
      content: data.content,
      tags: data.tags ?? null,
      createdAt: now,
      updatedAt: now,
    }),
    textForEmbedding: (d) => [d.content, d.tags].filter(Boolean).join(" "),
  },
};

// ── Registration ────────────────────────────────────────────────────

export function registerImportTools(server: McpServer, { sqlite, db }: DbInstance): void {
  server.tool(
    "import_bulk",
    "Importe en masse des entités dans la bible depuis un objet JSON structuré. Transaction tout-ou-rien. Gestion doublons via on_conflict (skip ou update).",
    {
      data: z
        .object({
          characters: z.array(z.record(z.unknown())).optional(),
          locations: z.array(z.record(z.unknown())).optional(),
          events: z.array(z.record(z.unknown())).optional(),
          interactions: z.array(z.record(z.unknown())).optional(),
          world_rules: z.array(z.record(z.unknown())).optional(),
          research: z.array(z.record(z.unknown())).optional(),
          notes: z.array(z.record(z.unknown())).optional(),
        })
        .describe("Objet JSON avec clés optionnelles par type d'entité"),
      on_conflict: z
        .enum(["skip", "update"])
        .default("skip")
        .describe("Stratégie doublons : 'skip' (INSERT OR IGNORE) ou 'update' (INSERT OR REPLACE). Défaut : skip"),
    },
    async ({ data, on_conflict }) => {
      const errors: string[] = [];
      const imported: Record<string, number> = {};
      let skipped = 0;

      // Structures pour l'indexation embeddings post-transaction
      const toEmbed: Array<{ type: string; id: string; text: string }> = [];

      try {
        // ── Phase 1 : Validation + insertion en transaction ──────────
        const insertOrMode = on_conflict === "update" ? "OR REPLACE" : "OR IGNORE";

        sqlite.exec("BEGIN TRANSACTION");

        for (const [entityKey, config] of Object.entries(ENTITY_CONFIG)) {
          const items = data[entityKey as EntityType];
          if (!items || items.length === 0) continue;

          let count = 0;

          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const parsed = config.schema.safeParse(item);

            if (!parsed.success) {
              const issues = parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join(", ");
              errors.push(`${entityKey}[${i}]: validation échouée — ${issues}`);
              continue;
            }

            const validData = parsed.data as Record<string, unknown>;
            const id = crypto.randomUUID();
            const now = Date.now();
            const row = config.buildRow(validData, id, now);

            // Construire le SQL dynamiquement selon les colonnes de la row
            const columns = Object.keys(row);
            const placeholders = columns.map(() => "?").join(", ");
            const values = columns.map((c) => row[c]);

            const sql = `INSERT ${insertOrMode} INTO ${entityKey === "world_rules" ? "world_rules" : entityKey}(${columns.map((c) => camelToSnake(c)).join(", ")}) VALUES (${placeholders})`;

            const result = sqlite.prepare(sql).run(...values);

            if (result.changes > 0) {
              count++;
              const embText = config.textForEmbedding(validData);
              if (embText.trim()) {
                toEmbed.push({ type: config.embeddingType, id, text: embText });
              }
            } else {
              skipped++;
            }
          }

          if (count > 0) {
            imported[entityKey] = count;
          }
        }

        sqlite.exec("COMMIT");
      } catch (err: unknown) {
        sqlite.exec("ROLLBACK");
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Erreur lors de l'import (rollback effectué) : ${message}` }],
        };
      }

      // ── Phase 2 : Rebuild FTS ─────────────────────────────────────
      try {
        sqlite.exec("INSERT INTO bible_fts(bible_fts) VALUES('rebuild')");
        console.error("[import] Index FTS reconstruit");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`FTS rebuild échoué : ${message}`);
      }

      // ── Phase 3 : Embeddings (async) ──────────────────────────────
      let embeddingsIndexed = 0;
      for (const item of toEmbed) {
        try {
          await indexEntity(sqlite, item.type, item.id, item.text);
          embeddingsIndexed++;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`Embedding ${item.type}/${item.id} échoué : ${message}`);
        }
      }

      const totalImported = Object.values(imported).reduce((a, b) => a + b, 0);
      console.error(`[import] Import terminé : ${totalImported} entités importées, ${skipped} ignorées, ${embeddingsIndexed} embeddings générés`);

      const report = {
        imported,
        skipped,
        embeddings_indexed: embeddingsIndexed,
        errors,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }],
      };
    },
  );

  console.error("[tools] Import tools enregistrés");
}

// ── Utils ───────────────────────────────────────────────────────────

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
