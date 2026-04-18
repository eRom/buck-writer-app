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

describe("Characters CRUD", () => {
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
    const createRes = await callTool("create_character", {
      name: "Aria",
      description: "Guerrière elfique",
      background: "Née dans la forêt d'Eldamar",
    });
    expect(createRes.isError).toBeFalsy();
    const created = parseResult(createRes) as Record<string, unknown>;
    expect(created.name).toBe("Aria");
    expect(created.id).toBeDefined();
    const charId = created.id as string;

    // Get by name
    const getNameRes = await callTool("get_character", { name: "Aria" });
    expect(getNameRes.isError).toBeFalsy();
    const byName = parseResult(getNameRes) as Record<string, unknown>;
    expect(byName.id).toBe(charId);

    // Get by id
    const getIdRes = await callTool("get_character", { id: charId });
    expect(getIdRes.isError).toBeFalsy();
    const byId = parseResult(getIdRes) as Record<string, unknown>;
    expect(byId.name).toBe("Aria");

    // Update
    const updateRes = await callTool("update_character", {
      id: charId,
      description: "Mage elfique reconvertie",
    });
    expect(updateRes.isError).toBeFalsy();
    const updated = parseResult(updateRes) as Record<string, unknown>;
    expect(updated.description).toBe("Mage elfique reconvertie");

    // Get — verify change
    const verifRes = await callTool("get_character", { id: charId });
    const verif = parseResult(verifRes) as Record<string, unknown>;
    expect(verif.description).toBe("Mage elfique reconvertie");
    expect(verif.name).toBe("Aria");

    // Delete
    const deleteRes = await callTool("delete_character", { id: charId });
    expect(deleteRes.isError).toBeFalsy();

    // Get — verify error
    const getDeleted = await callTool("get_character", { id: charId });
    expect(getDeleted.isError).toBe(true);
  });

  it("list : créer 3 personnages → count = 3", async () => {
    await callTool("create_character", { name: "Alice" });
    await callTool("create_character", { name: "Bob" });
    await callTool("create_character", { name: "Charlie" });

    const listRes = await callTool("list_characters", { limit: 50, offset: 0 });
    expect(listRes.isError).toBeFalsy();
    const data = parseResult(listRes) as Record<string, unknown>;
    expect(data.total).toBe(3);
    expect(data.characters).toHaveLength(3);
  });

  it("unicité : doublon name → isError true", async () => {
    await callTool("create_character", { name: "Alice" });
    const dup = await callTool("create_character", { name: "Alice" });
    expect(dup.isError).toBe(true);
  });

  it("erreurs : get/update/delete sur ID inexistant → isError true", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";

    const getRes = await callTool("get_character", { id: fakeId });
    expect(getRes.isError).toBe(true);

    const updateRes = await callTool("update_character", { id: fakeId, name: "X" });
    expect(updateRes.isError).toBe(true);

    const deleteRes = await callTool("delete_character", { id: fakeId });
    expect(deleteRes.isError).toBe(true);
  });
});
