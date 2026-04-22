import { Check, X, Terminal, Wrench, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToolCallState = 'pending-approval' | 'running' | 'success' | 'error' | 'denied';

interface Props {
  name: string;
  rawName?: string;
  args?: string;
  output?: string;
  state: ToolCallState;
  onApprove?: () => void;
  onDeny?: () => void;
}

export function ToolCallItem({ name, rawName, args, output, state, onApprove, onDeny }: Props) {
  const refName = rawName ?? name;
  const isShell = refName === 'shell_execute';
  const Icon = isShell ? Terminal : Wrench;

  if (state === 'pending-approval') {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary">
          <AlertCircle className="size-3.5" />
          <span>
            L'assistant souhaite utiliser <span className="font-mono">{name}</span>
          </span>
        </div>
        {args && (
          <pre className="mb-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-muted/50 px-2 py-1 font-mono text-[10px] text-muted-foreground">
            {args}
          </pre>
        )}
        <div className="flex gap-2">
          <button
            onClick={onApprove}
            className="hover-elevate active-elevate-2 rounded-md border border-primary-border bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
          >
            Autoriser
          </button>
          <button
            onClick={onDeny}
            className="hover-elevate rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
          >
            Refuser
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-md border px-2.5 py-1.5 font-mono text-[11px]',
        state === 'error' || state === 'denied'
          ? 'border-destructive/30 bg-destructive/5'
          : 'border-border bg-muted/30',
      )}
    >
      <div className="flex items-center gap-1.5">
        {state === 'running' ? (
          <Loader2 className="size-3 animate-spin text-primary" />
        ) : (
          <Icon className="size-3 text-muted-foreground" />
        )}
        <span className="font-semibold text-foreground">{name}</span>
        {args && <span className="truncate text-muted-foreground opacity-60">{args}</span>}
        {state === 'success' && <Check className="ml-auto size-3 text-emerald-400" />}
        {(state === 'error' || state === 'denied') && (
          <span title={output ?? undefined} className="ml-auto inline-flex">
            <X className="size-3 text-destructive" />
          </span>
        )}
      </div>
      {output && state !== 'running' && (
        <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-[10px] text-muted-foreground opacity-80">
          {output}
        </pre>
      )}
    </div>
  );
}
