import { createFileRoute } from '@tanstack/react-router';
import { useMcpQuery } from '@/hooks/use-mcp';

interface TimelineEvent {
  id: string;
  title?: string;
  description?: string;
  chapter?: string;
  sortOrder?: number;
  locationName?: string;
}

interface TimelineResponse {
  total?: number;
  timeline?: TimelineEvent[];
}

export const Route = createFileRoute('/timeline')({ component: Timeline });

function Timeline() {
  const { data, isLoading } = useMcpQuery<TimelineResponse>('get_timeline');
  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;

  const events = data?.timeline ?? [];

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Timeline</h1>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun événement.</p>
      ) : (
        <ol className="relative border-l border-border ml-2 space-y-6">
          {events.map((e) => (
            <li key={e.id} className="ml-6">
              <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full bg-amber-500/40 ring-4 ring-background" />
              <time className="text-xs font-mono text-muted-foreground">{e.chapter ?? '—'}</time>
              <h3 className="text-sm font-semibold mt-0.5">{e.title ?? '(sans titre)'}</h3>
              {e.locationName && (
                <p className="text-xs text-muted-foreground mt-0.5">{e.locationName}</p>
              )}
              {e.description && (
                <p className="text-xs text-muted-foreground mt-1">{e.description}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
