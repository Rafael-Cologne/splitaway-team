-- 022a_secure_reads_prepare.sql — step 1 of closing public reads (safe: adds only, old apps keep working).
-- Apply together with (or before) publishing app 1.0.25.
--  • load_trip_data(invite_token): the whole trip in one call, only for holders of the invite token.
--  • trip_signals: a tiny "something changed" row per trip, keyed by sha256(invite_token).
--    Realtime listens to it instead of the data tables; it contains no names, amounts or ids.
-- Requires 021 (members.key_hash is excluded from the result).

begin;

create or replace function public.load_trip_data(p_invite_token text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare v_trip_id text;
begin
  v_trip_id := _sa_validate_invite(p_invite_token);
  return jsonb_build_object(
    'trip',     (select to_jsonb(t) - 'require_member_key' from trips t where t.id = v_trip_id),
    'members',  coalesce((select jsonb_agg(to_jsonb(m) - 'key_hash' order by m.created_at) from members m where m.trip_id = v_trip_id), '[]'),
    'groups',   coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at) from groups g where g.trip_id = v_trip_id), '[]'),
    'expenses', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from expenses e where e.trip_id = v_trip_id), '[]'),
    'treasury', (select to_jsonb(r) from treasury r where r.trip_id = v_trip_id),
    'invite_token', p_invite_token,
    'signal_topic', encode(extensions.digest(p_invite_token, 'sha256'), 'hex'));
exception when others then
  return jsonb_build_object('error', sqlerrm, 'code', sqlstate);
end $function$;

create table if not exists public.trip_signals(
  topic text primary key,          -- sha256(invite_token): only token holders can compute it
  v bigint not null default 0,
  changed_at timestamptz not null default now()
);
alter table public.trip_signals enable row level security;
drop policy if exists trip_signals_select on public.trip_signals;
create policy trip_signals_select on public.trip_signals for select to anon using (true);
grant select on public.trip_signals to anon;

create or replace function public._sa_signal() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_trip text; v_topic text;
begin
  if tg_table_name = 'trips' then v_trip := coalesce(new.id, old.id);
  elsif tg_op = 'DELETE' then v_trip := old.trip_id; else v_trip := new.trip_id; end if;
  select encode(extensions.digest(invite_token, 'sha256'), 'hex') into v_topic from trip_tokens where trip_id = v_trip;
  if v_topic is not null then
    insert into trip_signals(topic, v, changed_at) values (v_topic, 1, now())
    on conflict (topic) do update set v = trip_signals.v + 1, changed_at = now()
      where trip_signals.changed_at <> now();
  end if;
  return null;
end $$;
revoke execute on function public._sa_signal() from public, anon;

-- one signal per transaction (now() is constant inside a transaction)
do $$ declare t text; begin
  foreach t in array array['expenses','members','groups','treasury','trips'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_signal', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public._sa_signal()', t || '_signal', t);
  end loop;
end $$;

grant execute on function public.load_trip_data(text) to anon;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.load_trip_data(text) to authenticated';
    execute 'revoke execute on function public._sa_signal() from authenticated';
    execute 'grant select on public.trip_signals to authenticated';
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'trip_signals') then
    execute 'alter publication supabase_realtime add table public.trip_signals';
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
