import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Folder, RefreshCw, Brain } from 'lucide-react';
import { fetchWorkspaceTree } from '@/lib/workspace';
import { syncVectorStore } from '@/lib/vector-store';
import { FileTree } from '@/components/workspace/file-tree';
import { FilePreviewModal } from '@/components/workspace/file-preview-modal';
import type { FileEntry } from '@buck/shared';
import { cn } from '@/lib/utils';

export function CardWorkspace() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['workspace-tree'],
    queryFn: fetchWorkspaceTree,
  });
  const [previewPath, setPreviewPath] = useState<string | null>(null);

  const syncMutation = useMutation({
    mutationFn: syncVectorStore,
    onSuccess: (s) => {
      toast.success(
        `Knowledge synchronisé : +${s.added} ~${s.updated} -${s.removed}`,
      );
    },
    onError: () => {
      toast.error('Synchronisation échouée');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-card-border bg-card p-3">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Folder className="size-3.5 text-muted-foreground" />
          Dossier de travail
        </h3>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            aria-label="Synchroniser knowledge avec OpenAI"
            title="Synchroniser knowledge avec OpenAI"
            className="hover-elevate rounded-md p-1 text-amber-500 disabled:opacity-50"
          >
            <Brain className={cn('size-3.5', syncMutation.isPending && 'animate-pulse')} />
          </button>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['workspace-tree'] })}
            aria-label="Rafraichir l'arbre de fichiers"
            title="Rafraichir l'arbre de fichiers"
            className="hover-elevate rounded-md p-1 text-muted-foreground"
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-background/40 p-1.5">
        {isLoading ? (
          <p className="p-2 text-xs text-muted-foreground">Chargement...</p>
        ) : (
          <FileTree
            entries={data?.tree ?? []}
            onSelect={(entry: FileEntry) => {
              if (entry.type === 'file') setPreviewPath(entry.path);
            }}
          />
        )}
      </div>
      <FilePreviewModal path={previewPath} onClose={() => setPreviewPath(null)} />
    </section>
  );
}
