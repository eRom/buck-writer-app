import { z } from "zod";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DbInstance } from "../db/index.js";
import { locations } from "../db/schema.js";
import { indexEntity, removeEntityEmbedding } from "../embeddings/index.js";

export function registerLocationTools(server: McpServer, { db, sqlite }: DbInstance): void {
  // ── create_location ────────────────────────────────────────────────
  server.tool(
    "create_location",
    "Crée un nouveau lieu dans la bible. Le nom doit être unique.",
    {
      name: z.string().describe("Nom du lieu (obligatoire, unique)"),
      description: z.string().optional().describe("Description générale du lieu"),
      atmosphere: z.string().optional().describe("Ambiance, sensations, couleurs dominantes"),
      geography: z.string().optional().describe("Géographie, topographie, climat"),
      notes: z.string().optional().describe("Notes libres"),
    },
    async ({ name, description, atmosphere, geography, notes }) => {
      // Vérifier unicité du nom
      const existing = db.select().from(locations).where(eq(locations.name, name)).get();
      if (existing) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Un lieu nommé "${name}" existe déjà (id: ${existing.id}).` }],
        };
      }

      const now = Math.floor(Date.now() / 1000);
      const location = {
        id: crypto.randomUUID(),
        name,
        description: description ?? null,
        atmosphere: atmosphere ?? null,
        geography: geography ?? null,
        notes: notes ?? null,
        createdAt: now,
        updatedAt: now,
      };

      db.insert(locations).values(location).run();

      // Indexer l'embedding
      const textForEmbedding = [name, description, atmosphere, geography, notes].filter(Boolean).join(" ");
      await indexEntity(sqlite, "location", location.id, textForEmbedding);

      console.error(`[locations] Lieu créé: ${name} (${location.id})`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(location, null, 2) }],
      };
    },
  );

  // ── get_location ───────────────────────────────────────────────────
  server.tool(
    "get_location",
    "Récupère un lieu par son nom ou son identifiant.",
    {
      name: z.string().optional().describe("Nom du lieu"),
      id: z.string().optional().describe("Identifiant UUID du lieu"),
    },
    async ({ name, id }) => {
      if (!name && !id) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: "Il faut fournir un 'name' ou un 'id'." }],
        };
      }

      const location = id
        ? db.select().from(locations).where(eq(locations.id, id)).get()
        : db.select().from(locations).where(eq(locations.name, name!)).get();

      if (!location) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Lieu non trouvé (${id ? `id: ${id}` : `name: ${name}`}).` }],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(location, null, 2) }],
      };
    },
  );

  // ── update_location ────────────────────────────────────────────────
  server.tool(
    "update_location",
    "Met à jour un lieu existant. Seuls les champs fournis sont modifiés.",
    {
      id: z.string().describe("Identifiant UUID du lieu à modifier"),
      name: z.string().optional().describe("Nouveau nom"),
      description: z.string().optional().describe("Nouvelle description"),
      atmosphere: z.string().optional().describe("Nouvelle ambiance"),
      geography: z.string().optional().describe("Nouvelle géographie"),
      notes: z.string().optional().describe("Nouvelles notes"),
    },
    async ({ id, name, description, atmosphere, geography, notes }) => {
      const existing = db.select().from(locations).where(eq(locations.id, id)).get();
      if (!existing) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Lieu non trouvé (id: ${id}).` }],
        };
      }

      // Vérifier unicité si le nom change
      if (name && name !== existing.name) {
        const nameConflict = db.select().from(locations).where(eq(locations.name, name)).get();
        if (nameConflict) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: `Un lieu nommé "${name}" existe déjà (id: ${nameConflict.id}).` }],
          };
        }
      }

      const updates: Record<string, unknown> = { updatedAt: Math.floor(Date.now() / 1000) };
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (atmosphere !== undefined) updates.atmosphere = atmosphere;
      if (geography !== undefined) updates.geography = geography;
      if (notes !== undefined) updates.notes = notes;

      db.update(locations).set(updates).where(eq(locations.id, id)).run();

      const updated = db.select().from(locations).where(eq(locations.id, id)).get();

      // Re-indexer l'embedding
      const textForEmbedding = [updated!.name, updated!.description, updated!.atmosphere, updated!.geography, updated!.notes]
        .filter(Boolean)
        .join(" ");
      await indexEntity(sqlite, "location", id, textForEmbedding);

      console.error(`[locations] Lieu mis à jour: ${updated!.name} (${id})`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(updated, null, 2) }],
      };
    },
  );

  // ── delete_location ────────────────────────────────────────────────
  server.tool(
    "delete_location",
    "Supprime un lieu de la bible ainsi que son embedding associé.",
    {
      id: z.string().describe("Identifiant UUID du lieu à supprimer"),
    },
    async ({ id }) => {
      const existing = db.select().from(locations).where(eq(locations.id, id)).get();
      if (!existing) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Lieu non trouvé (id: ${id}).` }],
        };
      }

      // Supprimer l'embedding associé
      removeEntityEmbedding(sqlite, "location", id);

      // Supprimer le lieu
      db.delete(locations).where(eq(locations.id, id)).run();
      console.error(`[locations] Lieu supprimé: ${existing.name} (${id})`);

      return {
        content: [{ type: "text" as const, text: `Lieu "${existing.name}" supprimé avec succès.` }],
      };
    },
  );

  // ── list_locations ─────────────────────────────────────────────────
  server.tool(
    "list_locations",
    "Liste tous les lieux de la bible avec pagination.",
    {
      limit: z.number().int().min(1).max(200).default(50).describe("Nombre max de résultats (défaut 50)"),
      offset: z.number().int().min(0).default(0).describe("Décalage pour la pagination (défaut 0)"),
    },
    async ({ limit, offset }) => {
      const results = db.select().from(locations).limit(limit).offset(offset).all();
      const total = db.select().from(locations).all().length;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total, limit, offset, results }, null, 2),
          },
        ],
      };
    },
  );

  console.error("[tools] Locations tools enregistrés");
}
