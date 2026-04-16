export const PRICING = {
  'gpt-5.4': { input: 2.5, output: 15.0 },
  'gpt-5.4-mini': { input: 0.75, output: 4.5 },
  'gpt-5.4-pro': { input: 5.0, output: 30.0 },
  'gpt-5.4-nano': { input: 0.15, output: 0.6 },
  'gpt-realtime-1.5': {
    text_input: 5.0,
    text_output: 20.0,
    audio_input: 100.0,
    audio_output: 200.0,
  },
} as const;

export type TextModel = 'gpt-5.4' | 'gpt-5.4-mini' | 'gpt-5.4-pro' | 'gpt-5.4-nano';
export type RealtimeModel = 'gpt-realtime-1.5';
export type Model = TextModel | RealtimeModel;

type TextEntry = { input: number; output: number };

function isTextEntry(p: unknown): p is TextEntry {
  return typeof p === 'object' && p !== null && 'input' in p && 'output' in p;
}

export function costOf(model: string, inputTokens: number, outputTokens: number): number {
  const entry = (PRICING as Record<string, unknown>)[model];
  if (!isTextEntry(entry)) return 0;
  return (inputTokens * entry.input + outputTokens * entry.output) / 1_000_000;
}
