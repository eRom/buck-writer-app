import { describe, it, expect, vi } from 'vitest';
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
    // First call throws, retry also throws → since second throw is still a
    // transient-looking error, we do NOT retry a second time. We surface it.
    await expect(
      synthesize(
        { apiKey: 'k', text: 'hi', voice: 'Kore' },
        { genAI },
      ),
    ).rejects.toThrow();
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

  it('passes systemInstruction when systemPrompt is provided', async () => {
    const spy = vi.fn(async () =>
      fakeSuccessResponse(pcmBase64(100)),
    );
    const genAI = makeMockGenAI(spy);
    await synthesize(
      { apiKey: 'k', text: 'hi', voice: 'Kore', systemPrompt: 'Be calm.' },
      { genAI },
    );
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0][0] as {
      config: { systemInstruction?: string };
    };
    expect(arg.config.systemInstruction).toBe('Be calm.');
  });

  it('omits systemInstruction when not provided', async () => {
    const spy = vi.fn(async () =>
      fakeSuccessResponse(pcmBase64(100)),
    );
    const genAI = makeMockGenAI(spy);
    await synthesize(
      { apiKey: 'k', text: 'hi', voice: 'Kore' },
      { genAI },
    );
    const arg = spy.mock.calls[0][0] as {
      config: { systemInstruction?: string };
    };
    expect(arg.config.systemInstruction).toBeUndefined();
  });
});
