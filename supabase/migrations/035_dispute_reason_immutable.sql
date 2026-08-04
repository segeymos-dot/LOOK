-- Dispute reason is immutable after insert (resolution fields may still change via service_role).
CREATE OR REPLACE FUNCTION prevent_order_dispute_reason_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.reason IS DISTINCT FROM OLD.reason THEN
    RAISE EXCEPTION 'DISPUTE_REASON_IMMUTABLE: Dispute reason cannot be edited after opening';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.opened_by IS DISTINCT FROM OLD.opened_by THEN
    RAISE EXCEPTION 'DISPUTE_OPENER_IMMUTABLE: Dispute opener cannot be changed';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'DISPUTE_CREATED_AT_IMMUTABLE: Dispute opened_at cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_disputes_immutable_reason ON order_disputes;
CREATE TRIGGER order_disputes_immutable_reason
  BEFORE UPDATE ON order_disputes
  FOR EACH ROW
  EXECUTE FUNCTION prevent_order_dispute_reason_mutation();

-- No authenticated/anon UPDATE policy exists; keep it that way explicitly.
REVOKE UPDATE ON order_disputes FROM anon, authenticated;
