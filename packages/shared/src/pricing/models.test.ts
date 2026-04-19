import { describe, it, expect } from 'vitest';
import { PRICING, costOf, costOfRealtime, REALTIME_MODEL } from './models.js';

describe('pricing', () => {
  it('gpt-5.4 pricing matches spec', () => {
    expect(PRICING['gpt-5.4']).toEqual({ input: 2.5, output: 15.0 });
  });

  it('gpt-5.4-mini pricing matches spec', () => {
    expect(PRICING['gpt-5.4-mini']).toEqual({ input: 0.75, output: 4.5 });
  });

  it('costOf computes correct $ for gpt-5.4', () => {
    // 1M input = $2.50, 1M output = $15 → 1M+1M = $17.50
    expect(costOf('gpt-5.4', 1_000_000, 1_000_000)).toBeCloseTo(17.5, 4);
  });

  it('costOf returns 0 for unknown model', () => {
    // @ts-expect-error — testing runtime behaviour
    expect(costOf('unknown', 1000, 1000)).toBe(0);
  });
});

describe('costOfRealtime', () => {
  it('constant = gpt-realtime-1.5', () => {
    expect(REALTIME_MODEL).toBe('gpt-realtime-1.5');
  });

  it('facture audio input à $32/1M', () => {
    const cost = costOfRealtime({
      audioInputTokens: 1_000_000,
      audioOutputTokens: 0,
      textInputTokens: 0,
      textOutputTokens: 0,
      cachedInputTokens: 0,
    });
    expect(cost).toBeCloseTo(32, 4);
  });

  it('retire les cached du billable audio input (prix cached = 0.40)', () => {
    const cost = costOfRealtime({
      audioInputTokens: 1_000_000,
      audioOutputTokens: 0,
      textInputTokens: 0,
      textOutputTokens: 0,
      cachedInputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.4, 4);
  });

  it('audio output à $64/1M', () => {
    const cost = costOfRealtime({
      audioInputTokens: 0,
      audioOutputTokens: 1_000_000,
      textInputTokens: 0,
      textOutputTokens: 0,
      cachedInputTokens: 0,
    });
    expect(cost).toBeCloseTo(64, 4);
  });

  it('text input/output facturés', () => {
    const cost = costOfRealtime({
      audioInputTokens: 0,
      audioOutputTokens: 0,
      textInputTokens: 1_000_000,
      textOutputTokens: 1_000_000,
      cachedInputTokens: 0,
    });
    expect(cost).toBeCloseTo(25, 4);  // 5 + 20
  });
});
