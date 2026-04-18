// Entités Bible — portées depuis barda-mcp-ecrivain-bible/packages/ui/src/types
// Le bible-mcp expose des records SQLite ; les champs nullables côté DB sont
// modélisés en `string | null`. Les timestamps sont des epoch (ms ou s selon
// la table — le client traite l'opacité).

export type EntityType =
  | 'character'
  | 'location'
  | 'event'
  | 'interaction'
  | 'world-rule'
  | 'research'
  | 'note';

export interface Character {
  id: string;
  name: string;
  description: string | null;
  traits: string | null;
  background: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface Location {
  id: string;
  name: string;
  description: string | null;
  atmosphere: string | null;
  geography: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface Event {
  id: string;
  title: string;
  description: string | null;
  chapter: string | null;
  sort_order: number | null;
  location_id: string | null;
  characters: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface Interaction {
  id: string;
  description: string;
  nature: string | null;
  characters: string;
  chapter: string | null;
  sort_order: number | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface WorldRule {
  id: string;
  category: string;
  title: string;
  description: string;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface Research {
  id: string;
  topic: string;
  content: string;
  sources: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface Note {
  id: string;
  content: string;
  tags: string | null;
  created_at: number;
  updated_at: number;
}

export type AnyEntity =
  | Character
  | Location
  | Event
  | Interaction
  | WorldRule
  | Research
  | Note;

export interface BibleStats {
  entities: {
    characters: number;
    locations: number;
    events: number;
    interactions: number;
    worldRules: number;
    research: number;
    notes: number;
    embeddings: number;
  };
  totalEntities: number;
  totalEmbeddings: number;
  database: {
    path: string;
    size: number;
    lastModified: string | null;
  };
}
