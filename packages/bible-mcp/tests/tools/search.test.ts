import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, createToolRunner, parseResult } from "../setup.js";
import type { DbInstance } from "../../src/db/index.js";
import type { ToolRunner } from "../setup.js";

vi.mock("@huggingface/transformers", () => ({
  pipeline: vi.fn(),
}));

// Mock du module embeddings pour la recherche sémantique
vi.mock("../../src/embeddings/index.js", () => ({
  generateQueryEmbedding: vi.fn(),
  loadAllEmbeddings: vi.fn(),
  generateEmbedding: vi.fn(),
  indexEntity: vi.fn(),
  removeEntityEmbedding: vi.fn(),
}));

describe("Recherche Fulltext", () => {
  let dbInstance: DbInstance;
  let callTool: ToolRunner;

  beforeEach(async () => {
    dbInstance = createTestDb();
    callTool = await createToolRunner(dbInstance);
  });

  afterEach(() => {
    dbInstance.sqlite.close();
  });

  it("recherche par nom de personnage → résultat trouvé", async () => {
    await callTool("create_character", {
      name: "Gandalf le Gris",
      description: "Un sorcier puissant et sage",
    });
    await callTool("create_location", {
      name: "Tour d'Orthanc",
      description: "Tour noire de Saroumane",
    });

    const searchRes = await callTool("search_fulltext", {
      query: "Gandalf",
      limit: 10,
    });
    expect(searchRes.isError).toBeFalsy();
    const data = parseResult(searchRes) as Record<string, unknown>;
    const results = data.results as Array<Record<string, unknown>>;
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.entity_type === "character")).toBe(true);
  });

  it("recherche sans résultat → tableau vide", async () => {
    await callTool("create_character", { name: "Alice" });

    const searchRes = await callTool("search_fulltext", {
      query: "MotInexistantXYZ789",
      limit: 10,
    });
    expect(searchRes.isError).toBeFalsy();
    const data = parseResult(searchRes) as Record<string, unknown>;
    const results = data.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(0);
  });

  it("filtrage par entity_type", async () => {
    await callTool("create_character", {
      name: "Elara",
      description: "Princesse du royaume",
    });
    await callTool("create_location", {
      name: "Royaume d'Elara",
      description: "Un vaste royaume",
    });

    // Recherche "Elara" filtrée sur character uniquement
    const searchRes = await callTool("search_fulltext", {
      query: "Elara",
      entity_type: "character",
      limit: 10,
    });
    expect(searchRes.isError).toBeFalsy();
    const data = parseResult(searchRes) as Record<string, unknown>;
    const results = data.results as Array<Record<string, unknown>>;
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => r.entity_type === "character")).toBe(true);
  });
});

describe("Recherche Sémantique (mock)", () => {
  let dbInstance: DbInstance;
  let callTool: ToolRunner;
  let charId1: string;
  let charId2: string;

  beforeEach(async () => {
    dbInstance = createTestDb();
    callTool = await createToolRunner(dbInstance);

    // Créer 2 personnages
    const c1 = await callTool("create_character", { name: "Guerrier" });
    charId1 = (parseResult(c1) as Record<string, unknown>).id as string;

    const c2 = await callTool("create_character", { name: "Paysan" });
    charId2 = (parseResult(c2) as Record<string, unknown>).id as string;
  });

  afterEach(() => {
    dbInstance.sqlite.close();
  });

  it("ranking : entité proche en premier", async () => {
    const { generateQueryEmbedding, loadAllEmbeddings } = await import(
      "../../src/embeddings/index.js"
    );

    // Vecteur requête : [1, 0, 0]
    (generateQueryEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Float32Array([1, 0, 0]),
    );

    // charId1 très proche du vecteur requête, charId2 orthogonal
    (loadAllEmbeddings as ReturnType<typeof vi.fn>).mockReturnValue([
      { entity_type: "character", entity_id: charId1, embedding: new Float32Array([0.95, 0.05, 0]) },
      { entity_type: "character", entity_id: charId2, embedding: new Float32Array([0, 0, 1]) },
    ]);

    const searchRes = await callTool("search_semantic", {
      query: "guerrier combat",
      limit: 10,
      threshold: 0.0,
    });

    expect(searchRes.isError).toBeFalsy();
    const data = parseResult(searchRes) as Record<string, unknown>;
    const results = data.results as Array<Record<string, unknown>>;

    expect(results.length).toBe(2);
    // Le premier résultat doit être charId1 (score plus élevé)
    expect(results[0].entity_id).toBe(charId1);
    expect(results[1].entity_id).toBe(charId2);
    expect((results[0].score as number) > (results[1].score as number)).toBe(true);
  });

  it("threshold : filtre les résultats sous le seuil", async () => {
    const { generateQueryEmbedding, loadAllEmbeddings } = await import(
      "../../src/embeddings/index.js"
    );

    // Vecteur requête
    (generateQueryEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Float32Array([1, 0, 0]),
    );

    // charId1 score ~0.99, charId2 score ~0.0
    (loadAllEmbeddings as ReturnType<typeof vi.fn>).mockReturnValue([
      { entity_type: "character", entity_id: charId1, embedding: new Float32Array([1, 0, 0]) },
      { entity_type: "character", entity_id: charId2, embedding: new Float32Array([0, 1, 0]) },
    ]);

    const searchRes = await callTool("search_semantic", {
      query: "guerrier",
      limit: 10,
      threshold: 0.5,
    });

    expect(searchRes.isError).toBeFalsy();
    const data = parseResult(searchRes) as Record<string, unknown>;
    const results = data.results as Array<Record<string, unknown>>;

    // Seul charId1 doit passer le seuil de 0.5
    expect(results).toHaveLength(1);
    expect(results[0].entity_id).toBe(charId1);
  });
});
