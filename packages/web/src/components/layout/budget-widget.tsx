import { useQuery } from '@tanstack/react-query';
import { fetchSettings, fetchUsageCurrent } from '@/lib/settings';

export function BudgetWidget() {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const { data: usage } = useQuery({ queryKey: ['usage-current'], queryFn: fetchUsageCurrent });

  const limit = settings?.monthlyCostLimitUsd ?? 0;
  const spent = usage?.totalUsd ?? 0;
  const percent = usage?.percent ?? 0;

  return (
    <div className="rounded-md border border-sidebar-border bg-sidebar-accent/30 px-2 py-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-sidebar-foreground/70">Budget</span>
        <span className="font-mono text-sidebar-foreground">
          ${spent.toFixed(2)} / ${limit.toFixed(0)}
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}
