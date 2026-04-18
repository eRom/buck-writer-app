// packages/api/supabase/functions/_shared/auth.ts
export function requireBearer(req: Request, expectedKey: string | undefined): Response | null {
  if (!expectedKey) return new Response('EDGE_INVOKE_KEY not configured', { status: 500 });
  const header = req.headers.get('Authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1] !== expectedKey) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
}
