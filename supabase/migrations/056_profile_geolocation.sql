-- Geolocation foundation on profiles (one location per auth user).
-- Does not change public SELECT policies; lat/lng must never be exposed
-- via public provider card selects in application code.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_accuracy_m DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS country_code TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS location_source TEXT,
  ADD COLUMN IF NOT EXISTS location_permission_state TEXT,
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_location_source_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_location_source_check
      CHECK (
        location_source IS NULL
        OR location_source IN ('gps', 'manual', 'unknown')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_location_permission_state_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_location_permission_state_check
      CHECK (
        location_permission_state IS NULL
        OR location_permission_state IN ('prompt', 'granted', 'denied')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_latitude_range_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_latitude_range_check
      CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_longitude_range_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_longitude_range_check
      CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.latitude IS
  'Precise GPS latitude — never expose on public profiles.';
COMMENT ON COLUMN public.profiles.longitude IS
  'Precise GPS longitude — never expose on public profiles.';
COMMENT ON COLUMN public.profiles.location_source IS
  'gps | manual | unknown — single location for customer/provider/both.';
COMMENT ON COLUMN public.profiles.location_permission_state IS
  'Browser/OS permission state as last known by LOOK: prompt|granted|denied.';

-- Existing RLS already allows: UPDATE own row WHERE auth.uid() = id.
-- No column-level grants needed; application must not select lat/lng publicly.
