interface Props {
  provider?: string;
  model?: string;
  durationMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}

function fmtDuration(ms?: number): string {
  if (!ms) return '';
  return `${(ms / 1000).toFixed(1)}s`;
}

export function MessageFooter({ provider, model, durationMs, tokensIn, tokensOut, costUsd }: Props) {
  const parts: string[] = [];
  if (provider) parts.push(provider);
  if (model) parts.push(model);
  if (durationMs) parts.push(fmtDuration(durationMs));
  if (tokensIn !== undefined && tokensOut !== undefined) parts.push(`${tokensIn} in / ${tokensOut} out`);
  if (costUsd !== undefined) parts.push(`$${costUsd.toFixed(3)}`);
  if (parts.length === 0) return null;
  return (
    <div className="mt-1 flex justify-end gap-2 font-mono text-[10px] text-muted-foreground opacity-40">
      {parts.map((p, i) => (
        <span key={i}>{p}</span>
      ))}
    </div>
  );
}
