import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Folder,
  RefreshCw,
  Brain,
  FilePlus,
  FolderPlus,
  Upload as UploadIcon,
} from 'lucide-react';
import {
  fetchWorkspaceTree,
  createDirectory,
  createEmptyFile,
  renameFile,
  deleteFile,
  uploadFile,
  joinWorkspacePath,
} from '@/lib/workspace';
import { syncVectorStore } from '@/lib/vector-store';
import {
  FileTree,
  type CreatingState,
  type FileTreeActions,
} from '@/components/workspace/file-tree';
import { FilePreviewModal } from '@/components/workspace/file-preview-modal';
import type { FileEntry } from '@buck/shared';
import { cn } from '@/lib/utils';

const ACCEPT_INPUT = 'image/*,text/*,.md,.mdx,.txt,.json,.yaml,.yml,.csv,.log';

export function CardWorkspace() {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['workspace-tree'],
    queryFn: fetchWorkspaceTree,
  });
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [creating, setCreating] = useState<CreatingState>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['workspace-tree'] });

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

  async function uploadMany(files: File[], destDir: string) {
    let ok = 0;
    let failed = 0;
    for (const f of files) {
      const dest = joinWorkspacePath(destDir, f.name);
      try {
        await uploadFile(f, dest);
        ok += 1;
      } catch (e) {
        failed += 1;
        toast.error((e as Error).message);
      }
    }
    if (ok > 0) {
      toast.success(
        ok === 1 ? '1 fichier importé' : `${ok} fichiers importés`,
      );
    }
    if (ok > 0) refresh();
    return { ok, failed };
  }

  const actions: FileTreeActions = {
    rename: async (path, newName) => {
      try {
        await renameFile(path, newName);
        refresh();
      } catch (e) {
        toast.error((e as Error).message);
        throw e;
      }
    },
    remove: async (path) => {
      try {
        await deleteFile(path);
        refresh();
      } catch (e) {
        toast.error((e as Error).message);
        throw e;
      }
    },
    uploadInto: async (dirPath, files) => {
      await uploadMany(Array.from(files), dirPath);
    },
    requestCreate: (parentPath, kind) => setCreating({ parentPath, kind }),
    submitCreate: async (name) => {
      if (!creating) return;
      const dest = joinWorkspacePath(creating.parentPath, name);
      try {
        if (creating.kind === 'directory') await createDirectory(dest);
        else await createEmptyFile(dest);
        setCreating(null);
        refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    cancelCreate: () => setCreating(null),
  };

  function handlePanelDragEnter(e: React.DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCounter.current += 1;
    setIsDragOver(true);
  }

  function handlePanelDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragOver(false);
    }
  }

  function handlePanelDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  async function handlePanelDrop(e: React.DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      await uploadMany(Array.from(e.dataTransfer.files), '');
    }
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadMany(Array.from(files), '');
    e.target.value = '';
  }

  return (
    <section
      onDragEnter={handlePanelDragEnter}
      onDragLeave={handlePanelDragLeave}
      onDragOver={handlePanelDragOver}
      onDrop={handlePanelDrop}
      className="relative flex min-h-0 flex-1 flex-col rounded-lg border border-card-border bg-card p-3"
    >
      <header className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Folder className="size-3.5 text-muted-foreground" />
          Dossier de travail
        </h3>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setCreating({ parentPath: '', kind: 'file' })}
            aria-label="Nouveau fichier"
            title="Nouveau fichier"
            className="hover-elevate rounded-md p-1 text-muted-foreground"
          >
            <FilePlus className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setCreating({ parentPath: '', kind: 'directory' })}
            aria-label="Nouveau dossier"
            title="Nouveau dossier"
            className="hover-elevate rounded-md p-1 text-muted-foreground"
          >
            <FolderPlus className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Importer (max 5 Mo, texte ou image)"
            title="Importer (max 5 Mo, texte ou image)"
            className="hover-elevate rounded-md p-1 text-muted-foreground"
          >
            <UploadIcon className="size-3.5" />
          </button>
          <span className="mx-0.5 h-3.5 w-px bg-border" aria-hidden />
          <button
            type="button"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            aria-label="Synchroniser knowledge avec OpenAI"
            title="Synchroniser knowledge avec OpenAI"
            className="hover-elevate rounded-md p-1 text-amber-500 disabled:opacity-50"
          >
            <Brain className={cn('size-3.5', syncMutation.isPending && 'animate-pulse')} />
          </button>
          <button
            type="button"
            onClick={async () => {
              const res = await refetch();
              if (res.isError) toast.error('Rafraichissement échoué');
            }}
            disabled={isFetching}
            aria-label="Rafraichir l'arbre de fichiers"
            title="Rafraichir l'arbre de fichiers"
            className="hover-elevate rounded-md p-1 text-muted-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} />
          </button>
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT_INPUT}
        onChange={handleFileInput}
        className="hidden"
      />

      <div className="relative min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-background/40 p-1.5">
        {isLoading ? (
          <p className="p-2 text-xs text-muted-foreground">Chargement...</p>
        ) : (
          <FileTree
            entries={data?.tree ?? []}
            creating={creating}
            actions={actions}
            onSelect={(entry: FileEntry) => {
              if (entry.type === 'file') setPreviewPath(entry.path);
            }}
          />
        )}
      </div>

      {isDragOver && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/60 bg-primary/5"
          aria-hidden
        >
          <div className="flex flex-col items-center gap-1 text-xs text-primary">
            <UploadIcon className="size-5" />
            <span className="font-medium">Déposer pour importer</span>
            <span className="text-[10px] text-muted-foreground">max 5 Mo · texte ou image</span>
          </div>
        </div>
      )}

      <FilePreviewModal path={previewPath} onClose={() => setPreviewPath(null)} />
    </section>
  );
}
