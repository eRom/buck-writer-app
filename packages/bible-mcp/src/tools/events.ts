import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DbInstance } from "../db/index.js";
import { events, characters, locations } from "../db/schema.js";
import { indexEntity, removeEntityEmbedding } from "../embeddings/index.js";

/** Enrichit un événement avec les noms des personnages et du lieu. */
function enrichEvent(
  db: DbInstance["db"],
  event: typeof events.$inferSelect,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...event };

  // Résoudre les noms des personnages
  if (event.characters) {
    const characterIds: string[] = JSON.parse(event.characters);
    const characterNames = characterIds.map((cid) => {
      const c = db.select().from(characters).where(eq(characters.id, cid)).get();
      return c ? { id: cid, name: c.name } : { id: cid, name: "(inconnu)" };
    });
    result.characterDetails = characterNames;
  }

  // Résoudre le nom du lieu
  if (event.locationId) {
    const loc = db.select().from(locations).where(eq(locations.id, event.locationId)).get();
    result.locationName = loc ? loc.name : "(inconnu)";
  }

  return result;
}

export function registerEventTools(server: McpServer, { db, sqlite }: DbInstance): void {
  // ── create_event ─────────────────────────────────────────────────
  server.tool(
    "create_event",
    "Crée un nouvel événement dans la timeline. Le sort_order est auto-incrémenté si non fourni.",
    {
      title: z.string().describe("Titre de l'événement"),
      description: z.string().optional().describe("Description de l'événement"),
      chapter: z.string().optional().describe("Chapitre ou section associé"),
      sort_order: z.number().optional().describe("Ordre dans la timeline (auto-incrémenté si omis)"),
      location_id: z.string().optional().describe("UUID du lieu où se déroule l'événement"),
      characters: z.array(z.string()).optional().describe("Liste d'UUIDs des personnages impliqués"),
      notes: z.string().optional().describe("Notes libres"),
    },
    async ({ title, description, chapter, sort_order, location_id, characters: charIds, notes }) => {
      // Valider le lieu si fourni
      if (location_id) {
        const loc = db.select().from(locations).where(eq(locations.id, location_id)).get();
        if (!loc) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: `Lieu non trouvé (id: ${location_id}).` }],
          };
        }
      }

      // Valider les personnages si fournis
      if (charIds && charIds.length > 0) {
        for (const cid of charIds) {
          const c = db.select().from(characters).where(eq(characters.id, cid)).get();
          if (!c) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: `Personnage non trouvé (id: ${cid}).` }],
            };
          }
        }
      }

      // Auto-incrémenter sort_order si non fourni
      let sortOrder = sort_order;
      if (sortOrder === undefined) {
        const maxRow = db
          .select({ maxOrder: sql<number>`COALESCE(MAX(${events.sortOrder}), 0)` })
          .from(events)
          .get();
        sortOrder = (maxRow?.maxOrder ?? 0) + 1;
      }

      const now = Date.now();
      const id = crypto.randomUUID();

      const event = {
        id,
        title,
        description: description ?? null,
        chapter: chapter ?? null,
        sortOrder,
        locationId: location_id ?? null,
        characters: charIds ? JSON.stringify(charIds) : null,
        notes: notes ?? null,
        createdAt: now,
        updatedAt: now,
      };

      db.insert(events).values(event).run();

      // Indexer l'embedding
      const textForEmbedding = [title, description, chapter, notes].filter(Boolean).join(" ");
      await indexEntity(sqlite, "event", id, textForEmbedding);

      console.error(`[events] Événement créé : ${title} (${id})`);

      // Retourner enrichi
      const created = db.select().from(events).where(eq(events.id, id)).get();
      const enriched = enrichEvent(db, created!);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(enriched, null, 2) }],
      };
    },
  );

  // ── get_event ────────────────────────────────────────────────────
  server.tool(
    "get_event",
    "Récupère un événement par son identifiant, enrichi avec les noms des personnages et du lieu.",
    {
      id: z.string().describe("Identifiant UUID de l'événement"),
    },
    async ({ id }) => {
      const event = db.select().from(events).where(eq(events.id, id)).get();

      if (!event) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Événement non trouvé (id: ${id}).` }],
        };
      }

      const enriched = enrichEvent(db, event);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(enriched, null, 2) }],
      };
    },
  );

  // ── update_event ─────────────────────────────────────────────────
  server.tool(
    "update_event",
    "Met à jour les champs d'un événement existant.",
    {
      id: z.string().describe("Identifiant UUID de l'événement à modifier"),
      title: z.string().optional().describe("Nouveau titre"),
      description: z.string().optional().describe("Nouvelle description"),
      chapter: z.string().optional().describe("Nouveau chapitre"),
      sort_order: z.number().optional().describe("Nouvel ordre dans la timeline"),
      location_id: z.string().optional().describe("Nouvel UUID du lieu"),
      characters: z.array(z.string()).optional().describe("Nouvelle liste d'UUIDs des personnages"),
      notes: z.string().optional().describe("Nouvelles notes"),
    },
    async ({ id, title, description, chapter, sort_order, location_id, characters: charIds, notes }) => {
      const existing = db.select().from(events).where(eq(events.id, id)).get();

      if (!existing) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Événement non trouvé (id: ${id}).` }],
        };
      }

      // Valider le lieu si changé
      if (location_id !== undefined) {
        const loc = db.select().from(locations).where(eq(locations.id, location_id)).get();
        if (!loc) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: `Lieu non trouvé (id: ${location_id}).` }],
          };
        }
      }

      // Valider les personnages si changés
      if (charIds !== undefined && charIds.length > 0) {
        for (const cid of charIds) {
          const c = db.select().from(characters).where(eq(characters.id, cid)).get();
          if (!c) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: `Personnage non trouvé (id: ${cid}).` }],
            };
          }
        }
      }

      const updates: Record<string, unknown> = { updatedAt: Date.now() };
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (chapter !== undefined) updates.chapter = chapter;
      if (sort_order !== undefined) updates.sortOrder = sort_order;
      if (location_id !== undefined) updates.locationId = location_id;
      if (charIds !== undefined) updates.characters = JSON.stringify(charIds);
      if (notes !== undefined) updates.notes = notes;

      db.update(events).set(updates).where(eq(events.id, id)).run();

      const updated = db.select().from(events).where(eq(events.id, id)).get();
      const enriched = enrichEvent(db, updated!);

      // Re-indexer l'embedding
      const textForEmbedding = [updated!.title, updated!.description, updated!.chapter, updated!.notes]
        .filter(Boolean)
        .join(" ");
      await indexEntity(sqlite, "event", id, textForEmbedding);

      console.error(`[events] Événement mis à jour : ${updated!.title} (${id})`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(enriched, null, 2) }],
      };
    },
  );

  // ── delete_event ─────────────────────────────────────────────────
  server.tool(
    "delete_event",
    "Supprime un événement et son embedding associé.",
    {
      id: z.string().describe("Identifiant UUID de l'événement à supprimer"),
    },
    async ({ id }) => {
      const existing = db.select().from(events).where(eq(events.id, id)).get();

      if (!existing) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Événement non trouvé (id: ${id}).` }],
        };
      }

      // Supprimer l'embedding associé
      removeEntityEmbedding(sqlite, "event", id);

      // Supprimer l'événement
      db.delete(events).where(eq(events.id, id)).run();

      console.error(`[events] Événement supprimé : ${existing.title} (${id})`);

      return {
        content: [{ type: "text" as const, text: `Événement "${existing.title}" supprimé.` }],
      };
    },
  );

  // ── list_events ──────────────────────────────────────────────────
  server.tool(
    "list_events",
    "Liste tous les événements de la bible avec pagination.",
    {
      limit: z.number().optional().default(50).describe("Nombre maximum de résultats (défaut : 50)"),
      offset: z.number().optional().default(0).describe("Décalage pour la pagination (défaut : 0)"),
    },
    async ({ limit, offset }) => {
      const results = db
        .select()
        .from(events)
        .limit(limit)
        .offset(offset)
        .all();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total: results.length, events: results }, null, 2),
          },
        ],
      };
    },
  );

  // ── get_timeline ─────────────────────────────────────────────────
  server.tool(
    "get_timeline",
    "Retourne tous les événements triés par ordre chronologique (sort_order), enrichis avec les noms des personnages et du lieu.",
    {},
    async () => {
      const allEvents = db
        .select()
        .from(events)
        .orderBy(events.sortOrder)
        .all();

      const enriched = allEvents.map((e) => enrichEvent(db, e));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total: enriched.length, timeline: enriched }, null, 2),
          },
        ],
      };
    },
  );

  // ── get_timeline_filtered ──────────────────────────────────────
  server.tool(
    "get_timeline_filtered",
    "Retourne la timeline filtrée par personnage, lieu et/ou plage de chapitres. Les filtres se combinent en AND. Résultats enrichis avec noms des personnages et du lieu.",
    {
      character_id: z.string().optional().describe("UUID d'un personnage — ne retourne que les événements où il apparaît"),
      location_id: z.string().optional().describe("UUID d'un lieu — ne retourne que les événements s'y déroulant"),
      chapter_from: z.string().optional().describe("Chapitre de début (inclusif) pour filtrer la plage"),
      chapter_to: z.string().optional().describe("Chapitre de fin (inclusif) pour filtrer la plage"),
    },
    async ({ character_id, location_id, chapter_from, chapter_to }) => {
      // Construire les conditions dynamiquement
      const conditions: ReturnType<typeof sql>[] = [];

      if (character_id) {
        // Le champ characters est un JSON array de UUIDs — on cherche la présence de l'UUID
        conditions.push(sql`${events.characters} LIKE ${"%" + character_id + "%"}`);
      }

      if (location_id) {
        conditions.push(sql`${events.locationId} = ${location_id}`);
      }

      if (chapter_from && chapter_to) {
        // Filtrer par plage de sort_order des chapitres de référence
        // D'abord chercher les sort_order min/max pour ces chapitres
        const fromEvent = db
          .select({ sortOrder: events.sortOrder })
          .from(events)
          .where(eq(events.chapter, chapter_from))
          .orderBy(events.sortOrder)
          .limit(1)
          .get();

        const toEvent = db
          .select({ sortOrder: events.sortOrder })
          .from(events)
          .where(eq(events.chapter, chapter_to))
          .orderBy(sql`${events.sortOrder} DESC`)
          .limit(1)
          .get();

        if (fromEvent && toEvent) {
          conditions.push(sql`${events.sortOrder} >= ${fromEvent.sortOrder}`);
          conditions.push(sql`${events.sortOrder} <= ${toEvent.sortOrder}`);
        } else {
          // Fallback : filtrer directement sur le champ chapter texte
          conditions.push(sql`${events.chapter} >= ${chapter_from}`);
          conditions.push(sql`${events.chapter} <= ${chapter_to}`);
        }
      } else if (chapter_from) {
        const fromEvent = db
          .select({ sortOrder: events.sortOrder })
          .from(events)
          .where(eq(events.chapter, chapter_from))
          .orderBy(events.sortOrder)
          .limit(1)
          .get();

        if (fromEvent) {
          conditions.push(sql`${events.sortOrder} >= ${fromEvent.sortOrder}`);
        } else {
          conditions.push(sql`${events.chapter} >= ${chapter_from}`);
        }
      } else if (chapter_to) {
        const toEvent = db
          .select({ sortOrder: events.sortOrder })
          .from(events)
          .where(eq(events.chapter, chapter_to))
          .orderBy(sql`${events.sortOrder} DESC`)
          .limit(1)
          .get();

        if (toEvent) {
          conditions.push(sql`${events.sortOrder} <= ${toEvent.sortOrder}`);
        } else {
          conditions.push(sql`${events.chapter} <= ${chapter_to}`);
        }
      }

      // Construire la requête
      let query = db.select().from(events).$dynamic();

      if (conditions.length > 0) {
        const combined = sql.join(conditions, sql` AND `);
        query = query.where(combined);
      }

      const results = query.orderBy(events.sortOrder).all();
      const enriched = results.map((e) => enrichEvent(db, e));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total: enriched.length,
                filters: {
                  ...(character_id && { character_id }),
                  ...(location_id && { location_id }),
                  ...(chapter_from && { chapter_from }),
                  ...(chapter_to && { chapter_to }),
                },
                timeline: enriched,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  console.error("[tools] Events tools enregistrés");
}
