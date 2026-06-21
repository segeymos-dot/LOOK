-- Restore correct roles for seeded test accounts (customer was overwritten to provider).

UPDATE auth.users AS u
SET raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('full_name', 'Test Customer', 'role', 'customer')
WHERE u.email = 'customer@test.look';

UPDATE public.profiles AS p
SET
  full_name = 'Test Customer',
  role = 'customer'::public.user_role,
  is_platform_admin = false
FROM auth.users AS u
WHERE p.id = u.id AND u.email = 'customer@test.look';

UPDATE auth.users AS u
SET raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('full_name', 'Extended Test Provider', 'role', 'provider')
WHERE u.email = 'provider@test.look';

UPDATE public.profiles AS p
SET
  full_name = COALESCE(NULLIF(p.full_name, ''), 'Extended Test Provider'),
  role = 'provider'::public.user_role,
  is_platform_admin = false
FROM auth.users AS u
WHERE p.id = u.id AND u.email = 'provider@test.look';

UPDATE auth.users AS u
SET raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('full_name', 'LOOK Admin', 'role', 'both')
WHERE u.email = 'admin@test.look';

UPDATE public.profiles AS p
SET
  full_name = 'LOOK Admin',
  role = 'both'::public.user_role,
  is_platform_admin = true
FROM auth.users AS u
WHERE p.id = u.id AND u.email = 'admin@test.look';
