-- 070: Admin-safe mark request as is_test + prepare known human E2E order.
-- Additive. Does not change status / offers / payments / Stripe columns.
-- Also hardens set_request_is_test: service_role only (API enforces allowlist).

-- ---------------------------------------------------------------------------
-- Harden set_request_is_test: allowlist is enforced in Next.js API; DB no longer
-- lets any authenticated owner flip is_test via PostgREST (would block Stripe
-- for themselves). service_role may mark after API ownership + allowlist checks.
-- ---------------------------------------------------------------------------
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
  v_jwt_role TEXT := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('role', true), '')
  );
  v_is_service BOOLEAN := (v_jwt_role = 'service_role');
  v_row public.requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_is_test IS NOT TRUE THEN
    RAISE EXCEPTION 'Clearing is_test is not allowed';
  END IF;

  SELECT * INTO v_row FROM public.requests WHERE id = p_request_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  -- JWT user path (legacy / admin): must own or be platform admin.
  IF v_uid IS NOT NULL THEN
    IF v_row.customer_id <> v_uid AND NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
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

  IF EXISTS (SELECT 1 FROM public.payments p WHERE p.request_id = p_request_id) THEN
    RAISE EXCEPTION 'Orders with an existing payment row cannot be marked as test';
  END IF;

  UPDATE public.requests
  SET is_test = true, updated_at = NOW()
  WHERE id = p_request_id;

  RETURN json_build_object('request_id', p_request_id, 'is_test', true, 'already', false);
END;
$$;

REVOKE ALL ON FUNCTION public.set_request_is_test(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_request_is_test(UUID, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.set_request_is_test(UUID, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_request_is_test(UUID, BOOLEAN) TO service_role;

-- Platform-admin RPC: mark one unpaid open/in_progress order as is_test.
CREATE OR REPLACE FUNCTION public.admin_mark_request_is_test(
  p_request_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.requests%ROWTYPE;
  v_email TEXT;
  v_payment_exists BOOLEAN := false;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'request_id required';
  END IF;

  SELECT * INTO v_row FROM public.requests WHERE id = p_request_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_row.customer_id;

  IF EXISTS (SELECT 1 FROM public.payments p WHERE p.request_id = p_request_id) THEN
    v_payment_exists := true;
  END IF;

  IF v_row.is_test IS TRUE THEN
    RETURN json_build_object(
      'request_id', v_row.id,
      'title', v_row.title,
      'is_test', true,
      'order_payment_status', COALESCE(v_row.order_payment_status, 'unpaid'),
      'payment_exists', v_payment_exists,
      'already', true
    );
  END IF;

  IF v_row.status NOT IN ('open', 'in_progress') THEN
    RAISE EXCEPTION 'Only open or in-progress unpaid orders can be marked as test';
  END IF;

  IF COALESCE(v_row.order_payment_status, 'unpaid') NOT IN ('unpaid', 'payment_pending') THEN
    RAISE EXCEPTION 'Paid or completed payment status cannot be marked as test';
  END IF;

  IF v_payment_exists THEN
    RAISE EXCEPTION 'Orders with an existing payment row cannot be marked as test';
  END IF;

  IF v_row.payment_provider_name IS NOT NULL
     AND btrim(v_row.payment_provider_name) <> ''
     AND v_row.payment_provider_name <> 'look_test' THEN
    RAISE EXCEPTION 'Orders with an external payment provider cannot be marked as test';
  END IF;

  IF v_row.stripe_checkout_session_id IS NOT NULL
     AND btrim(v_row.stripe_checkout_session_id) <> '' THEN
    RAISE EXCEPTION 'Orders with a Stripe checkout session cannot be marked as test';
  END IF;

  UPDATE public.requests
  SET is_test = true, updated_at = NOW()
  WHERE id = p_request_id;

  RETURN json_build_object(
    'request_id', p_request_id,
    'title', v_row.title,
    'is_test', true,
    'order_payment_status', COALESCE(v_row.order_payment_status, 'unpaid'),
    'payment_exists', false,
    'customer_email', v_email,
    'already', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_request_is_test(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_mark_request_is_test(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.admin_mark_request_is_test(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_request_is_test(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_request_is_test(UUID) TO service_role;

-- One-shot: prepare Alexey human E2E order (idempotent, fully gated).
-- Same safety predicates as admin_mark_request_is_test; no status/payment changes.
UPDATE public.requests r
SET
  is_test = true,
  updated_at = NOW()
FROM auth.users u
WHERE r.id = '559c373f-03e1-4d6f-b941-45d7cdd0ee58'::uuid
  AND r.customer_id = u.id
  AND lower(u.email) = lower('hostel343@gmail.com')
  AND r.title = 'Ремонт комнат'
  AND r.is_test IS NOT TRUE
  AND r.status IN ('open', 'in_progress')
  AND COALESCE(r.order_payment_status, 'unpaid') IN ('unpaid', 'payment_pending')
  AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.request_id = r.id)
  AND (
    r.payment_provider_name IS NULL
    OR btrim(r.payment_provider_name) = ''
    OR r.payment_provider_name = 'look_test'
  )
  AND (
    r.stripe_checkout_session_id IS NULL
    OR btrim(r.stripe_checkout_session_id) = ''
  );
