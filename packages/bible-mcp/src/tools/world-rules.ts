import { z } from "zod";
import { eq } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DbInstance } from "../db/index.js";
import { worldRules } from "../db/schema.js";
import { indexEntity, removeEntityEmbedding } from "../embeddings/index.js";

export function registerWorldRuleTools(server: McpServer, { db, sqlite }: DbInstance): void {
  // ── create_world_rule ────────────────────────────────────────────
  server.tool(
    "create_world_rule",
    "Crée une nouvelle règle du monde (magie, technologie, société, religion, etc.).",
    {
      category: z.string().describe("Catégorie de la règle (ex : magie, technologie, société, religion…)"),
      title: z.string().describe("Titre de la règle"),
      description: z.string().describe("Description détaillée de la règle"),
      notes: z.string().optional().describe("Notes libres"),
    },
    async ({ category, title, description, notes }) => {
      const now = Date.now();
      const id = crypto.randomUUID();

      const rule = {
        id,
        category,
        title,
        description,
        notes: notes ?? null,
        createdAt: now,
        updatedAt: now,
      };

      db.insert(worldRules).values(rule).run();

      // Indexer l'embedding
      const textForEmbedding = [category, title, description, notes].filter(Boolean).join(" ");
      await indexEntity(sqlite, "world_rule", id, textForEmbedding);

      console.error(`[world-rules] Règle créée : ${title} [${category}] (${id})`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(rule, null, 2) }],
      };
    },
  );

  // ── get_world_rule ───────────────────────────────────────────────
  server.tool(
    "get_world_rule",
    "Récupère une règle du monde par son identifiant.",
    {
      id: z.string().describe("Identifiant UUID de la règle"),
    },
    async ({ id }) => {
      const rule = db.select().from(worldRules).where(eq(worldRules.id, id)).get();

      if (!rule) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Règle non trouvée (id: ${id}).` }],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(rule, null, 2) }],
      };
    },
  );

  // ── update_world_rule ────────────────────────────────────────────
  server.tool(
    "update_world_rule",
    "Met à jour les champs d'une règle du monde existante.",
    {
      id: z.string().describe("Identifiant UUID de la règle à modifier"),
      category: z.string().optional().describe("Nouvelle catégorie"),
      title: z.string().optional().describe("Nouveau titre"),
      description: z.string().optional().describe("Nouvelle description"),
      notes: z.string().optional().describe("Nouvelles notes"),
    },
    async ({ id, category, title, description, notes }) => {
      const existing = db.select().from(worldRules).where(eq(worldRules.id, id)).get();

      if (!existing) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Règle non trouvée (id: ${id}).` }],
        };
      }

      const updates: Record<string, unknown> = { updatedAt: Date.now() };
      if (category !== undefined) updates.category = category;
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (notes !== undefined) updates.notes = notes;

      db.update(worldRules).set(updates).where(eq(worldRules.id, id)).run();

      const updated = db.select().from(worldRules).where(eq(worldRules.id, id)).get();

      // Re-indexer l'embedding
      const textForEmbedding = [updated!.category, updated!.title, updated!.description, updated!.notes]
        .filter(Boolean)
        .join(" ");
      await indexEntity(sqlite, "world_rule", id, textForEmbedding);

      console.error(`[world-rules] Règle mise à jour : ${updated!.title} (${id})`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(updated, null, 2) }],
      };
    },
  );

  // ── delete_world_rule ────────────────────────────────────────────
  server.tool(
    "delete_world_rule",
    "Supprime une règle du monde et son embedding associé.",
    {
      id: z.string().describe("Identifiant UUID de la règle à supprimer"),
    },
    async ({ id }) => {
      const existing = db.select().from(worldRules).where(eq(worldRules.id, id)).get();

      if (!existing) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Règle non trouvée (id: ${id}).` }],
        };
      }

      // Supprimer l'embedding associé
      removeEntityEmbedding(sqlite, "world_rule", id);

      // Supprimer la règle
      db.delete(worldRules).where(eq(worldRules.id, id)).run();

      console.error(`[world-rules] Règle supprimée : ${existing.title} (${id})`);

      return {
        content: [{ type: "text" as const, text: `Règle "${existing.title}" supprimée.` }],
      };
    },
  );

  // ── list_world_rules ─────────────────────────────────────────────
  server.tool(
    "list_world_rules",
    "Liste les règles du monde, avec filtre optionnel par catégorie.",
    {
      category: z.string().optional().describe("Filtrer par catégorie (optionnel)"),
      limit: z.number().optional().default(50).describe("Nombre maximum de résultats (défaut : 50)"),
      offset: z.number().optional().default(0).describe("Décalage pour la pagination (défaut : 0)"),
    },
    async ({ category, limit, offset }) => {
      let query = db.select().from(worldRules).$dynamic();

      if (category) {
        query = query.where(eq(worldRules.category, category));
      }

      const results = query.limit(limit).offset(offset).all();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total: results.length, worldRules: results }, null, 2),
          },
        ],
      };
    },
  );

  console.error("[tools] World-rules tools enregistrés");
}
