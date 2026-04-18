import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import type BetterSqlite3 from "better-sqlite3";
import { getEmbeddingPipeline } from "./model.js";
import type { EmbeddingRecord } from "./similarity.js";

/**
 * Genere un embedding pour un passage de texte (document).
 * Prefixe "passage: " conformement au modele E5.
 */
export async function generateEmbedding(text: string): Promise<Float32Array> {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe("passage: " + text, { pooling: "mean", normalize: true });
  return new Float32Array(output.data as Float32Array);
}

/**
 * Genere un embedding pour une requete de recherche.
 * Prefixe "query: " conformement au modele E5.
 */
export async function generateQueryEmbedding(text: string): Promise<Float32Array> {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe("query: " + text, { pooling: "mean", normalize: true });
  return new Float32Array(output.data as Float32Array);
}

/**
 * Indexe une entite : genere l'embedding et le stocke en DB.
 * Utilise content_hash pour eviter la re-indexation si le contenu n'a pas change.
 */
export async function indexEntity(
  sqlite: BetterSqlite3.Database,
  entityType: string,
  entityId: string,
  textContent: string,
): Promise<void> {
  const contentHash = crypto.createHash("sha256").update(textContent).digest("hex");

  // Verifier si l'embedding existe deja avec le meme hash
  const existing = sqlite
    .prepare("SELECT content_hash FROM embeddings WHERE entity_type = ? AND entity_id = ?")
    .get(entityType, entityId) as { content_hash: string } | undefined;

  if (existing && existing.content_hash === contentHash) {
    return; // Contenu inchange, pas besoin de re-indexer
  }

  const embedding = await generateEmbedding(textContent);
  const embeddingBuffer = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
  const now = Date.now();

  if (existing) {
    // Update
    sqlite
      .prepare(
        "UPDATE embeddings SET embedding = ?, content_hash = ?, updated_at = ? WHERE entity_type = ? AND entity_id = ?",
      )
      .run(embeddingBuffer, contentHash, now, entityType, entityId);
  } else {
    // Insert
    const id = uuidv4();
    sqlite
      .prepare(
        "INSERT INTO embeddings (id, entity_type, entity_id, embedding, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, entityType, entityId, embeddingBuffer, contentHash, now, now);
  }

  console.error(`[embeddings] Entite indexee : ${entityType}/${entityId}`);
}

/**
 * Supprime l'embedding d'une entite.
 */
export function removeEntityEmbedding(
  sqlite: BetterSqlite3.Database,
  entityType: string,
  entityId: string,
): void {
  sqlite.prepare("DELETE FROM embeddings WHERE entity_type = ? AND entity_id = ?").run(entityType, entityId);
}

/**
 * Charge tous les embeddings de la DB, optionnellement filtres par entity_type.
 * Deserialise les BLOBs en Float32Array.
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
