import { useEffect } from 'react';
import { SigmaContainer, useLoadGraph } from '@react-sigma/core';
import Graph from 'graphology';
import '@react-sigma/core/lib/style.css';
import type { GraphData } from '@/hooks/use-graph';

function LoadGraph({ data }: { data: GraphData }) {
  const loadGraph = useLoadGraph();
  useEffect(() => {
    const g = new Graph();
    data.nodes.forEach((n) => {
      g.addNode(n.id, {
        label: n.label,
        color: n.color,
        size: 8,
        x: Math.random(),
        y: Math.random(),
      });
    });
    data.edges.forEach((e) => {
      if (g.hasNode(e.source) && g.hasNode(e.target)) {
        g.addEdgeWithKey(e.id, e.source, e.target, { label: e.label, color: '#3f3f46' });
      }
    });
    loadGraph(g);
  }, [data, loadGraph]);
  return null;
}

export function GraphView({ data }: { data: GraphData }) {
  return (
    <SigmaContainer
      style={{ height: '100%', width: '100%', background: 'transparent' }}
      settings={{
        renderEdgeLabels: true,
        defaultEdgeColor: '#3f3f46',
        labelColor: { color: '#fafaf9' },
      }}
    >
      <LoadGraph data={data} />
    </SigmaContainer>
  );
}
