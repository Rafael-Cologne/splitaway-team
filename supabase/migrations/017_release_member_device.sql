-- Migration 017: RPC для освобождения claimed_device при явном выходе из поездки.
-- Вызывается из leaveTrip() во фронтенде; очищает claimed_device только если
-- передано корректное устройство (p_device_id должен совпадать с текущим).
CREATE OR REPLACE FUNCTION public.release_member_device(
  p_invite_token text,
  p_member_name text,
  p_device_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_trip_id text;
BEGIN
  SELECT trip_id INTO v_trip_id FROM trip_tokens WHERE invite_token = p_invite_token;
  IF v_trip_id IS NULL THEN
    RAISE EXCEPTION 'invalid_invite_token';
  END IF;
  UPDATE members
  SET claimed_device = NULL
  WHERE trip_id = v_trip_id
    AND name = p_member_name
    AND claimed_device = p_device_id;
END;
$$;
