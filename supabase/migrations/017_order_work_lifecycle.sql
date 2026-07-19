-- Order work lifecycle: provider submission, customer review, payment on accept

DO $$ BEGIN
  ALTER TYPE request_status ADD VALUE 'pending_review';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE requests ADD COLUMN IF NOT EXISTS revision_feedback TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS work_submitted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS work_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  revision_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_submissions_request ON work_submissions(request_id, created_at DESC);

ALTER TABLE work_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Work submission parties can view" ON work_submissions;
CREATE POLICY "Work submission parties can view"
  ON work_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = work_submissions.request_id
        AND (r.customer_id = auth.uid() OR work_submissions.provider_id = auth.uid())
    )
  );

-- Messages: delivery + attachments
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ DEFAULT NOW();

UPDATE messages SET delivered_at = created_at WHERE delivered_at IS NULL;

-- Mutual reviews: reviewee_id
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reviewee_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
UPDATE reviews SET reviewee_id = provider_id WHERE reviewee_id IS NULL;

CREATE OR REPLACE FUNCTION refresh_provider_rating(p_provider_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET
    rating = COALESCE((
      SELECT ROUND(AVG(rating)::numeric, 2)
      FROM reviews
      WHERE reviewee_id = p_provider_id
    ), 0),
    reviews_count = (
      SELECT COUNT(*)::integer FROM reviews WHERE reviewee_id = p_provider_id
    ),
    updated_at = NOW()
  WHERE id = p_provider_id;
END;
$$;

DROP POLICY IF EXISTS "Customers can create reviews for completed requests" ON reviews;
CREATE POLICY "Order parties can create reviews for completed requests"
  ON reviews FOR INSERT
  WITH CHECK (
    auth.uid() = reviewer_id
    AND reviewee_id IS NOT NULL
    AND reviewee_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM requests r
      JOIN offers o ON o.request_id = r.id AND o.status = 'accepted'
      WHERE r.id = request_id
        AND r.status = 'completed'
        AND (
          (r.customer_id = auth.uid() AND o.provider_id = reviewee_id)
          OR (o.provider_id = auth.uid() AND r.customer_id = reviewee_id)
        )
    )
  );

-- Storage for work deliverables
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'work-deliverables',
  'work-deliverables',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Work deliverables are publicly accessible" ON storage.objects;
CREATE POLICY "Work deliverables are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'work-deliverables');

DROP POLICY IF EXISTS "Providers upload work deliverables" ON storage.objects;
CREATE POLICY "Providers upload work deliverables"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'work-deliverables'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Provider submits completed work
CREATE OR REPLACE FUNCTION submit_work(
  p_request_id UUID,
  p_summary TEXT,
  p_attachments JSONB DEFAULT '[]'::jsonb
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status request_status;
  v_provider_id UUID;
  v_revision INTEGER;
  v_submission_id UUID;
  v_conversation_id UUID;
BEGIN
  SELECT r.status, o.provider_id
  INTO v_status, v_provider_id
  FROM requests r
  JOIN offers o ON o.request_id = r.id AND o.status = 'accepted'
  WHERE r.id = p_request_id;

  IF v_provider_id IS NULL OR v_provider_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to submit work for this order';
  END IF;

  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Work can only be submitted while order is in progress';
  END IF;

  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_revision
  FROM work_submissions WHERE request_id = p_request_id;

  INSERT INTO work_submissions (request_id, provider_id, summary, attachments, revision_number)
  VALUES (p_request_id, v_provider_id, TRIM(p_summary), COALESCE(p_attachments, '[]'::jsonb), v_revision)
  RETURNING id INTO v_submission_id;

  UPDATE requests
  SET status = 'pending_review',
      work_submitted_at = NOW(),
      revision_feedback = NULL,
      updated_at = NOW()
  WHERE id = p_request_id;

  SELECT id INTO v_conversation_id
  FROM conversations
  WHERE request_id = p_request_id
  LIMIT 1;

  IF v_conversation_id IS NOT NULL THEN
    INSERT INTO messages (conversation_id, sender_id, content, delivered_at)
    VALUES (
      v_conversation_id,
      v_provider_id,
      '📋 Работа сдана на проверку заказчику.',
      NOW()
    );
    UPDATE conversations SET updated_at = NOW() WHERE id = v_conversation_id;
  END IF;

  RETURN json_build_object(
    'submission_id', v_submission_id,
    'request_id', p_request_id,
    'status', 'pending_review',
    'revision_number', v_revision
  );
END;
$$;

-- Customer sends work back for revision
CREATE OR REPLACE FUNCTION request_revision(
  p_request_id UUID,
  p_feedback TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status request_status;
BEGIN
  SELECT status INTO v_status
  FROM requests
  WHERE id = p_request_id AND customer_id = auth.uid();

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  IF v_status <> 'pending_review' THEN
    RAISE EXCEPTION 'Revision can only be requested while work is pending review';
  END IF;

  UPDATE requests
  SET status = 'in_progress',
      revision_feedback = NULLIF(TRIM(p_feedback), ''),
      updated_at = NOW()
  WHERE id = p_request_id;

  RETURN json_build_object('request_id', p_request_id, 'status', 'in_progress');
END;
$$;

-- Internal: process test payment for a request
CREATE OR REPLACE FUNCTION process_test_payment(p_request_id UUID, p_customer_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer offers%ROWTYPE;
  v_rate NUMERIC;
  v_gross NUMERIC(12, 2);
  v_fee NUMERIC(12, 2);
  v_provider_amount NUMERIC(12, 2);
  v_payment_id UUID;
  v_existing payment_status;
BEGIN
  SELECT status INTO v_existing FROM payments WHERE request_id = p_request_id;
  IF v_existing = 'paid' THEN
    SELECT id INTO v_payment_id FROM payments WHERE request_id = p_request_id AND status = 'paid';
    RETURN v_payment_id;
  END IF;

  SELECT o.* INTO v_offer
  FROM offers o
  WHERE o.request_id = p_request_id AND o.status = 'accepted'
  LIMIT 1;

  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'No accepted offer found for this order';
  END IF;

  v_rate := get_platform_commission_rate();
  v_gross := ROUND(v_offer.price::NUMERIC, 2);
  v_fee := ROUND(v_gross * v_rate, 2);
  v_provider_amount := v_gross - v_fee;

  INSERT INTO payments (
    request_id, offer_id, customer_id, provider_id,
    amount_gross, platform_fee, provider_amount, currency,
    status, payment_method, paid_at
  )
  VALUES (
    p_request_id, v_offer.id, p_customer_id, v_offer.provider_id,
    v_gross, v_fee, v_provider_amount, v_offer.currency,
    'paid', 'test', NOW()
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO platform_commissions (
    payment_id, request_id, gross_amount, commission_rate, commission_amount, currency
  )
  VALUES (
    v_payment_id, p_request_id, v_gross, v_rate, v_fee, v_offer.currency
  );

  INSERT INTO transactions (payment_id, request_id, user_id, type, amount, currency, description, metadata)
  VALUES
    (v_payment_id, p_request_id, p_customer_id, 'order_payment', v_gross, v_offer.currency,
     'Тестовая оплата заказа', jsonb_build_object('request_id', p_request_id)),
    (v_payment_id, p_request_id, NULL, 'platform_commission', v_fee, v_offer.currency,
     'Комиссия LOOK', jsonb_build_object('rate', v_rate)),
    (v_payment_id, p_request_id, v_offer.provider_id, 'provider_earning', v_provider_amount, v_offer.currency,
     'Начисление исполнителю', jsonb_build_object('provider_id', v_offer.provider_id));

  UPDATE transactions SET provider_id = v_offer.provider_id
  WHERE payment_id = v_payment_id AND type = 'provider_earning';

  INSERT INTO provider_balances (provider_id, available_balance, pending_payout, total_earned, currency)
  VALUES (v_offer.provider_id, v_provider_amount, 0, v_provider_amount, v_offer.currency)
  ON CONFLICT (provider_id) DO UPDATE SET
    available_balance = provider_balances.available_balance + EXCLUDED.available_balance,
    total_earned = provider_balances.total_earned + EXCLUDED.total_earned,
    updated_at = NOW();

  RETURN v_payment_id;
END;
$$;

-- Customer accepts work: pay + complete
CREATE OR REPLACE FUNCTION accept_work(p_request_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status request_status;
  v_customer_id UUID;
  v_provider_id UUID;
  v_payment_id UUID;
BEGIN
  SELECT r.status, r.customer_id, o.provider_id
  INTO v_status, v_customer_id, v_provider_id
  FROM requests r
  LEFT JOIN offers o ON o.request_id = r.id AND o.status = 'accepted'
  WHERE r.id = p_request_id AND r.customer_id = auth.uid();

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  IF v_status <> 'pending_review' THEN
    RAISE EXCEPTION 'Work can only be accepted while pending customer review';
  END IF;

  v_payment_id := process_test_payment(p_request_id, v_customer_id);

  UPDATE requests
  SET status = 'completed', revision_feedback = NULL, updated_at = NOW()
  WHERE id = p_request_id;

  IF v_provider_id IS NOT NULL THEN
    UPDATE profiles
    SET completed_orders_count = completed_orders_count + 1, updated_at = NOW()
    WHERE id = v_provider_id;
  END IF;

  RETURN json_build_object(
    'request_id', p_request_id,
    'status', 'completed',
    'payment_id', v_payment_id
  );
END;
$$;

-- Update simulate_test_payment: allow pending_review (legacy UI)
CREATE OR REPLACE FUNCTION simulate_test_payment(p_request_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
  v_status request_status;
  v_payment_id UUID;
  v_gross NUMERIC(12, 2);
  v_fee NUMERIC(12, 2);
  v_provider_amount NUMERIC(12, 2);
  v_rate NUMERIC;
  v_currency TEXT;
BEGIN
  SELECT r.customer_id, r.status
  INTO v_customer_id, v_status
  FROM requests r
  WHERE r.id = p_request_id;

  IF v_customer_id IS NULL OR v_customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  IF v_status NOT IN ('in_progress', 'pending_review') THEN
    RAISE EXCEPTION 'Payment is only available for active orders';
  END IF;

  v_payment_id := process_test_payment(p_request_id, v_customer_id);

  SELECT amount_gross, platform_fee, provider_amount, currency
  INTO v_gross, v_fee, v_provider_amount, v_currency
  FROM payments WHERE id = v_payment_id;

  v_rate := get_platform_commission_rate();

  RETURN json_build_object(
    'payment_id', v_payment_id,
    'request_id', p_request_id,
    'amount_gross', v_gross,
    'platform_fee', v_fee,
    'provider_amount', v_provider_amount,
    'commission_rate', v_rate,
    'currency', v_currency,
    'status', 'paid'
  );
END;
$$;

-- complete_request: only from pending_review with payment (legacy)
CREATE OR REPLACE FUNCTION complete_request(p_request_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN accept_work(p_request_id);
END;
$$;

-- cancel: include pending_review
CREATE OR REPLACE FUNCTION cancel_request(p_request_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status request_status;
BEGIN
  SELECT status INTO v_status
  FROM requests
  WHERE id = p_request_id AND customer_id = auth.uid();

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  IF v_status NOT IN ('open', 'in_progress', 'pending_review') THEN
    RAISE EXCEPTION 'Request cannot be cancelled in its current status';
  END IF;

  UPDATE requests SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_request_id;

  RETURN json_build_object('request_id', p_request_id, 'status', 'cancelled');
END;
$$;

-- Keep provider rating in sync when reviewee_id is used
CREATE OR REPLACE FUNCTION on_review_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reviewee UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_reviewee := COALESCE(OLD.reviewee_id, OLD.provider_id);
  ELSE
    v_reviewee := COALESCE(NEW.reviewee_id, NEW.provider_id);
  END IF;

  IF v_reviewee IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_reviewee AND role IN ('provider', 'both')
  ) THEN
    PERFORM refresh_provider_rating(v_reviewee);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reviews_refresh_rating ON reviews;
CREATE TRIGGER reviews_refresh_rating
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION on_review_change();

REVOKE ALL ON FUNCTION submit_work(UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION request_revision(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION accept_work(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_work(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION request_revision(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_work(UUID) TO authenticated;
