-- Add cancel_request RPC only (does not replace complete_request from 012).
-- Safe to re-run.

CREATE OR REPLACE FUNCTION cancel_request(p_request_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status request_status;
BEGIN
  SELECT status
  INTO v_status
  FROM requests
  WHERE id = p_request_id
    AND customer_id = auth.uid();

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  IF v_status NOT IN ('open', 'in_progress') THEN
    RAISE EXCEPTION 'Request cannot be cancelled in its current status';
  END IF;

  UPDATE requests
  SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_request_id;

  RETURN json_build_object('request_id', p_request_id, 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION cancel_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_request(UUID) TO authenticated;
