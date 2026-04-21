import { GoogleGenAI } from '@google/genai';
import { TTS_MODEL, AUDIO_TOKENS_PER_SECOND } from '@buck/shared';
import { HttpError } from '../../utils/http-error.js';
import { wrapPcmToWav, pcmDurationSec, type WavFormat } from './wav-encoder.js';

export const TTS_AUDIO_FORMAT: WavFormat = {
  sampleRate: 24000,
  bitsPerSample: 16,
  channels: 1,
};

export const TTS_REQUEST_TIMEOUT_MS = 30_000;

export interface SynthesizeParams {
  apiKey: string;
  text: string;
  voice: string;
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
  timeoutMs?: number;
}

// Transient infra errors worth a single retry. Explicitly excludes:
//   - 400 (bad request), 401/403 (auth), 404 (model), 422 (invalid param),
//     429 RESOURCE_EXHAUSTED (quota — retrying costs money without changing
//     the outcome), and anything user-fixable.
function isRetriableTransient(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  if (/RESOURCE_EXHAUSTED|quota|rate[_\s-]?limit/i.test(msg)) return false;
  if (/\b(500|502|503|504)\b/.test(msg)) return true;
  if (/INTERNAL|UNAVAILABLE|DEADLINE_EXCEEDED/i.test(msg)) return true;
  return false;
}

function isQuotaExhausted(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /RESOURCE_EXHAUSTED|quota/i.test(msg);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new HttpError(504, 'tts_timeout', `${label} exceeded ${ms}ms`));
    }, ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function synthesize(
  params: SynthesizeParams,
  deps: SynthesizeDeps = {},
): Promise<SynthesisResult> {
  const ai = deps.genAI ?? new GoogleGenAI({ apiKey: params.apiKey });
  const timeoutMs = deps.timeoutMs ?? TTS_REQUEST_TIMEOUT_MS;

  const call = (): Promise<unknown> =>
    withTimeout(
      ai.models.generateContent({
        model: TTS_MODEL,
        contents: [{ parts: [{ text: params.text }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: params.voice },
            },
          },
        },
      }) as Promise<unknown>,
      timeoutMs,
      'Gemini TTS request',
    );

  let response: unknown;
  try {
    response = await call();
  } catch (err) {
    if (isQuotaExhausted(err)) {
      throw new HttpError(
        429,
        'tts_quota_exhausted',
        'Gemini TTS quota exhausted',
      );
    }
    if (isRetriableTransient(err)) {
      try {
        response = await call();
      } catch (retryErr) {
        throw new HttpError(
          502,
          'TTS_GEMINI_FAILED',
          `Gemini TTS request failed after retry: ${(retryErr as Error).message}`,
        );
      }
    } else if (err instanceof HttpError) {
      throw err;
    } else {
      throw new HttpError(
        502,
        'TTS_GEMINI_FAILED',
        `Gemini TTS request failed: ${(err as Error).message}`,
      );
    }
  }

  const r = response as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { data?: string } }> };
    }>;
    usageMetadata?: Record<string, number>;
  };
  const inlineData = r.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  const base64 = inlineData?.data;
  if (!base64) {
    throw new HttpError(
      502,
      'TTS_NO_AUDIO',
      'Gemini returned no audio payload',
    );
  }

  const pcm = Buffer.from(base64, 'base64');
  if (pcm.length === 0) {
    throw new HttpError(502, 'TTS_NO_AUDIO', 'Gemini returned empty audio');
  }
  const wavBuffer = wrapPcmToWav(pcm, TTS_AUDIO_FORMAT);
  const durationSec = pcmDurationSec(pcm, TTS_AUDIO_FORMAT);

  const usage = r.usageMetadata ?? {};
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
