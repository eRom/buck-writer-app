import { GoogleGenAI } from '@google/genai';
import { TTS_MODEL, AUDIO_TOKENS_PER_SECOND } from '@buck/shared';
import { HttpError } from '../../utils/http-error.js';
import { wrapPcmToWav, pcmDurationSec, type WavFormat } from './wav-encoder.js';

export const TTS_AUDIO_FORMAT: WavFormat = {
  sampleRate: 24000,
  bitsPerSample: 16,
  channels: 1,
};

export interface SynthesizeParams {
  apiKey: string;
  text: string;
  voice: string;
  systemPrompt?: string;
}

export interface SynthesisResult {
  wavBuffer: Buffer;
  durationSec: number;
  inputTextTokens: number;
  outputAudioTokens: number;
  model: string;
}

export interface SynthesizeDeps {
  genAI?: GoogleGenAI;
  nowMs?: () => number;
}

function looksLikeTransient500(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return /\b5(00|02|03|04)\b/.test(msg) || /INTERNAL|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(msg);
}

export async function synthesize(
  params: SynthesizeParams,
  deps: SynthesizeDeps = {},
): Promise<SynthesisResult> {
  const ai = deps.genAI ?? new GoogleGenAI({ apiKey: params.apiKey });

  const call = () =>
    ai.models.generateContent({
      model: TTS_MODEL,
      contents: [{ parts: [{ text: params.text }] }],
      config: {
        ...(params.systemPrompt
          ? { systemInstruction: params.systemPrompt }
          : {}),
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: params.voice },
          },
        },
      },
    });

  let response;
  try {
    response = await call();
  } catch (err) {
    if (looksLikeTransient500(err)) {
      response = await call();
    } else {
      throw new HttpError(
        502,
        'TTS_GEMINI_FAILED',
        `Gemini TTS request failed: ${(err as Error).message}`,
      );
    }
  }

  const inlineData =
    response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  const base64 = inlineData?.data;
  if (!base64) {
    throw new HttpError(
      502,
      'TTS_NO_AUDIO',
      'Gemini returned no audio payload',
    );
  }

  const pcm = Buffer.from(base64, 'base64');
  const wavBuffer = wrapPcmToWav(pcm, TTS_AUDIO_FORMAT);
  const durationSec = pcmDurationSec(pcm, TTS_AUDIO_FORMAT);

  const usage = (response as { usageMetadata?: Record<string, number> })
    .usageMetadata ?? {};
  const inputTextTokens = usage.promptTokenCount ?? 0;
  const outputAudioTokens =
    usage.candidatesTokenCount ??
    Math.ceil(durationSec * AUDIO_TOKENS_PER_SECOND);

  return {
    wavBuffer,
    durationSec,
    inputTextTokens,
    outputAudioTokens,
    model: TTS_MODEL,
  };
}
