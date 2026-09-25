CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid := auth.uid();
  _meta jsonb;
BEGIN
  IF _id IS NULL THEN
    RETURN;
  END IF;

  SELECT raw_user_meta_data INTO _meta FROM auth.users WHERE id = _id;

  INSERT INTO public.profiles (id, display_name, username, phone)
  VALUES (
    _id,
    COALESCE(
      NULLIF(_meta->>'display_name', ''),
      NULLIF(_meta->>'username', ''),
      'Player'
    ),
    NULLIF(lower(_meta->>'username'), ''),
    NULLIF(regexp_replace(COALESCE(_meta->>'phone', ''), '[^0-9+]', '', 'g'), '')
  )
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles p
     SET username = COALESCE(p.username, NULLIF(lower(_meta->>'username'), '')),
         phone    = COALESCE(p.phone, NULLIF(regexp_replace(COALESCE(_meta->>'phone', ''), '[^0-9+]', '', 'g'), '')),
         display_name = COALESCE(NULLIF(p.display_name, ''), NULLIF(_meta->>'display_name', ''), NULLIF(_meta->>'username', ''), 'Player')
   WHERE p.id = _id
     AND (p.username IS NULL OR p.phone IS NULL OR p.display_name IS NULL OR p.display_name = '');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_profile() TO authenticated, service_role;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (id, display_name, username, phone)
SELECT
  u.id,
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'display_name', ''),
    NULLIF(u.raw_user_meta_data->>'username', ''),
    'Player'
  ),
  NULLIF(lower(u.raw_user_meta_data->>'username'), ''),
  NULLIF(regexp_replace(COALESCE(u.raw_user_meta_data->>'phone', ''), '[^0-9+]', '', 'g'), '')
FROM auth.users u
WHERE u.deleted_at IS NULL
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles p
   SET username = NULLIF(lower(u.raw_user_meta_data->>'username'), ''),
       phone    = COALESCE(p.phone, NULLIF(regexp_replace(COALESCE(u.raw_user_meta_data->>'phone', ''), '[^0-9+]', '', 'g'), '')),
       display_name = COALESCE(NULLIF(p.display_name, ''), NULLIF(u.raw_user_meta_data->>'display_name', ''), NULLIF(u.raw_user_meta_data->>'username', ''), 'Player')
  FROM auth.users u
 WHERE u.id = p.id
   AND p.username IS NULL
   AND NULLIF(lower(u.raw_user_meta_data->>'username'), '') IS NOT NULL;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'user'
FROM auth.users u
WHERE u.deleted_at IS NULL
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.profiles p
   SET needs_email = true
  FROM auth.users u
 WHERE u.id = p.id
   AND lower(u.email) LIKE '%@moobit.app';
