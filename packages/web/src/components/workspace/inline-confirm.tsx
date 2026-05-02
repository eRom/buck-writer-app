import { Trash2, X } from 'lucide-react';

interface InlineConfirmProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  indent?: number;
}

export function InlineConfirm({
  message,
  onConfirm,
  onCancel,
  busy,
  indent = 0,
}: InlineConfirmProps) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-md border border-destructive/20 bg-destructive/10 px-2 py-1 text-xs"
      style={{ marginLeft: `${indent}px` }}
    >
      <Trash2 className="size-3 shrink-0 text-destructive" />
      <span className="flex-1 truncate text-destructive-foreground/90">{message}</span>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="hover-elevate rounded px-1.5 py-0.5 text-[11px] text-muted-foreground"
        aria-label="Annuler"
      >
        <X className="size-3" />
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className="hover-elevate rounded bg-destructive px-2 py-0.5 text-[11px] font-medium text-destructive-foreground disabled:opacity-50"
      >
        Supprimer
      </button>
    </div>
  );
}
