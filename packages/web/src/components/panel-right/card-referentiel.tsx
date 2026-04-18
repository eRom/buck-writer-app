import { BookOpen } from 'lucide-react';
import { useBibleStatus } from '@/lib/mcp';

export function CardReferentiel() {
  const { data } = useBibleStatus();
  const healthy = data?.healthy ?? false;

  return (
    <section className="rounded-lg border border-card-border bg-card p-3">
      <header className="mb-2 flex items-center gap-1.5">
        <BookOpen className="size-3.5 text-muted-foreground" />
        <h3 className="text-[13px] font-semibold">Referentiel</h3>
      </header>
      <div className="flex items-center justify-between rounded-md border border-border bg-background/40 px-2 py-1.5">
        <div className="flex flex-col">
          <span className="text-xs">Bible MCP</span>
          <span className="text-[10px] text-muted-foreground">
            {healthy ? `actif · ${data?.toolCount ?? 0} outils` : 'indisponible'}
          </span>
        </div>
        <span
          className={
            healthy
              ? 'inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400'
              : 'inline-flex items-center rounded-md bg-gray-500/10 px-2 py-0.5 text-[10px] font-medium text-gray-400'
          }
        >
          {healthy ? 'on' : 'off'}
        </span>
      </div>
    </section>
  );
}
