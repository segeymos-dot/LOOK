-- 068: production-safe test orders + test payment (no Stripe, no real balances)
-- Additive only. Existing rows stay is_test = false.

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.requests.is_test IS
  'When true, order may use prod-safe LOOK test payment only (no Stripe / no real payout).';
COMMENT ON COLUMN public.payments.is_test IS
  'When true, payment is simulated look_test — exclude from real revenue and provider payable.';

CREATE INDEX IF NOT EXISTS requests_is_test_idx
  ON public.requests (is_test)
  WHERE is_test = true;

CREATE INDEX IF NOT EXISTS payments_is_test_idx
  ON public.payments (is_test)
  WHERE is_test = true;

-- Owner may mark an open unpaid order as test (immutable once true).
CREATE OR REPLACE FUNCTION public.set_request_is_test(
  p_request_id UUID,
  p_is_test BOOLEAN DEFAULT true
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_is_test IS NOT TRUE THEN
    RAISE EXCEPTION 'Clearing is_test is not allowed';
  END IF;

  SELECT * INTO v_row FROM public.requests WHERE id = p_request_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_row.customer_id <> v_uid AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_row.is_test THEN
    RETURN json_build_object('request_id', v_row.id, 'is_test', true, 'already', true);
  END IF;

  IF v_row.status NOT IN ('open', 'in_progress') THEN
    RAISE EXCEPTION 'Only open or in-progress orders can be marked as test';
  END IF;

  IF COALESCE(v_row.order_payment_status, 'unpaid') NOT IN ('unpaid', 'payment_pending') THEN
    RAISE EXCEPTION 'Paid orders cannot be marked as test';
  END IF;

  UPDATE public.requests
  SET is_test = true, updated_at = NOW()
  WHERE id = p_request_id;

  RETURN json_build_object('request_id', p_request_id, 'is_test', true, 'already', false);
END;
$$;

REVOKE ALL ON FUNCTION public.set_request_is_test(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_request_is_test(UUID, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_request_is_test(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_request_is_test(UUID, BOOLEAN) TO service_role;

-- Prod-safe simulate: owner-only, is_test required, no provider_balances credit, no Stripe.
CREATE OR REPLACE FUNCTION public.simulate_prod_safe_test_payment(
  p_request_id UUID,
  p_external_reference TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_customer_id UUID;
  v_status request_status;
  v_is_test BOOLEAN;
  v_order_pay order_payment_status;
  v_offer offers%ROWTYPE;
  v_rate NUMERIC;
  v_gross NUMERIC(12, 2);
  v_fee NUMERIC(12, 2);
  v_provider_amount NUMERIC(12, 2);
  v_payment_id UUID;
  v_existing payments%ROWTYPE;
  v_ref TEXT := NULLIF(TRIM(COALESCE(p_external_reference, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT r.customer_id, r.status, r.is_test, r.order_payment_status
  INTO v_customer_id, v_status, v_is_test, v_order_pay
  FROM public.requests r
  WHERE r.id = p_request_id;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_customer_id <> v_uid THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_is_test IS NOT TRUE THEN
    RAISE EXCEPTION 'Test payment is only allowed for is_test orders';
  END IF;

  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Payment is only available for orders in progress';
  END IF;

  SELECT * INTO v_existing FROM public.payments WHERE request_id = p_request_id;
  IF v_existing.id IS NOT NULL AND v_existing.status = 'paid' THEN
    -- Idempotent: return existing paid test payment
    RETURN json_build_object(
      'payment_id', v_existing.id,
      'request_id', p_request_id,
      'amount_gross', v_existing.amount_gross,
      'platform_fee', v_existing.platform_fee,
      'provider_amount', v_existing.provider_amount,
      'commission_rate', get_platform_commission_rate(),
      'currency', v_existing.currency,
      'status', 'paid',
      'is_test', true,
      'payment_provider', 'look_test',
      'payout_status', 'cancelled',
      'idempotent', true,
      'order_payment_status', 'paid'
    );
  END IF;

  IF v_order_pay IN ('paid', 'completed') THEN
    RAISE EXCEPTION 'Order is already paid';
  END IF;

  SELECT o.* INTO v_offer
  FROM public.offers o
  WHERE o.request_id = p_request_id AND o.status = 'accepted'
  LIMIT 1;

  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'No accepted offer found for this order';
  END IF;

  v_rate := get_platform_commission_rate();
  v_gross := ROUND(v_offer.price::NUMERIC, 2);
  v_fee := ROUND(v_gross * v_rate, 2);
  v_provider_amount := v_gross - v_fee;

  IF v_ref IS NULL THEN
    v_ref := 'look_test_' || replace(gen_random_uuid()::text, '-', '');
  END IF;

  INSERT INTO public.payments (
    request_id, offer_id, customer_id, provider_id,
    amount_gross, platform_fee, provider_amount, currency,
    status, payment_method, external_reference, paid_at, is_test
  )
  VALUES (
    p_request_id, v_offer.id, v_customer_id, v_offer.provider_id,
    v_gross, v_fee, v_provider_amount, v_offer.currency,
    'paid', 'look_test', v_ref, NOW(), true
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO public.platform_commissions (
    payment_id, request_id, gross_amount, commission_rate, commission_amount, currency
  )
  VALUES (v_payment_id, p_request_id, v_gross, v_rate, v_fee, v_offer.currency)
  ON CONFLICT (payment_id) DO NOTHING;

  -- Ledger for audit; metadata marks test so analytics can filter.
  PERFORM insert_ledger_entry(
    v_payment_id, p_request_id, v_customer_id, v_offer.provider_id,
    'order_payment', 'order_payment', v_gross, -ABS(v_gross), 'customer', v_offer.currency,
    jsonb_build_object('request_id', p_request_id, 'is_test', true, 'provider', 'look_test')
  );
  PERFORM insert_ledger_entry(
    v_payment_id, p_request_id, NULL, v_offer.provider_id,
    'platform_commission', 'platform_commission', v_fee, ABS(v_fee), 'platform', v_offer.currency,
    jsonb_build_object('rate', v_rate, 'is_test', true, 'provider', 'look_test')
  );
  PERFORM insert_ledger_entry(
    v_payment_id, p_request_id, v_offer.provider_id, v_offer.provider_id,
    'provider_earning', 'provider_earning', v_provider_amount, ABS(v_provider_amount), 'provider', v_offer.currency,
    jsonb_build_object('provider_id', v_offer.provider_id, 'is_test', true, 'provider', 'look_test', 'payout', 'simulated')
  );

  -- Intentionally DO NOT credit provider_balances (no real payable / payout).

  UPDATE public.requests
  SET order_payment_status = 'paid',
      order_amount = v_gross,
      look_commission = v_fee,
      provider_payout_amount = v_provider_amount,
      payment_provider_name = 'look_test',
      payment_transaction_id = v_ref,
      payout_status = 'cancelled',
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
    'status', 'paid',
    'is_test', true,
    'payment_provider', 'look_test',
    'payout_status', 'cancelled',
    'idempotent', false,
    'order_payment_status', 'paid'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.simulate_prod_safe_test_payment(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.simulate_prod_safe_test_payment(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.simulate_prod_safe_test_payment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.simulate_prod_safe_test_payment(UUID, TEXT) TO service_role;
