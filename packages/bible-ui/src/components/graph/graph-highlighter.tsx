import { useEffect } from 'react';
import { useSigma } from '@react-sigma/core';

export function GraphHighlighter({ selectedNodeId }: { selectedNodeId: string | null }) {
  const sigma = useSigma();

  useEffect(() => {
    const camera = sigma.getCamera();
    const cameraState = camera.getState();

    if (!selectedNodeId) {
      sigma.setSetting('nodeReducer', (_n, data) => ({ ...data }));
      sigma.setSetting('edgeReducer', (_e, data) => ({
        ...data,
        color: data.color || '#52525b',
        size: data.size || 0.5,
      }));
      sigma.refresh();
      camera.setState(cameraState);
      return;
    }

    const graph = sigma.getGraph();
    if (!graph.hasNode(selectedNodeId)) return;

    const connectedNodes = new Set<string>([selectedNodeId]);
    graph.forEachNeighbor(selectedNodeId, (n) => connectedNodes.add(n));

    const connectedEdges = new Set<string>();
    graph.forEachEdge(selectedNodeId, (edge) => connectedEdges.add(edge));

    sigma.setSetting('nodeReducer', (node, data) => {
      if (connectedNodes.has(node)) {
        return {
          ...data,
          size: node === selectedNodeId ? (data.size ?? 10) * 1.4 : data.size,
          zIndex: 1,
        };
      }
      return {
        ...data,
        color: '#27272a',
        size: (data.size ?? 10) * 0.6,
        label: '',
        zIndex: 0,
      };
    });

    sigma.setSetting('edgeReducer', (edge, data) => {
      if (connectedEdges.has(edge)) {
        return { ...data, color: '#a1a1aa', size: 1.8, zIndex: 1 };
      }
      return { ...data, color: '#18181b', size: 0.2, zIndex: 0 };
    });

    sigma.refresh();
    camera.setState(cameraState);
  }, [sigma, selectedNodeId]);

  return null;
}
