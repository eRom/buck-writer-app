import { z } from 'zod';
import { MODELS } from './chat.js';
import { REALTIME_VOICES } from '../voice/voices.js';

const TurnDetection = z.object({
  mode: z.enum(['server_vad', 'semantic_vad']),
  threshold: z.number().min(0).max(1),
  prefix_padding_ms: z.number().int().min(0).max(5000),
  silence_duration_ms: z.number().int().min(0).max(5000),
  interrupt_response: z.boolean(),
});
export type TurnDetectionInput = z.infer<typeof TurnDetection>;

const RealtimeTools = z.object({
  bible: z.boolean(),
  writingTools: z.boolean(),
  webSearch: z.boolean(),
});

const ChatTools = z.object({
  webSearch: z.boolean(),
  fileSearch: z.boolean().optional(),
});

export const UpdateSettingsInput = z.object({
  monthlyCostLimitUsd: z.number().min(1).max(10000).optional(),
  hardStop: z.boolean().optional(),
  billingResetDay: z.number().int().min(1).max(28).optional(),
  defaultModel: z.enum(MODELS).optional(),
  defaultReasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
  realtimeDefaultVoice: z.enum(REALTIME_VOICES).optional(),
  realtimeTurnDetection: TurnDetection.optional(),
  realtimeSilenceTimeoutSec: z.number().int().min(10).max(60).optional(),
  realtimeTools: RealtimeTools.optional(),
  chatTools: ChatTools.optional(),
});
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsInput>;

export const SettingsResponse = z.object({
  defaultModel: z.string(),
  defaultReasoningEffort: z.string(),
  monthlyCostLimitUsd: z.number(),
  alertThresholds: z.array(z.number()),
  hardStop: z.boolean(),
  billingResetDay: z.number(),
  realtimeDefaultVoice: z.string(),
  realtimeTurnDetection: TurnDetection,
  realtimeSilenceTimeoutSec: z.number(),
  realtimeTools: RealtimeTools,
  chatTools: ChatTools,
  vectorStoreId: z.string().nullable(),
  vectorStoreLastSyncAt: z.number().nullable(),
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
