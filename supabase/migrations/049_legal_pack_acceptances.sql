-- Legal pack: adult confirmation, licenses acknowledgement, phone_verified_at foresight,
-- immutable legal_acceptances audit trail. Updates handle_new_user for signup metadata.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS adult_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS licenses_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS licenses_version TEXT,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.adult_confirmed_at IS 'When user confirmed they are 18+ (registration / legal accept)';
COMMENT ON COLUMN public.profiles.licenses_acknowledged_at IS 'When user acknowledged third-party licenses notice';
COMMENT ON COLUMN public.profiles.licenses_version IS 'Acknowledged licenses document version';
COMMENT ON COLUMN public.profiles.phone_verified_at IS 'Set only after real phone verification (SMS/OTP); null until implemented';

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (
    document_type IN ('terms', 'privacy', 'licenses', 'adult')
  ),
  document_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acceptance_method TEXT NOT NULL CHECK (
    acceptance_method IN ('signup', 'reconsent', 'admin_seed')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS legal_acceptances_user_id_idx
  ON public.legal_acceptances (user_id, accepted_at DESC);

CREATE INDEX IF NOT EXISTS legal_acceptances_type_version_idx
  ON public.legal_acceptances (document_type, document_version);

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own legal_acceptances" ON public.legal_acceptances;
CREATE POLICY "Users read own legal_acceptances"
  ON public.legal_acceptances
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Inserts are performed by service/authenticated users via API (own rows only).
DROP POLICY IF EXISTS "Users insert own legal_acceptances" ON public.legal_acceptances;
CREATE POLICY "Users insert own legal_acceptances"
  ON public.legal_acceptances
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

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
  v_licenses_version TEXT := NULLIF(NEW.raw_user_meta_data->>'licenses_version', '');
  v_terms_at TIMESTAMPTZ := NULL;
  v_privacy_at TIMESTAMPTZ := NULL;
  v_licenses_at TIMESTAMPTZ := NULL;
  v_adult_at TIMESTAMPTZ := NULL;
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
    BEGIN
      v_licenses_at := NULLIF(NEW.raw_user_meta_data->>'licenses_acknowledged_at', '')::timestamptz;
    EXCEPTION WHEN others THEN
      v_licenses_at := NULL;
    END;
    BEGIN
      v_adult_at := NULLIF(NEW.raw_user_meta_data->>'adult_confirmed_at', '')::timestamptz;
    EXCEPTION WHEN others THEN
      v_adult_at := NULL;
    END;
    v_terms_at := COALESCE(v_terms_at, NOW());
    v_privacy_at := COALESCE(v_privacy_at, NOW());
    v_licenses_at := COALESCE(v_licenses_at, v_terms_at);
    v_adult_at := COALESCE(v_adult_at, v_terms_at);
  END IF;

  INSERT INTO public.profiles (
    id,
    full_name,
    avatar_url,
    role,
    terms_accepted_at,
    terms_version,
    privacy_accepted_at,
    privacy_version,
    licenses_acknowledged_at,
    licenses_version,
    adult_confirmed_at
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
    CASE WHEN v_accepted THEN v_privacy_version ELSE NULL END,
    CASE WHEN v_accepted THEN v_licenses_at ELSE NULL END,
    CASE WHEN v_accepted THEN v_licenses_version ELSE NULL END,
    CASE WHEN v_accepted THEN v_adult_at ELSE NULL END
  )
  ON CONFLICT (id) DO UPDATE SET
    terms_accepted_at = COALESCE(public.profiles.terms_accepted_at, EXCLUDED.terms_accepted_at),
    terms_version = COALESCE(public.profiles.terms_version, EXCLUDED.terms_version),
    privacy_accepted_at = COALESCE(public.profiles.privacy_accepted_at, EXCLUDED.privacy_accepted_at),
    privacy_version = COALESCE(public.profiles.privacy_version, EXCLUDED.privacy_version),
    licenses_acknowledged_at = COALESCE(public.profiles.licenses_acknowledged_at, EXCLUDED.licenses_acknowledged_at),
    licenses_version = COALESCE(public.profiles.licenses_version, EXCLUDED.licenses_version),
    adult_confirmed_at = COALESCE(public.profiles.adult_confirmed_at, EXCLUDED.adult_confirmed_at);

  IF v_accepted THEN
    INSERT INTO public.legal_acceptances (user_id, document_type, document_version, accepted_at, acceptance_method)
    VALUES
      (NEW.id, 'terms', COALESCE(v_terms_version, 'unknown'), v_terms_at, 'signup'),
      (NEW.id, 'privacy', COALESCE(v_privacy_version, 'unknown'), v_privacy_at, 'signup'),
      (NEW.id, 'licenses', COALESCE(v_licenses_version, 'unknown'), v_licenses_at, 'signup'),
      (NEW.id, 'adult', '18+', v_adult_at, 'signup');
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
