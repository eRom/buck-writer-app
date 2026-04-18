import { createFileRoute } from '@tanstack/react-router';
import { useMcpQuery } from '@/hooks/use-mcp';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export const Route = createFileRoute('/')({ component: Dashboard });

interface BibleStatsResponse {
  entities?: {
    characters?: number;
    locations?: number;
    events?: number;
    interactions?: number;
    notes?: number;
    research?: number;
    worldRules?: number;
  };
  totalEntities?: number;
  totalEmbeddings?: number;
}

const STATS_DISPLAY = [
  { key: 'characters', label: 'Personnages', color: 'text-blue-400' },
  { key: 'locations', label: 'Lieux', color: 'text-emerald-400' },
  { key: 'events', label: 'Événements', color: 'text-amber-400' },
  { key: 'interactions', label: 'Interactions', color: 'text-gray-400' },
  { key: 'notes', label: 'Notes', color: 'text-cyan-400' },
  { key: 'research', label: 'Recherches', color: 'text-violet-400' },
  { key: 'worldRules', label: 'Règles', color: 'text-pink-400' },
] as const;

function Dashboard() {
  const { data, isLoading } = useMcpQuery<BibleStatsResponse>('get_bible_stats');
  const entities = data?.entities;

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {STATS_DISPLAY.map(({ key, label, color }) => (
          <Card key={key} className="border-card-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <span className={`text-3xl font-bold ${color}`}>
                {isLoading ? '…' : (entities?.[key] ?? 0)}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
