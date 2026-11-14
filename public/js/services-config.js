// ============================================================
// Splitaway Team — каталог сервисов главной страницы
// ------------------------------------------------------------
// Единый список плиток главного экрана. Чтобы включить новый
// сервис, поменяйте его status на 'active' и укажите route —
// главный экран перестраивать не нужно.
//
// Поля:
//   id           — уникальный идентификатор сервиса
//   title        — подпись (ru / en / de; остальные языки → en)
//   icon         — ключ иконки из js/hub-icons.js
//   route        — действие при нажатии (см. ROUTES в js/hub.js)
//   status       — 'active' | 'coming_soon' | 'disabled'
//                  coming_soon: плитка видна, по нажатию «В разработке»
//                  disabled:    плитка не показывается
//   requiresTrip — сервису нужна открытая поездка
// ============================================================
window.ST_SERVICES = [
  { id: 'expenses',   title: { ru: 'Расходы',      en: 'Expenses',    de: 'Ausgaben' },      icon: 'expenses',   route: 'expenses', status: 'active',      requiresTrip: true  },
  { id: 'route',      title: { ru: 'Маршрут',      en: 'Route',       de: 'Route' },         icon: 'route',      route: null,       status: 'coming_soon', requiresTrip: true  },
  { id: 'calendar',   title: { ru: 'Календарь',    en: 'Calendar',    de: 'Kalender' },      icon: 'calendar',   route: null,       status: 'coming_soon', requiresTrip: true  },
  { id: 'bookings',   title: { ru: 'Бронирования', en: 'Bookings',    de: 'Buchungen' },     icon: 'bookings',   route: null,       status: 'coming_soon', requiresTrip: true  },
  { id: 'guide',      title: { ru: 'Гид и места',  en: 'Guide',       de: 'Reiseführer' },   icon: 'guide',      route: null,       status: 'coming_soon', requiresTrip: false },
  { id: 'translator', title: { ru: 'Переводчик',   en: 'Translator',  de: 'Übersetzer' },    icon: 'translator', route: null,       status: 'coming_soon', requiresTrip: false },
  { id: 'currency',   title: { ru: 'Валюты',       en: 'Currency',    de: 'Währungen' },     icon: 'currency',   route: 'currency', status: 'active',      requiresTrip: true  },
  { id: 'weather',    title: { ru: 'Погода',       en: 'Weather',     de: 'Wetter' },        icon: 'weather',    route: null,       status: 'coming_soon', requiresTrip: false },
  { id: 'checklist',  title: { ru: 'Чек-лист',     en: 'Checklist',   de: 'Checkliste' },    icon: 'checklist',  route: null,       status: 'coming_soon', requiresTrip: true  },
  { id: 'transport',  title: { ru: 'Транспорт',    en: 'Transport',   de: 'Transport' },     icon: 'transport',  route: null,       status: 'coming_soon', requiresTrip: false },
  { id: 'nearby',     title: { ru: 'Рядом',        en: 'Nearby',      de: 'In der Nähe' },   icon: 'nearby',     route: null,       status: 'coming_soon', requiresTrip: false },
  { id: 'stats',      title: { ru: 'Статистика',   en: 'Statistics',  de: 'Statistik' },     icon: 'stats',      route: null,       status: 'coming_soon', requiresTrip: true  },
  { id: 'emergency',  title: { ru: 'Экстренно',    en: 'Emergency',   de: 'Notfall' },       icon: 'emergency',  route: null,       status: 'coming_soon', requiresTrip: false },
  { id: 'offline',    title: { ru: 'Офлайн',       en: 'Offline',     de: 'Offline' },       icon: 'offline',    route: null,       status: 'coming_soon', requiresTrip: false },
  { id: 'diary',      title: { ru: 'Дневник',      en: 'Diary',       de: 'Tagebuch' },      icon: 'diary',      route: null,       status: 'coming_soon', requiresTrip: true  },
  { id: 'assistant',  title: { ru: 'AI-помощник',  en: 'AI assistant', de: 'KI-Assistent' }, icon: 'assistant',  route: null,       status: 'coming_soon', requiresTrip: false }
];
