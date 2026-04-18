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

describe("Events CRUD + Timeline", () => {
  let dbInstance: DbInstance;
  let callTool: ToolRunner;

  // Helpers — crée les entités de référence
  let charId1: string;
  let charId2: string;
  let locId: string;

  beforeEach(async () => {
    dbInstance = createTestDb();
    callTool = await createToolRunner(dbInstance);

    // Créer 2 personnages et 1 lieu pour les références
    const c1 = await callTool("create_character", { name: "Aria" });
    charId1 = (parseResult(c1) as Record<string, unknown>).id as string;

    const c2 = await callTool("create_character", { name: "Kael" });
    charId2 = (parseResult(c2) as Record<string, unknown>).id as string;

    const loc = await callTool("create_location", { name: "Forêt Noire" });
    locId = (parseResult(loc) as Record<string, unknown>).id as string;
  });

  afterEach(() => {
    dbInstance.sqlite.close();
  });

  it("CRUD complet avec characters[] et location_id", async () => {
    // Create
    const createRes = await callTool("create_event", {
      title: "Bataille de la Forêt",
      description: "Affrontement décisif",
      chapter: "Chapitre 5",
      sort_order: 1,
      location_id: locId,
      characters: [charId1, charId2],
    });
    expect(createRes.isError).toBeFalsy();
    const created = parseResult(createRes) as Record<string, unknown>;
    expect(created.title).toBe("Bataille de la Forêt");
    expect(created.locationId).toBe(locId);
    const eventId = created.id as string;

    // Get
    const getRes = await callTool("get_event", { id: eventId });
    expect(getRes.isError).toBeFalsy();
    const event = parseResult(getRes) as Record<string, unknown>;
    expect(event.title).toBe("Bataille de la Forêt");

    // Update
    const updateRes = await callTool("update_event", {
      id: eventId,
      description: "Victoire totale",
    });
    expect(updateRes.isError).toBeFalsy();
    const updated = parseResult(updateRes) as Record<string, unknown>;
    expect(updated.description).toBe("Victoire totale");

    // Delete
    const deleteRes = await callTool("delete_event", { id: eventId });
    expect(deleteRes.isError).toBeFalsy();

    // Get — verify error
    const getDeleted = await callTool("get_event", { id: eventId });
    expect(getDeleted.isError).toBe(true);
  });

  it("get_timeline : 3 events sort_order différents → tri correct", async () => {
    await callTool("create_event", { title: "Troisième", sort_order: 30 });
    await callTool("create_event", { title: "Premier", sort_order: 10 });
    await callTool("create_event", { title: "Deuxième", sort_order: 20 });

    const timelineRes = await callTool("get_timeline", {});
    expect(timelineRes.isError).toBeFalsy();
    const data = parseResult(timelineRes) as Record<string, unknown>;
    const timeline = data.timeline as Array<Record<string, unknown>>;

    expect(timeline).toHaveLength(3);
    expect(timeline[0].title).toBe("Premier");
    expect(timeline[1].title).toBe("Deuxième");
    expect(timeline[2].title).toBe("Troisième");
  });

  it("enrichissement : get_event retourne les noms des personnages et du lieu", async () => {
    const createRes = await callTool("create_event", {
      title: "Rencontre",
      location_id: locId,
      characters: [charId1, charId2],
    });
    const created = parseResult(createRes) as Record<string, unknown>;
    const eventId = created.id as string;

    const getRes = await callTool("get_event", { id: eventId });
    const event = parseResult(getRes) as Record<string, unknown>;

    // Vérifier le nom du lieu
    expect(event.locationName).toBe("Forêt Noire");

    // Vérifier les détails des personnages
    const charDetails = event.characterDetails as Array<Record<string, unknown>>;
    expect(charDetails).toHaveLength(2);
    const names = charDetails.map((c) => c.name);
    expect(names).toContain("Aria");
    expect(names).toContain("Kael");
  });

  it("erreurs : get/update/delete sur ID inexistant → isError true", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";

    expect((await callTool("get_event", { id: fakeId })).isError).toBe(true);
    expect((await callTool("update_event", { id: fakeId, title: "X" })).isError).toBe(true);
    expect((await callTool("delete_event", { id: fakeId })).isError).toBe(true);
  });
});
