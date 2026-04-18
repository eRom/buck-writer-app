// Entry point HTTP — lance le serveur bible-mcp sur BIBLE_HTTP_PORT
import { createHttpApp } from "./http.js";
import { createServer } from "./mcp-server.js";
import { getDb } from "./db/index.js";

const port = Number(process.env.BIBLE_HTTP_PORT ?? 7801);
const dbPath = process.env.BIBLE_DB_PATH ?? "./data/bible.db";

if (!process.env.OPENAI_API_KEY) {
  console.error("[bible-mcp] OPENAI_API_KEY is required for embeddings");
  process.exit(1);
}

const dbInstance = getDb(dbPath);
const mcpServer = createServer(dbInstance, dbPath);
const app = createHttpApp(mcpServer);

app.listen(port, "0.0.0.0", () => {
  console.warn(`[bible-mcp] listening on http://0.0.0.0:${port}`);
});
