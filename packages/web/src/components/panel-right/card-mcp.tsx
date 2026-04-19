import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plug } from 'lucide-react';
import { fetchMcpServers, setMcpEnabled } from '@/lib/mcp';
import type { McpServerSummary } from '@/lib/mcp';

function Badge({
  enabled,
  onClick,
  disabled,
}: {
  enabled: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const base =
    'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors';
  const color = enabled
    ? 'bg-emerald-500/10 text-emerald-400'
    : 'bg-gray-500/10 text-gray-400';
  const interactive =
    onClick && !disabled ? 'cursor-pointer hover:brightness-125' : 'cursor-default';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick || disabled}
      aria-pressed={enabled}
      aria-label={enabled ? 'Désactiver' : 'Activer'}
      className={`${base} ${color} ${interactive}`}
    >
      {enabled ? 'on' : 'off'}
    </button>
  );
}

export function CardMcp() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: fetchMcpServers,
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      setMcpEnabled(id, enabled),
    onMutate: async ({ id, enabled }) => {
      await qc.cancelQueries({ queryKey: ['mcp-servers'] });
      const prev = qc.getQueryData<McpServerSummary[]>(['mcp-servers']);
      qc.setQueryData<McpServerSummary[]>(
        ['mcp-servers'],
        (old) => old?.map((s) => (s.id === id ? { ...s, enabled } : s)) ?? [],
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['mcp-servers'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['mcp-servers'] }),
  });

  return (
    <section className="rounded-lg border border-card-border bg-card p-3">
      <header className="mb-2 flex items-center gap-1.5">
        <Plug className="size-3.5 text-muted-foreground" />
        <h3 className="text-[13px] font-semibold">Connecteurs</h3>
      </header>
      {isLoading ? (
        <p className="rounded-md border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">
          Chargement...
        </p>
      ) : !data || data.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">
          Aucun serveur MCP configure
        </p>
      ) : (
        <ul className="space-y-1.5">
          {data.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/40 px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[12px] font-medium">{s.name}</span>
                  {s.core && (
                    <span className="rounded bg-muted px-1 py-px text-[9px] uppercase tracking-wider text-muted-foreground">
                      core
                    </span>
                  )}
                </div>
                {s.description && (
                  <p className="truncate text-[10px] text-muted-foreground">
                    {s.description}
                  </p>
                )}
              </div>
              <Badge
                enabled={s.enabled}
                disabled={s.core || toggle.isPending}
                onClick={
                  s.core
                    ? undefined
                    : () => toggle.mutate({ id: s.id, enabled: !s.enabled })
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
