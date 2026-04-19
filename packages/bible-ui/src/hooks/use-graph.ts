import { useMemo, useState } from 'react';
import Graph from 'graphology';
import { useMcpQuery } from './use-mcp';

export type EntityType = 'character' | 'location' | 'event' | 'interaction';

export const ENTITY_COLORS: Record<EntityType, string> = {
  character: '#3B82F6',
  location: '#10B981',
  event: '#F59E0B',
  interaction: '#8B5CF6',
};

export const ENTITY_SIZES: Record<EntityType, number> = {
  character: 15,
  location: 12,
  event: 10,
  interaction: 8,
};

export const ENTITY_LABELS: Record<EntityType, string> = {
  character: 'Personnages',
  location: 'Lieux',
  event: 'Événements',
  interaction: 'Interactions',
};

export interface GraphNode {
  id: string;
  label: string;
  type: EntityType;
  description?: string | null;
}

interface CharacterRow { id: string; name?: string; description?: string }
interface LocationRow { id: string; name?: string; description?: string }
interface EventRow { id: string; title?: string; description?: string; locationId?: string; location_id?: string; characters?: string }
interface InteractionRow { id: string; description?: string; characters?: string }

// MCP list_* tools return { characters: [] } | { events: [] } | { results: [] }
// Pick the first array value found.
function extractArray<T>(data: unknown): T[] {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data)) return data as T[];
  for (const v of Object.values(data as Record<string, unknown>)) {
    if (Array.isArray(v)) return v as T[];
  }
  return [];
}

function parseIds(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === 'string');
  } catch {
    /* fall through */
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function useGraph() {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const charactersQ = useMcpQuery<unknown>('list_characters', { limit: 200 });
  const locationsQ = useMcpQuery<unknown>('list_locations', { limit: 200 });
  const eventsQ = useMcpQuery<unknown>('list_events', { limit: 200 });
  const interactionsQ = useMcpQuery<unknown>('list_interactions', { limit: 200 });

  const isLoading =
    charactersQ.isLoading || locationsQ.isLoading || eventsQ.isLoading || interactionsQ.isLoading;

  const graph = useMemo(() => {
    const g = new Graph({ multi: false, type: 'undirected' });

    const chars = extractArray<CharacterRow>(charactersQ.data);
    const locs = extractArray<LocationRow>(locationsQ.data);
    const evts = extractArray<EventRow>(eventsQ.data);
    const inters = extractArray<InteractionRow>(interactionsQ.data);

    const addNode = (id: string, label: string, type: EntityType, description?: string | null) => {
      if (g.hasNode(id)) return;
      g.addNode(id, {
        label,
        entityType: type,
        color: ENTITY_COLORS[type],
        size: ENTITY_SIZES[type],
        description: description ?? null,
        x: Math.random() * 100,
        y: Math.random() * 100,
      });
    };

    chars.forEach((c) => addNode(c.id, c.name ?? c.id, 'character', c.description));
    locs.forEach((l) => addNode(l.id, l.name ?? l.id, 'location', l.description));
    evts.forEach((e) => addNode(e.id, e.title ?? e.id, 'event', e.description));
    inters.forEach((i) => {
      const desc = i.description ?? '';
      const label = desc.length > 40 ? desc.slice(0, 40) + '…' : desc || i.id;
      addNode(i.id, label, 'interaction', desc);
    });

    const addEdge = (key: string, source: string, target: string, color = '#52525b', size = 0.8) => {
      if (source === target) return;
      if (!g.hasNode(source) || !g.hasNode(target)) return;
      if (g.hasEdge(key)) return;
      g.addEdgeWithKey(key, source, target, { color, size });
    };

    inters.forEach((i) => {
      const ids = parseIds(i.characters);
      // Clique character ↔ character
      for (let a = 0; a < ids.length; a++) {
        for (let b = a + 1; b < ids.length; b++) {
          addEdge(`int-${i.id}-${a}-${b}`, ids[a]!, ids[b]!, '#4B5563', 1);
        }
      }
      // interaction node → each character
      ids.forEach((cid, k) => addEdge(`ilink-${i.id}-${k}`, i.id, cid, '#6B7280', 0.5));
    });

    evts.forEach((ev) => {
      parseIds(ev.characters).forEach((cid, k) =>
        addEdge(`evt-char-${ev.id}-${k}`, ev.id, cid, '#6B7280', 0.5),
      );
      const locId = ev.locationId ?? ev.location_id;
      if (locId) addEdge(`evt-loc-${ev.id}`, ev.id, locId, '#6B7280', 0.5);
    });

    return g;
  }, [charactersQ.data, locationsQ.data, eventsQ.data, interactionsQ.data]);

  return { graph, isLoading, selectedNode, setSelectedNode };
}
