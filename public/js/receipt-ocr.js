/* Splitaway — receipt reading in the browser (web version) and a shared receipt-text parser.
 * Free and unlimited: text recognition (Tesseract, open source) runs on the user's own phone/computer.
 * Nothing is sent to a server. The APK keeps using Google ML Kit (native) and the same parser as a fallback. */
(function () {
  'use strict';
  const BASE = '/vendor/tesseract/';
  const LANG_MAP = { ru: 'rus+eng', de: 'deu+eng', el: 'ell+eng', tr: 'tur+eng', it: 'ita+eng', es: 'spa+eng',
    fr: 'fra+eng', pt: 'por+eng', pl: 'pol+eng', en: 'eng' };

  // ── parser ──────────────────────────────────────────────────────────────
  const PRICE = '(-?\\d{1,5}(?:[ .\\u00a0]\\d{3})*[.,]\\d{2})';
  const CUR = '(?:€|eur|euro|руб\\.?|р\\.|₽|tl|₺|zł|pln|£|\\$|chf|kč|lei|ft)?';
  const TAIL = '(?:\\s*[*#]?\\s*[a-dA-D0-9]?\\s*[*]?)?';           // VAT code after the price: "1,29 B", "4,00 *", "2,50 A1"
  const reItem = new RegExp('^(.{1,60}?)[\\s.:_…]+' + CUR + '\\s*' + PRICE + '\\s*' + CUR + TAIL + '$', 'i');
  const reQtyLine = new RegExp('^\\s*(\\d{1,3})(?:[,.]0+)?\\s*(?:stk\\.?|шт\\.?|pz\\.?|x|х|×|\\*)\\s*(?:x|х|×|\\*)?\\s*' + PRICE + '(?:\\s*' + CUR + ')?\\s*$', 'i');
  const reQtyInName = /^(\d{1,3})\s*(?:x|х|×|\*)?\s+(\S.*)$/i;
  const reTotal = /^(?:[^\p{L}]*)(summe|gesamt(betrag)?|zu zahlen|endbetrag|total|totale|totaal|totaal|amount due|итог[оа]?|всего|к оплате|сумма|σύνολο|toplam|razem|suma|do zapłaty|montant|à payer|importe|total a pagar|totale complessivo)(?=$|[^\p{L}])/iu;
  const reSkip = /(?:^|[^\p{L}])(mwst|ust\b|vat\b|tax|steuer|netto|brutto|ндс|без ндс|в т\.ч|φπα|kdv|iva\b|tva\b|ptu\b|zwischensumme|subtotal|sub-total|rückgeld|wechselgeld|сдача|change\b|resto\b|reste|bar\b|cash|наличн|безнал|карт|card|karte|ec-cash|girocard|visa|master|maestro|kreditkarte|payment|bezahlt|gegeben|geg\.|datum|date|uhrzeit|time\b|kasse|bon\b|beleg|чек\b|кассир|смена|инн|рн ккт|фн\b|фд\b|фп\b|tel\.?|telefon|www\.|http|uid|st\.?-?nr|steuernr|tisch\b|table\b|bed\.|bediener|trinkgeld|tip\b|rabatt gesamt|danke|thank|спасибо|grazie|gracias|merci|obrigado|teşekkür|ευχαριστ|dziękujemy|iban|bic|terminal|trace|auth|tse|signatur|seriennr|transaktion)(?=$|[^\p{L}])/iu;
  const num = s => parseFloat(String(s).replace(/[  ]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));

  function cleanName(s) {
    return String(s).replace(/[|_~^`"“”«»<>{}\[\]\\=]/g, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s.:,*\-–—]+|[\s.:,*\-–—]+$/g, '').trim();
  }
  function letterRatio(s) {
    const t = s.replace(/\s/g, ''); if (!t) return 0;
    return (t.match(/[A-Za-zÀ-žА-Яа-яЁёΑ-Ωα-ωάέήίόύώ]/g) || []).length / t.length;
  }

  function parseReceiptOcr(text) {
    // OCR noise at the line edges: "| Kaffee 2,40 |", "' Brot 1,20", "Summe 9,40 :"
    const edge = l => l.replace(/^[\s|'’‘"`_:;~•·.,=+*#\-–—]+/, '').replace(/[\s|'’‘"`_:;~•·\-–—]+$/, '').replace(/(\d[.,]\d{2}\s*[A-Da-d]?)\.$/, '$1');
    const lines = String(text || '').split(/\r?\n/).map(l => edge(l.replace(/\s+/g, ' ').trim())).filter(Boolean);
    const items = []; let total = null; let pendingQty = null; let afterTotal = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const q = line.match(reQtyLine);
      if (q) { pendingQty = { qty: parseInt(q[1], 10), unit: num(q[2]) }; continue; }
      const m = line.match(reItem);
      if (!m) continue;
      let name = cleanName(m[1]); const price = num(m[2]);
      if (!isFinite(price)) continue;
      if (reTotal.test(name)) { if (price > 0 && (total == null || !afterTotal)) total = price; afterTotal = true; continue; }
      if (afterTotal) continue;                    // everything below the total line is payment/tax info
      if (reSkip.test(name)) continue;
      if (Math.abs(price) >= 100000) continue;
      if (price < 0) {                              // discount line → subtract from the previous position
        if (items.length) items[items.length - 1].totalPrice = Math.round((items[items.length - 1].totalPrice + price) * 100) / 100;
        continue;
      }
      if (price === 0) continue;
      let qty = 1;
      const qn = name.match(reQtyInName);
      if (qn && letterRatio(qn[2]) > 0.5) { qty = parseInt(qn[1], 10) || 1; name = cleanName(qn[2]); }
      if (pendingQty && Math.abs(pendingQty.qty * pendingQty.unit - price) < 0.011) qty = pendingQty.qty;
      pendingQty = null;
      if (name.length < 2 || letterRatio(name) < 0.45) continue;
      const doubtful = name.length < 3 || letterRatio(name) < 0.7 || /[^\p{L}\p{N}\s.,%/&'+()\-]/u.test(name);
      items.push({ name: name.charAt(0).toUpperCase() + name.slice(1), totalPrice: Math.round(price * 100) / 100, quantity: qty,
        needsReview: doubtful, confidence: doubtful ? 0.5 : 0.85 });
    }
    // a line that looks like the total but was read as an item: drop the last item if it equals the sum of the others
    if (total == null && items.length > 2) {
      const last = items[items.length - 1]; const rest = items.slice(0, -1).reduce((s, it) => s + it.totalPrice, 0);
      if (Math.abs(rest - last.totalPrice) < 0.011) { items.pop(); total = last.totalPrice; }
    }
    return { items, total, provider: 'web-tesseract' };
  }

  // ── image → text (Tesseract in the browser) ─────────────────────────────
  let _loader = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (_loader) return _loader;
    _loader = new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = BASE + 'tesseract.min.js';
      s.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('tesseract_missing'));
      s.onerror = () => { _loader = null; reject(new Error('tesseract_load_failed')); };
      document.head.appendChild(s);
    });
    return _loader;
  }
  async function prepareImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
      const maxSide = 2200; const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
      // grayscale + contrast stretch: thermal receipts are often pale
      const d = g.getImageData(0, 0, c.width, c.height); const a = d.data; let lo = 255, hi = 0;
      for (let i = 0; i < a.length; i += 4) { const v = (a[i] * 299 + a[i + 1] * 587 + a[i + 2] * 114) / 1000; a[i] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
      const span = Math.max(40, hi - lo);
      for (let i = 0; i < a.length; i += 4) { const v = Math.max(0, Math.min(255, (a[i] - lo) * 255 / span)); a[i] = a[i + 1] = a[i + 2] = v; }
      g.putImageData(d, 0, 0);
      return c;
    } finally { URL.revokeObjectURL(url); }
  }
  async function readReceiptImage(file, lang, onProgress) {
    const T = await loadTesseract();
    const langs = LANG_MAP[(lang || 'en').slice(0, 2)] || 'eng';
    const worker = await T.createWorker(langs, 1, {
      workerPath: BASE + 'worker.min.js', corePath: BASE, langPath: BASE + 'lang', gzip: true,
      workerBlobURL: false,
      logger: m => { if (onProgress && m && typeof m.progress === 'number') onProgress(m.status, m.progress); }
    });
    try {
      await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
      const canvas = await prepareImage(file);
      const { data } = await worker.recognize(canvas);
      return data.text || '';
    } finally { try { await worker.terminate(); } catch (_) {} }
  }
  // pick an image: camera or gallery (the phone offers both)
  function pickImage() {
    return new Promise(resolve => {
      const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
      input.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01';
      document.body.appendChild(input);
      let done = false; const finish = f => { if (done) return; done = true; input.remove(); resolve(f); };
      input.addEventListener('change', () => finish(input.files && input.files[0] || null), { once: true });
      input.addEventListener('cancel', () => finish(null), { once: true });
      input.click();
    });
  }
  async function scanReceiptWeb(lang, onProgress, file) {
    const f = file || await pickImage();
    if (!f) { const e = new Error('cancelled'); e.code = 'USER_CANCELLED'; throw e; }
    if (!/^image\//.test(f.type || 'image/')) { const e = new Error('not_image'); e.code = 'NOT_IMAGE'; throw e; }
    const text = await readReceiptImage(f, lang, onProgress);
    const result = parseReceiptOcr(text);
    return { success: true, parsedResult: result, rawText: text };
  }
  window.SplitawayReceipt = { parseReceiptOcr, scanReceiptWeb, readReceiptImage };
})();
