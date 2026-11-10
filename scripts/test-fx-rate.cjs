const assert = require('node:assert/strict');

(async () => {
  const { default: handler } = await import('../netlify/functions/fx-rate.mjs');
  const req = (base, quote) => new Request(`https://example.test/?base=${base}&quote=${quote}`);
  const today = new Date().toISOString().slice(0, 10);
  let response = await handler(req('CNY%2Fsecret', 'EUR'));
  assert.equal(response.status, 400);
  response = await handler(new Request('https://example.test/?base=CNY&quote=EUR', { method: 'POST' }));
  assert.equal(response.status, 405);
  response = await handler(req('EUR', 'EUR'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).rate, 1);

  const originalFetch = global.fetch;
  try {
    global.fetch = async url => {
      assert.equal(url, 'https://api.frankfurter.dev/v2/rate/EUR/CNY?providers=ecb');
      return Response.json({ date: today, base: 'EUR', quote: 'CNY', rate: 7.4832 });
    };
    response = await handler(req('CNY', 'EUR'));
    assert.equal(response.status, 200);
    let data = await response.json();
    assert.equal(data.rate, Number((1 / 7.4832).toFixed(12)));
    assert.equal(data.source, 'ECB via Frankfurter');

    // Old ECB RUB data must not be requested or accepted. CBR quotes RUB per EUR.
    global.fetch = async url => {
      assert.match(url, /^https:\/\/www\.cbr\.ru\/scripts\/XML_daily\.asp\?date_req=/);
      const [year, month, day] = today.split('-');
      return new Response(`<ValCurs Date="${day}.${month}.${year}"><Valute><CharCode>EUR</CharCode><Nominal>1</Nominal><Value>94,9745</Value></Valute><Valute><CharCode>CNY</CharCode><Nominal>10</Nominal><Value>127,01</Value></Valute></ValCurs>`);
    };
    response = await handler(req('EUR', 'RUB'));
    data = await response.json();
    assert.equal(data.rate, 94.9745);
    assert.equal(data.source, 'CBR');
    response = await handler(req('RUB', 'EUR'));
    data = await response.json();
    assert.equal(data.rate, Number((1 / 94.9745).toFixed(12)));
    response = await handler(req('CNY', 'RUB'));
    data = await response.json();
    assert.equal(data.rate, 12.701); // Nominal=10 must be respected.

    // Historic series and future-dated replies are rejected, not cached as current.
    global.fetch = async url => url.includes('cbr.ru')
      ? new Response('<ValCurs Date="01.03.2022"></ValCurs>')
      : Response.json({ date: '2022-03-01', base: 'EUR', quote: 'RUB', rate: 117.201 });
    response = await handler(req('EUR', 'RUB'));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'rate_unavailable' });

    // Historical legal conversions remain explicit, not labelled a live rate.
    response = await handler(req('EUR', 'HRK'));
    data = await response.json();
    assert.equal(data.rate, 7.5345);
    assert.equal(data.source, 'ECB fixed conversion');
    assert.equal(data.asOf, '2023-01-01');
    response = await handler(req('EUR', 'BGN'));
    data = await response.json();
    assert.equal(data.rate, 1.95583);
    assert.equal(data.asOf, '2026-01-01');

    global.fetch = async () => Response.json({ error: 'bad' }, { status: 429 });
    response = await handler(req('EUR', 'CNY'));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'rate_unavailable' });
  } finally {
    global.fetch = originalFetch;
  }
  console.log('PASS: FX sources, CBR RUB and nominal, stale rejection, fixed historic rates, safe failure');
})().catch(error => { console.error(error); process.exitCode = 1; });
