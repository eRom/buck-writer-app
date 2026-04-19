export const REALTIME_VOICES = [
  'cedar', 'marin', 'alloy', 'ash', 'ballad',
  'coral', 'echo', 'sage', 'shimmer', 'verse',
] as const;

export type RealtimeVoice = (typeof REALTIME_VOICES)[number];

export const DEFAULT_VOICE: RealtimeVoice = 'coral';

export function isRealtimeVoice(v: unknown): v is RealtimeVoice {
  return typeof v === 'string' && (REALTIME_VOICES as readonly string[]).includes(v);
}
