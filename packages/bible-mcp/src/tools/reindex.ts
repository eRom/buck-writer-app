import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DbInstance } from "../db/index.js";
import { characters, locations, events, interactions, worldRules, research, notes } from "../db/schema.js";
import { indexEntity } from "../embeddings/index.js";

/** Configuration des champs texte à concaténer pour chaque type d'entité. */
const ENTITY_CONFIGS = [
  { type: "character", table: characters, textFields: ["name", "description", "traits", "background", "notes"] },
  { type: "location", table: locations, textFields: ["name", "description", "atmosphere", "geography", "notes"] },
  { type: "event", table: events, textFields: ["title", "description", "chapter", "notes"] },
  { type: "interaction", table: interactions, textFields: ["description", "nature", "chapter", "notes"] },
  { type: "world_rule", table: worldRules, textFields: ["category", "title", "description", "notes"] },
  { type: "research", table: research, textFields: ["topic", "content", "sources", "notes"] },
  { type: "note", table: notes, textFields: ["content", "tags"] },
] as const;

export function registerReindexTools(server: McpServer, { db, sqlite }: DbInstance): void {
  server.tool(
    "reindex_embeddings",
    "Ré-indexe les embeddings de toutes les entités (ou d'un type spécifique). Idempotent : ne re-génère que si le contenu a changé.",
    {
      entity_type: z
        .enum(["character", "location", "event", "interaction", "world_rule", "research", "note"])
        .optional()
        .describe("Type d'entité à ré-indexer (tous si omis)"),
    },
    async ({ entity_type }) => {
      const configs = entity_type
        ? ENTITY_CONFIGS.filter((c) => c.type === entity_type)
        : [...ENTITY_CONFIGS];

      const results: Record<string, number> = {};
      let total = 0;

      for (const config of configs) {
        const rows = db.select().from(config.table).all();
        let count = 0;

        for (const row of rows) {
          const record = row as Record<string, unknown>;
          const text = config.textFields
            .map((f) => record[f])
            .filter(Boolean)
            .join(" ");

          if (text.trim()) {
            await indexEntity(sqlite, config.type, record.id as string, text);
            count++;
          }
        }

        results[config.type] = count;
        total += count;
        console.error(`[reindex] ${config.type}: ${count} entités indexées`);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total, details: results }, null, 2),
          },
        ],
      };
    },
  );

  console.error("[tools] Reindex tools enregistrés");
}
