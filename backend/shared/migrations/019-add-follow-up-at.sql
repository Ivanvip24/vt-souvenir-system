-- 019: Add follow_up_at column to whatsapp_conversations for follow-up timer

ALTER TABLE whatsapp_conversations
ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_wa_conv_follow_up ON whatsapp_conversations(follow_up_at);
