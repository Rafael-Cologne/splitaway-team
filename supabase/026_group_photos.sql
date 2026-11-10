-- 026: photo of a couple/family (Splitaway 1.0.25 build 44+). Needs 021 (personal member keys).
--   * groups.photo — small JPEG/PNG/WebP data URL (the app sends ~160×160).
--   * set_group_photo(...): any member of THAT group (identified by their personal key) or the trip admin
--     can set, replace or remove it. The admin's sync never touches the photo.
-- Safe to run again.

begin;

alter table public.groups add column if not exists photo text;

create or replace function public.set_group_photo(p_invite_token text, p_group_id uuid, p_photo text, p_auth jsonb default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_trip_id text; v_auth jsonb; v_actor text; v_admin boolean; v_members text[];
begin
  v_trip_id := _sa_validate_invite(p_invite_token);
  v_auth := _sa_auth(v_trip_id, p_auth->>'admin_token', p_auth->>'member_key');
  v_actor := v_auth->>'actor'; v_admin := coalesce((v_auth->>'admin')::boolean, false);
  select members into v_members from groups where trip_id = v_trip_id and id = p_group_id;
  if not found then return jsonb_build_object('error', 'group_not_found'); end if;
  if not v_admin and (v_actor is null or not (v_actor = any(v_members))) then
    return jsonb_build_object('error', 'not_your_group');
  end if;
  if p_photo is not null and (length(p_photo) > 100000 or p_photo !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$') then
    return jsonb_build_object('error', 'invalid_photo');
  end if;
  update groups set photo = p_photo where trip_id = v_trip_id and id = p_group_id;
  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('error', sqlerrm, 'code', sqlstate);
end $function$;

revoke all on function public.set_group_photo(text, uuid, text, jsonb) from public;
grant execute on function public.set_group_photo(text, uuid, text, jsonb) to anon;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.set_group_photo(text, uuid, text, jsonb) to authenticated';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';

select 'OK: 026 applied' as result;
