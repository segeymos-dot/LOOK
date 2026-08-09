-- Signup default: new profiles should be customer (not both).
-- Provider capability is granted via onboarding (customer → both).
-- DO NOT apply automatically in agent flows — apply on Staging when approved.
-- Preserves auto-confirm behavior from 004_auto_confirm_email.sql.

-- Column default for new inserts that omit role
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'customer'::public.user_role;

-- Auth trigger: fall back to customer when metadata role is missing
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE id = NEW.id;

  INSERT INTO public.profiles (id, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'role', '')::public.user_role,
      'customer'::public.user_role
    )
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
