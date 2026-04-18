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
import { generateQueryEmbedding, loadAllEmbeddings } from "../embeddings/index.js";
import { topK } from "../embeddings/similarity.js";

function initEntityTables() {
  return {
    character: { table: characters, idCol: characters.id },
    location: { table: locations, idCol: locations.id },
    event: { table: events, idCol: events.id },
    interaction: { table: interactions, idCol: interactions.id },
    world_rule: { table: worldRules, idCol: worldRules.id },
    research: { table: research, idCol: research.id },
    note: { table: notes, idCol: notes.id },
  } as const;
}

function loadEntity(
  db: DbInstance["db"],
  entityType: string,
  entityId: string,
): Record<string, unknown> | undefined {
  const tables = initEntityTables();
  const mapping = tables[entityType as keyof typeof tables];
  if (!mapping) return undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = db.select().from(mapping.table as any).where(eq(mapping.idCol as any, entityId)).get();
  return result as Record<string, unknown> | undefined;
}

export function registerSearchTools(server: McpServer, { sqlite, db }: DbInstance): void {
  // ── search_fulltext ─────────────────────────────────────────────────
  server.tool(
    "search_fulltext",
    "Recherche fulltext dans toute la bible via FTS5. Supporte préfixes (\"bob*\"), phrases (\"yeux verts\"), booléens (OR, NOT).",
    {
      query: z.string().describe("Requête de recherche (syntaxe FTS5)"),
      entity_type: z
        .string()
        .optional()
        .describe("Filtrer par type d'entité : character, location, event, interaction, world_rule, research, note"),
      limit: z.number().optional().default(10).describe("Nombre maximum de résultats (défaut : 10)"),
    },
    async ({ query, entity_type, limit }) => {
      if (!query.trim()) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ results: [], message: "Requête vide." }) }],
        };
      }

      try {
        let sql: string;
        let params: unknown[];

        if (entity_type) {
          sql = `
            SELECT entity_type, entity_id,
                   snippet(bible_fts, 2, '<b>', '</b>', '...', 30) as snippet,
                   rank
            FROM bible_fts
            WHERE bible_fts MATCH ? AND entity_type = ?
            ORDER BY rank
            LIMIT ?
          `;
          params = [query, entity_type, limit];
        } else {
          sql = `
            SELECT entity_type, entity_id,
                   snippet(bible_fts, 2, '<b>', '</b>', '...', 30) as snippet,
                   rank
            FROM bible_fts
            WHERE bible_fts MATCH ?
            ORDER BY rank
            LIMIT ?
          `;
          params = [query, limit];
        }

        const rows = sqlite.prepare(sql).all(...params) as Array<{
          entity_type: string;
          entity_id: string;
          snippet: string;
          rank: number;
        }>;

        if (rows.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ results: [], message: "Aucun résultat trouvé." }),
              },
            ],
          };
        }

        // Enrichir chaque résultat avec les données complètes
        const results = rows.map((row) => {
          const entity = loadEntity(db, row.entity_type, row.entity_id);
          return {
            entity_type: row.entity_type,
            entity_id: row.entity_id,
            snippet: row.snippet,
            rank: row.rank,
            entity: entity ?? null,
          };
        });

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ results }, null, 2) }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Erreur de recherche fulltext : ${message}` }],
        };
      }
    },
  );

  // ── search_semantic ──────────────────────────────────────────────────
  server.tool(
    "search_semantic",
    "Recherche sémantique dans la bible par similarité vectorielle. Trouve des entités conceptuellement proches de la requête, même sans mots-clés exacts.",
    {
      query: z.string().describe("Requête de recherche en langage naturel"),
      entity_type: z
        .string()
        .optional()
        .describe("Filtrer par type d'entité : character, location, event, interaction, world_rule, research, note"),
      limit: z.number().optional().default(10).describe("Nombre maximum de résultats (défaut : 10)"),
      threshold: z.number().optional().default(0.5).describe("Score de similarité minimum (0-1, défaut : 0.5)"),
    },
    async ({ query, entity_type, limit, threshold }) => {
      if (!query.trim()) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ results: [], message: "Requête vide." }) }],
        };
      }

      try {
        // Charger tous les embeddings
        const allEmbeddings = loadAllEmbeddings(sqlite, entity_type);

        if (allEmbeddings.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  results: [],
                  message: "Aucun embedding indexé en base. Les embeddings sont générés lors de la création/modification des entités.",
                }),
              },
            ],
          };
        }

        // Générer l'embedding de la requête
        const queryEmb = await generateQueryEmbedding(query);

        // Trouver les plus proches
        const topResults = topK(queryEmb, allEmbeddings, limit, entity_type);

        // Filtrer par threshold
        const filtered = topResults.filter((r) => r.score >= threshold);

        if (filtered.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  results: [],
                  message: `Aucun résultat au-dessus du seuil de similarité (${threshold}).`,
                }),
              },
            ],
          };
        }

        // Enrichir avec les données complètes
        const results = filtered.map((r) => {
          const entity = loadEntity(db, r.entity_type, r.entity_id);
          return {
            entity_type: r.entity_type,
            entity_id: r.entity_id,
            score: Math.round(r.score * 10000) / 10000,
            entity: entity ?? null,
          };
        });

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ results }, null, 2) }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Erreur de recherche sémantique : ${message}` }],
        };
      }
    },
  );

  console.error("[tools] Search tools enregistrés");
}
