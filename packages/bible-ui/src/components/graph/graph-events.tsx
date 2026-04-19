import { useEffect } from 'react';
import { useRegisterEvents, useSigma } from '@react-sigma/core';
import type { GraphNode, EntityType } from '@/hooks/use-graph';

export function GraphEvents({ onSelectNode }: { onSelectNode: (n: GraphNode | null) => void }) {
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();

  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => {
        const attrs = sigma.getGraph().getNodeAttributes(node);
        onSelectNode({
          id: node,
          label: attrs.label as string,
          type: attrs.entityType as EntityType,
          description: (attrs.description as string | null) ?? null,
        });
      },
      clickStage: () => onSelectNode(null),
    });
  }, [registerEvents, sigma, onSelectNode]);

  return null;
}
