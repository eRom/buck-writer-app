import { describe, it, expect } from 'vitest';
import { synthesize } from './gemini-client.js';
import { HttpError } from '../../utils/http-error.js';
import type { GoogleGenAI } from '@google/genai';

function makeMockGenAI(
  impl: (...args: unknown[]) => Promise<unknown>,
): GoogleGenAI {
  return {
    models: { generateContent: impl },
  } as unknown as GoogleGenAI;
}

function fakeSuccessResponse(base64Pcm: string, usage?: Record<string, number>) {
  return {
    candidates: [
      {
        content: {
          parts: [
            { inlineData: { data: base64Pcm, mimeType: 'audio/pcm' } },
          ],
        },
      },
    ],
    usageMetadata: usage,
  };
}

// Helper — a minimal valid PCM buffer
function pcmBase64(sizeBytes: number): string {
  return Buffer.alloc(sizeBytes).toString('base64');
}

describe('synthesize', () => {
  it('returns a WAV buffer and duration from Gemini response', async () => {
    const pcm = pcmBase64(24000 * 2); // 1 second of 24kHz/16-bit/mono
    const genAI = makeMockGenAI(async () =>
      fakeSuccessResponse(pcm, { promptTokenCount: 10, candidatesTokenCount: 32 }),
    );
    const result = await synthesize(
      { apiKey: 'k', text: 'hi', voice: 'Kore' },
      { genAI },
    );
    expect(result.model).toBe('gemini-3.1-flash-tts-preview');
    expect(result.durationSec).toBeCloseTo(1, 3);
    expect(result.wavBuffer.subarray(0, 4).toString()).toBe('RIFF');
    expect(result.inputTextTokens).toBe(10);
    expect(result.outputAudioTokens).toBe(32);
  });

  it('estimates output tokens when usage metadata missing', async () => {
    const pcm = pcmBase64(24000 * 2); // 1 sec → 32 tokens estimate
    const genAI = makeMockGenAI(async () => fakeSuccessResponse(pcm));
    const result = await synthesize(
      { apiKey: 'k', text: 'hi', voice: 'Kore' },
      { genAI },
    );
    expect(result.outputAudioTokens).toBe(32);
    expect(result.inputTextTokens).toBe(0);
  });

  it('retries once on a transient 500 then succeeds', async () => {
    const pcm = pcmBase64(24000 * 2);
    let calls = 0;
    const genAI = makeMockGenAI(async () => {
      calls += 1;
      if (calls === 1) throw new Error('500 INTERNAL error from backend');
      return fakeSuccessResponse(pcm);
    });
    const result = await synthesize(
      { apiKey: 'k', text: 'hi', voice: 'Kore' },
      { genAI },
    );
    expect(calls).toBe(2);
    expect(result.wavBuffer.length).toBeGreaterThan(44);
  });

  it('throws HttpError 502 after 2 consecutive 500s', async () => {
    const genAI = makeMockGenAI(async () => {
      throw new Error('500 INTERNAL');
    });
    await expect(
      synthesize(
        { apiKey: 'k', text: 'hi', voice: 'Kore' },
        { genAI },
      ),
    ).rejects.toMatchObject({ status: 502, code: 'TTS_GEMINI_FAILED' });
  });

  it('does NOT retry on RESOURCE_EXHAUSTED (quota) — throws 429 directly', async () => {
    let calls = 0;
    const genAI = makeMockGenAI(async () => {
      calls += 1;
      throw new Error('429 RESOURCE_EXHAUSTED: quota hit');
    });
    await expect(
      synthesize(
        { apiKey: 'k', text: 'hi', voice: 'Kore' },
        { genAI },
      ),
    ).rejects.toMatchObject({ status: 429, code: 'tts_quota_exhausted' });
    expect(calls).toBe(1);
  });

  it('throws HttpError 502 on non-transient error', async () => {
    const genAI = makeMockGenAI(async () => {
      throw new Error('400 invalid voice');
    });
    await expect(
      synthesize(
        { apiKey: 'k', text: 'hi', voice: 'Kore' },
        { genAI },
      ),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it('times out after the configured delay', async () => {
    const genAI = makeMockGenAI(
      () => new Promise<unknown>(() => {}), // never resolves
    );
    await expect(
      synthesize(
        { apiKey: 'k', text: 'hi', voice: 'Kore' },
        { genAI, timeoutMs: 50 },
      ),
    ).rejects.toMatchObject({ status: 504, code: 'tts_timeout' });
  });

  it('throws TTS_NO_AUDIO on empty PCM payload', async () => {
    const genAI = makeMockGenAI(async () => fakeSuccessResponse(''));
    await expect(
      synthesize(
        { apiKey: 'k', text: 'hi', voice: 'Kore' },
        { genAI },
      ),
    ).rejects.toMatchObject({ code: 'TTS_NO_AUDIO' });
  });

  it('throws TTS_NO_AUDIO when response has no inlineData.data', async () => {
    const genAI = makeMockGenAI(async () => ({
      candidates: [{ content: { parts: [{ text: 'oops' }] } }],
    }));
    await expect(
      synthesize(
        { apiKey: 'k', text: 'hi', voice: 'Kore' },
        { genAI },
      ),
    ).rejects.toMatchObject({ code: 'TTS_NO_AUDIO', status: 502 });
  });

});
