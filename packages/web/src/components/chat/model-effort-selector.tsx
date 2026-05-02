import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Check } from 'lucide-react';
import { type ChatModel } from '@buck/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { fetchSettings, updateSettings } from '@/lib/settings';
import {
  fetchSessions,
  updateSession,
  type SessionsResponse,
  type ReasoningEffort,
} from '@/lib/sessions';
import { cn } from '@/lib/utils';

interface Props {
  sessionId: string | null;
  disabled?: boolean;
}

const MODEL_LABELS: Record<ChatModel, string> = {
  'gpt-5.4-nano': 'GPT-5.4 Nano',
  'gpt-5.4-mini': 'GPT-5.4 Mini',
  'gpt-5.4': 'GPT-5.4',
};

const MODEL_ORDER: ChatModel[] = ['gpt-5.4-nano', 'gpt-5.4-mini', 'gpt-5.4'];

const EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high'];
const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  low: 'Bas',
  medium: 'Moyen',
  high: 'Élevé',
};
const EFFORT_SHORT: Record<ReasoningEffort, string> = {
  low: 'Bas',
  medium: 'Moy.',
  high: 'Él.',
};

export function ModelEffortSelector({ sessionId, disabled }: Props) {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const { data: sessionsData } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetchSessions(),
  });

  const session = sessionsData?.sessions.find((s) => s.id === sessionId) ?? null;
  const model: ChatModel =
    (session?.model as ChatModel | undefined) ??
    (settings?.defaultModel as ChatModel | undefined) ??
    'gpt-5.4-mini';
  const effort: ReasoningEffort =
    session?.reasoningEffort ??
    (settings?.defaultReasoningEffort as ReasoningEffort | undefined) ??
    'medium';

  const modelMutation = useMutation({
    mutationFn: async (next: ChatModel) => {
      if (session) return updateSession(session.id, { model: next });
      return updateSettings({ defaultModel: next });
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
            s.id === session.id ? { ...s, model: next } : s,
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

  const isPending = modelMutation.isPending || effortMutation.isPending;
  const compactLabel = `${MODEL_LABELS[model]} · ${EFFORT_SHORT[effort]}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled || isPending}
          aria-label="Modèle et niveau de raisonnement"
          className={cn(
            'hover-elevate inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50',
          )}
        >
          <span className="font-mono">{compactLabel}</span>
          <ChevronDown className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-56">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Modèle
        </DropdownMenuLabel>
        {MODEL_ORDER.map((m) => {
          const selected = m === model;
          return (
            <DropdownMenuItem
              key={m}
              onSelect={(e) => {
                e.preventDefault();
                if (!selected) modelMutation.mutate(m);
              }}
              className="flex items-center justify-between gap-2"
            >
              <span>{MODEL_LABELS[m]}</span>
              {selected ? <Check className="size-3.5 text-primary" /> : null}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Raisonnement
        </DropdownMenuLabel>
        {EFFORTS.map((eff) => {
          const selected = eff === effort;
          return (
            <DropdownMenuItem
              key={eff}
              onSelect={(e) => {
                e.preventDefault();
                if (!selected) effortMutation.mutate(eff);
              }}
              className="flex items-center justify-between gap-2"
            >
              <span>{EFFORT_LABELS[eff]}</span>
              {selected ? <Check className="size-3.5 text-primary" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

