-- 071: Fix simulate_prod_safe_test_payment ledger writes for production schema.
-- Additive. No Stripe. Does not credit provider_balances.
--
-- ROOT CAUSE:
--   068 called insert_ledger_entry(...) from migration 034.
--   Production never received 034: insert_ledger_entry does not exist, and
--   transactions has no ledger_code / amount_signed / account_scope / idempotency_key.
--   PostgreSQL reported: function insert_ledger_entry(uuid,...,unknown,...,jsonb) does not exist.
--
-- FIX:
--   Write audit rows with the canonical production (012) transactions columns.
--   When 034+ ledger helper exists, call it with explicit casts (no unknown literals).
--   Entire function remains a single transaction (failed ledger ⇒ full rollback).

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
  v_has_ledger_helper BOOLEAN := false;
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

  -- Payment + commissions + ledger + request update are one DB transaction.
  -- Any exception after this point rolls back the payment row as well.
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

  v_has_ledger_helper := (
    to_regprocedure(
      'public.insert_ledger_entry(uuid,uuid,uuid,uuid,transaction_type,text,numeric,numeric,text,text,jsonb)'
    ) IS NOT NULL
  );

  IF v_has_ledger_helper THEN
    -- 034+ environments: call helper with explicit casts (never bare unknown literals).
    PERFORM public.insert_ledger_entry(
      v_payment_id, p_request_id, v_customer_id, v_offer.provider_id,
      'order_payment'::transaction_type, 'order_payment'::text,
      v_gross, -ABS(v_gross), 'customer'::text, v_offer.currency,
      jsonb_build_object('request_id', p_request_id, 'is_test', true, 'provider', 'look_test')
    );
    PERFORM public.insert_ledger_entry(
      v_payment_id, p_request_id, NULL, v_offer.provider_id,
      'platform_commission'::transaction_type, 'platform_commission'::text,
      v_fee, ABS(v_fee), 'platform'::text, v_offer.currency,
      jsonb_build_object('rate', v_rate, 'is_test', true, 'provider', 'look_test')
    );
    PERFORM public.insert_ledger_entry(
      v_payment_id, p_request_id, v_offer.provider_id, v_offer.provider_id,
      'provider_earning'::transaction_type, 'provider_earning'::text,
      v_provider_amount, ABS(v_provider_amount), 'provider'::text, v_offer.currency,
      jsonb_build_object(
        'provider_id', v_offer.provider_id,
        'is_test', true,
        'provider', 'look_test',
        'payout', 'simulated'
      )
    );
  ELSE
    -- Production (012) contract: direct transactions insert. No provider_balances.
    INSERT INTO public.transactions (
      payment_id, request_id, user_id, provider_id,
      type, amount, currency, status, description, metadata
    )
    VALUES
      (
        v_payment_id, p_request_id, v_customer_id, v_offer.provider_id,
        'order_payment'::transaction_type, v_gross, v_offer.currency, 'completed',
        'order_payment',
        jsonb_build_object('request_id', p_request_id, 'is_test', true, 'provider', 'look_test')
      ),
      (
        v_payment_id, p_request_id, NULL, v_offer.provider_id,
        'platform_commission'::transaction_type, v_fee, v_offer.currency, 'completed',
        'platform_commission',
        jsonb_build_object('rate', v_rate, 'is_test', true, 'provider', 'look_test')
      ),
      (
        v_payment_id, p_request_id, v_offer.provider_id, v_offer.provider_id,
        'provider_earning'::transaction_type, v_provider_amount, v_offer.currency, 'completed',
        'provider_earning',
        jsonb_build_object(
          'provider_id', v_offer.provider_id,
          'is_test', true,
          'provider', 'look_test',
          'payout', 'simulated'
        )
      );
  END IF;

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

COMMENT ON FUNCTION public.simulate_prod_safe_test_payment(UUID, TEXT) IS
  'Prod-safe zero-money test payment. Uses insert_ledger_entry when 034+ present; else 012 transactions insert. Never credits provider_balances. Never calls card networks.';
