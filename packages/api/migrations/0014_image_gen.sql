ALTER TABLE `messages` ADD `images_json` text;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `image_quality` text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `image_size` text DEFAULT '1024x1024' NOT NULL;