import { useQuery } from '@tanstack/react-query';
import { fetchWorkspaceTree } from '@/lib/workspace';
import { FileTree } from './file-tree';

interface WorkspacePanelProps {
  onInsertReference: (path: string) => void;
}

export function WorkspacePanel({ onInsertReference }: WorkspacePanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['workspace-tree'],
    queryFn: fetchWorkspaceTree,
    refetchInterval: 10_000,
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold">Workspace</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Chargement...</p>
        ) : (
          <FileTree
            entries={data?.tree ?? []}
            onInsertReference={onInsertReference}
          />
        )}
      </div>
    </div>
  );
}
