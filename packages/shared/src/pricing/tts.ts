export const TTS_MODEL = 'gemini-3.1-flash-tts-preview';

export const TTS_PRICING = {
  inputTextPerMTokensUsd: 0.5,
  outputAudioPerMTokensUsd: 10,
} as const;

export const AUDIO_TOKENS_PER_SECOND = 32;

export function costOfTts(params: {
  inputTextTokens: number;
  outputAudioTokens: number;
}): number {
  const inputUsd =
    (params.inputTextTokens / 1_000_000) * TTS_PRICING.inputTextPerMTokensUsd;
  const outputUsd =
    (params.outputAudioTokens / 1_000_000) * TTS_PRICING.outputAudioPerMTokensUsd;
  return inputUsd + outputUsd;
}

export function estimateAudioTokens(durationSec: number): number {
  return Math.ceil(durationSec * AUDIO_TOKENS_PER_SECOND);
}
