import { z } from 'zod';

export const MODELS = ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano'] as const;
export type ChatModel = (typeof MODELS)[number];

export const CreateSessionInput = z.object({
  title: z.string().max(200).optional(),
  model: z.enum(MODELS).optional(),
});
export type CreateSessionInput = z.infer<typeof CreateSessionInput>;

export const UpdateSessionInput = z.object({
  title: z.string().max(200).optional(),
  archived: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
  model: z.enum(MODELS).optional(),
  reasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
});
export type UpdateSessionInput = z.infer<typeof UpdateSessionInput>;

export const SessionsQueryInput = z.object({
  q: z.string().max(200).optional(),
  archived: z.coerce.number().int().min(0).max(1).optional().default(0),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});
export type SessionsQueryInput = z.infer<typeof SessionsQueryInput>;

export const MessagesQueryInput = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});
export type MessagesQueryInput = z.infer<typeof MessagesQueryInput>;

export const ChatRequestInput = z.object({
  sessionId: z.string().uuid().optional(),
  model: z.enum(MODELS).optional(),
});
export type ChatRequestInput = z.infer<typeof ChatRequestInput>;
