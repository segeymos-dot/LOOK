-- Admin user / visitor / online presence statistics
-- Online window: 90 seconds since last heartbeat
-- Session idle: 30 minutes → new visit on next heartbeat

CREATE TABLE IF NOT EXISTS public.app_visitors (
  visitor_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_visitors_visitor_id_len CHECK (char_length(trim(visitor_id)) >= 8)
);

CREATE UNIQUE INDEX IF NOT EXISTS app_visitors_user_id_unique
  ON public.app_visitors (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_app_visitors_last_seen
  ON public.app_visitors (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.app_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id TEXT NOT NULL REFERENCES public.app_visitors(visitor_id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_app_sessions_visitor
  ON public.app_sessions (visitor_id, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_sessions_started
  ON public.app_sessions (started_at DESC);

CREATE TABLE IF NOT EXISTS public.app_presence (
  presence_key TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES public.app_visitors(visitor_id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_provider BOOLEAN NOT NULL DEFAULT false,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_presence_heartbeat
  ON public.app_presence (last_heartbeat_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_presence_provider_online
  ON public.app_presence (last_heartbeat_at DESC)
  WHERE is_provider = true AND user_id IS NOT NULL;

ALTER TABLE public.app_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read app visitors" ON public.app_visitors;
CREATE POLICY "Admins can read app visitors"
  ON public.app_visitors FOR SELECT
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can read app sessions" ON public.app_sessions;
CREATE POLICY "Admins can read app sessions"
  ON public.app_sessions FOR SELECT
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can read app presence" ON public.app_presence;
CREATE POLICY "Admins can read app presence"
  ON public.app_presence FOR SELECT
  USING (public.is_platform_admin());

-- Heartbeat: upsert visitor, continue/create session, upsert presence.
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
  v_user_id UUID := p_user_id;
  v_is_provider BOOLEAN := false;
  v_new_session BOOLEAN := false;
  v_presence_key TEXT;
  v_existing_user_visitor TEXT;
  v_role public.user_role;
BEGIN
  IF v_visitor_id IS NULL OR char_length(v_visitor_id) < 8 THEN
    RAISE EXCEPTION 'Invalid visitor id';
  END IF;

  -- Only trust auth.uid() for identity; ignore forged body user ids.
  IF auth.uid() IS NOT NULL THEN
    v_user_id := auth.uid();
  ELSE
    v_user_id := NULL;
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role IS NULL THEN
      v_user_id := NULL;
    ELSE
      v_is_provider := (v_role = 'provider' OR v_role = 'both');
    END IF;
  END IF;

  -- Merge: if this user already has another visitor_id, reuse the earliest one.
  IF v_user_id IS NOT NULL THEN
    SELECT visitor_id INTO v_existing_user_visitor
    FROM public.app_visitors
    WHERE user_id = v_user_id
      AND visitor_id <> v_visitor_id
    ORDER BY first_seen_at ASC
    LIMIT 1;

    IF v_existing_user_visitor IS NOT NULL THEN
      -- Move sessions from current anon key to canonical visitor.
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

  -- Continue open session if still active (< 30 min idle); else open a new visit.
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

  -- Drop stale anon presence for the same visitor after login.
  IF v_user_id IS NOT NULL THEN
    DELETE FROM public.app_presence
    WHERE presence_key = 'anon:' || v_visitor_id
      AND presence_key <> v_presence_key;
  END IF;

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
  IF v_visitor_id IS NULL OR char_length(v_visitor_id) < 8 THEN
    RAISE EXCEPTION 'Invalid visitor id';
  END IF;

  IF v_user_id IS NOT NULL THEN
    DELETE FROM public.app_presence WHERE presence_key = 'user:' || v_user_id::text;
  END IF;

  DELETE FROM public.app_presence WHERE presence_key = 'anon:' || v_visitor_id;

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

  SELECT COUNT(*) INTO v_customers
  FROM public.profiles
  WHERE is_platform_admin = false
    AND role IN ('customer', 'both');

  SELECT COUNT(*) INTO v_providers
  FROM public.profiles
  WHERE is_platform_admin = false
    AND role IN ('provider', 'both');

  -- Online within last 90 seconds; one row per presence_key (user or anon).
  SELECT COUNT(*) INTO v_online
  FROM public.app_presence
  WHERE last_heartbeat_at > NOW() - INTERVAL '90 seconds';

  SELECT COUNT(*) INTO v_providers_online
  FROM public.app_presence p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.last_heartbeat_at > NOW() - INTERVAL '90 seconds'
    AND p.is_provider = true
    AND p.user_id IS NOT NULL
    AND pr.is_platform_admin = false;

  -- Unique people: prefer linked user_id, else visitor_id.
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
    'online_window_seconds', 90
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_app_heartbeat(TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_app_heartbeat(TEXT, UUID, UUID) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.end_app_presence(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_app_presence(TEXT, UUID) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_admin_user_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_user_stats() TO authenticated, service_role;
