-- ============================================================
-- Миграция 027: личный ключ входа по номеру
-- Автор черновика: Рафаэль (+ Claude). Ревью и применение: Александр.
-- Только ДОБАВЛЯЕТ новую таблицу и 3 функции — существующие таблицы не меняются.
-- ------------------------------------------------------------
-- Как это работает (клиент: public/js/personal-key.js):
--   • Пользователь получает личный номер вида K7QM-2XPA-9RTD (60 бит случайности) и задаёт PIN.
--   • На телефоне список его поездок (код, приглашение, личный ключ участника, права админа)
--     шифруется ключом PBKDF2(номер + PIN) → AES-GCM.
--   • На сервер уходит ТОЛЬКО зашифрованный блок. Сервер не знает ни номера, ни PIN:
--       id    = SHA-256('st-key-id:'    || номер)  — по нему блок находят;
--       write = SHA-256('st-key-write:' || номер)  — без него блок нельзя перезаписать или удалить.
--     В базе хранится только SHA-256 от write (двойной хэш), чтобы утечка таблицы не давала права записи.
--   • На другом устройстве: номер + PIN → get_personal_key(id) → расшифровка на устройстве.
-- Прямой доступ к таблице закрыт (RLS без политик) — только через функции ниже, как у расходов (022b).
-- ============================================================

-- pgcrypto в этом проекте живёт в схеме extensions (см. миграцию 007) — поэтому extensions.digest(...)
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.personal_keys (
  id          text primary key check (id ~ '^[0-9a-f]{64}$'),   -- SHA-256 от номера
  write_hash  text not null   check (write_hash ~ '^[0-9a-f]{64}$'), -- SHA-256 от write-токена
  blob        text not null   check (length(blob) <= 20000),     -- зашифрованные данные (base64url)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.personal_keys enable row level security;
-- политик нет: anon/authenticated не читают и не пишут таблицу напрямую
revoke all on public.personal_keys from anon, authenticated;

-- Сохранить / обновить ключ. Первая запись создаёт его, дальше нужен тот же write-токен.
create or replace function public.save_personal_key(p_id text, p_write text, p_blob text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_hash text;
begin
  if p_id !~ '^[0-9a-f]{64}$' or p_write !~ '^[0-9a-f]{64}$' or p_blob is null or length(p_blob) > 20000 then
    return jsonb_build_object('error', 'bad_input');
  end if;
  v_hash := encode(extensions.digest(p_write, 'sha256'), 'hex');
  insert into personal_keys (id, write_hash, blob) values (p_id, v_hash, p_blob)
  on conflict (id) do update set blob = excluded.blob, updated_at = now()
    where personal_keys.write_hash = v_hash;
  if not found then return jsonb_build_object('error', 'forbidden'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Получить зашифрованный блок по id (расшифровать его можно только с номером и PIN).
create or replace function public.get_personal_key(p_id text)
returns jsonb language sql security definer set search_path to 'public' stable as $$
  select case when p_id ~ '^[0-9a-f]{64}$'
    then (select jsonb_build_object('blob', blob, 'updated_at', updated_at) from personal_keys where id = p_id)
    else null end;
$$;

-- Удалить ключ (при выпуске нового ключа старый номер перестаёт работать).
create or replace function public.delete_personal_key(p_id text, p_write text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  delete from personal_keys where id = p_id and write_hash = encode(extensions.digest(p_write, 'sha256'), 'hex');
  return jsonb_build_object('ok', found);
end $$;

revoke all on function public.save_personal_key(text, text, text) from public;
revoke all on function public.get_personal_key(text) from public;
revoke all on function public.delete_personal_key(text, text) from public;
grant execute on function public.save_personal_key(text, text, text) to anon, authenticated;
grant execute on function public.get_personal_key(text) to anon, authenticated;
grant execute on function public.delete_personal_key(text, text) to anon, authenticated;

-- Проверка (вручную, после применения):
--   select save_personal_key(repeat('a',64), repeat('b',64), 'test');   -- ok
--   select save_personal_key(repeat('a',64), repeat('c',64), 'hack');   -- forbidden
--   select get_personal_key(repeat('a',64));                            -- {"blob":"test",…}
--   select delete_personal_key(repeat('a',64), repeat('b',64));         -- ok

-- PostgREST должен увидеть новые функции сразу:
notify pgrst, 'reload schema';
