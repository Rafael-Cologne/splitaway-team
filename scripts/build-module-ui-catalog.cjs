const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'public', 'js', 'modules');
const results = new Set();
const add = input => {
  for (let part of String(input).split(/<[^>]*>/g)) {
    part = part.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (part.length < 2 || part.length > 160) continue;
    if (!/[А-Яа-яЁё]{2}/.test(part)) continue;
    if (/[\\{}$]|=>|\(\?|\[|\]|\|/.test(part)) continue;
    if (/^(?:\/\/|\*|[.][a-z-]|[a-z]+:)/i.test(part)) continue;
    results.add(part);
  }
};

for (const name of fs.readdirSync(root).filter(n => n.endsWith('.js') && !n.startsWith('_'))) {
  const source = fs.readFileSync(path.join(root, name), 'utf8');
  for (const match of source.matchAll(/>([^<>\n]*[А-Яа-яЁё][^<>\n]*)</g)) add(match[1]);
  for (const match of source.matchAll(/'([^'\n]*[А-Яа-яЁё][^'\n]*)'/g)) add(match[1]);
  for (const match of source.matchAll(/"([^"\n]*[А-Яа-яЁё][^"\n]*)"/g)) add(match[1]);
}
const catalogue = [...results].sort((a, b) => a.localeCompare(b, 'ru'));
const out = path.join(__dirname, 'module-ui-catalog.json');
fs.writeFileSync(out, JSON.stringify(catalogue, null, 2) + '\n');
console.log(`${catalogue.length} candidates in ${out}`);
