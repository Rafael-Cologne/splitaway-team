(function () {
  'use strict';

  // Вставьте сюда ваш бесплатный ключ от Geoapify
  const GEOAPIFY_KEY = '64f610be469c44ec92dbd5e6b8ac6d40';

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

  async function fetchPlaces(lat, lon, type, radius) {
    let categories = 'catering.cafe,commercial.supermarket,commercial.convenience,service.vehicle.fuel';
    if (type === 'cafe') categories = 'catering.cafe';
    else if (type === 'shop') categories = 'commercial.supermarket,commercial.convenience,commercial.shopping_mall';
    else if (type === 'fuel') categories = 'service.vehicle.fuel';

    const host = ['api', 'geoapify', 'com'].join('.');
    const url = `https://${host}/v2/places?categories=${categories}&filter=circle:${lon},${lat},${radius}&bias=proximity:${lon},${lat}&limit=50&apiKey=${GEOAPIFY_KEY}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('Не удалось загрузить места рядом');
    const data = await res.json();

    return (data.features || []).map(item => {
      const p = item.properties;
      const cats = p.categories || [];
      let category = 'Магазин';
      if (cats.some(c => c.includes('catering'))) category = 'Кафе';
      else if (cats.some(c => c.includes('fuel'))) category = 'Заправка';

      return {
        id: p.place_id,
        lat: p.lat,
        lon: p.lon,
        name: p.name || p.brand || category,
        category,
        address: p.street ? `${p.street} ${p.housenumber || ''}`.trim() : 'Адрес не указан',
        distance: p.distance || 0
      };
    });
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


