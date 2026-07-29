-- Stabilize admin user/visitor statistics (post-029 hardening)
-- Safe on clean and existing DBs: CREATE OR REPLACE + IF NOT EXISTS only.

-- Drop rows that would violate the tightened visitor_id rules (dev/test junk only).
DELETE FROM public.app_presence
WHERE visitor_id !~ '^[A-Za-z0-9_-]+$'
   OR char_length(trim(visitor_id)) < 8
   OR char_length(trim(visitor_id)) > 128;

DELETE FROM public.app_sessions
WHERE visitor_id !~ '^[A-Za-z0-9_-]+$'
   OR char_length(trim(visitor_id)) < 8
   OR char_length(trim(visitor_id)) > 128;

DELETE FROM public.app_visitors
WHERE visitor_id !~ '^[A-Za-z0-9_-]+$'
   OR char_length(trim(visitor_id)) < 8
   OR char_length(trim(visitor_id)) > 128;

-- Tighten visitor_id format/length (UUIDs and opaque client ids).
ALTER TABLE public.app_visitors
  DROP CONSTRAINT IF EXISTS app_visitors_visitor_id_len;

ALTER TABLE public.app_visitors
  ADD CONSTRAINT app_visitors_visitor_id_len
  CHECK (
    char_length(trim(visitor_id)) BETWEEN 8 AND 128
    AND trim(visitor_id) ~ '^[A-Za-z0-9_-]+$'
  );

CREATE INDEX IF NOT EXISTS idx_app_sessions_user
  ON public.app_sessions (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_app_presence_visitor
  ON public.app_presence (visitor_id);

-- Purge presence older than the online window (+ buffer). Online uses 90s;
-- rows older than 10 minutes never affect counters and only waste space.
CREATE OR REPLACE FUNCTION public.purge_stale_app_presence(
  p_older_than INTERVAL DEFAULT INTERVAL '10 minutes'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  DELETE FROM public.app_presence
  WHERE last_heartbeat_at < NOW() - p_older_than;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_stale_app_presence(INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_stale_app_presence(INTERVAL) TO service_role;

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

  -- Never trust client-supplied user ids; identity comes only from JWT.
  v_user_id := auth.uid();

  IF v_user_id IS NOT NULL THEN
    SELECT role, is_platform_admin
    INTO v_role, v_is_admin
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_role IS NULL THEN
      -- Deleted / missing profile → treat as anonymous presence.
      v_user_id := NULL;
      v_is_admin := false;
    ELSE
      v_is_provider := (v_role = 'provider' OR v_role = 'both') AND NOT v_is_admin;
    END IF;
  END IF;

  -- Serialize merge/link for a logged-in user to avoid unique(user_id) races.
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

  -- Serialize session open/reuse per visitor (idempotent under concurrent heartbeats).
  PERFORM pg_advisory_xact_lock(hashtextextended('look_session:' || v_visitor_id, 0));

  -- Continue the provided session if still active for this visitor.
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

  -- Reuse any still-open session for this visitor (multi-tab / lost session_id).
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
    presence_key, visitor_id, user_id, is_provider, last_heartbeat_at
  )
  VALUES (v_presence_key, v_visitor_id, v_user_id, v_is_provider, NOW())
  ON CONFLICT (presence_key) DO UPDATE
  SET
    visitor_id = EXCLUDED.visitor_id,
    user_id = EXCLUDED.user_id,
    is_provider = EXCLUDED.is_provider,
    last_heartbeat_at = NOW();

  IF v_user_id IS NOT NULL THEN
    DELETE FROM public.app_presence
    WHERE presence_key = 'anon:' || v_visitor_id
      AND presence_key <> v_presence_key;
  END IF;

  -- Opportunistic cleanup so stale rows never accumulate unboundedly.
  PERFORM public.purge_stale_app_presence(INTERVAL '10 minutes');

  RETURN json_build_object(
    'ok', true,
    'visitor_id', v_visitor_id,
    'session_id', v_session_id,
    'new_session', v_new_session
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.end_app_presence(
  p_visitor_id TEXT,
  p_session_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visitor_id TEXT := trim(p_visitor_id);
  v_user_id UUID := auth.uid();
BEGIN
  IF v_visitor_id IS NULL
     OR char_length(v_visitor_id) < 8
     OR char_length(v_visitor_id) > 128
     OR v_visitor_id !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'Invalid visitor id';
  END IF;

  -- Clear authenticated presence when JWT is present (logout / authenticated end).
  IF v_user_id IS NOT NULL THEN
    DELETE FROM public.app_presence WHERE presence_key = 'user:' || v_user_id::text;
  END IF;

  -- Always clear rows for this visitor_id so Safari/Electron sendBeacon
  -- (no Authorization header) still removes the user from online immediately.
  DELETE FROM public.app_presence WHERE visitor_id = v_visitor_id;

  IF p_session_id IS NOT NULL THEN
    UPDATE public.app_sessions
    SET ended_at = NOW(), last_activity_at = NOW()
    WHERE id = p_session_id
      AND visitor_id = v_visitor_id
      AND ended_at IS NULL;
  END IF;

  RETURN json_build_object('ok', true);
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
  v_providers_online BIGINT := 0;
  v_unique_visitors BIGINT := 0;
  v_total_visits BIGINT := 0;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Opportunistic purge before counting.
  PERFORM public.purge_stale_app_presence(INTERVAL '10 minutes');

  SELECT COUNT(*) INTO v_customers
  FROM public.profiles
  WHERE is_platform_admin = false
    AND role IN ('customer', 'both');

  SELECT COUNT(*) INTO v_providers
  FROM public.profiles
  WHERE is_platform_admin = false
    AND role IN ('provider', 'both');

  -- Online = last heartbeat within 90s.
  -- Platform admins are NOT counted in usersOnline / providersOnline.
  -- Anonymous visitors ARE counted in usersOnline.
  SELECT COUNT(*) INTO v_online
  FROM public.app_presence p
  LEFT JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.last_heartbeat_at > NOW() - INTERVAL '90 seconds'
    AND (p.user_id IS NULL OR COALESCE(pr.is_platform_admin, false) = false);

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
    'providers_online', v_providers_online,
    'unique_visitors', v_unique_visitors,
    'total_visits', v_total_visits,
    'online_window_seconds', 90,
    'admins_counted_in_online', false
  );
END;
$$;
