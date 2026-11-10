-- 023: the trip admin can change the base currency of a trip (Splitaway 1.0.25 build 38+)
--
-- 1. change_trip_currency(...) — admin only. In ONE transaction:
--      * checks the trip still has the currency the admin's app converted from (otherwise: currency_changed);
--      * checks the app converted every expense of the trip (otherwise: expenses_out_of_date → app reloads, retries);
--      * writes the converted expenses (amount, order items, personal shares, original-currency fields),
--        the converted cash box (total, spent, contributions, settled debts) and the new currency;
--      * if the new base currency was the second currency, the old base becomes the second currency.
-- 2. Write guard: sync_trip_data, upsert_expense and upsert_expense_with_currency refuse data from an app that
--    still works in the old currency (it sends trip.currency / trip_currency). Such an app reloads the trip.
--    Apps older than build 38 send no currency and are not checked.
--
-- Order: 021 → 022a → 023. Safe to run again. If 021 (or its rollback) is run AFTER this file,
-- run this file once more: it re-installs the guard around the new function versions.

begin;

create or replace function public.change_trip_currency(
  p_invite_token text, p_admin_token text, p_from text, p_to text, p_rate numeric,
  p_expenses jsonb, p_treasury jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_trip_id text; v_cur text; v_sec text; v_missing int; v_e jsonb;
begin
  if p_to is null or p_to !~ '^[A-Z]{3}$' or p_from is null or p_from !~ '^[A-Z]{3}$' or p_from = p_to then
    return jsonb_build_object('error','invalid_currency');
  end if;
  if p_rate is null or p_rate <= 0 then return jsonb_build_object('error','invalid_rate'); end if;
  if jsonb_typeof(coalesce(p_expenses,'null')) <> 'array' then return jsonb_build_object('error','invalid_expenses'); end if;
  v_trip_id := public._sa_validate_invite(p_invite_token);
  if not exists(select 1 from public.trip_tokens where trip_id = v_trip_id and admin_token_hash is not null) then
    return jsonb_build_object('error','admin_token_required');
  end if;
  perform public._sa_validate_admin(v_trip_id, p_admin_token);

  select currency_code, secondary_currency_code into v_cur, v_sec from public.trips where id = v_trip_id for update;
  if coalesce(v_cur, 'EUR') <> p_from then
    return jsonb_build_object('error','currency_changed','currency_code',v_cur);
  end if;

  select count(*) into v_missing from public.expenses e
   where e.trip_id = v_trip_id
     and not exists (select 1 from jsonb_array_elements(p_expenses) x where (x->>'id')::uuid = e.id);
  if v_missing > 0 then return jsonb_build_object('error','expenses_out_of_date'); end if;

  for v_e in select * from jsonb_array_elements(p_expenses) loop
    update public.expenses set
      amount                 = (v_e->>'amount')::numeric,
      items                  = coalesce(v_e->'items','[]'::jsonb),
      splits                 = nullif(v_e->'splits','null'::jsonb),
      original_amount        = nullif(v_e->>'original_amount','')::numeric,
      original_currency_code = nullif(v_e->>'original_currency_code',''),
      base_currency_code     = p_to,
      fx_rate                = nullif(v_e->>'fx_rate','')::numeric,
      fx_rate_date           = nullif(v_e->>'fx_rate_date','')::date,
      fx_rate_source         = nullif(v_e->>'fx_rate_source',''),
      fx_rate_manual         = coalesce((v_e->>'fx_rate_manual')::boolean, false)
    where trip_id = v_trip_id and id = (v_e->>'id')::uuid;
  end loop;

  if p_treasury is not null then
    update public.treasury set
      total         = coalesce((p_treasury->>'total')::numeric, total),
      spent         = coalesce((p_treasury->>'spent')::numeric, spent),
      contributions = coalesce(p_treasury->'contributions', contributions),
      settled_debts = coalesce(p_treasury->'settled_debts', settled_debts),
      updated_at    = now()
    where trip_id = v_trip_id;
  end if;

  update public.trips set
    currency_code = p_to,
    secondary_currency_code = case when secondary_currency_code = p_to then p_from else secondary_currency_code end,
    updated_at = now()
  where id = v_trip_id
  returning currency_code, secondary_currency_code into v_cur, v_sec;

  return jsonb_build_object('ok',true,'currency_code',v_cur,'secondary_currency_code',v_sec);
exception when others then
  return jsonb_build_object('error',sqlerrm,'code',sqlstate);
end;
$function$;
revoke all on function public.change_trip_currency(text,text,text,text,numeric,jsonb,jsonb) from public;
grant execute on function public.change_trip_currency(text,text,text,text,numeric,jsonb,jsonb) to anon, authenticated;

-- the app's currency vs the trip's currency; null = no objection
create or replace function public._sa_currency_guard(p_invite_token text, p_client text)
returns jsonb language sql stable security definer set search_path to ''
as $function$
  select case when p_client is null or p_client = '' then null
              when t.currency_code is not null and t.currency_code <> p_client
                then jsonb_build_object('error','currency_changed','currency_code',t.currency_code)
         end
  from public.trip_tokens k join public.trips t on t.id = k.trip_id
  where k.invite_token = p_invite_token;
$function$;
revoke all on function public._sa_currency_guard(text,text) from public, anon, authenticated;

-- move the current function to <name>_core (again, if a later migration replaced the guard)
do $do$
declare r record; v_def text;
begin
  for r in select * from (values ('sync_trip_data'), ('upsert_expense'), ('upsert_expense_with_currency')) v(fn) loop
    if to_regprocedure('public.' || r.fn || '(text,jsonb)') is null then continue; end if;
    v_def := pg_get_functiondef(('public.' || r.fn || '(text,jsonb)')::regprocedure);
    if position('_sa_currency_guard' in v_def) > 0 then continue; end if;      -- guard already installed
    if to_regprocedure('public._sa_' || r.fn || '_core(text,jsonb)') is not null then
      execute format('drop function public.%I(text,jsonb)', '_sa_' || r.fn || '_core');
    end if;
    execute format('alter function public.%I(text,jsonb) rename to %I', r.fn, '_sa_' || r.fn || '_core');
    execute format('revoke all on function public.%I(text,jsonb) from public, anon, authenticated', '_sa_' || r.fn || '_core');
  end loop;
end
$do$;

create or replace function public.sync_trip_data(p_invite_token text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_err jsonb;
begin
  v_err := public._sa_currency_guard(p_invite_token, p_data->'trip'->>'currency');
  if v_err is not null then return v_err; end if;
  return public._sa_sync_trip_data_core(p_invite_token, p_data);
end;
$function$;

create or replace function public.upsert_expense(p_invite_token text, p_expense jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_err jsonb;
begin
  v_err := public._sa_currency_guard(p_invite_token, p_expense->>'trip_currency');
  if v_err is not null then return v_err; end if;
  return public._sa_upsert_expense_core(p_invite_token, p_expense);
end;
$function$;

create or replace function public.upsert_expense_with_currency(p_invite_token text, p_expense jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_err jsonb;
begin
  v_err := public._sa_currency_guard(p_invite_token, p_expense->>'trip_currency');
  if v_err is not null then return v_err; end if;
  return public._sa_upsert_expense_with_currency_core(p_invite_token, p_expense);
end;
$function$;

grant execute on function public.sync_trip_data(text,jsonb) to anon, authenticated;
grant execute on function public.upsert_expense(text,jsonb) to anon, authenticated;
grant execute on function public.upsert_expense_with_currency(text,jsonb) to anon, authenticated;

commit;
notify pgrst, 'reload schema';
