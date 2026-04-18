import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, createToolRunner, parseResult } from "../setup.js";
import type { DbInstance } from "../../src/db/index.js";
import type { ToolRunner } from "../setup.js";

vi.mock("@huggingface/transformers", () => ({
  pipeline: vi.fn(),
}));

vi.mock("../../src/embeddings/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/embeddings/index.js")>();
  return {
    ...original,
    indexEntity: vi.fn().mockResolvedValue(undefined),
    removeEntityEmbedding: vi.fn(),
    generateEmbedding: vi.fn(),
    generateQueryEmbedding: vi.fn(),
  };
});

/** Insère un embedding déterministe en DB. */
function insertEmbedding(
  sqlite: DbInstance["sqlite"],
  entityType: string,
  entityId: string,
  vector: Float32Array,
): void {
  const buf = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
  sqlite
    .prepare(
      "INSERT INTO embeddings (id, entity_type, entity_id, embedding, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(crypto.randomUUID(), entityType, entityId, buf, `hash-${entityId}`, Date.now(), Date.now());
}

describe("Detect Duplicates", () => {
  let dbInstance: DbInstance;
  let callTool: ToolRunner;

  beforeEach(async () => {
    dbInstance = createTestDb();
    callTool = await createToolRunner(dbInstance);
  });

  afterEach(() => {
    dbInstance.sqlite.close();
  });

  it("détecte une paire de doublons au-dessus du seuil", async () => {
    // Créer 3 personnages
    const c1 = parseResult(await callTool("create_character", { name: "Aria" })) as Record<string, unknown>;
    const c2 = parseResult(await callTool("create_character", { name: "Arya" })) as Record<string, unknown>;
    const c3 = parseResult(await callTool("create_character", { name: "Zork" })) as Record<string, unknown>;

    // Embeddings déterministes :
    // c1 et c2 très proches (cosine ~ 0.995), c3 orthogonal
    insertEmbedding(dbInstance.sqlite, "character", c1.id as string, new Float32Array([1, 0, 0, 0]));
    insertEmbedding(dbInstance.sqlite, "character", c2.id as string, new Float32Array([0.99, 0.1, 0, 0]));
    insertEmbedding(dbInstance.sqlite, "character", c3.id as string, new Float32Array([0, 0, 0, 1]));

    const res = await callTool("detect_duplicates", { threshold: 0.85 });
    expect(res.isError).toBeFalsy();
    const data = parseResult(res) as Record<string, unknown>;
    const pairs = data.pairs as Array<Record<string, unknown>>;

    // Seule la paire (c1, c2) doit être détectée
    expect(pairs.length).toBe(1);
    expect((pairs[0].score as number)).toBeGreaterThan(0.85);
  });

  it("filtre par entity_type", async () => {
    // Créer un perso et un lieu
    const c = parseResult(await callTool("create_character", { name: "Aria" })) as Record<string, unknown>;
    const l = parseResult(await callTool("create_location", { name: "Château" })) as Record<string, unknown>;

    // Embeddings identiques mais types différents
    const vec = new Float32Array([1, 0, 0, 0]);
    insertEmbedding(dbInstance.sqlite, "character", c.id as string, vec);
    insertEmbedding(dbInstance.sqlite, "location", l.id as string, vec);

    // Filtre sur "character" → un seul embedding → pas de paire
    const resChar = await callTool("detect_duplicates", { entity_type: "character", threshold: 0.85 });
    expect(resChar.isError).toBeFalsy();
    const dataChar = parseResult(resChar) as Record<string, unknown>;
    expect((dataChar.pairs as unknown[]).length).toBe(0);

    // Sans filtre → la paire cross-type est détectée
    const resAll = await callTool("detect_duplicates", { threshold: 0.85 });
    expect(resAll.isError).toBeFalsy();
    const dataAll = parseResult(resAll) as Record<string, unknown>;
    expect((dataAll.pairs as unknown[]).length).toBe(1);
  });
});
