-- Fixes: any trip member holding only the invite_token (which every member
-- of the trip already has, by design — it's how they join) could grant
-- themselves or anyone else admin rights by calling sync_trip_data() with
-- is_admin:true in the members payload. sync_trip_data() validated the
-- invite_token but never the admin_token, so is_admin from the client was
-- trusted blindly.
--
-- Fix: sync_trip_data() now reads an optional "admin_token" field out of
-- p_data (the existing jsonb payload — no new SQL parameter, so this stays
-- a same-signature CREATE OR REPLACE with no risk of leaving a vulnerable
-- overload behind). Client-supplied is_admin values are only applied when
-- that token validates against this trip's admin_token_hash (same check
-- admin_delete_trip already uses via _sa_validate_admin). Otherwise the
-- existing DB value for is_admin is preserved on update, and new members
-- are inserted as non-admin. All other sync behavior (members/groups/
-- expenses/treasury) is unchanged.
--
-- Known residual: 4 of 23 live trips predate the admin_token system and
-- have a NULL admin_token_hash. _sa_validate_admin() treats a NULL hash as
-- "no protection configured" and lets any token through, so those specific
-- trips keep today's weaker behavior (same pre-existing gap admin_delete_trip
-- already has for the same trips). Not addressed here — needs a separate
-- decision about backfilling admin_token_hash for old trips.

CREATE OR REPLACE FUNCTION public.sync_trip_data(p_invite_token text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trip_id      TEXT;
  v_members      JSONB;
  v_groups       JSONB;
  v_expenses     JSONB;
  v_treasury     JSONB;
  v_trip         JSONB;
  v_member_names TEXT[];
  v_group_ids    UUID[];
  v_expense_ids  UUID[];
  v_admin_ok     BOOLEAN := false;
  v_admin_token  TEXT;
BEGIN
  v_trip_id := _sa_validate_invite(p_invite_token);

  v_admin_token := p_data->>'admin_token';
  IF v_admin_token IS NOT NULL THEN
    BEGIN
      PERFORM _sa_validate_admin(v_trip_id, v_admin_token);
      v_admin_ok := true;
    EXCEPTION WHEN OTHERS THEN
      v_admin_ok := false;
    END;
  END IF;

  v_trip     := p_data->'trip';
  v_members  := COALESCE(p_data->'members',  '[]');
  v_groups   := COALESCE(p_data->'groups',   '[]');
  v_expenses := COALESCE(p_data->'expenses', '[]');
  v_treasury := p_data->'treasury';

  UPDATE trips SET
    name       = COALESCE(v_trip->>'name', name),
    dest       = v_trip->>'dest',
    updated_at = now()
  WHERE id = v_trip_id;

  IF jsonb_array_length(v_members) > 0 THEN
    INSERT INTO members (trip_id, name, gender, is_admin)
    SELECT v_trip_id, m->>'name', COALESCE(m->>'gender','m'),
           CASE WHEN v_admin_ok THEN COALESCE((m->>'is_admin')::boolean, false) ELSE false END
    FROM jsonb_array_elements(v_members) AS m
    ON CONFLICT (trip_id, name)
    DO UPDATE SET
      gender   = EXCLUDED.gender,
      is_admin = CASE WHEN v_admin_ok THEN EXCLUDED.is_admin ELSE members.is_admin END;

    SELECT array_agg(m->>'name') INTO v_member_names FROM jsonb_array_elements(v_members) AS m;
    DELETE FROM members WHERE trip_id = v_trip_id AND name != ALL(v_member_names);
  ELSE
    DELETE FROM members WHERE trip_id = v_trip_id;
  END IF;

  IF jsonb_array_length(v_groups) > 0 THEN
    INSERT INTO groups (id, trip_id, type, label, members)
    SELECT (g->>'id')::uuid, v_trip_id, g->>'type', g->>'label',
           ARRAY(SELECT jsonb_array_elements_text(g->'members'))
    FROM jsonb_array_elements(v_groups) AS g
    ON CONFLICT (id)
    DO UPDATE SET type = EXCLUDED.type, label = EXCLUDED.label, members = EXCLUDED.members;

    SELECT array_agg((g->>'id')::uuid) INTO v_group_ids FROM jsonb_array_elements(v_groups) AS g;
    DELETE FROM groups WHERE trip_id = v_trip_id AND id != ALL(v_group_ids);
  ELSE
    DELETE FROM groups WHERE trip_id = v_trip_id;
  END IF;

  IF jsonb_array_length(v_expenses) > 0 THEN
    INSERT INTO expenses (id, trip_id, name, amount, comment, date,
                          paid_by, participants, from_treasury, items, created_by,
                          pair_reps, address, splits)
    SELECT (e->>'id')::uuid, v_trip_id, e->>'name', (e->>'amount')::numeric,
           NULLIF(e->>'comment',''), NULLIF(e->>'date','')::date,
           e->>'paid_by', ARRAY(SELECT jsonb_array_elements_text(e->'participants')),
           COALESCE((e->>'from_treasury')::boolean, false),
           COALESCE(e->'items', '[]'), NULLIF(e->>'created_by',''),
           NULLIF(e->'pair_reps', 'null'::jsonb), NULLIF(e->>'address',''),
           NULLIF(e->'splits', 'null'::jsonb)
    FROM jsonb_array_elements(v_expenses) AS e
    ON CONFLICT (id)
    DO UPDATE SET
      name          = EXCLUDED.name,
      amount        = EXCLUDED.amount,
      comment       = EXCLUDED.comment,
      date          = EXCLUDED.date,
      paid_by       = EXCLUDED.paid_by,
      participants  = EXCLUDED.participants,
      from_treasury = EXCLUDED.from_treasury,
      items         = EXCLUDED.items,
      pair_reps     = EXCLUDED.pair_reps,
      address       = EXCLUDED.address,
      splits        = EXCLUDED.splits;

    SELECT array_agg((e->>'id')::uuid) INTO v_expense_ids FROM jsonb_array_elements(v_expenses) AS e;
    DELETE FROM expenses WHERE trip_id = v_trip_id AND id != ALL(v_expense_ids);
  ELSE
    DELETE FROM expenses WHERE trip_id = v_trip_id;
  END IF;

  IF v_treasury IS NOT NULL THEN
    INSERT INTO treasury (trip_id, total, spent, contributions, holder, settled_debts)
    VALUES (
      v_trip_id,
      COALESCE((v_treasury->>'total')::numeric, 0),
      COALESCE((v_treasury->>'spent')::numeric, 0),
      COALESCE(v_treasury->'contributions', '[]'),
      NULLIF(v_treasury->>'holder', ''),
      COALESCE(v_treasury->'settled_debts', '[]')
    )
    ON CONFLICT (trip_id) DO UPDATE SET
      total         = EXCLUDED.total,
      spent         = EXCLUDED.spent,
      contributions = EXCLUDED.contributions,
      holder        = EXCLUDED.holder,
      settled_debts = EXCLUDED.settled_debts,
      updated_at    = now();
  END IF;

  RETURN '{"ok":true}';
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'code', SQLSTATE);
END;
$function$;
