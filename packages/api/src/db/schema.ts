import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// ---------- auth ----------

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    createdAt: integer('created_at').notNull(),
    lastLoginAt: integer('last_login_at'),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
  }),
);

export const authTokens = sqliteTable(
  'auth_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at').notNull(),
    usedAt: integer('used_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex('auth_tokens_hash_idx').on(t.tokenHash),
  }),
);

export const sessionsAuth = sqliteTable(
  'sessions_auth',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    scope: text('scope').notNull().default('app'),
    userAgent: text('user_agent'),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex('sessions_auth_hash_idx').on(t.tokenHash),
    userIdx: index('sessions_auth_user_idx').on(t.userId),
  }),
);

// ---------- chat ----------

export const chatSessions = sqliteTable(
  'chat_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    model: text('model').notNull(),
    reasoningEffort: text('reasoning_effort').notNull(),
    isFavorite: integer('is_favorite').notNull().default(0),
    archived: integer('archived').notNull().default(0),
    deletedAt: integer('deleted_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    lastMessageAt: integer('last_message_at'),
    lastResponseId: text('last_response_id'),
  },
  (t) => ({
    userIdx: index('chat_sessions_user_idx').on(t.userId),
    updatedIdx: index('chat_sessions_updated_idx').on(t.updatedAt),
    favoriteIdx: index('chat_sessions_favorite_idx').on(t.isFavorite),
  }),
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    contentJson: text('content_json').notNull(),
    model: text('model'),
    toolMeta: text('tool_meta'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    sessionIdx: index('messages_session_idx').on(t.sessionId),
  }),
);

export const attachments = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id').references(() => messages.id, {
      onDelete: 'cascade',
    }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    path: text('path').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    messageIdx: index('attachments_message_idx').on(t.messageId),
    userIdx: index('attachments_user_idx').on(t.userId),
  }),
);

// ---------- usage & cost ----------

export const usageEvents = sqliteTable(
  'usage_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => chatSessions.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    reasoningTokens: integer('reasoning_tokens').notNull().default(0),
    cachedInputTokens: integer('cached_input_tokens').notNull().default(0),
    audioInputSeconds: real('audio_input_seconds').notNull().default(0),
    audioOutputSeconds: real('audio_output_seconds').notNull().default(0),
    costUsd: real('cost_usd').notNull(),
    reasoningEffort: text('reasoning_effort'),
  },
  (t) => ({
    userMonthIdx: index('usage_user_created_idx').on(t.userId, t.createdAt),
    sessionIdx: index('usage_session_idx').on(t.sessionId),
  }),
);

export const alertTriggers = sqliteTable(
  'alert_triggers',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    yearMonth: text('year_month').notNull(),
    thresholdPercent: integer('threshold_percent').notNull(),
    triggeredAt: integer('triggered_at').notNull(),
  },
  (t) => ({
    uniq: uniqueIndex('alert_triggers_uniq').on(
      t.userId,
      t.yearMonth,
      t.thresholdPercent,
    ),
  }),
);

// ---------- settings ----------

export const userSettings = sqliteTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  monthlyCostLimitUsd: real('monthly_cost_limit_usd').notNull().default(20),
  alertThresholdsJson: text('alert_thresholds_json')
    .notNull()
    .default('[80,100]'),
  hardStop: integer('hard_stop').notNull().default(1),
  defaultModel: text('default_model').notNull().default('gpt-5.4-mini'),
  defaultReasoningEffort: text('default_reasoning_effort')
    .notNull()
    .default('low'),
  billingResetDay: integer('billing_reset_day').notNull().default(1),
  memoryUsageSyncCursor: integer('memory_usage_sync_cursor', { mode: 'timestamp_ms' }),
});

// ---------- mcp ----------

export const mcpServers = sqliteTable(
  'mcp_servers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    core: integer('core').notNull().default(0),
    enabled: integer('enabled').notNull().default(1),
    transport: text('transport').notNull(),
    configJson: text('config_json').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    nameIdx: uniqueIndex('mcp_servers_name_idx').on(t.name),
  }),
);
