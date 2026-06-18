-- Extended profile fields for customer/provider registration
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS skills TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS portfolio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS provider_category_slugs TEXT[] DEFAULT '{}';

COMMENT ON COLUMN profiles.phone IS 'Contact phone number';
COMMENT ON COLUMN profiles.skills IS 'Comma-separated skills for providers';
COMMENT ON COLUMN profiles.portfolio IS 'Portfolio description or links for providers';
COMMENT ON COLUMN profiles.provider_category_slugs IS 'Category slugs the provider works in';
