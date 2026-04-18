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

describe("World Rules CRUD", () => {
  let dbInstance: DbInstance;
  let callTool: ToolRunner;

  beforeEach(async () => {
    dbInstance = createTestDb();
    callTool = await createToolRunner(dbInstance);
  });

  afterEach(() => {
    dbInstance.sqlite.close();
  });

  it("CRUD complet", async () => {
    // Create
    const createRes = await callTool("create_world_rule", {
      category: "magie",
      title: "Loi de conservation magique",
      description: "Toute magie consomme de l'énergie vitale du lanceur.",
    });
    expect(createRes.isError).toBeFalsy();
    const created = parseResult(createRes) as Record<string, unknown>;
    expect(created.title).toBe("Loi de conservation magique");
    expect(created.category).toBe("magie");
    const ruleId = created.id as string;

    // Get
    const getRes = await callTool("get_world_rule", { id: ruleId });
    expect(getRes.isError).toBeFalsy();
    const rule = parseResult(getRes) as Record<string, unknown>;
    expect(rule.title).toBe("Loi de conservation magique");

    // Update
    const updateRes = await callTool("update_world_rule", {
      id: ruleId,
      description: "Toute magie puise dans l'éther ambiant.",
    });
    expect(updateRes.isError).toBeFalsy();
    const updated = parseResult(updateRes) as Record<string, unknown>;
    expect(updated.description).toBe("Toute magie puise dans l'éther ambiant.");

    // Get — verify change
    const verifRes = await callTool("get_world_rule", { id: ruleId });
    const verif = parseResult(verifRes) as Record<string, unknown>;
    expect(verif.description).toBe("Toute magie puise dans l'éther ambiant.");

    // Delete
    const deleteRes = await callTool("delete_world_rule", { id: ruleId });
    expect(deleteRes.isError).toBeFalsy();

    // Get — verify error
    const getDeleted = await callTool("get_world_rule", { id: ruleId });
    expect(getDeleted.isError).toBe(true);
  });

  it("filtrage par category sur list_world_rules", async () => {
    await callTool("create_world_rule", {
      category: "magie",
      title: "Sorts élémentaires",
      description: "Quatre éléments de base.",
    });
    await callTool("create_world_rule", {
      category: "magie",
      title: "Invocations",
      description: "Appel d'esprits.",
    });
    await callTool("create_world_rule", {
      category: "technologie",
      title: "Automates",
      description: "Machines animées par la vapeur.",
    });

    // List sans filtre → 3
    const allRes = await callTool("list_world_rules", { limit: 50, offset: 0 });
    const allData = parseResult(allRes) as Record<string, unknown>;
    expect(allData.total).toBe(3);

    // List filtrée par "magie" → 2
    const magieRes = await callTool("list_world_rules", { category: "magie", limit: 50, offset: 0 });
    const magieData = parseResult(magieRes) as Record<string, unknown>;
    expect(magieData.total).toBe(2);

    // List filtrée par "technologie" → 1
    const techRes = await callTool("list_world_rules", { category: "technologie", limit: 50, offset: 0 });
    const techData = parseResult(techRes) as Record<string, unknown>;
    expect(techData.total).toBe(1);
  });

  it("erreurs : get/update/delete sur ID inexistant → isError true", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";

    expect((await callTool("get_world_rule", { id: fakeId })).isError).toBe(true);
    expect((await callTool("update_world_rule", { id: fakeId, title: "X" })).isError).toBe(true);
    expect((await callTool("delete_world_rule", { id: fakeId })).isError).toBe(true);
  });
});
