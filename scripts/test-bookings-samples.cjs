// Регрессия разбора броней на 64 документах (перелёты, жильё, транспорт, билеты; PDF и фото/OCR).
// Тексты получены тем же способом, что в приложении (pdf.js / Tesseract). Запуск: node scripts/test-bookings-samples.cjs
const T = require(process.env.TOOLS || '../public/js/modules/bookings-tools.js');
const fs = require('fs'), path = require('path');
const base = process.env.DATA || path.join(__dirname, '../public/data');
const db = T.makeDb(JSON.parse(fs.readFileSync(base + '/airports.json')), JSON.parse(fs.readFileSync(base + '/airlines.json')));
const samples = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/bookings-samples.json'), 'utf8'));
const today = new Date(2026, 10, 17);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ё/g, 'е').replace(/[^a-z0-9а-я]+/g, ' ').trim();
const normNum = v => String(v || '').toUpperCase().replace(/\s/g, '').replace(/^([A-Z0-9]{2,3}?)0+(\d)/, '$1$2');
function cmp1(k, e, g) {
  const empty = g === undefined || g === null || g === '';
  if (e === null || e === undefined || e === '') return empty;
  if (empty) return false;
  if (k === 'price') return Math.abs(+g - e) < 0.005;
  if (['title', 'place', 'placeTo', 'provider'].includes(k)) { const a = norm(g), b = norm(e); return a === b || (!!b && a.includes(b) && a.length - b.length <= 30); }
  if (k === 'code') return String(g).toUpperCase().replace(/[\s.]/g, '') === String(e).toUpperCase().replace(/[\s.]/g, '');
  return g === e;
}
const cmp = (k, e, g) => Array.isArray(e) ? e.some(x => cmp1(k, x, g)) : cmp1(k, e, g);
function compare(c, r) {
  const out = [], add = (k, e, g, ok) => out.push({ k, e, g, ok });
  const e = c.exp;
  if (c.grp === 'flights') {
    add('cat', e.cat, r.cat, r.cat === e.cat);
    add('boarding', e.boarding, r.boarding, !!r.boarding === e.boarding);
    const segs = r.segments || [];
    add('segs', e.segments.length, segs.length, segs.length === e.segments.length);
    e.segments.forEach((es, i) => {
      const gs = segs.find(s => s.from === es.from && s.to === es.to) || segs[i] || {};
      for (const k of ['from', 'to', 'date', 'time', 'endDate', 'endTime', 'number', 'provider']) {
        const g = gs[k] || ''; const ok = k === 'number' ? (Array.isArray(es.number) ? es.number : [es.number]).some(n => normNum(n) === normNum(g)) : (es[k] || '') === g;
        add(`s${i + 1}.${k}`, es[k], g, ok);
      }
    });
    add('code', e.code, r.code, (r.code || null) === e.code);
    const pc = (String(r.people || '').match(/^(\d+)/) || [])[1];
    add('people', e.people, r.people, +pc === e.people);
    const gs = r.seats ? r.seats.split(/,\s*/).sort() : [];
    add('seats', e.seats.join(', '), r.seats, JSON.stringify(gs) === JSON.stringify([...e.seats].sort()));
    add('price', e.price, r.price, e.price == null ? r.price == null : Math.abs((r.price || 0) - e.price) < 0.005);
    add('currency', e.currency, r.currency, e.currency == null ? !r.currency : r.currency === e.currency);
  } else {
    for (const k of Object.keys(e)) add(k, e[k], r[k], cmp(k, e[k], r[k]));
  }
  return out;
}
let fail = 0, total = 0;
for (const s of samples) {
  const r = T.parseBooking(s.text, db, { today, currency: 'EUR' });
  const bad = compare({ grp: s.grp, exp: s.exp }, r).filter(x => s.check.includes(x.k) && !x.ok);
  total += s.check.length;
  if (bad.length) { fail++; console.log('✗ ' + s.name); bad.forEach(x => console.log(`    ${x.k}: ждали ${JSON.stringify(x.e)}, получили ${JSON.stringify(x.g)}`)); }
}
console.log(fail ? `\n${fail} документ(ов) с ошибками` : `Все ${samples.length} документов (${total} полей) разобраны верно`);
process.exit(fail ? 1 : 0);
