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

describe("Timeline filtrée (get_timeline_filtered)", () => {
  let dbInstance: DbInstance;
  let callTool: ToolRunner;
  let charIdA: string;
  let charIdB: string;
  let locIdX: string;
  let locIdY: string;

  beforeEach(async () => {
    dbInstance = createTestDb();
    callTool = await createToolRunner(dbInstance);

    // Créer des personnages
    const charA = parseResult(await callTool("create_character", { name: "Aria" })) as Record<string, unknown>;
    charIdA = charA.id as string;
    const charB = parseResult(await callTool("create_character", { name: "Boris" })) as Record<string, unknown>;
    charIdB = charB.id as string;

    // Créer des lieux
    const locX = parseResult(await callTool("create_location", { name: "Château" })) as Record<string, unknown>;
    locIdX = locX.id as string;
    const locY = parseResult(await callTool("create_location", { name: "Forêt" })) as Record<string, unknown>;
    locIdY = locY.id as string;

    // Créer 3 événements avec combinaisons variées
    await callTool("create_event", {
      title: "Evt 1 — Aria au Château",
      chapter: "ch1",
      sort_order: 1,
      location_id: locIdX,
      characters: [charIdA],
    });
    await callTool("create_event", {
      title: "Evt 2 — Boris en Forêt",
      chapter: "ch1",
      sort_order: 2,
      location_id: locIdY,
      characters: [charIdB],
    });
    await callTool("create_event", {
      title: "Evt 3 — Aria+Boris au Château",
      chapter: "ch2",
      sort_order: 3,
      location_id: locIdX,
      characters: [charIdA, charIdB],
    });
  });

  afterEach(() => {
    dbInstance.sqlite.close();
  });

  it("filtre par character_id → seuls les événements du personnage", async () => {
    const res = await callTool("get_timeline_filtered", { character_id: charIdA });
    expect(res.isError).toBeFalsy();
    const data = parseResult(res) as Record<string, unknown>;
    expect(data.total).toBe(2); // Evt 1 et 3
    const timeline = data.timeline as Array<Record<string, unknown>>;
    expect(timeline[0].title).toBe("Evt 1 — Aria au Château");
    expect(timeline[1].title).toBe("Evt 3 — Aria+Boris au Château");
  });

  it("filtre par location_id → seuls les événements de ce lieu", async () => {
    const res = await callTool("get_timeline_filtered", { location_id: locIdY });
    expect(res.isError).toBeFalsy();
    const data = parseResult(res) as Record<string, unknown>;
    expect(data.total).toBe(1); // Evt 2
    const timeline = data.timeline as Array<Record<string, unknown>>;
    expect(timeline[0].title).toBe("Evt 2 — Boris en Forêt");
  });

  it("filtre combiné character_id + location_id → AND", async () => {
    const res = await callTool("get_timeline_filtered", {
      character_id: charIdA,
      location_id: locIdX,
    });
    expect(res.isError).toBeFalsy();
    const data = parseResult(res) as Record<string, unknown>;
    // Evt 1 (Aria + Château) et Evt 3 (Aria+Boris + Château)
    expect(data.total).toBe(2);
  });

  it("aucun filtre → retourne tout (comme get_timeline)", async () => {
    const res = await callTool("get_timeline_filtered", {});
    expect(res.isError).toBeFalsy();
    const data = parseResult(res) as Record<string, unknown>;
    expect(data.total).toBe(3);
    const timeline = data.timeline as Array<Record<string, unknown>>;
    // Vérifie l'ordre chronologique par sort_order
    expect(timeline[0].title).toContain("Evt 1");
    expect(timeline[1].title).toContain("Evt 2");
    expect(timeline[2].title).toContain("Evt 3");
  });
});
