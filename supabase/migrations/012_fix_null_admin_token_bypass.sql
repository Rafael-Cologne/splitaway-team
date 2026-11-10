-- CRITICAL, found while testing migration 011: _sa_validate_admin() had a
-- classic SQL NULL-comparison bug. Its check was:
--   IF encode(digest(p_admin_token,'sha256'),'hex') != v_hash THEN RAISE ...
-- In SQL, any comparison against NULL evaluates to NULL, not TRUE/FALSE.
-- plpgsql's `IF <null> THEN` treats NULL as "don't run this branch" — same
-- as false. So calling any function that uses this check with
-- p_admin_token = NULL (simply omitting the argument, or passing null
-- explicitly) skipped the RAISE EXCEPTION entirely and let the function
-- return as if the token had validated successfully.
--
-- Impact: this silently bypassed admin_delete_trip() (already in
-- production before this session) AND the admin_delete_trip_by_member()
-- fix just applied in migrations 010/011 — for ANY trip, including ones
-- with a real admin_token_hash set. Verified live: created an isolated
-- test trip with a real hash, called
-- admin_delete_trip_by_member(invite_token, admin_name, null) with a
-- literal NULL token, and it deleted the trip — confirming the bypass is
-- real, not theoretical. This means every trip's real admin_delete_trip
-- RPC has likely been callable by any member with just the invite_token
-- (shared with everyone) and zero real token, for as long as that function
-- has existed — the earlier migration 007 fix (schema-qualifying digest())
-- only fixed the case where a token WAS supplied; it did not address this
-- separate NULL-bypass path.
--
-- Fix: explicitly reject a NULL token once a real hash exists for the
-- trip, before ever reaching the digest comparison. The existing
-- backward-compat behavior for legacy trips with no hash set at all
-- (v_hash IS NULL) is unchanged — those still short-circuit-return before
-- this new check, exactly as before.

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
  -- Fix: a NULL/missing token must never pass once a real hash exists —
  -- otherwise the comparison below is NULL and the RAISE is silently skipped.
  IF p_admin_token IS NULL THEN
    RAISE EXCEPTION 'invalid_admin_token' USING ERRCODE = 'P0002';
  END IF;
  IF encode(extensions.digest(p_admin_token, 'sha256'), 'hex') != v_hash THEN
    RAISE EXCEPTION 'invalid_admin_token' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;
