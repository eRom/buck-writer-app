import { createFileRoute } from '@tanstack/react-router';
import { useMcpQuery, useMcpMutation } from '@/hooks/use-mcp';
import { Button } from '@/components/ui/button';

interface Backup {
  name: string;
  size: number;
  modifiedAt: string;
}

interface BackupsResponse {
  total?: number;
  backups?: Backup[];
}

export const Route = createFileRoute('/backups')({ component: BackupsPage });

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function BackupsPage() {
  const { data } = useMcpQuery<BackupsResponse>('list_backups');
  const createBackup = useMcpMutation('backup_bible', ['list_backups']);
  const restoreBackup = useMcpMutation('restore_bible');

  const backups = data?.backups ?? [];

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Backups</h1>
        <Button onClick={() => createBackup.mutate({})} disabled={createBackup.isPending}>
          Nouveau backup
        </Button>
      </header>
      {backups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun backup pour le moment.</p>
      ) : (
        <ul className="space-y-2">
          {backups.map((b) => (
            <li
              key={b.name}
              className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium font-mono">{b.name}</p>
                <p className="text-xs text-muted-foreground">
                  {b.modifiedAt} — {formatSize(b.size)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => restoreBackup.mutate({ backup_name: b.name })}
              >
                Restaurer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
