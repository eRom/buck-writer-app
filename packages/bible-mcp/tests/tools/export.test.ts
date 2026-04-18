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

describe("Export Bible", () => {
  let dbInstance: DbInstance;
  let callTool: ToolRunner;

  beforeEach(async () => {
    dbInstance = createTestDb();
    callTool = await createToolRunner(dbInstance);

    // Créer quelques entités de types différents
    await callTool("create_character", { name: "Aria", description: "Guerrière elfique" });
    await callTool("create_character", { name: "Boris", description: "Mage sombre" });
    await callTool("create_location", { name: "Château Noir", description: "Forteresse sombre" });
    await callTool("create_world_rule", {
      category: "Magie",
      title: "Loi de conservation",
      description: "Toute magie a un coût",
    });
  });

  afterEach(() => {
    dbInstance.sqlite.close();
  });

  it("export complet → contient les noms/titres de chaque entité", async () => {
    const res = await callTool("export_bible", {});
    expect(res.isError).toBeFalsy();
    const markdown = res.content[0].text;
    expect(markdown).toContain("# Bible d'Ecrivain");
    expect(markdown).toContain("Aria");
    expect(markdown).toContain("Boris");
    expect(markdown).toContain("Château Noir");
    expect(markdown).toContain("Loi de conservation");
  });

  it("export filtré entity_type=characters → seuls les personnages", async () => {
    const res = await callTool("export_bible", { entity_type: "characters" });
    expect(res.isError).toBeFalsy();
    const markdown = res.content[0].text;
    expect(markdown).toContain("Aria");
    expect(markdown).toContain("Boris");
    expect(markdown).toContain("## Personnages");
    expect(markdown).not.toContain("Château Noir");
    expect(markdown).not.toContain("Loi de conservation");
  });

  it("export filtré entity_type=locations → seuls les lieux", async () => {
    const res = await callTool("export_bible", { entity_type: "locations" });
    expect(res.isError).toBeFalsy();
    const markdown = res.content[0].text;
    expect(markdown).toContain("Château Noir");
    expect(markdown).toContain("## Lieux");
    expect(markdown).not.toContain("Aria");
  });
});
