import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, createToolRunner, parseResult } from "../setup.js";
import type { DbInstance } from "../../src/db/index.js";
import type { ToolRunner } from "../setup.js";

vi.mock("@huggingface/transformers", () => ({
  pipeline: vi.fn(),
}));

vi.mock("../../src/embeddings/index.js", () => ({
  indexEntity: vi.fn().mockResolvedValue(undefined),
  removeEntityEmbedding: vi.fn(),
  loadAllEmbeddings: vi.fn().mockReturnValue([]),
  generateEmbedding: vi.fn(),
  generateQueryEmbedding: vi.fn(),
}));

describe("Interactions CRUD", () => {
  let dbInstance: DbInstance;
  let callTool: ToolRunner;
  let charIdA: string;
  let charIdB: string;
  let charIdC: string;

  beforeEach(async () => {
    dbInstance = createTestDb();
    callTool = await createToolRunner(dbInstance);

    // Créer 3 personnages
    const a = await callTool("create_character", { name: "Aria" });
    charIdA = (parseResult(a) as Record<string, unknown>).id as string;

    const b = await callTool("create_character", { name: "Kael" });
    charIdB = (parseResult(b) as Record<string, unknown>).id as string;

    const c = await callTool("create_character", { name: "Luna" });
    charIdC = (parseResult(c) as Record<string, unknown>).id as string;
  });

  afterEach(() => {
    dbInstance.sqlite.close();
  });

  it("CRUD complet", async () => {
    // Create
    const createRes = await callTool("create_interaction", {
      description: "Alliance secrète entre Aria et Kael",
      characters: [charIdA, charIdB],
      nature: "alliance",
    });
    expect(createRes.isError).toBeFalsy();
    const created = parseResult(createRes) as Record<string, unknown>;
    expect(created.description).toBe("Alliance secrète entre Aria et Kael");
    const intId = created.id as string;

    // Get
    const getRes = await callTool("get_interaction", { id: intId });
    expect(getRes.isError).toBeFalsy();
    const interaction = parseResult(getRes) as Record<string, unknown>;
    expect(interaction.description).toBe("Alliance secrète entre Aria et Kael");
    expect(interaction.characterDetails).toBeDefined();

    // Update
    const updateRes = await callTool("update_interaction", {
      id: intId,
      nature: "conflit",
    });
    expect(updateRes.isError).toBeFalsy();
    const updated = parseResult(updateRes) as Record<string, unknown>;
    expect(updated.nature).toBe("conflit");

    // Delete
    const deleteRes = await callTool("delete_interaction", { id: intId });
    expect(deleteRes.isError).toBeFalsy();

    // Get — verify error
    const getDeleted = await callTool("get_interaction", { id: intId });
    expect(getDeleted.isError).toBe(true);
  });

  it("validation : minimum 2 personnages", async () => {
    const res = await callTool("create_interaction", {
      description: "Monologue",
      characters: [charIdA],
    });
    expect(res.isError).toBe(true);
  });

  it("get_character_relations : 3 interactions dont 2 impliquent le même perso", async () => {
    // Interaction 1 : A + B
    await callTool("create_interaction", {
      description: "Alliance A-B",
      characters: [charIdA, charIdB],
      sort_order: 1,
    });

    // Interaction 2 : A + C
    await callTool("create_interaction", {
      description: "Conflit A-C",
      characters: [charIdA, charIdC],
      sort_order: 2,
    });

    // Interaction 3 : B + C (sans A)
    await callTool("create_interaction", {
      description: "Romance B-C",
      characters: [charIdB, charIdC],
      sort_order: 3,
    });

    // Récupérer les relations de A
    const relRes = await callTool("get_character_relations", { character_id: charIdA });
    expect(relRes.isError).toBeFalsy();
    const data = parseResult(relRes) as Record<string, unknown>;
    expect(data.total).toBe(2);

    const interactions = data.interactions as Array<Record<string, unknown>>;
    expect(interactions).toHaveLength(2);
    const descriptions = interactions.map((i) => i.description);
    expect(descriptions).toContain("Alliance A-B");
    expect(descriptions).toContain("Conflit A-C");
    expect(descriptions).not.toContain("Romance B-C");
  });

  it("erreurs : get/update/delete sur ID inexistant → isError true", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";

    expect((await callTool("get_interaction", { id: fakeId })).isError).toBe(true);
    expect((await callTool("update_interaction", { id: fakeId, description: "X" })).isError).toBe(true);
    expect((await callTool("delete_interaction", { id: fakeId })).isError).toBe(true);
  });
});
