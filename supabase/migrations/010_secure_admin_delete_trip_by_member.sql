-- CRITICAL finding from a final Harness verification pass (adversarially
-- confirmed): admin_delete_trip_by_member(p_invite_token, p_member_name) —
-- the "fallback path 2" RPC called from deleteTrip() in public/index.html —
-- never validated admin_token at all. It only checked that the supplied
-- p_member_name happened to have is_admin=true in the members table. Since
-- invite_token is shared with every member of a trip (required just to use
-- the app), and the admin's display name is visible to every member in the
-- UI, ANY member could call this RPC directly (bypassing the client's
-- isTripAdmin() UI gate entirely via devtools) and permanently delete the
-- entire trip for everyone, with zero proof of actually being that admin.
-- This is strictly worse than the sync_trip_data self-promotion bug fixed
-- earlier this session (migration 006) — it's irreversible destruction, not
-- a reversible role flip — and was missed by every prior audit round
-- because this migration (004) was framed as pure documentation of an
-- existing function, not a fresh security review of its logic.
--
-- Fix: require admin_token and validate it via _sa_validate_admin(), the
-- exact same check admin_delete_trip() (the "path 1", already-secure
-- sibling) already uses. Adding a third parameter changes the function's
-- signature, so the old 2-arg overload must be explicitly DROPped first —
-- otherwise it would keep existing as a second, still-vulnerable overload
-- alongside the new one (this exact overload trap was flagged and avoided
-- during migration 006 by embedding the token in an existing jsonb payload
-- instead; this function has no such payload to embed into, so an explicit
-- DROP is the correct way to close the old signature here).
--
-- Client-side (public/index.html, deleteTrip()) is updated in the same
-- step to pass p_admin_token:S.adminToken on this call, mirroring "path 1".

DROP FUNCTION IF EXISTS public.admin_delete_trip_by_member(uuid, text);

CREATE FUNCTION public.admin_delete_trip_by_member(
  p_invite_token uuid,
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
  -- Resolve trip from invite_token
  SELECT trip_id INTO v_trip_id
  FROM trip_tokens WHERE invite_token = p_invite_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_invite_token' USING ERRCODE = 'P0001';
  END IF;

  -- Verify caller actually holds this trip's admin_token (same check
  -- admin_delete_trip already uses) — this is the fix; everything below
  -- is unchanged from the original function.
  PERFORM _sa_validate_admin(v_trip_id, p_admin_token);

  -- Verify the named member is actually admin in this trip
  SELECT is_admin INTO v_is_admin
  FROM members
  WHERE trip_id = v_trip_id AND name = p_member_name AND is_admin = TRUE;

  IF NOT FOUND OR NOT v_is_admin THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = 'P0002';
  END IF;

  -- Delete trip (cascades to members, expenses, groups, treasury, etc.)
  DELETE FROM trips WHERE id = v_trip_id;

  RETURN json_build_object('ok', true, 'trip_id', v_trip_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_delete_trip_by_member(uuid, text, text) TO anon, authenticated;
