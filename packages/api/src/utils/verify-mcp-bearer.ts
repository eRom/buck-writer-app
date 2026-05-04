import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time comparison of an incoming Authorization header against the
 * expected `Bearer <MCP_SHARED_SECRET>` value. Guards against timing-side-
 * channel exfiltration of the secret (CWE-208).
 *
 * Length-mismatch short-circuits because `timingSafeEqual` throws on
 * different buffer sizes; the header length itself is not the secret.
 */
export function verifyMcpBearer(
  authHeader: string,
  expectedSecret: string,
): boolean {
  const a = Buffer.from(authHeader);
  const b = Buffer.from(`Bearer ${expectedSecret}`);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
