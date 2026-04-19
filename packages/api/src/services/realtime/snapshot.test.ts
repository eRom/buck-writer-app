import { describe, it, expect } from 'vitest';
import { buildSessionSnapshot } from './snapshot.js';

describe('buildSessionSnapshot', () => {
  it('format [role]: text tronqué aux N derniers', () => {
    const msgs = Array.from({ length: 25 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `msg${i}`,
    }));
    const snap = buildSessionSnapshot(msgs, { maxMessages: 20 });
    expect(snap.split('\n')).toHaveLength(20);
    expect(snap).toContain('msg24');
    expect(snap).not.toContain('msg4');
    expect(snap.startsWith('[')).toBe(true);
  });

  it('tronque à maxChars si budget dépassé (garde la queue)', () => {
    const msgs = [{ role: 'user' as const, content: 'x'.repeat(20000) }];
    const snap = buildSessionSnapshot(msgs, { maxMessages: 20, maxChars: 200 });
    expect(snap.length).toBeLessThanOrEqual(200);
  });

  it('retourne "" si aucun message', () => {
    expect(buildSessionSnapshot([], { maxMessages: 20 })).toBe('');
  });

  it('ignore role=system', () => {
    const snap = buildSessionSnapshot([
      { role: 'system', content: 'hidden' },
      { role: 'user', content: 'hello' },
    ], { maxMessages: 20 });
    expect(snap).not.toContain('hidden');
    expect(snap).toContain('hello');
  });
});
