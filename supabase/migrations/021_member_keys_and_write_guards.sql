-- 021_member_keys_and_write_guards.sql — Splitaway server hardening, step 1 (backward compatible).
--
-- WHAT IT FIXES
--  1. recover_session() handed out the invite token to anyone who knew a trip id and a member name
--     (both are world-readable). It now returns the token only to the device that already holds
--     that name (same claimed_device); otherwise NULL (old apps show "name taken"; reopen the link).
--  2. Expense/group upserts keyed only by id could overwrite a row of ANOTHER trip. All upserts now
--     update only rows of the caller's trip.
--  3. Every change/delete of expenses, members, groups and treasury is copied into trip_history
--     (old row + new row), so any trip can be restored. Not readable by the app (no policy).
--  4. Personal member key: claim_member_device() now also returns a member_key (stored as sha256).
--     Apps that send it are identified; admins are recognised by admin_token OR by the key of a
--     member with is_admin = true (co-admins no longer need the admin token).
--  5. Write rules inside sync_trip_data / upsert_expense* / delete_expense / set_expense_avatar /
--     admin_release_member_device:
--       admin            : everything (as before)
--       member with key  : add expenses; edit/delete only expenses created_by = self;
--                          add settlements where self's group pays or receives;
--                          members, groups, treasury, trip name: read-only
--       no key (old app) : add expenses; add settlements; cannot delete/rename members, change groups,
--                          treasury or trip, cannot edit/delete others' expenses through sync.
--                          Granular expense RPCs keep working for old apps until the trip is switched
--                          to enforcement (trips.require_member_key = true).
--  6. Renames by an admin keep the member row (id, claimed_device, key) via p_data.renames.
--
-- Old app versions keep working: no signature is removed without a compatible replacement
-- (new optional parameters have defaults; payload fields are optional).

begin;

-- ───────── schema ─────────
alter table public.members add column if not exists key_hash text;
alter table public.trips   add column if not exists require_member_key boolean not null default false;

create table if not exists public.trip_history(
  id bigserial primary key,
  trip_id text not null,
  table_name text not null,
  op text not null,
  row_id text,
  old_row jsonb,
  new_row jsonb,
  actor text,
  created_at timestamptz not null default now()
);
create index if not exists trip_history_trip_idx on public.trip_history(trip_id, created_at desc);
alter table public.trip_history enable row level security;   -- no policies: not readable by anon
revoke all on public.trip_history from anon;

-- key_hash is a sha256 of a random 24-byte key: reading it does not allow writing.

-- ───────── history trigger ─────────
create or replace function public._sa_log_change() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_trip text; v_id text;
begin
  -- a sync re-sends unchanged rows: only real changes are recorded
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'updated_at') = (to_jsonb(new) - 'updated_at') then return null; end if;
  if tg_op = 'DELETE' then v_trip := old.trip_id; v_id := old.id::text;
  else v_trip := new.trip_id; v_id := new.id::text; end if;
  insert into trip_history(trip_id, table_name, op, row_id, old_row, new_row, actor)
  values (v_trip, tg_table_name, tg_op, v_id,
          case when tg_op <> 'INSERT' then to_jsonb(old) - 'key_hash' end,
          case when tg_op <> 'DELETE' then to_jsonb(new) - 'key_hash' end,
          nullif(current_setting('splitaway.actor', true), ''));
  return null;
end $$;
revoke execute on function public._sa_log_change() from public, anon;

do $$ declare t text; begin
  foreach t in array array['expenses','members','groups','treasury'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_history', t);
    execute format('create trigger %I after update or delete on public.%I for each row execute function public._sa_log_change()', t || '_history', t);
  end loop;
end $$;

-- ───────── auth helper ─────────
-- returns {admin: bool, actor: text|null, keyed: bool, enforce: bool}
create or replace function public._sa_auth(p_trip_id text, p_admin_token text, p_member_key text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_admin boolean := false; v_actor text; v_actor_admin boolean := false; v_enforce boolean;
begin
  if p_admin_token is not null and p_admin_token <> '' then
    begin perform _sa_validate_admin(p_trip_id, p_admin_token); v_admin := true;
    exception when others then v_admin := false; end;
  end if;
  if p_member_key is not null and p_member_key <> '' then
    select name, coalesce(is_admin, false) into v_actor, v_actor_admin
      from members where trip_id = p_trip_id
       and key_hash = encode(extensions.digest(p_member_key, 'sha256'), 'hex');
  end if;
  select require_member_key into v_enforce from trips where id = p_trip_id;
  perform set_config('splitaway.actor', coalesce(v_actor, case when v_admin then '#admin' else '#anon' end), true);
  return jsonb_build_object('admin', v_admin or v_actor_admin, 'actor', v_actor,
                            'keyed', v_actor is not null, 'enforce', coalesce(v_enforce, false));
end $$;
revoke execute on function public._sa_auth(text, text, text) from public, anon;

-- names of the actor's group (self + group mates), used for settlement rules
create or replace function public._sa_actor_side(p_trip_id text, p_actor text)
returns text[] language sql stable security definer set search_path to 'public' as $$
  select coalesce((select members from groups where trip_id = p_trip_id and p_actor = any(members) limit 1), array[p_actor]);
$$;
revoke execute on function public._sa_actor_side(text, text) from public, anon;

-- ───────── claim_member_device: also returns a personal key ─────────
create or replace function public.claim_member_device(p_invite_token text, p_member_name text, p_device_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_trip_id text; v_current_device text; v_key_hash text; v_key text;
begin
  v_trip_id := _sa_validate_invite(p_invite_token);
  if p_device_id is null or p_device_id = '' then
    raise exception 'missing_device_id' using errcode = 'P0004';
  end if;
  select claimed_device, key_hash into v_current_device, v_key_hash
    from members where trip_id = v_trip_id and name = p_member_name;
  if not found then return jsonb_build_object('ok', false, 'error', 'member_not_found'); end if;
  if v_current_device is not null and v_current_device <> p_device_id then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
  end if;
  update members set claimed_device = null
   where trip_id = v_trip_id and claimed_device = p_device_id and name <> p_member_name;
  -- A key is issued once per claim; a member that already has a key keeps it (the app stores it).
  -- Lost key → the admin releases the device (clears the key) and the member claims again.
  if v_key_hash is null then
    v_key := encode(extensions.gen_random_bytes(24), 'hex');
    update members set claimed_device = p_device_id,
                       key_hash = encode(extensions.digest(v_key, 'sha256'), 'hex')
     where trip_id = v_trip_id and name = p_member_name;
    return jsonb_build_object('ok', true, 'member_key', v_key);
  end if;
  update members set claimed_device = p_device_id where trip_id = v_trip_id and name = p_member_name;
  return jsonb_build_object('ok', true, 'member_key', null, 'key_exists', true);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm, 'code', sqlstate);
end $function$;

-- ───────── recover_session: no token for strangers ─────────
create or replace function public.recover_session(p_trip_id text, p_member_name text, p_device_id uuid)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare v_token text;
begin
  if not exists (select 1 from members where trip_id = p_trip_id and name = p_member_name
                   and claimed_device = p_device_id::text) then
    return null;
  end if;
  select invite_token into v_token from trip_tokens where trip_id = p_trip_id;
  return v_token;
end $function$;

-- ───────── release: clears the key too ─────────
create or replace function public.release_member_device(p_invite_token text, p_member_name text, p_device_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_trip_id text;
begin
  v_trip_id := _sa_validate_invite(p_invite_token);
  update members set claimed_device = null, key_hash = null
   where trip_id = v_trip_id and name = p_member_name and claimed_device = p_device_id::text;
end $function$;

drop function if exists public.admin_release_member_device(text, text, text);
create or replace function public.admin_release_member_device(p_invite_token text, p_admin_name text, p_target_name text, p_auth jsonb default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_trip_id text; v_auth jsonb; v_is_admin boolean;
begin
  v_trip_id := _sa_validate_invite(p_invite_token);
  v_auth := _sa_auth(v_trip_id, p_auth->>'admin_token', p_auth->>'member_key');
  if not (v_auth->>'admin')::boolean then
    -- old apps: name-based check, only while the trip is not enforcing keys
    select is_admin into v_is_admin from members where trip_id = v_trip_id and name = p_admin_name;
    if (v_auth->>'enforce')::boolean or not coalesce(v_is_admin, false) then
      raise exception 'not_admin';
    end if;
  end if;
  update members set claimed_device = null, key_hash = null where trip_id = v_trip_id and name = p_target_name;
end $function$;

-- ───────── sync_trip_data ─────────
create or replace function public.sync_trip_data(p_invite_token text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_trip_id text; v_auth jsonb; v_admin boolean; v_actor text; v_keyed boolean;
  v_token_admin boolean := false;
  v_members jsonb; v_groups jsonb; v_expenses jsonb; v_treasury jsonb; v_trip jsonb;
  v_member_names text[]; v_group_ids uuid[]; v_side text[];
  v_old_sd jsonb; v_new_sd jsonb; e jsonb; r jsonb;
begin
  v_trip_id := _sa_validate_invite(p_invite_token);
  v_auth := _sa_auth(v_trip_id, p_data->>'admin_token', p_data->>'member_key');
  v_admin := (v_auth->>'admin')::boolean; v_actor := v_auth->>'actor'; v_keyed := (v_auth->>'keyed')::boolean;
  if (v_auth->>'enforce')::boolean and not v_admin and not v_keyed then
    return jsonb_build_object('error', 'member_key_required');
  end if;
  if p_data->>'admin_token' is not null then
    begin perform _sa_validate_admin(v_trip_id, p_data->>'admin_token'); v_token_admin := true;
    exception when others then v_token_admin := false; end;
  end if;

  v_trip := p_data->'trip'; v_members := coalesce(p_data->'members', '[]'); v_groups := coalesce(p_data->'groups', '[]');
  v_expenses := coalesce(p_data->'expenses', '[]'); v_treasury := p_data->'treasury';

  if v_admin then
    update trips set name = coalesce(v_trip->>'name', name), dest = v_trip->>'dest', updated_at = now() where id = v_trip_id;

    -- renames keep the member row (claimed_device, key) — sent by 1.0.25+
    for r in select * from jsonb_array_elements(coalesce(p_data->'renames', '[]')) loop
      if not exists (select 1 from members where trip_id = v_trip_id and name = r->>'to') then
        update members set name = r->>'to' where trip_id = v_trip_id and name = r->>'from';
        update push_subscriptions set member_name = r->>'to' where trip_id = v_trip_id and member_name = r->>'from';
      end if;
    end loop;

    if jsonb_array_length(v_members) > 0 then
      insert into members (trip_id, name, gender, is_admin)
      select v_trip_id, m->>'name', coalesce(m->>'gender', 'm'),
             case when v_admin then coalesce((m->>'is_admin')::boolean, false) else false end
        from jsonb_array_elements(v_members) as m
      on conflict (trip_id, name) do update set
        gender = excluded.gender,
        -- the trip owner's role is changed only with the admin token
        is_admin = case when v_token_admin then excluded.is_admin
                        when members.is_admin and not excluded.is_admin then members.is_admin
                        else excluded.is_admin end;
      select array_agg(m->>'name') into v_member_names from jsonb_array_elements(v_members) as m;
      delete from members where trip_id = v_trip_id and name <> all(v_member_names);
    end if;  -- an empty list no longer wipes all members

    if jsonb_array_length(v_groups) > 0 then
      insert into groups (id, trip_id, type, label, members)
      select (g->>'id')::uuid, v_trip_id, g->>'type', g->>'label', array(select jsonb_array_elements_text(g->'members'))
        from jsonb_array_elements(v_groups) as g
      on conflict (id) do update set type = excluded.type, label = excluded.label, members = excluded.members
        where groups.trip_id = v_trip_id;
      select array_agg((g->>'id')::uuid) into v_group_ids from jsonb_array_elements(v_groups) as g;
      delete from groups where trip_id = v_trip_id and id <> all(v_group_ids);
    else
      delete from groups where trip_id = v_trip_id;
    end if;
  else
    -- non-admin: new members are not accepted; names that do not exist are ignored
    null;
  end if;

  -- expenses: insert new ones for everybody; update existing ones per rules; never delete here
  for e in select * from jsonb_array_elements(v_expenses) loop
    insert into expenses (id, trip_id, name, amount, comment, date, paid_by, participants, from_treasury, items,
                          created_by, pair_reps, address, splits)
    values ((e->>'id')::uuid, v_trip_id, e->>'name', (e->>'amount')::numeric, nullif(e->>'comment', ''),
            nullif(e->>'date', '')::date, e->>'paid_by', array(select jsonb_array_elements_text(e->'participants')),
            coalesce((e->>'from_treasury')::boolean, false), coalesce(e->'items', '[]'),
            case when v_keyed and not v_admin then v_actor else nullif(e->>'created_by', '') end,
            nullif(e->'pair_reps', 'null'::jsonb), nullif(e->>'address', ''), nullif(e->'splits', 'null'::jsonb))
    on conflict (id) do update set
      name = excluded.name, amount = excluded.amount, comment = excluded.comment, date = excluded.date,
      paid_by = excluded.paid_by, participants = excluded.participants, from_treasury = excluded.from_treasury,
      items = excluded.items, pair_reps = excluded.pair_reps, address = excluded.address, splits = excluded.splits
      where expenses.trip_id = v_trip_id
        and (v_admin or (v_keyed and expenses.created_by = v_actor));
  end loop;

  if v_treasury is not null then
    if v_admin then
      insert into treasury (trip_id, total, spent, contributions, holder, settled_debts)
      values (v_trip_id, coalesce((v_treasury->>'total')::numeric, 0), coalesce((v_treasury->>'spent')::numeric, 0),
              coalesce(v_treasury->'contributions', '[]'), nullif(v_treasury->>'holder', ''), coalesce(v_treasury->'settled_debts', '[]'))
      on conflict (trip_id) do update set total = excluded.total, spent = excluded.spent, contributions = excluded.contributions,
        holder = excluded.holder, settled_debts = excluded.settled_debts, updated_at = now();
    else
      -- non-admin: only NEW settlement records are appended (own side when identified); nothing is removed or edited
      select coalesce(settled_debts, '[]') into v_old_sd from treasury where trip_id = v_trip_id;
      v_old_sd := coalesce(v_old_sd, '[]');
      v_side := case when v_keyed then _sa_actor_side(v_trip_id, v_actor) end;
      select coalesce(jsonb_agg(d), '[]') into v_new_sd
        from jsonb_array_elements(coalesce(v_treasury->'settled_debts', '[]')) as d
       where d->>'id' is not null
         and not exists (select 1 from jsonb_array_elements(v_old_sd) o where o->>'id' = d->>'id')
         and d->>'voidedAt' is null
         and (v_side is null or d->>'from' = any(v_side) or d->>'to' = any(v_side));
      update treasury set
        settled_debts = v_old_sd || v_new_sd,
        spent = coalesce((select sum(amount) from expenses where trip_id = v_trip_id and from_treasury), 0),
        updated_at = now()
       where trip_id = v_trip_id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'admin', v_admin, 'identified', v_keyed);
exception when others then
  return jsonb_build_object('error', sqlerrm, 'code', sqlstate);
end $function$;

-- ───────── granular expense RPCs ─────────
-- auth is read from optional fields inside p_expense (admin_token, member_key) → no signature change
create or replace function public._sa_can_write_expense(p_trip_id text, p_expense_id uuid, p_admin_token text, p_member_key text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_auth jsonb; v_owner text; v_exists boolean;
begin
  v_auth := _sa_auth(p_trip_id, p_admin_token, p_member_key);
  select true, created_by into v_exists, v_owner from expenses where id = p_expense_id and trip_id = p_trip_id;
  if (v_auth->>'admin')::boolean then return v_auth || '{"ok":true}'; end if;
  if (v_auth->>'keyed')::boolean then
    if not coalesce(v_exists, false) or v_owner = v_auth->>'actor' then return v_auth || '{"ok":true}'; end if;
    return v_auth || '{"ok":false,"error":"not_your_expense"}';
  end if;
  if (v_auth->>'enforce')::boolean then return v_auth || '{"ok":false,"error":"member_key_required"}'; end if;
  return v_auth || '{"ok":true,"legacy":true}';
end $$;
revoke execute on function public._sa_can_write_expense(text, uuid, text, text) from public, anon;

create or replace function public.upsert_expense(p_invite_token text, p_expense jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_trip_id text; v_chk jsonb;
begin
  v_trip_id := _sa_validate_invite(p_invite_token);
  v_chk := _sa_can_write_expense(v_trip_id, (p_expense->>'id')::uuid, p_expense->>'admin_token', p_expense->>'member_key');
  if not (v_chk->>'ok')::boolean then return jsonb_build_object('error', v_chk->>'error'); end if;
  insert into expenses (id, trip_id, name, amount, comment, date, paid_by, participants, from_treasury, items, created_by, pair_reps, address, splits)
  values ((p_expense->>'id')::uuid, v_trip_id, p_expense->>'name', (p_expense->>'amount')::numeric, nullif(p_expense->>'comment', ''),
    nullif(p_expense->>'date', '')::date, p_expense->>'paid_by', array(select jsonb_array_elements_text(p_expense->'participants')),
    coalesce((p_expense->>'from_treasury')::boolean, false), coalesce(p_expense->'items', '[]'),
    case when (v_chk->>'keyed')::boolean and not (v_chk->>'admin')::boolean then v_chk->>'actor' else nullif(p_expense->>'created_by', '') end,
    nullif(p_expense->'pair_reps', 'null'::jsonb), nullif(p_expense->>'address', ''), nullif(p_expense->'splits', 'null'::jsonb))
  on conflict (id) do update set name = excluded.name, amount = excluded.amount, comment = excluded.comment, date = excluded.date,
    paid_by = excluded.paid_by, participants = excluded.participants, from_treasury = excluded.from_treasury, items = excluded.items,
    pair_reps = excluded.pair_reps, address = excluded.address, splits = excluded.splits
  where expenses.trip_id = v_trip_id;
  if not found then return jsonb_build_object('error', 'expense_id_belongs_to_other_trip'); end if;
  return '{"ok":true}';
exception when others then
  return jsonb_build_object('error', sqlerrm, 'code', sqlstate);
end $function$;

create or replace function public.upsert_expense_with_currency(p_invite_token text, p_expense jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_trip_id text; v_base text; v_secondary text; v_old_currency text; v_chk jsonb;
begin
  v_trip_id := public._sa_validate_invite(p_invite_token);
  v_chk := public._sa_can_write_expense(v_trip_id, (p_expense->>'id')::uuid, p_expense->>'admin_token', p_expense->>'member_key');
  if not (v_chk->>'ok')::boolean then return jsonb_build_object('error', v_chk->>'error'); end if;
  select currency_code, secondary_currency_code into v_base, v_secondary from public.trips where id = v_trip_id;
  if v_base is null or p_expense->>'base_currency_code' is distinct from v_base then return jsonb_build_object('error','base_currency_mismatch'); end if;
  if (p_expense->>'original_amount')::numeric <= 0 or (p_expense->>'fx_rate')::numeric <= 0 or (p_expense->>'amount')::numeric <= 0 then return jsonb_build_object('error','invalid_amount'); end if;
  if p_expense->>'original_currency_code' is null or p_expense->>'base_currency_code' is null or p_expense->>'fx_rate_source' is null then return jsonb_build_object('error','missing_currency_metadata'); end if;
  if p_expense->>'original_currency_code' = v_base and ((p_expense->>'amount')::numeric is distinct from (p_expense->>'original_amount')::numeric or (p_expense->>'fx_rate')::numeric is distinct from 1) then return jsonb_build_object('error','base_amount_mismatch'); end if;
  select original_currency_code into v_old_currency from public.expenses where id = (p_expense->>'id')::uuid and trip_id = v_trip_id;
  if p_expense->>'original_currency_code' is distinct from v_base and p_expense->>'original_currency_code' is distinct from v_secondary and p_expense->>'original_currency_code' is distinct from v_old_currency then return jsonb_build_object('error','currency_not_in_trip'); end if;
  insert into public.expenses(id,trip_id,name,amount,comment,date,paid_by,participants,from_treasury,items,created_by,pair_reps,address,splits,original_amount,original_currency_code,base_currency_code,fx_rate,fx_rate_date,fx_rate_source,fx_rate_manual)
  values((p_expense->>'id')::uuid,v_trip_id,p_expense->>'name',(p_expense->>'amount')::numeric,nullif(p_expense->>'comment',''),nullif(p_expense->>'date','')::date,
    p_expense->>'paid_by',array(select jsonb_array_elements_text(p_expense->'participants')),coalesce((p_expense->>'from_treasury')::boolean,false),coalesce(p_expense->'items','[]'::jsonb),
    case when (v_chk->>'keyed')::boolean and not (v_chk->>'admin')::boolean then v_chk->>'actor' else nullif(p_expense->>'created_by','') end,
    nullif(p_expense->'pair_reps','null'::jsonb),nullif(p_expense->>'address',''),nullif(p_expense->'splits','null'::jsonb),
    (p_expense->>'original_amount')::numeric,p_expense->>'original_currency_code',p_expense->>'base_currency_code',(p_expense->>'fx_rate')::numeric,
    nullif(p_expense->>'fx_rate_date','')::date,p_expense->>'fx_rate_source',coalesce((p_expense->>'fx_rate_manual')::boolean,false))
  on conflict(id) do update set name=excluded.name,amount=excluded.amount,comment=excluded.comment,date=excluded.date,paid_by=excluded.paid_by,participants=excluded.participants,
    from_treasury=excluded.from_treasury,items=excluded.items,pair_reps=excluded.pair_reps,address=excluded.address,splits=excluded.splits,original_amount=excluded.original_amount,
    original_currency_code=excluded.original_currency_code,base_currency_code=excluded.base_currency_code,fx_rate=excluded.fx_rate,fx_rate_date=excluded.fx_rate_date,
    fx_rate_source=excluded.fx_rate_source,fx_rate_manual=excluded.fx_rate_manual
  where public.expenses.trip_id = v_trip_id;
  if not found then return jsonb_build_object('error','expense_id_belongs_to_other_trip'); end if;
  return jsonb_build_object('ok', true);
exception when others then return jsonb_build_object('error', sqlerrm, 'code', sqlstate);
end $function$;

drop function if exists public.delete_expense(text, uuid);
create or replace function public.delete_expense(p_invite_token text, p_expense_id uuid, p_auth jsonb default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_trip_id text; v_chk jsonb;
begin
  v_trip_id := _sa_validate_invite(p_invite_token);
  v_chk := _sa_can_write_expense(v_trip_id, p_expense_id, p_auth->>'admin_token', p_auth->>'member_key');
  if not (v_chk->>'ok')::boolean then return jsonb_build_object('error', v_chk->>'error'); end if;
  delete from expenses where trip_id = v_trip_id and id = p_expense_id;
  if (v_chk->>'admin')::boolean is not true then
    update treasury set spent = coalesce((select sum(amount) from expenses where trip_id = v_trip_id and from_treasury), 0)
     where trip_id = v_trip_id;
  end if;
  return '{"ok":true}';
exception when others then
  return jsonb_build_object('error', sqlerrm, 'code', sqlstate);
end $function$;

drop function if exists public.set_expense_avatar(text, uuid, text);
create or replace function public.set_expense_avatar(p_invite_token text, p_expense_id uuid, p_avatar text, p_auth jsonb default null)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_trip_id text; v_chk jsonb;
begin
  v_trip_id := public._sa_validate_invite(p_invite_token);
  v_chk := public._sa_can_write_expense(v_trip_id, p_expense_id, p_auth->>'admin_token', p_auth->>'member_key');
  if not (v_chk->>'ok')::boolean then return jsonb_build_object('error', v_chk->>'error'); end if;
  if p_avatar is not null and (length(p_avatar) > 120000 or not (p_avatar = any(array['hotel','taxi','plane','train','food','museum','shopping','ticket']) or p_avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')) then
    return jsonb_build_object('error', 'invalid_avatar');
  end if;
  update public.expenses set avatar = p_avatar where id = p_expense_id and trip_id = v_trip_id;
  if not found then return jsonb_build_object('error', 'expense_not_found'); end if;
  return jsonb_build_object('ok', true);
exception when others then return jsonb_build_object('error', sqlerrm, 'code', sqlstate);
end $function$;

grant execute on function public.claim_member_device(text, text, text), public.recover_session(text, text, uuid),
  public.release_member_device(text, text, uuid), public.admin_release_member_device(text, text, text, jsonb),
  public.sync_trip_data(text, jsonb), public.upsert_expense(text, jsonb), public.upsert_expense_with_currency(text, jsonb),
  public.delete_expense(text, uuid, jsonb), public.set_expense_avatar(text, uuid, text, jsonb) to anon;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.claim_member_device(text, text, text), public.recover_session(text, text, uuid), public.release_member_device(text, text, uuid), public.admin_release_member_device(text, text, text, jsonb), public.sync_trip_data(text, jsonb), public.upsert_expense(text, jsonb), public.upsert_expense_with_currency(text, jsonb), public.delete_expense(text, uuid, jsonb), public.set_expense_avatar(text, uuid, text, jsonb) to authenticated';
    execute 'revoke execute on function public._sa_auth(text, text, text), public._sa_actor_side(text, text), public._sa_can_write_expense(text, uuid, text, text), public._sa_log_change() from authenticated';
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
