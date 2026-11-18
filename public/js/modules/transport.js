// ============================================================
// Модуль «Транспорт» (id: 'transport')
// Ответственный: Rafael
// ------------------------------------------------------------
// Откуда → Куда → как добраться:
//   • общественный транспорт прямо в приложении — Transitous (api.transitous.org):
//     бесплатный открытый планировщик, весь мир, без ключа. Условия: некоммерческий
//     open-source проект, бережная нагрузка (~720 запросов в день на всё приложение),
//     ссылка на transitous.org/sources и © OpenStreetMap — внизу экрана;
//   • такси: Uber (открывается с уже заданным маршрутом), Bolt (открывается приложение,
//     адрес назначения копируется — у Bolt нет открытой ссылки с маршрутом);
//   • запасной вариант — «Открыть в Google Maps» (общественный транспорт).
// Точки: моё местоположение (GPS), места из «Гида» (мой план), поиск адреса (Nominatim).
// ============================================================
(function () {
  'use strict';
  if (!window.STHub) return;

  const ID = 'transport';
  const API = 'https://api.transitous.org/api/v5/plan';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = el => { if (typeof initializeIcons === 'function') initializeIcons(el); };
  const pad = n => String(n).padStart(2, '0');
  const hm = iso => { const d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const dur = s => { const m = Math.max(1, Math.round(s / 60)); return m < 60 ? m + ' мин' : Math.floor(m / 60) + ' ч' + (m % 60 ? ' ' + (m % 60) + ' мин' : ''); };
  const km = m => m < 1000 ? Math.round(m / 10) * 10 + ' м' : (m / 1000).toFixed(1).replace('.', ',') + ' км';
  const plural = (n, a, b, c) => { const t = n % 10, h = n % 100; return t === 1 && h !== 11 ? a : t >= 2 && t <= 4 && (h < 12 || h > 14) ? b : c; };

  // Виды транспорта (MOTIS / Transitous)
  const MODES = {
    WALK: ['footprints', 'Пешком'], BIKE: ['bike', 'Велосипед'], CAR: ['car', 'Авто'],
    BUS: ['bus', 'Автобус'], COACH: ['bus', 'Междугородний автобус'], TRAM: ['tram-front', 'Трамвай'],
    SUBWAY: ['train-front-tunnel', 'Метро'], METRO: ['train-front-tunnel', 'Метро'],
    RAIL: ['train-front', 'Поезд'], REGIONAL_RAIL: ['train-front', 'Электричка'], REGIONAL_FAST_RAIL: ['train-front', 'Региональный экспресс'],
    HIGHSPEED_RAIL: ['train-front', 'Скоростной поезд'], LONG_DISTANCE: ['train-front', 'Поезд дальнего следования'], NIGHT_RAIL: ['train-front', 'Ночной поезд'],
    SUBURBAN: ['train-front', 'Городская электричка'], FERRY: ['ship', 'Паром'], AIRPLANE: ['plane', 'Самолёт'],
    CABLE_CAR: ['cable-car', 'Канатная дорога'], FUNICULAR: ['cable-car', 'Фуникулёр'], AERIAL_LIFT: ['cable-car', 'Подъёмник'], ODM: ['car', 'Транспорт по запросу']
  };
  const modeOf = m => MODES[m] || ['route', 'Транспорт'];
  const colorOf = l => (l.routeColor && /^[0-9a-f]{6}$/i.test(l.routeColor)) ? '#' + l.routeColor : '#6a4df4';
  const textOf = l => (l.routeTextColor && /^[0-9a-f]{6}$/i.test(l.routeTextColor)) ? '#' + l.routeTextColor : '#fff';
  const lineOf = l => l.routeShortName || l.displayName || l.tripShortName || '';

  STHub.addStyles(ID, `
    .tr-od{position:relative;padding:6px 52px 6px 14px;border-radius:22px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow)}
    .tr-pt{display:flex;align-items:center;gap:12px;width:100%;border:0;background:none;font:inherit;color:var(--text);text-align:left;padding:12px 0;cursor:pointer;min-height:54px}
    .tr-pt+.tr-pt{border-top:1px solid var(--hub-card-b)}
    .tr-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0;border:3px solid #6a4df4;background:var(--hub-card)}
    .tr-dot.to{border-color:#E5484D;border-radius:4px}
    .tr-pt span{flex:1;min-width:0}
    .tr-pt small{display:block;font-size:.74rem;color:var(--t2);margin-bottom:1px}
    .tr-pt b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tr-pt b.ph{color:var(--t2);font-weight:500}
    .tr-swap{position:absolute;right:10px;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:50%;border:1px solid var(--hub-card-b);background:var(--hub-card);color:var(--text);display:flex;align-items:center;justify-content:center;cursor:pointer}
    .tr-swap svg{width:18px;height:18px}
    .tr-when{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:12px 0 2px}
    .tr-chip{flex-shrink:0;border:1px solid var(--hub-card-b);background:var(--hub-card);color:var(--text);border-radius:999px;padding:8px 14px;font:600 .82rem inherit;font-family:inherit;cursor:pointer}
    .tr-chip.on{background:#6a4df4;border-color:#6a4df4;color:#fff}
    .tr-time{margin-top:8px}
    .tr-h{display:flex;align-items:center;gap:8px;font-size:.98rem;font-weight:800;margin:20px 2px 10px}
    .tr-h svg{width:18px;height:18px;color:#6a4df4}
    .tr-it{display:block;width:100%;text-align:left;font:inherit;color:var(--text);cursor:pointer;padding:14px;border-radius:18px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow);margin-bottom:10px}
    .tr-it-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
    .tr-it-top b{font-size:1.08rem;font-weight:800}
    .tr-it-top span{font-size:.98rem;font-weight:700;color:#6a4df4;white-space:nowrap}
    .tr-legs{display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin:10px 0 6px}
    .tr-legs .sep{color:var(--t2);display:flex}
    .tr-legs .sep svg{width:14px;height:14px}
    .tr-badge{display:inline-flex;align-items:center;gap:4px;border-radius:8px;padding:3px 7px;font-size:.78rem;font-weight:700;line-height:1.2}
    .tr-badge svg{width:14px;height:14px}
    .tr-walk{display:inline-flex;align-items:center;gap:2px;color:var(--t2);font-size:.78rem;font-weight:600}
    .tr-walk svg{width:14px;height:14px}
    .tr-sub{font-size:.8rem;color:var(--t2)}
    .tr-opt{display:flex;align-items:center;gap:12px;width:100%;text-align:left;font:inherit;color:var(--text);cursor:pointer;padding:12px 14px;border-radius:18px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow);margin-bottom:10px;text-decoration:none}
    .tr-logo{width:44px;height:44px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.86rem;flex-shrink:0}
    .tr-logo svg{width:22px;height:22px}
    .tr-opt>span:not(.tr-logo){flex:1;min-width:0}
    .tr-opt b{display:block;font-weight:700}
    .tr-opt small{display:block;font-size:.78rem;color:var(--t2);margin-top:1px}
    .tr-opt>svg{width:18px;height:18px;color:var(--t2);flex-shrink:0}
    .tr-wait{display:flex;align-items:center;gap:10px;padding:16px;color:var(--t2);font-size:.88rem}
    .tr-spin{width:18px;height:18px;border-radius:50%;border:2.5px solid rgba(106,77,244,.25);border-top-color:#6a4df4;animation:trsp 0.8s linear infinite}
    @keyframes trsp{to{transform:rotate(360deg)}}
    .tr-note{font-size:.74rem;color:var(--t2);text-align:center;margin:18px 4px 4px;line-height:1.5}
    .tr-note a{color:inherit}
    .tr-map{height:230px;border-radius:20px;overflow:hidden;border:1px solid var(--hub-card-b);background:var(--hub-card);margin-bottom:14px}
    .tr-tl{position:relative;padding-left:34px}
    .tr-st{position:relative;padding:4px 0 10px}
    .tr-st::before{content:"";position:absolute;left:-26px;top:9px;width:12px;height:12px;border-radius:50%;background:var(--hub-card);border:3px solid var(--c,#6a4df4)}
    .tr-st b{font-weight:700}
    .tr-st .t{float:right;font-weight:700;font-size:.92rem}
    .tr-seg{position:relative;padding:4px 0 14px;font-size:.86rem;color:var(--t2)}
    .tr-seg::before{content:"";position:absolute;left:-21px;top:-6px;bottom:-6px;width:4px;border-radius:2px;background:var(--c,#6a4df4)}
    .tr-seg.walk::before{background:repeating-linear-gradient(to bottom,var(--t2) 0 4px,transparent 4px 9px);width:3px;left:-20.5px;opacity:.7}
    .tr-seg .tr-badge{margin-right:6px}
    .tr-seg details{margin-top:4px}
    .tr-seg summary{cursor:pointer;color:#6a4df4;font-weight:600}
    .tr-seg ol{margin:6px 0 0;padding-left:18px}
    .tr-pick{display:flex;align-items:center;gap:12px;width:100%;border:0;border-bottom:1px solid var(--hub-card-b);background:none;font:inherit;color:var(--text);text-align:left;padding:12px 4px;cursor:pointer}
    .tr-pick svg{width:20px;height:20px;color:#6a4df4;flex-shrink:0}
    .tr-pick span{flex:1;min-width:0}
    .tr-pick small{display:block;font-size:.76rem;color:var(--t2);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tr-list{max-height:min(55vh,460px);overflow-y:auto;margin:0 -4px}
  `);

  // ---------- нижняя панель (как в других модулях) ----------
  function sheet(title, html, bind) {
    document.getElementById('tr-sheet')?.remove();
    const ov = document.createElement('div'); ov.className = 'ov open'; ov.id = 'tr-sheet';
    ov.innerHTML = `<div class="mdl"><div class="mdl-handle"></div><div class="mdl-title">${esc(title)}</div>${html}</div>`;
    let done = false;
    const close = () => { if (done) return; done = true; ov.remove(); document.body.style.overflow = ''; };
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    (document.getElementById('pg-module') || document.body).appendChild(ov);
    document.body.style.overflow = 'hidden'; icons(ov);
    bind(ov.firstChild, close);
  }

  // ---------- Leaflet (как в «Гиде» и «Дневнике») ----------
  let leafletP = null;
  function leaflet() {
    if (window.L) return Promise.resolve(window.L);
    return leafletP || (leafletP = new Promise((ok, no) => {
      if (!document.getElementById('st-leaflet-css')) { const l = document.createElement('link'); l.id = 'st-leaflet-css'; l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(l); }
      const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = () => ok(window.L); s.onerror = () => { leafletP = null; no(new Error('map')); }; document.head.appendChild(s);
    }));
  }
  // Google polyline (Transitous: точность 6 знаков)
  function decode(str, prec) {
    const f = Math.pow(10, prec || 6), out = []; let i = 0, lat = 0, lon = 0;
    while (i < str.length) {
      for (const k of [0, 1]) {
        let b, sh = 0, r = 0; do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
        const d = r & 1 ? ~(r >> 1) : r >> 1; if (k) lon += d; else lat += d;
      }
      out.push([lat / f, lon / f]);
    }
    return out;
  }

  // ---------- геолокация и поиск адреса ----------
  function gps() {
    return new Promise((ok, no) => {
      if (!navigator.geolocation) return no(new Error('Геолокация недоступна на этом устройстве'));
      navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => no(new Error('Не получилось определить место — разрешите доступ к геолокации')), { timeout: 12000, maximumAge: 60000 });
    });
  }
  async function getJSON(url, ms) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms || 15000);
    try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error('http ' + r.status); return await r.json(); }
    finally { clearTimeout(t); }
  }

  STHub.registerService(ID, ctx => {
    const trip = ctx.trip || {};
    const st = ctx.store.get('route', {}) || {};
    const S = {
      from: st.from || { gps: true, name: 'Моё местоположение' },
      to: st.to || null,
      when: 'now',                // now | dep | arr
      time: '',
      res: null, err: '', busy: false
    };
    const keep = () => ctx.store.set('route', { from: S.from, to: S.to });
    const cache = {};

    // точка с координатами (для GPS — спросить телефон)
    async function coords(p) {
      if (!p) return null;
      if (p.gps) { const g = await gps(); return Object.assign({}, p, g); }
      return p.lat != null ? p : null;
    }

    function pointSheet(which, done) {
      let saved = []; try { saved = JSON.parse(localStorage.getItem('st_mod_guide_' + trip.id + '_saved') || '[]'); } catch (_) {}
      saved = saved.filter(p => p && p.lat != null && p.lon != null);
      const near = trip.dest || trip.name || '';
      sheet(which === 'from' ? 'Откуда' : 'Куда', `
        <input class="st-input" id="tr-q" placeholder="Адрес, станция, место${near ? ' · ' + esc(near) : ''}" autocomplete="off" style="margin:6px 0 8px">
        <div class="tr-list" id="tr-pl">
          <button class="tr-pick" type="button" data-a="gps"><i data-lucide="navigation"></i><span>Моё местоположение<small>По GPS телефона</small></span></button>
          ${saved.length ? saved.slice(0, 30).map((p, k) => `<button class="tr-pick" type="button" data-s="${k}"><i data-lucide="bookmark"></i><span>${esc(p.name)}<small>Из «Гида» · мой план</small></span></button>`).join('')
            : '<div class="st-muted" style="padding:10px 4px">Места, сохранённые в «Гиде» (мой план), появятся здесь.</div>'}
        </div>`, (root, close) => {
        const pick = p => { close(); done(p); };
        root.querySelector('[data-a="gps"]').addEventListener('click', () => pick({ gps: true, name: 'Моё местоположение' }));
        root.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => { const p = saved[+b.dataset.s]; pick({ name: p.name, lat: +p.lat, lon: +p.lon, sub: 'Из «Гида»' }); }));
        const q = root.querySelector('#tr-q'), pl = root.querySelector('#tr-pl'); let timer = null, seq = 0;
        q.addEventListener('input', () => {
          clearTimeout(timer); const s = q.value.trim(); if (s.length < 3) return;
          timer = setTimeout(async () => {
            const my = ++seq;
            pl.innerHTML = '<div class="tr-wait"><div class="tr-spin"></div>Ищу…</div>';
            try {
              // сначала рядом с местом поездки, потом везде
              let j = near ? await getJSON(`https://nominatim.openstreetmap.org/search?format=json&limit=8&accept-language=ru&q=${encodeURIComponent(s + ', ' + near)}`, 10000) : [];
              if (!j.length) j = await getJSON(`https://nominatim.openstreetmap.org/search?format=json&limit=8&accept-language=ru&q=${encodeURIComponent(s)}`, 10000);
              if (my !== seq) return;
              pl.innerHTML = j.length ? j.map((r, k) => `<button class="tr-pick" type="button" data-r="${k}"><i data-lucide="map-pin"></i><span>${esc(r.name || r.display_name.split(',')[0])}<small>${esc(r.display_name.split(',').slice(1, 4).join(',').trim())}</small></span></button>`).join('')
                : '<div class="st-muted" style="padding:12px 4px">Ничего не найдено. Попробуйте написать иначе или добавить город.</div>';
              icons(pl);
              pl.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => { const r = j[+b.dataset.r];
                pick({ name: r.name || r.display_name.split(',')[0], sub: r.display_name.split(',').slice(1, 3).join(',').trim(), lat: +r.lat, lon: +r.lon }); }));
            } catch (_) { if (my === seq) pl.innerHTML = '<div class="st-muted" style="padding:12px 4px">Нет связи с поиском адресов. Проверьте интернет.</div>'; }
          }, 600);
        });
        setTimeout(() => q.focus(), 200);
      });
    }

    // ---------- поиск маршрута ----------
    async function search(screen) {
      if (!S.to) { pointSheet('to', p => { S.to = p; keep(); search(screen); }); return; }
      S.busy = true; S.err = ''; S.res = null; screen.refresh();
      try {
        const [a, b] = await Promise.all([coords(S.from), coords(S.to)]);
        if (!a || !b) throw new Error('У точки нет координат — выберите её из списка');
        S.a = a; S.b = b;
        let url = `${API}?fromPlace=${a.lat.toFixed(6)},${a.lon.toFixed(6)}&toPlace=${b.lat.toFixed(6)},${b.lon.toFixed(6)}&numItineraries=5&directModes=WALK`;
        if (S.when !== 'now' && S.time) url += `&time=${encodeURIComponent(new Date(S.time).toISOString())}&arriveBy=${S.when === 'arr'}`;
        const k = url + '|' + (S.when === 'now' ? Math.floor(Date.now() / 120000) : '');
        const j = cache[k] || (cache[k] = await getJSON(url, 25000));
        S.res = { list: (j.itineraries || []).filter(it => it.legs && it.legs.some(l => l.mode !== 'WALK')), direct: (j.direct || []).find(d => d.legs && d.legs.every(l => l.mode === 'WALK')) || null };
      } catch (e) {
        S.err = e && e.name === 'AbortError' ? 'Сервис расписаний долго не отвечает. Попробуйте ещё раз или откройте Google Maps.'
          : (e && /геолокац|GPS|координат/i.test(e.message)) ? e.message : 'Не удалось загрузить маршруты. Проверьте интернет или откройте Google Maps.';
      }
      S.busy = false; screen.refresh();
    }

    // ---------- ссылки на внешние приложения ----------
    const ll = p => p && p.lat != null ? `${(+p.lat).toFixed(6)},${(+p.lon).toFixed(6)}` : '';
    function gmaps(mode) {
      const o = S.from && S.from.gps ? '' : (ll(S.from) || (S.from && S.from.name) || '');
      const d = ll(S.to) || (S.to && S.to.name) || '';
      return 'https://www.google.com/maps/dir/?api=1' + (o ? '&origin=' + encodeURIComponent(o) : '') + '&destination=' + encodeURIComponent(d) + '&travelmode=' + (mode || 'transit');
    }
    function uber() {
      const q = ['action=setPickup'];
      if (S.from && !S.from.gps && S.from.lat != null) q.push('pickup[latitude]=' + S.from.lat, 'pickup[longitude]=' + S.from.lon, 'pickup[nickname]=' + encodeURIComponent(S.from.name || ''));
      else q.push('pickup=my_location');
      if (S.to && S.to.lat != null) q.push('dropoff[latitude]=' + S.to.lat, 'dropoff[longitude]=' + S.to.lon, 'dropoff[nickname]=' + encodeURIComponent(S.to.name || ''));
      return 'https://m.uber.com/ul/?' + q.join('&');
    }
    function bolt() {
      const addr = S.to ? [S.to.name, S.to.sub].filter(Boolean).join(', ') : '';
      if (addr && navigator.clipboard) navigator.clipboard.writeText(addr).then(() => ctx.toast('Адрес «' + S.to.name + '» скопирован — вставьте его в Bolt в поле «Куда»')).catch(() => {});
      const ua = navigator.userAgent;
      const url = /android/i.test(ua) ? 'https://play.google.com/store/apps/details?id=ee.mtakso.client'
        : /iphone|ipad|ipod/i.test(ua) ? 'https://apps.apple.com/app/id675033630' : 'https://bolt.eu/ru-ru/rides/';
      window.open(url, '_blank', 'noopener');
    }

    // ---------- карточка маршрута ----------
    function legsRow(it) {
      const parts = [];
      it.legs.forEach((l, i) => {
        if (l.mode === 'WALK') { if (l.duration >= 60) parts.push(`<span class="tr-walk"><i data-lucide="footprints"></i>${Math.round(l.duration / 60)}</span>`); }
        else { const [ic] = modeOf(l.mode); const n = lineOf(l); parts.push(`<span class="tr-badge" style="background:${colorOf(l)};color:${textOf(l)}"><i data-lucide="${ic}"></i>${esc(n)}</span>`); }
      });
      return parts.join('<span class="sep"><i data-lucide="chevron-right"></i></span>');
    }
    function itCard(it, k) {
      const first = it.legs.find(l => l.mode !== 'WALK');
      const walk = it.legs.filter(l => l.mode === 'WALK').reduce((s, l) => s + (l.duration || 0), 0);
      const tr = it.transfers || 0;
      return `<button class="tr-it" type="button" data-it="${k}">
        <div class="tr-it-top"><b>${hm(it.startTime)} – ${hm(it.endTime)}</b><span>${dur(it.duration)}</span></div>
        <div class="tr-legs">${legsRow(it)}</div>
        <div class="tr-sub">${first ? 'от «' + esc(first.from.name) + '» в ' + hm(first.startTime) + ' · ' : ''}${tr ? tr + ' ' + plural(tr, 'пересадка', 'пересадки', 'пересадок') : 'без пересадок'}${walk >= 60 ? ' · пешком ' + dur(walk) : ''}</div>
      </button>`;
    }

    function openDetail(it) {
      ctx.openScreen({
        title: hm(it.startTime) + ' – ' + hm(it.endTime),
        onBack: () => main(),
        render(body) {
          const tl = [];
          it.legs.forEach((l, i) => {
            const c = l.mode === 'WALK' ? 'var(--t2)' : colorOf(l);
            if (i === 0) tl.push(`<div class="tr-st" style="--c:${c}"><span class="t">${hm(l.startTime)}</span><b>${esc(l.from.name === 'START' ? (S.from.name || 'Старт') : l.from.name)}</b></div>`);
            if (l.mode === 'WALK') {
              tl.push(`<div class="tr-seg walk"><span class="tr-walk"><i data-lucide="footprints"></i></span> Пешком ${dur(l.duration)}${l.distance ? ' · ' + km(l.distance) : ''}</div>`);
            } else {
              const [ic, name] = modeOf(l.mode); const stops = l.intermediateStops || [];
              tl.push(`<div class="tr-seg" style="--c:${c}"><span class="tr-badge" style="background:${c};color:${textOf(l)}"><i data-lucide="${ic}"></i>${esc(lineOf(l))}</span>${esc(name)}${l.headsign ? ' → ' + esc(l.headsign) : ''}
                <div>${dur(l.duration)}${stops.length ? ' · ' + (stops.length + 1) + ' ' + plural(stops.length + 1, 'остановка', 'остановки', 'остановок') : ''}${l.from.track ? ' · путь/платформа ' + esc(l.from.track) : ''}${l.agencyName ? ' · ' + esc(l.agencyName) : ''}</div>
                ${stops.length ? `<details><summary>Остановки</summary><ol>${stops.map(s => `<li>${esc(s.name)}${s.arrival ? ' · ' + hm(s.arrival) : ''}</li>`).join('')}</ol></details>` : ''}</div>`);
            }
            const last = i === it.legs.length - 1;
            tl.push(`<div class="tr-st" style="--c:${last ? '#E5484D' : (it.legs[i + 1] && it.legs[i + 1].mode !== 'WALK' ? colorOf(it.legs[i + 1]) : c)}"><span class="t">${hm(l.endTime)}</span><b>${esc(l.to.name === 'END' ? (S.to.name || 'Финиш') : l.to.name)}</b></div>`);
          });
          body.innerHTML = `<div class="tr-map" id="tr-map"></div>
            <div class="st-card" style="margin-bottom:12px"><b style="font-size:1.05rem">${dur(it.duration)}</b>
              <div class="st-muted">${it.transfers ? it.transfers + ' ' + plural(it.transfers, 'пересадка', 'пересадки', 'пересадок') : 'без пересадок'} · ${esc(S.from.name)} → ${esc(S.to.name)}</div></div>
            <div class="tr-tl">${tl.join('')}</div>
            <a class="tr-opt" href="${esc(gmaps('transit'))}" target="_blank" rel="noopener" style="margin-top:8px"><span class="tr-logo" style="background:#e8f0fe;color:#1a73e8"><i data-lucide="map"></i></span><span><b>Открыть в Google Maps</b><small>Навигация по этому маршруту</small></span><i data-lucide="external-link"></i></a>
            <div class="tr-note">Расписание: <a href="https://transitous.org/sources/" target="_blank" rel="noopener">Transitous</a> · карта © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></div>`;
          icons(body);
          leaflet().then(L => {
            const el = body.querySelector('#tr-map'); if (!el || !el.isConnected) return;
            const map = L.map(el, { zoomControl: false, attributionControl: false });
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
            const all = [];
            it.legs.forEach(l => {
              const g = l.legGeometry; if (!g || !g.points) return;
              const pts = decode(g.points, g.precision || 6); all.push(...pts);
              L.polyline(pts, l.mode === 'WALK' ? { color: '#6b7280', weight: 4, dashArray: '4 8' } : { color: colorOf(l), weight: 6, opacity: .9 }).addTo(map);
            });
            if (all.length) {
              L.circleMarker(all[0], { radius: 7, color: '#6a4df4', fillColor: '#fff', fillOpacity: 1, weight: 4 }).addTo(map);
              L.circleMarker(all[all.length - 1], { radius: 7, color: '#E5484D', fillColor: '#fff', fillOpacity: 1, weight: 4 }).addTo(map);
              map.fitBounds(L.latLngBounds(all), { padding: [24, 24] });
            }
          }).catch(() => { const el = body.querySelector('#tr-map'); if (el) el.style.display = 'none'; });
        }
      });
    }

    // ---------- главный экран ----------
    function main() {
      ctx.openScreen({
        title: ctx.title,
        render(body, screen) {
          const ptBtn = (w, p) => `<button class="tr-pt" type="button" data-pt="${w}"><i class="tr-dot${w === 'to' ? ' to' : ''}"></i><span><small>${w === 'from' ? 'Откуда' : 'Куда'}</small>${p ? `<b>${esc(p.name)}</b>` : '<b class="ph">Выберите место</b>'}</span></button>`;
          const local = () => { const d = new Date(Date.now() + 15 * 60000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
          let res = '';
          if (S.busy) res = '<div class="tr-wait"><div class="tr-spin"></div>Ищу маршруты…</div>';
          else if (S.err) res = `<div class="st-card"><div class="st-muted">${esc(S.err)}</div></div>`;
          else if (S.res) {
            res = S.res.list.length ? S.res.list.map(itCard).join('')
              : '<div class="st-card"><div class="st-muted">Общественный транспорт между этими точками не найден в этот час. Попробуйте другое время или откройте Google Maps.</div></div>';
            if (S.res.direct && S.res.direct.duration <= 75 * 60) res += `<div class="tr-opt" style="cursor:default"><span class="tr-logo" style="background:rgba(106,77,244,.12);color:#6a4df4"><i data-lucide="footprints"></i></span><span><b>Пешком ${dur(S.res.direct.duration)}</b><small>${S.res.direct.legs[0] && S.res.direct.legs[0].distance ? km(S.res.direct.legs.reduce((s, l) => s + (l.distance || 0), 0)) : ''}</small></span></div>`;
          }
          const ready = !!S.to;
          body.innerHTML = `
            <div class="tr-od">${ptBtn('from', S.from)}${ptBtn('to', S.to)}
              <button class="tr-swap" type="button" data-a="swap" aria-label="Поменять местами"><i data-lucide="arrow-up-down"></i></button></div>
            <div class="tr-when">
              <button class="tr-chip${S.when === 'now' ? ' on' : ''}" type="button" data-w="now">Сейчас</button>
              <button class="tr-chip${S.when === 'dep' ? ' on' : ''}" type="button" data-w="dep">Отправление в…</button>
              <button class="tr-chip${S.when === 'arr' ? ' on' : ''}" type="button" data-w="arr">Прибыть к…</button>
            </div>
            ${S.when !== 'now' ? `<input class="st-input tr-time" type="datetime-local" id="tr-time" value="${esc(S.time || local())}">` : ''}
            <button class="st-btn st-btn-fw" type="button" data-a="go" style="margin-top:12px"><i data-lucide="search"></i>Как добраться</button>
            ${S.res || S.busy || S.err ? `<div class="tr-h"><i data-lucide="tram-front"></i>Общественный транспорт</div>${res}` : ''}
            ${ready ? `
              <div class="tr-h"><i data-lucide="car-taxi-front"></i>Такси</div>
              <a class="tr-opt" href="${esc(uber())}" target="_blank" rel="noopener"><span class="tr-logo" style="background:#000;color:#fff">Uber</span><span><b>Uber</b><small>Откроется с маршрутом до «${esc(S.to.name)}» — цена в приложении</small></span><i data-lucide="external-link"></i></a>
              <button class="tr-opt" type="button" data-a="bolt"><span class="tr-logo" style="background:#34d186;color:#fff">Bolt</span><span><b>Bolt</b><small>Адрес скопируется — вставьте его в поле «Куда»</small></span><i data-lucide="external-link"></i></button>
              <div class="tr-h"><i data-lucide="map"></i>В других приложениях</div>
              <a class="tr-opt" href="${esc(gmaps('transit'))}" target="_blank" rel="noopener"><span class="tr-logo" style="background:#e8f0fe;color:#1a73e8"><i data-lucide="map"></i></span><span><b>Google Maps</b><small>Общественный транспорт</small></span><i data-lucide="external-link"></i></a>` : ''}
            ${S.res ? '<div class="tr-note">Расписание: <a href="https://transitous.org/sources/" target="_blank" rel="noopener">Transitous</a> (открытые данные перевозчиков) · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></div>' : ''}`;
          icons(body);
          body.querySelectorAll('[data-pt]').forEach(b => b.addEventListener('click', () => pointSheet(b.dataset.pt, p => { S[b.dataset.pt] = p; S.res = null; S.err = ''; keep(); screen.refresh(); if (S.from && S.to) search(screen); })));
          body.querySelector('[data-a="swap"]').addEventListener('click', () => { const f = S.from; S.from = S.to || { gps: true, name: 'Моё местоположение' }; S.to = f && !f.gps ? f : null; S.res = null; keep(); screen.refresh(); if (S.to) search(screen); });
          body.querySelectorAll('[data-w]').forEach(b => b.addEventListener('click', () => { S.when = b.dataset.w; if (S.when !== 'now' && !S.time) S.time = local(); screen.refresh(); }));
          body.querySelector('#tr-time')?.addEventListener('change', e => { S.time = e.target.value; });
          body.querySelector('[data-a="go"]').addEventListener('click', () => search(screen));
          body.querySelector('[data-a="bolt"]')?.addEventListener('click', bolt);
          body.querySelectorAll('[data-it]').forEach(b => b.addEventListener('click', () => openDetail(S.res.list[+b.dataset.it])));
        }
      });
    }
    main();
  });
})();
