-- Remove writing-tools MCP server (decommissioned 2026-05-01).
DELETE FROM `mcp_servers` WHERE `name` = 'writing-tools';
--> statement-breakpoint
-- Recreate realtime_tools_json with new default (sans writingTools).
-- SQLite ne supporte pas ALTER COLUMN DEFAULT → drop+add via colonne tampon.
ALTER TABLE `user_settings` ADD COLUMN `realtime_tools_json_new` text NOT NULL DEFAULT '{"bible":true,"webSearch":true}';
--> statement-breakpoint
UPDATE `user_settings` SET `realtime_tools_json_new` = '{"bible":true,"webSearch":true}';
--> statement-breakpoint
ALTER TABLE `user_settings` DROP COLUMN `realtime_tools_json`;
--> statement-breakpoint
ALTER TABLE `user_settings` RENAME COLUMN `realtime_tools_json_new` TO `realtime_tools_json`;
