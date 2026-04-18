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
});

export type Env = z.infer<typeof Schema>;

export function loadEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Env {
  return Schema.parse(source);
}
