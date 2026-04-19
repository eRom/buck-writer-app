export type TurnDetectionMode = 'server_vad' | 'semantic_vad';

export interface TurnDetectionConfig {
  mode: TurnDetectionMode;
  threshold: number;
  prefix_padding_ms: number;
  silence_duration_ms: number;
  interrupt_response: boolean;
}

export const DEFAULT_TURN_DETECTION: TurnDetectionConfig = {
  mode: 'server_vad',
  threshold: 0.5,
  prefix_padding_ms: 500,
  silence_duration_ms: 500,
  interrupt_response: true,
};

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function normalizeTurnDetection(
  input: Partial<TurnDetectionConfig>,
): TurnDetectionConfig {
  if (input.mode !== 'server_vad' && input.mode !== 'semantic_vad') {
    return { ...DEFAULT_TURN_DETECTION };
  }
  return {
    mode: input.mode,
    threshold: clamp(input.threshold ?? DEFAULT_TURN_DETECTION.threshold, 0, 1),
    prefix_padding_ms: clamp(input.prefix_padding_ms ?? DEFAULT_TURN_DETECTION.prefix_padding_ms, 0, 5000),
    silence_duration_ms: clamp(input.silence_duration_ms ?? DEFAULT_TURN_DETECTION.silence_duration_ms, 0, 5000),
    interrupt_response: input.interrupt_response ?? DEFAULT_TURN_DETECTION.interrupt_response,
  };
}
