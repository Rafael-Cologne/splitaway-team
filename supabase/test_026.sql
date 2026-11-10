\set ON_ERROR_STOP 1
insert into trips(id,name,currency_code) values ('F1','Fam','EUR');
insert into trip_tokens(trip_id,invite_token,admin_token_hash) values ('F1','invf',encode(extensions.digest('admf','sha256'),'hex'));
insert into members(trip_id,name,is_admin) values ('F1','Raf',true),('F1','Igor',false),('F1','Elya',false),('F1','Bob',false);
insert into groups(id,trip_id,type,members) values ('00000000-0000-0000-0000-0000000000a1','F1','family','{Igor,Elya}');
set role anon;
do $$
declare r jsonb; ki text; ke text; kb text; img text := 'data:image/jpeg;base64,/9j/4AAQ'; g uuid := '00000000-0000-0000-0000-0000000000a1';
begin
  ki := claim_member_device('invf','Igor','d-i')->>'member_key'; ke := claim_member_device('invf','Elya','d-e')->>'member_key'; kb := claim_member_device('invf','Bob','d-b')->>'member_key';
  r := set_group_photo('invf',g,img,jsonb_build_object('member_key',ki)); if r->>'ok' is null then raise exception 'FAIL member set %',r; end if; raise notice 'PASS family member sets the family photo';
  r := set_group_photo('invf',g,null,jsonb_build_object('member_key',kb)); if r->>'error'<>'not_your_group' then raise exception 'FAIL outsider %',r; end if; raise notice 'PASS outsider cannot change it';
  r := set_group_photo('invf',g,null,null); if r->>'error'<>'not_your_group' then raise exception 'FAIL anon %',r; end if; raise notice 'PASS link-only (no key) cannot change it';
  r := set_group_photo('invf',g,'javascript:x',jsonb_build_object('member_key',ke)); if r->>'error'<>'invalid_photo' then raise exception 'FAIL bad %',r; end if; raise notice 'PASS non-image refused';
  r := set_group_photo('invf',g,null,jsonb_build_object('member_key',ke)); if r->>'ok' is null then raise exception 'FAIL other member remove %',r; end if; raise notice 'PASS another family member removes it';
  r := set_group_photo('invf',g,img,jsonb_build_object('admin_token','admf')); if r->>'ok' is null then raise exception 'FAIL admin %',r; end if; raise notice 'PASS admin sets it';
  r := sync_trip_data('invf', jsonb_build_object('admin_token','admf','trip',jsonb_build_object('id','F1','name','Fam','currency','EUR'),'members','[{"name":"Raf","is_admin":true},{"name":"Igor"},{"name":"Elya"},{"name":"Bob"}]'::jsonb,'expenses','[]'::jsonb,
       'groups','[{"id":"00000000-0000-0000-0000-0000000000a1","type":"family","label":null,"members":["Igor","Elya"]}]'::jsonb));
  if (select photo from groups where id=g) is distinct from img then raise exception 'FAIL sync dropped photo'; end if; raise notice 'PASS admin sync keeps the photo';
  if load_trip_data('invf')->'groups'->0->>'photo' is null then raise exception 'FAIL load'; end if; raise notice 'PASS delivered with the trip';
  r := set_group_photo('invf','00000000-0000-0000-0000-0000000000ff',null,jsonb_build_object('admin_token','admf')); if r->>'error'<>'group_not_found' then raise exception 'FAIL nf %',r; end if; raise notice 'PASS unknown group';
end $$;
reset role;
