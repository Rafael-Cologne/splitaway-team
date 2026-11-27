const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync('public/js/personal-key.js', 'utf8');
const probe = source.replace('  window.STKey = {', '  window.__keyTexts = { LOGIN_KEYS, LOGIN_TEXT, kl, fmtDate };\n  window.STKey = {');
assert.notEqual(probe, source);
let lang = 'ru';
const window = { addEventListener() {} };
vm.runInNewContext(probe, { window, getLang: () => lang, localStorage: { getItem: () => null }, setTimeout() {}, setInterval() {}, TextEncoder, TextDecoder, Date, Intl, console });
const t = window.__keyTexts;
for (const locale of ['ru', 'en', 'de', 'fr', 'it', 'es', 'pt', 'pl', 'el', 'tr']) {
  lang = locale;
  assert.equal(t.LOGIN_TEXT[locale].split('|').length, t.LOGIN_KEYS.length, `${locale}: missing translation`);
  t.LOGIN_KEYS.forEach(key => assert.ok(t.kl(key, 2), `${locale}: empty ${key}`));
  assert.ok(t.fmtDate(Date.UTC(2026, 10, 27)).includes('2026'));
}
lang = 'de';
assert.equal(t.kl('heading'), 'Mit persönlichem Schlüssel anmelden');
assert.equal(t.kl('number'), 'Persönliche Nummer');
assert.equal(t.kl('openTrips', 2), 'Anmelden und Reisen öffnen: 2');
console.log('Personal key sign-in localization: 10 languages OK');
