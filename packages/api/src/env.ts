import { z } from 'zod';

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
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM: z.string().email(),
  OPENAI_API_KEY: z.string().min(1),
  PUBLIC_BASE_URL: z.string().url(),
  WORKSPACE_DIR: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  MCP_BIBLE_URL: z.string().url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof Schema>;

export function loadEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Env {
  return Schema.parse(source);
}
