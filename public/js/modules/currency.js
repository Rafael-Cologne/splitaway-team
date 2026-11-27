// ============================================================
// Модуль «Валюты» (id: 'currency')
// ------------------------------------------------------------
// Конвертер валют на официальных курсах — на том же принципе, что и
// калькулятор валют в расходах (js/fx-calculator.js):
//   • ЕЦБ (data-api.ecb.europa.eu) — евро-курсы, с тем же числом знаков
//     после запятой, что публикует ЕЦБ (атрибут DECIMALS: USD 4, GBP 5, JPY 2);
//   • ЦБ РФ — рубль (4 знака, «100 JPY = 51,8246 ₽», как в официальной таблице);
//   • остальные валюты — национальные банки через Frankfurter (как в калькуляторе).
// Всё бесплатно и без ключей. Последние курсы сохраняются на устройстве
// и работают без интернета. Справочный курс может отличаться от курса банка
// или обменника — для этого есть «Свой курс».
// ============================================================
(function () {
  'use strict';
  if (!window.STHub) return;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };
  const HOUR = 3600000;
  const ALL = () => (typeof CURRENCIES !== 'undefined' ? CURRENCIES.map(c => c.code) : ['EUR', 'USD', 'GBP', 'CHF', 'RUB', 'TRY', 'PLN', 'CZK', 'JPY']);
  // Флаг картинкой (на Windows эмодзи-флаги показываются буквами); нет сети — буквы страны в кружке
  const ccOf = c => (typeof CURRENCY_COUNTRIES !== 'undefined' && CURRENCY_COUNTRIES[c]) || '';
  const flag = c => { const cc = ccOf(c).toLowerCase();
    return `<span class="fx-fl" data-cc="${cc ? cc.toUpperCase() : c.slice(0, 2)}">${cc ? `<img src="https://flagcdn.com/w80/${cc}.png" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>`; };
  const nameOf = c => { if (window.STCurrency) return STCurrency.name(c); try { const n = new Intl.DisplayNames([window.STModuleUI?.locale() || 'ru-RU'], { type: 'currency' }).of(c); return n ? n[0].toUpperCase() + n.slice(1) : c; } catch (_) { return c; } };
  const minor = c => { try { return new Intl.NumberFormat('en', { style: 'currency', currency: c }).resolvedOptions().maximumFractionDigits; } catch (_) { return 2; } };
  const fmt = (v, d) => new Intl.NumberFormat(window.STModuleUI?.locale() || 'ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const fmtDate = iso => /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? new Intl.DateTimeFormat(window.STModuleUI?.locale() || 'ru-RU').format(new Date(iso + 'T12:00:00')) : '';
  const parseNum = s => { const t = String(s || '').replace(/[\s ']/g, '').replace(',', '.'); return /^\d*\.?\d*$/.test(t) && t !== '' && t !== '.' ? +t : NaN; };
  const SORTS = {
    up: { name: 'Сильнее всего выросли', short: 'Рост', hint: 'Сверху — курс, который вырос сильнее всего', icon: 'trending-up' },
    down: { name: 'Сильнее всего упали', short: 'Падение', hint: 'Сверху — курс, который упал сильнее всего', icon: 'trending-down' }
  };
  const FAV = ['EUR', 'USD', 'GBP', 'CHF', 'TRY', 'PLN', 'CZK', 'HUF', 'RUB', 'JPY', 'AED', 'THB'];

  async function getText(url, ms) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms || 9000);
    try { const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' }); if (!r.ok) throw new Error('http ' + r.status); return await r.text(); }
    finally { clearTimeout(t); }
  }
  // CSV ЕЦБ: в описаниях встречаются кавычки и запятые
  function csvRows(text) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.length > 1);
  }

  // ---------- Источники курсов ----------
  // ЕЦБ: все валюты за последний день одним запросом → { date, r: { USD: { v: 1.0989, d: 4 } } }
  const ECB_LIST = ['USD', 'JPY', 'BGN', 'CZK', 'DKK', 'GBP', 'HUF', 'PLN', 'RON', 'SEK', 'CHF', 'ISK', 'NOK', 'TRY', 'AUD', 'BRL', 'CAD', 'CNY', 'HKD', 'IDR', 'ILS', 'INR', 'KRW', 'MXN', 'MYR', 'NZD', 'PHP', 'SGD', 'THB', 'ZAR'];
  const busy = {};
  const once = (k, f) => busy[k] || (busy[k] = f().finally(() => { delete busy[k]; }));
  function loadEcb(force) { return once('ecb' + !!force, () => loadEcb1(force)); }
  function loadCbr(force) { return once('cbr' + !!force, () => loadCbr1(force)); }
  async function loadEcb1(force) {
    const c = LS.get('st_fx_ecb2', null);
    if (!force && c && Date.now() - c.savedAt < 3 * HOUR) return c;
    try {
      // все валюты ЕЦБ одним запросом (запрос «все подряд» у ЕЦБ очень медленный)
      const url = 'https://data-api.ecb.europa.eu/service/data/EXR/D.' + ECB_LIST.join('+') + '.EUR.SP00.A?lastNObservations=2&format=csvdata';
      const rows = csvRows((await getText(url, 25000)).replace(/^\uFEFF/, ''));
      const h = rows[0], iC = h.indexOf('CURRENCY'), iT = h.indexOf('TIME_PERIOD'), iV = h.indexOf('OBS_VALUE'), iD = h.indexOf('DECIMALS');
      const list = rows.slice(1).map(x => ({ c: x[iC], t: x[iT], v: +x[iV], d: +x[iD] })).filter(x => /^[A-Z]{3}$/.test(x.c) && x.v > 0);
      const date = list.reduce((m, x) => x.t > m ? x.t : m, '');
      if (!date) throw new Error('ecb');
      const r = { EUR: { v: 1, d: 4, p: 1 } };
      // последний и предыдущий день публикации (для изменения за день)
      list.filter(x => x.t === date).forEach(x => {
        const prev = list.filter(y => y.c === x.c && y.t < date).sort((m, n) => n.t < m.t ? -1 : 1)[0];
        r[x.c] = { v: x.v, d: Number.isFinite(x.d) && x.d >= 0 && x.d <= 6 ? x.d : 4, p: prev ? prev.v : null };
      });
      const out = { date, r, savedAt: Date.now() }; LS.set('st_fx_ecb2', out); return out;
    } catch (e) { if (c) return Object.assign({ stale: true }, c); throw e; }
  }
  // ЦБ РФ: рублей за «номинал» единиц (100 JPY = 51,8246 ₽)
  async function loadCbr1(force) {
    const c = LS.get('st_fx_cbr2', null);
    if (!force && c && Date.now() - c.savedAt < 3 * HOUR) return c;
    try {
      const j = JSON.parse(await getText('https://www.cbr-xml-daily.ru/daily_json.js', 12000));
      const r = { RUB: { v: 1, n: 1, p: 1 } };
      Object.values(j.Valute || {}).forEach(x => { if (x.Value > 0 && x.Nominal > 0) r[x.CharCode] = { v: x.Value, n: x.Nominal, p: x.Previous > 0 ? x.Previous : null }; });
      const out = { date: String(j.Date || '').slice(0, 10), r, savedAt: Date.now() }; LS.set('st_fx_cbr2', out); return out;
    } catch (e) { if (c) return Object.assign({ stale: true }, c); throw e; }
  }
  // Прочие пары — как в калькуляторе расходов (национальные банки через Frankfurter)
  async function loadOther(a, b, force) {
    const k = 'st_fx_o_' + a + '_' + b, c = LS.get(k, null);
    if (!force && c && Date.now() - c.savedAt < 3 * HOUR) return c;
    try {
      if (!window.SplitawayFx || !window.SplitawayFx.requestLatestRate) throw new Error('fx');
      const res = await window.SplitawayFx.requestLatestRate(a, b, new AbortController().signal);
      const out = { rate: res.rate, date: res.asOf, source: res.source, savedAt: Date.now() }; LS.set(k, out); return out;
    } catch (e) { if (c) return Object.assign({ stale: true }, c); throw e; }
  }

  const BANK = { ECB: 'ЕЦБ', CBR: 'ЦБ РФ', NBU: 'НБУ', NBG: 'НБ Грузии', CBA: 'ЦБ Армении', CBAR: 'ЦБ Азербайджана', BOI: 'Банк Израиля', CBKKW: 'ЦБ Кувейта' };
  const bankOf = src => { const m = String(src || '').match(/^([A-Z]+) via Frankfurter/); return m ? BANK[m[1]] || m[1] : src === 'ECB' ? 'ЕЦБ' : 'Frankfurter'; };
  // Курс пары: rate — сколько b за 1 a; line — строка так, как её публикует источник;
  // per — «1 a = … b» с числом знаков, как у официального курса валюты b
  async function pair(a, b, force) {
    const p = await pair1(a, b, force);
    p.per = fmt(p.rate, p.d != null ? Math.max(p.d, p.rate < 1 ? 4 : 0) : 4) + ' ' + b;
    return p;
  }
  async function pair1(a, b, force) {
    if (a === b) return { rate: 1, line: '1 ' + a + ' = 1 ' + b, src: '', date: '', d: 0, bank: '' };
    let ecb = null; try { ecb = await loadEcb(force); } catch (_) {}
    if (ecb && ecb.r[a] && ecb.r[b]) {
      const A = ecb.r[a], B = ecb.r[b], rate = B.v / A.v;
      let line;
      if (a === 'EUR') line = '1 EUR = ' + fmt(B.v, B.d) + ' ' + b;
      else if (b === 'EUR') line = '1 EUR = ' + fmt(A.v, A.d) + ' ' + a;
      else line = rate >= 1 ? '1 ' + a + ' = ' + fmt(rate, B.d) + ' ' + b : '1 ' + b + ' = ' + fmt(1 / rate, A.d) + ' ' + a;
      const chg = A.p && B.p ? rate / (B.p / A.p) - 1 : null; // изменение курса «1 a = X b» с прошлой публикации
      return { rate, line, chg, d: B.d, bank: 'ЕЦБ', src: a === 'EUR' || b === 'EUR' ? 'Официальный курс ЕЦБ' : 'Кросс-курс по данным ЕЦБ', date: ecb.date, stale: ecb.stale, savedAt: ecb.savedAt };
    }
    if (a === 'RUB' || b === 'RUB') {
      let cbr = null; try { cbr = await loadCbr(force); } catch (_) {}
      const x = a === 'RUB' ? b : a, X = cbr && cbr.r[x];
      if (X) {
        const rubPer = X.v / X.n, rate = a === 'RUB' ? 1 / rubPer : rubPer;
        const prev = X.p ? (a === 'RUB' ? X.n / X.p : X.p / X.n) : null;
        return { rate, chg: prev ? rate / prev - 1 : null, line: X.n + ' ' + x + ' = ' + fmt(X.v, 4) + ' ₽', d: 4, bank: 'ЦБ РФ', src: 'Официальный курс ЦБ РФ', date: cbr.date, stale: cbr.stale, savedAt: cbr.savedAt };
      }
    }
    const o = await loadOther(a, b, force);
    const line = o.rate >= 1 ? '1 ' + a + ' = ' + fmt(o.rate, 4) + ' ' + b : '1 ' + b + ' = ' + fmt(1 / o.rate, 4) + ' ' + a;
    const bank = bankOf(o.source);
    return { rate: o.rate, line, d: 4, bank, src: bank === 'Frankfurter' ? 'Справочный курс Frankfurter' : 'Официальный курс ' + bank, date: o.date, stale: o.stale, savedAt: o.savedAt };
  }

  STHub.addStyles('currency', `
    [data-module="currency"]{--fx-grad:linear-gradient(150deg,#8F7BFF 0%,#6A4DF4 55%,#5B3FE6 100%);--fx-ac:#6A4DF4;--fx-soft:#EFECFF;--fx-line:rgba(110,100,170,.12)}
    [data-theme=dark] [data-module="currency"]{--fx-ac:#A898FF;--fx-soft:rgba(140,120,255,.16);--fx-line:rgba(255,255,255,.08)}
    [data-module="currency"] .mod-body{display:flex;flex-direction:column;gap:14px}
    .fx-card{background:var(--hub-card);border:1px solid var(--hub-card-b);border-radius:22px;box-shadow:var(--hub-shadow)}
    .fx-hero{background:var(--fx-grad);border-radius:26px;padding:14px;display:flex;flex-direction:column;gap:8px;position:relative;box-shadow:0 14px 30px rgba(106,77,244,.28)}
    .fx-box{background:var(--hub-card);border-radius:20px;padding:12px 14px 14px}
    .fx-box small{display:block;color:var(--t2);font-size:.8rem;font-weight:600;margin-bottom:4px}
    .fx-row{display:flex;align-items:center;gap:10px}
    .fx-row input,.fx-row output{flex:1;min-width:0;border:0;background:transparent;color:var(--text);font:inherit;font-size:2rem;font-weight:800;letter-spacing:-.02em;outline:none;padding:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .fx-row output{color:var(--fx-ac)}
    .fx-cur{display:flex;align-items:center;gap:6px;border:0;background:var(--fx-soft);color:var(--text);border-radius:14px;padding:9px 10px 9px 12px;font:inherit;font-weight:800;font-size:1rem;cursor:pointer;flex-shrink:0}
    .fx-fl{width:26px;height:26px;min-width:26px;max-width:26px;flex:0 0 26px!important;border-radius:50%;overflow:hidden;display:inline-flex!important;flex-direction:row!important;align-items:center;justify-content:center;background:var(--fx-line);box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)}
    .fx-fl img{width:100%;height:100%;object-fit:cover;display:block}
    .fx-fl:empty::before{content:attr(data-cc);font-size:.62rem;font-weight:800;color:var(--t2)}
    .fx-cur svg{width:18px;height:18px;color:var(--t2)}
    .fx-box .fx-nm{display:block;color:var(--t3,var(--t2));font-size:.76rem;margin-top:2px}
    .fx-swap{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:46px;height:46px;border-radius:50%;border:4px solid #7458F7;background:#fff;color:var(--fx-ac);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 14px rgba(40,20,120,.25);z-index:1}
    [data-theme=dark] .fx-swap{background:var(--hub-card)}
    .fx-swap svg{width:22px;height:22px;stroke-width:2.4}
    .fx-rate{display:flex;align-items:center;gap:12px;padding:12px 10px 12px 14px}
    .fx-rate>span{width:42px;height:42px;border-radius:14px;background:var(--fx-soft);color:var(--fx-ac);display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .fx-rate>span svg{width:22px;height:22px}
    .fx-rate div{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
    .fx-rate b{font-size:1.05rem;font-weight:800}
    .fx-rate small{color:var(--t2);font-size:.78rem}
    .fx-rate small.warn{color:#C2410C}
    .fx-ib{width:42px;height:42px;border:0;border-radius:14px;background:none;color:var(--fx-ac);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}
    .fx-ib svg{width:22px;height:22px}
    .fx-ib.spin svg{animation:fxspin .8s linear infinite}
    @keyframes fxspin{to{transform:rotate(360deg)}}
    .fx-chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:2px}
    .fx-chips::-webkit-scrollbar{display:none}
    .fx-chip{border:1px solid var(--hub-card-b);background:var(--hub-card);color:var(--text);border-radius:999px;padding:9px 16px;font:inherit;font-weight:700;font-size:.9rem;cursor:pointer;white-space:nowrap;box-shadow:var(--hub-shadow)}
    .fx-chip.on{background:var(--fx-ac);color:#fff;border-color:transparent}
    .fx-own{padding:4px 14px}
    .fx-own-h{display:flex;align-items:center;gap:12px;padding:10px 0;cursor:pointer}
    .fx-own-h span{flex:1;font-weight:700}
    .fx-own-h small{display:block;color:var(--t2);font-weight:500;font-size:.78rem}
    .fx-sw{width:46px;height:28px;border-radius:999px;background:var(--fx-line);position:relative;flex-shrink:0;transition:background .2s}
    .fx-sw::after{content:'';position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .2s}
    .fx-own.on .fx-sw{background:var(--fx-ac)}
    .fx-own.on .fx-sw::after{left:21px}
    .fx-own-b{display:none;align-items:center;gap:8px;padding:0 0 12px;font-weight:700}
    .fx-own.on .fx-own-b{display:flex}
    .fx-own-b input{flex:1;min-width:0;border:1px solid var(--hub-card-b);background:var(--fx-soft);border-radius:14px;padding:12px;font:inherit;font-size:16px;font-weight:700;color:var(--text);outline:none}
    .fx-h3{font-weight:800;font-size:1.15rem;margin:6px 2px -4px;display:flex;align-items:baseline;justify-content:space-between}
    .fx-h3 small{font-weight:600;font-size:.78rem;color:var(--t2)}
    .fx-lh{display:flex;align-items:center;gap:8px;margin:6px 2px -4px}
    .fx-lh>div{flex:1;min-width:0}
    .fx-lb{display:flex;align-items:center;gap:4px;border:0;background:none;padding:0;font:inherit;font-weight:800;font-size:1.15rem;color:var(--text);cursor:pointer}
    .fx-lb svg{width:18px;height:18px;color:var(--fx-ac)}
    .fx-lh small{color:var(--t2);font-size:.76rem;font-weight:600}
    .fx-tb{height:38px;border:1px solid var(--hub-card-b);background:var(--hub-card);color:var(--text);border-radius:12px;padding:0 11px;display:flex;align-items:center;gap:6px;font:inherit;font-weight:700;font-size:.82rem;cursor:pointer;box-shadow:var(--hub-shadow)}
    .fx-tb svg{width:17px;height:17px;color:var(--fx-ac)}
    .fx-chg{font-weight:700;font-style:normal}
    .fx-chg.up{color:#16A34A}.fx-chg.dn{color:#E5484D}.fx-chg.eq{color:var(--t2)}
    .fx-opt{display:flex;align-items:center;gap:12px;width:100%;border:0;background:none;font:inherit;color:var(--text);text-align:left;padding:13px 8px;cursor:pointer;border-bottom:1px solid var(--fx-line);font-weight:700}
    .fx-opt:last-child{border-bottom:0}
    .fx-opt svg{width:20px;height:20px;color:var(--fx-ac)}
    .fx-opt span{flex:1}
    .fx-opt small{display:block;color:var(--t2);font-weight:500;font-size:.78rem}
    .fx-ck{width:24px;height:24px;border-radius:8px;border:2px solid var(--fx-line);flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff}
    .fx-ck svg{width:16px;height:16px;stroke-width:3;color:#fff;opacity:0}
    .on>.fx-ck{background:var(--fx-ac);border-color:var(--fx-ac)}
    .on>.fx-ck svg{opacity:1}
    .fx-sel-bar{display:flex;gap:8px;margin-top:10px}
    .fx-sel-bar button{flex:1}
    .fx-list{padding:2px 6px}
    .fx-li{display:flex;align-items:center;gap:12px;width:100%;border:0;background:none;font:inherit;color:var(--text);text-align:left;padding:11px 8px;cursor:pointer;border-bottom:1px solid var(--fx-line)}
    .fx-li:last-child{border-bottom:0}
    .fx-li .fx-fl{width:32px;height:32px;min-width:32px;max-width:32px;flex:0 0 32px!important}
    .fx-li>span:not(.fx-fl):not(.fx-ck){flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
    .fx-li>span:not(.fx-fl):not(.fx-ck) b{font-weight:800}
    .fx-li>span:not(.fx-fl):not(.fx-ck) small{color:var(--t2);font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .fx-li em{font-style:normal;font-weight:800;text-align:right;white-space:nowrap}
    .fx-li em small{display:block;color:var(--t2);font-weight:500;font-size:.72rem}
    .fx-li.on{background:var(--fx-soft);border-radius:14px}
    .fx-note{color:var(--t2);font-size:.78rem;text-align:center;padding:0 10px 18px;line-height:1.4}
    .fx-search{display:flex;align-items:center;gap:10px;padding:0 12px;min-height:50px;border-radius:16px;background:var(--fx-soft);margin:4px 0 8px}
    .fx-search input{flex:1;border:0;background:transparent;font:inherit;font-size:16px;color:var(--text);outline:none;min-height:48px}
    .fx-pick{max-height:min(60vh,520px);overflow-y:auto;margin:0 -6px}
  `);

  STHub.registerService('currency', ctx => {
    const tripCur = (ctx.trip && ctx.trip.currency) || (typeof getCurrency === 'function' && getCurrency()) || 'EUR';
    const second = ctx.trip && ctx.trip.secondaryCurrency;
    const saved = ctx.store.get('pair', null);
    let a = saved && saved.a || tripCur;
    let b = saved && saved.b || (second && second !== a ? second : a === 'EUR' ? 'USD' : 'EUR');
    if (a === b) b = a === 'EUR' ? 'USD' : 'EUR';
    let amount = '';
    // Список курсов внизу не зависит от верхнего калькулятора: своя базовая валюта
    let lb = ctx.store.get('listBase', tripCur); // поле суммы пустое — пользователь вводит сам
    let sel = ctx.store.get('list', null);
    if (!Array.isArray(sel) || !sel.length) sel = [...new Set([second, tripCur, ...FAV].filter(Boolean))].slice(0, 10);
    let sort = ctx.store.get('sort', 'up'); if (!SORTS[sort]) sort = 'up';
    let own = { on: false, v: '' }; // свой курс — пустой, пользователь вводит сам
    let cur = null, err = '', loading = false, seq = 0;

    const openSheet = (title, html, bind) => {
      document.getElementById('fx-sheet')?.remove();
      const ov = document.createElement('div'); ov.className = 'ov open'; ov.id = 'fx-sheet';
      ov.innerHTML = `<div class="mdl"><div class="mdl-handle"></div><div class="mdl-title">${esc(title)}</div>${html}</div>`;
      const close = () => { ov.remove(); document.body.style.overflow = ''; };
      ov.addEventListener('click', e => { if (e.target === ov) close(); });
      (document.getElementById('pg-module') || document.body).appendChild(ov);
      document.body.style.overflow = 'hidden';
      if (typeof initializeIcons === 'function') initializeIcons(ov);
      bind(ov.firstChild, close);
    };
    const pickSheet = side => {
      document.getElementById('fx-sheet')?.remove();
      const ov = document.createElement('div'); ov.className = 'ov open'; ov.id = 'fx-sheet';
      const codes = ALL();
      const row = c => `<button class="fx-li${c === (side === 'a' ? a : side === 'list' ? lb : b) ? ' on' : ''}" type="button" data-c="${c}">${flag(c)}<span><b>${c}</b><small>${esc(nameOf(c))}</small></span></button>`;
      ov.innerHTML = `<div class="mdl"><div class="mdl-handle"></div><div class="mdl-title">${side === 'a' ? 'Из валюты' : side === 'list' ? 'Курсы относительно' : 'В валюту'}</div>
        <div class="fx-search"><i data-lucide="search"></i><input id="fx-q" placeholder="Код или название" autocomplete="off"></div>
        <div class="fx-pick" id="fx-pl">${codes.map(row).join('')}</div></div>`;
      const close = () => { ov.remove(); document.body.style.overflow = ''; };
      ov.addEventListener('click', e => { if (e.target === ov) close(); });
      (document.getElementById('pg-module') || document.body).appendChild(ov);
      document.body.style.overflow = 'hidden';
      if (typeof initializeIcons === 'function') initializeIcons(ov);
      const pl = ov.querySelector('#fx-pl');
      ov.querySelector('#fx-q').addEventListener('input', e => {
        const q = e.target.value.trim().toLowerCase();
        pl.querySelectorAll('[data-c]').forEach(x => { x.style.display = !q || x.dataset.c.toLowerCase().includes(q) || nameOf(x.dataset.c).toLowerCase().includes(q) ? '' : 'none'; });
      });
      pl.addEventListener('click', e => {
        const x = e.target.closest('[data-c]'); if (!x) return;
        const c = x.dataset.c;
        if (side === 'list') { lb = c; ctx.store.set('listBase', lb); close(); screen.refresh(); return; }
        if (side === 'a') { if (c === b) b = a; a = c; } else { if (c === a) a = b; b = c; }
        close(); savePair(); screen.refresh();
      });
    };
    const savePair = () => { ctx.store.set('pair', { a, b }); own = { on: own.on, v: '' }; ctx.store.set('own', own); };

    const screen = ctx.openScreen({
      title: 'Валюты',
      render(body) {
        body.innerHTML = `
          <div class="fx-hero">
            <div class="fx-box"><small>Сумма</small>
              <div class="fx-row"><input id="fx-amt" inputmode="decimal" autocomplete="off" maxlength="16" value="${esc(amount)}" placeholder="0" aria-label="Сумма">
                <button class="fx-cur" type="button" data-pick="a">${flag(a)}${a}<i data-lucide="chevron-down"></i></button></div>
              <span class="fx-nm">${esc(nameOf(a))}</span></div>
            <button class="fx-swap" type="button" data-a="swap" aria-label="Поменять местами"><i data-lucide="arrow-down-up"></i></button>
            <div class="fx-box"><small>Получится</small>
              <div class="fx-row"><output id="fx-res">…</output>
                <button class="fx-cur" type="button" data-pick="b">${flag(b)}${b}<i data-lucide="chevron-down"></i></button></div>
              <span class="fx-nm">${esc(nameOf(b))}</span></div>
          </div>
          <div class="fx-chips">${[10, 50, 100, 500, 1000, 5000].map(n => `<button class="fx-chip" type="button" data-n="${n}">${fmt(n, 0)} ${a}</button>`).join('')}</div>
          <div class="fx-card fx-rate"><span><i data-lucide="trending-up"></i></span>
            <div><b id="fx-line">Загружаю курс…</b><small id="fx-src"></small></div>
            <button class="fx-ib" type="button" data-a="refresh" aria-label="Обновить курс"><i data-lucide="refresh-cw"></i></button></div>
          <div class="fx-card fx-own${own.on ? ' on' : ''}">
            <div class="fx-own-h" data-a="own"><span>Свой курс<small>Курс банка или обменника</small></span><div class="fx-sw"></div></div>
            <div class="fx-own-b">1 ${a} =<input id="fx-own" inputmode="decimal" autocomplete="off" maxlength="16" value="${esc(own.v)}" placeholder="0,00">${b}</div>
          </div>
          <div class="fx-lh"><div><button class="fx-lb" type="button" data-pick="list">1 ${lb} ${esc(window.STModuleUI.translate('сегодня'))}<i data-lucide="chevron-down"></i></button><small id="fx-ldate"></small></div>
            <button class="fx-tb" type="button" data-a="sort" aria-label="Сортировка"><i data-lucide="arrow-down-up"></i><span id="fx-sortl">${SORTS[sort].short}</span></button>
            <button class="fx-tb" type="button" data-a="filter" aria-label="Выбрать валюты"><i data-lucide="sliders-horizontal"></i>${sel.length}</button></div>
          <div class="fx-card fx-list" id="fx-list"><div class="fx-note" style="padding:16px">Загружаю…</div></div>
          <div class="fx-note">Официальные справочные курсы ЕЦБ и центральных банков. В банке или обменнике курс может отличаться — для этого есть «Свой курс».</div>`;
        const amt = body.querySelector('#fx-amt'), res = body.querySelector('#fx-res'), ownIn = body.querySelector('#fx-own');

        const calc = () => {
          const v = parseNum(amt.value), r = own.on && parseNum(ownIn.value) > 0 ? parseNum(ownIn.value) : cur && cur.rate;
          body.querySelectorAll('[data-n]').forEach(x => x.classList.toggle('on', +x.dataset.n === v));
          if (!(v >= 0) || amt.value.trim() === '') { res.textContent = fmt(0, minor(b)); return; }
          if (!r) { res.textContent = err ? '—' : '…'; return; }
          const d = minor(b), out = Math.round(v * r * 10 ** d) / 10 ** d;
          res.textContent = fmt(out, d);
        };
        const showRate = () => {
          const line = body.querySelector('#fx-line'), src = body.querySelector('#fx-src');
          if (cur) {
            line.textContent = cur.line;
            const when = cur.date ? ' · ' + fmtDate(cur.date) : '';
            src.textContent = (cur.stale ? 'Нет связи — сохранённый курс. ' : '') + cur.src + when;
            src.classList.toggle('warn', !!cur.stale);
          } else if (err) { line.textContent = 'Курс не получен'; src.textContent = 'Проверьте интернет или введите свой курс'; src.classList.add('warn'); }
          calc();
        };
        const load = async force => {
          const my = ++seq; loading = true; err = '';
          body.querySelector('[data-a="refresh"]').classList.add('spin');
          try { const p = await pair(a, b, force); if (my !== seq) return; cur = p; }
          catch (_) { if (my !== seq) return; cur = null; err = 'нет курса'; }
          loading = false;
          if (!body.isConnected) return;
          body.querySelector('[data-a="refresh"]').classList.remove('spin');
          showRate(); list(force);
          if (force && cur && !cur.stale) ctx.toast('Курс обновлён');
        };
        // Курсы к выбранной валюте: избранные + валюта поездки
        const list = async () => {
          const box = body.querySelector('#fx-list'); if (!box) return;
          const codes = sel.slice();
          if (!codes.length) { box.innerHTML = '<div class="fx-note" style="padding:16px">Выберите валюты в фильтре</div>'; return; }
          const rows = await Promise.all(codes.map(c => (c === lb ? Promise.resolve(null) : pair(lb, c)).then(p => ({ c, p }), () => ({ c, p: null }))));
          if (!box.isConnected) return;
          const ok = rows; // все выбранные: базовая валюта и валюты без курса тоже видны
          const dates = ok.filter(x => x.p).map(x => x.p.date).filter(Boolean).sort();
          body.querySelector('#fx-ldate').textContent = (dates.length ? 'на ' + fmtDate(dates[dates.length - 1]) : '') + (sort === 'up' || sort === 'down' ? ' · изменение курса с прошлой публикации' : '');
          const ch = x => !x.p || x.p.chg == null ? null : x.p.chg;
          if (sort === 'up' || sort === 'down') ok.sort((m, n) => (ch(m) == null) - (ch(n) == null) || (sort === 'up' ? ch(n) - ch(m) : ch(m) - ch(n)));
          const chTxt = v => { if (v == null) return '<i class="fx-chg eq">—</i>'; const pc = v * 100, r = Math.round(pc * 100) / 100;
            return r === 0 ? '<i class="fx-chg eq">0,00 %</i>' : `<i class="fx-chg ${r > 0 ? 'up' : 'dn'}">${r > 0 ? '▲' : '▼'} ${fmt(Math.abs(r), 2)} %</i>`; };
          const right = x => x.c === lb ? `1 ${lb}<small>базовая валюта</small>` : x.p ? `${esc(x.p.per)}<small>${chTxt(ch(x))} · ${esc(x.p.bank)}</small>` : '—<small>нет курса</small>';
          box.innerHTML = ok.map(x => `<button class="fx-li${x.c === b ? ' on' : ''}" type="button" data-c="${x.c}">${flag(x.c)}
              <span><b>${x.c}</b><small>${esc(nameOf(x.c))}</small></span><em>${right(x)}</em></button>`).join('');
        };

        amt.addEventListener('input', () => { amount = amt.value; calc(); });
        amt.addEventListener('focus', () => amt.select());
        body.querySelectorAll('[data-pick]').forEach(x => x.addEventListener('click', () => pickSheet(x.dataset.pick)));
        body.querySelector('[data-a="swap"]').addEventListener('click', () => { [a, b] = [b, a]; savePair(); screen.refresh(); });
        body.querySelector('[data-a="refresh"]').addEventListener('click', () => { if (!loading) load(true); });
        body.querySelector('[data-a="sort"]').addEventListener('click', () => openSheet('Сортировка', `<div style="margin-top:6px">${Object.entries(SORTS).map(([k, o]) =>
            `<button class="fx-opt${k === sort ? ' on' : ''}" type="button" data-s="${k}"><i data-lucide="${o.icon}"></i><span>${o.name}<small>${o.hint}</small></span><span class="fx-ck" style="flex:0 0 24px;border-radius:50%"><i data-lucide="check"></i></span></button>`).join('')}</div>`,
          (root, close) => root.querySelectorAll('[data-s]').forEach(x => x.addEventListener('click', () => {
            sort = x.dataset.s; ctx.store.set('sort', sort); close();
            body.querySelector('#fx-sortl').textContent = SORTS[sort].short; list();
          }))));
        body.querySelector('[data-a="filter"]').addEventListener('click', () => {
          let pick = sel.slice();
          const codes = [...pick, ...ALL().filter(c => !pick.includes(c))];
          openSheet('Валюты в списке', `<div class="fx-search"><i data-lucide="search"></i><input id="fx-fq" placeholder="Код или название" autocomplete="off"></div>
              <div class="fx-pick" id="fx-fl">${codes.map(c => `<button class="fx-li${pick.includes(c) ? ' on' : ''}" type="button" data-f="${c}">${flag(c)}<span><b>${c}</b><small>${esc(nameOf(c))}</small></span><span class="fx-ck" style="flex:0 0 24px"><i data-lucide="check"></i></span></button>`).join('')}</div>
              <div class="fx-sel-bar"><button class="st-btn st-btn-g" type="button" data-a="none">Снять все</button><button class="st-btn" type="button" data-a="ok">Готово · <span id="fx-cnt">${pick.length}</span></button></div>`,
            (root, close) => {
              const fl = root.querySelector('#fx-fl'), cnt = root.querySelector('#fx-cnt');
              root.querySelector('#fx-fq').addEventListener('input', e => { const q = e.target.value.trim().toLowerCase();
                fl.querySelectorAll('[data-f]').forEach(x => { x.style.display = !q || x.dataset.f.toLowerCase().includes(q) || nameOf(x.dataset.f).toLowerCase().includes(q) ? '' : 'none'; }); });
              fl.addEventListener('click', e => { const x = e.target.closest('[data-f]'); if (!x) return; const c = x.dataset.f;
                pick = pick.includes(c) ? pick.filter(y => y !== c) : [...pick, c]; x.classList.toggle('on', pick.includes(c)); cnt.textContent = pick.length; });
              root.querySelector('[data-a="none"]').addEventListener('click', () => { pick = []; fl.querySelectorAll('.on').forEach(x => x.classList.remove('on')); cnt.textContent = 0; });
              root.querySelector('[data-a="ok"]').addEventListener('click', () => {
                if (!pick.length) { ctx.toast('Выберите хотя бы одну валюту'); return; }
                sel = pick; ctx.store.set('list', sel); close(); screen.refresh();
              });
            });
        });
        body.querySelectorAll('[data-n]').forEach(x => x.addEventListener('click', () => { amt.value = x.dataset.n; amount = amt.value; calc(); }));
        body.querySelector('[data-a="own"]').addEventListener('click', () => {
          own.on = !own.on; ctx.store.set('own', own);
          body.querySelector('.fx-own').classList.toggle('on', own.on);
          if (own.on) ownIn.focus();
          calc();
        });
        ownIn.addEventListener('input', () => { own.v = ownIn.value; ctx.store.set('own', own); calc(); });
        body.querySelector('#fx-list').addEventListener('click', e => {
          const x = e.target.closest('[data-c]'); if (!x) return;
          if (x.dataset.c === lb) return;
          a = lb; b = x.dataset.c; savePair(); // посчитать эту пару в калькуляторе сверху screen.refresh(); window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        load(false);
      }
    });
  });
})();
