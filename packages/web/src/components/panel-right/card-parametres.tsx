import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Sliders } from 'lucide-react';
import { useState } from 'react';
import { type ChatModel } from '@buck/shared';
import { fetchSettings, updateSettings, fetchUsageCurrent } from '@/lib/settings';
import {
  fetchSessions,
  updateSession,
  type SessionsResponse,
  type ReasoningEffort,
} from '@/lib/sessions';

const MODEL_ORDER: Array<{ id: ChatModel; label: string; disabled?: boolean }> = [
  { id: 'gpt-5.4-nano', label: 'GPT-5.4 Nano' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  { id: 'gpt-5.4', label: 'GPT-5.4' },
  { id: 'gpt-5.4-pro', label: 'GPT-5.4 Pro', disabled: true },
];

interface Props {
  sessionId: string | null;
}

const EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high'];
const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  low: 'Bas',
  medium: 'Moyen',
  high: 'Eleve',
};

export function CardParametres({ sessionId }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const { data: usage } = useQuery({ queryKey: ['usage-current'], queryFn: fetchUsageCurrent });
  const { data: sessionsData } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetchSessions(),
  });

  const session = sessionsData?.sessions.find((s) => s.id === sessionId) ?? null;
  const model = session?.model ?? settings?.defaultModel ?? 'gpt-5.4-mini';
  const effort: ReasoningEffort =
    session?.reasoningEffort ??
    (settings?.defaultReasoningEffort as ReasoningEffort | undefined) ??
    'medium';
  const limit = settings?.monthlyCostLimitUsd ?? 0;
  const spent = usage?.totalUsd ?? 0;
  const percent = usage?.percent ?? 0;

  const modelMutation = useMutation({
    mutationFn: async (nextModel: ChatModel) => {
      if (session) return updateSession(session.id, { model: nextModel });
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
          sessions: value.sessions.map((s) =>
            s.id === session.id ? { ...s, model: nextModel } : s,
          ),
        });
      });
      return { prev };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const effortMutation = useMutation({
    mutationFn: async (next: ReasoningEffort) => {
      if (session) return updateSession(session.id, { reasoningEffort: next });
      return updateSettings({ defaultReasoningEffort: next });
    },
    onMutate: async (next) => {
      if (!session) return;
      await qc.cancelQueries({ queryKey: ['sessions'] });
      const prev = qc.getQueriesData<SessionsResponse>({ queryKey: ['sessions'] });
      prev.forEach(([key, value]) => {
        if (!value) return;
        qc.setQueryData<SessionsResponse>(key, {
          ...value,
          sessions: value.sessions.map((s) =>
            s.id === session.id ? { ...s, reasoningEffort: next } : s,
          ),
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
      <header className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Replier' : 'Deployer'}
          className="hover-elevate rounded-md p-0.5 text-muted-foreground"
        >
          {open ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </button>
        <Sliders className="size-3.5 text-muted-foreground" />
        <h3 className="text-[13px] font-semibold">Parametres</h3>
      </header>
      {open && (
      <div className="mt-2 space-y-1.5">
        <label className="flex items-center justify-between rounded-md border border-border bg-background/40 px-2 py-1.5">
          <span className="text-xs text-muted-foreground">Modèle</span>
          <select
            value={model}
            onChange={(e) => modelMutation.mutate(e.target.value as ChatModel)}
            disabled={modelMutation.isPending}
            className="bg-transparent font-mono text-[11px] text-foreground focus:outline-none"
          >
            {MODEL_ORDER.map((m) => (
              <option key={m.id} value={m.id} disabled={m.disabled}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between rounded-md border border-border bg-background/40 px-2 py-1.5">
          <span className="text-xs text-muted-foreground">Raisonnement</span>
          <select
            value={effort}
            onChange={(e) => effortMutation.mutate(e.target.value as ReasoningEffort)}
            disabled={effortMutation.isPending}
            className="bg-transparent font-mono text-[11px] text-foreground focus:outline-none"
          >
            {EFFORTS.map((e) => (
              <option key={e} value={e}>
                {EFFORT_LABELS[e]}
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
      )}
    </section>
  );
}
