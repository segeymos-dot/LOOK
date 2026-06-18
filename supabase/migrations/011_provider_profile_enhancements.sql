-- Provider profile enhancements: portfolio JSON, reviews, stats, storage

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS portfolio_items JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS completed_orders_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.portfolio_items IS 'Array of {id, title, description, image_url, link}';
COMMENT ON COLUMN profiles.completed_orders_count IS 'Number of completed orders as provider';

-- Reviews
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  request_id UUID REFERENCES requests(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_provider_id ON reviews(provider_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews are viewable by everyone"
  ON reviews FOR SELECT USING (true);

CREATE POLICY "Customers can create reviews for completed requests"
  ON reviews FOR INSERT
  WITH CHECK (
    auth.uid() = reviewer_id
    AND EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = request_id
        AND r.customer_id = auth.uid()
        AND r.status = 'completed'
    )
  );

-- Recompute provider rating on review changes
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
      SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE provider_id = p_provider_id
    ), 0),
    reviews_count = (
      SELECT COUNT(*)::integer FROM reviews WHERE provider_id = p_provider_id
    ),
    updated_at = NOW()
  WHERE id = p_provider_id;
END;
$$;

CREATE OR REPLACE FUNCTION on_review_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_provider_rating(OLD.provider_id);
    RETURN OLD;
  END IF;
  PERFORM refresh_provider_rating(NEW.provider_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reviews_refresh_rating ON reviews;
CREATE TRIGGER reviews_refresh_rating
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION on_review_change();

-- Storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portfolio',
  'portfolio',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Avatars storage policies
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Portfolio storage policies
CREATE POLICY "Portfolio images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'portfolio');

CREATE POLICY "Users can upload own portfolio images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'portfolio'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own portfolio images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'portfolio'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own portfolio images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'portfolio'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
