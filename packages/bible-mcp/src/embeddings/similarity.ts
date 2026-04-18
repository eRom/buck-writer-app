/**
 * Calcule la similarite cosinus entre deux vecteurs Float32Array.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dot / denominator;
}

export interface EmbeddingRecord {
  entity_type: string;
  entity_id: string;
  embedding: Float32Array;
}

export interface SimilarityResult {
  entity_type: string;
  entity_id: string;
  score: number;
}

/**
 * Retourne les k entites les plus similaires a la requete,
 * triees par score decroissant.
 */
export function topK(
  queryEmbedding: Float32Array,
  allEmbeddings: EmbeddingRecord[],
  k: number,
  entityType?: string,
): SimilarityResult[] {
  let candidates = allEmbeddings;

  if (entityType) {
    candidates = candidates.filter((e) => e.entity_type === entityType);
  }

  const scored: SimilarityResult[] = candidates.map((record) => ({
    entity_type: record.entity_type,
    entity_id: record.entity_id,
    score: cosineSimilarity(queryEmbedding, record.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, k);
}
