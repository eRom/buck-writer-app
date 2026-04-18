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

describe("Locations CRUD", () => {
  let dbInstance: DbInstance;
  let callTool: ToolRunner;

  beforeEach(async () => {
    dbInstance = createTestDb();
    callTool = await createToolRunner(dbInstance);
  });

  afterEach(() => {
    dbInstance.sqlite.close();
  });

  it("CRUD complet : create → get (name) → get (id) → update → get → delete → get", async () => {
    // Create
    const createRes = await callTool("create_location", {
      name: "Forêt d'Eldamar",
      description: "Forêt ancestrale",
      atmosphere: "Mystérieuse et humide",
      geography: "Arbres géants, ruisseaux",
    });
    expect(createRes.isError).toBeFalsy();
    const created = parseResult(createRes) as Record<string, unknown>;
    expect(created.name).toBe("Forêt d'Eldamar");
    expect(created.id).toBeDefined();
    const locId = created.id as string;

    // Get by name
    const getNameRes = await callTool("get_location", { name: "Forêt d'Eldamar" });
    expect(getNameRes.isError).toBeFalsy();
    const byName = parseResult(getNameRes) as Record<string, unknown>;
    expect(byName.id).toBe(locId);

    // Get by id
    const getIdRes = await callTool("get_location", { id: locId });
    expect(getIdRes.isError).toBeFalsy();
    const byId = parseResult(getIdRes) as Record<string, unknown>;
    expect(byId.name).toBe("Forêt d'Eldamar");

    // Update
    const updateRes = await callTool("update_location", {
      id: locId,
      atmosphere: "Lugubre et froide",
    });
    expect(updateRes.isError).toBeFalsy();
    const updated = parseResult(updateRes) as Record<string, unknown>;
    expect(updated.atmosphere).toBe("Lugubre et froide");

    // Get — verify change
    const verifRes = await callTool("get_location", { id: locId });
    const verif = parseResult(verifRes) as Record<string, unknown>;
    expect(verif.atmosphere).toBe("Lugubre et froide");
    expect(verif.name).toBe("Forêt d'Eldamar");

    // Delete
    const deleteRes = await callTool("delete_location", { id: locId });
    expect(deleteRes.isError).toBeFalsy();

    // Get — verify error
    const getDeleted = await callTool("get_location", { id: locId });
    expect(getDeleted.isError).toBe(true);
  });

  it("list : créer 3 lieux → count = 3", async () => {
    await callTool("create_location", { name: "Village" });
    await callTool("create_location", { name: "Château" });
    await callTool("create_location", { name: "Donjon" });

    const listRes = await callTool("list_locations", { limit: 50, offset: 0 });
    expect(listRes.isError).toBeFalsy();
    const data = parseResult(listRes) as Record<string, unknown>;
    expect(data.total).toBe(3);
    expect(data.results).toHaveLength(3);
  });

  it("unicité : doublon name → isError true", async () => {
    await callTool("create_location", { name: "Village" });
    const dup = await callTool("create_location", { name: "Village" });
    expect(dup.isError).toBe(true);
  });

  it("erreurs : get/update/delete sur ID inexistant → isError true", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";

    const getRes = await callTool("get_location", { id: fakeId });
    expect(getRes.isError).toBe(true);

    const updateRes = await callTool("update_location", { id: fakeId, name: "X" });
    expect(updateRes.isError).toBe(true);

    const deleteRes = await callTool("delete_location", { id: fakeId });
    expect(deleteRes.isError).toBe(true);
  });
});
