-- Confirm Stripe Checkout / PaymentIntent payments from the webhook (service_role).
-- Idempotent: safe to retry when webhook and success-page sync both fire.

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
BEGIN
  IF p_external_reference IS NULL OR TRIM(p_external_reference) = '' THEN
    RAISE EXCEPTION 'Stripe external reference is required';
  END IF;

  v_txn_id := TRIM(p_external_reference);

  SELECT r.customer_id, r.status, r.order_payment_status
  INTO v_customer_id, v_status, v_order_pay_status
  FROM requests r
  WHERE r.id = p_request_id;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_status <> 'in_progress' AND v_order_pay_status IS DISTINCT FROM 'paid'
     AND v_order_pay_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Payment is only available for orders in progress';
  END IF;

  SELECT status, id INTO v_existing, v_payment_id
  FROM payments
  WHERE request_id = p_request_id;

  IF v_existing = 'paid' THEN
    SELECT order_payment_status INTO v_order_pay_status
    FROM requests WHERE id = p_request_id;

    SELECT external_reference INTO v_txn_id FROM payments WHERE id = v_payment_id;

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

  -- Also idempotent by Stripe reference (unique charge / PI).
  SELECT id, status INTO v_payment_id, v_existing
  FROM payments
  WHERE external_reference = v_txn_id
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

  SELECT o.* INTO v_offer
  FROM offers o
  WHERE o.request_id = p_request_id
    AND o.status = 'accepted'
  LIMIT 1;

  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'No accepted offer found for this order';
  END IF;

  v_rate := get_platform_commission_rate();
  v_gross := ROUND(COALESCE(p_amount_received, v_offer.price)::NUMERIC, 2);
  v_fee := ROUND(v_gross * v_rate, 2);
  v_provider_amount := v_gross - v_fee;
  v_currency := UPPER(COALESCE(NULLIF(TRIM(p_currency), ''), v_offer.currency, 'USD'));

  INSERT INTO payments (
    request_id, offer_id, customer_id, provider_id,
    amount_gross, platform_fee, provider_amount, currency,
    status, payment_method, external_reference, paid_at
  )
  VALUES (
    p_request_id, v_offer.id, v_customer_id, v_offer.provider_id,
    v_gross, v_fee, v_provider_amount, v_currency,
    'paid', 'stripe', v_txn_id, NOW()
  )
  RETURNING id INTO v_payment_id;

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

CREATE OR REPLACE FUNCTION mark_order_payment_failed(
  p_request_id UUID,
  p_external_reference TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_pay_status order_payment_status;
BEGIN
  SELECT order_payment_status INTO v_order_pay_status
  FROM requests
  WHERE id = p_request_id;

  IF v_order_pay_status IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_order_pay_status IN ('paid', 'completed', 'refunded') THEN
    RETURN;
  END IF;

  UPDATE requests
  SET
    order_payment_status = 'failed',
    payment_provider_name = COALESCE(payment_provider_name, 'stripe'),
    payment_transaction_id = COALESCE(NULLIF(TRIM(p_external_reference), ''), payment_transaction_id),
    updated_at = NOW()
  WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION confirm_stripe_payment(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION confirm_stripe_payment(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION confirm_stripe_payment(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT) TO service_role;

REVOKE ALL ON FUNCTION mark_order_payment_failed(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION mark_order_payment_failed(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION mark_order_payment_failed(UUID, TEXT) TO service_role;
