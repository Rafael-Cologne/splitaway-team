// Standalone calculator. It does not mutate a trip or an expense: a database
// migration is required before original amounts and rates can be saved safely.
(function () {
  'use strict';

  const copy = {
    ru: ['Калькулятор валют', 'Сумма', 'Из валюты', 'В валюту', 'Последний опубликованный курс', 'Курс вручную', '1 единица исходной валюты =', 'Получить курс', 'Дата курса', 'Не удалось получить курс. Введите курс вручную.', '', 'Справочный курс может отличаться от курса банка или обменника. Проверьте его перед оплатой либо введите свой курс.', 'Закрыть', 'Открыть калькулятор валют', 'Не удалось обновить: показан последний сохранённый курс'],
    en: ['Currency calculator', 'Amount', 'From currency', 'To currency', 'Latest published rate', 'Manual rate', '1 source currency unit =', 'Get rate', 'Rate date', 'Rate unavailable. Enter a manual rate.', '', 'Reference rates may differ from your bank or exchange office. Check before paying or enter your own rate.', 'Close', 'Open currency calculator', 'Could not refresh: showing the last saved rate'],
    de: ['Währungsrechner', 'Betrag', 'Von Währung', 'In Währung', 'Letzter veröffentlichter Kurs', 'Manueller Kurs', '1 Einheit der Ausgangswährung =', 'Kurs abrufen', 'Kursdatum', 'Kurs nicht verfügbar. Bitte manuell eingeben.', '', 'Referenzkurse können von Bank oder Wechselstube abweichen. Vor dem Bezahlen prüfen oder eigenen Kurs eingeben.', 'Schließen', 'Währungsrechner öffnen', 'Aktualisierung fehlgeschlagen: letzter gespeicherter Kurs'],
    es: ['Conversor de divisas', 'Importe', 'Moneda de origen', 'Moneda de destino', 'Último tipo de cambio publicado', 'Tipo de cambio manual', '1 unidad de la moneda de origen =', 'Consultar tipo de cambio', 'Fecha del tipo de cambio', 'Tipo de cambio no disponible. Introdúcelo manualmente.', '', 'El tipo de cambio de referencia puede diferir del de tu banco o casa de cambio. Compruébalo antes de pagar o introduce tu propio tipo.', 'Cerrar', 'Abrir conversor de divisas', 'No se pudo actualizar: se muestra el último tipo de cambio guardado'],
    fr: ['Convertisseur de devises', 'Montant', 'Devise source', 'Devise cible', 'Dernier taux publié', 'Taux manuel', '1 unité source =', 'Obtenir le taux', 'Date du taux', 'Taux indisponible. Saisissez-le manuellement.', '', 'Le taux indicatif peut différer de celui de votre banque ou bureau de change. Vérifiez avant de payer ou saisissez votre propre taux.', 'Fermer', 'Ouvrir le convertisseur', 'Actualisation impossible : dernier taux enregistré'],
    pt: ['Conversor de moedas', 'Montante', 'Moeda de origem', 'Moeda de destino', 'Última taxa de câmbio publicada', 'Taxa de câmbio manual', '1 unidade da moeda de origem =', 'Obter taxa de câmbio', 'Data da taxa de câmbio', 'Taxa de câmbio indisponível. Introduza uma taxa manualmente.', '', 'A taxa de câmbio indicativa pode diferir da do banco ou casa de câmbio. Verifique-a antes de pagar ou introduza a sua própria taxa.', 'Fechar', 'Abrir conversor de moedas', 'Não foi possível atualizar: é apresentada a última taxa guardada'],
    it: ['Convertitore di valute', 'Importo', 'Valuta di partenza', 'Valuta di arrivo', 'Ultimo tasso di cambio pubblicato', 'Tasso di cambio manuale', '1 unità della valuta di partenza =', 'Ottieni il tasso di cambio', 'Data del tasso di cambio', 'Tasso di cambio non disponibile. Inseriscilo manualmente.', '', 'Il tasso di cambio indicativo può differire da quello della banca o dell’ufficio di cambio. Verificalo prima di pagare o inserisci il tuo tasso.', 'Chiudi', 'Apri convertitore di valute', 'Aggiornamento non riuscito: viene mostrato l’ultimo tasso di cambio salvato'],
    pl: ['Kalkulator walut', 'Kwota', 'Waluta źródłowa', 'Waluta docelowa', 'Ostatni opublikowany kurs', 'Kurs ręczny', '1 jednostka waluty źródłowej =', 'Pobierz kurs', 'Data kursu', 'Kurs niedostępny. Wprowadź go ręcznie.', '', 'Kurs orientacyjny może różnić się od kursu banku lub kantoru. Sprawdź go przed płatnością albo wpisz własny kurs.', 'Zamknij', 'Otwórz kalkulator walut', 'Nie udało się odświeżyć: pokazano ostatni zapisany kurs'],
    el: ['Υπολογιστής νομισμάτων', 'Ποσό', 'Νόμισμα προέλευσης', 'Νόμισμα προορισμού', 'Τελευταία δημοσιευμένη ισοτιμία', 'Χειροκίνητη ισοτιμία', '1 μονάδα αρχικού νομίσματος =', 'Λήψη ισοτιμίας', 'Ημερομηνία ισοτιμίας', 'Η ισοτιμία δεν είναι διαθέσιμη. Εισαγάγετέ την χειροκίνητα.', '', 'Η ενδεικτική ισοτιμία μπορεί να διαφέρει από εκείνη της τράπεζας ή του ανταλλακτηρίου. Ελέγξτε την πριν πληρώσετε ή εισαγάγετε δική σας.', 'Κλείσιμο', 'Άνοιγμα υπολογιστή νομισμάτων', 'Η ανανέωση απέτυχε: εμφανίζεται η τελευταία αποθηκευμένη ισοτιμία'],
    tr: ['Döviz hesaplayıcı', 'Tutar', 'Kaynak para birimi', 'Hedef para birimi', 'Son yayımlanan kur', 'Manuel kur', '1 kaynak para birimi =', 'Kuru al', 'Kur tarihi', 'Kur alınamadı. Manuel bir kur girin.', '', 'Referans kur bankanızın veya döviz bürosunun kurundan farklı olabilir. Ödeme yapmadan önce kontrol edin veya kendi kurunuzu girin.', 'Kapat', 'Döviz hesaplayıcıyı aç', 'Yenilenemedi: son kayıtlı kur gösteriliyor']
  };
  const fixedRateLabel = { ru:'ЕЦБ · фиксированный курс перехода на евро', en:'ECB · fixed euro conversion rate',
    de:'EZB · fester Euro-Umrechnungskurs', es:'BCE · tipo fijo de conversión al euro',
    fr:'BCE · taux fixe de conversion à l’euro', pt:'BCE · taxa fixa de conversão para o euro',
    it:'BCE · tasso fisso di conversione in euro', pl:'EBC · stały kurs wymiany na euro',
    el:'ΕΚΤ · σταθερή ισοτιμία μετατροπής σε ευρώ', tr:'ECB · sabit avro dönüşüm kuru' };
  function displaySource(source, lang) {
    if (source === 'ECB fixed conversion') return fixedRateLabel[lang] || fixedRateLabel.en;
    return typeof rateSourceName === 'function' ? rateSourceName(source) : source.replaceAll(' via Frankfurter', ' · Frankfurter');
  }

  function currencyDigits(code) {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits;
  }

  function displayRate(value, lang) {
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate <= 0) return '';
    // 1.0.25: small rates keep 4 significant digits (1 JPY = 0,005652 EUR, not 0,01)
    if (rate < 1) return new Intl.NumberFormat(lang, { maximumSignificantDigits: 4 }).format(rate);
    return new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(rate);
  }

  function decimalParts(value, maxFraction) {
    const raw = String(value).trim().replace(',', '.');
    const match = raw.match(/^(\d{1,9})(?:\.(\d{1,12}))?$/);
    if (!match || (match[2] || '').length > maxFraction) return null;
    return { units: BigInt(match[1] + (match[2] || '').padEnd(maxFraction, '0')), scale: maxFraction };
  }

  function convertMinor(amount, rate, source, target) {
    const sourceDigits = currencyDigits(source);
    const targetDigits = Math.max(2, currencyDigits(target));
    const a = decimalParts(amount, sourceDigits);
    const r = decimalParts(rate, 12);
    if (!a || !r || a.units <= 0n || r.units <= 0n) return null;
    const numerator = a.units * r.units * 10n ** BigInt(targetDigits);
    const denominator = 10n ** BigInt(sourceDigits + r.scale);
    const minor = (numerator * 2n + denominator) / (denominator * 2n);
    if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return { minor: Number(minor), digits: targetDigits };
  }

  async function fetchBounded(url, signal, accept) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal.aborted) throw new Error('cancelled');
    signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, 5500);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store', headers: { Accept: accept } });
      const body = await response.text();
      return { response, body };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
    }
  }

  async function ecbPerEuro(code, signal) {
    if (code === 'EUR') return { value: 1, date: null };
    const url = 'https://data-api.ecb.europa.eu/service/data/EXR/D.' + encodeURIComponent(code) +
      '.EUR.SP00.A?lastNObservations=1&format=csvdata';
    const { response, body } = await fetchBounded(url, signal, 'text/csv');
    if (!response.ok || !(response.headers.get('content-type') || '').toLowerCase().includes('csv')) throw new Error('ecb_unavailable');
    const lines = body.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    if (lines.length < 2) throw new Error('ecb_empty');
    const columns = lines[0].split(',');
    const values = lines[1].split(',');
    const date = values[columns.indexOf('TIME_PERIOD')];
    const value = Number(values[columns.indexOf('OBS_VALUE')]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(value) || value <= 0) throw new Error('ecb_invalid');
    return { value, date };
  }

  const ECB_ACTIVE = new Set([
    'EUR', 'USD', 'GBP', 'CHF', 'CZK', 'PLN', 'HUF', 'SEK', 'NOK', 'DKK',
    'RON', 'TRY', 'THB', 'JPY', 'CNY', 'KRW', 'AUD', 'CAD', 'MXN', 'BRL',
    'IDR', 'INR', 'MYR', 'SGD'
  ]);
  const NATIONAL_PROVIDER = { RUB:'cbr', RSD:'cbr', AED:'cbr', UAH:'nbu', GEL:'nbg', AMD:'cba', AZN:'cbar', ILS:'boi',
    PKR:'cbkkw', SAR:'cbkkw', QAR:'cbkkw', KWD:'cbkkw', BHD:'cbkkw', OMR:'cbkkw', JOD:'cbkkw', EGP:'cbkkw',
    BDT:'cbkkw', LKR:'cbkkw', NPR:'cbkkw', PHP:'cbkkw', VND:'cbkkw', HKD:'cbkkw', TWD:'cbkkw', ZAR:'cbkkw',
    MAD:'cbkkw', TND:'cbkkw', KZT:'cbkkw', UZS:'cbkkw', NZD:'cbkkw', ARS:'cbkkw', CLP:'cbkkw' };
  function recentRateDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const parsed = new Date(value + 'T00:00:00Z');
    const age = Date.now() - parsed.getTime();
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value &&
      age >= 0 && age < 6 * 86400000;
  }
  function acceptableRateDate(value, source) {
    return recentRateDate(value) ||
      (source === 'ECB fixed conversion' && ['2023-01-01', '2026-01-01'].includes(value));
  }
  function trustedSource(source) {
    return source === 'ECB' || source === 'CBR' || source === 'ECB fixed conversion' ||
      source === 'Frankfurter' ||
      (typeof source === 'string' && source.split(' + ').every(part =>
        /^(ECB|CBR|NBU|NBG|CBA|CBAR|CBKKW|BOI) via Frankfurter$/.test(part)));
  }

  async function requestLatestRate(base, quote, signal) {
    // ECB publishes currency units per EUR. Convert via EUR so both directions
    // and non-EUR pairs use the same official reference observations.
    if (ECB_ACTIVE.has(base) && ECB_ACTIVE.has(quote)) {
      try {
        const [from, to] = await Promise.all([ecbPerEuro(base, signal), ecbPerEuro(quote, signal)]);
        const dates = [from.date, to.date].filter(Boolean);
        if (dates.length && dates.every(recentRateDate) && (dates.length < 2 || dates[0] === dates[1])) {
          return { rate: Number((to.value / from.value).toFixed(12)), asOf: dates[0], source: 'ECB' };
        }
      } catch (_) {
        if (signal.aborted) throw _;
      }
    }
    const localShell = typeof location !== 'undefined' &&
      (location.hostname === 'localhost' || location.protocol === 'capacitor:');
    const params = '?base=' + encodeURIComponent(base) + '&quote=' + encodeURIComponent(quote);
    const provider = NATIONAL_PROVIDER[base] || NATIONAL_PROVIDER[quote] || 'ecb';
    const urls = [
      { url: (localShell ? TEAM_APP_URL : '') + '/api/fx/rate' + params, fallbackSource: null },
      { url: 'https://api.frankfurter.dev/v2/rate/' + encodeURIComponent(base) + '/' + encodeURIComponent(quote) + '?providers=' + provider,
        fallbackSource: provider.toUpperCase() + ' via Frankfurter' },
      { url: 'https://api.frankfurter.dev/v2/rate/' + encodeURIComponent(base) + '/' + encodeURIComponent(quote),
        fallbackSource: 'Frankfurter' }
    ];
    for (const entry of urls) {
      try {
        const { response, body } = await fetchBounded(entry.url, signal, 'application/json');
        if (!response.ok || !(response.headers.get('content-type') || '').toLowerCase().includes('json')) continue;
        const data = JSON.parse(body);
        const asOf = data.asOf || data.date;
        if (data.base === base && data.quote === quote && Number.isFinite(data.rate) && data.rate > 0 &&
            trustedSource(entry.fallbackSource || data.source) &&
            acceptableRateDate(asOf, entry.fallbackSource || data.source))
          return { rate: data.rate, asOf, source: entry.fallbackSource || data.source || 'Official reference' };
      } catch (_) {
        if (signal.aborted) throw _;
      }
    }
    throw new Error('rate_unavailable');
  }

  function cacheRate(base, quote, data) {
    try {
      localStorage.setItem('sw_fx_rate_' + base + '_' + quote, JSON.stringify({ ...data, savedAt: Date.now() }));
    } catch (_) { /* Device storage may be unavailable. */ }
  }
  function readCachedRate(base, quote) {
    try {
      const data = JSON.parse(localStorage.getItem('sw_fx_rate_' + base + '_' + quote) || 'null');
      if (data && Number.isFinite(data.rate) && data.rate > 0 && acceptableRateDate(data.asOf, data.source) &&
          trustedSource(data.source) && Number.isFinite(data.savedAt) &&
          Date.now() - data.savedAt >= 0 && Date.now() - data.savedAt < 7 * 86400000) return data;
    } catch (_) { /* No saved rate. */ }
    return null;
  }

  function tripPreferenceKey(name) {
    const tripId = typeof S !== 'undefined' && S.trip?.id;
    return tripId ? 'sw_fx_' + name + '_' + tripId : null;
  }

  // b37: калькулятор работает только для поездки с двумя валютами (основная + дополнительная)
  function hasPair() {
    if (typeof S === 'undefined' || !S.trip || !S.trip.secondaryCurrency) return false;
    const base = S.trip.currency || (typeof getCurrency === 'function' ? getCurrency() : null);
    return S.trip.secondaryCurrency !== base;
  }
  function syncVisibility() {
    const toggle = document.getElementById('fx-fab-toggle');
    const quick = document.getElementById('fx-fab-btn');
    const ok = hasPair();
    const openBtn = document.getElementById('fx-open-btn');
    if (openBtn) { openBtn.disabled = !ok; openBtn.style.opacity = ok ? '' : '.5'; }
    if (!toggle || !quick) return;
    const key = tripPreferenceKey('fab_visible');
    let visible = false;
    try { visible = !!key && localStorage.getItem(key) === '1'; } catch (_) { /* Default stays off. */ }
    visible = visible && ok;
    toggle.disabled = !ok;
    if (toggle.parentElement) toggle.parentElement.style.opacity = ok ? '' : '.5';
    toggle.checked = visible;
    quick.style.display = visible ? 'flex' : 'none';
  }

  let currentCalculator = null;
  let detachResume = () => {};
  // невидимое поле, которое существует всегда: фокус на нём в момент нажатия открывает цифровую клавиатуру
  function keyboardProxy() {
    let p = document.getElementById('fx-kb-proxy');
    if (!p) {
      p = document.createElement('input'); p.id = 'fx-kb-proxy'; p.type = 'text'; p.inputMode = 'decimal';
      p.setAttribute('aria-hidden', 'true'); p.tabIndex = -1; p.autocomplete = 'off';
      p.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0;padding:0;font-size:16px;z-index:-1;pointer-events:none';
      document.body.appendChild(p);
    }
    return p;
  }
  function openCalculator() {
    if (!hasPair()) {
      try { keyboardProxy().blur(); } catch (_) {}
      if (typeof toast === 'function' && typeof t === 'function') toast(t('fx_need_secondary'));
      syncVisibility();
      return;
    }
    try { keyboardProxy().focus({ preventScroll: true }); } catch (_) {}
    if (currentCalculator) { try { currentCalculator.close(); } catch (_) {} currentCalculator = null; }
    document.getElementById('fx-calculator-modal')?.remove();
    const lang = (typeof getLang === 'function' ? getLang() : 'ru').slice(0, 2);
    const c = copy[lang] || copy.en;
    const overlay = document.createElement('div');
    overlay.id = 'fx-calculator-modal'; overlay.className = 'ov open';
    overlay.style.alignItems = 'flex-start';
    overlay.style.overflowY = 'hidden';
    overlay.style.paddingTop = 'calc(var(--st) + 12px)';
    overlay.style.paddingBottom = '12px';
    const modal = document.createElement('div'); modal.className = 'mdl';
    modal.style.maxHeight = '100%'; modal.style.overflow = 'hidden';
    modal.style.padding = '12px'; modal.style.gap = '10px';
    modal.style.borderRadius = 'var(--r)';
    const content = document.createElement('div');
    content.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-height:0;overflow:visible';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-label', c[0]);
    const title = document.createElement('h2'); title.textContent = c[0];
    title.style.cssText = 'font-size:20px;line-height:1.2;margin:0;flex-shrink:0';
    const close = document.createElement('button'); close.type = 'button'; close.className = 'btn btn-g btn-fw'; close.textContent = c[12];
    close.style.flexShrink = '0'; close.style.minHeight = '44px';
    const head = document.createElement('div'); head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex-shrink:0';
    const xClose = document.createElement('button'); xClose.type = 'button'; xClose.className = 'btn btn-g btn-sm'; xClose.textContent = '✕';
    xClose.setAttribute('aria-label', c[12]); xClose.style.cssText = 'min-width:44px;min-height:44px;font-size:18px;padding:0';
    head.append(title, xClose);
    modal.append(head, content, close);
    const amount = document.createElement('input'); amount.className = 'inp'; amount.inputMode = 'decimal';
    amount.id = 'fx-amount'; amount.maxLength = 32;
    const amountKey = tripPreferenceKey('last_amount');
    try { amount.value = amountKey ? (localStorage.getItem(amountKey) || '').slice(0, 32) : ''; } catch (_) { amount.value = ''; }
    const amountWrap = document.createElement('div'); amountWrap.style.position = 'relative';
    amount.style.paddingRight = '52px';
    const clearAmount = document.createElement('button'); clearAmount.type = 'button'; clearAmount.textContent = '×';
    clearAmount.setAttribute('aria-label', ({ru:'Очистить сумму',en:'Clear amount',de:'Betrag löschen',es:'Borrar importe',fr:'Effacer le montant',pt:'Limpar valor',it:'Cancella importo',pl:'Wyczyść kwotę',el:'Εκκαθάριση ποσού',tr:'Tutarı temizle'})[lang] || 'Clear amount');
    clearAmount.style.cssText = 'position:absolute;right:4px;top:50%;transform:translateY(-50%);width:44px;height:44px;border:0;background:transparent;color:var(--t2);font-size:26px;cursor:pointer';
    const amountCur = document.createElement('span');
    amountCur.style.cssText = 'position:absolute;right:48px;top:50%;transform:translateY(-50%);color:var(--t2);font-size:16px;font-weight:600;pointer-events:none';
    amount.style.paddingRight = '104px';
    amountWrap.append(amount, amountCur, clearAmount);
    function rememberAmount() {
      try { if (amountKey) localStorage.setItem(amountKey, amount.value); } catch (_) { /* Local device preference. */ }
      render();
    }
    clearAmount.addEventListener('click', () => { amount.value = ''; rememberAmount(); amount.focus(); });
    const source = document.createElement('select'); source.className = 'inp';
    const target = document.createElement('select'); target.className = 'inp';
    const codes = typeof CURRENCIES !== 'undefined' ? CURRENCIES.map(x => x.code) : ['EUR', 'USD', 'GBP', 'CNY', 'JPY'];
    for (const code of codes) {
      for (const select of [source, target]) {
        const option = document.createElement('option'); option.value = code;
        option.textContent = (typeof currencyFlag === 'function' ? currencyFlag(code) + ' ' : '') + code;
        select.append(option);
      }
    }
    let savedPair = null;
    const pairKey = tripPreferenceKey('last_pair');
    try { savedPair = pairKey ? JSON.parse(localStorage.getItem(pairKey) || 'null') : null; }
    catch (_) { /* Keep the default pair if local preferences are unavailable. */ }
    const tripCurrency = typeof getCurrency === 'function' && codes.includes(getCurrency()) ? getCurrency() : 'EUR';
    const secondCurrency = S.trip.secondaryCurrency;
    if (!savedPair || savedPair.sec !== secondCurrency || !codes.includes(savedPair.source) || !codes.includes(savedPair.target) ||
        savedPair.source === savedPair.target) savedPair = null;
    source.value = savedPair ? savedPair.source : tripCurrency;
    target.value = savedPair ? savedPair.target : (codes.includes(secondCurrency) ? secondCurrency : tripCurrency);
    function rememberPair() {
      try { if (pairKey) localStorage.setItem(pairKey, JSON.stringify({ source: source.value, target: target.value, sec: S.trip.secondaryCurrency })); }
      catch (_) { /* Local device preference only. */ }
    }
    const auto = document.createElement('input'); auto.type = 'radio'; auto.name = 'fx-rate-mode'; auto.checked = true;
    const manual = document.createElement('input'); manual.type = 'radio'; manual.name = 'fx-rate-mode';
    const rate = document.createElement('input'); rate.className = 'inp'; rate.inputMode = 'decimal'; rate.readOnly = true;
    rate.setAttribute('aria-label', c[6]);
    const refresh = document.createElement('button'); refresh.type = 'button'; refresh.className = 'btn btn-g btn-sm'; refresh.textContent = c[7];
    const result = document.createElement('strong'); result.style.fontSize = '1.4rem'; result.style.textAlign = 'center'; result.setAttribute('aria-live', 'polite');
    const date = document.createElement('div'); date.style.color = 'var(--t2)'; date.style.fontSize = '0.82rem';
    const notice = document.createElement('div'); notice.style.color = 'var(--t2)'; notice.style.fontSize = '0.82rem'; notice.textContent = c[11];
    let request = null; let generation = 0; let referenceRate = '';
    function addField(label, control, parent = content) {
      const wrap = document.createElement('label'); wrap.className = 'iw';
      const text = document.createElement('span'); text.className = 'il'; text.textContent = label;
      wrap.style.margin = '0'; wrap.style.minWidth = '0';
      text.style.marginBottom = '4px';
      wrap.append(text, control); parent.append(wrap);
    }
    // 1.0.25: курс показывается как у источника (ЕЦБ: 1 EUR = 176,45 JPY), расчёт — всегда «исходная → целевая»
    let rateInverted = false; let rateLabel = null;
    function updateRateLabel(r) {
      const s = source.value, t = target.value, v = Number(r);
      rateInverted = s === 'EUR' ? false : t === 'EUR' ? true : (v > 0 && v < 1);
      if (rateLabel) rateLabel.textContent = '1 ' + (rateInverted ? t : s) + ' = … ' + (rateInverted ? s : t);
    }
    function showRate(r) {
      updateRateLabel(r);
      const v = Number(r);
      if (!(v > 0)) { rate.value = ''; return; }
      const x = rateInverted ? 1 / v : v;
      rate.value = new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: x >= 1 ? 4 : 5, useGrouping: false }).format(x);
    }
    function typedRate() {
      const v = Number(String(rate.value).trim().replace(/\s/g, '').replace(',', '.'));
      if (!(v > 0)) return '';
      return rateInverted ? String(Number((1 / v).toFixed(12))) : String(Number(v.toFixed(12)));
    }
    function render() {
      if (!auto.checked) updateRateLabel(null);
      const converted = convertMinor(amount.value, auto.checked ? referenceRate : typedRate(), source.value, target.value);
      result.textContent = converted
        ? new Intl.NumberFormat(lang, { style: 'currency', currency: target.value,
            minimumFractionDigits: converted.minor % 10 ** (converted.digits - currencyDigits(target.value)) ? converted.digits : currencyDigits(target.value), maximumFractionDigits: converted.digits }).format(converted.minor / 10 ** converted.digits)
        : '';
    }
    async function fetchRate() {
      if (request) request.abort();
      const current = ++generation;
      if (source.value === target.value) {
        request = null; refresh.disabled = false; referenceRate = '1'; showRate(referenceRate);
        rate.title = referenceRate; date.textContent = ''; render(); return;
      }
      request = new AbortController();
      const controller = request;
      const timer = setTimeout(() => controller.abort(), 18000);
      refresh.disabled = true; referenceRate = ''; rate.value = ''; rate.title = ''; result.textContent = '…'; date.textContent = '…';
      try {
        // A native localhost may return the app's HTML with status 200 for /api/*.
        // Accept only validated JSON; never send amount, trip IDs or tokens.
        const quote = await requestLatestRate(source.value, target.value, controller.signal);
        if (current !== generation) return;
        cacheRate(source.value, target.value, quote);
        referenceRate = String(quote.rate); showRate(referenceRate); rate.title = referenceRate;
        date.textContent = c[8] + ': ' + (typeof fmtRateDate === 'function' ? fmtRateDate(quote.asOf) : quote.asOf) + ' · ' + displaySource(quote.source, lang); render();
      } catch (_) {
        if (current === generation) {
          const cached = readCachedRate(source.value, target.value);
          referenceRate = cached ? String(cached.rate) : '';
          showRate(referenceRate); rate.title = referenceRate;
          date.textContent = cached
            ? c[14] + ' · ' + c[8] + ': ' + (typeof fmtRateDate === 'function' ? fmtRateDate(cached.asOf) : cached.asOf) + ' · ' + displaySource(cached.source, lang)
            : c[9];
          render();
        }
      } finally {
        clearTimeout(timer);
        if (current === generation) { request = null; refresh.disabled = false; }
      }
    }
    function setMode() {
      generation++;
      if (request) request.abort();
      rate.readOnly = !manual.checked;
      refresh.hidden = manual.checked;
      refresh.style.display = manual.checked ? 'none' : '';
      referenceRate = ''; rate.value = ''; rate.title = '';
      date.textContent = ''; updateRateLabel(null);
      fitViewport();
      if (manual.checked) { rate.focus(); render(); } else fetchRate();
    }
    let closed = false;
    let backListener = null;
    // Android may consume Back to dismiss the IME before Capacitor receives
    // backButton. Treat a visible IME closing as closing this modal too.
    const viewportHeight = () => Math.min(window.innerHeight,
      window.visualViewport ? window.visualViewport.height : window.innerHeight);
    const openViewportHeight = viewportHeight();
    let keyboardWasVisible = false;
    let currencyControlActive = false;
    function beginCurrencyControl() {
      // Tapping a native select/swap first dismisses the IME. That viewport
      // resize is not an Android Back press and must not close the dialog.
      currencyControlActive = true;
      keyboardWasVisible = false;
    }
    function onKeyDown(event) { if (event.key === 'Escape') { event.preventDefault(); closeModal(); } }
    function closeModal() {
      if (picking) { closePicker(); return; }
      if (closed) return;
      closed = true;
      if (currentCalculator && currentCalculator.close === closeModal) currentCalculator = null;
      generation++;
      if (request) request.abort();
      document.removeEventListener('keydown', onKeyDown);
      if (backListener) backListener.remove();
      if (window.visualViewport) { window.visualViewport.removeEventListener('resize', fitViewport); window.visualViewport.removeEventListener('scroll', fitViewport); }
      window.removeEventListener('resize', fitViewport);
      detachResume();
      overlay.remove();
      unlockPage();
      if (!document.querySelector('.ov.open')) document.body.style.overflow = '';
    }
    function fitViewport() {
      if (closed) return;
      const viewport = window.visualViewport;
      const visibleHeight = viewportHeight();
      if (currencyControlActive || document.activeElement === source || document.activeElement === target)
        keyboardWasVisible = false;
      else if (openViewportHeight - visibleHeight > 120) keyboardWasVisible = true;
      else if (keyboardWasVisible && visibleHeight >= openViewportHeight - 80) {
        keyboardWasVisible = false;   // клавиатура скрыта — окно остаётся открытым (закрыть: «Закрыть» или «Назад»)
      }
      if (viewport) {
        overlay.style.height = Math.max(visibleHeight, 240) + 'px';
        overlay.style.top = Math.max(0, Math.min(viewport.offsetTop, window.innerHeight - 240)) + 'px';
        overlay.style.bottom = 'auto';
      } else { overlay.style.top = '0'; overlay.style.height = window.innerHeight + 'px'; }
      if (window.scrollY) window.scrollTo(0, 0);
      const editing = document.activeElement === amount || document.activeElement === rate;
      // Android WebView does not always report an IME resize. Hiding Close on
      // input focus also prevents it overlapping the rate note in that case.
      const keyboardOpen = editing;
      const keyboardShown = editing && openViewportHeight - visibleHeight > 120;
      const nativeShell = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
      overlay.style.paddingTop = nativeShell ? 'max(36px, var(--st))' : 'calc(var(--st) + 12px)';
      overlay.style.paddingBottom = keyboardOpen ? '4px' : '12px';
      modal.style.padding = keyboardOpen ? '8px' : '12px';
      modal.style.gap = keyboardOpen ? '4px' : '10px';
      content.style.gap = keyboardOpen ? '4px' : '8px';
      close.style.display = keyboardOpen ? 'none' : '';
      // одно целое с клавиатурой: окно доходит до клавиатуры, без просвета со страницей
      modal.style.height = keyboardShown ? '100%' : '';
      modal.style.overflowY = 'auto';
      notice.style.display = '';
      date.style.display = '';
      refresh.style.display = manual.checked ? 'none' : '';
      for (const input of [amount, source, target, rate]) {
        input.style.minHeight = keyboardOpen ? '38px' : '44px';
        input.style.height = keyboardOpen ? '38px' : '44px';
      }
    }
    close.addEventListener('click', closeModal);
    xClose.addEventListener('click', closeModal);
    // нажатие мимо окна его больше не закрывает (случайные касания при открытой клавиатуре)
    overlay.addEventListener('touchmove', event => { if (event.target === overlay) event.preventDefault(); }, { passive: false });
    const amountField = document.createElement('div'); amountField.className = 'iw';
    const amountLabel = document.createElement('label'); amountLabel.className = 'il'; amountLabel.htmlFor = amount.id; amountLabel.textContent = c[1];
    amountField.style.margin = '0';
    amountField.append(amountLabel, amountWrap); content.append(amountField, result);
    const currencies = document.createElement('div'); currencies.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) 44px minmax(0,1fr);align-items:end;gap:8px';
    content.append(currencies); addField(c[2], source, currencies);
    const swap = document.createElement('button'); swap.type = 'button'; swap.className = 'btn btn-g btn-fw';
    const swapLabels = {ru:'Поменять валюты местами',en:'Swap currencies',de:'Währungen tauschen',es:'Intercambiar monedas',fr:'Inverser les devises',pt:'Trocar moedas',it:'Inverti valute',pl:'Zamień waluty',el:'Εναλλαγή νομισμάτων',tr:'Para birimlerini değiştir'};
    swap.textContent = '⇄'; swap.setAttribute('aria-label', swapLabels[lang] || swapLabels.en);
    swap.title = swapLabels[lang] || swapLabels.en;
    swap.style.cssText = 'padding:0;width:44px;height:44px;font-size:25px';
    for (const control of [source, target, swap]) {
      control.addEventListener('pointerdown', beginCurrencyControl);
      control.addEventListener('touchstart', beginCurrencyControl);
    }
    source.addEventListener('focus', beginCurrencyControl);
    target.addEventListener('focus', beginCurrencyControl);
    swap.addEventListener('click', () => {
      const previous = source.value; source.value = target.value; target.value = previous;
      rememberPair();
      if (auto.checked) fetchRate();
      else {
        // с EUR курс остаётся «1 EUR = X», меняется только направление расчёта
        if (source.value !== 'EUR' && target.value !== 'EUR') {
          const value = Number(rate.value.trim().replace(',', '.'));
          rate.value = Number.isFinite(value) && value > 0 ? String(Number((1 / value).toFixed(12))) : '';
        } else updateRateLabel(null);
        render();
      }
    });
    currencies.append(swap); addField(c[3], target, currencies);
    modal.style.position = 'relative';
    const curSymbol = code => {
      try { return new Intl.NumberFormat(lang, { style: 'currency', currency: code, currencyDisplay: 'symbol' })
        .formatToParts(0).find(p => p.type === 'currency').value; } catch (_) { return code; }
    };
    const pickers = [];
    const panel = document.createElement('div'); panel.className = 'fx-pick';
    panel.style.cssText = 'position:absolute;inset:0;background:var(--bg2);border-radius:var(--r);z-index:2;display:none;flex-direction:column;overflow:hidden';
    const panelList = document.createElement('div'); panelList.className = 'fx-pick';
    panelList.style.cssText = 'flex:1;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;padding:8px';
    panel.append(panelList); modal.append(panel);
    let picking = null;
    function closePicker() { panel.style.display = 'none'; picking = null; }
    function openPicker(select) {
      picking = select; panelList.replaceChildren();
      const list = [...select.options].map(o => o.value);
      const pinned = [tripCurrency, typeof S !== 'undefined' && S.trip && S.trip.secondaryCurrency].filter(Boolean);
      const ordered = [...new Set([...pinned.filter(x => list.includes(x)), ...list])];
      for (const code of ordered) {
        const cur = typeof CURRENCIES !== 'undefined' ? CURRENCIES.find(x => x.code === code) : null;
        const item = document.createElement('button'); item.type = 'button';
        item.textContent = cur && typeof currencyOptionLabel === 'function' ? currencyOptionLabel(cur) : code;
        item.style.cssText = 'display:block;width:100%;text-align:left;min-height:44px;padding:10px 12px;border:0;border-radius:var(--rxs);font:inherit;font-size:16px;color:var(--text);background:' + (code === select.value ? 'var(--aglow)' : 'transparent');
        noFocus(item);
        item.addEventListener('click', () => {
          if (select.value !== code) { select.value = code; select.dispatchEvent(new Event('change')); }
          closePicker(); keepKeyboard();
        });
        panelList.append(item);
      }
      panel.style.display = 'flex';
      const active = panelList.children[ordered.indexOf(select.value)]; if (active) active.scrollIntoView({ block: 'center' });
    }
    function noFocus(el) {
      // кнопки окна не забирают фокус у поля ввода — клавиатура не закрывается
      el.addEventListener('pointerdown', e => e.preventDefault());
      el.addEventListener('mousedown', e => e.preventDefault());
    }
    for (const select of [source, target]) {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'inp';
      btn.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;text-align:left;width:100%;min-width:0;cursor:pointer';
      const txt = document.createElement('span'); txt.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      const chev = document.createElement('span'); chev.textContent = '⌄'; chev.style.color = 'var(--t2)';
      btn.append(txt, chev); select.style.display = 'none'; select.after(btn);
      noFocus(btn); btn.addEventListener('click', () => openPicker(select));
      pickers.push([select, txt]);
    }
    function syncPickers() {
      for (const [select, txt] of pickers) txt.textContent = select.options[select.selectedIndex]?.textContent || select.value;
      amountCur.textContent = curSymbol(source.value);
    }
    for (const el of [swap, refresh, clearAmount]) noFocus(el);
    for (const [control, label] of [[auto, c[4]], [manual, c[5]]]) {
      const row = document.createElement('label'); row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:2px 0;font-size:14px;line-height:1.25';
      row.append(control, document.createTextNode(label)); content.append(row); noFocus(row);
    }
    addField(c[6], rate); rateLabel = rate.previousSibling; updateRateLabel(null); content.append(refresh, date, notice);
    for (const input of [amount, source, target, rate]) {
      input.style.minHeight = '44px'; input.style.height = '44px'; input.style.paddingTop = '8px'; input.style.paddingBottom = '8px'; input.style.fontSize = '16px';
    }
    notice.style.fontSize = '12px'; notice.style.lineHeight = '1.3';
    overlay.append(modal); document.body.append(overlay); document.body.style.overflow = 'hidden';
    const lockedScrollY = window.scrollY || 0;
    const bodyStyleBefore = { position: document.body.style.position, top: document.body.style.top, width: document.body.style.width };
    document.documentElement.style.overflow = 'hidden';
    document.body.style.position = 'fixed'; document.body.style.top = (-lockedScrollY) + 'px'; document.body.style.width = '100%';
    overlay.style.position = 'fixed'; overlay.style.left = '0'; overlay.style.right = '0'; overlay.style.overscrollBehavior = 'none';
    overlay.style.touchAction = 'none'; modal.style.touchAction = 'manipulation'; modal.style.overscrollBehavior = 'contain';
    // перетаскивание окна запрещено; прокрутка внутри окна — только если содержимое не помещается
    overlay.addEventListener('touchmove', event => {
      if (event.target.closest && event.target.closest('.fx-pick')) return;
      if (!(modal.contains(event.target) && modal.scrollHeight > modal.clientHeight + 1)) event.preventDefault();
    }, { passive: false });
    const unlockPage = () => {
      document.documentElement.style.overflow = '';
      Object.assign(document.body.style, bodyStyleBefore);
      window.scrollTo(0, lockedScrollY);
    };
    fitViewport();
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', fitViewport); window.visualViewport.addEventListener('scroll', fitViewport); }
    window.addEventListener('resize', fitViewport);
    document.addEventListener('keydown', onKeyDown);
    const nativeApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (nativeApp && window.Capacitor.isNativePlatform()) {
      Promise.resolve(nativeApp.addListener('backButton', closeModal)).then(handle => {
        if (closed) handle.remove(); else backListener = handle;
      }).catch(() => { /* The on-screen close button remains available. */ });
    }
    // 1.0.25: чистим ввод: без ведущих нулей, один разделитель, знаков после запятой — сколько у валюты (курс — до 6)
    const decSep = (0.5).toLocaleString(lang).includes(',') ? ',' : '.';
    const cleanField = (field, decimals) => {
      const raw = field.value;
      const next = typeof sanitizeMoneyText === 'function' ? sanitizeMoneyText(raw, decimals, decSep) : raw;
      if (next !== raw) { field.value = next; try { field.setSelectionRange(next.length, next.length); } catch (_) {} }
    };
    amount.addEventListener('input', () => cleanField(amount, currencyDigits(source.value)));
    rate.addEventListener('input', () => cleanField(rate, 6));
    source.addEventListener('change', () => { cleanField(amount, currencyDigits(source.value)); rememberAmount(); });
    amount.addEventListener('input', rememberAmount); rate.addEventListener('input', render);
    amount.addEventListener('focus', () => { currencyControlActive = false; fitViewport(); });
    rate.addEventListener('focus', () => { currencyControlActive = false; fitViewport(); });
    amount.addEventListener('blur', () => setTimeout(fitViewport, 0));
    rate.addEventListener('blur', () => setTimeout(fitViewport, 0));
    source.addEventListener('change', () => { rememberPair(); if (auto.checked) fetchRate(); else render(); });
    target.addEventListener('change', () => { rememberPair(); if (auto.checked) fetchRate(); else render(); });
    auto.addEventListener('change', setMode); manual.addEventListener('change', setMode);
    refresh.addEventListener('click', fetchRate);
    fetchRate();
    currentCalculator = { close: closeModal };
    // 1.0.25: после возврата в приложение (кнопка «Домой») Android убирает клавиатуру — возвращаем фокус заново
    const refocusAfterResume = () => {
      if (closed) return;
      const field = manual.checked && document.activeElement === rate ? rate : amount;
      try { field.blur(); } catch (_) {}
      for (const ms of [80, 300, 700]) setTimeout(() => { if (!closed && !picking) { field.focus({ preventScroll: true }); fitViewport(); } }, ms);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') refocusAfterResume(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refocusAfterResume);
    let resumeHandle = null;
    if (nativeApp && window.Capacitor.isNativePlatform()) {
      Promise.resolve(nativeApp.addListener('resume', refocusAfterResume)).then(h => { if (closed) h.remove(); else resumeHandle = h; }).catch(() => {});
    }
    detachResume = () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refocusAfterResume);
      if (resumeHandle) resumeHandle.remove();
    };
    // Focus synchronously so Android opens its native numeric keyboard.
    amount.focus({ preventScroll: true });
    amount.select();
    for (const ms of [60, 250, 600]) setTimeout(() => {
      if (!closed && document.activeElement !== amount && document.activeElement !== rate &&
          !(document.activeElement && document.activeElement.tagName === 'SELECT')) { amount.focus({ preventScroll: true }); amount.select(); }
    }, ms);
    // 1.0.25: клавиатура всегда с окном — после любого действия фокус возвращается в поле суммы
    // (или в поле курса, если включён ручной курс)
    const keepKeyboard = () => {
      if (closed) return;
      const field = manual.checked && document.activeElement !== amount && (!rate.value || document.activeElement === rate) ? rate : amount;
      if (document.activeElement !== field) field.focus({ preventScroll: true });
    };
    // нажатие по свободному месту окна не снимает фокус с поля (иначе Android прячет клавиатуру)
    modal.addEventListener('mousedown', event => { if (!event.target.closest('input,select,textarea')) event.preventDefault(); });
    modal.addEventListener('click', event => {
      const el = event.target;
      if (el.closest('select') || el === amount || el === rate || el.closest('input[type=radio]')) return;
      if (el.closest('button') === close || el.closest('button') === xClose) return;
      keepKeyboard();
    });
    for (const control of [source, target]) control.addEventListener('change', () => { syncPickers(); keepKeyboard(); });
    for (const control of [auto, manual]) control.addEventListener('change', () => keepKeyboard());
    swap.addEventListener('click', () => { syncPickers(); keepKeyboard(); });
    syncPickers();
  }

  window.SplitawayFx = { convertMinor, openCalculator, requestLatestRate, syncVisibility };
  document.addEventListener('DOMContentLoaded', () => {
    keyboardProxy();
    const buttons = ['fx-open-btn', 'ae-fx-open-btn', 'fx-fab-btn']
      .map(id => document.getElementById(id)).filter(Boolean);
    if (!buttons.length) return;
    const updateLabel = () => {
      const lang = (typeof getLang === 'function' ? getLang() : 'ru').slice(0, 2);
      buttons.filter(button => button.id !== 'fx-fab-btn')
        .forEach(button => { button.textContent = (copy[lang] || copy.en)[13]; });
      const quick = document.getElementById('fx-fab-btn');
      if (quick) { quick.setAttribute('aria-label', (copy[lang] || copy.en)[13]); quick.title = (copy[lang] || copy.en)[0]; }
    };
    updateLabel();
    new MutationObserver(updateLabel).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    buttons.forEach(button => {
      // фокус на поле-посреднике ещё в момент касания (pointerdown) — так Android точно поднимает клавиатуру
      button.addEventListener('pointerdown', () => { if (!hasPair()) return; try { keyboardProxy().focus({ preventScroll: true }); } catch (_) {} });
      button.addEventListener('click', openCalculator);
    });
    const toggle = document.getElementById('fx-fab-toggle');
    const quick = document.getElementById('fx-fab-btn');
    if (toggle && quick) {
      syncVisibility();
      toggle.addEventListener('change', () => {
        if (!hasPair()) { syncVisibility(); return; }
        quick.style.display = toggle.checked ? 'flex' : 'none';
        const key = tripPreferenceKey('fab_visible');
        try { if (key) localStorage.setItem(key, toggle.checked ? '1' : '0'); } catch (_) { /* Local preference only. */ }
      });
    }
  });
})();
