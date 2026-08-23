-- Customer online + role/order analytics for admin stats
-- Extends 029/030 presence and stats RPCs.

ALTER TABLE public.app_presence
  ADD COLUMN IF NOT EXISTS is_customer BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_app_presence_customer_online
  ON public.app_presence (last_heartbeat_at DESC)
  WHERE is_customer = true AND user_id IS NOT NULL;

-- Helpful indexes for role activity windows
CREATE INDEX IF NOT EXISTS idx_app_sessions_user_started
  ON public.app_sessions (user_id, started_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_app_visitors_user_last_seen
  ON public.app_visitors (user_id, last_seen_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_requests_customer_created
  ON public.requests (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_offers_provider_created
  ON public.offers (provider_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.record_app_heartbeat(
  p_visitor_id TEXT,
  p_session_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visitor_id TEXT := trim(p_visitor_id);
  v_session_id UUID := p_session_id;
  v_user_id UUID;
  v_is_provider BOOLEAN := false;
  v_is_customer BOOLEAN := false;
  v_new_session BOOLEAN := false;
  v_presence_key TEXT;
  v_existing_user_visitor TEXT;
  v_role public.user_role;
  v_is_admin BOOLEAN := false;
BEGIN
  IF v_visitor_id IS NULL
     OR char_length(v_visitor_id) < 8
     OR char_length(v_visitor_id) > 128
     OR v_visitor_id !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'Invalid visitor id';
  END IF;

  v_user_id := auth.uid();

  IF v_user_id IS NOT NULL THEN
    SELECT role, is_platform_admin
    INTO v_role, v_is_admin
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_role IS NULL THEN
      v_user_id := NULL;
      v_is_admin := false;
    ELSIF NOT v_is_admin THEN
      v_is_provider := (v_role = 'provider' OR v_role = 'both');
      v_is_customer := (v_role = 'customer' OR v_role = 'both');
    END IF;
  END IF;

  IF v_user_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

    SELECT visitor_id INTO v_existing_user_visitor
    FROM public.app_visitors
    WHERE user_id = v_user_id
      AND visitor_id <> v_visitor_id
    ORDER BY first_seen_at ASC
    LIMIT 1;

    IF v_existing_user_visitor IS NOT NULL THEN
      UPDATE public.app_sessions
      SET visitor_id = v_existing_user_visitor,
          user_id = COALESCE(user_id, v_user_id)
      WHERE visitor_id = v_visitor_id;

      DELETE FROM public.app_presence WHERE visitor_id = v_visitor_id;
      DELETE FROM public.app_visitors WHERE visitor_id = v_visitor_id;
      v_visitor_id := v_existing_user_visitor;
    END IF;
  END IF;

  INSERT INTO public.app_visitors (visitor_id, user_id, first_seen_at, last_seen_at)
  VALUES (v_visitor_id, v_user_id, NOW(), NOW())
  ON CONFLICT (visitor_id) DO UPDATE
  SET
    last_seen_at = NOW(),
    user_id = COALESCE(EXCLUDED.user_id, public.app_visitors.user_id);

  PERFORM pg_advisory_xact_lock(hashtextextended('look_session:' || v_visitor_id, 0));

  IF v_session_id IS NOT NULL THEN
    UPDATE public.app_sessions
    SET
      last_activity_at = NOW(),
      user_id = COALESCE(v_user_id, user_id),
      ended_at = NULL
    WHERE id = v_session_id
      AND visitor_id = v_visitor_id
      AND last_activity_at > NOW() - INTERVAL '30 minutes';

    IF NOT FOUND THEN
      v_session_id := NULL;
    END IF;
  END IF;

  IF v_session_id IS NULL THEN
    SELECT id INTO v_session_id
    FROM public.app_sessions
    WHERE visitor_id = v_visitor_id
      AND ended_at IS NULL
      AND last_activity_at > NOW() - INTERVAL '30 minutes'
    ORDER BY last_activity_at DESC
    LIMIT 1;

    IF v_session_id IS NOT NULL THEN
      UPDATE public.app_sessions
      SET
        last_activity_at = NOW(),
        user_id = COALESCE(v_user_id, user_id)
      WHERE id = v_session_id;
    END IF;
  END IF;

  IF v_session_id IS NULL THEN
    INSERT INTO public.app_sessions (visitor_id, user_id, started_at, last_activity_at)
    VALUES (v_visitor_id, v_user_id, NOW(), NOW())
    RETURNING id INTO v_session_id;
    v_new_session := true;
  END IF;

  v_presence_key := CASE
    WHEN v_user_id IS NOT NULL THEN 'user:' || v_user_id::text
    ELSE 'anon:' || v_visitor_id
  END;

  INSERT INTO public.app_presence (
    presence_key, visitor_id, user_id, is_provider, is_customer, last_heartbeat_at
  )
  VALUES (
    v_presence_key, v_visitor_id, v_user_id, v_is_provider, v_is_customer, NOW()
  )
  ON CONFLICT (presence_key) DO UPDATE
  SET
    visitor_id = EXCLUDED.visitor_id,
    user_id = EXCLUDED.user_id,
    is_provider = EXCLUDED.is_provider,
    is_customer = EXCLUDED.is_customer,
    last_heartbeat_at = NOW();

  IF v_user_id IS NOT NULL THEN
    DELETE FROM public.app_presence
    WHERE presence_key = 'anon:' || v_visitor_id
      AND presence_key <> v_presence_key;
  END IF;

  PERFORM public.purge_stale_app_presence(INTERVAL '10 minutes');

  RETURN json_build_object(
    'ok', true,
    'visitor_id', v_visitor_id,
    'session_id', v_session_id,
    'new_session', v_new_session
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_user_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customers BIGINT := 0;
  v_providers BIGINT := 0;
  v_online BIGINT := 0;
  v_customers_online BIGINT := 0;
  v_providers_online BIGINT := 0;
  v_unique_visitors BIGINT := 0;
  v_total_visits BIGINT := 0;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.purge_stale_app_presence(INTERVAL '10 minutes');

  SELECT COUNT(*) INTO v_customers
  FROM public.profiles
  WHERE is_platform_admin = false
    AND role IN ('customer', 'both');

  SELECT COUNT(*) INTO v_providers
  FROM public.profiles
  WHERE is_platform_admin = false
    AND role IN ('provider', 'both');

  SELECT COUNT(*) INTO v_online
  FROM public.app_presence p
  LEFT JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.last_heartbeat_at > NOW() - INTERVAL '90 seconds'
    AND (p.user_id IS NULL OR COALESCE(pr.is_platform_admin, false) = false);

  SELECT COUNT(*) INTO v_customers_online
  FROM public.app_presence p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.last_heartbeat_at > NOW() - INTERVAL '90 seconds'
    AND p.is_customer = true
    AND p.user_id IS NOT NULL
    AND pr.is_platform_admin = false;

  SELECT COUNT(*) INTO v_providers_online
  FROM public.app_presence p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.last_heartbeat_at > NOW() - INTERVAL '90 seconds'
    AND p.is_provider = true
    AND p.user_id IS NOT NULL
    AND pr.is_platform_admin = false;

  SELECT COUNT(*) INTO v_unique_visitors
  FROM (
    SELECT DISTINCT COALESCE(user_id::text, visitor_id) AS identity
    FROM public.app_visitors
  ) identities;

  SELECT COUNT(*) INTO v_total_visits
  FROM public.app_sessions;

  RETURN json_build_object(
    'registered_customers', v_customers,
    'registered_providers', v_providers,
    'users_online', v_online,
    'customers_online', v_customers_online,
    'providers_online', v_providers_online,
    'unique_visitors', v_unique_visitors,
    'total_visits', v_total_visits,
    'online_window_seconds', 90,
    'admins_counted_in_online', false
  );
END;
$$;

-- Role helpers: customer = customer|both, provider = provider|both, exclude admins.
CREATE OR REPLACE FUNCTION public.get_admin_customer_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registered BIGINT := 0;
  v_online BIGINT := 0;
  v_active_today BIGINT := 0;
  v_active_7d BIGINT := 0;
  v_active_30d BIGINT := 0;
  v_sessions_today BIGINT := 0;
  v_sessions_7d BIGINT := 0;
  v_sessions_30d BIGINT := 0;
  v_new_today BIGINT := 0;
  v_new_7d BIGINT := 0;
  v_new_30d BIGINT := 0;
  v_orders_total BIGINT := 0;
  v_orders_today BIGINT := 0;
  v_orders_7d BIGINT := 0;
  v_orders_30d BIGINT := 0;
  v_with_orders BIGINT := 0;
  v_without_orders BIGINT := 0;
  v_avg_orders NUMERIC := 0;
  v_open BIGINT := 0;
  v_in_progress BIGINT := 0;
  v_completed BIGINT := 0;
  v_cancelled BIGINT := 0;
  v_without_offers BIGINT := 0;
  v_with_offers BIGINT := 0;
  v_avg_to_first_offer NUMERIC := NULL;
  v_avg_to_accept NUMERIC := NULL;
  v_with_provider BIGINT := 0;
  v_confirmed BIGINT := 0;
  v_day_start TIMESTAMPTZ := date_trunc('day', NOW());
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COUNT(*) INTO v_registered
  FROM public.profiles
  WHERE is_platform_admin = false AND role IN ('customer', 'both');

  SELECT COUNT(*) INTO v_online
  FROM public.app_presence p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.last_heartbeat_at > NOW() - INTERVAL '90 seconds'
    AND p.is_customer = true
    AND pr.is_platform_admin = false;

  SELECT COUNT(DISTINCT s.user_id) INTO v_active_today
  FROM public.app_sessions s
  JOIN public.profiles pr ON pr.id = s.user_id
  WHERE pr.is_platform_admin = false
    AND pr.role IN ('customer', 'both')
    AND s.last_activity_at >= v_day_start;

  SELECT COUNT(DISTINCT s.user_id) INTO v_active_7d
  FROM public.app_sessions s
  JOIN public.profiles pr ON pr.id = s.user_id
  WHERE pr.is_platform_admin = false
    AND pr.role IN ('customer', 'both')
    AND s.last_activity_at >= NOW() - INTERVAL '7 days';

  SELECT COUNT(DISTINCT s.user_id) INTO v_active_30d
  FROM public.app_sessions s
  JOIN public.profiles pr ON pr.id = s.user_id
  WHERE pr.is_platform_admin = false
    AND pr.role IN ('customer', 'both')
    AND s.last_activity_at >= NOW() - INTERVAL '30 days';

  SELECT COUNT(*) INTO v_sessions_today
  FROM public.app_sessions s
  JOIN public.profiles pr ON pr.id = s.user_id
  WHERE pr.is_platform_admin = false
    AND pr.role IN ('customer', 'both')
    AND s.started_at >= v_day_start;

  SELECT COUNT(*) INTO v_sessions_7d
  FROM public.app_sessions s
  JOIN public.profiles pr ON pr.id = s.user_id
  WHERE pr.is_platform_admin = false
    AND pr.role IN ('customer', 'both')
    AND s.started_at >= NOW() - INTERVAL '7 days';

  SELECT COUNT(*) INTO v_sessions_30d
  FROM public.app_sessions s
  JOIN public.profiles pr ON pr.id = s.user_id
  WHERE pr.is_platform_admin = false
    AND pr.role IN ('customer', 'both')
    AND s.started_at >= NOW() - INTERVAL '30 days';

  SELECT COUNT(*) INTO v_new_today
  FROM public.profiles
  WHERE is_platform_admin = false
    AND role IN ('customer', 'both')
    AND created_at >= v_day_start;

  SELECT COUNT(*) INTO v_new_7d
  FROM public.profiles
  WHERE is_platform_admin = false
    AND role IN ('customer', 'both')
    AND created_at >= NOW() - INTERVAL '7 days';

  SELECT COUNT(*) INTO v_new_30d
  FROM public.profiles
  WHERE is_platform_admin = false
    AND role IN ('customer', 'both')
    AND created_at >= NOW() - INTERVAL '30 days';

  SELECT COUNT(*) INTO v_orders_total FROM public.requests;
  SELECT COUNT(*) INTO v_orders_today FROM public.requests WHERE created_at >= v_day_start;
  SELECT COUNT(*) INTO v_orders_7d FROM public.requests WHERE created_at >= NOW() - INTERVAL '7 days';
  SELECT COUNT(*) INTO v_orders_30d FROM public.requests WHERE created_at >= NOW() - INTERVAL '30 days';

  SELECT COUNT(DISTINCT customer_id) INTO v_with_orders FROM public.requests;
  v_without_orders := GREATEST(v_registered - v_with_orders, 0);

  IF v_with_orders > 0 THEN
    SELECT ROUND((COUNT(*))::numeric / v_with_orders, 2) INTO v_avg_orders
    FROM public.requests;
  END IF;

  SELECT COUNT(*) INTO v_open FROM public.requests WHERE status = 'open';
  SELECT COUNT(*) INTO v_in_progress
  FROM public.requests
  WHERE status IN ('in_progress', 'pending_review');
  SELECT COUNT(*) INTO v_completed FROM public.requests WHERE status = 'completed';
  SELECT COUNT(*) INTO v_cancelled FROM public.requests WHERE status = 'cancelled';

  SELECT COUNT(*) INTO v_without_offers
  FROM public.requests r
  WHERE NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.request_id = r.id);

  SELECT COUNT(*) INTO v_with_offers
  FROM public.requests r
  WHERE EXISTS (SELECT 1 FROM public.offers o WHERE o.request_id = r.id);

  SELECT ROUND(AVG(EXTRACT(EPOCH FROM (first_offer - r.created_at)) / 3600.0)::numeric, 2)
  INTO v_avg_to_first_offer
  FROM public.requests r
  JOIN LATERAL (
    SELECT MIN(o.created_at) AS first_offer
    FROM public.offers o
    WHERE o.request_id = r.id
  ) fo ON fo.first_offer IS NOT NULL;

  SELECT ROUND(AVG(EXTRACT(EPOCH FROM (accepted_at - r.created_at)) / 3600.0)::numeric, 2)
  INTO v_avg_to_accept
  FROM public.requests r
  JOIN LATERAL (
    SELECT MIN(o.updated_at) AS accepted_at
    FROM public.offers o
    WHERE o.request_id = r.id AND o.status = 'accepted'
  ) ao ON ao.accepted_at IS NOT NULL;

  SELECT COUNT(DISTINCT o.request_id) INTO v_with_provider
  FROM public.offers o
  WHERE o.status = 'accepted';

  -- Customer-confirmed completions: request reached completed
  -- (accept_work / complete_request path).
  SELECT COUNT(*) INTO v_confirmed
  FROM public.requests
  WHERE status = 'completed';

  RETURN json_build_object(
    'registered_total', v_registered,
    'online', v_online,
    'unique_active_today', v_active_today,
    'unique_active_7d', v_active_7d,
    'unique_active_30d', v_active_30d,
    'sessions_today', v_sessions_today,
    'sessions_7d', v_sessions_7d,
    'sessions_30d', v_sessions_30d,
    'new_today', v_new_today,
    'new_7d', v_new_7d,
    'new_30d', v_new_30d,
    'orders', json_build_object(
      'total', v_orders_total,
      'today', v_orders_today,
      'd7', v_orders_7d,
      'd30', v_orders_30d,
      'customers_with_orders', v_with_orders,
      'customers_without_orders', v_without_orders,
      'avg_orders_per_active_customer', COALESCE(v_avg_orders, 0),
      'open', v_open,
      'in_progress', v_in_progress,
      'completed', v_completed,
      'cancelled', v_cancelled,
      'without_offers', v_without_offers,
      'with_offers', v_with_offers,
      'avg_hours_to_first_offer', v_avg_to_first_offer,
      'avg_hours_to_provider_selected', v_avg_to_accept,
      'with_provider_selected', v_with_provider,
      'customer_confirmed_completions', v_confirmed
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_provider_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registered BIGINT := 0;
  v_online BIGINT := 0;
  v_active_today BIGINT := 0;
  v_active_7d BIGINT := 0;
  v_active_30d BIGINT := 0;
  v_sessions_today BIGINT := 0;
  v_sessions_7d BIGINT := 0;
  v_sessions_30d BIGINT := 0;
  v_new_today BIGINT := 0;
  v_new_7d BIGINT := 0;
  v_new_30d BIGINT := 0;
  v_day_start TIMESTAMPTZ := date_trunc('day', NOW());
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COUNT(*) INTO v_registered
  FROM public.profiles
  WHERE is_platform_admin = false AND role IN ('provider', 'both');

  SELECT COUNT(*) INTO v_online
  FROM public.app_presence p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.last_heartbeat_at > NOW() - INTERVAL '90 seconds'
    AND p.is_provider = true
    AND pr.is_platform_admin = false;

  SELECT COUNT(DISTINCT s.user_id) INTO v_active_today
  FROM public.app_sessions s
  JOIN public.profiles pr ON pr.id = s.user_id
  WHERE pr.is_platform_admin = false
    AND pr.role IN ('provider', 'both')
    AND s.last_activity_at >= v_day_start;

  SELECT COUNT(DISTINCT s.user_id) INTO v_active_7d
  FROM public.app_sessions s
  JOIN public.profiles pr ON pr.id = s.user_id
  WHERE pr.is_platform_admin = false
    AND pr.role IN ('provider', 'both')
    AND s.last_activity_at >= NOW() - INTERVAL '7 days';

  SELECT COUNT(DISTINCT s.user_id) INTO v_active_30d
  FROM public.app_sessions s
  JOIN public.profiles pr ON pr.id = s.user_id
  WHERE pr.is_platform_admin = false
    AND pr.role IN ('provider', 'both')
    AND s.last_activity_at >= NOW() - INTERVAL '30 days';

  SELECT COUNT(*) INTO v_sessions_today
  FROM public.app_sessions s
  JOIN public.profiles pr ON pr.id = s.user_id
  WHERE pr.is_platform_admin = false
    AND pr.role IN ('provider', 'both')
    AND s.started_at >= v_day_start;

  SELECT COUNT(*) INTO v_sessions_7d
  FROM public.app_sessions s
  JOIN public.profiles pr ON pr.id = s.user_id
  WHERE pr.is_platform_admin = false
    AND pr.role IN ('provider', 'both')
    AND s.started_at >= NOW() - INTERVAL '7 days';

  SELECT COUNT(*) INTO v_sessions_30d
  FROM public.app_sessions s
  JOIN public.profiles pr ON pr.id = s.user_id
  WHERE pr.is_platform_admin = false
    AND pr.role IN ('provider', 'both')
    AND s.started_at >= NOW() - INTERVAL '30 days';

  SELECT COUNT(*) INTO v_new_today
  FROM public.profiles
  WHERE is_platform_admin = false
    AND role IN ('provider', 'both')
    AND created_at >= v_day_start;

  SELECT COUNT(*) INTO v_new_7d
  FROM public.profiles
  WHERE is_platform_admin = false
    AND role IN ('provider', 'both')
    AND created_at >= NOW() - INTERVAL '7 days';

  SELECT COUNT(*) INTO v_new_30d
  FROM public.profiles
  WHERE is_platform_admin = false
    AND role IN ('provider', 'both')
    AND created_at >= NOW() - INTERVAL '30 days';

  RETURN json_build_object(
    'registered_total', v_registered,
    'online', v_online,
    'unique_active_today', v_active_today,
    'unique_active_7d', v_active_7d,
    'unique_active_30d', v_active_30d,
    'sessions_today', v_sessions_today,
    'sessions_7d', v_sessions_7d,
    'sessions_30d', v_sessions_30d,
    'new_today', v_new_today,
    'new_7d', v_new_7d,
    'new_30d', v_new_30d
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_customer_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_customer_stats() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_admin_provider_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_provider_stats() TO authenticated, service_role;

-- Backfill presence role flags from profiles for current online rows.
UPDATE public.app_presence p
SET
  is_customer = CASE
    WHEN pr.is_platform_admin THEN false
    WHEN pr.role IN ('customer', 'both') THEN true
    ELSE false
  END,
  is_provider = CASE
    WHEN pr.is_platform_admin THEN false
    WHEN pr.role IN ('provider', 'both') THEN true
    ELSE false
  END
FROM public.profiles pr
WHERE pr.id = p.user_id;
