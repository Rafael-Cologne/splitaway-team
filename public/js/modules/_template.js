// ============================================================
// ШАБЛОН МОДУЛЯ Splitaway Team
// ------------------------------------------------------------
// Как сделать свой модуль:
//   1. Откройте файл своего модуля в этой папке (guide.js, nearby.js …).
//   2. Скопируйте туда код из этого шаблона и замените 'example' на id
//      своего сервиса из js/services-config.js ('guide', 'nearby' …).
//   3. Как только файл вызывает STHub.registerService(...), плитка на
//      главной становится активной и открывает ваш экран.
//
// Правила:
//   • Пишите только в своём файле. Общие файлы (index.html, hub.js …)
//     не трогайте — если что-то нужно поменять там, напишите тимлиду.
//   • Тексты интерфейса — на русском.
//   • Используйте готовые классы из css/hub.css: st-card, st-btn,
//     st-btn-g, st-input, st-row, st-empty … — так все модули выглядят одинаково.
//   • Иконки: <i data-lucide="название"></i> (lucide.dev/icons).
//   • Никаких платных API и ключей в коде.
//   • Этот файл (_template.js) в приложении не подключён — это только пример.
// ============================================================
(function () {
  'use strict';
  if (!window.STHub) return;

  const ID = 'example'; // ← id вашего сервиса

  // Защита от HTML в пользовательском тексте (всегда используйте для данных)
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  STHub.registerService(ID, ctx => {
    // ctx — всё, что нужно модулю:
    //   ctx.trip      — открытая поездка { id, name, dest, currency } или null
    //   ctx.members   — участники [{ name, gender }]
    //   ctx.me        — имя текущего участника
    //   ctx.store     — хранилище модуля на этом устройстве: ctx.store.get('ключ', поУмолчанию) / ctx.store.set('ключ', значение)
    //   ctx.supabase  — база данных: const sb = await ctx.supabase();  (новые таблицы — только через Александра)
    //   ctx.toast('текст') — короткое сообщение внизу экрана
    //   ctx.openScreen({ title, render, action }) — открыть экран модуля
    //   ctx.close()   — вернуться на главную

    ctx.openScreen({
      title: ctx.title,
      // необязательная кнопка справа в шапке
      action: { icon: 'plus', label: 'Добавить', onClick: screen => { ctx.toast('Нажата кнопка'); } },

      // render рисует содержимое экрана. screen.refresh() — перерисовать.
      render(body, screen) {
        const notes = ctx.store.get('notes', []);
        body.innerHTML = `
          <div class="st-card">
            <div class="st-card-title">Пример модуля</div>
            <div class="st-muted">Поездка: ${esc(ctx.trip ? ctx.trip.name : 'нет')}</div>
          </div>
          <input class="st-input" id="ex-input" placeholder="Новая заметка">
          <button class="st-btn st-btn-fw" id="ex-add"><i data-lucide="plus"></i>Добавить</button>
          ${notes.length
            ? notes.map(n => `<div class="st-row"><span class="st-row-ic"><i data-lucide="sticky-note"></i></span><span class="st-row-txt"><span class="st-row-ttl">${esc(n)}</span></span></div>`).join('')
            : '<div class="st-empty"><i data-lucide="inbox"></i><div>Пока пусто</div></div>'}
        `;
        body.querySelector('#ex-add').addEventListener('click', () => {
          const v = body.querySelector('#ex-input').value.trim();
          if (!v) return;
          ctx.store.set('notes', [...notes, v]);
          screen.refresh();
        });
      }
    });
  });
})();
