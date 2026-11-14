// ============================================================
// Splitaway Team — собственный набор иконок сервисов
// Единый стиль: мягкие градиенты, скруглённые формы, viewBox 48×48.
// Не копирует системные иконки iOS / Android.
// ============================================================
(function () {
  // Градиент: id уникален для каждой иконки, чтобы SVG не конфликтовали
  const g = (id, a, b) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  const svg = (defs, body) =>
    `<svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true" focusable="false"><defs>${defs}</defs>${body}</svg>`;

  const ICONS = {
    expenses: svg(g('sti-ex', '#FFC170', '#F2841C'),
      '<path d="M11 14l19-6.2a3.4 3.4 0 014.3 2.3L35.6 14z" fill="#FFCF94"/>' +
      '<rect x="6" y="13" width="36" height="27" rx="7.5" fill="url(#sti-ex)"/>' +
      '<rect x="29" y="21" width="13" height="11" rx="4.5" fill="#FFE4C2"/>' +
      '<circle cx="34.5" cy="26.5" r="2.3" fill="#E57A12"/>'),

    route: svg(g('sti-rt', '#B39DFF', '#7457F0'),
      '<path d="M12.5 36.5c7-1 8.5-7 13-10s10-2 11.5-9" fill="none" stroke="#C9BBFF" stroke-width="3" stroke-linecap="round" stroke-dasharray="0.5 5.5"/>' +
      '<circle cx="12.5" cy="37" r="5.2" fill="#D9CFFF"/><circle cx="12.5" cy="37" r="2.3" fill="#7457F0"/>' +
      '<path d="M36 4.5a7.5 7.5 0 017.5 7.5c0 5.4-7.5 12-7.5 12s-7.5-6.6-7.5-12A7.5 7.5 0 0136 4.5z" fill="url(#sti-rt)"/>' +
      '<circle cx="36" cy="12" r="2.8" fill="#fff"/>'),

    calendar: svg(g('sti-ca', '#FF7B8A', '#EC3D55'),
      '<rect x="7" y="10" width="34" height="31" rx="7.5" fill="#FFF0F2"/>' +
      '<path d="M7 17.5A7.5 7.5 0 0114.5 10h19a7.5 7.5 0 017.5 7.5V21H7z" fill="url(#sti-ca)"/>' +
      '<rect x="15" y="6" width="4" height="8.5" rx="2" fill="#C92A44"/><rect x="29" y="6" width="4" height="8.5" rx="2" fill="#C92A44"/>' +
      '<rect x="12.5" y="25" width="5" height="4.5" rx="1.5" fill="#F6A3AF"/><rect x="21.5" y="25" width="5" height="4.5" rx="1.5" fill="#F6A3AF"/><rect x="30.5" y="25" width="5" height="4.5" rx="1.5" fill="#EC3D55"/>' +
      '<rect x="12.5" y="32.5" width="5" height="4.5" rx="1.5" fill="#F6A3AF"/><rect x="21.5" y="32.5" width="5" height="4.5" rx="1.5" fill="#F6A3AF"/>'),

    bookings: svg(g('sti-bk', '#6FA6FF', '#3672F2'),
      '<rect x="7" y="12" width="5.5" height="28" rx="2.75" fill="#2E62D6"/>' +
      '<rect x="15" y="18" width="11" height="7.5" rx="3.75" fill="#D6E5FF"/>' +
      '<rect x="7" y="24" width="34" height="10" rx="4" fill="url(#sti-bk)"/>' +
      '<rect x="35.5" y="31" width="5.5" height="9" rx="2.75" fill="#2E62D6"/>'),

    guide: svg(g('sti-gd', '#B49BFF', '#7556F0'),
      '<path d="M24 6l18 9.5H6z" fill="url(#sti-gd)"/>' +
      '<rect x="7.5" y="15.5" width="33" height="3.5" rx="1.75" fill="#8D70F5"/>' +
      '<rect x="10" y="20.5" width="5" height="14" rx="2" fill="#CDBFFF"/><rect x="18.3" y="20.5" width="5" height="14" rx="2" fill="#CDBFFF"/>' +
      '<rect x="26.7" y="20.5" width="5" height="14" rx="2" fill="#CDBFFF"/><rect x="35" y="20.5" width="5" height="14" rx="2" fill="#CDBFFF"/>' +
      '<rect x="6" y="35" width="36" height="5.5" rx="2.5" fill="url(#sti-gd)"/>'),

    translator: svg(g('sti-tr', '#7CCBFF', '#2E9BEF'),
      '<rect x="17" y="7" width="25" height="22" rx="6.5" fill="url(#sti-tr)"/>' +
      '<text x="29.5" y="23.5" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" font-family="system-ui,sans-serif">文</text>' +
      '<rect x="6" y="19" width="25" height="22" rx="6.5" fill="#DDF1FF" stroke="#fff" stroke-width="2"/>' +
      '<text x="18.5" y="35.5" text-anchor="middle" font-size="14" font-weight="800" fill="#2E8BE0" font-family="system-ui,sans-serif">A</text>'),

    currency: svg(g('sti-cu', '#FFE07A', '#F3AE1C'),
      '<rect x="8" y="30" width="24" height="7" rx="3.5" fill="#DC9612"/><ellipse cx="20" cy="30" rx="12" ry="3.6" fill="url(#sti-cu)"/>' +
      '<rect x="8" y="23" width="24" height="7" rx="3.5" fill="#DC9612"/><ellipse cx="20" cy="23" rx="12" ry="3.6" fill="url(#sti-cu)"/>' +
      '<circle cx="32" cy="18" r="10" fill="url(#sti-cu)" stroke="#DC9612" stroke-width="2"/>' +
      '<circle cx="32" cy="18" r="6" fill="none" stroke="#FFF2C4" stroke-width="1.8"/>'),

    weather: svg(g('sti-su', '#FFD650', '#FFA41C') + g('sti-cl', '#E4F1FF', '#A9D1FF'),
      '<circle cx="18" cy="18" r="10" fill="url(#sti-su)"/>' +
      '<path d="M15 39.5h20.5a8.5 8.5 0 00.4-17 10.5 10.5 0 00-20 3.4A6.9 6.9 0 0015 39.5z" fill="url(#sti-cl)" stroke="#fff" stroke-width="1.5"/>'),

    checklist: svg(g('sti-ck', '#63D891', '#20B05B'),
      '<rect x="9.5" y="9" width="29" height="33" rx="6.5" fill="url(#sti-ck)"/>' +
      '<rect x="18" y="5.5" width="12" height="7" rx="3.5" fill="#178A46"/>' +
      '<rect x="14" y="15" width="20" height="23" rx="3.5" fill="#EAFBF0"/>' +
      '<path d="M18.5 27l4 4 8-9" fill="none" stroke="#20B05B" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'),

    transport: svg(g('sti-tp', '#62A0FF', '#2E69EE'),
      '<path d="M9 31v-5.5c0-1.6.8-2.8 2.2-3.4l3.1-8.2A4.5 4.5 0 0118.5 11h11a4.5 4.5 0 014.2 2.9l3.1 8.2c1.4.6 2.2 1.8 2.2 3.4V31a3 3 0 01-3 3H12a3 3 0 01-3-3z" fill="url(#sti-tp)"/>' +
      '<path d="M15.6 22l2.2-6.1c.2-.6.7-.9 1.3-.9h9.8c.6 0 1.1.3 1.3.9l2.2 6.1z" fill="#D8E8FF"/>' +
      '<circle cx="15" cy="34.5" r="4.3" fill="#1D3B78"/><circle cx="33" cy="34.5" r="4.3" fill="#1D3B78"/>' +
      '<circle cx="14.5" cy="27" r="2.1" fill="#FFE68A"/><circle cx="33.5" cy="27" r="2.1" fill="#FFE68A"/>'),

    nearby: svg(g('sti-nb', '#FF7A7A', '#E5383B'),
      '<ellipse cx="24" cy="41" rx="9" ry="2.8" fill="#FBC3C4"/>' +
      '<path d="M24 5a12.5 12.5 0 0112.5 12.5C36.5 27 24 39.5 24 39.5S11.5 27 11.5 17.5A12.5 12.5 0 0124 5z" fill="url(#sti-nb)"/>' +
      '<circle cx="24" cy="17.5" r="5" fill="#fff"/>'),

    stats: svg(g('sti-st', '#B09AFF', '#7556F0'),
      '<rect x="8.5" y="25" width="8.5" height="15" rx="3" fill="#D3C7FF"/>' +
      '<rect x="20" y="16" width="8.5" height="24" rx="3" fill="url(#sti-st)"/>' +
      '<rect x="31.5" y="8" width="8.5" height="32" rx="3" fill="#6545E8"/>'),

    emergency: svg(g('sti-em', '#FF7474', '#E1353A'),
      '<path d="M18 14v-2.5A2.5 2.5 0 0120.5 9h7a2.5 2.5 0 012.5 2.5V14" fill="none" stroke="#B9262B" stroke-width="3"/>' +
      '<rect x="6.5" y="14" width="35" height="26" rx="7.5" fill="url(#sti-em)"/>' +
      '<rect x="21" y="19.5" width="6" height="15" rx="1.8" fill="#fff"/><rect x="16.5" y="24" width="15" height="6" rx="1.8" fill="#fff"/>'),

    offline: svg(g('sti-of', '#63D891', '#20B05B'),
      '<circle cx="24" cy="24" r="17.5" fill="url(#sti-of)"/>' +
      '<path d="M24 14v13.5M18.3 22.3L24 28l5.7-5.7M17 33.5h14" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'),

    diary: svg(g('sti-dl', '#D6CCFF', '#A88EFB') + g('sti-dr', '#A88EFB', '#7152EE'),
      '<path d="M24 13.5c-4.2-3.2-9.6-4.2-16-3.2v26c6.4-1 11.8 0 16 3.2z" fill="url(#sti-dl)"/>' +
      '<path d="M24 13.5c4.2-3.2 9.6-4.2 16-3.2v26c-6.4-1-11.8 0-16 3.2z" fill="url(#sti-dr)"/>' +
      '<path d="M12 18.5c3-.3 5.7.2 8 1.4M12 24c3-.3 5.7.2 8 1.4M12 29.5c3-.3 5.7.2 8 1.4" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".8"/>'),

    assistant: svg(g('sti-ai', '#B7A2FF', '#6A48EE'),
      '<path d="M21 9c1.3 7 4.6 10.3 11.5 11.5C25.6 21.8 22.3 25 21 32c-1.3-7-4.6-10.2-11.5-11.5C16.4 19.3 19.7 16 21 9z" fill="url(#sti-ai)"/>' +
      '<path d="M36.5 5c.6 3.4 2.2 5 5.6 5.6-3.4.6-5 2.2-5.6 5.6-.6-3.4-2.2-5-5.6-5.6 3.4-.6 5-2.2 5.6-5.6z" fill="#CBBDFF"/>' +
      '<path d="M35 30c.5 2.6 1.7 3.8 4.3 4.3-2.6.5-3.8 1.7-4.3 4.3-.5-2.6-1.7-3.8-4.3-4.3 2.6-.5 3.8-1.7 4.3-4.3z" fill="#8D70F5"/>')
  };

  window.ST_ICONS = ICONS;
})();
