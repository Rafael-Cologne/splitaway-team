// ============================================================
// Модуль «Гид и места» (id: 'guide')
// Ответственный: Здислав
// Источники: Nominatim (OSM), Wikipedia (места рядом), Overpass API (OSM, дополнительно), Leaflet + OSM
// ============================================================
(function () {
  'use strict';
  if (!window.STHub) return;

  const ID = 'guide';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = url => (/^https?:\/\//i.test(String(url || '').trim()) ? String(url).trim() : '');

  const FILTERS = [
    { id: 'all',    label: 'Все',        icon: 'sparkles' },
    { id: 'free',   label: 'Бесплатно',  icon: 'ticket' },
    { id: 'sights', label: 'Топ-места',  icon: 'landmark' },
    { id: 'museum', label: 'Музеи',      icon: 'building-2' },
    { id: 'park',   label: 'Парки',      icon: 'trees' },
    { id: 'food',   label: 'Еда и кофе', icon: 'utensils' }
  ];

  const QUICK_CITIES = ['Рим', 'Прага', 'Париж', 'Стамбул', 'Барселона', 'Берлин'];

  const TAG_LABELS = {
    attraction: 'Достопримечательность',
    museum: 'Музей',
    gallery: 'Галерея',
    viewpoint: 'Смотровая',
    artwork: 'Арт-объект',
    zoo: 'Зоопарк',
    theme_park: 'Парк аттракционов',
    monument: 'Памятник',
    castle: 'Замок',
    ruins: 'Руины',
    memorial: 'Мемориал',
    park: 'Парк',
    garden: 'Сад',
    cafe: 'Кафе',
    restaurant: 'Ресторан',
    bakery: 'Пекарня',
    bar: 'Бар',
    theatre: 'Театр'
  };

  STHub.addStyles(ID, `
    .st-guide-tabs{display:flex;gap:7px;flex-wrap:wrap}
    .st-guide-chip{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:999px;border:1px solid var(--hub-card-b);background:var(--hub-card);color:var(--text);font:inherit;font-size:.8rem;font-weight:600;cursor:pointer;transition:all .15s}
    .st-guide-chip svg{width:14px;height:14px}
    .st-guide-chip.on{background:var(--accent);border-color:var(--accent);color:#fff}
    .st-guide-chip.free-on{background:#16a34a;border-color:#16a34a;color:#fff}
    .st-guide-search{display:flex;gap:8px;align-items:center}
    .st-guide-search .st-input{flex:1;min-width:0}
    .st-guide-map-wrap{position:relative;border-radius:18px;overflow:hidden;border:1px solid var(--hub-card-b);background:var(--hub-card);box-shadow:var(--hub-shadow)}
    .st-guide-map{width:100%;height:245px;background:var(--hub-soft);z-index:1}
    .st-guide-map-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;font-size:.76rem;color:var(--t2);border-top:1px solid var(--hub-card-b)}
    .st-guide-city-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
    .st-guide-city-wiki{font-size:.82rem;color:var(--t2);line-height:1.4;margin-top:6px}
    .st-guide-place{display:flex;flex-direction:column;gap:8px}
    .st-guide-place.highlight{border-color:var(--accent);box-shadow:0 0 0 2px var(--hub-soft)}
    .st-guide-place-hd{display:flex;gap:12px;align-items:flex-start}
    .st-guide-thumb{width:74px;height:74px;border-radius:12px;object-fit:cover;flex-shrink:0;background:var(--hub-soft)}
    .st-guide-thumb-ph{width:74px;height:74px;border-radius:12px;flex-shrink:0;background:var(--hub-soft);color:var(--accent);display:flex;align-items:center;justify-content:center}
    .st-guide-thumb-ph svg{width:24px;height:24px;opacity:.7}
    .st-guide-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
    .st-guide-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:8px;background:var(--hub-soft);color:var(--accent);font-size:.72rem;font-weight:700}
    .st-guide-badge.free{background:rgba(34,197,94,.14);color:var(--green,#16a34a)}
    .st-guide-badge.dist{background:transparent;border:1px solid var(--hub-card-b);color:var(--t2);font-weight:600}
    .st-guide-meta{display:flex;flex-direction:column;gap:4px;font-size:.8rem;color:var(--t2)}
    .st-guide-meta-row{display:flex;align-items:center;gap:6px}
    .st-guide-meta-row svg{width:13px;height:13px;flex-shrink:0;opacity:.8}
    .st-guide-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:2px}
    .st-guide-actions .st-btn{min-height:34px;padding:0 11px;font-size:.78rem;border-radius:11px;text-decoration:none}
    .st-guide-more-txt{background:none;border:0;padding:0;margin-left:4px;color:var(--accent);font:inherit;font-size:.8rem;font-weight:700;cursor:pointer}
    .st-guide-done{opacity:.68}
    .st-guide-done .st-card-title{text-decoration:line-through}
    .st-guide-progress{height:6px;border-radius:99px;background:var(--hub-soft);overflow:hidden;margin-top:8px}
    .st-guide-progress > div{height:100%;background:var(--accent);transition:width .25s}
    .st-guide-route-hint{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:16px;background:var(--hub-soft);color:var(--text);font-size:.82rem;line-height:1.35}
    .st-guide-route-hint svg{width:20px;height:20px;color:var(--accent);flex-shrink:0}
    .leaflet-popup-content{margin:10px 12px;font-family:inherit;font-size:13px;line-height:1.35}
    .st-guide-pop-btn{margin-top:7px;width:100%;padding:6px 10px;border:0;border-radius:8px;background:#5B4BEA;color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
    .st-guide-pop-btn.saved{background:#16a34a}
  `);

  const cityCache = new Map();
  const wikiCache = new Map();
  let leafletPromise = null;

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
      if (!document.getElementById('st-leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'st-leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => (window.L ? resolve(window.L) : reject(new Error('Leaflet не загрузился')));
      script.onerror = () => {
        leafletPromise = null;
        reject(new Error('Не удалось загрузить карту'));
      };
      document.head.appendChild(script);
    });
    return leafletPromise;
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatDist(km) {
    if (km == null || !Number.isFinite(km)) return '';
    return km < 1 ? `${Math.round(km * 1000)} м` : `${km.toFixed(1)} км`;
  }

  function classifyPlace(tags) {
    const t = tags.tourism || '';
    const l = tags.leisure || '';
    const a = tags.amenity || '';
    if (t === 'museum' || t === 'gallery' || a === 'theatre') return 'museum';
    if (l === 'park' || l === 'garden' || t === 'zoo') return 'park';
    if (a === 'cafe' || a === 'restaurant' || a === 'bakery' || a === 'bar') return 'food';
    return 'sights';
  }

  function placeTypeLabel(tags) {
    const key = tags.tourism || tags.leisure || tags.historic || tags.amenity || '';
    return TAG_LABELS[key] || 'Интересное место';
  }

  function formatAddress(tags) {
    return [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  }

  function googleMapsUrl(p, city) {
    const q = p.name ? `${p.name}${city ? ', ' + city : ''}` : `${p.lat},${p.lon}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }

  function wikiUrlFromTag(wikiTag) {
    if (!wikiTag) return '';
    const idx = wikiTag.indexOf(':');
    const lang = idx > 0 ? wikiTag.slice(0, idx) : 'ru';
    const title = idx > 0 ? wikiTag.slice(idx + 1) : wikiTag;
    if (!title) return '';
    return `https://${encodeURIComponent(lang)}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
  }

  function wikiSnippet(text, maxLen = 280) {
    const clean = String(text || '').trim();
    if (!clean || clean.length <= maxLen) return { short: clean, full: clean, truncated: false };
    const slice = clean.slice(0, maxLen);
    const sentEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
    if (sentEnd >= 90) return { short: slice.slice(0, sentEnd + 1), full: clean, truncated: true };
    const wordEnd = slice.lastIndexOf(' ');
    return { short: (wordEnd > 80 ? slice.slice(0, wordEnd) : slice) + '…', full: clean, truncated: true };
  }

  // ---------- Загрузка мест города ----------
  // Overpass (OSM) часто перегружен и отвечает 40–90 секунд или ошибкой. Поэтому:
  //  1) главные достопримечательности — из Wikidata (по числу языковых версий статьи, как рейтинг известности);
  //  2) места рядом из Википедии (geosearch, ~0,5 с, сразу с фото и описанием);
  //  3) Overpass — дополнительно (кафе, часы работы, «бесплатно»), несколько зеркал, ждём не дольше 7 с;
  //  4) результат хранится на устройстве 7 дней — повторный поиск мгновенный.
  const CITY_TTL = 7 * 86400000;
  const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://z.overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
  const lsKey = key => 'st_guide_city2_' + key;
  const lsRead = key => { try { const v = JSON.parse(localStorage.getItem(lsKey(key)) || 'null'); return v && Date.now() - v.t < CITY_TTL ? v.data : null; } catch (_) { return null; } };
  const lsWrite = (key, data) => { try { localStorage.setItem(lsKey(key), JSON.stringify({ t: Date.now(), data })); } catch (_) {} };

  async function fetchJSON(url, opts, ms) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), ms || 10000);
    try {
      const r = await fetch(url, Object.assign({}, opts || {}, { signal: ctl.signal }));
      if (!r.ok) throw new Error('http ' + r.status);
      return await r.json();
    } finally { clearTimeout(timer); }
  }

  // Места из OSM (Overpass): первое ответившее зеркало
  function overpassPlaces(lat, lon, cityShort, ms) {
    const query = `
      [out:json][timeout:25];
      (
        node["tourism"~"attraction|museum|gallery|viewpoint|artwork|zoo|theme_park"]["name"](around:6500,${lat},${lon});
        way["tourism"~"attraction|museum|gallery|viewpoint|zoo|theme_park"]["name"](around:6500,${lat},${lon});
        relation["tourism"~"attraction|museum|zoo|theme_park"]["name"](around:6500,${lat},${lon});
        node["historic"~"monument|castle|ruins|memorial"]["name"](around:6500,${lat},${lon});
        way["historic"~"monument|castle|ruins|memorial"]["name"](around:6500,${lat},${lon});
        node["leisure"~"park|garden"]["name"](around:6500,${lat},${lon});
        way["leisure"~"park|garden"]["name"](around:6500,${lat},${lon});
        node["amenity"~"cafe|restaurant|bakery|theatre"]["name"](around:3500,${lat},${lon});
      );
      out center 160;
    `.trim();
    const body = 'data=' + encodeURIComponent(query);
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body };
    return Promise.any(OVERPASS.map(u => fetchJSON(u, opts, ms))).then(ov => {
      const out = [];
      for (const el of ov.elements || []) {
        const tags = el.tags || {};
        const name = (tags['name:ru'] || tags.name || '').trim();
        const pLat = el.lat ?? el.center?.lat, pLon = el.lon ?? el.center?.lon;
        if (!name || pLat == null || pLon == null) continue;
        const latNum = Number(pLat), lonNum = Number(pLon);
        const hasWiki = Boolean(tags['wikipedia:ru'] || tags.wikipedia);
        out.push({
          id: `${el.type}-${el.id}`, name, city: cityShort,
          cat: classifyPlace(tags), typeLabel: placeTypeLabel(tags), addr: formatAddress(tags),
          hours: tags.opening_hours || '', website: safeUrl(tags.website || tags['contact:website'] || ''),
          cuisine: tags.cuisine ? tags.cuisine.replace(/;/g, ', ') : '', free: tags.fee === 'no',
          wikiTag: tags['wikipedia:ru'] || tags.wikipedia || '',
          distKm: haversineKm(lat, lon, latNum, lonNum),
          score: (hasWiki ? 3 : 0) + (tags.website ? 1 : 0) + (tags.opening_hours ? 1 : 0) + (tags['name:ru'] ? 1 : 0),
          lat: latNum, lon: lonNum
        });
      }
      return out;
    });
  }

  // Места из Википедии рядом с центром города (быстро и надёжно)
  const WIKI_SKIP = /несохранивш|снесён|станци|метрополитен|линия|вокзал|аэропорт|район|округ|квартал|улиц|площадь в|переулок|школ|гимнази|университет|больниц|кладбищ|компани|предприяти|министерств|правительств|посольств|партия|профсоюз|издательств|газет|футбольн|клуб|отель|гостиниц|город в|муниципалитет|провинци|коммуна|община|деревн|село|олимпийск|municipality|province|university/i;

  function guessPlaceCat(text) {
    const d = String(text || '').toLowerCase();
    if (/музе|галере|театр|опер|концерт|филармон|museum|gallery|theatre/.test(d)) return 'museum';
    if (/парк|сад\b|сады|ботаническ|зоопарк|лес\b|озеро|park|garden|zoo/.test(d)) return 'park';
    return 'sights';
  }

  // Топ-достопримечательности из Wikidata по числу языковых разделов (sitelinks)
  async function wikidataTopPlaces(lat, lon, cityName, cityShort) {
    const sparql = `
      SELECT ?item ?itemLabel ?desc ?lat ?lon ?links (SAMPLE(?img) AS ?photo) WHERE {
        SERVICE wikibase:around {
          ?item wdt:P625 ?loc .
          bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
          bd:serviceParam wikibase:radius "10" .
        }
        ?item wikibase:sitelinks ?links .
        FILTER(?links >= 10)
        FILTER NOT EXISTS { ?item wdt:P31 wd:Q5 }
        FILTER NOT EXISTS { ?item wdt:P31 wd:Q515 }
        FILTER NOT EXISTS { ?item wdt:P31 wd:Q1549591 }
        FILTER NOT EXISTS { ?item wdt:P31 wd:Q3957 }
        FILTER NOT EXISTS { ?item wdt:P31 wd:Q79529 }
        FILTER NOT EXISTS { ?item wdt:P31 wd:Q2074737 }
        FILTER NOT EXISTS { ?item wdt:P31 wd:Q79007 }
        FILTER NOT EXISTS { ?item wdt:P31 wd:Q928830 }
        FILTER NOT EXISTS { ?item wdt:P31 wd:Q55488 }
        FILTER NOT EXISTS { ?item wdt:P31 wd:Q3918 }
        FILTER NOT EXISTS { ?item wdt:P31 wd:Q1656682 }
        BIND(geof:latitude(?loc) AS ?lat)
        BIND(geof:longitude(?loc) AS ?lon)
        OPTIONAL { ?item wdt:P18 ?img . }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en" . ?item rdfs:label ?itemLabel . ?item schema:description ?desc . }
      }
      GROUP BY ?item ?itemLabel ?desc ?lat ?lon ?links
      ORDER BY DESC(?links)
      LIMIT 40
    `.trim();
    const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql);
    const j = await fetchJSON(url, { headers: { Accept: 'application/sparql-results+json' } }, 8500);
    const cityN = String(cityName || '').toLowerCase();
    const out = [];
    for (const b of j?.results?.bindings || []) {
      const name = (b.itemLabel?.value || '').trim();
      const desc = (b.desc?.value || '').trim();
      const pLat = Number(b.lat?.value), pLon = Number(b.lon?.value);
      const links = Number(b.links?.value || 0);
      if (!name || !Number.isFinite(pLat) || !Number.isFinite(pLon)) continue;
      if (/^Q\d+$/.test(name) || name.toLowerCase() === cityN || WIKI_SKIP.test(desc + ' ' + name)) continue;
      const rawImg = b.photo?.value || '';
      const thumb = rawImg ? rawImg.replace(/^http:\/\//i, 'https://') + '?width=240' : '';
      const qid = (b.item?.value || '').split('/').pop() || name;
      out.push({
        id: 'wd-' + qid,
        name: name.replace(/\s*\([^)]*\)\s*$/, ''),
        city: cityShort,
        cat: guessPlaceCat(desc + ' ' + name),
        typeLabel: desc ? desc.charAt(0).toUpperCase() + desc.slice(1) : 'Достопримечательность',
        addr: '', hours: '', website: '', cuisine: '', free: false,
        wikiTag: 'ru:' + name,
        thumb,
        distKm: haversineKm(lat, lon, pLat, pLon),
        score: 10 + Math.min(90, links),
        lat: pLat, lon: pLon
      });
    }
    return out;
  }

  async function wikiPlaces(lat, lon, cityName, cityShort) {
    const url = 'https://ru.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=geosearch' +
      `&ggscoord=${lat}|${lon}&ggsradius=10000&ggslimit=100&prop=coordinates|pageimages|description&colimit=max&pilimit=max&pithumbsize=240`;
    const j = await fetchJSON(url, null, 9000);
    const pages = Object.values(j?.query?.pages || {});
    const cityN = String(cityName || '').toLowerCase();
    return pages.filter(p => p.coordinates && p.coordinates[0] && p.title && p.title.toLowerCase() !== cityN && !WIKI_SKIP.test((p.description || '') + ' ' + p.title))
      .map(p => {
        const c = p.coordinates[0];
        return {
          id: 'wiki-' + p.pageid, name: p.title.replace(/\s*\([^)]*\)\s*$/, ''), city: cityShort,
          cat: guessPlaceCat((p.description || '') + ' ' + p.title),
          typeLabel: p.description ? p.description.charAt(0).toUpperCase() + p.description.slice(1) : 'Достопримечательность',
          addr: '', hours: '', website: '', cuisine: '', free: false,
          wikiTag: 'ru:' + p.title, thumb: p.thumbnail?.source || '',
          distKm: haversineKm(lat, lon, c.lat, c.lon),
          score: 3 + (p.thumbnail ? 2 : 0) + (p.description ? 1 : 0),
          lat: c.lat, lon: c.lon
        };
      });
  }

  // Объединить: одно и то же место из Википедии/Wikidata и OSM — один раз
  function mergePlaces(a, b) {
    const out = a.slice();
    const norm = s => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
    for (const p of b) {
      const n = norm(p.name);
      const dup = out.find(x => norm(x.name) === n || (haversineKm(x.lat, x.lon, p.lat, p.lon) < 0.08 && (norm(x.name).includes(n) || n.includes(norm(x.name)))));
      if (dup) { // берём лучшее из обоих: часы и сайт из OSM, фото из Википедии
        ['hours', 'website', 'cuisine', 'addr'].forEach(k => { if (!dup[k] && p[k]) dup[k] = p[k]; });
        if (p.free) dup.free = true;
        if (!dup.thumb && p.thumb) dup.thumb = p.thumb;
        dup.score = Math.max(dup.score, p.score);
      } else out.push(p);
    }
    return out.sort((x, y) => y.score - x.score || x.distKm - y.distKm);
  }

  async function fetchCityData(city) {
    const key = city.trim().toLowerCase();
    if (cityCache.has(key)) return cityCache.get(key);
    const saved = lsRead(key);
    if (saved) { cityCache.set(key, saved); return saved; }

    let nomJson;
    try {
      nomJson = await fetchJSON(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ru&q=${encodeURIComponent(city)}`, null, 10000);
    } catch (_) { throw new Error('Нет связи с сервисом поиска. Проверьте интернет и попробуйте ещё раз'); }
    if (!nomJson.length) throw new Error(`Город «${city}» не найден`);

    const geo = nomJson[0];
    const lat = Number(geo.lat), lon = Number(geo.lon);
    const cityShort = geo.display_name.split(',')[0].trim();

    const wikiP = fetchJSON(`https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(city)}`, null, 8000).catch(() => null);
    const wdP = wikidataTopPlaces(lat, lon, city, cityShort).catch(() => []);
    const listP = wikiPlaces(lat, lon, city, cityShort).catch(() => []);
    const ovFull = overpassPlaces(lat, lon, cityShort, 30000);
    // Википедия/Wikidata отвечают быстро; если мест уже хватает, OSM ждём недолго
    const ovQuick = Promise.all([wdP, listP]).then(([wd, l]) => Promise.race([ovFull, new Promise(res => setTimeout(() => res(null), wd.length + l.length >= 15 ? 2500 : 7000))])).catch(() => null);

    const [wiki, wdList, wList, ov] = await Promise.all([wikiP, wdP, listP, ovQuick]);
    const places = mergePlaces(mergePlaces(wdList, wList), ov || []);
    if (!places.length) throw new Error('Не удалось загрузить места: сервисы карт перегружены. Попробуйте ещё раз через минуту');

    const result = {
      city,
      displayName: (geo.display_name || city).split(',').slice(0, 2).join(', '),
      lat, lon,
      wiki: wiki && wiki.extract ? {
        title: wiki.title,
        extract: wiki.extract,
        url: safeUrl(wiki.content_urls?.mobile?.page || wiki.content_urls?.desktop?.page || wikiUrlFromTag('ru:' + (wiki.title || city)))
      } : null,
      places
    };
    cityCache.set(key, result);
    lsWrite(key, result);
    // OSM ответил позже — дополним сохранённый город (будет видно при следующем открытии)
    if (!ov) ovFull.then(list => { if (list && list.length) { result.places = mergePlaces(result.places, list); lsWrite(key, result); } }).catch(() => {});
    return result;
  }

  async function enrichPlaceWiki(place) {
    if (wikiCache.has(place.id)) return wikiCache.get(place.id);
    let info = null;
    try {
      let ruTitle = '';
      let origLang = '';
      let origTitle = '';

      if (place.wikiTag) {
        const idx = place.wikiTag.indexOf(':');
        if (idx > 0) {
          origLang = place.wikiTag.slice(0, idx);
          origTitle = place.wikiTag.slice(idx + 1);
          if (origLang === 'ru') ruTitle = origTitle;
        } else {
          ruTitle = place.wikiTag;
        }
      }

      if (!ruTitle && origLang && origTitle) {
        const llUrl = `https://${encodeURIComponent(origLang)}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(origTitle)}&prop=langlinks&lllang=ru&format=json&origin=*`;
        const llRes = await fetch(llUrl).then(r => (r.ok ? r.json() : null));
        const pages = llRes?.query?.pages ? Object.values(llRes.query.pages) : [];
        ruTitle = pages[0]?.langlinks?.[0]?.['*'] || '';
      }

      if (!ruTitle) {
        const gUrl = `https://ru.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${place.lat}|${place.lon}&gsradius=200&gslimit=1&format=json&origin=*`;
        const gRes = await fetch(gUrl).then(r => (r.ok ? r.json() : null));
        ruTitle = gRes?.query?.geosearch?.[0]?.title || '';
      }

      if (ruTitle) {
        const sUrl = `https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(ruTitle)}`;
        const sRes = await fetch(sUrl).then(r => (r.ok ? r.json() : null));
        if (sRes && sRes.extract) {
          info = {
            extract: sRes.extract,
            thumb: sRes.thumbnail?.source || '',
            wikiUrl: safeUrl(sRes.content_urls?.mobile?.page || sRes.content_urls?.desktop?.page || wikiUrlFromTag('ru:' + ruTitle))
          };
        }
      }

      if (!info && origLang && origTitle) {
        const oUrl = `https://${encodeURIComponent(origLang)}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(origTitle)}`;
        const oRes = await fetch(oUrl).then(r => (r.ok ? r.json() : null));
        if (oRes?.thumbnail?.source || oRes?.content_urls) {
          info = {
            extract: '',
            thumb: oRes?.thumbnail?.source || '',
            wikiUrl: safeUrl(oRes?.content_urls?.mobile?.page || oRes?.content_urls?.desktop?.page || wikiUrlFromTag(place.wikiTag))
          };
        }
      }
    } catch (_) { /* игнорируем ошибки Wikipedia */ }
    wikiCache.set(place.id, info);
    return info;
  }

  STHub.registerService(ID, ctx => {
    const tripCity = (ctx.trip?.dest || '').trim();
    const initialCity = tripCity || ctx.store.get('lastCity', '').trim();

    const state = {
      tab: 'explore', // 'explore' | 'plan'
      city: initialCity,
      filter: 'all',
      query: '',
      limit: 20,
      loading: false,
      error: '',
      data: null,
      selectedId: null,
      map: null,
      markersLayer: null,
      markersById: new Map(),
      alive: true
    };

    const getSaved = () => ctx.store.get('saved', []);
    const setSaved = list => ctx.store.set('saved', list);

    function destroyMap() {
      if (state.map) {
        try { state.map.remove(); } catch (_) {}
        state.map = null;
        state.markersLayer = null;
        state.markersById.clear();
      }
    }

    function filteredPlaces() {
      const all = state.data?.places || [];
      const q = state.query.trim().toLowerCase();
      return all.filter(p => {
        const okCat = state.filter === 'all' ? true : (state.filter === 'free' ? p.free : p.cat === state.filter);
        const okQ = !q || p.name.toLowerCase().includes(q) || p.typeLabel.toLowerCase().includes(q) || p.addr.toLowerCase().includes(q);
        return okCat && okQ;
      });
    }

    function toggleSave(place) {
      const list = getSaved();
      const idx = list.findIndex(x => x.id === place.id);
      let added = false;
      if (idx >= 0) {
        list.splice(idx, 1);
        ctx.toast('Удалено из плана');
      } else {
        list.push({
          id: place.id,
          name: place.name,
          city: place.city || state.city,
          cat: place.cat,
          typeLabel: place.typeLabel,
          addr: place.addr || '',
          hours: place.hours || '',
          website: safeUrl(place.website),
          cuisine: place.cuisine || '',
          free: Boolean(place.free),
          lat: place.lat,
          lon: place.lon,
          thumb: place.thumb || '',
          wikiExtract: place.wikiExtract || '',
          wikiUrl: safeUrl(place.wikiUrl || wikiUrlFromTag(place.wikiTag)),
          visited: false
        });
        added = true;
        ctx.toast('Добавлено в план');
      }
      setSaved(list);
      return added;
    }

    function toggleVisited(id) {
      setSaved(getSaved().map(x => (x.id === id ? { ...x, visited: !x.visited } : x)));
    }

    function placeCardHtml(p, savedList, isPlanTab) {
      const savedItem = savedList.find(x => x.id === p.id);
      const isSaved = Boolean(savedItem);
      const isVisited = Boolean(savedItem?.visited);
      const gMap = googleMapsUrl(p, p.city || state.city);
      const web = safeUrl(p.website);
      const wikiLink = safeUrl(p.wikiUrl || wikiUrlFromTag(p.wikiTag));
      const distText = p.distKm != null ? `${formatDist(p.distKm)} от центра` : '';
      const snip = wikiSnippet(p.wikiExtract, 280);

      return `
        <div class="st-card st-guide-place${isPlanTab && isVisited ? ' st-guide-done' : ''}${!isPlanTab && state.selectedId === p.id ? ' highlight' : ''}" data-place-id="${esc(p.id)}">
          <div class="st-guide-place-hd">
            ${p.thumb
              ? `<img class="st-guide-thumb" src="${esc(p.thumb)}" alt="${esc(p.name)}">`
              : `<div class="st-guide-thumb-ph"><i data-lucide="map-pin"></i></div>`}
            <div style="flex:1;min-width:0">
              <div class="st-card-title">${esc(p.name)}</div>
              <div class="st-guide-badges">
                <span class="st-guide-badge">${esc(p.typeLabel)}</span>
                ${p.free ? '<span class="st-guide-badge free">Бесплатно</span>' : ''}
                ${distText ? `<span class="st-guide-badge dist">${esc(distText)}</span>` : ''}
              </div>
            </div>
          </div>
          ${p.wikiExtract
            ? `<div class="st-muted" data-wiki-txt>${esc(snip.short)}${snip.truncated ? `<button class="st-guide-more-txt" type="button" data-wiki-expand="${esc(p.id)}">Читать полностью</button>` : ''}</div>`
            : '<div class="st-muted" data-wiki-txt style="display:none"></div>'}
          <div class="st-guide-meta">
            ${p.addr ? `<div class="st-guide-meta-row"><i data-lucide="map-pin"></i><span>${esc(p.addr)}</span></div>` : ''}
            ${p.hours ? `<div class="st-guide-meta-row"><i data-lucide="clock"></i><span>${esc(p.hours)}</span></div>` : ''}
            ${p.cuisine ? `<div class="st-guide-meta-row"><i data-lucide="utensils"></i><span>${esc(p.cuisine)}</span></div>` : ''}
          </div>
          <div class="st-guide-actions">
            ${isPlanTab
              ? `<button class="st-btn ${isVisited ? 'st-btn-g' : ''}" type="button" data-guide-visit="${esc(p.id)}">
                   <i data-lucide="${isVisited ? 'rotate-ccw' : 'check'}"></i>${isVisited ? 'Не посещено' : 'Посещено'}
                 </button>`
              : `<button class="st-btn st-btn-g" type="button" data-guide-focus="${esc(p.id)}">
                   <i data-lucide="locate-fixed"></i>На карте
                 </button>`}
            <button class="st-btn ${isSaved ? 'st-btn-g' : ''}" type="button" data-guide-save="${esc(p.id)}">
              <i data-lucide="${isSaved ? 'bookmark-check' : 'bookmark'}"></i>${isSaved ? 'В плане' : 'В план'}
            </button>
            <a class="st-btn st-btn-g" href="${gMap}" target="_blank" rel="noopener noreferrer">
              <i data-lucide="map-pinned"></i>Карты
            </a>
            ${wikiLink ? `<a class="st-btn st-btn-g" data-wiki-link href="${esc(wikiLink)}" target="_blank" rel="noopener noreferrer"><i data-lucide="book-open"></i>Википедия</a>` : ''}
            ${web ? `<a class="st-btn st-btn-g" href="${esc(web)}" target="_blank" rel="noopener noreferrer"><i data-lucide="globe"></i>Сайт</a>` : ''}
          </div>
        </div>
      `;
    }

    async function loadCity(cityName, screen) {
      const clean = cityName.trim();
      if (!clean) return;
      state.city = clean;
      state.loading = true;
      state.error = '';
      state.limit = 20;
      state.selectedId = null;
      destroyMap();
      screen.refresh();

      try {
        const data = await fetchCityData(clean);
        if (!state.alive) return;
        state.data = data;
        state.loading = false;
        ctx.store.set('lastCity', clean);
        screen.refresh();
      } catch (err) {
        if (!state.alive) return;
        state.loading = false;
        state.error = err?.message || 'Ошибка загрузки города';
        screen.refresh();
      }
    }

    function enrichVisibleCards(places, body) {
      const toLoad = places.filter(p => !p.wikiChecked).slice(0, 12);
      if (!toLoad.length) return;
      toLoad.forEach(p => {
        p.wikiChecked = true;
        enrichPlaceWiki(p).then(w => {
          if (!state.alive || !w) return;
          p.wikiExtract = w.extract || '';
          p.thumb = w.thumb || p.thumb || '';
          if (w.wikiUrl) p.wikiUrl = w.wikiUrl;
          const card = body.querySelector(`[data-place-id="${CSS.escape(p.id)}"]`);
          if (!card) return;
          if (p.thumb) {
            const ph = card.querySelector('.st-guide-thumb-ph');
            if (ph) {
              const img = document.createElement('img');
              img.className = 'st-guide-thumb';
              img.src = p.thumb;
              img.alt = p.name;
              ph.replaceWith(img);
            }
          }
          if (p.wikiExtract) {
            const txt = card.querySelector('[data-wiki-txt]');
            if (txt) {
              const snip = wikiSnippet(p.wikiExtract, 280);
              txt.style.display = '';
              txt.innerHTML = `${esc(snip.short)}${snip.truncated ? `<button class="st-guide-more-txt" type="button" data-wiki-expand="${esc(p.id)}">Читать полностью</button>` : ''}`;
              txt.querySelector('[data-wiki-expand]')?.addEventListener('click', () => {
                const expanded = txt.dataset.expanded === '1';
                txt.dataset.expanded = expanded ? '0' : '1';
                txt.firstChild.textContent = expanded ? snip.short : snip.full;
                const b = txt.querySelector('[data-wiki-expand]');
                if (b) b.textContent = expanded ? 'Читать полностью' : 'Свернуть';
              });
            }
          }
          if (p.wikiUrl && !card.querySelector('[data-wiki-link]')) {
            const actions = card.querySelector('.st-guide-actions');
            if (actions) {
              const a = document.createElement('a');
              a.className = 'st-btn st-btn-g';
              a.setAttribute('data-wiki-link', '');
              a.href = p.wikiUrl;
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
              a.innerHTML = '<i data-lucide="book-open"></i>Википедия';
              actions.appendChild(a);
              if (typeof initializeIcons === 'function') initializeIcons(a);
            }
          }
        });
      });
    }

    function updateMapMarkers(body, screen) {
      if (!state.map || !state.markersLayer || !window.L) return;
      const L = window.L;
      state.markersLayer.clearLayers();
      state.markersById.clear();

      const savedIds = new Set(getSaved().map(x => x.id));
      const list = filteredPlaces().slice(0, 60);

      list.forEach(p => {
        const isSaved = savedIds.has(p.id);
        const marker = L.circleMarker([p.lat, p.lon], {
          radius: state.selectedId === p.id ? 9 : 7,
          color: '#ffffff',
          weight: 2,
          fillColor: isSaved ? '#16a34a' : '#5B4BEA',
          fillOpacity: 0.95
        });

        const wrap = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = p.name;
        const sub = document.createElement('div');
        sub.style.cssText = 'color:#666;font-size:12px;margin-top:2px';
        sub.textContent = p.typeLabel + (p.free ? ' • Бесплатно' : '');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'st-guide-pop-btn' + (isSaved ? ' saved' : '');
        btn.textContent = isSaved ? '✓ В плане (убрать)' : '+ В план';
        btn.addEventListener('click', () => {
          const added = toggleSave(p);
          btn.className = 'st-guide-pop-btn' + (added ? ' saved' : '');
          btn.textContent = added ? '✓ В плане (убрать)' : '+ В план';
          marker.setStyle({ fillColor: added ? '#16a34a' : '#5B4BEA' });
          updatePlanTabCount(body);
          updateCardSaveBtn(body, p.id, added);
        });
        wrap.append(title, sub, btn);
        marker.bindPopup(wrap);

        marker.on('click', () => {
          state.selectedId = p.id;
          body.querySelectorAll('.st-guide-place.highlight').forEach(el => el.classList.remove('highlight'));
          const card = body.querySelector(`[data-place-id="${CSS.escape(p.id)}"]`);
          if (card) card.classList.add('highlight');
        });

        marker.addTo(state.markersLayer);
        state.markersById.set(p.id, marker);
      });

      if (list.length > 0 && state.markersById.size > 0) {
        const bounds = L.latLngBounds(list.map(p => [p.lat, p.lon]));
        state.map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
      } else if (state.data) {
        state.map.setView([state.data.lat, state.data.lon], 13);
      }

      const info = body.querySelector('#st-guide-map-info');
      if (info) info.textContent = `На карте: ${list.length} мест`;
    }

    function initMap(body, screen) {
      const el = body.querySelector('#st-guide-map');
      if (!el || !state.data) return;
      destroyMap();
      loadLeaflet().then(L => {
        if (!state.alive || !document.body.contains(el)) return;
        const map = L.map(el, { zoomControl: true }).setView([state.data.lat, state.data.lon], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 19
        }).addTo(map);
        state.map = map;
        state.markersLayer = L.layerGroup().addTo(map);
        updateMapMarkers(body, screen);
        setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 80);
      }).catch(() => {
        const info = body.querySelector('#st-guide-map-info');
        if (info) info.textContent = 'Карта недоступна (проверьте интернет)';
      });
    }

    function updatePlanTabCount(body) {
      const tabBtn = body.querySelector('[data-guide-tab="plan"]');
      if (tabBtn) {
        const count = getSaved().length;
        tabBtn.innerHTML = `<i data-lucide="bookmark"></i>Мой план (${count})`;
        if (typeof initializeIcons === 'function') initializeIcons(tabBtn);
      }
    }

    function updateCardSaveBtn(body, placeId, isSaved) {
      const btn = body.querySelector(`[data-guide-save="${CSS.escape(placeId)}"]`);
      if (!btn) return;
      btn.className = `st-btn ${isSaved ? 'st-btn-g' : ''}`;
      btn.innerHTML = `<i data-lucide="${isSaved ? 'bookmark-check' : 'bookmark'}"></i>${isSaved ? 'В плане' : 'В план'}`;
      if (typeof initializeIcons === 'function') initializeIcons(btn);
    }

    function bindListEvents(container, body, screen) {
      container.querySelectorAll('[data-guide-save]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.guideSave;
          const place = (state.data?.places || []).find(x => x.id === id) || getSaved().find(x => x.id === id);
          if (!place) return;
          const added = toggleSave(place);
          if (state.tab === 'plan') {
            screen.refresh();
          } else {
            updateCardSaveBtn(body, id, added);
            updatePlanTabCount(body);
            const marker = state.markersById.get(id);
            if (marker) marker.setStyle({ fillColor: added ? '#16a34a' : '#5B4BEA' });
          }
        });
      });

      container.querySelectorAll('[data-guide-focus]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.guideFocus;
          state.selectedId = id;
          const marker = state.markersById.get(id);
          if (marker && state.map) {
            const mapEl = body.querySelector('#st-guide-map');
            if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            state.map.setView(marker.getLatLng(), Math.max(state.map.getZoom(), 15), { animate: true });
            marker.openPopup();
          }
          body.querySelectorAll('.st-guide-place.highlight').forEach(el => el.classList.remove('highlight'));
          body.querySelector(`[data-place-id="${CSS.escape(id)}"]`)?.classList.add('highlight');
        });
      });

      container.querySelectorAll('[data-guide-visit]').forEach(btn => {
        btn.addEventListener('click', () => {
          toggleVisited(btn.dataset.guideVisit);
          screen.refresh();
        });
      });

      container.querySelectorAll('[data-wiki-expand]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.wikiExpand;
          const txt = btn.closest('[data-wiki-txt]');
          const place = (state.data?.places || []).find(x => x.id === id) || getSaved().find(x => x.id === id);
          if (!txt || !place?.wikiExtract) return;
          const snip = wikiSnippet(place.wikiExtract, 280);
          const expanded = txt.dataset.expanded === '1';
          txt.dataset.expanded = expanded ? '0' : '1';
          txt.firstChild.textContent = expanded ? snip.short : snip.full;
          btn.textContent = expanded ? 'Читать полностью' : 'Свернуть';
        });
      });
    }

    const screenApi = ctx.openScreen({
      title: ctx.title,
      action: {
        icon: 'rotate-ccw',
        label: 'Сбросить',
        onClick: screen => {
          state.tab = 'explore';
          state.data = null;
          state.city = '';
          state.query = '';
          state.filter = 'all';
          state.error = '';
          destroyMap();
          screen.refresh();
        }
      },
      render(body, screen) {
        const saved = getSaved();
        const tabsHtml = `
          <div class="st-guide-tabs">
            <button class="st-guide-chip${state.tab === 'explore' ? ' on' : ''}" type="button" data-guide-tab="explore">
              <i data-lucide="map"></i>Поиск и карта
            </button>
            <button class="st-guide-chip${state.tab === 'plan' ? ' on' : ''}" type="button" data-guide-tab="plan">
              <i data-lucide="bookmark"></i>Мой план (${saved.length})
            </button>
          </div>
        `;

        if (state.tab === 'plan') {
          destroyMap();
          const visitedCount = saved.filter(x => x.visited).length;
          const pct = saved.length ? Math.round((visitedCount / saved.length) * 100) : 0;
          const headerCard = saved.length ? `
            <div class="st-card">
              <div class="st-card-title">Прогресс плана</div>
              <div class="st-muted">Посещено ${visitedCount} из ${saved.length} мест</div>
              <div class="st-guide-progress"><div style="width:${pct}%"></div></div>
            </div>
            <div class="st-guide-route-hint">
              <i data-lucide="route"></i>
              <div>Эти места уже доступны в модуле <strong>«Маршрут»</strong> — откройте его на главной, чтобы выстроить путь на карте.</div>
            </div>
          ` : '';
          const listHtml = saved.length
            ? saved.map(p => placeCardHtml(p, saved, true)).join('')
            : '<div class="st-empty"><i data-lucide="bookmark"></i><div>План пока пуст. Отметьте места на карте или в списке, чтобы потом построить маршрут.</div></div>';
          body.innerHTML = tabsHtml + headerCard + listHtml;
          bindListEvents(body, body, screen);

        } else {
          const searchBarHtml = `
            <form class="st-guide-search" id="st-guide-city-form">
              <input class="st-input" id="st-guide-city-inp" value="${esc(state.city)}" placeholder="Город, например: Кёльн или Рим">
              <button class="st-btn" type="submit"><i data-lucide="search"></i>Найти</button>
            </form>
            <div class="st-guide-tabs">
              ${QUICK_CITIES.map(c =>
                `<button class="st-guide-chip${state.city.toLowerCase() === c.toLowerCase() ? ' on' : ''}" type="button" data-quick-city="${esc(c)}">${esc(c)}</button>`
              ).join('')}
            </div>
          `;

          if (state.loading) {
            body.innerHTML = tabsHtml + searchBarHtml + '<div class="st-empty"><i data-lucide="loader-circle"></i><div>Загружаю карту и интересные места…</div></div>';
          } else if (state.error) {
            body.innerHTML = tabsHtml + searchBarHtml + `<div class="st-empty"><i data-lucide="alert-circle"></i><div>${esc(state.error)}</div></div>`;
          } else if (!state.data) {
            body.innerHTML = tabsHtml + searchBarHtml + '<div class="st-empty"><i data-lucide="compass"></i><div>Введите город или выберите из списка выше, чтобы увидеть места на карте.</div></div>';
          } else {
            const list = filteredPlaces();
            const visible = list.slice(0, state.limit);
            body.innerHTML = `
              ${tabsHtml}
              ${searchBarHtml}
              <div class="st-card">
                <div class="st-guide-city-hd">
                  <div>
                    <div class="st-card-title">${esc(state.data.displayName)}</div>
                    <div class="st-muted">Найдено мест: ${state.data.places.length}</div>
                  </div>
                  ${state.data.wiki?.url ? `<a class="st-btn st-btn-g" style="min-height:32px;padding:0 10px;font-size:.76rem;border-radius:10px;text-decoration:none" href="${esc(state.data.wiki.url)}" target="_blank" rel="noopener noreferrer"><i data-lucide="book-open"></i>Википедия</a>` : ''}
                </div>
                ${state.data.wiki?.extract ? (() => {
                  const cs = wikiSnippet(state.data.wiki.extract, 280);
                  return `<div class="st-guide-city-wiki" data-city-wiki>${esc(cs.short)}${cs.truncated ? '<button class="st-guide-more-txt" type="button" id="st-guide-city-more">Читать полностью</button>' : ''}</div>`;
                })() : ''}
              </div>
              <div class="st-guide-map-wrap">
                <div class="st-guide-map" id="st-guide-map"></div>
                <div class="st-guide-map-bar">
                  <span id="st-guide-map-info">Загрузка карты…</span>
                  <span>Нажмите на точку на карте</span>
                </div>
              </div>
              <div class="st-guide-tabs">
                ${FILTERS.map(f => {
                  const active = state.filter === f.id;
                  const cls = active ? (f.id === 'free' ? ' free-on' : ' on') : '';
                  return `<button class="st-guide-chip${cls}" type="button" data-cat-filter="${f.id}"><i data-lucide="${f.icon}"></i>${esc(f.label)}</button>`;
                }).join('')}
              </div>
              <input class="st-input" id="st-guide-q" value="${esc(state.query)}" placeholder="Фильтр по названию, улице или типу…">
              <div id="st-guide-list" style="display:flex;flex-direction:column;gap:12px">
                ${visible.length
                  ? visible.map(p => placeCardHtml(p, saved, false)).join('')
                  : '<div class="st-empty"><i data-lucide="search-x"></i><div>Ничего не найдено по этому фильтру</div></div>'}
              </div>
              ${list.length > state.limit
                ? `<button class="st-btn st-btn-g st-btn-fw" type="button" id="st-guide-more">Показать ещё (${list.length - state.limit})</button>`
                : ''}
            `;

            initMap(body, screen);
            enrichVisibleCards(visible, body);
            bindListEvents(body, body, screen);
          }
        }

        body.querySelectorAll('[data-guide-tab]').forEach(btn => {
          btn.addEventListener('click', () => {
            state.tab = btn.dataset.guideTab;
            screen.refresh();
          });
        });

        body.querySelector('#st-guide-city-form')?.addEventListener('submit', e => {
          e.preventDefault();
          const val = body.querySelector('#st-guide-city-inp')?.value || '';
          loadCity(val, screen);
        });

        body.querySelectorAll('[data-quick-city]').forEach(btn => {
          btn.addEventListener('click', () => loadCity(btn.dataset.quickCity, screen));
        });

        body.querySelectorAll('[data-cat-filter]').forEach(btn => {
          btn.addEventListener('click', () => {
            state.filter = btn.dataset.catFilter;
            state.limit = 20;
            screen.refresh();
          });
        });

        body.querySelector('#st-guide-q')?.addEventListener('input', e => {
          state.query = e.target.value;
          state.limit = 20;
          const box = body.querySelector('#st-guide-list');
          if (!box || !state.data) return;
          const list = filteredPlaces();
          const visible = list.slice(0, state.limit);
          const savedNow = getSaved();
          box.innerHTML = visible.length
            ? visible.map(p => placeCardHtml(p, savedNow, false)).join('')
            : '<div class="st-empty"><i data-lucide="search-x"></i><div>Ничего не найдено</div></div>';
          if (typeof initializeIcons === 'function') initializeIcons(box);
          bindListEvents(box, body, screen);
          enrichVisibleCards(visible, body);
          updateMapMarkers(body, screen);
        });

        body.querySelector('#st-guide-more')?.addEventListener('click', () => {
          state.limit += 20;
          screen.refresh();
        });

        body.querySelector('#st-guide-city-more')?.addEventListener('click', e => {
          const box = body.querySelector('[data-city-wiki]');
          if (!box || !state.data?.wiki?.extract) return;
          const cs = wikiSnippet(state.data.wiki.extract, 280);
          const expanded = box.dataset.expanded === '1';
          box.dataset.expanded = expanded ? '0' : '1';
          box.firstChild.textContent = expanded ? cs.short : cs.full;
          e.currentTarget.textContent = expanded ? 'Читать полностью' : 'Свернуть';
        });
      }
    });

    // Автоматически загружаем город поездки или последний открытый город
    if (initialCity && !state.data) {
      loadCity(initialCity, screenApi);
    }
  });
})();
