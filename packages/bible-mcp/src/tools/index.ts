import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DbInstance } from "../db/index.js";
import { registerCharacterTools } from "./characters.js";
import { registerLocationTools } from "./locations.js";
import { registerEventTools } from "./events.js";
import { registerInteractionTools } from "./interactions.js";
import { registerWorldRuleTools } from "./world-rules.js";
import { registerResearchTools } from "./research.js";
import { registerNoteTools } from "./notes.js";
import { registerBackupTools } from "./backup.js";
import { registerStatsTools } from "./stats.js";
import { registerSearchTools } from "./search.js";
import { registerExportTools } from "./export.js";
import { registerImportTools } from "./import.js";
import { registerDuplicateTools } from "./duplicates.js";
import { registerTemplateTools } from "./templates.js";
import { registerReindexTools } from "./reindex.js";

export function registerAllTools(server: McpServer, db: DbInstance, dbPath: string): void {
  // Ping tool pour vérifier que le serveur fonctionne
  server.tool("ping", "Vérifie que le serveur bible-ecrivain est opérationnel", {}, async () => {
    return { content: [{ type: "text", text: "pong — bible-ecrivain MCP opérationnel" }] };
  });

  // CRUD tools
  registerCharacterTools(server, db);
  registerLocationTools(server, db);
  registerEventTools(server, db);
  registerInteractionTools(server, db);
  registerWorldRuleTools(server, db);
  registerResearchTools(server, db);
  registerNoteTools(server, db);

  // Search tools
  registerSearchTools(server, db);

  // Export / Import tools
  registerExportTools(server, db);
  registerImportTools(server, db);

  // Duplicates detection
  registerDuplicateTools(server, db);

  // Templates
  registerTemplateTools(server);

  // Reindex embeddings
  registerReindexTools(server, db);

  // Utility tools
  registerBackupTools(server, db, dbPath);
  registerStatsTools(server, db, dbPath);

  console.error("[tools] Tools enregistrés");
}
