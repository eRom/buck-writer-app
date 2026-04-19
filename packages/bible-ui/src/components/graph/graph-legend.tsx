import { ENTITY_COLORS, ENTITY_LABELS, type EntityType } from '@/hooks/use-graph';

const ITEMS: EntityType[] = ['character', 'location', 'event', 'interaction'];

export function GraphLegend() {
  return (
    <div className="absolute bottom-4 left-4 z-10 rounded-lg bg-card border border-border px-3 py-2">
      <div className="mb-1.5 text-xs font-semibold text-muted-foreground">Légende</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {ITEMS.map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: ENTITY_COLORS[type] }} />
            <span className="text-xs text-foreground">{ENTITY_LABELS[type]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
