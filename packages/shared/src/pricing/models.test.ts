import { describe, it, expect } from 'vitest';
import { PRICING, costOf } from './models.js';

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
