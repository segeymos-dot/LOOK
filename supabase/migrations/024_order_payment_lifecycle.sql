-- Complete order payment lifecycle: paid → completed on work acceptance.
-- Idempotent transitions; financial ledger rows are never duplicated.

-- begin_order_payment: allow re-entry while checkout is open (payment_pending).
CREATE OR REPLACE FUNCTION begin_order_payment(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
  v_pay_status order_payment_status;
BEGIN
  SELECT customer_id, order_payment_status
  INTO v_customer_id, v_pay_status
  FROM requests
  WHERE id = p_request_id;

  IF v_customer_id IS NULL OR v_customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  IF v_pay_status = 'payment_pending' THEN
    RETURN;
  END IF;

  IF v_pay_status NOT IN ('unpaid', 'failed') THEN
    RAISE EXCEPTION 'Payment cannot be started for this order';
  END IF;

  UPDATE requests
  SET order_payment_status = 'payment_pending', updated_at = NOW()
  WHERE id = p_request_id;
END;
$$;

-- simulate_test_payment: idempotent when already paid (safe retries).
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
BEGIN
  SELECT r.customer_id, r.status
  INTO v_customer_id, v_status
  FROM requests r
  WHERE r.id = p_request_id;

  IF v_customer_id IS NULL OR v_customer_id <> auth.uid() THEN
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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT simulate_test_payment(p_request_id, NULL::TEXT);
$$;

-- Customer accepts work: finalize order payment lifecycle (paid → completed).
-- Does not create duplicate payment rows; requires prior checkout payment.
CREATE OR REPLACE FUNCTION accept_work(p_request_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status request_status;
  v_customer_id UUID;
  v_provider_id UUID;
  v_payment_id UUID;
  v_order_pay_status order_payment_status;
  v_rows INTEGER;
BEGIN
  SELECT r.status, r.customer_id, o.provider_id, r.order_payment_status
  INTO v_status, v_customer_id, v_provider_id, v_order_pay_status
  FROM requests r
  LEFT JOIN offers o ON o.request_id = r.id AND o.status = 'accepted'
  WHERE r.id = p_request_id AND r.customer_id = auth.uid();

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  SELECT id INTO v_payment_id
  FROM payments
  WHERE request_id = p_request_id AND status = 'paid';

  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'Order must be paid before work can be accepted';
  END IF;

  IF v_status = 'completed' OR v_order_pay_status = 'completed' THEN
    RETURN json_build_object(
      'request_id', p_request_id,
      'status', 'completed',
      'payment_id', v_payment_id,
      'order_payment_status', 'completed',
      'already_completed', true
    );
  END IF;

  IF v_status <> 'pending_review' THEN
    RAISE EXCEPTION 'Work can only be accepted while pending customer review';
  END IF;

  UPDATE requests
  SET
    status = 'completed',
    revision_feedback = NULL,
    order_payment_status = 'completed',
    updated_at = NOW()
  WHERE id = p_request_id
    AND status = 'pending_review';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    SELECT status, order_payment_status
    INTO v_status, v_order_pay_status
    FROM requests
    WHERE id = p_request_id;

    IF v_status = 'completed' THEN
      RETURN json_build_object(
        'request_id', p_request_id,
        'status', 'completed',
        'payment_id', v_payment_id,
        'order_payment_status', COALESCE(v_order_pay_status::text, 'completed'),
        'already_completed', true
      );
    END IF;

    RAISE EXCEPTION 'Work can only be accepted while pending customer review';
  END IF;

  IF v_provider_id IS NOT NULL THEN
    UPDATE profiles
    SET completed_orders_count = completed_orders_count + 1, updated_at = NOW()
    WHERE id = v_provider_id;
  END IF;

  RETURN json_build_object(
    'request_id', p_request_id,
    'status', 'completed',
    'payment_id', v_payment_id,
    'order_payment_status', 'completed'
  );
END;
$$;

-- Legacy complete_request: idempotent; syncs order_payment_status when order is finished.
CREATE OR REPLACE FUNCTION complete_request(p_request_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status request_status;
  v_provider_id UUID;
  v_order_pay_status order_payment_status;
  v_rows INTEGER;
BEGIN
  SELECT r.status, o.provider_id, r.order_payment_status
  INTO v_status, v_provider_id, v_order_pay_status
  FROM requests r
  LEFT JOIN offers o ON o.request_id = r.id AND o.status = 'accepted'
  WHERE r.id = p_request_id
    AND r.customer_id = auth.uid();

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  IF v_status = 'completed' OR v_order_pay_status = 'completed' THEN
    RETURN json_build_object(
      'request_id', p_request_id,
      'status', 'completed',
      'order_payment_status', 'completed',
      'already_completed', true
    );
  END IF;

  IF v_status = 'pending_review' THEN
    RETURN accept_work(p_request_id);
  END IF;

  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Request must be in progress to complete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM payments
    WHERE request_id = p_request_id AND status = 'paid'
  ) THEN
    RAISE EXCEPTION 'Order must be paid before completion';
  END IF;

  UPDATE requests
  SET
    status = 'completed',
    order_payment_status = 'completed',
    updated_at = NOW()
  WHERE id = p_request_id
    AND status = 'in_progress';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    SELECT status INTO v_status FROM requests WHERE id = p_request_id;
    IF v_status = 'completed' THEN
      RETURN json_build_object(
        'request_id', p_request_id,
        'status', 'completed',
        'order_payment_status', 'completed',
        'already_completed', true
      );
    END IF;
    RAISE EXCEPTION 'Request must be in progress to complete';
  END IF;

  IF v_provider_id IS NOT NULL THEN
    UPDATE profiles
    SET completed_orders_count = completed_orders_count + 1,
        updated_at = NOW()
    WHERE id = v_provider_id;
  END IF;

  RETURN json_build_object(
    'request_id', p_request_id,
    'status', 'completed',
    'order_payment_status', 'completed'
  );
END;
$$;

REVOKE ALL ON FUNCTION begin_order_payment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION begin_order_payment(UUID) TO authenticated;
REVOKE ALL ON FUNCTION simulate_test_payment(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulate_test_payment(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION simulate_test_payment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulate_test_payment(UUID) TO authenticated;
REVOKE ALL ON FUNCTION accept_work(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_work(UUID) TO authenticated;
REVOKE ALL ON FUNCTION complete_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_request(UUID) TO authenticated;
