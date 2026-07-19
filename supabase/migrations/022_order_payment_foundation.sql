-- Order-level payment fields (foundation for Stripe / PSP integration later).
-- Keeps existing request lifecycle status (open, in_progress, …) unchanged.

DO $$ BEGIN
  CREATE TYPE order_payment_status AS ENUM (
    'unpaid',
    'payment_pending',
    'paid',
    'completed',
    'refunded',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE requests ADD COLUMN IF NOT EXISTS order_payment_status order_payment_status NOT NULL DEFAULT 'unpaid';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS order_amount NUMERIC(12, 2);
ALTER TABLE requests ADD COLUMN IF NOT EXISTS look_commission NUMERIC(12, 2);
ALTER TABLE requests ADD COLUMN IF NOT EXISTS provider_payout_amount NUMERIC(12, 2);
ALTER TABLE requests ADD COLUMN IF NOT EXISTS payment_provider_name TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS payment_transaction_id TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS payout_status payout_status NOT NULL DEFAULT 'pending';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_requests_order_payment_status ON requests(order_payment_status);

-- When customer accepts an offer: snapshot amounts, mark order unpaid.
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
  v_price NUMERIC(12, 2);
  v_currency TEXT;
  v_rate NUMERIC;
  v_fee NUMERIC(12, 2);
  v_provider_amount NUMERIC(12, 2);
BEGIN
  SELECT o.request_id, o.provider_id, r.customer_id, o.price, o.currency
  INTO v_request_id, v_provider_id, v_customer_id, v_price, v_currency
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

  v_rate := get_platform_commission_rate();
  v_fee := ROUND(v_price * v_rate, 2);
  v_provider_amount := v_price - v_fee;

  UPDATE requests
  SET
    status = 'in_progress',
    order_payment_status = 'unpaid',
    order_amount = v_price,
    look_commission = v_fee,
    provider_payout_amount = v_provider_amount,
    currency = COALESCE(v_currency, currency),
    payment_provider_name = NULL,
    payment_transaction_id = NULL,
    paid_at = NULL,
    payout_status = 'pending',
    updated_at = NOW()
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

-- Mark checkout in progress (test / future PSP redirect).
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

  IF v_pay_status NOT IN ('unpaid', 'failed') THEN
    RAISE EXCEPTION 'Payment cannot be started for this order';
  END IF;

  UPDATE requests
  SET order_payment_status = 'payment_pending', updated_at = NOW()
  WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION begin_order_payment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION begin_order_payment(UUID) TO authenticated;

-- Test payment: also sync order payment columns on requests.
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

REVOKE ALL ON FUNCTION simulate_test_payment(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulate_test_payment(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION simulate_test_payment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulate_test_payment(UUID) TO authenticated;
