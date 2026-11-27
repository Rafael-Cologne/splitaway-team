const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync('public/js/modules/calendar.js', 'utf8');
const probe = source.replace("  STHub.registerService('calendar', ctx => {", "  window.__calendarTexts = { CAL_KEYS, CAL_TEXT, FORM_KEYS, FORM_TEXT, BOOK_KEYS, BOOK_TEXT, c, f, bText, fullDate, weekdayNames };\n  STHub.registerService('calendar', ctx => {");
assert.notEqual(probe, source, 'calendar registration was not found');
let lang = 'ru';
const STHub = { registerService() {}, addStyles() {} };
const window = { STHub };
vm.runInNewContext(probe, { window, STHub, getLang: () => lang, localStorage: { getItem: () => null }, Intl, Date, console });
const t = window.__calendarTexts;
for (const locale of ['ru', 'en', 'de', 'fr', 'it', 'es', 'pt', 'pl', 'el', 'tr']) {
  lang = locale;
  for (const [keys, texts, fn] of [[t.CAL_KEYS, t.CAL_TEXT, t.c], [t.FORM_KEYS, t.FORM_TEXT, t.f], [t.BOOK_KEYS, t.BOOK_TEXT, t.bText]]) {
    assert.equal(texts[locale].split('|').length, keys.length, `${locale}: missing translation`);
    keys.forEach(key => assert.ok(fn(key, 2), `${locale}: empty translation for ${key}`));
  }
  assert.equal(t.weekdayNames().length, 7);
  assert.ok(t.fullDate('2026-11-27').includes('2026'));
}
lang = 'de';
assert.equal(t.c('calendar'), 'Kalender');
assert.equal(t.f('deleteEvent'), 'Ereignis löschen');
assert.equal(t.bText('bookingCode'), 'Buchung');
console.log('Calendar localization: 10 languages and date formats OK');
