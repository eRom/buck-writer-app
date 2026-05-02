-- Add annotations column for web_search_preview url_citation rendering (QW3b).
ALTER TABLE `messages` ADD COLUMN `annotations_json` text;
