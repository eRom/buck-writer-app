-- 0007_realtime.sql — M8 Realtime voice

ALTER TABLE messages ADD COLUMN source TEXT NOT NULL DEFAULT 'text';
ALTER TABLE usage_events ADD COLUMN kind TEXT NOT NULL DEFAULT 'chat';

ALTER TABLE user_settings ADD COLUMN realtime_default_voice TEXT NOT NULL DEFAULT 'coral';
ALTER TABLE user_settings ADD COLUMN realtime_turn_detection_json TEXT NOT NULL DEFAULT '{"mode":"server_vad","threshold":0.5,"prefix_padding_ms":500,"silence_duration_ms":500,"interrupt_response":true}';
ALTER TABLE user_settings ADD COLUMN realtime_silence_timeout_sec INTEGER NOT NULL DEFAULT 30;
ALTER TABLE user_settings ADD COLUMN realtime_tools_json TEXT NOT NULL DEFAULT '{"bible":true,"writingTools":true,"webSearch":true}';

CREATE INDEX usage_events_kind_idx ON usage_events(user_id, kind, created_at);
CREATE INDEX messages_source_idx ON messages(session_id, source);
