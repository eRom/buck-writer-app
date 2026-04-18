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

describe("Import Bulk", () => {
  let dbInstance: DbInstance;
  let callTool: ToolRunner;

  beforeEach(async () => {
    dbInstance = createTestDb();
    callTool = await createToolRunner(dbInstance);
  });

  afterEach(() => {
    dbInstance.sqlite.close();
  });

  it("import valide → entités insérées en DB", async () => {
    const res = await callTool("import_bulk", {
      data: {
        characters: [
          { name: "Aria", description: "Guerrière elfique" },
          { name: "Boris", description: "Mage sombre" },
        ],
        locations: [{ name: "Château Noir", description: "Forteresse" }],
      },
      on_conflict: "skip",
    });
    expect(res.isError).toBeFalsy();
    const report = parseResult(res) as Record<string, unknown>;
    const imported = report.imported as Record<string, number>;
    expect(imported.characters).toBe(2);
    expect(imported.locations).toBe(1);

    // Vérifier en DB
    const charList = parseResult(await callTool("list_characters", { limit: 50, offset: 0 })) as Record<
      string,
      unknown
    >;
    expect(charList.total).toBe(2);

    const locList = parseResult(await callTool("list_locations", { limit: 50, offset: 0 })) as Record<
      string,
      unknown
    >;
    expect(locList.total).toBe(1);
  });

  it("import doublon on_conflict=skip → entité existante préservée", async () => {
    // Créer un personnage existant
    await callTool("create_character", { name: "Aria", description: "Guerrière originale" });

    // Importer avec le même nom
    const res = await callTool("import_bulk", {
      data: {
        characters: [{ name: "Aria", description: "Nouvelle description" }],
      },
      on_conflict: "skip",
    });
    expect(res.isError).toBeFalsy();
    const report = parseResult(res) as Record<string, unknown>;
    expect(report.skipped).toBe(1);

    // Vérifier que la description d'origine est préservée
    const getRes = await callTool("get_character", { name: "Aria" });
    const char = parseResult(getRes) as Record<string, unknown>;
    expect(char.description).toBe("Guerrière originale");
  });

  it("import doublon on_conflict=update → entité mise à jour", async () => {
    // Créer un personnage existant
    await callTool("create_character", { name: "Boris", description: "Mage ancien" });

    // Importer avec le même nom et on_conflict=update
    const res = await callTool("import_bulk", {
      data: {
        characters: [{ name: "Boris", description: "Mage nouveau" }],
      },
      on_conflict: "update",
    });
    expect(res.isError).toBeFalsy();
    const report = parseResult(res) as Record<string, unknown>;
    const imported = report.imported as Record<string, number>;
    expect(imported.characters).toBe(1);

    // Vérifier que la description est mise à jour
    const getRes = await callTool("get_character", { name: "Boris" });
    const char = parseResult(getRes) as Record<string, unknown>;
    expect(char.description).toBe("Mage nouveau");
  });

  it("import invalide (champ obligatoire manquant) → erreurs de validation", async () => {
    const res = await callTool("import_bulk", {
      data: {
        characters: [
          { description: "Pas de nom — champ name manquant" },
        ],
      },
      on_conflict: "skip",
    });
    // Pas une erreur système, mais le rapport contient des erreurs de validation
    expect(res.isError).toBeFalsy();
    const report = parseResult(res) as Record<string, unknown>;
    const errors = report.errors as string[];
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("validation");

    // Aucun personnage importé
    const charList = parseResult(await callTool("list_characters", { limit: 50, offset: 0 })) as Record<
      string,
      unknown
    >;
    expect(charList.total).toBe(0);
  });
});
