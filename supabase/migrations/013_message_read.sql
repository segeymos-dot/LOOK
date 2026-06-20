-- Allow conversation participants to mark incoming messages as read

CREATE OR REPLACE FUNCTION mark_conversation_read(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = p_conversation_id
      AND (c.customer_id = auth.uid() OR c.provider_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Conversation not found or not authorized';
  END IF;

  UPDATE messages
  SET read_at = NOW()
  WHERE conversation_id = p_conversation_id
    AND sender_id <> auth.uid()
    AND read_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION mark_conversation_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_conversation_read(UUID) TO authenticated;
