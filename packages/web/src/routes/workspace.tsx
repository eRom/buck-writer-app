import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { fetchWorkspaceTree, createDirectory, renameFile, deleteFile } from '@/lib/workspace';
import { FileTree } from '@/components/workspace/file-tree';
import type { FileEntry } from '@buck/shared';

export const Route = createFileRoute('/workspace')({
  component: WorkspacePage,
});

function WorkspacePage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['workspace-tree'],
    queryFn: fetchWorkspaceTree,
  });
  const [selected, setSelected] = useState<FileEntry | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['workspace-tree'] });

  const handleCreateDir = async () => {
    const name = prompt('Nom du dossier :');
    if (!name) return;
    const basePath = selected?.type === 'directory' ? selected.path : '';
    try {
      await createDirectory(basePath ? `${basePath}/${name}` : name);
      toast.success(`Dossier "${name}" cree`);
      refresh();
    } catch {
      toast.error('Erreur lors de la creation');
    }
  };

  const handleRename = async () => {
    if (!selected) return;
    const newName = prompt('Nouveau nom :', selected.name);
    if (!newName || newName === selected.name) return;
    try {
      await renameFile(selected.path, newName);
      toast.success(`Renomme en "${newName}"`);
      setSelected(null);
      refresh();
    } catch {
      toast.error('Erreur lors du renommage');
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm(`Supprimer "${selected.name}" ?`)) return;
    try {
      await deleteFile(selected.path);
      toast.success(`"${selected.name}" supprime`);
      setSelected(null);
      refresh();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h1 className="text-sm font-semibold">Workspace</h1>
        <div className="flex gap-2">
          <button onClick={handleCreateDir}
            className="rounded-md border border-border px-3 py-1 text-xs hover:bg-accent">
            Nouveau dossier
          </button>
          {selected && (
            <>
              <button onClick={handleRename}
                className="rounded-md border border-border px-3 py-1 text-xs hover:bg-accent">
                Renommer
              </button>
              <button onClick={handleDelete}
                className="rounded-md border border-destructive px-3 py-1 text-xs text-destructive hover:bg-destructive/10">
                Supprimer
              </button>
            </>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : (
          <FileTree entries={data?.tree ?? []} onSelect={setSelected} />
        )}
      </div>
    </div>
  );
}
