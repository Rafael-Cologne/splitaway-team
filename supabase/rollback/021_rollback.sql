-- 021_rollback.sql — returns the write functions to their state before 021 (definitions read from the live DB on 2026-11-03).
-- trip_history, members.key_hash and trips.require_member_key are kept (harmless); drop them manually if needed.
begin;
drop function if exists public.delete_expense(text, uuid, jsonb);
drop function if exists public.set_expense_avatar(text, uuid, text, jsonb);
drop function if exists public.admin_release_member_device(text, text, text, jsonb);
do $$ declare t text; begin foreach t in array array['expenses','members','groups','treasury'] loop
  execute format('drop trigger if exists %I on public.%I', t||'_history', t); end loop; end $$;
CREATE OR REPLACE FUNCTION public.admin_release_member_device(p_invite_token text, p_admin_name text, p_target_name text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_trip_id text; v_is_admin boolean;
BEGIN
  SELECT trip_id INTO v_trip_id FROM trip_tokens WHERE invite_token = p_invite_token;
  IF v_trip_id IS NULL THEN RAISE EXCEPTION 'invalid_invite_token'; END IF;
  SELECT is_admin INTO v_is_admin FROM members WHERE trip_id = v_trip_id AND name = p_admin_name;
  IF NOT FOUND OR NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'not_admin'; END IF;
  UPDATE members SET claimed_device = NULL WHERE trip_id = v_trip_id AND name = p_target_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_member_device(p_invite_token text, p_member_name text, p_device_id text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_trip_id TEXT; v_current_device TEXT;
BEGIN
  v_trip_id := _sa_validate_invite(p_invite_token);
  IF p_device_id IS NULL OR p_device_id = '' THEN
    RAISE EXCEPTION 'missing_device_id' USING ERRCODE = 'P0004';
  END IF;
  SELECT claimed_device INTO v_current_device FROM members WHERE trip_id = v_trip_id AND name = p_member_name;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'member_not_found'); END IF;
  IF v_current_device IS NOT NULL AND v_current_device <> p_device_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_taken');
  END IF;
  UPDATE members SET claimed_device = NULL WHERE trip_id = v_trip_id AND claimed_device = p_device_id AND name <> p_member_name;
  UPDATE members SET claimed_device = p_device_id WHERE trip_id = v_trip_id AND name = p_member_name;
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_expense(p_invite_token text, p_expense_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_trip_id text;
BEGIN
  v_trip_id := _sa_validate_invite(p_invite_token);
  DELETE FROM expenses WHERE trip_id = v_trip_id AND id = p_expense_id;
  RETURN '{"ok":true}';
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'code', SQLSTATE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.recover_session(p_trip_id text, p_member_name text, p_device_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_token text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM members WHERE trip_id = p_trip_id AND name = p_member_name) THEN RETURN NULL; END IF;
  UPDATE members SET claimed_device = p_device_id WHERE trip_id = p_trip_id AND name = p_member_name;
  SELECT invite_token INTO v_token FROM trip_tokens WHERE trip_id = p_trip_id;
  RETURN v_token;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_member_device(p_invite_token text, p_member_name text, p_device_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_trip_id text;
BEGIN
  SELECT trip_id INTO v_trip_id FROM trip_tokens WHERE invite_token = p_invite_token;
  IF v_trip_id IS NULL THEN RAISE EXCEPTION 'invalid_invite_token'; END IF;
  UPDATE members SET claimed_device = NULL WHERE trip_id = v_trip_id AND name = p_member_name AND claimed_device = p_device_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_expense_avatar(p_invite_token text, p_expense_id uuid, p_avatar text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_trip_id text;
begin
v_trip_id := public._sa_validate_invite(p_invite_token);
if p_avatar is not null and (length(p_avatar)>120000 or not (p_avatar = any(array['hotel','taxi','plane','train','food','museum','shopping','ticket']) or p_avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')) then return jsonb_build_object('error','invalid_avatar'); end if;
update public.expenses set avatar=p_avatar where id=p_expense_id and trip_id=v_trip_id;
if not found then return jsonb_build_object('error','expense_not_found'); end if;
return jsonb_build_object('ok',true);
exception when others then return jsonb_build_object('error',sqlerrm,'code',sqlstate);
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_trip_data(p_invite_token text, p_data jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_trip_id TEXT; v_members JSONB; v_groups JSONB; v_expenses JSONB; v_treasury JSONB; v_trip JSONB;
  v_member_names TEXT[]; v_group_ids UUID[]; v_admin_ok BOOLEAN := false; v_admin_token TEXT;
BEGIN
  v_trip_id := _sa_validate_invite(p_invite_token);
  v_admin_token := p_data->>'admin_token';
  IF v_admin_token IS NOT NULL THEN
    BEGIN PERFORM _sa_validate_admin(v_trip_id, v_admin_token); v_admin_ok := true;
    EXCEPTION WHEN OTHERS THEN v_admin_ok := false; END;
  END IF;
  v_trip := p_data->'trip'; v_members := COALESCE(p_data->'members','[]'); v_groups := COALESCE(p_data->'groups','[]');
  v_expenses := COALESCE(p_data->'expenses','[]'); v_treasury := p_data->'treasury';
  UPDATE trips SET name = COALESCE(v_trip->>'name', name), dest = v_trip->>'dest', updated_at = now() WHERE id = v_trip_id;
  IF jsonb_array_length(v_members) > 0 THEN
    INSERT INTO members (trip_id, name, gender, is_admin)
    SELECT v_trip_id, m->>'name', COALESCE(m->>'gender','m'),
           CASE WHEN v_admin_ok THEN COALESCE((m->>'is_admin')::boolean, false) ELSE false END
    FROM jsonb_array_elements(v_members) AS m
    ON CONFLICT (trip_id, name) DO UPDATE SET gender = EXCLUDED.gender,
      is_admin = CASE WHEN v_admin_ok THEN EXCLUDED.is_admin ELSE members.is_admin END;
    SELECT array_agg(m->>'name') INTO v_member_names FROM jsonb_array_elements(v_members) AS m;
    DELETE FROM members WHERE trip_id = v_trip_id AND name != ALL(v_member_names);
  ELSE
    DELETE FROM members WHERE trip_id = v_trip_id;
  END IF;
  IF jsonb_array_length(v_groups) > 0 THEN
    INSERT INTO groups (id, trip_id, type, label, members)
    SELECT (g->>'id')::uuid, v_trip_id, g->>'type', g->>'label', ARRAY(SELECT jsonb_array_elements_text(g->'members'))
    FROM jsonb_array_elements(v_groups) AS g
    ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, label = EXCLUDED.label, members = EXCLUDED.members;
    SELECT array_agg((g->>'id')::uuid) INTO v_group_ids FROM jsonb_array_elements(v_groups) AS g;
    DELETE FROM groups WHERE trip_id = v_trip_id AND id != ALL(v_group_ids);
  ELSE
    DELETE FROM groups WHERE trip_id = v_trip_id;
  END IF;
  IF jsonb_array_length(v_expenses) > 0 THEN
    INSERT INTO expenses (id, trip_id, name, amount, comment, date, paid_by, participants, from_treasury, items, created_by, pair_reps, address, splits)
    SELECT (e->>'id')::uuid, v_trip_id, e->>'name', (e->>'amount')::numeric, NULLIF(e->>'comment',''), NULLIF(e->>'date','')::date,
           e->>'paid_by', ARRAY(SELECT jsonb_array_elements_text(e->'participants')), COALESCE((e->>'from_treasury')::boolean, false),
           COALESCE(e->'items', '[]'), NULLIF(e->>'created_by',''), NULLIF(e->'pair_reps', 'null'::jsonb), NULLIF(e->>'address',''), NULLIF(e->'splits', 'null'::jsonb)
    FROM jsonb_array_elements(v_expenses) AS e
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, amount = EXCLUDED.amount, comment = EXCLUDED.comment, date = EXCLUDED.date,
      paid_by = EXCLUDED.paid_by, participants = EXCLUDED.participants, from_treasury = EXCLUDED.from_treasury, items = EXCLUDED.items,
      pair_reps = EXCLUDED.pair_reps, address = EXCLUDED.address, splits = EXCLUDED.splits;
  END IF;
  IF v_treasury IS NOT NULL THEN
    INSERT INTO treasury (trip_id, total, spent, contributions, holder, settled_debts)
    VALUES (v_trip_id, COALESCE((v_treasury->>'total')::numeric, 0), COALESCE((v_treasury->>'spent')::numeric, 0),
      COALESCE(v_treasury->'contributions', '[]'), NULLIF(v_treasury->>'holder', ''), COALESCE(v_treasury->'settled_debts', '[]'))
    ON CONFLICT (trip_id) DO UPDATE SET total = EXCLUDED.total, spent = EXCLUDED.spent, contributions = EXCLUDED.contributions,
      holder = EXCLUDED.holder, settled_debts = EXCLUDED.settled_debts, updated_at = now();
  END IF;
  RETURN '{"ok":true}';
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'code', SQLSTATE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_expense(p_invite_token text, p_expense jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_trip_id text;
BEGIN
  v_trip_id := _sa_validate_invite(p_invite_token);
  INSERT INTO expenses (id, trip_id, name, amount, comment, date, paid_by, participants, from_treasury, items, created_by, pair_reps, address, splits)
  VALUES ((p_expense->>'id')::uuid, v_trip_id, p_expense->>'name', (p_expense->>'amount')::numeric, NULLIF(p_expense->>'comment', ''),
    NULLIF(p_expense->>'date', '')::date, p_expense->>'paid_by', ARRAY(SELECT jsonb_array_elements_text(p_expense->'participants')),
    COALESCE((p_expense->>'from_treasury')::boolean, false), COALESCE(p_expense->'items', '[]'), NULLIF(p_expense->>'created_by', ''),
    NULLIF(p_expense->'pair_reps', 'null'::jsonb), NULLIF(p_expense->>'address', ''), NULLIF(p_expense->'splits', 'null'::jsonb))
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, amount = EXCLUDED.amount, comment = EXCLUDED.comment, date = EXCLUDED.date,
    paid_by = EXCLUDED.paid_by, participants = EXCLUDED.participants, from_treasury = EXCLUDED.from_treasury, items = EXCLUDED.items,
    pair_reps = EXCLUDED.pair_reps, address = EXCLUDED.address, splits = EXCLUDED.splits;
  RETURN '{"ok":true}';
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'code', SQLSTATE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_expense_with_currency(p_invite_token text, p_expense jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_trip_id text;v_base text;v_secondary text;v_old_currency text;
begin
  v_trip_id:=public._sa_validate_invite(p_invite_token);
  select currency_code,secondary_currency_code into v_base,v_secondary from public.trips where id=v_trip_id;
  if v_base is null or p_expense->>'base_currency_code' is distinct from v_base then return jsonb_build_object('error','base_currency_mismatch'); end if;
  if (p_expense->>'original_amount')::numeric <= 0 or (p_expense->>'fx_rate')::numeric <= 0 or (p_expense->>'amount')::numeric <= 0 then return jsonb_build_object('error','invalid_amount'); end if;
  if p_expense->>'original_currency_code' is null or p_expense->>'base_currency_code' is null or p_expense->>'fx_rate_source' is null then return jsonb_build_object('error','missing_currency_metadata'); end if;
  if p_expense->>'original_currency_code'=v_base and ((p_expense->>'amount')::numeric is distinct from (p_expense->>'original_amount')::numeric or (p_expense->>'fx_rate')::numeric is distinct from 1) then return jsonb_build_object('error','base_amount_mismatch'); end if;
  select original_currency_code into v_old_currency from public.expenses where id=(p_expense->>'id')::uuid and trip_id=v_trip_id;
  if p_expense->>'original_currency_code' is distinct from v_base and p_expense->>'original_currency_code' is distinct from v_secondary and p_expense->>'original_currency_code' is distinct from v_old_currency then return jsonb_build_object('error','currency_not_in_trip'); end if;
  insert into public.expenses(id,trip_id,name,amount,comment,date,paid_by,participants,from_treasury,items,created_by,pair_reps,address,splits,original_amount,original_currency_code,base_currency_code,fx_rate,fx_rate_date,fx_rate_source,fx_rate_manual)
  values((p_expense->>'id')::uuid,v_trip_id,p_expense->>'name',(p_expense->>'amount')::numeric,nullif(p_expense->>'comment',''),nullif(p_expense->>'date','')::date,
    p_expense->>'paid_by',array(select jsonb_array_elements_text(p_expense->'participants')),coalesce((p_expense->>'from_treasury')::boolean,false),coalesce(p_expense->'items','[]'::jsonb),
    nullif(p_expense->>'created_by',''),nullif(p_expense->'pair_reps','null'::jsonb),nullif(p_expense->>'address',''),nullif(p_expense->'splits','null'::jsonb),
    (p_expense->>'original_amount')::numeric,p_expense->>'original_currency_code',p_expense->>'base_currency_code',(p_expense->>'fx_rate')::numeric,
    nullif(p_expense->>'fx_rate_date','')::date,p_expense->>'fx_rate_source',coalesce((p_expense->>'fx_rate_manual')::boolean,false))
  on conflict(id) do update set name=excluded.name,amount=excluded.amount,comment=excluded.comment,date=excluded.date,paid_by=excluded.paid_by,participants=excluded.participants,
    from_treasury=excluded.from_treasury,items=excluded.items,pair_reps=excluded.pair_reps,address=excluded.address,splits=excluded.splits,original_amount=excluded.original_amount,
    original_currency_code=excluded.original_currency_code,base_currency_code=excluded.base_currency_code,fx_rate=excluded.fx_rate,fx_rate_date=excluded.fx_rate_date,
    fx_rate_source=excluded.fx_rate_source,fx_rate_manual=excluded.fx_rate_manual
  where public.expenses.trip_id=v_trip_id;
  if not found then return jsonb_build_object('error','expense_id_belongs_to_other_trip'); end if;
  return jsonb_build_object('ok',true);
exception when others then return jsonb_build_object('error',sqlerrm,'code',sqlstate);
end;$function$;

grant execute on function public.delete_expense(text, uuid), public.set_expense_avatar(text, uuid, text), public.admin_release_member_device(text, text, text) to anon;
notify pgrst, 'reload schema';
commit;
