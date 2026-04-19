-- 0007_realtime.sql — M8 Realtime voice

ALTER TABLE `messages` ADD COLUMN `source` text NOT NULL DEFAULT 'text';--> statement-breakpoint
ALTER TABLE `usage_events` ADD COLUMN `kind` text NOT NULL DEFAULT 'chat';--> statement-breakpoint
ALTER TABLE `user_settings` ADD COLUMN `realtime_default_voice` text NOT NULL DEFAULT 'coral';--> statement-breakpoint
ALTER TABLE `user_settings` ADD COLUMN `realtime_turn_detection_json` text NOT NULL DEFAULT '{"mode":"server_vad","threshold":0.5,"prefix_padding_ms":500,"silence_duration_ms":500,"interrupt_response":true}';--> statement-breakpoint
ALTER TABLE `user_settings` ADD COLUMN `realtime_silence_timeout_sec` integer NOT NULL DEFAULT 30;--> statement-breakpoint
ALTER TABLE `user_settings` ADD COLUMN `realtime_tools_json` text NOT NULL DEFAULT '{"bible":true,"writingTools":true,"webSearch":true}';--> statement-breakpoint
CREATE INDEX `usage_events_kind_idx` ON `usage_events` (`user_id`,`kind`,`created_at`);--> statement-breakpoint
CREATE INDEX `messages_source_idx` ON `messages` (`session_id`,`source`);
