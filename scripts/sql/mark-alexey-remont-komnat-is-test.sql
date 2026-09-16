-- LOOK: diagnose + safely mark Alexey E2E order "Ремонт комнат" as is_test
-- Run in Supabase SQL Editor (production project qdiyorwbtffknsstmxju).
-- Does NOT create a payment. Does NOT touch Stripe.

-- 1) DIAGNOSE
WITH customer AS (
  SELECT id, email
  FROM auth.users
  WHERE lower(email) = lower('hostel343@gmail.com')
  LIMIT 1
),
provider AS (
  SELECT id, email
  FROM auth.users
  WHERE lower(email) = lower('irina400@yahoo.com')
  LIMIT 1
),
orders AS (
  SELECT
    r.id,
    r.title,
    r.status,
    r.customer_id,
    r.order_payment_status,
    r.is_test,
    r.payment_provider_name,
    r.payment_transaction_id,
    r.payout_status,
    r.created_at,
    r.updated_at,
    c.email AS customer_email,
    o.id AS accepted_offer_id,
    o.provider_id AS selected_provider_id,
    o.price AS accepted_price,
    o.status AS offer_status,
    p.email AS selected_provider_email,
    EXISTS (
      SELECT 1 FROM public.payments pay WHERE pay.request_id = r.id
    ) AS payment_row_exists
  FROM public.requests r
  JOIN customer c ON c.id = r.customer_id
  LEFT JOIN public.offers o
    ON o.request_id = r.id AND o.status = 'accepted'
  LEFT JOIN auth.users p ON p.id = o.provider_id
  WHERE r.title ILIKE '%Ремонт комнат%'
  ORDER BY r.created_at DESC
)
SELECT * FROM orders;

-- 2) SAFELY MARK is_test = true (mirrors set_request_is_test gates)
-- Only if: owner = hostel343, unpaid/open|in_progress, no paid payment, not already test.
UPDATE public.requests r
SET is_test = true,
    updated_at = NOW()
FROM auth.users u
WHERE r.customer_id = u.id
  AND lower(u.email) = lower('hostel343@gmail.com')
  AND r.title ILIKE '%Ремонт комнат%'
  AND r.is_test IS NOT TRUE
  AND r.status IN ('open', 'in_progress')
  AND COALESCE(r.order_payment_status, 'unpaid') IN ('unpaid', 'payment_pending')
  AND NOT EXISTS (
    SELECT 1
    FROM public.payments pay
    WHERE pay.request_id = r.id
      AND pay.status = 'paid'
  )
  AND (
    r.payment_provider_name IS NULL
    OR r.payment_provider_name = ''
    OR r.payment_provider_name = 'look_test'
  )
RETURNING
  r.id,
  r.title,
  r.status,
  r.order_payment_status,
  r.is_test,
  r.payment_provider_name;

-- 3) VERIFY after mark
SELECT
  r.id,
  r.title,
  r.status,
  r.order_payment_status,
  r.is_test,
  r.payment_provider_name,
  EXISTS (SELECT 1 FROM public.payments pay WHERE pay.request_id = r.id) AS payment_row_exists
FROM public.requests r
JOIN auth.users u ON u.id = r.customer_id
WHERE lower(u.email) = lower('hostel343@gmail.com')
  AND r.title ILIKE '%Ремонт комнат%'
ORDER BY r.created_at DESC;
