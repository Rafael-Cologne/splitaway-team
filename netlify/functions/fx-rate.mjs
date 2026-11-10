// Public reference rates only. Requests contain currency codes, never trip data.
const ALLOWED_CURRENCIES = new Set([
  'EUR', 'USD', 'GBP', 'CHF', 'CZK', 'PLN', 'HUF', 'SEK', 'NOK', 'DKK',
  'RON', 'HRK', 'BGN', 'RSD', 'TRY', 'UAH', 'RUB', 'THB', 'JPY', 'CNY',
  'KRW', 'AUD', 'CAD', 'MXN', 'BRL', 'AED', 'IDR', 'INR', 'MYR', 'SGD',
  'GEL', 'AMD', 'AZN'
]);
const FIXED_EUR_RATES = { HRK: { value: 7.5345, since: '2023-01-01' }, BGN: { value: 1.95583, since: '2026-01-01' } };
const NATIONAL_PROVIDERS = { RUB: 'cbr', RSD: 'cbr', AED: 'cbr', UAH: 'nbu', GEL: 'nbg', AMD: 'cba', AZN: 'cbar' };

function validDate(value, today = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  const age = today.getTime() - parsed.getTime();
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value &&
    age >= 0 && age < 6 * 86400000;
}

async function fetchBounded(url, signal) {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json, text/xml' } });
  if (!response.ok) throw new Error('provider_unavailable');
  return response;
}

function xmlField(block, name) {
  return block.match(new RegExp('<' + name + '>([^<]+)</' + name + '>'))?.[1];
}

async function cbrRate(base, quote, signal, today) {
  // Without date_req the Bank of Russia can return tomorrow's announced fixing.
  const [year, month, date] = today.toISOString().slice(0, 10).split('-');
  const response = await fetchBounded('https://www.cbr.ru/scripts/XML_daily.asp?date_req=' + date + '/' + month + '/' + year, signal);
  const xml = await response.text();
  const rawDate = xml.match(/<ValCurs\b[^>]*Date="(\d{2})\.(\d{2})\.(\d{4})"/)?.slice(1);
  if (!rawDate) throw new Error('invalid_cbr_date');
  const asOf = rawDate[2] + '-' + rawDate[1] + '-' + rawDate[0];
  if (!validDate(asOf, today)) throw new Error('stale_cbr_rate');
  const perRuble = { RUB: 1 };
  for (const match of xml.matchAll(/<Valute\b[^>]*>([\s\S]*?)<\/Valute>/g)) {
    const block = match[1];
    const code = xmlField(block, 'CharCode');
    const nominal = Number(xmlField(block, 'Nominal'));
    const value = Number((xmlField(block, 'Value') || '').replace(',', '.'));
    if (ALLOWED_CURRENCIES.has(code) && Number.isFinite(nominal) && nominal > 0 && Number.isFinite(value) && value > 0) {
      perRuble[code] = value / nominal;
    }
  }
  if (!perRuble[base] || !perRuble[quote]) throw new Error('cbr_currency_unavailable');
  return { rate: perRuble[base] / perRuble[quote], asOf, source: 'CBR' };
}

async function euroLeg(code, signal, today) {
  if (code === 'EUR') return { value: 1, asOf: null, source: null };
  if (FIXED_EUR_RATES[code]) return { value: FIXED_EUR_RATES[code].value, asOf: null,
    fixedSince: FIXED_EUR_RATES[code].since, source: 'ECB fixed conversion' };
  const provider = NATIONAL_PROVIDERS[code] || 'ecb';
  const url = `https://api.frankfurter.dev/v2/rate/EUR/${code}?providers=${provider}`;
  const data = await (await fetchBounded(url, signal)).json();
  if (data.base !== 'EUR' || data.quote !== code || !Number.isFinite(data.rate) || data.rate <= 0 ||
      !validDate(data.date, today)) throw new Error('stale_or_invalid_rate');
  return { value: data.rate, asOf: data.date, source: provider.toUpperCase() + ' via Frankfurter' };
}

export default async function handler(request) {
  if (request.method !== 'GET') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  const url = new URL(request.url);
  const base = (url.searchParams.get('base') || '').toUpperCase();
  const quote = (url.searchParams.get('quote') || '').toUpperCase();
  if (!ALLOWED_CURRENCIES.has(base) || !ALLOWED_CURRENCIES.has(quote)) {
    return Response.json({ error: 'invalid_currency' }, { status: 400 });
  }
  const today = new Date();
  if (base === quote) return Response.json({ base, quote, rate: 1, asOf: today.toISOString().slice(0, 10), source: 'same currency' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    let result;
    if (['RUB', 'RSD', 'AED'].includes(base) || ['RUB', 'RSD', 'AED'].includes(quote)) {
      try { result = await cbrRate(base, quote, controller.signal, today); } catch (_) { /* Pin official providers below. */ }
    }
    if (!result) {
      const [from, to] = await Promise.all([euroLeg(base, controller.signal, today), euroLeg(quote, controller.signal, today)]);
      const dates = [from.asOf, to.asOf].filter(Boolean).sort();
      if (dates.length === 2 && (new Date(dates[1]) - new Date(dates[0])) > 3 * 86400000) throw new Error('mismatched_dates');
      result = {
        rate: to.value / from.value,
        asOf: dates[0] || [from.fixedSince, to.fixedSince].filter(Boolean).sort()[0] || today.toISOString().slice(0, 10),
        source: [...new Set([from.source, to.source].filter(Boolean))].join(' + ')
      };
    }
    if (!Number.isFinite(result.rate) || result.rate <= 0) throw new Error('invalid_rate');
    return Response.json({ base, quote, rate: Number(result.rate.toFixed(12)), asOf: result.asOf, source: result.source },
      { headers: { 'Cache-Control': 'public, max-age=3600' } });
  } catch (_) {
    return Response.json({ error: 'rate_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  } finally {
    clearTimeout(timer);
  }
}
