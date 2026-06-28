-- Platform visit analytics (admin-only read)

CREATE TABLE IF NOT EXISTS platform_analytics (
  id TEXT PRIMARY KEY DEFAULT 'global',
  page_views BIGINT NOT NULL DEFAULT 0,
  unique_visitors BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_analytics (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS platform_visitor_sessions (
  visitor_key TEXT PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE platform_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_visitor_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read platform analytics"
  ON platform_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

CREATE POLICY "Admins can read visitor sessions count"
  ON platform_visitor_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

CREATE OR REPLACE FUNCTION record_site_visit(p_visitor_key TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_new BOOLEAN := false;
BEGIN
  IF p_visitor_key IS NULL OR LENGTH(TRIM(p_visitor_key)) < 8 THEN
    RAISE EXCEPTION 'Invalid visitor key';
  END IF;

  UPDATE platform_analytics
  SET page_views = page_views + 1, updated_at = NOW()
  WHERE id = 'global';

  INSERT INTO platform_visitor_sessions (visitor_key, first_seen_at, last_seen_at)
  VALUES (p_visitor_key, NOW(), NOW())
  ON CONFLICT (visitor_key) DO UPDATE SET last_seen_at = NOW()
  RETURNING (xmax = 0) INTO v_is_new;

  IF v_is_new THEN
    UPDATE platform_analytics
    SET unique_visitors = unique_visitors + 1, updated_at = NOW()
    WHERE id = 'global';
  END IF;

  RETURN json_build_object('recorded', true, 'is_new_visitor', v_is_new);
END;
$$;

REVOKE ALL ON FUNCTION record_site_visit(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_site_visit(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION record_site_visit(TEXT) TO anon, authenticated;
