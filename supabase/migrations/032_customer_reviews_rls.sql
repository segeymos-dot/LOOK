-- Customer-only reviews for completed orders (one review per order).
-- Safe to re-run: DROP POLICY IF EXISTS / CREATE OR REPLACE / IF NOT EXISTS.

-- Ensure reviewee_id is populated for legacy rows.
UPDATE public.reviews
SET reviewee_id = provider_id
WHERE reviewee_id IS NULL
  AND provider_id IS NOT NULL;

-- Prefer the customer's review of the accepted provider when mutual reviews exist.
WITH ranked AS (
  SELECT
    r.id,
    ROW_NUMBER() OVER (
      PARTITION BY r.request_id
      ORDER BY
        CASE
          WHEN r.reviewer_id = req.customer_id
           AND r.reviewee_id = o.provider_id THEN 0
          ELSE 1
        END,
        r.created_at ASC
    ) AS rn
  FROM public.reviews r
  JOIN public.requests req ON req.id = r.request_id
  LEFT JOIN public.offers o
    ON o.request_id = r.request_id
   AND o.status = 'accepted'
  WHERE r.request_id IS NOT NULL
)
DELETE FROM public.reviews r
USING ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1;

-- One review per order (customer-only model).
ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_request_id_reviewer_id_key;

DROP INDEX IF EXISTS public.reviews_one_per_request_idx;
CREATE UNIQUE INDEX reviews_one_per_request_idx
  ON public.reviews (request_id)
  WHERE request_id IS NOT NULL;

-- Replace INSERT policies (historical + mutual-review names).
DROP POLICY IF EXISTS "Customers can create reviews for completed requests" ON public.reviews;
DROP POLICY IF EXISTS "Order parties can create reviews for completed requests" ON public.reviews;

CREATE POLICY "Customers can create reviews for completed requests"
  ON public.reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = reviewer_id
    AND reviewee_id IS NOT NULL
    AND provider_id IS NOT NULL
    AND reviewee_id = provider_id
    AND reviewee_id <> auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.requests r
      JOIN public.offers o
        ON o.request_id = r.id
       AND o.status = 'accepted'
      WHERE r.id = request_id
        AND r.customer_id = auth.uid()
        AND r.status = 'completed'
        AND o.provider_id = reviewee_id
        AND o.provider_id = provider_id
    )
  );

-- Keep public read; reassert if missing on some envs.
DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON public.reviews;
CREATE POLICY "Reviews are viewable by everyone"
  ON public.reviews
  FOR SELECT
  USING (true);

-- Rating aggregation by reviewee (provider being rated).
CREATE OR REPLACE FUNCTION public.refresh_provider_rating(p_provider_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    rating = COALESCE((
      SELECT ROUND(AVG(rating)::numeric, 2)
      FROM public.reviews
      WHERE reviewee_id = p_provider_id
    ), 0),
    reviews_count = (
      SELECT COUNT(*)::integer
      FROM public.reviews
      WHERE reviewee_id = p_provider_id
    ),
    updated_at = NOW()
  WHERE id = p_provider_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_review_change()
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
    SELECT 1
    FROM public.profiles
    WHERE id = v_reviewee
      AND role IN ('provider', 'both')
  ) THEN
    PERFORM public.refresh_provider_rating(v_reviewee);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reviews_refresh_rating ON public.reviews;
CREATE TRIGGER reviews_refresh_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.on_review_change();

-- Refresh ratings for providers that already have reviews.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT COALESCE(reviewee_id, provider_id) AS pid
    FROM public.reviews
    WHERE COALESCE(reviewee_id, provider_id) IS NOT NULL
  LOOP
    PERFORM public.refresh_provider_rating(rec.pid);
  END LOOP;
END;
$$;
