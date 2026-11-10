-- Found while testing migration 010: admin_delete_trip_by_member declares
-- p_invite_token as `uuid`, but trip_tokens.invite_token is a `text` column
-- (confirmed via information_schema — every other RPC in this app declares
-- this parameter as text and matches the column type). Comparing a text
-- column to a uuid-typed variable has no operator in Postgres and raises
-- "operator does not exist: text = uuid" at runtime.
--
-- This is a PRE-EXISTING bug, not something introduced by migration 010 —
-- the original function (documented verbatim in migration 004) had the
-- identical `WHERE invite_token = p_invite_token` line with the same uuid
-- parameter type. In practice this means "fallback path 2" in deleteTrip()
-- has likely never successfully executed for ANY caller, legitimate or
-- attacker — every call errored before reaching the (now-fixed) admin
-- check, silently falling through to deleteTrip()'s "path 3" legacy delete
-- attempt instead. This does not change the severity assessment of the
-- migration-010 fix (the vulnerable logic was real and worth closing
-- regardless), but it does mean the function needs this additional fix to
-- actually work at all — otherwise migration 010 secured a function that
-- still can't run.
--
-- Fix: change the parameter type to text, matching every sibling RPC
-- (_sa_validate_invite, sync_trip_data, admin_delete_trip, etc.) and the
-- actual column type. Changing a parameter's type also changes the
-- function's identity, so the uuid-typed version from migration 010 must
-- be dropped explicitly first (same overload-avoidance reasoning as 010's
-- own comment).

DROP FUNCTION IF EXISTS public.admin_delete_trip_by_member(uuid, text, text);

CREATE FUNCTION public.admin_delete_trip_by_member(
  p_invite_token text,
  p_member_name text,
  p_admin_token text
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trip_id TEXT;
  v_is_admin BOOLEAN;
BEGIN
  SELECT trip_id INTO v_trip_id
  FROM trip_tokens WHERE invite_token = p_invite_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_invite_token' USING ERRCODE = 'P0001';
  END IF;

  PERFORM _sa_validate_admin(v_trip_id, p_admin_token);

  SELECT is_admin INTO v_is_admin
  FROM members
  WHERE trip_id = v_trip_id AND name = p_member_name AND is_admin = TRUE;

  IF NOT FOUND OR NOT v_is_admin THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM trips WHERE id = v_trip_id;

  RETURN json_build_object('ok', true, 'trip_id', v_trip_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_delete_trip_by_member(text, text, text) TO anon, authenticated;
