import { type Session } from '@/lib/sessions';

interface SessionListProps {
  sessions: Session[];
  activeId?: string;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
}

function groupByDate(sessions: Session[]): Record<string, Session[]> {
  const now = Date.now();
  const day = 86_400_000;
  const groups: Record<string, Session[]> = {
    "Aujourd'hui": [],
    '7 derniers jours': [],
    '30 derniers jours': [],
    'Plus ancien': [],
  };

  for (const s of sessions) {
    const age = now - (s.lastMessageAt ?? s.createdAt);
    if (age < day) groups["Aujourd'hui"]!.push(s);
    else if (age < 7 * day) groups['7 derniers jours']!.push(s);
    else if (age < 30 * day) groups['30 derniers jours']!.push(s);
    else groups['Plus ancien']!.push(s);
  }

  return groups;
}

export function SessionList({
  sessions,
  activeId,
  onSelect,
}: SessionListProps) {
  const groups = groupByDate(sessions);

  return (
    <div className="flex-1 overflow-y-auto px-2 py-1">
      {Object.entries(groups).map(([label, items]) =>
        items.length === 0 ? null : (
          <div key={label} className="mb-3">
            <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">
              {label}
            </p>
            {items.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={`w-full truncate rounded-md px-2 py-1.5 text-left text-sm ${
                  s.id === activeId
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-accent/50'
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>
        ),
      )}
    </div>
  );
}
