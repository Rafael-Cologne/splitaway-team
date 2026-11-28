const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const hub = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'hub.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'hub.css'), 'utf8');
for (const code of ['ru','en','de','fr','it','es','pt','pl','el','tr']) {
  assert.match(hub, new RegExp(`\\b${code}:'[^']+'`), `${code} flag missing`);
}
// Язык выбирается только в «Профиль и настройки»: сетка 5×2 с флажками, без отдельной строки «Язык» в «Ещё»
assert.doesNotMatch(hub, /'language-settings'|openLanguageSettings|settings-lang/);
assert.match(hub, /<div class="hub-lang-grid">` \+\s*LANGS\.map\(\(\[code, name\]\) => `<button class="btn btn-g btn-sm lang-btn/);
assert.match(hub, /data-hub="lang" data-v="\$\{code\}" data-lang="\$\{code\}" aria-pressed="\$\{cur === code\}"/);
assert.match(hub, /case 'lang': if \(typeof setLang === 'function'\) setLang\(v\); openProfile\(\); render\(\);/);
assert.match(css, /\.hub-lang-grid\{display:grid;grid-template-columns:repeat\(5/);
console.log('Hub language settings: ten flags in profile, no separate language row OK');
