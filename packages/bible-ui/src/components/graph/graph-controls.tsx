import { useCallback, useState } from 'react';
import { useSigma, useCamera } from '@react-sigma/core';
import { ENTITY_COLORS, ENTITY_LABELS, type EntityType } from '@/hooks/use-graph';
import { Button } from '@/components/ui/button';

const ALL_TYPES: EntityType[] = ['character', 'location', 'event', 'interaction'];

export function GraphControls() {
  const sigma = useSigma();
  const camera = useCamera();
  const [hidden, setHidden] = useState<Set<EntityType>>(new Set());

  const toggle = useCallback(
    (type: EntityType) => {
      setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(type)) next.delete(type);
        else next.add(type);

        const graph = sigma.getGraph();
        graph.forEachNode((nodeId, attrs) => {
          const t = attrs.entityType as EntityType;
          graph.setNodeAttribute(nodeId, 'hidden', next.has(t));
        });
        graph.forEachEdge((edgeId) => {
          const [source, target] = graph.extremities(edgeId);
          const sType = graph.getNodeAttribute(source, 'entityType') as EntityType;
          const tType = graph.getNodeAttribute(target, 'entityType') as EntityType;
          graph.setEdgeAttribute(edgeId, 'hidden', next.has(sType) || next.has(tType));
        });
        sigma.refresh();
        return next;
      });
    },
    [sigma],
  );

  return (
    <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
      <div className="flex flex-col gap-1 rounded-lg bg-card border border-border p-2">
        <Button variant="ghost" size="sm" onClick={() => camera.zoomIn({ duration: 300 })} title="Zoom avant">+</Button>
        <Button variant="ghost" size="sm" onClick={() => camera.zoomOut({ duration: 300 })} title="Zoom arrière">−</Button>
        <div className="my-1 border-t border-border" />
        <Button variant="ghost" size="sm" onClick={() => camera.reset({ duration: 300 })} title="Recentrer">
          Recentrer
        </Button>
      </div>

      <div className="rounded-lg bg-card border border-border p-2 min-w-[160px]">
        <div className="mb-1.5 text-xs font-semibold text-muted-foreground">Filtres</div>
        {ALL_TYPES.map((type) => (
          <label
            key={type}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm transition-colors hover:bg-accent"
          >
            <input
              type="checkbox"
              checked={!hidden.has(type)}
              onChange={() => toggle(type)}
              className="h-3.5 w-3.5 accent-primary"
            />
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: ENTITY_COLORS[type] }}
            />
            <span className="text-foreground">{ENTITY_LABELS[type]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
