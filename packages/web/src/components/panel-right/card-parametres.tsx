import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sliders } from 'lucide-react';
import { MODELS, type ChatModel } from '@buck/shared';
import { fetchSettings, updateSettings, fetchUsageCurrent } from '@/lib/settings';
import { fetchSessions, updateSession, type SessionsResponse } from '@/lib/sessions';

interface Props {
  sessionId: string | null;
}

const MODEL_LABELS: Record<string, string> = {
  'gpt-5.4': 'GPT-5.4',
  'gpt-5.4-mini': 'GPT-5.4 Mini',
  'gpt-5.4-pro': 'GPT-5.4 Pro',
  'gpt-5.4-nano': 'GPT-5.4 Nano',
};

export function CardParametres({ sessionId }: Props) {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const { data: usage } = useQuery({ queryKey: ['usage-current'], queryFn: fetchUsageCurrent });
  const { data: sessionsData } = useQuery({ queryKey: ['sessions'], queryFn: () => fetchSessions() });

  const session = sessionsData?.sessions.find((s) => s.id === sessionId) ?? null;
  const model = session?.model ?? settings?.defaultModel ?? 'gpt-5.4-mini';
  const limit = settings?.monthlyCostLimitUsd ?? 0;
  const spent = usage?.totalUsd ?? 0;
  const percent = usage?.percent ?? 0;

  const mutation = useMutation({
    mutationFn: async (nextModel: ChatModel) => {
      if (session) {
        return updateSession(session.id, { model: nextModel });
      }
      return updateSettings({ defaultModel: nextModel });
    },
    onMutate: async (nextModel) => {
      if (!session) return;
      await qc.cancelQueries({ queryKey: ['sessions'] });
      const prev = qc.getQueriesData<SessionsResponse>({ queryKey: ['sessions'] });
      prev.forEach(([key, value]) => {
        if (!value) return;
        qc.setQueryData<SessionsResponse>(key, {
          ...value,
          sessions: value.sessions.map((s) => (s.id === session.id ? { ...s, model: nextModel } : s)),
        });
      });
      return { prev };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  return (
    <section className="rounded-lg border border-card-border bg-card p-3">
      <header className="mb-2 flex items-center gap-1.5">
        <Sliders className="size-3.5 text-muted-foreground" />
        <h3 className="text-[13px] font-semibold">Parametres</h3>
      </header>
      <div className="space-y-1.5">
        <label className="flex items-center justify-between rounded-md border border-border bg-background/40 px-2 py-1.5">
          <span className="text-xs text-muted-foreground">Model</span>
          <select
            value={model}
            onChange={(e) => mutation.mutate(e.target.value as ChatModel)}
            disabled={mutation.isPending}
            className="bg-transparent font-mono text-[11px] text-foreground focus:outline-none"
          >
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {MODEL_LABELS[m] ?? m}
              </option>
            ))}
          </select>
        </label>
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
