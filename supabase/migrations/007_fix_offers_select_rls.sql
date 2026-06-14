-- Ensure request owners can read offers via an explicit EXISTS join.
DROP POLICY IF EXISTS "Offers viewable by request owner and provider" ON public.offers;

CREATE POLICY "Offers viewable by request owner and provider"
  ON public.offers
  FOR SELECT
  USING (
    auth.uid() = provider_id
    OR EXISTS (
      SELECT 1
      FROM public.requests r
      WHERE r.id = offers.request_id
        AND r.customer_id = auth.uid()
    )
  );
