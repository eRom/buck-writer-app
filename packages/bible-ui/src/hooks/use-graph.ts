import { useMcpQuery } from './use-mcp';

interface GraphEntity {
  id: string;
  title?: string;
  name?: string;
}

interface InteractionEntity {
  id: string;
  description?: string;
  characters?: string;
}

interface EventEntity extends GraphEntity {
  locationId?: string;
  characters?: string;
}

// MCP list_* tools return inconsistent shapes:
//   list_characters → { characters: [...] }
//   list_events     → { events: [...] }
//   list_locations  → { results: [...] }
//   list_interactions → { results: [...] }
// We accept both keys to stay resilient to upstream changes.
interface CharactersResponse {
  total?: number;
  characters?: GraphEntity[];
  results?: GraphEntity[];
}
interface LocationsResponse {
  total?: number;
  locations?: GraphEntity[];
  results?: GraphEntity[];
}
interface EventsResponse {
  total?: number;
  events?: EventEntity[];
  results?: EventEntity[];
}
interface InteractionsResponse {
  total?: number;
  interactions?: InteractionEntity[];
  results?: InteractionEntity[];
}

export interface GraphData {
  nodes: Array<{ id: string; label: string; type: string; color: string }>;
  edges: Array<{ id: string; source: string; target: string; label?: string }>;
}

const COLORS: Record<string, string> = {
  character: '#60a5fa',
  location: '#34d399',
  event: '#fbbf24',
  note: '#22d3ee',
  research: '#a78bfa',
  world_rule: '#f472b6',
};

function getLabel(e: GraphEntity): string {
  return e.name ?? e.title ?? e.id;
}

function parseIds(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === 'string');
  } catch {
    // fallback: CSV
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function useGraph(): { data: GraphData; isLoading: boolean } {
  const charactersQ = useMcpQuery<CharactersResponse>('list_characters');
  const locationsQ = useMcpQuery<LocationsResponse>('list_locations');
  const eventsQ = useMcpQuery<EventsResponse>('list_events');
  const interactionsQ = useMcpQuery<InteractionsResponse>('list_interactions');

  const isLoading =
    charactersQ.isLoading || locationsQ.isLoading || eventsQ.isLoading || interactionsQ.isLoading;

  const characters = charactersQ.data?.characters ?? charactersQ.data?.results ?? [];
  const locations = locationsQ.data?.locations ?? locationsQ.data?.results ?? [];
  const events = eventsQ.data?.events ?? eventsQ.data?.results ?? [];
  const interactions = interactionsQ.data?.interactions ?? interactionsQ.data?.results ?? [];

  const nodes: GraphData['nodes'] = [
    ...characters.map((e) => ({ id: e.id, label: getLabel(e), type: 'character', color: COLORS.character! })),
    ...locations.map((e) => ({ id: e.id, label: getLabel(e), type: 'location', color: COLORS.location! })),
    ...events.map((e) => ({ id: e.id, label: getLabel(e), type: 'event', color: COLORS.event! })),
  ];

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: GraphData['edges'] = [];
  const seen = new Set<string>();
  const pushEdge = (id: string, source: string, target: string, label?: string) => {
    if (!nodeIds.has(source) || !nodeIds.has(target) || source === target) return;
    if (seen.has(id)) return;
    seen.add(id);
    edges.push({ id, source, target, label });
  };

  // Interaction → clique between participants (n*(n-1)/2 edges)
  interactions.forEach((i) => {
    const ids = parseIds(i.characters);
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        pushEdge(`int-${i.id}-${a}-${b}`, ids[a]!, ids[b]!, i.description?.slice(0, 30));
      }
    }
  });

  // Event → location and event → each character present
  events.forEach((e) => {
    if (e.locationId) {
      pushEdge(`evt-loc-${e.id}`, e.id, e.locationId, 'lieu');
    }
    parseIds(e.characters).forEach((cid, k) => {
      pushEdge(`evt-char-${e.id}-${k}`, e.id, cid, 'présent');
    });
  });

  return { data: { nodes, edges }, isLoading };
}
