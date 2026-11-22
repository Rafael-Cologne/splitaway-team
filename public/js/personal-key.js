// ============================================================
// Личный ключ входа (QR)
// ------------------------------------------------------------
// Три разных QR-кода в приложении — и их нельзя перепутать:
//   1) QR-приглашение в поездку (фиолетовый, «Пригласить»)  — показывать друзьям;
//   2) МОЙ КЛЮЧ ВХОДА (тёмный, с замком)                   — только для себя, как пароль;
//   3) Экстренная карта (красный, модуль «Экстренно»)        — для врачей и полиции.
//
// Ключ входа = доступ ко всем поездкам этого телефона от вашего имени
// (код поездки, приглашение, личный ключ участника, права админа).
// Вход на другом устройстве (телефон, компьютер):
//   • QR-код ключа (камерой) + PIN — работает всегда, даже без базы;
//   • личный номер вида K7QM-2XPA-9RTD + PIN — удобно ввести руками; нужна таблица personal_keys
//     (миграция supabase/migrations/027_personal_keys.sql). Сервер хранит только зашифрованный блок
//     и не знает ни номера, ни PIN: id = SHA-256 от номера.
// Шифрование на устройстве: ключ = PBKDF2(номер + PIN) → AES-GCM (WebCrypto).
// В ссылке ключ стоит после «#» — такая часть адреса не отправляется на сервер.
// При появлении новых поездок ключ на сервере обновляется сам (ключ шифрования хранится в IndexedDB, без PIN).
// Аккаунт создаётся сам: как только на устройстве появилась первая поездка (создал или вошёл по приглашению),
// приложение выдаёт личный номер и сохраняет кабинет в personal_keys. PIN необязателен — его можно добавить,
// выпустив новый ключ («Новый ключ с PIN-кодом»). Без PIN секрет — сам номер (60 бит), его хранят как пароль.
// Данные модулей (календарь, брони …) восстановятся этим же ключом, когда они будут в Supabase.
// ============================================================
(function () {
  'use strict';

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = el => { if (typeof initializeIcons === 'function') initializeIcons(el); };
  const say = t => { if (typeof toast === 'function') toast(t); };
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); return true; } catch (_) { return false; } };
  const VER = 'ST1';
  const META = 'st_key_meta';
  const DATES = id => 'st_mod_calendar_' + id + '_dates'; // даты поездки (модуль «Календарь»)
  const fmtDate = t => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return n + ' ' + (m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c); };

  // ---------- Поездки на этом телефоне ----------
  function myTrips() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('sw_')) continue;
        const raw = localStorage.getItem(key);
        if (!raw || raw[0] !== '{') continue;
        let d; try { d = JSON.parse(raw); } catch (_) { continue; }
        if (!d || !d.trip || !d.trip.id || key !== 'sw_' + d.trip.id || !d.me) continue;
        const id = d.trip.id;
        const k = localStorage.getItem('sw_mkey_' + id + '_' + d.me), a = localStorage.getItem('sw_admin_' + id), iv = localStorage.getItem('sw_invite_' + id);
        if (!k && !a) continue; // без ключа участника войти нельзя
        const dt = lsGet(DATES(id), null);
        out.push(Object.assign({ i: id, n: d.trip.name || id, d: d.trip.dest || '', c: d.trip.currency || '', m: d.me, g: d.meGender || 'm', iv: iv || '', k: k || '', a: a || '' },
          dt && dt.start ? { ds: dt.start, de: dt.end || dt.start } : {}));
      }
    } catch (_) {}
    const last = localStorage.getItem('sw_last');
    return out.sort((x, y) => (y.i === last) - (x.i === last) || x.n.localeCompare(y.n));
  }

  // ---------- Шифрование PIN-кодом ----------
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64u = buf => { let s = ''; new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const ub64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); s += '='.repeat((4 - s.length % 4) % 4); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
  const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без похожих I/1, O/0
  const newNumber = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => ABC[b % 32]).join(''); // 60 бит
  const normNum = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1');
  const prettyNum = n => normNum(n).replace(/(.{4})(?=.)/g, '$1-');
  const isNum = v => /^[A-Z2-9]{12}$/.test(normNum(v)) && normNum(v).split('').every(ch => ABC.includes(ch));
  const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  const sha = async t => hex(await crypto.subtle.digest('SHA-256', enc.encode(t)));
  const ids = async num => ({ id: await sha('st-key-id:' + normNum(num)), write: await sha('st-key-write:' + normNum(num)) });
  async function derive(secret, salt) {
    const base = await crypto.subtle.importKey('raw', enc.encode(String(secret)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const zip = async (bytes, how) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(how)).arrayBuffer());
  // ключ шифрования (из номера + PIN) сохраняется на этом телефоне, чтобы обновлять ключ без PIN
  const idb = () => new Promise((ok, no) => { const r = indexedDB.open('st_personal_key', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const idbDo = (mode, fn) => idb().then(db => new Promise((ok, no) => { const t = db.transaction('k', mode); const q = fn(t.objectStore('k')); t.oncomplete = () => ok(q && q.result); t.onerror = () => no(t.error); }));
  async function pack(obj, num, pin, saved) {
    let data = enc.encode(JSON.stringify(obj)), z = '0';
    if (window.CompressionStream) { try { data = await zip(data, new CompressionStream('deflate-raw')); z = '1'; } catch (_) {} }
    const salt = saved ? saved.salt : crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = saved ? saved.key : await derive(normNum(num) + ':' + pin, salt);
    if (!saved) { try { await idbDo('readwrite', st => st.put({ key, salt }, 'enc')); } catch (_) {} }
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return [VER + z, b64u(salt), b64u(iv), b64u(ct)].join('.');
  }
  async function unpack(code, num, pin) {
    const p = String(code).split('.');
    if (p.length !== 4 || !p[0].startsWith(VER)) throw new Error('format');
    return unpackWith(code, await derive(normNum(num) + ':' + pin, ub64u(p[1])));
  }
  // расшифровать готовым ключом (сохранённым на этом устройстве)
  async function unpackWith(code, key) {
    const p = String(code).split('.');
    if (p.length !== 4 || !p[0].startsWith(VER)) throw new Error('format');
    let data;
    try { data = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64u(p[2]) }, key, ub64u(p[3]))); }
    catch (_) { throw new Error('pin'); }
    if (p[0].slice(3) === '1') data = await zip(data, new DecompressionStream('deflate-raw'));
    const obj = JSON.parse(dec.decode(data));
    if (!obj || !Array.isArray(obj.t)) throw new Error('format');
    return obj;
  }
  const savedKey = () => idbDo('readonly', st => st.get('enc')).catch(() => null);
  // вход по ключу: устройство подключается к кабинету — сохраняем ключ шифрования (соль та же, что в блоке)
  async function adopt(num, pin, code) {
    const salt = ub64u(String(code).split('.')[1]);
    const key = await derive(normNum(num) + ':' + pin, salt);
    await idbDo('readwrite', st => st.put({ key, salt }, 'enc'));
  }

  // ---------- Кабинет: поездки со всех устройств ----------
  // Ключ хранит объединённый список: каждое устройство ДОБАВЛЯЕТ свои поездки, а не перезаписывает чужие.
  // x — удалённые поездки (чтобы другое устройство не вернуло их обратно).
  const uniq = a => [...new Set((a || []).filter(Boolean))];
  const FIELDS = ['i', 'n', 'd', 'c', 'm', 'g', 'iv', 'k', 'a', 'ds', 'de'];
  function merge(base, local, gone) {
    const map = new Map();
    const put = t => { const cur = map.get(t.i) || {}; FIELDS.forEach(f => { if (t[f]) cur[f] = t[f]; }); map.set(t.i, cur); };
    (base || []).forEach(put);
    (local || []).forEach(put);
    (gone || []).forEach(id => map.delete(id));
    return [...map.values()].map(t => { const o = {}; FIELDS.forEach(f => { if (t[f]) o[f] = t[f]; }); return o; }).sort((x, y) => (x.i < y.i ? -1 : 1));
  }
  // поездки этого устройства, которые пользователь разрешил добавить в кабинет
  const ownLocal = m => myTrips().filter(t => !((m && m.skip) || []).includes(t.i));
  const fpOf = (t, x) => JSON.stringify([merge(t, [], []), uniq(x).sort()]);

  // ---------- Сервер (Supabase): только зашифрованный блок ----------
  /* global getSupabase */
  async function sb() { try { return typeof getSupabase === 'function' ? await getSupabase() : null; } catch (_) { return null; } }
  async function serverSave(num, blob) {
    const c = await sb(); if (!c) return 'off';
    const k = await ids(num);
    const { data, error } = await c.rpc('save_personal_key', { p_id: k.id, p_write: k.write, p_blob: blob });
    if (error) return /does not exist|PGRST202|not find/i.test(error.message || error.code || '') ? 'missing' : 'error';
    return data && data.ok ? 'ok' : 'error';
  }
  async function serverGet(num) {
    const c = await sb(); if (!c) throw new Error('offline');
    const { data, error } = await c.rpc('get_personal_key', { p_id: (await ids(num)).id });
    if (error) throw new Error(/does not exist|PGRST202|not find/i.test(error.message || error.code || '') ? 'missing' : 'server');
    if (!data || !data.blob) throw new Error('notfound');
    return data.blob;
  }

  // ---------- Ссылка и распознавание ----------
  // Ключ ведёт на ту же версию приложения, где он создан (сайт, develop, превью PR, localhost),
  // иначе ссылка откроет версию без этой функции. Только в Android-приложении — на основной сайт.
  const isLocal = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  function baseUrl() {
    const native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    const team = typeof TEAM_APP_URL === 'string' && TEAM_APP_URL.startsWith('https://') ? TEAM_APP_URL : ''; /* global TEAM_APP_URL */
    return (native && team ? team : location.origin + location.pathname.replace(/\/[^/]*$/, '/')).replace(/\/?$/, '/');
  }
  // ссылка: …/#key=<номер>~<зашифрованный блок>
  const keyUrl = (num, blob) => baseUrl() + '#key=' + normNum(num) + '~' + blob;
  function extract(value) {
    const s = String(value || '').trim();
    let m = /#key=([A-Z0-9]{12})~([A-Za-z0-9._-]+)/i.exec(s);
    if (m) return { num: normNum(m[1]), blob: m[2] };
    if (isNum(s)) return { num: normNum(s), blob: '' };
    return null;
  }

  // ---------- Стили ----------
  function styles() {
    if (document.getElementById('pk-css')) return;
    const el = document.createElement('style'); el.id = 'pk-css';
    el.textContent = `
      .pk-ov{position:fixed;inset:0;z-index:2100;background:rgba(10,10,30,.55);display:flex;align-items:flex-end;justify-content:center}
      .pk-sh{width:100%;max-width:520px;max-height:92vh;overflow:auto;background:var(--bg,#f4f3fb);color:var(--text,#15163a);border-radius:26px 26px 0 0;padding:18px 18px calc(20px + env(safe-area-inset-bottom,0px));box-sizing:border-box}
      .pk-hd{display:flex;align-items:center;gap:10px;margin-bottom:12px}
      .pk-hd b{flex:1;font-size:1.2rem;font-weight:800}
      .pk-x{width:40px;height:40px;border-radius:50%;border:1px solid var(--hub-card-b,rgba(0,0,0,.08));background:var(--hub-card,#fff);color:var(--text,#15163a);display:flex;align-items:center;justify-content:center;cursor:pointer}
      .pk-x svg{width:18px;height:18px}
      .pk-p{font-size:.92rem;line-height:1.45;color:var(--t2,#5a5b78);margin:0 0 12px}
      .pk-card{padding:14px 16px;border-radius:20px;background:var(--hub-card,#fff);border:1px solid var(--hub-card-b,rgba(0,0,0,.07));margin-bottom:12px}
      .pk-row{display:flex;align-items:center;gap:10px;padding:7px 0;font-size:.95rem}
      .pk-row svg{width:18px;height:18px;color:#5b4bd6;flex-shrink:0}
      .pk-row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pk-row small{color:var(--t2,#5a5b78);font-size:.8rem}
      .pk-row input{width:20px;height:20px;accent-color:#5b4bd6}
      .pk-lbl{display:block;font-size:.8rem;font-weight:700;color:var(--t2,#5a5b78);margin:10px 0 6px}
      .pk-in{width:100%;box-sizing:border-box;padding:13px 14px;border-radius:14px;border:1px solid var(--hub-card-b,rgba(0,0,0,.12));background:var(--hub-card,#fff);color:var(--text,#15163a);font:inherit;font-size:1.05rem}
      .pk-in.pin{letter-spacing:.5em;text-align:center;font-family:var(--mono,monospace);font-size:1.3rem}
      textarea.pk-in{min-height:84px;resize:vertical;font-family:var(--mono,monospace);font-size:.78rem;word-break:break-all}
      .pk-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;margin-top:10px;padding:15px;border-radius:999px;border:0;font:inherit;font-weight:800;font-size:1rem;cursor:pointer;background:linear-gradient(135deg,#2b2350,#4b3c9a);color:#fff}
      .pk-btn.gold{background:linear-gradient(135deg,#f3c25b,#d9962b);color:#2a1d00}
      .pk-btn.lite{background:rgba(106,77,244,.1);color:#5b4bd6}
      .pk-btn svg{width:20px;height:20px}
      .pk-btn[disabled]{opacity:.6;cursor:default}
      .pk-warn{display:flex;gap:10px;padding:12px 14px;border-radius:16px;background:rgba(229,38,44,.09);color:var(--text,#15163a);font-size:.88rem;line-height:1.4;margin-bottom:12px}
      .pk-warn svg{width:20px;height:20px;color:#d93a3a;flex-shrink:0}
      .pk-err{color:#d93a3a;font-weight:700;font-size:.9rem;margin-top:8px}
      .pk-key{position:relative;border-radius:24px;padding:18px;background:radial-gradient(120% 100% at 0% 0%,#3a2f7a 0%,#1d1840 60%,#141130 100%);color:#fff;text-align:center;box-shadow:0 14px 30px rgba(20,17,48,.35);margin-bottom:12px;overflow:hidden}
      .pk-key::before{content:"";position:absolute;inset:6px;border-radius:19px;border:1.5px dashed rgba(243,194,91,.55);pointer-events:none}
      .pk-badge{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:linear-gradient(135deg,#f3c25b,#d9962b);color:#2a1d00;font-size:.78rem;font-weight:900;letter-spacing:.08em}
      .pk-badge svg{width:15px;height:15px}
      .pk-key h3{margin:10px 0 2px;font-size:1.25rem;font-weight:800}
      .pk-key small{display:block;opacity:.8;font-size:.86rem}
      .pk-qr{position:relative;width:236px;height:236px;margin:14px auto 6px;padding:10px;border-radius:18px;background:#fff;box-sizing:border-box;cursor:pointer}
      .pk-qr>div{width:216px;height:216px}
      .pk-qr img,.pk-qr canvas{width:216px!important;height:216px!important}
      .pk-qr .veil{position:absolute;inset:0;border-radius:18px;background:rgba(29,24,64,.82);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;font-weight:700;font-size:.92rem}
      .pk-qr .veil svg{width:34px;height:34px;color:#f3c25b}
      .pk-num{margin:4px 0 6px;font-family:var(--mono,ui-monospace,monospace);font-size:1.45rem;font-weight:800;letter-spacing:.12em;color:#f3c25b;cursor:pointer}
      .pk-srv{display:flex;align-items:center;gap:8px;margin:0 2px 12px;font-size:.86rem;font-weight:700}
      .pk-srv svg{width:17px;height:17px;flex-shrink:0}
      .pk-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .pk-2 .pk-btn{margin-top:0}
    `;
    document.head.appendChild(el);
  }
  function sheet(title, render) {
    styles();
    const ov = document.createElement('div'); ov.className = 'pk-ov';
    ov.innerHTML = `<div class="pk-sh"><div class="pk-hd"><b>${esc(title)}</b><button class="pk-x" type="button" aria-label="Закрыть"><i data-lucide="x"></i></button></div><div class="pk-bd"></div></div>`;
    document.body.appendChild(ov);
    const api = { el: ov, body: ov.querySelector('.pk-bd'), close() { ov.remove(); if (api.onClose) api.onClose(); }, draw() { render(api.body, api); icons(ov); } };
    ov.querySelector('.pk-x').addEventListener('click', () => api.close());
    ov.addEventListener('click', e => { if (e.target === ov) api.close(); });
    api.draw();
    return api;
  }
  function qrInto(el, text) {
    el.innerHTML = '';
    if (typeof QRCode === 'undefined') { el.innerHTML = '<div style="color:#999;font-size:.8rem;padding:20px">QR недоступен — используйте код</div>'; return; } /* global QRCode */
    for (const lvl of ['M', 'L']) {
      try { el.innerHTML = ''; new QRCode(el, { text, width: 216, height: 216, colorDark: '#141130', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel[lvl] }); return; } catch (_) {}
    }
    el.innerHTML = '<div style="color:#999;font-size:.8rem;padding:20px">Слишком много поездок для одного QR — используйте код</div>';
  }

  // ---------- Мой ключ входа ----------
  const SRV = { ok: ['circle-check', '#1b9a50', 'Вход по номеру включён'], missing: ['clock', '#c27a00', 'Вход по номеру заработает после обновления базы — пока входите по QR'],
    off: ['wifi-off', '#c27a00', 'Нет связи с сервером — номер сохранится позже, QR работает'], error: ['circle-alert', '#d93a3a', 'Сервер не принял ключ — входите по QR'],
    replaced: ['circle-alert', '#d93a3a', 'Ключ заменён на другом устройстве — войдите по новому ключу'] };
  function openMyKey() {
    const trips = myTrips();
    const meta = lsGet(META, null);
    const st = { step: meta && meta.num && meta.blob ? 'show' : 'pin', pin: '', pin2: '', err: '', num: meta && meta.num || '', blob: meta && meta.blob || '', srv: meta && meta.srv || '', shown: false, busy: false };
    sheet('Мой ключ входа', (b, api) => {
      if (!trips.length && st.step === 'pin') {
        b.innerHTML = `<p class="pk-p">На этом устройстве пока нет поездок, в которые вы вошли под своим именем. Создайте поездку или войдите в неё — и ключ появится.</p>
          <p class="pk-p">Уже есть ключ с другого устройства? Войдите в свой кабинет:</p>
          <button class="pk-btn" type="button" data-a="login"><i data-lucide="log-in"></i>Войти по личному ключу</button>`;
        b.querySelector('[data-a="login"]').addEventListener('click', () => { api.close(); openRestore(); });
        return;
      }
      if (st.step === 'pin') {
        b.innerHTML = `
          <p class="pk-p">Ключ входа — это как пароль от всех ваших поездок. С ним можно открыть свои данные на компьютере или новом телефоне: по <b>QR-коду</b> или по <b>личному номеру</b> + PIN.</p>
          <div class="pk-card">${trips.map(t => `<div class="pk-row"><i data-lucide="plane"></i><span>${esc(t.n)}</span><small>${esc(t.m)}${t.a ? ' · админ' : ''}</small></div>`).join('')}</div>
          <span class="pk-lbl">Придумайте PIN (4–8 цифр) — его спросят при входе</span>
          <input class="pk-in pin" id="pk-pin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8" value="${esc(st.pin)}">
          <span class="pk-lbl">Повторите PIN</span>
          <input class="pk-in pin" id="pk-pin2" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8" value="${esc(st.pin2)}">
          ${st.err ? `<div class="pk-err">${esc(st.err)}</div>` : ''}
          <button class="pk-btn gold" type="button" data-a="make" ${st.busy ? 'disabled' : ''}><i data-lucide="key-round"></i>${st.busy ? 'Создаю…' : (st.num ? 'Создать новый ключ' : 'Создать ключ')}</button>
          <p class="pk-p" style="margin-top:12px">PIN нигде не сохраняется — запомните его. ${st.num ? 'Новый ключ заменит старый: старый номер перестанет работать.' : ''}</p>`;
        const p1 = b.querySelector('#pk-pin'), p2 = b.querySelector('#pk-pin2');
        p1.addEventListener('input', () => { st.pin = p1.value.replace(/\D/g, ''); p1.value = st.pin; });
        p2.addEventListener('input', () => { st.pin2 = p2.value.replace(/\D/g, ''); p2.value = st.pin2; });
        b.querySelector('[data-a="make"]').addEventListener('click', async () => {
          if (st.pin.length < 4) { st.err = 'PIN — минимум 4 цифры'; api.draw(); return; }
          if (st.pin !== st.pin2) { st.err = 'PIN-коды не совпадают'; api.draw(); return; }
          if (!(window.crypto && crypto.subtle)) { st.err = 'Шифрование недоступно в этом браузере'; api.draw(); return; }
          st.busy = true; st.err = ''; api.draw();
          try {
            const old = st.num;
            st.num = newNumber();
            // новый ключ забирает все поездки кабинета, а не только поездки этого устройства
            const m0 = lsGet(META, null) || {}, s0 = old ? await savedKey() : null;
            let all = merge([], ownLocal(m0), []), gone = [];
            if (s0 && m0.blob) { try { const b0 = await unpackWith(m0.blob, s0.key); gone = uniq([...(b0.x || []), ...(m0.gone || [])]); all = merge(b0.t, ownLocal(m0), gone); } catch (_) {} }
            st.blob = await pack({ v: 2, me: trips[0].m, at: Date.now(), t: all, x: gone }, st.num, st.pin);
            st.ids = all.map(x => x.i); st.gone = gone; st.skip = m0.skip || [];
            st.srv = await serverSave(st.num, st.blob).catch(() => 'error');
            if (old && st.srv === 'ok') { try { const c = await sb(); const k = await ids(old); await c.rpc('delete_personal_key', { p_id: k.id, p_write: k.write }); } catch (_) {} }
            lsSet(META, { t: Date.now(), ids: st.ids, num: st.num, blob: st.blob, srv: st.srv, me: trips[0].m, skip: st.skip, gone: st.gone, nopin: false });
            st.step = 'show';
          } catch (_) { st.err = 'Не удалось создать ключ'; }
          st.busy = false; st.pin = st.pin2 = ''; api.draw();
        });
        setTimeout(() => p1.focus(), 60);
        return;
      }
      // показ ключа
      const url = keyUrl(st.num, st.blob);
      const sv = SRV[st.srv] || SRV.missing;
      const m = lsGet(META, {}) || {};
      b.innerHTML = `
        <div class="pk-warn"><i data-lucide="shield-alert"></i><span><b>Никому не показывайте и не отправляйте в чаты.</b> С этим ключом${m.nopin ? '' : ' и PIN'} можно войти в ваши поездки от вашего имени. Друзей приглашайте QR-кодом «Пригласить» в поездке.</span></div>
        <div class="pk-key">
          <span class="pk-badge"><i data-lucide="lock"></i>МОЙ КЛЮЧ ВХОДА</span>
          <h3>${esc(m.me || (trips[0] ? trips[0].m : ''))}</h3>
          <small>${esc(plural((m.ids || trips).length, 'поездка', 'поездки', 'поездок'))} · обновлён ${esc(fmtDate(m.t || Date.now()))}</small>
          <div class="pk-qr" data-a="reveal"><div id="pk-qr"></div>${st.shown ? '' : '<div class="veil"><i data-lucide="eye-off"></i>Нажмите, чтобы показать</div>'}</div>
          <div class="pk-num" data-a="reveal">${st.shown ? esc(prettyNum(st.num)) : '••••-••••-••••'}</div>
          <small>Личный номер · вход: «Войти по личному ключу» → номер${m.nopin ? '' : ' → PIN'}</small>
        </div>
        <div class="pk-srv" style="color:${sv[1]}"><i data-lucide="${sv[0]}"></i>${esc(sv[2])}</div>
        ${isLocal() ? '<div class="pk-srv" style="color:#c27a00"><i data-lucide="monitor"></i>Это локальная версия (localhost): QR откроется только на этом компьютере. С телефона проверим на сайте после загрузки (превью PR).</div>' : ''}
        <div class="pk-2">
          <button class="pk-btn gold" type="button" data-a="png"><i data-lucide="download"></i>Сохранить</button>
          <button class="pk-btn lite" type="button" data-a="copy"><i data-lucide="copy"></i>Номер</button>
        </div>
        <button class="pk-btn lite" type="button" data-a="new"><i data-lucide="${m.nopin ? 'shield-check' : 'refresh-cw'}"></i>${m.nopin ? 'Новый ключ с PIN-кодом (надёжнее)' : 'Создать новый ключ (сменить PIN)'}</button>
        <button class="pk-btn lite" type="button" data-a="login"><i data-lucide="log-in"></i>Войти другим ключом</button>
        <p class="pk-p" style="margin-top:12px">Сохраните картинку заранее — в фото или распечатайте. Новые поездки добавляются в ключ сами, номер${m.nopin ? '' : ' и PIN'} остаются прежними.</p>`;
      qrInto(b.querySelector('#pk-qr'), url);
      b.querySelectorAll('[data-a="reveal"]').forEach(x => x.addEventListener('click', () => { st.shown = !st.shown; api.draw(); }));
      b.querySelector('[data-a="copy"]').addEventListener('click', async () => { try { await navigator.clipboard.writeText(prettyNum(st.num)); say('Номер скопирован — храните как пароль'); } catch (_) { say('Не удалось скопировать'); } });
      b.querySelector('[data-a="png"]').addEventListener('click', () => savePng(b.querySelector('#pk-qr'), m.me || (trips[0] ? trips[0].m : ''), (m.ids || trips).length, st.num));
      b.querySelector('[data-a="new"]').addEventListener('click', () => { st.step = 'pin'; api.draw(); });
      b.querySelector('[data-a="login"]').addEventListener('click', () => { api.close(); openRestore(); });
      // при открытии — свести поездки всех устройств и обновить картинку
      if (!st.synced) {
        st.synced = true;
        autoUpdate().then(() => { const mm = lsGet(META, {}) || {}; if (mm.blob) { st.blob = mm.blob; st.srv = mm.srv || st.srv; } if (api.el.isConnected) api.draw(); }).catch(() => {});
      }
    });
  }
  function savePng(qrEl, name, count, num) {
    const src = qrEl.querySelector('canvas') || qrEl.querySelector('img');
    if (!src) { say('QR не готов'); return; }
    const W = 720, H = 960, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, '#3a2f7a'); grd.addColorStop(1, '#141130');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(243,194,91,.7)'; g.setLineDash([14, 10]); g.lineWidth = 4; g.strokeRect(24, 24, W - 48, H - 48); g.setLineDash([]);
    g.fillStyle = '#f3c25b'; g.font = '900 34px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('🔒 МОЙ КЛЮЧ ВХОДА', W / 2, 110);
    g.fillStyle = '#fff'; g.font = '800 44px system-ui, sans-serif'; g.fillText(name, W / 2, 175);
    g.font = '500 26px system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,.8)';
    g.fillText('Splitaway Team · ' + plural(count, 'поездка', 'поездки', 'поездок') + ' · ' + fmtDate(Date.now()), W / 2, 220);
    g.fillStyle = '#fff'; g.fillRect(150, 250, 420, 420);
    g.imageSmoothingEnabled = false; g.drawImage(src, 170, 270, 380, 380);
    g.fillStyle = '#f3c25b'; g.font = '800 40px ui-monospace, Menlo, Consolas, monospace'; g.fillText(prettyNum(num), W / 2, 760);
    g.fillStyle = '#fff'; g.font = '700 28px system-ui, sans-serif';
    g.fillText('Никому не показывайте — это как пароль', W / 2, 815);
    g.font = '500 24px system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,.8)';
    g.fillText('Вход: QR камерой или номер → ваш PIN', W / 2, 860);
    g.fillText('Для друзей — QR «Пригласить» внутри поездки', W / 2, 900);
    const a = document.createElement('a'); a.download = 'splitaway-moy-klyuch.png'; a.href = c.toDataURL('image/png');
    document.body.appendChild(a); a.click(); a.remove();
    say('Картинка сохранена');
  }

  // ---------- Вход по ключу ----------
  function openRestore(prefill, fromUrl) {
    const ex = extract(prefill);
    const st = { num: ex ? ex.num : '', blob: ex ? ex.blob : '', pin: '', err: '', data: null, pick: {}, add: {}, extra: [], used: '', busy: false };
    const api = sheet('Вход по личному ключу', (b, api) => {
      if (!st.data) {
        b.innerHTML = `
          <p class="pk-p">Откройте свои поездки на этом устройстве. Нужен ваш <b>личный номер</b> (или тёмный QR с замком). PIN — только если вы его задавали.</p>
          ${st.blob ? `<div class="pk-card"><div class="pk-row"><i data-lucide="key-round"></i><span>QR-ключ получен</span><small>${esc(prettyNum(st.num).slice(0, 4))}-…</small></div></div>`
            : `<span class="pk-lbl">Личный номер</span><input class="pk-in" id="pk-num" placeholder="XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" style="font-family:var(--mono,monospace);letter-spacing:.12em;text-transform:uppercase" value="${esc(st.num ? prettyNum(st.num) : '')}">
               <button class="pk-btn lite" type="button" data-a="scan"><i data-lucide="scan-line"></i>Или отсканировать QR-ключ</button>`}
          <span class="pk-lbl">PIN — если задавали (иначе оставьте пустым)</span>
          <input class="pk-in pin" id="pk-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" value="${esc(st.pin)}">
          ${st.err ? `<div class="pk-err">${esc(st.err)}</div>` : ''}
          <button class="pk-btn" type="button" data-a="open" ${st.busy ? 'disabled' : ''}><i data-lucide="log-in"></i>${st.busy ? 'Проверяю…' : 'Войти'}</button>`;
        const pin = b.querySelector('#pk-pin'), numIn = b.querySelector('#pk-num');
        pin.addEventListener('input', () => { st.pin = pin.value.replace(/\D/g, ''); pin.value = st.pin; });
        pin.addEventListener('keydown', e => { if (e.key === 'Enter') b.querySelector('[data-a="open"]').click(); });
        if (numIn) numIn.addEventListener('input', () => { const raw = numIn.value; const e2 = extract(raw); if (e2 && e2.blob) { st.num = e2.num; st.blob = e2.blob; api.draw(); return; } const n = normNum(raw).slice(0, 12); st.num = n; const pr = prettyNum(n); if (numIn.value !== pr) numIn.value = pr; });
        const sc = b.querySelector('[data-a="scan"]');
        if (sc) sc.addEventListener('click', () => { api.onClose = null; api.close(); if (typeof openQrScanner === 'function') openQrScanner(); else say('Камера недоступна — введите номер'); }); /* global openQrScanner */
        b.querySelector('[data-a="open"]').addEventListener('click', async () => {
          if (numIn && /[?&]trip=/.test(numIn.value)) { st.err = 'Это приглашение в поездку, а не личный ключ. Его вводят на главном экране в поле «Код поездки».'; api.draw(); return; }
          if (!isNum(st.num)) { st.err = 'Номер — 12 символов, например K7QM-2XPA-9RTD'; api.draw(); return; }
          if (st.pin && st.pin.length < 4) { st.err = 'PIN — минимум 4 цифры'; api.draw(); return; }
          st.busy = true; st.err = ''; api.draw();
          try {
            const blob = st.blob || await serverGet(st.num);
            st.data = await unpack(blob, st.num, st.pin); st.data.t.forEach(t => { st.pick[t.i] = true; });
            st.used = blob;
            // поездки этого устройства, которых нет в кабинете, — спросим, добавить ли их
            const inKey = new Set([...st.data.t.map(t => t.i), ...(st.data.x || [])]), cur = lsGet(META, null) || {};
            st.extra = myTrips().filter(t => !inKey.has(t.i));
            st.extra.forEach(t => { st.add[t.i] = !(cur.num === st.num && (cur.skip || []).includes(t.i)); });
          } catch (e) {
            const m = e && e.message;
            st.err = m === 'pin' ? (st.pin ? 'Неверный номер или PIN' : 'Для этого ключа нужен PIN — введите его') : m === 'notfound' ? 'Ключ с таким номером не найден — проверьте номер' : m === 'missing' ? 'Вход по номеру ещё не включён на сервере — отсканируйте QR-ключ'
              : m === 'offline' || m === 'server' ? 'Нет связи с сервером — проверьте интернет или отсканируйте QR-ключ' : 'Ключ повреждён — попробуйте ещё раз';
          }
          st.busy = false; api.draw();
        });
        setTimeout(() => (numIn && !st.num ? numIn : pin).focus(), 60);
        return;
      }
      const n = st.data.t.filter(t => st.pick[t.i]).length;
      const here = new Set(myTrips().map(t => t.i)), cur = lsGet(META, null) || {};
      const row = (t, attr, on, note) => `<label class="pk-row"><input type="checkbox" ${attr}="${esc(t.i)}" ${on ? 'checked' : ''}><span>${esc(t.n)}</span><small>${note}${esc(t.m)}${t.a ? ' · админ' : ''}</small></label>`;
      b.innerHTML = `
        <p class="pk-p">Кабинет <b>${esc(st.data.me || '')}</b>. Отметьте поездки, которые открыть на этом устройстве:</p>
        ${st.data.t.length ? `<div class="pk-card">${st.data.t.map(t => row(t, 'data-i', st.pick[t.i], here.has(t.i) ? 'уже здесь · ' : '')).join('')}</div>` : '<p class="pk-p">В кабинете пока нет поездок.</p>'}
        ${st.extra.length ? `<span class="pk-lbl">На этом устройстве есть поездки, которых нет в кабинете. Добавить их в кабинет?</span>
          <div class="pk-card">${st.extra.map(t => row(t, 'data-x', st.add[t.i], '')).join('')}</div>
          <p class="pk-p">Без галочки поездка останется только на этом устройстве.</p>` : ''}
        ${cur.num && cur.num !== st.num ? '<p class="pk-p">У этого устройства был другой ключ. Теперь оно перейдёт на этот кабинет, а прежний ключ здесь больше не будет обновляться.</p>' : ''}
        ${st.err ? `<div class="pk-err">${esc(st.err)}</div>` : ''}
        <button class="pk-btn gold" type="button" data-a="go" ${st.busy ? 'disabled' : ''}><i data-lucide="log-in"></i>${st.busy ? 'Вхожу…' : n ? 'Войти и открыть ' + esc(plural(n, 'поездку', 'поездки', 'поездок')) : 'Войти в кабинет'}</button>
        <p class="pk-p" style="margin-top:12px">Данные поездок загрузятся с сервера. Новые поездки с любого вашего устройства будут попадать в этот кабинет.</p>`;
      b.querySelectorAll('[data-i]').forEach(cb => cb.addEventListener('change', () => { st.pick[cb.dataset.i] = cb.checked; api.draw(); }));
      b.querySelectorAll('[data-x]').forEach(cb => cb.addEventListener('change', () => { st.add[cb.dataset.x] = cb.checked; }));
      b.querySelector('[data-a="go"]').addEventListener('click', async () => {
        st.busy = true; st.err = ''; api.draw();
        try {
          await adopt(st.num, st.pin, st.used);
          // автоматически созданный кабинет этого устройства больше не нужен: его поездки переходят в этот кабинет
          if (cur.num && cur.num !== st.num && cur.auto) { const old = cur.num; sb().then(async c => { if (!c) return; const k = await ids(old); await c.rpc('delete_personal_key', { p_id: k.id, p_write: k.write }); }).catch(() => {}); }
          lsSet(META, { t: st.data.at || Date.now(), num: st.num, blob: st.used, ids: st.data.t.map(t => t.i), srv: '', me: st.data.me || '',
            skip: st.extra.filter(t => !st.add[t.i]).map(t => t.i), gone: [], nopin: !st.pin });
        } catch (_) { st.busy = false; st.err = 'Не удалось сохранить ключ на этом устройстве'; api.draw(); return; }
        api.onClose = null; restore(st.data.t.filter(t => st.pick[t.i]));
      });
    });
    if (fromUrl) api.onClose = () => { clearHash(); location.reload(); };
    return api;
  }
  function clearHash() { try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {} }
  function restore(list) { // eslint-disable-line no-unused-vars
    list.forEach(t => {
      const cur = lsGet('sw_' + t.i, null);
      const blob = cur && cur.trip ? Object.assign(cur, { me: t.m, meGender: t.g || cur.meGender || 'm' })
        : { trip: { id: t.i, name: t.n, dest: t.d, currency: t.c || 'EUR' }, adminName: t.a ? t.m : '', coAdmins: [], me: t.m, meGender: t.g || 'm', members: [{ name: t.m, gender: t.g || 'm' }],
          groups: [], expenses: [], treasury: { total: 0, spent: 0, contributions: [], holder: null }, receipts: [], memberColors: {}, settledDebts: [] };
      lsSet('sw_' + t.i, blob);
      if (t.iv) lsSet('sw_invite_' + t.i, t.iv);
      if (t.a) lsSet('sw_admin_' + t.i, t.a);
      if (t.k) lsSet('sw_mkey_' + t.i + '_' + t.m, t.k);
      if (t.ds && !localStorage.getItem(DATES(t.i))) lsSet(DATES(t.i), { start: t.ds, end: t.de || t.ds });
    });
    if (list[0]) lsSet('sw_last', list[0].i);
    try { localStorage.setItem('sw_onboarding_prefs_done', '1'); } catch (_) {}
    say(list.length ? 'Поездки восстановлены' : 'Вы вошли в кабинет');
    clearHash();
    setTimeout(() => location.reload(), 400);
  }

  // ---------- Подключение к приложению ----------
  // при запуске: ссылка вида …/#key=… → экран «Вход по ключу» (index.html вызывает до обычной загрузки)
  function bootHash() {
    if (!extract(location.hash)) return false;
    const go = () => openRestore(location.hash, true);
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
    return true;
  }
  // статус ключа для профиля
  function status() {
    const m = lsGet(META, null), list = ownLocal(m).map(t => t.i);
    if (!m || !m.num) return { has: false, n: list.length };
    return { has: true, t: m.t, n: (m.ids || []).length, fresh: list.every(id => (m.ids || []).includes(id)), srv: m.srv || '' };
  }
  // поездка удалена → убрать её из кабинета (и на других устройствах она не вернётся)
  function forget(id) {
    const m = lsGet(META, null);
    if (!m || !m.num || !id) return;
    m.gone = uniq([...(m.gone || []), id]); lsSet(META, m);
  }
  // Синхронизация кабинета: сервер + поездки этого устройства → общий список (тем же ключом шифрования, без PIN)
  let upd = null;
  function autoUpdate() { if (!upd) upd = doUpdate().catch(() => {}).finally(() => { upd = null; }); return upd; }
  async function doUpdate() {
    const m = lsGet(META, null);
    if (!m || !m.num || !(window.crypto && crypto.subtle)) return;
    const saved = await savedKey();
    if (!saved) { // ключ без сохранённого ключа шифрования — только досылаем готовый блок
      if (m.srv !== 'ok' && m.blob) { const srv = await serverSave(m.num, m.blob).catch(() => 'error'); lsSet(META, Object.assign(m, { srv })); }
      return;
    }
    let base = null, srvBlob = '';
    try { srvBlob = await serverGet(m.num); base = await unpackWith(srvBlob, saved.key); }
    catch (e) {
      srvBlob = '';
      // номер был на сервере, а теперь его нет — ключ заменили на другом устройстве: старый не воскрешаем
      if (e && e.message === 'notfound' && m.srv === 'ok') { lsSet(META, Object.assign(m, { srv: 'replaced' })); return; }
    }
    if (m.srv === 'replaced') return;
    if (!base) { try { base = await unpackWith(m.blob, saved.key); } catch (_) { base = { t: [], x: [] }; } }
    const gone = uniq([...(base.x || []), ...(m.gone || [])]);
    const t = merge(base.t, ownLocal(m), gone);
    const me = m.me || base.me || (t[0] && t[0].m) || '';
    if (fpOf(t, gone) === fpOf(base.t, base.x)) { // ничего нового
      if (srvBlob) lsSet(META, Object.assign(m, { blob: srvBlob, ids: t.map(x => x.i), srv: 'ok', me, t: base.at || m.t }));
      else if (m.srv !== 'ok') { const srv = await serverSave(m.num, m.blob).catch(() => 'error'); lsSet(META, Object.assign(m, { ids: t.map(x => x.i), srv, me })); }
      return;
    }
    const blob = await pack({ v: 2, me, at: Date.now(), t, x: gone }, m.num, '', saved);
    const srv = await serverSave(m.num, blob).catch(() => 'error');
    lsSet(META, Object.assign(m, { t: Date.now(), ids: t.map(x => x.i), blob, srv, me }));
  }
  // ---------- Аккаунт создаётся сам — при первой поездке на устройстве ----------
  let making = false;
  async function ensureAccount() {
    const m = lsGet(META, null);
    if (making || (m && m.num) || !(window.crypto && crypto.subtle)) return;
    if (extract(location.hash) || document.querySelector('.pk-ov')) return; // идёт вход по ключу
    const own = ownLocal(m);
    if (!own.length) return;
    making = true;
    try {
      const num = newNumber(), t = merge([], own, []), me = own[0].m;
      const blob = await pack({ v: 2, me, at: Date.now(), t, x: [] }, num, '');
      const srv = await serverSave(num, blob).catch(() => 'error');
      lsSet(META, { t: Date.now(), ids: t.map(x => x.i), num, blob, srv, me, skip: [], gone: [], auto: true, nopin: true });
      welcome(num, me, srv);
    } catch (_) {} finally { making = false; }
  }
  function welcome(num, me, srv) {
    sheet('Ваш личный кабинет создан', (b, api) => {
      b.innerHTML = `
        <p class="pk-p">Ваши поездки теперь сохраняются в личном кабинете. Чтобы открыть их на другом телефоне или компьютере, достаточно этого номера:</p>
        <div class="pk-key">
          <span class="pk-badge"><i data-lucide="lock"></i>МОЙ ЛИЧНЫЙ НОМЕР</span>
          <h3>${esc(me)}</h3>
          <div class="pk-num">${esc(prettyNum(num))}</div>
          <small>Вход на другом устройстве: «Войти по личному ключу» → номер</small>
        </div>
        ${srv === 'ok' ? '' : '<div class="pk-srv" style="color:#c27a00"><i data-lucide="clock"></i>Номер сохранится на сервере, как только появится связь</div>'}
        <div class="pk-warn"><i data-lucide="shield-alert"></i><span>Номер — как пароль: не отправляйте его в общие чаты. Друзей приглашайте QR-кодом «Пригласить» в поездке.</span></div>
        <div class="pk-2">
          <button class="pk-btn gold" type="button" data-a="copy"><i data-lucide="copy"></i>Скопировать</button>
          <button class="pk-btn lite" type="button" data-a="more"><i data-lucide="qr-code"></i>QR и картинка</button>
        </div>
        <button class="pk-btn lite" type="button" data-a="login"><i data-lucide="log-in"></i>У меня уже есть номер — войти</button>
        <button class="pk-btn" type="button" data-a="ok"><i data-lucide="check"></i>Готово</button>
        <p class="pk-p" style="margin-top:12px">Номер всегда можно посмотреть: «Ещё» → «Мой ключ входа». Там же можно выпустить ключ с PIN-кодом.</p>`;
      b.querySelector('[data-a="copy"]').addEventListener('click', async () => { try { await navigator.clipboard.writeText(prettyNum(num)); say('Номер скопирован — храните как пароль'); } catch (_) { say('Не удалось скопировать'); } });
      b.querySelector('[data-a="more"]').addEventListener('click', () => { api.close(); openMyKey(); });
      b.querySelector('[data-a="login"]').addEventListener('click', () => { api.close(); openRestore(); });
      b.querySelector('[data-a="ok"]').addEventListener('click', () => api.close());
    });
  }
  setTimeout(() => { ensureAccount().then(autoUpdate); }, 2500);
  setInterval(() => { const m = lsGet(META, null); if (!m || !m.num) ensureAccount(); }, 3000); // создал поездку или вошёл по приглашению
  window.addEventListener('online', () => setTimeout(autoUpdate, 3000));

  window.STKey = { openMyKey, openRestore, bootHash, isKey: v => !!extract(v), status, extract, autoUpdate, forget, ensureAccount };
})();
