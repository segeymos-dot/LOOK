-- Country analytics marketing cutover: exclude pre-cutover sessions from
-- default marketing view. Does NOT delete or rewrite historical rows.

CREATE OR REPLACE FUNCTION public.get_admin_visitors_by_country(
  p_range TEXT DEFAULT '30d',
  p_cutover_at TIMESTAMPTZ DEFAULT NULL,
  p_include_historical BOOLEAN DEFAULT false
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ;
  v_range_since TIMESTAMPTZ;
  v_total_visits BIGINT := 0;
  v_unique BIGINT := 0;
  v_countries JSON := '[]'::JSON;
  v_human_visits BIGINT := 0;
  v_technical_visits BIGINT := 0;
  v_bot_visits BIGINT := 0;
  v_cutover TIMESTAMPTZ := p_cutover_at;
  v_include_historical BOOLEAN := COALESCE(p_include_historical, false);
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_range_since := CASE lower(trim(COALESCE(p_range, '30d')))
    WHEN 'today' THEN date_trunc('day', NOW() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow'
    WHEN '7d' THEN NOW() - INTERVAL '7 days'
    WHEN '30d' THEN NOW() - INTERVAL '30 days'
    WHEN 'all' THEN NULL
    ELSE NOW() - INTERVAL '30 days'
  END;

  -- Default marketing view: never look before cutover ("all" = all_since_cutover).
  IF v_include_historical THEN
    v_since := v_range_since;
  ELSIF v_cutover IS NULL THEN
    v_since := v_range_since;
  ELSIF v_range_since IS NULL THEN
    v_since := v_cutover;
  ELSE
    v_since := GREATEST(v_range_since, v_cutover);
  END IF;

  SELECT
    COUNT(*) FILTER (
      WHERE public.normalize_traffic_type(s.traffic_type) = 'human'
    )::BIGINT,
    COUNT(*) FILTER (
      WHERE public.normalize_traffic_type(s.traffic_type) IN (
        'bot', 'automation', 'monitor', 'technical_test'
      )
    )::BIGINT,
    COUNT(*) FILTER (
      WHERE public.normalize_traffic_type(s.traffic_type) = 'bot'
    )::BIGINT
  INTO v_human_visits, v_technical_visits, v_bot_visits
  FROM public.app_sessions s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  LEFT JOIN auth.users u ON u.id = s.user_id
  WHERE (v_since IS NULL OR s.started_at >= v_since)
    AND COALESCE(p.is_platform_admin, false) = false
    AND COALESCE(u.email, '') NOT ILIKE '%@test.look';

  WITH eligible AS (
    SELECT
      s.id,
      s.visitor_id,
      s.user_id,
      public.normalize_country_code(s.country_code) AS country_code,
      COALESCE(NULLIF(trim(s.country_name), ''), 'Unknown') AS country_name,
      COALESCE(s.user_id::text, s.visitor_id) AS identity
    FROM public.app_sessions s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN auth.users u ON u.id = s.user_id
    WHERE (v_since IS NULL OR s.started_at >= v_since)
      AND COALESCE(p.is_platform_admin, false) = false
      AND COALESCE(u.email, '') NOT ILIKE '%@test.look'
      AND public.normalize_traffic_type(s.traffic_type) IN ('human', 'unknown')
  ),
  totals AS (
    SELECT
      COUNT(*)::BIGINT AS total_visits,
      COUNT(DISTINCT identity)::BIGINT AS unique_visitors
    FROM eligible
  ),
  by_country AS (
    SELECT
      e.country_code,
      MAX(e.country_name) AS country_name,
      COUNT(*)::BIGINT AS visits,
      COUNT(DISTINCT e.identity)::BIGINT AS unique_visitors,
      COUNT(DISTINCT e.user_id) FILTER (WHERE e.user_id IS NOT NULL)::BIGINT AS registered_users,
      COUNT(DISTINCT e.visitor_id) FILTER (WHERE e.user_id IS NULL)::BIGINT AS guests
    FROM eligible e
    GROUP BY e.country_code
  )
  SELECT
    t.total_visits,
    t.unique_visitors,
    COALESCE(
      (
        SELECT json_agg(row_to_json(x) ORDER BY x.unique_visitors DESC, x.visits DESC)
        FROM (
          SELECT
            c.country_code,
            c.country_name,
            c.visits,
            c.unique_visitors,
            c.registered_users,
            c.guests,
            CASE
              WHEN t.unique_visitors > 0
              THEN round((c.unique_visitors::numeric * 100.0) / t.unique_visitors::numeric, 1)
              ELSE 0
            END AS percentage
          FROM by_country c
        ) x
      ),
      '[]'::JSON
    )
  INTO v_total_visits, v_unique, v_countries
  FROM totals t;

  RETURN json_build_object(
    'total_visits', COALESCE(v_total_visits, 0),
    'unique_visitors', COALESCE(v_unique, 0),
    'countries_count', COALESCE(json_array_length(v_countries), 0),
    'range', lower(trim(COALESCE(p_range, '30d'))),
    'countries', COALESCE(v_countries, '[]'::JSON),
    'percentage_of', 'unique_visitors',
    'human_visits', COALESCE(v_human_visits, 0),
    'technical_visits', COALESCE(v_technical_visits, 0),
    'bot_visits', COALESCE(v_bot_visits, 0),
    'cutover_at', CASE WHEN v_cutover IS NULL THEN NULL ELSE to_char(v_cutover AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
    'include_historical', v_include_historical,
    'effective_since', CASE WHEN v_since IS NULL THEN NULL ELSE to_char(v_since AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END
  );
END;
$$;

-- Replace legacy 1-arg overload with a thin wrapper (no silent pre-cutover leak).
DROP FUNCTION IF EXISTS public.get_admin_visitors_by_country(TEXT);

CREATE OR REPLACE FUNCTION public.get_admin_visitors_by_country(
  p_range TEXT DEFAULT '30d'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Wrapper without cutover for backwards compatibility; app uses 3-arg form.
  RETURN public.get_admin_visitors_by_country(p_range, NULL, true);
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_visitors_by_country(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_visitors_by_country(TEXT, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_visitors_by_country(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_visitors_by_country(TEXT, TIMESTAMPTZ, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.get_admin_visitors_by_country(TEXT, TIMESTAMPTZ, BOOLEAN) IS
  'Platform admin country analytics since cutover by default; p_include_historical=true for audit of pre-cutover rows.';