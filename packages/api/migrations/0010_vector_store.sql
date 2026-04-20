-- 0010_vector_store.sql — M8A : file_search sur workspace/knowledge/ via OpenAI vector store

ALTER TABLE `user_settings` ADD COLUMN `vector_store_id` text;--> statement-breakpoint
ALTER TABLE `user_settings` ADD COLUMN `vector_store_last_sync_at` integer;--> statement-breakpoint

CREATE TABLE `workspace_vector_files` (
  `user_id` text NOT NULL,
  `workspace_path` text NOT NULL,
  `openai_file_id` text NOT NULL,
  `mtime_ms` integer NOT NULL,
  `sha256` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `uploaded_at` integer NOT NULL,
  PRIMARY KEY (`user_id`, `workspace_path`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE INDEX `workspace_vector_files_file_id_idx` ON `workspace_vector_files` (`openai_file_id`);
