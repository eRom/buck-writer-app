import { describe, it, expect } from 'vitest';
import { classifyToolNames } from './mcp-classifier.js';

describe('classifyToolNames', () => {
  it('tags create_/update_/delete_ as always-approve', () => {
    const { always, never } = classifyToolNames([
      'create_character',
      'update_location',
      'delete_note',
    ]);
    expect(always).toEqual(['create_character', 'update_location', 'delete_note']);
    expect(never).toEqual([]);
  });

  it('tags list_/get_/search_/ping as never-approve', () => {
    const { always, never } = classifyToolNames([
      'list_characters',
      'get_event',
      'search_fulltext',
      'ping',
    ]);
    expect(never).toEqual(['list_characters', 'get_event', 'search_fulltext', 'ping']);
    expect(always).toEqual([]);
  });

  it('tags import_bulk, restore_bible, reindex_embeddings, backup_bible as always', () => {
    const { always, never } = classifyToolNames([
      'import_bulk',
      'restore_bible',
      'reindex_embeddings',
      'backup_bible',
    ]);
    expect(always).toEqual([
      'import_bulk',
      'restore_bible',
      'reindex_embeddings',
      'backup_bible',
    ]);
    expect(never).toEqual([]);
  });

  it('handles mixed realistic bible-mcp tool set', () => {
    const { always, never } = classifyToolNames([
      'create_character',
      'list_characters',
      'detect_duplicates',
      'delete_world_rule',
      'get_bible_stats',
    ]);
    expect(always).toEqual(['create_character', 'delete_world_rule']);
    expect(never).toEqual(['list_characters', 'detect_duplicates', 'get_bible_stats']);
  });
});
