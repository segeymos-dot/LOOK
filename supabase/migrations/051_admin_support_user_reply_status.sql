-- Allow users to reopen their support ticket after a follow-up message (RLS-safe).

CREATE OR REPLACE FUNCTION public.set_admin_support_ticket_after_user_message(
  p_ticket_id UUID
)
RETURNS public.admin_support_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.admin_support_messages;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_support_messages
    WHERE id = p_ticket_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.admin_support_messages
  SET
    status = CASE WHEN status = 'closed' THEN status ELSE 'new' END,
    user_last_read_at = NOW(),
    updated_at = NOW(),
    last_activity_at = NOW()
  WHERE id = p_ticket_id
    AND user_id = auth.uid()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_admin_support_ticket_after_user_message(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_admin_support_ticket_after_user_message(UUID) TO authenticated;
