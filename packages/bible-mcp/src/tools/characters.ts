import { z } from "zod";
import { eq } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DbInstance } from "../db/index.js";
import { characters } from "../db/schema.js";
import { indexEntity, removeEntityEmbedding } from "../embeddings/index.js";

export function registerCharacterTools(server: McpServer, { db, sqlite }: DbInstance): void {
  // ── create_character ─────────────────────────────────────────────
  server.tool(
    "create_character",
    "Crée un nouveau personnage dans la bible. Le nom doit être unique.",
    {
      name: z.string().describe("Nom du personnage (unique)"),
      description: z.string().optional().describe("Description générale du personnage"),
      traits: z.string().optional().describe("Traits du personnage (JSON : { physical: [...], personality: [...] })"),
      background: z.string().optional().describe("Histoire / passé du personnage"),
      notes: z.string().optional().describe("Notes libres"),
    },
    async ({ name, description, traits, background, notes }) => {
      // Vérifier unicité du nom
      const existing = db
        .select()
        .from(characters)
        .where(eq(characters.name, name))
        .get();

      if (existing) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Un personnage nommé "${name}" existe déjà.` }],
        };
      }

      const now = Date.now();
      const id = crypto.randomUUID();

      const character = {
        id,
        name,
        description: description ?? null,
        traits: traits ?? null,
        background: background ?? null,
        notes: notes ?? null,
        createdAt: now,
        updatedAt: now,
      };

      db.insert(characters).values(character).run();

      // Indexer l'embedding
      const textForEmbedding = [name, description, traits, background, notes].filter(Boolean).join(" ");
      await indexEntity(sqlite, "character", id, textForEmbedding);

      console.error(`[characters] Personnage créé : ${name} (${id})`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(character, null, 2) }],
      };
    },
  );

  // ── get_character ────────────────────────────────────────────────
  server.tool(
    "get_character",
    "Récupère la fiche complète d'un personnage par son nom ou son identifiant.",
    {
      name: z.string().optional().describe("Nom du personnage"),
      id: z.string().optional().describe("Identifiant UUID du personnage"),
    },
    async ({ name, id }) => {
      if (!name && !id) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: "Il faut fournir au moins un nom ou un id." }],
        };
      }

      const character = id
        ? db.select().from(characters).where(eq(characters.id, id)).get()
        : db.select().from(characters).where(eq(characters.name, name!)).get();

      if (!character) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Personnage non trouvé.` }],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(character, null, 2) }],
      };
    },
  );

  // ── update_character ─────────────────────────────────────────────
  server.tool(
    "update_character",
    "Met à jour les champs d'un personnage existant.",
    {
      id: z.string().describe("Identifiant UUID du personnage à modifier"),
      name: z.string().optional().describe("Nouveau nom (doit rester unique)"),
      description: z.string().optional().describe("Nouvelle description"),
      traits: z.string().optional().describe("Nouveaux traits (JSON)"),
      background: z.string().optional().describe("Nouveau background"),
      notes: z.string().optional().describe("Nouvelles notes"),
    },
    async ({ id, name, description, traits, background, notes }) => {
      const existing = db.select().from(characters).where(eq(characters.id, id)).get();

      if (!existing) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Personnage non trouvé (id: ${id}).` }],
        };
      }

      // Vérifier unicité du nouveau nom si changé
      if (name && name !== existing.name) {
        const duplicate = db.select().from(characters).where(eq(characters.name, name)).get();
        if (duplicate) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: `Un personnage nommé "${name}" existe déjà.` }],
          };
        }
      }

      const updates: Record<string, unknown> = { updatedAt: Date.now() };
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (traits !== undefined) updates.traits = traits;
      if (background !== undefined) updates.background = background;
      if (notes !== undefined) updates.notes = notes;

      db.update(characters).set(updates).where(eq(characters.id, id)).run();

      const updated = db.select().from(characters).where(eq(characters.id, id)).get();

      // Re-indexer l'embedding
      const textForEmbedding = [updated!.name, updated!.description, updated!.traits, updated!.background, updated!.notes]
        .filter(Boolean)
        .join(" ");
      await indexEntity(sqlite, "character", id, textForEmbedding);

      console.error(`[characters] Personnage mis à jour : ${updated!.name} (${id})`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(updated, null, 2) }],
      };
    },
  );

  // ── delete_character ─────────────────────────────────────────────
  server.tool(
    "delete_character",
    "Supprime un personnage et son embedding associé.",
    {
      id: z.string().describe("Identifiant UUID du personnage à supprimer"),
    },
    async ({ id }) => {
      const existing = db.select().from(characters).where(eq(characters.id, id)).get();

      if (!existing) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Personnage non trouvé (id: ${id}).` }],
        };
      }

      // Supprimer l'embedding associé
      removeEntityEmbedding(sqlite, "character", id);

      // Supprimer le personnage
      db.delete(characters).where(eq(characters.id, id)).run();

      console.error(`[characters] Personnage supprimé : ${existing.name} (${id})`);

      return {
        content: [{ type: "text" as const, text: `Personnage "${existing.name}" supprimé.` }],
      };
    },
  );

  // ── list_characters ──────────────────────────────────────────────
  server.tool(
    "list_characters",
    "Liste tous les personnages de la bible avec pagination.",
    {
      limit: z.number().optional().default(50).describe("Nombre maximum de résultats (défaut : 50)"),
      offset: z.number().optional().default(0).describe("Décalage pour la pagination (défaut : 0)"),
    },
    async ({ limit, offset }) => {
      const results = db
        .select()
        .from(characters)
        .limit(limit)
        .offset(offset)
        .all();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total: results.length, characters: results }, null, 2),
          },
        ],
      };
    },
  );

  console.error("[tools] Characters tools enregistrés");
}
