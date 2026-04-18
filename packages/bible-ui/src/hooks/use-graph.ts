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

interface ListResponse<K extends string, T> {
  total?: number;
}

type CharactersResponse = ListResponse<'characters', GraphEntity> & { characters?: GraphEntity[] };
type LocationsResponse = ListResponse<'locations', GraphEntity> & { locations?: GraphEntity[] };
type EventsResponse = ListResponse<'events', GraphEntity> & { events?: GraphEntity[] };
type InteractionsResponse = ListResponse<'interactions', InteractionEntity> & {
  interactions?: InteractionEntity[];
};

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

  const characters = charactersQ.data?.characters ?? [];
  const locations = locationsQ.data?.locations ?? [];
  const events = eventsQ.data?.events ?? [];
  const interactions = interactionsQ.data?.interactions ?? [];

  const nodes: GraphData['nodes'] = [
    ...characters.map((e) => ({ id: e.id, label: getLabel(e), type: 'character', color: COLORS.character! })),
    ...locations.map((e) => ({ id: e.id, label: getLabel(e), type: 'location', color: COLORS.location! })),
    ...events.map((e) => ({ id: e.id, label: getLabel(e), type: 'event', color: COLORS.event! })),
  ];

  const edges: GraphData['edges'] = [];
  interactions.forEach((i) => {
    const ids = parseIds(i.characters);
    if (ids.length >= 2) {
      for (let k = 0; k < ids.length - 1; k++) {
        edges.push({
          id: `${i.id}-${k}`,
          source: ids[k]!,
          target: ids[k + 1]!,
          label: i.description?.slice(0, 30),
        });
      }
    }
  });

  return { data: { nodes, edges }, isLoading };
}
