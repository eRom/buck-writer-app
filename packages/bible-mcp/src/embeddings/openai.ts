const OPENAI_URL = 'https://api.openai.com/v1/embeddings';
const BATCH_SIZE = 100;

export const EMBEDDING_DIM: Record<string, number> = {
  'text-embedding-3-large': 3072,
  'text-embedding-3-small': 1536,
};

export interface EmbedOpts {
  apiKey: string;
  texts: string[];
  model?: string;
}

export async function embedBatch(opts: EmbedOpts): Promise<number[][]> {
  const model = opts.model ?? process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-large';
  const results: number[][] = [];
  for (let i = 0; i < opts.texts.length; i += BATCH_SIZE) {
    const batch = opts.texts.slice(i, i + BATCH_SIZE);
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: batch }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`OpenAI embeddings ${res.status}: ${err}`);
    }
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    for (const item of data.data) results.push(item.embedding);
  }
  return results;
}

export function getEmbeddingDim(model?: string): number {
  const m = model ?? process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-large';
  return EMBEDDING_DIM[m] ?? 3072;
}
