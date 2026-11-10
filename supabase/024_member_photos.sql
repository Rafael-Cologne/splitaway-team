-- 024: member photos (Splitaway 1.0.25 build 40+). Needs 021 (personal member keys).
--   * members.photo — small JPEG/PNG/WebP as a data URL (the app sends ~160×160, ≈10–20 KB).
--   * set_member_photo(...): ONLY the member themself (identified by their personal key) can set or replace
--     their photo; the member or an admin (admin token or an admin's key) can remove it.
--   * The photo is visible to everyone in the trip (it is part of the member row the app loads).
-- Safe to run again.

begin;

alter table public.members add column if not exists photo text;

create or replace function public.set_member_photo(p_invite_token text, p_member_name text, p_photo text, p_auth jsonb default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_trip_id text; v_auth jsonb; v_actor text; v_admin boolean;
begin
  v_trip_id := _sa_validate_invite(p_invite_token);
  v_auth := _sa_auth(v_trip_id, p_auth->>'admin_token', p_auth->>'member_key');
  v_actor := v_auth->>'actor'; v_admin := coalesce((v_auth->>'admin')::boolean, false);
  if not exists (select 1 from members where trip_id = v_trip_id and name = p_member_name) then
    return jsonb_build_object('error', 'member_not_found');
  end if;
  if p_photo is not null then
    if v_actor is distinct from p_member_name then return jsonb_build_object('error', 'not_your_photo'); end if;
    if length(p_photo) > 100000 or p_photo !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' then
      return jsonb_build_object('error', 'invalid_photo');
    end if;
  elsif v_actor is distinct from p_member_name and not v_admin then
    return jsonb_build_object('error', 'not_your_photo');
  end if;
  update members set photo = p_photo where trip_id = v_trip_id and name = p_member_name;
  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('error', sqlerrm, 'code', sqlstate);
end $function$;

revoke all on function public.set_member_photo(text, text, text, jsonb) from public;
grant execute on function public.set_member_photo(text, text, text, jsonb) to anon;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.set_member_photo(text, text, text, jsonb) to authenticated';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';

select 'OK: 024 applied' as result;
