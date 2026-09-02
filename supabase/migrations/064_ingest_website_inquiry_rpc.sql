-- SECURITY DEFINER ingest for website contact form (bypasses RLS safely).

CREATE OR REPLACE FUNCTION public.ingest_website_inquiry(
  p_name TEXT,
  p_email TEXT,
  p_subject TEXT,
  p_message TEXT,
  p_intent TEXT DEFAULT NULL,
  p_locale TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'website_contact',
  p_fingerprint TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_existing UUID;
BEGIN
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'email required';
  END IF;
  IF p_message IS NULL OR length(trim(p_message)) = 0 THEN
    RAISE EXCEPTION 'message required';
  END IF;

  IF p_fingerprint IS NOT NULL AND length(trim(p_fingerprint)) > 0 THEN
    SELECT id INTO v_existing
    FROM public.website_inquiries
    WHERE content_fingerprint = p_fingerprint
      AND created_at > NOW() - INTERVAL '2 minutes'
    ORDER BY created_at DESC
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  INSERT INTO public.website_inquiries (
    name, email, subject, message, intent, locale, source,
    status, read_by_admin_at, answered_at, content_fingerprint
  ) VALUES (
    NULLIF(trim(p_name), ''),
    lower(trim(p_email)),
    NULLIF(trim(p_subject), ''),
    trim(p_message),
    NULLIF(trim(COALESCE(p_intent, '')), ''),
    NULLIF(trim(COALESCE(p_locale, '')), ''),
    COALESCE(NULLIF(trim(p_source), ''), 'website_contact'),
    'new', NULL, NULL,
    NULLIF(trim(COALESCE(p_fingerprint, '')), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_website_inquiry(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_website_inquiry(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
-- Server ingest uses service_role; keep anon/authenticated revoked for direct public abuse.
