import type { Session } from './sessions';

export type SessionGroupKey = 'favorites' | 'today' | 'week' | 'older';

export interface SessionGroup {
  key: SessionGroupKey;
  label: string;
  sessions: Session[];
}

const LABELS: Record<SessionGroupKey, string> = {
  favorites: 'FAVORIS',
  today: 'AUJOURD\'HUI',
  week: '7 DERNIERS JOURS',
  older: 'PLUS ANCIEN',
};

function startOfToday(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function groupSessions(sessions: Session[], nowMs: number = Date.now()): SessionGroup[] {
  const favorites: Session[] = [];
  const today: Session[] = [];
  const week: Session[] = [];
  const older: Session[] = [];
  const todayStart = startOfToday(nowMs);
  const weekStart = todayStart - 1000 * 60 * 60 * 24 * 7;

  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  for (const s of sorted) {
    if (s.isFavorite) {
      favorites.push(s);
      continue;
    }
    if (s.updatedAt >= todayStart) today.push(s);
    else if (s.updatedAt >= weekStart) week.push(s);
    else older.push(s);
  }

  const groups: SessionGroup[] = [];
  for (const [key, list] of [
    ['favorites', favorites],
    ['today', today],
    ['week', week],
    ['older', older],
  ] as const) {
    if (list.length > 0) groups.push({ key, label: LABELS[key], sessions: list });
  }
  return groups;
}
