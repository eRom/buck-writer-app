interface ApprovalBlockProps {
  toolName: string;
  description: string;
  onApprove: () => void;
  onDeny: () => void;
  resolved?: boolean;
}

export function ApprovalBlock({
  toolName,
  description,
  onApprove,
  onDeny,
  resolved,
}: ApprovalBlockProps) {
  return (
    <div className="mb-2 rounded-lg border border-primary bg-primary/5 p-3">
      <p className="mb-1 text-xs font-medium text-primary">
        L&apos;assistant veut utiliser {toolName}
      </p>
      <p className="mb-2 text-sm">
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{description}</code>
      </p>
      {!resolved && (
        <div className="flex gap-2">
          <button
            onClick={onApprove}
            className="rounded-md bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground"
          >
            Autoriser
          </button>
          <button
            onClick={onDeny}
            className="rounded-md bg-muted px-4 py-1 text-xs text-foreground"
          >
            Refuser
          </button>
        </div>
      )}
    </div>
  );
}
