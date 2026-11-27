// One-time fallback for the remaining static Turkish UI phrases.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const phrases = JSON.parse(fs.readFileSync(path.join(__dirname, 'module-ui-catalog.json'), 'utf8'));
const progressPath = path.join(os.tmpdir(), 'useaway-module-ui-translations.progress.json');
const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
progress.tr ||= {};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function save() { await fs.promises.writeFile(progressPath, JSON.stringify(progress)); }
async function translate(items) {
  const q = items.map(([index]) => phrases[index]).join('\n');
  const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(q) + '&langpair=ru%7Ctr';
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data.responseStatus !== 200) throw new Error(data.responseDetails || `Status ${data.responseStatus}`);
  const lines = String(data.responseData.translatedText).replace(/\r/g, '').split('\n').map(s => s.trim());
  if (lines.length !== items.length) {
    if (items.length === 1) throw new Error(`Missing translation: ${q}`);
    const middle = Math.ceil(items.length / 2);
    await translate(items.slice(0, middle));
    await translate(items.slice(middle));
    return;
  }
  items.forEach(([index], i) => { if (lines[i] && !/[А-Яа-яЁё]/.test(lines[i])) progress.tr[index] = lines[i]; });
}
(async () => {
  const missing = phrases.map((_, index) => [index]).filter(([index]) => !progress.tr[index]);
  let done = 0;
  while (missing.length) {
    const batch = [];
    let chars = 0;
    while (missing.length && batch.length < 20 && chars + phrases[missing[0][0]].length < 380) {
      const item = missing.shift(); batch.push(item); chars += phrases[item[0]].length + 1;
    }
    if (!batch.length) batch.push(missing.shift());
    await translate(batch);
    await save();
    done += batch.length;
    console.log(`${done} processed; ${Object.keys(progress.tr).length}/${phrases.length} Turkish entries saved`);
    await sleep(1200);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
