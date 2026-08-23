-- Platform-wide immutable ledger for refunds/disputes.
-- Stable transaction type codes only (no localized descriptions as source of truth).
-- Full refund writes: customer_refund + provider_earning_reversal + platform_commission_reversal.
-- Idempotent via unique idempotency_key / (payment_id, type).

-- ---------------------------------------------------------------------------
-- 1) Extend transaction_type enum
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'customer_refund';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'provider_earning_reversal';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'platform_commission_reversal';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'provider_payout_reversal';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'dispute_opened';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'dispute_resolved';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Ledger columns
-- ---------------------------------------------------------------------------
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS ledger_code TEXT;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS amount_signed NUMERIC(12, 2);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS account_scope TEXT
    CHECK (account_scope IS NULL OR account_scope IN ('customer', 'provider', 'platform', 'system'));

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Backfill ledger_code from type; migrate legacy refund -> customer_refund code for display
UPDATE transactions
SET ledger_code = CASE
  WHEN type::text = 'refund' THEN 'customer_refund'
  ELSE type::text
END
WHERE ledger_code IS NULL;

-- amount_signed: convention by account_scope / type
UPDATE transactions
SET amount_signed = CASE
  WHEN type::text IN ('order_payment') THEN -ABS(amount)           -- customer outflow
  WHEN type::text IN ('customer_refund', 'refund') THEN ABS(amount) -- customer inflow
  WHEN type::text IN ('provider_earning') THEN ABS(amount)          -- provider inflow
  WHEN type::text IN ('provider_earning_reversal', 'provider_payout', 'provider_payout_reversal')
    THEN CASE WHEN type::text = 'provider_payout_reversal' THEN ABS(amount) ELSE -ABS(amount) END
  WHEN type::text IN ('platform_commission') THEN ABS(amount)       -- platform inflow
  WHEN type::text IN ('platform_commission_reversal') THEN -ABS(amount)
  WHEN type::text IN ('dispute_opened', 'dispute_resolved') THEN 0
  ELSE amount
END
WHERE amount_signed IS NULL;

UPDATE transactions
SET account_scope = CASE
  WHEN type::text IN ('order_payment', 'customer_refund', 'refund') THEN 'customer'
  WHEN type::text IN ('provider_earning', 'provider_earning_reversal', 'provider_payout', 'provider_payout_reversal') THEN 'provider'
  WHEN type::text IN ('platform_commission', 'platform_commission_reversal') THEN 'platform'
  ELSE 'system'
END
WHERE account_scope IS NULL;

-- Normalize description to stable code (never keep RU/EN prose as source of truth)
UPDATE transactions
SET description = COALESCE(ledger_code, type::text)
WHERE description IS DISTINCT FROM COALESCE(ledger_code, type::text)
  AND (
    description ~ '[А-Яа-яЁё]'
    OR description ILIKE 'Test %'
    OR description ILIKE 'Тест%'
    OR description ILIKE '%оплат%'
    OR description ILIKE '%комисс%'
    OR description ILIKE '%начисл%'
    OR description ILIKE '%возврат%'
    OR description ILIKE '%refund%'
    OR description ILIKE '%commission%'
    OR description ILIKE '%payment%'
    OR description ILIKE '%earning%'
  );

ALTER TABLE transactions
  ALTER COLUMN ledger_code SET DEFAULT 'unknown';

UPDATE transactions SET ledger_code = type::text WHERE ledger_code IS NULL;
ALTER TABLE transactions ALTER COLUMN ledger_code SET NOT NULL;

-- Idempotency
UPDATE transactions
SET idempotency_key = payment_id::text || ':' || COALESCE(ledger_code, type::text)
WHERE idempotency_key IS NULL
  AND payment_id IS NOT NULL
  AND type::text IN (
    'order_payment', 'platform_commission', 'provider_earning',
    'customer_refund', 'refund', 'provider_earning_reversal', 'platform_commission_reversal'
  );

-- NULL idempotency keys remain allowed (PostgreSQL UNIQUE permits multiple NULLs).
CREATE UNIQUE INDEX IF NOT EXISTS transactions_idempotency_key_uidx
  ON transactions (idempotency_key);

-- At most one completed reversal/refund row per payment+ledger code
CREATE UNIQUE INDEX IF NOT EXISTS transactions_payment_ledger_code_uidx
  ON transactions (payment_id, ledger_code)
  WHERE payment_id IS NOT NULL
    AND status = 'completed'
    AND ledger_code IN (
      'order_payment',
      'platform_commission',
      'provider_earning',
      'customer_refund',
      'provider_earning_reversal',
      'platform_commission_reversal'
    );

-- ---------------------------------------------------------------------------
-- 3) Helper: insert ledger row idempotently
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION insert_ledger_entry(
  p_payment_id UUID,
  p_request_id UUID,
  p_user_id UUID,
  p_provider_id UUID,
  p_type transaction_type,
  p_ledger_code TEXT,
  p_amount NUMERIC,
  p_amount_signed NUMERIC,
  p_account_scope TEXT,
  p_currency TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_key TEXT := CASE
    WHEN p_payment_id IS NULL THEN NULL
    ELSE p_payment_id::text || ':' || p_ledger_code
  END;
BEGIN
  IF v_key IS NOT NULL THEN
    SELECT id INTO v_id FROM transactions WHERE idempotency_key = v_key;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  BEGIN
    INSERT INTO transactions (
      payment_id, request_id, user_id, provider_id,
      type, ledger_code, amount, amount_signed, account_scope,
      currency, status, description, metadata, idempotency_key
    )
    VALUES (
      p_payment_id, p_request_id, p_user_id, p_provider_id,
      p_type, p_ledger_code, ABS(p_amount), p_amount_signed, p_account_scope,
      p_currency, 'completed', p_ledger_code, COALESCE(p_metadata, '{}'::jsonb), v_key
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT id INTO v_id
      FROM transactions
      WHERE idempotency_key = v_key
         OR (payment_id = p_payment_id AND ledger_code = p_ledger_code AND status = 'completed')
      LIMIT 1;
  END;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Full refund workflow (test payments only) — platform-wide, idempotent
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_test_refund(
  p_request_id UUID,
  p_reason TEXT DEFAULT 'customer_cancel_before_work_submission'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_request requests%ROWTYPE;
  v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
  v_has_customer_refund BOOLEAN := false;
  v_has_earning_rev BOOLEAN := false;
  v_has_commission_rev BOOLEAN := false;
  v_tx_refund UUID;
  v_tx_earn_rev UUID;
  v_tx_fee_rev UUID;
  v_already BOOLEAN := false;
BEGIN
  IF v_reason IS NULL THEN
    v_reason := 'customer_cancel_before_work_submission';
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

  SELECT EXISTS(
    SELECT 1 FROM transactions
    WHERE payment_id = v_payment.id
      AND ledger_code = 'customer_refund'
      AND status = 'completed'
  ) INTO v_has_customer_refund;

  SELECT EXISTS(
    SELECT 1 FROM transactions
    WHERE payment_id = v_payment.id
      AND ledger_code = 'provider_earning_reversal'
      AND status = 'completed'
  ) INTO v_has_earning_rev;

  SELECT EXISTS(
    SELECT 1 FROM transactions
    WHERE payment_id = v_payment.id
      AND ledger_code = 'platform_commission_reversal'
      AND status = 'completed'
  ) INTO v_has_commission_rev;

  v_already := (
    v_payment.status = 'refunded'
    OR v_request.order_payment_status = 'refunded'
    OR v_request.refund_dispute_status = 'refunded'
    OR (v_has_customer_refund AND v_has_earning_rev AND v_has_commission_rev)
  );

  IF v_payment.payment_method IS DISTINCT FROM 'test'
     AND COALESCE(v_payment.payment_method, '') NOT ILIKE 'test%'
     AND COALESCE(v_payment.payment_method, '') NOT ILIKE 'look_test%' THEN
    RAISE EXCEPTION 'TEST_REFUND_ONLY: Real Stripe payments cannot be refunded by this function';
  END IF;

  IF NOT v_already AND v_payment.status <> 'paid' THEN
    RAISE EXCEPTION 'Paid payment not found';
  END IF;

  -- Mark payment refunded (idempotent)
  UPDATE payments
  SET
    status = 'refunded',
    refund_amount = COALESCE(refund_amount, amount_gross),
    refund_reason = COALESCE(refund_reason, v_reason),
    refunded_at = COALESCE(refunded_at, NOW()),
    updated_at = NOW()
  WHERE id = v_payment.id;

  -- Claw back provider balance only once (when earning reversal not yet present)
  IF NOT v_has_earning_rev THEN
    UPDATE provider_balances SET
      available_balance = GREATEST(0, available_balance - v_payment.provider_amount),
      total_earned = GREATEST(0, total_earned - v_payment.provider_amount),
      updated_at = NOW()
    WHERE provider_id = v_payment.provider_id;
  END IF;

  -- Ledger: customer refund (credit to customer)
  v_tx_refund := insert_ledger_entry(
    v_payment.id, p_request_id, v_payment.customer_id, v_payment.provider_id,
    'customer_refund', 'customer_refund',
    v_payment.amount_gross, ABS(v_payment.amount_gross), 'customer',
    v_payment.currency,
    jsonb_build_object('reason', v_reason, 'source', 'apply_test_refund')
  );

  -- Ledger: provider earning reversal (debit to provider)
  v_tx_earn_rev := insert_ledger_entry(
    v_payment.id, p_request_id, v_payment.customer_id, v_payment.provider_id,
    'provider_earning_reversal', 'provider_earning_reversal',
    v_payment.provider_amount, -ABS(v_payment.provider_amount), 'provider',
    v_payment.currency,
    jsonb_build_object('reason', v_reason, 'source', 'apply_test_refund')
  );

  -- Ledger: LOOK commission reversal (debit to platform)
  v_tx_fee_rev := insert_ledger_entry(
    v_payment.id, p_request_id, NULL, v_payment.provider_id,
    'platform_commission_reversal', 'platform_commission_reversal',
    v_payment.platform_fee, -ABS(v_payment.platform_fee), 'platform',
    v_payment.currency,
    jsonb_build_object('reason', v_reason, 'source', 'apply_test_refund', 'rate_basis', v_payment.platform_fee)
  );

  -- Also accept legacy single 'refund' rows as customer_refund equivalent (do not duplicate)
  -- No insert of type=refund anymore.

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

  UPDATE order_disputes
  SET status = 'refunded',
      resolved_at = COALESCE(resolved_at, NOW()),
      updated_at = NOW(),
      resolution_note = COALESCE(resolution_note, 'refunded')
  WHERE request_id = p_request_id AND status = 'opened';

  RETURN json_build_object(
    'payment_id', v_payment.id,
    'request_id', p_request_id,
    'status', 'refunded',
    'already_refunded', v_already,
    'refund_amount', v_payment.amount_gross,
    'ledger', json_build_object(
      'customer_refund', v_tx_refund,
      'provider_earning_reversal', v_tx_earn_rev,
      'platform_commission_reversal', v_tx_fee_rev
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION simulate_test_refund(p_request_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN apply_test_refund(p_request_id, 'test_refund');
END;
$$;

REVOKE ALL ON FUNCTION insert_ledger_entry(UUID, UUID, UUID, UUID, transaction_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION insert_ledger_entry(UUID, UUID, UUID, UUID, transaction_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION apply_test_refund(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION apply_test_refund(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION apply_test_refund(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION apply_test_refund(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION simulate_test_refund(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION simulate_test_refund(UUID) FROM anon;
REVOKE ALL ON FUNCTION simulate_test_refund(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION simulate_test_refund(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Patch simulate_test_payment descriptions to stable codes (both signatures)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION simulate_test_payment(p_request_id UUID, p_external_reference TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
  v_status request_status;
  v_offer offers%ROWTYPE;
  v_rate NUMERIC;
  v_gross NUMERIC(12, 2);
  v_fee NUMERIC(12, 2);
  v_provider_amount NUMERIC(12, 2);
  v_payment_id UUID;
  v_existing payment_status;
BEGIN
  SELECT r.customer_id, r.status
  INTO v_customer_id, v_status
  FROM requests r
  WHERE r.id = p_request_id;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  -- service_role / admin may pay for tests; authenticated customer must own the order
  IF auth.uid() IS NOT NULL AND v_customer_id <> auth.uid() AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Payment is only available for orders in progress';
  END IF;

  SELECT status INTO v_existing FROM payments WHERE request_id = p_request_id;
  IF v_existing = 'paid' THEN
    RAISE EXCEPTION 'Order already paid';
  END IF;

  SELECT o.* INTO v_offer
  FROM offers o
  WHERE o.request_id = p_request_id AND o.status = 'accepted'
  LIMIT 1;

  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'No accepted offer found for this order';
  END IF;

  v_rate := get_platform_commission_rate();
  v_gross := ROUND(v_offer.price::NUMERIC, 2);
  v_fee := ROUND(v_gross * v_rate, 2);
  v_provider_amount := v_gross - v_fee;

  INSERT INTO payments (
    request_id, offer_id, customer_id, provider_id,
    amount_gross, platform_fee, provider_amount, currency,
    status, payment_method, external_reference, paid_at
  )
  VALUES (
    p_request_id, v_offer.id, v_customer_id, v_offer.provider_id,
    v_gross, v_fee, v_provider_amount, v_offer.currency,
    'paid', 'test', NULLIF(TRIM(COALESCE(p_external_reference, '')), ''), NOW()
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO platform_commissions (
    payment_id, request_id, gross_amount, commission_rate, commission_amount, currency
  )
  VALUES (v_payment_id, p_request_id, v_gross, v_rate, v_fee, v_offer.currency)
  ON CONFLICT (payment_id) DO NOTHING;

  PERFORM insert_ledger_entry(
    v_payment_id, p_request_id, v_customer_id, v_offer.provider_id,
    'order_payment', 'order_payment', v_gross, -ABS(v_gross), 'customer', v_offer.currency,
    jsonb_build_object('request_id', p_request_id)
  );
  PERFORM insert_ledger_entry(
    v_payment_id, p_request_id, NULL, v_offer.provider_id,
    'platform_commission', 'platform_commission', v_fee, ABS(v_fee), 'platform', v_offer.currency,
    jsonb_build_object('rate', v_rate)
  );
  PERFORM insert_ledger_entry(
    v_payment_id, p_request_id, v_offer.provider_id, v_offer.provider_id,
    'provider_earning', 'provider_earning', v_provider_amount, ABS(v_provider_amount), 'provider', v_offer.currency,
    jsonb_build_object('provider_id', v_offer.provider_id)
  );

  INSERT INTO provider_balances (provider_id, available_balance, pending_payout, total_earned, currency)
  VALUES (v_offer.provider_id, v_provider_amount, 0, v_provider_amount, v_offer.currency)
  ON CONFLICT (provider_id) DO UPDATE SET
    available_balance = provider_balances.available_balance + EXCLUDED.available_balance,
    total_earned = provider_balances.total_earned + EXCLUDED.total_earned,
    updated_at = NOW();

  UPDATE requests
  SET order_payment_status = 'paid',
      order_amount = v_gross,
      look_commission = v_fee,
      provider_payout_amount = v_provider_amount,
      paid_at = COALESCE(paid_at, NOW()),
      updated_at = NOW()
  WHERE id = p_request_id;

  RETURN json_build_object(
    'payment_id', v_payment_id,
    'request_id', p_request_id,
    'amount_gross', v_gross,
    'platform_fee', v_fee,
    'provider_amount', v_provider_amount,
    'commission_rate', v_rate,
    'currency', v_offer.currency,
    'status', 'paid'
  );
END;
$$;

-- Keep single-arg wrapper
CREATE OR REPLACE FUNCTION simulate_test_payment(p_request_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN simulate_test_payment(p_request_id, NULL);
END;
$$;

REVOKE ALL ON FUNCTION simulate_test_payment(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION simulate_test_payment(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION simulate_test_payment(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION simulate_test_payment(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION simulate_test_payment(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION simulate_test_payment(UUID) FROM anon;
REVOKE ALL ON FUNCTION simulate_test_payment(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION simulate_test_payment(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Dispute open writes ledger memo (amount 0), idempotent
-- ---------------------------------------------------------------------------
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

  IF v_payment.id IS NOT NULL THEN
    PERFORM insert_ledger_entry(
      v_payment.id, p_request_id, auth.uid(), v_payment.provider_id,
      'dispute_opened', 'dispute_opened',
      0, 0, 'system', v_payment.currency,
      jsonb_build_object('reason', v_reason, 'dispute_id', v_dispute.id)
    );
  END IF;

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
