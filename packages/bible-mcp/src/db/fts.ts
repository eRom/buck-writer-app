import type BetterSqlite3 from "better-sqlite3";

/**
 * Initialise la table virtuelle FTS5 et les triggers de synchronisation
 * pour chaque table principale de la bible.
 */
export function initFts(db: BetterSqlite3.Database): void {
  // ── Table virtuelle FTS5 ────────────────────────────────────────────
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS bible_fts USING fts5(
      entity_type,
      entity_id,
      content,
      tokenize='unicode61'
    )
  `);

  // ── Characters ──────────────────────────────────────────────────────
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS characters_ai_fts AFTER INSERT ON characters
    BEGIN
      INSERT INTO bible_fts(entity_type, entity_id, content)
      VALUES(
        'character',
        new.id,
        new.name || ' ' || COALESCE(new.description, '') || ' ' || COALESCE(new.traits, '') || ' ' || COALESCE(new.background, '') || ' ' || COALESCE(new.notes, '')
      );
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS characters_au_fts AFTER UPDATE ON characters
    BEGIN
      DELETE FROM bible_fts WHERE entity_id = old.id AND entity_type = 'character';
      INSERT INTO bible_fts(entity_type, entity_id, content)
      VALUES(
        'character',
        new.id,
        new.name || ' ' || COALESCE(new.description, '') || ' ' || COALESCE(new.traits, '') || ' ' || COALESCE(new.background, '') || ' ' || COALESCE(new.notes, '')
      );
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS characters_ad_fts AFTER DELETE ON characters
    BEGIN
      DELETE FROM bible_fts WHERE entity_id = old.id AND entity_type = 'character';
    END
  `);

  // ── Locations ───────────────────────────────────────────────────────
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS locations_ai_fts AFTER INSERT ON locations
    BEGIN
      INSERT INTO bible_fts(entity_type, entity_id, content)
      VALUES(
        'location',
        new.id,
        new.name || ' ' || COALESCE(new.description, '') || ' ' || COALESCE(new.atmosphere, '') || ' ' || COALESCE(new.geography, '') || ' ' || COALESCE(new.notes, '')
      );
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS locations_au_fts AFTER UPDATE ON locations
    BEGIN
      DELETE FROM bible_fts WHERE entity_id = old.id AND entity_type = 'location';
      INSERT INTO bible_fts(entity_type, entity_id, content)
      VALUES(
        'location',
        new.id,
        new.name || ' ' || COALESCE(new.description, '') || ' ' || COALESCE(new.atmosphere, '') || ' ' || COALESCE(new.geography, '') || ' ' || COALESCE(new.notes, '')
      );
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS locations_ad_fts AFTER DELETE ON locations
    BEGIN
      DELETE FROM bible_fts WHERE entity_id = old.id AND entity_type = 'location';
    END
  `);

  // ── Events ──────────────────────────────────────────────────────────
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS events_ai_fts AFTER INSERT ON events
    BEGIN
      INSERT INTO bible_fts(entity_type, entity_id, content)
      VALUES(
        'event',
        new.id,
        new.title || ' ' || COALESCE(new.description, '') || ' ' || COALESCE(new.chapter, '') || ' ' || COALESCE(new.notes, '')
      );
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS events_au_fts AFTER UPDATE ON events
    BEGIN
      DELETE FROM bible_fts WHERE entity_id = old.id AND entity_type = 'event';
      INSERT INTO bible_fts(entity_type, entity_id, content)
      VALUES(
        'event',
        new.id,
        new.title || ' ' || COALESCE(new.description, '') || ' ' || COALESCE(new.chapter, '') || ' ' || COALESCE(new.notes, '')
      );
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS events_ad_fts AFTER DELETE ON events
    BEGIN
      DELETE FROM bible_fts WHERE entity_id = old.id AND entity_type = 'event';
    END
  `);

  // ── Interactions ────────────────────────────────────────────────────
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS interactions_ai_fts AFTER INSERT ON interactions
    BEGIN
      INSERT INTO bible_fts(entity_type, entity_id, content)
      VALUES(
        'interaction',
        new.id,
        new.description || ' ' || COALESCE(new.nature, '') || ' ' || COALESCE(new.chapter, '') || ' ' || COALESCE(new.notes, '')
      );
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS interactions_au_fts AFTER UPDATE ON interactions
    BEGIN
      DELETE FROM bible_fts WHERE entity_id = old.id AND entity_type = 'interaction';
      INSERT INTO bible_fts(entity_type, entity_id, content)
      VALUES(
        'interaction',
        new.id,
        new.description || ' ' || COALESCE(new.nature, '') || ' ' || COALESCE(new.chapter, '') || ' ' || COALESCE(new.notes, '')
      );
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS interactions_ad_fts AFTER DELETE ON interactions
    BEGIN
      DELETE FROM bible_fts WHERE entity_id = old.id AND entity_type = 'interaction';
    END
  `);

  // ── World Rules ─────────────────────────────────────────────────────
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS world_rules_ai_fts AFTER INSERT ON world_rules
    BEGIN
      INSERT INTO bible_fts(entity_type, entity_id, content)
      VALUES(
        'world_rule',
        new.id,
        new.category || ' ' || new.title || ' ' || new.description || ' ' || COALESCE(new.notes, '')
      );
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS world_rules_au_fts AFTER UPDATE ON world_rules
    BEGIN
      DELETE FROM bible_fts WHERE entity_id = old.id AND entity_type = 'world_rule';
      INSERT INTO bible_fts(entity_type, entity_id, content)
      VALUES(
        'world_rule',
        new.id,
        new.category || ' ' || new.title || ' ' || new.description || ' ' || COALESCE(new.notes, '')
      );
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS world_rules_ad_fts AFTER DELETE ON world_rules
    BEGIN
      DELETE FROM bible_fts WHERE entity_id = old.id AND entity_type = 'world_rule';
    END
  `);

  // ── Research ────────────────────────────────────────────────────────
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS research_ai_fts AFTER INSERT ON research
    BEGIN
      INSERT INTO bible_fts(entity_type, entity_id, content)
      VALUES(
        'research',
        new.id,
        new.topic || ' ' || new.content || ' ' || COALESCE(new.sources, '') || ' ' || COALESCE(new.notes, '')
      );
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS research_au_fts AFTER UPDATE ON research
    BEGIN
      DELETE FROM bible_fts WHERE entity_id = old.id AND entity_type = 'research';
      INSERT INTO bible_fts(entity_type, entity_id, content)
      VALUES(
        'research',
        new.id,
        new.topic || ' ' || new.content || ' ' || COALESCE(new.sources, '') || ' ' || COALESCE(new.notes, '')
      );
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS research_ad_fts AFTER DELETE ON research
    BEGIN
      DELETE FROM bible_fts WHERE entity_id = old.id AND entity_type = 'research';
    END
  `);

  // ── Notes ───────────────────────────────────────────────────────────
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS notes_ai_fts AFTER INSERT ON notes
    BEGIN
      INSERT INTO bible_fts(entity_type, entity_id, content)
      VALUES(
        'note',
        new.id,
        new.content || ' ' || COALESCE(new.tags, '')
      );
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS notes_au_fts AFTER UPDATE ON notes
    BEGIN
      DELETE FROM bible_fts WHERE entity_id = old.id AND entity_type = 'note';
      INSERT INTO bible_fts(entity_type, entity_id, content)
      VALUES(
        'note',
        new.id,
        new.content || ' ' || COALESCE(new.tags, '')
      );
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS notes_ad_fts AFTER DELETE ON notes
    BEGIN
      DELETE FROM bible_fts WHERE entity_id = old.id AND entity_type = 'note';
    END
  `);

  console.error("[fts] Table FTS5 et triggers initialisés");
}
