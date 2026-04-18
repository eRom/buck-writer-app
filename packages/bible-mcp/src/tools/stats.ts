import fs from "node:fs";
import { sql } from "drizzle-orm";
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
  embeddings,
} from "../db/schema.js";

export function registerStatsTools(server: McpServer, { sqlite }: DbInstance, dbPath: string): void {
  server.tool(
    "get_bible_stats",
    "Retourne les statistiques complètes de la bible : nombre d'entités par type, embeddings, taille et date de modification.",
    {},
    async () => {
      const countTable = (tableName: string): number => {
        const row = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get() as { count: number } | undefined;
        return row?.count ?? 0;
      };

      const stats = {
        characters: countTable("characters"),
        locations: countTable("locations"),
        events: countTable("events"),
        interactions: countTable("interactions"),
        worldRules: countTable("world_rules"),
        research: countTable("research"),
        notes: countTable("notes"),
        embeddings: countTable("embeddings"),
      };

      // Taille et date de modification du fichier .db
      let fileSize = 0;
      let lastModified: string | null = null;

      try {
        const fileStat = fs.statSync(dbPath);
        fileSize = fileStat.size;
        lastModified = fileStat.mtime.toISOString();
      } catch {
        // DB en mémoire ou fichier inaccessible
      }

      const result = {
        entities: stats,
        totalEntities:
          stats.characters +
          stats.locations +
          stats.events +
          stats.interactions +
          stats.worldRules +
          stats.research +
          stats.notes,
        totalEmbeddings: stats.embeddings,
        database: {
          path: dbPath,
          size: fileSize,
          lastModified,
        },
      };

      console.error(`[stats] Stats générées — ${result.totalEntities} entités, ${result.totalEmbeddings} embeddings`);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  console.error("[tools] Stats tools enregistrés");
}
