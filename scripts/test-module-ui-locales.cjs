const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', 'public', 'js');
const source = fs.readFileSync(path.join(root, 'module-ui-locales.js'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'module-ui-i18n.js'), 'utf8');
let activeLang = 'es';
const context = { window:{}, document:{ readyState:'loading', addEventListener(){} }, getLang:()=>activeLang };
vm.runInNewContext(source + '\n' + engine, context);
const data = context.window.ST_MODULE_UI_LOCALES;
const ru = data.ru;
for (const lang of ['en','de','fr','it','es','pt','pl','el','tr']) {
  assert.equal(data[lang].length, ru.length, `${lang}: catalogue length`);
  const missing = ru.map((phrase, i) => [phrase, data[lang][i]]).filter(([phrase, value]) => !value);
  assert.equal(missing.length, 0, `${lang}: untranslated UI phrases: ${missing.map(([phrase]) => phrase).join(', ')}`);
  const markers = data[lang].map((value, i) => [ru[i], value]).filter(([, value]) => /⟦|⟧/.test(value));
  assert.equal(markers.length, 0, `${lang}: leaked translation markers: ${markers.map(([phrase]) => phrase).join(', ')}`);
}
// Каталог без мусора: только тексты, которые реально бывают на экране
const junk = ru.filter(p => /^>|\.test\(|openSheet\(|A-Za-z|<[a-z]|`/.test(p));
assert.equal(junk.length, 0, `code or HTML fragments in catalogue: ${junk.join(' | ')}`);
assert.equal(new Set(ru).size, ru.length, 'duplicate phrases in catalogue');
// Ни кириллицы, ни «забытого английского» в других языках
const sameAsEnOk = /MyMemory|Frankfurter|Open-Meteo|Wikivoyage|Transitous|^Yandex|^(Allergies \/ important|participants —)$/;
for (const lang of ['de','fr','it','es','pt','pl','el','tr']) {
  const cyr = ru.map((p, i) => [p, data[lang][i]]).filter(([, v]) => /[А-Яа-яЁё]/.test(v));
  assert.equal(cyr.length, 0, `${lang}: Cyrillic left: ${cyr.map(([p]) => p).join(', ')}`);
  const en = ru.map((p, i) => [p, data[lang][i], data.en[i]]).filter(([, v, e]) => v === e && v.length > 12 && /[a-z]{4}/.test(v) && !sameAsEnOk.test(v));
  assert.equal(en.length, 0, `${lang}: left in English: ${en.map(([p]) => p).join(', ')}`);
}
// «Курс валюты» не должен превращаться в «учебный курс», «тариф» или «процентную ставку»
const wrongRate = { en:/course|lesson|tariff|fare|interest/i, de:/Tarif|Zins|Hilfskurs|Rate\b|rate\b/, it:/corso|tariff|interess/i, es:/curso|tarifa|inter[eé]s/i, pt:/curso|tarifa|juros/i, pl:/stawk|procent|szybkość/i, el:/μάθημα|επιτόκι|ποσοστ|τιμή/i, tr:/ders|ücret|faiz|oran|hız/i };
ru.forEach((p, i) => {
  if (!/курс/i.test(p) || /экскурс/i.test(p)) return;
  for (const [lang, re] of Object.entries(wrongRate)) assert.doesNotMatch(data[lang][i], re, `${lang}: exchange rate mistranslated in «${p}»`);
});
const ui = context.window.STModuleUI;
assert.equal(ui.translate('Добавить расход'), 'Agregar gasto');
assert.equal(ui.translate('  Добавить расход  '), '  Agregar gasto  ');
assert.equal(ui.translate('Название моей поездки'), 'Название моей поездки');
assert.equal(ui.translate('Добавь расход: ужин 48 € на двоих'), 'Añade un gasto: cena para dos, 48 €');
assert.equal(ui.translate('Поиск и карта'), 'Búsqueda y mapa');
assert.equal(ui.translate('Мой план'), 'Mi plan');
assert.equal(ui.translate('Паспорт, страховка, контакты'), 'Pasaporte, seguro, contactos');
assert.equal(ui.translate('Офлайн-данные:'), 'Datos sin conexión:');
assert.equal(ui.translate('Карты'), 'Mapas');
assert.equal(ui.translate('изменение курса с прошлой публикации'), 'variación del tipo desde la última publicación');
assert.equal(ui.translate('Получится'), 'Recibes');
assert.equal(ui.translate('Свой курс'), 'Tipo personalizado');
assert.equal(ui.count(4, 'participant'), '4 participantes');
assert.equal(ui.progress(0, 22), '0 de 22 completados');
for (const lang of ['en','de','fr','it','es','pt','pl','el','tr']) {
  activeLang = lang;
  for (const type of ['participant','entry','expense','day','booking','place','currency']) {
    assert.doesNotMatch(ui.count(4, type), /[А-Яа-яЁё]/, `${lang}: ${type} count`);
  }
  assert.doesNotMatch(ui.progress(0, 22), /[А-Яа-яЁё]/, `${lang}: progress`);
}
activeLang = 'es';
const assistant = fs.readFileSync(path.join(root, 'modules', 'assistant.js'), 'utf8');
assert.match(assistant, /data-ex="\$\{esc\(t\)\}"[^\n]*STModuleUI\?\.translate\(t\)/);
const indexHtml = fs.readFileSync(path.join(root, '..', 'index.html'), 'utf8');
assert.match(indexHtml, /data-i18n="invite_qr_friends"/);
const coreI18n = fs.readFileSync(path.join(root, 'i18n.js'), 'utf8');
assert.equal((coreI18n.match(/"invite_qr_friends":/g) || []).length, 10);
assert.equal(ui.locale(), 'es-ES');
console.log('Module UI catalogue: all languages complete and user text preserved');
