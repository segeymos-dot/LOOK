-- Account settings preferences + device/session tracking + security activity.
-- Display/auth support only — does not alter ledger or payment amounts.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS availability_status TEXT NOT NULL DEFAULT 'available'
    CHECK (availability_status IN ('available', 'busy', 'away', 'offline')),
  ADD COLUMN IF NOT EXISTS service_locations TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS public_profile_visible BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_location TEXT,
  ADD COLUMN IF NOT EXISTS payout_details_note TEXT,
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS privacy_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auth_session_id TEXT NOT NULL,
  device_label TEXT,
  user_agent TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (user_id, auth_session_id)
);

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx
  ON user_sessions (user_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS account_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS account_security_events_user_id_idx
  ON account_security_events (user_id, created_at DESC);

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own sessions" ON user_sessions;
CREATE POLICY "Users read own sessions"
  ON user_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own sessions" ON user_sessions;
CREATE POLICY "Users update own sessions"
  ON user_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own sessions" ON user_sessions;
CREATE POLICY "Users insert own sessions"
  ON user_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own security events" ON account_security_events;
CREATE POLICY "Users read own security events"
  ON account_security_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own security events" ON account_security_events;
CREATE POLICY "Users insert own security events"
  ON account_security_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON user_sessions TO authenticated;
GRANT SELECT, INSERT ON account_security_events TO authenticated;

-- Service-role helpers for session register / revoke (called from Next.js APIs).
CREATE OR REPLACE FUNCTION upsert_user_session(
  p_user_id UUID,
  p_auth_session_id TEXT,
  p_device_label TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_ip TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_user_id IS NULL OR NULLIF(TRIM(p_auth_session_id), '') IS NULL THEN
    RAISE EXCEPTION 'user_id and auth_session_id required';
  END IF;

  INSERT INTO user_sessions (
    user_id, auth_session_id, device_label, user_agent, ip, last_seen_at, revoked_at
  ) VALUES (
    p_user_id, TRIM(p_auth_session_id), p_device_label, p_user_agent, p_ip, NOW(), NULL
  )
  ON CONFLICT (user_id, auth_session_id) DO UPDATE SET
    device_label = COALESCE(EXCLUDED.device_label, user_sessions.device_label),
    user_agent = COALESCE(EXCLUDED.user_agent, user_sessions.user_agent),
    ip = COALESCE(EXCLUDED.ip, user_sessions.ip),
    last_seen_at = NOW(),
    revoked_at = NULL
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION revoke_user_session(
  p_user_id UUID,
  p_auth_session_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_sessions
  SET revoked_at = NOW()
  WHERE user_id = p_user_id
    AND auth_session_id = TRIM(p_auth_session_id)
    AND revoked_at IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION revoke_all_user_sessions(
  p_user_id UUID,
  p_except_auth_session_id TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE user_sessions
  SET revoked_at = NOW()
  WHERE user_id = p_user_id
    AND revoked_at IS NULL
    AND (
      p_except_auth_session_id IS NULL
      OR auth_session_id IS DISTINCT FROM TRIM(p_except_auth_session_id)
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION log_account_security_event(
  p_user_id UUID,
  p_event_type TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO account_security_events (user_id, event_type, metadata, ip, user_agent)
  VALUES (p_user_id, p_event_type, COALESCE(p_metadata, '{}'::jsonb), p_ip, p_user_agent)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION upsert_user_session(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_user_session(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_all_user_sessions(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION log_account_security_event(UUID, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION upsert_user_session(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION revoke_user_session(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION revoke_all_user_sessions(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION log_account_security_event(UUID, TEXT, JSONB, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION upsert_user_session(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_user_session(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_all_user_sessions(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION log_account_security_event(UUID, TEXT, JSONB, TEXT, TEXT) TO authenticated;
