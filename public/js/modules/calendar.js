// ============================================================
// Модуль «Календарь» (id: 'calendar')
// Ответственный: Рафаэль · Issue #15
// ------------------------------------------------------------
// Три страницы:
//   1. Месяц  — календарь на месяц, даты поездки, точки событий,
//               листание влево/вправо (свайп или стрелки).
//   2. События — неделя лентой + события выбранного дня по времени,
//               листание недель свайпом.
//   3. Добавить / изменить событие — тип, название, дата, время,
//               место, заметка, напоминание, фото билета.
// Данные хранятся для каждой поездки на этом устройстве (ctx.store).
// Даты поездки в базе и общий календарь группы — следующий этап.
// ============================================================
(function () {
  'use strict';
  if (!window.STHub) return;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- Даты ----------
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const today = () => iso(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const mondayOf = s => { const d = parse(s); const wd = (d.getDay() + 6) % 7; return addDays(s, -wd); };
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const MONTHS_N = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const fullDate = s => { const d = parse(s); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };
  function rangeLabel(a, b) {
    const A = parse(a), B = parse(b);
    if (A.getMonth() === B.getMonth()) return A.getDate() + ' – ' + B.getDate() + ' ' + MONTHS[B.getMonth()];
    return A.getDate() + ' ' + MONTHS[A.getMonth()] + ' – ' + B.getDate() + ' ' + MONTHS[B.getMonth()];
  }
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  // ---------- Типы событий и виды для точек в календаре ----------
  // kind: event (синяя точка) · booking (оранжевая) · note (зелёная)
  const TYPES = [
    { id: 'flight', name: 'Перелёт', icon: 'plane', color: '#6C4CF0', bg: '#EEE8FF', kind: 'booking' },
    { id: 'stay', name: 'Проживание', icon: 'bed-double', color: '#7556F0', bg: '#EEE8FF', kind: 'booking' },
    { id: 'transport', name: 'Транспорт', icon: 'car', color: '#1FA55A', bg: '#E1F6E7', kind: 'event' },
    { id: 'arrival', name: 'Прилёт', icon: 'plane-landing', color: '#2B8AE8', bg: '#E2F0FF', kind: 'booking', hidden: true }, // из «Бронирований»
    { id: 'food', name: 'Еда', icon: 'utensils', color: '#EE8417', bg: '#FFF0DB', kind: 'event' },
    { id: 'ticket', name: 'Билеты', icon: 'ticket', color: '#6C4CF0', bg: '#EEEBFF', kind: 'booking', hidden: true }, // из «Бронирований»
    { id: 'other', name: 'Другое', icon: 'star', color: '#F2A516', bg: '#FFF6D6', kind: 'note' }
  ];
  // ---------- Свои типы событий (пользователь создаёт сам) ----------
  // Общие для всех поездок на этом устройстве: { id, name, icon | img, color, kind:'note' }
  const ICON_SET = ['star', 'ticket', 'camera', 'landmark', 'mountain', 'waves', 'tree-palm', 'music', 'party-popper', 'shopping-bag',
    'coffee', 'wine', 'dumbbell', 'bike', 'ship', 'train-front', 'church', 'footprints', 'heart', 'gift', 'briefcase', 'baby', 'sun', 'sparkles'];
  const COLORS = ['#6C4CF0', '#2E7BE6', '#0FA3B1', '#1FA55A', '#F2A516', '#EE8417', '#E5484D', '#D63BA0'];
  const CT_KEY = 'st_mod_calendar_types';
  let CUSTOM = (() => { try { return JSON.parse(localStorage.getItem(CT_KEY)) || []; } catch (_) { return []; } })();
  const saveCustom = () => { try { localStorage.setItem(CT_KEY, JSON.stringify(CUSTOM)); return true; } catch (_) { return false; } };
  const allTypes = () => TYPES.concat(CUSTOM);
  const tIcon = t => t.img ? `<img src="${t.img}" alt="">` : `<i data-lucide="${t.icon}"></i>`;
  const tBg = t => t.bg || t.color + '22';
  const KINDS = { event: { name: 'Событие', color: '#2E7BE6' }, booking: { name: 'Бронь', color: '#EE8417' }, note: { name: 'Заметка', color: '#34C759' } };
  const OLD_TYPE = { tour: 'other', meet: 'other' }; // перенос типов из прошлой версии
  const typeOf = id => allTypes().find(t => t.id === (OLD_TYPE[id] || id)) || TYPES[TYPES.length - 1];

  const TRIP_ART = `<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true"><defs>
    <linearGradient id="cl-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7EC8FF"/><stop offset="1" stop-color="#CDEBFF"/></linearGradient>
    <linearGradient id="cl-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2FB6D9"/><stop offset="1" stop-color="#1A8FC0"/></linearGradient></defs>
    <rect width="64" height="64" fill="url(#cl-sky)"/><circle cx="47" cy="17" r="7" fill="#FFE27A"/>
    <path d="M0 36c10-3 22-3 32 0s22 3 32 0v28H0z" fill="url(#cl-sea)"/><path d="M0 50c14-5 30-6 44-3 8 2 14 2 20 1v16H0z" fill="#F6D9A1"/>
    <path d="M18 50c1-9 3-17 7-24" stroke="#8A5A2B" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M25 26c-5-4-12-3-15 1 5-1 9 0 15-1zM25 26c2-6 9-8 14-6-5 1-9 3-14 6zM25 26c5-3 12-2 15 3-5-2-9-2-15-3zM25 26c-2-5-1-11 4-13-2 4-3 8-4 13z" fill="#2E9E58"/></svg>`;

  // Свайп влево/вправо (палец или мышь)
  function onSwipe(el, onLeft, onRight) {
    if (!el) return;
    let x0 = null, y0 = null;
    el.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; });
    el.addEventListener('pointerup', e => {
      if (x0 === null) return;
      const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { el._swiped = Date.now(); (dx < 0 ? onLeft : onRight)(); }
    });
    el.addEventListener('pointercancel', () => { x0 = null; });
    // после свайпа не считать отпускание пальца нажатием на день
    el.addEventListener('click', e => { if (Date.now() - (el._swiped || 0) < 400) { e.stopPropagation(); e.preventDefault(); } }, true);
  }

  STHub.addStyles('calendar', `
    [data-module="calendar"]{--cal-band:#E7E1FF;--cal-soft:#F3F0FF}
    [data-theme=dark] [data-module="calendar"]{--cal-band:rgba(124,108,255,.22);--cal-soft:rgba(255,255,255,.05)}
    [data-module="calendar"] .hub-title-row .hub-icbtn{background:none;border:0;box-shadow:none}
    [data-module="calendar"] .hub-title-row h2{font-size:1.12rem}
    [data-module="calendar"] #mod-action.cal-save{background:linear-gradient(135deg,#8E80FF,#5B4BEA);color:#fff;border-radius:16px;box-shadow:0 6px 16px rgba(91,75,234,.3)}
    .cal-card{border-radius:18px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow)}
    .cal-trip{display:flex;align-items:center;gap:14px;padding:12px;width:100%;text-align:left;color:var(--text);font:inherit;cursor:pointer}
    .cal-trip-art{width:64px;height:56px;border-radius:12px;overflow:hidden;flex-shrink:0}
    .cal-trip-name{font-weight:800;font-size:1.05rem}
    .cal-trip-sub{color:var(--t2);font-size:.82rem;margin-top:3px}
    .cal-trip-sub.need{color:var(--accent);font-weight:700}
    .cal-trip svg.cal-chev{width:20px;height:20px;color:var(--t2);margin-left:auto;flex-shrink:0}
    .cal-month{padding:12px 10px 14px;touch-action:pan-y;user-select:none}
    .cal-mhd{display:flex;align-items:center;justify-content:space-between;padding:0 4px 8px}
    .cal-mhd b{font-size:1.08rem}
    .cal-nav{width:36px;height:36px;border:0;background:none;color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:12px}
    .cal-nav svg{width:20px;height:20px}
    .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);row-gap:6px}
    .cal-wd{text-align:center;font-size:.74rem;color:var(--t2);font-weight:600;padding-bottom:4px}
    .cal-cell{position:relative;height:46px;border:0;background:none;color:var(--text);font:inherit;cursor:pointer;padding:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start}
    .cal-cell.out{color:var(--t3)}
    .cal-cell.trip::before{content:"";position:absolute;top:2px;height:34px;left:0;right:0;background:var(--cal-band)}
    .cal-cell.trip.ts::before,.cal-cell.trip.c0::before{left:3px;border-top-left-radius:17px;border-bottom-left-radius:17px}
    .cal-cell.trip.te::before,.cal-cell.trip.c6::before{right:3px;border-top-right-radius:17px;border-bottom-right-radius:17px}
    .cal-num{position:relative;z-index:1;width:34px;height:34px;margin-top:2px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:.92rem}
    .cal-cell.today .cal-num{color:var(--accent);font-weight:800}
    .cal-cell.sel .cal-num{background:linear-gradient(135deg,#8E80FF,#5B4BEA);color:#fff;box-shadow:0 4px 12px rgba(91,75,234,.35)}
    .cal-dots{position:relative;z-index:1;display:flex;gap:3px;height:6px;margin-top:3px}
    .cal-dots i{width:5px;height:5px;border-radius:50%;display:block}
    .cal-legend{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:2px 6px;font-size:.78rem;color:var(--text)}
    .cal-legend span{display:inline-flex;align-items:center;gap:6px}
    .cal-legend i{width:12px;height:12px;border-radius:50%;display:block}
    .cal-add{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:52px;border:0;border-radius:16px;background:linear-gradient(135deg,#8E80FF,#5B4BEA);color:#fff;font:inherit;font-weight:700;font-size:.95rem;cursor:pointer;box-shadow:0 8px 20px rgba(91,75,234,.28)}
    .cal-add svg{width:19px;height:19px}
    .cal-week{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;touch-action:pan-y;user-select:none}
    .cal-wday{border:0;background:none;color:var(--text);font:inherit;cursor:pointer;padding:6px 0 8px;border-radius:14px;display:flex;flex-direction:column;align-items:center;gap:4px}
    .cal-wday small{font-size:.74rem;color:var(--t2);font-weight:600}
    .cal-wday b{font-size:1rem;font-weight:700}
    .cal-wday.sel{background:linear-gradient(160deg,#8E80FF,#5B4BEA);color:#fff;box-shadow:0 6px 14px rgba(91,75,234,.3)}
    .cal-wday.sel small{color:rgba(255,255,255,.85)}
    .cal-wday.today:not(.sel) b{color:var(--accent)}
    .cal-wday .cal-dots{margin-top:0}
    .cal-tl{position:relative;display:flex;flex-direction:column;gap:12px;padding-left:72px;min-height:120px;touch-action:pan-y}
    .cal-tl::before{content:"";position:absolute;left:62px;top:4px;bottom:4px;width:2px;background:var(--cal-band);border-radius:2px}
    .cal-ev{position:relative;display:flex;align-items:center;gap:12px;padding:12px 12px 12px 12px;width:100%;text-align:left;color:var(--text);font:inherit;cursor:pointer}
    .cal-ev-time{position:absolute;left:-72px;width:56px;text-align:right;font-weight:800;font-size:.86rem;font-variant-numeric:tabular-nums;color:var(--text)}
    .cal-ev-time.none{color:var(--t3);font-weight:600;font-size:.72rem;line-height:1.1}
    .cal-ev-ic{width:44px;height:44px;border-radius:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .cal-ev-ic svg{width:22px;height:22px}
    .cal-ev-txt{flex:1;min-width:0}
    .cal-ev-ttl{display:block;font-weight:700;font-size:.95rem;overflow-wrap:anywhere}
    .cal-ev-sub{display:block;color:var(--t2);font-size:.78rem;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .cal-ev-go{width:20px;height:20px;color:var(--t3);flex-shrink:0}
    .cal-ev-go.pin{color:var(--accent)}
    .cal-ev.past{opacity:.55}
    .cal-empty{padding:26px 16px;text-align:center;color:var(--t2);font-size:.88rem;line-height:1.45}
    .cal-fab{position:fixed;right:max(18px,calc(50% - 262px));bottom:calc(var(--sb) + 22px);width:58px;height:58px;border-radius:50%;border:0;background:linear-gradient(135deg,#8E80FF,#5B4BEA);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 24px rgba(91,75,234,.4);cursor:pointer;z-index:20}
    .cal-fab svg{width:26px;height:26px}
    .cal-types{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:2px 16px 4px}
    .cal-types::-webkit-scrollbar{display:none}
    .cal-type img{width:28px;height:28px;border-radius:8px;object-fit:cover}
    .cal-type.plus{border-style:dashed;color:var(--accent);box-shadow:none;background:transparent}
    .cal-ev-ic{overflow:hidden}
    .cal-ev-ic img{width:100%;height:100%;object-fit:cover}
    .cal-field>img{width:24px;height:24px;border-radius:7px;object-fit:cover;flex-shrink:0}
    .cal-icons{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}
    .cal-icons button{aspect-ratio:1;border-radius:14px;border:1.5px solid var(--hub-card-b);background:var(--hub-card);color:var(--text);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
    .cal-icons button svg{width:22px;height:22px}
    .cal-icons button.on{border-color:var(--accent);background:var(--cal-soft);color:var(--accent)}
    .cal-colors{display:flex;gap:10px;flex-wrap:wrap}
    .cal-colors button{width:32px;height:32px;border-radius:50%;border:3px solid transparent;cursor:pointer;padding:0;box-shadow:0 0 0 1px var(--hub-card-b)}
    .cal-colors button.on{border-color:var(--hub-card);box-shadow:0 0 0 2px var(--text)}
    .cal-ct-prev{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:16px;background:var(--hub-soft)}
    .cal-ct-prev .cal-ev-ic{width:48px;height:48px}
    .cal-type span{max-width:100%;padding:0 3px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.66rem}
    .cal-type{flex:0 0 calc((100% - 32px) / 5);min-width:70px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 2px 10px;border-radius:16px;border:1.5px solid var(--hub-card-b);background:var(--hub-card);color:var(--text);font:inherit;font-size:.68rem;font-weight:600;cursor:pointer;box-shadow:var(--hub-shadow)}
    .cal-type svg{width:24px;height:24px}
    .cal-type.on{border-color:var(--accent);background:var(--cal-soft);box-shadow:0 0 0 1px var(--accent) inset}
    .cal-field{display:flex;align-items:center;gap:12px;padding:0 14px;min-height:54px;border-radius:16px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow);position:relative}
    .cal-field>svg{width:20px;height:20px;color:var(--accent);flex-shrink:0}
    .cal-field input,.cal-field select{flex:1;min-width:0;border:0;background:transparent;color:var(--text);font:inherit;font-size:16px;outline:none;min-height:52px}
    .cal-field input::placeholder{color:var(--t3)}
    .cal-field .cal-fchev{width:18px;height:18px;color:var(--t3);flex-shrink:0}
    .cal-rem{display:flex;align-items:center;gap:12px;padding:12px 14px}
    .cal-rem>svg{width:20px;height:20px;color:var(--accent);flex-shrink:0}
    .cal-rem-txt{flex:1}
    .cal-rem-txt b{display:block;font-size:.92rem}
    .cal-rem-txt select{border:0;background:transparent;color:var(--t2);font:inherit;font-size:.86rem;padding:0;margin-top:2px;outline:none}
    .cal-switch{position:relative;width:52px;height:30px;flex-shrink:0}
    .cal-switch input{opacity:0;width:0;height:0}
    .cal-switch span{position:absolute;inset:0;border-radius:30px;background:var(--b2);transition:background .2s;cursor:pointer}
    .cal-switch span::after{content:"";position:absolute;left:3px;top:3px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s}
    .cal-switch input:checked+span{background:linear-gradient(135deg,#8E80FF,#5B4BEA)}
    .cal-switch input:checked+span::after{transform:translateX(22px)}
    .cal-doc{display:flex;align-items:center;gap:14px;padding:10px 12px;width:100%;color:var(--text);font:inherit;text-align:left;cursor:pointer}
    .cal-doc-ic{width:48px;height:44px;border-radius:12px;background:var(--cal-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden}
    .cal-doc-ic svg{width:22px;height:22px}
    .cal-doc-ic img{width:100%;height:100%;object-fit:cover}
    .cal-doc-txt{flex:1;font-size:.9rem;font-weight:600}
    .cal-del{color:#E5484D;border:0;background:none;font:inherit;font-weight:700;padding:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}
    .cal-del svg{width:18px;height:18px}
    .cal-form{display:flex;flex-direction:column;gap:10px;text-align:left}
    .cal-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
    .cal-2>div{min-width:0;display:flex;flex-direction:column;gap:6px}
    .cal-2 .cal-field{padding:0 10px;gap:8px}
    .cal-field input[type=date],.cal-field input[type=time]{width:100%;font-size:15px}
    .cal-form label{font-size:.78rem;font-weight:700;color:var(--t2)}
    /* ===== вид по макету (Figma) ===== */
    [data-module="calendar"] .mod-body{display:flex;flex-direction:column;gap:14px}
    .cal-trip{padding:12px 18px 12px 12px;border-radius:22px;gap:16px}
    .cal-trip-art{width:94px;height:72px;border-radius:14px}
    .cal-trip-art img{width:100%;height:100%;object-fit:cover;display:block}
    .cal-trip-name{font-size:1.28rem;letter-spacing:-.01em}
    .cal-trip-sub{font-size:.95rem;margin-top:5px}
    .cal-trip svg.cal-chev{width:24px;height:24px;color:var(--text)}
    .cal-mbar{display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-radius:22px;margin-top:4px}
    .cal-mbar b{font-size:1.3rem;font-weight:800;letter-spacing:-.01em}
    .cal-mbar .cal-nav{width:40px;height:40px}
    .cal-mbar .cal-nav svg{width:22px;height:22px}
    .cal-month2{touch-action:pan-y;user-select:none;padding:0 2px}
    .cal-month2 .cal-grid{row-gap:4px}
    .cal-month2 .cal-wd{font-size:.86rem;font-weight:600;color:var(--t2);padding:4px 0 10px}
    .cal-month2 .cal-cell{height:58px}
    .cal-month2 .cal-cell.trip::before{top:3px;height:44px}
    .cal-month2 .cal-cell.trip.ts::before,.cal-month2 .cal-cell.trip.c0::before{left:2px;border-radius:22px 0 0 22px}
    .cal-month2 .cal-cell.trip.te::before,.cal-month2 .cal-cell.trip.c6::before{right:2px;border-radius:0 22px 22px 0}
    .cal-month2 .cal-cell.trip.ts.te::before,.cal-month2 .cal-cell.trip.ts.c6::before,.cal-month2 .cal-cell.trip.c0.te::before{border-radius:22px}
    .cal-month2 .cal-num{width:44px;height:44px;margin-top:3px;font-size:1.08rem;font-weight:600}
    .cal-month2 .cal-cell.out .cal-num{color:var(--t3)}
    .cal-month2 .cal-dots{margin-top:2px;gap:4px}
    .cal-month2 .cal-dots i{width:6px;height:6px}
    .cal-legend{justify-content:space-between;padding:6px 4px 2px;font-size:.9rem;font-weight:500}
    .cal-legend i{width:14px;height:14px}
    .cal-add{min-height:62px;border-radius:20px;font-size:1.1rem;font-weight:700;margin-top:10px;background:linear-gradient(100deg,#8B7BFF,#5E44EE);box-shadow:0 12px 26px rgba(94,68,238,.32)}
    .cal-add svg{width:24px;height:24px}
    /* страница дня */
    .cal-week2{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;touch-action:pan-y;user-select:none;margin:2px -4px 6px}
    .cal-week2 .cal-wday{padding:10px 0 9px;border-radius:16px;gap:8px}
    .cal-week2 .cal-wday small{font-size:.9rem;font-weight:500;color:var(--t2)}
    .cal-week2 .cal-wday b{font-size:1.15rem;font-weight:600}
    .cal-week2 .cal-wday.sel{background:linear-gradient(170deg,#8E7DFF,#5B40EA);box-shadow:0 8px 18px rgba(91,64,234,.32)}
    .cal-week2 .cal-wday.sel small,.cal-week2 .cal-wday.sel b{color:#fff}
    .cal-week2 .cal-dots{min-height:7px}
    .cal-week2 .cal-dots i{width:7px;height:7px}
    .cal-week2 .cal-wday.sel .cal-dots i{box-shadow:0 0 0 1.5px #fff}
    .cal-tl{padding-left:78px;gap:14px}
    .cal-tl::before{left:72px;width:1.5px;background:var(--hub-card-b)}
    .cal-ev{padding:14px 16px 14px 14px;border-radius:20px;gap:16px;min-height:84px}
    .cal-ev-time{left:-80px;width:60px;font-size:1.02rem;font-weight:700;text-align:left}
    .cal-ev-ic{width:54px;height:54px;border-radius:15px}
    .cal-ev-ic svg{width:27px;height:27px;stroke-width:2.1}
    .cal-ev-ttl{font-size:1.02rem;font-weight:800}
    .cal-ev-sub{font-size:.88rem;margin-top:5px}
    .cal-ev-go{width:22px;height:22px;color:var(--text)}
    .cal-ev-go.pin{color:#6C4CF0}
    .cal-fab{width:66px;height:66px;background:linear-gradient(140deg,#8E7DFF,#5B40EA)}
    .cal-fab svg{width:30px;height:30px}
    /* форма */
    .cal-types{gap:10px}
    .cal-type{flex:0 0 calc((100% - 40px) / 5);min-width:76px;min-height:92px;justify-content:center;border-radius:18px;gap:10px}
    .cal-type svg{width:28px;height:28px;stroke-width:2.2}
    .cal-type span{font-size:.74rem;font-weight:600}
    .cal-type.on{border-width:2px}
    .cal-row{position:relative;display:flex;align-items:center;gap:18px;padding:0 18px;min-height:58px;border-radius:18px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow);cursor:pointer;color:var(--text)}
    .cal-row>svg:first-child,.cal-row>img:first-child{width:24px;height:24px;color:#6C4CF0;flex-shrink:0;stroke-width:2}
    .cal-row>img:first-child{border-radius:7px;object-fit:cover}
    .cal-row input:not(.cal-native){flex:1;min-width:0;border:0;background:transparent;color:var(--text);font:inherit;font-size:1.05rem;outline:none;min-height:56px}
    .cal-row input::placeholder{color:var(--t2)}
    .cal-row-v{flex:1;font-size:1.05rem}
    .cal-row-v.ph{color:var(--t2)}
    .cal-row .cal-fchev{width:22px;height:22px;color:var(--text);flex-shrink:0}
    .cal-native{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:0;padding:0;margin:0}
    .cal-row.sub{min-height:50px;box-shadow:none;background:transparent;border-style:dashed;color:#6C4CF0;font-weight:700;justify-content:center;gap:8px}
    .cal-row.sub svg{width:20px;height:20px}
    .cal-endlbl{font-size:.8rem;font-weight:700;color:var(--t2);margin:4px 4px -4px}
    .cal-rem{padding:16px 18px;gap:18px;border-radius:20px}
    .cal-rem>svg{width:24px;height:24px}
    .cal-rem-txt b{font-size:1.02rem}
    .cal-rem-txt select{font-size:1rem;color:var(--text);margin-top:4px}
    .cal-switch{width:62px;height:36px}
    .cal-switch span::after{width:30px;height:30px}
    .cal-switch input:checked+span::after{transform:translateX(26px)}
    .cal-doc{padding:14px 16px;border-radius:20px;gap:18px}
    .cal-doc-ic{width:62px;height:52px;border-radius:15px}
    .cal-doc-ic svg{width:28px;height:28px}
    .cal-doc-txt{font-size:1.02rem;font-weight:500}
    .cal-trip-art{width:86px;height:66px}
    .cal-trip-sub{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cal-trip>div:nth-child(2){min-width:0;flex:1}
    .cal-tl{padding-left:66px}
    .cal-tl::before{left:60px}
    .cal-ev-time{left:-66px;width:54px}
    .cal-ev{gap:14px;padding:14px 14px 14px 12px}
    .cal-ev-ic{width:50px;height:50px}
    .cal-ev-ttl{font-size:.98rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;overflow-wrap:normal}
    .cal-ev.past{opacity:.72}
    .cal-types{gap:8px}
    .cal-type{flex:0 0 calc((100% - 32px) / 5);min-width:0;min-height:88px;gap:9px}
    .cal-type span{font-size:.6rem;letter-spacing:-.02em;padding:0 1px;text-overflow:clip}
    .cal-trip-art{width:80px;height:62px}
    .cal-trip-sub{font-size:.86rem}
    .cal-type svg,.cal-type img{width:27px;height:27px}
    .cal-wx{display:flex;align-items:center;gap:12px;padding:12px 16px;width:100%;font:inherit;color:var(--text);text-align:left;cursor:pointer;border-radius:18px;margin-bottom:2px}
    .cal-wx>svg:first-child{width:22px;height:22px;color:#F2A516;flex-shrink:0}
    .cal-wx span{flex:1;font-weight:600;font-size:.95rem}
    [data-theme=dark] .cal-row>svg:first-child,[data-theme=dark] .cal-ev-go.pin{color:#A898FF}
    [data-theme=dark] .cal-ev-ic,[data-theme=dark] .cal-type svg{filter:saturate(1.15)}
    [data-theme=dark] .cal-ev-ic{background:rgba(255,255,255,.08)!important}
  `);

  function sheet(title, html, bind) {
    document.getElementById('cal-sheet')?.remove();
    const ov = document.createElement('div');
    ov.className = 'ov open'; ov.id = 'cal-sheet';
    ov.innerHTML = `<div class="mdl"><div class="mdl-handle"></div><div class="mdl-title">${esc(title)}</div>${html}</div>`;
    const close = () => { ov.remove(); document.body.style.overflow = ''; };
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    // внутрь экрана модуля, чтобы работали цвета и стили плиток
    (document.getElementById('pg-module') || document.body).appendChild(ov);
    document.body.style.overflow = 'hidden';
    if (typeof initializeIcons === 'function') initializeIcons(ov);
    bind(ov.firstChild, close);
  }

  STHub.registerService('calendar', ctx => {
    const store = ctx.store;
    let dates = store.get('dates', null);                 // { start, end }
    let events = store.get('events', []).map(e => Object.assign({}, e, { type: typeOf(e.type).id }));
    const saveDates = () => store.set('dates', dates);
    const saveEvents = () => store.set('events', events);

    // выбранный день и показанный месяц
    let selected = dates && (today() < dates.start || today() > dates.end) ? dates.start : today();
    let month = selected.slice(0, 7); // 'YYYY-MM'

    // Событие может длиться несколько дней: date/time — начало, endDate/endTime — конец (необязательно)
    const endOf = e => e.endDate || e.date;
    const timeOn = (e, d) => d === e.date ? (e.time || '') : (d === endOf(e) ? (e.endTime || '') : '');
    // Брони из модуля «Бронирования» сами появляются в календаре (только чтение)
    function bookingEvents() {
      if (!ctx.trip) return [];
      let list = [];
      try { list = JSON.parse(localStorage.getItem('st_mod_bookings_' + ctx.trip.id + '_items')) || []; } catch (_) {}
      const out = [];
      list.filter(b => b && b.date && b.status !== 'cancelled').forEach(b => {
        const ev = (suffix, o) => out.push(Object.assign({ id: 'bk_' + b.id + suffix, bookingId: b.id, booking: true, endDate: '', endTime: '', place: '', note: '' }, o));
        const end = b.endDate || b.date, hasEnd = !!(b.endDate || b.endTime);
        const code = b.code ? 'Бронирование ' + b.code : '';
        if (b.cat === 'flight') {
          ev('_a', { type: 'flight', title: 'Вылет ' + (b.from || '') + ' → ' + (b.to || ''), date: b.date, time: b.time || '', sub: [b.provider, b.number].filter(Boolean).join(' · ') || code, place: [b.from, b.fromCity].filter(Boolean).join(' ') + ' airport' });
          if (b.endTime) ev('_b', { type: 'arrival', title: 'Прилёт в ' + (b.toCity || b.to || ''), date: end, time: b.endTime, sub: b.toName || b.to || '' });
        } else if (b.cat === 'stay') {
          ev('_a', { type: 'stay', title: 'Заселение · ' + (b.title || 'жильё'), date: b.date, time: b.time || '', sub: b.place || code, place: b.place || '' });
          if (hasEnd && end !== b.date) ev('_b', { type: 'stay', title: 'Выезд · ' + (b.title || 'жильё'), date: end, time: b.endTime || '', sub: b.place || code });
        } else if (b.cat === 'transport') {
          const car = /авто|машин|car|miet/i.test(b.title || '') || /sixt|europcar|hertz|avis|goldcar|enterprise/i.test(b.provider || '');
          ev('_a', { type: 'transport', title: car ? 'Получение авто' : (b.title || 'Транспорт'), date: b.date, time: b.time || '', sub: [b.provider, code].filter(Boolean).join(' · ') || b.place || '', place: b.place || '' });
          if (hasEnd && end !== b.date) ev('_b', { type: 'transport', title: car ? 'Возврат авто' : (b.title || 'Транспорт') + ' — конец', date: end, time: b.endTime || '', sub: [b.provider, b.placeTo || b.place].filter(Boolean).join(' · '), place: b.placeTo || b.place || '' });
        } else {
          ev('', { type: 'ticket', title: b.title || 'Билеты', date: b.date, time: b.time || '', endDate: b.endDate || '', endTime: b.endTime || '', sub: [b.place, b.people].filter(Boolean).join(' · '), place: b.place || '' });
        }
      });
      return out;
    }
    const allEvents = () => events.concat(bookingEvents());
    const byDay = d => allEvents().filter(e => e.date <= d && d <= endOf(e))
      .sort((a, b) => ((timeOn(a, d) || '00:00') + a.date).localeCompare((timeOn(b, d) || '00:00') + b.date));
    const nowKey = () => { const d = new Date(); return iso(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
    const isPast = e => (endOf(e) + ' ' + ((e.endDate ? e.endTime : (e.endTime || e.time)) || '23:59')) < nowKey();
    // подписи начала и конца по типу события
    const SE = t => t.id === 'stay' ? ['Заезд', 'Выезд'] : t.id === 'flight' ? ['Вылет', 'Прилёт'] : ['Начало', 'Окончание'];
    const inTrip = d => !!dates && d >= dates.start && d <= dates.end;
    const dots = d => {
      const kinds = [...new Set(byDay(d).map(e => typeOf(e.type).kind))].slice(0, 3);
      return `<span class="cal-dots">${kinds.map(k => `<i style="background:${KINDS[k].color}"></i>`).join('')}</span>`;
    };
    const shiftMonth = n => { const d = parse(month + '-01'); d.setMonth(d.getMonth() + n); month = iso(d).slice(0, 7); };

    function tripCard() {
      const t = ctx.trip || {};
      const n = ctx.members.length;
      const sub = dates ? rangeLabel(dates.start, dates.end) : 'Укажите даты поездки';
      return `<button class="cal-card cal-trip" type="button" data-a="dates">
        <div class="cal-trip-art"><img src="/img/trips/abstract.jpg" alt=""></div>
        <div><div class="cal-trip-name">${esc(t.name || 'Поездка')}</div>
        <div class="cal-trip-sub${dates ? '' : ' need'}">${esc(sub)}${n ? ' · ' + n + ' ' + plural(n, 'участник', 'участника', 'участников') : ''}</div></div>
        <i data-lucide="chevron-down" class="cal-chev"></i></button>`;
    }

    // ===== Страница 1: месяц =====
    function openMonth() {
      ctx.openScreen({
        title: 'Календарь',
        action: { icon: 'more-vertical', label: 'Ещё', onClick: menu },
        render(body, screen) {
          const first = parse(month + '-01');
          const start = mondayOf(month + '-01');
          const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
          const weeks = Math.ceil((diffDays(start, iso(last)) + 1) / 7);
          const cells = [];
          for (let i = 0; i < weeks * 7; i++) {
            const d = addDays(start, i);
            const cls = ['cal-cell', 'c' + (i % 7)];
            if (d.slice(0, 7) !== month) cls.push('out');
            if (inTrip(d)) { cls.push('trip'); if (d === dates.start) cls.push('ts'); if (d === dates.end) cls.push('te'); }
            if (d === today()) cls.push('today');
            if (d === selected) cls.push('sel');
            cells.push(`<button class="${cls.join(' ')}" type="button" data-day="${d}"><span class="cal-num">${parse(d).getDate()}</span>${dots(d)}</button>`);
          }
          body.innerHTML = `
            ${tripCard()}
            <div class="cal-card cal-mbar">
              <button class="cal-nav" type="button" data-m="-1" aria-label="Предыдущий месяц"><i data-lucide="chevron-left"></i></button>
              <b>${MONTHS_N[first.getMonth()]} ${first.getFullYear()}</b>
              <button class="cal-nav" type="button" data-m="1" aria-label="Следующий месяц"><i data-lucide="chevron-right"></i></button>
            </div>
            <div class="cal-month2" id="cal-month">
              <div class="cal-grid">${WD.map(w => `<div class="cal-wd">${w}</div>`).join('')}${cells.join('')}</div>
            </div>
            <div class="cal-legend">
              <span><i style="background:#C9BCFF"></i>Поездка</span>
              ${Object.values(KINDS).map(k => `<span><i style="background:${k.color}"></i>${k.name}</span>`).join('')}
            </div>
            <button class="cal-add" type="button" data-a="add"><i data-lucide="plus"></i>Добавить событие</button>
          `;
          body.querySelector('[data-a="dates"]').addEventListener('click', datesForm);
          body.querySelector('[data-a="add"]').addEventListener('click', () => openForm(null, selected, openMonth));
          body.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { shiftMonth(+b.dataset.m); screen.refresh(); }));
          body.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => {
            selected = b.dataset.day; month = selected.slice(0, 7); openDay();
          }));
          onSwipe(body.querySelector('#cal-month'), () => { shiftMonth(1); screen.refresh(); }, () => { shiftMonth(-1); screen.refresh(); });
          if (window.STPlacePhoto) STPlacePhoto.tripImg(body.querySelector('.cal-trip-art img'), ctx.trip, { width: 300 }); // фото места поездки
        }
      });
    }

    function menu() {
      sheet('Календарь', `<div class="cal-form" style="margin-top:10px">
          <button class="st-btn st-btn-g st-btn-fw" data-a="dates"><i data-lucide="calendar-range"></i>Даты поездки</button>
          <button class="st-btn st-btn-g st-btn-fw" data-a="today"><i data-lucide="calendar-check"></i>Перейти к сегодня</button>
          <button class="st-btn st-btn-g st-btn-fw" data-a="past" style="color:#E5484D"><i data-lucide="trash-2"></i>Удалить прошедшие события</button>
        </div>`, (root, close) => {
        root.querySelector('[data-a="dates"]').addEventListener('click', () => { close(); datesForm(); });
        root.querySelector('[data-a="today"]').addEventListener('click', () => { selected = today(); month = selected.slice(0, 7); close(); openMonth(); });
        root.querySelector('[data-a="past"]').addEventListener('click', () => {
          const left = events.filter(e => !isPast(e));
          if (left.length === events.length) { ctx.toast('Прошедших событий нет'); return; }
          if (!confirm('Удалить все прошедшие события?')) return;
          events = left; saveEvents(); close(); openMonth();
        });
      });
    }

    function datesForm() {
      const s0 = dates ? dates.start : today(), e0 = dates ? dates.end : addDays(s0, 6);
      sheet('Даты поездки', `<div class="cal-form">
          <div class="cal-2"><div><label>Начало</label><input class="st-input" type="date" id="cal-s" value="${s0}"></div>
          <div><label>Конец</label><input class="st-input" type="date" id="cal-e" value="${e0}"></div></div>
          <button class="st-btn st-btn-fw" data-a="ok">Сохранить</button>
          ${dates ? '<button class="st-btn st-btn-g st-btn-fw" data-a="clear" style="color:#E5484D">Убрать даты</button>' : ''}
        </div>`, (root, close) => {
        root.querySelector('[data-a="ok"]').addEventListener('click', () => {
          const s = root.querySelector('#cal-s').value, e = root.querySelector('#cal-e').value;
          if (!s || !e) { ctx.toast('Укажите обе даты'); return; }
          if (e < s) { ctx.toast('Конец не может быть раньше начала'); return; }
          if (diffDays(s, e) > 90) { ctx.toast('Поездка длиннее 90 дней — проверьте даты'); return; }
          dates = { start: s, end: e }; saveDates(); selected = s; month = s.slice(0, 7); close(); openMonth();
        });
        root.querySelector('[data-a="clear"]')?.addEventListener('click', () => { dates = null; saveDates(); close(); openMonth(); });
      });
    }

    // Погода на выбранный день (сводка, которую сохраняет модуль «Погода»)
    function wxRow(d) {
      const ahead = diffDays(today(), d);
      if (!ctx.trip || ahead < 0 || ahead > 15) return '';
      let w = null;
      try { const s = JSON.parse(localStorage.getItem('st_wx_days_' + ctx.trip.id)); w = s && s.days && s.days[d] ? { city: s.city, v: s.days[d] } : null; } catch (_) {}
      const txt = w ? `${esc(w.city)}: ${Math.round(w.v[2])}° / ${Math.round(w.v[1])}°${w.v[3] >= 20 ? ' · дождь ' + w.v[3] + '%' : ''}` : 'Погода на этот день';
      return `<button class="cal-card cal-wx" type="button" data-a="wx"><i data-lucide="${w && w.v[0] >= 51 ? 'cloud-rain' : w && w.v[0] >= 2 ? 'cloud-sun' : 'sun'}"></i><span>${txt}</span><i data-lucide="chevron-right" class="cal-fchev"></i></button>`;
    }

    // ===== Страница 2: события недели =====
    function evRow(e, d) {
      const t = typeOf(e.type);
      const tm = timeOn(e, d);
      let sub = e.sub != null ? e.sub : ([e.place, e.note].filter(Boolean).join(' · ') || t.name);
      if (endOf(e) !== e.date && e.sub == null) { // несколько дней: «Заезд», «Выезд» или «день 2 из 4»
        const [s, f] = SE(t), n = diffDays(e.date, endOf(e)) + 1;
        const tag = d === e.date ? s : d === endOf(e) ? f : 'день ' + (diffDays(e.date, d) + 1) + ' из ' + n;
        sub = tag + ' · ' + rangeLabel(e.date, endOf(e)) + (e.place ? ' · ' + e.place : '');
      } else if (e.time && e.endTime) sub = e.time + '–' + e.endTime + ' · ' + sub;
      const pin = !!e.place && !e.booking; // брони открываются по нажатию, свои события с местом — на карте
      const go = pin ? 'map-pin' : 'chevron-right';
      return `<button class="cal-card cal-ev${isPast(e) ? ' past' : ''}" type="button" data-ev="${e.id}">
        ${tm ? `<span class="cal-ev-time">${esc(tm)}</span>` : '<span class="cal-ev-time none">весь<br>день</span>'}
        <span class="cal-ev-ic" style="background:${tBg(t)};color:${t.color}">${tIcon(t)}</span>
        <span class="cal-ev-txt"><span class="cal-ev-ttl">${esc(e.title)}</span><span class="cal-ev-sub">${esc(sub)}</span></span>
        <i data-lucide="${go}" class="cal-ev-go${pin ? ' pin' : ''}"${pin ? ' data-map="1"' : ''}></i>
      </button>`;
    }

    function openDay() {
      ctx.openScreen({
        title: fullDate(selected),
        onBack: openMonth,
        action: { icon: 'more-vertical', label: 'Ещё', onClick: menu },
        render(body, screen) {
          const mon = mondayOf(selected);
          const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
          const list = byDay(selected);
          body.innerHTML = `
            <div class="cal-week2" id="cal-week">${days.map((d, i) => `
              <button class="cal-wday${d === selected ? ' sel' : ''}${d === today() ? ' today' : ''}" type="button" data-day="${d}">
                <small>${WD[i]}</small><b>${parse(d).getDate()}</b>${dots(d)}
              </button>`).join('')}
            </div>
            ${wxRow(selected)}
            <div class="cal-tl" id="cal-tl">
              ${list.length ? list.map(e => evRow(e, selected)).join('') : `<div class="cal-empty" style="margin-left:-72px">В этот день событий нет.<br>Нажмите «+», чтобы добавить.</div>`}
            </div>
            <div style="height:90px"></div>
            <button class="cal-fab" type="button" aria-label="Добавить событие"><i data-lucide="plus"></i></button>
          `;
          screen.setTitle(fullDate(selected));
          const go = n => { selected = addDays(selected, n); month = selected.slice(0, 7); screen.refresh(); };
          body.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => { selected = b.dataset.day; month = selected.slice(0, 7); screen.refresh(); }));
          onSwipe(body.querySelector('#cal-week'), () => go(7), () => go(-7));
          onSwipe(body.querySelector('#cal-tl'), () => go(1), () => go(-1));
          body.querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', ev => {
            const e = allEvents().find(x => x.id === b.dataset.ev); if (!e) return;
            if (ev.target.closest('[data-map]')) { window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(e.place), '_blank'); return; }
            if (e.booking) { // бронь открываем в «Бронированиях»
              try { sessionStorage.setItem('st_bk_open', e.bookingId); } catch (_) {}
              STHub.openService('bookings'); return;
            }
            openForm(e, e.date, openDay);
          }));
          body.querySelector('.cal-fab').addEventListener('click', () => openForm(null, selected, openDay));
          body.querySelector('[data-a="wx"]')?.addEventListener('click', () => {
            try { sessionStorage.setItem('st_wx_date', selected); } catch (_) {}
            STHub.openService('weather');
          });
        }
      });
    }

    // Фото билета: уменьшаем до ~1200px, JPEG — чтобы не переполнить память телефона
    function compress(file, max = 1200, square = false) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onerror = reject;
        r.onload = () => {
          const img = new Image();
          img.onerror = reject;
          img.onload = () => {
            const c = document.createElement('canvas');
            if (square) { // квадрат по центру — для своей иконки
              const s = Math.min(img.width, img.height);
              c.width = c.height = max;
              c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, max, max);
              resolve(c.toDataURL('image/jpeg', 0.8)); return;
            }
            const k = Math.min(1, max / Math.max(img.width, img.height));
            c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', 0.7));
          };
          img.src = r.result;
        };
        r.readAsDataURL(file);
      });
    }

    // ===== Страница 3: добавить / изменить событие =====
    const REMIND = [[0.5, 'За 30 минут'], [1, 'За 1 час'], [2, 'За 2 часа'], [24, 'За 1 день']];
    function openForm(ev, day, back) {
      const draft = ev ? Object.assign({}, ev, { type: typeOf(ev.type).id })
        : { id: uid(), title: '', date: day || selected, time: '', type: 'transport', endDate: '', endTime: '', place: '', note: '', remind: false, doc: '' };
      const screen = ctx.openScreen({
        title: ev ? 'Событие' : 'Добавить событие',
        onBack: back,
        action: { icon: 'check', label: 'Сохранить', onClick: save },
        render(body) {
          const t = typeOf(draft.type);
          const [l1, l2] = SE(t);
          const showEnd = draft._end || draft.endDate || draft.endTime;
          const dateRow = (id, val, icon, ph) => `<label class="cal-row"><i data-lucide="${icon}"></i>
              <span class="cal-row-v${val ? '' : ' ph'}" id="${id}-v">${val ? esc(fullDate(val)) : ph}</span><i data-lucide="chevron-right" class="cal-fchev"></i>
              <input class="cal-native" type="date" id="${id}" value="${esc(val || '')}"></label>`;
          const timeRow = (id, val, ph) => `<label class="cal-row"><i data-lucide="clock"></i>
              <span class="cal-row-v${val ? '' : ' ph'}" id="${id}-v">${val ? esc(val) : ph}</span><i data-lucide="chevron-down" class="cal-fchev"></i>
              <input class="cal-native" type="time" id="${id}" value="${esc(val || '')}"></label>`;
          body.innerHTML = `
            <div class="cal-form" style="gap:12px">
              <div class="cal-types">${allTypes().filter(x => !x.hidden || x.id === draft.type).map(x => `
                <button class="cal-type${x.id === draft.type ? ' on' : ''}" type="button" data-type="${x.id}" style="color:${x.color}">
                  ${tIcon(x)}<span style="color:var(--text)">${esc(x.name)}</span></button>`).join('')}
                <button class="cal-type plus" type="button" data-a="new-type" aria-label="Свой тип события"><i data-lucide="plus"></i><span style="color:var(--text)">Своё</span></button>
              </div>
              <div class="cal-row" style="margin-top:4px">${tIcon(t)}<input id="f-title" maxlength="80" placeholder="Название" value="${esc(draft.title)}"></div>
              ${dateRow('f-date', draft.date, 'calendar', 'Дата')}
              ${timeRow('f-time', draft.time, 'Время (необязательно)')}
              ${showEnd ? `<div class="cal-endlbl">${l2}</div>
                ${dateRow('f-edate', draft.endDate, 'calendar-check', 'Дата (если другой день)')}
                ${timeRow('f-etime', draft.endTime, 'Время (необязательно)')}`
                : `<button class="cal-row sub" type="button" data-a="end"><i data-lucide="plus"></i>${l2}: дата и время</button>`}
              <div class="cal-row"><i data-lucide="map-pin"></i><input id="f-place" maxlength="120" placeholder="Место" value="${esc(draft.place)}"><i data-lucide="chevron-right" class="cal-fchev"></i></div>
              <div class="cal-row"><i data-lucide="file-text"></i><input id="f-note" maxlength="200" placeholder="Заметка (необязательно)" value="${esc(draft.note)}"></div>
              <div class="cal-card cal-rem" style="margin-top:4px">
                <i data-lucide="bell"></i>
                <div class="cal-rem-txt"><b>Напоминание</b>
                  <select id="f-rem"${draft.remind ? '' : ' disabled'}>${REMIND.map(([h, n]) => `<option value="${h}"${+(draft.remind || 2) === h ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
                <label class="cal-switch"><input type="checkbox" id="f-rem-on"${draft.remind ? ' checked' : ''}><span></span></label>
              </div>
              <button class="cal-card cal-doc" type="button" id="f-doc">
                <span class="cal-doc-ic">${draft.doc ? `<img src="${draft.doc}" alt="">` : '<i data-lucide="ticket"></i>'}</span>
                <span class="cal-doc-txt">${draft.doc ? 'Билет прикреплён<br><small style="color:var(--t2)">Нажмите, чтобы открыть</small>' : 'Добавить документ / билет'}</span>
                ${draft.doc ? '<i data-lucide="x" id="f-doc-x" style="width:20px;height:20px;color:var(--t3)"></i>' : ''}
              </button>
              <input type="file" id="f-file" accept="image/*" hidden>
              ${ev ? '<button class="cal-del" type="button" id="f-del"><i data-lucide="trash-2"></i>Удалить событие</button>' : ''}
              <div style="height:12px"></div>
            </div>`;
          document.getElementById('mod-action')?.classList.add('cal-save');
          body.querySelector('.cal-type.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });

          const read = () => {
            draft.title = body.querySelector('#f-title').value.trim();
            draft.date = body.querySelector('#f-date').value;
            draft.time = body.querySelector('#f-time').value;
            draft.endDate = body.querySelector('#f-edate')?.value || '';
            draft.endTime = body.querySelector('#f-etime')?.value || '';
            draft.place = body.querySelector('#f-place').value.trim();
            draft.note = body.querySelector('#f-note').value.trim();
            draft.remind = body.querySelector('#f-rem-on').checked ? +body.querySelector('#f-rem').value : false;
          };
          body.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => {
            read();
            const x = typeOf(b.dataset.type);
            // повторное нажатие на свой тип — изменить или удалить его
            if (x.id === draft.type && x.id.startsWith('c_')) { typeForm(x); return; }
            draft.type = x.id; screen.refresh();
          }));
          body.querySelector('[data-a="new-type"]').addEventListener('click', () => { read(); typeForm(null); });
          // строки даты и времени: нажатие открывает системный выбор, текст обновляется
          body.querySelectorAll('.cal-native').forEach(inp => {
            inp.addEventListener('click', () => { try { inp.showPicker && inp.showPicker(); } catch (_) {} });
            inp.addEventListener('change', () => {
              const v = body.querySelector('#' + inp.id + '-v');
              const ph = { 'f-date': 'Дата', 'f-edate': 'Дата (если другой день)' }[inp.id] || 'Время (необязательно)';
              v.textContent = inp.value ? (inp.type === 'date' ? fullDate(inp.value) : inp.value) : ph;
              v.classList.toggle('ph', !inp.value);
              if (inp.id === 'f-date' && body.querySelector('#f-edate')) body.querySelector('#f-edate').min = inp.value;
            });
          });
          body.querySelector('[data-a="end"]')?.addEventListener('click', () => { read(); draft._end = true; screen.refresh(); });
          body.querySelector('#f-rem-on').addEventListener('change', e => { body.querySelector('#f-rem').disabled = !e.target.checked; });
          const file = body.querySelector('#f-file');
          body.querySelector('#f-doc').addEventListener('click', e => {
            if (e.target.closest('#f-doc-x')) { read(); draft.doc = ''; screen.refresh(); return; }
            if (draft.doc) { const w = window.open(); if (w) w.document.write(`<img src="${draft.doc}" style="max-width:100%">`); else file.click(); return; }
            file.click();
          });
          file.addEventListener('change', async () => {
            const f = file.files[0]; if (!f) return;
            if (!f.type.startsWith('image/')) { ctx.toast('Пока можно прикрепить только фото или скриншот'); return; }
            try { read(); draft.doc = await compress(f); screen.refresh(); }
            catch (_) { ctx.toast('Не получилось открыть картинку'); }
          });
          body.querySelector('#f-del')?.addEventListener('click', () => {
            if (!confirm('Удалить событие «' + draft.title + '»?')) return;
            events = events.filter(x => x.id !== draft.id); saveEvents(); ctx.toast('Событие удалено'); back();
          });
          body._read = read;
        }
      });
      // Свой тип: название, иконка из набора или своя картинка/фото, цвет
      function typeForm(old) {
        const t = old ? Object.assign({}, old) : { id: 'c_' + uid(), name: '', icon: 'star', img: '', color: COLORS[0], kind: 'note' };
        const prev = () => `<span class="cal-ev-ic" style="background:${tBg(t)};color:${t.color}">${tIcon(t)}</span>
          <b style="flex:1;min-width:0;overflow-wrap:anywhere">${esc(t.name) || '<span style="color:var(--t3);font-weight:600">Название</span>'}</b>`;
        sheet(old ? 'Свой тип' : 'Новый тип события', `<div class="cal-form" style="margin-top:10px">
            <div class="cal-ct-prev" id="cal-ct-prev">${prev()}</div>
            <label>Название</label>
            <input class="st-input" id="cal-ct-name" maxlength="16" value="${esc(t.name)}" placeholder="Например: Концерт">
            <label>Иконка</label>
            <div class="cal-icons">${ICON_SET.map(i => `<button type="button" data-i="${i}" class="${!t.img && t.icon === i ? 'on' : ''}"><i data-lucide="${i}"></i></button>`).join('')}</div>
            <button class="st-btn st-btn-g st-btn-fw" type="button" data-a="img"><i data-lucide="image-plus"></i>${t.img ? 'Заменить свою картинку' : 'Своя иконка или фото'}</button>
            <input type="file" id="cal-ct-file" accept="image/*" hidden>
            <label>Цвет</label>
            <div class="cal-colors">${COLORS.map(c => `<button type="button" data-c="${c}" class="${t.color === c ? 'on' : ''}" style="background:${c}" aria-label="Цвет"></button>`).join('')}</div>
            <button class="st-btn st-btn-fw" type="button" data-a="ok" style="margin-top:6px">${old ? 'Сохранить' : 'Создать'}</button>
            ${old ? '<button class="cal-del" type="button" data-a="del"><i data-lucide="trash-2"></i>Удалить тип</button>' : ''}
          </div>`, (root, close) => {
          const pv = root.querySelector('#cal-ct-prev');
          const redraw = () => { pv.innerHTML = prev(); if (typeof initializeIcons === 'function') initializeIcons(pv); };
          root.querySelector('#cal-ct-name').addEventListener('input', e => { t.name = e.target.value.trim(); redraw(); });
          root.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => {
            t.icon = b.dataset.i; t.img = '';
            root.querySelectorAll('[data-i]').forEach(x => x.classList.toggle('on', x === b)); redraw();
          }));
          root.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
            t.color = b.dataset.c; root.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === b)); redraw();
          }));
          const file = root.querySelector('#cal-ct-file');
          root.querySelector('[data-a="img"]').addEventListener('click', () => file.click());
          file.addEventListener('change', async () => {
            const f = file.files[0]; if (!f) return;
            if (!f.type.startsWith('image/')) { ctx.toast('Выберите картинку или фото'); return; }
            try { t.img = await compress(f, 128, true); root.querySelectorAll('[data-i]').forEach(x => x.classList.remove('on')); redraw(); }
            catch (_) { ctx.toast('Не получилось открыть картинку'); }
          });
          root.querySelector('[data-a="ok"]').addEventListener('click', () => {
            if (!t.name) { ctx.toast('Введите название'); root.querySelector('#cal-ct-name').focus(); return; }
            const i = CUSTOM.findIndex(x => x.id === t.id);
            if (i >= 0) CUSTOM[i] = t; else CUSTOM.push(t);
            if (!saveCustom()) { ctx.toast('Не хватает памяти: попробуйте картинку меньше'); return; }
            draft.type = t.id; close(); screen.refresh();
          });
          root.querySelector('[data-a="del"]')?.addEventListener('click', () => {
            const n = events.filter(e => e.type === t.id).length;
            if (!confirm('Удалить тип «' + t.name + '»?' + (n ? ' У ' + n + ' ' + plural(n, 'события', 'событий', 'событий') + ' он сменится на «Другое».' : ''))) return;
            CUSTOM = CUSTOM.filter(x => x.id !== t.id); saveCustom();
            if (draft.type === t.id) draft.type = 'transport';
            close(); screen.refresh();
          });
        });
      }

      function save() {
        const body = document.getElementById('mod-body');
        body && body._read && body._read();
        if (!draft.title) { ctx.toast('Введите название'); body.querySelector('#f-title')?.focus(); return; }
        if (!draft.date) { ctx.toast('Выберите дату'); return; }
        if (draft.endTime && !draft.endDate) draft.endDate = draft.date;
        if (draft.endDate && draft.endDate < draft.date) { ctx.toast('Окончание не может быть раньше начала'); return; }
        if (draft.endDate === draft.date && draft.time && draft.endTime && draft.endTime < draft.time) { ctx.toast('Время окончания раньше начала'); return; }
        if (draft.endDate && diffDays(draft.date, draft.endDate) > 90) { ctx.toast('Событие длиннее 90 дней — проверьте даты'); return; }
        if (draft.endDate === draft.date && !draft.endTime) draft.endDate = '';
        delete draft._end;
        const i = events.findIndex(x => x.id === draft.id);
        if (i >= 0) events[i] = draft; else events.push(draft);
        try { saveEvents(); }
        catch (_) { ctx.toast('Не хватает памяти: попробуйте фото меньше'); return; }
        selected = draft.date; month = selected.slice(0, 7);
        ctx.toast(ev ? 'Сохранено' : 'Событие добавлено');
        back === openMonth ? openMonth() : openDay();
      }
    }

    openMonth();
  });
})();
