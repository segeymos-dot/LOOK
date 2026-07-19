-- Required for chat attachments / delivery status (subset of 017).
-- Safe to re-run.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ DEFAULT NOW();

UPDATE messages SET delivered_at = created_at WHERE delivered_at IS NULL;
