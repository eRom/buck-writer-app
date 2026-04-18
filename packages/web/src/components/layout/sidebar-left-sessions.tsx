import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { fetchSessions, toggleFavorite, type Session, type SessionsResponse } from '@/lib/sessions';
import { groupSessions } from '@/lib/session-groups';
import { SessionItem } from './session-item';

interface Props {
  query: string;
  collapsed: boolean;
}

export function SidebarLeftSessions({ query, collapsed }: Props) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['sessions', query],
    queryFn: () => fetchSessions(query || undefined),
  });
  const search = useSearch({ strict: false }) as { session?: string };
  const activeId = search.session;

  const mutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) => toggleFavorite(id, next),
    onMutate: async ({ id, next }) => {
      await qc.cancelQueries({ queryKey: ['sessions'] });
      const prev = qc.getQueriesData<SessionsResponse>({ queryKey: ['sessions'] });
      prev.forEach(([key, value]) => {
        if (!value) return;
        qc.setQueryData<SessionsResponse>(key, {
          ...value,
          sessions: value.sessions.map((s) => (s.id === id ? { ...s, isFavorite: next ? 1 : 0 } : s)),
        });
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.prev.forEach(([key, value]) => qc.setQueryData(key, value));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });

  const groups = useMemo(() => groupSessions(data?.sessions ?? []), [data]);

  if (collapsed) {
    const flat: Session[] = groups.flatMap((g) => g.sessions).slice(0, 20);
    return (
      <div className="py-1">
        {flat.map((s) => (
          <SessionItem
            key={s.id}
            session={s}
            active={s.id === activeId}
            collapsed
            onToggleFavorite={(id, next) => mutation.mutate({ id, next })}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="pb-2">
      {groups.map((g) => (
        <div key={g.key} className="mt-3 first:mt-0">
          <div className="sticky top-0 z-10 bg-sidebar/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/40 backdrop-blur-sm">
            {g.label}
          </div>
          <div className="px-1">
            {g.sessions.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                active={s.id === activeId}
                collapsed={false}
                onToggleFavorite={(id, next) => mutation.mutate({ id, next })}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
