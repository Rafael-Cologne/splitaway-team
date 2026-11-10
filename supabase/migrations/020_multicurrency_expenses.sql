-- Prepared only. Apply to production after the owner approves the database change.
-- Existing trips and expenses keep their current monetary values.
alter table public.trips add column if not exists secondary_currency_code text;
alter table public.expenses add column if not exists original_amount numeric;
alter table public.expenses add column if not exists original_currency_code text;
alter table public.expenses add column if not exists base_currency_code text;
alter table public.expenses add column if not exists fx_rate numeric;
alter table public.expenses add column if not exists fx_rate_date date;
alter table public.expenses add column if not exists fx_rate_source text;
alter table public.expenses add column if not exists fx_rate_manual boolean;

alter table public.trips add constraint trips_secondary_currency_valid
  check (secondary_currency_code is null or
    (secondary_currency_code ~ '^[A-Z]{3}$' and secondary_currency_code is distinct from currency_code));
alter table public.expenses add constraint expenses_currency_metadata_valid
  check (original_currency_code is null or
    (original_currency_code ~ '^[A-Z]{3}$' and base_currency_code is not null
      and base_currency_code ~ '^[A-Z]{3}$' and original_amount is not null
      and original_amount > 0 and fx_rate is not null and fx_rate > 0
      and fx_rate_source is not null
      and (original_currency_code = base_currency_code or fx_rate_date is not null)));

create or replace function public.create_trip_with_currencies(
  p_trip_id text,p_name text,p_dest text,p_admin_token_hash text,
  p_members jsonb,p_treasury_total numeric,p_treasury_contributions jsonb,
  p_currency_code text,p_secondary_currency_code text
) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_result jsonb;
begin
  if p_secondary_currency_code is null or p_secondary_currency_code !~ '^[A-Z]{3}$'
     or p_secondary_currency_code = p_currency_code then
    return jsonb_build_object('error','invalid_secondary_currency');
  end if;
  v_result := public.create_trip_with_currency(p_trip_id,p_name,p_dest,p_admin_token_hash,
    p_members,p_treasury_total,p_treasury_contributions,p_currency_code);
  if v_result->>'error' is not null then return v_result; end if;
  update public.trips set secondary_currency_code=p_secondary_currency_code where id=p_trip_id;
  if not found then raise exception 'trip_not_found'; end if;
  return v_result || jsonb_build_object('secondary_currency_code',p_secondary_currency_code);
exception when others then
  return jsonb_build_object('error',sqlerrm,'code',sqlstate);
end;$fn$;

create or replace function public.set_trip_secondary_currency(
  p_invite_token text,p_admin_token text,p_secondary_currency_code text
) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_trip_id text;v_base text;
begin
  if p_secondary_currency_code is not null and p_secondary_currency_code !~ '^[A-Z]{3}$' then
    return jsonb_build_object('error','invalid_currency');
  end if;
  v_trip_id:=public._sa_validate_invite(p_invite_token);
  if not exists(select 1 from public.trip_tokens
                where trip_id=v_trip_id and admin_token_hash is not null) then
    return jsonb_build_object('error','admin_token_required');
  end if;
  perform public._sa_validate_admin(v_trip_id,p_admin_token);
  select currency_code into v_base from public.trips where id=v_trip_id;
  if v_base is null or v_base=p_secondary_currency_code then
    return jsonb_build_object('error','invalid_secondary_currency');
  end if;
  update public.trips set secondary_currency_code=p_secondary_currency_code where id=v_trip_id;
  return jsonb_build_object('ok',true,'secondary_currency_code',p_secondary_currency_code);
exception when others then
  return jsonb_build_object('error',sqlerrm,'code',sqlstate);
end;$fn$;

-- A legacy client may update a title, but must not silently reprice a foreign expense.
create or replace function public.protect_expense_currency_amount()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if old.original_currency_code is not null and new.amount is distinct from old.amount
     and new.original_amount is not distinct from old.original_amount
     and new.original_currency_code is not distinct from old.original_currency_code
     and new.fx_rate is not distinct from old.fx_rate then
    raise exception 'currency_metadata_required_for_amount_change';
  end if;
  return new;
end;$fn$;
create trigger protect_expense_currency_amount
before update on public.expenses for each row execute function public.protect_expense_currency_amount();

create or replace function public.upsert_expense_with_currency(
  p_invite_token text,p_expense jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_trip_id text;v_base text;v_secondary text;v_old_currency text;
begin
  v_trip_id:=public._sa_validate_invite(p_invite_token);
  select currency_code,secondary_currency_code into v_base,v_secondary
    from public.trips where id=v_trip_id;
  if v_base is null or p_expense->>'base_currency_code' is distinct from v_base then
    return jsonb_build_object('error','base_currency_mismatch');
  end if;
  if (p_expense->>'original_amount')::numeric <= 0 or
     (p_expense->>'fx_rate')::numeric <= 0 or
     (p_expense->>'amount')::numeric <= 0 then
    return jsonb_build_object('error','invalid_amount');
  end if;
  if p_expense->>'original_currency_code' is null or
     p_expense->>'base_currency_code' is null or
     p_expense->>'fx_rate_source' is null then
    return jsonb_build_object('error','missing_currency_metadata');
  end if;
  if p_expense->>'original_currency_code'=v_base and
     ((p_expense->>'amount')::numeric is distinct from (p_expense->>'original_amount')::numeric
       or (p_expense->>'fx_rate')::numeric is distinct from 1) then
    return jsonb_build_object('error','base_amount_mismatch');
  end if;
  select original_currency_code into v_old_currency from public.expenses
    where id=(p_expense->>'id')::uuid and trip_id=v_trip_id;
  if p_expense->>'original_currency_code' is distinct from v_base and
     p_expense->>'original_currency_code' is distinct from v_secondary and
     p_expense->>'original_currency_code' is distinct from v_old_currency then
    return jsonb_build_object('error','currency_not_in_trip');
  end if;
  insert into public.expenses(id,trip_id,name,amount,comment,date,paid_by,participants,
    from_treasury,items,created_by,pair_reps,address,splits,original_amount,
    original_currency_code,base_currency_code,fx_rate,fx_rate_date,fx_rate_source,fx_rate_manual)
  values((p_expense->>'id')::uuid,v_trip_id,p_expense->>'name',(p_expense->>'amount')::numeric,
    nullif(p_expense->>'comment',''),nullif(p_expense->>'date','')::date,
    p_expense->>'paid_by',array(select jsonb_array_elements_text(p_expense->'participants')),
    coalesce((p_expense->>'from_treasury')::boolean,false),coalesce(p_expense->'items','[]'::jsonb),
    nullif(p_expense->>'created_by',''),nullif(p_expense->'pair_reps','null'::jsonb),
    nullif(p_expense->>'address',''),nullif(p_expense->'splits','null'::jsonb),
    (p_expense->>'original_amount')::numeric,p_expense->>'original_currency_code',
    p_expense->>'base_currency_code',(p_expense->>'fx_rate')::numeric,
    nullif(p_expense->>'fx_rate_date','')::date,p_expense->>'fx_rate_source',
    coalesce((p_expense->>'fx_rate_manual')::boolean,false))
  on conflict(id) do update set
    name=excluded.name,amount=excluded.amount,comment=excluded.comment,date=excluded.date,
    paid_by=excluded.paid_by,participants=excluded.participants,
    from_treasury=excluded.from_treasury,items=excluded.items,pair_reps=excluded.pair_reps,
    address=excluded.address,splits=excluded.splits,original_amount=excluded.original_amount,
    original_currency_code=excluded.original_currency_code,base_currency_code=excluded.base_currency_code,
    fx_rate=excluded.fx_rate,fx_rate_date=excluded.fx_rate_date,fx_rate_source=excluded.fx_rate_source,
    fx_rate_manual=excluded.fx_rate_manual
  where public.expenses.trip_id=v_trip_id;
  if not found then return jsonb_build_object('error','expense_id_belongs_to_other_trip'); end if;
  return jsonb_build_object('ok',true);
exception when others then
  return jsonb_build_object('error',sqlerrm,'code',sqlstate);
end;$fn$;

revoke all on function public.create_trip_with_currencies(text,text,text,text,jsonb,numeric,jsonb,text,text) from public;
grant execute on function public.create_trip_with_currencies(text,text,text,text,jsonb,numeric,jsonb,text,text) to anon,authenticated;
revoke all on function public.set_trip_secondary_currency(text,text,text) from public;
grant execute on function public.set_trip_secondary_currency(text,text,text) to anon,authenticated;
revoke all on function public.upsert_expense_with_currency(text,jsonb) from public;
grant execute on function public.upsert_expense_with_currency(text,jsonb) to anon,authenticated;
