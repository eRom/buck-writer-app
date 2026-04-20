-- 0011_mcp_call_events.sql — QW2 : observabilite des calls MCP

CREATE TABLE `mcp_call_events` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `session_id` text,
  `server_label` text NOT NULL,
  `tool_name` text NOT NULL,
  `status` text NOT NULL,
  `duration_ms` integer NOT NULL,
  `error_message` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE INDEX `mcp_call_events_user_created_idx` ON `mcp_call_events` (`user_id`, `created_at`);--> statement-breakpoint
CREATE INDEX `mcp_call_events_server_idx` ON `mcp_call_events` (`user_id`, `server_label`, `created_at`);
