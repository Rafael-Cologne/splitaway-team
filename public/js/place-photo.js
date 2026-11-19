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
  // Природа и море — для заставок по шаблону Рафаэля (горы/озёра/парки → «Природа», острова/пляжи → «Отпуск»)
  const NATURE = new Set(['Q8502', 'Q46831', 'Q23397', 'Q46169', 'Q35666', 'Q39816', 'Q179049', 'Q45776', 'Q473972', 'Q1437459']);
  const BEACH = new Set(['Q23442', 'Q40080', 'Q33837', 'Q42523', 'Q1640628']);
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
    const sparql = 'SELECT ?item ?coord ?banner ?image ?type ?iso WHERE { VALUES ?item {' + ids.map(i => 'wd:' + i).join(' ') + '} ' +
      'OPTIONAL{?item wdt:P625 ?coord} OPTIONAL{?item wdt:P948 ?banner} OPTIONAL{?item wdt:P18 ?image} OPTIONAL{?item wdt:P31 ?type} OPTIONAL{?item wdt:P297 ?iso} }';
    const j = await getJSON(SPARQL + encodeURIComponent(sparql), 12000);
    const by = {};
    (j.results.bindings || []).forEach(b => {
      const id = b.item.value.split('/').pop();
      const o = by[id] || (by[id] = { coord: null, banners: [], images: [], country: false });
      if (b.coord && !o.coord) { const m = b.coord.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/); if (m) o.coord = [+m[2], +m[1]]; }
      if (b.banner) { const f = fileOf(b.banner.value); if (f && !o.banners.includes(f)) o.banners.push(f); }
      if (b.image) { const f = fileOf(b.image.value); if (f && !o.images.includes(f)) o.images.push(f); }
      if (b.type && COUNTRY.has(b.type.value.split('/').pop())) o.country = true;
      if (b.type) (o.types || (o.types = [])).push(b.type.value.split('/').pop());
      if (b.iso && /^[A-Za-z]{2}$/.test(b.iso.value)) o.iso = b.iso.value.toLowerCase();
    });
    const near = o => lat == null || (o.coord && dist(lat, lon, o.coord[0], o.coord[1]) <= (o.country ? 1500 : 80));
    const id = ids.find(i => by[i] && by[i].coord && near(by[i]));
    if (!id) return null;
    const o = by[id];
    // страна → её флаг (flagcdn.com, бесплатно); фото страны слишком общее
    if (o.country && o.iso) return { flag: o.iso, id, country: true };
    const ts = o.types || [];
    if (ts.some(t => NATURE.has(t))) return { kind: 'nature', id };
    if (ts.some(t => BEACH.has(t))) return { kind: 'beach', id };
    const banner = o.banners.find(f => !BAD.test(f));
    const image = o.images.find(f => !BAD.test(f));
    const file = (prefer === 'banner' || o.country) ? (banner || image) : (image || banner);
    return file ? { file, id, country: !!o.country } : null;
  }

  function key(q, o) { return 'st_photo5_' + norm(q) + '|' + (o.prefer || 'photo') + '|' + (o.lat != null ? (+o.lat).toFixed(1) + ',' + (+o.lon).toFixed(1) : ''); }
  function wrap(hit, o) {
    if (hit && hit.kind) return { kind: hit.kind, id: hit.id, url: '/img/covers/' + hit.kind + '.webp', cover: hit.kind, file: '', page: '', credit: '' };
    if (hit && hit.flag) return { id: hit.id, country: true, flag: hit.flag, url: 'https://flagcdn.com/w1280/' + hit.flag + '.png', file: '', page: 'https://flagcdn.com', credit: 'Флаг: flagcdn.com' };
    return hit ? { id: hit.id, country: !!hit.country, url: urlOf(hit.file, o.width), file: hit.file, page: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(hit.file.replace(/ /g, '_')), credit: 'Фото: Wikimedia Commons' } : null;
  }

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
    // запоминаем только настоящий ответ; сбой сети (Wikidata не ответила) не кэшируем — в следующий раз ищем снова
    const p = lookup(name, o.lat, o.lon, o.prefer).then(hit => {
      mem[k] = { t: Date.now(), hit }; lsSet(k, mem[k]); return hit;
    }, () => { delete mem[k]; return null; });
    mem[k] = { p };
    return p.then(h => wrap(h, o));
  }
  // Поездка: название и направление. Город важнее страны: «Берлин» + «Германия» → фото Берлина,
  // а не общая картинка Германии. Если указана только страна — её флаг; ничего — нейтральная картинка.
  // ---------- Заставка поездки по шаблону (8 стилей) ----------
  // флаг страны · силуэт города (готовые картинки) · природа · карта с маршрутом · вещи путешественника (места нет)
  // · контурный город · глобус (кругосветка / континент) · пляж. Неизвестный город — его фото в сумеречных тонах.
  const COVER = '/img/covers/';
  const CITY_COVERS = new Set(['Q64', 'Q365']); // Берлин, Кёльн — остальные города добавятся картинками /img/covers/q<ID>.webp
  const GLOBAL_RE = /кругосвет|вокруг света|(^|\s)мир(\s|$)|world|weltreise|европ|europ|ази[яи]|asia|африк|afrik|africa|америк|amerik|america|океани|скандинав|балкан/i;
  const MULTI_RE = /→|->|;|\s[-–—]\s|\sи\s|\+/;
  const cover = k => ({ url: COVER + k + '.webp', cover: k, credit: '', file: '', page: '' });
  // «Берлин, Германия» → [Берлин, Германия]; «Италия → Франция» → [Италия, Франция]
  const tripQueries = t => [t && t.name].concat(String((t && t.dest) || '').split(/[,;/]|→|->|\s[-–—]\s|\sи\s|\+/))
    .map(x => clean(x)).filter((x, i, a) => x && a.indexOf(x) === i);
  // Город важнее; только страна («Германия») — флаг страны
  const bestOf = list => list.find(r => r && !r.country && !r.kind) || list.find(r => r && r.kind) || list.find(r => r && r.flag) || null;
  function special(trip) {
    const txt = [trip && trip.name, trip && trip.dest].filter(Boolean).join(' ');
    if (GLOBAL_RE.test(txt)) return cover('global');
    if (MULTI_RE.test(String((trip && trip.dest) || ''))) return cover('route');
    return null;
  }
  function decorate(list) {
    const flags = [...new Set(list.filter(r => r && r.flag).map(r => r.flag))];
    if (flags.length >= 2 && !list.some(r => r && !r.country && !r.kind)) return cover('route'); // «Италия, Франция»
    const r = bestOf(list);
    if (!r) return cover('travel');
    if (r.flag) return Object.assign({ cover: 'flag' }, r);
    if (r.kind) return r;
    if (r.id && CITY_COVERS.has(r.id)) return Object.assign({}, r, { url: COVER + r.id.toLowerCase() + '.webp', cover: 'skyline', credit: '' });
    return Object.assign({ cover: 'photo' }, r);
  }
  function peekTrip(trip, opts) {
    const sp = special(trip); if (sp) return sp;
    const qs = tripQueries(trip); if (!qs.length) return cover('travel');
    const list = [];
    for (const q of qs) { const r = peek(q, Object.assign({ prefer: 'banner' }, opts)); if (r === undefined) return undefined; list.push(r); }
    return decorate(list);
  }
  async function forTrip(trip, opts) {
    const sp = special(trip); if (sp) return sp;
    const list = [];
    for (const q of tripQueries(trip)) list.push(await photo(q, Object.assign({ prefer: 'banner' }, opts)));
    return decorate(list);
  }
  // Поставить фото поездки в <img> (если не найдено — остаётся картинка по умолчанию).
  // Одна и та же заставка везде: город → фото города, только страна → флаг «из шёлка».
  // Все такие картинки запоминаем: сменили место в настройках → refreshTrip() обновляет их сразу.
  const tracked = [];
  function fillTripImg(img, trip, opts) {
    const ask = [trip.id, trip.name || '', trip.dest || ''].join('|'); img.dataset.tripKey = ask;
    const set = r => { if (!img.isConnected || img.dataset.tripKey !== ask) return;
      if (!r) { img.src = '/img/trips/abstract.jpg'; img.classList.remove('st-flag'); delete img.dataset.flag; return; }
      img.src = r.url; img.title = r.credit || ''; img.dataset.place = '1';
      const flag = /flagcdn\.com/.test(r.url); img.classList.toggle('st-flag', flag);
      if (flag) { img.dataset.flag = r.url; wavyFlag(r.url).then(d => { if (d && img.isConnected && img.dataset.flag === r.url) img.src = d; }); } else delete img.dataset.flag; };
    const now = peekTrip(trip, opts);
    if (now !== undefined) set(now); else forTrip(trip, opts).then(set);
  }
  function tripImg(img, trip, opts) {
    if (!img || !trip) return;
    for (let i = tracked.length - 1; i >= 0; i--) if (!tracked[i].img.isConnected || tracked[i].img === img) tracked.splice(i, 1);
    tracked.push({ img, trip, opts });
    fillTripImg(img, trip, opts);
  }
  function refreshTrip(trip) {
    if (!trip) return;
    for (let i = tracked.length - 1; i >= 0; i--) {
      const t = tracked[i]; if (!t.img.isConnected) { tracked.splice(i, 1); continue; }
      if (t.trip && t.trip.id === trip.id) { t.trip = trip; fillTripImg(t.img, trip, t.opts); }
    }
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

  // ---------- Флаг страны «из шёлка» ----------
  // Плоский флаг (flagcdn) накладываем на фото белого шёлка (/img/trips/silk.jpg):
  // складки ткани слегка изгибают полосы, тени шёлка мягко затемняют цвет (в тени цвет насыщеннее),
  // блики высветляют, мелкое зерно даёт фактуру ткани. Все полосы флага видны по высоте.
  // Так любой флаг выглядит как на образце. Результат хранится до закрытия вкладки.
  const waveMem = {};
  const loadImg = (src, cors) => new Promise((res, rej) => { const i = new Image(); if (cors) i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
  function wavyFlag(url, h) {
    if (!url) return Promise.resolve('');
    const H = h || 400, key = 'st_wave5_' + H + '_' + url;
    if (waveMem[key]) return waveMem[key];
    try { const c = sessionStorage.getItem(key); if (c) return (waveMem[key] = Promise.resolve(c)); } catch (_) {}
    return (waveMem[key] = Promise.all([loadImg(url, true), loadImg('/img/trips/silk.jpg')]).then(([img, silk]) => {
      const W = 960, DISP = 26;
      const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
      const px = draw => { const c = mk(), g = c.getContext('2d'); draw(g); return g.getImageData(0, 0, W, H).data; };
      const L = px(g => g.drawImage(silk, 0, 0, W, H));                                   // свет и тень ткани
      const B = px(g => { g.filter = 'blur(14px)'; g.drawImage(silk, 0, 0, W, H); });    // плавные складки для изгиба
      // по высоте — весь флаг; по ширине можно растянуть не больше чем в 1,35 раза, остальное обрезается
      const m = DISP * 1.2, fh = H + 2 * m, need = (W + 2 * m) / (img.width * fh / img.height);
      let dw = img.width * fh / img.height * Math.min(need, 1.35), dh = fh;
      if (dw < W + 2 * m) { const z = (W + 2 * m) / dw; dw *= z; dh *= z; }
      const F = px(g => g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh));
      const N = new Float32Array(W * H);                                                 // зерно ткани
      let v = 0.5; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { v = v * 0.55 + Math.random() * 0.45; N[y * W + x] = v * 0.7 + (y ? N[(y - 1) * W + x] : 0.5) * 0.3; }
      const oc = mk(), og = oc.getContext('2d'), out = og.createImageData(W, H), O = out.data;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, b = B[i] / 255 - 0.5, l = L[i] / 255;
        const sx = Math.min(W - 1, Math.max(0, Math.round(x + b * DISP * 0.35)));
        const sy = Math.min(H - 1, Math.max(0, Math.round(y - b * DISP)));
        const j = (sy * W + sx) * 4;
        const mm = Math.min(1, Math.max(0.66, 0.9 + (l - 0.53) * 0.7)) * (1 + (N[y * W + x] - 0.5) * 0.07); // тень
        const sp = Math.max(0, (l - 0.82) / 0.18) * 0.22;                                                    // блик
        const pw = 1 + 0.35 * (1 - mm);                                                                       // в тени цвет глубже
        const cs = [0, 1, 2].map(k => Math.pow(Math.min(1, F[j + k] / 255 * mm), pw));
        const gy = (cs[0] + cs[1] + cs[2]) / 3;                                                            // чуть спокойнее цвет
        for (let k = 0; k < 3; k++) { const c = gy + (cs[k] - gy) * 0.86; O[i + k] = 255 * (1 - (1 - c) * (1 - sp)); }
        O[i + 3] = 255;
      }
      og.putImageData(out, 0, 0);
      const d = oc.toDataURL('image/jpeg', 0.88);
      try { sessionStorage.setItem(key, d); } catch (_) {}
      return d;
    }).catch(() => url));
  }

  window.STPlacePhoto = { photo, peek, forTrip, peekTrip, tripImg, refreshTrip, clean, moodPhoto, peekMood, wavyFlag };
})();
