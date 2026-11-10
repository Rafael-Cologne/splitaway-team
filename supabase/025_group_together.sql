-- 025: "Count together" for couples/families is stored per group on the server (Splitaway 1.0.25 build 42+).
--   groups.together: true = the group is ONE share in new expenses; false/null = everyone is a share (default).
--   The admin's app sends it with the group; other phones read it, so all phones split new expenses the same way.
--   Old apps do not send the field — the stored value is kept.
-- Needs 021 + 023 (the guarded sync wrapper calls _sa_sync_trip_data_core). Safe to run again.

begin;

alter table public.groups add column if not exists together boolean;

create or replace function public._sa_sync_trip_data_core(p_invite_token text, p_data jsonb)
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
      insert into groups (id, trip_id, type, label, members, together)
      select (g->>'id')::uuid, v_trip_id, g->>'type', g->>'label', array(select jsonb_array_elements_text(g->'members')),
             case when jsonb_typeof(g->'together') = 'boolean' then (g->>'together')::boolean end
        from jsonb_array_elements(v_groups) as g
      on conflict (id) do update set type = excluded.type, label = excluded.label, members = excluded.members,
        together = coalesce(excluded.together, groups.together)   -- old apps do not send it: keep the stored value
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

revoke all on function public._sa_sync_trip_data_core(text, jsonb) from public, anon;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public._sa_sync_trip_data_core(text, jsonb) from authenticated';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';

select 'OK: 025 applied' as result;
