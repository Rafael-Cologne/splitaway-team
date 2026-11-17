// ============================================================
// Фото места для поездки и погоды (window.STPlacePhoto)
// ------------------------------------------------------------
// По названию поездки / направлению / городу находим место в Wikidata
// и берём его фото из Wikimedia Commons (бесплатно, без ключа):
//   P948 — широкая заставка Wikivoyage (для карточки поездки),
//   P18  — главное фото места (для погоды).
// Карты, флаги, гербы и схемы отбрасываем. Результат кэшируется
// на устройстве на 30 дней. Лицензии фото — на странице файла в Commons.
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
  const fileOf = v => decodeURIComponent(String(v).split('/Special:FilePath/')[1] || '');
  const urlOf = (file, w) => 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(file) + '?width=' + (w || 1000);

  // Поиск места: несколько кандидатов → первый с координатами (и рядом с lat/lon, если они есть)
  async function lookup(q, lat, lon, prefer) {
    let ids = [];
    for (const lang of ['ru', 'en']) {
      const s = await getJSON(API + '&action=wbsearchentities&type=item&limit=6&language=' + lang + '&uselang=' + lang + '&search=' + encodeURIComponent(q));
      ids = (s.search || []).map(x => x.id);
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
    return file ? { file, id } : null;
  }

  function key(q, o) { return 'st_photo_' + norm(q) + '|' + (o.prefer || 'photo') + '|' + (o.lat != null ? (+o.lat).toFixed(1) + ',' + (+o.lon).toFixed(1) : ''); }
  function wrap(hit, o) { return hit ? { url: urlOf(hit.file, o.width), file: hit.file, page: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(hit.file.replace(/ /g, '_')), credit: 'Фото: Wikimedia Commons' } : null; }

  // Синхронно: уже найденное фото (или undefined, если ещё не искали)
  function peek(q, opts) {
    const o = opts || {}, k = key(clean(q) || q, o), c = mem[k] || lsGet(k);
    if (!c || Date.now() - c.t > (c.hit ? 30 : 1) * DAY) return undefined;
    return wrap(c.hit, o);
  }
  // Асинхронно: найти фото места (или null)
  function photo(q, opts) {
    const o = opts || {}, name = clean(q) || String(q || '').trim();
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
  // Поездка: сначала направление (город/страна), потом название поездки
  const tripQueries = t => [t && t.dest, t && t.name].map(x => clean(x)).filter((x, i, a) => x && a.indexOf(x) === i);
  function peekTrip(trip, opts) {
    for (const q of tripQueries(trip)) { const r = peek(q, Object.assign({ prefer: 'banner' }, opts)); if (r === undefined) return undefined; if (r) return r; }
    return null;
  }
  async function forTrip(trip, opts) {
    for (const q of tripQueries(trip)) { const r = await photo(q, Object.assign({ prefer: 'banner' }, opts)); if (r) return r; }
    return null;
  }
  // Поставить фото поездки в <img> (если не найдено — остаётся картинка по умолчанию)
  function tripImg(img, trip, opts) {
    if (!img || !trip) return;
    const set = r => { if (r && img.isConnected) { img.src = r.url; img.title = r.credit; img.dataset.place = '1'; } };
    const now = peekTrip(trip, opts);
    if (now) set(now); else if (now === undefined) forTrip(trip, opts).then(set);
  }

  window.STPlacePhoto = { photo, peek, forTrip, peekTrip, tripImg, clean };
})();
