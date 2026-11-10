-- Audit finding #8: pickName() in public/index.html wrote claimed_device
-- directly via sb.from('members').update(...), a raw PostgREST call against
-- the `members` table. Since migration 002_security.sql leaves `members`
-- with only a SELECT policy for anon (no INSERT/UPDATE/DELETE policy), this
-- write was always silently blocked by RLS — PostgREST returns HTTP 200
-- with 0 rows affected, not an error, so the .catch() never fired. Result:
-- "claiming" a name/device pairing never actually persisted server-side;
-- it only looked like it worked because of optimistic local state, and
-- would silently reset (and could be re-claimed by someone else) on the
-- next reload.
--
-- Fix: a dedicated SECURITY DEFINER RPC, matching the pattern already used
-- for every other write path in this app (create_trip, sync_trip_data,
-- admin_delete_trip, admin_delete_trip_by_member, upsert_push_subscription)
-- rather than opening a raw anon UPDATE policy on `members` — an open
-- write policy would be a step backwards after this session's earlier work
-- closing the equivalent gap on trip_tokens. This RPC:
--   - validates the invite_token (same as every other RPC),
--   - refuses to steal a name already claimed by a DIFFERENT device
--     (returns {ok:false, error:'name_taken'} instead of throwing, so the
--     client can show the existing "taken" toast on a race),
--   - releases any other name this same device had previously claimed in
--     this trip (mirrors the two-step unclaim/claim pickName() already does
--     locally), and
--   - is atomic (single RPC call, no separate unclaim-then-claim round trip
--     that could interleave with another device's claim).

CREATE OR REPLACE FUNCTION public.claim_member_device(
  p_invite_token text,
  p_member_name text,
  p_device_id text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trip_id TEXT;
  v_current_device TEXT;
BEGIN
  v_trip_id := _sa_validate_invite(p_invite_token);

  IF p_device_id IS NULL OR p_device_id = '' THEN
    RAISE EXCEPTION 'missing_device_id' USING ERRCODE = 'P0004';
  END IF;

  SELECT claimed_device INTO v_current_device
  FROM members WHERE trip_id = v_trip_id AND name = p_member_name;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'member_not_found');
  END IF;

  IF v_current_device IS NOT NULL AND v_current_device <> p_device_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_taken');
  END IF;

  -- Release any other name this same device had claimed in this trip
  UPDATE members SET claimed_device = NULL
  WHERE trip_id = v_trip_id AND claimed_device = p_device_id AND name <> p_member_name;

  UPDATE members SET claimed_device = p_device_id
  WHERE trip_id = v_trip_id AND name = p_member_name;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_member_device(text, text, text) TO anon, authenticated;
