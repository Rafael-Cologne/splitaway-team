// One-time build tool. Only static UI phrases from module-ui-catalog.json are sent.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = __dirname;
const phrases = JSON.parse(fs.readFileSync(path.join(root, 'module-ui-catalog.json'), 'utf8'));
const locales = ['en', 'de', 'fr', 'it', 'es', 'pt', 'pl', 'el', 'tr'];
const progressPath = path.join(os.tmpdir(), 'useaway-module-ui-translations.progress.json');
const oldProgressPath = path.join(root, 'module-ui-translations.progress.json');
const loadPath = fs.existsSync(progressPath) ? progressPath : oldProgressPath;
const progress = fs.existsSync(loadPath) ? JSON.parse(fs.readFileSync(loadPath, 'utf8')) : {};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function save() {
  for (let attempt = 0; attempt < 6; attempt++) {
    try { await fs.promises.writeFile(progressPath, JSON.stringify(progress)); return; }
    catch (error) { if (attempt === 5) throw error; await sleep(500 * (attempt + 1)); }
  }
}

async function translateBatch(lang, items) {
  const input = items.map(([idx, phrase]) => `⟦${idx}⟧ ${phrase}`).join('\n');
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=ru&tl=' + lang + '&dt=t&q=' + encodeURIComponent(input);
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const output = data[0].map(part => part[0]).join('');
      const matches = [...output.matchAll(/⟦(\d+)⟧\s*([\s\S]*?)(?=\n?⟦\d+⟧|$)/g)];
      if (matches.length !== items.length || matches.some((match, i) => Number(match[1]) !== items[i][0])) {
        if (items.length > 1) {
          const mid = Math.ceil(items.length / 2);
          await translateBatch(lang, items.slice(0, mid));
          await translateBatch(lang, items.slice(mid));
          return;
        }
        const text = output.replace(/⟦\d+⟧\s*/, '').trim();
        if (!text) throw new Error(`Empty translation for ${items[0][0]}`);
        progress[lang][items[0][0]] = text;
        return;
      }
      for (const match of matches) progress[lang][match[1]] = match[2].trim();
      return;
    } catch (error) {
      if (attempt === 7) throw error;
      await sleep(String(error.message).includes('429') ? Math.min(60000, 10000 * (attempt + 1)) : 1000 * (attempt + 1));
    }
  }
}

(async () => {
  for (const lang of locales) {
    progress[lang] ||= {};
    const remaining = phrases.map((phrase, idx) => [idx, phrase]).filter(([idx]) => !progress[lang][idx]);
    let done = 0;
    while (remaining.length) {
      const batch = [];
      let length = 0;
      while (remaining.length && batch.length < 35 && length + remaining[0][1].length < 1200) {
        const item = remaining.shift(); batch.push(item); length += item[1].length + 12;
      }
      if (!batch.length) batch.push(remaining.shift());
      await translateBatch(lang, batch);
      await save(); done += batch.length;
      if (done % 175 < batch.length) console.log(`${lang}: ${done}/${phrases.length}`);
    }
    console.log(`${lang}: complete`);
  }
  const out = { ru: phrases };
  for (const lang of locales) out[lang] = phrases.map((_, idx) => progress[lang][idx] || '');
  const target = path.join(root, '..', 'public', 'js', 'module-ui-locales.js');
  fs.writeFileSync(target, 'window.ST_MODULE_UI_LOCALES=' + JSON.stringify(out) + ';\n');
  console.log(`Wrote ${target}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
