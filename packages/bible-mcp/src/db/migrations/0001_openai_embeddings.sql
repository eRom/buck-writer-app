-- Migration 0001: reset embeddings for OpenAI text-embedding-3-large (3072 dims)
-- The embedding BLOB format changes from 384-dim (HuggingFace) to 3072-dim (OpenAI)
-- Drop and recreate embeddings table, add embeddings_meta tracking table

DROP TABLE IF EXISTS embeddings;
--> statement-breakpoint
CREATE TABLE `embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`embedding` blob NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `embeddings_entity_type_entity_id_unique` ON `embeddings` (`entity_type`,`entity_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `embeddings_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
INSERT OR REPLACE INTO `embeddings_meta` (`key`, `value`) VALUES ('model', 'text-embedding-3-large');
INSERT OR REPLACE INTO `embeddings_meta` (`key`, `value`) VALUES ('dim', '3072');
