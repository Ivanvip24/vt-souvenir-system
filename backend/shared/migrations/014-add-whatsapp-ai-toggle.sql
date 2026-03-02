-- Migration 014: Add per-chat AI toggle to WhatsApp conversations
-- Allows admins to disable AI auto-replies for individual conversations

ALTER TABLE whatsapp_conversations
ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true;
