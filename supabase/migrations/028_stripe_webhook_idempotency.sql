-- Stripe webhook event idempotency + hardened confirm amount/currency checks.
-- Forward-only. Do not apply remotely from the agent task that authored this file
-- unless an explicit production migration step is requested.

-- ---------------------------------------------------------------------------
-- stripe_webhook_events: process each Stripe event id at most once
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE stripe_webhook_processing_status AS ENUM (
    'processing',
    'processed',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  stripe_event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  object_id TEXT,
  processing_status stripe_webhook_processing_status NOT NULL DEFAULT 'processing',
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status
  ON stripe_webhook_events (processing_status);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_created
  ON stripe_webhook_events (created_at DESC);

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE stripe_webhook_events FROM PUBLIC;
REVOKE ALL ON TABLE stripe_webhook_events FROM anon;
REVOKE ALL ON TABLE stripe_webhook_events FROM authenticated;
-- service_role bypasses RLS; no policies for browser roles on purpose.

-- Persist Checkout Session / PaymentIntent ids for reuse + audit
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_checkout_attempt INTEGER NOT NULL DEFAULT 0;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_stripe_payment_intent_id
  ON payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_stripe_checkout_session_id
  ON payments (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_requests_stripe_checkout_session_id
  ON requests (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Atomic claim: insert processing, or decide duplicate / retry
-- Returns: claimed | already_processed | already_processing | retried
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_stripe_webhook_event(
  p_stripe_event_id TEXT,
  p_event_type TEXT,
  p_object_id TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status stripe_webhook_processing_status;
BEGIN
  IF p_stripe_event_id IS NULL OR TRIM(p_stripe_event_id) = '' THEN
    RAISE EXCEPTION 'stripe_event_id is required';
  END IF;

  INSERT INTO stripe_webhook_events (
    stripe_event_id, event_type, object_id, processing_status
  )
  VALUES (
    TRIM(p_stripe_event_id),
    COALESCE(NULLIF(TRIM(p_event_type), ''), 'unknown'),
    NULLIF(TRIM(p_object_id), ''),
    'processing'
  )
  ON CONFLICT (stripe_event_id) DO NOTHING;

  IF FOUND THEN
    RETURN 'claimed';
  END IF;

  SELECT processing_status INTO v_status
  FROM stripe_webhook_events
  WHERE stripe_event_id = TRIM(p_stripe_event_id)
  FOR UPDATE;

  IF v_status = 'processed' THEN
    RETURN 'already_processed';
  END IF;

  IF v_status = 'processing' THEN
    RETURN 'already_processing';
  END IF;

  -- failed → controlled retry
  UPDATE stripe_webhook_events
  SET
    processing_status = 'processing',
    event_type = COALESCE(NULLIF(TRIM(p_event_type), ''), event_type),
    object_id = COALESCE(NULLIF(TRIM(p_object_id), ''), object_id),
    last_error = NULL,
    processed_at = NULL
  WHERE stripe_event_id = TRIM(p_stripe_event_id)
    AND processing_status = 'failed';

  IF FOUND THEN
    RETURN 'retried';
  END IF;

  RETURN 'already_processing';
END;
$$;

CREATE OR REPLACE FUNCTION complete_stripe_webhook_event(
  p_stripe_event_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE stripe_webhook_events
  SET
    processing_status = 'processed',
    processed_at = NOW(),
    last_error = NULL
  WHERE stripe_event_id = TRIM(p_stripe_event_id);
END;
$$;

CREATE OR REPLACE FUNCTION fail_stripe_webhook_event(
  p_stripe_event_id TEXT,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE stripe_webhook_events
  SET
    processing_status = 'failed',
    processed_at = NOW(),
    last_error = LEFT(COALESCE(NULLIF(TRIM(p_error), ''), 'processing failed'), 500)
  WHERE stripe_event_id = TRIM(p_stripe_event_id);
END;
$$;

REVOKE ALL ON FUNCTION claim_stripe_webhook_event(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_stripe_webhook_event(TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION claim_stripe_webhook_event(TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION claim_stripe_webhook_event(TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION complete_stripe_webhook_event(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION complete_stripe_webhook_event(TEXT) FROM anon;
REVOKE ALL ON FUNCTION complete_stripe_webhook_event(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION complete_stripe_webhook_event(TEXT) TO service_role;

REVOKE ALL ON FUNCTION fail_stripe_webhook_event(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fail_stripe_webhook_event(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION fail_stripe_webhook_event(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION fail_stripe_webhook_event(TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Hardened confirm: server expected amount/currency are authoritative.
-- Stripe amount/currency must match; mismatch → no paid transition.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION confirm_stripe_payment(
  p_request_id UUID,
  p_external_reference TEXT,
  p_checkout_session_id TEXT DEFAULT NULL,
  p_payment_intent_id TEXT DEFAULT NULL,
  p_amount_received NUMERIC DEFAULT NULL,
  p_currency TEXT DEFAULT NULL
)
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
  v_txn_id TEXT;
  v_order_pay_status order_payment_status;
  v_currency TEXT;
  v_expected_gross NUMERIC(12, 2);
  v_expected_currency TEXT;
  v_order_amount NUMERIC(12, 2);
  v_order_currency TEXT;
BEGIN
  IF p_external_reference IS NULL OR TRIM(p_external_reference) = '' THEN
    RAISE EXCEPTION 'Stripe external reference is required';
  END IF;

  v_txn_id := TRIM(p_external_reference);

  SELECT
    r.customer_id,
    r.status,
    r.order_payment_status,
    r.order_amount,
    r.currency
  INTO
    v_customer_id,
    v_status,
    v_order_pay_status,
    v_order_amount,
    v_order_currency
  FROM requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_status <> 'in_progress' AND v_order_pay_status IS DISTINCT FROM 'paid'
     AND v_order_pay_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Payment is only available for orders in progress';
  END IF;

  SELECT status, id INTO v_existing, v_payment_id
  FROM payments
  WHERE request_id = p_request_id
  FOR UPDATE;

  IF v_existing = 'paid' THEN
    SELECT order_payment_status INTO v_order_pay_status
    FROM requests WHERE id = p_request_id;

    SELECT external_reference INTO v_txn_id FROM payments WHERE id = v_payment_id;

    -- Backfill Stripe ids if missing on an already-paid row.
    UPDATE payments
    SET
      stripe_checkout_session_id = COALESCE(
        stripe_checkout_session_id,
        NULLIF(TRIM(p_checkout_session_id), '')
      ),
      stripe_payment_intent_id = COALESCE(
        stripe_payment_intent_id,
        NULLIF(TRIM(p_payment_intent_id), '')
      ),
      updated_at = NOW()
    WHERE id = v_payment_id;

    RETURN json_build_object(
      'payment_id', v_payment_id,
      'request_id', p_request_id,
      'amount_gross', (SELECT amount_gross FROM payments WHERE id = v_payment_id),
      'platform_fee', (SELECT platform_fee FROM payments WHERE id = v_payment_id),
      'provider_amount', (SELECT provider_amount FROM payments WHERE id = v_payment_id),
      'commission_rate', get_platform_commission_rate(),
      'currency', (SELECT currency FROM payments WHERE id = v_payment_id),
      'status', 'paid',
      'external_reference', v_txn_id,
      'order_payment_status', COALESCE(v_order_pay_status::text, 'paid'),
      'payment_provider', 'stripe',
      'already_paid', true
    );
  END IF;

  -- Idempotent by Stripe PaymentIntent / reference.
  SELECT id, status INTO v_payment_id, v_existing
  FROM payments
  WHERE external_reference = v_txn_id
     OR (
       NULLIF(TRIM(p_payment_intent_id), '') IS NOT NULL
       AND stripe_payment_intent_id = TRIM(p_payment_intent_id)
     )
     OR (
       NULLIF(TRIM(p_checkout_session_id), '') IS NOT NULL
       AND stripe_checkout_session_id = TRIM(p_checkout_session_id)
     )
  LIMIT 1
  FOR UPDATE;

  IF v_existing = 'paid' THEN
    RETURN json_build_object(
      'payment_id', v_payment_id,
      'request_id', p_request_id,
      'status', 'paid',
      'external_reference', v_txn_id,
      'order_payment_status', 'paid',
      'payment_provider', 'stripe',
      'already_paid', true
    );
  END IF;

  SELECT o.* INTO v_offer
  FROM offers o
  WHERE o.request_id = p_request_id
    AND o.status = 'accepted'
  LIMIT 1;

  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'No accepted offer found for this order';
  END IF;

  v_expected_gross := ROUND(COALESCE(v_order_amount, v_offer.price)::NUMERIC, 2);
  v_expected_currency := UPPER(COALESCE(
    NULLIF(TRIM(v_order_currency), ''),
    NULLIF(TRIM(v_offer.currency), ''),
    'USD'
  ));

  IF v_expected_gross IS NULL OR v_expected_gross <= 0 THEN
    RAISE EXCEPTION 'Invalid expected order amount';
  END IF;

  -- Stripe amount/currency must be present and must match server expectation.
  IF p_amount_received IS NULL THEN
    RAISE EXCEPTION 'Stripe amount is required';
  END IF;

  IF ROUND(p_amount_received::NUMERIC, 2) <> v_expected_gross THEN
    RAISE EXCEPTION 'Stripe amount does not match expected order amount';
  END IF;

  IF p_currency IS NULL OR TRIM(p_currency) = '' THEN
    RAISE EXCEPTION 'Stripe currency is required';
  END IF;

  IF UPPER(TRIM(p_currency)) <> v_expected_currency THEN
    RAISE EXCEPTION 'Stripe currency does not match expected order currency';
  END IF;

  -- Ledger always uses server-side expected gross + platform commission rate.
  v_rate := get_platform_commission_rate();
  v_gross := v_expected_gross;
  v_fee := ROUND(v_gross * v_rate, 2);
  v_provider_amount := v_gross - v_fee;
  v_currency := v_expected_currency;

  BEGIN
    INSERT INTO payments (
      request_id, offer_id, customer_id, provider_id,
      amount_gross, platform_fee, provider_amount, currency,
      status, payment_method, external_reference,
      stripe_checkout_session_id, stripe_payment_intent_id,
      paid_at
    )
    VALUES (
      p_request_id, v_offer.id, v_customer_id, v_offer.provider_id,
      v_gross, v_fee, v_provider_amount, v_currency,
      'paid', 'stripe', v_txn_id,
      NULLIF(TRIM(p_checkout_session_id), ''),
      NULLIF(TRIM(p_payment_intent_id), ''),
      NOW()
    )
    RETURNING id INTO v_payment_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- Concurrent confirm for same request / Stripe object — treat as already paid.
      SELECT id, status, external_reference
      INTO v_payment_id, v_existing, v_txn_id
      FROM payments
      WHERE request_id = p_request_id
         OR external_reference = v_txn_id
         OR (
           NULLIF(TRIM(p_payment_intent_id), '') IS NOT NULL
           AND stripe_payment_intent_id = TRIM(p_payment_intent_id)
         )
         OR (
           NULLIF(TRIM(p_checkout_session_id), '') IS NOT NULL
           AND stripe_checkout_session_id = TRIM(p_checkout_session_id)
         )
      LIMIT 1;

      IF v_existing = 'paid' THEN
        RETURN json_build_object(
          'payment_id', v_payment_id,
          'request_id', p_request_id,
          'status', 'paid',
          'external_reference', v_txn_id,
          'order_payment_status', 'paid',
          'payment_provider', 'stripe',
          'already_paid', true
        );
      END IF;
      RAISE;
  END;

  INSERT INTO platform_commissions (
    payment_id, request_id, gross_amount, commission_rate, commission_amount, currency
  )
  VALUES (
    v_payment_id, p_request_id, v_gross, v_rate, v_fee, v_currency
  );

  INSERT INTO transactions (payment_id, request_id, user_id, type, amount, currency, description, metadata)
  VALUES
    (v_payment_id, p_request_id, v_customer_id, 'order_payment', v_gross, v_currency,
     'Оплата заказа (Stripe)', jsonb_build_object(
       'request_id', p_request_id,
       'checkout_session_id', p_checkout_session_id,
       'payment_intent_id', p_payment_intent_id,
       'provider', 'stripe'
     )),
    (v_payment_id, p_request_id, NULL, 'platform_commission', v_fee, v_currency,
     'Комиссия LOOK', jsonb_build_object('rate', v_rate, 'provider', 'stripe')),
    (v_payment_id, p_request_id, v_offer.provider_id, 'provider_earning', v_provider_amount, v_currency,
     'Начисление исполнителю', jsonb_build_object('provider_id', v_offer.provider_id, 'provider', 'stripe'));

  UPDATE transactions SET provider_id = v_offer.provider_id
  WHERE payment_id = v_payment_id AND type = 'provider_earning';

  INSERT INTO provider_balances (provider_id, available_balance, pending_payout, total_earned, currency)
  VALUES (v_offer.provider_id, v_provider_amount, 0, v_provider_amount, v_currency)
  ON CONFLICT (provider_id) DO UPDATE SET
    available_balance = provider_balances.available_balance + EXCLUDED.available_balance,
    total_earned = provider_balances.total_earned + EXCLUDED.total_earned,
    updated_at = NOW();

  UPDATE requests
  SET
    order_payment_status = 'paid',
    order_amount = v_gross,
    look_commission = v_fee,
    provider_payout_amount = v_provider_amount,
    currency = v_currency,
    payment_provider_name = 'stripe',
    payment_transaction_id = COALESCE(NULLIF(TRIM(p_payment_intent_id), ''), v_txn_id),
    stripe_checkout_session_id = COALESCE(
      NULLIF(TRIM(p_checkout_session_id), ''),
      stripe_checkout_session_id
    ),
    stripe_payment_intent_id = COALESCE(
      NULLIF(TRIM(p_payment_intent_id), ''),
      stripe_payment_intent_id
    ),
    paid_at = NOW(),
    payout_status = 'pending',
    updated_at = NOW()
  WHERE id = p_request_id;

  RETURN json_build_object(
    'payment_id', v_payment_id,
    'request_id', p_request_id,
    'amount_gross', v_gross,
    'platform_fee', v_fee,
    'provider_amount', v_provider_amount,
    'commission_rate', v_rate,
    'currency', v_currency,
    'status', 'paid',
    'external_reference', v_txn_id,
    'order_payment_status', 'paid',
    'payment_provider', 'stripe'
  );
END;
$$;

REVOKE ALL ON FUNCTION confirm_stripe_payment(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION confirm_stripe_payment(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT) FROM anon;
REVOKE ALL ON FUNCTION confirm_stripe_payment(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION confirm_stripe_payment(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT) TO service_role;
