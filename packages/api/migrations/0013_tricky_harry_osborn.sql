-- M6 — extraction MarkItDown : 4 colonnes d'état + source + index statut
ALTER TABLE `attachments` ADD `extracted_text` text;--> statement-breakpoint
ALTER TABLE `attachments` ADD `extraction_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `attachments` ADD `extraction_error` text;--> statement-breakpoint
ALTER TABLE `attachments` ADD `extracted_at` integer;--> statement-breakpoint
ALTER TABLE `attachments` ADD `extraction_source` text;--> statement-breakpoint
CREATE INDEX `attachments_status_idx` ON `attachments` (`extraction_status`);
