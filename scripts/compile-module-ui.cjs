const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const phrases = JSON.parse(fs.readFileSync(path.join(__dirname, 'module-ui-catalog.json'), 'utf8'));
const progressPath = path.join(os.tmpdir(), 'useaway-module-ui-translations.progress.json');
const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
const overrides = JSON.parse(fs.readFileSync(path.join(__dirname, 'module-ui-overrides.json'), 'utf8'));
const reviewed = JSON.parse(fs.readFileSync(path.join(__dirname, 'module-ui-reviewed.json'), 'utf8'));
const out = { ru: phrases };
for (const lang of ['en','de','fr','it','es','pt','pl','el','tr']) {
  out[lang] = phrases.map((phrase, idx) => overrides[lang]?.[phrase] || progress[lang]?.[idx] || '');
  console.log(lang, out[lang].filter(Boolean).length, '/', phrases.length);
}
for (const [phrase, translations] of Object.entries(reviewed)) {
  let index = out.ru.indexOf(phrase);
  if (index < 0) { index = out.ru.length; out.ru.push(phrase); for (const lang of ['en','de','fr','it','es','pt','pl','el','tr']) out[lang].push(''); }
  for (const lang of ['en','de','fr','it','es','pt','pl','el','tr']) out[lang][index] = translations[lang];
}
fs.writeFileSync(path.join(__dirname, '..', 'public', 'js', 'module-ui-locales.js'), 'window.ST_MODULE_UI_LOCALES=' + JSON.stringify(out) + ';\n');
