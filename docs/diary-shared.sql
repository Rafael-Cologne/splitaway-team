-- ============================================================
-- ПРЕДЛОЖЕНИЕ (не применено!) — общий дневник поездки
-- Для согласования с Александром. После согласования переносится
-- в supabase/migrations/ с номером по порядку и применяется им.
-- ------------------------------------------------------------
-- Сейчас модуль «Дневник» хранит записи только на устройстве
-- (личный режим). Для режима «Общий дневник поездки» нужны:
--   1) таблица записей, привязанных к поездке;
--   2) хранилище фото/аудио (Supabase Storage, приватный bucket);
--   3) правила доступа (RLS) такие же, как у остальных данных поездки:
--      читать/писать могут только участники этой поездки.
-- Личные записи (visibility = 'private') в базу не отправляются вовсе.
-- ============================================================

create table if not exists public.diary_entries (
  id          uuid primary key default gen_random_uuid(),
  trip_id     text        not null,              -- как в остальных таблицах поездки
  author      text        not null,              -- имя участника (как S.me)
  day         date        not null,
  title       text        not null default '',
  body        text        not null default '',
  place       jsonb,                             -- { "name": "...", "lat": 0, "lon": 0 }
  rating      smallint    check (rating between 0 and 5),
  mood        text        check (mood in ('good','ok','bad')),
  expense_ids text[]      not null default '{}', -- ссылки на существующие расходы, без копий
  media       jsonb       not null default '[]', -- [{ "id", "type": "photo|video|audio", "path", "cap", "text" }]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists diary_entries_trip_day on public.diary_entries (trip_id, day);

alter table public.diary_entries enable row level security;

-- RLS: доступ только участникам поездки.
-- ВАЖНО: условие нужно взять то же, что уже используется для expenses
-- в нашей базе (проверка участника поездки). Здесь — заготовка:
-- create policy diary_select on public.diary_entries for select using ( <условие участника trip_id> );
-- create policy diary_write  on public.diary_entries for all    using ( <условие участника trip_id> ) with check ( <условие участника trip_id> );

-- Хранилище медиа: приватный bucket 'diary', путь  <trip_id>/<entry_id>/<file_id>
-- insert into storage.buckets (id, name, public) values ('diary', 'diary', false) on conflict do nothing;
-- Политики storage — по тому же условию участника поездки (первая часть пути = trip_id).
