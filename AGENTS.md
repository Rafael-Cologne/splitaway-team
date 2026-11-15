# Правила проекта Splitaway Team (для людей и ИИ-помощников)

Этот файл читают Claude, Codex и другие ИИ-помощники перед работой с кодом.
Если вы человек — эти правила тоже для вас.

## О проекте
- Splitaway Team — PWA для поездок: деление расходов + сервисы (гид, рядом, календарь, погода, чек-лист …).
- Учебный командный проект. Работаем строго по требованиям кураторов школы.
- Стек: JavaScript, HTML, CSS без фреймворка; Supabase (PostgreSQL); Netlify (хостинг + функции); Capacitor (Android).
- Язык интерфейса новых функций — **русский**. Существующие переводы не трогать.

## Git (обязательно, это часть оценки)
1. Каждая задача — отдельный Issue на доске «Splitaway Team Board» с исполнителем и критериями готовности.
2. Ветка от `develop`: `feature/<id>-<кратко>`, например `feature/guide-search`.
3. Перед началом: `git checkout develop` → `git pull` → `git checkout -b feature/...`.
4. Pull Request — **только в `develop`** (поле base = develop). В описании: `Closes #<номер issue>`.
5. Каждый PR проверяет другой участник (Approve). Напрямую в `main` и `develop` не пушим.
6. Маленькие PR: один экран или одна функция за раз.
7. `main` обновляет только тимлид через PR `develop → main` (каждая публикация стоит кредиты Netlify).

## Где писать код
- Модули сервисов: `public/js/modules/<id>.js` — **каждый работает только в своём файле**.
  Заготовки есть для всех 14 плиток: route, calendar, bookings, guide, translator, weather,
  checklist, transport, nearby, stats, emergency, offline, diary, assistant.
  («Расходы» и «Валюты» — встроенные функции приложения.)
- Кто над чем работает — смотрите доску «Splitaway Team Board»: у каждой плитки свой Issue
  «Модуль «…»», исполнитель указан в Assignees. Взять плитку = назначить себя в её Issue.
  Одна плитка — один ответственный. Не начинайте плитку, у которой уже есть исполнитель.
- Как устроен модуль — `public/js/modules/_template.js`. Модуль подключается вызовом
  `STHub.registerService('<id>', ctx => ctx.openScreen({ title, render(body, screen) {...} }))`.
- Стили — готовые классы из `public/css/hub.css` (`st-card`, `st-btn`, `st-btn-g`, `st-input`, `st-row`, `st-empty`).
  Свои стили модуля — через `STHub.addStyles('<id>', css)` с префиксом классов модуля.
- Иконки интерфейса — Lucide: `<i data-lucide="map-pin"></i>`.
- Не менять без согласования с тимлидом: `public/index.html`, `public/js/hub.js`,
  `public/js/services-config.js`, `public/css/hub.css`, `public/sw.js`, логику расходов и балансов.

## Данные и безопасность
- Пользовательский текст в HTML — только через экранирование (функция `esc` в шаблоне).
- База данных: новые таблицы и изменения — только SQL-миграцией в `supabase/migrations/`, после согласования с Александром.
- Никаких ключей и паролей в коде. Никаких платных API.
  Бесплатные источники: OpenStreetMap / Nominatim / Overpass, Wikipedia / Wikivoyage, Open-Meteo (погода).
- В приложении создаём только тестовые поездки с названием «TEST — …».

## Проверка перед PR
- `npm.cmd run dev` (Windows) → http://localhost:3000 → проверить свой модуль на ширине телефона (F12 → значок телефона).
- Нет ошибок в консоли браузера (F12 → Console).
- Главная, создание поездки и расходы по-прежнему работают.
