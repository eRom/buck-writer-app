import { OpenAIError } from './openai.js';

export const REALTIME_SESSIONS_URL = 'https://api.openai.com/v1/realtime/client_secrets';

export interface RealtimeSessionDescriptor {
  type: 'realtime';
  model: string;
  instructions?: string;
  voice?: string;
}

export interface MintOpts {
  apiKey: string;
  session: RealtimeSessionDescriptor;
  fetchImpl?: typeof fetch;
}

export interface MintedSecret {
  value: string;
  expiresAt: number;
}

export async function mintRealtimeClientSecret(opts: MintOpts): Promise<MintedSecret> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(REALTIME_SESSIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session: opts.session }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new OpenAIError(res.status, err);
  }
  const data = (await res.json()) as { value: string; expires_at: number };
  return { value: data.value, expiresAt: data.expires_at };
}
