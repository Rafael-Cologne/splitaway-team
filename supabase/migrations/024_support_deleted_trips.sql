-- Splitaway support-only trip inventory and recoverable deletion.
-- Historical deleted trips cannot be reconstructed; existing trips are baseline rows.
create schema if not exists support;
revoke all on schema support from public, anon, authenticated;

create table if not exists support.trip_registry (
  trip_id text primary key,
  trip_name text not null,
  created_at timestamptz,
  tracked_at timestamptz not null default now(),
  status text not null check (status in ('active','completed','deleted')),
  status_at timestamptz not null default now(),
  last_snapshot_id bigint
);
create table if not exists support.trip_events (
  id bigint generated always as identity primary key,
  trip_id text not null,
  event text not null check (event in ('baseline','created','completed','reopened','deleted','restored')),
  at timestamptz not null default now(),
  note text
);
create table if not exists support.deleted_trips (
  id bigint generated always as identity primary key,
  trip_id text not null,
  deleted_at timestamptz not null default now(),
  payload jsonb not null,
  restored_at timestamptz,
  restore_note text
);
create index if not exists trip_events_trip_idx on support.trip_events(trip_id, at desc);
create index if not exists deleted_trips_trip_idx on support.deleted_trips(trip_id, deleted_at desc);
revoke all on all tables in schema support from public, anon, authenticated;

create or replace view support.trip_overview as
select r.trip_id,r.trip_name,r.status,r.created_at,r.tracked_at,r.status_at,
  case when r.status='deleted' then jsonb_array_length(s.payload->'members')
       else (select count(*) from public.members m where m.trip_id=r.trip_id) end as member_count,
  case when r.status='deleted' then jsonb_array_length(s.payload->'expenses')
       else (select count(*) from public.expenses e where e.trip_id=r.trip_id) end as expense_count,
  s.deleted_at as last_deleted_at,s.restored_at as last_restored_at
from support.trip_registry r
left join support.deleted_trips s on s.id=r.last_snapshot_id;
revoke all on support.trip_overview from public, anon, authenticated;

-- Table Editor can open one row and inspect every related record in JSON columns.
create or replace view support.trip_details as
select r.trip_id,r.trip_name,r.status,r.created_at,r.status_at,
  case when r.status='deleted' then s.payload->'trip' else to_jsonb(t) end as trip,
  case when r.status='deleted' then s.payload->'members'
       else coalesce((select jsonb_agg(to_jsonb(x) - 'key_hash' - 'claimed_device') from public.members x where x.trip_id=r.trip_id),'[]'::jsonb) end as members,
  case when r.status='deleted' then s.payload->'groups'
       else coalesce((select jsonb_agg(to_jsonb(x)) from public.groups x where x.trip_id=r.trip_id),'[]'::jsonb) end as groups,
  case when r.status='deleted' then s.payload->'expenses'
       else coalesce((select jsonb_agg(to_jsonb(x)) from public.expenses x where x.trip_id=r.trip_id),'[]'::jsonb) end as expenses,
  case when r.status='deleted' then s.payload->'treasury'
       else coalesce((select jsonb_agg(to_jsonb(x)) from public.treasury x where x.trip_id=r.trip_id),'[]'::jsonb) end as treasury
from support.trip_registry r
left join public.trips t on t.id=r.trip_id
left join support.deleted_trips s on s.id=r.last_snapshot_id;
revoke all on support.trip_details from public, anon, authenticated;

insert into support.trip_registry(trip_id,trip_name,created_at,status)
select t.id,t.name,t.created_at,'active' from public.trips t
on conflict (trip_id) do nothing;
insert into support.trip_events(trip_id,event,note)
select r.trip_id,'baseline','Present when tracking started'
from support.trip_registry r
where not exists (select 1 from support.trip_events e where e.trip_id=r.trip_id);

create or replace function support.record_trip_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into support.trip_registry(trip_id,trip_name,created_at,status,status_at)
  values(new.id,new.name,new.created_at,'active',now())
  on conflict(trip_id) do update set trip_name=excluded.trip_name,created_at=excluded.created_at,status='active',status_at=now();
  if current_setting('splitaway.restoring',true) is distinct from '1' then
    insert into support.trip_events(trip_id,event) values(new.id,'created');
  end if;
  return new;
end $$;

create or replace function support.record_trip_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update support.trip_registry set trip_name=new.name where trip_id=new.id;
  return new;
end $$;

create or replace function support.record_trip_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_payload jsonb; v_snapshot_id bigint;
begin
  -- BEFORE DELETE sees the children before FK cascading deletion.
  select jsonb_build_object(
    'trip',to_jsonb(old),
    'members',coalesce((select jsonb_agg(to_jsonb(x) - 'key_hash' - 'claimed_device') from public.members x where x.trip_id=old.id),'[]'::jsonb),
    'groups',coalesce((select jsonb_agg(to_jsonb(x)) from public.groups x where x.trip_id=old.id),'[]'::jsonb),
    'expenses',coalesce((select jsonb_agg(to_jsonb(x)) from public.expenses x where x.trip_id=old.id),'[]'::jsonb),
    'treasury',coalesce((select jsonb_agg(to_jsonb(x)) from public.treasury x where x.trip_id=old.id),'[]'::jsonb)
  ) into v_payload;
  insert into support.deleted_trips(trip_id,payload) values(old.id,v_payload) returning id into v_snapshot_id;
  update support.trip_registry set status='deleted',status_at=now(),last_snapshot_id=v_snapshot_id,trip_name=old.name where trip_id=old.id;
  insert into support.trip_events(trip_id,event) values(old.id,'deleted');
  return old;
end $$;

drop trigger if exists trip_registry_insert on public.trips;
create trigger trip_registry_insert after insert on public.trips for each row execute function support.record_trip_insert();
drop trigger if exists trip_registry_update on public.trips;
create trigger trip_registry_update after update of name on public.trips for each row execute function support.record_trip_update();
drop trigger if exists trip_registry_delete on public.trips;
create trigger trip_registry_delete before delete on public.trips for each row execute function support.record_trip_delete();

create or replace function support.set_trip_completed(p_trip_id text,p_completed boolean,p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  select status into v_status from support.trip_registry where trip_id=p_trip_id for update;
  if v_status is null or v_status='deleted' then raise exception 'Trip does not exist or is deleted'; end if;
  if (p_completed and v_status='completed') or (not p_completed and v_status='active') then return; end if;
  update support.trip_registry set status=case when p_completed then 'completed' else 'active' end,status_at=now() where trip_id=p_trip_id;
  insert into support.trip_events(trip_id,event,note) values(p_trip_id,case when p_completed then 'completed' else 'reopened' end,p_note);
end $$;

create or replace function support.restore_trip(p_trip_id text,p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_snapshot support.deleted_trips%rowtype; v_item jsonb; v_invite text; v_admin text;
begin
  if nullif(btrim(p_reason),'') is null then raise exception 'A support decision note is required'; end if;
  if exists(select 1 from public.trips where id=p_trip_id) then raise exception 'Trip already exists'; end if;
  select * into v_snapshot from support.deleted_trips where trip_id=p_trip_id and restored_at is null order by id desc limit 1 for update;
  if not found then raise exception 'No restorable snapshot for this trip'; end if;
  perform set_config('splitaway.restoring','1',true);
  insert into public.trips select * from jsonb_populate_record(null::public.trips,v_snapshot.payload->'trip');
  for v_item in select value from jsonb_array_elements(v_snapshot.payload->'members') loop
    insert into public.members select * from jsonb_populate_record(null::public.members,v_item);
  end loop;
  for v_item in select value from jsonb_array_elements(v_snapshot.payload->'groups') loop
    insert into public.groups select * from jsonb_populate_record(null::public.groups,v_item);
  end loop;
  for v_item in select value from jsonb_array_elements(v_snapshot.payload->'expenses') loop
    insert into public.expenses select * from jsonb_populate_record(null::public.expenses,v_item);
  end loop;
  for v_item in select value from jsonb_array_elements(v_snapshot.payload->'treasury') loop
    insert into public.treasury select * from jsonb_populate_record(null::public.treasury,v_item);
  end loop;
  -- Old credentials are deliberately discarded on deletion. Issue fresh access
  -- only after support has verified the requester's identity.
  v_invite := encode(extensions.gen_random_bytes(24),'hex');
  v_admin := encode(extensions.gen_random_bytes(24),'hex');
  insert into public.trip_tokens(trip_id,invite_token,admin_token_hash)
  values(p_trip_id,v_invite,encode(extensions.digest(v_admin,'sha256'),'hex'));
  update support.deleted_trips set restored_at=now(),restore_note=p_reason where id=v_snapshot.id;
  update support.trip_registry set status='active',status_at=now() where trip_id=p_trip_id;
  insert into support.trip_events(trip_id,event,note) values(p_trip_id,'restored',p_reason);
  perform set_config('splitaway.restoring','0',true);
  return jsonb_build_object('trip_id',p_trip_id,'invite_token',v_invite,'admin_token',v_admin);
end $$;

revoke all on function support.record_trip_insert(),support.record_trip_update(),support.record_trip_delete(),support.set_trip_completed(text,boolean,text),support.restore_trip(text,text) from public, anon, authenticated;
