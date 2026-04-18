import { describe, it, expect } from "vitest";
import { cosineSimilarity, topK } from "../../src/embeddings/similarity.js";

describe("cosineSimilarity", () => {
  it("vecteurs identiques → 1.0", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  it("vecteurs orthogonaux → 0.0", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it("vecteurs opposés → -1.0", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([-1, -2, -3]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it("vecteurs de dimension différente → erreur", () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([1, 2, 3]);
    expect(() => cosineSimilarity(a, b)).toThrow("Dimension mismatch");
  });
});

describe("topK", () => {
  it("retourne les K plus proches dans l'ordre décroissant de score", () => {
    const query = new Float32Array([1, 0, 0]);

    const records = [
      { entity_type: "character", entity_id: "ortho", embedding: new Float32Array([0, 0, 1]) },
      { entity_type: "character", entity_id: "proche", embedding: new Float32Array([0.9, 0.1, 0]) },
      { entity_type: "character", entity_id: "moyen", embedding: new Float32Array([0.5, 0.5, 0]) },
      { entity_type: "character", entity_id: "exact", embedding: new Float32Array([1, 0, 0]) },
      { entity_type: "character", entity_id: "oppose", embedding: new Float32Array([-1, 0, 0]) },
    ];

    const results = topK(query, records, 3);

    expect(results).toHaveLength(3);

    // 1er : identique (score = 1.0)
    expect(results[0].entity_id).toBe("exact");
    expect(results[0].score).toBeCloseTo(1.0, 3);

    // 2e : très proche
    expect(results[1].entity_id).toBe("proche");
    expect(results[1].score).toBeGreaterThan(0.9);

    // 3e : moyen
    expect(results[2].entity_id).toBe("moyen");
    expect(results[2].score).toBeGreaterThan(0.5);
  });

  it("filtre par entity_type si fourni", () => {
    const query = new Float32Array([1, 0, 0]);

    const records = [
      { entity_type: "character", entity_id: "c1", embedding: new Float32Array([1, 0, 0]) },
      { entity_type: "location", entity_id: "l1", embedding: new Float32Array([1, 0, 0]) },
      { entity_type: "character", entity_id: "c2", embedding: new Float32Array([0.9, 0.1, 0]) },
    ];

    const results = topK(query, records, 5, "character");

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.entity_type === "character")).toBe(true);
  });

  it("retourne au max K résultats même s'il y en a plus", () => {
    const query = new Float32Array([1, 0, 0]);

    const records = Array.from({ length: 10 }, (_, i) => ({
      entity_type: "character",
      entity_id: `c${i}`,
      embedding: new Float32Array([1, 0, 0]),
    }));

    const results = topK(query, records, 3);
    expect(results).toHaveLength(3);
  });
});
