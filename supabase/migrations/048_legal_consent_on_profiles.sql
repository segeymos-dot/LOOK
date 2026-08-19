-- Legal consent fields on profiles (terms + privacy acceptance at signup).
-- Version strings match src/lib/legal/versions.ts (LEGAL_DOCUMENT_VERSION).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version TEXT,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS privacy_version TEXT;

COMMENT ON COLUMN public.profiles.terms_accepted_at IS 'When user accepted Terms of Service';
COMMENT ON COLUMN public.profiles.terms_version IS 'Accepted Terms document version (e.g. 2026-08-19)';
COMMENT ON COLUMN public.profiles.privacy_accepted_at IS 'When user accepted Privacy Policy';
COMMENT ON COLUMN public.profiles.privacy_version IS 'Accepted Privacy Policy document version';

-- Copy consent from signup metadata when email confirmation delays session.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_accepted BOOLEAN := COALESCE(NEW.raw_user_meta_data->>'accepted_terms', '') = 'true';
  v_terms_version TEXT := NULLIF(NEW.raw_user_meta_data->>'terms_version', '');
  v_privacy_version TEXT := NULLIF(NEW.raw_user_meta_data->>'privacy_version', '');
  v_terms_at TIMESTAMPTZ := NULL;
  v_privacy_at TIMESTAMPTZ := NULL;
BEGIN
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE id = NEW.id;

  IF v_accepted THEN
    BEGIN
      v_terms_at := NULLIF(NEW.raw_user_meta_data->>'terms_accepted_at', '')::timestamptz;
    EXCEPTION WHEN others THEN
      v_terms_at := NULL;
    END;
    BEGIN
      v_privacy_at := NULLIF(NEW.raw_user_meta_data->>'privacy_accepted_at', '')::timestamptz;
    EXCEPTION WHEN others THEN
      v_privacy_at := NULL;
    END;
    v_terms_at := COALESCE(v_terms_at, NOW());
    v_privacy_at := COALESCE(v_privacy_at, NOW());
  END IF;

  INSERT INTO public.profiles (
    id,
    full_name,
    avatar_url,
    role,
    terms_accepted_at,
    terms_version,
    privacy_accepted_at,
    privacy_version
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'role', '')::public.user_role,
      'customer'::public.user_role
    ),
    CASE WHEN v_accepted THEN v_terms_at ELSE NULL END,
    CASE WHEN v_accepted THEN v_terms_version ELSE NULL END,
    CASE WHEN v_accepted THEN v_privacy_at ELSE NULL END,
    CASE WHEN v_accepted THEN v_privacy_version ELSE NULL END
  )
  ON CONFLICT (id) DO UPDATE SET
    terms_accepted_at = COALESCE(public.profiles.terms_accepted_at, EXCLUDED.terms_accepted_at),
    terms_version = COALESCE(public.profiles.terms_version, EXCLUDED.terms_version),
    privacy_accepted_at = COALESCE(public.profiles.privacy_accepted_at, EXCLUDED.privacy_accepted_at),
    privacy_version = COALESCE(public.profiles.privacy_version, EXCLUDED.privacy_version);

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
