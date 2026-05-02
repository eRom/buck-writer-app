import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, FileText, X } from 'lucide-react';
import { fetchSettings, updateSettings } from '@/lib/settings';

export function ChatToolPills() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });

  const webSearch = settings?.chatTools?.webSearch ?? false;
  const fileSearch = settings?.chatTools?.fileSearch ?? false;

  const mutation = useMutation({
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

  if (!webSearch && !fileSearch) return null;

  function removeWebSearch() {
    mutation.mutate({
      ...(settings?.chatTools ?? { webSearch: false }),
      webSearch: false,
    });
  }

  function removeFileSearch() {
    mutation.mutate({
      ...(settings?.chatTools ?? { webSearch: false }),
      fileSearch: false,
    });
  }

  return (
    <div className="flex flex-wrap gap-1 px-2 pt-2">
      {webSearch ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[11px] text-foreground">
          <Globe className="size-3" />
          <span>Recherche Internet</span>
          <button
            type="button"
            onClick={removeWebSearch}
            disabled={mutation.isPending}
            aria-label="Désactiver la recherche Internet"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </span>
      ) : null}
      {fileSearch ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[11px] text-foreground">
          <FileText className="size-3" />
          <span>Recherche Brouillon</span>
          <button
            type="button"
            onClick={removeFileSearch}
            disabled={mutation.isPending}
            aria-label="Désactiver la recherche Brouillon"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </span>
      ) : null}
    </div>
  );
}
