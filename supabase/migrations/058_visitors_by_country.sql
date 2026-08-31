-- Country analytics on existing app_sessions (canonical visit model).
-- Country from server/edge geo only — never GPS / client IP in browser.

ALTER TABLE public.app_sessions
  ADD COLUMN IF NOT EXISTS country_code TEXT;

ALTER TABLE public.app_sessions
  ADD COLUMN IF NOT EXISTS country_name TEXT;

COMMENT ON COLUMN public.app_sessions.country_code IS
  'ISO-3166-1 alpha-2 from edge/platform geo (e.g. Vercel). XX = unknown.';
COMMENT ON COLUMN public.app_sessions.country_name IS
  'Canonical English country name resolved server-side at session create.';

-- Normalize existing nulls for analytics grouping.
UPDATE public.app_sessions
SET country_code = 'XX',
    country_name = COALESCE(country_name, 'Unknown')
WHERE country_code IS NULL;

ALTER TABLE public.app_sessions
  ALTER COLUMN country_code SET DEFAULT 'XX';

CREATE INDEX IF NOT EXISTS idx_app_sessions_country_started
  ON public.app_sessions (country_code, started_at DESC);

CREATE OR REPLACE FUNCTION public.normalize_country_code(p_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v TEXT := upper(trim(COALESCE(p_code, '')));
BEGIN
  IF v ~ '^[A-Z]{2}$' THEN
    RETURN v;
  END IF;
  RETURN 'XX';
END;
$$;

CREATE OR REPLACE FUNCTION public.record_app_heartbeat(
  p_visitor_id TEXT,
  p_session_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_country_code TEXT DEFAULT NULL,
  p_country_name TEXT DEFAULT NULL
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
  v_country_code TEXT := public.normalize_country_code(p_country_code);
  v_country_name TEXT := NULLIF(trim(COALESCE(p_country_name, '')), '');
BEGIN
  IF v_visitor_id IS NULL
     OR char_length(v_visitor_id) < 8
     OR char_length(v_visitor_id) > 128
     OR v_visitor_id !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'Invalid visitor id';
  END IF;

  IF v_country_name IS NULL THEN
    v_country_name := CASE WHEN v_country_code = 'XX' THEN 'Unknown' ELSE v_country_code END;
  END IF;
  IF char_length(v_country_name) > 80 THEN
    v_country_name := left(v_country_name, 80);
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
      ended_at = NULL,
      country_code = CASE
        WHEN country_code IS NULL OR country_code = 'XX' THEN v_country_code
        ELSE country_code
      END,
      country_name = CASE
        WHEN country_code IS NULL OR country_code = 'XX' THEN v_country_name
        ELSE country_name
      END
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
        user_id = COALESCE(v_user_id, user_id),
        country_code = CASE
          WHEN country_code IS NULL OR country_code = 'XX' THEN v_country_code
          ELSE country_code
        END,
        country_name = CASE
          WHEN country_code IS NULL OR country_code = 'XX' THEN v_country_name
          ELSE country_name
        END
      WHERE id = v_session_id;
    END IF;
  END IF;

  IF v_session_id IS NULL THEN
    INSERT INTO public.app_sessions (
      visitor_id, user_id, started_at, last_activity_at, country_code, country_name
    )
    VALUES (
      v_visitor_id, v_user_id, NOW(), NOW(), v_country_code, v_country_name
    )
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

REVOKE ALL ON FUNCTION public.record_app_heartbeat(TEXT, UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_app_heartbeat(TEXT, UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_app_heartbeat(TEXT, UUID, UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.record_app_heartbeat(TEXT, UUID, UUID, TEXT, TEXT) TO service_role;

-- Keep older 3-arg overload working via default args on the new signature.
-- Drop legacy exact 3-arg if it conflicts after replace (Postgres may keep both).
DROP FUNCTION IF EXISTS public.record_app_heartbeat(TEXT, UUID, UUID);

-- Country traffic analytics for platform admin (excludes admins + @test.look).
CREATE OR REPLACE FUNCTION public.get_admin_visitors_by_country(
  p_range TEXT DEFAULT '30d'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ;
  v_total_visits BIGINT := 0;
  v_unique BIGINT := 0;
  v_countries JSON := '[]'::JSON;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_since := CASE lower(trim(COALESCE(p_range, '30d')))
    WHEN 'today' THEN date_trunc('day', NOW() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow'
    WHEN '7d' THEN NOW() - INTERVAL '7 days'
    WHEN '30d' THEN NOW() - INTERVAL '30 days'
    WHEN 'all' THEN NULL
    ELSE NOW() - INTERVAL '30 days'
  END;

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
    'countries', COALESCE(v_countries, '[]'::JSON)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_visitors_by_country(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_visitors_by_country(TEXT) TO authenticated;

COMMENT ON FUNCTION public.get_admin_visitors_by_country(TEXT) IS
  'Platform admin: visits/unique visitors grouped by ISO country (admins and @test.look excluded).';
