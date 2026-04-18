import { z } from "zod";
import { eq } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DbInstance } from "../db/index.js";
import { research, embeddings } from "../db/schema.js";
import { indexEntity, removeEntityEmbedding } from "../embeddings/index.js";

export function registerResearchTools(server: McpServer, { db, sqlite }: DbInstance): void {
  // ── create_research ─────────────────────────────────────────────
  server.tool(
    "create_research",
    "Crée une nouvelle fiche de recherche dans la bible.",
    {
      topic: z.string().describe("Sujet de la recherche (obligatoire)"),
      content: z.string().describe("Contenu de la recherche (obligatoire)"),
      sources: z.string().optional().describe("Sources (JSON array : [\"url1\", \"livre1\"])"),
      notes: z.string().optional().describe("Notes libres"),
    },
    async ({ topic, content, sources, notes }) => {
      const now = Date.now();
      const id = crypto.randomUUID();

      const record = {
        id,
        topic,
        content,
        sources: sources ?? null,
        notes: notes ?? null,
        createdAt: now,
        updatedAt: now,
      };

      db.insert(research).values(record).run();

      // Indexer l'embedding
      const textForEmbedding = [topic, content, sources, notes].filter(Boolean).join(" ");
      await indexEntity(sqlite, "research", id, textForEmbedding);

      console.error(`[research] Recherche créée : ${topic} (${id})`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(record, null, 2) }],
      };
    },
  );

  // ── get_research ────────────────────────────────────────────────
  server.tool(
    "get_research",
    "Récupère une fiche de recherche par son identifiant.",
    {
      id: z.string().describe("Identifiant UUID de la recherche"),
    },
    async ({ id }) => {
      const record = db.select().from(research).where(eq(research.id, id)).get();

      if (!record) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Recherche non trouvée (id: ${id}).` }],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(record, null, 2) }],
      };
    },
  );

  // ── update_research ─────────────────────────────────────────────
  server.tool(
    "update_research",
    "Met à jour les champs d'une fiche de recherche existante.",
    {
      id: z.string().describe("Identifiant UUID de la recherche à modifier"),
      topic: z.string().optional().describe("Nouveau sujet"),
      content: z.string().optional().describe("Nouveau contenu"),
      sources: z.string().optional().describe("Nouvelles sources (JSON array)"),
      notes: z.string().optional().describe("Nouvelles notes"),
    },
    async ({ id, topic, content, sources, notes }) => {
      const existing = db.select().from(research).where(eq(research.id, id)).get();

      if (!existing) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Recherche non trouvée (id: ${id}).` }],
        };
      }

      const updates: Record<string, unknown> = { updatedAt: Date.now() };
      if (topic !== undefined) updates.topic = topic;
      if (content !== undefined) updates.content = content;
      if (sources !== undefined) updates.sources = sources;
      if (notes !== undefined) updates.notes = notes;

      db.update(research).set(updates).where(eq(research.id, id)).run();

      const updated = db.select().from(research).where(eq(research.id, id)).get();

      // Re-indexer l'embedding
      const textForEmbedding = [updated!.topic, updated!.content, updated!.sources, updated!.notes]
        .filter(Boolean)
        .join(" ");
      await indexEntity(sqlite, "research", id, textForEmbedding);

      console.error(`[research] Recherche mise à jour : ${updated!.topic} (${id})`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(updated, null, 2) }],
      };
    },
  );

  // ── delete_research ─────────────────────────────────────────────
  server.tool(
    "delete_research",
    "Supprime une fiche de recherche et son embedding associé.",
    {
      id: z.string().describe("Identifiant UUID de la recherche à supprimer"),
    },
    async ({ id }) => {
      const existing = db.select().from(research).where(eq(research.id, id)).get();

      if (!existing) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Recherche non trouvée (id: ${id}).` }],
        };
      }

      // Supprimer l'embedding associé
      removeEntityEmbedding(sqlite, "research", id);

      // Supprimer la recherche
      db.delete(research).where(eq(research.id, id)).run();

      console.error(`[research] Recherche supprimée : ${existing.topic} (${id})`);

      return {
        content: [{ type: "text" as const, text: `Recherche "${existing.topic}" supprimée.` }],
      };
    },
  );

  // ── list_research ───────────────────────────────────────────────
  server.tool(
    "list_research",
    "Liste toutes les fiches de recherche de la bible avec pagination.",
    {
      limit: z.number().optional().default(50).describe("Nombre maximum de résultats (défaut : 50)"),
      offset: z.number().optional().default(0).describe("Décalage pour la pagination (défaut : 0)"),
    },
    async ({ limit, offset }) => {
      const results = db
        .select()
        .from(research)
        .limit(limit)
        .offset(offset)
        .all();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total: results.length, research: results }, null, 2),
          },
        ],
      };
    },
  );

  console.error("[tools] Research tools enregistrés");
}
