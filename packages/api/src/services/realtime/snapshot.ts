export interface SnapshotMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface BuildSnapshotOpts {
  maxMessages: number;
  maxChars?: number;
}

export function buildSessionSnapshot(
  messages: SnapshotMessage[],
  opts: BuildSnapshotOpts,
): string {
  const maxChars = opts.maxChars ?? 16000;
  const tail = messages.slice(-opts.maxMessages);
  const lines = tail
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `[${m.role}]: ${m.content}`);
  let out = lines.join('\n');
  if (out.length > maxChars) out = out.slice(-maxChars);
  return out;
}
