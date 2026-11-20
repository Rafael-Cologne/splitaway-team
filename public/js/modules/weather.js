// ============================================================
// Модуль «Погода» (id: 'weather')
// Ответственный: Рафаэль · Issue «Модуль «Погода»»
// ------------------------------------------------------------
// Экраны:
//   1. Погода — город (поездка / поиск / геолокация / избранное),
//      сейчас, ощущается, ветер, влажность, УФ, по часам, 7 дней,
//      предупреждения, климат для далёких дат поездки.
//   2. Подробно — день: график температуры, осадки, ветер, восход,
//      закат, давление, видимость, УФ; вкладки 7 дней, 14 дней, радар.
// Данные: Open-Meteo (без ключа; бесплатно для некоммерческого
// использования — для коммерческого нужен их тариф), радар RainViewer,
// карта OpenStreetMap. Последний прогноз хранится на устройстве (офлайн).
// Для «Календаря» сохраняется сводка по дням: st_wx_days_<tripId>.
// ============================================================
(function () {
  'use strict';
  if (!window.STHub) return;

  // ---------- Помощники ----------
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const today = () => iso(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const dayName = s => parse(s).getDate() + ' ' + MONTHS[parse(s).getMonth()];
  const dayLong = s => WD[parse(s).getDay()] + ', ' + dayName(s);
  const rangeLabel = (a, b) => { const A = parse(a), B = parse(b); return A.getMonth() === B.getMonth() ? A.getDate() + ' – ' + B.getDate() + ' ' + MONTHS[B.getMonth()] + ' ' + B.getFullYear() : dayName(a) + ' – ' + dayName(b) + ' ' + B.getFullYear(); };
  const hhmm = t => String(t || '').slice(11, 16);
  const ls = {
    get(k, f) { try { const v = localStorage.getItem(k); return v == null ? f : JSON.parse(v); } catch (_) { return f; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  };
  let UNIT = ls.get('st_wx_unit', 'C');
  const T = c => c == null || isNaN(c) ? '–' : Math.round(UNIT === 'F' ? c * 9 / 5 + 32 : c);
  const deg = c => T(c) + '°';

  // ---------- Погодные коды WMO → текст и иконка ----------
  const WMO = {
    0: ['Ясно', 'clear'], 1: ['Преимущественно ясно', 'pc'], 2: ['Переменная облачность', 'pc'], 3: ['Пасмурно', 'cloud'],
    45: ['Туман', 'fog'], 48: ['Изморозь и туман', 'fog'],
    51: ['Слабая морось', 'drizzle'], 53: ['Морось', 'drizzle'], 55: ['Сильная морось', 'drizzle'], 56: ['Ледяная морось', 'drizzle'], 57: ['Ледяная морось', 'drizzle'],
    61: ['Небольшой дождь', 'rain'], 63: ['Дождь', 'rain'], 65: ['Сильный дождь', 'rain'], 66: ['Ледяной дождь', 'rain'], 67: ['Сильный ледяной дождь', 'rain'],
    71: ['Небольшой снег', 'snow'], 73: ['Снег', 'snow'], 75: ['Сильный снег', 'snow'], 77: ['Снежная крупа', 'snow'],
    80: ['Кратковременный дождь', 'showers'], 81: ['Ливень', 'showers'], 82: ['Сильный ливень', 'showers'], 85: ['Снегопад', 'snow'], 86: ['Сильный снегопад', 'snow'],
    95: ['Гроза', 'thunder'], 96: ['Гроза с градом', 'thunder'], 99: ['Сильная гроза с градом', 'thunder']
  };
  const wText = c => (WMO[c] || ['—'])[0];
  const wKind = c => (WMO[c] || ['', 'cloud'])[1];

  // ---------- Иконки (свои SVG, без внешних картинок) ----------
  // Объёмные облака из нескольких «шаров» с общим градиентом, солнце с мягким свечением,
  // капли-слезинки, снежинки, молния. Всё внутри 64×64 с полями, чтобы ничего не залезало на подписи.
  let gid = 0;
  function wxIcon(code, day, size) {
    const k = wKind(code), n = ++gid, s = size || 40;
    const sun = (cx, cy, r) => `<g><circle cx="${cx}" cy="${cy}" r="${r * 1.75}" fill="url(#wg${n})"/>` +
      Array.from({ length: 12 }, (_, i) => { const t = i * Math.PI / 6, a = r * 1.22, b = r * (i % 2 ? 1.5 : 1.62), w = .13;
        const p = (rad, ang) => (cx + Math.cos(ang) * rad).toFixed(2) + ' ' + (cy + Math.sin(ang) * rad).toFixed(2);
        return `<path d="M${p(a, t - w)} L${p(b, t)} L${p(a, t + w)}Z" fill="#FFB524" stroke="#FFB524" stroke-width="${(r * .12).toFixed(2)}" stroke-linejoin="round"/>`; }).join('') +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#ws${n})"/><circle cx="${cx - r * .35}" cy="${cy - r * .38}" r="${r * .32}" fill="#FFF6C8" opacity=".55"/></g>`;
    const moon = (cx, cy, r) => `<g><circle cx="${cx}" cy="${cy}" r="${r * 1.5}" fill="url(#wmg${n})"/>
      <path d="M${cx + r * .25} ${cy - r} A${r} ${r} 0 1 0 ${cx + r} ${cy + r * .45} A${r * .78} ${r * .78} 0 0 1 ${cx + r * .25} ${cy - r}Z" fill="url(#wm${n})"/>
      <circle cx="${cx - r * .35}" cy="${cy + r * .1}" r="${r * .12}" fill="#E2B64A" opacity=".5"/><circle cx="${cx - r * .05}" cy="${cy + r * .55}" r="${r * .08}" fill="#E2B64A" opacity=".45"/>
      <path d="M${cx + r * 1.15} ${cy - r * .9}l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z" fill="#FFE9A6"/></g>`;
    // облако: x, y — сдвиг, sc — масштаб, dark — грозовое/дождевое
    const cloud = (x, y, sc, dark) => `<g transform="translate(${x} ${y}) scale(${sc || 1})">
      <ellipse cx="33" cy="50" rx="20" ry="2.6" fill="#1B2A4A" opacity=".12"/>
      <g fill="${dark ? '#5E6A86' : '#AFBFD6'}" transform="translate(0 1.6)"><circle cx="21" cy="37" r="10"/><circle cx="33" cy="29" r="13.5"/><circle cx="45.5" cy="36.5" r="10.5"/><rect x="11" y="36" width="45" height="12" rx="6"/></g>
      <g fill="url(#${dark ? 'wd' : 'wc'}${n})"><circle cx="21" cy="37" r="10"/><circle cx="33" cy="29" r="13.5"/><circle cx="45.5" cy="36.5" r="10.5"/><rect x="11" y="36" width="45" height="12" rx="6"/></g>
      <path d="M22.5 30.5a9 9 0 0 1 5.5-6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="${dark ? '.35' : '.9'}"/></g>`;
    const drop = (x, y, sc) => `<path transform="translate(${x} ${y}) rotate(18) scale(${(sc || 1) * 1.3})" d="M0 -4.6C0 -4.6 -3 -.9 -3 1.2a3 3 0 0 0 6 0C3 -.9 0 -4.6 0 -4.6Z" fill="url(#wr${n})"/>`;
    const flake = (x, y, r) => `<g transform="translate(${x} ${y})" stroke="#6FB4FF" stroke-width="2.1" stroke-linecap="round">${[0, 60, 120].map(a => `<line x1="0" y1="${-r}" x2="0" y2="${r}" transform="rotate(${a})"/>`).join('')}<circle r="1.2" fill="#BFE0FF" stroke="none"/></g>`;
    const defs = `<defs>
      <radialGradient id="ws${n}" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="#FFF2A0"/><stop offset=".55" stop-color="#FFCB34"/><stop offset="1" stop-color="#FF9E1B"/></radialGradient>
      <radialGradient id="wg${n}"><stop offset=".45" stop-color="#FFD24A" stop-opacity=".35"/><stop offset="1" stop-color="#FFD24A" stop-opacity="0"/></radialGradient>
      <radialGradient id="wmg${n}"><stop offset=".4" stop-color="#FFE7A0" stop-opacity=".25"/><stop offset="1" stop-color="#FFE7A0" stop-opacity="0"/></radialGradient>
      <linearGradient id="wm${n}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF4C6"/><stop offset="1" stop-color="#F0B53C"/></linearGradient>
      <linearGradient id="wc${n}" x1="0" y1="15" x2="0" y2="48" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#EEF3FA"/><stop offset="1" stop-color="#C9D6E8"/></linearGradient>
      <linearGradient id="wd${n}" x1="0" y1="15" x2="0" y2="48" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#C9D1DF"/><stop offset=".55" stop-color="#9DA9C0"/><stop offset="1" stop-color="#6E7B97"/></linearGradient>
      <linearGradient id="wr${n}" x1="0" y1="-5" x2="0" y2="4" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#8FD0FF"/><stop offset="1" stop-color="#2D7FE6"/></linearGradient>
      <linearGradient id="wb${n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE45C"/><stop offset="1" stop-color="#FF9F1A"/></linearGradient></defs>`;
    let body;
    if (k === 'clear') body = day ? sun(32, 32, 12.5) : moon(30, 32, 14);
    else if (k === 'pc') body = (day ? sun(23, 22, 9.5) : moon(24, 21, 10)) + cloud(4, 6, .86);
    else if (k === 'cloud') body = `<g opacity=".9">${cloud(10, -6, .72, true)}</g>` + cloud(-1, 4, .95);
    else if (k === 'fog') body = cloud(0, -6, .92) + [46, 52, 58].map((y, i) => `<rect x="${12 + i * 4}" y="${y - 1.6}" width="${40 - i * 6}" height="3.2" rx="1.6" fill="#A9B7CC" opacity="${1 - i * .2}"/>`).join('');
    else if (k === 'drizzle') body = cloud(0, -8, .92) + drop(22, 50, .8) + drop(32, 55, .8) + drop(42, 50, .8);
    else if (k === 'rain') body = cloud(0, -9, .92, true) + drop(19, 50) + drop(29, 56) + drop(39, 50) + drop(49, 56);
    else if (k === 'showers') body = (day ? sun(22, 18, 8.5) : moon(22, 17, 8.5)) + cloud(4, -4, .84) + drop(23, 53) + drop(34, 57.5) + drop(45, 53);
    else if (k === 'snow') body = cloud(0, -9, .92) + flake(20, 51, 4.3) + flake(32, 56.5, 4.3) + flake(44, 51, 4.3);
    else body = cloud(0, -9, .92, true) + `<path d="M34 39l-8.5 12.5h6.5l-3.5 10 11-14h-6.8l4.3-8.5z" fill="url(#wb${n})" stroke="#E98A00" stroke-width="1" stroke-linejoin="round"/>` + drop(18, 51, .8) + drop(47, 51, .8);
    return `<svg class="wx-ic" viewBox="0 0 64 64" width="${s}" height="${s}" aria-hidden="true">${defs}${body}</svg>`;
  }

  // ---------- Стили по макету ----------
  STHub.addStyles('weather', `
    [data-module="weather"]{--wx-grad:linear-gradient(150deg,#8F7BFF,#6A4DF4 55%,#5B3FE6);--wx-ac:#6A4DF4;--wx-soft:#EFECFF;--wx-line:rgba(110,100,170,.13)}
    [data-theme=dark] [data-module="weather"]{--wx-ac:#A898FF;--wx-soft:rgba(140,120,255,.16);--wx-line:rgba(255,255,255,.09)}
    [data-module="weather"] .mod-body{display:flex;flex-direction:column;gap:14px}
    .wx-card{background:var(--hub-card);border:1px solid var(--hub-card-b);border-radius:22px;box-shadow:var(--hub-shadow)}
    button.wx-card{width:100%;font:inherit;color:var(--text);text-align:left;cursor:pointer}
    #mod-action.wx-loc{background:var(--wx-grad);color:#fff;border:0;border-radius:15px;width:48px;height:46px;box-shadow:0 8px 18px rgba(106,77,244,.35)}
    #mod-action.wx-loc svg{width:24px;height:24px}
    .hub-icbtn.wx-round svg{width:22px;height:22px}
    .hub-icbtn.wx-round.on svg{fill:#FF4D6D;color:#FF4D6D}
    /* поездка */
    .wx-trip{display:flex;align-items:center;gap:16px;padding:11px 18px 11px 11px}
    .wx-trip img{width:100px;height:76px;border-radius:15px;object-fit:cover;flex-shrink:0}
    .wx-trip-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
    .wx-trip-t b{font-size:1.15rem;font-weight:800}
    .wx-meta{display:flex;align-items:center;gap:8px;color:var(--text);font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .wx-meta svg{width:16px;height:16px;flex-shrink:0}
    .wx-chev{width:22px;height:22px;flex-shrink:0}
    /* главная карточка */
    /* Заставка — нарисованная сцена в цветах приложения: небо по погоде и времени суток,
       солнце/луна, облака, дождь, снег, звёзды и силуэт города. Без фото из интернета —
       появляется сразу, без «переключения», текст всегда читается. */
    .wx-hero{position:relative;border-radius:24px;overflow:hidden;min-height:0;color:#fff;box-shadow:0 14px 30px rgba(70,60,170,.25);background:var(--sky);isolation:isolate}
    .wx-hero.sun{--sky:linear-gradient(180deg,#4A6FDC 0%,#7C8BEA 38%,#B9A0EA 72%,#F0B6CB 100%);--sil:rgba(40,30,110,.62)}
    .wx-hero.cloud{--sky:linear-gradient(180deg,#5D66AE 0%,#8A8FC9 45%,#BDB7DF 100%);--sil:rgba(38,32,96,.6)}
    .wx-hero.rain{--sky:linear-gradient(180deg,#38407D 0%,#555A98 50%,#8580B7 100%);--sil:rgba(24,20,66,.72)}
    .wx-hero.snow{--sky:linear-gradient(180deg,#6F82CC 0%,#9DA9E0 50%,#D6D7F1 100%);--sil:rgba(52,46,120,.55)}
    .wx-hero.fog{--sky:linear-gradient(180deg,#6E7299 0%,#9A9CBB 50%,#C9C6DC 100%);--sil:rgba(50,46,96,.45)}
    .wx-hero.night{--sky:linear-gradient(180deg,#0F1235 0%,#24205E 50%,#4F3988 100%);--sil:rgba(8,6,28,.86)}
    .wx-hero.dk.rain{--sky:linear-gradient(180deg,#191C42 0%,#2D2E63 55%,#4A4580 100%);--sil:rgba(6,5,24,.85)}
    .wx-hero.dk.snow,.wx-hero.dk.fog{--sky:linear-gradient(180deg,#22264F 0%,#3B3D72 55%,#66649A 100%);--sil:rgba(10,8,32,.82)}
    .wx-hero>.wx-l{position:absolute;inset:0;pointer-events:none}
    .wx-orb{position:absolute;top:24px;right:30px;width:70px;height:70px;border-radius:50%;z-index:0}
    .wx-hero.sun .wx-orb{background:radial-gradient(circle,#FFF8DD 0 40%,#FFE3A0 48%,rgba(255,220,150,0) 72%);box-shadow:0 0 70px 26px rgba(255,214,160,.45)}
    .wx-hero.cloud .wx-orb{background:radial-gradient(circle,rgba(255,246,220,.85) 0 36%,rgba(255,230,180,0) 70%);opacity:.7}
    .wx-hero.night .wx-orb,.wx-hero.dk .wx-orb{width:44px;height:44px;top:28px;right:44px;background:transparent;box-shadow:inset -11px 5px 0 0 #F1ECFF;filter:drop-shadow(0 0 14px rgba(230,220,255,.7))}
    .wx-hero.rain .wx-orb,.wx-hero.snow .wx-orb,.wx-hero.fog .wx-orb{opacity:.35}
    .wx-cl{position:absolute;border-radius:50%;background:radial-gradient(ellipse at center,rgba(255,255,255,.8) 0%,rgba(255,255,255,.35) 45%,rgba(255,255,255,0) 70%);animation:wxDrift 38s ease-in-out infinite alternate}
    .wx-cl.a{width:260px;height:96px;top:34px;right:-40px}
    .wx-cl.b{width:200px;height:70px;top:84px;right:120px;opacity:.75;animation-duration:52s}
    .wx-cl.c{width:240px;height:80px;top:8px;left:-60px;opacity:.55;animation-duration:46s}
    .wx-hero.sun .wx-cl.a,.wx-hero.sun .wx-cl.c{display:none}
    .wx-hero.sun .wx-cl.b{opacity:.5;top:96px}
    .wx-hero.night .wx-cl{opacity:.12}
    .wx-hero.rain .wx-cl,.wx-hero.dk .wx-cl{background:radial-gradient(ellipse at center,rgba(214,214,240,.55) 0%,rgba(200,200,235,.2) 45%,rgba(200,200,235,0) 70%)}
    @keyframes wxDrift{from{transform:translateX(0)}to{transform:translateX(-40px)}}
    .wx-fx{position:absolute;inset:0}
    .wx-hero.rain .wx-fx{background:repeating-linear-gradient(105deg,rgba(255,255,255,.28) 0 1px,rgba(255,255,255,0) 1px 13px);background-size:100% 160%;animation:wxRain 1.1s linear infinite;
      -webkit-mask-image:linear-gradient(180deg,rgba(0,0,0,.2),#000 40%,rgba(0,0,0,.3));mask-image:linear-gradient(180deg,rgba(0,0,0,.2),#000 40%,rgba(0,0,0,.3))}
    @keyframes wxRain{from{background-position:0 0}to{background-position:-24px 90px}}
    .wx-hero.snow .wx-fx{background-image:radial-gradient(circle,rgba(255,255,255,.95) 0 1.6px,rgba(255,255,255,0) 2.4px),radial-gradient(circle,rgba(255,255,255,.7) 0 1.1px,rgba(255,255,255,0) 1.8px);
      background-size:46px 46px,29px 29px;background-position:0 0,13px 17px;animation:wxSnow 9s linear infinite}
    @keyframes wxSnow{to{background-position:20px 230px,-15px 170px}}
    .wx-hero.night .wx-fx{background-image:radial-gradient(circle,rgba(255,255,255,.9) 0 1px,rgba(255,255,255,0) 1.6px),radial-gradient(circle,rgba(220,210,255,.7) 0 .8px,rgba(255,255,255,0) 1.3px);
      background-size:63px 47px,37px 29px;background-position:7px 5px,21px 13px;-webkit-mask-image:linear-gradient(180deg,#000 30%,rgba(0,0,0,0) 72%);mask-image:linear-gradient(180deg,#000 30%,rgba(0,0,0,0) 72%);animation:wxTw 4s ease-in-out infinite alternate}
    @keyframes wxTw{from{opacity:.65}to{opacity:1}}
    .wx-hero.fog .wx-fx{background:linear-gradient(180deg,rgba(255,255,255,0) 35%,rgba(240,238,250,.38) 55%,rgba(255,255,255,0) 64%,rgba(240,238,250,.32) 78%,rgba(255,255,255,.12) 100%)}
    .wx-sil{position:absolute;left:0;right:0;bottom:0;height:62%;background:var(--sil);-webkit-mask:var(--sm) right bottom/150% auto no-repeat;mask:var(--sm) right bottom/150% auto no-repeat}
    .wx-hero.snow .wx-sil::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.35),rgba(255,255,255,0) 30%)}
    .wx-hero::after{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background:linear-gradient(90deg,rgba(16,14,56,.42),rgba(16,14,56,.14) 55%,rgba(0,0,0,0) 78%)}
    .wx-hero.snow::after,.wx-hero.fog::after{background:linear-gradient(90deg,rgba(28,24,80,.5),rgba(28,24,80,.2) 60%,rgba(0,0,0,0) 85%)}
    @media (prefers-reduced-motion:reduce){.wx-cl,.wx-fx{animation:none!important}}
    .wx-hero-in{position:relative;z-index:1;padding:20px 22px 18px;display:flex;flex-direction:column;height:100%;text-shadow:0 1px 3px rgba(10,8,40,.45),0 2px 14px rgba(10,8,40,.35)}
    .wx-city{display:flex;align-items:center;gap:10px;font-size:1.45rem;font-weight:800}
    .wx-city svg{width:24px;height:24px;fill:#fff;color:#2E6CD8}
    .wx-city svg.lucide-navigation{width:21px;height:21px}
    .wx-here{font-size:.72rem;font-weight:700;background:rgba(255,255,255,.25);border-radius:999px;padding:3px 9px;text-shadow:none;margin-left:2px;align-self:center}
    .wx-now{font-size:.92rem;font-weight:500;margin:4px 0 0 34px;opacity:.95}
    .wx-big{display:flex;align-items:center;gap:12px;margin-top:14px}
    .wx-big .wx-ic{filter:drop-shadow(0 4px 8px rgba(0,0,0,.18))}
    .wx-temp{font-size:4.1rem;font-weight:800;line-height:.9;letter-spacing:-.03em}
    .wx-temp sup{font-size:1.9rem;font-weight:700;vertical-align:top;position:relative;top:4px;margin-left:4px}
    .wx-desc{font-size:1.25rem;font-weight:700;margin-top:8px}
    .wx-mm{font-size:1.15rem;font-weight:700;margin-top:6px;display:flex;gap:16px}
    .wx-hero.sm{min-height:200px}
    .wx-hero.sm .wx-temp{font-size:3.6rem}
    /* Компактная заставка 2,4:1: погода и температура слева, пейзаж справа и на фоне.
       Фон: фото этого места → универсальный пейзаж по погоде (/img/weather/bg-*.webp) → нарисованное небо.
       Текст всегда отдельными элементами поверх картинки. */
    .wx-hero>img.wx-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:right center;z-index:0;opacity:0;transition:opacity .45s}
    .wx-hero>img.wx-bg.on{opacity:1}
    .wx-hero.night>img.wx-bg.place,.wx-hero.dk>img.wx-bg.place{filter:brightness(.5) saturate(.8)}
    .wx-hero.rain>img.wx-bg.place{filter:saturate(.5) brightness(.8)}
    .wx-hero.cloud>img.wx-bg.place,.wx-hero.snow>img.wx-bg.place,.wx-hero.fog>img.wx-bg.place{filter:saturate(.65) brightness(.88)}
    .wx-hero.pic .wx-sil{display:none}
    .wx-credit{position:absolute;right:10px;bottom:6px;z-index:2;max-width:60%;font-size:.58rem;line-height:1.2;color:rgba(255,255,255,.85);text-decoration:none;text-shadow:0 1px 3px rgba(0,0,0,.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .wx-hero>img.wx-bg.city{object-position:78% center}
    .wx-hero.night>img.wx-bg.city,.wx-hero.dk>img.wx-bg.city{filter:brightness(.72)}
    .wx-hero.pic::after{background:linear-gradient(90deg,rgba(14,12,48,.62),rgba(14,12,48,.32) 42%,rgba(0,0,0,0) 72%)}
    .wx-hero .wx-hero-in{box-sizing:border-box;padding:16px 20px 16px;justify-content:flex-start;gap:0;max-width:62%}
    .wx-hero .wx-city{font-size:1.4rem;gap:9px;white-space:nowrap}
    .wx-hero .wx-city svg{width:21px;height:21px}
    .wx-hero .wx-city svg.lucide-navigation{width:20px;height:20px}
    .wx-hero .wx-here{font-size:.68rem;padding:3px 9px}
    .wx-hero .wx-now{font-size:.84rem;margin:3px 0 0 30px;white-space:nowrap}
    .wx-hero .wx-big{margin-top:8px;gap:12px;align-items:center}
    .wx-hero .wx-temp,.wx-hero.sm .wx-temp{font-size:3.5rem}
    .wx-hero .wx-temp sup{font-size:1.5rem;top:3px}
    .wx-hero .wx-desc{font-size:1.12rem;font-weight:800;margin-top:6px}
    .wx-hero .wx-mm{font-size:1.05rem;font-weight:800;margin-top:4px;gap:16px}
    .wx-hero.near .wx-city small.wx-here{background:rgba(255,200,90,.32)}
    /* место не указано — нейтральная заставка без погоды */
    .wx-hero.none{background:radial-gradient(120% 140% at 80% 120%,#2E6FD8 0%,#173A86 38%,#0E1E52 70%,#0A1440 100%)}
    .wx-hero.none .wx-l{background-image:radial-gradient(circle,rgba(150,190,255,.35) 0 1.2px,rgba(0,0,0,0) 1.8px);background-size:11px 11px;-webkit-mask-image:linear-gradient(90deg,rgba(0,0,0,0) 30%,#000 75%);mask-image:linear-gradient(90deg,rgba(0,0,0,0) 30%,#000 75%)}
    .wx-hero.none .wx-hero-in{justify-content:center;gap:6px}
    .wx-none-t{font-size:1.25rem;font-weight:800}
    .wx-none-s{font-size:.82rem;line-height:1.35;opacity:.9;max-width:78%}
    .wx-none-b{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
    .wx-pill{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:999px;border:0;background:rgba(255,255,255,.94);color:#5B3FE0;font:inherit;font-size:.86rem;font-weight:800;cursor:pointer;text-shadow:none}
    .wx-pill.ghost{background:rgba(255,255,255,.16);color:#fff}
    .wx-pill svg{width:16px;height:16px}
    .wx-stat em{font-style:normal;font-size:.68rem;color:var(--t2);font-weight:500;margin-top:-2px}
    /* качество воздуха */
    .wx-aq{padding:14px 16px}
    .wx-aq-h{display:flex;align-items:center;gap:10px}
    .wx-aq-h svg{width:22px;height:22px;color:var(--wx-ac);flex-shrink:0}
    .wx-aq-h b{flex:1;font-size:1rem;white-space:nowrap}
    .wx-aq-v{font-size:.8rem;font-weight:800;color:#fff;border-radius:999px;padding:4px 10px;white-space:nowrap}
    .wx-aq-l{font-weight:800;font-size:.9rem;margin-top:6px}
    .wx-aq-bar{position:relative;height:8px;border-radius:8px;margin:12px 2px 4px;background:linear-gradient(90deg,#2FA84F 0 16.6%,#8BC34A 16.6% 33.3%,#C9A400 33.3% 50%,#F07A00 50% 66.6%,#E0442D 66.6% 83.3%,#8E24AA 83.3%)}
    .wx-aq-bar i{position:absolute;top:-4px;width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid var(--text);transform:translateX(-50%);box-sizing:border-box}
    .wx-aq-g{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px;text-align:center}
    .wx-aq-g small{display:block;font-size:.7rem;color:var(--t2);font-weight:600}
    .wx-aq-g b{font-size:.92rem}
    .wx-aq-tip{font-size:.84rem;margin-top:10px;line-height:1.35}
    .wx-aq-src{font-size:.7rem;color:var(--t2);margin-top:8px;line-height:1.35}
    /* показатели */
    .wx-stats{display:grid;grid-template-columns:repeat(4,1fr);padding:12px 4px}
    .wx-stat{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;border-right:1px solid var(--wx-line);padding:0 2px}
    .wx-stat:last-child{border-right:0}
    .wx-stat svg{width:24px;height:24px;color:var(--wx-ac)}
    .wx-stat small{font-size:.76rem;color:var(--t2);font-weight:500}
    .wx-stat b{font-size:1.02rem;font-weight:700;white-space:nowrap}
    /* по часам */
    .wx-hours{display:flex;gap:0;overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:2px 16px 6px}
    .wx-hours::-webkit-scrollbar{display:none}
    .wx-hour{flex:0 0 74px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 0;background:var(--hub-card);border-top:1px solid var(--hub-card-b);border-bottom:1px solid var(--hub-card-b);font-size:.86rem;font-weight:600}
    .wx-hour:nth-child(2){border-left:1px solid var(--hub-card-b);border-radius:20px 0 0 20px}
    .wx-hour:last-child{border-right:1px solid var(--hub-card-b);border-radius:0 20px 20px 0}
    .wx-hour b{font-size:1.05rem}
    .wx-hour small{font-size:.7rem;color:#2F86E8;font-weight:700;min-height:12px}
    .wx-hour.now{background:var(--wx-grad);color:#fff;border-radius:20px;border:0;box-shadow:0 10px 20px rgba(106,77,244,.32);margin-right:4px;position:relative;z-index:1}
    .wx-hour.now small{color:#fff}
    .wx-h2{font-size:1.32rem;font-weight:800;margin:8px 2px -2px}
    /* 7 дней */
    .wx-days{padding:2px 18px}
    .wx-day{display:grid;grid-template-columns:1fr 50px 92px 22px;align-items:center;gap:8px;min-height:62px;border-bottom:1px solid var(--wx-line);width:100%;background:none;border-left:0;border-right:0;border-top:0;font:inherit;color:var(--text);text-align:left;cursor:pointer;padding:0}
    .wx-day:last-child{border-bottom:0}
    .wx-day-n{font-size:1rem;font-weight:500;display:flex;flex-direction:column}
    .wx-day-n small{font-size:.7rem;color:var(--wx-ac);font-weight:700}
    .wx-day-n{min-width:0}
    .wx-day-n small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .wx-day-ic{display:flex;flex-direction:column;align-items:center}
    .wx-day-ic{gap:2px;padding:5px 0}
    .wx-day-ic small{font-size:.68rem;line-height:1;color:#2F86E8;font-weight:800;margin-top:0;letter-spacing:.01em}
    .wx-day-t{text-align:right;font-size:1rem;font-weight:700;font-variant-numeric:tabular-nums}
    .wx-day-t span{color:var(--t2);font-weight:600}
    .wx-day>svg:last-child{width:20px;height:20px}
    .wx-day.trip .wx-day-n{font-weight:700}
    /* вкладки */
    .wx-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:5px}
    .wx-tab{border:0;background:none;border-radius:15px;padding:11px 2px;font:inherit;font-size:.95rem;font-weight:600;color:var(--text);cursor:pointer}
    .wx-tab.on{background:var(--wx-grad);color:#fff;box-shadow:0 8px 16px rgba(106,77,244,.3)}
    .wx-chart{padding:14px 10px 8px}
    .wx-chart svg{width:100%;height:auto;display:block;overflow:visible}
    .wx-chart text{font-family:inherit}
    .wx-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .wx-box{display:flex;align-items:center;gap:14px;padding:14px 16px}
    .wx-box svg{width:30px;height:30px;color:var(--wx-ac);flex-shrink:0;stroke-width:1.8}
    .wx-box.sunset svg{color:#F0533F}
    .wx-box small{display:block;font-size:.82rem;color:var(--t2)}
    .wx-box b{display:block;font-size:1.12rem;font-weight:700;margin-top:2px}
    .wx-uv{display:flex;align-items:center;gap:16px;padding:16px 18px}
    .wx-uv>svg{width:40px;height:40px;color:var(--wx-ac);flex-shrink:0}
    .wx-uv-t{flex:1}
    .wx-uv-t b{display:block;font-size:1.02rem;font-weight:700;margin-bottom:12px}
    .wx-uvbar{position:relative;height:8px;border-radius:8px;background:linear-gradient(90deg,#3BBF5B,#C9D93A 30%,#F5B623 55%,#F2542D 78%,#E0315A)}
    .wx-uvbar i{position:absolute;top:50%;width:20px;height:20px;border-radius:50%;background:#7A5AF8;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25);transform:translate(-50%,-50%)}
    .wx-alert{display:flex;gap:14px;align-items:center;padding:14px 16px;border-radius:20px;background:#FFF2DD;border:1px solid #FFD9A0;color:#7A4600;cursor:pointer;width:100%;font:inherit;text-align:left}
    .wx-alert svg{width:26px;height:26px;color:#F08A00;flex-shrink:0}
    .wx-alert b{display:block;font-size:.95rem}
    .wx-alert span{font-size:.82rem}
    [data-theme=dark] .wx-alert{background:rgba(255,170,40,.13);border-color:rgba(255,170,40,.3);color:#FFD08A}
    .wx-tip{display:flex;gap:14px;align-items:flex-start;padding:14px 16px}
    .wx-tip svg{width:24px;height:24px;color:var(--wx-ac);flex-shrink:0;margin-top:2px}
    .wx-tip b{display:block;font-size:.95rem;margin-bottom:3px}
    .wx-tip span{font-size:.86rem;color:var(--t2);line-height:1.45}
    .wx-note{font-size:.8rem;color:var(--t2);text-align:center;padding:0 10px;line-height:1.4}
    .wx-empty{padding:28px 18px;text-align:center;color:var(--t2);display:flex;flex-direction:column;align-items:center;gap:12px}
    .wx-skel{border-radius:24px;background:linear-gradient(90deg,var(--hub-card),var(--wx-soft),var(--hub-card));background-size:200% 100%;animation:wxsk 1.2s infinite linear}
    @keyframes wxsk{to{background-position:-200% 0}}
    .wx-radar{position:relative;border-radius:22px;overflow:hidden;aspect-ratio:1/1;background:#dfe7ef}
    .wx-radar-in{position:absolute;width:768px;height:768px;transform-origin:0 0}
    .wx-radar-in img{position:absolute;width:256px;height:256px}
    .wx-radar-in img.rad{opacity:.75}
    .wx-pin{position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:var(--wx-ac);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);z-index:2}
    .wx-src{font-size:.72rem;color:var(--t2);text-align:right;padding:0 4px}
    /* места */
    .wx-chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:-2px -16px;padding:2px 16px 4px}
    .wx-chips::-webkit-scrollbar{display:none}
    .wx-chip{flex:0 0 auto;display:flex;align-items:center;gap:7px;padding:9px 14px;border-radius:999px;border:1px solid var(--hub-card-b);background:var(--hub-card);box-shadow:var(--hub-shadow);font:inherit;font-size:.9rem;font-weight:600;color:var(--text);cursor:pointer;white-space:nowrap}
    .wx-chip svg{width:16px;height:16px;color:var(--wx-ac)}
    .wx-chip b{font-weight:800}
    .wx-chip.on{background:var(--wx-grad);color:#fff;border-color:transparent;box-shadow:0 8px 16px rgba(106,77,244,.3)}
    .wx-chip.on svg{color:#fff}
    .wx-chip.add{border-style:dashed;box-shadow:none;background:transparent;color:var(--wx-ac)}
    /* окно выбора города */
    .wx-sheet-row{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;border-radius:16px;border:1px solid var(--hub-card-b);background:var(--hub-card);font:inherit;color:var(--text);text-align:left;cursor:pointer}
    .wx-sheet-row svg{width:22px;height:22px;color:var(--wx-ac);flex-shrink:0}
    .wx-sheet-row span{flex:1;min-width:0;display:flex;flex-direction:column}
    .wx-sheet-row small{color:var(--t2);font-size:.78rem}
    .wx-sheet-row.on{border-color:var(--wx-ac);box-shadow:0 0 0 1px var(--wx-ac) inset}
    .wx-lbl{font-size:.78rem;font-weight:700;color:var(--t2);margin:10px 2px 2px}
    .wx-units{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .wx-units button{padding:12px;border-radius:14px;border:1.5px solid var(--hub-card-b);background:var(--hub-card);font:inherit;font-weight:700;color:var(--text);cursor:pointer}
    .wx-units button.on{border-color:var(--wx-ac);background:var(--wx-soft);color:var(--wx-ac)}
    @media (max-width:380px){.wx-trip img{width:92px;height:68px}.wx-temp{font-size:3.5rem}.wx-stat small{font-size:.7rem}.wx-stat b{font-size:.95rem}.wx-tab{font-size:.86rem}}
  `);

  // ---------- Данные: Open-Meteo ----------
  const API = 'https://api.open-meteo.com/v1/forecast';
  const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
  const ARCH = 'https://archive-api.open-meteo.com/v1/archive';
  async function getJSON(url, ms) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms || 12000);
    try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error('http ' + r.status); return await r.json(); }
    finally { clearTimeout(t); }
  }
  const keyOf = loc => (+loc.lat).toFixed(2) + ',' + (+loc.lon).toFixed(2);
  // Прогноз: из кэша, если свежий (30 мин); без сети — последний сохранённый
  async function forecast(loc, force) {
    const k = 'st_wx_cache_' + keyOf(loc), c = ls.get(k, null);
    if (c && !force && Date.now() - c.t < 15 * 60000) return Object.assign({ cachedAt: c.t }, c.data);
    const url = API + '?latitude=' + loc.lat + '&longitude=' + loc.lon + '&timezone=auto&forecast_days=16&models=best_match' +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,is_day,precipitation,pressure_msl' +
      '&hourly=temperature_2m,apparent_temperature,weather_code,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,is_day,visibility,pressure_msl,uv_index,relative_humidity_2m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset,uv_index_max';
    try {
      const data = await getJSON(url);
      ls.set(k, { t: Date.now(), data });
      return Object.assign({ cachedAt: Date.now() }, data);
    } catch (e) {
      if (c) return Object.assign({ cachedAt: c.t, offline: true }, c.data);
      throw e;
    }
  }
  const AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality';
  async function airQuality(loc) {
    const k = 'st_wx_aq_' + keyOf(loc), c = ls.get(k, null);
    if (c && Date.now() - c.t < 30 * 60000) return c.data;
    const data = await getJSON(AQ + '?latitude=' + loc.lat + '&longitude=' + loc.lon + '&timezone=auto&domains=auto&current=european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone', 10000);
    ls.set(k, { t: Date.now(), data });
    return data;
  }
  // Уровни европейского индекса качества воздуха (EAQI)
  const aqLevel = v => v <= 20 ? ['Хорошее', '#2FA84F', ''] : v <= 40 ? ['Удовлетворительное', '#7CB342', '']
    : v <= 60 ? ['Умеренное', '#C9A400', 'Чувствительным людям лучше не заниматься спортом на улице долго.']
    : v <= 80 ? ['Плохое', '#F07A00', 'Сократите долгие прогулки и спорт на улице, особенно детям и людям с астмой.']
    : v <= 100 ? ['Очень плохое', '#E0442D', 'Лучше оставаться в помещении; на улице — меньше нагрузки.'] : ['Крайне плохое', '#8E24AA', 'Избегайте нахождения на улице.'];
  async function searchCity(q) {
    const j = await getJSON(GEO + '?count=8&language=ru&format=json&name=' + encodeURIComponent(q), 8000);
    return (j.results || []).map(r => ({ name: r.name, region: [r.admin1, r.country].filter(Boolean).join(', '), country: r.country || '', lat: r.latitude, lon: r.longitude, fc: r.feature_code || '' }));
  }
  // Климат: средние за те же даты трёх прошлых лет (это не прогноз!)
  async function climate(loc, start, end) {
    const k = 'st_wx_clim_' + keyOf(loc) + '_' + start.slice(5) + '_' + end.slice(5), c = ls.get(k, null);
    if (c) return c;
    const y0 = new Date().getFullYear();
    const years = [1, 2, 3].map(i => y0 - i);
    const res = await Promise.all(years.map(y => {
      const s = y + start.slice(4), e = (y + (end.slice(0, 4) - start.slice(0, 4))) + end.slice(4);
      return getJSON(ARCH + '?latitude=' + loc.lat + '&longitude=' + loc.lon + '&timezone=auto&start_date=' + s + '&end_date=' + e +
        '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code').catch(() => null);
    }));
    const ok = res.filter(r => r && r.daily && r.daily.time && r.daily.time.length);
    if (!ok.length) throw new Error('climate');
    const all = k2 => ok.flatMap(r => r.daily[k2].filter(v => v != null));
    const avg = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
    const out = { max: avg(all('temperature_2m_max')), min: avg(all('temperature_2m_min')), rainDays: all('precipitation_sum').filter(v => v >= 1).length / ok.length, days: ok[0].daily.time.length, years: ok.length };
    ls.set(k, out);
    return out;
  }
  // Название места по координатам (для «Моё местоположение»)
  async function placeName(lat, lon) {
    try {
      // zoom 14 — видны деревни и хутора; погода всё равно по координатам, название — только подпись
      const j = await getJSON('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=ru&lat=' + lat + '&lon=' + lon, 7000);
      const a = j.address || {}, region = [a.state, a.country].filter(Boolean).join(', ');
      const own = a.city || a.town || a.village || a.hamlet || a.isolated_dwelling;
      if (own) return { name: own, region, country: a.country || '' };
      // населённого пункта нет (поле, горы, трасса) — явно пишем, что это окрестности
      const area = a.municipality || a.county || a.state_district || a.state;
      return area ? { name: 'Рядом с ' + area, region, country: a.country || '', near: true } : { name: 'Моё местоположение', region, country: a.country || '', near: true };
    } catch (_) { return { name: 'Моё местоположение', region: '', country: '' }; }
  }

  // ---------- Разбор прогноза ----------
  function dayIndex(f, date) { return f.daily.time.indexOf(date); }
  function hoursOf(f, date) {
    const out = [];
    f.hourly.time.forEach((t, i) => { if (t.slice(0, 10) === date) out.push(i); });
    return out;
  }
  function nowIndex(f) {
    const cur = (f.current && f.current.time) || '';
    let i = f.hourly.time.findIndex(t => t.slice(0, 13) === cur.slice(0, 13));
    return i < 0 ? 0 : i;
  }
  const uvLevel = u => u == null ? ['—', 'var(--t2)'] : u < 3 ? ['Низкий', '#2FA84F'] : u < 6 ? ['Средний', '#C9A400'] : u < 8 ? ['Высокий', '#F07A00'] : u < 11 ? ['Очень высокий', '#E0442D'] : ['Экстремальный', '#B5179E'];
  // Предупреждения по прогнозу (не официальные — Open-Meteo их не даёт)
  function warnings(f, from, to) {
    const out = [];
    f.daily.time.forEach((d, i) => {
      if (d < from || d > to) return;
      const D = f.daily, c = D.weather_code[i];
      const add = (icon, title, text) => out.push({ date: d, i, icon, title, text });
      if (c >= 95) add('cloud-lightning', 'Гроза', 'Возможна гроза' + (c >= 96 ? ' с градом' : ''));
      if (D.precipitation_sum[i] >= 20) add('cloud-rain', 'Сильный дождь', 'До ' + Math.round(D.precipitation_sum[i]) + ' мм осадков');
      if (D.temperature_2m_max[i] >= 35) add('thermometer-sun', 'Жара', 'До ' + deg(D.temperature_2m_max[i]) + ' — пейте воду, избегайте солнца днём');
      if (D.temperature_2m_min[i] <= -10) add('snowflake', 'Сильный мороз', 'До ' + deg(D.temperature_2m_min[i]));
      if ((D.wind_gusts_10m_max || [])[i] >= 65) add('wind', 'Сильный ветер', 'Порывы до ' + Math.round(D.wind_gusts_10m_max[i]) + ' км/ч');
      if ((D.uv_index_max || [])[i] >= 8) add('sun', 'Очень высокий УФ', 'УФ-индекс ' + Math.round(D.uv_index_max[i]) + ' — нужен крем SPF 50');
    });
    return out;
  }
  // Короткий совет: одежда и занятия
  function advice(f, i) {
    const D = f.daily, mx = D.temperature_2m_max[i], mn = D.temperature_2m_min[i], p = (D.precipitation_probability_max || [])[i] || 0, uv = (D.uv_index_max || [])[i] || 0, w = D.wind_speed_10m_max[i];
    const wear = mx >= 28 ? 'Лёгкая одежда, головной убор и солнцезащитный крем.' : mx >= 20 ? 'Футболка днём, лёгкая кофта на вечер.' : mx >= 12 ? 'Куртка или свитер, удобная обувь.' : mx >= 3 ? 'Тёплая куртка, шарф.' : 'Зимняя одежда, шапка и перчатки.';
    const extra = [];
    if (p >= 50) extra.push('возьмите зонт — вероятность дождя ' + p + '%');
    if (uv >= 6) extra.push('УФ высокий: SPF 30+ и тень в полдень');
    if (w >= 35) extra.push('ветрено — на пляже и в горах будет прохладнее');
    const act = p >= 60 ? 'Хороший день для музеев и кафе.' : mx >= 24 && p < 30 ? 'Отличный день для пляжа и прогулок у моря.' : 'Подходит для прогулок и экскурсий.';
    return wear + (extra.length ? ' Ещё: ' + extra.join('; ') + '.' : '') + ' ' + act + (mn < mx - 10 ? ' Вечером заметно прохладнее (' + deg(mn) + ').' : '');
  }

  // Окно снизу (внутри экрана модуля, чтобы работали стили)
  function sheet(title, html, bind) {
    document.getElementById('wx-sheet')?.remove();
    const ov = document.createElement('div');
    ov.className = 'ov open'; ov.id = 'wx-sheet';
    ov.innerHTML = `<div class="mdl"><div class="mdl-handle"></div><div class="mdl-title">${esc(title)}</div>${html}</div>`;
    const close = () => { ov.remove(); document.body.style.overflow = ''; };
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    (document.getElementById('pg-module') || document.body).appendChild(ov);
    document.body.style.overflow = 'hidden';
    if (typeof initializeIcons === 'function') initializeIcons(ov);
    bind(ov.firstChild, close);
  }

  STHub.registerService('weather', ctx => {
    const trip = ctx.trip;
    const tripDates = (() => { try { const d = trip && JSON.parse(localStorage.getItem('st_mod_calendar_' + trip.id + '_dates')); return d && d.start ? d : null; } catch (_) { return null; } })();
    const inTrip = d => !!tripDates && d >= tripDates.start && d <= tripDates.end;
    // Места: «Моё местоположение» (геолокация устройства) + места, которые добавил пользователь
    let places = ls.get('st_wx_places', null);
    if (!places) { places = ls.get('st_wx_favs', []); ls.set('st_wx_places', places); }
    let here = ls.get('st_wx_here', null);           // { lat, lon, name, region, country, t }
    let sel = ctx.store.get('sel', 'here');           // 'here' или ключ места
    let geoState = 'idle';                             // idle | ok | denied | unavailable
    let f = null, err = null, loading = false;
    let openDate = null;
    try { openDate = sessionStorage.getItem('st_wx_date'); sessionStorage.removeItem('st_wx_date'); } catch (_) {}
    if (openDate) { const sm = ls.get('st_wx_days_' + (trip ? trip.id : ''), null); if (sm && sm.key && places.some(x => keyOf(x) === sm.key)) sel = sm.key; }
    function pickLoc() {
      if (sel !== 'here') { const p = places.find(x => keyOf(x) === sel); if (p) return p; sel = 'here'; }
      return here ? Object.assign({ here: true }, here) : null;
    }
    let loc = pickLoc();

    // Города поездки: направление поездки + города прилёта из «Бронирований»
    function tripCities() {
      const out = [];
      if (trip && trip.dest) out.push({ q: trip.dest, from: tripDates && tripDates.start, to: tripDates && tripDates.end });
      try {
        const bk = JSON.parse(localStorage.getItem('st_mod_bookings_' + (trip ? trip.id : '') + '_items')) || [];
        bk.filter(b => b.cat === 'flight' && b.toCity && b.status !== 'cancelled').sort((a, b) => (a.date || '').localeCompare(b.date || ''))
          .forEach(b => { if (!out.some(x => x.q.toLowerCase() === b.toCity.toLowerCase())) out.push({ q: b.toCity, from: b.date }); });
      } catch (_) {}
      return out;
    }
    async function resolve(q) {
      const k = 'st_wx_geo2_' + q.toLowerCase(), c = ls.get(k, null);
      if (c) return c;
      const r = (await searchCity(q))[0];
      if (r) ls.set(k, r);
      return r || null;
    }
    const isFav = () => !!loc && places.some(x => keyOf(x) === keyOf(loc));
    function select(key) { sel = key; ctx.store.set('sel', key); loc = pickLoc(); f = null; err = null; }
    function addPlace(p, andSelect) {
      const clean = { name: p.name, region: p.region || '', country: p.country || '', lat: +p.lat, lon: +p.lon };
      if (!places.some(x => keyOf(x) === keyOf(clean))) { places.push(clean); ls.set('st_wx_places', places); }
      if (andSelect) select(keyOf(clean));
    }
    function removePlace(key) {
      places = places.filter(x => keyOf(x) !== key); ls.set('st_wx_places', places);
      if (sel === key) select('here');
    }
    // Где устройство сейчас (геолокация); название места — по координатам
    function locate() {
      return new Promise(res => {
        if (!navigator.geolocation) { geoState = 'unavailable'; return res(null); }
        navigator.geolocation.getCurrentPosition(async p => {
          const lat = +p.coords.latitude.toFixed(3), lon = +p.coords.longitude.toFixed(3);
          const same = here && here.name && Math.abs(here.lat - lat) + Math.abs(here.lon - lon) < 0.03;
          const nm = same ? { name: here.name, region: here.region, country: here.country, near: here.near } : await placeName(lat, lon);
          here = Object.assign({ lat, lon, t: Date.now() }, nm);
          ls.set('st_wx_here', here); geoState = 'ok'; res(here);
        }, e => { geoState = e && e.code === 1 ? 'denied' : 'unavailable'; res(null); },
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60000 });
      });
    }

    // Сводка по дням для «Календаря»
    function saveSummary() {
      // для календаря поездки — погода места поездки (или «здесь», если поездка уже идёт)
      if (!trip || !f || (loc.here && !(tripDates && inTrip(today())) && ls.get('st_wx_days_' + trip.id, null))) return;
      const days = {};
      f.daily.time.forEach((d, i) => { days[d] = [f.daily.weather_code[i], f.daily.temperature_2m_max[i], f.daily.temperature_2m_min[i], (f.daily.precipitation_probability_max || [])[i]]; });
      ls.set('st_wx_days_' + trip.id, { city: loc.name, key: loc.here ? '' : keyOf(loc), t: Date.now(), days });
    }

    async function fetchShow(force, screen) {
      loading = true; err = null;
      try { f = await forecast(loc, force); saveSummary(); }
      catch (e) { err = 'net'; }
      loading = false;
      if (screen) screen.refresh();
    }
    async function load(force, screen) {
      if (sel === 'here') {
        if (loc) await fetchShow(force, screen);           // сначала последнее известное место — сразу
        const prev = here, pos = await locate();             // затем уточняем, где вы сейчас
        if (sel !== 'here') return;
        if (pos) {
          const moved = !prev || Math.abs(prev.lat - pos.lat) + Math.abs(prev.lon - pos.lon) > 0.02;
          loc = pickLoc();
          if (moved || !f) await fetchShow(force, screen); else if (screen) screen.refresh();
        } else if (!loc) {
          // геолокации нет — берём город поездки или первое своё место
          const p = places[0];
          if (p) { select(keyOf(p)); await fetchShow(force, screen); return; }
          err = geoState === 'denied' ? 'denied' : 'nogeo'; if (screen) screen.refresh();
        }
        return;
      }
      if (!loc) { err = 'nocity'; if (screen) screen.refresh(); return; }
      await fetchShow(force, screen);
    }

    // ---------- общие куски разметки ----------
    function tripCard() {
      if (!trip) return '';
      return `<button class="wx-card wx-trip" type="button" data-a="city"><img src="/img/trips/abstract.jpg" alt="">
        <span class="wx-trip-t"><b>${esc(trip.name || 'Поездка')}</b>
          <span class="wx-meta"><i data-lucide="map-pin"></i>${esc(trip.dest || 'Направление не указано')}</span>
          ${tripDates ? `<span class="wx-meta"><i data-lucide="calendar-days"></i>${esc(rangeLabel(tripDates.start, tripDates.end))}</span>` : ''}
        </span><i data-lucide="chevron-down" class="wx-chev"></i></button>`;
    }
    const tempOf = l => { const c = ls.get('st_wx_cache_' + keyOf(l), null); return c && c.data && c.data.current ? c.data.current.temperature_2m : null; };
    function chipsHtml() {
      const chip = (key, icon, name, temp, on) => `<button class="wx-chip${on ? ' on' : ''}" type="button" data-sel="${esc(key)}"><i data-lucide="${icon}"></i><span>${esc(name)}</span>${temp != null ? `<b>${deg(temp)}</b>` : ''}</button>`;
      return `<div class="wx-chips" id="wx-chips">${chip('here', 'navigation', here ? here.name : 'Моё место', here ? tempOf(here) : null, sel === 'here')}${places.map(p => chip(keyOf(p), 'map-pin', p.name, tempOf(p), sel === keyOf(p))).join('')}<button class="wx-chip add" type="button" data-a="add"><i data-lucide="plus"></i><span>Место</span></button></div>`;
    }
    // Погода для картинки: дождь / снег / туман / ночь / пасмурно / солнце
    function heroImg(code, day) {
      const k = wKind(code);
      if (k === 'rain' || k === 'drizzle' || k === 'showers' || k === 'thunder') return 'rain';
      if (k === 'snow') return 'snow';
      if (k === 'fog') return 'fog';
      if (!day) return 'night';
      return k === 'cloud' ? 'cloud' : 'sun';
    }
    // силуэт города: свой для городов с иллюстрацией, иначе общий городской
    const SIL = [[/берлин|berlin/i, 'q64'], [/к[её]льн|koeln|köln|cologne/i, 'q365']];
    // для остальных мест силуэта нет: чужой «город» на фоне деревни вводил бы в заблуждение
    const silOf = name => { const m = SIL.find(x => x[0].test(name || '')); return m ? '/img/weather/sil-' + m[1] + '.webp' : ''; };
    // Универсальный пейзаж по погоде и времени суток. Файлы кладём в /img/weather/ (≈1200×500, 2,4:1, без текста):
    // bg-sun, bg-cloud, bg-rain, bg-snow, bg-fog, bg-night, bg-rain-night, bg-snow-night, bg-fog-night (.webp).
    // Пока файла нет — остаётся нарисованное небо.
    const bgOf = (kind, dark) => '/img/weather/bg-' + kind + (dark && kind !== 'night' ? '-night' : '') + '.webp';
    // Фон заставки: фото именно этого места; если его нет — универсальный пейзаж по погоде.
    // Пока ищем фото, видно нарисованное небо — чужая картинка не мелькает перед фото места.
    // Готовые фото городов (как на макете): показываем сразу, если место — этот город (название + не дальше 40 км от центра)
    const CITY_PIC = [
      { re: /к[её]льн|koeln|köln|cologne/i, lat: 50.94, lon: 6.96, url: '/img/covers/q365.webp' },
      { re: /берлин|berlin/i, lat: 52.52, lon: 13.40, url: '/img/covers/q64.webp' }
    ];
    const km = (a, b, c, d) => { const r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.sqrt(x * x + y * y) * 6371; };
    const cityPic = (name, lat, lon) => (CITY_PIC.find(c => c.re.test(name || '') && (isNaN(lat) || km(lat, lon, c.lat, c.lon) < 40)) || {}).url || '';
    function loadHeroBg(root) {
      (root || document).querySelectorAll('.wx-hero > img.wx-bg:not([data-done])').forEach(img => {
        img.dataset.done = '1';
        const hero = img.parentNode;
        let placed = false;
        const show = (url, place) => {
          const pre = new Image();
          pre.onload = () => { if (!img.isConnected || (placed && !place)) return; if (place) placed = true; img.src = url; img.classList.add('on'); img.classList.toggle('place', !!place); hero.classList.add('pic'); };
          pre.src = url;
        };
        const generic = () => { if (img.dataset.bg) show(img.dataset.bg, false); };
        const name = img.dataset.name;
        const own = name && cityPic(name, +img.dataset.lat, +img.dataset.lon);
        if (own) { // готовое фото этого города — сразу, без поиска и без «перескока»
          img.src = own; img.classList.add('on', 'city'); hero.classList.add('pic'); placed = true;
          img.onerror = () => { img.classList.remove('on', 'city'); hero.classList.remove('pic'); placed = false; generic(); };
          return;
        }
        if (!name || !window.STPlacePhoto) { generic(); return; }
        // узнаваемое фото места со свободной лицензией (place-photo.js → scenic): автор и лицензия — в подписи
        const o = { lat: +img.dataset.lat, lon: +img.dataset.lon };
        const credit = r => { const a = hero.querySelector('.wx-credit'); if (!a || !r) return; a.href = r.page; a.textContent = 'Фото: ' + (r.author ? r.author + ', ' : '') + r.license; a.hidden = false; };
        const put = r => { if (r && r.url) { show(r.url, true); credit(r); } else generic(); };
        if (!STPlacePhoto.scenic) { generic(); return; }
        const pk = STPlacePhoto.peekScenic(name, o);
        if (pk !== undefined) { put(pk); return; }
        const late = setTimeout(generic, 5000); // поиск долгий — пока покажем пейзаж по погоде
        STPlacePhoto.scenic(name, o).then(r => { clearTimeout(late); put(r); }, () => { clearTimeout(late); generic(); });
      });
    }
    function hero(i, small) {
      const D = f.daily, d = D.time[i];
      const isNow = i === 0 && f.current;
      const code = isNow ? f.current.weather_code : D.weather_code[i];
      const day = isNow ? !!f.current.is_day : true;
      const temp = isNow ? f.current.temperature_2m : D.temperature_2m_max[i];
      const sub = isNow ? 'Сейчас, ' + dayLong(d) + ', ' + hhmm(f.current.time) : dayLong(d);
      const kind = heroImg(code, day);
      const sil = silOf(loc.name), dark = !day && kind !== 'night';
      setTimeout(() => loadHeroBg(), 0);
      return `<div class="wx-hero ${kind}${dark ? ' dk' : ''}${small ? ' sm' : ''}${loc.near ? ' near' : ''}">
        <div class="wx-l"><span class="wx-orb"></span><span class="wx-cl c"></span><span class="wx-cl a"></span><span class="wx-cl b"></span><span class="wx-fx"></span>
          ${sil ? `<span class="wx-sil" style="--sm:url('${sil}')"></span>` : ''}</div>
        <img class="wx-bg" alt="" data-bg="${bgOf(kind, dark)}"${loc.near ? '' : ` data-name="${esc(loc.name)}" data-lat="${loc.lat}" data-lon="${loc.lon}"`}>
        <a class="wx-credit" target="_blank" rel="noopener" hidden></a>
        <div class="wx-hero-in">
          <div class="wx-city"><i data-lucide="${loc.here ? 'navigation' : 'map-pin'}"></i>${esc(loc.name)}${loc.near ? '<small class="wx-here">по координатам</small>' : loc.here ? '<small class="wx-here">вы здесь</small>' : ''}</div>
          <div class="wx-now">${esc(sub)}${f.offline ? ' · нет сети' : ''}</div>
          <div class="wx-big">${wxIcon(code, day, 64)}<div class="wx-temp">${T(temp)}<sup>°${UNIT}</sup></div></div>
          <div class="wx-desc">${esc(wText(code))}</div>
          <div class="wx-mm"><span>↑ ${deg(D.temperature_2m_max[i])}</span><span>↓ ${deg(D.temperature_2m_min[i])}</span></div>
        </div></div>`;
    }
    function dayRow(i, extra) {
      const D = f.daily, d = D.time[i], pp = (D.precipitation_probability_max || [])[i];
      return `<button class="wx-day${inTrip(d) ? ' trip' : ''}" type="button" data-day="${i}"${extra && i >= 7 ? ' style="opacity:.8"' : ''}>
        <span class="wx-day-n">${esc(i === 0 ? 'Сегодня' : dayLong(d).replace(/^(\S)/, c => c.toUpperCase()))}${inTrip(d) ? '<small>поездка</small>' : ''}
          ${extra ? `<small style="color:var(--t2);font-weight:500">💧 ${(D.precipitation_sum[i] || 0).toFixed(1).replace('.', ',')} мм · ветер ${Math.round(D.wind_speed_10m_max[i])} км/ч</small>` : ''}</span>
        <span class="wx-day-ic">${wxIcon(D.weather_code[i], true, 42)}${pp >= 20 ? `<small>${pp}%</small>` : ''}</span>
        <span class="wx-day-t"><span>${deg(D.temperature_2m_min[i])}</span> / ${deg(D.temperature_2m_max[i])}</span>
        <i data-lucide="chevron-right"></i></button>`;
    }
    function stateHtml() {
      // Место не определено: нейтральная заставка, погоду другого города не подставляем
      if (err === 'denied' || err === 'nogeo' || err === 'nocity') {
        const why = err === 'denied' ? 'Нет доступа к геолокации. Выберите место вручную или разрешите GPS в настройках.'
          : err === 'nogeo' ? 'Не удалось определить ваше положение. Выберите место вручную.' : 'Погода показывается по выбранному месту или по вашему GPS-положению.';
        return `<div class="wx-hero none"><div class="wx-l"></div><img class="wx-bg" alt="" data-bg="/img/weather/bg-none.webp">
          <div class="wx-hero-in"><div class="wx-none-t">Место не указано</div><div class="wx-none-s">${esc(why)}</div>
            <div class="wx-none-b"><button class="wx-pill" type="button" data-a="add"><i data-lucide="crosshair"></i>Выбрать место</button>
            ${err !== 'nocity' ? '<button class="wx-pill ghost" type="button" data-a="retry"><i data-lucide="navigation"></i>По GPS</button>' : ''}</div></div></div>`;
      }
      if (err === 'net') return `<div class="wx-card wx-empty"><i data-lucide="wifi-off" style="width:34px;height:34px;color:var(--wx-ac)"></i>
          <div>Не получилось загрузить погоду. Проверьте интернет.</div><button class="st-btn" type="button" data-a="retry">Повторить</button></div>`;
      return `<div class="wx-skel" style="height:240px"></div><div class="wx-skel" style="height:86px"></div><div class="wx-skel" style="height:110px"></div>`;
    }

    // ===== Экран 1: погода =====
    function openMain() {
      const screen = ctx.openScreen({
        title: 'Погода',
        action: { icon: 'map-pin', label: 'Город', cls: 'wx-loc', onClick: () => citySheet(screen) },
        render(body, scr) {
          if (!f) { body.innerHTML = tripCard() + chipsHtml() + stateHtml(); bindCommon(body, scr); loadHeroBg(body); return; }
          const D = f.daily, c = f.current || {};
          const ni = nowIndex(f), H = f.hourly;
          const uvNow = H.uv_index ? H.uv_index[ni] : D.uv_index_max[0];
          const [uvT, uvC] = uvLevel(uvNow);
          const hours = [];
          for (let k = ni; k < Math.min(H.time.length, ni + 25); k++) hours.push(k);
          const warn = warnings(f, today(), addDays(today(), 3)).concat(tripDates ? warnings(f, tripDates.start, tripDates.end) : []);
          const w0 = warn[0];
          const last = D.time[D.time.length - 1];
          const tripPlace = !loc.here || inTrip(today());
          const climateNeeded = tripPlace && tripDates && tripDates.start > last;
          const tripInWindow = tripPlace && tripDates && tripDates.start <= last && tripDates.end >= today();
          body.innerHTML = `
            ${tripCard()}
            ${chipsHtml()}
            ${hero(0)}
            ${w0 ? `<button class="wx-alert" type="button" data-day="${w0.i}"><i data-lucide="${w0.icon}"></i><span><b>${esc(w0.title)} · ${esc(w0.date === today() ? 'сегодня' : dayLong(w0.date))}</b><span>${esc(w0.text)}. По данным прогноза.</span></span></button>` : ''}
            <div class="wx-card wx-stats">
              <div class="wx-stat"><i data-lucide="thermometer"></i><small>Ощущается</small><b>${deg(c.apparent_temperature)}${UNIT}</b></div>
              <div class="wx-stat"><i data-lucide="wind"></i><small>Ветер</small><b>${Math.round(c.wind_speed_10m)} км/ч</b></div>
              <div class="wx-stat"><i data-lucide="droplet"></i><small>Влажность</small><b>${Math.round(c.relative_humidity_2m)} %</b></div>
              <div class="wx-stat"><i data-lucide="sun"></i><small>УФ-индекс</small><b style="color:${uvC}">${Math.round(uvNow || 0)} ${uvT}</b>${Math.round(D.uv_index_max[0] || 0) > Math.round(uvNow || 0) ? `<em>днём до ${Math.round(D.uv_index_max[0])}</em>` : ''}</div>
            </div>
            <div id="wx-aq"></div>
            <div class="wx-hours">${hours.map((k, n) => {
              const now = n === 0, pp = (H.precipitation_probability || [])[k];
              return `<div class="wx-hour${now ? ' now' : ''}"><span>${now ? 'Сейчас' : hhmm(H.time[k])}</span>${wxIcon(now ? c.weather_code : H.weather_code[k], now ? c.is_day : H.is_day[k], 36)}
                <b>${deg(now ? c.temperature_2m : H.temperature_2m[k])}</b><small>${pp >= 20 ? pp + '%' : ''}</small></div>`;
            }).join('')}</div>
            ${tripInWindow ? `<button class="wx-card wx-tip" type="button" data-day="${Math.max(0, dayIndex(f, tripDates.start))}"><i data-lucide="luggage"></i><span><b>Погода на даты поездки</b><span>${esc(rangeLabel(tripDates.start, tripDates.end))} — дни поездки отмечены в прогнозе</span></span></button>` : ''}
            ${climateNeeded ? `<div class="wx-card wx-tip" id="wx-clim"><i data-lucide="calendar-range"></i><span><b>Климат на даты поездки</b><span>Загружаю средние значения…</span></span></div>` : ''}
            <div class="wx-h2">Прогноз на 7 дней</div>
            <div class="wx-card wx-days">${D.time.slice(0, 7).map((_, i) => dayRow(i)).join('')}</div>
            <div class="wx-card wx-tip"><i data-lucide="shirt"></i><span><b>Что надеть сегодня</b><span>${esc(advice(f, 0))}</span></span></div>
            <div class="wx-note">Open-Meteo · лучшая модель для региона (DWD, Météo-France, ECMWF и др.) · воздух: CAMS (Copernicus)<br>Обновлено ${new Date(f.cachedAt || Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}${f.offline ? ' · сейчас нет сети, показан сохранённый прогноз' : ''} · <a href="#" data-a="refresh" style="color:var(--wx-ac);font-weight:700">Обновить</a></div>
            <div style="height:8px"></div>`;
          bindCommon(body, scr);
          // температура в чипах для мест без свежих данных
          places.filter(p => tempOf(p) == null).slice(0, 4).forEach(p => forecast(p).then(() => {
            const ch = body.querySelector('#wx-chips'); if (ch) { ch.outerHTML = chipsHtml(); bindChips(body, scr); if (typeof initializeIcons === 'function') initializeIcons(body); }
          }).catch(() => {}));
          fillAir(body, loc);
          if (climateNeeded) climate(loc, tripDates.start, tripDates.end).then(cl => {
            const el = body.querySelector('#wx-clim span span'); if (!el) return;
            el.textContent = rangeLabel(tripDates.start, tripDates.end) + ': обычно ' + deg(cl.min) + ' / ' + deg(cl.max) + ', дождливых дней ≈ ' + Math.round(cl.rainDays) + ' из ' + cl.days + '. Это климатические средние за ' + cl.years + ' прошлых года, а не прогноз — он появится за 16 дней до поездки.';
          }).catch(() => { const el = body.querySelector('#wx-clim span span'); if (el) el.textContent = 'Прогноз появится за 16 дней до поездки. Средние значения сейчас недоступны.'; });
        }
      });
      if (!f && !loading) load(false, screen).then(() => {
        if (openDate && f) { const i = dayIndex(f, openDate); openDate = null; if (i >= 0) openDay(i, 'day'); }
      });
      return screen;
    }
    // Качество воздуха: Open-Meteo Air Quality (CAMS, Copernicus). Показываем только свежие данные (не старше 3 часов).
    async function fillAir(body, l) {
      const box = body.querySelector('#wx-aq'); if (!box || !l) return;
      let a = null;
      try { a = await airQuality(l); } catch (_) {}
      if (!box.isConnected || l !== loc) return;
      const c = a && a.current, v = c && c.european_aqi;
      if (v == null) return; // нет данных — карточку не показываем
      const ageH = (Date.now() - (Date.parse(c.time + 'Z') - (a.utc_offset_seconds || 0) * 1000)) / 3600000;
      if (!(ageH > -2 && ageH < 3)) return; // устаревшие данные не показываем
      const [lvl, col, tip] = aqLevel(v);
      const n = x => x == null ? '—' : Math.round(x);
      const eu = l.lat > 30 && l.lat < 72 && l.lon > -25 && l.lon < 45;
      box.innerHTML = `<div class="wx-card wx-aq">
          <div class="wx-aq-h"><i data-lucide="leaf"></i><b>Качество воздуха</b><span class="wx-aq-v" style="background:${col}">EAQI ${Math.round(v)}</span></div>
          <div class="wx-aq-l" style="color:${col}">${esc(lvl)}</div>
          <div class="wx-aq-bar"><i style="left:${Math.min(100, v / 120 * 100)}%"></i></div>
          <div class="wx-aq-g"><span><small>PM2.5</small><b>${n(c.pm2_5)}</b></span><span><small>PM10</small><b>${n(c.pm10)}</b></span><span><small>NO₂</small><b>${n(c.nitrogen_dioxide)}</b></span><span><small>O₃</small><b>${n(c.ozone)}</b></span></div>
          ${tip ? `<div class="wx-aq-tip">${esc(tip)}</div>` : ''}
          <div class="wx-aq-src">Европейский индекс EAQI, мкг/м³. Данные CAMS (Copernicus) через Open-Meteo на ${esc(hhmm(c.time))} — модельная оценка для сетки ~${eu ? 11 : 45} км, а не замер датчика у вас на улице.</div>
        </div>`;
      if (typeof initializeIcons === 'function') initializeIcons(box);
    }
    function bindChips(body, scr) {
      body.querySelectorAll('[data-sel]').forEach(b => b.addEventListener('click', () => {
        if (b.dataset.sel === sel && f) return;
        select(b.dataset.sel); scr.refresh(); load(false, scr);
      }));
      body.querySelectorAll('[data-a="add"]').forEach(b => b.addEventListener('click', () => citySheet(scr, true)));
    }
    // Фото поездки в карточку поездки (заставка погоды — нарисованная сцена, без фото)
    function fillPhotos(body) {
      if (window.STPlacePhoto && trip) STPlacePhoto.tripImg(body.querySelector('.wx-trip img'), trip, { width: 400 });
    }
    function bindCommon(body, scr) {
      fillPhotos(body);
      bindChips(body, scr);
      body.querySelectorAll('[data-a="city"]').forEach(b => b.addEventListener('click', () => citySheet(scr)));
      body.querySelector('[data-a="retry"]')?.addEventListener('click', () => { f = null; err = null; scr.refresh(); load(true, scr); });
      body.querySelector('[data-a="refresh"]')?.addEventListener('click', e => { e.preventDefault(); f = null; scr.refresh(); load(true, scr); });
      body.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => openDay(+b.dataset.day, 'day')));
    }

    // ---------- графики ----------
    function tempChart(i) {
      const date = f.daily.time[i], H = f.hourly;
      const idx = hoursOf(f, date).filter(k => { const h = +H.time[k].slice(11, 13); return h >= 6 && h <= 23; });
      if (idx.length < 4) return '<div class="wx-note">Нет почасовых данных</div>';
      const W = 340, top = 34, bot = 112, L = 12, R = 328;
      const ts = idx.map(k => H.temperature_2m[k]);
      const mn = Math.min(...ts), mx = Math.max(...ts), span = Math.max(4, mx - mn);
      const x = n => L + (R - L) * n / (idx.length - 1);
      const y = v => bot - (v - mn) / span * (bot - top);
      const pts = idx.map((k, n) => [x(n), y(H.temperature_2m[k])]);
      let d = `M${pts[0][0]} ${pts[0][1]}`;
      for (let n = 1; n < pts.length; n++) { const [x0, y0] = pts[n - 1], [x1, y1] = pts[n]; const cx = (x0 + x1) / 2; d += ` C${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`; }
      const labelN = idx.map((k, n) => ({ k, n, h: +H.time[k].slice(11, 13) })).filter(o => o.h % 3 === 0 && o.h <= 21);
      const maxN = labelN.reduce((a, o) => H.temperature_2m[o.k] > H.temperature_2m[a.k] ? o : a, labelN[0]);
      return `<svg viewBox="0 0 ${W} 150" role="img" aria-label="Температура по часам">
        <defs><linearGradient id="wxa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8F7BFF" stop-opacity=".35"/><stop offset="1" stop-color="#8F7BFF" stop-opacity="0"/></linearGradient></defs>
        <path d="${d} L${R} 122 L${L} 122Z" fill="url(#wxa)"/>
        <path d="${d}" fill="none" stroke="#7A5AF8" stroke-width="2.4" stroke-linecap="round"/>
        ${maxN ? `<line x1="${x(maxN.n)}" y1="${y(H.temperature_2m[maxN.k])}" x2="${x(maxN.n)}" y2="122" stroke="#7A5AF8" stroke-opacity=".25" stroke-width="1.2"/>` : ''}
        ${labelN.map(o => { const X = x(o.n), Y = y(H.temperature_2m[o.k]), big = o === maxN; return `<circle cx="${X}" cy="${Y}" r="${big ? 6.5 : 5}" fill="#7A5AF8" stroke="#fff" stroke-width="${big ? 2.5 : 2}"/>
          <text x="${X}" y="${Y - 13}" text-anchor="middle" font-size="15" font-weight="700" fill="currentColor">${deg(H.temperature_2m[o.k])}</text>
          <text x="${X}" y="144" text-anchor="middle" font-size="13" fill="var(--t2)">${pad(o.h)}:00</text>`; }).join('')}
      </svg>`;
    }
    function rainChart(i) {
      const date = f.daily.time[i], H = f.hourly;
      const idx = hoursOf(f, date).filter(k => +H.time[k].slice(11, 13) % 3 === 0);
      const W = 340, L = 18, step = (W - 2 * L) / Math.max(1, idx.length - 1);
      return `<svg viewBox="0 0 ${W} 112" role="img" aria-label="Вероятность осадков">
        ${idx.map((k, n) => { const p = (H.precipitation_probability || [])[k] || 0, mm = (H.precipitation || [])[k] || 0, h = Math.max(3, p * .62), X = L + n * step;
          return `<rect x="${X - 11}" y="${78 - h}" width="22" height="${h}" rx="6" fill="#4C9BF0" fill-opacity="${.25 + p / 140}"/>
          <text x="${X}" y="${72 - h}" text-anchor="middle" font-size="12" font-weight="700" fill="${p >= 20 ? '#2F86E8' : 'var(--t2)'}">${p}%</text>
          <text x="${X}" y="94" text-anchor="middle" font-size="11" fill="var(--t2)">${mm >= .1 ? mm.toFixed(1).replace('.', ',') : ''}</text>
          <text x="${X}" y="108" text-anchor="middle" font-size="12" fill="var(--t2)">${H.time[k].slice(11, 13)}</text>`; }).join('')}
      </svg>`;
    }
    const atNoon = (i, key) => { const H = f.hourly, k = hoursOf(f, f.daily.time[i]).find(n => H.time[n].slice(11, 13) === '12'); return k != null && H[key] ? H[key][k] : null; };

    // ===== Экран 2: подробно (день / 7 дней / 14 дней / радар) =====
    function openDay(i, tab) {
      let cur = Math.max(0, Math.min(i, f.daily.time.length - 1)), mode = tab || 'day';
      ctx.openScreen({
        title: 'Погода',
        onBack: openMain,
        action: [
          { icon: 'bell', label: 'Предупреждения', cls: 'wx-round', onClick: alertsSheet },
          { icon: 'heart', label: 'В избранное', cls: 'wx-round' + (isFav() ? ' on' : ''), onClick: () => {
            if (isFav()) { const k = keyOf(loc); places = places.filter(x => keyOf(x) !== k); ls.set('st_wx_places', places); }
            else addPlace(loc, false);
            document.getElementById('mod-action-2')?.classList.toggle('on', isFav());
            ctx.toast(isFav() ? loc.name + ' — добавлено в «Мои места»' : loc.name + ' убрано из «Моих мест»');
          } }
        ],
        render(body, screen) {
          const D = f.daily, date = D.time[cur];
          const tabs = [['day', cur === 0 ? 'Сегодня' : dayName(date)], ['7', '7 дней'], ['14', '14 дней'], ['radar', 'Радар']];
          let content = '';
          if (mode === 'day') {
            const [uvT] = uvLevel(D.uv_index_max[cur]);
            const uvPos = Math.min(100, (D.uv_index_max[cur] || 0) / 11 * 100);
            const press = atNoon(cur, 'pressure_msl'), vis = atNoon(cur, 'visibility');
            const dayWarn = warnings(f, date, date);
            content = `
              ${dayWarn.map(w => `<div class="wx-alert"><i data-lucide="${w.icon}"></i><span><b>${esc(w.title)}</b><span>${esc(w.text)}. По данным прогноза.</span></span></div>`).join('')}
              <div class="wx-h2">Ход температуры</div>
              <div class="wx-card wx-chart">${tempChart(cur)}</div>
              <div class="wx-h2">Осадки и ветер</div>
              <div class="wx-card wx-chart">${rainChart(cur)}
                <div class="wx-note" style="text-align:left;padding:6px 8px 4px;color:var(--text)">💧 Осадки за день: <b>${(D.precipitation_sum[cur] || 0).toFixed(1).replace('.', ',')} мм</b> · ветер до <b>${Math.round(D.wind_speed_10m_max[cur])} км/ч</b>${D.wind_gusts_10m_max ? ', порывы ' + Math.round(D.wind_gusts_10m_max[cur]) : ''}</div></div>
              <div class="wx-h2">Подробнее</div>
              <div class="wx-grid2">
                <div class="wx-card wx-box"><i data-lucide="sunrise"></i><span><small>Восход</small><b>${hhmm(D.sunrise[cur])}</b></span></div>
                <div class="wx-card wx-box sunset"><i data-lucide="sunset"></i><span><small>Закат</small><b>${hhmm(D.sunset[cur])}</b></span></div>
                <div class="wx-card wx-box"><i data-lucide="gauge"></i><span><small>Давление</small><b>${press != null ? Math.round(press) + ' гПа' : '—'}</b></span></div>
                <div class="wx-card wx-box"><i data-lucide="eye"></i><span><small>Видимость</small><b>${vis != null ? Math.round(vis / 1000) + ' км' : '—'}</b></span></div>
              </div>
              <div class="wx-card wx-uv"><i data-lucide="sun-medium"></i><div class="wx-uv-t"><b>УФ-индекс: ${Math.round(D.uv_index_max[cur] || 0)} – ${uvT}</b><div class="wx-uvbar"><i style="left:${uvPos}%"></i></div></div></div>
              <div class="wx-card wx-tip"><i data-lucide="shirt"></i><span><b>Совет на день</b><span>${esc(advice(f, cur))}</span></span></div>`;
          } else if (mode === '7' || mode === '14') {
            const n = mode === '7' ? 7 : Math.min(14, D.time.length);
            content = `<div class="wx-card wx-days">${D.time.slice(0, n).map((_, j) => dayRow(j, true)).join('')}</div>
              ${mode === '14' ? '<div class="wx-note">Прогноз дальше 7 дней менее точный — проверяйте ближе к дате.</div>' : ''}`;
          } else {
            content = `<div class="wx-radar" id="wx-radar"><div class="wx-empty" style="position:absolute;inset:0;justify-content:center">Загружаю радар…</div></div>
              <div class="wx-src">Осадки: RainViewer · карта © OpenStreetMap</div>
              <div class="wx-note">Радар показывает дождь за последние минуты. В некоторых странах данных нет.</div>`;
          }
          body.innerHTML = `${hero(cur, true)}
            <div class="wx-card wx-tabs">${tabs.map(([k, t]) => `<button class="wx-tab${mode === k ? ' on' : ''}" type="button" data-tab="${k}">${esc(t)}</button>`).join('')}</div>
            ${content}<div style="height:10px"></div>`;
          fillPhotos(body);
          body.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.tab; screen.refresh(); }));
          body.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => { cur = +b.dataset.day; mode = 'day'; screen.refresh(); window.scrollTo(0, 0); }));
          if (mode === 'radar') radar(body.querySelector('#wx-radar'));
        }
      });
    }

    // Радар: плитки RainViewer поверх карты OpenStreetMap (без библиотек)
    async function radar(box) {
      if (!box) return;
      try {
        const j = await getJSON('https://api.rainviewer.com/public/weather-maps.json', 8000);
        const fr = j.radar && j.radar.past && j.radar.past[j.radar.past.length - 1];
        if (!fr) throw new Error('radar');
        const z = 6, n = 2 ** z;
        const xf = (+loc.lon + 180) / 360 * n;
        const lr = +loc.lat * Math.PI / 180;
        const yf = (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n;
        const x0 = Math.floor(xf) - 1, y0 = Math.floor(yf) - 1;
        const tiles = [];
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
          const x = ((x0 + dx) % n + n) % n, y = y0 + dy;
          if (y < 0 || y >= n) continue;
          tiles.push(`<img src="https://tile.openstreetmap.org/${z}/${x}/${y}.png" style="left:${dx * 256}px;top:${dy * 256}px" alt="">
            <img class="rad" src="${j.host}${fr.path}/256/${z}/${x}/${y}/2/1_1.png" style="left:${dx * 256}px;top:${dy * 256}px" alt="">`);
        }
        const W = box.clientWidth || 340, scale = W / 300;
        const ox = (xf - x0) * 256, oy = (yf - y0) * 256;
        box.innerHTML = `<div class="wx-radar-in" style="transform:scale(${scale}) translate(${150 - ox}px,${150 - oy}px)">${tiles.join('')}</div><div class="wx-pin"></div>
          <div class="wx-src" style="position:absolute;right:10px;bottom:8px;background:rgba(255,255,255,.85);border-radius:8px;padding:2px 6px;color:#333">${new Date(fr.time * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>`;
      } catch (_) {
        box.innerHTML = '<div class="wx-empty" style="position:absolute;inset:0;justify-content:center">Радар сейчас недоступен</div>';
      }
    }

    function alertsSheet() {
      const all = warnings(f, today(), f.daily.time[f.daily.time.length - 1]);
      sheet('Предупреждения', `<div class="st-muted" style="margin:4px 0 10px;font-size:.84rem">Опасная погода по прогнозу Open-Meteo на ${f.daily.time.length} дней. Это не официальные предупреждения метеослужбы.</div>
        <div style="display:flex;flex-direction:column;gap:8px">${all.length ? all.map(w => `<button class="wx-alert" type="button" data-i="${w.i}"><i data-lucide="${w.icon}"></i><span><b>${esc(w.title)} · ${esc(dayLong(w.date))}</b><span>${esc(w.text)}</span></span></button>`).join('')
          : '<div class="wx-empty">Опасной погоды не ожидается 👍</div>'}</div>`, (root, close) => {
        root.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => { close(); openDay(+b.dataset.i, 'day'); }));
      });
    }

    // Места: поиск и добавление, «Моё местоположение», города поездки, мои места; °C / °F
    function citySheet(screen, focus) {
      const cities = tripCities();
      const row = (attr, icon, t, sub, on, rm) => `<div style="display:flex;gap:8px;align-items:center"><button class="wx-sheet-row${on ? ' on' : ''}" type="button" ${attr}><i data-lucide="${icon}"></i><span>${esc(t)}<small>${esc(sub || '')}</small></span></button>${rm ? `<button class="hub-icbtn" type="button" data-rm="${esc(rm)}" aria-label="Убрать"><i data-lucide="x"></i></button>` : ''}</div>`;
      sheet('Места', `<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
          <div class="st-input" style="display:flex;align-items:center;gap:8px;padding:0 12px"><i data-lucide="search" style="width:18px;height:18px;color:var(--t2)"></i>
            <input id="wx-q" placeholder="Добавить город, например Барселона" autocomplete="off" style="flex:1;border:0;background:transparent;font:inherit;font-size:16px;color:var(--text);outline:none;min-height:46px"></div>
          <div id="wx-res" style="display:flex;flex-direction:column;gap:8px"></div>
          ${row('data-here', 'navigation', 'Моё местоположение', here ? here.name + ' · определяется автоматически' : 'Определяется по геолокации устройства', sel === 'here')}
          ${places.length ? '<div class="wx-lbl">Мои места</div>' + places.map(c => row(`data-pl="${esc(keyOf(c))}"`, 'map-pin', c.name, c.region, sel === keyOf(c), keyOf(c))).join('') : ''}
          ${cities.length ? '<div class="wx-lbl">Из поездки</div>' + cities.map((c, i) => row(`data-tc="${i}"`, 'luggage', c.q, c.from ? (c.to ? rangeLabel(c.from, c.to) : 'с ' + dayName(c.from)) : '')).join('') : ''}
          <div class="wx-lbl">Единицы</div>
          <div class="wx-units"><button type="button" data-u="C" class="${UNIT === 'C' ? 'on' : ''}">°C</button><button type="button" data-u="F" class="${UNIT === 'F' ? 'on' : ''}">°F</button></div>
        </div>`, (root, close) => {
        const go = () => { close(); openMain(); };
        const q = root.querySelector('#wx-q'), res = root.querySelector('#wx-res');
        if (focus) setTimeout(() => q.focus(), 150);
        let t = null;
        q.addEventListener('input', () => {
          clearTimeout(t);
          const v = q.value.trim();
          if (v.length < 2) { res.innerHTML = ''; return; }
          t = setTimeout(async () => {
            res.innerHTML = '<div class="st-muted" style="font-size:.85rem;padding:4px">Ищу…</div>';
            try {
              const list = (await searchCity(v)).filter(c => !/^PCL|^ADM1$/.test(c.fc || ''));
              if (q.value.trim() !== v) return;
              res.innerHTML = list.length ? list.map((c, i) => row(`data-r="${i}"`, 'plus', c.name, c.region)).join('') : '<div class="st-muted" style="font-size:.85rem;padding:4px">Не нашли такое место. Проверьте название или выберите «Моё местоположение» — погода будет по координатам GPS.</div>';
              if (typeof initializeIcons === 'function') initializeIcons(res);
              res.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => { addPlace(list[+b.dataset.r], true); ctx.toast('Добавлено: ' + list[+b.dataset.r].name); go(); }));
            } catch (_) { res.innerHTML = '<div class="st-muted" style="font-size:.85rem;padding:4px">Нет интернета</div>'; }
          }, 450);
        });
        root.querySelector('[data-here]').addEventListener('click', () => { select('here'); go(); });
        root.querySelectorAll('[data-pl]').forEach(b => b.addEventListener('click', () => { select(b.dataset.pl); go(); }));
        root.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
          const p = places.find(x => keyOf(x) === b.dataset.rm);
          removePlace(b.dataset.rm); ctx.toast('Убрано: ' + (p ? p.name : 'место')); close(); citySheet(screen);
        }));
        root.querySelectorAll('[data-tc]').forEach(b => b.addEventListener('click', async () => {
          const nm = cities[+b.dataset.tc].q;
          try {
            const r = await resolve(nm);
            if (!r) { ctx.toast('«' + nm + '» не найден'); return; }
            if (/^PCL|^ADM1$/.test(r.fc || '')) { ctx.toast('«' + nm + '» — это страна или регион. Найдите город через поиск'); q.focus(); return; }
            addPlace(r, true); go();
          } catch (_) { ctx.toast('Нет интернета'); }
        }));
        root.querySelectorAll('[data-u]').forEach(b => b.addEventListener('click', () => { UNIT = b.dataset.u; ls.set('st_wx_unit', UNIT); go(); }));
      });
    }

    openMain();
  });
})();
