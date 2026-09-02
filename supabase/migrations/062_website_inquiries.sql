-- Website contact-form inquiries (lookappworld.com) — separate from in-app support.

CREATE TABLE IF NOT EXISTS public.website_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT,
  subject TEXT,
  message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'new',
  read_by_admin_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  CONSTRAINT website_inquiries_status_check
    CHECK (status IN ('new', 'read', 'answered', 'closed'))
);

COMMENT ON TABLE public.website_inquiries IS
  'Contact form submissions from lookappworld.com — not in-app support.';
COMMENT ON COLUMN public.website_inquiries.read_by_admin_at IS
  'When a platform admin first opened this inquiry. NULL = unread.';

CREATE INDEX IF NOT EXISTS website_inquiries_unread_idx
  ON public.website_inquiries (created_at DESC)
  WHERE read_by_admin_at IS NULL;

CREATE INDEX IF NOT EXISTS website_inquiries_created_at_idx
  ON public.website_inquiries (created_at DESC);

ALTER TABLE public.website_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins select website inquiries" ON public.website_inquiries;
CREATE POLICY "Admins select website inquiries"
  ON public.website_inquiries
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

GRANT SELECT ON public.website_inquiries TO authenticated;
GRANT ALL ON public.website_inquiries TO service_role;

CREATE OR REPLACE FUNCTION public.get_admin_website_inquiries_unread_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM public.website_inquiries
    WHERE read_by_admin_at IS NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_website_inquiries_unread_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_website_inquiries_unread_count() TO authenticated;

COMMENT ON FUNCTION public.get_admin_website_inquiries_unread_count() IS
  'Platform admin: unread website contact-form inquiries (read_by_admin_at IS NULL).';
