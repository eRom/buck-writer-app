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

describe("Research CRUD", () => {
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
    const createRes = await callTool("create_research", {
      topic: "Armes médiévales",
      content: "Les épées longues étaient utilisées au XIVe siècle",
    });
    expect(createRes.isError).toBeFalsy();
    const created = parseResult(createRes) as Record<string, unknown>;
    expect(created.topic).toBe("Armes médiévales");
    expect(created.id).toBeDefined();
    const resId = created.id as string;

    // Get
    const getRes = await callTool("get_research", { id: resId });
    expect(getRes.isError).toBeFalsy();
    const fetched = parseResult(getRes) as Record<string, unknown>;
    expect(fetched.topic).toBe("Armes médiévales");
    expect(fetched.content).toBe("Les épées longues étaient utilisées au XIVe siècle");

    // Update
    const updateRes = await callTool("update_research", {
      id: resId,
      content: "Les épées longues du XIVe siècle et les haches de guerre",
    });
    expect(updateRes.isError).toBeFalsy();
    const updated = parseResult(updateRes) as Record<string, unknown>;
    expect(updated.content).toBe("Les épées longues du XIVe siècle et les haches de guerre");
    expect(updated.topic).toBe("Armes médiévales");

    // Delete
    const deleteRes = await callTool("delete_research", { id: resId });
    expect(deleteRes.isError).toBeFalsy();

    // Get → erreur
    const getDeleted = await callTool("get_research", { id: resId });
    expect(getDeleted.isError).toBe(true);
  });

  it("list : créer 2 fiches → count = 2", async () => {
    await callTool("create_research", { topic: "Sujet A", content: "Contenu A" });
    await callTool("create_research", { topic: "Sujet B", content: "Contenu B" });

    const listRes = await callTool("list_research", { limit: 50, offset: 0 });
    expect(listRes.isError).toBeFalsy();
    const data = parseResult(listRes) as Record<string, unknown>;
    expect(data.total).toBe(2);
    expect((data.research as unknown[]).length).toBe(2);
  });

  it("erreurs : get/update/delete sur ID inexistant → isError true", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";

    expect((await callTool("get_research", { id: fakeId })).isError).toBe(true);
    expect((await callTool("update_research", { id: fakeId, topic: "X" })).isError).toBe(true);
    expect((await callTool("delete_research", { id: fakeId })).isError).toBe(true);
  });
});
