// ============================================================
// Модуль «Бронирования» (id: 'bookings')
// Ответственный: Рафаэль
// ------------------------------------------------------------
// Страницы:
//   1. Бронирования — фильтр по категориям, карточка поездки,
//      брони по датам, итоговая сумма.
//   2. Бронь — фото, маршрут или даты, номер брони, гости, цена,
//      документы (PDF и фото: посадочные, подтверждения, билеты).
//   3. Новая бронь / изменить: загрузка подтверждения (PDF/фото) — поля
//      заполняются сами, пользователь проверяет; аэропорт по городу.
//      Распознавание и аэропорты — в bookings-tools.js (грузится по требованию).
// Данные: брони — ctx.store (на этом устройстве, для каждой поездки),
// файлы документов — IndexedDB (большие файлы не влезают в localStorage).
// Картинки по умолчанию: /img/bookings/*.jpg (сгенерированы, без логотипов).
// ============================================================
(function () {
  'use strict';
  if (!window.STHub) return;

  // ---------- Помощники ----------
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const today = () => iso(new Date());
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const dayName = s => parse(s).getDate() + ' ' + MONTHS[parse(s).getMonth()];
  const wd = s => WD[parse(s).getDay()];
  function rangeLabel(a, b) {
    const A = parse(a), B = parse(b);
    if (a === b) return dayName(a);
    if (A.getMonth() === B.getMonth()) return A.getDate() + ' – ' + B.getDate() + ' ' + MONTHS[B.getMonth()];
    return A.getDate() + ' ' + MONTHS[A.getMonth()] + ' – ' + B.getDate() + ' ' + MONTHS[B.getMonth()];
  }
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  const money = (n, cur) => { try { return new Intl.NumberFormat(window.STModuleUI?.locale() || 'ru-RU', { style: 'currency', currency: cur || 'EUR' }).format(n); } catch (_) { return (+n).toFixed(2) + ' ' + cur; } };
  const initials = s => String(s || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const hueOf = s => { let h = 7; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const fileSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(b / 1024)) + ' КБ';

  // ---------- Категории, статусы, подписи ----------
  const IMG = '/img/bookings/';
  const CATS = [
    { id: 'all', name: 'Все', icon: 'layers' },
    { id: 'flight', name: 'Перелёты', one: 'Перелёт', icon: 'plane', color: '#6C4CF0', bg: '#EEEBFF', hero: 'hero-flight.jpg' },
    { id: 'stay', name: 'Проживание', one: 'Проживание', icon: 'bed-double', color: '#6C4CF0', bg: '#EEEBFF', hero: 'hero-stay.jpg', thumb: 'stay.jpg' },
    { id: 'transport', name: 'Транспорт', one: 'Транспорт', icon: 'car', color: '#1FA55A', bg: '#DFF5E6', hero: 'hero-transport.jpg' },
    { id: 'ticket', name: 'Билеты', one: 'Билеты', icon: 'ticket', color: '#6C4CF0', bg: '#EEEBFF', hero: 'hero-ticket.jpg', thumb: 'castle.jpg' }
  ];
  const cat = id => CATS.find(c => c.id === id) || CATS[1];
  const STATUS = {
    confirmed: { name: 'Подтверждено', full: 'Подтверждено', cls: 'ok', icon: 'check' },
    pending: { name: 'Ожидает', full: 'Ожидает подтверждения', cls: 'wait', icon: 'clock' },
    cancelled: { name: 'Отменено', full: 'Отменено', cls: 'no', icon: 'x' }
  };
  const LBL = { flight: ['Вылет', 'Прилёт'], stay: ['Заезд', 'Выезд'], transport: ['Получение', 'Возврат'], ticket: ['Начало', 'Окончание'] };
  const PEOPLE = { flight: 'Пассажиры', stay: 'Гости', transport: 'Водители', ticket: 'Гости' };
  const DOC_KINDS = [
    { id: 'boarding', name: 'Посадочные талоны', icon: 'ticket' },
    { id: 'confirm', name: 'Подтверждение брони', icon: 'file-text' },
    { id: 'ticket', name: 'Билеты', icon: 'ticket' },
    { id: 'voucher', name: 'Ваучер', icon: 'receipt' },
    { id: 'other', name: 'Другое', icon: 'paperclip' }
  ];
  const docKind = id => DOC_KINDS.find(k => k.id === id) || DOC_KINDS[DOC_KINDS.length - 1];
  // Документ = один файл со своим названием. Старые группы («Посадочные талоны» с несколькими файлами) делим на отдельные документы.
  function normDocs(b) {
    b.docs = (b.docs || []).flatMap(d => {
      const files = d.files || [], base = d.title || docKind(d.kind).name;
      if (files.length <= 1) return files.length ? [Object.assign(d, { title: base })] : [];
      return files.map((f, i) => ({ id: i ? uid() : d.id, kind: d.kind, title: base + ' ' + (i + 1), files: [f] }));
    });
    return b.docs;
  }
  const docSuggest = (catId, kind) => kind === 'boarding' ? 'Посадочный талон'
    : ({ flight: 'Электронный билет', stay: 'Подтверждение брони', transport: 'Подтверждение брони', ticket: 'Билет' })[catId] || 'Документ';
  const nameFromFile = n => String(n || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  const isPdf = f => f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
  const isImg = f => f && /^image\//.test(f.type || '');
  let pdfP = null;
  const pdfLib = () => window.pdfjsLib ? Promise.resolve(window.pdfjsLib) : (pdfP || (pdfP = new Promise((ok, no) => {
    const sc = document.createElement('script'); sc.src = '/vendor/pdfjs/pdf.min.js';
    sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js'; ok(window.pdfjsLib); };
    sc.onerror = () => { pdfP = null; no(new Error('pdf')); };
    document.head.appendChild(sc);
  })));
  const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'PLN', 'CZK', 'TRY', 'RUB'];

  // ---------- Файлы документов: IndexedDB ----------
  const DB = (() => {
    let p = null;
    const open = () => p || (p = new Promise((res, rej) => {
      const r = indexedDB.open('st_bookings_docs', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(r.result);
      r.onerror = () => { p = null; rej(r.error); };
    }));
    const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
      const t = db.transaction('files', mode); const req = fn(t.objectStore('files'));
      t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }));
    return {
      put: (id, blob) => run('readwrite', s => s.put(blob, id)),
      get: id => run('readonly', s => s.get(id)),
      del: id => run('readwrite', s => s.delete(id))
    };
  })();

  // Уменьшить фото обложки, чтобы не переполнить память
  function compress(file, max) {
    return new Promise((resolve, reject) => {
      const r = new FileReader(); r.onerror = reject;
      r.onload = () => {
        const img = new Image(); img.onerror = reject;
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.72));
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  // Нижнее окно (как в календаре): внутри экрана модуля, чтобы работали стили
  function sheet(title, html, bind) {
    document.getElementById('bk-sheet')?.remove();
    const ov = document.createElement('div');
    ov.className = 'ov open'; ov.id = 'bk-sheet';
    ov.innerHTML = `<div class="mdl"><div class="mdl-handle"></div><div class="mdl-title">${esc(title)}</div>${html}</div>`;
    const close = () => { ov.remove(); document.body.style.overflow = ''; };
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    (document.getElementById('pg-module') || document.body).appendChild(ov);
    document.body.style.overflow = 'hidden';
    if (typeof initializeIcons === 'function') initializeIcons(ov);
    bind(ov.firstChild, close);
  }

  // ---------- Стили (только внутри модуля) ----------
  STHub.addStyles('bookings', `
    [data-module="bookings"]{--bk-grad:linear-gradient(150deg,#8F7BFF 0%,#6A4DF4 55%,#5B3FE6 100%);--bk-ac:#6A4DF4;--bk-soft:#EFECFF;--bk-line:rgba(110,100,170,.12)}
    [data-theme=dark] [data-module="bookings"]{--bk-ac:#9C8BFF;--bk-soft:rgba(140,120,255,.16);--bk-line:rgba(255,255,255,.08)}
    [data-module="bookings"] .mod-body{display:flex;flex-direction:column;gap:12px}
    .bk-card{background:var(--hub-card);border:1px solid var(--hub-card-b);border-radius:22px;box-shadow:var(--hub-shadow)}
    button.bk-card{width:100%;font:inherit;color:var(--text);text-align:left;cursor:pointer}
    #mod-action.bk-plus{background:var(--bk-grad);color:#fff;border:0;border-radius:14px;width:46px;height:42px;box-shadow:0 8px 18px rgba(106,77,244,.35)}
    #mod-action.bk-plus svg{width:24px;height:24px;stroke-width:2.4}
    .hub-icbtn.bk-plain{background:transparent;border:0;box-shadow:none;width:38px}
    .hub-icbtn.bk-plain svg{width:22px;height:22px}
    #mod-action.bk-save{background:var(--bk-grad);color:#fff;border:0;box-shadow:0 8px 18px rgba(106,77,244,.35)}
    /* категории */
    .bk-cats{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:2px 16px 8px}
    .bk-cats::-webkit-scrollbar{display:none}
    .bk-cat{flex:1 0 76px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:86px;padding:10px 2px;border-radius:18px;border:1px solid var(--hub-card-b);background:var(--hub-card);box-shadow:var(--hub-shadow);color:var(--text);font-family:inherit;font-size:.72rem;font-weight:600;cursor:pointer}
    .bk-cat svg{width:25px;height:25px;color:var(--bk-ac);stroke-width:2.2}
    .bk-cat span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 2px}
    .bk-cat.on{background:var(--bk-grad);color:#fff;border-color:transparent;box-shadow:0 10px 22px rgba(106,77,244,.35)}
    .bk-cat.on svg{color:#fff}
    /* поездка */
    .bk-trip{display:flex;align-items:center;gap:14px;padding:10px 16px 10px 10px}
    .bk-trip img{width:118px;height:80px;border-radius:14px;object-fit:cover;flex-shrink:0}
    .bk-trip-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
    .bk-trip-txt b{font-size:1.12rem;font-weight:800}
    .bk-meta{display:flex;align-items:center;gap:8px;color:var(--t2);font-size:.86rem}
    .bk-meta svg{width:16px;height:16px;flex-shrink:0}
    .bk-chev{width:22px;height:22px;color:var(--text);flex-shrink:0}
    /* группы и строки */
    .bk-day{font-size:1.08rem;font-weight:800;margin:8px 2px -2px}
    .bk-day span{font-weight:500;color:var(--t2)}
    .bk-item{display:flex;align-items:center;gap:14px;padding:12px 14px 12px 12px;min-height:84px}
    .bk-ic{width:58px;height:58px;border-radius:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .bk-ic svg{width:28px;height:28px;stroke-width:2.2}
    .bk-thumb{width:100px;height:72px;border-radius:14px;object-fit:cover;flex-shrink:0}
    .bk-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
    .bk-row1{display:flex;align-items:flex-start;gap:4px 8px;flex-wrap:wrap}
    .bk-ttl{flex:1 1 118px;min-width:0;font-weight:800;font-size:1rem;line-height:1.25;overflow-wrap:break-word}
    .bk-sub{color:var(--t2);font-size:.84rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .bk-go{width:20px;height:20px;color:var(--text);flex-shrink:0}
    .bk-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:10px;font-size:.7rem;font-weight:700;white-space:nowrap;flex-shrink:0}
    .bk-pill svg{width:13px;height:13px;stroke-width:3}
    .bk-pill.ok{background:#DDF5E4;color:#17853D}.bk-pill.info{background:#E3EBFF;color:#2F5FD8}
    .bk-pill.wait{background:#FFF0D4;color:#B86E00}.bk-pill.no{background:#FDE3E4;color:#C9343A}
    [data-theme=dark] .bk-pill.ok{background:rgba(52,199,89,.18);color:#5BD982}[data-theme=dark] .bk-pill.info{background:rgba(70,120,255,.2);color:#8EAEFF}
    [data-theme=dark] .bk-pill.wait{background:rgba(255,170,40,.18);color:#FFC266}[data-theme=dark] .bk-pill.no{background:rgba(255,80,80,.18);color:#FF8A8E}
    .bk-item.cancelled .bk-ttl{text-decoration:line-through;color:var(--t2)}
    .bk-sum{display:flex;align-items:center;gap:14px;padding:16px 18px 16px 16px;margin-top:14px}
    .bk-sum .bk-ic{background:var(--bk-soft);color:var(--bk-ac)}
    .bk-sum-l{flex:1;min-width:0}.bk-sum-l b{display:block;font-size:1.05rem;font-weight:800}.bk-sum-l span{color:var(--t2);font-size:.95rem}
    .bk-sum-r{text-align:right}.bk-sum-r span{color:var(--t2);font-size:.95rem}.bk-sum-r b{display:block;font-size:1.5rem;font-weight:800;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
    .bk-sum-r small{display:block;color:var(--t2);font-size:.78rem;font-weight:600}
    .bk-empty{padding:30px 20px;text-align:center;color:var(--t2);display:flex;flex-direction:column;align-items:center;gap:12px}
    .bk-empty .bk-ic{background:var(--bk-soft);color:var(--bk-ac)}
    /* страница брони */
    .bk-hero{position:relative;border-radius:22px;overflow:hidden;aspect-ratio:3.15/1;box-shadow:var(--hub-shadow);background:#C9C2F0}
    .bk-hero img{width:100%;height:100%;object-fit:cover;display:block}
    .bk-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(to top right,rgba(40,20,90,.55),rgba(40,20,90,0) 60%)}
    .bk-hero-l{position:absolute;left:18px;bottom:14px;z-index:1;display:flex;align-items:center;gap:12px;color:#fff;font-size:1.4rem;font-weight:800;text-shadow:0 2px 8px rgba(0,0,0,.25)}
    .bk-hero-l svg{width:30px;height:30px;stroke-width:2.2}
    .bk-hero-l.fl svg{fill:#fff}
    .bk-head{padding:16px}
    .bk-head-top{display:flex;align-items:flex-start;gap:8px 14px;flex-wrap:wrap}
    .bk-head-top .bk-pill{margin-left:auto}
    .bk-logo{width:76px;height:64px;border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff;font-weight:800;font-size:1.15rem;letter-spacing:.02em;overflow:hidden}
    .bk-logo svg{width:30px;height:30px;stroke-width:2.2}
    .bk-head-txt{flex:1 1 150px;min-width:0;padding-top:4px}
    .bk-head-txt b{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:1.28rem;font-weight:800;line-height:1.2;overflow-wrap:break-word}
    .bk-head-txt b svg{width:20px;height:20px;color:var(--t2)}
    .bk-head-txt span{display:block;color:var(--t2);margin-top:5px}
    .bk-route{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;margin-top:22px;padding:0 8px 4px}
    .bk-pt{text-align:center;min-width:0}
    .bk-pt b{display:block;font-size:1.55rem;font-weight:800;line-height:1.1}
    .bk-pt small{display:block;color:var(--t2);font-size:.9rem;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .bk-pt .bk-time.d{font-size:1.3rem;white-space:nowrap}
    .bk-pt .bk-time{font-size:1.65rem;font-weight:800;margin-top:12px;font-variant-numeric:tabular-nums}
    .bk-pt .bk-date{color:var(--t2);font-size:1rem;margin-top:4px}
    .bk-pt .bk-lbl{font-size:.8rem;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.04em}
    .bk-mid{display:flex;flex-direction:column;align-items:center;gap:8px;width:120px;position:relative}
    .bk-mid::before{content:"";position:absolute;top:22px;left:-8px;right:-8px;height:2px;background:var(--bk-line);z-index:0}
    .bk-mid i,.bk-mid>svg{position:relative;z-index:1;width:44px;height:44px;border-radius:50%;background:var(--bk-soft);color:var(--text);padding:11px;box-sizing:border-box}
    .bk-mid.fl i,.bk-mid.fl>svg{fill:currentColor}
    .bk-mid span{font-size:.82rem;font-weight:700;white-space:nowrap}
    .bk-rows{padding:4px 16px}
    .bk-r{display:flex;align-items:center;gap:14px;min-height:54px;border-bottom:1px solid var(--bk-line);width:100%;background:none;border-left:0;border-right:0;border-top:0;font:inherit;color:var(--text);text-align:left;cursor:pointer;padding:0}
    .bk-r:last-child{border-bottom:0}
    .bk-r>svg:first-child{width:24px;height:24px;color:var(--bk-ac);flex-shrink:0}
    .bk-r-l{font-weight:600;font-size:.94rem}
    .bk-r-v{flex:1;min-width:0;text-align:right;font-size:.94rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .bk-r-v.big{font-weight:800}
    .bk-r .bk-r-go{width:20px;height:20px;color:var(--text);flex-shrink:0}
    .bk-r .bk-copy{width:24px;height:24px;color:var(--bk-ac);flex-shrink:0}
    .bk-quick{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    button.bk-card.bk-q{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:12px 4px;font-size:.76rem;font-weight:700;line-height:1.15;text-align:center;border-radius:18px}
    .bk-q span:first-child{width:42px;height:42px;border-radius:13px;background:var(--bk-soft);color:var(--bk-ac);display:flex;align-items:center;justify-content:center}
    .bk-q svg{width:21px;height:21px}
    .bk-h3{font-size:1.3rem;font-weight:800;margin:12px 4px 0}
    .bk-doc{padding:0;overflow:hidden}
    .bk-doc-row{display:flex;align-items:center;gap:14px;padding:12px 8px 12px 14px;cursor:pointer;-webkit-tap-highlight-color:transparent}
    .bk-doc.open .bk-doc-row{border-bottom:1px solid var(--bk-line)}
    .bk-doc-view{padding:10px;display:flex;flex-direction:column;gap:10px;background:var(--bk-soft)}
    .bk-doc-view[hidden]{display:none}
    .bk-doc-view img,.bk-doc-view canvas{width:100%;height:auto;border-radius:12px;display:block;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.08)}
    .bk-doc-view .st-muted{text-align:center;padding:14px 8px;font-size:.86rem}
    .bk-doc-ic{width:62px;height:54px;border-radius:14px;background:var(--bk-soft);color:var(--bk-ac);display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .bk-doc-ic svg{width:28px;height:28px;stroke-width:2}
    .bk-doc .bk-txt b{font-weight:800}
    .bk-dl{width:40px;height:40px;border:0;background:none;color:var(--bk-ac);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;padding:0}
    .bk-dl svg{width:24px;height:24px}
    .bk-adddoc{border:1.5px dashed var(--bk-ac);background:transparent;color:var(--bk-ac);border-radius:18px;padding:14px;font:inherit;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}
    .bk-adddoc svg{width:20px;height:20px}
    .bk-files{display:flex;flex-direction:column;gap:8px;margin:10px 0}
    .bk-file{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:var(--hub-soft)}
    .bk-file span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.9rem}
    .bk-file small{color:var(--t2);font-size:.76rem}
    .bk-file button{border:0;background:none;color:var(--bk-ac);cursor:pointer;padding:4px;display:flex}
    .bk-file button svg{width:20px;height:20px}
    /* форма */
    .bk-form{display:flex;flex-direction:column;gap:8px}
    .bk-form>label,.bk-2 label{font-size:.78rem;font-weight:700;color:var(--t2);margin-top:4px}
    .bk-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
    .bk-2>div{min-width:0;display:flex;flex-direction:column;gap:6px}
    .bk-2.k{grid-template-columns:96px minmax(0,1fr)}
    .bk-f{display:flex;align-items:center;gap:10px;padding:0 12px;min-height:52px;border-radius:16px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow)}
    .bk-f>svg{width:20px;height:20px;color:var(--bk-ac);flex-shrink:0}
    .bk-f input,.bk-f select,.bk-f textarea{flex:1;min-width:0;width:100%;border:0;background:transparent;color:var(--text);font:inherit;font-size:16px;outline:none;min-height:50px}
    .bk-f textarea{min-height:70px;padding:14px 0;resize:vertical}
    .bk-f input[type=date],.bk-f input[type=time]{font-size:15px}
    .bk-f input.up{text-transform:uppercase;font-weight:700;letter-spacing:.04em}
    .bk-cover{display:flex;align-items:center;gap:14px;padding:10px 12px;font:inherit;color:var(--text);text-align:left;cursor:pointer}
    .bk-cover img{width:84px;height:56px;border-radius:12px;object-fit:cover;flex-shrink:0}
    .bk-cover span{flex:1;font-weight:700;font-size:.92rem}
    .bk-cover small{display:block;color:var(--t2);font-weight:500}
    .bk-del{color:#E5484D;border:0;background:none;font:inherit;font-weight:700;padding:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}
    .bk-del svg{width:18px;height:18px}
    /* аэропорты, загрузка брони, проверка */
    .bk-code{width:100%;justify-content:center;cursor:pointer;font:inherit;color:var(--text);gap:8px}
    .bk-code b{font-size:1.05rem;font-weight:800;letter-spacing:.04em}
    .bk-hint{font-size:.78rem;font-weight:600;color:var(--t2);margin:-2px 4px 2px;min-height:0}
    .bk-hint:empty{display:none}
    .bk-hint.ok{color:#1E9E4A}.bk-hint.err{color:#D93D42}.bk-hint.wait{color:var(--bk-ac)}
    [data-theme=dark] .bk-hint.ok{color:#5BD982}[data-theme=dark] .bk-hint.err{color:#FF8A8E}
    .bk-f.auto{border-color:var(--bk-ac);box-shadow:0 0 0 1px var(--bk-ac) inset,var(--hub-shadow)}
    .bk-upload{display:flex;align-items:center;gap:14px;padding:14px;border:1.5px dashed var(--bk-ac)}
    .bk-upload .bk-ic,.bk-review .bk-ic{width:50px;height:50px;background:var(--bk-grad);color:#fff;border-radius:15px}
    .bk-upload .bk-ic svg,.bk-review .bk-ic svg{width:24px;height:24px}
    .bk-upload b{font-weight:800}
    .bk-review{display:flex;gap:14px;padding:14px;background:var(--bk-soft);border-color:transparent}
    .bk-review b{display:block;font-weight:800;margin-bottom:3px}
    .bk-review span{font-size:.84rem;color:var(--t2);line-height:1.4}
    .bk-prog{height:8px;border-radius:8px;background:var(--hub-soft);overflow:hidden}
    .bk-prog i{display:block;height:100%;width:6%;background:var(--bk-grad);border-radius:8px;transition:width .3s}
    .bk-apopt{display:flex;align-items:center;gap:14px;padding:12px 14px}
    .bk-apopt>b{min-width:52px;height:44px;border-radius:12px;background:var(--bk-soft);color:var(--bk-ac);display:flex;align-items:center;justify-content:center;font-weight:800;letter-spacing:.03em;padding:0 6px}
    .bk-apopt>span{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;font-weight:700;font-size:.92rem}
    .bk-apopt small{color:var(--t2);font-weight:500;font-size:.8rem}
    .bk-conf b{display:block;font-size:.82rem;color:var(--t2);margin:2px 0 6px}
    .bk-conf-opts{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .bk-conf-opts button{border:1.5px solid var(--hub-card-b);background:var(--hub-card);color:var(--text);border-radius:14px;padding:10px;font:inherit;font-weight:700;font-size:.88rem;text-align:left;cursor:pointer;overflow-wrap:anywhere}
    .bk-conf-opts button small{display:block;font-weight:600;font-size:.72rem;color:var(--t2);margin-bottom:3px}
    .bk-conf-opts button.on{border-color:var(--bk-ac);background:var(--bk-soft);box-shadow:0 0 0 1px var(--bk-ac) inset}
    @media (max-width:380px){.bk-thumb{width:92px;height:68px}.bk-trip img{width:96px;height:70px}.bk-cat{font-size:.68rem}}
  `);

  STHub.registerService('bookings', ctx => {
    const store = ctx.store;
    let items = store.get('items', []);
    const save = () => store.set('items', items);
    let filter = 'all';
    const tripCur = (ctx.trip && ctx.trip.currency) || 'EUR';

    const endOf = b => b.endDate || b.date;
    const sortKey = b => (b.date || '9999') + ' ' + (b.time || '00:00');
    const titleOf = b => b.cat === 'flight' && b.from && b.to && !b.title ? 'Рейс ' + b.from + ' → ' + b.to : (b.title || (b.cat === 'flight' ? 'Перелёт' : 'Бронь'));
    const pill = b => { const s = STATUS[b.status] || STATUS.confirmed; // старое 'booked' = подтверждено
      return `<span class="bk-pill ${s.cls}"><i data-lucide="${s.icon}"></i>${s.name}</span>`; };
    const thumbOf = b => b.photo || (cat(b.cat).thumb ? IMG + cat(b.cat).thumb : '');

    // Даты поездки: из «Календаря», если указаны, иначе по броням
    function tripDates() {
      try {
        const d = ctx.trip && JSON.parse(localStorage.getItem('st_mod_calendar_' + ctx.trip.id + '_dates'));
        if (d && d.start) return d;
      } catch (_) {}
      const ds = items.filter(b => b.date).map(b => [b.date, endOf(b)]).flat().sort();
      return ds.length ? { start: ds[0], end: ds[ds.length - 1] } : null;
    }
    function tripCard() {
      const t = ctx.trip || {}, d = tripDates(), n = ctx.members.length;
      const yr = d ? ' ' + parse(d.end).getFullYear() : '';
      return `<button class="bk-card bk-trip" type="button" data-a="trip">
        <img src="/img/trips/abstract.jpg" alt="">
        <div class="bk-trip-txt"><b>${esc(t.name || 'Поездка')}</b>
          <div class="bk-meta"><i data-lucide="calendar"></i>${d ? esc(rangeLabel(d.start, d.end) + yr) : 'Даты не указаны'}</div>
          <div class="bk-meta"><i data-lucide="users"></i>${n} ${plural(n, 'участник', 'участника', 'участников')}</div>
        </div><i data-lucide="chevron-down" class="bk-chev"></i></button>`;
    }

    function subOf(b) {
      const range = b.date ? rangeLabel(b.date, endOf(b)) : '';
      if (b.cat === 'flight') return [b.time && (b.time + (b.endTime ? ' – ' + b.endTime : '')), b.provider, b.number].filter(Boolean).join(' · ') || range;
      if (b.cat === 'transport') return [range, b.provider].filter(Boolean).join(' · ');
      if (b.cat === 'stay') return b.place || range;
      return b.people || b.place || range;
    }
    function itemRow(b) {
      const c = cat(b.cat), th = thumbOf(b);
      const pic = th ? `<img class="bk-thumb" src="${esc(th)}" alt="">` : `<span class="bk-ic" style="background:${c.bg};color:${c.color}"><i data-lucide="${c.icon}"></i></span>`;
      return `<button class="bk-card bk-item${b.status === 'cancelled' ? ' cancelled' : ''}" type="button" data-id="${b.id}">${pic}
        <span class="bk-txt"><span class="bk-row1"><span class="bk-ttl">${esc(titleOf(b))}</span>${pill(b)}</span>
        <span class="bk-sub">${esc(subOf(b))}</span></span><i data-lucide="chevron-right" class="bk-go"></i></button>`;
    }
    function totals(list) {
      const by = {};
      list.filter(b => b.status !== 'cancelled' && +b.price > 0).forEach(b => { const c = b.currency || tripCur; by[c] = (by[c] || 0) + (+b.price); });
      const main = by[tripCur] != null ? tripCur : Object.keys(by)[0] || tripCur;
      return { main: money(by[main] || 0, main), rest: Object.keys(by).filter(c => c !== main).map(c => '+ ' + money(by[c], c)) };
    }

    // ===== Страница 1: список =====
    // Открыть конкретную бронь (например, из Календаря)
    let openFirst = null;
    try { openFirst = sessionStorage.getItem('st_bk_open'); sessionStorage.removeItem('st_bk_open'); } catch (_) {}
    function openList() {
      ctx.openScreen({
        title: 'Бронирования',
        action: { icon: 'plus', label: 'Добавить бронь', cls: 'bk-plus', onClick: () => openForm(null, openList) },
        render(body, screen) {
          const list = items.filter(b => filter === 'all' || b.cat === filter).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
          // группы: жильё — по периоду, остальное — по дню начала
          const groups = [];
          list.forEach(b => {
            const range = b.cat === 'stay' && b.date && endOf(b) !== b.date;
            const key = !b.date ? 'none' : range ? 'r' + b.date + endOf(b) : 'd' + b.date;
            let g = groups.find(x => x.key === key);
            if (!g) groups.push(g = { key, sort: (b.date || '9999') + (range ? '1' : '0'), head: !b.date ? 'Без даты' : range ? esc(rangeLabel(b.date, endOf(b))) : `${esc(dayName(b.date))} <span>· ${wd(b.date)}</span>`, list: [] });
            g.list.push(b);
          });
          groups.sort((a, b) => a.sort.localeCompare(b.sort));
          const sum = totals(list);
          const fname = filter === 'all' ? 'Все бронирования' : cat(filter).name;
          body.innerHTML = `
            <div class="bk-cats">${CATS.map(c => `<button class="bk-cat${c.id === filter ? ' on' : ''}" type="button" data-f="${c.id}"><i data-lucide="${c.icon}"></i><span>${c.name}</span></button>`).join('')}</div>
            ${tripCard()}
            ${groups.length ? groups.map(g => `<div class="bk-day">${g.head}</div>${g.list.map(itemRow).join('')}`).join('') : `
              <div class="bk-card bk-empty"><span class="bk-ic"><i data-lucide="${filter === 'all' ? 'layers' : cat(filter).icon}"></i></span>
                <div>${filter === 'all' ? 'Пока нет бронирований.<br>Добавьте билеты, жильё, машину или экскурсии — всё будет в одном месте.' : 'В этой категории пока пусто.'}</div>
                <button class="st-btn" type="button" data-a="add"><i data-lucide="plus"></i>Добавить бронь</button></div>`}
            <div class="bk-card bk-sum"><span class="bk-ic"><i data-lucide="${filter === 'all' ? 'layers' : cat(filter).icon}"></i></span>
              <div class="bk-sum-l"><b>${esc(fname)}</b><span>${list.length} ${plural(list.length, 'запись', 'записи', 'записей')}</span></div>
              <div class="bk-sum-r"><span>Итого</span><b>${esc(sum.main)}</b>${sum.rest.map(r => `<small>${esc(r)}</small>`).join('')}</div></div>
          `;
          body.querySelectorAll('[data-f]').forEach(x => x.addEventListener('click', () => { filter = x.dataset.f; screen.refresh(); }));
          body.querySelector('[data-a="trip"]').addEventListener('click', () => STHub.show('trips'));
          if (window.STPlacePhoto) STPlacePhoto.tripImg(body.querySelector('.bk-trip img'), ctx.trip, { width: 400 }); // фото места поездки
          body.querySelector('[data-a="add"]')?.addEventListener('click', () => openForm(null, openList));
          body.querySelectorAll('[data-id]').forEach(x => x.addEventListener('click', () => openItem(x.dataset.id)));
        }
      });
    }

    // ===== Страница 2: бронь =====
    const dt = (d, t) => parse(d).getTime() + (t ? (+t.slice(0, 2) * 60 + +t.slice(3, 5)) * 60000 : 0);
    function duration(b) {
      const e = endOf(b);
      if (b.cat === 'flight' || (b.cat === 'ticket' && e === b.date)) {
        if (!b.time || !b.endTime) return '';
        const m = Math.round((dt(e, b.endTime) - dt(b.date, b.time)) / 60000);
        if (m <= 0) return '';
        return (m >= 60 ? Math.floor(m / 60) + ' ч ' : '') + (m % 60 ? (m % 60) + ' мин' : '').trim();
      }
      const n = diffDays(b.date, e);
      if (n <= 0) return '';
      return b.cat === 'stay' ? n + ' ' + plural(n, 'ночь', 'ночи', 'ночей') : (n + 1) + ' ' + plural(n + 1, 'день', 'дня', 'дней');
    }
    const dateLong = s => wd(s) + ', ' + dayName(s);

    function routeBlock(b) {
      const c = cat(b.cat), dur = duration(b), [l1, l2] = LBL[b.cat] || LBL.ticket;
      const mid = `<div class="bk-mid${b.cat === 'flight' ? ' fl' : ''}"><i data-lucide="${b.cat === 'flight' ? 'plane' : c.icon}"></i><span>${esc(dur)}</span></div>`;
      if (b.cat === 'flight') {
        const pt = (code, city, time, date) => `<div class="bk-pt"><b>${esc(code || '—')}</b><small>${esc(city || '')}</small>
          <div class="bk-time">${esc(time || '—:—')}</div><div class="bk-date">${date ? esc(dateLong(date)) : ''}</div></div>`;
        return `<div class="bk-route">${pt(b.from, b.fromCity, b.time, b.date)}${mid}${pt(b.to, b.toCity, b.endTime, endOf(b))}</div>`;
      }
      if (!b.date) return '';
      const pt = (lbl, date, time) => `<div class="bk-pt"><small class="bk-lbl">${lbl}</small>
        <div class="bk-time d">${esc(dayName(date))}</div><div class="bk-date">${esc(wd(date))}${time ? ', ' + esc(time) : ''}</div></div>`;
      const end = endOf(b) !== b.date || b.endTime;
      return `<div class="bk-route">${pt(l1, b.date, b.time)}${end ? mid + pt(l2, endOf(b), b.endTime) : '<div></div><div></div>'}</div>`;
    }

    function docsSub(d) {
      const f = d.files[0] || {};
      return (isPdf(f) ? 'PDF' : isImg(f) ? 'Фото' : 'Файл') + (f.size ? ' · ' + fileSize(f.size) : '');
    }
    const docIcon = d => { const f = d.files[0]; return isPdf(f) ? 'file-text' : isImg(f) ? 'image' : 'paperclip'; };

    // Нажатие на документ — открыть просмотр под ним, повторное — закрыть
    async function toggleDoc(card, d) {
      const view = card.querySelector('.bk-doc-view');
      if (card.classList.contains('open')) {
        card.classList.remove('open'); view.hidden = true; view.innerHTML = '';
        if (card._url) { URL.revokeObjectURL(card._url); card._url = null; }
        return;
      }
      card.classList.add('open'); view.hidden = false;
      const token = card._t = (card._t || 0) + 1;
      view.innerHTML = '<div class="st-muted">Открываю…</div>';
      const f = d.files[0];
      let blob;
      try { blob = await getFile(f); } catch (_) { view.innerHTML = '<div class="st-muted">Файл не найден на этом устройстве</div>'; return; }
      if (card._t !== token || !card.classList.contains('open')) return;
      if (isImg(f) || /^image\//.test(blob.type || '')) {
        card._url = URL.createObjectURL(blob);
        view.innerHTML = `<img src="${card._url}" alt="${esc(d.title)}">`;
      } else if (isPdf(f)) {
        try {
          const lib = await pdfLib();
          const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
          if (card._t !== token || !card.classList.contains('open')) return;
          view.innerHTML = '';
          const w = Math.max(240, view.clientWidth - 20), dpr = Math.min(2, window.devicePixelRatio || 1), n = Math.min(doc.numPages, 10);
          for (let i = 1; i <= n; i++) {
            const page = await doc.getPage(i);
            const vp = page.getViewport({ scale: w / page.getViewport({ scale: 1 }).width * dpr });
            const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
            await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
            if (card._t !== token || !card.classList.contains('open')) return;
            view.appendChild(c);
          }
          if (doc.numPages > n) view.insertAdjacentHTML('beforeend', `<div class="st-muted">Показаны первые ${n} страниц из ${doc.numPages}. Скачайте файл, чтобы увидеть всё.</div>`);
        } catch (_) { view.innerHTML = '<div class="st-muted">Не получилось показать PDF — скачайте файл</div>'; }
      } else {
        view.innerHTML = '<div class="st-muted">Просмотр недоступен — скачайте файл</div>';
      }
    }

    async function getFile(f) {
      const blob = await DB.get(f.id);
      if (!blob) throw new Error('нет файла');
      return blob;
    }
    async function download(files) {
      for (const f of files) {
        try {
          const url = URL.createObjectURL(await getFile(f));
          const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (_) { ctx.toast('Файл «' + f.name + '» не найден на этом устройстве'); }
      }
    }
    async function openFile(f) {
      try { const url = URL.createObjectURL(await getFile(f)); window.open(url, '_blank') || download([f]); setTimeout(() => URL.revokeObjectURL(url), 120000); }
      catch (_) { ctx.toast('Файл не найден на этом устройстве'); }
    }

    function openItem(id) {
      const b = items.find(x => x.id === id);
      if (!b) { openList(); return; }
      ctx.openScreen({
        title: 'Бронь',
        onBack: openList,
        action: [
          { icon: 'pencil', label: 'Изменить', cls: 'bk-plain', onClick: () => openForm(b, () => openItem(b.id)) },
          { icon: 'more-vertical', label: 'Ещё', cls: 'bk-plain', onClick: () => itemMenu(b) }
        ],
        render(body, screen) {
          const c = cat(b.cat);
          normDocs(b);
          const logo = b.cat === 'flight' && b.provider
            ? `<div class="bk-logo" style="background:hsl(${hueOf(b.provider)},68%,46%)">${esc(initials(b.provider))}</div>`
            : `<div class="bk-logo" style="background:${c.bg};color:${c.color}"><i data-lucide="${c.icon}"></i></div>`;
          const title = b.cat === 'flight' && b.from && b.to && !b.title
            ? `Рейс ${esc(b.from)} <i data-lucide="arrow-right"></i> ${esc(b.to)}` : esc(titleOf(b));
          const sub = b.cat === 'flight' ? [b.provider, b.number].filter(Boolean).join(' · ') : [b.provider, b.cat === 'transport' ? '' : b.place].filter(Boolean).join(' · ');
          const rows = [];
          if (b.code || b.number) rows.push(`<div class="bk-r" data-copy="${esc(b.code || b.number)}"><i data-lucide="users"></i><span class="bk-r-l">Номер брони</span><span class="bk-r-v">${esc(b.code || b.number)}</span><i data-lucide="copy" class="bk-copy"></i></div>`);
          if (b.people) rows.push(`<button class="bk-r" data-edit><i data-lucide="users"></i><span class="bk-r-l">${PEOPLE[b.cat]}</span><span class="bk-r-v">${esc(b.people)}</span><i data-lucide="chevron-right" class="bk-r-go"></i></button>`);
          if (b.cat === 'flight' && b.seats) rows.push(`<button class="bk-r" data-edit><i data-lucide="armchair"></i><span class="bk-r-l">Места</span><span class="bk-r-v">${esc(b.seats)}</span><i data-lucide="chevron-right" class="bk-r-go"></i></button>`);
          if (b.cat !== 'flight' && b.place) rows.push(`<button class="bk-r" data-map><i data-lucide="map-pin"></i><span class="bk-r-l">Адрес</span><span class="bk-r-v">${esc(b.place)}</span><i data-lucide="chevron-right" class="bk-r-go"></i></button>`);
          if (b.cat === 'transport' && b.placeTo) rows.push(`<button class="bk-r" data-map2><i data-lucide="map-pin-check"></i><span class="bk-r-l">Возврат</span><span class="bk-r-v">${esc(b.placeTo)}</span><i data-lucide="chevron-right" class="bk-r-go"></i></button>`);
          if (+b.price > 0) rows.push(`<div class="bk-r"><i data-lucide="circle-dollar-sign"></i><span class="bk-r-l">Цена</span><span class="bk-r-v big">${esc(money(+b.price, b.currency || tripCur))}</span></div>`);
          if (b.note) rows.push(`<div class="bk-r" style="align-items:flex-start;padding:14px 0"><i data-lucide="file-text"></i><span class="bk-r-l">Заметка</span><span class="bk-r-v" style="white-space:normal;color:var(--t2)">${esc(b.note)}</span></div>`);
          body.innerHTML = `
            <div class="bk-hero"><img src="${esc(b.photo || IMG + c.hero)}" alt=""><div class="bk-hero-l${b.cat === 'flight' ? ' fl' : ''}"><i data-lucide="${c.icon}"></i>${c.one}</div></div>
            <div class="bk-card bk-head">
              <div class="bk-head-top">${logo}<div class="bk-head-txt"><b>${title}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>${pill(b)}</div>
              ${routeBlock(b)}
            </div>
            <div class="bk-quick">
              <button class="bk-card bk-q" type="button" data-q="ticket"><span><i data-lucide="${b.cat === 'flight' ? 'qr-code' : 'ticket'}"></i></span>${b.cat === 'flight' ? 'Посадочный' : b.cat === 'ticket' ? 'Билет' : 'Документ'}</button>
              <button class="bk-card bk-q" type="button" data-q="route"><span><i data-lucide="navigation"></i></span>Маршрут</button>
              <button class="bk-card bk-q" type="button" data-q="copy"><span><i data-lucide="copy"></i></span>Номер брони</button>
            </div>
            ${rows.length ? `<div class="bk-card bk-rows">${rows.join('')}</div>` : ''}
            <div class="bk-h3">Документы</div>
            ${b.docs.map(d => `<div class="bk-card bk-doc" data-doc="${d.id}">
                <div class="bk-doc-row" role="button" tabindex="0" aria-expanded="false">
                  <span class="bk-doc-ic"><i data-lucide="${docIcon(d)}"></i></span>
                  <span class="bk-txt"><b>${esc(d.title)}</b><span class="bk-sub">${esc(docsSub(d))}</span></span>
                  <button class="bk-dl" type="button" data-dl aria-label="Скачать"><i data-lucide="download"></i></button>
                  <button class="bk-dl" type="button" data-more aria-label="Переименовать или удалить"><i data-lucide="more-vertical"></i></button>
                </div><div class="bk-doc-view" hidden></div></div>`).join('')}
            <button class="bk-adddoc" type="button" data-a="adddoc"><i data-lucide="plus"></i>Добавить документ</button>
            <div style="height:20px"></div>
          `;
          body.querySelectorAll('[data-edit]').forEach(x => x.addEventListener('click', () => openForm(b, () => openItem(b.id))));
          body.querySelector('[data-map]')?.addEventListener('click', () => window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(b.place), '_blank'));
          body.querySelector('[data-copy]')?.addEventListener('click', e => {
            const v = e.currentTarget.dataset.copy;
            (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => ctx.toast('Номер скопирован'), () => ctx.toast(v));
          });
          body.querySelectorAll('.bk-doc').forEach(card => {
            const d = b.docs.find(y => y.id === card.dataset.doc); if (!d) return;
            const row = card.querySelector('.bk-doc-row');
            const tg = () => { toggleDoc(card, d); row.setAttribute('aria-expanded', card.classList.contains('open')); };
            row.addEventListener('click', e => { if (e.target.closest('[data-dl],[data-more]')) return; tg(); });
            row.addEventListener('keydown', e => { if (e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tg(); } });
            card.querySelector('[data-dl]').addEventListener('click', () => download(d.files));
            card.querySelector('[data-more]').addEventListener('click', () => docMenu(b, d, screen));
          });
          body.querySelector('[data-a="adddoc"]').addEventListener('click', () => addDocSheet(b, screen));
          body.querySelector('[data-map2]')?.addEventListener('click', () => window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(b.placeTo), '_blank'));
          // Быстрые действия
          body.querySelector('[data-q="ticket"]').addEventListener('click', () => {
            const d = b.docs.find(x => ['boarding', 'ticket'].includes(x.kind)) || b.docs[0];
            if (!d) { addDocSheet(b, screen); return; }
            const card = body.querySelector(`.bk-doc[data-doc="${d.id}"]`);
            if (!card.classList.contains('open')) card.querySelector('.bk-doc-row').click();
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
          body.querySelector('[data-q="route"]').addEventListener('click', () => {
            const dest = b.cat === 'flight' ? [b.from, b.fromCity, 'airport'].filter(Boolean).join(' ') : b.place;
            if (!dest) { ctx.toast('Добавьте адрес, чтобы построить маршрут'); return; }
            window.open('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest), '_blank');
          });
          body.querySelector('[data-q="copy"]').addEventListener('click', () => {
            const v = b.code || b.number;
            if (!v) { ctx.toast('Номер брони не указан'); return; }
            (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => ctx.toast('Номер скопирован: ' + v), () => ctx.toast(v));
          });
        }
      });
    }

    function itemMenu(b) {
      sheet(titleOf(b), `<div class="bk-form" style="margin-top:10px">
          <button class="st-btn st-btn-g st-btn-fw" data-a="edit"><i data-lucide="pencil"></i>Изменить</button>
          <button class="st-btn st-btn-g st-btn-fw" data-a="dup"><i data-lucide="copy"></i>Дублировать</button>
          ${b.place ? '<button class="st-btn st-btn-g st-btn-fw" data-a="map"><i data-lucide="map"></i>Открыть на карте</button>' : ''}
          <button class="st-btn st-btn-g st-btn-fw" data-a="del" style="color:#E5484D"><i data-lucide="trash-2"></i>Удалить бронь</button>
        </div>`, (root, close) => {
        root.querySelector('[data-a="edit"]').addEventListener('click', () => { close(); openForm(b, () => openItem(b.id)); });
        root.querySelector('[data-a="dup"]').addEventListener('click', () => {
          const copy = Object.assign({}, b, { id: uid(), docs: [], status: 'pending' });
          items.push(copy); save(); close(); ctx.toast('Копия создана'); openForm(copy, () => openItem(copy.id));
        });
        root.querySelector('[data-a="map"]')?.addEventListener('click', () => { close(); window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(b.place), '_blank'); });
        root.querySelector('[data-a="del"]').addEventListener('click', () => {
          if (!confirm('Удалить бронь «' + titleOf(b) + '» вместе с документами?')) return;
          (b.docs || []).forEach(d => d.files.forEach(f => DB.del(f.id).catch(() => {})));
          items = items.filter(x => x.id !== b.id); save(); close(); ctx.toast('Бронь удалена'); openList();
        });
      });
    }

    // Новый документ: выбрать файл → приложение предлагает название, его можно изменить
    function addDocSheet(b, screen) {
      let file = null;
      sheet('Новый документ', `<div class="bk-form" style="margin-top:10px">
          <input type="file" id="bk-dfile" accept="application/pdf,image/*" hidden>
          <button class="bk-card bk-cover" type="button" data-a="pick"><span class="bk-doc-ic" style="width:56px;height:48px"><i data-lucide="upload"></i></span>
            <span id="bk-fname">Выбрать PDF или фото<small>До 15 МБ. Файл хранится только на этом устройстве.</small></span></button>
          <label>Название</label>
          <div class="bk-f"><i data-lucide="pencil"></i><input id="bk-dn" maxlength="60" placeholder="Например: Билеты в музей"></div>
          <button class="st-btn st-btn-fw" type="button" data-a="save" style="margin-top:6px">Сохранить документ</button>
        </div>`, (root, close) => {
        const inp = root.querySelector('#bk-dfile'), dn = root.querySelector('#bk-dn');
        root.querySelector('[data-a="pick"]').addEventListener('click', () => inp.click());
        inp.addEventListener('change', () => {
          const f = inp.files[0]; if (!f) return;
          if (f.size > 15 * 1048576) { ctx.toast('Файл больше 15 МБ'); return; }
          file = f;
          root.querySelector('#bk-fname').innerHTML = `${esc(f.name)}<small>${esc(fileSize(f.size))} · нажмите, чтобы выбрать другой</small>`;
          if (!dn.value.trim() || dn.dataset.auto) { dn.value = b.docs.length ? nameFromFile(f.name) || 'Документ' : docSuggest(b.cat); dn.dataset.auto = '1'; }
          dn.focus(); dn.select();
        });
        dn.addEventListener('input', () => { delete dn.dataset.auto; });
        root.querySelector('[data-a="save"]').addEventListener('click', async () => {
          if (!file) { ctx.toast('Сначала выберите файл'); inp.click(); return; }
          const id = 'f_' + uid();
          try { await DB.put(id, file); } catch (_) { ctx.toast('Не получилось сохранить файл: мало места на устройстве'); return; }
          normDocs(b).push({ id: uid(), kind: 'other', title: dn.value.trim() || nameFromFile(file.name) || 'Документ', files: [{ id, name: file.name, type: file.type || 'application/octet-stream', size: file.size }] });
          save(); close(); ctx.toast('Документ добавлен'); screen.refresh();
        });
      });
    }

    // Меню документа: переименовать, скачать, удалить
    function docMenu(b, d, screen) {
      sheet('Документ', `<div class="bk-form" style="margin-top:10px">
          <label>Название</label>
          <div class="bk-f"><i data-lucide="pencil"></i><input id="bk-dn" maxlength="60" value="${esc(d.title)}"></div>
          <button class="st-btn st-btn-fw" type="button" data-a="ren" style="margin-top:6px"><i data-lucide="check"></i>Сохранить название</button>
          <button class="st-btn st-btn-g st-btn-fw" type="button" data-a="get"><i data-lucide="download"></i>Скачать на устройство</button>
          <button class="st-btn st-btn-g st-btn-fw" type="button" data-a="del" style="color:#E5484D"><i data-lucide="trash-2"></i>Удалить документ</button>
        </div>`, (root, close) => {
        const dn = root.querySelector('#bk-dn');
        const ren = () => { const v = dn.value.trim(); if (!v) { ctx.toast('Введите название'); return; } d.title = v; save(); close(); screen.refresh(); };
        root.querySelector('[data-a="ren"]').addEventListener('click', ren);
        dn.addEventListener('keydown', e => { if (e.key === 'Enter') ren(); });
        root.querySelector('[data-a="get"]').addEventListener('click', () => download(d.files));
        root.querySelector('[data-a="del"]').addEventListener('click', () => {
          if (!confirm('Удалить документ «' + d.title + '»?')) return;
          d.files.forEach(f => DB.del(f.id).catch(() => {}));
          b.docs = b.docs.filter(y => y !== d);
          save(); close(); ctx.toast('Документ удалён'); screen.refresh();
        });
      });
    }

    // ===== Помощник: аэропорты и чтение броней (bookings-tools.js, грузится по требованию) =====
    let toolsP = null;
    const tools = () => toolsP || (toolsP = new Promise((ok, no) => {
      if (window.STBookingTools) return ok(window.STBookingTools);
      const s = document.createElement('script'); s.src = '/js/modules/bookings-tools.js?v=3';
      s.onload = () => ok(window.STBookingTools); s.onerror = () => { toolsP = null; no(new Error('tools')); };
      document.head.appendChild(s);
    }));

    // ===== Страница 3: новая бронь / изменить =====
    // opts.review = { file, name, kind, idx, total } — проверка брони из загруженного файла
    // opts.next() — открыть следующую бронь из того же файла (если есть)
    function openForm(src, back, opts) {
      const o = opts || {};
      const isNew = !src || !items.some(x => x.id === src.id);
      const draft = src ? Object.assign({}, src, { status: STATUS[src.status] ? src.status : 'confirmed' })
        : { id: uid(), cat: filter === 'all' ? 'flight' : filter, status: 'confirmed', title: '', provider: '', number: '', code: '', from: '', fromCity: '', fromName: '', to: '', toCity: '', toName: '',
            date: '', time: '', endDate: '', endTime: '', place: '', placeTo: '', people: '', seats: '', price: '', currency: tripCur, note: '', photo: '', docs: [] };
      const auto = new Set(draft._auto || []); delete draft._auto;
      const f = (id, icon, val, ph, extra) => `<div class="bk-f${auto.has(id.slice(2)) ? ' auto' : ''}"><i data-lucide="${icon}"></i><input id="${id}" value="${esc(val || '')}" placeholder="${esc(ph || '')}" ${extra || ''}></div>`;
      // Аэропорт: слева код (CGN), справа город. Код подставляется сам.
      const apField = side => {
        const code = draft[side], hint = draft[side + 'Name'];
        return `<div class="bk-2 k"><div><button type="button" class="bk-f bk-code${auto.has(side) ? ' auto' : ''}" data-ap="${side}" aria-label="Выбрать аэропорт">
            <i data-lucide="${side === 'from' ? 'plane-takeoff' : 'plane-landing'}"></i><b id="b-${side}Code">${esc(code || '—')}</b></button></div>
          <div>${f('b-' + side + 'City', 'map-pin', draft[side + 'City'], 'Город или аэропорт', 'autocomplete="off"')}</div></div>
          <div class="bk-hint${code ? ' ok' : ''}" id="b-${side}Hint">${code && hint ? '✓ ' + esc(hint) : ''}</div>`;
      };
      const screen = ctx.openScreen({
        title: o.review ? 'Проверьте бронь' : isNew ? 'Новая бронь' : 'Изменить бронь',
        onBack: back,
        action: { icon: 'check', label: 'Сохранить', cls: 'bk-save', onClick: submit },
        render(body) {
          const c = cat(draft.cat), [l1, l2] = LBL[draft.cat];
          const fl = draft.cat === 'flight';
          const curs = [...new Set([tripCur, ...CURRENCIES, draft.currency].filter(Boolean))];
          const statusSel = `<div class="bk-f"><i data-lucide="badge-check"></i><select id="b-status">${Object.entries(STATUS).map(([k, s]) => `<option value="${k}"${draft.status === k ? ' selected' : ''}>${s.full}</option>`).join('')}</select></div>`;
          body.innerHTML = `
            ${o.review ? `<div class="bk-card bk-review"><span class="bk-ic"><i data-lucide="sparkles"></i></span><div>
                <b>${o.review.total > 1 ? 'Бронь ' + o.review.idx + ' из ' + o.review.total + ' · ' : ''}Проверьте данные</b>
                <span>Заполнено из файла «${esc(o.review.name)}». Поля в фиолетовой рамке найдены автоматически. Исправьте, если нужно, и нажмите «Всё верно».</span></div></div>`
              : `<button class="bk-card bk-upload" type="button" data-a="import"><span class="bk-ic"><i data-lucide="file-up"></i></span>
                <span class="bk-txt"><b>Загрузить подтверждение брони</b><span class="bk-sub" style="white-space:normal">PDF или фото билета — приложение заполнит бронь само</span></span><i data-lucide="chevron-right" class="bk-go"></i></button>
                <input type="file" id="b-import" accept="application/pdf,image/*" hidden>`}
            <div class="bk-cats">${CATS.slice(1).map(x => `<button class="bk-cat${x.id === draft.cat ? ' on' : ''}" type="button" data-c="${x.id}"><i data-lucide="${x.icon}"></i><span>${x.one}</span></button>`).join('')}</div>
            <div class="bk-form">
              ${fl ? `
                <label>Откуда</label>${apField('from')}
                <label>Куда</label>${apField('to')}
                <div class="bk-2"><div><label>Номер рейса</label>${f('b-number', 'hash', draft.number, '', 'class="up" maxlength="10"')}</div><div><label>Авиакомпания</label>${f('b-provider', 'building-2', draft.provider)}</div></div>
              ` : `
                <label>Название</label>${f('b-title', c.icon, draft.title, draft.cat === 'stay' ? 'Апартаменты, отель' : draft.cat === 'transport' ? 'Аренда авто, трансфер' : 'Экскурсия, музей, концерт', 'maxlength="80"')}
                ${draft.cat === 'transport' ? `<label>Компания</label>${f('b-provider', 'building-2', draft.provider)}` : ''}
                <label>${draft.cat === 'transport' ? 'Место получения' : 'Адрес'}</label>${f('b-place', 'map-pin', draft.place)}
                ${draft.cat === 'transport' ? `<label>Место возврата <span style="font-weight:500;color:var(--t3)">· если другое</span></label>${f('b-placeTo', 'map-pin-check', draft.placeTo)}` : ''}
              `}
              <label>${l1}</label><div class="bk-2"><div>${f('b-date', 'calendar', draft.date, '', 'type="date"')}</div><div>${f('b-time', 'clock', draft.time, '', 'type="time"')}</div></div>
              <label>${l2} <span style="font-weight:500;color:var(--t3)">· необязательно</span></label><div class="bk-2"><div>${f('b-endDate', 'calendar-check', draft.endDate, '', `type="date" min="${esc(draft.date)}"`)}</div><div>${f('b-endTime', 'clock', draft.endTime, '', 'type="time"')}</div></div>
              <label>Номер брони</label>${f('b-code', 'hash', draft.code, '', 'maxlength="30"')}
              <div class="bk-2"><div><label>${PEOPLE[draft.cat]}</label>${f('b-people', 'users', draft.people)}</div>
                ${fl ? `<div><label>Места</label>${f('b-seats', 'armchair', draft.seats, '', 'class="up"')}</div>` : `<div><label>Статус</label>${statusSel}</div>`}</div>
              ${fl ? `<label>Статус</label>${statusSel}` : ''}
              <label>Цена</label><div class="bk-2"><div>${f('b-price', 'circle-dollar-sign', draft.price, '0,00', 'inputmode="decimal"')}</div>
                <div><div class="bk-f${auto.has('currency') ? ' auto' : ''}"><i data-lucide="coins"></i><select id="b-currency">${curs.map(x => `<option${x === draft.currency ? ' selected' : ''}>${x}</option>`).join('')}</select></div></div></div>
              <label>Заметка</label><div class="bk-f${auto.has('note') ? ' auto' : ''}"><i data-lucide="file-text" style="align-self:flex-start;margin-top:15px"></i><textarea id="b-note" maxlength="300">${esc(draft.note)}</textarea></div>
              ${o.review ? `<label>Документ</label><div class="bk-card bk-cover" style="cursor:default"><span class="bk-doc-ic" style="width:56px;height:48px"><i data-lucide="${/\.pdf$/i.test(o.review.name) ? 'file-text' : 'image'}"></i></span>
                  <span>${esc(o.review.name)}<small>Файл сохранится в документах брони</small></span></div>
                <label>Название документа</label><div class="bk-f"><i data-lucide="pencil"></i><input id="b-docname" maxlength="60" value="${esc(o.review.docTitle || docSuggest(draft.cat, o.review.kind))}"></div>` : `
              <label>Обложка</label>
              <button class="bk-card bk-cover" type="button" data-a="photo"><img src="${esc(draft.photo || IMG + c.hero)}" alt="">
                <span>${draft.photo ? 'Своё фото' : 'Стандартная картинка'}<small>Нажмите, чтобы ${draft.photo ? 'заменить' : 'выбрать своё фото'}</small></span>
                ${draft.photo ? '<i data-lucide="x" data-a="nophoto" style="width:20px;height:20px;color:var(--t3)"></i>' : '<i data-lucide="image-plus" style="width:20px;height:20px;color:var(--t3)"></i>'}</button>
              <input type="file" id="b-photo" accept="image/*" hidden>`}
              <button class="st-btn st-btn-fw" type="button" data-a="save" style="margin-top:8px">${o.review ? 'Всё верно — сохранить' : isNew ? 'Добавить бронь' : 'Сохранить'}</button>
              ${o.review && o.review.total > 1 ? `<button class="bk-del" type="button" data-a="skip" style="color:var(--t2)">Пропустить эту бронь</button>` : ''}
              ${!isNew ? '<button class="bk-del" type="button" data-a="del"><i data-lucide="trash-2"></i>Удалить бронь</button>' : ''}
              <div style="height:16px"></div>
            </div>`;
          const v = id => body.querySelector('#' + id);
          const read = () => {
            ['title', 'provider', 'number', 'fromCity', 'toCity', 'date', 'time', 'endDate', 'endTime', 'place', 'placeTo', 'code', 'people', 'seats', 'note', 'currency', 'status']
              .forEach(k => { const el = v('b-' + k); if (el) draft[k] = el.value.trim(); });
            ['number', 'seats'].forEach(k => { draft[k] = (draft[k] || '').toUpperCase(); });
            if (o.review && v('b-docname')) o.review.docTitle = v('b-docname').value.trim();
            const p = v('b-price').value.replace(/\s/g, '').replace(',', '.');
            draft.price = p === '' ? '' : (isNaN(+p) ? draft.price : Math.round(+p * 100) / 100);
          };
          body._read = read;
          body.querySelectorAll('[data-c]').forEach(x => x.addEventListener('click', () => { read(); draft.cat = x.dataset.c; screen.refresh(); }));
          v('b-date').addEventListener('change', e => { v('b-endDate').min = e.target.value; });
          body.querySelectorAll('.bk-f.auto input, .bk-f.auto select, .bk-f.auto textarea').forEach(el => el.addEventListener('input', () => el.closest('.bk-f').classList.remove('auto'), { once: true }));
          // Аэропорты: город → код
          if (fl) {
            ['from', 'to'].forEach(side => {
              const inp = v('b-' + side + 'City');
              let timer = null;
              inp.addEventListener('input', () => {
                if (draft[side]) { draft[side] = ''; draft[side + 'Name'] = ''; v('b-' + side + 'Code').textContent = '—'; setHint(side, '', ''); }
                clearTimeout(timer); timer = setTimeout(() => resolveAirport(side, false), 1200);
              });
              inp.addEventListener('change', () => { clearTimeout(timer); resolveAirport(side, false); });
              body.querySelector(`[data-ap="${side}"]`).addEventListener('click', () => { if (inp.value.trim()) resolveAirport(side, true); else inp.focus(); });
            });
            v('b-number').addEventListener('change', async e => {
              const prov = v('b-provider');
              if (prov.value.trim() || !e.target.value.trim()) return;
              try { const T = await tools(); const db = await T.loadDb(); const n = T.airlineOf(db, e.target.value); if (n && !prov.value.trim()) prov.value = n; } catch (_) {}
            });
          }
          // Загрузить подтверждение
          const imp = v('b-import');
          if (imp) {
            body.querySelector('[data-a="import"]').addEventListener('click', () => imp.click());
            imp.addEventListener('change', () => { const file = imp.files[0]; imp.value = ''; if (file) { read(); importFile(file); } });
          }
          const ph = v('b-photo');
          if (ph) {
            body.querySelector('[data-a="photo"]').addEventListener('click', e => {
              if (e.target.closest('[data-a="nophoto"]')) { read(); draft.photo = ''; screen.refresh(); return; }
              ph.click();
            });
            ph.addEventListener('change', async () => {
              const file = ph.files[0]; if (!file) return;
              if (!file.type.startsWith('image/')) { ctx.toast('Выберите фото'); return; }
              try { read(); draft.photo = await compress(file, 900); screen.refresh(); } catch (_) { ctx.toast('Не получилось открыть фото'); }
            });
          }
          body.querySelector('[data-a="save"]').addEventListener('click', submit);
          body.querySelector('[data-a="skip"]')?.addEventListener('click', () => { if (!(o.next && o.next())) openList(); });
          body.querySelector('[data-a="del"]')?.addEventListener('click', () => {
            if (!confirm('Удалить бронь вместе с документами?')) return;
            (draft.docs || []).forEach(d => d.files.forEach(x => DB.del(x.id).catch(() => {})));
            items = items.filter(x => x.id !== draft.id); save(); ctx.toast('Бронь удалена'); openList();
          });
        }
      });

      function setHint(side, text, cls) {
        const h = document.getElementById('b-' + side + 'Hint'); if (!h) return;
        h.className = 'bk-hint' + (cls ? ' ' + cls : ''); h.textContent = text;
      }
      function setAirport(side, a, T) {
        draft[side] = a.code; draft[side + 'Name'] = a.name;
        const inp = document.getElementById('b-' + side + 'City');
        if (inp && (/^[A-Za-z]{3}$/.test(inp.value.trim()) || !inp.value.trim())) inp.value = T.cityShort(a);
        if (inp) draft[side + 'City'] = inp.value.trim();
        const b = document.getElementById('b-' + side + 'Code'); if (b) b.textContent = a.code;
        setHint(side, '✓ ' + a.name, 'ok');
      }
      // Найти аэропорт по введённому городу; если их несколько — спросить, какой
      let reqN = 0;
      async function resolveAirport(side, forceChoose) {
        const inp = document.getElementById('b-' + side + 'City'); if (!inp) return;
        const q = inp.value.trim();
        if (!q) { setHint(side, '', ''); return; }
        if (draft[side] && !forceChoose) return;
        const my = ++reqN;
        setHint(side, 'Ищу аэропорт…', 'wait');
        let T, res;
        try { T = await tools(); res = await T.findAirports(q); } catch (_) { setHint(side, 'Не получилось загрузить список аэропортов', 'err'); return; }
        if (my !== reqN || inp.value.trim() !== q) return;
        const list = res.list;
        if (!list.length) {
          setHint(side, res.offline ? 'Нет интернета: введите код аэропорта, например CGN' : 'Аэропорт не найден. Уточните город или введите код (например, CGN)', 'err');
          return;
        }
        if (list.length === 1 && !forceChoose && !res.far) { setAirport(side, list[0], T); return; }
        setHint(side, list.length > 1 ? 'Несколько аэропортов — выберите нужный' : 'Проверьте аэропорт', 'wait');
        sheet(res.far ? 'В этом городе нет аэропорта' : list.length > 1 ? 'Какой аэропорт?' : 'Аэропорт', `
          <div class="st-muted" style="margin:4px 0 10px;font-size:.86rem">${res.far ? 'Ближайшие аэропорты к «' + esc(q) + '»:' : list.length > 1 ? 'У «' + esc(q) + '» несколько аэропортов. Уточните, какой нужен:' : ''}</div>
          <div class="bk-form">${list.map((a, i) => `<button class="bk-card bk-apopt" type="button" data-i="${i}"><b>${a.code}</b>
            <span><span>${esc(a.name)}</span><small>${esc(T.cityShort(a))}${a.d != null ? ' · ' + Math.round(a.d) + ' км от центра' : ''}</small></span></button>`).join('')}</div>`, (root, close) => {
          root.querySelectorAll('[data-i]').forEach(x => x.addEventListener('click', () => { setAirport(side, list[+x.dataset.i], T); close(); }));
        });
      }

      // ---- Загрузка подтверждения: прочитать → разобрать → сверить → заполнить ----
      async function importFile(file) {
        if (file.size > 15 * 1048576) { ctx.toast('Файл больше 15 МБ'); return; }
        let setP = () => {}, closeP = () => {};
        sheet('Читаю бронь…', `<div class="bk-form" style="margin:6px 0 4px"><div class="st-muted" style="font-size:.88rem">${esc(file.name || 'Файл')}</div>
            <div class="bk-prog"><i id="bk-prog-bar"></i></div><div class="st-muted" style="font-size:.78rem">Файл обрабатывается на телефоне и никуда не отправляется</div></div>`,
          (root, close) => { closeP = close; setP = p => { const b = root.querySelector('#bk-prog-bar'); if (b) b.style.width = Math.round(10 + 85 * Math.min(1, p || 0)) + '%'; }; });
        let res, T, db;
        try {
          T = await tools(); db = await T.loadDb(); setP(0.05);
          const text = await T.readFile(file, setP);
          res = T.parseBooking(text, db, { currency: tripCur });
        } catch (e) {
          closeP();
          ctx.toast(e && e.message === 'type' ? 'Подходит только PDF или фото' : 'Не получилось прочитать файл');
          return;
        }
        closeP();
        const kind = res.boarding ? 'boarding' : 'confirm';
        const apName = c => (db.byCode.get(c) || {}).name || '';
        // брони, найденные в файле (в одном файле может быть несколько рейсов)
        let found = [];
        if (res.cat === 'flight' && res.segments.length) {
          found = res.segments.map(s => ({ cat: 'flight', from: s.from, to: s.to, fromCity: s.fromCity, toCity: s.toCity, fromName: apName(s.from), toName: apName(s.to),
            number: s.number, provider: s.provider, date: s.date, time: s.time, endDate: s.endDate || '', endTime: s.endTime, code: res.code, people: res.people, seats: res.seats,
            price: '', currency: '' }));
          // цена обычно общая на всю бронь: ставим на первый рейс, чтобы «Итого» было верным
          if (res.price) { found[0].price = res.price; found[0].currency = res.currency || tripCur; if (found.length > 1) found[0].note = 'Цена за все рейсы этой брони (' + found.length + ')'; }
        } else if (res.date || res.title || res.code) {
          found = [{ cat: res.cat === 'flight' ? 'ticket' : res.cat, title: res.title, provider: res.provider, place: res.place, placeTo: res.placeTo, date: res.date, time: res.time,
            endDate: res.endDate, endTime: res.endTime, code: res.code, people: res.people, price: res.price, currency: res.price ? res.currency : '', note: res.note || '' }];
        }
        if (!found.length) {
          ctx.toast('Данные не распознаны — заполните вручную. Файл прикреплён к брони.');
          startReview([Object.assign({}, draft, { _auto: [] })], file, kind);
          return;
        }
        // Сверка с тем, что пользователь уже ввёл: при расхождении спрашиваем
        const first = found[0];
        const conflicts = [];
        const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
        if (draft.cat === 'flight' && first.cat === 'flight') {
          ['from', 'to'].forEach(k => {
            const lbl = k === 'from' ? 'Вылет' : 'Прилёт';
            if (draft[k] && first[k] && draft[k] !== first[k]) conflicts.push({ k, label: lbl, mine: draft[k] + ' · ' + (draft[k + 'City'] || draft[k + 'Name'] || ''), file: first[k] + ' · ' + (first[k + 'City'] || '') });
            else if (!draft[k] && draft[k + 'City'] && first[k] && !same(draft[k + 'City'], first[k + 'City'])) conflicts.push({ k, label: lbl, mine: draft[k + 'City'], file: first[k] + ' · ' + (first[k + 'City'] || '') });
          });
        }
        [['date', 'Дата'], ['time', 'Время'], ['number', 'Номер рейса'], ['code', 'Номер брони'], ['title', 'Название']].forEach(([k, lbl]) => {
          if (draft[k] && first[k] && !same(draft[k], first[k])) conflicts.push({ k, label: lbl, mine: k === 'date' ? dayName(draft[k]) : draft[k], file: k === 'date' ? dayName(first[k]) : first[k] });
        });
        const apply = keep => {
          const merged = found.map((x, i) => {
            const out = i === 0 ? Object.assign({}, draft) : { id: uid(), status: 'confirmed', title: '', note: '', photo: '', docs: [], currency: tripCur, placeTo: '' };
            out.cat = x.cat;
            const filled = [];
            Object.entries(x).forEach(([k, val]) => {
              if (val === '' || val == null || k === 'cat') return;
              if (i === 0 && keep.has(k)) return;
              if (out[k] && same(out[k], val)) return;
              out[k] = val; filled.push(k);
            });
            out._auto = filled;
            return out;
          });
          startReview(merged, file, kind);
        };
        if (!conflicts.length) { apply(new Set()); return; }
        const choice = conflicts.map(() => 'file');
        sheet('В файле другие данные', `<div class="st-muted" style="margin:4px 0 10px;font-size:.86rem">Вы указали одно, а в брони написано другое. Что верно?</div>
          <div class="bk-form">${conflicts.map((c, i) => `<div class="bk-conf"><b>${c.label}</b>
            <div class="bk-conf-opts"><button type="button" class="on" data-ci="${i}" data-v="file"><small>В файле</small>${esc(c.file)}</button>
            <button type="button" data-ci="${i}" data-v="mine"><small>Вы указали</small>${esc(c.mine)}</button></div></div>`).join('')}
            <button class="st-btn st-btn-fw" type="button" data-a="go" style="margin-top:6px">Продолжить</button></div>`, (root, close) => {
          root.querySelectorAll('[data-ci]').forEach(b => b.addEventListener('click', () => {
            const i = +b.dataset.ci; choice[i] = b.dataset.v;
            root.querySelectorAll(`[data-ci="${i}"]`).forEach(x => x.classList.toggle('on', x === b));
          }));
          root.querySelector('[data-a="go"]').addEventListener('click', () => {
            const keep = new Set();
            conflicts.forEach((c, i) => { if (choice[i] === 'mine') { keep.add(c.k); if (c.k === 'from' || c.k === 'to') { keep.add(c.k + 'City'); keep.add(c.k + 'Name'); } } });
            close(); apply(keep);
          });
        });
      }
      // Проверка найденных броней по очереди: каждая — отдельная бронь
      function startReview(list, file, kind) {
        const name = file.name || 'бронь';
        const run = i => {
          openForm(list[i], i === 0 ? back : openList, {
            review: { file, name, kind, idx: i + 1, total: list.length },
            next: () => { if (i + 1 < list.length) { run(i + 1); return true; } return false; }
          });
        };
        if (list.length > 1) {
          sheet('Найдено броней: ' + list.length, `<div class="st-muted" style="margin:4px 0 10px;font-size:.86rem">В файле несколько рейсов. Проверим каждый по очереди — каждый станет отдельной бронью и появится в календаре.</div>
            <div class="bk-form">${list.map(d => `<div class="bk-card bk-apopt" style="cursor:default"><b>${esc(d.number || d.from || '')}</b><span><span>${esc((d.from || '') + ' → ' + (d.to || ''))}</span><small>${d.date ? esc(dayName(d.date)) : ''}${d.time ? ', ' + esc(d.time) : ''}</small></span></div>`).join('')}
            <button class="st-btn st-btn-fw" type="button" data-a="go" style="margin-top:6px">Проверить по очереди</button></div>`, (root, close) => {
            root.querySelector('[data-a="go"]').addEventListener('click', () => { close(); run(0); });
          });
        } else run(0);
      }

      async function submit() {
        const body = document.getElementById('mod-body');
        body && body._read && body._read();
        if (draft.cat === 'flight') {
          if (!draft.from || !draft.to) {
            const side = !draft.from ? 'from' : 'to';
            const txt = (draft[side + 'City'] || '').trim();
            if (txt) { ctx.toast('Уточните аэропорт: «' + txt + '»'); resolveAirport(side, true); }
            else ctx.toast(side === 'from' ? 'Укажите, откуда летите' : 'Укажите, куда летите');
            return;
          }
        } else if (!draft.title) { ctx.toast('Введите название'); return; }
        if (!draft.date) { ctx.toast('Укажите дату'); return; }
        if (draft.endTime && !draft.endDate) draft.endDate = draft.date;
        if (draft.endDate && draft.endDate < draft.date) { ctx.toast('Окончание не может быть раньше начала'); return; }
        if (draft.endDate === draft.date && draft.time && draft.endTime && draft.endTime < draft.time) { ctx.toast('Время окончания раньше начала'); return; }
        if (draft.endDate === draft.date && !draft.endTime) draft.endDate = '';
        if (draft.cat !== 'flight') { draft.from = draft.to = draft.fromCity = draft.toCity = draft.fromName = draft.toName = draft.number = draft.seats = ''; }
        if (draft.cat !== 'transport') draft.placeTo = '';
        if (draft.cat === 'flight') draft.title = '';
        draft.docs = draft.docs || [];
        // файл подтверждения → в документы брони
        if (o.review && o.review.file) {
          try {
            const id = 'f_' + uid(), file = o.review.file;
            await DB.put(id, file);
            normDocs(draft).push({ id: uid(), kind: o.review.kind, title: o.review.docTitle || docSuggest(draft.cat, o.review.kind),
              files: [{ id, name: file.name || 'бронь', type: file.type || 'application/octet-stream', size: file.size }] });
          } catch (_) { ctx.toast('Файл не сохранился: мало места на устройстве'); }
        }
        const i = items.findIndex(x => x.id === draft.id);
        if (i >= 0) items[i] = draft; else items.push(draft);
        save();
        ctx.toast(o.review ? 'Бронь сохранена и добавлена в календарь' : isNew ? 'Бронь добавлена' : 'Сохранено');
        if (!(o.next && o.next())) openItem(draft.id);
      }
    }

    openList();
    if (openFirst && items.some(b => b.id === openFirst)) openItem(openFirst);
  });
})();
