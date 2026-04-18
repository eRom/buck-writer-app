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

describe("Templates", () => {
  let dbInstance: DbInstance;
  let callTool: ToolRunner;

  beforeEach(async () => {
    dbInstance = createTestDb();
    callTool = await createToolRunner(dbInstance);
  });

  afterEach(() => {
    dbInstance.sqlite.close();
  });

  it("list_templates → 5 genres avec entity_types", async () => {
    const res = await callTool("list_templates", {});
    expect(res.isError).toBeFalsy();
    const data = parseResult(res) as Record<string, unknown>;
    const genres = data.genres as Array<Record<string, unknown>>;
    expect(genres).toHaveLength(5);
    const genreNames = genres.map((g) => g.genre);
    expect(genreNames).toContain("fantasy");
    expect(genreNames).toContain("polar");
    expect(genreNames).toContain("sf");
    expect(genreNames).toContain("historique");
    expect(genreNames).toContain("romance");
    // Chaque genre a 3 entity_types
    for (const g of genres) {
      expect(g.entity_types).toEqual(["character", "location", "world_rule"]);
    }
  });

  it("get_template fantasy/character → structure avec name, description, traits, background", async () => {
    const res = await callTool("get_template", { genre: "fantasy", entity_type: "character" });
    expect(res.isError).toBeFalsy();
    const data = parseResult(res) as Record<string, unknown>;
    expect(data.genre).toBe("fantasy");
    expect(data.entity_type).toBe("character");
    const template = data.template as Record<string, string>;
    expect(template.name).toBeDefined();
    expect(template.description).toBeDefined();
    expect(template.traits).toBeDefined();
    expect(template.background).toBeDefined();
    expect(template.notes).toBeDefined();
  });

  it("get_template polar/location → structure avec name, description, atmosphere, geography", async () => {
    const res = await callTool("get_template", { genre: "polar", entity_type: "location" });
    expect(res.isError).toBeFalsy();
    const data = parseResult(res) as Record<string, unknown>;
    expect(data.genre).toBe("polar");
    expect(data.entity_type).toBe("location");
    const template = data.template as Record<string, string>;
    expect(template.name).toBeDefined();
    expect(template.description).toBeDefined();
    expect(template.atmosphere).toBeDefined();
    expect(template.geography).toBeDefined();
    expect(template.notes).toBeDefined();
  });

  it("genre invalide → isError true", async () => {
    const res = await callTool("get_template", { genre: "horror", entity_type: "character" });
    expect(res.isError).toBe(true);
  });

  it("entity_type invalide → isError true", async () => {
    const res = await callTool("get_template", { genre: "fantasy", entity_type: "vehicle" });
    expect(res.isError).toBe(true);
  });
});
