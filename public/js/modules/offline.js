// ============================================================
// Модуль «Офлайн» (id: 'offline')
// Один центр подготовки к поездке без интернета. Честно показывает статус каждой части:
// «Скачано», «Требуется загрузка» или «Только онлайн».
//   • Приложение — все экраны, картинки и библиотеки (кэш st-offline-assets);
//   • Карты — район города поездки из OpenStreetMap (кэш st-offline-maps, умеренно: до масштаба 16);
//   • Переводчик — языковые пакеты (через window.STTranslator);
//   • Документы, маршруты, экстренные номера — уже хранятся на телефоне;
//   • Синхронизация — расходы отправятся сами, когда появится сеть (sbSync из index.html).
// Отдаёт сохранённое без сети service worker (public/sw.js).
// ============================================================
(function () {
  'use strict';
  if (!window.STHub) return;

  const ID = 'offline';
  const IMG = '/img/offline/';
  const ASSETS = 'st-offline-assets', MAPS = 'st-offline-maps';
  const TILE = 'https://tile.openstreetmap.org/';
  const LEAFLET = 'https://' + ['unpkg', 'com'].join('.') + '/leaflet@1.9.4/dist/';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ui = value => window.STModuleUI?.translate(value) || value;
  const icons = el => { if (typeof initializeIcons === 'function') initializeIcons(el); };
  const online = () => navigator.onLine !== false;
  const hasCaches = () => 'caches' in window;
  const lsJSON = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
  const META = { get: () => lsJSON('st_offline_meta') || {}, set(m) { try { localStorage.setItem('st_offline_meta', JSON.stringify(m)); } catch (_) {} } };
  const VER = (() => { const s = document.querySelector('script[src*="/js/hub.js"]'); const m = s && /[?&]v=([^&]+)/.exec(s.getAttribute('src')); return m ? m[1] : ''; })();
  const fmtMB = b => {
    const format = n => new Intl.NumberFormat(window.STModuleUI?.locale() || 'ru-RU', { maximumFractionDigits:1, minimumFractionDigits:1 }).format(n);
    return b >= 1073741824 ? format(b / 1073741824) + ' ' + ui('ГБ') : b >= 10485760 ? Math.round(b / 1048576) + ' ' + ui('МБ') : b >= 1048576 ? format(b / 1048576) + ' ' + ui('МБ') : Math.max(1, Math.round((b || 0) / 1024)) + ' ' + ui('КБ');
  };
  const fmtTime = t => new Date(t).toLocaleString(window.STModuleUI?.locale() || 'ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const placeKey = trip => [trip.dest || '', trip.name || ''].join('|').toLowerCase();
  const T = () => window.STTranslator || null;

  // ---------- Что входит в «Приложение» ----------
  const n = (dir, names, ext) => names.split(' ').map(x => dir + x + ext);
  const FILES = [
    '/', '/index.html', '/offline.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/useaway-icon.png', '/img/brand/useaway-logo.png', '/img/brand/useaway-logo-dark.png', '/img/brand/useaway-mark-white.png',
    ...n('/img/hub/', 'assistant bookings calendar checklist currency diary emergency expenses guide nearby offline route stats translator transport weather', '.webp'),
    ...n('/img/emergency/', 'hero phone cross embassy shield passport warning idcard kit', '.webp'),
    ...n('/img/covers/', 'nature route travel city global beach q64 q365', '.webp'),
    ...n('/img/trips/', 'abstract beach silk', '.jpg'),
    ...n('/img/bookings/', 'castle hero-flight hero-stay hero-ticket hero-transport stay trip-coast', '.jpg'),
    ...n('/img/weather/', 'sil-q64 sil-q365', '.webp'),
    ...n('/img/', 'participant-couple participant-family participant-man participant-men participant-woman participant-women participants-emoji', '.png'),
    '/img/translator/hero.webp', '/img/offline/banner.webp', '/img/assistant/hero.webp', '/img/assistant/bot.webp',
    '/data/airlines.json', '/data/airports.json', '/vendor/pdfjs/pdf.min.js', '/vendor/pdfjs/pdf.worker.min.js',
    '/js/modules/bookings-tools.js?v=3', '/js/modules/nearby-api.js?v=135'
  ];
  const LEAFLET_FILES = ['leaflet.js', 'leaflet.css', 'images/marker-icon.png', 'images/marker-icon-2x.png', 'images/marker-shadow.png', 'images/layers.png'].map(f => LEAFLET + f);
  function assetList(trip) {
    const set = new Set(FILES);
    document.querySelectorAll('script[src],link[rel="stylesheet"][href]').forEach(el => {
      try { const u = new URL(el.getAttribute('src') || el.getAttribute('href'), location.href); if (u.origin === location.origin) set.add(u.pathname + u.search); } catch (_) {}
    });
    const tr = T();
    if (tr) {
      set.add('/vendor/tesseract/tesseract.min.js'); set.add('/vendor/tesseract/worker.min.js'); set.add(tr.coreFile());
      [tr.ocrFile('en'), tr.ocrFile(tr.tripLang(trip))].filter(Boolean).forEach(u => set.add(u));
    }
    LEAFLET_FILES.forEach(u => set.add(u));
    const cc = tr && tr.tripCC(trip);
    ['ru', 'gb', cc && cc.toLowerCase()].filter(Boolean).forEach(c => { set.add('https://flagcdn.com/w80/' + c + '.png'); set.add('https://flagcdn.com/w40/' + c + '.png'); });
    return [...set];
  }
  const APP_EST = 15 * 1048576; // ~ приложение + распознавание текста

  // по очереди, не больше k запросов одновременно
  async function pool(items, k, fn, stop) {
    let i = 0;
    await Promise.all(Array.from({ length: k }, async () => { while (i < items.length && !(stop && stop())) { const it = items[i++]; await fn(it); } }));
  }
  async function saveTo(cache, url, mode) {
    const r = await fetch(url, { cache: 'no-cache', mode: mode || (url.startsWith('/') ? 'same-origin' : 'cors') });
    if (!r.ok) throw new Error('http ' + r.status);
    const size = (await r.clone().blob()).size;
    await cache.put(url, r);
    return size;
  }
  async function downloadAssets(trip, onProgress, stop) {
    if (!hasCaches()) throw new Error('nocache');
    const cache = await caches.open(ASSETS);
    const list = assetList(trip);
    let done = 0, bytes = 0, fail = 0;
    await pool(list, 4, async u => {
      try { const sz = await saveTo(cache, u); bytes += sz; } catch (_) { fail++; }
      done++; if (onProgress) onProgress(done / list.length);
    }, stop);
    // всё, что service worker уже сохранил по ходу работы (например, выбранное ядро распознавания)
    try {
      for (const k of await caches.keys()) {
        if (!k.startsWith('splitaway-static-')) continue;
        const c = await caches.open(k);
        for (const req of await c.keys()) { if (!(await cache.match(req))) { const r = await c.match(req); if (r) await cache.put(req, r); } }
      }
    } catch (_) {}
    if (stop && stop()) throw new Error('cancel');
    const m = META.get(); m.assets = { t: Date.now(), ver: VER, bytes, n: list.length - fail }; META.set(m);
    return { bytes, fail };
  }

  // ---------- Карта района (тайлы OpenStreetMap) ----------
  const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
  const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
  const maxZoom = km => (km <= 3 ? 16 : 15);
  function tileList(lat, lon, km) {
    const out = [];
    for (let z = 8; z <= maxZoom(km); z++) {
      const k = z < 11 ? Math.max(km, 25) : km; // на мелких масштабах — окрестности пошире
      const dLat = k / 111.32, dLon = k / (111.32 * Math.cos(lat * Math.PI / 180));
      const x0 = lon2x(lon - dLon, z), x1 = lon2x(lon + dLon, z), y0 = lat2y(lat + dLat, z), y1 = lat2y(lat - dLat, z);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push(z + '/' + x + '/' + y);
    }
    return out;
  }
  const TILE_EST = 17 * 1024;
  async function downloadTiles(tripId, center, km, onProgress, stop) {
    const cache = await caches.open(MAPS);
    const list = tileList(center.lat, center.lon, km);
    let done = 0, bytes = 0, fail = 0;
    // правило OSM: не больше 2 потоков, без массовой выгрузки крупных масштабов
    await pool(list, 2, async t => {
      const url = TILE + t + '.png';
      try {
        const hit = await cache.match(url);
        const sz = hit ? +(hit.headers.get('content-length') || TILE_EST) : await saveTo(cache, url, 'cors'); bytes += sz;
      } catch (_) { fail++; }
      done++; if (onProgress) onProgress(done / list.length);
    }, stop);
    if (stop && stop()) throw new Error('cancel');
    if (fail > list.length * 0.3) throw new Error('tiles');
    const m = META.get(); m.maps = m.maps || {};
    m.maps[tripId] = { t: Date.now(), lat: center.lat, lon: center.lon, name: center.name || '', km, count: list.length - fail, bytes };
    META.set(m);
    return m.maps[tripId];
  }
  async function deleteTiles(tripId) {
    const m = META.get(), mp = m.maps && m.maps[tripId];
    if (!mp || !hasCaches()) return;
    const keep = new Set();
    Object.entries(m.maps).forEach(([id, x]) => { if (id !== tripId) tileList(x.lat, x.lon, x.km).forEach(t => keep.add(t)); });
    const cache = await caches.open(MAPS);
    for (const t of tileList(mp.lat, mp.lon, mp.km)) if (!keep.has(t)) await cache.delete(TILE + t + '.png');
    delete m.maps[tripId]; META.set(m);
  }
  async function geocode(trip, store) {
    const saved = store.get('center', null);
    if (saved && saved.q === placeKey(trip)) return saved;
    if (!online()) return null;
    for (const q of [trip.dest, trip.name].filter(Boolean)) {
      try {
        const ctl = new AbortController(); setTimeout(() => ctl.abort(), 9000);
        const j = await (await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ru&q=' + encodeURIComponent(q), { signal: ctl.signal })).json();
        if (j[0]) { const c = { q: placeKey(trip), lat: +j[0].lat, lon: +j[0].lon, name: String(j[0].display_name || q).split(',')[0] }; store.set('center', c); return c; }
      } catch (_) {}
    }
    return null;
  }
  function ensureLeaflet() {
    if (window.L) return Promise.resolve();
    return new Promise((ok, no) => {
      if (!document.getElementById('st-leaflet-css')) { const l = document.createElement('link'); l.id = 'st-leaflet-css'; l.rel = 'stylesheet'; l.href = LEAFLET + 'leaflet.css'; document.head.appendChild(l); }
      const s = document.createElement('script'); s.src = LEAFLET + 'leaflet.js'; s.onload = ok; s.onerror = () => no(new Error('leaflet')); document.head.appendChild(s);
    });
  }

  // ---------- Что уже лежит на телефоне ----------
  async function status(trip) {
    const m = META.get(), r = {};
    r.app = m.assets ? (m.assets.ver === VER ? 'ok' : 'old') : 'need';
    r.map = trip && m.maps && m.maps[trip.id] || null;
    const tr = T();
    if (tr) {
      if (trip && !tr.tripCC(trip)) await tr.detectTripCC(trip);
      r.lang = tr.tripLang(trip);
      const s = await tr.status(r.lang);
      r.tr = s;
      r.trState = (s.phrases === 'need' || s.ocr === 'need' || s.device === 'downloadable' || s.device === 'downloading') ? 'need' : s.device === 'available' ? 'ok' : 'partial';
    }
    if (trip) {
      const items = lsJSON('st_mod_bookings_' + trip.id + '_items');
      r.bookings = Array.isArray(items) ? items.length : 0;
      const saved = lsJSON('st_mod_guide_' + trip.id + '_saved'), order = lsJSON('st_mod_route_' + trip.id + '_orderIds');
      r.places = Math.max(Array.isArray(saved) ? saved.length : 0, Array.isArray(order) ? order.length : 0);
    }
    // eslint-disable-next-line no-undef
    r.dirty = (typeof _syncDirty !== 'undefined' && _syncDirty) || false;
    try { if (navigator.storage && navigator.storage.estimate) r.est = await navigator.storage.estimate(); } catch (_) {}
    try { if (navigator.storage && navigator.storage.persisted) r.persisted = await navigator.storage.persisted(); } catch (_) {}
    return r;
  }

  // ---------- Стили ----------
  STHub.addStyles(ID, `
    #pg-module[data-module="off-home"] #mod-title{visibility:hidden}
    .of-ban{position:relative;container-type:inline-size;aspect-ratio:1380/378;border-radius:22px;overflow:hidden;background:#1d4f86 url(${IMG}banner.webp) center/cover no-repeat;box-shadow:0 14px 30px rgba(40,60,140,.22)}
    .of-ban h1{position:absolute;left:18.8%;top:38%;transform:translateY(-50%);max-width:37%;margin:0;color:#fff;font-size:1.5rem;font-size:6.6cqw;font-weight:800;letter-spacing:-.01em;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 2px 12px rgba(0,20,60,.45);pointer-events:none}
    .of-pack{position:relative;z-index:3;display:flex;align-items:center;gap:14px;margin-top:14px;padding:16px;border-radius:26px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:0 14px 36px rgba(70,60,160,.12)}
    .of-pack b{display:block;font-size:1.2rem;font-weight:800}
    .of-pack small{display:block;font-size:.92rem;color:var(--t2);margin-top:3px;line-height:1.35}
    .of-pack small.warn{color:#d93a3a;font-weight:600}
    .of-ic{width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#5b4bd6;background:radial-gradient(circle at 35% 30%,#f6f4ff 0%,#e4e0fc 75%);box-shadow:inset 0 -3px 6px rgba(91,75,214,.12)}
    [data-theme=dark] .of-ic{background:radial-gradient(circle at 35% 30%,#3a3470 0%,#2a2556 75%);color:#b9b0ff}
    .of-ic svg{width:28px;height:28px;stroke-width:2.1}
    .of-ic.wifi{position:relative}
    .of-ic.wifi::after{content:"";position:absolute;width:34px;height:3px;border-radius:2px;background:#e5262c;transform:rotate(45deg)}
    .of-ic.red{color:#fff;background:linear-gradient(135deg,#ff6b6b,#e5262c);box-shadow:0 6px 14px rgba(229,38,44,.28)}
    .of-list{display:flex;flex-direction:column;gap:10px;margin-top:14px}
    .of-row{display:flex;align-items:center;gap:14px;width:100%;padding:12px 14px;border-radius:24px;border:1px solid var(--hub-card-b);background:var(--hub-card);box-shadow:var(--hub-shadow);font:inherit;color:var(--text);cursor:pointer;text-align:left}
    .of-row .of-ic{width:52px;height:52px}
    .of-row .of-ic svg{width:26px;height:26px}
    .of-row>span:not(.of-ic):not(.of-st){flex:1;min-width:0}
    .of-row b{display:block;font-size:1.05rem;font-weight:800}
    .of-row small{display:block;font-size:.84rem;color:var(--t2);margin-top:2px;line-height:1.3}
    .of-row>svg:last-child{width:22px;height:22px;flex-shrink:0}
    .of-st{display:inline-flex;align-items:center;gap:5px;flex-shrink:0;font-size:.82rem;font-weight:700;white-space:nowrap}
    .of-st svg{width:18px;height:18px}
    .of-st.ok{color:#1b9a50}
    .of-st.ok svg{fill:#1fb25a;stroke:#fff}
    .of-st.need{color:#5b4bd6}
    .of-st.part{color:#c27a00}
    .of-st.no{color:var(--t2)}
    .of-mem{margin-top:14px;padding:14px 16px;border-radius:22px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow)}
    .of-mem-h{display:flex;align-items:center;gap:10px}
    .of-mem-h b{flex:1;font-size:1rem;font-weight:800}
    .of-mem-h button{border:0;background:none;color:#d93a3a;font:inherit;font-size:.88rem;font-weight:700;cursor:pointer;padding:6px}
    .of-bar{height:8px;border-radius:8px;background:rgba(106,77,244,.12);overflow:hidden;margin-top:10px}
    .of-bar i{display:block;height:100%;background:linear-gradient(90deg,#5b4bd6,#7b6bf0);width:0;transition:width .25s}
    .of-mem small{display:block;font-size:.84rem;color:var(--t2);margin-top:8px;line-height:1.4}
    .of-big{position:relative;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;margin-top:16px;padding:18px 14px;border-radius:999px;border:0;color:#fff;font:inherit;font-size:1rem;white-space:nowrap;font-weight:800;cursor:pointer;overflow:hidden;
      background:linear-gradient(135deg,#5b4bd6 0%,#6a55f0 55%,#8a6bff 100%);box-shadow:0 14px 30px rgba(91,75,214,.38)}
    .of-big svg{width:26px;height:26px;stroke-width:2.4}
    .of-big em{font-style:normal;opacity:.9;font-weight:700;font-size:.92rem}
    .of-big .p{position:absolute;left:0;top:0;bottom:0;background:rgba(255,255,255,.18);transition:width .25s}
    .of-big[disabled]{cursor:default}
    .of-step{margin-top:8px;text-align:center;font-size:.86rem;color:var(--t2)}
    .of-step button{border:0;background:none;color:#d93a3a;font:inherit;font-weight:700;cursor:pointer;margin-left:6px}
    .of-card{padding:14px 16px;border-radius:22px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow)}
    .of-card h3{margin:0 0 4px;font-size:1.05rem;font-weight:800}
    .of-note{font-size:.84rem;color:var(--t2);line-height:1.4;margin-top:8px}
    .of-map{height:220px;border-radius:18px;overflow:hidden;margin-top:12px;background:rgba(106,77,244,.06)}
    .of-chips{display:flex;gap:8px;margin-top:12px}
    .of-chip{flex:1;padding:10px 6px;border-radius:999px;border:1px solid var(--hub-card-b);background:var(--hub-card);font:inherit;font-weight:700;color:var(--text);cursor:pointer}
    .of-chip.on{background:linear-gradient(135deg,#5b4bd6,#7b6bf0);color:#fff;border-color:transparent}
    .of-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;margin-top:12px;padding:15px;border-radius:999px;border:0;background:linear-gradient(135deg,#5b4bd6,#7b6bf0);color:#fff;font:inherit;font-weight:800;font-size:1rem;cursor:pointer}
    .of-btn.lite{background:rgba(106,77,244,.1);color:#5b4bd6}
    .of-btn.red{background:rgba(229,38,44,.1);color:#d93a3a}
    .of-btn svg{width:20px;height:20px}
    .of-btn[disabled]{opacity:.6;cursor:default}
    .of-sheet{position:fixed;inset:0;z-index:1900;background:rgba(10,10,30,.45);display:flex;align-items:flex-end;justify-content:center}
    .of-sheet>div{width:100%;max-width:560px;background:var(--bg);border-radius:26px 26px 0 0;padding:20px 16px calc(18px + env(safe-area-inset-bottom,0px))}
    .of-sheet h3{margin:0 0 6px;font-size:1.15rem;font-weight:800;text-align:center}
  `);

  const stHtml = (k, t) => {
    const ic = { ok: 'circle-check', need: 'download', part: 'circle-alert', no: 'circle-minus' }[k] || 'circle';
    return `<span class="of-st ${k}"><i data-lucide="${ic}"></i>${esc(t)}</span>`;
  };
  function confirmSheet(title, text, okText, onOk) {
    const el = document.createElement('div'); el.className = 'of-sheet';
    el.innerHTML = `<div><h3>${esc(title)}</h3><div class="of-note" style="text-align:center">${esc(text)}</div>
      <button class="of-btn red" type="button" data-ok>${esc(okText)}</button><button class="of-btn lite" type="button" data-no>Отмена</button></div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-no]')) close(); if (e.target.closest('[data-ok]')) { close(); onOk(); } });
  }

  // Загрузка в фоне живёт дольше экрана: можно выйти и вернуться
  const job = { on: false, pct: 0, step: '', stop: false, after: null };

  STHub.registerService(ID, ctx => {
    const trip = ctx.trip;
    let cur = null, st = null;

    function home() {
      cur = ctx.openScreen({
        id: 'off-home', title: ctx.title,
        render(body, screen) {
          const m = META.get(), s = st || {};
          const tr = T();
          const pack = !online() ? '<small class="warn">Сейчас нет интернета — работает всё, что скачано</small>'
            : m.assets ? `<small>Последняя загрузка: ${esc(fmtTime(m.assets.t))}${s.app === 'old' ? ' · вышло обновление — нажмите «Обновить»' : ''}</small>`
              : '<small>Подготовьте поездку заранее</small>';
          const mapSt = !trip ? stHtml('no', 'Нет поездки') : s.map ? stHtml('ok', 'Скачано') : stHtml('need', 'Нужна загрузка');
          const trSt = !st ? stHtml('no', '…') : s.trState === 'ok' ? stHtml('ok', 'Скачано') : s.trState === 'need' ? stHtml('need', 'Нужна загрузка') : stHtml('part', 'Частично');
          const rtSt = !trip ? stHtml('no', 'Нет поездки') : s.places ? stHtml('ok', 'Скачано') : stHtml('no', 'Нет точек');
          const syncSt = s.dirty ? stHtml('part', online() ? 'Отправляется' : 'Ждёт сети') : stHtml('ok', 'Всё отправлено');
          let langName = ''; try { langName = s.lang ? new Intl.DisplayNames([window.STModuleUI?.locale() || 'ru-RU'], { type:'language' }).of(s.lang) : ''; } catch (_) {}
          const trSub = !st || !tr ? ui('Языковые пакеты') : `${langName || ui('Языковые пакеты')}: ` + ui(s.trState === 'ok' ? 'перевод, фразы и фото без сети' : s.trState === 'part' || s.trState === 'partial' ? 'фразы и фото офлайн, текст — онлайн' : 'нужно скачать');
          const est = APP_EST + (trip ? tileList((s.map && s.map.lat) || 48, (s.map && s.map.lon) || 10, (s.map && s.map.km) || 5).length * TILE_EST : 0);
          const allOk = s.app === 'ok' && (!trip || s.map) && s.trState !== 'need';
          const used = (m.assets ? m.assets.bytes : 0) + Object.values(m.maps || {}).reduce((a, x) => a + (x.bytes || 0), 0);
          body.innerHTML = `
            <div class="of-ban" role="img" aria-label="${esc(ctx.title)}"><h1>${esc(ctx.title)}</h1></div>
            <div class="of-pack"><span class="of-ic wifi"><i data-lucide="wifi"></i></span><span><b>Офлайн-пакет</b>${pack}</span></div>
            <div class="of-list">
              <button class="of-row" type="button" data-go="maps"><span class="of-ic"><i data-lucide="map"></i></span><span><b>Карты</b><small>${s.map ? esc((s.map.name || 'Город') + ', ' + s.map.km + ' км · ' + fmtMB(s.map.bytes)) : 'Города, маршруты, места'}</small></span>${mapSt}</button>
              <button class="of-row" type="button" data-go="tr"><span class="of-ic"><i data-lucide="languages"></i></span><span><b>Переводчик</b><small>${esc(trSub)}</small></span>${trSt}</button>
              <button class="of-row" type="button" data-go="docs"><span class="of-ic"><i data-lucide="file-text"></i></span><span><b>Документы</b><small>${trip && s.bookings ? 'Брони: ' + s.bookings + ' · хранятся на телефоне' : 'Бронирования, билеты, страховка'}</small></span><i data-lucide="chevron-right"></i></button>
              <button class="of-row" type="button" data-go="route"><span class="of-ic"><i data-lucide="route"></i></span><span><b>Маршруты</b><small>${s.places ? 'Точек: ' + s.places + ' · план поездки на телефоне' : 'План поездки и точки'}</small></span>${rtSt}</button>
              <button class="of-row" type="button" data-go="sos"><span class="of-ic red"><i data-lucide="briefcase-medical"></i></span><span><b>Экстренно</b><small>Номера служб и важные контакты</small></span><i data-lucide="chevron-right"></i></button>
              <button class="of-row" type="button" data-go="sync"><span class="of-ic"><i data-lucide="refresh-cw"></i></span><span><b>Синхронизация</b><small>${s.dirty ? 'Есть изменения — отправим, когда появится сеть' : 'Расходы отправляются автоматически'}</small></span>${syncSt}</button>
            </div>
            <div class="of-mem">
              <div class="of-mem-h"><i data-lucide="hard-drive" style="width:22px;height:22px;color:#5b4bd6"></i><b>Память</b>${used ? '<button type="button" data-a="clear">Очистить</button>' : ''}</div>
              ${s.est && s.est.quota ? `<div class="of-bar"><i style="width:${Math.min(100, Math.max(2, s.est.usage / s.est.quota * 100)).toFixed(1)}%"></i></div>` : ''}
              <small>${esc(ui('Офлайн-данные:'))} ${used ? fmtMB(used) : esc(ui('пока ничего'))}${s.est && s.est.quota ? ' · ' + esc(ui('свободно')) + ' ' + fmtMB(Math.max(0, s.est.quota - s.est.usage)) : ''}${s.persisted ? ' · ' + esc(ui('защищено от автоудаления')) : ''}<br>Личные данные (медкарта, документы, расходы) кнопка «Очистить» не трогает.</small>
            </div>
            <button class="of-big" type="button" data-a="all" ${job.on ? 'disabled' : ''}>${job.on ? `<span class="p" style="width:${Math.round(job.pct * 100)}%"></span>` : ''}
              <i data-lucide="${job.on ? 'loader' : 'download'}"></i>${job.on ? 'Скачиваю… ' + Math.round(job.pct * 100) + '%' : allOk ? 'Обновить офлайн-пакет' : 'Скачать всё для офлайн'} ${job.on ? '' : `<em>(≈ ${fmtMB(est)})</em>`}</button>
            <div class="of-step" id="of-step">${job.on ? esc(job.step) + '<button type="button" data-a="stop">Остановить</button>' : ''}</div>`;
          icons(body);
          const $ = k => body.querySelector('[data-a="' + k + '"]');
          $('all').addEventListener('click', () => downloadAll());
          if ($('stop')) $('stop').addEventListener('click', () => { job.stop = true; });
          if ($('clear')) $('clear').addEventListener('click', () => confirmSheet('Очистить офлайн-данные?', 'Удалим сохранённые карты и копию приложения. Личные данные, расходы и фразы останутся.', 'Очистить', async () => {
            try { await caches.delete(ASSETS); await caches.delete(MAPS); } catch (_) {}
            const mm = META.get(); delete mm.assets; delete mm.maps; META.set(mm); ctx.toast('Офлайн-данные удалены'); refresh();
          }));
          body.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
            const g = b.dataset.go;
            if (g === 'maps') maps();
            else if (g === 'tr') { if (T()) T().open('packs'); else ctx.toast('Переводчик ещё не загрузился'); }
            else if (g === 'docs') STHub.openService('bookings');
            else if (g === 'route') STHub.openService(s.places ? 'route' : 'guide');
            else if (g === 'sos') STHub.openService('emergency');
            else if (g === 'sync') {
              if (!s.dirty) ctx.toast('Все изменения уже отправлены');
              else if (!online()) ctx.toast('Отправим автоматически, когда появится интернет');
              else if (typeof sbSync === 'function') { ctx.toast('Отправляю…'); Promise.resolve(sbSync()).finally(() => refresh()); }
            }
          }));
        }
      });
      cur.id = 'off-home';
      if (!st) refresh();
    }
    async function refresh() {
      st = await status(trip);
      const layer = document.getElementById('pg-module');
      if (cur && layer && layer.dataset.module === 'off-home' && layer.style.display !== 'none') cur.refresh();
    }
    job.after = () => { st = null; refresh(); };

    async function downloadAll() {
      if (job.on) return;
      if (!online()) { ctx.toast('Нужен интернет, чтобы скачать офлайн-пакет'); return; }
      Object.assign(job, { on: true, pct: 0, step: 'Готовлюсь…', stop: false });
      const ui = () => {
        const layer = document.getElementById('pg-module');
        if (!(layer && layer.dataset.module === 'off-home')) return;
        const b = layer.querySelector('.of-big'), s = layer.querySelector('#of-step');
        if (b) { const p = b.querySelector('.p'); if (p) p.style.width = Math.round(job.pct * 100) + '%'; const t = [...b.childNodes].find(x => x.nodeType === 3 && /Скачиваю/.test(x.textContent)); if (t) t.textContent = 'Скачиваю… ' + Math.round(job.pct * 100) + '%'; }
        if (s && s.firstChild && s.firstChild.nodeType === 3) s.firstChild.textContent = job.step;
      };
      if (cur) cur.refresh();
      const stop = () => job.stop;
      const parts = { tr: 0.15, app: 0.35, map: 0.5 };
      let base = 0;
      const prog = (part, p, text) => { job.pct = Math.min(0.99, base + parts[part] * p); if (text) job.step = text; ui(); };
      const notes = [];
      try {
        try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) {}
        // 1) Переводчик — первым, пока действует нажатие (Chrome скачивает модель только по действию пользователя)
        const tr = T();
        if (tr) {
          const lang = tr.tripLang(trip);
          prog('tr', 0, 'Переводчик: ' + tr.name(lang));
          try { await tr.download(lang, null, t => prog('tr', 0.5, 'Переводчик: ' + t)); } catch (_) { notes.push('переводчик'); }
        }
        base += parts.tr; if (job.stop) throw new Error('cancel');
        // 2) Приложение
        prog('app', 0, 'Экраны, картинки и библиотеки…');
        await downloadAssets(trip, p => prog('app', p, 'Экраны, картинки и библиотеки: ' + Math.round(p * 100) + '%'), stop);
        base += parts.app;
        // 3) Карта района поездки
        if (trip) {
          prog('map', 0, 'Ищу город поездки на карте…');
          const old = (META.get().maps || {})[trip.id];
          const c = old ? { lat: old.lat, lon: old.lon, name: old.name } : await geocode(trip, ctx.store);
          if (c) await downloadTiles(trip.id, c, old ? old.km : 5, p => prog('map', p, 'Карта ' + (c.name || '') + ': ' + Math.round(p * 100) + '%'), stop);
          else notes.push('карта (город не найден — выберите его в «Картах»)');
        }
        job.pct = 1; ctx.toast(notes.length ? 'Готово, кроме: ' + notes.join(', ') : 'Готово: поездка доступна без интернета');
      } catch (e) {
        ctx.toast(e && e.message === 'cancel' ? 'Загрузка остановлена' : 'Не всё скачалось — проверьте интернет и нажмите ещё раз');
      } finally {
        job.on = false; job.stop = false; if (job.after) job.after();
      }
    }

    // ===== Карта района =====
    function maps() {
      const ms = { center: null, km: null, busy: false, pct: 0, msg: '', mapObj: null };
      const s0 = (META.get().maps || {})[trip ? trip.id : ''];
      if (s0) { ms.center = { lat: s0.lat, lon: s0.lon, name: s0.name }; ms.km = s0.km; }
      const api = ctx.openScreen({
        id: 'off-maps', title: 'Карты офлайн', onBack: home,
        render(body, screen) {
          if (!trip) { body.innerHTML = '<div class="st-empty"><i data-lucide="map"></i><div>Выберите поездку — скачаем карту её города.</div></div>'; icons(body); return; }
          const saved = (META.get().maps || {})[trip.id];
          const km = ms.km || 5, c = ms.center;
          const cnt = c ? tileList(c.lat, c.lon, km).length : 0;
          body.innerHTML = `
            <div class="of-card">
              <h3>${c ? esc(c.name || 'Выбранное место') : 'Ищу город поездки…'}</h3>
              <div class="of-note">${c ? 'Центр карты — ' + (ms.gps ? 'ваше местоположение' : 'место поездки «' + esc(trip.dest || trip.name || '') + '»') : online() ? 'Определяю по «Направлению» поездки' : 'Нет интернета — карту можно скачать, когда появится сеть'}</div>
              <div class="of-map" id="of-map"></div>
              <div class="of-chips">${[3, 5, 10].map(k => `<button class="of-chip${k === km ? ' on' : ''}" type="button" data-km="${k}">${k} км</button>`).join('')}</div>
              <div class="of-note">${c ? `≈ ${cnt} фрагментов · ≈ ${fmtMB(cnt * TILE_EST)} · подробно до масштаба ${maxZoom(km)}` : ''}</div>
              ${saved ? `<div class="of-note" style="color:#1b9a50;font-weight:700">Скачано ${esc(fmtTime(saved.t))}: ${esc(saved.name || '')}, ${saved.km} км · ${fmtMB(saved.bytes)}</div>` : ''}
              <button class="of-btn" type="button" data-a="dl" ${ms.busy || !c ? 'disabled' : ''}><i data-lucide="${ms.busy ? 'loader' : 'download'}"></i>${ms.busy ? 'Скачиваю… ' + Math.round(ms.pct * 100) + '%' : saved ? 'Обновить карту' : 'Скачать карту'}</button>
              ${ms.busy ? '<button class="of-btn lite" type="button" data-a="stop">Остановить</button>' : ''}
              <button class="of-btn lite" type="button" data-a="gps" ${ms.busy ? 'disabled' : ''}><i data-lucide="locate-fixed"></i>Моё местоположение</button>
              ${saved && !ms.busy ? '<button class="of-btn red" type="button" data-a="del"><i data-lucide="trash-2"></i>Удалить карту</button>' : ''}
            </div>
            <div class="of-note">Карта © участники OpenStreetMap. По правилам OpenStreetMap скачиваем только район поездки и не крупнее масштаба 16. Без сети в «Гиде», «Маршруте» и «Рядом» будет видна скачанная часть карты.</div>`;
          icons(body);
          const $ = k => body.querySelector('[data-a="' + k + '"]');
          body.querySelectorAll('[data-km]').forEach(b => b.addEventListener('click', () => { ms.km = +b.dataset.km; screen.refresh(); }));
          $('gps').addEventListener('click', () => {
            if (!navigator.geolocation) { ctx.toast('Геолокация недоступна'); return; }
            navigator.geolocation.getCurrentPosition(p => { ms.center = { lat: p.coords.latitude, lon: p.coords.longitude, name: 'Рядом со мной' }; ms.gps = true; screen.refresh(); },
              () => ctx.toast('Не удалось определить местоположение'), { enableHighAccuracy: false, timeout: 10000 });
          });
          if ($('stop')) $('stop').addEventListener('click', () => { ms.stop = true; });
          if ($('del')) $('del').addEventListener('click', () => confirmSheet('Удалить карту?', 'Скачанная карта этой поездки будет удалена с телефона.', 'Удалить', async () => { await deleteTiles(trip.id); st = null; refresh(); screen.refresh(); }));
          if ($('dl')) $('dl').addEventListener('click', async () => {
            if (!online()) { ctx.toast('Нужен интернет'); return; }
            ms.busy = true; ms.pct = 0; ms.stop = false; screen.refresh();
            let last = 0;
            try {
              if (saved && (saved.lat !== c.lat || saved.lon !== c.lon || saved.km !== km)) await deleteTiles(trip.id);
              await downloadTiles(trip.id, c, km, p => { ms.pct = p; if (Date.now() - last > 400) { last = Date.now(); const b = body.querySelector('[data-a="dl"]'); if (b) b.lastChild.textContent = 'Скачиваю… ' + Math.round(p * 100) + '%'; } }, () => ms.stop);
              ctx.toast('Карта скачана');
            } catch (e) { ctx.toast(e && e.message === 'cancel' ? 'Загрузка остановлена' : 'Не удалось скачать карту — попробуйте позже'); }
            ms.busy = false; st = null; refresh(); screen.refresh();
          });
          // превью района
          const el = body.querySelector('#of-map');
          if (c && el) ensureLeaflet().then(() => {
            if (!el.isConnected) return;
            const map = window.L.map(el, { zoomControl: false, attributionControl: false });
            map.fitBounds(window.L.latLng(c.lat, c.lon).toBounds(km * 2000), { padding: [10, 10] });
            window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
            window.L.circle([c.lat, c.lon], { radius: km * 1000, color: '#5b4bd6', weight: 2, fillOpacity: 0.08 }).addTo(map);
          }).catch(() => { el.innerHTML = '<div class="of-note" style="padding:16px">Превью карты появится, когда будет интернет.</div>'; });
          else if (el) el.style.display = 'none';
          if (!c && online()) geocode(trip, ctx.store).then(g => { if (g) { ms.center = g; screen.refresh(); } else { ctx.toast('Город поездки не найден — нажмите «Моё местоположение»'); } });
        }
      });
      return api;
    }

    home();
  });

  // Обновить копию приложения после выхода новой версии (тихо, если пользователь уже скачивал офлайн-пакет)
  function autoUpdate() {
    const m = META.get();
    if (!m.assets || m.assets.ver === VER || !online() || job.on) return;
    let trip = null; try { trip = typeof S !== 'undefined' && S ? S.trip : null; } catch (_) {} // S — состояние приложения из index.html
    downloadAssets(trip).catch(() => {});
  }
  setTimeout(autoUpdate, 15000);
  window.addEventListener('online', () => {
    setTimeout(autoUpdate, 5000);
    const layer = document.getElementById('pg-module');
    if (layer && layer.dataset.module === 'off-home' && job.after) job.after();
  });
  window.addEventListener('offline', () => {
    const layer = document.getElementById('pg-module');
    if (layer && layer.dataset.module === 'off-home' && job.after) job.after();
  });
})();
