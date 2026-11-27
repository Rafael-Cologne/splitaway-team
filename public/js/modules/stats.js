// ============================================================
// Модуль «Статистика» (id: 'stats')
// Ответственный: Rafael
// ------------------------------------------------------------
// Аналитика поездки — всё считается из уже введённых данных, вводить ничего не нужно:
//   • итоги: всего, в среднем в день, на человека; график по дням; топ-5 расходов;
//   • категории (по значку расхода, иначе по названию) и участники
//     (сколько заплатил / сколько потратил на себя — по тем же долям, что «Балансы»);
//   • бюджет поездки (пока хранится на этом устройстве): остаток, сколько можно в день, прогноз;
//   • поездка в цифрах: дни, брони, места из «Гида», записи и фото «Дневника», чек-лист, валюты.
// Графики — простые SVG без библиотек; цвета — проверенная палитра (dataviz), своя для тёмной темы.
// ============================================================
(function () {
  'use strict';
  if (!window.STHub) return;

  const ID = 'stats';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = el => { if (typeof initializeIcons === 'function') initializeIcons(el); };
  const plural = (n, a, b, c) => { const t = n % 10, h = n % 100; return t === 1 && h !== 11 ? a : t >= 2 && t <= 4 && (h < 12 || h > 14) ? b : c; };
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const addDay = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
  const dShort = s => new Date(s + 'T12:00:00').toLocaleDateString(window.STModuleUI?.locale() || 'ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
  const ls = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };

  // Категории: значок расхода → категория; без значка — по словам в названии
  const CATS = [
    { id: 'food', name: 'Еда', icon: 'utensils', av: ['food'], re: /ресторан|кафе|бар\b|паб|пицц|бургер|суши|еда|ужин|обед|завтрак|кофе|кофейн|пекарн|продукт|супермаркет|food|restaurant|cafe|essen/i },
    { id: 'stay', name: 'Жильё', icon: 'bed-double', av: ['hotel'], re: /отел|гостиниц|хостел|апартамент|жиль|airbnb|booking|hotel|hostel|unterkunft/i },
    { id: 'move', name: 'Транспорт', icon: 'car', av: ['taxi', 'plane', 'train'], re: /такси|uber|bolt|метро|автобус|трамва|поезд|электрич|самол|авиа|перел|бензин|топлив|парков|аренд.*авто|taxi|train|flug|bahn|ticket.*bus/i },
    { id: 'fun', name: 'Развлечения', icon: 'ticket', av: ['museum', 'ticket'], re: /музе|экскурс|билет|кино|театр|концерт|выстав|парк развлеч|зоопарк|museum|tour|eintritt/i },
    { id: 'shop', name: 'Покупки', icon: 'shopping-bag', av: ['shopping'], re: /магазин|покупк|сувенир|одежд|аптек|shop|souvenir/i },
    { id: 'other', name: 'Другое', icon: 'circle-ellipsis', av: [], re: null }
  ];
  const catOf = e => {
    const a = String(e.avatar || '');
    return CATS.find(c => c.av.includes(a)) || CATS.find(c => c.re && c.re.test(String(e.name || '') + ' ' + String(e.comment || ''))) || CATS[CATS.length - 1];
  };

  STHub.addStyles(ID, `
    .sx{--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--s6:#008300;--sx-other:#9a9aa6;--sx-bar:#6a4df4;--sx-good:#0f8a4c;--sx-bad:#d93636;--sx-grid:rgba(0,0,0,.07)}
    [data-theme=dark] .sx,[data-theme=midnight] .sx{--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#0ca30c;--sx-other:#6f6f7a;--sx-bar:#8f7bff;--sx-good:#2fbf71;--sx-bad:#ef5b5b;--sx-grid:rgba(255,255,255,.08)}
    .sx-tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .sx-tile{padding:14px;border-radius:18px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow)}
    .sx-tile small{display:block;font-size:.76rem;color:var(--t2);margin-bottom:4px}
    .sx-tile b{display:block;font-size:1.28rem;font-weight:800;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sx-tile.hero{grid-column:1/-1;background:linear-gradient(135deg,#6a4df4,#8f6bff);border:0;color:#fff}
    .sx-tile.hero small{color:rgba(255,255,255,.82)}
    .sx-tile.hero b{font-size:2rem}
    .sx-tile.hero span{font-size:.82rem;color:rgba(255,255,255,.85)}
    .sx-h{display:flex;align-items:center;gap:8px;font-size:.98rem;font-weight:800;margin:22px 2px 10px}
    .sx-h svg{width:18px;height:18px;color:#6a4df4}
    .sx-h .sx-h-act{margin-left:auto;font-size:.8rem;font-weight:600;color:#6a4df4;background:none;border:0;cursor:pointer;font-family:inherit}
    .sx-card{padding:14px;border-radius:18px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow)}
    .sx-chart{position:relative}
    .sx-chart svg{display:block;width:100%;height:auto;overflow:visible}
    .sx-chart text{font-family:inherit;font-size:10px;fill:var(--t2)}
    .sx-chart .lbl{font-size:10.5px;font-weight:700;fill:var(--text)}
    .sx-tip{position:absolute;pointer-events:none;transform:translate(-50%,-100%);background:var(--text);color:var(--bg);border-radius:9px;padding:5px 9px;font-size:.76rem;font-weight:600;white-space:nowrap;opacity:0;transition:opacity .12s;z-index:3}
    .sx-tip.on{opacity:1}
    .sx-donut{display:grid;grid-template-columns:132px 1fr;gap:14px;align-items:center}
    .sx-leg{display:flex;flex-direction:column;gap:7px}
    .sx-leg div{display:flex;align-items:center;gap:8px;font-size:.86rem}
    .sx-leg i{width:10px;height:10px;border-radius:3px;flex-shrink:0}
    .sx-leg span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sx-leg b{font-weight:700;white-space:nowrap}
    .sx-leg em{font-style:normal;color:var(--t2);font-size:.78rem;width:36px;text-align:right}
    .sx-mrow{margin-bottom:12px}
    .sx-mrow:last-child{margin-bottom:0}
    .sx-mname{display:flex;justify-content:space-between;font-size:.86rem;font-weight:700;margin-bottom:5px}
    .sx-mname small{font-weight:500;color:var(--t2)}
    .sx-mbar{display:flex;align-items:center;gap:8px;margin:3px 0;font-size:.76rem;color:var(--t2)}
    .sx-mbar div{height:8px;border-radius:0 4px 4px 0;min-width:2px}
    .sx-mleg{display:flex;gap:14px;font-size:.78rem;color:var(--t2);margin-bottom:12px}
    .sx-mleg span{display:inline-flex;align-items:center;gap:6px}
    .sx-mleg i{width:10px;height:10px;border-radius:3px}
    .sx-top{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--hub-card-b)}
    .sx-top:last-child{border-bottom:0;padding-bottom:0}
    .sx-top:first-child{padding-top:0}
    .sx-top .n{width:22px;height:22px;border-radius:7px;background:rgba(106,77,244,.12);color:#6a4df4;font-size:.76rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .sx-top>span:not(.n){flex:1;min-width:0}
    .sx-top span small{display:block;color:var(--t2);font-size:.76rem}
    .sx-top b{white-space:nowrap}
    .sx-bud-bar{height:12px;border-radius:6px;background:var(--sx-grid);overflow:hidden;margin:10px 0 8px}
    .sx-bud-bar div{height:100%;border-radius:6px}
    .sx-bud-row{display:flex;justify-content:space-between;gap:10px;font-size:.84rem;color:var(--t2)}
    .sx-bud-row b{color:var(--text)}
    .sx-status{display:inline-flex;align-items:center;gap:6px;margin-top:10px;font-size:.84rem;font-weight:700}
    .sx-status svg{width:16px;height:16px}
    .sx-nums{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
    .sx-num{padding:12px 8px;border-radius:16px;background:var(--hub-card);border:1px solid var(--hub-card-b);text-align:center}
    .sx-num svg{width:22px;height:22px;color:#6a4df4}
    .sx-num b{display:block;font-size:1.25rem;font-weight:800;margin-top:4px}
    .sx-num small{display:block;font-size:.72rem;color:var(--t2);line-height:1.25}
    .sx-empty{padding:30px 16px;text-align:center;color:var(--t2)}
    .sx-empty svg{width:40px;height:40px;color:#6a4df4;margin-bottom:8px}
    @media (max-width:380px){.sx-donut{grid-template-columns:110px 1fr}.sx-nums{grid-template-columns:repeat(2,1fr)}}
  `);

  function sheet(title, html, bind) {
    document.getElementById('sx-sheet')?.remove();
    const ov = document.createElement('div'); ov.className = 'ov open'; ov.id = 'sx-sheet';
    ov.innerHTML = `<div class="mdl"><div class="mdl-handle"></div><div class="mdl-title">${esc(title)}</div>${html}</div>`;
    let done = false;
    const close = () => { if (done) return; done = true; ov.remove(); document.body.style.overflow = ''; };
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    (document.getElementById('pg-module') || document.body).appendChild(ov);
    document.body.style.overflow = 'hidden'; icons(ov);
    bind(ov.firstChild, close);
  }

  STHub.registerService(ID, ctx => {
    const trip = ctx.trip || {};
    const App = typeof S !== 'undefined' ? S : {};
    const cur = () => (App.trip && App.trip.currency) || trip.currency || 'EUR';
    const money = (v, d) => { try { return new Intl.NumberFormat(window.STModuleUI?.locale() || 'ru-RU', { style: 'currency', currency: cur(), maximumFractionDigits: d == null ? 2 : d, minimumFractionDigits: d == null ? 2 : 0 }).format(v); } catch (_) { return (Math.round(v * 100) / 100) + ' ' + cur(); } };
    const expenses = () => (Array.isArray(App.expenses) ? App.expenses : []).filter(e => Number(e.amount) > 0);
    const members = () => (Array.isArray(App.members) ? App.members : ctx.members || []).map(m => m.name);
    const expDate = e => { const v = String(e.date || ''); if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10); const t = new Date(v); return isNaN(t) ? '' : iso(t); };
    // доля участника — как в «Балансах»: свои позиции из «Заказа», иначе доли по участникам
    const shareOf = (e, p) => {
      if (typeof expenseShareCents === 'function') return expenseShareCents(e, p) / 100;
      if (e.splits && Object.keys(e.splits).length) return Number(e.splits[p]) || 0;
      if (!(e.participants || []).includes(p)) return 0;
      try { if (typeof perShare === 'function' && typeof unitsForExp === 'function') return perShare(e) * unitsForExp(e, p); } catch (_) {}
      return e.amount / e.participants.length;
    };
    const range = () => {
      const d = ls('st_mod_calendar_' + trip.id + '_dates');
      if (d && d.start) return { start: d.start, end: d.end || d.start, set: true };
      const ds = expenses().map(expDate).filter(Boolean).sort();
      return ds.length ? { start: ds[0], end: ds[ds.length - 1] } : null;
    };

    // ---------- тултип для графиков ----------
    function tips(root) {
      root.querySelectorAll('.sx-chart').forEach(box => {
        const tip = box.querySelector('.sx-tip');
        const show = t => { const r = box.getBoundingClientRect(), m = t.getBoundingClientRect(); tip.textContent = t.dataset.tip; tip.style.left = (m.left + m.width / 2 - r.left) + 'px'; tip.style.top = (m.top - r.top - 6) + 'px'; tip.classList.add('on'); };
        box.querySelectorAll('[data-tip]').forEach(t => { t.addEventListener('pointerenter', () => show(t)); t.addEventListener('click', () => show(t)); });
        box.addEventListener('pointerleave', () => tip.classList.remove('on'));
      });
    }

    // ---------- графики ----------
    function dayChart(days, sums) {
      const W = 340, H = 150, top = 18, bot = 22, n = days.length, gap = n > 20 ? 2 : 4;
      const max = Math.max(...sums, 0) || 1, bw = Math.max(3, (W - gap * (n - 1)) / n), maxI = sums.indexOf(Math.max(...sums));
      const step = n <= 8 ? 1 : n <= 16 ? 2 : Math.ceil(n / 7);
      let bars = '', labels = '';
      days.forEach((d, i) => {
        const x = i * (bw + gap), h = sums[i] > 0 ? Math.max(3, (H - top - bot) * sums[i] / max) : 0, y = H - bot - h;
        const r = Math.min(4, bw / 2, h);
        if (h) bars += `<path d="M${x},${H - bot} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${H - bot} Z" fill="var(--sx-bar)" opacity="${i === maxI ? 1 : .55}"/>`;
        bars += `<rect x="${x - gap / 2}" y="0" width="${bw + gap}" height="${H - bot}" fill="transparent" data-tip="${esc(dShort(d) + ' · ' + money(sums[i]))}"/>`;
        if (i % step === 0 || i === n - 1 && n <= 16) labels += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(dShort(d))}</text>`;
        if (i === maxI && sums[i] > 0) bars += `<text class="lbl" x="${Math.min(W - 30, Math.max(30, x + bw / 2))}" y="${y - 5}" text-anchor="middle">${esc(money(sums[i], 0))}</text>`;
      });
      return `<div class="sx-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Расходы по дням">
        <line x1="0" x2="${W}" y1="${H - bot}" y2="${H - bot}" stroke="var(--sx-grid)" stroke-width="1"/>${bars}${labels}</svg><div class="sx-tip"></div></div>`;
    }
    function donut(parts, total) {
      const R = 60, r = 40, C = 66; let a = -Math.PI / 2, paths = '';
      const pt = (rad, ang) => [C + rad * Math.cos(ang), C + rad * Math.sin(ang)];
      parts.forEach(p => {
        const sweep = Math.max(0.0001, p.sum / total * Math.PI * 2), gapA = parts.length > 1 ? 0.03 : 0;
        const a0 = a + gapA / 2, a1 = a + sweep - gapA / 2, large = a1 - a0 > Math.PI ? 1 : 0;
        if (parts.length === 1) paths += `<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none" stroke="${p.color}" stroke-width="${R - r}" data-tip="${esc(p.name + ' · ' + money(p.sum))}"/>`;
        else { const [x0, y0] = pt(R, a0), [x1, y1] = pt(R, a1), [x2, y2] = pt(r, a1), [x3, y3] = pt(r, a0);
          paths += `<path d="M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${large} 0 ${x3},${y3} Z" fill="${p.color}" data-tip="${esc(p.name + ' · ' + money(p.sum) + ' · ' + Math.round(p.sum / total * 100) + '%')}"/>`; }
        a += sweep;
      });
      return `<div class="sx-chart"><svg viewBox="0 0 132 132" role="img" aria-label="Расходы по категориям">${paths}
        <text x="66" y="62" text-anchor="middle" style="font-size:10px">всего</text><text class="lbl" x="66" y="78" text-anchor="middle" style="font-size:12.5px">${esc(money(total, 0))}</text></svg><div class="sx-tip"></div></div>`;
    }

    function budgetSheet(screen) {
      const b = ctx.store.get('budget', null);
      sheet('Бюджет поездки', `<div class="st-muted" style="margin:2px 0 10px">Сколько вы планируете потратить за всю поездку (${esc(cur())}). Бюджет хранится на этом устройстве.</div>
        <input class="st-input" id="sx-bud" type="number" inputmode="decimal" min="0" step="1" placeholder="Например, 1500" value="${b ? esc(b) : ''}">
        <button class="st-btn st-btn-fw" type="button" data-a="ok" style="margin-top:12px"><i data-lucide="check"></i>Сохранить</button>
        ${b ? '<button class="st-btn st-btn-g st-btn-fw" type="button" data-a="del" style="margin-top:8px">Убрать бюджет</button>' : ''}`, (root, close) => {
        const inp = root.querySelector('#sx-bud'); setTimeout(() => inp.focus(), 200);
        root.querySelector('[data-a="ok"]').addEventListener('click', () => { const v = parseFloat(String(inp.value).replace(',', '.')); if (!(v > 0)) { ctx.toast('Введите сумму больше нуля'); return; } ctx.store.set('budget', Math.round(v * 100) / 100); close(); screen.refresh(); });
        root.querySelector('[data-a="del"]')?.addEventListener('click', () => { ctx.store.set('budget', null); close(); screen.refresh(); });
      });
    }

    ctx.openScreen({
      title: ctx.title,
      render(body, screen) {
        const list = expenses(), ppl = members(), total = list.reduce((s, e) => s + Number(e.amount), 0);
        const rg = range();
        const today = iso(new Date());
        // дни поездки
        let days = [];
        if (rg) for (let d = rg.start, i = 0; d <= rg.end && i < 120; d = addDay(d, 1), i++) days.push(d);
        list.forEach(e => { const d = expDate(e); if (d && !days.includes(d)) days.push(d); });
        days.sort();
        const byDay = days.map(d => list.filter(e => expDate(e) === d).reduce((s, e) => s + Number(e.amount), 0));
        const tripDays = rg ? days.filter(d => d >= rg.start && d <= rg.end).length : days.length;
        const passed = rg ? Math.max(1, days.filter(d => d >= rg.start && d <= rg.end && d <= today).length) : Math.max(1, days.length);
        const perDay = total / (rg && today >= rg.start && today <= rg.end ? passed : Math.max(1, tripDays));

        // поездка в цифрах — данные других модулей
        const diary = ls('st_mod_diary_' + trip.id + '_entries') || [];
        const photos = diary.reduce((s, e) => s + (e.media || []).filter(m => m.type === 'photo').length, 0);
        const books = (ls('st_mod_bookings_' + trip.id + '_items') || []).length;
        const saved = (ls('st_mod_guide_' + trip.id + '_saved') || []).length;
        const check = ls('st_mod_checklist_' + trip.id + '_items') || [];
        const curs = new Set([cur()]); list.forEach(e => { if (e.originalCurrency) curs.add(e.originalCurrency); });
        const nums = [
          ['calendar-days', tripDays, plural(tripDays, 'день', 'дня', 'дней') + ' поездки'],
          ['receipt', list.length, plural(list.length, 'расход', 'расхода', 'расходов')],
          ['ticket', books, plural(books, 'бронь', 'брони', 'броней')],
          ['map-pin', saved, plural(saved, 'место', 'места', 'мест') + ' в «Гиде»'],
          ['book-open', diary.length, plural(diary.length, 'запись', 'записи', 'записей') + ' в дневнике'],
          ['image', photos, 'фото в дневнике'],
          ['list-checks', check.filter(x => x.done).length + '/' + check.length, 'чек-лист готов'],
          ['coins', curs.size, plural(curs.size, 'валюта', 'валюты', 'валют')],
          ['users', ppl.length, plural(ppl.length, 'участник', 'участника', 'участников')]
        ];
        const numsHtml = `<div class="sx-h"><i data-lucide="sparkles"></i>Поездка в цифрах</div>
          <div class="sx-nums">${nums.map(([ic, v, l]) => `<div class="sx-num"><i data-lucide="${ic}"></i><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('')}</div>`;

        if (!list.length) {
          body.innerHTML = `<div class="sx"><div class="sx-card sx-empty"><i data-lucide="bar-chart-3"></i><div style="font-weight:700;color:var(--text);margin-bottom:4px">Пока нет расходов</div>
            Добавьте первый расход в «Расходах» — здесь появятся итоги, графики по дням, категориям и участникам.</div>${numsHtml}</div>`;
          icons(body); return;
        }

        // бюджет
        const bud = ctx.store.get('budget', null);
        let budHtml;
        if (bud) {
          const left = bud - total, pct = Math.min(100, total / bud * 100);
          const daysLeft = rg ? Math.max(0, days.filter(d => d >= rg.start && d <= rg.end && d >= today).length) : 0;
          const forecast = rg ? perDay * tripDays : total;
          const over = forecast > bud * 1.0001 || left < 0;
          budHtml = `<div class="sx-card">
            <div class="sx-bud-row"><span>Потрачено <b>${esc(money(total))}</b></span><span>из <b>${esc(money(bud))}</b></span></div>
            <div class="sx-bud-bar"><div style="width:${pct}%;background:${left < 0 ? 'var(--sx-bad)' : 'var(--sx-bar)'}"></div></div>
            <div class="sx-bud-row"><span>${left >= 0 ? 'Осталось' : 'Перерасход'} <b>${esc(money(Math.abs(left)))}</b></span>${daysLeft && left > 0 ? `<span>можно <b>${esc(money(left / daysLeft))}</b> в день</span>` : ''}</div>
            ${rg ? `<div class="sx-status" style="color:${over ? 'var(--sx-bad)' : 'var(--sx-good)'}"><i data-lucide="${over ? 'alert-triangle' : 'check-circle-2'}"></i>${over ? 'Прогноз: ' + esc(money(forecast, 0)) + ' — больше бюджета' : 'Прогноз: ' + esc(money(forecast, 0)) + ' — в рамках бюджета'}</div>` : ''}
          </div>`;
        } else budHtml = `<button class="sx-card" type="button" data-a="bud" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;font:inherit;color:var(--text);cursor:pointer">
            <span style="width:42px;height:42px;border-radius:13px;background:rgba(106,77,244,.12);color:#6a4df4;display:flex;align-items:center;justify-content:center"><i data-lucide="piggy-bank"></i></span>
            <span style="flex:1"><b style="display:block">Задать бюджет</b><small style="color:var(--t2)">Остаток, сколько можно тратить в день и прогноз</small></span><i data-lucide="chevron-right" style="color:var(--t2)"></i></button>`;

        // категории
        const catSum = {}; list.forEach(e => { const c = catOf(e); catSum[c.id] = (catSum[c.id] || 0) + Number(e.amount); });
        const colors = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'];
        const parts = CATS.map((c, i) => ({ id: c.id, name: c.name, sum: catSum[c.id] || 0, color: c.id === 'other' ? 'var(--sx-other)' : colors[i] })).filter(p => p.sum > 0);

        // участники
        const personal = list.filter(e => !e.fromTreasury && e.paidBy !== '_treasury');
        const rows = ppl.map(p => {
          const paid = personal.filter(e => e.paidBy === p).reduce((s, e) => s + Number(e.amount), 0);
          const own = list.reduce((s, e) => s + shareOf(e, p), 0);
          const personalOwn = personal.reduce((s, e) => s + shareOf(e, p), 0);
          return { p, paid, own, personalNet: Math.round((paid - personalOwn) * 100) / 100 };
        });
        const mMax = Math.max(1, ...rows.map(r => Math.max(r.paid, r.own)));
        const treasury = list.filter(e => e.fromTreasury || e.paidBy === '_treasury').reduce((s, e) => s + Number(e.amount), 0);

        const top = list.slice().sort((a, b) => b.amount - a.amount).slice(0, 5);
        const maxDay = byDay.length ? days[byDay.indexOf(Math.max(...byDay))] : null;

        body.innerHTML = `<div class="sx">
          <div class="sx-tiles">
            <div class="sx-tile hero"><small>Всего потрачено</small><b>${esc(money(total))}</b><span>${list.length} ${plural(list.length, 'расход', 'расхода', 'расходов')}${maxDay ? ' · самый дорогой день — ' + esc(dShort(maxDay)) : ''}</span></div>
            <div class="sx-tile"><small>В среднем в день</small><b>${esc(money(perDay))}</b></div>
            <div class="sx-tile"><small>На человека</small><b>${esc(money(ppl.length ? total / ppl.length : total))}</b></div>
          </div>

          <div class="sx-h"><i data-lucide="piggy-bank"></i>Бюджет${bud ? '<button class="sx-h-act" type="button" data-a="bud">Изменить</button>' : ''}</div>
          ${budHtml}

          <div class="sx-h"><i data-lucide="bar-chart-3"></i>По дням</div>
          <div class="sx-card">${dayChart(days, byDay)}</div>

          <div class="sx-h"><i data-lucide="pie-chart"></i>По категориям</div>
          <div class="sx-card sx-donut">${donut(parts, total)}
            <div class="sx-leg">${parts.slice().sort((a, b) => b.sum - a.sum).map(p => `<div><i style="background:${p.color}"></i><span>${esc(p.name)}</span><b>${esc(money(p.sum, 0))}</b><em>${Math.round(p.sum / total * 100)}%</em></div>`).join('')}</div></div>

          <div class="sx-h"><i data-lucide="users"></i>По участникам</div>
          <div class="sx-card">
            <div class="sx-mleg"><span><i style="background:var(--s1)"></i>Заплатил лично</span><span><i style="background:var(--s2)"></i>Потратил на себя</span></div>
            ${rows.map(r => `<div class="sx-mrow"><div class="sx-mname">${esc(r.p)}<small>${r.personalNet > 0 ? 'ему должны ' + esc(money(r.personalNet)) : r.personalNet < 0 ? 'должен ' + esc(money(-r.personalNet)) : 'в расчёте'}</small></div>
              <div class="sx-mbar"><div style="width:${r.paid / mMax * 70}%;background:var(--s1)"></div>${esc(money(r.paid, 0))}</div>
              <div class="sx-mbar"><div style="width:${r.own / mMax * 70}%;background:var(--s2)"></div>${esc(money(r.own, 0))}</div></div>`).join('')}
            ${treasury ? `<div class="st-muted" style="margin-top:10px">Из кассы оплачено ${esc(money(treasury))}.</div>` : ''}
            <div class="st-muted" style="margin-top:8px;font-size:.76rem">«Потратил на себя» включает траты из кассы. Долг — только по личным платежам, без учёта возвратов. Точные расчёты в «Балансах».</div>
          </div>

          <div class="sx-h"><i data-lucide="trophy"></i>Самые крупные расходы</div>
          <div class="sx-card">${top.map((e, i) => `<div class="sx-top"><span class="n">${i + 1}</span><span>${esc(e.name || 'Расход')}<small>${esc(catOf(e).name)}${expDate(e) ? ' · ' + esc(dShort(expDate(e))) : ''}${e.paidBy && e.paidBy !== '_treasury' ? ' · ' + esc(e.paidBy) : ''}</small></span><b>${esc(money(e.amount))}</b></div>`).join('')}</div>

          ${numsHtml}
        </div>`;
        icons(body); tips(body);
        body.querySelectorAll('[data-a="bud"]').forEach(b => b.addEventListener('click', () => budgetSheet(screen)));
      }
    });
  });
})();
