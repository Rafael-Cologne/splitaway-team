// ============================================================
// Модуль «Дневник путешествия» (id: 'diary')
// Ответственный: Рафаэль
// ------------------------------------------------------------
// Личная история поездки: записи по дням, фото и видео с подписями,
// места (поиск OSM / «моё место» / места из Гида), голосовые заметки
// с расшифровкой речи, привязка уже существующих расходов ST (без дублирования),
// оценка и настроение дня, «Рассказ о поездке» (умный шаблон, без платного AI),
// «Итоги путешествия» и экспорт в PDF (печать → «Сохранить как PDF»).
// Хранение: записи — ctx.store (на устройстве, для каждой поездки),
// фото/видео/аудио — IndexedDB 'st_diary_media'.
// Режим «Общий дневник» — после миграции общей таблицы (см. docs/diary-shared.sql).
// ============================================================
(function () {
  'use strict';
  if (!window.STHub) return;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const addDay = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return isoOf(d); };
  const today = () => isoOf(new Date());
  const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const MONL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const short = s => parse(s).getDate() + ' ' + MON[parse(s).getMonth()];
  const long = s => parse(s).getDate() + ' ' + MONL[parse(s).getMonth()];
  const MOODS = [{ id: 'good', icon: 'smile', name: 'Отличное', em: '😊' }, { id: 'ok', icon: 'meh', name: 'Нормальное', em: '😐' }, { id: 'bad', icon: 'frown', name: 'Так себе', em: '☹️' }];
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };

  // ---------- Медиа: IndexedDB ----------
  const DB = (() => {
    let p = null;
    const open = () => p || (p = new Promise((res, rej) => {
      const r = indexedDB.open('st_diary_media', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(r.result);
      r.onerror = () => { p = null; rej(r.error); };
    }));
    const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
      const t = db.transaction('files', mode); const req = fn(t.objectStore('files'));
      t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }));
    return { put: (id, b) => run('readwrite', s => s.put(b, id)), get: id => run('readonly', s => s.get(id)), del: id => run('readwrite', s => s.delete(id)) };
  })();
  const urls = new Map(); // id → objectURL (на время работы модуля)
  async function urlOf(id) {
    if (urls.has(id)) return urls.get(id);
    const b = await DB.get(id).catch(() => null); if (!b) return '';
    const u = URL.createObjectURL(b); urls.set(id, u); return u;
  }
  // Подставить картинки: <img data-m="t_xxx">
  function fillMedia(root) {
    root.querySelectorAll('[data-m]').forEach(el => urlOf(el.dataset.m).then(u => {
      if (!u) return;
      if (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'AUDIO') el.src = u; else el.style.backgroundImage = `url('${u}')`;
    }));
  }
  function resize(file, max, q) {
    return new Promise((ok, no) => {
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u); c.toBlob(b => b ? ok(b) : no(new Error('img')), 'image/jpeg', q || .82); };
      img.onerror = () => { URL.revokeObjectURL(u); no(new Error('img')); };
      img.src = u;
    });
  }
  async function saveMedia(file) {
    const id = uid();
    if (file.type.startsWith('video/')) {
      if (file.size > 60 * 1048576) throw new Error('big');
      await DB.put('m_' + id, file); return { id, type: 'video', cap: '' };
    }
    const big = await resize(file, 1600, .82), small = await resize(file, 420, .75);
    await DB.put('m_' + id, big); await DB.put('t_' + id, small);
    return { id, type: 'photo', cap: '' };
  }
  const thumbId = m => m.type === 'photo' ? 't_' + m.id : '';

  // ---------- Стили ----------
  STHub.addStyles('diary', `
    [data-module="diary"]{--dy-grad:linear-gradient(150deg,#8F7BFF 0%,#6A4DF4 55%,#5B3FE6 100%);--dy-ac:#6A4DF4;--dy-soft:#EFECFF;--dy-line:rgba(110,100,170,.12)}
    [data-theme=dark] [data-module="diary"]{--dy-ac:#A898FF;--dy-soft:rgba(140,120,255,.16);--dy-line:rgba(255,255,255,.08)}
    [data-module="diary"] .mod-body{display:flex;flex-direction:column;gap:12px;padding-bottom:96px}
    .dy-card{background:var(--hub-card);border:1px solid var(--hub-card-b);border-radius:22px;box-shadow:var(--hub-shadow)}
    button.dy-card{width:100%;font:inherit;color:var(--text);text-align:left;cursor:pointer}
    .dy-hero{position:relative;height:170px;border-radius:26px;overflow:hidden;background:var(--dy-grad);box-shadow:0 14px 30px rgba(106,77,244,.22)}
    .dy-hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .dy-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(40,20,120,.05),rgba(40,20,120,.55))}
    .dy-hero b{position:absolute;left:0;right:0;bottom:62px;text-align:center;color:#fff;font-size:1.6rem;font-weight:800;z-index:1;text-shadow:0 2px 10px rgba(0,0,0,.35)}
    .dy-seg{position:absolute;left:12px;right:12px;bottom:12px;z-index:1;display:grid;grid-template-columns:1fr 1fr;background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-radius:16px;padding:4px}
    .dy-seg button{border:0;background:none;border-radius:12px;padding:10px;font:inherit;font-weight:700;color:#2A2550;cursor:pointer}
    .dy-seg button.on{background:#fff;color:var(--dy-ac);box-shadow:0 2px 8px rgba(40,20,120,.15)}
    .dy-modes{display:flex;gap:8px}
    .dy-mode{display:flex;align-items:center;gap:6px;border:1px solid var(--hub-card-b);background:var(--hub-card);color:var(--text);border-radius:999px;padding:8px 14px;font:inherit;font-weight:700;font-size:.85rem;cursor:pointer}
    .dy-mode svg{width:16px;height:16px}
    .dy-mode.on{background:var(--dy-ac);color:#fff;border-color:transparent}
    .dy-mode.off{opacity:.55}
    .dy-day{display:flex;align-items:center;gap:14px;padding:10px 12px 10px 10px}
    .dy-th{width:86px;height:76px;border-radius:16px;flex-shrink:0;background:var(--dy-soft) center/cover no-repeat;display:flex;align-items:center;justify-content:center;color:var(--dy-ac)}
    .dy-th svg{width:26px;height:26px;opacity:.7}
    .dy-day-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
    .dy-day-t b{font-weight:800;font-size:1rem}
    .dy-day-t span{font-size:.92rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .dy-day-t span.empty{color:var(--t2)}
    .dy-meta{display:flex;align-items:center;gap:10px;color:var(--t2);font-size:.78rem;margin-top:3px}
    .dy-meta i,.dy-meta svg{width:15px;height:15px}
    .dy-meta span{display:flex;align-items:center;gap:4px}
    .dy-day>svg:last-child{width:20px;height:20px;color:var(--t2);flex-shrink:0}
    .dy-fab{position:fixed;right:max(18px,calc(50% - 262px));bottom:calc(var(--nh) + var(--sb) + 18px);width:60px;height:60px;border-radius:50%;border:0;background:var(--dy-grad);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 12px 26px rgba(106,77,244,.45);cursor:pointer;z-index:20}
    .dy-fab svg{width:30px;height:30px}
    .dy-empty{text-align:center;color:var(--t2);padding:22px 16px;font-size:.92rem}
    /* день */
    .dy-photo{height:220px;border-radius:26px;background:var(--dy-grad) center/cover no-repeat;position:relative;overflow:hidden}
    .dy-head{padding:16px 16px 14px;margin-top:-34px;position:relative;z-index:1}
    .dy-head h3{font-size:1.4rem;font-weight:800;margin:0 0 8px}
    .dy-head-row{display:flex;align-items:center;gap:10px;color:var(--t2);font-size:.9rem}
    .dy-head-row span{display:flex;align-items:center;gap:6px;min-width:0}
    .dy-head-row svg{width:17px;height:17px;color:var(--dy-ac);flex-shrink:0}
    .dy-head-row .wx{margin-left:auto;flex-shrink:0;color:var(--text);font-weight:600}
    .dy-text{white-space:pre-wrap;line-height:1.5;font-size:.97rem;margin-top:12px}
    .dy-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .dy-strip button{position:relative;aspect-ratio:1/.9;border:0;border-radius:16px;background:var(--dy-soft) center/cover no-repeat;cursor:pointer;padding:0;overflow:hidden;color:var(--dy-ac)}
    .dy-strip button b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(20,10,60,.45);color:#fff;font-size:1.5rem;font-weight:800}
    .dy-strip button svg{width:28px;height:28px}
    .dy-acts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .dy-act{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 6px;font-size:.82rem;font-weight:700}
    .dy-act svg{width:24px;height:24px;color:var(--dy-ac)}
    .dy-voice{display:flex;align-items:center;justify-content:center;gap:10px;padding:14px;border:0;border-radius:18px;background:var(--dy-soft);color:var(--dy-ac);font:inherit;font-weight:700;cursor:pointer;width:100%}
    .dy-voice svg{width:22px;height:22px}
    .dy-voice.rec{background:#FFE4E6;color:#E5484D}
    .dy-rows{padding:2px 14px}
    .dy-r{display:flex;align-items:center;gap:12px;width:100%;padding:14px 0;border:0;border-bottom:1px solid var(--dy-line);background:none;font:inherit;color:var(--text);text-align:left;cursor:pointer}
    .dy-r:last-child{border-bottom:0}
    .dy-r>svg:first-child{width:22px;height:22px;color:var(--dy-ac);flex-shrink:0}
    .dy-r>span{flex:1;min-width:0;font-weight:600}
    .dy-r small{display:block;color:var(--t2);font-weight:500;font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .dy-r>svg:last-child{width:19px;height:19px;color:var(--t2);flex-shrink:0}
    .dy-r em{font-style:normal;font-weight:700;white-space:nowrap}
    .dy-stars{display:flex;gap:2px}
    .dy-r>span.dy-stars,.dy-r>span.dy-moods{flex:none}
    .dy-stars button{border:0;background:none;padding:2px;cursor:pointer;color:#C9C4E6}
    .dy-stars button.on{color:#F5B301}
    .dy-stars svg{width:24px;height:24px}
    .dy-stars button.on svg{fill:#F5B301}
    .dy-moods{display:flex;gap:8px}
    .dy-moods button{width:42px;height:42px;border-radius:50%;border:2px solid transparent;background:var(--dy-soft);color:var(--t2);display:flex;align-items:center;justify-content:center;cursor:pointer}
    .dy-moods button.on{border-color:var(--dy-ac);color:var(--dy-ac);background:#fff}
    .dy-moods svg{width:24px;height:24px}
    .dy-audio{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-bottom:1px solid var(--dy-line)}
    .dy-audio:last-child{border-bottom:0}
    .dy-audio audio{width:100%;height:36px}
    .dy-audio p{margin:0;font-size:.88rem;color:var(--t2);font-style:italic}
    /* форма */
    .dy-f{display:flex;align-items:center;gap:10px;padding:0 14px;min-height:54px;border-radius:18px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow)}
    .dy-f svg{width:20px;height:20px;color:var(--dy-ac);flex-shrink:0}
    .dy-f input,.dy-f select{flex:1;min-width:0;border:0;background:transparent;color:var(--text);font:inherit;font-size:16px;outline:none;min-height:52px}
    .dy-ta{position:relative}
    .dy-ta textarea{width:100%;min-height:140px;border-radius:18px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow);padding:14px 50px 14px 14px;font:inherit;font-size:16px;color:var(--text);resize:vertical;outline:none;box-sizing:border-box}
    .dy-mic{position:absolute;right:8px;top:8px;width:38px;height:38px;border-radius:12px;border:0;background:var(--dy-soft);color:var(--dy-ac);display:flex;align-items:center;justify-content:center;cursor:pointer}
    .dy-mic.rec{background:#FFE4E6;color:#E5484D}
    .dy-mic svg{width:20px;height:20px}
    .dy-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .dy-grid>div{position:relative;aspect-ratio:1/.85;border-radius:16px;background:var(--dy-soft) center/cover no-repeat;display:flex;align-items:center;justify-content:center;color:var(--dy-ac)}
    .dy-grid>div svg{width:26px;height:26px}
    .dy-grid>div button{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:50%;border:0;background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer}
    .dy-grid>div button svg{width:14px;height:14px;color:#fff}
    .dy-grid>button{aspect-ratio:1/.85;border-radius:16px;border:0;background:var(--dy-soft);color:var(--dy-ac);display:flex;align-items:center;justify-content:center;cursor:pointer}
    .dy-grid>button svg{width:30px;height:30px}
    /* воспоминания */
    .dy-big{display:flex;align-items:center;gap:14px;padding:14px}
    .dy-big>span:first-child{width:46px;height:46px;border-radius:15px;background:var(--dy-soft);color:var(--dy-ac);display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .dy-big>span:first-child svg{width:24px;height:24px}
    .dy-big>span:nth-child(2){flex:1;min-width:0;font-weight:800}
    .dy-big small{display:block;color:var(--t2);font-weight:500;font-size:.82rem;margin-top:2px}
    .dy-big>svg:last-child{width:20px;height:20px;color:var(--t2)}
    .dy-h3{font-weight:800;font-size:1.12rem;margin:6px 2px -2px}
    .dy-gal{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
    .dy-gal button{aspect-ratio:1;border:0;border-radius:12px;background:var(--dy-soft) center/cover no-repeat;cursor:pointer;color:var(--dy-ac);display:flex;align-items:center;justify-content:center}
    .dy-map{height:230px;border-radius:22px;overflow:hidden}
    .dy-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .dy-stats div{padding:12px 6px;text-align:center}
    .dy-stats b{display:block;font-size:1.35rem;font-weight:800;color:var(--dy-ac)}
    .dy-stats span{font-size:.76rem;color:var(--t2)}
    .dy-story{padding:16px;line-height:1.6;white-space:pre-wrap;font-size:.97rem}
    .dy-story h4{margin:0 0 8px;font-size:1.1rem}
    .dy-btns{display:flex;gap:8px}
    .dy-btns .st-btn{flex:1}
    /* просмотр фото */
    .dy-lb{position:fixed;inset:0;z-index:9999;background:rgba(5,4,20,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:calc(var(--st) + 50px) 12px 20px}
    .dy-lb img,.dy-lb video{max-width:100%;max-height:68vh;border-radius:14px}
    .dy-lb input{margin-top:14px;width:min(560px,100%);border:0;border-radius:14px;padding:12px 14px;font:inherit;font-size:16px;background:rgba(255,255,255,.12);color:#fff;outline:none}
    .dy-lb .x{position:absolute;top:calc(var(--st) + 10px);right:12px;width:42px;height:42px;border-radius:50%;border:0;background:rgba(255,255,255,.14);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer}
    .dy-lb .nav{position:absolute;top:50%;width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.14);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer}
    .dy-lb .nav.l{left:8px}.dy-lb .nav.r{right:8px}
    .dy-lb .del{margin-top:10px;border:0;background:none;color:#FF8A8A;font:inherit;font-weight:700;cursor:pointer}
    .dy-list{max-height:min(55vh,460px);overflow-y:auto;margin:0 -4px}
    .dy-pick{display:flex;align-items:center;gap:12px;width:100%;border:0;border-bottom:1px solid var(--dy-line);background:none;font:inherit;color:var(--text);text-align:left;padding:12px 4px;cursor:pointer}
    .dy-pick span{flex:1;min-width:0}
    .dy-pick small{display:block;color:var(--t2);font-size:.8rem}
    .dy-pick svg{width:20px;height:20px;color:var(--dy-ac);flex-shrink:0}
    .dy-pick.on{background:var(--dy-soft);border-radius:12px}
    .dy-rec{display:flex;flex-direction:column;align-items:center;gap:12px;padding:12px 0}
    .dy-rec b{font-size:2rem;font-variant-numeric:tabular-nums}
    .dy-rec p{margin:0;color:var(--t2);font-style:italic;text-align:center;min-height:1.4em}
  `);

  // Нижнее окно внутри экрана модуля
  function sheet(title, html, bind) {
    document.getElementById('dy-sheet')?.remove();
    const ov = document.createElement('div'); ov.className = 'ov open'; ov.id = 'dy-sheet';
    ov.innerHTML = `<div class="mdl"><div class="mdl-handle"></div><div class="mdl-title">${esc(title)}</div>${html}</div>`;
    let done = false;
    const close = () => { if (done) return; done = true; ov.remove(); document.body.style.overflow = ''; ov._onclose && ov._onclose(); };
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    (document.getElementById('pg-module') || document.body).appendChild(ov);
    document.body.style.overflow = 'hidden';
    if (typeof initializeIcons === 'function') initializeIcons(ov);
    bind(ov.firstChild, close, ov);
    return close;
  }
  const icons = el => { if (typeof initializeIcons === 'function') initializeIcons(el); };

  // Leaflet — как в «Гиде» (бесплатная карта OSM)
  let leafletP = null;
  function leaflet() {
    if (window.L) return Promise.resolve(window.L);
    return leafletP || (leafletP = new Promise((ok, no) => {
      if (!document.getElementById('st-leaflet-css')) { const l = document.createElement('link'); l.id = 'st-leaflet-css'; l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(l); }
      const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = () => ok(window.L); s.onerror = () => { leafletP = null; no(new Error('map')); }; document.head.appendChild(s);
    }));
  }

  STHub.registerService('diary', ctx => {
    const trip = ctx.trip || {};
    let entries = ctx.store.get('entries', []);
    const save = () => ctx.store.set('entries', entries);
    let tab = 'days';
    const entryOf = d => entries.find(e => e.date === d);
    const getOrNew = d => entryOf(d) || { id: uid(), date: d, title: '', text: '', photos: [], audio: [], place: null, expenses: [], rating: 0, mood: '', author: ctx.me || '', createdAt: Date.now() };
    const put = e => { const i = entries.findIndex(x => x.id === e.id); e.updatedAt = Date.now(); if (i >= 0) entries[i] = e; else entries.push(e); entries.sort((a, b) => a.date.localeCompare(b.date)); save(); };

    // Дни поездки: даты из Календаря, иначе по записям, иначе сегодня
    function tripRange() {
      let r = null; try { r = JSON.parse(localStorage.getItem('st_mod_calendar_' + trip.id + '_dates') || 'null'); } catch (_) {}
      if (r && r.start) return { start: r.start, end: r.end || r.start };
      const ds = entries.map(e => e.date).sort();
      return ds.length ? { start: ds[0], end: ds[ds.length - 1] } : { start: today(), end: today() };
    }
    function days() {
      const r = tripRange(), out = [];
      for (let d = r.start, i = 0; d <= r.end && i < 120; d = addDay(d, 1), i++) out.push(d);
      entries.forEach(e => { if (!out.includes(e.date)) out.push(e.date); });
      return out.sort();
    }
    const dayN = d => days().indexOf(d) + 1;
    const dayLabel = d => { const n = dayN(d); return (n > 0 && d >= tripRange().start && d <= tripRange().end ? 'День ' + n + ' · ' : '') + short(d); };

    // Погода дня — из модуля «Погода» (если он уже открывался)
    function weatherOf(d) {
      try { const w = JSON.parse(localStorage.getItem('st_wx_days_' + trip.id) || 'null'); const x = w && w.days && w.days[d]; if (!x) return null;
        const c = x[0]; const icon = c === 0 || c === 1 ? 'sun' : c === 2 ? 'cloud-sun' : c === 3 ? 'cloud' : c <= 48 ? 'cloud-fog' : c <= 67 || (c >= 80 && c <= 82) ? 'cloud-rain' : c <= 86 ? 'cloud-snow' : 'cloud-lightning';
        return { icon, t: Math.round(x[1]) }; } catch (_) { return null; }
    }
    // Расходы ST (из основного приложения), без копирования
    const allExpenses = () => (typeof S !== 'undefined' && Array.isArray(S.expenses) ? S.expenses : []);
    const expDate = e => { const v = String(e.date || ''); if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10); const t = new Date(v); return isNaN(t) ? '' : isoOf(t); };
    const cur = () => (typeof S !== 'undefined' && S.trip && S.trip.currency) || trip.currency || 'EUR';
    const money = v => { try { return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: cur() }).format(v); } catch (_) { return (Math.round(v * 100) / 100) + ' ' + cur(); } };
    const linked = e => (e.expenses || []).map(id => allExpenses().find(x => x.id === id)).filter(Boolean);
    const expSum = list => list.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const tripPhoto = img => { if (window.STPlacePhoto && img) STPlacePhoto.tripImg(img, trip, { width: 900 }); };

    // ========== Экран 1: Дни / Воспоминания ==========
    function openList() {
      ctx.openScreen({
        title: 'Дневник',
        action: { icon: 'search', label: 'Поиск по дневнику', onClick: searchSheet },
        render(body, screen) {
          body.innerHTML = `
            <div class="dy-hero"><img src="/img/trips/abstract.jpg" alt=""><b>${esc(trip.name || 'Дневник')}</b>
              <div class="dy-seg"><button type="button" data-t="days" class="${tab === 'days' ? 'on' : ''}">Дни</button><button type="button" data-t="mem" class="${tab === 'mem' ? 'on' : ''}">Воспоминания</button></div></div>
            <div class="dy-modes"><button class="dy-mode on" type="button"><i data-lucide="lock"></i>Личный</button>
              <button class="dy-mode off" type="button" data-a="shared"><i data-lucide="users"></i>Общий · скоро</button></div>
            <div id="dy-c"></div>
            <button class="dy-fab" type="button" data-a="new" aria-label="Новая запись"><i data-lucide="plus"></i></button>`;
          tripPhoto(body.querySelector('.dy-hero img'));
          body.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.t; screen.refresh(); }));
          body.querySelector('[data-a="shared"]').addEventListener('click', () => ctx.toast('Общий дневник поездки появится после подключения общей базы — записи увидят все участники'));
          body.querySelector('[data-a="new"]').addEventListener('click', () => { const ds = days(); const t = today(); openForm(ds.includes(t) ? t : (ds.find(d => !entryOf(d)) || ds[ds.length - 1]), openList); });
          const c = body.querySelector('#dy-c');
          if (tab === 'days') renderDays(c); else renderMemories(c);
          icons(body); fillMedia(body);
        }
      });
    }
    function renderDays(c) {
      c.innerHTML = days().map(d => {
        const e = entryOf(d), ph = e && e.photos.find(p => p.type === 'photo'), vids = e ? e.photos.length : 0;
        const title = e ? (e.title || (e.place && e.place.name) || (e.text || '').split('\n')[0].slice(0, 60) || 'Запись без названия') : 'Добавить запись';
        const mood = e && MOODS.find(m => m.id === e.mood);
        return `<button class="dy-card dy-day" type="button" data-d="${d}" style="margin-bottom:12px">
          <span class="dy-th"${ph ? ` data-m="t_${ph.id}"` : ''}>${ph ? '' : `<i data-lucide="${e ? 'notebook-pen' : 'plus'}"></i>`}</span>
          <span class="dy-day-t"><b>${esc(dayLabel(d))}</b><span class="${e ? '' : 'empty'}">${esc(title)}</span>
            ${e ? `<span class="dy-meta">${vids ? `<span><i data-lucide="image"></i>${vids} фото</span>` : ''}${e.place ? '<span><i data-lucide="map-pin"></i></span>' : ''}${e.audio.length ? '<span><i data-lucide="mic"></i>' + e.audio.length + '</span>' : ''}${mood ? '<span>' + mood.em + '</span>' : ''}${e.rating ? '<span>★ ' + e.rating + '</span>' : ''}</span>` : ''}</span>
          <i data-lucide="chevron-right"></i></button>`;
      }).join('') || '<div class="dy-empty">Здесь появятся дни поездки</div>';
      c.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => entryOf(b.dataset.d) ? openDay(b.dataset.d) : openForm(b.dataset.d, openList)));
    }
    function allPhotos() { return entries.flatMap(e => e.photos.map(p => ({ p, e }))); }
    function renderMemories(c) {
      const ph = allPhotos(), places = entries.filter(e => e.place && e.place.lat != null);
      c.innerHTML = `
        <button class="dy-card dy-big" type="button" data-a="sum"><span><i data-lucide="book-heart"></i></span><span>Итоги путешествия<small>Цифровой альбом: лучшие фото, места и события</small></span><i data-lucide="chevron-right"></i></button>
        <button class="dy-card dy-big" type="button" data-a="story" style="margin-top:12px"><span><i data-lucide="sparkles"></i></span><span>Рассказ о поездке<small>Связный текст из ваших записей по дням</small></span><i data-lucide="chevron-right"></i></button>
        <button class="dy-card dy-big" type="button" data-a="pdf" style="margin-top:12px"><span><i data-lucide="file-down"></i></span><span>Экспорт в PDF<small>Дневник с фото и датами — «Сохранить как PDF»</small></span><i data-lucide="chevron-right"></i></button>
        ${places.length ? `<div class="dy-h3" style="margin-top:16px">Места на карте</div><div class="dy-card dy-map" id="dy-map" style="margin-top:10px"></div>` : ''}
        <div class="dy-h3" style="margin-top:16px">Фото и видео · ${ph.length}</div>
        <div class="dy-gal" style="margin-top:10px">${ph.map((x, i) => `<button type="button" data-g="${i}"${x.p.type === 'photo' ? ` data-m="t_${x.p.id}"` : ''}>${x.p.type === 'video' ? '<i data-lucide="play"></i>' : ''}</button>`).join('') || ''}</div>
        ${ph.length ? '' : '<div class="dy-empty">Добавьте фото в записи — они соберутся здесь</div>'}`;
      c.querySelector('[data-a="sum"]').addEventListener('click', openSummary);
      c.querySelector('[data-a="story"]').addEventListener('click', openStory);
      c.querySelector('[data-a="pdf"]').addEventListener('click', exportPdf);
      c.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => lightbox(ph.map(x => x.p), +b.dataset.g, () => { save(); })));
      if (places.length) drawMap(c.querySelector('#dy-map'), places);
    }
    async function drawMap(el, list) {
      try {
        const L = await leaflet(); if (!el.isConnected) return;
        const map = L.map(el, { zoomControl: false, attributionControl: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
        const pts = list.map(e => [e.place.lat, e.place.lon]);
        list.forEach((e, i) => L.marker(pts[i]).addTo(map).bindPopup(`<b>${esc(dayLabel(e.date))}</b><br>${esc(e.place.name)}`));
        if (pts.length > 1) L.polyline(pts, { color: '#6A4DF4', weight: 3, opacity: .7, dashArray: '6 6' }).addTo(map);
        if (pts.length === 1) map.setView(pts[0], 13); else map.fitBounds(pts, { padding: [28, 28] });
      } catch (_) { el.innerHTML = '<div class="dy-empty">Карта не загрузилась — нет интернета</div>'; }
    }

    // ========== Экран 2: день ==========
    function openDay(d, back) {
      const e = entryOf(d); if (!e) { openForm(d, back || openList); return; }
      ctx.openScreen({
        title: dayLabel(d).split(' · ')[0] || 'День',
        onBack: back || openList,
        action: [{ icon: 'pencil', label: 'Изменить', onClick: () => openForm(d, () => openDay(d, back)) }, { icon: 'more-vertical', label: 'Ещё', onClick: () => dayMenu(d, back) }],
        render(body, screen) {
          const ph = e.photos, first = ph.find(p => p.type === 'photo'), wx = weatherOf(d), ex = linked(e), mood = MOODS.find(m => m.id === e.mood);
          const strip = ph.slice(0, 3).map((p, i) => `<button type="button" data-g="${i}"${p.type === 'photo' ? ` data-m="t_${p.id}"` : ''}>${p.type === 'video' ? '<i data-lucide="play"></i>' : ''}${i === 2 && ph.length > 3 ? `<b>+${ph.length - 2}</b>` : ''}</button>`).join('');
          body.innerHTML = `
            <div class="dy-photo"${first ? ` data-m="m_${first.id}"` : ''}>${first ? '' : '<img src="/img/trips/abstract.jpg" alt="" style="width:100%;height:100%;object-fit:cover" id="dy-tp">'}</div>
            <div class="dy-card dy-head"><h3>${esc(dayLabel(d))}</h3>
              <div class="dy-head-row">${e.place ? `<span><i data-lucide="map-pin"></i>${esc(e.place.name)}</span>` : `<span style="color:var(--t3)">${esc(WD[parse(d).getDay()])}</span>`}${wx ? `<span class="wx"><i data-lucide="${wx.icon}"></i>${wx.t > 0 ? '+' : ''}${wx.t} °C</span>` : ''}</div>
              ${e.title ? `<div style="font-weight:800;margin-top:12px">${esc(e.title)}</div>` : ''}
              ${e.text ? `<div class="dy-text">${esc(e.text)}</div>` : '<div class="dy-text" style="color:var(--t2)">Нажмите ✎, чтобы написать, как прошёл день</div>'}</div>
            ${ph.length ? `<div class="dy-strip">${strip}</div>` : ''}
            <div class="dy-acts"><button class="dy-card dy-act" type="button" data-a="media"><i data-lucide="images"></i>Фото/Видео</button>
              <button class="dy-card dy-act" type="button" data-a="place"><i data-lucide="map-pin"></i>Место</button>
              <button class="dy-card dy-act" type="button" data-a="exp"><i data-lucide="coins"></i>Расход</button></div>
            <input type="file" id="dy-file" accept="image/*,video/*" multiple hidden>
            <button class="dy-voice" type="button" data-a="voice"><i data-lucide="mic"></i>Аудиозаметка</button>
            ${e.audio.length ? `<div class="dy-card">${e.audio.map((a, i) => `<div class="dy-audio"><audio controls preload="none" data-m="a_${a.id}"></audio>${a.text ? `<p>«${esc(a.text)}»</p>` : ''}<div style="display:flex;gap:14px;font-size:.8rem;font-weight:700"><span style="color:var(--t2)">${Math.round(a.dur || 0)} с</span>${a.text ? `<button type="button" data-tx="${i}" style="border:0;background:none;color:var(--dy-ac);font:inherit;cursor:pointer;padding:0">В текст записи</button>` : ''}<button type="button" data-rm="${i}" style="border:0;background:none;color:#E5484D;font:inherit;cursor:pointer;padding:0;margin-left:auto">Удалить</button></div></div>`).join('')}</div>` : ''}
            <div class="dy-card dy-rows">
              ${ex.length ? ex.map(x => `<div class="dy-r"><i data-lucide="receipt"></i><span>${esc(x.name || 'Расход')}<small>${esc(x.paidBy && x.paidBy !== '_treasury' ? 'платил ' + x.paidBy : 'из общей кассы')}</small></span><em>${esc(money(Number(x.amount) || 0))}</em></div>`).join('') + `<div class="dy-r"><i data-lucide="sigma"></i><span>Итого за день</span><em>${esc(money(expSum(ex)))}</em></div>` : ''}
              <div class="dy-r"><i data-lucide="star"></i><span>Оценка дня</span><span class="dy-stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-st="${n}" class="${n <= (e.rating || 0) ? 'on' : ''}" aria-label="${n}"><i data-lucide="star"></i></button>`).join('')}</span></div>
              <div class="dy-r"><i data-lucide="smile-plus"></i><span>Настроение${mood ? `<small>${mood.name}</small>` : ''}</span><span class="dy-moods">${MOODS.map(m => `<button type="button" data-md="${m.id}" class="${m.id === e.mood ? 'on' : ''}" aria-label="${m.name}"><i data-lucide="${m.icon}"></i></button>`).join('')}</span></div>
            </div>`;
          if (!first) tripPhoto(body.querySelector('#dy-tp'));
          fillMedia(body);
          const re = () => { put(e); screen.refresh(); };
          body.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => lightbox(ph, +b.dataset.g, re)));
          const fileIn = body.querySelector('#dy-file');
          body.querySelector('[data-a="media"]').addEventListener('click', () => fileIn.click());
          fileIn.addEventListener('change', () => addFiles(e, fileIn.files).then(re));
          body.querySelector('[data-a="place"]').addEventListener('click', () => placeSheet(e, re));
          body.querySelector('[data-a="exp"]').addEventListener('click', () => expenseSheet(e, re));
          body.querySelector('[data-a="voice"]').addEventListener('click', () => voiceSheet(e, re));
          body.querySelectorAll('[data-st]').forEach(b => b.addEventListener('click', () => { e.rating = +b.dataset.st === e.rating ? 0 : +b.dataset.st; re(); }));
          body.querySelectorAll('[data-md]').forEach(b => b.addEventListener('click', () => { e.mood = e.mood === b.dataset.md ? '' : b.dataset.md; re(); }));
          body.querySelectorAll('[data-tx]').forEach(b => b.addEventListener('click', () => { const a = e.audio[+b.dataset.tx]; e.text = (e.text ? e.text.trim() + '\n' : '') + a.text; re(); ctx.toast('Текст добавлен в запись'); }));
          body.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { if (!confirm('Удалить аудиозаметку?')) return; const a = e.audio.splice(+b.dataset.rm, 1)[0]; DB.del('a_' + a.id).catch(() => {}); re(); }));
        }
      });
    }
    function dayMenu(d, back) {
      const e = entryOf(d);
      sheet(dayLabel(d), `<div class="bk-form" style="margin-top:8px;display:flex;flex-direction:column;gap:8px">
          <button class="st-btn st-btn-g st-btn-fw" data-a="share"><i data-lucide="share-2"></i>Поделиться днём</button>
          <button class="st-btn st-btn-g st-btn-fw" data-a="del" style="color:#E5484D"><i data-lucide="trash-2"></i>Удалить запись</button></div>`, (root, close) => {
        root.querySelector('[data-a="share"]').addEventListener('click', () => { close(); share(dayStory(e), dayLabel(d)); });
        root.querySelector('[data-a="del"]').addEventListener('click', () => {
          if (!confirm('Удалить запись за ' + long(d) + ' вместе с фото и аудио?')) return;
          e.photos.forEach(p => { DB.del('m_' + p.id).catch(() => {}); DB.del('t_' + p.id).catch(() => {}); });
          e.audio.forEach(a => DB.del('a_' + a.id).catch(() => {}));
          entries = entries.filter(x => x !== e); save(); close(); ctx.toast('Запись удалена'); (back || openList)();
        });
      });
    }

    // ========== Экран 3: новая запись / изменить ==========
    function openForm(d, back) {
      const src = entryOf(d), isNew = !src;
      const draft = JSON.parse(JSON.stringify(getOrNew(d)));
      let rec = null;
      ctx.openScreen({
        title: isNew ? 'Новая запись' : 'Изменить запись',
        onBack: () => { stopRec(); back(); },
        action: { icon: 'check', label: 'Сохранить', onClick: () => submit() },
        render(body, screen) {
          const ds = days();
          body.innerHTML = `
            <div class="dy-f"><i data-lucide="calendar"></i><select id="dy-d">${ds.map(x => `<option value="${x}"${x === draft.date ? ' selected' : ''}>${esc(dayLabel(x))}${entryOf(x) && x !== d ? ' · есть запись' : ''}</option>`).join('')}</select></div>
            <div class="dy-f"><i data-lucide="type"></i><input id="dy-title" maxlength="80" placeholder="Заголовок дня, например «Великая стена»" value="${esc(draft.title)}"></div>
            <div class="dy-ta"><textarea id="dy-text" placeholder="Что сегодня произошло?">${esc(draft.text)}</textarea>
              <button class="dy-mic" type="button" data-a="dict" aria-label="Диктовать"><i data-lucide="mic"></i></button></div>
            <div class="dy-grid">${draft.photos.map((p, i) => `<div${p.type === 'photo' ? ` data-m="t_${p.id}"` : ''}>${p.type === 'video' ? '<i data-lucide="film"></i>' : ''}<button type="button" data-x="${i}" aria-label="Убрать"><i data-lucide="x"></i></button></div>`).join('')}<button type="button" data-a="add" aria-label="Добавить фото или видео"><i data-lucide="plus"></i></button></div>
            <input type="file" id="dy-file" accept="image/*,video/*" multiple hidden>
            <div class="dy-card dy-rows">
              <button class="dy-r" type="button" data-a="place"><i data-lucide="map-pin"></i><span>${draft.place ? esc(draft.place.name) : 'Добавить место'}${draft.place ? '<small>Нажмите, чтобы изменить</small>' : ''}</span><i data-lucide="chevron-right"></i></button>
              <button class="dy-r" type="button" data-a="exp"><i data-lucide="coins"></i><span>${draft.expenses.length ? 'Расходы: ' + draft.expenses.length : 'Добавить расход'}${draft.expenses.length ? `<small>${esc(money(expSum(linked(draft))))}</small>` : ''}</span><i data-lucide="chevron-right"></i></button>
              <div class="dy-r"><i data-lucide="star"></i><span>Оценка дня</span><span class="dy-stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-st="${n}" class="${n <= draft.rating ? 'on' : ''}" aria-label="${n}"><i data-lucide="star"></i></button>`).join('')}</span></div>
              <div class="dy-r"><i data-lucide="smile-plus"></i><span>Настроение</span><span class="dy-moods">${MOODS.map(m => `<button type="button" data-md="${m.id}" class="${m.id === draft.mood ? 'on' : ''}" aria-label="${m.name}"><i data-lucide="${m.icon}"></i></button>`).join('')}</span></div>
            </div>
            <button class="st-btn st-btn-fw" type="button" data-a="save">${isNew ? 'Сохранить запись' : 'Сохранить'}</button>`;
          fillMedia(body);
          const v = id => body.querySelector('#' + id);
          const read = () => { draft.title = v('dy-title').value.trim(); draft.text = v('dy-text').value; };
          const re = () => { read(); screen.refresh(); };
          v('dy-d').addEventListener('change', ev => {
            const nd = ev.target.value, ex = entryOf(nd);
            if (ex && ex.id !== draft.id) { if (!confirm('За ' + long(nd) + ' уже есть запись. Открыть её?')) { ev.target.value = draft.date; return; } stopRec(); openForm(nd, back); return; }
            draft.date = nd;
          });
          const fileIn = v('dy-file');
          body.querySelector('[data-a="add"]').addEventListener('click', () => fileIn.click());
          fileIn.addEventListener('change', () => { read(); addFiles(draft, fileIn.files).then(() => screen.refresh()); });
          body.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => { read(); draft.photos.splice(+b.dataset.x, 1); screen.refresh(); }));
          body.querySelector('[data-a="place"]').addEventListener('click', () => { read(); placeSheet(draft, () => screen.refresh()); });
          body.querySelector('[data-a="exp"]').addEventListener('click', () => { read(); expenseSheet(draft, () => screen.refresh()); });
          body.querySelectorAll('[data-st]').forEach(b => b.addEventListener('click', () => { draft.rating = +b.dataset.st === draft.rating ? 0 : +b.dataset.st; re(); }));
          body.querySelectorAll('[data-md]').forEach(b => b.addEventListener('click', () => { draft.mood = draft.mood === b.dataset.md ? '' : b.dataset.md; re(); }));
          body.querySelector('[data-a="save"]').addEventListener('click', () => submit());
          // диктовка текста (распознавание речи браузера, бесплатно)
          const mic = body.querySelector('[data-a="dict"]');
          mic.addEventListener('click', () => {
            if (rec) { stopRec(); return; }
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SR) { ctx.toast('Этот браузер не умеет распознавать речь — используйте «Аудиозаметку» на странице дня'); return; }
            const ta = v('dy-text'), base = ta.value ? ta.value.replace(/\s*$/, ' ') : '';
            rec = new SR(); rec.lang = 'ru-RU'; rec.continuous = true; rec.interimResults = true;
            rec.onresult = ev => { let t = ''; for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; ta.value = base + t; };
            rec.onend = () => { rec = null; mic.classList.remove('rec'); };
            rec.onerror = ev => { if (ev.error === 'not-allowed') ctx.toast('Разрешите доступ к микрофону'); };
            try { rec.start(); mic.classList.add('rec'); ctx.toast('Говорите — текст появится в записи'); } catch (_) { rec = null; }
          });
          screen._read = read;
          submit._read = read;
        }
      });
      function stopRec() { if (rec) { try { rec.stop(); } catch (_) {} rec = null; } }
      function submit() {
        submit._read && submit._read(); stopRec();
        const empty = !draft.title && !draft.text.trim() && !draft.photos.length && !draft.place && !draft.expenses.length && !draft.rating && !draft.mood && !draft.audio.length;
        if (empty) { ctx.toast('Напишите хоть пару слов или добавьте фото'); return; }
        // фото, которые убрали из записи, — удалить из хранилища
        if (src) src.photos.filter(p => !draft.photos.some(x => x.id === p.id)).forEach(p => { DB.del('m_' + p.id).catch(() => {}); DB.del('t_' + p.id).catch(() => {}); });
        if (src) entries = entries.filter(x => x.id !== src.id);
        put(draft); ctx.toast(isNew ? 'Запись сохранена' : 'Сохранено'); openDay(draft.date, openList);
      }
    }

    async function addFiles(e, files) {
      const list = [...(files || [])]; if (!list.length) return;
      let bad = 0;
      ctx.toast(list.length > 1 ? 'Добавляю ' + list.length + ' файла…' : 'Добавляю…');
      for (const f of list) { try { e.photos.push(await saveMedia(f)); } catch (err) { bad++; } }
      if (bad) ctx.toast(bad + ' ' + plural(bad, 'файл не добавлен', 'файла не добавлены', 'файлов не добавлено') + ' (видео до 60 МБ)');
    }

    // ---------- Просмотр фото/видео с подписью ----------
    function lightbox(list, i, onChange) {
      if (!list.length) return;
      const ov = document.createElement('div'); ov.className = 'dy-lb';
      const show = () => {
        const p = list[i];
        ov.innerHTML = `<button class="x" type="button" aria-label="Закрыть"><i data-lucide="x"></i></button>
          ${list.length > 1 ? '<button class="nav l" type="button" aria-label="Назад"><i data-lucide="chevron-left"></i></button><button class="nav r" type="button" aria-label="Дальше"><i data-lucide="chevron-right"></i></button>' : ''}
          ${p.type === 'video' ? `<video controls playsinline data-m="m_${p.id}"></video>` : `<img alt="" data-m="m_${p.id}">`}
          <input placeholder="Подпись к фото" maxlength="140" value="${esc(p.cap || '')}">
          <div style="color:rgba(255,255,255,.6);font-size:.8rem;margin-top:8px">${i + 1} / ${list.length}</div>`;
        icons(ov); fillMedia(ov);
        ov.querySelector('.x').addEventListener('click', closeLb);
        ov.querySelector('.l')?.addEventListener('click', () => { keep(); i = (i - 1 + list.length) % list.length; show(); });
        ov.querySelector('.r')?.addEventListener('click', () => { keep(); i = (i + 1) % list.length; show(); });
      };
      const keep = () => { const inp = ov.querySelector('input'); if (inp && inp.value !== (list[i].cap || '')) { list[i].cap = inp.value.trim(); changed = true; } };
      let changed = false;
      const closeLb = () => { keep(); ov.remove(); if (changed) { onChange && onChange(); } };
      document.body.appendChild(ov); show();
    }

    // ---------- Место ----------
    function placeSheet(e, done) {
      let saved = []; try { saved = JSON.parse(localStorage.getItem('st_mod_guide_' + trip.id + '_saved') || '[]'); } catch (_) {}
      sheet('Место', `<div class="dy-f" style="margin:6px 0 10px"><i data-lucide="search"></i><input id="dy-pq" placeholder="Достопримечательность, адрес, город" autocomplete="off"></div>
        <div class="dy-list" id="dy-pl">
          <button class="dy-pick" type="button" data-a="here"><i data-lucide="navigation"></i><span>Моё местоположение<small>Определить по GPS</small></span></button>
          ${saved.length ? saved.slice(0, 20).map((p, k) => `<button class="dy-pick" type="button" data-s="${k}"><i data-lucide="bookmark"></i><span>${esc(p.name)}<small>Из «Гида» · мой план</small></span></button>`).join('') : ''}
          ${e.place ? '<button class="dy-pick" type="button" data-a="clear" style="color:#E5484D"><i data-lucide="x" style="color:#E5484D"></i><span>Убрать место</span></button>' : ''}
        </div>`, (root, close) => {
        const pick = p => { e.place = p; close(); done(); };
        root.querySelector('[data-a="here"]').addEventListener('click', () => {
          if (!navigator.geolocation) { ctx.toast('Геолокация недоступна'); return; }
          ctx.toast('Определяю место…');
          navigator.geolocation.getCurrentPosition(async pos => {
            const lat = pos.coords.latitude, lon = pos.coords.longitude; let name = 'Моё место';
            try { const j = await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&accept-language=ru&zoom=17&lat=${lat}&lon=${lon}`)).json();
              const a = j.address || {}; name = j.name || [a.road, a.city || a.town || a.village].filter(Boolean).join(', ') || name; } catch (_) {}
            pick({ name, lat, lon });
          }, () => ctx.toast('Не получилось определить место — разрешите доступ к геолокации'), { timeout: 12000 });
        });
        root.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => { const p = saved[+b.dataset.s]; pick({ name: p.name, lat: p.lat, lon: p.lon }); }));
        root.querySelector('[data-a="clear"]')?.addEventListener('click', () => pick(null));
        const q = root.querySelector('#dy-pq'), pl = root.querySelector('#dy-pl'); let timer = null, seq = 0;
        q.addEventListener('input', () => {
          clearTimeout(timer); const s = q.value.trim(); if (s.length < 3) return;
          timer = setTimeout(async () => {
            const my = ++seq;
            try {
              const j = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=8&accept-language=ru&q=${encodeURIComponent(s)}`)).json();
              if (my !== seq) return;
              pl.innerHTML = (j.length ? j.map((r, k) => `<button class="dy-pick" type="button" data-r="${k}"><i data-lucide="map-pin"></i><span>${esc(r.name || r.display_name.split(',')[0])}<small>${esc(r.display_name.split(',').slice(1, 4).join(',').trim())}</small></span></button>`).join('')
                : '<div class="dy-empty">Ничего не найдено</div>') + `<button class="dy-pick" type="button" data-a="txt"><i data-lucide="type"></i><span>Сохранить как текст: «${esc(s)}»</span></button>`;
              icons(pl);
              pl.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => { const r = j[+b.dataset.r]; pick({ name: r.name || r.display_name.split(',')[0], lat: +r.lat, lon: +r.lon }); }));
              pl.querySelector('[data-a="txt"]').addEventListener('click', () => pick({ name: s, lat: null, lon: null }));
            } catch (_) { pl.innerHTML = `<button class="dy-pick" type="button" data-a="txt"><i data-lucide="type"></i><span>Нет связи. Сохранить как текст: «${esc(s)}»</span></button>`; icons(pl); pl.querySelector('[data-a="txt"]').addEventListener('click', () => pick({ name: s, lat: null, lon: null })); }
          }, 600);
        });
      });
    }

    // ---------- Расходы ST: только ссылки на существующие ----------
    function expenseSheet(e, done) {
      const all = allExpenses();
      if (!all.length) { ctx.toast('В поездке пока нет расходов. Добавьте их в «Расходах» — потом привяжите к дню'); return; }
      const sel = new Set(e.expenses || []);
      const same = all.filter(x => expDate(x) === e.date), other = all.filter(x => expDate(x) !== e.date).sort((a, b) => expDate(b).localeCompare(expDate(a)));
      const row = x => `<button class="dy-pick${sel.has(x.id) ? ' on' : ''}" type="button" data-x="${esc(x.id)}"><i data-lucide="${sel.has(x.id) ? 'check-circle-2' : 'circle'}"></i><span>${esc(x.name || 'Расход')}<small>${esc(expDate(x) ? short(expDate(x)) : '')}${x.comment ? ' · ' + esc(x.comment) : ''}</small></span><b>${esc(money(Number(x.amount) || 0))}</b></button>`;
      sheet('Расходы дня', `<div class="st-muted" style="font-size:.84rem;margin:2px 0 8px">Выберите уже записанные расходы — они не копируются, а только связываются с днём.</div>
        <div class="dy-list">${same.length ? '<div class="dy-h3" style="font-size:.9rem;margin:6px 4px">В этот день</div>' + same.map(row).join('') : ''}
        ${other.length ? '<div class="dy-h3" style="font-size:.9rem;margin:12px 4px 6px">Другие дни</div>' + other.map(row).join('') : ''}</div>
        <button class="st-btn st-btn-fw" type="button" data-a="ok" style="margin-top:10px">Готово</button>`, (root, close) => {
        root.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => {
          const id = b.dataset.x; sel.has(id) ? sel.delete(id) : sel.add(id);
          b.classList.toggle('on', sel.has(id)); b.querySelector('svg, i').outerHTML = `<i data-lucide="${sel.has(id) ? 'check-circle-2' : 'circle'}"></i>`; icons(b);
        }));
        root.querySelector('[data-a="ok"]').addEventListener('click', () => { e.expenses = [...sel]; close(); done(); });
      });
    }

    // ---------- Голосовая заметка: запись + расшифровка речи ----------
    function voiceSheet(e, done) {
      if (!navigator.mediaDevices || !window.MediaRecorder) { ctx.toast('Запись звука в этом браузере недоступна'); return; }
      let mr = null, chunks = [], t0 = 0, timer = null, sr = null, text = '', stream = null;
      const close = sheet('Аудиозаметка', `<div class="dy-rec"><b id="dy-tm">0:00</b><p id="dy-tt">Нажмите «Начать» и расскажите о дне</p>
          <button class="st-btn st-btn-fw" type="button" data-a="go"><i data-lucide="mic"></i>Начать запись</button></div>`, (root) => {
        const go = root.querySelector('[data-a="go"]'), tm = root.querySelector('#dy-tm'), tt = root.querySelector('#dy-tt');
        go.addEventListener('click', async () => {
          if (mr) { mr.stop(); return; }
          try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (_) { ctx.toast('Разрешите доступ к микрофону'); return; }
          mr = new MediaRecorder(stream); chunks = [];
          mr.ondataavailable = ev => ev.data.size && chunks.push(ev.data);
          mr.onstop = async () => {
            clearInterval(timer); stream.getTracks().forEach(t => t.stop()); if (sr) { try { sr.stop(); } catch (_) {} }
            const dur = (Date.now() - t0) / 1000; if (dur < 1) { close(); return; }
            const id = uid(); await DB.put('a_' + id, new Blob(chunks, { type: mr.mimeType || 'audio/webm' }));
            setTimeout(() => { e.audio.push({ id, dur, text: text.trim() }); put(e); close(); done(); ctx.toast(text.trim() ? 'Заметка сохранена, текст расшифрован' : 'Аудиозаметка сохранена'); }, 400);
          };
          mr.start(); t0 = Date.now(); go.innerHTML = '<i data-lucide="square"></i>Остановить'; icons(go); root.closest('.ov') && root.parentNode.classList.add('rec');
          timer = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); tm.textContent = Math.floor(s / 60) + ':' + pad(s % 60); }, 500);
          const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
          if (SR) { try { sr = new SR(); sr.lang = 'ru-RU'; sr.continuous = true; sr.interimResults = true;
            sr.onresult = ev => { let t = ''; for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; text = t; tt.textContent = t || '…'; };
            sr.start(); tt.textContent = 'Слушаю…'; } catch (_) { tt.textContent = 'Запись идёт (расшифровка недоступна)'; } }
          else tt.textContent = 'Запись идёт (расшифровка недоступна в этом браузере)';
        });
      });
    }

    // ---------- Рассказ о поездке (умный шаблон) ----------
    function dayStory(e) {
      const parts = [], wx = weatherOf(e.date), ex = linked(e), mood = MOODS.find(m => m.id === e.mood);
      if (e.place) parts.push((e.title && e.title !== e.place.name ? e.title + '. ' : '') + 'Мы были здесь: ' + e.place.name + '.');
      else if (e.title) parts.push(e.title + '.');
      if (e.text) parts.push(e.text.trim());
      e.audio.filter(a => a.text).forEach(a => parts.push('«' + a.text.trim() + '»'));
      if (wx) parts.push('Погода: ' + (wx.t > 0 ? '+' : '') + wx.t + ' °C.');
      const caps = e.photos.map(p => p.cap).filter(Boolean); if (caps.length) parts.push('На фото: ' + caps.join('; ') + '.');
      if (ex.length) parts.push('Расходы дня: ' + money(expSum(ex)) + ' (' + ex.map(x => x.name).filter(Boolean).slice(0, 4).join(', ') + ').');
      if (mood || e.rating) { const s = [mood ? 'настроение — ' + mood.name.toLowerCase() : '', e.rating ? 'оценка дня ' + '★'.repeat(e.rating) : ''].filter(Boolean).join(', '); parts.push(s.charAt(0).toUpperCase() + s.slice(1) + '.'); }
      return dayLabel(e.date) + (e.date ? ', ' + WD[parse(e.date).getDay()] : '') + '\n' + parts.join(' ');
    }
    function storyText() {
      const es = entries.filter(e => e.date).sort((a, b) => a.date.localeCompare(b.date));
      if (!es.length) return '';
      const places = [...new Set(es.filter(e => e.place).map(e => e.place.name))], photos = es.reduce((s, e) => s + e.photos.length, 0);
      const r = tripRange(), nDays = days().length;
      const best = es.filter(e => e.rating).sort((a, b) => b.rating - a.rating)[0];
      const allEx = es.flatMap(linked);
      let t = `${trip.name || 'Наше путешествие'}\n${long(r.start)} — ${long(r.end)}: ${nDays} ${plural(nDays, 'день', 'дня', 'дней')}, ${places.length} ${plural(places.length, 'место', 'места', 'мест')}, ${photos} фото.\n\n`;
      t += es.map(dayStory).join('\n\n');
      t += '\n\n' + [best ? `Лучший день — ${dayLabel(best.date)}${best.place ? ' (' + best.place.name + ')' : ''}.` : '',
        places.length ? 'Мы побывали: ' + places.slice(0, 12).join(', ') + '.' : '',
        allEx.length ? 'Отмеченные в дневнике расходы: ' + money(expSum(allEx)) + '.' : ''].filter(Boolean).join(' ');
      return t.trim();
    }
    function share(text, title) {
      if (navigator.share) { navigator.share({ title: title || 'Дневник путешествия', text }).catch(() => {}); return; }
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => ctx.toast('Текст скопирован'), () => ctx.toast('Не получилось скопировать'));
    }
    function openStory() {
      ctx.openScreen({
        title: 'Рассказ о поездке', onBack: () => { tab = 'mem'; openList(); },
        render(body) {
          const t = storyText();
          body.innerHTML = t ? `<div class="dy-card dy-story"><h4><i data-lucide="sparkles" style="width:18px;height:18px;color:var(--dy-ac);vertical-align:-3px"></i> Ваша история</h4>${esc(t)}</div>
            <div class="dy-btns"><button class="st-btn st-btn-g" type="button" data-a="copy"><i data-lucide="copy"></i>Копировать</button><button class="st-btn" type="button" data-a="share"><i data-lucide="share-2"></i>Поделиться</button></div>
            <div class="st-muted" style="font-size:.8rem;text-align:center">Рассказ собран из ваших записей, мест, погоды, настроения и расходов. Чем больше записей — тем интереснее история.</div>`
            : '<div class="dy-empty">Добавьте хотя бы одну запись — и здесь появится рассказ о поездке</div>';
          body.querySelector('[data-a="copy"]')?.addEventListener('click', () => (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => ctx.toast('Скопировано'), () => ctx.toast('Не получилось скопировать')));
          body.querySelector('[data-a="share"]')?.addEventListener('click', () => share(t));
        }
      });
    }

    // ---------- Итоги путешествия (цифровой альбом) ----------
    function openSummary() {
      ctx.openScreen({
        title: 'Итоги путешествия', onBack: () => { tab = 'mem'; openList(); },
        render(body) {
          const es = entries, ph = allPhotos(), places = es.filter(e => e.place), allEx = es.flatMap(linked);
          const rated = es.filter(e => e.rating), avg = rated.length ? rated.reduce((s, e) => s + e.rating, 0) / rated.length : 0;
          const moods = MOODS.map(m => ({ m, n: es.filter(e => e.mood === m.id).length })).filter(x => x.n);
          const cover = ph.find(x => x.p.type === 'photo'), best = es.filter(e => e.rating).sort((a, b) => b.rating - a.rating)[0];
          const picks = es.map(e => e.photos.find(p => p.type === 'photo')).filter(Boolean).slice(0, 9);
          body.innerHTML = `
            <div class="dy-photo" style="height:200px"${cover ? ` data-m="m_${cover.p.id}"` : ''}>${cover ? '' : '<img src="/img/trips/abstract.jpg" alt="" style="width:100%;height:100%;object-fit:cover" id="dy-tp">'}</div>
            <div class="dy-card dy-head"><h3>${esc(trip.name || 'Путешествие')}</h3><div class="dy-head-row"><span><i data-lucide="calendar"></i>${esc(long(tripRange().start))} — ${esc(long(tripRange().end))}</span></div></div>
            <div class="dy-stats"><div class="dy-card"><b>${days().length}</b><span>дней</span></div><div class="dy-card"><b>${es.length}</b><span>записей</span></div><div class="dy-card"><b>${ph.length}</b><span>фото и видео</span></div>
              <div class="dy-card"><b>${new Set(places.map(e => e.place.name)).size}</b><span>мест</span></div><div class="dy-card"><b>${avg ? avg.toFixed(1) : '—'}</b><span>средняя оценка</span></div><div class="dy-card"><b style="font-size:1.05rem">${allEx.length ? esc(money(expSum(allEx))) : '—'}</b><span>расходы в дневнике</span></div></div>
            ${moods.length ? `<div class="dy-card dy-rows"><div class="dy-r"><i data-lucide="smile-plus"></i><span>Настроение поездки</span><em>${moods.map(x => x.m.em + ' ' + x.n).join('  ')}</em></div>${best ? `<button class="dy-r" type="button" data-d="${best.date}"><i data-lucide="trophy"></i><span>Лучший день<small>${esc(dayLabel(best.date))}${best.place ? ' · ' + esc(best.place.name) : ''}</small></span><i data-lucide="chevron-right"></i></button>` : ''}</div>` : ''}
            ${picks.length ? `<div class="dy-h3">Лучшие фото</div><div class="dy-gal">${picks.map((p, i) => `<button type="button" data-g="${i}" data-m="t_${p.id}"></button>`).join('')}</div>` : ''}
            ${places.some(e => e.place.lat != null) ? '<div class="dy-h3">Маршрут поездки</div><div class="dy-card dy-map" id="dy-map"></div>' : ''}
            <div class="dy-btns"><button class="st-btn st-btn-g" type="button" data-a="story"><i data-lucide="sparkles"></i>Рассказ</button><button class="st-btn" type="button" data-a="pdf"><i data-lucide="file-down"></i>PDF</button></div>`;
          if (!cover) tripPhoto(body.querySelector('#dy-tp'));
          fillMedia(body);
          body.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => lightbox(picks, +b.dataset.g, save)));
          body.querySelector('[data-d]')?.addEventListener('click', ev => openDay(ev.currentTarget.dataset.d, openSummary));
          body.querySelector('[data-a="story"]').addEventListener('click', openStory);
          body.querySelector('[data-a="pdf"]').addEventListener('click', exportPdf);
          const m = body.querySelector('#dy-map'); if (m) drawMap(m, places.filter(e => e.place.lat != null));
        }
      });
    }

    // ---------- Экспорт в PDF (печать браузера → «Сохранить как PDF») ----------
    async function exportPdf() {
      const es = entries.slice().sort((a, b) => a.date.localeCompare(b.date));
      if (!es.length) { ctx.toast('Сначала добавьте записи'); return; }
      ctx.toast('Готовлю PDF…');
      const imgs = {};
      for (const e of es) for (const p of e.photos.filter(x => x.type === 'photo').slice(0, 6)) imgs[p.id] = await urlOf('m_' + p.id);
      const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(trip.name || 'Дневник')}</title><style>
        body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2937;margin:0;padding:24px}
        h1{font-size:26px;margin:0 0 4px;color:#4a42d6} .sub{color:#6b7280;margin-bottom:22px}
        .day{page-break-inside:avoid;break-inside:avoid;border-top:2px solid #ece9ff;padding:16px 0}
        h2{font-size:18px;margin:0 0 4px} .meta{color:#6b7280;font-size:13px;margin-bottom:8px}
        p{white-space:pre-wrap;line-height:1.5;margin:6px 0} .ph{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}
        .ph figure{margin:0} .ph img{width:100%;height:150px;object-fit:cover;border-radius:8px} figcaption{font-size:11px;color:#6b7280;margin-top:2px}
        @page{margin:14mm}</style></head><body>
        <h1>${esc(trip.name || 'Дневник путешествия')}</h1><div class="sub">${esc(long(tripRange().start))} — ${esc(long(tripRange().end))} · Splitaway Team</div>
        ${es.map(e => { const mood = MOODS.find(m => m.id === e.mood), ex = linked(e);
          return `<div class="day"><h2>${esc(dayLabel(e.date))}${e.title ? ' — ' + esc(e.title) : ''}</h2>
            <div class="meta">${[WD[parse(e.date).getDay()], e.place && e.place.name, e.rating ? '★'.repeat(e.rating) : '', mood && mood.em + ' ' + mood.name, ex.length ? 'расходы: ' + money(expSum(ex)) : ''].filter(Boolean).map(esc).join(' · ')}</div>
            ${e.text ? `<p>${esc(e.text)}</p>` : ''}${e.audio.filter(a => a.text).map(a => `<p><i>«${esc(a.text)}»</i></p>`).join('')}
            ${e.photos.some(p => imgs[p.id]) ? `<div class="ph">${e.photos.filter(p => imgs[p.id]).map(p => `<figure><img src="${imgs[p.id]}">${p.cap ? `<figcaption>${esc(p.cap)}</figcaption>` : ''}</figure>`).join('')}</div>` : ''}</div>`; }).join('')}
        </body></html>`;
      const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      document.body.appendChild(fr);
      const doc = fr.contentWindow.document; doc.open(); doc.write(html); doc.close();
      const go = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (_) { ctx.toast('Печать недоступна на этом устройстве'); } setTimeout(() => fr.remove(), 60000); };
      const im = [...doc.images]; let left = im.length; if (!left) setTimeout(go, 300); else im.forEach(i => { if (i.complete) { if (--left === 0) go(); } else i.onload = i.onerror = () => { if (--left === 0) go(); }; });
      ctx.toast('В окне печати выберите «Сохранить как PDF»');
    }

    // ---------- Поиск по дневнику ----------
    function searchSheet() {
      sheet('Поиск по дневнику', `<div class="dy-f" style="margin:6px 0 10px"><i data-lucide="search"></i><input id="dy-sq" placeholder="Слово, место, подпись к фото" autocomplete="off"></div><div class="dy-list" id="dy-sl"></div>`, (root, close) => {
        const q = root.querySelector('#dy-sq'), out = root.querySelector('#dy-sl');
        const run = () => {
          const s = q.value.trim().toLowerCase();
          const hit = !s ? [] : entries.filter(e => [e.title, e.text, e.place && e.place.name, ...e.photos.map(p => p.cap), ...e.audio.map(a => a.text)].filter(Boolean).join(' ').toLowerCase().includes(s));
          out.innerHTML = s ? (hit.map(e => `<button class="dy-pick" type="button" data-d="${e.date}"><i data-lucide="notebook-pen"></i><span>${esc(dayLabel(e.date))}<small>${esc(e.title || (e.text || '').slice(0, 80))}</small></span></button>`).join('') || '<div class="dy-empty">Ничего не найдено</div>') : '';
          icons(out); out.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => { close(); openDay(b.dataset.d); }));
        };
        q.addEventListener('input', run); setTimeout(() => q.focus(), 50);
      });
    }

    openList();
  });
})();
