CREATE TABLE `todos` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `text` text NOT NULL,
  `done` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `todos_user_idx` ON `todos` (`user_id`,`created_at`);
