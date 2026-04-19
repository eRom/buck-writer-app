import { createFileRoute } from '@tanstack/react-router';
import { useGraph } from '@/hooks/use-graph';
import { GraphView } from '@/components/graph/graph-view';
import { NodeDetail } from '@/components/graph/node-detail';

export const Route = createFileRoute('/graph')({ component: GraphPage });

function GraphPage() {
  const { graph, isLoading, selectedNode, setSelectedNode } = useGraph();

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border px-8 py-4">
        <h1 className="text-2xl font-bold">Graph</h1>
        {isLoading && <p className="text-xs text-muted-foreground">Chargement…</p>}
      </header>
      <div className="flex-1 min-h-0 flex">
        {!isLoading && graph.order > 0 && (
          <>
            <div className="relative flex-1 min-w-0">
              <GraphView
                graph={graph}
                onSelectNode={setSelectedNode}
                selectedNodeId={selectedNode?.id}
              />
            </div>
            {selectedNode && (
              <NodeDetail
                node={selectedNode}
                graph={graph}
                onClose={() => setSelectedNode(null)}
                onSelectNode={setSelectedNode}
              />
            )}
          </>
        )}
        {!isLoading && graph.order === 0 && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Aucune entité dans la bible
          </div>
        )}
      </div>
    </div>
  );
}
