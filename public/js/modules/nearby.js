// ============================================================
// Модуль «Рядом» (id: 'nearby')
// Ответственный: Александр
// ------------------------------------------------------------
// Пока модуль не зарегистрирован, плитка «Рядом» показывает
// «В разработке». Как начать — см. js/modules/_template.js:
// скопируйте шаблон сюда и поставьте ID = 'nearby'.
// ============================================================
(function () {
  'use strict';
  if (!window.STHub) return;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  STHub.addStyles('nearby', `
    .nb-bar { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; align-items: center; }
    .nb-bar .st-btn { padding: 6px 10px; font-size: 13px; }
    .nb-map-box { width: 100%; height: 320px; border-radius: 12px; overflow: hidden; border: 1px solid rgba(128,128,128,0.25); margin-bottom: 12px; background: #e5e3df; }
    #nb-map { width: 100%; height: 100%; z-index: 1; }
    .nb-pin { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; color: #fff; font-size: 14px; border: 2px solid #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.35); }
    .nb-route { display: none; justify-content: space-between; align-items: center; padding: 8px 12px; margin-bottom: 10px; border-radius: 8px; background: rgba(41, 128, 185, 0.12); font-size: 13px; }
    .nb-card-on { outline: 2px solid #2980b9; }
  `);

  function loadHelper() {
    if (window.NearbyAPI) return Promise.resolve(window.NearbyAPI);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'js/modules/nearby-api.js';
      s.onload = () => res(window.NearbyAPI);
      s.onerror = () => rej(new Error('Не найден nearby-api.js'));
      document.head.appendChild(s);
    });
  }

  STHub.registerService('nearby', ctx => {
    let lat = 52.5200, lon = 13.4050;
    let type = ctx.store.get('type', 'all'), radius = ctx.store.get('radius', 2000);
    let map, layer, uMark, circle, rLine;

    const locate = manual => {
      if (!('geolocation' in navigator)) return manual && ctx.toast('Нет GPS');
      if (manual) ctx.toast('Определяем геопозицию...');
      navigator.geolocation.getCurrentPosition(p => {
        lat = p.coords.latitude; lon = p.coords.longitude;
        document.getElementById('nb-rad')?.dispatchEvent(new Event('change'));
      }, () => manual && ctx.toast('Нет доступа к геопозиции'), { enableHighAccuracy: true, timeout: 6000 });
    };

    ctx.openScreen({
      title: ctx.title,
      action: { icon: 'locate-fixed', label: 'Найти меня', onClick: () => locate(true) },
      async render(body) {
        body.innerHTML = `
          <div class="nb-bar">
            <button class="st-btn ${type === 'all' ? '' : 'st-btn-g'}" data-t="all">🌍 Все</button>
            <button class="st-btn ${type === 'cafe' ? '' : 'st-btn-g'}" data-t="cafe">☕ Кафе</button>
            <button class="st-btn ${type === 'shop' ? '' : 'st-btn-g'}" data-t="shop">🛒 Магазины</button>
            <button class="st-btn ${type === 'fuel' ? '' : 'st-btn-g'}" data-t="fuel">⛽ Заправки</button>
            <select class="st-input" id="nb-rad" style="width:auto;padding:6px 10px;margin:0;">
              <option value="1000" ${radius === 1000 ? 'selected' : ''}>1 км</option>
              <option value="2000" ${radius === 2000 ? 'selected' : ''}>2 км</option>
              <option value="5000" ${radius === 5000 ? 'selected' : ''}>5 км</option>
            </select>
          </div>
          <div class="nb-route" id="nb-rbar"><span id="nb-rtxt"></span><button class="st-btn st-btn-g" id="nb-roff" style="padding:4px 8px;font-size:12px;">✖</button></div>
          <div class="nb-map-box"><div id="nb-map"></div></div>
          <div class="st-card-title" id="nb-ttl" style="margin-bottom:8px;">Места рядом</div>
          <div id="nb-list"></div>`;

        let api;
        try { api = await loadHelper(); await api.ensureLeaflet(); }
        catch (e) { body.querySelector('#nb-list').innerHTML = `<div class="st-empty"><div>${esc(e.message)}</div></div>`; return; }

        map = L.map('nb-map').setView(new Array(lat, lon), 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(map);
        layer = L.layerGroup().addTo(map);
        setTimeout(() => map?.invalidateSize(), 200);

        const clearRoute = () => { if (rLine) { map.removeLayer(rLine); rLine = null; } body.querySelector('#nb-rbar').style.display = 'none'; };
        const updateCenter = (lbl, fit) => {
          if (uMark) map.removeLayer(uMark); if (circle) map.removeLayer(circle);
          circle = L.circle(new Array(lat, lon), { radius, color: '#3498db', weight: 1, fillOpacity: 0.08 }).addTo(map);
          uMark = L.circleMarker(new Array(lat, lon), { radius: 8, color: '#fff', weight: 2, fillColor: '#e74c3c', fillOpacity: 1 }).addTo(map).bindPopup(`<b>${esc(lbl)}</b>`);
          if (fit) map.fitBounds(circle.getBounds(), { padding: new Array(15, 15) });
        };

        const buildRoute = async p => {
          ctx.toast('Строим маршрут...');
          try {
            const r = await api.fetchRoute(lat, lon, p.lat, p.lon);
            clearRoute();
            rLine = L.polyline(r.coords, { color: '#2980b9', weight: 5, opacity: 0.85 }).addTo(map);
            map.fitBounds(rLine.getBounds(), { padding: new Array(30, 30) });
            body.querySelector('#nb-rtxt').textContent = `${p.name}: ${api.fmtDist(r.distance)} (~${r.mins} мин)`;
            body.querySelector('#nb-rbar').style.display = 'flex';
          } catch (e) { ctx.toast(e.message); }
        };

        const loadPlaces = async () => {
          const list = body.querySelector('#nb-list');
          list.innerHTML = '<div class="st-empty"><div>Поиск мест...</div></div>';
          layer.clearLayers();
          try {
            const places = await api.fetchPlaces(lat, lon, type, radius);
            body.querySelector('#nb-ttl').textContent = `Места рядом (${places.length})`;
            if (!places.length) { list.innerHTML = '<div class="st-empty"><div>Ничего не найдено</div></div>'; return; }
            list.innerHTML = '';
            places.forEach(p => {
              const st = p.category === 'Кафе' ? { c: '#e67e22', e: '☕' } : p.category === 'Заправка' ? { c: '#2980b9', e: '⛽' } : { c: '#27ae60', e: '🛒' };
              const icon = L.divIcon({ className: '', html: `<div class="nb-pin" style="background:${st.c}">${st.e}</div>`, iconSize: new Array(32, 32), iconAnchor: new Array(16, 16), popupAnchor: new Array(0, -16) });
              const m = L.marker(new Array(p.lat, p.lon), { icon }).bindPopup(`<b>${esc(p.name)}</b><br>${esc(p.category)} • ${api.fmtDist(p.distance)}<br>${esc(p.address)}`).addTo(layer);

              const card = document.createElement('div');
              card.className = 'st-card'; card.style.cssText = 'cursor:pointer;margin-bottom:8px;';
              card.innerHTML = `<div class="st-row" style="padding:0;"><span class="st-row-ic">${st.e}</span><span class="st-row-txt"><span class="st-row-ttl">${esc(p.name)} <span class="st-muted">(${api.fmtDist(p.distance)})</span></span><span class="st-muted" style="font-size:12px;">${esc(p.category)} • ${esc(p.address)}</span></span><button class="st-btn st-btn-g nb-go" style="padding:6px 10px;font-size:12px;">🧭 Маршрут</button></div>`;
              card.onclick = () => { body.querySelectorAll('.st-card').forEach(x => x.classList.remove('nb-card-on')); card.classList.add('nb-card-on'); map.flyTo(new Array(p.lat, p.lon), 16, { duration: 0.7 }); m.openPopup(); };
              card.querySelector('.nb-go').onclick = e => { e.stopPropagation(); buildRoute(p); };
              list.appendChild(card);
            });
          } catch (e) { list.innerHTML = `<div class="st-empty"><div>${esc(e.message)}</div></div>`; }
        };

        map.on('click', e => { lat = e.latlng.lat; lon = e.latlng.lng; clearRoute(); updateCenter('Выбранная точка', false); loadPlaces(); });
        body.querySelectorAll('.nb-bar button[data-t]').forEach(b => b.onclick = () => {
          type = b.dataset.t; ctx.store.set('type', type);
          body.querySelectorAll('.nb-bar button[data-t]').forEach(x => x.classList.toggle('st-btn-g', x.dataset.t !== type));
          loadPlaces();
        });
        body.querySelector('#nb-rad').onchange = e => { radius = +e.target.value; ctx.store.set('radius', radius); clearRoute(); updateCenter('Центр поиска', true); loadPlaces(); };
        body.querySelector('#nb-roff').onclick = clearRoute;

        if (ctx.trip?.dest) { const c = await api.geocodeCity(ctx.trip.dest); if (c) { lat = c.lat; lon = c.lon; } }
        updateCenter(ctx.trip?.dest ? `Поездка: ${ctx.trip.dest}` : 'Точка поиска', true);
        loadPlaces(); locate(false);
      }
    });
  });
})();

