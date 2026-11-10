\set ON_ERROR_STOP 1
insert into trips(id,name,currency_code,secondary_currency_code) values ('T1','Trip one','EUR','CZK'),('T2','Legacy',null,null),('T3','No admin','EUR',null);
insert into trip_tokens(trip_id,invite_token,admin_token_hash) values
 ('T1','inv1',encode(extensions.digest('adm1','sha256'),'hex')),('T2','inv2',encode(extensions.digest('adm2','sha256'),'hex')),('T3','inv3',null);
insert into members(trip_id,name,is_admin) values ('T1','Raf',true),('T1','Anna',false),('T2','Zed',true);
insert into treasury(trip_id,total,spent,contributions,holder,settled_debts) values ('T1',100,20,'[{"member":"Raf","amount":100}]','Raf','[{"id":"s1","from":"Anna","to":"Raf","amount":5}]'),('T2',0,0,'[]',null,'[]'),('T3',0,0,'[]',null,'[]');
insert into expenses(id,trip_id,name,amount,paid_by,participants,created_by) values
 ('00000000-0000-0000-0000-000000000001','T1','Hotel',100,'Raf','{Raf,Anna}','Raf'),
 ('00000000-0000-0000-0000-000000000002','T1','Taxi',20,'Anna','{Raf,Anna}','Anna'),
 ('00000000-0000-0000-0000-000000000003','T2','Old',10,'Zed','{Zed}','Zed');
set role anon;
do $$
declare r jsonb; ex jsonb; v numeric; c text; s text;
begin
  ex := '[{"id":"00000000-0000-0000-0000-000000000001","amount":2500,"items":[],"splits":null,"original_amount":100,"original_currency_code":"EUR","fx_rate":25,"fx_rate_date":"2026-11-04","fx_rate_source":"ECB"}]';
  r := change_trip_currency('inv1','WRONG','EUR','CZK',25,ex,null);
  if r->>'error' is null then raise exception 'FAIL wrong admin accepted %',r; end if; raise notice 'PASS wrong admin key refused';
  r := change_trip_currency('inv1','adm1','EUR','CZK',25,ex,null);
  if r->>'error'<>'expenses_out_of_date' then raise exception 'FAIL missing expense not detected %',r; end if; raise notice 'PASS incomplete list refused (nothing changed)';
  select amount into v from expenses where id='00000000-0000-0000-0000-000000000001'; if v<>100 then raise exception 'FAIL partial write'; end if;
  r := change_trip_currency('inv1','adm1','USD','CZK',25,ex,null);
  if r->>'error'<>'currency_changed' then raise exception 'FAIL wrong from %',r; end if; raise notice 'PASS stale source currency refused';
  r := change_trip_currency('inv3',null,'EUR','CZK',25,'[]',null);
  if r->>'error'<>'admin_token_required' then raise exception 'FAIL no-admin trip %',r; end if; raise notice 'PASS trip without admin key refused';
  ex := ex || '[{"id":"00000000-0000-0000-0000-000000000002","amount":500,"items":[{"name":"x","price":500}],"splits":{"Raf":250,"Anna":250},"original_amount":20,"original_currency_code":"EUR","fx_rate":25}]';
  r := change_trip_currency('inv1','adm1','EUR','CZK',25,ex,'{"total":2500,"spent":500,"contributions":[{"member":"Raf","amount":2500}],"settled_debts":[{"id":"s1","from":"Anna","to":"Raf","amount":125}]}');
  if r->>'ok' is null or r->>'currency_code'<>'CZK' or r->>'secondary_currency_code'<>'EUR' then raise exception 'FAIL change %',r; end if;
  raise notice 'PASS change EUR→CZK ok, second currency swapped to EUR';
  select currency_code, secondary_currency_code into c,s from trips where id='T1';
  select sum(amount) into v from expenses where trip_id='T1'; if v<>3000 or c<>'CZK' then raise exception 'FAIL stored % %',v,c; end if;
  select total into v from treasury where trip_id='T1'; if v<>2500 then raise exception 'FAIL treasury'; end if;
  if (select base_currency_code from expenses where id='00000000-0000-0000-0000-000000000002')<>'CZK' then raise exception 'FAIL base code'; end if;
  if (select splits->>'Anna' from expenses where id='00000000-0000-0000-0000-000000000002')<>'250' then raise exception 'FAIL splits'; end if;
  raise notice 'PASS expenses, splits, cash box and settled debts stored';
  -- guard: an app still on EUR is refused, an app on CZK and an old app (no currency) pass
  r := sync_trip_data('inv1','{"trip":{"id":"T1","name":"Trip one","currency":"EUR"},"members":[{"name":"Raf","is_admin":true},{"name":"Anna"}],"groups":[],"expenses":[{"id":"00000000-0000-0000-0000-000000000001","name":"Hotel","amount":100,"paid_by":"Raf","participants":["Raf","Anna"]}]}');
  if r->>'error'<>'currency_changed' then raise exception 'FAIL stale sync accepted %',r; end if;
  if (select amount from expenses where id='00000000-0000-0000-0000-000000000001')<>2500 then raise exception 'FAIL stale sync wrote'; end if;
  raise notice 'PASS stale app (EUR) sync refused, amounts untouched';
  r := upsert_expense('inv1','{"id":"00000000-0000-0000-0000-000000000001","name":"Hotel","amount":100,"paid_by":"Raf","participants":["Raf","Anna"],"trip_currency":"EUR","admin_token":"adm1"}');
  if r->>'error'<>'currency_changed' then raise exception 'FAIL stale upsert %',r; end if;
  r := upsert_expense_with_currency('inv1','{"id":"00000000-0000-0000-0000-000000000001","name":"Hotel","amount":100,"paid_by":"Raf","participants":["Raf","Anna"],"trip_currency":"EUR","admin_token":"adm1"}');
  if r->>'error'<>'currency_changed' then raise exception 'FAIL stale upsert fx %',r; end if;
  raise notice 'PASS stale app single-expense saves refused';
  r := sync_trip_data('inv1','{"trip":{"id":"T1","name":"Trip one","currency":"CZK"},"admin_token":"adm1","members":[{"name":"Raf","is_admin":true},{"name":"Anna"}],"groups":[],"expenses":[]}');
  if r->>'error' is not null then raise exception 'FAIL current sync %',r; end if;
  r := sync_trip_data('inv1','{"trip":{"id":"T1","name":"Trip one"},"admin_token":"adm1","members":[{"name":"Raf","is_admin":true},{"name":"Anna"}],"groups":[],"expenses":[]}');
  if r->>'error' is not null then raise exception 'FAIL old-app sync %',r; end if;
  raise notice 'PASS current app and old app (no currency) sync normally';
  -- legacy trip without stored currency: app sends EUR → allowed; change from EUR works
  r := sync_trip_data('inv2','{"trip":{"id":"T2","name":"Legacy","currency":"EUR"},"admin_token":"adm2","members":[{"name":"Zed","is_admin":true}],"groups":[],"expenses":[]}');
  if r->>'error' is not null then raise exception 'FAIL legacy sync %',r; end if;
  r := change_trip_currency('inv2','adm2','EUR','USD',1.1,'[{"id":"00000000-0000-0000-0000-000000000003","amount":11,"original_amount":10,"original_currency_code":"EUR","fx_rate":1.1}]',null);
  if r->>'currency_code'<>'USD' then raise exception 'FAIL legacy change %',r; end if;
  raise notice 'PASS legacy trip (no currency stored) changes EUR→USD';
  begin perform _sa_sync_trip_data_core('inv1','{}'); raise exception 'FAIL core callable';
  exception when insufficient_privilege then raise notice 'PASS inner functions not callable by the app role'; end;
end $$;
reset role;
