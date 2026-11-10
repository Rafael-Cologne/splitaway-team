-- Compact, read-only support views for Supabase Table Editor.
-- Schema support has no USAGE or SELECT grants for anon/authenticated.

create or replace view support.trip_list as
select r.trip_id, r.trip_name, r.status,
       case when r.trip_id like 'DEMO-%' then 'demo' else 'trip' end as kind,
       r.created_at,
       r.status_at,
       coalesce(t.dest, s.payload->'trip'->>'dest') as destination,
       coalesce(t.currency_code, s.payload->'trip'->>'currency_code') as currency,
       case when r.status='deleted' then jsonb_array_length(s.payload->'members')
            else (select count(*) from public.members m where m.trip_id=r.trip_id) end as participants,
       case when r.status='deleted' then jsonb_array_length(s.payload->'expenses')
            else (select count(*) from public.expenses e where e.trip_id=r.trip_id) end as expenses,
       case when r.status='deleted' then
         (select coalesce(sum((e->>'amount')::numeric),0) from jsonb_array_elements(s.payload->'expenses') e)
            else (select coalesce(sum(e.amount),0) from public.expenses e where e.trip_id=r.trip_id) end as total_expenses,
       s.deleted_at
from support.trip_registry r
left join public.trips t on t.id=r.trip_id
left join support.deleted_trips s on s.id=r.last_snapshot_id;

create or replace view support.trip_members as
select r.trip_id, r.trip_name, r.status, m.name as member_name, m.gender, m.is_admin, m.created_at
from support.trip_registry r
join public.members m on m.trip_id=r.trip_id
where r.status<>'deleted'
union all
select r.trip_id, r.trip_name, r.status, m.name, m.gender, m.is_admin, m.created_at
from support.trip_registry r
join support.deleted_trips s on s.id=r.last_snapshot_id
cross join lateral jsonb_to_recordset(s.payload->'members')
  as m(name text,gender text,is_admin boolean,created_at timestamptz)
where r.status='deleted';

create or replace view support.trip_expenses as
select r.trip_id,r.trip_name,r.status,e.id as expense_id,e.date as expense_date,
       e.name as expense_name,e.amount as amount_base,
       coalesce(e.base_currency_code,t.currency_code) as base_currency,
       e.original_amount,e.original_currency_code as original_currency,
       e.paid_by,e.participants,e.comment,e.from_treasury
from support.trip_registry r
join public.trips t on t.id=r.trip_id
join public.expenses e on e.trip_id=r.trip_id
where r.status<>'deleted'
union all
select r.trip_id,r.trip_name,r.status,e.id,e.date,e.name,e.amount,
       coalesce(e.base_currency_code,s.payload->'trip'->>'currency_code'),
       e.original_amount,e.original_currency_code,e.paid_by,e.participants,e.comment,e.from_treasury
from support.trip_registry r
join support.deleted_trips s on s.id=r.last_snapshot_id
cross join lateral jsonb_to_recordset(s.payload->'expenses')
  as e(id uuid,date date,name text,amount numeric,base_currency_code text,
       original_amount numeric,original_currency_code text,paid_by text,
       participants text[],comment text,from_treasury boolean)
where r.status='deleted';

create or replace view support.trip_groups as
select r.trip_id,r.trip_name,r.status,g.label as group_name,g.type as group_type,g.members,g.together
from support.trip_registry r
join public.groups g on g.trip_id=r.trip_id
where r.status<>'deleted'
union all
select r.trip_id,r.trip_name,r.status,g.label,g.type,g.members,g.together
from support.trip_registry r
join support.deleted_trips s on s.id=r.last_snapshot_id
cross join lateral jsonb_to_recordset(s.payload->'groups')
  as g(label text,type text,members text[],together boolean)
where r.status='deleted';

create or replace view support.trip_treasury as
select r.trip_id,r.trip_name,r.status,t.total,t.spent,t.holder,t.contributions,t.settled_debts
from support.trip_registry r
join public.treasury t on t.trip_id=r.trip_id
where r.status<>'deleted'
union all
select r.trip_id,r.trip_name,r.status,t.total,t.spent,t.holder,t.contributions,t.settled_debts
from support.trip_registry r
join support.deleted_trips s on s.id=r.last_snapshot_id
cross join lateral jsonb_to_recordset(s.payload->'treasury')
  as t(total numeric,spent numeric,holder text,contributions jsonb,settled_debts jsonb)
where r.status='deleted';

-- The previous raw JSON view was difficult to browse in Table Editor.
drop view if exists support.trip_details;
revoke all on support.trip_list,support.trip_members,support.trip_expenses,
  support.trip_groups,support.trip_treasury from public, anon, authenticated;
