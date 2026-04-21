import { describe, it, expect } from 'vitest';
import {
  TTS_MODEL,
  TTS_PRICING,
  costOfTts,
  estimateAudioTokens,
  AUDIO_TOKENS_PER_SECOND,
} from './tts.js';

describe('TTS pricing', () => {
  it('TTS_MODEL constant', () => {
    expect(TTS_MODEL).toBe('gemini-3.1-flash-tts-preview');
  });

  it('TTS_PRICING values match published rates', () => {
    expect(TTS_PRICING.inputTextPerMTokensUsd).toBe(0.5);
    expect(TTS_PRICING.outputAudioPerMTokensUsd).toBe(10);
  });

  it('costOfTts zero when no tokens', () => {
    expect(costOfTts({ inputTextTokens: 0, outputAudioTokens: 0 })).toBe(0);
  });

  it('costOfTts — 1M input + 1M output = $0.50 + $10', () => {
    expect(
      costOfTts({ inputTextTokens: 1_000_000, outputAudioTokens: 1_000_000 }),
    ).toBeCloseTo(10.5, 6);
  });

  it('costOfTts — realistic message (75 input, 640 audio tokens for 20s)', () => {
    const cost = costOfTts({ inputTextTokens: 75, outputAudioTokens: 640 });
    expect(cost).toBeCloseTo(
      (75 / 1_000_000) * 0.5 + (640 / 1_000_000) * 10,
      9,
    );
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.01);
  });

  it('estimateAudioTokens = ceil(seconds * 32)', () => {
    expect(AUDIO_TOKENS_PER_SECOND).toBe(32);
    expect(estimateAudioTokens(0)).toBe(0);
    expect(estimateAudioTokens(1)).toBe(32);
    expect(estimateAudioTokens(10)).toBe(320);
    expect(estimateAudioTokens(0.5)).toBe(16);
    expect(estimateAudioTokens(1.01)).toBe(33);
  });
});
