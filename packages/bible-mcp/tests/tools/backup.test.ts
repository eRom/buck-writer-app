import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFileDb, createToolRunner, parseResult } from "../setup.js";
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

describe("Backup / Restore", () => {
  let tmpDir: string;
  let dbPath: string;
  let dbInstance: DbInstance;
  let callTool: ToolRunner;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bible-test-"));
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

  it("backup_bible → fichier créé", async () => {
    const backupRes = await callTool("backup_bible", {});
    expect(backupRes.isError).toBeFalsy();
    const backup = parseResult(backupRes) as Record<string, unknown>;
    expect(backup.backup).toBeDefined();
    expect(backup.path).toBeDefined();
    expect(fs.existsSync(backup.path as string)).toBe(true);
    expect((backup.size as number) > 0).toBe(true);
  });

  it("list_backups → backup présent", async () => {
    // Créer un backup
    await callTool("backup_bible", {});

    // Lister
    const listRes = await callTool("list_backups", {});
    expect(listRes.isError).toBeFalsy();
    const data = parseResult(listRes) as Record<string, unknown>;
    expect(data.total).toBeGreaterThanOrEqual(1);
    const backups = data.backups as Array<Record<string, unknown>>;
    expect(backups.length).toBeGreaterThanOrEqual(1);
    expect((backups[0].name as string).endsWith(".db")).toBe(true);
  });

  it("restore cycle : backup → modifier → restore → vérifier", async () => {
    // Créer un personnage "Alice"
    await callTool("create_character", { name: "Alice" });

    // Backup (contient Alice)
    const backupRes = await callTool("backup_bible", {});
    const backupData = parseResult(backupRes) as Record<string, unknown>;
    const backupName = backupData.backup as string;

    // Ajouter "Bob" (après le backup)
    await callTool("create_character", { name: "Bob" });

    // Vérifier que Bob existe
    const bobCheck = await callTool("get_character", { name: "Bob" });
    expect(bobCheck.isError).toBeFalsy();

    // Restore depuis le backup (qui ne contient pas Bob)
    const restoreRes = await callTool("restore_bible", { backup_name: backupName });
    expect(restoreRes.isError).toBeFalsy();

    // Fermer la connexion actuelle
    dbInstance.sqlite.close();

    // Rouvrir la DB pour voir l'état restauré
    const restoredDb = createFileDb(dbPath);

    // Alice doit exister
    const aliceRows = restoredDb.sqlite
      .prepare("SELECT * FROM characters WHERE name = ?")
      .all("Alice");
    expect(aliceRows).toHaveLength(1);

    // Bob ne doit PAS exister
    const bobRows = restoredDb.sqlite
      .prepare("SELECT * FROM characters WHERE name = ?")
      .all("Bob");
    expect(bobRows).toHaveLength(0);

    restoredDb.sqlite.close();
  });
});
