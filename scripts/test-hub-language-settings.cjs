const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const hub = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'hub.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'hub.css'), 'utf8');
for (const code of ['ru','en','de','fr','it','es','pt','pl','el','tr']) {
  assert.match(hub, new RegExp(`\\b${code}:'[^']+'`), `${code} flag missing`);
}
assert.match(hub, /\['language-settings', 'languages', tx\('language'\)/);
assert.match(hub, /LANGS\.map\(\(\[code\]\) => `<button class="btn btn-g btn-sm lang-btn/);
assert.match(hub, /aria-pressed="\$\{lang\(\) === code\}"/);
assert.match(hub, /case 'settings-lang': if \(typeof setLang === 'function'\) setLang\(v\); render\(\); openLanguageSettings\(\);/);
assert.match(css, /\.hub-lang-grid\{display:grid;grid-template-columns:repeat\(5/);
console.log('Hub language settings: ten flags and persistent language action OK');
