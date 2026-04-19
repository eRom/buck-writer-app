export const PRICING = {
  'gpt-5.4': { input: 2.5, output: 15.0 },
  'gpt-5.4-mini': { input: 0.75, output: 4.5 },
  'gpt-5.4-pro': { input: 5.0, output: 30.0 },
  'gpt-5.4-nano': { input: 0.15, output: 0.6 },
  'gpt-realtime-1.5': {
    text_input: 5.0,
    text_output: 20.0,
    audio_input: 32.0,
    audio_input_cached: 0.4,
    audio_output: 64.0,
  },
} as const;

export type TextModel = 'gpt-5.4' | 'gpt-5.4-mini' | 'gpt-5.4-pro' | 'gpt-5.4-nano';
export type RealtimeModel = 'gpt-realtime-1.5';
export type Model = TextModel | RealtimeModel;

export const REALTIME_MODEL: RealtimeModel = 'gpt-realtime-1.5';

type TextEntry = { input: number; output: number };

function isTextEntry(p: unknown): p is TextEntry {
  return typeof p === 'object' && p !== null && 'input' in p && 'output' in p;
}

export function costOf(model: string, inputTokens: number, outputTokens: number): number {
  const entry = (PRICING as Record<string, unknown>)[model];
  if (!isTextEntry(entry)) return 0;
  return (inputTokens * entry.input + outputTokens * entry.output) / 1_000_000;
}

export interface RealtimeUsage {
  audioInputTokens: number;
  audioOutputTokens: number;
  textInputTokens: number;
  textOutputTokens: number;
  cachedInputTokens: number;
}

export function costOfRealtime(
  u: RealtimeUsage,
  model: RealtimeModel = REALTIME_MODEL,
): number {
  const p = PRICING[model];
  const billableAudioIn = Math.max(0, u.audioInputTokens - u.cachedInputTokens);
  return (
    billableAudioIn * p.audio_input +
    u.cachedInputTokens * p.audio_input_cached +
    u.audioOutputTokens * p.audio_output +
    u.textInputTokens * p.text_input +
    u.textOutputTokens * p.text_output
  ) / 1_000_000;
}
