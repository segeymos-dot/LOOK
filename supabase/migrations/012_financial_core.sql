-- LOOK financial core (test mode, no Stripe)
-- Tables: payments, transactions, provider_balances, platform_commissions, payouts

-- Enums
DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM (
    'order_payment',
    'platform_commission',
    'provider_earning',
    'provider_payout',
    'refund'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'failed', 'reversed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payout_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Platform admin flag
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;

-- Platform settings (commission rate, etc.)
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_settings (key, value)
VALUES ('commission_rate', '0.15')
ON CONFLICT (key) DO NOTHING;

-- Payments (one per request)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_gross NUMERIC(12, 2) NOT NULL CHECK (amount_gross > 0),
  platform_fee NUMERIC(12, 2) NOT NULL CHECK (platform_fee >= 0),
  provider_amount NUMERIC(12, 2) NOT NULL CHECK (provider_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status payment_status NOT NULL DEFAULT 'pending',
  payment_method TEXT NOT NULL DEFAULT 'test',
  external_reference TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id),
  CHECK (amount_gross = platform_fee + provider_amount)
);

CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON payments(provider_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Platform commissions ledger
CREATE TABLE IF NOT EXISTS platform_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  gross_amount NUMERIC(12, 2) NOT NULL,
  commission_rate NUMERIC(6, 4) NOT NULL,
  commission_amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payment_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_commissions_request ON platform_commissions(request_id);

-- Provider balances (denormalized)
CREATE TABLE IF NOT EXISTS provider_balances (
  provider_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  available_balance NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  pending_payout NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (pending_payout >= 0),
  total_earned NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_earned >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payouts
CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status payout_status NOT NULL DEFAULT 'pending',
  payment_method TEXT NOT NULL DEFAULT 'test',
  external_reference TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payouts_provider ON payouts(provider_id);

-- Transactions (immutable ledger)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  payout_id UUID REFERENCES payouts(id) ON DELETE SET NULL,
  request_id UUID REFERENCES requests(id) ON DELETE SET NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  type transaction_type NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status transaction_status NOT NULL DEFAULT 'completed',
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_provider ON transactions(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

-- Triggers updated_at
DROP TRIGGER IF EXISTS payments_updated_at ON payments;
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS payouts_updated_at ON payouts;
CREATE TRIGGER payouts_updated_at BEFORE UPDATE ON payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Helpers
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION get_platform_commission_rate()
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(
      (SELECT value FROM platform_settings WHERE key = 'commission_rate'),
      ''
    )::NUMERIC,
    0.15
  );
$$;

-- RLS
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

-- platform_settings: admin read only
DROP POLICY IF EXISTS "Admins can view platform settings" ON platform_settings;
CREATE POLICY "Admins can view platform settings"
  ON platform_settings FOR SELECT
  USING (is_platform_admin());

-- payments
DROP POLICY IF EXISTS "Payment parties and admins can view payments" ON payments;
CREATE POLICY "Payment parties and admins can view payments"
  ON payments FOR SELECT
  USING (
    auth.uid() = customer_id
    OR auth.uid() = provider_id
    OR is_platform_admin()
  );

-- transactions
DROP POLICY IF EXISTS "Users see own transactions" ON transactions;
CREATE POLICY "Users see own transactions"
  ON transactions FOR SELECT
  USING (
    auth.uid() = user_id
    OR auth.uid() = provider_id
    OR is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM payments p
      WHERE p.id = transactions.payment_id
        AND (p.customer_id = auth.uid() OR p.provider_id = auth.uid())
    )
  );

-- provider_balances
DROP POLICY IF EXISTS "Providers see own balance" ON provider_balances;
CREATE POLICY "Providers see own balance"
  ON provider_balances FOR SELECT
  USING (auth.uid() = provider_id OR is_platform_admin());

-- platform_commissions
DROP POLICY IF EXISTS "Admins view platform commissions" ON platform_commissions;
CREATE POLICY "Admins view platform commissions"
  ON platform_commissions FOR SELECT
  USING (is_platform_admin());

-- payouts
DROP POLICY IF EXISTS "Providers and admins view payouts" ON payouts;
CREATE POLICY "Providers and admins view payouts"
  ON payouts FOR SELECT
  USING (auth.uid() = provider_id OR is_platform_admin());

-- Simulate test payment (customer pays accepted offer while in_progress)
CREATE OR REPLACE FUNCTION simulate_test_payment(p_request_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
  v_status request_status;
  v_offer offers%ROWTYPE;
  v_rate NUMERIC;
  v_gross NUMERIC(12, 2);
  v_fee NUMERIC(12, 2);
  v_provider_amount NUMERIC(12, 2);
  v_payment_id UUID;
  v_existing payment_status;
BEGIN
  SELECT r.customer_id, r.status
  INTO v_customer_id, v_status
  FROM requests r
  WHERE r.id = p_request_id;

  IF v_customer_id IS NULL OR v_customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Payment is only available for orders in progress';
  END IF;

  SELECT status INTO v_existing
  FROM payments
  WHERE request_id = p_request_id;

  IF v_existing = 'paid' THEN
    RAISE EXCEPTION 'Order already paid';
  END IF;

  SELECT o.* INTO v_offer
  FROM offers o
  WHERE o.request_id = p_request_id
    AND o.status = 'accepted'
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
    p_request_id, v_offer.id, v_customer_id, v_offer.provider_id,
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
    (v_payment_id, p_request_id, v_customer_id, 'order_payment', v_gross, v_offer.currency,
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

  RETURN json_build_object(
    'payment_id', v_payment_id,
    'request_id', p_request_id,
    'amount_gross', v_gross,
    'platform_fee', v_fee,
    'provider_amount', v_provider_amount,
    'commission_rate', v_rate,
    'currency', v_offer.currency,
    'status', 'paid'
  );
END;
$$;

-- Simulate test payout (provider withdraws available balance)
CREATE OR REPLACE FUNCTION simulate_test_payout(p_amount NUMERIC DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider_id UUID := auth.uid();
  v_balance provider_balances%ROWTYPE;
  v_amount NUMERIC(12, 2);
  v_payout_id UUID;
BEGIN
  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_balance FROM provider_balances WHERE provider_id = v_provider_id;

  IF v_balance.provider_id IS NULL OR v_balance.available_balance <= 0 THEN
    RAISE EXCEPTION 'No available balance for payout';
  END IF;

  v_amount := COALESCE(p_amount, v_balance.available_balance);

  IF v_amount <= 0 OR v_amount > v_balance.available_balance THEN
    RAISE EXCEPTION 'Invalid payout amount';
  END IF;

  INSERT INTO payouts (provider_id, amount, currency, status, payment_method, processed_at)
  VALUES (v_provider_id, v_amount, v_balance.currency, 'completed', 'test', NOW())
  RETURNING id INTO v_payout_id;

  UPDATE provider_balances SET
    available_balance = available_balance - v_amount,
    pending_payout = 0,
    updated_at = NOW()
  WHERE provider_id = v_provider_id;

  INSERT INTO transactions (
    payout_id, user_id, provider_id, type, amount, currency, description, metadata
  )
  VALUES (
    v_payout_id, v_provider_id, v_provider_id, 'provider_payout', v_amount, v_balance.currency,
    'Тестовая выплата исполнителю',
    jsonb_build_object('payout_id', v_payout_id)
  );

  RETURN json_build_object(
    'payout_id', v_payout_id,
    'amount', v_amount,
    'currency', v_balance.currency,
    'status', 'completed'
  );
END;
$$;

-- Refund test payment (admin or customer before completion)
CREATE OR REPLACE FUNCTION simulate_test_refund(p_request_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment payments%ROWTYPE;
BEGIN
  SELECT * INTO v_payment
  FROM payments
  WHERE request_id = p_request_id AND status = 'paid';

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Paid payment not found';
  END IF;

  IF auth.uid() <> v_payment.customer_id AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized to refund';
  END IF;

  UPDATE payments SET status = 'refunded', updated_at = NOW()
  WHERE id = v_payment.id;

  UPDATE provider_balances SET
    available_balance = GREATEST(0, available_balance - v_payment.provider_amount),
    total_earned = GREATEST(0, total_earned - v_payment.provider_amount),
    updated_at = NOW()
  WHERE provider_id = v_payment.provider_id;

  INSERT INTO transactions (
    payment_id, request_id, user_id, provider_id, type, amount, currency, status, description
  )
  VALUES (
    v_payment.id, p_request_id, v_payment.customer_id, v_payment.provider_id,
    'refund', v_payment.amount_gross, v_payment.currency, 'completed',
    'Тестовый возврат средств'
  );

  RETURN json_build_object('payment_id', v_payment.id, 'status', 'refunded');
END;
$$;

-- Update complete_request: increment provider completed_orders_count
CREATE OR REPLACE FUNCTION complete_request(p_request_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status request_status;
  v_provider_id UUID;
BEGIN
  SELECT r.status, o.provider_id
  INTO v_status, v_provider_id
  FROM requests r
  LEFT JOIN offers o ON o.request_id = r.id AND o.status = 'accepted'
  WHERE r.id = p_request_id
    AND r.customer_id = auth.uid();

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Request must be in progress to complete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM payments
    WHERE request_id = p_request_id AND status = 'paid'
  ) THEN
    RAISE EXCEPTION 'Order must be paid before completion';
  END IF;

  UPDATE requests
  SET status = 'completed', updated_at = NOW()
  WHERE id = p_request_id;

  IF v_provider_id IS NOT NULL THEN
    UPDATE profiles
    SET completed_orders_count = completed_orders_count + 1,
        updated_at = NOW()
    WHERE id = v_provider_id;
  END IF;

  RETURN json_build_object('request_id', p_request_id, 'status', 'completed');
END;
$$;

REVOKE ALL ON FUNCTION simulate_test_payment(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION simulate_test_payout(NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION simulate_test_refund(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulate_test_payment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION simulate_test_payout(NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION simulate_test_refund(UUID) TO authenticated;

-- Seed platform admin user
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmation_token, recovery_token,
  email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(), 'authenticated', 'authenticated',
  'admin@test.look', crypt('Test1234!', gen_salt('bf')), NOW(),
  '', '', '', '',
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"LOOK Admin","role":"both"}', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@test.look');

INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT u.id, u.id,
  format('{"sub":"%s","email":"admin@test.look"}', u.id)::jsonb,
  'email', NOW(), NOW(), NOW()
FROM auth.users u
WHERE u.email = 'admin@test.look'
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
  );

INSERT INTO public.profiles (id, full_name, role, is_platform_admin)
SELECT u.id, 'LOOK Admin', 'both'::public.user_role, true
FROM auth.users u
WHERE u.email = 'admin@test.look'
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

UPDATE public.profiles p SET
  full_name = 'LOOK Admin',
  is_platform_admin = true
FROM auth.users u
WHERE p.id = u.id AND u.email = 'admin@test.look';
