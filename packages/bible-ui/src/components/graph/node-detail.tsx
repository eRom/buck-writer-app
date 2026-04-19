import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type Graph from 'graphology';
import { X } from 'lucide-react';
import { ENTITY_COLORS, ENTITY_LABELS, type GraphNode, type EntityType } from '@/hooks/use-graph';
import { Button } from '@/components/ui/button';

const ROUTE_BY_TYPE: Record<EntityType, string> = {
  character: '/characters',
  location: '/locations',
  event: '/events',
  interaction: '/interactions',
};

interface NodeDetailProps {
  node: GraphNode;
  graph: Graph;
  onClose: () => void;
  onSelectNode: (node: GraphNode) => void;
}

export function NodeDetail({ node, graph, onClose, onSelectNode }: NodeDetailProps) {
  const navigate = useNavigate();

  const neighbors = useMemo(() => {
    if (!graph.hasNode(node.id)) return [];
    return graph.mapNeighbors(node.id, (id, attrs) => ({
      id,
      label: attrs.label as string,
      type: attrs.entityType as EntityType,
      description: (attrs.description as string | null) ?? null,
    }));
  }, [graph, node.id]);

  const description = node.description
    ? node.description.length > 220
      ? node.description.slice(0, 220) + '…'
      : node.description
    : null;

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-card">
      <div className="flex items-start justify-between border-b border-border p-4">
        <div className="min-w-0 flex-1">
          <span
            className="mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: ENTITY_COLORS[node.type] }}
          >
            {ENTITY_LABELS[node.type]}
          </span>
          <h3 className="truncate text-lg font-semibold text-foreground">{node.label}</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer" className="ml-2 h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {description && <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{description}</p>}

        <Button
          variant="secondary"
          className="mb-6 w-full"
          onClick={() => navigate({ to: `${ROUTE_BY_TYPE[node.type]}/$id`, params: { id: node.id } })}
        >
          Voir la fiche complète
        </Button>

        {neighbors.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Connexions ({neighbors.length})
            </h4>
            <ul className="space-y-1">
              {neighbors.map((n) => (
                <li
                  key={n.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-accent"
                  onClick={() => onSelectNode(n)}
                >
                  <span
                    className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: ENTITY_COLORS[n.type] }}
                  />
                  <span className="truncate text-sm text-foreground">{n.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{ENTITY_LABELS[n.type]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
