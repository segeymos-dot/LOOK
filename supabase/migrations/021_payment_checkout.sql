-- Commission 10% + optional external_reference on test payments

UPDATE platform_settings SET value = '0.10', updated_at = NOW() WHERE key = 'commission_rate';

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

  SELECT status INTO v_existing
  FROM payments
  WHERE request_id = p_request_id;

  IF v_existing = 'paid' THEN
    RAISE EXCEPTION 'Order already paid';
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

  INSERT INTO payments (
    request_id, offer_id, customer_id, provider_id,
    amount_gross, platform_fee, provider_amount, currency,
    status, payment_method, external_reference, paid_at
  )
  VALUES (
    p_request_id, v_offer.id, v_customer_id, v_offer.provider_id,
    v_gross, v_fee, v_provider_amount, v_offer.currency,
    'paid', 'test', p_external_reference, NOW()
  )
  RETURNING id INTO v_payment_id;

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

  RETURN json_build_object(
    'payment_id', v_payment_id,
    'request_id', p_request_id,
    'amount_gross', v_gross,
    'platform_fee', v_fee,
    'provider_amount', v_provider_amount,
    'commission_rate', v_rate,
    'currency', v_offer.currency,
    'status', 'paid',
    'external_reference', p_external_reference
  );
END;
$$;

REVOKE ALL ON FUNCTION simulate_test_payment(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulate_test_payment(UUID, TEXT) TO authenticated;

-- Keep single-arg overload for older clients
CREATE OR REPLACE FUNCTION simulate_test_payment(p_request_id UUID)
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT simulate_test_payment(p_request_id, NULL::TEXT);
$$;

REVOKE ALL ON FUNCTION simulate_test_payment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulate_test_payment(UUID) TO authenticated;
