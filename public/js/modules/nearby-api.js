(function () {
  'use strict';

  // Места рядом — OpenStreetMap через Overpass: бесплатно и без ключа (правило команды: никаких ключей в коде).
  // Overpass бывает перегружен, поэтому спрашиваем сразу три зеркала и берём первый ответ.
  const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://z.overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

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

  async function overpass(query) {
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: 'data=' + encodeURIComponent(query) };
    const one = url => {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
      return fetch(url, Object.assign({ signal: ctl.signal }, opts)).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); }).finally(() => clearTimeout(t));
    };
    try { return await Promise.any(OVERPASS.map(one)); }
    catch (_) { throw new Error('Не удалось загрузить места рядом — сервис карт перегружен, попробуйте ещё раз'); }
  }

  async function fetchPlaces(lat, lon, type, radius) {
    const around = `(around:${radius},${lat},${lon})`;
    const parts = [];
    if (type === 'all' || type === 'cafe') parts.push(`nwr["amenity"="cafe"]${around};`);
    if (type === 'all' || type === 'shop') parts.push(`nwr["shop"~"^(supermarket|convenience|mall)$"]${around};`);
    if (type === 'all' || type === 'fuel') parts.push(`nwr["amenity"="fuel"]${around};`);
    const data = await overpass(`[out:json][timeout:20];(${parts.join('')});out center 200;`);

    return (data.elements || []).map(el => {
      const t = el.tags || {};
      const pLat = el.lat ?? (el.center && el.center.lat), pLon = el.lon ?? (el.center && el.center.lon);
      if (pLat == null || pLon == null) return null;
      const category = t.amenity === 'cafe' ? 'Кафе' : t.amenity === 'fuel' ? 'Заправка' : 'Магазин';
      return {
        id: el.type + '-' + el.id,
        lat: pLat,
        lon: pLon,
        name: t['name:ru'] || t.name || t.brand || category,
        category,
        address: t['addr:street'] ? `${t['addr:street']} ${t['addr:housenumber'] || ''}`.trim() : 'Адрес не указан',
        distance: distM(lat, lon, pLat, pLon)
      };
    }).filter(Boolean).sort((a, b) => a.distance - b.distance).slice(0, 50);
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


