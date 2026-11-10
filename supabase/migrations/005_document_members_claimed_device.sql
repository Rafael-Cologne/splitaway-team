-- ============================================================
-- Splitaway — Migration 005: document members.claimed_device
--
-- ЭТО МИГРАЦИЯ-ДОКУМЕНТАЦИЯ, А НЕ НОВАЯ ФУНКЦИОНАЛЬНОСТЬ.
--
-- Колонка members.claimed_device уже живёт в продакшен-базе
-- (тип text, nullable, без default), но никогда не была
-- закоммичена в трекаемые миграции этого репозитория.
-- Обнаружено при аудите 2026-08-28.
--
-- IF NOT EXISTS делает применение безопасным (идемпотентным)
-- на базе, где колонка уже существует.
-- ============================================================

-- Documents an already-live column missing from tracked migrations (found during 2026-08-28 audit).
ALTER TABLE members ADD COLUMN IF NOT EXISTS claimed_device TEXT DEFAULT NULL;
