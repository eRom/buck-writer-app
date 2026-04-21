import { z } from 'zod';
import { loadDotenv } from './utils/find-up.js';

// Load .env from closest parent directory (works in worktrees, monorepo root, Docker)
loadDotenv();

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  AUTH_JWT_SECRET: z.string().min(32, 'AUTH_JWT_SECRET must be >=32 chars'),
  AUTH_ALLOWED_EMAILS: z
    .string()
    .min(1)
    .transform((s) =>
      s
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM: z.string().email().optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  WORKSPACE_DIR: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  MCP_BIBLE_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // M5 Memory
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  BUCK_USER_ID: z.string().uuid().optional(),
  MEMORY_ENABLED: z.coerce.boolean().default(false),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-large'),
  EDGE_INVOKE_KEY: z.string().min(1).optional(),
  /**
   * Cosine similarity floor for `recall`. Values below this are filtered out
   * by the `match_memories` RPC. text-embedding-3-large on short French
   * prompts tops out around 0.7–0.8 even for semantic matches, so 0.7 was
   * too strict (empirical fail: "Quel est mon langage préféré ?" vs "Le
   * langage préféré de Philippe est X" measured at ~0.65). 0.5 keeps noise
   * out while letting legitimate recalls through. Raise in prod if false
   * positives surface.
   */
  MEMORY_RECALL_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),
  /**
   * Set to true ONLY when the API sits behind a trusted reverse proxy
   * (Caddy on the same VPS) that overwrites X-Forwarded-For with the real
   * client IP. When false, X-Forwarded-For is ignored for rate-limit keys
   * and the TCP socket peer address is used instead.
   */
  TRUST_PROXY: z.coerce.boolean().default(false),
  /**
   * Cookie Domain attribute for buck_session. Set to a parent domain
   * (e.g. ".romain-ecarnot.com") to share the session cookie across
   * subdomains for Caddy forward_auth SSO. When absent, the cookie is
   * scoped to the current host only (default browser behaviour).
   */
  COOKIE_DOMAIN: z.string().min(1).optional(),
});

export type Env = z.infer<typeof Schema>;

export function loadEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Env {
  return Schema.parse(source);
}
