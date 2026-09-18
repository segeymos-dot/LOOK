-- 072: Unassign selected provider before payment / work start.
-- Additive only. Restores marketplace OPEN so other providers can offer again.
-- Does not touch payments rows, transactions, or provider_balances.

CREATE OR REPLACE FUNCTION public.unassign_selected_provider(
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

  IF v_row.customer_id <> auth.uid() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_row.status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'Only in-progress orders with a selected provider can be unassigned';
  END IF;

  IF COALESCE(v_row.order_payment_status, 'unpaid') NOT IN ('unpaid', 'payment_pending', 'failed') THEN
    RAISE EXCEPTION 'Cannot unassign after payment is completed';
  END IF;

  IF EXISTS (SELECT 1 FROM public.payments p WHERE p.request_id = p_request_id) THEN
    RAISE EXCEPTION 'Cannot unassign after a payment row exists';
  END IF;

  IF v_row.work_submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot unassign after work has been submitted';
  END IF;

  IF to_regclass('public.work_submissions') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.work_submissions ws WHERE ws.request_id = p_request_id
     ) THEN
    RAISE EXCEPTION 'Cannot unassign after work has been submitted';
  END IF;

  SELECT o.id, o.provider_id
  INTO v_accepted_offer_id, v_provider_id
  FROM public.offers o
  WHERE o.request_id = p_request_id AND o.status = 'accepted'
  LIMIT 1;

  IF v_accepted_offer_id IS NULL THEN
    RAISE EXCEPTION 'No selected provider offer found';
  END IF;

  -- Selected offer returns to pending (still in history; customer may re-select).
  UPDATE public.offers
  SET status = 'pending', updated_at = NOW()
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

  -- Conversations intentionally kept intact (offer_id links remain).

  RETURN json_build_object(
    'request_id', p_request_id,
    'status', 'open',
    'previous_accepted_offer_id', v_accepted_offer_id,
    'previous_provider_id', v_provider_id,
    'restored_pending_offers', v_restored_pending + 1,
    'chats_preserved', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unassign_selected_provider(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unassign_selected_provider(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.unassign_selected_provider(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unassign_selected_provider(UUID) TO service_role;

COMMENT ON FUNCTION public.unassign_selected_provider(UUID) IS
  'Customer unassigns selected provider before payment/work. Reopens request to open; preserves chats.';
