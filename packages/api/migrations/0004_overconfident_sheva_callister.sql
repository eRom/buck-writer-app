ALTER TABLE `chat_sessions` ADD `is_favorite` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `chat_sessions_favorite_idx` ON `chat_sessions` (`is_favorite`);
