ALTER TABLE `usage_events` ADD `cached_input_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_sessions` ADD `last_response_id` text;
