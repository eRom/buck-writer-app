import { createFileRoute } from '@tanstack/react-router';
import { useGraph } from '@/hooks/use-graph';
import { GraphView } from '@/components/graph/graph-view';

export const Route = createFileRoute('/graph')({ component: GraphPage });

function GraphPage() {
  const { data, isLoading } = useGraph();
  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border px-8 py-4">
        <h1 className="text-2xl font-bold">Graph</h1>
        {isLoading && <p className="text-xs text-muted-foreground">Chargement…</p>}
      </header>
      <div className="flex-1 min-h-0">{!isLoading && <GraphView data={data} />}</div>
    </div>
  );
}
