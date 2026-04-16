import { z } from 'zod';

export const AuthRequestInput = z.object({
  email: z.string().email().max(254),
});
export type AuthRequestInput = z.infer<typeof AuthRequestInput>;

export const AuthCallbackInput = z.object({
  token: z.string().min(16).max(256),
});
export type AuthCallbackInput = z.infer<typeof AuthCallbackInput>;
