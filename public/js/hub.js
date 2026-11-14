// ============================================================
// Splitaway Team — главная страница (Travel Hub)
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
      brand: 'Splitaway Team', tagline: 'Все инструменты для путешествий',
      create: 'Создать поездку', create_sub: 'Планируйте, делитесь и считайте расходы вместе',
      join_code: 'Ввести код приглашения', my_trips: 'Мои поездки',
      services: 'Сервисы', search: 'Поиск сервиса', nothing: 'Ничего не найдено',
      soon: 'В разработке', need_trip: 'Сначала создайте поездку или присоединитесь к ней',
      qa_expense: 'Расход', qa_invite: 'Пригласить', qa_members: 'Участники',
      trips: 'Поездки', new_trip: 'Создать новую поездку', new_trip_sub: 'Название, валюта и участники',
      join: 'Присоединиться по коду', join_sub: 'Введите код или отсканируйте QR',
      on_device: 'Поездки на этом устройстве', no_trips: 'Здесь появятся ваши поездки',
      current: 'Открыта', home: 'Главная', saved: 'Сохранённое', profile: 'Профиль',
      language: 'Язык', theme: 'Тема', light: 'Светлая', dark: 'Тёмная', back: 'Назад', close: 'Закрыть',
      notifications: 'Уведомления',
      members: n => n + ' ' + plRu(n, 'участник', 'участника', 'участников')
    },
    en: {
      brand: 'Splitaway Team', tagline: 'All your travel tools',
      create: 'Create a trip', create_sub: 'Plan, share and split costs together',
      join_code: 'Enter invite code', my_trips: 'My trips',
      services: 'Services', search: 'Search services', nothing: 'Nothing found',
      soon: 'Coming soon', need_trip: 'Create or join a trip first',
      qa_expense: 'Expense', qa_invite: 'Invite', qa_members: 'Members',
      trips: 'Trips', new_trip: 'Create a new trip', new_trip_sub: 'Name, currency and members',
      join: 'Join with a code', join_sub: 'Enter the code or scan a QR',
      on_device: 'Trips on this device', no_trips: 'Your trips will appear here',
      current: 'Open', home: 'Home', saved: 'Saved', profile: 'Profile',
      language: 'Language', theme: 'Theme', light: 'Light', dark: 'Dark', back: 'Back', close: 'Close',
      notifications: 'Notifications',
      members: n => n + (n === 1 ? ' member' : ' members')
    },
    de: {
      brand: 'Splitaway Team', tagline: 'Alle Reise-Tools an einem Ort',
      create: 'Reise erstellen', create_sub: 'Gemeinsam planen, teilen und Kosten aufteilen',
      join_code: 'Einladungscode eingeben', my_trips: 'Meine Reisen',
      services: 'Dienste', search: 'Dienst suchen', nothing: 'Nichts gefunden',
      soon: 'In Entwicklung', need_trip: 'Erstelle zuerst eine Reise oder tritt einer bei',
      qa_expense: 'Ausgabe', qa_invite: 'Einladen', qa_members: 'Mitglieder',
      trips: 'Reisen', new_trip: 'Neue Reise erstellen', new_trip_sub: 'Name, Währung und Mitglieder',
      join: 'Mit Code beitreten', join_sub: 'Code eingeben oder QR scannen',
      on_device: 'Reisen auf diesem Gerät', no_trips: 'Hier erscheinen deine Reisen',
      current: 'Geöffnet', home: 'Start', saved: 'Gespeichert', profile: 'Profil',
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

  // Реестр модулей: id сервиса → функция открытия (см. registerService)
  const HANDLERS = {};

  const $ = id => document.getElementById(id);
  const hasTrip = () => typeof S !== 'undefined' && !!S.trip && !!S.trip.id && Array.isArray(S.members) && S.members.length > 0;

  // ---------- Переключение слоёв: хаб / онбординг / раздел расходов ----------
  function setLayer(layer) {
    const hub = $('pg-hub'), ob = $('pg-ob'), app = $('pg-app'), mod = $('pg-module');
    if (hub) hub.style.display = layer === 'hub' ? 'flex' : 'none';
    if (mod) mod.style.display = layer === 'module' ? 'flex' : 'none';
    if (layer !== 'module') moduleOpen = null;
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
    return true;
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
  function openScreen({ id, title, render: draw, action }) {
    let layer = $('pg-module');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'pg-module'; layer.className = 'hub mod-layer'; layer.style.display = 'none';
      document.body.appendChild(layer);
    }
    moduleOpen = id || 'module';
    layer.innerHTML =
      '<div class="hub-wrap mod-wrap"><div class="hub-title-row">' +
      `<button class="hub-icbtn" type="button" data-hub="mod-back" aria-label="${esc(tx('back'))}"><i data-lucide="chevron-left"></i></button>` +
      `<h2 id="mod-title">${esc(title || '')}</h2>` +
      (action ? `<button class="hub-icbtn" type="button" id="mod-action" aria-label="${esc(action.label || '')}"><i data-lucide="${esc(action.icon || 'plus')}"></i></button>` : '<span class="hub-icbtn-sp"></span>') +
      '</div><div class="mod-body" id="mod-body"></div></div>';
    setLayer('module');
    moduleOpen = id || 'module';
    const body = $('mod-body');
    const api = {
      body,
      setTitle: t => { const h = $('mod-title'); if (h) h.textContent = t; },
      refresh: () => { body.innerHTML = ''; draw && draw(body, api); icons(layer); },
      close: () => show('home')
    };
    if (action && typeof action.onClick === 'function') $('mod-action').addEventListener('click', () => action.onClick(api));
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
      '</div>';
    if (!ov.classList.contains('open')) { if (typeof openModal === 'function') openModal('m-hub-profile'); else ov.classList.add('open'); }
    icons(ov);
  }

  // ---------- Разметка ----------
  function tileHtml(s) {
    const icon = (window.ST_ICONS || {})[s.icon] || '';
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

  function homeHtml() {
    let top;
    if (hasTrip()) {
      const t = S.trip;
      const sub = [t.dest, tx('members')(S.members.length)].filter(Boolean).join(' · ');
      top =
        '<button class="hub-trip" type="button" data-hub="open-trip">' +
        '<span class="hub-trip-ic"><i data-lucide="plane"></i></span>' +
        `<span class="hub-trip-txt"><span class="hub-trip-name">${esc(t.name)}</span><span class="hub-trip-sub">${esc(sub)}</span></span>` +
        '<span class="hub-trip-go"><i data-lucide="chevron-right"></i></span></button>' +
        '<div class="hub-qa">' +
        `<button class="hub-qa-btn" type="button" data-hub="qa-expense"><i data-lucide="plus"></i><span>${esc(tx('qa_expense'))}</span></button>` +
        `<button class="hub-qa-btn" type="button" data-hub="qa-invite"><i data-lucide="qr-code"></i><span>${esc(tx('qa_invite'))}</span></button>` +
        `<button class="hub-qa-btn" type="button" data-hub="qa-members"><i data-lucide="users"></i><span>${esc(tx('qa_members'))} (${S.members.length})</span></button>` +
        '</div>';
    } else {
      top =
        '<button class="hub-hero" type="button" data-hub="create">' +
        '<span class="hub-hero-ic"><i data-lucide="plane"></i></span>' +
        `<span class="hub-hero-txt"><span class="hub-hero-ttl">${esc(tx('create'))}</span><span class="hub-hero-sub">${esc(tx('create_sub'))}</span></span>` +
        '<span class="hub-hero-plus"><i data-lucide="plus"></i></span></button>' +
        '<div class="hub-row2">' +
        `<button class="hub-pill" type="button" data-hub="join"><i data-lucide="scan-line"></i><span>${esc(tx('join_code'))}</span></button>` +
        `<button class="hub-pill" type="button" data-hub="nav" data-v="trips"><i data-lucide="briefcase"></i><span>${esc(tx('my_trips'))}</span></button>` +
        '</div>';
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
      `<div class="hub-sec-hd">${esc(tx('on_device'))}</div>` + rows;
  }

  function navHtml() {
    const items = [
      ['home', 'home', tx('home')], ['trips', 'plane', tx('trips')], ['services', 'layout-grid', tx('services')],
      ['saved', 'bookmark', tx('saved')], ['profile', 'user', tx('profile')]
    ];
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
      `<div class="hub-brand"><img src="/icons/app_icon.png" alt="" class="hub-logo"><div><div class="hub-brand-name">${esc(tx('brand'))}</div><div class="hub-brand-sub">${esc(tx('tagline'))}</div></div></div>` +
      `<div class="hub-hd-act"><button class="hub-icbtn${searchOpen ? ' on' : ''}" type="button" data-hub="search" aria-label="${esc(tx('search'))}"><i data-lucide="search"></i></button>${bell}</div>` +
      `</header><main class="hub-main">${view === 'trips' ? tripsHtml() : homeHtml()}</main></div>` + navHtml();
    icons(root);
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
      case 'trip': openTrip(v); break;
      case 'open-trip': openExpenses('pg-dash'); break;
      case 'qa-expense': if (openExpenses('pg-dash') && typeof openAddExp === 'function') setTimeout(openAddExp, 60); break;
      case 'qa-invite': if (typeof openQR === 'function') openQR(); break;
      case 'qa-members': openExpenses('pg-set'); break;
      case 'bell': if (openExpenses('pg-dash')) setTimeout(() => openNotifPanel(), 60); break;
      case 'search':
        searchOpen = !searchOpen; if (!searchOpen) query = '';
        view = 'home'; render(); break;
      case 'mod-back': show('home'); break;
      case 'close-profile': if (typeof closeModal === 'function') closeModal('m-hub-profile'); break;
      case 'theme': if (typeof setTheme === 'function') setTheme(v); openProfile(); render(); break;
      case 'lang': if (typeof setLang === 'function') setLang(v); openProfile(); render(); break;
      case 'nav':
        if (v === 'home' || v === 'trips') { view = v; render(); window.scrollTo(0, 0); }
        else if (v === 'services') { view = 'home'; render(); $('hub-services')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        else if (v === 'saved') say(tx('saved') + ' — ' + tx('soon'));
        else if (v === 'profile') openProfile();
        break;
    }
  });

  // Кнопка «Назад» на Android: вернуться на главную, а не закрыть приложение
  function handleBack() {
    if (moduleOpen) { show('home'); return true; }
    const hub = $('pg-hub');
    if (hub && hub.style.display !== 'none') {
      if (view !== 'home') { view = 'home'; render(); return true; }
      return false;
    }
    show('home');
    return true;
  }

  window.STHub = { show, render, openExpenses, openService, handleBack, registerService, openScreen, addStyles };
})();
