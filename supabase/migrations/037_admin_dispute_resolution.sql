-- Admin dispute resolution: audit fields + idempotent settlement RPC (test payments only).
-- Real Stripe untouched. Callable only via service_role after app-level admin auth.

DO $$ BEGIN
  CREATE TYPE dispute_resolution_decision AS ENUM (
    'full_refund_customer',
    'partial_refund',
    'release_full_payout',
    'split_settlement',
    'reject'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE order_disputes
  ADD COLUMN IF NOT EXISTS resolution_decision dispute_resolution_decision;

ALTER TABLE order_disputes
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE order_disputes
  ADD COLUMN IF NOT EXISTS customer_refund_amount NUMERIC(12, 2);

ALTER TABLE order_disputes
  ADD COLUMN IF NOT EXISTS provider_release_amount NUMERIC(12, 2);

ALTER TABLE order_disputes
  ADD COLUMN IF NOT EXISTS platform_fee_retained NUMERIC(12, 2);

ALTER TABLE order_disputes
  ADD COLUMN IF NOT EXISTS amounts_before JSONB;

ALTER TABLE order_disputes
  ADD COLUMN IF NOT EXISTS amounts_after JSONB;

ALTER TABLE order_disputes
  ADD COLUMN IF NOT EXISTS resolution_idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS order_disputes_resolution_idempotency_uidx
  ON order_disputes (resolution_idempotency_key)
  WHERE resolution_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_disputes_resolved_at
  ON order_disputes (resolved_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_order_disputes_resolution_decision
  ON order_disputes (resolution_decision);

CREATE OR REPLACE FUNCTION preview_dispute_settlement(
  p_dispute_id UUID,
  p_decision dispute_resolution_decision,
  p_customer_refund NUMERIC DEFAULT NULL,
  p_provider_release NUMERIC DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dispute order_disputes%ROWTYPE;
  v_payment payments%ROWTYPE;
  v_gross NUMERIC(12, 2);
  v_fee NUMERIC(12, 2);
  v_provider NUMERIC(12, 2);
  v_refund NUMERIC(12, 2);
  v_provider_keep NUMERIC(12, 2);
  v_platform_keep NUMERIC(12, 2);
  v_provider_clawback NUMERIC(12, 2);
  v_fee_reverse NUMERIC(12, 2);
BEGIN
  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id;
  IF v_dispute.id IS NULL THEN
    RAISE EXCEPTION 'Dispute not found';
  END IF;

  SELECT * INTO v_payment FROM payments WHERE id = v_dispute.payment_id;
  IF v_payment.id IS NULL THEN
    SELECT * INTO v_payment
    FROM payments
    WHERE request_id = v_dispute.request_id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;
  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Payment not found for dispute';
  END IF;

  v_gross := v_payment.amount_gross;
  v_fee := v_payment.platform_fee;
  v_provider := v_payment.provider_amount;

  IF p_decision = 'full_refund_customer' THEN
    v_refund := v_gross;
    v_provider_keep := 0;
    v_platform_keep := 0;
  ELSIF p_decision = 'release_full_payout' OR p_decision = 'reject' THEN
    v_refund := 0;
    v_provider_keep := v_provider;
    v_platform_keep := v_fee;
  ELSIF p_decision IN ('partial_refund', 'split_settlement') THEN
    v_refund := ROUND(COALESCE(p_customer_refund, 0), 2);
    v_provider_keep := ROUND(COALESCE(p_provider_release, v_provider), 2);
    IF v_refund < 0 OR v_provider_keep < 0 THEN
      RAISE EXCEPTION 'Amounts must be non-negative';
    END IF;
    IF v_refund + v_provider_keep > v_gross + 0.001 THEN
      RAISE EXCEPTION 'Refund + provider release cannot exceed gross amount';
    END IF;
    v_platform_keep := ROUND(v_gross - v_refund - v_provider_keep, 2);
  ELSE
    RAISE EXCEPTION 'Unknown decision';
  END IF;

  v_provider_clawback := GREATEST(0, ROUND(v_provider - v_provider_keep, 2));
  v_fee_reverse := GREATEST(0, ROUND(v_fee - v_platform_keep, 2));

  RETURN json_build_object(
    'dispute_id', v_dispute.id,
    'request_id', v_dispute.request_id,
    'payment_id', v_payment.id,
    'currency', v_payment.currency,
    'payment_status', v_payment.status,
    'decision', p_decision,
    'already_resolved', v_dispute.status IS DISTINCT FROM 'opened',
    'gross', v_gross,
    'original_platform_fee', v_fee,
    'original_provider_amount', v_provider,
    'customer_refund', v_refund,
    'provider_release', v_provider_keep,
    'platform_fee_retained', v_platform_keep,
    'provider_clawback', v_provider_clawback,
    'platform_fee_reversal', v_fee_reverse,
    'effects', json_build_array(
      json_build_object('party', 'customer', 'label', 'customer_refund', 'amount', v_refund, 'signed', v_refund),
      json_build_object('party', 'provider', 'label', 'provider_clawback', 'amount', v_provider_clawback, 'signed', -v_provider_clawback),
      json_build_object('party', 'provider', 'label', 'provider_keeps', 'amount', v_provider_keep, 'signed', 0),
      json_build_object('party', 'platform', 'label', 'commission_reversal', 'amount', v_fee_reverse, 'signed', -v_fee_reverse),
      json_build_object('party', 'platform', 'label', 'commission_retained', 'amount', v_platform_keep, 'signed', 0)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION resolve_order_dispute(
  p_dispute_id UUID,
  p_admin_id UUID,
  p_decision dispute_resolution_decision,
  p_resolution_note TEXT,
  p_customer_refund NUMERIC DEFAULT NULL,
  p_provider_release NUMERIC DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dispute order_disputes%ROWTYPE;
  v_payment payments%ROWTYPE;
  v_request requests%ROWTYPE;
  v_note TEXT := NULLIF(TRIM(COALESCE(p_resolution_note, '')), '');
  v_preview JSON;
  v_refund NUMERIC(12, 2);
  v_provider_keep NUMERIC(12, 2);
  v_platform_keep NUMERIC(12, 2);
  v_provider_clawback NUMERIC(12, 2);
  v_fee_reverse NUMERIC(12, 2);
  v_key TEXT;
  v_before JSONB;
  v_after JSONB;
  v_bal_before NUMERIC(12, 2) := 0;
  v_bal_after NUMERIC(12, 2) := 0;
  v_has_refund BOOLEAN := false;
  v_has_earn_rev BOOLEAN := false;
  v_has_fee_rev BOOLEAN := false;
  v_tx_refund UUID;
  v_tx_earn UUID;
  v_tx_fee UUID;
  v_tx_resolved UUID;
  v_money_move BOOLEAN := false;
  v_new_req_status request_status;
  v_new_pay_status order_payment_status;
  v_new_rds refund_dispute_status;
  v_dispute_status TEXT;
BEGIN
  IF v_note IS NULL OR char_length(v_note) < 5 THEN
    RAISE EXCEPTION 'Resolution note is required (min 5 characters)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND is_platform_admin = true
  ) THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;

  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_dispute.id IS NULL THEN
    RAISE EXCEPTION 'Dispute not found';
  END IF;

  v_key := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
  IF v_key IS NULL THEN
    v_key := v_dispute.id::text || ':' || p_decision::text;
  END IF;

  IF v_dispute.status IS DISTINCT FROM 'opened' THEN
    RETURN json_build_object(
      'dispute_id', v_dispute.id,
      'request_id', v_dispute.request_id,
      'status', v_dispute.status,
      'decision', v_dispute.resolution_decision,
      'already_resolved', true,
      'resolution_note', v_dispute.resolution_note
    );
  END IF;

  v_preview := preview_dispute_settlement(
    p_dispute_id, p_decision, p_customer_refund, p_provider_release
  );

  SELECT * INTO v_payment FROM payments WHERE id = (v_preview->>'payment_id')::uuid FOR UPDATE;
  SELECT * INTO v_request FROM requests WHERE id = v_dispute.request_id FOR UPDATE;

  IF v_payment.payment_method IS DISTINCT FROM 'test'
     AND COALESCE(v_payment.payment_method, '') NOT ILIKE 'test%'
     AND COALESCE(v_payment.payment_method, '') NOT ILIKE 'look_test%' THEN
    RAISE EXCEPTION 'TEST_SETTLEMENT_ONLY: Real Stripe payments cannot be settled by this function';
  END IF;

  v_refund := (v_preview->>'customer_refund')::numeric;
  v_provider_keep := (v_preview->>'provider_release')::numeric;
  v_platform_keep := (v_preview->>'platform_fee_retained')::numeric;
  v_provider_clawback := (v_preview->>'provider_clawback')::numeric;
  v_fee_reverse := (v_preview->>'platform_fee_reversal')::numeric;
  v_money_move := (v_refund > 0 OR v_provider_clawback > 0 OR v_fee_reverse > 0);

  SELECT COALESCE(available_balance, 0) INTO v_bal_before
  FROM provider_balances WHERE provider_id = v_payment.provider_id;

  v_before := jsonb_build_object(
    'payment_status', v_payment.status,
    'order_payment_status', v_request.order_payment_status,
    'refund_dispute_status', v_request.refund_dispute_status,
    'request_status', v_request.status,
    'provider_available_balance', v_bal_before,
    'amount_gross', v_payment.amount_gross,
    'platform_fee', v_payment.platform_fee,
    'provider_amount', v_payment.provider_amount
  );

  SELECT EXISTS(
    SELECT 1 FROM transactions
    WHERE payment_id = v_payment.id AND ledger_code = 'customer_refund' AND status = 'completed'
  ) INTO v_has_refund;
  SELECT EXISTS(
    SELECT 1 FROM transactions
    WHERE payment_id = v_payment.id AND ledger_code = 'provider_earning_reversal' AND status = 'completed'
  ) INTO v_has_earn_rev;
  SELECT EXISTS(
    SELECT 1 FROM transactions
    WHERE payment_id = v_payment.id AND ledger_code = 'platform_commission_reversal' AND status = 'completed'
  ) INTO v_has_fee_rev;

  IF v_money_move AND (v_has_refund OR v_has_earn_rev OR v_has_fee_rev) THEN
    v_money_move := false;
  END IF;

  v_new_req_status := v_request.status;
  v_new_pay_status := v_request.order_payment_status;
  v_new_rds := v_request.refund_dispute_status;

  IF v_money_move THEN
    IF v_provider_clawback > 0 THEN
      UPDATE provider_balances SET
        available_balance = GREATEST(0, available_balance - v_provider_clawback),
        total_earned = GREATEST(0, total_earned - v_provider_clawback),
        updated_at = NOW()
      WHERE provider_id = v_payment.provider_id;
    END IF;

    IF v_refund > 0 THEN
      v_tx_refund := insert_ledger_entry(
        v_payment.id, v_dispute.request_id, v_payment.customer_id, v_payment.provider_id,
        'customer_refund', 'customer_refund',
        v_refund, ABS(v_refund), 'customer', v_payment.currency,
        jsonb_build_object(
          'source', 'resolve_order_dispute',
          'decision', p_decision::text,
          'dispute_id', v_dispute.id,
          'note', v_note
        )
      );
    END IF;

    IF v_provider_clawback > 0 THEN
      v_tx_earn := insert_ledger_entry(
        v_payment.id, v_dispute.request_id, v_payment.customer_id, v_payment.provider_id,
        'provider_earning_reversal', 'provider_earning_reversal',
        v_provider_clawback, -ABS(v_provider_clawback), 'provider', v_payment.currency,
        jsonb_build_object(
          'source', 'resolve_order_dispute',
          'decision', p_decision::text,
          'dispute_id', v_dispute.id
        )
      );
    END IF;

    IF v_fee_reverse > 0 THEN
      v_tx_fee := insert_ledger_entry(
        v_payment.id, v_dispute.request_id, NULL, v_payment.provider_id,
        'platform_commission_reversal', 'platform_commission_reversal',
        v_fee_reverse, -ABS(v_fee_reverse), 'platform', v_payment.currency,
        jsonb_build_object(
          'source', 'resolve_order_dispute',
          'decision', p_decision::text,
          'dispute_id', v_dispute.id
        )
      );
    END IF;

    IF v_refund >= v_payment.amount_gross - 0.001 THEN
      UPDATE payments SET
        status = 'refunded',
        refund_amount = v_refund,
        refund_reason = v_note,
        refunded_at = COALESCE(refunded_at, NOW()),
        updated_at = NOW()
      WHERE id = v_payment.id;
      v_new_req_status := 'cancelled';
      v_new_pay_status := 'refunded';
      v_new_rds := 'refunded';
    ELSE
      UPDATE payments SET
        refund_amount = v_refund,
        refund_reason = v_note,
        refunded_at = CASE WHEN v_refund > 0 THEN COALESCE(refunded_at, NOW()) ELSE refunded_at END,
        updated_at = NOW()
      WHERE id = v_payment.id;
      v_new_req_status := 'completed';
      v_new_pay_status := 'completed';
      v_new_rds := CASE WHEN v_refund > 0 THEN 'refunded'::refund_dispute_status ELSE 'refund_rejected'::refund_dispute_status END;
    END IF;
  ELSE
    v_new_rds := 'refund_rejected';
    IF p_decision = 'release_full_payout' THEN
      v_new_req_status := 'completed';
      v_new_pay_status := 'completed';
    END IF;
  END IF;

  UPDATE requests SET
    status = v_new_req_status,
    order_payment_status = v_new_pay_status,
    refund_dispute_status = v_new_rds,
    refund_amount = CASE WHEN v_refund > 0 THEN v_refund ELSE refund_amount END,
    refund_reason = CASE WHEN v_refund > 0 OR p_decision IN ('reject', 'release_full_payout') THEN v_note ELSE refund_reason END,
    refunded_at = CASE WHEN v_refund > 0 THEN COALESCE(refunded_at, NOW()) ELSE refunded_at END,
    updated_at = NOW()
  WHERE id = v_dispute.request_id;

  SELECT COALESCE(available_balance, 0) INTO v_bal_after
  FROM provider_balances WHERE provider_id = v_payment.provider_id;

  v_after := jsonb_build_object(
    'payment_status', (SELECT status::text FROM payments WHERE id = v_payment.id),
    'order_payment_status', v_new_pay_status,
    'refund_dispute_status', v_new_rds,
    'request_status', v_new_req_status,
    'provider_available_balance', v_bal_after,
    'customer_refund', v_refund,
    'provider_release', v_provider_keep,
    'platform_fee_retained', v_platform_keep
  );

  v_dispute_status := CASE
    WHEN p_decision = 'reject' THEN 'rejected'
    WHEN p_decision = 'release_full_payout' THEN 'closed'
    WHEN v_refund > 0 THEN 'refunded'
    ELSE 'closed'
  END;

  UPDATE order_disputes SET
    status = v_dispute_status,
    resolution_decision = p_decision,
    resolution_note = v_note,
    resolved_by = p_admin_id,
    resolved_at = NOW(),
    customer_refund_amount = v_refund,
    provider_release_amount = v_provider_keep,
    platform_fee_retained = v_platform_keep,
    amounts_before = v_before,
    amounts_after = v_after,
    resolution_idempotency_key = v_key,
    updated_at = NOW()
  WHERE id = v_dispute.id;

  v_tx_resolved := insert_ledger_entry(
    v_payment.id, v_dispute.request_id, p_admin_id, v_payment.provider_id,
    'dispute_resolved', 'dispute_resolved',
    0, 0, 'system', v_payment.currency,
    jsonb_build_object(
      'dispute_id', v_dispute.id,
      'decision', p_decision::text,
      'note', v_note,
      'resolved_by', p_admin_id,
      'customer_refund', v_refund,
      'provider_release', v_provider_keep,
      'platform_fee_retained', v_platform_keep
    )
  );

  RETURN json_build_object(
    'dispute_id', v_dispute.id,
    'request_id', v_dispute.request_id,
    'payment_id', v_payment.id,
    'already_resolved', false,
    'decision', p_decision,
    'status', v_dispute_status,
    'customer_refund', v_refund,
    'provider_release', v_provider_keep,
    'platform_fee_retained', v_platform_keep,
    'amounts_before', v_before,
    'amounts_after', v_after,
    'ledger', json_build_object(
      'customer_refund', v_tx_refund,
      'provider_earning_reversal', v_tx_earn,
      'platform_commission_reversal', v_tx_fee,
      'dispute_resolved', v_tx_resolved
    ),
    'preview', v_preview
  );
END;
$$;

REVOKE ALL ON FUNCTION preview_dispute_settlement(UUID, dispute_resolution_decision, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION preview_dispute_settlement(UUID, dispute_resolution_decision, NUMERIC, NUMERIC) TO service_role;

REVOKE ALL ON FUNCTION resolve_order_dispute(UUID, UUID, dispute_resolution_decision, TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION resolve_order_dispute(UUID, UUID, dispute_resolution_decision, TEXT, NUMERIC, NUMERIC, TEXT) FROM anon;
REVOKE ALL ON FUNCTION resolve_order_dispute(UUID, UUID, dispute_resolution_decision, TEXT, NUMERIC, NUMERIC, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION resolve_order_dispute(UUID, UUID, dispute_resolution_decision, TEXT, NUMERIC, NUMERIC, TEXT) TO service_role;

-- Admin tooling / service role must fully manage dispute rows for resolution audit.
GRANT SELECT, INSERT, UPDATE ON TABLE order_disputes TO service_role;
