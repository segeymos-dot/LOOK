-- Unified production admin stats + soft-trash helper + request create idempotency.
-- Online presence window: 180 seconds (3 minutes).
-- Platform admins excluded from user/visit/online counters.

CREATE TABLE IF NOT EXISTS public.request_idempotency (
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (customer_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS request_idempotency_created_at_idx
  ON public.request_idempotency (created_at);

ALTER TABLE public.request_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers manage own request idempotency" ON public.request_idempotency;
CREATE POLICY "Customers manage own request idempotency"
  ON public.request_idempotency
  FOR ALL
  USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

-- ---------------------------------------------------------------------------
-- Soft-trash a request as platform admin (for cleanup of confirmed duplicates).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_soft_trash_request(p_request_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.requests%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_row
  FROM public.requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_row.trashed_at IS NOT NULL THEN
    RETURN json_build_object(
      'ok', true,
      'already_trashed', true,
      'request_id', v_row.id
    );
  END IF;

  UPDATE public.requests
  SET trashed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_request_id;

  RETURN json_build_object(
    'ok', true,
    'already_trashed', false,
    'request_id', p_request_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_soft_trash_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_soft_trash_request(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Idempotent customer request create (same key / rapid double-submit → one row).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_customer_request_idempotent(
  p_title TEXT,
  p_description TEXT,
  p_category_id UUID DEFAULT NULL,
  p_budget_min NUMERIC DEFAULT NULL,
  p_budget_max NUMERIC DEFAULT NULL,
  p_currency TEXT DEFAULT 'USD',
  p_location TEXT DEFAULT NULL,
  p_deadline TIMESTAMPTZ DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
  v_existing UUID;
  v_new UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF COALESCE(TRIM(p_title), '') = '' OR COALESCE(TRIM(p_description), '') = '' THEN
    RAISE EXCEPTION 'Title and description are required';
  END IF;

  -- Serialize concurrent creates for this customer.
  PERFORM pg_advisory_xact_lock(hashtext('create_customer_request:' || v_uid::text));

  IF v_key IS NOT NULL THEN
    SELECT ri.request_id INTO v_existing
    FROM public.request_idempotency ri
    WHERE ri.customer_id = v_uid
      AND ri.idempotency_key = v_key
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  -- Fallback: identical title within a short window (double-tap without key).
  SELECT r.id INTO v_existing
  FROM public.requests r
  WHERE r.customer_id = v_uid
    AND r.trashed_at IS NULL
    AND r.title = TRIM(p_title)
    AND r.created_at > NOW() - INTERVAL '15 seconds'
  ORDER BY r.created_at ASC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    IF v_key IS NOT NULL THEN
      INSERT INTO public.request_idempotency (customer_id, idempotency_key, request_id)
      VALUES (v_uid, v_key, v_existing)
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN v_existing;
  END IF;

  INSERT INTO public.requests (
    customer_id,
    title,
    description,
    category_id,
    budget_min,
    budget_max,
    currency,
    location,
    deadline
  ) VALUES (
    v_uid,
    TRIM(p_title),
    TRIM(p_description),
    p_category_id,
    p_budget_min,
    p_budget_max,
    COALESCE(NULLIF(TRIM(p_currency), ''), 'USD'),
    NULLIF(TRIM(COALESCE(p_location, '')), ''),
    p_deadline
  )
  RETURNING id INTO v_new;

  IF v_key IS NOT NULL THEN
    INSERT INTO public.request_idempotency (customer_id, idempotency_key, request_id)
    VALUES (v_uid, v_key, v_new)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.create_customer_request_idempotent(
  TEXT, TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_customer_request_idempotent(
  TEXT, TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, TEXT
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Canonical platform stats (single source of truth).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_platform_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customers BIGINT := 0;
  v_providers BIGINT := 0;
  v_registered_users BIGINT := 0;
  v_total_orders BIGINT := 0;
  v_completed_orders BIGINT := 0;
  v_active_orders BIGINT := 0;
  v_online BIGINT := 0;
  v_customers_online BIGINT := 0;
  v_providers_online BIGINT := 0;
  v_unique_visitors BIGINT := 0;
  v_total_visits BIGINT := 0;
  v_visits_today BIGINT := 0;
  v_unique_visitors_today BIGINT := 0;
  v_admin_sessions_total BIGINT := 0;
  v_admin_sessions_today BIGINT := 0;
  v_admin_visits_by_user JSON := '[]'::json;
  v_day_start TIMESTAMPTZ :=
    (date_trunc('day', NOW() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow');
  v_day_timezone TEXT := 'Europe/Moscow';
  v_online_window INTERVAL := INTERVAL '180 seconds';
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

  SELECT COUNT(*) INTO v_registered_users
  FROM public.profiles
  WHERE is_platform_admin = false;

  SELECT COUNT(*) INTO v_total_orders
  FROM public.requests
  WHERE trashed_at IS NULL;

  SELECT COUNT(*) INTO v_completed_orders
  FROM public.requests
  WHERE trashed_at IS NULL
    AND archived_at IS NULL
    AND status = 'completed';

  SELECT COUNT(*) INTO v_active_orders
  FROM public.requests
  WHERE trashed_at IS NULL
    AND archived_at IS NULL
    AND status IS DISTINCT FROM 'completed'
    AND status IS DISTINCT FROM 'cancelled';

  SELECT COUNT(*) INTO v_online
  FROM public.app_presence p
  LEFT JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.last_heartbeat_at > NOW() - v_online_window
    AND (p.user_id IS NULL OR COALESCE(pr.is_platform_admin, false) = false);

  SELECT COUNT(*) INTO v_customers_online
  FROM public.app_presence p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.last_heartbeat_at > NOW() - v_online_window
    AND p.is_customer = true
    AND p.user_id IS NOT NULL
    AND pr.is_platform_admin = false;

  SELECT COUNT(*) INTO v_providers_online
  FROM public.app_presence p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.last_heartbeat_at > NOW() - v_online_window
    AND p.is_provider = true
    AND p.user_id IS NOT NULL
    AND pr.is_platform_admin = false;

  SELECT COUNT(*) INTO v_unique_visitors
  FROM (
    SELECT DISTINCT COALESCE(v.user_id::text, v.visitor_id) AS identity
    FROM public.app_visitors v
    LEFT JOIN public.profiles pr ON pr.id = v.user_id
    WHERE v.user_id IS NULL
       OR COALESCE(pr.is_platform_admin, false) = false
  ) identities;

  SELECT COUNT(*) INTO v_total_visits
  FROM public.app_sessions s
  LEFT JOIN public.profiles pr ON pr.id = s.user_id
  WHERE s.user_id IS NULL
     OR COALESCE(pr.is_platform_admin, false) = false;

  SELECT COUNT(*) INTO v_visits_today
  FROM public.app_sessions s
  LEFT JOIN public.profiles pr ON pr.id = s.user_id
  WHERE s.started_at >= v_day_start
    AND (s.user_id IS NULL OR COALESCE(pr.is_platform_admin, false) = false);

  SELECT COUNT(*) INTO v_unique_visitors_today
  FROM (
    SELECT DISTINCT COALESCE(s.user_id::text, s.visitor_id) AS identity
    FROM public.app_sessions s
    LEFT JOIN public.profiles pr ON pr.id = s.user_id
    WHERE s.started_at >= v_day_start
      AND (s.user_id IS NULL OR COALESCE(pr.is_platform_admin, false) = false)
  ) today_identities;

  SELECT COUNT(*) INTO v_admin_sessions_total
  FROM public.user_sessions us
  JOIN public.profiles pr ON pr.id = us.user_id
  WHERE pr.is_platform_admin = true;

  SELECT COUNT(*) INTO v_admin_sessions_today
  FROM public.user_sessions us
  JOIN public.profiles pr ON pr.id = us.user_id
  WHERE pr.is_platform_admin = true
    AND us.created_at >= v_day_start;

  SELECT COALESCE(
    json_agg(
      json_build_object(
        'user_id', t.user_id,
        'name', t.name,
        'visits_total', t.visits_total,
        'visits_today', t.visits_today,
        'last_seen_at', t.last_seen_at
      )
      ORDER BY t.visits_total DESC, t.name ASC NULLS LAST
    ),
    '[]'::json
  )
  INTO v_admin_visits_by_user
  FROM (
    SELECT
      pr.id AS user_id,
      pr.full_name AS name,
      COUNT(us.id)::bigint AS visits_total,
      COUNT(us.id) FILTER (WHERE us.created_at >= v_day_start)::bigint AS visits_today,
      MAX(us.last_seen_at) AS last_seen_at
    FROM public.profiles pr
    LEFT JOIN public.user_sessions us ON us.user_id = pr.id
    WHERE pr.is_platform_admin = true
    GROUP BY pr.id, pr.full_name
  ) t;

  RETURN json_build_object(
    'registered_users', v_registered_users,
    'registered_customers', v_customers,
    'registered_providers', v_providers,
    'customer_online', v_customers_online,
    'provider_online', v_providers_online,
    'customers_online', v_customers_online,
    'providers_online', v_providers_online,
    'users_online', v_online,
    'total_orders', v_total_orders,
    'completed_orders', v_completed_orders,
    'active_orders', v_active_orders,
    'total_visits', v_total_visits,
    'unique_visitors', v_unique_visitors,
    'visits_today', v_visits_today,
    'unique_visitors_today', v_unique_visitors_today,
    'admin_sessions_total', v_admin_sessions_total,
    'admin_sessions_today', v_admin_sessions_today,
    'admin_visits_total', v_admin_sessions_total,
    'admin_visits_today', v_admin_sessions_today,
    'admin_visits_by_user', v_admin_visits_by_user,
    'online_window_seconds', 180,
    'admins_counted_in_online', false,
    'admins_counted_in_user_visits', false,
    'day_start', v_day_start,
    'day_timezone', v_day_timezone,
    'admin_session_source', 'user_sessions'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_platform_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_platform_stats() TO authenticated, service_role;

-- Keep legacy RPC name as a thin alias so existing callers stay consistent.
CREATE OR REPLACE FUNCTION public.get_admin_user_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.get_admin_platform_stats();
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_user_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_user_stats() TO authenticated, service_role;
