-- 022b_close_public_reads.sql — step 2: close public reads. Apply ONLY when (almost) all users run 1.0.25+.
-- After this, apps 1.0.24 and older cannot load trips (they read the tables directly).
-- The app 1.0.25 loads through load_trip_data() and listens to trip_signals.
begin;
drop policy if exists trips_select on public.trips;
drop policy if exists members_select on public.members;
drop policy if exists groups_select on public.groups;
drop policy if exists expenses_select on public.expenses;
drop policy if exists treasury_select on public.treasury;
revoke select on public.trips, public.members, public.groups, public.expenses, public.treasury from anon;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke select on public.trips, public.members, public.groups, public.expenses, public.treasury from authenticated';
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
-- Rollback (reopen reads):
--   create policy trips_select on public.trips for select to anon using (true);   -- same for members, groups, expenses, treasury
--   grant select on public.trips, public.members, public.groups, public.expenses, public.treasury to anon;
