-- ============================================================
-- Splitaway — Migration 004: document admin_delete_trip_by_member
--
-- ЭТО МИГРАЦИЯ-ДОКУМЕНТАЦИЯ, А НЕ НОВАЯ ФУНКЦИОНАЛЬНОСТЬ.
--
-- Функция public.admin_delete_trip_by_member(uuid, text) уже живёт
-- в продакшен-базе, но никогда не была закоммичена в трекаемые
-- миграции этого репозитория. Обнаружено при аудите 2026-08-28.
--
-- Определение ниже воспроизведено ДОСЛОВНО (verbatim) с текущего
-- продакшен-объекта — логика не менялась, только фиксируется в
-- истории миграций. CREATE OR REPLACE делает применение безопасным
-- (идемпотентным) на базе, где функция уже существует.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_delete_trip_by_member(p_invite_token uuid, p_member_name text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
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

  -- Verify caller is actually admin in this trip
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

GRANT EXECUTE ON FUNCTION public.admin_delete_trip_by_member(uuid, text) TO anon, authenticated;
