import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { AnyEntity, EntityType } from '@/types/entities';

const TYPE_COLOR: Record<EntityType, string> = {
  character: 'bg-blue-500/10 text-blue-400',
  location: 'bg-emerald-500/10 text-emerald-400',
  event: 'bg-amber-500/10 text-amber-400',
  note: 'bg-cyan-500/10 text-cyan-400',
  research: 'bg-violet-500/10 text-violet-400',
  'world-rule': 'bg-pink-500/10 text-pink-400',
  interaction: 'bg-gray-500/10 text-gray-400',
};

// Per-type extractors — schemas vary (name/title/topic/content).
function getTitle(entity: AnyEntity, type: EntityType): string {
  const e = entity as Record<string, unknown>;
  switch (type) {
    case 'event':
    case 'world-rule':
      return (e.title as string) ?? '(sans titre)';
    case 'research':
      return (e.topic as string) ?? '(sans sujet)';
    case 'note': {
      const content = (e.content as string) ?? '';
      return content.slice(0, 60) || '(note vide)';
    }
    case 'interaction': {
      const desc = (e.description as string) ?? '';
      return desc.slice(0, 60) || '(interaction)';
    }
    default:
      return (e.name as string) ?? '(sans nom)';
  }
}

function getDescription(entity: AnyEntity, type: EntityType): string | null {
  const e = entity as Record<string, unknown>;
  if (type === 'research') return (e.content as string) ?? null;
  if (type === 'note') return (e.tags as string) ?? null;
  return (e.description as string) ?? null;
}

export function EntityCard({
  entity,
  type,
  onClick,
}: {
  entity: AnyEntity;
  type: EntityType;
  onClick: () => void;
}) {
  const title = getTitle(entity, type);
  const description = getDescription(entity, type);

  return (
    <Card onClick={onClick} className="cursor-pointer border-card-border hover-elevate">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge className={TYPE_COLOR[type] ?? ''}>{type}</Badge>
      </CardHeader>
      {description && (
        <CardContent className="text-xs text-muted-foreground line-clamp-2">
          {description}
        </CardContent>
      )}
    </Card>
  );
}
