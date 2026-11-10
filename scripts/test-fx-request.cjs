const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {
  window: {}, document: { addEventListener() {} },
  location: { hostname: 'localhost', protocol: 'https:' },
  fetch: null, Intl, Number, BigInt, AbortController, setTimeout, clearTimeout
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('public/js/fx-calculator.js', 'utf8'), context);
const request = context.window.SplitawayFx.requestLatestRate;
const signal = new AbortController().signal;
const today = new Date().toISOString().slice(0, 10);

(async () => {
  const calls = [];
  context.fetch = async url => {
    calls.push(url);
    return new Response(`KEY,TIME_PERIOD,OBS_VALUE\nEXR.D.CNY.EUR.SP00.A,${today},7.4992\n`, { headers: { 'content-type': 'text/csv' } });
  };
  assert.deepEqual({ ...await request('CNY', 'EUR', signal) }, { rate: Number((1 / 7.4992).toFixed(12)), asOf: today, source: 'ECB' });
  assert.equal(calls.length, 1);

  // No ECB request for RUB: the ECB's last observation is from 2022.
  calls.length = 0;
  context.fetch = async url => { calls.push(url); return Response.json({ base: 'EUR', quote: 'RUB', rate: 94.9745, asOf: today, source: 'CBR' }); };
  assert.deepEqual({ ...await request('EUR', 'RUB', signal) }, { rate: 94.9745, asOf: today, source: 'CBR' });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/api\/fx\/rate\?base=EUR&quote=RUB/);

  // Older production proxy returned blended rates without source metadata.
  calls.length = 0;
  context.fetch = async url => {
    calls.push(url);
    return calls.length === 1
      ? Response.json({ base: 'EUR', quote: 'RUB', rate: 95.07, asOf: today })
      : Response.json({ base: 'EUR', quote: 'RUB', rate: 95.4709, date: today });
  };
  const pinned = await request('EUR', 'RUB', signal);
  assert.equal(pinned.rate, 95.4709);
  assert.equal(pinned.source, 'CBR via Frankfurter');
  assert.equal(calls.length, 2);
  assert.match(calls[1], /providers=cbr$/);

  context.location = { hostname: 'splitaway.netlify.app', protocol: 'https:' };
  calls.length = 0;
  context.fetch = async url => {
    calls.push(url);
    if (calls.length === 1) return new Response('', { status: 503 });
    return calls.length === 2
      ? new Response('<html>app shell</html>', { status: 200, headers: { 'content-type': 'text/html' } })
      : Response.json({ date: today, base: 'CNY', quote: 'EUR', rate: 0.13322 });
  };
  assert.deepEqual({ ...await request('CNY', 'EUR', signal) }, { rate: 0.13322, asOf: today, source: 'ECB via Frankfurter' });
  assert.equal(calls.length, 3);
  assert.equal(calls[2], 'https://api.frankfurter.dev/v2/rate/CNY/EUR?providers=ecb');

  calls.length = 0;
  context.fetch = async url => { calls.push(url); return Response.json({ date: '2022-03-01', base: 'EUR', quote: 'RUB', rate: 117.201 }); };
  await assert.rejects(request('EUR', 'RUB', signal), /rate_unavailable/);
  assert.equal(calls.length, 2);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(request('EUR', 'RUB', cancelled.signal));
  console.log('PASS: ECB current, RUB skips ECB, pinned fallback, stale rejection, cancellation');
})().catch(error => { console.error(error); process.exitCode = 1; });
