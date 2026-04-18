import { z } from "zod";
import { eq, like } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DbInstance } from "../db/index.js";
import { notes, embeddings } from "../db/schema.js";
import { indexEntity, removeEntityEmbedding } from "../embeddings/index.js";

export function registerNoteTools(server: McpServer, { db, sqlite }: DbInstance): void {
  // ── create_note ─────────────────────────────────────────────────
  server.tool(
    "create_note",
    "Crée une nouvelle note dans la bible.",
    {
      content: z.string().describe("Contenu de la note (obligatoire)"),
      tags: z.string().optional().describe("Tags (JSON array : [\"tag1\", \"tag2\"])"),
    },
    async ({ content, tags }) => {
      const now = Date.now();
      const id = crypto.randomUUID();

      const record = {
        id,
        content,
        tags: tags ?? null,
        createdAt: now,
        updatedAt: now,
      };

      db.insert(notes).values(record).run();

      // Indexer l'embedding
      const textForEmbedding = [content, tags].filter(Boolean).join(" ");
      await indexEntity(sqlite, "note", id, textForEmbedding);

      console.error(`[notes] Note créée : ${id}`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(record, null, 2) }],
      };
    },
  );

  // ── get_note ────────────────────────────────────────────────────
  server.tool(
    "get_note",
    "Récupère une note par son identifiant.",
    {
      id: z.string().describe("Identifiant UUID de la note"),
    },
    async ({ id }) => {
      const record = db.select().from(notes).where(eq(notes.id, id)).get();

      if (!record) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Note non trouvée (id: ${id}).` }],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(record, null, 2) }],
      };
    },
  );

  // ── update_note ─────────────────────────────────────────────────
  server.tool(
    "update_note",
    "Met à jour les champs d'une note existante.",
    {
      id: z.string().describe("Identifiant UUID de la note à modifier"),
      content: z.string().optional().describe("Nouveau contenu"),
      tags: z.string().optional().describe("Nouveaux tags (JSON array)"),
    },
    async ({ id, content, tags }) => {
      const existing = db.select().from(notes).where(eq(notes.id, id)).get();

      if (!existing) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Note non trouvée (id: ${id}).` }],
        };
      }

      const updates: Record<string, unknown> = { updatedAt: Date.now() };
      if (content !== undefined) updates.content = content;
      if (tags !== undefined) updates.tags = tags;

      db.update(notes).set(updates).where(eq(notes.id, id)).run();

      const updated = db.select().from(notes).where(eq(notes.id, id)).get();

      // Re-indexer l'embedding
      const textForEmbedding = [updated!.content, updated!.tags].filter(Boolean).join(" ");
      await indexEntity(sqlite, "note", id, textForEmbedding);

      console.error(`[notes] Note mise à jour : ${id}`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(updated, null, 2) }],
      };
    },
  );

  // ── delete_note ─────────────────────────────────────────────────
  server.tool(
    "delete_note",
    "Supprime une note et son embedding associé.",
    {
      id: z.string().describe("Identifiant UUID de la note à supprimer"),
    },
    async ({ id }) => {
      const existing = db.select().from(notes).where(eq(notes.id, id)).get();

      if (!existing) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Note non trouvée (id: ${id}).` }],
        };
      }

      // Supprimer l'embedding associé
      removeEntityEmbedding(sqlite, "note", id);

      // Supprimer la note
      db.delete(notes).where(eq(notes.id, id)).run();

      console.error(`[notes] Note supprimée : ${id}`);

      return {
        content: [{ type: "text" as const, text: `Note "${id}" supprimée.` }],
      };
    },
  );

  // ── list_notes ──────────────────────────────────────────────────
  server.tool(
    "list_notes",
    "Liste toutes les notes de la bible avec pagination et filtrage optionnel par tag.",
    {
      limit: z.number().optional().default(50).describe("Nombre maximum de résultats (défaut : 50)"),
      offset: z.number().optional().default(0).describe("Décalage pour la pagination (défaut : 0)"),
      tag: z.string().optional().describe("Filtrer par tag (recherche dans le JSON tags)"),
    },
    async ({ limit, offset, tag }) => {
      let query = db.select().from(notes).$dynamic();

      if (tag) {
        query = query.where(like(notes.tags, `%"${tag}"%`));
      }

      const results = query.limit(limit).offset(offset).all();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total: results.length, notes: results }, null, 2),
          },
        ],
      };
    },
  );

  console.error("[tools] Notes tools enregistrés");
}
