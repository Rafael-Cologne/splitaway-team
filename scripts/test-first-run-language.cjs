const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('public/index.html', 'utf8');
const i18n = fs.readFileSync('public/js/i18n.js', 'utf8');
const hub = fs.readFileSync('public/js/hub.js', 'utf8');
const services = fs.readFileSync('public/js/services-config.js', 'utf8');
const languages = ['ru','en','de','fr','it','es','pt','pl','el','tr'];
const dictionaries = vm.runInNewContext('(' + i18n.match(/const TRANSLATIONS = (\{[\s\S]*?\n\});/)[1] + ')');
const keys = Object.keys(dictionaries.ru).sort();

for (const language of languages) {
  assert.deepEqual(Object.keys(dictionaries[language]).sort(), keys, `Missing translations: ${language}`);
  assert.ok(dictionaries[language].btn_next && dictionaries[language].btn_next !== 'Далее' || language === 'ru');
}
assert.match(html, /onclick="finishFirstRunPreferences\(\)"/);
assert.doesNotMatch(html.match(/<div id="ob-setup"[\s\S]*?<!-- Step 1 -->/)[0], /btn_create_trip|ob-setup-code/);
assert.match(html, /if\(localStorage\.getItem\('sw_onboarding_prefs_done'\)\)window\.STHub\?\.show\('home'\)/);
assert.match(html, /height:100dvh;min-height:0;overflow:hidden/);

const catalogue = vm.runInNewContext(services + '\nwindow.ST_SERVICES', { window: {} });
for (const language of languages) {
  assert.ok(catalogue.every(service => service.title[language]), `Missing service names: ${language}`);
  assert.match(hub, new RegExp('\\b' + language + ':\\s*\\{'), `Missing hub language: ${language}`);
}

const demoMatch = html.match(/const DEMO_CONTENT=(\{[\s\S]*?\n\});/);
assert.ok(demoMatch, 'Demo data must be localized');
const demos = vm.runInNewContext('(' + demoMatch[1] + ')');
for (const language of languages) {
  const demo = demos[language];
  assert.ok(demo.trip && demo.dest);
  assert.equal(demo.people.length, 4);
  assert.equal(new Set(demo.people).size, 4);
  assert.equal(demo.expenses.length, 5);
  if (language !== 'ru') assert.notEqual(demo.trip, demos.ru.trip);
}
console.log('First-run, 10 languages, and localized demo: OK');
