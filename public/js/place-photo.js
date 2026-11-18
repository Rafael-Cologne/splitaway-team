// ============================================================
// Фото места для поездки и погоды (window.STPlacePhoto)
// ------------------------------------------------------------
// По названию поездки / направлению / городу находим место в Wikidata
// и берём его фото из Wikimedia Commons (бесплатно, без ключа):
//   P948 — широкая заставка Wikivoyage (для карточки поездки),
//   P18  — главное фото места (для погоды).
// Карты, флаги, гербы и схемы отбрасываем. Результат кэшируется
// на устройстве на 30 дней. Нет места в названии/направлении → нейтральная картинка
// /img/trips/abstract.jpg (её ставит сама карточка). Лицензии фото — на странице файла в Commons.
// ============================================================
(function () {
  'use strict';
  const API = 'https://www.wikidata.org/w/api.php?format=json&origin=*';
  const SPARQL = 'https://query.wikidata.org/sparql?format=json&query=';
  const COUNTRY = new Set(['Q6256', 'Q3624078', 'Q7275', 'Q3336843', 'Q1763527', 'Q10742']);
  const BAD = /\.svg$|map|karte|карта|location|locator|satellite|flag|coat[ _]of[ _]arms|wappen|logo|diagram|seal/i;
  const STOP = new Set(['test', 'тест', 'trip', 'поездка', 'отпуск', 'путешествие', 'urlaub', 'reise', 'vacation', 'holiday', 'каникулы', 'тур', 'tour', 'в', 'во', 'на', 'nach', 'to', 'in', 'и', 'and', 'und']);
  const DAY = 86400000;
  const mem = {};

  const lsGet = k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').trim();
  // «Испания 2026», «TEST — Отпуск в Кёльне» → «Испания», «Кёльне»
  const clean = s => String(s || '').split(/[\s—–\-_,.;:!?()"«»/|+]+/)
    .filter(w => w && !/\d/.test(w) && !STOP.has(norm(w))).join(' ').trim();
  function dist(a, b, c, d) {
    const r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r;
    const h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  }
  async function getJSON(url, ms) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms || 9000);
    try { const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/sparql-results+json, application/json' } }); if (!r.ok) throw new Error('http ' + r.status); return await r.json(); }
    finally { clearTimeout(t); }
  }
  function sameName(a, b) {
    a = norm(a).replace(/[^a-zа-я0-9]+/g, ' ').trim(); b = norm(b).replace(/[^a-zа-я0-9]+/g, ' ').trim();
    if (!a || !b) return false; if (a === b) return true;
    if (b.length >= 3 && a.startsWith(b) && a.length - b.length <= 2) return true; // «Риме» → «Рим»
    let i = 0; while (i < a.length && a[i] === b[i]) i++;
    return i >= Math.max(4, Math.max(a.length, b.length) - 2);
  }
  const fileOf = v => decodeURIComponent(String(v).split('/Special:FilePath/')[1] || '');
  const urlOf = (file, w) => 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(file) + '?width=' + (w || 1000);

  // Поиск места: несколько кандидатов → первый с координатами (и рядом с lat/lon, если они есть)
  async function lookup(q, lat, lon, prefer) {
    let ids = [];
    for (const lang of ['ru', 'en']) {
      const s = await getJSON(API + '&action=wbsearchentities&type=item&limit=6&language=' + lang + '&uselang=' + lang + '&search=' + encodeURIComponent(q));
      // только точное название (или падежная форма: «Кёльне» → «Кёльн»), а не «Тест» → «Тестово»
      ids = (s.search || []).filter(x => sameName(q, (x.match && x.match.text) || x.label)).map(x => x.id);
      if (ids.length) break;
    }
    if (!ids.length) return null;
    const sparql = 'SELECT ?item ?coord ?banner ?image ?type WHERE { VALUES ?item {' + ids.map(i => 'wd:' + i).join(' ') + '} ' +
      'OPTIONAL{?item wdt:P625 ?coord} OPTIONAL{?item wdt:P948 ?banner} OPTIONAL{?item wdt:P18 ?image} OPTIONAL{?item wdt:P31 ?type} }';
    const j = await getJSON(SPARQL + encodeURIComponent(sparql), 12000);
    const by = {};
    (j.results.bindings || []).forEach(b => {
      const id = b.item.value.split('/').pop();
      const o = by[id] || (by[id] = { coord: null, banners: [], images: [], country: false });
      if (b.coord && !o.coord) { const m = b.coord.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/); if (m) o.coord = [+m[2], +m[1]]; }
      if (b.banner) { const f = fileOf(b.banner.value); if (f && !o.banners.includes(f)) o.banners.push(f); }
      if (b.image) { const f = fileOf(b.image.value); if (f && !o.images.includes(f)) o.images.push(f); }
      if (b.type && COUNTRY.has(b.type.value.split('/').pop())) o.country = true;
    });
    const near = o => lat == null || (o.coord && dist(lat, lon, o.coord[0], o.coord[1]) <= (o.country ? 1500 : 80));
    const id = ids.find(i => by[i] && by[i].coord && near(by[i]));
    if (!id) return null;
    const o = by[id];
    const banner = o.banners.find(f => !BAD.test(f));
    const image = o.images.find(f => !BAD.test(f));
    const file = (prefer === 'banner' || o.country) ? (banner || image) : (image || banner);
    return file ? { file, id, country: !!o.country } : null;
  }

  function key(q, o) { return 'st_photo3_' + norm(q) + '|' + (o.prefer || 'photo') + '|' + (o.lat != null ? (+o.lat).toFixed(1) + ',' + (+o.lon).toFixed(1) : ''); }
  function wrap(hit, o) { return hit ? { country: !!hit.country, url: urlOf(hit.file, o.width), file: hit.file, page: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(hit.file.replace(/ /g, '_')), credit: 'Фото: Wikimedia Commons' } : null; }

  // Синхронно: уже найденное фото (или undefined, если ещё не искали)
  function peek(q, opts) {
    const o = opts || {}, name = clean(q); if (!name) return null; // «Тест», «Поездка 2026» — не место
    const k = key(name, o), c = mem[k] || lsGet(k);
    if (!c || Date.now() - c.t > (c.hit ? 30 : 1) * DAY) return undefined;
    return wrap(c.hit, o);
  }
  // Асинхронно: найти фото места (или null)
  function photo(q, opts) {
    const o = opts || {}, name = clean(q);
    if (!name) return Promise.resolve(null);
    const k = key(name, o);
    const c = mem[k] || lsGet(k);
    if (c && Date.now() - c.t < (c.hit ? 30 : 1) * DAY) return Promise.resolve(wrap(c.hit, o));
    if (mem[k] && mem[k].p) return mem[k].p.then(h => wrap(h, o));
    const p = lookup(name, o.lat, o.lon, o.prefer).catch(() => null).then(hit => {
      mem[k] = { t: Date.now(), hit }; lsSet(k, mem[k]); return hit;
    });
    mem[k] = { p };
    return p.then(h => wrap(h, o));
  }
  // Поездка: название и направление. Город важнее страны: «Берлин» + «Германия» → фото Берлина,
  // а не общая картинка Германии. Страна — только если города нет.
  const tripQueries = t => [t && t.name, t && t.dest].map(x => clean(x)).filter((x, i, a) => x && a.indexOf(x) === i);
  const bestOf = list => list.find(r => r && !r.country) || list.find(Boolean) || null;
  function peekTrip(trip, opts) {
    const list = [];
    for (const q of tripQueries(trip)) { const r = peek(q, Object.assign({ prefer: 'banner' }, opts)); if (r === undefined) return undefined; list.push(r); }
    return bestOf(list);
  }
  async function forTrip(trip, opts) {
    const list = [];
    for (const q of tripQueries(trip)) list.push(await photo(q, Object.assign({ prefer: 'banner' }, opts)));
    return bestOf(list);
  }
  // Поставить фото поездки в <img> (если не найдено — остаётся картинка по умолчанию)
  function tripImg(img, trip, opts) {
    if (!img || !trip) return;
    const set = r => { if (r && img.isConnected) { img.src = r.url; img.title = r.credit; img.dataset.place = '1'; } };
    const now = peekTrip(trip, opts);
    if (now) set(now); else if (now === undefined) forTrip(trip, opts).then(set);
  }

  // ---------- Фото места «по погоде»: дождь, снег, туман, ночь ----------
  // Ищем в Wikimedia Commons снимки, где в названии файла есть и город, и погода
  // («Köln Altstadt Schnee», «Rain in Paris, rue du Pont Neuf»). Не нашли → обычное фото места.
  const MOOD = {
    rain: { en: 'rain', de: 'Regen', fr: 'pluie', es: 'lluvia', it: 'pioggia' },
    snow: { en: 'snow', de: 'Schnee', fr: 'neige', es: 'nieve', it: 'neve' },
    fog: { en: 'fog', de: 'Nebel', fr: 'brouillard', es: 'niebla', it: 'nebbia' },
    night: { en: 'night', de: 'Nacht', fr: 'nuit', es: 'noche', it: 'notte' }
  };
  const MOOD_BAD = /tate|painting|gemälde|engrav|lithogra|drawing|museum|oil on|aquarel|watercolou?r|\b1[5-8]\d\d\b|360|panorama|^file:\(|map|karte|logo|parade|pride|poster|stamp|truck|airport|flughafen|aeropuerto|car\b|bus\b|tram|train\b|zug\b|bird|vogel|dog|cat\b|insect|flower|blume|plant|portrait|interior|window|close.?up|detail|sign\b|graffiti|food/i;
  const MOOD_GOOD = /skyline|view|panorama|street|straße|strasse|rue|calle|via|square|platz|plaza|piazza|old town|altstadt|cathedral|dom\b|kathedrale|bridge|brücke|pont|puente|river|rhein|harbou?r|hafen|port|center|centre|zentrum|downtown|city/i;
  async function labelsOf(id) {
    const j = await getJSON(API + '&action=wbgetentities&props=labels&languages=en|de|fr|es|it&ids=' + id);
    const L = (j.entities && j.entities[id] && j.entities[id].labels) || {};
    const out = {}; Object.keys(L).forEach(k => { out[k] = L[k].value; }); return out;
  }
  async function moodLookup(id, mood) {
    const L = await labelsOf(id), seen = new Set();
    for (const lang of ['en', 'de', 'fr', 'es', 'it']) {
      const name = L[lang]; if (!name || seen.has(name)) continue; seen.add(name);
      const q = 'intitle:"' + name.replace(/"/g, '') + '" intitle:' + MOOD[mood][lang] + ' filetype:bitmap';
      const j = await getJSON('https://commons.wikimedia.org/w/api.php?format=json&origin=*&action=query&generator=search&gsrnamespace=6&gsrlimit=20&prop=imageinfo&iiprop=size&gsrsearch=' + encodeURIComponent(q), 10000);
      const pages = Object.values((j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index)
        .filter(p => { const ii = p.imageinfo && p.imageinfo[0]; return ii && ii.width >= 1000 && ii.width >= ii.height * 1.15 && !MOOD_BAD.test(p.title); });
      if (!pages.length) continue;
      const score = p => (MOOD_GOOD.test(p.title) ? 2 : 0) + (norm(p.title.replace(/^File:/, '')).startsWith(norm(name)) ? 1 : 0);
      const best = pages.reduce((m, p) => score(p) > score(m) ? p : m, pages[0]);
      return { file: best.title.replace(/^File:/, ''), id };
    }
    return null;
  }
  const moodKey = (q, o) => 'st_photo2_mood_' + norm(q) + '|' + o.mood + '|' + (o.lat != null ? (+o.lat).toFixed(1) + ',' + (+o.lon).toFixed(1) : '');
  function peekMood(q, opts) {
    const o = opts || {}; if (!MOOD[o.mood] || !clean(q)) return null;
    const c = mem[moodKey(clean(q), o)] || lsGet(moodKey(clean(q), o));
    if (!c || !('hit' in c) || Date.now() - c.t > (c.hit ? 30 : 3) * DAY) return undefined;
    return wrap(c.hit, o);
  }
  async function moodPhoto(q, opts) {
    const o = opts || {}, name = clean(q);
    if (!name || !MOOD[o.mood]) return null;
    const k = moodKey(name, o), c = mem[k] || lsGet(k);
    if (c && 'hit' in c && Date.now() - c.t < (c.hit ? 30 : 3) * DAY) return wrap(c.hit, o);
    if (mem[k] && mem[k].p) return mem[k].p.then(h => wrap(h, o));
    const p = (async () => {
      await photo(q, o); // находит место (и его id в Wikidata), заодно кэширует обычное фото
      const base = mem[key(name, o)] || lsGet(key(name, o));
      const id = base && base.hit && base.hit.id;
      return id ? moodLookup(id, o.mood) : null;
    })().catch(() => null).then(hit => { mem[k] = { t: Date.now(), hit }; lsSet(k, mem[k]); return hit; });
    mem[k] = { p };
    return p.then(h => wrap(h, o));
  }

  window.STPlacePhoto = { photo, peek, forTrip, peekTrip, tripImg, clean, moodPhoto, peekMood };
})();
