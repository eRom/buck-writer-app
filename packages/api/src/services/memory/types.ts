// packages/api/src/services/memory/types.ts
import { z } from 'zod';

export const MemoryType = z.enum(['episodic', 'semantic', 'procedural']);
export type MemoryType = z.infer<typeof MemoryType>;

export const RememberInput = z.object({
  content: z.string().min(1).max(2000),
  type: z.enum(['episodic', 'semantic']),
  importance: z.number().min(0).max(1).default(0.5),
  metadata: z.record(z.unknown()).optional(),
});
export type RememberInput = z.infer<typeof RememberInput>;

export const RecallInput = z.object({
  query: z.string().min(1).max(500),
  type: z.enum(['episodic', 'semantic']).optional(),
  count: z.number().int().min(1).max(20).default(5),
});
export type RecallInput = z.infer<typeof RecallInput>;

export interface RecallResult {
  id: string;
  content: string;
  memory_type: MemoryType;
  metadata: Record<string, unknown>;
  importance: number;
  similarity: number;
  created_at: string;
}

export interface MemoryContext {
  preferences: Record<string, unknown>;
  activeContext: Record<string, unknown>;
  degraded: boolean;
}

export interface BuckStateRow {
  user_id: string;
  tier: 'static' | 'context';
  key: string;
  value: unknown;
  token_budget: number | null;
  updated_at: string;
}
