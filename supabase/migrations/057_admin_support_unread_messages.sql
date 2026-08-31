-- Message-level admin unread for support threads.
-- Badge counts user messages with read_by_admin_at IS NULL (not tickets).

ALTER TABLE public.admin_support_thread_messages
  ADD COLUMN IF NOT EXISTS read_by_admin_at TIMESTAMPTZ;

COMMENT ON COLUMN public.admin_support_thread_messages.read_by_admin_at IS
  'When a platform admin opened the thread and saw this user message. NULL = unread for admin.';

CREATE INDEX IF NOT EXISTS admin_support_thread_messages_admin_unread_idx
  ON public.admin_support_thread_messages (ticket_id, created_at)
  WHERE sender_type = 'user' AND read_by_admin_at IS NULL;

-- Backfill: messages already covered by ticket.admin_last_read_at are read.
UPDATE public.admin_support_thread_messages m
SET read_by_admin_at = t.admin_last_read_at
FROM public.admin_support_messages t
WHERE m.ticket_id = t.id
  AND m.sender_type = 'user'
  AND m.read_by_admin_at IS NULL
  AND t.admin_last_read_at IS NOT NULL
  AND m.created_at <= t.admin_last_read_at;

-- Admins may update read cursor on thread messages.
DROP POLICY IF EXISTS "Admins update support thread message read state"
  ON public.admin_support_thread_messages;
CREATE POLICY "Admins update support thread message read state"
  ON public.admin_support_thread_messages
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

GRANT UPDATE ON public.admin_support_thread_messages TO authenticated;

-- Opening a thread marks ticket + all prior user messages as read by admin.
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

    UPDATE public.admin_support_thread_messages
    SET read_by_admin_at = NOW()
    WHERE ticket_id = p_ticket_id
      AND sender_type = 'user'
      AND read_by_admin_at IS NULL;
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

-- Count unread user messages from real non-admin registered owners.
CREATE OR REPLACE FUNCTION public.get_admin_support_unread_message_count()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT := 0;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COUNT(*)::BIGINT
  INTO v_count
  FROM public.admin_support_thread_messages m
  INNER JOIN public.admin_support_messages t ON t.id = m.ticket_id
  INNER JOIN public.profiles p ON p.id = t.user_id
  INNER JOIN auth.users u ON u.id = t.user_id
  WHERE m.sender_type = 'user'
    AND m.read_by_admin_at IS NULL
    AND COALESCE(p.is_platform_admin, false) = false
    AND COALESCE(u.email, '') NOT ILIKE '%@test.look'
    AND COALESCE(p.full_name, '') NOT ILIKE '%Support Tester%';

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_support_unread_message_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_support_unread_message_count() TO authenticated;

COMMENT ON FUNCTION public.get_admin_support_unread_message_count() IS
  'Platform admin: count of unread user→admin support thread messages from real non-admin users.';
