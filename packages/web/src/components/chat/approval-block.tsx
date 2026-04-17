import { Shield, Terminal, FilePlus, Trash2 } from 'lucide-react';

interface ApprovalBlockProps {
  toolName: string;
  args: Record<string, unknown>;
  onApprove: () => void;
  onDeny: () => void;
  status?: 'pending' | 'approved' | 'denied';
}

function toolIcon(name: string) {
  switch (name) {
    case 'shell_execute': return <Terminal className="h-4 w-4" />;
    case 'create_file': return <FilePlus className="h-4 w-4" />;
    case 'delete_file': return <Trash2 className="h-4 w-4" />;
    default: return <Shield className="h-4 w-4" />;
  }
}

function toolDescription(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'shell_execute':
      return String(args.command ?? '');
    case 'create_file':
      return `Créer fichier ${String(args.path ?? '')}`;
    case 'delete_file':
      return `Supprimer ${String(args.path ?? '')}`;
    default:
      return JSON.stringify(args);
  }
}

export function ApprovalBlock({
  toolName,
  args,
  onApprove,
  onDeny,
  status = 'pending',
}: ApprovalBlockProps) {
  const isShell = toolName === 'shell_execute';
  const description = toolDescription(toolName, args);

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-primary/30 bg-primary/5">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
        {toolIcon(toolName)}
        <span>{toolName}</span>
      </div>

      {/* Command/action display */}
      <div className="px-3 py-2">
        {isShell ? (
          <div className="rounded bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200">
            $ {description}
          </div>
        ) : (
          <p className="text-sm">
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{description}</code>
          </p>
        )}
      </div>

      {/* Actions / Status */}
      <div className="flex items-center gap-2 px-3 py-2">
        {status === 'pending' && (
          <>
            <button
              onClick={onApprove}
              className="rounded-md bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Autoriser
            </button>
            <button
              onClick={onDeny}
              className="rounded-md bg-muted px-4 py-1 text-xs text-foreground hover:bg-muted/80"
            >
              Refuser
            </button>
          </>
        )}
        {status === 'approved' && (
          <span className="rounded-full bg-emerald-900/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
            Autorisé
          </span>
        )}
        {status === 'denied' && (
          <span className="rounded-full bg-red-900/30 px-2 py-0.5 text-[10px] font-semibold text-red-400">
            Refusé
          </span>
        )}
      </div>
    </div>
  );
}
