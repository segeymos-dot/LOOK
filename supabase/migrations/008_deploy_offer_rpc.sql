-- Required for "Принять" / "Отклонить" buttons.
-- Safe to re-run: uses CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION accept_offer(p_offer_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id UUID;
  v_provider_id UUID;
  v_customer_id UUID;
  v_conversation_id UUID;
BEGIN
  SELECT o.request_id, o.provider_id, r.customer_id
  INTO v_request_id, v_provider_id, v_customer_id
  FROM offers o
  JOIN requests r ON r.id = o.request_id
  WHERE o.id = p_offer_id
    AND r.customer_id = auth.uid()
    AND o.status = 'pending'
    AND r.status = 'open';

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'Offer not found, not pending, or not authorized';
  END IF;

  UPDATE offers
  SET status = 'accepted', updated_at = NOW()
  WHERE id = p_offer_id;

  UPDATE offers
  SET status = 'rejected', updated_at = NOW()
  WHERE request_id = v_request_id
    AND id <> p_offer_id
    AND status = 'pending';

  UPDATE requests
  SET status = 'in_progress', updated_at = NOW()
  WHERE id = v_request_id;

  INSERT INTO conversations (request_id, customer_id, provider_id, offer_id)
  VALUES (v_request_id, v_customer_id, v_provider_id, p_offer_id)
  ON CONFLICT (request_id, provider_id)
  DO UPDATE SET
    offer_id = EXCLUDED.offer_id,
    last_message_at = NOW()
  RETURNING id INTO v_conversation_id;

  RETURN json_build_object(
    'conversation_id', v_conversation_id,
    'request_id', v_request_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION reject_offer(p_offer_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id UUID;
BEGIN
  SELECT o.request_id
  INTO v_request_id
  FROM offers o
  JOIN requests r ON r.id = o.request_id
  WHERE o.id = p_offer_id
    AND r.customer_id = auth.uid()
    AND o.status = 'pending';

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'Offer not found, not pending, or not authorized';
  END IF;

  UPDATE offers
  SET status = 'rejected', updated_at = NOW()
  WHERE id = p_offer_id;

  RETURN json_build_object('request_id', v_request_id);
END;
$$;

REVOKE ALL ON FUNCTION accept_offer(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION reject_offer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_offer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_offer(UUID) TO authenticated;

DROP POLICY IF EXISTS "Participants can update conversations" ON public.conversations;
CREATE POLICY "Participants can update conversations"
  ON public.conversations
  FOR UPDATE
  USING (auth.uid() = customer_id OR auth.uid() = provider_id);
