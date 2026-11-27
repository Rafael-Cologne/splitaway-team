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
  const missing = ru.map((phrase, i) => [phrase, data[lang][i]]).filter(([phrase, value]) => !value && phrase !== 'A-Za-zА-Яа-яЁё0-9_');
  assert.equal(missing.length, 0, `${lang}: untranslated UI phrases: ${missing.map(([phrase]) => phrase).join(', ')}`);
}
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
assert.equal(ui.translate('изменение курса с прошлой публикации'), 'cambio respecto al tipo anterior');
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
