-- Persist geo source on sessions; keep XX→known upgrade; never overwrite known→XX.

ALTER TABLE public.app_sessions
  ADD COLUMN IF NOT EXISTS geo_source TEXT;

COMMENT ON COLUMN public.app_sessions.geo_source IS
  'vercel | cloudflare | platform | ip-fallback | unknown';

CREATE OR REPLACE FUNCTION public.record_app_heartbeat(
  p_visitor_id TEXT,
  p_session_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_country_code TEXT DEFAULT NULL,
  p_country_name TEXT DEFAULT NULL,
  p_geo_source TEXT DEFAULT NULL
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
  v_geo_source TEXT := lower(trim(COALESCE(p_geo_source, '')));
BEGIN
  IF v_visitor_id IS NULL
     OR char_length(v_visitor_id) < 8
     OR char_length(v_visitor_id) > 128
     OR v_visitor_id !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'Invalid visitor id';
  END IF;

  IF v_geo_source IS NULL OR v_geo_source = '' OR char_length(v_geo_source) > 32 THEN
    v_geo_source := CASE WHEN v_country_code = 'XX' THEN 'unknown' ELSE 'platform' END;
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
      -- known country always wins over XX; never overwrite known with XX
      country_code = CASE
        WHEN v_country_code <> 'XX'
          AND (country_code IS NULL OR country_code = 'XX')
        THEN v_country_code
        ELSE country_code
      END,
      country_name = CASE
        WHEN v_country_code <> 'XX'
          AND (country_code IS NULL OR country_code = 'XX')
        THEN v_country_name
        ELSE country_name
      END,
      geo_source = CASE
        WHEN v_country_code <> 'XX'
          AND (country_code IS NULL OR country_code = 'XX')
        THEN v_geo_source
        ELSE geo_source
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
          WHEN v_country_code <> 'XX'
            AND (country_code IS NULL OR country_code = 'XX')
          THEN v_country_code
          ELSE country_code
        END,
        country_name = CASE
          WHEN v_country_code <> 'XX'
            AND (country_code IS NULL OR country_code = 'XX')
          THEN v_country_name
          ELSE country_name
        END,
        geo_source = CASE
          WHEN v_country_code <> 'XX'
            AND (country_code IS NULL OR country_code = 'XX')
          THEN v_geo_source
          ELSE geo_source
        END
      WHERE id = v_session_id;
    END IF;
  END IF;

  IF v_session_id IS NULL THEN
    INSERT INTO public.app_sessions (
      visitor_id, user_id, started_at, last_activity_at,
      country_code, country_name, geo_source
    )
    VALUES (
      v_visitor_id, v_user_id, NOW(), NOW(),
      v_country_code, v_country_name, v_geo_source
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

-- Prefer 6-arg signature; drop older 5-arg overload if present.
DROP FUNCTION IF EXISTS public.record_app_heartbeat(TEXT, UUID, UUID, TEXT, TEXT);

REVOKE ALL ON FUNCTION public.record_app_heartbeat(TEXT, UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_app_heartbeat(TEXT, UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_app_heartbeat(TEXT, UUID, UUID, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.record_app_heartbeat(TEXT, UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
