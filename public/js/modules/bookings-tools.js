// ============================================================
// Помощник модуля «Бронирования» (загружается только когда нужен)
// ------------------------------------------------------------
// 1. Аэропорты: город или код → аэропорт (CGN, DUS …).
//    Справочник: /data/airports.json (OurAirports, общественное достояние),
//    город ищем через OpenStreetMap Nominatim (бесплатно, без ключа).
// 2. Чтение файла брони: PDF (pdf.js) или фото (Tesseract, уже есть в проекте).
//    Всё работает на телефоне пользователя, файлы никуда не отправляются.
// 3. Разбор текста брони: категория, рейсы, даты, время, номер брони,
//    пассажиры, места, цена, адрес. Пользователь всегда проверяет результат.
// Разбор — чистая функция parseBooking(text, db), её можно тестировать в Node:
//   node scripts/test-bookings-parse.cjs
// ============================================================
(function (root) {
  'use strict';

  // ---------- Нормализация ----------
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ё/g, 'е').replace(/ß/g, 'ss').replace(/[^a-z0-9а-я]+/g, ' ').trim();
  const pad = n => String(n).padStart(2, '0');
  const isoOf = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
  const validDate = (y, m, d) => { const t = new Date(y, m - 1, d); return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d; };
  const addDay = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(y, m - 1, d + n); return isoOf(t.getFullYear(), t.getMonth() + 1, t.getDate()); };
  function dist(a, b, c, d) { // км
    const R = 6371, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r;
    const h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // ---------- Справочники ----------
  function makeDb(rows, airlines) {
    const list = rows.map(r => ({ code: r[0], name: r[1], city: r[2], country: r[3], lat: r[4], lon: r[5], large: !!r[6], kw: r[7] || '' }));
    list.forEach(a => { a.cityN = norm(a.city); a.nameN = norm(a.name); a.allN = ' ' + norm(a.name + ' ' + a.city + ' ' + a.kw) + ' '; });
    const byCode = new Map(list.map(a => [a.code, a]));
    return { list, byCode, airlines: airlines || {} };
  }
  let dbPromise = null;
  function loadDb() {
    if (!dbPromise) {
      dbPromise = Promise.all([
        fetch('/data/airports.json').then(r => { if (!r.ok) throw new Error('airports'); return r.json(); }),
        fetch('/data/airlines.json').then(r => r.ok ? r.json() : {}).catch(() => ({}))
      ]).then(([a, l]) => makeDb(a, l)).catch(e => { dbPromise = null; throw e; });
    }
    return dbPromise;
  }
  // Короткое имя города аэропорта: «Köln (Cologne)» → «Köln»
  const cityShort = a => String(a.city || a.name).replace(/\s*\(.*\)\s*/, '').split(/[,/]/)[0].trim();
  const airlineOf = (db, flight) => { const m = String(flight || '').toUpperCase().match(/^([A-Z0-9]{2})\s?\d/); return m ? db.airlines[m[1]] || '' : ''; };

  // ---------- Город → аэропорты ----------
  async function geocode(q) {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&namedetails=1&accept-language=en&q=' + encodeURIComponent(q);
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = setTimeout(() => ctl && ctl.abort(), 7000);
    try {
      const r = await fetch(url, { signal: ctl && ctl.signal, headers: { Accept: 'application/json' } });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j[0] ? j[0] : null;
    } catch (_) { return null; } finally { clearTimeout(t); }
  }
  // Возвращает { list:[аэропорты], exact, far, offline }
  async function findAirports(q) {
    const db = await loadDb();
    const t = String(q || '').trim();
    if (t.length < 2) return { list: [] };
    if (/^[A-Za-z]{3}$/.test(t) && db.byCode.has(t.toUpperCase())) return { list: [db.byCode.get(t.toUpperCase())], exact: true };
    const n = norm(t);
    const local = n.length >= 3 ? db.list.filter(a => a.allN.includes(' ' + n + ' ') || (n.length >= 5 && a.allN.includes(' ' + n))) : [];
    const g = await geocode(t);
    let list = [], far = false;
    if (g) {
      const lat = +g.lat, lon = +g.lon;
      const names = [g.name, ...Object.values(g.namedetails || {})].map(norm).filter(x => x.length >= 3);
      const isAirport = /aerodrome|airport/.test((g.type || '') + ' ' + (g.category || '') + ' ' + (g.addresstype || ''));
      const near = db.list.map(a => Object.assign({ d: dist(lat, lon, a.lat, a.lon) }, a));
      if (isAirport) list = near.filter(a => a.d <= 15);
      if (!list.length) list = near.filter(a => a.d <= 40 || (a.d <= 100 && names.some(nm => a.cityN.includes(nm) || a.nameN.includes(nm))));
      if (!list.length) { list = near.filter(a => a.d <= 150).sort((a, b) => a.d - b.d).slice(0, 3); far = list.length > 0; }
      local.forEach(a => { if (!list.some(x => x.code === a.code)) { const d = dist(lat, lon, a.lat, a.lon); if (d <= 100) list.push(Object.assign({ d }, a)); } });
    } else {
      list = local.map(a => Object.assign({ d: null }, a));
    }
    list.sort((a, b) => (b.large - a.large) || ((a.d ?? 0) - (b.d ?? 0)));
    return { list: list.slice(0, 8), far, offline: !g };
  }

  // ---------- Чтение файла ----------
  function loadScript(src) {
    return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('load ' + src)); document.head.appendChild(s); });
  }
  let pdfReady = null;
  function loadPdf() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfReady) pdfReady = loadScript('/vendor/pdfjs/pdf.min.js').then(() => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js';
      return window.pdfjsLib;
    }).catch(e => { pdfReady = null; throw e; });
    return pdfReady;
  }
  async function pdfText(file, onProgress) {
    const lib = await loadPdf();
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const out = [];
    const pages = Math.min(doc.numPages, 6);
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      // строки собираем по координате Y, внутри строки — слева направо
      const rows = [];
      tc.items.forEach(it => {
        if (!it.str || !it.str.trim()) return;
        const y = Math.round(it.transform[5]), x = it.transform[4];
        let r = rows.find(r => Math.abs(r.y - y) <= 3);
        if (!r) rows.push(r = { y, parts: [] });
        r.parts.push({ x, s: it.str });
      });
      rows.sort((a, b) => b.y - a.y);
      rows.forEach(r => out.push(r.parts.sort((a, b) => a.x - b.x).map(x => x.s).join('  ').replace(/\s{3,}/g, '  ')));
      out.push('');
      onProgress && onProgress(p / pages);
    }
    let text = out.join('\n');
    // Скан без текстового слоя → распознаём картинку первой страницы
    if (text.replace(/\s/g, '').length < 40) {
      const page = await doc.getPage(1);
      const vp = page.getViewport({ scale: 2.2 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const blob = await new Promise(ok => c.toBlob(ok, 'image/png'));
      text = await imageText(blob, onProgress);
    }
    return text;
  }
  async function imageText(file, onProgress) {
    if (!window.SplitawayReceipt || !window.SplitawayReceipt.readReceiptImage) throw new Error('ocr');
    return window.SplitawayReceipt.readReceiptImage(file, 'de', (s, p) => onProgress && onProgress(p));
  }
  async function readFile(file, onProgress) {
    const type = file.type || '';
    if (type === 'application/pdf' || /\.pdf$/i.test(file.name || '')) return pdfText(file, onProgress);
    if (type.startsWith('image/')) return imageText(file, onProgress);
    if (type.startsWith('text/')) return file.text();
    throw new Error('type');
  }

  // ---------- Разбор текста брони ----------
  const MONTHS = [ // начало слова → месяц (en, de, ru, es, fr, it)
    ['janv', 1], ['jan', 1], ['jaen', 1], ['ene', 1], ['gen', 1], ['янв', 1],
    ['fevr', 2], ['feb', 2], ['fev', 2], ['фев', 2],
    ['mars', 3], ['marz', 3], ['mar', 3], ['mrz', 3], ['мар', 3],
    ['apr', 4], ['abr', 4], ['avr', 4], ['апр', 4],
    ['may', 5], ['mai', 5], ['mag', 5], ['мая', 5], ['май', 5],
    ['juin', 6], ['jun', 6], ['giu', 6], ['июн', 6],
    ['juil', 7], ['jul', 7], ['lug', 7], ['июл', 7],
    ['aout', 8], ['aug', 8], ['ago', 8], ['авг', 8],
    ['sept', 9], ['sep', 9], ['set', 9], ['сен', 9],
    ['oct', 10], ['okt', 10], ['ott', 10], ['окт', 10],
    ['nov', 11], ['ноя', 11],
    ['dec', 12], ['dez', 12], ['dic', 12], ['дек', 12]
  ];
  const monthOf = w => { const n = norm(w).replace(/\s/g, ''); if (n.length < 3) return 0; const m = MONTHS.find(([k]) => n.startsWith(k)); return m ? m[1] : 0; };
  // Слова из 3 заглавных букв, которые не аэропорты, даже если такой код есть
  const STOP = new Set('THE AND FOR YOU TAX VAT EUR USD GBP CHF RUB PLN CZK TRY ONE ALL NEW OUT CAR BUS BAG MRS PAX REF PNR DAY NOT YES MAX MIN ECO BOX SUN MON TUE WED THU FRI SAT JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC PER VIA AIR NON OPS TBD GMT UTC CET UHR NUR VON BIS DER DIE DAS UND MIT AUS ZUM GEB NAME ARR DEP ETA ETD SEQ ZONE GATE ROW KID INF CHD ADT HRS MIN WIFI PDF APP WEB WWW COM NET ORG INC LTD AGB TOUR HOTEL SEAT CLASS'.split(' '));
  const CUR = { '€': 'EUR', 'eur': 'EUR', 'euro': 'EUR', '$': 'USD', 'usd': 'USD', '£': 'GBP', 'gbp': 'GBP', 'chf': 'CHF', '₽': 'RUB', 'rub': 'RUB', 'руб': 'RUB', 'pln': 'PLN', 'zł': 'PLN', 'czk': 'CZK', 'kč': 'CZK', 'try': 'TRY', '₺': 'TRY' };
  const amount = s => { let t = String(s).replace(/[\s ']/g, ''); if (/,\d{2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/,/g, ''); return parseFloat(t); };
  const RENTALS = ['Sixt', 'Europcar', 'Hertz', 'Avis', 'Enterprise', 'Budget', 'Goldcar', 'Record Go', 'Centauro', 'OK Mobility', 'Alamo', 'Thrifty', 'Dollar', 'National', 'Firefly', 'Drivalia', 'Flixbus', 'FlixTrain', 'Deutsche Bahn', 'Renfe', 'Trenitalia', 'Italo', 'SNCF', 'BlaBlaCar', 'Ouigo', 'ÖBB', 'SBB'];
  const STAY_SITES = ['Booking.com', 'Airbnb', 'Expedia', 'Hotels.com', 'Agoda', 'HRS', 'Trivago', 'Vrbo', 'FeWo-direkt'];

  // Все даты в тексте с позициями
  function findDates(text, today) {
    const out = [];
    const now = today || new Date();
    const fixYear = (y, m, d) => {
      if (y) return y < 100 ? 2000 + y : y;
      let yy = now.getFullYear();
      if (new Date(yy, m - 1, d) < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 45)) yy++;
      return yy;
    };
    const add = (idx, len, y, m, d) => { y = fixYear(y, m, d); if (m >= 1 && m <= 12 && validDate(y, m, d) && y >= 2000 && y <= 2100) out.push({ idx, len, iso: isoOf(y, m, d) }); };
    let r;
    const reNum = /(?<![\d.])(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?![\d])/g;
    while ((r = reNum.exec(text))) add(r.index, r[0].length, +r[3], +r[2], +r[1]);
    const reIso = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
    while ((r = reIso.exec(text))) add(r.index, r[0].length, +r[1], +r[2], +r[3]);
    const reTxt = /(?<![\d.])(\d{1,2})\.?\s?([A-Za-zÀ-ÿА-Яа-яЁё]{3,9})\.?,?(?:\s?(\d{4}|\d{2}))?(?![\d:])/g;
    while ((r = reTxt.exec(text))) { const m = monthOf(r[2]); if (m) add(r.index, r[0].length, r[3] ? +r[3] : 0, m, +r[1]); }
    const reUs = /\b([A-Za-z]{3,9})\.?\s(\d{1,2}),?\s(\d{4})\b/g;
    while ((r = reUs.exec(text))) { const m = monthOf(r[1]); if (m) add(r.index, r[0].length, +r[3], m, +r[2]); }
    out.sort((a, b) => a.idx - b.idx);
    return out.filter((x, i) => !out.some((y, j) => j !== i && y.idx <= x.idx && y.idx + y.len >= x.idx + x.len && y.len > x.len));
  }
  function findTimes(text) {
    const out = []; let r;
    const re = /(?<![\d:.])([01]?\d|2[0-3])[:h]([0-5]\d)(?![\d:])/g;
    while ((r = re.exec(text))) {
      // слова перед временем — только после предыдущей цифры («Gate closes 06:00  Departure 06:10»)
      const before = text.slice(Math.max(0, r.index - 28), r.index).toLowerCase().replace(/^[\s\S]*\d/, '');
      if (/(boarding|einstieg|gate|посадк|embarque|embarquement|imbarco|schlie|closes|abflug spätestens|check-in bis|check-in schl)/.test(before)) continue;
      out.push({ idx: r.index, t: pad(r[1]) + ':' + r[2] });
    }
    return out;
  }
  // Строки, где даты — не про поездку (дата бронирования, рождения …)
  const BAD_LINE = /(buchungsdatum|booking date|date of (issue|booking|birth)|issued|ausgestellt|erstellt am|rechnungsdatum|invoice date|geburt|birth|рожд|дата (оформления|бронирования|выдачи)|fecha de (reserva|emisión)|storn|cancell?ation (policy|until|free)|kostenlos storn|бесплатная отмена)/i;
  function maskBadLines(text) {
    return text.split('\n').map(l => BAD_LINE.test(l) ? l.replace(/\d/g, '#') : l).join('\n');
  }

  function parseBooking(raw, db, opts) {
    const o = opts || {};
    const text = maskBadLines(String(raw || '').replace(/\r/g, '').replace(/[ \t]/g, ' '));
    const lower = text.toLowerCase();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const dates = findDates(text, o.today);
    const times = findTimes(text);
    const res = { cat: 'ticket', segments: [], filled: [] };

    // Аэропорты: коды в тексте
    const codes = []; let r;
    const reCode = /(?<![A-Za-z0-9])([A-Z]{3})(?![A-Za-z0-9])/g;
    while ((r = reCode.exec(text))) if (!STOP.has(r[1]) && db.byCode.has(r[1])) codes.push({ idx: r.index, code: r[1] });
    // Номера рейсов: код авиакомпании + 1–4 цифры
    const flights = [];
    const reFl = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{1,4})(?![\d:.,])/g;
    while ((r = reFl.exec(text))) {
      if (!db.airlines[r[1]]) continue;
      if (/^(19|20)\d\d$/.test(r[2]) && /\s/.test(r[0])) continue; // «MA 2026» — это не рейс
      flights.push({ idx: r.index, num: r[1] + r[2], code: r[1] });
    }
    const flightWords = /(flug|flight|рейс|vuelo|\bvol\b|volo|boarding|bordkarte|посадочн|airline|fluggesellschaft|abflug|departure|вылет|terminal)/i.test(lower);
    const isFlight = codes.length >= 2 && (flights.length > 0 || flightWords);
    const isStay = /(hotel|check-?in|anreise|unterkunft|apartment|appartement|ferienwohnung|hostel|resort|booking\.com|airbnb|заезд|отель|гостиниц|alojamiento|hébergement|alloggio|übernachtung|nights?\b|nächte|ночей|ночи)/i.test(lower);
    const isTransport = /(mietwagen|car rental|rental car|autovermietung|pick-?up|abholung|прокат|аренда (авто|машин)|alquiler de coche|location de voiture|noleggio|zugticket|train|\bbahn\b|\bzug\b|поезд|автобус|fernbus|flixbus|sixt|europcar|hertz|avis|goldcar)/i.test(lower);
    res.cat = isFlight ? 'flight' : isStay ? 'stay' : isTransport ? 'transport' : 'ticket';
    res.boarding = /(boarding ?pass|bordkarte|посадочный талон|tarjeta de embarque|carte d'embarquement|carta d'imbarco)/i.test(lower);

    // Номер брони
    const reCodeKw = /(buchungs(?:code|nummer|referenz|bestätigung)|reservierungs(?:code|nummer)|booking (?:reference|code|number|ref\.?|id)|confirmation (?:number|code|no\.?)|bestätigungs(?:nummer|code)|\bpnr\b|record locator|filekey|reservation (?:number|code|no\.?)|код бронирования|номер (?:бронирования|брони|заказа)|localizador|référence(?: de réservation)?|codice (?:di )?prenotazione|auftragsnummer)\s*(?:no\.?|nr\.?|#|:|-)?\s*(?:\n\s*)?([A-Z0-9][A-Z0-9-]{4,13})/i;
    const reCodeAll = new RegExp(reCodeKw.source, 'gi'); let bc;
    while ((bc = reCodeAll.exec(text))) {
      const v = bc[2];
      if ((/[A-Z]/.test(v) && /\d/.test(v) || /^[A-Z]{6}$/.test(v)) && v === v.toUpperCase() || /^\d{5,14}$/.test(v)) { res.code = v; break; }
      reCodeAll.lastIndex = bc.index + bc[1].length; // следующее ключевое слово могло быть «съедено»
    }

    // Люди
    const ad = lower.match(/(\d+)\s*(erwachsene?r?|adults?|взросл\S*|adultos?|adultes?|adulti)/);
    const ch = lower.match(/(\d+)\s*(kinder|kind|child(?:ren)?|дет\S*|ребен\S*|niños?|enfants?|bambini)/);
    if (ad) {
      const a = +ad[1], c = ch ? +ch[1] : 0;
      res.people = a + ' ' + (a === 1 ? 'взрослый' : 'взрослых') + (c ? ', ' + c + ' ' + (c === 1 ? 'ребёнок' : 'детей') : '');
    } else {
      const names = new Set(); let m;
      const reName = /\b([A-ZÄÖÜ][A-ZÄÖÜ'-]{1,})\s?\/\s?([A-ZÄÖÜ][A-ZÄÖÜ' -]{1,}?)\s*(MRS|MR|MS|MSTR|MISS|CHD|INF)?\b/g;
      while ((m = reName.exec(text))) names.add(m[1] + '/' + m[2].trim());
      const reTitle = /(?:^|\n)\s*(?:\d+\.\s*)?(?:Herr|Frau|Mr\.?|Mrs\.?|Ms\.?|Miss|Г-н|Г-жа)\s+[A-ZÄÖÜА-Я][\p{L}'-]+(?:\s+[A-ZÄÖÜА-Я][\p{L}'-]+)?/gu;
      while ((m = reTitle.exec(text))) names.add(m[0].trim().toLowerCase());
      if (names.size) res.people = names.size + ' ' + (res.cat === 'flight' ? (names.size === 1 ? 'пассажир' : names.size < 5 ? 'пассажира' : 'пассажиров') : (names.size === 1 ? 'гость' : names.size < 5 ? 'гостя' : 'гостей'));
    }
    // Места
    const seats = new Set(); let sm;
    const reSeat = /(?:seat|sitz(?:platz)?|место|asiento|siège|posto)s?\s*(?:no\.?|nr\.?|number)?\s*[:#]?\s*(\d{1,2}[A-K])\b/gi;
    while ((sm = reSeat.exec(text))) seats.add(sm[1].toUpperCase());
    if (seats.size) res.seats = [...seats].join(', ');
    // Цена
    const rePrice = /(gesamt(?:preis|betrag|summe)?|endpreis|reisepreis|total(?: price| amount| paid| cost)?|grand total|amount paid|bezahlt|итого|всего|к оплате|сумма|importe total|precio total|prix total|totale|summe)(?![a-zа-я])[^\n\d€$£]{0,30}(€|eur|usd|\$|£|gbp|chf|rub|₽)?\s*(\d{1,3}(?:[ .,' ]?\d{3})*(?:[.,]\d{2})?)\s*(€|eur|euro|usd|\$|£|gbp|chf|rub|руб|₽)?/gi;
    let best = null, pm;
    while ((pm = rePrice.exec(text))) { const v = amount(pm[3]); if (v > 0 && v < 100000 && (!best || /gesamt|total|итого|к оплате|endpreis|reisepreis|grand/i.test(pm[1]))) best = { v, cur: (pm[2] || pm[4] || '').toLowerCase() }; }
    if (best) { res.price = best.v; res.currency = CUR[best.cur] || o.currency || ''; }

    const firstDateAfter = (re, span) => { const m = re.exec(lower); if (!m) return null; return dates.find(d => d.idx >= m.index && d.idx <= m.index + (span || 120)) || null; };
    const timeNear = (idx, span) => { const t = times.find(x => x.idx >= idx && x.idx <= idx + (span || 70)); return t ? t.t : ''; };

    if (res.cat === 'flight') {
      // Рейсы: окно текста вокруг каждого номера рейса
      const uniq = [];
      flights.forEach(f => { if (!uniq.some(u => u.num === f.num)) uniq.push(f); });
      const segs = [];
      const build = (start, end, num, at) => {
        const cs = []; codes.filter(c => c.idx >= start && c.idx < end).forEach(c => { if (!cs.includes(c.code)) cs.push(c.code); });
        if (cs.length < 2) return null;
        const ds = dates.filter(d => d.idx >= start && d.idx < end);
        // дата: в строке рейса → ближайшая выше → первая в окне
        const ls = at != null ? text.lastIndexOf('\n', at) + 1 : start;
        const le = at != null ? (text.indexOf('\n', at) < 0 ? text.length : text.indexOf('\n', at)) : end;
        const own = dates.filter(d => d.idx >= ls && d.idx < le);
        const d0 = own[0] || [...dates].reverse().find(d => d.idx < ls && d.idx >= start - 400) || ds[0] || [...dates].reverse().find(d => d.idx < start) || dates[0];
        const ts = []; times.filter(t => t.idx >= start && t.idx < end).forEach(t => { if (!ts.includes(t.t)) ts.push(t.t); });
        const s = { from: cs[0], to: cs[1], number: num || '', date: d0 ? d0.iso : '', time: ts[0] || '', endTime: ts[1] || '' };
        const d1 = (at != null ? own : ds).find(d => d.iso > s.date && s.date && d.iso <= addDay(s.date, 2));
        if (d1) s.endDate = d1.iso;
        else if (s.date && s.time && s.endTime && s.endTime < s.time) s.endDate = addDay(s.date, 1);
        s.provider = num ? airlineOf(db, num) : '';
        return s;
      };
      if (uniq.length) {
        // окно рейса: от начала его строки до строки следующего рейса;
        // если в строке нет двух аэропортов — расширяем назад, но не дальше предыдущего рейса
        const lineStart = i => text.lastIndexOf('\n', i) + 1;
        const lineEnd = i => { const e = text.indexOf('\n', i); return e < 0 ? text.length : e; };
        uniq.forEach((f, i) => {
          const end = i + 1 < uniq.length ? lineStart(uniq[i + 1].idx) || uniq[i + 1].idx : Math.min(text.length, lineEnd(f.idx) + 400);
          const floor = i ? lineEnd(uniq[i - 1].idx) + 1 : 0;
          let s = build(Math.max(floor, lineStart(f.idx)), end, f.num, f.idx);
          if (!s) s = build(Math.max(floor, f.idx - 400), end, f.num, f.idx);
          if (s) segs.push(s);
        });
      }
      if (!segs.length) {
        const reArrow = /(?<![A-Za-z])([A-Z]{3})\s*(?:-|–|—|→|->|>|to|nach|до|a|à)\s*([A-Z]{3})(?![A-Za-z])/g;
        let a;
        while ((a = reArrow.exec(text))) if (db.byCode.has(a[1]) && db.byCode.has(a[2]) && !STOP.has(a[1]) && !STOP.has(a[2])) {
          const s = build(a.index, a.index + 400, ''); if (s) { s.from = a[1]; s.to = a[2]; segs.push(s); }
        }
        if (!segs.length) { const s = build(0, text.length, flights[0] ? flights[0].num : ''); if (s) segs.push(s); }
      }
      // дубликаты (одни и те же рейсы на нескольких страницах)
      res.segments = segs.filter((s, i) => s.from !== s.to && !segs.slice(0, i).some(x => x.from === s.from && x.to === s.to && x.date === s.date));
      res.segments.forEach(s => { const a = db.byCode.get(s.from), b = db.byCode.get(s.to); s.fromCity = a ? cityShort(a) : ''; s.toCity = b ? cityShort(b) : ''; });
    } else {
      // Начало и конец: по ключевым словам, иначе две первые даты
      const KW = {
        stay: [/(check-?in|anreise|arrival|ankunft|заезд|llegada|arrivée|arrivo)/, /(check-?out|abreise|departure|выезд|salida|départ|partenza)/],
        transport: [/(abholung|pick-?up|übernahme|получение|recogida|prise en charge|ritiro|abfahrt|departure|отправление)/, /(rückgabe|drop-?off|return|возврат|devolución|restitution|riconsegna|ankunft|arrival|прибытие)/],
        ticket: [/(datum|date|дата|fecha|beginn|start|начало|einlass)/, /(ende|end|окончание|fin)/]
      }[res.cat];
      const a = firstDateAfter(new RegExp(KW[0].source, 'g')), b = firstDateAfter(new RegExp(KW[1].source, 'g'));
      const d0 = a || dates[0], d1 = b && (!d0 || b.iso >= d0.iso) ? b : dates.find(d => d0 && d.iso > d0.iso);
      if (d0) { res.date = d0.iso; res.time = timeNear(d0.idx); }
      if (d1 && d1.iso !== res.date) { res.endDate = d1.iso; res.endTime = timeNear(d1.idx); }
      if (res.cat === 'stay' && res.time && res.endTime && res.endTime > res.time && !b) res.endTime = '';
      // Адрес
      const reStreet = /\b(str(?:aße|asse|\.)|straat|street|road|avenue|avenida|av\.|calle|c\/|carrer|viale|via|rue|boulevard|blvd|platz|weg|allee|ул\.|улица|проспект|plaza|paseo|camino|rambla)\b/i;
      const addr = lines.find(l => reStreet.test(l) && /\d/.test(l) && l.length <= 90 && !BAD_LINE.test(l));
      if (addr) res.place = addr.replace(/^(adresse|address|адрес|dirección|indirizzo)\s*:?\s*/i, '').replace(/\s{2,}/g, ' ').trim();
      // Название
      if (res.cat === 'stay') {
        const reProp = /(hotel|apartment|apartamento|appartement|apartamentos|hostel|resort|villa|casa|suites?|residence|lodge|pension|gasthof|ferienwohnung|отель|гостиница|апартаменты)/i;
        const name = lines.find(l => reProp.test(l) && l.length <= 70 && !/(booking\.com|airbnb|check-?in|anreise|bestätigung|confirmation|ihre buchung|your booking)/i.test(l));
        const by = lines.map(l => l.match(/(?:ihre buchung (?:im|in der|bei)|your (?:booking|reservation|stay) at|бронирование в)\s+(.{3,60})/i)).find(Boolean);
        res.title = ((by && by[1]) || name || '').replace(/\s+(ist|wurde|is|has been|was)?\s*(bestätigt|confirmed|подтвержден[оа]?|confirmad[oa])\b.*$/i, '').replace(/[.!,:]+$/, '').trim();
        res.provider = STAY_SITES.find(s => lower.includes(s.toLowerCase())) || '';
      } else if (res.cat === 'transport') {
        res.provider = RENTALS.find(s => lower.includes(s.toLowerCase())) || '';
        res.title = /(mietwagen|car rental|rental car|autovermietung|прокат|аренда|alquiler|location|noleggio|sixt|europcar|hertz|avis|goldcar)/i.test(lower) ? 'Аренда авто' : /(zug|train|bahn|поезд|renfe|sncf|trenitalia)/i.test(lower) ? 'Поезд' : /(bus|автобус|flixbus)/i.test(lower) ? 'Автобус' : 'Транспорт';
        const pl = (re) => { const l = lines.find(x => re.test(x.toLowerCase())); if (!l) return ''; const v = l.replace(new RegExp('^.*?' + re.source + '\\S*\\s*(ort|station|location|место)?\\s*:?\\s*', 'i'), '').replace(/\b\d{1,2}[./]\d{1,2}[./]\d{2,4}.*$/, '').replace(/\b\d{1,2}:\d{2}.*$/, '').trim(); return v.length >= 3 && v.length <= 80 ? v : ''; };
        const p1 = pl(KW[0]), p2 = pl(KW[1]);
        if (p1) res.place = p1;
        if (p2 && p2 !== p1) res.placeTo = p2;
      } else {
        const reT = /(ticket|eintritt|admission|tour|führung|экскурс|билет|entrada|museum|museo|musée|concert|konzert|концерт|castle|burg|schloss|castillo|замок|park)/i;
        const tl = lines.find(l => reT.test(l) && l.length <= 70 && !/(e-?ticket|ihr ticket|your ticket)$/i.test(l));
        res.title = tl ? tl.replace(/^(ticket|tickets|билет|eintrittskarte|e-ticket)\s*[:\-–]\s*/i, '').trim() : '';
      }
    }
    // Что заполнено (для подсветки в форме)
    const f = res.filled;
    if (res.cat === 'flight' && res.segments.length) { f.push('from', 'to'); const s = res.segments[0]; ['date', 'time', 'endDate', 'endTime', 'number', 'provider'].forEach(k => s[k] && f.push(k)); }
    ['title', 'provider', 'place', 'placeTo', 'date', 'time', 'endDate', 'endTime'].forEach(k => res[k] && !f.includes(k) && f.push(k));
    ['code', 'people', 'seats', 'price'].forEach(k => res[k] && f.push(k));
    return res;
  }

  const api = { norm, makeDb, loadDb, findAirports, readFile, parseBooking, findDates, cityShort, airlineOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.STBookingTools = api;
})(typeof window !== 'undefined' ? window : globalThis);
