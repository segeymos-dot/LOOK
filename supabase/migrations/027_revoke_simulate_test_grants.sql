-- Revoke browser/client execution of simulated payment RPCs.
-- Trusted server routes may still call them via service_role after ENABLE_TEST_PAYMENTS=true.

-- ---------------------------------------------------------------------------
-- simulate_test_payment: allow service_role (auth.uid() is null for service key)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION simulate_test_payment(
  p_request_id UUID,
  p_external_reference TEXT DEFAULT NULL
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
  v_is_service BOOLEAN := (auth.role() = 'service_role');
BEGIN
  SELECT r.customer_id, r.status
  INTO v_customer_id, v_status
  FROM requests r
  WHERE r.id = p_request_id;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  IF NOT v_is_service AND v_customer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  IF v_status <> 'in_progress' THEN
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
  v_gross := ROUND(v_offer.price::NUMERIC, 2);
  v_fee := ROUND(v_gross * v_rate, 2);
  v_provider_amount := v_gross - v_fee;
  v_txn_id := COALESCE(NULLIF(TRIM(p_external_reference), ''), NULL);

  INSERT INTO payments (
    request_id, offer_id, customer_id, provider_id,
    amount_gross, platform_fee, provider_amount, currency,
    status, payment_method, external_reference, paid_at
  )
  VALUES (
    p_request_id, v_offer.id, v_customer_id, v_offer.provider_id,
    v_gross, v_fee, v_provider_amount, v_offer.currency,
    'paid', 'test', v_txn_id, NOW()
  )
  RETURNING id INTO v_payment_id;

  IF v_txn_id IS NULL THEN
    v_txn_id := v_payment_id::TEXT;
    UPDATE payments SET external_reference = v_txn_id WHERE id = v_payment_id;
  END IF;

  INSERT INTO platform_commissions (
    payment_id, request_id, gross_amount, commission_rate, commission_amount, currency
  )
  VALUES (
    v_payment_id, p_request_id, v_gross, v_rate, v_fee, v_offer.currency
  );

  INSERT INTO transactions (payment_id, request_id, user_id, type, amount, currency, description, metadata)
  VALUES
    (v_payment_id, p_request_id, v_customer_id, 'order_payment', v_gross, v_offer.currency,
     'Тестовая оплата заказа', jsonb_build_object('request_id', p_request_id)),
    (v_payment_id, p_request_id, NULL, 'platform_commission', v_fee, v_offer.currency,
     'Комиссия LOOK', jsonb_build_object('rate', v_rate)),
    (v_payment_id, p_request_id, v_offer.provider_id, 'provider_earning', v_provider_amount, v_offer.currency,
     'Начисление исполнителю', jsonb_build_object('provider_id', v_offer.provider_id));

  UPDATE transactions SET provider_id = v_offer.provider_id
  WHERE payment_id = v_payment_id AND type = 'provider_earning';

  INSERT INTO provider_balances (provider_id, available_balance, pending_payout, total_earned, currency)
  VALUES (v_offer.provider_id, v_provider_amount, 0, v_provider_amount, v_offer.currency)
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
    currency = v_offer.currency,
    payment_provider_name = 'look_test',
    payment_transaction_id = v_txn_id,
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
    'currency', v_offer.currency,
    'status', 'paid',
    'external_reference', v_txn_id,
    'order_payment_status', 'paid'
  );
END;
$$;

CREATE OR REPLACE FUNCTION simulate_test_payment(p_request_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN simulate_test_payment(p_request_id, NULL::TEXT);
END;
$$;

-- ---------------------------------------------------------------------------
-- simulate_test_payout: service_role must pass p_provider_id
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS simulate_test_payout(NUMERIC);

CREATE OR REPLACE FUNCTION simulate_test_payout(
  p_amount NUMERIC DEFAULT NULL,
  p_provider_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider_id UUID;
  v_balance provider_balances%ROWTYPE;
  v_amount NUMERIC(12, 2);
  v_payout_id UUID;
  v_is_service BOOLEAN := (auth.role() = 'service_role');
BEGIN
  IF v_is_service THEN
    v_provider_id := p_provider_id;
  ELSE
    v_provider_id := auth.uid();
  END IF;

  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_balance FROM provider_balances WHERE provider_id = v_provider_id;

  IF v_balance.provider_id IS NULL OR v_balance.available_balance <= 0 THEN
    RAISE EXCEPTION 'No available balance for payout';
  END IF;

  v_amount := COALESCE(p_amount, v_balance.available_balance);

  IF v_amount <= 0 OR v_amount > v_balance.available_balance THEN
    RAISE EXCEPTION 'Invalid payout amount';
  END IF;

  INSERT INTO payouts (provider_id, amount, currency, status, payment_method, processed_at)
  VALUES (v_provider_id, v_amount, v_balance.currency, 'completed', 'test', NOW())
  RETURNING id INTO v_payout_id;

  UPDATE provider_balances SET
    available_balance = available_balance - v_amount,
    pending_payout = 0,
    updated_at = NOW()
  WHERE provider_id = v_provider_id;

  INSERT INTO transactions (
    payout_id, user_id, provider_id, type, amount, currency, description, metadata
  )
  VALUES (
    v_payout_id, v_provider_id, v_provider_id, 'provider_payout', v_amount, v_balance.currency,
    'Тестовая выплата исполнителю',
    jsonb_build_object('payout_id', v_payout_id)
  );

  RETURN json_build_object(
    'payout_id', v_payout_id,
    'amount', v_amount,
    'currency', v_balance.currency,
    'status', 'completed'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- simulate_test_refund: allow service_role callers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION simulate_test_refund(p_request_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_is_service BOOLEAN := (auth.role() = 'service_role');
BEGIN
  SELECT * INTO v_payment
  FROM payments
  WHERE request_id = p_request_id AND status = 'paid';

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Paid payment not found';
  END IF;

  IF NOT v_is_service
     AND auth.uid() IS DISTINCT FROM v_payment.customer_id
     AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized to refund';
  END IF;

  UPDATE payments SET status = 'refunded', updated_at = NOW()
  WHERE id = v_payment.id;

  UPDATE provider_balances SET
    available_balance = GREATEST(0, available_balance - v_payment.provider_amount),
    total_earned = GREATEST(0, total_earned - v_payment.provider_amount),
    updated_at = NOW()
  WHERE provider_id = v_payment.provider_id;

  INSERT INTO transactions (
    payment_id, request_id, user_id, provider_id, type, amount, currency, status, description
  )
  VALUES (
    v_payment.id, p_request_id, v_payment.customer_id, v_payment.provider_id,
    'refund', v_payment.amount_gross, v_payment.currency, 'completed',
    'Тестовый возврат средств'
  );

  RETURN json_build_object('payment_id', v_payment.id, 'status', 'refunded');
END;
$$;

-- ---------------------------------------------------------------------------
-- Revoke direct client execution; grant service_role only
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION simulate_test_payment(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION simulate_test_payment(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION simulate_test_payment(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION simulate_test_payment(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION simulate_test_payment(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION simulate_test_payment(UUID) FROM anon;
REVOKE ALL ON FUNCTION simulate_test_payment(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION simulate_test_payment(UUID) TO service_role;

REVOKE ALL ON FUNCTION simulate_test_payout(NUMERIC, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION simulate_test_payout(NUMERIC, UUID) FROM anon;
REVOKE ALL ON FUNCTION simulate_test_payout(NUMERIC, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION simulate_test_payout(NUMERIC, UUID) TO service_role;

REVOKE ALL ON FUNCTION simulate_test_refund(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION simulate_test_refund(UUID) FROM anon;
REVOKE ALL ON FUNCTION simulate_test_refund(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION simulate_test_refund(UUID) TO service_role;

-- Legacy helper (no longer used by accept_work); block browser roles if present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'process_test_payment'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid, uuid'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION process_test_payment(UUID, UUID) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION process_test_payment(UUID, UUID) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION process_test_payment(UUID, UUID) FROM authenticated';
  END IF;
END $$;
