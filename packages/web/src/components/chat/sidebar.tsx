import { useState, useEffect, useCallback } from 'react';
import { fetchSessions, createSession, deleteSession, updateSession, type Session } from '@/lib/sessions';
import { SessionList } from './session-list';

interface SidebarProps {
  activeSessionId?: string;
  onSelectSession: (id: string) => void;
  onNewSession: (id: string) => void;
}

export function Sidebar({ activeSessionId, onSelectSession, onNewSession }: SidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [search, setSearch] = useState('');

  const loadSessions = useCallback(async () => {
    const res = await fetchSessions(search || undefined);
    setSessions(res.sessions);
  }, [search]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  async function handleNew() {
    const s = await createSession();
    setSessions((prev) => [s, ...prev]);
    onNewSession(s.id);
  }

  async function handleDelete(id: string) {
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleRename(id: string, title: string) {
    const updated = await updateSession(id, { title });
    setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }

  async function handleArchive(id: string) {
    await updateSession(id, { archived: true });
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border p-3">
        <button
          onClick={handleNew}
          className="flex-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/50"
        >
          + Nouveau chat
        </button>
      </div>
      <div className="px-3 py-2">
        <input
          type="text"
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-border bg-input px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>
      <SessionList
        sessions={sessions}
        activeId={activeSessionId}
        onSelect={onSelectSession}
        onRename={handleRename}
        onDelete={handleDelete}
        onArchive={handleArchive}
      />
    </>
  );
}
