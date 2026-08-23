-- Safe cancel / test-refund / dispute for paid orders.
-- Unpaid orders cancel immediately.
-- Paid orders before work submission → test refund (service_role RPC).
-- Paid orders after work started/submitted → dispute (no instant refund).

DO $$ BEGIN
  CREATE TYPE refund_dispute_status AS ENUM (
    'none',
    'refund_pending',
    'refunded',
    'dispute_opened',
    'refund_rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS refund_dispute_status refund_dispute_status NOT NULL DEFAULT 'none';

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(12, 2);

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS refund_reason TEXT;

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS refund_reason TEXT;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(12, 2);

CREATE TABLE IF NOT EXISTS order_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  opened_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'opened'
    CHECK (status IN ('opened', 'refunded', 'rejected', 'closed')),
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS order_disputes_one_open_per_request_idx
  ON order_disputes (request_id)
  WHERE status = 'opened';

CREATE INDEX IF NOT EXISTS idx_order_disputes_request_id ON order_disputes(request_id);
CREATE INDEX IF NOT EXISTS idx_order_disputes_status ON order_disputes(status);
CREATE INDEX IF NOT EXISTS idx_requests_refund_dispute_status ON requests(refund_dispute_status);

ALTER TABLE order_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Order parties can view disputes" ON order_disputes;
CREATE POLICY "Order parties can view disputes"
  ON order_disputes FOR SELECT
  USING (
    is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM requests r
      LEFT JOIN offers o ON o.request_id = r.id AND o.status = 'accepted'
      WHERE r.id = order_disputes.request_id
        AND (r.customer_id = auth.uid() OR o.provider_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Customers can open disputes for own orders" ON order_disputes;
CREATE POLICY "Customers can open disputes for own orders"
  ON order_disputes FOR INSERT
  WITH CHECK (
    opened_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = request_id
        AND r.customer_id = auth.uid()
    )
  );

-- Hardened cancel: unpaid only. Paid orders must use refund/dispute path.
CREATE OR REPLACE FUNCTION cancel_request(p_request_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status request_status;
  v_order_pay order_payment_status;
  v_paid BOOLEAN := false;
BEGIN
  SELECT status, order_payment_status
  INTO v_status, v_order_pay
  FROM requests
  WHERE id = p_request_id AND customer_id = auth.uid();

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  IF v_status NOT IN ('open', 'in_progress', 'pending_review') THEN
    RAISE EXCEPTION 'Request cannot be cancelled in its current status';
  END IF;

  IF EXISTS (
    SELECT 1 FROM payments
    WHERE request_id = p_request_id AND status = 'paid'
  ) OR v_order_pay IN ('paid', 'completed') THEN
    v_paid := true;
  END IF;

  IF v_paid THEN
    RAISE EXCEPTION 'PAID_ORDER_REQUIRES_REFUND_OR_DISPUTE: Paid orders cannot be cancelled without refund or dispute';
  END IF;

  UPDATE requests
  SET
    status = 'cancelled',
    cancellation_reason = COALESCE(cancellation_reason, 'customer_cancel_unpaid'),
    updated_at = NOW()
  WHERE id = p_request_id;

  RETURN json_build_object('request_id', p_request_id, 'status', 'cancelled', 'outcome', 'cancelled_unpaid');
END;
$$;

REVOKE ALL ON FUNCTION cancel_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_request(UUID) TO authenticated;

-- Idempotent test refund used by local/dev service_role only.
CREATE OR REPLACE FUNCTION apply_test_refund(
  p_request_id UUID,
  p_reason TEXT DEFAULT 'Customer cancelled paid order before work submission'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_request requests%ROWTYPE;
  v_existing_refund UUID;
  v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
BEGIN
  IF v_reason IS NULL THEN
    v_reason := 'Customer cancelled paid order before work submission';
  END IF;

  SELECT * INTO v_request FROM requests WHERE id = p_request_id;
  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  SELECT * INTO v_payment
  FROM payments
  WHERE request_id = p_request_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Paid payment not found';
  END IF;

  -- Idempotent: already refunded
  IF v_payment.status = 'refunded'
     OR v_request.order_payment_status = 'refunded'
     OR v_request.refund_dispute_status = 'refunded' THEN
    SELECT id INTO v_existing_refund
    FROM transactions
    WHERE request_id = p_request_id AND type = 'refund'
    ORDER BY created_at DESC
    LIMIT 1;

    UPDATE requests
    SET
      status = 'cancelled',
      order_payment_status = 'refunded',
      refund_dispute_status = 'refunded',
      refund_amount = COALESCE(refund_amount, v_payment.amount_gross),
      refund_reason = COALESCE(refund_reason, v_reason),
      refunded_at = COALESCE(refunded_at, NOW()),
      cancellation_reason = COALESCE(cancellation_reason, v_reason),
      updated_at = NOW()
    WHERE id = p_request_id;

    UPDATE payments
    SET
      status = 'refunded',
      refund_amount = COALESCE(refund_amount, amount_gross),
      refund_reason = COALESCE(refund_reason, v_reason),
      refunded_at = COALESCE(refunded_at, NOW()),
      updated_at = NOW()
    WHERE id = v_payment.id;

    RETURN json_build_object(
      'payment_id', v_payment.id,
      'request_id', p_request_id,
      'status', 'refunded',
      'already_refunded', true,
      'refund_amount', COALESCE(v_payment.refund_amount, v_payment.amount_gross),
      'transaction_id', v_existing_refund
    );
  END IF;

  IF v_payment.status <> 'paid' THEN
    RAISE EXCEPTION 'Paid payment not found';
  END IF;

  IF v_payment.payment_method IS DISTINCT FROM 'test'
     AND COALESCE(v_payment.payment_method, '') NOT ILIKE 'test%'
     AND COALESCE(v_payment.payment_method, '') NOT ILIKE 'look_test%' THEN
    RAISE EXCEPTION 'TEST_REFUND_ONLY: Real Stripe payments cannot be refunded by this function';
  END IF;

  UPDATE payments
  SET
    status = 'refunded',
    refund_amount = amount_gross,
    refund_reason = v_reason,
    refunded_at = NOW(),
    updated_at = NOW()
  WHERE id = v_payment.id
    AND status = 'paid';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund race: payment already changed';
  END IF;

  UPDATE provider_balances SET
    available_balance = GREATEST(0, available_balance - v_payment.provider_amount),
    total_earned = GREATEST(0, total_earned - v_payment.provider_amount),
    updated_at = NOW()
  WHERE provider_id = v_payment.provider_id;

  INSERT INTO transactions (
    payment_id, request_id, user_id, provider_id, type, amount, currency, status, description, metadata
  )
  VALUES (
    v_payment.id,
    p_request_id,
    v_payment.customer_id,
    v_payment.provider_id,
    'refund',
    v_payment.amount_gross,
    v_payment.currency,
    'completed',
    'Test refund',
    jsonb_build_object('reason', v_reason, 'provider_clawback', v_payment.provider_amount)
  )
  RETURNING id INTO v_existing_refund;

  UPDATE requests
  SET
    status = 'cancelled',
    order_payment_status = 'refunded',
    refund_dispute_status = 'refunded',
    refund_amount = v_payment.amount_gross,
    refund_reason = v_reason,
    refunded_at = NOW(),
    cancellation_reason = v_reason,
    updated_at = NOW()
  WHERE id = p_request_id;

  -- Close any open dispute if present
  UPDATE order_disputes
  SET status = 'refunded', resolved_at = NOW(), updated_at = NOW(),
      resolution_note = COALESCE(resolution_note, 'Auto-closed by test refund')
  WHERE request_id = p_request_id AND status = 'opened';

  RETURN json_build_object(
    'payment_id', v_payment.id,
    'request_id', p_request_id,
    'status', 'refunded',
    'already_refunded', false,
    'refund_amount', v_payment.amount_gross,
    'transaction_id', v_existing_refund
  );
END;
$$;

-- Keep legacy name as thin wrapper for repair scripts.
CREATE OR REPLACE FUNCTION simulate_test_refund(p_request_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN apply_test_refund(p_request_id, 'Test refund');
END;
$$;

REVOKE ALL ON FUNCTION apply_test_refund(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION apply_test_refund(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION apply_test_refund(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION apply_test_refund(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION simulate_test_refund(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION simulate_test_refund(UUID) FROM anon;
REVOKE ALL ON FUNCTION simulate_test_refund(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION simulate_test_refund(UUID) TO service_role;

-- Customer opens dispute for paid order after work has started/submitted.
CREATE OR REPLACE FUNCTION open_order_dispute(
  p_request_id UUID,
  p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request requests%ROWTYPE;
  v_payment payments%ROWTYPE;
  v_dispute order_disputes%ROWTYPE;
  v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
  v_work_started BOOLEAN := false;
BEGIN
  IF v_reason IS NULL OR char_length(v_reason) < 5 THEN
    RAISE EXCEPTION 'Dispute reason is required';
  END IF;

  SELECT * INTO v_request
  FROM requests
  WHERE id = p_request_id AND customer_id = auth.uid();

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  IF v_request.refund_dispute_status = 'dispute_opened' THEN
    SELECT * INTO v_dispute
    FROM order_disputes
    WHERE request_id = p_request_id AND status = 'opened'
    LIMIT 1;
    RETURN json_build_object(
      'request_id', p_request_id,
      'dispute_id', v_dispute.id,
      'status', 'dispute_opened',
      'already_opened', true
    );
  END IF;

  IF v_request.refund_dispute_status IN ('refunded', 'refund_pending')
     OR v_request.order_payment_status = 'refunded' THEN
    RAISE EXCEPTION 'Order already refunded or refund pending';
  END IF;

  SELECT * INTO v_payment
  FROM payments
  WHERE request_id = p_request_id AND status = 'paid'
  LIMIT 1;

  IF v_payment.id IS NULL AND v_request.order_payment_status NOT IN ('paid', 'completed') THEN
    RAISE EXCEPTION 'Dispute requires a paid order';
  END IF;

  IF v_request.status = 'pending_review'
     OR v_request.work_submitted_at IS NOT NULL
     OR EXISTS (SELECT 1 FROM work_submissions WHERE request_id = p_request_id) THEN
    v_work_started := true;
  END IF;

  -- Also treat in_progress after payment as "work started" only when submission exists
  -- Product rule: after work has started OR been submitted → dispute.
  -- "Started" = pending_review OR work_submitted_at OR any work_submissions row.
  IF NOT v_work_started THEN
    RAISE EXCEPTION 'DISPUTE_NOT_ALLOWED: Use refund path before work submission';
  END IF;

  IF v_request.status NOT IN ('in_progress', 'pending_review') THEN
    RAISE EXCEPTION 'Dispute can only be opened for in-progress or pending-review orders';
  END IF;

  INSERT INTO order_disputes (request_id, payment_id, opened_by, reason, status)
  VALUES (p_request_id, v_payment.id, auth.uid(), v_reason, 'opened')
  RETURNING * INTO v_dispute;

  UPDATE requests
  SET
    refund_dispute_status = 'dispute_opened',
    refund_reason = v_reason,
    cancellation_reason = v_reason,
    updated_at = NOW()
  WHERE id = p_request_id;

  RETURN json_build_object(
    'request_id', p_request_id,
    'dispute_id', v_dispute.id,
    'status', 'dispute_opened',
    'already_opened', false
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_dispute
    FROM order_disputes
    WHERE request_id = p_request_id AND status = 'opened'
    LIMIT 1;
    UPDATE requests
    SET refund_dispute_status = 'dispute_opened', updated_at = NOW()
    WHERE id = p_request_id;
    RETURN json_build_object(
      'request_id', p_request_id,
      'dispute_id', v_dispute.id,
      'status', 'dispute_opened',
      'already_opened', true
    );
END;
$$;

REVOKE ALL ON FUNCTION open_order_dispute(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION open_order_dispute(UUID, TEXT) TO authenticated;
