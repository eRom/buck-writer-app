import type { AnyEntity, EntityType } from '@/types/entities';
import { EntityCard } from './entity-card';

export function EntityList({
  entities,
  type,
  onSelect,
  emptyMessage = 'Aucune entité.',
}: {
  entities: AnyEntity[];
  type: EntityType;
  onSelect: (e: AnyEntity) => void;
  emptyMessage?: string;
}) {
  if (entities.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {entities.map((e) => (
        <EntityCard key={e.id} entity={e} type={type} onClick={() => onSelect(e)} />
      ))}
    </div>
  );
}
