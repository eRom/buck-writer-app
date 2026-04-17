import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { fetchSettings, updateSettings, fetchUsageCurrent } from '@/lib/settings';
import type { SettingsResponse, UsageResponse } from '@buck/shared';
import { toast } from 'sonner';

export const Route = createFileRoute('/settings/budget')({
  component: SettingsBudget,
});

function SettingsBudget() {
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
      const u = await fetchUsageCurrent();
      setUsage(u);
      toast.success('Limite mise à jour');
    } catch {
      toast.error('Erreur lors de la mise à jour');
      setLimitInput(String(settings?.monthlyCostLimitUsd ?? 20));
    }
  }

  async function handleResetDayChange(day: number) {
    try {
      const updated = await updateSettings({ billingResetDay: day });
      setSettings(updated);
      const u = await fetchUsageCurrent();
      setUsage(u);
      toast.success('Jour de reset mis à jour');
    } catch {
      toast.error('Erreur lors de la mise à jour');
    }
  }

  async function handleHardStopToggle() {
    if (!settings) return;
    try {
      const updated = await updateSettings({ hardStop: !settings.hardStop });
      setSettings(updated);
      toast.success(updated.hardStop ? 'Hard stop activé' : 'Hard stop désactivé');
    } catch {
      toast.error('Erreur lors de la mise à jour');
    }
  }

  if (loading || !settings || !usage) {
    return <div className="text-muted-foreground">Chargement...</div>;
  }

  const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const periodDate = new Date(usage.periodStart);
  const monthLabel = `${monthNames[periodDate.getUTCMonth()]} ${periodDate.getUTCFullYear()}`;

  const barPercent = Math.min(usage.percent, 100);
  const barColor = usage.percent >= 100 ? 'bg-destructive' : usage.percent >= 80 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <>
      <h2 className="mb-6 text-xl font-semibold">Budget</h2>

      {/* Usage display */}
      <div className="mb-8">
        <div className="mb-2 flex items-baseline justify-between">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Budget {monthLabel}</div>
            <div className="text-2xl font-semibold">
              <span className="text-amber-500">${usage.totalUsd.toFixed(2)}</span>
              <span className="text-base text-muted-foreground"> / ${usage.limitUsd.toFixed(2)}</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Reset dans {usage.daysRemaining} jours
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative h-2 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${barPercent}%` }} />
          <div className="absolute left-[80%] top-[-2px] h-3 w-0.5 bg-amber-500/60" />
          <div className="absolute right-0 top-[-2px] h-3 w-0.5 bg-destructive/60" />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>0%</span>
          <span className="ml-auto mr-[16%]">80%</span>
          <span>100%</span>
        </div>
      </div>

      <hr className="my-6 border-border" />

      {/* Configuration */}
      <div className="mb-6">
        <h3 className="mb-4 text-sm font-semibold">Configuration</h3>
        <div className="space-y-4">
          {/* Monthly limit */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm">Limite mensuelle</div>
              <div className="text-xs text-muted-foreground">Budget maximum par période</div>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">$</span>
              <input type="text" value={limitInput} onChange={(e) => setLimitInput(e.target.value)}
                onBlur={handleLimitBlur} onKeyDown={(e) => e.key === 'Enter' && handleLimitBlur()}
                className="w-20 rounded-md border border-border bg-input px-2 py-1 text-right text-sm" />
            </div>
          </div>

          {/* Reset day */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm">Jour de reset</div>
              <div className="text-xs text-muted-foreground">Calé sur le cycle de facturation OpenAI</div>
            </div>
            <select value={settings.billingResetDay} onChange={(e) => handleResetDayChange(parseInt(e.target.value))}
              className="rounded-md border border-border bg-input px-2 py-1 text-sm">
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d === 1 ? '1er du mois' : `${d} du mois`}</option>
              ))}
            </select>
          </div>

          {/* Hard stop toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm">Hard stop</div>
              <div className="text-xs text-muted-foreground">Bloquer le chat quand le budget est atteint</div>
            </div>
            <button onClick={handleHardStopToggle}
              className={`relative h-6 w-11 rounded-full transition-colors ${settings.hardStop ? 'bg-amber-500' : 'bg-muted'}`}>
              <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${settings.hardStop ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>
      </div>

      <hr className="my-6 border-border" />

      {/* Alerts */}
      <div>
        <h3 className="mb-4 text-sm font-semibold">Alertes</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <div className="flex-1">
              <div className="text-sm">80% du budget</div>
              <div className="text-xs text-muted-foreground">Toast d'avertissement</div>
            </div>
            <span className="text-xs text-muted-foreground">warning</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <div className="h-2 w-2 rounded-full bg-destructive" />
            <div className="flex-1">
              <div className="text-sm">100% du budget</div>
              <div className="text-xs text-muted-foreground">Chat bloqué + banner</div>
            </div>
            <span className="text-xs text-destructive">hard stop</span>
          </div>
        </div>
      </div>
    </>
  );
}
