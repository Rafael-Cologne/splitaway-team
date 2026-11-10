-- A trip chooses its currency once. Existing trips remain unset until an admin chooses one.
alter table public.trips add column if not exists currency_code text;

create or replace function public.create_trip_with_currency(
  p_trip_id text,
  p_name text,
  p_dest text,
  p_admin_token_hash text,
  p_members jsonb,
  p_treasury_total numeric,
  p_treasury_contributions jsonb,
  p_currency_code text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if p_currency_code is null or p_currency_code !~ '^[A-Z]{3}$' then
    return jsonb_build_object('error','invalid_currency');
  end if;
  if exists(select 1 from public.trips where id = p_trip_id) then
    return jsonb_build_object('error','trip_exists');
  end if;
  v_result := public.create_trip(
    p_trip_id,p_name,p_dest,p_admin_token_hash,p_members,
    p_treasury_total,p_treasury_contributions
  );
  if v_result->>'invite_token' is null then
    raise exception 'trip_creation_failed';
  end if;
  update public.trips set currency_code = p_currency_code
  where id = p_trip_id and currency_code is null;
  if not found then raise exception 'trip_currency_not_saved'; end if;
  return v_result || jsonb_build_object('currency_code',p_currency_code);
exception when others then
  return jsonb_build_object('error',sqlerrm,'code',sqlstate);
end;
$function$;

create or replace function public.set_trip_currency(
  p_invite_token text,
  p_admin_token text,
  p_currency_code text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_trip_id text;
  v_currency text;
begin
  if p_currency_code is null or p_currency_code !~ '^[A-Z]{3}$' then
    return jsonb_build_object('error','invalid_currency');
  end if;
  v_trip_id := public._sa_validate_invite(p_invite_token);
  if not exists(select 1 from public.trip_tokens
                where trip_id = v_trip_id and admin_token_hash is not null) then
    return jsonb_build_object('error','admin_token_required');
  end if;
  perform public._sa_validate_admin(v_trip_id,p_admin_token);
  update public.trips set currency_code = p_currency_code
  where id = v_trip_id and currency_code is null
  returning currency_code into v_currency;
  if v_currency is null then
    select currency_code into v_currency from public.trips where id = v_trip_id;
  end if;
  if v_currency is distinct from p_currency_code then
    return jsonb_build_object('error','currency_already_set','currency_code',v_currency);
  end if;
  return jsonb_build_object('ok',true,'currency_code',v_currency);
exception when others then
  return jsonb_build_object('error',sqlerrm,'code',sqlstate);
end;
$function$;

revoke all on function public.create_trip_with_currency(text,text,text,text,jsonb,numeric,jsonb,text) from public;
grant execute on function public.create_trip_with_currency(text,text,text,text,jsonb,numeric,jsonb,text) to anon, authenticated;
revoke all on function public.set_trip_currency(text,text,text) from public;
grant execute on function public.set_trip_currency(text,text,text) to anon, authenticated;
