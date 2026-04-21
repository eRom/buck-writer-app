-- 0012_tts.sql — M9 : TTS Gemini (gemini-3.1-flash-tts-preview)
-- Cache par (message_id, voice) + voix par défaut dans user_settings

CREATE TABLE `tts_audio_cache` (
  `id` text PRIMARY KEY NOT NULL,
  `message_id` text NOT NULL,
  `user_id` text NOT NULL,
  `voice` text NOT NULL,
  `model` text NOT NULL,
  `audio_path` text NOT NULL,
  `mime_type` text NOT NULL DEFAULT 'audio/wav',
  `size_bytes` integer NOT NULL,
  `duration_sec` real,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE UNIQUE INDEX `tts_unique_msg_voice` ON `tts_audio_cache` (`message_id`, `voice`);--> statement-breakpoint
CREATE INDEX `tts_by_user` ON `tts_audio_cache` (`user_id`);--> statement-breakpoint

ALTER TABLE `user_settings` ADD COLUMN `tts_default_voice` text;
