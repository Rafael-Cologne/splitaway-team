// Read-only live audit of every currency shown by the calculator.
const fs = require('node:fs');

(async () => {
  const { default: handler } = await import('../netlify/functions/fx-rate.mjs');
  const source = fs.readFileSync('public/js/i18n.js', 'utf8');
  const list = source.match(/const CURRENCIES = \[([\s\S]*?)\];/)?.[1] || '';
  const codes = [...list.matchAll(/\{code:'([A-Z]{3})'/g)].map(match => match[1]);
  if (codes.length !== 33) throw new Error('Currency list changed: ' + codes.length);
  const results = [];
  for (let i = 0; i < codes.length; i += 4) {
    const batch = await Promise.all(codes.slice(i, i + 4).map(async code => {
      try {
        const response = await handler(new Request(`https://example.test/?base=EUR&quote=${code}`));
        const data = await response.json();
        return { code, status: response.status, rate: data.rate, asOf: data.asOf, source: data.source || data.error };
      } catch (error) { return { code, status: 'fetch_failed', source: error.message }; }
    }));
    results.push(...batch);
  }
  console.table(results);
  const failed = results.filter(row => row.status !== 200 || !Number.isFinite(row.rate) || row.rate <= 0);
  console.log(`Checked ${results.length} currencies; ${failed.length} unavailable`);
  if (failed.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
