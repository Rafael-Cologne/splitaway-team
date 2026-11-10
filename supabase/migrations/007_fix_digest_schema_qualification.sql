-- Pre-existing bug found while testing migration 006 (admin_token_gate_for_role_changes):
-- _sa_validate_admin() has "SET search_path TO 'public'" (correct — security
-- hardening against search_path injection), but pgcrypto's digest() function
-- lives in the "extensions" schema on this project, not "public". With
-- search_path locked to just 'public', digest() was unresolvable inside this
-- function, so EVERY call to _sa_validate_admin() with a non-null token raised
-- "function digest(text, unknown) does not exist" instead of actually checking
-- the token. This silently broke real admin-token verification for BOTH
-- admin_delete_trip() and the sync_trip_data() admin-gating just added in
-- migration 006 — any admin token, valid or not, hit this error (caught as a
-- generic exception and treated as "invalid"), so legitimate admin actions
-- failed exactly like attacker attempts did. Fix: schema-qualify the call.
--
-- Verified against production with an isolated throwaway test trip (created
-- and fully deleted in the same session): no-token and wrong-token attempts
-- to flip is_admin were rejected, the correct admin_token successfully
-- promoted a member to admin, and admin_delete_trip() cleanup then succeeded.

CREATE OR REPLACE FUNCTION public._sa_validate_admin(p_trip_id text, p_admin_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_hash TEXT;
BEGIN
  SELECT admin_token_hash INTO v_hash FROM trip_tokens WHERE trip_id = p_trip_id;
  -- NULL hash = старая поездка без защиты (backward compat) — пропускаем
  IF v_hash IS NULL THEN RETURN; END IF;
  IF encode(extensions.digest(p_admin_token, 'sha256'), 'hex') != v_hash THEN
    RAISE EXCEPTION 'invalid_admin_token' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;
