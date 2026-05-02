import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Upload,
  Plug,
  Globe,
  FileText,
  ExternalLink,
  Check,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { fetchMcpServers, setMcpEnabled, type McpServerSummary } from '@/lib/mcp';
import { fetchSettings, updateSettings } from '@/lib/settings';

const BIBLE_UI_URL = import.meta.env.VITE_BIBLE_UI_URL ?? 'http://localhost:5174';

interface Props {
  onUploadClick: () => void;
  disabled?: boolean;
}

export function ComposerActionsMenu({ onUploadClick, disabled }: Props) {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const { data: mcpServers } = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: fetchMcpServers,
  });

  const webSearch = settings?.chatTools?.webSearch ?? false;
  const fileSearch = settings?.chatTools?.fileSearch ?? false;
  const vectorStoreId = settings?.vectorStoreId ?? null;

  const chatToolsMutation = useMutation({
    mutationFn: (next: { webSearch: boolean; fileSearch?: boolean }) =>
      updateSettings({ chatTools: next }),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ['settings'] });
      const prev = qc.getQueryData<typeof settings>(['settings']);
      if (prev) qc.setQueryData(['settings'], { ...prev, chatTools: next });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['settings'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  const mcpMutation = useMutation({
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

  function toggleWebSearch() {
    chatToolsMutation.mutate({
      ...(settings?.chatTools ?? { webSearch: false }),
      webSearch: !webSearch,
    });
  }

  function toggleFileSearch() {
    if (!vectorStoreId) return;
    chatToolsMutation.mutate({
      ...(settings?.chatTools ?? { webSearch: false }),
      fileSearch: !fileSearch,
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Ajouter un fichier ou un connecteur"
          className="hover-elevate rounded-md p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <Plus className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="min-w-56">
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onUploadClick();
          }}
        >
          <Upload className="mr-2 size-4" />
          <span>Téléverser un fichier ou une image</span>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Plug className="mr-2 size-4" />
            <span>Connecteurs</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-64">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Serveurs MCP
            </DropdownMenuLabel>
            {!mcpServers || mcpServers.length === 0 ? (
              <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                Aucun serveur configuré
              </div>
            ) : (
              mcpServers.map((s) => {
                const isBible = s.name === 'bible';
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm"
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={s.enabled}
                      disabled={s.core || mcpMutation.isPending}
                      onClick={() => mcpMutation.mutate({ id: s.id, enabled: !s.enabled })}
                      className="flex size-4 items-center justify-center rounded border border-border bg-background disabled:opacity-50"
                    >
                      {s.enabled ? <Check className="size-3 text-primary" /> : null}
                    </button>
                    <span className="flex-1 truncate capitalize">{s.name}</span>
                    {isBible ? (
                      <a
                        href={BIBLE_UI_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Ouvrir la Bible UI dans un nouvel onglet"
                        className="hover-elevate rounded-md p-1 text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                  </div>
                );
              })
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            toggleWebSearch();
          }}
        >
          <Globe className="mr-2 size-4" />
          <span className="flex-1">Recherche Internet</span>
          {webSearch ? <Check className="size-3.5 text-primary" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!vectorStoreId}
          onSelect={(e) => {
            e.preventDefault();
            toggleFileSearch();
          }}
        >
          <FileText className="mr-2 size-4" />
          <span className="flex-1">
            Recherche Brouillon
            {!vectorStoreId ? (
              <span className="ml-1 text-[10px] text-muted-foreground">(workspace non sync)</span>
            ) : null}
          </span>
          {fileSearch ? <Check className="size-3.5 text-primary" /> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
