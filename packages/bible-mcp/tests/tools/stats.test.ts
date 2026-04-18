import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTestDb, createFileDb, createToolRunner, parseResult } from "../setup.js";
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

describe("Stats", () => {
  describe("avec DB :memory:", () => {
    let dbInstance: DbInstance;
    let callTool: ToolRunner;

    beforeEach(async () => {
      dbInstance = createTestDb();
      callTool = await createToolRunner(dbInstance);
    });

    afterEach(() => {
      dbInstance.sqlite.close();
    });

    it("bible vide → tous compteurs à 0", async () => {
      const result = await callTool("get_bible_stats", {});
      expect(result.isError).toBeFalsy();
      const stats = parseResult(result) as Record<string, unknown>;
      const entities = stats.entities as Record<string, number>;

      expect(entities.characters).toBe(0);
      expect(entities.locations).toBe(0);
      expect(entities.events).toBe(0);
      expect(entities.interactions).toBe(0);
      expect(entities.worldRules).toBe(0);
      expect(entities.research).toBe(0);
      expect(entities.notes).toBe(0);
      expect(entities.embeddings).toBe(0);
      expect(stats.totalEntities).toBe(0);
    });

    it("après ajout d'entités → compteurs corrects", async () => {
      await callTool("create_character", { name: "Alice" });
      await callTool("create_character", { name: "Bob" });
      await callTool("create_location", { name: "Village" });
      await callTool("create_world_rule", {
        category: "magie",
        title: "Règle 1",
        description: "Description",
      });

      const result = await callTool("get_bible_stats", {});
      const stats = parseResult(result) as Record<string, unknown>;
      const entities = stats.entities as Record<string, number>;

      expect(entities.characters).toBe(2);
      expect(entities.locations).toBe(1);
      expect(entities.worldRules).toBe(1);
      expect(stats.totalEntities).toBe(4);
    });
  });

  describe("avec DB fichier", () => {
    let tmpDir: string;
    let dbPath: string;
    let dbInstance: DbInstance;
    let callTool: ToolRunner;

    beforeEach(async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bible-stats-"));
      const dataDir = path.join(tmpDir, "data");
      fs.mkdirSync(dataDir, { recursive: true });
      dbPath = path.join(dataDir, "bible.db");
      dbInstance = createFileDb(dbPath);
      callTool = await createToolRunner(dbInstance, dbPath);
    });

    afterEach(() => {
      dbInstance.sqlite.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("taille du fichier DB > 0", async () => {
      const result = await callTool("get_bible_stats", {});
      const stats = parseResult(result) as Record<string, unknown>;
      const database = stats.database as Record<string, unknown>;

      expect(database.path).toBe(dbPath);
      expect((database.size as number) > 0).toBe(true);
      expect(database.lastModified).toBeDefined();
    });
  });
});
