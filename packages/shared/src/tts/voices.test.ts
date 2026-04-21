import { describe, it, expect } from 'vitest';
import { TTS_VOICES, DEFAULT_TTS_VOICE, isTtsVoice } from './voices.js';

describe('TTS voices', () => {
  it('exposes 30 voices', () => {
    expect(TTS_VOICES).toHaveLength(30);
  });

  it('default is Kore', () => {
    expect(DEFAULT_TTS_VOICE).toBe('Kore');
    expect(TTS_VOICES.find((v) => v.name === 'Kore')).toBeDefined();
  });

  it('validates voice names', () => {
    expect(isTtsVoice('Kore')).toBe(true);
    expect(isTtsVoice('Puck')).toBe(true);
    expect(isTtsVoice('NotAVoice')).toBe(false);
    expect(isTtsVoice('')).toBe(false);
    expect(isTtsVoice(42)).toBe(false);
    expect(isTtsVoice(null)).toBe(false);
    expect(isTtsVoice(undefined)).toBe(false);
  });

  it('all entries have valid name + non-trivial character', () => {
    for (const v of TTS_VOICES) {
      expect(v.name).toMatch(/^[A-Z][a-zA-Z]+$/);
      expect(v.character.length).toBeGreaterThan(2);
    }
  });

  it('names are unique', () => {
    const names = TTS_VOICES.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
