import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import type BetterSqlite3 from "better-sqlite3";
import { embedBatch } from "./openai.js";
import type { EmbeddingRecord } from "./similarity.js";

export { embedBatch, getEmbeddingDim, EMBEDDING_DIM } from "./openai.js";

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY environment variable is not set");
  return key;
}

/**
 * Génère un embedding pour un passage de texte.
 */
export async function generateEmbedding(text: string): Promise<Float32Array> {
  const apiKey = getApiKey();
  const vectors = await embedBatch({ apiKey, texts: [text] });
  const vec = vectors[0] ?? [];
  return new Float32Array(vec);
}

/**
 * Génère un embedding pour une requête de recherche.
 * (OpenAI ne nécessite pas de préfixe différent — même API)
 */
export async function generateQueryEmbedding(text: string): Promise<Float32Array> {
  return generateEmbedding(text);
}

/**
 * Indexe une entité : génère l'embedding et le stocke en DB.
 * Utilise content_hash pour éviter la re-indexation si le contenu n'a pas changé.
 */
export async function indexEntity(
  sqlite: BetterSqlite3.Database,
  entityType: string,
  entityId: string,
  textContent: string,
): Promise<void> {
  const contentHash = crypto.createHash("sha256").update(textContent).digest("hex");

  const existing = sqlite
    .prepare("SELECT content_hash FROM embeddings WHERE entity_type = ? AND entity_id = ?")
    .get(entityType, entityId) as { content_hash: string } | undefined;

  if (existing && existing.content_hash === contentHash) {
    return;
  }

  const embedding = await generateEmbedding(textContent);
  const embeddingBuffer = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
  const now = Date.now();

  if (existing) {
    sqlite
      .prepare(
        "UPDATE embeddings SET embedding = ?, content_hash = ?, updated_at = ? WHERE entity_type = ? AND entity_id = ?",
      )
      .run(embeddingBuffer, contentHash, now, entityType, entityId);
  } else {
    const id = uuidv4();
    sqlite
      .prepare(
        "INSERT INTO embeddings (id, entity_type, entity_id, embedding, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, entityType, entityId, embeddingBuffer, contentHash, now, now);
  }

  console.error(`[embeddings] Entité indexée : ${entityType}/${entityId}`);
}

/**
 * Supprime l'embedding d'une entité.
 */
export function removeEntityEmbedding(
  sqlite: BetterSqlite3.Database,
  entityType: string,
  entityId: string,
): void {
  sqlite.prepare("DELETE FROM embeddings WHERE entity_type = ? AND entity_id = ?").run(entityType, entityId);
}

/**
 * Charge tous les embeddings de la DB, optionnellement filtrés par entity_type.
 * Désérialise les BLOBs en Float32Array.
 */
export function loadAllEmbeddings(
  sqlite: BetterSqlite3.Database,
  entityType?: string,
): EmbeddingRecord[] {
  let rows: Array<{ entity_type: string; entity_id: string; embedding: Buffer }>;

  if (entityType) {
    rows = sqlite
      .prepare("SELECT entity_type, entity_id, embedding FROM embeddings WHERE entity_type = ?")
      .all(entityType) as typeof rows;
  } else {
    rows = sqlite.prepare("SELECT entity_type, entity_id, embedding FROM embeddings").all() as typeof rows;
  }

  return rows.map((row) => ({
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    embedding: new Float32Array(new Uint8Array(row.embedding).buffer),
  }));
}
