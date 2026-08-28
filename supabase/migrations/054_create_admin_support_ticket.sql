-- Atomic support ticket create + short-window dedupe (double-tap protection).
-- Does not weaken RLS: SECURITY DEFINER but only inserts for auth.uid().

CREATE OR REPLACE FUNCTION public.create_admin_support_ticket(
  p_user_role TEXT,
  p_subject TEXT,
  p_message TEXT,
  p_language TEXT DEFAULT 'ru',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT := NULLIF(TRIM(COALESCE(p_user_role, '')), '');
  v_subject TEXT := TRIM(COALESCE(p_subject, ''));
  v_message TEXT := TRIM(COALESCE(p_message, ''));
  v_language TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_language, '')), ''), 'ru');
  v_key TEXT := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
  v_ticket public.admin_support_messages%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('customer', 'provider') THEN
    RAISE EXCEPTION 'Invalid user_role';
  END IF;

  IF char_length(v_subject) < 1 OR char_length(v_subject) > 200 THEN
    RAISE EXCEPTION 'Invalid subject';
  END IF;

  IF char_length(v_message) < 1 OR char_length(v_message) > 5000 THEN
    RAISE EXCEPTION 'Invalid message';
  END IF;

  IF v_language NOT IN ('ru', 'en') THEN
    v_language := 'ru';
  END IF;

  -- Serialize creates per user (blocks double-tap races).
  PERFORM pg_advisory_xact_lock(hashtext('create_admin_support_ticket:' || v_uid::text));

  -- Reuse identical ticket created within 15 seconds (same subject+message).
  SELECT * INTO v_ticket
  FROM public.admin_support_messages t
  WHERE t.user_id = v_uid
    AND t.subject = v_subject
    AND t.message = v_message
    AND t.created_at > v_now - INTERVAL '15 seconds'
  ORDER BY t.created_at ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object(
      'id', v_ticket.id,
      'user_id', v_ticket.user_id,
      'user_role', v_ticket.user_role,
      'subject', v_ticket.subject,
      'message', v_ticket.message,
      'language', v_ticket.language,
      'status', v_ticket.status,
      'created_at', v_ticket.created_at,
      'updated_at', v_ticket.updated_at,
      'last_activity_at', v_ticket.last_activity_at,
      'admin_last_read_at', v_ticket.admin_last_read_at,
      'user_last_read_at', v_ticket.user_last_read_at,
      'deduped', true
    );
  END IF;

  INSERT INTO public.admin_support_messages (
    user_id,
    user_role,
    subject,
    message,
    language,
    status,
    last_activity_at,
    user_last_read_at,
    admin_last_read_at
  ) VALUES (
    v_uid,
    v_role,
    v_subject,
    v_message,
    v_language,
    'new',
    v_now,
    v_now,
    NULL
  )
  RETURNING * INTO v_ticket;

  INSERT INTO public.admin_support_thread_messages (
    ticket_id,
    sender_type,
    sender_user_id,
    message,
    language,
    created_at
  ) VALUES (
    v_ticket.id,
    'user',
    v_uid,
    v_message,
    v_language,
    v_ticket.created_at
  );

  RETURN json_build_object(
    'id', v_ticket.id,
    'user_id', v_ticket.user_id,
    'user_role', v_ticket.user_role,
    'subject', v_ticket.subject,
    'message', v_ticket.message,
    'language', v_ticket.language,
    'status', v_ticket.status,
    'created_at', v_ticket.created_at,
    'updated_at', v_ticket.updated_at,
    'last_activity_at', v_ticket.last_activity_at,
    'admin_last_read_at', v_ticket.admin_last_read_at,
    'user_last_read_at', v_ticket.user_last_read_at,
    'deduped', false,
    'idempotency_key', v_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_support_ticket(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_admin_support_ticket(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
