import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import crypto from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DbInstance } from "../db/index.js";
import { interactions, characters } from "../db/schema.js";
import { indexEntity, removeEntityEmbedding } from "../embeddings/index.js";

/** Résout les noms des personnages à partir de leurs UUIDs */
function resolveCharacterNames(
  db: DbInstance["db"],
  characterIds: string[],
): { id: string; name: string }[] {
  return characterIds.map((cid) => {
    const char = db.select({ id: characters.id, name: characters.name })
      .from(characters)
      .where(eq(characters.id, cid))
      .get();
    return char ?? { id: cid, name: "(inconnu)" };
  });
}

/** Enrichit une interaction avec les noms des personnages */
function enrichInteraction(
  db: DbInstance["db"],
  interaction: typeof interactions.$inferSelect,
) {
  const characterIds: string[] = JSON.parse(interaction.characters);
  const resolved = resolveCharacterNames(db, characterIds);
  return { ...interaction, characterDetails: resolved };
}

export function registerInteractionTools(server: McpServer, { db, sqlite }: DbInstance): void {
  // ── create_interaction ─────────────────────────────────────────────
  server.tool(
    "create_interaction",
    "Crée une nouvelle interaction entre personnages (minimum 2).",
    {
      description: z.string().describe("Description de l'interaction (obligatoire)"),
      characters: z.array(z.string()).min(2).describe("Tableau d'UUIDs des personnages impliqués (min 2)"),
      nature: z.string().optional().describe("Nature de l'interaction (amitié, conflit, romance, alliance…)"),
      chapter: z.string().optional().describe("Chapitre ou section de référence"),
      sort_order: z.number().int().optional().describe("Ordre de tri (auto-incrémenté si non fourni)"),
      notes: z.string().optional().describe("Notes libres"),
    },
    async ({ description, characters: charIds, nature, chapter, sort_order, notes }) => {
      // Valider minimum 2 personnages
      if (!charIds || charIds.length < 2) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: "Il faut au moins 2 personnages pour créer une interaction." }],
        };
      }

      // Valider que les personnages existent
      for (const cid of charIds) {
        const exists = db.select({ id: characters.id }).from(characters).where(eq(characters.id, cid)).get();
        if (!exists) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: `Personnage non trouvé (id: ${cid}).` }],
          };
        }
      }

      // Auto-incrémenter sort_order si non fourni
      let finalSortOrder = sort_order;
      if (finalSortOrder === undefined) {
        const maxRow = db
          .select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` })
          .from(interactions)
          .get();
        finalSortOrder = (maxRow?.max ?? 0) + 1;
      }

      const now = Math.floor(Date.now() / 1000);
      const interaction = {
        id: crypto.randomUUID(),
        description,
        nature: nature ?? null,
        characters: JSON.stringify(charIds),
        chapter: chapter ?? null,
        sortOrder: finalSortOrder,
        notes: notes ?? null,
        createdAt: now,
        updatedAt: now,
      };

      db.insert(interactions).values(interaction).run();

      // Indexer l'embedding
      const textForEmbedding = [description, nature, chapter, notes].filter(Boolean).join(" ");
      await indexEntity(sqlite, "interaction", interaction.id, textForEmbedding);

      console.error(`[interactions] Interaction créée: ${interaction.id}`);

      const created = db.select().from(interactions).where(eq(interactions.id, interaction.id)).get()!;
      return {
        content: [{ type: "text" as const, text: JSON.stringify(enrichInteraction(db, created), null, 2) }],
      };
    },
  );

  // ── get_interaction ────────────────────────────────────────────────
  server.tool(
    "get_interaction",
    "Récupère une interaction par son identifiant, enrichie avec les noms des personnages.",
    {
      id: z.string().describe("Identifiant UUID de l'interaction"),
    },
    async ({ id }) => {
      const interaction = db.select().from(interactions).where(eq(interactions.id, id)).get();
      if (!interaction) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Interaction non trouvée (id: ${id}).` }],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(enrichInteraction(db, interaction), null, 2) }],
      };
    },
  );

  // ── update_interaction ─────────────────────────────────────────────
  server.tool(
    "update_interaction",
    "Met à jour une interaction existante. Seuls les champs fournis sont modifiés.",
    {
      id: z.string().describe("Identifiant UUID de l'interaction à modifier"),
      description: z.string().optional().describe("Nouvelle description"),
      characters: z.array(z.string()).min(2).optional().describe("Nouveau tableau d'UUIDs (min 2)"),
      nature: z.string().optional().describe("Nouvelle nature"),
      chapter: z.string().optional().describe("Nouveau chapitre"),
      sort_order: z.number().int().optional().describe("Nouvel ordre de tri"),
      notes: z.string().optional().describe("Nouvelles notes"),
    },
    async ({ id, description, characters: charIds, nature, chapter, sort_order, notes }) => {
      const existing = db.select().from(interactions).where(eq(interactions.id, id)).get();
      if (!existing) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Interaction non trouvée (id: ${id}).` }],
        };
      }

      // Valider les nouveaux personnages si fournis
      if (charIds) {
        for (const cid of charIds) {
          const exists = db.select({ id: characters.id }).from(characters).where(eq(characters.id, cid)).get();
          if (!exists) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: `Personnage non trouvé (id: ${cid}).` }],
            };
          }
        }
      }

      const updates: Record<string, unknown> = { updatedAt: Math.floor(Date.now() / 1000) };
      if (description !== undefined) updates.description = description;
      if (charIds !== undefined) updates.characters = JSON.stringify(charIds);
      if (nature !== undefined) updates.nature = nature;
      if (chapter !== undefined) updates.chapter = chapter;
      if (sort_order !== undefined) updates.sortOrder = sort_order;
      if (notes !== undefined) updates.notes = notes;

      db.update(interactions).set(updates).where(eq(interactions.id, id)).run();

      const updated = db.select().from(interactions).where(eq(interactions.id, id)).get()!;

      // Re-indexer l'embedding
      const textForEmbedding = [updated.description, updated.nature, updated.chapter, updated.notes]
        .filter(Boolean)
        .join(" ");
      await indexEntity(sqlite, "interaction", id, textForEmbedding);

      console.error(`[interactions] Interaction mise à jour: ${id}`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(enrichInteraction(db, updated), null, 2) }],
      };
    },
  );

  // ── delete_interaction ─────────────────────────────────────────────
  server.tool(
    "delete_interaction",
    "Supprime une interaction de la bible ainsi que son embedding associé.",
    {
      id: z.string().describe("Identifiant UUID de l'interaction à supprimer"),
    },
    async ({ id }) => {
      const existing = db.select().from(interactions).where(eq(interactions.id, id)).get();
      if (!existing) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Interaction non trouvée (id: ${id}).` }],
        };
      }

      // Supprimer l'embedding associé
      removeEntityEmbedding(sqlite, "interaction", id);

      // Supprimer l'interaction
      db.delete(interactions).where(eq(interactions.id, id)).run();
      console.error(`[interactions] Interaction supprimée: ${id}`);

      return {
        content: [{ type: "text" as const, text: `Interaction "${existing.description.substring(0, 50)}…" supprimée avec succès.` }],
      };
    },
  );

  // ── list_interactions ──────────────────────────────────────────────
  server.tool(
    "list_interactions",
    "Liste toutes les interactions de la bible avec pagination.",
    {
      limit: z.number().int().min(1).max(200).default(50).describe("Nombre max de résultats (défaut 50)"),
      offset: z.number().int().min(0).default(0).describe("Décalage pour la pagination (défaut 0)"),
    },
    async ({ limit, offset }) => {
      const results = db.select().from(interactions).limit(limit).offset(offset).all();
      const total = db.select().from(interactions).all().length;

      const enriched = results.map((i) => enrichInteraction(db, i));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total, limit, offset, results: enriched }, null, 2),
          },
        ],
      };
    },
  );

  // ── get_character_relations ────────────────────────────────────────
  server.tool(
    "get_character_relations",
    "Retourne toutes les interactions impliquant un personnage donné, triées par ordre chronologique, enrichies avec les noms.",
    {
      character_id: z.string().describe("Identifiant UUID du personnage"),
    },
    async ({ character_id }) => {
      // Vérifier que le personnage existe
      const char = db.select().from(characters).where(eq(characters.id, character_id)).get();
      if (!char) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Personnage non trouvé (id: ${character_id}).` }],
        };
      }

      // Filtrer via LIKE sur le champ JSON characters (contient l'UUID)
      const allInteractions = db
        .select()
        .from(interactions)
        .where(sql`${interactions.characters} LIKE ${"%" + character_id + "%"}`)
        .orderBy(interactions.sortOrder)
        .all();

      const enriched = allInteractions.map((i) => enrichInteraction(db, i));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { character: { id: char.id, name: char.name }, total: enriched.length, interactions: enriched },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  console.error("[tools] Interactions tools enregistrés");
}
