// packages/api/src/services/memory/embeddings.test.ts
import { describe, it, expect, vi } from 'vitest';
import { embedText } from './embeddings.js';

describe('embedText', () => {
  it('calls OpenAI embeddings API and returns vector + usage', async () => {
    const mockOpenAI = {
      embeddings: {
        create: vi.fn().mockResolvedValue({
          data: [{ embedding: new Array(3072).fill(0.1) }],
          usage: { prompt_tokens: 42, total_tokens: 42 },
          model: 'text-embedding-3-large',
        }),
      },
    };
    const insertUsage = vi.fn().mockResolvedValue(undefined);

    const result = await embedText('hello world', {
      openai: mockOpenAI as never,
      model: 'text-embedding-3-large',
      insertUsage,
      userId: 'u1',
    });

    expect(result.embedding).toHaveLength(3072);
    expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
      model: 'text-embedding-3-large',
      input: 'hello world',
    });
    expect(insertUsage).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      kind: 'memory_embedding',
      model: 'text-embedding-3-large',
      promptTokens: 42,
    }));
  });

  it('propagates OpenAI errors', async () => {
    const mockOpenAI = {
      embeddings: { create: vi.fn().mockRejectedValue(new Error('rate limit')) },
    };
    await expect(
      embedText('x', {
        openai: mockOpenAI as never,
        model: 'text-embedding-3-large',
        insertUsage: vi.fn(),
        userId: 'u1',
      }),
    ).rejects.toThrow('rate limit');
  });
});
