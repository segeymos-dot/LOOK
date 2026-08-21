-- Admin support messages: user → LOOK administration (separate from customer↔provider chats).

CREATE TABLE IF NOT EXISTS public.admin_support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_role TEXT NOT NULL CHECK (user_role IN ('customer', 'provider')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'ru' CHECK (language IN ('ru', 'en')),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'read', 'answered', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_support_messages_subject_len CHECK (char_length(trim(subject)) BETWEEN 1 AND 200),
  CONSTRAINT admin_support_messages_message_len CHECK (char_length(trim(message)) BETWEEN 1 AND 5000)
);

CREATE INDEX IF NOT EXISTS admin_support_messages_created_at_idx
  ON public.admin_support_messages (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_support_messages_status_idx
  ON public.admin_support_messages (status, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_support_messages_user_id_idx
  ON public.admin_support_messages (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_admin_support_messages_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_support_messages_updated_at ON public.admin_support_messages;
CREATE TRIGGER trg_admin_support_messages_updated_at
  BEFORE UPDATE ON public.admin_support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_admin_support_messages_updated_at();

ALTER TABLE public.admin_support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own admin_support_messages" ON public.admin_support_messages;
CREATE POLICY "Users insert own admin_support_messages"
  ON public.admin_support_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own or admin reads all support messages" ON public.admin_support_messages;
CREATE POLICY "Users read own or admin reads all support messages"
  ON public.admin_support_messages
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_platform_admin());

DROP POLICY IF EXISTS "Admins update admin_support_messages" ON public.admin_support_messages;
CREATE POLICY "Admins update admin_support_messages"
  ON public.admin_support_messages
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

GRANT SELECT, INSERT ON public.admin_support_messages TO authenticated;
GRANT UPDATE ON public.admin_support_messages TO authenticated;

COMMENT ON TABLE public.admin_support_messages IS
  'User-to-administration support requests; not customer↔provider chat.';
