-- Protect server-controlled financial/payment columns on requests from authenticated
-- PostgREST clients. Row-level RLS "Customers can update own requests" remains;
-- column privileges restrict WHICH columns authenticated may UPDATE.
--
-- Also: confirm_stripe_payment expected amount = accepted offer.price (not order_amount).
-- Also: submit_work paid gate = payments.status only (no fake order_payment_status).
--
-- Staging-only apply via guarded pooler. Do not apply to production without review.

-- ---------------------------------------------------------------------------
-- 1) Column-level UPDATE privileges
-- ---------------------------------------------------------------------------

REVOKE UPDATE ON TABLE public.requests FROM PUBLIC;
REVOKE UPDATE ON TABLE public.requests FROM anon;
REVOKE UPDATE ON TABLE public.requests FROM authenticated;

-- Legitimate customer (and authenticated) writable columns for current UX paths.
-- Explicitly EXCLUDES: currency, order_amount, look_commission, provider_payout_amount,
-- order_payment_status, payout_status, payment_*, stripe_*, paid_at, refund_amount, refunded_at.
GRANT UPDATE (
  status,
  cancellation_reason,
  revision_feedback,
  archived_at,
  trashed_at,
  updated_at,
  refund_dispute_status,
  refund_reason
) ON TABLE public.requests TO authenticated;

-- service_role retains full write for Stripe persist / admin refund paths.
GRANT ALL ON TABLE public.requests TO service_role;

-- ---------------------------------------------------------------------------
-- 2) confirm_stripe_payment: authoritative expected amount = accepted offer
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
BEGIN
  IF p_external_reference IS NULL OR TRIM(p_external_reference) = '' THEN
    RAISE EXCEPTION 'Stripe external reference is required';
  END IF;

  v_txn_id := TRIM(p_external_reference);

  SELECT
    r.customer_id,
    r.status,
    r.order_payment_status
  INTO
    v_customer_id,
    v_status,
    v_order_pay_status
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

  -- Authoritative SoT: accepted offer (never customer-writable requests.order_amount).
  v_expected_gross := ROUND(v_offer.price::NUMERIC, 2);
  v_expected_currency := UPPER(COALESCE(NULLIF(TRIM(v_offer.currency), ''), 'USD'));

  IF v_expected_gross IS NULL OR v_expected_gross <= 0 THEN
    RAISE EXCEPTION 'Invalid expected order amount';
  END IF;

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

  -- Sync denormalized snapshots from authoritative values (server-only columns).
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
REVOKE ALL ON FUNCTION confirm_stripe_payment(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION confirm_stripe_payment(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) submit_work: require payments.status = paid only
-- ---------------------------------------------------------------------------

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

  SELECT status INTO v_payment_status
  FROM payments
  WHERE request_id = p_request_id
    AND status = 'paid'
  LIMIT 1;

  IF v_payment_status IS DISTINCT FROM 'paid' THEN
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
    UPDATE conversations SET last_message_at = NOW() WHERE id = v_conversation_id;
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
