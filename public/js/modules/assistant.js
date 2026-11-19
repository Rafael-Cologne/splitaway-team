// ============================================================
// Модуль «KI Ассистент» (id: 'assistant')
// Помощник по приложению: пишете или говорите обычной фразой — он понимает,
// что и куда добавить, показывает карточку и добавляет только после «Добавить».
//   «обед 36 € на двоих»                      → Расходы
//   «завтра в 10:00 экскурсия по городу»      → Календарь
//   «внеси в маршрут замок Нойшванштайн завтра в 11:00» → Маршрут + Календарь
//   «добавь на карту музей Людвига»            → Гид (карта)
//   «не забыть зарядку и паспорт»              → Чек-лист
//   «запиши в дневник: отличный день»          → Дневник
// Без платного AI и без ключей: фразу разбирают правила (сумма, дата, время,
// ключевые слова, имена участников). Место на карте ищется в OpenStreetMap (Nominatim).
// Данные пишутся в те же хранилища, что используют модули (localStorage поездки),
// расходы — так же, как обычная форма (saveLocal + синхронизация).
// ============================================================
(function () {
  'use strict';
  if (!window.STHub) return;

  const ID = 'assistant';
  const IMG = '/img/assistant/';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = el => { if (typeof initializeIcons === 'function') initializeIcons(el); };
  const online = () => navigator.onLine !== false;
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const newId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };
  const cap = s => { s = String(s || '').trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; };
  const nowTime = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  // В JavaScript \\b не видит кириллицу как буквы — заменяем на «границу слова» с русскими буквами
  const WL = 'A-Za-zА-Яа-яЁё0-9_';
  const WB = '(?:(?<=[' + WL + '])(?![' + WL + '])|(?<![' + WL + '])(?=[' + WL + ']))';
  const fixRe = src => String(src).replace(/\\b/g, WB).replace(/\\w/g, '[' + WL + ']');
  const U = re => new RegExp(fixRe(re.source), re.flags);
  const RE = (src, fl) => new RegExp(fixRe(src), fl);

  // ---------- Разбор даты и времени ----------
  const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма[йя]', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
  const WD = [['воскрес'], ['понедельн'], ['вторник'], ['сред[ау]'], ['четверг'], ['пятниц'], ['суббот']];
  function parseDate(s) {
    const t = new Date(); t.setHours(12, 0, 0, 0);
    const add = n => { const d = new Date(t); d.setDate(d.getDate() + n); return d; };
    let m;
    if ((m = U(/(?:\b(?:на|в|к|до)\s+)?\bпослезавтра\b/i).exec(s))) return { date: iso(add(2)), m: m[0] };
    if ((m = U(/(?:\b(?:на|в|к|до)\s+)?\bзавтра\b/i).exec(s))) return { date: iso(add(1)), m: m[0] };
    if ((m = U(/(?:\b(?:на|в|до)\s+)?\bсегодня\b/i).exec(s))) return { date: iso(t), m: m[0] };
    if ((m = U(/\bвчера\b/i).exec(s))) return { date: iso(add(-1)), m: m[0] };
    const mre = RE('(?:\\b(?:на|в|к|до|с)\\s+)?\\b(\\d{1,2})\\s+(' + MONTHS.join('|') + ')[а-я]*\\b', 'i');
    if ((m = mre.exec(s))) {
      const mi = MONTHS.findIndex(x => new RegExp('^' + x, 'i').test(m[2]));
      let d = new Date(t.getFullYear(), mi, +m[1], 12);
      if (d < add(-60)) d = new Date(t.getFullYear() + 1, mi, +m[1], 12);
      return { date: iso(d), m: m[0] };
    }
    if ((m = U(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b(?!\s*(€|евро|eur|\$|руб|₽|£|chf|zł))/i).exec(s)) && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) {
      let y = m[3] ? +m[3] : t.getFullYear(); if (y < 100) y += 2000;
      return { date: iso(new Date(y, +m[2] - 1, +m[1], 12)), m: m[0] };
    }
    for (let i = 0; i < 7; i++) {
      const re = RE('\\b(?:в|во|на)?\\s*(?:следующ\\w+\\s+)?(' + WD[i][0] + ')[а-я]*\\b', 'i');
      if ((m = re.exec(s))) { let diff = (i - t.getDay() + 7) % 7; if (diff === 0) diff = 7; return { date: iso(add(diff)), m: m[0] }; }
    }
    return null;
  }
  function parseTime(s, loose) {
    let m;
    if (((m = U(/(?:\b(?:в|к|на|at|um)\s*)?\b(\d{1,2}):(\d{2})\b/i).exec(s)) || (m = U(/\b(?:в|к)\s*(\d{1,2})\.(\d{2})\b(?![./]\d)/i).exec(s))) && +m[1] < 24 && +m[2] < 60) return { time: pad(+m[1]) + ':' + m[2], m: m[0] };
    if ((m = U(/\bв\s*(\d{1,2})\s*(утра|дня|вечера|ночи|час\w*|ч\b\.?)/i).exec(s)) && +m[1] <= 23) {
      let h = +m[1]; if (/вечера|дня/i.test(m[2]) && h < 12) h += 12; if (/ночи/i.test(m[2]) && h === 12) h = 0;
      return { time: pad(h) + ':00', m: m[0] };
    }
    if ((m = U(/\bв\s*(полдень)\b/i).exec(s))) return { time: '12:00', m: m[0] };
    if (loose && (m = U(/\bв\s+(\d{1,2})\b(?!\s*(€|евро|eur|\$|руб|₽|£|chf|%|км|м\b))/i).exec(s)) && +m[1] >= 6 && +m[1] <= 23) return { time: pad(+m[1]) + ':00', m: m[0] };
    return null;
  }
  const human = d => {
    if (!d) return '';
    const t = new Date(); t.setHours(12, 0, 0, 0);
    const x = new Date(d + 'T12:00:00'), diff = Math.round((x - t) / 86400000);
    if (diff === 0) return 'Сегодня'; if (diff === 1) return 'Завтра'; if (diff === 2) return 'Послезавтра'; if (diff === -1) return 'Вчера';
    return x.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
  };

  // Период: «с 23.11-27.11», «23–27 ноября», «с 23 ноября по 2 декабря», «с 23.11 по 27.11»
  function parseRange(s) {
    const MN = '(' + MONTHS.join('|') + ')[а-я]*', SEP = '\\s*(?:по|до|-|–|—)\\s*';
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const mi = w => MONTHS.findIndex(x => new RegExp('^' + x, 'i').test(w));
    const mk = (d, m, y) => { let x = new Date(y || today.getFullYear(), m, d, 12); if (!y && x < new Date(today - 60 * 86400000)) x = new Date(today.getFullYear() + 1, m, d, 12); return x; };
    const yy = y => (y ? (+y < 100 ? 2000 + +y : +y) : 0);
    let m, a, b;
    if ((m = RE('(?:\\bс\\s+)?\\b(\\d{1,2})\\s+' + MN + SEP + '(\\d{1,2})\\s+' + MN, 'i').exec(s))) { a = mk(+m[1], mi(m[2])); b = mk(+m[3], mi(m[4])); }
    else if ((m = RE('(?:\\bс\\s+)?\\b(\\d{1,2})' + SEP + '(\\d{1,2})\\s+' + MN, 'i').exec(s))) { a = mk(+m[1], mi(m[3])); b = mk(+m[2], mi(m[3])); }
    else if ((m = RE('(?:\\bс\\s+)?\\b(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?' + SEP + '(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?', 'i').exec(s)) && +m[2] <= 12 && +m[5] <= 12) { a = mk(+m[1], +m[2] - 1, yy(m[3])); b = mk(+m[4], +m[5] - 1, yy(m[6]) || yy(m[3])); }
    if (!a || isNaN(a) || isNaN(b)) return null;
    if (b < a) b.setFullYear(b.getFullYear() + 1);
    return { start: iso(a), end: iso(b), m: m[0] };
  }
  const humanRange = (a, b) => {
    if (!b || a === b) return human(a);
    const x = new Date(a + 'T12:00:00'), y = new Date(b + 'T12:00:00');
    const dm = d => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    return x.getMonth() === y.getMonth() && x.getFullYear() === y.getFullYear() ? x.getDate() + '–' + dm(y) : dm(x) + ' – ' + dm(y);
  };
  const THESE = U(/\b(на\s+)?(эти|те\s+же|этих)\s+(даты|дни|числа)\b/i);

  // ---------- Деньги ----------
  const CUR = [['EUR', U(/€|евро\w*|\beur\b|\beuro\b/i)], ['USD', U(/\$|доллар\w*|\busd\b/i)], ['RUB', U(/₽|руб\w*|\brub\b/i)], ['GBP', U(/£|фунт\w*|\bgbp\b/i)], ['CHF', U(/\bchf\b|франк\w*/i)],
    ['PLN', U(/zł|злот\w*|\bpln\b/i)], ['CZK', U(/kč|\bczk\b|крон\w*/i)], ['TRY', U(/₺|лир\w*|\btry\b/i)], ['UAH', U(/₴|гривн\w*|\buah\b/i)], ['GEL', U(/₾|лари\b|\bgel\b/i)]];
  function parseMoney(s) {
    const num = '(\\d{1,3}(?:[ \\u00a0]\\d{3})+|\\d+)(?:[.,](\\d{1,2}))?';
    const val = m => +(m[1].replace(/[  ]/g, '') + (m[2] ? '.' + m[2] : ''));
    for (const [code, re] of CUR) {
      const r1 = new RegExp(num + '\\s*(' + re.source + ')', 'i'), r2 = new RegExp('(' + re.source + ')\\s*' + num, 'i');
      let m = r1.exec(s); if (m) return { amount: val(m), cur: code, m: m[0] };
      m = r2.exec(s); if (m) return { amount: +(m[2].replace(/[  ]/g, '') + (m[3] ? '.' + m[3] : '')), cur: code, m: m[0] };
    }
    const m = RE('(?:^|[^\\d:./])' + num + '(?![\\d:./]|\\s*(?:час|ч\\b|мин|утра|вечера|дня|человек|чел|км|м\\b|%|ноябр|декабр|январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр))', 'i').exec(s);
    return m ? { amount: val(m), cur: null, m: m[0].replace(/^[^\d]/, '') } : null;
  }
  const fmtMoney = (a, cur) => { try { return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: cur || 'EUR', maximumFractionDigits: 2 }).format(a); } catch (_) { return a + ' ' + (cur || ''); } };
  const EXP_CATS = [['Питание', 'utensils', U(/ресторан|кафе|бар\b|паб|пицц|бургер|суши|еда|ужин|обед|завтрак|кофе|перекус|пекарн|продукт|супермаркет|мороженое|food|restaurant|cafe|essen/i)],
    ['Жильё', 'bed-double', /отел|гостиниц|хостел|апартамент|жиль|airbnb|booking|hotel|hostel/i],
    ['Транспорт', 'car', /такси|uber|bolt|метро|автобус|трамва|поезд|электрич|самол|авиа|перел|бензин|топлив|парков|аренд|проезд|билет на (поезд|автобус)|taxi|train|bahn/i],
    ['Развлечения', 'ticket', /музе|экскурс|билет|кино|театр|концерт|выстав|зоопарк|аттракцион|museum|tour/i],
    ['Покупки', 'shopping-bag', /магазин|покупк|сувенир|одежд|аптек|подар|shop|souvenir/i]];
  const expCat = name => EXP_CATS.find(c => c[2].test(name)) || ['Другое', 'circle-ellipsis'];

  // ---------- Участники ----------
  const NUMW = { одного: 1, одну: 1, двоих: 2, двух: 2, двое: 2, троих: 3, трое: 3, трёх: 3, трех: 3, четверых: 4, четверо: 4, четырёх: 4, четырех: 4, пятерых: 5, пятеро: 5, шестерых: 6, шестеро: 6 };
  const stemOf = n => { const s = String(n).toLowerCase(); return s.length <= 4 ? s.slice(0, Math.max(3, s.length - 1)) : s.slice(0, s.length - 2); };
  function findNames(s, members) {
    const low = s.toLowerCase(), out = [];
    members.forEach(m => { const st = stemOf(m.name); if (st.length >= 2 && new RegExp('(^|[^а-яёa-z])' + st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(low)) out.push(m.name); });
    return out;
  }

  // ---------- Что пользователь хочет ----------
  const RX = {
    expense: U(/расход|потрат|заплат|оплат|купил|стоил|стоимост|чек\b|счёт\b|счет\b|за обед|за ужин|за такси/i),
    route: U(/маршрут|остановк|поехать в|поедем в|едем в|→|->|—>|\bиз\s+\S+\s+в\s+/i),
    map: U(/на карт|отметь|отметить|сохрани место|запомни место|добавь место|интересн\w+ мест/i),
    calendar: /календар|событи|встреч|напомни|экскурси|бронь|брониров|запис[ьа]|визит|концерт|рейс|вылет|заселени|выезд/i,
    checklist: /чек-?лист|не забыть|не забудь|взять с собой|список вещей|в список|собрать|положи в чемодан/i,
    diary: /дневник|запиши впечатлени|мои впечатлени/i,
    trip: U(/\b(созда\w*|сдела\w*|заведи|завести|начни|начать|открой|добав\w*|нов\w*)\s+(нов\w*\s+)?поездк|^\s*(нов\w+\s+)?поездк\w*\s+(в|во|на)\s/i),
    tripdates: U(/\bдаты\s+(этой\s+|нашей\s+|моей\s+)?поездк|\bпоездк\w*\s+(будет\s+)?с\s+\d|\b(мы\s+)?(едем|летим|будем)\s+с\s+\d/i)
  };
  const KIND = {
    expense: { t: 'Расходы', ic: 'receipt-text' }, calendar: { t: 'Календарь', ic: 'calendar-days' }, route: { t: 'Маршрут', ic: 'route' },
    map: { t: 'Карта (Гид)', ic: 'map' }, checklist: { t: 'Чек-лист', ic: 'list-checks' }, diary: { t: 'Дневник', ic: 'book-open' },
    trip: { t: 'Новая поездка', ic: 'plane-takeoff' }, tripdates: { t: 'Даты поездки', ic: 'calendar-range' }
  };
  function detectKind(s, mode) {
    const low = s.toLowerCase();
    if (RX.trip.test(low)) return 'trip';
    if (RX.diary.test(low)) return 'diary';
    if (RX.checklist.test(low)) return 'checklist';
    if (RX.tripdates.test(low)) return 'tripdates';
    if (RX.map.test(low)) return 'map';
    if (RX.route.test(low)) return 'route';
    const money = parseMoney(low);
    if (parseRange(low) && !(money && money.cur)) return 'calendar'; // период — событие на несколько дней (отпуск, отель …)
    if (RX.expense.test(low) || (money && money.cur)) return 'expense';
    if (RX.calendar.test(low) || parseTime(low, false)) return 'calendar';
    if (mode) return mode;
    if (money && !parseTime(low, false)) return 'expense';
    return null;
  }
  // Убрать служебные слова, оставить суть
  const COMMAND = U(/^(пожалуйста\s+)?(добав(ь|ьте|ить)|внеси(те)?|внести|запиши(те)?|записать|создай(те)?|создать|сделай|поставь|отметь|сохрани|запомни|занеси|впиши|нужно|надо|хочу)\b/i);
  function clean(s, extra) {
    let r = ' ' + s + ' ';
    (extra || []).filter(Boolean).forEach(x => { r = r.replace(x, ' '); });
    r = r.replace(U(/\b(в|во|для)\s+поездк\w*(\s+(в|во|на|по)\s+[^\s,.;:]+)?/ig), ' ')
      .replace(U(/\b(в|на|во)\s+(маршрут\w*|календар\w*|карт[уеы]|дневник\w*|чек-?лист\w*|список\w*|расход\w*|план\w*)\b/ig), ' ')
      .replace(U(/\b(расход|событие|напоминание|место|точку|пункт)\b\s*:?/ig), ' ')
      .replace(/\s+/g, ' ').trim();
    for (let i = 0; i < 3; i++) r = r.replace(COMMAND, '').replace(/^[\s:,.\-—]+/, '').trim();
    return r.replace(/[\s,.;:—-]+$/, '').replace(/^[\s,.;:—-]+/, '').trim();
  }

  // ---------- Разбор фразы в черновик ----------
  function parse(text, kind, ctx) {
    const members = ctx.members || [];
    const d = parseDate(text), tm = parseTime(text, kind === 'calendar' || kind === 'route');
    if (kind === 'expense') {
      const money = parseMoney(text);
      let parts = null, cnt = null, m;
      if (U(/\b(на|за)\s+всех\b|\bвсем\b/i).test(text)) parts = members.map(x => x.name);
      if ((m = U(/\b(?:на|за)\s+(одного|одну|двоих|двух|троих|трёх|трех|четверых|четырёх|четырех|пятерых|шестерых)\b/i).exec(text))) cnt = NUMW[m[1].toLowerCase()];
      if ((m = U(/\b(?:на|за)\s+(\d{1,2})\s*(?:чел\w*|человек|персон\w*)\b/i).exec(text))) cnt = +m[1];
      let payer = ctx.me || (members[0] && members[0].name) || '';
      const payM = /([А-ЯЁA-Z][а-яёa-z]+)\s+(?:за)?платил[аи]?|(?:за)?платил[аи]?\s+([А-ЯЁA-Z][а-яёa-z]+)/.exec(text);
      if (payM) { const nm = findNames(payM[1] || payM[2], members)[0]; if (nm) payer = nm; }
      const named = findNames(text.replace(payM ? payM[0] : '', ' '), members).filter(n => n !== payer);
      if (!parts) {
        if (named.length) parts = [...new Set([payer, ...named])];
        else if (cnt && cnt < members.length) { parts = [payer]; members.forEach(x => { if (parts.length < cnt && !parts.includes(x.name)) parts.push(x.name); }); }
        else parts = members.map(x => x.name);
      }
      let name = clean(text, [money && money.m, payM && payM[0], U(/\b(на|за)\s+(всех|одного|одну|двоих|двух|троих|трёх|трех|четверых|четырёх|четырех|пятерых|шестерых)\b/ig), U(/\b(на|за)\s+\d{1,2}\s*(чел\w*|человек|персон\w*)/ig),
        d && d.m, U(/\b(я\s+)?(потратил[аи]?|заплатил[аи]?|оплатил[аи]?|купил[аи]?|стоил[аи]?)\b/ig), U(/\b(на|за)\s*$/i)]);
      named.forEach(n => { const st = stemOf(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); name = name.replace(RE('\\b' + st + '[А-Яа-яЁё]*\\b', 'ig'), ' '); });
      name = name.replace(U(/\b(я|мы|мне|нам|со\s+мной)\b/ig), ' ').replace(/\s+/g, ' ').replace(U(/^[\s,]*(и\s+)+/i), '').replace(U(/(^|\s)и\s*(,|$)/ig), '$2').replace(/^[\s,.;:—-]+|[\s,.;:—-]+$/g, '').trim();
      name = name.replace(/^(на|за)\s+/i, '').replace(/\s+(на|за)$/i, '');
      return { kind, name: cap(name) || 'Расход', amount: money ? money.amount : null, cur: money && money.cur, date: d ? d.date : iso(new Date()), payer, parts, cnt: cnt || parts.length };
    }
    if (kind === 'trip' || kind === 'tripdates') {
      const rg = parseRange(text);
      const t = tripFacts(text, ctx);
      return Object.assign({ kind, start: rg ? rg.start : (d ? d.date : ''), end: rg ? rg.end : (d ? d.date : ''), useMem: THESE.test(text) && !rg }, t);
    }
    if (kind === 'calendar') {
      const rg = parseRange(text);
      if (rg) {
        const title = cap(clean(text, [rg.m, tm && tm.m, U(/\b(даты|дни|числа)\b/ig), U(/\b(что|чтобы|когда)\s+(у\s+(меня|нас)|я|мы)(\s+будет|\s+будут)?\b/ig), U(/\bу\s+(меня|нас)\b/ig), U(/\b(с|по)\s*$/i)]));
        return { kind, title: title || 'Событие', date: rg.start, endDate: rg.end, time: tm ? tm.time : '', type: /отел|гостиниц|жиль|апартамент/i.test(text) ? 'stay' : 'other', dateGuessed: false };
      }
      const title = cap(clean(text, [d && d.m, tm && tm.m, U(/\b(в|на)\s*$/i)]));
      const low = text.toLowerCase();
      const type = /рейс|вылет|перел|самол|flight/.test(low) ? 'flight' : /отел|заселен|выезд|гостиниц|жиль/.test(low) ? 'stay' : U(/ужин|обед|завтрак|ресторан|кафе|бар\b/).test(low) ? 'food'
        : /такси|поезд|автобус|трансфер|аренд|машин/.test(low) ? 'transport' : 'other';
      return { kind, title: title || 'Событие', date: d ? d.date : iso(new Date()), time: tm ? tm.time : '', type, dateGuessed: !d };
    }
    if (kind === 'route' || kind === 'map') {
      let body = clean(text, [d && d.m, tm && tm.m, U(/\b(поехать|поедем|едем|еду|поеду|съездить|заехать)\s+(в|во|на)\b/ig)]);
      const places = body.split(/\s*(?:→|->|—>|=>|\s—\s|\s-\s)\s*/).map(x => x.trim()).filter(Boolean);
      let m;
      if (places.length === 1 && (m = /^из\s+(.+?)\s+в\s+(.+)$/i.exec(body))) places.splice(0, 1, m[1], m[2]);
      return { kind, places: places.slice(0, 6).map(p => ({ q: cap(p.replace(/^(в|во|на)\s+/i, '')) })), date: d ? d.date : '', time: tm ? tm.time : '' };
    }
    if (kind === 'checklist') {
      const body = clean(text, [U(/\b(не\s+забыть|не\s+забудь(те)?|взять\s+с\s+собой|положи\s+в\s+чемодан|собрать)\b/ig)]);
      const items = body.split(/\s*(?:,|;|\sи\s|\n)\s*/).map(x => cap(x.trim())).filter(x => x && x.length < 80);
      return { kind, items: items.length ? items : [cap(body)], section: null };
    }
    if (kind === 'diary') {
      const body = clean(text, [d && d.m, U(/\bзапиши\s+впечатлени\w*/i), U(/\b(мои\s+)?впечатлени\w*\b:?/i)]);
      return { kind, text: cap(body), date: d ? d.date : iso(new Date()) };
    }
    return null;
  }

  // ---------- Поиск места (OpenStreetMap) ----------
  async function geocode(q, trip) {
    const tries = [];
    const city = trip && (trip.dest || '').split(/[,;→]/)[0].trim();
    if (city && !q.toLowerCase().includes(city.toLowerCase())) tries.push(q + ', ' + city);
    tries.push(q);
    for (const t of tries) {
      try {
        const ctl = new AbortController(); setTimeout(() => ctl.abort(), 9000);
        const j = await (await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=ru&q=' + encodeURIComponent(t), { signal: ctl.signal })).json();
        if (j && j[0]) {
          const a = j[0].address || {};
          return { name: j[0].name || q, lat: +j[0].lat, lon: +j[0].lon, addr: [a.road && (a.road + (a.house_number ? ' ' + a.house_number : '')), a.city || a.town || a.village].filter(Boolean).join(', ') || String(j[0].display_name || '').split(',').slice(0, 2).join(','),
            city: a.city || a.town || a.village || '', cat: /museum|gallery/.test(j[0].type) ? 'museum' : /park|garden|zoo/.test(j[0].type) ? 'park' : /restaurant|cafe|bar|pub/.test(j[0].type) ? 'food' : 'sights', osm: j[0].osm_type + j[0].osm_id };
        }
      } catch (_) {}
    }
    return null;
  }

  // ---------- Запись в модули ----------
  const store = (trip, mod, key) => 'st_mod_' + mod + '_' + trip.id + '_' + key;
  function addExpense(dr) {
    /* global S, saveLocal, renderAll, rememberLocalExpenseAction, notifyExpenseCreated, sbUpsertExpense, sbSync, USE_SUPABASE, buildUnitSplits */
    if (typeof S === 'undefined' || !S.trip || typeof saveLocal !== 'function') throw new Error('notrip');
    const amt = Math.round(dr.amount * 100) / 100;
    const parts = dr.parts.filter(n => S.members.some(m => m.name === n));
    if (!parts.length || !(amt > 0)) throw new Error('bad');
    let splits = null; try { if (typeof buildUnitSplits === 'function') splits = buildUnitSplits(amt, parts, {}); } catch (_) {}
    const exp = { id: newId(), name: dr.name, amount: amt, comment: '', date: dr.date, paidBy: dr.payer || S.me, participants: parts, fromTreasury: false, items: [], createdBy: S.me || null, ...(splits ? { splits } : {}) };
    S.expenses.push(exp);
    saveLocal();
    try { renderAll(); } catch (_) {}
    try { rememberLocalExpenseAction(exp.id); } catch (_) {}
    try { notifyExpenseCreated(exp); } catch (_) {}
    if (typeof USE_SUPABASE !== 'undefined' && USE_SUPABASE) { try { sbUpsertExpense(exp); } catch (_) {} setTimeout(() => { try { sbSync(); } catch (_) {} }, 3000); }
    return exp;
  }
  function addEvent(trip, ev) {
    const k = store(trip, 'calendar', 'events'), list = lsGet(k, []);
    list.push({ id: newId(), title: ev.title, date: ev.date, time: ev.time || '', type: ev.type || 'other', endDate: ev.endDate && ev.endDate !== ev.date ? ev.endDate : '', endTime: '', place: ev.place || '', note: 'Добавлено ассистентом', remind: false, doc: '' });
    if (!lsSet(k, list)) throw new Error('storage');
  }
  function addPlaces(trip, places, toRoute) {
    const k = store(trip, 'guide', 'saved'), list = lsGet(k, []);
    const ok = k2 => lsSet(k2[0], k2[1]);
    const ids = [];
    places.forEach(p => {
      const id = 'ai_' + (p.osm || newId());
      if (!list.some(x => x.id === id)) list.push({ id, name: p.name, city: p.city || '', cat: p.cat || 'sights', typeLabel: 'Добавлено ассистентом', addr: p.addr || '', hours: '', website: '', cuisine: '', free: false, lat: p.lat, lon: p.lon, thumb: '', wikiExtract: '', visited: false });
      ids.push(id);
    });
    if (!ok([k, list])) throw new Error('storage');
    if (toRoute) {
      const ko = store(trip, 'route', 'orderIds'), order = lsGet(ko, []);
      const all = order.length ? order.slice() : list.filter(x => !ids.includes(x.id)).map(x => x.id);
      ids.forEach(id => { if (!all.includes(id)) all.push(id); });
      lsSet(ko, all);
    }
  }
  function checklistSections(trip) { return lsGet(store(trip, 'checklist', 'sections'), null); }
  function addChecklist(trip, items, sectionId) {
    const k = store(trip, 'checklist', 'sections');
    let sections = lsGet(k, null);
    if (!sections) sections = [];
    let sec = sections.find(s => s.id === sectionId) || sections.find(s => /друг|разн/i.test(s.name));
    if (!sec) { sec = { id: newId(), name: 'Разное', icon: 'package', items: [] }; sections.push(sec); }
    items.forEach(t => sec.items.push({ id: newId(), text: t, done: false }));
    if (!lsSet(k, sections)) throw new Error('storage');
    return sec.name;
  }
  function addDiary(trip, dr, me) {
    const k = store(trip, 'diary', 'entries'), list = lsGet(k, []);
    let e = list.find(x => x.date === dr.date);
    if (e) { e.text = (e.text ? e.text.replace(/\s*$/, '\n') : '') + dr.text; e.updatedAt = Date.now(); }
    else list.push({ id: newId(), date: dr.date, title: '', text: dr.text, photos: [], audio: [], place: null, expenses: [], rating: 0, mood: '', author: me || '', createdAt: Date.now(), updatedAt: Date.now() });
    list.sort((a, b) => a.date.localeCompare(b.date));
    if (!lsSet(k, list)) throw new Error('storage');
  }

  // ---------- Новая поездка: место, участники, валюта ----------
  const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  const lat = w => String(w || '').toLowerCase().split('').map(ch => TR[ch] ?? ch).join('').replace(/[^a-z]/g, '');
  const sameName = (a, b) => { const x = lat(a), y = lat(b); return !!x && (x === y || (x.length >= 3 && y.startsWith(x)) || (y.length >= 3 && x.startsWith(y))); };
  const femGuess = n => (/[ая]$/i.test(n) && !/^(саша|женя|валя|никита|илья|миша|паша|дима|костя|лёша|леша|ваня|вова|гоша|кузьма|фома|лука)$/i.test(n)) ? 'f' : 'm';
  const MONTH_WORD = new RegExp('^(' + MONTHS.join('|') + ')', 'i');
  const STOP_WORDS = /^(эти|те|даты|числа|дни|поездк|меня|себя|нас|всех|человек|двоих|троих)/i;
  // «в Турцию» → «Турция», «в Прагу» → «Прага» (винительный падеж → именительный)
  const NO_CASE = /^(баку|перу|порту|малибу|катманду|тимбукту|сочи|бали|дели|монако|сан-марино|тбилиси|хельсинки|осло|токио|киото|майами|чикаго|торонто|онтарио|милан|рим|кипр|египет|кёльн|кельн|берлин|париж|лондон|мадрид|лиссабон|амстердам|стамбул|дубай|нью-йорк)$/i;
  const nomCase = w => w.split(' ').map((x, i, arr) => i !== arr.length - 1 || NO_CASE.test(x) ? x : x.replace(/ию$/i, 'ия').replace(/ую$/i, 'ая').replace(/([^аеёиоуыэюя])у$/i, '$1а').replace(/([^аеёиоуыэюя])ю$/i, '$1я')).join(' ');
  function destOf(text) { const d = destRaw(text); return d ? nomCase(d) : d; }
  function destRaw(text) {
    let m;
    const re = RE('(?:^|[\\s,(])(?:в|во|на)\\s+([А-ЯЁA-Z][А-Яа-яЁёA-Za-z\\-]+(?:[ -][А-ЯЁA-Z][А-Яа-яЁёA-Za-z\\-]+)*)', 'g');
    while ((m = re.exec(text))) { const w = m[1].trim(); if (!MONTH_WORD.test(w) && !STOP_WORDS.test(w)) return w; }
    if ((m = U(/поездк\w*\s+(?:в|во|на|по)\s+([а-яёa-z\-]+(?:\s+[а-яёa-z\-]+)?)/i).exec(text)) && !MONTH_WORD.test(m[1]) && !STOP_WORDS.test(m[1])) return cap(m[1].split(/\s+(?:с|со|на|по|до|и)$/)[0]);
    return '';
  }
  // имена: «2 человека Раф и Аня», «с Аней и Сашей», «участники: Саша, Олег»
  function namesOf(text) {
    const out = []; let m;
    const blocks = [];
    if ((m = U(/\b(?:\d+|двое|трое|четверо|пятеро)\s*(?:человек\w*|чел\.?|взросл\w*|участник\w*)?\s*[:\-]?\s*((?:[А-ЯЁA-Z][а-яёa-z]+)(?:\s*(?:,|и)\s*[А-ЯЁA-Z][а-яёa-z]+)*)/).exec(text))) blocks.push(m[1]);
    if ((m = U(/\b(?:участник\w*|едут|едем|летим|летят|поедут)\s*[:\-]?\s*((?:[А-ЯЁA-Z][а-яёa-z]+)(?:\s*(?:,|и)\s*[А-ЯЁA-Z][а-яёa-z]+)*)/).exec(text))) blocks.push(m[1]);
    if ((m = U(/\b(?:с|со|вместе\s+с)\s+((?:[А-ЯЁA-Z][а-яёa-z]+)(?:\s*(?:,|и)\s*[А-ЯЁA-Z][а-яёa-z]+)*)/).exec(text)) && !MONTH_WORD.test(m[1])) blocks.push(m[1]);
    blocks.forEach(b => b.split(/\s*(?:,|\sи\s)\s*/).forEach(n => { n = n.trim(); if (n && !out.some(x => sameName(x, n))) out.push(n); }));
    // творительный падеж «с Аней, Сашей» → «Аня, Саша» (по возможности)
    return out.map(n => n.length < 5 ? n : n.replace(/([жшчщ])ей$/i, '$1а').replace(/ей$/i, 'я').replace(/ой$/i, 'а').replace(/ем$/i, 'ь').replace(/ом$/i, '')).filter(n => n.length >= 2 && !MONTH_WORD.test(n));
  }
  const CC_CUR = { EG: 'EGP', TR: 'TRY', US: 'USD', GB: 'GBP', CH: 'CHF', LI: 'CHF', CZ: 'CZK', PL: 'PLN', HU: 'HUF', SE: 'SEK', NO: 'NOK', DK: 'DKK', RO: 'RON', BG: 'BGN', RS: 'RSD', UA: 'UAH', RU: 'RUB',
    TH: 'THB', JP: 'JPY', CN: 'CNY', KR: 'KRW', AU: 'AUD', NZ: 'NZD', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR',
    JO: 'JOD', IL: 'ILS', ID: 'IDR', IN: 'INR', PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR', MY: 'MYR', SG: 'SGD', PH: 'PHP', VN: 'VND', HK: 'HKD', TW: 'TWD', ZA: 'ZAR', MA: 'MAD', TN: 'TND',
    GE: 'GEL', AM: 'AMD', AZ: 'AZN', KZ: 'KZT', UZ: 'UZS', ME: 'EUR', XK: 'EUR' };
  const EURO = 'AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK AD MC SM VA'.split(' ');
  const curOfCC = cc => (cc = String(cc || '').toUpperCase(), EURO.includes(cc) ? 'EUR' : CC_CUR[cc] || null);
  // без интернета — по названию страны или города
  const PLACE_CC = [[/египет|каир|хургад|шарм|египт/i, 'EG'], [/турци|стамбул|анталь|аланья|кемер|бодрум|измир/i, 'TR'], [/сша|америк|нью-йорк|майами|лос-андж|лас-вег/i, 'US'], [/англи|британ|лондон|шотланд|эдинбург/i, 'GB'],
    [/швейцар|цюрих|женев/i, 'CH'], [/чехи|праг/i, 'CZ'], [/польш|варшав|краков/i, 'PL'], [/венгр|будапешт/i, 'HU'], [/таиланд|тайланд|пхукет|бангкок|паттай/i, 'TH'], [/япони|токио|киото|осак/i, 'JP'],
    [/кита|пекин|шанха/i, 'CN'], [/оаэ|эмират|дуба|абу-даби/i, 'AE'], [/груз|тбилис|батуми/i, 'GE'], [/армени|ереван/i, 'AM'], [/марокк|марракеш/i, 'MA'], [/тунис/i, 'TN'], [/вьетнам|нячанг|ханой/i, 'VN'],
    [/индонез|бали/i, 'ID'], [/инди|гоа|дели/i, 'IN'], [/израил|тель-авив|иерусалим/i, 'IL'], [/норвег|осло/i, 'NO'], [/швеци|стокгольм/i, 'SE'], [/дани|копенгаген/i, 'DK'], [/румын/i, 'RO'], [/болгар|варн|софи/i, 'BG'],
    [/сербия|белград/i, 'RS'], [/украин|киев|одесс|львов/i, 'UA'], [/казахст|алмат|астан/i, 'KZ'], [/узбек|ташкент|самарканд/i, 'UZ'], [/азербайдж|баку/i, 'AZ'], [/канад|торонто|ванкувер/i, 'CA'], [/мексик|канкун/i, 'MX'],
    [/бразил|рио/i, 'BR'], [/австрали|сидне|мельбурн/i, 'AU'], [/сингапур/i, 'SG'], [/малайз|куала/i, 'MY'], [/шри-ланк/i, 'LK'], [/мальдив/i, 'MV'],
    [/германи|берлин|мюнхен|кёльн|кельн|гамбург|франкфурт|австри|вен[аы]\b|франци|париж|ницц|испани|мадрид|барселон|итали|рим\b|милан|венеци|флоренц|португал|лиссабон|порту\b|нидерланд|голланд|амстердам|бельги|брюссел|греци|афин|крит|кипр|хорвати|сплит|дубровн|черногор|будв|финлянд|хельсинк|ирланд|дублин|эстони|таллин|латви|рига|литв|вильнюс|словени|словаки|мальт/i, 'EU']];
  const ccOfText = t => { const x = PLACE_CC.find(p => p[0].test(t)); return x ? x[1] : null; };
  const CUR_WORDS = [[/евро/i, 'EUR'], [/доллар|бакс/i, 'USD'], [/египетск\w*\s+фунт|фунт\w*\s+египет/i, 'EGP'], [/фунт|стерлинг/i, 'GBP'], [/франк/i, 'CHF'], [/злот/i, 'PLN'], [/форинт/i, 'HUF'],
    [/чешск\w*\s+крон|крон\w*\s+чеш/i, 'CZK'], [/лир/i, 'TRY'], [/гривн/i, 'UAH'], [/рубл/i, 'RUB'], [/\bбат\w*/i, 'THB'], [/[ий]ен/i, 'JPY'], [/юан/i, 'CNY'], [/дирхам/i, 'AED'], [/лари\b/i, 'GEL'],
    [/драм/i, 'AMD'], [/тенге/i, 'KZT'], [/шекел/i, 'ILS'], [/рупи/i, 'INR'], [/донг/i, 'VND'], [/лев\b|лева\b/i, 'BGN'], [/лей\b|леи\b/i, 'RON']];
  const curList = () => (typeof CURRENCIES !== 'undefined' && Array.isArray(CURRENCIES) ? CURRENCIES : [{ code: 'EUR' }, { code: 'USD' }]); /* global CURRENCIES */
  const curOk = c => !!c && curList().some(x => x.code === c);
  function curOfText(t) {
    const w = CUR_WORDS.find(x => U(x[0]).test(t)); if (w) return w[1];
    const m = /\b([A-Z]{3})\b/.exec(String(t).toUpperCase()); return m && curOk(m[1]) ? m[1] : null;
  }
  const curName = c => { try { return new Intl.DisplayNames(['ru'], { type: 'currency' }).of(c); } catch (_) { return c; } };
  function tripFacts(text, ctx) {
    const dest = destOf(text);
    const only = U(/\bтолько\s+(меня|я|мне|себя)\b|\bодин\b|\bодна\b/i).test(text);
    const me = ctx.me || lsGet('st_ai_myname', '') || '';
    let names = only ? [] : namesOf(text);
    let organizer = me;
    if (!organizer && names.length) organizer = names.shift();
    names = names.filter(n => !sameName(n, organizer));
    const cm = U(/\b(\d{1,2}|двое|трое|четверо|пятеро)\s*(?:человек\w*|чел\.?|участник\w*)/i).exec(text);
    const count = cm ? ({ двое: 2, трое: 3, четверо: 4, пятеро: 5 }[cm[1].toLowerCase()] || +cm[1]) : null;
    const cur = curOfText(text);
    return { dest: cap(dest), name: cap(dest) || 'Новая поездка', me: organizer, others: names, count, only, cur, cur2: null, curAuto: !cur };
  }
  // валюта по стране места (Nominatim → код страны); без сети — по названию
  async function suggestCurrency(dr, home) {
    if (!dr.curAuto) return;
    let cc = null;
    if (dr.dest && online()) {
      try {
        const ctl = new AbortController(); setTimeout(() => ctl.abort(), 8000);
        const j = await (await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&accept-language=ru&q=' + encodeURIComponent(dr.dest), { signal: ctl.signal })).json();
        cc = j && j[0] && j[0].address && j[0].address.country_code;
        if (cc) dr.country = (j[0].address.country || '');
      } catch (_) {}
    }
    const local = cc ? curOfCC(cc) : (ccOfText(dr.dest) === 'EU' ? 'EUR' : curOfCC(ccOfText(dr.dest)));
    dr.cur = curOk(local) ? local : (home || 'EUR');
    dr.cur2 = dr.cur !== (home || 'EUR') && curOk(home || 'EUR') ? (home || 'EUR') : null;
  }
  // правки к черновику поездки обычными словами; вернёт описание изменений или ''
  function applyTripFix(dr, text, ctx) {
    const done = [], low = text.toLowerCase();
    let m;
    const rg = parseRange(text);
    if (rg) { dr.start = rg.start; dr.end = rg.end; done.push('даты — ' + humanRange(rg.start, rg.end)); }
    if ((m = U(/\b(доп\w*|втор\w*)\s+валют\w*\s*[:\-—]?\s*(.*)$/i).exec(text))) {
      if (U(/\b(нет|без|не\s+нужн|убер|удал)/i).test(m[2] + ' ' + low)) { dr.cur2 = null; done.push('без дополнительной валюты'); }
      else { const c = curOfText(m[2]); if (c) { dr.cur2 = c === dr.cur ? null : c; done.push('доп. валюта — ' + c); } }
    } else if (U(/\bбез\s+доп\w*/i).test(low)) { dr.cur2 = null; done.push('без дополнительной валюты'); }
    else if ((m = U(/\b(?:основн\w*\s+)?валют\w*\s*[:\-—]?\s*(.*)$/i).exec(text)) || (!rg && curOfText(text) && text.trim().split(/\s+/).length <= 3)) {
      const c = curOfText(m ? m[1] : text); if (c) { if (dr.cur2 === c) dr.cur2 = null; dr.cur = c; dr.curAuto = false; done.push('валюта — ' + c); }
    }
    if ((m = U(/\bназвани\w*\s*[:\-—]?\s*(?:поездки\s*)?[«"]?([^»"]+)[»"]?$/i).exec(text))) { dr.name = cap(m[1].trim()); done.push('название — ' + dr.name); }
    if ((m = U(/\b(?:направлени\w*|город|страна|место)\s*[:\-—]?\s*(.+)$/i).exec(text))) { const dest = cap(m[1].replace(/^(в|во|на)\s+/i, '').trim()); if (dr.name === dr.dest || dr.name === 'Новая поездка') dr.name = dest; dr.dest = dest; dr.curAuto = true; done.push('направление — ' + dest); }
    else if (!done.length && (m = U(/^(?:не\s+\S+[,]?\s+а\s+|лучше\s+|давай\s+)?(?:в|во|на)\s+([А-ЯЁA-Z][^,.;]*)$/).exec(text.trim()))) { const dest = cap(m[1].trim()); if (dr.name === dr.dest || dr.name === 'Новая поездка') dr.name = dest; dr.dest = dest; dr.curAuto = true; done.push('направление — ' + dest); }
    if ((m = U(/\b(?:добав\w*|ещё|еще|плюс)\s+(?:участник\w*\s*)?([А-ЯЁA-Z][а-яёa-z]+(?:\s*(?:,|и)\s*[А-ЯЁA-Z][а-яёa-z]+)*)/).exec(text))) {
      m[1].split(/\s*(?:,|\sи\s)\s*/).map(n => n.replace(/(у|ю)$/i, x => x.toLowerCase() === 'у' ? 'а' : 'я')).forEach(n => { if (!sameName(n, dr.me) && !dr.others.some(x => sameName(x, n))) dr.others.push(n); });
      dr.only = false; done.push('участники — ' + [dr.me].concat(dr.others).filter(Boolean).join(', '));
    }
    if ((m = U(/\b(?:убер\w*|удали\w*|без|минус)\s+(?!доп)([А-ЯЁA-Z][а-яёa-z]+)/).exec(text))) {
      const before = dr.others.length; dr.others = dr.others.filter(x => !sameName(x, m[1]) && !sameName(x, m[1].replace(/(у|ю)$/i, x2 => x2.toLowerCase() === 'у' ? 'а' : 'я')));
      if (dr.others.length !== before) done.push('участники — ' + [dr.me].concat(dr.others).filter(Boolean).join(', '));
    }
    if ((m = U(/\b(?:я|меня\s+зовут|моё\s+имя|мое\s+имя|организатор)\s*[:\-—]?\s*([А-ЯЁA-Z][а-яёa-z]+)\s*$/).exec(text.trim()))) { dr.me = m[1]; lsSet('st_ai_myname', m[1]); done.push('организатор — ' + m[1]); }
    if (U(/\bтолько\s+(меня|я|себя)\b/i).test(text)) { dr.others = []; dr.only = true; done.push('только вы'); }
    return done.join(', ');
  }
  function setTripDates(trip, a, b) { if (!lsSet(store(trip, 'calendar', 'dates'), { start: a, end: b || a })) throw new Error('storage'); }
  // Новая поездка создаётся обычной формой приложения (код, база, приглашения) — помощник её заполняет,
  // а даты запишет в календарь новой поездки, как только она появится.
  function openCreateTrip(dr) {
    /* global ctAddMember */
    const prev = (typeof S !== 'undefined' && S && S.trip) ? S.trip.id : null;
    lsSet('st_ai_pending_trip', { name: dr.name, start: dr.start || '', end: dr.end || '', prev, t: Date.now() });
    const b = document.createElement('button'); b.type = 'button'; b.dataset.hub = 'create'; b.style.display = 'none';
    document.body.appendChild(b); b.click(); b.remove();
    setTimeout(() => {
      const set = (id, v) => { const el = document.getElementById(id); if (el && v != null && (id !== 'ct-admin' || !el.value)) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
      set('ct-name', dr.name); set('ct-dest', dr.dest || ''); if (dr.me) set('ct-admin', dr.me);
      const n = document.getElementById('ct-name'); if (n && n.scrollIntoView) n.scrollIntoView({ block: 'center' });
    }, 300);
  }
  // Создать поездку сам: заполняет форму приложения и вызывает её же createTrip() (код, база, приглашения — как вручную)
  async function createTripNow(dr) {
    /* global createTrip, renderFirstRunPreferences, CT */
    if (typeof createTrip !== 'function') throw new Error('noform');
    if (typeof renderFirstRunPreferences === 'function') { try { renderFirstRunPreferences(); } catch (_) {} }
    const set = (id, v) => { const el = document.getElementById(id); if (!el) throw new Error('noform'); el.value = v; };
    set('ct-name', dr.name); set('ct-dest', dr.dest || ''); set('ct-admin', dr.me); set('ct-admin-g', femGuess(dr.me));
    set('ct-currency', dr.cur); set('ct-secondary-currency', dr.cur2 || ''); set('ct-cash', ''); set('ct-m-name', '');
    if (document.getElementById('ct-currency').value !== dr.cur) throw new Error('currency');
    try { CT = { members: dr.others.map(n => ({ name: n, gender: femGuess(n) })) }; } catch (_) {} // eslint-disable-line no-global-assign
    lsSet('st_ai_myname', dr.me);
    const prev = (typeof S !== 'undefined' && S && S.trip) ? S.trip.id : null;
    lsSet('st_ai_pending_trip', { name: dr.name, start: dr.start || '', end: dr.end || '', prev, t: Date.now() });
    /* global USE_SUPABASE */
    const cloud = typeof USE_SUPABASE !== 'undefined' && USE_SUPABASE;
    if (cloud && !online()) throw new Error('offline');
    await createTrip();
    const changed = typeof S !== 'undefined' && S && S.trip && S.trip.id && S.trip.id !== prev;
    const ok = changed && (!cloud || !!S.inviteToken);
    if (!ok) {
      try { localStorage.removeItem('st_ai_pending_trip'); } catch (_) {}
      if (changed) { // форма уже подменила поездку в памяти, а сервер не ответил — возвращаемся к прежней
        try { if (prev) localStorage.setItem('sw_last', prev); } catch (_) {}
        setTimeout(() => location.reload(), 1800);
      }
      throw new Error('create');
    }
    if (dr.start) lsSet('st_mod_calendar_' + S.trip.id + '_dates', { start: dr.start, end: dr.end || dr.start });
    try { localStorage.removeItem('st_ai_pending_trip'); } catch (_) {}
    return S.trip;
  }
  setInterval(() => {
    const p = lsGet('st_ai_pending_trip', null);
    if (!p) return;
    if (Date.now() - p.t > 30 * 60000) { try { localStorage.removeItem('st_ai_pending_trip'); } catch (_) {} return; }
    if (typeof S === 'undefined' || !S || !S.trip || !S.trip.id || S.trip.id === p.prev || (p.name && S.trip.name !== p.name)) return;
    if (p.start) lsSet('st_mod_calendar_' + S.trip.id + '_dates', { start: p.start, end: p.end || p.start });
    try { localStorage.removeItem('st_ai_pending_trip'); } catch (_) {}
  }, 2500);

  // ---------- Голос ----------
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recNow = null;
  function listen(onText) {
    return new Promise((resolve, reject) => {
      if (!Rec) { reject(new Error('nospeech')); return; }
      const r = new Rec(); r.lang = 'ru-RU'; r.interimResults = true; r.continuous = false; recNow = r;
      let fin = '', last = '';
      r.onresult = e => { let s = ''; for (let i = 0; i < e.results.length; i++) { s += e.results[i][0].transcript; if (e.results[i].isFinal) fin = s; } last = s; onText && onText(s); };
      r.onerror = e => { r._e = e.error; };
      r.onend = () => { recNow = null; const t = (fin || last).trim(); t ? resolve(t) : reject(new Error(r._e || 'nothing')); };
      try { r.start(); } catch (e) { reject(e); }
    });
  }
  const micErr = e => { const m = e && (e.message || e.error); return m === 'nospeech' ? 'Голосовой ввод не поддерживается этим браузером — откройте приложение в Chrome или напишите текстом.'
    : m === 'not-allowed' || m === 'service-not-allowed' ? 'Нет доступа к микрофону — разрешите его в настройках браузера.' : m === 'network' ? 'Для распознавания речи нужен интернет.' : 'Не расслышал — попробуйте ещё раз.'; };

  // ---------- Стили ----------
  STHub.addStyles(ID, `
    #pg-module[data-module="ai-home"] .hub-title-row,#pg-module[data-module="ai-chat"] .hub-title-row{display:none}
    #pg-module[data-module="ai-home"] .mod-wrap,#pg-module[data-module="ai-chat"] .mod-wrap{padding-top:0}
    .ai-hero{position:relative;margin:0 -16px;padding-top:calc(64px + var(--st,0px));background:linear-gradient(180deg,#eef0fd 0%,#cfd9fb 100%)}
    .ai-hero .pic{position:relative;aspect-ratio:541/268;background:url(${IMG}hero.webp) center/100% 100% no-repeat}
    .ai-hero .pic::after{content:"";position:absolute;left:0;right:0;bottom:0;height:34%;background:linear-gradient(180deg,rgba(0,0,0,0),var(--bg))}
    .ai-hero h1{position:absolute;top:calc(18px + var(--st,0px));left:56px;right:56px;margin:0;text-align:center;font-size:1.9rem;font-weight:800;color:#15163a;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ai-back{position:absolute;z-index:3;top:calc(12px + var(--st,0px));left:6px;width:46px;height:46px;border:0;background:none;color:#15163a;display:flex;align-items:center;justify-content:center;cursor:pointer}
    .ai-back svg{width:28px;height:28px;stroke-width:2.2}
    .ai-say{position:absolute;z-index:2;right:14px;bottom:16%;max-width:56%;padding:11px 16px;border-radius:24px;background:rgba(255,255,255,.88);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
      box-shadow:0 8px 24px rgba(60,60,140,.14);font-size:clamp(.82rem,3.6vw,.98rem);font-weight:600;line-height:1.3;color:#1d1e45}
    .ai-grid{position:relative;z-index:2;display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:-6px}
    .ai-tile{display:flex;flex-direction:column;align-items:center;gap:6px;padding:16px 10px 18px;border-radius:26px;border:1px solid var(--hub-card-b);background:var(--hub-card);box-shadow:var(--hub-shadow);font:inherit;color:var(--text);cursor:pointer;text-align:center}
    .ai-ic{width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#5b4bd6;background:radial-gradient(circle,rgba(124,107,240,.18) 0%,rgba(124,107,240,0) 70%)}
    .ai-ic svg{width:40px;height:40px;stroke-width:1.9}
    .ai-tile b{font-size:1.08rem;font-weight:800;line-height:1.2}
    .ai-tile small{font-size:.86rem;color:var(--t2);line-height:1.3}
    .ai-ex-h{margin:20px 4px 10px;font-size:1.05rem;font-weight:800}
    .ai-ex{display:flex;flex-direction:column;align-items:flex-start;gap:10px}
    .ai-ex button{display:inline-flex;align-items:center;gap:10px;max-width:100%;padding:10px 16px;border-radius:999px;border:1px solid var(--hub-card-b);background:var(--hub-card);box-shadow:var(--hub-shadow);font:inherit;font-size:.92rem;color:var(--text);cursor:pointer;text-align:left}
    .ai-ex button svg{width:20px;height:20px;color:#5b4bd6;flex-shrink:0}
    .ai-bar{position:sticky;bottom:0;z-index:5;margin:18px -4px 0;padding:10px 4px calc(10px + env(safe-area-inset-bottom,0px));background:linear-gradient(180deg,rgba(0,0,0,0),var(--bg) 35%)}
    .ai-in{display:flex;align-items:flex-end;gap:10px;padding:8px 8px 8px 16px;border-radius:28px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:0 8px 24px rgba(70,60,160,.1)}
    .ai-in>svg{width:26px;height:26px;color:#5b4bd6;flex-shrink:0;margin-bottom:11px}
    .ai-in textarea{flex:1;min-width:0;min-height:44px;max-height:140px;resize:none;border:0;outline:0;background:none;font:inherit;font-size:1rem;line-height:1.4;color:var(--text);padding:11px 0}
    .ai-in textarea::placeholder{color:var(--t2)}
    .ai-btn-r{width:46px;height:46px;border-radius:50%;border:0;background:rgba(106,77,244,.1);color:#5b4bd6;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}
    .ai-btn-r svg{width:23px;height:23px;stroke-width:2.2}
    .ai-btn-r.send{background:linear-gradient(135deg,#5b4bd6,#7b6bf0);color:#fff}
    .ai-btn-r.on{background:#e5262c;color:#fff;animation:aiPulse 1.2s infinite}
    @keyframes aiPulse{0%{box-shadow:0 0 0 0 rgba(229,38,44,.45)}100%{box-shadow:0 0 0 14px rgba(229,38,44,0)}}
    .ai-head{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;margin:0 -16px;padding:calc(10px + var(--st,0px)) 12px 10px 6px;background:var(--bg);box-shadow:0 10px 16px -12px rgba(40,40,100,.18)}
    .ai-head .ai-back{position:static}
    .ai-ava{width:62px;height:62px;border-radius:50%;background:#e9e8fb url(${IMG}bot.webp) center/cover;flex-shrink:0;box-shadow:0 6px 16px rgba(91,75,214,.18)}
    .ai-head-t{flex:1;min-width:0}
    .ai-head-t b{display:block;font-size:1.5rem;font-weight:800;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ai-head-t small{display:flex;align-items:center;gap:6px;font-size:.92rem;color:var(--t2)}
    .ai-head-t small i{width:12px;height:12px;border-radius:50%;border:2px solid #1fb25a;box-sizing:border-box}
    .ai-head-t small i.off{border-color:#9a9ab0}
    .ai-more{width:44px;height:44px;border:0;background:none;color:var(--text);display:flex;align-items:center;justify-content:center;cursor:pointer}
    .ai-more svg{width:26px;height:26px}
    .ai-chat{display:flex;flex-direction:column;gap:14px;padding:6px 0 4px;min-height:50vh}
    .ai-me{align-self:flex-end;max-width:84%;padding:12px 16px 8px;border-radius:24px 24px 6px 24px;background:linear-gradient(135deg,#5b4bd6,#7b6bf0);color:#fff;font-size:1.02rem;line-height:1.4;box-shadow:0 8px 20px rgba(91,75,214,.25);overflow-wrap:anywhere;white-space:pre-wrap}
    .ai-me small{display:flex;justify-content:flex-end;align-items:center;gap:4px;margin-top:4px;font-size:.78rem;opacity:.85}
    .ai-me small svg{width:15px;height:15px}
    .ai-bot{display:flex;align-items:flex-start;gap:10px;max-width:96%}
    .ai-bot .ai-ava{width:44px;height:44px;box-shadow:0 4px 10px rgba(91,75,214,.15)}
    .ai-card{flex:1;min-width:0;border-radius:22px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:0 8px 22px rgba(70,60,160,.1);overflow:hidden}
    .ai-card-b{padding:14px 16px 8px;font-size:1rem;line-height:1.45;color:var(--text);overflow-wrap:anywhere}
    .ai-card-b p{margin:0 0 8px}
    .ai-card-b .q{font-size:1.05rem}
    .ai-f{display:flex;align-items:flex-start;gap:8px;margin:5px 0;line-height:1.35}
    .ai-f svg{width:18px;height:18px;color:#5b4bd6;flex-shrink:0;margin-top:1px}
    .ai-f b{font-weight:800;white-space:nowrap;flex-shrink:0}
    .ai-f>span{flex:1;min-width:0}
    .ai-t{display:block;text-align:right;font-size:.78rem;color:var(--t2);margin-top:4px}
    .ai-acts{display:flex;gap:10px;padding:10px 12px 12px;border-top:1px solid var(--hub-card-b)}
    .ai-acts button{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 8px;border-radius:16px;border:0;font:inherit;font-weight:700;font-size:.98rem;cursor:pointer;background:rgba(106,77,244,.08);color:var(--text)}
    .ai-acts button svg{width:19px;height:19px}
    .ai-acts button.ok{background:linear-gradient(135deg,#5b4bd6,#7b6bf0);color:#fff;box-shadow:0 6px 14px rgba(91,75,214,.28)}
    .ai-acts button[disabled]{opacity:.6;cursor:default}
    .ai-done{display:flex;align-items:center;gap:8px;padding:10px 16px 12px;font-weight:700;font-size:.92rem;border-top:1px solid var(--hub-card-b)}
    .ai-done.ok{color:#1b9a50}
    .ai-done.no{color:var(--t2)}
    .ai-done svg{width:18px;height:18px}
    .ai-done button{margin-left:auto;border:0;background:none;color:#5b4bd6;font:inherit;font-weight:700;cursor:pointer}
    .ai-chips{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 4px}
    .ai-chip{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:999px;border:1px solid var(--hub-card-b);background:var(--hub-card);font:inherit;font-size:.9rem;font-weight:700;color:var(--text);cursor:pointer}
    .ai-chip svg{width:16px;height:16px;color:#5b4bd6}
    .ai-chip.on{background:linear-gradient(135deg,#5b4bd6,#7b6bf0);color:#fff;border-color:transparent}
    .ai-chip.on svg{color:#fff}
    .ai-ed{display:grid;gap:8px;margin:6px 0}
    .ai-ed label{display:grid;gap:4px;font-size:.8rem;color:var(--t2);font-weight:700}
    .ai-ed input,.ai-ed select{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:12px;border:1px solid var(--hub-card-b);background:var(--bg);color:var(--text);font:inherit;font-size:.98rem}
    .ai-ed .row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .ai-warn{margin:6px 0;padding:10px 12px;border-radius:12px;background:rgba(242,165,22,.12);font-size:.88rem;line-height:1.4}
    .ai-sheet{position:fixed;inset:0;z-index:1900;background:rgba(10,10,30,.45);display:flex;align-items:flex-end;justify-content:center}
    .ai-sheet>div{width:100%;max-width:560px;background:var(--bg);border-radius:26px 26px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px))}
    .ai-sheet h3{margin:0 0 10px;text-align:center;font-size:1.1rem;font-weight:800}
    .ai-opt{display:flex;align-items:center;gap:12px;width:100%;padding:13px 12px;border:0;border-radius:16px;background:none;font:inherit;font-size:1rem;font-weight:600;color:var(--text);cursor:pointer;text-align:left}
    .ai-opt svg{width:22px;height:22px;color:#5b4bd6}
    .ai-help{margin:0;padding-left:18px;font-size:.92rem;line-height:1.5}
  `);

  // ---------- Модуль ----------
  STHub.registerService(ID, ctx => {
    const trip = ctx.trip;
    const tripName = trip ? (trip.name || trip.dest || 'поездка') : '';
    const cur = (trip && trip.currency) || 'EUR';
    let chat = ctx.store.get('chat', []);
    // карточки, не подтверждённые в прошлый раз, не «висят» — помечаем как отменённые
    chat.forEach(m => { if (m.card && !m.card.state) m.card.state = 'cancel'; if (m.card) m.card.busy = false; });
    const saveChat = () => { chat = chat.slice(-60); ctx.store.set('chat', chat); };
    let mode = null, scr = null, typing = false;
    const mem = lsGet('st_ai_mem', {}); // последние даты и место из переписки («на эти даты»)
    const saveMem = () => lsSet('st_ai_mem', mem);
    if (ctx.me) lsSet('st_ai_myname', ctx.me);

    const tiles = [
      ['expense', 'receipt-text', 'Добавить расход', 'Просто напишите,<br>что потратили', 'Например: такси 25 €'],
      ['route', 'map-pin', 'Создать маршрут', 'Добавьте место или<br>план на день', 'Например: Кёльнский собор завтра в 10:00'],
      ['calendar', 'calendar-days', 'Внести в календарь', 'Событие, билет,<br>бронь, встречу', 'Например: экскурсия завтра в 10:00'],
      ['map', 'map', 'Добавить на карту', 'Сохраните место, отель<br>или достопримечательность', 'Например: музей Людвига']
    ];
    const EXAMPLES = [['message-circle', 'Добавь расход: ужин 48 € на двоих'], ['map-pin', 'Внеси в маршрут: Кёльн → Берлин, 20 ноября'], ['calendar-days', 'Создай событие: экскурсия в 10:00'], ['list-checks', 'Не забыть зарядку и паспорт']];

    function inputBar(ph) {
      return `<div class="ai-bar"><div class="ai-in"><i data-lucide="sparkles"></i><textarea id="ai-in" rows="1" placeholder="${esc(ph)}"></textarea>
        <button class="ai-btn-r" type="button" data-a="mic" aria-label="Сказать голосом"><i data-lucide="mic"></i></button></div></div>`;
    }
    function bindBar(body, onSend) {
      const ta = body.querySelector('#ai-in'), btn = body.querySelector('[data-a="mic"]');
      const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; };
      const sync = () => { const has = !!ta.value.trim(); btn.classList.toggle('send', has); btn.innerHTML = `<i data-lucide="${has ? 'send' : 'mic'}"></i>`; icons(btn); };
      ta.addEventListener('input', () => { grow(); sync(); });
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const v = ta.value.trim(); if (v) { ta.value = ''; grow(); sync(); onSend(v); } } });
      btn.addEventListener('click', async () => {
        const v = ta.value.trim();
        if (v) { ta.value = ''; grow(); sync(); onSend(v); return; }
        if (btn.classList.contains('on')) { try { recNow && recNow.stop(); } catch (_) {} return; }
        btn.classList.add('on');
        try { const t = await listen(s => { ta.value = s; grow(); }); ta.value = ''; grow(); onSend(t); }
        catch (e) { ctx.toast(micErr(e)); }
        finally { btn.classList.remove('on'); sync(); }
      });
      return ta;
    }

    // ===== Главная =====
    function home() {
      scr = ctx.openScreen({
        id: 'ai-home', title: ctx.title,
        render(body) {
          body.innerHTML = `
            <div class="ai-hero">
              <button class="ai-back" type="button" data-a="back" aria-label="Назад"><i data-lucide="chevron-left"></i></button>
              <h1>${esc(ctx.title)}</h1>
              <div class="pic"><div class="ai-say">Ваш умный помощник<br>в путешествии</div></div>
            </div>
            <div class="ai-grid">${tiles.map(([k, ic, t, s]) => `<button class="ai-tile" type="button" data-k="${k}"><span class="ai-ic"><i data-lucide="${ic}"></i></span><b>${t}</b><small>${s}</small></button>`).join('')}</div>
            <div class="ai-ex-h">Примеры запросов:</div>
            <div class="ai-ex">${EXAMPLES.map(([ic, t]) => `<button type="button" data-ex="${esc(t)}"><i data-lucide="${ic}"></i>«${esc(t)}»</button>`).join('')}</div>
            ${inputBar('Напишите, что нужно сделать…')}`;
          icons(body);
          body.querySelector('[data-a="back"]').addEventListener('click', () => ctx.close());
          body.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { const t = tiles.find(x => x[0] === b.dataset.k); mode = t[0]; openChat(null, t[4]); }));
          body.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => openChat(b.dataset.ex)));
          bindBar(body, v => openChat(v));
        }
      });
    }

    // ===== Чат =====
    function openChat(firstText, ph) {
      scr = ctx.openScreen({
        id: 'ai-chat', title: ctx.title, onBack: home,
        render(body, screen) {
          body.innerHTML = `
            <div class="ai-head">
              <button class="ai-back" type="button" data-a="back" aria-label="Назад"><i data-lucide="chevron-left"></i></button>
              <span class="ai-ava"></span>
              <span class="ai-head-t"><b>${esc(ctx.title)}</b><small><i class="${online() ? '' : 'off'}"></i>${online() ? 'Онлайн' : 'Офлайн — места на карте не найду'}</small></span>
              <button class="ai-more" type="button" data-a="more" aria-label="Меню"><i data-lucide="ellipsis"></i></button>
            </div>
            <div class="ai-chat" id="ai-chat"></div>
            ${inputBar(ph || (mode ? tiles.find(x => x[0] === mode)[4] : 'Напишите запрос…'))}`;
          icons(body);
          body.querySelector('[data-a="back"]').addEventListener('click', () => home());
          body.querySelector('[data-a="more"]').addEventListener('click', menu);
          const ta = bindBar(body, send);
          draw();
          if (ph) setTimeout(() => ta.focus(), 50);
        }
      });
      if (firstText) send(firstText);
    }
    const chatEl = () => document.getElementById('ai-chat');
    function scrollEnd() { const el = chatEl(); const last = el && el.lastElementChild; if (last && last.scrollIntoView) last.scrollIntoView({ block: 'end', behavior: 'smooth' }); }
    function draw() {
      const el = chatEl(); if (!el) return;
      if (!chat.length) chat.push({ who: 'bot', t: nowTime(), text: 'Привет! Напишите или скажите, что нужно сделать, — я пойму, куда это добавить: расходы, календарь, маршрут, карта, чек-лист или дневник. Перед добавлением покажу, что получилось.' });
      el.innerHTML = chat.map((m, i) => m.who === 'me'
        ? `<div class="ai-me">${esc(m.text)}<small>${esc(m.t)}<i data-lucide="check-check"></i></small></div>`
        : `<div class="ai-bot"><span class="ai-ava"></span><div class="ai-card" data-i="${i}">${m.card ? cardHtml(m) : `<div class="ai-card-b">${m.html || esc(m.text)}<span class="ai-t">${esc(m.t)}</span></div>`}</div></div>`).join('')
        + (typing ? `<div class="ai-bot"><span class="ai-ava"></span><div class="ai-card"><div class="ai-card-b">${esc(typeof typing === 'string' ? typing : 'Ищу на карте…')}</div></div></div>` : '');
      icons(el);
      el.querySelectorAll('.ai-card[data-i]').forEach(c => bindCard(c, chat[+c.dataset.i]));
      scrollEnd();
    }
    function say(text, html) { chat.push({ who: 'bot', t: nowTime(), text, html }); saveChat(); draw(); }

    // ---------- Сообщение пользователя ----------
    async function send(text) {
      chat.push({ who: 'me', t: nowTime(), text }); saveChat(); draw();
      const low = text.toLowerCase().trim();
      if (/^(привет|здравств|hi|hallo|hello)/.test(low) && low.length < 20) { say('Привет! Чем помочь? Например: «обед 36 € на двоих» или «экскурсия завтра в 10:00».'); return; }
      if (/что ты умеешь|помощь|help|как пользоваться/.test(low)) { help(); return; }
      const rg = parseRange(text); if (rg) { mem.range = { start: rg.start, end: rg.end }; saveMem(); }
      const dm = destOf(text); if (dm) { mem.dest = dm; saveMem(); }
      const pt = pendingTrip();
      if (pt) {
        if (U(/^(да|ага|верно|всё\s+верно|все\s+верно|правильно|ок|окей|ok|подтверждаю|создавай|создай|давай|можно|сам|создай\s+сам|добавь\s+сам|готово)\b/i).test(low)) { createFromCard(pt); return; }
        if (U(/^(отмена|отмени|не\s+надо|стоп)\b/i).test(low)) { pt.card.state = 'cancel'; saveChat(); say('Хорошо, отменил. Если что — напишите «создай поездку».'); return; }
        const before = JSON.stringify(pt.card.dr);
        const dr = JSON.parse(before);
        const fixed = applyTripFix(dr, text, ctx);
        if (fixed) {
          if (dr.curAuto && dr.dest !== pt.card.dr.dest) { typing = 'Подбираю валюту…'; draw(); await suggestCurrency(dr, trip && trip.currency ? trip.currency : 'EUR'); typing = false; }
          say('Исправил: ' + fixed + '. Проверьте карточку ниже.');
          pushTripCard(dr); return;
        }
        if (U(/^(нет|не\s+так|неверно|не\s+верно)\b/i).test(low)) { say('Что исправить? Напишите, например: «валюта доллар», «даты с 1 по 5 декабря», «добавь Сашу», «название Каир 2026» — или нажмите «Изменить».'); return; }
      }
      const kind = detectKind(text, mode);
      mode = null;
      if (!kind) { askKind(text); return; }
      await propose(text, kind);
    }
    // карточка поездки + вопрос о том, чего не хватает
    function pushTripCard(dr) {
      chat.forEach(x => { if (x.card && x.card.type === 'trip' && !x.card.state) x.card.state = 'old'; });
      const miss = [];
      if (!dr.dest) miss.push('куда едем');
      if (!dr.start) miss.push('даты');
      if (!dr.me) miss.push('ваше имя');
      if (dr.count && dr.count > 1 + dr.others.length && !dr.only) miss.push('имена ещё ' + (dr.count - 1 - dr.others.length) + ' участн.');
      dr.miss = miss;
      chat.push({ who: 'bot', t: nowTime(), card: { type: 'trip', dr, state: '' } }); saveChat(); draw();
    }
    const pendingTrip = () => { for (let i = chat.length - 1; i >= 0; i--) { const c = chat[i].card; if (c && c.type === 'trip') return c.state ? null : chat[i]; if (chat[i].who === 'bot' && c && c.type !== 'trip' && !c.state) return null; } return null; };
    async function createFromCard(m) {
      const c = m.card, dr = c.dr;
      if (!dr.me) { c.edit = true; saveChat(); draw(); ctx.toast('Укажите ваше имя'); return; }
      if (!curOk(dr.cur)) { c.edit = true; saveChat(); draw(); ctx.toast('Выберите валюту'); return; }
      c.busy = true; saveChat(); draw();
      try {
        const t = await createTripNow(dr);
        c.busy = false; c.state = 'created'; c.tripName = t.name; saveChat();
        ctx.toast('Поездка «' + t.name + '» создана');
        STHub.openExpenses('pg-dash');
      } catch (e) {
        c.busy = false; c.err = e && e.message === 'currency' ? 'Эта валюта недоступна в приложении — выберите другую.' : e && e.message === 'offline' ? 'Для создания поездки нужен интернет — она сохраняется на сервере, чтобы пригласить участников.' : 'Не получилось создать поездку автоматически (нет связи с сервером?). Откройте форму — данные уже будут заполнены.';
        saveChat(); draw();
      }
    }
    function askKind(text) {
      chat.push({ who: 'bot', t: nowTime(), card: { type: 'ask', src: text } }); saveChat(); draw();
    }
    async function propose(text, kind) {
      if (kind === 'trip' || (kind === 'tripdates' && !trip)) {
        const dr = parse(text, 'trip', ctx);
        if (!dr.start && mem.range && (dr.useMem || kind === 'tripdates' || !trip)) { dr.start = mem.range.start; dr.end = mem.range.end; }
        if (!dr.dest && mem.dest) { dr.dest = mem.dest; if (dr.name === 'Новая поездка') dr.name = mem.dest; }
        typing = 'Подбираю валюту…'; draw();
        await suggestCurrency(dr, trip && trip.currency ? trip.currency : 'EUR');
        typing = false;
        pushTripCard(dr);
        return;
      }
      if (!trip) {
        const rg = parseRange(text);
        chat.push({ who: 'bot', t: nowTime(), card: { type: 'notrip', src: text, kind, state: '' } }); saveChat(); draw();
        if (rg) { mem.range = { start: rg.start, end: rg.end }; saveMem(); }
        return;
      }
      const dr = parse(text, kind, ctx);
      if (kind === 'tripdates') {
        if (!dr.start && mem.range) { dr.start = mem.range.start; dr.end = mem.range.end; }
        if (!dr.start) { say('Напишите даты, например: «даты поездки с 23 по 27 ноября».'); return; }
      }
      if (!dr) { askKind(text); return; }
      if ((kind === 'route' || kind === 'map')) {
        if (!dr.places.length) { say('Не понял, какое место добавить. Напишите, например: «добавь на карту музей Людвига».'); return; }
        if (!online()) { say('Чтобы найти место на карте, нужен интернет. Попробуйте, когда появится сеть.'); return; }
        typing = true; draw();
        const found = [];
        for (const p of dr.places) found.push(await geocode(p.q, trip));
        typing = false;
        const miss = dr.places.filter((p, i) => !found[i]).map(p => p.q);
        if (miss.length === dr.places.length) { draw(); say('Не нашёл «' + miss.join('», «') + '» на карте. Уточните название или добавьте город.'); return; }
        dr.places = dr.places.map((p, i) => found[i] ? Object.assign({ q: p.q }, found[i]) : null).filter(Boolean);
        dr.miss = miss;
      }
      if (kind === 'checklist') { const secs = checklistSections(trip); dr.sections = (secs || []).map(s => ({ id: s.id, name: s.name })); const def = (secs || []).find(s => /друг|разн/i.test(s.name)); dr.section = def ? def.id : (dr.sections[0] ? dr.sections[0].id : null); }
      if (kind === 'diary' && !dr.text) { say('Что записать в дневник? Например: «запиши в дневник: отличный день у моря».'); return; }
      if (kind === 'calendar' && !dr.title) dr.title = 'Событие';
      chat.push({ who: 'bot', t: nowTime(), card: { type: kind, dr, state: '' } }); saveChat(); draw();
    }

    // ---------- Карточки ----------
    const F = (ic, label, val) => `<div class="ai-f"><i data-lucide="${ic}"></i>${label ? `<b>${esc(label)}:</b>` : ''}<span>${esc(val)}</span></div>`;
    function cardHtml(m) {
      const c = m.card, dr = c.dr;
      const tail = c.state === 'done' ? `<div class="ai-done ok"><i data-lucide="circle-check"></i>Добавлено в «${esc(KIND[c.type].t)}»<button type="button" data-a="open">Открыть</button></div>`
        : c.state === 'cancel' ? '<div class="ai-done no"><i data-lucide="circle-x"></i>Отменено</div>' : null;
      const acts = (okTxt, second) => tail || `<div class="ai-acts"><button class="ok" type="button" data-a="ok" ${c.busy ? 'disabled' : ''}><i data-lucide="check"></i>${okTxt}</button>${second}</div>`;
      if (c.type === 'notrip') {
        return `<div class="ai-card-b"><p class="q">Сейчас не открыта ни одна поездка.</p><p>Расходы, события и места хранятся внутри поездки. Создать новую или открыть существующую?</p><span class="ai-t">${esc(m.t)}</span></div>` +
          (c.state ? '<div class="ai-done no"><i data-lucide="circle-check"></i>Готово</div>' : `<div class="ai-acts"><button class="ok" type="button" data-a="newtrip"><i data-lucide="plane-takeoff"></i>Новая поездка</button><button type="button" data-a="trips"><i data-lucide="luggage"></i>Мои поездки</button></div>`);
      }
      if (c.type === 'trip') {
        if (c.edit) return `<div class="ai-card-b">${tripEditHtml(dr)}</div><div class="ai-acts"><button class="ok" type="button" data-a="save"><i data-lucide="check"></i>Готово</button><button type="button" data-a="noedit">Отмена</button></div>`;
        const people = [dr.me ? dr.me + ' (вы, организатор)' : 'вы'].concat(dr.others);
        const tl = c.state === 'created' ? `<div class="ai-done ok"><i data-lucide="circle-check"></i>Поездка «${esc(c.tripName || dr.name)}» создана</div>`
          : c.state === 'old' ? '<div class="ai-done no"><i data-lucide="arrow-down"></i>Обновлённая карточка — ниже</div>'
            : c.state === 'cancel' ? '<div class="ai-done no"><i data-lucide="circle-x"></i>Отменено</div>'
              : c.state === 'done' ? '<div class="ai-done ok"><i data-lucide="circle-check"></i>Открыл форму поездки</div>' : null;
        return `<div class="ai-card-b"><p class="q">Создать поездку — всё верно?</p>
          ${F('tag', 'Название', dr.name)}
          ${F('map-pin', 'Направление', (dr.dest || 'не указано') + (dr.country && dr.country !== dr.dest ? ', ' + dr.country : ''))}
          ${F('calendar-range', 'Даты', dr.start ? humanRange(dr.start, dr.end) : 'не указаны')}
          ${F('banknote', 'Валюта', dr.cur ? dr.cur + ' — ' + curName(dr.cur) : 'не выбрана')}
          ${dr.cur2 ? F('coins', 'Доп. валюта', dr.cur2 + ' — ' + curName(dr.cur2)) : ''}
          ${F('users', 'Участники', people.join(', '))}
          ${dr.miss && dr.miss.length && !c.state ? `<div class="ai-warn">Не хватает: ${esc(dr.miss.join(', '))}. Напишите это сообщением или нажмите «Изменить».</div>` : ''}
          ${c.err ? `<div class="ai-warn">${esc(c.err)}</div>` : ''}
          ${!c.state ? '<p style="font-size:.88rem;color:var(--t2)">Если что-то не так — просто напишите, что исправить: «валюта доллар», «добавь Сашу», «даты с 1 по 5 декабря».</p>' : ''}
          <span class="ai-t">${esc(m.t)}</span></div>
          ${tl || `<div class="ai-acts"><button class="ok" type="button" data-a="ok" ${c.busy ? 'disabled' : ''}><i data-lucide="${c.busy ? 'loader' : 'check'}"></i>${c.busy ? 'Создаю…' : 'Создать'}</button><button type="button" data-a="edit"><i data-lucide="pencil"></i>Изменить</button></div>
          ${c.err ? '<div class="ai-acts"><button type="button" data-a="form"><i data-lucide="external-link"></i>Открыть форму</button><button type="button" data-a="cancel">Отмена</button></div>' : ''}`}`;
      }
      if (c.type === 'tripdates') {
        return `<div class="ai-card-b"><p class="q">Изменить даты поездки «${esc(tripName)}»?</p>${F('calendar-range', '', humanRange(dr.start, dr.end))}
          <p style="font-size:.88rem;color:var(--t2)">Даты появятся в «Календаре» и будут выделены на месяце.</p><span class="ai-t">${esc(m.t)}</span></div>${acts('Сохранить', '<button type="button" data-a="cancel">Отмена</button>')}`;
      }
      if (c.type === 'ask') {
        return `<div class="ai-card-b"><p class="q">Куда это добавить?</p><div class="ai-chips">${Object.entries(KIND).filter(([k]) => trip || k === 'trip').map(([k, v]) => `<button class="ai-chip" type="button" data-k="${k}"><i data-lucide="${v.ic}"></i>${v.t}</button>`).join('')}</div><span class="ai-t">${esc(m.t)}</span></div>`;
      }
      if (c.edit) return `<div class="ai-card-b">${editHtml(c)}</div><div class="ai-acts"><button class="ok" type="button" data-a="save"><i data-lucide="check"></i>Готово</button><button type="button" data-a="noedit">Отмена</button></div>`;
      if (c.type === 'expense') {
        const members = ctx.members || [];
        const other = dr.cur && dr.cur !== cur;
        const cat = expCat(dr.name);
        return `<div class="ai-card-b"><p class="q">Добавить расход в поездку<br><b>«${esc(tripName)}»</b>?</p>
          ${F('', 'Название', dr.name).replace('<i data-lucide=""></i>', '')}
          <div class="ai-f"><b>Сумма:</b><span>${dr.amount != null ? esc(fmtMoney(dr.amount, other ? dr.cur : cur)) : '<span style="color:#d93a3a">не указана</span>'}</span></div>
          <div class="ai-f"><b>Категория:</b><span>${esc(cat[0])}</span><i data-lucide="${cat[1]}"></i></div>
          <div class="ai-f"><b>Участники:</b><span>${dr.parts.length}${dr.parts.length && dr.parts.length < members.length ? ' — ' + esc(dr.parts.join(', ')) : dr.parts.length === members.length && members.length > 1 ? ' — все' : ''}</span></div>
          <div class="ai-f"><b>Платил:</b><span>${esc(dr.payer || '—')}</span></div>
          ${dr.date !== iso(new Date()) ? `<div class="ai-f"><b>Дата:</b><span>${esc(human(dr.date))}</span></div>` : ''}
          ${other ? `<div class="ai-warn">Сумма в ${esc(dr.cur)}, а валюта поездки — ${esc(cur)}. Нажмите «Изменить» → «Открыть полную форму», там можно выбрать валюту с пересчётом.</div>` : ''}
          ${dr.amount == null ? '<div class="ai-warn">Укажите сумму — нажмите «Изменить».</div>' : ''}
          <span class="ai-t">${esc(m.t)}</span></div>${acts('Добавить', `<button type="button" data-a="edit"><i data-lucide="pencil"></i>Изменить</button>`)}`;
      }
      if (c.type === 'calendar') {
        return `<div class="ai-card-b"><p class="q">Добавить в календарь?</p>${F('calendar-check', '', dr.title)}${F(dr.endDate ? 'calendar-range' : 'clock', '', dr.endDate ? humanRange(dr.date, dr.endDate) + (dr.time ? ', с ' + dr.time : '') : human(dr.date) + (dr.time ? ', ' + dr.time : ' · весь день'))}
          ${dr.dateGuessed ? '<p style="font-size:.88rem;color:var(--t2)">Дату не нашёл в сообщении — поставил сегодня. Можно изменить.</p>' : ''}
          <span class="ai-t">${esc(m.t)}</span></div>${acts('Добавить', `<button type="button" data-a="edit"><i data-lucide="pencil"></i>Изменить</button>`)}`;
      }
      if (c.type === 'route' || c.type === 'map') {
        const r = c.type === 'route';
        return `<div class="ai-card-b"><p class="q">${r ? 'Добавить в маршрут?' : 'Добавить на карту?'}</p>
          ${dr.places.map(p => `<div class="ai-f"><i data-lucide="map-pin"></i><span>${esc(p.name)}${p.addr ? `<br><small style="color:var(--t2)">${esc(p.addr)}</small>` : ''}</span></div>`).join('')}
          ${dr.date || dr.time ? F('calendar-days', '', (dr.date ? human(dr.date) : 'Сегодня') + (dr.time ? ', ' + dr.time : '')) : ''}
          ${dr.miss && dr.miss.length ? `<p style="font-size:.88rem;color:#c27a00">Не нашёл на карте: ${esc(dr.miss.join(', '))}</p>` : ''}
          <p>${r ? (dr.date || dr.time ? 'Я также добавлю событие в календарь и отмечу место на карте.' : 'Место появится в «Маршруте» и на карте «Гида».') : 'Место сохранится в «Гиде» — его будет видно на карте и можно добавить в маршрут.'}</p>
          <span class="ai-t">${esc(m.t)}</span></div>${acts('Добавить', '<button type="button" data-a="cancel">Отмена</button>')}`;
      }
      if (c.type === 'checklist') {
        return `<div class="ai-card-b"><p class="q">Добавить в чек-лист?</p>${dr.items.map(x => F('square-check', '', x)).join('')}
          ${dr.sections && dr.sections.length ? `<div class="ai-ed"><label>Раздел<select data-a="sec">${dr.sections.map(s => `<option value="${esc(s.id)}" ${s.id === dr.section ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label></div>` : '<p style="font-size:.88rem;color:var(--t2)">Добавлю в раздел «Разное».</p>'}
          <span class="ai-t">${esc(m.t)}</span></div>${acts('Добавить', '<button type="button" data-a="cancel">Отмена</button>')}`;
      }
      if (c.type === 'diary') {
        return `<div class="ai-card-b"><p class="q">Записать в дневник?</p>${F('calendar-days', '', human(dr.date))}<p style="white-space:pre-wrap">«${esc(dr.text)}»</p>
          <span class="ai-t">${esc(m.t)}</span></div>${acts('Записать', '<button type="button" data-a="cancel">Отмена</button>')}`;
      }
      return '';
    }
    function tripEditHtml(dr) {
      const opts = (sel, none) => (none ? '<option value="">—</option>' : '') + curList().map(x => `<option value="${esc(x.code)}" ${x.code === sel ? 'selected' : ''}>${esc(x.code)} — ${esc(curName(x.code))}</option>`).join('');
      return `<p class="q"><b>Новая поездка</b></p><div class="ai-ed">
        <label>Название<input data-t="name" value="${esc(dr.name)}"></label>
        <label>Направление<input data-t="dest" value="${esc(dr.dest)}"></label>
        <div class="row"><label>С<input data-t="start" type="date" value="${esc(dr.start)}"></label><label>По<input data-t="end" type="date" value="${esc(dr.end)}"></label></div>
        <div class="row"><label>Валюта<select data-t="cur">${opts(dr.cur)}</select></label><label>Доп. валюта<select data-t="cur2">${opts(dr.cur2, true)}</select></label></div>
        <label>Ваше имя (организатор)<input data-t="me" value="${esc(dr.me)}"></label>
        <label>Другие участники (через запятую)<input data-t="others" value="${esc(dr.others.join(', '))}"></label></div>`;
    }
    function editHtml(c) {
      const dr = c.dr;
      if (c.type === 'expense') {
        const members = ctx.members || [];
        return `<p class="q"><b>Расход</b></p><div class="ai-ed">
          <label>Название<input data-f="name" value="${esc(dr.name)}"></label>
          <div class="row"><label>Сумма, ${esc(cur)}<input data-f="amount" inputmode="decimal" value="${dr.amount != null ? esc(String(dr.amount).replace('.', ',')) : ''}"></label>
          <label>Дата<input data-f="date" type="date" value="${esc(dr.date)}"></label></div>
          <label>Платил<select data-f="payer">${members.map(x => `<option ${x.name === dr.payer ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
          <label>Участники</label><div class="ai-chips">${members.map(x => `<button class="ai-chip${dr.parts.includes(x.name) ? ' on' : ''}" type="button" data-p="${esc(x.name)}">${esc(x.name)}</button>`).join('')}</div>
          <button class="ai-chip" type="button" data-a="full" style="justify-self:start"><i data-lucide="external-link"></i>Открыть полную форму</button></div>`;
      }
      if (c.type === 'calendar') {
        return `<p class="q"><b>Событие</b></p><div class="ai-ed"><label>Название<input data-f="title" value="${esc(dr.title)}"></label>
          <div class="row"><label>Дата<input data-f="date" type="date" value="${esc(dr.date)}"></label><label>Время<input data-f="time" type="time" value="${esc(dr.time)}"></label></div></div>`;
      }
      return '';
    }
    function bindCard(el, m) {
      const c = m.card; if (!c) return;
      const q = s => el.querySelector('[data-a="' + s + '"]');
      const redraw = () => { saveChat(); draw(); };
      el.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { c.state = 'cancel'; c.type = 'ask'; chat.splice(chat.indexOf(m), 1); saveChat(); propose(c.src, b.dataset.k); }));
      if (q('open')) q('open').addEventListener('click', () => {
        const tgt = { expense: null, calendar: 'calendar', tripdates: 'calendar', route: 'route', map: 'guide', checklist: 'checklist', diary: 'diary' }[c.type];
        if (c.type === 'expense') STHub.openExpenses('pg-exp'); else STHub.openService(tgt);
      });
      if (q('cancel')) q('cancel').addEventListener('click', () => { c.state = 'cancel'; redraw(); });
      if (q('newtrip')) q('newtrip').addEventListener('click', () => { c.state = 'done'; saveChat(); propose(c.src || '', 'trip'); });
      if (q('trips')) q('trips').addEventListener('click', () => { c.state = 'done'; saveChat(); STHub.show('trips'); });
      if (q('edit')) q('edit').addEventListener('click', () => { c.edit = true; redraw(); });
      if (q('noedit')) q('noedit').addEventListener('click', () => { c.edit = false; redraw(); });
      if (q('sec')) q('sec').addEventListener('change', e => { c.dr.section = e.target.value; saveChat(); });
      el.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
        const n = b.dataset.p, i = c.dr.parts.indexOf(n);
        if (i >= 0) c.dr.parts.splice(i, 1); else c.dr.parts.push(n);
        b.classList.toggle('on', i < 0);
      }));
      const readEdit = () => {
        el.querySelectorAll('[data-f]').forEach(inp => {
          const f = inp.dataset.f; let v = inp.value;
          if (f === 'amount') { v = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); c.dr.amount = isFinite(v) && v > 0 ? v : null; c.dr.cur = null; }
          else c.dr[f] = f === 'date' && !v ? c.dr.date : v;
        });
        if (c.type === 'calendar') c.dr.dateGuessed = false;
      };
      if (q('save') && c.type === 'trip') q('save').addEventListener('click', () => {
        el.querySelectorAll('[data-t]').forEach(inp => {
          const f = inp.dataset.t, v = inp.value.trim();
          if (f === 'others') c.dr.others = v.split(/\s*,\s*/).filter(Boolean);
          else if (f === 'cur') { c.dr.cur = v; c.dr.curAuto = false; }
          else if (f === 'cur2') c.dr.cur2 = v && v !== c.dr.cur ? v : null;
          else c.dr[f] = v;
        });
        if (c.dr.end && c.dr.start && c.dr.end < c.dr.start) c.dr.end = c.dr.start;
        if (c.dr.me) lsSet('st_ai_myname', c.dr.me);
        c.dr.miss = [!c.dr.dest && 'куда едем', !c.dr.start && 'даты', !c.dr.me && 'ваше имя'].filter(Boolean);
        c.edit = false; redraw();
      });
      else if (q('save')) q('save').addEventListener('click', () => { readEdit(); c.edit = false; redraw(); });
      if (q('form')) q('form').addEventListener('click', () => { c.state = 'done'; redraw(); openCreateTrip(c.dr); });
      if (q('full')) q('full').addEventListener('click', () => { readEdit(); saveChat(); openFullForm(c.dr); });
      if (q('ok')) q('ok').addEventListener('click', async () => {
        if (c.busy) return;
        try {
          if (c.type === 'expense') {
            if (c.dr.amount == null) { c.edit = true; redraw(); ctx.toast('Укажите сумму'); return; }
            if (c.dr.cur && c.dr.cur !== cur) { ctx.toast('Сумма в другой валюте — откройте полную форму'); c.edit = true; redraw(); return; }
            if (!c.dr.parts.length) { ctx.toast('Выберите участников'); c.edit = true; redraw(); return; }
            addExpense(c.dr);
          } else if (c.type === 'trip') { createFromCard(m); return; }
          else if (c.type === 'tripdates') setTripDates(trip, c.dr.start, c.dr.end);
          else if (c.type === 'calendar') addEvent(trip, c.dr);
          else if (c.type === 'route' || c.type === 'map') {
            addPlaces(trip, c.dr.places, c.type === 'route');
            if (c.type === 'route' && (c.dr.date || c.dr.time)) addEvent(trip, { title: c.dr.places.map(p => p.name).join(' → '), date: c.dr.date || iso(new Date()), time: c.dr.time, type: c.dr.places.length > 1 ? 'transport' : 'other', place: c.dr.places[0].addr || c.dr.places[0].name });
          } else if (c.type === 'checklist') c.dr.sectionName = addChecklist(trip, c.dr.items, c.dr.section);
          else if (c.type === 'diary') addDiary(trip, c.dr, ctx.me);
          c.state = 'done'; redraw();
          ctx.toast('Добавлено в «' + KIND[c.type].t + '»');
        } catch (e) {
          ctx.toast(e && e.message === 'storage' ? 'Не хватает памяти на устройстве' : e && e.message === 'notrip' ? 'Сначала откройте поездку' : 'Не удалось добавить — проверьте данные');
        }
      });
    }
    // Полная форма расхода приложения — с выбором валюты, долей и т.д.
    function openFullForm(dr) {
      /* global openAddExp */
      if (typeof openAddExp !== 'function') { ctx.toast('Форма расходов недоступна'); return; }
      STHub.openExpenses('pg-exp');
      setTimeout(() => {
        try {
          openAddExp();
          const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
          set('ae-name', dr.name); if (dr.amount != null) set('ae-amt', String(dr.amount).replace('.', ',')); set('ae-date', dr.date);
          document.querySelectorAll('.ae-check').forEach(cb => { cb.checked = dr.parts.includes(cb.value); cb.dispatchEvent(new Event('change', { bubbles: true })); });
          const payer = document.querySelector('.wp[data-payer="' + (window.CSS && CSS.escape ? CSS.escape(dr.payer) : dr.payer) + '"]'); if (payer) payer.click();
        } catch (_) {}
      }, 250);
    }

    function help() {
      say('', `<p><b>Что я умею</b></p><ul class="ai-help">
        <li>Расходы: «такси 25 €», «Саша заплатил 60 за ужин на всех»</li>
        <li>Календарь: «экскурсия завтра в 10:00», «20 ноября в 19:00 концерт»</li>
        <li>Маршрут: «внеси в маршрут Кёльн → Берлин, 20 ноября»</li>
        <li>Карта: «добавь на карту музей Людвига»</li>
        <li>Чек-лист: «не забыть зарядку и паспорт»</li>
        <li>Дневник: «запиши в дневник: отличный день»</li>
        <li>Поездка: «создай поездку в Египет с 23 по 27 ноября», «даты поездки 23.11–27.11»</li></ul>
        <p style="margin-top:8px;color:var(--t2);font-size:.88rem">Я работаю прямо на телефоне, без платного AI. Перед добавлением всегда покажу карточку — подтвердите или измените.</p>`);
    }
    function menu() {
      const el = document.createElement('div'); el.className = 'ai-sheet';
      el.innerHTML = `<div><h3>${esc(ctx.title)}</h3>
        <button class="ai-opt" type="button" data-m="help"><i data-lucide="circle-help"></i>Что я умею</button>
        <button class="ai-opt" type="button" data-m="clear"><i data-lucide="trash-2"></i>Очистить переписку</button></div>`;
      document.body.appendChild(el); icons(el);
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-m]');
        if (e.target === el || b) el.remove();
        if (!b) return;
        if (b.dataset.m === 'help') help();
        if (b.dataset.m === 'clear') { chat = []; saveChat(); draw(); }
      });
    }

    home();
  });

  // для проверки разбора фраз (тесты в консоли): STAssistant.parse('обед 36 € на двоих', null, { members: [...] })
  window.STAssistant = { detect: detectKind, parse: (t, k, ctx) => parse(t, k || detectKind(t, null), ctx || { members: [] }), parseDate, parseTime, parseMoney };
})();
