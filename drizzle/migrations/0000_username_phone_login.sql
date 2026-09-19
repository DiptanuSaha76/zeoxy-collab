ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS phone text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles (lower(username)) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_key ON public.profiles (phone) WHERE phone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name, username, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NULLIF(lower(NEW.raw_user_meta_data->>'username'), ''),
    NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'phone', ''), '[^0-9]', '', 'g'), '')
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.login_email(_identifier text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT lower(p.username) || '@moobit.app'
  FROM public.profiles p
  WHERE p.username IS NOT NULL
    AND (
      lower(p.username) = lower(btrim(_identifier))
      OR (p.phone IS NOT NULL AND p.phone = regexp_replace(_identifier, '[^0-9]', '', 'g'))
    )
  LIMIT 1
$function$;

GRANT EXECUTE ON FUNCTION public.login_email(text) TO anon, authenticated;

INSERT INTO public.admin_invites (email) VALUES ('moobit_69@moobit.app')
ON CONFLICT DO NOTHING;
