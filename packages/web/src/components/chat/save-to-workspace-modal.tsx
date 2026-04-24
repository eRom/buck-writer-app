import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { FileEntry } from '@buck/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchWorkspaceTree } from '@/lib/workspace';
import { saveImageToWorkspace } from '@/lib/images';

export interface SaveToWorkspaceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string;
  callId: string;
  defaultFilename?: string;
  onSaved?: (result: { path: string; absPath: string; sizeBytes: number }) => void;
}

function collectDirectories(entries: FileEntry[], acc: string[] = []): string[] {
  for (const e of entries) {
    if (e.type === 'directory') {
      acc.push(e.path);
      if (e.children) collectDirectories(e.children, acc);
    }
  }
  return acc;
}

function defaultName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `image_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(
    d.getHours(),
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
}

export function SaveToWorkspaceModal({
  open,
  onOpenChange,
  messageId,
  callId,
  defaultFilename,
  onSaved,
}: SaveToWorkspaceModalProps) {
  const { data: wsTree } = useQuery({
    queryKey: ['workspace-tree'],
    queryFn: fetchWorkspaceTree,
    enabled: open,
  });
  const [folder, setFolder] = useState<string>('');
  const [filename, setFilename] = useState<string>(defaultFilename ?? defaultName());
  const [saving, setSaving] = useState(false);

  const directories = useMemo(
    () => (wsTree?.tree ? ['', ...collectDirectories(wsTree.tree)] : ['']),
    [wsTree],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!filename.trim()) {
      toast.error('Nom de fichier requis');
      return;
    }
    let name = filename.trim();
    if (!name.toLowerCase().endsWith('.png')) name += '.png';
    const relPath = folder ? `${folder}/${name}` : name;

    setSaving(true);
    try {
      const res = await saveImageToWorkspace({ messageId, callId, path: relPath });
      toast.success(`Sauvegardé : ${res.path}`);
      onSaved?.({
        path: res.path,
        absPath: res.absPath,
        sizeBytes: res.sizeBytes,
      });
      onOpenChange(false);
    } catch (err) {
      toast.error(`Erreur : ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Sauver l'image dans le workspace</DialogTitle>
            <DialogDescription>
              Choisis un dossier et un nom de fichier. L'extension{' '}
              <code>.png</code> est ajoutée si manquante.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="block">
              <span className="block text-xs font-medium">Dossier</span>
              <select
                aria-label="Dossier"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
              >
                {directories.map((d) => (
                  <option key={d || '_root'} value={d}>
                    {d || '/ (racine)'}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-medium">Nom du fichier</span>
              <Input
                aria-label="Nom du fichier"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="image.png"
                className="mt-1"
              />
            </label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Sauvegarde…' : 'Sauver'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
