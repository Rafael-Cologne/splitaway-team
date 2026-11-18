(function () {
  'use strict';

  // Места рядом — OpenStreetMap, бесплатно и без ключа (правило команды: никаких ключей в коде).
  //  1) Nominatim — быстро (~0,3 с на запрос); его правило: не чаще 1 запроса в секунду;
  //  2) запасной вариант — Overpass (бывает перегружен и отвечает долго или не отвечает).
  const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://z.overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
  const NOMINATIM_Q = { cafe: ['cafe'], shop: ['supermarket', 'convenience store', 'mall'], fuel: ['fuel'] };

  function ensureLeaflet() {
    if (window.L) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (!document.getElementById('st-leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'st-leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://' + ['unpkg', 'com'].join('.') + '/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      const script = document.createElement('script');
      script.src = 'https://' + ['unpkg', 'com'].join('.') + '/leaflet@1.9.4/dist/leaflet.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Не удалось загрузить карту'));
      document.head.appendChild(script);
    });
  }

  function fmtDist(m) {
    if (!m && m !== 0) return '';
    return m < 1000 ? Math.round(m) + ' м' : (m / 1000).toFixed(1) + ' км';
  }

  async function geocodeCity(cityName) {
    try {
      const host = ['photon', 'komoot', 'io'].join('.');
      const res = await fetch(`https://${host}/api/?q=${encodeURIComponent(cityName)}&limit=1`);
      const data = await res.json();
      const feat = data.features && data.features.at(0);
      if (feat) return { lat: feat.geometry.coordinates.at(1), lon: feat.geometry.coordinates.at(0) };
    } catch (_) {}
    return null;
  }

  function distM(lat1, lon1, lat2, lon2) {
    const r = Math.PI / 180, x = (lat2 - lat1) * r, y = (lon2 - lon1) * r;
    const h = Math.sin(x / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(y / 2) ** 2;
    return 12742000 * Math.asin(Math.sqrt(h));
  }

  async function getJSON(url, opts, ms) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms || 12000);
    try { const r = await fetch(url, Object.assign({ signal: ctl.signal }, opts || {})); if (!r.ok) throw new Error('http ' + r.status); return await r.json(); }
    finally { clearTimeout(t); }
  }
  const pause = ms => new Promise(r => setTimeout(r, ms));

  // Nominatim: поиск по типу места внутри квадрата вокруг точки
  async function nominatimPlaces(lat, lon, type, radius) {
    const dLat = radius / 111320, dLon = radius / (111320 * Math.cos(lat * Math.PI / 180));
    const box = [lon - dLon, lat + dLat, lon + dLon, lat - dLat].map(v => v.toFixed(5)).join(',');
    const kinds = type === 'all' ? ['cafe', 'shop', 'fuel'] : [type];
    const qs = []; kinds.forEach(k => (NOMINATIM_Q[k] || []).forEach(q => qs.push(q)));
    const out = []; let ok = 0;
    for (let i = 0; i < qs.length; i++) {
      if (i) await pause(1100); // правило Nominatim: не чаще 1 запроса в секунду
      try {
        const list = await getJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&accept-language=ru&limit=40&bounded=1&viewbox=${box}&q=${encodeURIComponent(qs[i])}`, null, 10000);
        ok++;
        list.forEach(p => {
          const cat = p.category, typ = p.type;
          if (!((cat === 'amenity' && (typ === 'cafe' || typ === 'fuel')) || (cat === 'shop' && /^(supermarket|convenience|mall)$/.test(typ)))) return;
          const a = p.address || {};
          out.push({ id: (p.osm_type || 'n') + '-' + p.osm_id, lat: +p.lat, lon: +p.lon,
            tags: { amenity: cat === 'amenity' ? typ : undefined, shop: cat === 'shop' ? typ : undefined, name: p.name, 'addr:street': a.road, 'addr:housenumber': a.house_number } });
        });
      } catch (_) {}
    }
    if (!ok) throw new Error('nominatim');
    return out;
  }

  async function overpassPlaces(lat, lon, type, radius) {
    const around = `(around:${radius},${lat},${lon})`;
    const parts = [];
    if (type === 'all' || type === 'cafe') parts.push(`nwr["amenity"="cafe"]${around};`);
    if (type === 'all' || type === 'shop') parts.push(`nwr["shop"~"^(supermarket|convenience|mall)$"]${around};`);
    if (type === 'all' || type === 'fuel') parts.push(`nwr["amenity"="fuel"]${around};`);
    const query = `[out:json][timeout:20];(${parts.join('')});out center 200;`;
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: 'data=' + encodeURIComponent(query) };
    const data = await Promise.any(OVERPASS.map(u => getJSON(u, opts, 30000)));
    return (data.elements || []).map(el => ({ id: el.type + '-' + el.id, lat: el.lat ?? (el.center && el.center.lat), lon: el.lon ?? (el.center && el.center.lon), tags: el.tags || {} }))
      .filter(p => p.lat != null && p.lon != null);
  }

  const memo = {}; // одинаковый запрос второй раз — мгновенно (на 10 минут)
  async function fetchPlaces(lat, lon, type, radius) {
    const key = [type, radius, lat.toFixed(3), lon.toFixed(3)].join('|');
    if (memo[key] && Date.now() - memo[key].t < 600000) return memo[key].list;
    let raw;
    try { raw = await nominatimPlaces(lat, lon, type, radius); }
    catch (_) {
      try { raw = await overpassPlaces(lat, lon, type, radius); }
      catch (__) { throw new Error('Не удалось загрузить места рядом — проверьте интернет и попробуйте ещё раз'); }
    }
    const seen = new Set();
    const list = raw.map(p => {
      const t = p.tags || {};
      const category = t.amenity === 'cafe' ? 'Кафе' : t.amenity === 'fuel' ? 'Заправка' : 'Магазин';
      return {
        id: p.id, lat: p.lat, lon: p.lon,
        name: t['name:ru'] || t.name || t.brand || category,
        category,
        address: t['addr:street'] ? `${t['addr:street']} ${t['addr:housenumber'] || ''}`.trim() : 'Адрес не указан',
        distance: distM(lat, lon, p.lat, p.lon)
      };
    }).filter(p => p.distance <= radius && !seen.has(p.id) && seen.add(p.id))
      .sort((a, b) => a.distance - b.distance).slice(0, 60);
    memo[key] = { t: Date.now(), list };
    return list;
  }

  async function fetchRoute(fromLat, fromLon, toLat, toLon) {
    const host = ['router', 'project-osrm', 'org'].join('.');
    const res = await fetch(`https://${host}/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`);
    const data = await res.json();
    const route = data.routes && data.routes.at(0);
    if (!route) throw new Error('Маршрут не найден');
    return {
      coords: route.geometry.coordinates.map(c => new Array(c.at(1), c.at(0))),
      distance: route.distance,
      mins: Math.max(1, Math.round(route.duration / 60))
    };
  }

  window.NearbyAPI = { ensureLeaflet, fmtDist, geocodeCity, fetchPlaces, fetchRoute };
})();


