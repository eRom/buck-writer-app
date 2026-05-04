import { OpenAIError } from './openai.js';

export const REALTIME_SESSIONS_URL = 'https://api.openai.com/v1/realtime/client_secrets';

// Defense-in-depth ceiling on OpenAI ephemeral key lifetime (REC-09). Today
// OpenAI mints short-lived secrets (~1-2 min observed); this guard catches
// any future regression that would issue a longer-lived credential exposed
// to the browser via WebRTC.
export const REALTIME_MAX_TTL_SECONDS = 600;

// Le mint `/v1/realtime/client_secrets` n'accepte QUE `type` + `model` dans
// le session descriptor. Tout le reste (voice, instructions, turn_detection,
// tools, modalities, input_audio_transcription) doit être envoyé plus tard
// via un event `session.update` sur le DataChannel WebRTC.
export interface RealtimeSessionDescriptor {
  type: 'realtime';
  model: string;
}

export interface MintOpts {
  apiKey: string;
  session: RealtimeSessionDescriptor;
  fetchImpl?: typeof fetch;
  /**
   * `Date.now`-shaped clock for deterministic tests of the TTL audit. Falls
   * back to wall clock at runtime.
   */
  nowMs?: () => number;
}

export interface MintedSecret {
  value: string;
  expiresAt: number;
}

export async function mintRealtimeClientSecret(opts: MintOpts): Promise<MintedSecret> {
  const f = opts.fetchImpl ?? fetch;
  const now = opts.nowMs ?? Date.now;
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

  // REC-09: audit the issued TTL. expires_at is a unix-seconds timestamp.
  const ttlSeconds = data.expires_at - Math.floor(now() / 1000);
  if (ttlSeconds > REALTIME_MAX_TTL_SECONDS) {
    throw new OpenAIError(502, {
      error: {
        message:
          `realtime: refusing ephemeral key with TTL ${ttlSeconds}s ` +
          `(cap ${REALTIME_MAX_TTL_SECONDS}s)`,
      },
    });
  }
  // Coarse log so an operator can spot drift via `docker logs | grep realtime:`.
  // Never log `data.value` — it's a credential.
  if (ttlSeconds > 300) {
    console.warn(`[realtime] suspicious long ephemeral TTL ${ttlSeconds}s`);
  }

  return { value: data.value, expiresAt: data.expires_at };
}
