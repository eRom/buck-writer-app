import { describe, it, expect } from 'vitest';
import { REALTIME_VOICES, DEFAULT_VOICE, isRealtimeVoice } from './voices.js';

describe('REALTIME_VOICES', () => {
  it('contient les 10 voix OpenAI Realtime 2026', () => {
    expect(REALTIME_VOICES).toEqual([
      'cedar', 'marin', 'alloy', 'ash', 'ballad',
      'coral', 'echo', 'sage', 'shimmer', 'verse',
    ]);
  });
  it('défaut = coral', () => {
    expect(DEFAULT_VOICE).toBe('coral');
    expect(REALTIME_VOICES).toContain(DEFAULT_VOICE);
  });
  it('isRealtimeVoice type-guards une valeur connue', () => {
    expect(isRealtimeVoice('coral')).toBe(true);
    expect(isRealtimeVoice('unknown')).toBe(false);
    expect(isRealtimeVoice(42)).toBe(false);
  });
});
