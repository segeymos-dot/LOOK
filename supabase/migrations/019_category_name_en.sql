-- Bilingual category names for demo / seed data
ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_en TEXT;

UPDATE categories SET name_en = 'Home Repair & Construction' WHERE slug = 'repair';
UPDATE categories SET name_en = 'IT & Software Development' WHERE slug = 'it';
UPDATE categories SET name_en = 'Design' WHERE slug = 'design';
UPDATE categories SET name_en = 'Education' WHERE slug = 'education';
UPDATE categories SET name_en = 'Beauty & Wellness' WHERE slug = 'beauty';
UPDATE categories SET name_en = 'Transport & Delivery' WHERE slug = 'transport';
UPDATE categories SET name_en = 'Photo & Video' WHERE slug = 'photo';
UPDATE categories SET name_en = 'Legal Services' WHERE slug = 'legal';
UPDATE categories SET name_en = 'Other' WHERE slug = 'other';

-- Fallback: copy Russian name where EN not set
UPDATE categories SET name_en = name WHERE name_en IS NULL;
