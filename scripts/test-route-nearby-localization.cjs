const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

for (const [moduleName, marker, exportLine, resultName] of [
  ['route', "  STHub.addStyles(ID, `", '  window.__texts = { ROUTE_KEYS, ROUTE_TEXT, rtxt };\n  STHub.addStyles(ID, `', 'rtxt'],
  ['nearby', "  STHub.addStyles('nearby', `", "  window.__texts = { NEAR_KEYS, NEAR_TEXT, ntxt };\n  STHub.addStyles('nearby', `", 'ntxt']
]) {
  const source = fs.readFileSync(`public/js/modules/${moduleName}.js`, 'utf8');
  const probe = source.replace(marker, exportLine);
  assert.notEqual(probe, source, `${moduleName}: probe insertion failed`);
  let language = 'ru';
  const STHub = { addStyles() {}, registerService() {} };
  const window = { STHub };
  vm.runInNewContext(probe, { window, STHub, getLang: () => language, console });
  const t = window.__texts;
  for (const locale of ['ru', 'en', 'de', 'fr', 'it', 'es', 'pt', 'pl', 'el', 'tr']) {
    language = locale;
    const keys = t[`${moduleName === 'route' ? 'ROUTE' : 'NEAR'}_KEYS`];
    const texts = t[`${moduleName === 'route' ? 'ROUTE' : 'NEAR'}_TEXT`];
    assert.equal(texts[locale].split('|').length, keys.length, `${moduleName} ${locale}: missing translation`);
    keys.forEach(key => assert.ok(t[resultName](key), `${moduleName} ${locale}: empty ${key}`));
  }
  language = 'de';
  assert.equal(t[resultName](moduleName === 'route' ? 'optimize' : 'places'), moduleName === 'route' ? 'Optimieren' : 'Orte in der Nähe');
}
console.log('Route and Nearby localization: 10 languages OK');
