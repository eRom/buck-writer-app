import { sqliteTable, text, integer, blob, uniqueIndex } from "drizzle-orm/sqlite-core";

// ── Characters ──────────────────────────────────────────────────────
export const characters = sqliteTable("characters", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  traits: text("traits"), // JSON: { physical: [...], personality: [...] }
  background: text("background"),
  notes: text("notes"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ── Locations ───────────────────────────────────────────────────────
export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  atmosphere: text("atmosphere"),
  geography: text("geography"),
  notes: text("notes"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ── Events ──────────────────────────────────────────────────────────
export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  chapter: text("chapter"),
  sortOrder: integer("sort_order"),
  locationId: text("location_id").references(() => locations.id),
  characters: text("characters"), // JSON: ["uuid1", "uuid2"]
  notes: text("notes"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ── Interactions ────────────────────────────────────────────────────
export const interactions = sqliteTable("interactions", {
  id: text("id").primaryKey(),
  description: text("description").notNull(),
  nature: text("nature"),
  characters: text("characters").notNull(), // JSON: ["uuid1", "uuid2"] (min 2)
  chapter: text("chapter"),
  sortOrder: integer("sort_order"),
  notes: text("notes"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ── World Rules ─────────────────────────────────────────────────────
export const worldRules = sqliteTable("world_rules", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  notes: text("notes"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ── Research ────────────────────────────────────────────────────────
export const research = sqliteTable("research", {
  id: text("id").primaryKey(),
  topic: text("topic").notNull(),
  content: text("content").notNull(),
  sources: text("sources"), // JSON: ["url1", "livre1"]
  notes: text("notes"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ── Notes ───────────────────────────────────────────────────────────
export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  tags: text("tags"), // JSON: ["tag1", "tag2"]
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ── Embeddings ──────────────────────────────────────────────────────
export const embeddings = sqliteTable(
  "embeddings",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    embedding: blob("embedding", { mode: "buffer" }).notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("embeddings_entity_type_entity_id_unique").on(
      table.entityType,
      table.entityId,
    ),
  ],
);
