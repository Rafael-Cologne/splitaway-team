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
  // «3:00 PM» → 15:00, «12:30 AM» → 00:30
  const hm = (h, m, ap) => { h = +h; if (ap) { ap = ap.toLowerCase()[0]; if (ap === 'p' && h < 12) h += 12; else if (ap === 'a' && h === 12) h = 0; } return pad(h) + ':' + m; };
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
    // Cyrillic documents need the rus model (deu+eng turns «Итого … руб.» into «Wroro … py6.»)
    const lang = root.STBookingOcrLang || 'de';
    const read = (l, a, b) => window.SplitawayReceipt.readReceiptImage(file, l, (s, p) => onProgress && onProgress(a + (b - a) * (p || 0)));
    let text = await read(lang, 0, lang === 'ru' ? 1 : 0.5);
    if (lang !== 'ru' && looksCyrillic(text)) { try { const ru = await read('ru', 0.5, 1); if (ru && /[а-яё]{3}/i.test(ru)) text = ru; } catch (_) {} }
    return text;
  }
  // Кириллица, прочитанная латинской моделью: «BpoHUpoBaHMe», «MockBa», «6uneta»
  function looksCyrillic(text) {
    const w = String(text || '').match(/[A-Za-z0-9]{3,}/g) || [];
    const bad = w.filter(x => /[a-z][A-Z]/.test(x) || /[A-Za-z][0-9][a-z]|^[0-9][a-z]{2,}/.test(x)).length;
    return bad >= 8 && bad / w.length >= 0.15;
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
  const STOP = new Set('THE AND FOR YOU TAX VAT EUR USD GBP CHF RUB PLN CZK TRY ONE ALL NEW OUT CAR BUS BAG MRS PAX REF PNR DAY NOT YES MAX MIN ECO BOX SUN MON TUE WED THU FRI SAT JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC PER VIA AIR NON OPS TBD GMT UTC CET UHR NUR VON BIS DER DIE DAS UND MIT AUS ZUM GEB NAME ARR DEP ETA ETD SEQ ZONE GATE ROW KID INF CHD ADT CIF NIF DNI IVA USA SUV NHS DOB AGB ZOB HRS MIN WIFI PDF APP WEB WWW COM NET ORG INC LTD AGB TOUR HOTEL SEAT CLASS'.split(' '));
  const CUR = { '€': 'EUR', 'eur': 'EUR', 'euro': 'EUR', '$': 'USD', 'usd': 'USD', '£': 'GBP', 'gbp': 'GBP', 'chf': 'CHF', '₽': 'RUB', 'rub': 'RUB', 'руб': 'RUB', 'р': 'RUB', 'pln': 'PLN', 'zł': 'PLN', 'czk': 'CZK', 'kč': 'CZK', 'try': 'TRY', '₺': 'TRY' };
  const amount = s => { let t = String(s).replace(/[\s ']/g, ''); if (/,\d{2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/,/g, ''); return parseFloat(t); };
  // Страны (de/en/ru/es/fr/it) — чтобы дописать страну со следующей строки адреса
  const COUNTRIES = new Set(['deutschland', 'germany', 'германия', 'alemania', 'allemagne', 'germania', 'spanien', 'spain', 'испания', 'espana', 'españa', 'espagne', 'spagna',
    'italien', 'italy', 'италия', 'italia', 'italie', 'frankreich', 'france', 'франция', 'francia', 'österreich', 'osterreich', 'austria', 'австрия', 'autriche', 'schweiz', 'switzerland', 'швейцария', 'suiza', 'suisse', 'svizzera',
    'niederlande', 'netherlands', 'нидерланды', 'holland', 'belgien', 'belgium', 'бельгия', 'portugal', 'португалия', 'griechenland', 'greece', 'греция', 'grecia', 'grece',
    'türkei', 'turkei', 'turkey', 'turkiye', 'türkiye', 'турция', 'kroatien', 'croatia', 'хорватия', 'polen', 'poland', 'польша', 'tschechien', 'czechia', 'чехия', 'ungarn', 'hungary', 'венгрия',
    'dänemark', 'danemark', 'denmark', 'дания', 'schweden', 'sweden', 'швеция', 'norwegen', 'norway', 'норвегия', 'finnland', 'finland', 'финляндия', 'irland', 'ireland', 'ирландия',
    'vereinigtes königreich', 'united kingdom', 'великобритания', 'england', 'usa', 'vereinigte staaten', 'united states', 'сша', 'zypern', 'cyprus', 'кипр', 'malta', 'мальта', 'montenegro', 'черногория',
    'ägypten', 'agypten', 'egypt', 'египет', 'vae', 'uae', 'оаэ', 'thailand', 'таиланд', 'georgien', 'georgia', 'грузия', 'russland', 'russia', 'россия']);
  const RENTALS = ['Sixt', 'Europcar', 'Hertz', 'Avis', 'Enterprise', 'Budget', 'Goldcar', 'Record Go', 'Centauro', 'OK Mobility', 'Alamo', 'Thrifty', 'Dollar', 'National', 'Firefly', 'Drivalia', 'Flixbus', 'FlixTrain', 'Deutsche Bahn', 'Renfe', 'Trenitalia', 'Italo', 'SNCF', 'BlaBlaCar', 'Ouigo', 'ÖBB', 'SBB', 'Eurostar', 'RegioJet', 'Alsa', 'Welcome Pickups', 'HolidayTaxis', 'Suntransfers', 'Kiwitaxi', 'Hoppa', 'Blacklane', 'Uber', 'Bolt'];
  const STAY_SITES = ['Booking.com', 'Airbnb', 'Expedia', 'Hotels.com', 'Agoda', 'HRS', 'Trivago', 'Vrbo', 'FeWo-direkt', 'Accor', 'Ostrovok', 'Trip.com', 'Hostelworld', 'Marriott', 'Hilton', 'IHG', 'Meliá', 'NH Hotels', 'Check24', 'Holidaycheck', 'Tui'];
  const TICKET_SITES = ['GetYourGuide', 'Tiqets', 'Eventim', 'Ticketmaster', 'Viator', 'Klook', 'Musement', 'Civitatis', 'Headout', 'CoopCulture', 'Tickets.ru', 'Яндекс Афиша', 'Kassir', 'PortAventura', 'Paris Museum Pass'];

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
    const add = (idx, len, y, m, d) => { const ny = !y; y = fixYear(y, m, d); if (m >= 1 && m <= 12 && validDate(y, m, d) && y >= 2000 && y <= 2100) out.push({ idx, len, iso: isoOf(y, m, d), ny, m, d }); };
    let r;
    const reNum = /(?<![\d.])(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?![\d])/g;
    while ((r = reNum.exec(text))) add(r.index, r[0].length, +r[3], +r[2], +r[1]);
    const reIso = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
    while ((r = reIso.exec(text))) add(r.index, r[0].length, +r[1], +r[2], +r[3]);
    // «12. Mai 2026», «12 May», «11 de marzo de 2027»
    const reTxt = /(?<![\d.])(\d{1,2})\.?\s?(?:de\s+)?([A-Za-zÀ-ÿА-Яа-яЁё]{3,9})\.?,?(?:\s?(?:de\s+)?(\d{4}|\d{2}))?(?![\d:])/g;
    while ((r = reTxt.exec(text))) { const m = monthOf(r[2]); if (m) add(r.index, r[0].length, r[3] ? +r[3] : 0, m, +r[1]); }
    const reUs = /\b([A-Za-z]{3,9})\.?\s(\d{1,2}),?\s(\d{4})\b/g;
    while ((r = reUs.exec(text))) { const m = monthOf(r[1]); if (m) add(r.index, r[0].length, +r[3], m, +r[2]); }
    // «Wed, May 20» (Airbnb: year only at the first date)
    const reUsNy = /\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]{0,6}\.?,?\s+([A-Za-z]{3,9})\.?\s(\d{1,2})\b(?![,.]?\s?\d{4})(?![:\d])/gi;
    while ((r = reUsNy.exec(text))) { const m = monthOf(r[1]); if (m) add(r.index, r[0].length, 0, m, +r[2]); }
    out.sort((a, b) => a.idx - b.idx);
    // год не указан → год ближайшей даты выше (если месяц раньше — следующий год)
    out.forEach((x, i) => { if (!x.ny) return; const p = out.slice(0, i).reverse().find(y => !y.ny); if (!p) return;
      const py = +p.iso.slice(0, 4), pm = +p.iso.slice(5, 7), pd = +p.iso.slice(8, 10);
      const y = (x.m < pm || (x.m === pm && x.d < pd)) ? py + 1 : py; if (validDate(y, x.m, x.d)) x.iso = isoOf(y, x.m, x.d); });
    return out.filter((x, i) => !out.some((y, j) => j !== i && y.idx <= x.idx && y.idx + y.len >= x.idx + x.len && y.len > x.len));
  }
  function findTimes(text) {
    const out = []; let r;
    // label row / value row — «SEAT  ZONE  GATE  BOARDING TIME» over «17F  C  B12  05:50»
    const skip = new Set(); { let off = 0; const ls = text.split('\n'); const cells = l => { const o = []; let m; const re = /\S+(?: \S+)*/g; while ((m = re.exec(l))) o.push({ i: m.index, s: m[0] }); return o; };
      let prevL = ''; ls.forEach((l, li) => { if (l.trim()) { const h = cells(prevL), v = cells(l); if (h.length >= 2 && h.length === v.length) v.forEach((c, j) => { if (/(boarding|einstieg|gate|посадк|embarque|imbarco|schlie|closes)/i.test(h[j].s)) skip.add(off + c.i); }); prevL = l; } off += l.length + 1; }); }
    const re = /(?<![\d:.])([01]?\d|2[0-3])[:h]([0-5]\d)(?![\d:])(?:\s?(AM|PM|A\.M\.|P\.M\.|pm|p\.m\.|a\.m\.)(?![\p{L}]))?/gu;
    while ((r = re.exec(text))) {
      if (skip.has(r.index)) continue;
      // слова перед временем — только после предыдущей цифры («Gate closes 06:00  Departure 06:10»)
      const before = text.slice(Math.max(0, r.index - 28), r.index).toLowerCase().replace(/^[\s\S]*\d/, '');
      if (/(boarding|einstieg|gate|посадк|embarque|embarquement|imbarco|schlie|closes|abflug spätestens|check-in bis|check-in schl)/.test(before)) continue;
      // durations «Durée 2h10», «Dauer 2:25», «Flight time 6h35» are not clock times
      if (/(dur[ée]e|dauer|duration|flugzeit|flight time|travel time|в пути|длительн|temps de vol)\s*:?\s*$/i.test(before)) continue;
      out.push({ idx: r.index, t: hm(r[1], r[2], r[3]) });
    }
    return out;
  }
  // Строки, где даты — не про поездку (дата бронирования, рождения …)
  // + booked on / gebucht am / checked in / issue date / date d'émission / né(e) le / geb.
  const BAD_LINE = /(buchungsdatum|booking date|booked on|gebucht am|checked in|date of (issue|booking|birth)|issue date|issued|ausgestellt|erstellt am|rechnungsdatum|invoice date|geburt|\bgeb\.|birth|рожд|дата (оформления|бронирования|выдачи)|fecha de (reserva|emisi.n|compra)|reservado el|r.serv. le|prenotazione effettuata|paid (?:in full |with [^\n]{0,25})?on|\bdob\b|(?:cancel|stornier|annul|anulaci|cancelaci|cancellazion|отмен|rückerstattung|r.ckerstattung)[^\n]{0,40}?(?:until|bis|hasta|jusqu|entro|до|before)|date d'[ée]mission|date de r[ée]servation|n[ée]\(?e?\)? le|storn|cancell?ation (policy|until|free)|kostenlos storn|бесплатная отмена|order date|purchase date|purchased on|date of purchase|bestelldatum|kaufdatum|дата заказа|дата покупки|data (?:di )?acquisto|fecha de compra|date de commande|date d'achat)/i;
  // mask only the cell that follows the bad keyword (up to 2+ spaces), not the whole line —
  // «Код бронирования  QWZ7PL  Дата оформления  14.04.2026» kept turning the code into QWZ#PL
  const BAD_CELL = new RegExp(BAD_LINE.source + '[^\\n\\d]{0,24}?[ \\t]*\\S[^\\n]*?(?=[ \\t]{2,}|$)', 'gim');
  function maskBadLines(text) {
    return text.replace(BAD_CELL, m => m.replace(/\d/g, '#'));
  }

  function parseBooking(raw, db, opts) {
    const o = opts || {};
    const text = maskBadLines(String(raw || '').replace(/\r/g, '').replace(/[ \t]/g, ' ').replace(/ {3,}/g, '   '));
    const lower = text.toLowerCase();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const dates = findDates(text, o.today);
    const times = findTimes(text);
    const res = { cat: 'ticket', segments: [], filled: [] };
    // Таблица «подписи в строке → значения в тех же колонках ниже»:
    //   ABHOLUNG          RÜCKGABE           Check-in          Check-out        Origen   Salida   Destino   Llegada
    //   Flughafen Alicante Flughafen Valencia Tue, May 12, 2026 Wed, May 20     Madrid   18/05 …  Sants     18/05 …
    const rows = lines.map(l => l.split(/\s{2,}|\s+\|\s+/).map(c => c.trim()).filter(Boolean));
    const plainC = c => c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isLabel = c => c.length <= 32 && !/\d/.test(c) && c.split(/\s+/).length <= 4;
    const cols = (re, max) => {
      for (let i = 0; i < rows.length; i++) {
        const h = rows[i]; if (h.length < 2 || !h.every(isLabel)) continue;
        const js = h.map((c, k) => re.test(plainC(c).replace(/[:.]+$/, '')) ? k : -1).filter(k => k >= 0); if (!js.length) continue;
        const out = [];
        for (let n = i + 1; n < rows.length && n <= i + (max || 4); n++) {
          let v = rows[n];
          if (v.length === h.length * 2 && h.length > 1) v = v.reduce((a, c, k) => (k % 2 ? a[a.length - 1] += '  ' + c : a.push(c), a), []); // «дата  время  дата  время»
          if (v.length > h.length || v.every(isLabel) && v.length === h.length && n > i + 1 && out.length) break;
          if (!(v.length < h.length && n === i + 1)) js.forEach(j => { if (j < v.length) out.push(v[j]); });
        }
        if (out.length) return out;
      }
      return [];
    };
    // «Pick-up   Athens Airport» / «Pick-up: Athens Airport» — значение в той же строке
    const kv = re => {
      for (const r of rows) for (let j = 0; j < r.length; j++) {
        const c = plainC(r[j]); const m = c.match(re); if (!m || m.index !== 0) continue;
        const rest = r[j].slice(m[0].length).replace(/^\s*[:\-–]\s*/, '').trim();
        const v = (rest ? [rest] : []).concat(r.slice(j + 1)).join('  ');
        if (/[\p{L}\d]{2}/u.test(v) && !(r.length >= 2 && r.every(isLabel))) return v;
      }
      return '';
    };
    const dateIn = (str, ref) => { const d = findDates(str, o.today)[0]; if (!d) return '';
      if (d.ny && ref) { const py = +ref.slice(0, 4), y = isoOf(py, d.m, d.d) < ref ? py + 1 : py; if (validDate(y, d.m, d.d)) return isoOf(y, d.m, d.d); }
      return d.iso; };
    const timeIn = (str, after) => { const t = findTimes(str).find(x => !after || x.idx >= after); return t ? t.t : ''; };
    // label row above a value row (same number of 2+-space separated cells) → label of the cell at idx
    const headerOf = idx => {
      const ls = text.lastIndexOf('\n', idx - 1) + 1; let pe = ls - 1; while (pe > 0 && !text.slice(text.lastIndexOf('\n', pe - 1) + 1, pe).trim()) pe = text.lastIndexOf('\n', pe - 1);
      if (pe <= 0) return '';
      const prev = text.slice(text.lastIndexOf('\n', pe - 1) + 1, pe), le = text.indexOf('\n', idx), cur = text.slice(ls, le < 0 ? text.length : le);
      const cells = l => { const o = []; let m; const re = /\S+(?: \S+)*/g; while ((m = re.exec(l))) o.push({ i: m.index, s: m[0] }); return o; };
      const h = cells(prev), v = cells(cur); if (h.length < 2 || h.length !== v.length) return '';
      const k = v.findIndex(c => idx - ls >= c.i && idx - ls < c.i + c.s.length); return k >= 0 ? h[k].s : '';
    };

    // Аэропорты: коды в тексте
    const codes = []; let r;
    const reCode = /(?<![A-Za-z0-9])([A-Z]{3})(?![A-Za-z0-9])/g;
    while ((r = reCode.exec(text))) if (!STOP.has(r[1]) && db.byCode.has(r[1])) codes.push({ idx: r.index, code: r[1] });
    // OCR glues city and code: «ANTALYAAYT» → AYT, if the prefix is that airport's city/name word
    const reGlued = /(?<![A-Za-z0-9])([A-Z]{3,})([A-Z]{3})(?![A-Za-z0-9])/g;
    while ((r = reGlued.exec(text))) { const a = db.byCode.get(r[2]); if (a && !STOP.has(r[2]) && a.allN.includes(' ' + norm(r[1]) + ' ')) codes.push({ idx: r.index + r[1].length, code: r[2] }); }
    codes.sort((a, b) => a.idx - b.idx);
    // Номера рейсов: код авиакомпании + 1–4 цифры
    const flights = [];
    // ICAO prefixes (EZY8423), no letter right after the digits (KX4T9QB), no aircraft types (A380-800), no UK postcodes (LU2 9PF)
    const ICAO = { EZY: 'U2', EJU: 'U2', EZS: 'U2', RYR: 'FR', EWG: 'EW', DLH: 'LH', THY: 'TK', AFL: 'SU', UAE: 'EK', KLM: 'KL', AFR: 'AF', BAW: 'BA', WZZ: 'W6', VLG: 'VY', PGT: 'PC', CFG: 'DE', SWR: 'LX', AUA: 'OS', IBE: 'IB', TAP: 'TP', SAS: 'SK', QTR: 'QR' };
    const reFl = /(?<![A-Za-z0-9])(EZY|EJU|EZS|RYR|EWG|DLH|THY|AFL|UAE|KLM|AFR|BAW|WZZ|VLG|PGT|CFG|SWR|AUA|IBE|TAP|SAS|QTR|[A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{1,4})(?![A-Za-z\d:.,])/g;
    while ((r = reFl.exec(text))) {
      const al = ICAO[r[1]] || r[1];
      if (!db.airlines[al]) continue;
      if (/^(19|20)\d\d$/.test(r[2]) && /\s/.test(r[0])) continue; // «MA 2026» — это не рейс
      const after = text.slice(r.index + r[0].length, r.index + r[0].length + 5), before = text.slice(Math.max(0, r.index - 14), r.index);
      if (/^-\d/.test(after) || /(airbus|boeing|embraer|aircraft|flugzeug|appareil|самол[её]т)[ \t]*$/i.test(before)) continue;
      if (/^ \d[A-Z]{2}\b/.test(after)) continue;
      if ((r[1] === 'AM' || r[1] === 'PM') && /\d[:.]\d\d\s?$/.test(before)) continue; // «10:30 AM 1 Jeff Fuqua Blvd»
      // gate / seat values are not flight numbers («GATE … B12» — B1 is an airline code)
      if (/(gate|flugsteig|выход|porte|puerta)[ \t]*:?[ \t]*$/i.test(before) || /^(gate|seat|zone|terminal|sitz\S*|row|seq\S*|выход|место)$/i.test(headerOf(r.index))) continue;
      flights.push({ idx: r.index, num: al + r[2], code: al });
    }
    const flightWords = /(flug|flight|рейс|vuelo|\bvol\b|volo|boarding|bordkarte|посадочн|airline|fluggesellschaft|abflug|departure|вылет|terminal)/i.test(lower);
    const uniqFl = () => new Set(flights.map(f => f.num)).size;
    const isFlight = codes.length >= 2 && (flights.length > 0 || flightWords);
    // Категория: подсчёт признаков (одно случайное слово «hotel» / «Bus und Bahn» не решает)
    const plain = lower.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const hits = re => (plain.match(re) || []).filter((x, i, a) => a.indexOf(x) === i).length;
    const ticketScore = hits(/(tickets?\b|e-?ticket|eintrittskarte|eintritt|einlass|admission|entrada|biglietto|billet\b|ingresso|билет|экскурс|ваучер|voucher|museum|museo|musee|музей|concert|konzert|концерт|guided tour|fuhrung|meeting point|treffpunkt|место встречи|punto de encuentro|visit date|getyourguide|tiqets|eventim|ticketmaster|viator|klook|musement|civitatis|coopculture|\bblock\b|\breihe\b|time slot)/g);
    const stayScore = hits(/(hotel|check-?in|check-?out|anreise|abreise|unterkunft|apartment|appartement|ferienwohnung|ferienhaus|hostel|resort|booking\.com|airbnb|заезд|выезд|отель|гостиниц|alojamiento|hebergement|alloggio|ubernachtung|nights?\b|nachte|ночей|ночи|noches|nuits|notti|zimmer|\broom\b|habitacion|chambre|\bcamera\b|arrivee|llegada|arrivo|partenza|sejour|soggiorno|estancia|huesped|\bguests?\b|ospiti|гости\b|\bhaus\b)/g);
    const transportScore = hits(/(mietwagen|car rental|rental car|rent a car|autovermietung|pick-?up|abholung|ruckgabe|drop-?off|прокат|аренда (?:авто|машин)|alquiler|recogida|devolucion|location de voiture|noleggio|zugticket|fahrkarte|\btrain\b|\bbahn\b|\bzug\b|gleis|поезд|автобус|fernbus|flixbus|\bbus\b|coach|autobus|sixt|europcar|hertz|\bavis\b|goldcar|alamo|renfe|\btren\b|\bave\b|trenitalia|sncf|origen|destino|transfer|shuttle|трансфер|\btaxi\b|такси|vehicle|vehiculo|fahrzeug|\bdriver\b|conductor)/g);
    // Аренда авто / трансфер: в письме есть код аэропорта и номер рейса прилёта, но это не авиабилет
    const pickRet = /(pick-?up|abholung|recogida|получение|prise en charge|ritiro)/.test(plain) && /(return|ruckgabe|drop-?off|devolucion|возврат|restitution|riconsegna)/.test(plain);
    const rentalOrTransfer = pickRet && /(rent|miet|alquiler|прокат|аренд|location|noleggio|vehicle|vehiculo|fahrzeug|\bcar\b|coche|машин|transfer|трансфер|shuttle|driver|fahrer)/.test(plain);
    const notFlight = rentalOrTransfer && uniqFl() <= 1 && !/(boarding ?pass|bordkarte|посадочный|e-?ticket number|ticketnummer)/.test(plain);
    const stayStrong = hits(/(check-?in|check-?out|checkout|anreise|abreise|nights?\b|nachte|ночей|ночи|noches|nuits|notti|заезд|выезд|llegada|arrivee|arrivo|\broom\b|zimmer|habitacion|chambre)/g);
    if (isFlight && !notFlight) res.cat = 'flight';
    else if (ticketScore >= 2 && ticketScore > stayStrong && ticketScore > transportScore) res.cat = 'ticket';
    else if (stayScore && stayScore >= transportScore && !(rentalOrTransfer && transportScore >= 2)) res.cat = 'stay';
    else if (transportScore) res.cat = 'transport';
    else res.cat = 'ticket';
    res.boarding = res.cat === 'flight' && /(boarding ?pass|bordkarte|посадочный талон|tarjeta de embarque|carte d'embarquement|carta d'imbarco)/i.test(lower);

    // Номер брони
    const reCodeKw = /(buchungs(?:code|nummer|referenz|bestätigung)|reservierungs(?:code|nummer)|booking (?:reference|code|number|ref\.?|id)|confirmation (?:number|code|no\.?)|bestätigungs(?:nummer|code)|\bpnr\b|record locator|filekey|reservation (?:number|code|no\.?)|код бронирования|номер (?:бронирования|брони|заказа)|localizador|r[ée]f[ée]rence(?: de r[ée]servation)?|codice (?:di )?prenotazione|auftragsnummer|bestellnummer|order (?:reference|number|no\.?|id)|booking number|numero (?:d'?)?ordine|n[º°o]\.? de pedido|itinerary(?: number| no\.?)?|num.ro de r.servation|n.mero de (?:confirmaci.n|reserva)|confirmation)\s*(?:\((?:pnr|code)\)\s*)?(?:(?:no\.?|nr\.?|n[°º]\.?|#|:|-)\s*){0,2}(?:\n\s*)?(\d{3,5}(?:[ .\-]\d{3,5}){1,4}(?![\d.])|[A-Z0-9][A-Z0-9-]{4,13})/i;
    const reCodeAll = new RegExp(reCodeKw.source, 'gi'); let bc;
    while ((bc = reCodeAll.exec(text))) {
      let v = bc[2].replace(/[ .](?=\d)/g, ''); if (/^\d{3,5}(?:-\d{3,5})+$/.test(v)) v = v.replace(/-/g, ''); // «4123.567.890», «#3104-552-987»
      if ((/[A-Z]/.test(v) && /\d/.test(v) || /^[A-Z]{6}$/.test(v)) && v === v.toUpperCase() || /^\d{5,14}$/.test(v)) { res.code = v; break; }
      reCodeAll.lastIndex = bc.index + bc[1].length; // следующее ключевое слово могло быть «съедено»
    }
    // label above, value at the end of the next (merged two-column) line:
    // «Booking reference\nDear Mr Daniel Krause, thank you …  LZ8M4P»
    if (!res.code) {
      const reKw = new RegExp(reCodeKw.source.slice(0, reCodeKw.source.indexOf(')\\s*') + 1), 'gi'); let k;
      while (!res.code && (k = reKw.exec(text))) {
        const win = text.slice(k.index + k[0].length, k.index + k[0].length + 200);
        const t = win.match(/(?<![A-Za-z0-9])(?:(?=[A-Z0-9]{6,8}(?![A-Za-z0-9]))(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6,8}|[A-Z]{6})(?![A-Za-z0-9])/);
        if (t && !flights.some(f => text.substr(f.idx, t[0].length + 1).replace(/\s/g, '').startsWith(t[0]) || f.num === t[0]) && !/^(EZY|EJU|EZS|RYR|EWG|DLH|THY|AFL|UAE|KLM|AFR|BAW|WZZ|VLG)\d+$/.test(t[0])) res.code = t[0];
      }
    }

    // «Guests   Confirmation code» → «2 guests   HMABCD1234» (подпись и значение в разных строках одной колонки)
    if (!res.code) {
      const v = cols(/^(confirmation (?:code|number)|booking (?:code|reference|number)|buchungs(?:nummer|code)|reservation (?:code|number)|reservierungsnummer|localizador|codice (?:di )?prenotazione|номер (?:бронирования|брони|заказа)|код бронирования|num.ro de r.servation|itinerary.*)$/).map(x => x.replace(/^#\s*/, '')).find(x => /^(?=[A-Z0-9-]*\d)[A-Z0-9-]{5,14}$/.test(x));
      if (v) res.code = v;
    }
    const pin = text.match(/\bPIN(?:[- ]?(?:Code|код|code))?\s*[:#]?\s*(\d{3,8})\b/i);
    if (pin) res.note = 'PIN-код: ' + pin[1];
    // Люди
    const AD = '(?:erwachsene?r?|adults?|взросл\\S*|adultos?|adultes?|adulti|adulto|interi|intero)', CH = '(?:kinder|kind|child(?:ren)?|juniors?|youth|дет\\S*|ребен\\S*|ребён\\S*|niños?|enfants?|bambini)';
    const cnt = w => { const a = lower.match(new RegExp('(?<![\\d.,])(\\d+)\\s*(?:x|×)?\\s*' + w)); if (a) return a; const b = lower.match(new RegExp(w + '\\b\\s*(?:\\([^)\\n]{0,15}\\))?\\s*(?:x|×)\\s*(\\d+)')); return b; };
    const ad = cnt(AD), ch = cnt(CH);
    // «Personen: 4 (2 Erwachsene, 2 Kinder)» — дети могли уйти на другую строку
    const tot = lower.match(new RegExp('(?<![\\d.,])(\\d{1,2})\\s*\\(\\s*(\\d{1,2})\\s*' + AD));
    const guests = lower.match(/(?<![\d.,])(?<!(?:bis zu|up to|max\.?|maximal|до)\s)(\d{1,2})\s*(?:guests?|gäste|personen|personnes|persone|personas|hu[ée]spedes|ospiti|гост(?:ь|я|ей)|человека?)(?![\p{L}])/u);
    if (ad) {
      const a = +ad[1], c = ch ? +ch[1] : (tot && +tot[2] === a && +tot[1] > a ? +tot[1] - a : 0);
      res.people = a + ' ' + (a === 1 ? 'взрослый' : 'взрослых') + (c ? ', ' + c + ' ' + (c === 1 ? 'ребёнок' : 'детей') : '');
    } else if (guests && res.cat !== 'flight') {
      const n = +guests[1]; res.people = n + ' ' + (n === 1 ? 'гость' : n < 5 ? 'гостя' : 'гостей');
    } else {
      const names = new Set(); let m;
      const reName = /\b([A-ZÄÖÜ][A-ZÄÖÜ'-]{1,})\s?\/\s?([A-ZÄÖÜ][A-ZÄÖÜ' -]{1,}?)\s*(MRS|MR|MS|MSTR|MISS|CHD|INF)?\b/g;
      // «SURNAME/FIRST» only with a title (MR/MRS/…) or on a passenger/name line —
      // otherwise TAXES/FEES, REF/CHG, ISTANBUL/TK, MOCA/KA (OCR) are counted as people
      const lineOf = i => text.slice(text.lastIndexOf('\n', i) + 1, text.indexOf('\n', i) < 0 ? text.length : text.indexOf('\n', i));
      while ((m = reName.exec(text))) if (m[3] || /(passeng|passag|reisend|пассажир|\bname\b|\bnom\b)/i.test(lineOf(m.index))) names.add(m[1] + '/' + m[2].trim());
      // upper-case titles (MS EMILY CARTER on boarding passes) and French M./Mme/Mlle
      const reTitle = /(?:^|\n)\s*(?:\d+\.\s*)?(?:Herr|Frau|HERR|FRAU|Mr\.?|MR\.?|Mrs\.?|MRS\.?|Ms\.?|MS\.?|Miss|MISS|M\.|Mme|MME|Mlle|Г-н|Г-жа)\s+[A-ZÄÖÜА-Я][\p{L}'-]+(?:\s+[A-ZÄÖÜА-Я][\p{L}'-]+)?/gu;
      while ((m = reTitle.exec(text))) names.add(m[0].trim().toLowerCase());
      if (names.size) res.people = names.size + ' ' + (res.cat === 'flight' ? (names.size === 1 ? 'пассажир' : names.size < 5 ? 'пассажира' : 'пассажиров') : (names.size === 1 ? 'гость' : names.size < 5 ? 'гостя' : 'гостей'));
    }
    // Места
    const seats = new Set(); let sm;
    // lists after one keyword («Sitzplatz: 7C (Hinflug), 9A (Rückflug)»), accents lost by OCR («Siege 12C»)
    const reSeat = /(?:seat|sitz(?:platz)?|место|asiento|si[èe]ge|posto)s?\s*(?:no\.?|nr\.?|number)?\s*[:#]?\s*(\d{1,2}[A-K]\b(?:[^\n\d]{0,20}?(?:,|\/|&|\bund\b|\band\b|\bet\b|\bи\b)\s*\d{1,2}[A-K]\b)*)/gi;
    while ((sm = reSeat.exec(text))) (sm[1].match(/\d{1,2}[A-K]\b/gi) || []).forEach(s => seats.add(s.toUpperCase()));
    // label row / value row («SEAT  ZONE  GATE …» then «17F  C  B12 …»)
    { const ls = text.split('\n');
      for (let i = 0; i + 1 < ls.length; i++) {
        let n = i + 1; while (n < ls.length - 1 && !ls[n].trim()) n++;
        const h = ls[i].trim().split(/\s{2,}/), v = ls[n].trim().split(/\s{2,}/);
        if (h.length < 2 || h.length !== v.length) continue;
        h.forEach((c, j) => { if (/^(seat|sitz(platz)?|место|si[èe]ge|asiento|posto)$/i.test(c) && /^\d{1,2}[A-K]$/.test(v[j])) seats.add(v[j].toUpperCase()); });
      } }
    if (seats.size) res.seats = [...seats].join(', ');
    // Цена
    const rePrice = /(gesamt(?:preis|betrag|summe)?|endpreis|reisepreis|total(?: price| amount| paid| cost)?|grand total|amount paid|bezahlt|итого|всего|к оплате|сумма|importe total|precio total|prix total|totale|summe)(?![a-zа-я])(?:\([^)\n]{0,30}\)|[^\n\d€$£(]){0,40}?\s*(€|eur|usd|\$|£|gbp|chf|rub|₽)?\s*(\d{1,3}(?:[ .,' ]?\d{3})*[.,]\d{2}|\d{1,3}(?:[ .' ]?\d{3})*(?=\s*(?:€|eur|usd|\$|£|gbp|chf|rub|руб|₽|р\b|р$|р\s)))\s*(€|eur|euro|usd|\$|£|gbp|chf|rub|руб|₽|р)?/gi;
    let best = null, pm;
    while ((pm = rePrice.exec(text))) { const v = amount(pm[3]); if (v > 0 && v < 100000 && (!best || /gesamt|total|итого|к оплате|endpreis|reisepreis|grand/i.test(pm[1]))) best = { v, cur: (pm[2] || pm[4] || '').toLowerCase() }; }
    if (best) { res.price = best.v; res.currency = CUR[best.cur] || o.currency || ''; }

    const firstDateAfter = (re, span) => { if (!re.global) re = new RegExp(re.source, re.flags + 'g'); let m; while ((m = re.exec(lower))) { const at = m.index; const d = dates.find(d => d.idx >= at && d.idx <= at + (span || 120)); if (d) return d; } return null; };
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
          // next flight number on the SAME line → window ends at that number, not at its line start (empty window)
          const nx = uniq[i + 1];
          const end = nx ? (lineStart(nx.idx) > lineStart(f.idx) ? lineStart(nx.idx) : nx.idx) : Math.min(text.length, lineEnd(f.idx) + 400);
          const floor = i && lineStart(uniq[i - 1].idx) < lineStart(f.idx) ? lineEnd(uniq[i - 1].idx) + 1 : (i ? uniq[i - 1].idx + uniq[i - 1].num.length : 0);
          let s = build(Math.max(floor, lineStart(f.idx)), end, f.num, f.idx);
          if (!s) s = build(Math.max(floor, f.idx - 400), end, f.num, f.idx);
          // if the flight's own line names two airports, they win over codes found further down (fare calc lines etc.)
          // otherwise take the NEAREST block of airport codes (route header above the flight line — easyJet —
          // or the airport row below it — Eurowings), not simply the first two codes of the forward window
          if (s) {
            const ls0 = lineStart(f.idx), le0 = lineEnd(f.idx), nl = (a, b) => (text.slice(a, b).match(/\n/g) || []).length;
            const uniqC = arr => { const o = []; arr.forEach(c => { if (!o.some(x => x.code === c.code)) o.push(c); }); return o; };
            const own = uniqC(codes.filter(c => c.idx >= ls0 && c.idx < le0));
            const lo = Math.max(i ? lineEnd(uniq[i - 1].idx) + 1 : 0, f.idx - 400);
            const up = uniqC(codes.filter(c => c.idx >= lo && c.idx < ls0).reverse()).slice(0, 2).reverse();
            const dn = uniqC(codes.filter(c => c.idx >= le0 && c.idx < end)).slice(0, 2);
            let pick = own.length >= 2 ? own : null;
            if (!pick) { const du = up.length >= 2 ? nl(up[1].idx, ls0) : 1e9, dd = dn.length >= 2 ? nl(le0, dn[0].idx) : 1e9; if (du < 1e9 || dd < 1e9) pick = du < dd ? up : dn; }
            if (pick) { s.from = pick[0].code; s.to = pick[1].code; }
            // «22:20 … 19:55» + «CGN … IBZ» from vertically-centred columns: if the wrap-around duration is impossible
            // for the distance but the reversed reading fits, the columns were read right-to-left → swap both
            const A = db.byCode.get(s.from), B = db.byCode.get(s.to);
            if (A && B && s.time && s.endTime && s.endTime < s.time) {
              const mins = t => +t.slice(0, 2) * 60 + +t.slice(3), km = dist(A.lat, A.lon, B.lat, B.lon);
              const est = km / 800 * 60 + 30, tz = Math.abs(B.lon - A.lon) / 15 * 60 + 90;
              const wrap = mins(s.endTime) + 1440 - mins(s.time), rev = mins(s.time) - mins(s.endTime);
              const explicitNext = dates.some(d => d.idx >= ls0 && d.idx < end && d.iso === addDay(s.date, 1)) || /(\d[:h]\d\d\s?\(?\+\s?1\b|\+\s?1\s?(day|tag|jour|д))/i.test(text.slice(ls0, end));
              if (!explicitNext && Math.abs(wrap - est) > tz && Math.abs(rev - est) <= tz) { [s.from, s.to] = [s.to, s.from]; [s.time, s.endTime] = [s.endTime, s.time]; delete s.endDate; }
            }
          }
          if (s) segs.push(s);
        });
      }
      if (!segs.length) {
        // «London Gatwick (LGW) to Nice (NCE)»
        const reArrow = /(?<![A-Za-z])\(?([A-Z]{3})\)?\s*(?:-|–|—|→|->|>|to|nach|до|a|à)\s*(?:[\p{L} .'\/-]{1,30}\()?([A-Z]{3})(?![A-Za-z])/gu;
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
        ticket: [/(datum|date|дата|fecha|\bdata\b|beginn|start|начало|einlass|valid|gültig|válid|valid[oa]|действ)/, /(ende\b|\bend\b|окончание|\bfin\b)/]
      }[res.cat];
      const a = firstDateAfter(new RegExp(KW[0].source, 'g')), b = firstDateAfter(new RegExp(KW[1].source, 'g'));
      const d0 = a || dates[0];
      let d1 = b && (!d0 || b.iso > d0.iso) ? b : null;
      // колонки «Check-in | Check-out» на одной строке: у выезда та же первая дата — берём следующую дату позже заезда
      if (res.cat === 'ticket' && !d1 && d0) { const nx = dates.find(d => d.idx > d0.idx && d.iso > d0.iso); if (nx && /^\s*(?:-|–|—|bis|to|until|au|al|по|до)\s*$/i.test(text.slice(d0.idx + d0.len, nx.idx))) d1 = nx; }
      else if (!d1 && d0) d1 = dates.find(d => d.idx > d0.idx && d.iso > d0.iso && d.idx - d0.idx < 260) || (!b ? dates.find(d => d.iso > d0.iso) : null);
      if (d0) { res.date = d0.iso; res.time = timeNear(d0.idx); }
      if (res.cat === 'ticket') {
        const lt = text.match(/(?<![\p{L}])(beginn|start(?:s| time)?|show|time ?slot|zeitfenster|uhrzeit|hora|ora|heure|время|начало|time)(?![\p{L}])(?:[^\n\d]{0,40}|[^\n]{0,60}\n\s*)(\d{1,2})[:.h](\d{2})/iu);
        if (lt) res.time = pad(lt[2]) + ':' + lt[3];
        else if (res.time && /(einlass|doors|entry from|сбор)[^\n]{0,15}$/i.test(text.slice(0, text.indexOf(res.time, d0 ? d0.idx : 0)))) res.time = '';
      }
      if (d1 && d1.iso !== res.date) { res.endDate = d1.iso; res.endTime = timeNear(d1.idx); }
      if (res.endTime && res.endTime === res.time) res.endTime = '';

      // Таблица / «подпись: значение»: начало и конец по колонкам (точнее, чем «первая дата после слова»)
      const IN = res.cat === 'stay'
        ? /^(check-?in|anreise|arrival|ankunft|заезд|llegada|arrivee|arrivo)(?![a-zа-я])/
        : /^(pick-?up|abholung|ubernahme|recogida|получение|prise en charge|ritiro|departure|abfahrt|salida|origen|depart|partenza|отправление)(?![a-zа-я])/;
      const OUT = res.cat === 'stay'
        ? /^(check-?out|checkout|abreise|departure|выезд|salida|depart|partenza)(?![a-zа-я])/
        : /^(return|ruckgabe|drop-?off|devolucion|возврат|restitution|riconsegna|arrival|ankunft|llegada|destino|arrivee|arrivo|прибытие)(?![a-zа-я])/;
      let cin = [], cout = [], colOk = false;
      if (res.cat !== 'ticket') {
        cin = cols(IN); cout = cols(OUT);
        if (!cin.length) { const v = kv(IN); if (v) cin = [v]; }
        if (!cout.length) { const v = kv(OUT); if (v) cout = [v]; }
        const when = res.cat === 'transport' && !dateIn(cin.join('  ')) ? kv(/^(date (?:&|and) time|datum (?:&|und) uhrzeit|fecha y hora|date et heure|дата и время|date|datum|fecha|дата)\b/) : '';
        const jin = cin.join('  ') + (when ? '  ' + when : ''), jout = cout.join('  ');
        const di = dateIn(jin);
        if (di) {
          res.date = di; colOk = true;
          const t = timeIn(jin, findDates(jin, o.today)[0].idx); if (t) res.time = t; else if (res.cat === 'stay') res.time = '';
          const dq = dateIn(jout, di);
          if (dq && dq > di) { res.endDate = dq; res.endTime = ''; }
          else if (dq === di) delete res.endDate;
          const dqx = findDates(jout, o.today)[0];
          const to = timeIn(jout, dqx ? dqx.idx : 0);
          if (to || dq) res.endTime = to;
        }
      }
      // «14 Nächte / nights / ночей» — если дата выезда не нашлась
      const nights = lower.match(/(\d{1,2})\s*(nächte|nacht|nights?|ноч(?:ей|и|ь)|noches|nuits|notti)/);
      if (nights && res.date && !res.endDate && res.cat === 'stay') res.endDate = addDay(res.date, +nights[1]);
      // время: «Check-in ab 15:00», «Check-out bis 12:00», «Заезд с 14:00», «Check-in time starts at 3:00 PM»
      const tRe = '[^\\n\\d]{0,28}?(\\d{1,2})[:.h](\\d{2})(?:\\s?(AM|PM|A\\.M\\.|P\\.M\\.|pm|p\\.m\\.|a\\.m\\.)(?![\\p{L}]))?';
      const tIn = text.match(new RegExp('(?:check-?in|anreise|arrival|заезд|llegada|arrivée|arrivo)' + tRe, 'iu'));
      const tOut = text.match(new RegExp('(?:check-?out|abreise|departure|выезд|salida|départ|partenza)' + tRe, 'iu'));
      if (res.cat === 'stay' && !colOk) {
        if (tIn) res.time = hm(tIn[1], tIn[2], tIn[3]);
        if (tOut) res.endTime = hm(tOut[1], tOut[2], tOut[3]);
        if (!tOut && res.time && res.endTime && res.endTime > res.time && !b) res.endTime = '';
      }
      if (res.endTime && res.endTime === res.time && res.cat === 'stay') res.endTime = '';

      // Адрес: «Musterstraße 5, 10115 Berlin», «Calle Mayor 5», «12 rue de Rivoli», «ул. Тверская, 3»
      const reSuffix = /(?:[\p{Lu}][\p{L}.\-]*\s+)?(?:[\p{Lu}][\p{L}.\-]*?)?(?<!sitz|stell|park|Sitz|Stell|Park)(?:[Ss]traße|[Ss]trasse|[Ss]tr\.|[Gg]asse|[Ww]eg|[Pp]latz|[Aa]llee|[Dd]amm|[Uu]fer|[Rr]ing|[Ss]teig|[Cc]haussee)\s*\d+\s*[a-z]?(?:\s*,\s*\d{4,5}\s+[\p{L}][\p{L}\- ]*)?/u;
      const rePrefix = /(?<![\p{L}])(?:calle|c\/|carrer|avenida|avda\.|av\.|avinguda|passeig|pg\.|plaça|plaza|paseo|camino|rambla|ronda|travessera|via|viale|piazza|corso|largo|rua|rue|boulevard|blvd|avenue|street|road|quai|ул\.|улица|проспект|пр\.|наб\.|пер\.)\s+[^,\n]{2,40}?,?\s*\d{1,4}[a-z]?\b[^\n]{0,60}/iu;
      const reNumFirst = /(?<![\p{L}\d])\d{1,4}[a-z]?,?\s+(?:rue|avenue|boulevard|bd|quai|place|allée|impasse|chemin|route|street|road|avenue|lane|drive)\s+[^\n]{2,70}/iu;
      const reEnd = /(?:street|road|st\.|avenue|ave\.|lane|drive|blvd)\b/i;
      const cutAddr = s => s.split(/\s+[·•|–-]\s+|\s+(?:tel|tél|phone|тел)\.?\s*:?\s*\+?\d|\s+\+\d|\s{2,}/i)[0];
      const asegs = [];
      text.split('\n').forEach((l, li, all) => l.split(/\s{2,}/).forEach(seg => asegs.push({ seg: seg.replace(/^[^\p{L}\d]+/u, '').trim(), prev: all[li - 1] || '', next: (all[li + 1] || '') + '   ' + (all[li + 2] || '') })));
      for (const { seg, prev, next } of asegs) {
        if (/(helpline|hotline|kundenservice|customer (?:service|support)|©|служба поддержки)/i.test(prev) && /^[^\n]{0,40}$/.test(prev.split(/[.·]/).pop() || '') && res.cat === 'ticket') continue; // реквизиты издателя в подвале
        if (!seg || BAD_LINE.test(seg) || /(gmbh|b\.v\.|s\.l\.|s\.a\.|s\.r\.l\.|\bsa\b|\bag\b|\bltd\b|\binc\b|\blp\b|ооо|инн|\bvat\b|\bcif\b|p\.?\s?iva|ust-?id|kundenservice|customer service|helpline|служба поддержки)/i.test(seg)) continue;
        const m = seg.match(reSuffix) || seg.match(reNumFirst) || seg.match(rePrefix) || (reEnd.test(seg) && /\d/.test(seg) && seg.length <= 80 ? [seg] : null);
        if (!m) continue;
        let a = cutAddr(m[0]).replace(/^(adresse|address|адрес|dirección|indirizzo)\s*:?\s*/i, '').replace(/\s{2,}/g, ' ').trim();
        // страна в той же строке («…, 23743 Grömitz, Deutschland») или на следующей («…Barcelona,» + «Spain»)
        const tail = seg.slice(seg.indexOf(m[0]) + m[0].length).match(/^\s*,\s*([\p{L} ]{3,30}?)(?=\s*(?:[,·•|]|\s{2,}|$))/u);
        if (tail && COUNTRIES.has(norm(tail[1])) && !a.includes(tail[1])) a = a.replace(/[,\s]+$/, '') + ', ' + tail[1].trim();
        const nx = next.split(/\s{2,}|\|/).map(x => x.replace(/^[^\p{L}]+/u, '').trim()).find(x => COUNTRIES.has(norm(x))) || '';
        if (/,$/.test(seg.trim()) && nx) a = a.replace(/,?$/, ', ') + nx;
        res.place = a.replace(/[,\s]+$/, ''); break;
      }
      // Строки без шапки письма (От:/From:/Betreff: …), ссылок и e-mail
      const HDR = /^(from|to|cc|subject|sent|von|an|betreff|gesendet|de|para|asunto|da|a|oggetto|objet|à|от|кому|тема)\s*:/i;
      const cells = lines.filter(l => !HDR.test(l)).flatMap(l => l.split(/\s{2,}/)).map(c => c.trim())
        .filter(c => c && !/@|^\[|https?:|www\.|\.(?:com|de|ru|es|it|fr)\b/i.test(c) && !BAD_LINE.test(c));
      const earliest = (list, alt) => { let best = null;
        list.forEach(n => { const re = new RegExp('(?<![\\p{L}])' + (alt && alt[n] || n.replace(/[.]/g, '\\.').replace(/\s+/g, '\\s?')) + '(?![\\p{L}])', 'iu'); const m = text.match(re); if (m && (!best || m.index < best.i)) best = { n, i: m.index }; });
        if (best) return best.n;
        // логотип, разорванный распознаванием: «re nfe», «Welcome Pickups» → ищем без пробелов
        const flat = plain.replace(/[^a-zа-я0-9]/g, '');
        const COMMON = /^(national|budget|dollar|enterprise|record go|uber|bolt|alsa|italo|hoppa|tui|ihg|hrs)$/i;
        const hit = list.filter(n => !COMMON.test(n)).map(n => ({ n, i: flat.indexOf(norm(n).replace(/\s/g, '')) })).filter(x => x.i >= 0 && norm(x.n).replace(/\s/g, '').length >= 5).sort((a, b) => a.i - b.i)[0];
        return hit ? hit.n : ''; };
      // Название
      if (res.cat === 'stay') {
        const reProp = /(hotel|hôtel|apartment|apartamento|appartement|apartamentos|aparthotel|hostel|hostal|resort|villa|casa\b|suites?\b|residence|lodge|pension|gasthof|gasthaus|ferienwohnung|ferienhaus|cottage|chalet|bungalow|guest ?house|b&b|albergo|palazzo|palace|motel|mercure|novotel|ibis|marriott|hilton|sheraton|radisson|melia|meliá|holiday inn|отель|гостиница|апартаменты|хостел|гостевой дом)/i;
        const badT = /(booking\.com|airbnb|hotels\.com|check-?in|check-?out|anreise|abreise|bestätig|confirm|conferma|подтвержд|ihre buchung|your booking|phone|telefon|\btel\b|тел\.|paiement|payment|pago|zahlung|оплат|parking|frühstück|breakfast|desayuno|petit|colazione|завтрак|\broom\b|zimmer|chambre|habitaci|camera|номер «|\d{1,2}[./]\d{1,2}|foto|photo)/i;
        const name = cells.find(l => reProp.test(l) && l.length <= 70 && !badT.test(l));
        const by = lines.map(l => l.match(/(?:ihre buchung (?:im|in der|bei)|ihr aufenthalt (?:im|in der)|your (?:booking|reservation|stay) at|(?:^|\s)stay at|бронирование в|su estancia en|aver scelto|avoir choisi|séjour (?:à l'|au |à )|soggiorno (?:presso|al|all'))\s+(.{3,110})/i)).find(Boolean);
        let t = by ? by[1].replace(/[.!].*$/, '') : '';
        if (t) { const longer = cells.find(l => l.length > t.length && l.length <= 70 && l.toLowerCase().startsWith(t.toLowerCase()) && !badT.test(l)); if (longer) t = longer; }
        res.title = (t || name || '').replace(/\s+(ist|wurde|is|has been|was)?\s*(bestätigt|confirmed|подтвержден[оа]?|confirmad[oa])\b.*$/i, '').replace(/[.!,:]+$/, '').trim();
        res.provider = earliest(STAY_SITES, { 'Ostrovok': 'ostrovok|островок', 'FeWo-direkt': 'fewo-?direkt', 'Booking.com': 'booking\\.com' }) || (pin && /buchungsnummer|booking number|confirmation number/i.test(lower) ? 'Booking.com' : '');
      } else if (res.cat === 'transport') {
        const kind = /(mietwagen|car rental|rental car|rent a car|autovermietung|прокат|аренда (?:авто|машин)|alquiler|location de voiture|noleggio|sixt|europcar|hertz|\bavis\b|goldcar|alamo|enterprise|thrifty|centauro|drivalia|record go)/i.test(plain) ? 'car'
          : /(transfer|shuttle|трансфер|\btaxi\b|такси|welcome ?pickups|holidaytaxis|suntransfers|kiwitaxi|hoppa|blacklane)/i.test(plain) ? 'transfer'
          : /(\bzug\b|\btrain\b|\bbahn\b|поезд|renfe|sncf|trenitalia|\btren\b|\bave\b|\bice\b|italo|ouigo|eurostar|fahrkarte|gleis|bahnsteig)/i.test(plain) ? 'train'
          : /(\bbus\b|автобус|flixbus|fernbus|autobus|coach|regiojet|alsa)/i.test(plain) ? 'bus' : '';
        res.title = { car: 'Аренда авто', transfer: 'Трансфер', train: 'Поезд', bus: 'Автобус' }[kind] || 'Транспорт';
        res.provider = earliest(RENTALS, { 'Welcome Pickups': 'welcome\\s?pickups', 'Flixbus': 'flix\\s?bus', 'Deutsche Bahn': 'deutsche bahn|\\bDB\\b(?=\\s)' });
        // Места: маршрут «Köln Hbf → München Hbf», колонки «Pick-up | Return», «Abholung: …»
        const placeOf = vals => { for (let v of vals.flatMap(x => String(x || '').split(/\s{2,}/))) {
          v = v.replace(/^(ab|an|from|to|von|nach)\s+/i, '').trim();
          if (findDates(v, o.today).length || findTimes(v).length || !/\p{L}{3}/u.test(v) || /^\d/.test(v) || /^(terminal|gate|gleis|platform|wagen|coche|plaza|seat|sitz)/i.test(v)) continue;
          v = v.replace(/\s*,.*$/, '').replace(/\s*[·•|].*$/, '').trim();
          if (v.length >= 3 && v.length <= 60) return v;
        } return ''; };
        let p1 = '', p2 = '';
        if (kind === 'train' || kind === 'bus') {
          const rt = lines.map(l => l.match(/([\p{L}][\p{L}\d .'’()\/-]{1,60}?)\s+(?:→|->|—>|=>|➝|➔|–>|—[.\-]?|>)\s+([\p{L}][\p{L}\d .'’()\/-]{1,60})/u)).find(Boolean);
          if (rt) { p1 = rt[1].replace(/^.*:\s*/, '').trim(); p2 = rt[2].trim(); }
          const ab = text.match(/(?:\bab|abfahrt|departure|salida|départ|partenza|отправление)\s*:?\s*(\d{1,2})[:.](\d{2})/i), an = text.match(/(?:\ban|ankunft|arrival|llegada|arrivée|arrivo|прибытие)\s*:?\s*(\d{1,2})[:.](\d{2})/i);
          if (!colOk && ab) res.time = pad(ab[1]) + ':' + ab[2];
          if (!colOk && an) res.endTime = pad(an[1]) + ':' + an[2];
        }
        if (!p1) p1 = placeOf(cin.length ? cin : [kv(IN)]);
        if (!p2) p2 = placeOf(cout.length ? cout : [kv(OUT)]);
        if (p1) res.place = p1; else if (res.place && /\d/.test(res.place) && kind !== 'car') res.place = '';
        if (p2 && p2 !== p1) res.placeTo = p2;
      } else {
        const reT = /(ticket|eintritt|admission|tour|führung|экскурс|билет|entrada|biglietto|billet|ingresso|museum|museo|musée|музей|concert|konzert|концерт|castle|burg|schloss|castillo|замок|park|pass\b)/i;
        const bad = l => /(e-?ticket|ihr ticket|your ticket)$/i.test(l) || /(order|bestell|заказ|print@home|mobile ticket|\bqr\b|scan at|^(ваучер|voucher|e-?ticket|билет)\s+(на|for|für)\s|pass ?holder|inhaber|titular|intestatario|customer|\b\d{4,5} [A-ZÄÖÜ][a-z]|\d[.,]\d{2}\s*€|€\s*\d|getyourguide|tiqets|eventim|free entry|included:)/i.test(l);
        const caps = l => { const L = l.replace(/[^\p{L}]/gu, ''); return L.length > 4 && L === L.toUpperCase(); };
        const cand = lines.filter(l => !HDR.test(l) && reT.test(l) && l.length <= 70 && !bad(l));
        const strong = /(\bticket\b|eintritt|entrada|biglietto|billet|билет|экскурс)/i;
        let tl = cand.find(l => !caps(l) && strong.test(l)) || cand.find(l => !caps(l)) || cand[0];
        if (tl && /^(world tour|tour 20\d\d)|·\s*support/i.test(tl)) { const i = lines.indexOf(tl); if (i > 0 && lines[i - 1].length <= 70) tl = lines[i - 1]; }
        res.provider = earliest(TICKET_SITES, { 'Tiqets': 'ti[qg]ets', 'GetYourGuide': 'get\\s?your\\s?guide' });
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
