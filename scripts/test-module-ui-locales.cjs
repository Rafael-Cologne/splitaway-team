const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', 'public', 'js');
const source = fs.readFileSync(path.join(root, 'module-ui-locales.js'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'module-ui-i18n.js'), 'utf8');
const context = { window:{}, document:{ readyState:'loading', addEventListener(){} }, getLang:()=>'es' };
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
assert.equal(ui.locale(), 'es-ES');
console.log('Module UI catalogue: all languages complete and user text preserved');
