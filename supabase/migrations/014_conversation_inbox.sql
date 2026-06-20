-- Inbox metadata for chat list: last message preview + unread counts

CREATE OR REPLACE FUNCTION get_conversation_inbox()
RETURNS TABLE (
  conversation_id UUID,
  last_content TEXT,
  last_created_at TIMESTAMPTZ,
  last_sender_id UUID,
  unread_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    c.id AS conversation_id,
    (
      SELECT m.content
      FROM messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC
      LIMIT 1
    ) AS last_content,
    COALESCE(
      (
        SELECT m.created_at
        FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ),
      c.last_message_at
    ) AS last_created_at,
    (
      SELECT m.sender_id
      FROM messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC
      LIMIT 1
    ) AS last_sender_id,
    (
      SELECT COUNT(*)::BIGINT
      FROM messages m
      WHERE m.conversation_id = c.id
        AND m.sender_id <> auth.uid()
        AND m.read_at IS NULL
    ) AS unread_count
  FROM conversations c
  WHERE c.customer_id = auth.uid()
     OR c.provider_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION get_conversation_inbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_conversation_inbox() TO authenticated;
