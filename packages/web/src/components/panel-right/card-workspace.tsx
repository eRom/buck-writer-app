import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Folder, RefreshCw } from 'lucide-react';
import { fetchWorkspaceTree } from '@/lib/workspace';
import { FileTree } from '@/components/workspace/file-tree';
import { FilePreviewModal } from '@/components/workspace/file-preview-modal';
import type { FileEntry } from '@buck/shared';

export function CardWorkspace() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['workspace-tree'],
    queryFn: fetchWorkspaceTree,
  });
  const [previewPath, setPreviewPath] = useState<string | null>(null);

  return (
    <section className="rounded-lg border border-card-border bg-card p-3">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Folder className="size-3.5 text-muted-foreground" />
          Dossier de travail
        </h3>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['workspace-tree'] })}
          aria-label="Rafraichir"
          className="hover-elevate rounded-md p-1 text-muted-foreground"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </header>
      <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-background/40 p-1.5">
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
