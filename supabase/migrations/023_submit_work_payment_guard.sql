-- Enforce payment before provider work submission (server-side, cannot be bypassed via direct RPC).
-- Mirrors src/lib/payments/work-submission-guard.ts

CREATE OR REPLACE FUNCTION submit_work(
  p_request_id UUID,
  p_summary TEXT,
  p_attachments JSONB DEFAULT '[]'::jsonb
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status request_status;
  v_provider_id UUID;
  v_revision INTEGER;
  v_submission_id UUID;
  v_conversation_id UUID;
  v_payment_status payment_status;
  v_order_payment_status TEXT;
  v_is_paid BOOLEAN := false;
BEGIN
  SELECT r.status, o.provider_id
  INTO v_status, v_provider_id
  FROM requests r
  JOIN offers o ON o.request_id = r.id AND o.status = 'accepted'
  WHERE r.id = p_request_id;

  IF v_provider_id IS NULL OR v_provider_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to submit work for this order';
  END IF;

  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Work can only be submitted while order is in progress';
  END IF;

  -- Payment guard: work submission requires a successful order payment.
  -- Primary check: payments ledger (migration 012+).
  -- Application layer (work-submission-guard.ts) also accepts order_payment_status
  -- when migration 022 columns exist.
  SELECT status INTO v_payment_status
  FROM payments
  WHERE request_id = p_request_id;

  IF v_payment_status = 'paid' THEN
    v_is_paid := true;
  END IF;

  IF NOT v_is_paid AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'requests'
      AND column_name = 'order_payment_status'
  ) THEN
    EXECUTE format(
      'SELECT order_payment_status::text FROM requests WHERE id = %L',
      p_request_id
    ) INTO v_order_payment_status;

    IF v_order_payment_status IN ('paid', 'completed') THEN
      v_is_paid := true;
    END IF;
  END IF;

  IF NOT v_is_paid THEN
    RAISE EXCEPTION 'PAYMENT_REQUIRED: Order must be paid before work can be submitted.';
  END IF;

  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_revision
  FROM work_submissions WHERE request_id = p_request_id;

  INSERT INTO work_submissions (request_id, provider_id, summary, attachments, revision_number)
  VALUES (p_request_id, v_provider_id, TRIM(p_summary), COALESCE(p_attachments, '[]'::jsonb), v_revision)
  RETURNING id INTO v_submission_id;

  UPDATE requests
  SET status = 'pending_review',
      work_submitted_at = NOW(),
      revision_feedback = NULL,
      updated_at = NOW()
  WHERE id = p_request_id;

  SELECT id INTO v_conversation_id
  FROM conversations
  WHERE request_id = p_request_id
  LIMIT 1;

  IF v_conversation_id IS NOT NULL THEN
    INSERT INTO messages (conversation_id, sender_id, content, delivered_at)
    VALUES (
      v_conversation_id,
      v_provider_id,
      '📋 Работа сдана на проверку заказчику.',
      NOW()
    );
    UPDATE conversations SET updated_at = NOW() WHERE id = v_conversation_id;
  END IF;

  RETURN json_build_object(
    'submission_id', v_submission_id,
    'request_id', p_request_id,
    'status', 'pending_review',
    'revision_number', v_revision
  );
END;
$$;

REVOKE ALL ON FUNCTION submit_work(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_work(UUID, TEXT, JSONB) TO authenticated;
