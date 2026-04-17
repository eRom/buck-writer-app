interface ToolCallDisplayProps {
  toolName: string;
  args: Record<string, unknown>;
}

export function ToolCallDisplay({ toolName, args }: ToolCallDisplayProps) {
  const argsStr = Object.entries(args)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(', ');

  return (
    <div className="mb-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
      <span className="font-medium text-primary">{toolName}</span>{' '}
      <span>{argsStr}</span>
    </div>
  );
}
