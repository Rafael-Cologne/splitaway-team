-- Test scenarios for 021 (run as superuser for setup, calls as anon)
\set ON_ERROR_STOP 1
insert into trips(id,name,currency_code) values ('T1','Trip one','EUR'),('T2','Trip two','EUR');
insert into trip_tokens(trip_id,invite_token,admin_token_hash) values
 ('T1','inv1',encode(extensions.digest('adm1','sha256'),'hex')),('T2','inv2',encode(extensions.digest('adm2','sha256'),'hex'));
insert into members(trip_id,name,is_admin,claimed_device) values ('T1','Raf',true,'dev-raf'),('T1','Anna',false,'dev-anna'),('T1','Igor',false,null),('T1','Co',true,'dev-co'),('T2','Zed',true,null);
insert into groups(id,trip_id,type,members) values ('00000000-0000-0000-0000-0000000000a1','T1','couple','{Anna,Igor}');
insert into treasury(trip_id,total,spent,contributions,holder,settled_debts) values ('T1',100,0,'[{"member":"Raf","amount":100}]','Raf','[{"id":"s1","from":"Igor","to":"Raf","amount":5}]'),('T2',0,0,'[]',null,'[]');
insert into expenses(id,trip_id,name,amount,paid_by,participants,created_by) values
 ('00000000-0000-0000-0000-000000000001','T1','Hotel',100,'Raf','{Raf,Anna,Igor}','Raf'),
 ('00000000-0000-0000-0000-000000000002','T1','Taxi',20,'Anna','{Anna,Igor}','Anna'),
 ('00000000-0000-0000-0000-000000000009','T2','Other trip',50,'Zed','{Zed}','Zed');

create temp table k(name text, key text);
grant all on k to anon;
set role anon;

do $$
declare r jsonb; t text; kanna text; kco text; kigor text; n int; v numeric;
begin
  -- 1. recover_session no longer leaks the token
  t := recover_session('T1','Anna','00000000-0000-0000-0000-00000000dead'::uuid);
  if t is not null then raise exception 'FAIL recover_session leaked token'; end if;
  raise notice 'PASS recover_session: stranger gets NULL';

  -- 2. claim returns a key once; second claim does not re-issue
  r := claim_member_device('inv1','Anna','dev-anna'); kanna := r->>'member_key';
  if kanna is null then raise exception 'FAIL no key for Anna: %', r; end if;
  r := claim_member_device('inv1','Anna','dev-anna');
  if r->>'member_key' is not null then raise exception 'FAIL key re-issued'; end if;
  r := claim_member_device('inv1','Anna','dev-attacker');
  if (r->>'ok')::boolean then raise exception 'FAIL attacker claimed Anna'; end if;
  r := claim_member_device('inv1','Co','dev-co'); kco := r->>'member_key';
  r := claim_member_device('inv1','Igor','dev-igor'); kigor := r->>'member_key';
  insert into k values ('Anna',kanna),('Co',kco),('Igor',kigor);
  raise notice 'PASS keys issued once';

  -- 3. legacy (no key) snapshot that drops members, groups, an expense and the treasury
  r := sync_trip_data('inv1', jsonb_build_object(
     'trip', jsonb_build_object('name','HACKED'),
     'members', '[{"name":"Anna"}]'::jsonb, 'groups','[]'::jsonb,
     'expenses', '[{"id":"00000000-0000-0000-0000-000000000001","name":"Hotel","amount":1,"paid_by":"Anna","participants":["Anna"]},
                   {"id":"00000000-0000-0000-0000-000000000009","name":"pwn","amount":1,"paid_by":"x","participants":["x"]},
                   {"id":"00000000-0000-0000-0000-000000000003","name":"Coffee","amount":4,"paid_by":"Anna","participants":["Anna","Igor"]}]'::jsonb,
     'treasury', '{"total":0,"spent":0,"contributions":[],"holder":"Anna","settled_debts":[{"id":"s2","from":"Anna","to":"Raf","amount":3}]}'::jsonb));
  if r->>'error' is not null then raise exception 'FAIL legacy sync error %', r; end if;
  select count(*) into n from members where trip_id='T1'; if n<>4 then raise exception 'FAIL members deleted (%)', n; end if;
  select count(*) into n from groups where trip_id='T1'; if n<>1 then raise exception 'FAIL group deleted'; end if;
  if (select name from trips where id='T1')<>'Trip one' then raise exception 'FAIL trip renamed'; end if;
  if (select amount from expenses where id='00000000-0000-0000-0000-000000000001')<>100 then raise exception 'FAIL legacy edited others expense'; end if;
  if (select name from expenses where id='00000000-0000-0000-0000-000000000009')<>'Other trip' then raise exception 'FAIL cross-trip overwrite'; end if;
  if not exists (select 1 from expenses where id='00000000-0000-0000-0000-000000000003') then raise exception 'FAIL new expense not added'; end if;
  select total into v from treasury where trip_id='T1'; if v<>100 then raise exception 'FAIL treasury total changed'; end if;
  if (select holder from treasury where trip_id='T1')<>'Raf' then raise exception 'FAIL holder changed'; end if;
  if (select jsonb_array_length(settled_debts) from treasury where trip_id='T1')<>2 then raise exception 'FAIL settlements merge'; end if;
  raise notice 'PASS legacy snapshot cannot delete/rename/overwrite; can add expense + settlement';

  -- 4. keyed member: edit own ok, others not; settlement for other side rejected
  r := sync_trip_data('inv1', jsonb_build_object('member_key',kanna,
     'expenses','[{"id":"00000000-0000-0000-0000-000000000002","name":"Taxi","amount":25,"paid_by":"Anna","participants":["Anna","Igor"]},
                  {"id":"00000000-0000-0000-0000-000000000001","name":"Hotel","amount":2,"paid_by":"Anna","participants":["Anna"]}]'::jsonb,
     'treasury','{"settled_debts":[{"id":"s3","from":"Raf","to":"Co","amount":9},{"id":"s4","from":"Igor","to":"Raf","amount":1}]}'::jsonb));
  if (select amount from expenses where id='00000000-0000-0000-0000-000000000002')<>25 then raise exception 'FAIL own edit'; end if;
  if (select amount from expenses where id='00000000-0000-0000-0000-000000000001')<>100 then raise exception 'FAIL edited others'; end if;
  if exists (select 1 from treasury t, jsonb_array_elements(t.settled_debts) d where t.trip_id='T1' and d->>'id'='s3') then raise exception 'FAIL foreign settlement accepted'; end if;
  if not exists (select 1 from treasury t, jsonb_array_elements(t.settled_debts) d where t.trip_id='T1' and d->>'id'='s4') then raise exception 'FAIL group-mate settlement rejected'; end if;
  raise notice 'PASS keyed member: own edits only, settlements of own group only';

  -- 5. granular RPCs
  r := delete_expense('inv1','00000000-0000-0000-0000-000000000001'::uuid, jsonb_build_object('member_key',kanna));
  if r->>'error'<>'not_your_expense' then raise exception 'FAIL delete others %', r; end if;
  r := upsert_expense('inv1', jsonb_build_object('id','00000000-0000-0000-0000-000000000001','name','x','amount',1,'paid_by','Anna','participants','["Anna"]'::jsonb,'member_key',kanna));
  if r->>'error'<>'not_your_expense' then raise exception 'FAIL upsert others %', r; end if;
  r := upsert_expense('inv1', jsonb_build_object('id','00000000-0000-0000-0000-000000000009','name','x','amount',1,'paid_by','Anna','participants','["Anna"]'::jsonb));
  if (select name from expenses where id='00000000-0000-0000-0000-000000000009')<>'Other trip' then raise exception 'FAIL upsert cross-trip'; end if;
  r := set_expense_avatar('inv1','00000000-0000-0000-0000-000000000002'::uuid,'taxi', jsonb_build_object('member_key',kanna));
  if (r->>'ok') is null then raise exception 'FAIL own avatar %', r; end if;
  r := set_expense_avatar('inv1','00000000-0000-0000-0000-000000000002'::uuid,'hotel');  -- old app signature
  if (r->>'ok') is null then raise exception 'FAIL legacy avatar %', r; end if;
  r := delete_expense('inv1','00000000-0000-0000-0000-000000000002'::uuid, jsonb_build_object('member_key',kanna));
  if exists (select 1 from expenses where id='00000000-0000-0000-0000-000000000002') then raise exception 'FAIL own delete'; end if;
  raise notice 'PASS granular RPCs';

  -- 6. co-admin by key can manage members/groups; admin rename keeps the row
  r := sync_trip_data('inv1', jsonb_build_object('member_key',kco,
     'renames','[{"from":"Igor","to":"Igor K"}]'::jsonb,
     'members','[{"name":"Raf","is_admin":true},{"name":"Anna"},{"name":"Igor K"},{"name":"Co","is_admin":true},{"name":"New"}]'::jsonb,
     'groups','[{"id":"00000000-0000-0000-0000-0000000000a1","type":"couple","members":["Anna","Igor K"]}]'::jsonb));
  if not exists (select 1 from members where trip_id='T1' and name='Igor K' and claimed_device='dev-igor' and key_hash is not null) then raise exception 'FAIL rename lost device/key'; end if;
  if not exists (select 1 from members where trip_id='T1' and name='New') then raise exception 'FAIL co-admin add member'; end if;
  if not (select is_admin from members where trip_id='T1' and name='Raf') then raise exception 'FAIL owner lost admin'; end if;
  raise notice 'PASS co-admin via key; rename keeps device + key';

  -- 7. co-admin cannot demote the owner; admin token can
  r := sync_trip_data('inv1', jsonb_build_object('member_key',kco,
     'members','[{"name":"Raf","is_admin":false},{"name":"Anna"},{"name":"Igor K"},{"name":"Co","is_admin":true},{"name":"New"}]'::jsonb,
     'groups','[{"id":"00000000-0000-0000-0000-0000000000a1","type":"couple","members":["Anna","Igor K"]}]'::jsonb));
  if not (select is_admin from members where trip_id='T1' and name='Raf') then raise exception 'FAIL co-admin demoted owner'; end if;
  raise notice 'PASS co-admin cannot demote admins';

  -- 8. admin token: full control, empty member list no longer wipes members
  r := sync_trip_data('inv1', jsonb_build_object('admin_token','adm1','members','[]'::jsonb,'groups','[]'::jsonb,
     'treasury','{"total":150,"spent":0,"contributions":[],"holder":"Co","settled_debts":[]}'::jsonb));
  select count(*) into n from members where trip_id='T1'; if n<5 then raise exception 'FAIL empty members wiped'; end if;
  if (select total from treasury where trip_id='T1')<>150 then raise exception 'FAIL admin treasury'; end if;
  raise notice 'PASS admin token';

  -- 9. enforcement switch
  reset role;
end $$;
reset role;
update trips set require_member_key=true where id='T1';
set role anon;
do $$ declare r jsonb; begin
  r := sync_trip_data('inv1','{"expenses":[]}'::jsonb);
  if r->>'error'<>'member_key_required' then raise exception 'FAIL enforce sync %', r; end if;
  r := delete_expense('inv1','00000000-0000-0000-0000-000000000003'::uuid);
  if r->>'error'<>'member_key_required' then raise exception 'FAIL enforce delete %', r; end if;
  begin perform admin_release_member_device('inv1','Raf','Anna'); raise exception 'FAIL enforce release';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'PASS enforcement mode';
end $$;
-- 10. history is recorded and not readable by anon
do $$ begin
  begin perform 1 from trip_history limit 1; raise exception 'FAIL anon reads history';
  exception when insufficient_privilege then raise notice 'PASS history hidden from anon'; end;
end $$;
reset role;
select table_name, op, count(*), string_agg(distinct coalesce(actor,'-'),',') actors from trip_history group by 1,2 order by 1,2;
