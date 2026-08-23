-- Soft archive / trash for order history (no new source of truth — columns on requests).

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS requests_customer_history_idx
  ON requests (customer_id, created_at DESC)
  WHERE trashed_at IS NULL;

CREATE INDEX IF NOT EXISTS requests_archived_idx
  ON requests (archived_at DESC)
  WHERE archived_at IS NOT NULL AND trashed_at IS NULL;

CREATE INDEX IF NOT EXISTS requests_status_payment_idx
  ON requests (status, order_payment_status, refund_dispute_status)
  WHERE trashed_at IS NULL;
