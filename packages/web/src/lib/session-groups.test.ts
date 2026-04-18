import { describe, it, expect } from 'vitest';
import { groupSessions } from './session-groups';
import type { Session } from './sessions';

const baseSession: Session = {
  id: '1',
  title: 't',
  model: 'gpt-4',
  isFavorite: 0,
  archived: 0,
  createdAt: 0,
  updatedAt: 0,
  lastMessageAt: null,
};

const NOW = new Date('2026-04-18T12:00:00Z').getTime();

describe('groupSessions', () => {
  it('places favorites in their own group at top, regardless of date', () => {
    const sessions: Session[] = [
      { ...baseSession, id: 'a', updatedAt: NOW - 1000 * 60 * 60 * 24 * 30, isFavorite: 1 },
      { ...baseSession, id: 'b', updatedAt: NOW - 1000, isFavorite: 0 },
    ];
    const groups = groupSessions(sessions, NOW);
    expect(groups[0]!.key).toBe('favorites');
    expect(groups[0]!.sessions.map((s) => s.id)).toEqual(['a']);
  });

  it('groups today / last 7 days / older', () => {
    const sessions: Session[] = [
      { ...baseSession, id: 'today', updatedAt: NOW - 1000 * 60 * 60 * 2 },
      { ...baseSession, id: 'week', updatedAt: NOW - 1000 * 60 * 60 * 24 * 3 },
      { ...baseSession, id: 'old', updatedAt: NOW - 1000 * 60 * 60 * 24 * 30 },
    ];
    const groups = groupSessions(sessions, NOW);
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g.sessions.map((s) => s.id)]));
    expect(byKey.today).toEqual(['today']);
    expect(byKey.week).toEqual(['week']);
    expect(byKey.older).toEqual(['old']);
  });

  it('omits empty groups', () => {
    const sessions: Session[] = [
      { ...baseSession, id: 'today', updatedAt: NOW - 1000 * 60 * 60 * 2 },
    ];
    const groups = groupSessions(sessions, NOW);
    expect(groups.map((g) => g.key)).toEqual(['today']);
  });

  it('returns empty for no sessions', () => {
    expect(groupSessions([], NOW)).toEqual([]);
  });
});
