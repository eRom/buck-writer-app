import { z } from 'zod';
import { MODELS } from './chat.js';

export const UpdateSettingsInput = z.object({
  monthlyCostLimitUsd: z.number().min(1).max(10000).optional(),
  hardStop: z.boolean().optional(),
  billingResetDay: z.number().int().min(1).max(28).optional(),
  defaultModel: z.enum(MODELS).optional(),
  defaultReasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
});
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsInput>;

export const SettingsResponse = z.object({
  defaultModel: z.string(),
  defaultReasoningEffort: z.string(),
  monthlyCostLimitUsd: z.number(),
  alertThresholds: z.array(z.number()),
  hardStop: z.boolean(),
  billingResetDay: z.number(),
});
export type SettingsResponse = z.infer<typeof SettingsResponse>;

export const UsageResponse = z.object({
  totalUsd: z.number(),
  limitUsd: z.number(),
  percent: z.number(),
  periodStart: z.number(),
  periodEnd: z.number(),
  daysRemaining: z.number(),
  resetDay: z.number(),
  alerts: z.array(z.object({
    percent: z.number(),
    triggeredAt: z.number().nullable(),
  })),
});
export type UsageResponse = z.infer<typeof UsageResponse>;
