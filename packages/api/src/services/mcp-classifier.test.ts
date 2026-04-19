import { describe, it, expect } from 'vitest';
import { classifyToolNames } from './mcp-classifier.js';

describe('classifyToolNames', () => {
  it('tags only delete_/restore_/reindex_ as always-approve (destructive)', () => {
    const { always, never } = classifyToolNames([
      'delete_character',
      'restore_bible',
      'reindex_embeddings',
    ]);
    expect(always).toEqual(['delete_character', 'restore_bible', 'reindex_embeddings']);
    expect(never).toEqual([]);
  });

  it('lets create_/update_/import_/backup_ pass without approval', () => {
    const { always, never } = classifyToolNames([
      'create_character',
      'update_location',
      'import_bulk',
      'backup_bible',
    ]);
    expect(always).toEqual([]);
    expect(never).toEqual([
      'create_character',
      'update_location',
      'import_bulk',
      'backup_bible',
    ]);
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

  it('handles mixed realistic bible-mcp tool set', () => {
    const { always, never } = classifyToolNames([
      'create_character',
      'list_characters',
      'detect_duplicates',
      'delete_world_rule',
      'get_bible_stats',
      'restore_bible',
    ]);
    expect(always).toEqual(['delete_world_rule', 'restore_bible']);
    expect(never).toEqual([
      'create_character',
      'list_characters',
      'detect_duplicates',
      'get_bible_stats',
    ]);
  });
});
