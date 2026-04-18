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

describe("Notes CRUD", () => {
  let dbInstance: DbInstance;
  let callTool: ToolRunner;

  beforeEach(async () => {
    dbInstance = createTestDb();
    callTool = await createToolRunner(dbInstance);
  });

  afterEach(() => {
    dbInstance.sqlite.close();
  });

  it("CRUD complet : create → get → update → delete → get (erreur)", async () => {
    // Create
    const createRes = await callTool("create_note", {
      content: "Penser à développer la relation entre A et B",
      tags: '["personnages", "relation"]',
    });
    expect(createRes.isError).toBeFalsy();
    const created = parseResult(createRes) as Record<string, unknown>;
    expect(created.content).toBe("Penser à développer la relation entre A et B");
    expect(created.id).toBeDefined();
    const noteId = created.id as string;

    // Get
    const getRes = await callTool("get_note", { id: noteId });
    expect(getRes.isError).toBeFalsy();
    const fetched = parseResult(getRes) as Record<string, unknown>;
    expect(fetched.content).toBe("Penser à développer la relation entre A et B");

    // Update
    const updateRes = await callTool("update_note", {
      id: noteId,
      content: "Relation entre A et B — chapitre 5",
    });
    expect(updateRes.isError).toBeFalsy();
    const updated = parseResult(updateRes) as Record<string, unknown>;
    expect(updated.content).toBe("Relation entre A et B — chapitre 5");

    // Delete
    const deleteRes = await callTool("delete_note", { id: noteId });
    expect(deleteRes.isError).toBeFalsy();

    // Get → erreur
    const getDeleted = await callTool("get_note", { id: noteId });
    expect(getDeleted.isError).toBe(true);
  });

  it("list avec filtrage par tag", async () => {
    await callTool("create_note", {
      content: "Note sur la magie",
      tags: '["magie", "worldbuilding"]',
    });
    await callTool("create_note", {
      content: "Note sur un personnage",
      tags: '["personnage"]',
    });
    await callTool("create_note", {
      content: "Note sur la magie noire",
      tags: '["magie", "sombre"]',
    });

    // Filtre par "magie" → 2
    const magieRes = await callTool("list_notes", { limit: 50, offset: 0, tag: "magie" });
    expect(magieRes.isError).toBeFalsy();
    const magieData = parseResult(magieRes) as Record<string, unknown>;
    expect(magieData.total).toBe(2);

    // Filtre par "personnage" → 1
    const persoRes = await callTool("list_notes", { limit: 50, offset: 0, tag: "personnage" });
    expect(persoRes.isError).toBeFalsy();
    const persoData = parseResult(persoRes) as Record<string, unknown>;
    expect(persoData.total).toBe(1);

    // Sans filtre → 3
    const allRes = await callTool("list_notes", { limit: 50, offset: 0 });
    expect(allRes.isError).toBeFalsy();
    const allData = parseResult(allRes) as Record<string, unknown>;
    expect(allData.total).toBe(3);
  });

  it("erreurs : get/update/delete sur ID inexistant → isError true", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";

    expect((await callTool("get_note", { id: fakeId })).isError).toBe(true);
    expect((await callTool("update_note", { id: fakeId, content: "X" })).isError).toBe(true);
    expect((await callTool("delete_note", { id: fakeId })).isError).toBe(true);
  });
});
