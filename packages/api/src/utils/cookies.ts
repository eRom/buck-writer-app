/**
 * Cookie parsing helpers. Both middlewares (auth + csrf) use this to avoid
 * crashing on malformed `%` sequences (CWE-755) — a misbehaving client
 * shouldn't trigger a 500.
 */

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseCookies(
  raw: string | null | undefined,
): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (!k) continue;
    out[k] = safeDecode((v.join('=') ?? '').trim());
  }
  return out;
}
