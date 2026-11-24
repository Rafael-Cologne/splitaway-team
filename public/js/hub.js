// ============================================================
// Useaway (Splitaway Team) — главная страница (Travel Hub)
// ------------------------------------------------------------
// Новый главный экран поверх существующего приложения.
// Ничего не дублирует: создание поездки, вход по коду / QR,
// раздел расходов и калькулятор валют — существующие функции
// из index.html и js/fx-calculator.js. Хаб только вызывает их.
//
// Публичный API: window.STHub.show(view), .openExpenses(page), .handleBack()
// ============================================================
(function () {
  'use strict';

  // ---------- Тексты (ru / en / de, остальные языки → en) ----------
  const TXT = {
    ru: {
      brand: 'Useaway', tagline: 'Все инструменты для путешествий',
      create: 'Создать поездку', create_sub: 'Планируйте, делитесь и считайте расходы вместе',
      join_code: 'Ввести код приглашения', my_trips: 'Мои поездки',
      services: 'Сервисы', search: 'Поиск сервиса', nothing: 'Ничего не найдено',
      soon: 'В разработке', need_trip: 'Сначала создайте поездку или присоединитесь к ней',
      qa_expense: 'Расход', qa_invite: 'Пригласить', qa_members: 'Участники',
      trips: 'Поездки', new_trip: 'Создать новую поездку', new_trip_sub: 'Название, валюта и участники',
      join: 'Присоединиться по коду', join_sub: 'Введите код или отсканируйте QR',
      on_device: 'Поездки на этом устройстве', no_trips: 'Здесь появятся ваши поездки',
      current: 'Открыта', current_trip: 'Текущая поездка', home: 'Главная', saved: 'Сохранённое', profile: 'Профиль',
      language: 'Язык', theme: 'Тема', light: 'Светлая', dark: 'Тёмная', back: 'Назад', close: 'Закрыть',
      notifications: 'Уведомления',
      members: n => n + ' ' + plRu(n, 'участник', 'участника', 'участников')
    },
    en: {
      brand: 'Useaway', tagline: 'All your travel tools',
      create: 'Create a trip', create_sub: 'Plan, share and split costs together',
      join_code: 'Enter invite code', my_trips: 'My trips',
      services: 'Services', search: 'Search services', nothing: 'Nothing found',
      soon: 'Coming soon', need_trip: 'Create or join a trip first',
      qa_expense: 'Expense', qa_invite: 'Invite', qa_members: 'Members',
      trips: 'Trips', new_trip: 'Create a new trip', new_trip_sub: 'Name, currency and members',
      join: 'Join with a code', join_sub: 'Enter the code or scan a QR',
      on_device: 'Trips on this device', no_trips: 'Your trips will appear here',
      current: 'Open', current_trip: 'Current trip', home: 'Home', saved: 'Saved', profile: 'Profile',
      language: 'Language', theme: 'Theme', light: 'Light', dark: 'Dark', back: 'Back', close: 'Close',
      notifications: 'Notifications',
      members: n => n + (n === 1 ? ' member' : ' members')
    },
    de: {
      brand: 'Useaway', tagline: 'Alle Reise-Tools an einem Ort',
      create: 'Reise erstellen', create_sub: 'Gemeinsam planen, teilen und Kosten aufteilen',
      join_code: 'Einladungscode eingeben', my_trips: 'Meine Reisen',
      services: 'Dienste', search: 'Dienst suchen', nothing: 'Nichts gefunden',
      soon: 'In Entwicklung', need_trip: 'Erstelle zuerst eine Reise oder tritt einer bei',
      qa_expense: 'Ausgabe', qa_invite: 'Einladen', qa_members: 'Mitglieder',
      trips: 'Reisen', new_trip: 'Neue Reise erstellen', new_trip_sub: 'Name, Währung und Mitglieder',
      join: 'Mit Code beitreten', join_sub: 'Code eingeben oder QR scannen',
      on_device: 'Reisen auf diesem Gerät', no_trips: 'Hier erscheinen deine Reisen',
      current: 'Geöffnet', current_trip: 'Aktuelle Reise', home: 'Start', saved: 'Gespeichert', profile: 'Profil',
      language: 'Sprache', theme: 'Design', light: 'Hell', dark: 'Dunkel', back: 'Zurück', close: 'Schließen',
      notifications: 'Benachrichtigungen',
      members: n => n + (n === 1 ? ' Mitglied' : ' Mitglieder')
    }
  };
  function plRu(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  const lang = () => { try { return (typeof getLang === 'function' ? getLang() : 'en').slice(0, 2); } catch (_) { return 'en'; } };
  const tx = key => (TXT[lang()] || TXT.en)[key] ?? TXT.en[key];
  const svcTitle = s => s.title[lang()] || s.title.en || s.id;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = msg => { if (typeof toast === 'function') toast(msg); };
  const icons = root => { if (typeof initializeIcons === 'function') initializeIcons(root); };

  const LANGS = [
    ['ru', 'Русский'], ['en', 'English'], ['de', 'Deutsch'], ['fr', 'Français'], ['it', 'Italiano'],
    ['es', 'Español'], ['pt', 'Português'], ['pl', 'Polski'], ['el', 'Ελληνικά'], ['tr', 'Türkçe']
  ];

  // ---------- Состояние ----------
  let view = 'home';      // 'home' | 'trips'
  let query = '';         // поиск по сервисам
  let searchOpen = false;
  let moduleOpen = null;  // id открытого модуля или null
  let moduleBack = null;  // свой обработчик «назад» у экрана модуля (необязательно)

  // Реестр модулей: id сервиса → функция открытия (см. registerService)
  const HANDLERS = {};

  const $ = id => document.getElementById(id);
  const hasTrip = () => typeof S !== 'undefined' && !!S.trip && !!S.trip.id && Array.isArray(S.members) && S.members.length > 0;

  // ---------- Переключение слоёв: хаб / онбординг / раздел расходов ----------
  function setLayer(layer) {
    const hub = $('pg-hub'), ob = $('pg-ob'), app = $('pg-app'), mod = $('pg-module');
    if (hub) hub.style.display = layer === 'hub' ? 'flex' : 'none';
    if (mod) mod.style.display = layer === 'module' ? 'flex' : 'none';
    if (layer !== 'module') { moduleOpen = null; moduleBack = null; }
    if (ob) ob.style.display = layer === 'ob' ? '' : 'none';
    if (app) app.style.display = layer === 'app' ? 'flex' : 'none';
    window.scrollTo(0, 0);
  }

  function show(nextView) {
    if (nextView) view = nextView;
    setLayer('hub');
    render();
  }

  // Существующий раздел расходов (pg-app) на нужной вкладке
  function openExpenses(page) {
    if (!hasTrip()) { say(tx('need_trip')); show('trips'); return false; }
    setLayer('app');
    if (typeof goPage === 'function') goPage(page || 'pg-dash');
    icons();
    fillDashBg();
    return true;
  }
  // Фон экрана «Расходы» по месту поездки: город → фото города, только страна → флаг,
  // места нет → нейтральная картинка (как карточка поездки на главной)
  function fillDashBg() {
    const cov = $('dh-cover');
    if (!cov || !hasTrip()) return;
    // ключ — поездка + название + направление: сменили место в настройках → заставка обновится
    const id = [S.trip.id, S.trip.name || '', S.trip.dest || ''].join('|');
    // Заставка внутри карточки «Общие расходы» — по шаблону Рафаэля (флаг, силуэт города, природа, маршрут …)
    const set = r => {
      if (!r || cov.dataset.src === r.url) return;
      cov.dataset.src = r.url; cov.style.backgroundImage = tripBg(r.url);
      ['flag', 'photo', 'skyline', 'nature', 'route', 'travel', 'global', 'beach', 'city'].forEach(k => cov.classList.toggle('c-' + k, r.cover === k));
      cov.closest('.dh-hero')?.classList.add('has-cover');
      if (isFlag(r.url)) waveInto(cov, r.url);
    };
    if (cov.dataset.trip !== id) { cov.dataset.trip = id; delete cov.dataset.src; }
    if (!window.STPlacePhoto) return;
    const now = STPlacePhoto.peekTrip(S.trip, { width: 1400 });
    if (now) { set(now); return; }
    STPlacePhoto.forTrip(S.trip, { width: 1400 }).then(r => { if (r && hasTrip() && [S.trip.id, S.trip.name || '', S.trip.dest || ''].join('|') === id) { const pre = new Image(); pre.onload = () => set(r); pre.onerror = () => set(r); pre.src = r.url; } });
  }

  // Существующая форма создания поездки
  function openCreate() {
    setLayer('ob');
    if (typeof renderFirstRunPreferences === 'function') renderFirstRunPreferences();
    if (typeof startCreateFromSetup === 'function') startCreateFromSetup();
  }

  // Существующий экран входа по коду (там же кнопка камеры для QR)
  function openJoin() {
    setLayer('ob');
    if (typeof showOb === 'function') showOb('ob-s1');
    icons();
    setTimeout(() => $('ob-code')?.focus(), 50);
  }

  // ---------- Маршруты сервисов (поле route в services-config.js) ----------
  const ROUTES = {
    expenses: () => openExpenses('pg-dash'),
    currency: () => window.SplitawayFx?.openCalculator?.()
  };

  // Сервис активен, если модуль зарегистрировался сам или у него встроенный маршрут
  const isActive = s => !!HANDLERS[s.id] || (s.status === 'active' && !!ROUTES[s.route]);

  function openService(id) {
    const s = (window.ST_SERVICES || []).find(x => x.id === id);
    if (!s) return;
    if (!isActive(s)) { say(svcTitle(s) + ' — ' + tx('soon')); return; }
    if (s.requiresTrip && !hasTrip()) { say(tx('need_trip')); show('trips'); return; }
    if (HANDLERS[s.id]) { HANDLERS[s.id](moduleContext(s)); return; }
    ROUTES[s.route]();
  }

  // ---------- «Розетка» для модулей ----------
  // Модуль (js/modules/<id>.js) подключается одной строкой:
  //   STHub.registerService('guide', ctx => ctx.openScreen({ render: body => { ... } }));
  function registerService(id, handler) {
    if (typeof handler !== 'function') return;
    HANDLERS[id] = handler;
    const hub = $('pg-hub');
    if (hub && hub.style.display !== 'none') render();
  }

  // Небольшое хранилище модуля для текущей поездки (только на этом устройстве)
  function moduleStore(moduleId) {
    const key = name => 'st_mod_' + moduleId + '_' + (hasTrip() ? S.trip.id : 'none') + '_' + name;
    return {
      get(name, fallback) { try { const v = localStorage.getItem(key(name)); return v == null ? fallback : JSON.parse(v); } catch (_) { return fallback; } },
      set(name, value) { try { localStorage.setItem(key(name), JSON.stringify(value)); } catch (_) {} }
    };
  }

  // Всё, что модуль получает при открытии
  function moduleContext(s) {
    return {
      id: s.id,
      title: svcTitle(s),
      trip: hasTrip() ? S.trip : null,
      members: hasTrip() ? S.members.slice() : [],
      me: hasTrip() ? S.me : null,
      lang: lang(),
      toast: say,
      store: moduleStore(s.id),
      supabase: () => (typeof getSupabase === 'function' ? getSupabase() : Promise.resolve(null)), // async: const sb = await ctx.supabase()
      openScreen: opts => openScreen(Object.assign({ id: s.id, title: svcTitle(s) }, opts || {})),
      close: () => show('home')
    };
  }

  // Полноэкранный экран модуля: шапка «назад + заголовок», модуль рисует только содержимое
  function openScreen({ id, title, render: draw, action, onBack }) {
    let layer = $('pg-module');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'pg-module'; layer.className = 'hub mod-layer'; layer.style.display = 'none';
      document.body.appendChild(layer);
    }
    moduleOpen = id || 'module';
    layer.dataset.module = id || '';
    // action — одна кнопка справа или массив кнопок: [{ icon, label, cls, onClick }]
    const acts = Array.isArray(action) ? action.filter(Boolean) : (action ? [action] : []);
    layer.innerHTML =
      '<div class="hub-wrap mod-wrap"><div class="hub-title-row">' +
      `<button class="hub-icbtn st-back" type="button" data-hub="mod-back" aria-label="${esc(tx('back'))}"><i data-lucide="chevron-left"></i></button>` +
      `<h2 id="mod-title">${esc(title || '')}</h2>` +
      (acts.length ? '<div class="mod-acts">' + acts.map((a, i) => `<button class="hub-icbtn ${esc(a.cls || '')}" type="button" id="${i ? 'mod-action-' + (i + 1) : 'mod-action'}" aria-label="${esc(a.label || '')}"><i data-lucide="${esc(a.icon || 'plus')}"></i></button>`).join('') + '</div>' : '<span class="hub-icbtn-sp"></span>') +
      '</div><div class="mod-body" id="mod-body"></div></div>';
    setLayer('module');
    moduleOpen = id || 'module';
    moduleBack = typeof onBack === 'function' ? onBack : null;
    const body = $('mod-body');
    const api = {
      body,
      setTitle: t => { const h = $('mod-title'); if (h) h.textContent = t; },
      refresh: () => { body.innerHTML = ''; draw && draw(body, api); icons(layer); },
      close: () => show('home')
    };
    acts.forEach((a, i) => { if (typeof a.onClick === 'function') $(i ? 'mod-action-' + (i + 1) : 'mod-action').addEventListener('click', () => a.onClick(api)); });
    if (draw) draw(body, api);
    icons(layer);
    return api;
  }

  // Подключить CSS модуля один раз
  function addStyles(id, css) {
    if (document.getElementById('st-css-' + id)) return;
    const el = document.createElement('style'); el.id = 'st-css-' + id; el.textContent = css;
    document.head.appendChild(el);
  }

  // ---------- Поездки, сохранённые на этом устройстве ----------
  function localTrips() {
    const list = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('sw_')) continue;
        const raw = localStorage.getItem(key);
        if (!raw || raw[0] !== '{') continue;
        let d; try { d = JSON.parse(raw); } catch (_) { continue; }
        if (!d || !d.trip || !d.trip.id || key !== 'sw_' + d.trip.id) continue;
        list.push({ id: d.trip.id, name: d.trip.name || d.trip.id, dest: d.trip.dest || '', count: (d.members || []).length });
      }
    } catch (_) { /* localStorage недоступен — пустой список */ }
    const cur = hasTrip() ? S.trip.id : null;
    return list.sort((a, b) => (b.id === cur) - (a.id === cur) || a.name.localeCompare(b.name));
  }

  function openTrip(id) {
    if (hasTrip() && S.trip.id === id) { openExpenses('pg-dash'); return; }
    // Другую поездку открываем обычным запуском приложения:
    // он проверяет ключ участника и загружает свежие данные из Supabase.
    try { localStorage.setItem('sw_last', id); } catch (_) {}
    location.href = location.origin + location.pathname;
  }

  // ---------- Профиль: язык и тема (существующие setLang / setTheme) ----------
  function openProfile() {
    let ov = $('m-hub-profile');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'ov'; ov.id = 'm-hub-profile';
      ov.innerHTML = '<div class="mdl hub-sheet"></div>';
      document.body.appendChild(ov);
    }
    const cur = lang();
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    ov.firstChild.innerHTML =
      '<div class="mdl-handle"></div>' +
      `<div class="hub-sheet-hd"><div class="mdl-title">${esc(tx('profile'))}</div>` +
      `<button class="btn btn-g btn-sm btn-ic" type="button" data-hub="close-profile" aria-label="${esc(tx('close'))}"><i data-lucide="x" style="width:15px;height:15px"></i></button></div>` +
      `<div class="hub-sheet-lbl">${esc(tx('theme'))}</div><div class="hub-chips">` +
      ['light', 'dark'].map(m => `<button class="hub-chip${theme === m ? ' on' : ''}" type="button" data-hub="theme" data-v="${m}"><i data-lucide="${m === 'light' ? 'sun' : 'moon'}"></i>${esc(tx(m))}</button>`).join('') +
      `</div><div class="hub-sheet-lbl">${esc(tx('language'))}</div><div class="hub-chips">` +
      LANGS.map(([code, name]) => `<button class="hub-chip${cur === code ? ' on' : ''}" type="button" data-hub="lang" data-v="${code}">${esc(name)}</button>`).join('') +
      '</div>' + keyRow();
    if (!ov.classList.contains('open')) { if (typeof openModal === 'function') openModal('m-hub-profile'); else ov.classList.add('open'); }
    icons(ov);
  }

  // Личный ключ входа (js/personal-key.js): тёмный QR с замком — только для себя, в отличие от QR-приглашения
  function keyRow() {
    if (!window.STKey) return '';
    const k = STKey.status();
    const sub = !k.has ? (k.n ? 'Не создан — восстановить поездки на новом телефоне будет нельзя' : 'Появится, когда войдёте в поездку')
      : k.srv === 'replaced' ? 'Ключ заменён на другом устройстве — войдите по новому'
      : 'Кабинет: ' + k.n + ' ' + (k.n % 10 === 1 && k.n % 100 !== 11 ? 'поездка' : [2, 3, 4].includes(k.n % 10) && ![12, 13, 14].includes(k.n % 100) ? 'поездки' : 'поездок') + (k.fresh ? '' : ' · обновляется…');
    return `<div class="hub-sheet-lbl">Безопасность</div>` +
      `<button class="hub-row" type="button" data-hub="my-key" style="margin-top:4px"><i data-lucide="key-round" style="color:#d9962b"></i>` +
      `<span style="flex:1;min-width:0;text-align:left"><b style="display:block">Мой ключ входа</b><small style="color:var(--t2)">${esc(sub)}</small></span><i data-lucide="chevron-right"></i></button>`;
  }

  // Настройки и быстрые кнопки нижней панели.
  const NAV_DEFAULT = ['expenses', 'bookings', 'calendar'];
  const NAV_ICONS = { expenses:'wallet', trips:'plane', bookings:'bed-double', calendar:'calendar-days', route:'map', guide:'map-pinned', translator:'languages', currency:'coins', weather:'cloud-sun', checklist:'list-checks', transport:'car', nearby:'map-pin', stats:'chart-no-axes-column', emergency:'briefcase-medical', offline:'download', diary:'book-open', assistant:'sparkles' };
  function navOptions() {
    return [{ id:'expenses', label:'Расходы' }, { id:'trips', label:'Поездки' },
      ...(window.ST_SERVICES || []).filter(s => s.id !== 'expenses' && isActive(s)).map(s => ({ id:s.id, label:s.id === 'bookings' ? 'Брони' : s.title.ru || svcTitle(s) }))];
  }
  function navSlots() {
    const allowed = new Set(navOptions().map(x => x.id));
    let saved;
    try { saved = JSON.parse(localStorage.getItem('st_hub_nav_slots')); } catch (_) {}
    const result = [];
    const preferred = Array.isArray(saved) ? saved.slice(0, 3) : NAV_DEFAULT;
    for (let i = 0; i < 3; i++) {
      const id = preferred[i];
      result.push(allowed.has(id) && !result.includes(id) ? id : NAV_DEFAULT.find(x => allowed.has(x) && !result.includes(x)) || navOptions().find(x => !result.includes(x.id))?.id || 'expenses');
    }
    return result;
  }
  function saveNavSlot(index, id) {
    const slots = navSlots();
    const previous = slots.indexOf(id);
    if (previous >= 0 && previous !== index) slots[previous] = slots[index];
    slots[index] = id;
    try { localStorage.setItem('st_hub_nav_slots', JSON.stringify(slots)); } catch (_) {}
    render(); openNavSettings();
  }
  function navIcon(id) { return `<i data-lucide="${esc(id === 'home' ? 'house' : id === 'more' ? 'settings' : NAV_ICONS[id] || 'circle')}"></i>`; }
  function navLabel(id) { return id === 'home' ? 'Главная' : id === 'more' ? 'Настройки' : navOptions().find(o => o.id === id)?.label || id; }
  function navPreview(id) { return `<span class="hub-nav-preview-item">${navIcon(id)}<span>${esc(navLabel(id))}</span></span>`; }
  function openNavSettings() {
    let ov = $('m-hub-profile');
    if (!ov) { ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'm-hub-profile'; ov.innerHTML = '<div class="mdl hub-sheet"></div>'; document.body.appendChild(ov); }
    const slots = navSlots();
    ov.firstChild.innerHTML = '<div class="mdl-handle"></div><div class="hub-sheet-hd"><div class="mdl-title">Нижняя панель</div>' +
      `<button class="btn btn-g btn-sm btn-ic" type="button" data-hub="close-profile" aria-label="${esc(tx('close'))}"><i data-lucide="x"></i></button></div>` +
      '<div class="hub-sheet-lbl">Так выглядит ваша панель</div>' +
      `<div class="hub-nav-preview">${[slots[0], slots[1], 'home', slots[2], 'more'].map(navPreview).join('')}</div>` +
      '<div class="hub-sheet-lbl">Заменить быстрый раздел</div>' +
      slots.map((id, i) => `<div class="hub-nav-choice"><span class="hub-nav-choice-current">${navIcon(id)}<b>${esc(navLabel(id))}</b></span><button class="hub-nav-replace" type="button" data-hub="nav-pick" data-v="${i}" aria-label="Заменить ${esc(navLabel(id))}">Заменить <i data-lucide="chevron-right"></i></button></div>`).join('') +
      '<button class="btn btn-g btn-fw" type="button" data-hub="nav-reset">Вернуть стандартные кнопки</button>';
    if (!ov.classList.contains('open')) { if (typeof openModal === 'function') openModal('m-hub-profile'); else ov.classList.add('open'); }
    icons(ov);
  }
  function openNavPicker(index) {
    const ov = $('m-hub-profile'), slots = navSlots(), options = navOptions();
    if (!ov || !Number.isInteger(index) || index < 0 || index > 2) return;
    ov.firstChild.innerHTML = '<div class="mdl-handle"></div><div class="hub-sheet-hd">' +
      '<button class="hub-nav-picker-back" type="button" data-hub="nav-settings" aria-label="Назад"><i data-lucide="arrow-left"></i></button>' +
      `<div class="mdl-title">Заменить ${esc(navLabel(slots[index]))}</div>` +
      `<button class="btn btn-g btn-sm btn-ic" type="button" data-hub="close-profile" aria-label="${esc(tx('close'))}"><i data-lucide="x"></i></button></div>` +
      '<div class="hub-sheet-lbl">Выберите раздел для нижней панели</div><div class="hub-nav-options">' +
      options.map(o => `<button class="hub-nav-option${o.id === slots[index] ? ' on' : ''}" type="button" data-hub="nav-select" data-v="${esc(o.id)}" data-slot="${index}">${navIcon(o.id)}<span>${esc(o.label)}</span>${o.id === slots[index] ? '<i data-lucide="check"></i>' : ''}</button>`).join('') + '</div>';
    icons(ov);
  }

  // Настройки: профиль, нижняя панель и остальные разделы.
  function openMore() {
    let ov = $('m-hub-profile');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'ov'; ov.id = 'm-hub-profile';
      ov.innerHTML = '<div class="mdl hub-sheet"></div>';
      document.body.appendChild(ov);
    }
    const rows = [
      ['profile', 'user', 'Профиль и настройки', 'Язык и тема'],
      ['nav-settings', 'panel-bottom', 'Нижняя панель', 'Выбрать быстрые разделы'],
      ['saved', 'bookmark', 'Сохранённое', 'Места и идеи — скоро'],
      ['services', 'layout-grid', 'Все сервисы', 'Плитки на главной'],
      hasTrip() ? ['invite', 'qr-code', 'Пригласить в поездку', 'QR для друзей'] : null,
      window.STKey ? ['mykey', 'key-round', 'Мой ключ входа', 'Только для вас: вернуть поездки на новом телефоне'] : null,
      window.STKey ? ['keylogin', 'log-in', 'Войти по личному ключу', 'Открыть свой кабинет на этом устройстве'] : null
    ].filter(Boolean);
    ov.firstChild.innerHTML =
      '<div class="mdl-handle"></div>' +
      `<div class="hub-sheet-hd"><div class="mdl-title">Настройки</div>` +
      `<button class="btn btn-g btn-sm btn-ic" type="button" data-hub="close-profile" aria-label="${esc(tx('close'))}"><i data-lucide="x" style="width:15px;height:15px"></i></button></div>` +
      rows.map(([v, ic, t, sub]) => rowHtml('more', v, ic, esc(t), sub)).join('');
    if (!ov.classList.contains('open')) { if (typeof openModal === 'function') openModal('m-hub-profile'); else ov.classList.add('open'); }
    icons(ov);
  }

  // ---------- Разметка ----------
  function tileHtml(s) {
    // Иконки плиток — картинки из макета (public/img/hub/<icon>.webp); старый SVG — если картинки нет
    const svg = (window.ST_ICONS || {})[s.icon] || '';
    const icon = `<img src="/img/hub/${esc(s.icon)}.webp?v=2" alt="" draggable="false" onerror="this.replaceWith(document.createRange().createContextualFragment(this.dataset.svg||''))" data-svg="${esc(svg)}">`;
    const soon = isActive(s) ? '' : ' soon';
    return `<button class="hub-tile${soon}" type="button" data-hub="svc" data-v="${esc(s.id)}">` +
      `<span class="hub-ico">${icon}</span><span class="hub-lbl">${esc(svcTitle(s))}</span></button>`;
  }

  function servicesBody() {
    const q = query.trim().toLowerCase();
    const list = (window.ST_SERVICES || []).filter(s => s.status !== 'disabled')
      .filter(s => !q || Object.values(s.title).some(t => t.toLowerCase().includes(q)));
    return list.length ? `<div class="hub-grid">${list.map(tileHtml).join('')}</div>`
      : `<div class="hub-empty">${esc(tx('nothing'))}</div>`;
  }

  // Даты поездки — из модуля «Календарь», если указаны
  function tripDates(id) {
    try { const d = JSON.parse(localStorage.getItem('st_mod_calendar_' + id + '_dates')); return d && d.start ? d : null; } catch (_) { return null; }
  }
  function rangeText(a, b) {
    const A = new Date(a + 'T12:00'), B = new Date(b + 'T12:00');
    const f = o => new Intl.DateTimeFormat(lang(), o);
    if (A.getMonth() === B.getMonth()) return A.getDate() + ' – ' + f({ day: 'numeric', month: 'long' }).format(B);
    return f({ day: 'numeric', month: 'short' }).format(A) + ' – ' + f({ day: 'numeric', month: 'short' }).format(B);
  }
  // Флаг страны — «из шёлка» (STPlacePhoto.wavyFlag)
  const isFlag = url => /flagcdn\.com/.test(url || '');
  const tripBg = url => `url('${url}')`;
  function waveInto(el, url, asImg) {
    if (!isFlag(url) || !window.STPlacePhoto || !STPlacePhoto.wavyFlag) return;
    STPlacePhoto.wavyFlag(url, asImg ? 860 : 400) /* фон «Расходов» высокий */.then(d => { if (!d || !el.isConnected) return; if (asImg) { if (el.dataset.src === url) el.src = d; } else el.style.backgroundImage = `url('${d}')`; });
  }
  // Место поездки изменили в настройках → заставка обновляется сразу везде:
  // фон «Расходов», карточка на главной и картинки поездки в модулях (Дневник, Календарь, Погода, Бронирования)
  function refreshTripBg() {
    fillDashBg();
    if (window.STPlacePhoto && STPlacePhoto.refreshTrip && hasTrip()) STPlacePhoto.refreshTrip(S.trip);
    const el = $('hub-trip-ph');
    if (el) { delete el.dataset.photo; el.classList.remove('flag'); el.style.backgroundImage = tripBg('/img/trips/abstract.jpg'); fillTripPhoto(); }
  }
  function fillTripPhoto() {
    const el = $('hub-trip-ph');
    if (el && el.classList.contains('flag')) { const m = el.style.backgroundImage.match(/url\(["']?(https:[^"')]+)/); if (m) waveInto(el, m[1]); }
    if (!el || el.dataset.photo || !window.STPlacePhoto || !hasTrip()) return;
    const id = S.trip.id;
    STPlacePhoto.forTrip(S.trip, { width: 900 }).then(r => {
      if (!r || !hasTrip() || S.trip.id !== id) return;
      const img = new Image();
      img.onload = () => { const e = $('hub-trip-ph'); if (e) { e.style.backgroundImage = tripBg(r.url); e.classList.toggle('flag', isFlag(r.url)); e.dataset.photo = '1'; waveInto(e, r.url); } };
      img.src = r.url;
    });
  }

  function homeHtml() {
    let top;
    if (hasTrip()) {
      const t = S.trip;
      // Карточка поездки как в макете: текст слева, фото места справа (js/place-photo.js)
      const d = tripDates(t.id);
      const meta = [d ? rangeText(d.start, d.end) : t.dest, tx('members')(S.members.length)].filter(Boolean);
      const ph = window.STPlacePhoto ? STPlacePhoto.peekTrip(t, { width: 900 }) : null;
      top =
        '<button class="hub-trip2" type="button" data-hub="open-trip">' +
        // фото места; если места нет (поездка «Тест») — нейтральная абстрактная картинка
        `<span class="hub-trip2-ph on${ph && isFlag(ph.url) ? ' flag' : ''}" id="hub-trip-ph"${ph ? ' data-photo="1"' : ''} style="background-image:${esc(tripBg(ph ? ph.url : '/img/trips/abstract.jpg'))}"></span>` +
        `<span class="hub-trip2-txt"><span class="hub-trip2-k"><i data-lucide="plane"></i>${esc(tx('current_trip'))}</span>` +
        `<span class="hub-trip2-name">${esc(t.name)}</span>` +
        `<span class="hub-trip2-meta">${d ? '<i data-lucide="calendar-days"></i>' : ''}${meta.map(esc).join(' <b>•</b> ')}</span></span>` +
        '<span class="hub-trip2-go"><i data-lucide="chevron-right"></i></span></button>' +
        '<div class="hub-qa">' +
        `<button class="hub-qa-btn" type="button" data-hub="qa-expense"><i data-lucide="plus"></i><span>${esc(tx('qa_expense'))}</span></button>` +
        `<button class="hub-qa-btn" type="button" data-hub="qa-invite"><i data-lucide="qr-code"></i><span>${esc(tx('qa_invite'))}</span></button>` +
        `<button class="hub-qa-btn" type="button" data-hub="qa-members"><i data-lucide="users"></i><span>${esc(tx('qa_members'))} (${S.members.length})</span></button>` +
        '</div>';
    } else {
      top =
        '<button class="hub-hero" type="button" data-hub="create">' +
        '<span class="hub-hero-ic"><img src="/img/brand/useaway-mark-white.png" alt="" class="hub-hero-mark"></span>' +
        `<span class="hub-hero-txt"><span class="hub-hero-ttl">${esc(tx('create'))}</span><span class="hub-hero-sub">${esc(tx('create_sub'))}</span></span>` +
        '<span class="hub-hero-plus"><i data-lucide="plus"></i></span></button>' +
        '<div class="hub-row2">' +
        `<button class="hub-pill" type="button" data-hub="join"><i data-lucide="scan-line"></i><span>${esc(tx('join_code'))}</span></button>` +
        `<button class="hub-pill" type="button" data-hub="nav" data-v="trips"><i data-lucide="briefcase"></i><span>${esc(tx('my_trips'))}</span></button>` +
        '</div>' +
        (window.STKey ? '<button class="hub-row" type="button" data-hub="key-login" style="margin-top:2px"><i data-lucide="key-round" style="color:#d9962b"></i><span style="flex:1;min-width:0;text-align:left"><b style="display:block">Войти по личному ключу</b><small style="color:var(--t2)">Номер или QR с замком — ваши поездки с другого устройства</small></span><i data-lucide="chevron-right"></i></button>' : '');
    }
    const search = searchOpen
      ? `<label class="hub-search"><i data-lucide="search"></i><input id="hub-q" type="search" value="${esc(query)}" placeholder="${esc(tx('search'))}" autocomplete="off"></label>`
      : '';
    return top + `<div class="hub-sec-hd" id="hub-services">${esc(tx('services'))}</div>` + search +
      `<div id="hub-svc-body">${servicesBody()}</div>`;
  }

  function rowHtml(act, v, icon, title, sub, extra) {
    return `<button class="hub-row${extra || ''}" type="button" data-hub="${act}"${v ? ` data-v="${esc(v)}"` : ''}>` +
      `<span class="hub-row-ic"><i data-lucide="${icon}"></i></span>` +
      `<span class="hub-row-txt"><span class="hub-row-ttl">${title}</span><span class="hub-row-sub">${esc(sub)}</span></span>` +
      '<i data-lucide="chevron-right" class="hub-chev"></i></button>';
  }

  function tripsHtml() {
    const trips = localTrips();
    const cur = hasTrip() ? S.trip.id : null;
    const rows = trips.length
      ? trips.map(tr => rowHtml('trip', tr.id, 'briefcase',
          esc(tr.name) + (tr.id === cur ? ` <span class="hub-badge">${esc(tx('current'))}</span>` : ''),
          [tr.dest, tx('members')(tr.count)].filter(Boolean).join(' · '))).join('')
      : `<div class="hub-empty">${esc(tx('no_trips'))}</div>`;
    return '<div class="hub-title-row">' +
      `<button class="hub-icbtn" type="button" data-hub="nav" data-v="home" aria-label="${esc(tx('back'))}"><i data-lucide="chevron-left"></i></button>` +
      `<h2>${esc(tx('trips'))}</h2><span class="hub-icbtn-sp"></span></div>` +
      rowHtml('create', null, 'plus', esc(tx('new_trip')), tx('new_trip_sub'), ' hub-row-accent') +
      rowHtml('join', null, 'qr-code', esc(tx('join')), tx('join_sub')) +
      (window.STKey ? rowHtml('key-login', null, 'key-round', 'Войти по личному ключу', 'Номер или QR с замком — ваши поездки с другого устройства') : '') +
      `<div class="hub-sec-hd">${esc(tx('on_device'))}</div>` + rows;
  }

  // Главная по центру, Настройки справа; остальные три кнопки выбирает пользователь.
  function navHtml() {
    const options = navOptions();
    const slots = navSlots();
    const items = [slots[0], slots[1], 'home', slots[2], 'more'].map(id => [id, id === 'home' ? 'house' : id === 'more' ? 'settings' : NAV_ICONS[id] || 'circle', id === 'home' ? 'Главная' : id === 'more' ? 'Настройки' : options.find(o => o.id === id)?.label || id]);
    const active = view === 'trips' ? 'trips' : 'home';
    return '<nav class="hub-nav"><div class="hub-nav-in">' +
      items.map(([v, ic, label]) => `<button class="hub-ni${v === active ? ' on' : ''}" type="button" data-hub="nav" data-v="${v}"><i data-lucide="${ic}"></i><span>${esc(label)}</span></button>`).join('') +
      '</div></nav>';
  }

  function render() {
    const root = $('pg-hub');
    if (!root) return;
    const bell = hasTrip() && typeof openNotifPanel === 'function'
      ? `<button class="hub-icbtn" type="button" data-hub="bell" aria-label="${esc(tx('notifications'))}"><i data-lucide="bell"></i></button>` : '';
    root.innerHTML =
      '<div class="hub-wrap"><header class="hub-hd">' +
      `<div class="hub-brand"><img src="/img/brand/useaway-logo.png" alt="${esc(tx('brand'))}" class="hub-wordmark hub-wordmark-lt"><img src="/img/brand/useaway-logo-dark.png" alt="${esc(tx('brand'))}" class="hub-wordmark hub-wordmark-dk"></div>` +
      `<div class="hub-hd-act"><button class="hub-icbtn${searchOpen ? ' on' : ''}" type="button" data-hub="search" aria-label="${esc(tx('search'))}"><i data-lucide="search"></i></button>${bell}</div>` +
      `</header><main class="hub-main">${view === 'trips' ? tripsHtml() : homeHtml()}</main></div>` + navHtml();
    icons(root);
    fillTripPhoto();
    const q = $('hub-q');
    if (q) {
      q.addEventListener('input', () => { query = q.value; $('hub-svc-body').innerHTML = servicesBody(); });
      q.focus();
    }
  }

  // ---------- Клики (делегирование) ----------
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-hub]');
    if (!el) return;
    const act = el.dataset.hub, v = el.dataset.v;
    switch (act) {
      case 'svc': openService(v); break;
      case 'create': openCreate(); break;
      case 'join': openJoin(); break;
      case 'key-login': if (window.STKey) STKey.openRestore(); break;
      case 'trip': openTrip(v); break;
      case 'open-trip': openExpenses('pg-dash'); break;
      case 'qa-expense': if (openExpenses('pg-dash') && typeof openAddExp === 'function') setTimeout(openAddExp, 60); break;
      case 'qa-invite': if (typeof openQR === 'function') openQR(); break;
      case 'qa-members': openExpenses('pg-set'); break;
      case 'bell': if (openExpenses('pg-dash')) setTimeout(() => openNotifPanel(), 60); break;
      case 'search':
        searchOpen = !searchOpen; if (!searchOpen) query = '';
        view = 'home'; render(); break;
      case 'mod-back': if (moduleBack) moduleBack(); else show('home'); break;
      case 'close-profile': if (typeof closeModal === 'function') closeModal('m-hub-profile'); break;
      case 'my-key': if (typeof closeModal === 'function') closeModal('m-hub-profile'); if (window.STKey) STKey.openMyKey(); break;
      case 'theme': if (typeof setTheme === 'function') setTheme(v); openProfile(); render(); break;
      case 'lang': if (typeof setLang === 'function') setLang(v); openProfile(); render(); break;
      case 'nav-reset': try { localStorage.removeItem('st_hub_nav_slots'); } catch (_) {} render(); openNavSettings(); break;
      case 'nav-settings': openNavSettings(); break;
      case 'nav-pick': openNavPicker(Number(v)); break;
      case 'nav-select': saveNavSlot(Number(el.dataset.slot), v); break;
      case 'nav':
        if (v === 'home' || v === 'trips') { view = v; render(); window.scrollTo(0, 0); }
        else if (v === 'calendar') openService('calendar');
        else if (v === 'expenses') openExpenses('pg-dash');
        else if (v === 'more') openMore();
        else openService(v);
        break;
      case 'more':
        if (typeof closeModal === 'function') closeModal('m-hub-profile');
        if (v === 'profile') setTimeout(openProfile, 60);
        else if (v === 'nav-settings') setTimeout(openNavSettings, 60);
        else if (v === 'saved') say('Сохранённое — ' + tx('soon'));
        else if (v === 'services') { view = 'home'; searchOpen = false; render(); setTimeout(() => $('hub-services')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }
        else if (v === 'invite' && typeof openQR === 'function') openQR();
        else if (v === 'mykey' && window.STKey) setTimeout(() => STKey.openMyKey(), 60);
        else if (v === 'keylogin' && window.STKey) setTimeout(() => STKey.openRestore(), 60);
        break;
    }
  });

  // Кнопка «Назад» на Android: вернуться на главную, а не закрыть приложение
  function handleBack() {
    if (moduleOpen) { if (moduleBack) moduleBack(); else show('home'); return true; }
    const hub = $('pg-hub');
    if (hub && hub.style.display !== 'none') {
      if (view !== 'home') { view = 'home'; render(); return true; }
      return false;
    }
    show('home');
    return true;
  }

  window.STHub = { show, render, openCreate, openExpenses, openService, handleBack, registerService, openScreen, addStyles, refreshTripBg };
})();
