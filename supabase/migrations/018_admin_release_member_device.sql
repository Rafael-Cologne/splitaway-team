-- Migration 018: Admin RPC для освобождения claimed_device любого участника.
-- Вызывается из adminFreeDevice() во фронтенде только администратором поездки.
-- Проверяет is_admin=true у вызывающего перед очисткой.
CREATE OR REPLACE FUNCTION public.admin_release_member_device(
  p_invite_token text,
  p_admin_name   text,
  p_target_name  text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_trip_id text;
  v_is_admin boolean;
BEGIN
  SELECT trip_id INTO v_trip_id FROM trip_tokens WHERE invite_token = p_invite_token;
  IF v_trip_id IS NULL THEN
    RAISE EXCEPTION 'invalid_invite_token';
  END IF;

  SELECT is_admin INTO v_is_admin FROM members
  WHERE trip_id = v_trip_id AND name = p_admin_name;
  IF NOT FOUND OR NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  UPDATE members
  SET claimed_device = NULL
  WHERE trip_id = v_trip_id AND name = p_target_name;
END;
$$;
