import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import type { SettingsResponse, UsageResponse } from '@buck/shared';
import { fetchSettings, updateSettings, fetchUsageCurrent } from '@/lib/settings';
import { cn } from '@/lib/utils';

const MONTH_NAMES = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
];

export function BudgetSection() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [limitInput, setLimitInput] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchSettings(), fetchUsageCurrent()]).then(([s, u]) => {
      setSettings(s);
      setUsage(u);
      setLimitInput(String(s.monthlyCostLimitUsd));
      setLoading(false);
    });
  }, []);

  async function handleLimitBlur() {
    const value = parseFloat(limitInput);
    if (isNaN(value) || value < 1) {
      setLimitInput(String(settings?.monthlyCostLimitUsd ?? 20));
      return;
    }
    try {
      const updated = await updateSettings({ monthlyCostLimitUsd: value });
      setSettings(updated);
      setUsage(await fetchUsageCurrent());
      toast.success('Limite mise a jour');
    } catch {
      toast.error('Erreur lors de la mise a jour');
      setLimitInput(String(settings?.monthlyCostLimitUsd ?? 20));
    }
  }

  async function handleResetDayChange(day: number) {
    try {
      const updated = await updateSettings({ billingResetDay: day });
      setSettings(updated);
      setUsage(await fetchUsageCurrent());
      toast.success('Jour de reset mis a jour');
    } catch {
      toast.error('Erreur lors de la mise a jour');
    }
  }

  async function handleHardStopToggle() {
    if (!settings) return;
    try {
      const updated = await updateSettings({ hardStop: !settings.hardStop });
      setSettings(updated);
      toast.success(updated.hardStop ? 'Hard stop active' : 'Hard stop desactive');
    } catch {
      toast.error('Erreur lors de la mise a jour');
    }
  }

  if (loading || !settings || !usage) {
    return (
      <section className="rounded-xl border border-card-border bg-card p-6">
        <h2 className="text-lg font-semibold">Budget</h2>
        <p className="mt-4 text-sm text-muted-foreground">Chargement...</p>
      </section>
    );
  }

  const periodDate = new Date(usage.periodStart);
  const monthLabel = `${MONTH_NAMES[periodDate.getUTCMonth()]} ${periodDate.getUTCFullYear()}`;
  const barPercent = Math.min(usage.percent, 100);
  const barColor =
    usage.percent >= 100 ? 'bg-destructive' : usage.percent >= 80 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <section className="rounded-xl border border-card-border bg-card p-6">
      <h2 className="text-lg font-semibold">Budget</h2>
      <p className="mt-1 text-sm text-muted-foreground">Suivi et configuration du budget mensuel.</p>

      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Budget {monthLabel}</div>
            <div className="text-2xl font-semibold">
              <span className="text-primary">${usage.totalUsd.toFixed(2)}</span>
              <span className="text-base text-muted-foreground"> / ${usage.limitUsd.toFixed(2)}</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">Reset dans {usage.daysRemaining} jours</div>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full transition-all', barColor)} style={{ width: `${barPercent}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>0%</span>
          <span>80%</span>
          <span>100%</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground">Chat</span>
            <span className="font-mono">${usage.byKind.chat.toFixed(2)}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground">Live</span>
            <span className="font-mono">${usage.byKind.realtime.toFixed(2)}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground">Mémoire</span>
            <span className="font-mono">${usage.byKind.memory.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-4 border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm">Limite mensuelle</div>
            <div className="text-xs text-muted-foreground">Budget maximum par periode</div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">$</span>
            <input
              type="text"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              onBlur={handleLimitBlur}
              onKeyDown={(e) => e.key === 'Enter' && handleLimitBlur()}
              className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right text-sm"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm">Jour de reset</div>
            <div className="text-xs text-muted-foreground">Cale sur le cycle de facturation OpenAI</div>
          </div>
          <select
            value={settings.billingResetDay}
            onChange={(e) => handleResetDayChange(parseInt(e.target.value))}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d === 1 ? '1er du mois' : `${d} du mois`}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm">Hard stop</div>
            <div className="text-xs text-muted-foreground">Bloquer le chat quand le budget est atteint</div>
          </div>
          <button
            type="button"
            onClick={handleHardStopToggle}
            aria-pressed={settings.hardStop}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors',
              settings.hardStop ? 'bg-primary' : 'bg-muted',
            )}
          >
            <div
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-background transition-transform',
                settings.hardStop ? 'translate-x-5' : 'translate-x-0.5',
              )}
            />
          </button>
        </div>
      </div>
    </section>
  );
}
