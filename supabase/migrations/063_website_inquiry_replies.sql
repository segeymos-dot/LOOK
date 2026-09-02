-- Website inquiries: source/locale/intent + replies + admin update/read RPCs.

ALTER TABLE public.website_inquiries
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'website_contact',
  ADD COLUMN IF NOT EXISTS locale TEXT,
  ADD COLUMN IF NOT EXISTS intent TEXT,
  ADD COLUMN IF NOT EXISTS content_fingerprint TEXT;

COMMENT ON COLUMN public.website_inquiries.source IS
  'Origin channel, e.g. website_contact';
COMMENT ON COLUMN public.website_inquiries.content_fingerprint IS
  'Short hash for duplicate submit suppression (not PII).';

CREATE INDEX IF NOT EXISTS website_inquiries_fingerprint_idx
  ON public.website_inquiries (content_fingerprint, created_at DESC)
  WHERE content_fingerprint IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.website_inquiry_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES public.website_inquiries(id) ON DELETE CASCADE,
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  locale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email_message_id TEXT
);

CREATE INDEX IF NOT EXISTS website_inquiry_replies_inquiry_id_idx
  ON public.website_inquiry_replies (inquiry_id, created_at DESC);

ALTER TABLE public.website_inquiry_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins select website inquiry replies" ON public.website_inquiry_replies;
CREATE POLICY "Admins select website inquiry replies"
  ON public.website_inquiry_replies
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins insert website inquiry replies" ON public.website_inquiry_replies;
CREATE POLICY "Admins insert website inquiry replies"
  ON public.website_inquiry_replies
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin());

GRANT SELECT, INSERT ON public.website_inquiry_replies TO authenticated;
GRANT ALL ON public.website_inquiry_replies TO service_role;

-- Admins may update inquiry status / read / answered fields.
DROP POLICY IF EXISTS "Admins update website inquiries" ON public.website_inquiries;
CREATE POLICY "Admins update website inquiries"
  ON public.website_inquiries
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

GRANT UPDATE ON public.website_inquiries TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_website_inquiry_read(p_inquiry_id UUID)
RETURNS public.website_inquiries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.website_inquiries;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.website_inquiries
  SET
    read_by_admin_at = COALESCE(read_by_admin_at, NOW()),
    status = CASE
      WHEN status = 'new' THEN 'read'
      ELSE status
    END
  WHERE id = p_inquiry_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Not found';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_website_inquiry_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_website_inquiry_read(UUID) TO authenticated;
