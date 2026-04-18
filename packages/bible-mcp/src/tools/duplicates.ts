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
import { loadAllEmbeddings } from "../embeddings/index.js";
import { cosineSimilarity } from "../embeddings/similarity.js";

// ── Helpers pour charger le nom/titre d'une entite ──────────────────

function getEntityLabel(
  db: DbInstance["db"],
  entityType: string,
  entityId: string,
): { name?: string; title?: string } | undefined {
  switch (entityType) {
    case "character": {
      const row = db.select().from(characters).where(eq(characters.id, entityId)).get();
      return row ? { name: row.name } : undefined;
    }
    case "location": {
      const row = db.select().from(locations).where(eq(locations.id, entityId)).get();
      return row ? { name: row.name } : undefined;
    }
    case "event": {
      const row = db.select().from(events).where(eq(events.id, entityId)).get();
      return row ? { title: row.title } : undefined;
    }
    case "interaction": {
      const row = db.select().from(interactions).where(eq(interactions.id, entityId)).get();
      return row ? { name: row.description.slice(0, 60) } : undefined;
    }
    case "world_rule": {
      const row = db.select().from(worldRules).where(eq(worldRules.id, entityId)).get();
      return row ? { title: row.title } : undefined;
    }
    case "research": {
      const row = db.select().from(research).where(eq(research.id, entityId)).get();
      return row ? { title: row.topic } : undefined;
    }
    case "note": {
      const row = db.select().from(notes).where(eq(notes.id, entityId)).get();
      return row ? { name: row.content.slice(0, 60) } : undefined;
    }
    default:
      return undefined;
  }
}

// ── Registration ────────────────────────────────────────────────────

export function registerDuplicateTools(server: McpServer, { sqlite, db }: DbInstance): void {
  server.tool(
    "detect_duplicates",
    "Détecte les doublons sémantiques dans la bible en comparant les embeddings par similarité cosinus. Retourne les paires suspectes au-dessus du seuil.",
    {
      entity_type: z
        .string()
        .optional()
        .describe(
          "Filtrer par type d'entité : character, location, event, interaction, world_rule, research, note",
        ),
      threshold: z
        .number()
        .min(0)
        .max(1)
        .default(0.85)
        .describe("Seuil de similarité minimum (0-1, défaut : 0.85)"),
    },
    async ({ entity_type, threshold }) => {
      const allEmbeddings = loadAllEmbeddings(sqlite, entity_type);

      if (allEmbeddings.length < 2) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                pairs: [],
                message: "Pas assez d'entités indexées pour détecter des doublons.",
              }),
            },
          ],
        };
      }

      // Comparer toutes les paires (i, j) ou i < j
      const pairs: Array<{
        entity_a: { type: string; id: string; label: string };
        entity_b: { type: string; id: string; label: string };
        score: number;
      }> = [];

      for (let i = 0; i < allEmbeddings.length; i++) {
        for (let j = i + 1; j < allEmbeddings.length; j++) {
          const a = allEmbeddings[i];
          const b = allEmbeddings[j];

          const score = cosineSimilarity(a.embedding, b.embedding);

          if (score >= threshold) {
            const labelA = getEntityLabel(db, a.entity_type, a.entity_id);
            const labelB = getEntityLabel(db, b.entity_type, b.entity_id);

            pairs.push({
              entity_a: {
                type: a.entity_type,
                id: a.entity_id,
                label: labelA?.name ?? labelA?.title ?? "(inconnu)",
              },
              entity_b: {
                type: b.entity_type,
                id: b.entity_id,
                label: labelB?.name ?? labelB?.title ?? "(inconnu)",
              },
              score: Math.round(score * 10000) / 10000,
            });
          }
        }
      }

      // Trier par score decroissant
      pairs.sort((a, b) => b.score - a.score);

      console.error(`[duplicates] ${pairs.length} paire(s) suspecte(s) détectée(s) (seuil: ${threshold})`);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { threshold, total_compared: allEmbeddings.length, pairs },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  console.error("[tools] Duplicates tools enregistrés");
}
