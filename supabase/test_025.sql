\set ON_ERROR_STOP 1
insert into trips(id,name,currency_code) values ('G1','G','EUR');
insert into trip_tokens(trip_id,invite_token,admin_token_hash) values ('G1','invg',encode(extensions.digest('admg','sha256'),'hex'));
insert into members(trip_id,name,is_admin) values ('G1','Raf',true),('G1','Anna',false),('G1','Igor',false);
set role anon;
do $$ declare r jsonb; m jsonb := '[{"name":"Raf","is_admin":true},{"name":"Anna"},{"name":"Igor"}]';
begin
  r := sync_trip_data('invg', jsonb_build_object('admin_token','admg','trip',jsonb_build_object('id','G1','name','G','currency','EUR'),'members',m,'expenses','[]'::jsonb,
       'groups','[{"id":"00000000-0000-0000-0000-0000000000f1","type":"family","label":null,"members":["Anna","Igor"],"together":true}]'::jsonb));
  if r->>'ok' is null then raise exception 'FAIL %',r; end if;
  if (select together from groups where trip_id='G1') is not true then raise exception 'FAIL not stored'; end if; raise notice 'PASS admin stores together=true';
  r := sync_trip_data('invg', jsonb_build_object('admin_token','admg','trip',jsonb_build_object('id','G1','name','G'),'members',m,'expenses','[]'::jsonb,
       'groups','[{"id":"00000000-0000-0000-0000-0000000000f1","type":"family","label":null,"members":["Anna","Igor"]}]'::jsonb));
  if (select together from groups where trip_id='G1') is not true then raise exception 'FAIL old app reset it'; end if; raise notice 'PASS old app (no field) keeps it';
  r := sync_trip_data('invg', jsonb_build_object('admin_token','admg','trip',jsonb_build_object('id','G1','name','G','currency','EUR'),'members',m,'expenses','[]'::jsonb,
       'groups','[{"id":"00000000-0000-0000-0000-0000000000f1","type":"family","label":null,"members":["Anna","Igor"],"together":false}]'::jsonb));
  if (select together from groups where trip_id='G1') is not false then raise exception 'FAIL off'; end if; raise notice 'PASS admin switches it off';
  r := sync_trip_data('invg', jsonb_build_object('trip',jsonb_build_object('id','G1','name','G','currency','EUR'),'members',m,'expenses','[]'::jsonb,
       'groups','[{"id":"00000000-0000-0000-0000-0000000000f1","type":"family","label":null,"members":["Anna","Igor"],"together":true}]'::jsonb));
  if (select together from groups where trip_id='G1') is not false then raise exception 'FAIL member changed it'; end if; raise notice 'PASS non-admin cannot change it';
  r := sync_trip_data('invg', jsonb_build_object('admin_token','admg','trip',jsonb_build_object('id','G1','name','G','currency','USD'),'members',m,'expenses','[]'::jsonb,'groups','[]'::jsonb));
  if r->>'error'<>'currency_changed' then raise exception 'FAIL guard %',r; end if; raise notice 'PASS currency guard still in front';
  if (load_trip_data('invg')->'groups'->0->>'together') <> 'false' then raise exception 'FAIL load'; end if; raise notice 'PASS delivered with the trip';
  begin perform _sa_sync_trip_data_core('invg','{}'); raise exception 'FAIL core callable'; exception when insufficient_privilege then raise notice 'PASS core hidden'; end;
end $$;
reset role;
