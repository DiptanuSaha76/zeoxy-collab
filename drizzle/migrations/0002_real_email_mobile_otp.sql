-- Real email + mobile OTP registration, password login without OTP.
--
-- New accounts are created by the server only after the mobile OTP is verified
-- (supabase.auth.admin.createUser with the user's real email). Nothing here
-- deletes users or rewrites existing profiles.

-- Password check for username/mobile login uses pgcrypto's crypt() (bcrypt,
-- the same hashes Supabase Auth stores). Supabase installs it in "extensions"
-- by default; this is a no-op when it is already there.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1. Pending registrations: one row per "send me a code" until it is verified.
--    The password is never stored here; the browser sends it again on verify.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.registration_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  display_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  code_hash text NOT NULL,
  attempts smallint NOT NULL DEFAULT 0,
  send_count smallint NOT NULL DEFAULT 1,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT registration_otps_username_format CHECK (username ~ '^[a-z0-9_]{3,24}$'),
  CONSTRAINT registration_otps_email_lower CHECK (email = lower(email)),
  CONSTRAINT registration_otps_phone_e164 CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),
  CONSTRAINT registration_otps_attempts_valid CHECK (attempts >= 0)
);
CREATE INDEX IF NOT EXISTS registration_otps_phone_idx ON public.registration_otps (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS registration_otps_created_idx ON public.registration_otps (created_at);

ALTER TABLE public.registration_otps ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the server (secret key) may touch this table.
REVOKE ALL ON public.registration_otps FROM anon, authenticated;
GRANT ALL ON public.registration_otps TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Rate-limit log (OTP sends per mobile / per IP, login attempts). Keys are
--    HMAC hashes, never raw phone numbers or IPs. Kept in the database because
--    the site runs on serverless workers with no shared memory.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auth_rate_events (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  key_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_rate_events_kind CHECK (kind IN ('otp_send_ip', 'otp_send_phone', 'login_ip', 'login_identifier'))
);
CREATE INDEX IF NOT EXISTS auth_rate_events_lookup_idx ON public.auth_rate_events (kind, key_hash, created_at DESC);

ALTER TABLE public.auth_rate_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_rate_events FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.auth_rate_events_id_seq FROM anon, authenticated;
GRANT ALL ON public.auth_rate_events TO service_role;
GRANT ALL ON SEQUENCE public.auth_rate_events_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Server-only helper functions (EXECUTE revoked from anon/authenticated).
-- ---------------------------------------------------------------------------

-- Counts a code attempt atomically BEFORE the code is compared, so parallel
-- guesses cannot exceed the attempt limit.
CREATE OR REPLACE FUNCTION public.registration_otp_attempt(_id uuid)
RETURNS TABLE (attempts smallint, code_hash text, expires_at timestamptz, consumed_at timestamptz)
LANGUAGE sql
SET search_path TO 'public'
AS $function$
  UPDATE public.registration_otps r
     SET attempts = r.attempts + 1
   WHERE r.id = _id
  RETURNING r.attempts, r.code_hash, r.expires_at, r.consumed_at
$function$;

-- Is this email already used by an auth account? (Emails live in auth.users.)
CREATE OR REPLACE FUNCTION public.auth_email_in_use(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(btrim(_email)))
$function$;

-- Auth account id for an email (admin "add admin by email").
CREATE OR REPLACE FUNCTION public.auth_user_id_by_email(_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT u.id FROM auth.users u WHERE lower(u.email) = lower(btrim(_email)) LIMIT 1
$function$;

-- Username / mobile login. Returns the account's sign-in email ONLY when the
-- password is correct, so emails are never revealed to someone who doesn't
-- already know the password. The browser then signs in normally with Supabase
-- Auth. Works for accounts with a real email and for older accounts alike.
-- _phones holds the normalized mobile plus the older digits-only forms.
CREATE OR REPLACE FUNCTION public.resolve_login_email(_username text, _phones text[], _password text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row record;
  _matched boolean := false;
BEGIN
  IF _password IS NULL OR _password = '' THEN
    RETURN NULL;
  END IF;

  FOR _row IN
    SELECT u.email, u.encrypted_password
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
     WHERE (_username IS NOT NULL AND p.username IS NOT NULL AND lower(p.username) = lower(btrim(_username)))
        OR (_phones IS NOT NULL AND p.phone IS NOT NULL AND p.phone = ANY (_phones))
     LIMIT 3
  LOOP
    _matched := true;
    IF _row.encrypted_password IS NOT NULL
       AND _row.encrypted_password <> ''
       AND extensions.crypt(_password, _row.encrypted_password) = _row.encrypted_password THEN
      RETURN _row.email;
    END IF;
  END LOOP;

  IF NOT _matched THEN
    -- Same bcrypt work when nothing matched, so timing doesn't reveal accounts.
    PERFORM extensions.crypt(_password, '$2a$10$BVC/cI0IBOJ5imlHbm/qtOJbXPeM.ogJuwR50fKzmq8MsHSbzDtSm');
  END IF;
  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION public.registration_otp_attempt(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auth_email_in_use(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auth_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_login_email(text, text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registration_otp_attempt(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_email_in_use(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_user_id_by_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_login_email(text, text[], text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Remove the public username/phone -> email lookup. With real emails it
--    would let anyone read any user's email address. Login now resolves
--    usernames/mobiles on the server (resolve_login_email above).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.login_email(text);

-- ---------------------------------------------------------------------------
-- 5. New-user trigger: keep the '+' of E.164 mobiles, and never derive a
--    display name from the email address.
-- ---------------------------------------------------------------------------
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
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'username', ''),
      'Player'
    ),
    NULLIF(lower(NEW.raw_user_meta_data->>'username'), ''),
    NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'phone', ''), '[^0-9+]', '', 'g'), '')
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Existing accounts created with the old generated sign-in address.
--    They keep working (username / mobile + password). The flag lets the site
--    ask them once, after they log in, to add their real email. This is the
--    only place the old address pattern is referenced, to find those accounts.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS needs_email boolean NOT NULL DEFAULT false;

UPDATE public.profiles p
   SET needs_email = true
  FROM auth.users u
 WHERE u.id = p.id
   AND lower(u.email) LIKE '%@moobit.app'
   AND p.needs_email = false;

-- ---------------------------------------------------------------------------
-- 7. Admin invites that no account has claimed yet. Accounts are created
--    without an email-confirmation step, so an unclaimed invite could be
--    claimed by anyone who registers with that email and would make them
--    admin. Admins are now added only from existing accounts (by username or
--    email), so remove the unclaimed invites. Claimed invites are untouched.
-- ---------------------------------------------------------------------------
DELETE FROM public.admin_invites i
 WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(i.email));
