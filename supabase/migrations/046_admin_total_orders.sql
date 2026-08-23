-- Add total platform orders count to admin user stats.
-- Matches /admin/orders tab=all: non-trashed requests (includes archived).

CREATE OR REPLACE FUNCTION public.get_admin_user_stats()
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
  v_online BIGINT := 0;
  v_customers_online BIGINT := 0;
  v_providers_online BIGINT := 0;
  v_unique_visitors BIGINT := 0;
  v_total_visits BIGINT := 0;
  v_visits_today BIGINT := 0;
  v_unique_visitors_today BIGINT := 0;
  v_admin_visits_total BIGINT := 0;
  v_admin_visits_today BIGINT := 0;
  v_admin_visits_by_user JSON := '[]'::json;
  v_day_start TIMESTAMPTZ :=
    (date_trunc('day', NOW() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow');
  v_day_timezone TEXT := 'Europe/Moscow';
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

  -- Distinct registered accounts (customer / provider / both), exclude platform admins.
  SELECT COUNT(*) INTO v_registered_users
  FROM public.profiles
  WHERE is_platform_admin = false;

  -- Total orders visible on admin orders "all" tab (exclude soft-trashed).
  SELECT COUNT(*) INTO v_total_orders
  FROM public.requests
  WHERE trashed_at IS NULL;

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

  SELECT COUNT(*) INTO v_admin_visits_total
  FROM public.user_sessions us
  JOIN public.profiles pr ON pr.id = us.user_id
  WHERE pr.is_platform_admin = true;

  SELECT COUNT(*) INTO v_admin_visits_today
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
    'registered_customers', v_customers,
    'registered_providers', v_providers,
    'registered_users', v_registered_users,
    'total_orders', v_total_orders,
    'users_online', v_online,
    'customers_online', v_customers_online,
    'providers_online', v_providers_online,
    'unique_visitors', v_unique_visitors,
    'total_visits', v_total_visits,
    'visits_today', v_visits_today,
    'unique_visitors_today', v_unique_visitors_today,
    'admin_visits_total', v_admin_visits_total,
    'admin_visits_today', v_admin_visits_today,
    'admin_visits_by_user', v_admin_visits_by_user,
    'online_window_seconds', 90,
    'admins_counted_in_online', false,
    'admins_counted_in_user_visits', false,
    'day_start', v_day_start,
    'day_timezone', v_day_timezone,
    'admin_session_source', 'user_sessions'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_user_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_user_stats() TO authenticated, service_role;
