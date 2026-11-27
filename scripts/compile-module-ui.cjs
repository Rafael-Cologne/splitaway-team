const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const phrases = JSON.parse(fs.readFileSync(path.join(__dirname, 'module-ui-catalog.json'), 'utf8'));
const progressPath = path.join(os.tmpdir(), 'useaway-module-ui-translations.progress.json');
const outputPath = path.join(__dirname, '..', 'public', 'js', 'module-ui-locales.js');
const progress = fs.existsSync(progressPath) ? JSON.parse(fs.readFileSync(progressPath, 'utf8')) : null;
const previous = progress ? null : JSON.parse(fs.readFileSync(outputPath, 'utf8').replace(/^window\.ST_MODULE_UI_LOCALES=/, '').replace(/;\s*$/, ''));
const overrides = JSON.parse(fs.readFileSync(path.join(__dirname, 'module-ui-overrides.json'), 'utf8'));
const reviewed = JSON.parse(fs.readFileSync(path.join(__dirname, 'module-ui-reviewed.json'), 'utf8'));
const prevIndex = phrase => { if (!previous) return -1; const i = previous.ru.indexOf(phrase); return i >= 0 ? i : previous.ru.indexOf(phrase.replace(/^\s*>\s*/, '')); };
const out = { ru: phrases };
for (const lang of ['en','de','fr','it','es','pt','pl','el','tr']) {
  out[lang] = phrases.map((phrase, idx) => overrides[lang]?.[phrase] || progress?.[lang]?.[idx] || previous?.[lang]?.[prevIndex(phrase)] || '');
  console.log(lang, out[lang].filter(Boolean).length, '/', phrases.length);
}
// Чистка каталога: куски кода/HTML никогда не совпадут с текстом на экране, а «>Фраза»
// (остаток HTML-тега) превращаем в «Фраза», иначе эта надпись остаётся непереведённой.
const LANGS = ['en','de','fr','it','es','pt','pl','el','tr'];
const isJunk = s => /\.test\(|openSheet\(|A-Za-z|<[a-z]|[a-z-]+=["']?$|`|https?:\/\//.test(s);
{
  const keep = [];
  out.ru.forEach((phrase, i) => {
    if (isJunk(phrase)) return;
    let ru = phrase, vals = LANGS.map(l => out[l][i]);
    if (ru.startsWith('>')) { ru = ru.slice(1).trim(); vals = vals.map(v => String(v || '').replace(/^\s*>\s*/, '')); }
    if (!ru || keep.some(k => k.ru === ru)) return;
    keep.push({ ru, vals });
  });
  const dropped = out.ru.length - keep.length;
  out.ru = keep.map(k => k.ru);
  LANGS.forEach((l, j) => { out[l] = keep.map(k => k.vals[j]); });
  console.log('catalogue cleanup: removed or merged', dropped, 'entries');
}
for (const [phrase, translations] of Object.entries(reviewed)) {
  let index = out.ru.indexOf(phrase);
  if (index < 0) { index = out.ru.length; out.ru.push(phrase); for (const lang of ['en','de','fr','it','es','pt','pl','el','tr']) out[lang].push(''); }
  for (const lang of ['en','de','fr','it','es','pt','pl','el','tr']) out[lang][index] = translations[lang];
}
for (const lang of ['en','de','fr','it','es','pt','pl','el','tr']) {
  out[lang] = out[lang].map(value => value.replace(/⟦[^⟧]*⟧\s*/g, ''));
}
fs.writeFileSync(outputPath, 'window.ST_MODULE_UI_LOCALES=' + JSON.stringify(out) + ';\n');
