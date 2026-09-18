-- 073: Provider withdraw offer / decline selected job (pre-payment).
-- Additive only. Does not touch payments ledger, balances, or Stripe.
-- Reuses the same reopen safety gates as 072 (unpaid / no work / no payment row).

-- A) Pending offer only — request stays open.
CREATE OR REPLACE FUNCTION public.provider_withdraw_offer(
  p_offer_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.offers%ROWTYPE;
  v_request public.requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_offer FROM public.offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  IF v_offer.provider_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_offer.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Only pending offers can be withdrawn';
  END IF;

  SELECT * INTO v_request FROM public.requests WHERE id = v_offer.request_id;
  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_request.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Offer can only be withdrawn while the order is open';
  END IF;

  UPDATE public.offers
  SET status = 'withdrawn', updated_at = NOW()
  WHERE id = p_offer_id;

  RETURN json_build_object(
    'offer_id', p_offer_id,
    'request_id', v_offer.request_id,
    'offer_status', 'withdrawn',
    'request_status', v_request.status,
    'chats_preserved', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provider_withdraw_offer(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provider_withdraw_offer(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_withdraw_offer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provider_withdraw_offer(UUID) TO service_role;

-- B) Selected provider declines before payment/work — reopen marketplace.
CREATE OR REPLACE FUNCTION public.provider_decline_selected_job(
  p_request_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.requests%ROWTYPE;
  v_accepted_offer_id UUID;
  v_provider_id UUID;
  v_restored_pending INT := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row FROM public.requests WHERE id = p_request_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_row.status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'Only selected in-progress jobs can be declined this way';
  END IF;

  IF COALESCE(v_row.order_payment_status, 'unpaid') NOT IN ('unpaid', 'payment_pending', 'failed') THEN
    RAISE EXCEPTION 'Cannot decline after payment is completed';
  END IF;

  IF EXISTS (SELECT 1 FROM public.payments p WHERE p.request_id = p_request_id) THEN
    RAISE EXCEPTION 'Cannot decline after a payment row exists';
  END IF;

  IF v_row.work_submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot decline after work has been submitted';
  END IF;

  IF to_regclass('public.work_submissions') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.work_submissions ws WHERE ws.request_id = p_request_id
     ) THEN
    RAISE EXCEPTION 'Cannot decline after work has been submitted';
  END IF;

  IF COALESCE(v_row.refund_dispute_status, 'none') NOT IN ('none') THEN
    RAISE EXCEPTION 'Cannot decline while a refund or dispute is active';
  END IF;

  SELECT o.id, o.provider_id
  INTO v_accepted_offer_id, v_provider_id
  FROM public.offers o
  WHERE o.request_id = p_request_id AND o.status = 'accepted'
  LIMIT 1;

  IF v_accepted_offer_id IS NULL THEN
    RAISE EXCEPTION 'No selected provider offer found';
  END IF;

  IF v_provider_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Declining provider leaves the job (withdrawn), not pending.
  UPDATE public.offers
  SET status = 'withdrawn', updated_at = NOW()
  WHERE id = v_accepted_offer_id;

  -- Other offers that were auto-closed on accept become pending again.
  UPDATE public.offers
  SET status = 'pending', updated_at = NOW()
  WHERE request_id = p_request_id
    AND id <> v_accepted_offer_id
    AND status = 'rejected';

  GET DIAGNOSTICS v_restored_pending = ROW_COUNT;

  UPDATE public.requests
  SET
    status = 'open',
    order_payment_status = 'unpaid',
    order_amount = NULL,
    look_commission = NULL,
    provider_payout_amount = NULL,
    payment_provider_name = NULL,
    payment_transaction_id = NULL,
    paid_at = NULL,
    payout_status = 'pending',
    updated_at = NOW()
  WHERE id = p_request_id;

  -- Conversations intentionally kept intact.

  RETURN json_build_object(
    'request_id', p_request_id,
    'status', 'open',
    'declined_offer_id', v_accepted_offer_id,
    'provider_id', v_provider_id,
    'restored_pending_offers', v_restored_pending,
    'chats_preserved', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provider_decline_selected_job(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provider_decline_selected_job(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_decline_selected_job(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provider_decline_selected_job(UUID) TO service_role;

COMMENT ON FUNCTION public.provider_withdraw_offer(UUID) IS
  'Provider withdraws a pending offer. Request stays open. Chats preserved.';

COMMENT ON FUNCTION public.provider_decline_selected_job(UUID) IS
  'Selected provider declines unpaid/pre-work job. Reopens request; other offers restored; chats preserved.';
