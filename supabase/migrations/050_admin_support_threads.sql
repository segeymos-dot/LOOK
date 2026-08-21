-- Two-way LOOK admin support threads (extends 027 tickets; no data loss).

ALTER TABLE public.admin_support_messages
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS admin_last_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS user_last_read_at TIMESTAMPTZ;

UPDATE public.admin_support_messages
SET last_activity_at = COALESCE(last_activity_at, updated_at, created_at)
WHERE last_activity_at IS NULL
   OR last_activity_at < created_at;

UPDATE public.admin_support_messages
SET user_last_read_at = COALESCE(user_last_read_at, created_at)
WHERE user_last_read_at IS NULL;

UPDATE public.admin_support_messages
SET admin_last_read_at = COALESCE(admin_last_read_at, updated_at, created_at)
WHERE admin_last_read_at IS NULL
  AND status IN ('read', 'answered', 'closed');

CREATE INDEX IF NOT EXISTS admin_support_messages_last_activity_idx
  ON public.admin_support_messages (last_activity_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_support_thread_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.admin_support_messages(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'admin')),
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'ru' CHECK (language IN ('ru', 'en')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_support_thread_messages_message_len
    CHECK (char_length(trim(message)) BETWEEN 1 AND 5000)
);

CREATE INDEX IF NOT EXISTS admin_support_thread_messages_ticket_created_idx
  ON public.admin_support_thread_messages (ticket_id, created_at ASC);

CREATE INDEX IF NOT EXISTS admin_support_thread_messages_ticket_created_desc_idx
  ON public.admin_support_thread_messages (ticket_id, created_at DESC);

-- Backfill original ticket body as the first user message (idempotent).
INSERT INTO public.admin_support_thread_messages (
  ticket_id,
  sender_type,
  sender_user_id,
  message,
  language,
  created_at
)
SELECT
  t.id,
  'user',
  t.user_id,
  t.message,
  t.language,
  t.created_at
FROM public.admin_support_messages t
WHERE NOT EXISTS (
  SELECT 1
  FROM public.admin_support_thread_messages m
  WHERE m.ticket_id = t.id
);

CREATE OR REPLACE FUNCTION public.touch_admin_support_ticket_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.admin_support_messages
  SET
    last_activity_at = NEW.created_at,
    updated_at = NEW.created_at,
    message = NEW.message
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_admin_support_ticket_activity
  ON public.admin_support_thread_messages;
CREATE TRIGGER trg_touch_admin_support_ticket_activity
  AFTER INSERT ON public.admin_support_thread_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_admin_support_ticket_activity();

CREATE OR REPLACE FUNCTION public.mark_admin_support_ticket_read(p_ticket_id UUID)
RETURNS public.admin_support_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.admin_support_messages;
BEGIN
  IF public.is_platform_admin() THEN
    UPDATE public.admin_support_messages
    SET
      admin_last_read_at = NOW(),
      status = CASE WHEN status = 'new' THEN 'read' ELSE status END,
      updated_at = NOW()
    WHERE id = p_ticket_id
    RETURNING * INTO v_row;
  ELSIF EXISTS (
    SELECT 1
    FROM public.admin_support_messages
    WHERE id = p_ticket_id AND user_id = auth.uid()
  ) THEN
    UPDATE public.admin_support_messages
    SET
      user_last_read_at = NOW(),
      updated_at = NOW()
    WHERE id = p_ticket_id AND user_id = auth.uid()
    RETURNING * INTO v_row;
  ELSE
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_admin_support_ticket_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_admin_support_ticket_read(UUID) TO authenticated;

ALTER TABLE public.admin_support_thread_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own support thread messages" ON public.admin_support_thread_messages;
CREATE POLICY "Users read own support thread messages"
  ON public.admin_support_thread_messages
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.admin_support_messages t
      WHERE t.id = ticket_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users insert own support thread messages" ON public.admin_support_thread_messages;
CREATE POLICY "Users insert own support thread messages"
  ON public.admin_support_thread_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_type = 'user'
    AND sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.admin_support_messages t
      WHERE t.id = ticket_id
        AND t.user_id = auth.uid()
        AND t.status <> 'closed'
    )
  );

DROP POLICY IF EXISTS "Admins insert support thread replies" ON public.admin_support_thread_messages;
CREATE POLICY "Admins insert support thread replies"
  ON public.admin_support_thread_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    AND sender_type = 'admin'
    AND sender_user_id = auth.uid()
  );

GRANT SELECT, INSERT ON public.admin_support_thread_messages TO authenticated;

COMMENT ON TABLE public.admin_support_thread_messages IS
  'Messages inside LOOK admin support tickets; not customer↔provider chat.';
