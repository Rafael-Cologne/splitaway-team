\set ON_ERROR_STOP 1
insert into trips(id,name,currency_code) values ('P1','Photo','EUR');
insert into trip_tokens(trip_id,invite_token,admin_token_hash) values ('P1','invp',encode(extensions.digest('admp','sha256'),'hex'));
insert into members(trip_id,name,is_admin,claimed_device) values ('P1','Raf',true,null),('P1','Anna',false,null),('P1','Igor',false,null);
set role anon;
do $$
declare r jsonb; kr text; ka text; ki text; img text := 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
begin
  kr := claim_member_device('invp','Raf','d-r')->>'member_key'; ka := claim_member_device('invp','Anna','d-a')->>'member_key'; ki := claim_member_device('invp','Igor','d-i')->>'member_key';
  r := set_member_photo('invp','Anna',img,jsonb_build_object('member_key',ka)); if r->>'ok' is null then raise exception 'FAIL own set %',r; end if; raise notice 'PASS member sets own photo';
  r := set_member_photo('invp','Anna','data:image/jpeg;base64,AAAA',jsonb_build_object('member_key',ki)); if r->>'error'<>'not_your_photo' then raise exception 'FAIL other set %',r; end if; raise notice 'PASS other member cannot replace it';
  r := set_member_photo('invp','Anna',null,jsonb_build_object('member_key',ki)); if r->>'error'<>'not_your_photo' then raise exception 'FAIL other delete %',r; end if; raise notice 'PASS other member cannot delete it';
  r := set_member_photo('invp','Anna','data:image/jpeg;base64,AAAA',jsonb_build_object('admin_token','admp')); if r->>'error'<>'not_your_photo' then raise exception 'FAIL admin set %',r; end if; raise notice 'PASS admin cannot replace it';
  r := set_member_photo('invp','Anna','data:image/jpeg;base64,AAAA',null); if r->>'error'<>'not_your_photo' then raise exception 'FAIL anon set %',r; end if; raise notice 'PASS link-only (no key) cannot set';
  r := set_member_photo('invp','Raf','javascript:alert(1)',jsonb_build_object('member_key',kr)); if r->>'error'<>'invalid_photo' then raise exception 'FAIL bad %',r; end if;
  r := set_member_photo('invp','Raf','data:image/jpeg;base64,'||repeat('A',100001),jsonb_build_object('member_key',kr)); if r->>'error'<>'invalid_photo' then raise exception 'FAIL big %',r; end if; raise notice 'PASS non-image / too big refused';
  if (select photo from members where trip_id='P1' and name='Anna')<>img then raise exception 'FAIL photo changed'; end if;
  r := set_member_photo('invp','Anna',null,jsonb_build_object('admin_token','admp')); if r->>'ok' is null then raise exception 'FAIL admin delete %',r; end if; raise notice 'PASS admin (token) removes it';
  r := set_member_photo('invp','Anna',img,jsonb_build_object('member_key',ka));
  r := set_member_photo('invp','Anna',null,jsonb_build_object('member_key',kr)); if r->>'ok' is null then raise exception 'FAIL admin key delete %',r; end if; raise notice 'PASS admin (own key) removes it';
  r := set_member_photo('invp','Anna',img,jsonb_build_object('member_key',ka));
  r := set_member_photo('invp','Anna',null,jsonb_build_object('member_key',ka)); if r->>'ok' is null then raise exception 'FAIL own delete %',r; end if; raise notice 'PASS member removes own photo';
  r := set_member_photo('invp','Anna',img,jsonb_build_object('member_key',ka));
  r := sync_trip_data('invp', jsonb_build_object('admin_token','admp','trip',jsonb_build_object('id','P1','name','Photo','currency','EUR'),'members','[{"name":"Raf","is_admin":true},{"name":"Anja"},{"name":"Igor"}]'::jsonb,'groups','[]'::jsonb,'expenses','[]'::jsonb,'renames','[{"from":"Anna","to":"Anja"}]'::jsonb));
  if (select photo from members where trip_id='P1' and name='Anja') is distinct from img then raise exception 'FAIL photo lost on sync/rename'; end if; raise notice 'PASS photo survives admin sync and rename';
  if (load_trip_data('invp')->'members'->1->>'photo') is null and (load_trip_data('invp')->'members'->0->>'photo') is null and (load_trip_data('invp')->'members'->2->>'photo') is null then raise exception 'FAIL not loaded'; end if; raise notice 'PASS photo is delivered with the trip';
end $$;
reset role;
