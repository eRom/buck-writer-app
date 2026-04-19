import { useEffect } from 'react';
import { SigmaContainer, useLoadGraph } from '@react-sigma/core';
import '@react-sigma/core/lib/style.css';
import type Graph from 'graphology';
import { GraphEvents } from './graph-events';
import { GraphLayout } from './graph-layout';
import { GraphControls } from './graph-controls';
import { GraphLegend } from './graph-legend';
import { GraphHighlighter } from './graph-highlighter';
import type { GraphNode } from '@/hooks/use-graph';

function GraphLoader({ graph }: { graph: Graph }) {
  const loadGraph = useLoadGraph();
  useEffect(() => {
    loadGraph(graph);
  }, [loadGraph, graph]);
  return null;
}

interface GraphViewProps {
  graph: Graph;
  onSelectNode: (n: GraphNode | null) => void;
  selectedNodeId?: string | null;
}

export function GraphView({ graph, onSelectNode, selectedNodeId }: GraphViewProps) {
  return (
    <SigmaContainer
      className="h-full w-full"
      style={{ backgroundColor: '#0c0a09' }}
      settings={{
        renderLabels: true,
        labelSize: 12,
        labelWeight: 'bold',
        labelColor: { color: '#fafaf9' },
        labelRenderedSizeThreshold: 6,
        defaultEdgeColor: '#52525b',
        defaultEdgeType: 'line',
        edgeReducer: (_edge, data) => ({
          ...data,
          color: data.color || '#52525b',
          size: data.size || 0.5,
        }),
        nodeReducer: (_node, data) => ({ ...data }),
        allowInvalidContainer: true,
      }}
    >
      <GraphLoader graph={graph} />
      <GraphEvents onSelectNode={onSelectNode} />
      <GraphLayout />
      <GraphControls />
      <GraphLegend />
      <GraphHighlighter selectedNodeId={selectedNodeId ?? null} />
    </SigmaContainer>
  );
}
