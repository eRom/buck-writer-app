import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { indexEntity } from "../src/embeddings/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATHS = [
  path.resolve(__dirname, "../../..", "data/bible/bible.db"),
  path.resolve(__dirname, "..", "data/bible.db"),
];

const ENTITY_CONFIGS = [
  { type: "character", table: "characters", textFields: ["name", "description", "traits", "background", "notes"] },
  { type: "location", table: "locations", textFields: ["name", "description", "atmosphere", "geography", "notes"] },
  { type: "event", table: "events", textFields: ["title", "description", "chapter", "notes"] },
  { type: "interaction", table: "interactions", textFields: ["description", "nature", "chapter", "notes"] },
  { type: "world_rule", table: "world_rules", textFields: ["category", "title", "description", "notes"] },
] as const;

async function reindexDb(dbPath: string) {
  console.log(`\n[reindex] → ${dbPath}`);
  const sqlite = new Database(dbPath);
  const total: Record<string, number> = {};

  for (const config of ENTITY_CONFIGS) {
    const rows = sqlite.prepare(`SELECT * FROM ${config.table}`).all() as Record<string, unknown>[];
    let count = 0;

    for (const row of rows) {
      const text = config.textFields
        .map((f) => row[f])
        .filter(Boolean)
        .join(" ");

      if (text.trim()) {
        await indexEntity(sqlite, config.type, row.id as string, text);
        count++;
      }
    }

    total[config.type] = count;
    console.log(`  ✓ ${config.type.padEnd(12)}: ${count}`);
  }

  sqlite.close();
}

for (const p of DB_PATHS) {
  await reindexDb(p);
}

console.log("\n[reindex] Done. Embeddings générés.");
