-- 0009_chat_tools.sql — QW3 : builtin tools OpenAI pour le chat texte

ALTER TABLE `user_settings` ADD COLUMN `chat_tools_json` text NOT NULL DEFAULT '{"webSearch":false}';
