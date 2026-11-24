// ============================================================
// Модуль «Чек-лист» (id: 'checklist')
// Ответственный: Рафаэль · Issue #14
// ------------------------------------------------------------
// Пользователь сам составляет список: создаёт разделы (Документы,
// Одежда …) и пункты внутри них, отмечает выполненное.
// Экран 1 — обзор: поездка, общий прогресс, разделы.
// Экран 2 — раздел: прогресс раздела, пункты, перетаскивание.
// Данные хранятся для каждой поездки на этом устройстве (ctx.store).
// Общие списки для группы («Мои / Общие») — следующий этап (Supabase).
// ============================================================
(function () {
  'use strict';
  if (!window.STHub) return;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- Иконки разделов (единый стиль с главной) ----------
  const g = (id, a, b) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  const svg = (defs, body) => `<svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
  const ICONS = {
    passport: { bg: '#E4ECFF', svg: svg(g('ck-pp', '#4D7CF0', '#2C55C9'),
      '<rect x="11" y="6" width="26" height="36" rx="5" fill="url(#ck-pp)"/><circle cx="24" cy="21" r="7" fill="none" stroke="#F7CF5B" stroke-width="2"/><path d="M17 21h14M24 14c-2.5 3.5-2.5 10.5 0 14M24 14c2.5 3.5 2.5 10.5 0 14" stroke="#F7CF5B" stroke-width="1.6" fill="none"/><rect x="17" y="33" width="14" height="2.6" rx="1.3" fill="#F7CF5B"/>') },
    shirt: { bg: '#E3F0FF', svg: svg(g('ck-sh', '#5AA8FF', '#2E7BE6'),
      '<path d="M17 8l-9 5 3.5 8.5 4.5-2V40h16V19.5l4.5 2L40 13l-9-5c-1 3-3.6 5-7 5s-6-2-7-5z" fill="url(#ck-sh)"/><path d="M17 8c1 3 3.6 5 7 5s6-2 7-5" fill="none" stroke="#BFDDFF" stroke-width="2"/>') },
    aid: { bg: '#FFE6E7', svg: svg(g('ck-ad', '#FF7474', '#E1353A'),
      '<path d="M18 14v-2.5A2.5 2.5 0 0120.5 9h7a2.5 2.5 0 012.5 2.5V14" fill="none" stroke="#B9262B" stroke-width="3"/><rect x="6.5" y="14" width="35" height="26" rx="7.5" fill="url(#ck-ad)"/><rect x="21" y="19.5" width="6" height="15" rx="1.8" fill="#fff"/><rect x="16.5" y="24" width="15" height="6" rx="1.8" fill="#fff"/>') },
    plug: { bg: '#E1F6E7', svg: svg(g('ck-pl', '#5ED38C', '#1FA55A'),
      '<rect x="16" y="5" width="4" height="10" rx="2" fill="#178A46"/><rect x="28" y="5" width="4" height="10" rx="2" fill="#178A46"/><path d="M11 14h26v7a13 13 0 01-26 0z" fill="url(#ck-pl)"/><path d="M24 34v9" stroke="#178A46" stroke-width="4" stroke-linecap="round"/><path d="M25.5 18.5l-4 6h4l-2 5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>') },
    bottle: { bg: '#E4F1FF', svg: svg(g('ck-bt', '#6FB6FF', '#2E86E6'),
      '<rect x="12" y="8" width="7" height="6" rx="1.5" fill="#1F6FC7"/><rect x="9" y="14" width="13" height="28" rx="5" fill="url(#ck-bt)"/><rect x="29" y="12" width="5" height="4" rx="1.2" fill="#1F6FC7"/><path d="M27 18h9v20a4 4 0 01-4 4h-1a4 4 0 01-4-4z" fill="#9FD0FF"/><rect x="12" y="24" width="7" height="9" rx="2" fill="#D6EBFF"/>') },
    suitcase: { bg: '#FFF0DB', svg: svg(g('ck-sc', '#FFB45A', '#EE8417'),
      '<path d="M18 14v-3a3 3 0 013-3h6a3 3 0 013 3v3" fill="none" stroke="#C96A0C" stroke-width="3"/><rect x="7" y="14" width="34" height="27" rx="7" fill="url(#ck-sc)"/><rect x="7" y="23" width="34" height="3.5" fill="#D9740F" opacity=".55"/><rect x="21" y="21" width="6" height="8" rx="2" fill="#FFE2BC"/>') },
    camera: { bg: '#EEE8FF', svg: svg(g('ck-cm', '#A891FF', '#6C4CF0'),
      '<path d="M17 13l2.5-4h9l2.5 4" fill="#5A3BD9"/><rect x="6" y="13" width="36" height="26" rx="7" fill="url(#ck-cm)"/><circle cx="24" cy="26" r="8" fill="#E7E0FF"/><circle cx="24" cy="26" r="4.5" fill="#6C4CF0"/><circle cx="35" cy="19" r="2" fill="#FFE07A"/>') },
    food: { bg: '#FFE9E3', svg: svg(g('ck-fd', '#FF8A6B', '#E84A2F'),
      '<path d="M24 14c-3-4-12-4-13 5-1 10 6 22 13 20 7 2 14-10 13-20-1-9-10-9-13-5z" fill="url(#ck-fd)"/><path d="M24 14c0-4 2-7 6-8" fill="none" stroke="#3E8E41" stroke-width="2.5" stroke-linecap="round"/><path d="M26 9c4-1 7 1 8 4-4 1-7-1-8-4z" fill="#5ED38C"/>') },
    sun: { bg: '#FFF6D6', svg: svg(g('ck-sn', '#FFD650', '#FFA41C'),
      '<circle cx="24" cy="24" r="10" fill="url(#ck-sn)"/><g stroke="#FFB52E" stroke-width="3" stroke-linecap="round"><path d="M24 5v5M24 38v5M5 24h5M38 24h5M10.6 10.6l3.5 3.5M33.9 33.9l3.5 3.5M37.4 10.6l-3.5 3.5M14.1 33.9l-3.5 3.5"/></g>') },
    star: { bg: '#EEE8FF', svg: svg(g('ck-st', '#B7A2FF', '#6A48EE'),
      '<path d="M24 6l5.3 11.3 12.2 1.4-9.1 8.4 2.5 12.1L24 33.2l-10.9 6 2.5-12.1-9.1-8.4 12.2-1.4z" fill="url(#ck-st)"/>') }
  };
  const ICON_KEYS = Object.keys(ICONS);
  const iconHtml = key => (ICONS[key] || ICONS.suitcase).svg;
  const iconBg = key => (ICONS[key] || ICONS.suitcase).bg;

  // ---------- Данные ----------
  // sections: [{ id, name, icon, items: [{ id, text, done }] }]
  const OLD_CAT_ICON = { 'Документы': 'passport', 'Одежда': 'shirt', 'Техника': 'plug', 'Аптечка': 'aid', 'Гигиена': 'bottle', 'Другое': 'suitcase' };
  // Стартовый список для новой поездки: всё НЕ отмечено (прогресс 0 %).
  // Пользователь сам отмечает, меняет, удаляет и добавляет свои пункты.
  const STARTER = [
    { name: 'Документы', icon: 'passport', items: ['Паспорт', 'Билеты', 'Бронь жилья', 'Страховка', 'Банковские карты'] },
    { name: 'Одежда и обувь', icon: 'shirt', items: ['Футболки', 'Брюки / шорты', 'Лёгкая куртка', 'Обувь для прогулок', 'Пижама'] },
    { name: 'Аптечка', icon: 'aid', items: ['Обезболивающее', 'Пластыри', 'Личные лекарства'] },
    { name: 'Электроника', icon: 'plug', items: ['Телефон', 'Зарядка', 'Пауэрбанк', 'Переходник для розетки'] },
    { name: 'Гигиена', icon: 'bottle', items: ['Зубная щётка и паста', 'Шампунь', 'Солнцезащитный крем'] },
    { name: 'Разное', icon: 'suitcase', items: ['Ключи от дома', 'Наушники'] }
  ];

  function loadSections(store) {
    let sections = store.get('sections', null);
    if (!sections) {
      // 1) перенос данных из первой версии модуля (плоский список с категориями)
      const old = store.get('items', []);
      if (old.length) {
        const by = {};
        old.forEach(i => { const c = i.cat || 'Другое'; (by[c] = by[c] || []).push({ id: i.id || uid(), text: i.text, done: !!i.done }); });
        sections = Object.keys(by).map(c => ({ id: uid(), name: c, icon: OLD_CAT_ICON[c] || 'suitcase', items: by[c] }));
      } else {
        // 2) новая поездка — стартовый список, ничего не отмечено
        sections = STARTER.map(sec => ({ id: uid(), name: sec.name, icon: sec.icon, items: sec.items.map(text => ({ id: uid(), text, done: false })) }));
      }
      store.set('sections', sections);
    }
    return sections;
  }
  const countOf = list => ({ done: list.filter(i => i.done).length, total: list.length });
  const pctOf = c => (c.total ? Math.round(c.done / c.total * 100) : 0);

  // Кольцо прогресса
  function ring(pct, size, stroke) {
    const r = (size - stroke) / 2, len = 2 * Math.PI * r;
    return `<svg class="ckl-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--ckl-track)" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--accent)" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${len}" stroke-dashoffset="${len * (1 - pct / 100)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" class="ckl-ring-txt" style="font-size:${size < 50 ? 11 : 15}px">${pct}%</text></svg>`;
  }

  STHub.addStyles('checklist', `
    [data-module="checklist"]{--ckl-track:#E9E5FF;--ckl-green:#34C759}
    [data-theme=dark] [data-module="checklist"]{--ckl-track:rgba(255,255,255,.1)}
    [data-module="checklist"] .hub-title-row .hub-icbtn{background:none;border:0;box-shadow:none}
    [data-module="checklist"] .hub-title-row h2{font-size:1.12rem}
    .ckl-card{border-radius:18px;background:var(--hub-card);border:1px solid var(--hub-card-b);box-shadow:var(--hub-shadow)}
    .ckl-trip-ph img{display:block;width:100%;height:100%;object-fit:cover}
    .ckl-prog{display:flex;align-items:center;gap:16px;padding:14px 16px}
    .ckl-ring{flex-shrink:0}
    .ckl-ring-txt{font-weight:800;fill:var(--text)}
    .ckl-prog-ttl{font-weight:700;font-size:.95rem}
    .ckl-prog-sub{color:var(--t2);font-size:.8rem;margin-top:3px}
    .ckl-secs{display:flex;flex-direction:column;gap:10px}
    .ckl-sec{display:flex;align-items:center;gap:14px;padding:12px 14px;width:100%;color:var(--text)}
    .ckl-sec-open{display:flex;align-items:center;gap:14px;flex:1;min-width:0;text-align:left;cursor:pointer;color:inherit;font:inherit;background:none;border:0;padding:0}
    .ckl-sec-actions{display:flex;align-items:center;gap:2px;flex-shrink:0}
    .ckl-sec-action{display:flex;align-items:center;justify-content:center;width:36px;height:40px;border:0;background:none;color:var(--t2);cursor:pointer;border-radius:10px;padding:0}
    .ckl-sec-action:hover,.ckl-sec-action:focus-visible{background:var(--ckl-track);color:var(--text)}
    .ckl-sec-action svg{width:17px;height:17px}
    .ckl-sec-action[data-del]:hover,.ckl-sec-action[data-del]:focus-visible{color:#E5484D}
    .ckl-sec-ic{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:7px}
    [data-theme=dark] .ckl-sec-ic,[data-theme=dark] .ckl-pick-ic{filter:saturate(1.1);background:rgba(255,255,255,.08)!important}
    .ckl-sec-name{flex:1;min-width:0;font-weight:700;font-size:.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .ckl-sec-cnt{font-size:.86rem;color:var(--t2);font-weight:600}
    .ckl-sec-cnt.full{color:var(--ckl-green)}
    .ckl-sec svg.ckl-chev{width:18px;height:18px;color:var(--t3)}
    .ckl-add-sec{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:52px;border:0;border-radius:16px;background:linear-gradient(135deg,#8E80FF,#5B4BEA);color:#fff;font:inherit;font-weight:700;font-size:.95rem;cursor:pointer;box-shadow:0 8px 20px rgba(91,75,234,.28)}
    .ckl-add-sec svg{width:19px;height:19px}
    .ckl-hero{position:relative;height:150px;border-radius:22px;overflow:hidden;background:linear-gradient(160deg,#F1EEFF,#DCD5FF);display:flex;align-items:center;justify-content:center}
    [data-theme=dark] .ckl-hero{background:linear-gradient(160deg,#25223F,#1A1830)}
    .ckl-hero::before,.ckl-hero::after{content:"";position:absolute;border-radius:50%;background:rgba(255,255,255,.55)}
    .ckl-hero::before{width:120px;height:120px;left:-30px;bottom:-50px}
    .ckl-hero::after{width:80px;height:80px;right:30px;top:-30px}
    [data-theme=dark] .ckl-hero::before,[data-theme=dark] .ckl-hero::after{background:rgba(255,255,255,.05)}
    .ckl-hero-ic{position:relative;z-index:1;width:96px;height:96px;filter:drop-shadow(0 10px 18px rgba(91,75,234,.25))}
    .ckl-sprog{display:flex;align-items:center;gap:14px;padding:10px 14px;margin-top:-26px;position:relative;z-index:2;margin-left:8px;margin-right:8px}
    .ckl-sprog-txt{flex:1;font-weight:700}
    .ckl-sprog button{border:0;background:none;color:var(--t2);cursor:pointer;width:34px;height:34px;display:flex;align-items:center;justify-content:center}
    .ckl-sprog button svg{width:20px;height:20px;transition:transform .2s}
    .ckl-sprog button.up svg{transform:rotate(180deg)}
    .ckl-items{display:flex;flex-direction:column;gap:8px}
    .ckl-item{display:flex;align-items:center;gap:12px;padding:12px 10px 12px 14px;touch-action:pan-y}
    .ckl-item.dragging{opacity:.85;box-shadow:0 10px 24px rgba(30,30,80,.18);transform:scale(1.02)}
    .ckl-box{width:24px;height:24px;flex-shrink:0;border-radius:6px;border:2px solid var(--b2);background:transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;color:#fff}
    .ckl-box svg{width:15px;height:15px;stroke-width:3.2}
    .ckl-item.done .ckl-box{background:var(--ckl-green);border-color:var(--ckl-green)}
    .ckl-txt{flex:1;min-width:0;font-size:.93rem;overflow-wrap:anywhere;cursor:pointer;background:none;border:0;color:var(--text);font:inherit;text-align:left;padding:0}
    .ckl-handle{width:30px;height:30px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--t3);cursor:grab;touch-action:none}
    .ckl-handle svg{width:18px;height:18px}
    .ckl-add-item{display:flex;align-items:center;gap:10px;padding:14px;border:0;background:var(--hub-card);border-radius:16px;color:var(--accent);font:inherit;font-weight:700;cursor:pointer;width:100%;border:1px solid var(--hub-card-b)}
    .ckl-add-item svg{width:20px;height:20px}
    .ckl-add-row{display:flex;gap:8px}
    .ckl-empty{padding:28px 16px;text-align:center;color:var(--t2);font-size:.88rem;line-height:1.45}
    .ckl-sheet .mdl-title{margin-bottom:4px}
    .ckl-sheet-act{display:flex;flex-direction:column;gap:8px;margin-top:10px}
    .ckl-picks{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:6px 0 4px}
    .ckl-pick{border:2px solid transparent;border-radius:14px;padding:3px;background:none;cursor:pointer}
    .ckl-pick.on{border-color:var(--accent)}
    .ckl-pick-ic{display:block;width:100%;aspect-ratio:1;border-radius:11px;padding:7px}
    .ckl-danger{color:#E5484D!important}
  `);

  // ---------- Нижняя панель (sheet) ----------
  function sheet(title, html, bind) {
    document.getElementById('ckl-sheet')?.remove();
    const ov = document.createElement('div');
    ov.className = 'ov open'; ov.id = 'ckl-sheet';
    ov.innerHTML = `<div class="mdl ckl-sheet"><div class="mdl-handle"></div><div class="mdl-title">${esc(title)}</div>${html}</div>`;
    const close = () => { ov.remove(); document.body.style.overflow = ''; };
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    if (typeof initializeIcons === 'function') initializeIcons(ov);
    bind(ov.firstChild, close);
  }

  function iconPicker(selected) {
    return `<div class="ckl-picks">${ICON_KEYS.map(k =>
      `<button type="button" class="ckl-pick${k === selected ? ' on' : ''}" data-icon="${k}"><span class="ckl-pick-ic" style="background:${iconBg(k)}">${iconHtml(k)}</span></button>`).join('')}</div>`;
  }
  function bindPicker(root, onPick) {
    root.querySelectorAll('[data-icon]').forEach(b => b.addEventListener('click', () => {
      root.querySelectorAll('[data-icon]').forEach(x => x.classList.toggle('on', x === b));
      onPick(b.dataset.icon);
    }));
  }

  STHub.registerService('checklist', ctx => {
    const store = ctx.store;
    let sections = loadSections(store);
    const save = () => store.set('sections', sections);
    let hideDone = false;

    // ===== Экран 1: обзор =====
    function openOverview() {
      ctx.openScreen({
        title: 'Чек-лист',
        action: { icon: 'more-vertical', label: 'Ещё', onClick: overviewMenu },
        render(body) {
          const all = sections.flatMap(s => s.items);
          const c = countOf(all);
          const t = ctx.trip || {};
          const members = ctx.members.length;
          body.innerHTML = `
            <button class="hub-trip2" type="button" id="ckl-trip" aria-label="Открыть текущую поездку">
              <span class="hub-trip2-ph on ckl-trip-ph"><img id="ckl-trip-photo" src="/img/trips/abstract.jpg" alt=""></span>
              <span class="hub-trip2-txt"><span class="hub-trip2-k"><i data-lucide="plane"></i>Текущая поездка</span>
                <span class="hub-trip2-name">${esc(t.name || 'Поездка')}</span>
                <span class="hub-trip2-meta">${esc(t.dest || '')}${t.dest && members ? ' <b>•</b> ' : ''}${members ? esc(members + ' ' + plural(members, 'участник', 'участника', 'участников')) : ''}</span>
              </span><span class="hub-trip2-go"><i data-lucide="chevron-right"></i></span>
            </button>
            <div class="ckl-card ckl-prog">${ring(pctOf(c), 64, 7)}
              <div><div class="ckl-prog-ttl">Подготовка к поездке</div>
              <div class="ckl-prog-sub">${c.total ? `${c.done} из ${c.total} выполнено` : 'Добавьте разделы и пункты'}</div></div>
            </div>
            ${sections.length ? `<div class="ckl-secs">${sections.map(s => {
              const sc = countOf(s.items);
              return `<div class="ckl-card ckl-sec" data-sec="${s.id}"><button class="ckl-sec-open" type="button" data-open aria-label="Открыть раздел «${esc(s.name)}»">
                <span class="ckl-sec-ic" style="background:${iconBg(s.icon)}">${iconHtml(s.icon)}</span>
                <span class="ckl-sec-name">${esc(s.name)}</span>
                <span class="ckl-sec-cnt${sc.total && sc.done === sc.total ? ' full' : ''}">${sc.done} / ${sc.total}</span>
                <i data-lucide="chevron-right" class="ckl-chev"></i></button>
                <span class="ckl-sec-actions"><button class="ckl-sec-action" type="button" data-rename aria-label="Изменить название раздела «${esc(s.name)}»" title="Изменить название"><i data-lucide="pencil"></i></button>
                <button class="ckl-sec-action" type="button" data-del aria-label="Удалить раздел «${esc(s.name)}»" title="Удалить раздел"><i data-lucide="trash-2"></i></button></span></div>`;
            }).join('')}</div>`
            : '<div class="ckl-card ckl-empty">Список пуст.<br>Добавьте свой раздел, например «Документы» или «Одежда».</div>'}
            <button class="ckl-add-sec" type="button" id="ckl-add-sec"><i data-lucide="plus"></i>Добавить раздел</button>
          `;
          if (ctx.trip && window.STPlacePhoto?.tripImg) STPlacePhoto.tripImg(body.querySelector('#ckl-trip-photo'), ctx.trip, { width: 900 });
          body.querySelector('#ckl-trip').addEventListener('click', () => STHub.openExpenses('pg-dash'));
          body.querySelectorAll('[data-sec]').forEach(row => {
            const sec = sections.find(s => s.id === row.dataset.sec);
            row.querySelector('[data-open]').addEventListener('click', () => openSection(sec.id));
            row.querySelector('[data-rename]').addEventListener('click', () => sectionForm(sec, true));
            row.querySelector('[data-del]').addEventListener('click', () => deleteSection(sec, openOverview));
          });
          body.querySelector('#ckl-add-sec').addEventListener('click', () => sectionForm(null));
        }
      });
    }

    function overviewMenu() {
      sheet('Чек-лист', `<div class="ckl-sheet-act">
          <button class="st-btn st-btn-g st-btn-fw" data-a="reset"><i data-lucide="rotate-ccw"></i>Снять все отметки</button>
          <button class="st-btn st-btn-g st-btn-fw ckl-danger" data-a="clear"><i data-lucide="trash-2"></i>Удалить выполненные пункты</button>
        </div>`, (root, close) => {
        root.querySelector('[data-a="reset"]').addEventListener('click', () => { sections.forEach(s => s.items.forEach(i => { i.done = false; })); save(); close(); openOverview(); });
        root.querySelector('[data-a="clear"]').addEventListener('click', () => {
          if (!confirm('Удалить все выполненные пункты?')) return;
          sections.forEach(s => { s.items = s.items.filter(i => !i.done); }); save(); close(); openOverview();
        });
      });
    }

    // Создать или изменить раздел
    function deleteSection(sec, refresh) {
      if (!confirm(`Удалить раздел «${sec.name}» вместе с пунктами?`)) return;
      sections = sections.filter(s => s.id !== sec.id); save(); refresh();
    }

    function sectionForm(sec, returnToOverview = false) {
      let icon = sec ? sec.icon : 'suitcase';
      sheet(sec ? 'Изменить раздел' : 'Новый раздел', `
        <input class="st-input" id="ckl-sec-name" maxlength="40" placeholder="Название, например «Документы»" value="${esc(sec ? sec.name : '')}">
        <div class="st-muted" style="margin-top:12px;text-align:left">Иконка</div>
        ${iconPicker(icon)}
        <div class="ckl-sheet-act"><button class="st-btn st-btn-fw" data-a="ok">${sec ? 'Сохранить' : 'Создать раздел'}</button>
        ${sec ? '<button class="st-btn st-btn-g st-btn-fw ckl-danger" data-a="del"><i data-lucide="trash-2"></i>Удалить раздел</button>' : ''}</div>`,
        (root, close) => {
          const input = root.querySelector('#ckl-sec-name');
          setTimeout(() => input.focus(), 50);
          bindPicker(root, k => { icon = k; });
          const ok = () => {
            const name = input.value.trim();
            if (!name) { input.focus(); return; }
            if (sec) { sec.name = name; sec.icon = icon; save(); close(); returnToOverview ? openOverview() : openSection(sec.id); }
            else { const s = { id: uid(), name, icon, items: [] }; sections.push(s); save(); close(); openSection(s.id); }
          };
          root.querySelector('[data-a="ok"]').addEventListener('click', ok);
          input.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
          root.querySelector('[data-a="del"]')?.addEventListener('click', () => {
            if (!confirm(`Удалить раздел «${sec.name}» вместе с пунктами?`)) return;
            sections = sections.filter(s => s.id !== sec.id); save(); close(); openOverview();
          });
        });
    }

    // ===== Экран 2: раздел =====
    function openSection(id) {
      const sec = sections.find(s => s.id === id);
      if (!sec) { openOverview(); return; }
      let adding = false;
      ctx.openScreen({
        title: sec.name,
        onBack: openOverview,
        action: { icon: 'more-vertical', label: 'Раздел', onClick: () => sectionForm(sec) },
        render(body, screen) {
          const c = countOf(sec.items);
          const list = hideDone ? sec.items.filter(i => !i.done) : sec.items;
          body.innerHTML = `
            <div class="ckl-hero"><div class="ckl-hero-ic">${iconHtml(sec.icon)}</div></div>
            <div class="ckl-card ckl-sprog">${ring(pctOf(c), 46, 5)}
              <span class="ckl-sprog-txt">${c.done} из ${c.total}</span>
              <button type="button" id="ckl-hide" class="${hideDone ? 'up' : ''}" aria-label="${hideDone ? 'Показать выполненные' : 'Скрыть выполненные'}"><i data-lucide="chevron-down"></i></button>
            </div>
            <div class="ckl-items" id="ckl-items">${list.map(i => `
              <div class="ckl-card ckl-item${i.done ? ' done' : ''}" data-id="${i.id}">
                <button class="ckl-box" type="button" data-toggle aria-label="${i.done ? 'Снять отметку' : 'Отметить'}">${i.done ? '<i data-lucide="check"></i>' : ''}</button>
                <button class="ckl-txt" type="button" data-edit>${esc(i.text)}</button>
                <span class="ckl-handle" data-drag aria-label="Перетащить"><i data-lucide="grip-vertical"></i></span>
              </div>`).join('')}
            </div>
            ${hideDone && c.done ? `<div class="st-muted" style="text-align:center">Скрыто выполненных: ${c.done}</div>` : ''}
            ${!sec.items.length && !adding ? '<div class="ckl-empty">В разделе пока нет пунктов</div>' : ''}
            ${adding
              ? `<div class="ckl-add-row"><input class="st-input" id="ckl-new" maxlength="80" placeholder="Новый пункт" autocomplete="off"><button class="st-btn" id="ckl-new-ok" aria-label="Добавить"><i data-lucide="check"></i></button></div>`
              : '<button class="ckl-add-item" type="button" id="ckl-add"><i data-lucide="plus"></i>Добавить пункт</button>'}
          `;
          body.querySelector('#ckl-hide').addEventListener('click', () => { hideDone = !hideDone; screen.refresh(); });
          body.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
            const it = sec.items.find(i => i.id === b.closest('[data-id]').dataset.id);
            if (it) { it.done = !it.done; save(); screen.refresh(); }
          }));
          body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => itemForm(sec, b.closest('[data-id]').dataset.id, screen)));
          body.querySelector('#ckl-add')?.addEventListener('click', () => { adding = true; screen.refresh(); });
          const input = body.querySelector('#ckl-new');
          if (input) {
            input.focus();
            const add = () => {
              const text = input.value.trim();
              if (!text) { adding = false; screen.refresh(); return; }
              sec.items.push({ id: uid(), text, done: false }); save(); screen.refresh(); // поле остаётся открытым для следующего пункта
            };
            body.querySelector('#ckl-new-ok').addEventListener('click', add);
            input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { adding = false; screen.refresh(); } });
          }
          enableDrag(body.querySelector('#ckl-items'), ids => {
            const map = Object.fromEntries(sec.items.map(i => [i.id, i]));
            const hidden = sec.items.filter(i => !ids.includes(i.id));
            sec.items = ids.map(x => map[x]).concat(hidden); save();
          });
        }
      });
    }

    // Изменить или удалить пункт
    function itemForm(sec, itemId, screen) {
      const it = sec.items.find(i => i.id === itemId);
      if (!it) return;
      sheet('Пункт', `
        <input class="st-input" id="ckl-it" maxlength="80" value="${esc(it.text)}">
        <div class="ckl-sheet-act"><button class="st-btn st-btn-fw" data-a="ok">Сохранить</button>
        <button class="st-btn st-btn-g st-btn-fw ckl-danger" data-a="del"><i data-lucide="trash-2"></i>Удалить пункт</button></div>`,
        (root, close) => {
          const input = root.querySelector('#ckl-it');
          const ok = () => { const v = input.value.trim(); if (!v) return; it.text = v; save(); close(); screen.refresh(); };
          root.querySelector('[data-a="ok"]').addEventListener('click', ok);
          input.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
          root.querySelector('[data-a="del"]').addEventListener('click', () => { sec.items = sec.items.filter(i => i.id !== itemId); save(); close(); screen.refresh(); });
        });
    }

    openOverview();
  });

  // Перетаскивание пунктов за ручку ⋮⋮ (мышь и палец)
  function enableDrag(list, onDone) {
    if (!list) return;
    list.querySelectorAll('[data-drag]').forEach(handle => {
      handle.addEventListener('pointerdown', e => {
        const row = handle.closest('[data-id]');
        if (!row) return;
        e.preventDefault();
        row.classList.add('dragging');
        const move = ev => {
          const rows = [...list.querySelectorAll('[data-id]')].filter(r => r !== row);
          const after = rows.find(r => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
          if (after) list.insertBefore(row, after); else list.appendChild(row);
        };
        // слушаем окно, а не ручку: при перестановке строки ручка «переезжает» в DOM
        const up = () => {
          row.classList.remove('dragging');
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          onDone([...list.querySelectorAll('[data-id]')].map(r => r.dataset.id));
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      });
    });
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
})();
