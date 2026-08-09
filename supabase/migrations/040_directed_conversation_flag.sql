-- Mark conversations created via public profile "Propose order" (directed requests).
-- Marketplace offer→conversation flows leave this false.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS is_directed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_conversations_provider_directed
  ON conversations (provider_id, is_directed)
  WHERE is_directed = true;

-- Backfill: invite conversations created before any offer (offer_id still null).
UPDATE conversations
SET is_directed = true
WHERE offer_id IS NULL
  AND is_directed = false;

-- Backfill: conversation existed before this provider's offer (directed → later offer).
UPDATE conversations c
SET is_directed = true
FROM offers o
WHERE o.request_id = c.request_id
  AND o.provider_id = c.provider_id
  AND c.created_at < o.created_at
  AND c.is_directed = false;
