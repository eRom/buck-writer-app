import { useQuery } from '@tanstack/react-query';
import { Sliders } from 'lucide-react';
import { fetchSettings, fetchUsageCurrent } from '@/lib/settings';
import { fetchSessions } from '@/lib/sessions';

interface Props {
  sessionId: string | null;
}

export function CardParametres({ sessionId }: Props) {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const { data: usage } = useQuery({ queryKey: ['usage-current'], queryFn: fetchUsageCurrent });
  const { data: sessionsData } = useQuery({ queryKey: ['sessions'], queryFn: () => fetchSessions() });

  const session = sessionsData?.sessions.find((s) => s.id === sessionId) ?? null;
  const model = session?.model ?? settings?.defaultModel ?? '-';
  const limit = settings?.monthlyCostLimitUsd ?? 0;
  const spent = usage?.totalUsd ?? 0;
  const percent = usage?.percent ?? 0;

  return (
    <section className="rounded-lg border border-card-border bg-card p-3">
      <header className="mb-2 flex items-center gap-1.5">
        <Sliders className="size-3.5 text-muted-foreground" />
        <h3 className="text-[13px] font-semibold">Parametres</h3>
      </header>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between rounded-md border border-border bg-background/40 px-2 py-1.5">
          <span className="text-xs text-muted-foreground">Model</span>
          <span className="font-mono text-[11px]">{model}</span>
        </div>
        <div className="rounded-md border border-border bg-background/40 px-2 py-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Budget mensuel</span>
            <span className="font-mono text-[11px]">
              ${spent.toFixed(2)} / ${limit.toFixed(0)}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-300"
              style={{ width: `${Math.min(100, percent)}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
