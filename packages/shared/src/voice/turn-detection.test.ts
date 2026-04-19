import { describe, it, expect } from 'vitest';
import { DEFAULT_TURN_DETECTION, normalizeTurnDetection } from './turn-detection.js';

describe('turn-detection', () => {
  it('défauts = server_vad + threshold 0.5 + 500/500 ms + interrupt true', () => {
    expect(DEFAULT_TURN_DETECTION).toEqual({
      mode: 'server_vad',
      threshold: 0.5,
      prefix_padding_ms: 500,
      silence_duration_ms: 500,
      interrupt_response: true,
    });
  });

  it('normalise clamp threshold 0..1 et ms dans [0, 5000]', () => {
    expect(normalizeTurnDetection({
      mode: 'server_vad', threshold: 2, prefix_padding_ms: -10, silence_duration_ms: 99999, interrupt_response: false,
    })).toEqual({
      mode: 'server_vad', threshold: 1, prefix_padding_ms: 0, silence_duration_ms: 5000, interrupt_response: false,
    });
  });

  it('retombe sur default si mode invalide', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(normalizeTurnDetection({ mode: 'bogus' as any })).toEqual(DEFAULT_TURN_DETECTION);
  });
});
