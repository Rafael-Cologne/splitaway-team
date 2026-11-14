-- The invite link reveals only the trip title and selectable names.
-- Trip contents continue to require claim_member_device and a member key.
CREATE FUNCTION public.list_invite_members(p_invite_token text, p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trip_id text;
  v_trip_name text;
  v_members jsonb;
BEGIN
  SELECT tt.trip_id INTO v_trip_id
  FROM public.trip_tokens AS tt
  WHERE tt.invite_token = p_invite_token;

  IF v_trip_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_invite_token');
  END IF;

  SELECT t.name INTO v_trip_name
  FROM public.trips AS t
  WHERE t.id = v_trip_id;

  IF v_trip_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'trip_not_found');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'name', m.name,
      'gender', m.gender,
      'taken_by_other', m.claimed_device IS NOT NULL
        AND m.claimed_device IS DISTINCT FROM p_device_id
    ) ORDER BY m.is_admin DESC, m.created_at, m.name
  ), '[]'::jsonb) INTO v_members
  FROM public.members AS m
  WHERE m.trip_id = v_trip_id;

  RETURN jsonb_build_object('ok', true, 'trip_name', v_trip_name, 'members', v_members);
END;
$$;

REVOKE ALL ON FUNCTION public.list_invite_members(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_invite_members(text, text) TO anon;
