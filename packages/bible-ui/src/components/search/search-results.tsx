import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';

export interface SearchResult {
  entity_id: string;
  entity_type: string;
  snippet?: string;
  entity?: Record<string, unknown> | null;
}

const TYPE_PATH: Record<string, string> = {
  character: '/characters',
  location: '/locations',
  event: '/events',
  note: '/notes',
  research: '/research',
  world_rule: '/world-rules',
  interaction: '/interactions',
};

function getLabel(r: SearchResult): string {
  const e = r.entity ?? {};
  const name = (e.name as string | undefined) ?? (e.title as string | undefined) ?? (e.topic as string | undefined);
  if (name) return name;
  if (r.snippet) {
    // strip <b> tags from FTS snippet
    return r.snippet.replace(/<\/?b>/g, '');
  }
  return r.entity_id;
}

export function SearchResults({ results }: { results: SearchResult[] }) {
  if (results.length === 0) return <p className="text-sm text-muted-foreground">Aucun résultat.</p>;
  return (
    <ul className="space-y-1">
      {results.map((r) => {
        const label = getLabel(r);
        const path = TYPE_PATH[r.entity_type];
        return (
          <li key={`${r.entity_type}-${r.entity_id}`}>
            {path ? (
              // @ts-expect-error dynamic route navigation
              <Link
                to={`${path}/$id`}
                params={{ id: r.entity_id }}
                className="hover-elevate flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                <span className="truncate pr-2">{label}</span>
                <Badge variant="secondary">{r.entity_type}</Badge>
              </Link>
            ) : (
              <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm">
                <span className="truncate pr-2">{label}</span>
                <Badge variant="secondary">{r.entity_type}</Badge>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
